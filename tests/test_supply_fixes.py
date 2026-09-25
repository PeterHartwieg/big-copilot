"""Supply and Plan fixes from the 25 Sep 2026 audit (issue #105), on synthetic
fixtures only: a route-fed depot's need, an input its lines' Produce up to
holds back, a new shop on a wholesale contract, unrouted stock a factory
needs, and the unit prices the Plan page reads.
"""
import unittest

from ba_dashboard import RECIPE_ITEMS, Names, _ingredient_prices, plain, site_key
from test_supply_facts import (BEER, DISTRIB, FACTORY, HUB, RECIPES, RID, SHOP_A, SODA, WATER,
                               Company, Stub, tx)
import test_supply_facts

# A second line eating water, beside Beer, at the same workstation.
RID2, ALE = next((rid, item) for rid, item in sorted(RECIPE_ITEMS.items(), key=str) if item != BEER)
TWO_LINES = {**RECIPES, ALE: {"slug": ALE, "item": "Ale", "out": 30, "workstation": "bottledgoods",
                              "ingredients": [{"slug": WATER, "item": "Water", "per": 10}]}}


def node_item(c, name, slug):
    node = next(n for n in c.supply["graph"]["nodes"] if n.get("name") == name)
    return next(i for i in node["items"] if i["slug"] == slug)


class RouteFedNeedTests(unittest.TestCase):
    """SU-1: a depot topped up only by a route carries the draw it passes on."""

    def test_a_route_fed_depot_line_shows_what_leaves_it(self):
        c = Company()
        c.site(HUB, "Import Hub")
        c.site(DISTRIB, "Distrib")
        c.shop(SHOP_A, "Soda Shop")
        c.hold(HUB, SODA, 5000)
        c.hold(DISTRIB, SODA, 800)
        c.hold(SHOP_A, SODA, 300, 100)
        c.contract(HUB, SODA, 1000)
        c.plan(HUB, DISTRIB, SODA, 1000)
        c.plan(DISTRIB, SHOP_A, SODA, 400)
        for d in range(13, 20):
            c.ship(d, HUB, DISTRIB, {SODA: 100})
            c.ship(d, DISTRIB, SHOP_A, {SODA: 100})
        c.run()
        row = node_item(c, "Distrib", SODA)
        self.assertEqual((row["cadence"], row["provision"]), ("daily", 1000))
        self.assertEqual(row["need"], 100)


class LimitedInputTests(unittest.TestCase):
    """SU-2: an input whose lines all have Produce up to set is not "not drawn"
    when what arrives covers what their shipped output ate."""

    def setUp(self):
        self.saved = test_supply_facts.RECIPES
        test_supply_facts.RECIPES = TWO_LINES

    def tearDown(self):
        test_supply_facts.RECIPES = self.saved

    def brewery(self, limit, water_held=200):
        c = Company()
        c.site(HUB, "Import Hub")
        c.site(FACTORY, "Brewery", kind="ba:businesstype_factory", machines=[RID, RID2], limit=limit)
        c.hold(HUB, WATER, 5000)
        c.hold(FACTORY, WATER, water_held)
        c.hold(FACTORY, BEER, 500)  # at its limit all day
        c.hold(FACTORY, ALE, 100)  # well under it at noon, shipping 78% of what it could
        c.contract(HUB, WATER, 3500)
        c.plan(HUB, FACTORY, WATER, 480)
        for d in range(13, 20):
            # The lines ship 240 + 560 a day, which eat 80 + 187 water: 270 arrives.
            c.ship(d, HUB, FACTORY, {WATER: 270})
            c.ship(d, FACTORY, None, {BEER: 240, ALE: 560})
        c.run()
        return c

    def test_arrivals_matching_the_shipped_output_are_the_limit(self):
        c = self.brewery(limit=500)
        lines = {l["item"]: l["limitHeld"] for l in c.supply["factories"]["sites"][0]["lines"]}
        self.assertEqual(lines, {"Beer": True, "Ale": False})
        [need] = c.supply["factories"]["sites"][0]["needs"]
        self.assertTrue(need["limited"])
        self.assertEqual((c.fact(FACTORY, WATER)["st"], c.fact(FACTORY, WATER)["why"]), ("covered", "limit"))
        self.assertFalse([f for f in c.findings() if f["group"] == "feed" and "not drawing" in f["text"]])
        # The working keys stay off the payload.
        self.assertNotIn("_shipDraw", need)
        self.assertNotIn("_allLimit", need)

    def test_a_line_that_has_run_its_input_down_is_starved_not_held(self):
        c = self.brewery(limit=500, water_held=20)
        self.assertEqual((c.fact(FACTORY, WATER)["st"], c.fact(FACTORY, WATER)["why"]), ("stalled", "notDrawn"))

    def test_without_produce_up_to_the_same_arrivals_are_still_not_drawn(self):
        c = self.brewery(limit=None)
        self.assertEqual((c.fact(FACTORY, WATER)["st"], c.fact(FACTORY, WATER)["why"]), ("stalled", "notDrawn"))


class StarvedLineTests(unittest.TestCase):
    """SU-2: a line fed half its need just after the morning round is starved,
    though its Produce up to limit is set and what it ships matches what came."""

    def test_half_a_round_just_after_it_landed_is_not_drawn(self):
        c = Company(hour=7)
        c.site(HUB, "Import Hub")
        c.factory(FACTORY, "Brewery", limit=5000)
        c.hold(HUB, WATER, 5000)
        c.hold(FACTORY, WATER, 120)  # the round's 120, a line eats 240 a day
        c.hold(FACTORY, BEER, 100)
        c.contract(HUB, WATER, 3500)
        c.plan(HUB, FACTORY, WATER, 240)
        for d in range(13, 20):
            c.ship(d, HUB, FACTORY, {WATER: 120})
            c.ship(d, FACTORY, None, {BEER: 360})
        c.run()
        self.assertFalse(c.supply["factories"]["sites"][0]["needs"][0]["limited"])
        self.assertEqual((c.fact(FACTORY, WATER)["st"], c.fact(FACTORY, WATER)["why"]), ("stalled", "notDrawn"))


class WholesalePlanTests(unittest.TestCase):
    """SU-3: a new shop a repeating wholesale contract delivers to has a plan."""

    def new_shop(self, **wholesale):
        c = Company()
        c.shop(SHOP_A, "Soda Shop", opened=c.day - 1, trade_days=0)
        c.hold(SHOP_A, SODA, 0)
        c.wholesale(SHOP_A, SODA, 500, **wholesale)
        c.run()
        shop = c.business_list[0]
        shop["revenue"] = 0.0
        [note] = [f for f in c.findings() if f["group"] == "notrading"]
        return shop, note

    def test_a_repeating_wholesale_contract_is_a_delivery_plan(self):
        shop, note = self.new_shop()
        self.assertNotIn("plan", shop["notTrading"])
        self.assertNotIn("no delivery plan", note["text"])

    def test_a_one_off_order_is_not(self):
        shop, note = self.new_shop(repeating=False)
        self.assertIn("plan", shop["notTrading"])
        self.assertIn("no delivery plan", note["text"])


class NotRoutedFactoryTests(unittest.TestCase):
    """SU-4: stock no plan sends on while a factory needs it is one finding."""

    def test_the_factory_input_gives_way_to_not_routed(self):
        c = Company()
        c.site(HUB, "Import Hub")
        c.factory(FACTORY, "Brewery")
        c.hold(HUB, WATER, 3000)
        c.hold(FACTORY, WATER, 50)
        c.run()
        self.assertEqual(c.fact(FACTORY, WATER)["via"], c.index(HUB))
        groups = [f["group"] for f in c.findings() if f["group"] in ("notrouted", "feed")]
        self.assertEqual(groups, ["notrouted"])
        [note] = [f for f in c.findings() if f["group"] == "notrouted"]
        self.assertIn("Brewery needs", plain(note["text"]))

    def test_with_nothing_held_anywhere_the_factory_still_says_so(self):
        c = Company()
        c.factory(FACTORY, "Brewery")
        c.hold(FACTORY, WATER, 50)
        c.run()
        [note] = [f for f in c.findings() if f["group"] == "feed"]
        self.assertIn("no depot tops it up", plain(note["text"]))


class IngredientPriceTests(unittest.TestCase):
    """EX-5: a unit price is a week of goods cost over a week of units
    delivered, company-wide, read where the cost is booked."""

    def save(self, statements, logs, day=20):
        summaries = [{"dayNumber": d, "businessIncomeStatements": [
            {"Address": addr, "Resources": [{"ItemName": slug, "Amount": amount}]}
            for addr, slug, amount in statements.get(d, [])]} for d in range(day - 9, day)]
        registrations = [{"RentedByPlayer": True, "StreetName": addr[0], "StreetNumber": addr[1],
                          "deliveryTransactions": log} for addr, log in logs.items()]
        return Stub({"Day": day, "financialSummaries": summaries, "BuildingRegistrations": registrations})

    def test_the_cost_at_the_factory_over_what_reached_it(self):
        # The hub imports water and books no cost; the factory is topped up
        # from it and books the cost, which swings day to day with the round.
        spend = {d: [(FACTORY, WATER, 2.0 * (100 if d % 2 else 300))] for d in range(11, 20)}
        logs = {
            HUB: [tx(d, {WATER: 1400 if d == 14 else 0}) for d in range(11, 20)]
                 + [tx(d, {WATER: -(100 if d % 2 else 300)}) for d in range(11, 20)],
            FACTORY: [tx(d, {WATER: 100 if d % 2 else 300}) for d in range(11, 20)],
        }
        prices = _ingredient_prices(self.save(spend, logs), Names({}), {"factories": {}}, [])
        self.assertEqual(prices["unit"], {WATER: 2.0})
        self.assertEqual((prices["from"], prices["day"]), (13, 19))

    def test_a_shop_with_no_log_and_something_made_in_house_have_no_price(self):
        spend = {d: [(SHOP_A, SODA, 50.0), (FACTORY, BEER, 80.0)] for d in range(11, 20)}
        logs = {FACTORY: [tx(d, {BEER: 40}) for d in range(11, 20)]}
        made = {"factories": {"sites": [{"lines": [{"slug": BEER}]}]}}
        self.assertEqual(_ingredient_prices(self.save(spend, logs), Names({}), made, [])["unit"], {})

    def test_no_books_no_prices(self):
        save = Stub({"Day": 3, "financialSummaries": [], "BuildingRegistrations": []})
        self.assertEqual(_ingredient_prices(save, Names({}), {}, [])["unit"], {})


if __name__ == "__main__":
    unittest.main()
