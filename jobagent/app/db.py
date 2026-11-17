"""SQLAlchemy models. Works on SQLite (default) and PostgreSQL/Supabase (set DATABASE_URL)."""
from __future__ import annotations
from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker


class Base(DeclarativeBase):
    pass


class Company(Base):
    __tablename__ = "companies"
    id: Mapped[int] = mapped_column(primary_key=True)
    name_norm: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(300))
    website: Mapped[Optional[str]] = mapped_column(String(500))
    domain: Mapped[Optional[str]] = mapped_column(String(200))
    do_not_contact: Mapped[bool] = mapped_column(Boolean, default=False)
    contacted_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    contacts: Mapped[list["Contact"]] = relationship(back_populates="company")


class Contact(Base):
    __tablename__ = "contacts"
    __table_args__ = (UniqueConstraint("company_id", "email"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))
    email: Mapped[str] = mapped_column(String(300))
    name: Mapped[Optional[str]] = mapped_column(String(200))
    role: Mapped[Optional[str]] = mapped_column(String(200))
    source_url: Mapped[Optional[str]] = mapped_column(String(600))
    confidence: Mapped[str] = mapped_column(String(10))       # high | medium | low
    mx_ok: Mapped[bool] = mapped_column(Boolean, default=False)
    bounced: Mapped[bool] = mapped_column(Boolean, default=False)
    company: Mapped[Company] = relationship(back_populates="contacts")


class Job(Base):
    __tablename__ = "jobs"
    __table_args__ = (UniqueConstraint("source", "external_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(40))
    external_id: Mapped[str] = mapped_column(String(300))
    fingerprint: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    url: Mapped[str] = mapped_column(String(1000))
    title: Mapped[str] = mapped_column(String(300))
    company: Mapped[str] = mapped_column(String(300))
    company_id: Mapped[Optional[int]] = mapped_column(ForeignKey("companies.id"))
    company_website: Mapped[Optional[str]] = mapped_column(String(500))
    location: Mapped[str] = mapped_column(String(300), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    salary_text: Mapped[Optional[str]] = mapped_column(String(200))
    salary_min: Mapped[Optional[float]] = mapped_column(Float)      # annualised CAD
    salary_max: Mapped[Optional[float]] = mapped_column(Float)
    posted_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    discovered_at: Mapped[datetime] = mapped_column(DateTime)
    category: Mapped[Optional[str]] = mapped_column(String(40))     # restaurant_management | administrative
    template_kind: Mapped[Optional[str]] = mapped_column(String(40))
    score: Mapped[Optional[float]] = mapped_column(Float)
    breakdown: Mapped[Optional[dict]] = mapped_column(JSON)
    verdict: Mapped[Optional[str]] = mapped_column(String(20))      # suitable | maybe | rejected
    reject_reason: Mapped[Optional[str]] = mapped_column(Text)
    # new | rejected | maybe | no_contact | duplicate_company | drafted | applied | followup_due | replied |
    # interview | employer_rejected | bounced | closed | ignored
    status: Mapped[str] = mapped_column(String(30), default="new", index=True)
    notes: Mapped[Optional[str]] = mapped_column(Text)              # manual follow-up hints (e.g. LinkedIn search URL)
    last_checked_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    applications: Mapped[list["Application"]] = relationship(back_populates="job")


class Application(Base):
    __tablename__ = "applications"
    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id"))
    contact_id: Mapped[Optional[int]] = mapped_column(ForeignKey("contacts.id"))
    kind: Mapped[str] = mapped_column(String(12), default="initial")     # initial | followup
    to_email: Mapped[str] = mapped_column(String(300))
    subject: Mapped[str] = mapped_column(String(400))
    body: Mapped[str] = mapped_column(Text)
    # draft | approved | sent | failed | rejected | cancelled
    status: Mapped[str] = mapped_column(String(12), default="draft", index=True)
    llm_used: Mapped[bool] = mapped_column(Boolean, default=False)
    dry_run: Mapped[bool] = mapped_column(Boolean, default=False)
    warnings: Mapped[Optional[list]] = mapped_column(JSON)
    gmail_message_id: Mapped[Optional[str]] = mapped_column(String(100))
    gmail_thread_id: Mapped[Optional[str]] = mapped_column(String(100))
    error: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    job: Mapped[Job] = relationship(back_populates="applications")
    contact: Mapped[Optional[Contact]] = relationship()


class Event(Base):
    """Replies, bounces, interviews... found by the Gmail sync."""
    __tablename__ = "events"
    id: Mapped[int] = mapped_column(primary_key=True)
    application_id: Mapped[int] = mapped_column(ForeignKey("applications.id"))
    gmail_message_id: Mapped[str] = mapped_column(String(100), unique=True)
    kind: Mapped[str] = mapped_column(String(20))   # reply | bounce | interview | rejection | optout
    snippet: Mapped[str] = mapped_column(Text, default="")
    at: Mapped[datetime] = mapped_column(DateTime)


class Suppression(Base):
    __tablename__ = "suppression"
    email: Mapped[str] = mapped_column(String(300), primary_key=True)
    reason: Mapped[str] = mapped_column(String(200), default="")


class Setting(Base):
    __tablename__ = "settings"
    key: Mapped[str] = mapped_column(String(60), primary_key=True)
    value: Mapped[str] = mapped_column(Text)


class Run(Base):
    __tablename__ = "runs"
    id: Mapped[int] = mapped_column(primary_key=True)
    label: Mapped[str] = mapped_column(String(40))
    started_at: Mapped[datetime] = mapped_column(DateTime)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    stats: Mapped[Optional[dict]] = mapped_column(JSON)
    errors: Mapped[Optional[list]] = mapped_column(JSON)


def make_session_factory(url: str):
    engine = create_engine(url, future=True, pool_pre_ping=True)
    Base.metadata.create_all(engine)
    return sessionmaker(engine, expire_on_commit=False)


def get_setting(s: Session, key: str, default: str = "") -> str:
    row = s.get(Setting, key)
    return row.value if row else default


def set_setting(s: Session, key: str, value: str) -> None:
    row = s.get(Setting, key)
    if row:
        row.value = value
    else:
        s.add(Setting(key=key, value=value))
