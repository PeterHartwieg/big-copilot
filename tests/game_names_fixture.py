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

The payload's findings are joined by a few more from the same builders
(more_findings()), so the page has game-name tokens inside sentences to
resolve: a role inside an hour-grid limit, a neighbourhood inside a hype line,
items inside run-dry lines and the summary that names the worst of them.
`english` is the payload as the page reads it in English, through plain().

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
from tests import theatre_fixture  # noqa: E402
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


def more_findings(payload: dict, text: dict) -> None:
    """Findings the synthetic company is too quiet to raise, from the builders
    that raise them in extract(): a theatre's hour grid (a role's name inside
    the limit and the fix), a hype wave (a neighbourhood's), and three items
    running dry at one depot (an item's, and a summary line naming the worst).
    They join the payload's own findings, and the page is handed all of it."""
    gift = payload["businesses"][0]
    theatre = theatre_fixture.rows()
    grid = dict(theatre["grid"], key=gift["key"], name=gift["name"])
    findings = [dict(f, key=gift["key"], site=gift["name"]) for f in theatre["findings"]]
    wave = {"hood": LONG_HOOD, "daysLeft": 3, "count": 2, "startDay": 20, "baseline": None,
            "top": gift["key"], "sites": [{"key": gift["key"], "name": gift["name"], "revenue": 900.0}]}
    raised = ba_dashboard._alerts(payload["businesses"], payload["supply"], payload["chains"], [], [wave],
                                  findings, [grid], payload["meta"]["day"], 0.0)
    depot = next(b for b in payload["businesses"] if b["typeSlug"] == "ba:businesstype_warehouse")
    dry = [ba_dashboard._shortfall_note(
        {"slug": slug, "arrives": 36, "runsOut": "Tuesday", "cover": 2 + n, "shortBy": 1.5,
         "importPerDay": 120, "perDay": 120, "peakPerDay": 180, "covered": False, "paused": False,
         "routed": 0},
        text[slug], depot["name"], depot["key"])
        for n, slug in enumerate(("ba:itemname_paperbag", "ba:itemname_lettuce", "ba:itemname_rawlettuce"))]
    summed = ba_dashboard._condense(dry, 0.0)
    payload["alerts"] = raised["lines"] + summed["lines"]
    payload["minor"] = raised["minor"]
    payload["hourFindings"] = findings
    payload["hours"] = [grid]


def resolved(value):
    """The payload as the page reads it in English: every token its English."""
    if isinstance(value, dict):
        return {k: resolved(v) for k, v in value.items()}
    if isinstance(value, list):
        return [resolved(v) for v in value]
    return ba_dashboard.plain(value)


def fixture() -> dict:
    text = english()
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "Link Co.hsg")
        write_link_save(path)
        payload = ba_dashboard.extract(load_save(path), Names(text), None)
    more_findings(payload, text)
    return {
        "payload": payload,
        "english": resolved(payload),
        "de": ba_dashboard.name_table(text, german(text)),
        "longHood": LONG_HOOD, "longHoodName": LONG_HOOD_NAME,
        "sameInGerman": SAME_IN_GERMAN,
    }


if __name__ == "__main__":
    sys.stdout.buffer.write(json.dumps(fixture(), ensure_ascii=False).encode("utf-8"))
