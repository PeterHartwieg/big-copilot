"""One supply verdict per fact (R8), on synthetic fixtures only.

Python is the only verdict engine: every (site, item) held, needed or planned
carries one fact in supply.facts, with one status word, the figures behind it
in 24/7 sizing, and under `dem` only what Demand sizing changes. The findings
on Today read the same facts.
"""
import unittest

from ba_dashboard import _business, _coming_week, site_key
from ba_save import Names, Save

SHOP_TYPE = "ba:businesstype_florist"
ADDR = ("ba:street_secondavenue", 10)
ROSE = "ba:itemname_rose"


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


if __name__ == "__main__":
    unittest.main()
