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
DISTRIB2, BEER_SHOP = ("depot", 4), ("shop", 5)


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


def depot_other(log, targets, contracts, distrib2_lines=(), shop_rate=100):
    """_supply() over two factories (each line eats water, 240 a day), the hub,
    a second depot and a shop selling water; returns the hub's depotOther."""
    save = SaveStub([[RID], [RID]], hours=24)
    save.address = lambda value: value
    for number, site in enumerate((FACTORY, FACTORY2)):
        save.root["BuildingRegistrations"][number]["deliveryTransactions"] = log.get(site, [])
    for site in (HUB, DISTRIB, DISTRIB2):
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
                 [{"slug": WATER, "item": "Water", "units": 20, "rate": shop_rate, "price": 1}]),
        business(FACTORY2, "Factory Two", "factory", "support", factory_lines),
        business(DISTRIB2, "Distrib Two", "warehouse", "support", list(distrib2_lines)),
        business(BEER_SHOP, "Beer Shop", "kiosk", "retail",
                 [{"slug": BEER, "item": "Beer", "units": 20, "rate": 100, "price": 1}]),
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

    def test_a_depot_two_factories_fill_is_read_net(self):
        """Both factories park 100 a day at the depot; the first also sends
        100 to the shops. The log does not say whose goods the depot got, so
        the first factory is read net, as main: 1,400 a week."""
        log = {}
        for day in range(3, 10):
            ship(log, day, HUB, FACTORY, {WATER: 440})
            ship(log, day, FACTORY, DISTRIB, {WATER: 100})
            ship(log, day, FACTORY, None, {WATER: 100})
            ship(log, day, FACTORY2, DISTRIB, {WATER: 100})
        other = depot_other(log, [(HUB, FACTORY, WATER, 500), (FACTORY, DISTRIB, WATER, 700),
                                  (FACTORY, SHOP, WATER, 150), (FACTORY2, DISTRIB, WATER, 700)],
                            [imports(HUB, WATER, 3080)])
        self.assertEqual(other[WATER], 1400)

    def test_a_shared_depot_receiving_less_than_both_sent_is_read_net(self):
        """Each factory logs 100 out to the depot, which logs only 150 in:
        no split is guessed, and the hub reads main's 700."""
        log = {}
        for day in range(3, 10):
            ship(log, day, HUB, FACTORY, {WATER: 340})
            log.setdefault(FACTORY, []).append(tx(day, {WATER: -100}))
            log.setdefault(FACTORY2, []).append(tx(day, {WATER: -100}))
            log.setdefault(DISTRIB, []).append(tx(day, {WATER: 150}))
        other = depot_other(log, [(HUB, FACTORY, WATER, 400), (FACTORY, DISTRIB, WATER, 700),
                                  (FACTORY2, DISTRIB, WATER, 700)], [imports(HUB, WATER, 2380)])
        self.assertEqual(other[WATER], 700)

    def test_a_factory_that_also_parks_at_a_shared_depot_is_read_net(self):
        """The factory parks 100 a day at a depot only it fills, and 100 at a
        second one the other factory fills too. Its second 100 cannot be told
        from the other factory's, so the factory is read net: 1,400."""
        log = {}
        for day in range(3, 10):
            ship(log, day, HUB, FACTORY, {WATER: 440})
            ship(log, day, FACTORY, DISTRIB, {WATER: 100})
            ship(log, day, FACTORY, DISTRIB2, {WATER: 100})
            ship(log, day, FACTORY2, DISTRIB2, {WATER: 100})
        other = depot_other(log, [(HUB, FACTORY, WATER, 500), (FACTORY, DISTRIB, WATER, 700),
                                  (FACTORY, DISTRIB2, WATER, 700), (FACTORY2, DISTRIB2, WATER, 700)],
                            [imports(HUB, WATER, 3080)])
        self.assertEqual(other[WATER], 1400)

    def test_a_factory_parking_at_two_clean_depots_adds_both(self):
        log = {}
        for day in range(3, 10):
            ship(log, day, HUB, FACTORY, {WATER: 440})
            ship(log, day, FACTORY, DISTRIB, {WATER: 100})
            ship(log, day, FACTORY, DISTRIB2, {WATER: 100})
        other = depot_other(log, [(HUB, FACTORY, WATER, 500), (FACTORY, DISTRIB, WATER, 700),
                                  (FACTORY, DISTRIB2, WATER, 700)], [imports(HUB, WATER, 3080)])
        self.assertEqual(other[WATER], 0)

    def test_a_parking_depot_with_its_own_import_is_read_net(self):
        """The depot also imports water: what it received that day cannot be
        split between the factory and the import, so the factory is read net
        and the hub's figure is main's, 700."""
        log = {}
        for day in range(3, 10):
            ship(log, day, HUB, FACTORY, {WATER: 340})
            ship(log, day, FACTORY, DISTRIB, {WATER: 100})
        log[DISTRIB].append(tx(7, {WATER: 300}))
        other = depot_other(log, [(HUB, FACTORY, WATER, 400), (FACTORY, DISTRIB, WATER, 700)],
                            [imports(HUB, WATER, 2380), imports(DISTRIB, WATER, 300)])
        self.assertEqual(other[WATER], 700)

    def test_a_parking_depot_the_hub_also_fills_is_read_net(self):
        """What else leaves the hub is read over the six days the import cannot
        have landed on (day 7 is its day, whose arrival the log nets off what
        left): 100 a day the factory's intake is read net of, and the one-off
        100 to the distributor on day 5, 700 over six days, 817 a week."""
        log = {}
        for day in range(3, 10):
            ship(log, day, HUB, FACTORY, {WATER: 340})
            ship(log, day, FACTORY, DISTRIB, {WATER: 100})
        ship(log, 5, HUB, DISTRIB, {WATER: 100})
        other = depot_other(log, [(HUB, FACTORY, WATER, 400), (HUB, DISTRIB, WATER, 100),
                                  (FACTORY, DISTRIB, WATER, 700)], [imports(HUB, WATER, 2480)])
        self.assertEqual(other[WATER], 817)

    def test_a_shop_that_sells_other_goods_does_not_use_the_item(self):
        """The depot passes the water on to a shop that sells only beer:
        nothing uses it there either, so it is parked, not shop use. This
        relies on the shop listing no line for water."""
        log = {}
        for day in range(3, 10):
            ship(log, day, HUB, FACTORY, {WATER: 340})
            ship(log, day, FACTORY, DISTRIB, {WATER: 100})
        ship(log, 6, DISTRIB, None, {WATER: 200})
        other = depot_other(log, [(HUB, FACTORY, WATER, 400), (FACTORY, DISTRIB, WATER, 700),
                                  (DISTRIB, BEER_SHOP, WATER, 200)], [imports(HUB, WATER, 2380)])
        self.assertEqual(other[WATER], 0)

    def test_a_depot_that_passes_goods_to_another_idle_depot_is_idle(self):
        log = {}
        for day in range(3, 10):
            ship(log, day, HUB, FACTORY, {WATER: 340})
            ship(log, day, FACTORY, DISTRIB, {WATER: 100})
        ship(log, 6, DISTRIB, DISTRIB2, {WATER: 300})
        other = depot_other(log, [(HUB, FACTORY, WATER, 400), (FACTORY, DISTRIB, WATER, 700),
                                  (DISTRIB, DISTRIB2, WATER, 300)], [imports(HUB, WATER, 2380)])
        self.assertEqual(other[WATER], 0)

    def test_a_loop_between_depots_ends_and_is_read_net(self):
        """The two depots pass the water back and forth. The walk ends; the
        first depot then gets water from a depot as well as the factory, so
        its receipt cannot be split and the factory is read net, as main."""
        log = {}
        for day in range(3, 10):
            ship(log, day, HUB, FACTORY, {WATER: 340})
            ship(log, day, FACTORY, DISTRIB, {WATER: 100})
        ship(log, 6, DISTRIB, DISTRIB2, {WATER: 300})
        other = depot_other(log, [(HUB, FACTORY, WATER, 400), (FACTORY, DISTRIB, WATER, 700),
                                  (DISTRIB, DISTRIB2, WATER, 300), (DISTRIB2, DISTRIB, WATER, 300)],
                            [imports(HUB, WATER, 2380)])
        self.assertEqual(other[WATER], 700)

    def test_a_chain_that_ends_on_a_shelf_still_counts(self):
        log = {}
        for day in range(3, 10):
            ship(log, day, HUB, FACTORY, {WATER: 340})
            ship(log, day, FACTORY, DISTRIB, {WATER: 100})
            ship(log, day, DISTRIB, DISTRIB2, {WATER: 100})
            ship(log, day, DISTRIB2, None, {WATER: 100})
        other = depot_other(log, [(HUB, FACTORY, WATER, 400), (FACTORY, DISTRIB, WATER, 200),
                                  (DISTRIB, DISTRIB2, WATER, 200), (DISTRIB2, SHOP, WATER, 150)],
                            [imports(HUB, WATER, 2380)])
        self.assertEqual(other[WATER], 700)

    def test_no_more_is_added_back_than_the_depot_received(self):
        """The factory logs 150 leaving a day, but the idle depot received
        only 100: the other 50 stays read as leaving, 350 a week."""
        log = {}
        for day in range(3, 10):
            ship(log, day, HUB, FACTORY, {WATER: 340})
            ship(log, day, FACTORY, DISTRIB, {WATER: 100})
            ship(log, day, FACTORY, None, {WATER: 50})
        other = depot_other(log, [(HUB, FACTORY, WATER, 400), (FACTORY, DISTRIB, WATER, 700)],
                            [imports(HUB, WATER, 2380)])
        self.assertEqual(other[WATER], 350)

    def test_a_factory_that_eats_the_item_is_never_idle(self):
        """The first factory passes 100 a day to the second, whose line eats
        it and which ships none on: that is use, 700 a week, as main read it."""
        log = {}
        for day in range(3, 10):
            ship(log, day, HUB, FACTORY, {WATER: 340})
            ship(log, day, FACTORY, FACTORY2, {WATER: 100})
        other = depot_other(log, [(HUB, FACTORY, WATER, 400), (FACTORY, FACTORY2, WATER, 300)],
                            [imports(HUB, WATER, 2380)])
        self.assertEqual(other[WATER], 700)

    def test_a_depot_routed_to_a_shelf_that_shipped_nothing_is_read_net(self):
        """The depot has a route to a shop selling water but sent none in the
        window: a shelf can use it, so the factory is read net, as main."""
        log = {}
        for day in range(3, 10):
            ship(log, day, HUB, FACTORY, {WATER: 340})
            ship(log, day, FACTORY, DISTRIB, {WATER: 100})
        other = depot_other(log, [(HUB, FACTORY, WATER, 400), (FACTORY, DISTRIB, WATER, 700),
                                  (DISTRIB, SHOP, WATER, 150)], [imports(HUB, WATER, 2380)])
        self.assertEqual(other[WATER], 700)

    def test_a_factory_with_a_second_routed_source_is_read_net(self):
        """The hub sends the factory 200 a day and the shops 100; a depot
        also sends the factory 100 a day, and the factory parks 100 at an
        idle depot. Whose 100 it parked is unknown, so it is read net, as
        main: 700."""
        log = {}
        for day in range(3, 10):
            ship(log, day, HUB, FACTORY, {WATER: 200})
            ship(log, day, HUB, None, {WATER: 100})
            ship(log, day, DISTRIB2, FACTORY, {WATER: 100})
            ship(log, day, FACTORY, DISTRIB, {WATER: 100})
        # The depot's route comes first, so the hub's is the one the factory's
        # target names, and the factory counts among what the hub feeds.
        other = depot_other(log, [(DISTRIB2, FACTORY, WATER, 200), (HUB, FACTORY, WATER, 300),
                                  (HUB, SHOP, WATER, 150), (FACTORY, DISTRIB, WATER, 700)],
                            [imports(HUB, WATER, 2100)])
        self.assertEqual(other[WATER], 700)

    def test_a_site_whose_line_shows_sales_uses_the_item(self):
        """The depot passes the water on to a site of another type whose
        water line shows sales: that is use, so the factory is read net: 700."""
        log = {}
        for day in range(3, 10):
            ship(log, day, HUB, FACTORY, {WATER: 340})
            ship(log, day, FACTORY, DISTRIB, {WATER: 100})
        other = depot_other(log, [(HUB, FACTORY, WATER, 400), (FACTORY, DISTRIB, WATER, 700),
                                  (DISTRIB, DISTRIB2, WATER, 300)], [imports(HUB, WATER, 2380)],
                            distrib2_lines=[{"slug": WATER, "item": "Water", "units": 20,
                                             "rate": 50, "price": 1}])
        self.assertEqual(other[WATER], 700)

    def test_a_leaf_depot_that_ships_the_item_is_not_idle(self):
        """The depot has no onward route for water but logs 100 leaving each
        day: something draws it, so the factory is read net, as main: 700."""
        log = {}
        for day in range(3, 10):
            ship(log, day, HUB, FACTORY, {WATER: 340})
            ship(log, day, FACTORY, DISTRIB, {WATER: 100})
            ship(log, day, DISTRIB, None, {WATER: 100})
        other = depot_other(log, [(HUB, FACTORY, WATER, 400), (FACTORY, DISTRIB, WATER, 700)],
                            [imports(HUB, WATER, 2380)])
        self.assertEqual(other[WATER], 700)

    def test_a_shelf_listing_the_item_without_sales_still_uses_it(self):
        """As the shelf route that shipped nothing, with the shop's water line
        at no sales: a shop listing the item can sell it, so it reads net: 700."""
        log = {}
        for day in range(3, 10):
            ship(log, day, HUB, FACTORY, {WATER: 340})
            ship(log, day, FACTORY, DISTRIB, {WATER: 100})
        other = depot_other(log, [(HUB, FACTORY, WATER, 400), (FACTORY, DISTRIB, WATER, 700),
                                  (DISTRIB, SHOP, WATER, 150)], [imports(HUB, WATER, 2380)],
                            shop_rate=0)
        self.assertEqual(other[WATER], 700)


if __name__ == "__main__":
    unittest.main()
