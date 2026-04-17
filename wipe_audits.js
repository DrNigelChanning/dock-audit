const getDB = require('./server/db');
const fs = require('fs');
const path = require('path');

async function wipeData() {
  const db = await getDB;
  
  console.log('🧹 Wiping audit data...');
  db.prepare('DELETE FROM audit_discrepancies').run();
  db.prepare('DELETE FROM audit_line_items').run();
  db.prepare('DELETE FROM audits').run();
  
  console.log('📸 Clearing upload folders...');
  const folders = ['./uploads', './data/pdfs'];
  folders.forEach(folder => {
    if (fs.existsSync(folder)) {
      const files = fs.readdirSync(folder);
      for (const file of files) {
        if (file !== '.gitkeep') fs.unlinkSync(path.join(folder, file));
      }
    }
  });

  console.log('✅ Done! Audits wiped, Team Members kept.');
  process.exit(0);
}

wipeData();