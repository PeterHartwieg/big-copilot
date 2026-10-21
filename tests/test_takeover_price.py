"""The finder uses BizMan's valuation, never the lease or building price."""
import copy
import math
import unittest
from unittest.mock import patch

from ba_dashboard import _takeover_estimate, _premises, load_item_prices
from ba_save import Save
from tests.test_premises import BUILDINGS, HK_SHOP, NAMES, SHOP, reg


class TakeoverPriceTests(unittest.TestCase):
    def setUp(self):
        self.row = BUILDINGS[HK_SHOP]
        self.reg = reg(HK_SHOP, businessTypeName=SHOP, businessOwnerRivalId="rival",
                       Layout="ShopLayout", dailyIncomes={"$items": [100, 200, 300]})
        self.save = Save({"gameVariables": {"daysPerYear": 60}}, {}, "")
        self.prices = {"takeover": {"types": ["retail"], "layouts": {
            f"{SHOP}|C2|shoplayout": 12345.0}}}
        self.patch = patch("ba_dashboard.load_item_prices", return_value=self.prices)
        self.patch.start()
        self.addCleanup(self.patch.stop)

    def estimate(self):
        return _takeover_estimate(self.save, self.reg, self.row)

    def test_three_years_of_average_income_plus_furnished_layout(self):
        self.assertEqual(self.estimate(), 48345)
        # Difficulty's tax-year length is part of the game calculation.
        self.save.root["gameVariables"]["daysPerYear"] = 30
        self.assertEqual(self.estimate(), 30345)
        # Rent, deposits and a previous offer acceptance field do not price it.
        self.reg.update(RentPerDay=9999, takeoverOfferAcceptRate=0.8)
        self.assertEqual(self.estimate(), 30345)

    def test_losses_do_not_reduce_the_furniture_value(self):
        for incomes in ([-500, -100], [0, 0], [-100, 100]):
            with self.subTest(incomes=incomes):
                self.reg["dailyIncomes"] = {"$items": incomes}
                self.assertEqual(self.estimate(), 12345)

    def test_layout_variant_and_name_identify_the_furniture(self):
        self.reg["Layout"] = "SHOPLAYOUT"
        self.assertEqual(self.estimate(), 48345)
        for layout in ("another layout", "", None):
            self.reg["Layout"] = layout
            self.assertIsNone(self.estimate())
        self.reg["Layout"] = "ShopLayout"
        self.assertIsNone(_takeover_estimate(self.save, self.reg, {**self.row, "v": 1}))
        self.assertIsNone(_takeover_estimate(self.save, self.reg, {**self.row, "layoutKnown": False}))

    def test_missing_or_invalid_inputs_are_unknown_instead_of_partial_prices(self):
        for incomes in (None, {}, {"$items": []}, {"$items": [1, None]},
                        {"$items": [True]}, {"$items": [math.nan]}, {"$items": [math.inf]},
                        {"$items": [1e100]}):
            with self.subTest(incomes=incomes):
                changed = {**self.reg, "dailyIncomes": incomes}
                self.assertIsNone(_takeover_estimate(self.save, changed, self.row))
        for days in (None, 0, -1, True, math.nan):
            self.save.root["gameVariables"]["daysPerYear"] = days
            self.assertIsNone(self.estimate())

    def test_only_rival_businesses_in_supported_buildings_get_an_estimate(self):
        for extra in ({"RentedByPlayer": True}, {"businessOwnerRivalId": ""},
                      {"businessTypeName": "ba:businesstype_empty"}):
            self.assertIsNone(_takeover_estimate(self.save, {**self.reg, **extra}, self.row))
        self.assertIsNone(_takeover_estimate(self.save, self.reg, {**self.row, "t": "warehouse"}))
        self.prices["takeover"] = {}
        self.assertIsNone(self.estimate())

    def test_premises_exposes_the_price_and_refreshes_from_new_income(self):
        self.save.root["BuildingRegistrations"] = {"$items": [self.reg]}
        with patch("ba_dashboard.load_buildings", return_value=BUILDINGS):
            self.assertEqual(_premises(self.save, NAMES, {})["buildings"][0]["takeoverPrice"], 48345)
            self.reg["dailyIncomes"]["$items"] = [500]
            self.assertEqual(_premises(self.save, NAMES, {})["buildings"][0]["takeoverPrice"], 102345)


class ShippedTakeoverFactsTests(unittest.TestCase):
    def test_a_save_registration_joins_the_shipped_rival_interior(self):
        registration = reg(HK_SHOP, businessTypeName=SHOP, businessOwnerRivalId="rival",
                           Layout="SupermarketRivals", dailyIncomes={"$items": [100, 200, 300]})
        save = Save({"gameVariables": {"daysPerYear": 60},
                     "BuildingRegistrations": {"$items": [registration]}}, {}, "")
        with patch("ba_dashboard.load_buildings", return_value=BUILDINGS):
            # The shipped C2 SupermarketRivals furniture is $54,745.
            self.assertEqual(_premises(save, NAMES, {})["buildings"][0]["takeoverPrice"], 90745)

    def test_the_shipped_table_has_layout_values_and_supported_building_types(self):
        facts = copy.deepcopy(load_item_prices()["takeover"])
        self.assertIn("retail", facts["types"])
        self.assertIn("office", facts["types"])
        self.assertNotIn("warehouse", facts["types"])
        self.assertGreater(len(facts["layouts"]), 200)
        for key, value in facts["layouts"].items():
            self.assertEqual(len(key.split("|")), 3)
            self.assertTrue(math.isfinite(value) and value >= 0, key)


if __name__ == "__main__":
    unittest.main()
