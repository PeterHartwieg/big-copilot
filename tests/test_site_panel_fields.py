"""The fields the site panel reads off a business.

Three additions the panel cannot draw without: the door count behind each day
of a site's series, the amenity-by-amenity reading a shop's standards lamps
need, and the list of pre-flight checks a silent site fails.
"""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import es3_fixture  # noqa: E402
from ba_dashboard import (  # noqa: E402
    AMENITY_DEMANDS, NEW_SITE_DAYS, OFFICE_TYPES, RETAIL_TYPES, _alert_id, _alerts,
    _business, _staff, extract, site_key,
)
from ba_save import Names, Save, load_save  # noqa: E402

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

    def silent(self, planned=False, crew=(), closed=False, **options):
        """A site too new to judge, and the finding and checks it fails."""
        save, record = self.build(**options)
        b = self.business(save, record, day=NEW_SITE_DAYS, crew=crew)
        b["closed"] = closed  # as extract() sets it from the registration
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

    def test_a_ready_site_shut_with_the_switch_says_it_is_closed(self):
        # Everything in place, but the game's temporarily-closed switch is on:
        # that is the reason, not "no trading day booked yet".
        b, alerts = self.silent(
            planned=True, closed=True, shelves=[("gift", 10), ("card", 10)],
            prices=[("gift", 10.0), ("card", 5.0)], crew=CREW)
        self.assertEqual(b["notTrading"], ["closed"])
        self.assertEqual(alerts["lines"][0]["text"],
                         "HART. Flowers opened day 1, not trading yet: temporarily closed, "
                         "$0/day rent")

    def test_a_closed_site_lists_its_other_failures_after_the_switch(self):
        b, alerts = self.silent(closed=True)
        self.assertEqual(b["notTrading"], ["closed", "staff", "prices", "plan"])
        self.assertIn("not trading yet: temporarily closed, no staff, no prices set, "
                      "no delivery plan", alerts["lines"][0]["text"])

    def test_extract_carries_the_switch_onto_the_business(self):
        # The flag lives on the building registration; extract() copies it on.
        company = es3_fixture.link_company()
        bare = next(r for r in company["BuildingRegistrations"] if r["BusinessName"] == "HART. Bare")
        bare.update(temporarilyClosed=True, creationDay=company["Day"] - 1)
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, "closed.hsg")
            with open(path, "wb") as fh:
                fh.write(es3_fixture.encode(company))
            data = extract(load_save(path), Names({}), None)
        by_name = {b["name"]: b for b in data["businesses"]}
        self.assertTrue(by_name["HART. Bare"]["closed"])
        self.assertFalse(by_name["HART. Gifts"]["closed"])
        self.assertEqual(by_name["HART. Bare"]["notTrading"][0], "closed")

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


# --- what a finding carries for the site panel to point at -------------------

DEPOT_KEY = site_key(("ba:street_firstavenue", 1))
WORKS_KEY = site_key(("ba:street_pierroad", 9))
SODA = "ba:itemname_soda"
BEEF = "ba:itemname_groundbeef"


def stub(key, name, status, **over):
    """The fields _alerts() reads off a business, and nothing else."""
    return {
        "key": key, "name": name, "status": status, "typeSlug": "",
        "revenue": 0.0, "profit": 0.0, "opened": 1, "rent": 100.0, "staff": 1,
        "customers": 0, "costCentre": True, "lines": [], "crew": [],
        "satisfaction": {"overall": None}, "staffDemands": [], "quitWarnings": 0,
        "promotion": None, "missingUniformLocker": False, "uniformGaps": [],
        "missingAmenities": [], "traffic": 0, "marketingIndex": 0,
        **over,
    }


class FindingEvidenceTests(unittest.TestCase):
    """_condense() drops `rank` and `subject`, so the row the site panel pulses
    has to survive as `ev` — the item's slug, or a machine's list position."""

    businesses = [stub(DEPOT_KEY, "HART. Depot", "support"),
                  stub(WORKS_KEY, "HART. Works", "support")]

    def supply(self):
        imports = [{
            "s": 0, "item": "Soda", "slug": SODA, "stock": 200, "perDay": 1000,
            "basis": "shipped", "peakDay": "Friday", "peakPerDay": 1100, "cover": 1.0,
            "stockCover": 1.0, "daysOnHand": 1.0, "runsOut": "Tuesday", "weekly": 500,
            "lastWeek": 500, "weekNeed": 7000, "orderFit": "short", "coverFit": "short",
            "due": 4.0, "shortBy": 3.0, "catchUp": 2400, "coverageUntil": 12,
            "paused": False, "arrives": 12, "from": "Acme", "level": "critical",
            "reason": "order",
        }]
        idle = [{"s": 0, "item": "Napkins", "slug": "ba:itemname_napkins", "stock": 5000,
                 "perWeek": 0, "weeks": None, "target": 0, "price": 0.0, "value": "$0",
                 "dead": True, "level": "warn"}]
        need = {
            "item": "Bag of Tomatoes", "slug": BEEF, "perDay": 9600, "perWeek": 67200,
            "lines": ["Burger"], "target": 0, "raiseTarget": None, "raiseImport": None,
            "dailyNeed": 9600, "arrives": 0, "known": True, "stock": 0, "from": 0,
            "directImport": False, "stalled": False, "waitingOn": [], "importWeekly": None,
            "importPaused": False, "depotNeed": 67200, "depotStock": 0, "staffedShare": 1.0,
            "madeAt": [], "importSite": 0, "status": "unplanned", "level": "critical",
        }
        # An import sized wrong is one finding about the depot, however many
        # factories draw on it: _feed_notes() re-keys it to the import site,
        # and the recipe's label for the goods is not that depot's label.
        offsite = {**need, "item": "Fizzy Drink", "slug": SODA, "status": "noimport",
                   "level": "warn", "importWeekly": None, "depotNeed": 7000}
        needs = [need, offsite]
        lines = [{"rid": "r1", "item": "Burger", "slug": "ba:itemname_burger",
                  "workstation": "Food Workstation", "slots": [3], "machines": 1,
                  "rate": 200, "makes": 4800, "ships": 0, "stock": 0, "missing": [],
                  "gaps": [{"slot": 3, "hours": 100, "off": "on Sundays"}]}]
        return {
            "graph": {"links": []}, "shops": [], "imports": imports, "idle": idle,
            "factories": {"sites": [{"s": 1, "machines": 1, "lines": lines, "unnamed": [],
                                     "needs": needs, "targets": {}, "known": True,
                                     "arrivals": {}}]},
        }

    def all_rows(self, supply=None):
        result = _alerts(list(self.businesses), supply or self.supply(),
                         [], [], [], [], [], 20, 0.0)
        return result["lines"] + result["minor"]["rows"]

    def rows(self, supply=None):
        return {row["group"]: row for row in self.all_rows(supply)}

    def one(self, group, key):
        return next(r for r in self.all_rows()
                    if r["group"] == group and r["siteKey"] == key)

    def test_every_group_the_panel_pulses_by_row_carries_its_slug(self):
        rows = self.rows()
        for group, slug in (("order", SODA), ("dead", "ba:itemname_napkins")):
            self.assertIn(group, rows, f"{group} is in the fixture's findings")
            self.assertEqual(rows[group]["ev"], {"slug": slug})
        own = self.one("feed", WORKS_KEY)
        self.assertEqual(own["ev"], {"slug": BEEF})
        # A recipe's label for an input is not the depot line's label, so the
        # slug is the only thing the panel can join on.
        self.assertNotIn("Tomatoes", own["ev"]["slug"])

    def test_an_import_finding_re_keyed_to_the_depot_carries_the_depots_slug(self):
        offsite = self.one("feed", DEPOT_KEY)
        # The sentence says "Fizzy Drink"; the depot's line is "Soda". Only the
        # slug joins the two, so that is what travels.
        self.assertIn("Fizzy Drink", offsite["text"])
        self.assertEqual(offsite["ev"], {"slug": SODA})

    def test_a_staffing_finding_carries_the_machines_list_position(self):
        self.assertEqual(self.rows()["staff"]["ev"],
                         {"slot": 3, "slug": "ba:itemname_burger"})

    def test_the_evidence_never_reaches_the_page_as_subject_or_rank(self):
        for row in self.rows().values():
            self.assertNotIn("subject", row)
            self.assertNotIn("rank", row)

    def test_a_group_with_a_fixed_mark_carries_no_evidence_at_all(self):
        # unnamed and unset name a workstation, not an item: the panel has its
        # own mark for them, so nothing rides along in the payload.
        supply = self.supply()
        supply["factories"]["sites"][0]["unnamed"] = [
            {"rid": None, "workstation": "Food Workstation", "slots": [4], "machines": 1,
             "idle": True, "candidates": [], "hoursWeek": 168, "fullWeek": 168, "gaps": []}]
        result = _alerts(list(self.businesses), supply, [], [], [], [], [], 20, 0.0)
        unset = next(r for r in result["lines"] + result["minor"]["rows"]
                     if r["group"] == "unset")
        self.assertNotIn("ev", unset)

    def test_the_evidence_does_not_change_a_findings_id(self):
        # The id hashes the group, the site key and the subject, none of which
        # the new field touches: a silenced finding stays silenced.
        self.assertEqual(self.one("order", DEPOT_KEY)["id"],
                         _alert_id("order", DEPOT_KEY, "Soda"))
        self.assertEqual(self.one("feed", WORKS_KEY)["id"],
                         _alert_id("feed", WORKS_KEY, "Bag of Tomatoes"))

    def test_a_merged_line_points_at_the_worst_of_its_rows(self):
        # Three of a kind at one site condense into one line, which reads out
        # the worst row and so points at that row's evidence.
        supply = self.supply()
        base = supply["imports"][0]
        supply["imports"] = [
            {**base, "item": name, "slug": f"ba:itemname_{name.lower()}", "cover": cover}
            for name, cover in (("Soda", 3.0), ("Juice", 1.0), ("Water", 2.0))]
        result = _alerts(list(self.businesses), supply, [], [], [], [], [], 20, 0.0)
        merged = next(r for r in result["lines"] + result["minor"]["rows"]
                      if r["group"] == "order")
        self.assertIn("{n} weekly orders".format(n=3)[:3], merged["text"])
        self.assertEqual(merged["ev"], {"slug": "ba:itemname_juice"})
