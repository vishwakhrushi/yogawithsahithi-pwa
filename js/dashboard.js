/**
 * dashboard.js — Summary cards + Chart.js charts
 */

let chartCourse = null;
let chartTrend = null;
let chartMethods = null;

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
  const container = document.getElementById("batchRevenueTable");
  if (!container) return;

  if (!byBatch || byBatch.length === 0) {
    container.innerHTML = '<p style="color:var(--text-secondary);font-size:14px;">No data for this period.</p>';
    return;
  }

  const totalRevenue = byBatch.reduce((s, b) => s + b.revenue, 0);

  const rows = byBatch.map(b => {
    const pct = totalRevenue > 0 ? ((b.revenue / totalRevenue) * 100).toFixed(1) : "0.0";
    return `
      <tr>
        <td style="padding:10px 8px;font-weight:500;">${b.batch}</td>
        <td style="padding:10px 8px;text-align:right;">${b.count}</td>
        <td style="padding:10px 8px;text-align:right;font-weight:600;">${formatCurrency(b.revenue)}</td>
        <td style="padding:10px 8px;text-align:right;color:var(--text-secondary);">${pct}%</td>
      </tr>`;
  }).join("");

  container.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <thead>
        <tr style="border-bottom:2px solid var(--border-color);">
          <th style="padding:8px;text-align:left;color:var(--text-secondary);font-weight:600;">Batch</th>
          <th style="padding:8px;text-align:right;color:var(--text-secondary);font-weight:600;">Payments</th>
          <th style="padding:8px;text-align:right;color:var(--text-secondary);font-weight:600;">Revenue</th>
          <th style="padding:8px;text-align:right;color:var(--text-secondary);font-weight:600;">Share</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <tr style="border-top:2px solid var(--border-color);background:var(--surface-color,#f9f9f9);">
          <td style="padding:10px 8px;font-weight:700;">Total</td>
          <td style="padding:10px 8px;text-align:right;font-weight:700;">${byBatch.reduce((s,b)=>s+b.count,0)}</td>
          <td style="padding:10px 8px;text-align:right;font-weight:700;">${formatCurrency(totalRevenue)}</td>
          <td style="padding:10px 8px;text-align:right;color:var(--text-secondary);">100%</td>
        </tr>
      </tbody>
    </table>`;
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
