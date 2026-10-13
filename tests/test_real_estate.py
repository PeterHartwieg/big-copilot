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
import unittest.mock

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
    """The highest cent the game sees under market rent (both in single
    precision), worked out again."""
    cents = int(rent * 100) + 1
    while F._f32(cents / 100) >= rent:
        cents -= 1
    return cents / 100


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

    def test_never_repriced_is_at_market_exactly_as_the_game_sees_it(self):
        # Bought, never repriced: the price is the market rent itself, in single
        # precision, so the game's (m - price) / m is 0 and tenants may leave.
        row = self.rows[key(F.OWN_FULL)]
        rent = F.ESTATE[F.OWN_FULL][1]
        self.assertEqual(F._estate_day(F.OWN_FULL, F.DAY)[0], rent)
        self.assertTrue(row["risk"])
        self.assertLess(F._f32(row["best"]), rent)
        self.assertGreaterEqual(F._f32(row["best"] + 0.01), rent)

    def test_flagged_first_by_gain_then_the_rest(self):
        flags = [r["flag"] for r in self.re["owned"]]
        self.assertEqual(flags, sorted(flags, reverse=True))

    def test_history_is_exact_while_the_price_held_and_none_before(self):
        self.assertEqual(self.re["histFrom"], F.OPENED + 1)
        days = range(F.OPENED + 1, F.DAY)
        bought = F.ESTATE[F.OWN_UNDER][2]
        under = self.rows[key(F.OWN_UNDER)]["hist"]
        self.assertEqual(under, [int(F._estate_day(F.OWN_UNDER, x)[1]) if x >= bought else None for x in days])
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


class MarketRent(unittest.TestCase):
    """The game's market rent, worked out in single precision as it does."""

    def rent(self, street, number):
        return d._market_rent(d.load_buildings()[(street, number)])

    def test_a_market_rent_just_over_a_cent_keeps_that_cent(self):
        # 1 Harbor Street (a Hamptons cinema) and 9 Fifth Avenue (a Garment
        # District office) sit a hair over a whole cent: the game takes that
        # cent as under market.
        harbor = self.rent("ba:street_harborstreet", 1)
        self.assertTrue(5.64 < harbor < 5.6401, harbor)
        self.assertEqual(d._best_price(harbor), 5.64)
        office = self.rent("ba:street_fifthavenue", 9)
        self.assertEqual(d._best_price(office), 4.04)
        self.assertTrue(d._below_market(4.04, office))
        self.assertFalse(d._below_market(4.05, office))

    def test_the_market_rent_itself_is_not_under_market(self):
        rent = self.rent("ba:street_twelfthstreet", 24)
        # The price a building there kept from its purchase, as the game wrote it:
        # single precision after every operation would be one unit in the last
        # place higher, and read that price as under market.
        self.assertEqual(rent, 3.735072612762451)
        self.assertFalse(d._below_market(rent, rent))
        self.assertEqual(d._best_price(rent), 3.73)

    def test_the_fixture_formula_agrees(self):
        for addr, (_sqm, rent, _day, _paid) in F.ESTATE.items():
            self.assertEqual(d._market_rent(d.load_buildings()[addr]), rent, addr)


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
        self.assertAlmostEqual(row["price"], value * 1.01, delta=value * 1e-6)
        self.assertFalse(row["listed"])
        self.assertEqual(row["saves"], F.RENT[F.GIFTS])
        self.assertEqual(row["payback"], round(row["price"] / (row["income"] + row["saves"] - row["tax"])))

    def test_a_villa_earns_no_rent_and_is_not_deductible(self):
        row = self.rows[key(F.VILLA_FOR_SALE)]
        self.assertEqual((row["villa"], row["income"], row["payback"], row["deductible"]), (True, 0, None, False))

    def test_residential_is_not_deductible(self):
        self.assertFalse(self.rows[key(F.HOME)]["deductible"])

    def test_the_finder_listings_carry_the_same_payback(self):
        # The gift shop's building listed as well: both lists count the rent it ends.
        tree = F.data_company()
        tree["buildingsForSale"].append({"address": address(*F.GIFTS), "buildingPrice": 23_000_000.0})
        save = load(tree)
        names = Names(F.data_names())
        owned = d._estate_owned(save, names, {})
        buy = {b["key"]: b for b in d._real_estate(save, names, owned)["buy"]}
        premises = d._premises(save, names, {}, owned)
        paybacks = {r["key"]: r["payback"] for r in premises["forSale"]}
        self.assertEqual(len(paybacks), 4)
        for k in paybacks:
            self.assertEqual(paybacks[k], buy[k]["payback"], k)
        gifts = buy[key(F.GIFTS)]
        self.assertEqual((gifts["listed"], gifts["price"], gifts["saves"]), (True, 23_000_000, F.RENT[F.GIFTS]))
        self.assertEqual(paybacks[key(F.GIFTS)],
                         round(23_000_000 / (gifts["income"] + F.RENT[F.GIFTS] - gifts["tax"])))


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


def period_sales(tree: dict) -> tuple[float, int]:
    """(every sale the period's summaries hold, how many days they cover)."""
    gv = tree["gameVariables"]["daysPerYear"]
    tax_day = (tree["Day"] // gv + 1) * gv
    rows = [s for s in tree["financialSummaries"] if tax_day - gv + 1 <= s["dayNumber"] <= tax_day]
    return sum(st["TotalSales"] for s in rows for st in s["businessIncomeStatements"]), len(rows)


def built(tree: dict):
    """build_core() over a save tree: the core loads, whatever the day."""
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "core.hsg")
        with open(path, "wb") as fh:
            fh.write(encode(tree))
        return d.build_core(load_save(path), Names(F.data_names()))


class BeforeTaxDay(unittest.TestCase):
    def test_under_the_threshold_nothing_is_assessed(self):
        tax = taxed(25_000, 0.5)
        self.assertLess(tax["salesEnd"], d.TAX_THRESHOLD)
        self.assertEqual((tax["assessed"], tax["target"], tax["pick"], tax["spend"]), (False, 0, [], 0))

    def test_the_projection(self):
        tree = F.data_company()
        tax = estate(tree)[1]["tax"]
        sales, held = period_sales(tree)
        # The game keeps the period's summaries: every day the company traded
        # (it opened on day 3, its first summary is day 4) up to yesterday.
        self.assertEqual(held, F.DAY - 1 - F.OPENED)
        self.assertEqual((tax["taxDay"], tax["left"], tax["rate"]), (60, 60 - F.DAY, 5.0))
        # What the game will sum: the summaries so far, and their average day
        # for each day still to come before tax day.
        self.assertAlmostEqual(tax["sales"], sales, places=1)
        self.assertAlmostEqual(tax["salesEnd"], sales + sales / held * (60 - F.DAY), places=1)
        recurring = sum(F.RECURRING.values()) * F.DAY  # a day each midnight, days 1 to DAY
        once = sum(F.ONCE.values())
        self.assertAlmostEqual(tax["deductions"], recurring + once, places=1)
        # Running costs scale to the period's 60 midnights; the boat, the
        # vehicle, the wholesale bill and the deposit count once.
        self.assertAlmostEqual(tax["deductionsEnd"], recurring * 60 / F.DAY + once, places=1)
        self.assertAlmostEqual(tax["baseEnd"], max(0, tax["salesEnd"] - tax["deductionsEnd"]), places=1)

    def test_a_vehicle_bought_counts_once(self):
        self.assertFalse(d._recurring_deduction("tax_vehicle"))
        self.assertTrue(d._recurring_deduction("tax_rent"))
        self.assertTrue(d._recurring_deduction("econoview_row_salaries"))
        self.assertFalse(d._recurring_deduction("9 7th Avenue"))

    def test_a_long_tax_year_sums_the_whole_year(self):
        # daysPerYear 365 on day 200: the game keeps daysPerYear + 2 summaries,
        # so the 196 days traded so far are all there and all taxed.
        tree = F.data_company(200, per_year=365)
        tax = estate(tree)[1]["tax"]
        sales, held = period_sales(tree)
        self.assertEqual((tax["taxDay"], tax["left"], held), (365, 165, 199 - F.OPENED))
        self.assertAlmostEqual(tax["sales"], sales, places=1)
        self.assertAlmostEqual(tax["salesEnd"], sales + sales / held * 165, places=1)
        self.assertAlmostEqual(tax["deductionsEnd"],
                               sum(F.RECURRING.values()) * 365 + sum(F.ONCE.values()), places=1)

    def test_tax_day_and_the_first_day_project_nothing(self):
        # On tax day the new period began at today's midnight, after its costs:
        # no day of it is over, so nothing is projected or assessed.
        for day, per_year in ((60, 60), (120, 60), (365, 365), (1, 60)):
            with self.subTest(day=day, per_year=per_year):
                tree = F.data_company(day, per_year=per_year)
                tree["Money"] = 1_000_000
                tree["buildingsForSale"] = [{"address": address(*a), "buildingPrice": float(p)}
                                            for a, p in SHOP_LISTINGS]
                owned, re_ = estate(tree)
                tax = re_["tax"]
                self.assertEqual(tax["taxDay"], day + per_year if day % per_year == 0 else per_year)
                self.assertEqual((tax["assessed"], tax["target"], tax["pick"], tax["spend"]), (False, 0, [], 0))
                if day % per_year == 0:
                    self.assertEqual(tax["salesEnd"], tax["sales"])
                    self.assertEqual(tax["deductionsEnd"], tax["deductions"])
                    # The core loads with its whole count: the owned buildings, and no eve.
                    flagged = [r for r in re_["owned"] if r["flag"]]
                    self.assertEqual(built(tree).core["realEstateCounts"], {
                        "owned": 4, "flagged": len(flagged),
                        "gain": round(sum(r["gain"] for r in flagged), 2), "taxEve": False})

    def test_a_failure_never_stops_the_core_loading(self):
        tree = F.data_company()
        with unittest.mock.patch.object(d, "_estate_owned", side_effect=RuntimeError("odd save")):
            build = built(tree)
            self.assertEqual(build.core["realEstateCounts"],
                             {"owned": 0, "flagged": 0, "gain": 0.0, "taxEve": False})
            # The page asks again, and there the failure shows.
            with self.assertRaisesRegex(RuntimeError, "odd save"):
                d.section(build, "realEstate")
        self.assertEqual(len(d.section(build, "realEstate")["realEstate"]["owned"]), 4)

    def test_a_failed_tax_plan_keeps_the_owned_rows(self):
        # Only the plan fails: the owned rows, their count and the multiplier the
        # finder prices at stay; the page works the plan out again and says why.
        tree = F.data_company(59)
        with unittest.mock.patch.object(d, "_tax_shelter", side_effect=RuntimeError("odd plan")):
            build = built(tree)
            self.assertEqual(build.core["realEstateCounts"]["owned"], 4)
            self.assertFalse(build.core["realEstateCounts"]["taxEve"])
            self.assertIsNotNone(build.shared["estate"])
            self.assertNotIn("tax", build.shared["estate"])
            with self.assertRaisesRegex(RuntimeError, "odd plan"):
                d.section(build, "realEstate")

    def test_the_average_day_starts_at_the_first_business(self):
        # Summaries from before the first shop opened carry no business
        # statement; they would only dilute the projection.
        tree = F.data_company()
        first = tree["financialSummaries"][0]["dayNumber"]
        tree["financialSummaries"][:0] = [
            {"dayNumber": n, "businessIncomeStatements": [], "totalBusinessProfit": 0.0, "totalProfit": 0.0}
            for n in range(1, first)]
        tax = estate(tree)[1]["tax"]
        sales, held = period_sales(tree)
        trading = held - (first - 1)
        self.assertAlmostEqual(tax["salesEnd"], sales + sales / trading * (60 - F.DAY), places=1)

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
        tax = taxed(50_000_000, 5)  # a base under a million, cash far over it
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
