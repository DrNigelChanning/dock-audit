# THS Dock Audit — Setup Guide
Last updated: April 3, 2026

---

## Getting running in 10 minutes (local, Monday morning)

### Step 1 — Copy files to your machine

The project is at `/home/claude/dock-audit/`. Copy the entire folder to your Windows machine.
Suggested location: `C:\Users\Phil Kosakowski\Projects\dock-audit\`

### Step 2 — Install Node.js (if not already installed)

Download from https://nodejs.org — use the LTS version (v20 or v22).

### Step 3 — Install dependencies

Open a terminal in the `dock-audit` folder:

```bash
npm install
```

This will take 2–3 minutes the first time (Puppeteer downloads Chromium for PDF generation).

### Step 4 — Start the server

```bash
node server/index.js
```

You should see:
```
✅ Database ready at ./data/dock_audit.db
🚢 THS Dock Audit
   Running at http://localhost:3001
   Sheets integration: ⚠️  OFF (configure columns first)
   Email alerts: ⚠️  OFF
```

### Step 5 — Open on tablet

On the same WiFi network, find your computer's local IP:
- Open Command Prompt → type `ipconfig`
- Look for "IPv4 Address" under your active network adapter
- Example: `192.168.1.45`

On the tablet browser, go to: `http://192.168.1.45:3001`

That's it. Molly can start auditing.

---

## Enabling Google Sheets integration (write-back to Open PO sheet)

This requires a Google Service Account with access to the spreadsheet.

### Step 1 — Create a Service Account

1. Go to https://console.cloud.google.com
2. Create a new project (or use an existing one)
3. Enable the **Google Sheets API**
4. Go to IAM & Admin → Service Accounts → Create Service Account
5. Give it a name: `dock-audit-service`
6. Download the JSON key file → save as `dock-audit/config/google-service-account.json`

### Step 2 — Share the spreadsheet with the service account

1. Open the service account JSON file
2. Copy the `client_email` field (looks like `dock-audit-service@project.iam.gserviceaccount.com`)
3. Open the Open PO Google Sheet
4. Share it with that email address (Editor access)

### Step 3 — Enable in config

Create a `.env` file in the dock-audit folder:

```
SHEETS_ENABLED=true
GOOGLE_SERVICE_ACCOUNT_KEY=./config/google-service-account.json
```

Or set environment variables directly:
```bash
set SHEETS_ENABLED=true
set GOOGLE_SERVICE_ACCOUNT_KEY=./config/google-service-account.json
node server/index.js
```

### What it writes (confirmed columns, April 3 2026)

| Column | What it writes |
|--------|---------------|
| S — Actual Date Received | Date audit was submitted |
| AZ — Quality Score | 1/2/3 derived from condition findings |
| BB — Docs Score | 3 if all docs present; 2 placeholder if missing |
| BE — Notes | Appends discrepancy/flag summary if any flags |

The Shipment Accuracy score (auto-calculated in the sheet) will update automatically once column S is populated — no change needed to existing formulas.

---

## Enabling email alerts

Email alerts notify Stephen (inbound flags) or Ben (outbound flags) within 5 minutes of a flagged audit.

Add to your `.env` file:

```
EMAIL_ENABLED=true
SMTP_HOST=smtp.sendgrid.net
SMTP_USER=apikey
SMTP_PASS=your_sendgrid_api_key
INBOUND_FLAGS_EMAIL=stephen@thehoneststand.com
OUTBOUND_FLAGS_EMAIL=ben@thehoneststand.com
CC_EMAIL=phil@thehoneststand.com
```

For Monday, email is not required — flags are visible in the audit history immediately.

---

## Adding team members

Molly (Receiving Manager) is already seeded. To add more:

Option A — Edit the schema before first run:
Edit `server/db/schema.sql`, add a row to the INSERT block.

Option B — Direct API call after server is running:
```bash
curl -X POST http://localhost:3001/api/team \
  -H "Content-Type: application/json" \
  -d '{"name":"New Person","role":"Receiving","location":"Monarch"}'
```

---

## PDF reports

PDFs are generated automatically when an audit is submitted.
They're stored in `dock-audit/data/pdfs/` with meaningful names:
- Inbound: `RECV_PO4422_BigSky-Produce_2026-04-07.pdf`
- Outbound: `SHIP_SO1234_Costco_2026-04-07.pdf`

To access from the app: tap "Download PDF Report" on any submitted audit.
To access from your computer: browse to the `data/pdfs/` folder directly.

---

## Deploying to the cloud (after Monday)

Recommended: Railway (https://railway.app) — free tier, simple Node.js deploy.

1. Push the project to GitHub
2. Connect Railway to the repo
3. Set environment variables in Railway dashboard
4. Railway auto-deploys on push

The tablet can then hit the Railway URL from anywhere, not just local WiFi.

---

## Troubleshooting

**"Cannot find module 'better-sqlite3'"**
Run `npm install` again. If it fails, try `npm install --build-from-source`.

**Tablet can't reach the server**
- Make sure tablet and computer are on the same WiFi
- Check Windows Firewall isn't blocking port 3001
- Try: Windows Defender Firewall → Allow an app → add Node.js

**PDF generation fails**
Puppeteer downloads Chromium on first install — can take a few minutes.
If it times out: `npx puppeteer browsers install chrome`

**Sheets write not working**
- Confirm `SHEETS_ENABLED=true` in environment
- Confirm service account email has Editor access to the spreadsheet
- Check server logs for the specific error message
