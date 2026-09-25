"""The game names in the other languages the game ships: the tables, the build
that writes them, the stamp that busts their caches, the footer's picker and the
CLI's --lang.

Synthetic game text wherever a table is built here; the committed tables under
web/names/ are checked for shape, not rebuilt (that needs the installed game).
"""
import json
import os
import re
import tempfile
import unittest
from pathlib import Path

import build_web
from ba_dashboard import (
    GAME_NAME_LANGS, NAME_COVERAGE, NAME_PREFIXES, cli_names, footer_html, name_coverage, name_table,
    render,
)

ROOT = Path(__file__).resolve().parents[1]

ENGLISH = {
    "ba:itemname_paperbag": "Paper Bag",
    "ba:itemname_paperbag_description": "A bag.",
    "ba:businesstype_giftshop": "Gift Shop",
    "ba:neighborhood_midtown": "Midtown",
    "ba:skill_cleaning": "Cleaning",
    "ba:jobdemand_nonights": "No night shifts",
    "help_ba:itemname_paperbag_content": "Holds things.",
    "common_ok": "OK",
}


def write_locale(folder, listed, files):
    """A locale folder as the game ships it: locale.json and one file a language."""
    Path(folder, "locale.json").write_text(json.dumps(listed), encoding="utf-8")
    for code, table in files.items():
        Path(folder, f"{code}.json").write_text(json.dumps(table, ensure_ascii=False), encoding="utf-8")


class NameTable(unittest.TestCase):
    def test_only_names_that_differ_from_english(self):
        german = {
            "ba:itemname_paperbag": "Papiertüte",
            "ba:itemname_paperbag_description": "Eine Tüte.",
            "ba:businesstype_giftshop": "Geschenkeladen",
            "ba:neighborhood_midtown": "Midtown",      # worded as in English: left out
            "ba:skill_cleaning": "  ",                  # blank: left out, reads English
            "help_ba:itemname_paperbag_content": "Hält Dinge.",
            "common_ok": "OK",
        }
        self.assertEqual(name_table(ENGLISH, german), {
            "ba:businesstype_giftshop": "Geschenkeladen",
            "ba:itemname_paperbag": "Papiertüte",
        })

    def test_coverage_counts_the_name_keys_only(self):
        # Five name keys; a language naming two of them covers 40%.
        self.assertAlmostEqual(name_coverage(ENGLISH, {"ba:skill_cleaning": "Reinigung",
                                                       "ba:neighborhood_midtown": "Midtown",
                                                       "help_ba:itemname_paperbag_content": "x"}), 0.4)
        self.assertEqual(name_coverage(ENGLISH, {}), 0.0)


class Build(unittest.TestCase):
    def test_a_language_naming_too_few_keys_is_left_out(self):
        with tempfile.TemporaryDirectory() as tmp:
            write_locale(tmp, {"en": "English", "de": "German", "ar": "Arabic", "fr": "French"}, {
                "en": ENGLISH,
                "de": {k: f"{v} (de)" for k, v in ENGLISH.items()},
                "ar": {"common_ok": "حسنا"},
                # fr is listed without a file: it names nothing.
            })
            tables, dropped = build_web.name_tables(tmp, ENGLISH)
        self.assertEqual(sorted(tables), ["de"])
        self.assertEqual(sorted(dropped), ["ar", "fr"])
        self.assertTrue(all(k.startswith(NAME_PREFIXES) for k in tables["de"]))

    def test_the_build_stops_when_the_game_lists_other_languages(self):
        with tempfile.TemporaryDirectory() as tmp, tempfile.TemporaryDirectory() as web:
            write_locale(tmp, {"en": "English", "de": "German", "xx": "Newish"}, {
                "de": {k: f"{v} (de)" for k, v in ENGLISH.items()},
                "xx": {k: f"{v} (xx)" for k, v in ENGLISH.items()},
            })
            with self.assertRaises(SystemExit) as caught:
                build_web.write_name_tables(os.path.join(tmp, "en.json"), ENGLISH, web=web)
            self.assertIn("new: xx", str(caught.exception))
            self.assertIn("GAME_NAME_LANGS", str(caught.exception))
            self.assertFalse(os.path.exists(os.path.join(web, "names")))

    def test_every_language_but_english_is_a_committed_table(self):
        self.assertEqual(build_web.NAME_LANGS, tuple(c for c in GAME_NAME_LANGS if c != "en"))
        self.assertNotIn("ar", build_web.NAME_LANGS)
        self.assertEqual(list(GAME_NAME_LANGS)[0], "en")
        names = sorted(p.name for p in (ROOT / "web" / "names").glob("*.json"))
        self.assertEqual(names, sorted(f"{c}.json" for c in build_web.NAME_LANGS))

    def test_the_committed_tables_hold_names_and_nothing_else(self):
        english = json.loads((ROOT / "web" / "py" / "gametext.json").read_text(encoding="utf-8"))
        keys = {k for k in english if k.startswith(NAME_PREFIXES) and not k.endswith("_description")}
        for code in build_web.NAME_LANGS:
            with self.subTest(code):
                table = json.loads((ROOT / "web" / "names" / f"{code}.json").read_text(encoding="utf-8"))
                self.assertLessEqual(set(table), keys)
                # Every table names most of what the page shows; a table of
                # English would be empty, one of another game build half full.
                self.assertGreater(len(table), NAME_COVERAGE * len(keys), code)
                self.assertFalse([k for k, v in table.items() if v == english.get(k)])

    def test_the_tables_are_stamped(self):
        for code in build_web.NAME_LANGS:
            self.assertIn(f"web/names/{code}.json", build_web.STAMP_INPUTS)
        with tempfile.TemporaryDirectory() as tmp:
            for name in build_web.STAMP_INPUTS:
                dest = Path(tmp, name)
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes((ROOT / name).read_bytes())
            before = build_web.stamp(tmp)
            de = Path(tmp, "web/names/de.json")
            de.write_bytes(de.read_bytes().replace(b"}", b',"ba:x":"y"}', 1))
            self.assertNotEqual(build_web.stamp(tmp), before)

    def test_check_reports_a_missing_table(self):
        with tempfile.TemporaryDirectory() as tmp:
            for name in build_web.STAMP_INPUTS + ("ba_buildings.json", "ba_demand_curves.json",
                                                   "web/py/ba_buildings.json", "web/py/ba_demand_curves.json",
                                                   "web/py/ba_save.py", "web/py/ba_dashboard.py"):
                dest = Path(tmp, name)
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes((ROOT / name).read_bytes())
            Path(tmp, "web/names/ja.json").unlink()
            self.assertIn("web/names/ja.json", build_web.check(tmp))


class Picker(unittest.TestCase):
    def test_only_the_site_offers_the_picker(self):
        # The markup, not the selector: the board script names [data-gn-pick].
        self.assertNotIn('<select class="gn-pick"', footer_html())
        self.assertNotIn('<select class="gn-pick"', render(None))
        for landing in (False, True):
            with self.subTest(landing=landing):
                markup = footer_html(landing=landing, site=True)
                self.assertIn(">Game names</h2>", markup)
                options = re.findall(r'<option value="([^"]+)" lang="\1">([^<]+)</option>', markup)
                self.assertEqual([c for c, _ in options], list(GAME_NAME_LANGS))
                self.assertEqual(options[0], ("en", "English"))
                self.assertIn(("de", "Deutsch"), options)
                self.assertIn(("ja", "日本語"), options)

    def test_the_two_pickers_label_themselves_apart(self):
        # Both footers are in the page until the board replaces the landing.
        landing = re.search(r'aria-labelledby="(gnHead\w*)"', footer_html(landing=True, site=True)).group(1)
        board = re.search(r'aria-labelledby="(gnHead\w*)"', footer_html(site=True)).group(1)
        self.assertNotEqual(landing, board)


class Lang(unittest.TestCase):
    def test_english_and_no_lang_embed_nothing(self):
        self.assertIsNone(cli_names(None, "x", ENGLISH))
        self.assertIsNone(cli_names("en", "x", ENGLISH))
        self.assertIn("const GN_EMBED = null;", render(None))

    def test_lang_reads_the_file_beside_en_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            write_locale(tmp, {"en": "English", "de": "German"}, {
                "en": ENGLISH, "de": {"ba:itemname_paperbag": "Papiertüte", "ba:businesstype_giftshop": "Geschenkeladen",
                                      "ba:neighborhood_midtown": "Midtown"}})
            names = cli_names("de", os.path.join(tmp, "en.json"), ENGLISH)
            self.assertEqual(names, {"lang": "de", "names": {"ba:businesstype_giftshop": "Geschenkeladen",
                                                            "ba:itemname_paperbag": "Papiertüte"}})
            page = render(None, names=names)
            self.assertIn('const GN_EMBED = {"lang":"de","names":{"ba:businesstype_giftshop":"Geschenkeladen"', page)
            with self.assertRaises(SystemExit):
                cli_names("fr", os.path.join(tmp, "en.json"), ENGLISH)  # no fr.json: names nothing

    def test_an_unknown_language_or_no_game_is_refused(self):
        with self.assertRaises(SystemExit):
            cli_names("xx", "x", ENGLISH)
        with self.assertRaises(SystemExit):
            cli_names("de", None, ENGLISH)



class Tokens(unittest.TestCase):
    """Game names inside Python's sentences travel as tokens the page resolves;
    what Python keeps for itself stays plain English."""

    def test_a_token_carries_its_key_and_its_english(self):
        from ba_dashboard import plain, tok
        said = f"{tok('ba:itemname_paperbag', 'Paper Bag')} runs dry"
        self.assertEqual(said, "⟦ba:itemname_paperbag|Paper Bag⟧ runs dry")
        self.assertEqual(plain(said), "Paper Bag runs dry")
        # No key, no token: the words stay as they are.
        self.assertEqual(tok(None, "the depot"), "the depot")
        self.assertEqual(tok("7 Pier", "7 Pier"), "7 Pier")
        self.assertEqual(plain(None), None)

    def test_ids_hash_the_english_they_always_hashed(self):
        from ba_dashboard import _alert_id, _condense, _shortfall_note
        row = {"slug": "ba:itemname_paperbag", "arrives": 36, "runsOut": "Tuesday", "cover": 2,
               "shortBy": 1.5, "importPerDay": 120, "perDay": 120, "peakPerDay": 180,
               "covered": False, "paused": False, "routed": 0}
        note = _shortfall_note(row, "Paper Bag", "Depot", "ba:street_pier#9")
        self.assertEqual(note["id"], _alert_id("shortfall", "ba:street_pier#9", "Paper Bag"))
        self.assertEqual(note["subject"], "Paper Bag")
        self.assertTrue(note["text"].startswith("⟦ba:itemname_paperbag|Paper Bag⟧ runs dry"))
        rows = [dict(row, slug=s, cover=2 + n) for n, s in
                enumerate(("ba:itemname_paperbag", "ba:itemname_sodacan", "ba:itemname_energydrink"))]
        merged = _condense([_shortfall_note(r, r["slug"][12:], "Depot", "ba:street_pier#9") for r in rows], 0.0)
        [line] = merged["lines"]
        self.assertEqual(line["id"], _alert_id("summary", "shortfall", "ba:street_pier#9"))
        self.assertTrue(line["text"].endswith("soonest ⟦ba:itemname_paperbag|paperbag⟧"))
        self.assertNotIn("named", line)

    def test_an_hour_limit_names_its_role_and_keeps_its_id(self):
        from ba_dashboard import _alert_id, _alerts, plain
        from tests.game_names_fixture import fixture
        payload = fixture()["payload"]
        finding = next(f for f in payload["hourFindings"] if f["kind"] == "cap" and "⟦" in f["limit"])
        self.assertEqual(plain(finding["limit"]), "Projectionist staffing")
        line = next(a for a in payload["alerts"] if a["group"] == "atcap" and "⟦" in a["text"])
        self.assertIn("⟦ba:skill_projectionist|Projectionist⟧ staffing is the limit", line["text"])
        self.assertEqual(line["id"], _alert_id("atcap", finding["key"], "Projectionist staffing"))

    def test_nothing_python_keeps_carries_a_token(self):
        import ba_dashboard
        from ba_save import Names, load_save
        from tests.es3_fixture import write_link_save
        from tests.game_names_fixture import english
        with tempfile.TemporaryDirectory() as tmp:
            save, history = os.path.join(tmp, "Link Co.hsg"), os.path.join(tmp, "market_history.json")
            write_link_save(save)
            data = ba_dashboard.extract(load_save(save), Names(english()), history)
            self.assertIn("⟦", json.dumps(data, ensure_ascii=False))
            for name in os.listdir(tmp):
                if name != "Link Co.hsg":
                    self.assertNotIn("⟦", Path(tmp, name).read_text(encoding="utf-8"), name)
        for row in data["alerts"] + data["minor"]["rows"]:
            self.assertNotIn("⟦", row["id"] + row["site"] + (row["siteKey"] or ""))


class WaitingOn(unittest.TestCase):
    """A stopped line's inputs travel with their keys; what an input waits on is
    named by the key each name came with."""

    def test_two_inputs_with_one_english_name_keep_their_own_keys(self):
        import ba_dashboard
        from ba_save import Names
        from tests.test_recipe_identity import BEER, RID, SaveStub
        water, depot = "ba:itemname_water", "depot#1"
        lettuce, raw = "ba:itemname_lettuce", "ba:itemname_rawlettuce"
        factory = ba_dashboard.site_key(("factory", 0))
        flow = {"index": {factory: 0, depot: 1}, "held": {}, "edges": {},
                "targets": {(factory, k): (100, depot) for k in (water, lettuce, raw)},
                "imports": {}, "shipped": lambda *a: None, "received": lambda *a: 0,
                "byDay": lambda *a: {}, "roundDays": lambda *a: [], "routed": {}, "routeOnly": {}}
        recipes = {BEER: {"slug": BEER, "item": "Beer", "out": 30, "workstation": "bottledgoods",
                          "ingredients": [{"slug": water, "item": "Water", "per": 10},
                                          {"slug": lettuce, "item": "Bag of Lettuce", "per": 5},
                                          {"slug": raw, "item": "Bag of Lettuce", "per": 5}]}}
        site = ba_dashboard._factories(SaveStub([[RID]]), Names({}), [], recipes, flow,
                                       ba_dashboard.History(None), "company")["sites"][0]
        line = site["lines"][0]
        self.assertEqual(line["missingSlugs"], [water, lettuce, raw])
        row = next(r for r in site["needs"] if r["slug"] == water)
        self.assertEqual(row["waitingOn"], ["Bag of Lettuce", "Bag of Lettuce"])
        self.assertEqual(row["waitingOnSlugs"], [lettuce, raw])


if __name__ == "__main__":
    unittest.main()
