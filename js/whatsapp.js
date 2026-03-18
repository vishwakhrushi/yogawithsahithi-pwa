/**
 * whatsapp.js — Individual + broadcast send UI
 */

const WA_TEMPLATES = [
  { name: "welcome",   label: "Welcome Message",     desc: "Send after new payment" },
  { name: "zoom_link", label: "Zoom Class Link",      desc: "Share the class join link" },
  { name: "schedule",  label: "Class Schedule",        desc: "Send weekly class schedule" },
  { name: "recording", label: "Recording Link",        desc: "Share recorded session link" },
  { name: "reminder",  label: "Class Reminder",        desc: "Remind about upcoming class" },
];

let waSelectedTemplate = "";
let waSelectedRecipients = [];
let waBroadcastSelectedTemplate = "";
let waBroadcastRecipients = [];

function initWhatsApp() {
  renderTemplates("waTemplates", false);
  renderTemplates("waBroadcastTemplates", true);
}

function switchWaTab(tab, btn) {
  document.querySelectorAll("#waTabs .tab").forEach(t => t.classList.remove("active"));
  btn.classList.add("active");

  document.getElementById("waIndividual").style.display = tab === "individual" ? "block" : "none";
  document.getElementById("waBroadcast").style.display  = tab === "broadcast"  ? "block" : "none";
}

function renderTemplates(containerId, isBroadcast) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = WA_TEMPLATES.map(t => `
    <div class="template-card" data-template="${t.name}"
         onclick="${isBroadcast ? 'selectBroadcastTemplate' : 'selectTemplate'}('${t.name}', this)">
      <div class="tc-name">${escHtml(t.label)}</div>
      <div class="tc-desc">${escHtml(t.desc)}</div>
    </div>
  `).join("");
}

function selectTemplate(name, el) {
  waSelectedTemplate = name;
  document.querySelectorAll("#waTemplates .template-card").forEach(c => c.classList.remove("selected"));
  el.classList.add("selected");
  updateSendButton();
}

function selectBroadcastTemplate(name, el) {
  waBroadcastSelectedTemplate = name;
  document.querySelectorAll("#waBroadcastTemplates .template-card").forEach(c => c.classList.remove("selected"));
  el.classList.add("selected");
  updateBroadcastSendButton();
}

// ===================== INDIVIDUAL SEND =====================

async function searchWaRecipients() {
  const search = document.getElementById("waSearch")?.value?.trim() || "";
  if (search.length < 2) {
    showToast("Enter at least 2 characters", "warning");
    return;
  }

  try {
    const result = await api.get("getStudents", { search, pageSize: 10 });
    const students = result.students || [];
    renderWaRecipientList(students);
  } catch (err) {
    showToast(err.message, "error");
  }
}

function renderWaRecipientList(students) {
  const container = document.getElementById("waRecipientList");
  if (!container) return;

  if (students.length === 0) {
    container.innerHTML = '<div class="text-sm text-muted" style="text-align:center;padding:12px;">No students found</div>';
    return;
  }

  container.innerHTML = students.map(s => `
    <div class="payment-card" style="cursor:pointer;" onclick="selectWaRecipient('${escHtml(s.phone)}', '${escHtml(s.name)}', '${escHtml(s.currentCourse)}')">
      <div class="pc-header">
        <div>
          <div class="pc-name">${escHtml(s.name)}</div>
          <span class="text-sm text-muted">${escHtml(s.phone)}</span>
        </div>
        <span class="badge badge-purple">${escHtml(s.currentCourse || "")}</span>
      </div>
    </div>
  `).join("");
}

function selectWaRecipient(phone, name, course) {
  waSelectedRecipients = [{ phone, name, course }];

  document.getElementById("waRecipientList").innerHTML = "";
  document.getElementById("waSelectedRecipient").style.display = "block";
  document.getElementById("waSelectedRecipient").innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-weight:600;">${escHtml(name)}</div>
          <div class="text-sm text-muted">${escHtml(phone)}</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="clearWaRecipient()">Change</button>
      </div>
    </div>
  `;

  updateSendButton();
}

function clearWaRecipient() {
  waSelectedRecipients = [];
  document.getElementById("waSelectedRecipient").style.display = "none";
  document.getElementById("waSelectedRecipient").innerHTML = "";
  updateSendButton();
}

function updateSendButton() {
  const btn = document.getElementById("waSendBtn");
  if (btn) btn.disabled = !(waSelectedRecipients.length > 0 && waSelectedTemplate);
}

// ===================== BROADCAST =====================

document.addEventListener("DOMContentLoaded", () => {
  const batchSelect = document.getElementById("waBatchSelect");
  if (batchSelect) {
    batchSelect.addEventListener("change", loadBroadcastRecipients);
  }
});

async function loadBroadcastRecipients() {
  const batch = document.getElementById("waBatchSelect")?.value || "";
  const preview = document.getElementById("waBroadcastPreview");
  const countEl = document.getElementById("waBroadcastCount");
  const namesEl = document.getElementById("waBroadcastNames");

  if (!batch) {
    waBroadcastRecipients = [];
    if (preview) preview.style.display = "none";
    updateBroadcastSendButton();
    return;
  }

  try {
    const result = await api.get("getStudents", { batch, pageSize: 200 });
    const students = result.students || [];

    // Only active students with phone numbers
    waBroadcastRecipients = students
      .filter(s => s.phone)
      .map(s => ({ phone: s.phone, name: s.name, course: s.currentCourse }));

    if (preview) preview.style.display = "block";
    if (countEl) countEl.textContent = waBroadcastRecipients.length;
    if (namesEl) {
      namesEl.textContent = waBroadcastRecipients
        .slice(0, 5)
        .map(r => r.name)
        .join(", ") + (waBroadcastRecipients.length > 5 ? "..." : "");
    }

    updateBroadcastSendButton();
  } catch (err) {
    showToast(err.message, "error");
  }
}

function updateBroadcastSendButton() {
  const btn = document.getElementById("waBroadcastSendBtn");
  if (btn) btn.disabled = !(waBroadcastRecipients.length > 0 && waBroadcastSelectedTemplate);
}

// ===================== SEND =====================

async function sendWhatsApp(type) {
  const isIndividual = type === "individual";
  const recipients = isIndividual ? waSelectedRecipients : waBroadcastRecipients;
  const template   = isIndividual ? waSelectedTemplate : waBroadcastSelectedTemplate;
  const statusEl   = document.getElementById(isIndividual ? "waStatus" : "waBroadcastStatus");
  const btn        = document.getElementById(isIndividual ? "waSendBtn" : "waBroadcastSendBtn");

  if (recipients.length === 0 || !template) return;

  // Confirm broadcast
  if (!isIndividual && recipients.length > 1) {
    if (!confirm(`Send "${template}" to ${recipients.length} students?`)) return;
  }

  statusEl.textContent = "Sending...";
  statusEl.className = "helper-text";
  btn.disabled = true;

  try {
    const result = await api.post("sendWhatsApp", {
      type,
      templateName: template,
      recipients,
    });

    const msg = `Sent: ${result.sent}, Failed: ${result.failed}`;
    statusEl.textContent = msg;
    statusEl.className = result.failed > 0 ? "helper-text warning" : "helper-text success";
    showToast(msg, result.failed > 0 ? "warning" : "success");

    // Reset
    if (isIndividual) {
      clearWaRecipient();
      waSelectedTemplate = "";
      document.querySelectorAll("#waTemplates .template-card").forEach(c => c.classList.remove("selected"));
    }

  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.className = "helper-text error";
    showToast(err.message, "error");
  } finally {
    btn.disabled = false;
  }
}

// Search on Enter
document.addEventListener("DOMContentLoaded", () => {
  const waSearch = document.getElementById("waSearch");
  if (waSearch) {
    waSearch.addEventListener("keydown", (e) => {
      if (e.key === "Enter") searchWaRecipients();
    });
  }
});
