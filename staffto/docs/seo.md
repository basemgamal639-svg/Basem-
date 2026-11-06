# SEO infrastructure

- **Per-route meta:** `useSeo()` sets `<title>`, meta description, canonical, Open Graph and robots on every page (dashboards are `noindex`).
- **JobPosting structured data:** `jobPostingLd()` is emitted only for active jobs with pay (title, description, datePosted, validThrough, employmentType, hiringOrganization, jobLocation with GTA city, baseSalary in CAD, directApply).
- **Other structured data:** WebSite + SearchAction (home), FAQPage (landing pages), Article (resources).
- **Landing pages:** `/restaurant-jobs-toronto`, `/cook-jobs-toronto`, `/chef-jobs-toronto`, `/server-jobs-toronto`, `/bartender-jobs-toronto`, `/dishwasher-jobs-toronto`, `/restaurant-hiring-toronto`, `/hospitality-staffing-toronto`. Each has original copy, an FAQ, live filtered jobs and cross-links (`src/pages/seoPages.js`).
- **Sitemaps:** `public/sitemap.xml` is generated at build time (static and landing pages, GTA area searches). The live sitemap for jobs, articles and classifieds is the `site` function: `GET <functions-base>/site?action=sitemap`. Submit both URLs in Google Search Console. If your Base44 hosting supports rewrites, map `/sitemap-jobs.xml` to it.
- **robots.txt:** allows public pages and disallows dashboards.
- **Local SEO:** GTA area names throughout, area filter links in the footer, `addressLocality` in JobPosting, Ontario-specific content.
- **Performance:** code-split dashboards, vendor chunks, lazy images, system font fallbacks, no third-party trackers.

## Known limitation: client-side rendering

The app is a React SPA. Google renders JavaScript and reads JSON-LD injected at runtime, but other crawlers and social previews (Facebook's scraper) mostly see `index.html`'s default tags. For the best Facebook link previews and maximum SEO, add prerendering of `/jobs/:id` and landing pages: a static prerender step at build time, or edge rendering if your host supports it. The share kit's downloadable image and copy-paste text work regardless.
