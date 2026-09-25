"""Print the game's stock difficulty presets, read from its .assets files.

    python tools/game_update/presets.py                 # the detected install
    python tools/game_update/presets.py --data-dir DIR  # another Big Ambitions_Data

The presets are DifficultySetting ScriptableObjects in sharedassets1.assets.
The file carries no type trees, so each one is found by its byte run: int32 18,
starting money, tax percent, int32 60, then the multipliers as floats. The
int32 just before the run is the Difficulty slot (1 Easy, 2 Normal, 3 Hard).
The byte run also matches unrelated data; the three real rows are the ones in
sharedassets1.assets with slots 1 to 3 and multipliers that are not 0. Compare the output with HOUSE_RULES in ba_dashboard.py (Normal's column) and
PRESETS in tests/test_house_rules.py. See docs/game-update.md.

The install is found the way the board finds its game text: BA_LOCALE, then
ba_save.find_game_locale(). Nothing is written.
"""
from __future__ import annotations

import argparse
import glob
import os
import re
import struct
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "tools"))
sys.path.insert(0, ROOT)

PRESET_RE = re.compile(rb"\x12\x00\x00\x00(.{4})(.{4})\x3c\x00\x00\x00", re.S)
# The Resale value slider's key, which build 3680 added. At build 3682 no .assets
# file holds it, so this usually prints nothing; the check for a new slider is a
# new main_menu_custom_* key in en.json (docs/game-update.md).
SLIDER_RE = re.compile(rb"main_menu_custom_game_selling_multiplier\x00")


def default_data_dir() -> str:
    """The installed game's Big Ambitions_Data folder, or exit with how to name it."""
    from ba_save import find_game_locale
    from extract_wiki import game_data_dir

    locale = find_game_locale()
    data_dir = game_data_dir(locale) if locale else None
    if not data_dir:
        raise SystemExit(
            "could not find the installed game. Set BA_LOCALE to its "
            "StreamingAssets/locale/en.json, or pass --data-dir"
        )
    return data_dir


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--data-dir", help="the game's Big Ambitions_Data folder")
    data_dir = parser.parse_args().data_dir or default_data_dir()

    files = sorted(glob.glob(os.path.join(data_dir, "*.assets")))
    if not files:
        raise SystemExit(f"no .assets files in {data_dir}")
    for f in files:
        with open(f, "rb") as fh:
            b = fh.read()
        for m in PRESET_RE.finditer(b):
            money, tax = struct.unpack("<ii", m.group(1) + m.group(2))
            if not (0 < money < 10_000_000 and 0 <= tax <= 100):
                continue
            i = m.end()
            mk, sal, bank = struct.unpack_from("<fff", b, i)
            i += 12
            tut = b[i]
            i += 4
            riv, base, wu, iu, exp, sell = struct.unpack_from("<ffffff", b, i)
            diff = struct.unpack_from("<i", b, m.start() - 4)[0]
            print(os.path.basename(f), m.start(), "slot", diff, "money", money, "tax", tax,
                  "market %.2f salary %.2f bank %.2f tut %d rivals %.2f base %.2f wu %.2f "
                  "iu %.2f export %.2f sell %.2f"
                  % (mk, sal, bank, tut, riv, base, wu, iu, exp, sell))
        for m in SLIDER_RE.finditer(b):
            print(os.path.basename(f), "slider key at", m.start(),
                  b[m.start() - 80:m.start() + 8].hex(" "))


if __name__ == "__main__":
    main()
