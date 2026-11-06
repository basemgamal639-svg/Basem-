# StaffTO — Toronto hospitality jobs. One community.

A Toronto & GTA hospitality recruitment marketplace built on **Base44**: job board, employer and job seeker dashboards, AI-assisted (advisory, consent-based) candidate organisation, a Facebook-first sharing workflow, classifieds, an admin console, an SEO engine and an employer-paid monetisation model.

> Original product inspired by the business model of community-driven city job boards. No third-party code, branding or content is copied.

## What's inside

| Area | Highlights |
|---|---|
| Job seekers | Email + OTP or Google sign-up, profile with work history, private resumes, search & filters, save, apply, track, withdraw, messages, notifications, privacy controls (export / delete / consents) |
| Employers | Business profile and logo, verification request, job editor with Ontario 2026 posting fields, plan quotas, applicant pipeline, notes and ratings, secure resume download, messaging, compare candidates, recruitment analytics, billing and invoices |
| AI | Explainable 100-point rubric + optional LLM summary; consent per application; never auto-rejects |
| Facebook marketing | Share kit (announcement copy, 1080×1080 image, Facebook / WhatsApp / LinkedIn links with UTM), community landing page, referral links, admin campaign planner with performance |
| Monetisation | Free / Single job / Pro / Premium, featured upgrades, promo codes, HST invoices, Stripe Checkout + webhook (off until configured), admin grants |
| Classifieds | Equipment, supplies and business opportunities with photos, moderation, contact seller, reports |
| Admin | Live metrics, users and roles, verification, job / classified / report / testimonial moderation, campaigns, articles, promo codes, payments, settings (pricing, branding, community, payments, SEO), audit log |
| SEO | Per-page meta, JobPosting JSON-LD, 8 Toronto landing pages, sitemaps, robots.txt, articles |

## Docs

- [`docs/competitor-analysis.md`](docs/competitor-analysis.md) — including research access limitations
- [`docs/toronto-marketing-strategy.md`](docs/toronto-marketing-strategy.md)
- [`docs/ontario-legal-compliance.md`](docs/ontario-legal-compliance.md)
- [`docs/base44-architecture.md`](docs/base44-architecture.md) — entities, security, functions, deployment
- [`docs/ai-recruitment.md`](docs/ai-recruitment.md)
- [`docs/seo.md`](docs/seo.md)
- [`docs/launch-checklist.md`](docs/launch-checklist.md)

## Quick start

```bash
npm install
npm run serve:local        # offline: app + local Base44-compatible backend on http://127.0.0.1:4400
npm test                   # unit tests
npm run build:local && npm run e2e   # full end-to-end QA (needs Playwright + Chromium)

# Production on Base44
npx base44 login && npx base44 link && npx base44 deploy
```

On the local backend the first admin is created with the dev-only helper `POST /__dev/make-admin {"email": "..."}`. Verification codes are at `GET /__dev/otp?email=...`. On Base44, the app owner is the admin.

## Branding

The name, wordmark, tagline, emails and domain are configurable (`src/lib/brand.js` defaults, `VITE_BRAND_NAME` / `VITE_SITE_URL`, and Admin → Settings → Branding at runtime). Design tokens live in `tailwind.config.js` (ink, paper, signal red, lake teal, brass; Instrument Serif + Geist).
