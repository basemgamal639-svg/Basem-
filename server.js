const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');

const db = require('./src/db');
const auth = require('./src/auth');
const notify = require('./src/notify');
const schedule = require('./src/schedule');
const { validateAppointment, validateInquiry } = require('./src/validation');
const { homePage } = require('./src/views/home');
const { servicePage, privacyPage, termsPage, notFoundPage } = require('./src/views/pages');
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
  res.set({
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data:",
      `frame-src ${business.mapEmbedUrl ? 'https://www.google.com https://maps.google.com' : "'none'"}`,
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
    const entry = hits.get(req.ip) || { count: 0, reset: now + windowMs };
    if (now > entry.reset) Object.assign(entry, { count: 0, reset: now + windowMs });
    entry.count++;
    hits.set(req.ip, entry);
    if (hits.size > 5000) for (const [k, v] of hits) if (now > v.reset) hits.delete(k);
    if (entry.count > max) {
      res.set('Retry-After', Math.ceil((entry.reset - now) / 1000));
      return res.status(429).json({ error: 'Too many requests. Please wait a few minutes and try again.' });
    }
    next();
  };
}
const formLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: Number(process.env.FORM_RATE_LIMIT) || 10 });
const readLimiter = rateLimit({ windowMs: 60 * 1000, max: 120 });
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
app.get('/terms', (req, res) => html(res, termsPage()));

const baseUrl = (req) => (business.siteUrl ? business.siteUrl.replace(/\/$/, '') : `${req.protocol}://${req.get('host')}`);
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nDisallow: /admin\nDisallow: /api/\nSitemap: ${baseUrl(req)}/sitemap.xml\n`);
});
app.get('/sitemap.xml', (req, res) => {
  const urls = ['/', '/privacy', '/terms', ...services.map((s) => `/services/${s.slug}`)];
  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map((u) => `  <url><loc>${baseUrl(req)}${u}</loc></url>`)
      .join('\n')}\n</urlset>`
  );
});

// ---------- Public APIs ----------
app.get('/api/availability', readLimiter, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(schedule.availability(String(req.query.date || '')));
});

const REF_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newRef = (prefix) => `${prefix}-${Array.from(crypto.randomBytes(6), (x) => REF_CHARS[x % REF_CHARS.length]).join('')}`;

function insertWithRef(table, prefix, columns, data) {
  const sql = `INSERT INTO ${table} (reference, ${columns.join(', ')}) VALUES (?, ${columns.map(() => '?').join(', ')})`;
  for (let i = 0; i < 5; i++) {
    const reference = newRef(prefix);
    try {
      const r = db.prepare(sql).run(reference, ...columns.map((c) => data[c]));
      return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(r.lastInsertRowid);
    } catch (err) {
      if (!/UNIQUE.*reference/.test(err.message)) throw err;
    }
  }
  throw new Error('Could not generate a unique reference');
}

function handleSubmission({ validate, table, prefix, columns, check, onCreated }) {
  return (req, res) => {
    if (!auth.sameOrigin(req)) return res.status(403).json({ error: 'Forbidden.' });
    // Honeypot: bots fill the hidden "website" field. Respond as usual but store nothing.
    if (req.body && req.body.website) return res.status(201).json({ ok: true, reference: newRef(prefix) });

    const { data, errors } = validate(req.body);
    if (Object.keys(errors).length) return res.status(422).json({ error: 'Please check the highlighted fields.', fields: errors });

    // Idempotency: the same submission_id (double-click, retry) never creates a second record.
    const existing = db.prepare(`SELECT reference FROM ${table} WHERE submission_id = ?`).get(data.submission_id);
    if (existing) return res.status(200).json({ ok: true, duplicate: true, reference: existing.reference });

    if (check) {
      const problem = check(data);
      if (problem) return res.status(409).json(problem);
    }
    try {
      const row = insertWithRef(table, prefix, columns, data);
      res.status(201).json({ ok: true, reference: row.reference });
      if (onCreated) onCreated(row, `${baseUrl(req)}/admin`);
    } catch (err) {
      console.error(`[${table}] insert failed`, err);
      res.status(500).json({ error: 'We could not save your request. Please try again, or contact us directly.' });
    }
  };
}

app.post(
  '/api/appointments',
  formLimiter,
  handleSubmission({
    validate: validateAppointment,
    table: 'appointments',
    prefix: 'APT',
    columns: ['submission_id', 'name', 'phone', 'email', 'vehicle_make', 'vehicle_model', 'vehicle_year', 'service', 'preferred_date', 'preferred_time', 'message'],
    check: (d) =>
      schedule.isSlotAvailable(d.preferred_date, d.preferred_time)
        ? null
        : { error: 'That time is no longer available. Please choose another slot.', fields: { preferred_time: 'This time is no longer available.' } },
    onCreated: (row, adminUrl) => notify.appointmentCreated(row, adminUrl),
  })
);
app.post(
  '/api/contact',
  formLimiter,
  handleSubmission({
    validate: validateInquiry,
    table: 'inquiries',
    prefix: 'MSG',
    columns: ['submission_id', 'name', 'email', 'phone', 'subject', 'message'],
    onCreated: (row, adminUrl) => notify.inquiryCreated(row, adminUrl),
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
  if (!auth.checkPassword(req.body.password)) return html(res, loginPage({ error: 'That password is not correct.' }), 401);
  auth.createSession(res);
  res.redirect(303, '/admin');
});
app.post('/admin/logout', (req, res) => {
  auth.destroySession(req, res);
  res.redirect(303, '/admin/login');
});

const admin = express.Router();
admin.use(auth.requireAdmin);
admin.get('/', (req, res) => html(res, dashboardPage({ notifyEnabled: notify.enabled() })));

const RESOURCES = {
  appointments: { statuses: ['Pending', 'Confirmed', 'Completed', 'Cancelled'], search: ['name', 'email', 'phone', 'vehicle_make', 'vehicle_model', 'service', 'reference'] },
  inquiries: { statuses: ['New', 'Responded', 'Archived'], search: ['name', 'email', 'phone', 'subject', 'message', 'reference'] },
};

admin.get('/api/customers', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  const like = `%${q}%`;
  const rows = db
    .prepare(
      `SELECT lower(email) AS email,
              (SELECT name FROM appointments a2 WHERE lower(a2.email) = lower(a.email) ORDER BY created_at DESC LIMIT 1) AS name,
              (SELECT phone FROM appointments a2 WHERE lower(a2.email) = lower(a.email) ORDER BY created_at DESC LIMIT 1) AS phone,
              COUNT(*) AS requests,
              SUM(status = 'Completed') AS completed,
              group_concat(DISTINCT vehicle_year || ' ' || vehicle_make || ' ' || vehicle_model) AS vehicles,
              MAX(created_at) AS last_request
       FROM appointments a
       ${q ? 'WHERE name LIKE ? OR email LIKE ? OR phone LIKE ? OR vehicle_make LIKE ? OR vehicle_model LIKE ?' : ''}
       GROUP BY lower(email) ORDER BY last_request DESC LIMIT 500`
    )
    .all(...(q ? [like, like, like, like, like] : []));
  res.json({ rows });
});

admin.get('/api/slots', (req, res) => {
  const date = String(req.query.date || '');
  const exclude = Number(req.query.exclude) || 0;
  const slots = schedule.slotsForDate(date).map((time) => ({ time, confirmed: schedule.confirmedCount(date, time, exclude) }));
  res.json({ date, capacity: business.booking.capacity, slots });
});

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
  if (t === 'appointments' && req.query.when === 'upcoming') {
    where.push('preferred_date >= ?');
    params.push(schedule.localISO());
  }
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  if (q) {
    where.push(`(${cfg.search.map((c) => `${c} LIKE ?`).join(' OR ')})`);
    cfg.search.forEach(() => params.push(`%${q}%`));
  }
  const order = t === 'appointments' && req.query.when === 'upcoming' ? 'preferred_date ASC, preferred_time ASC' : 'created_at DESC, id DESC';
  const rows = db.prepare(`SELECT * FROM ${t} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${order} LIMIT 500`).all(...params);
  const counts = Object.fromEntries(cfg.statuses.map((s) => [s, 0]));
  for (const r of db.prepare(`SELECT status, COUNT(*) AS n FROM ${t} GROUP BY status`).all()) counts[r.status] = r.n;
  if (t === 'appointments') {
    // Flag requests that clash with another confirmed appointment in the same slot.
    for (const r of rows) r.slot_confirmed = schedule.confirmedCount(r.preferred_date, r.preferred_time, r.id);
  }
  res.json({ rows, counts, statuses: cfg.statuses, capacity: business.booking.capacity });
});

admin.patch('/api/:resource/:id', (req, res) => {
  const t = req.params.resource;
  const cfg = RESOURCES[t];
  if (!cfg) return res.status(404).json({ error: 'Not found.' });
  const id = Number(req.params.id);
  const current = db.prepare(`SELECT * FROM ${t} WHERE id = ?`).get(id);
  if (!current) return res.status(404).json({ error: 'Record not found.' });

  const next = { ...current };
  const sets = [];
  const params = [];
  const set = (col, val) => {
    sets.push(`${col} = ?`);
    params.push(val);
    next[col] = val;
  };
  if (req.body.status !== undefined) {
    if (!cfg.statuses.includes(req.body.status)) return res.status(422).json({ error: 'Invalid status.' });
    set('status', req.body.status);
  }
  if (req.body.admin_notes !== undefined) set('admin_notes', String(req.body.admin_notes).slice(0, 5000));
  if (t === 'appointments') {
    if (req.body.preferred_date !== undefined) {
      if (!schedule.parseISODate(req.body.preferred_date)) return res.status(422).json({ error: 'Invalid date.' });
      set('preferred_date', req.body.preferred_date);
    }
    if (req.body.preferred_time !== undefined) {
      if (!/^\d{2}:\d{2}$/.test(req.body.preferred_time)) return res.status(422).json({ error: 'Invalid time.' });
      set('preferred_time', req.body.preferred_time);
    }
    // Never allow more confirmed appointments in a slot than the workshop can handle.
    if (next.status === 'Confirmed' && schedule.confirmedCount(next.preferred_date, next.preferred_time, id) >= business.booking.capacity) {
      return res.status(409).json({
        error: `Another confirmed appointment already uses ${next.preferred_date} at ${next.preferred_time}. Choose a different time before confirming.`,
      });
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
  sets.push("updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')");
  db.prepare(`UPDATE ${t} SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
  res.json({ ok: true, row: db.prepare(`SELECT * FROM ${t} WHERE id = ?`).get(id) });
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
      console.log(`\n[admin] No ADMIN_PASSWORD set — temporary password for this run: ${auth.generatedPassword}`);
      console.log('[admin] Set ADMIN_PASSWORD to choose a permanent one.\n');
    } else if (!auth.adminEnabled()) {
      console.warn('[admin] ADMIN_PASSWORD is not set — the admin dashboard is disabled.');
    }
    if (!notify.enabled()) console.log('[notify] Email alerts are off. Set NOTIFY_TO and SMTP_* to turn them on (see README).');
  });
}

module.exports = app;
