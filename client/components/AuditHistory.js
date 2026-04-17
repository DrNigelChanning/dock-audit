// AuditHistory.js — searchable audit history for desktop review

const { useState, useEffect } = React;
const { api, fmtDate, fmtDateTime } = window.appUtils;
const { Badge, Alert } = window.UI;

function AuditHistory({ onNewAudit, onResumeDraft }) {
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // Filters
  const [filters, setFilters] = useState({
    type: '', supplier: '', po_number: '', has_discrepancy: ''
  });

  const fetchAudits = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
      params.set('limit', '50');
      const { audits } = await api.get(`/api/audits?${params}`);
      setAudits(audits);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAudits(); }, [filters]);

  const deleteDraft = async (audit, e) => {
    e.stopPropagation();
    if (!window.confirm(`Delete this draft ${audit.audit_type_name || audit.type} audit? This cannot be undone.`)) return;
    setDeletingId(audit.id);
    try {
      await api.delete(`/api/audits/${audit.id}`);
      setAudits(prev => prev.filter(a => a.id !== audit.id));
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const loadDetail = async (id) => {
    setSelected(id);
    setLoadingDetail(true);
    try {
      const data = await api.get(`/api/audits/${id}`);
      setDetail(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDetail(false);
    }
  };

  const conditionBadgeColor = (c) => ({
    'Good': 'green', 'Minor damage': 'yellow',
    'Major damage': 'red', 'Rejected': 'red'
  }[c] || 'gray');

  return (
    <div>
      {/* Search / Filter bar */}
      <div className="card">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="select-wrapper">
            <select
              className="form-select"
              value={filters.type}
              onChange={e => setFilters(f => ({ ...f, type: e.target.value }))}
            >
              <option value="">All types</option>
              <option value="inbound">📥 Inbound</option>
              <option value="outbound">🚢 Outbound</option>
            </select>
          </div>
          <div className="select-wrapper">
            <select
              className="form-select"
              value={filters.has_discrepancy}
              onChange={e => setFilters(f => ({ ...f, has_discrepancy: e.target.value }))}
            >
              <option value="">All audits</option>
              <option value="true">⚠️ Flags only</option>
              <option value="false">✅ Clean only</option>
            </select>
          </div>
          <input
            className="form-input"
            placeholder="Search PO #..."
            value={filters.po_number}
            onChange={e => setFilters(f => ({ ...f, po_number: e.target.value }))}
          />
          <input
            className="form-input"
            placeholder="Search supplier..."
            value={filters.supplier}
            onChange={e => setFilters(f => ({ ...f, supplier: e.target.value }))}
          />
        </div>
      </div>

      {loading ? (
        <div className="loading-state"><div className="spinner" /><div style={{ marginTop: 12 }}>Loading audits...</div></div>
      ) : audits.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <div className="empty-state-title">No audits found</div>
          <div className="empty-state-sub">Completed audits will appear here</div>
          <button className="btn btn-primary" onClick={onNewAudit} style={{ marginTop: 16, width: 'auto', padding: '12px 24px' }}>
            Start First Audit
          </button>
        </div>
      ) : (
        <div>
          {selected && detail ? (
            <AuditDetail
              audit={detail}
              loading={loadingDetail}
              onBack={() => { setSelected(null); setDetail(null); }}
            />
          ) : (
            audits.map(audit => (
              <div key={audit.id} className="audit-card" onClick={() => audit.status === 'draft' ? null : loadDetail(audit.id)}
                style={{ cursor: audit.status === 'draft' ? 'default' : 'pointer' }}>
                <div className={`audit-card-icon ${audit.type}`}>
                  {audit.audit_type_icon || (audit.type === 'inbound' ? '📥' : '🚢')}
                </div>
                <div className="audit-card-body">
                  <div className="audit-card-title">
                    {audit.audit_type_name || audit.type} — {audit.supplier || audit.customer || audit.auditor_name || '—'}
                  </div>
                  <div className="audit-card-meta">
                    {fmtDate(audit.audit_date)} · {audit.location || '—'} · {audit.auditor_name || '—'}
                  </div>
                </div>
                <div className="audit-card-right" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <Badge color={audit.status === 'submitted' ? 'navy' : 'gray'}>
                    {audit.status}
                  </Badge>
                  {audit.status === 'draft' && onResumeDraft ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={e => { e.stopPropagation(); onResumeDraft(audit); }}
                        style={{ fontSize: 11, padding: '4px 10px' }}
                      >
                        Resume →
                      </button>
                      <button
                        className="btn btn-sm"
                        onClick={e => deleteDraft(audit, e)}
                        disabled={deletingId === audit.id}
                        style={{ fontSize: 11, padding: '4px 10px', background: 'var(--red-light, #fff1f0)', color: 'var(--red)', border: '1px solid var(--red)', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}
                      >
                        {deletingId === audit.id ? '…' : '🗑'}
                      </button>
                    </div>
                  ) : audit.has_discrepancy ? (
                    <Badge color="red">⚠️ Flag</Badge>
                  ) : audit.status === 'submitted' ? (
                    <Badge color="green">✅ Clean</Badge>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function AuditDetail({ audit, loading, onBack }) {
  const { fmtDateTime } = window.appUtils;
  const { Badge } = window.UI;

  if (loading) return (
    <div className="loading-state"><div className="spinner" /><div style={{ marginTop: 12 }}>Loading audit...</div></div>
  );

  if (!audit) return null;

  const isInbound = audit.type === 'inbound';
  const lineItems = audit.lineItems || [];
  const discrepancies = audit.discrepancies || [];

  return (
    <div>
      <button className="btn btn-outline" onClick={onBack} style={{ marginBottom: 16 }}>
        ← Back to list
      </button>

      {/* Header */}
      <div className="card" style={{ background: 'var(--navy)', color: 'white', border: 'none' }}>
        <div style={{ fontSize: 11, opacity: .6, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 4 }}>
          {isInbound ? 'Inbound Receiving Audit' : 'Outbound Shipping Audit'}
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
          {isInbound ? `PO #${audit.po_number}` : `SO #${audit.so_number}`}
        </div>
        <div style={{ fontSize: 13, opacity: .7 }}>
          {isInbound ? audit.supplier : audit.customer} · {fmtDateTime(audit.audit_date)}
        </div>
        {audit.pdf_filename && (
          <a
            href={`/pdfs/${audit.pdf_filename}`}
            target="_blank"
            rel="noopener"
            className="btn btn-amber"
            style={{ marginTop: 14, display: 'inline-flex', width: 'auto', padding: '10px 18px', fontSize: 14, textDecoration: 'none' }}
          >
            📄 Download PDF Report
          </a>
        )}
      </div>

      {/* Flag banner */}
      {audit.has_discrepancy ? (
        <div className="alert alert-red">
          <div className="alert-icon">⚠️</div>
          <div>
            <div className="alert-title">Discrepancies found</div>
            <div className="alert-body">{discrepancies.length} discrepancy record(s)</div>
          </div>
        </div>
      ) : (
        <div className="alert alert-green">
          <div className="alert-icon">✅</div>
          <div><div className="alert-title">Clean audit — no discrepancies</div></div>
        </div>
      )}

      {/* Details */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>Audit Details</div>
        {[
          ['Auditor', audit.auditor_name],
          ['Location', audit.location],
          ['Carrier', audit.carrier],
          ['Trailer #', audit.trailer_number],
          ['Seal #', `${audit.seal_number || '—'} ${audit.seal_intact ? '✅ Intact' : audit.seal_intact === 0 ? '🔴 Broken' : ''}`],
          ['Submitted', fmtDateTime(audit.submitted_at)],
        ].map(([label, value]) => value && (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--gray-100)', fontSize: 14 }}>
            <span style={{ color: 'var(--gray-500)', fontWeight: 600 }}>{label}</span>
            <span style={{ fontWeight: 500 }}>{value}</span>
          </div>
        ))}
      </div>

      {/* Temp */}
      {audit.is_refrigerated && (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>🌡️ Temperature</div>
          <div className={`temp-display ${audit.temp_in_range ? 'temp-ok' : 'temp-fail'}`} style={{ fontSize: 36 }}>
            {audit.truck_temp_f}°F — {audit.temp_in_range ? 'In range ✅' : 'OUT OF RANGE 🔴'}
          </div>
          {audit.temp_gun_photo && <img src={audit.temp_gun_photo} style={{ width: '100%', borderRadius: 8, marginTop: 8 }} alt="Temp gun" />}
          {audit.temp_control_photo && <img src={audit.temp_control_photo} style={{ width: '100%', borderRadius: 8, marginTop: 8 }} alt="Temp control" />}
        </div>
      )}

      {/* Line items */}
      {lineItems.length > 0 && (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 14 }}>{isInbound ? 'Items Received' : 'Items Loaded'}</div>
          {lineItems.map((li, i) => {
            const { calcVariance, varianceClass } = window.appUtils;
            const v = li.expected_qty && li.actual_qty !== null
              ? calcVariance(li.expected_qty, li.actual_qty) : null;
            return (
              <div key={i} style={{ paddingBottom: 14, marginBottom: 14, borderBottom: i < lineItems.length - 1 ? '1px solid var(--gray-100)' : 'none' }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{li.item_name}</div>
                {li.part_number && <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>{li.part_number}</div>}
                <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 13 }}>
                  <span>Expected: <strong>{li.expected_qty} {li.unit_of_measure}</strong></span>
                  <span>Actual: <strong>{li.actual_qty} {li.unit_of_measure}</strong></span>
                  {v && <span className={`badge badge-${Math.abs(v.pct) <= 0.05 ? 'green' : Math.abs(v.pct) <= 0.15 ? 'yellow' : 'red'}`}>{v.pctDisplay}</span>}
                </div>
                <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {li.lot_code && <Badge color="navy">Lot: {li.lot_code}</Badge>}
                  {li.expiration_date && <Badge color="gray">Exp: {li.expiration_date}</Badge>}
                  {li.condition && <Badge color={li.condition === 'Good' ? 'green' : li.condition === 'Minor damage' ? 'yellow' : 'red'}>{li.condition}</Badge>}
                </div>
                {li.condition_notes && <div style={{ marginTop: 6, fontSize: 13, color: 'var(--gray-600)', background: 'var(--gray-50)', padding: '8px 10px', borderRadius: 6 }}>{li.condition_notes}</div>}
                {li.condition_photo && <img src={li.condition_photo} style={{ width: '100%', borderRadius: 8, marginTop: 8 }} alt="Condition" />}
              </div>
            );
          })}
        </div>
      )}

      {/* Discrepancies */}
      {discrepancies.length > 0 && (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 14, color: 'var(--red)' }}>⚠️ Discrepancies</div>
          {discrepancies.map((d, i) => (
            <div key={i} className="discrepancy-item">
              <div className="discrepancy-type">{d.discrepancy_type}</div>
              {d.description && <div style={{ fontSize: 13, marginTop: 4 }}>{d.description}</div>}
              {d.qty_affected && <div style={{ fontSize: 13, color: 'var(--gray-600)', marginTop: 4 }}>Qty affected: {d.qty_affected}</div>}
              {d.disposition && <Badge color="red" style={{ marginTop: 6 }}>{d.disposition}</Badge>}
              {d.photo && <img src={d.photo} style={{ width: '100%', borderRadius: 8, marginTop: 8 }} alt="Discrepancy" />}
            </div>
          ))}
        </div>
      )}

      {/* Scores */}
      {isInbound && (audit.quality_score || audit.docs_score) && (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 14 }}>Scorecard Impact</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {audit.quality_score && (
              <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', marginBottom: 4 }}>Quality</div>
                <Badge color={audit.quality_score === 3 ? 'green' : audit.quality_score === 2 ? 'yellow' : 'red'}>
                  {audit.quality_score === 3 ? '3 — Green' : audit.quality_score === 2 ? '2 — Yellow' : '1 — Red'}
                </Badge>
              </div>
            )}
            {audit.docs_score && (
              <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', marginBottom: 4 }}>Docs</div>
                <Badge color={audit.docs_score === 3 ? 'green' : audit.docs_score === 2 ? 'yellow' : 'red'}>
                  {audit.docs_score === 3 ? '3 — Green' : audit.docs_score === 2 ? '2 — Yellow' : '1 — Red'}
                </Badge>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Notes */}
      {audit.notes && (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 8 }}>Notes</div>
          <div style={{ fontSize: 14, whiteSpace: 'pre-line', color: 'var(--gray-700)' }}>{audit.notes}</div>
        </div>
      )}
    </div>
  );
}

window.AuditHistory = AuditHistory;
