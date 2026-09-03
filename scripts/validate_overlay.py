from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def fail(message: str) -> None:
    raise SystemExit(message)


def validate_lock() -> None:
    data = json.loads((ROOT / "UPSTREAM.lock").read_text(encoding="utf-8"))
    for key in ("repository", "ref", "tracked_branch", "license"):
        if not data.get(key):
            fail(f"UPSTREAM.lock: missing {key}")
    if not re.fullmatch(r"[0-9a-f]{40}", data["ref"]):
        fail("UPSTREAM.lock: ref must be a 40-char git SHA")
    if data["license"] != "AGPL-3.0-or-later":
        fail("UPSTREAM.lock: unexpected Jarvis OS license marker")


def validate_view() -> None:
    root = ROOT / "extensions" / "views" / "shino-command-center"
    for name in ("VIEW.md", "view.js", "view.css", "tool.py"):
        if not (root / name).is_file():
            fail(f"SHINO view: missing {name}")

    text = (root / "VIEW.md").read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        fail("VIEW.md: missing YAML front matter")
    front = text.split("---", 2)[1]
    required = {
        "id": "shino-command-center",
        "name": "SHINO Command Center",
        "version": None,
        "author": None,
        "description": None,
        "glyph": "SHO",
    }
    for key, expected in required.items():
        match = re.search(rf"(?m)^{re.escape(key)}:\s*(.+?)\s*$", front)
        if not match:
            fail(f"VIEW.md: missing {key}")
        if expected is not None and match.group(1).strip() != expected:
            fail(f"VIEW.md: {key} must be {expected!r}")

    js = (root / "view.js").read_text(encoding="utf-8")
    if "Jarvis.views.register(VIEW_ID" not in js:
        fail("view.js: Jarvis.views registration not found")
    if "const VIEW_ID = 'shino-command-center'" not in js:
        fail("view.js: VIEW_ID mismatch")


def main() -> None:
    validate_lock()
    validate_view()
    print("SHINO overlay validation: OK")


if __name__ == "__main__":
    main()
