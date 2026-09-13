"""Supply regressions for GitHub #17 and #18, using portable save fixtures."""
import json
import subprocess
import unittest
from unittest.mock import patch

from ba_dashboard import Names, TEMPLATE, _feed_notes, _scheduled_import_gap, _supply, site_key
from test_recipe_identity import BEER, WATER, RID, SaveStub


def contract(amount, *, last=0, active=True, destination=("depot", 1), pier=1):
    return {
        "importAddress": ("pier", pier), "isActive": active, "nextDeliveryDay": 14,
        "products": [{"itemName": WATER, "amount": amount,
                      "amountOrderedLastWeek": last, "assignedWarehouse": destination}],
    }


class ImportRoutesTests(unittest.TestCase):
    def test_staggered_schedule_with_sufficient_early_supply_has_no_gap(self):
        result = _scheduled_import_gap(240, 240, [1] * 7, 10,
                                       [{"day": 11, "amount": 1300}, {"day": 16, "amount": 700}], .5)
        self.assertEqual(result["catchUp"], 0)
        self.assertIsNone(result["runsOut"])
        self.assertEqual(result["cover"], 5.5)

    def test_schedule_counts_today_drop_and_partial_day(self):
        result = _scheduled_import_gap(0, 100, [1] * 7, 10,
                                       [{"day": 10, "amount": 100}, {"day": 12, "amount": 600}], .5)
        self.assertEqual(result["catchUp"], 50)
        self.assertEqual(result["runsOut"], 11)

    def test_same_day_contracts_use_existing_single_delivery_check(self):
        self.assertIsNone(_scheduled_import_gap(0, 100, [1] * 7, 10,
                          [{"day": 12, "amount": 100}, {"day": 12, "amount": 600}], .5))

    def build(self, contracts, *, routed=False, rid=RID, with_recipes=True, target=300):
        save = SaveStub([[rid]], hours=24)
        save.address = lambda value: value
        save.root.update(Hour=12, Minute=0, importPartnerships=contracts,
                         logisticsManagerPlans=[])
        if routed:
            save.root["logisticsManagerPlans"] = [{
                "targetAddress": ("depot", 1), "destinations": [{
                    "deliveryTargetAddress": ("factory", 0),
                    "stockTargets": [{"itemName": WATER, "targetAmount": target}],
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

    def test_paused_and_zero_history_do_not_inflate_active_fallback_draw(self):
        data = self.build([contract(1000, last=1000), contract(2000, last=2000, pier=2),
                           contract(9000, last=9000, active=False, pier=3),
                           contract(0, last=500, pier=4)], routed=True)
        row = next(r for r in data["supply"]["imports"] if r["s"] == 1)
        self.assertEqual(row["lastWeek"], 3000)
        self.assertEqual(row["perDay"], 429)
        self.assertEqual(row["basis"], "order")
        self.assertIsNone(row["reason"])
        self.assertIsNone(row["catchUp"])

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

    def test_direct_order_covers_factory_even_with_existing_daily_route(self):
        need = self.need(self.build([contract(2000, destination=("factory", 0))], routed=True))
        self.assertEqual(need["status"], "ok")
        self.assertEqual(need["importSite"], 0)
        self.assertEqual(need["directNeed"], 1680)
        self.assertEqual(need["warehouseNeed"], 0)

    def test_partial_direct_order_reduces_shared_warehouse_requirement(self):
        need = self.need(self.build([contract(840, destination=("factory", 0)), contract(900)], routed=True))
        self.assertEqual(need["status"], "ok")
        self.assertEqual(need["directNeed"], 840)
        self.assertEqual(need["warehouseNeed"], 840)
        self.assertEqual(need["depotNeed"], 840)
        self.assertEqual(need["dailyNeed"], 240)

    def test_partial_direct_import_does_not_lower_daily_fill_target(self):
        need = self.need(self.build([contract(840, destination=("factory", 0)), contract(900)],
                                   routed=True, target=130))
        self.assertEqual(need["status"], "target")
        self.assertEqual(need["raiseTarget"], 300)
        self.assertEqual(need["warehouseNeed"], 840)

    def test_staggered_deliveries_preserve_stock_cover_for_cross_row_ranking(self):
        import test_import_routes as fixtures
        real_supply = _supply
        def supply(save, names, businesses, *args, **kwargs):
            businesses[1]["lines"][0].update(rate=240, units=4800)
            return real_supply(save, names, businesses, *args, **kwargs)
        early, late = contract(50), contract(1950, pier=2)
        early["nextDeliveryDay"], late["nextDeliveryDay"] = 11, 16
        with patch.object(fixtures, "_supply", supply):
            data = self.build([early, late])
        row = next(r for r in data["supply"]["imports"] if r["s"] == 1)
        self.assertEqual(row["cover"], 5.5)
        self.assertEqual(row["stockCover"], 20)
        self.assertEqual(row["coverFit"], "ok")

    def test_measured_warehouse_draw_marks_zero_order_as_short(self):
        import test_import_routes as fixtures
        real_supply = _supply
        def supply(save, names, businesses, *args, **kwargs):
            businesses[1]["lines"][0].update(rate=200, units=20000)
            return real_supply(save, names, businesses, *args, **kwargs)
        with patch.object(fixtures, "_supply", supply):
            data = self.build([contract(0, last=1000)])
        row = next(r for r in data["supply"]["imports"] if r["s"] == 1)
        self.assertEqual(row["orderFit"], "short")
        self.assertEqual(row["reason"], "order")

    def test_browser_parity_for_paused_and_mixed_routes(self):
        cases = [
            ([contract(2000, active=False, destination=("factory", 0))], False, 300),
            ([contract(2000, destination=("factory", 0))], True, 300),
            ([contract(840, destination=("factory", 0)), contract(900)], True, 300),
            ([contract(840, destination=("factory", 0)), contract(900)], True, 130),
            ([contract(840, destination=("factory", 0)), contract(100)], True, 300),
        ]
        for contracts, routed, target in cases:
            with self.subTest(contracts=contracts, routed=routed):
                data = self.build(contracts, routed=routed, rid="unknown", target=target)
                script = "const D = " + json.dumps(data) + "; const LIVE = false;\n"
                script += "const localStorage = {getItem: () => " + json.dumps(json.dumps({"unknown": BEER})) + "};\n"
                script += TEMPLATE[TEMPLATE.index("const LINE_NAMES_KEY"):TEMPLATE.index("/* --- chrome, wired up once")]
                script += "\nconsole.log(JSON.stringify(factoryView()));"
                result = json.loads(subprocess.run(["node", "-e", script], check=True,
                                                   text=True, capture_output=True).stdout)
                actual = result["sites"][0]["needs"][0]
                expected = self.need(self.build(contracts, routed=routed, target=target))
                for key in ("status", "importWeekly", "importPaused", "directImport", "directWeekly",
                            "directNeed", "warehouseNeed", "dailyNeed", "depotNeed", "depotStock",
                            "raiseImport", "raiseTarget", "importSite", "from"):
                    self.assertEqual(actual[key], expected[key], key)

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

    def test_paused_direct_contract_before_first_delivery_requires_resume(self):
        data = self.build([contract(2000, active=False, destination=("factory", 0))])
        need = self.need(data)
        self.assertEqual(need["status"], "paused")
        self.assertIsNone(need["raiseImport"])
        self.assertEqual(data["supply"]["factories"]["depots"][0][WATER]["pausedWeekly"], 2000)

    def test_staggered_deliveries_do_not_hide_gap_after_small_first_drop(self):
        import test_import_routes as fixtures
        real_init, real_supply = SaveStub.__init__, _supply
        def init(save, *args, **kwargs):
            real_init(save, *args, **kwargs)
            save.root["BuildingRegistrations"].append({
                "RentedByPlayer": True, "StreetName": "depot", "StreetNumber": 1,
                "itemInstances": [], "deliveryTransactions": [
                    {"dayOfDelivery": d, "deliveryItems": [
                        {"itemName": WATER, "amountDelivered": -240}]}
                    for d in range(3, 10)],
            })
        def supply(save, names, businesses, *args, **kwargs):
            businesses[1]["lines"][0]["units"] = 240
            return real_supply(save, names, businesses, *args, **kwargs)
        early, late = contract(50, last=50), contract(1950, last=1950, pier=2)
        early["nextDeliveryDay"], late["nextDeliveryDay"] = 11, 16
        with patch.object(SaveStub, "__init__", init), patch.object(fixtures, "_supply", supply):
            data = self.build([early, late], routed=True)
        row = next(r for r in data["supply"]["imports"] if r["s"] == 1)
        self.assertEqual(row["orderFit"], "ok")
        self.assertEqual(row["coverFit"], "short")
        self.assertEqual(row["reason"], "shortfall")
        # Half of day 10 plus days 11-15, minus stock and the small day-11 drop.
        self.assertEqual(row["catchUp"], 1030)
        self.assertEqual(row["coverageUntil"], 16)

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
