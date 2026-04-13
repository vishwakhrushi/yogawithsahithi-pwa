/**
 * invoice.js — Client-side invoice PDF generation
 * Opens a styled HTML invoice in a new window; user prints/saves as PDF.
 */

// ===================== RATE CARD =====================

const INVOICE_RATES = {
  "EV1-1M": 5000,  "EV1-3M": 12500,
  "EV2-1M": 5000,  "EV2-3M": 12500,
  "MOR-1M": 5500,  "MOR-3M": 14500,
  "PRE-1M": 4000,  "PRE-3M": 9999,
  "REC-1M": 4000,  "REC-3M": 9999,
  "BP-1M":  4000,  "BP-3M":  9999,
  "KIDS":   1999,
  "DIET-1M": 6999, "DIET-3M": 18000,
  "FACEYOGA": 1499,
};

// ===================== DESCRIPTION LOGIC =====================

function invoiceDescription(course) {
  const c = (course || "").toUpperCase();

  if (c.startsWith("EV1") || c.startsWith("EV2")) {
    const months = c.endsWith("3M") ? "3 Months" : "1 Month";
    return `Yoga Classes Live\n${months} Subscription\nEvening Batch`;
  }
  if (c.startsWith("MOR")) {
    const months = c.endsWith("3M") ? "3 Months" : "1 Month";
    return `Yoga Classes Live\n${months} Subscription\nMorning Batch`;
  }
  if (c.startsWith("PRE")) {
    const months = c.endsWith("3M") ? "3 Months" : "1 Month";
    return `Yoga Classes Live\n${months} Subscription\nPrenatal Batch`;
  }
  if (c === "KIDS") {
    return `Yoga Classes Live\nKids Yoga`;
  }
  if (c.startsWith("REC")) {
    const months = c.endsWith("3M") ? "3 Months" : "1 Month";
    return `Yoga Classes Recorded\n${months} Subscription\nRecorded Classes`;
  }
  if (c.startsWith("BP-")) {
    const months = c.endsWith("3M") ? "3 Months" : "1 Month";
    return `Yoga Classes Recorded\n${months} Subscription\nBack Pain Course`;
  }
  if (c.startsWith("DIET")) {
    const months = c.endsWith("3M") ? "3 Months" : "1 Month";
    return `Diet Consultation\n${months} Subscription`;
  }
  if (c === "FACEYOGA") {
    return `Face Yoga Course\n3 Months Access`;
  }
  return course || "Service";
}

// ===================== INVOICE NUMBER =====================

function invoiceNumber(rowIndex) {
  // rowIndex is the sheet row (1=header, so data starts at 2)
  // Invoice number = 2026/<rowIndex - 1> zero-padded to 3 digits
  const num = String(Math.max(1, (rowIndex || 1) - 1)).padStart(3, "0");
  return "2026/" + num;
}

// ===================== DATE FORMATTING =====================

function formatInvoiceDate(dateStr) {
  // Input may be DD/MM/YYYY or YYYY-MM-DD or a Date
  if (!dateStr) return "";
  if (dateStr instanceof Date) {
    const d = String(dateStr.getDate()).padStart(2, "0");
    const m = String(dateStr.getMonth() + 1).padStart(2, "0");
    return `${d}.${m}.${dateStr.getFullYear()}`;
  }
  const str = String(dateStr).trim();
  // Already DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    return str.replace(/\//g, ".");
  }
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split("-");
    return `${d}.${m}.${y}`;
  }
  return str;
}

// ===================== MAIN GENERATOR =====================

function generateInvoice(idx) {
  const p = paymentsData[idx];
  if (!p) return;

  const logoUrl   = localStorage.getItem("YWSH_LOGO_URL") || "";
  const course    = p.course || "";
  const amount    = parseFloat(p.amount) || 0;
  const stdRate   = INVOICE_RATES[course.toUpperCase()] || null;
  // If paid > standard rate, treat paid amount as the actual price (no discount)
  const subtotal  = stdRate && stdRate > amount ? stdRate : amount;
  const discount  = stdRate && stdRate > amount ? stdRate - amount : 0;
  const total     = amount;
  const descLines = invoiceDescription(course).split("\n");
  const invNo     = invoiceNumber(p.rowIndex);
  const invDate   = formatInvoiceDate(p.paymentDate);
  const phone     = p.phoneNormalized ? "+" + p.phoneNormalized : "";

  const descHtml  = descLines.map((l, i) => i === 0
    ? `<span style="font-weight:500;">${escInv(l)}</span>`
    : `<br><span style="color:#666;font-size:13px;">${escInv(l)}</span>`
  ).join("");

  const discountRow = discount > 0 ? `
    <tr>
      <td colspan="3" style="padding:8px 16px;color:#555;">DISCOUNT</td>
      <td style="padding:8px 16px;text-align:right;color:#555;">₹${discount.toLocaleString("en-IN")}</td>
    </tr>` : "";

  const html = `
    <style>
      .inv-wrap * { box-sizing: border-box; margin: 0; padding: 0; }
      .inv-wrap { font-family: 'Segoe UI', Arial, sans-serif; color: #333; background: #fff; padding: 40px; max-width: 800px; margin: auto; }
      .inv-header { display: flex; align-items: flex-start; justify-content: space-between; background: #f0edf8; border-radius: 8px; padding: 24px 28px; margin-bottom: 32px; }
      .inv-header-left { display: flex; align-items: flex-start; gap: 16px; }
      .inv-logo { width: 72px; height: 72px; object-fit: contain; border-radius: 8px; }
      .inv-name { font-size: 22px; font-weight: 700; color: #2d1b6b; }
      .inv-subtitle { font-size: 11px; color: #6b5e99; letter-spacing: 0.5px; max-width: 220px; line-height: 1.5; margin-top: 4px; }
      .inv-contact { text-align: right; font-size: 13px; color: #444; line-height: 1.8; }
      .inv-title { text-align: center; font-size: 26px; font-weight: 300; letter-spacing: 6px; color: #2d1b6b; margin-bottom: 32px; }
      .inv-meta-row { display: flex; justify-content: space-between; margin-bottom: 36px; }
      .inv-issued { font-size: 14px; line-height: 1.8; }
      .inv-issued strong { font-size: 13px; letter-spacing: 1px; color: #2d1b6b; display: block; margin-bottom: 4px; }
      .inv-meta { text-align: right; font-size: 13px; line-height: 2; }
      .inv-no { font-size: 15px; font-weight: 700; color: #2d1b6b; }
      .inv-table { width: 100%; border-collapse: collapse; }
      .inv-table thead tr { background: #e8e3f5; }
      .inv-table thead th { padding: 12px 16px; text-align: left; font-size: 12px; font-weight: 700; letter-spacing: 1.5px; color: #2d1b6b; }
      .inv-table thead th:not(:first-child) { text-align: right; }
      .inv-table tbody tr { border-bottom: 1px solid #f0edf8; }
      .inv-table tbody td { padding: 16px; font-size: 14px; vertical-align: top; }
      .inv-table tbody td:not(:first-child) { text-align: right; }
      .inv-totals td { padding: 10px 16px; font-size: 14px; background: #fafafa; border-top: 1px solid #e8e3f5; }
      .inv-total-row td { padding: 14px 16px; font-size: 15px; font-weight: 700; color: #2d1b6b; background: #e8e3f5; }
      .inv-footer { margin-top: 48px; display: flex; flex-direction: column; align-items: flex-end; }
      .inv-signature { font-family: 'Georgia', serif; font-style: italic; font-size: 22px; color: #2d1b6b; }
      .inv-thankyou { font-size: 13px; font-weight: 700; letter-spacing: 3px; color: #2d1b6b; margin-top: 12px; }
    </style>

    <div class="invoice-no-print" style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:#f5f3ff;border-bottom:1px solid #e8e3f5;position:sticky;top:0;z-index:10;">
      <button onclick="closeInvoice()" style="background:none;border:1px solid #7C3AED;color:#7C3AED;padding:8px 18px;border-radius:6px;font-size:14px;cursor:pointer;">← Back</button>
      <span style="font-size:13px;font-weight:600;color:#2d1b6b;">Invoice ${escInv(invNo)}</span>
      <div style="display:flex;gap:8px;">
        <button onclick="downloadInvoice('${escInv(invNo)}')" style="background:#10B981;color:#fff;border:none;padding:8px 18px;border-radius:6px;font-size:14px;cursor:pointer;">Download</button>
        <button onclick="window.print()" style="background:#7C3AED;color:#fff;border:none;padding:8px 18px;border-radius:6px;font-size:14px;cursor:pointer;">Print</button>
      </div>
    </div>

    <div class="inv-wrap">
      <div class="inv-header">
        <div class="inv-header-left">
          ${logoUrl ? `<img src="${escInv(logoUrl)}" class="inv-logo" alt="YWS Logo"/>` : ""}
          <div>
            <div class="inv-name">Baddipadaga Sahithi</div>
            <div class="inv-subtitle">CERTIFIED YOGA TRAINER AND DIETICIAN IN AYURVEDIC FOOD &amp; NUTRITION</div>
          </div>
        </div>
        <div class="inv-contact">
          <div>📞 +917569564140</div>
          <div>✉️ Yogawithsahithi@gmail.com</div>
        </div>
      </div>

      <div class="inv-title">INVOICE</div>

      <div class="inv-meta-row">
        <div class="inv-issued">
          <strong>ISSUED TO:</strong>
          Name: ${escInv(p.name || "")}<br>
          Email: ${escInv(p.email || "")}<br>
          Contact: ${escInv(phone)}
        </div>
        <div class="inv-meta">
          <div>INVOICE NO: &nbsp;<span class="inv-no">${escInv(invNo)}</span></div>
          <div>DATE: &nbsp;${escInv(invDate)}</div>
          <div>DUE DATE: &nbsp;${escInv(invDate)}</div>
        </div>
      </div>

      <table class="inv-table">
        <thead>
          <tr>
            <th>DESCRIPTION</th>
            <th>UNIT PRICE</th>
            <th>QTY</th>
            <th>TOTAL</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${descHtml}</td>
            <td>${subtotal.toLocaleString("en-IN")}</td>
            <td>1</td>
            <td>${subtotal.toLocaleString("en-IN")}</td>
          </tr>
        </tbody>
        <tbody class="inv-totals">
          <tr>
            <td colspan="3">SUBTOTAL</td>
            <td style="text-align:right;">₹${subtotal.toLocaleString("en-IN")}</td>
          </tr>
          ${discountRow}
          <tr class="inv-total-row">
            <td colspan="3">TOTAL</td>
            <td style="text-align:right;">₹${total.toLocaleString("en-IN")}</td>
          </tr>
        </tbody>
      </table>

      <div class="inv-footer">
        <div class="inv-signature">B. Sahithi.</div>
        <div class="inv-thankyou">THANK YOU</div>
      </div>
    </div>`;

  const overlay = document.getElementById("invoiceOverlay");
  overlay.innerHTML = html;
  overlay.style.display = "block";
  document.body.style.overflow = "hidden";
}

function closeInvoice() {
  const overlay = document.getElementById("invoiceOverlay");
  overlay.style.display = "none";
  overlay.innerHTML = "";
  document.body.style.overflow = "";
}

function downloadInvoice(invNo) {
  const content = document.querySelector("#invoiceOverlay .inv-wrap");
  if (!content) return;

  const filename = "invoice-" + (invNo || "").replace("/", "-") + ".pdf";
  const btn = event.target;
  btn.disabled = true;
  btn.textContent = "Generating…";

  html2pdf()
    .set({
      margin:      [10, 10, 10, 10],
      filename:    filename,
      image:       { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF:       { unit: "mm", format: "a4", orientation: "portrait" },
    })
    .from(content)
    .save()
    .then(() => {
      btn.disabled = false;
      btn.textContent = "Download";
    });
}

// ===================== HELPERS =====================

function escInv(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
