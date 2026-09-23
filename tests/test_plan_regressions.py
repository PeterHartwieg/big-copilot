"""Portable regressions for planner scope and physical supply chains."""
import json
from pathlib import Path
import unittest

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


def contract(amount, active=True, warehouse=("Depot", 1), smart=False):
    return {
        "importAddress": ("Importer", 2), "isActive": active,
        **({"isTarget": True} if smart else {}),
        "products": [{"itemName": ITEM + "water", "amount": amount,
                      "assignedWarehouse": warehouse}],
    }


class PlannerRegressions(unittest.TestCase):
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
        self.assertEqual((source["ordered"], source["smart"], source["target"], source["plain"]),
                         (3000, True, 3000, 0))
        self.assertTrue(source["contracts"][0]["smart"])
        plain = self.water([contract(3000)])
        self.assertEqual((plain["smart"], plain["target"], plain["plain"]), (False, None, 3000))

    def test_two_levels_hold_the_higher_at_one_depot_and_add_across_depots(self):
        same = self.water([contract(3000, smart=True), contract(1000, smart=True)])
        self.assertEqual((same["ordered"], same["target"]), (3000, 3000))
        apart = self.water([contract(3000, smart=True),
                            contract(1000, smart=True, warehouse=("Other", 3))])
        self.assertEqual((apart["ordered"], apart["target"]), (4000, 4000))

    def test_a_level_beside_a_plain_order_follows_the_delivery_order(self):
        level_first = self.water([contract(1000, smart=True), contract(400)])
        self.assertEqual((level_first["ordered"], level_first["target"], level_first["plain"]),
                         (1400, 1000, 400))
        plain_first = self.water([contract(400), contract(1000, smart=True)])
        self.assertEqual(plain_first["ordered"], 1000)

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

    def test_service_revenue_catalogue_is_preserved(self):
        self.plan()
        self.assertIn(ITEM + "gymcovercharge", self.catalogue[GYM])
        self.assertEqual(len(self.catalogue[HAIR]), 4)
        self.assertIn(ITEM + "haircuttingfee", self.catalogue[HAIR])


if __name__ == "__main__":
    unittest.main()
