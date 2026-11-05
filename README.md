# Auto Repair Shop Website

A complete website for an auto repair shop: a marketing homepage, a page per service, appointment requests and contact messages saved to a database, and a password-protected admin dashboard to manage them.

No template was supplied, so the design is an original one: graphite and signal orange, condensed display type, angled corners and small "spec sheet" details. The colours and fonts are set as CSS variables at the top of `public/css/styles.css`.

## Quick start

Requires **Node.js 22.13 or newer**. It uses Node's built-in SQLite, so there is nothing native to compile.

```bash
npm install
ADMIN_PASSWORD="choose-a-long-password" npm start
```

- Website: http://localhost:3000
- Admin: http://localhost:3000/admin

If you leave out `ADMIN_PASSWORD` in development, a temporary password is printed in the terminal on each start. In production (`NODE_ENV=production`) the admin area stays disabled until `ADMIN_PASSWORD` is set.

Run the tests with `npm test`.

## Add your business details

Everything business-specific is in **`config/business.js`**: name, phone, email, address, opening hours, service area, Google Maps embed, social links, founding year and testimonials. Any value left as `null` appears on the site as an orange-dashed `[Placeholder]`. The admin dashboard lists the details that are still missing.

- **Services** are in `config/services.js`. Each service gets a card on the homepage and its own page at `/services/<slug>`.
- **About text.** Replace the placeholder paragraphs in `aboutSection()` in `src/views/home.js`.
- **Reviews.** Add only genuine reviews to `testimonials` in `config/business.js`. Until you do, clearly marked placeholder cards are shown.
- **Images.** `public/images/hero-workshop.svg` and `about-garage.svg` are illustrations drawn for this site. To use real photos of your shop, put them in `public/images/` and change the `src` in `src/views/home.js`. Keep a similar shape: about 6:5 for the hero image and 8:7 for the about image.
- **Social share image.** Run `npm i -D playwright && npm run og-image` after setting your name to regenerate `public/images/og-image.png`.
- **Privacy policy** is at `src/views/pages.js`. It is a starting template, so have it checked for your jurisdiction.

## What's included

| Area | Details |
| --- | --- |
| Pages | `/`, `/services/<slug>` (10 services), `/privacy`, a custom 404, `/sitemap.xml`, `/robots.txt` |
| Appointment form | Checked in the browser and on the server, email format check, no past dates, the "Book service" buttons pre-select the service, a loading state, and a success message that says it is a **request, not a confirmation** |
| Duplicate protection | The submit button is locked while sending, and each form submission has a unique ID, so a double-click or retry never creates a second record |
| Contact form | Saved to the database. It shows a success message only after the save actually succeeds |
| Spam and abuse | Hidden honeypot field, per-IP rate limiting, cross-origin requests rejected |
| Admin dashboard | Tabs for appointment requests and messages, status counters and filters, search, a detail panel with click-to-call and email links, status changes (Pending / Confirmed / Completed / Cancelled; New / Responded / Archived), internal notes, delete |
| Security | Admin session uses an HttpOnly, SameSite=Strict cookie (Secure in production) and expires after 12 hours. Login is rate-limited, the password is compared with scrypt in constant time, and pages send strict CSP and security headers. `/admin` is marked noindex and blocked in robots.txt |
| SEO | Unique title and description per page, a single H1, Open Graph and Twitter tags, canonical URLs (once `SITE_URL` is set), sitemap, and `AutoRepair` structured data built **only from details you have filled in** (it is left out entirely until a business name is set) |
| Accessibility | Labelled fields, error messages read out by screen readers, skip link, keyboard-friendly mobile menu and admin panel, visible focus outlines, honours reduced-motion settings |
| Mobile | Responsive from 320px up, a sticky "Call / Book" bar on phones (the call button appears once a phone number is set), and 16px inputs so iOS doesn't zoom in |

**Not included:** sending email or text notifications. The site never says a message was sent. New requests show up in the admin dashboard, which refreshes every minute. To get email alerts, add a mail provider in `handleSubmission()` in `server.js`.

## Deploying

Any Node host with a **persistent disk** will work (Render, Railway, Fly.io, a VPS). Set the variables from `.env.example`. Make sure `data/shop.db` (or `DB_PATH`) is on persistent storage and is backed up. Serverless hosts with temporary file systems are not suitable unless you move the database to a hosted one.

## Project structure

```
server.js            Express app: pages, form APIs, admin APIs, security headers
config/              business.js (your details), services.js (service catalogue)
src/db.js            SQLite schema (appointments, inquiries, sessions)
src/auth.js          Admin password + session handling
src/validation.js    Server-side form validation
src/views/           Server-rendered HTML (layout, home, service/privacy/404, admin)
public/              CSS, JS, images
test/                API and admin tests (node --test)
```
