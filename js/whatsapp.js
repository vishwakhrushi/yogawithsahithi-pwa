/**
 * whatsapp.js — Individual + broadcast send UI
 *
 * Uses 3 approved Meta templates:
 *   yws_batch_onboarding_v1          — 9 params + diet form URL button
 *   yws_prenatal_batch_onboarding_v1 — 9 params, no button
 *   yws_weekly_zoom_reminder_v1      — 7 params
 */

const WA_TEMPLATES = [
  {
    name:  "yws_weekly_zoom_reminder_v1",
    label: "Weekly Zoom Reminder",
    desc:  "Sunday + first/last day reminders",
    params: ["name", "batchType", "classTime", "classDays", "zoomLink", "meetingId", "passcode"],
    labels: ["Student Name", "Batch Type (e.g. Morning)", "Class Time", "Class Days",
             "Zoom Link", "Meeting ID", "Passcode"],
    hasDietButton: false,
  },
  {
    name:  "yws_batch_onboarding_v1",
    label: "Batch Onboarding",
    desc:  "Regular batch onboarding (Morning / Evening)",
    params: ["name", "batchName", "classTime", "startDate", "classDays",
             "zoomLink", "meetingId", "passcode", "recordingsLink"],
    labels: ["Student Name", "Batch Name", "Class Time", "Start Date (DD/MM/YYYY)",
             "Class Days", "Zoom Link", "Meeting ID", "Passcode", "Recordings Link"],
    hasDietButton: true,
  },
  {
    name:  "yws_prenatal_batch_onboarding_v1",
    label: "Prenatal Onboarding",
    desc:  "Prenatal batch onboarding",
    params: ["name", "batchName", "classTime", "startDate", "classDays",
             "zoomLink", "meetingId", "passcode", "recordingsLink"],
    labels: ["Student Name", "Batch Name", "Class Time", "Start Date (DD/MM/YYYY)",
             "Class Days", "Zoom Link", "Meeting ID", "Passcode", "Recordings Link"],
    hasDietButton: false,
  },
];

let waSelectedTemplate       = "";
let waSelectedRecipients     = [];
let waBroadcastSelectedTemplate = "";
let waBroadcastRecipients    = [];
let waBatchesCache           = [];        // loaded once from API
let waBroadcastSelectedBatch = null;      // full batch object

// ===================== INIT =====================

async function initWhatsApp() {
  renderTemplates("waTemplates", false);
  renderTemplates("waBroadcastTemplates", true);
  await loadBatchList();

  // Pre-select student if navigated from payments list
  if (typeof waPreloadStudent !== "undefined" && waPreloadStudent) {
    const s = waPreloadStudent;
    waPreloadStudent = null;
    selectWaRecipient(s.phone, s.name, s.course);
    showToast("Select a template to message " + s.name, "info");
  }
}

// ===================== TEMPLATE CARDS =====================

function renderTemplates(containerId, isBroadcast) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = WA_TEMPLATES.map(t => `
    <div class="template-card" data-template="${t.name}"
         onclick="${isBroadcast ? "selectBroadcastTemplate" : "selectTemplate"}('${t.name}', this)">
      <div class="tc-name">${escHtml(t.label)}</div>
      <div class="tc-desc">${escHtml(t.desc)}</div>
    </div>
  `).join("");
}

function templateByName(name) {
  return WA_TEMPLATES.find(t => t.name === name) || null;
}

function selectTemplate(name, el) {
  waSelectedTemplate = name;
  document.querySelectorAll("#waTemplates .template-card").forEach(c => c.classList.remove("selected"));
  el.classList.add("selected");

  const student = waSelectedRecipients[0] || null;
  let batch = null;
  if (student && student.course) {
    const prefix = student.course.substring(0, 3).toUpperCase();
    batch = waBatchesCache.find(b =>
      b.batchId.toUpperCase().endsWith("-" + prefix) ||
      b.batchName.toUpperCase().includes(prefix)
    ) || null;
  }

  renderTemplateParams("waParamsForm", name, student, batch);
  updateSendButton();
}

function selectBroadcastTemplate(name, el) {
  waBroadcastSelectedTemplate = name;
  document.querySelectorAll("#waBroadcastTemplates .template-card").forEach(c => c.classList.remove("selected"));
  el.classList.add("selected");
  renderTemplateParams("waBroadcastParamsForm", name, null, waBroadcastSelectedBatch);
  updateBroadcastSendButton();
}

/**
 * Render param input fields for the selected template.
 * Pre-fills from student (individual) or batch (broadcast).
 */
function renderTemplateParams(formId, templateName, student, batch) {
  const form = document.getElementById(formId);
  if (!form) return;

  const tmpl = templateByName(templateName);
  if (!tmpl) { form.innerHTML = ""; return; }

  // Pre-fill values from batch or student where available
  const prefill = {
    name:           student ? student.name        : "",
    batchName:      batch   ? batch.batchType     : "",
    classTime:      batch   ? batch.classTime     : "",
    startDate:      batch   ? batch.startDate     : "",
    classDays:      batch   ? batch.classDays     : "",
    zoomLink:       batch   ? batch.zoomLink      : "",
    meetingId:      batch   ? batch.meetingId     : "",
    passcode:       batch   ? batch.passcode      : "",
    recordingsLink: batch   ? batch.recordingsLink: "",
  };

  form.innerHTML = `
    <div style="margin-top:12px;">
      <div class="text-sm text-muted" style="margin-bottom:8px;">Template parameters</div>
      ${tmpl.params.map((p, i) => `
        <div style="margin-bottom:8px;">
          <label style="font-size:12px;color:var(--text-muted);">${escHtml(tmpl.labels[i])}</label>
          <input id="${formId}_param_${i}" type="text"
                 value="${escHtml(prefill[p] || "")}"
                 placeholder="${escHtml(tmpl.labels[i])}"
                 style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:14px;" />
        </div>
      `).join("")}
      ${tmpl.hasDietButton ? `
        <div style="margin-bottom:8px;">
          <label style="font-size:12px;color:var(--text-muted);">Diet Form Link (button URL)</label>
          <input id="${formId}_dietFormLink" type="text"
                 value="${escHtml(batch ? batch.dietFormLink || "" : "")}"
                 placeholder="https://..."
                 style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:14px;" />
        </div>
      ` : ""}
    </div>
  `;
}

/** Read param values from the rendered form */
function readTemplateParams(formId, templateName) {
  const tmpl = templateByName(templateName);
  if (!tmpl) return { params: [], dietFormLink: "" };

  const params = tmpl.params.map((_, i) => {
    const el = document.getElementById(`${formId}_param_${i}`);
    return el ? el.value.trim() : "";
  });

  let dietFormLink = "";
  if (tmpl.hasDietButton) {
    const el = document.getElementById(`${formId}_dietFormLink`);
    // Strip base URL — Meta button expects only the suffix after https://forms.gle/
    const raw = el ? el.value.trim() : "";
    const m   = raw.match(/forms\.gle\/([^\/\?\s#]+)/i);
    dietFormLink = m ? m[1] : raw;
  }

  return { params, dietFormLink };
}

// ===================== BATCH LIST =====================

async function loadBatchList() {
  try {
    const result = await api.get("getBatches");
    waBatchesCache = result.batches || [];

    const select = document.getElementById("waBatchSelect");
    if (!select) return;

    // Only show active batches
    const active = waBatchesCache.filter(b => b.status === "Active" || b.status === "active");
    select.innerHTML = '<option value="">-- Select batch --</option>' +
      active.map(b => `<option value="${escHtml(b.batchId)}">${escHtml(b.batchName)}</option>`).join("");
  } catch (err) {
    console.error("Failed to load batches:", err.message);
  }
}

// ===================== INDIVIDUAL SEND =====================

function switchWaTab(tab, btn) {
  document.querySelectorAll("#waTabs .tab").forEach(t => t.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById("waIndividual").style.display = tab === "individual" ? "block" : "none";
  document.getElementById("waBroadcast").style.display  = tab === "broadcast"  ? "block" : "none";
}

async function searchWaRecipients() {
  const search = document.getElementById("waSearch")?.value?.trim() || "";
  if (search.length < 2) { showToast("Enter at least 2 characters", "warning"); return; }

  try {
    const result = await api.get("getStudents", { search, pageSize: 10 });
    renderWaRecipientList(result.students || []);
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
    <div class="payment-card" style="cursor:pointer;"
         onclick="selectWaRecipient('${escHtml(s.phone)}', '${escHtml(s.name)}', '${escHtml(s.currentCourse || "")}')">
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

  // Re-render params with student name pre-filled
  if (waSelectedTemplate) {
    renderTemplateParams("waParamsForm", waSelectedTemplate, { name }, null);
  }

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
  if (batchSelect) batchSelect.addEventListener("change", onBatchSelectChange);

  const waSearch = document.getElementById("waSearch");
  if (waSearch) waSearch.addEventListener("keydown", e => { if (e.key === "Enter") searchWaRecipients(); });
});

async function onBatchSelectChange() {
  const batchId = document.getElementById("waBatchSelect")?.value || "";
  const preview = document.getElementById("waBroadcastPreview");
  const countEl = document.getElementById("waBroadcastCount");
  const namesEl = document.getElementById("waBroadcastNames");

  if (!batchId) {
    waBroadcastRecipients = [];
    waBroadcastSelectedBatch = null;
    if (preview) preview.style.display = "none";
    updateBroadcastSendButton();
    return;
  }

  waBroadcastSelectedBatch = waBatchesCache.find(b => b.batchId === batchId) || null;

  // Auto-select template from batch if available
  if (waBroadcastSelectedBatch && waBroadcastSelectedBatch.templateName) {
    const tn = waBroadcastSelectedBatch.templateName;
    const card = document.querySelector(`#waBroadcastTemplates [data-template="${tn}"]`);
    if (card) selectBroadcastTemplate(tn, card);
  }

  try {
    const result = await api.get("getStudents", { batch: batchId, pageSize: 200 });
    waBroadcastRecipients = (result.students || [])
      .filter(s => s.phone)
      .map(s => ({ phone: s.phone, name: s.name, course: s.currentCourse }));

    if (preview) preview.style.display = "block";
    if (countEl) countEl.textContent = waBroadcastRecipients.length;
    if (namesEl) {
      namesEl.textContent = waBroadcastRecipients.slice(0, 5).map(r => r.name).join(", ")
        + (waBroadcastRecipients.length > 5 ? "..." : "");
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
  const recipients   = isIndividual ? waSelectedRecipients : waBroadcastRecipients;
  const template     = isIndividual ? waSelectedTemplate   : waBroadcastSelectedTemplate;
  const formId       = isIndividual ? "waParamsForm"       : "waBroadcastParamsForm";
  const statusEl     = document.getElementById(isIndividual ? "waStatus" : "waBroadcastStatus");
  const btn          = document.getElementById(isIndividual ? "waSendBtn" : "waBroadcastSendBtn");

  if (recipients.length === 0 || !template) return;

  const { params, dietFormLink } = readTemplateParams(formId, template);

  // Confirm broadcast
  if (!isIndividual && recipients.length > 1) {
    if (!confirm(`Send "${template}" to ${recipients.length} students?`)) return;
  }

  statusEl.textContent = "Sending...";
  statusEl.className   = "helper-text";
  btn.disabled         = true;

  try {
    const body = { type, templateName: template, templateParams: params, recipients };
    if (dietFormLink) body.dietFormLink = dietFormLink;

    const result = await api.post("sendWhatsApp", body);

    const msg = `Sent: ${result.sent}, Failed: ${result.failed}`;
    statusEl.textContent = msg;
    statusEl.className   = result.failed > 0 ? "helper-text warning" : "helper-text success";
    showToast(msg, result.failed > 0 ? "warning" : "success");

    if (isIndividual) {
      clearWaRecipient();
      waSelectedTemplate = "";
      document.querySelectorAll("#waTemplates .template-card").forEach(c => c.classList.remove("selected"));
      const paramsForm = document.getElementById("waParamsForm");
      if (paramsForm) paramsForm.innerHTML = "";
    }
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.className   = "helper-text error";
    showToast(err.message, "error");
  } finally {
    btn.disabled = false;
  }
}
