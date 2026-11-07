"""Web Push with VAPID. Private key never logged."""
from __future__ import annotations

import json
import logging
import os
from typing import TYPE_CHECKING

log = logging.getLogger("webpush")

if TYPE_CHECKING:
    from db import DB


class WebPush:
    def __init__(self, db: "DB"):
        self.db = db
        self.public = os.environ.get("VAPID_PUBLIC_KEY", "")
        self.private = os.environ.get("VAPID_PRIVATE_KEY", "")
        self.contact = os.environ.get("VAPID_CONTACT", "mailto:desk@localhost")

    async def send(self, body: str, url: str | None = None):
        if not self.private or not self.public:
            return
        try:
            from pywebpush import webpush, WebPushException
        except ImportError:
            log.warning("pywebpush not installed")
            return
        payload = json.dumps({"title": "Grok Bot · now", "body": body, "url": url or "https://pump.fun"})
        for sub in self.db.all_push_subs():
            subscription = {
                "endpoint": sub["endpoint"],
                "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
            }
            try:
                webpush(
                    subscription_info=subscription,
                    data=payload,
                    vapid_private_key=self.private,
                    vapid_claims={"sub": self.contact},
                )
            except Exception as e:
                status = getattr(getattr(e, "response", None), "status_code", None)
                if status == 410:
                    self.db.delete_push_sub(sub["endpoint"])
                else:
                    log.warning("webpush error endpoint=…%s", sub["endpoint"][-12:])
