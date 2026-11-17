"""Thin Claude wrapper. Returns None when no API key, so every caller has a deterministic fallback."""
from __future__ import annotations
import json, os, re


class ClaudeLLM:
    def __init__(self, api_key: str, model: str):
        import anthropic
        self.client = anthropic.Anthropic(api_key=api_key)
        self.model = model

    def json(self, system: str, user: str, max_tokens: int = 1200) -> dict | None:
        try:
            r = self.client.messages.create(model=self.model, max_tokens=max_tokens, system=system,
                                            messages=[{"role": "user", "content": user}])
            text = "".join(b.text for b in r.content if getattr(b, "type", "") == "text")
            m = re.search(r"\{.*\}", text, re.S)
            return json.loads(m.group(0)) if m else None
        except Exception:
            return None


def make_llm():
    key = os.getenv("ANTHROPIC_API_KEY")
    return ClaudeLLM(key, os.getenv("CLAUDE_MODEL", "claude-sonnet-5-5")) if key else None
