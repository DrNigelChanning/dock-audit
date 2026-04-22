const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const getDB = require('../db');
const config = require('../config');
const dayjs = require('dayjs');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.resolve(config.UPLOAD_DIR)),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${uuidv4()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'));
  }
});

function deriveQualityScore(lineItems, tempInRange) {
  if (tempInRange === false || tempInRange === 0) return 1;
  const conditions = lineItems.map(li => li.condition);
  if (conditions.some(c => c === 'Rejected' || c === 'Major damage')) return 1;
  if (conditions.some(c => c === 'Minor damage')) return 2;
  return 3;
}

function hasDiscrepancy(lineItems, discrepancies, tempInRange) {
  if (tempInRange === false || tempInRange === 0) return true;
  if (discrepancies.length > 0) return true;
  if (lineItems.some(li =>
    li.condition === 'Rejected' ||
    li.condition === 'Major damage' ||
    (li.qty_variance_pct !== null && Math.abs(li.qty_variance_pct) > (config.ACCURACY_THRESHOLDS?.green ?? 0.05))
  )) return true;
  return false;
}

// ─── GET /api/audits ─────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const db = await getDB;
    const { type, audit_type_id, status, supplier, customer, po_number, so_number, date_from, date_to, has_discrepancy, limit = 50, offset = 0 } = req.query;
    let where = [], params = [];

    if (type)           { where.push('a.type = ?');              params.push(type); }
    if (audit_type_id)  { where.push('a.audit_type_id = ?');     params.push(audit_type_id); }
    if (status)         { where.push('a.status = ?');             params.push(status); }
    if (supplier)       { where.push('a.supplier LIKE ?');        params.push(`%${supplier}%`); }
    if (customer)       { where.push('a.customer LIKE ?');        params.push(`%${customer}%`); }
    if (po_number)      { where.push('a.po_number LIKE ?');       params.push(`%${po_number}%`); }
    if (so_number)      { where.push('a.so_number LIKE ?');       params.push(`%${so_number}%`); }
    if (date_from)      { where.push('a.audit_date >= ?');        params.push(date_from); }
    if (date_to)        { where.push('a.audit_date <= ?');        params.push(date_to); }
    if (has_discrepancy !== undefined) { where.push('a.has_discrepancy = ?'); params.push(has_discrepancy === 'true' ? 1 : 0); }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const audits = db.prepare(`
      SELECT a.*, at.name as audit_type_name, at.icon as audit_type_icon, at.color as audit_type_color
      FROM audits a
      LEFT JOIN audit_types at ON a.audit_type_id = at.id
      ${whereClause}
      ORDER BY a.audit_date DESC, a.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), parseInt(offset));

    const total = db.prepare(`SELECT COUNT(*) as count FROM audits a ${whereClause}`).get(...params);
    res.json({ audits, total: total.count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/audits/:id ──────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const db = await getDB;
    const audit = db.prepare(`
      SELECT a.*, at.name as audit_type_name, at.icon as audit_type_icon, at.color as audit_type_color
      FROM audits a LEFT JOIN audit_types at ON a.audit_type_id = at.id
      WHERE a.id = ?
    `).get(req.params.id);
    if (!audit) return res.status(404).json({ error: 'Audit not found' });
    const lineItems    = db.prepare('SELECT * FROM audit_line_items WHERE audit_id = ? ORDER BY sort_order').all(req.params.id);
    const discrepancies = db.prepare('SELECT * FROM audit_discrepancies WHERE audit_id = ?').all(req.params.id);
    res.json({ ...audit, lineItems, discrepancies });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/audits ────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const db = await getDB;
    const id = uuidv4();
    const now = dayjs().toISOString();
    const { type, audit_type_id, po_number, so_number, supplier, customer, carrier, trailer_number, seal_number, auditor_name, location, audit_date } = req.body;

    if (!auditor_name) return res.status(400).json({ error: 'auditor_name is required' });
    const auditType = type || 'custom';

    db.prepare(`
      INSERT INTO audits (id, type, audit_type_id, status, po_number, so_number, supplier, customer, carrier, trailer_number, seal_number, auditor_name, auditor_id, location, audit_date, question_answers, created_at, updated_at)
      VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?)
    `).run(id, auditType, audit_type_id || null, po_number || null, so_number || null, supplier || null, customer || null, carrier || null, trailer_number || null, seal_number || null, auditor_name, auditor_name, location || null, audit_date || now, now, now);

    res.status(201).json({ id, message: 'Audit created' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/audits/:id ───────────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
  try {
    const db = await getDB;
    const audit = db.prepare('SELECT * FROM audits WHERE id = ?').get(req.params.id);
    if (!audit) return res.status(404).json({ error: 'Audit not found' });
    if (audit.status === 'submitted') return res.status(400).json({ error: 'Submitted audits cannot be edited' });

    const allowed = [
      'po_number','so_number','supplier','customer','carrier','trailer_number','seal_number','seal_intact',
      'is_refrigerated','truck_temp_f','temp_in_range','temp_gun_photo','temp_control_photo',
      'truck_condition','truck_condition_notes','truck_condition_photo',
      'packing_list_received','coa_received','invoice_received','docs_score','quality_score',
      'bol_number','bol_signed','bol_photo','notes','location','auditor_name','audit_date',
      'question_answers'
    ];
    const updates = {};
    allowed.forEach(key => { if (req.body[key] !== undefined) updates[key] = req.body[key]; });

    // Merge question_answers rather than replace
    if (req.body.question_answers && typeof req.body.question_answers === 'object') {
      const existing = JSON.parse(audit.question_answers || '{}');
      updates.question_answers = JSON.stringify({ ...existing, ...req.body.question_answers });
    }

    if (!Object.keys(updates).length) return res.json({ message: 'No changes' });
    updates.updated_at = dayjs().toISOString();
    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE audits SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), req.params.id);
    res.json({ message: 'Updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/audits/:id/photo ──────────────────────────────────────────────
router.post('/:id/photo', upload.single('photo'), async (req, res) => {
  try {
    const db = await getDB;
    const audit = db.prepare('SELECT * FROM audits WHERE id = ?').get(req.params.id);
    if (!audit) return res.status(404).json({ error: 'Audit not found' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({ path: `/uploads/${req.file.filename}`, filename: req.file.filename });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/audits/:id/line-items ────────────────────────────────────────
router.post('/:id/line-items', async (req, res) => {
  try {
    const db = await getDB;
    const audit = db.prepare('SELECT * FROM audits WHERE id = ?').get(req.params.id);
    if (!audit) return res.status(404).json({ error: 'Audit not found' });

    const id = uuidv4();
    const { item_name, part_number, expected_qty, actual_qty, unit_of_measure, lot_code, expiration_date, condition, condition_notes, condition_photo, facesheet_correct, facesheet_photo, pallet_photo, sort_order } = req.body;
    const qty_variance = (actual_qty !== undefined && expected_qty !== undefined) ? parseFloat(actual_qty) - parseFloat(expected_qty) : null;
    const qty_variance_pct = (qty_variance !== null && expected_qty) ? qty_variance / parseFloat(expected_qty) : null;

    db.prepare(`
      INSERT INTO audit_line_items (id, audit_id, sort_order, item_name, part_number, expected_qty, actual_qty, unit_of_measure, qty_variance, qty_variance_pct, lot_code, expiration_date, condition, condition_notes, condition_photo, facesheet_correct, facesheet_photo, pallet_photo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.params.id, sort_order || 0, item_name, part_number || null, expected_qty || null, actual_qty || null, unit_of_measure || 'lbs', qty_variance, qty_variance_pct, lot_code || null, expiration_date || null, condition || null, condition_notes || null, condition_photo || null, facesheet_correct || null, facesheet_photo || null, pallet_photo || null);

    res.status(201).json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/audits/:id/line-items/:liId ─────────────────────────────────
router.patch('/:id/line-items/:liId', async (req, res) => {
  try {
    const db = await getDB;
    const allowed = ['item_name','part_number','expected_qty','actual_qty','unit_of_measure','lot_code','expiration_date','condition','condition_notes','condition_photo','facesheet_correct','facesheet_photo','pallet_photo','sort_order'];
    const updates = {};
    allowed.forEach(key => { if (req.body[key] !== undefined) updates[key] = req.body[key]; });

    if (updates.actual_qty !== undefined || updates.expected_qty !== undefined) {
      const current = db.prepare('SELECT expected_qty, actual_qty FROM audit_line_items WHERE id = ?').get(req.params.liId);
      const exp = parseFloat(updates.expected_qty ?? current?.expected_qty ?? 0);
      const act = parseFloat(updates.actual_qty ?? current?.actual_qty ?? 0);
      if (exp) { updates.qty_variance = act - exp; updates.qty_variance_pct = (act - exp) / exp; }
    }

    if (!Object.keys(updates).length) return res.json({ message: 'No changes' });
    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE audit_line_items SET ${setClauses} WHERE id = ? AND audit_id = ?`).run(...Object.values(updates), req.params.liId, req.params.id);
    res.json({ message: 'Updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/audits/:id ──────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const db = await getDB;
    const audit = db.prepare('SELECT * FROM audits WHERE id = ?').get(req.params.id);
    if (!audit) return res.status(404).json({ error: 'Audit not found' });
    if (audit.status === 'submitted') return res.status(400).json({ error: 'Submitted audits cannot be deleted' });

    // Cascade delete line items, discrepancies, then the audit
    db.prepare('DELETE FROM audit_discrepancies WHERE audit_id = ?').run(req.params.id);
    db.prepare('DELETE FROM audit_line_items WHERE audit_id = ?').run(req.params.id);
    db.prepare('DELETE FROM audits WHERE id = ?').run(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/audits/:id/line-items/:liId ────────────────────────────────
router.delete('/:id/line-items/:liId', async (req, res) => {
  try {
    const db = await getDB;
    db.prepare('DELETE FROM audit_line_items WHERE id = ? AND audit_id = ?').run(req.params.liId, req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/audits/:id/discrepancies ─────────────────────────────────────
router.post('/:id/discrepancies', async (req, res) => {
  try {
    const db = await getDB;
    const id = uuidv4();
    const { line_item_id, discrepancy_type, description, qty_affected, photo, disposition } = req.body;
    db.prepare(`INSERT INTO audit_discrepancies (id, audit_id, line_item_id, discrepancy_type, description, qty_affected, photo, disposition) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, req.params.id, line_item_id || null, discrepancy_type, description || null, qty_affected || null, photo || null, disposition || null);
    res.status(201).json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/audits/:id/submit ────────────────────────────────────────────
router.post('/:id/submit', async (req, res) => {
  try {
    const db = await getDB;
    const audit = db.prepare(`
      SELECT a.*, at.name as audit_type_name
      FROM audits a LEFT JOIN audit_types at ON a.audit_type_id = at.id
      WHERE a.id = ?
    `).get(req.params.id);
    if (!audit || audit.status === 'submitted') return res.status(400).json({ error: 'Invalid audit' });

    const lineItems     = db.prepare('SELECT * FROM audit_line_items WHERE audit_id = ? ORDER BY sort_order').all(req.params.id);
    const discrepancies = db.prepare('SELECT * FROM audit_discrepancies WHERE audit_id = ?').all(req.params.id);
    const allQuestions = audit.audit_type_id
      ? db.prepare("SELECT id, question, type, section FROM audit_questions WHERE audit_type_id = ? AND active = 1 ORDER BY sort_order").all(audit.audit_type_id)
      : [];
    const photoQuestions = allQuestions.filter(q => q.type === 'photo');

    const dateStr     = dayjs(audit.audit_date).format('YYYY-MM-DD');
    const cleanEntity = ((audit.type || '').toLowerCase() === 'outbound' ? (audit.customer || 'Unknown') : (audit.supplier || 'Unknown')).replace(/\s+/g, '-');
    const refNum      = audit.po_number || audit.so_number || '0000';
    const typeSlug    = (audit.audit_type_name || audit.type || 'audit').toUpperCase().replace(/\s+/g, '-');
    const pdfFilename = `${typeSlug}_${refNum}_${cleanEntity}_${dateStr}.pdf`;

    const now         = dayjs().toISOString();
    const hasDisc     = hasDiscrepancy(lineItems, discrepancies, audit.temp_in_range) ? 1 : 0;
    const qualScore   = deriveQualityScore(lineItems, audit.temp_in_range);

    db.prepare(`UPDATE audits SET status='submitted', submitted_at=?, pdf_filename=?, has_discrepancy=?, quality_score=?, updated_at=? WHERE id=?`)
      .run(now, pdfFilename, hasDisc, qualScore, now, audit.id);

    // Extract item/qty fields from question_answers for email + sheets
    const qa = (() => { try { return audit.question_answers ? JSON.parse(audit.question_answers) : {}; } catch { return {}; } })();
    const getQA = (keywords) => {
      const q = allQuestions.find(q => keywords.some(kw => q.question.toLowerCase().includes(kw)));
      return q ? (qa[q.id] ?? null) : null;
    };

    // Build the fully submitted audit object for downstream integrations
    const submittedAudit = {
      ...audit,
      status: 'submitted',
      submitted_at: now,
      pdf_filename: pdfFilename,
      has_discrepancy: hasDisc,
      quality_score: qualScore,
      item_name:    getQA(['item', 'ingredient', 'sku']),
      qty_expected: getQA(['expected']),
      qty_received: getQA(['actual']),
      load_type:    getQA(['load type']),
    };

    // PDF — fire and forget
    const { generatePDF } = require('./pdf');
    generatePDF({ ...submittedAudit, lineItems, discrepancies, allQuestions, photoQuestions }, pdfFilename)
      .then(pdfPath => db.prepare('UPDATE audits SET pdf_path = ? WHERE id = ?').run(pdfPath, audit.id))
      .catch(err => console.error('PDF Error:', err));

    // Email — fire and forget
    const { sendAuditComplete } = require('../email');
    sendAuditComplete(submittedAudit, lineItems, discrepancies)
      .catch(err => console.error('Email Error:', err));

    // Google Sheets — fire and forget
    const { appendAuditRow, writeToSheet } = require('../sheets');

    // Audit log: always append a row for every audit type (typed tabs)
    appendAuditRow(submittedAudit, lineItems)
      .catch(err => console.error('Sheets appendAuditRow Error:', err));

    // Open PO tracker: update matching PO row for inbound audits
    if (submittedAudit.type && submittedAudit.type.toLowerCase() === 'inbound' && submittedAudit.po_number) {
      writeToSheet(submittedAudit, lineItems)
        .catch(err => console.error('Sheets writeToSheet Error:', err));
    }

    res.json({ message: 'Audit submitted', pdf_filename: pdfFilename });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
