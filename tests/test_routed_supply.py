"""A depot line topped up by the company's own factory, on synthetic fixtures only.

What leaves a depot is not all the import's to bring: a factory on a logistics
route that refills the depot every morning covers its share, and a Smart
Delivery import beside it brings nothing while the depot stays full. The
import row judges its order, its cover and its catch-up on the rest of the
draw. A depot fed by imports alone reads exactly as before.
"""
import unittest

from ba_dashboard import (SUMMARIES, TEMPLATE, WEEKDAYS, History, Names, _alerts, _factories,
                          _feed_notes, _supply, site_key)
from test_recipe_identity import BEER, RID, WATER
from test_recipe_identity import SaveStub as FactoryStub

DAY = 10  # the save's day; days 3 to 9 are the log's window
FACTORY, DEPOT, SHOP = ("factory", 0), ("depot", 1), ("shop", 2)
FOOD = "ba:itemname_frozenfood"
DRAW = 3600  # what the depot's rounds send the shop each day


class SaveStub:
    def __init__(self, logs, plans, contracts):
        self.root = {
            "Hour": 12, "Minute": 0,
            "BuildingRegistrations": [
                {"RentedByPlayer": True, "StreetName": site[0], "StreetNumber": site[1],
                 "itemInstances": [], "deliveryTransactions": logs.get(site, [])}
                for site in (FACTORY, DEPOT, SHOP)
            ],
            "logisticsManagerPlans": plans,
            "importPartnerships": contracts,
        }

    def items(self, value):
        return value or []

    def deref(self, value):
        return value

    def address(self, value):
        return value


def tx(day, amount):
    return {"dayOfDelivery": day,
            "deliveryItems": [{"itemName": FOOD, "amountDelivered": amount}]}


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


def depot_supply(routed_share, contracts, stock=2700, import_days=(), route=None, target=7000,
                 route_from=4, arrivals=(), sent_elsewhere=0, rhythm=None, truncated=False):
    """_supply() over a factory, a depot and a shop, and the businesses.

    Every day the depot sends the shop DRAW. From `route_from` each morning
    the factory's route brings `routed_share` of it, as the logistics round
    tops the depot back up to its target; on `import_days` the import lands
    what the contracts brought last week, and `arrivals` are (day, amount)
    one-offs nobody's route brought. The factory also ships `sent_elsewhere`
    a day to somewhere else. `truncated` fills the depot's log to its sixty
    transactions with the route's day-3 arrival fallen off the end, as a
    full log opens part-way through a day. `route` sets the route up (by
    default, where it brings something); `rhythm` is the depot's weekday
    profile, by weekday index.
    """
    logs = {FACTORY: [], DEPOT: []}
    for day in range(3, DAY):
        if routed_share and day >= route_from and not (truncated and day == 3):
            logs[DEPOT].append(tx(day, round(DRAW * routed_share)))
        sent = (round(DRAW * routed_share) if routed_share and day >= route_from else 0)
        if sent + sent_elsewhere:
            logs[FACTORY].append(tx(day, -(sent + sent_elsewhere)))
        if day in import_days:
            logs[DEPOT].append(tx(day, sum(
                p["products"][0]["amountOrderedLastWeek"] for p in contracts)))
        for when, amount in arrivals:
            if when == day:
                logs[DEPOT].append(tx(day, amount))
        logs[DEPOT].append(tx(day, -DRAW))
    if truncated:
        filler = {"dayOfDelivery": 9, "deliveryItems": [{"itemName": "ba:itemname_other",
                                                          "amountDelivered": 0}]}
        logs[DEPOT] += [filler] * (60 - len(logs[DEPOT]))
    plans = [plan(DEPOT, SHOP, 5000)]
    if routed_share if route is None else route:
        plans.append(plan(FACTORY, DEPOT, target))
    save = SaveStub(logs, plans, contracts)

    def business(site, name, kind, status, lines):
        return {"key": site_key(site), "name": name, "code": "", "neighbourhood": "",
                "type": kind, "typeSlug": kind, "status": status, "lines": lines}

    businesses = [
        business(FACTORY, "Food Factory", "factory", "support",
                 [{"slug": FOOD, "item": "Frozen Food", "units": 9600, "rate": 0, "price": 0}]),
        business(DEPOT, "Depot", "warehouse", "support",
                 [{"slug": FOOD, "item": "Frozen Food", "units": stock, "rate": 0, "price": 0}]),
        business(SHOP, "Shop", "supermarket", "retail",
                 [{"slug": FOOD, "item": "Frozen Food", "units": 500, "rate": DRAW, "price": 1}]),
    ]
    if rhythm:
        businesses[1]["rhythm"] = [{"day": WEEKDAYS[wd], "index": index}
                                   for wd, index in enumerate(rhythm)]
    return _supply(save, Names({}), businesses, DAY, {}), businesses


class SupplyOnly(list):
    """The businesses as the supply findings index them, with none of their own
    findings: a loop over them sees nothing."""

    def __iter__(self):
        return iter(())


class RoutedSupplyTests(unittest.TestCase):
    def test_a_depot_fed_daily_by_a_factory_is_not_short(self):
        """The Costy Co case: the factory's route brings back each morning what
        left the day before, and a Smart Delivery backup at 5,200 brought
        nothing because the depot was always full. The import has nothing to
        cover, so the row is ok: no order finding, no catch-up, no stockout,
        and the goods-flow node agrees."""
        row, item = depot_row(1.0, [contract(5200, 0, smart=True)])
        self.assertEqual((row["perDay"], row["routed"], row["importPerDay"]), (DRAW, DRAW, 0))
        self.assertEqual((row["level"], row["reason"], row["covered"]), ("ok", None, True))
        self.assertEqual((row["orderFit"], row["coverFit"]), ("ok", "ok"))
        self.assertEqual(row["weekNeed"], 0)
        self.assertFalse(row["catchUp"])
        self.assertIsNone(row["runsOut"])
        self.assertEqual((item["fit"], item["short"], item["low"]), ("ok", False, False))

    def test_a_route_within_noise_of_the_draw_covers_it(self):
        """The route's average and the draw's are two measurements; 97% of the
        draw is the route covering it, not 108 a day for the import."""
        row, _item = depot_row(0.97, [contract(5200, 0, smart=True)])
        self.assertEqual((row["covered"], row["importPerDay"], row["weekNeed"]), (True, 0, 0))
        self.assertEqual((row["level"], row["orderFit"]), ("ok", "ok"))

    def test_a_paused_backup_beside_a_covering_route_is_ok(self):
        row, _item = depot_row(1.0, [contract(5200, 0, smart=True, active=False)])
        self.assertTrue(row["paused"])
        self.assertEqual((row["level"], row["reason"], row["covered"]), ("ok", None, True))

    def test_a_route_covering_part_of_the_draw_leaves_the_rest_to_the_import(self):
        """Half the draw comes by route, so a week asks the import for half of
        it: 12,600, which a 13,000 plain order covers. The import's own day
        is left out of the route's average."""
        row, _item = depot_row(0.5, [contract(13000, 13000, smart=False)],
                               stock=9000, import_days=(7,))
        self.assertEqual((row["routed"], row["importPerDay"]), (DRAW // 2, DRAW // 2))
        self.assertEqual(row["weekNeed"], 7 * DRAW // 2)
        self.assertEqual((row["orderFit"], row["level"], row["covered"]), ("ok", "ok", False))

    def test_a_partial_route_leaves_the_node_the_import_s_days(self):
        """Half the draw by route and 2,700 on the shelf: the import's 1,800 a
        day builds up over the 3.5 days to its drop, 6,300, so the goods-flow
        node reads the depot low, not the one day a covering route asks."""
        _row, item = depot_row(0.5, [contract(13000, 13000, smart=False)], import_days=(7,))
        self.assertEqual((item["need"], item["low"]), (6300, True))

    def test_a_busy_day_does_not_make_a_mostly_routed_depot_low(self):
        """A 90% route, Saturday at 1.6 times a quiet day and 6,000 on the shelf:
        the row's own walk reaches the drop with room to spare, so the node
        does not read the depot low by counting every day as a Saturday."""
        rhythm = [90] * 6 + [160]
        row, item = depot_row(0.9, [contract(26000, 26000, smart=False)], stock=6000,
                              import_days=(7,), rhythm=rhythm)
        self.assertEqual((row["coverFit"], row["level"]), ("ok", "ok"))
        self.assertEqual((item["need"], item["low"]), (row["carry"], False))
        self.assertLess(item["need"], 6000)

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
        # The rest of today at the import's 1,800 a day, then day 11's drop.
        self.assertEqual(row["carry"], 900)

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

    def test_an_import_before_the_route_s_first_arrival_does_not_dilute_it(self):
        """The import landed on day 4 and the route's first round on day 5:
        the route still brings the whole draw on the days it ran."""
        row, _item = depot_row(1.0, [contract(5200, 5200, smart=True, due=11)],
                               import_days=(4,), route_from=5)
        self.assertEqual((row["routed"], row["covered"], row["level"]), (DRAW, True, "ok"))

    def test_the_import_s_own_arrivals_are_not_counted_as_the_route(self):
        """A route is set up but the factory sent nothing: the only arrival is
        the import's, which is not the route's to claim."""
        row, _item = depot_row(0.0, [contract(5000, 5000, smart=False)],
                               import_days=(7,), route=True)
        self.assertEqual((row["routed"], row["level"], row["reason"]), (0, "critical", "order"))
        # A route with no arrivals on record claims nothing either.
        row, _item = depot_row(0.0, [contract(5000, 5000, smart=False)], route=True)
        self.assertEqual(row["routed"], 0)

    def test_a_one_off_arrival_is_claimed_no_further_than_the_senders_sent(self):
        """The route brings 720 a day; the factory ships 5,000 a day elsewhere
        too, and 14,000 land on day 5 from no route (a contract since
        removed). The route can claim no more that day than the factory
        sent: 5,720 on day 5 and 720 on days 4, 6, 8 and 9 (the route's
        first day here is day 4, and day 7 is the import's): 1,720 a day.
        That over-reads the route, but most of the import's week stays the
        import's, and a 5,200 level against it is still critical."""
        row, _item = depot_row(0.2, [contract(5200, 0, smart=True)],
                               arrivals=((5, 14000),), sent_elsewhere=5000)
        self.assertEqual(row["routed"], 1720)
        self.assertEqual((row["covered"], row["level"], row["reason"]), (False, "critical", "order"))

    def test_a_route_claims_no_more_than_its_target(self):
        """A morning round tops the depot up to its target and brings no more,
        so arrivals past it (a hand delivery, say) are not the route's."""
        row, _item = depot_row(1.0, [contract(5200, 0, smart=True)], target=2000)
        self.assertEqual((row["routed"], row["importPerDay"]), (2000, DRAW - 2000))

    def test_the_import_s_week_is_the_stock_balance(self):
        """The factory can send only 2,988 a day and the route target is high,
        so a quiet day's surplus stays in the depot for the busy one. A week
        asks the import for the draw less what the route brought, 7 x 612 =
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
        # Wednesday afternoon, Thursday and Friday leave 2,700 on top of the
        # 2,700 held; Saturday takes 6,480 beyond the route.
        self.assertEqual(row["catchUp"], 6480 - 2700 - 2700)

    def test_the_alert_for_a_covered_line_names_the_route_not_the_drop(self):
        """The Saturday above, with the backup active: the gap is the day before
        the route's next round, not the days to Tuesday's drop, and the import
        answers for nothing a day."""
        rhythm = [70] * 6 + [280]
        row, _item = depot_row(1.0, [contract(5200, 0, smart=True, due=16)], rhythm=rhythm)
        supply = {"graph": {"links": []}, "shops": [], "idle": [], "nextImportWeekday": None,
                  "imports": [dict(row, s=0)]}
        result = _alerts(SupplyOnly([{"key": site_key(DEPOT), "name": "Depot"}]),
                         supply, [], [], [], [], [], DAY, 0.0)
        texts = [a["text"] for a in result["lines"] + result["minor"]["rows"]]
        [text] = [t for t in texts if "Frozen Food" in t]
        self.assertIn("a route brings the week's draw (3,600/day)", text)
        # The headline is cut at the first comma: when it runs dry, and why.
        self.assertRegex(text, r"^Frozen Food[^,;]* runs dry [^,;]+, before the route's next round; ")
        self.assertNotIn("import", text)

    def test_the_shortfall_kind_is_named_for_a_route_s_round_too(self):
        """The Saturday above stays a `shortfall`, so a player's switch for the
        kind keeps what it meant; the kind's description, and the line three
        of them condense into, name the next import or route round, or the
        next delivery, rather than an import alone."""
        self.assertNotIn("import", SUMMARIES["shortfall"])
        [kind] = [line for line in TEMPLATE.splitlines() if 'id:"shortfall"' in line]
        self.assertIn("import or route round", kind)

    def test_a_paused_backup_beside_a_covering_route_is_judged_over_a_week(self):
        """The same Saturday with the backup paused: there is no drop to reach,
        so the shelf is judged over a week, and it still runs dry."""
        rhythm = [70] * 6 + [280]
        row, _item = depot_row(1.0, [contract(5200, 0, smart=True, active=False)], rhythm=rhythm)
        self.assertEqual((row["covered"], row["paused"]), (True, True))
        self.assertEqual((row["coverFit"], row["runsOut"]), ("short", "Saturday"))
        self.assertEqual((row["level"], row["reason"]), ("critical", "shortfall"))
        self.assertEqual(row["catchUp"], 6480 - 2700 - 2700)

    def test_an_import_s_day_is_never_the_route_s_first(self):
        """The import landed on day 4 while the factory shipped elsewhere; the
        route to this depot began on day 7. Day 4 is the import's, so the
        route is read from day 7, not diluted by days 5 and 6."""
        row, _item = depot_row(1.0, [contract(5200, 5200, smart=True, due=11)],
                               import_days=(4,), route_from=7, sent_elsewhere=5000)
        self.assertEqual((row["routed"], row["covered"], row["level"]), (DRAW, True, "ok"))

    def test_a_full_log_s_partial_oldest_day_is_left_out(self):
        """The depot's log is at its sixty and its oldest day, day 3, has lost
        the route's arrival: that day is not read as a day the route brought
        nothing."""
        full, _item = depot_row(1.0, [contract(5200, 0, smart=True)], route_from=3,
                                truncated=True)
        self.assertEqual((full["routed"], full["covered"]), (DRAW, True))

    def test_a_route_set_up_this_week_is_read_from_its_first_round(self):
        """The route began on day 7; the days before it are not days it
        brought nothing."""
        row, _item = depot_row(1.0, [contract(5200, 0, smart=True, due=12)], route_from=7)
        self.assertEqual((row["routed"], row["covered"], row["level"]), (DRAW, True, "ok"))

    def test_what_leaves_for_the_shops_leaves_out_the_import_s_day(self):
        """The day the import lands, the log nets its arrival off what left, so
        the shops' 3,600 that day read as nothing and the week as 21,600. That
        day is left out, as the route's own figure leaves it out: the week the
        Weekly imports table sizes the import on is 25,200, the Stock view's."""
        supply, _ = depot_supply(0.0, [contract(5000, 5000, smart=False)], import_days=(7,))
        self.assertEqual(supply["factories"]["depotOther"][1][FOOD], 7 * DRAW)
        row = next(r for r in supply["imports"] if r["s"] == 1)
        self.assertEqual(row["weekNeed"], 7 * DRAW)

    def test_a_routed_line_s_other_use_is_read_gross(self):
        """A route brings half of what leaves every day, the import's day too:
        read net, the log would take the route off what the shops draw, and
        the table would take it off again. Read gross it is the shops' 25,200."""
        supply, _ = depot_supply(0.5, [contract(5000, 5000, smart=False)],
                                 import_days=(7,), route_from=3)
        self.assertEqual(supply["factories"]["depotOther"][1][FOOD], 7 * DRAW)
        self.assertEqual(supply["factories"]["depots"][1][FOOD]["routed"], 7 * DRAW // 2)

    def test_a_depot_line_a_route_feeds_with_no_import_is_given_to_the_table(self):
        """No import contract, and the factory's route brings the whole draw:
        the line is listed with its route, so the table asks for no import."""
        supply, _ = depot_supply(1.0, [])
        self.assertFalse(supply["imports"])
        self.assertEqual(dict(supply["factories"]["depotRoutes"]),
                         {1: {FOOD: {"routed": 7 * DRAW, "covered": True, "drawWeek": 7 * DRAW}}})
        # A depot line an import covers is not listed twice.
        supply, _ = depot_supply(1.0, [contract(5200, 0, smart=True)])
        self.assertEqual(dict(supply["factories"]["depotRoutes"]), {})

    def test_a_depot_fed_only_by_imports_reads_as_before(self):
        """No route into the depot: the whole draw is the import's, and a 5,000
        order against a 25,200 week is short, as on main. The figures are
        main's, pinned."""
        row, item = depot_row(0.0, [contract(5000, 5000, smart=False)], import_days=(7,))
        self.assertEqual((row["perDay"], row["routed"], row["importPerDay"]), (DRAW, 0, DRAW))
        self.assertEqual((row["level"], row["reason"], row["covered"]), ("critical", "order", False))
        self.assertEqual((row["orderFit"], row["coverFit"]), ("short", "short"))
        self.assertEqual(row["weekNeed"], 7 * DRAW)
        self.assertEqual((row["catchUp"], row["runsOut"], row["cover"], row["shortBy"]),
                         (9900, "Thursday", 0.8, 2.75))
        self.assertEqual((item["fit"], item["short"], item["low"], item["need"], item["cycleNeed"]),
                         ("short", True, True, 12600, 7 * DRAW))


class RoutedFactoryViewTests(unittest.TestCase):
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

    def test_the_no_import_finding_counts_what_the_route_leaves(self):
        """Half the week by route: the finding counts the depot's weeks against
        the other half and says the route brings the rest."""
        row = self.need(route_only=(840, False, 1680), target=300)
        row["depotStock"] = 1260
        businesses = [{"key": site_key(("factory", 0)), "name": "Factory"},
                      {"key": "depot#1", "name": "Depot"}]
        [note] = _feed_notes(businesses, {"sites": [{"s": 0, "needs": [row]}]}, set())
        self.assertIn("holds 1,260, 1.5 weeks of the 840 a week the factories eat "
                      "beyond the 840 a week a route brings", note["text"])

    def test_a_route_covering_a_starved_draw_does_not_cover_the_need(self):
        """The depot draws only 200 a week because the factory is starved; a
        route bringing those 200 covers the draw, not the 1,680 the machine
        needs, so the import still answers for 1,480."""
        row = self.need((200, True, 200))
        self.assertEqual((row["importFit"], row["importCovered"], row["importNeed"]),
                         ("short", False, 1480))


if __name__ == "__main__":
    unittest.main()
