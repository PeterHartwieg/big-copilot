"""Wholesale buying and delivery setup from synthetic shops and contracts."""
import copy
import unittest
from unittest.mock import patch

from ba_dashboard import Names, _business, _wholesale_buy, _wholesale_shopping
from ba_save import Save
from tests.test_supply_facts import Company, SODA, BEER

SHOP = ("main_street", 1)
DEPOT = ("depot_street", 2)
SERVICE = "ba:itemname_haircuttingfee"
CARE = "ba:itemname_haircareproduct"
RULES = {"products": {SODA: {"bx": 50}, BEER: {"bx": 100},
                      SERVICE: {"s": 1}, CARE: {"bx": 50}, "ticket": {"k": 1}}}


class WholesaleShopping(unittest.TestCase):
    def company(self, stock=100, hour=20, **options):
        c = Company(day=20, hour=hour)  # a Saturday; a drop on day d lands at d + 8/24
        c.shop(SHOP, "Shop", **options)
        c.hold(SHOP, SODA, stock, rate=100, weekSold=700)
        return c

    def rows(self, c, businesses=None):
        businesses = c.businesses() if businesses is None else businesses
        before = copy.deepcopy(businesses)
        with patch("ba_dashboard.load_store_rules", return_value=RULES):
            rows = _wholesale_shopping(c.save(), Names({}), businesses)["rows"]
        self.assertEqual(businesses, before, "a deferred section cannot alter core business rows")
        return rows

    def test_suppliers_use_paired_runtime_products_and_saved_contacts_and_hours(self):
        c = self.company()
        save = c.save()
        vendor = {"StreetName": "supplier", "StreetNumber": 4, "BusinessName": "Warehouse Market",
                  "businessTypeName": "ba:businesstype_wholesalestore", "cachedAvailableProducts": ["wrong-cache"],
                  "scheduleDays": [{"day": 7, "isOpen": True, "openingHourSlots": [{"startingHour": 8, "endingHour": 18}]}]}
        save.root["BuildingRegistrations"].append(vendor)
        save.root["Contacts"] = [{"streetName": "supplier", "streetNumber": 4}]
        save.facts = {"wholesalers": [{"street": "supplier", "number": 4, "fee": 100, "products": [BEER, SODA]}]}
        with patch("ba_dashboard.load_store_rules", return_value=RULES):
            [supplier] = _wholesale_shopping(save, Names({}), c.businesses())["suppliers"]
        self.assertEqual(supplier["products"], sorted([BEER, SODA]))
        self.assertEqual((supplier["fee"], supplier["contact"], supplier["hours"][0]), (100, True, [[8, 18]]))
        save.facts = None
        with patch("ba_dashboard.load_store_rules", return_value=RULES):
            data = _wholesale_shopping(save, Names({}), c.businesses())
        self.assertEqual(data["suppliers"][0]["products"], [], "NPC cached products are not authoritative")
        self.assertTrue(data["rows"], "old saves still support manual shopping")

    def test_manual_purchase_uses_stock_and_whole_boxes_but_weekly_amount_does_not(self):
        [r] = self.rows(self.company())
        self.assertEqual((r["week"], r["stock"], r["weekly"]), (700, 100, 810))
        self.assertEqual((r["buy"], r["boxes"], r["box"]), (750, 15, 50))
        [full] = self.rows(self.company(stock=900))
        self.assertEqual((full["buy"], full["boxes"], full["weekly"]), (0, 0, 810))

    def test_uses_measured_week_not_seven_trading_days(self):
        c = self.company(stock=0)
        c.lines[SHOP][SODA]["weekSold"] = 200  # opens two days a week
        [r] = self.rows(c)
        self.assertEqual((r["week"], r["weekly"], r["buy"]), (200, 230, 250))

    def test_late_delivery_cannot_hide_the_stock_needed_before_it_arrives(self):
        c = self.company(stock=0)
        c.wholesale(SHOP, SODA, 900, due=26)  # 5.5 days away
        [r] = self.rows(c)
        self.assertEqual((r["scheduled"], r["current"]), (900, 900))
        self.assertEqual((r["buy"], r["boxes"]), (650, 13))
        self.assertEqual(r["deliveries"], [[5.5, 900]])

    def test_each_drop_keeps_its_date_and_one_offs_reduce_only_buy_now(self):
        c = self.company(stock=100)
        c.wholesale(SHOP, SODA, 50, due=21, repeating=False)
        c.wholesale(SHOP, SODA, 900, due=26)
        [r] = self.rows(c)
        self.assertEqual(r["deliveries"], [[0.5, 50], [5.5, 900]])
        self.assertEqual((r["scheduled"], r["current"], r["weekly"], r["buy"]), (950, 900, 810, 500))

    def test_disabled_and_later_deliveries_do_not_reduce_buying(self):
        c = self.company(stock=0)
        c.wholesale(SHOP, SODA, 900, due=21, enabled=False)
        c.wholesale(SHOP, SODA, 900, due=28)
        [r] = self.rows(c)
        self.assertEqual((r["scheduled"], r["buy"]), (0, 850))
        self.assertEqual(_wholesale_buy(700, 0, []), 700)

    def test_uncertain_or_overdue_delivery_pauses_buying_without_hiding_weekly_setup(self):
        for due in (None, 20, 19):
            with self.subTest(due=due):
                c = self.company()
                c.wholesale(SHOP, SODA, 200)
                c.deliveries[0]["nextDeliveryDay"] = due
                [r] = self.rows(c)
                self.assertTrue(r["deliveryUnknown"])
                self.assertIsNone(r["buy"])
                self.assertIsNone(r["boxes"])
                self.assertEqual(r["weekly"], 810)

    def test_daily_routes_and_imports_do_not_get_a_second_wholesale_recommendation(self):
        for source in ("route", "import"):
            with self.subTest(source=source):
                c = self.company()
                if source == "route":
                    c.site(DEPOT, "Depot")
                    c.hold(DEPOT, SODA, 1000)
                    c.plan(DEPOT, SHOP, SODA, 200)
                else:
                    c.contract(SHOP, SODA, 900)
                [r] = self.rows(c)
                self.assertEqual(r["reason"], source)
                self.assertIsNone(r["buy"])
                self.assertIsNone(r["weekly"])

    def test_new_shops_and_products_without_sales_are_unknown(self):
        [r] = self.rows(self.company(trade_days=2))
        self.assertEqual(r["reason"], "new")
        self.assertIsNone(r["weekly"])
        for stock in (0, 100):
            with self.subTest(stock=stock):
                c = self.company(stock=stock)
                c.lines[SHOP][SODA].update(rate=0, weekSold=0)
                [r] = self.rows(c)
                self.assertEqual(r["reason"], "no-sales")
                self.assertIsNone(r["buy"])

    def test_closed_shops_services_tickets_and_retired_products_are_not_shopping(self):
        c = self.company()
        c.hold(SHOP, SERVICE, 0, rate=100)
        c.hold(SHOP, "ticket", 0, rate=100)
        c.hold(SHOP, BEER, 500, rate=100, retired=True)
        self.assertEqual([r["slug"] for r in self.rows(c)], [SODA])
        c.closed = {SHOP}
        self.assertEqual(self.rows(c), [])

    def test_haircare_counts_paid_bottles_and_each_service_once(self):
        # Unwatched hours book each service's product as a free sale, watched
        # hours do not, so the use is the paid bottles plus every service.
        cases = (("unwatched: 35 bottles and 100 free", 135, 100, 100, (135, 160, 200)),
                 ("watched: 20 bottles", 20, None, 65, (85, 100, 100)),
                 ("services only", 0, None, 100, (100, 120, 150)))
        for name, sold, free, services, expect in cases:
            with self.subTest(name):
                c = Company()
                c.site(SHOP, "Salon", status="retail", kind="ba:businesstype_hairdresser")
                c.hold(SHOP, CARE, 0, rate=sold / 7, weekSold=sold, **({"weekFree": free} if free else {}))
                c.hold(SHOP, SERVICE, 0, rate=services / 7, weekSold=services)
                [r] = self.rows(c)
                self.assertEqual((r["slug"], r["week"], r["weekly"], r["buy"]), (CARE, *expect))

    def test_a_line_counts_its_free_sales_over_the_trading_days(self):
        def day(d, paid, free):
            parts = [{"price": 20.0, "amount": paid}] + ([{"price": 0.0, "amount": free}] if free else [])
            return {"dayNumber": d, "totalCustomers": 10, "itemSales": {"$items": [
                {"itemName": CARE, "amountSold": paid + free, "totalPrice": 20.0 * paid,
                 "itemSoldBreakdownEntries": {"$items": parts}}]}}
        building = {"BusinessName": "Salon", "businessTypeName": "ba:businesstype_hairdresser",
                    "StreetName": "main_street", "StreetNumber": 1, "creationDay": 1,
                    "orderHistory": {"$items": [day(d, 5, 10 if d < 18 else 0) for d in range(14, 21)]},
                    "retailPrices": {"$items": []}, "itemInstances": {"$items": []},
                    "cachedFulfilledCustomerDemands": {"$items": []}, "uniformsBySkill": {"$items": []}}
        [line] = _business(Save({}, {}, ""), Names({}), building, SHOP, {}, [], {}, 21)["lines"]
        # Seven trading days, four of them unwatched: 35 bottles and 40 free units.
        self.assertEqual((line["weekSold"], line["weekFree"]), (75, 40))

    def test_a_drop_due_this_morning_still_counts_before_08_00(self):
        c = self.company(stock=0, hour=6)
        c.wholesale(SHOP, SODA, 900, due=20)
        [r] = self.rows(c)
        self.assertFalse(r["deliveryUnknown"])
        self.assertEqual(r["deliveries"], [[0.083, 900]])

    def test_a_rushed_weekly_contract_stays_weekly_but_its_next_monday_is_not_credited(self):
        # The game trims that drop to the weekly wholesale limit left, which no
        # save records, so Buy now does not lean on it.
        c = self.company(stock=0)
        c.wholesale(SHOP, SODA, 500, due=21)  # Sunday, rushed; Monday is day 22
        c.deliveries[0]["isUrgentOrder"] = True
        c.wholesale(SHOP, SODA, 40, due=21, repeating=False)
        [r] = self.rows(c)
        self.assertEqual(r["deliveries"], [[0.5, 40], [0.5, 500]])
        self.assertEqual((r["scheduled"], r["current"]), (540, 500))

if __name__ == "__main__":
    unittest.main()
