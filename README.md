<img src="icons/yws-logo.png" alt="YogaWithSahithi Logo" width="120" />

# YogaWithSahithi — Payment Tracker PWA

Progressive Web App for managing yoga student payments, batch tracking, and WhatsApp communication.

---

## Architecture

```
yogawithsahithi-pwa  (public, GitHub Pages)       yogawithsahithi-api  (private, Apps Script)
┌─────────────────────────────────────┐            ┌──────────────────────────────────────────┐
│  HTML / CSS / Vanilla JS PWA        │  fetch()   │  Google Apps Script Web App              │
│  Hosted: GitHub Pages (free)        │ ────────►  │  Auth → Read/Write Google Sheet          │
│  URL: vishwakhrushi.github.io/      │            │  WhatsApp via Meta Cloud API             │
│       yogawithsahithi-pwa/          │            │  Batch data from Batches spreadsheet     │
└─────────────────────────────────────┘            └──────────────────────────────────────────┘
                                                                    │
                                                                    ▼
                                                   ┌──────────────────────────────────────────┐
                                                   │  Google Sheet — Master_Data              │
                                                   │  Also used by old HtmlService admin UI   │
                                                   └──────────────────────────────────────────┘
```

---

## Repos

| Repo | Visibility | Purpose |
|------|-----------|---------|
| `yogawithsahithi-pwa` | Public | PWA frontend — deployed to GitHub Pages |
| `yogawithsahithi-api` | Private | Apps Script backend — pushed via clasp |

---

## Google Sheet — Master_Data Column Layout

**NEVER change the column order — backward compatible with existing data.**

| Col | Header | Notes |
|-----|--------|-------|
| A | Timestamp | Auto-set on add |
| B | Name | Student name |
| C | Email | |
| D | Country | Left blank for new entries |
| E | Country_Code | Never write — backward compat only |
| F | Whatsapp | Full phone digits with country code |
| G | Phone_normalized | Same as Whatsapp (digits only) |
| H | Course | Course code (see valid codes below) |
| I | Amount | INR |
| J | Payment Date | DD/MM/YYYY |
| K | Payment Account | |
| L | Transaction ID | |
| M | Remarks | Auto-updated with WA send timestamps |
| N | Updated_At | |
| O | Updated_By | |
| P | Update_Notes | |

Computed cols Q–AA (live course session tracking): course_code, plan_months, schedule_type, sessions_per_month, entitled_sessions, used_sessions, remaining_sessions, subscription_status, pause_start, pause_end, batch_id

---

## Valid Course Codes

| Code | Description | Session Tracking |
|------|-------------|-----------------|
| EV1-1M / EV1-3M | Evening Batch 1 (Mon–Thu) | Yes |
| EV2-1M / EV2-3M | Evening Batch 2 (Mon–Thu) | Yes |
| MOR-1M / MOR-3M | Morning Batch (Mon–Fri) | Yes |
| PRE-1M / PRE-3M | Prenatal | Yes |
| REC-1M / REC-3M | Recording | No |
| DIET-1M / DIET-3M | Diet | No |
| FACEYOGA | Face Yoga | No |
| BACKPAIN | Back Pain | No |
| OTHER | Other | No |
| REFUND | Refund entry | No |

---

## Valid Payment Accounts

`Playeven` · `Sahithi` · `ArunaLatha` · `Vishwak` · `YogaWithSahithi`

---

## Role-Based Access

| Capability | VIEW_ONLY | STAFF | MANAGER | ADMIN |
|---|:---:|:---:|:---:|:---:|
| View payments & students | ✓ | ✓ | ✓ | ✓ |
| Search / filter | ✓ | ✓ | ✓ | ✓ |
| Add new payment | | ✓ | ✓ | ✓ |
| Edit own entries (phone, email, remarks) | | ✓ | ✓ | ✓ |
| View dashboard (revenue charts) | | | ✓ | ✓ |
| WhatsApp (individual + broadcast) | | | ✓ | ✓ |
| Edit any entry (all fields) | | | ✓ | ✓ |
| Process refunds | | | ✓ | ✓ |
| CSV export | | | ✓ | ✓ |
| View audit log | | | ✓ | ✓ |
| Manage users | | | | ✓ |

Roles are stored in Apps Script → Script Properties → `AUTH_TOKENS`:
```json
{
  "token_string": { "email": "user@example.com", "role": "ADMIN" }
}
```

---

## Phone Number Handling

- Team pastes phone number directly from WhatsApp contact screen (any format)
- UI strips all non-digits: spaces, dashes, +, brackets
- Backend stores digits-only in **both** col F (Whatsapp) and col G (Phone_normalized)
- Validation: 8–15 digits
- 10-digit numbers are auto-prefixed with `91` (India) for WhatsApp sends

---

## WhatsApp Integration — Meta Cloud API

### Approved Templates

| Template | Used For | Params |
|----------|----------|--------|
| `yws_batch_onboarding_v1` | New student onboarding (EV1, EV2, MOR batches) | name, batch_name, class_time, start_date, class_days, zoom_link, meeting_id, passcode, recordings_link + diet form button |
| `yws_prenatal_batch_onboarding_v1` | Prenatal onboarding | Same 9 params, no button |
| `yws_weekly_zoom_reminder_v1` | Weekly class reminder | name, batch_name, class_time, class_days, zoom_link, meeting_id, passcode |

### Auto-Send on Payment

When a payment is added for `EV1-1M`, `EV1-3M`, `EV2-1M`, `EV2-3M`, `MOR-1M`, `MOR-3M`:
1. Backend extracts course prefix (EV1 / EV2 / MOR)
2. Looks up active batch in Batches spreadsheet where `Batch_ID` ends with `-EV1` / `-EV2` / `-MOR`
3. Sends `yws_batch_onboarding_v1` with batch details auto-filled
4. Logs result to `WhatsApp_Log` sheet and appends note to Remarks column

### Batch_ID Format
```
YWS-YYYYMMDD-EV1
YWS-YYYYMMDD-EV2
YWS-YYYYMMDD-MOR
```

### Batches Spreadsheet Columns Used
`Batch Type (Morning/Evening)` · `Start Date` · `Class Days` · `Class Time` · `Zoom Link` · `Meeting ID` · `Passcode` · `Recordings Folder Link` · `Diet Form Link` · `Status` · `Batch_ID`

---

## Deployment

### PWA (GitHub Pages)
1. Push to `main` → GitHub Pages auto-deploys
2. Live at: `https://vishwakhrushi.github.io/yogawithsahithi-pwa/`

### API (Apps Script)
1. Push to `main` in `yogawithsahithi-api` → clasp auto-pushes to Apps Script editor
2. In Apps Script: **Deploy → Manage deployments → Edit → New version → Deploy**
3. Web App URL stays the same after redeployment — no PWA changes needed

### Script Properties Required

| Property | Description |
|----------|-------------|
| `SHEET_ID` | Master_Data spreadsheet ID |
| `BATCHES_SHEET_ID` | Batches spreadsheet ID |
| `AUTH_TOKENS` | JSON map of tokens → { email, role } |
| `WHATSAPP_TOKEN` | Meta Cloud API bearer token |
| `WHATSAPP_PHONE_ID` | WhatsApp Business phone number ID |
| `ONBOARDING_HEADER_IMAGE` | Public image URL for WhatsApp template header |

---

## Local Development

```bash
# Clone PWA
git clone https://github.com/vishwakhrushi/yogawithsahithi-pwa.git

# Clone API (private)
git clone https://github.com/vishwakhrushi/yogawithsahithi-api.git

# Push API changes to Apps Script
cd yogawithsahithi-api
clasp login
clasp push
```
