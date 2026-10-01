"""Offices trade like shops: their own status, the hour grid, its findings and alerts."""
import os
import sys
import unittest

from tests.i18n_check import MsgAsserts, find_msg, list_items, msg_param

from ba_dashboard import (
    OFFICE_POST_RATE,
    _alerts,
    _business,
    _chains,
    _hour_findings,
    _hourly,
    _marketing_agencies,
    _office_posts,
    _plural,
    _service_wages,
    money,
)
from ba_save import Names, Save
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from build_web import ships  # noqa: E402

LAW = "ba:businesstype_lawfirm"
SHOP = "ba:businesstype_supermarket"
FEE = "ba:itemname_hourlylawyerfee"
LAWYER = "ba:skill_lawyer"
CLEANING = "ba:skill_cleaning"
SERVICE = "ba:skill_customerservice"
COMPUTER = "ba:itemname_computer"
LAPTOP = "ba:itemname_laptop"
REGISTER = "ba:itemname_cashregister"
MONDAY = 1  # day % 7; days 1 and 8 give Monday two weeks of reports
SECOND = "ba:street_secondavenue"


def person(addr, skill, wage):
    """One employee as extraction holds them: an address, a skill, a wage."""
    return {"addr": addr, "skill": skill, "wage": wage}

# The Computer Options page as the game writes it: the workstation it serves is
# linked before the options and is not itself a computer.
COMPUTER_GROUP = (
    "A **Computer** is required to set up a [Computer Workstation](furniture-computerworkstation).\n\n"
    "Options include:\n"
    "* [Basic Gaming PC Setup](furniture-gamingcomputer)\n"
    "* [Computer](furniture-computer)\n"
    "* [ZanaMan Computer](furniture-desktopcomputer)\n"
    "* [Laptop](furniture-laptop)"
)


def shift(employee, post, start, end, kind=1):
    return {"employeeId": employee, "itemInstanceId": post, "startingHour": start,
            "endingHour": end, "type": kind}


def building(btype, items, shifts, hourly, door, number=10, name="HART. &Partners"):
    """A rented site with Monday's roster and the same Monday reported twice."""
    reports = {"$items": [{"hour": h, "customers": c} for h, c in hourly.items()]}
    return {
        "BusinessName": name,
        "businessTypeName": btype,
        "StreetName": "ba:street_secondavenue",
        "StreetNumber": number,
        "creationDay": 1,
        "customerCapacity": door,
        "orderHistory": {"$items": [
            {"dayNumber": day, "totalCustomers": sum(hourly.values()), "hourReports": reports}
            for day in (1, 8)
        ]},
        "retailPrices": {"$items": [{"itemName": FEE, "price": 388.0}]},
        "itemInstances": {"$items": [{"$v": {"id": i, "itemName": slug}} for i, slug in items]},
        "cachedFulfilledCustomerDemands": {"$items": []},
        "scheduleDays": {"$items": [{"day": MONDAY, "workShifts": {"$items": shifts}}]},
    }


def site(status, number=10, name="HART. &Partners", basket=388.0):
    return {"key": f"ba:street_secondavenue#{number}", "status": status, "name": name,
            "basket": basket}


class OfficePostTests(unittest.TestCase):
    def test_computer_options_name_the_posts_and_not_the_workstation(self):
        posts = _office_posts(Names({"help_ba:itemname_computergroup_content": COMPUTER_GROUP}))
        self.assertEqual(posts, {"ba:itemname_gamingcomputer", COMPUTER,
                                 "ba:itemname_desktopcomputer", LAPTOP})

    def test_without_the_page_there_are_no_posts(self):
        self.assertEqual(_office_posts(Names({})), set())

    def test_the_web_build_ships_the_page(self):
        self.assertTrue(ships("help_ba:itemname_computergroup_content", COMPUTER_GROUP))


class OfficeGridTests(MsgAsserts, unittest.TestCase):
    """Four computers, a door cap of 3, lawyers by day and one or two at night."""

    CREW = {"a": LAWYER, "b": LAWYER, "c": LAWYER, "d": LAWYER, "e": LAWYER,
            "f": LAWYER, "cl": CLEANING}

    def grid(self):
        items = [(1, COMPUTER), (2, COMPUTER), (3, LAPTOP), (4, COMPUTER),
                 (9, "ba:itemname_cleaningstation")]
        shifts = [
            shift("a", 1, 9, 17), shift("b", 2, 9, 17), shift("c", 3, 9, 17), shift("e", 4, 9, 17),
            shift("d", 1, 0, 9), shift("f", 2, 4, 9),
            # A cleaner posted at a computer serves nobody; the roaming duty never counts.
            shift("cl", 3, 0, 9), shift("cl", 9, 0, 24, kind=0),
        ]
        hourly = {h: (1 if h < 4 else 2 if h < 9 else 3 if h < 17 else 0) for h in range(24)}
        save = Save({}, {}, "")
        b = building(LAW, items, shifts, hourly, door=3)
        [grid] = _hourly(save, [b], [site("office")], {REGISTER: (SERVICE, 20)},
                         {COMPUTER, LAPTOP}, self.CREW, Names({SERVICE: "Customer Service"}))
        return grid

    def test_professionals_at_computers_are_the_capacity(self):
        grid = self.grid()
        self.assertEqual((grid["office"], grid["postRate"]), (True, OFFICE_POST_RATE))
        self.assertEqual((grid["counters"], grid["stationCount"]), (4 * OFFICE_POST_RATE, 4))
        monday = grid["staffed"][MONDAY]
        self.assertEqual((monday[0], monday[5], monday[10], monday[20]), (1, 2, 4, 0))
        self.assertEqual(grid["effective"][MONDAY][10], 3)  # the door cap holds the day
        self.assertEqual(grid["onShift"][MONDAY][5], 2)

    def test_each_capped_hour_is_held_by_its_own_limit(self):
        grid = self.grid()
        self.assertEqual(grid["capHours"], 17)
        by_limit = {f["limit"].key: f for f in _hour_findings([grid], [site("office")], {})}
        self.assertEqual(set(by_limit), {"sp.py.limit.building", "sp.py.limit.staffing"})
        door, staff = by_limit["sp.py.limit.building"], by_limit["sp.py.limit.staffing"]
        self.assertEqual((door["hours"], door["cap"], door["capTop"]), (8, 3, 3))
        self.assertEqual((staff["hours"], staff["cap"], staff["capTop"]), (9, 1, 2))
        self.assertMsg(door["when"], "sp.py.when.part", days=msg_param("sp.py.wd.1"),
                       hours=msg_param("sp.py.when.hours", a=9, b=17))
        self.assertMsg(staff["when"], "sp.py.when.part", days=msg_param("sp.py.wd.1"),
                       hours=msg_param("sp.py.when.hours", a=0, b=9))
        self.assertMsg(staff["fix"], "sp.py.fix.office.staff")
        # The building's own capacity comes with no advice.
        self.assertEqual(door["fix"], "")
        # Throughput adds up the customers of each capped hour, not the thinnest
        # hour's ceiling times every hour.
        self.assertEqual(door["throughput"], money(8 * 3 * 388 / 7))
        self.assertEqual(staff["throughput"], money((4 * 1 + 5 * 2) * 388 / 7))
        self.assertTrue(all(f["office"] for f in by_limit.values()))

    def test_workstations_name_the_office_register_limit(self):
        items = [(1, COMPUTER), (2, COMPUTER)]
        shifts = [shift("a", 1, 9, 17), shift("b", 2, 9, 17)]
        hourly = {h: 2 if 9 <= h < 17 else 0 for h in range(24)}
        b = building(LAW, items, shifts, hourly, door=50)
        [grid] = _hourly(Save({}, {}, ""), [b], [site("office")], {}, {COMPUTER}, self.CREW)
        [finding] = _hour_findings([grid], [site("office")], {})
        self.assertMsg(finding["limit"], "sp.py.workstations")
        self.assertMsg(finding["fix"], "sp.py.fix.office.post")

    def test_idle_professionals_are_overstaffing(self):
        items = [(i, COMPUTER) for i in range(1, 7)]
        crew = {str(i): LAWYER for i in range(1, 7)}
        shifts = [shift(str(i), i, 9, 13) for i in range(1, 7)]
        hourly = {h: 2 if 9 <= h < 13 else 0 for h in range(24)}
        b = building(LAW, items, shifts, hourly, door=50)
        [grid] = _hourly(Save({}, {}, ""), [b], [site("office")], {}, {COMPUTER}, crew)
        # The wages come the way extraction builds them: the office's
        # professionals under the key its one role looks up, the cleaner's
        # under her own.
        wages = _service_wages([person((SECOND, 10), LAWYER, 146.0),
                                person((SECOND, 10), CLEANING, 90.0)],
                               {grid["key"]: "office"})
        [idle] = _hour_findings([grid], [site("office")], wages)
        self.assertEqual((idle["kind"], idle["staff"], idle["spare"]), ("idle", 6, 16))
        self.assertEqual(idle["worth"], money(16 * 146.0 / 7))
        self.assertTrue(idle["office"])


class ShopGridTests(MsgAsserts, unittest.TestCase):
    def test_a_shop_still_counts_only_service_staff_at_registers(self):
        crew = {"s": SERVICE, "l": LAWYER}
        items = [(1, REGISTER), (2, COMPUTER)]
        shifts = [shift("s", 1, 9, 17), shift("l", 1, 9, 17), shift("s", 2, 17, 20)]
        hourly = {h: 20 if 9 <= h < 17 else 0 for h in range(24)}
        b = building(SHOP, items, shifts, hourly, door=30, name="Mart")
        shop = site("retail", name="Mart", basket=12.0)
        [grid] = _hourly(Save({}, {}, ""), [b], [shop], {REGISTER: (SERVICE, 20)},
                         {COMPUTER}, crew, Names({SERVICE: "Customer Service"}))
        self.assertFalse(grid["office"])
        self.assertEqual((grid["counters"], grid["staffed"][MONDAY][10]), (20, 20))
        [finding] = _hour_findings([grid], [shop], {})
        self.assertMsg(finding["limit"], "sp.py.limit.registers")
        self.assertMsg(finding["fix"], "sp.py.fix.service.post")
        self.assertEqual(finding["hours"], 8)
        # With the customers at the ceiling every hour, the sum is the old figure.
        self.assertEqual(finding["throughput"], money(8 * 20 * 12.0 / 7))


def business(btype=LAW, revenue=1000, staff=(), name="HART. &Partners", number=10, units=0):
    b = building(btype, [], [], {9: 1}, door=50, number=number, name=name)
    b["itemInstances"] = {"$items": [{"$v": {"id": 1, "itemName": "ba:itemname_crate",
                                             "cargoInstances": {"$items": [
                                                 {"itemName": FEE, "amount": units}]}}}]}
    b["satisfaction"] = {"overall": 70}
    addr = (b["StreetName"], b["StreetNumber"])
    latest = {addr: {"TotalSales": revenue, "TotalProfit": revenue / 2}} if revenue else {}
    crew = {addr: list(staff)} if staff else {}
    return _business(Save({}, {}, ""), Names({LAW: "Law Firm"}), b, addr, latest, [], crew, 3)


LAWYER_PERSON = {"role": "Lawyer", "level": 100, "name": "A", "absent": False, "daily": 700.0}
EMPTY_SUPPLY = {"graph": {"links": []}, "shops": [], "idle": [], "nextImportWeekday": None,
                "imports": []}


def alerts(businesses, hours=(), day=3):
    # The city's marketing agencies as an empty save has them: by name, none a contact.
    agencies = _marketing_agencies(Save({}, {}, ""))
    result = _alerts(list(businesses), EMPTY_SUPPLY, [], [], [], list(hours), [], day, 0.0, agencies=agencies)
    return result["lines"] + result["minor"]["rows"]


class OfficeBusinessTests(MsgAsserts, unittest.TestCase):
    def test_an_agency_is_an_office_with_satisfaction_and_no_shop_floor(self):
        b = business(staff=[LAWYER_PERSON])
        self.assertEqual(b["status"], "office")
        self.assertEqual(b["satisfaction"]["overall"], 70)
        self.assertEqual((b["missingAmenities"], b["missingUniformLocker"], b["restocks"]),
                         ([], False, False))

    def test_an_office_gets_the_trading_alerts_and_none_of_the_shop_floor_ones(self):
        groups = {a["group"] for a in alerts([business()])}
        self.assertIn("staff", groups)
        self.assertIn("satisfaction", groups)
        self.assertFalse(groups & {"uniform", "bathroom", "sink", "music", "interior",
                                   "toiletprivacy", "unplanned", "unsourced", "outruns"})

    def test_an_office_short_of_promotion_is_told_which_agency_to_visit(self):
        # Offices run campaigns too (docs/dashboard-reference.md, Campaign mix): with no
        # switch and no agency known, the line names the agencies by name.
        rows = [a for a in alerts([business()]) if a["group"] == "promotion"]
        self.assertEqual([a["level"] for a in rows], ["info"])
        self.assertMsg(rows[0]["text"], "f.promotion.visit", sites="HART. &Partners")
        self.assertEqual(list_items(rows[0]["text"].p["agencies"]), ["CityAds", "McCain's eMarketing"])

    def test_a_new_office_is_not_short_of_stock_or_deliveries(self):
        [line] = [a for a in alerts([business(revenue=0)]) if a["group"] == "notrading"]
        self.assertMsg(line["text"], "f.notrading")
        self.assertMsg(list_items(line["text"].p["reasons"])[0], "f.notrading.staff")
        self.assertNoMsg(line["text"], "f.notrading.stock")
        self.assertNoMsg(line["text"], "f.notrading.shelves")
        self.assertNoMsg(line["text"], "f.notrading.plan")
        staffed = business(revenue=0, staff=[LAWYER_PERSON])
        [line] = [a for a in alerts([staffed]) if a["group"] == "notrading"]
        self.assertHasMsg(line["text"], "f.notrading.ready.office")

    def test_a_new_shop_with_no_prices_says_so(self):
        shop = business(btype=SHOP, revenue=0, staff=[LAWYER_PERSON], name="Mart")
        shop["lines"] = [dict(line, price=0) for line in shop["lines"]]
        [line] = [a for a in alerts([shop]) if a["group"] == "notrading"]
        self.assertHasMsg(line["text"], "f.notrading.prices")

    def test_offices_chain_by_type_and_their_fees_are_trading(self):
        firms = [business(number=10, staff=[LAWYER_PERSON]),
                 business(number=12, name="Second &Partners", staff=[LAWYER_PERSON])]
        save = Save({"logisticsManagerPlans": {"$items": []}}, {}, "")
        [chain] = _chains(save, firms, [])
        self.assertEqual((chain["name"], chain["count"], chain["external"]), ("Law Firms", 2, 0))

    def test_an_agency_chain_is_named_in_proper_plural(self):
        agency = business(btype="ba:businesstype_travelagency", staff=[LAWYER_PERSON])
        agency["type"] = "Travel Agency"
        save = Save({"logisticsManagerPlans": {"$items": []}}, {}, "")
        [chain] = _chains(save, [agency], [])
        self.assertEqual(chain["name"], "Travel Agencies")
        self.assertEqual([_plural(x) for x in ("Gift Shop", "Gym", "Jewelry Store", "Glass")],
                         ["Gift Shops", "Gyms", "Jewelry Stores", "Glass"])


class OfficeAlertTextTests(MsgAsserts, unittest.TestCase):
    def cap(self, key, name, office, limit="staffing", cap=1, top=2):
        return {"kind": "cap", "key": key, "site": name, "office": office, "hours": 9,
                "when": "Mon 0-9", "limit": limit,
                "heldBy": [["door"] if limit == "the building" else ["staff", None]], "fix": "more staff at the computers on those hours",
                "cap": cap, "capTop": top, "basket": 388.0, "throughput": 776.0}

    def test_offices_fill_workstations_and_never_merge_with_shops(self):
        firms = [business(number=10, staff=[LAWYER_PERSON]),
                 business(number=12, name="Second", staff=[LAWYER_PERSON])]
        shop = business(btype=SHOP, number=14, name="Mart", staff=[LAWYER_PERSON])
        hours = [self.cap(firms[0]["key"], firms[0]["name"], True),
                 self.cap(firms[1]["key"], firms[1]["name"], True),
                 self.cap(shop["key"], "Mart", False)]
        lines = [a for a in alerts(firms + [shop], hours) if a["group"] == "atcap"]
        self.assertEqual(len(lines), 2)
        offices = next(a for a in lines if find_msg(a["text"], "f.site.offices"))
        self.assertMsg(offices["text"], "f.atcap.sites", where=msg_param("f.site.offices", n=2),
                       noun=msg_param("sp.py.workstations"), when="Mon 0-9", n=9,
                       rate=msg_param("f.atcap.range", low=1, high=2))
        mart = next(a for a in lines if a["site"] == "Mart")
        self.assertMsg(mart["text"], "f.atcap", noun=msg_param("sp.py.counters"))

    def test_the_building_capacity_raises_no_line(self):
        # Sitting at the building's capacity is normal for a good site and
        # there is nothing to fix, so it is no finding, for an office or a
        # shop, on the list or under it. The site's staffing ceiling still is.
        firm = business(staff=[LAWYER_PERSON])
        shop = business(btype=SHOP, number=14, name="Mart", staff=[LAWYER_PERSON])
        hours = [self.cap(firm["key"], firm["name"], True),
                 self.cap(firm["key"], firm["name"], True, limit="the building", cap=3, top=3),
                 self.cap(shop["key"], "Mart", False, limit="the building", cap=50, top=50)]
        rows = [a for a in alerts([firm, shop], hours) if a["group"] == "atcap"]
        [staff] = rows
        self.assertEqual(staff["site"], firm["name"])
        self.assertMsg(staff["text"], "f.atcap", fix="more staff at the computers on those hours")
        for row in rows:
            self.assertNoMsg(row["text"], "sp.py.limit.building")

    def test_idle_office_staff_are_workstations(self):
        firm = business(staff=[LAWYER_PERSON])
        idle = {"kind": "idle", "key": firm["key"], "site": firm["name"], "office": True,
                "day": "Monday", "from": 9, "to": 13, "staff": 6, "seen": 2, "spare": 16,
                "worth": 332.57}
        [line] = [a for a in alerts([firm], [idle]) if a["group"] == "idlestaff"]
        # A finding with no week of runs is read as a week of one.
        self.assertMsg(line["text"], "f.idlestaff", n=16,
                       runs=msg_param("sp.py.idle.part", n=6, noun=msg_param("sp.py.workstations"),
                                      when=msg_param("sp.py.when.part", days=msg_param("sp.py.wd.1"),
                                                     hours=msg_param("sp.py.when.hours", a=9, b=13))))


if __name__ == "__main__":
    unittest.main()
