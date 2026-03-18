/**
 * students.js — Students grouped by phone + batch tabs
 */

let studentsData = [];
let studentsPage = 1;
let studentsTotal = 0;
let currentBatch = "";

async function searchStudents(reset = true) {
  if (reset) {
    studentsPage = 1;
    studentsData = [];
  }

  const search = document.getElementById("stSearch")?.value?.trim() || "";
  const statusEl = document.getElementById("stStatus");
  statusEl.textContent = "Loading...";

  try {
    const result = await api.get("getStudents", {
      search,
      batch: currentBatch,
      page: studentsPage,
      pageSize: 50,
    });

    studentsTotal = result.total || 0;
    const students = result.students || [];

    if (reset) {
      studentsData = students;
    } else {
      studentsData = studentsData.concat(students);
    }

    renderStudents();
    statusEl.textContent = `Showing ${studentsData.length} of ${studentsTotal} students`;

    // Show/hide load more
    const loadMore = document.getElementById("stLoadMore");
    if (loadMore) {
      loadMore.style.display = studentsData.length < studentsTotal ? "block" : "none";
    }

  } catch (err) {
    statusEl.textContent = err.message;
    showToast(err.message, "error");
  }
}

function loadMoreStudents() {
  studentsPage++;
  searchStudents(false);
}

function filterBatch(btn) {
  // Update active tab
  document.querySelectorAll("#stBatchTabs .tab").forEach(t => t.classList.remove("active"));
  btn.classList.add("active");

  currentBatch = btn.dataset.batch || "";
  searchStudents();
}

function renderStudents() {
  const container = document.getElementById("stResults");
  if (!container) return;

  if (studentsData.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">&#x1F465;</div><p>No students found</p></div>';
    return;
  }

  container.innerHTML = studentsData.map(s => {
    const courseBadges = (s.courses || []).map(c =>
      `<span class="badge badge-purple">${escHtml(c)}</span>`
    ).join(" ");

    const statusBadge = s.activeSubscription
      ? '<span class="badge badge-green">Active</span>'
      : '<span class="badge badge-gray">Inactive</span>';

    return `
      <div class="student-card">
        <div class="sc-header">
          <div>
            <div class="sc-name">${escHtml(s.name)}</div>
            <div class="sc-phone">&#x1F4DE; ${escHtml(s.phone)}</div>
          </div>
          ${statusBadge}
        </div>
        <div style="margin:8px 0;">${courseBadges}</div>
        <div class="sc-stats">
          <div>
            <div class="text-xs text-muted">Total Paid</div>
            <div class="sc-stat-value">${formatCurrency(s.totalPaid || 0)}</div>
          </div>
          <div>
            <div class="text-xs text-muted">Payments</div>
            <div class="sc-stat-value">${s.paymentCount || 0}</div>
          </div>
          <div>
            <div class="text-xs text-muted">Last Payment</div>
            <div class="sc-stat-value">${escHtml(s.lastPaymentDate || "N/A")}</div>
          </div>
          ${s.activeSubscription && s.remainingSessions ? `
          <div>
            <div class="text-xs text-muted">Sessions Left</div>
            <div class="sc-stat-value">${s.remainingSessions}</div>
          </div>` : ""}
        </div>
        ${hasRole("STAFF") ? `
        <div style="margin-top:12px;">
          <button class="btn btn-success btn-sm" onclick="quickStudentWhatsApp('${escHtml(s.phone)}', '${escHtml(s.name)}')">
            &#x1F4AC; WhatsApp
          </button>
        </div>` : ""}
      </div>
    `;
  }).join("");
}

async function quickStudentWhatsApp(phone, name) {
  try {
    await api.post("sendWhatsApp", {
      type: "individual",
      templateName: "welcome",
      recipients: [{ phone, name }],
    });
    showToast("WhatsApp sent to " + name, "success");
  } catch (err) {
    showToast("WhatsApp failed: " + err.message, "error");
  }
}

// Search on Enter
document.addEventListener("DOMContentLoaded", () => {
  const stSearch = document.getElementById("stSearch");
  if (stSearch) {
    stSearch.addEventListener("keydown", (e) => {
      if (e.key === "Enter") searchStudents();
    });
  }
});
