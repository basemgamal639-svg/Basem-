const path = require('node:path');
const express = require('express');

const db = require('./src/db');
const auth = require('./src/auth');
const { validateAppointment, validateInquiry } = require('./src/validation');
const { homePage } = require('./src/views/home');
const { servicePage, privacyPage, notFoundPage } = require('./src/views/pages');
const { loginPage, dashboardPage } = require('./src/views/admin');
const business = require('./config/business');
const services = require('./config/services');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY);

// ---------- Security headers ----------
app.use((req, res, next) => {
  const frameSrc = business.mapEmbedUrl ? 'https://www.google.com https://maps.google.com' : "'none'";
  res.set({
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data:",
      `frame-src ${frameSrc}`,
      "connect-src 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  if (isProd) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(
  express.static(path.join(__dirname, 'public'), {
    maxAge: isProd ? '7d' : 0,
    setHeaders: (res, file) => {
      if (/\.(css|js)$/.test(file)) res.set('Cache-Control', isProd ? 'public, max-age=86400' : 'no-cache');
    },
  })
);

// ---------- Simple in-memory rate limiter ----------
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip;
    const entry = hits.get(key) || { count: 0, reset: now + windowMs };
    if (now > entry.reset) Object.assign(entry, { count: 0, reset: now + windowMs });
    entry.count++;
    hits.set(key, entry);
    if (hits.size > 5000) for (const [k, v] of hits) if (now > v.reset) hits.delete(k);
    if (entry.count > max) {
      res.set('Retry-After', Math.ceil((entry.reset - now) / 1000));
      return res.status(429).json({ error: 'Too many requests. Please wait a few minutes and try again.' });
    }
    next();
  };
}
const formLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: Number(process.env.FORM_RATE_LIMIT) || 10 });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

// ---------- Public pages ----------
const html = (res, markup, status = 200) => res.status(status).type('html').send(markup);

app.get('/', (req, res) => html(res, homePage()));
app.get('/services', (req, res) => res.redirect(301, '/#services'));
app.get('/services/:slug', (req, res) => {
  const page = servicePage(req.params.slug);
  return page ? html(res, page) : html(res, notFoundPage(), 404);
});
app.get('/privacy', (req, res) => html(res, privacyPage()));

app.get('/robots.txt', (req, res) => {
  const base = business.siteUrl ? business.siteUrl.replace(/\/$/, '') : '';
  res.type('text/plain').send(`User-agent: *\nDisallow: /admin\nDisallow: /api/\n${base ? `Sitemap: ${base}/sitemap.xml\n` : ''}`);
});
app.get('/sitemap.xml', (req, res) => {
  const base = business.siteUrl ? business.siteUrl.replace(/\/$/, '') : `${req.protocol}://${req.get('host')}`;
  const urls = ['/', '/privacy', ...services.map((s) => `/services/${s.slug}`)];
  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map((u) => `  <url><loc>${base}${u}</loc></url>`)
      .join('\n')}\n</urlset>`
  );
});

// ---------- Public form APIs ----------
function handleSubmission({ validate, table, columns, refPrefix }) {
  return (req, res) => {
    if (!auth.sameOrigin(req)) return res.status(403).json({ error: 'Forbidden.' });
    // Honeypot: bots fill the hidden "website" field. Pretend success, store nothing.
    if (req.body && req.body.website) return res.status(201).json({ ok: true, reference: `${refPrefix}-0` });

    const { data, errors } = validate(req.body);
    if (Object.keys(errors).length) return res.status(422).json({ error: 'Please correct the highlighted fields.', fields: errors });

    // Idempotency: the same submission_id (double-click, retry) never creates a second record.
    const existing = db.prepare(`SELECT id FROM ${table} WHERE submission_id = ?`).get(data.submission_id);
    if (existing) return res.status(200).json({ ok: true, duplicate: true, reference: `${refPrefix}-${existing.id}` });

    try {
      const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
      const result = db.prepare(sql).run(...columns.map((c) => data[c]));
      return res.status(201).json({ ok: true, reference: `${refPrefix}-${result.lastInsertRowid}` });
    } catch (err) {
      console.error(`[${table}] insert failed`, err);
      return res.status(500).json({ error: 'We could not save your request. Please try again or contact us directly.' });
    }
  };
}

app.post(
  '/api/appointments',
  formLimiter,
  handleSubmission({
    validate: validateAppointment,
    table: 'appointments',
    refPrefix: 'APT',
    columns: ['submission_id', 'name', 'phone', 'email', 'vehicle_make', 'vehicle_model', 'vehicle_year', 'service', 'preferred_date', 'preferred_time', 'message'],
  })
);
app.post(
  '/api/contact',
  formLimiter,
  handleSubmission({
    validate: validateInquiry,
    table: 'inquiries',
    refPrefix: 'MSG',
    columns: ['submission_id', 'name', 'email', 'phone', 'subject', 'message'],
  })
);

// ---------- Admin ----------
app.use('/admin', (req, res, next) => {
  res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
  next();
});

app.get('/admin/login', (req, res) => {
  if (auth.isAuthenticated(req)) return res.redirect('/admin');
  html(res, loginPage({ disabled: !auth.adminEnabled() }));
});
app.post('/admin/login', loginLimiter, (req, res) => {
  if (!auth.adminEnabled()) return html(res, loginPage({ disabled: true }), 503);
  if (!auth.sameOrigin(req)) return res.status(403).send('Forbidden');
  if (!auth.checkPassword(req.body.password)) return html(res, loginPage({ error: 'Incorrect password.' }), 401);
  auth.createSession(res);
  res.redirect(303, '/admin');
});
app.post('/admin/logout', (req, res) => {
  auth.destroySession(req, res);
  res.redirect(303, '/admin/login');
});

const admin = express.Router();
admin.use(auth.requireAdmin);
admin.get('/', (req, res) => html(res, dashboardPage()));

const RESOURCES = {
  appointments: { statuses: ['Pending', 'Confirmed', 'Completed', 'Cancelled'], search: ['name', 'email', 'phone', 'vehicle_make', 'vehicle_model', 'service'] },
  inquiries: { statuses: ['New', 'Responded', 'Archived'], search: ['name', 'email', 'phone', 'subject', 'message'] },
};

admin.get('/api/:resource', (req, res) => {
  const cfg = RESOURCES[req.params.resource];
  if (!cfg) return res.status(404).json({ error: 'Not found.' });
  const t = req.params.resource;
  const where = [];
  const params = [];
  if (cfg.statuses.includes(req.query.status)) {
    where.push('status = ?');
    params.push(req.query.status);
  }
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  if (q) {
    where.push(`(${cfg.search.map((c) => `${c} LIKE ?`).join(' OR ')})`);
    cfg.search.forEach(() => params.push(`%${q}%`));
  }
  const rows = db
    .prepare(`SELECT * FROM ${t} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC, id DESC LIMIT 500`)
    .all(...params);
  const counts = Object.fromEntries(cfg.statuses.map((s) => [s, 0]));
  for (const r of db.prepare(`SELECT status, COUNT(*) AS n FROM ${t} GROUP BY status`).all()) counts[r.status] = r.n;
  res.json({ rows, counts, statuses: cfg.statuses });
});

admin.patch('/api/:resource/:id', (req, res) => {
  const cfg = RESOURCES[req.params.resource];
  if (!cfg) return res.status(404).json({ error: 'Not found.' });
  const id = Number(req.params.id);
  const sets = [];
  const params = [];
  if (req.body.status !== undefined) {
    if (!cfg.statuses.includes(req.body.status)) return res.status(422).json({ error: 'Invalid status.' });
    sets.push('status = ?');
    params.push(req.body.status);
  }
  if (req.body.admin_notes !== undefined) {
    sets.push('admin_notes = ?');
    params.push(String(req.body.admin_notes).slice(0, 5000));
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
  sets.push("updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')");
  const r = db.prepare(`UPDATE ${req.params.resource} SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
  if (!r.changes) return res.status(404).json({ error: 'Record not found.' });
  res.json({ ok: true, row: db.prepare(`SELECT * FROM ${req.params.resource} WHERE id = ?`).get(id) });
});

admin.delete('/api/:resource/:id', (req, res) => {
  if (!RESOURCES[req.params.resource]) return res.status(404).json({ error: 'Not found.' });
  const r = db.prepare(`DELETE FROM ${req.params.resource} WHERE id = ?`).run(Number(req.params.id));
  if (!r.changes) return res.status(404).json({ error: 'Record not found.' });
  res.json({ ok: true });
});

app.use('/admin', admin);

// ---------- 404 & errors ----------
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((req, res) => html(res, notFoundPage(), 404));
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large.' });
  console.error(err);
  res.status(500).type('text').send('Something went wrong.');
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Website running at http://localhost:${PORT}`);
    console.log(`Admin dashboard:   http://localhost:${PORT}/admin`);
    if (auth.generatedPassword) {
      console.log(`\n[admin] No ADMIN_PASSWORD set — using a temporary password for this run: ${auth.generatedPassword}`);
      console.log('[admin] Set ADMIN_PASSWORD in your environment to choose a permanent one.\n');
    } else if (!auth.adminEnabled()) {
      console.warn('[admin] ADMIN_PASSWORD is not set — the admin dashboard is disabled.');
    }
  });
}

module.exports = app;
