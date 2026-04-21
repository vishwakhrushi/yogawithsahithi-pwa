/**
 * whatsapp.js — Individual + broadcast send UI
 *
 * Uses approved Meta templates:
 *   yws_batch_onboarding_v1          — 9 params + diet form URL button
 *   yws_prenatal_batch_onboarding_v1 — 9 params, no button
 *   yws_weekly_zoom_reminder_v1      — 7 params
 *   yws_class_cancellation_v1        — 1 param, broadcastOnly
 *   yws_batch_postponement_v1        — 2 params, broadcastOnly
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
  {
    name:          "yws_class_cancellation_v1",
    label:         "Class Cancellation",
    desc:          "Notify the whole batch about a cancelled class",
    params:        ["batch_name", "class_time", "date", "reason", "next_class"],
    labels:        ["Batch Name", "Class Time", "Cancelled Date (e.g. 4/04/2026)", "Reason", "Next Class Date (e.g. 16/04/2026)"],
    hasDietButton: false,
    broadcastOnly: true,   // hidden in individual send tab
  },
  {
    name:          "yws_batch_postponement_v1",
    label:         "Batch Postponement",
    desc:          "Notify the whole batch about a postponed batch start date",
    params:        ["batch_name", "class_time", "old_date", "new_date", "reason"],
    labels:        ["Batch Name", "Class Time", "Original Date (DD/MM/YYYY)", "New Date (DD/MM/YYYY)", "Reason"],
    hasDietButton: false,
    broadcastOnly: true,   // hidden in individual send tab
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

  // broadcastOnly templates are hidden from the individual send tab
  const visible = isBroadcast ? WA_TEMPLATES : WA_TEMPLATES.filter(t => !t.broadcastOnly);

  container.innerHTML = visible.map(t => `
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

// Template restrictions by course prefix
const TEMPLATE_RESTRICTIONS = {
  PRE: { allowed: "yws_prenatal_batch_onboarding_v1", error: "Prenatal students must use the Prenatal Onboarding template." },
  EV1: { allowed: "yws_batch_onboarding_v1",          error: "Evening Batch 1 students must use the Batch Onboarding template." },
  EV2: { allowed: "yws_batch_onboarding_v1",          error: "Evening Batch 2 students must use the Batch Onboarding template." },
  MOR: { allowed: "yws_batch_onboarding_v1",          error: "Morning Batch students must use the Batch Onboarding template." },
};

// Courses with no template yet
// Prefix-matched (first 3 chars of course code) courses with no template yet
const NO_TEMPLATE_COURSE_PREFIXES = new Set(["DIE", "KID", "FAC", "BP-", "REC", "OTH"]);

function validateTemplateForStudent(templateName, student) {
  if (!student || !student.course) return null; // no student selected — no restriction

  const prefix = student.course.substring(0, 3).toUpperCase();
  const prefix4 = student.course.substring(0, 4).toUpperCase();

  // Courses with no template yet (matched by 3-char prefix)
  if (NO_TEMPLATE_COURSE_PREFIXES.has(prefix)) {
    return "No WhatsApp template is available for this course type yet. Coming soon.";
  }

  // Restricted courses — must use specific template
  const rule = TEMPLATE_RESTRICTIONS[prefix];
  if (rule && templateName !== rule.allowed) {
    return rule.error;
  }

  return null; // valid
}

function selectTemplate(name, el) {
  document.querySelectorAll("#waTemplates .template-card").forEach(c => c.classList.remove("selected"));
  el.classList.add("selected");

  const student    = waSelectedRecipients[0] || null;
  const errMsg     = validateTemplateForStudent(name, student);
  const templateEl = document.getElementById("waTemplateError");

  if (errMsg) {
    waSelectedTemplate = "";
    if (templateEl) { templateEl.textContent = errMsg; templateEl.style.display = "block"; }
    const form = document.getElementById("waParamsForm");
    if (form) form.innerHTML = "";
    updateSendButton();
    return;
  }

  if (templateEl) { templateEl.textContent = ""; templateEl.style.display = "none"; }
  waSelectedTemplate = name;
  renderTemplateParams("waParamsForm", name, student, null);
  updateSendButton();
}

function selectBroadcastTemplate(name, el) {
  const prevTemplate = waBroadcastSelectedTemplate;
  waBroadcastSelectedTemplate = name;
  document.querySelectorAll("#waBroadcastTemplates .template-card").forEach(c => c.classList.remove("selected"));
  el.classList.add("selected");
  renderTemplateParams("waBroadcastParamsForm", name, null, waBroadcastSelectedBatch);
  updateBroadcastSendButton();

  // If switching to/from a cancellation or postponement template and a batch is already
  // selected, reload recipients from the appropriate source.
  if (waBroadcastSelectedBatch && name !== prevTemplate) {
    const isNewCancelPostpone = isCancelPostponeTemplate_(name);
    const wasOtherCancelPostpone = isCancelPostponeTemplate_(prevTemplate);
    if (isNewCancelPostpone || wasOtherCancelPostpone) {
      reloadBroadcastRecipients_(waBroadcastSelectedBatch.batchId, name);
    }
  }
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
    // Cancellation / postponement (batch_name + class_time auto-filled; dates/reason user-entered)
    batch_name:  batch ? batch.batchType  : "",
    class_time:  batch ? batch.classTime  : "",
    date:        "",
    reason:      "",
    next_class:  "",
    old_date:    "",
    new_date:    "",
  };

  // Filter active batches by the student's latest course prefix (EV1, EV2, MOR, PRE etc.)
  // Falls back to all active batches if no course or course has no batch (DIET, KIDS, etc.)
  const studentCourse  = student ? (student.course || "").trim() : "";
  const coursePrefix   = studentCourse.substring(0, 3).toUpperCase(); // "EV1", "MOR", "PRE" etc.
  const batchCourses   = new Set(["EV1", "EV2", "MOR", "PRE"]); // courses that have batches

  const activeBatches = waBatchesCache.filter(b => {
    if ((b.status || "").toLowerCase() !== "active") return false;
    if (coursePrefix && batchCourses.has(coursePrefix)) {
      return b.batchId.toUpperCase().endsWith("-" + coursePrefix);
    }
    return true; // no course prefix match — show all active
  });

  const batchOptions = activeBatches.map(b =>
    `<option value="${escHtml(b.batchId)}">${escHtml(b.batchType)} — ${escHtml(b.batchId)}</option>`
  ).join("");

  // Only show batch picker for individual send (not broadcast which has its own)
  const showBatchPicker = formId === "waParamsForm";

  form.innerHTML = `
    <div style="margin-top:12px;">
      ${showBatchPicker ? `
        <div style="margin-bottom:12px;">
          <label style="font-size:12px;color:var(--text-muted);">Select Batch</label>
          <select id="${formId}_batchPicker"
                  onchange="onIndividualBatchChange('${formId}', '${templateName}')"
                  style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:14px;">
            <option value="">-- Pick a batch to auto-fill --</option>
            ${batchOptions}
          </select>
        </div>
      ` : ""}
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

/** Called when user picks a batch from the individual send batch picker */
function onIndividualBatchChange(formId, templateName) {
  const picker = document.getElementById(formId + "_batchPicker");
  if (!picker) return;

  const batchId = picker.value;
  const batch   = batchId ? waBatchesCache.find(b => b.batchId === batchId) || null : null;
  const student = waSelectedRecipients[0] || null;
  const tmpl    = templateByName(templateName);
  if (!tmpl) return;

  // Map of param key → batch field
  const batchFill = {
    batchName:      batch ? batch.batchType      : "",
    classTime:      batch ? batch.classTime      : "",
    startDate:      batch ? batch.startDate      : "",
    classDays:      batch ? batch.classDays      : "",
    zoomLink:       batch ? batch.zoomLink       : "",
    meetingId:      batch ? batch.meetingId      : "",
    passcode:       batch ? batch.passcode       : "",
    recordingsLink: batch ? batch.recordingsLink : "",
  };

  // Update each param field (skip "name" — keep student name as-is)
  tmpl.params.forEach((p, i) => {
    if (p === "name") return;
    const input = document.getElementById(formId + "_param_" + i);
    if (input && batchFill[p] !== undefined) input.value = batchFill[p];
  });

  // Update diet form link if present
  const dietEl = document.getElementById(formId + "_dietFormLink");
  if (dietEl && batch) dietEl.value = batch.dietFormLink || "";
}

// ===================== BATCH LIST =====================

/** True if the template is a class cancellation or batch postponement template */
function isCancelPostponeTemplate_(templateName) {
  return templateName === "yws_class_cancellation_v1" ||
         templateName === "yws_batch_postponement_v1";
}

async function loadBatchList() {
  const select = document.getElementById("waBatchSelect");
  if (select) select.innerHTML = '<option value="">Loading batches…</option>';

  try {
    const result = await api.get("getBatches");
    waBatchesCache = result.batches || [];

    if (!select) return;

    // Show active batches from live batch families (EV1, EV2, MOR, PRE)
    const LIVE_FAMILIES = new Set(["EV1", "EV2", "MOR", "PRE"]);
    const active = waBatchesCache.filter(b => {
      if ((b.status || "").toLowerCase() !== "active") return false;
      // Match by suffix of Batch_ID: YWS-YYYYMMDD-EV1 → "EV1"
      const parts = (b.batchId || "").split("-");
      const family = parts[parts.length - 1].toUpperCase();
      return LIVE_FAMILIES.has(family);
    });

    select.innerHTML = '<option value="">-- Select batch --</option>' +
      active.map(b => `<option value="${escHtml(b.batchId)}">${escHtml(b.batchName || b.batchType)} — ${escHtml(b.batchId)}</option>`).join("");
  } catch (err) {
    console.error("Failed to load batches:", err.message);
    if (select) select.innerHTML = '<option value="">-- Failed to load batches --</option>';
  }
}

/**
 * Load broadcast recipients from the ONBOARDING_<batchId> sheet (cancellation/postponement flow).
 */
async function reloadBroadcastRecipients_(batchId, templateName) {
  const preview = document.getElementById("waBroadcastPreview");
  const countEl = document.getElementById("waBroadcastCount");
  const namesEl = document.getElementById("waBroadcastNames");

  if (!batchId) {
    waBroadcastRecipients = [];
    if (preview) preview.style.display = "none";
    updateBroadcastSendButton();
    return;
  }

  try {
    if (isCancelPostponeTemplate_(templateName)) {
      // Use ONBOARDING sheet recipients for cancellation/postponement
      const result = await api.get("getBatchRecipients", { batchId });
      waBroadcastRecipients = (result.recipients || [])
        .filter(r => r.phone)
        .map(r => ({ phone: r.phone, name: r.name, course: "" }));
    } else {
      // Use student list for other broadcast templates
      const result = await api.get("getStudents", { batch: batchId, pageSize: 200 });
      waBroadcastRecipients = (result.students || [])
        .filter(s => s.phone)
        .map(s => ({ phone: s.phone, name: s.name, course: s.currentCourse }));
    }

    if (preview) preview.style.display = "block";
    if (countEl) countEl.textContent = waBroadcastRecipients.length;
    if (namesEl) {
      namesEl.textContent = waBroadcastRecipients.slice(0, 5).map(r => r.name).join(", ") +
        (waBroadcastRecipients.length > 5 ? "…" : "");
    }
  } catch (err) {
    showToast(err.message, "error");
    waBroadcastRecipients = [];
    if (preview) preview.style.display = "none";
  }

  updateBroadcastSendButton();
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

  if (!batchId) {
    waBroadcastRecipients = [];
    waBroadcastSelectedBatch = null;
    const preview = document.getElementById("waBroadcastPreview");
    if (preview) preview.style.display = "none";
    updateBroadcastSendButton();
    return;
  }

  waBroadcastSelectedBatch = waBatchesCache.find(b => b.batchId === batchId) || null;

  // Auto-select template from batch if available (only for non-cancel/postpone templates)
  if (waBroadcastSelectedBatch && waBroadcastSelectedBatch.templateName &&
      !isCancelPostponeTemplate_(waBroadcastSelectedBatch.templateName)) {
    const tn   = waBroadcastSelectedBatch.templateName;
    const card = document.querySelector(`#waBroadcastTemplates [data-template="${tn}"]`);
    if (card) selectBroadcastTemplate(tn, card);
  }

  // Re-render params form so batch details auto-fill
  if (waBroadcastSelectedTemplate) {
    renderTemplateParams("waBroadcastParamsForm", waBroadcastSelectedTemplate, null, waBroadcastSelectedBatch);
  }

  // Load recipients (source depends on current template)
  await reloadBroadcastRecipients_(batchId, waBroadcastSelectedTemplate);
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

  // Debug log
  console.log("[WA send] template:", template);
  console.log("[WA send] params:", params);
  console.log("[WA send] dietFormLink:", dietFormLink);
  console.log("[WA send] recipients:", recipients);

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
    // For broadcast cancellation/postponement, pass batchId so the backend can
    // update WA_CANCELLATION_SENT / WA_POSTPONEMENT_SENT in the Batches sheet.
    if (!isIndividual && waBroadcastSelectedBatch && isCancelPostponeTemplate_(template)) {
      body.batchId = waBroadcastSelectedBatch.batchId;
    }

    console.log("[WA send] full payload:", JSON.stringify(body));
    const result = await api.post("sendWhatsApp", body);
    console.log("[WA send] result:", JSON.stringify(result));

    const msg = `Sent: ${result.sent}, Failed: ${result.failed}`;
    // Show per-recipient errors if any failed
    const errors = (result.results || []).filter(r => r.status !== "sent").map(r => r.error).filter(Boolean);
    const fullMsg = errors.length ? msg + " — " + errors.join("; ") : msg;
    statusEl.textContent = fullMsg;
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
