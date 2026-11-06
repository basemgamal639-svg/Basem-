// Writes public/sitemap.xml with the static routes and SEO landing pages.
// Live job, article and classified URLs are served by the `site` function (?action=sitemap) — see docs/seo.md.
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const site = (process.env.VITE_SITE_URL || 'https://staffto.ca').replace(/\/$/, '');
const seo = fs.readFileSync(path.join(root, 'src/pages/seoPages.js'), 'utf8');
const landing = [...seo.matchAll(/^  '([a-z-]+)': \{/gm)].map((m) => `/${m[1]}`);
const pages = ['/', '/jobs', '/employers', '/pricing', '/how-it-works', '/community', '/classifieds', '/resources', '/contact', ...landing, '/legal/privacy', '/legal/terms', '/legal/cookies', '/legal/ai', '/legal/employers'];
const areas = ['downtown_toronto', 'north_york', 'scarborough', 'etobicoke', 'mississauga', 'brampton', 'markham', 'vaughan', 'richmond_hill'];
const today = new Date().toISOString().slice(0, 10);
const xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...pages.map((p) => `  <url><loc>${site}${p}</loc><lastmod>${today}</lastmod><changefreq>${p === '/' || p === '/jobs' ? 'daily' : 'weekly'}</changefreq></url>`),
  ...areas.map((a) => `  <url><loc>${site}/jobs?location=${a}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq></url>`),
  '</urlset>', ''].join('\n');
fs.writeFileSync(path.join(root, 'public/sitemap.xml'), xml);
console.log(`sitemap.xml: ${pages.length + areas.length} URLs`);
