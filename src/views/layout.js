const { esc, ph, b, business, services, siteUrl, localBusinessJsonLd, SHOW_PH } = require('./helpers');
const { sprite, icon } = require('../icons');

const hasGallery = () => business.gallery.length > 0 || SHOW_PH;
const hasReviews = () => business.testimonials.length > 0 || Boolean(business.googleBusinessUrl) || SHOW_PH;

function nav() {
  return [
    ['Services', '/#services'],
    ['About', '/#about'],
    hasGallery() && ['Gallery', '/#gallery'],
    ['FAQ', '/#faq'],
    ['Contact', '/#contact'],
  ].filter(Boolean);
}

const MARK = `<svg class="logo-mark" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="17" r="11" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8.2 21.5h2.2M21.6 21.5h2.2M16 7.5v2M9.3 11l1.5 1.4M22.7 11l-1.5 1.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M16 17l-5.2-3.6" stroke="#c8102e" stroke-width="2.4" stroke-linecap="round"/><circle cx="16" cy="17" r="1.8" fill="currentColor"/></svg>`;

function logo(cls = '') {
  const label = business.name || `${business.logoFallback.primary} ${business.logoFallback.secondary}`;
  return `<a class="logo ${cls}" href="/" aria-label="${esc(label)}, home">${MARK}<span class="logo-word">${esc(label)}</span></a>`;
}

function header() {
  const items = nav();
  return `<header class="site-header" data-header>
  <div class="wrap header-inner">
    ${logo()}
    <nav class="main-nav" aria-label="Main"><ul>${items.map(([l, h]) => `<li><a href="${h}">${l}</a></li>`).join('')}</ul></nav>
    <div class="header-actions">
      ${b.tel ? `<a class="header-phone" href="${b.tel}">${icon('phone')}<span>${esc(business.phone)}</span></a>` : ''}
      <a class="btn btn-primary btn-sm header-cta" href="/#book">Book an Appointment</a>
      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="mobile-nav" data-nav-toggle>
        <span class="sr-only">Open menu</span><span class="burger" aria-hidden="true"><i></i><i></i></span>
      </button>
    </div>
  </div>
  <div class="mobile-nav" id="mobile-nav" data-mobile-nav hidden>
    <nav aria-label="Mobile"><ul>${items.map(([l, h]) => `<li><a href="${h}">${l}</a></li>`).join('')}</ul></nav>
    <div class="mobile-nav-foot">
      <a class="btn btn-primary btn-block" href="/#book">Book an Appointment</a>
      ${b.tel ? `<a class="btn btn-line-light btn-block" href="${b.tel}">${icon('phone')} ${esc(business.phone)}</a>` : ''}
    </div>
  </div>
</header>`;
}

function footer() {
  const social = Object.entries(business.social).filter(([, u]) => u);
  if (business.googleBusinessUrl) social.push(['google', business.googleBusinessUrl]);
  const labels = { facebook: 'Facebook', instagram: 'Instagram', youtube: 'YouTube', tiktok: 'TikTok', google: 'Google reviews' };
  return `<footer class="site-footer">
  <div class="wrap footer-top">
    <div class="footer-brand">
      ${logo('logo-footer')}
      <p>${esc(business.tagline)}</p>
      <a class="btn btn-primary" href="/#book">Book an Appointment ${icon('arrow')}</a>
    </div>
    <nav class="footer-col" aria-label="Footer">
      <h2 class="footer-title">Workshop</h2>
      <ul>${nav().map(([l, h]) => `<li><a href="${h}">${l}</a></li>`).join('')}<li><a href="/#contact" data-topic="Repair estimate">Get a Repair Estimate</a></li></ul>
    </nav>
    <nav class="footer-col" aria-label="Services">
      <h2 class="footer-title">Services</h2>
      <ul>${services.map((s) => `<li><a href="/services/${s.slug}">${esc(s.name)}</a></li>`).join('')}</ul>
    </nav>
    <div class="footer-col">
      <h2 class="footer-title">Visit</h2>
      <address>
        ${b.addressHtml() ? `<p>${b.addressHtml()}</p>` : ''}
        ${business.phone || SHOW_PH ? `<p>${b.phoneHtml()}</p>` : ''}
        ${business.email || SHOW_PH ? `<p>${b.emailHtml()}</p>` : ''}
      </address>
      ${business.hours.length || SHOW_PH ? `<h2 class="footer-title footer-title-gap">Hours</h2>${b.hoursHtml()}` : ''}
    </div>
  </div>
  <div class="wrap footer-bottom">
    <p>&copy; ${new Date().getFullYear()} ${esc(b.displayName)}</p>
    ${social.length ? `<ul class="social">${social.map(([k, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${labels[k]}</a></li>`).join('')}</ul>` : SHOW_PH ? `<p>${ph('Social media links')}</p>` : ''}
    <ul class="legal"><li><a href="/privacy">Privacy Policy</a></li><li><a href="/terms">Terms of Service</a></li></ul>
  </div>
</footer>
<div class="mobile-bar${b.tel ? '' : ' mobile-bar-single'}" data-mobile-bar>
  ${b.tel ? `<a class="btn btn-line-light" href="${b.tel}">${icon('phone')} Call</a>` : ''}
  <a class="btn btn-primary" href="/#book">Book an Appointment</a>
</div>`;
}

function layout({ title, description, path = '/', body, noindex = false, ogImage = '/images/og-image.png' }) {
  const canonical = siteUrl(path);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex, nofollow">' : ''}
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ''}
<meta name="theme-color" content="#141618">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:site_name" content="${esc(b.displayName)}">
${canonical ? `<meta property="og:url" content="${esc(canonical)}">` : ''}
<meta property="og:image" content="${esc(siteUrl(ogImage) || ogImage)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/images/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&family=Sora:wght@400;500;600&display=swap">
<link rel="stylesheet" href="/css/styles.css">
${noindex ? '' : localBusinessJsonLd()}
</head>
<body>
${sprite()}
<a class="skip-link" href="#main">Skip to content</a>
${header()}
<main id="main">
${body}
</main>
${footer()}
<script src="/js/main.js" defer></script>
<script src="/js/vendor/motion.js" defer></script>
<script src="/js/motion.js" defer></script>
</body>
</html>`;
}

module.exports = { layout, logo, hasGallery, hasReviews };
