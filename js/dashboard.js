/**
 * dashboard.js — Summary cards + Chart.js charts
 */

let chartCourse = null;
let chartTrend = null;
let chartMethods = null;
let chartBatch = null;

function initAddPayment() {
  // Set default payment date to today
  const dateInput = document.getElementById("apPayDate");
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().split("T")[0];
  }
}

// Populate year selector
document.addEventListener("DOMContentLoaded", () => {
  const yearSel = document.getElementById("dashYear");
  if (!yearSel) return;
  const currentYear = new Date().getFullYear();
  for (let y = currentYear; y >= currentYear - 3; y--) {
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y;
    yearSel.appendChild(opt);
  }

  // Default to current month/year
  const monthSel = document.getElementById("dashMonth");
  if (monthSel) monthSel.value = new Date().getMonth() + 1;
});

async function loadDashboard() {
  const month = document.getElementById("dashMonth")?.value || "";
  const year  = document.getElementById("dashYear")?.value || "";

  // Show loading
  document.getElementById("dashRevenue").textContent = "...";
  document.getElementById("dashPayments").textContent = "...";
  document.getElementById("dashNet").textContent = "...";
  document.getElementById("dashStudents").textContent = "...";

  try {
    const data = await api.get("getDashboard", { month, year });
    const s = data.summary || {};

    // Update summary cards
    document.getElementById("dashRevenue").textContent = formatCurrency(s.totalRevenue || 0);
    document.getElementById("dashPayments").textContent = s.totalTransactions || 0;
    document.getElementById("dashNet").textContent = formatCurrency(s.netRevenue || 0);
    document.getElementById("dashStudents").textContent = s.activeStudents || 0;

    // Update charts
    renderCourseChart(data.byCourse || []);
    renderTrendChart(data.monthlyTrend || []);
    renderMethodsChart(data.byPaymentMethod || []);
    renderBatchChart(data.byBatch || []);

  } catch (err) {
    showToast("Dashboard: " + err.message, "error");
  }
}

function renderCourseChart(byCourse) {
  const ctx = document.getElementById("chartCourse");
  if (!ctx) return;

  if (chartCourse) chartCourse.destroy();

  const labels = byCourse.map(c => c.course);
  const values = byCourse.map(c => c.revenue);
  const colors = generateColors(labels.length);

  chartCourse = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Revenue",
        data: values,
        backgroundColor: colors,
        borderRadius: 6,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: v => formatCurrency(v) },
        },
      },
    },
  });
}

function renderTrendChart(trend) {
  const ctx = document.getElementById("chartTrend");
  if (!ctx) return;

  if (chartTrend) chartTrend.destroy();

  chartTrend = new Chart(ctx, {
    type: "line",
    data: {
      labels: trend.map(t => t.month),
      datasets: [{
        label: "Revenue",
        data: trend.map(t => t.revenue),
        borderColor: "#7C3AED",
        backgroundColor: "rgba(124, 58, 237, 0.1)",
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: "#7C3AED",
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: v => formatCurrency(v) },
        },
      },
    },
  });
}

function renderMethodsChart(byMethod) {
  const ctx = document.getElementById("chartMethods");
  if (!ctx) return;

  if (chartMethods) chartMethods.destroy();

  const labels = byMethod.map(m => m.method);
  const values = byMethod.map(m => m.amount);
  const colors = generateColors(labels.length);

  chartMethods = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Revenue",
        data: values,
        backgroundColor: colors,
        borderRadius: 6,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: v => formatCurrency(v) },
        },
      },
    },
  });
}

function renderBatchChart(byBatch) {
  const ctx = document.getElementById("chartBatch");
  if (!ctx) return;

  if (chartBatch) chartBatch.destroy();

  const labels = byBatch.map(b => b.batch);
  const values = byBatch.map(b => b.revenue);
  const colors = generateColors(labels.length);

  chartBatch = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Revenue",
        data: values,
        backgroundColor: colors,
        borderRadius: 6,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: v => formatCurrency(v) },
        },
      },
    },
  });
}

function generateColors(count) {
  const palette = [
    "#7C3AED", "#10B981", "#F59E0B", "#EF4444", "#3B82F6",
    "#EC4899", "#8B5CF6", "#14B8A6", "#F97316", "#06B6D4",
    "#84CC16", "#A855F7", "#22D3EE", "#FB7185", "#FBBF24",
  ];
  const result = [];
  for (let i = 0; i < count; i++) {
    result.push(palette[i % palette.length]);
  }
  return result;
}
