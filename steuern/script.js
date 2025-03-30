/****************************************************************************
 * 1. Tax calculation helpers (piecewise for 5 cases), plus average/marginal
 ****************************************************************************/
// Track last bracket for comparison
let lastBracket = null;

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

// Add this function after the getBracketCase function
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

  // Clear & fill a dark background
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#2A2A32";
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
  ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
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
  ctx.strokeStyle = "rgba(255, 0, 128, 0.4)";
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
  ctx.strokeStyle = "#888";
  ctx.lineWidth = 1.5;
  ctx.fillStyle = "#ccc";
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
  ctx.strokeStyle = "#FF0080";
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
  const markerColor = "#00FFC2";
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
  ctx.fillStyle = "#FF0080";
  ctx.beginPath();
  ctx.arc(scaleX(markerX), scaleY(markerY), 6, 0, 2 * Math.PI);
  ctx.fill();
  ctx.restore();

  // Draw axis labels last (so they appear on top)
  ctx.save();
  ctx.fillStyle = "#ff0080";
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
function updateUI(zvE) {
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
}

window.addEventListener("DOMContentLoaded", () => {
  // Set up responsive canvas sizing
  function resizeCanvas(canvasId) {
    const canvas = document.getElementById(canvasId);
    const wrapper = canvas.parentElement;
    canvas.width = wrapper.clientWidth;
    canvas.height = wrapper.clientWidth * 0.5; // maintain 2:1 ratio
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

  document.getElementById("zveSlider").addEventListener("input", (e) => {
    updateUI(parseInt(e.target.value, 10));
  });

  document.getElementById("zveInput").addEventListener("input", (e) => {
    const val = parseInt(e.target.value.replace(/\./g, ""), 10);
    if (!isNaN(val)) updateUI(val);
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
      if (!isNaN(val)) updateUI(val + STEP);
    }, INTERVAL);
  }

  function startDecrement() {
    if (intervalId) return;
    intervalId = setInterval(() => {
      const val = parseInt(
        document.getElementById("zveInput").value.replace(/\./g, ""),
        10
      );
      if (!isNaN(val)) updateUI(Math.max(0, val - STEP));
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
});
