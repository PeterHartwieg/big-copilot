"""Supply-chain audit fixes (24 Sep 2026), on synthetic fixtures only.

The delivery log names neither end of a shipment; the game writes each one
twice on the same day, negative at the site it left and positive at the site
it reached. These fixtures build that log for one import depot, one factory
whose line eats water, and a second depot, and check what the board makes of
it: where the depot's goods went, what the factory ate, the pipes, the walk to
the next import, the Produce up to limit and the idle view.
"""
import unittest

from ba_dashboard import (
    Names, _delivery_destinations, _feed_notes, _idle_notes, _import_catch_up, _import_need,
    _scheduled_import_gap, _supply, site_key,
)
from test_recipe_identity import BEER, RID, WATER, SaveStub

BAG = "ba:itemname_paperbag"
DAY = 10  # the save's day; days 3 to 9 are the log's window
FACTORY, HUB, DISTRIB = ("factory", 0), ("depot", 1), ("depot", 2)


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

    def __init__(self):
        self.log = {}
        self.contracts = []
        self.targets = []  # (source, dest, item, amount)
        self.units = {FACTORY: {WATER: 50, BEER: 400}, HUB: {WATER: 3000}, DISTRIB: {}}
        self.machine = {}

    def run(self, hour=12):
        save = SaveStub([[RID]], hours=24)
        save.address = lambda value: value
        save.root["BuildingRegistrations"][0]["itemInstances"][0]["$v"].update(self.machine)
        save.root["BuildingRegistrations"][0]["deliveryTransactions"] = self.log.get(FACTORY, [])
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
                                   (DISTRIB, "Distrib", "warehouse")]]
        recipes = {BEER: {"slug": BEER, "item": "Beer", "out": 30, "workstation": "bottledgoods",
                          "ingredients": [{"slug": WATER, "item": "Water", "per": 10}]}}
        self.supply = _supply(save, Names({}), self.businesses, DAY, {}, recipes)
        return self.supply

    # Readers
    def need(self, slug=WATER):
        return next(n for n in self.supply["factories"]["sites"][0]["needs"] if n["slug"] == slug)

    def other(self, site=1):
        return self.supply["factories"]["depotOther"].get(site, {})

    def pipe(self, source, dest):
        return next(l["perDay"] for l in self.supply["graph"]["links"]
                    if l["from"] == site_key(source) and l["to"] == site_key(dest))

    def row(self, slug=WATER):
        return next(r for r in self.supply["imports"] if r["s"] == 1 and r["slug"] == slug)


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


class DeliveryDestinationTests(unittest.TestCase):
    def test_each_shipment_is_paired_with_its_mirror_at_the_destination(self):
        moves = [("hub", 3, {WATER: -240, BAG: -100}), ("factory", 3, {WATER: 240, BAG: 100}),
                 ("hub", 4, {WATER: -240}), ("factory", 4, {WATER: 240}),
                 ("hub", 4, {WATER: 1000}),  # an import
                 ("depot", 4, {WATER: -60})]  # to a shop, which keeps no log
        sent = _delivery_destinations(moves)
        self.assertEqual(dict(sent[("hub", WATER)]), {"factory": 480})
        self.assertEqual(dict(sent[("hub", BAG)]), {"factory": 100})
        self.assertEqual(dict(sent[("depot", WATER)]), {None: 60})

    def test_a_mirror_is_used_once_and_never_at_the_sending_site(self):
        moves = [("a", 3, {WATER: -5}), ("b", 3, {WATER: -5}), ("c", 3, {WATER: 5}), ("a", 3, {WATER: 5})]
        sent = _delivery_destinations(moves)
        self.assertEqual(dict(sent[("a", WATER)]), {"c": 5})
        self.assertEqual(dict(sent[("b", WATER)]), {"a": 5})


class ForwardingTests(unittest.TestCase):
    """Defects 1, 5 and 7: a factory forwarding an import to a depot target."""

    def setUp(self):
        self.f = forwarding_fixture()
        self.f.run()

    def test_what_the_factory_forwards_is_not_the_hubs_other_outflow(self):
        # Netted per site and day, the factory's intake on days 3 to 5 came out
        # 250 short, and the hub's "other" outflow read 250 a week.
        self.assertEqual(self.f.other()[WATER], 0)
        self.assertNotIn(WATER, self.f.supply["factories"]["depotOtherTo"].get(1, {}))

    def test_the_factory_itself_names_where_it_sent_the_goods(self):
        # 250 over the three days its rounds ran, as a week: the depot rows'
        # own measure of a draw.
        self.assertEqual(self.f.supply["factories"]["depotOtherTo"][0][WATER], [[2, 583]])

    def test_arrives_leaves_out_what_the_factory_sent_on(self):
        # 1,680 arrived over seven days, 250 of it passed on: 204 a day eaten.
        self.assertEqual(self.f.need()["arrives"], 204)

    def test_daily_pipes_are_sized_from_the_log_by_destination(self):
        # Following sales down the chain saw nothing going into the factory.
        self.assertEqual(self.f.pipe(HUB, FACTORY), 240)
        self.assertEqual(self.f.pipe(FACTORY, DISTRIB), 83)


class MondayRoundTests(unittest.TestCase):
    """Defect 2: an import landing on a round day, and an item no line eats."""

    def run_bags(self):
        f = Fixture()
        f.units[HUB][BAG] = 2000
        f.targets = [(HUB, FACTORY, BAG, 500), (FACTORY, DISTRIB, BAG, 500), (HUB, FACTORY, WATER, 300)]
        f.contracts = [import_contract(BAG, 1000, smart=True, last=700)]
        for day in range(3, 10):
            ship(f.log, day, HUB, FACTORY, {BAG: 100})
            ship(f.log, day, FACTORY, DISTRIB, {BAG: 100})
        f.log[HUB].append(tx(7, {BAG: 700}))
        f.run()
        return f

    def test_the_round_on_import_day_still_counts(self):
        f = self.run_bags()
        # Netted, day 7 read +600 at the hub and the factory's intake cancelled
        # its onward shipment: 600 a week. Seven rounds of 100 left.
        self.assertEqual(f.other()[BAG], 700)

    def test_a_factory_takes_an_item_only_if_a_line_eats_it(self):
        f = self.run_bags()
        self.assertEqual(f.supply["factories"]["depotOtherTo"][1][BAG], [[0, 700]])


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
        self.assertEqual((need["status"], need["level"]), ("limit", "ok"))
        self.assertTrue(need["limited"])
        line = f.supply["factories"]["sites"][0]["lines"][0]
        self.assertEqual((line["limit"], line["limitHeld"]), (500, True))
        self.assertEqual(_feed_notes(f.businesses, f.supply["factories"], set()), [])

    def test_without_the_limit_the_same_line_is_not_drawing(self):
        need = self.run_limited({}).need()
        self.assertEqual((need["status"], need["level"]), ("idle", "warn"))
        # A limit set but not reached, with nothing measured leaving: still idle.
        need = self.run_limited({"produceUpTo": True, "produceUpToValue": 500}, beer=400).need()
        self.assertEqual(need["status"], "idle")

    def test_output_a_days_shipments_below_the_limit_is_being_made_back(self):
        # The morning round took 150 of the 500; the machine is refilling.
        f = self.run_limited({"produceUpTo": True, "produceUpToValue": 500}, beer=400, shipped_beer=150)
        self.assertEqual(f.need()["status"], "limit")

    def test_the_page_gives_the_same_verdict(self):
        import json
        import subprocess
        from ba_dashboard import TEMPLATE
        f = self.run_limited({"produceUpTo": True, "produceUpToValue": 500})
        n = dict(f.need())
        n.update(importWeekly=None, depotNeed=n["depotNeed"], madeAt=[], waitingOn=[])
        start = TEMPLATE.index("const feedFit =")
        end = TEMPLATE.index("/* A name kept in this browser")
        script = TEMPLATE[start:end] + f"\nconst n = {json.dumps(n)}; feedVerdict(n); console.log(n.status);"
        out = subprocess.run(["node", "-e", script], check=True, text=True, capture_output=True).stdout
        self.assertEqual(out.strip(), "limit")


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

    def test_the_goods_flow_panel_uses_the_rows_own_walk(self):
        """Defects 8 and 9: a flat walk for a machine-fed line, and a Smart
        Delivery level said as what the depot keeps."""
        f = self.run_depot(True)
        node = next(n for n in f.supply["graph"]["nodes"] if n["id"] == site_key(HUB))
        item = next(i for i in node["items"] if i["item"] == "Water")
        self.assertEqual(item["need"], f.row()["dueNeed"])
        self.assertEqual((item["provision"], item["keeps"]), (1700, True))


class IdleTests(unittest.TestCase):
    def test_a_new_factory_input_on_a_short_log_is_not_dead(self):
        """Defect 10: one round in so far, and the line is eating it."""
        f = Fixture()
        f.units[FACTORY][WATER] = 2000
        f.targets = [(HUB, FACTORY, WATER, 2000)]
        f.contracts = [import_contract(WATER, 5000)]
        ship(f.log, 9, HUB, FACTORY, {WATER: 2000})
        f.run()
        self.assertFalse([r for r in f.supply["idle"] if r["s"] == 0 and r["slug"] == WATER])

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
        self.assertIn("Factory tops it up to 250 here and nothing here uses it", text)
        self.assertIn("remove that target", text)


if __name__ == "__main__":
    unittest.main()
