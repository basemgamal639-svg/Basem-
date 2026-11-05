const business = require('../../config/business');
const services = require('../../config/services');

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Placeholder marker for any missing business detail.
const ph = (label) => `<span class="ph" title="Placeholder — set this in config/business.js">[${esc(label)}]</span>`;

const b = {
  name: () => business.name || null,
  displayName: () => business.name || `${business.logoFallback.primary} ${business.logoFallback.secondary}`,
  nameHtml: () => (business.name ? esc(business.name) : ph('Your Shop Name')),
  city: () => business.address.city || null,
  cityHtml: () => (business.address.city ? esc(business.address.city) : ph('Your City')),
  phoneHtml: (cls = '') =>
    business.phone
      ? `<a class="${cls}" href="tel:${esc(business.phoneE164 || business.phone.replace(/[^\d+]/g, ''))}">${esc(business.phone)}</a>`
      : ph('Phone Number'),
  telHref: () => (business.phone ? `tel:${business.phoneE164 || business.phone.replace(/[^\d+]/g, '')}` : null),
  emailHtml: (cls = '') =>
    business.email ? `<a class="${cls}" href="mailto:${esc(business.email)}">${esc(business.email)}</a>` : ph('Email Address'),
  addressHtml: () => {
    const a = business.address;
    if (!a.street && !a.city) return ph('Street Address, City, State ZIP');
    return [esc(a.street), [a.city, a.region].filter(Boolean).map(esc).join(', ') + (a.postalCode ? ' ' + esc(a.postalCode) : '')]
      .filter(Boolean)
      .join('<br>');
  },
  hoursHtml: () =>
    business.hours.length
      ? `<dl class="hours">${business.hours.map((h) => `<div><dt>${esc(h.days)}</dt><dd>${esc(h.hours)}</dd></div>`).join('')}</dl>`
      : `<p>${ph('Opening Hours — e.g. Mon–Fri 8 AM–6 PM')}</p>`,
  areaText: () => {
    if (business.serviceArea.length) return business.serviceArea.join(', ');
    return business.address.city || null;
  },
};

function siteUrl(path = '/') {
  return business.siteUrl ? business.siteUrl.replace(/\/$/, '') + path : null;
}

// LocalBusiness structured data — built ONLY from values that have been filled in.
function localBusinessJsonLd() {
  if (!business.name) return '';
  const a = business.address;
  const data = {
    '@context': 'https://schema.org',
    '@type': 'AutoRepair',
    name: business.name,
    description: business.tagline,
  };
  if (business.siteUrl) data.url = siteUrl('/');
  if (business.phoneE164 || business.phone) data.telephone = business.phoneE164 || business.phone;
  if (business.email) data.email = business.email;
  if (a.street || a.city) {
    data.address = { '@type': 'PostalAddress' };
    if (a.street) data.address.streetAddress = a.street;
    if (a.city) data.address.addressLocality = a.city;
    if (a.region) data.address.addressRegion = a.region;
    if (a.postalCode) data.address.postalCode = a.postalCode;
    if (a.country) data.address.addressCountry = a.country;
  }
  const hours = business.hours.map((h) => h.schema).filter(Boolean);
  if (hours.length) data.openingHours = hours;
  if (business.serviceArea.length) data.areaServed = business.serviceArea;
  const sameAs = Object.values(business.social).filter(Boolean);
  if (sameAs.length) data.sameAs = sameAs;
  if (business.siteUrl) data.image = siteUrl('/images/og-image.png');
  data.makesOffer = services.map((s) => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: s.name } }));
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

module.exports = { esc, ph, b, business, services, siteUrl, localBusinessJsonLd };
