// sheets.js — writes inbound audit results to the Open PO Google Sheet
// Matches on PO number in column C, writes to confirmed columns

const { google } = require('googleapis');
const config = require('./config');
const dayjs = require('dayjs');

// ─── Auth ─────────────────────────────────────────────────────────────────

function getAuth() {
  // Service account JSON key — set GOOGLE_SERVICE_ACCOUNT_KEY env var to path
  // OR paste the JSON directly as GOOGLE_SERVICE_ACCOUNT_JSON env var
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    return new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }

  // Fall back to key file
  return new google.auth.GoogleAuth({
    keyFile: config.SHEETS.service_account_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

// ─── Column letter → index (0-based) ──────────────────────────────────────
// Handles multi-letter columns: A=0, Z=25, AA=26, AZ=51, BB=53, BE=56

function colToIndex(col) {
  col = col.toUpperCase();
  let n = 0;
  for (let i = 0; i < col.length; i++) {
    n = n * 26 + (col.charCodeAt(i) - 64);
  }
  return n - 1; // 0-based
}

// ─── Find the row for a given PO number ───────────────────────────────────

async function findPORow(sheets, poNumber) {
  const { spreadsheet_id, tab_name, columns } = config.SHEETS;

  // Read the entire PO column to find our row
  const range = `'${tab_name}'!${columns.po_number}:${columns.po_number}`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheet_id,
    range,
  });

  const values = res.data.values || [];
  const poStr = String(poNumber).trim();

  // Search for exact match (PO numbers can be strings or numbers in sheet)
  for (let i = 0; i < values.length; i++) {
    const cell = String(values[i][0] || '').trim();
    if (cell === poStr || cell === `PO-${poStr}` || cell.endsWith(poStr)) {
      return i + 1; // 1-based row number
    }
  }

  return null; // PO not found
}

// ─── Write a single cell ──────────────────────────────────────────────────

async function writeCell(sheets, row, col, value) {
  const { spreadsheet_id, tab_name } = config.SHEETS;
  const range = `'${tab_name}'!${col}${row}`;

  await sheets.spreadsheets.values.update({
    spreadsheetId: spreadsheet_id,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[value]] },
  });
}

// ─── Main export: writeToSheet ────────────────────────────────────────────

async function writeToSheet(audit, lineItems) {
  if (!config.SHEETS.enabled) {
    console.log('ℹ️  Sheets integration disabled — skipping write');
    return { skipped: true };
  }

  if (!audit.po_number) {
    console.warn('⚠️  No PO number on audit — cannot write to sheet');
    return { error: 'No PO number' };
  }

  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const { columns } = config.SHEETS;

    // Find the row for this PO
    const row = await findPORow(sheets, audit.po_number);
    if (!row) {
      console.warn(`⚠️  PO #${audit.po_number} not found in sheet`);
      return { error: `PO #${audit.po_number} not found in sheet` };
    }

    console.log(`📊 Writing audit results to sheet row ${row} (PO #${audit.po_number})`);

    const writes = [];

    // Column S — Actual Date Received
    if (audit.submitted_at) {
      const dateStr = dayjs(audit.submitted_at).format('M/D/YYYY');
      writes.push(writeCell(sheets, row, columns.actual_date_received, dateStr));
    }

    // Column AZ — Quality Score [1-3]
    if (audit.quality_score) {
      writes.push(writeCell(sheets, row, columns.quality_score, audit.quality_score));
    }

    // Column BB — Docs Score [1-3]
    // Post placeholder: 3 if all docs present, 2 if any missing (Stephen updates later)
    if (audit.packing_list_received !== null || audit.coa_received !== null) {
      const allPresent = audit.packing_list_received && audit.coa_received;
      const docsScore = allPresent ? 3 : 2; // 2 = placeholder; Stephen updates to 1 or 3
      writes.push(writeCell(sheets, row, columns.docs_score, docsScore));
    }

    // Column BE — Notes (append, don't overwrite)
    if (audit.has_discrepancy || !audit.coa_received || !audit.packing_list_received) {
      const parts = [];

      if (audit.has_discrepancy) {
        parts.push(`[Dock Audit ${dayjs(audit.submitted_at).format('M/D')}] Discrepancies flagged — see audit record`);
      }

      if (audit.packing_list_received === false) {
        parts.push('Packing list missing at delivery');
      }

      if (audit.coa_received === false) {
        parts.push('COA missing at delivery');
      }

      if (!audit.temp_in_range && audit.is_refrigerated) {
        parts.push(`Temp exceedance: ${audit.truck_temp_f}°F`);
      }

      if (parts.length > 0) {
        // Read existing notes first so we append, not overwrite
        try {
          const existing = await sheets.spreadsheets.values.get({
            spreadsheetId: config.SHEETS.spreadsheet_id,
            range: `'${config.SHEETS.tab_name}'!${columns.notes}${row}`,
          });
          const existingNote = (existing.data.values?.[0]?.[0] || '').trim();
          const newNote = existingNote
            ? `${existingNote}\n${parts.join(' | ')}`
            : parts.join(' | ');
          writes.push(writeCell(sheets, row, columns.notes, newNote));
        } catch {
          writes.push(writeCell(sheets, row, columns.notes, parts.join(' | ')));
        }
      }
    }

    await Promise.all(writes);

    console.log(`✅ Sheet updated: PO #${audit.po_number}, row ${row}`);
    return { success: true, row };

  } catch (err) {
    console.error('❌ Sheets write error:', err.message);
    return { error: err.message };
  }
}

// ─── Read open POs for the audit form dropdown ────────────────────────────
// Returns POs that are open (no actual date received) due within ±3 days

async function getOpenPOs() {
  if (!config.SHEETS.enabled) return [];

  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const { spreadsheet_id, tab_name, columns } = config.SHEETS;

    // Read PO#, Supplier, Due Date, Actual Date columns
    const colLetters = [
      columns.po_number,
      columns.supplier,
      columns.requested_due_date,
      columns.actual_date_received,
    ];

    // Get the full range from first to last needed column
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheet_id,
      range: `'${tab_name}'!A:BE`,
    });

    const rows = res.data.values || [];
    if (rows.length < 2) return [];

    // Header row to find column indices
    const header = rows[0];
    const poIdx    = colToIndex(columns.po_number);
    const suppIdx  = colToIndex(columns.supplier);
    const dueIdx   = colToIndex(columns.requested_due_date);
    const recvIdx  = colToIndex(columns.actual_date_received);

    const today = dayjs();
    const windowStart = today.subtract(3, 'day');
    const windowEnd   = today.add(7, 'day');

    const openPOs = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const po       = String(row[poIdx] || '').trim();
      const supplier = String(row[suppIdx] || '').trim();
      const dueRaw   = String(row[dueIdx] || '').trim();
      const received = String(row[recvIdx] || '').trim();

      // Skip if no PO number, already received, or no due date
      if (!po || received || !dueRaw) continue;

      // Parse due date (handles M/D/YYYY and YYYY-MM-DD)
      const due = dayjs(dueRaw, ['M/D/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']);
      if (!due.isValid()) continue;

      // Include if due within window
      if (due.isAfter(windowStart) && due.isBefore(windowEnd)) {
        openPOs.push({
          po_number: po,
          supplier,
          due_date: due.format('YYYY-MM-DD'),
          due_date_display: due.format('MMM D'),
          days_until: due.diff(today, 'day'),
        });
      }
    }

    // Sort by due date
    openPOs.sort((a, b) => a.days_until - b.days_until);
    return openPOs;

  } catch (err) {
    console.error('❌ Could not read open POs from sheet:', err.message);
    return [];
  }
}

// ─── Append a row to the typed Audit Log tabs ────────────────────────────────
// Inbound audits → INBOUND_LOG_TAB (default "Inbound Log")
// Outbound audits → OUTBOUND_LOG_TAB (default "Outbound Log")
// Each tab is auto-created with its own header row on first write.

const INBOUND_HEADERS = [
  'Submitted At', 'Auditor', 'PO #', 'Supplier', 'Item(s)',
  'Qty Expected', 'Qty Received', 'Load Type', 'Temp (°F)',
  'Quality Score', 'Has Discrepancy', 'Notes',
];

const OUTBOUND_HEADERS = [
  'Submitted At', 'Auditor', 'Customer', 'SO #', 'PO #',
  'Carrier', 'Trailer #', 'Seal #', 'Load Type', 'Truck Temp (°F)',
  'SKU(s)', 'Qty Ordered', 'Qty Shipped',
  'Quality Score', 'Discrepancy', 'Notes',
];

async function appendAuditRow(audit, lineItems = []) {
  if (!config.SHEETS.enabled) {
    console.log('ℹ️  Sheets disabled — skipping audit log append');
    return { skipped: true };
  }

  const sheetId = process.env.AUDIT_LOG_SHEET_ID;
  if (!sheetId) {
    console.warn('⚠️  AUDIT_LOG_SHEET_ID not set — skipping audit log append');
    return { error: 'AUDIT_LOG_SHEET_ID not configured' };
  }

  const isOutbound = (audit.type || '').toLowerCase() === 'outbound';
  const tabName    = isOutbound
    ? (process.env.OUTBOUND_LOG_TAB || 'Outbound Log')
    : (process.env.INBOUND_LOG_TAB  || 'Inbound Log');
  const headers    = isOutbound ? OUTBOUND_HEADERS : INBOUND_HEADERS;

  try {
    const auth   = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    // Auto-create headers if this tab has never been written to
    const check = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `'${tabName}'!A1`,
    });
    if (!check.data.values || !check.data.values[0]?.[0]) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `'${tabName}'!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [headers] },
      });
      console.log(`📊 ${tabName} headers written`);
    }

    // ── Shared helpers ──────────────────────────────────────────────────────
    const qualityLabels = { 1: 'Fail', 2: 'Pass w/ Issues', 3: 'Pass' };
    const submittedAt   = dayjs(audit.submitted_at || undefined).format('M/D/YYYY h:mm A');
    const loadType      = audit.load_type || (audit.is_refrigerated ? 'Refrigerated' : 'Ambient');
    const temp          = audit.truck_temp_f != null ? audit.truck_temp_f : '—';
    const qualScore     = qualityLabels[audit.quality_score] || '—';
    const discrepancy   = audit.has_discrepancy ? 'Yes' : 'No';
    const notes         = audit.notes || '';

    // Build item / qty strings — join multiple line items with " | "
    const itemNames  = lineItems.length > 0
      ? lineItems.map(li => li.item_name || '—').join(' | ')
      : (audit.item_name || '—');
    const qtyExp     = lineItems.length > 0
      ? lineItems.map(li => li.expected_qty ?? '—').join(' | ')
      : (audit.qty_expected != null ? audit.qty_expected : '—');
    const qtyAct     = lineItems.length > 0
      ? lineItems.map(li => li.actual_qty ?? '—').join(' | ')
      : (audit.qty_received != null ? audit.qty_received : '—');
    // Outbound SKUs: prefer part_number, fall back to item_name
    const skus       = lineItems.length > 0
      ? lineItems.map(li => li.part_number || li.item_name || '—').join(' | ')
      : (audit.item_name || '—');

    // ── Build the row ───────────────────────────────────────────────────────
    const row = isOutbound ? [
      submittedAt,
      audit.auditor_name    || '—',
      audit.customer        || '—',
      audit.so_number       || '—',
      audit.po_number       || '—',
      audit.carrier         || '—',
      audit.trailer_number  || '—',
      audit.seal_number     || '—',
      loadType,
      temp,
      skus,
      qtyExp,
      qtyAct,
      qualScore,
      discrepancy,
      notes,
    ] : [
      submittedAt,
      audit.auditor_name    || '—',
      audit.po_number       || '—',
      audit.supplier        || '—',
      itemNames,
      qtyExp,
      qtyAct,
      loadType,
      temp,
      qualScore,
      discrepancy,
      notes,
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `'${tabName}'!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });

    console.log(`✅ ${tabName} row appended (${audit.audit_type_name || audit.type} — ${audit.po_number || audit.so_number || 'no ref'})`);
    return { success: true };
  } catch (err) {
    console.error('❌ Audit log append error:', err.message);
    return { error: err.message };
  }
}

module.exports = { writeToSheet, getOpenPOs, appendAuditRow };
