"""Demand through multi-stage factory chains (issue #521), on synthetic
fixtures only.

A factory whose own lines make a product that a route from another of the
company's factories also brings it shares what the shops past it draw with
that route: Factory 1's beer goes through Factory 2, which makes beer too,
and the shops sell 1,000 a day. The two make it between them, each judged on
its share, never on all 1,000 each. The shares load every producer the same
where nothing binds, whatever the sites' names or the order they are read
in, so the lines are short together when the chain is. A binding route
target throttles only the paths through it, and what reaches a site of the
chain is shared between its senders as the split routes it. Expected splits
come with the chain's walk where they matter, what each shop receives held
to its need with the margin, so a recorded but infeasible answer cannot
pass.
"""
import contextlib
import io
import itertools
import math
import random
import unittest
from unittest.mock import patch

import ba_dashboard
from ba_dashboard import RECIPE_ITEMS, SUPPLY_MARGIN, site_key
from tests.test_factory_use import lines_at, run_with
from tests.test_supply_facts import BEER, RECIPES, RID, SHOP_A, SHOP_B, WATER, Company

F1 = ("upper_road", 7)
F2 = ("lower_road", 8)
F3 = ("third_road", 9)
DEPOT = ("depot_lane", 3)
F4 = ("fourth_road", 10)
F5 = ("fifth_road", 11)
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


def short_of_its_need(walk, shop, sold_day, item=BEER):
    """The part of what a shop sells with the margin that the Demand walk
    does not bring it, unrounded (`covered` alone only holds it to its
    sales); the walk itself settles to about a part in 10^6."""
    node = walk[(site_key(shop), item)]
    wanted = sold_day * (1 + SUPPLY_MARGIN)
    return (wanted - (node["own"] + node["credit"])) / wanted


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

    def test_uneven_bars_each_get_their_need(self):
        # The split has Central send East the most, or none to a factory
        # whose own line covers its bar. The walk asks each route what the
        # split routes it, its line bringing the rest; before, it asked
        # Central for each factory's whole need by the targets, so West
        # piled up what East's bar went without: 958 of 1,035 at 600 /
        # 900, 721 of 805 at 700 / 250, 931 of 1,035 at 900 / 300.
        for sold_a, sold_b in ((600, 900), (700, 250), (900, 300), (1000, 300)):
            with self.subTest(sold=(sold_a, sold_b)):
                c = fork(sold_a, sold_b)
                walk = dem_walk(c)
                self.assertEqual([level(c, a) for a in (F1, F2, F3)], ["ok"] * 3)
                self.assertEqual(sum(sold(c, F1, F2, F3)), sold_a + sold_b)
                for shop, sold_day in ((SHOP_A, sold_a), (SHOP_B, sold_b)):
                    self.assertLessEqual(short_of_its_need(walk, shop, sold_day), 1e-6)


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
        # Brewery 2 feeds Brewery 3, behind which a bar sells 2,000. The
        # split loads all three at 2,000 / 2,880 and routes nothing from
        # Brewery 1 into Brewery 2: Brewery 1 sends its 500 to Brewery 3,
        # Brewery 2 its 1,000, and Brewery 3 makes the other 500. Brewery
        # 3's routed draw is shared as the split routes it, never by the
        # targets (750 each, which held Brewery 1 to 626 before), so each
        # line reads the split's own figure.
        for order in ((F1, F2, F3), (F3, F2, F1)):
            with self.subTest(order=order):
                c = uneven_diamond(order)
                walk = dem_walk(c)
                self.assertEqual(sold(c, F1, F2, F3), (500, 1000, 500))
                for addr in (F1, F2, F3):
                    self.assertEqual(line(c, addr)["production"], {"status": "covered", "level": "ok"})
                # 720 made there and 2,000 at most through the two routes.
                self.assertEqual(line(c, F3)["chain"]["makes"], 2720)
                self.assertEqual(received(walk, SHOP_A), need(2000))


def uneven_diamond(order=(F1, F2, F3)):
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
    return c


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


def grok_depot_on_one_path(order=(F1, F2, F3)):
    """Brewery 1 tops Brewery 3 up straight, and Brewery 2 through a depot it
    tops up to 80; Brewery 3 makes beer too and tops up a bar selling
    1,000. `order` names the addresses of Breweries 1, 2 and 3."""
    one, two, three = order
    c = Company()
    breweries(c, one, two, three)
    c.site(DEPOT, "Depot")
    c.hold(DEPOT, BEER, 300)
    c.shop(SHOP_A, "Beer Bar")
    c.hold(SHOP_A, BEER, 200, 1000)
    c.plan(one, three, BEER, 2000)
    c.plan(two, DEPOT, BEER, 80)
    c.plan(DEPOT, three, BEER, 2000)
    c.plan(three, SHOP_A, BEER, 3000)
    return c


def target_into_a_meeting_factory(order=(F1, F2, F3)):
    """Opus's p7: Brewery 1 tops Brewery 2 up to 400, Brewery 2 tops Brewery
    3 up, and Brewery 3 a bar selling 1,500; all three make beer."""
    one, two, three = order
    c = Company()
    breweries(c, one, two, three)
    c.shop(SHOP_A, "Beer Bar")
    c.hold(SHOP_A, BEER, 200, 1500)
    c.plan(one, two, BEER, 400)
    c.plan(two, three, BEER, 3000)
    c.plan(three, SHOP_A, BEER, 3000)
    return c


def shared_depot(feed, sold_a, sold_b=None, order=(F1, F2, F3)):
    """Brewery 1 tops a depot up to `feed`; the depot tops up Breweries 2 and
    3, which make beer too and top up a shop each selling `sold_a` and
    `sold_b` (Astra's repro at 600 and 850, Opus's p1 at 400 and 750)."""
    one, two, three = order
    c = Company()
    breweries(c, one, two, three)
    c.site(DEPOT, "Depot")
    c.hold(DEPOT, BEER, 300)
    c.plan(one, DEPOT, BEER, feed)
    for factory, shop, sold_day in ((two, SHOP_A, sold_a), (three, SHOP_B, sold_a if sold_b is None else sold_b)):
        c.shop(shop, shop[0])
        c.hold(shop, BEER, 200, sold_day)
        c.plan(DEPOT, factory, BEER, 2000)
        c.plan(factory, shop, BEER, 3000)
    return c


def covered(walk, addr, item=BEER):
    return walk[(site_key(addr), item)]["covered"]


class BindingTargetTests(unittest.TestCase):
    """Round 2's repros: a target that binds on one path, into a shared
    depot, or into a factory that makes the product too, leaves the rest of
    the chain to carry what it can."""

    def test_a_tight_depot_on_one_path_throttles_only_that_path(self):
        # The depot passes 70 of Brewery 2's (80 less the margin); Brewery 1
        # and Brewery 3 share the other 930. Before, the depot's slack
        # capped every route into Brewery 3 (70 / 70 / 861, critical).
        c = grok_depot_on_one_path()
        walk = dem_walk(c)
        self.assertEqual(sold(c, F1, F2, F3), (465, 70, 465))
        for addr in (F1, F2, F3):
            self.assertEqual(level(c, addr), "ok")
        self.assertTrue(covered(walk, SHOP_A))
        self.assertEqual(received(walk, SHOP_A), need(1000))
        # Brewery 3's line, Brewery 1's 720 and the depot's 80.
        self.assertEqual(line(c, F3)["chain"]["makes"], 720 + 720 + 80)

    def test_one_feeder_straight_and_through_a_tight_depot(self):
        # Brewery 1 tops Brewery 2 up straight and through a depot it tops
        # up to 100: the depot brings 87, the straight route the rest of
        # Brewery 1's half. Before, 174 / 826 and Brewery 2 critical.
        c = Company()
        breweries(c, F1, F2)
        c.site(DEPOT, "Depot")
        c.hold(DEPOT, BEER, 300)
        c.shop(SHOP_A, "Beer Bar")
        c.hold(SHOP_A, BEER, 200, 1000)
        c.plan(F1, F2, BEER, 2000)
        c.plan(F1, DEPOT, BEER, 100)
        c.plan(DEPOT, F2, BEER, 2000)
        c.plan(F2, SHOP_A, BEER, 3000)
        walk = dem_walk(c)
        self.assertEqual(sold(c, F1, F2), (500, 500))
        self.assertEqual((level(c, F1), level(c, F2)), ("ok", "ok"))
        self.assertTrue(covered(walk, SHOP_A))

    def test_a_target_into_a_factory_that_makes_it_too(self):
        # Brewery 1 brings Brewery 2 at most 348 (400 less the margin), and
        # Breweries 2 and 3 share the other 1,152: 576 each, 662 with the
        # margin, all within 720. Before, 348 / 402 / 750 and Brewery 3
        # critical.
        c = target_into_a_meeting_factory()
        walk = dem_walk(c)
        self.assertEqual(sold(c, F1, F2, F3), (348, 576, 576))
        for addr in (F1, F2, F3):
            self.assertEqual(level(c, addr), "ok")
        self.assertEqual(sum(sold(c, F1, F2, F3)), 1500)
        # What the chain can carry, not what it routes now: 720 + 720 + 400.
        self.assertEqual(line(c, F3)["chain"]["makes"], 1840)
        self.assertEqual(line(c, F3)["chain"]["need"], need(1500))
        self.assertTrue(covered(walk, SHOP_A))

    def test_a_shared_depot_shares_its_room(self):
        # Astra's repro: the depot passes 522 a day (600 less the margin),
        # which goes half to each brewery behind it; each makes 589 of its
        # shop's 850, 677.5 with the margin. Before, 522 / 522 / 657 with
        # Brewery 3 short a machine.
        c = shared_depot(600, 850)
        walk = dem_walk(c)
        self.assertEqual(sold(c, F1, F2, F3), (522, 589, 589))
        for addr in (F1, F2, F3):
            self.assertEqual(level(c, addr), "ok")
        for shop in (SHOP_A, SHOP_B):
            with self.subTest(shop=shop):
                self.assertTrue(covered(walk, shop))
                node = walk[(site_key(shop), BEER)]
                self.assertAlmostEqual(node["own"] + node["credit"], 850 * (1 + SUPPLY_MARGIN), delta=0.5)
        # Each counts its half of the depot's 600, never all of it.
        self.assertEqual(line(c, F2)["chain"]["makes"] + line(c, F3)["chain"]["makes"], 2 * 720 + 600)

    def test_a_shared_depot_never_favours_the_first_address(self):
        # Opus's p1: before, the brewery whose address sorted first took
        # all the depot's room (348 / 402 / 750).
        c = run_with(shared_depot(400, 750), RECIPES)
        self.assertEqual(sold(c, F1, F2, F3), (348, 576, 576))
        for addr in (F1, F2, F3):
            self.assertEqual(level(c, addr), "ok")

    def test_a_target_on_the_only_path_still_binds(self):
        c = run_with(shared_depot(100, 1000, 0), RECIPES)
        self.assertEqual(line(c, F1)["needDay"], 100)
        self.assertEqual(level(c, F2), "critical")


class SiteNameTests(unittest.TestCase):
    """The split follows each site's place in the plans, never its address:
    the same shapes with the addresses dealt out to the roles every way."""

    ADDRESSES = (F1, F2, F3)

    def assertFollowsTheRoles(self, build, sold_days):
        for order in itertools.permutations(self.ADDRESSES):
            with self.subTest(order=order):
                c = run_with(build(order), RECIPES)
                self.assertEqual(sold(c, *order), sold_days)

    def test_the_tight_depot_shape(self):
        self.assertFollowsTheRoles(grok_depot_on_one_path, (465, 70, 465))

    def test_the_target_into_a_meeting_factory(self):
        self.assertFollowsTheRoles(target_into_a_meeting_factory, (348, 576, 576))

    def test_a_shared_depot_with_uneven_shops(self):
        # Shops selling 1,200 and 300: Brewery 3 makes its 300 and routes
        # nothing in; Brewery 1 gives Brewery 2 the depot's 522, and
        # Brewery 2 makes the other 678.
        self.assertFollowsTheRoles(lambda order: shared_depot(600, 1200, 300, order), (522, 678, 300))

    def test_an_uneven_fork(self):
        def build(order):
            one, two, three = order
            c = Company()
            breweries(c, one, two, three)
            for addr, shop, sold_day in ((two, SHOP_A, 1000), (three, SHOP_B, 300)):
                c.shop(shop, shop[0])
                c.hold(shop, BEER, 200, sold_day)
                c.plan(one, addr, BEER, 2000)
                c.plan(addr, shop, BEER, 3000)
            return c
        # 1,300 a day across three 720s, 433 each; East's shop takes only
        # 300, so it routes nothing in and West takes the rest.
        self.assertFollowsTheRoles(build, (500, 500, 300))


class ImportTests(unittest.TestCase):
    """An import or wholesale delivery in the chain is a producer wherever it
    comes in, and a line is judged only on what its machines make."""

    def setUp(self):
        self.shop_target = lambda c: [(a, b, p, 3000 if b == SHOP_A else t) for a, b, p, t in c.targets]

    def test_an_import_at_a_depot_between_the_factories(self):
        # Astra's repro: 2,160 a day (720 imported at the depot) against
        # 2,070 needed. Before this, the import vanished: 900 / 1,035
        # needed and Brewery 2 a machine short.
        c = two_breweries(1800, via_depot=True)
        c.contract(DEPOT, BEER, 5040)
        c.targets = self.shop_target(c)
        walk = dem_walk(c)
        self.assertEqual(line(c, F2)["soldDay"], 600)
        self.assertEqual((level(c, F1), level(c, F2)), ("ok", "ok"))
        self.assertEqual(line(c, F2)["chain"]["makes"], 2160)
        self.assertEqual(received(walk, SHOP_A), need(1800))

    def test_an_import_at_the_feeder_beside_its_line(self):
        # Brewery 1 imports 720 a day beside its own line: its line is
        # judged on its part, 600, not on all 1,200 it sends.
        c = two_breweries(1800)
        c.contract(F1, BEER, 5040)
        c.targets = self.shop_target(c)
        walk = dem_walk(c)
        self.assertEqual(sold(c, F1, F2), (600, 600))
        self.assertEqual((level(c, F1), level(c, F2)), ("ok", "ok"))
        self.assertEqual(received(walk, SHOP_A), need(1800))
        self.assertEqual(line(c, F1)["chain"]["at"], c.index(F2))

    def test_an_import_at_the_meeting_factory(self):
        # Brewery 2 imports 720 a day: the two lines and the import share
        # the 1,800, 600 each, and what reaches Brewery 2 past its line is
        # Brewery 1's and the import's half each, as the split routes it.
        c = two_breweries(1800)
        c.contract(F2, BEER, 5040)
        c.targets = self.shop_target(c)
        walk = dem_walk(c)
        self.assertEqual(sold(c, F1, F2), (600, 600))
        self.assertEqual((level(c, F1), level(c, F2)), ("ok", "ok"))
        self.assertEqual(line(c, F2)["chain"]["makes"], 2160)
        self.assertEqual(received(walk, SHOP_A), need(1800))

    def test_a_wholesale_delivery_at_the_meeting_factory(self):
        c = two_breweries(1800)
        c.wholesale(F2, BEER, 5040)
        c.targets = self.shop_target(c)
        self.assertEqual(sold(c := run_with(c, RECIPES), F1, F2), (600, 600))
        self.assertEqual((level(c, F1), level(c, F2)), ("ok", "ok"))

    def test_a_factory_alone_with_an_import_keeps_the_old_figure(self):
        # No chain: the line is asked all its shops sell, as on main.
        c = Company()
        breweries(c, F1)
        c.shop(SHOP_A, "Beer Bar")
        c.hold(SHOP_A, BEER, 200, 1200)
        c.contract(F1, BEER, 5040)
        c.plan(F1, SHOP_A, BEER, 3000)
        run_with(c, RECIPES)
        self.assertEqual(sold(c, F1), (1200,))
        self.assertNotIn("chain", line(c, F1))


class WideForkTests(unittest.TestCase):
    def test_twenty_factories_near_capacity_are_all_covered(self):
        # Astra's repro: one feeder tops up twenty breweries, each with a
        # shop selling 657; 13,140 across 21 lines is 625.7 each, 719.6
        # with the margin, inside 720. Before, the passes ran out and
        # eight read a machine short.
        c = Company()
        feeder = ("factory_feed", 1)
        factories = [(f"factory_{i:02}", 1) for i in range(20)]
        breweries(c, feeder, *factories)
        for i, addr in enumerate(factories):
            shop = (f"shop_{i:02}", 1)
            c.shop(shop, shop[0])
            c.hold(shop, BEER, 200, 657)
            c.plan(feeder, addr, BEER, 2000)
            c.plan(addr, shop, BEER, 2000)
        run_with(c, RECIPES)
        for addr in (feeder, *factories):
            with self.subTest(addr=addr):
                self.assertEqual((line(c, addr)["soldDay"], line(c, addr)["needDay"]), (626, 720))
                self.assertEqual(level(c, addr), "ok")


LOOP_RECIPES = {
    BEER: MALT_RECIPES[BEER],
    MALT: {**MALT_RECIPES[MALT], "ingredients": [{"slug": BEER, "item": "Beer", "per": 5}]},
}


class RecipeLoopTests(unittest.TestCase):
    def test_a_recipe_loop_keeps_the_old_figures_whatever_the_site_order(self):
        # Beer eats malt and malt eats beer: what the lines draw depends on
        # their own split, so neither is split, and both factories are
        # asked all the bar sells, as before #521, in either order.
        runs = []
        for order in ((F1, F2), (F2, F1)):
            with self.subTest(order=order):
                c = Company()
                for addr in order:
                    c.site(addr, addr[0], kind="ba:businesstype_factory", machines=[RID, MALT_RID])
                    c.hold(addr, BEER, 300)
                    c.hold(addr, MALT, 300)
                c.shop(SHOP_A, "Beer Bar")
                c.hold(SHOP_A, BEER, 200, 1000)
                c.plan(F1, F2, BEER, 2000)
                c.plan(F1, F2, MALT, 2000)
                c.plan(F2, SHOP_A, BEER, 2000)
                run_with(c, LOOP_RECIPES)
                runs.append([(line(c, a, s)["soldDay"], line(c, a, s)["needDay"], line(c, a, s)["needHours"]["dem"])
                             for a in (F1, F2) for s in (BEER, MALT)])
                self.assertEqual(sold(c, F1, F2), (1000, 1000))
                self.assertNotIn("chain", line(c, F2))
        self.assertEqual(runs[0], runs[1])


class RoundingTests(unittest.TestCase):
    def test_the_sold_days_add_up_to_what_the_bar_sells(self):
        for c, addrs, total in ((run_with(uneven_diamond(), RECIPES), (F1, F2, F3), 2000),
                                (run_with(grok_depot_on_one_path(), RECIPES), (F1, F2, F3), 1000),
                                (run_with(target_into_a_meeting_factory(), RECIPES), (F1, F2, F3), 1500)):
            with self.subTest(total=total):
                self.assertEqual(sum(sold(c, *addrs)), total)

    def test_equal_shares_keep_their_own_rounding(self):
        # Three equal shares of 1,400 are 466.7 each: no one of them can be
        # picked for 466 but by its name, so all three read 467.
        c = run_with(fork(700, 700), RECIPES)
        self.assertEqual(sold(c, F1, F2, F3), (467, 467, 467))


class SmartDeliveryTests(unittest.TestCase):
    """A Smart Delivery import tops its site up to its level, counting the
    stock the routes into the site keep there: a level at or under their
    target brings nothing (_import_drop()), in the split as in the walk."""

    def chain(self, where, amount, sold_day=1200, via_depot=True):
        c = two_breweries(sold_day, via_depot=via_depot)
        c.contract(where, BEER, amount, smart=True)
        c.targets = [(a, b, p, 3000 if b == SHOP_A else t) for a, b, p, t in c.targets]
        return c, dem_walk(c)

    # Every route into the depot and Brewery 2 tops up to 2,000.
    PLACES = ((DEPOT, True), (F2, True), (F2, False))

    def test_a_level_at_or_under_the_routes_target_brings_nothing(self):
        # Astra's repro (the depot at 1,400): before, the level counted as
        # 200 a day in the split, Brewery 1 read 673 and a machine short,
        # and the bar received 1,326 of its 1,380.
        for where, via in self.PLACES:
            for amount in (1400, 2000):
                with self.subTest(where=where, via_depot=via, level=amount):
                    c, walk = self.chain(where, amount)
                    self.assertEqual(sold(c, F1, F2), (600, 600))
                    for addr in (F1, F2):
                        self.assertEqual(line(c, addr)["production"], {"status": "covered", "level": "ok"})
                    self.assertEqual(line(c, F2)["chain"]["makes"], 1440)
                    self.assertLessEqual(short_of_its_need(walk, SHOP_A, 1200), 1e-6)

    def test_a_level_past_the_routes_target_brings_the_difference(self):
        # 5,040 against the routes' 2,000 brings 3,040 a week, 434 a day:
        # the two lines and it share the 1,200, 461 a line.
        for where, via in self.PLACES:
            with self.subTest(where=where, via_depot=via):
                c, walk = self.chain(where, 5040)
                self.assertEqual(sold(c, F1, F2), (461, 461))
                self.assertEqual(line(c, F2)["chain"]["makes"], round(1440 + 3040 / 7))
                self.assertLessEqual(short_of_its_need(walk, SHOP_A, 1200), 1e-6)

    def test_a_chain_short_with_a_smart_import_is_short_on_both_lines(self):
        # Opus's repro: 2,800 against 2,000 brings 114 a day, so 720 + 720
        # + 114 against 1,725 needed. Before, Brewery 1 read critical,
        # Brewery 2 fine and the tip 1,840.
        c, walk = self.chain(DEPOT, 2800, sold_day=1500)
        self.assertEqual(sold(c, F1, F2), (695, 695))
        self.assertEqual((level(c, F1), level(c, F2)), ("warn", "warn"))
        tip = line(c, F2)["chain"]
        self.assertEqual((tip["makes"], tip["need"]), (round(1440 + 800 / 7), need(1500)))
        self.assertLess(tip["makes"], tip["need"])


def three_meeting(order=(F1, F2, F3)):
    """Astra's round-3 repro: Brewery 1 tops Brewery 2 up to 400 and Brewery
    3 to 3,000, and Brewery 2 tops Brewery 3 up to 2,000; Breweries 2 and 3
    each top up a shop, selling 800 and 1,000. `order` names the addresses
    of Breweries 1, 2 and 3."""
    one, two, three = order
    c = Company()
    breweries(c, one, two, three)
    for factory, shop, sold_day in ((two, SHOP_A, 800), (three, SHOP_B, 1000)):
        c.shop(shop, shop[0])
        c.hold(shop, BEER, 200, sold_day)
        c.plan(factory, shop, BEER, 4000)
    c.plan(one, two, BEER, 400)
    c.plan(one, three, BEER, 3000)
    c.plan(two, three, BEER, 2000)
    return c


def five_sites(sold_day, order=(F1, F2, F3, F4, F5)):
    """Opus's p3: Brewery 1 (one machine) tops up Brewery 2 (two) and Brewery
    5 (one); Brewery 2 tops up Brewery 3 (one) and Brewery 5; Breweries 3
    and 5 top up Brewery 4 (three), which tops up a bar selling `sold_day`;
    Brewery 3 also tops up a shop selling half that. `order` names the
    addresses of Breweries 1 to 5."""
    f1, f2, f3, f4, f5 = order
    c = Company()
    for addr, machines in zip(order, (1, 2, 1, 3, 1)):
        c.factory(addr, addr[0], machines=machines)
        c.hold(addr, WATER, 900)
        c.hold(addr, BEER, 300)
    c.shop(SHOP_A, "A")
    c.hold(SHOP_A, BEER, 200, sold_day)
    c.shop(SHOP_B, "B")
    c.hold(SHOP_B, BEER, 200, sold_day // 2)
    c.plan(f1, f2, BEER, 2000)
    c.plan(f2, f3, BEER, 2000)
    c.plan(f3, f4, BEER, 2000)
    c.plan(f1, f5, BEER, 2000)
    c.plan(f5, f4, BEER, 2000)
    c.plan(f2, f5, BEER, 900)
    c.plan(f4, SHOP_A, BEER, 4000)
    c.plan(f3, SHOP_B, BEER, 3000)
    return c


class SolvedRoutesTests(unittest.TestCase):
    """What reaches a site of the chain is shared between its senders as the
    split routes it, not by their targets, so each line is judged on the
    split's own figure and no sender is asked past its room."""

    def test_a_meeting_factory_that_sends_on_reads_the_split(self):
        # Before, Brewery 3's routed draw went 60 / 40 by the targets,
        # Brewery 2 read 647 and a machine short, and the shops received
        # 906.9 and 1,139.2 of 920 and 1,150.
        for order in itertools.permutations((F1, F2, F3)):
            with self.subTest(order=order):
                c = three_meeting(order)
                walk = dem_walk(c)
                self.assertEqual(sold(c, *order), (600, 600, 600))
                for addr in order:
                    self.assertEqual(line(c, addr)["production"], {"status": "covered", "level": "ok"})
                for shop, sold_day in ((SHOP_A, 800), (SHOP_B, 1000)):
                    self.assertLessEqual(short_of_its_need(walk, shop, sold_day), 1e-6)
                for addr in order:
                    tip = line(c, addr).get("chain")
                    if tip:
                        self.assertGreaterEqual(tip["makes"], tip["need"])

    def test_five_sites_with_two_senders_into_one_factory(self):
        # The split loads every line at 4,500 / 5,760 (0.78) at 3,000 a
        # day and 0.86 at 3,300, inside 720 with the margin. Before, Brewery
        # 3 was asked half of Brewery 4's routed draw by the equal targets
        # (629, 724 needed) and Breweries 2 and 3 read a machine short.
        for sold_day, each in ((3000, 562), (3300, 619)):
            with self.subTest(sold=sold_day):
                c = five_sites(sold_day)
                walk = dem_walk(c)
                figures = sold(c, F1, F2, F3, F4, F5)
                self.assertEqual((figures[0], figures[2], figures[4]), (each, each, each))
                for addr in (F1, F2, F3, F4, F5):
                    self.assertEqual(level(c, addr), "ok")
                for shop, shop_sold in ((SHOP_A, sold_day), (SHOP_B, sold_day // 2)):
                    self.assertLessEqual(short_of_its_need(walk, shop, shop_sold), 1e-6)

    def test_the_shops_receive_their_need_with_the_margin(self):
        # Where every line is covered, the walk on the lines as sized
        # brings each shop its sales with the margin, not just its sales.
        shapes = ((fork(900, 900), ((SHOP_A, 900), (SHOP_B, 900))),
                  (shared_depot(600, 850), ((SHOP_A, 850), (SHOP_B, 850))),
                  (target_into_a_meeting_factory(), ((SHOP_A, 1500),)),
                  (grok_depot_on_one_path(), ((SHOP_A, 1000),)),
                  (uneven_diamond(), ((SHOP_A, 2000),)),
                  (diamond(1000), ((SHOP_A, 1000),)))
        for i, (c, shops) in enumerate(shapes):
            with self.subTest(shape=i):
                walk = dem_walk(c)
                for shop, sold_day in shops:
                    self.assertLessEqual(short_of_its_need(walk, shop, sold_day), 1e-6)


class AddressTests(unittest.TestCase):
    """Not a figure shown, a chain's tip included, follows the sites'
    names."""

    def test_degenerate_routes_never_move_a_figure(self):
        # Astra's repro: the split routes Brewery 1's output two ways at
        # the same loads. Before, Brewery 2 read 674 or 675 needed by the
        # addresses.
        seen = set()
        for role in itertools.permutations((("a", 1), ("b", 1), ("c", 1))):
            one, two, three = role
            c = Company()
            breweries(c, *role)
            for addr, shop, sold_day in ((two, SHOP_A, 626), (three, SHOP_B, 1107)):
                c.shop(shop, shop[0])
                c.hold(shop, BEER, 200, sold_day)
                c.plan(addr, shop, BEER, 4000)
            c.plan(one, two, BEER, 2000)
            c.plan(one, three, BEER, 3000)
            c.plan(two, three, BEER, 400)
            run_with(c, RECIPES)
            seen.add(tuple((line(c, a)["soldDay"], line(c, a)["needDay"], line(c, a)["needHours"]["dem"],
                            (line(c, a).get("chain") or {}).get("makes")) for a in role))
        self.assertEqual(len(seen), 1)

    def test_five_sites_read_the_same_whatever_their_names(self):
        # Opus's permutations: before, a sold or needed day moved by one in
        # 23 of 120 address orders at 1,500 a day, and a tip's figure too.
        addresses = [("aa_road", 21), ("mm_road", 22), ("zz_road", 23), ("bb_road", 24), ("qq_road", 25)]
        orders = list(itertools.permutations(addresses))
        for sold_day in (1500, 3000, 4000):
            seen = set()
            for order in random.Random(sold_day).sample(orders, 12):
                c = run_with(five_sites(sold_day, order), RECIPES)
                roles = {c.index(a): i for i, a in enumerate(order)}
                tips = [line(c, a).get("chain") or {} for a in order]
                seen.add(tuple((line(c, a)["soldDay"], line(c, a)["needDay"], level(c, a),
                                tip.get("makes"), tip.get("need"), roles.get(tip.get("at")))
                               for a, tip in zip(order, tips)))
            with self.subTest(sold=sold_day):
                self.assertEqual(len(seen), 1)

    def test_a_feeder_between_two_meeting_factories_names_the_tighter(self):
        # At 4,000 a day Brewery 1 tops up Breweries 2 and 5, one hop each:
        # its tip names the link with the least room, whichever sorts first.
        addresses = [("aa_road", 21), ("mm_road", 22), ("zz_road", 23), ("bb_road", 24), ("qq_road", 25)]
        named = set()
        for order in (tuple(addresses), tuple(reversed(addresses)), tuple(addresses[2:] + addresses[:2])):
            c = run_with(five_sites(4000, order), RECIPES)
            tip = line(c, order[0])["chain"]
            at = next(i for i, a in enumerate(order) if c.index(a) == tip["at"])
            options = [line(c, order[i])["chain"] for i in (1, 4)]
            self.assertEqual(tip["need"] - tip["makes"], max(o["need"] - o["makes"] for o in options))
            named.add(at)
        self.assertEqual(len(named), 1)


class ChainRoundingTests(unittest.TestCase):
    def test_two_chains_that_never_meet_round_apart(self):
        # Grok's repro: two chains each selling 2.7 a day, one machine
        # into four and one into thirteen. Alone they read 1 / 2 and 0 / 3;
        # rounded as one group, the second read 0 / 2.
        a1, a2, b1, b2 = ("a_one", 31), ("a_two", 32), ("b_one", 33), ("b_two", 34)
        shop_a, shop_b = ("a_shop", 35), ("b_shop", 36)

        def build(chains):
            c = Company()
            for one, two, machines, shop in chains:
                c.factory(one, one[0], machines=1)
                c.factory(two, two[0], machines=machines)
                for f in (one, two):
                    c.hold(f, WATER, 500)
                    c.hold(f, BEER, 300)
                c.shop(shop, shop[0])
                c.hold(shop, BEER, 200, 2.7)
                c.plan(one, two, BEER, 2000)
                c.plan(two, shop, BEER, 2000)
            return run_with(c, RECIPES)
        first, second = (a1, a2, 4, shop_a), (b1, b2, 13, shop_b)
        alone = sold(build([first]), a1, a2), sold(build([second]), b1, b2)
        together = build([first, second])
        self.assertEqual(alone, ((1, 2), (0, 3)))
        self.assertEqual((sold(together, a1, a2), sold(together, b1, b2)), alone)


    def test_the_tip_reads_a_half_the_same_whatever_the_addresses(self):
        # Opus's round 6: Brewery 1's link needs 2,250 / 2 a day with the
        # margin, 1147.5 in some address orders and 1147.4999999999998 in
        # others, which read 1,148 and 1,147.
        pool = [("a_road", 1), ("b_road", 2), ("c_road", 3), ("d_road", 4), ("e_road", 5), ("f_road", 6)]
        seen = set()
        for addrs in itertools.permutations(pool, 4):
            f0, f1, f2, f3 = addrs
            c = Company()
            for i, (a, machines) in enumerate(zip(addrs, (2, 1, 1, 1))):
                c.factory(a, f"Brewery F{i}", machines=machines)
                c.hold(a, WATER, 900)
                c.hold(a, BEER, 300)
            c.shop(SHOP_A, "A")
            c.hold(SHOP_A, BEER, 200, 2250)
            for src, dest, target in ((f0, f1, 2000), (f1, SHOP_A, 1000), (f2, SHOP_A, 500), (f2, f3, 2000),
                                      (f3, SHOP_A, 1000)):
                c.plan(src, dest, BEER, target)
            run_with(c, RECIPES)
            seen.add(tuple((line(c, a).get("chain") or {}).get("need") for a in addrs))
        self.assertEqual(seen, {(1148, 1148, 979, 979)})

    def test_a_share_a_hair_from_all_meets_nothing(self):
        # A route carrying a billionth of a unit a day leaves Beta's own
        # share at 0.999999999999: no link, as at 1.
        sizing = sizing_of(alpha_beta(F1, F2))
        alpha, beta = site_key(F1), site_key(F2)
        self.assertEqual([at for at, _via, _brings in sizing.merges(alpha, BEER)], [beta])
        real = sizing.made_share
        for share in (1 - 1e-12, 1e-12):
            sizing.made_share = lambda site, item, eats=None, share=share: share if site == beta else real(site, item, eats)
            with self.subTest(share=share):
                self.assertEqual(sizing.merges(alpha, BEER), [])


class SolverTests(unittest.TestCase):
    """_least_load_flow() and _max_flow() on their own."""

    def flow(self, draws, producers, routes, reach=None):
        return ba_dashboard._least_load_flow(draws, producers, routes, reach or {})

    def test_nothing_drawn_is_nothing_made(self):
        self.assertEqual(self.flow({"a": 0.0}, [("a", 720)], []), ([0.0], []))
        self.assertIsNone(self.flow({"a": 10.0}, [], []))

    def test_a_single_producer_makes_all_of_it(self):
        made, routed = self.flow({"a": 0.0, "b": 500.0}, [("a", 720)], [("a", "b", None, 1.0)])
        self.assertAlmostEqual(made[0], 500, places=6)
        self.assertAlmostEqual(routed[0], 500, places=6)

    def test_producers_share_by_capacity(self):
        made, _routed = self.flow({"a": 0.0, "b": 900.0}, [("a", 720), ("b", 1440)], [("a", "b", None, 1.0)])
        self.assertAlmostEqual(made[0], 300, places=6)
        self.assertAlmostEqual(made[1], 600, places=6)

    def test_a_route_cap_throttles_its_path(self):
        made, routed = self.flow({"a": 0.0, "b": 900.0}, [("a", 720), ("b", 720)], [("a", "b", 100.0, 1.0)])
        self.assertAlmostEqual(routed[0], 100, places=6)
        self.assertAlmostEqual(made[1], 800, places=6)

    def test_a_cap_breaks_only_where_nothing_else_can_bring_it(self):
        # The depot makes nothing and draws 500 past a cap of 100: the
        # rest passes the cap, as the draw must be met.
        made, routed = self.flow({"a": 0.0, "d": 500.0}, [("a", 720)], [("a", "d", 100.0, 1.0)])
        self.assertAlmostEqual(made[0], 500, places=6)
        self.assertAlmostEqual(routed[0], 500, places=6)

    def test_the_routes_into_a_site_share_its_reach(self):
        made, routed = self.flow({"a": 0.0, "b": 0.0, "c": 1500.0}, [("a", 720), ("b", 720), ("c", 720)],
                                 [("a", "c", None, 0.5), ("b", "c", None, 0.5)], {"c": 300.0})
        self.assertAlmostEqual(sum(routed), 300, places=6)
        self.assertAlmostEqual(made[2], 1200, places=6)
        self.assertAlmostEqual(made[0], made[1], places=6)

    def test_the_order_of_the_inputs_changes_nothing(self):
        draws = {"a": 0.0, "b": 300.0, "c": 900.0, "d": 1200.0}
        producers = [("a", 720), ("b", 1440), ("c", 720), ("d", 720), ("b", 200)]
        routes = [("a", "b", 2000 / 1.15, 0.5), ("a", "c", None, 0.4), ("b", "c", 400.0, 0.6),
                  ("b", "d", None, 0.5), ("c", "d", None, 0.5)]
        reach = {"c": 1500.0, "d": 1000.0}
        made, routed = self.flow(draws, producers, routes, reach)
        rng = random.Random(5)
        for _ in range(6):
            p, r = list(range(len(producers))), list(range(len(routes)))
            rng.shuffle(p)
            rng.shuffle(r)
            keys = list(draws)
            rng.shuffle(keys)
            made2, routed2 = self.flow({k: draws[k] for k in keys}, [producers[i] for i in p],
                                       [routes[i] for i in r], dict(reversed(list(reach.items()))))
            for k, i in enumerate(p):
                self.assertAlmostEqual(made2[k], made[i], places=7)
            for k, i in enumerate(r):
                self.assertAlmostEqual(routed2[k], routed[i], places=7)

    def test_max_flow(self):
        mf = ba_dashboard._max_flow
        self.assertEqual(mf({("s", "a"): 5, ("a", "t"): 3}, "s", "t"), 3)
        self.assertEqual(mf({("s", "a"): 5, ("a", "t"): 5, ("s", "b"): 2, ("b", "t"): 4}, "s", "t"), 7)
        # A shared first hop counts once, whichever way it goes on.
        self.assertEqual(mf({("s", "a"): 6, ("a", "b"): 4, ("a", "t"): 3, ("b", "t"): 10}, "s", "t"), 6)
        self.assertEqual(mf({("s", "a"): math.inf, ("a", "t"): math.inf}, "s", "t"), math.inf)
        self.assertEqual(mf({("s", "a"): 5}, "s", "t"), 0)


class FallbackTests(unittest.TestCase):
    """Where the solve gives no settled answer, every line is asked all it
    sends, as before #521, and stderr is told once."""

    def setUp(self):
        self.saved = ba_dashboard.LEAST_LOAD_STEPS, ba_dashboard._polished
        ba_dashboard._SAID_ONCE.clear()

    def tearDown(self):
        ba_dashboard.LEAST_LOAD_STEPS, ba_dashboard._polished = self.saved
        ba_dashboard._SAID_ONCE.clear()

    def assertOldFigures(self):
        said = io.StringIO()
        with contextlib.redirect_stderr(said):
            c = two_breweries(1000)
            again = two_breweries(1000)
        for x in (c, again):
            self.assertEqual(sold(x, F1, F2), (1000, 1000))
            for addr in (F1, F2):
                self.assertIs(line(x, addr).get("demandApproximate"), True)
                self.assertIsNone(line(x, addr)["production"])
            self.assertNotIn("chain", line(x, F2))
        self.assertEqual(said.getvalue().count("did not settle"), 1)

    def test_newton_that_does_not_settle(self):
        ba_dashboard.LEAST_LOAD_STEPS = 0
        self.assertOldFigures()

    def test_a_polish_that_does_not_settle(self):
        ba_dashboard._polished = lambda *a, **k: None
        self.assertOldFigures()

    def test_a_route_polish_that_does_not_settle_keeps_the_first(self):
        real = self.saved[1]
        ba_dashboard._polished = lambda *a: None if len(a) > 5 else real(*a)
        c = two_breweries(1000)
        self.assertEqual(sold(c, F1, F2), (500, 500))
        self.assertEqual(line(c, F2)["chain"]["makes"], 1440)


def shared_bar(sold_day, roles=(F1, F2, F3), outside_target=3000):
    """Astra's round-4 shape: Brewery 1 tops up Brewery 2 (at most 400 a
    day), and Brewery 2 shares a bar with Brewery 3, which is no part of
    the chain; one machine each, 720 a day. `roles` are the addresses of
    Breweries 1, 2 and 3."""
    one, two, three = roles
    c = Company()
    breweries(c, *roles)
    c.shop(SHOP_A, "Bar")
    c.hold(SHOP_A, BEER, 200, sold_day)
    c.plan(one, two, BEER, 400)
    c.plan(two, SHOP_A, BEER, 3000)
    c.plan(three, SHOP_A, BEER, outside_target)
    return c


def sizing_of(c, recipes=RECIPES):
    """The run's _DemandSizing, as the lines were sized on it."""
    made, real = [], ba_dashboard._DemandSizing

    class Spy(real):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            made.append(self)
    ba_dashboard._DemandSizing = Spy
    try:
        run_with(c, recipes)
    finally:
        ba_dashboard._DemandSizing = real
    return made[-1]


class SharedCustomerTests(unittest.TestCase):
    """A shop the chain tops up beside a sender of its own outside it: where
    that sender runs out of room, the shop draws the rest from the chain,
    and the chain is sized on that, never on the plans' shares fixed before
    the hold-down."""

    def test_the_chain_takes_what_the_other_sender_has_no_room_for(self):
        # Before, the chain was sized on half the bar (750 at 1,500) while
        # the hold-down asked it for 874: the lines read 348 / 468 / 626,
        # 1,442 of 1,500 sold, every one covered, and the bar got 1,659 of
        # the 1,725 it needs.
        for sold_day, figures, needs in ((1400, (348, 426, 626), (400, 490, 720)),
                                         (1500, (348, 526, 626), (400, 605, 720)),
                                         (1600, (348, 626, 626), (400, 720, 720))):
            with self.subTest(sold=sold_day):
                c = shared_bar(sold_day)
                walk = dem_walk(c)
                self.assertEqual(sold(c, F1, F2, F3), figures)
                self.assertEqual(sum(figures), sold_day)
                self.assertEqual(tuple(line(c, a)["needDay"] for a in (F1, F2, F3)), needs)
                self.assertEqual([level(c, a) for a in (F1, F2, F3)], ["ok"] * 3)
                self.assertLessEqual(short_of_its_need(walk, SHOP_A, sold_day), 1e-6)

    def test_past_what_they_can_bring_the_bar_reads_short_on_both_senders(self):
        # 1,700 a day with the margin is 1,955; Brewery 1's route brings
        # 400 and the two lines 720 each, 1,840 in all.
        c = shared_bar(1700)
        walk = dem_walk(c)
        self.assertEqual(sold(c, F1, F2, F3), (348, 676, 676))
        self.assertEqual([level(c, a) for a in (F1, F2, F3)], ["ok", "warn", "warn"])
        node = walk[(site_key(SHOP_A), BEER)]
        self.assertAlmostEqual(node["own"] + node["credit"], 1840, delta=1e-3)

    def test_the_shared_bar_reads_the_same_whatever_the_addresses(self):
        seen = set()
        for roles in itertools.permutations((("a", 1), ("b", 1), ("c", 1))):
            c = shared_bar(1500, roles)
            walk = dem_walk(c)
            node = walk[(site_key(SHOP_A), BEER)]
            # The walk settles to about a part in 10^6.
            seen.add((tuple((line(c, a)["soldDay"], line(c, a)["needDay"], level(c, a)) for a in roles),
                      round(node["own"] + node["credit"], 1)))
        self.assertEqual(seen, {(((348, 400, "ok"), (526, 605, "ok"), (626, 720, "ok")), 1725.0)})


class GuardTests(unittest.TestCase):
    """Rules no other shape reaches the edge of."""

    def test_a_route_into_a_site_with_lines_keeps_its_target_in_every_mode(self):
        # Brewery 3 has room at the bar, so the hold-down asks Brewery 2 for
        # less than the plans' shares (974, not 1,050). Read before any
        # holding down, as levels() reads it, Brewery 2's routed part would
        # be 375 a day, past the 400 target less the margin.
        c = shared_bar(1400, outside_target=1000)
        sizing = sizing_of(c)
        one, two = site_key(F1), site_key(F2)
        self.assertAlmostEqual(sizing.demand(two, BEER, held_down=False)[0], 1050)
        unheld = sizing.demand(two, BEER, held_down=False)[0] * sizing.routed_share(two, BEER)
        self.assertGreater(unheld, 400 / (1 + SUPPLY_MARGIN) + 20)
        for held_down in (True, False):
            with self.subTest(held_down=held_down):
                self.assertAlmostEqual(sizing.demand(one, BEER, held_down=held_down)[0], 400 / (1 + SUPPLY_MARGIN))

    def test_the_split_follows_no_last_place_of_the_solve(self):
        # The solve's outputs carry noise in their last places that follows
        # the order the sites sort in; rounded to a billionth, it moves no
        # share, even on a chain selling 2.7 a day.
        real = ba_dashboard._least_load_flow
        shares = set()
        for sign in (1, -1):
            def noisy(*args):
                made, routed = real(*args)
                return [f + sign * 3e-10 * (-1) ** i for i, f in enumerate(made)], routed
            ba_dashboard._least_load_flow = noisy
            try:
                c = Company()
                breweries(c, F1, F2)
                c.shop(SHOP_A, "Bar")
                c.hold(SHOP_A, BEER, 200, 2.7)
                c.plan(F1, F2, BEER, 2000)
                c.plan(F2, SHOP_A, BEER, 2000)
                shares.add(sizing_of(c).made_share(site_key(F2), BEER))
            finally:
                ba_dashboard._least_load_flow = real
        self.assertEqual(shares, {0.5})

    def test_shares_a_ten_thousandth_apart_keep_their_own_rounding(self):
        together = ba_dashboard._rounded_together
        self.assertIsNone(together([466.66667, 466.66666, 466.66665]))
        self.assertEqual(together([466.6668, 466.6668, 466.6664]), [467, 467, 466])
        self.assertEqual(together([347.8, 526.1, 626.1]), [348, 526, 626])
        self.assertEqual(together([0.54, 2.16]), [1, 2])


def named_fork(west, east):
    """fork(700, 700) with Breweries 2 and 3 named `west` and `east`."""
    c = fork(700, 700)
    for site in c.sites:
        site["name"] = {F2: west, F3: east}.get(site["addr"], site["name"])
    return c


class TipTieTests(unittest.TestCase):
    """Where two links of a chain have the same room, or a link has several
    senders, the tip goes by the business names, never the addresses."""

    def test_two_links_with_the_same_room_name_the_first_by_name(self):
        for west, east, named in (("Zeta Brewery", "Alpha Brewery", F3),
                                  ("Alpha Brewery", "Zeta Brewery", F2)):
            with self.subTest(west=west):
                c = run_with(named_fork(west, east), RECIPES)
                self.assertEqual(line(c, F1)["chain"]["at"], c.index(named))

    def test_the_senders_are_listed_by_name(self):
        for first, second in (("Alpha Brewery", "Zeta Brewery"), ("Zeta Brewery", "Alpha Brewery")):
            with self.subTest(first=first):
                c = Company()
                c.factory(F1, first)
                c.factory(F2, second)
                c.factory(F3, "Meeting Brewery")
                for f in (F1, F2, F3):
                    c.hold(f, WATER, 500)
                    c.hold(f, BEER, 300)
                c.shop(SHOP_A, "Beer Bar")
                c.hold(SHOP_A, BEER, 200, 1500)
                c.plan(F1, F3, BEER, 2000)
                c.plan(F2, F3, BEER, 2000)
                c.plan(F3, SHOP_A, BEER, 3000)
                run_with(c, RECIPES)
                by_name = sorted((F1, F2), key=lambda a: first if a == F1 else second)
                self.assertEqual(line(c, F3)["chain"]["from"], [c.index(a) for a in by_name])


    def test_a_name_in_lower_case_sorts_as_a_player_reads_it(self):
        for west, east, named in (("alpha Brewery", "Zeta Brewery", F2),
                                  ("Zeta Brewery", "alpha Brewery", F3)):
            with self.subTest(west=west):
                c = run_with(named_fork(west, east), RECIPES)
                self.assertEqual(line(c, F1)["chain"]["at"], c.index(named))


def quietly(c, recipes=RECIPES):
    """dem_walk(c), and what stderr was told on the way."""
    ba_dashboard._SAID_ONCE.clear()
    err = io.StringIO()
    with contextlib.redirect_stderr(err):
        walk = dem_walk(c, recipes)
    return walk, err.getvalue()


def brought(walk, shop, item=BEER):
    """What the Demand walk brings a shop a day, unrounded, and its need
    with the margin."""
    node = walk[(site_key(shop), item)]
    return node["own"] + node["credit"], node["need"]


def alpha_beta(alpha, beta):
    """Grok's round-5 repro: Alpha tops up Beta (3,000) and a bar (1,000),
    Beta tops up the same bar (3,000), and the bar sells 1,500; one machine
    each, 720 a day."""
    c = Company()
    c.factory(alpha, "Alpha")
    c.factory(beta, "Beta")
    for a in (alpha, beta):
        c.hold(a, WATER, 500)
        c.hold(a, BEER, 300)
    c.shop(SHOP_A, "Bar")
    c.hold(SHOP_A, BEER, 200, 1500)
    c.plan(alpha, beta, BEER, 3000)
    c.plan(alpha, SHOP_A, BEER, 1000)
    c.plan(beta, SHOP_A, BEER, 3000)
    return c


def two_bars(roles=(F1, F2, F3)):
    """Five breweries, three of them in use (`roles`, Breweries 1 to 3),
    and two bars selling 1,500 and 1,200: a shape found by search that read
    Grok's round-5 figures (880 / 892 / 928, all critical) before the fixed
    point. It is not Grok's own graph, which is grok_five_breweries()."""
    one, two, three = roles
    c = Company()
    for i, a in enumerate(roles + tuple(a for a in (F1, F2, F3, F4, F5) if a not in roles)):
        c.factory(a, f"Brewery {i + 1}")
        c.hold(a, WATER, 900)
        c.hold(a, BEER, 300)
    for shop, sold_day in ((SHOP_A, 1500), (SHOP_B, 1200)):
        c.shop(shop, shop[0])
        c.hold(shop, BEER, 200, sold_day)
    for src, dest, target in ((one, SHOP_A, 1000), (one, SHOP_B, 6000), (one, two, 3000), (one, three, 300),
                              (two, SHOP_A, 1000), (two, SHOP_B, 6000), (two, three, 1000),
                              (three, SHOP_A, 6000), (three, SHOP_B, 3000)):
        c.plan(src, dest, BEER, target)
    return c


def shared_two_bars(roles=(F1, F2, F3)):
    """Astra's round-5 repro: Brewery 1 tops up Brewery 2 (400), Brewery 2
    tops up Brewery 3 (2,000), Brewery 3 tops up bar A (1,400 a day), and
    all three top up bar B (750 a day)."""
    one, two, three = roles
    c = Company()
    breweries(c, *roles)
    for shop, sold_day in ((SHOP_A, 1400), (SHOP_B, 750)):
        c.shop(shop, shop[0])
        c.hold(shop, BEER, 200, sold_day)
    for src, dest, target in ((one, two, 400), (two, three, 2000), (one, SHOP_B, 6000), (two, SHOP_B, 1000),
                              (three, SHOP_B, 1000), (three, SHOP_A, 3000)):
        c.plan(src, dest, BEER, target)
    return c


def depot_past_the_chain(roles=(F1, F2, F3)):
    """Astra's round-5 repro: Brewery 1 tops up Brewery 2 (2,000) and a depot
    (4,000), the depot and Breweries 2 and 3 top up bar A (1,400 a day),
    and Breweries 1 and 3 bar B (450 a day)."""
    one, two, three = roles
    c = Company()
    breweries(c, *roles)
    c.site(DEPOT, "Depot")
    c.hold(DEPOT, BEER, 300)
    for shop, sold_day in ((SHOP_A, 1400), (SHOP_B, 450)):
        c.shop(shop, shop[0])
        c.hold(shop, BEER, 200, sold_day)
    for src, dest, target in ((one, two, 2000), (two, SHOP_A, 6000), (three, SHOP_A, 6000), (one, SHOP_B, 3000),
                              (three, SHOP_B, 6000), (one, DEPOT, 4000), (DEPOT, SHOP_A, 1000)):
        c.plan(src, dest, BEER, target)
    return c


def second_chain_at_a_depots_shop():
    """Opus's round-5 repro A: Brewery 1 tops up Brewery 2 (300), Brewery 2
    a depot (3,000), and the depot Shop A (sells 1,350) and Shop B (900); a
    second chain, Brewery 3 topping up Brewery 4 (2,000), also tops up Shop
    A (1,000)."""
    c = Company()
    breweries(c, F1, F2, F3, F4)
    c.site(DEPOT, "Depot")
    c.hold(DEPOT, BEER, 300)
    c.shop(SHOP_A, "A")
    c.hold(SHOP_A, BEER, 200, 1350)
    c.shop(SHOP_B, "B")
    c.hold(SHOP_B, BEER, 200, 900)
    for src, dest, target in ((F1, F2, 300), (F2, DEPOT, 3000), (DEPOT, SHOP_A, 4000), (DEPOT, SHOP_B, 1000),
                              (F3, F4, 2000), (F4, SHOP_A, 1000)):
        c.plan(src, dest, BEER, target)
    return c


def depot_and_shop(depot=("dee_road", 12)):
    """Opus's round-5 repro C: Brewery 1 (two machines) tops up Brewery 2
    (2,000), Brewery 2 a depot and Shop B, Brewery 3 the depot, and the depot
    Shop A (1,600 a day) and Shop B (800)."""
    c = Company()
    c.factory(F1, "Brewery 1", machines=2)
    c.factory(F2, "Brewery 2")
    c.factory(F3, "Brewery 3")
    for a in (F1, F2, F3):
        c.hold(a, WATER, 900)
        c.hold(a, BEER, 300)
    c.site(depot, "Depot")
    c.hold(depot, BEER, 300)
    for shop, sold_day in ((SHOP_A, 1600), (SHOP_B, 800)):
        c.shop(shop, shop[0])
        c.hold(shop, BEER, 200, sold_day)
    for src, dest, target in ((F1, F2, 2000), (F2, depot, 3000), (depot, SHOP_A, 4000), (F3, depot, 3000),
                              (depot, SHOP_B, 3000), (F2, SHOP_B, 3000)):
        c.plan(src, dest, BEER, target)
    return c


def drifting_pair():
    """Two chains at a shared shop whose draws drift by the same step each
    pass until a share binds (127 plain passes): Brewery 1 tops up Brewery 2
    (600), Brewery 2 tops up Shop A (1,900 a day) and Shop B (1,250),
    Brewery 3 tops up Brewery 4 (2,000) and Shop B (1,000), and Brewery 4
    tops up Shop B (3,000)."""
    c = Company()
    breweries(c, F1, F2, F3, F4)
    for shop, sold_day in ((SHOP_A, 1900), (SHOP_B, 1250)):
        c.shop(shop, shop[0])
        c.hold(shop, BEER, 200, sold_day)
    for src, dest, target in ((F1, F2, 600), (F2, SHOP_A, 3000), (F2, SHOP_B, 3000), (F3, SHOP_B, 1000),
                              (F3, F4, 2000), (F4, SHOP_B, 3000)):
        c.plan(src, dest, BEER, target)
    return c


def padded_drifting_pair(depots):
    """Astra's round-7 boundary repro: neutral depots on F3's route to F4."""
    c = drifting_pair()
    c.targets.remove((F3, F4, BEER, 2000))
    prev = F3
    for i in range(depots):
        addr = ("padding", i)
        c.site(addr, f"Depot {i}")
        c.hold(addr, BEER, 300)
        c.plan(prev, addr, BEER, 2000)
        prev = addr
    c.plan(prev, F4, BEER, 2000)
    return c


def dense_five_breweries():
    """Astra's round-7 minimal.json: F0 shares customers with the solved chain."""
    c = Company()
    factories = [("dense_brew", i) for i in range(5)]
    shops = [("dense_bar", i) for i in range(3)]
    for i, (addr, machines) in enumerate(zip(factories, (1, 3, 9, 1, 3))):
        c.factory(addr, f"Brewery F{i}", machines=machines)
        c.hold(addr, WATER, 900)
        c.hold(addr, BEER, 300)
    for i, (addr, sales) in enumerate(zip(shops, (3600, 1000, 2400))):
        c.shop(addr, f"Bar S{i}")
        c.hold(addr, BEER, 200, sales)
    for src, dest, target in ((1, 4, 2000), (2, 4, 600), (3, 4, 600)):
        c.plan(factories[src], factories[dest], BEER, target)
    for src, dest, target in ((0, 1, 18000), (0, 2, 6000), (1, 2, 9000), (2, 0, 6000),
                              (2, 1, 3000), (3, 0, 6000), (4, 0, 18000), (4, 2, 1000)):
        c.plan(factories[src], shops[dest], BEER, target)
    return c, factories


class UnsettledDemandTests(unittest.TestCase):
    def test_goods_flow_keeps_approximation_on_ingredient_need(self):
        c = two_breweries(1000)
        for addr in (F1, F2):
            c.contract(addr, WATER, 100)
        run_with(c, RECIPES)
        def water(addr):
            node = next(n for n in c.supply["graph"]["nodes"] if n["id"] == site_key(addr))
            item = next(i for i in node["items"] if i["slug"] == WATER)
            return {**item, **item.get("dem", {})}
        for addr in (F1, F2):
            self.assertEqual(water(addr)["need"], 584)
            self.assertFalse(water(addr).get("demandApproximate"))
        with patch.object(ba_dashboard, "LEAST_LOAD_STEPS", 0):
            quietly(c)
        for addr in (F1, F2):
            self.assertEqual(water(addr)["need"], 840)
            self.assertTrue(water(addr).get("demandApproximate"))

    def test_unrelated_null_target_does_not_break_unsettled_propagation(self):
        c = two_breweries(1000)
        source, dest = ("unrelated", 1), ("unrelated", 2)
        c.site(source, "Unrelated depot")
        c.site(dest, "Unrelated recipient")
        c.hold(source, WATER, 100)
        c.hold(dest, WATER, 100)
        c.plan(source, dest, WATER, None)
        with patch.object(ba_dashboard, "LEAST_LOAD_STEPS", 0):
            quietly(c)
        self.assertApproximate(c, (F1, F2))
        self.assertFalse(c.fact(dest, WATER, "dem").get("demandApproximate"))

    def test_inner_fallback_keeps_estimates_but_withholds_hours_inputs_and_staffing(self):
        from tests.test_factory_staffing import People, factory_rows

        settled = two_breweries(1000)
        with patch.object(ba_dashboard, "LEAST_LOAD_STEPS", 0):
            with contextlib.redirect_stderr(io.StringIO()):
                fallback = two_breweries(1000)
        for addr in (F1, F2):
            self.assertEqual(line(settled, addr)["needHours"]["dem"], 20)
            self.assertEqual(settled.fact(addr, WATER)["dem"]["use"], 167)
            row = line(fallback, addr)
            self.assertEqual(row["needHours"]["dem"], 24)
            self.assertIsNone(row["dem"]["status"])
            self.assertNotIn("lower", row["dem"])
            fact = ba_dashboard._supply_fact(fallback.supply["facts"], fallback.index(addr), WATER, "dem")
            self.assertEqual(fact["use"], 240)
            self.assertTrue(fact["demandApproximate"])
            self.assertEqual((fact["st"], fact["why"], fact["setTo"]),
                             ("new", "demandApproximate", None))
        # Demand staffing must not write a partial factory week or count its
        # other workers as spare. Full-production planning is independent.
        plans = factory_rows(fallback, People())
        self.assertTrue(all(r.get("unavailable") == "demandApproximate" for r in plans["dem"]))
        self.assertTrue(all(not r.get("failed") for r in plans["cap"]))
        # A real short schedule must not become a demand staffing finding.
        for site in fallback.supply["factories"]["sites"]:
            site["lines"][0]["gaps"] = [{"slot": 1, "hours": 140, "off": "Sunday"}]
        self.assertEqual(ba_dashboard._staff_notes(fallback.business_list,
                         fallback.supply["factories"], set(), "dem"), [])
        self.assertEqual(len(ba_dashboard._staff_notes(fallback.business_list,
                             fallback.supply["factories"], set(), "cap")), 2)
        self.assertEqual(ba_dashboard._feed_notes(fallback.business_list,
                         fallback.supply["factories"], set(), "dem"), [])

    def test_unsettled_inputs_withhold_upstream_topup_and_import_advice(self):
        c = two_breweries(1000)
        c.site(DEPOT, "Water depot")
        c.hold(DEPOT, WATER, 100)
        c.contract(DEPOT, WATER, 100)
        for addr in (F1, F2):
            c.plan(DEPOT, addr, WATER, 100)
        with patch.object(ba_dashboard, "LEAST_LOAD_STEPS", 0):
            with contextlib.redirect_stderr(io.StringIO()):
                run_with(c, RECIPES)
        for addr in (F1, F2, DEPOT):
            fact = ba_dashboard._supply_fact(c.supply["facts"], c.index(addr), WATER, "dem")
            self.assertTrue(fact["demandApproximate"])
            self.assertEqual((fact["st"], fact["setTo"], fact.get("lower")), ("new", None, None))
            self.assertNotEqual(c.fact(addr, WATER)["st"], "new")
        self.assertEqual(ba_dashboard._import_notes(c.business_list, c.supply, set(), "dem"), [])

    def test_recipe_ingredient_selling_only_to_its_own_shop_stays_settled(self):
        c, _addrs = dense_five_breweries()
        maltings, shop = ("maltings", 1), ("malt_shop", 1)
        c.factory(maltings, "Maltings", rid=MALT_RID)
        c.hold(maltings, MALT, 500)
        c.shop(shop, "Malt shop")
        c.hold(shop, MALT, 100, 100)
        c.plan(maltings, shop, MALT, 3000)
        quietly(c, MALT_RECIPES)
        row = line(c, maltings, MALT)
        self.assertEqual((row["soldDay"], row["needDay"]), (100, 115))
        self.assertFalse(row.get("demandApproximate"))
        self.assertEqual(row["production"], {"status": "covered", "level": "ok"})

    def test_two_actual_ingredient_stages_preserve_unrelated_machine_shortage(self):
        extra = list(dict((item, rid) for rid, item in sorted(RECIPE_ITEMS.items())
                          if item not in {BEER, MALT, WATER}).items())
        (grain, grain_rid), (other, other_rid) = extra[:2]
        for same_site in (False, True):
            with self.subTest(same_site=same_site):
                c, addrs = dense_five_breweries()
                maltings, mill, depot = ("maltings", 1), ("mill", 1), ("malt_depot", 1)
                c.factory(maltings, "Maltings", rid=MALT_RID)
                c.hold(maltings, MALT, 500)
                c.hold(maltings, grain, 300)
                c.factory(mill, "Mill", rid=grain_rid)
                c.hold(mill, grain, 500)
                c.plan(mill, maltings, grain, 18000)
                c.site(depot, "Malt depot")
                c.plan(maltings, depot, MALT, 18000)
                for addr in addrs:
                    c.hold(addr, MALT, 300)
                    c.plan(depot, addr, MALT, 18000)
                unrelated = addrs[0] if same_site else ("unrelated", 1)
                if same_site:
                    c.sites[0]["machines"].append(other_rid)
                else:
                    c.factory(unrelated, "Unrelated", rid=other_rid)
                c.hold(unrelated, other, 500)
                shop = ("other_shop", 1)
                c.shop(shop, "Other shop")
                c.hold(shop, other, 100, 2000)
                c.plan(unrelated, shop, other, 18000)
                recipes = {**MALT_RECIPES,
                           MALT: {**MALT_RECIPES[MALT], "ingredients": [{"slug": grain, "item": "Grain", "per": 10}]},
                           grain: {"slug": grain, "item": "Grain", "out": 30, "workstation": "bottledgoods", "ingredients": []},
                           other: {"slug": other, "item": "Other", "out": 30, "workstation": "bottledgoods", "ingredients": []}}
                quietly(c, recipes)
                for addr, slug in [(a, BEER) for a in addrs] + [(maltings, MALT), (mill, grain)]:
                    self.assertTrue(line(c, addr, slug).get("demandApproximate"))
                    self.assertIsNone(line(c, addr, slug)["production"])
                row = line(c, unrelated, other)
                self.assertFalse(row.get("demandApproximate"))
                self.assertEqual((row["production"]["level"], row["production"]["more"]), ("critical", 3))

    def assertApproximate(self, c, addrs):
        for addr in addrs:
            with self.subTest(addr=addr):
                row = line(c, addr)
                self.assertIs(row.get("demandApproximate"), True)
                self.assertIsNone(row["production"], "an unverified split must not advise buying machines")
                self.assertIsInstance(row["soldDay"], int)
                self.assertIsInstance(row["needDay"], int)

    def test_dense_capped_split_withholds_advice_even_outside_the_chain(self):
        c, addrs = dense_five_breweries()
        _walk, err = quietly(c)
        self.assertIn("did not settle in 300 passes", err)
        self.assertApproximate(c, addrs)
        self.assertEqual(sold(c, *addrs), (628, 1881, 1986, 626, 1879))
        # The once-only stderr warning must not suppress the payload flag
        # on a later save refresh with the same unsettled shape.
        again, addrs = dense_five_breweries()
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            run_with(again, RECIPES)
        self.assertEqual(err.getvalue(), "")
        self.assertApproximate(again, addrs)

    def test_dense_settled_split_is_covered_and_no_longer_approximate(self):
        with patch.object(ba_dashboard, "CHAIN_DRAW_PASSES", 3000):
            c, addrs = dense_five_breweries()
            _walk, err = quietly(c)
        self.assertEqual(err, "")
        self.assertEqual(sold(c, *addrs), (626, 1878, 1992, 626, 1878))
        self.assertEqual(tuple(line(c, a)["needDay"] for a in addrs), (720, 2160, 2290, 720, 2160))
        self.assertEqual([level(c, a) for a in addrs], ["ok"] * 5)
        self.assertTrue(all(not line(c, a).get("demandApproximate") for a in addrs))

    def test_neutral_depots_preserve_the_split_at_the_large_site_boundary(self):
        self.assertEqual(ba_dashboard.ROUTE_POLISH_SITES, 30)
        for sites in (30, 31, 32):
            with self.subTest(sites=sites):
                c = padded_drifting_pair(sites - 4)
                _walk, err = quietly(c)
                self.assertEqual(err, "")
                self.assertEqual(sold(c, F3, F4), (625, 625))
                self.assertEqual(tuple(line(c, a)["needDay"] for a in (F3, F4)), (719, 719))
                self.assertEqual(tuple((line(c, a)["chain"]["makes"], line(c, a)["chain"]["need"])
                                       for a in (F3, F4)), ((1080, 1078),) * 2)
                self.assertTrue(all(not line(c, a).get("demandApproximate") for a in (F1, F2, F3, F4)))

    def test_exhausting_only_the_large_cap_marks_the_result_approximate(self):
        with patch.object(ba_dashboard, "CHAIN_DRAW_PASSES_LARGE", 50):
            for sites in (31, 32):
                with self.subTest(sites=sites):
                    c = padded_drifting_pair(sites - 4)
                    _walk, err = quietly(c)
                    self.assertIn(f"chain of {sites} sites", err)
                    self.assertIn("did not settle in 50 passes", err)
                    self.assertEqual(sold(c, F3, F4), (624, 626))
                    self.assertApproximate(c, (F1, F2, F3, F4))

    def test_a_new_sizing_clears_the_previous_unsettled_flag(self):
        c, _addrs = dense_five_breweries()
        with contextlib.redirect_stderr(io.StringIO()):
            sizing = sizing_of(c)
        self.assertTrue(sizing.unsettled)
        sizing.set_made(lambda *_: False)
        self.assertFalse(sizing.unsettled)

    def test_uncertainty_reaches_ingredients_but_not_unrelated_products(self):
        for ingredient in (False, True):
            with self.subTest(ingredient=ingredient):
                c, addrs = dense_five_breweries()
                maltings = ("maltings", 1)
                c.factory(maltings, "Maltings", rid=MALT_RID)
                c.hold(maltings, MALT, 500)
                if ingredient:
                    for addr in addrs:
                        c.hold(addr, MALT, 300)
                        c.plan(maltings, addr, MALT, 18000)
                    recipes = MALT_RECIPES
                else:
                    c.shop(SHOP_A, "Malt customer")
                    c.hold(SHOP_A, MALT, 200, 100)
                    c.plan(maltings, SHOP_A, MALT, 3000)
                    recipes = {**RECIPES, MALT: MALT_RECIPES[MALT]}
                _walk, err = quietly(c, recipes)
                self.assertIn("did not settle", err)
                row = line(c, maltings, MALT)
                self.assertEqual(bool(row.get("demandApproximate")), ingredient)
                self.assertEqual(row["production"] is None, ingredient)


def grok_five_breweries(roles=(F1, F2, F3, F4, F5)):
    """Grok's round-5 graph: five breweries (`roles`, Breweries 0 to 4),
    one machine each, and two bars selling 1,500 and 1,200. Brewery 0 tops
    up Breweries 1 (900), 2 (3,000) and 4 (900) and bar A (2,000); Brewery 2
    tops up Brewery 3 (3,000), Brewery 4 (80) and bar B (4,000); Brewery 3
    tops up Brewery 4 (900), bar A (1,000) and bar B (3,000)."""
    f = roles
    c = Company()
    for i, a in enumerate(roles):
        c.factory(a, f"Brewery {i}")
        c.hold(a, WATER, 900)
        c.hold(a, BEER, 300)
    for shop, sold_day in ((SHOP_A, 1500), (SHOP_B, 1200)):
        c.shop(shop, shop[0])
        c.hold(shop, BEER, 200, sold_day)
    for src, dest, target in ((f[0], f[1], 900), (f[0], f[2], 3000), (f[0], f[4], 900), (f[2], f[3], 3000),
                              (f[2], f[4], 80), (f[3], f[4], 900), (f[3], SHOP_A, 1000), (f[0], SHOP_A, 2000),
                              (f[3], SHOP_B, 3000), (f[2], SHOP_B, 4000)):
        c.plan(src, dest, BEER, target)
    return c


SEVEN = tuple(("brew_lane", i + 1) for i in range(7))
BARS = tuple(("bar_row", i + 1) for i in range(3))


def seven_breweries():
    """Astra's round-6 company: Breweries 0 to 6 with 3 / 3 / 3 / 3 / 9 / 9
    / 6 machines, and bars A, B and C selling 1,500, 6,000 and 4,800 a day.
    Brewery 0 tops up Breweries 1 (2,100) and 2 (12,000), Breweries 1 and 2
    top up Brewery 3 (12,000 each), Brewery 3 tops up Brewery 5 (6,000),
    and every brewery tops up some of the bars."""
    f, (bar_a, bar_b, bar_c) = SEVEN, BARS
    c = Company()
    for i, (a, machines) in enumerate(zip(f, (3, 3, 3, 3, 9, 9, 6))):
        c.factory(a, f"Brewery {i}", machines=machines)
        c.hold(a, WATER, 900)
        c.hold(a, BEER, 300)
    for shop, name, sold_day in ((bar_a, "A", 1500), (bar_b, "B", 6000), (bar_c, "C", 4800)):
        c.shop(shop, name)
        c.hold(shop, BEER, 200, sold_day)
    for src, dest, target in ((f[0], f[1], 2100), (f[0], f[2], 12000), (f[0], bar_b, 3000), (f[0], bar_c, 18000),
                              (f[1], f[3], 12000), (f[1], bar_b, 3000), (f[2], f[3], 12000), (f[2], bar_c, 18000),
                              (f[3], f[5], 6000), (f[3], bar_b, 9000), (f[3], bar_c, 9000), (f[4], bar_b, 3000),
                              (f[5], bar_c, 3000), (f[6], bar_a, 9000), (f[6], bar_b, 18000), (f[6], bar_c, 18000)):
        c.plan(src, dest, BEER, target)
    return c


def four_breweries(roles=(F1, F2, F3, F4)):
    """Astra's round-6 company with two stable fixed points: Breweries 1 to 4
    with 3 / 3 / 2 / 6 machines; Brewery 1 tops up Breweries 2 (6,000) and
    3 (900); Breweries 1, 2 and 3 top up bar A (5,100 a day, 9,000 each);
    Breweries 1 and 4 top up bar B (1,500 a day, 3,000 each)."""
    one, two, three, four = roles
    c = Company()
    for i, (a, machines) in enumerate(zip(roles, (3, 3, 2, 6))):
        c.factory(a, f"Brewery {i + 1}", machines=machines)
        c.hold(a, WATER, 900)
        c.hold(a, BEER, 300)
    for shop, sold_day in ((SHOP_A, 5100), (SHOP_B, 1500)):
        c.shop(shop, shop[0])
        c.hold(shop, BEER, 200, sold_day)
    for src, dest, target in ((one, two, 6000), (one, three, 900), (one, SHOP_A, 9000), (two, SHOP_A, 9000),
                              (three, SHOP_A, 9000), (one, SHOP_B, 3000), (four, SHOP_B, 3000)):
        c.plan(src, dest, BEER, target)
    return c


class FixedPointTests(unittest.TestCase):
    """The chain is solved again on its own hold-down's draws until the
    draws it asks are the ones it was solved on, the lines read the solve's
    outputs, and nothing moved since the last pass: never just because the
    producers' outputs held, and each pass reads the sites past the chain
    on its own split."""

    def test_alpha_and_beta_share_the_bar_evenly_whatever_the_addresses(self):
        # Before, the outputs held at 750 / 750 while the draws still moved
        # (251 against 1,249 at the stop, 62 against 1,438 settled), and the
        # lines read 713 warn / 787 critical.
        seen = set()
        for alpha, beta in itertools.permutations((F1, F2, F3, F4), 2):
            c = alpha_beta(alpha, beta)
            walk, err = quietly(c)
            self.assertEqual(err, "")
            got, wanted = brought(walk, SHOP_A)
            seen.add((tuple((line(c, a)["soldDay"], line(c, a)["needDay"], level(c, a)) for a in (alpha, beta)),
                      round(got, 3), round(wanted, 3)))
        # 1,500 a day is past what two lines make (1,440), so both are
        # critical and the bar gets all they make, short of its 1,725.
        self.assertEqual(seen, {(((750, 862, "critical"), (750, 862, "critical")), 1440.0, 1725.0)})

    def test_three_breweries_at_two_bars_load_the_same(self):
        # Before: 880 / 892 / 928.
        for roles in itertools.permutations((F1, F2, F3)):
            with self.subTest(roles=roles):
                c = two_bars(roles)
                walk, err = quietly(c)
                self.assertEqual(err, "")
                self.assertEqual(sold(c, *roles), (900, 900, 900))
                self.assertEqual([level(c, a) for a in roles], ["critical"] * 3)
                (a_got, a_need), (b_got, b_need) = brought(walk, SHOP_A), brought(walk, SHOP_B)
                self.assertAlmostEqual(a_got + b_got, 3 * 720, delta=1e-3)
                self.assertLess(a_got, a_need)
                self.assertLess(b_got, b_need)

    def test_two_bars_short_only_by_the_margin_warn(self):
        # Before, the stop took the outputs holding (716.7 each) while the
        # draws moved: 725 / 710 / 715 with Brewery 1 critical, and bar B
        # got 745.6 of the 750 it sells.
        for roles in itertools.permutations((F1, F2, F3)):
            with self.subTest(roles=roles):
                c = shared_two_bars(roles)
                walk, err = quietly(c)
                self.assertEqual(err, "")
                self.assertEqual(sold(c, *roles), (719, 715, 715))
                self.assertEqual(tuple(line(c, a)["needDay"] for a in roles), (827, 823, 823))
                self.assertEqual([level(c, a) for a in roles], ["warn"] * 3)
                (a_got, a_need), (b_got, b_need) = brought(walk, SHOP_A), brought(walk, SHOP_B)
                self.assertAlmostEqual(b_got, 751.17, delta=0.01)
                self.assertAlmostEqual(a_got + b_got, 3 * 720, delta=1e-3)
                self.assertGreaterEqual(a_got, 1400)
                self.assertGreaterEqual(b_got, 750)
                self.assertLess(a_got, a_need)
                self.assertLess(b_got, b_need)

    def test_a_depot_past_the_chain_is_read_on_each_passs_split(self):
        # Before, the depot's draw was read on the first pass's split for
        # good: 605 / 619, and the chain's lines made 1,223.9 split by stale
        # ratios.
        for roles in itertools.permutations((F1, F2, F3)):
            with self.subTest(roles=roles):
                c = depot_past_the_chain(roles)
                walk, err = quietly(c)
                self.assertEqual(err, "")
                self.assertEqual(sold(c, *roles), (612, 612, 626))
                self.assertEqual(tuple(line(c, a)["needDay"] for a in roles), (704, 704, 720))
                self.assertEqual([level(c, a) for a in roles], ["ok"] * 3)
                for shop, sold_day in ((SHOP_A, 1400), (SHOP_B, 450)):
                    self.assertLessEqual(short_of_its_need(walk, shop, sold_day), 1e-6)
        sizing = sizing_of(depot_past_the_chain())
        loads = [sizing.demand(site_key(a), BEER)[0] * sizing.made_share(site_key(a), BEER) for a in (F1, F2)]
        self.assertAlmostEqual(loads[0], loads[1], delta=1e-6)
        self.assertAlmostEqual(sum(loads), 1223.913043, delta=1e-5)

    def test_a_feeder_is_asked_what_its_route_brings(self):
        # Before, Brewery 1 was asked 186 though its route brings 261 (300
        # less the margin), Brewery 2 read critical, and Shop B got 859.3.
        c = second_chain_at_a_depots_shop()
        walk, err = quietly(c)
        self.assertEqual(err, "")
        self.assertEqual(sold(c, F1, F2, F3, F4), (261, 717, 636, 636))
        self.assertEqual(line(c, F1)["needDay"], 300)
        self.assertEqual([level(c, a) for a in (F1, F2, F3, F4)], ["ok", "warn", "warn", "warn"])
        (a_got, a_need), (b_got, b_need) = brought(walk, SHOP_A), brought(walk, SHOP_B)
        self.assertAlmostEqual(a_got, 1081.6, delta=0.01)
        self.assertAlmostEqual(b_got, 938.4, delta=0.01)
        self.assertGreaterEqual(b_got, 900)
        self.assertLess(b_got, b_need)
        self.assertLess(a_got, a_need)

    def test_the_answer_follows_no_parity_of_the_pass_cap(self):
        # Before, the draw swung between two values for all 50 passes, and
        # the board showed whichever the cap's parity left: at 50, a false
        # warning on Brewery 3 and both shops short.
        real = ba_dashboard.CHAIN_DRAW_PASSES
        for shape, passes in ((depot_and_shop, (20, 21)), (drifting_pair, (150, 151))):
            seen = set()
            for cap in passes:
                ba_dashboard.CHAIN_DRAW_PASSES = cap
                try:
                    c = shape()
                    walk, err = quietly(c)
                finally:
                    ba_dashboard.CHAIN_DRAW_PASSES = real
                with self.subTest(shape=shape.__name__, cap=cap):
                    self.assertEqual(err, "")
                addrs = [a for a in (F1, F2, F3, F4) if any(s["addr"] == a for s in c.sites)]
                seen.add((tuple((line(c, a)["soldDay"], line(c, a)["needDay"], level(c, a)) for a in addrs),
                          tuple(round(brought(walk, s)[0], 3) for s in (SHOP_A, SHOP_B))))
            with self.subTest(shape=shape.__name__):
                self.assertEqual(len(seen), 1)
        c = depot_and_shop()
        walk, _err = quietly(c)
        self.assertEqual(sold(c, F1, F2, F3), (1183, 591, 626))
        self.assertEqual([level(c, a) for a in (F1, F2, F3)], ["ok"] * 3)
        for shop, sold_day in ((SHOP_A, 1600), (SHOP_B, 800)):
            self.assertLessEqual(short_of_its_need(walk, shop, sold_day), 1e-6)

    def test_the_drifting_pair_settles_on_plain_passes(self):
        # 126 plain passes, under the cap, and the same split far past it.
        def figures():
            c = drifting_pair()
            walk, err = quietly(c)
            return (err, tuple((line(c, a)["soldDay"], line(c, a)["needDay"], level(c, a)) for a in (F1, F2, F3, F4)),
                    tuple(round(brought(walk, s)[0], 3) for s in (SHOP_A, SHOP_B)))
        shipped = figures()
        real = ba_dashboard.CHAIN_DRAW_PASSES
        ba_dashboard.CHAIN_DRAW_PASSES = 3000
        try:
            far = figures()
        finally:
            ba_dashboard.CHAIN_DRAW_PASSES = real
        self.assertEqual(shipped, far)
        self.assertEqual(shipped[0], "")
        self.assertEqual(shipped[1], ((522, 600, "ok"), (1378, 1585, "critical"), (625, 719, "ok"), (625, 719, "ok")))
        self.assertEqual(shipped[2], (1320.0, 1437.5))

    def test_seven_breweries_settle_whatever_the_cap(self):
        # Astra's round 6: plain passes settle in 16. Stepping ahead
        # jumped across a change in what binds every six
        # passes and never settled, so the board showed whatever the cap
        # left (1878 / 1856 / 1861 / 1871 / 802 at 50).
        real = ba_dashboard.CHAIN_DRAW_PASSES
        seen = set()
        for cap in (16, 17, 20, 50, 51, 300, 1000):
            ba_dashboard.CHAIN_DRAW_PASSES = cap
            try:
                c = seven_breweries()
                walk, err = quietly(c)
            finally:
                ba_dashboard.CHAIN_DRAW_PASSES = real
            with self.subTest(cap=cap):
                self.assertEqual(err, "")
            seen.add((tuple((line(c, a)["soldDay"], line(c, a)["needDay"], level(c, a)) for a in SEVEN),
                      tuple(round(brought(walk, s)[0], 3) for s in BARS)))
        self.assertEqual(len(seen), 1)
        lines, receipts = seen.pop()
        self.assertEqual(tuple(x[0] for x in lines), (1879, 1869, 1869, 1869, 782, 276, 3757))
        self.assertEqual(lines[1][1], 2150)
        self.assertEqual({x[2] for x in lines}, {"ok"})
        for shop, sold_day in zip(BARS, (1500, 6000, 4800)):
            self.assertLessEqual(short_of_its_need(walk, shop, sold_day), 1e-6)

    def test_four_breweries_keep_the_split_plain_passes_reach(self):
        # Astra's round 6: this company has a second stable fixed point
        # (1963 / 1963 / 1337 / 1337) that stepping ahead landed on and no
        # check can tell apart; plain passes reach this one, in every
        # address order.
        seen = set()
        for roles in itertools.permutations((F1, F2, F3, F4)):
            c = four_breweries(roles)
            walk, err = quietly(c)
            with self.subTest(roles=roles):
                self.assertEqual(err, "")
            seen.add((tuple((line(c, a)["soldDay"], line(c, a)["needDay"], level(c, a)) for a in roles),
                      tuple(round(brought(walk, s)[0], 2) for s in (SHOP_A, SHOP_B))))
        self.assertEqual(seen, {(((2020, 2324, "warn"), (2020, 2324, "warn"), (1394, 1604, "warn"),
                                  (1165, 1339, "ok")), (5401.44, 1697.85))})

    def test_grok_five_breweries_whatever_the_addresses(self):
        # Grok's round-5 graph: Breweries 0, 2 and 3 make all they can
        # (720 a day each) and are critical, Breweries 1 and 4 are asked
        # nothing, and the bars get what the three make, 2,160 in all.
        seen = set()
        for roles in itertools.permutations((F1, F2, F3, F4, F5)):
            c = grok_five_breweries(roles)
            walk, err = quietly(c)
            with self.subTest(roles=roles):
                self.assertEqual(err, "")
            seen.add((tuple((line(c, a)["soldDay"], line(c, a)["needDay"], level(c, a)) for a in roles),
                      tuple(tuple(round(v, 2) for v in brought(walk, s)) for s in (SHOP_A, SHOP_B))))
        self.assertEqual(seen, {(((900, 1035, "critical"), (0, 0, "ok"), (900, 1035, "critical"),
                                  (900, 1035, "critical"), (0, 0, "ok")), ((1200.0, 1725.0), (960.0, 1380.0)))})

    def test_grok_five_breweries_in_every_factory_and_route_input_order(self):
        for order in itertools.permutations(range(5)):
            for reverse in (False, True):
                with self.subTest(order=order, reverse_routes=reverse):
                    c = grok_five_breweries()
                    c.sites = [c.sites[i] for i in order] + c.sites[5:]
                    if reverse:
                        c.targets.reverse()
                    walk, err = quietly(c)
                    self.assertEqual(err, "")
                    self.assertEqual(sold(c, F1, F2, F3, F4, F5), (900, 0, 900, 900, 0))
                    self.assertEqual(tuple(line(c, a)["needDay"] for a in (F1, F2, F3, F4, F5)),
                                     (1035, 0, 1035, 1035, 0))
                    self.assertEqual([level(c, a) for a in (F1, F2, F3, F4, F5)],
                                     ["critical", "ok", "critical", "critical", "ok"])
                    self.assertAlmostEqual(brought(walk, SHOP_A)[0], 1200, delta=1e-3)
                    self.assertAlmostEqual(brought(walk, SHOP_B)[0], 960, delta=1e-3)

    def test_a_line_asked_exactly_its_capacity_fits(self):
        # Successive passes agree to 1e-7, which is no bound on the distance
        # to the fixed point: an exact need of 720 can read 720.00005.
        self.assertEqual(ba_dashboard._line_use(1, 30, 720, 626, 720.00005 / 1.15)["production"]["level"], "ok")
        self.assertEqual(ba_dashboard._line_use(1, 30, 720, 626, 720.01 / 1.15)["production"]["level"], "warn")
        self.assertEqual(ba_dashboard._line_use(1, 30, 720, 720, 720.0001)["production"]["level"], "warn")
        self.assertEqual(ba_dashboard._line_use(1, 30, 720, 720, 720.01)["production"]["level"], "critical")

if __name__ == "__main__":
    unittest.main()
