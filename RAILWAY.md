# Deploying dock-audit to Railway

This is the "Monday morning, get it working" cheat sheet. If something here
seems wrong, the authoritative answers are in `nixpacks.toml` and
`server/config.js`.

## Why the previous attempt timed out

`puppeteer@22` downloads ~300MB of Chromium during `npm install`.
Railway's build fetches it fresh every deploy — it never finished.

Fix is already committed:

- `nixpacks.toml` — installs Chromium via nix and sets
  `PUPPETEER_SKIP_DOWNLOAD=true` so the npm download is skipped.
- `server/routes/pdf.js` — honors `PUPPETEER_EXECUTABLE_PATH` at runtime.

Local dev still works unchanged — puppeteer downloads its bundled Chromium
the normal way.

## One-time setup on Railway

1. **Service**
   - New project → Deploy from GitHub repo.
   - Nixpacks will detect `nixpacks.toml` automatically.

2. **Volume** (system of record — do NOT skip)
   - Add a volume to the service.
   - Mount path: `/data`
   - Size: 1GB is plenty; bump later if PDFs pile up.

3. **Environment variables**

   ```
   DB_PATH=/data/dock_audit.db
   UPLOAD_DIR=/data/uploads
   PDF_DIR=/data/pdfs
   NODE_ENV=production
   ```

   Optional (leave off for first boot, enable after the app is up):

   ```
   SHEETS_ENABLED=true
   GOOGLE_SERVICE_ACCOUNT_KEY=/data/google-service-account.json
   EMAIL_ENABLED=true
   SMTP_HOST=smtp.sendgrid.net
   SMTP_USER=apikey
   SMTP_PASS=<sendgrid key>
   ```

   Do NOT set `PORT` manually — Railway injects it and `server/config.js`
   reads `process.env.PORT`.

   Do NOT set `PUPPETEER_SKIP_DOWNLOAD` or `PUPPETEER_EXECUTABLE_PATH`
   manually — `nixpacks.toml` handles them.

4. **Upload the Google service account JSON** (if using Sheets)
   - Easiest path: `railway run bash` into the running service, then
     `cat > /data/google-service-account.json` and paste the key.
   - Alt: commit an encrypted copy and decrypt on boot. More work,
     probably not worth it for an internal tool.

## Verifying the deploy

After the first successful build:

- Hit `/` — Molly's UI loads.
- Submit a test audit → PDF downloads → `ls /data/pdfs` in Railway shell
  shows the file.
- Redeploy the service → audit history is still there, PDF still
  downloads. This proves the volume is doing its job.

## If it still times out

Capture the full build log (don't just note "it timed out") and grep for:

- `"puppeteer"` → means `PUPPETEER_SKIP_DOWNLOAD` isn't being applied;
  check that `nixpacks.toml` landed in the deploy.
- `"out of memory"` → bump the builder plan; `better-sqlite3` compiles
  from source and occasionally OOMs on small builders.
- Nothing obvious → paste the log in here and I'll look.
