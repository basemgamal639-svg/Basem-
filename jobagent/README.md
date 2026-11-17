# Job Agent - automated job search & HR outreach (Toronto / GTA)

Finds new jobs three times a day, scores them 0-100 against **your real CV**, finds **publicly published** HR emails on the
employer's own site, drafts a personalised email per job, and sends it through **Gmail (OAuth)** - after your approval until
you unlock auto-send. Tracks replies/bounces, drafts one follow-up after 4 business days, emails you a daily report.

```
sources -> dedupe -> hard-reject rules -> score (Claude / rules) -> find contact -> draft email -> [you approve]
        -> verify job still live -> send via Gmail -> track replies/bounces -> follow-up -> daily report
```

## Quick start
```bash
cd jobagent && pip install -r requirements.txt
cp .env.example .env              # fill keys (below)
python -m app.cli check           # tells you exactly what is still missing
python -m app.cli serve           # dashboard http://127.0.0.1:8000 + 8:00 / 13:00 / 18:00 scheduler
python -m pytest                  # 43 tests
```
It must run on an **always-on machine** (home PC, VPS, Fly/Render via the Dockerfile). Cloud coding sessions are ephemeral.
For Supabase, set `DATABASE_URL=postgresql+psycopg://...` (tables are created automatically).

## Accounts / keys you need to supply
| What | Why | Where |
|---|---|---|
| Anthropic API key | job scoring + the one "why I fit" paragraph | `ANTHROPIC_API_KEY` (optional: rules/templates are the fallback) |
| Adzuna app id/key (free) | Canadian job search API (covers Job Bank-type listings, employer sites) | developer.adzuna.com |
| RapidAPI key -> **JSearch** | Google for Jobs aggregation (Indeed/LinkedIn/Glassdoor listings, legitimately) | rapidapi.com |
| Brave Search key (optional) | finds the employer's official website when the listing has none | `BRAVE_API_KEY` |
| Gmail OAuth | send / read replies | see below |

### Gmail OAuth (no password is ever stored)
1. Google Cloud Console -> new project -> enable **Gmail API** -> OAuth consent screen (External, add yourself as a test user).
2. Credentials -> Create OAuth client ID -> **Desktop app** -> download as `jobagent/credentials.json`.
3. `python -m app.cli gmail-auth` (browser consent; saves `token.json`; both files are git-ignored). Scopes: `gmail.send`, `gmail.readonly`.
4. Set `MAILER=gmail` in `.env`.

## Safety model (what protects you)
* **Approval mode is the default.** Nothing is sent until you press *Approve & send* in the dashboard. Auto-send **stays locked until
  5 real applications were approved and sent by you** (`unlock_auto_after_real_sends`), and requires Gmail connected.
* **Auto mode still only sends** when: contact is high-confidence (hr@/careers@/jobs@ on the company's own domain, or an address inside the posting
  on that domain), email has zero warnings, job page verified live, score >= 75, within the daily cap (15), not already contacted.
  Anything else waits in the approval queue.
* **Never guesses emails.** Only addresses actually found on the posting / the company's own pages, same-domain, with MX records. `info@` is "low"
  confidence (approval only). No address -> job saved as "needs manual follow-up" with a ready LinkedIn recruiter-search link.
* **Never invents qualifications.** Emails come from `profile.yaml` facts only; a guard blocks degrees, certificates, "managed a team", unsupported
  year counts - for Claude's text *and* for your edits. Roles above your level get an honest sentence ("experience so far is as Chef de Partie ...").
* **Hard rejects** (always, even if Claude likes the job): mandatory French/bilingual, outside GTA, required years of management/admin you don't have,
  required degree/Smart Serve/Food Handler/etc. (asset/preferred/"willing to obtain" are fine).
* One application per company and per job; opt-out replies ("do not contact") suppress that address and company; bounces mark the address bad.
* Respects job-board terms: Indeed/LinkedIn/Glassdoor are **not scraped**. robots.txt honoured on every page fetch.

## Things you must do/decide (the system will not guess them)
1. **`profile.relocation_sentence`** - your CV says *Montreal*. Employers in Toronto will see that. Write the true sentence about your move/start date,
   or leave it empty (then every email carries a warning and auto-send is blocked).
2. Optionally `work_authorization_sentence`.
3. **Management roles:** your CV shows no management experience. Most "Restaurant Manager" ads ask for 2-3+ years, so they are auto-rejected.
   You will mainly be matched to Assistant Manager / "will train" roles and admin/operations roles. That is deliberate - tell me if you want
   a different policy.
4. Add real certifications to `profile.yaml` (e.g. Food Handler) only if you hold them - it unlocks jobs requiring them.

## Commands
`check` | `run-once` | `serve` | `mode approval|auto` | `report [--send]` | `add-job --url ... --title ... --company ... --location ...` (import a listing you found yourself on Indeed/LinkedIn; it is scored and drafted like any other).

## Tested vs not tested
Tested (43 automated tests, mocked network): dedupe, location/language/qualification rules, scoring, contact extraction & no-guessing, all four templates, fact guard,
approval vs auto gating, duplicate prevention, daily cap, closed/unverifiable jobs, bounces, opt-outs, reply classification, business-day follow-ups, report, dashboard API/auth.
**Not testable here (needs your keys, no network access to them from this build environment):** live Adzuna/JSearch calls, Claude calls, the real Gmail send/receive
round-trip. Run in approval mode first; the first real sends are the live test. Reply classification is keyword-based - check "replied" items yourself.
Adzuna returns truncated descriptions, so scores on those are less precise. Job Bank Canada has no sanctioned scraping API; its listings are reached through Adzuna/Google Jobs.
