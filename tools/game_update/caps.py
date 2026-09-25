"""Check that the game's building types page still yields the building capacity table.

    python tools/game_update/caps.py

_door_caps() in ba_dashboard.py reads the customer capacity of each building size
from the help page help_building_types_content, and starts from FALLBACK_CAPS, so a
page that no longer parses would still hand back the old table. This reads the
installed game's own text (load_game_locale(), never the bundled copy), counts the
size rows under each of CAP_CATEGORIES, and fails with a message when the game is
not found or a category yields no rows. Otherwise it prints the row counts and
whether the parsed table equals FALLBACK_CAPS. At build 3682:

    rows: {'retail': 6, 'office': 6, 'cinema': 3, 'theater': 3}
    same as FALLBACK_CAPS: True

Nothing is written. See docs/game-update.md.
"""
from __future__ import annotations

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

import ba_dashboard as d  # noqa: E402
from ba_save import Names, load_game_locale  # noqa: E402


def main() -> int:
    source, locale = load_game_locale()
    if not source:
        sys.exit("game not found: set BA_LOCALE to the install's StreamingAssets/locale/en.json")
    page = locale.get("help_building_types_content") or ""
    if not page:
        sys.exit(f"{source} has no help_building_types_content page")
    rows = {category: 0 for category in d.CAP_CATEGORIES}
    section = None
    for line in page.split("\n"):
        line = line.strip()
        head = d._CAP_SECTION_RE.match(line)
        if head:
            section = head.group(1).strip().lower()
            continue
        if section in rows and d._CAP_SIZE_RE.match(line):
            rows[section] += 1
    print("rows:", rows)
    missing = [category for category, n in rows.items() if not n]
    if missing:
        sys.exit(f"no size rows parsed for {missing}: fix _CAP_SECTION_RE / _CAP_SIZE_RE")
    print("same as FALLBACK_CAPS:", d._door_caps(Names(locale)) == d.FALLBACK_CAPS)
    return 0


if __name__ == "__main__":
    sys.exit(main())
