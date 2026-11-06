const { esc, b, business } = require('./helpers');
const { sprite, icon } = require('../icons');
const { logo } = require('./layout');

function shell({ title, body, scripts = [] }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<link rel="icon" href="/images/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&family=Sora:wght@400;500;600&display=swap">
<link rel="stylesheet" href="/css/styles.css">
<link rel="stylesheet" href="/css/admin.css">
</head>
<body class="admin">
${sprite()}
${body}
${scripts.map((s) => `<script src="${s}" defer></script>`).join('')}
</body>
</html>`;
}

function loginPage({ error = '', disabled = false } = {}) {
  return shell({
    title: `Sign in | ${b.displayName}`,
    body: `<main class="login-wrap">
  <div class="login-card">
    ${logo()}
    <h1>Workshop admin</h1>
    ${
      disabled
        ? `<p class="form-error">The admin area is turned off because the <code>ADMIN_PASSWORD</code> environment variable is not set. Set it and restart the server.</p>`
        : `<form method="post" action="/admin/login" class="form">
      ${error ? `<p class="form-error" role="alert">${esc(error)}</p>` : ''}
      <div class="field"><label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required autofocus></div>
      <button class="btn btn-primary btn-block" type="submit">Sign in</button>
    </form>`
    }
    <p class="login-back"><a href="/">Back to website</a></p>
  </div>
</main>`,
  });
}

function setupChecklist(notifyEnabled) {
  const missing = [];
  if (!business.name) missing.push('Business name');
  if (!business.phone) missing.push('Phone number');
  if (!business.email) missing.push('Email address');
  if (!business.address.street || !business.address.city) missing.push('Street address and city');
  if (!business.hours.length) missing.push('Opening hours');
  if (!business.booking.scheduleConfirmed) missing.push('Booking schedule (still the default Mon–Fri 08:00–17:00)');
  if (!notifyEnabled) missing.push('Email alerts for new requests (NOTIFY_TO and SMTP settings)');
  if (!business.photos.hero) missing.push('Hero photo');
  if (!business.gallery.length) missing.push('Gallery photos');
  if (!business.mapEmbedUrl) missing.push('Google Maps embed');
  if (!business.googleBusinessUrl) missing.push('Google Business Profile link');
  if (!business.testimonials.length) missing.push('Genuine customer reviews');
  if (!business.siteUrl) missing.push('Website address (SITE_URL)');
  if (!missing.length) return '';
  return `<details class="setup">
    <summary>${icon('clipboard')} Setup: ${missing.length} item${missing.length > 1 ? 's' : ''} to finish</summary>
    <p>Edit <code>config/business.js</code> (or the environment variables in the README) and restart the server.</p>
    <ul>${missing.map((m) => `<li>${m}</li>`).join('')}</ul>
  </details>`;
}

function dashboardPage({ notifyEnabled }) {
  return shell({
    title: `Dashboard | ${b.displayName}`,
    scripts: ['/js/admin.js'],
    body: `<header class="admin-header">
  <div class="admin-header-inner">
    ${logo('logo-light')}
    <nav class="admin-header-links">
      <a href="/" target="_blank" rel="noopener">View website</a>
      <form method="post" action="/admin/logout"><button type="submit" class="btn btn-line-light btn-xs">${icon('logout')} Sign out</button></form>
    </nav>
  </div>
</header>
<main class="admin-main" id="main" data-capacity="${business.booking.capacity}">
  ${setupChecklist(notifyEnabled)}
  <div class="admin-tabs" role="tablist" aria-label="Records">
    <button role="tab" id="tab-appointments" aria-selected="true" aria-controls="panel" data-tab="appointments">${icon('calendar')} Appointments <span class="count" data-count="appointments"></span></button>
    <button role="tab" id="tab-inquiries" aria-selected="false" aria-controls="panel" data-tab="inquiries" tabindex="-1">${icon('mail')} Messages <span class="count" data-count="inquiries"></span></button>
    <button role="tab" id="tab-customers" aria-selected="false" aria-controls="panel" data-tab="customers" tabindex="-1">${icon('users')} Customers</button>
  </div>
  <section id="panel" role="tabpanel" aria-labelledby="tab-appointments" class="admin-panel">
    <div class="stats" data-stats></div>
    <div class="toolbar">
      <label class="sr-only" for="filter-status">Filter by status</label>
      <select id="filter-status" data-filter-status></select>
      <label class="check" data-when-wrap><input type="checkbox" id="filter-upcoming" data-filter-upcoming> Upcoming only</label>
      <label class="sr-only" for="filter-q">Search</label>
      <input id="filter-q" type="search" placeholder="Search name, email, phone, vehicle, reference" data-filter-q>
    </div>
    <div class="table-wrap">
      <table class="records"><thead data-thead></thead><tbody data-tbody><tr><td class="empty">Loading…</td></tr></tbody></table>
    </div>
  </section>
</main>
<div class="drawer-backdrop" data-drawer-backdrop hidden></div>
<aside class="drawer" data-drawer aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="drawer-title" tabindex="-1">
  <div class="drawer-head">
    <h2 id="drawer-title" data-drawer-title>Details</h2>
    <button type="button" class="icon-btn" data-drawer-close aria-label="Close">${icon('close')}</button>
  </div>
  <div class="drawer-body" data-drawer-body></div>
</aside>
<div class="toast" role="status" aria-live="polite" data-toast hidden></div>`,
  });
}

module.exports = { loginPage, dashboardPage };
