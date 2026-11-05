const { esc, b, business, services, siteUrl, localBusinessJsonLd } = require('./helpers');
const { sprite, icon } = require('../icons');

const NAV = [
  ['Home', '/#top'],
  ['Services', '/#services'],
  ['About Us', '/#about'],
  ['Why Choose Us', '/#why'],
  ['Contact', '/#contact'],
];

function logo(extraClass = '') {
  const [p, s] = business.name
    ? (() => {
        const parts = business.name.split(' ');
        return parts.length > 1 ? [parts.slice(0, -1).join(' '), parts.at(-1)] : [business.name, ''];
      })()
    : [business.logoFallback.primary, business.logoFallback.secondary];
  return `<a class="logo ${extraClass}" href="/" aria-label="${esc(b.displayName())} — home">
    <span class="logo-mark" aria-hidden="true">${icon('wrench')}</span>
    <span class="logo-text"><strong>${esc(p)}</strong><span>${esc(s)}</span></span>
  </a>`;
}

function header() {
  return `<header class="site-header" data-header>
  <div class="container header-inner">
    ${logo()}
    <nav class="main-nav" aria-label="Main">
      <ul>${NAV.map(([l, h]) => `<li><a href="${h}">${l}</a></li>`).join('')}</ul>
    </nav>
    <div class="header-actions">
      ${b.telHref() ? `<a class="header-call" href="${b.telHref()}">${icon('phone')}<span>${esc(business.phone)}</span></a>` : ''}
      <a class="btn btn-accent btn-sm header-cta" href="/#book">Book an Appointment</a>
      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="mobile-nav" data-nav-toggle>
        <span class="sr-only">Open menu</span>${icon('menu', 'icon icon-open')}${icon('close', 'icon icon-close')}
      </button>
    </div>
  </div>
  <div class="mobile-nav" id="mobile-nav" data-mobile-nav hidden>
    <nav aria-label="Mobile">
      <ul>${NAV.map(([l, h], i) => `<li><a href="${h}"><span class="mono">0${i + 1}</span>${l}</a></li>`).join('')}</ul>
    </nav>
    <div class="mobile-nav-foot">
      <a class="btn btn-accent btn-block" href="/#book">Book an Appointment</a>
      ${b.telHref() ? `<a class="btn btn-outline-light btn-block" href="${b.telHref()}">${icon('phone')} Call ${esc(business.phone)}</a>` : ''}
    </div>
  </div>
</header>`;
}

function footer() {
  const social = Object.entries(business.social).filter(([, url]) => url);
  return `<footer class="site-footer">
  <div class="container footer-grid">
    <div class="footer-brand">
      ${logo('logo-light')}
      <p>${esc(business.tagline)}</p>
      ${
        social.length
          ? `<ul class="social">${social
              .map(
                ([k, url]) =>
                  `<li><a href="${esc(url)}" target="_blank" rel="noopener" aria-label="${k[0].toUpperCase() + k.slice(1)}">${icon(k)}</a></li>`
              )
              .join('')}</ul>`
          : `<p class="social-ph"><span class="ph">[Social media links — add in config/business.js]</span></p>`
      }
    </div>
    <nav class="footer-col" aria-label="Quick links">
      <h2 class="footer-title">Quick Links</h2>
      <ul>${NAV.map(([l, h]) => `<li><a href="${h}">${l}</a></li>`).join('')}<li><a href="/#book">Book an Appointment</a></li></ul>
    </nav>
    <nav class="footer-col" aria-label="Services">
      <h2 class="footer-title">Services</h2>
      <ul>${services.map((s) => `<li><a href="/services/${s.slug}">${esc(s.name)}</a></li>`).join('')}</ul>
    </nav>
    <div class="footer-col">
      <h2 class="footer-title">Contact</h2>
      <ul class="footer-contact">
        <li>${icon('pin')}<span>${b.addressHtml()}</span></li>
        <li>${icon('phone')}<span>${b.phoneHtml()}</span></li>
        <li>${icon('mail')}<span>${b.emailHtml()}</span></li>
      </ul>
    </div>
  </div>
  <div class="container footer-bottom">
    <p>&copy; ${new Date().getFullYear()} ${b.nameHtml()}. All rights reserved.</p>
    <p><a href="/privacy">Privacy Policy</a></p>
  </div>
</footer>
<div class="mobile-bar" data-mobile-bar>
  ${b.telHref() ? `<a class="btn btn-outline-light" href="${b.telHref()}">${icon('phone')} Call</a>` : ''}
  <a class="btn btn-accent" href="/#book">${icon('calendar')} Book an Appointment</a>
</div>`;
}

function layout({ title, description, path = '/', body, bodyClass = '', noindex = false, scripts = ['/js/main.js'] }) {
  const canonical = siteUrl(path);
  const fullTitle = title;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex, nofollow">' : ''}
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ''}
<meta name="theme-color" content="#121417">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:site_name" content="${esc(b.displayName())}">
${canonical ? `<meta property="og:url" content="${esc(canonical)}">` : ''}
<meta property="og:image" content="${esc(siteUrl('/images/og-image.png') || '/images/og-image.png')}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/images/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Barlow:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap">
<link rel="stylesheet" href="/css/styles.css">
${noindex ? '' : localBusinessJsonLd()}
</head>
<body class="${bodyClass}" id="top">
${sprite()}
<a class="skip-link" href="#main">Skip to content</a>
${header()}
<main id="main">
${body}
</main>
${footer()}
${scripts.map((s) => `<script src="${s}" defer></script>`).join('\n')}
</body>
</html>`;
}

module.exports = { layout, logo };
