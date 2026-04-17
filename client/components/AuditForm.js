// AuditForm.js — Fully dynamic, question-driven audit form
// Loads questions from API. Renders by section. Line items always present.

const { useState, useEffect, useRef } = React;
const { api, calcVariance, varianceClass, tempInRange, fmtDate } = window.appUtils;
const { PhotoUpload, YesNo, ConditionSelect, SelectField, TextField, NumberField, Alert, Badge, StepProgress } = window.UI;

const DISCREPANCY_TYPES = [
  'Short shipment', 'Over shipment', 'Damaged goods', 'Wrong item',
  'Lot code mismatch', 'Temp exceedance', 'Missing documentation', 'Refused', 'Other'
];
const DISPOSITIONS = ['Accept', 'Accept with note', 'Hold for inspection', 'Refuse', 'Return to carrier'];

// ─── LineItemEditor ──────────────────────────────────────────────────────────
function LineItemEditor({ item, index, auditId, onChange, onRemove, showFacesheet }) {
  const variance = (item.expected_qty && item.actual_qty !== '')
    ? calcVariance(item.expected_qty, item.actual_qty) : null;

  return (
    <div className="line-item">
      <div className="line-item-header">
        <div>
          <div className="line-item-name">{item.item_name || `Item ${index + 1}`}</div>
          {item.part_number && <div className="line-item-number">{item.part_number}</div>}
        </div>
        <button className="btn btn-danger btn-sm" onClick={onRemove} type="button">Remove</button>
      </div>

      <TextField label="Item name" value={item.item_name} onChange={v => onChange({ ...item, item_name: v })} placeholder="e.g. Ground Conventional Chicken" required />
      <TextField label="Part number" value={item.part_number} onChange={v => onChange({ ...item, part_number: v })} placeholder="e.g. I-R-31" mono />

      <div className="qty-grid">
        <NumberField label="Expected qty" value={item.expected_qty} onChange={v => onChange({ ...item, expected_qty: v })} unit={item.unit_of_measure || 'lbs'} />
        <NumberField label="Actual qty" value={item.actual_qty} onChange={v => onChange({ ...item, actual_qty: v })} unit={item.unit_of_measure || 'lbs'} />
      </div>

      {variance !== null && (
        <div className={`variance-display ${varianceClass(variance.pct)}`} style={{ marginBottom: 12 }}>
          {variance.pctDisplay} variance &nbsp;·&nbsp; {variance.variance >= 0 ? '+' : ''}{variance.variance.toFixed(1)} {item.unit_of_measure || 'lbs'}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <SelectField label="Unit" value={item.unit_of_measure} onChange={v => onChange({ ...item, unit_of_measure: v })} options={['lbs', 'kg', 'cases', 'units', 'gallons']} />
        <TextField label="Lot code" value={item.lot_code} onChange={v => onChange({ ...item, lot_code: v })} placeholder="As printed" mono hint="Exactly as on product" />
      </div>

      <TextField label="Expiration date" value={item.expiration_date} onChange={v => onChange({ ...item, expiration_date: v })} type="date" />

      <div className="form-group">
        <label className="form-label">Condition</label>
        <ConditionSelect value={item.condition} onChange={v => onChange({ ...item, condition: v })} />
      </div>

      {(item.condition === 'Minor damage' || item.condition === 'Major damage' || item.condition === 'Rejected') && (
        <>
          <div className="form-group">
            <label className="form-label">Condition notes <span className="required">*</span></label>
            <textarea className="form-textarea" value={item.condition_notes || ''} onChange={e => onChange({ ...item, condition_notes: e.target.value })} placeholder="Describe the damage..." />
          </div>
          <div className="form-group">
            <label className="form-label">Photo of damage</label>
            <PhotoUpload auditId={auditId} label="Damage photo" value={item.condition_photo} onChange={v => onChange({ ...item, condition_photo: v })} />
          </div>
        </>
      )}

      {showFacesheet && (
        <>
          <div className="form-group">
            <label className="form-label">Facesheet correct?</label>
            <YesNo value={item.facesheet_correct} onChange={v => onChange({ ...item, facesheet_correct: v })} />
          </div>
          <div className="form-group">
            <label className="form-label">Facesheet photo <span className="required">*</span></label>
            <PhotoUpload auditId={auditId} label="Facesheet photo" value={item.facesheet_photo} onChange={v => onChange({ ...item, facesheet_photo: v })} />
          </div>
          <div className="form-group">
            <label className="form-label">Pallet / load photo</label>
            <PhotoUpload auditId={auditId} label="Pallet photo" value={item.pallet_photo} onChange={v => onChange({ ...item, pallet_photo: v })} />
          </div>
        </>
      )}
    </div>
  );
}

// ─── DiscrepancyEditor ───────────────────────────────────────────────────────
function DiscrepancyEditor({ discrepancy, index, auditId, onChange, onRemove }) {
  return (
    <div className="discrepancy-item">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="discrepancy-type">⚠️ Discrepancy {index + 1}</div>
        <button className="btn btn-danger btn-sm" onClick={onRemove} type="button">Remove</button>
      </div>
      <SelectField label="Type" value={discrepancy.discrepancy_type} onChange={v => onChange({ ...discrepancy, discrepancy_type: v })} options={DISCREPANCY_TYPES} required />
      <div className="form-group">
        <label className="form-label">Description</label>
        <textarea className="form-textarea" value={discrepancy.description || ''} onChange={e => onChange({ ...discrepancy, description: e.target.value })} placeholder="What happened?" style={{ minHeight: 60 }} />
      </div>
      <NumberField label="Quantity affected" value={discrepancy.qty_affected} onChange={v => onChange({ ...discrepancy, qty_affected: v })} unit="lbs / units" />
      <SelectField label="Disposition" value={discrepancy.disposition} onChange={v => onChange({ ...discrepancy, disposition: v })} options={DISPOSITIONS} required />
      <div className="form-group">
        <label className="form-label">Photo</label>
        <PhotoUpload auditId={auditId} label="Discrepancy photo" value={discrepancy.photo} onChange={v => onChange({ ...discrepancy, photo: v })} />
      </div>
    </div>
  );
}

// ─── DynamicQuestion ─────────────────────────────────────────────────────────
// Renders a single question of any type.
function DynamicQuestion({ q, value, onChange, auditId, loadType }) {
  // note type = instruction block, no answer
  if (q.type === 'note') {
    return (
      <div style={{ background: 'var(--yellow-light)', border: '1px solid var(--yellow)', borderRadius: 8, padding: '12px 14px', marginBottom: 12, fontSize: 14 }}>
        <strong>📌 {q.question}</strong>
      </div>
    );
  }

  const label = (
    <label className="form-label">
      {q.question}
      {q.required ? <span className="required"> *</span> : null}
    </label>
  );

  if (q.type === 'yes_no') return (
    <div className="form-group">{label}<YesNo value={value} onChange={onChange} /></div>
  );

  if (q.type === 'photo') return (
    <div className="form-group">
      {label}
      <PhotoUpload auditId={auditId} label={q.question} value={value} onChange={onChange} />
    </div>
  );

  if (q.type === 'select') return (
    <SelectField label={q.question} value={value} onChange={onChange} options={q.options || []} required={!!q.required} />
  );

  if (q.type === 'number') return (
    <NumberField label={q.question} value={value} onChange={onChange} required={!!q.required} />
  );

  if (q.type === 'temperature') {
    const tempSpec = loadType === 'Frozen' ? 'frozen_inbound' : 'refrigerated_inbound';
    const ranges = { frozen_inbound: 'below 32°F', refrigerated_inbound: '33–40°F' };
    return (
      <div>
        <NumberField label={q.question} value={value} onChange={onChange} unit="°F" required={!!q.required} />
        {value !== '' && value !== null && value !== undefined && (() => {
          const ok = tempInRange(value, tempSpec);
          return (
            <div className={`temp-display ${ok === true ? 'temp-ok' : ok === false ? 'temp-fail' : 'temp-warn'}`} style={{ marginTop: -8, marginBottom: 12 }}>
              {value}°F {ok === true ? '✓ In range' : ok === false ? '⚠ OUT OF RANGE' : ''} ({ranges[tempSpec]})
            </div>
          );
        })()}
      </div>
    );
  }

  // default: text
  return (
    <TextField label={q.question} value={value || ''} onChange={onChange} required={!!q.required} />
  );
}

// ─── AuditForm (main) ────────────────────────────────────────────────────────
function AuditForm({ auditType, teamMembers, draftAudit, onComplete, onCancel }) {
  const [questions, setQuestions]   = useState([]);   // flat list from API
  const [sections, setSections]     = useState([]);   // unique section names in order
  const [loading, setLoading]       = useState(true);

  const [step, setStep]             = useState(draftAudit ? 1 : 0); // skip Setup if resuming
  const [auditId, setAuditId]       = useState(draftAudit?.id || null);
  const [saving, setSaving]         = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState(null);

  // Core setup fields — pre-fill from draft if resuming
  const [auditorName, setAuditorName] = useState(draftAudit?.auditor_name || '');
  const [location, setLocation]       = useState(draftAudit?.location || '');

  // Restore question answers from draft
  const [answers, setAnswers] = useState(() => {
    if (!draftAudit?.question_answers) return {};
    try { return JSON.parse(draftAudit.question_answers); } catch { return {}; }
  });

  // Line items + discrepancies
  const [lineItems, setLineItems]       = useState([]);
  const [discrepancies, setDiscrepancies] = useState([]);

  // Outbound? drives facesheet display in line item editor
  const isOutbound = auditType.name.toLowerCase() === 'outbound';

  // Fetch questions for this audit type
  useEffect(() => {
    api.get(`/api/audit-types/${auditType.id}/questions`)
      .then(qs => {
        setQuestions(qs);
        // Build ordered unique section list — sort by minimum sort_order within each section
        const minOrder = {};
        qs.forEach(q => {
          if (minOrder[q.section] === undefined || q.sort_order < minOrder[q.section]) {
            minOrder[q.section] = q.sort_order;
          }
        });
        const seen = new Set();
        const ordered = qs
          .slice()
          .sort((a, b) => (minOrder[a.section] ?? 0) - (minOrder[b.section] ?? 0))
          .reduce((acc, q) => {
            if (!seen.has(q.section)) { seen.add(q.section); acc.push(q.section); }
            return acc;
          }, []);
        setSections(ordered.filter(s => s.toLowerCase() !== 'setup'));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [auditType.id]);

  // If resuming a draft, load its existing line items and discrepancies
  useEffect(() => {
    if (!draftAudit?.id) return;
    api.get(`/api/audits/${draftAudit.id}`).then(data => {
      if (data.lineItems?.length) {
        setLineItems(data.lineItems.map(li => ({ ...li, _saved: true, _id: li.id })));
      }
      if (data.discrepancies?.length) {
        setDiscrepancies(data.discrepancies.map(d => ({ ...d, _saved: true })));
      }
    }).catch(console.error);
  }, [draftAudit?.id]);

  // Steps = Setup + each section + Review (Line Items removed — questions handle item data)
  const STEPS = loading ? ['Loading…'] : ['Setup', ...sections, 'Review'];
  const totalSteps = STEPS.length;

  const setAnswer = (qId, val) => setAnswers(prev => ({ ...prev, [qId]: val }));

  // ─── Create / update audit on server ───────────────────────────
  const ensureAuditCreated = async () => {
    if (auditId) return auditId;  // already exists (new or resumed draft)
    const body = {
      type: auditType.name,
      audit_type_id: auditType.id,
      auditor_name: auditorName,
      location,
      audit_date: new Date().toISOString(),
    };
    const { id } = await api.post('/api/audits', body);
    setAuditId(id);
    return id;
  };

  const saveCurrentStep = async (id) => {
    const stepName = STEPS[step];

    if (stepName === 'Setup') {
      const setupQs = questions.filter(q => q.section.toLowerCase() === 'setup');
      const setupAnswers = {};
      setupQs.forEach(q => { if (answers[q.id] !== undefined) setupAnswers[q.id] = answers[q.id]; });
      const patch = { auditor_name: auditorName, location };
      // Map well-known Setup questions to structured columns
      setupQs.forEach(q => {
        const val = answers[q.id];
        if (val === undefined || val === null) return;
        const ql = q.question.toLowerCase();
        if (ql.includes('po number'))  patch.po_number = val;
        if (ql.includes('so number'))  patch.so_number = val;
        if (ql.includes('supplier'))   patch.supplier = val;
        if (ql.includes('customer'))   patch.customer = val;
        if (ql.includes('carrier'))    patch.carrier = val;
      });
      if (Object.keys(setupAnswers).length) patch.question_answers = setupAnswers;
      await api.patch(`/api/audits/${id}`, patch);
      return;
    }

    if (stepName === 'Review') return;

    // For a section step — save the question_answers for questions in this section
    const sectionQuestions = questions.filter(q => q.section === stepName);
    const sectionAnswers = {};
    sectionQuestions.forEach(q => { if (answers[q.id] !== undefined) sectionAnswers[q.id] = answers[q.id]; });

    // Also save any structured fields we can extract
    const patch = { question_answers: sectionAnswers };

    // Map well-known question text → structured columns for backward compat + PDF
    sectionQuestions.forEach(q => {
      const val = answers[q.id];
      if (val === undefined || val === null) return;
      const ql = q.question.toLowerCase();
      if (ql.includes('po number'))             patch.po_number = val;
      if (ql.includes('so number'))             patch.so_number = val;
      if (ql.includes('supplier'))              patch.supplier = val;
      if (ql.includes('customer'))              patch.customer = val;
      if (ql.includes('carrier'))               patch.carrier = val;
      if (ql.includes('trailer') || ql.includes('truck / trailer')) patch.trailer_number = val;
      if (ql.includes('seal number'))           patch.seal_number = val;
      if (ql.includes('seal intact'))           patch.seal_intact = val;
      if (ql.includes('temperature (°f)') || ql.includes('interior temperature')) {
        patch.truck_temp_f = val;
        if (val !== '' && val !== null) patch.temp_in_range = tempInRange(val, 'refrigerated_inbound') ? 1 : 0;
      }
      if (ql.includes('temperature gun photo') && q.type === 'photo') patch.temp_gun_photo = val;
      if (ql.includes('temperature control') && q.type === 'photo')   patch.temp_control_photo = val;
      if (ql.includes('load type')) patch.is_refrigerated = val === 'Ambient' ? 0 : 1;
      if (ql.includes('truck condition') || ql.includes('clean and')) patch.truck_condition = typeof val === 'boolean' ? (val ? 'Clean' : 'Issues') : val;
      if (ql.includes('packing list'))          patch.packing_list_received = val;
      if (ql.includes('coa'))                   patch.coa_received = val;
      if (ql.includes('invoice'))               patch.invoice_received = val;
      if (ql.includes('bol number'))            patch.bol_number = val;
      if (ql.includes('bol signed'))            patch.bol_signed = val;
      if (ql.includes('bol photo'))             patch.bol_photo = val;
      if (ql === 'notes' || ql === 'additional notes') patch.notes = val;
    });

    await api.patch(`/api/audits/${id}`, patch);
  };

  // ─── Validation ──────────────────────────────────────────────────
  const validateStep = (stepIndex) => {
    const stepName = STEPS[stepIndex];

    if (stepName === 'Setup') {
      const missing = [];
      if (!auditorName) missing.push('Your name');
      if (!location) missing.push('Facility');
      questions
        .filter(q => q.section.toLowerCase() === 'setup' && q.required && q.type !== 'note')
        .forEach(q => {
          const val = answers[q.id];
          if (val === undefined || val === null || val === '') missing.push(q.question);
        });
      return missing;
    }

    if (stepName === 'Review') {
      // Full-form check across all sections
      const missing = [];
      sections.forEach(sec => {
        const secQs = questions.filter(q => q.section === sec && q.required && q.type !== 'note');
        secQs.forEach(q => {
          const val = answers[q.id];
          const isEmpty = val === undefined || val === null || val === '';
          if (isEmpty) missing.push(`${sec}: ${q.question}`);
        });
      });
      return missing;
    }

    // Section step — check required questions in this section
    const sectionQs = questions.filter(q => q.section === stepName && q.required && q.type !== 'note');
    return sectionQs
      .filter(q => {
        const val = answers[q.id];
        return val === undefined || val === null || val === '';
      })
      .map(q => q.question);
  };

  const handleNext = async () => {
    setError(null);
    const missing = validateStep(step);
    if (missing.length) {
      setError(`Required: ${missing.join(' · ')}`);
      return;
    }
    setSaving(true);
    try {
      const id = await ensureAuditCreated();
      await saveCurrentStep(id);
      setStep(s => s + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => setStep(s => Math.max(0, s - 1));

  const handleSubmit = async () => {
    setError(null);
    if (loading) { setError('Still loading — please wait.'); return; }
    // Final validation across all sections
    const missing = validateStep(STEPS.indexOf('Review'));
    if (missing.length) {
      setError(`Cannot submit — required fields missing: ${missing.join(' · ')}`);
      return;
    }
    setSubmitting(true);
    try {
      const id = auditId || await ensureAuditCreated();
      await saveCurrentStep(id);
      await api.post(`/api/audits/${id}/submit`, {});
      onComplete(id);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Step renders ────────────────────────────────────────────────
  const renderSetup = () => {
    const setupQs = questions.filter(q => q.section.toLowerCase() === 'setup');
    return (
      <div>
        <div className="card">
          <div className="card-header">
            <div className="card-header-icon navy" style={{ color: 'white' }}>👤</div>
            <div>
              <div className="card-title">Auditor & Location</div>
              <div className="card-subtitle">Who is completing this audit?</div>
            </div>
          </div>
          <SelectField
            label="Your name"
            value={auditorName}
            onChange={setAuditorName}
            options={teamMembers.map(m => ({ value: m.name, label: m.name }))}
            required
          />
          <SelectField
            label="Facility"
            value={location}
            onChange={setLocation}
            options={['Monarch', 'Horizon']}
            required
          />
        </div>
        {setupQs.length > 0 && (
          <div className="card">
            <div className="card-header">
              <div className="card-header-icon navy" style={{ color: 'white', background: auditType.color }}>{auditType.icon}</div>
              <div>
                <div className="card-title">Setup</div>
                <div className="card-subtitle">{auditType.name} audit — {setupQs.filter(q => q.type !== 'note').length} fields</div>
              </div>
            </div>
            {setupQs.map(q => (
              <DynamicQuestion
                key={q.id}
                q={q}
                value={answers[q.id]}
                onChange={val => setAnswer(q.id, val)}
                auditId={auditId}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  // Find the Load Type answer from any section (used for temp conditional logic)
  const loadTypeQ   = questions.find(q => q.question.toLowerCase().includes('load type'));
  const loadType    = loadTypeQ ? answers[loadTypeQ.id] : null;
  const isAmbient   = loadType === 'Ambient';

  const renderSection = (sectionName) => {
    const allSectionQs = questions.filter(q => q.section === sectionName);
    // Hide temperature questions (and temp-only photos) when load type is Ambient
    const sectionQs = allSectionQs.filter(q => {
      if (!isAmbient) return true;
      const ql = q.question.toLowerCase();
      return !(q.type === 'temperature' || ql.includes('temperature') || ql.includes('temp gun') || ql.includes('temp control') || ql.includes('setpoint'));
    });

    return (
      <div className="card">
        <div className="card-header">
          <div className="card-header-icon navy" style={{ color: 'white', background: auditType.color }}>{auditType.icon}</div>
          <div>
            <div className="card-title">{sectionName}</div>
            <div className="card-subtitle">{auditType.name} audit — {sectionQs.filter(q => q.type !== 'note').length} fields</div>
          </div>
        </div>
        {sectionQs.map(q => (
          <DynamicQuestion
            key={q.id}
            q={q}
            value={answers[q.id]}
            onChange={val => {
              setAnswer(q.id, val);
              // Map load type to is_refrigerated for downstream use
              if (q.question.toLowerCase().includes('load type')) {
                const patch = { is_refrigerated: val === 'Ambient' ? 0 : 1 };
                if (auditId) api.patch(`/api/audits/${auditId}`, patch).catch(console.error);
              }
            }}
            auditId={auditId}
            loadType={loadType}
          />
        ))}
      </div>
    );
  };

  const renderLineItems = () => (
    <div>
      {lineItems.length === 0 && (
        <div className="empty-state" style={{ padding: '32px 0' }}>
          <div className="empty-state-icon">📦</div>
          <div className="empty-state-title">No items yet</div>
          <div className="empty-state-sub">Add each item being received or shipped</div>
        </div>
      )}
      {lineItems.map((item, i) => (
        <LineItemEditor
          key={i}
          item={item}
          index={i}
          auditId={auditId}
          isOutbound={isOutbound}
          showFacesheet={isOutbound}
          onChange={updated => setLineItems(items => items.map((it, idx) => idx === i ? updated : it))}
          onRemove={() => setLineItems(items => items.filter((_, idx) => idx !== i))}
        />
      ))}
      <button className="btn btn-outline" onClick={() => setLineItems(items => [
        ...items,
        { item_name: '', part_number: '', expected_qty: '', actual_qty: '', unit_of_measure: 'lbs',
          lot_code: '', expiration_date: '', condition: 'Good', condition_notes: '', condition_photo: null,
          facesheet_correct: null, facesheet_photo: null, pallet_photo: null, _saved: false, _id: null }
      ])} type="button" style={{ width: '100%', marginBottom: 16 }}>
        + Add {lineItems.length === 0 ? 'First' : 'Another'} Item
      </button>

      {lineItems.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div className="card-header-icon red">⚠️</div>
            <div>
              <div className="card-title">Discrepancies</div>
              <div className="card-subtitle">Short shipments, damage, wrong items</div>
            </div>
          </div>
          {discrepancies.map((d, i) => (
            <DiscrepancyEditor
              key={i}
              discrepancy={d}
              index={i}
              auditId={auditId}
              onChange={updated => setDiscrepancies(ds => ds.map((dd, idx) => idx === i ? updated : dd))}
              onRemove={() => setDiscrepancies(ds => ds.filter((_, idx) => idx !== i))}
            />
          ))}
          <button
            className="btn btn-outline"
            onClick={() => setDiscrepancies(ds => [
              ...ds,
              { discrepancy_type: '', description: '', qty_affected: '', photo: null, disposition: '', _saved: false }
            ])}
            type="button" style={{ width: '100%' }}
          >
            + Log Discrepancy
          </button>
        </div>
      )}
    </div>
  );

  const renderReview = () => {
    const hasFlags = discrepancies.length > 0 ||
      lineItems.some(li => li.condition === 'Major damage' || li.condition === 'Rejected');

    return (
      <div>
        {hasFlags
          ? <Alert type="red" icon="⚠️" title="This audit has flags" body="Review carefully before submitting." />
          : <Alert type="green" icon="✅" title="Looks clean" body="No discrepancies detected. Ready to submit." />
        }

        <div className="card">
          <div className="card-title" style={{ marginBottom: 14 }}>Summary</div>
          <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
            <tbody>
              {[
                ['Audit type', `${auditType.icon} ${auditType.name}`],
                ['Auditor', auditorName],
                ['Location', location],
                ['Items', lineItems.length],
                ['Discrepancies', discrepancies.length],
              ].map(([label, value]) => (
                <tr key={label} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                  <td style={{ padding: '8px 0', color: 'var(--gray-500)', fontWeight: 600, width: '45%' }}>{label}</td>
                  <td style={{ padding: '8px 0', fontWeight: 500 }}>{value}</td>
                </tr>
              ))}
              {/* Show key question answers in review */}
              {questions.filter(q => q.type !== 'photo' && q.type !== 'note' && answers[q.id] !== undefined && answers[q.id] !== '').slice(0, 8).map(q => (
                <tr key={q.id} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                  <td style={{ padding: '8px 0', color: 'var(--gray-500)', fontWeight: 600, width: '45%', fontSize: 12 }}>{q.question}</td>
                  <td style={{ padding: '8px 0', fontWeight: 500, fontSize: 12 }}>
                    {answers[q.id] === true ? '✅ Yes' : answers[q.id] === false ? '🔴 No' : String(answers[q.id])}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {lineItems.length > 0 && (
          <div className="card">
            <div className="card-title" style={{ marginBottom: 14 }}>Items ({lineItems.length})</div>
            {lineItems.map((li, i) => {
              const v = li.expected_qty && li.actual_qty !== '' ? calcVariance(li.expected_qty, li.actual_qty) : null;
              return (
                <div key={i} style={{ borderBottom: i < lineItems.length - 1 ? '1px solid var(--gray-100)' : 'none', paddingBottom: 10, marginBottom: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{li.item_name}</div>
                  <div style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 3 }}>
                    {li.actual_qty ?? '?'} / {li.expected_qty ?? '?'} {li.unit_of_measure}
                    {v && <span style={{ marginLeft: 8, fontFamily: 'DM Mono', color: Math.abs(v.pct) > 0.15 ? 'var(--red)' : Math.abs(v.pct) > 0.05 ? 'var(--yellow)' : 'var(--green)', fontWeight: 700 }}>{v.pctDisplay}</span>}
                    {li.lot_code && <span style={{ marginLeft: 8, fontFamily: 'DM Mono', fontSize: 12 }}>Lot: {li.lot_code}</span>}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <Badge color={li.condition === 'Good' ? 'green' : li.condition === 'Minor damage' ? 'yellow' : 'red'}>
                      {li.condition || 'No condition set'}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ─── Step dispatch ───────────────────────────────────────────────
  const renderStep = () => {
    if (loading) return <div style={{ color: 'var(--gray-400)', padding: 32 }}>Loading questions…</div>;
    const name = STEPS[step];
    if (name === 'Setup')  return renderSetup();
    if (name === 'Review') return renderReview();
    return renderSection(name);
  };

  // ─── Shell ───────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--gray-200)', padding: '12px 16px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
              {auditType.icon} {auditType.name} Audit {draftAudit ? '· Resuming Draft' : ''}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-900)' }}>
              {loading ? '…' : `Step ${step + 1} of ${totalSteps}: ${STEPS[step]}`}
            </div>
          </div>
          <button className="btn btn-outline btn-sm" onClick={onCancel} type="button">Cancel</button>
        </div>
        {!loading && <StepProgress total={totalSteps} current={step} />}
      </div>

      <div className="main-content" style={{ paddingBottom: 100 }}>
        {error && <Alert type="red" icon="❌" title="Error" body={error} />}
        {renderStep()}
      </div>

      <div className="submit-bar">
        <div style={{ display: 'flex', gap: 10 }}>
          {step > 0 && (
            <button className="btn btn-outline" onClick={handleBack} type="button" style={{ flex: '0 0 auto', padding: '13px 20px' }}>
              ← Back
            </button>
          )}
          {step < totalSteps - 1 ? (
            <button className="btn btn-primary" onClick={handleNext} disabled={saving || loading} type="button" style={{ flex: 1 }}>
              {saving ? 'Saving…' : `Next: ${STEPS[step + 1]} →`}
            </button>
          ) : (
            <button className="btn btn-amber" onClick={handleSubmit} disabled={submitting} type="button" style={{ flex: 1 }}>
              {submitting ? 'Submitting…' : '✅ Submit Audit'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

window.AuditForm = AuditForm;
