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

The site is designed around large photos. Until real photos are added, it shows technical line drawings (a car side view, a brake assembly, a gauge) so the pages still look finished.

Put your photos in `public/images/photos/`, then reference them in `config/business.js` under `photos.hero`, `photos.about`, `photos.aboutDetail` and `gallery`, and in each service's `image` in `config/services.js`. Recommended sizes:

- Hero: 2400×1350, landscape.
- About: 4:5 portrait.
- Services: 4:5.
- Gallery: any orientation. Every fifth image is shown large.

Compress images to WebP or a high-quality JPEG of about 300 KB each.

After setting your name, regenerate the social share image with `npm i -D playwright && npm run og-image`.

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
config/               business.js, services.js, faq.js, vehicles.js
src/schedule.js       Slot generation, availability, confirmed-slot capacity
src/notify.js         Email alerts (nodemailer, optional)
src/db.js             SQLite schema and migrations
src/auth.js           Admin password and sessions
src/validation.js     Server-side validation
src/views/            Server-rendered HTML
public/               CSS, JavaScript, images
test/                 API, booking and admin tests (node --test)
```
