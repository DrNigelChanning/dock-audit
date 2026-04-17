const express = require('express');
const router = express.Router();
const dbPromise = require('../db'); // Rename this to remind you it's a Promise

router.get('/', async (req, res) => {
  try {
    const db = await dbPromise; // WAIT for the DB to be ready
    const members = db.prepare(
      'SELECT * FROM team_members WHERE active = 1 ORDER BY name'
    ).all();
    res.json(members);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  const { name, role, location } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = uuidv4();
  db.prepare(
    'INSERT INTO team_members (id, name, role, location) VALUES (?, ?, ?, ?)'
  ).run(id, name, role || null, location || null);
  res.status(201).json({ id });
});

router.patch('/:id', (req, res) => {
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
});

module.exports = router;
