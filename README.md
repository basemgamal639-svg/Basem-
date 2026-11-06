# Workshop Website

A website for an independent auto repair workshop. It includes:

- a home page and a page for each service
- online booking with live time slots
- a contact form with a "Repair estimate" topic
- an image gallery that opens photos full screen
- FAQ, privacy and terms pages
- a password-protected admin dashboard for appointment requests, messages and customers

Built with Node.js and Express. Data is stored with Node's built-in SQLite, so there is nothing native to compile.

## Quick start

You need **Node.js 22.13 or newer**.

```bash
npm install
ADMIN_PASSWORD="choose-a-long-password" npm start
```

The website runs at http://localhost:3000 and the admin dashboard at http://localhost:3000/admin. Run the tests with `npm test`.

## Before going live

Everything business-specific lives in `config/`. The admin dashboard shows a **Setup** list of whatever is still missing.

| What | Where |
| --- | --- |
| Name, phone, email, address, hours, map, social links, Google Business Profile | `config/business.js` |
| **Booking schedule.** The default is a placeholder (Mon–Fri, 08:00–17:00). You can also set slot length, capacity (service bays), notice period and closed dates. Set `scheduleConfirmed: true` once it matches your real hours. | `config/business.js` → `booking` |
| Services, with optional photos | `config/services.js` |
| FAQ answers. Fill in the policy questions (brands you service, payment methods, warranty); unanswered ones are hidden in production. | `config/faq.js` |
| Makes and models in the booking form | `config/vehicles.js` |
| Your shop's story (the About section) | `aboutSection()` in `src/views/home.js` |
| Privacy policy and terms of service | `src/views/pages.js` (templates: have them checked for your jurisdiction) |

**Placeholders.** In development, any missing detail appears as a dashed red `[Placeholder]`. With `NODE_ENV=production`, they are hidden and sections with no content (gallery, reviews, map) are left out, so visitors never see template text. Nothing unverified goes into the Google structured data. The star rating appears only when you enter it from your real Google Business Profile.

### Photography

The site ships with a curated set of **stock photos** (Unsplash License: free for commercial use, no attribution required), so it looks finished from day one. They cover the hero, the About section, every service and the gallery. Sources are listed in `public/images/photos/CREDITS.md`, and responsive sizes are served as WebP with `srcset`.

Photos of **your own** workshop, team and real jobs will always build more trust than stock, and the gallery should show your own work. While any stock photo is in use, the admin **Setup** list reminds you to replace it.

To replace a photo, put your file in `public/images/photos/`, then set it in `config/business.js` (`photos.hero`, `photos.about`, `photos.aboutDetail`, `gallery`) or as a service's `image` in `config/services.js`. Include `width` and `height` to avoid layout shift. Recommended sizes:

- Hero: 2400×1350, landscape. Keep the left side darker, because the headline sits there.
- About: 4:5 portrait. Detail image: square.
- Services: 4:5 portrait.
- Gallery: any orientation, in groups of six (one large and two stacked, then three across). Only use before-and-after pairs from real jobs.

Compress images to WebP or a high-quality JPEG of about 300 KB each.

After setting your name, regenerate the social share image with `npm i -D playwright && npm run og-image`.

## Animation

Motion is a progressive enhancement built on [Motion](https://motion.dev) (the successor to Framer Motion), using its framework-free API, because the site is server-rendered without React. Only the functions the site uses are bundled into `public/js/vendor/motion.js` (about 6 KB gzipped). Rebuild it with `npm run build:motion` after upgrading the `motion` package.

`public/js/motion.js` adds:
- staggered scroll reveals
- a slow settle on the hero photo
- spring transitions between booking steps
- staggered time slots
- a follow-through on the confirmation screens
- lightbox transitions

It animates only transform and opacity. It only hides content that starts below the fold, does nothing for visitors who prefer reduced motion, and the site works fully if the script never loads. `public/js/main.js` handles all behaviour and only fires `site:*` events for the motion layer to respond to.

## How booking works

1. The customer picks a make and model, enters the year, chooses a service and date, and selects one of the **available** times (loaded from `/api/availability`).
2. The request is saved with a reference such as `APT-7K3Q9M`. The customer sees a confirmation screen that clearly says **Pending confirmation**.
3. If email alerts are configured, the workshop gets an email. Whether the alert was sent, or why it failed, is shown on the record in the admin.
4. In the admin you can move the appointment to another date or time, then set it to **Confirmed**, **Completed** or **Cancelled**.
5. **Conflicting confirmations are blocked.** A slot cannot hold more confirmed appointments than `capacity`. Fully booked slots disappear from the public booking form, and the admin warns you before you confirm a clash.

The site never claims to have sent emails or texts to the customer. The workshop confirms with them personally.

## Email alerts (optional)

Set `NOTIFY_TO` and your provider's SMTP settings (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `NOTIFY_FROM`). Most providers support SMTP, including Google Workspace, Microsoft 365, Postmark, SendGrid and Mailgun. See `.env.example`.

## Security

- Admin password checked with scrypt in constant time, and login attempts are rate-limited.
- Sessions use an HttpOnly, SameSite=Strict cookie (Secure in production) and expire after 12 hours.
- A strict Content Security Policy and security headers on every page.
- Same-origin checks on every form post.
- A hidden honeypot field to catch spam bots, plus per-IP rate limits.
- A duplicate-submission guard, so double-clicks and retries never create two records.
- Server-side validation of every field.
- `/admin` and `/api/` are kept out of search engines.

## Deploying

Use any Node host with a **persistent disk** (Render, Railway, Fly.io, a VPS). Set the variables from `.env.example`, including `TZ` for your workshop's time zone, and keep `data/shop.db` on persistent, backed-up storage.

## Project structure

```
server.js             Pages, public APIs (availability, booking, contact), admin APIs
config/               business.js, services.js, faq.js, vehicles.js, photos.js (stock photo set)
src/schedule.js       Slot generation, availability, confirmed-slot capacity
src/notify.js         Email alerts (nodemailer, optional)
src/db.js             SQLite schema and migrations
src/auth.js           Admin password and sessions
src/validation.js     Server-side validation
src/views/            Server-rendered HTML
public/               CSS, JavaScript (main.js behaviour, motion.js animation), images
src/client/           Entry file for the Motion bundle
test/                 API, booking and admin tests (node --test)
```
