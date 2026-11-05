process.env.DB_PATH = ':memory:';
process.env.ADMIN_PASSWORD = 'correct-horse-battery';
process.env.FORM_RATE_LIMIT = '1000';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../server');

let server, base;
before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const future = () => new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
const appt = (over = {}) => ({
  submission_id: 'test-' + Math.random().toString(36).slice(2) + '-xxxxxxxx',
  name: 'Test Customer', phone: '555 010 0000', email: 'test@example.com',
  vehicle_make: 'Toyota', vehicle_model: 'Corolla', vehicle_year: '2018',
  service: 'Brake Inspection & Repair', preferred_date: future(),
  preferred_time: 'Any time', message: 'Squeaky brakes', ...over,
});
const post = (path, body, headers = {}) =>
  fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

async function login() {
  const res = await fetch(base + '/admin/login', {
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'password=correct-horse-battery',
  });
  assert.equal(res.status, 303);
  return res.headers.get('set-cookie').split(';')[0];
}

test('public pages render', async () => {
  for (const p of ['/', '/services/brake-repair', '/privacy', '/sitemap.xml', '/robots.txt']) {
    assert.equal((await fetch(base + p)).status, 200, p);
  }
  assert.equal((await fetch(base + '/services/nope')).status, 404);
  const html = await (await fetch(base + '/')).text();
  assert.match(html, /Expert Auto Repair/);
  assert.doesNotMatch(html, /application\/ld\+json/, 'no structured data without a verified business name');
});

test('appointment: valid request is saved, duplicate is ignored', async () => {
  const body = appt();
  const r1 = await post('/api/appointments', body);
  assert.equal(r1.status, 201);
  const j1 = await r1.json();
  assert.match(j1.reference, /^APT-\d+$/);
  const r2 = await post('/api/appointments', body);
  assert.equal(r2.status, 200);
  assert.equal((await r2.json()).reference, j1.reference);
});

test('appointment: validation errors', async () => {
  const r = await post('/api/appointments', appt({ email: 'bad', vehicle_year: '1800', preferred_date: '2000-01-01', service: 'Nope', name: '' }));
  assert.equal(r.status, 422);
  const j = await r.json();
  for (const f of ['email', 'vehicle_year', 'preferred_date', 'service', 'name']) assert.ok(j.fields[f], f);
});

test('contact: saves and validates', async () => {
  const ok = await post('/api/contact', { submission_id: 'contact-test-0001-abcd', name: 'Sam', email: 'sam@example.com', message: 'Do you service hybrids?' });
  assert.equal(ok.status, 201);
  const bad = await post('/api/contact', { submission_id: 'contact-test-0002-abcd', name: 'Sam', email: 'sam@', message: 'hi' });
  assert.equal(bad.status, 422);
});

test('cross-origin form posts are rejected', async () => {
  const r = await post('/api/appointments', appt(), { Origin: 'https://evil.example' });
  assert.equal(r.status, 403);
});

test('admin is protected', async () => {
  assert.equal((await fetch(base + '/admin', { redirect: 'manual' })).status, 302);
  assert.equal((await fetch(base + '/admin/api/appointments')).status, 401);
  const bad = await fetch(base + '/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'password=wrong',
  });
  assert.equal(bad.status, 401);
});

test('admin can list, update status and delete', async () => {
  const cookie = await login();
  const list = await (await fetch(base + '/admin/api/appointments', { headers: { cookie } })).json();
  assert.ok(list.rows.length >= 1);
  assert.equal(list.rows[0].status, 'Pending');
  const id = list.rows[0].id;
  const patch = await fetch(`${base}/admin/api/appointments/${id}`, {
    method: 'PATCH', headers: { cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'Confirmed', admin_notes: 'Called customer' }),
  });
  assert.equal(patch.status, 200);
  assert.equal((await patch.json()).row.status, 'Confirmed');
  const invalid = await fetch(`${base}/admin/api/appointments/${id}`, {
    method: 'PATCH', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'Hacked' }),
  });
  assert.equal(invalid.status, 422);
  const inq = await (await fetch(base + '/admin/api/inquiries?status=New', { headers: { cookie } })).json();
  assert.equal(inq.rows.length, 1);
  const del = await fetch(`${base}/admin/api/appointments/${id}`, { method: 'DELETE', headers: { cookie } });
  assert.equal(del.status, 200);
  const logout = await fetch(base + '/admin/logout', { method: 'POST', headers: { cookie }, redirect: 'manual' });
  assert.equal(logout.status, 303);
  assert.equal((await fetch(base + '/admin/api/appointments', { headers: { cookie } })).status, 401);
});
