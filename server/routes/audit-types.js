// routes/audit-types.js — CRUD for audit types and their questions
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const getDB = require('../db');

// ─── GET /api/audit-types ────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const db = await getDB;
    const types = db.prepare(`
      SELECT t.*, COUNT(q.id) as question_count
      FROM audit_types t
      LEFT JOIN audit_questions q ON q.audit_type_id = t.id AND q.active = 1
      WHERE t.active = 1
      GROUP BY t.id
      ORDER BY t.sort_order ASC
    `).all();
    res.json(types);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/audit-types ───────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const db = await getDB;
    const { name, icon = '📋', color = '#00d4aa' } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const id = uuidv4();
    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM audit_types').get();
    db.prepare('INSERT INTO audit_types (id, name, icon, color, sort_order) VALUES (?, ?, ?, ?, ?)').run(id, name, icon, color, (maxOrder?.m ?? -1) + 1);
    res.status(201).json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/audit-types/:id ─────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
  try {
    const db = await getDB;
    const allowed = ['name', 'icon', 'color', 'sort_order', 'active'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    if (!Object.keys(updates).length) return res.json({ message: 'No changes' });
    const set = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE audit_types SET ${set} WHERE id = ?`).run(...Object.values(updates), req.params.id);
    res.json({ message: 'Updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/audit-types/:id ────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const db = await getDB;
    // Soft delete
    db.prepare('UPDATE audit_types SET active = 0 WHERE id = ?').run(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/audit-types/:id/questions ─────────────────────────────────────
router.get('/:id/questions', async (req, res) => {
  try {
    const db = await getDB;
    const questions = db.prepare(`
      SELECT * FROM audit_questions
      WHERE audit_type_id = ? AND active = 1
      ORDER BY sort_order
    `).all(req.params.id);
    // Parse options JSON
    const parsed = questions.map(q => ({
      ...q,
      options: q.options ? JSON.parse(q.options) : null,
    }));
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/audit-types/:id/questions ────────────────────────────────────
router.post('/:id/questions', async (req, res) => {
  try {
    const db = await getDB;
    const { section, question, type = 'text', options, required = 1, sort_order = 0 } = req.body;
    if (!section || !question) return res.status(400).json({ error: 'section and question are required' });
    const id = uuidv4();
    db.prepare(`
      INSERT INTO audit_questions (id, audit_type_id, section, question, type, options, required, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.params.id, section, question, type, options ? JSON.stringify(options) : null, required, sort_order);
    res.status(201).json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/audit-types/:id/questions/:qid ──────────────────────────────
router.patch('/:id/questions/:qid', async (req, res) => {
  try {
    const db = await getDB;
    const allowed = ['section', 'question', 'type', 'options', 'required', 'active', 'sort_order'];
    const updates = {};
    allowed.forEach(k => {
      if (req.body[k] !== undefined) {
        updates[k] = k === 'options' && req.body[k] ? JSON.stringify(req.body[k]) : req.body[k];
      }
    });
    if (!Object.keys(updates).length) return res.json({ message: 'No changes' });
    const set = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE audit_questions SET ${set} WHERE id = ? AND audit_type_id = ?`).run(...Object.values(updates), req.params.qid, req.params.id);
    res.json({ message: 'Updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/audit-types/:id/questions/:qid ─────────────────────────────
router.delete('/:id/questions/:qid', async (req, res) => {
  try {
    const db = await getDB;
    db.prepare('UPDATE audit_questions SET active = 0 WHERE id = ? AND audit_type_id = ?').run(req.params.qid, req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
