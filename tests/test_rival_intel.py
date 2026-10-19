"""Rival product splits and history, over synthetic ES3 saves only."""
import copy
import json
import os
import tempfile
import unittest
from unittest.mock import patch

import ba_dashboard as bd
from ba_save import load_save
from tests.es3_fixture import encode


A, B, SERVICE = ("ba:itemname_synthetic_" + suffix for suffix in ("a", "b", "service"))
TYPE = "ba:businesstype_giftshop"
HOOD = "ba:neighborhood_midtown"
SKILL = "ba:skill_customerservice"
STREET = "ba:street_synthetic"


def shop(number=1, rival="alpha", daily=700, **extra):
    return {"StreetName": STREET, "StreetNumber": number, "BusinessName": f"Shop {number}",
            "businessTypeName": TYPE, "businessOwnerRivalId": rival, "buildingOwnerRivalId": rival,
            "creationDay": 5, "Layout": "Synthetic", "dailyIncomes": [daily],
            "retailPrices": [{"itemName": A, "price": 10}, {"itemName": B, "price": 20}],
            "aiEmployees": [{"primarySkillName": SKILL, "primarySkillValue": 0}],
            "scheduleDays": [{"day": day, "isOpen": True, "openingHourSlots": [
                {"startingHour": 8, "endingHour": 18}]} for day in range(1, 8)], **extra}


def event(day, kind=0, name="Alpha", number=1, business="Shop 1", **extra):
    return {"startDay": day, "type": kind, "rivalName": name, "businessName": business,
            "businessTypeName": TYPE, "address": {"streetName": STREET, "streetNumber": number},
            "durationInDays": 1, **extra}


class RivalIntelTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.rules = {
            "products": {A: {"w": 2, "r": 1, "d": 1}, B: {"w": 4, "r": 0.5},
                         SERVICE: {"w": 0, "r": 1, "s": 1, "d": 1}},
            "types": {TYPE: {"i": [[A, 1], [B, 0.5], [SERVICE, 1]], "a": 3, "p": [A, SERVICE]}},
            "skills": {SKILL: 10},
            "rival": {"layouts": {f"{TYPE}|ba:buildingsize_a|1|synthetic": {
                "p": [A, B], "sk": [SKILL, SKILL]}}, "sources": {"Shop 1": 0, "Shop 2": 1},
                "buildings": {"retail": {"rent": 1, "physical": 1},
                              "office": {"rent": 1, "physical": 0}},
                "sizes": {"ba:buildingsize_a": 100}, "shortageDelay": 7},
        }
        self.table = {(STREET, n): {"h": "midtown", "z": "A", "v": 1,
                                   "m": 100, "t": "retail", "x": 70} for n in range(1, 10)}
        self.root = {"Day": 20, "rivalStates": [{"rivalId": "alpha"}],
                     "BuildingRegistrations": [shop()], "specialRivalStates": [],
                     "marketEvents": [event(5)], "gameVariables": {
                         "employeeHourlySalaryMultiplier": 1, "marketPriceMultiplier": 1},
                     "productMarketEntries": [{"itemName": A, "importPriceIndex": 1,
                         "demandValues": [{"neighborhood": HOOD, "demand": 50}]}]}
        self.addCleanup(patch.stopall)
        patch.object(bd, "load_store_rules", side_effect=lambda: self.rules).start()
        patch.object(bd, "load_buildings", side_effect=lambda *_: self.table).start()
        # Isolate the split's hand-worked rent from the separately checked exact market rule.
        patch.object(bd, "_market_rent", return_value=1).start()

    def save(self):
        path = os.path.join(self.tmp.name, "synthetic.hsg")
        with open(path, "wb") as fh:
            fh.write(encode(self.root))
        return load_save(path)

    def intel(self):
        result = bd._rival_intel(self.save())
        json.dumps(result, allow_nan=False)
        return result

    def products(self):
        return {row["item"]: row for row in self.intel()["rivals"][0]["products"]}

    def test_hand_worked_split_and_dollars_are_gross_revenue_and_product_margin(self):
        # A: 2 units * 1 impact * 1 ratio * 50% demand: revenue 10, margin 8.
        # B: 1 unit * .5 impact * .5 ratio: revenue 5, margin 4.
        # 700 saved net + 100 market rent + 200 wages = 1,000 product margin/day.
        products = self.products()
        for item, share in ((A, 2 / 3), (B, 1 / 3)):
            row = products[item]
            self.assertAlmostEqual(row["revenueShare"], 100 * share)
            self.assertAlmostEqual(row["marginShare"], 100 * share)
            self.assertAlmostEqual(row["margin"], 1000 * share)
            self.assertAlmostEqual(row["revenue"], 1250 * share)
        rival = self.intel()["rivals"][0]
        self.assertEqual((rival["top"], rival["weekly"], rival["shops"], rival["buildings"]), (A, 700.0, 1, 1))
        site = rival["sites"][0]
        self.assertEqual(set(site), {"address", "hood", "type", "name", "opened", "daily", "products"})
        self.assertEqual(set(site["products"][0]), {
            "item", "revenueShare", "marginShare", "revenue", "margin", "price", "yourPrice", "defended"})
        self.assertAlmostEqual(sum(p["margin"] for p in site["products"]) - 100 - 1400 / 7, site["daily"])

    def test_primary_amount_above_one_and_fractional_maximum(self):
        self.assertAlmostEqual(self.products()[A]["revenueShare"], 200 / 3)
        self.rules["types"][TYPE]["p"] = []
        self.assertAlmostEqual(self.products()[A]["revenueShare"], 50)
        self.rules["types"][TYPE]["a"] = 0.5
        # At/below one the maximum applies to every product, whether primary or not.
        self.assertAlmostEqual(self.products()[A]["revenueShare"], 50)

    def test_revenue_order_is_distinct_from_margin_order(self):
        self.root["BuildingRegistrations"][0]["retailPrices"][0]["price"] = 3
        products = self.products()
        self.assertAlmostEqual(products[A]["revenueShare"], 37.5)
        self.assertAlmostEqual(products[A]["marginShare"], 20)
        self.assertEqual(self.intel()["rivals"][0]["top"], B)

    def test_wholesale_price_uses_import_index_and_game_price_multiplier(self):
        self.root["productMarketEntries"][0]["importPriceIndex"] = 2
        self.root["gameVariables"]["marketPriceMultiplier"] = 1.5
        # A margin: 10 - (2*2*1.5) = 4; B margin: (20-4*1.5)*.25 = 3.5.
        self.assertAlmostEqual(self.products()[A]["marginShare"], 100 * 4 / 7.5)

    def test_layout_purchaser_is_required_for_retail_but_not_service(self):
        layout = next(iter(self.rules["rival"]["layouts"].values()))
        layout["p"] = [B]
        self.root["BuildingRegistrations"][0]["retailPrices"].append({"itemName": SERVICE, "price": 10})
        products = self.products()
        self.assertEqual(set(products), {B, SERVICE})
        # A service in a physical-product building also takes its demand (50 fallback).
        self.assertAlmostEqual(products[SERVICE]["revenueShare"], 100 * 10 / 15)
        self.table[STREET, 1]["t"] = "office"
        self.assertAlmostEqual(self.products()[SERVICE]["revenueShare"], 100 * 20 / 25)

    def test_unknown_product_impact_uses_the_game_default(self):
        self.rules["types"][TYPE]["i"] = [[A, 1]]
        self.assertAlmostEqual(self.products()[B]["revenueShare"], 100 * 0.25 / 10.25)

    def test_supply_event_days_match_wholesale_import_and_special_rivals(self):
        save = self.save()
        for source, where in ((0, HOOD), (1, "")):
            self.rules["rival"]["sources"]["Shop 1"] = source
            for kind, start, expected in ((4, 17, 4 / 7), (3, 10, 3 / 7), (3, 18, 1)):
                self.root["marketEvents"] = [event(start, kind=kind, itemName=A,
                    neighbourhood=where, durationInDays=14)]
                save = self.save()
                reg = save.items(save.root["BuildingRegistrations"])[0]
                self.assertAlmostEqual(bd._rival_intel_available(save, reg, A, HOOD, 20, self.rules["rival"]), expected)
        # Wholesale ignores city-wide events, import ignores neighbourhood events.
        self.rules["rival"]["sources"]["Shop 1"] = 0
        self.root["marketEvents"] = [event(17, kind=4, itemName=A, neighbourhood="", durationInDays=14)]
        self.assertAlmostEqual(self.products()[A]["revenueShare"], 200 / 3)
        self.root["marketEvents"][0]["neighbourhood"] = HOOD
        self.assertAlmostEqual(self.products()[A]["revenueShare"], 100 * (40 / 7) / (40 / 7 + 5))
        self.root["specialRivalStates"] = [{"rivalId": "alpha"}]
        self.assertAlmostEqual(self.products()[A]["revenueShare"], 200 / 3)
        # A special rival state with no rivalId exempts nobody, a city-owned building included.
        self.root["BuildingRegistrations"][0]["buildingOwnerRivalId"] = None
        self.root["specialRivalStates"] = [{}]
        self.assertAlmostEqual(self.products()[A]["revenueShare"], 100 * (40 / 7) / (40 / 7 + 5))

    def test_stopped_supply_event_counts_only_days_through_its_stop(self):
        self.root["marketEvents"] = [event(10, kind=4, itemName=A, neighbourhood=HOOD,
            durationInDays=20, stopped=True, dayStopped=15)]
        # Last week is days 14..20: only 14 and 15 were blocked.
        self.assertAlmostEqual(self.products()[A]["revenueShare"], 100 * (50 / 7) / (50 / 7 + 5))

    def test_saved_neighbourhood_demand_scales_a_demanded_product(self):
        # A at 80% demand: revenue 10 * .8 / .5 = 16 against B's 5.
        self.root["productMarketEntries"][0]["demandValues"][0]["demand"] = 80
        self.assertAlmostEqual(self.products()[A]["revenueShare"], 100 * 16 / 21)

    def test_an_item_listed_twice_counts_twice_at_its_first_price(self):
        # GetProductBenefit() reads the first price; CalculateProductsIncome() walks every entry.
        self.root["BuildingRegistrations"][0]["retailPrices"] = [
            {"itemName": A, "price": 10}, {"itemName": A, "price": 20}, {"itemName": B, "price": 20}]
        products = self.products()
        self.assertAlmostEqual(products[A]["revenueShare"], 80)
        self.assertEqual((products[A]["price"], products[A]["shops"]), (10, 1))

    def test_seasons_sales_ratio_reaches_the_split(self):
        patch.object(bd.ba_mods, "seasons", return_value={"length": 30}).start()
        patch.object(bd.ba_mods, "sales_ratio",
                     side_effect=lambda base, item, cal, day: base * 2 if item == A else base).start()
        self.assertAlmostEqual(self.products()[A]["revenueShare"], 80)

    def test_a_shop_priced_under_wholesale_still_gets_dollars(self):
        reg = self.root["BuildingRegistrations"][0]
        reg["retailPrices"] = [{"itemName": A, "price": 1}, {"itemName": B, "price": 1}]
        reg["dailyIncomes"] = [-400]
        # Margin weights -1 and -.75; (-400 + 100 rent + 200 wages) a day over -1.75 a customer.
        products = self.products()
        self.assertAlmostEqual(sum(p["margin"] for p in products.values()), -100)
        self.assertAlmostEqual(products[A]["marginShare"], 100 / 1.75)

    def test_an_event_from_an_older_build_with_a_numbered_street_keeps_no_address(self):
        self.root["marketEvents"] = [event(5, address={"streetName": 22, "streetNumber": 2},
                                          neighbourhood=HOOD)]
        (logged,) = self.intel()["events"]
        self.assertEqual((logged["address"], logged["hood"], logged["kind"]), ("", HOOD, "opened"))

    def test_zero_revenue_and_margin_are_finite_and_have_no_private_fields(self):
        self.rules["products"][A]["r"] = self.rules["products"][B]["r"] = 0
        for product in self.products().values():
            self.assertEqual((product["revenueShare"], product["marginShare"]), (0, 0))
            self.assertIsNone(product["revenue"])
            self.assertFalse(any(k.startswith("_") for k in product))

    def test_missing_wage_inputs_ship_shares_with_null_dollars(self):
        self.root["BuildingRegistrations"][0]["aiEmployees"] = []
        for product in self.products().values():
            self.assertIsNone(product["revenue"])
            self.assertIsNone(product["margin"])
        self.assertAlmostEqual(self.products()[A]["revenueShare"], 200 / 3)

    def test_missing_income_or_exact_rent_cannot_be_read_as_zero(self):
        for missing in ("income", "rent"):
            with self.subTest(missing=missing):
                if missing == "income":
                    self.root["BuildingRegistrations"][0]["dailyIncomes"] = []
                else:
                    self.root["BuildingRegistrations"][0]["dailyIncomes"] = [700]
                    self.rules["rival"]["sizes"] = {}
                self.assertTrue(all(p["revenue"] is None for p in self.products().values()))

    def test_exact_rent_uses_size_area_and_type_rent_multiplier_with_ceiling(self):
        save = self.save()
        reg = save.items(save.root["BuildingRegistrations"])[0]
        layout = next(iter(self.rules["rival"]["layouts"].values()))
        self.rules["rival"]["sizes"]["ba:buildingsize_a"] = 75
        self.rules["rival"]["buildings"]["retail"]["rent"] = 0.098
        with patch.object(bd, "_market_rent", return_value=25.322528839111328):
            rent, wages = bd._rival_intel_costs(save, reg, self.table[STREET, 1], layout, self.rules["rival"])
        self.assertEqual((rent, wages), (187, 1400))

    def test_wages_average_people_by_primary_skill_and_include_poached_people(self):
        reg = self.root["BuildingRegistrations"][0]
        reg["aiEmployees"].append({"primarySkillName": SKILL, "primarySkillValue": 100})
        reg["poachedEmployees"] = [{"characterData": {"skills": [{"name": SKILL, "value": 0}]}}]
        self.root["gameVariables"]["employeeHourlySalaryMultiplier"] = 2
        save = self.save()
        layout = next(iter(self.rules["rival"]["layouts"].values()))
        _, wage = bd._rival_intel_costs(save, save.items(save.root["BuildingRegistrations"])[0],
                                     self.table[STREET, 1], layout, self.rules["rival"])
        self.assertAlmostEqual(wage, (20 + 20 * (100 ** 1.05 / 100 + 1) + 20) / 3 * 140, places=3)

    def test_company_totals_are_weighted_by_customers_with_median_prices(self):
        self.root["BuildingRegistrations"].append(shop(2, daily=1700))
        self.root["BuildingRegistrations"][1]["retailPrices"][0]["price"] = 20
        self.root["BuildingRegistrations"].extend([
            shop(3, RentedByPlayer=True, retailPrices=[{"itemName": A, "price": 8}]),
            shop(4, RentedByPlayer=True, retailPrices=[{"itemName": A, "price": 12}])])
        products = self.products()
        self.assertEqual((products[A]["price"], products[A]["yourPrice"], products[A]["shops"]), (15, 10, 2))
        self.assertIsNone(products[B]["yourPrice"])
        rival = self.intel()["rivals"][0]
        self.assertEqual([site["address"] for site in rival["sites"]], ["2 Synthetic", "1 Synthetic"])
        for product in products.values():
            revenue = sum(p["revenue"] for site in rival["sites"] for p in site["products"]
                          if p["item"] == product["item"])
            self.assertAlmostEqual(product["revenue"], revenue)
        self.assertAlmostEqual(sum(p["revenueShare"] for p in products.values()), 100)

    def test_unknown_shop_scale_withholds_company_split_without_adding_equal_weights(self):
        self.root["BuildingRegistrations"].append(shop(2, aiEmployees=[]))
        self.root["BuildingRegistrations"].append(
            shop(3, RentedByPlayer=True, retailPrices=[{"itemName": A, "price": 8}]))
        rival = self.intel()["rivals"][0]
        self.assertEqual(rival["products"], [])
        self.assertIsNone(rival["top"])
        self.assertTrue(all(site["products"] for site in rival["sites"]))
        # Your price still reaches each shop's rows with the company total withheld.
        for site in rival["sites"]:
            prices = {p["item"]: p["yourPrice"] for p in site["products"]}
            self.assertEqual(prices[A], 8)
            self.assertIsNone(prices.get(B))

    def test_your_price_excludes_retired_products_left_in_a_shops_price_list(self):
        self.root["BuildingRegistrations"].append(shop(2, RentedByPlayer=True,
            cachedAvailableProducts=[B], retailPrices=[{"itemName": A, "price": 999}, {"itemName": B, "price": 12}]))
        products = self.products()
        self.assertIsNone(products[A]["yourPrice"])
        self.assertEqual(products[B]["yourPrice"], 12)

    def test_price_reduction_defense_is_per_rival_and_per_product(self):
        self.root["specialRivalStates"] = [{"rivalId": "alpha", "defenseStates": [
            {"defensiveMechanic": 3, "affectedItems": [B]},
            {"defensiveMechanic": 1, "affectedItems": [A]}]}]
        self.assertFalse(self.products()[A]["defended"])
        self.assertTrue(self.products()[B]["defended"])
        site = self.intel()["rivals"][0]["sites"][0]
        self.assertEqual({p["item"]: p["defended"] for p in site["products"]}, {A: False, B: True})

    def test_leaderboard_order_includes_empty_and_defeated_rivals_and_ties_by_number(self):
        self.root["rivalStates"] += [{"rivalId": "beta"}, {"rivalId": "empty"}]
        self.root["BuildingRegistrations"].append(shop(2, rival="beta", daily=800))
        self.root["specialRivalStates"] = [{"rivalId": "empty", "isDefeated": True}]
        self.assertEqual([r["number"] for r in self.intel()["rivals"]], [2, 1, 3])
        self.root["BuildingRegistrations"][1]["dailyIncomes"] = [700]
        self.assertEqual([r["number"] for r in self.intel()["rivals"]], [1, 2, 3])
        self.assertEqual(self.intel()["rivals"][-1]["products"], [])

    def test_events_are_newest_first_limited_to_60_and_keep_unknown_historical_owners(self):
        self.root["marketEvents"] += [event(day, kind=day % 2, name="Alpha" if day % 2 else "Former owner")
                                      for day in range(6, 76)]
        events = self.intel()["events"]
        self.assertEqual(len(events), 60)
        self.assertEqual([e["day"] for e in events], list(range(75, 15, -1)))
        self.assertEqual((events[0]["kind"], events[0]["rival"], events[0]["hood"]), ("closed", 1, HOOD))
        self.assertIsNone(events[1]["rival"])
        self.assertEqual(events[1]["rivalName"], "Former owner")

    def test_missing_layout_or_supply_source_does_not_invent_product_weights(self):
        self.root["BuildingRegistrations"][0]["Layout"] = "Unknown"
        self.assertEqual(self.products(), {})
        self.root["BuildingRegistrations"][0]["Layout"] = "Synthetic"
        self.rules["rival"]["sources"] = {}
        self.root["marketEvents"] = [event(17, kind=4, itemName=A, neighbourhood=HOOD, durationInDays=14)]
        self.assertEqual(self.products(), {})

    def test_rival_section_is_read_only(self):
        save = self.save()
        before = json.dumps(save.root, sort_keys=True)
        rules = copy.deepcopy(self.rules)
        bd._rival_intel(save)
        self.assertEqual(json.dumps(save.root, sort_keys=True), before)
        self.assertEqual(self.rules, rules)


if __name__ == "__main__":
    unittest.main()
