"""A depot line topped up by the company's own factory, on synthetic fixtures only.

What leaves a depot is not all the import's to bring: a factory on a logistics
route that refills the depot every morning covers its share, and a Smart
Delivery import beside it brings nothing while the depot stays full. The
import row judges its order, its cover and its catch-up on the rest of the
draw. A depot fed by imports alone reads exactly as before.
"""
import unittest

from ba_dashboard import Names, _supply, site_key

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


def contract(amount, last_week, smart):
    """An import to the depot, next due on day 14 (the weekday of day 7)."""
    partnership = {"importAddress": ("pier", 2), "isActive": True, "nextDeliveryDay": 14,
                   "isRepeatingOrder": True,
                   "products": [{"itemName": FOOD, "amount": amount,
                                 "amountOrderedLastWeek": last_week, "assignedWarehouse": DEPOT}]}
    if smart:
        partnership["isTarget"] = True
    return partnership


def depot_row(routed_share, contracts, stock=2700, import_days=(), route=None, target=7000):
    """_supply() over a factory, a depot and a shop; returns the depot's import
    row and its node in the goods-flow graph.

    Every day the depot sends the shop DRAW. Each morning the factory's route
    brings `routed_share` of the day before's draw, as the logistics round
    tops the depot back up to its target; on `import_days` the import lands
    what the contracts brought last week. The log opens on day 3 with that
    day's round out and no arrival, as a site's last sixty transactions can
    open part-way through a day. `route` sets the route up (by default,
    where it brings something).
    """
    logs = {FACTORY: [], DEPOT: []}
    for day in range(3, DAY):
        if routed_share and day > 3:
            logs[DEPOT].append(tx(day, round(DRAW * routed_share)))
            logs[FACTORY].append(tx(day, -round(DRAW * routed_share)))
        if day in import_days:
            logs[DEPOT].append(tx(day, sum(
                p["products"][0]["amountOrderedLastWeek"] for p in contracts)))
        logs[DEPOT].append(tx(day, -DRAW))
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
        self.assertEqual((row["level"], row["reason"]), ("ok", None))
        self.assertEqual((row["orderFit"], row["coverFit"]), ("ok", "ok"))
        self.assertEqual(row["weekNeed"], 0)
        self.assertFalse(row["catchUp"])
        self.assertIsNone(row["runsOut"])
        self.assertEqual((item["fit"], item["short"], item["low"]), ("ok", False, False))

    def test_a_route_covering_part_of_the_draw_leaves_the_rest_to_the_import(self):
        """Half the draw comes by route, so a week asks the import for half of
        it: 12,600, which a 13,000 plain order covers."""
        row, _item = depot_row(0.5, [contract(13000, 13000, smart=False)],
                               stock=9000, import_days=(7,))
        self.assertEqual((row["routed"], row["importPerDay"]), (DRAW // 2, DRAW // 2))
        self.assertEqual(row["weekNeed"], 7 * DRAW // 2)
        self.assertEqual((row["orderFit"], row["level"]), ("ok", "ok"))

    def test_the_import_s_own_arrivals_are_not_counted_as_the_route(self):
        """A route is set up but the factory sent nothing: the only arrival is
        the import's, which is not the route's to claim."""
        row, _item = depot_row(0.0, [contract(5000, 5000, smart=False)],
                               import_days=(7,), route=True)
        self.assertEqual((row["routed"], row["level"], row["reason"]), (0, "critical", "order"))
        # A route with no arrivals on record claims nothing either.
        row, _item = depot_row(0.0, [contract(5000, 5000, smart=False)], route=True)
        self.assertEqual(row["routed"], 0)

    def test_a_route_claims_no_more_than_its_target(self):
        """A morning round tops the depot up to its target and brings no more,
        so arrivals past it (a hand delivery, say) are not the route's."""
        row, _item = depot_row(1.0, [contract(5200, 0, smart=True)], target=2000)
        self.assertEqual((row["routed"], row["importPerDay"]), (2000, DRAW - 2000))

    def test_a_depot_fed_only_by_imports_reads_as_before(self):
        """No route into the depot: the whole draw is the import's, and a 5,000
        order against a 25,200 week is short, as on main. The figures are
        main's, pinned."""
        row, item = depot_row(0.0, [contract(5000, 5000, smart=False)], import_days=(7,))
        self.assertEqual((row["perDay"], row["routed"], row["importPerDay"]), (DRAW, 0, DRAW))
        self.assertEqual((row["level"], row["reason"]), ("critical", "order"))
        self.assertEqual((row["orderFit"], row["coverFit"]), ("short", "short"))
        self.assertEqual(row["weekNeed"], 7 * DRAW)
        self.assertEqual((row["catchUp"], row["runsOut"], row["cover"], row["shortBy"]),
                         (9900, "Thursday", 0.8, 2.75))
        self.assertEqual((item["fit"], item["short"], item["low"], item["need"], item["cycleNeed"]),
                         ("short", True, True, 12600, 7 * DRAW))


if __name__ == "__main__":
    unittest.main()
