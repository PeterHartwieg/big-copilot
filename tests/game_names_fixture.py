"""A board's payload and a German name table, both out of the real Python.

tests/game_names.test.cjs lays the table over the payload with the page's own
localiseNames() and checks what reaches the board. A hand-written payload would
only prove that the seam handles the fields someone remembered to write, so the
payload is extract() over tests/es3_fixture.py's synthetic company, with the
English game text the page ships, and the table is name_table() over a
synthetic German text built from that English.

The German is not the game's: every name reads "<English> (DE)", except

- a few words a German player would search for, which share no word with the
  English ("Geschenkeladen" for Gift Shop), so a search can tell the two apart;

- the two keys the English calls "Bag of Lettuce", which the German tells apart
  (as the game's own German does), so a name without its key cannot be swapped;
- a neighbourhood with one long word for its name, for the heat grid's header;
- one item the German words exactly as English, which name_table() leaves out,
  so it has to read as English.

Synthetic saves only. `python -m tests.game_names_fixture` prints the JSON.
"""
import json
import os
import sys
import tempfile

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, ROOT)

import ba_dashboard  # noqa: E402
from ba_save import Names, load_save  # noqa: E402
from tests.es3_fixture import write_link_save  # noqa: E402

LONG_HOOD = "ba:neighborhood_garmentdistrict"
LONG_HOOD_NAME = "Bekleidungsgewerbeviertel"
SAME_IN_GERMAN = "ba:itemname_cleaningstation"
LETTUCE = {"ba:itemname_lettuce": "Beutel mit Salat", "ba:itemname_rawlettuce": "Beutel Salat"}
WORDS = {"ba:businesstype_giftshop": "Geschenkeladen", "ba:businesstype_warehouse": "Lagerhaus",
         "ba:skill_customerservice": "Kundendienst", "ba:itemname_paperbag": "Papiertüte"}


def english() -> dict:
    """The English game text the page ships."""
    with open(os.path.join(ROOT, "web", "py", "gametext.json"), encoding="utf-8") as fh:
        return json.load(fh)


def german(text: dict) -> dict:
    """A synthetic German game text: the rules in the module docstring."""
    out = {k: f"{v} (DE)" for k, v in text.items() if k.startswith(ba_dashboard.NAME_PREFIXES)}
    out.update(LETTUCE)
    out.update(WORDS)
    out[LONG_HOOD] = LONG_HOOD_NAME
    out[SAME_IN_GERMAN] = text[SAME_IN_GERMAN]
    return out


def fixture() -> dict:
    text = english()
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "Link Co.hsg")
        write_link_save(path)
        payload = ba_dashboard.extract(load_save(path), Names(text), None)
    return {
        "payload": payload,
        "de": ba_dashboard.name_table(text, german(text)),
        "longHood": LONG_HOOD, "longHoodName": LONG_HOOD_NAME,
        "sameInGerman": SAME_IN_GERMAN,
    }


if __name__ == "__main__":
    sys.stdout.buffer.write(json.dumps(fixture(), ensure_ascii=False).encode("utf-8"))
