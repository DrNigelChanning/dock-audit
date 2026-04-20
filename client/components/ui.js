// ui.js — reusable UI primitives

const { useState, useRef, useEffect } = React;
const { api } = window.appUtils;

// ─── PhotoUpload ─────────────────────────────────────────────────
function PhotoUpload({ auditId, label, value, onChange, required }) {
  const inputRef = useRef();
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(value || null);

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target.result);
      reader.readAsDataURL(file);
      if (auditId) {
        const { path } = await api.uploadPhoto(auditId, file);
        onChange(path);
      } else {
        // No audit ID yet — store blob URL temporarily
        onChange(URL.createObjectURL(file));
      }
    } catch (err) {
      alert('Photo upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className={`photo-upload-area ${preview ? 'has-photo' : ''}`}
      onClick={() => inputRef.current?.click()}
    >
      <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={handleFile} />
      {uploading ? (
        <div><div className="spinner" /><div className="photo-upload-label" style={{marginTop:8}}>Uploading...</div></div>
      ) : preview ? (
        <>
          <img src={preview} className="photo-preview" alt="Captured" />
          <div className="photo-upload-label" style={{marginTop:8,color:'var(--green)'}}>✅ {label} — tap to retake</div>
        </>
      ) : (
        <>
          <div className="photo-upload-icon">📷</div>
          <div className="photo-upload-label">{label}{required && <span style={{color:'var(--red)'}}> *</span>}</div>
          <div className="form-hint" style={{marginTop:4}}>Tap to take photo or choose from library</div>
        </>
      )}
    </div>
  );
}

// ─── MultiPhotoUpload ───────────────────────────────────────────
function MultiPhotoUpload({ auditId, label, value, onChange, required }) {
  const inputRef = useRef();
  const [uploading, setUploading] = useState(false);

  // Normalize value → always an array of path strings
  const photos = Array.isArray(value) ? value : (value ? [value] : []);

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const newPaths = [];
      for (const file of files) {
        if (auditId) {
          const { path } = await api.uploadPhoto(auditId, file);
          newPaths.push(path);
        } else {
          // No audit ID yet — store blob URL temporarily
          newPaths.push(URL.createObjectURL(file));
        }
      }
      onChange([...photos, ...newPaths]);
    } catch (err) {
      alert('Photo upload failed: ' + err.message);
    } finally {
      setUploading(false);
      // Reset input so the same file can be re-picked if needed
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const removePhoto = (i, e) => {
    e.stopPropagation();
    const next = photos.slice();
    next.splice(i, 1);
    onChange(next);
  };

  return (
    <div className="multi-photo">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        onChange={handleFiles}
        style={{ display: 'none' }}
      />
      <div className="multi-photo-grid">
        {photos.map((src, i) => (
          <div key={i} className="multi-photo-tile">
            <img src={src} alt={`${label} ${i + 1}`} />
            <button
              type="button"
              className="multi-photo-remove"
              onClick={(e) => removePhoto(i, e)}
              aria-label="Remove photo"
            >✕</button>
          </div>
        ))}
        <div
          className="multi-photo-add"
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <div><div className="spinner" /><div className="photo-upload-label" style={{marginTop:8}}>Uploading...</div></div>
          ) : (
            <>
              <div className="photo-upload-icon">📷</div>
              <div className="photo-upload-label">
                {photos.length === 0 ? label : '+ Add another'}
                {required && photos.length === 0 && <span style={{color:'var(--red)'}}> *</span>}
              </div>
              <div className="form-hint" style={{marginTop:4,textAlign:'center'}}>
                {photos.length === 0 ? 'Tap to take photos or choose from library' : `${photos.length} added`}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── YesNo Toggle ───────────────────────────────────────────────
function YesNo({ value, onChange, yesLabel = 'Yes', noLabel = 'No' }) {
  return (
    <div className="toggle-group">
      <button
        className={`toggle-btn ${value === true ? 'selected-yes' : ''}`}
        onClick={() => onChange(true)}
        type="button"
      >
        ✅ {yesLabel}
      </button>
      <button
        className={`toggle-btn ${value === false ? 'selected-no' : ''}`}
        onClick={() => onChange(false)}
        type="button"
      >
        ❌ {noLabel}
      </button>
    </div>
  );
}

// ─── ConditionSelect ────────────────────────────────────────────
function ConditionSelect({ value, onChange }) {
  const options = [
    { value: 'Good', label: '✅ Good', cls: 'selected-yes' },
    { value: 'Minor damage', label: '⚠️ Minor damage', cls: 'selected-neutral' },
    { value: 'Major damage', label: '🔴 Major damage', cls: 'selected-no' },
    { value: 'Rejected', label: '🚫 Rejected', cls: 'selected-no' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          className={`toggle-btn ${value === o.value ? o.cls : ''}`}
          style={{ flex: 'none', textAlign: 'left', padding: '12px 14px' }}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── SelectField ────────────────────────────────────────────────
function SelectField({ label, value, onChange, options, required, hint }) {
  return (
    <div className="form-group">
      <label className="form-label">
        {label}{required && <span className="required">*</span>}
      </label>
      <div className="select-wrapper">
        <select className="form-select" value={value || ''} onChange={e => onChange(e.target.value)}>
          <option value="">Select...</option>
          {options.map(o =>
            typeof o === 'string'
              ? <option key={o} value={o}>{o}</option>
              : <option key={o.value} value={o.value}>{o.label}</option>
          )}
        </select>
      </div>
      {hint && <div className="form-hint">{hint}</div>}
    </div>
  );
}

// ─── TextField ──────────────────────────────────────────────────
function TextField({ label, value, onChange, placeholder, required, hint, type = 'text', mono }) {
  return (
    <div className="form-group">
      {label && (
        <label className="form-label">
          {label}{required && <span className="required">*</span>}
        </label>
      )}
      <input
        type={type}
        className={`form-input ${mono ? 'mono' : ''}`}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || ''}
      />
      {hint && <div className="form-hint">{hint}</div>}
    </div>
  );
}

// ─── NumberField ─────────────────────────────────────────────────
function NumberField({ label, value, onChange, placeholder, required, hint, unit }) {
  return (
    <div className="form-group">
      {label && (
        <label className="form-label">
          {label}{required && <span className="required">*</span>}
          {unit && <span style={{ fontWeight: 400, color: 'var(--gray-400)', marginLeft: 4 }}>({unit})</span>}
        </label>
      )}
      <input
        type="number"
        inputMode="decimal"
        className="form-input mono"
        value={value ?? ''}
        onChange={e => onChange(e.target.value === '' ? '' : parseFloat(e.target.value))}
        placeholder={placeholder || '0'}
        step="any"
      />
      {hint && <div className="form-hint">{hint}</div>}
    </div>
  );
}

// ─── Alert ──────────────────────────────────────────────────────
function Alert({ type = 'red', icon, title, body }) {
  return (
    <div className={`alert alert-${type}`}>
      {icon && <div className="alert-icon">{icon}</div>}
      <div>
        <div className="alert-title">{title}</div>
        {body && <div className="alert-body">{body}</div>}
      </div>
    </div>
  );
}

// ─── Badge ───────────────────────────────────────────────────────
function Badge({ color, children }) {
  return <span className={`badge badge-${color}`}>{children}</span>;
}

// ─── StepProgress ────────────────────────────────────────────────
function StepProgress({ total, current }) {
  return (
    <div className="step-progress">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`step-dot ${i < current ? 'done' : i === current ? 'active' : ''}`}
        />
      ))}
    </div>
  );
}

window.UI = { PhotoUpload, MultiPhotoUpload, YesNo, ConditionSelect, SelectField, TextField, NumberField, Alert, Badge, StepProgress };
