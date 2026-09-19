"""The need curve, its four bases, the ceiling that only bounds it, and the roster.

Synthetic fixtures throughout, never a real save. The ceiling is checked as a
bound and never as a demand, which is the one thing this feature must not get
wrong, and every shift the builder produces is checked against the game's own
rules rather than against a hand-copied expectation.
"""
import collections
import json
import math
import os
import subprocess
import sys
import unittest

import ba_dashboard
from ba_dashboard import (
    JOB_DEMANDS,
    SHIFT_CAP,
    OVERWORK_HOURS,
    _arrival_ceiling,
    _cut_run,
    _fill_stations,
    _hourly,
    _need_curve,
    _staff,
    _staffing,
    load_demand_curves,
    site_key,
)
from ba_save import Names, Save

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERVICE = "ba:skill_customerservice"
TRAINER = "ba:skill_gymtrainer"
CLEANING = "ba:skill_cleaning"
GUARD = "ba:skill_securityguard"
SHOP = "ba:businesstype_clothingstore"


def role(skill, rates, staffed=None):
    """One of a grid's roles, as _hourly() builds it."""
    return {
        "skill": skill,
        "label": skill,
        "station": "Cash register",
        "counters": sum(rates),
        "stationCount": len(rates),
        "staffed": staffed or [[0] * 24 for _ in range(7)],
        "onShift": [[0] * 24 for _ in range(7)],
        "noun": None,
    }


def grid(roles, customers=None, weeks=None, door=0, thin=None):
    """A site's hour grid with only the keys the need curve reads."""
    customers = customers or [[None] * 24 for _ in range(7)]
    weeks = weeks if weeks is not None else [2] * 7
    staffed = [
        [min(r["staffed"][wd][h] for r in roles) for h in range(24)] for wd in range(7)
    ]
    return {
        "customers": customers,
        "weeks": weeks,
        "thin": thin if thin is not None else [w < 2 for w in weeks],
        "door": door,
        "roles": roles,
        "staffed": staffed,
        "effective": [
            [min(staffed[wd][h], door) if door else staffed[wd][h] for h in range(24)]
            for wd in range(7)
        ],
    }


class NeedCurveTest(unittest.TestCase):
    """measured, censored, scaled and none, one case at a time."""

    def test_measured_hour_is_the_customers_that_came(self):
        customers = [[None] * 24 for _ in range(7)]
        customers[1][12] = 37.0
        # Plenty of capacity on, so the hour is nowhere near its ceiling.
        staffed = [[0] * 24 for _ in range(7)]
        staffed[1][12] = 200
        out = _need_curve(grid([role(SERVICE, [20, 20, 20], staffed)], customers))
        self.assertEqual(out[SERVICE]["basis"][1][12], "measured")
        self.assertEqual(out[SERVICE]["demand"][1][12], 37.0)
        # 37 customers an hour fills two of the three twenty-an-hour registers.
        self.assertEqual(out[SERVICE]["need"][1][12], 2)

    def test_an_hour_with_no_report_on_a_measured_day_has_no_basis(self):
        customers = [[None] * 24 for _ in range(7)]
        customers[1][12] = 10.0
        out = _need_curve(grid([role(SERVICE, [20])], customers))
        self.assertEqual(out[SERVICE]["basis"][1][3], "none")
        self.assertEqual(out[SERVICE]["need"][1][3], 0)

    def test_a_capped_hour_is_censored_and_asks_for_one_more_station(self):
        customers = [[None] * 24 for _ in range(7)]
        customers[1][12] = 40.0  # exactly what two manned registers could serve
        staffed = [[0] * 24 for _ in range(7)]
        staffed[1][12] = 40
        out = _need_curve(grid([role(SERVICE, [20, 20, 20], staffed)], customers))
        self.assertEqual(out[SERVICE]["basis"][1][12], "censored")
        self.assertEqual(out[SERVICE]["demand"][1][12], 60.0)
        self.assertEqual(out[SERVICE]["need"][1][12], 3)

    def test_the_censored_estimate_never_passes_the_stations_installed(self):
        customers = [[None] * 24 for _ in range(7)]
        customers[1][12] = 40.0
        staffed = [[0] * 24 for _ in range(7)]
        staffed[1][12] = 40
        # Both registers already manned: there is no third one to add.
        out = _need_curve(grid([role(SERVICE, [20, 20], staffed)], customers))
        self.assertEqual(out[SERVICE]["basis"][1][12], "censored")
        self.assertEqual(out[SERVICE]["demand"][1][12], 40.0)
        self.assertEqual(out[SERVICE]["need"][1][12], 2)

    def test_the_door_cap_bounds_a_censored_hour(self):
        customers = [[None] * 24 for _ in range(7)]
        customers[1][12] = 40.0
        staffed = [[0] * 24 for _ in range(7)]
        staffed[1][12] = 40
        out = _need_curve(
            grid([role(SERVICE, [20, 20, 20], staffed)], customers, door=45)
        )
        self.assertEqual(out[SERVICE]["demand"][1][12], 45.0)

    def test_the_arrival_ceiling_bounds_a_censored_hour(self):
        customers = [[None] * 24 for _ in range(7)]
        customers[1][12] = 40.0
        staffed = [[0] * 24 for _ in range(7)]
        staffed[1][12] = 40
        ceiling = [[9999] * 24 for _ in range(7)]
        ceiling[1][12] = 44
        out = _need_curve(
            grid([role(SERVICE, [20, 20, 20], staffed)], customers), ceiling=ceiling
        )
        self.assertEqual(out[SERVICE]["basis"][1][12], "censored")
        self.assertEqual(out[SERVICE]["demand"][1][12], 44.0)

    def test_a_ceiling_below_what_was_measured_never_lowers_the_demand(self):
        """The ceiling is an upper bound on arrivals, not a correction downwards."""
        customers = [[None] * 24 for _ in range(7)]
        customers[1][12] = 40.0
        staffed = [[0] * 24 for _ in range(7)]
        staffed[1][12] = 40
        ceiling = [[1] * 24 for _ in range(7)]
        out = _need_curve(
            grid([role(SERVICE, [20, 20, 20], staffed)], customers), ceiling=ceiling
        )
        self.assertEqual(out[SERVICE]["demand"][1][12], 40.0)

    def test_a_thin_weekday_is_scaled_from_a_measured_one(self):
        customers = [[None] * 24 for _ in range(7)]
        customers[1][12] = 40.0  # Monday, measured
        customers[2][12] = 3.0  # Tuesday, one week only
        staffed = [[0] * 24 for _ in range(7)]
        staffed[1][12] = 200
        weeks = [0, 2, 1, 0, 0, 0, 0]
        day = [1.0, 1.0, 0.5, 1.0, 1.0, 1.0, 1.0]
        out = _need_curve(
            grid([role(SERVICE, [20, 20, 20], staffed)], customers, weeks=weeks),
            day=day,
        )
        self.assertEqual(out[SERVICE]["basis"][2][12], "scaled")
        self.assertEqual(out[SERVICE]["demand"][2][12], 20.0)
        self.assertEqual(out[SERVICE]["need"][2][12], 1)

    def test_without_a_day_curve_a_thin_weekday_gets_nothing(self):
        customers = [[None] * 24 for _ in range(7)]
        customers[1][12] = 40.0
        weeks = [0, 2, 1, 0, 0, 0, 0]
        out = _need_curve(
            grid([role(SERVICE, [20, 20])], customers, weeks=weeks)
        )
        self.assertEqual(out[SERVICE]["basis"][2][12], "none")
        self.assertEqual(out[SERVICE]["demand"][2][12], 0.0)

    def test_nothing_measured_anywhere_is_none_everywhere(self):
        weeks = [1] * 7
        out = _need_curve(grid([role(SERVICE, [20])], weeks=weeks), day=[1.0] * 7)
        self.assertEqual(
            {case for row in out[SERVICE]["basis"] for case in row}, {"none"}
        )
        self.assertEqual(out[SERVICE]["need"][3][9], 0)

    def test_the_scaled_weekday_reads_off_the_best_measured_one(self):
        """Most weeks wins, and the earliest weekday breaks a tie, so it never moves."""
        customers = [[None] * 24 for _ in range(7)]
        customers[1][12] = 10.0  # Monday, 2 weeks
        customers[3][12] = 40.0  # Wednesday, 4 weeks: the source
        weeks = [0, 2, 1, 4, 0, 0, 0]
        day = [1.0, 1.0, 1.0, 2.0, 1.0, 1.0, 1.0]
        out = _need_curve(
            grid([role(SERVICE, [20, 20, 20])], customers, weeks=weeks), day=day
        )
        self.assertEqual(out[SERVICE]["demand"][2][12], 20.0)

    def test_a_multi_role_site_answers_per_role(self):
        """A theatre's roles each pack their own stations against the same demand."""
        customers = [[None] * 24 for _ in range(7)]
        customers[1][12] = 60.0
        staffed = [[0] * 24 for _ in range(7)]
        staffed[1][12] = 500
        roles = [
            role(SERVICE, [50, 50], staffed),  # ticket booths
            role(TRAINER, [20, 20, 20, 20], staffed),  # slower stations
        ]
        out = _need_curve(grid(roles, customers))
        self.assertEqual(out[SERVICE]["need"][1][12], 2)
        self.assertEqual(out[TRAINER]["need"][1][12], 3)

    def test_the_same_grid_twice_gives_the_same_answer(self):
        customers = [[None] * 24 for _ in range(7)]
        customers[1][12] = 37.0
        customers[4][9] = 12.0
        weeks = [0, 2, 1, 3, 2, 0, 1]
        day = [1.0, 1.0, 0.5, 1.2, 1.0, 0.9, 0.8]
        made = [
            json.dumps(
                _need_curve(
                    grid([role(SERVICE, [20, 30])], customers, weeks=weeks, door=40),
                    day=day,
                ),
                sort_keys=True,
            )
            for _ in range(2)
        ]
        self.assertEqual(made[0], made[1])


class FillStationsTest(unittest.TestCase):
    """The smallest set of a role's stations that covers the demand, largest first."""

    def test_zero_demand_needs_nobody(self):
        self.assertEqual(_fill_stations(0, [20, 20]), 0)

    def test_largest_first(self):
        # The 30 goes first, so one station covers 30 and two cover 35.
        self.assertEqual(_fill_stations(30, [20, 30, 5]), 1)
        self.assertEqual(_fill_stations(35, [20, 30, 5]), 2)
        self.assertEqual(_fill_stations(35, [20, 20, 20]), 2)

    def test_never_more_stations_than_are_installed(self):
        self.assertEqual(_fill_stations(500, [20, 20]), 2)

    def test_a_site_with_no_station_of_that_role_asks_for_nobody(self):
        self.assertEqual(_fill_stations(40, []), 0)


class ArrivalCeilingTest(unittest.TestCase):
    """GetCustomersByHour, which the board may bound with and never print."""

    def setUp(self):
        self.curves = {
            "types": {
                SHOP: {
                    "d": [1.0] * 7,
                    "h": [0.0] * 12 + [1.0] + [0.0] * 11,
                    "p": ["ba:itemname_shirt"],
                }
            },
            "items": {"ba:itemname_shirt": 0.5, "ba:itemname_towel": 9.0},
        }
        self.saved = ba_dashboard._demand_curves
        ba_dashboard._demand_curves = self.curves

    def tearDown(self):
        ba_dashboard._demand_curves = self.saved

    def ceiling(self, **kw):
        args = dict(
            type_slug=SHOP,
            sqm=100,
            products=["ba:itemname_shirt", "ba:itemname_towel"],
            promotion=0,
            base_promotion=0.55,
            door=0,
        )
        args.update(kw)
        return _arrival_ceiling(**args)

    def test_only_the_types_own_primary_products_size_it(self):
        # 0.5 x 100 sqm x 0.55, rounded up. The towel's 9.0 is not primary here.
        self.assertEqual(self.ceiling()[1][12], 28)

    def test_promotion_lifts_it(self):
        # base 0.55 + 0.75 x 100/100 = 1.3, times 50.
        self.assertEqual(self.ceiling(promotion=100)[1][12], 65)

    def test_the_door_cap_is_the_games_own_minimum(self):
        self.assertEqual(self.ceiling(door=10)[1][12], 10)

    def test_a_closed_hour_of_the_curve_is_zero(self):
        self.assertEqual(self.ceiling()[1][3], 0)

    def test_an_unknown_business_type_has_no_ceiling(self):
        self.assertIsNone(self.ceiling(type_slug="ba:businesstype_nowhere"))

    def test_a_shop_stocking_nothing_primary_has_no_arrivals(self):
        self.assertEqual(self.ceiling(products=["ba:itemname_towel"])[1][12], 0)


class DemandCurvesFileTest(unittest.TestCase):
    """The committed ba_demand_curves.json is present and the shape the board reads."""

    def setUp(self):
        ba_dashboard._demand_curves = None
        self.addCleanup(setattr, ba_dashboard, "_demand_curves", None)
        self.curves = load_demand_curves()

    def test_it_ships(self):
        self.assertTrue(
            os.path.exists(os.path.join(ROOT, "ba_demand_curves.json")),
            "ba_demand_curves.json is missing; run make_demand_curves.py",
        )
        self.assertTrue(self.curves["types"])
        self.assertTrue(self.curves["items"])

    def test_every_type_carries_seven_days_and_twenty_four_hours(self):
        for slug, curve in self.curves["types"].items():
            self.assertTrue(slug.startswith("ba:businesstype_"), slug)
            self.assertEqual(len(curve["d"]), 7, slug)
            self.assertEqual(len(curve["h"]), 24, slug)
            for value in curve["d"] + curve["h"]:
                self.assertIsInstance(value, (int, float), slug)
                self.assertGreaterEqual(value, 0, slug)
            for name in curve["p"]:
                self.assertTrue(name.startswith("ba:itemname_"), name)

    def test_every_ratio_is_a_positive_number_under_an_item_name(self):
        for name, ratio in self.curves["items"].items():
            self.assertTrue(name.startswith("ba:itemname_"), name)
            self.assertIsInstance(ratio, (int, float), name)
            self.assertGreater(ratio, 0, name)

    def test_the_retail_types_the_board_knows_all_have_a_curve(self):
        missing = [
            slug for slug in ba_dashboard.RETAIL_TYPES if slug not in self.curves["types"]
        ]
        self.assertEqual(missing, [])

    def test_the_copy_the_browser_fetches_matches(self):
        with open(os.path.join(ROOT, "ba_demand_curves.json"), encoding="utf-8") as fh:
            source = json.load(fh)
        with open(
            os.path.join(ROOT, "web", "py", "ba_demand_curves.json"), encoding="utf-8"
        ) as fh:
            shipped = json.load(fh)
        self.assertEqual(source, shipped)


STREET = "ba:street_secondavenue"
NUMBER = 12
KEY = site_key((STREET, NUMBER))
REGISTER = "ba:itemname_cashregister"
BOARD = "ba:itemname_fitnessplanningboard"
BOOTH = "ba:itemname_boothticket"
CLEAN_STATION = "ba:itemname_cleaningstation"
LOCKER = "ba:itemname_securityguardlocker"
STATIONS = {REGISTER: (SERVICE, 20), BOARD: (TRAINER, 20), BOOTH: (SERVICE, 50)}
LABELS = Names(
    {
        SERVICE: "Customer Service",
        TRAINER: "Gym Trainer",
        CLEANING: "Cleaning",
        GUARD: "Security Guard",
        REGISTER: "Cash register",
        BOARD: "Fitness planning board",
        BOOTH: "Ticket booth",
        CLEAN_STATION: "Cleaning station",
        LOCKER: "Security guard locker",
    }
)


def employee(eid, skills, wage=20.0, here=True, demands=()):
    """One hired person; `here` false leaves them on the unassigned bench."""
    return {
        "id": eid,
        "hourlyWage": wage,
        "assignedWeeklyHours": 40,
        "characterData": {
            "name": eid.upper(),
            "skills": {"$items": [{"name": s, "value": 50.0} for s in skills]},
        },
        "assignedAddress": (
            {"streetName": STREET, "streetNumber": NUMBER} if here else None
        ),
        "demands": {"$items": list(demands)},
    }


def registration(items, hourly, shifts=(), opens=(0, 24), open_days=range(7), door=100):
    """A rented retail floor, its stations, its opening hours and a measured week."""
    reports = {"$items": [{"hour": h, "customers": c} for h, c in hourly.items()]}
    schedule = []
    for wd in range(7):
        day = 7 if wd == 0 else wd
        schedule.append(
            {
                "day": day,
                "isOpen": wd in open_days,
                "openingHourSlots": {
                    "$items": (
                        [{"startingHour": opens[0], "endingHour": opens[1]}]
                        if wd in open_days
                        else []
                    )
                },
                "workShifts": {"$items": [s for s in shifts if s["wd"] == wd]},
            }
        )
    return {
        "BusinessName": "HART. Test",
        "businessTypeName": SHOP,
        "StreetName": STREET,
        "StreetNumber": NUMBER,
        "creationDay": 1,
        "customerCapacity": door,
        "orderHistory": {
            "$items": [
                {
                    "dayNumber": day,
                    "totalCustomers": sum(hourly.values()),
                    "hourReports": reports,
                }
                # Two weeks of every weekday, so no day is thin.
                for day in list(range(1, 8)) + list(range(8, 15))
            ]
        },
        "retailPrices": {"$items": []},
        "itemInstances": {"$items": [{"$v": {"id": i, "itemName": s}} for i, s in items]},
        "cachedFulfilledCustomerDemands": {"$items": []},
        "scheduleDays": {"$items": schedule},
    }


def business(status="retail"):
    return {
        "key": KEY,
        "name": "HART. Test",
        "status": status,
        "typeSlug": SHOP,
        "basket": 20.0,
        "promotion": 0,
        "lines": [],
    }


def plan(items, employees, hourly, **kw):
    """Run the whole chain a site's row comes out of, and return that row."""
    reg = registration(items, hourly, **kw)
    save = Save(
        {
            "EmployeeInstances": {"$items": employees},
            "BuildingRegistrations": {"$items": [dict(reg, RentedByPlayer=True)]},
        },
        {},
        "test.hsg",
    )
    sites = [business()]
    _by_addr, staff = _staff(save, LABELS)
    crew = {p["id"]: p["skill"] for p in staff}
    grids = _hourly(save, [reg], sites, STATIONS, set(), crew, LABELS)
    rows = _staffing(save, LABELS, sites, grids, staff, 0.55)
    return rows[0] if rows else None


FLAT = {h: 15 for h in range(24)}  # 15 customers an hour, all day, every day


class CutTest(unittest.TestCase):
    """No shift over twelve hours, and the fewest of them."""

    def test_every_run_length_one_to_twenty_four(self):
        for length in range(1, 25):
            cuts = _cut_run(0, length)
            hours = [end - start for start, end in cuts]
            self.assertEqual(sum(hours), length, length)
            self.assertEqual(len(cuts), math.ceil(length / SHIFT_CAP), length)
            self.assertLessEqual(max(hours), SHIFT_CAP, length)
            # As equal as possible, and the longer piece first.
            self.assertLessEqual(max(hours) - min(hours), 1, length)
            self.assertEqual(hours, sorted(hours, reverse=True), length)
            # Contiguous, covering the run exactly.
            self.assertEqual(cuts[0][0], 0, length)
            self.assertEqual(cuts[-1][1], length, length)

    def test_the_two_shapes_the_scope_names(self):
        self.assertEqual(_cut_run(0, 12), [(0, 12)])
        self.assertEqual(_cut_run(0, 24), [(0, 12), (12, 24)])
        self.assertEqual(_cut_run(0, 13), [(0, 7), (7, 13)])

    def test_an_empty_run_produces_nothing(self):
        self.assertEqual(_cut_run(5, 5), [])
        self.assertEqual(_cut_run(5, 4), [])


class RosterRulesTest(unittest.TestCase):
    """A property test: no produced shift may break any rule, on any fixture."""

    DEMANDS = [
        (),
        ("ba:jobdemand_fulltime",),
        ("ba:jobdemand_parttime",),
        ("ba:jobdemand_fourdaysweek",),
        ("ba:jobdemand_fivedaysweek", "ba:jobdemand_freeweekends"),
        ("ba:jobdemand_nomornings",),
        ("ba:jobdemand_noafternoons",),
        ("ba:jobdemand_noevenings",),
        ("ba:jobdemand_nonights",),
        ("ba:jobdemand_nocleaning",),
        ("ba:jobdemand_fulltime", "ba:jobdemand_nonights", "ba:jobdemand_freeweekends"),
        ("ba:jobdemand_cleanworkplace",),  # nothing to do with when they work
    ]

    def roster(self):
        items = [(1, REGISTER), (2, REGISTER), (8, CLEAN_STATION), (9, LOCKER)]
        people = [
            employee(f"p{i}", [SERVICE, CLEANING, GUARD], wage=20 + i, demands=d)
            for i, d in enumerate(self.DEMANDS)
        ]
        return plan(items, people, FLAT), {p["id"]: p for p in people}

    def test_no_shift_breaks_a_rule(self):
        row, people = self.roster()
        self.assertTrue(row["shifts"])
        by_person = collections.defaultdict(list)
        for shift in row["shifts"]:
            by_person[shift["employee"]].append(shift)
            # The station's skill, and no shift over the cap.
            self.assertLessEqual(shift["to"] - shift["from"], SHIFT_CAP)
            self.assertEqual(shift["hours"], shift["to"] - shift["from"])
        stations = collections.Counter()
        for shift in row["shifts"]:
            for hour in range(shift["from"], shift["to"]):
                stations[(shift["wd"], shift["station"], hour)] += 1
        self.assertEqual(max(stations.values()), 1, "one person per station per hour")

        for eid, shifts in by_person.items():
            rules = [
                JOB_DEMANDS[slug]
                for slug in people[eid]["demands"]["$items"]
                if slug in JOB_DEMANDS
            ]
            hours = sum(s["hours"] for s in shifts)
            days = {s["wd"] for s in shifts}
            for kind, setting, _priority in rules:
                if kind == "hours":
                    self.assertLessEqual(hours, setting[1], eid)
                elif kind == "days":
                    self.assertLessEqual(len(days), setting, eid)
                elif kind == "daysoff":
                    self.assertFalse(days & {6, 0}, eid)
                elif kind == "noshift":
                    for low, high in setting:
                        for shift in shifts:
                            self.assertFalse(
                                low < shift["to"] and shift["from"] < high, (eid, shift)
                            )
                elif kind == "nocleaning":
                    self.assertFalse([s for s in shifts if s["kind"] == "clean"], eid)
            per_day = collections.Counter()
            busy = collections.defaultdict(set)
            for shift in shifts:
                per_day[shift["wd"]] += shift["hours"]
                for hour in range(shift["from"], shift["to"]):
                    self.assertNotIn(hour, busy[shift["wd"]], "one shift per hour")
                    busy[shift["wd"]].add(hour)
            self.assertLessEqual(max(per_day.values()), OVERWORK_HOURS, eid)

    def test_a_blackout_is_tested_by_overlap_not_containment(self):
        """Someone who wants no nights never touches 22-24 or 0-4, even by an hour."""
        row, _people = self.roster()
        nights = [
            s
            for s in row["shifts"]
            if s["employee"] == "p8"
            and (s["from"] < 4 or s["to"] > 22)
        ]
        self.assertEqual(nights, [])

    def test_the_plan_is_byte_identical_twice(self):
        first, _ = self.roster()
        second, _ = self.roster()
        self.assertEqual(
            json.dumps(first["shifts"], sort_keys=True),
            json.dumps(second["shifts"], sort_keys=True),
        )


class HeadcountTest(unittest.TestCase):
    """The arithmetic the player most wants, worked by hand on the fixture."""

    def test_one_register_all_week_against_a_hand_worked_fixture(self):
        # One register, one customer an hour: one station manned 24 x 7 = 168
        # station-hours. ceil(168/50) = 4 people on full-time contracts, and
        # 168 // 30 = 5 is the most who could all still get a legal week.
        row = plan([(1, REGISTER)], [employee("a", [SERVICE])], {h: 1 for h in range(24)})
        counts = row["headcount"][SERVICE]
        self.assertEqual(counts["needed"], 168)
        self.assertEqual((counts["min"], counts["max"]), (4, 5))
        self.assertEqual(counts["have"], 1)
        self.assertEqual(counts["hire"], 3)
        self.assertEqual(counts["spare"], 0)

    def test_spare_is_everyone_the_plan_cannot_give_a_week(self):
        people = [employee(f"p{i}", [SERVICE]) for i in range(9)]
        row = plan([(1, REGISTER)], people, {h: 1 for h in range(24)})
        counts = row["headcount"][SERVICE]
        self.assertEqual((counts["have"], counts["hire"], counts["spare"]), (9, 0, 5))

    def test_security_hiring_is_marked_as_its_own_kind_of_spending(self):
        """A locker nobody staffs asks for real new money, not another shift."""
        row = plan(
            [(1, REGISTER), (9, LOCKER)], [employee("a", [SERVICE])], {h: 1 for h in range(24)}
        )
        guard = row["headcount"][GUARD]
        self.assertEqual(guard["kind"], "security")
        self.assertEqual((guard["have"], guard["hire"]), (0, 4))
        self.assertEqual(guard["hireHours"], 120)
        self.assertEqual(row["headcount"][SERVICE]["kind"], "serve")

    def test_a_site_with_nobody_assigned_gets_hiring_lines_and_no_shifts(self):
        row = plan([(1, REGISTER)], [], {h: 1 for h in range(24)})
        self.assertEqual(row["shifts"], [])
        self.assertEqual(row["headcount"][SERVICE]["have"], 0)
        self.assertGreater(row["headcount"][SERVICE]["hire"], 0)


class CoverTest(unittest.TestCase):
    """Cleaning and security are covered, not derived, and come after the queue."""

    def test_cleaning_and_security_cover_every_open_hour(self):
        items = [(1, REGISTER), (8, CLEAN_STATION), (9, LOCKER)]
        people = [employee(f"p{i}", [SERVICE, CLEANING, GUARD]) for i in range(12)]
        row = plan(items, people, FLAT, opens=(8, 20))
        for kind in ("clean", "security"):
            hours = sum(s["hours"] for s in row["shifts"] if s["kind"] == kind)
            self.assertEqual(hours, 12 * 7, kind)
            for shift in row["shifts"]:
                if shift["kind"] == kind:
                    self.assertGreaterEqual(shift["from"], 8)
                    self.assertLessEqual(shift["to"], 20)

    def test_a_closed_day_is_rostered_by_nobody(self):
        items = [(1, REGISTER), (8, CLEAN_STATION)]
        people = [employee(f"p{i}", [SERVICE, CLEANING]) for i in range(8)]
        row = plan(items, people, FLAT, open_days=(1, 2, 3, 4, 5))
        self.assertEqual([s for s in row["shifts"] if s["wd"] in (6, 0)], [])
        self.assertEqual(row["open"][6], None)
        self.assertEqual(row["open"][1], [0, 24])

    def test_nocleaning_keeps_a_person_off_the_cleaning_station(self):
        items = [(8, CLEAN_STATION)]
        people = [
            employee("no", [CLEANING], wage=1.0, demands=("ba:jobdemand_nocleaning",)),
            employee("yes", [CLEANING], wage=99.0),
        ]
        row = plan(items, people, FLAT)
        self.assertTrue(row["shifts"])
        self.assertEqual({s["employee"] for s in row["shifts"]}, {"yes"})


class SlackTest(unittest.TestCase):
    """Troughs are bridged greedily, and never past the budget."""

    def test_slack_never_passes_its_budget(self):
        # A dip to nothing in the middle of the day, and a longer dead evening.
        hourly = {h: 15 for h in range(24)}
        hourly[13] = 0
        for h in range(18, 23):
            hourly[h] = 0
        people = [employee(f"p{i}", [SERVICE]) for i in range(8)]
        row = plan([(1, REGISTER)], people, hourly)
        self.assertLessEqual(row["slack"]["hours"], row["slack"]["budget"])
        self.assertGreater(row["slack"]["hours"], 0)
        # The cheap one-hour lunch dip is bought; the five-hour evening is not.
        covered = {
            hour
            for s in row["shifts"]
            if s["kind"] == "serve" and s["wd"] == 1
            for hour in range(s["from"], s["to"])
        }
        self.assertIn(13, covered)
        self.assertNotIn(20, covered)


class PayloadTest(unittest.TestCase):
    """The row's shape, and the parts of it that are not numbers."""

    def row(self):
        items = [(1, REGISTER), (2, REGISTER), (8, CLEAN_STATION)]
        people = [employee(f"p{i}", [SERVICE, CLEANING]) for i in range(8)]
        return plan(items, people, FLAT)

    def test_the_contract_keys_are_all_there(self):
        row = self.row()
        self.assertEqual(
            set(row),
            {
                "key", "name", "typeSlug", "open", "roles", "need", "basis",
                "ceiling", "shifts", "headcount", "shortHours", "placed",
                "bench", "slack", "cost", "current",
            },
        )

    def test_a_shift_names_a_station_the_roles_list(self):
        row = self.row()
        known = {s["id"] for role in row["roles"] for s in role["stations"]}
        for shift in row["shifts"]:
            if shift["kind"] == "serve":
                self.assertIn(shift["station"], known)

    def test_the_current_roster_is_listed_for_the_now_and_plan_toggle(self):
        shifts = [
            {"wd": 1, "employeeId": "p0", "itemInstanceId": 1,
             "startingHour": 8, "endingHour": 10, "type": 1},
            {"wd": 1, "employeeId": "p1", "itemInstanceId": 8,
             "startingHour": 0, "endingHour": 24, "type": 0},
        ]
        items = [(1, REGISTER), (8, CLEAN_STATION)]
        people = [employee(f"p{i}", [SERVICE, CLEANING]) for i in range(4)]
        row = plan(items, people, FLAT, shifts=shifts)
        current = row["current"]
        self.assertEqual((current["shifts"], current["fragments"]), (2, 1))
        self.assertEqual(current["cleaning"], 1)
        # Sorted by weekday then by the hour it starts, so the all-day
        # cleaning duty comes before the morning register shift.
        self.assertEqual(
            current["list"],
            [
                {"wd": 1, "station": 8, "from": 0, "to": 24, "employee": "p1",
                 "name": "P1", "kind": "clean"},
                {"wd": 1, "station": 1, "from": 8, "to": 10, "employee": "p0",
                 "name": "P0", "kind": "serve"},
            ],
        )

    def test_the_bench_needs_a_myemployees_step_first(self):
        row = plan(
            [(1, REGISTER)],
            [employee("bench", [SERVICE], here=False)],
            {h: 1 for h in range(24)},
        )
        self.assertTrue(row["shifts"])
        self.assertTrue(all(s["fromBench"] for s in row["shifts"]))
        self.assertEqual(
            row["bench"], [{"employee": "bench", "name": "BENCH", "skill": SERVICE}]
        )

    def test_a_site_with_no_measured_weekday_gets_no_recommendation(self):
        """basis none end to end: the site is too new to say anything about."""
        reg = registration([(1, REGISTER)], FLAT)
        # One week of reports only, so every weekday is thin.
        reg["orderHistory"]["$items"] = reg["orderHistory"]["$items"][:7]
        save = Save(
            {
                "EmployeeInstances": {"$items": [employee("a", [SERVICE])]},
                "BuildingRegistrations": {"$items": [dict(reg, RentedByPlayer=True)]},
            },
            {},
            "test.hsg",
        )
        sites = [business()]
        _by_addr, staff = _staff(save, LABELS)
        grids = _hourly(
            save, [reg], sites, STATIONS, set(),
            {p["id"]: p["skill"] for p in staff}, LABELS,
        )
        [row] = _staffing(save, LABELS, sites, grids, staff, 0.55)
        self.assertEqual({c for r in row["basis"][SERVICE] for c in r}, {"none"})
        self.assertEqual([s for s in row["shifts"] if s["kind"] == "serve"], [])


class MultiRoleTest(unittest.TestCase):
    """A theatre passes every customer through every role, so each is sized alone."""

    def test_each_role_packs_its_own_stations(self):
        items = [(1, BOOTH), (2, REGISTER), (3, REGISTER), (4, BOARD), (5, BOARD)]
        people = [employee(f"p{i}", [SERVICE, TRAINER]) for i in range(12)]
        row = plan(items, people, {h: 30 for h in range(24)})
        # 30 an hour: one 50-an-hour booth, but two 20-an-hour registers, and
        # the site's throughput is the slowest role either way.
        self.assertEqual(row["need"][SERVICE][1][12], 1)
        self.assertEqual(row["need"][TRAINER][1][12], 2)


class SurvivalTest(unittest.TestCase):
    """Saves are messy: none of this may raise."""

    def test_a_save_with_no_retail_site_plans_nothing(self):
        save = Save({"EmployeeInstances": {"$items": []},
                     "BuildingRegistrations": {"$items": []}}, {}, "t.hsg")
        self.assertEqual(_staffing(save, LABELS, [], [], [], 0.55), [])

    def test_an_office_and_a_factory_get_no_row(self):
        reg = registration([(1, REGISTER)], FLAT)
        save = Save(
            {
                "EmployeeInstances": {"$items": []},
                "BuildingRegistrations": {"$items": [dict(reg, RentedByPlayer=True)]},
            },
            {}, "t.hsg",
        )
        for status in ("office", "support", "overhead", "vacant"):
            sites = [dict(business(), status=status)]
            grids = _hourly(save, [reg], sites, STATIONS, set(), {}, LABELS)
            self.assertEqual(_staffing(save, LABELS, sites, grids, [], 0.55), [])

    def test_people_with_nothing_on_them(self):
        broken = {
            "id": None, "hourlyWage": None, "characterData": None,
            "assignedAddress": {"streetName": STREET, "streetNumber": NUMBER},
            "demands": None,
        }
        row = plan([(1, REGISTER)], [broken], FLAT)
        self.assertEqual(row["shifts"], [])  # no skills, so nobody may be posted

    def test_a_station_nobody_can_man(self):
        row = plan([(1, BOARD)], [employee("a", [SERVICE])], FLAT)
        self.assertEqual(row["shifts"], [])
        self.assertGreater(row["headcount"][TRAINER]["hire"], 0)

    def test_a_site_open_no_hours_at_all(self):
        items = [(1, REGISTER), (8, CLEAN_STATION)]
        row = plan(items, [employee("a", [SERVICE, CLEANING])], FLAT, open_days=())
        self.assertEqual(row["shifts"], [])
        self.assertEqual(row["open"], [None] * 7)
        self.assertEqual(row["slack"]["budget"], 0)

    def test_a_site_with_no_station_at_all(self):
        row = plan([], [employee("a", [SERVICE])], FLAT)
        self.assertEqual((row["shifts"], row["roles"], row["headcount"]), ([], [], {}))

    def test_the_whole_row_survives_json(self):
        json.dumps(self.row_for_json())

    def row_for_json(self):
        people = [employee(f"p{i}", [SERVICE, CLEANING, GUARD]) for i in range(6)]
        return plan([(1, REGISTER), (8, CLEAN_STATION), (9, LOCKER)], people, FLAT)


class HashSeedTest(unittest.TestCase):
    """Set iteration order follows the hash seed, so two seeds must agree."""

    SCRIPT = """
import json, sys
sys.path.insert(0, %r)
sys.path.insert(0, %r)
import test_staffing as t
row = t.plan(
    [(1, t.REGISTER), (2, t.REGISTER), (8, t.CLEAN_STATION), (9, t.LOCKER)],
    [t.employee("p%%d" %% i, [t.SERVICE, t.CLEANING, t.GUARD], wage=20 + i)
     for i in range(8)],
    t.FLAT,
)
print(json.dumps(row["shifts"], sort_keys=True))
"""

    def test_two_hash_seeds_give_the_same_shifts(self):
        script = self.SCRIPT % (ROOT, os.path.join(ROOT, "tests"))
        made = []
        for seed in ("0", "12345"):
            env = dict(os.environ, PYTHONHASHSEED=seed)
            made.append(
                subprocess.run(
                    [sys.executable, "-c", script],
                    capture_output=True, text=True, check=True, env=env,
                ).stdout
            )
        self.assertEqual(made[0], made[1])
        self.assertTrue(json.loads(made[0]))


if __name__ == "__main__":
    unittest.main()
