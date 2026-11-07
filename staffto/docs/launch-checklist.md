# StaffTO launch checklist

## A. Verified in this build (automated)

`npm test` — 7/7 unit tests. `npm run build:local && npm run e2e` — **34/34 end-to-end checks** in Chromium against the local Base44-compatible backend (run November 6, 2026):

- [x] Register job seeker and employer (email, OTP, onboarding with terms and optional CASL consent)
- [x] Create employer profile; publishing blocked without credits (server-side); Ontario pay-range rule enforced
- [x] Buy a job post with a 100% promo code → invoice → publish
- [x] Share kit: Facebook copy with UTM link, 1080×1080 image, Facebook sharer link
- [x] Seeker profile with skills and work history; private resume upload
- [x] Search and filter (role, area, minimum pay, keyword); JobPosting JSON-LD, canonical, title
- [x] Apply (with AI consent); duplicate application rejected; save job
- [x] Employer reviews applicants; signed resume URL works; tampered token rejected
- [x] AI analysis blocked for non-Premium; works for Premium with a 6-criterion explained score and no status change
- [x] Status update → candidate notification; two-way messaging; withdraw application
- [x] Classified listing → moderation → approval → contact seller; report a job
- [x] Admin: overview, verify employer, grant plan, audit log entries
- [x] Homepage statistics equal real database counts
- [x] Data export; one-click unsubscribe; account deletion
- [x] Security: anonymous reads blocked; seekers can't create/edit jobs; employers can't change their own plan, credits or verification; intruders can't read applications, profiles or resumes or post into others' threads; applicants can't see employer notes or AI fields; non-admins blocked from every admin action and admin-only entity; role self-escalation ignored; guarded routes show 403 / redirect to login
- [x] Mobile (iPhone 13): no horizontal overflow on 8 key pages
- [x] No uncaught browser errors during the run

## B. Before going live (owner actions)

**Platform**
- [ ] Free a Base44 app slot (the account was at its 5-app free-plan limit) → `base44 link` → `base44 deploy`
- [ ] Re-run the e2e suite against a Base44 preview (`base44 dev` + `VITE_BASE44_APP_BASE_URL`) to confirm production RLS behaviour matches
- [ ] Enable email/password and Google auth in Base44; customise the verification email
- [ ] Custom domain (staffto.ca or chosen name), HTTPS, `branding.site_url`
- [ ] Admin → Settings → Branding: legal name, address, support and privacy emails, HST number
- [ ] Confirm the daily `site.maintenance` automation is active

**Payments**
- [ ] Stripe account (Canada), test mode keys → `base44 secrets set`
- [ ] Webhook endpoint → `stripeWebhook` function URL; events: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`
- [ ] Test purchase, renewal, failure and cancellation in test mode, then live keys and `payments.enabled: true`
- [ ] Review pricing in Admin → Settings → Pricing

**Legal & compliance** (see `ontario-legal-compliance.md` §8)
- [ ] Lawyer review of Terms, Privacy, AI, Cookies
- [ ] Recruiter-licence opinion
- [ ] Breach-response runbook; retention purge job
- [ ] Incorporation, business name, HST registration, trademark check
- [ ] Accessibility audit (axe and screen reader)

**Content & community**
- [ ] Create the Facebook group (own it), set its URL in Community settings, pin the guidelines
- [ ] 5 cornerstone articles; replace nothing with placeholder copy
- [ ] Seed 30–50 real employers with launch promo codes
- [ ] Google Search Console: submit both sitemaps

**Operations**
- [ ] Monitor function logs (`base44 logs`) during the first week
- [ ] Set a moderation SLA (reports reviewed within 24 h)
- [ ] Back up / export data on a schedule

## C. Known limitations / next iterations

- SPA rendering: add prerendering for job pages (better Facebook previews) — `seo.md`
- Job search filters client-side over up to 1,000 active jobs; move to server-side paging once larger
- Rate limiting on public `site.track` / `contact` relies on platform defaults; add per-IP throttling if abused
- French UI (optional for GTA reach)
- Email digests (weekly job alerts) need a scheduled function + CASL-filtered list

## D. Competitive roadmap (from the StaffMTL review, Nov 7 2026)

1. Shift- and date-based temporary jobs + "Today / Tomorrow / Weekend" filter + seeker availability matching
2. Map view (OpenStreetMap; geocode employer addresses)
3. Ontario contract templates as a sign-up incentive (lawyer-reviewed)
4. "Promo post" product for business and event announcements in StaffTO's own channels
