"""_supply()'s stages, each on its own, on synthetic fixtures only.

_supply() runs in stages (docs/architecture.md, "Supply stages"): the save's
facts (_supply_plans(), _supply_imports(), _supply_wholesale(),
_DeliveryLog), the network's ends (_supply_leaves()), sizing
(_DemandSizing, _supply_depot_rows() over _supply_walk()) and presentation
(_supply_shop_rows(), _supply_graph()). These tests hold each stage to what it
takes and returns, and the stages, composed by hand, to what _supply() ships.
"""
import collections
import copy
import unittest

from ba_dashboard import (FLAT_WEEK, SUPPLY_MARGIN, WEEKDAYS, _demand_ends, _DeliveryLog, _DemandSizing,
                          _supply_depot_rows, _supply_imports, _supply_leaves, _supply_plans,
                          _supply_shop_rows, _supply_walk, _supply_wholesale, Names, site_key)
from test_supply_facts import BEER, SODA, Company, tx

HUB, FACTORY, DEPOT = ("pier_road", 1), ("mill_lane", 2), ("dock_street", 3)
SHOP_A, SHOP_B = ("main_street", 4), ("high_street", 5)


def key(addr):
    return site_key(addr)


def index_of(businesses):
    return {b["key"]: i for i, b in enumerate(businesses)}


def no_peak(_business):
    return 1.0, None


class PlansStageTests(unittest.TestCase):
    """_supply_plans(): every plan's target in the save's order, and the one
    target that counts where several plans top one line up."""

    def test_edges_keep_plan_order_and_the_pier(self):
        c = Company()
        c.site(HUB, "Hub")
        c.shop(SHOP_A, "Shop")
        c.plan(HUB, SHOP_A, SODA, 50)
        c.plan(HUB, ("pier", 9), SODA, 20)
        edges, _targets = _supply_plans(c.save(), c.businesses())
        self.assertEqual(edges, {key(HUB): [(key(SHOP_A), SODA, 50), (key(("pier", 9)), SODA, 20)]})

    def test_the_sender_with_the_item_wins_over_a_higher_target(self):
        c = Company()
        c.site(HUB, "Hub")
        c.site(DEPOT, "Depot")
        c.shop(SHOP_A, "Shop")
        c.hold(HUB, SODA, 10)  # holds some: has it to send
        c.hold(DEPOT, SODA, 0)  # holds none, imports none, nothing routes it
        c.plan(DEPOT, SHOP_A, SODA, 90)
        c.plan(HUB, SHOP_A, SODA, 40)
        _edges, targets = _supply_plans(c.save(), c.businesses())
        self.assertEqual(targets[(key(SHOP_A), SODA)], (40, key(HUB)))

    def test_a_tie_goes_to_the_site_key_whatever_the_plan_order(self):
        for first, second in ((HUB, DEPOT), (DEPOT, HUB)):
            c = Company()
            c.site(HUB, "Hub")
            c.site(DEPOT, "Depot")
            c.shop(SHOP_A, "Shop")
            c.hold(HUB, SODA, 10)
            c.hold(DEPOT, SODA, 10)
            c.plan(first, SHOP_A, SODA, 40)
            c.plan(second, SHOP_A, SODA, 40)
            _edges, targets = _supply_plans(c.save(), c.businesses())
            self.assertEqual(targets[(key(SHOP_A), SODA)], (40, max(key(HUB), key(DEPOT))))

    def test_a_factory_making_the_item_has_it(self):
        c = Company()
        c.factory(FACTORY, "Brewery")
        c.site(DEPOT, "Depot")
        c.shop(SHOP_A, "Shop")
        c.plan(DEPOT, SHOP_A, BEER, 90)
        c.plan(FACTORY, SHOP_A, BEER, 30)
        _edges, targets = _supply_plans(c.save(), c.businesses())
        self.assertEqual(targets[(key(SHOP_A), BEER)], (30, key(FACTORY)))


class ImportsStageTests(unittest.TestCase):
    """_supply_imports(): each import line with its contracts, the lines at
    zero apart, and the next active drop."""

    def test_active_and_paused_contracts_on_one_line(self):
        c = Company(day=20)
        c.site(HUB, "Hub")
        c.contract(HUB, SODA, 300, due=24, pier=1)
        c.contract(HUB, SODA, 500, due=22, active=False, last=400, pier=2)
        imports, configured, next_day = _supply_imports(c.save(), Names({}), c.day)
        line = imports[(key(HUB), SODA)]
        self.assertEqual(line["weekly"], 300)
        self.assertEqual(line["pausedWeekly"], 500)
        self.assertTrue(line["active"])
        self.assertEqual(line["arrives"], 24)
        self.assertEqual([d["amount"] for d in line["deliveries"]], [300])
        self.assertEqual(len(line["contracts"]), 2)
        self.assertEqual(configured, {})
        self.assertEqual(next_day, 24, "a paused contract's day is no drop")

    def test_a_line_at_zero_is_configured_not_imported(self):
        c = Company(day=20)
        c.site(HUB, "Hub")
        c.contract(HUB, SODA, 0, due=23)
        imports, configured, next_day = _supply_imports(c.save(), Names({}), c.day)
        self.assertEqual(imports, {})
        self.assertEqual(list(configured), [(key(HUB), SODA)])
        self.assertEqual(next_day, 23)

    def test_nothing_imported(self):
        c = Company()
        c.site(HUB, "Hub")
        self.assertEqual(_supply_imports(c.save(), Names({}), c.day), ({}, {}, None))


class WholesaleStageTests(unittest.TestCase):
    """_supply_wholesale(): a repeating, enabled, non-urgent contract to a
    site of the company's is a standing supply; nothing else is."""

    def test_only_repeating_contracts_to_own_sites(self):
        c = Company(day=20)
        c.shop(SHOP_A, "Shop")
        c.wholesale(SHOP_A, SODA, 70, due=23)
        c.wholesale(SHOP_A, SODA, 30, due=22)
        c.wholesale(SHOP_A, BEER, 99, repeating=False)
        c.wholesale(SHOP_A, BEER, 99, enabled=False)
        c.wholesale(SHOP_B, SODA, 50)  # not a site of the company's
        businesses = c.businesses()
        deals = _supply_wholesale(c.save(), index_of(businesses), c.day, 0.5)
        self.assertEqual(deals, {(key(SHOP_A), SODA): {"weekly": 100, "day": WEEKDAYS[22 % 7], "days": 1.5}})


class DeliveryLogTests(unittest.TestCase):
    """_DeliveryLog: what the log says happened, which sizes nothing."""

    def company(self):
        c = Company(day=20)
        c.site(HUB, "Hub")
        c.site(DEPOT, "Depot")
        for d in (16, 17, 18, 19):
            c.ship(d, HUB, DEPOT, {SODA: 50})
        c.log[DEPOT].insert(0, tx(15, {SODA: 200}))  # the first fill, before the window's rounds
        c.ship(20, HUB, DEPOT, {SODA: 50})  # today's round has left
        return c

    def test_tables_and_rates(self):
        log = _DeliveryLog(self.company().save(), 20)
        self.assertEqual(log.round_days[key(HUB)], {16, 17, 18, 19})
        self.assertIn((key(HUB), SODA), log.rounds_today)
        self.assertEqual(log.shipped_per_day(key(HUB), SODA, {}), 50.0)
        self.assertEqual(log.received_per_day(key(DEPOT), SODA), (200 + 4 * 50) / 5)
        self.assertEqual(log.forwarded_per_day(key(DEPOT), SODA), 0.0)
        self.assertIsNone(log.received_per_day(key(HUB), SODA), "too few days on record")

    def test_a_first_fill_is_no_draw(self):
        c = self.company()
        c.log[DEPOT].pop(0)
        c.ship(15, HUB, DEPOT, {SODA: 200})
        log = _DeliveryLog(c.save(), 20)
        self.assertEqual(log.first_fill(key(DEPOT), SODA), (15, 150.0))
        # The hub's outflow includes the first fill; subtract its excess over
        # an ordinary round so only the recurring draw remains.
        self.assertEqual(log.shipped_per_day(key(HUB), SODA, {}), 80.0)
        edges = {key(HUB): [(key(DEPOT), SODA, 200)]}
        self.assertEqual(log.shipped_per_day(key(HUB), SODA, edges), 50.0)

    def test_round_gap(self):
        c = Company(day=20)
        c.site(HUB, "Hub")
        for d in (14, 16, 18):  # every other day, Sunday-indexed weekdays 0, 2, 4
            c.ship(d, HUB, None, {SODA: 10})
        log = _DeliveryLog(c.save(), 20)
        self.assertEqual(log.round_gap(key(HUB)), 3)
        self.assertEqual(log.round_gap(key(DEPOT)), 1, "no rounds logged: every morning")

    def test_tables_are_frozen(self):
        log = _DeliveryLog(self.company().save(), 20)
        self.assertNotIsInstance(log.shipped, collections.defaultdict)
        log.shipped.get("nowhere", {}).get(SODA)
        self.assertNotIn("nowhere", log.shipped)


class LeavesStageTests(unittest.TestCase):
    """_supply_leaves(): the ends of the chain, a day of each."""

    def test_sales_with_the_margin_and_a_target_for_a_new_line(self):
        c = Company()
        c.site(HUB, "Hub")
        c.shop(SHOP_A, "Old Shop")
        c.shop(SHOP_B, "New Shop", trade_days=2)
        c.hold(HUB, SODA, 500, 40)  # a depot's own "sales" are no end
        c.hold(SHOP_A, SODA, 10, 70)
        c.hold(SHOP_B, SODA, 0, 0)
        c.plan(HUB, SHOP_A, SODA, 300)
        c.plan(HUB, SHOP_B, SODA, 120)
        businesses = c.businesses()
        index = index_of(businesses)
        sold_week = {b["key"]: {l["slug"]: l["rate"] for l in b["lines"]} for b in businesses}
        _edges, targets = _supply_plans(c.save(), businesses)
        leaves = _supply_leaves(businesses, index, sold_week, targets)
        self.assertEqual(leaves, {
            (key(SHOP_A), SODA): (70, 70 * (1 + SUPPLY_MARGIN)),
            (key(SHOP_B), SODA): (120.0, 120.0),
        })

    def test_a_closed_shop_needs_nothing(self):
        c = Company()
        c.shop(SHOP_A, "Shop")
        c.hold(SHOP_A, SODA, 10, 70)
        c.closed = {SHOP_A}
        businesses = c.businesses()
        sold_week = {key(SHOP_A): {SODA: 70}}
        self.assertEqual(_supply_leaves(businesses, index_of(businesses), sold_week, {}), {})


class DemandSizingStageTests(unittest.TestCase):
    """_DemandSizing: what the ends draw down the plans, as Demand sizing
    reads it, split between two senders by their targets."""

    def sizing(self):
        c = Company()
        c.site(HUB, "Hub")
        c.site(DEPOT, "Depot")
        c.shop(SHOP_A, "Shop")
        c.hold(HUB, SODA, 100)
        c.hold(DEPOT, SODA, 100)
        c.hold(SHOP_A, SODA, 10, 90)
        c.plan(HUB, SHOP_A, SODA, 200)
        c.plan(DEPOT, SHOP_A, SODA, 100)
        businesses = c.businesses()
        index = index_of(businesses)
        sold = {b["key"]: {l["slug"]: l["rate"] for l in b["lines"]} for b in businesses}
        edges, targets = _supply_plans(c.save(), businesses)
        leaves = _supply_leaves(businesses, index, sold, targets)
        ends = _demand_ends(businesses, c.day, sold, sold, leaves)
        return _DemandSizing(index, edges, leaves, {}, {}, {}, ends)

    def test_ends_and_the_split(self):
        sizing = self.sizing()
        self.assertEqual(sizing.sold_dem[key(SHOP_A)], {SODA: 90})
        self.assertEqual(sizing.graph["share"][(key(SHOP_A), SODA)], {key(HUB): 2 / 3, key(DEPOT): 1 / 3})
        hub, ramp = sizing.demand(key(HUB), SODA)
        depot, _ramp = sizing.demand(key(DEPOT), SODA)
        self.assertAlmostEqual(hub, 60.0)
        self.assertAlmostEqual(depot, 30.0)
        self.assertEqual(ramp, frozenset())

    def test_set_made_starts_the_memos_over(self):
        sizing = self.sizing()
        sizing.demand(key(HUB), SODA)
        self.assertTrue(sizing.drawn)
        sizing.set_made(lambda site, item: site == key(HUB), lambda _site, _item: 1000.0)
        self.assertEqual(sizing.drawn, {})
        self.assertEqual(sizing.levels_at, {})
        self.assertTrue(sizing.has_own(key(HUB), SODA))
        self.assertFalse(sizing.has_own(key(DEPOT), SODA))


class ComposedStagesTests(unittest.TestCase):
    """The stages composed by hand give the rows _supply() ships, and the
    sizing stage changes none of its inputs."""

    def company(self):
        c = Company(day=20, hour=12)
        c.site(HUB, "Hub")
        c.shop(SHOP_A, "Shop A")
        c.shop(SHOP_B, "Shop B")
        c.hold(HUB, SODA, 400)
        c.hold(SHOP_A, SODA, 40, 60)
        c.hold(SHOP_B, SODA, 20, 30)
        c.plan(HUB, SHOP_A, SODA, 120)
        c.plan(HUB, SHOP_B, SODA, 60)
        c.contract(HUB, SODA, 600, due=23)
        return c

    def test_depot_and_shop_rows_match_supply(self):
        c = self.company()
        shipped = c.run()
        save, businesses = c.save(), c.business_list
        index = index_of(businesses)
        held = {b["key"]: {l["slug"]: l["units"] for l in b["lines"]} for b in businesses}
        sold_week = {b["key"]: {l["slug"]: l["weekSold"] / 7 if "weekSold" in l else l["tradeRate"]
                                for l in b["lines"]} for b in businesses}
        edges, targets = _supply_plans(save, businesses)
        imports, _configured, _next = _supply_imports(save, Names({}), c.day)
        wholesale = _supply_wholesale(save, index, c.day, 0.5)
        leaves = _supply_leaves(businesses, index, sold_week, targets)
        drops = {line: supply["drops"]["active"] for line, supply in imports.items() if supply["weekly"]}
        walked = _supply_walk(index, edges, leaves, {}, {}, drops, set())
        inputs = copy.deepcopy((walked, imports, drops, edges, held))
        rows, weekly_use = _supply_depot_rows(
            walked, {}, {}, businesses=businesses, index=index, edges=edges, held=held, imports=imports,
            drops=drops, rounds_today=_DeliveryLog(save, c.day).rounds_today, day=c.day, left_today=0.5,
            beat=lambda _b: FLAT_WEEK, peak_of=no_peak)
        self.assertEqual(rows, shipped["imports"])
        self.assertEqual(weekly_use, {(key(HUB), SODA): rows[0]["importPerDay"] * 7})
        self.assertEqual(rows[0]["perDay"], 90)
        self.assertEqual(copy.deepcopy((walked, imports, drops, edges, held)), inputs)
        self.assertEqual(_supply_shop_rows(businesses, index, targets, wholesale, no_peak), shipped["shops"])


if __name__ == "__main__":
    unittest.main()
