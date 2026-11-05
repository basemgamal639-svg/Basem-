// Regenerates public/images/og-image.png (1200×630) for social sharing.
// Requires Playwright (`npm i -D playwright`), then: npm run og-image
// Run it after setting your business name in config/business.js.
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');
const business = require('../config/business');

const name = business.name || `${business.logoFallback.primary} ${business.logoFallback.secondary}`;
const city = business.address.city ? ` · ${business.address.city}` : '';
const hero = fs.readFileSync(path.join(__dirname, '../public/images/hero-workshop.svg'), 'utf8');
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

const html = `<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>
body{margin:0;width:1200px;height:630px;background:#121417;color:#fff;font-family:'Barlow Condensed',Arial Narrow,sans-serif;display:grid;grid-template-columns:1fr 520px;align-items:center;overflow:hidden;
background-image:linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px);background-size:64px 64px}
.l{padding:0 0 0 72px}.k{font-family:'JetBrains Mono',monospace;font-size:20px;letter-spacing:.12em;color:#a7adb5;text-transform:uppercase}
h1{font-size:96px;line-height:.92;margin:22px 0 28px;text-transform:uppercase}h1 span{color:#ff5b14}
.n{display:inline-block;background:#ff5b14;color:#121417;font-size:34px;font-weight:700;padding:10px 22px;text-transform:uppercase;letter-spacing:.04em}
.r svg{width:520px;height:auto;display:block}
</style></head><body><div class="l"><div class="k">Auto repair &amp; maintenance${esc(city)}</div>
<h1>Expert Auto Repair. <span>Honest Service.</span></h1><div class="n">${esc(name)}</div></div><div class="r">${hero}</div></body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(html, { waitUntil: 'networkidle' }).catch(() => {});
  await page.screenshot({ path: path.join(__dirname, '../public/images/og-image.png') });
  await browser.close();
  console.log('Wrote public/images/og-image.png');
})();
