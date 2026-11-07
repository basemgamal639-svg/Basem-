"""Fail if personal ids, live tokens, or private keys are in the published tree."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

ROOT = Path(__file__).resolve().parents[2]
PUMP = ROOT / "pumpdesk"

FORBIDDEN = (
    "6484699796",
    "BASEM514",
    "BEGIN PRIVATE",
    "BEGIN OPENSSH",
    "ghp_",
    "xoxb-",
)
FORBIDDEN_IN_PUMPDESK = FORBIDDEN + ("RuneLavaSeal",)


def _text_files(root: Path):
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if path.name == "test_secrets_grep.py":
            continue
        if any(part in path.parts for part in (".git", ".venv", "__pycache__", "node_modules", "logs", "data")):
            continue
        if path.suffix not in {".py", ".md", ".txt", ".example", ".service", ".sh", ".html", ".yml", ".json"}:
            continue
        yield path


def test_secrets():
    bad = []
    for path in _text_files(PUMP):
        text = path.read_text(errors="ignore")
        for needle in FORBIDDEN_IN_PUMPDESK:
            if needle in text:
                bad.append(f"{path}: {needle}")
    for path in _text_files(ROOT):
        if "pumpdesk" in path.parts or "desk" in path.parts:
            continue
        text = path.read_text(errors="ignore")
        for needle in ("6484699796", "BASEM514"):
            if needle in text:
                bad.append(f"{path}: {needle}")
    example = (PUMP / ".env.example").read_text()
    assert "DESK_OWNER_WALLET=" in example
    assert "APP_TOKEN=" not in example
    assert "6484699796" not in example
    ignore = (ROOT / ".gitignore").read_text()
    assert "pumpdesk/data/" in ignore
    assert ".secrets/" in ignore or "pumpdesk/.secrets/" in ignore
    assert not bad, bad
    print("PASS secrets scan")


if __name__ == "__main__":
    test_secrets()
