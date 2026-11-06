const { layout } = require('./layout');
const { esc, ph, b, business, services, photo, SHOW_PH } = require('./helpers');
const { icon } = require('../icons');

function pageHero({ crumbs, title, intro, kicker, actions = '' }) {
  return `<section class="page-hero">
  <div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb"><ol>${crumbs
      .map(([l, h], i) => (i === crumbs.length - 1 ? `<li aria-current="page">${esc(l)}</li>` : `<li><a href="${h}">${esc(l)}</a></li>`))
      .join('')}</ol></nav>
    ${kicker ? `<p class="kicker">${kicker}</p>` : ''}
    <h1>${title}</h1>
    ${intro ? `<p class="hero-lead">${intro}</p>` : ''}
    ${actions}
  </div>
</section>`;
}

function servicePage(slug) {
  const idx = services.findIndex((s) => s.slug === slug);
  if (idx === -1) return null;
  const s = services[idx];
  const others = services.filter((x) => x.slug !== slug);
  const body = `${pageHero({
    crumbs: [['Home', '/'], ['Services', '/#services'], [s.name]],
    kicker: `Service${b.city ? ' · ' + esc(b.city) : ''}`,
    title: esc(s.name),
    intro: esc(s.short),
    actions: `<div class="hero-actions"><a class="btn btn-primary btn-lg" href="/?service=${s.slug}#book">Book This Service ${icon('arrow')}</a>${b.tel ? `<a class="btn btn-line-light btn-lg" href="${b.tel}">${icon('phone')} Call Now</a>` : ''}</div>`,
  })}
<section class="section section-light">
  <div class="wrap svc-page">
    <div class="svc-page-main">
      <figure class="svc-page-media">${photo(s.image, `<div class="stage-plate">${icon(s.icon, 'stage-icon')}</div>`, { sizes: '(max-width: 900px) 100vw, 60vw', eager: true })}</figure>
      <p class="lead lead-dark">${esc(s.intro)}</p>
      <div class="svc-cols">
        <div><h2>What’s included</h2><ul class="ticks">${s.includes.map((x) => `<li>${icon('check')}${esc(x)}</li>`).join('')}</ul></div>
        <div><h2>When to book</h2><ul class="ticks ticks-warn">${s.signs.map((x) => `<li>${icon('arrow')}${esc(x)}</li>`).join('')}</ul></div>
      </div>
      <p>Every job starts with an inspection and a written estimate. We explain what we found and only start work once you have approved it.</p>
    </div>
    <aside class="svc-aside">
      <div class="aside-card">
        <p class="label label-light">Book online</p>
        <h2>Request ${esc(s.name.toLowerCase())}</h2>
        <p>Choose a time that suits you. We confirm every request personally.</p>
        <a class="btn btn-primary btn-block" href="/?service=${s.slug}#book">Book This Service</a>
        <a class="btn btn-line-light btn-block" href="/#contact" data-topic="Repair estimate">Get a Repair Estimate</a>
      </div>
    </aside>
  </div>
</section>
<section class="section section-paper">
  <div class="wrap">
    <h2 class="h-sm">Other services</h2>
    <ul class="other-svcs">${others.map((o) => `<li><a href="/services/${o.slug}">${icon(o.icon)}<span>${esc(o.name)}</span>${icon('arrow')}</a></li>`).join('')}</ul>
  </div>
</section>`;
  return layout({
    title: `${s.name}${b.city ? ' in ' + b.city : ''} | ${b.displayName}`,
    description: `${s.short} Book ${s.name.toLowerCase()} online${b.city ? ' in ' + b.city : ''}.`,
    path: `/services/${s.slug}`,
    body,
  });
}

const legalNote = () =>
  SHOW_PH ? `<p class="ph-tag">Template: review and adapt to your business and local law before publishing.</p>` : '';
const contactLine = () =>
  [business.email && `email ${b.emailHtml()}`, business.phone && `call ${b.phoneHtml()}`].filter(Boolean).join(' or ') ||
  (SHOW_PH ? `${ph('Email')} / ${ph('Phone')}` : 'use the contact form on our website');

function privacyPage() {
  const body = `${pageHero({ crumbs: [['Home', '/'], ['Privacy Policy']], title: 'Privacy Policy' })}
<section class="section section-light"><div class="wrap prose">
  ${legalNote()}
  <h2>Who we are</h2>
  <p>This website is operated by ${b.nameHtml()}${b.hasAddress ? `, ${b.addressHtml().replace(/<br>/g, ', ')}` : ''}. To contact us about your data, ${contactLine()}.</p>
  <h2>What we collect</h2>
  <p>When you request an appointment we collect your name, phone number, email address, vehicle make, model and year, the service you need, your preferred date and time, and any details you add. When you send a message we collect your name, email address, optional phone number, the topic and your message.</p>
  <h2>How we use it</h2>
  <p>We use this information to respond to you, arrange and carry out work on your vehicle, and contact you about it. We do not sell your personal information or use it for advertising.</p>
  <h2>How it is stored</h2>
  <p>Submissions are stored in a private database that only authorised staff can access through a password-protected administration area. If email alerts are enabled, a copy of each request is emailed to the workshop.</p>
  <h2>How long we keep it</h2>
  <p>${ph('Your retention period, e.g. “We keep appointment records for up to 3 years.”') || 'We keep records only as long as needed for the purposes above and our legal obligations.'}</p>
  <h2>Your rights</h2>
  <p>You can ask us to access, correct or delete the information we hold about you using the contact details above.</p>
  <h2>Third parties</h2>
  <p>This website loads fonts from Google Fonts${business.mapEmbedUrl ? ' and shows an embedded Google Map' : ''}. These services may receive your IP address when the page loads.</p>
</div></section>`;
  return layout({ title: `Privacy Policy | ${b.displayName}`, description: `How ${b.displayName} collects and uses personal information.`, path: '/privacy', body });
}

function termsPage() {
  const body = `${pageHero({ crumbs: [['Home', '/'], ['Terms of Service']], title: 'Terms of Service' })}
<section class="section section-light"><div class="wrap prose">
  ${legalNote()}
  <h2>Using this website</h2>
  <p>This website gives general information about ${b.nameHtml()} and our services. We try to keep it accurate, but service descriptions are a guide and do not replace an inspection of your vehicle.</p>
  <h2>Appointment requests</h2>
  <p>Submitting the booking form sends us an appointment <strong>request</strong>. It is not a confirmed booking until we contact you to confirm the date and time. We may suggest another time if the requested slot is not available.</p>
  <h2>Estimates and approval</h2>
  <p>We provide an estimate before starting work and ask for your approval before carrying out any additional work.</p>
  <h2>Payment</h2>
  <p>${ph('Your payment terms and accepted payment methods') || 'Payment is due when the work is complete, unless agreed otherwise.'}</p>
  <h2>Warranty</h2>
  <p>${ph('Your parts and labour warranty, or remove this section') || 'Details of any warranty on parts and labour are provided with your invoice.'}</p>
  <h2>Contact</h2>
  <p>Questions about these terms? ${contactLine().replace(/^./, (c) => c.toUpperCase())}.</p>
</div></section>`;
  return layout({ title: `Terms of Service | ${b.displayName}`, description: `Terms for using the ${b.displayName} website and requesting appointments.`, path: '/terms', body });
}

function notFoundPage() {
  const body = `${pageHero({
    crumbs: [['Home', '/'], ['Not found']],
    title: 'This page doesn’t exist.',
    intro: 'The link may be out of date, or the page has moved.',
    actions: `<div class="hero-actions"><a class="btn btn-primary" href="/">Back to Home</a><a class="btn btn-line-light" href="/#services">View Services</a></div>`,
  })}`;
  return layout({ title: `Page not found | ${b.displayName}`, description: 'Page not found.', body, noindex: true });
}

module.exports = { servicePage, privacyPage, termsPage, notFoundPage, pageHero };
