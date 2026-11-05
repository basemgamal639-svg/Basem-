/**
 * BUSINESS DETAILS — edit this file to customise the website.
 *
 * Any value left as `null` is shown on the site as a clearly marked
 * placeholder (e.g. "[Your Phone Number]") and is left OUT of the
 * search-engine structured data, so nothing unverified is published.
 *
 * After editing, restart the server (`npm start`).
 */
module.exports = {
  // Shop name shown in the logo, page titles and footer.
  name: null, // e.g. "Northside Auto Care"

  // Two short words used for the text logo when no name is set.
  logoFallback: { primary: 'Your', secondary: 'Auto Shop' },

  // Short description used in the footer and in search results.
  tagline:
    'Professional auto repair and maintenance for everyday drivers — from oil changes to complex diagnostics.',

  // Public site URL, used for canonical links, sitemap and social sharing.
  // Can also be set with the SITE_URL environment variable.
  siteUrl: process.env.SITE_URL || null, // e.g. "https://www.example-autocare.com"

  // Contact details
  phone: null, // display format, e.g. "(555) 123-4567"
  phoneE164: null, // dialling format for tap-to-call, e.g. "+15551234567"
  email: null, // e.g. "service@example.com"

  address: {
    street: null, // e.g. "123 Main Street"
    city: null, // e.g. "Springfield"
    region: null, // state / province, e.g. "IL"
    postalCode: null,
    country: null, // e.g. "US"
  },

  // Areas you serve — used in local SEO copy, e.g. ["Springfield", "Shelbyville"]
  serviceArea: [],

  // Opening hours. Leave the array empty to show a placeholder.
  // Example: { days: 'Mon – Fri', hours: '8:00 AM – 6:00 PM', schema: 'Mo-Fr 08:00-18:00' }
  hours: [],

  // Google Maps "Embed a map" iframe src URL (Share → Embed a map → copy the src="..." value)
  mapEmbedUrl: null,
  // Normal Google Maps link for the "Get directions" button
  mapLink: null,

  // Social profiles — only filled links are shown.
  social: {
    facebook: null,
    instagram: null,
    google: null, // Google Business Profile link
    youtube: null,
    tiktok: null,
  },

  // Optional real facts. Leave null unless they are verified.
  foundedYear: null,

  // Customer reviews. Only add GENUINE reviews you have permission to publish.
  // Example: { quote: '...', author: 'Jane D.', vehicle: '2017 Honda Civic', source: 'Google' }
  testimonials: [],

  // Appointment time windows offered in the booking form.
  appointmentTimes: [
    'Early morning (8 – 10 AM)',
    'Late morning (10 AM – 12 PM)',
    'Early afternoon (12 – 2 PM)',
    'Late afternoon (2 – 5 PM)',
    'Any time',
  ],
};
