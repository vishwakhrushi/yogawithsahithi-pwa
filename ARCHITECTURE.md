# YogaWithSahithi — System Architecture Document

**Version:** Current (as of May 2026)  
**Repos:** `yogawithsahithi-pwa` · `yogawithsahithi-api`  
**Prepared for:** Architectural Review

---

## 1. System Overview

YogaWithSahithi is an internal business operations platform for a yoga instruction business. It enables the team to:

- Record and manage student payments
- Auto-trigger WhatsApp onboarding messages on payment
- Broadcast batch-level WhatsApp messages (class cancellation, postponement)
- Grant and track Google Drive recordings access per course
- Monitor onboarding status (WA sent, Drive access) per batch
- View revenue dashboards and student records
- Generate invoices as PDFs

The system is composed of two independently deployed components:

| Component | Technology | Hosting |
|-----------|-----------|---------|
| **Frontend (PWA)** | Vanilla JS SPA | GitHub Pages |
| **Backend (API)** | Google Apps Script (V8) | Google Apps Script Web App |
| **Database** | Google Sheets | Google Drive |

---

## 2. High-Level Architecture Diagram

```
┌─────────────────────────────────────────┐
│           Browser (Mobile / Desktop)     │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  PWA (GitHub Pages)                │  │
│  │  Vanilla JS · Hash Router · SW     │  │
│  │                                    │  │
│  │  Screens: Login · Dashboard ·      │  │
│  │  Payments · Students · WhatsApp ·  │  │
│  │  Onboarding · Add Payment          │  │
│  └──────────────┬─────────────────────┘  │
└─────────────────│───────────────────────┘
                  │ HTTPS (GET/POST)
                  │ token in query/body
                  ▼
┌─────────────────────────────────────────┐
│  Google Apps Script Web App (API)        │
│                                          │
│  doGet()  ──► action router             │
│  doPost() ──► action router             │
│                                          │
│  Modules: Auth · Payments · Students ·  │
│  Dashboard · Whatsapp · DriveAccess ·   │
│  RecordingsAccess · Chatwoot · Audit     │
└───────┬──────────┬──────────┬───────────┘
        │          │          │
        ▼          ▼          ▼
  ┌──────────┐ ┌──────────┐ ┌────────────────────┐
  │  Google  │ │  Google  │ │  External APIs      │
  │  Sheets  │ │  Drive   │ │                    │
  │ (Master  │ │ (folder  │ │  Meta WhatsApp API │
  │  DB)     │ │ access)  │ │  Chatwoot REST API │
  └──────────┘ └──────────┘ └────────────────────┘
```

---

## 3. Backend — Google Apps Script API

### 3.1 Runtime & Deployment

| Property | Value |
|----------|-------|
| Runtime | V8 (modern JavaScript) |
| Execution context | `USER_DEPLOYING` (runs as the owner's Google account) |
| Access | `ANYONE_ANONYMOUS` (public URL, auth handled in-app via token) |
| Timezone | Asia/Kolkata |
| Logging | Google Cloud Stackdriver |
| Deploy tool | `clasp` (CLI) |
| CI/CD | GitHub Actions → `clasp push --force` on every push to `main` |

### 3.2 Request Routing

All traffic enters through two Google Apps Script entrypoints:

```
GET  /exec?action=<action>&token=<token>&[params...]
POST /exec   body: { action, token, ...fields }
```

`Code.gs` contains a `switch` statement that dispatches to the appropriate handler function. There is no framework — routing is entirely manual.

**GET actions:**

| Action | Handler | Min Role |
|--------|---------|----------|
| `verifyToken` | `handleVerifyToken` | — |
| `getPayments` | `handleGetPayments` | VIEW_ONLY |
| `getDashboard` | `handleGetDashboard` | MANAGER |
| `getStudents` | `handleGetStudents` | VIEW_ONLY |
| `getAuditLog` | `handleGetAuditLog` | MANAGER |
| `getWaLog` | `handleGetWaLog` | MANAGER |
| `getBatches` | `handleGetBatches` | VIEW_ONLY |
| `getBatchRecipients` | `handleGetBatchRecipients` | VIEW_ONLY |
| `getOnboardingSheet` | `handleGetOnboardingSheet` | STAFF |

**POST actions:**

| Action | Handler | Min Role |
|--------|---------|----------|
| `addPayment` | `handleAddPayment` | STAFF |
| `editPayment` | `handleEditPayment` | STAFF |
| `sendWhatsApp` | `handleSendWhatsApp` | MANAGER |

### 3.3 Module Map (`.gs` files)

| File | Responsibility |
|------|---------------|
| `Code.gs` | Entry points (`doGet`, `doPost`), routing switch, shared constants (`CONFIG`, `COL`, `ROLE_LEVEL`, `VALID_COURSES`, `LIVE_COURSES`), utility helpers (`getSs_`, `masterSheet_`, `formatDate_`, `formatDateTime_`, `parseDate_`) |
| `Auth.gs` | Token validation (`requireAuth_`), role assertion (`assertMinRole_`, `assertRole_`), rate limiting via `CacheService` (60 req/min per user) |
| `Payments.gs` | `addPayment`, `editPayment`, `getPayments`. Augments payment list with `waStatus` + `driveStatus` via log joins (`buildWaStatusMap_`, `buildDriveStatusMap_`) |
| `Students.gs` | `getStudents` — full-text search across name/email/phone, returns current course |
| `Dashboard.gs` | `getDashboard` — revenue aggregation by course, payment method, monthly trend. Results cached 60s in `CacheService` |
| `Whatsapp.gs` | `sendWhatsApp` (individual & broadcast), `getBatches`, `getBatchRecipients`, `getOnboardingSheet`. Auto-onboarding logic (`sendOnboardingMessage_`, `sendRecordingsOnboarding_`). Template registry and named param mapping. Chatwoot mirroring. Onboarding sheet write-back helpers |
| `DriveAccess.gs` | `grantDriveAccess_` — creates time-limited Drive viewer permission (Drive API v3 `expirationTime`). `logDriveAccess_` writes to `Drive_Access_Log` sheet. Courses: FACEYOGA (90d), BP-1M (30d), BP-3M (90d) |
| `RecordingsAccess.gs` | REC-1M / REC-3M cycle management. On payment: creates cycle rows, immediately processes Cycle 1. Daily time-based trigger (`processScheduledRecCycles`) promotes eligible cycles, grants Drive access to new recording folders, sends WA notification |
| `Chatwoot.gs` | `mirrorToChatwoot_` — silent best-effort. Looks up or creates Chatwoot contact by phone, finds or creates a conversation in the WhatsApp inbox, posts a private outgoing note |
| `Audit.gs` | `logWaMessage_` (writes to `WhatsApp_Log` sheet), `handleGetWaLog`, `handleGetAuditLog` |

### 3.4 Authentication & Authorisation

- **Mechanism:** Static bearer tokens stored as JSON in Apps Script **Script Properties** under key `AUTH_TOKENS`
  ```json
  { "token_abc123": { "email": "user@example.com", "role": "MANAGER" } }
  ```
- **Roles (ascending):** `VIEW_ONLY < STAFF < MANAGER < ADMIN`
- **Role enforcement:** `requireAuth_()` validates token on every request. `assertMinRole_()` checks the minimum role needed for that action.
- **Rate limiting:** `CacheService` (Apps Script's in-memory cache) tracks request counts per user email — hard limit 60 requests/minute.
- **No sessions, no cookies, no OAuth.** Token is passed as a query param on GET and inside the JSON body on POST.

### 3.5 Data Storage — Google Sheets as Database

All persistent data lives in **two Google Spreadsheets**:

#### Master Spreadsheet (payments + logs)

| Sheet Tab | Purpose | Key Columns |
|-----------|---------|-------------|
| `Master_Data` | All student payments — the primary data table | Timestamp, Name, Email, Country, WhatsApp, Phone_Normalized, Course, Amount, Payment_Date, Payment_Account, Transaction_ID, Remarks, Updated_At, Updated_By, Update_Notes + computed columns (course_code, plan_months, entitled_sessions, used_sessions, remaining_sessions, subscription_status, batch_id) |
| `Users` | Auth users (informational, not used for auth lookup) | — |
| `Activity_Log` | All write operations audit trail | — |
| `WhatsApp_Log` | Every WA send attempt | Timestamp, Payment_Row, Student_Name, Phone, Course, Template, Status, Message_ID, Error, Sent_By |
| `Drive_Access_Log` | Every Drive access grant | Timestamp, Email, Course, Folder_ID, Folder_Link, Grant_Date, Expiry_Date, Permission_ID |
| `REC_Cycles` | Recordings access cycle tracker for REC-1M/3M | 17 columns — see RecordingsAccess.gs header |

#### Batches Spreadsheet (separate Google Sheet, ID in Script Properties)

| Sheet Tab | Purpose |
|-----------|---------|
| `Batches` | Master list of all yoga batches with schedule, Zoom details, status |
| `ONBOARDING_<batchId>` | One sheet per active batch (e.g. `ONBOARDING_YWS-20250115-EV1`). Managed externally by the batch manager. Columns: name, email, whatsapp, phone_normalized, plan, payment_date_used, zoom_link, meeting_id, passcode, recordings_link, dietform_link, email_sent_at, drive_access_granted, whatsapp_sent_at, notes |

**Column order in `Master_Data` is fixed** — the `COL` constants map to 1-based column indices and must never change for backward compatibility.

### 3.6 Course Taxonomy

```
Live batch courses  : EV1-1M, EV1-3M, EV2-1M, EV2-3M, MOR-1M, MOR-3M, PRE-1M, PRE-3M
Recordings courses  : REC-1M, REC-3M
Drive access courses: FACEYOGA, BP-1M, BP-3M (+ REC-1M/3M via RecordingsAccess.gs)
Diet/Other          : DIET-1M, DIET-3M, KIDS, OTHER, REFUND
```

### 3.7 WhatsApp Templates

All templates are pre-approved Meta Business templates. They use **named parameters** (`parameter_name` field required by Meta API). The full registry is in `WA_TEMPLATE_PARAM_NAMES` in `Whatsapp.gs`:

| Template | Params | Trigger |
|----------|--------|---------|
| `yws_batch_onboarding_v1` | name, batch_name, class_time, start_date, class_days, zoom_link, meeting_id, passcode, recordings_link + diet form URL button | Auto on EV1/EV2/MOR payment |
| `yws_prenatal_batch_onboarding_v1` | Same 9 params, no button | Auto on PRE payment |
| `yws_weekly_zoom_reminder_v1` | name, batch_name, class_time, class_days, zoom_link, meeting_id, passcode | Manual |
| `yws_faceyoga_onboarding_v1` | faceyoga_link | Auto on FACEYOGA payment |
| `yws_backpain_onboarding_v1` | backpain_course_link | Auto on BP-1M/BP-3M payment |
| `yws_recording_batch_onboarding_v2` | name + dynamic Drive folder URL button | Auto on REC cycle grant |
| `yws_class_cancellation_v1` | batch_name, class_time, date, reason, next_class | Manual broadcast only |
| `yws_batch_postponement_v1` | batch_name, class_time, old_date, new_date, reason | Manual broadcast only |

**Message rate limiting:** 120ms sleep between messages in broadcast sends.

### 3.8 Automated Triggers

| Trigger | Handler | Frequency |
|---------|---------|-----------|
| REC cycle processor | `processScheduledRecCycles` | Daily (time-based, configured manually in Apps Script editor) |
| (No other scheduled triggers) | — | — |

### 3.9 External Integrations

| Service | SDK / Protocol | Purpose |
|---------|---------------|---------|
| Meta WhatsApp Business API | REST (v19.0) via `UrlFetchApp` | Send WhatsApp messages from templates |
| Google Drive API v3 | Apps Script Advanced Service | Create time-limited viewer permissions (`expirationTime`) on folders |
| Google Sheets API | Apps Script built-in `SpreadsheetApp` | All data storage |
| Chatwoot | REST API v1 via `UrlFetchApp` | Mirror outbound WA messages as private notes in the CRM |

### 3.10 Script Properties (Configuration)

All secrets and config are stored as Apps Script Script Properties (equivalent to env vars):

| Property | Used By |
|----------|---------|
| `AUTH_TOKENS` | Auth.gs — JSON map of token → {email, role} |
| `MASTER_SHEET_ID` | Code.gs — ID of the payments/master spreadsheet |
| `BATCHES_SHEET_ID` | Whatsapp.gs — ID of the batches spreadsheet |
| `WHATSAPP_TOKEN` | Whatsapp.gs — Meta Cloud API bearer token |
| `WHATSAPP_PHONE_ID` | Whatsapp.gs — WhatsApp Business phone number ID |
| `ONBOARDING_HEADER_IMAGE` | Whatsapp.gs — Image URL for batch onboarding template headers |
| `FACEYOGA_HEADER_IMAGE` | Whatsapp.gs — Image URL for FaceYoga template header |
| `BACKPAIN_HEADER_IMAGE` | Whatsapp.gs — Image URL for BackPain template header |
| `FACEYOGA_FOLDER_ID` | DriveAccess.gs — Drive folder ID for FaceYoga recordings |
| `BACKPAIN_FOLDER_ID` | DriveAccess.gs — Drive folder ID for BackPain recordings |
| `CHATWOOT_BASE_URL` | Chatwoot.gs — Chatwoot instance URL |
| `CHATWOOT_API_TOKEN` | Chatwoot.gs — User access token |
| `CHATWOOT_ACCOUNT_ID` | Chatwoot.gs — Numeric account ID |
| `CHATWOOT_INBOX_ID` | Chatwoot.gs — WhatsApp inbox ID |

---

## 4. Frontend — PWA

### 4.1 Technology Stack

| Concern | Choice |
|---------|--------|
| Language | Vanilla JavaScript (ES2020, no bundler, no framework) |
| Markup | Single HTML file (`index.html`) |
| Styling | Single CSS file (`css/app.css`) — custom properties (CSS vars), no CSS framework |
| Charts | Chart.js 4.4 (CDN) |
| PDF generation | html2pdf.js 0.10 (CDN) |
| Offline storage | IndexedDB (via `offlineQueue` in `offline.js`) |
| PWA capabilities | Web App Manifest + Service Worker |
| Hosting | GitHub Pages (static, no server) |

### 4.2 File Structure

```
/
├── index.html          # Single HTML file — all screens as divs
├── manifest.json       # PWA manifest (standalone display, purple theme)
├── sw.js               # Service Worker
├── css/
│   └── app.css         # All styles, CSS custom properties for theming
├── js/
│   ├── api.js          # Fetch wrapper + auth state (localStorage)
│   ├── app.js          # Hash router, screen init, nav visibility, role guards
│   ├── login.js        # Login screen logic
│   ├── dashboard.js    # Revenue charts (Chart.js)
│   ├── payments.js     # Payment list, edit modal, WA/Drive status badges
│   ├── students.js     # Student search and detail
│   ├── whatsapp.js     # Individual send + broadcast tabs, template forms
│   ├── onboarding.js   # Onboarding status view per batch
│   ├── invoice.js      # Invoice generation (html2pdf)
│   └── offline.js      # IndexedDB queue + online/offline events
└── icons/
    ├── icon-192.png
    ├── icon-512.png
    └── yws-logo.png
```

### 4.3 Routing

Client-side hash router in `app.js`:

```
/#/login        → screen-login
/#/dashboard    → screen-dashboard    (ADMIN only)
/#/add-payment  → screen-add-payment  (STAFF+)
/#/payments     → screen-payments     (VIEW_ONLY+)
/#/students     → screen-students     (VIEW_ONLY+)
/#/whatsapp     → screen-whatsapp     (MANAGER+)
/#/onboarding   → screen-onboarding   (STAFF+)
```

- All screens are pre-rendered `<div class="screen">` elements — shown/hidden by toggling `class="active"`.
- Screen `initScreen()` is called once per screen per session (memoized with `screenLoaded` map), **except** the Onboarding screen which re-inits on every visit to refresh the batch list.
- Role guards redirect to `/#/payments` if the user lacks permission.

### 4.4 Authentication Flow

1. User enters the Apps Script **web app URL** and a **token** on the login screen.
2. PWA calls `GET ?action=verifyToken&token=<token>`.
3. On success, stores `{ baseUrl, token, email, role }` in `localStorage`.
4. All subsequent API calls read credentials from `localStorage` via the `api` object.
5. Any `Unauthorized` error in an API response calls `api.onAuthFail()` which clears storage and redirects to login.

### 4.5 API Communication

`api.js` wraps all calls:

- **GET** — builds URL with query params, uses `fetch(..., { redirect: "follow" })`. Apps Script web apps respond with a redirect, so `redirect: "follow"` is required.
- **POST** — uses `Content-Type: text/plain` (not `application/json`) to avoid CORS preflight. The JSON body is serialised as a string. Apps Script reads it from `e.postData.contents`.
- **Error handling** — throws on HTTP errors and on `{ status: "error" }` responses.
- **Offline** — POST failures when `navigator.onLine === false` are enqueued in IndexedDB instead of throwing.

### 4.6 Offline Support

`offline.js` provides an **IndexedDB-based queue**:

- Database: `ywsh_offline`, object store: `queue`
- Failed POST calls (when offline) are enqueued with `{ action, body, timestamp }`.
- On `window.addEventListener("online")`, `offlineQueue.flush()` replays queued calls sequentially.
- A badge counter on the WhatsApp nav item shows the number of pending offline items.
- **Only POST (write) operations are queued.** GET (read) operations fail silently or with a toast.

### 4.7 Service Worker Caching Strategy

`sw.js` implements:

- **Static assets:** Cache-first with network fallback. Pre-cached on install: HTML, CSS, JS modules, icons, manifest.
- **API calls (Google Apps Script URLs):** Network-only — never cached to ensure fresh data.
- Cache name: `ywsh-static-v1`. On activation, old caches are deleted.

### 4.8 Screen Modules

#### Payments (`payments.js`)
- Paginated list with search, course/account/date-range filters.
- Each payment card shows collapsed summary + expandable detail section.
- **Status badges:** `✓ WA` / `– WA` and `✓ Drive` / `– Drive` sourced from `waStatus` / `driveStatus` fields returned by `getPayments` (server-side join against `WhatsApp_Log` and `Drive_Access_Log`).
- Edit modal: role-gated fields (MANAGER+ can edit amount/course/account).
- WA history section in edit modal (MANAGER+).
- Invoice generation inline.

#### WhatsApp Center (`whatsapp.js`)
- **Individual tab:** search student → select → choose template → fill params → send.
- **Broadcast tab** (MANAGER+): select active batch → recipients auto-loaded from `ONBOARDING_<batchId>` sheet → select template → fill params → confirm → send.
- Template param forms auto-fill from batch data (Zoom link, class time, etc.).
- In broadcast mode, the `name` parameter is **auto-personalised per recipient** server-side (overrides any form value with `r.name`).
- `broadcastOnly` templates (cancellation, postponement) are hidden from the individual tab.

#### Onboarding Status (`onboarding.js`)
- Select active batch → loads `ONBOARDING_<batchId>` sheet.
- Summary strip: `X/Y WA sent · X/Y Drive granted`.
- Filter chips: **All / WA Pending / Drive Pending**.
- Inline search by name, email, phone (client-side, no extra API call).
- Status sourced directly from `whatsapp_sent_at` and `drive_access_granted` columns in the onboarding sheet (maintained by the batch manager externally).

#### Dashboard (`dashboard.js`)
- Revenue by course (bar chart), by payment method (doughnut), monthly trend (line — net revenue after refunds).
- Period filter: month + year.
- ADMIN-only screen.

---

## 5. Data Flow — Key Scenarios

### 5.1 Payment Added (auto-onboarding)

```
Staff adds payment (POST addPayment)
  → Master_Data row inserted
  → Activity_Log entry written
  → if course ∈ {EV1, EV2, MOR, PRE}:
      sendOnboardingMessage_()
        → look up active batch in Batches sheet
        → POST to Meta WhatsApp API
        → logWaMessage_() → WhatsApp_Log
        → mirrorToChatwoot_() → Chatwoot private note
        → append [WA:onboarding ...] to Master_Data Remarks
  → if course ∈ {FACEYOGA, BP-1M, BP-3M}:
      sendRecordingsOnboarding_()
        → grantDriveAccess_() → Drive API v3 permission
        → logDriveAccess_() → Drive_Access_Log
        → POST to Meta WhatsApp API
        → logWaMessage_() → WhatsApp_Log
        → mirrorToChatwoot_()
  → if course ∈ {REC-1M, REC-3M}:
      initiateRecCycles_()
        → insert rows in REC_Cycles (1 or 3 cycles)
        → processRecCycles_() → grant cycle 1 immediately if due
```

### 5.2 Broadcast Send

```
Manager selects batch + template + fills params → POST sendWhatsApp (type: broadcast)
  → for each recipient in waBroadcastRecipients:
      → substitute name param with r.name
      → POST to Meta WhatsApp API
      → logWaMessage_()
      → mirrorToChatwoot_()
      → sleep 120ms
  → if cancellation/postponement template:
      updateBatchBroadcastStatus_() → Batches sheet column updated
```

### 5.3 Payments List Load

```
GET getPayments
  → read Master_Data (one range read)
  → apply filters (search, course, account, date range)
  → sort by timestamp descending
  → paginate
  → buildWaStatusMap_():  read WhatsApp_Log → { rowIndex → latest sent entry }
  → buildDriveStatusMap_(): read Drive_Access_Log → { email|course → latest grant }
  → join status onto each paged payment
  → return
```

---

## 6. Deployment & CI/CD

### API (Google Apps Script)

| Step | Tool | Detail |
|------|------|--------|
| Source control | Git → GitHub | `yogawithsahithi-api` repo |
| Push to Apps Script | `clasp push` | CLI tool, syncs `.gs` files to the project identified in `.clasp.json` |
| CI/CD | GitHub Actions | `.github/workflows/deploy.yml` — triggers on push to `main`, installs `clasp`, writes `~/.clasprc.json` from `CLASPRC_JSON` secret, runs `clasp push --force` |
| Deployment | Manual via Apps Script editor | Must create a new versioned deployment (or update existing) for changes to go live on the web app URL. `clasp push` alone updates the source but does not redeploy. |

### PWA (GitHub Pages)

| Step | Detail |
|------|--------|
| Source control | Git → GitHub (`yogawithsahithi-pwa` repo) |
| Hosting | GitHub Pages serves the repo root as a static site |
| Deployment | Automatic — any push to `main` is live within seconds |
| Base URL | `https://<org>.github.io/yogawithsahithi-pwa/` |

---

## 7. Security Model

| Concern | Current Approach |
|---------|-----------------|
| API authentication | Static bearer tokens in Script Properties |
| Transport | HTTPS (Apps Script + GitHub Pages both enforce TLS) |
| CORS | Apps Script web apps handle CORS via redirect; PWA uses `redirect: "follow"` and `Content-Type: text/plain` for POSTs to avoid preflight |
| Token storage (client) | `localStorage` — accessible to JS, not HttpOnly |
| Role enforcement | Server-side on every request via `assertMinRole_` |
| Rate limiting | CacheService (in-memory, 60 req/min per user email) |
| Data access | Apps Script runs as `USER_DEPLOYING` — has full access to the owner's Google Sheets and Drive |
| Secret management | Apps Script Script Properties (not committed to Git) |
| Public API surface | `ANYONE_ANONYMOUS` — URL is public; token provides the only gate |

---

## 8. Known Limitations & Issues for Architectural Review

### 8.1 Database (Google Sheets)
- **No transactions / no ACID guarantees.** A crash mid-write (e.g. during `editPayment`) can leave partial data.
- **No indexing.** Every query (`getPayments`, `getStudents`) does a full sheet scan via `getValues()`. As rows grow (10k+), latency will increase.
- **Concurrent write collisions.** Two staff members adding a payment simultaneously can write to the same row or produce duplicate rows. No optimistic locking or idempotency keys on `addPayment`.
- **Column order is frozen.** `Master_Data` column indices are hardcoded constants. Schema changes require careful migration.
- **`getLastColumn()` call count.** Several handlers call `sheet.getLastColumn()` and `sheet.getLastRow()` multiple times, incurring extra Sheets API round-trips.

### 8.2 Authentication
- **Tokens are long-lived static strings** — no expiry, no rotation mechanism. A compromised token is valid indefinitely until manually deleted from Script Properties.
- **Token passed as a query parameter on GET requests** — appears in server logs, browser history, and referrer headers.
- **No MFA, no session invalidation.**
- **`localStorage` token storage** — vulnerable to XSS if any third-party script is ever introduced.

### 8.3 API Design
- **Apps Script has a 6-minute execution time limit.** A slow broadcast to 100 recipients (120ms/message = 12s + Chatwoot overhead) could approach limits if Chatwoot is slow.
- **No versioning.** The single web app URL is the only endpoint. Breaking changes require all clients to update simultaneously.
- **GET requests carry the token as a URL query param** — visible in browser address bar and server logs.
- **No pagination cursor / offset** on `getStudents` — uses a fixed page size.

### 8.4 PWA / Frontend
- **No bundler, no tree-shaking, no minification.** All JS files are loaded individually. No module system (all globals).
- **Global namespace pollution.** All functions and variables are global — naming conflicts are possible as the codebase grows.
- **Service Worker cache is static** — `CACHE_NAME = "ywsh-static-v1"` is hardcoded. Cache busting requires manually incrementing this string.
- **`onboarding.js` not included in Service Worker `STATIC_ASSETS`** — the onboarding module won't be available offline.
- **Offline queue is POST-only.** Offline payment adds are queued, but there is no conflict resolution if the same student is added twice while offline.

### 8.5 External Dependencies
- **Meta WhatsApp API rate limits.** Template messages are rate-limited by Meta. The 120ms sleep is a heuristic, not based on the actual rate limit tier.
- **Chatwoot mirroring is best-effort and synchronous** — runs inside the payment-save request path. If Chatwoot is slow or down, it adds latency to every WA send (wrapped in try/catch, so it won't fail the request, but it adds time).
- **No webhook / inbound message handling.** Replies from students in WhatsApp are not captured in this system.
- **Drive API permission `expirationTime`** — requires the Drive Advanced Service to be enabled. If this service changes or is deprecated, access revocation breaks silently.

### 8.6 Operational
- **Deploying Apps Script requires a manual re-deployment step** after `clasp push`. GitHub Actions only pushes the source; a human must click "Deploy" or the deployment URL stays on the old version.
- **No staging environment.** Any bug goes directly to production.
- **No automated tests.** All testing is manual.
- **Chatwoot, WhatsApp, and Drive credentials are in Script Properties** — no rotation mechanism, no secrets manager.

---

## 9. Summary of All External Services & Credentials Required

| Service | Auth Method | Where Stored |
|---------|------------|--------------|
| Google Sheets (Master DB) | OAuth via Apps Script runtime | Implicit (owner's account) |
| Google Sheets (Batches) | OAuth via Apps Script runtime | Implicit (owner's account) |
| Google Drive API v3 | OAuth via Apps Script Advanced Service | Implicit (owner's account) |
| Meta WhatsApp Business API | Bearer token | Script Property: `WHATSAPP_TOKEN` |
| Chatwoot | User access token | Script Property: `CHATWOOT_API_TOKEN` |
| GitHub Actions (clasp deploy) | `~/.clasprc.json` | GitHub Secret: `CLASPRC_JSON` |

---

*Document generated from source code review of `yogawithsahithi-api` and `yogawithsahithi-pwa` as of commit `dcdf31c` (api) and `8e4fad0` (pwa).*
