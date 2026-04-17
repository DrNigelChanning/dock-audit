const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const dbPromise = require('../db');

router.get('/', async (req, res) => {
  try {
    const db = await dbPromise;
    const members = db.prepare(
      'SELECT * FROM team_members ORDER BY active DESC, name'
    ).all();
    res.json(members);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const db = await dbPromise;
    const { name, role, location } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const id = uuidv4();
    db.prepare(
      'INSERT INTO team_members (id, name, role, location, active) VALUES (?, ?, ?, ?, 1)'
    ).run(id, name, role || null, location || null);
    res.status(201).json({ id, name, role, location, active: 1 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const db = await dbPromise;
    const { name, role, location, active } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (role !== undefined) updates.role = role;
    if (location !== undefined) updates.location = location;
    if (active !== undefined) updates.active = active;
    if (!Object.keys(updates).length) return res.json({ message: 'No changes' });
    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE team_members SET ${setClauses} WHERE id = ?`)
      .run(...Object.values(updates), req.params.id);
    res.json({ message: 'Updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const db = await dbPromise;
    db.prepare('DELETE FROM team_members WHERE id = ?').run(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
