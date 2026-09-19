"""The fields the site panel reads off a business.

Three additions the panel cannot draw without: the door count behind each day
of a site's series, the amenity-by-amenity reading a shop's standards lamps
need, and the list of pre-flight checks a silent site fails.
"""
import unittest

from ba_dashboard import (
    AMENITY_DEMANDS, NEW_SITE_DAYS, OFFICE_TYPES, RETAIL_TYPES, _alerts, _business,
    _staff, site_key,
)
from ba_save import Names, Save

FLORIST = "ba:businesstype_florist"
LAW_FIRM = next(t for t in OFFICE_TYPES if "law" in t)
ADDR = ("ba:street_secondavenue", 10)
KEY = site_key(ADDR)
SERVICE = "ba:skill_customerservice"

# Two people on the floor, for the cases where staffing is not what is tested.
CREW = [{"name": "Tom Bell", "role": "Customer service", "skill": SERVICE,
         "level": 40.0, "daily": 100.0, "absent": False}] * 2


def record_for(name, btype, orders=(), demands=(), shelves=(), prices=(), opened=1):
    """A rented building: sales rows, cached demands, stocked shelves, prices.

    Each shelf is (item slug, amount on hand) and becomes one item instance
    carrying that cargo.
    """
    return {
        "BusinessName": name,
        "businessTypeName": btype,
        "StreetName": ADDR[0], "StreetNumber": ADDR[1],
        "creationDay": opened,
        "orderHistory": {"$items": list(orders)},
        "retailPrices": {"$items": [{"itemName": slug, "price": price} for slug, price in prices]},
        "itemInstances": {"$items": [
            {"$k": f"item{n}", "$v": {"$ref": n}} for n in range(len(shelves))]},
        "cachedFulfilledCustomerDemands": {"$items": list(demands)},
        "scheduleDays": {"$items": []},
    }, list(shelves)


class SiteFieldTests(unittest.TestCase):
    def build(self, name="HART. Flowers", btype=FLORIST, crew=None, **options):
        """A save holding one building, with the refs its cargo points at."""
        record, shelves = record_for(name, btype, **options)
        refs = {n: {"itemName": "ba:itemname_shelf",
                    "cargoInstances": {"$items": [{"itemName": slug, "amount": amount}]}}
                for n, (slug, amount) in enumerate(shelves)}
        return Save({"EmployeeInstances": {"$items": []}}, refs, ""), record

    def business(self, save, record, history=(), day=8, crew=()):
        latest = history[-1][1] if history else {}
        by_addr = {ADDR: list(crew)} if crew else _staff(save, Names({}))[0]
        return _business(save, Names({}), record, ADDR, latest, list(history), by_addr, day)

    def history(self, *days):
        """Statement history: (day, {address: that day's statement})."""
        return [(day, {ADDR: {"TotalSales": 100.0 + day, "TotalProfit": 10.0}}) for day in days]

    def supply(self, planned=False):
        """The supply payload _alerts reads: the plan is what makes a site `planned`."""
        return {"graph": {"links": [{"to": KEY}] if planned else []},
                "shops": [], "idle": [], "imports": []}

    def silent(self, planned=False, crew=(), **options):
        """A site too new to judge, and the finding and checks it fails."""
        save, record = self.build(**options)
        b = self.business(save, record, day=NEW_SITE_DAYS, crew=crew)
        alerts = _alerts([b], self.supply(planned), [], [], [], [], [], 8, 1e6)
        return b, alerts

    # --- series ---------------------------------------------------------

    def test_a_series_entry_carries_its_days_customers(self):
        orders = [{"dayNumber": day, "totalCustomers": day * 10} for day in (5, 6, 7)]
        save, record = self.build(orders=orders)
        b = self.business(save, record, history=self.history(6, 7))
        self.assertEqual([(s["day"], s["customers"]) for s in b["series"]], [(6, 60), (7, 70)])

    def test_a_day_the_order_history_no_longer_covers_has_no_door_count(self):
        # The takings history runs 30 days, the order history a fortnight, so
        # the older days have no reading. None, never a zero: the fortnight
        # spark would otherwise draw a day of no customers that was never
        # measured. A day the history does hold keeps its own zero, which is a
        # measurement like any other.
        save, record = self.build(orders=[{"dayNumber": 6, "totalCustomers": 0}])
        b = self.business(save, record, history=self.history(5, 6))
        self.assertEqual([(s["day"], s["customers"]) for s in b["series"]],
                         [(5, None), (6, 0)])

    # --- amenities ------------------------------------------------------

    def test_a_florist_has_no_music_key_in_its_amenities(self):
        # A florist's customers never ask for music, so there is nothing to
        # report: the key is absent rather than False.
        save, record = self.build(demands=list(AMENITY_DEMANDS))
        b = self.business(save, record)
        self.assertNotIn("music", b["amenities"])
        self.assertEqual(set(b["amenities"]), {"bathroom", "toiletprivacy", "sink", "interior"})
        self.assertEqual(set(b["amenities"].values()), {True})

    def test_an_unmet_amenity_reads_false(self):
        save, record = self.build(demands=[])
        b = self.business(save, record)
        self.assertEqual(set(b["amenities"]), {"bathroom", "toiletprivacy", "sink", "interior"})
        self.assertEqual(set(b["amenities"].values()), {False})

    def test_an_office_is_never_asked_so_it_carries_no_dict(self):
        save, record = self.build(name="HART. &Partners", btype=LAW_FIRM,
                                  demands=list(AMENITY_DEMANDS))
        self.assertIsNone(self.business(save, record)["amenities"])

    # --- notTrading -----------------------------------------------------

    def test_notrading_names_the_checks_a_silent_shop_fails(self):
        # No staff, nothing priced and no plan: with nothing priced the stock
        # questions are never asked, so this is three failures, not four.
        b, alerts = self.silent()
        self.assertEqual(b["notTrading"], ["staff", "prices", "plan"])
        self.assertEqual(alerts["lines"][0]["group"], "notrading")

    def test_nothing_priced_is_stock_is_asked_before_the_shelves(self):
        b, _ = self.silent(prices=[("gift", 10.0), ("card", 5.0)], crew=CREW)
        self.assertEqual(b["notTrading"], ["stock", "plan"])

    def test_half_the_shelves_bare_is_the_shelves_check_and_not_the_stock_one(self):
        # One of three priced lines stocked: there is stock, so the question
        # the alert asks is whether enough of the shelves are filled.
        b, _ = self.silent(
            shelves=[("gift", 10)], prices=[("gift", 10.0), ("card", 5.0), ("vase", 20.0)],
            crew=CREW)
        self.assertEqual(b["notTrading"], ["shelves", "plan"])

    def test_a_planned_ready_site_has_read_everything_and_failed_nothing(self):
        # Staffed, priced, stocked and on a plan, but no trading day booked yet:
        # the finding stands and the list of failed checks is empty.
        b, alerts = self.silent(
            planned=True, shelves=[("gift", 10), ("card", 10)],
            prices=[("gift", 10.0), ("card", 5.0)], crew=CREW)
        self.assertEqual(b["notTrading"], [])
        self.assertIn("no trading day booked yet", alerts["lines"][0]["text"])

    def test_an_office_is_asked_about_staff_and_prices_only(self):
        b, _ = self.silent(name="HART. &Partners", btype=LAW_FIRM)
        self.assertEqual(b["notTrading"], ["staff", "prices"])

    def test_a_trading_site_carries_no_notrading_list(self):
        orders = [{"dayNumber": 7, "totalCustomers": 30, "itemSales": {"$items": [
            {"itemName": "gift", "amountSold": 5, "totalPrice": 50.0}]}}]
        save, record = self.build(orders=orders, shelves=[("gift", 20)],
                                  prices=[("gift", 10.0)], crew=CREW)
        b = self.business(save, record, history=self.history(7))
        self.assertGreater(b["revenue"], 0)
        self.assertNotIn("notTrading", b)

    def test_both_kinds_are_the_statuses_the_panel_forks_on(self):
        self.assertIn(FLORIST, RETAIL_TYPES)
        self.assertIn(LAW_FIRM, OFFICE_TYPES)


if __name__ == "__main__":
    unittest.main()
