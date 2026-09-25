"""browser_build() and browser_name(), called the way web/worker.js calls them.

The worker writes the save, the player's optional en.json and the history on
Pyodide's filesystem, then calls browser_build(save, LOCALE, HISTORY, NAMES)
and hands the JSON string to the page. A name the player gives a factory line
goes through browser_name(HISTORY, rid, slug), with slug None to clear it,
and the worker rebuilds at once. The same calls run here on a temp folder over
the synthetic ES3 saves. Synthetic only: never a real save.
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))

import ba_dashboard  # noqa: E402
import es3_fixture  # noqa: E402
import save_fixtures  # noqa: E402

UNKNOWN_RID = "UNKNOWNrecipeAAAAAAAAA=="  # a recipe id no table names
BEER = "ba:itemname_beer"


def factory_lines(data: dict) -> tuple[list, list]:
    """(named lines, unnamed lines) across every factory in a payload."""
    named, unnamed = [], []
    for site in data["supply"]["factories"]["sites"]:
        named += site["lines"]
        unnamed += site["unnamed"]
    return named, unnamed


class BrowserBuild(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        # The worker's layout: /save/<name> for the save, /data/ for the rest.
        self.save_dir = os.path.join(self.tmp.name, "save")
        self.data_dir = os.path.join(self.tmp.name, "data")
        os.makedirs(self.save_dir)
        os.makedirs(self.data_dir)
        self.history = os.path.join(self.data_dir, "market_history.json")
        self.locale = os.path.join(self.data_dir, "en.json")  # absent: no en.json of the player's
        self.names = os.path.join(self.data_dir, "gametext.json")
        with open(self.names, "w", encoding="utf-8") as fh:
            json.dump(save_fixtures.data_names(), fh)

    def tearDown(self):
        self.tmp.cleanup()

    def build(self, save_path: str) -> dict:
        text = ba_dashboard.browser_build(save_path, self.locale, self.history, self.names)
        self.assertIsInstance(text, str)
        return json.loads(text)

    def sidecar(self) -> str:
        with open(self.history + ".character", encoding="utf-8") as fh:
            return fh.read()

    def history_names(self) -> dict:
        with open(self.history, encoding="utf-8") as fh:
            book = json.load(fh)["characters"]
        return book[save_fixtures.CHARACTER].get("lineNames", {})

    def write_data_save(self, recipe: str | None = None) -> str:
        """save_fixtures' company; `recipe` replaces the first machine's recipe id."""
        root = save_fixtures.data_company()
        if recipe:
            for site in root["BuildingRegistrations"]:
                for item in site.get("itemInstances", []):
                    if item.get("$v", {}).get("id") == "MACHINEone":
                        item["$v"]["selectedRecipeId"] = recipe
        path = os.path.join(self.save_dir, "Payload Co.hsg")
        with open(path, "wb") as fh:
            fh.write(es3_fixture.encode(root))
        return path

    def test_the_link_save_builds_a_payload_and_a_default_sidecar(self):
        path = os.path.join(self.save_dir, "Link Co.hsg")
        es3_fixture.write_link_save(path)
        data = self.build(path)
        for key in ("meta", "kpi", "businesses", "supply", "staffing", "alerts", "names"):
            self.assertIn(key, data)
        self.assertEqual(data["meta"]["day"], 34)
        # The link company has no characterId: its history files under "default".
        self.assertEqual(self.sidecar(), "default")
        self.assertTrue(os.path.exists(self.history))

    def test_the_data_save_files_its_character_beside_the_history(self):
        data = self.build(self.write_data_save())
        self.assertEqual(self.sidecar(), save_fixtures.CHARACTER)
        self.assertEqual(data["supply"]["factories"]["character"], save_fixtures.CHARACTER)
        # The shipped game text reached the payload: the brewery's line has its name.
        named, _ = factory_lines(data)
        self.assertIn("Beer", [line["item"] for line in named])

    def test_a_name_given_in_the_browser_carries_into_the_rebuild(self):
        path = self.write_data_save(recipe=UNKNOWN_RID)
        named, unnamed = factory_lines(self.build(path))
        self.assertIn(UNKNOWN_RID, [line["rid"] for line in unnamed])

        ba_dashboard.browser_name(self.history, UNKNOWN_RID, BEER)
        self.assertEqual(self.history_names(), {UNKNOWN_RID: BEER})

        named, unnamed = factory_lines(self.build(path))
        self.assertNotIn(UNKNOWN_RID, [line["rid"] for line in unnamed])
        mine = [line for line in named if line["rid"] == UNKNOWN_RID]
        self.assertEqual([(line["slug"], line["basis"]) for line in mine], [(BEER, "you")])
        # The rebuild wrote the history again and kept the name in it.
        self.assertEqual(self.history_names(), {UNKNOWN_RID: BEER})
        self.assertEqual(self.sidecar(), save_fixtures.CHARACTER)

        # The worker turns JavaScript's null into Python's None: that clears it.
        ba_dashboard.browser_name(self.history, UNKNOWN_RID, None)
        self.assertEqual(self.history_names(), {})
        _, unnamed = factory_lines(self.build(path))
        self.assertIn(UNKNOWN_RID, [line["rid"] for line in unnamed])

    def test_a_name_before_any_build_files_under_default(self):
        ba_dashboard.browser_name(self.history, "rid", BEER)
        with open(self.history, encoding="utf-8") as fh:
            book = json.load(fh)["characters"]
        self.assertEqual(book["default"]["lineNames"], {"rid": BEER})

    def test_a_file_that_is_no_save_says_so_in_one_sentence(self):
        path = os.path.join(self.save_dir, "notes.hsg")
        with open(path, "wb") as fh:
            fh.write(b"not gzip at all")
        with self.assertRaises(ba_dashboard.SaveShapeError) as caught:
            ba_dashboard.browser_build(path, self.locale, self.history, self.names)
        self.assertIn("notes.hsg is not a Big Ambitions save", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
