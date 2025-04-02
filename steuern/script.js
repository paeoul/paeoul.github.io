/****************************************************************************
 * 1. Tax calculation helpers (piecewise for 5 cases), plus average/marginal
 ****************************************************************************/
// Track last bracket for comparison
let lastBracket = null;

// Flag to prevent circular updates
let isUpdatingFromCalc = false;

function calculateTax(zvE) {
  zvE = Math.max(0, zvE);

  let tax = 0;

  if (zvE <= 12096) {
    tax = 0;
  } else if (zvE <= 17443) {
    const y = (zvE - 12096) / 10000.0;
    tax = (932.3 * y + 1400) * y;
  } else if (zvE <= 68480) {
    const z = (zvE - 17443) / 10000.0;
    tax = (176.64 * z + 2397) * z + 1015.13;
  } else if (zvE <= 277825) {
    tax = 0.42 * zvE - 10911.92;
  } else {
    tax = 0.45 * zvE - 19246.67;
  }

  return Math.floor(tax);
}

function calculateMarginalRate(zvE) {
  if (zvE <= 0) return 0.0;

  if (zvE <= 12096) {
    return 0.0;
  } else if (zvE <= 17443) {
    const y = (zvE - 12096) / 10000;
    return ((1864.6 * y + 1400) / 10000) * 100;
  } else if (zvE <= 68480) {
    const z = (zvE - 17443) / 10000;
    return ((353.28 * z + 2397) / 10000) * 100;
  } else if (zvE <= 277825) {
    return 42.0;
  } else {
    return 45.0;
  }
}

function calculateAverageRate(zvE) {
  if (zvE <= 0) return 0.0;
  const est = calculateTax(zvE);
  return (est / zvE) * 100;
}

function getBracketCase(zvE) {
  if (zvE <= 12096) return "Grundfreibetrag";
  if (zvE <= 17005) return "Progressionszone 1";
  if (zvE <= 68480) return "Progressionszone 2";
  if (zvE <= 277825) return "Spitzensteuersatz";
  return "Reichensteuersatz";
}

// Update bracket highlighting with optimized animation
function updateBracketHighlighting(zvE) {
  // Remove active class from all bracket items
  document.querySelectorAll(".bracket-item").forEach((item) => {
    item.classList.remove("active");
  });

  // Determine which bracket is active based on zvE
  let activeBracket;
  if (zvE <= 12096) {
    activeBracket = document.querySelector(
      '.bracket-item[data-amount="12096"]'
    );
  } else if (zvE <= 17443) {
    activeBracket = document.querySelector(
      '.bracket-item[data-amount="17443"]'
    );
  } else if (zvE <= 68480) {
    activeBracket = document.querySelector(
      '.bracket-item[data-amount="68480"]'
    );
  } else if (zvE <= 277825) {
    activeBracket = document.querySelector(
      '.bracket-item[data-amount="277825"]'
    );
  } else {
    activeBracket = document.querySelector(
      '.bracket-item[data-amount="277826"]'
    );
  }

  // Add active class to the current bracket
  if (activeBracket) {
    activeBracket.classList.add("active");
  }
}

/****************************************************************************
 * 2. Chart Data Setup
 ****************************************************************************/
const stepSize = 100;
const maxIncome = 200000;
let avgRatePoints = [];
let margRatePoints = [];

for (let x = 0; x <= maxIncome; x += stepSize) {
  const avgR = calculateAverageRate(x);
  const margR = calculateMarginalRate(x);
  avgRatePoints.push({ x, y: avgR });
  margRatePoints.push({ x, y: margR });
}

/****************************************************************************
 * 2B. Chart Drawing (NEW styling)
 ****************************************************************************/
function drawLineChart(canvasId, dataPoints, yMax, markerX, markerY) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  // Clear & fill background using theme variable
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = getComputedStyle(document.documentElement)
    .getPropertyValue("--chart-bg")
    .trim();
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Define padding for different areas
  const leftPadding = 65;
  const rightPadding = 25;
  const topPadding = 25;
  const bottomPadding = 50;

  const chartWidth = canvas.width - leftPadding - rightPadding;
  const chartHeight = canvas.height - topPadding - bottomPadding;

  // Map x from 0..maxIncome => 0..chartWidth
  function scaleX(val) {
    return (val / maxIncome) * chartWidth + leftPadding;
  }

  // Map y from 0..yMax => chartHeight..0
  function scaleY(val) {
    return topPadding + (chartHeight - (val / yMax) * chartHeight);
  }

  // Draw grid lines first (so they appear behind everything)
  ctx.save();
  ctx.strokeStyle = getComputedStyle(document.documentElement)
    .getPropertyValue("--chart-grid")
    .trim();
  ctx.lineWidth = 1;

  // Vertical grid lines (every 25k)
  const gridStepX = 25000;
  for (let x = 0; x <= maxIncome; x += gridStepX) {
    const px = scaleX(x);
    ctx.beginPath();
    ctx.moveTo(px, topPadding);
    ctx.lineTo(px, topPadding + chartHeight);
    ctx.stroke();
  }

  // Horizontal grid lines (every 5%)
  const gridStepY = 5;
  for (let y = 0; y <= yMax; y += gridStepY) {
    const py = scaleY(y);
    ctx.beginPath();
    ctx.moveTo(leftPadding, py);
    ctx.lineTo(leftPadding + chartWidth, py);
    ctx.stroke();
  }
  ctx.restore();

  // Draw bracket boundary lines
  const bracketBoundaries = [12096, 17443, 68480, 277825];
  ctx.save();
  ctx.strokeStyle = getComputedStyle(document.documentElement)
    .getPropertyValue("--chart-bracket")
    .trim();
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 5]);
  bracketBoundaries.forEach((boundary) => {
    if (boundary <= maxIncome) {
      const px = scaleX(boundary);
      ctx.beginPath();
      ctx.moveTo(px, topPadding);
      ctx.lineTo(px, topPadding + chartHeight);
      ctx.stroke();
    }
  });
  ctx.restore();

  // Draw axes
  ctx.save();
  ctx.strokeStyle = getComputedStyle(document.documentElement)
    .getPropertyValue("--chart-axis")
    .trim();
  ctx.lineWidth = 1.5;
  ctx.fillStyle = getComputedStyle(document.documentElement)
    .getPropertyValue("--chart-text")
    .trim();
  ctx.font = "bold 15px 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";

  // Draw X-axis line
  ctx.beginPath();
  ctx.moveTo(leftPadding, topPadding + chartHeight);
  ctx.lineTo(leftPadding + chartWidth, topPadding + chartHeight);
  ctx.stroke();

  // Draw Y-axis line
  ctx.beginPath();
  ctx.moveTo(leftPadding, topPadding);
  ctx.lineTo(leftPadding, topPadding + chartHeight);
  ctx.stroke();

  // Draw X-axis ticks & labels
  const stepX = 50000;
  for (let x = 0; x <= maxIncome; x += stepX) {
    const px = scaleX(x);
    ctx.beginPath();
    ctx.moveTo(px, topPadding + chartHeight);
    ctx.lineTo(px, topPadding + chartHeight + 6);
    ctx.stroke();
    const label = x / 1000 + "k";
    ctx.fillText(label, px - 15, topPadding + chartHeight + 25);
  }

  // Draw Y-axis ticks & labels
  const stepY = 10;
  for (let y = 0; y <= yMax; y += stepY) {
    const py = scaleY(y);
    ctx.beginPath();
    ctx.moveTo(leftPadding - 6, py);
    ctx.lineTo(leftPadding, py);
    ctx.stroke();
    const label = y + "%";
    ctx.fillText(label, leftPadding - 40, py + 5);
  }
  ctx.restore();

  // Draw main data line
  ctx.save();
  ctx.strokeStyle = getComputedStyle(document.documentElement)
    .getPropertyValue("--chart-line")
    .trim();
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  dataPoints.forEach((pt, idx) => {
    const px = scaleX(pt.x);
    const py = scaleY(pt.y);
    if (idx === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  });
  ctx.stroke();
  ctx.restore();

  // Draw marker lines and dot
  ctx.save();
  const markerColor = getComputedStyle(document.documentElement)
    .getPropertyValue("--chart-marker")
    .trim();
  ctx.strokeStyle = markerColor;
  ctx.lineWidth = 1.8;
  ctx.setLineDash([5, 5]);

  // Vertical line
  ctx.beginPath();
  ctx.moveTo(scaleX(markerX), topPadding + chartHeight);
  ctx.lineTo(scaleX(markerX), scaleY(markerY));
  ctx.stroke();

  // Horizontal line
  ctx.beginPath();
  ctx.moveTo(leftPadding, scaleY(markerY));
  ctx.lineTo(scaleX(markerX), scaleY(markerY));
  ctx.stroke();

  // Marker dot
  ctx.setLineDash([]);
  ctx.fillStyle = getComputedStyle(document.documentElement)
    .getPropertyValue("--chart-line")
    .trim();
  ctx.beginPath();
  ctx.arc(scaleX(markerX), scaleY(markerY), 6, 0, 2 * Math.PI);
  ctx.fill();
  ctx.restore();

  // Draw axis labels last (so they appear on top)
  ctx.save();
  ctx.fillStyle = getComputedStyle(document.documentElement)
    .getPropertyValue("--color-accent-pink")
    .trim();
  ctx.font = "bold 16px 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";

  // X-axis label
  ctx.textAlign = "center";
  ctx.fillText(
    "Zu versteuerndes Einkommen (€)",
    canvas.width / 2,
    canvas.height - 10
  );

  // Y-axis label
  ctx.translate(20, canvas.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.fillText("Steuersatz (%)", 0, 0);
  ctx.restore();
}

/****************************************************************************
 * 3. Interactivity: slider, input, bracket indicator, marker updates
 ****************************************************************************/
function updateUI(zvE, skipCalcUpdate = false, bypassThrottle = false) {
  // Skip if this update was triggered by calculator
  if (isUpdatingFromCalc) return;

  zvE = Math.max(0, Math.min(zvE, maxIncome));

  const slider = document.getElementById("zveSlider");
  const numberInput = document.getElementById("zveInput");
  slider.value = zvE;
  numberInput.value = zvE.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  const bracket = getBracketCase(zvE);
  const bracketIndicator = document.getElementById("bracketIndicator");

  // Check if bracket has changed
  if (bracket !== lastBracket) {
    bracketIndicator.textContent = `Aktuelle Steuerzone: ${bracket}`;
    bracketIndicator.classList.add("highlight");
    setTimeout(() => bracketIndicator.classList.remove("highlight"), 500);
    lastBracket = bracket;
  }

  // Update bracket highlighting
  updateBracketHighlighting(zvE);

  const avgR = calculateAverageRate(zvE);
  const margR = calculateMarginalRate(zvE);
  const taxAmount = calculateTax(zvE);

  document.getElementById("avgRateDisplay").textContent =
    avgR.toFixed(2).replace(".", ",") + " %";
  document.getElementById("margRateDisplay").textContent =
    margR.toFixed(2).replace(".", ",") + " %";
  document.getElementById("taxAmountDisplay").textContent =
    taxAmount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " €";

  // Redraw charts with bracket indicators
  drawLineChart("avgRateChart", avgRatePoints, 50, zvE, avgR);
  drawLineChart("margRateChart", margRatePoints, 50, zvE, margR);

  // Update calculator with new zvE value (if available and no rapid slider changes)
  if (!skipCalcUpdate && typeof window.updateCalcFromZVE === "function") {
    try {
      isUpdatingFromCalc = true;

      // Throttle calculator updates during rapid slider movement
      // Unless bypassThrottle is set to true
      if (
        bypassThrottle ||
        !window.lastCalcUpdateValue ||
        Math.abs(window.lastCalcUpdateValue - zvE) > 500
      ) {
        window.updateCalcFromZVE(zvE);
        window.lastCalcUpdateValue = zvE;
      }
    } finally {
      isUpdatingFromCalc = false;
    }
  }
}

// Make updateUI globally accessible
window.updateUI = updateUI;

window.addEventListener("DOMContentLoaded", () => {
  // Set up responsive canvas sizing
  function resizeCanvas(canvasId) {
    const canvas = document.getElementById(canvasId);
    const wrapper = canvas.parentElement;
    canvas.width = wrapper.clientWidth;
    const desiredHeight = Math.min(wrapper.clientWidth * 0.5, 370);
    canvas.height = desiredHeight;
  }

  // Initial resize
  resizeCanvas("avgRateChart");
  resizeCanvas("margRateChart");

  // Add click handlers for bracket items
  document.querySelectorAll(".bracket-item").forEach((item) => {
    item.addEventListener("click", () => {
      const amount = parseInt(item.dataset.startAmount);
      updateUI(amount);
    });
  });

  // Resize on window resize
  window.addEventListener("resize", () => {
    resizeCanvas("avgRateChart");
    resizeCanvas("margRateChart");
    updateUI(
      parseInt(
        document.getElementById("zveInput").value.replace(/\./g, ""),
        10
      ) || 0
    );
  });

  updateUI(0);

  // Throttle function to limit update frequency
  function throttle(func, limit) {
    let lastFunc;
    let lastRan;
    return function () {
      const context = this;
      const args = arguments;
      if (!lastRan) {
        func.apply(context, args);
        lastRan = Date.now();
      } else {
        clearTimeout(lastFunc);
        lastFunc = setTimeout(function () {
          if (Date.now() - lastRan >= limit) {
            func.apply(context, args);
            lastRan = Date.now();
          }
        }, limit - (Date.now() - lastRan));
      }
    };
  }

  // Create a smoother animation for slider updates
  let lastSliderValue = 0;
  let animationFrameId = null;

  function updateSliderValue(value) {
    lastSliderValue = parseInt(value, 10);

    if (!animationFrameId) {
      animationFrameId = requestAnimationFrame(function animateUpdate() {
        updateUI(lastSliderValue);
        animationFrameId = null;
      });
    }
  }

  // Handle slider input with improved smoothness
  document.getElementById("zveSlider").addEventListener("input", (e) => {
    updateSliderValue(e.target.value);
  });

  // Handle direct numeric input changes
  document.getElementById("zveInput").addEventListener("input", (e) => {
    const val = parseInt(e.target.value.replace(/\./g, ""), 10);
    if (!isNaN(val)) updateUI(val, false, true);
  });

  let intervalId = null;
  const STEP = 1;
  const INTERVAL = 50;

  function startIncrement() {
    if (intervalId) return;
    intervalId = setInterval(() => {
      const val = parseInt(
        document.getElementById("zveInput").value.replace(/\./g, ""),
        10
      );
      if (!isNaN(val)) updateUI(val + STEP, false, true);
    }, INTERVAL);
  }

  function startDecrement() {
    if (intervalId) return;
    intervalId = setInterval(() => {
      const val = parseInt(
        document.getElementById("zveInput").value.replace(/\./g, ""),
        10
      );
      if (!isNaN(val)) updateUI(Math.max(0, val - STEP), false, true);
    }, INTERVAL);
  }

  function stopChange() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  // Increment button
  const incrementBtn = document.getElementById("incrementBtn");
  incrementBtn.addEventListener("mousedown", startIncrement);
  incrementBtn.addEventListener("mouseup", stopChange);
  incrementBtn.addEventListener("mouseleave", stopChange);
  incrementBtn.addEventListener("touchstart", (e) => {
    e.preventDefault();
    startIncrement();
  });
  incrementBtn.addEventListener("touchend", stopChange);

  // Decrement button
  const decrementBtn = document.getElementById("decrementBtn");
  decrementBtn.addEventListener("mousedown", startDecrement);
  decrementBtn.addEventListener("mouseup", stopChange);
  decrementBtn.addEventListener("mouseleave", stopChange);
  decrementBtn.addEventListener("touchstart", (e) => {
    e.preventDefault();
    startDecrement();
  });
  decrementBtn.addEventListener("touchend", stopChange);

  // Add theme toggle button
  const body = document.body;
  const themeToggle = document.createElement("button");
  themeToggle.className = "theme-toggle";
  themeToggle.setAttribute("aria-label", "Designmodus wechseln");
  themeToggle.setAttribute("title", "Designmodus wechseln");

  // Create the icon elements for sun and moon
  const sunIcon = document.createElement("span");
  sunIcon.className = "theme-toggle-icon sun";
  sunIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;

  const moonIcon = document.createElement("span");
  moonIcon.className = "theme-toggle-icon moon";
  moonIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;

  themeToggle.appendChild(sunIcon);
  themeToggle.appendChild(moonIcon);
  body.appendChild(themeToggle);

  // Theme toggle functionality
  themeToggle.addEventListener("click", () => {
    const root = document.documentElement;
    const isLightTheme = root.classList.toggle("light-theme");

    // Save preference to localStorage
    localStorage.setItem("theme", isLightTheme ? "light" : "dark");

    // Force refresh of computed styles to get new theme colors
    window
      .getComputedStyle(document.documentElement)
      .getPropertyValue("--chart-bg");

    // Update chart background colors
    const charts = document.querySelectorAll("canvas");
    charts.forEach((canvas) => {
      const ctx = canvas.getContext("2d");
      // Clear and refill the background to match the theme
      ctx.fillStyle = getComputedStyle(document.documentElement)
        .getPropertyValue("--chart-bg")
        .trim();
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    });

    // Redraw charts with new colors after a short delay to ensure CSS variables are updated
    setTimeout(() => {
      updateUI(
        parseInt(
          document.getElementById("zveInput").value.replace(/\./g, ""),
          10
        ) || 0
      );
    }, 50);
  });

  // Apply saved theme on initial page load
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "light") {
    document.documentElement.classList.add("light-theme");

    // Make sure charts are redrawn with the light theme colors
    setTimeout(() => {
      updateUI(
        parseInt(
          document.getElementById("zveInput").value.replace(/\./g, ""),
          10
        ) || 0
      );
    }, 0);
  }
});
