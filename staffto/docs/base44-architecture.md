# StaffTO on Base44 — backend architecture

StaffTO follows the official Base44 CLI project layout (`base44 create` → "backend-and-client"):

```
staffto/
├── base44/
│   ├── config.jsonc              # project + site build settings
│   ├── entities/*.jsonc          # 23 entity schemas with row- & field-level security
│   ├── functions/<name>/         # 8 Deno backend functions (function.jsonc + entry.ts + _shared.ts)
│   └── shared/shared.ts          # source of the vendored _shared.ts helpers
├── src/                          # React 18 + Vite + Tailwind frontend using @base44/sdk
└── test/                         # unit tests, local Base44-compatible backend, end-to-end QA
```

## Roles

| Role | How it is set | Enforced by |
|---|---|---|
| Anonymous | No token | RLS: only `read: {}` entities are visible |
| Job seeker / employer | `UserProfile.account_type`, set once by the `account.bootstrap` function | Ownership rules (`data.<owner>_id == {{user.id}}`) and function checks |
| Admin | Base44 built-in `User.role = "admin"`. The app owner is admin; admins can promote others in Admin → Users. | `user_condition: {role: "admin"}` in RLS; `requireAdmin()` in every `admin` action |

Users can't change their own `role` (`auth.updateMe` ignores it — covered by the QA suite).

## Entities and access rules

| Entity | Read | Write | Notes |
|---|---|---|---|
| UserProfile | owner, admin | create own; update owner/admin; `suspended` admin-only (FLS) | consent timestamps, unsubscribe token, referral code |
| Employer | public | create own; update owner/admin; `verified`, `plan`, `job_credits`, `featured_credits`, `status` admin/server-only (FLS) | plan and credits can only change through billing/admin functions |
| Job | public | **functions only** (`jobs`) | plan quotas, pay rules and moderation enforced server-side |
| JobApplication | applicant, hiring employer, admin | **functions only** | `employer_notes`, `employer_rating`, `ai_*` readable only by the employer (FLS) |
| CandidateProfile, Resume, SavedJob | owner, admin | owner | employers reach profiles/resumes only via `jobs.candidate` for their own applicants |
| Subscription, Payment | owner, admin | functions/admin | invoices with HST |
| PromoCode, Campaign, AuditLog, AnalyticsEvent, ContactMessage | admin | admin/functions | |
| Notification | owner | functions create; owner marks read | |
| Message | sender, recipient | functions create (participant check); recipient marks read | |
| ClassifiedListing | public | functions only | moderation queue, auto-hide after 3 reports |
| Review (testimonials) | public | functions/admin | only `approved` ones are displayed |
| Report | reporter, admin | functions/admin | |
| Referral | owner, admin | create own; counters by functions | |
| PlatformSetting | public | admin (`admin.saveSetting`, audited) | pricing, branding, community, seo, payments, classifieds |
| Article | public | admin | only `published` ones are displayed |
| DataRequest | owner, admin | functions | PIPEDA export and deletion log |

## Backend functions (`base44/functions`)

All take `{ action, ...payload }` and use `createClientFromRequest(req)`. The caller is resolved with `auth.me()` and checked before any `asServiceRole` access. Errors return `{ error, message, code }` with proper HTTP status codes.

| Function | Actions |
|---|---|
| `jobs` | `allowance`, `save` (validate + publish with quota), `setStatus`, `feature`, `apply`, `withdraw`, `updateApplication`, `candidate` (profile + 5-minute signed resume URL), `resumeUrl` |
| `ai` | `analyze`, `analyzeJob` — Premium-gated, consent-gated, advisory (see `ai-recruitment.md`) |
| `billing` | `catalog`, `quote`, `checkout` (Stripe Checkout when configured; 100% promo fulfils instantly), `cancelSubscription` |
| `stripeWebhook` | verifies `Stripe-Signature`; fulfils payments, renews, marks past-due, cancels |
| `marketplace` | `saveListing`, `setListingStatus`, `contactSeller`, `sendMessage`, `markThreadRead`, `report`, `submitTestimonial` |
| `site` | public `stats` (real counts), `track` (first-party analytics, de-duplicated views), `contact`, `unsubscribe`, `sitemap` (XML), `maintenance` (daily cron automation) |
| `account` | `bootstrap`, `updateConsents`, `processResume`, `exportData`, `deleteAccount` |
| `admin` | `overview` (metrics), `listUsers`, `setUserRole`, `setUserSuspended`, `verifyEmployer`, `setEmployerStatus`, `moderateJob`, `moderateListing`, `resolveReport`, `moderateReview`, `grantPlan`, `saveSetting`, `effectivePricing` — every mutation writes `AuditLog` |

Shared helpers live in `base44/shared/shared.ts`. Run `npm run sync:shared` after editing it; `npm test` fails if a copy drifts.

## File storage

- Resumes: `Core.UploadPrivateFile`, then `Core.CreateFileSignedUrl` with a 300-second expiry, issued only to the owner or the hiring employer.
- Logos, classified photos: `Core.UploadFile` (public). Images only; size limits are enforced client-side, and the server accepts only URLs.

## Secrets (set with `base44 secrets set`; never in frontend code)

| Secret | Used by |
|---|---|
| `STRIPE_SECRET_KEY` | billing |
| `STRIPE_WEBHOOK_SECRET` | stripeWebhook |
| `SITE_URL` | stripeWebhook (links in emails) |

## Deploying

The Base44 account used for this build had reached its free-plan limit of 5 apps, so the app could not be created automatically. Once you have a slot (delete an unused app or upgrade):

```bash
cd staffto
npm install
npx base44 login
npx base44 link            # create a new Base44 app (or link an existing one)
npx base44 deploy          # pushes entities, functions (+ daily automation) and builds & hosts the site
npx base44 secrets set STRIPE_SECRET_KEY=sk_test_... STRIPE_WEBHOOK_SECRET=whsec_... SITE_URL=https://staffto.ca   # when ready
```

Then, in the Base44 dashboard:
1. Auth: enable **email + password** (the app uses register / verify OTP / login) and Google.
2. Sign in to the deployed site with the owner account. It is `admin`, so open `/admin`.
3. Admin → Settings → Branding: set `site_url`, legal name, emails. Community: the Facebook group URL once it exists.
4. Admin → Promo codes: create launch codes.

## Local development and testing

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server against a Base44 backend (`base44 dev` or `VITE_BASE44_APP_BASE_URL`) |
| `npm run serve:local` | Builds and serves the app with `test/local-backend` on :4400 (offline, in-memory data) |
| `npm test` | Unit tests (AI rubric, pay rules, HST quote, Stripe signatures, sitemap, schema/RLS presence, shared-code drift) |
| `npm run build:local && npm run e2e` | 34-check end-to-end QA (now including the language filter) in Chromium (see `launch-checklist.md`) |

`test/local-backend/server.mjs` implements the Base44 REST routes the SDK calls (auth, entities with RLS/FLS/validation, functions, Core uploads and signed URLs). It mirrors the semantics of Base44's own local dev server and runs the real entity files and function code. It is test infrastructure only and is never deployed. `InvokeLLM` and `ExtractDataFromUploadedFile` are deliberately unavailable locally, which also exercises the AI rules-only fallback.
