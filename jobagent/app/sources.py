"""Job sources. Only permitted channels are used:
 * Adzuna API (official, free key) - indexes Job Bank, Workopolis-type boards and employer sites
 * JSearch API on RapidAPI (official) - aggregates Google for Jobs, which includes Indeed/LinkedIn/Glassdoor listings
 * Career pages you list in config.yaml (robots.txt respected)
 * `add-job` CLI / dashboard import for anything you find by hand
Direct scraping of Indeed, LinkedIn and Glassdoor is deliberately NOT implemented: their terms forbid it.
"""
from __future__ import annotations
import hashlib, os, re
from dataclasses import dataclass
from datetime import datetime, timezone
from urllib.parse import urljoin

from bs4 import BeautifulSoup


@dataclass
class RawJob:
    source: str
    external_id: str
    url: str
    title: str
    company: str
    location: str = ""
    description: str = ""
    salary_text: str | None = None
    salary_lo: float | None = None
    salary_hi: float | None = None
    salary_period: str | None = None
    posted_at: datetime | None = None
    company_website: str | None = None


def _dt(s):
    if not s:
        return None
    try:
        d = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
        return d.astimezone(timezone.utc).replace(tzinfo=None) if d.tzinfo else d
    except ValueError:
        return None


def queries(ctx, limit: int) -> list[tuple[str, dict]]:
    s = ctx.cfg["search"]
    titles = [t for group in s["titles"].values() for t in group]
    # management first (priority), then admin
    return [(t, a) for t in titles for a in s["anchors"]][:limit]


class Adzuna:
    name = "adzuna"

    def __init__(self, ctx, app_id, app_key):
        self.ctx, self.id, self.key = ctx, app_id, app_key
        self.cfg = ctx.cfg["search"]["sources"]["adzuna"]

    def fetch(self):
        out = []
        for title, anchor in queries(self.ctx, self.cfg["max_queries_per_run"]):
            r = self.ctx.http.get("https://api.adzuna.com/v1/api/jobs/ca/search/1", robots=False, params={
                "app_id": self.id, "app_key": self.key, "what_phrase": title, "where": anchor["where"],
                "distance": anchor["radius_km"], "max_days_old": self.ctx.cfg["search"]["max_age_days"],
                "results_per_page": 30, "sort_by": "date", "content-type": "application/json"})
            if not r or r.status_code != 200:
                continue
            for j in r.json().get("results", []):
                out.append(RawJob("adzuna", str(j["id"]), j.get("redirect_url", ""), j.get("title", ""),
                                  (j.get("company") or {}).get("display_name", ""),
                                  (j.get("location") or {}).get("display_name", ""), j.get("description", ""),
                                  salary_lo=j.get("salary_min"), salary_hi=j.get("salary_max"), salary_period="year",
                                  posted_at=_dt(j.get("created"))))
        return out


class JSearch:
    name = "jsearch"

    def __init__(self, ctx, key):
        self.ctx, self.key = ctx, key
        self.cfg = ctx.cfg["search"]["sources"]["jsearch"]

    def fetch(self):
        out = []
        for title, anchor in queries(self.ctx, self.cfg["max_queries_per_run"]):
            r = self.ctx.http.get("https://jsearch.p.rapidapi.com/search", robots=False,
                                  headers={"X-RapidAPI-Key": self.key, "X-RapidAPI-Host": "jsearch.p.rapidapi.com"},
                                  params={"query": f"{title} in {anchor['where']}", "date_posted": "week", "country": "ca", "num_pages": 1})
            if not r or r.status_code != 200:
                continue
            for j in r.json().get("data", []):
                loc = ", ".join(x for x in (j.get("job_city"), j.get("job_state")) if x)
                out.append(RawJob("jsearch", j["job_id"], j.get("job_apply_link") or "", j.get("job_title", ""),
                                  j.get("employer_name", ""), loc, j.get("job_description", ""),
                                  salary_lo=j.get("job_min_salary"), salary_hi=j.get("job_max_salary"),
                                  salary_period=j.get("job_salary_period"), posted_at=_dt(j.get("job_posted_at_datetime_utc")),
                                  company_website=j.get("employer_website")))
        return out


class CareerPages:
    """Reads career pages YOU list. Only follows links whose text looks like a target title."""
    name = "career_pages"

    def __init__(self, ctx):
        self.ctx = ctx
        self.pages = ctx.cfg["search"]["sources"]["career_pages"].get("pages") or []

    def fetch(self):
        from .matching import classify_title
        out = []
        for p in self.pages:
            r = self.ctx.http.get(p["url"])
            if not r or r.status_code != 200:
                continue
            soup = BeautifulSoup(r.text, "html.parser")
            for a in soup.find_all("a", href=True):
                title = a.get_text(" ", strip=True)
                if not title or not classify_title(title, p["company"], p["company"]):
                    continue
                url = urljoin(p["url"], a["href"])
                page = self.ctx.http.get(url)
                text = BeautifulSoup(page.text, "html.parser").get_text(" ", strip=True)[:6000] if page and page.status_code == 200 else ""
                out.append(RawJob("career_page", hashlib.sha1(url.encode()).hexdigest()[:16], url, title, p["company"],
                                  p.get("location", "Toronto, ON"), text, company_website=p["url"]))
        return out


def build_sources(ctx) -> list:
    cfg = ctx.cfg["search"]["sources"]
    out = []
    if cfg["adzuna"]["enabled"] and os.getenv("ADZUNA_APP_ID") and os.getenv("ADZUNA_APP_KEY"):
        out.append(Adzuna(ctx, os.environ["ADZUNA_APP_ID"], os.environ["ADZUNA_APP_KEY"]))
    if cfg["jsearch"]["enabled"] and os.getenv("RAPIDAPI_KEY"):
        out.append(JSearch(ctx, os.environ["RAPIDAPI_KEY"]))
    if cfg["career_pages"]["enabled"] and cfg["career_pages"].get("pages"):
        out.append(CareerPages(ctx))
    return out
