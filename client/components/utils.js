// utils.js — shared helpers

const API = window.location.origin;

const api = {
  async get(path) {
    const r = await fetch(`${API}${path}`);
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async post(path, body) {
    const r = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async patch(path, body) {
    const r = await fetch(`${API}${path}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async delete(path) {
    const r = await fetch(`${API}${path}`, { method: 'DELETE' });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async uploadPhoto(auditId, file) {
    const fd = new FormData();
    fd.append('photo', file);
    const r = await fetch(`${API}/api/audits/${auditId}/photo`, {
      method: 'POST',
      body: fd
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }
};

function calcVariance(expected, actual) {
  const exp = parseFloat(expected);
  const act = parseFloat(actual);
  if (!exp || isNaN(act)) return null;
  const pct = (act - exp) / exp;
  return { variance: act - exp, pct, pctDisplay: `${pct >= 0 ? '+' : ''}${(pct * 100).toFixed(1)}%` };
}

function varianceClass(pct) {
  if (pct === null) return '';
  const abs = Math.abs(pct);
  if (abs <= 0.05) return 'variance-green';
  if (abs <= 0.15) return 'variance-yellow';
  return 'variance-red';
}

function tempClass(temp, spec) {
  if (temp === null || temp === '' || !spec) return '';
  const t = parseFloat(temp);
  if (t >= spec.min && t <= spec.max) return 'temp-ok';
  if (Math.abs(t - (t < spec.min ? spec.min : spec.max)) <= 3) return 'temp-warn';
  return 'temp-fail';
}

function tempInRange(temp, specKey) {
  const SPECS = {
    frozen_inbound: { min: -99, max: 32 },
    refrigerated_inbound: { min: 33, max: 40 },
    frozen_outbound: { min: -99, max: 32 },
    refrigerated_outbound: { min: 33, max: 42 },
  };
  const spec = SPECS[specKey];
  if (!spec || temp === null || temp === '') return null;
  return parseFloat(temp) >= spec.min && parseFloat(temp) <= spec.max;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  return `${fmtDate(iso)} ${fmtTime(iso)}`;
}

window.appUtils = { api, calcVariance, varianceClass, tempClass, tempInRange, fmtDate, fmtTime, fmtDateTime };
