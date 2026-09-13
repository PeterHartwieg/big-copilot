"""Supply regressions for GitHub #17 and #18, using portable save fixtures."""
import json
import subprocess
import unittest

from ba_dashboard import Names, TEMPLATE, _feed_notes, _supply, site_key
from test_recipe_identity import BEER, WATER, RID, SaveStub


def contract(amount, *, last=0, active=True, destination=("depot", 1), pier=1):
    return {
        "importAddress": ("pier", pier), "isActive": active, "nextDeliveryDay": 14,
        "products": [{"itemName": WATER, "amount": amount,
                      "amountOrderedLastWeek": last, "assignedWarehouse": destination}],
    }


class ImportRoutesTests(unittest.TestCase):
    def build(self, contracts, *, routed=False, rid=RID, with_recipes=True):
        save = SaveStub([[rid]], hours=24)
        save.address = lambda value: value
        save.root.update(Hour=12, Minute=0, importPartnerships=contracts,
                         logisticsManagerPlans=[])
        if routed:
            save.root["logisticsManagerPlans"] = [{
                "targetAddress": ("depot", 1), "destinations": [{
                    "deliveryTargetAddress": ("factory", 0),
                    "stockTargets": [{"itemName": WATER, "targetAmount": 300}],
                }],
            }]
        businesses = [{
            "key": site_key(address), "name": name, "code": "", "neighbourhood": "",
            "type": kind, "typeSlug": kind, "status": "support",
            "lines": [{"slug": WATER, "item": "Water", "units": 1000,
                       "rate": 0, "price": 1}],
        } for address, name, kind in [(("factory", 0), "Factory", "factory"),
                                    (("depot", 1), "WH Import Hub", "warehouse")]]
        recipes = {BEER: {
            "slug": BEER, "item": "Beer", "out": 30, "workstation": "bottledgoods",
            "ingredients": [{"slug": WATER, "item": "Water", "per": 10}],
        }}
        supply = _supply(save, Names({}), businesses, 10, {}, recipes if with_recipes else {})
        return {"meta": {"character": "import-routes", "day": 10, "save": "Fixture"},
                "supply": supply, "businesses": businesses,
                "plan": {"recipes": list(recipes.values())}}

    def need(self, data):
        return data["supply"]["factories"]["sites"][0]["needs"][0]

    def test_active_warehouse_order_without_previous_delivery_is_present(self):
        data = self.build([contract(126000)], routed=True)
        self.assertEqual(data["supply"]["factories"]["depots"][1][WATER]["weekly"], 126000)
        self.assertEqual(self.need(data)["importWeekly"], 126000)
        self.assertEqual(self.need(data)["status"], "ok")

    def test_warehouse_orders_sum_without_zero_or_paused_contract_overwriting(self):
        contracts = [contract(1000, last=1000), contract(2000, last=2000, pier=2),
                     contract(9000, last=9000, active=False, pier=3),
                     contract(0, last=500, pier=4)]
        for orders in (contracts, list(reversed(contracts))):
            with self.subTest(reverse=orders != contracts):
                need = self.need(self.build(orders, routed=True))
                self.assertEqual(need["importWeekly"], 3000)
                self.assertEqual(need["status"], "ok")

    def test_direct_factory_import_covers_input_without_daily_topup(self):
        need = self.need(self.build([contract(2000, last=2000, destination=("factory", 0))]))
        self.assertEqual(need["status"], "ok")
        self.assertEqual(need["importWeekly"], 2000)
        self.assertEqual(need["perWeek"], 1680)
        self.assertTrue(need["directImport"])
        self.assertIsNone(need["raiseTarget"])

    def test_short_direct_factory_order_recommends_weekly_import(self):
        need = self.need(self.build([contract(700, destination=("factory", 0))]))
        self.assertEqual(need["status"], "import")
        self.assertEqual(need["raiseImport"], 1700)
        self.assertIsNone(need["raiseTarget"])

    def test_unplanned_input_stays_unplanned(self):
        self.assertEqual(self.need(self.build([]))["status"], "unplanned")

    def test_new_contract_is_visible_in_goods_graph_without_a_delivery(self):
        data = self.build([contract(126000)])
        link = next(link for link in data["supply"]["graph"]["links"]
                    if link["to"] == "depot#1")
        self.assertEqual(link["perDay"], 18000)

    def test_no_recipe_pages_still_preserves_current_contracts(self):
        data = self.build([contract(126000)], with_recipes=False)
        self.assertEqual(data["supply"]["factories"]["depots"][1][WATER]["weekly"], 126000)

    def test_zero_order_is_not_mislabelled_as_a_paused_contract(self):
        data = self.build([contract(0, last=1000)], routed=True)
        self.assertFalse(data["supply"]["imports"][0]["paused"])
        self.assertEqual(self.need(data)["importWeekly"], 0)
        self.assertEqual(self.need(data)["status"], "import")

    def test_direct_and_warehouse_orders_keep_separate_destinations(self):
        data = self.build([contract(2000, destination=("factory", 0)), contract(126000)])
        self.assertEqual(self.need(data)["importWeekly"], 2000)
        self.assertEqual(data["supply"]["factories"]["depots"][1][WATER]["weekly"], 126000)

    def test_direct_import_finding_points_to_factory(self):
        data = self.build([contract(700, destination=("factory", 0))])
        notes = _feed_notes(data["businesses"], data["supply"]["factories"], set())
        self.assertEqual(len(notes), 1)
        self.assertIn("Factory", str(notes))
        self.assertIn("factory#0", str(notes))
        self.assertNotIn("no depot tops it up", str(notes))

    def test_paused_direct_import_does_not_count_as_supply(self):
        need = self.need(self.build([contract(2000, last=2000, active=False,
                                              destination=("factory", 0))]))
        self.assertNotEqual(need["status"], "ok")
        self.assertEqual(need["importWeekly"], 0)

    def test_browser_manual_recipe_choice_recognizes_direct_import(self):
        data = self.build([contract(2000, destination=("factory", 0))], rid="unknown")
        script = "const D = " + json.dumps(data) + "; const LIVE = false;\n"
        script += "const localStorage = {getItem: () => " + json.dumps(json.dumps({"unknown": BEER})) + "};\n"
        script += TEMPLATE[TEMPLATE.index("const LINE_NAMES_KEY"):TEMPLATE.index("/* --- chrome, wired up once")]
        script += "\nconsole.log(JSON.stringify(factoryView()));"
        result = json.loads(subprocess.run(["node", "-e", script], check=True,
                                           text=True, capture_output=True).stdout)
        actual = result["sites"][0]["needs"][0]
        expected = self.need(self.build([contract(2000, destination=("factory", 0))]))
        self.assertEqual(actual["status"], "ok")
        for key in ("importWeekly", "depotNeed", "directImport", "raiseTarget", "status"):
            self.assertEqual(actual[key], expected[key], key)


if __name__ == "__main__":
    unittest.main()
