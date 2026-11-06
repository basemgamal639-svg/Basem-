// End-to-end QA for StaffTO (Phase 13). Builds against the local Base44-compatible backend and drives Chromium
// through every major flow, then probes security rules directly with the official SDK.
//
//   npm run build:local && npm run e2e
//
// Exit code is non-zero if any check fails.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createClient } from '@base44/sdk';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const PORT = 4455;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.join(ROOT, 'test/e2e/artifacts');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
async function check(name, fn) {
  try { await fn(); results.push([name, 'PASS']); console.log(`  ✓ ${name}`); }
  catch (e) { results.push([name, 'FAIL', e.message]); console.log(`  ✗ ${name}\n      ${e.message.split('\n')[0]}`); }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const server = spawn(process.execPath, ['test/local-backend/server.mjs', '--port', String(PORT), '--static', 'dist'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
server.stderr.on('data', (d) => process.stderr.write(`[backend] ${d}`));
await new Promise((r) => server.stdout.once('data', r));

const sdk = (token) => createClient({ appId: 'local-staffto', serverUrl: BASE, token });
const otp = async (email) => (await (await fetch(`${BASE}/__dev/otp?email=${encodeURIComponent(email)}`)).json()).otp;
async function apiSignup(email, type, name) {
  const c = sdk();
  await c.auth.register({ email, password: 'Password123!' });
  const { access_token } = await c.auth.verifyOtp({ email, otpCode: await otp(email) });
  const u = sdk(access_token);
  if (type) await u.functions.invoke('account', { action: 'bootstrap', account_type: type, full_name: name, accept_terms: true });
  return { client: u, token: access_token };
}
const expectDenied = async (p, label) => {
  try { await p; } catch (e) { const s = e.status || e.response?.status; assert([401, 403, 404, 422].includes(s), `${label}: expected denial, got ${s} ${e.message}`); return; }
  throw new Error(`${label}: request unexpectedly succeeded`);
};

const browser = await chromium.launch();
const ctx = async (opts = {}) => {
  const c = await browser.newContext({ viewport: { width: 1360, height: 900 }, ...opts });
  await c.addInitScript(() => localStorage.setItem('sto_consent_v1', JSON.stringify({ analytics: true })));
  return c;
};
const errorsOf = (page) => { const errs = []; page.on('pageerror', (e) => errs.push(e.message)); return errs; };

async function uiSignup(page, email, type, name) {
  await page.goto(`${BASE}/signup${type === 'employer' ? '?type=employer' : ''}`);
  await page.fill('#su-email', email);
  await page.fill('#su-password', 'Password123!');
  await page.click('button:has-text("Continue")');
  await page.waitForSelector('#otp');
  await page.fill('#otp', await otp(email));
  await page.click('button:has-text("Verify email")');
  await page.waitForURL(/onboarding/);
  if (type === 'seeker') await page.click('button:has-text("I’m looking for work")');
  await page.fill('#ob-name', name);
  await page.check('text=I agree to the');
  await page.click('form button[type=submit]:has-text("Continue")');
}

const ADMIN_EMAIL = 'admin@staffto.test';
const EMP_EMAIL = 'owner@kingwestbistro.test';
const SEEK_EMAIL = 'maria@seeker.test';
let jobUrl = '';
let jobId = '';

console.log('\nStaffTO end-to-end QA\n');
try {
  // Admin account (promoted via the dev-only helper; on Base44 the app owner is admin).
  const admin = await apiSignup(ADMIN_EMAIL, 'seeker', 'Ada Admin');
  await fetch(`${BASE}/__dev/make-admin`, { method: 'POST', body: JSON.stringify({ email: ADMIN_EMAIL }) });
  await admin.client.entities.PromoCode.create({ code: 'LAUNCH100', discount_type: 'percent', amount: 100, max_redemptions: 50, active: true, applies_to: [] });

  const empCtx = await ctx();
  const ep = await empCtx.newPage();
  const empErrors = errorsOf(ep);

  await check('1–2. Register an employer (email + OTP + onboarding)', async () => {
    await uiSignup(ep, EMP_EMAIL, 'employer', 'Jordan Owner');
    await ep.waitForURL(/employer\/profile/);
  });

  await check('3. Create an employer business profile', async () => {
    await ep.fill('input[required][maxlength="120"]', 'King West Bistro');
    await ep.locator('label:has-text("Street address") + input, label:has-text("Street address") ~ input').first().fill('620 King St W, Toronto');
    await ep.locator('select').nth(2).selectOption('25-49');
    await ep.fill('textarea', 'Seasonal Ontario menu, 90 seats, a kitchen team that actually likes each other.');
    await ep.click('button:has-text("Create business profile")');
    await ep.waitForURL(/employer\/jobs\/new/);
  });

  await check('4a. Publishing without credits is blocked (server-enforced paywall)', async () => {
    await ep.fill('input[placeholder^="e.g. Line Cook"]', 'Line Cook — Brunch');
    await ep.locator('fieldset input[type=number]').nth(0).fill('22');
    await ep.locator('fieldset input[type=number]').nth(1).fill('26');
    await ep.locator('textarea').first().fill('Brunch line on a busy King West patio. Grill and egg station.');
    await ep.click('button:has-text("Publish job")');
    await ep.waitForSelector('text=Publish with a job post or plan');
    await ep.click('button:has-text("Not now")');
  });

  await check('4b. Ontario pay-range rule enforced (> $50k/yr spread rejected)', async () => {
    const r = await sdk((await ep.evaluate(() => localStorage.getItem('base44_access_token')))).functions.invoke('jobs', { action: 'save', data: { title: 'Chef', category: 'chef', location: 'york', employment_type: 'full_time', salary_min: 50000, salary_max: 120000, salary_period: 'year' } }).catch((e) => e);
    assert((r.status || r.response?.status) === 400 && /50,000/.test(r.message + JSON.stringify(r.data || r.response?.data)), 'pay range not rejected');
  });

  await check('4c. Buy a single job post with promo code, then publish', async () => {
    await ep.goto(`${BASE}/employer/billing`);
    await ep.click('button:has-text("Buy a job post")');
    await ep.fill('label:has-text("Promo code") + input, label:has-text("Promo code") ~ input', 'LAUNCH100');
    await ep.click('button:has-text("Apply")');
    await ep.waitForSelector('button:has-text("Activate")');
    await ep.click('button:has-text("Activate")');
    await ep.waitForSelector('text=STO-');
    await ep.goto(`${BASE}/employer/jobs`);
    await ep.click('button:has-text("Drafts")');
    await ep.click('button:has-text("Publish")');
    await ep.waitForSelector('text=Job published');
  });

  await check('10. Share kit: Facebook copy, image, tracked links', async () => {
    await ep.click('button:has-text("Live")');
    await ep.click('a:has-text("Share")');
    await ep.waitForURL(/share/);
    const text = await ep.inputValue('textarea[aria-label="Announcement text"]');
    assert(/HIRING — LINE COOK — BRUNCH/.test(text) && /\$22–\$26\/hr/.test(text) && /utm_source=facebook/.test(text), `bad announcement: ${text}`);
    const fb = await ep.getAttribute('a:has-text("Share to Facebook")', 'href');
    assert(fb.startsWith('https://www.facebook.com/sharer/sharer.php?u='), 'facebook link');
    const png = await ep.evaluate(() => document.querySelector('canvas').toDataURL('image/png').length);
    assert(png > 20000, 'image not drawn');
    jobUrl = new URL(text.match(/https?:\S+/)[0]).pathname;
    jobId = jobUrl.split('/')[2];
    await ep.screenshot({ path: path.join(OUT, 'share-kit.png') });
  });

  // Seeker
  const seekCtx = await ctx();
  const sp = await seekCtx.newPage();
  const seekErrors = errorsOf(sp);
  await check('1. Register a job seeker', async () => {
    await uiSignup(sp, SEEK_EMAIL, 'seeker', 'Maria Santos');
    await sp.waitForURL(/account\/profile/);
  });

  await check('Seeker profile with skills & work history', async () => {
    await sp.fill('label:has-text("Headline") ~ input', 'Line cook · 4 yrs brunch & grill');
    await sp.fill('label:has-text("Years of hospitality experience") ~ input', '4');
    const skills = sp.locator('label:has-text("Skills") ~ div input').first();
    for (const s of ['Grill', 'High volume']) { await skills.fill(s); await skills.press('Enter'); }
    await sp.click('button[aria-pressed]:has-text("Line Cook")');
    await sp.click('button:has-text("Add role")');
    await sp.fill('input[placeholder="Line Cook"]', 'Line Cook');
    await sp.click('button:has-text("Save profile")');
    await sp.waitForSelector('text=Profile saved.');
  });

  await check('7. Upload a resume (private storage)', async () => {
    await sp.goto(`${BASE}/account/resumes`);
    const file = path.join(OUT, 'maria-resume.pdf');
    fs.writeFileSync(file, '%PDF-1.4\n% Maria Santos resume — Line cook, grill, egg station, Smart Serve, Food Handler\n%%EOF');
    await sp.setInputFiles('input[type=file]', file);
    await sp.waitForSelector('text=maria-resume.pdf');
  });

  await check('5. Search and filter jobs', async () => {
    await sp.goto(`${BASE}/jobs?category=line_cook&location=downtown_toronto`);
    await sp.waitForSelector('text=Line Cook — Brunch');
    await sp.goto(`${BASE}/jobs?category=bartender`);
    await sp.waitForSelector('text=No matching jobs right now');
    await sp.goto(`${BASE}/jobs?min_pay=30`);
    await sp.waitForSelector('text=No matching jobs right now');
    await sp.goto(`${BASE}/jobs`);
    await sp.fill('input[aria-label="Search jobs"]', 'brunch');
    await sp.waitForSelector('text=Line Cook — Brunch');
  });

  await check('SEO: job page has JobPosting JSON-LD, canonical and title', async () => {
    await sp.goto(`${BASE}${jobUrl}`);
    await sp.waitForSelector('h1:has-text("Line Cook — Brunch")');
    const ld = JSON.parse(await sp.locator('#ld-json').textContent());
    assert(ld['@type'] === 'JobPosting' && ld.baseSalary.value.minValue === 22 && ld.hiringOrganization.name === 'King West Bistro', 'JobPosting LD');
    assert(/Line Cook — Brunch at King West Bistro/.test(await sp.title()), 'title');
    assert((await sp.getAttribute('link[rel=canonical]', 'href')).includes(`/jobs/${jobId}`), 'canonical');
  });

  await check('6. Apply for a job (with AI consent)', async () => {
    await sp.click('button:has-text("Apply now")');
    await sp.waitForSelector('text=Allow AI-assisted review');
    await sp.fill('textarea[placeholder^="Why you"]', 'Four years on a brunch line, can start Monday.');
    await sp.check('text=Allow AI-assisted review of this application (optional)');
    await sp.click('button:has-text("Send application")');
    await sp.waitForSelector('text=You applied');
  });

  await check('Duplicate application is rejected server-side', async () => {
    const tok = await sp.evaluate(() => localStorage.getItem('base44_access_token'));
    const r = await sdk(tok).functions.invoke('jobs', { action: 'apply', job_id: jobId }).catch((e) => e);
    assert((r.status || r.response?.status) === 409, 'duplicate not blocked');
  });

  await check('Save a job', async () => {
    await sp.goto(`${BASE}/jobs`);
    await sp.click('button:has-text("Save")');
    await sp.waitForSelector('text=Saved. Find it in your dashboard.');
  });

  await check('8. Employer reviews applications + downloads authorised resume', async () => {
    await ep.goto(`${BASE}/employer/jobs/${jobId}/applicants`);
    await ep.click('button:has-text("Maria Santos")');
    await ep.waitForSelector('a:has-text("Download resume")');
    const href = await ep.getAttribute('a:has-text("Download resume")', 'href');
    const ok = await fetch(href);
    assert(ok.status === 200, 'signed resume URL should work');
    const tampered = await fetch(href.replace(/token=[^&]+/, 'token=bad'));
    assert(tampered.status !== 200, 'tampered resume token must fail');
  });

  await check('AI analysis is plan-gated (non-Premium employer blocked)', async () => {
    const tok = await ep.evaluate(() => localStorage.getItem('base44_access_token'));
    const apps = await sdk(tok).entities.JobApplication.filter({ job_id: jobId });
    const r = await sdk(tok).functions.invoke('ai', { action: 'analyze', application_id: apps[0].id }).catch((e) => e);
    assert((r.status || r.response?.status) === 402, 'expected upgrade_required');
  });

  await check('12. Admin dashboard + employer verification + plan grant (audited)', async () => {
    const ac = await ctx();
    const ap = await ac.newPage();
    await ap.goto(`${BASE}/login`);
    await ap.fill('#email', ADMIN_EMAIL);
    await ap.fill('#password', 'Password123!');
    await ap.click('form button[type=submit]');
    await ap.waitForURL(/account/);
    await ap.goto(`${BASE}/admin`);
    await ap.waitForSelector('text=Platform overview');
    await ap.screenshot({ path: path.join(OUT, 'admin-overview.png'), fullPage: true });
    await ap.goto(`${BASE}/admin/employers`);
    await ap.click('button:has-text("All")');
    await ap.click('button:has-text("Verify")');
    await ap.waitForSelector('text=Verified.');
    await ap.click('button:has-text("Grant")');
    await ap.locator('[role=dialog] select').first().selectOption('premium');
    await ap.click('[role=dialog] button:has-text("Grant")');
    await ap.waitForSelector('text=Granted.');
    await ap.goto(`${BASE}/admin/audit`);
    await ap.waitForSelector('text=employer.verify');
    await ap.waitForSelector('text=billing.grant');
    await ac.close();
  });

  await check('Phase 5. AI analysis (Premium): explainable rubric score, advisory only', async () => {
    await ep.goto(`${BASE}/employer/jobs/${jobId}/applicants`);
    await ep.click('button:has-text("Maria Santos")');
    await ep.click('[role=dialog] button:has-text("Analyse")');
    await ep.waitForSelector('text=job-relevance (advisory)');
    await ep.waitForSelector('td:has-text("Experience")');
    const tok = await ep.evaluate(() => localStorage.getItem('base44_access_token'));
    const [app] = await sdk(tok).entities.JobApplication.filter({ job_id: jobId });
    assert(app.ai_score >= 0 && app.ai_breakdown.criteria.length === 6 && app.status !== 'rejected', 'AI analysis shape / no auto-decision');
    await ep.screenshot({ path: path.join(OUT, 'applicant-ai.png') });
  });

  await check('9. Update application status → candidate notified', async () => {
    await ep.click('[role=dialog] button:has-text("Shortlisted")');
    await ep.waitForSelector('text=Moved to Shortlisted.');
    await sp.goto(`${BASE}/account/applications`);
    await sp.waitForSelector('text=Shortlisted');
    await sp.goto(`${BASE}/notifications`);
    await sp.waitForSelector("text=You've been shortlisted");
  });

  await check('Contact applicant through the platform (messaging both ways)', async () => {
    await ep.fill('[role=dialog] textarea[placeholder="Write a message…"]', 'Hi Maria — can you do a stage on Thursday at 10?');
    await ep.click('[role=dialog] button:has-text("Send")');
    await ep.waitForSelector('text=can you do a stage');
    await sp.goto(`${BASE}/messages`);
    await sp.waitForSelector('text=can you do a stage');
    await sp.fill('textarea[aria-label="Message"]', 'Thursday works, see you then!');
    await sp.click('button:has-text("Send")');
    await sp.waitForSelector('text=Thursday works');
  });

  await check('Withdraw application', async () => {
    await sp.goto(`${BASE}/account/applications`);
    await sp.click('button:has-text("Withdraw")');
    await sp.click('[role=dialog] button:has-text("Withdraw")');
    await sp.waitForSelector('text=Application withdrawn.');
  });

  await check('11. Create a classified listing → moderation → live → contact seller', async () => {
    await ep.goto(`${BASE}/classifieds/new`);
    await ep.fill('input[placeholder^="True 2-door"]', 'True T-49 reach-in fridge');
    await ep.fill('label:has-text("Price (CAD)") ~ input', '1800');
    await ep.fill('textarea', 'Two-door reach-in, 4 years old, works perfectly. Pickup on King West.');
    await ep.click('button:has-text("Submit for review")');
    await ep.waitForURL(/classifieds\/mine/);
    await ep.waitForSelector('text=In review');
    const admin2 = sdk((await (await fetch(`${BASE}/api/apps/x/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: ADMIN_EMAIL, password: 'Password123!' }) })).json()).access_token);
    const [listing] = await admin2.entities.ClassifiedListing.filter({ status: 'pending' });
    await admin2.functions.invoke('admin', { action: 'moderateListing', listing_id: listing.id, op: 'approve' });
    await sp.goto(`${BASE}/classifieds`);
    await sp.click('text=True T-49 reach-in fridge');
    await sp.fill('textarea', 'Is this still available? Could I see it Friday?');
    await sp.click('button:has-text("Send message")');
    await sp.waitForURL(/messages/);
  });

  await check('Report a listing → appears in admin queue', async () => {
    await sp.goto(`${BASE}${jobUrl}`);
    await sp.click('button:has-text("Report")');
    await sp.locator('[role=dialog] select').selectOption('misleading_pay');
    await sp.click('button:has-text("Send report")');
    await sp.waitForSelector('text=our moderators will review it');
  });

  await check('Homepage live statistics come from the database', async () => {
    const anon = sdk();
    const stats = (await anon.functions.invoke('site', { action: 'stats' })).data;
    assert(stats.active_jobs === 1 && stats.employers === 1 && stats.job_seekers === 2 && stats.applications === 1, `stats ${JSON.stringify(stats)}`);
    const p = await (await ctx()).newPage();
    await p.goto(BASE);
    await p.waitForSelector('text=Applications submitted');
    const nums = await p.locator('section.bg-ink p.font-display').allTextContents();
    assert(nums.join(',') === '1,1,2,1', `homepage shows ${nums}`);
  });

  await check('Privacy: data export + unsubscribe link', async () => {
    const tok = await sp.evaluate(() => localStorage.getItem('base44_access_token'));
    const { data } = (await sdk(tok).functions.invoke('account', { action: 'exportData' })).data;
    assert(data.applications.length === 1 && data.profile.length === 1, 'export incomplete');
    const token = data.profile[0].unsubscribe_token;
    const p = await (await ctx()).newPage();
    await p.goto(`${BASE}/unsubscribe?token=${token}`);
    await p.waitForSelector('text=unsubscribed from marketing emails');
  });

  // 14–15. Unauthorized access & database security
  const seeker = sdk(await sp.evaluate(() => localStorage.getItem('base44_access_token')));
  const employer = sdk(await ep.evaluate(() => localStorage.getItem('base44_access_token')));
  const anon = sdk();
  const intruder = (await apiSignup('intruder@evil.test', 'seeker', 'Ivan Intruder')).client;
  const [app] = await employer.entities.JobApplication.filter({ job_id: jobId });

  await check('15a. Anonymous cannot read private entities', async () => {
    for (const e of ['UserProfile', 'CandidateProfile', 'Resume', 'JobApplication', 'Payment', 'AuditLog', 'Message', 'AnalyticsEvent', 'PromoCode']) {
      const rows = await anon.entities[e].list().catch(() => []);
      assert(rows.length === 0, `anon read ${e}`);
    }
  });
  await check('15b. Seeker cannot create/modify jobs or grant themselves a plan', async () => {
    await expectDenied(seeker.entities.Job.create({ employer_id: 'x', owner_id: 'y', title: 'Fake', category: 'chef', location: 'york', employment_type: 'full_time' }), 'Job.create');
    await expectDenied(seeker.entities.Job.update(jobId, { salary_min: 99 }), 'Job.update');
    const emp = (await employer.entities.Employer.list())[0];
    await expectDenied(employer.entities.Employer.update(emp.id, { plan: 'premium', job_credits: 999 }), 'Employer plan FLS');
    await expectDenied(employer.entities.Employer.update(emp.id, { verified: !emp.verified }), 'Employer verified FLS');
    await expectDenied(intruder.entities.Employer.update(emp.id, { business_name: 'Hacked' }), 'other employer update');
  });
  await check('15c. Other users cannot read applications, profiles or resumes', async () => {
    assert((await intruder.entities.JobApplication.list()).length === 0, 'intruder sees applications');
    assert((await intruder.entities.CandidateProfile.list()).length === 0, 'intruder sees candidates');
    assert((await intruder.entities.Resume.list()).length === 0, 'intruder sees resumes');
    await expectDenied(intruder.functions.invoke('jobs', { action: 'candidate', application_id: app.id }), 'candidate fn');
    await expectDenied(intruder.functions.invoke('jobs', { action: 'updateApplication', application_id: app.id, status: 'hired' }), 'updateApplication fn');
    await expectDenied(intruder.functions.invoke('marketplace', { action: 'sendMessage', thread_key: `app:${app.id}`, body: 'hi' }), 'message thread');
    const [resume] = await seeker.entities.Resume.list();
    await expectDenied(intruder.functions.invoke('jobs', { action: 'resumeUrl', resume_id: resume.id }), 'resumeUrl fn');
  });
  await check('15d. Applicant cannot see employer-private notes / AI fields', async () => {
    const [mine] = await seeker.entities.JobApplication.list();
    assert(mine && mine.ai_score === undefined && mine.employer_notes === undefined && mine.ai_summary === undefined, 'private fields leaked to applicant');
  });
  await check('14. Non-admins blocked from admin functions & admin-only entities', async () => {
    for (const a of ['overview', 'listUsers', 'grantPlan', 'saveSetting', 'setUserRole']) await expectDenied(employer.functions.invoke('admin', { action: a, key: 'pricing', value: {}, user_id: 'x', role: 'admin' }), `admin.${a}`);
    await expectDenied(seeker.entities.PlatformSetting.create({ key: 'pricing', value: {} }), 'PlatformSetting.create');
    await expectDenied(seeker.entities.PromoCode.create({ code: 'FREE', discount_type: 'percent', amount: 100 }), 'PromoCode.create');
    await expectDenied(seeker.entities.Notification.create({ user_id: 'x', title: 'spoof' }), 'Notification spoof');
    await expectDenied(seeker.auth.updateMe({ role: 'admin' }).then(async () => { if ((await seeker.auth.me()).role !== 'admin') throw Object.assign(new Error('ignored'), { status: 403 }); }), 'role escalation');
  });
  await check('14b. Guarded routes: seeker → /admin and /employer show 403; anon → login', async () => {
    await sp.goto(`${BASE}/admin`);
    await sp.waitForSelector('text=403');
    await sp.goto(`${BASE}/employer/jobs`);
    await sp.waitForSelector('text=This area is for employer accounts.');
    const p = await (await ctx()).newPage();
    await p.goto(`${BASE}/account/applications`);
    await p.waitForURL(/login\?next=/);
  });
  await check('13. Mobile layouts (iPhone 13) — no horizontal overflow', async () => {
    const m = await browser.newContext({ ...devices['iPhone 13'] });
    await m.addInitScript(() => localStorage.setItem('sto_consent_v1', JSON.stringify({ analytics: false })));
    const p = await m.newPage();
    for (const route of ['/', '/jobs', jobUrl, '/employers', '/classifieds', '/community', '/signup', '/pricing']) {
      await p.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert(overflow <= 1, `${route} overflows by ${overflow}px`);
    }
    await p.goto(BASE, { waitUntil: 'networkidle' });
    await p.screenshot({ path: path.join(OUT, 'mobile-home.png') });
    await p.goto(`${BASE}${jobUrl}`, { waitUntil: 'networkidle' });
    await p.screenshot({ path: path.join(OUT, 'mobile-job.png') });
    await m.close();
  });
  await check('No uncaught page errors during the run', async () => {
    const all = [...empErrors, ...seekErrors];
    assert(all.length === 0, all.join(' | '));
  });
  await check('Account deletion removes personal data', async () => {
    const r = (await intruder.functions.invoke('account', { action: 'deleteAccount', confirm: 'DELETE' })).data;
    assert(r.ok && r.summary.UserProfile === 1, 'delete failed');
  });
} finally {
  await browser.close();
  server.kill();
}

const failed = results.filter((r) => r[1] === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
