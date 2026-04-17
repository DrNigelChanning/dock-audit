// server/email.js — Sends audit completion emails via SendGrid Web API
const config = require('./config');
const dayjs = require('dayjs');

async function sendViaSendGrid(to, cc, subject, html) {
  const apiKey = config.EMAIL.smtp.auth.pass; // reuses SMTP_PASS var

  // SendGrid rejects duplicate addresses across to/cc — only add cc if different from to
  const ccList = cc && cc.toLowerCase() !== to.toLowerCase() ? [{ email: cc }] : undefined;

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }], cc: ccList }],
      from: { email: config.EMAIL.from, name: 'THS Dock Audit' },
      subject,
      content: [{ type: 'text/html', value: html }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`SendGrid ${response.status}: ${body}`);
  }
}

function buildSubject(audit) {
  const type = audit.audit_type_name || audit.type || 'Audit';
  const ref  = audit.po_number || audit.so_number || '—';
  const entity = audit.supplier || audit.customer || '—';
  const flag = audit.has_discrepancy ? '⚠️ DISCREPANCY — ' : '✅ ';
  return `${flag}${type} Audit: ${entity} · ${ref} · ${dayjs(audit.audit_date).format('M/D/YYYY')}`;
}

function buildHtml(audit, lineItems, discrepancies) {
  const type   = audit.audit_type_name || audit.type || 'Audit';
  const date   = dayjs(audit.audit_date).format('MMMM D, YYYY');
  const entity = audit.supplier || audit.customer || '—';
  const ref    = audit.po_number ? `PO #${audit.po_number}` : audit.so_number ? `SO #${audit.so_number}` : '—';
  const qScore = ['—', 'Fail (1)', 'Pass w/ Issues (2)', 'Pass (3)'][audit.quality_score] || '—';
  const color  = audit.has_discrepancy ? '#c53030' : '#276749';
  const statusLabel = audit.has_discrepancy ? '⚠️ Discrepancy Flagged' : '✅ Clean';

  let discrepancySection = '';
  if (discrepancies && discrepancies.length > 0) {
    const rows = discrepancies.map(d => `
      <tr>
        <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;">${d.discrepancy_type || '—'}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;">${d.description || '—'}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;">${d.qty_affected || '—'}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;">${d.disposition || '—'}</td>
      </tr>`).join('');
    discrepancySection = `
      <h3 style="color:#c53030;margin:24px 0 8px;font-size:14px;">Discrepancies</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr style="background:#fff5f5;">
          <th style="padding:6px 12px;text-align:left;border-bottom:2px solid #fc8181;">Type</th>
          <th style="padding:6px 12px;text-align:left;border-bottom:2px solid #fc8181;">Description</th>
          <th style="padding:6px 12px;text-align:left;border-bottom:2px solid #fc8181;">Qty</th>
          <th style="padding:6px 12px;text-align:left;border-bottom:2px solid #fc8181;">Disposition</th>
        </tr>
        ${rows}
      </table>`;
  }

  const appUrl = process.env.APP_URL || 'https://dock-audit-production.up.railway.app';

  return `<!DOCTYPE html>
<html>
<body style="font-family:system-ui,sans-serif;background:#f7fafc;margin:0;padding:24px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
    <div style="background:${color};padding:20px 24px;">
      <h1 style="color:#fff;margin:0;font-size:18px;">${type} Audit Complete</h1>
      <p style="color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:14px;">${statusLabel}</p>
    </div>
    <div style="padding:24px;">
      <table style="width:100%;font-size:14px;border-collapse:collapse;">
        <tr><td style="padding:5px 0;color:#718096;width:140px;">Date</td><td style="padding:5px 0;font-weight:500;">${date}</td></tr>
        <tr><td style="padding:5px 0;color:#718096;">Auditor</td><td style="padding:5px 0;font-weight:500;">${audit.auditor_name || '—'}</td></tr>
        <tr><td style="padding:5px 0;color:#718096;">${audit.supplier ? 'Supplier' : 'Customer'}</td><td style="padding:5px 0;font-weight:500;">${entity}</td></tr>
        <tr><td style="padding:5px 0;color:#718096;">Reference</td><td style="padding:5px 0;font-weight:500;">${ref}</td></tr>
        <tr><td style="padding:5px 0;color:#718096;">Carrier</td><td style="padding:5px 0;font-weight:500;">${audit.carrier || '—'}</td></tr>
        ${audit.item_name ? `<tr><td style="padding:5px 0;color:#718096;">Item</td><td style="padding:5px 0;font-weight:500;">${audit.item_name}</td></tr>` : ''}
        ${audit.qty_expected != null ? `<tr><td style="padding:5px 0;color:#718096;">Qty Expected</td><td style="padding:5px 0;font-weight:500;">${audit.qty_expected}</td></tr>` : ''}
        ${audit.qty_received != null ? `<tr><td style="padding:5px 0;color:#718096;">Qty Received</td><td style="padding:5px 0;font-weight:500;">${audit.qty_received}</td></tr>` : ''}
        <tr><td style="padding:5px 0;color:#718096;">Quality Score</td><td style="padding:5px 0;font-weight:500;">${qScore}</td></tr>
        ${audit.truck_temp_f != null ? `<tr><td style="padding:5px 0;color:#718096;">Truck Temp</td><td style="padding:5px 0;font-weight:500;">${audit.truck_temp_f}°F ${audit.temp_in_range ? 'In range' : 'OUT OF RANGE'}</td></tr>` : ''}
        ${audit.notes ? `<tr><td style="padding:5px 0;color:#718096;">Notes</td><td style="padding:5px 0;">${audit.notes}</td></tr>` : ''}
      </table>
      ${discrepancySection}
      <div style="margin-top:24px;">
        <a href="${appUrl}" style="display:inline-block;background:#1a202c;color:#fff;text-decoration:none;padding:10px 20px;border-radius:4px;font-size:13px;">View in Dock Audit App →</a>
      </div>
    </div>
    <div style="padding:12px 24px;background:#f7fafc;border-top:1px solid #e2e8f0;font-size:11px;color:#a0aec0;">
      The Honest Stand — Dock Audit Tool · Internal Use Only
    </div>
  </div>
</body>
</html>`;
}

async function sendAuditComplete(audit, lineItems = [], discrepancies = []) {
  if (!config.EMAIL.enabled) {
    console.log('ℹ️  Email disabled — skipping send');
    return { skipped: true };
  }

  try {
    // Recipient by audit type — inbound goes to Stephen, outbound to Ben
    let to = config.EMAIL.inbound_flags_to;
    if (audit.type === 'outbound') to = config.EMAIL.outbound_flags_to;

    const subject = buildSubject(audit);
    const html    = buildHtml(audit, lineItems, discrepancies);
    await sendViaSendGrid(to, config.EMAIL.cc_always, subject, html);

    console.log(`✅ Email sent → ${to}`);
    return { success: true };
  } catch (err) {
    console.error('❌ Email error:', err.message);
    return { error: err.message };
  }
}

module.exports = { sendAuditComplete };
