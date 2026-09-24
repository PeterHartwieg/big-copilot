"""A depot line topped up by the company's own factory, on synthetic fixtures only.

What leaves a depot is not all the import's to bring: a factory on a logistics
route that refills the depot every morning covers its share, and a Smart
Delivery import beside it brings nothing while the depot stays full. The
import row judges its order, its cover and its catch-up on the rest of the
draw. A depot fed by imports alone reads exactly as before.
"""
import unittest

from ba_dashboard import WEEKDAYS, Names, _supply, site_key

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


def depot_row(routed_share, contracts, stock=2700, import_days=(), route=None, target=7000,
              route_from=4, arrivals=(), sent_elsewhere=0, rhythm=None, truncated=False):
    """_supply() over a factory, a depot and a shop; returns the depot's import
    row and its node in the goods-flow graph.

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
    supply = _supply(save, Names({}), businesses, DAY, {})
    row = next(r for r in supply["imports"] if r["s"] == 1)
    node = next(n for n in supply["graph"]["nodes"] if n.get("id") == site_key(DEPOT))
    return row, next(i for i in node["items"] if i["item"] == "Frozen Food")


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
        sent: 5,720 on day 5, 720 on days 4, 6, 8 and 9, and nothing on day
        3, when the factory already shipped elsewhere but the route had not
        begun (day 7 is the import's): 1,433 a day. That over-reads the
        route, but most of the import's week stays the import's, and a 5,200
        level against it is still critical."""
        row, _item = depot_row(0.2, [contract(5200, 0, smart=True)],
                               arrivals=((5, 14000),), sent_elsewhere=5000)
        self.assertEqual(row["routed"], 1433)
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
        three times it: 2,700 on the shelf cannot carry that to Sunday's round.
        The week is covered; the day is not."""
        rhythm = [100, 100, 100, 100, 100, 100, 300]
        row, _item = depot_row(1.0, [contract(5200, 0, smart=True)], rhythm=rhythm)
        self.assertEqual((row["covered"], row["weekNeed"], row["orderFit"]), (True, 0, "ok"))
        self.assertEqual((row["coverFit"], row["runsOut"]), ("short", "Saturday"))
        self.assertEqual((row["level"], row["reason"]), ("critical", "shortfall"))

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


if __name__ == "__main__":
    unittest.main()
