from fastapi.testclient import TestClient
from sqlalchemy import select

from app import pipeline
from app.db import Application
from app.web import create_app
from .test_agent import cycle_with
from .conftest import raw


def test_dashboard_flow(ctx):
    cycle_with(ctx, [raw(), raw(title="Receptionist", company="Montreal Co", loc="Montreal, QC")])
    c = TestClient(create_app(ctx))
    assert "Job Agent" in c.get("/").text
    ov = c.get("/api/overview").json()
    assert ov["mode"] == "approval" and ov["stats"]["pending_approval"] == 1 and ov["stats"]["jobs_discovered"] == 2
    rows = c.get("/api/jobs").json()
    assert [r["company"] for r in rows] == ["Good Grill Inc."]                       # unsuitable hidden by default
    assert c.get("/api/jobs?include_rejected=true").json().__len__() == 2
    assert c.get("/api/jobs?category=administrative").json() == []
    assert c.get("/api/jobs?location=mississauga").json()[0]["hr_email"] == "careers@goodgrill.example"
    d = c.get("/api/applications").json()[0]
    assert c.put(f"/api/applications/{d['id']}", json={"body": d["body"] + "\nI hold a bachelor degree."}).json()["warnings"]
    r = c.post(f"/api/applications/{d['id']}/approve").json()                        # fact-check blocks it
    assert r["sent"] is False and "fact-check" in r["message"] and ctx.mailer.sent == []
    c.put(f"/api/applications/{d['id']}", json={"body": d["body"]})
    assert c.post(f"/api/applications/{d['id']}/approve").json()["sent"] is True
    assert c.post("/api/mode", json={"mode": "auto"}).status_code == 400            # still locked
    assert c.get("/api/overview").json()["stats"]["applications_sent"] == 1


def test_token_required_when_set(ctx, monkeypatch):
    monkeypatch.setenv("DASHBOARD_TOKEN", "s3cret")
    c = TestClient(create_app(ctx))
    assert c.get("/api/overview").status_code == 401
    assert c.get("/api/overview", headers={"x-token": "s3cret"}).status_code == 200
