# AI-assisted candidate organisation

## Principles (enforced in code)

| Principle | Where |
|---|---|
| Advisory only — never changes status or rejects | `ai/entry.ts` writes only `ai_*` fields; the status changes only in `jobs.updateApplication`, triggered by a person |
| Consent per application | `JobApplication.ai_consent` (opt-in checkbox when applying); `ai.analyze` returns 400 without it, and `analyzeJob` skips those applications |
| Consent for resume text extraction | `UserProfile.ai_processing_consent`; withdrawing it deletes `Resume.extracted_text` |
| No sensitive inference | Names, email, phone and photos are never sent to the model; the prompt forbids inferring Human Rights Code grounds |
| Transparent score | Fixed rubric (below); every point carries an explanation shown to the employer |
| Private to the employer | Field-level security hides `ai_*`, notes and ratings from the applicant (they can request them via data export / privacy contact) |
| Human review | Employers see the full profile, resume and notes next to the analysis; compare view; the UI and disclaimer repeat "advisory only" |
| Ontario disclosure | Job form checkbox "may use AI to screen/assess/select" → disclosure on the listing |
| Plan gate | Premium (configurable via `pricing.plans.<plan>.ai_screening`) |

## Rubric (100 points)

| Criterion | Max | Logic |
|---|---|---|
| Skills | 35 | Share of the job's listed skills evidenced in profile, work history, resume text or LLM-extracted skills (neutral 20 if the job lists none) |
| Experience | 25 | Years vs. required level (none / <1 / 1–2 / 3–5 / 5+), pro-rated |
| Role fit | 15 | Same role in history or preferences = 15; related role = 8 |
| Certifications | 10 | Share of requested certifications shown |
| Availability | 10 | Employment type 6 + shift overlap 4 |
| Location | 5 | Preferred area matches = 5, otherwise 2 (commute is the candidate's call) |

The LLM (Base44 `InvokeLLM`) only adds a neutral summary, strengths, gaps and extracted skills. If it is unavailable, the analysis still completes with a template summary (`ai_method: "rules"`).

## Known limits

- Keyword matching can miss synonyms ("sauté" vs "saute station"); employers are told that missing items may simply be unlisted.
- Bias review: periodically compare score distributions across job types, and keep the rubric limited to job-related criteria. Never add proxies (school names, addresses, employment gaps).
