/**
 * onboarding.js — Batch onboarding status view
 *
 * Shows every student in an ONBOARDING_<batchId> sheet with:
 *   - WhatsApp onboarding sent status (cross-ref from WhatsApp_Log)
 *   - Drive access granted status (from drive_access_granted sheet column)
 *
 * Filter chips: All | WA Pending | Drive Pending
 */

let onboardingStudents   = [];
let onboardingFilter     = "all"; // "all" | "wa-pending" | "drive-pending"
let onboardingDriveShown = false; // true when at least one student has a drive column value

// ===================== INIT =====================

async function initOnboarding() {
  onboardingStudents   = [];
  onboardingFilter     = "all";
  onboardingDriveShown = false;
  await loadOnboardingBatchList();
}

async function loadOnboardingBatchList() {
  const select = document.getElementById("onboardingBatchSelect");
  if (!select) return;

  select.innerHTML = '<option value="">Loading batches…</option>';
  try {
    const result = await api.get("getBatches");
    const active = (result.batches || []).filter(b =>
      (b.status || "").toLowerCase() === "active"
    );
    select.innerHTML = '<option value="">— Select a batch —</option>' +
      active.map(b =>
        `<option value="${escHtml(b.batchId)}">${escHtml(b.batchType || b.batchName)} — ${escHtml(b.batchId)}</option>`
      ).join("");
  } catch (err) {
    select.innerHTML = '<option value="">— Failed to load batches —</option>';
    showToast(err.message, "error");
  }
}

async function loadOnboardingSheet() {
  const batchId   = document.getElementById("onboardingBatchSelect")?.value || "";
  const container = document.getElementById("onboardingList");
  const summary   = document.getElementById("onboardingSummary");
  const filters   = document.getElementById("onboardingFilters");

  if (!batchId) return;

  if (container) container.innerHTML = '<div class="loading-msg">Loading…</div>';
  if (summary)   summary.innerHTML   = "";
  if (filters)   filters.style.display = "none";

  try {
    const result     = await api.get("getOnboardingSheet", { batchId });
    onboardingStudents   = result.students || [];
    onboardingDriveShown = onboardingStudents.some(s => s.driveStatus && s.driveStatus.granted);

    const searchWrap = document.getElementById("onboardingSearchWrap");
    const searchEl   = document.getElementById("onboardingSearch");
    if (searchWrap) searchWrap.style.display = onboardingStudents.length ? "block" : "none";
    if (searchEl)   searchEl.value = "";

    renderOnboardingSummary(result);
    setOnboardingFilter("all", document.querySelector("#onboardingFilters .filter-chip"));
    if (filters) filters.style.display = "flex";
  } catch (err) {
    if (container) container.innerHTML =
      `<div class="loading-msg">${escHtml(err.message)}</div>`;
    showToast(err.message, "error");
  }
}

// ===================== FILTER =====================

function setOnboardingFilter(filter, btn) {
  onboardingFilter = filter || "all";
  document.querySelectorAll("#onboardingFilters .filter-chip")
    .forEach(c => c.classList.remove("active"));
  if (btn) btn.classList.add("active");
  renderOnboardingList();
}

// ===================== RENDER SUMMARY =====================

function renderOnboardingSummary(result) {
  const summary = document.getElementById("onboardingSummary");
  if (!summary) return;

  const students = result.students || [];
  const total    = students.length;
  if (total === 0) { summary.innerHTML = ""; return; }

  const waSent       = students.filter(s => s.waStatus  && s.waStatus.sent).length;
  const driveGranted = students.filter(s => s.driveStatus && s.driveStatus.granted).length;

  const waClass    = waSent    < total ? "summary-chip summary-warn" : "summary-chip summary-ok";
  const driveClass = driveGranted < total ? "summary-chip summary-warn" : "summary-chip summary-ok";

  summary.innerHTML = `
    <span class="summary-chip">&#x1F465; ${total} student${total !== 1 ? "s" : ""}</span>
    <span class="${waClass}">&#x1F4AC; ${waSent}/${total} WA sent</span>
    <span class="${driveClass}">&#x1F4C1; ${driveGranted}/${total} Drive granted</span>
  `;
}

// ===================== RENDER LIST =====================

function renderOnboardingList() {
  const container = document.getElementById("onboardingList");
  if (!container) return;

  const query = (document.getElementById("onboardingSearch")?.value || "").trim().toLowerCase();

  let students = onboardingStudents;

  if (onboardingFilter === "wa-pending") {
    students = students.filter(s => !s.waStatus || !s.waStatus.sent);
  } else if (onboardingFilter === "drive-pending") {
    students = students.filter(s => !s.driveStatus || !s.driveStatus.granted);
  }

  if (query) {
    students = students.filter(s =>
      (s.name  || "").toLowerCase().includes(query) ||
      (s.email || "").toLowerCase().includes(query) ||
      (s.phone || "").toLowerCase().includes(query)
    );
  }

  if (students.length === 0) {
    container.innerHTML = '<div class="loading-msg">&#x2714; All students are up to date for this filter.</div>';
    return;
  }

  container.innerHTML = students.map(s => {
    const wa = s.waStatus  || {};
    const dr = s.driveStatus || {};

    const waBadge = `<span class="status-badge ${wa.sent ? "status-sent" : "status-pending"}"
        title="${wa.sent
          ? `Sent ${escHtml(wa.sentAt || "")}${wa.sentBy ? " by " + escHtml(wa.sentBy) : ""}${wa.template ? " · " + escHtml(wa.template) : ""}`
          : "WA onboarding not sent yet"}">
        ${wa.sent ? "✓" : "–"} WA
      </span>`;

    const driveBadge = `<span class="status-badge ${dr.granted ? "status-sent" : "status-pending"}"
        title="${dr.granted
          ? `Drive access granted${dr.grantedAt ? ": " + escHtml(dr.grantedAt) : ""}`
          : "Drive access not recorded yet"}">
        ${dr.granted ? "✓" : "–"} Drive
      </span>`;

    const metaParts = [
      s.plan        ? `<span>${escHtml(s.plan)}</span>`        : "",
      s.paymentDate ? `<span>&#x1F4C5; ${escHtml(s.paymentDate)}</span>` : "",
      s.phone       ? `<span>&#x1F4DE; ${escHtml(s.phone)}</span>`       : "",
    ].filter(Boolean).join("");

    const waDetail = wa.sent
      ? `<div class="detail-row">
           <span class="detail-label">WA sent</span>
           <span>${escHtml(wa.sentAt || "")}${wa.sentBy ? " by " + escHtml(wa.sentBy) : ""}
             ${wa.template ? `<br><span class="text-sm text-muted">${escHtml(wa.template)}</span>` : ""}
           </span>
         </div>`
      : "";

    const driveDetail = dr.granted
      ? `<div class="detail-row">
           <span class="detail-label">Drive</span>
           <span>Granted ${escHtml(dr.grantedAt || "")}</span>
         </div>`
      : "";

    const notesDetail = s.notes
      ? `<div class="detail-row">
           <span class="detail-label">Notes</span>
           <span>${escHtml(s.notes)}</span>
         </div>`
      : "";

    const emailDetail = s.email
      ? `<div class="detail-row">
           <span class="detail-label">Email</span>
           <span>${escHtml(s.email)}</span>
         </div>`
      : "";

    return `
      <div class="payment-card" onclick="this.classList.toggle('expanded')">
        <div class="pc-header">
          <div>
            <div class="pc-name">${escHtml(s.name)}</div>
            ${s.plan ? `<span class="badge badge-purple">${escHtml(s.plan)}</span>` : ""}
          </div>
          <div class="pc-status-row" style="flex-direction:column;align-items:flex-end;gap:4px;">
            ${waBadge}
            ${driveBadge}
          </div>
        </div>
        ${metaParts ? `<div class="pc-meta">${metaParts}</div>` : ""}
        <div class="pc-details">
          ${emailDetail}
          ${waDetail}
          ${driveDetail}
          ${notesDetail}
        </div>
      </div>
    `;
  }).join("");
}
