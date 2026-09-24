"""What else leaves an import depot besides the factory lines, on synthetic fixtures only.

The Weekly imports table sizes a depot's order to the factory lines it feeds
plus what else leaves it (depotOther). That remainder is read from the
delivery log day by day: the depot's rounds out, less what the factories it
tops up took in. Both sides are gross, so a factory passing goods on and an
import landing the day a round leaves change nothing.
"""
import unittest

from ba_dashboard import Names, _supply, site_key
from test_recipe_identity import BEER, RID, WATER, SaveStub

BAG = "ba:itemname_paperbag"
DAY = 10  # the save's day; days 3 to 9 are the log's window, day 7 the import's weekday
FACTORY, HUB, DISTRIB = ("factory", 0), ("depot", 1), ("depot", 2)


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
    """A weekly import to `site`, next due on day 14 (the weekday of day 7),
    and the delivery it logged last week."""
    return {"importAddress": ("pier", 1), "isActive": True, "nextDeliveryDay": 14,
            "products": [{"itemName": item, "amount": amount, "amountOrderedLastWeek": amount,
                          "assignedWarehouse": site}]}


def depot_other(log, targets, contracts, units=None):
    """_supply() over one factory (its line eats water, 240 a day), the hub and
    a second depot; returns the hub's depotOther."""
    save = SaveStub([[RID]], hours=24)
    save.address = lambda value: value
    save.root["BuildingRegistrations"][0]["deliveryTransactions"] = log.get(FACTORY, [])
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
    units = units or {FACTORY: {WATER: 50, BEER: 400}, HUB: {WATER: 3000, BAG: 3000}, DISTRIB: {}}
    label = {WATER: "Water", BEER: "Beer", BAG: "Paper Bag"}
    businesses = [{
        "key": site_key(site), "name": name, "code": "", "neighbourhood": "",
        "type": kind, "typeSlug": kind, "status": "support",
        "lines": [{"slug": slug, "item": label[slug], "units": n, "rate": 0, "price": 0}
                  for slug, n in units[site].items()],
    } for site, name, kind in [(FACTORY, "Factory", "factory"), (HUB, "Import Hub", "warehouse"),
                               (DISTRIB, "Distrib", "warehouse")]]
    recipes = {BEER: {"slug": BEER, "item": "Beer", "out": 30, "workstation": "bottledgoods",
                      "ingredients": [{"slug": WATER, "item": "Water", "per": 10}]}}
    supply = _supply(save, Names({}), businesses, DAY, {}, recipes)
    return supply["factories"]["depotOther"].get(1, {})


class DepotOtherTests(unittest.TestCase):
    def test_a_factory_forwarding_an_import_leaves_no_phantom_other(self):
        """The hub tops the factory up with 240 water a day, all eaten; the
        factory passes 100, 100 and 50 on to a depot's target. Netted, its
        intake on those days came out short and the hub read 250 a week to
        other sites."""
        log = {}
        for day in range(3, 10):
            ship(log, day, HUB, FACTORY, {WATER: 240})
        for day, amount in ((3, 100), (4, 100), (5, 50)):
            ship(log, day, FACTORY, DISTRIB, {WATER: amount})
        log[HUB].append(tx(7, {WATER: 1680}))  # the hub's own import
        other = depot_other(log, [(HUB, FACTORY, WATER, 300), (FACTORY, DISTRIB, WATER, 250)],
                            [imports(HUB, WATER, 1680)])
        self.assertEqual(other[WATER], 0)

    def test_a_monday_import_keeps_that_days_round(self):
        """100 paper bags a day leave the hub for the shops; the import lands
        on day 7 as well. Netted, day 7 read +600 and its round was lost."""
        log = {}
        for day in range(3, 10):
            ship(log, day, HUB, None, {BAG: 100})
        log[HUB].append(tx(7, {BAG: 700}))
        other = depot_other(log, [(HUB, FACTORY, WATER, 300)], [imports(HUB, BAG, 700)])
        self.assertEqual(other[BAG], 700)

    def test_the_shops_part_stays_other_beside_a_factorys_own_import(self):
        """The hub sends 200 water a day to the factory and 100 to the shops.
        The factory's own weekly import lands on day 7: it is not something
        the factory took from the hub, so the shops keep day 7's 100."""
        log = {}
        for day in range(3, 10):
            ship(log, day, HUB, FACTORY, {WATER: 200})
            ship(log, day, HUB, None, {WATER: 100})
        log[FACTORY].append(tx(7, {WATER: 500}))
        other = depot_other(log, [(HUB, FACTORY, WATER, 300)], [imports(FACTORY, WATER, 500)])
        self.assertEqual(other[WATER], 700)

    def test_goods_a_factory_only_passes_on_are_other_sites(self):
        """Paper bags reach the factory from the hub and go on to a depot; no
        line eats them, so they are what else leaves the hub."""
        log = {}
        for day in range(3, 10):
            ship(log, day, HUB, FACTORY, {BAG: 100})
            ship(log, day, FACTORY, DISTRIB, {BAG: 100})
        other = depot_other(log, [(HUB, FACTORY, BAG, 500), (FACTORY, DISTRIB, BAG, 500),
                                  (HUB, FACTORY, WATER, 300)], [imports(HUB, BAG, 700)])
        self.assertEqual(other[BAG], 700)


if __name__ == "__main__":
    unittest.main()
