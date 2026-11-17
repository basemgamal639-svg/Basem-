"""Finds REAL, publicly published hiring emails on the company's own website. Never guesses addresses."""
from __future__ import annotations
import os, re
from urllib.parse import quote_plus, urljoin, urlparse

from bs4 import BeautifulSoup

BOARD_DOMAINS = re.compile(r"(indeed|linkedin|glassdoor|workopolis|jobbank|adzuna|ziprecruiter|facebook|instagram|yelp|tripadvisor|google|monster|jooble|careerbeacon|talent\.com|wikipedia|twitter|x\.com|youtube)\.", re.I)
EMAIL_RX = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
HIGH = re.compile(r"^(hr|careers?|jobs?|recruit\w*|talent|hiring|people|humanresources|employment|apply|resumes?|work)$", re.I)
MEDIUM = re.compile(r"(hr|career|job|recruit|hiring|talent|manager|gm|operations|admin|office)", re.I)
BAD_LOCAL = re.compile(r"^(no-?reply|donotreply|privacy|webmaster|abuse|legal|billing|press|media|support|sales|marketing|postmaster|unsubscribe)", re.I)
LINK_HINT = re.compile(r"career|job|employ|hiring|join|work-with|contact|about|team", re.I)


def norm_company(name: str) -> str:
    n = re.sub(r"\b(inc|ltd|limited|corp|corporation|llc|co|company|canada|restaurants?|group)\b\.?", "", name.lower())
    return re.sub(r"[^a-z0-9]+", " ", n).strip() or name.lower().strip()


def domain_of(url: str | None) -> str | None:
    if not url:
        return None
    host = urlparse(url if "//" in url else "//" + url).netloc.lower().split(":")[0]
    return host[4:] if host.startswith("www.") else (host or None)


def same_org(email_domain: str, company_domain: str) -> bool:
    e, c = email_domain.lower(), company_domain.lower()
    return e == c or e.endswith("." + c) or c.endswith("." + e)


def mx_ok(domain: str) -> bool:
    try:
        import dns.resolver
        return len(dns.resolver.resolve(domain, "MX", lifetime=4)) > 0
    except Exception:
        return False


def find_website(ctx, company: str, hint: str | None) -> str | None:
    if hint and not BOARD_DOMAINS.search(hint):
        return hint
    key = os.getenv("BRAVE_API_KEY")
    if not key:
        return None
    r = ctx.http.get("https://api.search.brave.com/res/v1/web/search", robots=False,
                     headers={"X-Subscription-Token": key, "Accept": "application/json"},
                     params={"q": f"{company} Toronto restaurant official website", "count": 8, "country": "ca"})
    if not r or r.status_code != 200:
        return None
    for res in r.json().get("web", {}).get("results", []):
        if not BOARD_DOMAINS.search(res.get("url", "")):
            tokens = [t for t in norm_company(company).split() if len(t) > 2]
            if tokens and any(t in domain_of(res["url"]) for t in tokens):
                return res["url"]
    return None


def _extract(html: str, page_url: str, company_domain: str, out: dict):
    soup = BeautifulSoup(html, "html.parser")
    found = set()
    for a in soup.select('a[href^="mailto:"]'):
        found.add(a["href"][7:].split("?")[0].strip().lower())
    text = re.sub(r"\s*[\[\(]\s*at\s*[\]\)]\s*", "@", soup.get_text(" "), flags=re.I)
    found.update(e.lower() for e in EMAIL_RX.findall(text))
    for e in found:
        if not EMAIL_RX.fullmatch(e):
            continue
        local, dom = e.split("@")
        if BAD_LOCAL.match(local) or not same_org(dom, company_domain):
            continue          # third-party / not the company's own domain -> never used
        conf = "high" if HIGH.match(local) else ("medium" if MEDIUM.search(local) else "low")
        if e not in out or ["low", "medium", "high"].index(conf) > ["low", "medium", "high"].index(out[e]["confidence"]):
            out[e] = {"email": e, "confidence": conf, "source_url": page_url, "role": local}


def scrape_site(ctx, website: str, max_pages: int = 6) -> list[dict]:
    dom = domain_of(website)
    if not dom:
        return []
    base = website if website.startswith("http") else "https://" + website
    r = ctx.http.get(base)
    if not r or r.status_code != 200:
        return []
    out: dict[str, dict] = {}
    _extract(r.text, base, dom, out)
    soup = BeautifulSoup(r.text, "html.parser")
    links = []
    for a in soup.find_all("a", href=True):
        u = urljoin(base, a["href"])
        if domain_of(u) and same_org(domain_of(u), dom) and LINK_HINT.search(a["href"] + a.get_text()) and u not in links:
            links.append(u)
    for u in links[: max_pages - 1]:
        pr = ctx.http.get(u)
        if pr and pr.status_code == 200:
            _extract(pr.text, u, dom, out)
    return sorted(out.values(), key=lambda c: ["high", "medium", "low"].index(c["confidence"]))


def from_posting(description: str, company_domain: str | None) -> list[dict]:
    """Emails written INSIDE the job posting ('send your resume to ...') are the most reliable apply channel."""
    out = []
    for e in {x.lower() for x in EMAIL_RX.findall(description or "")}:
        local, dom = e.split("@")
        if BAD_LOCAL.match(local) or dom in ("gmail.com", "hotmail.com", "yahoo.com", "outlook.com"):
            continue   # free-mail addresses in postings are too easy to fake
        conf = "high" if company_domain and same_org(dom, company_domain) else "medium"
        out.append({"email": e, "confidence": conf, "source_url": "job posting", "role": local})
    return out


def linkedin_hint(company: str) -> str:
    """LinkedIn is never scraped (ToS). A ready-made search link is saved for quick manual follow-up."""
    return ("https://www.linkedin.com/search/results/people/?keywords=" +
            quote_plus(f"{company} recruiter OR hiring manager OR HR") + "&origin=GLOBAL_SEARCH_HEADER")


def find_contacts(ctx, job, company_row) -> list[dict]:
    """Posting address -> company website. Each result is MX-checked. Returns best-first; may be empty."""
    website = find_website(ctx, job.company, job.company_website or company_row.website)
    company_row.website = website or company_row.website
    company_row.domain = domain_of(website) if website else company_row.domain
    cands = from_posting(job.description, company_row.domain)
    if website:
        cands += scrape_site(ctx, website)
    seen, final = set(), []
    for c in sorted(cands, key=lambda c: ["high", "medium", "low"].index(c["confidence"])):
        if c["email"] in seen:
            continue
        seen.add(c["email"])
        c["mx_ok"] = mx_ok(c["email"].split("@")[1])
        if c["mx_ok"]:
            final.append(c)
    return final
