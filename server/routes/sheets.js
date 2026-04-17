const express = require('express');
const router = express.Router();
const { getOpenPOs } = require('../sheets');

// GET /api/sheets/open-pos
// Returns open POs due within ±3 days — used to populate audit form dropdown
router.get('/open-pos', async (req, res) => {
  try {
    const pos = await getOpenPOs();
    res.json(pos);
  } catch (err) {
    console.error('Sheets route error:', err);
    res.status(500).json({ error: err.message, pos: [] });
  }
});

module.exports = router;
