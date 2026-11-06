// Regenerates public/images/og-image.png (1200×630) for social sharing.
// Requires Playwright (`npm i -D playwright`), then: npm run og-image
// Run it after setting your business name in config/business.js.
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');
const business = require('../config/business');

const name = business.name || `${business.logoFallback.primary} ${business.logoFallback.secondary}`;
const city = business.address.city ? ` · ${business.address.city}` : '';
const car = fs.readFileSync(path.join(__dirname, '../public/images/drawing-car.svg'), 'utf8');
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

const html = `<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@500;600&display=swap" rel="stylesheet">
<style>
body{margin:0;width:1200px;height:630px;background:#141618;color:#fff;font-family:Sora,Helvetica,Arial,sans-serif;position:relative;overflow:hidden}
.car{position:absolute;right:-90px;bottom:40px;width:820px;opacity:.9}
.fade{position:absolute;inset:0;background:linear-gradient(90deg,#141618 0%,rgba(20,22,24,.85) 40%,rgba(20,22,24,0) 75%)}
.c{position:absolute;left:72px;top:84px}
.k{font-size:17px;letter-spacing:.18em;text-transform:uppercase;color:#9ea2a8;display:flex;align-items:center;gap:14px}
.k:before{content:'';width:32px;height:2px;background:#c8102e}
h1{font-size:76px;line-height:1.02;letter-spacing:-.04em;font-weight:500;margin:30px 0 0;max-width:640px}
h1 span{display:block;color:#bdb9b1}
.n{position:absolute;left:72px;bottom:64px;font-size:26px;font-weight:600;letter-spacing:-.01em}
.n:after{content:'';display:inline-block;width:10px;height:10px;background:#c8102e;margin-left:10px}
</style></head><body><div class="car">${car}</div><div class="fade"></div>
<div class="c"><div class="k">Auto repair &amp; servicing${esc(city)}</div><h1>Precision Repairs. <span>Performance You Can Trust.</span></h1></div>
<div class="n">${esc(name)}</div></body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(html, { waitUntil: 'networkidle' }).catch(() => {});
  await page.screenshot({ path: path.join(__dirname, '../public/images/og-image.png') });
  await browser.close();
  console.log('Wrote public/images/og-image.png');
})();
