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
import itertools
import unittest

from ba_dashboard import plain, Names, RECIPE_ITEMS, WEEKDAYS, _idle_notes, _import_notes, _order_says, _shelf_notes, _supply, _supply_fact
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
        # The company's weekday profile, by WEEKDAYS index (Sunday first), in
        # hundredths of an average day; None for a flat week.
        self.profile = None

    def run(self):
        self.business_list = self.businesses()
        rhythm = ({"customers": [{"day": WEEKDAYS[wd], "index": v} for wd, v in enumerate(self.profile)]}
                  if self.profile else {})
        self.supply = _supply(self.save(), self.names, self.business_list, self.day, rhythm, self.recipes)
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
        # The 600 the two hold last two days of the 300 a day: critical.
        self.assertEqual(c.verdict(WH), {"st": "noplan", "why": "order", "lvl": "critical", "cad": "weekly",
                                         "use": 2100, "need": 2415, "have": None, "setTo": 2420})
        [note] = c.notes(WH, "unsourced")
        self.assertIn("import 2,420 a week", plain(note["text"]))

    def test_the_missing_import_is_said_once(self):
        """The brewery sends its 500 on to the warehouse and nothing brings it
        any either; the warehouse's own finding says what is missing, so the
        brewery's fact is a note, not a second finding asking for the same
        import."""
        c = warehouse_fed_by_brewery(machines=0)
        self.assertEqual((c.verdict(BREWERY)["st"], c.verdict(BREWERY)["lvl"]), ("noplan", "info"))
        self.assertEqual(c.notes(BREWERY, "unsourced"), [])
        self.assertEqual(len(c.notes(WH, "unsourced")), 1)

    def test_a_warehouse_holding_weeks_is_still_told_how_long_it_lasts(self):
        """The same warehouse holding 5,000: the import is still what it
        lacks, and stock never hides that. The 5,500 held between it and the
        brewery passing its stock on last 18 days: a warning that says so and
        names the route, with the import to set."""
        c = warehouse_fed_by_brewery(machines=0, wh_units=5000)
        fact = c.fact(WH, BEER)
        self.assertEqual((fact["st"], fact["lvl"], fact["setTo"], fact["lasts"], fact["passes"]),
                         ("noplan", "warn", 2420, 18.3, c.index(BREWERY)))
        [note] = c.notes(WH, "unsourced")
        self.assertIn("the route from Brewery only passes on what it holds, about 18 days",
                      plain(note["text"]))

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

    # A café's own range, as its F1 help page lists it: coffee only.
    # A bar's range names beer and water as goods (a café's does not), and a
    # fee a bar charges, which is never stocked.
    CAFE_RANGE = Names({"help_ba:businesstype_coffeeshop_content":
                        "Businesses of this type primarily sell:\n* [Cup of Coffee](products-cupofcoffee)\n",
                        "help_ba:businesstype_bar_content":
                        "Businesses of this type primarily sell:\n* [Beer](products-beer)\n"
                        "* [Water](products-water)\n* [Cover Charge](fees-covercharge)\n"})
    FEE = "ba:itemname_covercharge"
    COFFEE = "ba:itemname_cupofcoffee"

    @classmethod
    def priced(cls, slugs=(BEER,), units=0, rate=0, trade_days=2):
        """A café pricing `slugs`, with no top-up, no wholesale delivery and
        no import; holding `units` of each, selling `rate` a day."""
        c = Chain()
        c.names = cls.CAFE_RANGE
        c.site(CAFE, "Cafe", status="retail", kind="ba:businesstype_coffeeshop", trade_days=trade_days)
        for slug in slugs:
            c.hold(CAFE, slug, units, rate)
        c.run()
        return c

    def test_goods_the_player_added_with_nothing_bringing_them_are_told(self):
        """Beer is no café's own: its price is the player's choice (a burger
        bar in a gym), and nothing brings any, whatever the shop's age."""
        for days in (2, 30):
            with self.subTest(trade_days=days):
                c = self.priced(trade_days=days)
                fact = c.fact(CAFE, BEER)
                self.assertEqual((fact["st"], fact["why"], fact["lvl"], fact["setTo"]),
                                 ("noplan", "priced", "warn", None))
                [note] = c.notes(CAFE, "unsourced")
                self.assertIn("is priced here but nothing brings it", plain(note["text"]))

    def test_the_types_own_range_at_its_default_price_is_no_finding(self):
        """Every price list holds the type's whole range at default prices:
        coffee priced at a café says nothing about wanting to sell it."""
        c = self.priced(slugs=(self.COFFEE,))
        self.assertEqual(c.notes(CAFE, "unsourced"), [])
        self.assertNotEqual(c.fact(CAFE, self.COFFEE)["st"], "noplan")

    def test_a_fee_priced_elsewhere_is_never_stock(self):
        """A cover charge is charged for work, never stocked: no finding."""
        c = self.priced(slugs=(self.FEE,), rate=50)
        self.assertEqual(c.notes(CAFE, "unsourced"), [])

    def test_stock_on_the_shelf_is_no_unsourced(self):
        """Holding 800 of it, something brought it: not this finding."""
        c = self.priced(units=800)
        self.assertEqual(c.notes(CAFE, "unsourced"), [])

    def test_sold_out_goods_with_nothing_bringing_them_are_critical(self):
        """It sold 300 a day and is gone, with no standing supply: the row
        stays and the finding is critical."""
        c = self.priced(rate=300)
        fact = c.fact(CAFE, BEER)
        self.assertEqual((fact["st"], fact["why"], fact["lvl"]), ("noplan", "priced", "critical"))
        self.assertTrue([r for r in c.supply["shops"] if r["slug"] == BEER])

    def test_a_sold_out_shelf_topped_up_from_a_site_with_nothing_is_critical(self):
        c = self.cafe()
        c.hold(CAFE, BEER, 0, 100)
        c.run()
        fact = c.fact(CAFE, BEER)
        self.assertEqual((fact["st"], fact["why"], fact["lvl"]), ("noplan", "source", "critical"))

    def test_several_goods_at_one_shop_are_one_finding(self):
        """Two added goods nothing brings are one finding listing both."""
        c = self.priced(slugs=(BEER, WATER))
        [note] = c.notes(CAFE, "unsourced")
        self.assertIn("Nothing upstream supplies 2 goods Cafe is topped up with or prices", plain(note["text"]))

    def test_a_second_route_from_a_site_with_supply_is_a_source(self):
        """Topped up from an empty warehouse and from a hub that imports it:
        the hub brings it, so nothing is unsourced, whichever plan is last."""
        for hub_first in (True, False):
            with self.subTest(hub_first=hub_first):
                c = Chain()
                c.site(WH, "Warehouse")
                c.site(BREWERY, "Hub")
                c.contract(BREWERY, BEER, 700)
                c.site(CAFE, "Cafe", status="retail", kind="ba:businesstype_coffeeshop", trade_days=1)
                plans = [(BREWERY, CAFE, BEER, 100), (WH, CAFE, BEER, 50)]
                for plan in (plans if hub_first else plans[::-1]):
                    c.plan(*plan)
                c.run()
                self.assertNotEqual(c.fact(CAFE, BEER)["st"], "noplan")
                self.assertEqual(c.notes(CAFE, "unsourced"), [])

    def test_a_paused_import_at_the_source_is_paused_not_unsourced(self):
        c = Chain()
        c.site(WH, "Warehouse")
        c.contract(WH, BEER, 700, active=False)
        c.site(CAFE, "Cafe", status="retail", kind="ba:businesstype_coffeeshop", trade_days=1)
        c.plan(WH, CAFE, BEER, 45)
        c.run()
        self.assertEqual(c.notes(CAFE, "unsourced"), [])
        self.assertEqual(c.verdict(WH)["st"], "paused")


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


class ConservationTests(unittest.TestCase):
    """A sender's output is shared between its routes, never counted twice."""

    def test_one_brewery_cannot_cover_two_warehouses_with_one_output(self):
        """One machine makes 720 a day for two warehouses, each importing
        3,500 a week plain for a shop selling 500 a day. The route can bring
        each only part of its 575 a day: neither import is taken for a backup,
        and what the two routes are credited stays within the 5,040 made."""
        c = Chain()
        c.factory(BREWERY, "Brewery", machines=1)
        wh2, shop2 = ("wh_road", 2), ("main_street", 5)
        for wh, shop in ((WH, SHOP), (wh2, shop2)):
            c.site(wh, "Warehouse " + wh[0][-1] + str(wh[1]))
            c.hold(wh, BEER, 1000)
            c.contract(wh, BEER, 3500)
            c.shop(shop, "Shop " + str(shop[1]))
            c.hold(shop, BEER, 400, 500)
            c.plan(BREWERY, wh, BEER, 5000)
            c.plan(wh, shop, BEER, 800)
        c.run()
        facts = [c.fact(wh, BEER) for wh in (WH, wh2)]
        self.assertFalse(all(f["st"] == "covered" and f["why"] == "route" for f in facts), facts)
        self.assertLessEqual(sum(f["parts"]["route"] for f in facts), 5040 + 10)


class LoopTests(unittest.TestCase):
    """Two sites topping each other up with the same item: the loop is cut the
    same way whichever key sorts first."""

    def verdicts(self, factory_addr, makes):
        c = Chain()
        shop = ("zz_shop", 9)
        c.factory(factory_addr, "Factory", machines=1 if makes else 0)
        c.hold(factory_addr, BEER, 100)
        c.site(("bb_wh", 2), "Warehouse")
        c.hold(("bb_wh", 2), BEER, 100)
        c.contract(("bb_wh", 2), BEER, 700)
        c.shop(shop, "Shop")
        c.hold(shop, BEER, 400, 600)
        c.plan(factory_addr, ("bb_wh", 2), BEER, 5000)
        c.plan(("bb_wh", 2), factory_addr, BEER, 200)
        c.plan(("bb_wh", 2), shop, BEER, 1000)
        c.run()
        pick = lambda f: f and {k: f.get(k) for k in ("st", "why", "lvl", "use", "setTo")}
        return pick(c.fact(("bb_wh", 2), BEER)), pick(c.fact(factory_addr, BEER))

    def test_the_verdicts_do_not_depend_on_the_addresses(self):
        for makes in (True, False):
            with self.subTest(makes=makes):
                self.assertEqual(self.verdicts(("aa_fact", 1), makes), self.verdicts(("zz_fact", 1), makes))

    def test_a_factory_making_it_covers_the_warehouse_either_way(self):
        wh, _factory = self.verdicts(("zz_fact", 1), True)
        self.assertEqual((wh["st"], wh["why"]), ("covered", "route"))

    def test_a_factory_only_holding_it_leaves_one_finding(self):
        """The factory holds 100 and makes none: the warehouse's import is
        short, and the factory, which uses none itself, asks for nothing."""
        wh, factory = self.verdicts(("aa_fact", 1), False)
        self.assertEqual((wh["st"], wh["why"]), ("short", "order"))
        self.assertNotEqual((factory or {}).get("st"), "noplan")


class OwnProductionTests(unittest.TestCase):
    def test_a_line_making_it_counts_before_the_import(self):
        """A brewery makes 240 a day and imports 2,400 a week of the same,
        for a shop selling 500 a day: 1,680 made plus 2,400 imported cover
        the 4,025 needed, so the import is not short (and the 2,000 held
        reaches the drop at the 260 a day the line leaves to it)."""
        c = Chain(per_hour=10)
        c.factory(BREWERY, "Brewery", machines=1)
        c.hold(BREWERY, BEER, 2000)
        c.contract(BREWERY, BEER, 2400)
        c.shop(SHOP, "Shop")
        c.hold(SHOP, BEER, 400, 500)
        c.plan(BREWERY, SHOP, BEER, 800)
        c.run()
        fact = c.fact(BREWERY, BEER)
        self.assertNotIn(fact["st"], ("short", "noplan"))
        self.assertIsNone(fact["setTo"])


class DemandSizingTests(unittest.TestCase):
    """Demand sizing through the walk: the shops' need, shared between the
    sites that top them up, and the import rows walked on it."""

    def test_two_breweries_feeding_one_shop_share_its_demand(self):
        """Each tops the bar up to 400; it sells 300 a day: 150 each, so each
        line needs 150 x 1.15 / 30 = 5.75, six hours, not twelve."""
        c = Chain()
        b2 = ("brew_lane", 7)
        for brewery in (BREWERY, b2):
            c.factory(brewery, "Brewery " + str(brewery[1]), machines=1)
            c.plan(brewery, SHOP, BEER, 400)
        c.shop(SHOP, "Bar")
        c.hold(SHOP, BEER, 400, 300)
        c.run()
        hours = [line["needHours"]["dem"] for site in c.supply["factories"]["sites"] for line in site["lines"]]
        self.assertEqual(hours, [6, 6])

    def test_a_factory_below_capacity_does_not_run_its_depot_dry_in_demand(self):
        """The hub holds 500 water for a brewery that could eat 240 a day, but
        whose bar sells 100 beer a day (33 water). At full production the
        stock does not reach Monday's drop; in Demand sizing it does."""
        c = Chain()
        c.site(WH, "Hub")
        c.hold(WH, WATER, 500)
        c.contract(WH, WATER, 1700)
        c.factory(BREWERY, "Brewery", machines=1)
        c.plan(WH, BREWERY, WATER, 300)
        c.plan(BREWERY, SHOP, BEER, 400)
        c.shop(SHOP, "Bar")
        c.hold(SHOP, BEER, 400, 100)
        c.run()
        self.assertEqual(c.fact(WH, WATER)["why"], "shortfall")
        self.assertNotEqual(c.fact(WH, WATER, "dem")["why"], "shortfall")
        dem = [n for n in _import_notes(c.business_list, c.supply, set(), "dem") if n["group"] == "shortfall"]
        self.assertEqual(dem, [])

    def test_the_margin_is_added_once_over_two_depot_levels(self):
        """Hub, then a distributor, then a shop selling 100 a day: the hub's
        import needs 700 a week, 805 with the margin, not 805 x 1.15."""
        c = Chain()
        c.site(WH, "Hub")
        c.contract(WH, BEER, 500)
        c.site(CAFE, "Distrib")
        c.hold(CAFE, BEER, 50)
        c.shop(SHOP, "Shop")
        c.hold(SHOP, BEER, 100, 100)
        c.plan(WH, CAFE, BEER, 300)
        c.plan(CAFE, SHOP, BEER, 200)
        c.run()
        fact = c.fact(WH, BEER)
        self.assertEqual((fact["use"], fact["need"]), (700, 805))


class FactoryOwnImportTests(unittest.TestCase):
    """Issue #193: a factory's own import walked to its drop on what the
    factory's own machines eat, not only on what leaves the site."""

    def brewery(self, water):
        """A brewery (240 water a day at full rate) importing its own water,
        2,000 a week landing in five days, holding `water`; its bar sells 100
        beer a day (about 33 water, 38 with the margin)."""
        c = Chain()
        c.factory(BREWERY, "Brewery", machines=1)
        c.hold(BREWERY, WATER, water)
        c.contract(BREWERY, WATER, 2000, due=c.day + 5)
        c.plan(BREWERY, SHOP, BEER, 400)
        c.shop(SHOP, "Bar")
        c.hold(SHOP, BEER, 400, 100)
        c.run()
        return c

    def test_an_empty_input_runs_dry_before_the_drop_in_both_sizings(self):
        c = self.brewery(0)
        for mode in ("cap", "dem"):
            with self.subTest(mode=mode):
                fact = c.fact(BREWERY, WATER, mode)
                # The order covers the week either way: it is the stock.
                self.assertEqual((fact["role"], fact["st"], fact["why"]), ("input", "short", "shortfall"))
                notes = [n for n in _import_notes(c.business_list, c.supply, set(), mode)
                         if n["group"] == "shortfall"]
                self.assertEqual(len(notes), 1)
                rows = c.supply["imports"] if mode == "cap" else c.supply["importsDem"]
                row = next(r for r in rows if r["s"] == c.index(BREWERY) and r["slug"] == WATER)
                # The one-off to bring in: 4.5 days of the machines' draw.
                self.assertEqual(row["catchUp"], {"cap": 1080, "dem": 149}[mode])
                self.assertEqual(row["eats"], row["perDay"])

    def test_stock_that_reaches_the_drop_is_no_finding(self):
        c = self.brewery(1200)
        for mode in ("cap", "dem"):
            with self.subTest(mode=mode):
                self.assertNotEqual(c.fact(BREWERY, WATER, mode)["why"], "shortfall")
                self.assertEqual([n for n in _import_notes(c.business_list, c.supply, set(), mode)
                                  if n["group"] == "shortfall"], [])


def cafe_board():
    """The café of UnsourcedTests as the board reads it: its supply, its
    businesses and its findings. tests/import_routes.test.cjs lands its
    unsourced finding on the shelf's row."""
    c = UnsourcedTests().cafe()
    alerts = [{k: v for k, v in n.items() if k not in ("rank", "subject", "named")}
              for n in _shelf_notes(c.business_list, c.supply, set())
              + _import_notes(c.business_list, c.supply, set())]
    return {"meta": {"character": "bottom-up", "day": c.day, "save": "Fixture"},
            "supply": c.supply, "businesses": c.business_list, "alerts": alerts,
            "plan": {"recipes": []}}


class HubAndSpokeTests(unittest.TestCase):
    """A hub's import short of the whole chain is asked for once, at the hub."""

    def test_the_spoke_is_a_note_pointing_at_the_hub(self):
        """The hub imports 1,400 a week and tops up a spoke with no import,
        which tops up a shop selling 300 a day. The hub's import is judged on
        the whole 2,415 and asks for it; the spoke, cut to what the hub can
        spare, is a note naming the hub rather than a second import."""
        c = Chain()
        hub, spoke = ("hub_road", 1), ("spoke_road", 2)
        c.site(hub, "Hub")
        c.hold(hub, BEER, 500)
        c.contract(hub, BEER, 1400)
        c.site(spoke, "Spoke")
        c.hold(spoke, BEER, 200)
        c.shop(SHOP, "Shop")
        c.hold(SHOP, BEER, 400, 300)
        c.plan(hub, spoke, BEER, 2000)
        c.plan(spoke, SHOP, BEER, 800)
        c.run()
        self.assertEqual((c.verdict(hub)["st"], c.verdict(hub)["setTo"]), ("short", 2420))
        spoke_fact = c.fact(spoke, BEER)
        self.assertEqual((spoke_fact["st"], spoke_fact["lvl"], spoke_fact["from"]),
                         ("noplan", "info", c.index(hub)))
        self.assertEqual(c.notes(spoke, "unsourced") + c.notes(spoke, "order"), [])
        self.assertEqual(len(c.notes(hub, "order")), 1)


class EffectiveSenderTests(unittest.TestCase):
    """Demand sizing and shelf sizing read the same senders the walk does."""

    def test_an_empty_depot_beside_a_brewery_takes_none_of_the_demand(self):
        """A brewery and an empty depot each top a bar up to 400; it sells
        300 a day. Only the brewery has anything to send: its line needs
        300 x 1.15 / 30 = 11.5, twelve hours, not six."""
        c = Chain()
        c.factory(BREWERY, "Brewery", machines=1)
        c.site(WH, "Empty Depot")
        c.plan(BREWERY, SHOP, BEER, 400)
        c.plan(WH, SHOP, BEER, 400)
        c.shop(SHOP, "Bar")
        c.hold(SHOP, BEER, 400, 300)
        c.run()
        [line] = [l for site in c.supply["factories"]["sites"] for l in site["lines"]]
        self.assertEqual(line["needHours"]["dem"], 12)

    def test_a_loop_keeps_the_brewerys_demand(self):
        """The brewery tops a warehouse up, which imports too and tops a bar
        selling 300 a day up, and sends some back to the brewery: Demand
        still sizes the line on the bar, twelve hours, not all 24: the
        brewery's route comes first, and the warehouse's own import brings
        only what it leaves (round 12, factory first)."""
        c = Chain()
        c.factory(BREWERY, "Brewery", machines=1)
        c.site(WH, "Warehouse")
        c.contract(WH, BEER, 700)
        c.plan(BREWERY, WH, BEER, 2000)
        c.plan(WH, BREWERY, BEER, 100)
        c.plan(WH, SHOP, BEER, 400)
        c.shop(SHOP, "Bar")
        c.hold(SHOP, BEER, 400, 300)
        c.run()
        [line] = [l for site in c.supply["factories"]["sites"] for l in site["lines"]]
        self.assertEqual((line["demBasis"], line["needHours"]["dem"]), ("sales", 12))

    def test_the_shelf_is_sized_on_the_supplying_target_whatever_the_plan_order(self):
        """An importing warehouse tops the shop up to 400; an empty depot's
        plan says 50. The 400 is the top-up that counts, in either order."""
        for importer_first in (True, False):
            with self.subTest(importer_first=importer_first):
                c = Chain()
                c.site(WH, "Warehouse")
                c.contract(WH, BEER, 2800)
                c.site(CAFE, "Empty Depot")
                c.shop(SHOP, "Shop")
                c.hold(SHOP, BEER, 300, 300)
                plans = [(WH, SHOP, BEER, 400), (CAFE, SHOP, BEER, 50)]
                for plan in (plans if importer_first else plans[::-1]):
                    c.plan(*plan)
                c.run()
                fact = c.fact(SHOP, BEER)
                self.assertEqual((fact["have"], fact["st"]), (400, "covered"))
                self.assertEqual(c.notes(SHOP, "outruns"), [])


def idle_but_short_board(target_high=False):
    """A depot whose order is short of its week while it still holds months
    of stock: its fact says short, its idle-stock row overstock (or, with
    `target_high`, a plan that tops it up to 10,000 against a shop selling
    100 a day: its target finding). tests/import_routes.test.cjs lands the
    idle and target findings on the depot's row on Deliveries (QA of PR
    #195: they opened Deliveries with the row missing), and, with
    `target_high`, reads the order finding's sentence (the route that only
    passes on what its sender holds) in the Imports row's status tip."""
    c = Chain()
    if target_high:
        c.site(BREWERY, "Holder")
        c.hold(BREWERY, BEER, 5000)
        c.plan(BREWERY, WH, BEER, 10000)
        c.site(WH, "Depot")
        c.hold(WH, BEER, 9000)
        c.contract(WH, BEER, 300)
        c.plan(WH, SHOP, BEER, 500)
        c.shop(SHOP, "Shop")
        c.hold(SHOP, BEER, 300, 100)
    else:
        c.site(WH, "Depot")
        c.hold(WH, BEER, 30000)
        c.contract(WH, BEER, 700)
        c.plan(WH, SHOP, BEER, 100000)
        c.shop(SHOP, "Shop")
        c.hold(SHOP, BEER, 2000, 300)
    c.run()
    _order_says(c.business_list, c.supply)
    alerts = [{k: v for k, v in n.items() if k not in ("rank", "subject", "named")}
              for n in _idle_notes(c.business_list, c.supply["idle"], set())
              + _import_notes(c.business_list, c.supply, set())]
    return {"meta": {"character": "bottom-up", "day": c.day, "save": "Fixture"},
            "supply": c.supply, "businesses": c.business_list, "alerts": alerts,
            "plan": {"recipes": []}}


def idle_landing_board(kind):
    """Findings whose links QA of PR #195 found landing on nothing, as the
    board reads them; tests/import_routes.test.cjs lands each on a lit row or
    object. `kind` "factory": a brewery holding 5,000 sugar no line of its own
    draws on (its idle stock, read on Production). "shops": a depot topping
    two shops up to 10,000 beer each, selling 50 a day (one target finding
    across both shops, landing on the shop holding most)."""
    c = Chain()
    if kind == "factory":
        c.factory(BREWERY, "Brewery")
        c.hold(BREWERY, "ba:itemname_sugar", 5000)
        c.hold(BREWERY, BEER, 100)
        c.plan(BREWERY, SHOP, BEER, 1000)
        c.shop(SHOP, "Shop")
        c.hold(SHOP, BEER, 500, 300)
    else:
        c.site(WH, "Depot")
        c.hold(WH, BEER, 20000)
        c.contract(WH, BEER, 700)
        for shop, name, stock in ((SHOP, "Shop a", 8000), (CAFE, "Shop b", 9000)):
            c.plan(WH, shop, BEER, 10000)
            c.shop(shop, name)
            c.hold(shop, BEER, stock, 50)
    c.run()
    alerts = [{k: v for k, v in n.items() if k not in ("rank", "subject", "named")}
              for n in _idle_notes(c.business_list, c.supply["idle"], set())]
    return {"meta": {"character": "bottom-up", "day": c.day, "save": "Fixture"},
            "supply": c.supply, "businesses": c.business_list, "alerts": alerts,
            "plan": {"recipes": []}}


def depot_board():
    """warehouse_fed_by_brewery(0) as the board reads it: the warehouse's
    unsourced finding, which lands on Imports (the depot's import to add),
    one finding or several condensed."""
    c = warehouse_fed_by_brewery(machines=0)
    alerts = [{k: v for k, v in n.items() if k not in ("rank", "subject", "named")}
              for n in _shelf_notes(c.business_list, c.supply, set())
              + _import_notes(c.business_list, c.supply, set())]
    return {"meta": {"character": "bottom-up", "day": c.day, "save": "Fixture"},
            "supply": c.supply, "businesses": c.business_list, "alerts": alerts,
            "plan": {"recipes": []}}


class RoundThreeTests(unittest.TestCase):
    """Review round 3: one budget per sender, one ask per gap, closed shops,
    stale routes and loops between two importing depots."""

    def test_a_backup_import_and_a_route_share_one_output(self):
        """A 720 a day brewery tops up a depot that also imports 700 a week
        (a shop selling 100 a day) and a route-only depot (a shop selling 650
        a day). What its routes are credited stays within the 720."""
        c = Chain()
        c.factory(BREWERY, "Brewery")
        c.site(WH, "Backup")
        c.contract(WH, BEER, 700)
        c.hold(WH, BEER, 1000)
        c.site(CAFE, "Route only")
        c.hold(CAFE, BEER, 1000)
        other = ("shop", 9)
        for depot, shop, rate in ((WH, SHOP, 100), (CAFE, other, 650)):
            c.shop(shop, "Shop " + str(rate))
            c.hold(shop, BEER, 1000, rate)
            c.plan(BREWERY, depot, BEER, 2000)
            c.plan(depot, shop, BEER, 1000)
        c.run()
        credits = [n["credit"] for (site, item), n in walked_nodes(c).items()
                   if item == BEER and site in (key(WH), key(CAFE))]
        self.assertLessEqual(sum(credits), 720 + 1)
        self.assertNotEqual(c.verdict(WH)["why"], "route")

    def spoke_with_import(self, hub_import=700):
        c = Chain()
        hub, spoke = ("hub_road", 1), ("spoke_road", 2)
        c.site(hub, "Hub")
        c.hold(hub, BEER, 500)
        c.contract(hub, BEER, hub_import)
        c.site(spoke, "Spoke")
        c.hold(spoke, BEER, 200)
        c.contract(spoke, BEER, 700)
        c.shop(SHOP, "Shop")
        c.hold(SHOP, BEER, 400, 300)
        c.plan(hub, spoke, BEER, 2000)
        c.plan(spoke, SHOP, BEER, 800)
        c.run()
        return c, hub, spoke

    def test_a_spoke_with_its_own_import_is_not_asked_again(self):
        """Hub and spoke each import 700 a week; the shop needs 2,415. The
        hub is asked to raise; the spoke is not. Applying every set-to on
        the list buys about the need, not twice the gap."""
        c, hub, spoke = self.spoke_with_import()
        self.assertEqual(c.verdict(hub)["st"], "short")
        self.assertIsNone(c.verdict(spoke)["setTo"])
        bought = c.verdict(hub)["setTo"] + 700
        self.assertLess(abs(bought - 2415), 2415 * 0.1)

    def test_a_route_too_small_is_said_whatever_the_hub_lacks(self):
        """The hub imports 350 a week and tops the spoke up to 30 a day for a
        shop selling 100: raising the hub cannot make 30 carry the day."""
        c = Chain()
        c.site(WH, "Hub")
        c.contract(WH, BEER, 350)
        c.site(CAFE, "Spoke")
        c.hold(CAFE, BEER, 100)
        c.shop(SHOP, "Shop")
        c.hold(SHOP, BEER, 300, 100)
        c.plan(WH, CAFE, BEER, 30)
        c.plan(CAFE, SHOP, BEER, 200)
        c.run()
        self.assertEqual((c.verdict(CAFE)["st"], c.verdict(CAFE)["why"], c.verdict(CAFE)["setTo"]),
                         ("short", "target", 120))
        self.assertEqual(len(c.notes(CAFE, "topup")), 1)

    def test_a_closed_shop_needs_nothing(self):
        """The shop sold 300 a day and is shut with the game's switch: the
        hub's 500 a week import is not asked to grow for it."""
        c = Chain()
        c.site(WH, "Hub")
        c.contract(WH, BEER, 500)
        c.hold(WH, BEER, 500)
        c.shop(SHOP, "Shop")
        c.hold(SHOP, BEER, 0, 300)
        c.plan(WH, SHOP, BEER, 100)
        c.closed = {SHOP}
        c.run()
        self.assertIsNone(c.verdict(WH)["setTo"])
        self.assertEqual(c.notes(SHOP, "outruns") + c.notes(SHOP, "unsourced"), [])

    def test_a_shelf_holding_stock_is_never_unsourced(self):
        """800 on the shelf, a target from an empty depot: the shelf came by
        its stock somehow; the depot says what is missing."""
        c = UnsourcedTests().cafe()
        c.hold(CAFE, BEER, 800, 100)
        c.run()
        self.assertEqual(c.notes(CAFE, "unsourced"), [])
        self.assertEqual(c.verdict(WH)["st"], "noplan")
        self.assertNotEqual(c.verdict(WH)["lvl"], "info")

    def test_a_stale_route_from_a_factory_that_makes_none_does_not_count(self):
        """An importer tops the shop up with water to 400; a brewery's old
        plan says 1,000 but it makes beer and holds no water. The shop,
        selling 500 a day, is judged on the 400."""
        c = Chain()
        c.site(WH, "Importer")
        c.contract(WH, WATER, 3500)
        c.hold(WH, WATER, 3000)
        c.factory(BREWERY, "Brewery")
        c.shop(SHOP, "Shop")
        c.hold(SHOP, WATER, 400, 500)
        c.plan(WH, SHOP, WATER, 400)
        c.plan(BREWERY, SHOP, WATER, 1000)
        c.run()
        fact = c.fact(SHOP, WATER)
        self.assertEqual((fact["have"], fact["st"]), (400, "short"))

    def test_two_importing_depots_topping_each_other_up_read_the_same_either_way(self):
        """Depots importing 2,100 and 700 a week, each with a shop selling
        150 a day, top each other up. Together they bring the 2,415 needed,
        whichever sorts first: the goods go from the one with more over."""
        for high in (("aa", 1), ("zz", 1)):
            with self.subTest(high=high):
                c = Chain()
                low, shop2 = ("mm", 2), ("shop2", 9)
                for depot, amount, shop in ((high, 2100, SHOP), (low, 700, shop2)):
                    c.site(depot, "High" if depot == high else "Low")
                    c.contract(depot, BEER, amount)
                    c.hold(depot, BEER, 1500)
                    c.shop(shop, "Shop")
                    c.hold(shop, BEER, 300, 150)
                    c.plan(depot, shop, BEER, 300)
                c.plan(high, low, BEER, 500)
                c.plan(low, high, BEER, 500)
                c.run()
                self.assertEqual((c.verdict(high)["st"], c.verdict(low)["st"]), ("covered", "covered"))


def key(addr):
    from ba_dashboard import site_key
    return site_key(addr)


def walked_nodes(c):
    """The 24/7 walk for a Chain, rebuilt through a spy on _supply_walk."""
    import ba_dashboard
    seen = []
    real = ba_dashboard._supply_walk
    ba_dashboard._supply_walk = lambda *a: seen.append(real(*a)) or seen[-1]
    try:
        c.run()
    finally:
        ba_dashboard._supply_walk = real
    return seen[0]


class RoundFourTests(unittest.TestCase):
    """Review round 4: one Weekly imports entry per gap, routes capped at
    their targets upstream, closed shops asked nothing, capacity handed on."""

    def test_a_hub_passing_stock_to_an_importing_depot_is_no_import_line(self):
        """The hub holds stock, imports none, and tops up a depot that imports
        (Safara's factories and Bangtan Stuff). The depot's import is the one
        ask; the hub is a note with no Weekly imports entry."""
        c = Chain()
        c.site(CAFE, "Hub")
        c.hold(CAFE, BEER, 5000)
        c.site(WH, "Depot")
        c.contract(WH, BEER, 700, smart=True)
        c.hold(WH, BEER, 1000)
        c.shop(SHOP, "Shop")
        c.hold(SHOP, BEER, 400, 300)
        c.plan(CAFE, WH, BEER, 10000)
        c.plan(WH, SHOP, BEER, 800)
        c.run()
        lines = [(s, slug) for s, items in c.supply["facts"].items() for slug, f in items.items()
                 if f.get("imp") and f.get("setTo") is not None]
        self.assertEqual(lines, [(str(c.index(WH)), BEER)])
        self.assertFalse(c.fact(CAFE, BEER).get("imp"))

    def test_a_small_route_is_asked_of_the_hub_only_up_to_its_target(self):
        """Hub and spoke each import 700 a week; the hub tops the spoke up to
        50 a day and the shop sells 300. The hub is asked for at most the
        route's 350 a week; the spoke's own import brings the rest. Every
        set-to applied together buys about the 2,415 needed, not twice it."""
        c = Chain()
        hub, spoke = ("hub_road", 1), ("spoke_road", 2)
        for site, name in ((hub, "Hub"), (spoke, "Spoke")):
            c.site(site, name)
            c.hold(site, BEER, 500)
            c.contract(site, BEER, 700)
        c.shop(SHOP, "Shop")
        c.hold(SHOP, BEER, 400, 300)
        c.plan(hub, spoke, BEER, 50)
        c.plan(spoke, SHOP, BEER, 800)
        c.run()
        bought = sum(c.verdict(site)["setTo"] or 700 for site in (hub, spoke))
        self.assertLess(bought, 2415 * 1.15)
        self.assertGreaterEqual(bought, 2415 * 0.95)

    def test_a_closed_shop_has_no_shelf_to_change(self):
        c = Chain()
        c.site(WH, "Hub")
        c.contract(WH, BEER, 3000)
        c.shop(SHOP, "Shop")
        c.hold(SHOP, BEER, 0, 300)
        c.plan(WH, SHOP, BEER, 100)
        c.closed = {SHOP}
        c.run()
        self.assertIsNone(c.fact(SHOP, BEER))
        self.assertEqual([r for r in c.supply["shops"] if r["s"] == c.index(SHOP)], [])

    def test_demand_hands_a_full_factorys_share_to_one_with_room(self):
        """Breweries making 720 and 2,160 a day each top a shop selling 2,400
        up to 3,000. Split evenly the small one would be held at 720 and the
        other asked for only 1,200: the 480 left goes to the big one, and
        the two make the 2,400 between them."""
        c = Chain()
        small, big = ("brew_small", 1), ("brew_big", 2)
        c.factory(small, "Small", machines=1)
        c.factory(big, "Big", machines=3)
        c.plan(small, SHOP, BEER, 3000)
        c.plan(big, SHOP, BEER, 3000)
        c.shop(SHOP, "Shop")
        c.hold(SHOP, BEER, 1000, 2400)
        c.run()
        made = {}
        for site in c.supply["factories"]["sites"]:
            for line in site["lines"]:
                made[c.business_list[site["s"]]["name"]] = line["needHours"]["dem"] * 30 * line["machines"]
        self.assertGreaterEqual(sum(made.values()), 2400)
        self.assertEqual(made["Small"], 720)

    def test_a_loop_reads_the_same_in_both_sizings(self):
        """A brewery tops a warehouse up and the warehouse sends some back:
        the one cut of the loop serves both sizings, which agree."""
        c = Chain()
        c.factory(BREWERY, "Brewery")
        c.hold(BREWERY, BEER, 500)
        c.site(WH, "WH")
        c.hold(WH, BEER, 1000)
        c.contract(WH, BEER, 4200)
        c.shop(SHOP, "Shop")
        c.hold(SHOP, BEER, 400, 300)
        c.plan(BREWERY, WH, BEER, 2000)
        c.plan(WH, BREWERY, BEER, 100)
        c.plan(WH, SHOP, BEER, 500)
        c.run()
        self.assertEqual(c.fact(WH, BEER, "cap")["st"], c.fact(WH, BEER, "dem")["st"])


class RoundFiveTests(unittest.TestCase):
    """Review round 5: a route's target caps only what a site with its own
    supply asks; need goes to the senders with room, in both walks."""

    @staticmethod
    def hub_and_shop(hub_import, shop_target):
        c = Chain()
        c.site(WH, "Hub")
        c.hold(WH, BEER, 2000)
        c.contract(WH, BEER, hub_import)
        c.shop(SHOP, "Shop")
        c.hold(SHOP, BEER, 400, 300)
        c.plan(WH, SHOP, BEER, shop_target)
        c.run()
        return c

    def test_a_shop_topped_below_its_sales_still_asks_the_hub_for_them(self):
        """The shop sells 300 a day on a top-up of 100; nothing else brings
        it any, so the hub's import is sized on the 2,415 it needs."""
        c = self.hub_and_shop(700, 100)
        self.assertEqual((c.verdict(WH)["st"], c.verdict(WH)["setTo"]), ("short", 2420))
        self.assertEqual(c.verdict(SHOP)["setTo"], 350)

    def test_every_change_applied_together_covers_the_need(self):
        """Set the hub's import and the shop's top-up to what the list says:
        nothing is short any more, and nothing asks again."""
        c = self.hub_and_shop(700, 100)
        hub, shop = c.verdict(WH)["setTo"], c.verdict(SHOP)["setTo"]
        after = self.hub_and_shop(hub, shop)
        self.assertEqual([after.verdict(site)["setTo"] for site in (WH, SHOP)], [None, None])
        self.assertNotIn(after.verdict(WH)["st"], ("short", "noplan"))

    def depot_from(self, senders):
        """A depot topped up to 10,000 by each of `senders` (a factory with n
        machines, or a hub importing so much a week); its shop sells 2,400."""
        c = Chain()
        for n, (site, machines, imported) in enumerate(senders):
            if machines:
                c.factory(site, "Brewery %d" % n, machines=machines)
            else:
                c.site(site, "Hub %d" % n)
                c.contract(site, BEER, imported)
                c.hold(site, BEER, 20000)
            c.plan(site, WH, BEER, 10000)
        c.site(WH, "Depot")
        c.hold(WH, BEER, 5000)
        c.plan(WH, SHOP, BEER, 5000)
        c.shop(SHOP, "Shop")
        c.hold(SHOP, BEER, 2000, 2400)
        c.run()
        return c

    def test_what_one_sender_cannot_send_goes_to_the_one_with_room(self):
        """A brewery (720 a day) and a hub importing 20,000 a week both top
        the depot up: 3,577 a day against 2,760 needed. No import to add."""
        c = self.depot_from([(BREWERY, 1, 0), (CAFE, 0, 20000)])
        self.assertEqual((c.verdict(WH)["st"], c.verdict(WH)["why"]), ("covered", "route"))
        self.assertEqual(c.notes(WH, "order") + c.notes(WH, "unsourced"), [])

    def test_two_unequal_breweries_cover_a_depot_between_them(self):
        """720 and 2,160 a day against 2,760 needed: covered by the routes."""
        c = self.depot_from([(BREWERY, 1, 0), (("brew_big", 2), 3, 0)])
        self.assertEqual((c.verdict(WH)["st"], c.verdict(WH)["why"]), ("covered", "route"))

    def test_demand_holds_a_factory_to_its_capacity_across_all_its_shops(self):
        """Breweries making 720 and 2,160 a day each top up two shops selling
        1,200 a day: the small one is held to 720 over both, and the big one
        makes the rest, 2,400 between them."""
        c = Chain()
        small, big = ("brew_small", 1), ("brew_big", 2)
        c.factory(small, "Small", machines=1)
        c.factory(big, "Big", machines=3)
        for shop in (SHOP, ("main_street", 5)):
            c.shop(shop, "Shop %d" % shop[1])
            c.hold(shop, BEER, 1000, 1200)
            c.plan(small, shop, BEER, 3000)
            c.plan(big, shop, BEER, 3000)
        c.run()
        made = {c.business_list[site["s"]]["name"]: line["needHours"]["dem"] * 30 * line["machines"]
                for site in c.supply["factories"]["sites"] for line in site["lines"]}
        self.assertEqual(made["Small"], 720)
        self.assertGreaterEqual(sum(made.values()), 2760)


class RoundSixTests(unittest.TestCase):
    """Review round 6: need handed to a sender with room never passes the
    target of its route."""

    def test_a_low_target_from_the_hub_with_room_is_the_one_to_raise(self):
        """A brewery (720 a day) tops the warehouse up to 10,000; a hub
        importing 20,000 a week tops it up to only 1,000; the shop sells
        2,400 a day. The line holds at most 1,720 after the rounds: the
        hub's target is the one to raise, to the day's need of 2,760 (a
        level, not an amount added), and the finding names the hub's plan
        at the 1,000 it holds."""
        c = Chain()
        hub = ("hub_road", 9)
        c.factory(BREWERY, "Brewery", machines=1)
        c.site(hub, "Hub")
        c.hold(hub, BEER, 5000)
        c.contract(hub, BEER, 20000)
        c.site(WH, "WH")
        c.hold(WH, BEER, 5000)
        c.plan(BREWERY, WH, BEER, 10000)
        c.plan(hub, WH, BEER, 1000)
        c.plan(WH, SHOP, BEER, 3000)
        c.shop(SHOP, "Shop")
        c.hold(SHOP, BEER, 1000, 2400)
        c.run()
        fact = c.fact(WH, BEER)
        self.assertEqual((fact["st"], fact["why"], fact["have"], fact["setTo"], fact["from"]),
                         ("short", "target", 1000, 2760, c.index(hub)))
        self.assertEqual(len(c.notes(WH, "topup")), 1)

    def test_two_hubs_the_one_with_room_on_a_small_target(self):
        """Hub A imports 100 a week, hub B 20,000 but tops the depot up to
        only 500; the shop sells 1,000 a day: B's target is the one to raise."""
        c = Chain()
        a, b = ("hub_a", 7), ("hub_b", 8)
        for hub, imported, target, name in ((a, 100, 5000, "HubA"), (b, 20000, 500, "HubB")):
            c.site(hub, name)
            c.hold(hub, BEER, 3000)
            c.contract(hub, BEER, imported)
            c.plan(hub, WH, BEER, target)
        c.site(WH, "Depot")
        c.hold(WH, BEER, 3000)
        c.plan(WH, SHOP, BEER, 5000)
        c.shop(SHOP, "Shop")
        c.hold(SHOP, BEER, 2000, 1000)
        c.run()
        fact = c.fact(WH, BEER)
        self.assertEqual((fact["st"], fact["why"], fact["from"]), ("short", "target", c.index(b)))
        self.assertGreater(fact["setTo"], 500)


class RoundSevenTests(unittest.TestCase):
    """Review round 7: top-up targets are levels, never added together."""

    def two_hubs(self, targets, sold):
        c = Chain()
        hubs = (("hub_a", 7), ("hub_b", 8))
        for hub, target in zip(hubs, targets):
            c.site(hub, "Hub " + hub[0][-1])
            c.hold(hub, BEER, 30000)
            c.contract(hub, BEER, 60000)
            c.plan(hub, WH, BEER, target)
        c.site(WH, "Depot")
        c.hold(WH, BEER, 3000)
        c.plan(WH, SHOP, BEER, 10000)
        c.shop(SHOP, "Shop")
        c.hold(SHOP, BEER, 2000, sold)
        c.run()
        return c

    def test_two_targets_are_a_level_not_a_sum(self):
        """Targets of 5,000 and 1,000 hold the line at 5,000, against a 6,000
        day: short, raised to the day's 6,900, with a finding."""
        c = self.two_hubs((5000, 1000), 6000)
        fact = c.fact(WH, BEER)
        self.assertEqual((fact["st"], fact["why"], fact["have"], fact["setTo"]), ("short", "target", 5000, 6900))
        self.assertEqual(len(c.notes(WH, "topup")), 1)

    def test_equal_targets_ask_once_for_the_day(self):
        """1,000 and 1,000 against 2,400 a day: one target raised to 2,760,
        which holds the day; after that nothing is asked again."""
        c = self.two_hubs((1000, 1000), 2400)
        fact = c.fact(WH, BEER)
        self.assertEqual((fact["st"], fact["setTo"]), ("short", 2760))
        raised = [2760 if index == fact["from"] else 1000
                  for index in (c.index(("hub_a", 7)), c.index(("hub_b", 8)))]
        after = self.two_hubs(tuple(raised), 2400)
        self.assertEqual((after.fact(WH, BEER)["st"], after.fact(WH, BEER)["setTo"]), ("covered", None))

    def test_the_suggested_level_holds_the_day_in_either_order(self):
        """The brewery makes 720 a day; the hub's plan is raised to the 2,760
        suggested: the board says covered, holding 2,760, not the brewery's
        10,000 it cannot fill (the day-by-day replay is RoundEightTests')."""
        c = Chain()
        hub = ("hub_road", 9)
        c.factory(BREWERY, "Brewery", machines=1)
        c.site(hub, "Hub")
        c.hold(hub, BEER, 5000)
        c.contract(hub, BEER, 20000)
        c.site(WH, "WH")
        c.hold(WH, BEER, 5000)
        c.plan(BREWERY, WH, BEER, 10000)
        c.plan(hub, WH, BEER, 2760)
        c.plan(WH, SHOP, BEER, 3000)
        c.shop(SHOP, "Shop")
        c.hold(SHOP, BEER, 1000, 2400)
        c.run()
        fact = c.fact(WH, BEER)
        self.assertEqual(fact["st"], "covered")
        self.assertLess(fact["have"], 10000)


# --- round 8: several sites topping one depot up, replayed day by day -------

# A week with a busy Friday (WEEKDAYS index, Sunday first): the busiest day
# is 130 against an average of 100.
BUSY_WEEK = [95, 90, 90, 95, 100, 130, 100]


def simulate_days(senders, targets, depot_stock, sales, profile, days=42, order=None,
                  own_first=False, judge_from=21, depot_import=None):
    """A plain day-by-day account of a depot several sites top up, written
    from the game's rules and not from the board's code.

    `senders` {name: {"stock": held, "made": a day made there, "import":
    (units a week, landing weekday), "own": a day its own shop sells}}.
    Every morning each sender in `order` tops the depot up to its target
    from what it holds, and a sender with a shop of its own tops that shop
    up to two busiest days (before the depot's rounds with `own_first`,
    after them otherwise); then the shops draw their day (the day's sales
    times the weekday's share of `profile`); then each sender makes its day
    and an import lands on its weekday (the depot's own, `depot_import`,
    too). The own shop's "two busiest days" stands in for its shelf
    capacity: the game's plan (target 100,000 in the fixtures) would take
    all the sender holds up to what the shelf fits. Returns [(where, day)]:
    each day from `judge_from` on that the
    depot's shop ("depot") or a sender's own shop (its name) could not
    meet the draw."""
    stock = {name: float(spec.get("stock", 0)) for name, spec in senders.items()}
    shelf = {name: 0.0 for name, spec in senders.items() if spec.get("own")}
    depot = float(depot_stock)
    order = list(order or senders)
    busiest = max(profile) / 100
    dry = []

    def own_rounds():
        for name in shelf:
            give = max(0.0, min(2 * busiest * senders[name]["own"] - shelf[name], stock[name]))
            shelf[name] += give
            stock[name] -= give

    for day in range(days):
        weekday = day % 7
        if own_first:
            own_rounds()
        for name in order:
            give = max(0.0, min(targets[name] - depot, stock[name]))
            depot += give
            stock[name] -= give
        if not own_first:
            own_rounds()
        share = profile[weekday] / 100
        draw = sales * share
        if depot + 1e-6 < draw:
            if day >= judge_from:
                dry.append(("depot", day))
            depot = 0.0
        else:
            depot -= draw
        for name in shelf:
            draw = senders[name]["own"] * share
            if shelf[name] + 1e-6 < draw:
                if day >= judge_from:
                    dry.append((name, day))
                shelf[name] = 0.0
            else:
                shelf[name] -= draw
        for name, spec in senders.items():
            stock[name] += spec.get("made", 0)
            weekly = spec.get("import")
            if weekly and weekday == weekly[1]:
                stock[name] += weekly[0]
        if depot_import and weekday == depot_import[1]:
            depot += depot_import[0]
    return dry


def simulate_network(senders, routes, sales, profile, days=42, judge_from=21):
    """simulate_days() for several depots: every morning each route (sender,
    depot, target) in the order given tops its depot up to the target from
    what the sender holds; then each depot's shop draws its day (`sales`
    {depot: a day} times the weekday's share of `profile`); then each sender
    makes its day ("made") and its weekly import ("import") lands on the
    fourth day. Starts empty; returns [(depot, day)] from `judge_from` on
    that a depot could not meet the draw."""
    stock = {name: 0.0 for name in senders}
    depot = {name: 0.0 for name in sales}
    dry = []
    for day in range(days):
        weekday = day % 7
        for sender, dest, target in routes:
            give = max(0.0, min(target - depot[dest], stock[sender]))
            depot[dest] += give
            stock[sender] -= give
        for dest, per_day in sales.items():
            draw = per_day * profile[weekday] / 100
            if depot[dest] + 1e-6 < draw:
                if day >= judge_from:
                    dry.append((dest, day))
                depot[dest] = 0.0
            else:
                depot[dest] -= draw
        for sender, spec in senders.items():
            stock[sender] += spec.get("made", 0.0)
            if spec.get("import") and weekday == 3:
                stock[sender] += spec["import"]
    return dry


class PooledRoomTests(unittest.TestCase):
    """Round 12: a sender's room is pooled across the sites it tops up beside
    others (_held_levels()), in the walk and in Demand sizing alike."""

    def hours(self, c, addr, mode):
        [line] = [l for site in c.supply["factories"]["sites"] if site["s"] == c.index(addr)
                  for l in site["lines"]]
        return line["needHours"][mode]

    def asks(self, c, sites, mode):
        return {a: c.fact(a, BEER, mode)["setTo"] for a in sites if c.fact(a, BEER, mode)}

    def test_a_factory_feeding_two_depots_uses_its_room_where_it_is_needed(self):
        """A four-machine brewery (2,880 a day) tops two depots up, each
        feeding a shop selling 1,800 a day; hub 1 (2,100 a week) helps at
        depot 1, hub 2 (14,000 a week) at depot 2. Pooled, the brewery brings
        2,070 - 300 at depot 1 and what hub 2 leaves at depot 2: 2,805 a
        day with the margin, within its 2,880. Nothing asks, in both bases.
        Replayed at the hours each basis gives, with hub 2's round before the
        brewery's into depot 2 (a brewery round that fills depot 2 first
        leaves depot 1 short: the level model's known limit)."""
        brew, hub1, hub2 = ("brew_a", 5), ("hub_a", 7), ("hub_b", 8)
        depots = (("dep_a", 11), ("dep_b", 12))
        c = Chain()
        c.profile = BUSY_WEEK
        c.factory(brew, "Brewery a", machines=4)
        for hub, name, weekly in ((hub1, "Hub 1", 2100), (hub2, "Hub 2", 14000)):
            c.site(hub, name)
            c.contract(hub, BEER, weekly)
            c.hold(hub, BEER, 3000)
        for dep, shop, name in ((depots[0], ("shop_a", 21), "1"), (depots[1], ("shop_b", 22), "2")):
            c.site(dep, "Depot " + name)
            c.hold(dep, BEER, 5000)
            c.plan(dep, shop, BEER, 100000)
            c.shop(shop, "Shop " + name)
            c.hold(shop, BEER, 2000, 1800)
            c.plan(brew, dep, BEER, 10000)
        c.plan(hub1, depots[0], BEER, 10000)
        c.plan(hub2, depots[1], BEER, 10000)
        c.run()
        for mode in ("cap", "dem"):
            with self.subTest(mode=mode):
                self.assertEqual(set(self.asks(c, (hub1, hub2) + depots, mode).values()), {None})
                self.assertEqual([c.fact(d, BEER, mode)["st"] for d in depots], ["covered", "covered"])
                self.assertEqual(self.hours(c, brew, mode), 24)
                made = 30 * 4 * self.hours(c, brew, mode)
                senders = {"brew": {"made": made}, "hub1": {"import": 2100}, "hub2": {"import": 14000}}
                to_1 = [("brew", "d1", 10000), ("hub1", "d1", 10000)]
                for into_1 in (to_1, to_1[::-1]):
                    routes = [("hub2", "d2", 10000), ("brew", "d2", 10000)] + into_1
                    self.assertEqual(simulate_network(senders, routes, {"d1": 1800, "d2": 1800}, BUSY_WEEK), [])

    def test_crossed_primary_and_backup_targets(self):
        """Breweries of 720 and 2,160 a day each top two depots up, one as
        the primary (20,000) and the other as backup (2,000), crossed; each
        depot's shop sells 1,200 a day. Pooled, they bring the 2,760 a day
        with the margin: nothing asks, in both bases, Demand gives 24 and 23
        hours (2,790 a day), and every order of the four rounds holds."""
        small, large = ("brew_a", 1), ("brew_b", 2)
        c = Chain()
        c.factory(small, "Small brewery", machines=1)
        c.factory(large, "Large brewery", machines=3)
        depots = []
        for i, (to_small, to_large) in enumerate(((20000, 2000), (2000, 20000))):
            dep, shop = ("depot", 30 + i), ("shop", 40 + i)
            depots.append(dep)
            c.site(dep, "Depot %d" % i)
            c.hold(dep, BEER, 4000)
            c.shop(shop, "Shop %d" % i)
            c.hold(shop, BEER, 2000, 1200)
            c.plan(dep, shop, BEER, 5000)
            c.plan(small, dep, BEER, to_small)
            c.plan(large, dep, BEER, to_large)
        c.run()
        for mode in ("cap", "dem"):
            with self.subTest(mode=mode):
                self.assertEqual(set(self.asks(c, depots, mode).values()), {None})
                self.assertEqual([c.fact(d, BEER, mode)["st"] for d in depots], ["covered", "covered"])
                hours = (self.hours(c, small, mode), self.hours(c, large, mode))
                self.assertEqual(hours, (24, 24) if mode == "cap" else (24, 23))
                senders = {"small": {"made": 30 * hours[0]}, "large": {"made": 90 * hours[1]}}
                routes = [("small", "d0", 20000), ("large", "d0", 2000),
                          ("small", "d1", 2000), ("large", "d1", 20000)]
                # Ten weeks, the last four judged: a primary depot fills to
                # its 20,000 first, which takes over three weeks from empty.
                for order in itertools.permutations(routes):
                    self.assertEqual(simulate_network(senders, list(order), {"d0": 1200, "d1": 1200}, [100] * 7,
                                                      days=70, judge_from=42), [])


class ThroughputTests(unittest.TestCase):
    """Round 13: a sender routes also feed is held to what it can pass on
    (its own supply plus what its senders can bring it), so a depot's own
    import further down brings what that leaves, in both sizings; and a
    round's target caps its part in Demand sizing as in the walk."""

    CENTRAL, REGIONAL, SHOP_R, ROOT = ("central", 31), ("regional", 32), ("shop_r", 33), ("root", 30)

    def central_chain(self, central_import):
        """A one-machine brewery (720 a day) tops Central up to 10,000;
        Central tops Regional up to 10,000; Regional imports 7,000 a week
        itself and feeds a shop selling 1,200 a day."""
        c = Chain()
        c.factory(BREWERY, "Brewery", machines=1)
        c.hold(BREWERY, BEER, 500)
        c.site(self.CENTRAL, "Central")
        c.hold(self.CENTRAL, BEER, 3000)
        if central_import:
            c.contract(self.CENTRAL, BEER, central_import)
        c.site(self.REGIONAL, "Regional")
        # At its round's target (round 15): Central's timing charges the
        # first fill-up of a depot under its target, which is not what this
        # test is about.
        c.hold(self.REGIONAL, BEER, 10000)
        c.contract(self.REGIONAL, BEER, 7000)
        c.shop(self.SHOP_R, "Shop")
        c.hold(self.SHOP_R, BEER, 2000, 1200)
        c.plan(BREWERY, self.CENTRAL, BEER, 10000)
        c.plan(self.CENTRAL, self.REGIONAL, BEER, 10000)
        c.plan(self.REGIONAL, self.SHOP_R, BEER, 100000)
        c.run()
        return c

    def test_a_middle_depot_passes_on_what_its_brewery_makes(self):
        """Central with no import passes on the brewery's 720 a day and
        Regional's own import brings the rest: nothing asks, in both bases.
        With Central importing 3,500 a week too, it passes on 1,220 a day and
        still nothing asks: Regional's import is not left idle while Central
        is asked to raise."""
        for central_import in (0, 3500):
            c = self.central_chain(central_import)
            for mode in ("cap", "dem"):
                with self.subTest(central_import=central_import, mode=mode):
                    central, regional = c.fact(self.CENTRAL, BEER, mode), c.fact(self.REGIONAL, BEER, mode)
                    self.assertEqual((central["st"], central["setTo"]), ("covered", None))
                    self.assertEqual((regional["st"], regional["setTo"]), ("covered", None))
                    self.assertEqual(c.notes(self.CENTRAL, "order") + c.notes(self.REGIONAL, "order"), [])
                    if central_import:
                        # Round 14: the routes bring 1,220 of the 1,380 a day
                        # with the margin; Regional's import shows its share.
                        self.assertEqual(regional["need"], 7 * 160)

    def test_an_import_passed_down_two_depots_is_not_asked_for_the_whole_need(self):
        """Root imports 7,000 a week and tops Intermediate up, which tops
        Regional up; Regional imports 14,000 a week itself; its shop sells
        2,400 a day. 21,000 a week against 19,320: nothing asks, in both
        bases (it asked Root for 19,320 before)."""
        mid = ("intermediate", 34)
        c = Chain()
        for addr, name in ((self.ROOT, "Import root"), (mid, "Intermediate"), (self.REGIONAL, "Regional")):
            c.site(addr, name)
            c.hold(addr, BEER, 20000)
        c.contract(self.ROOT, BEER, 7000)
        c.contract(self.REGIONAL, BEER, 14000)
        c.plan(self.ROOT, mid, BEER, 10000)
        c.plan(mid, self.REGIONAL, BEER, 10000)
        c.plan(self.REGIONAL, self.SHOP_R, BEER, 5000)
        c.shop(self.SHOP_R, "Shop")
        c.hold(self.SHOP_R, BEER, 2000, 2400)
        c.run()
        for mode in ("cap", "dem"):
            with self.subTest(mode=mode):
                self.assertEqual([(c.fact(a, BEER, mode)["st"], c.fact(a, BEER, mode)["setTo"])
                                  for a in (self.ROOT, mid, self.REGIONAL)], [("covered", None)] * 3)

    def test_demand_keeps_a_rounds_target_cap(self):
        """A four-machine brewery tops a depot up to 1,000 a day; the depot
        imports 14,000 a week and its shop sells 2,400 a day. The walk takes
        the round at its 1,000; Demand sizes the brewery for that too, nine
        hours (1,000 / 120 a machine-hour, not 23), and its 3,000-a-week
        water import is not asked to rise in Demand."""
        t = RoundEightTests()
        c = t.build([(t.BREW_A, "brewery", 4, 1000, 5000)], 2400, depot_stock=15000, depot_import=14000)
        c.contract(t.BREW_A, WATER, 3000)
        c.hold(t.BREW_A, WATER, 10000)
        c.run()
        [line] = [l for site in c.supply["factories"]["sites"] for l in site["lines"]]
        self.assertEqual(line["needHours"]["dem"], 9)
        self.assertIsNone(c.fact(t.BREW_A, WATER, "dem")["setTo"])
        self.assertEqual((c.fact(WH, BEER, "dem")["st"], c.fact(WH, BEER, "dem")["setTo"]), ("covered", None))
        # Round 14: a Smart Delivery backup at or under the round's target
        # brings nothing now, but the round is still capped at its target.
        for level in (800, 1500):
            with self.subTest(smart=level):
                c = Chain()
                c.profile = BUSY_WEEK
                c.factory(t.BREW_A, "Brewery", machines=4)
                c.hold(t.BREW_A, BEER, 5000)
                c.contract(t.BREW_A, WATER, 3000)
                c.hold(t.BREW_A, WATER, 10000)
                c.plan(t.BREW_A, WH, BEER, 1000)
                c.site(WH, "Depot")
                c.hold(WH, BEER, 15000)
                c.contract(WH, BEER, level, smart=True)
                c.plan(WH, SHOP, BEER, 100000)
                c.shop(SHOP, "Shop")
                c.hold(SHOP, BEER, 2000, 2400)
                c.run()
                [line] = [l for site in c.supply["factories"]["sites"] for l in site["lines"]]
                self.assertEqual(line["needHours"]["dem"], 9)
                self.assertIsNone(c.fact(t.BREW_A, WATER, "dem")["setTo"])

    def test_a_hubs_timing_counts_the_plain_import_that_lands_below_it(self):
        """A hub importing 7,000 a week feeds its own shop (500 a day) and
        tops Regional up to 10,000; Regional's plain import of 12,000 a week
        lands whatever it holds, so once it has landed the hub's round
        brings little.

        Changed in round 15: the timing replays the rounds until the import
        lands. Regional holds 5,000 under its 10,000 target, so the hub's
        first morning round fills it up by 5,000, more than the 3,000 the
        hub holds: it runs dry before its own import (a shortfall, no ask).
        Holding enough to carry those rounds (14,000), the hub reads covered:
        after the landing it is charged only the reduced draw."""
        hub, hub_shop = ("hub_a", 7), ("shop_h", 8)
        for hub_stock, verdict in ((3000, ("short", "shortfall")), (14000, ("covered", None))):
            with self.subTest(hub_stock=hub_stock):
                c = self.hub_chain(hub, hub_shop, hub_stock)
                for mode in ("cap", "dem"):
                    fact = c.fact(hub, BEER, mode)
                    self.assertEqual((fact["st"], fact["why"], fact["setTo"]), verdict + (None,))
                self.assertEqual(len(c.notes(hub, "shortfall")), 1 if verdict[0] == "short" else 0)

    def hub_chain(self, hub, hub_shop, hub_stock):
        c = Chain()
        c.site(hub, "Hub")
        c.hold(hub, BEER, hub_stock)
        c.contract(hub, BEER, 7000)
        c.shop(hub_shop, "Hub shop")
        c.hold(hub_shop, BEER, 1000, 500)
        c.plan(hub, hub_shop, BEER, 100000)
        c.site(self.REGIONAL, "Regional")
        c.hold(self.REGIONAL, BEER, 5000)
        c.contract(self.REGIONAL, BEER, 12000)
        c.shop(self.SHOP_R, "Shop")
        c.hold(self.SHOP_R, BEER, 2000, 1200)
        c.plan(hub, self.REGIONAL, BEER, 10000)
        c.plan(self.REGIONAL, self.SHOP_R, BEER, 100000)
        c.run()
        return c

    def test_a_downstream_import_counts_only_once_it_lands(self):
        """Round 14: day 20; the hub holds 3,000, feeds its own shop 500 a
        day and tops Regional up to 1,500; Regional holds 1,500 and its shop
        sells 1,200 a day; both imports (7,000 and 12,000) land on day 24.
        Until Regional's lands, each morning's round tops it up to its target
        from the hub, so the hub runs dry before its own import: a
        shortfall. Round 15 adds the cases an independent replay of the
        rounds settles: sol's (hub 4,000, Regional 500 under 1,500), dry on
        day 22; and one the landing morning decides (hub 6,000, Regional at
        its 10,000), dry on day 24, whose round leaves before the imports
        land. With 14,000 at the hub the rounds are carried: covered."""
        hub, hub_shop = ("hub_a", 7), ("shop_h", 8)
        for hub_stock, reg_stock, target, verdict, dry in ((3000, 1500, 1500, "short", "Monday"),
                                                           (4000, 500, 1500, "short", "Monday"),
                                                           (6000, 10000, 10000, "short", "Wednesday"),
                                                           (14000, 5000, 10000, "covered", None)):
            with self.subTest(hub_stock=hub_stock, reg_stock=reg_stock, target=target):
                c = Chain()
                c.site(hub, "Hub")
                c.hold(hub, BEER, hub_stock)
                c.contract(hub, BEER, 7000)
                c.shop(hub_shop, "Hub shop")
                c.hold(hub_shop, BEER, 1000, 500)
                c.plan(hub, hub_shop, BEER, 100000)
                c.site(self.REGIONAL, "Regional")
                c.hold(self.REGIONAL, BEER, reg_stock)
                c.contract(self.REGIONAL, BEER, 12000)
                c.shop(self.SHOP_R, "Shop")
                c.hold(self.SHOP_R, BEER, 2000, 1200)
                c.plan(hub, self.REGIONAL, BEER, target)
                c.plan(self.REGIONAL, self.SHOP_R, BEER, 100000)
                c.run()
                self.assertEqual(c.day + 4, 24)
                for mode in ("cap", "dem"):
                    self.assertEqual(c.fact(hub, BEER, mode)["st"], verdict, mode)
                self.assertEqual(len(c.notes(hub, "shortfall")), 1 if verdict == "short" else 0)
                if dry:
                    # The day the independent replay of the rounds empties it
                    # (day 20 is a Saturday; day 22 Monday, day 24 Wednesday).
                    row = next(r for r in c.supply["imports"] if r["s"] == c.index(hub))
                    self.assertEqual(row["runsOut"], dry)

    def relay(self, hub_stock, reg_stock, target, own=0, profile=None):
        """A hub importing 7,000 a week tops Regional up to `target`;
        Regional imports 12,000 a week and its shop sells 1,200 a day; both
        imports land on day 24 (day 20 is a Saturday). `own` a day the hub's
        own shop sells, `profile` the company's weekday rhythm."""
        hub, hub_shop = ("hub_a", 7), ("shop_h", 8)
        c = Chain()
        c.profile = profile
        c.site(hub, "Hub")
        c.hold(hub, BEER, hub_stock)
        c.contract(hub, BEER, 7000)
        if own:
            c.shop(hub_shop, "Hub shop")
            c.hold(hub_shop, BEER, 1000, own)
            c.plan(hub, hub_shop, BEER, 100000)
        c.site(self.REGIONAL, "Regional")
        c.hold(self.REGIONAL, BEER, reg_stock)
        c.contract(self.REGIONAL, BEER, 12000)
        c.shop(self.SHOP_R, "Shop")
        c.hold(self.SHOP_R, BEER, 2000, 1200)
        c.plan(hub, self.REGIONAL, BEER, target)
        c.plan(self.REGIONAL, self.SHOP_R, BEER, 100000)
        c.run()
        row = next(r for r in c.supply["imports"] if r["s"] == c.index(hub))
        return c, hub, row

    def test_a_pure_relay_runs_dry_only_when_the_depot_it_feeds_would(self):
        """Round 16: a hub with nothing of its own to serve tops Regional up
        to 10,000; Regional holds 8,000 (or 4,000), enough to reach its own
        import: the fill-up is stock moved, not lost, and the hub reads
        covered in both bases, with no finding. With Regional at 500 under a
        1,500 target and the hub holding 4,000, Regional needs 700 on
        Saturday and 1,200 a day after: 4,300 by Tuesday, so the hub runs dry
        on Tuesday, and the finding names the round that does it."""
        for hub_stock, reg_stock in ((5000, 8000), (5000, 4000)):
            with self.subTest(hub_stock=hub_stock, reg_stock=reg_stock):
                c, hub, row = self.relay(hub_stock, reg_stock, 10000)
                for mode in ("cap", "dem"):
                    self.assertEqual(c.fact(hub, BEER, mode)["st"], "covered", mode)
                self.assertEqual(c.notes(hub, "shortfall"), [])
        c, hub, row = self.relay(4000, 500, 1500)
        for mode in ("cap", "dem"):
            self.assertEqual((c.fact(hub, BEER, mode)["st"], c.fact(hub, BEER, mode)["why"]), ("short", "shortfall"))
        self.assertEqual((row["runsOut"], row["topsUp"]), ("Tuesday", [c.index(self.REGIONAL), 1500]))
        [note] = c.notes(hub, "shortfall")
        self.assertIn("the morning rounds top Regional up to 1,500 before its own import lands", plain(note["text"]))

    def test_the_rounds_follow_the_depots_weekday_rhythm(self):
        """Round 16: weekends at 200%, weekdays at 60%. Saturday; the hub
        holds 8,000, imports 7,000 a week and its own shop sells 500 a day;
        it tops Regional up to 4,000; Regional holds 4,000, imports 12,000
        a week and its shop sells 1,200 a day; both imports land on
        Wednesday. Sunday's and Monday's rounds refill Regional's 2,400
        weekend days: the hub runs dry on Tuesday, and what it has to hold
        to the drop counts those rounds."""
        c, hub, row = self.relay(8000, 4000, 4000, own=500, profile=[200, 60, 60, 60, 60, 60, 200])
        self.assertEqual(WEEKDAYS[c.day % 7], "Saturday")
        for mode in ("cap", "dem"):
            self.assertEqual((c.fact(hub, BEER, mode)["st"], c.fact(hub, BEER, mode)["why"]), ("short", "shortfall"))
        self.assertEqual(row["runsOut"], "Tuesday")
        self.assertGreater(row["dueNeed"], row["stock"])

    def test_a_relay_beside_an_importing_depot_settles(self):
        """Round 14: a two-machine brewery (1,440 a day) tops Xdepot up to
        10,000 (it imports 14,000 a week; its shop sells 2,000 a day) and
        Central (no import), which tops Regional up (it imports 7,000 a
        week; its shop sells 1,000 a day). The brewery's split is solved
        before Central's limit is read from it, so the passes settle well
        inside the bound and nothing asks, in both bases.

        Round 15: the same with Xdepot's round at 1,000 and Central importing
        2,100 a week. Central's true limit (780 a day) is below Regional's
        ask while its damped limit is not yet; the walk keeps going until the
        limit has settled, and Central reads covered, not short by 166."""
        import ba_dashboard
        xdep, shop_x = ("xdep", 35), ("shop_x", 36)
        walk, passes = ba_dashboard._supply_walk, []

        def counted(*args, **kwargs):
            got = walk(*args, **kwargs)
            passes.append((counted.passes, counted.capped))
            return got

        for x_target, central_import in ((10000, 0), (1000, 2100)):
            with self.subTest(x_target=x_target, central_import=central_import):
                passes.clear()
                ba_dashboard._supply_walk = counted
                try:
                    c = Chain()
                    c.factory(BREWERY, "Brewery", machines=2)
                    c.hold(BREWERY, BEER, 500)
                    c.site(xdep, "Xdepot")
                    c.hold(xdep, BEER, 20000)
                    c.contract(xdep, BEER, 14000)
                    c.shop(shop_x, "Shop X")
                    c.hold(shop_x, BEER, 2000, 2000)
                    c.site(self.CENTRAL, "Central")
                    c.hold(self.CENTRAL, BEER, 20000)
                    if central_import:
                        c.contract(self.CENTRAL, BEER, central_import)
                    c.site(self.REGIONAL, "Regional")
                    c.hold(self.REGIONAL, BEER, 20000)
                    c.contract(self.REGIONAL, BEER, 7000)
                    c.shop(self.SHOP_R, "Shop R")
                    c.hold(self.SHOP_R, BEER, 2000, 1000)
                    c.plan(BREWERY, xdep, BEER, x_target)
                    c.plan(xdep, shop_x, BEER, 100000)
                    c.plan(BREWERY, self.CENTRAL, BEER, 10000)
                    c.plan(self.CENTRAL, self.REGIONAL, BEER, 10000)
                    c.plan(self.REGIONAL, self.SHOP_R, BEER, 100000)
                    c.run()
                finally:
                    ba_dashboard._supply_walk = walk
                self.assertEqual(len(passes), 2)
                self.assertLess(max(p for p, _capped in passes), ba_dashboard.HAND_ON_PASSES)
                self.assertFalse(any(capped for _p, capped in passes))
                for mode in ("cap", "dem"):
                    self.assertEqual([c.fact(a, BEER, mode)["setTo"] for a in (xdep, self.CENTRAL, self.REGIONAL)],
                                     [None, None, None], mode)
                    central = c.fact(self.CENTRAL, BEER, mode)
                    self.assertEqual((central["st"], central["setTo"]), ("covered", None), mode)

    def test_a_wholesale_contract_beside_a_covering_route_gets_no_word(self):
        """Round 15: a brewery (720 a day) tops a depot up to 5,000; the depot
        has a wholesale contract of 100 (or 20) a week too, and its shop
        sells 660 or 700 a day. The route brings the use, so the contract is
        a backup: covered by the route, nothing to set, whatever share of
        the margin its figures show."""
        shop = ("shop_w", 37)
        for weekly, sales in ((100, 660), (100, 700), (20, 700)):
            with self.subTest(weekly=weekly, sales=sales):
                c = Chain()
                c.factory(BREWERY, "Brewery", machines=1)
                c.hold(BREWERY, BEER, 500)
                c.site(WH, "Depot")
                c.hold(WH, BEER, 3000)
                c.wholesale(WH, BEER, weekly)
                c.plan(BREWERY, WH, BEER, 5000)
                c.plan(WH, shop, BEER, 100000)
                c.shop(shop, "Shop")
                c.hold(shop, BEER, 2000, sales)
                c.run()
                for mode in ("cap", "dem"):
                    fact = c.fact(WH, BEER, mode)
                    self.assertEqual((fact["st"], fact["why"], fact["setTo"]), ("covered", "route", None), mode)


class RoundEightTests(unittest.TestCase):
    """Several sites topping one depot up, judged as two questions (targets
    on the busiest day, supply on an average day) and checked by applying
    every change the board suggests and replaying six weeks of rounds from
    empty stock, in both orders, against a week with a busy Friday, judged
    on the last three."""

    HUB_A, HUB_B, BREW_A, BREW_B = ("hub_a", 7), ("hub_b", 8), ("brew_a", 5), ("brew_b", 6)

    def build(self, senders, sales, depot_stock=3000, depot_import=0):
        """`senders` [(addr, "hub" or "brewery", imported a week or
        machines, target, stock[, what its own shop sells a day])]; the
        depot, importing `depot_import` a week, tops a shop selling `sales`
        a day up."""
        c = Chain()
        c.profile = BUSY_WEEK
        for addr, kind, amount, target, held, *own in senders:
            if kind == "hub":
                c.site(addr, "Hub " + addr[0][-1])
                if amount:
                    c.contract(addr, BEER, amount)
            else:
                c.factory(addr, "Brewery " + addr[0][-1], machines=amount)
            c.hold(addr, BEER, held)
            c.plan(addr, WH, BEER, target)
            if own and own[0]:
                shop = ("own_" + addr[0], 20 + addr[1])
                c.plan(addr, shop, BEER, 100000)
                c.shop(shop, "Shop " + addr[0][-1])
                c.hold(shop, BEER, 2000, own[0])
        c.site(WH, "Depot")
        c.hold(WH, BEER, depot_stock)
        if depot_import:
            c.contract(WH, BEER, depot_import)
        c.plan(WH, SHOP, BEER, 100000)
        c.shop(SHOP, "Shop")
        c.hold(SHOP, BEER, 2000, sales)
        c.run()
        return c

    def suggestions(self, c, senders, mode="cap"):
        """{(what, site index): figure}: every change the board suggests in
        `mode`, a plan's top-up target, a hub's import or the depot's own."""
        changes = {}
        depot = c.fact(WH, BEER, mode)
        if depot["setTo"] is not None and depot["cad"] == "daily":
            for index, _have, level in [[depot["from"], None, depot["setTo"]]] + (depot.get("raise") or []):
                changes[("target", index)] = level
        elif depot["setTo"] is not None and depot["cad"] == "weekly":
            changes[("import", c.index(WH))] = depot["setTo"]
        for spec in senders:
            fact = c.fact(tuple(spec[0]), BEER, mode)
            if spec[1] == "hub" and fact and fact["setTo"] is not None and fact["cad"] == "weekly":
                changes[("import", c.index(tuple(spec[0])))] = fact["setTo"]
        return changes

    def settle(self, senders, sales, mode="cap", depot_import=0):
        """Apply every change the board suggests until it suggests none;
        returns the settled senders, the depot's import, the board, and how
        many rounds of changes it took."""
        senders = [list(s) for s in senders]
        for rounds in range(4):
            c = self.build(senders, sales, depot_import=depot_import)
            changes = self.suggestions(c, senders, mode)
            if not changes:
                return senders, depot_import, c, rounds
            depot_import = changes.get(("import", c.index(WH)), depot_import)
            for spec in senders:
                index = c.index(tuple(spec[0]))
                if ("target", index) in changes:
                    self.assertGreater(changes[("target", index)], spec[3], "a raise never lowers a target")
                    spec[3] = changes[("target", index)]
                if ("import", index) in changes:
                    spec[2] = changes[("import", index)]
        self.fail("the suggestions never settle")

    def replay(self, senders, sales, depot_import=0, board=None, mode="cap"):
        """Six weeks of rounds from empty stock, in both orders, a sender's
        own shop topped up before and after the depot; the last three judged.
        A brewery makes 30 an hour a machine for the hours `board` sizes its
        line to in `mode` (24 without a board), so a Demand sizing too short
        runs the depot dry."""
        def hours(addr):
            if board is None:
                return 24
            lines = [l for site in board.supply["factories"]["sites"] if site["s"] == board.index(addr)
                     for l in site["lines"]]
            return lines[0]["needHours"][mode] if lines else 24

        spec = {tuple(s[0]): {**({"import": (s[2], 3)} if s[1] == "hub"
                                 else {"made": 30 * s[2] * hours(tuple(s[0]))}),
                              **({"own": s[5]} if len(s) > 5 and s[5] else {})}
                for s in senders}
        targets = {tuple(s[0]): s[3] for s in senders}
        return [simulate_days(spec, targets, 0, sales, BUSY_WEEK, order=order, own_first=own_first,
                              depot_import=(depot_import, 3) if depot_import else None)
                for order in (list(spec), list(spec)[::-1]) for own_first in (False, True)]

    def check(self, senders, sales, most_rounds=1, replay=True, depot_only=False):
        """Settle and replay in both sizings: the depot feeds a shop, which
        each sizes alike, so both must settle the same way. `replay` False
        checks the settling alone; `depot_only` judges only the depot's shop
        (a sender's own shop drained by its round running first is the room
        model's known limit)."""
        for mode in ("cap", "dem"):
            with self.subTest(mode=mode):
                settled, depot_import, board, rounds = self.settle(senders, sales, mode)
                self.assertLessEqual(rounds, most_rounds, "one pass of changes should do")
                if replay:
                    runs = self.replay(settled, sales, depot_import, board, mode)
                    if depot_only:
                        runs = [[dry for dry in run if dry[0] == "depot"] for run in runs]
                    self.assertEqual(runs, [[]] * 4, settled)
        return settled, board

    def test_the_replay_catches_a_setup_left_short(self):
        """The simulator can fail: the short setups below, left as they are,
        run the depot's shop dry, and so does raising a sender whose own
        shop then goes without (round 9)."""
        for senders, sales in (([(self.HUB_A, "hub", 7000, 10000, 0), (self.HUB_B, "hub", 7000, 10000, 0)], 2400),
                               ([(self.HUB_A, "hub", 700, 500, 0), (self.HUB_B, "hub", 700, 500, 0)], 300),
                               ([(self.BREW_A, "brewery", 1, 500, 0), (self.BREW_B, "brewery", 1, 500, 0)], 1000)):
            with self.subTest(sales=sales):
                runs = self.replay(senders, sales)
                self.assertTrue(all(any(where == "depot" for where, _day in run) for run in runs), runs)
        both = [(self.HUB_A, "hub", 21000, 3590, 0), (self.HUB_B, "hub", 8080, 3590, 0, 780)]
        self.assertTrue(any(any(where == tuple(self.HUB_B) for where, _day in run)
                            for run in self.replay(both, 2400)))

    def test_two_hubs_short_of_imports_ask_there_not_at_the_depot(self):
        """Two hubs importing 7,000 a week each top the depot up to 10,000;
        the shop sells 2,400 a day. The targets hold the day; the imports do
        not: a note at the depot, and each hub's import asks for 9,660."""
        senders = [(self.HUB_A, "hub", 7000, 10000, 5000), (self.HUB_B, "hub", 7000, 10000, 5000)]
        c = self.build(senders, 2400)
        self.assertEqual((c.fact(WH, BEER)["st"], c.fact(WH, BEER)["why"]), ("noplan", "upstream"))
        self.assertEqual(c.notes(WH, "topup"), [])
        self.assertEqual([c.fact(hub, BEER)["setTo"] for hub in (self.HUB_A, self.HUB_B)], [9660, 9660])
        self.check(senders, 2400)

    def test_hubs_at_9000_a_week_are_not_a_tight_target(self):
        senders = [(self.HUB_A, "hub", 9000, 10000, 5000), (self.HUB_B, "hub", 9000, 10000, 5000)]
        c = self.build(senders, 2400)
        self.assertNotIn(c.fact(WH, BEER)["st"], ("short", "tight"))
        self.assertEqual([c.fact(hub, BEER)["setTo"] for hub in (self.HUB_A, self.HUB_B)], [9660, 9660])
        self.check(senders, 2400)

    def test_the_boards_own_import_setting_reads_covered(self):
        """Each hub imports the 9,660 the board would suggest: covered."""
        senders = [(self.HUB_A, "hub", 9660, 10000, 5000), (self.HUB_B, "hub", 9660, 10000, 5000)]
        c = self.build(senders, 2400)
        self.assertEqual((c.fact(WH, BEER)["st"], c.fact(WH, BEER)["setTo"]), ("covered", None))
        self.check(senders, 2400, most_rounds=0)

    def test_hubs_short_behind_targets_that_hold_is_an_upstream_note(self):
        """Hubs importing 700 a week top the depot up to 500; the shop sells
        300 a day. The targets hold the day, the imports do not: no target
        finding, and each hub's import asks for 1,210."""
        senders = [(self.HUB_A, "hub", 700, 500, 1000), (self.HUB_B, "hub", 700, 500, 1000)]
        c = self.build(senders, 300)
        self.assertEqual((c.fact(WH, BEER)["st"], c.fact(WH, BEER)["why"]), ("noplan", "upstream"))
        self.assertEqual(c.notes(WH, "topup"), [])
        self.assertEqual([c.fact(hub, BEER)["setTo"] for hub in (self.HUB_A, self.HUB_B)], [1210, 1210])
        self.check(senders, 300)

    def test_two_breweries_both_raised_when_neither_can_carry_the_day(self):
        """Breweries making 720 a day each top the depot up to 500; the shop
        sells 1,000 a day. Neither alone can bring the day: both plans rise,
        to the same level, named in one finding."""
        senders = [(self.BREW_A, "brewery", 1, 500, 0), (self.BREW_B, "brewery", 1, 500, 0)]
        c = self.build(senders, 1000)
        fact = c.fact(WH, BEER)
        self.assertEqual((fact["st"], fact["why"], fact["setTo"]), ("short", "target", 1500))
        self.assertEqual(fact.get("raise"), [[c.index(self.BREW_B), 500, 1500]])
        [note] = c.notes(WH, "topup")
        self.assertIn("raise the top-ups on the plans of", plain(note["text"]))
        self.check(senders, 1000)

    def test_a_brewery_beside_a_hub_on_a_low_target(self):
        """Round 6's case: the brewery (720) at 10,000 and a hub importing
        20,000 a week at 1,000; 2,400 a day. The hub's plan rises."""
        senders = [(self.BREW_A, "brewery", 1, 10000, 0), (self.HUB_A, "hub", 20000, 1000, 5000)]
        c = self.build(senders, 2400)
        fact = c.fact(WH, BEER)
        self.assertEqual((fact["st"], fact["why"], fact["from"], fact["have"], fact.get("raise")),
                         ("short", "target", c.index(self.HUB_A), 1000, None))
        self.check(senders, 2400)

    def test_targets_are_levels_not_a_sum(self):
        """5,000 and 1,000 against 6,000 a day; 1,000 and 1,000 against 2,400."""
        for targets, sales in (((5000, 1000), 6000), ((1000, 1000), 2400)):
            with self.subTest(targets=targets):
                senders = [(self.HUB_A, "hub", 70000, targets[0], 30000),
                           (self.HUB_B, "hub", 70000, targets[1], 30000)]
                c = self.build(senders, sales)
                self.assertEqual((c.fact(WH, BEER)["st"], c.fact(WH, BEER)["why"]), ("short", "target"))
                self.check(senders, sales)

    def test_supply_that_covers_the_use_is_judged_as_one_senders_is(self):
        """Round 9: two breweries (1,440 a day in all) against 1,400 a day
        read covered, as one brewery against 650 does; a leftover plan from
        a site with nothing coming in changes nothing."""
        senders = [(self.BREW_A, "brewery", 1, 5000, 0), (self.BREW_B, "brewery", 1, 5000, 0)]
        self.assertEqual(self.build(senders, 1400).fact(WH, BEER)["st"], "covered")
        self.check(senders, 1400, most_rounds=0)
        alone = self.build([(self.BREW_A, "brewery", 1, 5000, 0)], 650).fact(WH, BEER)
        beside = self.build([(self.BREW_A, "brewery", 1, 5000, 0), (self.HUB_A, "hub", 0, 5000, 0)], 650)
        self.assertEqual((alone["st"], alone["setTo"]), ("covered", None))
        self.assertEqual((beside.fact(WH, BEER)["st"], beside.fact(WH, BEER)["setTo"]), ("covered", None))
        self.assertEqual(beside.notes(WH, "order"), [])

    def test_the_sender_that_alone_holds_an_average_day_is_the_one_raised(self):
        """Round 9: hub A (21,000 a week) and hub B (7,000 a week, also
        feeding its own shop 780 a day) both at 1,000; the depot's shop sells
        2,400 a day. A alone brings an average day: only A's plan rises.
        Round 10: every change the board suggests settles in one pass, B's
        own import included, and with both targets at 3,000 as well. (With
        equal targets, B's round running first tops the depot up from stock
        its own shop needs, which the board's room model does not see: an
        older limit, so that variant is checked for settling only.)"""
        senders = [(self.HUB_A, "hub", 21000, 1000, 5000), (self.HUB_B, "hub", 7000, 1000, 5000, 780)]
        c = self.build(senders, 2400)
        fact = c.fact(WH, BEER)
        self.assertEqual((fact["st"], fact["from"], fact["setTo"], fact.get("raise")),
                         ("short", c.index(self.HUB_A), 3590, None))
        self.check(senders, 2400)
        self.check([(self.HUB_A, "hub", 21000, 3000, 5000), (self.HUB_B, "hub", 7000, 3000, 5000, 780)], 2400,
                   replay=False)

    def test_a_hub_short_beside_a_brewery_is_asked_for_once(self):
        """Round 9: a hub importing 7,000 a week and a brewery (720) both at
        10,000; 2,400 a day. The depot asks for an import of its own for the
        gap, and the hub's import is not asked for the same units."""
        senders = [(self.HUB_A, "hub", 7000, 10000, 5000), (self.BREW_A, "brewery", 1, 10000, 0)]
        c = self.build(senders, 2400)
        fact = c.fact(WH, BEER)
        self.assertEqual((fact["st"], fact["why"], fact["setTo"]), ("noplan", "order", 7280))
        self.assertIsNone(c.fact(self.HUB_A, BEER)["setTo"])
        self.check(senders, 2400)

    def test_a_factory_with_spare_hours_takes_what_a_hub_cannot_bring(self):
        """Round 10: a three-machine brewery (2,160 a day) and a hub
        importing 7,000 a week both top the depot up to 3,590; the shop
        sells 2,400 a day. The hub cannot carry half; the brewery has the
        hours. Both bases read covered and ask for nothing, and Demand sizes
        the brewery for what the hub cannot bring."""
        senders = [(self.BREW_A, "brewery", 3, 3590, 0), (self.HUB_B, "hub", 7000, 3590, 5000)]
        c = self.build(senders, 2400)
        for mode in ("cap", "dem"):
            with self.subTest(mode=mode):
                self.assertEqual([(c.fact(a, BEER, mode)["st"], c.fact(a, BEER, mode)["setTo"])
                                  for a in (WH, self.HUB_B)], [("covered", None), ("covered", None)])
        [line] = [l for site in c.supply["factories"]["sites"] for l in site["lines"]]
        # (2,400 - 7,000 / 7 / 1.15) x 1.15 a day of 2,160: 20 of 24 hours.
        self.assertEqual(line["needHours"], {"cap": 24, "dem": 20})
        self.check(senders, 2400, most_rounds=0)

    def test_a_hub_with_its_own_shop_keeps_its_import_beside_a_brewery(self):
        """Round 11: a brewery (four or six machines) and a hub importing
        7,000 a week top the depot up to 4,000 and 3,590; the depot's shop
        sells 2,400 a day and the hub also tops its own shop up (600 or 850 a
        day). The hub's import covers its own shop first and the depot with
        what is left; the brewery brings the rest. Both bases ask for
        nothing, and Demand sizes the brewery for its part: (2,400 - (1,000 /
        1.15 - 600)) x 1.15 = 2,450 a day of 2,880, 21 hours; with six
        machines and the 850 shop, (2,400 - 20) x 1.15 = 2,737 of 4,320, 16."""
        for machines, own, dem_hours in ((4, 600, 21), (6, 850, 16)):
            with self.subTest(machines=machines):
                senders = [(self.BREW_A, "brewery", machines, 4000, 0), (self.HUB_B, "hub", 7000, 3590, 5000, own)]
                c = self.build(senders, 2400)
                [line] = [l for site in c.supply["factories"]["sites"] for l in site["lines"]]
                self.assertEqual(line["needHours"], {"cap": 24, "dem": dem_hours})
                # The hub's round running first tops the depot up from stock its
                # own shop needs (the room model's known limit), so the replay
                # judges the depot's shop.
                self.check(senders, 2400, most_rounds=0, depot_only=True)

    def test_the_factory_comes_before_the_depots_own_import(self):
        """Round 12, factory first: the brewery-and-hub case above with the
        depot importing 0, 7,000 or 14,000 a week as well. The routes come
        first and the import brings only what they leave, so Demand keeps
        the brewery at 21 hours whatever the import, and the depot reads
        covered by its routes with nothing said about the import."""
        for depot_import in (0, 7000, 14000):
            with self.subTest(depot_import=depot_import):
                senders = [(self.BREW_A, "brewery", 4, 4000, 0), (self.HUB_B, "hub", 7000, 3590, 5000, 600)]
                c = self.build(senders, 2400, depot_import=depot_import)
                [line] = [l for site in c.supply["factories"]["sites"] for l in site["lines"]]
                self.assertEqual(line["needHours"], {"cap": 24, "dem": 21})
                for mode in ("cap", "dem"):
                    fact = c.fact(WH, BEER, mode)
                    self.assertEqual((fact["st"], fact["setTo"], fact.get("lower")), ("covered", None, None))
                self.assertEqual([n for group in ("order", "import", "topup", "dead") for n in c.notes(WH, group)], [])

    def test_a_lone_sender_short_of_its_day_takes_one_pass(self):
        """Round 11: a sender that is the only one topping its sites up has
        no one to hand its shortfall to: the walk settles at once rather
        than holding it down pass after pass."""
        import ba_dashboard
        walk, passes = ba_dashboard._supply_walk, []

        def counted(*args, **kwargs):
            got = walk(*args, **kwargs)
            passes.append(counted.passes)
            return got

        ba_dashboard._supply_walk = counted
        try:
            c = self.build([(self.HUB_A, "hub", 7000, 10000, 5000)], 2400)
            self.assertEqual(c.fact(self.HUB_A, BEER)["st"], "short")
            self.assertEqual(passes, [1, 1])  # 24/7 and Demand
            passes.clear()
            self.build([(self.HUB_A, "hub", 7000, 10000, 5000), (self.HUB_B, "hub", 7000, 10000, 5000)], 2400)
            self.assertEqual(len(passes), 2)
            self.assertLessEqual(max(passes), 3)
        finally:
            ba_dashboard._supply_walk = walk

    def test_a_factory_lines_gap_is_asked_for_once(self):
        """Round 10: the one-ask rule where the depot's need is factory
        lines. A brewery (720 a day) and a hub importing 7,000 a week top a
        depot up that feeds four soda machines eating 3,840 beer a day. The
        depot asks for an import of its own for the gap; the hub's import is
        not asked for the same units, and once the depot's is in place
        nothing asks."""
        soda = "ba:itemname_sodacan"
        soda_rid = next(rid for rid, item in RECIPE_ITEMS.items() if item == soda)
        sodas = ("soda_street", 9)

        def chain(depot_import=0, depot_stock=3000):
            c = Chain()
            c.recipes = {BEER: dict(RECIPES[BEER], out=30, ingredients=[]),
                         soda: {"slug": soda, "item": "Soda", "out": 30, "workstation": "bottledgoods",
                                "ingredients": [{"slug": BEER, "item": "Beer", "per": 40}]}}
            c.site(self.HUB_A, "Hub a")
            c.contract(self.HUB_A, BEER, 7000)
            c.hold(self.HUB_A, BEER, 5000)
            c.plan(self.HUB_A, WH, BEER, 20000)
            c.factory(self.BREW_A, "Brewery a")
            c.plan(self.BREW_A, WH, BEER, 20000)
            c.site(WH, "Depot")
            c.hold(WH, BEER, depot_stock)
            if depot_import:
                c.contract(WH, BEER, depot_import)
            c.plan(WH, sodas, BEER, 15000)
            c.factory(sodas, "Soda works", machines=4, rid=soda_rid)
            c.hold(sodas, BEER, 5000)
            c.run()
            return c

        c = chain()
        # The soda line has no shelf behind it, so Demand sizes it as 24/7
        # does: both bases ask the same, once, and settle.
        for mode in ("cap", "dem"):
            with self.subTest(mode=mode):
                fact = c.fact(WH, BEER, mode)
                self.assertEqual((fact["st"], fact["why"], fact["setTo"]), ("noplan", "order", 7 * (3840 - 1720)))
                self.assertEqual(fact["parts"]["lines"], 7 * 3840)
                self.assertIsNone(c.fact(self.HUB_A, BEER, mode)["setTo"])
                # With a week's stock in hand, so the first import's timing
                # (a finding of its own) is not what is judged.
                settled = chain(depot_import=fact["setTo"], depot_stock=15000)
                # Round 15 charged the hub's first fill-up of the depot (15,000
                # under its 20,000 target) and read a shortfall. Round 16: the
                # hub only relays to this depot, which holds a week's stock
                # and its own import, so the fill-up is stock moved, not lost:
                # nothing it serves goes short, and both read covered.
                self.assertEqual([(settled.fact(a, BEER, mode)["st"], settled.fact(a, BEER, mode)["setTo"])
                                  for a in (WH, self.HUB_A)], [("covered", None), ("covered", None)])

    def test_demand_sizing_keeps_only_its_own_plan_changes(self):
        """Round 9: two hubs top a water depot up to 100 each; it feeds a
        ten-machine brewery whose shop sells 300 a day. Full production
        raises both plans to 2,400; shop demand only hub A's, to 120, and no
        24/7 change shows through."""
        c = water_depot_chain()
        a, b = c.index(("hub_a", 11)), c.index(("hub_b", 12))

        def plans(mode):
            fact = _supply_fact(c.supply["facts"], c.index(WH), WATER, mode)
            return [[fact["from"], fact["have"], fact["setTo"]]] + (fact.get("raise") or [])

        self.assertEqual(plans("cap"), [[a, 100, 2400], [b, 100, 2400]])
        self.assertEqual(plans("dem"), [[a, 100, 120]])
        # Each basis replayed on its own draw, the brewery's water a day.
        for mode, draw in (("cap", 2400), ("dem", 100)):
            with self.subTest(mode=mode):
                targets = {"a": 100, "b": 100}
                for index, _have, level in plans(mode):
                    targets["a" if index == a else "b"] = level
                spec = {name: {"import": (14000, 3)} for name in ("a", "b")}
                runs = [simulate_days(spec, targets, 0, draw, [100] * 7, order=order)
                        for order in (["a", "b"], ["b", "a"])]
                self.assertEqual(runs, [[], []])


def water_depot_chain():
    """RoundEightTests' Demand case: two hubs importing 14,000 water a week
    top a depot holding 100 up to 100 each; the depot feeds a ten-machine
    brewery, whose shop sells 300 beer a day."""
    c = Chain()
    for addr, name in ((("hub_a", 11), "Hub a"), (("hub_b", 12), "Hub b")):
        c.site(addr, name)
        c.contract(addr, WATER, 14000)
        c.hold(addr, WATER, 14000)
        c.plan(addr, WH, WATER, 100)
    c.site(WH, "Water depot")
    c.hold(WH, WATER, 100)
    c.factory(BREWERY, "Brewery", machines=10)
    c.hold(BREWERY, WATER, 2000)
    c.hold(BREWERY, BEER, 2000)
    c.plan(WH, BREWERY, WATER, 3000)
    c.shop(SHOP, "Shop")
    c.hold(SHOP, BEER, 1000, 300)
    c.plan(BREWERY, SHOP, BEER, 1000)
    c.run()
    return c


def water_depot_board():
    """water_depot_chain() as the board reads it: tests/import_routes.test.cjs
    lists its top-up changes in each sizing."""
    c = water_depot_chain()
    return {"meta": {"character": "bottom-up", "day": c.day, "save": "Fixture"},
            "supply": c.supply, "businesses": c.business_list, "alerts": [], "plan": {"recipes": []}}


def two_breweries_board():
    """RoundEightTests' two breweries at 500 against 1,000 a day, as the board
    reads it: tests/import_routes.test.cjs counts its top-up changes."""
    t = RoundEightTests()
    c = t.build([(t.BREW_A, "brewery", 1, 500, 0), (t.BREW_B, "brewery", 1, 500, 0)], 1000)
    return {"meta": {"character": "bottom-up", "day": c.day, "save": "Fixture"},
            "supply": c.supply, "businesses": c.business_list, "alerts": [], "plan": {"recipes": []}}
