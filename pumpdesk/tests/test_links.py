"""Every coin URL is pump.fun/coin/... — no FOMO host, no referral query."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from links import SIGNUP_URL, coin_url, profile_url

FORBIDDEN_HOST = "fomo" + ".family"
FORBIDDEN_REF = "savi" + "pww"

def test_links():
    assert SIGNUP_URL == "https://pump.fun"
    u = coin_url("So11111111111111111111111111111111111111112", "solana")
    assert u == "https://pump.fun/coin/So11111111111111111111111111111111111111112"
    assert FORBIDDEN_HOST not in u.lower()
    assert FORBIDDEN_REF not in u
    assert "r=" not in u
    bad = coin_url("abc", "martian")
    assert bad == "https://pump.fun"
    p = profile_url("@examplehandle")
    assert p == "https://pump.fun/profile/examplehandle"
    root = Path(__file__).resolve().parents[1]
    hits = []
    for path in root.rglob("*"):
        if path.is_dir():
            continue
        if path.resolve() == Path(__file__).resolve():
            continue
        if any(x in path.parts for x in (".venv", ".secrets", "__pycache__", "logs", "data", "bin")):
            continue
        if path.suffix not in {".py", ".js", ".html", ".css", ".json", ".txt", ".md"}:
            continue
        try:
            text = path.read_text(errors="ignore")
        except Exception:
            continue
        if FORBIDDEN_HOST in text or FORBIDDEN_REF in text:
            hits.append(str(path))
    assert not hits, f"FOMO leftovers: {hits}"
    print("PASS test_links")

if __name__ == "__main__":
    test_links()
