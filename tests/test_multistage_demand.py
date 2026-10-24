"""Demand through multi-stage factory chains (issue #521), on synthetic
fixtures only.

A factory whose own lines make a product that a route from another of the
company's factories also brings it shares what the shops past it draw with
that route: Factory 1's beer goes through Factory 2, which makes beer too,
and the shops sell 1,000 a day. The two make it between them, each judged on
its share, never on all 1,000 each. The shares load every producer the same
where nothing binds, whatever the sites' names or the order they are read
in, so the lines are short together when the chain is. A binding route
target throttles only the paths through it, and the split between several
routes into one site can leave the loads uneven. Expected splits come with
the chain's walk where they matter, so a recorded but infeasible answer
cannot pass.
"""
import itertools
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
        # Brewery 2 feeds Brewery 3, behind which a bar sells 2,000. The
        # split (the solve's part) loads all three at 2,000 / 2,880, and
        # routes nothing from Brewery 1 into Brewery 2: Brewery 3's line
        # makes a quarter of its draw, 500, and Brewery 2's lines all of
        # theirs. demand() (the hold-down's part) then shares Brewery 3's
        # routed 1,500 by the targets, 750 each; Brewery 1 is held down to
        # the 626 its 720 carries with the margin, and Brewery 2 takes the
        # other 124 (levels()). So 626 / 874 / 500, and the 2,880 made
        # covers the 2,300 needed on every line.
        for order in ((F1, F2, F3), (F3, F2, F1)):
            with self.subTest(order=order):
                c = uneven_diamond(order)
                walk = dem_walk(c)
                self.assertEqual(sold(c, F1, F2, F3), (626, 874, 500))
                self.assertEqual(sum(sold(c, F1, F2, F3)), 2000)
                for addr in (F1, F2, F3):
                    self.assertEqual(line(c, addr)["production"], {"status": "covered", "level": "ok"})
                self.assertLessEqual(line(c, F3)["chain"]["makes"], 2880)
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
        # Brewery 2 imports 720 a day: the routes come first in demand(),
        # so Brewery 1 is asked the 626 its line carries and the import
        # brings the rest of the routed part.
        c = two_breweries(1800)
        c.contract(F2, BEER, 5040)
        c.targets = self.shop_target(c)
        walk = dem_walk(c)
        self.assertEqual(sold(c, F1, F2), (626, 600))
        self.assertEqual((level(c, F1), level(c, F2)), ("ok", "ok"))
        self.assertEqual(line(c, F2)["chain"]["makes"], 2160)
        self.assertEqual(received(walk, SHOP_A), need(1800))

    def test_a_wholesale_delivery_at_the_meeting_factory(self):
        c = two_breweries(1800)
        c.wholesale(F2, BEER, 5040)
        c.targets = self.shop_target(c)
        self.assertEqual(sold(c := run_with(c, RECIPES), F1, F2), (626, 600))
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


if __name__ == "__main__":
    unittest.main()
