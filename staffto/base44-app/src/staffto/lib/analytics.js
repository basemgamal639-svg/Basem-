import { call } from '@/staffto/lib/api';

// First-party analytics only (no third-party trackers). Sent only after the visitor allows analytics.
const KEY = 'sto_consent_v1';
const safe = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };

export const getConsent = () => safe(() => JSON.parse(localStorage.getItem(KEY) || 'null'));
export const setConsent = (value) => safe(() => localStorage.setItem(KEY, JSON.stringify({ ...value, at: new Date().toISOString() })));
export const analyticsAllowed = () => !!getConsent()?.analytics;

export function sessionId() {
  return safe(() => {
    let id = sessionStorage.getItem('sto_sid');
    if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem('sto_sid', id); }
    return id;
  }, 'nosession');
}

// Attribution: remember utm_* and ?ref= for the visit so applications and sign-ups can be credited.
export function captureAttribution() {
  const p = new URLSearchParams(window.location.search);
  const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'ref'];
  const found = Object.fromEntries(keys.map((k) => [k, p.get(k)]).filter(([, v]) => v));
  if (Object.keys(found).length) safe(() => sessionStorage.setItem('sto_attr', JSON.stringify(found)));
  return found;
}
export const attribution = () => safe(() => JSON.parse(sessionStorage.getItem('sto_attr') || '{}'), {});

export function track(type, extra = {}) {
  if (!analyticsAllowed() && type !== 'share') return;
  let referrer_host = '';
  try { referrer_host = document.referrer ? new URL(document.referrer).host : ''; } catch { /* ignore */ }
  call('site', 'track', { type, path: window.location.pathname, session_id: sessionId(), referrer_host, ...attribution(), ...extra }).catch(() => {});
}
