/**
 * payments.js — Add payment form + payments list + edit modal
 */

// ===================== ADD PAYMENT =====================

async function savePayment(sendWhatsApp = false) {
  const saveBtn   = document.getElementById("apSaveBtn");
  const saveWaBtn = document.getElementById("apSaveWaBtn");
  const statusEl  = document.getElementById("apStatus");

  const name    = document.getElementById("apName").value.trim();
  const email   = document.getElementById("apEmail").value.trim();
  const phone   = digitsOnly(document.getElementById("apPhone").value);
  const course  = document.getElementById("apCourse").value;
  const amount  = parseFloat(document.getElementById("apAmount").value);
  const payDate = document.getElementById("apPayDate").value;
  const account = document.getElementById("apAccount").value;
  const txnId   = document.getElementById("apTxnId").value.trim();
  const remarks = document.getElementById("apRemarks").value.trim();

  // Validation
  if (!name) { statusEl.textContent = "Name is required."; statusEl.className = "helper-text error"; return; }
  if (!phone || phone.length < 8 || phone.length > 15) {
    statusEl.textContent = "Phone must be 8-15 digits including country code.";
    statusEl.className = "helper-text error";
    return;
  }
  if (!course) { statusEl.textContent = "Course is required."; statusEl.className = "helper-text error"; return; }
  if (!amount || isNaN(amount)) { statusEl.textContent = "Valid amount is required."; statusEl.className = "helper-text error"; return; }
  if (!payDate) { statusEl.textContent = "Payment date is required."; statusEl.className = "helper-text error"; return; }

  // Format date to DD/MM/YYYY
  const [y, m, d] = payDate.split("-");
  const formattedDate = `${d}/${m}/${y}`;

  statusEl.textContent = "Saving...";
  statusEl.className = "helper-text";
  saveBtn.disabled = true;
  saveWaBtn.disabled = true;

  try {
    const result = await api.post("addPayment", {
      name, email, phone, course, amount,
      payDate: formattedDate,
      account, txnId, remarks,
    });

    statusEl.textContent = "Payment saved successfully!";
    statusEl.className = "helper-text success";
    showToast("Payment added for " + name, "success");

    // Send WhatsApp welcome if requested
    if (sendWhatsApp && result.phoneNorm) {
      try {
        await api.post("sendWhatsApp", {
          type: "individual",
          templateName: "welcome",
          recipients: [{
            phone: result.phoneNorm,
            name,
            course,
            rowIndex: result.rowNum,
          }],
        });
        showToast("WhatsApp welcome sent!", "success");
      } catch (waErr) {
        showToast("Payment saved but WhatsApp failed: " + waErr.message, "warning");
      }
    }

    clearPaymentForm();

    // Reload payments list if it was loaded
    if (screenLoaded["payments"]) {
      screenLoaded["payments"] = false; // force reload on next visit
    }

  } catch (err) {
    if (err.message.startsWith("OFFLINE:")) {
      statusEl.textContent = "Saved offline. Will sync when connected.";
      statusEl.className = "helper-text warning";
      showToast("Payment queued offline", "warning");
      clearPaymentForm();
    } else {
      statusEl.textContent = err.message;
      statusEl.className = "helper-text error";
      showToast(err.message, "error");
    }
  } finally {
    saveBtn.disabled = false;
    saveWaBtn.disabled = false;
  }
}

function clearPaymentForm() {
  document.getElementById("apName").value = "";
  document.getElementById("apEmail").value = "";
  document.getElementById("apPhone").value = "";
  document.getElementById("apCourse").value = "";
  document.getElementById("apAmount").value = "";
  document.getElementById("apPayDate").value = new Date().toISOString().split("T")[0];
  document.getElementById("apAccount").value = "";
  document.getElementById("apTxnId").value = "";
  document.getElementById("apRemarks").value = "";
  document.getElementById("apStatus").textContent = "";
  document.getElementById("apPhoneMsg").textContent = "";
}

// Phone validation on input
document.addEventListener("DOMContentLoaded", () => {
  const phoneInput = document.getElementById("apPhone");
  const phoneMsg = document.getElementById("apPhoneMsg");
  if (phoneInput && phoneMsg) {
    phoneInput.addEventListener("input", () => {
      const d = digitsOnly(phoneInput.value);
      if (d.length === 0) {
        phoneMsg.textContent = "";
        phoneMsg.className = "helper-text";
      } else if (d.length >= 8 && d.length <= 15) {
        phoneMsg.textContent = "Valid (" + d.length + " digits)";
        phoneMsg.className = "helper-text success";
      } else {
        phoneMsg.textContent = d.length + " digits (need 8-15)";
        phoneMsg.className = "helper-text error";
      }
    });
  }
});

// ===================== PAYMENTS LIST =====================

let paymentsData = [];
let paymentsPage = 1;
let paymentsTotal = 0;

async function searchPayments(reset = true) {
  if (reset) {
    paymentsPage = 1;
    paymentsData = [];
  }

  const search  = document.getElementById("plSearch")?.value?.trim() || "";
  const course  = document.getElementById("plCourse")?.value || "";
  const account = document.getElementById("plAccount")?.value || "";

  const statusEl = document.getElementById("plStatus");
  statusEl.textContent = "Loading...";

  try {
    const result = await api.get("getPayments", {
      search, course, account,
      page: paymentsPage,
      pageSize: 50,
    });

    paymentsTotal = result.total || 0;
    const payments = result.payments || [];

    if (reset) {
      paymentsData = payments;
    } else {
      paymentsData = paymentsData.concat(payments);
    }

    renderPayments();
    statusEl.textContent = `Showing ${paymentsData.length} of ${paymentsTotal}`;

    // Show/hide load more
    const loadMore = document.getElementById("plLoadMore");
    if (loadMore) {
      loadMore.style.display = paymentsData.length < paymentsTotal ? "block" : "none";
    }

  } catch (err) {
    statusEl.textContent = err.message;
    showToast(err.message, "error");
  }
}

function loadMorePayments() {
  paymentsPage++;
  searchPayments(false);
}

function renderPayments() {
  const container = document.getElementById("plResults");
  if (!container) return;

  if (paymentsData.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">&#x1F4B3;</div><p>No payments found</p></div>';
    return;
  }

  container.innerHTML = paymentsData.map((p, idx) => {
    const isRefund = p.course === "REFUND" || p.amount < 0;
    const amountClass = isRefund ? "pc-amount refund" : "pc-amount";
    const amountPrefix = isRefund ? "-" : "";

    return `
      <div class="payment-card" onclick="togglePaymentCard(this)" data-idx="${idx}">
        <div class="pc-header">
          <div>
            <div class="pc-name">${escHtml(p.name)}</div>
            <span class="badge badge-purple">${escHtml(p.course)}</span>
          </div>
          <div class="${amountClass}">${amountPrefix}${formatCurrency(Math.abs(p.amount))}</div>
        </div>
        <div class="pc-meta">
          <span>&#x1F4C5; ${escHtml(p.paymentDate)}</span>
          <span>&#x1F4B1; ${escHtml(p.paymentAccount)}</span>
          ${p.phoneNormalized ? `<span>&#x1F4DE; ${escHtml(p.phoneNormalized)}</span>` : ""}
        </div>
        <div class="pc-details">
          ${p.email ? `<div class="detail-row"><span class="detail-label">Email</span><span>${escHtml(p.email)}</span></div>` : ""}
          ${p.transactionId ? `<div class="detail-row"><span class="detail-label">Txn ID</span><span>${escHtml(p.transactionId)}</span></div>` : ""}
          ${p.remarks ? `<div class="detail-row"><span class="detail-label">Remarks</span><span>${escHtml(p.remarks)}</span></div>` : ""}
          ${p.updatedBy ? `<div class="detail-row"><span class="detail-label">Updated By</span><span>${escHtml(p.updatedBy)}</span></div>` : ""}
          ${p.updatedAt ? `<div class="detail-row"><span class="detail-label">Updated At</span><span>${escHtml(p.updatedAt)}</span></div>` : ""}
          ${p.subscriptionStatus === "ACTIVE" ? `<div class="detail-row"><span class="detail-label">Sessions</span><span>${p.remainingSessions || 0} / ${p.entitledSessions || 0} remaining</span></div>` : ""}
          <div class="detail-actions">
            ${hasRole("STAFF") ? `<button class="btn btn-outline btn-sm" onclick="event.stopPropagation(); openEditModal(${idx})">Edit</button>` : ""}
            ${hasRole("STAFF") ? `<button class="btn btn-success btn-sm" onclick="event.stopPropagation(); quickWhatsApp(${idx})">WhatsApp</button>` : ""}
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function togglePaymentCard(el) {
  el.classList.toggle("expanded");
}

// ===================== EDIT MODAL =====================

function openEditModal(idx) {
  const p = paymentsData[idx];
  if (!p) return;

  document.getElementById("editRowIndex").value = p.rowIndex;
  document.getElementById("editEmail").value = p.email || "";
  document.getElementById("editPhone").value = p.phoneNormalized || p.whatsapp || "";
  document.getElementById("editRemarks").value = p.remarks || "";
  document.getElementById("editUpdateNotes").value = "";

  // Show/hide fields based on role
  const showManagerFields = hasRole("MANAGER");
  document.getElementById("editAmountGroup").style.display = showManagerFields ? "block" : "none";
  document.getElementById("editCourseGroup").style.display = showManagerFields ? "block" : "none";
  document.getElementById("editTxnIdGroup").style.display = showManagerFields ? "block" : "none";
  document.getElementById("editAccountGroup").style.display = showManagerFields ? "block" : "none";

  if (showManagerFields) {
    document.getElementById("editAmount").value = p.amount || "";
    document.getElementById("editCourse").value = p.course || "";
    document.getElementById("editTxnId").value = p.transactionId || "";
    document.getElementById("editAccount").value = p.paymentAccount || "";
  }

  // WA history section — MANAGER+ only
  const waHistoryEl = document.getElementById("editWaHistory");
  if (waHistoryEl) {
    if (hasRole("MANAGER")) {
      waHistoryEl.style.display = "block";
      loadWaHistory(p.rowIndex);
    } else {
      waHistoryEl.style.display = "none";
    }
  }

  document.getElementById("editModal").classList.add("active");
}

async function submitEdit() {
  const rowIndex = parseInt(document.getElementById("editRowIndex").value, 10);
  if (!rowIndex) return;

  const updates = {};
  const updateNotes = document.getElementById("editUpdateNotes").value.trim();

  // Always include basic fields
  updates.email   = document.getElementById("editEmail").value.trim();
  updates.phone   = digitsOnly(document.getElementById("editPhone").value);
  updates.remarks = document.getElementById("editRemarks").value.trim();

  // Manager+ fields
  if (hasRole("MANAGER")) {
    const amountVal = document.getElementById("editAmount").value;
    if (amountVal) updates.amount = parseFloat(amountVal);
    updates.course  = document.getElementById("editCourse").value;
    updates.txnId   = document.getElementById("editTxnId").value.trim();
    updates.account = document.getElementById("editAccount").value;
  }

  try {
    await api.post("editPayment", { rowIndex, updates, updateNotes });
    showToast("Payment updated", "success");
    closeEditModal();
    searchPayments(); // Refresh list
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ===================== QUICK WHATSAPP =====================

async function quickWhatsApp(idx) {
  const p = paymentsData[idx];
  if (!p) return;

  try {
    await api.post("sendWhatsApp", {
      type: "individual",
      templateName: "welcome",
      recipients: [{
        phone: p.phoneNormalized || p.whatsapp,
        name: p.name,
        course: p.course,
        rowIndex: p.rowIndex,
      }],
    });
    showToast("WhatsApp sent to " + p.name, "success");
  } catch (err) {
    showToast("WhatsApp failed: " + err.message, "error");
  }
}

// ===================== WA HISTORY IN EDIT MODAL =====================

async function loadWaHistory(paymentRow) {
  const container = document.getElementById("editWaHistory");
  if (!container) return;

  container.innerHTML = '<div class="text-sm text-muted">Loading WhatsApp history...</div>';

  try {
    const result = await api.get("getWaLog", { paymentRow });
    const entries = result.entries || [];

    if (entries.length === 0) {
      container.innerHTML = '<div class="text-sm text-muted">No WhatsApp messages sent yet</div>';
      return;
    }

    container.innerHTML = entries.map(e => {
      const statusClass = e.status === "sent" ? "success" : "error";
      const statusIcon  = e.status === "sent" ? "✓" : "✗";
      return `
        <div style="border-left:3px solid var(--${statusClass === "success" ? "success" : "danger"},#ef4444);padding:6px 10px;margin-bottom:8px;background:var(--surface);">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:12px;font-weight:600;color:var(--${statusClass === "success" ? "success" : "danger"},#ef4444);">${statusIcon} ${escHtml(e.status.toUpperCase())}</span>
            <span style="font-size:11px;color:var(--text-muted);">${escHtml(e.timestamp)}</span>
          </div>
          <div style="font-size:12px;margin-top:2px;">${escHtml(e.template)}</div>
          ${e.messageId ? `<div style="font-size:11px;color:var(--text-muted);">ID: ${escHtml(e.messageId)}</div>` : ""}
          ${e.error    ? `<div style="font-size:11px;color:#ef4444;">${escHtml(e.error)}</div>` : ""}
          <div style="font-size:11px;color:var(--text-muted);">by ${escHtml(e.sentBy)}</div>
        </div>
      `;
    }).join("");
  } catch (err) {
    container.innerHTML = '<div class="text-sm text-muted">Could not load WA history</div>';
  }
}

// ===================== CSV EXPORT =====================

function exportCSV() {
  if (paymentsData.length === 0) {
    showToast("No data to export", "warning");
    return;
  }

  const headers = ["Name", "Email", "Phone", "Course", "Amount", "Payment Date", "Account", "Transaction ID", "Remarks"];
  const rows = paymentsData.map(p => [
    p.name, p.email, p.phoneNormalized, p.course, p.amount,
    p.paymentDate, p.paymentAccount, p.transactionId, p.remarks,
  ]);

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => '"' + String(cell || "").replace(/"/g, '""') + '"').join(","))
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "payments_export_" + new Date().toISOString().split("T")[0] + ".csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ===================== SEARCH ON ENTER =====================

document.addEventListener("DOMContentLoaded", () => {
  const plSearch = document.getElementById("plSearch");
  if (plSearch) {
    plSearch.addEventListener("keydown", (e) => {
      if (e.key === "Enter") searchPayments();
    });
  }
});

// ===================== HTML ESCAPE =====================

function escHtml(s) {
  const div = document.createElement("div");
  div.textContent = s || "";
  return div.innerHTML;
}
