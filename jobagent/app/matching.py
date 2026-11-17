"""Title classification, hard-reject rules, and 0-100 scoring (Claude when available, heuristic otherwise).

Hard rejects are deterministic and ALWAYS applied, even if the LLM is enthusiastic:
mandatory French, wrong location, required years/degrees/certificates the profile does not have.
"""
from __future__ import annotations
import re

HOSPITALITY = re.compile(r"restaurant|food|kitchen|bar\b|cafe|café|hotel|dining|hospitality|catering|qsr|grill|pub\b|bistro|eatery|bakery|pizza", re.I)

TITLE_RULES = [  # (regex, category, template_kind, needs_hospitality_context)
    (r"assistant (restaurant |general |food service |kitchen |f&b |food & beverage )?manager|assistant gm|\bagm\b", "restaurant_management", "assistant_manager", True),
    (r"restaurant (general )?manager|restaurant operations manager|food (&|and) beverage manager|f&b manager|hospitality manager|kitchen manager|food service manager|general manager", "restaurant_management", "restaurant_manager", True),
    (r"administrative assistant|admin assistant|administrative coordinator|receptionist|data entry|customer service administrator|business support assistant", "administrative", "admin_assistant", False),
    (r"office administrator|office coordinator|office assistant|operations assistant|operations coordinator", "administrative", "office_operations", False),
]
EXCLUDE_TITLE = re.compile(r"\b(senior|sr\.?|director|vp|vice president|regional|area manager|district)\b", re.I)


def classify_title(title: str, description: str = "", company: str = ""):
    t = title.lower()
    if EXCLUDE_TITLE.search(t):
        return None
    for rx, cat, kind, needs_ctx in TITLE_RULES:
        if re.search(rx, t):
            if needs_ctx and not HOSPITALITY.search(f"{t} {company} {description[:600]}"):
                return None
            return cat, kind
    return None


def location_ok(location: str, cities: list[str]) -> bool:
    loc = location.lower()
    if re.search(r"\b(qc|quebec|québec|montreal|montréal)\b", loc):
        return False
    return any(re.search(rf"\b{re.escape(c.lower())}\b", loc) for c in cities)


SOFTEN = re.compile(r"asset|prefer|nice to have|bonus|advantage|ideally|or equivalent|or combination|willing to|able to obtain|ability to obtain|will train|not required|an asset", re.I)


def _window(text: str, start: int, end: int, n: int = 90) -> str:
    return text[max(0, start - n): end + n]


def hard_rejects(job_title: str, text: str, profile: dict, cfg: dict) -> list[str]:
    """Returns human-readable reasons; empty list means no hard blocker."""
    reasons: list[str] = []
    t = text
    # 1. French must not be mandatory
    for m in re.finditer(r"french|français|francais|bilingue|bilingual", t, re.I):
        w = _window(t, m.start(), m.end(), 80)
        if SOFTEN.search(w):
            continue
        if re.search(r"requir|must|mandatory|essential|fluent|bilingual|bilingue|exig|obligatoire|necessary|need", w, re.I):
            reasons.append("French appears to be mandatory / bilingual required")
            break
    if re.search(r"(en français|exigé|bilingue (français|anglais))", t, re.I) and not reasons:
        reasons.append("Posting is partly/wholly in French or demands bilingualism")
    # 2. Years of experience beyond what the profile can demonstrate
    yrs = profile.get("experience_years", {})
    domains = [("management", r"manag|supervis|leadership|lead\b", yrs.get("management", 0)),
               ("administrative", r"administrat|office|clerical|reception|secretar|data entry", yrs.get("administrative", 0)),
               ("customer service", r"customer service|client service", yrs.get("customer_service", 0)),
               ("restaurant/kitchen", r"restaurant|kitchen|culinary|food service|hospitality|cook|chef|f&b|food and beverage", yrs.get("restaurant_total", 0))]
    for m in re.finditer(r"(\d+)\s*\+?\s*(?:-\s*\d+\s*)?(?:years?|yrs?)", t, re.I):
        n = int(m.group(1))
        if n < 1 or n > 20:
            continue
        w = _window(t, m.start(), m.end(), 70)
        if SOFTEN.search(w):
            continue
        for name, rx, have in domains:
            if re.search(rx, w, re.I) and n > have + 0.5:
                reasons.append(f"Requires {n}+ years of {name} experience (profile shows {have})")
                break
        else:
            continue
        break
    if not any("years" in r for r in reasons):
        m = re.search(r"(previous|prior|proven|demonstrated|extensive|solid)[^.\n]{0,40}(management|managerial|supervisory)[^.\n]{0,30}experience", t, re.I)
        if m and not SOFTEN.search(_window(t, m.start(), m.end(), 60)) and profile.get("experience_years", {}).get("management", 0) < 1:
            reasons.append("Requires prior management/supervisory experience (none on CV)")
    # 3. Degrees / certificates stated as required that the profile lacks
    held = " ".join(profile.get("certifications", []) + profile.get("education", [])).lower()
    for term in cfg.get("matching", {}).get("certs_i_lack", []):
        if term.lower() in held:
            continue
        for m in re.finditer(re.escape(term), t, re.I):
            w = _window(t, m.start(), m.end(), 70)
            if SOFTEN.search(w):
                continue
            if re.search(r"requir|must|mandatory|essential|necessary|need|hold a|valid", w, re.I):
                reasons.append(f"Requires '{term}', not on CV")
                break
        if any(term in r for r in reasons):
            break
    return reasons


# ---------------------------------------------------------------- salary
def parse_salary(text: str | None, lo=None, hi=None, period: str | None = None):
    """Returns (min_annual, max_annual) in CAD; hourly assumed 37.5h*52, rough but consistent."""
    def annual(v, per):
        if v is None:
            return None
        per = (per or "").lower()
        if per.startswith("hour") or (v < 200):
            return v * 37.5 * 52
        if per.startswith("month"):
            return v * 12
        if per.startswith("week"):
            return v * 52
        return v
    if lo is not None or hi is not None:
        return annual(lo, period), annual(hi or lo, period)
    if not text:
        return None, None
    nums = [float(x.replace(",", "")) for x in re.findall(r"\$?\s*(\d[\d,]*\.?\d*)", text)]
    nums = [n for n in nums if n > 0]
    if not nums:
        return None, None
    per = "hour" if re.search(r"hour|/hr|per hr", text, re.I) else ("month" if "month" in text.lower() else "year")
    return annual(min(nums), per), annual(max(nums), per)


# ---------------------------------------------------------------- scoring
def heuristic_scores(job, profile: dict, cfg: dict) -> dict:
    text = f"{job.title} {job.description}".lower()
    m = cfg["matching"]
    kind = job.template_kind
    exp = {"restaurant_manager": 45, "assistant_manager": 62, "admin_assistant": 55, "office_operations": 58}.get(kind, 40)
    if re.search(r"entry.level|no experience|will train|training provided|junior", text):
        exp += 15
    if re.search(r"kitchen|cook|chef|back of house|boh|food safety|mise en place|grill", text) and kind in ("restaurant_manager", "assistant_manager"):
        exp += 12
    if re.search(r"data entry|documentation|reporting|scheduling|invoic|inventory|training", text):
        exp += 8
    resp = 50 + 8 * len(re.findall(r"food safety|customer service|schedul|inventory|train|coordinat|documentation|communicat|organiz", text))
    if re.search(r"p&l|budget|payroll|hiring and firing|labour cost|labor cost|profit", text) and kind in ("restaurant_manager",):
        resp -= 15
    qual = 85
    lang = 95 if not re.search(r"french", text) else 75
    lo, hi = job.salary_min, job.salary_max
    if lo is None:
        sal = 55
    else:
        top = hi or lo
        sal = 90 if top >= m["min_annual"] * 1.25 else (70 if top >= m["min_annual"] else 35)
    loc = 95 if re.search(r"toronto|north york|scarborough|mississauga|brampton|vaughan|markham|richmond hill|etobicoke|oakville|burlington", job.location.lower()) else 75
    growth = 50 + (25 if re.search(r"career growth|advancement|promot|progress|grow with|opportunit(y|ies) for growth|permanent|full.time", text) else 0)
    clamp = lambda v: max(0, min(100, v))
    return {k: clamp(v) for k, v in dict(experience=exp, responsibilities=resp, qualifications=qual, language=lang, salary=sal, location=loc, growth=growth).items()}


SYSTEM = """You evaluate job postings for ONE candidate. Be strict and honest; the candidate must never be misrepresented.
Return ONLY a JSON object: {"experience":0-100,"responsibilities":0-100,"qualifications":0-100,"language":0-100,"salary":0-100,"location":0-100,"growth":0-100,"hard_reject":true|false,"reasons":["..."],"summary":"one sentence"}.
Set hard_reject=true if the job needs mandatory French, a degree/certificate/licence the candidate lacks, or experience (especially management/administrative years) the candidate cannot demonstrate. Treat 'asset/preferred' as not required.
Score 'experience' on how well the candidate's REAL background fits; do not assume unlisted skills."""


def llm_scores(ctx, job) -> dict | None:
    if not ctx.llm:
        return None
    p = ctx.profile
    facts = "\n".join(f"- {r['title']} @ {r['company']} ({r['dates']}): " + "; ".join(r["facts"]) for r in p["roles"])
    user = (f"CANDIDATE FACTS (complete; nothing else is true):\n{facts}\nYears: {p['experience_years']}\nCertifications: {p['certifications']}\n"
            f"Education: {p['education']}\nLanguages: {p['languages']}\n\nJOB\nTitle: {job.title}\nCompany: {job.company}\nLocation: {job.location}\n"
            f"Salary: {job.salary_text or 'not stated'}\nDescription:\n{job.description[:6000]}")
    out = ctx.llm.json(SYSTEM, user)
    keys = ["experience", "responsibilities", "qualifications", "language", "salary", "location", "growth"]
    if not out or not all(isinstance(out.get(k), (int, float)) for k in keys):
        return None
    return out


def evaluate(ctx, job) -> None:
    """Fills job.score/breakdown/verdict/status. Mutates the ORM object."""
    cfg, m = ctx.cfg, ctx.cfg["matching"]
    cls = classify_title(job.title, job.description, job.company)
    if not cls:
        return _reject(job, "Title is not one of the target positions")
    job.category, job.template_kind = cls
    if not location_ok(job.location, cfg["locations"]):
        return _reject(job, f"Location '{job.location}' is outside Toronto/GTA")
    reasons = hard_rejects(job.title, f"{job.title}\n{job.description}", ctx.profile, cfg)
    if reasons:
        return _reject(job, "; ".join(reasons))
    scores, source = llm_scores(ctx, job), "claude"
    if scores is None:
        scores, source = heuristic_scores(job, ctx.profile, cfg), "heuristic"
    elif scores.get("hard_reject"):
        return _reject(job, "Claude: " + "; ".join(scores.get("reasons") or ["not a fit"]))
    w = m["weights"]
    total = round(sum(float(scores[k]) * w[k] for k in w), 1)
    job.score, job.breakdown = total, {**{k: scores[k] for k in w}, "source": source, "summary": scores.get("summary", "")}
    if total >= m["min_score_to_apply"]:
        job.verdict, job.status = "suitable", "new"
    elif total >= m["min_score_to_keep"]:
        job.verdict, job.status = "maybe", "maybe"
    else:
        _reject(job, f"Score {total} below threshold")
        job.score, job.breakdown = total, job.breakdown or {}


def _reject(job, reason: str) -> None:
    job.verdict, job.status, job.reject_reason = "rejected", "rejected", reason
    job.score = job.score if job.score is not None else 0
