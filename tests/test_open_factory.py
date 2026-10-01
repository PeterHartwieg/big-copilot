"""Expansion › Plan a factory: the facts a factory plan is priced from
(_open_factory(), issue #172).

What the board prices with: each recipe product's and ingredient's wholesale
price, import price index, box size and importer cap; each workstation's kit at
list price; the pallet shelf; the factory's truck and a new depot's van; what
each warehouse and factory the player runs holds; and headquarters' purchasing
agents and logistics managers against what they manage. The fixtures are
synthetic: tests/save_fixtures.py's trading company (a liquor store, a gift
shop, a depot and a brewery) and small hand-made tables. Never a real save.
"""
import os
import sys
import tempfile
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))

import ba_dashboard  # noqa: E402
import save_fixtures  # noqa: E402
from ba_save import Names, load_save  # noqa: E402

BEER, WATER = "ba:itemname_beer", "ba:itemname_water"
FACTORY, DEPOT = "ba:street_eighthavenue#8", "ba:street_eighthavenue#4"


class KitTests(unittest.TestCase):
    def test_a_workstation_is_its_assembly_machine_and_its_production_machines_at_list_price(self):
        names = Names({
            "help_factory_workstation_bottledgoods_content": (
                "A **Bottled Goods Workstation** is created by adding Production Machines:\n"
                "* [Bottling Machine](furniture-bottlingmachine)\n"
                "* [Industrial Blending Machine](furniture-industrialblendingmachine)\n\n"
                "To an Assembly Machine\n* [Food Assembly Machine](furniture-foodassemblymachine)\n\n"
                "The workstation can be used to create:\n* [Beer](recipes-beerrecipe)"),
        })
        prices = {"items": {"ba:itemname_foodassemblymachine": {"p": 60000},
                            "ba:itemname_bottlingmachine": {"p": 27500},
                            "ba:itemname_industrialblendingmachine": {"p": 45000}}}
        kits = ba_dashboard._factory_kits(names, prices)
        self.assertEqual(kits, {"bottledgoods": [["ba:itemname_foodassemblymachine", 60000.0],
                                                 ["ba:itemname_bottlingmachine", 27500.0],
                                                 ["ba:itemname_industrialblendingmachine", 45000.0]]})


class StubSave:
    """Just what _factory_days() reads: the day and plain lists."""
    def __init__(self, day):
        self.root = {"Day": day}

    def items(self, v):
        return v or []


def pickup(day, *amounts):
    return {"dayOfDelivery": day, "deliveryItems": [{"itemName": BEER, "amountDelivered": a} for a in amounts]}


class FactoryDaysTests(unittest.TestCase):
    """What left a factory a day, per item: the delivery log's pickups, exports
    included, and the exports alone from its sales; never what it made and
    still holds."""

    def test_each_finished_day_is_the_log_out_with_the_exports_beside_it(self):
        reg = {"deliveryTransactions": [pickup(10, -500, -300), pickup(10, -200), pickup(11, -900, 400), pickup(12, -50)],
               "orderHistory": [{"dayNumber": 10, "itemSales": [{"itemName": BEER, "amountSold": 200}]},
                                {"dayNumber": 11, "itemSales": [{"itemName": BEER, "amountSold": 0}]}]}
        # Arrivals (positive) are not output; day 12 is today and still running.
        self.assertEqual(ba_dashboard._factory_days(StubSave(12), reg),
                         {"first": 10, "covered": [1, 1], "out": {BEER: [1000, 900]}, "sold": {BEER: [200, 0]}})

    def test_a_full_log_drops_its_oldest_day_and_a_quiet_day_is_a_zero(self):
        log = [pickup(5, -10)] + [pickup(7, -1)] * (ba_dashboard.DELIVERY_LOG_SIZE - 1)
        days = ba_dashboard._factory_days(StubSave(8), {"deliveryTransactions": log, "orderHistory": []})
        self.assertEqual(days, {"first": 6, "covered": [0, 0], "out": {BEER: [0, ba_dashboard.DELIVERY_LOG_SIZE - 1]}, "sold": {}})

    def test_a_day_the_sales_history_no_longer_holds_is_unknown_not_zero(self):
        reg = {"deliveryTransactions": [pickup(3, -10), pickup(4, -10)],
               "orderHistory": [{"dayNumber": 4, "itemSales": [{"itemName": BEER, "amountSold": 4}]}]}
        self.assertEqual(ba_dashboard._factory_days(StubSave(5), reg)["sold"], {BEER: [None, 4]})

    def test_a_factory_that_never_exported_still_says_which_days_its_sales_cover(self):
        reg = {"deliveryTransactions": [pickup(3, -10), pickup(4, -10)],
               "orderHistory": [{"dayNumber": 3, "itemSales": []}, {"dayNumber": 4, "itemSales": []}]}
        days = ba_dashboard._factory_days(StubSave(5), reg)
        self.assertEqual((days["covered"], days["sold"]), ([1, 1], {}))

    def test_no_log_is_no_days(self):
        self.assertEqual(ba_dashboard._factory_days(StubSave(9), {}), {})


class PayloadTests(unittest.TestCase):
    """_open_factory() end to end on the synthetic trading company."""

    @classmethod
    def setUpClass(cls):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "Data.hsg")
            save_fixtures.write_data_save(path, save_fixtures.DAY)
            cls.save = load_save(path)
            cls.names = Names(save_fixtures.data_names())
            cls.payload = ba_dashboard.extract(cls.save, cls.names, None)
        cls.facts = cls.payload["openFactory"]

    def test_the_payload_carries_every_part_the_board_reads(self):
        self.assertEqual(set(self.facts), {"game", "skills", "products", "kits", "shelf", "vehicles",
                                           "items", "vendors", "sites", "hq"})

    def test_each_recipe_product_and_ingredient_has_its_price_box_and_cap(self):
        rules = ba_dashboard.load_store_rules()["products"]
        for slug in (BEER, WATER):
            row = self.facts["products"][slug]
            self.assertEqual(row["w"], rules[slug]["w"])
            self.assertEqual(row["bx"], rules[slug]["bx"])
            self.assertEqual(row["mo"], rules[slug]["mo"])
            self.assertGreater(row["i"], 0)

    def test_the_game_multipliers_and_the_agent_planned_at_skill_100_when_there_is_none(self):
        game = self.facts["game"]
        self.assertEqual(game["installFee"], ba_dashboard.INSTALL_FEE_PER_M2)
        self.assertEqual(game["delivery"], ba_dashboard.FURNITURE_DELIVERY_FEE)
        self.assertEqual(game["agent"], 100)
        self.assertIsNone(game["agentName"])
        self.assertEqual(game["driverHours"], 5.7)

    def test_the_skills_table_gives_the_base_wages_a_factory_plan_pays(self):
        self.assertEqual(self.facts["skills"]["ba:skill_factoryworker"], 12)
        self.assertEqual(self.facts["skills"]["ba:skill_deliverydriver"], 18)
        self.assertEqual(self.facts["skills"]["ba:skill_purchasingagent"], 30)

    def test_the_kit_shelf_and_vehicles_are_priced_from_the_tables(self):
        self.assertEqual(self.facts["kits"]["bottledgoods"][0], ["ba:itemname_foodassemblymachine", 60000.0])
        self.assertEqual(self.facts["shelf"], {"item": "ba:itemname_palletshelf", "p": 2500.0, "cc": 60})
        truck = self.facts["vehicles"]["truck"]
        self.assertEqual((truck["type"], truck["p"], truck["dealer"]), ("ba:vehicletype_freighttruckt1", 98000.0, "General US Trucks"))
        self.assertEqual(self.facts["vehicles"]["van"]["p"], 72500.0)
        # Who sells the machines: the Factory Supply Depot.
        self.assertIn("ba:street_twentyfifthstreet#2", self.facts["items"]["ba:itemname_foodassemblymachine"]["v"])
        self.assertIn("ba:street_twentyfifthstreet#2", self.facts["vendors"])

    def test_each_warehouse_and_factory_says_what_it_holds(self):
        sites = self.facts["sites"]
        self.assertEqual(sites[FACTORY]["kind"], "factory")
        self.assertEqual(sites[DEPOT]["kind"], "depot")
        # The depot imports water on an active contract and parks a truck nobody drives.
        self.assertEqual(sites[DEPOT]["imports"], [[WATER, True]])
        self.assertEqual(sites[DEPOT]["vehicles"], [["ba:vehicletype_freighttruckt1", False]])
        self.assertEqual(sites[FACTORY]["vehicles"], [])
        self.assertIsInstance(sites[FACTORY]["days"], dict)
        self.assertNotIn("days", sites[DEPOT])

    def test_headquarters_counts_agents_against_contracts_and_managers_against_sites(self):
        self.assertEqual(self.facts["hq"], {"agents": 0, "contracts": 1, "managers": 0, "managed": 2})

    def test_an_ingredient_the_help_names_another_way_is_read_under_the_rules_name(self):
        """rawtomato on the recipe page, tomato in the store rules: matched by label."""
        recipes = {"ba:itemname_salad": {"slug": "ba:itemname_salad", "item": "Salad", "out": 50, "workstation": "food",
                                         "ingredients": [{"slug": "ba:itemname_rawtomato", "item": "Bag of Tomatoes", "per": 20}]}}
        names = Names({**save_fixtures.data_names(), "ba:itemname_tomato": "Bag of Tomatoes",
                       "ba:itemname_rawtomato": "Bag of Tomatoes"})
        rules = {**ba_dashboard.load_store_rules()}
        rules["products"] = {**rules["products"], "ba:itemname_tomato": {"w": 0.29, "bx": 500, "mo": 25000}}
        rules["products"].pop("ba:itemname_rawtomato", None)
        with mock.patch.object(ba_dashboard, "load_store_rules", return_value=rules):
            out = ba_dashboard._open_factory(self.save, names, self.save.items(self.save.root["BuildingRegistrations"]),
                                             self.payload["businesses"], recipes, [])
        self.assertEqual(out["products"]["ba:itemname_rawtomato"], {"w": 0.29, "i": 1.0, "bx": 500, "mo": 25000})

    def test_no_store_rules_means_nothing_to_price(self):
        with mock.patch.object(ba_dashboard, "load_store_rules", return_value={"products": {}}):
            self.assertEqual(ba_dashboard._open_factory(self.save, self.names, [], [], {}, []), {})


if __name__ == "__main__":
    unittest.main()
