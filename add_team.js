const getDB = require('./server/db'); // Points to your database logic
const { v4: uuidv4 } = require('uuid'); // To create unique IDs for them

async function addTeam() {
  const db = await getDB;
  
  // Update this list with your actual team members!
  const newMembers = [
    { name: 'Josh Ricciardiello', role: 'Receiving', location: 'Monarch' },
    { name: 'Xavier Finch', role: 'Inventory', location: 'Monarch' },
    { name: 'Carlos ', role: 'Receiving', location: 'Horizon' },
    { name: 'Lisa Wong', role: 'QC Manager', location: 'Horizon' }
  ];

  console.log('👤 Adding team members...');
  const stmt = db.prepare('INSERT INTO team_members (id, name, role, location, active) VALUES (?, ?, ?, ?, 1)');
  
  newMembers.forEach(m => {
    stmt.run(uuidv4(), m.name, m.role, m.location);
    console.log(`✅ Added: ${m.name} (${m.role})`);
  });

  console.log('\n✨ All set! Restart your server to see them in the dropdown.');
  process.exit(0);
}

addTeam();