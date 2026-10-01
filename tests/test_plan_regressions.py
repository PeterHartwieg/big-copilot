"""Portable regressions for planner scope and physical supply chains."""
import json
from pathlib import Path
import unittest
from tests.i18n_check import MsgAsserts, msg_param

from ba_dashboard import Names, _plan, _recipes, _type_catalogue_from_help


ROOT = Path(__file__).resolve().parents[1]
ITEM = "ba:itemname_"
HAIR = "ba:businesstype_hairdresser"
GYM = "ba:businesstype_gym"


class SaveStub:
    def __init__(self, contracts=()):
        self.root = {"importPartnerships": list(contracts)}

    def items(self, value):
        return value or []

    def address(self, value):
        return value


def contract(amount, active=True, warehouse=("Depot", 1), smart=False, importer=("Importer", 2)):
    return {
        "importAddress": importer, "isActive": active,
        **({"isTarget": True} if smart else {}),
        "products": [{"itemName": ITEM + "water", "amount": amount,
                      "assignedWarehouse": warehouse}],
    }


class PlannerRegressions(MsgAsserts, unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.names = Names(json.loads((ROOT / "web/py/gametext.json").read_text(encoding="utf-8")))
        cls.catalogue = _type_catalogue_from_help(cls.names)
        cls.recipes = _recipes(cls.names)

    def plan(self, contracts=(), businesses=()):
        return _plan(SaveStub(contracts), self.names, list(businesses), self.catalogue,
                     self.recipes, {}, {"unit": {}, "day": 1}, {})

    def test_all_active_contracts_contribute_even_when_last_is_zero(self):
        result = self.plan([contract(200), contract(300, warehouse=("Other", 3)), contract(0)])
        self.assertEqual(result["sources"][ITEM + "water"]["ordered"], 500)

    def test_paused_contract_does_not_replace_active_supply(self):
        result = self.plan([contract(200), contract(900, active=False)])
        self.assertEqual(result["sources"][ITEM + "water"]["ordered"], 200)
        self.assertEqual(result["sources"][ITEM + "water"]["paused"], 900)
        self.assertEqual(len(result["sources"][ITEM + "water"]["contracts"]), 2)

    def test_paused_only_contract_is_not_active_supply(self):
        source = self.plan([contract(900, active=False)])["sources"][ITEM + "water"]
        self.assertEqual(source["ordered"], 0)
        self.assertEqual(source["paused"], 900)
        self.assertFalse(source["active"])

    def water(self, contracts):
        return self.plan(contracts)["sources"][ITEM + "water"]

    def test_a_smart_delivery_line_is_a_stock_level(self):
        source = self.water([contract(3000, smart=True)])
        self.assertEqual((source["ordered"], source["smart"]), (3000, True))
        self.assertEqual(source["depots"], [{"warehouse": "1 Depot", "smart": True, "level": 3000,
                                             "importer": "2 Importer", "name": "2 Importer",
                                             "plainBefore": 0,
                                             "plainAfter": 0, "weekly": 3000}])
        self.assertTrue(source["contracts"][0]["smart"])
        plain = self.water([contract(3000)])
        self.assertEqual(plain["smart"], False)
        self.assertEqual(plain["depots"], [{"warehouse": "1 Depot", "smart": False, "level": None,
                                            "importer": None, "name": None, "plainBefore": 0,
                                            "plainAfter": 0, "weekly": 3000}])

    def test_two_levels_hold_the_higher_at_one_depot_and_stay_apart_across_depots(self):
        same = self.water([contract(3000, smart=True), contract(1000, smart=True)])
        self.assertEqual(same["ordered"], 3000)
        self.assertEqual([d["level"] for d in same["depots"]], [3000])
        apart = self.water([contract(3000, smart=True),
                            contract(1000, smart=True, warehouse=("Other", 3))])
        # The week adds up across depots; the levels are each depot's own.
        self.assertEqual(apart["ordered"], 4000)
        self.assertEqual([(d["warehouse"], d["level"]) for d in apart["depots"]],
                         [("1 Depot", 3000), ("3 Other", 1000)])

    def test_a_level_beside_a_plain_order_follows_the_delivery_order(self):
        level_first = self.water([contract(1000, smart=True), contract(400)])
        self.assertEqual(level_first["ordered"], 1400)
        self.assertEqual([(d["level"], d["plainAfter"]) for d in level_first["depots"]], [(1000, 400)])
        plain_first = self.water([contract(400), contract(1000, smart=True)])
        self.assertEqual(plain_first["ordered"], 1000)
        self.assertEqual([(d["level"], d["plainBefore"], d["plainAfter"]) for d in plain_first["depots"]],
                         [(1000, 400, 0)])

    def test_the_contract_holding_the_level_is_numbered_as_on_the_logistics_page(self):
        # Plain 0, level 500, level 600 from one importer, 300 from another:
        # the 600 holds, and it is that importer's 3rd of 3 contracts, zero
        # one included, as the Logistics page counts them (_level_name).
        source = self.water([contract(0), contract(500, smart=True), contract(600, smart=True),
                             contract(300, importer=("Other", 3))])
        [depot] = source["depots"]
        self.assertEqual(depot["level"], 600)
        self.assertMsg(depot["name"], "sb.py.levelName", importer="2 Importer", n=3,
                       nth=msg_param("sb.py.ord.rd", n=3))

    def test_a_paused_level_is_kept_apart_and_named_as_one(self):
        source = self.water([contract(3000, active=False, smart=True)])
        self.assertEqual((source["ordered"], source["paused"], source["smart"]), (0, 3000, True))

    def test_service_sales_do_not_become_consumable_demand(self):
        business = {"status": "retail", "revenue": 1000, "typeSlug": HAIR,
                    "lines": [{"slug": ITEM + "haircuttingfee", "price": 50, "rate": 20}]}
        own = self.plan(businesses=[business])["own"][HAIR]
        self.assertEqual(own["shops"], 1)
        self.assertEqual(own["perDay"], {})

    def test_hairdresser_has_one_physical_consumable_with_recipe(self):
        products = self.plan()["catalogue"][HAIR]["products"]
        self.assertEqual(products, [ITEM + "haircareproduct"])
        self.assertIn(products[0], self.recipes)
        self.assertEqual(self.recipes[products[0]]["ingredients"][0]["slug"], ITEM + "haircareformula")

    def test_gym_fee_is_not_an_import_or_factory_product(self):
        products = self.plan()["catalogue"][GYM]["products"]
        self.assertNotIn(ITEM + "gymcovercharge", products)
        self.assertIn(ITEM + "energydrink", products)
        self.assertIn(ITEM + "sodacan", products)

    def test_a_ticket_is_a_service_not_a_bought_in_product(self):
        # Issue #159: the planner called a cinema ticket "bought in" from an importer.
        catalogue = self.plan()["catalogue"]
        for kind, ticket in (("cinema", "cinematicket"), ("theater", "theaterticket")):
            entry = catalogue["ba:businesstype_" + kind]
            self.assertNotIn(ITEM + ticket, entry["products"])
            self.assertIn(ITEM + ticket, entry["services"])
            # Its concessions keep the type in the planner.
            self.assertIn(ITEM + "popcorn", entry["products"])

    def test_extra_is_what_a_type_can_additionally_sell(self):
        # Issue #162: the game's own list for the type, weight under 1, heaviest first,
        # equal weights in the game's order.
        florist = self.plan()["catalogue"]["ba:businesstype_florist"]
        self.assertEqual(florist["extra"], [
            [ITEM + "sodacan", 0.8], [ITEM + "energydrink", 0.8], [ITEM + "umbrella", 0.75],
            [ITEM + "cheapgift", 0.6], [ITEM + "expensivegift", 0.6]])

    def test_extra_never_repeats_a_main_product_or_a_service(self):
        catalogue = self.plan()["catalogue"]
        for kind, entry in catalogue.items():
            for slug, weight in entry["extra"]:
                self.assertTrue(0 < weight < 1, (kind, slug))
                self.assertNotIn(slug, entry["products"], kind)
                self.assertNotIn(slug, entry["services"], kind)
        # A cinema's concessions are its range already, weights under 1 or not.
        self.assertEqual(catalogue["ba:businesstype_cinema"]["extra"], [])
        self.assertEqual(catalogue["ba:businesstype_lawfirm"]["extra"], [])

    def test_an_extra_the_shops_sell_is_measured(self):
        business = {"status": "retail", "revenue": 1000, "typeSlug": "ba:businesstype_florist",
                    "lines": [{"slug": ITEM + "cheapflower", "price": 25, "rate": 150},
                              {"slug": ITEM + "umbrella", "price": 24, "rate": 40},
                              {"slug": ITEM + "novel", "price": 20, "rate": 9}]}
        result = self.plan(businesses=[business])
        # Measured beats typed: the umbrella's rate is the shop's; a product the
        # type cannot sell at all stays out.
        self.assertEqual(result["own"]["ba:businesstype_florist"]["perDay"],
                         {ITEM + "cheapflower": 150, ITEM + "umbrella": 40})
        # Only the extras carry a seller count: the page spreads them over every shop.
        self.assertEqual(result["own"]["ba:businesstype_florist"]["sellers"], {ITEM + "umbrella": 1})
        self.assertIn(ITEM + "umbrella", result["items"])

    def test_service_revenue_catalogue_is_preserved(self):
        self.plan()
        self.assertIn(ITEM + "gymcovercharge", self.catalogue[GYM])
        self.assertEqual(len(self.catalogue[HAIR]), 4)
        self.assertIn(ITEM + "haircuttingfee", self.catalogue[HAIR])


if __name__ == "__main__":
    unittest.main()
