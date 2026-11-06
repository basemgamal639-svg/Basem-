const business = require('../../config/business');
const services = require('../../config/services');

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const SHOW_PH = business.showPlaceholders;

// Placeholder marker for a missing business detail. Returns '' when placeholders are hidden (production).
const ph = (label) =>
  SHOW_PH ? `<span class="ph" title="Placeholder — set this in config/business.js">[${esc(label)}]</span>` : '';

// Value-or-placeholder: returns html for a value, otherwise the placeholder (or '').
const or = (value, html, label) => (value ? html : ph(label));

const a = business.address;
const hasAddress = Boolean(a.street && a.city);
const addressLine = () => [a.street, [a.city, a.region].filter(Boolean).join(', ') + (a.postalCode ? ' ' + a.postalCode : '')].filter(Boolean).join(', ');

const b = {
  name: business.name,
  displayName: business.name || `${business.logoFallback.primary} ${business.logoFallback.secondary}`,
  nameHtml: () => (business.name ? esc(business.name) : ph('Shop Name') || 'our workshop'),
  city: a.city,
  tel: business.phone ? `tel:${business.phoneE164 || business.phone.replace(/[^\d+]/g, '')}` : null,
  phoneHtml: (cls = '') => or(business.phone, `<a class="${cls}" href="${b.tel}">${esc(business.phone)}</a>`, 'Phone Number'),
  emailHtml: (cls = '') => or(business.email, `<a class="${cls}" href="mailto:${esc(business.email)}">${esc(business.email)}</a>`, 'Email Address'),
  hasAddress,
  addressHtml: () =>
    hasAddress
      ? `${esc(a.street)}<br>${esc([a.city, a.region].filter(Boolean).join(', '))}${a.postalCode ? ' ' + esc(a.postalCode) : ''}`
      : ph('Street Address, City, Postcode'),
  directionsUrl: business.mapLink || (hasAddress ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addressLine())}` : null),
  hoursHtml: () =>
    business.hours.length
      ? `<dl class="hours">${business.hours.map((h) => `<div><dt>${esc(h.days)}</dt><dd>${esc(h.hours)}</dd></div>`).join('')}</dl>`
      : ph('Opening hours, e.g. Mon–Fri 8:00–18:00'),
  area: business.serviceArea.length ? business.serviceArea.join(', ') : a.city,
};

function siteUrl(path = '/') {
  return business.siteUrl ? business.siteUrl.replace(/\/$/, '') + path : null;
}

// Responsive photo, or the given fallback drawing until a real photo is configured.
function photo(p, fallback, { cls = '', sizes = '100vw', eager = false } = {}) {
  if (p && p.src) {
    return `<img class="${cls}" src="${esc(p.src)}"${p.srcset ? ` srcset="${esc(p.srcset)}" sizes="${sizes}"` : ''} alt="${esc(p.alt || '')}"${p.width ? ` width="${p.width}" height="${p.height}"` : ''} ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
  }
  return fallback;
}

// LocalBusiness structured data — built ONLY from details that have been filled in.
function localBusinessJsonLd() {
  if (!business.name) return '';
  const data = { '@context': 'https://schema.org', '@type': 'AutoRepair', name: business.name, description: business.tagline };
  if (business.siteUrl) {
    data.url = siteUrl('/');
    data.image = siteUrl('/images/og-image.png');
  }
  if (business.phone) data.telephone = business.phoneE164 || business.phone;
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
  const sameAs = [...Object.values(business.social), business.googleBusinessUrl].filter(Boolean);
  if (sameAs.length) data.sameAs = sameAs;
  if (business.googleRating && business.googleRating.value && business.googleRating.count) {
    data.aggregateRating = { '@type': 'AggregateRating', ratingValue: business.googleRating.value, reviewCount: business.googleRating.count };
  }
  data.makesOffer = services.map((s) => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: s.name } }));
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

module.exports = { esc, ph, or, b, business, services, siteUrl, photo, localBusinessJsonLd, SHOW_PH };
