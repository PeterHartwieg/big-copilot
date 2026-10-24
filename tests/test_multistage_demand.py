"""Demand through multi-stage factory chains (issue #521), on synthetic
fixtures only.

A factory whose own lines make a product that a route from another of the
company's factories also brings it shares what the shops past it draw with
that route: Factory 1's beer goes through Factory 2, which makes beer too,
and the shops sell 1,000 a day. The two make it between them, each judged on
its share, never on all 1,000 each. The shares load every factory the same
where the plans let them, whatever order the sites are read in, so the
lines are short together when the chain is; route targets and the split
between several routes into one site can leave them uneven.
"""
import unittest

import ba_dashboard
from ba_dashboard import RECIPE_ITEMS, SUPPLY_MARGIN, site_key
from tests.test_factory_use import lines_at, run_with
from tests.test_supply_facts import BEER, RECIPES, RID, SHOP_A, SHOP_B, WATER, Company

F1 = ("upper_road", 7)
F2 = ("lower_road", 8)
F3 = ("third_road", 9)
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


def sold(c, *addrs):
    return tuple(line(c, a)["soldDay"] for a in addrs)


def level(c, addr):
    return line(c, addr)["production"]["level"]


def dem_walk(c, recipes=RECIPES):
    """The chain's Demand walk on the lines as sized, {(site key, item):
    node}: the last _supply_walk() a run makes."""
    seen, real = [], ba_dashboard._supply_walk
    ba_dashboard._supply_walk = lambda *a: seen.append(real(*a)) or seen[-1]
    try:
        run_with(c, recipes)
    finally:
        ba_dashboard._supply_walk = real
    return seen[-1]


def received(walk, addr, item=BEER):
    """What a site has a day in the Demand walk: its own supply and what the
    routes bring it."""
    node = walk[(site_key(addr), item)]
    return round(node["own"] + node["credit"])


def breweries(c, *addrs, order=None):
    for a in order or addrs:
        c.factory(a, a[0])
        c.hold(a, WATER, 500)
        c.hold(a, BEER, 300)


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
        # and Brewery 2 is the one short. The route brings 100 a day of the
        # chain's make, in the same units as the line's 720.
        c = two_breweries(1000, f1_target=100)
        one, two = line(c, F1), line(c, F2)
        brought = 100 / (1 + SUPPLY_MARGIN)
        self.assertEqual((one["soldDay"], two["soldDay"]), (round(brought), round(1000 - brought)))
        self.assertEqual(one["production"], {"status": "covered", "level": "ok"})
        self.assertEqual(two["production"]["level"], "critical")
        self.assertEqual(two["chain"]["makes"], 720 + 100)

    def test_a_target_that_carries_the_share_with_its_margin_is_enough(self):
        # 1,250 sold splits 625 each; 625 with the margin is 719, which a
        # route topping up to 720 carries and each line makes.
        c = two_breweries(1250, f1_target=720)
        self.assertEqual(sold(c, F1, F2), (625, 625))
        for addr in (F1, F2):
            self.assertEqual(line(c, addr)["production"], {"status": "covered", "level": "ok"})
        self.assertEqual(line(c, F2)["chain"]["makes"], 1440)

    def test_the_end_to_end_figures_follow_the_split(self):
        # Each line's Demand hours and the water it eats follow its 500 a
        # day: 575 with the margin on a 30-an-hour machine is 20 hours, and
        # a line eats one water for three beer.
        c = two_breweries(1000)
        for addr in (F1, F2):
            with self.subTest(addr=addr):
                self.assertEqual(line(c, addr)["needHours"]["dem"], 20)
                self.assertEqual(c.fact(addr, WATER)["dem"]["use"], 167)
        walk = dem_walk(two_breweries(1000))
        # The walk on those lines brings the bar its 1,150: Brewery 2's
        # own 575 and Brewery 1's 575 through the route.
        self.assertEqual(received(walk, F2), need(1000))
        self.assertEqual(round(walk[(site_key(F2), BEER)]["credit"]), need(500))
        self.assertTrue(walk[(site_key(SHOP_A), BEER)]["covered"])


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

    def test_a_feeder_that_also_sells_direct_shares_the_whole_load(self):
        # Brewery 1 also tops up a shop selling 400 a day: 1,400 a day
        # between two lines making 720 each is 700 each, so it sends
        # Brewery 2 300 of the bar's 1,000.
        c = two_breweries(1000, direct=400)
        self.assertEqual(sold(c, F1, F2), (700, 700))
        # 1,400 a day against 1,440 made: the chain keeps up, so neither is
        # critical, and only the margin is short.
        for addr in (F1, F2):
            self.assertEqual(level(c, addr), "warn")

    def test_a_feeder_with_its_own_shop_and_room_for_the_rest_is_covered(self):
        # 1,200 a day, 1,380 with the margin, against 1,440 made: 600 each
        # (Brewery 1's shop 400 and 200 for Brewery 2), both covered.
        c = two_breweries(800, direct=400)
        self.assertEqual(sold(c, F1, F2), (600, 600))
        for addr in (F1, F2):
            self.assertEqual(line(c, addr)["production"], {"status": "covered", "level": "ok"})
        walk = dem_walk(two_breweries(800, direct=400))
        self.assertEqual((received(walk, SHOP_A), received(walk, SHOP_B)), (need(800), need(400)))

    def test_a_depot_between_the_factories_changes_nothing(self):
        c = two_breweries(1000, via_depot=True)
        self.assertEqual((line(c, F1)["soldDay"], line(c, F2)["soldDay"]), (500, 500))
        self.assertEqual(line(c, F1)["chain"]["at"], c.index(F2))
        self.assertEqual(line(c, F1)["chain"]["from"], [c.index(DEPOT)])

    def test_a_depot_hop_keeps_the_feeders_target(self):
        # Brewery 1 tops the depot up to 100 a day: it brings 87 of a day's
        # use with the margin, the same as a route of 100 straight into
        # Brewery 2, and the shortage reads the same either way.
        for sold_day in (1000, 810):
            with self.subTest(sold=sold_day):
                c = Company()
                breweries(c, F1, F2)
                c.site(DEPOT, "Depot")
                c.hold(DEPOT, BEER, 300)
                c.shop(SHOP_A, "Beer Bar")
                c.hold(SHOP_A, BEER, 200, sold_day)
                c.plan(F1, DEPOT, BEER, 100)
                c.plan(DEPOT, F2, BEER, 2000)
                c.plan(F2, SHOP_A, BEER, 2000)
                run_with(c, RECIPES)
                direct = two_breweries(sold_day, f1_target=100)
                self.assertEqual(sold(c, F1, F2), sold(direct, F1, F2))
                self.assertEqual(line(c, F1)["needDay"], 100)
                self.assertEqual((level(c, F1), level(c, F2)), ("ok", "critical"))

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


def fork(sold_a, sold_b, order=(F1, F2, F3)):
    """Central (F1) tops up West (F2) and East (F3), which make beer too and
    top up a bar each; one machine each. `order` is the order the sites are
    added in."""
    c = Company()
    breweries(c, F1, F2, F3, order=order)
    for addr, shop, sold_day in ((F2, SHOP_A, sold_a), (F3, SHOP_B, sold_b)):
        c.shop(shop, shop[0])
        c.hold(shop, BEER, 200, sold_day)
        c.plan(F1, addr, BEER, 2000)
        c.plan(addr, shop, BEER, 3000)
    return c


class ForkTests(unittest.TestCase):
    """One feeder topping up two factories that make the same product."""

    def test_the_load_is_shared_by_all_three_whatever_the_site_order(self):
        for sold_day, each, lvl in ((600, 400, "ok"), (700, 467, "ok"), (900, 600, "ok"), (1000, 667, "warn")):
            for order in ((F1, F2, F3), (F3, F2, F1), (F2, F1, F3)):
                with self.subTest(sold=sold_day, order=order):
                    c = run_with(fork(sold_day, sold_day, order), RECIPES)
                    self.assertEqual(sold(c, F1, F2, F3), (each, each, each))
                    for addr in (F1, F2, F3):
                        self.assertEqual(level(c, addr), lvl)

    def test_uneven_shops_never_depend_on_the_site_order(self):
        runs = [run_with(fork(1000, 300, order), RECIPES) for order in ((F1, F2, F3), (F3, F2, F1))]
        first, second = (sold(c, F1, F2, F3) for c in runs)
        self.assertEqual(first, second)
        self.assertAlmostEqual(sum(first), 1300, delta=1)

    def test_each_meeting_factory_counts_its_part_of_the_feeder(self):
        # Each bar draws 1,150 with the margin; East makes 720 and Central
        # sends half its load there, half of its 720.
        c = run_with(fork(1000, 1000), RECIPES)
        east = line(c, F3)["chain"]
        self.assertEqual((east["at"], east["from"], east["makes"], east["need"]),
                         (c.index(F3), [c.index(F1)], 1080, need(1000)))

    def test_the_walk_brings_each_bar_its_need(self):
        walk = dem_walk(fork(900, 900))
        for addr, shop in ((F2, SHOP_A), (F3, SHOP_B)):
            with self.subTest(addr=addr):
                self.assertEqual(received(walk, shop), need(900))
                self.assertEqual(received(walk, addr), need(900))
                self.assertEqual(round(walk[(site_key(addr), BEER)]["own"]), need(600))
        c = run_with(fork(900, 900), RECIPES)
        for addr in (F1, F2, F3):
            with self.subTest(addr=addr):
                # 690 a day is 23 hours on a 30-an-hour machine.
                self.assertEqual(line(c, addr)["needHours"]["dem"], 23)
                self.assertEqual(c.fact(addr, WATER)["dem"]["use"], 200)


def diamond(sold_day):
    """Brewery 1 tops Brewery 2 up both through a depot and straight."""
    c = two_breweries(sold_day, via_depot=True)
    c.plan(F1, F2, BEER, 2000)
    return c


class DiamondTests(unittest.TestCase):
    """Two paths from one feeder into one meeting factory: its capacity is
    counted once."""

    def test_the_feeder_is_counted_once(self):
        for sold_day, each, lvl in ((300, 150, "ok"), (1000, 500, "ok"), (1440, 720, "warn")):
            with self.subTest(sold=sold_day):
                c = run_with(diamond(sold_day), RECIPES)
                self.assertEqual(sold(c, F1, F2), (each, each))
                self.assertEqual((level(c, F1), level(c, F2)), (lvl, lvl))
                self.assertEqual(line(c, F2)["chain"]["makes"], 1440)
                self.assertEqual(line(c, F1)["chain"]["at"], c.index(F2))

    def test_the_walk_brings_the_bar_its_need(self):
        walk = dem_walk(diamond(1000))
        self.assertEqual(received(walk, F2), need(1000))
        self.assertTrue(walk[(site_key(SHOP_A), BEER)]["covered"])

    def test_an_uneven_diamond_adds_up_and_keeps_up(self):
        # Brewery 1 (720) feeds Brewery 2 (1,440) and Brewery 3 (720), and
        # Brewery 2 feeds Brewery 3, behind which a bar sells 2,000. Brewery
        # 3's two routes split its draw by their targets, so the loads are
        # uneven, but the 2,880 made covers the 2,300 needed on every line.
        for order in ((F1, F2, F3), (F3, F2, F1)):
            with self.subTest(order=order):
                c = Company()
                for addr in order:
                    c.factory(addr, addr[0], machines=2 if addr == F2 else 1)
                    c.hold(addr, WATER, 500)
                    c.hold(addr, BEER, 300)
                c.shop(SHOP_A, "Beer Bar")
                c.hold(SHOP_A, BEER, 200, 2000)
                c.plan(F1, F2, BEER, 2000)
                c.plan(F1, F3, BEER, 2000)
                c.plan(F2, F3, BEER, 2000)
                c.plan(F3, SHOP_A, BEER, 3000)
                run_with(c, RECIPES)
                self.assertEqual(sold(c, F1, F2, F3), (626, 828, 545))
                for addr in (F1, F2, F3):
                    self.assertEqual(line(c, addr)["production"], {"status": "covered", "level": "ok"})
                self.assertLessEqual(line(c, F3)["chain"]["makes"], 2880)


class LongerChainTests(unittest.TestCase):
    def test_three_factories_in_a_row_share_it_three_ways(self):
        for sold_day, each, lvl in ((1000, 333, "ok"), (2160, 720, "warn")):
            with self.subTest(sold=sold_day):
                c = Company()
                breweries(c, F1, F2, F3)
                c.shop(SHOP_A, "Beer Bar")
                c.hold(SHOP_A, BEER, 200, sold_day)
                c.plan(F1, F2, BEER, 3000)
                c.plan(F2, F3, BEER, 3000)
                c.plan(F3, SHOP_A, BEER, 3000)
                run_with(c, RECIPES)
                self.assertEqual(sold(c, F1, F2, F3), (each, each, each))
                for addr in (F1, F2, F3):
                    self.assertEqual(level(c, addr), lvl)
                self.assertEqual(line(c, F3)["chain"]["makes"], 2160)

    def test_two_feeders_into_one_factory_share_it_with_its_line(self):
        c = Company()
        breweries(c, F1, F2, F3)
        c.shop(SHOP_A, "Beer Bar")
        c.hold(SHOP_A, BEER, 200, 1500)
        c.plan(F1, F3, BEER, 2000)
        c.plan(F2, F3, BEER, 2000)
        c.plan(F3, SHOP_A, BEER, 3000)
        run_with(c, RECIPES)
        self.assertEqual(sold(c, F1, F2, F3), (500, 500, 500))
        chain = line(c, F1)["chain"]
        self.assertEqual((chain["at"], sorted(chain["from"]), chain["makes"]),
                         (c.index(F3), sorted([c.index(F1), c.index(F2)]), 2160))


class UnreadableTests(unittest.TestCase):
    def test_a_feeder_the_board_cannot_read_leaves_the_old_figure(self):
        # Brewery 1 runs a recipe the board cannot name: its capacity is
        # unknown, so Brewery 2 is judged on all the bar sells, as before.
        c = Company()
        c.factory(F1, "Brewery 1", rid="unknown-recipe")
        breweries(c, F2)
        c.hold(F1, BEER, 300)
        c.shop(SHOP_A, "Beer Bar")
        c.hold(SHOP_A, BEER, 200, 1000)
        c.plan(F1, F2, BEER, 2000)
        c.plan(F2, SHOP_A, BEER, 2000)
        run_with(c, RECIPES)
        two = line(c, F2)
        self.assertEqual((two["soldDay"], two["needDay"]), (1000, need(1000)))
        self.assertNotIn("chain", two)


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
