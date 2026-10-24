"""Demand through multi-stage factory chains (issue #521), on synthetic
fixtures only.

A factory whose own lines make a product that a route from another of the
company's factories also brings it shares what the shops past it draw with
that route: Factory 1's beer goes through Factory 2, which makes beer too,
and the shops sell 1,000 a day. The two make it between them, each judged on
its share, never on all 1,000 each. The share follows what each can bring a
day (a line's capacity, a route's room), so the lines run equally loaded and
are short together exactly when the chain is.
"""
import unittest

from ba_dashboard import RECIPE_ITEMS, SUPPLY_MARGIN
from tests.test_factory_use import lines_at, run_with
from tests.test_supply_facts import BEER, RECIPES, RID, SHOP_A, SHOP_B, WATER, Company

F1 = ("upper_road", 7)
F2 = ("lower_road", 8)
DEPOT = ("depot_lane", 3)
MALT_RID, MALT = next((r, i) for r, i in sorted(RECIPE_ITEMS.items()) if i != BEER)
MALT_RECIPES = {
    BEER: {"slug": BEER, "item": "Beer", "out": 30, "workstation": "bottledgoods",
           "ingredients": [{"slug": MALT, "item": "Malt", "per": 10}]},
    MALT: {"slug": MALT, "item": "Malt", "out": 20, "workstation": "bottledgoods", "ingredients": []},
}


def line(c, addr, slug=BEER):
    return next(x for x in lines_at(c, addr) if x["slug"] == slug)


def need(use):
    return round(use * (1 + SUPPLY_MARGIN))


def two_breweries(sold, *, f1_target=2000, via_depot=False, f2_makes=True, direct=0):
    """Brewery 1's beer goes through Brewery 2 (through a depot first, with
    `via_depot`) to a bar selling `sold` a day; one machine each, 720 a day.
    With `direct`, Brewery 1 also tops up a shop of its own selling that."""
    c = Company()
    c.factory(F1, "Brewery 1")
    if f2_makes:
        c.factory(F2, "Brewery 2")
    else:
        c.site(F2, "Brewery 2", kind="ba:businesstype_factory")
    c.shop(SHOP_A, "Beer Bar")
    for f in (F1, F2):
        c.hold(f, WATER, 500)
        c.hold(f, BEER, 300)
    c.hold(SHOP_A, BEER, 200, sold)
    if via_depot:
        c.site(DEPOT, "Depot")
        c.hold(DEPOT, BEER, 300)
        c.plan(F1, DEPOT, BEER, f1_target)
        c.plan(DEPOT, F2, BEER, f1_target)
    else:
        c.plan(F1, F2, BEER, f1_target)
    c.plan(F2, SHOP_A, BEER, 2000)
    if direct:
        c.shop(SHOP_B, "Beer Shop")
        c.hold(SHOP_B, BEER, 100, direct)
        c.plan(F1, SHOP_B, BEER, 1000)
    return run_with(c, RECIPES)


class IssueChainTests(unittest.TestCase):
    """The issue's shape: Factory 1 -> Factory 2 -> the shops."""

    def test_each_factory_is_judged_on_its_share_not_the_whole_shop_demand(self):
        c = two_breweries(1000)
        one, two = line(c, F1), line(c, F2)
        # Before #521 Brewery 2 was asked all 1,000 and Brewery 1 another 696.
        self.assertEqual((one["soldDay"], two["soldDay"]), (500, 500))
        self.assertEqual((one["needDay"], two["needDay"]), (need(500), need(500)))
        for x in (one, two):
            self.assertEqual(x["production"], {"status": "covered", "level": "ok"})

    def test_the_chain_end_to_end_adds_up_to_what_the_shops_sell(self):
        for sold in (300, 1000, 1440, 2000):
            with self.subTest(sold=sold):
                c = two_breweries(sold)
                self.assertAlmostEqual(line(c, F1)["soldDay"] + line(c, F2)["soldDay"], sold, delta=1)

    def test_the_issues_numbers_are_short_only_by_the_margin(self):
        # The shops sell what the two make together (10,000 a week in the
        # issue): neither is critical, both are short only the margin, as a
        # single factory making exactly what its shops sell is.
        c = two_breweries(1440)
        for x in (line(c, F1), line(c, F2)):
            self.assertEqual(x["soldDay"], 720)
            self.assertEqual(x["production"]["status"], "short")
            self.assertEqual(x["production"]["level"], "warn")

    def test_a_chain_too_small_is_short_on_both_and_each_by_its_share(self):
        c = two_breweries(2000)
        for x in (line(c, F1), line(c, F2)):
            self.assertEqual(x["soldDay"], 1000)
            self.assertEqual(x["production"]["level"], "critical")
            self.assertEqual(x["production"]["more"], 1)

    def test_the_short_link_is_named(self):
        c = two_breweries(2000)
        f1, f2 = c.index(F1), c.index(F2)
        for x in (line(c, F1), line(c, F2)):
            self.assertEqual(x["chain"], {"at": f2, "from": [f1], "makes": 1440, "need": need(2000)})

    def test_a_route_target_limits_what_the_feeder_takes(self):
        # Brewery 1 tops Brewery 2 up to 100 a day, which brings 87 of a
        # day's use with the margin: what is past it is Brewery 2's to make,
        # and Brewery 2 is the one short.
        c = two_breweries(1000, f1_target=100)
        one, two = line(c, F1), line(c, F2)
        brought = 100 / (1 + SUPPLY_MARGIN)
        self.assertEqual((one["soldDay"], two["soldDay"]), (round(brought), round(1000 - brought)))
        self.assertEqual(one["production"], {"status": "covered", "level": "ok"})
        self.assertEqual(two["production"]["level"], "critical")
        self.assertEqual(two["chain"]["makes"], round(720 + brought))


class OtherShapesTests(unittest.TestCase):
    def test_a_factory_that_only_passes_goods_on_is_not_counted(self):
        # Brewery 2 makes no beer: it only passes Brewery 1's on, which is
        # judged on all the bar sells, once.
        c = two_breweries(600, f2_makes=False)
        one = line(c, F1)
        self.assertEqual((one["soldDay"], one["needDay"]), (600, need(600)))
        self.assertNotIn("chain", one)
        self.assertFalse(any(c.business_list[s["s"]]["name"] == "Brewery 2"
                             for s in c.supply["factories"]["sites"]))

    def test_a_feeder_that_also_sells_direct_keeps_its_own_shop_first(self):
        # Brewery 1 also tops up a shop selling 400 a day: it has 320 left
        # for Brewery 2, which makes 720, so the bar's 1,000 splits 320:720.
        c = two_breweries(1000, direct=400)
        one, two = line(c, F1), line(c, F2)
        to_two = 1000 * 320 / 1040
        self.assertEqual(one["soldDay"], round(400 + to_two))
        self.assertEqual(two["soldDay"], round(1000 - to_two))
        # 1,400 a day against 1,440 made: the chain keeps up, so neither is
        # critical, and only the margin is short.
        for x in (one, two):
            self.assertEqual(x["production"]["level"], "warn")

    def test_a_depot_between_the_factories_changes_nothing(self):
        c = two_breweries(1000, via_depot=True)
        self.assertEqual((line(c, F1)["soldDay"], line(c, F2)["soldDay"]), (500, 500))
        self.assertEqual(line(c, F1)["chain"]["at"], c.index(F2))
        self.assertEqual(line(c, F1)["chain"]["from"], [c.index(DEPOT)])

    def test_an_intermediate_made_in_two_places_is_split_once(self):
        # The maltings send malt to Brewery 2, which makes malt as well and
        # eats it for beer: the bar sells 900 beer a day, 300 malt a day.
        # Each malt line (480 a day) is judged on half, not 300 each.
        c = Company()
        c.factory(F1, "Maltings", rid=MALT_RID)
        c.site(F2, "Brewery 2", kind="ba:businesstype_factory", machines=[RID, RID, MALT_RID])
        c.shop(SHOP_A, "Beer Bar")
        c.hold(F1, MALT, 100)
        c.hold(F2, MALT, 250)
        c.hold(F2, BEER, 300)
        c.hold(SHOP_A, BEER, 200, 900)
        c.plan(F1, F2, MALT, 600)
        c.plan(F2, SHOP_A, BEER, 2000)
        run_with(c, MALT_RECIPES)
        maltings, own_malt = line(c, F1, MALT), line(c, F2, MALT)
        self.assertEqual((maltings["needDay"], own_malt["needDay"]), (need(150), need(150)))
        self.assertEqual(line(c, F2, BEER)["soldDay"], 900)

    def test_an_intermediate_passed_from_factory_to_factory(self):
        # Two maltings in a row feed a brewery: the second makes malt too,
        # so the brewery's 240 a day is shared by the two malt lines.
        c = Company()
        c.factory(F1, "Maltings 1", rid=MALT_RID)
        c.factory(F2, "Maltings 2", rid=MALT_RID)
        c.factory(DEPOT, "Brewery")
        c.shop(SHOP_A, "Beer Bar")
        for f in (F1, F2):
            c.hold(f, MALT, 100)
        c.hold(DEPOT, MALT, 250)
        c.hold(DEPOT, BEER, 300)
        c.hold(SHOP_A, BEER, 200, 720)
        c.plan(F1, F2, MALT, 600)
        c.plan(F2, DEPOT, MALT, 600)
        c.plan(DEPOT, SHOP_A, BEER, 2000)
        run_with(c, MALT_RECIPES)
        self.assertEqual((line(c, F1, MALT)["needDay"], line(c, F2, MALT)["needDay"]), (need(120), need(120)))


class SingleStageTests(unittest.TestCase):
    def test_a_factory_with_no_route_into_it_keeps_the_whole_draw(self):
        c = Company()
        c.factory(F1, "Brewery")
        c.shop(SHOP_A, "Beer Bar")
        c.hold(F1, WATER, 500)
        c.hold(F1, BEER, 300)
        c.hold(SHOP_A, BEER, 200, 1000)
        c.plan(F1, SHOP_A, BEER, 2000)
        run_with(c, RECIPES)
        one = line(c, F1)
        self.assertEqual((one["soldDay"], one["needDay"]), (1000, need(1000)))
        self.assertEqual(one["production"]["level"], "critical")
        self.assertNotIn("chain", one)


if __name__ == "__main__":
    unittest.main()
