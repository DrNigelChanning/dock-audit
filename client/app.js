// app.js — root app, dynamic audit type home screen

const { useState, useEffect } = React;
const { api } = window.appUtils;

function App() {
  const [view, setView]           = useState('home');
  const [auditTypes, setAuditTypes] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [selectedType, setSelectedType] = useState(null);
  const [draftAudit, setDraftAudit]   = useState(null);  // set when resuming a draft
  const [loadingTypes, setLoadingTypes] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/api/audit-types'),
      api.get('/api/team'),
    ]).then(([types, team]) => {
      setAuditTypes(types || []);
      setTeamMembers(team || []);
    }).catch(console.error).finally(() => setLoadingTypes(false));
  }, []);

  const handleSelectType = (auditType) => {
    setSelectedType(auditType);
    setDraftAudit(null);
    setView('form');
  };

  const handleResumeDraft = (audit) => {
    // Find the matching audit type from our loaded types
    const auditType = auditTypes.find(t => t.id === audit.audit_type_id)
      || { id: audit.audit_type_id, name: audit.audit_type_name || audit.type, icon: audit.audit_type_icon || '📋', color: audit.audit_type_color || '#00d4aa' };
    setSelectedType(auditType);
    setDraftAudit(audit);
    setView('form');
  };

  const handleComplete = () => {
    setSelectedType(null);
    setDraftAudit(null);
    setView('success');
  };

  const handleCancel = () => {
    setSelectedType(null);
    setDraftAudit(null);
    setView('home');
  };

  // ─── Home ──────────────────────────────────────────────────────
  if (view === 'home') return (
    <div>
      <div className="app-header">
        <div className="app-header-logo">
          <div className="icon">🚢</div>
          <div>
            <div className="app-header-title">THS Dock Audit</div>
            <div className="app-header-sub">The Honest Stand / Bolder Foods</div>
          </div>
        </div>
        <button
          className="btn btn-outline btn-sm"
          onClick={() => setView('history')}
          style={{ color: 'white', borderColor: 'rgba(255,255,255,.3)', padding: '6px 12px', fontSize: 12 }}
        >
          History
        </button>
      </div>

      <div className="main-content">
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--gray-900)', marginBottom: 4 }}>
            Start a new audit
          </div>
          <div style={{ fontSize: 14, color: 'var(--gray-500)' }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
        </div>

        {loadingTypes ? (
          <div style={{ color: 'var(--gray-400)', fontSize: 14, padding: '24px 0' }}>Loading audit types…</div>
        ) : (
          <div className="start-grid">
            {auditTypes.map(at => (
              <div key={at.id} className="start-card" onClick={() => handleSelectType(at)}>
                <div className="start-card-icon">{at.icon}</div>
                <div className="start-card-label">{at.name}</div>
                <div className="start-card-sub">{at.question_count} questions</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 32 }}>
          <div className="section-title">Recent audits</div>
          <RecentAudits onSelect={() => setView('history')} />
        </div>
      </div>
    </div>
  );

  // ─── Audit Form ────────────────────────────────────────────────
  if (view === 'form' && selectedType) return (
    <div>
      <AuditForm
        auditType={selectedType}
        teamMembers={teamMembers}
        draftAudit={draftAudit}
        onComplete={handleComplete}
        onCancel={handleCancel}
      />
    </div>
  );

  // ─── Success ───────────────────────────────────────────────────
  if (view === 'success') return (
    <div>
      <div className="app-header">
        <div className="app-header-logo">
          <div className="icon">✅</div>
          <div>
            <div className="app-header-title">Audit Submitted</div>
            <div className="app-header-sub">THS Dock Audit</div>
          </div>
        </div>
      </div>
      <div className="main-content" style={{ textAlign: 'center', paddingTop: 48 }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Audit submitted</div>
        <div style={{ fontSize: 14, color: 'var(--gray-500)', marginBottom: 32 }}>
          PDF is generating in the background.
        </div>
        <button className="btn btn-primary" onClick={() => setView('home')} style={{ marginRight: 12 }}>
          New Audit
        </button>
        <button className="btn btn-outline" onClick={() => setView('history')}>
          View History
        </button>
      </div>
    </div>
  );

  // ─── History ───────────────────────────────────────────────────
  if (view === 'history') return (
    <div>
      <div className="app-header">
        <div className="app-header-logo">
          <div className="icon">📋</div>
          <div>
            <div className="app-header-title">Audit History</div>
            <div className="app-header-sub">THS Dock Audit</div>
          </div>
        </div>
        <button
          className="btn btn-outline btn-sm"
          onClick={() => setView('home')}
          style={{ color: 'white', borderColor: 'rgba(255,255,255,.3)', padding: '6px 12px', fontSize: 12 }}
        >
          ← Home
        </button>
      </div>
      <AuditHistory onResumeDraft={handleResumeDraft} />
    </div>
  );

  return null;
}

// ─── RecentAudits ──────────────────────────────────────────────────────────
function RecentAudits({ onSelect }) {
  const [audits, setAudits] = useState([]);
  const { fmtDate } = window.appUtils;

  useEffect(() => {
    api.get('/api/audits?limit=5').then(r => setAudits(r.audits || [])).catch(console.error);
  }, []);

  if (!audits.length) return (
    <div className="empty-state">
      <div className="empty-state-icon">📋</div>
      <div className="empty-state-title">No audits yet</div>
      <div className="empty-state-sub">Your recent audits will appear here</div>
    </div>
  );

  return (
    <div>
      {audits.map(audit => (
        <div key={audit.id} className="audit-row" style={{ display: 'flex', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--gray-100)' }}>
          <div style={{ fontSize: 22, marginRight: 12 }}>{audit.audit_type_icon || '📋'}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{audit.audit_type_name || audit.type}</div>
            <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
              {audit.supplier || audit.customer || '—'} · {fmtDate(audit.audit_date)}
            </div>
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: audit.status === 'submitted' ? 'var(--green)' : 'var(--yellow)' }}>
            {audit.status === 'submitted' ? 'Submitted' : 'Draft'}
          </div>
        </div>
      ))}
    </div>
  );
}

window.RecentAudits = RecentAudits;

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
