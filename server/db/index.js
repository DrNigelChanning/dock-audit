// db/index.js — sql.js wrapper with seed support
const path = require('path');
const fs = require('fs');

// DB_PATH: use env var (set to /data/dock_audit.db on Railway with mounted volume)
// Falls back to local data/ dir for development
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/dock_audit.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const initSqlJs = require('sql.js');

let _saveTimer = null;
function scheduleSave(db) {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  }, 500);
}

class SyncDB {
  constructor(sqlJsDb) {
    this._db = sqlJsDb;
  }

  exec(sql) {
    this._db.exec(sql);
    scheduleSave(this._db);
    return this;
  }

  prepare(sql) {
    const db = this._db;
    return {
      run: (...params) => {
        const flat = params.flat();
        db.run(sql, flat);
        scheduleSave(db);
        const rowid = db.exec('SELECT last_insert_rowid()');
        return { lastInsertRowid: rowid[0]?.values[0]?.[0] ?? null };
      },
      get: (...params) => {
        const flat = params.flat();
        const result = db.exec(sql, flat);
        if (!result.length || !result[0].values.length) return undefined;
        const { columns, values } = result[0];
        return Object.fromEntries(columns.map((c, i) => [c, values[0][i]]));
      },
      all: (...params) => {
        const flat = params.flat();
        const result = db.exec(sql, flat);
        if (!result.length) return [];
        const { columns, values } = result[0];
        return values.map(row => Object.fromEntries(columns.map((c, i) => [c, row[i]])));
      },
    };
  }

  pragma(str) {
    try { this._db.run(`PRAGMA ${str}`); } catch (e) {}
  }

  export() {
    return this._db.export();
  }

  save() {
    const data = this._db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  }
}

async function init() {
  // ─── Persistence diagnostic (remove once volume behavior is confirmed) ──
  try {
    const dir = path.dirname(DB_PATH);
    const contents = fs.readdirSync(dir);
    console.log(`[boot-diag] DB_PATH=${DB_PATH}`);
    console.log(`[boot-diag] ${dir} contents:`, JSON.stringify(contents));
    if (fs.existsSync(DB_PATH)) {
      const st = fs.statSync(DB_PATH);
      console.log(`[boot-diag] DB found at boot: ${st.size} bytes, mtime=${st.mtime.toISOString()}`);
    } else {
      console.log(`[boot-diag] DB NOT found at boot: ${DB_PATH}`);
    }
    // Quick mount-persistence probe: touch a file and check it on next boot
    const probePath = path.join(dir, 'persistence.probe');
    if (fs.existsSync(probePath)) {
      console.log(`[boot-diag] Persistence probe survived: ${fs.readFileSync(probePath, 'utf8')}`);
    } else {
      console.log(`[boot-diag] Persistence probe NOT found — writing fresh`);
    }
    fs.writeFileSync(probePath, `boot=${new Date().toISOString()}, pid=${process.pid}`);
  } catch (e) {
    console.log(`[boot-diag] error inspecting ${path.dirname(DB_PATH)}: ${e.message}`);
  }
  // ────────────────────────────────────────────────────────────────────────

  const SQL = await initSqlJs();
  let db;
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log('✅ Database loaded from', DB_PATH);
  } else {
    db = new SQL.Database();
    console.log('✅ Database created at', DB_PATH);
  }

  const wrapper = new SyncDB(db);

  // Apply schema (CREATE IF NOT EXISTS — safe to re-run)
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  schema.split(';').map(s => s.trim()).filter(Boolean).forEach(stmt => {
    try { db.run(stmt + ';'); } catch (e) {
      if (!e.message?.includes('already exists') && !e.message?.includes('UNIQUE constraint')) {
        console.warn('Schema warn:', e.message?.substring(0, 80));
      }
    }
  });

  // ── Migration: rebuild audits table if it still has the old CHECK constraints ──
  // SQLite can't drop CHECK constraints via ALTER TABLE, so we do a table swap.
  const auditsDDL = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='audits'");
  const oldDDL = auditsDDL[0]?.values[0]?.[0] || '';
  if (oldDDL.includes("CHECK(type IN ('inbound', 'outbound'))") || oldDDL.includes('auditor_id TEXT NOT NULL')) {
    console.log('🔧 Migrating audits table — removing old CHECK constraints...');

    db.run(`
      CREATE TABLE IF NOT EXISTS audits_new (
        id              TEXT PRIMARY KEY,
        type            TEXT NOT NULL,
        audit_type_id   TEXT REFERENCES audit_types(id),
        status          TEXT NOT NULL DEFAULT 'draft',
        po_number TEXT, so_number TEXT, supplier TEXT, customer TEXT,
        carrier TEXT, trailer_number TEXT, seal_number TEXT, seal_intact INTEGER,
        auditor_name    TEXT,
        auditor_id      TEXT,
        location        TEXT,
        audit_date      TEXT NOT NULL DEFAULT (datetime('now')),
        submitted_at    TEXT,
        is_refrigerated INTEGER DEFAULT 0,
        truck_temp_f REAL, temp_in_range INTEGER,
        temp_gun_photo TEXT, temp_control_photo TEXT,
        truck_condition TEXT, truck_condition_notes TEXT, truck_condition_photo TEXT,
        packing_list_received INTEGER, coa_received INTEGER, invoice_received INTEGER,
        docs_score INTEGER, quality_score INTEGER,
        bol_number TEXT, bol_signed INTEGER, bol_photo TEXT,
        question_answers TEXT DEFAULT '{}',
        has_discrepancy INTEGER DEFAULT 0, escalation_sent INTEGER DEFAULT 0,
        pdf_path TEXT, pdf_filename TEXT, notes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // Copy only columns that exist in both tables
    const newCols = ['id','type','audit_type_id','status','po_number','so_number','supplier','customer',
      'carrier','trailer_number','seal_number','seal_intact','auditor_name','auditor_id',
      'location','audit_date','submitted_at','is_refrigerated','truck_temp_f','temp_in_range',
      'temp_gun_photo','temp_control_photo','truck_condition','truck_condition_notes','truck_condition_photo',
      'packing_list_received','coa_received','invoice_received','docs_score','quality_score',
      'bol_number','bol_signed','bol_photo','question_answers','has_discrepancy','escalation_sent',
      'pdf_path','pdf_filename','notes','created_at','updated_at'];
    const oldColResult = db.exec("SELECT name FROM pragma_table_info('audits')");
    const oldColNames = oldColResult[0]?.values?.map(r => r[0]) || [];
    const safeCols = newCols.filter(c => oldColNames.includes(c));

    db.run(`INSERT INTO audits_new (${safeCols.join(',')}) SELECT ${safeCols.join(',')} FROM audits`);
    db.run('DROP TABLE audits');
    db.run('ALTER TABLE audits_new RENAME TO audits');
    console.log('✅ audits table rebuilt — CHECK constraints removed');
  }

  // Additive column migrations (safe to re-run)
  try { db.run('ALTER TABLE audits ADD COLUMN audit_type_id TEXT'); } catch(e) {}
  try { db.run("ALTER TABLE audits ADD COLUMN question_answers TEXT DEFAULT '{}'"); } catch(e) {}
  try { db.run('ALTER TABLE audits ADD COLUMN auditor_name TEXT'); } catch(e) {}
  try { db.run('ALTER TABLE audit_questions ADD COLUMN allow_multiple INTEGER DEFAULT 0'); } catch(e) {}

  // Seed
  const { seed } = require('./seed');
  seed(wrapper);

  wrapper.save();

  // ─── Post-save diagnostic ──────────────────────────────────────────────
  try {
    if (fs.existsSync(DB_PATH)) {
      const st = fs.statSync(DB_PATH);
      console.log(`[boot-diag] After init save: DB at ${DB_PATH} is ${st.size} bytes`);
    } else {
      console.log(`[boot-diag] AFTER SAVE: DB FILE MISSING at ${DB_PATH} — write silently failed`);
    }
  } catch (e) {
    console.log(`[boot-diag] post-save stat failed: ${e.message}`);
  }
  // ────────────────────────────────────────────────────────────────────────

  return wrapper;
}

module.exports = init();
