"""Supply-chain audit fixes (24 Sep 2026), on synthetic fixtures only.

Ported from the supply-audit-fixes branch: the Produce up to limit, the
morning-round walk to the next import, a factory fed by a factory, what a
factory eats against what it passes on, and the route advice on stock parked
where nothing uses it.

The delivery log names neither end of a shipment; the game writes each one
twice on the same day, negative at the site it left and positive at the site
it reached. These fixtures build that log for one import depot, one factory
whose line eats water, and a second depot.
"""
import unittest

from ba_dashboard import (
    Names, _feed_notes, _idle_notes, _import_catch_up, _import_need,
    _scheduled_import_gap, _supply, site_key,
)
from test_recipe_identity import BEER, RID, WATER, SaveStub

BAG = "ba:itemname_paperbag"
DAY = 10  # the save's day; days 3 to 9 are the log's window
FACTORY, HUB, DISTRIB, FACTORY2 = ("factory", 0), ("depot", 1), ("depot", 2), ("factory", 1)


def tx(day, items):
    return {"dayOfDelivery": day,
            "deliveryItems": [{"itemName": item, "amountDelivered": amount}
                              for item, amount in items.items()]}


def ship(log, day, source, dest, items):
    """One shipment, logged at both ends as the game logs it."""
    log.setdefault(source, []).append(tx(day, {i: -a for i, a in items.items()}))
    if dest is not None:
        log.setdefault(dest, []).append(tx(day, dict(items)))


def import_contract(item, amount, *, smart=False, last=0, day=14):
    order = {"importAddress": ("pier", 1), "isActive": True, "nextDeliveryDay": day,
             "products": [{"itemName": item, "amount": amount, "amountOrderedLastWeek": last,
                           "assignedWarehouse": HUB}]}
    if smart:
        order["isTarget"] = True
    return order


class Fixture:
    """Build the save and run _supply() on it."""

    def __init__(self, rids=(RID,)):
        """One factory per recipe id in `rids`: factory 0 at index 0, then the
        hub (1) and the second depot (2), then factory 1 (3)."""
        self.rids = rids
        self.log = {}
        self.contracts = []
        self.targets = []  # (source, dest, item, amount)
        self.units = {FACTORY: {WATER: 50, BEER: 400}, HUB: {WATER: 3000}, DISTRIB: {},
                      FACTORY2: {WATER: 50, BEER: 400}}
        self.machine = {}

    def run(self, hour=12):
        save = SaveStub([[rid] for rid in self.rids], hours=24)
        save.address = lambda value: value
        save.root["BuildingRegistrations"][0]["itemInstances"][0]["$v"].update(self.machine)
        for number, building in enumerate(save.root["BuildingRegistrations"]):
            building["deliveryTransactions"] = self.log.get(("factory", number), [])
        for site in (HUB, DISTRIB):
            save.root["BuildingRegistrations"].append({
                "RentedByPlayer": True, "StreetName": site[0], "StreetNumber": site[1],
                "itemInstances": [], "deliveryTransactions": self.log.get(site, []),
            })
        plans = {}
        for source, dest, item, amount in self.targets:
            plan = plans.setdefault(source, {"targetAddress": source, "destinations": []})
            plan["destinations"].append({"deliveryTargetAddress": dest,
                                         "stockTargets": [{"itemName": item, "targetAmount": amount}]})
        save.root.update(Hour=hour, Minute=0, importPartnerships=self.contracts,
                         logisticsManagerPlans=list(plans.values()))
        label = {WATER: "Water", BEER: "Beer", BAG: "Paper Bag"}
        self.businesses = [{
            "key": site_key(site), "name": name, "code": "", "neighbourhood": "",
            "type": kind, "typeSlug": kind, "status": "support",
            "lines": [{"slug": slug, "item": label[slug], "units": units, "rate": 0, "price": 0}
                      for slug, units in self.units[site].items()],
        } for site, name, kind in [(FACTORY, "Factory", "factory"), (HUB, "Import Hub", "warehouse"),
                                   (DISTRIB, "Distrib", "warehouse")]
          + ([(FACTORY2, "Factory 2", "factory")] if len(self.rids) > 1 else [])]
        recipes = {BEER: {"slug": BEER, "item": "Beer", "out": 30, "workstation": "bottledgoods",
                          "ingredients": [{"slug": WATER, "item": "Water", "per": 10}]}}
        self.recipes = recipes
        self.supply = _supply(save, Names({}), self.businesses, DAY, {}, recipes)
        return self.supply

    # Readers
    def need(self, slug=WATER, site=0):
        return next(n for s in self.supply["factories"]["sites"] if s["s"] == site
                    for n in s["needs"] if n["slug"] == slug)

    def other(self, site=1):
        return self.supply["factories"]["depotOther"].get(site, {})

    def row(self, slug=WATER):
        return next(r for r in self.supply["imports"] if r["s"] == 1 and r["slug"] == slug)

    def fact(self, site, slug=WATER):
        return self.supply["facts"][str(site)][slug]


def forwarding_fixture():
    """The hub tops the factory up with 240 water a day, which its line eats;
    the factory passes 100, 100 and 50 of it on to a depot target in the first
    three days; the import lands on day 7 and the hub's round leaves that day
    too."""
    f = Fixture()
    f.targets = [(HUB, FACTORY, WATER, 300), (FACTORY, DISTRIB, WATER, 250)]
    f.contracts = [import_contract(WATER, 1700, last=1680)]
    for day in range(3, 10):
        ship(f.log, day, HUB, FACTORY, {WATER: 240})
    for day, amount in ((3, 100), (4, 100), (5, 50)):
        ship(f.log, day, FACTORY, DISTRIB, {WATER: amount})
    f.log[HUB].append(tx(7, {WATER: 1680}))  # the import: no sender in the log
    return f


class ForwardingTests(unittest.TestCase):
    """Defect 5: what a factory forwards arrived but was never eaten."""

    def test_arrives_leaves_out_what_the_factory_sent_on(self):
        f = forwarding_fixture()
        f.run()
        # 1,680 arrived over seven days, 250 of it passed on: 204 a day eaten.
        self.assertEqual(f.need()["arrives"], 204)


class ProductionLimitTests(unittest.TestCase):
    """Defect 4: a line held by its Produce up to limit is not a feed fault."""

    def run_limited(self, machine, beer=500, shipped_beer=0):
        f = Fixture()
        f.machine = machine
        f.units[FACTORY][BEER] = beer
        f.targets = [(HUB, FACTORY, WATER, 300)]
        f.contracts = [import_contract(WATER, 1700, last=700)]
        for day in range(3, 10):
            ship(f.log, day, HUB, FACTORY, {WATER: 100})  # 100 a day of the 240 the line could eat
            if shipped_beer:
                ship(f.log, day, FACTORY, None, {BEER: shipped_beer})
        f.run()
        return f

    def test_a_line_at_its_limit_is_held_by_it(self):
        f = self.run_limited({"produceUpTo": True, "produceUpToValue": 500})
        need = f.need()
        self.assertEqual((need["status"], need["why"], need["level"]), ("covered", "limit", "ok"))
        self.assertTrue(need["limited"])
        line = f.supply["factories"]["sites"][0]["lines"][0]
        self.assertEqual((line["limit"], line["limitHeld"]), (500, True))
        self.assertEqual(_feed_notes(f.businesses, f.supply["factories"], set()), [])

    def test_without_the_limit_the_same_line_is_not_drawing(self):
        need = self.run_limited({}).need()
        self.assertEqual((need["status"], need["why"], need["level"]), ("stalled", "notDrawn", "warn"))
        # A limit set but not reached, with nothing measured leaving: still not reaching the line.
        need = self.run_limited({"produceUpTo": True, "produceUpToValue": 500}, beer=400).need()
        self.assertEqual(need["why"], "notDrawn")

    def test_output_a_days_shipments_below_the_limit_is_being_made_back(self):
        # The morning round took 150 of the 500; the machine is refilling.
        f = self.run_limited({"produceUpTo": True, "produceUpToValue": 500}, beer=400, shipped_beer=150)
        self.assertEqual(f.need()["why"], "limit")

    def test_shipping_more_than_the_limit_with_nothing_held_is_a_dry_depot(self):
        """A day's shipments above the limit must not stretch the tolerance to
        cover a starved line: the depot's shortage comes first."""
        f = Fixture()
        f.machine = {"produceUpTo": True, "produceUpToValue": 500}
        f.units[FACTORY][BEER] = 0
        f.units[HUB][WATER] = 100
        f.targets = [(HUB, FACTORY, WATER, 300)]
        f.contracts = [import_contract(WATER, 1700, last=700)]
        for day in range(3, 10):
            ship(f.log, day, HUB, FACTORY, {WATER: 100})
            ship(f.log, day, FACTORY, None, {BEER: 600})
        f.run()
        self.assertFalse(f.supply["factories"]["sites"][0]["lines"][0]["limitHeld"])
        self.assertEqual((f.need()["status"], f.need()["why"]), ("short", "dry"))

    def test_the_tolerance_is_bounded_by_a_share_of_the_limit(self):
        # 600 a day leave a 500 limit; 100 held is far under it, not held by it.
        f = self.run_limited({"produceUpTo": True, "produceUpToValue": 500}, beer=100, shipped_beer=600)
        self.assertEqual(f.need()["why"], "notDrawn")
        # 400 held is within a quarter of the limit: the machines are making it back.
        f = self.run_limited({"produceUpTo": True, "produceUpToValue": 500}, beer=400, shipped_beer=600)
        self.assertEqual(f.need()["why"], "limit")


class PacedByLimitTests(unittest.TestCase):
    """A line whose machines stop and start at their Produce up to limit holds
    anywhere under it through the day, and draws what it makes: held by the
    limit while its inputs are on hand, starved once they run down."""

    def run_paced(self, water_held):
        f = Fixture()
        f.machine = {"produceUpTo": True, "produceUpToValue": 500}
        # 300 beer held of the 500 limit, far below what a quarter of the limit
        # would make back; 400 of the 720 it could make leave a day.
        f.units[FACTORY][BEER] = 300
        f.units[FACTORY][WATER] = water_held
        f.targets = [(HUB, FACTORY, WATER, 300)]
        f.contracts = [import_contract(WATER, 1700, last=940)]
        for day in range(3, 10):
            ship(f.log, day, HUB, FACTORY, {WATER: 134})  # what 400 beer eat
            ship(f.log, day, FACTORY, None, {BEER: 400})
        f.run()
        return f

    def test_a_line_making_what_leaves_with_its_input_on_hand_is_held_by_its_limit(self):
        # 200 water on hand at noon runs the machine at full rate to midnight.
        f = self.run_paced(200)
        line = f.supply["factories"]["sites"][0]["lines"][0]
        self.assertTrue(line["limitHeld"])
        need = f.need()
        self.assertTrue(need["limited"])
        self.assertEqual((need["status"], need["why"]), ("covered", "limit"))
        self.assertEqual((f.fact(0)["st"], f.fact(0)["why"]), ("covered", "limit"))
        self.assertEqual(_feed_notes(f.businesses, f.supply["factories"], set()), [])

    def test_the_same_line_with_its_input_run_down_is_not_held_by_it(self):
        f = self.run_paced(20)
        self.assertFalse(f.supply["factories"]["sites"][0]["lines"][0]["limitHeld"])
        self.assertEqual((f.fact(0)["st"], f.fact(0)["why"]), ("stalled", "notDrawn"))


class RoundWalkTests(unittest.TestCase):
    """Defect 6: a depot served by a morning round is emptied a round at a time."""

    def test_the_need_counts_whole_rounds_and_the_delivery_days_round(self):
        flat = [1] * 7
        # Today's round still to go, and the rounds of days 11 and 12: the
        # day-12 round leaves before the import lands.
        self.assertEqual(_import_need(100, flat, 10, 12, 1.0, rounds=True), 300)
        self.assertEqual(_import_need(100, flat, 10, 12, 0.0, rounds=True), 200)
        # A shelf: half of today and day 11; the drop supplies day 12.
        self.assertEqual(_import_need(100, flat, 10, 12, .5), 150)
        self.assertEqual(_import_catch_up(250, 100, flat, 10, 12, 0.0, rounds=True), 0)
        self.assertEqual(_import_catch_up(250, 100, flat, 10, 12, 1.0, rounds=True), 50)

    def test_a_smart_drop_tops_up_after_that_days_round(self):
        drops = [{"day": 11, "amount": 300, "smart": True}, {"day": 14, "amount": 700}]
        # 100 held: day 11's round empties the depot, the drop then brings the
        # full 300, which carries rounds 12 to 14.
        result = _scheduled_import_gap(100, 100, [1] * 7, 10, drops, 0.0, rounds=True)
        self.assertEqual((result["runsOut"], result["catchUp"]), (None, 0))
        # Nothing held: day 11's round leaves before the drop can cover it.
        dry = _scheduled_import_gap(0, 100, [1] * 7, 10, drops, 0.0, rounds=True)
        self.assertEqual((dry["runsOut"], dry["catchUp"]), (11, 100))
        # Walked as a shelf, the drop lands first and hides that round.
        self.assertIsNone(_scheduled_import_gap(0, 100, [1] * 7, 10, drops, 0.0)["runsOut"])

    def run_depot(self, today_round):
        f = Fixture()
        f.units[HUB][WATER] = 1000
        f.targets = [(HUB, FACTORY, WATER, 300)]
        f.contracts = [import_contract(WATER, 1700, smart=True, last=1680)]
        for day in range(3, 11 if today_round else 10):
            ship(f.log, day, HUB, FACTORY, {WATER: 240})
        f.run()
        return f

    def test_the_rows_walk_charges_rounds(self):
        for today_round, due, catch_up in ((True, 4, 0), (False, 5, 200)):
            with self.subTest(today_round=today_round):
                f = self.run_depot(today_round)
                row = f.row()
                self.assertTrue(row["rounds"])
                # Day 10 at noon, import on day 14: rounds 11 to 14, and today's
                # if it has not left yet. Shop-style it was 3.5 days.
                self.assertEqual(row["due"], due)
                self.assertEqual(row["dueNeed"], 240 * due)
                self.assertEqual(row["catchUp"], catch_up)

    def test_todays_round_is_read_per_item(self):
        """Two items, and only one of them has left in today's round so far."""
        f = Fixture()
        f.units[HUB] = {WATER: 1000, BAG: 1000}
        f.targets = [(HUB, FACTORY, WATER, 300), (HUB, FACTORY, BAG, 300)]
        f.contracts = [import_contract(WATER, 1700, smart=True, last=1680),
                       import_contract(BAG, 1700, smart=True, last=1680)]
        for day in range(3, 10):
            ship(f.log, day, HUB, FACTORY, {WATER: 240, BAG: 240})
        ship(f.log, 10, HUB, FACTORY, {WATER: 240})
        f.run()
        self.assertEqual((f.row(WATER)["due"], f.row(BAG)["due"]), (4, 5))

    def test_the_goods_flow_panel_uses_the_rows_own_walk(self):
        """Defects 8 and 9: a flat walk for a machine-fed line, and a Smart
        Delivery level said as what the depot keeps."""
        f = self.run_depot(True)
        node = next(n for n in f.supply["graph"]["nodes"] if n["id"] == site_key(HUB))
        item = next(i for i in node["items"] if i["item"] == "Water")
        self.assertEqual(item["need"], f.row()["dueNeed"])
        self.assertEqual((item["provision"], item["keeps"]), (1700, True))


def chain_fixture():
    """Hub -> factory 0 (its line eats water) -> factory 1 (so does its line).
    Factory 0 has no import of water: it passes on what its top-up brings."""
    f = Fixture(rids=(RID, RID))
    f.targets = [(HUB, FACTORY, WATER, 600), (FACTORY, FACTORY2, WATER, 300)]
    f.contracts = [import_contract(WATER, 3400, last=3360)]
    for day in range(3, 10):
        ship(f.log, day, HUB, FACTORY, {WATER: 480})
        ship(f.log, day, FACTORY, FACTORY2, {WATER: 240})
    return f


class FactoryChainTests(unittest.TestCase):
    def test_a_factory_fed_by_a_factory_is_sized_on_the_import_behind_it(self):
        f = chain_fixture()
        f.run()
        first, second = f.need(site=0), f.need(site=3)
        # Both lines' week, 2 x 240 x 7, rests on the hub's import.
        self.assertEqual(first["depotNeed"], 3360)
        self.assertEqual((second["from"], second["importSite"]), (0, 1))
        self.assertEqual((second["depotNeed"], second["importWeekly"]), (3360, 3400))
        self.assertEqual(second["status"], "covered")
        # What the first factory passed on to the second is no other site's draw.
        self.assertEqual(f.other()[WATER], 0)


class RouteAdviceTests(unittest.TestCase):
    def test_a_raw_material_routed_where_nothing_uses_it_names_the_route(self):
        """Defect 12: the target is the thing to change."""
        f = forwarding_fixture()
        f.units[DISTRIB] = {WATER: 5000}
        f.run()
        row = next(r for r in f.supply["idle"] if r["s"] == 2)
        self.assertTrue(row["dead"])
        self.assertEqual(row["routedFrom"], 0)
        notes = _idle_notes(f.businesses, f.supply["idle"], set())
        text = next(n["text"] for n in notes if n["site"] == "Distrib")
        # The stock may be meant for sites no plan reaches yet: both ways out.
        self.assertIn("Factory tops it up to 250 here and no plan sends it on: add a plan to the "
                      "shops that should get it, or stop the top-up", text)

    def test_no_route_advice_where_the_depot_sends_it_on(self):
        f = forwarding_fixture()
        f.units[DISTRIB] = {WATER: 5000}
        f.targets.append((DISTRIB, HUB, WATER, 10))
        f.run()
        # It feeds the hub, which feeds the factory's line: not idle at all.
        self.assertFalse([r for r in f.supply["idle"] if r["s"] == 2 and "routedFrom" in r])


if __name__ == "__main__":
    unittest.main()
