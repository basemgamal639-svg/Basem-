import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx, pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app import contacts, db, http as httpmod, settings, sources  # noqa: E402

TZ = ZoneInfo("America/Toronto")

SITE = {
    "https://goodgrill.example/": '<a href="/careers">Careers</a><a href="/contact">Contact</a>',
    "https://goodgrill.example/careers": 'Join us! Send resumes to <a href="mailto:Careers@goodgrill.example">us</a> or spam@thirdparty.com',
    "https://goodgrill.example/contact": "info@goodgrill.example  noreply@goodgrill.example",
    "https://nomail.example/": "<p>Welcome. No emails here.</p>",
}
LIVE_JOBS = {"https://jobs.example/live": "<h1>Restaurant Manager</h1> Apply now", "https://jobs.example/dead": "Sorry, this job is no longer available"}


def handler(request: httpx.Request) -> httpx.Response:
    u = str(request.url)
    if u == "https://blocked.example/robots.txt":
        return httpx.Response(200, text="User-agent: *\nDisallow: /")
    if u.endswith("/robots.txt"):
        return httpx.Response(404)
    if u in SITE:
        return httpx.Response(200, text=SITE[u])
    if u in LIVE_JOBS:
        return httpx.Response(200, text=LIVE_JOBS[u])
    return httpx.Response(404, text="nope")


class FakeMailer:
    is_real = True
    my_address = "basemgamal639@gmail.com"

    def __init__(self):
        self.sent, self.threads = [], {}

    def send(self, to, subject, body, attachment=None, thread_id=None, in_reply_to=None):
        assert attachment and Path(attachment).name.endswith(".pdf") or to == self.my_address  # CV always attached to applications
        mid = f"m{len(self.sent) + 1}"
        self.sent.append(dict(to=to, subject=subject, body=body, attachment=attachment, thread=thread_id, id=mid))
        return mid, thread_id or f"t{len(self.sent)}"

    def get_thread(self, tid):
        return self.threads.get(tid, [])


class FakeSource:
    name = "fake"

    def __init__(self, jobs):
        self.jobs = jobs

    def fetch(self):
        return self.jobs


@pytest.fixture
def ctx(tmp_path, monkeypatch):
    monkeypatch.setattr(contacts, "mx_ok", lambda d: True)
    c = settings.Ctx(cfg=settings.load_yaml("config.yaml"), profile=settings.load_yaml("profile.yaml"),
                     SessionLocal=db.make_session_factory(f"sqlite:///{tmp_path}/t.db"),
                     http=httpmod.Http(httpx.Client(transport=httpx.MockTransport(handler), follow_redirects=True)))
    c.mailer = FakeMailer()
    c.sleep_fn = lambda s: None
    c.clock = [datetime(2026, 11, 17, 8, 0, tzinfo=TZ)]   # Tuesday
    c.now_fn = lambda: c.clock[0]
    c.profile["relocation_sentence"] = "I am relocating to the Greater Toronto Area and can start immediately."
    c.root = Path(__file__).resolve().parent.parent
    (tmp_path / "cv").mkdir()
    return c


def raw(title="Assistant Restaurant Manager", company="Good Grill Inc.", loc="Mississauga, ON", desc="", url="https://jobs.example/live", site="https://goodgrill.example/", age_days=1, ext=None, **kw):
    posted = (datetime(2026, 11, 17, 8, 0, tzinfo=TZ) - timedelta(days=age_days)).astimezone(timezone.utc).replace(tzinfo=None)
    return sources.RawJob("fake", ext or f"{title}-{company}", url, title, company, loc, desc or "Join our busy restaurant team. Customer service, scheduling, food safety. Career growth, full-time permanent. Training provided.",
                          posted_at=posted, company_website=site, **kw)
