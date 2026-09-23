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
import unittest.mock

import ba_dashboard
from ba_dashboard import (
    FULL_TIME,
    JOB_DEMANDS,
    SHIFT_CAP,
    OVERWORK_HOURS,
    WEEKEND_WEEKDAYS,
    COVER_STATIONS,
    _arrival_ceiling,
    _bridge_troughs,
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

    def test_a_shop_stocking_nothing_primary_has_no_ceiling_at_all(self):
        """Not a grid of zeros: that would read off the page as "nobody can come"."""
        self.assertIsNone(self.ceiling(products=["ba:itemname_towel"]))

    def test_an_unknown_building_size_has_no_ceiling_either(self):
        self.assertIsNone(self.ceiling(sqm=0))


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


def employee(eid, skills, wage=20.0, here=True, demands=(), number=NUMBER):
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
            {"streetName": STREET, "streetNumber": number} if here else None
        ),
        "demands": {"$items": list(demands)},
    }


def registration(
    items,
    hourly,
    shifts=(),
    opens=((0, 24),),
    open_days=range(7),
    door=100,
    number=NUMBER,
    weeks=2,
    products=(),
    hours=None,
):
    """A rented retail floor, its stations, its opening hours and a measured week.

    `opens` is a list of [start, end) slots, the way the game's openingHourSlots
    is a list, and `weeks` is how many weeks of hour reports are behind it: 2 is
    measured, 1 is thin, 0 is a site that has never reported at all.
    `hours` limits the reports to those hours, the way the game files one only
    for an hour the shop was open; by default every hour in `hourly` has one.
    """
    reports = {"$items": [{"hour": h, "customers": c} for h, c in hourly.items()
                          if hours is None or h in hours]}
    schedule = []
    for wd in range(7):
        day = 7 if wd == 0 else wd
        schedule.append(
            {
                "day": day,
                "isOpen": wd in open_days,
                "openingHourSlots": {
                    "$items": (
                        [{"startingHour": a, "endingHour": b} for a, b in opens]
                        if wd in open_days
                        else []
                    )
                },
                "workShifts": {"$items": [s for s in shifts if s["wd"] == wd]},
            }
        )
    return {
        "BusinessName": f"HART. Test {number}",
        "businessTypeName": SHOP,
        "StreetName": STREET,
        "StreetNumber": number,
        "creationDay": 1,
        "customerCapacity": door,
        "orderHistory": {
            "$items": [
                {
                    "dayNumber": day,
                    "totalCustomers": sum(hourly.values()),
                    "hourReports": reports,
                }
                for day in range(1, 7 * weeks + 1)
            ]
        },
        "retailPrices": {"$items": []},
        "itemInstances": {"$items": [{"$v": {"id": i, "itemName": s}} for i, s in items]},
        "cachedFulfilledCustomerDemands": {"$items": []},
        "cachedAvailableProducts": {"$items": list(products)},
        "scheduleDays": {"$items": schedule},
    }


def business(status="retail", number=NUMBER, days_open=14):
    return {
        "key": site_key((STREET, number)),
        "name": f"HART. Test {number}",
        "status": status,
        "typeSlug": SHOP,
        "basket": 20.0,
        "promotion": 0,
        "daysOpen": days_open,
        "lines": [],
    }


def plan_sites(specs, employees, status="retail"):
    """Several rented sites and one staff list, planned together.

    A spec may carry `days_open`, which belongs to the business rather than to
    the registration: it is how long the doors have been open, and the page
    calls a shop new by it.
    """
    specs = [dict(spec) for spec in specs]
    opened = [spec.pop("days_open", 14) for spec in specs]
    regs = [registration(**spec) for spec in specs]
    save = Save(
        {
            "EmployeeInstances": {"$items": employees},
            "BuildingRegistrations": {
                "$items": [dict(reg, RentedByPlayer=True) for reg in regs]
            },
        },
        {},
        "test.hsg",
    )
    sites = [
        business(status, reg["StreetNumber"], days)
        for reg, days in zip(regs, opened)
    ]
    _by_addr, staff = _staff(save, LABELS)
    crew = {p["id"]: p["skill"] for p in staff}
    grids = _hourly(save, regs, sites, STATIONS, set(), crew, LABELS)
    return _staffing(save, LABELS, sites, grids, staff, 0.55)


def plan(items, employees, hourly, **kw):
    """Run the whole chain one site's row comes out of, and return that row."""
    rows = plan_sites([dict(kw, items=items, hourly=hourly)], employees)
    return rows[0] if rows else None


FLAT = {h: 15 for h in range(24)}  # 15 customers an hour, all day, every day

# Every demand kind that bears on a roster, and one person per demand that holds
# one. Both are taken from JOB_DEMANDS rather than copied out of it, so a kind a
# future game build adds fails the property test until somebody decides what the
# roster builder should do with it.
SCHEDULING = ("hours", "days", "daysoff", "noshift", "nocleaning")
# The rest: what a person is given rather than when they work. The two lists
# have to partition JOB_DEMANDS exactly, so a kind a future game build adds
# belongs to neither and trips the guard below.
NON_SCHEDULING = ("desk", "building", "insurance", "happiness", "clean")
SCHEDULING_DEMANDS = [
    (slug,) for slug in sorted(JOB_DEMANDS) if JOB_DEMANDS[slug][0] in SCHEDULING
]


def classified(table):
    """Whether every kind in a demand table is one the roster builder knows."""
    return {rule[0] for rule in table.values()} == set(SCHEDULING) | set(NON_SCHEDULING)


# A roster row is d/s/f/t/p, plus k on anything but an ordinary serving shift,
# with s and p indexing the row's own stations and people tables.
def kind(row):
    return row.get("k", "serve")


def hours(row):
    return row["t"] - row["f"]


def who(site, row):
    return None if row["p"] is None else site["people"][row["p"]]["id"]


def staffed(site):
    """The shifts somebody actually works.

    `shifts` also carries the lines nobody here may legally work, with `p:
    null`, so the page can draw the hiring line where the hours are rather than
    only counting it. They are nobody's work: they earn no hours, no days and
    no wage, so every rule about what a person may be given is asked of these.
    """
    return [row for row in site["shifts"] if row["p"] is not None]


def open_lines(site):
    """The other half: the lines the plan wants and has nobody for."""
    return [row for row in site["shifts"] if row["p"] is None]


FULLTIME = "ba:jobdemand_fulltime"
PARTTIME = "ba:jobdemand_parttime"
FOUR_DAYS = "ba:jobdemand_fourdaysweek"
FIVE_DAYS = "ba:jobdemand_fivedaysweek"


def demands_of(person):
    """One employee's contract, read the way the planner reads it."""
    held = [d for d in person["demands"]["$items"] if d in JOB_DEMANDS]
    rules = [JOB_DEMANDS[slug] for slug in held]
    return {
        "skills": {s["name"] for s in person["characterData"]["skills"]["$items"]},
        "band": next((r[1] for r in rules if r[0] == "hours"), None),
        "days": next((r[1] for r in rules if r[0] == "days"), None),
        "weekendsOff": any(r[0] == "daysoff" for r in rules),
        "blackouts": [w for r in rules if r[0] == "noshift" for w in r[1]],
        "nocleaning": any(r[0] == "nocleaning" for r in rules),
    }


def opens_of(spec):
    """The opening slots of one RosterInvariantTest shop."""
    return spec[2]


def named(site, row):
    return None if row["p"] is None else site["people"][row["p"]]["name"]


def where(site, row):
    return site["stations"][row["s"]]["id"]


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

    SCHEDULING = SCHEDULING
    DEMANDS = SCHEDULING_DEMANDS + [
        (),
        ("ba:jobdemand_fulltime", "ba:jobdemand_nonights", "ba:jobdemand_freeweekends"),
        ("ba:jobdemand_cleanworkplace",),  # nothing to do with when they work
    ]

    def test_the_fixture_covers_every_kind_that_bears_on_a_roster(self):
        covered = {JOB_DEMANDS[slug][0] for group in self.DEMANDS for slug in group}
        self.assertEqual(covered & set(SCHEDULING), set(SCHEDULING))

    def test_every_kind_of_demand_is_classified(self):
        self.assertTrue(classified(JOB_DEMANDS))

    def test_a_kind_a_future_build_adds_trips_the_guard(self):
        """The point of the two lists: an unclassified kind must not pass quietly."""
        future = dict(JOB_DEMANDS)
        future["ba:jobdemand_neveralone"] = ("nosolo", None, 1)
        self.assertFalse(classified(future))

    def roster(self):
        items = [(1, REGISTER), (2, REGISTER), (8, CLEAN_STATION), (9, LOCKER)]
        people = [
            employee(f"p{i:02d}", [SERVICE, CLEANING, GUARD], wage=20 + i, demands=d)
            for i, d in enumerate(self.DEMANDS)
        ]
        # One person who can only ever work a register: deleting the skill check
        # in _can_work() puts them on the cleaning station and fails the test.
        people.append(
            employee("only", [SERVICE], wage=1.0, demands=("ba:jobdemand_fulltime",))
        )
        return plan(items, people, FLAT), {p["id"]: p for p in people}

    def test_a_single_skilled_person_is_only_posted_where_they_can_work(self):
        row, _people = self.roster()
        theirs = {kind(s) for s in row["shifts"] if who(row, s) == "only"}
        self.assertTrue(theirs)
        self.assertEqual(theirs, {"serve"})

    def test_no_shift_breaks_a_rule(self):
        row, people = self.roster()
        self.assertTrue(staffed(row))
        by_person = collections.defaultdict(list)
        # A line nobody works breaks no rule about a person, but it still
        # belongs to a station this site holds and to one hour of one day.
        for shift in row["shifts"]:
            self.assertLessEqual(hours(shift), SHIFT_CAP)
            self.assertIsNotNone(where(row, shift))
        for shift in staffed(row):
            by_person[who(row, shift)].append(shift)
            self.assertIsNotNone(who(row, shift))
        stations = collections.Counter()
        for shift in row["shifts"]:
            for hour in range(shift["f"], shift["t"]):
                stations[(shift["d"], shift["s"], hour)] += 1
        self.assertEqual(max(stations.values()), 1, "one person per station per hour")

        for eid, shifts in by_person.items():
            rules = [
                JOB_DEMANDS[slug]
                for slug in people[eid]["demands"]["$items"]
                if slug in JOB_DEMANDS
            ]
            worked = sum(hours(s) for s in shifts)
            days = {s["d"] for s in shifts}
            for rule, setting, _priority in rules:
                if rule == "hours":
                    self.assertLessEqual(worked, setting[1], eid)
                elif rule == "days":
                    self.assertLessEqual(len(days), setting, eid)
                elif rule == "daysoff":
                    self.assertFalse(days & {6, 0}, eid)
                elif rule == "noshift":
                    for low, high in setting:
                        for shift in shifts:
                            self.assertFalse(
                                low < shift["t"] and shift["f"] < high, (eid, shift)
                            )
                elif rule == "nocleaning":
                    self.assertFalse([s for s in shifts if kind(s) == "clean"], eid)
            per_day = collections.Counter()
            busy = collections.defaultdict(set)
            for shift in shifts:
                per_day[shift["d"]] += hours(shift)
                for hour in range(shift["f"], shift["t"]):
                    self.assertNotIn(hour, busy[shift["d"]], "one shift per hour")
                    busy[shift["d"]].add(hour)
            self.assertLessEqual(max(per_day.values()), OVERWORK_HOURS, eid)

    def person_with(self, slug):
        return f"p{self.DEMANDS.index((slug,)):02d}"

    def test_a_blackout_is_tested_by_overlap_not_containment(self):
        """Someone who wants no nights never touches 22-24 or 0-4, even by an hour."""
        row, _people = self.roster()
        nights = [
            s
            for s in row["shifts"]
            if who(row, s) == self.person_with("ba:jobdemand_nonights")
            and (s["f"] < 4 or s["t"] > 22)
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

    def test_spare_is_counted_off_the_plan_not_off_the_arithmetic(self):
        """`have - min` is not the same number, and this is a shop that shows it.

        Three full-timers who work no evenings, one register around the clock.
        168 station-hours want four people, so `min` is 4 and `have - min` is
        nothing at all -- while the plan, which cannot put anybody on the hours
        their contracts shut out, uses two of the three and leaves the third with
        no week. One spare, and the page has to say so.
        """
        row = plan([(1, REGISTER)], [
            employee(f"p{i}", [SERVICE],
                     demands=("ba:jobdemand_fulltime", "ba:jobdemand_noevenings"))
            for i in range(3)
        ], {h: 1 for h in range(24)})
        counts = row["headcount"][SERVICE]
        self.assertEqual((counts["have"], counts["min"]), (3, 4))
        self.assertEqual(counts["spare"], 1)
        self.assertEqual(len({s["p"] for s in staffed(row)}), 2)

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
        self.assertEqual(staffed(row), [])
        self.assertEqual(row["headcount"][SERVICE]["have"], 0)
        self.assertGreater(row["headcount"][SERVICE]["hire"], 0)
        # The week the player would be hiring for is on the page, not just
        # counted: every line of it, with nobody on it.
        self.assertTrue(open_lines(row))
        self.assertEqual(len(open_lines(row)), len(row["shifts"]))


class CoverTest(unittest.TestCase):
    """Cleaning and security are covered, not derived, and come after the queue."""

    def test_cleaning_and_security_cover_every_open_hour(self):
        items = [(1, REGISTER), (8, CLEAN_STATION), (9, LOCKER)]
        # Cleaners of their own, because a customer service employee is never
        # put on a cleaning station: a crew that all served would leave every
        # cleaning line with nobody on it, and `staffed()` below would be empty
        # while the hours still added up.
        people = [employee(f"p{i}", [SERVICE, GUARD]) for i in range(8)]
        people += [employee(f"c{i}", [CLEANING]) for i in range(6)]
        row = plan(items, people, FLAT, opens=((8, 20),))
        for duty in ("clean", "security"):
            covered = [s for s in staffed(row) if kind(s) == duty]
            self.assertEqual(sum(hours(s) for s in covered), 12 * 7, duty)
            for shift in covered:
                self.assertGreaterEqual(shift["f"], 8)
                self.assertLessEqual(shift["t"], 20)

    def test_a_closed_day_is_rostered_by_nobody(self):
        items = [(1, REGISTER), (8, CLEAN_STATION)]
        people = [employee(f"p{i}", [SERVICE, CLEANING]) for i in range(8)]
        row = plan(items, people, FLAT, open_days=(1, 2, 3, 4, 5))
        self.assertEqual([s for s in row["shifts"] if s["d"] in (6, 0)], [])
        self.assertEqual(row["open"][6], [])
        self.assertEqual(row["open"][1], [[0, 24]])

    def test_a_customer_service_employee_is_never_put_on_a_cleaning_station(self):
        """The game allows it; the plan does not offer it.

        A register standing empty while the person who could be on it mops costs
        more than a cleaner's wage, so cleaning a shop's own crew could do is a
        hiring line instead: hire a cleaner.
        """
        people = [employee(f"p{i}", [SERVICE, CLEANING]) for i in range(6)]
        row = plan([(1, REGISTER), (8, CLEAN_STATION)], people, FLAT)
        self.assertTrue(staffed(row), "the register is still covered")
        for shift in staffed(row):
            self.assertNotEqual(kind(shift), "clean", named(row, shift))
        # Every cleaning hour is a line with nobody on it, and the role asks for
        # people the site does not have -- not for the servers it does.
        self.assertTrue(open_lines(row))
        for shift in open_lines(row):
            self.assertEqual(kind(shift), "clean")
        counts = row["headcount"][CLEANING]
        self.assertEqual((counts["have"], counts["spare"]), (0, 0))
        self.assertGreater(counts["hire"], 0)

    def test_a_cleaner_who_cannot_serve_still_cleans(self):
        """The rule is about who is spent on what, not about the station."""
        row = plan(
            [(1, REGISTER), (8, CLEAN_STATION)],
            [employee(f"p{i}", [SERVICE]) for i in range(4)]
            + [employee(f"c{i}", [CLEANING]) for i in range(4)],
            FLAT,
        )
        cleaned = {named(row, s) for s in staffed(row) if kind(s) == "clean"}
        self.assertTrue(cleaned)
        self.assertTrue(all(who.startswith("C") for who in cleaned), cleaned)

    def test_nocleaning_keeps_a_person_off_the_cleaning_station(self):
        items = [(8, CLEAN_STATION)]
        people = [
            employee("no", [CLEANING], wage=1.0, demands=("ba:jobdemand_nocleaning",)),
            employee("yes", [CLEANING], wage=99.0),
        ]
        row = plan(items, people, FLAT)
        self.assertTrue(staffed(row))
        self.assertEqual({who(row, s) for s in staffed(row)}, {"yes"})


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
            if kind(s) == "serve" and s["d"] == 1
            for hour in range(s["f"], s["t"])
        }
        self.assertIn(13, covered)
        self.assertNotIn(20, covered)


class PayloadTest(unittest.TestCase):
    """The row's shape, and the parts of it that are not numbers."""

    def row(self):
        items = [(1, REGISTER), (2, REGISTER), (8, CLEAN_STATION)]
        # Cleaners of their own: a customer service employee is never put on a
        # cleaning station, so a crew that only holds Customer Service leaves
        # every cleaning line with nobody on it.
        people = [employee(f"p{i}", [SERVICE]) for i in range(8)]
        people += [employee(f"c{i}", [CLEANING]) for i in range(4)]
        return plan(items, people, FLAT)

    def test_the_contract_keys_are_all_there(self):
        row = self.row()
        self.assertEqual(
            set(row),
            {
                "key", "name", "typeSlug", "open", "stations", "people",
                "roles", "need", "basis", "ceiling", "shifts", "headcount",
                "shortHours", "shortDays", "placed", "bench", "slack", "cost",
                "current", "measure", "addPeople", "fullCover", "demandDataComplete",
            },
        )
        # The full-cover plan is the same shape as the demand plan, less the need
        # grids (every station every hour, read off `roles` on the page), plus
        # the opening hours it assumes and whether the game already runs it.
        self.assertEqual(
            set(row["fullCover"]),
            {
                "shifts", "headcount", "shortHours", "shortDays",
                "placed", "bench", "slack", "cost", "addPeople",
                "open", "openAllHours", "openNow", "inGame", "daysMeasured",
            },
        )

    def test_a_serving_shift_indexes_a_station_its_role_lists(self):
        row = self.row()
        known = {index for role in row["roles"] for index in role["stations"]}
        for shift in row["shifts"]:
            if kind(shift) == "serve":
                self.assertIn(shift["s"], known)
        # The cleaning station is a station of the site but of no serving role.
        self.assertTrue([s for s in row["shifts"] if kind(s) == "clean"])
        self.assertEqual({row["stations"][i]["skill"] for i in known}, {SERVICE})

    def test_the_tables_are_what_the_indices_point_at(self):
        row = self.row()
        for shift in row["shifts"]:
            self.assertIsNotNone(where(row, shift))
            self.assertIsNotNone(named(row, shift))
        ids = [p["id"] for p in row["people"]]
        self.assertEqual(len(ids), len(set(ids)), "nobody is listed twice")
        posts = [s["id"] for s in row["stations"]]
        self.assertEqual(len(posts), len(set(posts)), "no station is listed twice")

    def test_the_cover_scraps_are_counted_beside_the_rest(self):
        """`coverFragments`: the two-hour pieces on the side the plan replaces."""
        shifts = [
            # Two cleaning scraps and one long serving shift.
            {"wd": 1, "employeeId": "p1", "itemInstanceId": 8,
             "startingHour": 0, "endingHour": 2, "type": 0},
            {"wd": 2, "employeeId": "p1", "itemInstanceId": 8,
             "startingHour": 0, "endingHour": 2, "type": 0},
            {"wd": 1, "employeeId": "p0", "itemInstanceId": 1,
             "startingHour": 8, "endingHour": 20, "type": 1},
        ]
        row = plan(
            [(1, REGISTER), (8, CLEAN_STATION)],
            [employee(f"p{i}", [SERVICE, CLEANING]) for i in range(4)],
            FLAT,
            shifts=shifts,
        )
        self.assertEqual(row["current"]["fragments"], 2)
        self.assertEqual(row["current"]["coverFragments"], 2)

    def test_a_serving_scrap_is_not_a_cover_scrap(self):
        shifts = [
            {"wd": 1, "employeeId": "p0", "itemInstanceId": 1,
             "startingHour": 8, "endingHour": 10, "type": 1},
        ]
        row = plan(
            [(1, REGISTER), (8, CLEAN_STATION)],
            [employee(f"p{i}", [SERVICE, CLEANING]) for i in range(4)],
            FLAT,
            shifts=shifts,
        )
        self.assertEqual((row["current"]["fragments"], row["current"]["coverFragments"]), (1, 0))

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
        # cleaning duty comes before the morning register shift. A serving
        # shift carries no k at all, which is what "serve" looks like.
        cleaning, serving = current["list"]
        self.assertEqual(
            cleaning, {"d": 1, "s": 1, "f": 0, "t": 24, "p": 1, "k": "clean"}
        )
        self.assertEqual(serving, {"d": 1, "s": 0, "f": 8, "t": 10, "p": 0})
        self.assertEqual(kind(serving), "serve")
        self.assertEqual((where(row, serving), named(row, serving)), (1, "P0"))
        self.assertEqual((where(row, cleaning), named(row, cleaning)), (8, "P1"))

    def test_the_cover_wage_is_the_part_of_the_bill_the_plan_replaces(self):
        """A plan that only covers cleaning and security is only cheaper than that.

        On a shop with no measured hour the serving shifts in the game stay
        where they are, so pricing the plan against the whole wage bill would
        promise a saving made of shifts nobody is replacing.
        """
        shifts = [
            {"wd": 1, "employeeId": "p0", "itemInstanceId": 1,
             "startingHour": 8, "endingHour": 10, "type": 1},
            {"wd": 1, "employeeId": "p1", "itemInstanceId": 8,
             "startingHour": 0, "endingHour": 24, "type": 0},
        ]
        items = [(1, REGISTER), (8, CLEAN_STATION)]
        people = [employee(f"p{i}", [SERVICE, CLEANING]) for i in range(4)]
        row = plan(items, people, FLAT, shifts=shifts)
        # 2 hours on the register and 24 on the cleaning station, at 20 an hour.
        self.assertEqual(row["cost"]["current"], 520.0)
        self.assertEqual(row["cost"]["currentCover"], 480.0)

    def test_a_short_week_says_whether_the_plan_could_have_used_them(self):
        """`planned` on a shop that can only be half planned.

        With no measured hour there are serving staff the plan could never have
        given a shift to, and cover staff it really did plan around. Only the
        second is somebody the player can act on, and the page cannot tell them
        apart from the roster alone.
        """
        row = plan(
            [(1, REGISTER), (8, CLEAN_STATION)],
            [
                employee("p0", [SERVICE], demands=("ba:jobdemand_fulltime",)),
                employee("c0", [CLEANING], demands=("ba:jobdemand_fulltime",)),
            ],
            FLAT,
            weeks=0,
            opens=((8, 12),),
        )
        by_name = {row["people"][r["p"]]["name"]: r for r in row["shortHours"]}
        self.assertEqual(set(by_name), {"P0", "C0"})
        # The cleaner works the 28 hours there are and is short of thirty: a
        # week in a role this plan did work out.
        self.assertTrue(by_name["C0"]["planned"])
        self.assertEqual(by_name["C0"]["hours"], 28)
        # The cashier holds nothing the plan covers, so their empty week says
        # nothing about them at all.
        self.assertFalse(by_name["P0"]["planned"])
        self.assertEqual(by_name["P0"]["hours"], 0)

    def test_the_measure_block_says_how_far_off_a_week_of_its_own_is(self):
        row = self.row()
        # Two weeks of reports, and the mark is the same HOUR_WEEKS_THIN the
        # need curve reads a weekday by.
        self.assertEqual(row["measure"], {"days": 14, "need": 2, "open": 14})

    def test_a_shop_with_no_reports_counts_none_rather_than_dropping_the_block(self):
        row = plan(
            [(1, REGISTER), (8, CLEAN_STATION)],
            [employee("c0", [CLEANING])],
            FLAT,
            weeks=0,
        )
        self.assertEqual(row["measure"]["days"], 0)
        # And the row is still a plan: its cleaning cover does not wait on a
        # measurement, which is the whole reason the page has to say why the
        # serving rows are empty.
        self.assertTrue(row["shifts"])

    def test_a_thin_week_is_counted_even_though_it_reads_nothing(self):
        row = plan([(1, REGISTER)], [employee("p0", [SERVICE])], FLAT, weeks=1)
        # Seven reports, one of each weekday, and not one of them enough on its
        # own: the shop has traded and still cannot be read.
        self.assertEqual(row["measure"]["days"], 7)
        self.assertTrue(all(b == "none" for days in row["basis"].values()
                            for day in days for b in day))

    def test_the_bench_needs_a_myemployees_step_first(self):
        row = plan(
            [(1, REGISTER)],
            [employee("bench", [SERVICE], here=False)],
            {h: 1 for h in range(24)},
        )
        self.assertTrue(row["shifts"])
        self.assertEqual(row["people"], [{"id": "bench", "name": "BENCH"}])
        self.assertEqual(row["bench"], [{"p": 0, "skill": SERVICE, "skills": [SERVICE]}])
        # One person off the bench, so every shift they can take is theirs and
        # the hours they cannot reach are hiring lines.
        self.assertTrue(all(s["p"] == 0 for s in staffed(row)))

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
        self.assertEqual([s for s in row["shifts"] if kind(s) == "serve"], [])


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
        # No skills, so nobody may be posted: every line is a hiring line.
        self.assertEqual(staffed(row), [])
        self.assertTrue(open_lines(row))

    def test_a_station_nobody_can_man(self):
        row = plan([(1, BOARD)], [employee("a", [SERVICE])], FLAT)
        self.assertEqual(staffed(row), [])
        self.assertGreater(row["headcount"][TRAINER]["hire"], 0)
        # The board the gym owns and nobody may work is drawn as the hours it
        # wants, so the hiring count has somewhere to point.
        self.assertTrue(open_lines(row))
        self.assertEqual({r["s"] for r in open_lines(row)}, {0})

    def test_a_site_open_no_hours_at_all(self):
        items = [(1, REGISTER), (8, CLEAN_STATION)]
        row = plan(items, [employee("a", [SERVICE, CLEANING])], FLAT, open_days=())
        self.assertEqual(row["shifts"], [])
        self.assertEqual(row["open"], [[]] * 7)
        self.assertEqual(row["slack"]["budget"], 0)

    def test_a_site_with_no_station_at_all(self):
        row = plan([], [employee("a", [SERVICE])], FLAT)
        self.assertEqual((row["shifts"], row["roles"], row["headcount"]), ([], [], {}))

    def test_the_whole_row_survives_json(self):
        json.dumps(self.row_for_json())

    def row_for_json(self):
        people = [employee(f"p{i}", [SERVICE, CLEANING, GUARD]) for i in range(6)]
        return plan([(1, REGISTER), (8, CLEAN_STATION), (9, LOCKER)], people, FLAT)


class OneWeekPerPersonTest(unittest.TestCase):
    """A bench member is one person, not one per site (review round 1, item 1)."""

    def sites(self):
        return plan_sites(
            [
                dict(items=[(1, REGISTER)], hourly={h: 1 for h in range(24)}, number=12),
                dict(items=[(2, REGISTER)], hourly={h: 1 for h in range(24)}, number=14),
            ],
            [employee("free", [SERVICE], here=False,
                      demands=("ba:jobdemand_fulltime",))],
        )

    def test_nobody_works_two_shops_at_once(self):
        rows = self.sites()
        self.assertEqual(len(rows), 2)
        worked = collections.defaultdict(set)
        for row in rows:
            for shift in staffed(row):
                for hour in range(shift["f"], shift["t"]):
                    cell = (shift["d"], hour)
                    self.assertNotIn(cell, worked[who(row, shift)], "two shops at once")
                    worked[who(row, shift)].add(cell)

    def test_the_week_never_passes_the_band_across_sites(self):
        rows = self.sites()
        hours = collections.Counter()
        for row in rows:
            for shift in staffed(row):
                hours[who(row, shift)] += shift["t"] - shift["f"]
        self.assertTrue(hours)
        self.assertLessEqual(max(hours.values()), FULL_TIME[1])

    def test_a_bench_member_belongs_to_the_site_that_took_them(self):
        first, second = self.sites()
        self.assertTrue(staffed(first))
        self.assertEqual(first["bench"], [{"p": 0, "skill": SERVICE, "skills": [SERVICE]}])
        self.assertEqual(second["bench"], [])
        # The second site is offered the same bench member and gets nobody, so
        # its whole week is hiring lines.
        self.assertEqual(staffed(second), [])
        # And only the site that took them counts them as staff it has.
        self.assertEqual(first["headcount"][SERVICE]["have"], 1)
        self.assertEqual(second["headcount"][SERVICE]["have"], 0)

    def test_the_bench_goes_to_the_same_site_on_every_run(self):
        first = json.dumps([r["shifts"] for r in self.sites()], sort_keys=True)
        second = json.dumps([r["shifts"] for r in self.sites()], sort_keys=True)
        self.assertEqual(first, second)


class UnmeasuredSiteTest(unittest.TestCase):
    """A shop that has never reported an hour is still a shop (item 2)."""

    def row(self):
        return plan(
            [(1, REGISTER), (8, CLEAN_STATION), (9, LOCKER)],
            [employee("a", [SERVICE, CLEANING, GUARD])],
            {},
            weeks=0,
            opens=((8, 20),),
        )

    def test_it_gets_a_row_with_cover_and_hiring_lines(self):
        row = self.row()
        self.assertIsNotNone(row)
        self.assertEqual({c for r in row["basis"][SERVICE] for c in r}, {"none"})
        self.assertEqual([s for s in row["shifts"] if kind(s) == "serve"], [])
        self.assertEqual(
            sum(hours(s) for s in row["shifts"] if kind(s) == "clean"), 12 * 7
        )
        self.assertGreater(row["headcount"][GUARD]["hire"], 0)

    def test_the_hour_grid_still_skips_it(self):
        """The panel must not start drawing an empty grid for a new shop."""
        reg = registration([(1, REGISTER)], {}, weeks=0)
        save = Save(
            {"EmployeeInstances": {"$items": []},
             "BuildingRegistrations": {"$items": [dict(reg, RentedByPlayer=True)]}},
            {}, "t.hsg",
        )
        [grid] = _hourly(save, [reg], [business()], STATIONS, set(), {}, LABELS)
        self.assertFalse(grid["reported"])


class CensoredBaseTest(unittest.TestCase):
    """A censored hour starts from what the site served, not from one role (item 3)."""

    def test_a_fast_role_is_not_told_to_grow_for_a_slow_one(self):
        # A gym with three boards, two of them manned (40/h), and one register
        # manned (20/h). The site served 20 an hour and the hour is capped, so
        # the trainers are wanted for 20 + one more board = 40, two boards --
        # not their own 40 + 20 = 60, which would buy a third board to serve
        # customers the single register cannot let through anyway.
        customers = [[None] * 24 for _ in range(7)]
        customers[1][12] = 20.0
        trainers = [[0] * 24 for _ in range(7)]
        trainers[1][12] = 40
        cashiers = [[0] * 24 for _ in range(7)]
        cashiers[1][12] = 20
        roles = [
            role(TRAINER, [20, 20, 20], trainers),
            role(SERVICE, [20], cashiers),
        ]
        out = _need_curve(grid(roles, customers))
        self.assertEqual(out[TRAINER]["basis"][1][12], "censored")
        self.assertEqual(out[TRAINER]["demand"][1][12], 40.0)
        self.assertEqual(out[TRAINER]["need"][1][12], 2)


class BridgeOrderTest(unittest.TestCase):
    """One budget for the site, spent cheapest gap first (items 4 and 5)."""

    def wanted(self, gaps):
        out = {}
        for skill, missing in gaps.items():
            days = [set(range(0, 24)) for _ in range(7)]
            for hour in missing:
                days[1].discard(hour)
            out[skill] = {0: days}
        return out

    def test_a_cheap_long_gap_beats_an_expensive_short_one(self):
        # Customer Service, sorted first, has a one-hour gap at a wage of 100;
        # the Gym Trainers have a two-hour gap at a wage of 1. The budget buys
        # two hours, so the cheap gap has to win outright.
        wanted = self.wanted({SERVICE: [12], TRAINER: [12, 13]})
        spent, cost = _bridge_troughs(
            wanted, {SERVICE: 100.0, TRAINER: 1.0}, 2, [[[0, 24]]] * 7
        )
        self.assertEqual((spent, cost), (2, 2.0))
        self.assertIn(12, wanted[TRAINER][0][1])
        self.assertNotIn(12, wanted[SERVICE][0][1])

    def test_a_gap_between_two_opening_slots_is_never_bridged(self):
        wanted = self.wanted({SERVICE: [12]})
        spent, cost = _bridge_troughs(
            wanted, {SERVICE: 1.0}, 24, [[[0, 12], [13, 24]]] * 7
        )
        self.assertEqual((spent, cost), (0.0, 0.0))
        self.assertNotIn(12, wanted[SERVICE][0][1])


class TwoOpeningSlotsTest(unittest.TestCase):
    """The hour between two slots is the doors shut, not a dip in trade (item 5)."""

    def row(self):
        items = [(1, REGISTER), (8, CLEAN_STATION)]
        people = [employee(f"p{i}", [SERVICE, CLEANING]) for i in range(8)]
        return plan(items, people, FLAT, opens=((8, 12), (13, 17)))

    def test_nobody_is_rostered_into_the_closed_hour(self):
        row = self.row()
        self.assertTrue(row["shifts"])
        for shift in row["shifts"]:
            self.assertFalse(shift["f"] <= 12 < shift["t"], shift)
            self.assertGreaterEqual(shift["f"], 8)
            self.assertLessEqual(shift["t"], 17)

    def test_the_payload_carries_both_slots(self):
        self.assertEqual(self.row()["open"][1], [[8, 12], [13, 17]])


class HiringResidueTest(unittest.TestCase):
    """Hours alone understate the hires a residue needs (item 6)."""

    def test_two_shifts_on_one_day_cannot_be_one_hire(self):
        # Every one of the four staff demands free weekends, so Saturday and
        # Sunday are uncovered: two 12-hour shifts each, 48 hours. A single
        # full-time hire could take 48 hours in a week but not two twelves on
        # the same day, so the honest answer is two.
        people = [
            employee(f"p{i}", [SERVICE], demands=("ba:jobdemand_freeweekends",))
            for i in range(4)
        ]
        row = plan([(1, REGISTER)], people, {h: 1 for h in range(24)})
        counts = row["headcount"][SERVICE]
        self.assertEqual(counts["have"], 4)
        self.assertEqual(math.ceil(48 / FULL_TIME[1]), 1)  # what hours alone say
        self.assertEqual(counts["hire"], 2)
        self.assertEqual([s for s in staffed(row) if s["d"] in (6, 0)], [])

    def test_the_uncovered_weekend_is_on_the_page_as_well_as_in_the_count(self):
        """A hiring count with no hours behind it cannot be acted on.

        The same fixture: the board says "hire 2", and the player's next
        question is *for when*. Those four twelve-hour lines are the answer,
        and they are in `shifts` with nobody on them so the page can draw them
        where they fall rather than only counting them.
        """
        people = [
            employee(f"p{i}", [SERVICE], demands=("ba:jobdemand_freeweekends",))
            for i in range(4)
        ]
        row = plan([(1, REGISTER)], people, {h: 1 for h in range(24)})
        open_rows = open_lines(row)
        self.assertEqual({r["d"] for r in open_rows}, {6, 0})
        self.assertEqual(
            sorted((r["d"], r["f"], r["t"]) for r in open_rows),
            [(0, 0, 12), (0, 12, 24), (6, 0, 12), (6, 12, 24)],
        )
        # Still one line per station per hour, and still priced at nothing:
        # there is no wage to quote until somebody is hired at one.
        self.assertEqual({r["s"] for r in open_rows}, {0})
        weekend = sum(hours(r) for r in open_rows)
        self.assertEqual(weekend, 48)
        # `cost.weekly` still means what it always did: what the plan pays the
        # people it can price. The same week without the hiring lines costs
        # exactly the same, which is the whole claim.
        without = plan(
            [(1, REGISTER)],
            [employee(f"p{i}", [SERVICE]) for i in range(4)],
            {h: 1 for h in range(24)},
        )
        self.assertEqual(open_lines(without), [])
        paid = sum(hours(r) for r in staffed(row))
        self.assertEqual(paid * 20.0, row["cost"]["weekly"])  # employee()'s wage


class ShortfallTest(unittest.TestCase):
    """Who the plan leaves short, in hours and in days (items 7 and 9)."""

    def test_somebody_given_no_shift_at_all_is_still_short(self):
        # One register, one cleaning station, and three full-time staff: the
        # plan cannot find 30 hours for all of them, and whoever gets nothing is
        # the most short, not absent from the list.
        people = [
            employee(f"p{i:02d}", [SERVICE, CLEANING],
                     demands=("ba:jobdemand_fulltime",))
            for i in range(40)
        ]
        row = plan([(1, REGISTER), (8, CLEAN_STATION)], people, {h: 1 for h in range(24)})
        idle = [r for r in row["shortHours"] if r["hours"] == 0]
        self.assertTrue(idle)
        self.assertEqual(idle[0]["min"], 30)
        # The worst off sort first.
        self.assertEqual(row["shortHours"][0]["hours"], 0)

    def test_a_four_day_week_is_four_days_not_at_most_four(self):
        # A site open four hours a day has nowhere near enough work for a
        # four-day week per person, so the demand goes unmet and is reported.
        people = [
            employee(f"p{i}", [SERVICE], demands=("ba:jobdemand_fourdaysweek",))
            for i in range(7)
        ]
        row = plan([(1, REGISTER)], people, FLAT, opens=((8, 12),))
        days_of = collections.defaultdict(set)
        for shift in row["shifts"]:
            days_of[shift["p"]].add(shift["d"])
        self.assertTrue(row["shortDays"])
        listed = {entry["p"] for entry in row["shortDays"]}
        for entry in row["shortDays"]:
            self.assertEqual(entry["want"], 4)
            self.assertLess(entry["days"], 4)
        # Nobody was pushed past their count to make it up, and anybody who did
        # reach four is not on the list.
        for person, days in days_of.items():
            self.assertLessEqual(len(days), 4)
            if len(days) == 4:
                self.assertNotIn(person, listed)

    def test_nobody_is_ever_given_more_days_than_their_count(self):
        people = [
            employee("one", [SERVICE], demands=("ba:jobdemand_fourdaysweek",)),
        ]
        row = plan([(1, REGISTER)], people, FLAT)
        days = {s["d"] for s in staffed(row)}
        self.assertLessEqual(len(days), 4)


class OneBusinessEachTest(unittest.TestCase):
    """The fewest people, each on a full week, because nobody works two shops.

    `assignedAddress` binds an employee to one building, so the thirty hours full
    time demands have to come from this site or from nowhere. That makes the
    headcount the objective rather than an even share of the hours.
    """

    def hours_of(self, row):
        """Hours a week per person, for everybody the plan gives a shift."""
        out = collections.Counter()
        for shift in staffed(row):
            out[named(row, shift)] += hours(shift)
        return out

    def test_a_week_is_filled_a_person_at_a_time_not_spread_over_everybody(self):
        # One register, one customer an hour: 168 station-hours. Levelling them
        # across nine full-timers gave nine people 18 hours and nine failed
        # demands. Four is what 168 hours can employ, and it is what they get.
        people = [
            employee(f"p{i}", [SERVICE], demands=("ba:jobdemand_fulltime",))
            for i in range(9)
        ]
        row = plan([(1, REGISTER)], people, {h: 1 for h in range(24)})
        worked = self.hours_of(row)
        self.assertEqual(len(worked), row["headcount"][SERVICE]["min"])
        self.assertEqual(sum(worked.values()), row["headcount"][SERVICE]["needed"])
        # Everybody the plan does roster gets a full-time week out of this site
        # alone, and nobody is left in between.
        for name, worked_hours in worked.items():
            self.assertGreaterEqual(worked_hours, FULL_TIME[0], name)
        # The rest are named as people this site has no week for, which is the
        # player's cue to post them somewhere else.
        self.assertEqual(row["headcount"][SERVICE]["spare"], 9 - len(worked))
        self.assertEqual(
            {row["people"][r["p"]]["name"] for r in row["shortHours"]},
            {p["characterData"]["name"] for p in people} - set(worked),
        )

    def test_nobody_is_given_more_than_a_full_time_week(self):
        """Not even somebody with no hours demand to cap them.

        Filling one person before starting the next has to stop somewhere. A
        person the save gives no hours demand has no band, and the plan may not
        invent one -- they are never reported short -- but full time's own
        ceiling is the most it will hand anybody: without it, the one cleaner on
        a shop open around the clock was given 84 hours, twelve a day for seven
        days.
        """
        people = [employee(f"p{i}", [SERVICE, CLEANING]) for i in range(9)]
        row = plan([(1, REGISTER), (8, CLEAN_STATION)], people, {h: 1 for h in range(24)})
        for name, worked_hours in self.hours_of(row).items():
            self.assertLessEqual(worked_hours, FULL_TIME[1], name)
        # Nobody holds an hours demand here, so nobody is short of one either.
        self.assertEqual(row["shortHours"], [])

    def test_the_bigger_contract_starts_the_week(self):
        """Which name is started decides the headcount, so it cannot be the id.

        48 station-hours is one full-timer's week. Offer them beside a part-timer
        whose band stops at thirty and the site must still end up with one name,
        whichever of the two the save happens to list first.
        """
        for ids in (("a_part", "b_full"), ("a_full", "b_part")):
            part, full = (ids[0], ids[1]) if "part" in ids[0] else (ids[1], ids[0])
            row = plan([(1, REGISTER)], [
                employee(part, [SERVICE], demands=("ba:jobdemand_parttime",)),
                employee(full, [SERVICE], demands=("ba:jobdemand_fulltime",)),
            ], FLAT, opens=((0, 12),), open_days=(1, 2, 3, 4))
            worked = self.hours_of(row)
            self.assertEqual(list(worked), [full.upper()], ids)
            self.assertEqual(worked[full.upper()], 48, ids)

    def test_the_site_s_only_guard_is_not_spent_on_a_register(self):
        """The scarcer skill is admitted first, or its station becomes hires.

        Two full-timers and two stations, and only one of them can clean. Put
        that person on the register and the cleaning station is a week of hiring
        lines -- and which way it fell used to be decided by the employee id.
        """
        for skills in (([SERVICE, GUARD], [SERVICE]), ([SERVICE], [SERVICE, GUARD])):
            row = plan([(1, REGISTER), (9, LOCKER)], [
                employee("p0", skills[0], demands=("ba:jobdemand_fulltime",)),
                employee("p1", skills[1], demands=("ba:jobdemand_fulltime",)),
            ], FLAT, opens=((8, 14),))
            self.assertEqual(open_lines(row), [], skills)
            self.assertEqual(row["headcount"][GUARD]["hire"], 0, skills)

    def test_the_bench_is_a_last_resort_even_at_equal_hours(self):
        """Drawing on the bench costs a MyEmployees step and binds them here."""
        people = [
            employee(f"p{i}", [SERVICE], demands=("ba:jobdemand_fulltime",))
            for i in range(4)
        ] + [employee("free", [SERVICE], here=False,
                      demands=("ba:jobdemand_fulltime",))]
        row = plan([(1, REGISTER)], people, {h: 1 for h in range(24)})
        self.assertEqual(row["bench"], [])
        self.assertNotIn("FREE", self.hours_of(row))

    def test_the_residue_is_not_left_on_whoever_was_rostered_last(self):
        """A register and a cleaning station, 08-20, seven days: 168 hours.

        Filling one person at a time hands out 48, 48, 48 and 24, and that 24 is
        a full-time demand failed for six hours. It is the same 14 lines with two
        names moved, so a shift comes off the fullest week: 48, 48, 36, 36.
        """
        people = [
            employee(f"p{i}", [SERVICE, GUARD], demands=("ba:jobdemand_fulltime",))
            for i in range(6)
        ]
        row = plan(
            [(1, REGISTER), (9, LOCKER)], people, FLAT, opens=((8, 20),)
        )
        worked = self.hours_of(row)
        self.assertEqual(sorted(worked.values()), [36, 36, 48, 48])
        self.assertEqual([r["hours"] for r in row["shortHours"]], [0, 0])
        # Nobody was topped up into a name the plan had not used: the two left
        # over are spare, which is the player's cue to post them elsewhere.
        self.assertEqual(len(worked), 4)

    def test_a_week_too_small_to_share_is_not_shuffled_for_nothing(self):
        """56 station-hours will not give two people thirty each, whatever moves.

        One of them is short however the hours fall, so the plan says so instead
        of handing shifts about to change names on the page and fix nothing.
        """
        people = [
            employee(f"p{i}", [SERVICE], demands=("ba:jobdemand_fulltime",))
            for i in range(4)
        ]
        row = plan([(1, REGISTER)], people, FLAT, opens=((10, 18),))
        worked = self.hours_of(row)
        self.assertEqual(sorted(worked.values()), [8, 48])
        self.assertEqual(
            [r["hours"] for r in row["shortHours"] if r["hours"]], [8])

    def test_the_cover_stations_go_to_a_name_already_on_the_roster(self):
        """A cleaning station is not a reason to owe another person a week.

        The doors open twice: 08-12, when the customers come, and 14-20, when
        they do not. So the serving shift is the morning and the cleaning station
        wants both slots, and the afternoon is hours the morning's server is free
        to work. The cover pass has to offer it to them rather than to a new
        name -- which is what carrying `rostered` across the two passes buys, and
        what this asserts: the same person serves the morning and cleans the
        afternoon.
        """
        # Three people who could each do both jobs, where the site has work for
        # two. Whoever the serving pass starts with, the cover pass has to come
        # back to the two names already on the roster rather than reach for the
        # third -- which every key below `rostered` would do, the third being
        # the emptiest week and the cheapest wage on offer.
        people = [
            employee("p0", [SERVICE, GUARD], wage=30.0),
            employee("p1", [SERVICE, GUARD], wage=20.0),
            employee("spare", [SERVICE, GUARD], wage=10.0),
        ]
        row = plan(
            [(1, REGISTER), (9, LOCKER)],
            people,
            {h: 15 if 8 <= h < 12 else 0 for h in range(24)},
            opens=((8, 12), (14, 18)),
        )
        afternoon = [s for s in staffed(row) if s["f"] >= 14]
        self.assertTrue(afternoon, "the cleaning station wants the second slot")
        self.assertEqual(len(self.hours_of(row)), 2, "two names, not three")


class DayCountTest(unittest.TestCase):
    """`fourdaysweek` and `fivedaysweek` ask for *exactly* that many days.

    The game's own `DaysWorkingPerWeek.Fulfilled()` (build 3680) fails on `!=`,
    not on `>`, so three days breaks a four-day demand as surely as five does.
    Five twelve-hour days is 60 hours and full time's ceiling is 50, so on a site
    whose doors are open long enough to cut twelve-hour shifts a five-day week
    cannot be built out of them: one shift has to be shared.
    """

    def weeks(self, row):
        """Hours, days and lines per person."""
        out = {}
        for shift in staffed(row):
            who = named(row, shift)
            mine = out.setdefault(who, {"hours": 0, "days": set(), "lines": 0})
            mine["hours"] += hours(shift)
            mine["days"].add(shift["d"])
            mine["lines"] += 1
        return out

    def test_a_five_day_week_is_built_by_sharing_a_day(self):
        people = [
            employee(f"p{i}", [SERVICE],
                     demands=("ba:jobdemand_fulltime", "ba:jobdemand_fivedaysweek"))
            for i in range(4)
        ]
        row = plan([(1, REGISTER)], people, FLAT, opens=((8, 20),))
        weeks = self.weeks(row)
        # Nobody the plan rosters is left short of a day. The two it has no week
        # for at all are spare, and a spare person is short of every day there
        # is -- that is the hiring answer, not a scheduling one.
        self.assertTrue(all(r["days"] == 0 for r in row["shortDays"]))
        self.assertEqual(len(weeks) + len(row["shortDays"]), len(people))
        for who, mine in weeks.items():
            self.assertEqual(len(mine["days"]), 5, who)
            self.assertGreaterEqual(mine["hours"], FULL_TIME[0], who)
            self.assertLessEqual(mine["hours"], FULL_TIME[1], who)
        # Seven twelve-hour days cannot give two people five days each without
        # sharing three of them, so the week is ten lines rather than seven.
        self.assertEqual(len(staffed(row)), 10)

    def test_no_line_is_shorter_than_four_hours(self):
        """The week this feature replaces is two-hour scraps; it may not make more.

        Four is written out rather than read from `MIN_SPLIT`, because a test
        that asserts against the constant moves with it: drop `MIN_SPLIT` to one
        and this same shop is planned with a two-hour line, which is the thing
        being ruled out. Doors 08-19 is the shape that tempts it -- eleven-hour
        days, a five-day demand, and a two-hour tail that would settle it.
        """
        row = plan([(1, REGISTER)], [
            employee("a_five", [SERVICE],
                     demands=("ba:jobdemand_fulltime", "ba:jobdemand_fivedaysweek")),
            employee("b_full", [SERVICE], demands=("ba:jobdemand_fulltime",)),
        ], FLAT, opens=((8, 19),))
        self.assertTrue(staffed(row))
        for shift in row["shifts"]:
            self.assertGreaterEqual(hours(shift), 4, shift)
            self.assertLessEqual(hours(shift), SHIFT_CAP, shift)
        # And the day the tail would have bought is bought anyway, by sharing.
        self.assertEqual(row["shortDays"], [])

    def test_a_four_day_week_needs_no_cutting_when_the_days_are_there(self):
        """Four twelves is 48 hours, inside the band: nothing has to be split."""
        row = plan(
            [(1, REGISTER)],
            [employee("one", [SERVICE],
                      demands=("ba:jobdemand_fulltime", "ba:jobdemand_fourdaysweek"))],
            FLAT, opens=((8, 20),),
        )
        mine = self.weeks(row)["ONE"]
        self.assertEqual((len(mine["days"]), mine["lines"]), (4, 4))
        self.assertEqual(mine["hours"], 48)

    def test_a_day_nobody_can_spare_is_reported_rather_than_forced(self):
        """A site whose every week is already full has no day left to share.

        One person assigned to a shop open twelve hours a day: they take four
        days and stop at the fifty hours full time allows. The fifth day would
        have to come out of somebody else's shift, and there is nobody else --
        the rest of the week is hiring lines.
        """
        people = [
            employee("a_five", [SERVICE],
                     demands=("ba:jobdemand_fulltime", "ba:jobdemand_fivedaysweek"))
        ]
        row = plan([(1, REGISTER)], people, FLAT, opens=((8, 20),))
        short = {row["people"][r["p"]]["name"]: (r["days"], r["want"])
                 for r in row["shortDays"]}
        self.assertEqual(short, {"A_FIVE": (4, 5)})
        # And nothing was cut to chase it: the week is still whole shifts.
        for shift in row["shifts"]:
            self.assertEqual(hours(shift), SHIFT_CAP, shift)


class ExchangeTest(unittest.TestCase):
    """The trades `_top_up_short()` makes, and the ones it refuses to make."""

    def weeks(self, row):
        out = {}
        for shift in staffed(row):
            mine = out.setdefault(named(row, shift), {"hours": 0, "days": set()})
            mine["hours"] += hours(shift)
            mine["days"].add(shift["d"])
        return out

    def test_a_crowded_shop_settles_everybody(self):
        """A shop that needs the whole machinery, taken from a random sweep.

        Two registers, a cleaning station and a locker, open 06-23 six days a
        week, eight people between them holding part-time and full-time bands,
        four-day weeks, free weekends, no mornings, no evenings, and one cleaner
        on the bench. Every demand it is possible to meet is met, which takes
        whole shifts moved, shifts cut and days shared between them.
        """
        people = [
            employee("p00", [GUARD], wage=26.0,
                     demands=("ba:jobdemand_fulltime", "ba:jobdemand_freeweekends")),
            employee("p01", [SERVICE, CLEANING], wage=29.0),
            employee("p02", [SERVICE, CLEANING], wage=10.0,
                     demands=("ba:jobdemand_fulltime",)),
            employee("p03", [SERVICE], wage=18.0,
                     demands=("ba:jobdemand_fulltime", "ba:jobdemand_nomornings")),
            employee("p04", [SERVICE, CLEANING, GUARD], wage=10.0,
                     demands=("ba:jobdemand_parttime", "ba:jobdemand_fourdaysweek")),
            employee("p05", [SERVICE, CLEANING], wage=17.0,
                     demands=("ba:jobdemand_fulltime", "ba:jobdemand_fourdaysweek")),
            employee("p06", [SERVICE, CLEANING, GUARD], wage=26.0,
                     demands=("ba:jobdemand_parttime", "ba:jobdemand_fourdaysweek")),
            employee("b0", [CLEANING], wage=11.0, here=False,
                     demands=("ba:jobdemand_fulltime", "ba:jobdemand_noevenings")),
        ]
        row = plan(
            [(1, REGISTER), (2, REGISTER), (8, CLEAN_STATION), (9, LOCKER)],
            people, FLAT, opens=((6, 23),), open_days=(0, 1, 2, 4, 5, 6),
        )
        self.assertEqual(row["shortDays"], [], "every day count is met")
        self.assertEqual([r for r in row["shortHours"] if r["hours"]], [],
                         "nobody is left on a partial week")
        for who, week in self.weeks(row).items():
            self.assertGreaterEqual(week["hours"], 10, who)
            self.assertLessEqual(week["hours"], FULL_TIME[1], who)

    def test_a_week_that_cannot_be_reached_is_not_cut_at_all(self):
        """All or nothing: a shortfall that cannot be closed moves no shift.

        Handing over whatever a donor could spare and seeing how far it got left
        people with a scrap of a line *and* a failed demand. 56 station-hours
        will not give two people thirty hours each however they are shared, so
        the plan says so and leaves the week whole.
        """
        row = plan([(1, REGISTER)], [
            employee(f"p{i}", [SERVICE], demands=("ba:jobdemand_fulltime",))
            for i in range(4)
        ], FLAT, opens=((10, 18),))
        worked = sorted(week["hours"] for week in self.weeks(row).values())
        self.assertEqual(worked, [8, 48])
        # Eight-hour days, every one of them whole: nothing was cut chasing the
        # thirty that was never in reach.
        for shift in row["shifts"]:
            self.assertEqual(hours(shift), 8, shift)

    def test_a_donor_on_their_ceiling_can_still_be_paid_back(self):
        """The ceiling is judged on the finished weeks, not one leg at a time.

        An exchange moves hours both ways, so asking `_can_work()` about the
        weekly ceiling mid-trade refuses the very compensation that makes room
        for it. Hand-built shops did not reach it; this one came out of a random
        sweep, where judging the ceiling per leg costs a five-day week on four
        shops in four hundred. Two registers around the clock, seven people, and
        P04 is the one whose five days hang on the trade.
        """
        people = [
            employee("p00", [SERVICE], wage=25.0,
                     demands=("ba:jobdemand_fulltime", "ba:jobdemand_nomornings")),
            employee("p01", [CLEANING, GUARD], wage=22.0,
                     demands=("ba:jobdemand_fulltime", "ba:jobdemand_fourdaysweek")),
            employee("p02", [SERVICE], wage=25.0),
            employee("p03", [SERVICE, CLEANING], wage=23.0,
                     demands=("ba:jobdemand_fulltime", "ba:jobdemand_nonights")),
            employee("p04", [SERVICE], wage=24.0,
                     demands=("ba:jobdemand_fulltime", "ba:jobdemand_fivedaysweek")),
            employee("p05", [CLEANING], wage=28.0, demands=("ba:jobdemand_fulltime",)),
            employee("b0", [SERVICE], wage=10.0, here=False),
        ]
        row = plan([(1, REGISTER), (2, REGISTER)], people,
                   {h: max(1, int(41 * (1 - abs(h - 14) / 14))) for h in range(24)})
        weeks = self.weeks(row)
        self.assertIn("P04", weeks)
        self.assertEqual(len(weeks["P04"]["days"]), 5, "the five days the trade buys")
        self.assertNotIn("P04", {row["people"][r["p"]]["name"]
                                 for r in row["shortDays"]})

    def test_a_tail_that_will_not_fit_is_tried_shorter(self):
        """One length of piece, tried once, leaves a Critical demand failed.

        Also from the sweep, and rarer: two shops in two thousand. Doors 10-18,
        two registers and a cleaning station, and the full-timer's last three
        hours only fit as three -- the four the plan would rather cut runs into a
        shift they already work.
        """
        row = plan(
            [(1, REGISTER), (2, REGISTER), (8, CLEAN_STATION)],
            [employee("p00", [SERVICE], wage=17.0, demands=("ba:jobdemand_parttime",)),
             employee("p01", [SERVICE, GUARD], wage=11.0,
                      demands=("ba:jobdemand_fulltime", "ba:jobdemand_nonights")),
             employee("b0", [SERVICE, GUARD], wage=10.0, here=False,
                      demands=("ba:jobdemand_fulltime", "ba:jobdemand_nocleaning"))],
            {h: max(1, int(21 * (1 - abs(h - 14) / 14))) for h in range(24)},
            opens=((10, 18),),
        )
        self.assertEqual([r for r in row["shortHours"] if r["hours"]], [],
                         "nobody is left on a partial week")
        for who, week in self.weeks(row).items():
            self.assertGreaterEqual(week["hours"], FULL_TIME[0], who)

    def test_the_exchange_is_refused_when_the_finished_weeks_would_not_do(self):
        """`keeps_promises()` is the last word on a trade, and it is load-bearing.

        Taken from a random sweep, because hand-built shops kept missing it: on
        this one, letting the exchange write whatever its two legs allowed moves
        eight hours from one week to the other. On other shops of the same sweep
        it writes a part-timer a 31-hour week against a 30-hour ceiling, which is
        what `RosterInvariantTest` would catch; this pins the cheaper symptom,
        which is that the trade happens at all.
        """
        row = plan([(1, REGISTER)], [
            employee("p00", [SERVICE], wage=12.0,
                     demands=("ba:jobdemand_fulltime", "ba:jobdemand_fivedaysweek")),
            employee("p01", [SERVICE, CLEANING, GUARD], wage=20.0,
                     demands=("ba:jobdemand_fulltime", "ba:jobdemand_fivedaysweek")),
            employee("p02", [SERVICE, GUARD], wage=22.0, demands=("ba:jobdemand_parttime",)),
            employee("p03", [CLEANING], wage=17.0,
                     demands=("ba:jobdemand_fulltime", "ba:jobdemand_nomornings")),
            employee("p04", [SERVICE], wage=28.0,
                     demands=("ba:jobdemand_fulltime", "ba:jobdemand_nocleaning")),
        ], {h: max(1, int(18 * (1 - abs(h - 14) / 14))) for h in range(24)},
            opens=((9, 17),))
        self.assertEqual({w: v["hours"] for w, v in self.weeks(row).items()},
                         {"P00": 40, "P01": 16})

    def test_a_week_goes_to_the_contract_that_fits_it(self):
        """Who started the week is not who should keep it.

        Among new names the rank can only compare contracts and wages, so a
        cheaper person with no hours demand can take a whole week while a
        full-timer beside them is reported 0 of 30. Four twelve-hour days is a
        week that fits full time exactly, so it is handed over -- whichever way
        the wages fall.
        """
        for wages in ((20.0, 10.0), (10.0, 20.0)):
            row = plan([(1, REGISTER)], [
                employee("full", [SERVICE], wage=wages[0],
                         demands=("ba:jobdemand_fulltime",)),
                employee("none", [SERVICE], wage=wages[1]),
            ], FLAT, opens=((8, 20),), open_days=range(4))
            self.assertEqual({w: v["hours"] for w, v in self.weeks(row).items()},
                             {"FULL": 48}, f"wages {wages}")
            self.assertEqual(row["shortHours"], [], f"wages {wages}")

    def test_a_day_count_that_cannot_be_met_leaves_the_week_where_it_is(self):
        """`would_suit()` asks for the taker's day count exactly, not at most.

        Twenty-one hours over three days fits a part-timer's band, so without the
        exact test the week is handed to somebody whose contract asks for four
        days -- trading a person the player could post elsewhere for one trapped
        on a week that still fails. Left alone, the part-timer is spare and the
        unbanded person keeps the hours.
        """
        row = plan([(1, REGISTER)], [
            employee("none", [SERVICE], wage=10.0),
            employee("part", [SERVICE], wage=20.0,
                     demands=("ba:jobdemand_parttime", "ba:jobdemand_fourdaysweek")),
        ], FLAT, opens=((8, 15),), open_days=(0, 1, 2))
        self.assertEqual({w: mine["hours"] for w, mine in self.weeks(row).items()},
                         {"NONE": 21})
        self.assertEqual([(r["days"], r["want"]) for r in row["shortDays"]], [(0, 4)])

    def test_a_week_too_small_for_the_band_is_left_where_it_is(self):
        """And the shop that has too few hours to fill one keeps its own answer.

        Twenty-eight hours cannot make a full-time week, so handing it over would
        only move the failed demand from one name to the other -- and leaving the
        full-timer spare is something the player can act on, where trapping them
        on a partial week is not.
        """
        row = plan([(1, REGISTER)], [
            employee("full", [SERVICE], wage=20.0, demands=("ba:jobdemand_fulltime",)),
            employee("none", [SERVICE], wage=10.0),
        ], FLAT, opens=((8, 15),), open_days=range(4))
        self.assertEqual({w: v["hours"] for w, v in self.weeks(row).items()},
                         {"NONE": 28})
        self.assertEqual([r["hours"] for r in row["shortHours"]], [0])

    def test_the_hours_are_settled_again_once_the_days_have_moved(self):
        """Sharing a day moves hours, and somebody written off may now be reachable.

        `settle()` gives up on a week for good the moment it cannot reach the
        floor, so without a second pass after the day loop the person the day
        pass has since given hours to is never looked at again. This shop was
        removed from the plan once on the strength of three thousand random shops
        that could not produce it: the shape needs one person holding an hours
        band *and* a day count *and* a blackout window at the same time, which
        two generators offered only as alternatives. P06 is that person, and
        without the second pass they finish on 14 hours over two days with both
        demands failed instead of 30 over five with neither. It is not free: the
        week goes from 15 lines to 20, and P06's thirty hours come as eight of
        them, two an hour long, out of the sub-MIN_SPLIT fallback that closing a
        Critical demand is allowed to use.
        """
        row = plan([(4, BOOTH)], [
            employee("p01", [SERVICE, TRAINER], wage=9.0,
                     demands=("ba:jobdemand_fourdaysweek", "ba:jobdemand_noafternoons")),
            employee("p06", [SERVICE], wage=22.0,
                     demands=("ba:jobdemand_fulltime", "ba:jobdemand_fivedaysweek",
                              "ba:jobdemand_noevenings")),
            employee("p07", [CLEANING, SERVICE], wage=31.0,
                     demands=("ba:jobdemand_fourdaysweek", "ba:jobdemand_freeweekends")),
            employee("p10", [CLEANING, SERVICE], wage=28.0,
                     demands=("ba:jobdemand_fulltime",)),
        ], {0: 2, 1: 3, 2: 0, 3: 0, 4: 2, 5: 4, 6: 4, 7: 5, 8: 5, 9: 11, 10: 9,
            11: 7, 12: 10, 13: 12, 14: 10, 15: 11, 16: 7, 17: 12, 18: 3, 19: 5,
            20: 9, 21: 4, 22: 3, 23: 0},
            opens=((5, 12), (13, 24)))
        week = self.weeks(row)
        self.assertEqual(week["P06"]["hours"], 30)
        self.assertEqual(len(week["P06"]["days"]), 5)
        self.assertEqual(row["shortHours"], [])
        self.assertEqual(row["shortDays"], [])
        # And what it costs, which is the half a reader needs to judge the
        # trade: 15 lines become 20, and P06's thirty hours arrive as eight of
        # them, two an hour long. The hours band is the game's Critical demand
        # and a short line is not a broken one, but the price belongs in the
        # test rather than only in the reasoning that chose it.
        self.assertEqual(len(row["shifts"]), 20)
        self.assertLessEqual(
            len([s for s in staffed(row) if named(row, s) == "P06"]), 8)

    def test_a_third_person_can_take_the_hours_the_donor_cannot(self):
        """The donor is asked first, but they are not always able.

        One register around the clock, five days, three people. What the wider
        search buys *here* is the shape of the week rather than the fifth day:
        restricted to the donor, P01 keeps six hours that P02 should have, and it
        comes out 36 and 34 instead of 30 and 40. The day it rescues elsewhere is
        rarer -- three per thousand shops on a crew built for the shape -- and no
        fixture in this file pins that, which is worth knowing before anybody
        decides the branch is decoration.
        """
        row = plan([(1, REGISTER)], [
            employee("p00", [SERVICE], wage=28.0,
                     demands=("ba:jobdemand_fulltime", "ba:jobdemand_fivedaysweek")),
            employee("p01", [SERVICE, CLEANING], wage=22.0,
                     demands=("ba:jobdemand_fulltime", "ba:jobdemand_noevenings")),
            employee("p02", [SERVICE, GUARD], wage=14.0,
                     demands=("ba:jobdemand_nocleaning",)),
        ], {h: max(1, int(55 * (1 - abs(h - 14) / 14))) for h in range(24)},
            open_days=(0, 3, 4, 5, 6))
        week = self.weeks(row)
        self.assertEqual(row["shortDays"], [], "the fifth day is bought")
        self.assertEqual(len(week["P00"]["days"]), 5)
        # The trade the donor could not take: restricted to them, P01 keeps six
        # hours P02 should have had, and the week comes out 36 and 34 instead.
        self.assertEqual({who: mine["hours"] for who, mine in week.items()},
                         {"P00": 50, "P01": 30, "P02": 40})

    def test_a_donor_is_not_stripped_of_the_only_day_they_work(self):
        """A day count is a demand too, so the hours pass may not take the last
        shift somebody has on a day their contract needs.

        Two opening slots, four days, a crew of part-timers and full-timers with
        day counts between them: dropping the guard moves a whole shift off
        somebody whose four days then become three.
        """
        row = plan([(1, REGISTER), (9, LOCKER)], [
            employee("p00", [SERVICE], wage=10.0, demands=("ba:jobdemand_parttime",)),
            employee("p01", [CLEANING, GUARD], wage=21.0,
                     demands=("ba:jobdemand_parttime", "ba:jobdemand_fourdaysweek")),
            employee("p02", [SERVICE], wage=18.0,
                     demands=("ba:jobdemand_fulltime", "ba:jobdemand_nomornings")),
            employee("p03", [CLEANING], wage=23.0,
                     demands=("ba:jobdemand_fulltime", "ba:jobdemand_noevenings")),
            employee("p04", [SERVICE, CLEANING, GUARD], wage=13.0,
                     demands=("ba:jobdemand_fulltime", "ba:jobdemand_fourdaysweek")),
            employee("p05", [SERVICE, CLEANING, GUARD], wage=18.0,
                     demands=("ba:jobdemand_fulltime", "ba:jobdemand_nocleaning")),
            employee("b0", [SERVICE], wage=23.0, here=False,
                     demands=("ba:jobdemand_parttime", "ba:jobdemand_fourdaysweek")),
            employee("b1", [SERVICE], wage=21.0, here=False,
                     demands=("ba:jobdemand_fulltime", "ba:jobdemand_freeweekends")),
        ], {h: max(1, int(12 * (1 - abs(h - 14) / 14))) for h in range(24)},
            opens=((8, 12), (14, 18)), open_days=(0, 1, 2, 6))
        # P01 and the bench member hold four-day contracts and work exactly four
        # days; the guard is what stops the hours pass taking one of those days
        # away to settle somebody else's week.
        week = self.weeks(row)
        self.assertEqual(len(week["P01"]["days"]), 4)
        self.assertEqual(len(week["B0"]["days"]), 4)
        self.assertEqual({who: mine["hours"] for who, mine in week.items()},
                         {"B0": 28, "P01": 28, "P02": 4, "P04": 4})

    def test_the_bench_is_listed_under_the_roles_it_would_really_work(self):
        """`have` counts a bench member per role, and the page takes them off it.

        Listing a role the plan would never use them for took the site's own
        cleaner off the line to make room for a bench member who serves.
        """
        row = plan(
            [(1, REGISTER), (8, CLEAN_STATION)],
            [employee("bench", [SERVICE, CLEANING], here=False),
             employee("c0", [CLEANING])],
            FLAT,
        )
        self.assertEqual([r["skills"] for r in row["bench"]], [[SERVICE]])
        self.assertEqual(row["headcount"][CLEANING]["have"], 1, "the real cleaner")


class RosterInvariantTest(unittest.TestCase):
    """Every rule a finished week may not break, over a spread of shops.

    The tests above each pin one decision. This pins the guards that hold
    whatever the plan decides -- nobody over their ceiling, over their day count,
    in two places, on a station they cannot work, inside a window their contract
    shuts, or on a day the doors never open -- and that the two warning lists
    name exactly the people the week leaves short, with the figures their
    contracts actually ask for.

    It exists because a review found that removing any one of those guards left
    every other test green: a part-timer was written a 31-hour week and nothing
    said so. A first attempt at this class had the same hole in miniature -- it
    checked that the warnings it was given were consistent, never that the ones
    it was owed were there, so emptying both lists passed. Both halves are here
    now, and the shops are chosen to reach the passes that can break them.
    """

    # Cover duties by the skill their station takes, so a line is judged by what
    # it is rather than by the label the planner wrote on it.
    DUTY = {skill: duty for duty, skill in COVER_STATIONS.values()}

    SHOPS = [
        # (label, stations, doors, open days, customers, crew)
        ("one register, four long days", [(1, REGISTER)], ((8, 20),), (0, 1, 2, 3), FLAT,
         [("p0", [SERVICE], 10.0, (), True), ("p1", [SERVICE], 20.0, (FULLTIME,), True)]),
        # Two registers around the clock with a crew that has to trade hours to
        # settle: this is the shop where dropping `keeps_promises()` writes
        # somebody a 52-hour week against a 50-hour ceiling.
        ("two registers around the clock", [(1, REGISTER), (2, REGISTER)],
         ((0, 24),), tuple(range(7)),
         {hour: max(1, int(41 * (1 - abs(hour - 14) / 14))) for hour in range(24)},
         [("p00", [SERVICE], 25.0, (FULLTIME, "ba:jobdemand_nomornings"), True),
          ("p01", [CLEANING, GUARD], 22.0, (FULLTIME, FOUR_DAYS), True),
          ("p02", [SERVICE], 25.0, (), True),
          ("p03", [SERVICE, CLEANING], 23.0, (FULLTIME, "ba:jobdemand_nonights"), True),
          ("p04", [SERVICE], 24.0, (FULLTIME, FIVE_DAYS), True),
          ("p05", [CLEANING], 28.0, (FULLTIME,), True),
          ("b0", [SERVICE], 10.0, (), False)]),
        ("everything at once", [(1, REGISTER), (2, REGISTER), (8, CLEAN_STATION), (9, LOCKER)],
         ((6, 22),), tuple(range(7)), FLAT,
         [("a", [SERVICE], 12.0, (PARTTIME, FOUR_DAYS), True),
          ("b", [SERVICE], 14.0, (PARTTIME, FOUR_DAYS), True),
          ("c", [SERVICE], 16.0, (FULLTIME, FIVE_DAYS, "ba:jobdemand_noafternoons"), True),
          ("d", [CLEANING], 11.0, (FULLTIME,), True),
          ("e", [CLEANING, GUARD], 13.0, (PARTTIME,), True),
          ("f", [GUARD], 15.0, (FULLTIME, "ba:jobdemand_freeweekends"), True),
          ("g", [SERVICE, GUARD], 17.0, (FULLTIME, FOUR_DAYS), True),
          ("h", [SERVICE], 9.0, (FULLTIME, FOUR_DAYS), False),
          ("i", [CLEANING], 9.0, (FULLTIME,), False)]),
        ("a short week nobody can fill", [(1, REGISTER)], ((10, 14),), tuple(range(7)), FLAT,
         [(f"p{i}", [SERVICE], 10.0 + i, (FULLTIME,), True) for i in range(3)]),
        ("blackouts and weekends", [(1, REGISTER), (8, CLEAN_STATION)],
         ((0, 24),), tuple(range(7)), FLAT,
         [("night", [SERVICE], 10.0, (FULLTIME, "ba:jobdemand_nonights"), True),
          ("morn", [SERVICE], 11.0, (FULLTIME, "ba:jobdemand_nomornings"), True),
          ("even", [SERVICE], 12.0, (FULLTIME, "ba:jobdemand_noevenings"), True),
          ("week", [SERVICE], 13.0, (FULLTIME, "ba:jobdemand_freeweekends"), True),
          ("cleanA", [CLEANING], 14.0, (FULLTIME,), True),
          ("cleanB", [CLEANING], 15.0, (PARTTIME,), True)]),
        # Sixty station-hours in twelve-hour pieces, which only settle by cutting
        # one. Here that is a week to check the rules against, cut shifts and
        # all; that the cut *happens* is pinned by the residue test, which
        # compares 36/36 against 48/24.
        ("a week that only settles by cutting", [(1, REGISTER)], ((0, 12),),
         (1, 2, 3, 4, 5), FLAT,
         [("a_five", [SERVICE], 10.0, (FULLTIME, FIVE_DAYS), True),
          ("b_full", [SERVICE], 20.0, (FULLTIME,), True)]),
        # And one that still has a day demand it cannot meet, so the `shortDays`
        # half of the warning check has something to check.
        ("nobody to share a fifth day with", [(1, REGISTER)], ((8, 20),),
         tuple(range(7)), FLAT,
         [("lonely", [SERVICE], 10.0, (FULLTIME, FIVE_DAYS), True)]),
        # The hours pass moves shifts between people, and its two legality tests
        # are the only ones it has. A crew that cannot reach thirty hours off the
        # doors alone forces it to run: without those tests the guard here ends
        # up on the register, on a station they cannot work, twice over.
        ("a crew the doors cannot fill", [(1, REGISTER), (9, LOCKER)], ((8, 20),),
         (0, 1, 2, 3, 4), {hour: 30 for hour in range(24)},
         [("g", [GUARD], 10.0, (FULLTIME,), True),
          ("s", [SERVICE], 11.0, (FULLTIME,), True),
          ("t", [SERVICE], 12.0, (FULLTIME,), True)]),
        # Two stations wanted at the same hours, each under half a day, so one
        # person could legally hold both at once inside the 14-hour rule. Only
        # the overlap test stops it, and the rank actively prefers a name already
        # on the roster.
        ("two counters at the same hours", [(1, REGISTER), (2, REGISTER)], ((9, 15),),
         tuple(range(7)), {hour: 60 for hour in range(24)},
         [(f"p{i}", [SERVICE], 10.0 + i, (FULLTIME,), True) for i in range(3)]),
        # A part-timer beside a week that has to be traded to settle: the day
        # exchange strips the ceiling out of its own legality test and leaves it
        # to `keeps_promises()`, so this is the shop that catches that clause
        # going missing rather than the whole function.
        ("a part-timer in the middle of a trade", [(1, REGISTER), (9, LOCKER)],
         ((0, 24),), (0, 1, 2, 3),
         {hour: max(2, 40 - abs(hour - 11) * 3) for hour in range(24)},
         [("p0", [SERVICE, CLEANING], 10.0, (PARTTIME, FOUR_DAYS), True),
          ("p1", [SERVICE], 12.0, (FULLTIME, "ba:jobdemand_noevenings"), True),
          ("p2", [SERVICE, CLEANING], 14.0, (PARTTIME, FOUR_DAYS), True)]),
    ]

    def shop(self, spec):
        _label, items, opens, days, customers, crew = spec
        people = [
            employee(who, skills, wage=wage, demands=demands, here=here)
            for who, skills, wage, demands, here in crew
        ]
        return plan(items, people, customers, opens=opens, open_days=days), people

    def weeks_of(self, row):
        """Hours, days and the hours busy per day, per employee id."""
        out = collections.defaultdict(
            lambda: {"hours": 0, "days": set(), "busy": collections.defaultdict(set)})
        for shift in staffed(row):
            mine = out[row["people"][shift["p"]]["id"]]
            mine["hours"] += hours(shift)
            mine["days"].add(shift["d"])
            mine["busy"][shift["d"]].update(range(shift["f"], shift["t"]))
        return out

    def test_no_week_breaks_a_rule(self):
        for spec in self.SHOPS:
            label, _items, opens, open_days = spec[0], spec[1], spec[2], spec[3]
            row, people = self.shop(spec)
            self.assertTrue(row, label)
            rules = {p["id"]: demands_of(p) for p in people}
            stations = {index: post for index, post in enumerate(row["stations"])}
            manned = set()
            taken = collections.defaultdict(set)
            for shift in row["shifts"]:
                length = hours(shift)
                post = stations[shift["s"]]
                duty = self.DUTY.get(post.get("skill"), "serve")
                self.assertTrue(0 < length <= SHIFT_CAP, f"{label}: a {length} h shift")
                self.assertIn(shift["d"], open_days, f"{label}: the doors are shut")
                self.assertTrue(
                    any(low <= shift["f"] and shift["t"] <= high for low, high in opens),
                    f"{label}: {shift['f']}-{shift['t']} is outside the doors")
                for hour in range(shift["f"], shift["t"]):
                    key = (shift["s"], shift["d"], hour)
                    self.assertNotIn(key, manned, f"{label}: a station manned twice")
                    manned.add(key)
                if shift["p"] is None:
                    continue
                pid = row["people"][shift["p"]]["id"]
                rule = rules[pid]
                if post.get("skill"):
                    self.assertIn(post["skill"], rule["skills"], f"{label}: {pid} cannot")
                if duty == "clean":
                    self.assertNotIn(SERVICE, rule["skills"], f"{label}: {pid} serves")
                    self.assertFalse(rule["nocleaning"], f"{label}: {pid} refuses cleaning")
                if rule["weekendsOff"]:
                    self.assertNotIn(shift["d"], WEEKEND_WEEKDAYS, f"{label}: {pid}")
                # Built as the shifts are walked, not from the finished union: two
                # shifts that overlap *exactly* leave a union the size of either
                # one, so comparing lengths against it cannot see them.
                self.assertFalse(
                    set(range(shift["f"], shift["t"])) & taken[(pid, shift["d"])],
                    f"{label}: {pid} is in two places on day {shift['d']}")
                taken[(pid, shift["d"])].update(range(shift["f"], shift["t"]))
                for low, high in rule["blackouts"]:
                    self.assertFalse(low < shift["t"] and shift["f"] < high,
                                     f"{label}: {pid} works inside a blackout")
            for pid, mine in self.weeks_of(row).items():
                rule = rules[pid]
                ceiling = (rule["band"] or FULL_TIME)[1]
                self.assertLessEqual(mine["hours"], ceiling, f"{label}: {pid} over the ceiling")
                if rule["days"] is not None:
                    self.assertLessEqual(len(mine["days"]), rule["days"], f"{label}: {pid}")
                for day, busy in mine["busy"].items():
                    self.assertLessEqual(len(busy), OVERWORK_HOURS, f"{label}: {pid} day {day}")

    def test_the_warnings_name_everybody_the_week_leaves_short(self):
        """Both directions: no warning invented, and none owed and missing.

        The first version of this checked only the warnings it was handed, so a
        plan that simply forgot to report a shortfall -- or reported one against
        a figure no contract asks for -- passed it.
        """
        for spec in self.SHOPS:
            label = spec[0]
            row, people = self.shop(spec)
            rules = {p["id"]: demands_of(p) for p in people}
            weeks = self.weeks_of(row)
            here = {
                p["id"] for p in people
                if p["assignedAddress"] or p["id"] in weeks
            }
            owed_hours = {
                pid: (float(weeks[pid]["hours"]), rules[pid]["band"][0])
                for pid in here
                if rules[pid]["band"] and weeks[pid]["hours"] < rules[pid]["band"][0]
            }
            self.assertEqual(
                {row["people"][e["p"]]["id"]: (float(e["hours"]), e["min"])
                 for e in row["shortHours"]},
                owed_hours, f"{label}: shortHours")
            owed_days = {
                pid: (len(weeks[pid]["days"]), rules[pid]["days"])
                for pid in here
                if rules[pid]["days"] is not None
                and len(weeks[pid]["days"]) != rules[pid]["days"]
            }
            self.assertEqual(
                {row["people"][e["p"]]["id"]: (e["days"], e["want"])
                 for e in row["shortDays"]},
                owed_days, f"{label}: shortDays")

    def test_the_hours_are_conserved(self):
        """A split may move an hour between people; it may not invent or lose one."""
        for spec in self.SHOPS:
            label = spec[0]
            row, _people = self.shop(spec)
            drawn = collections.Counter()
            stations = {index: post for index, post in enumerate(row["stations"])}
            for shift in row["shifts"]:
                post = stations[shift["s"]]
                if post.get("skill"):
                    drawn[post["skill"]] += hours(shift)
            for skill, count in row["headcount"].items():
                self.assertEqual(drawn[skill], count["needed"], f"{label}: {skill}")


class CurrentSecurityTest(unittest.TestCase):
    """A guard on a locker is security, not service (item 8)."""

    def test_a_locker_shift_is_counted_as_security(self):
        shifts = [
            {"wd": 1, "employeeId": "g", "itemInstanceId": 9,
             "startingHour": 0, "endingHour": 12, "type": 1},
        ]
        row = plan(
            [(1, REGISTER), (9, LOCKER)],
            [employee("g", [GUARD, SERVICE])],
            FLAT,
            shifts=shifts,
        )
        self.assertEqual(row["current"]["security"], 1)
        [now] = row["current"]["list"]
        self.assertEqual(kind(now), "security")


class ResidueMembershipTest(unittest.TestCase):
    """A site's residue is a site's own people (review round 2, item 1)."""

    def test_an_assigned_employee_given_no_day_at_all_is_in_shortdays(self):
        # Forty people all demanding a four-day week and one register to work:
        # most of them get nothing, and nothing is the worst case of not
        # reaching four days rather than an absence of one.
        people = [
            employee(f"p{i:02d}", [SERVICE], demands=("ba:jobdemand_fourdaysweek",))
            for i in range(40)
        ]
        row = plan([(1, REGISTER)], people, FLAT)
        worked = {s["p"] for s in row["shifts"]}
        idle = [r for r in row["shortDays"] if r["days"] == 0]
        self.assertTrue(idle, "somebody with no day at all is still short of four")
        self.assertEqual(idle[0]["want"], 4)
        self.assertNotIn(idle[0]["p"], worked)
        # Everybody the plan left short is listed, whether or not they worked.
        self.assertEqual(len(row["shortDays"]), 40 - len(
            [p for p in worked if p is not None
             and sum(1 for s in row["shifts"] if s["p"] == p) >= 4]
        ))

    def sites_with_an_unplaceable_bench(self):
        """Two shops, and one unassigned guard no shop has a locker for."""
        return plan_sites(
            [
                dict(items=[(1, REGISTER)], hourly={h: 1 for h in range(24)}, number=12),
                dict(items=[(2, REGISTER)], hourly={h: 1 for h in range(24)}, number=14),
            ],
            [
                employee("here12", [SERVICE], number=12,
                         demands=("ba:jobdemand_fulltime",)),
                employee("here14", [SERVICE], number=14,
                         demands=("ba:jobdemand_fulltime",)),
                employee("spare", [GUARD], here=False,
                         demands=("ba:jobdemand_fulltime",)),
            ],
        )

    def test_a_bench_member_nobody_took_belongs_to_no_site(self):
        rows = self.sites_with_an_unplaceable_bench()
        self.assertEqual(len(rows), 2)
        for row in rows:
            named_here = {person["id"] for person in row["people"]}
            self.assertNotIn("spare", named_here)
            self.assertEqual(row["bench"], [])
            for entry in row["shortHours"] + row["shortDays"]:
                self.assertNotEqual(row["people"][entry["p"]]["id"], "spare")

    def test_each_site_names_its_own_person_and_nobody_else(self):
        first, second = self.sites_with_an_unplaceable_bench()
        self.assertEqual([p["id"] for p in first["people"]], ["here12"])
        self.assertEqual([p["id"] for p in second["people"]], ["here14"])
        self.assertEqual(first["headcount"][SERVICE]["have"], 1)
        self.assertEqual(second["headcount"][SERVICE]["have"], 1)
        # The guard is on nobody's payroll here, so nobody is told to keep them
        # busy and no hiring line counts them as cover they already have.
        self.assertNotIn(GUARD, first["headcount"])


class OddSaveTest(unittest.TestCase):
    """Nothing about one site may take the whole board down (item 2)."""

    def test_a_product_that_is_not_a_name_is_ignored(self):
        row = plan(
            [(1, REGISTER)],
            [employee("a", [SERVICE])],
            FLAT,
            products=[{"not": "a name"}, 7, None, "ba:itemname_classiccheapmaleclothing"],
        )
        self.assertIsNotNone(row)
        self.assertTrue(row["shifts"])

    SPECS = [
        dict(items=[(1, REGISTER)], hourly={h: 1 for h in range(24)}, number=12),
        dict(items=[(2, REGISTER)], hourly={h: 1 for h in range(24)}, number=14),
    ]

    def test_a_site_that_cannot_be_planned_says_so_and_costs_nothing_else(self):
        people = [employee("a", [SERVICE], number=12), employee("b", [SERVICE], number=14)]
        real = ba_dashboard._plan_site

        def explode(save, names, business, building, *args, **kw):
            if business["key"].endswith("#12"):
                raise ValueError("this site is broken")
            return real(save, names, business, building, *args, **kw)

        with unittest.mock.patch.object(ba_dashboard, "_plan_site", explode):
            rows = plan_sites(self.SPECS, people)
        # Two sites in, two rows out: the failed one is named, not dropped.
        self.assertEqual(len(rows), 2)
        broken, whole = rows
        self.assertEqual(
            broken,
            {"key": site_key((STREET, 12)), "name": "HART. Test 12",
             "typeSlug": SHOP, "failed": True},
        )
        self.assertNotIn("failed", whole)
        self.assertTrue(whole["shifts"])

    def test_a_site_that_fails_after_placing_people_leaves_no_trace(self):
        """The failure has to be transactional: it rosters, then falls over."""
        people = [
            employee("b", [SERVICE], number=14, demands=("ba:jobdemand_fulltime",)),
            employee("free", [SERVICE], here=False,
                     demands=("ba:jobdemand_fulltime",)),
        ]
        real = ba_dashboard._current_roster

        def explode(save, building, stations):
            if building["StreetNumber"] == 12:
                raise ValueError("this site's schedule is malformed")
            return real(save, building, stations)

        with unittest.mock.patch.object(ba_dashboard, "_current_roster", explode):
            rows = plan_sites(self.SPECS, people)
        self.assertEqual(len(rows), 2)
        broken, whole = rows
        self.assertTrue(broken["failed"])

        # Site 12 placed the bench employee before it fell over. Site 14 has to
        # see a week and a bench that never heard of site 12.
        alone = plan_sites([self.SPECS[1]], people)[0]
        self.assertEqual(
            json.dumps(whole["shifts"], sort_keys=True),
            json.dumps(alone["shifts"], sort_keys=True),
        )
        self.assertEqual(
            [p["id"] for p in whole["people"]], [p["id"] for p in alone["people"]]
        )
        self.assertIn("free", {p["id"] for p in whole["people"]})
        self.assertEqual(whole["headcount"][SERVICE]["have"],
                         alone["headcount"][SERVICE]["have"])


class HashSeedTest(unittest.TestCase):
    """Set iteration order follows the hash seed, so two seeds must agree."""

    SCRIPT = """
import json, sys
sys.path.insert(0, %r)
sys.path.insert(0, %r)
import test_staffing as t
row = t.plan(
    [(1, t.REGISTER), (2, t.REGISTER), (8, t.CLEAN_STATION), (9, t.LOCKER)],
    [t.employee("p%%d" %% i, [t.SERVICE, t.CLEANING, t.GUARD], wage=20 + i,
                demands=("ba:jobdemand_fulltime",) if i %% 2 else
                        ("ba:jobdemand_fulltime", "ba:jobdemand_fivedaysweek"))
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
