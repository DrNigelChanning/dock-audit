-- Dock Audit Tool — SQLite Schema
-- v2: Dynamic audit types + question-driven forms

-- ─── Audit Types (user-managed) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_types (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  icon       TEXT DEFAULT '📋',
  color      TEXT DEFAULT '#00d4aa',
  sort_order INTEGER DEFAULT 0,
  active     INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ─── Audit Questions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_questions (
  id             TEXT PRIMARY KEY,
  audit_type_id  TEXT NOT NULL REFERENCES audit_types(id) ON DELETE CASCADE,
  section        TEXT NOT NULL,
  question       TEXT NOT NULL,
  type           TEXT NOT NULL DEFAULT 'text',
    -- yes_no | text | number | photo | select | temperature | note
  options        TEXT,           -- JSON array, select only
  required       INTEGER DEFAULT 1,
  allow_multiple INTEGER DEFAULT 0,  -- photo only: allow multiple uploads per question
  active         INTEGER DEFAULT 1,
  sort_order     INTEGER DEFAULT 0,
  created_at     TEXT DEFAULT (datetime('now'))
);

-- ─── Team Members ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_members (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  role       TEXT,
  location   TEXT,
  active     INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ─── Audits ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audits (
  id              TEXT PRIMARY KEY,
  type            TEXT NOT NULL,         -- audit type name (free text, backward compat)
  audit_type_id   TEXT REFERENCES audit_types(id),
  status          TEXT NOT NULL DEFAULT 'draft',

  po_number       TEXT,
  so_number       TEXT,
  supplier        TEXT,
  customer        TEXT,
  carrier         TEXT,
  trailer_number  TEXT,
  seal_number     TEXT,
  seal_intact     INTEGER,

  auditor_name    TEXT,
  auditor_id      TEXT,
  location        TEXT,

  audit_date      TEXT NOT NULL,
  submitted_at    TEXT,

  is_refrigerated INTEGER DEFAULT 0,
  truck_temp_f    REAL,
  temp_in_range   INTEGER,
  temp_gun_photo  TEXT,
  temp_control_photo TEXT,
  truck_condition TEXT,
  truck_condition_notes TEXT,
  truck_condition_photo TEXT,

  packing_list_received INTEGER,
  coa_received          INTEGER,
  invoice_received      INTEGER,
  docs_score            INTEGER,

  quality_score INTEGER,

  bol_number TEXT,
  bol_signed INTEGER,
  bol_photo  TEXT,

  -- Dynamic question answers stored as JSON blob
  question_answers TEXT DEFAULT '{}',

  has_discrepancy   INTEGER DEFAULT 0,
  escalation_sent   INTEGER DEFAULT 0,

  pdf_path     TEXT,
  pdf_filename TEXT,
  notes        TEXT,

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ─── Audit Line Items ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_line_items (
  id          TEXT PRIMARY KEY,
  audit_id    TEXT NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  sort_order  INTEGER DEFAULT 0,

  item_name        TEXT NOT NULL,
  part_number      TEXT,
  expected_qty     REAL,
  actual_qty       REAL,
  unit_of_measure  TEXT DEFAULT 'lbs',
  qty_variance     REAL,
  qty_variance_pct REAL,

  lot_code         TEXT,
  expiration_date  TEXT,

  condition        TEXT,
  condition_notes  TEXT,
  condition_photo  TEXT,

  facesheet_correct INTEGER,
  facesheet_photo   TEXT,
  pallet_photo      TEXT,

  created_at TEXT DEFAULT (datetime('now'))
);

-- ─── Audit Discrepancies ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_discrepancies (
  id           TEXT PRIMARY KEY,
  audit_id     TEXT NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  line_item_id TEXT REFERENCES audit_line_items(id),

  discrepancy_type TEXT NOT NULL,
  description      TEXT,
  qty_affected     REAL,
  photo            TEXT,
  disposition      TEXT,

  created_at TEXT DEFAULT (datetime('now'))
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_audits_type     ON audits(type);
CREATE INDEX IF NOT EXISTS idx_audits_typeid   ON audits(audit_type_id);
CREATE INDEX IF NOT EXISTS idx_audits_po       ON audits(po_number);
CREATE INDEX IF NOT EXISTS idx_audits_so       ON audits(so_number);
CREATE INDEX IF NOT EXISTS idx_audits_supplier ON audits(supplier);
CREATE INDEX IF NOT EXISTS idx_audits_date     ON audits(audit_date);
CREATE INDEX IF NOT EXISTS idx_questions_type  ON audit_questions(audit_type_id);
CREATE INDEX IF NOT EXISTS idx_line_items_audit     ON audit_line_items(audit_id);
CREATE INDEX IF NOT EXISTS idx_discrepancies_audit  ON audit_discrepancies(audit_id);
