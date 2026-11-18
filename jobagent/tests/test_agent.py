import pytest
from sqlalchemy import select

from app import emailgen, matching, pipeline, report, tracking
from app.db import Application, Company, Contact, Event, Job, Suppression
from .conftest import FakeSource, raw, TZ


def jobs(ctx):
    with ctx.session() as s:
        return {j.title + "|" + j.company: (j.status, j.score, j.reject_reason) for j in s.scalars(select(Job)).all()}


# ------------------------------------------------------------ matching rules
@pytest.mark.parametrize("desc,frag", [
    ("Bilingual (French/English) is required for this role.", "French"),
    ("Candidate must be fluent in French.", "French"),
    ("Minimum 3 years of restaurant management experience required.", "years"),
    ("2+ years supervisory experience in food service.", "years"),
    ("Valid Smart Serve certificate is required.", "Smart Serve"),
    ("Bachelor's degree is required.", "bachelor"),
    ("Proven management experience in a restaurant.", "management"),
])
def test_hard_rejects(ctx, desc, frag):
    r = matching.hard_rejects("Restaurant Manager", desc, ctx.profile, ctx.cfg)
    assert r and frag.lower() in r[0].lower()


@pytest.mark.parametrize("desc", [
    "French is an asset.", "Smart Serve preferred, willing to obtain.", "5 years of experience an asset.",
    "Food handler certificate or willingness to obtain.", "English is the working language. No experience necessary, we train.",
])
def test_soft_requirements_not_rejected(ctx, desc):
    assert matching.hard_rejects("Admin", desc, ctx.profile, ctx.cfg) == []


def test_title_classification():
    assert matching.classify_title("Assistant Restaurant Manager")[1] == "assistant_manager"
    assert matching.classify_title("Restaurant General Manager")[1] == "restaurant_manager"
    assert matching.classify_title("Receptionist")[1] == "admin_assistant"
    assert matching.classify_title("Operations Coordinator")[1] == "office_operations"
    assert matching.classify_title("Assistant Manager", "retail clothing store") is None          # not hospitality
    assert matching.classify_title("Assistant Manager", "busy restaurant") [1] == "assistant_manager"
    assert matching.classify_title("Senior Operations Manager") is None
    assert matching.classify_title("Software Engineer") is None


def test_location_filter(ctx):
    c = ctx.cfg["locations"]
    assert matching.location_ok("North York, ON", c) and matching.location_ok("Oakville, Ontario", c)
    assert not matching.location_ok("Montreal, QC", c) and not matching.location_ok("Ottawa, ON", c)


def test_salary_parse():
    assert matching.parse_salary("$20 - $24 per hour")[0] == pytest.approx(20 * 37.5 * 52)
    assert matching.parse_salary(None, 45000, 55000, "year") == (45000, 55000)


# ------------------------------------------------------------ pipeline: discovery
def test_ingest_dedupes_and_filters(ctx):
    st = {}
    pipeline.ingest(ctx, [raw(), raw(ext="other-id", url="https://x/y"),                       # same company+title+city -> duplicate
                          raw(title="Receptionist", company="Dental Co", loc="Montreal, QC"),   # wrong place
                          raw(title="Receptionist", company="Old Co", age_days=9),              # older than 7 days
                          raw(title="Receptionist", company="French Co", desc="French required."),
                          raw(title="Cook", company="Cook Co")], st)
    assert st["duplicates"] == 1 and st["too_old"] == 1
    j = jobs(ctx)
    assert j["Receptionist|Dental Co"][0] == "rejected" and "outside" in j["Receptionist|Dental Co"][2]
    assert j["Receptionist|French Co"][0] == "rejected" and "French" in j["Receptionist|French Co"][2]
    assert j["Cook|Cook Co"][0] == "rejected"
    assert "Receptionist|Old Co" not in j


def test_scores_use_weights_and_threshold(ctx):
    pipeline.ingest(ctx, [raw(title="Administrative Assistant", company="Acme Office", desc="Admin assistant, data entry, documentation, scheduling, customer service. Training provided. Permanent full-time with career growth. English.")], {})
    s, score, _ = jobs(ctx)["Administrative Assistant|Acme Office"]
    assert score >= 75 and s == "new"


# ------------------------------------------------------------ contacts: never guess
def test_contacts_only_from_own_domain_and_never_guessed(ctx):
    pipeline.ingest(ctx, [raw(company="Good Grill Inc."), raw(title="Receptionist", company="NoMail Co", site="https://nomail.example/")], {})
    st = {}
    pipeline.prepare_drafts(ctx, st)
    with ctx.session() as s:
        emails = {c.email: c.confidence for c in s.scalars(select(Contact))}
        assert emails == {"careers@goodgrill.example": "high", "info@goodgrill.example": "low"}   # no thirdparty, no noreply, nothing invented
        nm = s.scalar(select(Job).where(Job.company == "NoMail Co"))
        assert nm.status == "no_contact" and "linkedin.com" in nm.notes and s.scalar(select(Application).where(Application.job_id == nm.id)) is None
        app = s.scalar(select(Application))
        assert app.to_email == "careers@goodgrill.example" and app.status == "draft"


def test_email_from_posting_used(ctx):
    pipeline.ingest(ctx, [raw(site=None, desc="Join our restaurant team. Customer service, scheduling, food safety, training. Career growth permanent. Send your resume to hiring@staffing-agency.example")], {})
    pipeline.prepare_drafts(ctx, {})
    with ctx.session() as s:
        assert s.scalar(select(Contact)).confidence == "medium"


# ------------------------------------------------------------ email content
def test_email_content_and_honesty(ctx):
    pipeline.ingest(ctx, [raw(title="Restaurant General Manager", desc="Lead our busy restaurant. Scheduling, food safety, customer service, training. Career growth, permanent, full-time.")], {})
    with ctx.session() as s:
        job = s.scalar(select(Job))
        m = emailgen.build_email(ctx, job)
    assert "Restaurant General Manager" in m["body"] and "Good Grill" in m["body"] and "interview" in m["body"]
    assert "rather than in a formal management title" in m["body"]          # truthful about level
    assert "Dear Hiring Team" in m["body"] and "relocating" in m["body"]
    assert not any(w.startswith(("forbidden", "unsupported")) for w in m["warnings"])
    assert m["subject"].startswith("Application for Restaurant General Manager at Good Grill")


def test_guard_blocks_invented_claims(ctx):
    for txt in ["I hold a bachelor degree", "I have 6 years of experience", "I am a Certified Smart Serve bartender", "I managed a team of 10"]:
        assert emailgen.guard(txt, ctx.profile), txt
    assert not emailgen.guard("I have about four years of restaurant experience", ctx.profile)


def test_llm_paragraph_rejected_if_it_invents(ctx):
    class Liar:
        def json(self, s, u, max_tokens=0): return {"paragraph": "With 8 years of management experience and a diploma, I excel."}
    ctx.llm = Liar()
    pipeline.ingest(ctx, [raw()], {})
    with ctx.session() as s:
        m = emailgen.build_email(ctx, s.scalar(select(Job)))
    assert m["llm_used"] is False and "diploma" not in m["body"]


def test_four_template_kinds_differ(ctx):
    bodies = set()
    for t, c in [("Restaurant Manager", "A"), ("Assistant Restaurant Manager", "B"), ("Administrative Assistant", "C"), ("Operations Coordinator", "D")]:
        pipeline.ingest(ctx, [raw(title=t, company=f"{c} Restaurant Co")], {})
    with ctx.session() as s:
        for j in s.scalars(select(Job)).all():
            bodies.add(j.template_kind)
            assert emailgen.build_email(ctx, j)["body"]
    assert bodies == {"restaurant_manager", "assistant_manager", "admin_assistant", "office_operations"}


# ------------------------------------------------------------ approval mode / sending
def cycle_with(ctx, jobs_):
    ctx.sources = [FakeSource(jobs_)]
    return pipeline.run_cycle(ctx, "test")


def test_approval_mode_sends_nothing_until_approved(ctx):
    r = cycle_with(ctx, [raw()])
    assert r["drafted"] == 1 and "sent" not in r and ctx.mailer.sent == []
    with ctx.session() as s:
        aid = s.scalar(select(Application.id))
    ok, why = pipeline.send_application(ctx, aid, manual=True)
    assert ok and len(ctx.mailer.sent) == 1 and ctx.mailer.sent[0]["attachment"].name == "Basem_Gamal_Assistant_Manager_CV.pdf"
    assert jobs(ctx)["Assistant Restaurant Manager|Good Grill Inc."][0] == "applied"


def test_never_apply_twice_same_job_or_company(ctx):
    cycle_with(ctx, [raw()])
    with ctx.session() as s:
        aid = s.scalar(select(Application.id))
    pipeline.send_application(ctx, aid, manual=True)
    cycle_with(ctx, [raw(), raw(title="Receptionist", company="Good Grill Inc.", ext="z")])    # same job again + 2nd job same company
    assert len(ctx.mailer.sent) == 1
    with ctx.session() as s:
        assert s.scalar(select(Job.status).where(Job.title == "Receptionist")) == "duplicate_company"


def test_closed_job_blocks_send(ctx):
    cycle_with(ctx, [raw(url="https://jobs.example/dead")])
    with ctx.session() as s:
        aid = s.scalar(select(Application.id))
    ok, why = pipeline.send_application(ctx, aid, manual=True)
    assert not ok and "no longer active" in why and ctx.mailer.sent == []
    assert jobs(ctx)["Assistant Restaurant Manager|Good Grill Inc."][0] == "closed"


def test_unverifiable_job_needs_human_not_auto(ctx):
    """Site blocks bots via robots.txt -> we cannot confirm the job is live: auto-send refuses, a human may still approve."""
    ctx.cfg["email"]["unlock_auto_after_real_sends"] = 0
    pipeline.set_mode(ctx, "auto")
    cycle_with(ctx, [raw(url="https://blocked.example/job")])
    assert ctx.mailer.sent == []
    with ctx.session() as s:
        a = s.scalar(select(Application))
        assert "unverified" in a.error
        aid = a.id
    assert pipeline.send_application(ctx, aid, manual=True)[0]            # human explicitly vouches for it


def test_auto_mode_locked_until_real_sends(ctx):
    with pytest.raises(ValueError, match="locked"):
        pipeline.set_mode(ctx, "auto")


def test_auto_mode_sends_only_high_confidence_clean_emails(ctx):
    ctx.cfg["email"]["unlock_auto_after_real_sends"] = 0
    pipeline.set_mode(ctx, "auto")
    r = cycle_with(ctx, [raw(), raw(title="Receptionist", company="Corner Cafe", site=None, ext="c", desc="Receptionist, customer service, scheduling, documentation. Training provided. Permanent, career growth. Email hr@cornercafe.example", url="https://jobs.example/live")])
    # Good Grill: careers@ (high) -> auto-sent.  Corner Cafe: email in posting but no company site -> medium -> held for approval
    assert [m["to"] for m in ctx.mailer.sent] == ["careers@goodgrill.example"]
    with ctx.session() as s:
        assert s.scalar(select(Application.status).where(Application.to_email == "hr@cornercafe.example")) == "draft"


def test_auto_blocked_when_email_has_warnings(ctx):
    ctx.cfg["email"]["unlock_auto_after_real_sends"] = 0
    ctx.profile["relocation_sentence"] = ""
    pipeline.set_mode(ctx, "auto")
    cycle_with(ctx, [raw()])
    assert ctx.mailer.sent == []


def test_daily_cap(ctx):
    ctx.cfg["email"]["daily_send_cap"] = 1
    cycle_with(ctx, [raw(company="A Restaurant"), raw(company="B Restaurant")])
    with ctx.session() as s:
        ids = s.scalars(select(Application.id)).all()
    res = [pipeline.send_application(ctx, i, manual=True)[0] for i in ids]
    assert res == [True, False]


def test_suppressed_address_never_emailed(ctx):
    cycle_with(ctx, [raw()])
    with ctx.session() as s:
        s.add(Suppression(email="careers@goodgrill.example"))
        aid = s.scalar(select(Application.id))
    assert not pipeline.send_application(ctx, aid, manual=True)[0]


def test_send_failure_recorded(ctx):
    cycle_with(ctx, [raw()])
    def boom(*a, **k): raise RuntimeError("smtp down")
    ctx.mailer.send = boom
    with ctx.session() as s:
        aid = s.scalar(select(Application.id))
    ok, why = pipeline.send_application(ctx, aid, manual=True)
    assert not ok
    with ctx.session() as s:
        assert s.get(Application, aid).status == "failed" and "smtp down" in s.get(Application, aid).error


# ------------------------------------------------------------ replies, bounces, follow-ups
def sent_app(ctx):
    cycle_with(ctx, [raw()])
    with ctx.session() as s:
        aid = s.scalar(select(Application.id))
    assert pipeline.send_application(ctx, aid, manual=True)[0]
    return aid


def test_business_day_math():
    from datetime import datetime
    assert tracking.add_business_days(datetime(2026, 11, 17), 4) == datetime(2026, 11, 23)     # Tue -> next Mon
    assert tracking.add_business_days(datetime(2026, 11, 20), 4) == datetime(2026, 11, 26)     # Fri -> Thu


def test_followup_after_4_business_days_only_if_unanswered(ctx):
    sent_app(ctx)
    st = {}
    tracking.queue_followups(ctx, st)
    assert st == {}                                              # too early
    from datetime import datetime
    ctx.clock[0] = datetime(2026, 11, 23, 9, 0, tzinfo=TZ)       # 4 business days later
    tracking.queue_followups(ctx, st)
    assert st["followups_drafted"] == 1
    tracking.queue_followups(ctx, st)
    assert st["followups_drafted"] == 1                          # max one follow-up
    with ctx.session() as s:
        f = s.scalar(select(Application).where(Application.kind == "followup"))
        assert f.status == "draft" and f.subject.startswith("Re: Application for")
        fid = f.id
    ok, _ = pipeline.send_application(ctx, fid, manual=True)
    assert ok and ctx.mailer.sent[-1]["thread"] == "t1"           # same Gmail thread


def test_no_followup_when_employer_replied(ctx):
    aid = sent_app(ctx)
    ctx.mailer.threads["t1"] = [{"id": "m1", "from": "me", "subject": "", "snippet": "", "ts": 0},
                                {"id": "r1", "from": "HR <careers@goodgrill.example>", "subject": "Re: Application", "snippet": "Thanks! We would like to schedule a call - what is your availability?", "ts": 1763400000}]
    st = {}
    tracking.sync_replies(ctx, st)
    from datetime import datetime
    ctx.clock[0] = datetime(2026, 11, 30, tzinfo=TZ)
    tracking.queue_followups(ctx, st)
    assert "followups_drafted" not in st
    assert jobs(ctx)["Assistant Restaurant Manager|Good Grill Inc."][0] == "interview"
    assert report.stats(ctx)["interviews"] == 1


def test_classification():
    c = tracking.classify_reply
    assert c("Mail Delivery Subsystem <mailer-daemon@googlemail.com>", "Delivery Status Notification (Failure)", "") == "bounce"
    assert c("hr@x.com", "Re:", "Unfortunately we are moving forward with other candidates") == "employer_rejected" or c("hr@x.com", "Re:", "Unfortunately we are moving forward with other candidates") == "rejection"
    assert c("hr@x.com", "Re:", "Please remove me from your list, do not contact") == "optout"
    assert c("hr@x.com", "Re:", "Received, thanks") == "reply"


def test_bounce_marks_contact_and_retries_next(ctx):
    sent_app(ctx)
    ctx.mailer.threads["t1"] = [{"id": "b1", "from": "Mail Delivery Subsystem <mailer-daemon@googlemail.com>", "subject": "Delivery Status Notification (Failure)", "snippet": "address not found", "ts": 1763400000}]
    tracking.sync_replies(ctx, {})
    with ctx.session() as s:
        assert s.scalar(select(Contact).where(Contact.email == "careers@goodgrill.example")).bounced
        assert s.scalar(select(Company)).contacted_at is None
    pipeline.prepare_drafts(ctx, {})
    with ctx.session() as s:
        d = s.scalar(select(Application).where(Application.status == "draft"))
        assert d and d.to_email == "info@goodgrill.example"      # falls to next VERIFIED address, never a guess


def test_optout_suppresses_company(ctx):
    sent_app(ctx)
    ctx.mailer.threads["t1"] = [{"id": "o1", "from": "careers@goodgrill.example", "subject": "Re", "snippet": "Please do not contact us again", "ts": 1763400000}]
    tracking.sync_replies(ctx, {})
    with ctx.session() as s:
        assert s.get(Suppression, "careers@goodgrill.example") and s.scalar(select(Company)).do_not_contact


def test_report_contents(ctx):
    sent_app(ctx)
    subj, text = report.build_report(ctx)
    assert "1 sent" in subj and "Good Grill" in text and "careers@goodgrill.example" in text and "UPCOMING FOLLOW-UPS" in text


def test_pause_stops_everything(ctx):
    from app.db import set_setting
    with ctx.session() as s:
        set_setting(s, "paused", "1")
    assert cycle_with(ctx, [raw()]) == {"skipped": "paused"}
