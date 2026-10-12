"""Real estate's extraction: owned buildings, buildings to buy and Before tax day.

The save is tests/save_fixtures.py's trading company, whose bought buildings each
tell one story (ESTATE there): the liquor store's own building repriced to 1.2 x
market rent and emptying, one under market and filling, one at market and full
(the move-out risk), one with the best price pending, and a Hamptons villa. The
rules are research/real-estate-2026-10-12/rules.md, the game's own code.
"""
from __future__ import annotations

import copy
import json
import math
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import ba_dashboard as d  # noqa: E402
from ba_save import Names, load_save  # noqa: E402
from tests import save_fixtures as F  # noqa: E402
from tests.es3_fixture import address, encode  # noqa: E402


def load(tree: dict):
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "estate.hsg")
        with open(path, "wb") as fh:
            fh.write(encode(tree))
        return load_save(path)


def estate(tree: dict) -> tuple[dict, dict]:
    """(the owned analysis, the realEstate payload) for a save tree."""
    save = load(tree)
    names = Names(F.data_names())
    mods = d.ba_mods.detect(save) if d.ba_mods else {}
    owned = d._estate_owned(save, names, mods)
    return owned, json.loads(json.dumps(d._real_estate(save, names, owned)))


def best(rent: float) -> float:
    """The highest cent under market rent, worked out again."""
    return math.floor(rent * 100 - 1e-6) / 100


def key(addr) -> str:
    return f"{addr[0]}#{addr[1]}"


class OwnedBuildings(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.owned, cls.re = estate(F.data_company())
        cls.rows = {r["key"]: r for r in cls.re["owned"]}

    def test_every_bought_building_but_the_villa_is_a_row(self):
        self.assertEqual(set(self.rows), {key(a) for a in F.ESTATE})
        self.assertEqual(self.re["villas"], 1)

    def test_market_rent_and_best_price(self):
        for addr, (_sqm, rent, _day, _paid) in F.ESTATE.items():
            row = self.rows[key(addr)]
            self.assertAlmostEqual(row["market"], rent, places=3)
            self.assertEqual(row["best"], best(rent), addr)

    def test_over_market_counts_the_whole_move_to_full(self):
        row = self.rows[key(F.LIQUOR)]
        sqm, rent = F.ESTATE[F.LIQUOR][:2]
        price, occ = F._estate_day(F.LIQUOR, F.DAY - 1)
        self.assertEqual((row["price"], row["occ"]), (price, occ))
        self.assertAlmostEqual(row["now"], price * sqm * occ / 100, places=1)
        self.assertAlmostEqual(row["full"], best(rent) * sqm, places=1)
        self.assertAlmostEqual(row["gain"], best(rent) * sqm - price * sqm * occ / 100, places=1)
        self.assertTrue(row["flag"])
        self.assertFalse(row["risk"])
        self.assertTrue(row["rented"])  # the liquor store trades in it

    def test_under_market_counts_only_the_cents(self):
        # It fills by itself, so its fill is not a gain: only the cents to the best price.
        row = self.rows[key(F.OWN_UNDER)]
        sqm, rent = F.ESTATE[F.OWN_UNDER][:2]
        self.assertAlmostEqual(row["gain"], (best(rent) - 4.0) * sqm, places=1)
        self.assertFalse(row["flag"])  # under 5% of what it earns now
        self.assertEqual(row["fill"], int(5 * round((100 - row["occ"]) / (0.21 * 4.5) / 5)))

    def test_full_at_market_is_the_move_out_risk(self):
        row = self.rows[key(F.OWN_FULL)]
        self.assertEqual(row["occ"], 100)
        self.assertTrue(row["risk"])
        self.assertTrue(row["flag"])
        self.assertLess(row["gain"], 0)  # a cent under market earns a little less, but keeps them
        self.assertEqual(row["fill"], 0)

    def test_a_pending_best_price_counts_as_set(self):
        row = self.rows[key(F.OWN_PENDING)]
        self.assertEqual((row["pending"], row["days"]), (best(F.ESTATE[F.OWN_PENDING][1]), 4))
        self.assertEqual(row["gain"], 0)
        self.assertFalse(row["flag"])

    def test_payback_tax_and_purchase(self):
        row = self.rows[key(F.OWN_UNDER)]
        sqm, _rent, day, paid = F.ESTATE[F.OWN_UNDER]
        tax = sqm * 1.0 * 0.55 * 3.5 / 60  # retail, Lower Manhattan, daysPerYear 60
        self.assertAlmostEqual(row["tax"], tax, places=2)
        self.assertEqual((row["paid"], row["bought"]), (paid, day))
        self.assertEqual(row["payback"], round(paid / (row["full"] - tax)))

    def test_flagged_first_by_gain_then_the_rest(self):
        flags = [r["flag"] for r in self.re["owned"]]
        self.assertEqual(flags, sorted(flags, reverse=True))

    def test_history_is_exact_while_the_price_held_and_none_before(self):
        self.assertEqual(self.re["histFrom"], F.DAY - 21)
        days = range(F.DAY - 21, F.DAY)
        under = self.rows[key(F.OWN_UNDER)]["hist"]
        self.assertEqual(under, [int(F._estate_day(F.OWN_UNDER, x)[1]) for x in days])
        liquor = self.rows[key(F.LIQUOR)]["hist"]
        for x, value in zip(days, liquor):
            if x < F.REPRICED:
                self.assertIsNone(value, x)  # another price: the occupancy is not recoverable
            else:
                self.assertEqual(value, F._estate_day(F.LIQUOR, x)[1])

    def test_counts_for_the_sidebar(self):
        counts = d._estate_counts(self.owned)
        flagged = [r for r in self.re["owned"] if r["flag"]]
        self.assertEqual(counts["owned"], 4)
        self.assertEqual(counts["flagged"], len(flagged))
        self.assertAlmostEqual(counts["gain"], sum(r["gain"] for r in flagged), places=1)
        self.assertFalse(counts["taxEve"])


class RentMultiplier(unittest.TestCase):
    def test_vanilla_is_measured_at_one(self):
        _owned, re_ = estate(F.data_company())
        self.assertEqual(re_["mult"], {"value": 1.0, "source": "measured", "buildings": 4})

    def test_economy_expansion_statements_measure_five(self):
        tree = F.data_company()
        for summary in tree["financialSummaries"]:
            summary["realEstateStatements"] = F._estate_statements(summary["dayNumber"], 5.0)
        _owned, re_ = estate(tree)
        self.assertEqual((re_["mult"]["value"], re_["mult"]["source"]), (5.0, "measured"))
        plain = {r["key"]: r for r in estate(F.data_company())[1]["owned"]}
        for row in re_["owned"]:
            self.assertAlmostEqual(row["now"], 5 * plain[row["key"]]["now"], places=0)
            self.assertAlmostEqual(row["gain"], 5 * plain[row["key"]]["gain"], places=0)
            # The history divides the multiplier back out.
            self.assertEqual(row["hist"], plain[row["key"]]["hist"])
        listing = next(b for b in re_["buy"] if b["key"] == key(F.SHOP_FOR_SALE))
        before = next(b for b in estate(F.data_company())[1]["buy"] if b["key"] == key(F.SHOP_FOR_SALE))
        self.assertAlmostEqual(listing["income"], 5 * before["income"], places=0)

    def test_without_statements_the_mod_says_five_else_one(self):
        tree = F.data_company()
        for summary in tree["financialSummaries"]:
            summary["realEstateStatements"] = []
        self.assertEqual(estate(tree)[1]["mult"], {"value": 1, "source": "game", "buildings": 0})
        tree["modData"] = [{"$k": "OcupancyCosts.State", "$v": json.dumps({"LastSettlementDay": F.DAY})}]
        self.assertEqual(estate(tree)[1]["mult"], {"value": 5, "source": "mod", "buildings": 0})


class BuyABuilding(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.re = estate(F.data_company())[1]
        cls.rows = {b["key"]: b for b in cls.re["buy"]}

    def test_listings_and_the_buildings_rented_in(self):
        rented = {key(a) for a in (F.GIFTS, F.HUB, F.BREWERY, F.HOME)}  # the liquor store's is owned
        listed = {key(a) for a in (F.FOR_SALE, F.SHOP_FOR_SALE, F.VILLA_FOR_SALE)}
        self.assertEqual(set(self.rows), rented | listed)
        self.assertNotIn(key(F.LIQUOR), self.rows)

    def test_a_listing_at_its_price_with_rent_at_the_best_price(self):
        row = self.rows[key(F.SHOP_FOR_SALE)]
        rent = F._market_rent(1.0, 0.65, 48)  # retail, Garment District, traffic 48
        self.assertEqual((row["price"], row["listed"], row["sqm"]), (6500, True, 775))
        self.assertAlmostEqual(row["income"], best(rent) * 775, places=1)
        self.assertEqual(row["payback"], round(6500 / (row["income"] - row["tax"])))
        self.assertTrue(row["deductible"])

    def test_a_building_rented_in_costs_a_percent_over_market_and_saves_its_rent(self):
        row = self.rows[key(F.GIFTS)]
        value = 2961 * 20554 * 1.0 * 0.55 * (0.3 + 0.40)  # retail, Lower Manhattan, traffic 40
        self.assertEqual(row["price"], round(value * 1.01))
        self.assertFalse(row["listed"])
        self.assertEqual(row["saves"], F.RENT[F.GIFTS])
        self.assertEqual(row["payback"], round(row["price"] / (row["income"] + row["saves"] - row["tax"])))

    def test_a_villa_earns_no_rent_and_is_not_deductible(self):
        row = self.rows[key(F.VILLA_FOR_SALE)]
        self.assertEqual((row["villa"], row["income"], row["payback"], row["deductible"]), (True, 0, None, False))

    def test_residential_is_not_deductible(self):
        self.assertFalse(self.rows[key(F.HOME)]["deductible"])

    def test_the_finder_listings_carry_the_same_payback(self):
        save = load(F.data_company())
        names = Names(F.data_names())
        owned = d._estate_owned(save, names, {})
        premises = d._premises(save, names, {}, owned)
        paybacks = {r["key"]: r["payback"] for r in premises["forSale"]}
        for k in paybacks:
            self.assertEqual(paybacks[k], self.rows[k]["payback"], k)


# Deductible listings for the shopping list, and one that is not.
SHOP_LISTINGS = [
    (("ba:street_fifthavenue", 2), 600_000),    # retail
    (("ba:street_fifthavenue", 5), 390_000),    # office
    (("ba:street_fifthavenue", 3), 450_000),    # warehouse
    (("ba:street_fifthavenue", 27), 500_000),   # warehouse
    (("ba:street_broadwaystreet", 2), 999_000),  # residential: never deducted
]


def taxed(cash: float, sales_factor: float, day: int = F.DAY) -> dict:
    """The fixture with more sales, listings to shop from and `cash`; its tax block."""
    tree = F.data_company(day)
    tree["Money"] = cash
    for summary in tree["financialSummaries"]:
        for st in summary["businessIncomeStatements"]:
            st["TotalSales"] *= sales_factor
    tree["buildingsForSale"] = [{"address": address(*a), "buildingPrice": float(p)} for a, p in SHOP_LISTINGS]
    return estate(tree)[1]["tax"]


class BeforeTaxDay(unittest.TestCase):
    def test_under_the_threshold_nothing_is_assessed(self):
        tax = estate(F.data_company())[1]["tax"]
        self.assertLess(tax["salesEnd"], d.TAX_THRESHOLD)
        self.assertEqual((tax["assessed"], tax["target"], tax["pick"], tax["spend"]), (False, 0, [], 0))

    def test_the_projection(self):
        tree = F.data_company()
        tax = estate(tree)[1]["tax"]
        sales = sum(st["TotalSales"] for s in tree["financialSummaries"] for st in s["businessIncomeStatements"])
        start, elapsed = 1, F.DAY - 1
        self.assertEqual((tax["taxDay"], tax["left"], tax["rate"]), (60, 60 - F.DAY, 5.0))
        self.assertAlmostEqual(tax["sales"], sales, places=1)
        self.assertAlmostEqual(tax["salesEnd"], sales * (60 - start) / elapsed, places=1)
        recurring = (14000.0 + 1200.0) * (F.DAY - 1) / 39
        self.assertAlmostEqual(tax["deductions"], recurring + 8000.0, places=1)
        # Running costs scale to the whole period; the boat counts once.
        self.assertAlmostEqual(tax["deductionsEnd"], recurring * 60 / elapsed + 8000.0, places=1)
        self.assertAlmostEqual(tax["baseEnd"], max(0, tax["salesEnd"] - tax["deductionsEnd"]), places=1)

    def test_cash_bound(self):
        tax = taxed(1_000_000, 100)
        self.assertTrue(tax["assessed"])
        self.assertGreater(tax["baseEnd"], 1_000_000)
        self.assertEqual((tax["target"], tax["bound"]), (1_000_000, "cash"))
        self.assertEqual(tax["pick"], [key(SHOP_LISTINGS[0][0]), key(SHOP_LISTINGS[1][0])])
        self.assertEqual(tax["spend"], 990_000)
        self.assertEqual(tax["after"], 10_000)
        self.assertAlmostEqual(tax["saves"], 990_000 * 5 / 100, places=2)

    def test_base_bound(self):
        tax = taxed(50_000_000, 10)  # a base under a million, cash far over it
        self.assertTrue(tax["assessed"])
        self.assertLess(tax["baseEnd"], 1_000_000)
        self.assertEqual((tax["target"], tax["bound"]), (int(tax["baseEnd"]), "base"))
        self.assertLessEqual(tax["spend"], tax["target"])
        listed = dict((key(a), p) for a, p in SHOP_LISTINGS)
        self.assertEqual(tax["spend"], sum(listed[k] for k in tax["pick"]))
        self.assertNotIn(key(SHOP_LISTINGS[4][0]), tax["pick"])

    def test_the_eve_counts_on_the_sidebar(self):
        tree = F.data_company(59)
        tree["Money"] = 1_000_000
        for summary in tree["financialSummaries"]:
            for st in summary["businessIncomeStatements"]:
                st["TotalSales"] *= 100
        tree["buildingsForSale"] = [{"address": address(*a), "buildingPrice": float(p)} for a, p in SHOP_LISTINGS]
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "eve.hsg")
            with open(path, "wb") as fh:
                fh.write(encode(tree))
            build = d.build_core(load_save(path), Names(F.data_names()))
        self.assertTrue(build.core["realEstateCounts"]["taxEve"])
        # The section reuses the plan the core worked out.
        self.assertIs(d.section(build, "realEstate")["realEstate"]["tax"], build.shared["estate"]["tax"])


if __name__ == "__main__":
    unittest.main()
