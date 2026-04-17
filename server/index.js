const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const config = require('./config');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Ensure directories exist
[config.UPLOAD_DIR, config.PDF.output_dir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// 1. Static file hosting for images
app.use('/uploads', express.static(path.resolve(config.UPLOAD_DIR)));

// 2. API Routes (These must come BEFORE the static client and catch-all)
app.use('/api/audits', require('./routes/audits'));
app.use('/api/audit-types', require('./routes/audit-types'));
app.use('/api/team', require('./routes/team'));
app.use('/api/pdf', require('./routes/pdf')); // This handles the /api/pdf/:id logic
app.use('/api/sheets', require('./routes/sheets'));

// 3. Static folder for already-generated PDFs (Optional backup)
app.use('/pdfs', express.static(path.resolve(config.PDF.output_dir)));

// 4. Client-side static files
app.use(express.static(path.join(__dirname, '../client')));

// 5. THE CATCH-ALL (Must be last)
// This sends any unknown web request to the frontend index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Wait for async DB init (sql.js) before accepting connections
require('./db').then(() => {
  app.listen(config.PORT, () => {
    console.log(`\n🚢 THS Dock Audit Tool`);
    console.log(`    Running at http://localhost:${config.PORT}`);
    console.log(`    Sheets integration: ${config.SHEETS.enabled ? '✅ ON' : '⚠️  OFF'}`);
    console.log(`    Email alerts: ${config.EMAIL.enabled ? '✅ ON' : '⚠️  OFF'}\n`);
  });
}).catch(err => {
  console.error('❌ Failed to initialize database:', err);
  process.exit(1);
});