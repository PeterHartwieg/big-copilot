"""What else leaves an import depot besides the factory lines, on synthetic fixtures only.

The Weekly imports table sizes a depot's order to the factory lines it feeds
plus what else leaves it (depotOther). That remainder is read from the
delivery log day by day: the depot's net figure, less the net intake of the
factories it tops up. One exception: what a factory sends on the same day to
a depot whose draw of the item is nil (a stock target nothing uses) does not
pull that factory's intake down.
"""
import unittest

from ba_dashboard import Names, _supply, site_key
from test_recipe_identity import BEER, RID, WATER, SaveStub

DAY = 10  # the save's day; days 3 to 9 are the log's window
FACTORY, FACTORY2 = ("factory", 0), ("factory", 1)
HUB, DISTRIB, SHOP = ("depot", 1), ("depot", 2), ("shop", 3)


def tx(day, items):
    return {"dayOfDelivery": day,
            "deliveryItems": [{"itemName": item, "amountDelivered": amount}
                              for item, amount in items.items()]}


def ship(log, day, source, dest, items):
    """One shipment, logged at both ends as the game logs it; a shop keeps no log."""
    log.setdefault(source, []).append(tx(day, {i: -a for i, a in items.items()}))
    if dest is not None:
        log.setdefault(dest, []).append(tx(day, dict(items)))


def imports(site, item, amount):
    """A weekly import to `site`, next due on day 14 (the weekday of day 7)."""
    return {"importAddress": ("pier", 1), "isActive": True, "nextDeliveryDay": 14,
            "products": [{"itemName": item, "amount": amount, "amountOrderedLastWeek": amount,
                          "assignedWarehouse": site}]}


def depot_other(log, targets, contracts):
    """_supply() over two factories (each line eats water, 240 a day), the hub,
    a second depot and a shop selling water; returns the hub's depotOther."""
    save = SaveStub([[RID], [RID]], hours=24)
    save.address = lambda value: value
    for number, site in enumerate((FACTORY, FACTORY2)):
        save.root["BuildingRegistrations"][number]["deliveryTransactions"] = log.get(site, [])
    for site in (HUB, DISTRIB):
        save.root["BuildingRegistrations"].append({
            "RentedByPlayer": True, "StreetName": site[0], "StreetNumber": site[1],
            "itemInstances": [], "deliveryTransactions": log.get(site, []),
        })
    plans = {}
    for source, dest, item, amount in targets:
        plan = plans.setdefault(source, {"targetAddress": source, "destinations": []})
        plan["destinations"].append({"deliveryTargetAddress": dest,
                                     "stockTargets": [{"itemName": item, "targetAmount": amount}]})
    save.root.update(Hour=12, Minute=0, importPartnerships=contracts,
                     logisticsManagerPlans=list(plans.values()))

    def business(site, name, kind, status, lines):
        return {"key": site_key(site), "name": name, "code": "", "neighbourhood": "",
                "type": kind, "typeSlug": kind, "status": status, "lines": lines}

    factory_lines = [{"slug": WATER, "item": "Water", "units": 50, "rate": 0, "price": 0},
                     {"slug": BEER, "item": "Beer", "units": 400, "rate": 0, "price": 0}]
    businesses = [
        business(FACTORY, "Factory", "factory", "support", factory_lines),
        business(HUB, "Import Hub", "warehouse", "support",
                 [{"slug": WATER, "item": "Water", "units": 3000, "rate": 0, "price": 0}]),
        business(DISTRIB, "Distrib", "warehouse", "support", []),
        business(SHOP, "Shop", "kiosk", "retail",
                 [{"slug": WATER, "item": "Water", "units": 20, "rate": 100, "price": 1}]),
        business(FACTORY2, "Factory Two", "factory", "support", factory_lines),
    ]
    recipes = {BEER: {"slug": BEER, "item": "Beer", "out": 30, "workstation": "bottledgoods",
                      "ingredients": [{"slug": WATER, "item": "Water", "per": 10}]}}
    supply = _supply(save, Names({}), businesses, DAY, {}, recipes)
    return supply["factories"]["depotOther"].get(1, {})


class DepotOtherTests(unittest.TestCase):
    def test_goods_parked_at_a_depot_nothing_draws_from_are_no_phantom(self):
        """The hub tops the factory up with 340 water a day; the factory
        passes 100 of it on to a depot target where nothing uses it (no round
        leaves there, no shelf sells it), as Factory Jewelry did with Metal
        Band. Netted, those 100 a day read as 700 a week to the shops."""
        log = {}
        for day in range(3, 10):
            ship(log, day, HUB, FACTORY, {WATER: 340})
            ship(log, day, FACTORY, DISTRIB, {WATER: 100})
        other = depot_other(log, [(HUB, FACTORY, WATER, 400), (FACTORY, DISTRIB, WATER, 700)],
                            [imports(HUB, WATER, 2380)])
        self.assertEqual(other[WATER], 0)

    def test_the_shops_part_stays_beside_goods_parked(self):
        """The hub also sends 100 a day straight to the shops: that part is
        still other, the parked 100 still is not."""
        log = {}
        for day in range(3, 10):
            ship(log, day, HUB, FACTORY, {WATER: 340})
            ship(log, day, HUB, None, {WATER: 100})
            ship(log, day, FACTORY, DISTRIB, {WATER: 100})
        other = depot_other(log, [(HUB, FACTORY, WATER, 400), (HUB, SHOP, WATER, 150),
                                  (FACTORY, DISTRIB, WATER, 700)], [imports(HUB, WATER, 3080)])
        self.assertEqual(other[WATER], 700)

    def test_a_depot_feeding_a_consuming_factory_still_counts(self):
        """340 a day reach the factory, which eats 240 and passes 100 through
        a depot to a second factory whose line eats them. That depot's rounds
        leave, so its draw is not nil: the hub's other part stays 700, as the
        net reading always gave."""
        log = {}
        for day in range(3, 10):
            ship(log, day, HUB, FACTORY, {WATER: 340})
            ship(log, day, FACTORY, DISTRIB, {WATER: 100})
            ship(log, day, DISTRIB, FACTORY2, {WATER: 100})
        other = depot_other(log, [(HUB, FACTORY, WATER, 400), (FACTORY, DISTRIB, WATER, 200),
                                  (DISTRIB, FACTORY2, WATER, 150)], [imports(HUB, WATER, 2380)])
        self.assertEqual(other[WATER], 700)

    def test_a_depot_feeding_a_shop_still_counts(self):
        log = {}
        for day in range(3, 10):
            ship(log, day, HUB, FACTORY, {WATER: 340})
            ship(log, day, FACTORY, DISTRIB, {WATER: 100})
            ship(log, day, DISTRIB, None, {WATER: 100})
        other = depot_other(log, [(HUB, FACTORY, WATER, 400), (FACTORY, DISTRIB, WATER, 200),
                                  (DISTRIB, SHOP, WATER, 150)], [imports(HUB, WATER, 2380)])
        self.assertEqual(other[WATER], 700)

    def test_a_same_day_import_beside_a_top_up_reads_as_before(self):
        """The hub sends the factory 200 a day and the shops 100. On day 7 the
        factory's own import of 100 lands and it passes 100 on down a used
        route. Read net, as always: the factory took 200 that day, and the
        shops keep 100 a day, 700 a week."""
        log = {}
        for day in range(3, 10):
            ship(log, day, HUB, FACTORY, {WATER: 200})
            ship(log, day, HUB, None, {WATER: 100})
        log[FACTORY].append(tx(7, {WATER: 100}))
        ship(log, 7, FACTORY, DISTRIB, {WATER: 100})
        ship(log, 7, DISTRIB, FACTORY2, {WATER: 100})
        other = depot_other(log, [(HUB, FACTORY, WATER, 300), (HUB, SHOP, WATER, 150),
                                  (FACTORY, DISTRIB, WATER, 200), (DISTRIB, FACTORY2, WATER, 150)],
                            [imports(FACTORY, WATER, 100)])
        self.assertEqual(other[WATER], 700)

    def test_a_factory_importing_the_item_itself_is_read_net(self):
        """What a factory with its own import parks at an idle depot may be
        that import, so the day stays net, as before: day 7 brings the
        factory's 500, all parked, and the hub's round to the shops is kept."""
        log = {}
        for day in range(3, 10):
            ship(log, day, HUB, FACTORY, {WATER: 200})
            ship(log, day, HUB, None, {WATER: 100})
        log[FACTORY].append(tx(7, {WATER: 500}))
        ship(log, 7, FACTORY, DISTRIB, {WATER: 500})
        other = depot_other(log, [(HUB, FACTORY, WATER, 300), (HUB, SHOP, WATER, 150),
                                  (FACTORY, DISTRIB, WATER, 700)], [imports(FACTORY, WATER, 500)])
        self.assertEqual(other[WATER], 700)


if __name__ == "__main__":
    unittest.main()
