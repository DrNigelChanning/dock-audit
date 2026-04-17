// seed.js — Populates audit_types and audit_questions tables
// Run once on startup if tables are empty. Safe to re-run (idempotent).

const { v4: uuidv4 } = require('uuid');

const TYPES = [
  { name: 'Inbound',   icon: '📥', color: '#00d4aa', sort_order: 0 },
  { name: 'Outbound',  icon: '🚢', color: '#ff6b35', sort_order: 1 },
  { name: 'Case Pack', icon: '📦', color: '#f5c842', sort_order: 2 },
];

// Questions keyed by type name. type: yes_no | text | number | photo | select | temperature | note
const QUESTIONS = {
  Inbound: [
    { section: 'Setup',             question: 'PO number',                               type: 'text',        required: 1, sort_order: 0 },
    { section: 'Setup',             question: 'Supplier',                                type: 'text',        required: 1, sort_order: 1 },
    { section: 'Setup',             question: 'Carrier',                                 type: 'text',        required: 1, sort_order: 2 },
    { section: 'Truck Inspection',  question: 'Truck / Trailer number',                  type: 'text',        required: 1, sort_order: 0 },
    { section: 'Truck Inspection',  question: 'Truck interior temperature (°F)',          type: 'temperature', required: 1, sort_order: 1 },
    { section: 'Truck Inspection',  question: 'Temperature gun photo',                   type: 'photo',       required: 1, sort_order: 2 },
    { section: 'Truck Inspection',  question: 'Truck clean and free of contamination?',  type: 'yes_no',      required: 1, sort_order: 3 },
    { section: 'Truck Inspection',  question: 'Load integrity — no tipping or shifted pallets?', type: 'yes_no', required: 1, sort_order: 4 },
    { section: 'Load Verification', question: 'Item / Ingredient name',                  type: 'text',        required: 1, sort_order: 0 },
    { section: 'Load Verification', question: 'Expected quantity',                        type: 'number',      required: 1, sort_order: 1 },
    { section: 'Load Verification', question: 'Actual quantity received',                 type: 'number',      required: 1, sort_order: 2 },
    { section: 'Load Verification', question: 'Lot code',                                 type: 'text',        required: 1, sort_order: 3 },
    { section: 'Load Verification', question: 'Expiration date',                          type: 'text',        required: 1, sort_order: 4 },
    { section: 'Load Verification', question: 'Product condition', type: 'select', options: JSON.stringify(['Good','Minor damage — accepted with note','Major damage — held or rejected']), required: 1, sort_order: 5 },
    { section: 'Load Verification', question: 'Pallet photo',                             type: 'photo',       required: 1, sort_order: 6 },
    { section: 'Documentation',     question: 'Packing list received?',                   type: 'yes_no',      required: 1, sort_order: 0 },
    { section: 'Documentation',     question: 'COA received?',                            type: 'yes_no',      required: 1, sort_order: 1 },
    { section: 'Documentation',     question: 'Invoice received?',                         type: 'yes_no',      required: 0, sort_order: 2 },
    { section: 'Documentation',     question: 'COA photo or upload',                       type: 'photo',       required: 0, sort_order: 3 },
    { section: 'Sign Off',          question: 'Additional notes',                          type: 'text',        required: 0, sort_order: 0 },
  ],
  Outbound: [
    { section: 'Setup',             question: 'SO number',                               type: 'text',        required: 1, sort_order: 0 },
    { section: 'Setup',             question: 'Customer', type: 'select', options: JSON.stringify(["Costco","Trader Joe's","Walmart","Kroger","Other"]), required: 1, sort_order: 1 },
    { section: 'Setup',             question: 'Carrier',                                  type: 'text',        required: 1, sort_order: 2 },
    { section: 'Truck Inspection',  question: 'Truck / Trailer number',                   type: 'text',        required: 1, sort_order: 0 },
    { section: 'Truck Inspection',  question: 'Seal number',                               type: 'text',        required: 1, sort_order: 1 },
    { section: 'Truck Inspection',  question: 'Truck interior temperature (°F)',           type: 'temperature', required: 1, sort_order: 2 },
    { section: 'Truck Inspection',  question: 'Temperature gun photo',                    type: 'photo',       required: 1, sort_order: 3 },
    { section: 'Truck Inspection',  question: 'Temperature control setpoint photo',       type: 'photo',       required: 1, sort_order: 4 },
    { section: 'Truck Inspection',  question: 'Truck clean and suitable for food?',       type: 'yes_no',      required: 1, sort_order: 5 },
    { section: 'Load Verification', question: 'Item / SKU',                               type: 'text',        required: 1, sort_order: 0 },
    { section: 'Load Verification', question: 'Expected cases',                            type: 'number',      required: 1, sort_order: 1 },
    { section: 'Load Verification', question: 'Actual cases loaded',                       type: 'number',      required: 1, sort_order: 2 },
    { section: 'Load Verification', question: 'Lot code',                                  type: 'text',        required: 1, sort_order: 3 },
    { section: 'Load Verification', question: 'Expiration date',                           type: 'text',        required: 1, sort_order: 4 },
    { section: 'Load Verification', question: 'Facesheet correct?',                        type: 'yes_no',      required: 1, sort_order: 5 },
    { section: 'Load Verification', question: 'Facesheet photo',                           type: 'photo',       required: 1, sort_order: 6 },
    { section: 'Load Verification', question: 'Pallet / load photo',                       type: 'photo',       required: 1, sort_order: 7 },
    { section: 'Load Verification', question: 'Product condition', type: 'select', options: JSON.stringify(['Good','Minor damage — noted','Major damage — hold']), required: 1, sort_order: 8 },
    { section: 'Documentation',     question: 'BOL number',                                type: 'text',        required: 1, sort_order: 0 },
    { section: 'Documentation',     question: 'BOL signed by carrier?',                    type: 'yes_no',      required: 1, sort_order: 1 },
    { section: 'Documentation',     question: 'BOL photo',                                 type: 'photo',       required: 1, sort_order: 2 },
    { section: 'Sign Off',          question: 'Additional notes',                          type: 'text',        required: 0, sort_order: 0 },
  ],
  'Case Pack': [
    { section: 'Setup',          question: 'Item / SKU',                        type: 'text',   required: 1, sort_order: 0 },
    { section: 'Setup',          question: 'Lot code',                           type: 'text',   required: 1, sort_order: 1 },
    { section: 'Setup',          question: 'Production date',                    type: 'text',   required: 1, sort_order: 2 },
    { section: 'Case Inspection',question: 'Cases sampled',                      type: 'number', required: 1, sort_order: 0 },
    { section: 'Case Inspection',question: 'Units per case (expected)',           type: 'number', required: 1, sort_order: 1 },
    { section: 'Case Inspection',question: 'Units per case (actual)',             type: 'number', required: 1, sort_order: 2 },
    { section: 'Case Inspection',question: 'Case weight (lbs)',                  type: 'number', required: 1, sort_order: 3 },
    { section: 'Case Inspection',question: 'Case condition', type: 'select', options: JSON.stringify(['Pass','Minor issue — accepted','Fail — rejected']), required: 1, sort_order: 4 },
    { section: 'Label Check',    question: 'Label correct and legible?',         type: 'yes_no', required: 1, sort_order: 0 },
    { section: 'Label Check',    question: 'Lot code on label matches batch?',   type: 'yes_no', required: 1, sort_order: 1 },
    { section: 'Label Check',    question: 'Best By / Expiration date correct?', type: 'yes_no', required: 1, sort_order: 2 },
    { section: 'Label Check',    question: 'Label photo',                         type: 'photo',  required: 1, sort_order: 3 },
    { section: 'Seal & Closure', question: 'Seal intact on all sampled cases?',  type: 'yes_no', required: 1, sort_order: 0 },
    { section: 'Seal & Closure', question: 'Seal / closure photo',               type: 'photo',  required: 1, sort_order: 1 },
    { section: 'Sign Off',       question: 'Overall result', type: 'select', options: JSON.stringify(['Pass','Conditional pass — see notes','Fail — hold lot']), required: 1, sort_order: 0 },
    { section: 'Sign Off',       question: 'Notes',                               type: 'text',   required: 0, sort_order: 1 },
  ],
};

function seed(db) {
  const existing = db.prepare('SELECT COUNT(*) as c FROM audit_types').get();
  if (existing && existing.c > 0) {
    console.log('✅ Audit types already seeded — skipping');
    return;
  }

  console.log('🌱 Seeding audit types and questions...');

  for (const typeDef of TYPES) {
    const typeId = uuidv4();
    db.prepare(`
      INSERT INTO audit_types (id, name, icon, color, sort_order, active)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(typeId, typeDef.name, typeDef.icon, typeDef.color, typeDef.sort_order);

    const questions = QUESTIONS[typeDef.name] || [];
    for (const q of questions) {
      db.prepare(`
        INSERT INTO audit_questions (id, audit_type_id, section, question, type, options, required, active, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
      `).run(uuidv4(), typeId, q.section, q.question, q.type, q.options || null, q.required, q.sort_order);
    }

    console.log(`  ✓ ${typeDef.name}: ${questions.length} questions`);
  }

  console.log('✅ Seed complete');
}

module.exports = { seed };
