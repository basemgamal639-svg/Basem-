"""Mailer interface: GmailMailer (real, OAuth) and DryRunMailer (writes .eml files, sends nothing)."""
from __future__ import annotations
import base64, re, uuid
from datetime import datetime
from email.message import EmailMessage
from pathlib import Path

SCOPES = ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.readonly"]


def build_mime(sender: str, to: str, subject: str, body: str, attachment: Path | None, in_reply_to: str | None = None) -> EmailMessage:
    m = EmailMessage()
    m["From"], m["To"], m["Subject"] = sender, to, subject
    if in_reply_to:
        m["In-Reply-To"] = m["References"] = in_reply_to
    m.set_content(body)
    if attachment:
        m.add_attachment(Path(attachment).read_bytes(), maintype="application", subtype="pdf", filename=Path(attachment).name)
    return m


class DryRunMailer:
    is_real = False

    def __init__(self, outbox: Path, address: str):
        self.outbox, self.my_address = outbox, address
        outbox.mkdir(exist_ok=True)

    def send(self, to, subject, body, attachment=None, thread_id=None, in_reply_to=None):
        mid = "dryrun-" + uuid.uuid4().hex[:12]
        msg = build_mime(self.my_address, to, subject, body, attachment, in_reply_to)
        (self.outbox / f"{datetime.now():%Y%m%d-%H%M%S}-{mid}.eml").write_bytes(bytes(msg))
        return mid, thread_id or mid

    def get_thread(self, thread_id):
        return []


class GmailMailer:
    is_real = True

    def __init__(self, token_path: Path):
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request
        from googleapiclient.discovery import build
        creds = Credentials.from_authorized_user_file(str(token_path), SCOPES)
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            token_path.write_text(creds.to_json())
        self.svc = build("gmail", "v1", credentials=creds, cache_discovery=False)
        self.my_address = self.svc.users().getProfile(userId="me").execute()["emailAddress"].lower()

    def send(self, to, subject, body, attachment=None, thread_id=None, in_reply_to=None):
        msg = build_mime(self.my_address, to, subject, body, attachment, in_reply_to)
        req = {"raw": base64.urlsafe_b64encode(bytes(msg)).decode()}
        if thread_id:
            req["threadId"] = thread_id
        r = self.svc.users().messages().send(userId="me", body=req).execute()
        return r["id"], r["threadId"]

    def get_thread(self, thread_id):
        t = self.svc.users().threads().get(userId="me", id=thread_id, format="metadata",
                                           metadataHeaders=["From", "Subject"]).execute()
        out = []
        for m in t.get("messages", []):
            h = {x["name"].lower(): x["value"] for x in m["payload"].get("headers", [])}
            out.append({"id": m["id"], "from": h.get("from", ""), "subject": h.get("subject", ""),
                        "snippet": m.get("snippet", ""), "ts": int(m["internalDate"]) / 1000})
        return out


def gmail_auth(root: Path) -> None:
    """One-time interactive OAuth. Needs credentials.json (OAuth client of type 'Desktop app') from Google Cloud Console."""
    from google_auth_oauthlib.flow import InstalledAppFlow
    cred = root / "credentials.json"
    if not cred.exists():
        raise SystemExit("credentials.json not found - see README 'Gmail OAuth setup'.")
    creds = InstalledAppFlow.from_client_secrets_file(str(cred), SCOPES).run_local_server(port=0)
    (root / "token.json").write_text(creds.to_json())
    print("Authorised. token.json saved (it stays on this machine and is git-ignored).")


def make_mailer(ctx, kind: str):
    addr = ctx.profile["email"]
    if kind == "gmail" and (ctx.root / "token.json").exists():
        return GmailMailer(ctx.root / "token.json")
    if kind == "gmail":
        print("WARNING: MAILER=gmail but token.json missing -> falling back to dry-run. Run: python -m app.cli gmail-auth")
    return DryRunMailer(ctx.root / "outbox", addr)
