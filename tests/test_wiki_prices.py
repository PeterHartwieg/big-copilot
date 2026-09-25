"""Configured prices and the supported part of MarketInsider's minimum."""
import unittest
from unittest.mock import patch

from ba_dashboard import History, _business, _configured_price, _market, _wiki_market_prices
from ba_save import Names, Save

ITEM = "ba:itemname_coffee"


def shop(number, price, **fields):
    return {"BusinessName": "Shop", "StreetName": "street", "StreetNumber": number,
            "retailPrices": {"$items": [{"itemName": ITEM, "price": price}]}, **fields}


class WikiPricesTests(unittest.TestCase):
    def prices(self, shops, events=()):
        save = Save({"BuildingRegistrations": {"$items": shops},
                     "marketEvents": {"$items": list(events)}}, {}, "")
        with patch("ba_dashboard.load_buildings", return_value={
            ("street", 1): {"h": "midtown"}, ("street", 2): {"h": "midtown"},
            ("street", 3): {"h": "murrayhill"},
        }):
            return _wiki_market_prices(save, 10)

    def test_minimum_includes_player_and_other_business_types_without_player_stock(self):
        prices, gaps = self.prices([
            shop(1, 4.25, RentedByPlayer=True, businessTypeName="coffee"),
            shop(2, 5.50, businessTypeName="restaurant"), shop(3, 1.25),
        ])
        self.assertEqual(prices[(ITEM, "ba:neighborhood_midtown")], 4.25)
        self.assertEqual(prices[(ITEM, "ba:neighborhood_murrayhill")], 1.25)
        self.assertEqual(gaps, {})
        prices, _ = self.prices([shop(1, 4.25), shop(2, 2.50, businessTypeName="other")])
        self.assertEqual(prices[(ITEM, "ba:neighborhood_midtown")], 2.50)

    def test_closures_unnamed_nonpositive_and_invalid_prices_do_not_qualify(self):
        prices, _ = self.prices([
            shop(1, 4.25), shop(2, 1, temporarilyClosed=True), shop(2, 1, BusinessName=""),
            *[shop(2, p) for p in (0, -1, None, float("nan"), float("inf"), True, "2")],
        ])
        self.assertEqual(prices, {(ITEM, "ba:neighborhood_midtown"): 4.25})

    def test_item_variants_and_duplicates(self):
        other = shop(1, 1)
        other["retailPrices"]["$items"][0]["itemName"] = ITEM + "variant"
        prices, _ = self.prices([shop(1, 4.25), shop(1, 4.25), other])
        self.assertEqual(prices[(ITEM, "ba:neighborhood_midtown")], 4.25)
        self.assertEqual(prices[(ITEM + "variant", "ba:neighborhood_midtown")], 1)

    def test_supply_events_and_unmapped_sellers_explicitly_block_a_claim(self):
        for kind in (3, 4):
            with self.subTest(kind=kind):
                _, gaps = self.prices([shop(1, 4)], [{"type": kind, "itemName": ITEM,
                                                     "startDay": 9, "durationInDays": 3}])
                self.assertEqual(gaps[ITEM], "Supply-event pricing unavailable")
        _, gaps = self.prices([shop(1, 4), shop(99, 2)])
        self.assertEqual(gaps[ITEM], "Seller location unavailable")
        _, gaps = self.prices([shop(1, 4)], [
            {"type": 3, "itemName": ITEM, "stopped": True}, {"type": 2, "itemName": ITEM},
        ])
        self.assertEqual(gaps, {})

    def test_only_active_shelf_events_block_the_affected_item(self):
        base = {"type": 3, "itemName": ITEM, "startDay": 9, "durationInDays": 3}
        for changes in ({"startDay": 7}, {"startDay": 11}, {"durationInDays": 0},
                        {"durationInDays": None}, {"stopped": True}, {"type": 5},
                        {"type": 6}, {"itemName": ""}, {"itemName": None}):
            with self.subTest(changes=changes):
                _, gaps = self.prices([shop(1, 4)], [{**base, **changes}])
                self.assertEqual(gaps, {})
        _, gaps = self.prices([shop(1, 4)], [{**base, "itemName": ITEM + "other"}])
        self.assertNotIn(ITEM, gaps)
        self.assertIn(ITEM + "other", gaps)

    def test_positive_subcent_price_qualifies_before_currency_rounding(self):
        prices, gaps = self.prices([shop(1, 0.001), shop(2, 4)])
        self.assertEqual(prices[(ITEM, "ba:neighborhood_midtown")], 0)
        self.assertEqual(gaps, {})

    def test_no_sellers_does_not_invent_a_fallback(self):
        self.assertEqual(self.prices([]), ({}, {}))

    def test_configured_zero_is_distinct_from_missing_and_invalid(self):
        self.assertEqual(_configured_price(0), 0)
        self.assertEqual(_configured_price(205.1999969), 205.20)
        for value in (None, False, -1, "4", float("nan"), float("inf")):
            self.assertIsNone(_configured_price(value))

    def test_market_payload_withholds_blocked_values_and_keeps_demand(self):
        save = Save({"BuildingRegistrations": {"$items": [shop(1, 4.25)]},
                     "marketEvents": {"$items": []}, "logisticsManagerPlans": {"$items": []},
                     "productMarketEntries": {"$items": [{"itemName": ITEM,
                         "demandValues": {"$items": [{"neighborhood": "ba:neighborhood_midtown", "demand": 60,
                             "providers": 1, "hasPlayerMonopoly": False}]}}]}}, {}, "")
        with patch("ba_dashboard.load_buildings", return_value={("street", 1): {"h": "midtown"}}), \
                patch("ba_dashboard._type_catalogue", return_value={}):
            def cell():
                return _market(save, Names({"ba:neighborhood_midtown": "Midtown"}), [], 10, History(None), "test")["rows"][0]["cells"][0]
            self.assertEqual(cell()["marketPrice"], 4.25)
            self.assertNotIn("marketPriceNote", cell())
            save.root["marketEvents"]["$items"] = [{"type": 3, "itemName": ITEM,
                                                     "startDay": 9, "durationInDays": 3}]
            self.assertIsNone(cell()["marketPrice"])
            self.assertIn("Supply-event", cell()["marketPriceNote"])
            self.assertEqual(cell()["demand"], 60)
            save.root["marketEvents"]["$items"][0]["startDay"] = 7
            self.assertEqual(cell()["marketPrice"], 4.25)
            save.root["marketEvents"]["$items"] = []
            save.root["BuildingRegistrations"]["$items"].append(shop(99, 2))
            self.assertIsNone(cell()["marketPrice"])
            self.assertIn("Seller location", cell()["marketPriceNote"])
            save.root["BuildingRegistrations"]["$items"] = []
            self.assertIsNone(cell()["marketPrice"])
            self.assertIn("fallback unavailable", cell()["marketPriceNote"])

    def test_business_exposes_configured_price_without_sales(self):
        b = shop(1, 205.20, businessTypeName="ba:businesstype_coffeeshop",
                 orderHistory={"$items": []}, itemInstances={"$items": [
                     {"$v": {"cargoInstances": {"$items": [
                         {"itemName": "unpriced", "amount": 5}]}}}]})
        b["retailPrices"]["$items"].append({"itemName": "free", "price": 0})
        result = _business(Save({}, {}, ""), Names({}), b, ("street", 1), {}, [], {}, 10)
        lines = {line["slug"]: line for line in result["lines"]}
        self.assertEqual(lines[ITEM]["configuredPrice"], 205.20)
        self.assertEqual(lines["free"]["configuredPrice"], 0)
        self.assertIsNone(lines["unpriced"]["configuredPrice"])


if __name__ == "__main__":
    unittest.main()
