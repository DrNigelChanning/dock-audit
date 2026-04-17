const getDB = require('./server/db');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

async function hardReset() {
  const db = await getDB;
  
  console.log('🧹 Cleaning up local files...');
  // Wipe the tables just in case the file wasn't deleted
  db.prepare('DELETE FROM audit_discrepancies').run();
  db.prepare('DELETE FROM audit_line_items').run();
  db.prepare('DELETE FROM audits').run();
  db.prepare('DELETE FROM team_members').run();
  
  const newMembers = [
    { name: 'Adam', role: 'Auditor' },
    { name: 'Aleandro', role: 'Auditor' },
    { name: 'Carlos', role: 'Auditor' },
    { name: 'Fidel', role: 'Auditor' },
    { name: 'Johan', role: 'Auditor' },
    { name: 'Josh', role: 'Auditor' },
    { name: 'Luca', role: 'Auditor' },
    { name: 'Manuel', role: 'Auditor' },
    { name: 'Maykol', role: 'Auditor' },
    { name: 'Molly', role: 'Receiving Manager' },
    { name: 'Nico', role: 'Shipping Manager' },
    { name: 'Ricardo', role: 'Auditor' },
    { name: 'Sebastian', role: 'Pick/Prep Manager' },
    { name: 'Xavier', role: 'Auditor' }
  ];

  console.log('👤 Inserting unique team list...');
  const stmt = db.prepare('INSERT INTO team_members (id, name, role, location, active) VALUES (?, ?, ?, ?, 1)');
  
  newMembers.forEach(m => {
    stmt.run(uuidv4(), m.name, m.role, 'Monarch');
    console.log(`✅ ${m.name} added.`);
  });

  console.log('\n✨ Database is now clean with 14 unique members.');
  console.log('🚀 Start the server with: node server/index.js');
}

hardReset();