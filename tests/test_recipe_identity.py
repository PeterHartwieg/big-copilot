"""Naming behavior and quantity regressions; these do not verify game mappings."""
import copy
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

from ba_dashboard import History, Names, RECIPE_ITEMS, TEMPLATE, _factories, _recipes, site_key


BEER = "ba:itemname_beer"
WATER = "ba:itemname_water"
RID = next(rid for rid, item in RECIPE_ITEMS.items() if item == BEER)


class SaveStub:
    def __init__(self, groups, hours=12):
        self.root = {"BuildingRegistrations": []}
        for site, rids in enumerate(groups):
            self.root["BuildingRegistrations"].append({
                "RentedByPlayer": True, "StreetName": "factory", "StreetNumber": site,
                "itemInstances": [{"$v": {
                    "id": f"machine-{i}", "priority": i, "selectedRecipeId": rid,
                    "workstationType": "ba:factoryworkstationtype_bottledgoodsworkstation",
                }} for i, rid in enumerate(rids)],
                "scheduleDays": [{"day": day, "workShifts": [{
                    "itemInstanceId": f"machine-{i}", "type": 1,
                    "startingHour": 0, "endingHour": hours,
                } for i in range(len(rids))]} for day in range(7)],
            })

    def items(self, value):
        return value or []

    def deref(self, value):
        return value


class RecipeIdentityTests(unittest.TestCase):
    def setUp(self):
        self.recipes = {BEER: {
            "slug": BEER, "item": "Beer", "out": 30, "workstation": "bottledgoods",
            "ingredients": [{"slug": WATER, "item": "Water", "per": 10}],
        }}
        self.history = History(None)

    def build(self, groups, hours=12):
        depot = "depot#1"
        flow = {
            "index": {site_key(("factory", i)): i for i in range(len(groups))},
            "held": {}, "edges": {},
            "targets": {(site_key(("factory", i)), WATER): (100, depot)
                        for i in range(len(groups))},
            "imports": {(depot, WATER): {"weekly": 1000}},
            "shipped": lambda *args: None, "received": lambda *args: None,
            "byDay": lambda *args: {}, "roundDays": lambda *args: [],
        }
        flow["index"][depot] = len(groups)
        return _factories(SaveStub(groups, hours), Names({}), [], self.recipes,
                          flow, self.history, "company")

    def test_first_save_names_lines_and_counts_shared_inputs_once(self):
        result = self.build([[RID, RID], [RID]])
        self.assertEqual((result["machines"], result["unnamed"]), (3, 0))
        for site in result["sites"]:
            line, need = site["lines"][0], site["needs"][0]
            n = site["machines"]
            self.assertEqual((line["slug"], line["basis"]), (BEER, "table"))
            self.assertEqual(line["makes"], n * 720)
            self.assertEqual(line["atRoster"], n * 360)
            self.assertEqual(need["perDay"], n * 240)
            self.assertEqual(need["perWeek"], n * 1680)
            self.assertEqual(need["depotNeed"], 5040)
            self.assertFalse(need["known"])
            self.assertEqual(need["raiseImport"], None)  # daily target is the first issue
            self.assertEqual(need["raiseTarget"], 500 if n == 2 else 300)

    def test_table_overrides_old_names_without_learning_or_deleting_history(self):
        self.history.book = {"company": {
            "recipes": {RID: "old-guess"}, "lineNames": {RID: "old-choice"},
        }, "other": {"lineNames": {RID: "another-company"}}}
        before = copy.deepcopy(self.history.book)
        result = self.build([[RID]])
        self.assertEqual(result["sites"][0]["lines"][0]["slug"], BEER)
        self.assertEqual(self.history.book, before)
        with tempfile.TemporaryDirectory() as directory:
            self.history.path = str(Path(directory) / "history.json")
            Path(self.history.path).write_text(json.dumps({"characters": before}), encoding="utf-8")
            self.history.write()
            saved = History(self.history.path).book
            for character, records in before.items():
                for key, value in records.items():
                    self.assertEqual(saved[character][key], value)

    def test_unknown_recipe_ignores_guesses_and_requires_manual_choice(self):
        self.history.book = {"company": {"recipes": {"new-id": BEER}}}
        unnamed = self.build([["new-id"]])["sites"][0]
        self.assertEqual(unnamed["lines"], [])
        self.assertEqual(unnamed["needs"], [])
        self.assertEqual(unnamed["unnamed"][0]["candidates"], [{"slug": BEER, "item": "Beer"}])
        self.history.named("company", {"new-id": BEER})
        self.assertEqual(self.build([["new-id"]])["sites"][0]["lines"][0]["basis"], "you")
        self.history.named("company", {"new-id": None})
        self.assertEqual(self.build([["new-id"]])["unnamed"], 1)

    def test_unknown_and_table_ids_can_share_product_across_factories(self):
        self.history.named("company", {"new-id": BEER})
        result = self.build([[RID], ["new-id"], ["new-id"]])
        self.assertEqual(result["unnamed"], 0)
        self.assertTrue(all(s["needs"][0]["depotNeed"] == 5040 for s in result["sites"]))

    def test_idle_missing_quantities_and_wrong_workstation_do_not_invent_needs(self):
        self.assertTrue(self.build([[None]])["sites"][0]["unnamed"][0]["idle"])
        self.recipes[BEER]["workstation"] = "electronics"
        self.history.named("company", {"new-id": BEER})
        result = self.build([[RID, "new-id"]])
        self.assertEqual(result["unnamed"], 2)
        self.assertEqual(result["sites"][0]["needs"], [])
        self.assertTrue(all(not u["candidates"] for u in result["sites"][0]["unnamed"]))
        self.recipes = {}
        self.assertEqual(self.build([[RID]])["sites"], [])

    def test_quantity_changes_still_come_from_game_text_and_zero_staff_stays_zero(self):
        self.recipes[BEER]["out"] = 45
        self.recipes[BEER]["ingredients"][0]["per"] = 7
        site = self.build([[RID]], hours=0)["sites"][0]
        self.assertEqual(site["lines"][0]["makes"], 1080)
        self.assertEqual(site["lines"][0]["atRoster"], 0)
        self.assertEqual(site["needs"][0]["perDay"], 168)

    def browser_view(self, groups, choices):
        initial = self.build(groups)
        data = {"supply": {"factories": initial}, "plan": {"recipes": list(self.recipes.values())},
                "businesses": [{"lines": []} for _ in range(len(groups) + 1)]}
        script = "const D = " + json.dumps(data) + "; const LIVE = false;\n"
        script += "const localStorage = {getItem: () => " + json.dumps(json.dumps(choices)) + "};\n"
        script += TEMPLATE[TEMPLATE.index("const LINE_NAMES_KEY"):TEMPLATE.index("/* --- chrome, wired up once")]
        script += "\nconsole.log(JSON.stringify(factoryView()));"
        return json.loads(subprocess.run(["node", "-e", script], check=True, text=True,
                                           capture_output=True).stdout)

    def test_static_browser_manual_overlay_matches_python_and_preserves_table(self):
        groups = [[RID], ["new-id"], ["new-id"]]
        actual = self.browser_view(groups, {RID: "wrong", "new-id": BEER})
        self.history.named("company", {"new-id": BEER})
        expected = self.build(groups)
        self.assertEqual(actual["unnamed"], 0)
        for a, e in zip(actual["sites"], expected["sites"]):
            for field in ("slug", "basis", "makes", "atRoster"):
                self.assertEqual(a["lines"][0][field], e["lines"][0][field])
            for field in ("perDay", "perWeek", "depotNeed", "raiseTarget", "status"):
                self.assertEqual(a["needs"][0][field], e["needs"][0][field])

    def test_unusable_table_identity_allows_manual_recovery(self):
        original = copy.deepcopy(self.recipes[BEER])
        replacement = "replacement-beer"
        for failure in ("missing", "wrong-workstation"):
            with self.subTest(failure=failure):
                self.history = History(None)
                self.recipes = {replacement: dict(original, slug=replacement)}
                if failure == "wrong-workstation":
                    self.recipes[BEER] = dict(original, workstation="electronics")
                unresolved = self.build([[RID]])["sites"][0]
                self.assertEqual(unresolved["unnamed"][0]["candidates"],
                                 [{"slug": replacement, "item": "Beer"}])
                self.assertEqual(unresolved["needs"], [])
                self.history.named("company", {RID: BEER})
                self.assertEqual(self.build([[RID]])["unnamed"], 1)
                browser = self.browser_view([[RID]], {RID: replacement})
                self.history.named("company", {RID: replacement})
                desktop = self.build([[RID]])
                for result in (desktop, browser):
                    line = result["sites"][0]["lines"][0]
                    self.assertEqual((line["slug"], line["basis"]), (replacement, "you"))
                    self.assertEqual(result["sites"][0]["needs"][0]["perDay"], 240)
                self.history.named("company", {RID: None})
                self.assertEqual(self.build([[RID]])["unnamed"], 1)
                self.history.named("company", {RID: replacement})
                self.recipes[BEER] = original
                for result in (self.build([[RID]]), self.browser_view([[RID]], {RID: replacement})):
                    line = result["sites"][0]["lines"][0]
                    self.assertEqual((line["slug"], line["basis"]), (BEER, "table"))

    def test_browser_lists_each_producing_factory_once_for_shared_product(self):
        drink = "drink"
        self.recipes[drink] = {
            "slug": drink, "item": "Drink", "out": 10, "workstation": "bottledgoods",
            "ingredients": [{"slug": BEER, "item": "Beer", "per": 5}],
        }
        groups = [[RID, RID, "producer", "producer", "producer", "consumer"], [RID]]
        choices = {"producer": BEER, "consumer": drink}
        browser = self.browser_view(groups, choices)
        self.history.named("company", choices)
        desktop = self.build(groups)
        for result in (desktop, browser):
            site = result["sites"][0]
            self.assertEqual(sum(l["machines"] for l in site["lines"] if l["slug"] == BEER), 5)
            need = next(n for n in site["needs"] if n["slug"] == BEER)
            self.assertEqual(need["madeAt"], [0, 1])
            self.assertEqual(need["perDay"], 120)
            water = next(n for n in site["needs"] if n["slug"] == WATER)
            self.assertEqual((water["perDay"], water["depotNeed"]), (1200, 10080))

    def test_bundled_catalogue_covers_the_pinned_identity_table(self):
        root = Path(__file__).resolve().parents[1]
        locale = json.loads((root / "web/py/gametext.json").read_text(encoding="utf-8"))
        self.assertEqual(len(RECIPE_ITEMS), 62)
        self.assertEqual(set(RECIPE_ITEMS.values()), set(_recipes(Names(locale))))


if __name__ == "__main__":
    unittest.main()
