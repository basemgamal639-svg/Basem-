const { layout } = require('./layout');
const { esc, ph, b, business, services } = require('./helpers');
const { icon } = require('../icons');

function pageHero({ crumbs, title, intro, eyebrow }) {
  return `<section class="page-hero">
  <div class="hero-grid-bg" aria-hidden="true"></div>
  <div class="container">
    <nav class="breadcrumbs" aria-label="Breadcrumb"><ol>${crumbs
      .map(([l, h], i) => (i === crumbs.length - 1 ? `<li aria-current="page">${esc(l)}</li>` : `<li><a href="${h}">${esc(l)}</a></li>`))
      .join('')}</ol></nav>
    ${eyebrow ? `<p class="eyebrow eyebrow-light">${eyebrow}</p>` : ''}
    <h1>${title}</h1>
    ${intro ? `<p class="hero-lead">${intro}</p>` : ''}
  </div>
</section>`;
}

function servicePage(slug) {
  const idx = services.findIndex((s) => s.slug === slug);
  if (idx === -1) return null;
  const s = services[idx];
  const city = b.city();
  const others = services.filter((x) => x.slug !== slug).slice(0, 3);
  const body = `${pageHero({
    crumbs: [['Home', '/'], ['Services', '/#services'], [s.name]],
    eyebrow: `<span class="mono">${String(idx + 1).padStart(2, '0')}</span>Service${city ? ' · ' + esc(city) : ''}`,
    title: esc(s.name),
    intro: esc(s.short),
  })}
<section class="section section-paper">
  <div class="container service-detail">
    <div class="service-body">
      <div class="service-icon service-icon-lg">${icon(s.icon)}</div>
      <p class="lead">${esc(s.intro)}</p>
      <h2>What’s included</h2>
      <ul class="checklist">${s.includes.map((x) => `<li>${icon('check')}${esc(x)}</li>`).join('')}</ul>
      <h2>Signs you may need this service</h2>
      <ul class="checklist checklist-warn">${s.signs.map((x) => `<li>${icon('arrow')}${esc(x)}</li>`).join('')}</ul>
      <p>Every job starts with an inspection and a clear estimate. We’ll explain what we found and won’t begin any work until you approve it.</p>
    </div>
    <aside class="service-aside">
      <div class="aside-card">
        <p class="mono">Ready when you are</p>
        <h2>Book ${esc(s.name.toLowerCase())}</h2>
        <p>Send an appointment request and we’ll contact you to confirm a time.</p>
        <a class="btn btn-accent btn-block" href="/?service=${s.slug}#book">Book This Service ${icon('arrow')}</a>
        ${b.telHref() ? `<a class="btn btn-outline-light btn-block" href="${b.telHref()}">${icon('phone')} Call ${esc(business.phone)}</a>` : `<p class="aside-ph">Phone: ${ph('Phone Number')}</p>`}
      </div>
    </aside>
  </div>
</section>
<section class="section section-light">
  <div class="container">
    <h2 class="h3">Other services</h2>
    <div class="services-grid services-grid-3">${others
      .map(
        (o) => `<article class="service-card">
        <div class="service-top"><span class="mono">${String(services.indexOf(o) + 1).padStart(2, '0')}</span><span class="service-icon">${icon(o.icon)}</span></div>
        <h3><a href="/services/${o.slug}">${esc(o.name)}</a></h3>
        <p>${esc(o.short)}</p>
        <div class="service-actions"><a class="link-arrow" href="/services/${o.slug}">Learn more ${icon('arrow')}</a></div>
      </article>`
      )
      .join('')}</div>
  </div>
</section>`;
  return layout({
    title: `${s.name}${city ? ' in ' + city : ''} | ${b.displayName()}`,
    description: `${s.short} Request a ${s.name.toLowerCase()} appointment online${city ? ' in ' + city : ''}.`,
    path: `/services/${s.slug}`,
    body,
  });
}

function privacyPage() {
  const body = `${pageHero({ crumbs: [['Home', '/'], ['Privacy Policy']], title: 'Privacy Policy' })}
<section class="section section-paper">
  <div class="container prose">
    <p class="ph-note">${icon('clipboard')} Template policy — have it reviewed and adapt it to your business and local law before publishing.</p>
    <p><em>Last updated: ${ph('Date')}</em></p>
    <h2>Who we are</h2>
    <p>This website is operated by ${b.nameHtml()}, ${b.addressHtml().replace(/<br>/g, ', ')}. You can contact us at ${b.emailHtml()} or ${b.phoneHtml()}.</p>
    <h2>What information we collect</h2>
    <p>When you submit an appointment request we collect your name, phone number, email address, vehicle make, model and year, the service requested, your preferred date and time, and any additional details you choose to provide. When you use the contact form we collect your name, email address, optional phone number and your message.</p>
    <h2>How we use your information</h2>
    <p>We use this information only to respond to your request, arrange and carry out service on your vehicle, and communicate with you about it. We do not sell your personal information.</p>
    <h2>How your information is stored</h2>
    <p>Submissions are stored in a private database that can only be accessed by authorised staff through a password-protected administration area.</p>
    <h2>How long we keep it</h2>
    <p>${ph('Describe your retention period, e.g. “We keep appointment records for up to X years.”')}</p>
    <h2>Your rights</h2>
    <p>You can ask us to access, correct or delete the personal information we hold about you by contacting us using the details above.</p>
    <h2>Third-party services</h2>
    <p>This website loads fonts from Google Fonts${business.mapEmbedUrl ? ' and displays an embedded Google Map' : ''}. These services may receive your IP address when the page loads.</p>
  </div>
</section>`;
  return layout({ title: `Privacy Policy | ${b.displayName()}`, description: `How ${b.displayName()} collects and uses personal information.`, path: '/privacy', body });
}

function notFoundPage() {
  const body = `${pageHero({ crumbs: [['Home', '/'], ['Page not found']], title: 'Page not found', intro: 'The page you’re looking for doesn’t exist or has moved.' })}
<section class="section section-paper"><div class="container center">
  <a class="btn btn-accent" href="/">Back to Home</a>
  <a class="btn btn-outline-dark" href="/#services">View Services</a>
</div></section>`;
  return layout({ title: `Page not found | ${b.displayName()}`, description: 'Page not found.', body, noindex: true });
}

module.exports = { servicePage, privacyPage, notFoundPage, pageHero };
