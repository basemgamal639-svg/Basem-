# Competitor analysis — StaffMTL vs. StaffTO

_Observed November 7, 2026 by crawling staffmtl.ca (EN) with a headless browser and reading its two public PDF guides. Every figure below is what StaffMTL itself publishes; nothing was independently verified._

## 0. Scope and limitations

| Source | Status |
|---|---|
| staffmtl.ca — home, jobs list, job page, post-a-job (step 1), map, classifieds, classified page, reviews, contract templates, login/sign-up, terms, privacy | ✅ Read |
| "StaffMTL pour les employeurs" and "…pour les chercheurs" PDFs | ✅ Read |
| Employer dashboard, job-seeker dashboard, apply flow, payment flow | ❌ Behind login; I did not create accounts on a competitor's live service |
| Facebook groups ([Staff de Bar & Resto Montréal](https://www.facebook.com/groups/SBRMTL/), [Québec](https://www.facebook.com/groups/staffquebec)) | ❌ Facebook requires login. Member count and engagement were **not** observed. The 176,500 figure below is StaffMTL's own claim. |
| Images | Most photos came from a third-party CDN that didn't load in the crawler, so screenshots show empty image slots. That isn't evidence of broken images for real visitors. |

The Facebook link in the brief (`share/g/1E27TFY9dc`) is very likely one of StaffMTL's own groups. StaffTO deliberately does **not** link to it; set your own group URL in Admin → Settings → Community.

**Owner:** Autoroute Santé Inc. (Montréal). The terms are in French, which is the official version, with an English courtesy translation.

## 1. What the site does

**Navigation:** Venues · Jobs · Map · Classifieds · Login · **Post a job** (black pill) · FR/EN.

**Homepage**, top to bottom:
1. "Who's hiring right now in Quebec." with a live job count ("192 jobs right now").
2. A **venues-first grid**: dark cards per restaurant with neighbourhood and pay chips ("Cook 19 $+", "Sous-chef 70,000 $/yr+"), "N JOBS" badges and "New job · today".
3. How it works, in two columns: job seekers (find by map or search → apply in 2 clicks → track and chat) and hiring (post in 2 minutes, one price → share on Facebook → applications **sorted by AI: score, strengths, gaps**).
4. Social proof: "176,500 members of the Staff de Bar & Resto groups · 192 active jobs · 1 classified", plus 3 five-star reviews.
5. "Clear the kitchen": a classifieds preview.
6. Footer: About, Resources (contract templates, reviews, employer and seeker PDFs, contact), FB groups, Legal.

**Jobs list (`/offres`)**
- Date filter for shifts: Any day / Today / Tomorrow / This weekend / Pick dates.
- Contract (temporary, permanent, full-time, part-time, on-call, seasonal) and 16 roles.
- Area, minimum pay ($15–25/h) and **language** (French / English / bilingual).
- "Sign in to see the shifts you're free for" — availability matching.
- About 20 per page with pagination; a "By city" section.

**Job page**
- Breadcrumb, venue, address, title, then a facts strip: contract, schedule, tips, language.
- Details table, description, venue photos, ref code, "Report this listing".
- Sticky pay card with **Apply**, Email, Save, Share.
- OpenStreetMap map and similar jobs.

**Posting flow (`/publier`)**
- Five steps: job → photo → schedule → pay → contact, with a live preview.
- Product choice: **Job offer $14.99/listing (30 days)**, Job search (worker ad) free, **Business promo from $30**, **Event promo from $30**; equipment goes to classifieds.
- Prices exclude GST/QST.
- The employer PDF advertises a launch offer: unlimited free posting for 2 weeks, then **$2.99/offer**. This conflicts with the $14.99 on the site, so the PDF is probably out of date.

**Other**
- Map page (Leaflet with clustered counts).
- Classifieds: free, with categories equipment, furniture, business for sale and other. Only 1 active listing.
- Reviews page: 4 reviews, all 5★.
- **Contract templates**: free with an account, Quebec employment, event, rental, service-provider and policy templates in PDF and Word.
- Email/password auth.
- The terms describe StaffMTL as "solely a publication intermediary … not a placement agency".

**Design:** Geist sans throughout, white and warm-grey background, black pill buttons, large-radius cards, dark venue cards with monospace pay chips. Clean, modern and minimal.

## 2. Business model

| | StaffMTL (observed) |
|---|---|
| Core revenue | Pay-per-post, $14.99 per 30 days (plus GST/QST) |
| Other revenue | Business and event promos (from $30) pushed to the Facebook groups |
| Free | Job seekers; worker "job search" ads; classifieds; contract templates |
| Distribution | Paid posts are relayed into their two Facebook groups (the terms grant a licence to "diffuse … through the Facebook group") |
| Positioning | "Publication intermediary", not a placement agency |
| Multi-venue | One account manages several venues (employer PDF) |
| AI | Applicants scored out of 100, with strengths and gaps |

## 3. Acquisition and conversion

- **Supply engine:** the Facebook groups. Every paid listing is also a group post, and the site sells *reach into the group*.
- **Employer conversion:** one low price ($14.99), a 2-minute structured form with a preview, a "share on Facebook" step, and AI sorting as a premium-feeling feature that's included.
- **Seeker acquisition:** group posts link to the site; "apply in 2 clicks"; a map; "response ~3 h" (their claim).
- **Retention hooks:** messaging, application tracking ("see who viewed you"), contract templates behind sign-up, reviews.

## 4. Strengths

1. A huge, already-owned audience (claimed 176.5k) — the moat.
2. Very low price, so very low friction for independent restaurants.
3. Shift and date-based temporary jobs plus availability matching: a real hospitality need (last-minute shifts).
4. Map discovery, language filter, bilingual.
5. Clean, fast, modern UI with structured listings.
6. Useful extras: contract templates, promos for events.

## 5. Weaknesses and risks

1. **Classified sellers' email addresses are shown publicly** on listing pages. That invites scraping and spam, and is a privacy issue. (StaffTO: buyer→seller messaging on the platform; no emails shown.)
2. Thin classifieds (1 listing) and few reviews (4), so the secondary marketplace and social proof are weak.
3. Headline social proof is **Facebook group membership**, not platform usage; it depends on Meta (the terms acknowledge reliance on third parties).
4. Pay shows "From X $" with many minimum-wage tipped postings (13.30 $/h, Quebec's tipped minimum). Quebec context, but it frames the board around minimum pay.
5. AI scoring without visible consent or explanation on the public site. In Ontario, AI use in screening must be disclosed in postings (ESA 2026), and Human Rights Code exposure makes explainability important.
6. Generic stock "illustration photos" when the venue has no photo.
7. Pricing inconsistency between the PDF ($2.99) and the site ($14.99).
8. Quebec-only; nothing in Ontario.

## 6. What StaffTO changes as a result

| Finding | StaffTO response | Status |
|---|---|---|
| $14.99/post anchors the market | Default prices lowered to **Single $19.99 · Featured $9.99 · Pro $79/mo · Premium $149/mo** (all editable in Admin → Settings → Pricing). Launch with 100%-off codes. | ✅ Done (this update) |
| Language filter matters in a multilingual city | Language filter added to job search | ✅ Done |
| Email exposure in classifieds | Already platform messaging only | ✅ Built |
| AI scoring without transparency | Consent per application, rubric with reasons, Ontario disclosure | ✅ Built |
| Shift / date-based temp jobs, "free for" matching | Add `shift_dates` to Job + "Today / Tomorrow / Weekend" filter + seeker availability calendar | 🔜 Roadmap #1 |
| Map discovery | Add Leaflet/OpenStreetMap map view (needs geocoding of addresses) | 🔜 Roadmap #2 |
| Contract templates as sign-up incentive | Ontario templates (ESA-aligned employment offer, event, tip-pool policy) — lawyer-reviewed first | 🔜 Roadmap #3 |
| Business / event promos (from $30) | Add "Promo post" product (shared to StaffTO's own group and page only) | 🔜 Roadmap #4 |
| Group audience is their moat | Build StaffTO's own Toronto group (see marketing strategy). Never copy or scrape theirs. | Owner action |
| Venues-first homepage | Consider a "Venues hiring" grid when there are 10+ employers | Optional |

## 7. Positioning in one line

StaffMTL sells **reach into a Facebook group**. StaffTO sells **a better way to hire in Toronto**: pay-transparent, Ontario-compliant, explainable AI, safer classifieds. It builds its own community rather than renting one.
