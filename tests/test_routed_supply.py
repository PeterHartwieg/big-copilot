"""A depot line topped up by the company's own factory, on synthetic fixtures only.

What leaves a depot is not all the import's to bring: a factory on a logistics
route that refills the depot every morning covers what its machines make, and
a Smart Delivery import beside it brings nothing while the depot stays full.
The import row judges its order, its cover and its catch-up on the rest of
the draw. A factory that only holds the item makes no route count: stock runs
out, a standing order does not. A depot fed by imports alone reads exactly as
before. None of it reads the delivery log: every save here has an empty one.
"""
import json
import subprocess
import unittest
from unittest import mock
from pathlib import Path

from tests.i18n_check import MsgAsserts

from ba_dashboard import (plain, RECIPE_ITEMS, SUMMARIES, WEEKDAYS, History, Names, _alerts,
                          _factories, _import_notes, _supply, _supply_facts, site_key)
from test_recipe_identity import BEER, RID, WATER
from test_recipe_identity import SaveStub as FactoryStub

DAY = 10  # the save's day
FACTORY, DEPOT, SHOP = ("factory", 0), ("depot", 1), ("shop", 2)
FOOD = "ba:itemname_frozenfood"
FOOD_RID = next(rid for rid, item in RECIPE_ITEMS.items() if item == FOOD)
DRAW = 3600  # what the shop sells a day, and so what leaves the depot


class SaveStub:
    """Three sites and no delivery log. The factory has `machines` machines
    on the frozen food recipe, staffed around the clock."""

    def __init__(self, plans, contracts, machines=0):
        def site(addr):
            count = machines if addr == FACTORY else 0
            return {"RentedByPlayer": True, "StreetName": addr[0], "StreetNumber": addr[1],
                    "itemInstances": [{"$v": {
                        "id": f"m-{i}", "priority": i, "selectedRecipeId": FOOD_RID,
                        "workstationType": "ba:factoryworkstationtype_bottledgoodsworkstation"}}
                        for i in range(count)],
                    "scheduleDays": [{"day": d, "workShifts": [
                        {"itemInstanceId": f"m-{i}", "type": 1, "startingHour": 0, "endingHour": 24}
                        for i in range(count)]} for d in range(7)],
                    "deliveryTransactions": []}

        self.root = {
            "Hour": 12, "Minute": 0,
            "BuildingRegistrations": [site(addr) for addr in (FACTORY, DEPOT, SHOP)],
            "logisticsManagerPlans": plans,
            "importPartnerships": contracts,
        }

    def items(self, value):
        return value or []

    def deref(self, value):
        return value

    def address(self, value):
        return value


def plan(source, dest, amount):
    return {"targetAddress": source, "destinations": [{
        "deliveryTargetAddress": dest,
        "stockTargets": [{"itemName": FOOD, "targetAmount": amount}]}]}


def contract(amount, last_week, smart, due=14, active=True):
    """An import to the depot, next due on `due` (day 14 is the weekday of day 7)."""
    partnership = {"importAddress": ("pier", 2), "isActive": active, "nextDeliveryDay": due,
                   "isRepeatingOrder": True,
                   "products": [{"itemName": FOOD, "amount": amount,
                                 "amountOrderedLastWeek": last_week, "assignedWarehouse": DEPOT}]}
    if smart:
        partnership["isTarget"] = True
    return partnership


def depot_row(*args, **kwargs):
    """The depot's import row and its node in the goods-flow graph, from
    depot_supply()."""
    supply, _businesses = depot_supply(*args, **kwargs)
    row = next(r for r in supply["imports"] if r["s"] == 1)
    node = next(n for n in supply["graph"]["nodes"] if n.get("id") == site_key(DEPOT))
    return row, next(i for i in node["items"] if i["item"] == "Frozen Food")


def board_data(*args, **kwargs):
    """The payload the board's supply tables read, for a page test: depot_supply()
    as `D`. tests/import_routes.test.cjs renders it."""
    supply, businesses = depot_supply(*args, **kwargs)
    return {"meta": {"character": "routed-supply", "day": DAY, "save": "Fixture"},
            "supply": supply, "businesses": businesses, "plan": {"recipes": []}}


def depot_supply(made_share, contracts, stock=2700, route=None, target=7000, rhythm=None,
                 factory_units=0):
    """_supply() over a factory, a depot and a shop, and the businesses.

    The shop sells DRAW a day, which the depot's rounds send it. The factory
    makes `made_share` of DRAW a day on one machine (none at 0) and holds
    `factory_units`, and its route tops the depot up to `target` each
    morning; `route` sets the route up (by default, where the factory makes
    something). `rhythm` is the depot's weekday profile, by weekday index.
    """
    plans = [plan(DEPOT, SHOP, 5000)]
    if made_share if route is None else route:
        plans.append(plan(FACTORY, DEPOT, target))
    save = SaveStub(plans, contracts, machines=1 if made_share else 0)
    recipes = {FOOD: {"slug": FOOD, "item": "Frozen Food", "out": DRAW * made_share / 24,
                      "workstation": "bottledgoods", "ingredients": []}}

    def business(site, name, kind, status, lines):
        return {"key": site_key(site), "name": name, "code": "", "neighbourhood": "",
                "type": kind, "typeSlug": kind, "status": status, "lines": lines}

    businesses = [
        business(FACTORY, "Food Factory", "factory", "support",
                 [{"slug": FOOD, "item": "Frozen Food", "units": factory_units, "rate": 0, "price": 0}]),
        business(DEPOT, "Depot", "warehouse", "support",
                 [{"slug": FOOD, "item": "Frozen Food", "units": stock, "rate": 0, "price": 0}]),
        business(SHOP, "Shop", "supermarket", "retail",
                 [{"slug": FOOD, "item": "Frozen Food", "units": 500, "rate": DRAW, "price": 1}]),
    ]
    if rhythm:
        businesses[1]["rhythm"] = [{"day": WEEKDAYS[wd], "index": index}
                                   for wd, index in enumerate(rhythm)]
    return _supply(save, Names({}), businesses, DAY, {}, recipes), businesses


class SupplyOnly(list):
    """The businesses as the supply findings index them, with none of their own
    findings: a loop over them sees nothing."""

    def __iter__(self):
        return iter(())


class RoutedSupplyTests(MsgAsserts, unittest.TestCase):
    def test_a_depot_fed_daily_by_a_factory_is_not_short(self):
        """The Costy Co case: the factory's machines make what the shop sells
        and its route brings it each morning, and a Smart Delivery backup at
        5,200 brings nothing because the depot is always full. The import has
        nothing to cover, so the row is ok: no order finding, no catch-up, no
        stockout, and the goods-flow node agrees."""
        row, item = depot_row(1.0, [contract(5200, 0, smart=True)])
        self.assertEqual((row["perDay"], row["routed"], row["importPerDay"]), (DRAW, DRAW, 0))
        self.assertEqual((row["level"], row["reason"], row["covered"]), ("ok", None, True))
        self.assertEqual((row["orderFit"], row["coverFit"]), ("ok", "ok"))
        self.assertEqual((row["weekNeed"], row["basis"]), (0, "sales"))
        self.assertFalse(row["catchUp"])
        self.assertIsNone(row["runsOut"])
        self.assertEqual((item["fit"], item["short"], item["low"]), ("ok", False, False))

    def test_a_factory_that_only_holds_the_item_brings_nothing(self):
        """The route is set up, but the factory makes no frozen food: its 9,600
        run out, so the route counts for nothing and the whole week is the
        import's. A 5,000 order against 25,200 is short."""
        row, _item = depot_row(0.0, [contract(5000, 5000, smart=False)], route=True,
                               factory_units=9600)
        self.assertEqual((row["routed"], row["covered"], row["weekNeed"]), (0, False, 7 * DRAW))
        self.assertEqual((row["level"], row["reason"]), ("critical", "order"))

    def test_what_a_sender_holds_times_the_shelf_but_never_sizes_the_order(self):
        """The factory holds 30,000 and makes none: its rounds carry the depot
        to the drop, so the shelf does not run dry, but the order is still
        sized on the whole week, since a holding runs out."""
        row, item = depot_row(0.0, [contract(5000, 5000, smart=False)], route=True,
                              factory_units=30000)
        self.assertEqual((row["routed"], row["weekNeed"], row["orderFit"]), (0, 7 * DRAW, "short"))
        self.assertEqual((row["coverFit"], row["catchUp"], item["low"]), ("ok", 0, False))
        self.assertEqual((row["level"], row["reason"]), ("critical", "order"))

    def test_a_route_within_noise_of_the_draw_covers_it(self):
        """A factory making 97% of the draw covers it: that is two figures
        within rounding, not 108 a day for the import."""
        row, _item = depot_row(0.97, [contract(5200, 0, smart=True)])
        self.assertEqual((row["covered"], row["importPerDay"], row["weekNeed"]), (True, 0, 0))
        self.assertEqual((row["level"], row["orderFit"]), ("ok", "ok"))

    def test_a_paused_backup_beside_a_covering_route_is_ok(self):
        row, _item = depot_row(1.0, [contract(5200, 0, smart=True, active=False)])
        self.assertTrue(row["paused"])
        self.assertEqual((row["level"], row["reason"], row["covered"]), ("ok", None, True))

    def test_a_route_covering_part_of_the_draw_leaves_the_rest_to_the_import(self):
        """The factory makes half the draw, so a week asks the import for the
        other half: 12,600, which a 13,000 plain order covers."""
        row, _item = depot_row(0.5, [contract(13000, 13000, smart=False)], stock=9000)
        self.assertEqual((row["routed"], row["importPerDay"]), (DRAW // 2, DRAW // 2))
        self.assertEqual(row["weekNeed"], 7 * DRAW // 2)
        self.assertEqual((row["orderFit"], row["level"], row["covered"]), ("ok", "ok", False))

    def test_a_partial_route_leaves_the_node_the_import_s_days(self):
        """Half the draw by route and 2,700 on the shelf: the import's 1,800 a
        day builds up over the five rounds to its drop (today's, which has
        not left yet, to the drop day's, which leaves before the import
        lands), 9,000, so the goods-flow node reads the depot low, not the
        one day a covering route asks."""
        _row, item = depot_row(0.5, [contract(13000, 13000, smart=False)])
        self.assertEqual((item["need"], item["low"]), (9000, True))

    def test_a_busy_day_does_not_make_a_mostly_routed_depot_low(self):
        """The factory makes 90% of the draw, Saturday is 1.6 times a quiet
        day and 6,000 are on the shelf: the row's own walk reaches the drop
        with room to spare, so the node does not read the depot low by
        counting every day as a Saturday."""
        rhythm = [90] * 6 + [160]
        row, item = depot_row(0.9, [contract(5000, 5000, smart=False)], stock=6000, rhythm=rhythm)
        self.assertEqual(row["routed"], round(0.9 * DRAW))
        self.assertEqual((row["coverFit"], row["level"]), ("ok", "ok"))
        self.assertEqual((item["need"], item["low"]), (row["carry"], False))
        self.assertLess(item["need"], 6000)

    def test_a_generous_plain_import_does_not_crowd_the_route_out_of_the_week(self):
        """The same depot with a 26,000 plain import. For sizing, the route
        brings only the 426 a day of need beyond the import; but the route
        still tops the depot up every morning from a factory making 3,240 a
        day, so the walk to the drop takes what the factory could send, and
        the shelf reaches the drop."""
        rhythm = [90] * 6 + [160]
        row, _item = depot_row(0.9, [contract(26000, 26000, smart=False)], stock=6000, rhythm=rhythm)
        self.assertEqual((row["coverFit"], row["level"]), ("ok", "ok"))

    def test_the_node_carries_a_routed_line_to_its_first_drop_only(self):
        """Half the draw by route and two plain 6,500 contracts, one due on day
        11 and one on day 14. The shelf has to reach day 11's drop, not hold
        the whole stretch to day 14 as if nothing landed in between."""
        contracts = [contract(6500, 6500, smart=False, due=11),
                     contract(6500, 6500, smart=False, due=14)]
        contracts[1]["importAddress"] = ("pier", 3)
        row, item = depot_row(0.5, contracts, stock=4000)
        self.assertEqual((row["coverFit"], row["catchUp"]), ("ok", 0))
        self.assertEqual((item["need"], item["low"]), (row["carry"], False))
        # Today's round and day 11's, which leaves before the drop lands, at
        # the import's 1,800 a day.
        self.assertEqual(row["carry"], 3600)

    def test_a_small_first_drop_does_not_hide_the_stretch_after_it(self):
        """The same route with 200 due on day 11 and 6,500 on day 14: the small
        drop cannot carry the shelf to the big one, the row is critical, and
        the node reads the depot low with it."""
        contracts = [contract(200, 200, smart=False, due=11),
                     contract(6500, 6500, smart=False, due=14)]
        contracts[1]["importAddress"] = ("pier", 3)
        row, item = depot_row(0.5, contracts, stock=4000)
        self.assertEqual((row["coverFit"], row["level"]), ("short", "critical"))
        self.assertEqual(row["carry"], 4000 + row["catchUp"])
        self.assertEqual((item["need"], item["low"]), (row["carry"], True))

    def test_a_route_claims_no_more_than_its_target(self):
        """A morning round tops the depot up to its target and brings no more,
        however much the factory makes."""
        row, _item = depot_row(1.0, [contract(5200, 0, smart=True)], target=2000)
        self.assertEqual((row["routed"], row["importPerDay"]), (2000, DRAW - 2000))

    def test_the_import_s_week_is_the_stock_balance(self):
        """The factory makes only 2,988 a day and the route target is high,
        so a quiet day's surplus stays in the depot for the busy one. A week
        asks the import for the draw less what the route brings, 7 x 612 =
        4,284, which a 5,000 level covers; clipping each day at nothing would
        ask for 6,660 and call the level too low."""
        rhythm = [50, 100, 100, 100, 100, 50, 200]
        row, _item = depot_row(0.83, [contract(5000, 0, smart=True)], target=20000,
                               rhythm=rhythm, stock=9000)
        self.assertEqual((row["routed"], row["importPerDay"]), (2988, 612))
        self.assertEqual(row["weekNeed"], 7 * 612)
        self.assertEqual((row["orderFit"], row["level"]), ("ok", "ok"))

    def test_a_covering_route_can_still_be_outrun_by_a_busy_day(self):
        """The route brings the average draw every morning, but Saturday draws
        four times a quiet day: the 2,700 on the shelf, and what the quiet
        days leave on it, cannot carry Saturday to Sunday's round. The week
        is covered; the day is not, and the catch-up bridges the day, not
        the week's net: the backup is next due on Tuesday, and the quiet
        Sunday and Monday before it do not refill Saturday's empty shelf."""
        rhythm = [70] * 6 + [280]
        row, _item = depot_row(1.0, [contract(5200, 0, smart=True, due=16)], rhythm=rhythm)
        self.assertEqual((row["covered"], row["weekNeed"], row["orderFit"]), (True, 0, "ok"))
        self.assertEqual((row["coverFit"], row["runsOut"]), ("short", "Saturday"))
        self.assertEqual((row["level"], row["reason"]), ("critical", "shortfall"))
        # Wednesday's round (not left yet), Thursday's and Friday's leave
        # 3,240 on top of the 2,700 held; Saturday takes 6,480 beyond the
        # route.
        self.assertEqual(row["catchUp"], 6480 - 2700 - 3240)

    def test_the_alert_for_a_covered_line_names_the_route_not_the_drop(self):
        """The Saturday above, with the backup active: the gap is the day before
        the route's next round, not the days to Tuesday's drop, and the import
        answers for nothing a day."""
        rhythm = [70] * 6 + [280]
        supply, businesses = depot_supply(1.0, [contract(5200, 0, smart=True, due=16)],
                                          rhythm=rhythm)
        self.assertEqual((supply["facts"]["1"][FOOD]["st"], supply["facts"]["1"][FOOD]["why"]),
                         ("short", "shortfall"))
        result = _alerts(SupplyOnly(businesses), supply, [], [], [], [], [], DAY, 0.0)
        [text] = [a["text"] for a in result["lines"] + result["minor"]["rows"]
                  if a.get("ev", {}).get("slug") == FOOD]
        self.assertMsg(text, "f.shortfall.route", item="Frozen Food", routed=3600)
        self.assertNoMsg(text, "f.shortfall")
        self.assertNoMsg(text, "f.shortfall.routed")

    def test_the_shortfall_kind_is_named_for_a_route_s_round_too(self):
        """The Saturday above stays a `shortfall`, so a player's switch for the
        kind keeps what it meant; the kind's description, and the line three
        of them condense into, name the next import or route round, or the
        next delivery, rather than an import alone."""
        self.assertMsg(SUMMARIES["shortfall"](3, "Coffee"), "f.sum.shortfall", n=3, subject="Coffee")
        # Pins the wording: the condensed line must not blame an import alone.
        self.assertNotIn("import", plain(SUMMARIES["shortfall"](3, "Coffee")))
        # The kind's note as the board builds it: the whole board script run
        # under Node (tests/_board.cjs), so the table is read as a value.
        loader = Path(__file__).resolve().parent / "_board.cjs"
        script = ("const vm = require('node:vm');\n"
                  "const board = require(" + json.dumps(str(loader)) + ").loadBoard();\n"
                  "console.log(JSON.stringify(vm.runInContext("
                  "'ALERT_GROUPS.find(g => g.id === \"shortfall\").note', board)));")
        note = json.loads(subprocess.run(["node", "-e", script], check=True, text=True,
                                         capture_output=True).stdout)
        # Pins the wording: the kind description must name route rounds as well as imports.
        self.assertIn("import or route round", note)

    def test_a_paused_backup_beside_a_covering_route_is_judged_over_a_week(self):
        """The same Saturday with the backup paused: there is no drop to reach,
        so the shelf is judged over a week, and it still runs dry."""
        rhythm = [70] * 6 + [280]
        row, _item = depot_row(1.0, [contract(5200, 0, smart=True, active=False)], rhythm=rhythm)
        self.assertEqual((row["covered"], row["paused"]), (True, True))
        self.assertEqual((row["coverFit"], row["runsOut"]), ("short", "Saturday"))
        self.assertEqual((row["level"], row["reason"]), ("critical", "shortfall"))
        self.assertEqual(row["catchUp"], 6480 - 2700 - 3240)

    def test_the_weekly_imports_table_gets_the_route_s_week(self):
        """Half the draw by route beside a 5,000 order: the table reads what
        the shop sells, 25,200 a week, and the 12,600 the route brings of it."""
        supply, _ = depot_supply(0.5, [contract(5000, 5000, smart=False)])
        entry = supply["factories"]["depots"][1][FOOD]
        self.assertEqual((entry["drawWeek"], entry["routed"], entry["covered"]),
                         (7 * DRAW, 7 * DRAW // 2, False))
        row = next(r for r in supply["imports"] if r["s"] == 1)
        self.assertEqual(row["weekNeed"], 7 * DRAW // 2)

    def test_a_depot_line_a_route_feeds_with_no_import_is_given_to_the_table(self):
        """No import contract, and the factory makes the whole draw: the line
        is listed with its route, so the table asks for no import, and its
        fact is judged daily on the route's target."""
        supply, _ = depot_supply(1.0, [])
        self.assertFalse(supply["imports"])
        self.assertEqual(dict(supply["factories"]["depotRoutes"]),
                         {1: {FOOD: {"routed": 7 * DRAW, "covered": True, "drawWeek": 7 * DRAW}}})
        fact = supply["facts"]["1"][FOOD]
        self.assertEqual((fact["st"], fact["why"], fact["cad"], fact["from"]),
                         ("covered", "route", "daily", 0))
        # A depot line an import covers is not listed twice.
        supply, _ = depot_supply(1.0, [contract(5200, 0, smart=True)])
        self.assertEqual(dict(supply["factories"]["depotRoutes"]), {})

    def test_a_plan_to_an_address_not_the_company_s_does_not_break_the_walk(self):
        # A depot's plan to a building the company no longer runs, its key
        # sorting after the shop's: the walk once added that address to the
        # share table while looping over it ("dictionary changed size").
        plans = [plan(DEPOT, SHOP, 5000), plan(FACTORY, DEPOT, 7000), plan(DEPOT, ("zzz", 9), 500)]
        recipes = {FOOD: {"slug": FOOD, "item": "Frozen Food", "out": DRAW / 24,
                          "workstation": "bottledgoods", "ingredients": []}}

        def business(site, name, kind, status, units, rate):
            return {"key": site_key(site), "name": name, "code": "", "neighbourhood": "", "type": kind,
                    "typeSlug": kind, "status": status,
                    "lines": [{"slug": FOOD, "item": "Frozen Food", "units": units, "rate": rate, "price": 1}]}

        businesses = [business(FACTORY, "F", "factory", "support", 0, 0),
                      business(DEPOT, "D", "warehouse", "support", 2700, 0),
                      business(SHOP, "S", "supermarket", "retail", 500, DRAW)]
        _supply(SaveStub(plans, [], machines=1), Names({}), businesses, DAY, {}, recipes)

    def test_a_target_with_no_item_name_sorts_after_the_named_ones(self):
        # Real saves hold stock targets with no item name. Beside a named
        # target on the same shop, the routed list once compared None with a
        # str and raised TypeError out of _supply().
        named = plan

        def with_unnamed(source, dest, amount):
            p = named(source, dest, amount)
            if dest == SHOP:
                p["destinations"][0]["stockTargets"].append({"itemName": None, "targetAmount": 10})
            return p

        with mock.patch(f"{__name__}.plan", with_unnamed):
            supply, _ = depot_supply(1.0, [])
        self.assertEqual(supply["routed"], [[1, FOOD], [2, FOOD], [2, None]])

    def test_a_depot_fed_only_by_imports_reads_as_before(self):
        """No route into the depot: the whole draw is the import's, and a 5,000
        order against a 25,200 week is short. The depot is walked a round at
        a time: today's round (not left yet) takes 3,600 of the 2,700 held,
        and the stock has to carry five rounds, to the drop day's, which
        leaves before the import lands."""
        row, item = depot_row(0.0, [contract(5000, 5000, smart=False)])
        self.assertEqual((row["perDay"], row["routed"], row["importPerDay"]), (DRAW, 0, DRAW))
        self.assertEqual((row["level"], row["reason"], row["covered"]), ("critical", "order", False))
        self.assertEqual((row["orderFit"], row["coverFit"]), ("short", "short"))
        self.assertEqual(row["weekNeed"], 7 * DRAW)
        self.assertEqual((row["catchUp"], row["runsOut"], row["cover"], row["shortBy"]),
                         (5 * DRAW - 2700, "Wednesday", 0.8, 4.25))
        self.assertEqual((item["fit"], item["short"], item["low"], item["need"], item["cycleNeed"]),
                         ("short", True, True, 5 * DRAW, 7 * DRAW))


class RoutedFactoryViewTests(MsgAsserts, unittest.TestCase):
    """A factory drawing water from a depot with a 1,000 a week import; its one
    machine eats 240 a day, 1,680 a week."""

    def need(self, routed=None, route_only=None, target=100):
        """The factory's water row; `route_only` feeds the depot by route
        with no import of water there at all."""
        depot = "depot#1"
        flow = {
            "index": {site_key(("factory", 0)): 0, depot: 1},
            "held": {}, "edges": {},
            "targets": {(site_key(("factory", 0)), WATER): (target, depot)},
            "imports": {} if route_only else {(depot, WATER): {"weekly": 1000}},
            "shipped": lambda *args: None, "received": lambda *args: None,
            "byDay": lambda *args: {}, "roundDays": lambda *args: [],
            "routed": {(depot, WATER): routed} if routed else {},
            "routeOnly": {(depot, WATER): route_only} if route_only else {},
        }
        recipes = {BEER: {"slug": BEER, "item": "Beer", "out": 30, "workstation": "bottledgoods",
                          "ingredients": [{"slug": WATER, "item": "Water", "per": 10}]}}
        result = _factories(FactoryStub([[RID]]), Names({}), [], recipes, flow,
                            History(None), "company")
        return result["sites"][0]["needs"][0]

    def test_without_a_route_the_import_is_short(self):
        self.assertEqual(self.need()["importFit"], "short")

    def test_a_route_into_the_depot_takes_its_share_off_the_import(self):
        """The depot's whole draw is the factory's, and a route brings 1,000 of
        it a week: the import answers for 680."""
        row = self.need((1000, False, 1680))
        self.assertEqual((row["importFit"], row["importRouted"]), ("ok", 1000))

    def test_the_route_goes_first_to_what_else_leaves_the_depot(self):
        """Shops take another 7,000 a week from the depot; a 1,000 a week route
        does not reach the factory's part, which stays the import's."""
        self.assertEqual(self.need((1000, False, 8680))["importFit"], "short")

    def test_a_covering_route_leaves_the_import_nothing(self):
        row = self.need((1680, True, 1680))
        self.assertEqual((row["importFit"], row["importCovered"], row["importNeed"]), ("ok", True, 0))

    def test_a_depot_fed_by_route_alone_is_no_missing_import(self):
        """Import Hub imports water and routes it daily to the depot, which
        imports none: the factory's input is not "no import" when the route
        brings the depot's week, and the page gets the route to agree."""
        self.assertEqual(self.need(route_only=(0, False, 0), target=300)["status"], "noimport")
        row = self.need(route_only=(1680, True, 1680), target=300)
        self.assertEqual((row["status"], row["importCovered"], row["importRouted"],
                          row["importDrawWeek"], row["importNeed"]), ("ok", True, 1680, 1680, 0))
        # Half of it by route leaves the other half with no import.
        row = self.need(route_only=(840, False, 1680), target=300)
        self.assertEqual((row["status"], row["importNeed"]), ("noimport", 840))
        # A route covering what a starved factory draws does not cover its need.
        self.assertEqual(self.need(route_only=(200, True, 200), target=300)["status"], "noimport")

    def route_fact(self, credit, shops_day=0):
        """The depot's water fact when a route from the hub feeds it and no
        import does: the factory's line eats 240 a day, the shops take
        `shops_day`, and the hub can send `credit` a day of it (the chain's
        walk, as _supply_walk() gives it). No route at all at a credit of None."""
        depot = site_key(("depot", 1))
        businesses = [
            {"key": site_key(("factory", 0)), "name": "Factory", "status": "support", "lines": []},
            {"key": depot, "name": "Depot", "status": "support",
             "lines": [{"slug": WATER, "item": "Water", "units": 400, "rate": 0}]},
        ]
        use = 240.0 + shops_day
        node = {"use": use, "need": use, "lines": (240.0, 240.0), "sites": (shops_day, shops_day),
                "own": 0.0, "credit": credit or 0.0, "supplied": credit or 0.0,
                "potential": credit or 0.0, "covered": bool(credit) and credit >= use,
                "inbound": credit is not None, "targets": 5000 if credit is not None else 0,
                "senders": ["hub#9"] if credit is not None else [], "demand": {}, "asked": {}}
        factories = {"sites": [], "depots": {}, "depotRoutes": {}}
        facts = _supply_facts({
            "businesses": businesses, "index": {b["key"]: i for i, b in enumerate(businesses)},
            "factories": factories, "targets": {(depot, WATER): (5000, "hub#9")},
            "import_rows": [], "peak": lambda business: (1.0, None),
            "walk": {mode: {(depot, WATER): node} for mode in ("cap", "dem")},
        })
        supply = {"facts": facts, "imports": [], "factories": factories}
        return facts["1"][WATER], _import_notes(businesses, supply, set())

    def test_the_no_import_finding_counts_what_the_route_leaves(self):
        """The hub can send half the week: the finding counts the depot's weeks
        against the other half and says the route brings the rest. The 400
        held last three days of that half: critical."""
        fact, [note] = self.route_fact(120.0)
        self.assertEqual((fact["st"], fact["lvl"], fact["use"], fact["parts"]),
                         ("noplan", "critical", 840, {"lines": 1680, "sites": 0, "route": 840}))
        self.assertMsg(note["text"], "f.import.noplan.route", stock=400, use=840, route=840)
        self.assertAlmostEqual(note["text"].p["weeks"], 400 / 840)

    def test_the_no_import_finding_names_what_the_route_leaves_of_everything(self):
        """The depot also sends the shops 840 a week: of the 2,520 that leave,
        a 2,000 a week route leaves 520 with no import, which the finding
        counts; with no route it is all 2,520."""
        fact, [note] = self.route_fact(2000 / 7, shops_day=120.0)
        self.assertEqual((fact["use"], fact["parts"]),
                         (520, {"lines": 1680, "sites": 840, "route": 2000}))
        self.assertMsg(note["text"], "f.import.noplan.sites.route", use=520, route=2000)
        fact, [note] = self.route_fact(None, shops_day=120.0)
        self.assertMsg(note["text"], "f.import.noplan.sites", use=2520)
        self.assertNoMsg(note["text"], "f.import.noplan.sites.route")
        # A route bringing all of it leaves nothing to say.
        fact, notes = self.route_fact(240.0)
        self.assertEqual((fact["st"], fact["why"], notes), ("covered", "route", []))

    def test_a_route_covering_a_starved_draw_does_not_cover_the_need(self):
        """The depot draws only 200 a week because the factory is starved; a
        route bringing those 200 covers the draw, not the 1,680 the machine
        needs, so the import still answers for 1,480."""
        row = self.need((200, True, 200))
        self.assertEqual((row["importFit"], row["importCovered"], row["importNeed"]),
                         ("short", False, 1480))


if __name__ == "__main__":
    unittest.main()
