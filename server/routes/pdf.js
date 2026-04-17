const path = require('path');
const fs = require('fs');
const config = require('../config');
const dayjs = require('dayjs');
const express = require('express');
const router = express.Router();
const getDB = require('../db'); // The Promise-based DB

const PDF_DIR = path.resolve(config.PDF.output_dir);
const UPLOAD_DIR = path.resolve(config.UPLOAD_DIR);

// NEW: Helper to convert image to Base64 (The most reliable way for Puppeteer)
function getBase64Image(webPath) {
  if (!webPath) return null;
  try {
    const filename = path.basename(webPath);
    const fullPath = path.join(UPLOAD_DIR, filename);
    if (!fs.existsSync(fullPath)) return null;
    
    const bitmap = fs.readFileSync(fullPath);
    const ext = path.extname(filename).replace('.', '');
    return `data:image/${ext};base64,${bitmap.toString('base64')}`;
  } catch (e) {
    console.error('Image encoding error:', e);
    return null;
  }
}

async function generatePDF(audit, filename) {
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch (e) {
    console.warn('Puppeteer not available');
    return null;
  }

  const html = buildHTML(audit);
  const outputPath = path.join(PDF_DIR, filename);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files']
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    // CRITICAL: printBackground: true must be here to show the blue header
    await page.pdf({
      path: outputPath,
      format: 'Letter',
      margin: { top: '0in', bottom: '0.4in', left: '0in', right: '0in' }, 
      printBackground: true 
    });
    console.log(`✅ PDF generated: ${filename}`);
    return outputPath;
  } finally {
    await browser.close();
  }
}

function buildHTML(audit) {
  const { lineItems = [], discrepancies = [] } = audit;
  const typeName = (audit.audit_type_name || audit.type || '').toLowerCase();
  const isInbound  = typeName.includes('inbound');
  const isOutbound = typeName.includes('outbound');
  const isCasePack = typeName.includes('case');
  const auditTitle = audit.audit_type_name
    ? `${audit.audit_type_name} Audit`
    : isInbound ? 'Inbound Receiving Audit' : isOutbound ? 'Outbound Shipping Audit' : 'Dock Audit';
  const refLabel = isOutbound ? 'SO NUMBER' : 'PO NUMBER';
  const refValue = isOutbound ? (audit.so_number || audit.po_number || '—') : (audit.po_number || audit.so_number || '—');
  const itemsLabel = isOutbound ? 'ITEMS LOADED' : isInbound ? 'ITEMS RECEIVED' : 'ITEMS INSPECTED';
  const dateStr = dayjs(audit.audit_date).format('MMMM D, YYYY');
  const timeStr = dayjs(audit.submitted_at || audit.audit_date).format('h:mm A');

  // --- Score Labels (CSS dots instead of emoji — Puppeteer can't render emoji on Linux) ---
  const dot = (color) => `<span style="display:inline-block;width:10px;height:10px;background:${color};border-radius:50%;vertical-align:middle;margin-right:5px;"></span>`;
  const qualityLabel = {
    1: `${dot('#dc2626')}Red — Action Required`,
    2: `${dot('#ca8a04')}Yellow — Needs Attention`,
    3: `${dot('#16a34a')}Green — Meets Expectations`
  };

  // --- Photo Section Logic ---
  // Scan question_answers for any photo-type answers (file paths starting with /uploads/)
  const questionAnswers = (() => {
    try { return audit.question_answers ? JSON.parse(audit.question_answers) : {}; }
    catch (e) { return {}; }
  })();
  const photoQuestions = audit.photoQuestions || [];

  // Build photos from question_answers using photo-type question labels
  const seenPaths = new Set();
  const photos = photoQuestions
    .map(q => {
      const val = questionAnswers[q.id];
      if (!val || typeof val !== 'string') return null;
      // Normalize: could be a path like /uploads/foo.jpg or just a filename
      const src = getBase64Image(val);
      if (!src || seenPaths.has(val)) return null;
      seenPaths.add(val);
      return { label: q.question, src };
    })
    .filter(Boolean);

  const photoHtml = photos.length > 0 ? `
    <div style="page-break-before: always; padding: 40px;">
      <h3 style="font-size:14px; font-weight:700; color:#1e3a5f; text-transform:uppercase; border-bottom:2px solid #1e3a5f; padding-bottom:10px; margin-bottom:20px;">Audit Photo Documentation</h3>
      <table style="width:100%; border-spacing: 20px; border-collapse: separate; margin-left: -20px;">
        ${photos.reduce((acc, curr, i) => {
          if (i % 2 === 0) acc.push([curr]);
          else acc[acc.length - 1].push(curr);
          return acc;
        }, []).map(row => `
          <tr>
            ${row.map(p => `
              <td style="width: 50%; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 15px; text-align: center; vertical-align: top;">
                <img src="${p.src}" style="width: 100%; height: 300px; object-fit: contain; border-radius: 8px; background: white; border: 1px solid #d1d5db;" />
                <div style="font-size: 11px; font-weight: bold; color: #4b5563; text-transform: uppercase; margin-top: 15px;">${p.label}</div>
              </td>
            `).join('')}
            ${row.length === 1 ? '<td style="width: 50%;"></td>' : ''}
          </tr>`).join('')}
      </table>
    </div>` : '';

  return `<!DOCTYPE html>
<html>
<head>
  <style>
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Helvetica', Arial, sans-serif; font-size: 13px; color: #111827; background: white; }
    .header { background: #1e3a5f !important; color: white; padding: 32px 40px; }
    .content { padding: 32px 40px; }
    .summary-grid { width: 100%; border-collapse: separate; border-spacing: 12px; margin-left: -12px; margin-bottom: 24px; }
    .card { background: #f9fafb !important; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; }
    .label { font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase; margin-bottom: 4px; }
    .value { font-size: 15px; font-weight: 700; }
    .items-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    .items-table th { background: #1e3a5f !important; color: white; padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; }
    .items-table td { padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <table style="width: 100%; color: white;">
      <tr>
        <td>
          <div style="font-size: 11px; opacity: 0.7; letter-spacing: 1px; text-transform: uppercase;">THE HONEST STAND / BOLDER FOODS</div>
          <div style="font-size: 24px; font-weight: 700;">${auditTitle}</div>
          <div style="font-size: 13px; opacity: 0.85; margin-top: 4px;">${dateStr} &nbsp;·&nbsp; ${timeStr}</div>
        </td>
        <td style="text-align: right; vertical-align: middle;">
          <div style="font-size: 11px; opacity: 0.7;">${refLabel}</div>
          <div style="font-size: 22px; font-weight: 700;">#${refValue}</div>
        </td>
      </tr>
    </table>
  </div>

  <div class="content">
    <div style="background:${audit.has_discrepancy ? '#fee2e2' : '#dcfce7'} !important; border-left: 4px solid ${audit.has_discrepancy ? '#dc2626' : '#16a34a'}; padding: 12px 16px; margin-bottom: 24px; border-radius: 4px;">
      <div style="font-weight: 700; color: ${audit.has_discrepancy ? '#dc2626' : '#15803d'}; font-size: 14px;">
        ${audit.has_discrepancy ? 'DISCREPANCIES FOUND' : 'CLEAN AUDIT — No Discrepancies'}
      </div>
    </div>

    <table class="summary-grid">
      <tr>
        <td class="card"><div class="label">SUPPLIER</div><div class="value">${audit.supplier || '—'}</div></td>
        <td class="card"><div class="label">CARRIER</div><div class="value">${audit.carrier || '—'}</div></td>
        <td class="card"><div class="label">LOCATION</div><div class="value">${audit.location || '—'}</div></td>
      </tr>
      <tr>
        <td class="card"><div class="label">TRAILER #</div><div class="value">${audit.trailer_number || '—'}</div></td>
        <td class="card"><div class="label">SEAL #</div><div class="value">${audit.seal_number || '—'}</div></td>
        <td class="card"><div class="label">AUDITOR</div><div class="value">${audit.auditor_name || '—'}</div></td>
      </tr>
    </table>

    ${audit.is_refrigerated ? `
    <div style="background:${audit.temp_in_range ? '#f0fdf4' : '#fef2f2'} !important; border-radius: 8px; padding: 16px; margin-bottom: 24px; border: 1px solid ${audit.temp_in_range ? '#bcf0da' : '#fecaca'}">
      <div style="font-weight:700; font-size:13px; color:${audit.temp_in_range ? '#15803d' : '#dc2626'}; margin-bottom:4px">
        Temp Check — ${audit.temp_in_range ? 'IN RANGE' : 'OUT OF RANGE'}
      </div>
      <div style="font-size:13px"><strong>Truck interior temp:</strong> ${audit.truck_temp_f ?? '—'}°F</div>
    </div>` : ''}

    <h3 style="font-size:12px; font-weight:700; color:#374151; text-transform:uppercase; margin-bottom:12px; letter-spacing:0.5px;">${itemsLabel}</h3>
    <table class="items-table">
      <thead>
        <tr><th>Item</th><th>Expected</th><th>Actual</th><th>Variance</th><th>Lot Code</th><th>Condition</th></tr>
      </thead>
      <tbody>
        ${lineItems.map(li => `
          <tr>
            <td>${li.item_name}</td>
            <td>${li.expected_qty}</td>
            <td>${li.actual_qty}</td>
            <td style="font-weight:700; color:${Math.abs(li.qty_variance_pct || 0) > 0.05 ? '#d97706' : '#16a34a'}">${li.qty_variance_pct ? (li.qty_variance_pct * 100).toFixed(1) + '%' : '0.0%'}</td>
            <td>${li.lot_code || '—'}</td>
            <td>${li.condition || '—'}</td>
          </tr>`).join('')}
      </tbody>
    </table>

    <div style="display:flex; gap:24px; margin-bottom:30px">
      <div style="flex:1">
        <h3 style="font-size:11px; font-weight:700; color:#6b7280; text-transform:uppercase; margin-bottom:10px">SCORECARD IMPACT</h3>
        <div style="background:#f9fafb !important; padding:12px; border-radius:8px; border:1px solid #e5e7eb">
          <div style="font-size:11px; color:#6b7280; margin-bottom:4px">QUALITY/CONDITION</div>
          <div style="font-weight:700">${qualityLabel[audit.quality_score || audit.qualityScore] || `${dot('#16a34a')}Green — Meets Expectations`}</div>
        </div>
      </div>
      <div style="flex:1">
        <h3 style="font-size:11px; font-weight:700; color:#6b7280; text-transform:uppercase; margin-bottom:10px">DOCUMENTATION</h3>
        <table style="width:100%; font-size:12px">
          <tr>
            <td style="padding-bottom:5px">Packing List</td>
            <td style="text-align:right; font-weight:700; padding-bottom:5px; color:${audit.packing_list_received ? '#15803d' : '#dc2626'}">${audit.packing_list_received ? 'YES' : 'NO'}</td>
          </tr>
          <tr>
            <td>COA Received</td>
            <td style="text-align:right; font-weight:700; color:${audit.coa_received ? '#15803d' : '#dc2626'}">${audit.coa_received ? 'YES' : 'NO'}</td>
          </tr>
        </table>
      </div>
    </div>

    ${audit.notes ? `<div style="margin-top:20px"><div class="label">NOTES</div><div style="background:#f9fafb !important; padding:12px; border-radius:8px; border:1px solid #e5e7eb; font-size:12px">${audit.notes}</div></div>` : ''}

    <div style="margin-top:40px; padding-top:16px; border-top:1px solid #e5e7eb; font-size:10px; color:#9ca3af; display:flex; justify-content:space-between">
      <span>The Honest Stand / Bolder Foods Dock Audit System</span>
      <span>Audit ID: ${audit.id}</span>
    </div>

    ${photoHtml}
  </div>
</body>
</html>`;
}
// ─── PDF Router ───
router.get('/:id', async (req, res) => {
  try {
    const db = await getDB;
    const audit = db.prepare('SELECT * FROM audits WHERE id = ?').get(req.params.id);
    if (!audit) return res.status(404).json({ error: 'Audit not found' });

    // Use the stored filename, or generate a proper one if it's missing
    let filename = audit.pdf_filename;
    if (!filename) {
        const dateStr = dayjs(audit.audit_date).format('YYYY-MM-DD');
        const prefix = audit.type === 'inbound' ? 'RECV_PO' : 'SHIP_SO';
        const ref = audit.po_number || audit.so_number || '0000';
        filename = `${prefix}${ref}_${dateStr}.pdf`;
    }

    const lineItems = db.prepare('SELECT * FROM audit_line_items WHERE audit_id = ? ORDER BY sort_order').all(req.params.id);
    const discrepancies = db.prepare('SELECT * FROM audit_discrepancies WHERE audit_id = ?').all(req.params.id);
    // Fetch photo-type questions so buildHTML can map question_answers → labelled photos
    const photoQuestions = audit.audit_type_id
      ? db.prepare("SELECT id, question FROM audit_questions WHERE audit_type_id = ? AND type = 'photo' AND active = 1 ORDER BY sort_order").all(audit.audit_type_id)
      : [];

    const pdfPath = await generatePDF({ ...audit, lineItems, discrepancies, photoQuestions }, filename);

    if (!pdfPath) return res.status(500).json({ error: 'PDF generation failed' });

    // Update path in DB to ensure it's synced
    db.prepare('UPDATE audits SET pdf_path = ?, pdf_filename = ? WHERE id = ?').run(pdfPath, filename, req.params.id);
    
    res.sendFile(pdfPath);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
module.exports = router;
module.exports.generatePDF = generatePDF;