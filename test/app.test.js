process.env.DB_PATH = ':memory:';
process.env.ADMIN_PASSWORD = 'correct-horse-battery';
process.env.FORM_RATE_LIMIT = '1000';
process.env.SMTP_TRANSPORT = 'json';
process.env.NOTIFY_TO = 'shop@example.com';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../server');
const { localISO } = require('../src/schedule');

let server, base;
before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

// Next weekday at least 2 days ahead (default schedule is Mon–Fri 08:00–17:00).
function nextWeekday(offset = 2) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return localISO(d);
}
function nextWeekend() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
  return localISO(d);
}
const DAY = nextWeekday();
let n = 0;
const appt = (over = {}) => ({
  submission_id: `test-${++n}-${Math.random().toString(36).slice(2)}-xxxx`,
  name: 'Test Customer', phone: '555 010 0000', email: 'test@example.com',
  vehicle_make: 'Volkswagen', vehicle_model: 'Golf', vehicle_year: '2018',
  service: 'Brake Repair & Replacement', preferred_date: DAY, preferred_time: '10:00', message: 'Squeal from the front', ...over,
});
const post = (path, body, headers = {}) =>
  fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function login() {
  const res = await fetch(base + '/admin/login', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'password=correct-horse-battery' });
  assert.equal(res.status, 303);
  return res.headers.get('set-cookie').split(';')[0];
}
const patch = (cookie, path, body) => fetch(base + path, { method: 'PATCH', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('public pages render', async () => {
  for (const p of ['/', '/services/brake-repair', '/services/pre-purchase-inspection', '/privacy', '/terms', '/sitemap.xml', '/robots.txt']) {
    assert.equal((await fetch(base + p)).status, 200, p);
  }
  assert.equal((await fetch(base + '/services/nope')).status, 404);
  const html = await (await fetch(base + '/')).text();
  assert.match(html, /Precision Repairs/);
  assert.doesNotMatch(html, /application\/ld\+json/, 'no structured data until a business name is set');
});

test('availability: weekday has slots, weekend is closed, bad date is closed', async () => {
  const a = await (await fetch(`${base}/api/availability?date=${DAY}`)).json();
  assert.ok(a.open);
  assert.equal(a.slots[0].time, '08:00');
  assert.ok(a.slots.find((s) => s.time === '10:00').available);
  const w = await (await fetch(`${base}/api/availability?date=${nextWeekend()}`)).json();
  assert.equal(w.open, false);
  const bad = await (await fetch(`${base}/api/availability?date=2001-01-01`)).json();
  assert.equal(bad.open, false);
});

test('appointment: saved with reference, duplicate ignored, owner notified', async () => {
  const body = appt();
  const r1 = await post('/api/appointments', body);
  assert.equal(r1.status, 201);
  const j1 = await r1.json();
  assert.match(j1.reference, /^APT-[A-Z0-9]{6}$/);
  const r2 = await post('/api/appointments', body);
  assert.equal(r2.status, 200);
  assert.equal((await r2.json()).reference, j1.reference);
  await wait(100);
  const cookie = await login();
  const list = await (await fetch(base + '/admin/api/appointments', { headers: { cookie } })).json();
  const row = list.rows.find((r) => r.reference === j1.reference);
  assert.ok(row.notified_at, 'notification recorded');
  assert.equal(row.status, 'Pending');
});

test('appointment: validation and unavailable slots', async () => {
  const r = await post('/api/appointments', appt({ email: 'bad', vehicle_year: '1800', service: 'Nope', name: '', preferred_time: '' }));
  assert.equal(r.status, 422);
  const j = await r.json();
  for (const f of ['email', 'vehicle_year', 'service', 'name', 'preferred_time']) assert.ok(j.fields[f], f);
  assert.equal((await post('/api/appointments', appt({ preferred_date: nextWeekend() }))).status, 409, 'closed day');
  assert.equal((await post('/api/appointments', appt({ preferred_time: '10:30' }))).status, 409, 'not a slot');
  assert.equal((await post('/api/appointments', appt({ preferred_date: '2001-01-01' }))).status, 409, 'past');
});

test('confirmed appointments cannot clash, and a taken slot is not bookable', async () => {
  const cookie = await login();
  const a = await (await post('/api/appointments', appt({ preferred_time: '14:00' }))).json();
  const b = await (await post('/api/appointments', appt({ preferred_time: '14:00', name: 'Second Customer' }))).json();
  const rows = (await (await fetch(base + '/admin/api/appointments', { headers: { cookie } })).json()).rows;
  const ra = rows.find((r) => r.reference === a.reference), rb = rows.find((r) => r.reference === b.reference);
  assert.equal((await patch(cookie, `/admin/api/appointments/${ra.id}`, { status: 'Confirmed' })).status, 200);
  assert.equal((await patch(cookie, `/admin/api/appointments/${rb.id}`, { status: 'Confirmed' })).status, 409);
  // Rescheduling the second request to a free slot lets it be confirmed.
  const ok = await patch(cookie, `/admin/api/appointments/${rb.id}`, { status: 'Confirmed', preferred_time: '15:00' });
  assert.equal(ok.status, 200);
  const slots = await (await fetch(`${base}/api/availability?date=${DAY}`)).json();
  assert.equal(slots.slots.find((s) => s.time === '14:00').available, false);
  assert.equal((await post('/api/appointments', appt({ preferred_time: '14:00' }))).status, 409);
});

test('contact: saves and validates', async () => {
  const ok = await post('/api/contact', { submission_id: 'contact-test-0001-abcd', subject: 'Repair estimate', name: 'Sam', email: 'sam@example.com', message: 'Price for front pads on a 2016 Golf?' });
  assert.equal(ok.status, 201);
  assert.match((await ok.json()).reference, /^MSG-/);
  const bad = await post('/api/contact', { submission_id: 'contact-test-0002-abcd', subject: 'Spam', name: 'Sam', email: 'sam@', message: 'hi' });
  assert.equal(bad.status, 422);
});

test('cross-origin posts are rejected', async () => {
  assert.equal((await post('/api/appointments', appt(), { Origin: 'https://evil.example' })).status, 403);
});

test('admin is protected', async () => {
  assert.equal((await fetch(base + '/admin', { redirect: 'manual' })).status, 302);
  assert.equal((await fetch(base + '/admin/api/appointments')).status, 401);
  assert.equal((await fetch(base + '/admin/api/customers')).status, 401);
  const bad = await fetch(base + '/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'password=wrong' });
  assert.equal(bad.status, 401);
});

test('admin: customers, slots, invalid status, delete, logout', async () => {
  const cookie = await login();
  const cust = await (await fetch(base + '/admin/api/customers', { headers: { cookie } })).json();
  assert.ok(cust.rows.some((c) => c.email === 'test@example.com' && c.requests >= 2));
  const slots = await (await fetch(`${base}/admin/api/slots?date=${DAY}`, { headers: { cookie } })).json();
  assert.equal(slots.slots.find((s) => s.time === '14:00').confirmed, 1);
  const rows = (await (await fetch(base + '/admin/api/appointments?when=upcoming', { headers: { cookie } })).json()).rows;
  assert.ok(rows.length >= 1);
  assert.equal((await patch(cookie, `/admin/api/appointments/${rows[0].id}`, { status: 'Hacked' })).status, 422);
  assert.equal((await fetch(`${base}/admin/api/appointments/${rows[0].id}`, { method: 'DELETE', headers: { cookie } })).status, 200);
  const inq = await (await fetch(base + '/admin/api/inquiries?status=New', { headers: { cookie } })).json();
  assert.equal(inq.rows.length, 1);
  assert.equal((await fetch(base + '/admin/logout', { method: 'POST', headers: { cookie }, redirect: 'manual' })).status, 303);
  assert.equal((await fetch(base + '/admin/api/appointments', { headers: { cookie } })).status, 401);
});
