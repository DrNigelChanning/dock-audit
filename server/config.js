// dock-audit/server/config.js
// Edit these values — no code changes needed for operational config

module.exports = {
  // Server
  PORT: process.env.PORT || 3001,

  // Upload storage
  UPLOAD_DIR: process.env.UPLOAD_DIR || './data/uploads',

  // Temperature specs (°F)
  TEMP_SPECS: {
    frozen_inbound:    { min: -99, max: 0,  label: 'Frozen Inbound' },
    refrigerated_inbound: { min: 34, max: 40, label: 'Refrigerated Inbound' },
    frozen_outbound:   { min: -99, max: 10, label: 'Frozen Outbound' },
    refrigerated_outbound: { min: 34, max: 42, label: 'Refrigerated Outbound' },
  },

  // Scorecard thresholds (mirrors Open PO sheet formulas)
  ACCURACY_THRESHOLDS: {
    green: 0.05,   // ±5% → score 3
    yellow: 0.15,  // ±15% → score 2; above → score 1
  },

  // Email (configure with real SMTP for production)
  EMAIL: {
    enabled: process.env.EMAIL_ENABLED === 'true' || false,
    from: process.env.FROM_EMAIL || 'dock-audit@thehoneststand.com',
    inbound_flags_to: process.env.INBOUND_FLAGS_EMAIL || 'stephen@thehoneststand.com',
    outbound_flags_to: process.env.OUTBOUND_FLAGS_EMAIL || 'ben@thehoneststand.com',
    cc_always: process.env.CC_EMAIL || 'phil@thehoneststand.com',
    smtp: {
      host: process.env.SMTP_HOST || 'smtp.sendgrid.net',
      port: 587,
      auth: {
        user: process.env.SMTP_USER || 'apikey',
        pass: process.env.SMTP_PASS || '',
      }
    }
  },

  // Google Sheets integration
  SHEETS: {
    enabled: process.env.SHEETS_ENABLED === 'true' || false,
    spreadsheet_id: '1fKh8oLki6Y9woesfB_A1WQBgrPYw3WTpIyRequ1SdXE',
    tab_name: 'Open POs - Inventory (4)',
    // Column letters — confirmed by Phil 2026-04-03
    columns: {
      po_number:            process.env.COL_PO_NUMBER || 'C',
      supplier:             process.env.COL_SUPPLIER  || 'I',
      requested_due_date:   process.env.COL_DUE_DATE  || 'Q',
      actual_date_received: process.env.COL_ACTUAL_DATE || 'S',
      quality_score:        process.env.COL_QUALITY   || 'AZ',
      docs_score:           process.env.COL_DOCS      || 'BB',
      notes:                process.env.COL_NOTES     || 'BE',
    },
    // Service account key path (for production)
    service_account_key: process.env.GOOGLE_SERVICE_ACCOUNT_KEY || './config/google-service-account.json',
  },

  // PDF output
  PDF: {
    output_dir: process.env.PDF_DIR || './data/pdfs',
    logo_path: './client/assets/ths-logo.png',
  }
};
