// Unit tests for backend function logic (run with `npm test`). Functions are bundled with esbuild and
// loaded with a minimal Deno shim; the Base44 SDK import is left external (never called here).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
fs.mkdirSync(path.join(ROOT, '.local-backend'), { recursive: true });
globalThis.Deno = { serve: () => ({}), env: { get: (k) => process.env[k] } };
async function load(fn) {
  const outfile = path.join(ROOT, '.local-backend', `unit-${fn}.mjs`);
  await esbuild.build({ entryPoints: [path.join(ROOT, 'base44/functions', fn, 'entry.ts')], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
    plugins: [{ name: 'npm', setup(b) { b.onResolve({ filter: /^npm:@base44\/sdk/ }, () => ({ path: '@base44/sdk', external: true })); } }] });
  return import(pathToFileURL(outfile).href + `?t=${Date.now()}`);
}

test('vendored _shared.ts copies match base44/shared/shared.ts', () => {
  const src = fs.readFileSync(path.join(ROOT, 'base44/shared/shared.ts'), 'utf8');
  for (const fn of fs.readdirSync(path.join(ROOT, 'base44/functions'))) {
    const p = path.join(ROOT, 'base44/functions', fn, '_shared.ts');
    if (fs.existsSync(p)) assert.ok(fs.readFileSync(p, 'utf8').endsWith(src), `${fn}/_shared.ts is stale — run npm run sync:shared`);
  }
});

test('every entity schema parses and declares RLS', () => {
  for (const f of fs.readdirSync(path.join(ROOT, 'base44/entities'))) {
    const s = JSON.parse(fs.readFileSync(path.join(ROOT, 'base44/entities', f), 'utf8').replace(/^\s*\/\/.*$/gm, ''));
    assert.equal(`${s.name}.jsonc`, f);
    for (const op of ['create', 'read', 'update', 'delete']) assert.ok(op in s.rls, `${s.name} missing rls.${op}`);
  }
});

test('AI rubric: explainable, bounded, rewards evidence', async () => {
  const { scoreCandidate } = await load('ai');
  const job = { title: 'Line Cook', category: 'line_cook', employment_type: 'full_time', location: 'downtown_toronto', experience_level: '3_5', skills: ['Grill', 'Sauté'], certifications: ['Food Handler'], shifts: ['evenings'] };
  const strong = scoreCandidate(job, { years_experience: 4, skills: ['Grill', 'Sauté'], certifications: ['Food Handler Certificate'], preferred_categories: ['line_cook'], availability: ['full_time'], shifts: ['evenings'], preferred_locations: ['downtown_toronto'] });
  const weak = scoreCandidate(job, { years_experience: 0, skills: [], availability: ['part_time'], shifts: ['mornings'], preferred_locations: ['brampton'] });
  assert.equal(strong.score, 100);
  assert.ok(weak.score < 30, `weak ${weak.score}`);
  assert.equal(strong.breakdown.length, 6);
  assert.equal(strong.breakdown.reduce((s, b) => s + b.max, 0), 100);
  for (const b of weak.breakdown) assert.ok(b.explanation.length > 10);
  assert.ok(weak.missing.some((m) => m.includes('Grill')));
});

test('Ontario pay rules: range cap, minimum wage floor, pay required', async () => {
  const { validatePay } = await load('jobs');
  assert.doesNotThrow(() => validatePay(22, 26, 'hour'));
  assert.doesNotThrow(() => validatePay(60000, 110000, 'year'));
  assert.doesNotThrow(() => validatePay(200000, 300000, 'year'));
  assert.throws(() => validatePay(50000, 120000, 'year'), /50,000/);
  assert.throws(() => validatePay(18, 45, 'hour'), /50,000/);
  assert.throws(() => validatePay(10, 12, 'hour'), /minimum wage/);
  assert.throws(() => validatePay(0, 0, 'hour'), /pay/i);
});

test('billing quote: promo + 13% HST', async () => {
  const { computeQuote } = await load('billing');
  const pricing = { tax_rate: 0.13, products: { single_job: { name: 'Single job post', price_cents: 7900, kind: 'one_time' } } };
  const q = computeQuote(pricing, 'single_job', null);
  assert.equal(q.tax_cents, Math.round(7900 * 0.13));
  assert.equal(q.total_cents, 7900 + Math.round(7900 * 0.13));
  assert.equal(computeQuote(pricing, 'single_job', { discount_type: 'percent', amount: 100 }).total_cents, 0);
  assert.equal(computeQuote(pricing, 'single_job', { discount_type: 'fixed', amount: 1000 }).subtotal_cents - 1000, 6900);
});

test('Stripe webhook signature verification', async () => {
  const { verifyStripeSignature } = await load('stripeWebhook');
  const secret = 'whsec_test';
  const raw = JSON.stringify({ type: 'checkout.session.completed' });
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  assert.equal(await verifyStripeSignature(raw, `t=${t},v1=${sig}`, secret), true);
  assert.equal(await verifyStripeSignature(raw, `t=${t},v1=${'0'.repeat(64)}`, secret), false);
  assert.equal(await verifyStripeSignature(raw + ' ', `t=${t},v1=${sig}`, secret), false);
  assert.equal(await verifyStripeSignature(raw, `t=${t - 3600},v1=${crypto.createHmac('sha256', secret).update(`${t - 3600}.${raw}`).digest('hex')}`, secret), false);
});

test('sitemap includes live jobs and escapes URLs', async () => {
  const { buildSitemap } = await load('site');
  const xml = buildSitemap('https://staffto.ca', [{ id: 'j1', slug: 'line-cook&co', updated_date: '2026-11-01T00:00:00Z' }], [{ slug: 'hiring-guide', updated_date: '2026-10-01' }], []);
  assert.match(xml, /<loc>https:\/\/staffto.ca\/jobs\/j1\/line-cook&amp;co<\/loc>/);
  assert.match(xml, /cook-jobs-toronto/);
  assert.match(xml, /\/resources\/hiring-guide/);
});
