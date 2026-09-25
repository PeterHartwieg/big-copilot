"""Check that the game's building types page still yields the building capacity table.

    python tools/game_update/caps.py

_door_caps() in ba_dashboard.py reads the customer capacity of each building size
from the help page help_building_types_content, and starts from FALLBACK_CAPS, so a
page that no longer parses would still hand back the old table. This reads the
installed game's own text only, refusing the bundled copy, and counts the size rows
under each of CAP_CATEGORIES. It prints the row counts and every bold line on the
page that is not one of CAP_CATEGORIES, then compares the parsed table with
FALLBACK_CAPS. It exits non-zero with a message when the game or the page is
missing, a category yields no rows, or the table differs. At build 3682:

    rows: {'retail': 6, 'office': 6, 'cinema': 3, 'theater': 3}
    other headings: ['warehouse / factory', 'residential']
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
from ba_save import Names, bundled_locale, load_game_locale  # noqa: E402

# Any line that is bold and nothing else, whatever it holds: wider than
# _CAP_SECTION_RE on purpose, so a heading that regex no longer matches still shows.
BOLD_LINE = re.compile(r"^\*\*(.+?)\*\*$")


def main() -> int:
    source, locale = load_game_locale()
    if not source:
        sys.exit("game not found: set BA_LOCALE to the install's StreamingAssets/locale/en.json")
    if bundled_locale(source):
        sys.exit(f"{source} is the text the board ships, not the game's: point BA_LOCALE "
                 "at the install's StreamingAssets/locale/en.json")
    page = locale.get("help_building_types_content") or ""
    if not page:
        sys.exit(f"{source} has no help_building_types_content page")
    rows = {category: 0 for category in d.CAP_CATEGORIES}
    others = []
    section = None
    for line in page.split("\n"):
        line = line.strip()
        bold = BOLD_LINE.match(line)
        if bold:
            name = bold.group(1).strip().lower()
            if name not in rows and name not in others:
                others.append(name)
        head = d._CAP_SECTION_RE.match(line)
        if head:
            section = head.group(1).strip().lower()
            continue
        if section in rows and d._CAP_SIZE_RE.match(line):
            rows[section] += 1
    print("rows:", rows)
    print("other headings:", others)
    missing = [category for category, n in rows.items() if not n]
    if missing:
        sys.exit(f"no size rows parsed for {missing}: see docs/game-update.md")
    same = d._door_caps(Names(locale)) == d.FALLBACK_CAPS
    print("same as FALLBACK_CAPS:", same)
    if not same:
        sys.exit("the table differs from FALLBACK_CAPS: compare the row counts with the "
                 "page; see docs/game-update.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
