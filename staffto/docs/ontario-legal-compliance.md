# Ontario legal & privacy obligations — StaffTO

_Research notes from November 2026. This is **not legal advice**. Have an Ontario employment and privacy lawyer review it before launch. Items marked ⚠️ need a professional opinion._

## 1. The business model being assessed

- StaffTO runs an online job board, a community and a classifieds marketplace.
- **Employers pay** to advertise jobs (single posts, subscriptions, featured upgrades). **Workers never pay.**
- StaffTO does **not** employ or assign workers (no staffing), and does not search for candidates for a client or present candidates to employers on its own initiative.
- Employers choose and contact applicants themselves through the platform.

## 2. Employment Standards Act, 2000 (ESA)

### 2.1 Job-posting rules (Working for Workers Four & Five Acts; O. Reg. 476/24; in force January 1, 2026)

These apply to **employers with 25 or more employees** posting publicly advertised jobs. ⚠️ Confirm exact thresholds and wording against e-Laws.

| Requirement | StaffTO feature |
|---|---|
| Include expected pay or a pay range; the range can't exceed $50,000/yr (exception above $200,000) | Pay required on **every** job; range validated server-side (`jobs/validatePay`) |
| Disclose AI use to screen, assess or select applicants | "Uses AI screening" checkbox; disclosure shown on the listing |
| State whether the posting is for an existing vacancy | `vacancy_status` field, shown as "Future vacancy" when applicable |
| No "Canadian experience" requirement | Rejected server-side if the phrase appears in a title, description or requirements |
| Tell interviewed applicants whether a decision was made, within the prescribed period | Status changes notify candidates; "Not selected" sends a polite notice |
| Keep postings and related application records for 3 years | Jobs and applications are retained 3 years after closing (privacy policy). ⚠️ Add an automated purge after the retention period. |

**Online job-posting platforms:** the 2024 amendments also contemplate requirements for platforms that host postings, such as a mechanism to report fraudulent postings and a published policy on handling them. StaffTO has a **Report** link on every job and listing, a moderation queue and audit log, and a fraudulent-postings section in the Terms. ⚠️ Confirm the current regulatory text for platforms.

### 2.2 Other ESA points relevant to hospitality content

- **Minimum wage:** the general rate is adjusted every October 1 ($17.60/hr from October 1, 2025). The student rate is lower, and the job form's hourly floor is set to the lowest statutory rate. Review this every October.
- **Tips:** employers can't withhold tips except for permitted pooling. Listings state the tip arrangement.

### 2.3 Recruiter and temporary help agency (THA) licensing (ESA Part XVIII.1; licensing required since July 1, 2024)

- A **recruiter** is broadly a person who, for a fee, finds or attempts to find employment in Ontario for prospective employees. **THAs** employ workers and assign them to clients.
- **StaffTO is not a THA** under the current model, because it never employs or assigns workers. If you ever add "on-demand staff" or shift-filling where StaffTO supplies the workers, a THA licence (and the security deposit) is required first.
- **Recruiter status is not assumed to be exempt.** A neutral advertising board where employers pay to post and do their own selection is arguably different from a recruiter who "finds employment for" people. But:
  - ⚠️ Get a written legal opinion on whether StaffTO's activities require a recruiter licence.
  - Risk factors that push towards "recruiter": StaffTO staff picking candidates for employers, writing shortlists, headhunting, or charging per hire or placement. **Avoid all of these until you have the opinion.** The AI feature is a tool the *employer* runs on their own applicants; StaffTO does not select candidates.
  - **Never charge workers any fee.** It's prohibited for recruiters and is StaffTO policy.
- Employers can't knowingly use unlicensed recruiters or THAs. The Terms require agencies posting on StaffTO to hold a licence. ⚠️ Add a licence-number field for agency accounts.

### 2.4 Employment Protection for Foreign Nationals Act, 2009 (EPFNA)

- EPFNA protects foreign nationals recruited for employment in Ontario (for example caregivers and TFW-program workers) and was folded into the ESA licensing framework.
- **Relevance:** if StaffTO lists jobs for foreign nationals, or recruiters use the platform to recruit them, fee prohibitions and document-withholding protections apply. Employers keep their own obligations. StaffTO policy: no fees and no requests for identity documents in postings. ⚠️ Confirm with counsel whether any listing type triggers EPFNA obligations for StaffTO itself.

## 3. Ontario Human Rights Code

- Job postings can't express preferences based on protected grounds (race, ancestry, place of origin, colour, ethnic origin, citizenship, creed, sex, sexual orientation, gender identity or expression, age, marital status, family status, disability, record of offences).
- StaffTO: the posting rules forbid discriminatory requirements, and reports include a "discriminatory" reason. The seeker profile asks only "legally entitled to work in Canada", which is permitted, and offers "prefer not to say". There are no age, photo or citizenship fields.
- **AI:** the model never receives names, contact details or photos, and is instructed not to infer protected grounds. The score is a fixed rubric of job-related criteria.

## 4. Privacy — PIPEDA

Ontario has no general private-sector privacy statute, so PIPEDA applies to StaffTO's commercial activities.

| Principle | Implementation |
|---|---|
| Accountability | Privacy contact (Admin → Settings → Branding `privacy_email`); audit log of admin actions |
| Identifying purposes and consent | Privacy policy; terms acceptance timestamp; separate opt-in for marketing, AI processing and per-application AI review |
| Limiting collection | No date of birth, SIN, photos or citizenship |
| Limiting use and disclosure | Employers see only their own applicants; resumes via 5-minute signed URLs |
| Safeguards | Row- and field-level security (`base44/entities/*.jsonc`), private file storage, server-side authorization in functions |
| Openness | `/legal/privacy`, `/legal/ai`, `/legal/cookies` |
| Individual access | "Download my data" (JSON export) |
| Challenging compliance | Contact form topic "Privacy request"; reference to the OPC |
| Breach reporting | Must report breaches posing a real risk of significant harm to the OPC and affected people, and keep breach records for 24 months. ⚠️ Write an incident-response runbook. |

**Cross-border storage:** Base44, the email provider and Stripe may store data in the US. This is disclosed in the privacy policy.

**Account deletion:** deletes profile, resumes, saved jobs, notifications, referrals and listings; anonymises applications and messages; keeps payments, anonymised, for 6 years (CRA records). If the auth user can't be removed from inside a function, the DataRequest is left as "received" for an admin to finish.

## 5. CASL (Canada's Anti-Spam Legislation)

- Marketing email only with **express consent** (an unticked opt-in at onboarding or in settings). The timestamp is stored in `marketing_consent_at`.
- Every email identifies the sender (StaffTO, Toronto) and includes an unsubscribe link (`/unsubscribe?token=…`), effective immediately. The law requires within 10 business days.
- Transactional notifications (application status, messages, receipts) are generally exempt from the consent requirement, but StaffTO still includes identification and an opt-out.
- ⚠️ Keep consent records for the life of the relationship plus 3 years.

## 6. Accessibility — AODA

- Ontario organisations with 50+ employees must make public websites conform to WCAG 2.0 AA. StaffTO targets **WCAG 2.1 AA** regardless.
- Implemented: semantic landmarks, skip link, labelled form fields, focus-visible styles, `aria` on dialogs, tabs and toggles, reduced-motion support, AA-contrast palette, and keyboard-operable modals.
- ⚠️ Before launch, run an axe or Lighthouse audit plus a manual screen-reader pass (NVDA/VoiceOver). An accessibility statement page is a recommended addition.

## 7. Consumer protection, tax and corporate

- **HST:** the 13% Ontario HST is applied to employer purchases. Register for HST once revenue passes the $30,000 small-supplier threshold (or voluntarily), then add `hst_number` in Branding — invoices show it.
- **Consumer Protection Act, 2023:** relevant if sole proprietors are treated as consumers. Clear pricing, cancellation at period end, and no hidden renewals are already in place.
- **Corporate:** incorporate (Ontario or federal), register the business name "StaffTO" if operating under it, and check trademark availability for "StaffTO".

## 8. Launch-blocking legal to-dos

1. Lawyer review of the Terms, Privacy, AI and Cookies pages (drafts are in `src/pages/Legal.jsx`).
2. Written opinion on recruiter-licence applicability (§2.3).
3. Incident-response and breach-record procedure (§4).
4. Data retention purge job (3 years for jobs and applications).
5. Accessibility audit (§6).
6. Legal entity, HST registration and trademark search (§7).
