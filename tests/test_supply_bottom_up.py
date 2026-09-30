"""The goods' flow worked out from the sources, on synthetic fixtures only.

_supply() sizes every line bottom-up: what the shops sell and the machines
eat, carried up the logistics plans, against what the imports, the
wholesale deliveries and the factories' machines bring. What a site merely
holds is no supply, and the delivery log sizes nothing. These are the three
reported symptoms, each as a small company:

A. a warehouse fed by a factory route: read off what the factory makes, not
   off what the log saw arrive; and a young shop whose top-up is already
   below its sales;
B. a new shop topped up from a warehouse that has none of the item coming;
C. a Smart Delivery import beside a factory route that covers the week.
"""
import unittest

from ba_dashboard import plain, Names, _import_notes, _shelf_notes, _supply
from test_supply_facts import BEER, RECIPES, WATER, Company

WH, BREWERY, SHOP, CAFE = ("wh_road", 1), ("brew_lane", 2), ("main_street", 3), ("bean_street", 4)
FACT_FIELDS = ("st", "why", "lvl", "cad", "use", "need", "have", "setTo")


class Chain(Company):
    """A Company whose recipe table can be swapped: one bottling machine makes
    `per_hour` beer an hour, 24 hours a day (RECIPES: 30, so 720 a day)."""

    def __init__(self, per_hour=30, **options):
        super().__init__(**options)
        self.recipes = {BEER: dict(RECIPES[BEER], out=per_hour)}
        self.names = Names({})

    def run(self):
        self.business_list = self.businesses()
        self.supply = _supply(self.save(), self.names, self.business_list, self.day, {}, self.recipes)
        return self.supply

    def verdict(self, addr, slug=BEER):
        fact = self.fact(addr, slug)
        return {k: fact.get(k) for k in FACT_FIELDS} if fact else None

    def notes(self, addr, group):
        """The findings of `group` on the site at `addr`."""
        name = next(s["name"] for s in self.sites if s["addr"] == addr)
        found = (_import_notes(self.business_list, self.supply, set())
                 + _shelf_notes(self.business_list, self.supply, set()))
        return [n for n in found if n["group"] == group and n["site"] == name]


def warehouse_fed_by_brewery(machines, target=2000, wh_units=100, brewery_units=500, log=None):
    """A warehouse with no import, topped up to `target` each morning by a
    brewery with `machines` machines (720 a day each), sending a shop that
    sells 300 a day. `log` fills in a delivery log on the Chain."""
    c = Chain()
    c.site(WH, "Warehouse")
    c.hold(WH, BEER, wh_units)
    c.factory(BREWERY, "Brewery", machines=machines)
    c.hold(BREWERY, BEER, brewery_units)
    c.shop(SHOP, "Shop")
    c.hold(SHOP, BEER, 400, 300)
    c.plan(BREWERY, WH, BEER, target)
    c.plan(WH, SHOP, BEER, 800)
    if log:
        log(c)
    c.run()
    return c


def short_log(c):
    """One day of rounds on record, far fewer than a week."""
    c.ship(c.day - 1, BREWERY, WH, {BEER: 90})
    c.ship(c.day - 1, WH, SHOP, {BEER: 40})


def full_log(c):
    """The warehouse's log at its sixty entries: a one-off 20,000 landing and
    rounds of odd sizes, none of them what the chain uses."""
    c.ship(c.day - 6, None, WH, {BEER: 20000})
    for i in range(59):
        day = c.day - 5 + i % 5
        c.ship(day, BREWERY, WH, {BEER: 7 + i})
    for day in range(c.day - 5, c.day):
        c.ship(day, WH, SHOP, {BEER: 1000})


class WarehouseFedByRouteTests(unittest.TestCase):
    """Symptom A: a warehouse with no import, a factory route into it."""

    def test_a_route_from_a_factory_that_only_holds_asks_for_an_import(self):
        """The brewery makes no beer, it only holds 500: the route cannot
        bring the 2,100 a week the shop sells, so the warehouse has nothing
        bringing it and asks for an import of the week with the margin,
        2,415 rounded up. The two sites hold 600, under the week: a
        warning, and an order finding on the warehouse."""
        c = warehouse_fed_by_brewery(machines=0)
        self.assertEqual(c.verdict(WH), {"st": "noplan", "why": "order", "lvl": "warn", "cad": "weekly",
                                         "use": 2100, "need": 2415, "have": None, "setTo": 2420})
        [note] = c.notes(WH, "order")
        self.assertIn("import 2,420 a week", plain(note["text"]))

    def test_the_missing_import_is_said_once(self):
        """The brewery sends its 500 on to the warehouse and nothing brings it
        any either; the warehouse's own finding says what is missing, so the
        brewery's fact is a note, not a second finding asking for the same
        import."""
        c = warehouse_fed_by_brewery(machines=0)
        self.assertEqual((c.verdict(BREWERY)["st"], c.verdict(BREWERY)["lvl"]), ("noplan", "info"))
        self.assertEqual(c.notes(BREWERY, "order"), [])
        self.assertEqual(len(c.notes(WH, "order")), 1)

    def test_a_warehouse_holding_the_week_is_only_noted(self):
        """The same warehouse holding 5,000: the import is still what it
        lacks, but nothing runs out this week, so it is no finding."""
        c = warehouse_fed_by_brewery(machines=0, wh_units=5000)
        self.assertEqual((c.verdict(WH)["st"], c.verdict(WH)["lvl"]), ("noplan", "info"))
        self.assertEqual(c.notes(WH, "order"), [])

    def test_a_route_from_a_factory_that_makes_enough_is_judged_on_its_target(self):
        """The brewery's machine makes 720 a day: the route is the whole of the
        warehouse's supply, judged daily, its 2,000 target against the
        shop's 300 a day."""
        c = warehouse_fed_by_brewery(machines=1)
        self.assertEqual(c.verdict(WH), {"st": "covered", "why": "route", "lvl": "ok", "cad": "daily",
                                         "use": 300, "need": 345, "have": 2000, "setTo": None})
        self.assertEqual(c.fact(WH, BEER)["from"], c.index(BREWERY))
        self.assertEqual(c.notes(WH, "order") + c.notes(WH, "topup"), [])

    def test_a_target_below_the_busiest_day_is_a_top_up_to_raise(self):
        """The same with the route's target at 200: the busiest day sends on
        300, so the target is short and is raised to 345, rounded up."""
        c = warehouse_fed_by_brewery(machines=1, target=200)
        self.assertEqual(c.verdict(WH), {"st": "short", "why": "target", "lvl": "critical", "cad": "daily",
                                         "use": 300, "need": 345, "have": 200, "setTo": 350})
        [note] = c.notes(WH, "topup")
        self.assertIn("raise the top-up to 350", plain(note["text"]))

    def test_the_delivery_log_changes_no_verdict(self):
        """None of the above reads the log: a day of rounds, or a full log
        with a one-off landing, gives every verdict an empty log gives."""
        for machines, target in ((0, 2000), (1, 2000), (1, 200)):
            empty = warehouse_fed_by_brewery(machines, target)
            for log in (short_log, full_log):
                with self.subTest(machines=machines, target=target, log=log.__name__):
                    logged = warehouse_fed_by_brewery(machines, target, log=log)
                    self.assertEqual(logged.verdict(WH), empty.verdict(WH))
                    self.assertEqual(logged.verdict(SHOP), empty.verdict(SHOP))


class YoungShopTests(unittest.TestCase):
    """Symptom A, the shelf: a shop two trading days old."""

    def shop(self, log=None):
        c = Chain()
        c.site(WH, "Warehouse")
        c.hold(WH, BEER, 5000)
        c.contract(WH, BEER, 5000)
        c.shop(SHOP, "Shop", trade_days=2)
        c.hold(SHOP, BEER, 20, 100)
        c.plan(WH, SHOP, BEER, 50)
        if log:
            log(c)
        c.run()
        return c

    def test_a_young_shop_already_outrunning_its_target_is_short(self):
        """Two days old, but it has sold 100 a day against a 50 top-up: too new
        to judge its week, not too new to say the top-up is too low. The
        figure to set is 115, rounded up."""
        c = self.shop()
        self.assertEqual(c.verdict(SHOP), {"st": "short", "why": "target", "lvl": "critical", "cad": "daily",
                                           "use": 100, "need": 115, "have": 50, "setTo": 120})
        self.assertEqual(len(c.notes(SHOP, "outruns")), 1)

    def test_the_log_does_not_change_it(self):
        def rounds(c):
            c.ship(c.day - 1, WH, SHOP, {BEER: 50})
        self.assertEqual(self.shop(rounds).verdict(SHOP), self.shop().verdict(SHOP))


class UnsourcedTests(unittest.TestCase):
    """Symptom B: a new café topped up to 45 a day from a warehouse."""

    def cafe(self, wh_units=0, imported=False):
        c = Chain()
        c.site(WH, "Warehouse")
        c.hold(WH, BEER, wh_units)
        if imported:
            c.contract(WH, BEER, 700)
        c.site(CAFE, "Cafe", status="retail", kind="ba:businesstype_coffeeshop", trade_days=1)
        c.plan(WH, CAFE, BEER, 45)
        c.run()
        return c

    def test_a_top_up_from_a_warehouse_with_nothing_coming_is_unsourced(self):
        """The warehouse holds none, imports none, makes none and is routed
        none: the café's top-up can never fill. The shelf says so, naming the
        warehouse, and the warehouse carries the import it lacks: a week of
        the target, 315, rounded up."""
        c = self.cafe()
        fact = c.fact(CAFE, BEER)
        self.assertEqual((fact["st"], fact["why"], fact["lvl"], fact["from"]),
                         ("noplan", "source", "warn", c.index(WH)))
        [note] = c.notes(CAFE, "unsourced")
        self.assertIn("nothing brings it to Warehouse", plain(note["text"]))
        wh = c.verdict(WH)
        self.assertEqual((wh["st"], wh["why"], wh["cad"], wh["use"], wh["setTo"]),
                         ("noplan", "order", "weekly", 315, 320))

    def test_stock_or_an_import_at_the_warehouse_is_a_source(self):
        for options in ({"wh_units": 200}, {"imported": True}):
            with self.subTest(**options):
                c = self.cafe(**options)
                self.assertNotEqual(c.fact(CAFE, BEER)["st"], "noplan")
                self.assertEqual(c.notes(CAFE, "unsourced"), [])

    @staticmethod
    def priced(trade_days, slug=BEER):
        """A café pricing `slug`, never held and never sold, with no top-up,
        no wholesale delivery and no import. Its type's help page lists beer
        among the goods it primarily sells."""
        c = Chain()
        c.names = Names({"help_ba:businesstype_coffeeshop_content":
                         "Businesses of this type primarily sell:\n* [Beer](products-beer)\n"})
        c.site(CAFE, "Cafe", status="retail", kind="ba:businesstype_coffeeshop", trade_days=trade_days)
        c.hold(CAFE, slug, 0, 0)
        c.run()
        return c

    def test_a_new_shop_pricing_its_own_goods_with_nothing_bringing_them_is_told(self):
        c = self.priced(trade_days=2)
        fact = c.fact(CAFE, BEER)
        self.assertEqual((fact["st"], fact["why"], fact["lvl"], fact["setTo"]),
                         ("noplan", "source", "warn", None))
        [note] = c.notes(CAFE, "unsourced")
        self.assertIn("is priced here but nothing brings it", plain(note["text"]))

    def test_a_shop_trading_for_weeks_that_never_stocked_it_is_only_noted(self):
        """Priced and never held after a fortnight of trading: most likely a
        choice not to stock it."""
        c = self.priced(trade_days=14)
        self.assertEqual((c.fact(CAFE, BEER)["st"], c.fact(CAFE, BEER)["lvl"]), ("noplan", "info"))
        self.assertEqual(c.notes(CAFE, "unsourced"), [])

    def test_goods_not_of_its_type_are_no_finding(self):
        """Water is not among a café's own goods: a price on it says nothing."""
        c = self.priced(trade_days=2, slug=WATER)
        self.assertNotEqual(c.fact(CAFE, WATER)["st"], "noplan")
        self.assertEqual(c.notes(CAFE, "unsourced"), [])


class SmartDeliveryBesideARouteTests(unittest.TestCase):
    """Symptom C: a Smart Delivery import of 1,000 beside a brewery's route
    that tops the warehouse up to 5,000, the shops selling 500 a day."""

    def chain(self, per_hour, level=1000):
        c = Chain(per_hour=per_hour)
        c.site(WH, "Warehouse")
        c.hold(WH, BEER, 3000)
        c.factory(BREWERY, "Brewery")
        c.shop(SHOP, "Shop")
        c.hold(SHOP, BEER, 400, 500)
        c.plan(BREWERY, WH, BEER, 5000)
        c.plan(WH, SHOP, BEER, 800)
        c.contract(WH, BEER, level, smart=True)
        c.run()
        return c

    def test_a_route_that_covers_the_week_asks_nothing_of_the_import(self):
        """The machine makes 720 a day, over the 575 the shops need with the
        margin: the import is a backup, with nothing to raise."""
        c = self.chain(per_hour=30)
        wh = c.verdict(WH)
        self.assertEqual((wh["st"], wh["why"], wh["setTo"]), ("covered", "route", None))
        self.assertEqual(c.notes(WH, "order"), [])

    def test_a_route_that_cannot_cover_it_leaves_the_rest_to_the_import(self):
        """The machine makes 200 a day: 300 a day is left to the import,
        2,100 a week, which a 1,000 level does not bring."""
        c = self.chain(per_hour=200 / 24)
        wh = c.verdict(WH)
        self.assertEqual((wh["st"], wh["why"], wh["use"]), ("short", "order", 2100))
        self.assertIsNotNone(wh["setTo"])
        self.assertEqual(len(c.notes(WH, "order")), 1)

    def test_the_level_suggested_is_enough_once_set(self):
        """Setting the Smart Delivery level to the figure the fact suggests
        settles it: the fact is no longer short."""
        suggested = self.chain(per_hour=200 / 24).verdict(WH)["setTo"]
        self.assertNotEqual(self.chain(per_hour=200 / 24, level=suggested).verdict(WH)["st"], "short")


class RouteBehindAnImportTests(unittest.TestCase):
    """The scenarios of the removed held-upstream gate, bottom-up: a
    warehouse with a 1,000 Smart Delivery import, 9,000 on the shelf, a shop
    selling 500 a day, and a brewery's route topping it up to 10,000."""

    def chain(self, machines=1, brewery_units=0, target=10000, active=True, wh_units=9000,
              second=None):
        c = Chain()
        c.site(WH, "Warehouse")
        c.hold(WH, BEER, wh_units)
        c.factory(BREWERY, "Brewery", machines=machines)
        c.hold(BREWERY, BEER, brewery_units)
        c.shop(SHOP, "Shop")
        c.hold(SHOP, BEER, 1500, 500)
        c.plan(WH, SHOP, BEER, 2000)
        if target:
            c.plan(BREWERY, WH, BEER, target)
        if second:
            c.factory(CAFE, "Second Brewery")
            c.plan(CAFE, WH, BEER, second)
        c.contract(WH, BEER, 1000, smart=True, active=active)
        c.run()
        row = next(r for r in c.supply["imports"] if r["s"] == c.index(WH))
        return c, row

    def test_a_brewery_that_makes_enough_leaves_the_import_a_backup(self):
        c, row = self.chain()
        self.assertEqual((row["covered"], row["orderFit"], row["level"]), (True, "ok", "ok"))
        self.assertEqual(c.verdict(WH)["st"], "covered")
        self.assertEqual(c.notes(WH, "order"), [])

    def test_a_brewery_that_only_holds_leaves_the_order_judged(self):
        """20,000 in the brewery and no machine making beer: the week is the
        import's, 3,500, and 1,000 is short."""
        c, row = self.chain(machines=0, brewery_units=20000)
        self.assertEqual((row["routed"], row["orderFit"], row["reason"]), (0, "short", "order"))
        self.assertEqual((c.verdict(WH)["st"], c.verdict(WH)["why"]), ("short", "order"))
        self.assertEqual(len(c.notes(WH, "order")), 1)

    def test_without_a_route_the_order_is_judged(self):
        c, row = self.chain(target=0)
        self.assertEqual(row["orderFit"], "short")
        self.assertEqual(len(c.notes(WH, "order")), 1)

    def test_a_route_with_a_small_target_cannot_bring_the_week(self):
        """A round a day tops the warehouse up to 100: 700 a week, however
        much the brewery makes, against the week's 3,500."""
        c, row = self.chain(target=100)
        self.assertEqual((row["routed"], row["orderFit"]), (100, "short"))
        self.assertEqual((c.verdict(WH)["st"], c.verdict(WH)["why"]), ("short", "order"))

    def test_a_paused_backup_beside_a_route_that_refills_each_morning_is_ok(self):
        """600 on the shelf at 500 a day, but the route tops it back up every
        morning from a brewery making 720 a day: nothing to resume."""
        c, row = self.chain(wh_units=600, active=False)
        self.assertEqual((row["paused"], row["level"], row["reason"]), (True, "ok", None))
        self.assertEqual((c.verdict(WH)["st"], c.verdict(WH)["why"]), ("covered", "route"))

    def test_a_paused_import_beside_a_route_short_of_the_day_is_paused(self):
        """With the import paused the route is the whole supply, and a top-up
        to 400 does not cover a 500 day: resume the import."""
        c, row = self.chain(target=400, wh_units=600, active=False)
        self.assertEqual(row["reason"], "paused")
        self.assertEqual(c.verdict(WH)["st"], "paused")

    def test_two_small_routes_do_not_add_up_to_a_day(self):
        """Two breweries each top the warehouse up to 300. A top-up fills to
        its level, so the second finds the first's 300 and brings nothing:
        the shelf never starts a day above 300 of a 500 day, and the paused
        import is the finding."""
        c, row = self.chain(target=300, second=300, wh_units=600, active=False)
        self.assertEqual(row["reason"], "paused")
        self.assertEqual(c.verdict(WH)["st"], "paused")


class ParkedGoodsTests(unittest.TestCase):
    """What the removed depotOther read off the log, bottom-up: a hub imports
    water for the brewery's line (240 a day) and the brewery passes some on
    to a depot where nothing draws on it."""

    def test_goods_parked_where_nothing_draws_add_nothing_to_the_week(self):
        c = Chain()
        c.site(WH, "Hub")
        c.hold(WH, WATER, 3000)
        c.contract(WH, WATER, 2380)
        c.factory(BREWERY, "Brewery")
        c.site(CAFE, "Parking Depot")
        c.plan(WH, BREWERY, WATER, 400)
        c.plan(BREWERY, CAFE, WATER, 700)
        c.run()
        fact = c.fact(WH, WATER)
        self.assertEqual(fact["parts"], {"lines": 1680, "sites": 0, "route": 0})
        self.assertEqual(fact["use"], 1680)


if __name__ == "__main__":
    unittest.main()
