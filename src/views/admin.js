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
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Barlow:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap">
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
    title: `Admin sign in | ${b.displayName()}`,
    body: `<main class="login-wrap">
  <div class="login-card">
    ${logo()}
    <h1>Admin sign in</h1>
    ${
      disabled
        ? `<p class="form-error">The admin area is disabled because no <code>ADMIN_PASSWORD</code> environment variable is set. Set one and restart the server.</p>`
        : `<form method="post" action="/admin/login" class="form">
      ${error ? `<p class="form-error" role="alert">${esc(error)}</p>` : ''}
      <div class="field">
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
      </div>
      <button class="btn btn-accent btn-block" type="submit">Sign in</button>
    </form>`
    }
    <p class="login-back"><a href="/">← Back to website</a></p>
  </div>
</main>`,
  });
}

function setupChecklist() {
  const missing = [];
  if (!business.name) missing.push('Business name');
  if (!business.phone) missing.push('Phone number');
  if (!business.email) missing.push('Email address');
  if (!business.address.street || !business.address.city) missing.push('Street address & city');
  if (!business.hours.length) missing.push('Opening hours');
  if (!business.mapEmbedUrl) missing.push('Google Maps embed');
  if (!business.siteUrl) missing.push('Website URL (SITE_URL)');
  if (!Object.values(business.social).some(Boolean)) missing.push('Social media links');
  if (!business.testimonials.length) missing.push('Genuine customer reviews');
  if (!missing.length) return '';
  return `<details class="setup">
    <summary>${icon('clipboard')} Website setup: ${missing.length} detail${missing.length > 1 ? 's' : ''} still showing placeholders</summary>
    <p>Edit <code>config/business.js</code> and restart the server to fill these in:</p>
    <ul>${missing.map((m) => `<li>${m}</li>`).join('')}</ul>
  </details>`;
}

function dashboardPage() {
  return shell({
    title: `Dashboard | ${b.displayName()}`,
    scripts: ['/js/admin.js'],
    body: `<header class="admin-header">
  <div class="admin-header-inner">
    ${logo('logo-light')}
    <span class="admin-label mono">Admin</span>
    <nav class="admin-header-links">
      <a href="/" target="_blank" rel="noopener">View site</a>
      <form method="post" action="/admin/logout"><button type="submit" class="btn btn-ghost-light btn-xs">${icon('logout')} Sign out</button></form>
    </nav>
  </div>
</header>
<main class="admin-main" id="main">
  ${setupChecklist()}
  <div class="admin-tabs" role="tablist" aria-label="Records">
    <button role="tab" id="tab-appointments" aria-selected="true" aria-controls="panel" data-tab="appointments">${icon('calendar')} Appointment requests <span class="count" data-count="appointments"></span></button>
    <button role="tab" id="tab-inquiries" aria-selected="false" aria-controls="panel" data-tab="inquiries" tabindex="-1">${icon('mail')} Messages <span class="count" data-count="inquiries"></span></button>
  </div>
  <section id="panel" role="tabpanel" aria-labelledby="tab-appointments" class="admin-panel">
    <div class="stats" data-stats></div>
    <div class="toolbar">
      <label class="sr-only" for="filter-status">Filter by status</label>
      <select id="filter-status" data-filter-status></select>
      <label class="sr-only" for="filter-q">Search</label>
      <input id="filter-q" type="search" placeholder="Search name, email, phone, vehicle…" data-filter-q>
    </div>
    <div class="table-wrap">
      <table class="records">
        <thead data-thead></thead>
        <tbody data-tbody><tr><td class="empty">Loading…</td></tr></tbody>
      </table>
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
