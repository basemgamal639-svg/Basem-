/**
 * BUSINESS DETAILS — edit this file to customise the website, then restart the server.
 *
 * Any value left as `null` (or an empty list) is treated as "not provided yet":
 *  - in development it is shown as a clearly marked [Placeholder] so you can see what is missing;
 *  - in production (NODE_ENV=production) it is hidden, so visitors never see placeholder text.
 * Missing details are never added to the search-engine structured data.
 */
const isProd = process.env.NODE_ENV === 'production';
const stock = require('./photos'); // stock photography, see config/photos.js

module.exports = {
  // Show [Placeholder] markers for missing details. Defaults to on in development, off in production.
  showPlaceholders: process.env.SHOW_PLACEHOLDERS ? process.env.SHOW_PLACEHOLDERS === '1' : !isProd,

  name: null, // e.g. "Kessler Motorworks"
  logoFallback: { primary: 'Your', secondary: 'Workshop' }, // text logo used until `name` is set

  tagline: 'Independent automotive workshop for diagnostics, repairs and scheduled maintenance.',

  // Public URL, used for canonical links, sitemap and social sharing. Can also be set with SITE_URL.
  siteUrl: process.env.SITE_URL || null,

  phone: null, // display format, e.g. "(555) 123-4567"
  phoneE164: null, // dialling format, e.g. "+15551234567"
  email: null,

  address: { street: null, city: null, region: null, postalCode: null, country: null },
  serviceArea: [], // e.g. ["Springfield", "Shelbyville"]

  // Opening hours shown on the site. Example: { days: 'Mon – Fri', hours: '8:00 – 18:00', schema: 'Mo-Fr 08:00-18:00' }
  hours: [],

  // Google Maps: "Share → Embed a map" iframe src, and a normal link for "Get directions".
  // If mapLink is empty but an address is set, a Google Maps directions link is built from the address.
  mapEmbedUrl: null,
  mapLink: null,

  social: { facebook: null, instagram: null, youtube: null, tiktok: null },

  // Google Business Profile — link to your reviews page.
  googleBusinessUrl: null,
  // Only fill in from your real Google Business Profile, e.g. { value: 4.8, count: 126 }.
  googleRating: null,

  // Verified facts only. Leave empty/null unless they are true and you can back them up.
  foundedYear: null,
  certifications: [], // e.g. ["ASE Certified Technicians"]

  // Trust points shown under the hero. These describe how the shop works, not credentials.
  trustPoints: ['Experienced technicians', 'Written estimates before work starts', 'Modern diagnostic equipment'],

  // GENUINE customer reviews only, with permission to publish.
  // Example: { quote: '...', author: 'Jane D.', vehicle: '2017 Audi A4', source: 'Google' }
  testimonials: [],

  // Photography. Starts with stock photos (config/photos.js); replace them with your own.
  // Put your files in public/images/photos/ and reference them like:
  //   hero: { src: '/images/photos/hero.jpg', alt: 'Technician inspecting a car on a lift', width: 2400, height: 1350 }
  // Recommended: hero 2400×1350 landscape, about 4:5 portrait, aboutDetail square.
  photos: {
    hero: stock.hero,
    about: stock.about,
    aboutDetail: stock.aboutDetail,
  },

  // Workshop gallery. Replace with photos of your own work, e.g.
  //   { src: '/images/photos/gallery-1.jpg', alt: 'Diagnostic scan on a BMW 3 Series', caption: 'Diagnostics', width: 1600, height: 1067 }
  // Only show before-and-after pairs from real jobs.
  gallery: stock.gallery,

  /* ---------- Online booking ---------- */
  booking: {
    // Hours customers can request appointments for, per weekday (24h "HH:MM"). null = closed.
    // ⚠ This is a starting schedule — change it to your real hours before going live.
    schedule: {
      mon: ['08:00', '17:00'],
      tue: ['08:00', '17:00'],
      wed: ['08:00', '17:00'],
      thu: ['08:00', '17:00'],
      fri: ['08:00', '17:00'],
      sat: null,
      sun: null,
    },
    scheduleConfirmed: false, // set to true once the schedule above matches your real hours
    slotMinutes: 60, // length of each bookable time slot
    capacity: 1, // how many CONFIRMED appointments can share one slot (e.g. number of service bays)
    minNoticeHours: 2, // earliest a slot can be requested from now
    maxDaysAhead: 60, // how far ahead customers can book
    closedDates: [], // e.g. ['2026-12-25', '2027-01-01']
  },
};
