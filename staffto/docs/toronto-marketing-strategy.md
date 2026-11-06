# StaffTO — Toronto go-to-market & community strategy

**Positioning:** _The hospitality job community connecting Toronto's restaurants with the people who make them work._
**Promise:** Pay on every listing. Free for workers. Real Toronto jobs.

## 1. Audiences

| Segment | Where they are | What they want | Hook |
|---|---|---|---|
| BOH workers (cooks, dishwashers) | Facebook groups, Instagram, WhatsApp chats, word of mouth | Steady hours, fair pay, decent chef | Pay shown up front; filter by area and shift |
| FOH workers (servers, bartenders, baristas) | Instagram, TikTok, Facebook groups | Good tips, a good room, flexible shifts | Tips arrangement shown; patio-season jobs |
| Independent owners and GMs | Facebook groups, BIAs, supplier reps, ORHMA events | Staff fast, without agency fees | Post in 5 minutes, share kit, promo code for the first post |
| Hotels, caterers, multi-unit groups | LinkedIn, ORHMA, event-industry networks | Volume hiring, many locations | Pro and Premium, AI-assisted organisation, analytics |

## 2. The Facebook community engine (the core loop)

1. **Own a group.** Create "Toronto Hospitality Jobs & Community (StaffTO)". Set the rules from `/community` (pay required, no fees for workers, no discrimination, report scams). Add the group URL in Admin → Settings → Community, and every "Join" CTA on the site starts pointing to it.
2. **Daily job drop.** Every morning, Admin → Community campaigns → "Generate copy" builds a post from live jobs with `utm_campaign` links. Post it in your own group. Measure visits, job views, applications and sign-ups per campaign in the same table.
3. **Employer self-share.** After publishing, employers land on the share kit (copy post, image, Facebook / WhatsApp / LinkedIn buttons). Each share is counted, and traffic is attributed with `utm_source`.
4. **Partner groups — with permission.** List other Toronto hospitality and newcomer-job groups. Message their admins, offer a weekly curated "pay-listed jobs" post, and record which groups agreed in the campaign notes. **Never** auto-post, spam or scrape groups. StaffTO deliberately has no auto-posting.
5. **Referrals.** Every member gets a `?ref=` link. Visits, sign-ups and applications are counted. Reward with featured credits for workplaces and merch — never cash per placement (that would look like paid recruiting).

## 3. 90-day launch plan

| Weeks | Focus | Actions | Target signals (set your own numbers) |
|---|---|---|---|
| 0–2 | Seed supply | Hand-onboard 30–50 employers in 3 clusters (Downtown West, Danforth/Leslieville, Mississauga City Centre). Give a 100%-off first-post code (Admin → Promo codes). Publish 5 cornerstone articles. | Live jobs with pay; employer activation rate |
| 2–6 | Community | Launch the Facebook group and daily job drop. Get 2–3 partner groups to agree. Instagram "pay-listed job of the day" carousels. | Facebook-sourced sessions; view → apply rate |
| 6–10 | Conversion | Turn on Stripe (test mode first). Single-post price test. Featured upsell after the first 5 applications. | Paid conversion; repeat posting |
| 10–13 | Scale | Patio-season or holiday hiring campaign; Brampton and Markham clusters; supplier and BIA partnerships | Employers per cluster; jobs per employer |

All of these metrics are in Admin → Overview (live, never estimated).

## 4. SEO and content calendar

- Landing pages: restaurant, cook, chef, server, bartender and dishwasher jobs in Toronto; restaurant hiring Toronto; hospitality staffing Toronto (built in).
- Monthly articles (Admin → Content):
  - **Hiring guides:** "How to write a line cook job post that gets 20 applicants", "Ontario's 2026 job-posting rules for restaurants".
  - **Job search:** "Smart Serve and food handler certification in Toronto", "How to stage at a Toronto restaurant".
  - **Salary guides:** "What Toronto restaurants pay in [year]" — computed only from StaffTO's own listings, with the sample size stated.
  - **Employer tips:** "Reduce no-shows for interviews", "Retaining staff after patio season".
- Internal links: every article links to the matching landing page and live jobs.

## 5. Email (CASL-compliant)

- Only to users who ticked marketing consent. The consent timestamp is stored, and every email has an unsubscribe link (handled within 10 business days — ours is instant).
- **Weekly "New pay-listed jobs near you"** for seekers; **monthly "Hiring this month"** for employers.
- Transactional emails (application status, messages) go out separately and also include an opt-out link.

## 6. Employer conversion mechanics in the product

- "Post a Job" in the nav at all times. A draft is saved before the paywall, so no work is lost.
- The paywall appears only at publish, with a promo-code field.
- The share kit appears immediately after publishing, so employers see value in their first session.
- Featured upgrade at the moment it matters: in the jobs list.
- Recruitment analytics (views, applications, conversion) on the employer dashboard.

## 7. Brand and voice

Direct, warm, industry-native ("86'd", "stage", "BOH/FOH") but never cute about pay or rights. Editorial visual identity: serif headlines, ink and paper, streetcar red. No stock photos of smiling chefs. Use real member photos with consent, or typographic layouts.

## 8. Don'ts

- No fabricated stats, testimonials or "trusted by 500 restaurants" badges. The homepage shows live counts only.
- No scraping Facebook groups or importing other boards' jobs without permission.
- No charging workers anything.
- Don't post on behalf of employers or find workers for them for a fee until you have legal advice on Ontario recruiter licensing (see `ontario-legal-compliance.md`).
