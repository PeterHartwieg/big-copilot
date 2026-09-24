"""One supply verdict per fact (R8), on synthetic fixtures only.

Python is the only verdict engine: every (site, item) held, needed or planned
carries one fact in supply.facts, with one status word, the figures behind it
in 24/7 sizing, and under `dem` only what Demand sizing changes. The findings
on Today read the same facts.
"""
import json
import os
import subprocess
import sys
import unittest

from ba_dashboard import (Names, RECIPE_ITEMS, SUPPLY_MARGIN, _alerts, _business, _coming_week,
                          _supply, _supply_fact, _supply_status, site_key)
from ba_save import Save

HERE = os.path.dirname(os.path.abspath(__file__))
SHOP_TYPE = "ba:businesstype_florist"
ADDR = ("ba:street_secondavenue", 10)
ROSE = "ba:itemname_rose"
BEER = "ba:itemname_beer"
WATER = "ba:itemname_water"
SODA = "ba:itemname_soda"
RID = next(rid for rid, item in RECIPE_ITEMS.items() if item == BEER)
RECIPES = {BEER: {"slug": BEER, "item": "Beer", "out": 30, "workstation": "bottledgoods",
                  "ingredients": [{"slug": WATER, "item": "Water", "per": 10}]}}
FACT_KEYS = {"st", "why", "lvl", "role", "cad", "use", "need", "have", "setTo", "parts",
             "lower", "imp", "ramp", "unfed", "via", "dem", "import", "from"}
BASE_KEYS = {"st", "why", "lvl", "role", "cad", "use", "need", "have", "setTo", "imp"}


# --- a shop's own trading days -----------------------------------------------

def sale_day(day, customers, sold):
    return {"dayNumber": day, "totalCustomers": customers,
            "itemSales": {"$items": [{"itemName": ROSE, "amountSold": sold, "totalPrice": sold}]
                          if sold else []}}


def shop_record(orders, opened=1):
    return {
        "BusinessName": "HART. Flowers", "businessTypeName": SHOP_TYPE,
        "StreetName": ADDR[0], "StreetNumber": ADDR[1], "creationDay": opened,
        "orderHistory": {"$items": list(orders)},
        "retailPrices": {"$items": [{"itemName": ROSE, "price": 2}]},
        "itemInstances": {"$items": []},
        "cachedFulfilledCustomerDemands": {"$items": []},
        "scheduleDays": {"$items": []},
    }


def business(orders, day, opened=1):
    save = Save({"EmployeeInstances": {"$items": []}}, {}, "")
    return _business(save, Names({}), shop_record(orders, opened), ADDR, {}, [], {ADDR: []}, day)


# --- a company: sites, stock, plans, imports and a delivery log ---------------

class Stub:
    def __init__(self, root):
        self.root = root

    def items(self, value):
        return value or []

    def deref(self, value):
        return value

    def address(self, value):
        return value


def tx(day, items):
    return {"dayOfDelivery": day,
            "deliveryItems": [{"itemName": item, "amountDelivered": amount}
                              for item, amount in items.items()]}


class Company:
    """A synthetic company for _supply(): each site an address, its stock and
    sales, the plans between them, the imports and the delivery log."""

    def __init__(self, day=20, hour=12):
        self.day, self.hour = day, hour
        self.sites, self.lines, self.log = [], {}, {}
        self.targets, self.contracts, self.deliveries = [], [], []

    def site(self, addr, name, status="support", kind="ba:businesstype_warehouse",
             machines=(), opened=0, trade_days=30, limit=None):
        self.sites.append({"addr": addr, "name": name, "status": status, "kind": kind,
                           "machines": list(machines), "opened": opened,
                           "tradeDays": trade_days, "limit": limit})
        self.lines.setdefault(addr, {})
        return addr

    def factory(self, addr, name, machines=1, rid=RID, **options):
        return self.site(addr, name, kind="ba:businesstype_factory",
                         machines=[rid] * machines, **options)

    def shop(self, addr, name, **options):
        return self.site(addr, name, status="retail", kind="ba:businesstype_giftshop", **options)

    def hold(self, addr, slug, units=0, rate=0.0, **more):
        self.lines[addr][slug] = {"units": units, "rate": rate, **more}

    def plan(self, source, dest, slug, amount):
        self.targets.append((source, dest, slug, amount))

    def contract(self, dest, slug, amount, *, smart=False, active=True, last=0, due=None, pier=1):
        order = {"importAddress": ("pier", pier), "isActive": active,
                 "nextDeliveryDay": due if due is not None else self.day + 4,
                 "products": [{"itemName": slug, "amount": amount, "amountOrderedLastWeek": last,
                               "assignedWarehouse": dest}]}
        if smart:
            order["isTarget"] = True
        self.contracts.append(order)

    def wholesale(self, dest, slug, amount, *, due=None, repeating=True, enabled=True):
        """A wholesale store's delivery contract to a shop (DeliveryContracts)."""
        self.deliveries.append({
            "enabled": enabled, "isUrgentOrder": False, "repeatingOrder": repeating,
            "nextDeliveryDay": due if due is not None else self.day + 3,
            "wholesaleAddress": ("wholesale_way", 1), "businessAddress": dest,
            "items": [{"itemName": slug, "amount": amount, "amountOrderedLastWeek": amount,
                       "amountOrderedThisWeek": 0}]})

    def ship(self, day, source, dest, items):
        """One shipment, logged at both ends; a shop keeps no log."""
        self.log.setdefault(source, []).append(tx(day, {i: -a for i, a in items.items()}))
        if dest is not None and dest not in {s["addr"] for s in self.sites if s["status"] == "retail"}:
            self.log.setdefault(dest, []).append(tx(day, dict(items)))

    def save(self):
        registrations = []
        for site in self.sites:
            machines = [{"$v": {"id": f"m-{i}", "priority": i, "selectedRecipeId": rid,
                                "workstationType": "ba:factoryworkstationtype_bottledgoodsworkstation",
                                **({"produceUpTo": True, "produceUpToValue": site["limit"]}
                                   if site["limit"] else {})}}
                        for i, rid in enumerate(site["machines"])]
            registrations.append({
                "RentedByPlayer": True, "StreetName": site["addr"][0], "StreetNumber": site["addr"][1],
                "itemInstances": machines, "deliveryTransactions": self.log.get(site["addr"], []),
                "scheduleDays": [{"day": d, "workShifts": [
                    {"itemInstanceId": f"m-{i}", "type": 1, "startingHour": 0, "endingHour": 24}
                    for i in range(len(machines))]} for d in range(7)],
            })
        plans = {}
        for source, dest, slug, amount in self.targets:
            plan = plans.setdefault(source, {"targetAddress": source, "destinations": []})
            plan["destinations"].append({"deliveryTargetAddress": dest,
                                         "stockTargets": [{"itemName": slug, "targetAmount": amount}]})
        return Stub({"Day": self.day, "Hour": self.hour, "Minute": 0,
                     "BuildingRegistrations": registrations,
                     "importPartnerships": self.contracts,
                     "DeliveryContracts": self.deliveries,
                     "logisticsManagerPlans": list(plans.values())})

    def businesses(self):
        out = []
        for site in self.sites:
            lines = [{"slug": slug, "item": slug.rsplit("_", 1)[-1].title(), "price": 1,
                      "units": line["units"], "rate": line["rate"],
                      "tradeRate": line.get("tradeRate", line["rate"]),
                      **({"weekSold": line["weekSold"]} if "weekSold" in line else {}),
                      **({"soldDays": line["soldDays"]} if line.get("soldDays") else {})}
                     for slug, line in self.lines[site["addr"]].items()]
            out.append({
                "key": site_key(site["addr"]), "name": site["name"], "code": "", "neighbourhood": "",
                "type": site["kind"], "typeSlug": site["kind"], "status": site["status"],
                "lines": lines, "opened": site["opened"], "tradeDays": site["tradeDays"],
                "revenue": 100.0, "profit": 10.0, "costCentre": False, "rent": 0.0, "staff": 1,
                "customers": 10, "satisfaction": {"overall": 100}, "promotion": 100,
                "marketingIndex": 100, "traffic": 0, "missingAmenities": [],
                "missingUniformLocker": False, "uniformGaps": [], "quitWarnings": 0,
                "staffDemands": [],
            })
        return out

    def run(self):
        self.business_list = self.businesses()
        self.supply = _supply(self.save(), Names({}), self.business_list, self.day, {}, RECIPES)
        return self.supply

    def index(self, addr):
        return next(i for i, s in enumerate(self.sites) if s["addr"] == addr)

    def fact(self, addr, slug, mode="cap"):
        return _supply_fact(self.supply["facts"], self.index(addr), slug, mode)

    def findings(self, mode="cap"):
        result = _alerts(self.business_list, self.supply, [], [], [], [], [], self.day, 0.0, mode)
        return result["lines"] + result["minor"]["rows"]


HUB, FACTORY, DISTRIB = ("pier_road", 1), ("mill_lane", 2), ("dock_street", 3)
SHOP_A, SHOP_B, GYM = ("main_street", 4), ("high_street", 5), ("park_road", 6)


def shelf_company(target=None, units=500, rate=100, trade_days=30, stock_at_hub=1000):
    """A hub, and a shop it tops up with soda."""
    c = Company()
    c.site(HUB, "Import Hub")
    c.shop(SHOP_A, "Soda Shop", trade_days=trade_days)
    c.hold(HUB, SODA, stock_at_hub)
    c.hold(SHOP_A, SODA, units, rate)
    if target is not None:
        c.plan(HUB, SHOP_A, SODA, target)
    return c


# --- tests ---------------------------------------------------------------------

class TradingDayTests(unittest.TestCase):
    """A shelf's rate is read over trading days: after the opening day, with
    somebody through the door."""

    def week(self):
        # Opened on day 1 (a partial day), shut on days 2 and 3, then 225 a day.
        return ([sale_day(1, 5, 50), sale_day(2, 0, 0), sale_day(3, 0, 0)]
                + [sale_day(d, 40, 225) for d in range(4, 8)])

    def test_the_rate_leaves_out_the_opening_day_and_the_days_nobody_came(self):
        b = business(self.week(), day=8)
        line = next(l for l in b["lines"] if l["slug"] == ROSE)
        self.assertEqual(line["tradeRate"], 225)
        self.assertEqual(line["rate"], round((50 + 4 * 225) / 7, 1))
        self.assertEqual(b["tradeDays"], 4)

    def test_a_week_is_the_trading_days_of_the_days_open(self):
        # Opened on day 1 and first traded on day 4, on day 8: four days at 225
        # since it first traded, so its week is seven of them.
        b = business(self.week(), day=8)
        self.assertEqual(next(l for l in b["lines"] if l["slug"] == ROSE)["weekSold"], 1575)
        # A shop a month old trading on Saturdays and Sundays only: two days' worth.
        weekends = [sale_day(d, 30 if d % 7 in (6, 0) else 0, 100 if d % 7 in (6, 0) else 0)
                    for d in range(2, 30)]
        b = business(weekends, day=30)
        self.assertEqual(next(l for l in b["lines"] if l["slug"] == ROSE)["weekSold"], 200)

    def test_a_site_under_a_week_old_keeps_its_trading_days(self):
        b = business(self.week()[:6], day=6)
        line = next(l for l in b["lines"] if l["slug"] == ROSE)
        self.assertEqual(line["soldDays"], [[4, 225], [5, 225]])
        # A week old, the line carries no days: nothing is extrapolated.
        self.assertNotIn("soldDays", next(l for l in business(self.week(), day=8)["lines"]))

    def test_the_coming_week_is_read_off_a_straight_line(self):
        # 100, 150, 200 on days 4-6: on day 7 the coming week centres on day 10.
        self.assertEqual(_coming_week([[4, 100], [5, 150], [6, 200]], 7), 400)
        self.assertIsNone(_coming_week([[4, 100]], 7))
        self.assertEqual(_coming_week([[4, 300], [5, 100]], 7), 0)


class StatusTableTests(unittest.TestCase):
    """The first row of the table that matches is the fact's one word."""

    def test_each_row(self):
        for probe, expected in (
            ({"made": True, "short": ["order"]}, ("made", None, "ok")),
            ({"paused": True, "cover": 3}, ("paused", "order", "critical")),
            ({"paused": True, "cover": 9}, ("paused", "order", "warn")),
            ({"noplan": "target", "noplanLvl": "warn"}, ("noplan", "target", "warn")),
            ({"young": "young", "short": ["target"]}, ("new", "young", "info")),
            ({"short": ["order", "shortfall"], "tight": "order"}, ("short", "order", "critical")),
            ({"short": ["dry"], "stalled": "notDrawn"}, ("short", "dry", "critical")),
            ({"stalled": "notDrawn", "idle": "overstock"}, ("stalled", "notDrawn", "warn")),
            ({"stalled": "waiting"}, ("stalled", "waiting", "info")),
            ({"idle": "targetHigh", "idleLvl": "warn", "tight": "target"}, ("idle", "targetHigh", "warn")),
            ({"tight": "shortfall", "covered": "route"}, ("tight", "shortfall", "warn")),
            ({"covered": "limit"}, ("covered", "limit", "ok")),
            ({"short": []}, ("covered", None, "ok")),
        ):
            with self.subTest(probe=probe):
                self.assertEqual(_supply_status(probe), expected)


class ShelfTests(unittest.TestCase):
    """A shelf's daily top-up against its busiest day, plus the margin."""

    def verdict(self, **options):
        c = shelf_company(**options)
        c.run()
        return c, c.fact(SHOP_A, SODA)

    def test_a_top_up_that_covers_the_day_but_not_the_margin_is_tight(self):
        c, fact = self.verdict(target=100)
        self.assertEqual((fact["st"], fact["why"], fact["lvl"]), ("tight", "target", "warn"))
        self.assertEqual((fact["role"], fact["cad"], fact["use"], fact["need"], fact["have"]),
                         ("shelf", "daily", 100, 115, 100))
        # 115, rounded up to the ten.
        self.assertEqual(fact["setTo"], 120)
        self.assertFalse([f for f in c.findings() if f["siteKey"] == site_key(SHOP_A)])

    def test_a_top_up_under_the_day_is_short_and_a_finding(self):
        c, fact = self.verdict(target=90)
        self.assertEqual((fact["st"], fact["why"], fact["setTo"]), ("short", "target", 120))
        [finding] = [f for f in c.findings() if f["siteKey"] == site_key(SHOP_A)]
        self.assertEqual((finding["group"], finding["level"]), ("outruns", "critical"))

    def test_a_top_up_with_the_margin_is_covered_and_asks_nothing(self):
        c, fact = self.verdict(target=120)
        self.assertEqual((fact["st"], fact["setTo"]), ("covered", None))
        self.assertFalse([f for f in c.findings() if f["siteKey"] == site_key(SHOP_A)])

    def test_a_shelf_on_no_plan_asks_for_one(self):
        # The hub holds too little to count as stock no plan sends on, so the
        # shelf says it itself.
        c, fact = self.verdict(units=150, stock_at_hub=900)
        self.assertEqual((fact["st"], fact["why"], fact["lvl"], fact["setTo"]),
                         ("noplan", "target", "warn", 120))
        [finding] = [f for f in c.findings() if f["siteKey"] == site_key(SHOP_A)]
        self.assertEqual(finding["group"], "unplanned")

    def test_a_shop_under_five_trading_days_is_new(self):
        _c, fact = self.verdict(target=50, trade_days=3)
        self.assertEqual((fact["st"], fact["why"], fact["lvl"]), ("new", "young", "info"))


class WholesaleTests(unittest.TestCase):
    """A shelf a wholesale store delivers each week (DeliveryContracts) is on
    a plan: its order is judged against a week of sales, plus the margin, and
    its stock against the days to the drop, as an import is."""

    def gym(self, amount, units=500, rate=100, **options):
        c = Company()
        c.site(HUB, "Import Hub")
        c.shop(GYM, "Gym")
        c.hold(HUB, SODA, 3000)
        c.hold(GYM, SODA, units, rate)
        c.wholesale(GYM, SODA, amount, **options)
        c.run()
        return c, c.fact(GYM, SODA)

    def test_a_weekly_order_with_the_margin_is_covered(self):
        c, fact = self.gym(900)
        self.assertEqual((fact["st"], fact["why"], fact["role"], fact["cad"]),
                         ("covered", None, "shelf", "weekly"))
        # A week's figures: 700 sold a week, 805 with the margin, 900 ordered.
        self.assertEqual((fact["use"], fact["need"], fact["have"], fact["setTo"]), (700, 805, 900, None))
        self.assertFalse([f for f in c.findings() if f["siteKey"] == site_key(GYM)])
        row = next(r for r in c.supply["shops"] if r["s"] == c.index(GYM))
        self.assertEqual((row["wholesale"], row["wholesaleDay"]), (900, "Tuesday"))

    def test_an_order_under_the_margin_is_tight_and_no_finding(self):
        c, fact = self.gym(750)
        self.assertEqual((fact["st"], fact["why"], fact["setTo"]), ("tight", "order", 810))
        self.assertFalse([f for f in c.findings() if f["siteKey"] == site_key(GYM)])

    def test_an_order_under_a_week_of_sales_is_short_and_a_finding(self):
        c, fact = self.gym(600)
        # The stock reaches the drop, so the order under the week warns.
        self.assertEqual((fact["st"], fact["why"], fact["lvl"]), ("short", "order", "warn"))
        [finding] = [f for f in c.findings() if f["siteKey"] == site_key(GYM)]
        self.assertEqual((finding["group"], finding["text"]),
                         ("outruns", "Soda's wholesale delivery brings 600 a week against the 700 it sells"))

    def test_stock_that_runs_out_before_the_drop_is_short(self):
        # 150 left, 100 a day, the delivery two and a half days off.
        c, fact = self.gym(900, units=150)
        self.assertEqual((fact["st"], fact["why"]), ("short", "shortfall"))
        [finding] = [f for f in c.findings() if f["siteKey"] == site_key(GYM)]
        self.assertIn("runs out before Tuesday's wholesale delivery", finding["text"])

    def test_a_shelf_on_a_wholesale_contract_is_never_not_routed(self):
        c, _fact = self.gym(900)
        hub = c.fact(HUB, SODA)
        self.assertEqual((hub["st"], hub["why"]), ("idle", "notMoving"))
        self.assertNotIn("unfed", hub)
        self.assertNotIn("via", c.fact(GYM, SODA))
        self.assertFalse([f for f in c.findings() if f["group"] in ("notrouted", "unplanned")])

    def test_a_one_off_order_is_no_standing_supply(self):
        for options in ({"repeating": False}, {"enabled": False}):
            with self.subTest(**options):
                _c, fact = self.gym(900, units=150, **options)
                self.assertEqual(fact["st"], "noplan")


def two_shop_company(contracts):
    """A hub imports soda and tops up two shops, each selling 100 a day and
    topped up to 120: the hub's week is what the shelves sell."""
    c = Company()
    c.site(HUB, "Import Hub")
    c.shop(SHOP_A, "Soda Shop")
    c.shop(SHOP_B, "Soda Bar")
    c.hold(HUB, SODA, 5000)
    for shop in (SHOP_A, SHOP_B):
        c.hold(shop, SODA, 100, 100)
        c.plan(HUB, shop, SODA, 120)
    for amount, options in contracts:
        c.contract(HUB, SODA, amount, **options)
    c.run()
    return c


class ChainMarginTests(unittest.TestCase):
    """The margin is added once, over the chain, and never per hop."""

    def test_the_hub_sizes_the_shelves_sales_plus_the_margin_once(self):
        c = two_shop_company([(1500, {})])
        fact = c.fact(HUB, SODA)
        # The shelves need 115 a day each with their margin; the hub's week is
        # their sales, 1,400, plus the margin once: 1,610, not 1,400 x 1.15 x 1.15.
        self.assertEqual((fact["use"], fact["need"]), (1400, round(1400 * (1 + SUPPLY_MARGIN))))
        self.assertEqual(fact["parts"], {"lines": 0, "sites": 1400, "route": 0})
        self.assertEqual((fact["st"], fact["why"], fact["setTo"]), ("tight", "order", 1610))
        self.assertTrue(fact["imp"])
        self.assertFalse([f for f in c.findings() if f["siteKey"] == site_key(HUB)])

    def test_an_order_under_the_use_is_short(self):
        fact = two_shop_company([(1300, {})]).fact(HUB, SODA)
        self.assertEqual((fact["st"], fact["why"], fact["have"], fact["setTo"]),
                         ("short", "order", 1300, 1610))

    def test_a_plain_order_half_again_past_the_need_could_be_lowered(self):
        fact = two_shop_company([(3000, {})]).fact(HUB, SODA)
        self.assertEqual((fact["st"], fact["setTo"], fact["lower"]), ("covered", None, 1610))
        # A Smart Delivery level only holds stock, so it is never told to lower.
        fact = two_shop_company([(3000, {"smart": True})]).fact(HUB, SODA)
        self.assertNotIn("lower", fact)

    def test_a_smart_delivery_level_is_found_by_replaying_the_pass(self):
        # A plain 500 delivered first counts toward the level: the level is the
        # week itself, 1,610, not 1,610 - 500.
        fact = two_shop_company([(500, {}), (1000, {"smart": True, "pier": 2})]).fact(HUB, SODA)
        self.assertEqual((fact["st"], fact["have"], fact["setTo"]), ("short", 1000, 1610))
        # A plain 500 delivered after it comes on top: the level needs 1,110.
        fact = two_shop_company([(1000, {"smart": True}), (500, {"pier": 2})]).fact(HUB, SODA)
        self.assertEqual((fact["st"], fact["setTo"]), ("tight", 1110))


class FindingsFollowFactsTests(unittest.TestCase):
    def company(self):
        """A shelf tight, a shelf covered, a hub short, a paused import."""
        c = Company()
        c.site(HUB, "Import Hub")
        c.site(DISTRIB, "Distrib")
        c.shop(SHOP_A, "Soda Shop")
        c.shop(SHOP_B, "Water Shop")
        c.hold(HUB, SODA, 5000)
        c.hold(DISTRIB, WATER, 700)
        c.hold(SHOP_A, SODA, 100, 100)
        c.hold(SHOP_B, WATER, 100, 100)
        c.plan(HUB, SHOP_A, SODA, 100)
        c.plan(DISTRIB, SHOP_B, WATER, 120)
        c.contract(HUB, SODA, 600)
        c.contract(DISTRIB, WATER, 1000, active=False)
        c.run()
        return c

    def test_every_covered_or_tight_fact_has_no_supply_finding(self):
        c = self.company()
        found = {(f["siteKey"], f.get("ev", {}).get("slug")) for f in c.findings()}
        words = set()
        for s, items in c.supply["facts"].items():
            for slug, fact in items.items():
                words.add(fact["st"])
                if fact["st"] in ("covered", "tight", "made", "new"):
                    self.assertNotIn((c.business_list[int(s)]["key"], slug), found, (s, slug, fact))
        self.assertTrue({"tight", "covered", "short", "paused"} <= words, words)

    def test_the_short_and_paused_facts_are_findings(self):
        c = self.company()
        groups = {(f["siteKey"], f["group"]) for f in c.findings()}
        self.assertIn((site_key(HUB), "order"), groups)
        self.assertIn((site_key(DISTRIB), "paused"), groups)


class IdleRuleTests(unittest.TestCase):
    """The ten cases of the idle-stock investigation (research/ux-audit-2026-09-24,
    section 6): stock is judged against what really draws on it."""

    def idle(self, c, addr, slug):
        return [r for r in c.supply["idle"] if r["s"] == c.index(addr) and r["slug"] == slug]

    def found(self, c, addr, groups=("dead", "target", "notrouted", "unplanned")):
        return [f for f in c.findings() if f["siteKey"] == site_key(addr) and f["group"] in groups]

    def test_1_a_slow_gym_with_a_high_target_is_a_target_not_stock_standing_still(self):
        c = Company()
        c.site(HUB, "Import Hub")
        c.shop(GYM, "Gym")
        c.hold(HUB, SODA, 100)
        c.hold(GYM, SODA, 600, 5)
        c.plan(HUB, GYM, SODA, 600)
        c.run()
        self.assertEqual((c.fact(GYM, SODA)["st"], c.fact(GYM, SODA)["why"]), ("idle", "targetHigh"))
        self.assertEqual([f["group"] for f in self.found(c, GYM)], ["target"])

    def not_routed(self):
        c = Company()
        c.site(HUB, "Import Hub")
        c.shop(GYM, "Gym")
        c.hold(HUB, SODA, 3000)
        c.hold(GYM, SODA, 1200, 120)
        c.run()
        return c

    def test_2_stock_no_plan_sends_to_a_gym_that_sells_it_is_not_routed(self):
        c = self.not_routed()
        hub = c.fact(HUB, SODA)
        self.assertEqual((hub["st"], hub["why"], hub["lvl"]), ("idle", "notRouted", "warn"))
        self.assertEqual(hub["unfed"], [[c.index(GYM), 120, 10.0]])
        gym = c.fact(GYM, SODA)
        self.assertEqual((gym["st"], gym["via"]), ("noplan", c.index(HUB)))
        [finding] = self.found(c, HUB)
        self.assertEqual(finding["group"], "notrouted")
        self.assertEqual(finding["text"],
                         "Import Hub holds 3,000 Soda no plan sends on; Gym sells 120/day "
                         "and holds ~10 days")
        # The gym's own no-plan finding gives way to it, and nothing is dead.
        self.assertEqual(self.found(c, GYM), [])
        self.assertFalse([f for f in c.findings() if f["group"] == "dead"])

    def test_3_stock_nobody_sells_or_needs_is_not_moving(self):
        c = Company()
        c.site(HUB, "Import Hub")
        c.hold(HUB, SODA, 5000)
        c.run()
        self.assertEqual((c.fact(HUB, SODA)["st"], c.fact(HUB, SODA)["why"]), ("idle", "notMoving"))
        self.assertEqual([f["group"] for f in self.found(c, HUB)], ["dead"])

    def test_4_a_factory_input_is_judged_on_its_machines_on_day_2_and_day_10(self):
        for day in (2, 10):
            with self.subTest(day=day):
                c = Company(day=day)
                c.site(HUB, "Import Hub")
                c.factory(FACTORY, "Factory", machines=12)  # 2,880 water a day
                c.hold(HUB, WATER, 400)
                c.hold(FACTORY, WATER, 20000)
                c.plan(HUB, FACTORY, WATER, 21600)
                days = [1] if day == 2 else range(3, 10)
                for d in days:
                    c.ship(d, HUB, FACTORY, {WATER: 21600 if day == 2 else 2880})
                c.run()
                self.assertEqual(self.idle(c, FACTORY, WATER), [])
                self.assertNotEqual(c.fact(FACTORY, WATER)["st"], "idle")

    def test_5_an_input_no_named_machine_eats_and_nothing_brings_is_not_moving(self):
        c = Company()
        c.factory(FACTORY, "Factory", rid="unknown-recipe")
        c.hold(FACTORY, WATER, 5000)
        c.run()
        [row] = self.idle(c, FACTORY, WATER)
        self.assertEqual((row["dead"], row["why"]), (True, "notMoving"))

    def shop(self, units, target, trade=225, calendar=136, trade_days=5, **more):
        c = Company(day=14)
        c.site(HUB, "Import Hub")
        c.shop(SHOP_A, "Soda Shop", trade_days=trade_days)
        c.hold(HUB, SODA, 100)
        c.hold(SHOP_A, SODA, units, calendar, tradeRate=trade, **more)
        c.plan(HUB, SHOP_A, SODA, target)
        c.run()
        return c

    def test_6_a_new_shop_is_read_at_its_trading_day_rate(self):
        # 4,455 is 2.8 weeks at 225 a trading day; at the calendar rate the
        # zero days and the half opening day make of it, 4.7.
        c = self.shop(4455, 4500)
        self.assertEqual(self.idle(c, SHOP_A, SODA), [])
        self.assertEqual(self.found(c, SHOP_A), [])

    def test_7_a_target_28_busiest_days_deep_is_a_target_finding(self):
        c = self.shop(6300, 28 * 225)
        [row] = self.idle(c, SHOP_A, SODA)
        self.assertEqual((row["why"], row["weeks"]), ("targetHigh", 4.0))
        self.assertEqual([f["group"] for f in self.found(c, SHOP_A)], ["target"])

    def smart_hub(self, weeks):
        c = Company()
        c.site(HUB, "Import Hub")
        c.factory(FACTORY, "Factory")  # 240 water a day, 1,680 a week
        level = round(weeks * 1680)
        c.hold(HUB, WATER, level)
        c.hold(FACTORY, WATER, 200)
        c.plan(HUB, FACTORY, WATER, 300)
        c.contract(HUB, WATER, level, smart=True)
        for d in range(13, 20):
            c.ship(d, HUB, FACTORY, {WATER: 240})
        c.run()
        return c

    def test_8_a_smart_delivery_level_weeks_past_the_need_is_an_import_level_finding(self):
        c = self.smart_hub(7)
        [row] = self.idle(c, HUB, WATER)
        self.assertEqual((row["why"], row["weeks"], row["importLevel"]), ("importHigh", 7.0, 11760))
        [finding] = self.found(c, HUB)
        self.assertEqual(finding["group"], "dead")
        self.assertIn("Smart Delivery keeps 11,760 in stock, 7 weeks of it, so lower the import",
                      finding["text"])
        c = self.smart_hub(1.15)
        self.assertEqual((self.idle(c, HUB, WATER), self.found(c, HUB)), ([], []))

    def test_9_a_weekend_shop_is_judged_on_the_days_it_trades(self):
        # 100 a day on Saturday and Sunday: its week is the 200 its two
        # trading days sell, not seven days at its trading-day rate, so 1,000
        # is five weeks of it. The shelf sits at its target: the target holds it.
        c = self.shop(1000, 1000, trade=100, calendar=29, trade_days=30, weekSold=200)
        [row] = self.idle(c, SHOP_A, SODA)
        self.assertEqual((row["why"], row["weeks"]), ("targetHigh", 5.0))
        self.assertEqual([f["group"] for f in self.found(c, SHOP_A)], ["target"])

    def test_10_the_idle_facts_and_the_findings_are_one_set(self):
        c = Company()
        c.site(HUB, "Import Hub")
        c.site(DISTRIB, "Distrib")
        c.shop(GYM, "Gym")
        c.shop(SHOP_A, "Soda Shop")
        c.hold(HUB, SODA, 3000)                   # not routed: the gym sells it
        c.hold(GYM, SODA, 1200, 120)
        c.hold(DISTRIB, WATER, 5000)              # not moving
        c.hold(SHOP_A, BEER, 6300, 225)           # a top-up target too high
        c.plan(DISTRIB, SHOP_A, BEER, 6300)
        c.run()
        idle = {(c.business_list[int(s)]["key"], slug)
                for s, items in c.supply["facts"].items()
                for slug, fact in items.items() if fact["st"] == "idle"}
        found = {(f["siteKey"], f["ev"]["slug"]) for f in c.findings()
                 if f["group"] in ("dead", "target", "notrouted")}
        self.assertEqual(idle, found)
        self.assertEqual(len(idle), 3)
        rows = {(c.business_list[r["s"]]["key"], r["slug"]) for r in c.supply["idle"]}
        self.assertEqual(rows, idle)


def beer_chain(import_amount=1700, opened_b=0, sold_b=100, sold_days_b=None, target=300):
    """The hub imports water for a factory (one machine: 240 water a day into
    720 beer), which tops up a depot that tops up two shops selling beer, 200
    and `sold_b` a day. Shop B opened on `opened_b`."""
    c = Company()
    c.site(HUB, "Import Hub")
    c.factory(FACTORY, "Brewery")
    c.site(DISTRIB, "Distrib")
    c.shop(SHOP_A, "Beer Bar")
    c.shop(SHOP_B, "Beer Shop", opened=opened_b)
    c.hold(HUB, WATER, 2000)
    c.hold(FACTORY, WATER, 250)
    c.hold(FACTORY, BEER, 300)
    c.hold(DISTRIB, BEER, 400)
    c.hold(SHOP_A, BEER, 200, 200)
    c.hold(SHOP_B, BEER, 100, sold_b, **({"soldDays": sold_days_b} if sold_days_b else {}))
    c.plan(HUB, FACTORY, WATER, target)
    c.plan(FACTORY, DISTRIB, BEER, 400)
    c.plan(DISTRIB, SHOP_A, BEER, 240)
    c.plan(DISTRIB, SHOP_B, BEER, 240)
    c.contract(HUB, WATER, import_amount)
    for d in range(13, 20):
        c.ship(d, HUB, FACTORY, {WATER: 240})
    c.run()
    return c


class DemandSizingTests(unittest.TestCase):
    """24/7 sizes a factory line at capacity with no margin; Demand at what
    the ends draw of its product, plus the margin once, never past capacity.
    A fact carries under `dem` only what Demand sizing changes."""

    def test_the_factory_input_is_sized_on_the_shops_in_demand_mode(self):
        c = beer_chain()
        fact = c.fact(FACTORY, WATER)
        # 24/7: the machine's 240 a day, no margin; the top-up of 300 covers it.
        self.assertEqual((fact["st"], fact["use"], fact["need"], fact["have"]),
                         ("covered", 240, 240, 300))
        # Demand: the shops sell 300 beer a day of the 720 the line could make,
        # so it eats 100 water, 115 with the margin, added once.
        self.assertEqual(fact["dem"], {"use": 100, "need": 115})
        dem = c.fact(FACTORY, WATER, "dem")
        self.assertEqual((dem["st"], dem["use"], dem["need"], dem["have"]), ("covered", 100, 115, 300))

    def test_the_import_is_sized_on_the_lines_in_each_mode(self):
        c = beer_chain(import_amount=900)
        cap, dem = c.fact(HUB, WATER), c.fact(HUB, WATER, "dem")
        self.assertEqual((cap["st"], cap["use"], cap["need"], cap["setTo"]), ("short", 1680, 1680, 1680))
        self.assertEqual(cap["parts"], {"lines": 1680, "sites": 0, "route": 0})
        self.assertEqual((dem["st"], dem["use"], dem["need"], dem["setTo"]), ("covered", 700, 805, None))
        self.assertEqual(dem["parts"], {"lines": 700, "sites": 0, "route": 0})
        # The finding follows the mode.
        cap_found = [f for f in c.findings("cap") if f["siteKey"] == site_key(HUB)]
        self.assertEqual([f["group"] for f in cap_found], ["feed"])
        self.assertFalse([f for f in c.findings("dem") if f["siteKey"] == site_key(HUB)])

    def test_a_fact_demand_sizing_leaves_alone_carries_no_dem(self):
        c = beer_chain()
        for addr, slug in ((SHOP_A, BEER), (SHOP_B, BEER), (DISTRIB, BEER), (FACTORY, BEER)):
            with self.subTest(addr=addr):
                self.assertNotIn("dem", c.fact(addr, slug))

    def test_a_shop_open_four_days_is_extrapolated_and_named(self):
        # Opened on day 16, selling 50, 75 and 100 on days 17 to 19: the coming
        # week centres on day 23, where the line reads 200 a day.
        c = beer_chain(opened_b=16, sold_b=75, sold_days_b=[[17, 50], [18, 75], [19, 100]])
        dem = c.fact(FACTORY, WATER, "dem")
        # 200 + 200 = 400 beer a day of 720: 133 water, 153 with the margin.
        self.assertEqual((dem["use"], dem["need"]), (133, 153))
        self.assertEqual(dem["ramp"], [c.index(SHOP_B)])
        self.assertEqual(c.fact(HUB, WATER, "dem")["ramp"], [c.index(SHOP_B)])
        self.assertNotIn("ramp", c.fact(FACTORY, WATER))

    def test_a_shop_open_a_week_is_read_as_it_sells(self):
        c = beer_chain(opened_b=13, sold_b=75, sold_days_b=[[17, 50], [18, 75], [19, 100]])
        dem = c.fact(FACTORY, WATER, "dem")
        self.assertEqual(dem["use"], round(240 * 275 / 720))
        self.assertNotIn("ramp", dem)

    def test_demand_never_sizes_past_capacity(self):
        c = beer_chain()
        c.lines[SHOP_A][BEER]["rate"] = 2000
        c.run()
        fact = c.fact(FACTORY, WATER)
        # The shops want more than the line can make: both modes read 240.
        self.assertNotIn("dem", fact)
        self.assertEqual((fact["use"], fact["need"]), (240, 240))


class ExtractTests(unittest.TestCase):
    """What extract() sends: the facts, the margin and the rounding, and the
    findings twice, the second time with factory lines sized on demand."""

    def test_the_payload_carries_the_facts_and_both_passes_of_findings(self):
        import tempfile
        import es3_fixture
        from ba_dashboard import extract
        from ba_save import load_save
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, "link.hsg")
            es3_fixture.write_link_save(path)
            data = extract(load_save(path), Names({}), None)
        supply = data["supply"]
        self.assertEqual((supply["margin"], supply["roundTo"]), (SUPPLY_MARGIN, 10))
        self.assertIsInstance(supply["facts"], dict)
        for items in supply["facts"].values():
            for fact in items.values():
                self.assertLessEqual(BASE_KEYS, set(fact))
                self.assertLessEqual(set(fact), FACT_KEYS)
        self.assertEqual(set(data["alertsDemand"]), {"lines", "minor"})
        self.assertEqual(set(data["alertsDemand"]["minor"]), set(data["minor"]))
        json.dumps(data)

    def test_tight_is_never_a_finding_in_either_mode(self):
        c = beer_chain(import_amount=1700, target=105)  # Demand: 105 against 100, 115 with the margin
        seen = 0
        for mode in ("cap", "dem"):
            tight = {(c.business_list[int(s)]["key"], slug)
                     for s, items in c.supply["facts"].items() for slug in items
                     if _supply_fact(c.supply["facts"], s, slug, mode)["st"] == "tight"}
            found = {(f["siteKey"], f.get("ev", {}).get("slug")) for f in c.findings(mode)}
            self.assertFalse(tight & found, mode)
            seen += len(tight)
        self.assertTrue(seen, "the fixture holds a tight fact")


class RoundOneFixTests(unittest.TestCase):
    """Review round 1: the fixes each on a company of its own."""

    def mill(self, own=1000):
        """The Hub imports 800 a week and tops the Mill up to 300; the Mill
        imports `own` a week itself and eats 1,680 a week."""
        c = Company()
        c.site(HUB, "Import Hub")
        c.factory(FACTORY, "Mill")
        c.hold(HUB, WATER, 2000)
        c.hold(FACTORY, WATER, 250)
        c.hold(FACTORY, BEER, 300)
        c.plan(HUB, FACTORY, WATER, 300)
        c.contract(HUB, WATER, 800)
        c.contract(FACTORY, WATER, own)
        for d in range(13, 20):
            c.ship(d, HUB, FACTORY, {WATER: 100})
        c.run()
        return c

    def test_m1_a_factory_input_with_its_own_import_keeps_that_contract(self):
        c = self.mill()
        fact = c.fact(FACTORY, WATER)
        # One daily word for the input, and its own contract judged beside it.
        self.assertEqual((fact["role"], fact["cad"], fact["imp"]), ("input", "daily", True))
        own = fact["import"]
        self.assertEqual((own["cad"], own["have"], own["use"]), ("weekly", 1000, 1000))
        self.assertEqual(own["st"], "covered")
        self.assertEqual(set(own) - FACT_KEYS, set())
        # The Hub answers for the rest of the 1,680.
        self.assertEqual(c.fact(HUB, WATER)["use"], 680)

    def test_m1_a_paused_own_import_the_input_is_short_without_warns_and_the_hub_carries_the_week(self):
        c = Company()
        c.site(HUB, "Import Hub")
        c.factory(FACTORY, "Mill")
        c.hold(HUB, WATER, 2000)
        c.hold(FACTORY, WATER, 250)
        c.hold(FACTORY, BEER, 300)
        c.plan(HUB, FACTORY, WATER, 200)
        c.contract(HUB, WATER, 800)
        c.contract(FACTORY, WATER, 1000, active=False)
        for d in range(13, 20):
            c.ship(d, HUB, FACTORY, {WATER: 100})
        c.run()
        # A top-up of 200 for a line that eats 240: short without the contract.
        self.assertEqual(c.fact(FACTORY, WATER)["st"], "short")
        own = c.fact(FACTORY, WATER)["import"]
        self.assertEqual((own["st"], own["why"], own["lvl"], own["have"]), ("paused", "order", "critical", 1000))
        # A paused contract brings nothing: the Hub carries the Mill's whole week.
        self.assertEqual((c.fact(HUB, WATER)["st"], c.fact(HUB, WATER)["use"]), ("short", 1680))
        # Said with the input, both ways out, and linked to Feed the factories.
        [paused] = [f for f in c.findings() if "paused" in f["text"]]
        self.assertEqual((paused["level"], paused["group"], paused["text"]), (
            "critical", "feed", "Water import to Mill is paused and Import Hub's top-up of 200 falls "
            "short; resume the contract or raise the top-up to 240"))

    def test_s2_a_depot_line_whose_only_outflow_was_a_first_fill_is_not_moving(self):
        c = Company()
        c.site(HUB, "Import Hub")
        c.factory(FACTORY, "Brewery")
        c.hold(HUB, WATER, 2000)
        c.hold(HUB, SODA, 2000)
        c.hold(FACTORY, WATER, 250)
        c.hold(FACTORY, SODA, 2000)
        c.plan(HUB, FACTORY, WATER, 300)
        c.plan(HUB, FACTORY, SODA, 2000)
        c.contract(HUB, WATER, 1700)
        c.contract(HUB, SODA, 2000, smart=True)
        for d in range(13, 20):
            c.ship(d, HUB, FACTORY, {WATER: 240})
        c.ship(16, HUB, FACTORY, {SODA: 2000})  # the target's first fill
        c.run()
        hub = c.fact(HUB, SODA)
        self.assertEqual((hub["st"], hub["why"], hub["use"]), ("idle", "notMoving", 0))
        # Before the import has no draw to walk for it: Idle stock holds it.
        self.assertFalse([r for r in c.supply["imports"] if r["slug"] == SODA])
        self.assertTrue([r for r in c.supply["idle"] if r["slug"] == SODA and r["s"] == c.index(HUB)])

    def test_s3_a_wholesale_order_short_of_the_week_warns_while_the_stock_reaches_the_drop(self):
        c = Company()
        c.shop(GYM, "Gym")
        c.hold(GYM, SODA, 500, 100)
        c.wholesale(GYM, SODA, 600)
        c.run()
        self.assertEqual((c.fact(GYM, SODA)["st"], c.fact(GYM, SODA)["lvl"]), ("short", "warn"))
        c = Company()
        c.shop(GYM, "Gym")
        c.hold(GYM, SODA, 150, 100)
        c.wholesale(GYM, SODA, 600)
        c.run()
        self.assertEqual((c.fact(GYM, SODA)["st"], c.fact(GYM, SODA)["lvl"]), ("short", "critical"))

    def test_s4_a_new_fact_carries_no_figure_to_set(self):
        c = shelf_company(target=50, trade_days=3)
        c.run()
        fact = c.fact(SHOP_A, SODA)
        self.assertEqual((fact["st"], fact["setTo"]), ("new", None))

    def starved(self, earlier):
        """A brewery fed 60 a day on days 16-19 of a 240 a day line; `earlier`
        is a day before the window it was fed on, or None."""
        c = Company()
        c.site(HUB, "Import Hub")
        c.factory(FACTORY, "Brewery")
        c.site(DISTRIB, "Distrib")
        c.hold(HUB, WATER, 2000)
        c.hold(FACTORY, WATER, 20)
        c.hold(FACTORY, BEER, 300)
        c.plan(HUB, FACTORY, WATER, 300)
        c.plan(FACTORY, DISTRIB, BEER, 400)
        c.contract(HUB, WATER, 1700)
        c.ship(11, FACTORY, DISTRIB, {BEER: 100})  # the log reaches back past the window
        if earlier is not None:
            c.ship(earlier, HUB, FACTORY, {WATER: 240})
        for d in range(16, 20):
            c.ship(d, HUB, FACTORY, {WATER: 60})
        c.run()
        return c.fact(FACTORY, WATER)

    def test_s5_a_first_fill_is_the_first_the_whole_log_names_the_item(self):
        self.assertEqual((self.starved(None)["st"], self.starved(None)["why"]), ("new", "firstFill"))
        # Fed on day 8, before the window: starved now, not new.
        self.assertNotEqual(self.starved(8)["st"], "new")

    def test_s6_a_week_of_a_weekend_shop_is_two_trading_days(self):
        c = Company()
        c.shop(GYM, "Gym")
        c.hold(GYM, SODA, 500, 29, tradeRate=100, weekSold=200)
        c.wholesale(GYM, SODA, 250)
        c.run()
        fact = c.fact(GYM, SODA)
        self.assertEqual((fact["use"], fact["st"]), (200, "covered"))

    def depot_fed(self, target):
        """Distrib, topped up from the Hub to `target`, sends 100 a day to a
        shop; the Hub's route brought 50 a day of it."""
        c = Company()
        c.site(HUB, "Import Hub")
        c.site(DISTRIB, "Distrib")
        c.shop(SHOP_A, "Soda Shop")
        c.hold(HUB, SODA, 5000)
        c.hold(DISTRIB, SODA, 300)
        c.hold(SHOP_A, SODA, 100, 100)
        c.plan(HUB, DISTRIB, SODA, target)
        c.plan(DISTRIB, SHOP_A, SODA, 150)
        for d in range(13, 20):
            c.ship(d, HUB, DISTRIB, {SODA: 50})
            c.ship(d, DISTRIB, SHOP_A, {SODA: 100})
        c.run()
        return c.fact(DISTRIB, SODA)

    def test_n3_a_depot_only_a_route_feeds_is_judged_on_its_top_up(self):
        self.assertEqual((self.depot_fed(80)["st"], self.depot_fed(80)["why"]), ("short", "target"))
        self.assertEqual((self.depot_fed(104)["st"], self.depot_fed(104)["why"]), ("tight", "target"))
        self.assertEqual((self.depot_fed(200)["st"], self.depot_fed(200)["why"]), ("covered", "route"))

    def test_n4_an_office_has_no_supply_facts(self):
        c = Company()
        c.site(HUB, "Law Office", status="office", kind="ba:businesstype_lawfirm")
        c.hold(HUB, SODA, 5000, 10)
        c.run()
        self.assertNotIn(str(c.index(HUB)), c.supply["facts"])


class RoundTwoFixTests(unittest.TestCase):
    """Review round 2: the fixes each on a company of its own."""

    def test_a_new_sites_first_fill_is_no_draw_at_the_depot_behind_it(self):
        # The Hub tops a brewery that opened on day 16 up with 2,000, then
        # 240 a day; the brewery's log starts on the fill.
        c = Company()
        c.site(HUB, "Import Hub")
        c.factory(FACTORY, "Brewery")
        c.hold(HUB, WATER, 2000)
        c.hold(FACTORY, WATER, 1900)
        c.hold(FACTORY, BEER, 300)
        c.plan(HUB, FACTORY, WATER, 2000)
        c.contract(HUB, WATER, 1700)
        c.ship(16, HUB, FACTORY, {WATER: 2000})
        for d in (17, 18, 19):
            c.ship(d, HUB, FACTORY, {WATER: 240})
        c.run()
        row = next(r for r in c.supply["imports"] if r["slug"] == WATER)
        self.assertEqual(row["perDay"], 240)
        self.assertNotEqual(c.fact(HUB, WATER)["st"], "short")
        self.assertFalse([f for f in c.findings() if f["siteKey"] == site_key(HUB)])
        # The brewery's own input is on its first fill, by the same rule.
        self.assertEqual((c.fact(FACTORY, WATER)["st"], c.fact(FACTORY, WATER)["why"]), ("new", "firstFill"))

    def test_a_depot_only_a_route_feeds_carries_its_day_and_a_figure_to_set(self):
        short = RoundOneFixTests().depot_fed(80)
        # A day's figures: its busiest day's draw of 100, 115 with the margin,
        # against the 80 the top-up holds, and the top-up to set.
        self.assertEqual((short["cad"], short["use"], short["need"], short["have"], short["setTo"]),
                         ("daily", 100, 115, 80, 120))
        self.assertNotIn("parts", short)
        tight = RoundOneFixTests().depot_fed(104)
        self.assertEqual((tight["st"], tight["setTo"]), ("tight", 120))

    def test_a_short_route_fed_depot_is_a_finding_and_a_tight_one_is_not(self):
        for target, found in ((80, 1), (104, 0), (200, 0)):
            with self.subTest(target=target):
                c = Company()
                c.site(HUB, "Import Hub")
                c.site(DISTRIB, "Distrib")
                c.shop(SHOP_A, "Soda Shop")
                c.hold(HUB, SODA, 5000)
                c.hold(DISTRIB, SODA, 300)
                c.hold(SHOP_A, SODA, 100, 100)
                c.plan(HUB, DISTRIB, SODA, target)
                c.plan(DISTRIB, SHOP_A, SODA, 150)
                for d in range(13, 20):
                    c.ship(d, HUB, DISTRIB, {SODA: 50})
                    c.ship(d, DISTRIB, SHOP_A, {SODA: 100})
                c.run()
                notes = [f for f in c.findings() if f["siteKey"] == site_key(DISTRIB)]
                self.assertEqual(len(notes), found, notes)
                if found:
                    self.assertEqual((notes[0]["level"], notes[0]["group"]), ("critical", "topup"))
                    self.assertIn("raise the top-up to 120", notes[0]["text"])

    def test_stock_a_factory_holds_that_a_depots_plans_need_is_not_routed(self):
        # The factory is topped up with soda nothing there uses; the Distrib
        # sends soda to a shop but nothing brings the Distrib any.
        c = Company()
        c.site(HUB, "Import Hub")
        c.factory(FACTORY, "Brewery")
        c.site(DISTRIB, "Distrib")
        c.shop(SHOP_A, "Soda Shop")
        c.hold(HUB, SODA, 100)
        c.hold(FACTORY, SODA, 2000)
        c.hold(SHOP_A, SODA, 50, 100)
        c.plan(HUB, FACTORY, SODA, 2000)
        c.plan(DISTRIB, SHOP_A, SODA, 150)
        c.run()
        fact = c.fact(FACTORY, SODA)
        self.assertEqual((fact["st"], fact["why"]), ("idle", "notRouted"))
        self.assertEqual([u[0] for u in fact["unfed"]], [c.index(DISTRIB)])
        [note] = [f for f in c.findings() if f["siteKey"] == site_key(FACTORY)
                  and f["group"] in ("notrouted", "dead")]
        self.assertEqual(note["group"], "notrouted")
        self.assertIn("Distrib needs 100/day", note["text"])

    def test_a_top_up_nothing_uses_offers_a_plan_or_stopping_it(self):
        c = Company()
        c.site(HUB, "Import Hub")
        c.factory(FACTORY, "Brewery")
        c.hold(HUB, SODA, 100)
        c.hold(FACTORY, SODA, 2000)
        c.plan(HUB, FACTORY, SODA, 2000)
        c.run()
        [note] = [f for f in c.findings() if f["siteKey"] == site_key(FACTORY)
                  and f["group"] in ("notrouted", "dead")]
        self.assertIn("no plan sends it on: add a plan to the shops that should get it, "
                      "or stop the top-up", note["text"])
        self.assertNotIn("remove", note["text"])


class RoundThreeFixTests(unittest.TestCase):
    """Review round 3: the fixes each on a company of its own."""

    def test_a_depot_a_wholesale_store_feeds_is_fed_so_nothing_is_not_routed_to_it(self):
        # Distrib gets 1,000 soda a week wholesale and sends it to a shop; the
        # Brewery holds 2,000 soda nothing uses.
        c = Company()
        c.site(HUB, "Import Hub")
        c.factory(FACTORY, "Brewery")
        c.site(DISTRIB, "Distrib")
        c.shop(SHOP_A, "Soda Shop")
        c.hold(HUB, SODA, 100)
        c.hold(FACTORY, SODA, 2000)
        c.hold(DISTRIB, SODA, 500)
        c.hold(SHOP_A, SODA, 50, 100)
        c.plan(HUB, FACTORY, SODA, 2000)
        c.plan(DISTRIB, SHOP_A, SODA, 150)
        c.wholesale(DISTRIB, SODA, 1000)
        c.run()
        fact = c.fact(FACTORY, SODA)
        self.assertEqual((fact["st"], fact["why"]), ("idle", "notMoving"))
        self.assertNotIn("unfed", fact)
        self.assertFalse([f for f in c.findings() if f["group"] == "notrouted"])

    def test_a_paused_own_import_never_makes_a_topped_up_input_direct(self):
        # The Mill's own contract, paused at 2,000, would cover the week; the
        # Hub's top-up of 300 is what brings it.
        c = Company()
        c.site(HUB, "Import Hub")
        c.factory(FACTORY, "Mill")
        c.hold(HUB, WATER, 2000)
        c.hold(FACTORY, WATER, 250)
        c.hold(FACTORY, BEER, 300)
        c.plan(HUB, FACTORY, WATER, 300)
        c.contract(HUB, WATER, 800)
        c.contract(FACTORY, WATER, 2000, active=False)
        for d in range(13, 20):
            c.ship(d, HUB, FACTORY, {WATER: 240})
        c.run()
        fact = c.fact(FACTORY, WATER)
        self.assertEqual((fact["role"], fact["cad"], fact["have"], fact["st"]), ("input", "daily", 300, "covered"))
        own = fact["import"]
        # The top-up covers the line: paused on purpose, most likely; no finding.
        self.assertEqual((own["st"], own["why"], own["lvl"], own["have"], own["from"]),
                         ("paused", "topup", "info", 2000, c.index(HUB)))
        need = next(n for s in c.supply["factories"]["sites"] for n in s["needs"] if n["slug"] == WATER)
        self.assertFalse(need["directImport"])
        self.assertEqual(c.fact(HUB, WATER)["use"], 1680)
        self.assertFalse([f for f in c.findings() if f["group"] == "paused"])

    def test_a_depot_a_wholesale_store_feeds_is_judged_on_its_contract(self):
        # Distrib gets 1,000 water a week wholesale and tops the brewery up
        # to 300; the brewery eats 1,680 a week.
        def run(amount):
            c = Company()
            c.factory(FACTORY, "Brewery")
            c.site(DISTRIB, "Distrib")
            c.hold(DISTRIB, WATER, 2000)
            c.hold(FACTORY, WATER, 250)
            c.hold(FACTORY, BEER, 300)
            c.plan(DISTRIB, FACTORY, WATER, 300)
            c.wholesale(DISTRIB, WATER, amount)
            c.run()
            return c
        c = run(1000)
        fact = c.fact(DISTRIB, WATER)
        self.assertEqual((fact["st"], fact["why"], fact["cad"], fact["have"], fact["use"]),
                         ("short", "order", "weekly", 1000, 1680))
        self.assertFalse([f for f in c.findings() if "no standing import" in f["text"]])
        # Said from the fact, on the depot's page by way of its factory lines.
        [note] = [f for f in c.findings() if f["siteKey"] == site_key(DISTRIB)]
        self.assertEqual((note["group"], note["text"]), (
            "feed", "Water's wholesale delivery brings 1,000 a week against 1,680 used; "
            "raise the contract to 1,680"))
        self.assertEqual(run(2000).fact(DISTRIB, WATER)["st"], "covered")

    def wholesale_distrib(self, amount, top_up=None):
        """Distrib gets `amount` soda a week wholesale and sends 100 a day to a
        shop; `top_up`, the Hub's route to it, brings 50 a day of it."""
        c = Company()
        c.site(HUB, "Import Hub")
        c.site(DISTRIB, "Distrib")
        c.shop(SHOP_A, "Soda Shop")
        c.hold(HUB, SODA, 5000)
        c.hold(DISTRIB, SODA, 300)
        c.hold(SHOP_A, SODA, 100, 100)
        c.plan(DISTRIB, SHOP_A, SODA, 150)
        c.wholesale(DISTRIB, SODA, amount)
        if top_up:
            c.plan(HUB, DISTRIB, SODA, top_up)
        for d in range(13, 20):
            c.ship(d, DISTRIB, SHOP_A, {SODA: 100})
            if top_up:
                c.ship(d, HUB, DISTRIB, {SODA: 50})
        c.run()
        return c

    def test_a_wholesale_depot_only_shops_draw_on_is_a_finding_on_its_page(self):
        c = self.wholesale_distrib(100)
        fact = c.fact(DISTRIB, SODA)
        self.assertEqual((fact["st"], fact["have"], fact["use"], fact["setTo"]), ("short", 100, 700, 810))
        [note] = [f for f in c.findings() if f["siteKey"] == site_key(DISTRIB)]
        self.assertEqual((note["group"], note["text"]), (
            "topup", "Soda's wholesale delivery brings 100 a week against 700 used; "
            "raise the contract to 810"))

    def test_a_wholesale_depot_topped_up_as_well_is_judged_on_its_contract_with_the_top_up_on_it(self):
        # The route brings 350 of the 700 a week used: the contract answers
        # for the other 350, 455 with the margin on the shops' week.
        fact = self.wholesale_distrib(400, top_up=200).fact(DISTRIB, SODA)
        self.assertEqual((fact["cad"], fact["have"], fact["use"], fact["need"], fact["st"]),
                         ("weekly", 400, 350, 455, "tight"))
        self.assertEqual(self.wholesale_distrib(500, top_up=200).fact(DISTRIB, SODA)["st"], "covered")

    def test_a_route_fed_depot_names_the_site_whose_plan_tops_it_up(self):
        c = RoundOneFixTests().depot_fed(80)
        self.assertEqual(c["from"], 0)


class StableOrderTests(unittest.TestCase):
    def test_the_facts_do_not_depend_on_the_hash_seed(self):
        script = ("import json, test_supply_facts as t;"
                  "c = t.two_shop_company([(1500, {})]);"
                  "print(json.dumps({'facts': c.supply['facts'], 'graph': c.supply['graph']}))")
        runs = []
        for seed in ("1", "2"):
            env = dict(os.environ, PYTHONHASHSEED=seed,
                       PYTHONPATH=os.pathsep.join([HERE, os.path.dirname(HERE)]))
            runs.append(subprocess.run([sys.executable, "-c", script], check=True, text=True,
                                       capture_output=True, env=env, cwd=HERE).stdout)
        self.assertEqual(runs[0], runs[1])


class FixtureKeyTests(unittest.TestCase):
    """The board's fixture (tests/fixtures/r8_supply.json) holds the board to
    what Python sends: the same keys, the same units and the same reasons."""

    # Every (status word, reason) _supply_status() can send, and the fields the
    # rows Python sends always carry (a row may carry more).
    WHYS = {
        "made": {None}, "paused": {"order", "topup"}, "noplan": {"target", "order"},
        "new": {"young", "firstFill"}, "short": {"order", "shortfall", "target", "dry"},
        "stalled": {"notDrawn", "waiting"},
        "idle": {"notMoving", "notRouted", "targetHigh", "importHigh", "overstock"},
        "tight": {"order", "shortfall", "target"}, "covered": {None, "route", "limit", "staffing"},
    }
    OPTIONAL = {
        "needs": {"dem"}, "idle": {"unfed", "routedFrom", "importLevel", "smart", "dem"},
        "shops": {"wholesale", "wholesaleDay"},
    }

    @staticmethod
    def rows(supply):
        sites = supply["factories"]["sites"]
        return {
            "needs": [n for s in sites for n in s["needs"]],
            "lines": [l for s in sites for l in s["lines"]],
            "idle": supply["idle"], "shops": supply["shops"], "imports": supply["imports"],
            "graph items": [i for n in supply["graph"]["nodes"] for i in n["items"]],
        }

    def companies(self):
        c = beer_chain()
        idle = Company()
        idle.site(HUB, "Import Hub")
        idle.shop(GYM, "Gym")
        idle.hold(HUB, SODA, 3000)
        idle.hold(GYM, SODA, 1200, 120)
        idle.run()
        return [c.supply, idle.supply, two_shop_company([(1500, {})]).supply]

    def check_facts(self, facts, where):
        for s, items in facts.items():
            for slug, base in items.items():
                for fact in (base, {**base, **base.get("dem", {})}):
                    with self.subTest(where=where, s=s, slug=slug):
                        self.assertLessEqual(BASE_KEYS, set(fact))
                        self.assertLessEqual(set(fact), FACT_KEYS)
                        self.assertLessEqual(set(base.get("dem", {})), FACT_KEYS - {"dem"})
                        self.assertIn(fact["why"], self.WHYS[fact["st"]])
                        # A week's figures carry the week's split; a day's none.
                        weekly = fact["cad"] == "weekly"
                        self.assertEqual("parts" in base, weekly)
                        if fact["role"] == "output":
                            self.assertEqual((fact["use"], fact["need"], fact["setTo"]), (0, 0, None))

    def test_the_payload_keys_match_the_boards_fixture(self):
        with open(os.path.join(HERE, "fixtures", "r8_supply.json"), encoding="utf-8") as fh:
            fixture = json.load(fh)
        mine = self.companies()
        for n, supply in enumerate(mine):
            self.check_facts(supply["facts"], f"python {n}")
        self.check_facts(fixture["supply"]["facts"], "fixture")
        for key in ("facts", "margin", "roundTo", "idleWeeks"):
            self.assertIn(key, fixture["supply"])
            self.assertIn(key, mine[0])
        self.assertEqual((fixture["supply"]["margin"], fixture["supply"]["roundTo"], fixture["supply"]["idleWeeks"]),
                         (mine[0]["margin"], mine[0]["roundTo"], mine[0]["idleWeeks"]))
        self.assertEqual(set(fixture["alertsDemand"]), {"lines", "minor"})
        theirs = self.rows(fixture["supply"])
        for kind in theirs:
            sent = [row for supply in mine for row in self.rows(supply)[kind]]
            self.assertTrue(sent, kind)
            optional = self.OPTIONAL.get(kind, set())
            always = set.intersection(*(set(row) for row in sent)) - optional
            optional = optional | set().union(*(set(row) for row in sent)) - always
            for row in theirs[kind]:
                with self.subTest(kind=kind, row=row.get("slug") or row.get("item")):
                    self.assertLessEqual(always, set(row))
                    self.assertLessEqual(set(row), always | optional)


if __name__ == "__main__":
    unittest.main()
