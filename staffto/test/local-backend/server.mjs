// Local Base44-compatible backend used for offline development and the QA suite.
//
// It implements the REST routes the official @base44/sdk calls (auth, entities, functions, Core integrations)
// with the same row-level / field-level security semantics as Base44's own local dev server, so the app's
// real entity schemas (base44/entities/*.jsonc) and real backend functions (base44/functions/*/entry.ts) run
// unmodified. Production always runs on Base44 — this file is never deployed.
//
// Usage: node test/local-backend/server.mjs [--port 4400] [--static dist]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]]] : acc), []));
const PORT = Number(args.port || process.env.PORT || 4400);
const STATIC_DIR = args.static ? path.resolve(ROOT, args.static) : null;
const WORK = path.join(ROOT, '.local-backend');
const MEDIA = path.join(WORK, 'media');
fs.mkdirSync(path.join(MEDIA, 'private'), { recursive: true });
const BASE = `http://127.0.0.1:${PORT}`;
const SERVICE_EMAIL = 'service@local.base44';

// ---------- data ----------
const stripJsonc = (t) => t.replace(/^\s*\/\/.*$/gm, '');
const schemas = {};
for (const f of fs.readdirSync(path.join(ROOT, 'base44/entities'))) {
  if (!f.endsWith('.jsonc')) continue;
  const s = JSON.parse(stripJsonc(fs.readFileSync(path.join(ROOT, 'base44/entities', f), 'utf8')));
  schemas[s.name] = s;
}
const db = Object.fromEntries(Object.keys(schemas).map((n) => [n, new Map()]));
const users = new Map(); // id -> user
const passwords = new Map(); // email -> {password, otp, otpAt, id}
const outbox = [];
const id = () => crypto.randomBytes(12).toString('hex');
const now = () => new Date().toISOString();

// ---------- tokens ----------
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sign = (payload) => `local.${b64(payload)}.${crypto.createHmac('sha256', 'local-secret').update(b64(payload)).digest('base64url')}`;
const tokenFor = (email) => sign({ sub: email, iat: Date.now() });
const SERVICE_TOKEN = tokenFor(SERVICE_EMAIL);
function verifyToken(t) {
  const [p, body, sig] = String(t || '').split('.');
  if (p !== 'local' || !body) return null;
  if (crypto.createHmac('sha256', 'local-secret').update(body).digest('base64url') !== sig) return null;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return null; }
}
function currentUser(req) {
  const svc = req.headers['base44-service-authorization'];
  const auth = req.headers.authorization;
  for (const h of [auth, svc]) {
    if (!h?.startsWith('Bearer ')) continue;
    const payload = verifyToken(h.slice(7));
    if (!payload) continue;
    if (payload.sub === SERVICE_EMAIL) return { id: 'service', email: SERVICE_EMAIL, role: 'admin', is_service: true };
    const u = [...users.values()].find((x) => x.email === payload.sub);
    if (u) return u;
  }
  return null;
}

// ---------- RLS (mirrors Base44 local dev server semantics) ----------
const fieldValue = (key, src) => src?.[key.startsWith('data.') ? key.slice(5) : key];
const resolveTpl = (v, user) => v.replace(/\{\{user\.([\w.]+)\}\}/g, (_m, p) => String(fieldValue(p, user) ?? ''));
function evalOp(rv, op) {
  for (const [k, v] of Object.entries(op)) {
    if (k === '$in' && !(Array.isArray(v) && v.includes(rv))) return false;
    if (k === '$nin' && !(Array.isArray(v) && !v.includes(rv))) return false;
    if (k === '$ne' && rv === v) return false;
    if (k === '$all' && !(Array.isArray(rv) && Array.isArray(v) && v.every((x) => rv.includes(x)))) return false;
    if (!['$in', '$nin', '$ne', '$all'].includes(k)) return false;
  }
  return true;
}
function evalCond(cond, rec, user) {
  for (const [k, v] of Object.entries(cond)) {
    if (k === 'user_condition') {
      for (const [uk, uv] of Object.entries(v)) {
        const val = fieldValue(uk, user);
        if (uv && typeof uv === 'object' ? !evalOp(val, uv) : val !== uv) return false;
      }
      continue;
    }
    if (k === '$or') { if (!v.some((c) => evalCond(c, rec, user))) return false; continue; }
    if (k === '$and') { if (!v.every((c) => evalCond(c, rec, user))) return false; continue; }
    if (k === '$nor') { if (v.some((c) => evalCond(c, rec, user))) return false; continue; }
    const rv = fieldValue(k, rec);
    const resolved = typeof v === 'string' ? resolveTpl(v, user) : v;
    if (resolved && typeof resolved === 'object' ? !evalOp(rv, resolved) : rv !== resolved) return false;
  }
  return true;
}
function checkRLS(rule, rec, user) {
  if (user?.is_service) return true;
  if (rule === undefined || rule === null || rule === '') return true;
  if (typeof rule === 'object' && Object.keys(rule).length === 0) return true;
  if (typeof rule === 'boolean') return rule;
  if (!user) return false;
  return evalCond(rule, rec, user);
}
function applyFLSRead(rec, schema, user) {
  const out = {};
  for (const [k, v] of Object.entries(rec)) {
    const rule = schema.properties[k]?.rls?.read;
    if (rule === undefined || checkRLS(rule, rec, user)) out[k] = v;
  }
  return out;
}
function assertFLSWrite(changes, before, schema, user, op) {
  const denied = Object.entries(changes).filter(([k, v]) => {
    const rls = schema.properties[k]?.rls;
    const rule = rls?.[op] ?? rls?.write;
    return rule !== undefined && JSON.stringify(before[k] ?? null) !== JSON.stringify(v ?? null) && !checkRLS(rule, before, user);
  }).map(([k]) => k);
  if (denied.length) throw httpErr(403, `You're not allowed to ${op === 'create' ? 'set' : 'modify'} the following fields: ${denied.join(', ')}`);
}

// ---------- validation ----------
function typeOk(v, p) {
  if (v === null || v === undefined) return true;
  const t = p.type;
  if (t === 'string') return typeof v === 'string';
  if (t === 'number') return typeof v === 'number' && Number.isFinite(v);
  if (t === 'integer') return Number.isInteger(v);
  if (t === 'boolean') return typeof v === 'boolean';
  if (t === 'array') return Array.isArray(v);
  if (t === 'object') return typeof v === 'object' && !Array.isArray(v);
  return true;
}
function validate(rec, schema, partial) {
  if (!partial) for (const r of schema.required || []) if (rec[r] === undefined || rec[r] === null || rec[r] === '') throw httpErr(422, `Field required: ${r}`);
  for (const [k, v] of Object.entries(rec)) {
    const p = schema.properties[k];
    if (!p) continue;
    if (!typeOk(v, p)) throw httpErr(422, `Error in field ${k}: Input should be a valid ${p.type}`);
    if (p.enum && v !== '' && v !== null && v !== undefined && !p.enum.includes(v)) throw httpErr(422, `Error in field ${k}: must be one of ${p.enum.join(', ')}`);
  }
}
const filterFields = (rec, schema) => Object.fromEntries(Object.entries(rec || {}).filter(([k]) => schema.properties[k]));
const withDefaults = (rec, schema) => ({ ...Object.fromEntries(Object.entries(schema.properties).filter(([, p]) => p.default !== undefined).map(([k, p]) => [k, p.default])), ...rec });

// ---------- query ----------
function matches(rec, q) {
  for (const [k, cond] of Object.entries(q || {})) {
    if (k === '$or') { if (!cond.some((c) => matches(rec, c))) return false; continue; }
    if (k === '$and') { if (!cond.every((c) => matches(rec, c))) return false; continue; }
    const v = rec[k];
    if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
      for (const [op, x] of Object.entries(cond)) {
        if (op === '$in' && !(Array.isArray(v) ? v.some((y) => x.includes(y)) : x.includes(v))) return false;
        if (op === '$nin' && (Array.isArray(v) ? v.some((y) => x.includes(y)) : x.includes(v))) return false;
        if (op === '$ne' && v === x) return false;
        if (op === '$gt' && !(v > x)) return false;
        if (op === '$gte' && !(v >= x)) return false;
        if (op === '$lt' && !(v < x)) return false;
        if (op === '$lte' && !(v <= x)) return false;
        if (op === '$exists' && (v !== undefined) !== !!x) return false;
        if (op === '$regex' && !new RegExp(x, cond.$options || '').test(String(v ?? ''))) return false;
        if (op === '$all' && !(Array.isArray(v) && x.every((y) => v.includes(y)))) return false;
      }
    } else if (Array.isArray(v) && !Array.isArray(cond)) {
      if (!v.includes(cond)) return false;
    } else if (v !== cond && !(cond === false && v === undefined)) return false;
  }
  return true;
}
function runQuery(rows, { q, sort, limit, skip, fields }) {
  let out = rows.filter((r) => matches(r, q ? JSON.parse(q) : {}));
  if (sort) {
    const desc = sort.startsWith('-');
    const key = desc ? sort.slice(1) : sort;
    out.sort((a, b) => (a[key] ?? '') > (b[key] ?? '') ? (desc ? -1 : 1) : (a[key] ?? '') < (b[key] ?? '') ? (desc ? 1 : -1) : 0);
  }
  if (skip) out = out.slice(Number(skip));
  if (limit) out = out.slice(0, Number(limit));
  if (fields) {
    const f = String(fields).split(',').map((s) => s.trim()).filter(Boolean);
    out = out.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => f.includes(k) || k === 'id')));
  }
  return out;
}

// ---------- functions ----------
const fnCache = new Map();
async function loadFunction(name) {
  const dir = path.join(ROOT, 'base44/functions', name);
  const entry = path.join(dir, 'entry.ts');
  if (!fs.existsSync(entry)) return null;
  const mtime = Math.max(...fs.readdirSync(dir).map((f) => fs.statSync(path.join(dir, f)).mtimeMs));
  const cached = fnCache.get(name);
  if (cached && cached.mtime === mtime) return cached.handler;
  const esbuild = await import(pathToFileURL(path.join(ROOT, 'node_modules/esbuild/lib/main.js')).href).then((m) => m.default || m);
  const outfile = path.join(WORK, `fn-${name}-${Math.round(mtime)}.mjs`);
  await esbuild.build({
    entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
    plugins: [{ name: 'npm-specifier', setup(b) { b.onResolve({ filter: /^npm:@base44\/sdk/ }, () => ({ path: '@base44/sdk', external: true })); } }],
  });
  globalThis.Deno ??= { serve: () => ({}), env: { get: (k) => process.env[k] } };
  const mod = await import(pathToFileURL(outfile).href);
  const handler = mod.handler || mod.default;
  fnCache.set(name, { mtime, handler });
  return handler;
}

// ---------- http helpers ----------
function httpErr(status, message) { const e = new Error(message); e.status = status; return e; }
const send = (res, status, data, headers = {}) => {
  const body = typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': typeof data === 'string' ? 'text/plain' : 'application/json', 'Access-Control-Allow-Origin': '*', ...headers });
  res.end(body);
};
const readRaw = (req) => new Promise((resolve) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => resolve(Buffer.concat(c))); });
function parseMultipart(buf, contentType) {
  const boundary = '--' + /boundary=([^;]+)/.exec(contentType)?.[1];
  const parts = buf.toString('binary').split(boundary).slice(1, -1);
  const files = {};
  const fields = {};
  for (const part of parts) {
    const [rawHead, ...rest] = part.split('\r\n\r\n');
    const body = rest.join('\r\n\r\n').replace(/\r\n$/, '');
    const name = /name="([^"]+)"/.exec(rawHead)?.[1];
    const filename = /filename="([^"]*)"/.exec(rawHead)?.[1];
    if (filename !== undefined) files[name] = { filename, data: Buffer.from(body, 'binary'), type: /Content-Type: (.+)/i.exec(rawHead)?.[1]?.trim() };
    else if (name) fields[name] = body;
  }
  return { files, fields };
}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain', '.pdf': 'application/pdf', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
function serveFile(res, file) {
  send(res, 200, fs.readFileSync(file), { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
}

// ---------- routes ----------
async function handle(req, res) {
  const url = new URL(req.url, BASE);
  const p = url.pathname;
  if (req.method === 'OPTIONS') return send(res, 204, '', { 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' });

  // dev-only helpers for the QA suite
  if (p === '/__dev/otp') return send(res, 200, { otp: passwords.get(url.searchParams.get('email'))?.otp || null });
  if (p === '/__dev/outbox') return send(res, 200, outbox);
  if (p === '/__dev/make-admin' && req.method === 'POST') {
    const { email } = JSON.parse((await readRaw(req)).toString() || '{}');
    const u = [...users.values()].find((x) => x.email === email);
    if (!u) return send(res, 404, { error: 'no user' });
    u.role = 'admin';
    return send(res, 200, { ok: true });
  }

  if (p.startsWith('/media/')) {
    const rel = decodeURIComponent(p.slice(7));
    if (rel.startsWith('private/')) {
      const uri = rel.slice(8);
      if (url.searchParams.get('token') !== crypto.createHash('sha256').update(uri).digest('hex')) return send(res, 401, { error: 'Invalid or missing token' });
    }
    const file = path.join(MEDIA, rel);
    if (!file.startsWith(MEDIA) || !fs.existsSync(file)) return send(res, 404, { error: 'not found' });
    return serveFile(res, file);
  }

  if (p === '/api/apps/auth/logout') {
    res.writeHead(302, { Location: url.searchParams.get('from_url') || '/' });
    return res.end();
  }
  const m = /^\/api\/apps\/([^/]+)\/(.*)$/.exec(p);
  if (!m) {
    if (STATIC_DIR) {
      const file = path.join(STATIC_DIR, p === '/' ? 'index.html' : decodeURIComponent(p));
      if (file.startsWith(STATIC_DIR) && fs.existsSync(file) && fs.statSync(file).isFile()) return serveFile(res, file);
      return serveFile(res, path.join(STATIC_DIR, 'index.html'));
    }
    return send(res, 404, { error: 'not found' });
  }
  const [, appId, rest] = m;
  const user = currentUser(req);
  const raw = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? await readRaw(req) : Buffer.alloc(0);
  const isMultipart = (req.headers['content-type'] || '').startsWith('multipart/form-data');
  const body = !isMultipart && raw.length ? JSON.parse(raw.toString()) : {};

  // auth
  if (rest === 'auth/register') {
    const { email, password } = body;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email || '')) throw httpErr(400, 'Invalid email');
    if ((password || '').length < 8) throw httpErr(400, 'Password must be at least 8 characters long');
    if ([...users.values()].some((u) => u.email === email)) throw httpErr(400, 'A user with this email already exists');
    const otp = String(crypto.randomInt(100000, 999999));
    passwords.set(email, { password, otp, otpAt: Date.now(), id: passwords.get(email)?.id || id() });
    outbox.push({ to: email, subject: 'Your verification code', body: `Code: ${otp}`, at: now() });
    return send(res, 200, { message: 'Registration successful. Please check your email for the verification code.' });
  }
  if (rest === 'auth/resend-otp') {
    const rec = passwords.get(body.email);
    if (rec) { rec.otp = String(crypto.randomInt(100000, 999999)); rec.otpAt = Date.now(); }
    return send(res, 200, { ok: true });
  }
  if (rest === 'auth/verify-otp') {
    const rec = passwords.get(body.email);
    if (!rec || rec.otp !== body.otp_code) throw httpErr(400, 'Invalid verification code');
    if (Date.now() - rec.otpAt > 600000) throw httpErr(400, 'Verification code has expired');
    rec.otp = null;
    if (!users.has(rec.id)) {
      const isFirst = users.size === 0;
      users.set(rec.id, { id: rec.id, email: body.email, full_name: body.email.split('@')[0], role: 'user', is_verified: true, created_date: now(), updated_date: now(), _first: isFirst });
    }
    return send(res, 200, { access_token: tokenFor(body.email), success: true });
  }
  if (rest === 'auth/login') {
    const rec = passwords.get(body.email);
    const u = [...users.values()].find((x) => x.email === body.email);
    if (!u || !rec || rec.password !== body.password) throw httpErr(400, 'Invalid email or password');
    return send(res, 200, { access_token: tokenFor(body.email), success: true, user: u });
  }
  if (rest === 'auth/reset-password-request') return send(res, 200, { ok: true });

  // users
  if (rest === 'entities/User/me') {
    if (!user || user.is_service) throw httpErr(401, 'Unauthorized');
    if (req.method === 'PUT') {
      const { role, email, id: _i, ...allowed } = body;
      Object.assign(user, allowed, { updated_date: now() });
    }
    const { _first, ...pub } = user;
    return send(res, 200, pub);
  }
  const um = /^entities\/User(?:\/([^/]+))?$/.exec(rest);
  if (um) {
    if (!user) throw httpErr(401, 'Unauthorized');
    const all = [...users.values()].map(({ _first, ...u }) => u);
    if (!um[1] && req.method === 'GET') return send(res, 200, user.role === 'admin' ? runQuery(all, Object.fromEntries(url.searchParams)) : all.filter((u) => u.id === user.id));
    const target = users.get(um[1]);
    if (!target) throw httpErr(404, 'User not found');
    if (user.role !== 'admin' && target.id !== user.id) throw httpErr(403, 'Forbidden');
    if (req.method === 'GET') return send(res, 200, target);
    if (req.method === 'PUT') { if (user.role !== 'admin') delete body.role; Object.assign(target, body); return send(res, 200, target); }
    if (req.method === 'DELETE') { if (user.role !== 'admin') throw httpErr(403, 'Forbidden'); users.delete(target.id); return send(res, 200, { success: true }); }
  }

  // entities
  const em = /^entities\/([A-Za-z0-9_]+)(?:\/(.+))?$/.exec(rest);
  if (em) {
    const [, name, sub] = em;
    const schema = schemas[name];
    if (!schema) throw httpErr(404, `Entity ${name} not found`);
    const coll = db[name];
    const rls = schema.rls || {};
    const readable = () => [...coll.values()].filter((r) => checkRLS(rls.read, r, user)).map((r) => applyFLSRead(r, schema, user));
    if (!sub && req.method === 'GET') return send(res, 200, runQuery(readable(), Object.fromEntries(url.searchParams)));
    if (sub === 'count') return send(res, 200, { count: runQuery(readable(), { q: url.searchParams.get('q') }).length });
    if (!sub && req.method === 'POST') {
      const clean = filterFields(body, schema);
      assertFLSWrite(clean, {}, schema, user, 'create');
      const rec = { ...withDefaults(clean, schema), id: id(), created_date: now(), updated_date: now(), created_by_id: user?.id || null, created_by: user?.email || null };
      validate(rec, schema, false);
      if (!checkRLS(rls.create, rec, user)) throw httpErr(403, `Permission denied: create ${name}`);
      coll.set(rec.id, rec);
      return send(res, 200, applyFLSRead(rec, schema, user));
    }
    if (sub === 'bulk' && req.method === 'POST') {
      const out = [];
      for (const item of body) {
        const clean = filterFields(item, schema);
        assertFLSWrite(clean, {}, schema, user, 'create');
        const rec = { ...withDefaults(clean, schema), id: id(), created_date: now(), updated_date: now(), created_by_id: user?.id || null };
        validate(rec, schema, false);
        if (!checkRLS(rls.create, rec, user)) throw httpErr(403, `Permission denied: create ${name}`);
        coll.set(rec.id, rec);
        out.push(rec);
      }
      return send(res, 200, out);
    }
    if (sub && !sub.includes('/')) {
      const rec = coll.get(sub);
      if (!rec || !checkRLS(rls.read, rec, user)) throw httpErr(404, `${name} not found`);
      if (req.method === 'GET') return send(res, 200, applyFLSRead(rec, schema, user));
      if (req.method === 'PUT') {
        if (!checkRLS(rls.update, rec, user)) throw httpErr(403, `Permission denied: update ${name}`);
        const clean = filterFields(body, schema);
        assertFLSWrite(clean, rec, schema, user, 'update');
        validate(clean, schema, true);
        const next = { ...rec, ...clean, updated_date: now() };
        if (!checkRLS(rls.update, next, user)) throw httpErr(403, `Permission denied: update ${name}`);
        coll.set(rec.id, next);
        return send(res, 200, applyFLSRead(next, schema, user));
      }
      if (req.method === 'DELETE') {
        if (!checkRLS(rls.delete, rec, user)) throw httpErr(403, `Permission denied: delete ${name}`);
        coll.delete(rec.id);
        return send(res, 200, { success: true });
      }
    }
    throw httpErr(404, 'Unsupported entity route');
  }

  // functions
  const fm = /^functions\/([A-Za-z0-9_-]+)$/.exec(rest);
  if (fm) {
    const handler = await loadFunction(fm[1]);
    if (!handler) throw httpErr(404, `Function ${fm[1]} not found`);
    const headers = new Headers({ 'Base44-App-Id': appId, 'Base44-Api-Url': BASE, 'Base44-Service-Authorization': `Bearer ${SERVICE_TOKEN}`, 'Content-Type': req.headers['content-type'] || 'application/json' });
    if (req.headers.authorization && !currentUser({ headers: { authorization: req.headers.authorization } })?.is_service) headers.set('Authorization', req.headers.authorization);
    for (const h of ['origin', 'referer', 'stripe-signature']) if (req.headers[h]) headers.set(h, req.headers[h]);
    const fReq = new Request(`${BASE}/functions/${fm[1]}${url.search}`, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : raw });
    const fRes = await handler(fReq);
    const text = Buffer.from(await fRes.arrayBuffer());
    res.writeHead(fRes.status, { 'Content-Type': fRes.headers.get('content-type') || 'application/json' });
    return res.end(text);
  }

  // Core integrations
  const im = /^integration-endpoints\/Core\/([A-Za-z]+)$/.exec(rest);
  if (im) {
    const op = im[1];
    if (!user) throw httpErr(401, 'Unauthorized');
    if (op === 'UploadFile' || op === 'UploadPrivateFile') {
      const { files } = parseMultipart(raw, req.headers['content-type']);
      const file = files.file;
      if (!file) throw httpErr(400, 'No file uploaded');
      if (file.data.length > 20 * 1024 * 1024) throw httpErr(413, 'File too large');
      const name = `${crypto.randomUUID()}${path.extname(file.filename).toLowerCase()}`;
      const priv = op === 'UploadPrivateFile';
      fs.writeFileSync(path.join(MEDIA, priv ? 'private' : '', name), file.data);
      return send(res, 200, priv ? { file_uri: name } : { file_url: `${BASE}/media/${name}` });
    }
    if (op === 'CreateFileSignedUrl') {
      const token = crypto.createHash('sha256').update(body.file_uri || '').digest('hex');
      return send(res, 200, { signed_url: `${BASE}/media/private/${body.file_uri}?token=${token}` });
    }
    if (op === 'SendEmail') {
      outbox.push({ ...body, at: now() });
      return send(res, 200, { ok: true });
    }
    throw httpErr(503, `Core.${op} is not available in the local backend`);
  }
  if (rest.startsWith('analytics')) return send(res, 200, { ok: true });
  throw httpErr(404, `Route not implemented locally: ${rest}`);
}

http.createServer(async (req, res) => {
  try {
    await handle(req, res);
  } catch (e) {
    if (!e.status) console.error(e);
    send(res, e.status || 500, { message: e.message, detail: e.message });
  }
}).listen(PORT, '127.0.0.1', () => console.log(`[local-backend] ${BASE} · ${Object.keys(schemas).length} entities${STATIC_DIR ? ` · serving ${path.relative(ROOT, STATIC_DIR)}` : ''}`));
