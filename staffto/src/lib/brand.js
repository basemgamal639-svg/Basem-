// Branding is configurable: env vars set build-time defaults, Admin → Settings → Branding overrides at runtime.
export const BRAND_DEFAULTS = {
  name: import.meta.env.VITE_BRAND_NAME || 'StaffTO',
  wordmark: ['Staff', 'TO'],
  tagline: "The hospitality job community connecting Toronto's restaurants with the people who make them work.",
  site_url: import.meta.env.VITE_SITE_URL || 'https://staffto.ca',
  support_email: 'hello@staffto.ca',
  privacy_email: 'privacy@staffto.ca',
  legal_name: 'StaffTO (operating name — set legal entity in Admin → Settings)',
  address: 'Toronto, Ontario, Canada',
  instagram: '',
};
