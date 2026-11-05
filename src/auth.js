const crypto = require('node:crypto');
const db = require('./db');

const COOKIE = 'shop_admin';
const SESSION_HOURS = 12;
const isProd = process.env.NODE_ENV === 'production';

let adminPassword = process.env.ADMIN_PASSWORD || '';
let generated = false;
if (!adminPassword && !isProd) {
  adminPassword = crypto.randomBytes(9).toString('base64url');
  generated = true;
}
if (adminPassword && adminPassword.length < 10 && isProd) {
  console.warn('[admin] ADMIN_PASSWORD is shorter than 10 characters — choose a longer password.');
}

const salt = crypto.randomBytes(16);
const passwordHash = adminPassword ? crypto.scryptSync(adminPassword, salt, 64) : null;

function adminEnabled() {
  return Boolean(passwordHash);
}

function checkPassword(candidate) {
  if (!passwordHash || typeof candidate !== 'string') return false;
  const h = crypto.scryptSync(candidate, salt, 64);
  return crypto.timingSafeEqual(h, passwordHash);
}

const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

function createSession(res) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = Date.now() + SESSION_HOURS * 3600 * 1000;
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  db.prepare('INSERT INTO sessions (token_hash, expires_at) VALUES (?, ?)').run(sha(token), expires);
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: isProd,
    maxAge: SESSION_HOURS * 3600 * 1000,
    path: '/',
  });
}

function readCookie(req) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return decodeURIComponent(v.join('='));
  }
  return null;
}

function isAuthenticated(req) {
  const token = readCookie(req);
  if (!token) return false;
  const row = db.prepare('SELECT expires_at FROM sessions WHERE token_hash = ?').get(sha(token));
  return Boolean(row && row.expires_at > Date.now());
}

function destroySession(req, res) {
  const token = readCookie(req);
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token));
  res.clearCookie(COOKIE, { path: '/' });
}

// Blocks cross-site state-changing requests (defence in depth on top of SameSite=Strict).
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // same-origin form posts from older browsers / non-browser clients
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function requireAdmin(req, res, next) {
  if (!isAuthenticated(req)) {
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Not signed in.' });
    return res.redirect('/admin/login');
  }
  if (req.method !== 'GET' && !sameOrigin(req)) return res.status(403).json({ error: 'Forbidden.' });
  res.set('Cache-Control', 'no-store');
  next();
}

module.exports = {
  adminEnabled,
  checkPassword,
  createSession,
  destroySession,
  isAuthenticated,
  requireAdmin,
  sameOrigin,
  generatedPassword: generated ? adminPassword : null,
};
