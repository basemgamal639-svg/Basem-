"""Personalised application emails. Four templates; every factual claim comes from profile.yaml.
Claude may only write ONE short 'why I fit' paragraph, and it is rejected if it breaks the fact guard."""
from __future__ import annotations
import re
from string import Template

CLOSING = Template("""I have attached my CV and would welcome the opportunity to discuss the role in an interview. Thank you for your time and consideration.

Kind regards,
$name
$phone | $email
$linkedin""")

TEMPLATES = {
    "restaurant_manager": Template("""Dear $greeting,

I am writing to apply for the $title position at $company. I am a hands-on restaurant professional with $h1.

$fit

$honesty

$closing"""),
    "assistant_manager": Template("""Dear $greeting,

I am excited to apply for the $title role at $company. My background includes $h1.

$fit

$honesty

$closing"""),
    "admin_assistant": Template("""Dear $greeting,

I would like to apply for the $title position at $company. I bring $h1, along with $h2.

$fit

$closing"""),
    "office_operations": Template("""Dear $greeting,

I am writing to express my interest in the $title position at $company. My experience includes $h1, as well as $h2.

$fit

$closing"""),
}

HONESTY = {  # shown only where the role is above the CV's formal level - states the truth plainly
    "restaurant_manager": "My experience so far is as a Chef de Partie and kitchen team member rather than in a formal management title, and I am eager to grow into greater responsibility with a team that values reliability and hands-on operational knowledge.",
    "assistant_manager": "I am looking to step into a leadership-track role, building on my station-coordination and training experience, and I learn new systems and procedures quickly.",
}


def greeting(contact_name: str | None) -> str:
    return contact_name.split()[0].strip() if contact_name and len(contact_name.split()) >= 1 and contact_name.strip() else "Hiring Team"


def _fit_fallback(kind: str, job) -> str:
    return {"restaurant_manager": "My food-safety discipline, quality focus and calm approach to high-volume service would translate directly into running a smooth dining operation.",
            "assistant_manager": "My reliability, communication with kitchen and front-of-house teams, and habit of keeping service on time make me a dependable fit for this role.",
            "admin_assistant": "I am organized, detail-oriented and comfortable handling accurate records and people-facing tasks in fast-paced settings.",
            "office_operations": "I am organized, deadline-driven and used to following structured processes while helping a team run efficiently."}[kind]


def guard(text: str, profile: dict) -> list[str]:
    """Returns violations. Used on LLM output AND on every final email."""
    bad = []
    low = text.lower()
    for phrase in profile.get("forbidden_claims", []):
        if phrase.lower() in low:
            bad.append(f"forbidden claim: '{phrase}'")
    for m in re.finditer(r"(\d+|two|three|five|six|seven|eight|nine|ten)\+?\s+years", low):
        if m.group(1) not in ("4", "four"):
            bad.append(f"unsupported years claim: '{m.group(0)}'")
    return bad


def llm_fit(ctx, job, kind: str) -> str | None:
    if not ctx.llm:
        return None
    p = ctx.profile
    facts = "\n".join(f"- {r['title']} at {r['company']}: " + "; ".join(r["facts"]) for r in p["roles"])
    sys = ("You write ONE paragraph (2-3 sentences, first person, plain professional Canadian English) for a job application email, "
           "explaining why the candidate suits this job. Use ONLY the facts supplied. Never mention degrees, certificates, management "
           "experience, or any number of years other than 'about four years of restaurant experience'. No greeting, no sign-off, no bullet points. "
           'Return JSON: {"paragraph": "..."}')
    out = ctx.llm.json(sys, f"FACTS:\n{facts}\n\nJOB: {job.title} at {job.company}\n{job.description[:3000]}", max_tokens=400)
    para = (out or {}).get("paragraph", "").strip()
    return para if para and len(para) < 700 and not guard(para, p) else None


def build_email(ctx, job, contact_name: str | None = None) -> dict:
    p, kind = ctx.profile, job.template_kind
    hl = p["highlights"][kind]
    fit = llm_fit(ctx, job, kind)
    parts = dict(
        greeting=greeting(contact_name), title=job.title, company=job.company, h1=hl[0], h2=hl[1] if len(hl) > 1 else hl[0],
        fit=fit or _fit_fallback(kind, job), honesty=HONESTY.get(kind, ""),
        closing=CLOSING.substitute(name=p["name"], phone=p["phone"], email=p["email"], linkedin=p["linkedin"]))
    body = TEMPLATES[kind].safe_substitute(**parts)
    extras = [s for s in (p.get("relocation_sentence"), p.get("work_authorization_sentence")) if s]
    if extras:   # only facts the user has explicitly confirmed in profile.yaml
        body = body.replace("I have attached my CV", " ".join(extras) + "\n\nI have attached my CV", 1)
    body = re.sub(r"\n{3,}", "\n\n", body).strip()
    subject = f"Application for {job.title} at {job.company} - {p['name']}"
    warnings = guard(body, p)
    if job.title.lower() not in body.lower() or job.company.lower() not in body.lower():
        warnings.append("title/company missing from body")
    if not p.get("relocation_sentence"):
        warnings.append("profile.relocation_sentence is empty: employer may assume Montreal-based candidate")
    return {"subject": subject, "body": body, "llm_used": bool(fit), "warnings": warnings}


def build_followup(ctx, job, original_subject: str, contact_name: str | None = None) -> dict:
    p = ctx.profile
    body = (f"Dear {greeting(contact_name)},\n\nI am following up on my application for the {job.title} position at {job.company}. "
            f"I remain very interested in the role and would be glad to provide any additional information or speak at your convenience. "
            f"My CV is attached again for reference.\n\nThank you for your time.\n\nKind regards,\n{p['name']}\n{p['phone']} | {p['email']}")
    return {"subject": "Re: " + original_subject.removeprefix("Re: "), "body": body, "llm_used": False, "warnings": guard(body, p)}
