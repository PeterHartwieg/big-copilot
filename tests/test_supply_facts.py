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
             "lower", "imp", "ramp", "unfed", "via", "dem"}
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
        self.targets, self.contracts = [], []

    def site(self, addr, name, status="support", kind="ba:businesstype_warehouse",
             machines=(), opened=0, trade_days=30, limit=None):
        self.sites.append({"addr": addr, "name": name, "status": status, "kind": kind,
                           "machines": list(machines), "opened": opened,
                           "tradeDays": trade_days, "limit": limit})
        self.lines.setdefault(addr, {})
        return addr

    def factory(self, addr, name, machines=1, **options):
        return self.site(addr, name, kind="ba:businesstype_factory",
                         machines=[RID] * machines, **options)

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
                     "logisticsManagerPlans": list(plans.values())})

    def businesses(self):
        out = []
        for site in self.sites:
            lines = [{"slug": slug, "item": slug.rsplit("_", 1)[-1].title(), "price": 1,
                      "units": line["units"], "rate": line["rate"],
                      "tradeRate": line.get("tradeRate", line["rate"]),
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
        c, fact = self.verdict(units=150)
        self.assertEqual((fact["st"], fact["why"], fact["lvl"], fact["setTo"]),
                         ("noplan", "target", "warn", 120))
        [finding] = [f for f in c.findings() if f["siteKey"] == site_key(SHOP_A)]
        self.assertEqual(finding["group"], "unplanned")

    def test_a_shop_under_five_trading_days_is_new(self):
        _c, fact = self.verdict(target=50, trade_days=3)
        self.assertEqual((fact["st"], fact["why"], fact["lvl"]), ("new", "young", "info"))


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
    """The board's fixture (tests/fixtures/r8_supply.json, written by the board
    side) and what Python sends carry the same keys."""

    def test_the_payload_keys_match_the_boards_fixture(self):
        path = os.path.join(HERE, "fixtures", "r8_supply.json")
        if not os.path.exists(path):
            self.skipTest("tests/fixtures/r8_supply.json is written by the board side; "
                          "this check runs once both sides are merged")
        with open(path, encoding="utf-8") as fh:
            fixture = json.load(fh)
        c = two_shop_company([(1500, {})])
        mine = [fact for items in c.supply["facts"].values() for fact in items.values()]
        theirs = [fact for items in fixture["supply"]["facts"].values() for fact in items.values()]
        for facts in (mine, theirs):
            for fact in facts:
                self.assertLessEqual(BASE_KEYS, set(fact), fact)
                self.assertLessEqual(set(fact), FACT_KEYS, fact)
                self.assertLessEqual(set(fact.get("dem", {})), FACT_KEYS - {"dem"}, fact)
        for key in ("facts", "margin", "roundTo"):
            self.assertIn(key, fixture["supply"])
            self.assertIn(key, c.supply)
        self.assertEqual((fixture["supply"]["margin"], fixture["supply"]["roundTo"]),
                         (c.supply["margin"], c.supply["roundTo"]))
        self.assertEqual(set(fixture["alertsDemand"]), {"lines", "minor"})


if __name__ == "__main__":
    unittest.main()
