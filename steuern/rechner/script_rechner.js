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
 * Approximates gross income from a given zvE using an iterative approach
 * @param {number} targetZvE - The target zvE to reach
 * @param {number} childCount - Number of children (affects PV rate)
 * @param {number} advCosts - Werbungskosten amount
 * @returns {number} Approximated gross income
 */
function approximateGrossFromZVE(targetZvE, childCount, advCosts) {
  // Edge case handling
  if (targetZvE <= 0) return 0;

  // Initial guess: starting with slightly higher than zvE to account for deductions
  let lowGuess = targetZvE; // Minimum possible gross is zvE itself
  let highGuess = targetZvE * 2.5; // Conservative upper bound (accounts for high deductions)

  // Start with a quick check of our upper bound
  let result = calculateTaxableIncome(highGuess, advCosts, childCount);
  if (result.zvE < targetZvE) {
    // If our upper bound isn't high enough, increase it
    highGuess = targetZvE * 4;
  }

  // Binary search to converge on the gross value that results in our target zvE
  const tolerance = 5; // Acceptable difference in euros
  let iterations = 0;
  const maxIterations = 25; // Prevent infinite loops

  while (iterations < maxIterations) {
    const midGuess = Math.floor((lowGuess + highGuess) / 2);
    result = calculateTaxableIncome(midGuess, advCosts, childCount);

    // Check if we're within acceptable tolerance
    if (Math.abs(result.zvE - targetZvE) <= tolerance) {
      return midGuess;
    }

    // Adjust our guesses based on result
    if (result.zvE < targetZvE) {
      lowGuess = midGuess;
    } else {
      highGuess = midGuess;
    }

    // Exit if our search range gets too small (numerical precision limit)
    if (highGuess - lowGuess <= 2) {
      return midGuess;
    }

    iterations++;
  }

  // Return our best approximation after max iterations
  return Math.floor((lowGuess + highGuess) / 2);
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
    if (zvE <= 0) return;

    // Skip updating if user is actively editing the gross input
    if (userIsEditingGross) return;

    // Use a static cache for common zvE values to avoid repeated calculations
    if (!window.zveToGrossCache) {
      window.zveToGrossCache = new Map();
    }

    // For frequently changing values like slider movement, don't update on every small change
    // Only update every ~500 increment during rapid changes to improve performance
    const cacheKey = `${Math.round(zvE / 500) * 500}-${
      childrenCountSelect.value
    }-${adCostsIndividuell.checked ? customAdCostsInput.value || 0 : "std"}`;

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

      // Check cache first before calculating
      let approximateGross;
      if (window.zveToGrossCache.has(cacheKey)) {
        approximateGross = window.zveToGrossCache.get(cacheKey);
      } else {
        // Only do the expensive calculation if we don't have a cached value
        approximateGross = approximateGrossFromZVE(
          zvE,
          childrenCount,
          advertisingCosts
        );

        // Cache the result
        window.zveToGrossCache.set(cacheKey, approximateGross);

        // Limit cache size to prevent memory leaks
        if (window.zveToGrossCache.size > 200) {
          // Keep only the most recent values by clearing old ones
          const keysIterator = window.zveToGrossCache.keys();
          for (let i = 0; i < 50; i++) {
            window.zveToGrossCache.delete(keysIterator.next().value);
          }
        }
      }

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
