// Beitragssätze und Beitragsbemessungsgrenzen (für 2025)
const RV_ALV_BEMESSUNGSGRENZE = 96600; // RV + ALV
const KV_PV_BEMESSUNGSGRENZE = 66150; // KV + PV

// Beitragssätze Arbeitnehmer
const RV_RATE = 0.093; // 9,3%
const ALV_RATE = 0.013; // 1,3%
const KV_RATE = 0.0855; // 7,3% + 1,25% Zusatzbeitrag = 8,55%
const PV_RATE_WITH_CHILD = 0.018; // 1,8%
const PV_RATE_NO_CHILD = 0.024; // 2,4%

const STANDARD_WERBUNGSKOSTEN = 1230; // €

// Flag to prevent circular updates
let isUpdatingFromZVE = false;
// Track if the user is actively editing the gross input
let userIsEditingGross = false;

// Helper functions for number formatting
function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function unformatNumber(str) {
  return parseFloat(str.replace(/\./g, "")) || 0;
}

/**
 * Berechnet das ungefähre zu versteuernde Einkommen nach Vorgabe
 * @param {number} annualGross - Jährliches Bruttogehalt
 * @param {number} advCosts - Werbungskosten (entweder Standard oder benutzerdefiniert)
 * @param {number} childCount - Anzahl Kinder
 * @returns {Object} Objekt mit zvE und Aufschlüsselung
 */
function calculateTaxableIncome(annualGross, advCosts, childCount) {
  // 1. Einkommen nach Werbungskosten
  let partialIncome = annualGross - advCosts;
  if (partialIncome < 0) partialIncome = 0;

  // 2. Sozialversicherungsbeiträge
  //  - RV + ALV-Bemessungsgrenze
  const rvAlvBase = Math.min(annualGross, RV_ALV_BEMESSUNGSGRENZE);
  const rvContribution = rvAlvBase * RV_RATE;
  const alvContribution = rvAlvBase * ALV_RATE;

  //  - KV + PV-Bemessungsgrenze
  const kvPvBase = Math.min(annualGross, KV_PV_BEMESSUNGSGRENZE);
  const kvContribution = kvPvBase * KV_RATE;

  const pvRate = childCount > 0 ? PV_RATE_WITH_CHILD : PV_RATE_NO_CHILD;
  const pvContribution = kvPvBase * pvRate;

  const totalSocialContributions =
    rvContribution + alvContribution + kvContribution + pvContribution;

  // 3. Approximiertes zvE
  let zvE = partialIncome - totalSocialContributions;
  if (zvE < 0) zvE = 0;

  return {
    zvE: Math.round(zvE),
    breakdown: {
      werbungskosten: advCosts,
      rentenversicherung: Math.round(rvContribution),
      arbeitslosenversicherung: Math.round(alvContribution),
      krankenversicherung: Math.round(kvContribution),
      pflegeversicherung: Math.round(pvContribution),
      total: Math.round(advCosts + totalSocialContributions),
    },
  };
}

/**
/**
 * Binary-search approach to find the Brutto that yields a target zvE.
 * 
 * @param {number} targetZVE   - The desired zu versteuerndes Einkommen
 * @param {number} childCount  - Number of children (affects PV rate)
 * @param {number} advCosts    - Werbungskosten (either standard or custom)
 * @returns {number} Gross salary that most closely produces the targetZVE
 */
function approximateGrossFromZVE(targetZVE, childCount, advCosts) {
  // Edge case
  if (targetZVE <= 0) {
    return 0; // short-circuit: a zvE of 0 means Brutto is 0
  }
  // We'll set an upper bound that should be high enough for most cases.
  // For example: 2.5 * zvE, but never less than 300k.
  let low = 0;
  let high = Math.max(targetZVE * 2.5, 300000);

  // Keep track of which guess was best so far
  let bestGuess = 0;
  let bestDiff = Infinity;

  // We'll do about 40 iterations, which is plenty to narrow down to 1 EUR
  const maxIterations = 40;
  for (let i = 0; i < maxIterations; i++) {
    const mid = Math.floor((low + high) / 2);

    // Forward-calculate what zvE we'd get if we had 'mid' as gross
    const result = calculateTaxableIncome(mid, advCosts, childCount);
    const diff = Math.abs(result.zvE - targetZVE);

    // If this is the closest we've come so far, store it
    if (diff < bestDiff) {
      bestDiff = diff;
      bestGuess = mid;
    }

    // If we overshot (zvE is too high), lower the guess
    // Otherwise, raise the guess
    if (result.zvE > targetZVE) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }

    // If we somehow got an exact match, we can just stop
    if (bestDiff === 0) break;
  }

  return bestGuess;
}

// 1. On page load, hook up event listeners
document.addEventListener("DOMContentLoaded", () => {
  const grossSalaryInput = document.getElementById("grossSalary");
  const childrenCountSelect = document.getElementById("childrenCount");
  const adCostsPauschale = document.getElementById("advertisingCostsPauschale");
  const adCostsIndividuell = document.getElementById(
    "advertisingCostsIndividuell"
  );
  const customAdCostsInput = document.getElementById("customAdvertisingCosts");
  const zveResultSpan = document.getElementById("zveResult");
  const pvRateDisplay = document.getElementById("pvRateDisplay");

  // Apply number formatting to the gross salary input
  function formatGrossSalary() {
    if (!userIsEditingGross) return;

    // Get the raw value and cursor position
    const input = grossSalaryInput;
    const cursorPos = input.selectionStart;
    const rawValue = unformatNumber(input.value);
    const formattedValue = formatNumber(rawValue);

    // Calculate cursor position shift due to added separators
    const lengthDiff = formattedValue.length - input.value.length;

    // Update the input value
    input.value = formattedValue;

    // Restore cursor position, adjusted for added separators
    if (cursorPos !== null) {
      input.setSelectionRange(cursorPos + lengthDiff, cursorPos + lengthDiff);
    }
  }

  // Function to perform calculation and update UI
  function updateCalculations() {
    // Skip if this update was triggered by a zvE change
    if (isUpdatingFromZVE) return;

    const grossSalary = unformatNumber(grossSalaryInput.value);
    const childrenCount = parseInt(childrenCountSelect.value, 10) || 0;

    // Update PV rate display
    updatePVRateDisplay(childrenCount);

    let advertisingCosts = STANDARD_WERBUNGSKOSTEN;
    if (adCostsIndividuell.checked) {
      // Use custom value if individual option is selected
      const customAdCosts = parseFloat(customAdCostsInput.value) || 0;
      advertisingCosts =
        customAdCosts > STANDARD_WERBUNGSKOSTEN
          ? customAdCosts
          : STANDARD_WERBUNGSKOSTEN;
    }

    // Calculate approximate zvE and get breakdown
    const result = calculateTaxableIncome(
      grossSalary,
      advertisingCosts,
      childrenCount
    );

    // Update UI with zvE
    zveResultSpan.textContent = result.zvE.toLocaleString("de-DE");

    // Update breakdown values
    document.getElementById("breakdownWerbungskosten").textContent =
      result.breakdown.werbungskosten.toLocaleString("de-DE") + " €";
    document.getElementById("breakdownRV").textContent =
      result.breakdown.rentenversicherung.toLocaleString("de-DE") + " €";
    document.getElementById("breakdownALV").textContent =
      result.breakdown.arbeitslosenversicherung.toLocaleString("de-DE") + " €";
    document.getElementById("breakdownKV").textContent =
      result.breakdown.krankenversicherung.toLocaleString("de-DE") + " €";
    document.getElementById("breakdownPV").textContent =
      result.breakdown.pflegeversicherung.toLocaleString("de-DE") + " €";
    document.getElementById("breakdownTotal").textContent =
      result.breakdown.total.toLocaleString("de-DE") + " €";

    // Update the main visualization with the new zvE value
    if (typeof window.updateUI === "function" && result.zvE > 0) {
      // Skip the calculator update when the change originated from the calculator itself
      window.updateUI(result.zvE, true);
    }
  }

  // Update calculator inputs based on zvE value from main visualization
  window.updateCalcFromZVE = function (zvE) {
    if (zvE <= 0) {
      // Handle zero/negative zvE case
      grossSalaryInput.value = "0";
      zveResultSpan.textContent = "0";
      document.getElementById("breakdownWerbungskosten").textContent = "0 €";
      document.getElementById("breakdownRV").textContent = "0 €";
      document.getElementById("breakdownALV").textContent = "0 €";
      document.getElementById("breakdownKV").textContent = "0 €";
      document.getElementById("breakdownPV").textContent = "0 €";
      document.getElementById("breakdownTotal").textContent = "0 €";
      return;
    }

    // Skip updating if user is actively editing the gross input
    if (userIsEditingGross) return;

    // Flag to prevent circular updates
    isUpdatingFromZVE = true;

    try {
      // Get current calculator state
      const childrenCount = parseInt(childrenCountSelect.value, 10) || 0;

      let advertisingCosts = STANDARD_WERBUNGSKOSTEN;
      if (adCostsIndividuell.checked) {
        const customAdCosts = parseFloat(customAdCostsInput.value) || 0;
        advertisingCosts =
          customAdCosts > STANDARD_WERBUNGSKOSTEN
            ? customAdCosts
            : STANDARD_WERBUNGSKOSTEN;
      }

      // Always calculate the approximateGross value directly (no caching)
      const approximateGross = approximateGrossFromZVE(
        zvE,
        childrenCount,
        advertisingCosts
      );

      // Update gross salary input with formatting
      grossSalaryInput.value = formatNumber(Math.round(approximateGross));

      // Recalculate breakdown values with the approximated gross
      const result = calculateTaxableIncome(
        approximateGross,
        advertisingCosts,
        childrenCount
      );

      // Update zvE display
      zveResultSpan.textContent = result.zvE.toLocaleString("de-DE");

      // Update breakdown display
      document.getElementById("breakdownWerbungskosten").textContent =
        result.breakdown.werbungskosten.toLocaleString("de-DE") + " €";
      document.getElementById("breakdownRV").textContent =
        result.breakdown.rentenversicherung.toLocaleString("de-DE") + " €";
      document.getElementById("breakdownALV").textContent =
        result.breakdown.arbeitslosenversicherung.toLocaleString("de-DE") +
        " €";
      document.getElementById("breakdownKV").textContent =
        result.breakdown.krankenversicherung.toLocaleString("de-DE") + " €";
      document.getElementById("breakdownPV").textContent =
        result.breakdown.pflegeversicherung.toLocaleString("de-DE") + " €";
      document.getElementById("breakdownTotal").textContent =
        result.breakdown.total.toLocaleString("de-DE") + " €";
    } finally {
      // Always reset flag
      isUpdatingFromZVE = false;
    }
  };

  // Toggle the customAdvertisingCosts input depending on the radio selection
  function updateCustomAdCostsInput() {
    if (adCostsIndividuell.checked) {
      customAdCostsInput.disabled = false;
    } else {
      customAdCostsInput.disabled = true;
      customAdCostsInput.value = "";
    }
    updateCalculations();
  }

  // Update Pflegeversicherung rate display based on children count
  function updatePVRateDisplay(childrenCount) {
    const rate = childrenCount > 0 ? PV_RATE_WITH_CHILD : PV_RATE_NO_CHILD;
    pvRateDisplay.textContent = (rate * 100).toFixed(1).replace(".", ",") + "%";
  }

  // Add event listeners for real-time updates
  grossSalaryInput.addEventListener("focus", () => {
    userIsEditingGross = true;
  });

  grossSalaryInput.addEventListener("blur", () => {
    // Format on blur
    formatGrossSalary();

    // Small delay to allow other events to complete
    setTimeout(() => {
      userIsEditingGross = false;
    }, 100);
  });

  grossSalaryInput.addEventListener("input", (e) => {
    // Format as user types
    formatGrossSalary();

    // Then calculate
    updateCalculations();
  });

  // Also format custom advertising costs field
  customAdCostsInput.addEventListener("blur", function () {
    if (this.value) {
      const value = parseFloat(this.value.replace(/\./g, "")) || 0;
      this.value = formatNumber(value);
    }
  });

  childrenCountSelect.addEventListener("change", updateCalculations);
  adCostsPauschale.addEventListener("change", updateCustomAdCostsInput);
  adCostsIndividuell.addEventListener("change", updateCustomAdCostsInput);
  customAdCostsInput.addEventListener("input", updateCalculations);

  // Initial calculation
  updateCalculations();

  // Check if the main slider already has a value on page load (browser caching)
  const mainSlider = document.getElementById("zveSlider");
  if (mainSlider && parseFloat(mainSlider.value) > 0) {
    // Synchronize calculator with existing slider value
    window.updateCalcFromZVE(parseFloat(mainSlider.value));
  }
});
