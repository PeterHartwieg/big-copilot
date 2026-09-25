"""The Staff page's payload: candidates, hiring and the office default (issue #89).

Synthetic fixtures only, never a real save, and invented names throughout:
candidate names are save data like employee names.
"""
import collections
import json
import os
import subprocess
import sys
import unittest

from ba_dashboard import (
    ASSIGN_SKILLS,
    FULL_TIME,
    JOB_DEMANDS,
    OVERWORK_HOURS,
    _candidates,
    _character,
    _hiring,
    _hourly,
    _office_always_on,
    _office_runs,
    _office_staffing,
    _staff,
    _staffing,
    site_key,
)
from ba_save import Names, Save

import test_staffing as ts
from test_factory_staffing import People, hand_rows

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HERE = os.path.dirname(os.path.abspath(__file__))
SERVICE = "ba:skill_customerservice"
CLEANING = "ba:skill_cleaning"
GUARD = "ba:skill_securityguard"
LAWYER = "ba:skill_lawyer"
WORKER = "ba:skill_factoryworker"
LAW = "ba:businesstype_lawfirm"
COMPUTER = "ba:itemname_computer"
STREET = ts.STREET


def new_layout(cid, name, skills, wage=20.0, **extra):
    """A candidate or employee as current saves hold one: characterData."""
    return dict({
        "id": cid,
        "hourlyWage": wage,
        "characterData": {
            "name": name,
            "ageInDays": 1800,
            "skills": {"$items": [{"name": s, "value": v} for s, v in skills]},
        },
        "demands": {"$items": []},
    }, **extra)


def old_layout(cid, name, skills, wage=20.0, **extra):
    """The same as an older save holds it: name, age and skills on the instance."""
    return dict({
        "id": cid,
        "hourlyWage": wage,
        "name": name,
        "ageInDays": 1800,
        "skills": {"$items": [{"name": s, "value": v} for s, v in skills]},
        "demands": {"$items": []},
    }, **extra)


def save_of(root):
    root = dict(root)
    root.setdefault("EmployeeInstances", {"$items": []})
    root.setdefault("gameVariables", {"daysPerYear": 60})
    return Save(root, {}, "test.hsg")


# --- one reader for a character -------------------------------------------------

class CharacterTest(unittest.TestCase):
    def test_both_layouts_read_the_same(self):
        save = save_of({})
        skills = [(SERVICE, 71.4), (CLEANING, 20.0)]
        for build in (new_layout, old_layout):
            char = _character(save, build("c1", "Ada Brandt", skills))
            self.assertEqual(char["name"], "Ada Brandt")
            self.assertEqual(char["ageDays"], 1800)
            self.assertEqual(char["skills"], [{"skill": SERVICE, "level": 71.4},
                                              {"skill": CLEANING, "level": 20.0}])

    def test_staff_names_people_in_an_older_save(self):
        save = save_of({"EmployeeInstances": {"$items": [
            old_layout("e1", "Bo Lindqvist", [(SERVICE, 60.0)]),
            new_layout("e2", "Cy Moreau", [(CLEANING, 44.6)]),
        ]}})
        _by_addr, staff = _staff(save, Names({}))
        self.assertEqual([p["name"] for p in staff], ["Bo Lindqvist", "Cy Moreau"])
        self.assertEqual([p["skill"] for p in staff], [SERVICE, CLEANING])
        self.assertEqual([p["level"] for p in staff], [60.0, 45.0])

    def test_a_character_with_no_name_still_reads_as_a_question_mark(self):
        save = save_of({"EmployeeInstances": {"$items": [
            {"id": "e1", "characterData": {"skills": {"$items": []}}}]}})
        _by_addr, staff = _staff(save, Names({}))
        self.assertEqual(staff[0]["name"], "?")


# --- candidates -----------------------------------------------------------------

def info(hours=71, headhunter="hh1", board=False, agency=None):
    return {"hoursUntilExpiring": hours, "sourceHeadhunterId": headhunter,
            "fromJobBoard": board, "sourceAddress": agency}


class CandidatesTest(unittest.TestCase):
    def test_both_layouts_give_the_same_row(self):
        rows = []
        for build in (new_layout, old_layout):
            save = save_of({"CandidateEmployeeInstances": {"$items": [
                build("c1", "Ada Brandt", [(CLEANING, 31.2), (SERVICE, 88.4)], wage=26.5,
                      demands={"$items": ["ba:jobdemand_noweekends", "ba:jobdemand_fulltime"]},
                      candidateInfo=info()),
            ]}})
            rows.append(_candidates(save))
        self.assertEqual(rows[0], rows[1])
        self.assertEqual(rows[0], [{
            "id": "c1", "name": "Ada Brandt", "age": 30,
            "skill": SERVICE, "level": 88,
            "skills": [{"skill": SERVICE, "level": 88}, {"skill": CLEANING, "level": 31}],
            "wage": 26.5,
            "demands": ["ba:jobdemand_fulltime", "ba:jobdemand_noweekends"],
            "hoursLeft": 71, "source": "headhunter",
        }])

    def test_hired_and_declined_offers_are_left_out(self):
        save = save_of({"CandidateEmployeeInstances": {"$items": [
            old_layout("c1", "Ada Brandt", [(SERVICE, 50.0)], hired=True),
            old_layout("c2", "Bo Lindqvist", [(SERVICE, 50.0)], declined=True),
            old_layout("c3", "Cy Moreau", [(SERVICE, 50.0)], hired=False, declined=False),
        ]}})
        self.assertEqual([r["id"] for r in _candidates(save)], ["c3"])

    def test_no_candidate_list_is_an_empty_list(self):
        self.assertEqual(_candidates(save_of({})), [])

    def test_best_skill_first_then_the_cheapest_then_the_id(self):
        save = save_of({"CandidateEmployeeInstances": {"$items": [
            new_layout("c4", "D", [(SERVICE, 80.0)], wage=30.0),
            new_layout("c2", "B", [(SERVICE, 80.0)], wage=20.0),
            new_layout("c1", "A", [(SERVICE, 80.0)], wage=20.0),
            new_layout("c3", "C", [(SERVICE, 95.0)], wage=90.0),
        ]}})
        self.assertEqual([r["id"] for r in _candidates(save)], ["c3", "c1", "c2", "c4"])

    def test_where_each_came_from(self):
        save = save_of({"CandidateEmployeeInstances": {"$items": [
            new_layout("c1", "A", [(SERVICE, 50.0)], candidateInfo=info()),
            new_layout("c2", "B", [(SERVICE, 49.0)],
                       candidateInfo=info(headhunter=None, board=True)),
            new_layout("c3", "C", [(SERVICE, 48.0)], candidateInfo=info(
                headhunter=None, agency={"streetName": STREET, "streetNumber": 3})),
            new_layout("c4", "D", [(SERVICE, 47.0)], candidateInfo=info(headhunter=None)),
        ]}})
        self.assertEqual([r["source"] for r in _candidates(save)],
                         ["headhunter", "jobboard", "agency", "other"])

    def test_age_needs_the_year_length(self):
        save = Save({"CandidateEmployeeInstances": {"$items": [
            new_layout("c1", "A", [(SERVICE, 50.0)])]}}, {}, "test.hsg")
        self.assertIsNone(_candidates(save)[0]["age"])


# --- hiring weeks on a shop -----------------------------------------------------

def slots_point_at_open_entries(test, row, hire):
    """Every hire week's slot is a p: null entry of the same plan, same hours."""
    for week in hire["hireWeeks"]:
        test.assertEqual(week["hours"], sum(s["t"] - s["f"] for s in week["slots"]))
        test.assertEqual(week["days"], len({s["d"] for s in week["slots"]}))
        test.assertLessEqual(week["hours"], FULL_TIME[1])
        per_day = collections.Counter()
        for slot in week["slots"]:
            entry = row["shifts"][slot["shift"]]
            test.assertIsNone(entry["p"])
            test.assertEqual((entry["d"], entry["f"], entry["t"]),
                             (slot["d"], slot["f"], slot["t"]))
            test.assertEqual(row["stations"][entry["s"]]["id"], slot["station"])
            test.assertEqual(row["stations"][entry["s"]]["skill"], week["skill"])
            per_day[slot["d"]] += slot["t"] - slot["f"]
        test.assertTrue(all(h <= OVERWORK_HOURS for h in per_day.values()))
    # Every open entry is somebody's week, once.
    used = [s["shift"] for w in hire["hireWeeks"] for s in w["slots"]]
    test.assertEqual(len(used), len(set(used)))
    test.assertEqual(sorted(used), [i for i, e in enumerate(row["shifts"]) if e["p"] is None])


def weeks_match_headcount(test, row, hire):
    counts = collections.Counter(w["skill"] for w in hire["hireWeeks"])
    for skill, entry in row["headcount"].items():
        test.assertEqual(counts.get(skill, 0), entry["hire"], skill)


class ShopHireWeeksTest(unittest.TestCase):
    def setUp(self):
        # Two registers and a cleaning station and a locker around the clock,
        # with one person to staff them: most of the week is hiring.
        self.row = ts.plan(
            [(1, ts.REGISTER), (2, ts.REGISTER), (8, ts.CLEAN_STATION), (9, ts.LOCKER)],
            [ts.employee("p1", [SERVICE], demands=("ba:jobdemand_fulltime",))],
            ts.FLAT,
        )

    def test_demand_plan_weeks_are_the_hire_count(self):
        hire = self.row["_hire"]
        self.assertTrue(hire["hireWeeks"])
        weeks_match_headcount(self, self.row, hire)
        slots_point_at_open_entries(self, self.row, hire)

    def test_full_cover_weeks_are_the_hire_count(self):
        full = dict(self.row["fullCover"], stations=self.row["stations"])
        hire = full["_hire"]
        self.assertTrue(hire["hireWeeks"])
        weeks_match_headcount(self, full, hire)
        slots_point_at_open_entries(self, full, hire)

    def test_fullest_weeks_first_within_a_role(self):
        by_skill = collections.defaultdict(list)
        for week in self.row["_hire"]["hireWeeks"]:
            by_skill[week["skill"]].append(week["hours"])
        for hours in by_skill.values():
            self.assertEqual(hours, sorted(hours, reverse=True))


class SpareTest(unittest.TestCase):
    def test_spare_is_the_own_staff_given_no_hours(self):
        # One register open four hours a day needs one person; five are here.
        row = ts.plan(
            [(1, ts.REGISTER)],
            [ts.employee(f"p{i}", [SERVICE]) for i in range(5)],
            ts.FLAT, opens=((8, 12),),
        )
        hire = row["_hire"]
        worked = {row["people"][s["p"]]["id"] for s in row["shifts"] if s["p"] is not None}
        self.assertTrue(worked)
        self.assertTrue(hire["spare"])
        self.assertFalse(set(hire["spare"]) & worked)
        self.assertEqual(set(hire["spare"]) | worked, {f"p{i}" for i in range(5)})
        self.assertEqual(hire["spare"], sorted(hire["spare"]))

    def test_a_role_the_plan_does_not_plan_is_not_spare(self):
        # Nothing measured: the demand plan is cover alone, so the cashier it
        # gives no hours is not offered away.
        row = ts.plan(
            [(1, ts.REGISTER), (8, ts.CLEAN_STATION)],
            [ts.employee("p1", [SERVICE]), ts.employee("p2", [CLEANING])],
            ts.FLAT, weeks=0,
        )
        self.assertNotIn("p1", row["_hire"]["spare"])

    def test_bench_is_whom_the_plan_counts_on(self):
        row = ts.plan(
            [(1, ts.REGISTER)],
            [ts.employee("p1", [SERVICE], here=False)],
            ts.FLAT, opens=((8, 12),),
        )
        self.assertEqual(row["_hire"]["bench"], ["p1"])
        self.assertEqual(row["_hire"]["spare"], [])


# --- factories ------------------------------------------------------------------

class FactoryHireTest(unittest.TestCase):
    def test_both_sizings_weeks_are_the_hire_count(self):
        rows = hand_rows([("beer", 2, 24, 12, 24)], People().add(2))
        for mode in ("cap", "dem"):
            [row] = rows[mode]
            hire = row["_hire"]
            self.assertEqual(len(hire["hireWeeks"]), row["headcount"]["hire"], mode)
            self.assertTrue(all(w["skill"] == WORKER for w in hire["hireWeeks"]))
            slots_point_at_open_entries(self, row, hire)

    def test_the_week_stays_on_the_payload_row(self):
        rows = hand_rows([("beer", 1, 24, 24, 24)], People().add(4))
        [row] = rows["cap"]
        self.assertTrue(row["shifts"])
        self.assertTrue(all(st["id"] for st in row["stations"]))
        # Four people for 168 hours: some of them are spare, with ids.
        worked = {row["people"][s["p"]]["id"] for s in row["shifts"] if s["p"] is not None}
        self.assertEqual(len(row["_hire"]["spare"]), row["headcount"]["spare"])
        self.assertFalse(set(row["_hire"]["spare"]) & worked)


# --- offices --------------------------------------------------------------------

class OfficeRunsTest(unittest.TestCase):
    ALL_DAY = [[[0, 24]] for _ in range(7)]
    DAY = set(range(8, 22))
    CLOCK = set(range(24))

    def test_always_on_is_three_at_a_door_of_fifty_and_fewer_below(self):
        self.assertEqual(_office_always_on(10, 50), 3)
        self.assertEqual(_office_always_on(10, 25), 2)  # 1.5 rounds half up
        self.assertEqual(_office_always_on(10, 10), 1)  # 0.6
        self.assertEqual(_office_always_on(10, 5), 1)   # 0.3, at least one
        self.assertEqual(_office_always_on(10, 0), 1)   # capacity unknown
        self.assertEqual(_office_always_on(10, 100), 6)
        self.assertEqual(_office_always_on(2, 50), 2)   # never more than there are

    def test_the_week_of_every_office(self):
        # Six computers, door 50, open around the clock: three always on;
        # every computer 8-22 on weekdays; three (half) on weekends, which the
        # always-on three already are.
        runs, always = _office_runs(6, self.ALL_DAY, 50)
        self.assertEqual(always, 3)
        for index in range(6):
            for wd in range(7):
                if index < 3:
                    want = self.CLOCK
                elif wd in (6, 0):
                    want = set()
                else:
                    want = self.DAY
                self.assertEqual(runs[index][wd], want, (index, wd))

    def test_weekend_half_counts_the_always_on_ones(self):
        # Eight computers, door 20: one always on, four on weekends 8-22.
        runs, always = _office_runs(8, self.ALL_DAY, 20)
        self.assertEqual(always, 1)
        self.assertEqual(runs[0][6], self.CLOCK)
        for index in (1, 2, 3):
            self.assertEqual(runs[index][6], self.DAY)
            self.assertEqual(runs[index][0], self.DAY)
        for index in range(4, 8):
            self.assertEqual(runs[index][6], set())
            self.assertEqual(runs[index][2], self.DAY)

    def test_hours_the_office_is_shut_are_left_out(self):
        shut_weekends = [[] if wd in (6, 0) else [[9, 17]] for wd in range(7)]
        runs, _always = _office_runs(2, shut_weekends, 50)
        self.assertEqual(runs[0][1], set(range(9, 17)))  # always-on, clipped
        self.assertEqual(runs[1][1], set(range(9, 17)))
        self.assertEqual(runs[0][6], set())

    def test_no_opening_hours_in_the_save_are_not_clipped(self):
        runs, _always = _office_runs(1, [[] for _ in range(7)], 50)
        self.assertEqual(runs[0][3], self.CLOCK)


def office_registration(computers, opens, number=10, shifts=()):
    schedule = []
    for wd in range(7):
        schedule.append({
            "day": 7 if wd == 0 else wd,
            "isOpen": bool(opens[wd]),
            "openingHourSlots": {"$items": [{"startingHour": a, "endingHour": b}
                                            for a, b in opens[wd]]},
            "workShifts": {"$items": [s for s in shifts if s.get("wd") == wd]},
        })
    return {
        "BusinessName": "Halden Law", "businessTypeName": LAW,
        "StreetName": STREET, "StreetNumber": number, "RentedByPlayer": True,
        "creationDay": 1, "customerCapacity": 50,
        "orderHistory": {"$items": []},
        "itemInstances": {"$items": [{"$v": {"id": f"pc{i}", "itemName": COMPUTER}}
                                     for i in range(computers)]},
        "scheduleDays": {"$items": schedule},
    }


def office_rows(computers, opens, employees, claimed=()):
    reg = office_registration(computers, opens)
    save = save_of({"EmployeeInstances": {"$items": employees},
                    "BuildingRegistrations": {"$items": [reg]}})
    business = {"key": site_key((STREET, 10)), "name": "Halden Law", "status": "office",
                "typeSlug": LAW, "basket": 388.0, "staff": 0}
    _by_addr, staff = _staff(save, Names({}))
    grids = _hourly(save, [reg], [business], {}, {COMPUTER},
                    {p["id"]: p["skill"] for p in staff}, Names({}))
    return save, business, _office_staffing(save, Names({}), [business], grids, staff,
                                            set(claimed))


def lawyer(eid, here=True):
    return {
        "id": eid, "hourlyWage": 140.0,
        "characterData": {"name": eid.upper(),
                          "skills": {"$items": [{"name": LAWYER, "value": 60.0}]}},
        "assignedAddress": {"streetName": STREET, "streetNumber": 10} if here else None,
        "demands": {"$items": ["ba:jobdemand_fulltime"]},
    }


class OfficeStaffingTest(unittest.TestCase):
    WEEKDAYS_8_20 = [[[8, 20]] for _ in range(7)]

    def covered(self, row):
        """Station-hours the plan puts on, staffed or open, per (station id, wd)."""
        out = collections.defaultdict(set)
        for s in row["shifts"]:
            out[(row["stations"][s["s"]]["id"], s["d"])].update(range(s["f"], s["t"]))
        return out

    def test_every_computer_every_open_hour_on_weekdays(self):
        # Door 50: three computers always on, clipped to the 8-20 the office
        # opens; the fourth weekdays only.
        _save, _b, [row] = office_rows(4, self.WEEKDAYS_8_20, [lawyer("l1"), lawyer("l2")])
        self.assertEqual(row["alwaysOn"], 3)
        covered = self.covered(row)
        for i in range(4):
            for wd in (1, 2, 3, 4, 5):
                self.assertEqual(covered[(f"pc{i}", wd)], set(range(8, 20)))
            for wd in (6, 0):
                self.assertEqual(covered[(f"pc{i}", wd)], set(range(8, 20)) if i < 3 else set())
        self.assertEqual(row["computers"], 4)
        self.assertFalse(row["openAllHours"])

    def test_round_the_clock(self):
        _save, _b, [row] = office_rows(5, [[[0, 24]] for _ in range(7)], [lawyer("l1")])
        covered = self.covered(row)
        for i in range(5):
            for wd in range(7):
                if i < 3:
                    want = set(range(24))
                else:
                    want = set() if wd in (6, 0) else set(range(8, 22))
                self.assertEqual(covered[(f"pc{i}", wd)], want, (i, wd))

    def test_hire_weeks_are_the_hire_count(self):
        _save, _b, [row] = office_rows(4, self.WEEKDAYS_8_20, [lawyer("l1")])
        hire = row["_hire"]
        self.assertEqual(len(hire["hireWeeks"]), row["headcount"][LAWYER]["hire"])
        self.assertTrue(hire["hireWeeks"])
        slots_point_at_open_entries(self, row, hire)

    def test_the_bench_is_drawn_unless_a_shop_counts_on_them(self):
        people = [lawyer("l1"), lawyer("b1", here=False)]
        _save, _b, [row] = office_rows(2, self.WEEKDAYS_8_20, people)
        self.assertEqual(row["_hire"]["bench"], ["b1"])
        _save, _b, [row] = office_rows(2, self.WEEKDAYS_8_20, people, claimed={"b1"})
        self.assertEqual(row["_hire"]["bench"], [])


# --- the hiring key -------------------------------------------------------------

def registration(number, btype, name, items=()):
    return {
        "BusinessName": name, "businessTypeName": btype, "RentedByPlayer": True,
        "StreetName": STREET, "StreetNumber": number,
        "itemInstances": {"$items": [{"$v": {"id": f"i{number}-{k}", "itemName": slug}}
                                     for k, slug in enumerate(items)]},
    }


def biz(number, btype, name, status, staff=1):
    return {"key": site_key((STREET, number)), "name": name, "typeSlug": btype,
            "status": status, "staff": staff}


class HiringTest(unittest.TestCase):
    def setUp(self):
        regs = [
            registration(1, "ba:businesstype_clothingstore", "Shop A",
                         items=("ba:itemname_cheapcoffeemachine",)),
            registration(2, "ba:businesstype_coffeeshop", "Cafe B"),
            registration(3, "ba:businesstype_headquarters", "HQ"),
            registration(4, "ba:businesstype_warehouse", "Depot"),
            registration(5, "ba:businesstype_empty", "Nothing"),
        ]
        employees = [
            new_layout("e1", "Ada Brandt", [(SERVICE, 50.0)],
                       assignedAddress={"streetName": STREET, "streetNumber": 1}),
            new_layout("e2", "Bo Lindqvist", [(CLEANING, 70.0), (SERVICE, 20.0)],
                       assignedAddress=None,
                       demands={"$items": ["ba:jobdemand_nonights"]}),
        ]
        self.save = save_of({"EmployeeInstances": {"$items": employees},
                             "BuildingRegistrations": {"$items": regs},
                             "Happiness": 70})
        self.businesses = [
            biz(1, "ba:businesstype_clothingstore", "Shop A", "retail"),
            biz(2, "ba:businesstype_coffeeshop", "Cafe B", "retail", staff=0),
            biz(3, "ba:businesstype_headquarters", "HQ", "overhead"),
            biz(4, "ba:businesstype_warehouse", "Depot", "overhead"),
            biz(5, "ba:businesstype_empty", "Nothing", "support"),
        ]
        self.hiring = _hiring(self.save, self.businesses, [], {}, [])

    def site(self, name):
        return next(s for s in self.hiring["sites"] if s["name"] == name)

    def test_one_site_per_business_in_business_order_without_empty_ones(self):
        self.assertEqual([s["name"] for s in self.hiring["sites"]],
                         ["Shop A", "Cafe B", "HQ", "Depot"])
        self.assertEqual([s["kind"] for s in self.hiring["sites"]],
                         ["shop", "shop", "hq", "warehouse"])
        self.assertEqual(self.site("Shop A")["address"], {"street": STREET, "number": 1})

    def test_accepts_follows_the_game_s_assign_check(self):
        self.assertEqual(self.site("Shop A")["accepts"], [SERVICE, GUARD, CLEANING])
        self.assertEqual(self.site("Cafe B")["accepts"], [SERVICE, CLEANING])
        self.assertNotIn(GUARD, self.site("Cafe B")["accepts"])
        self.assertEqual(self.site("Depot")["accepts"], ["ba:skill_deliverydriver"])

    def test_hq_and_warehouse_are_not_planned(self):
        for name in ("HQ", "Depot"):
            self.assertFalse(self.site(name)["planned"])
            self.assertEqual(self.site(name)["plans"], {})
        self.assertTrue(self.site("Shop A")["planned"])

    def test_new_is_a_site_nobody_works(self):
        self.assertFalse(self.site("Shop A")["new"])
        self.assertTrue(self.site("Cafe B")["new"])

    def test_site_and_company_facts(self):
        self.assertTrue(self.site("Shop A")["facts"]["ba:jobdemand_coffeemachine"])
        self.assertFalse(self.site("Cafe B")["facts"]["ba:jobdemand_coffeemachine"])
        self.assertTrue(self.site("Cafe B")["facts"]["ba:jobdemand_cleanworkplace"])
        self.assertTrue(self.hiring["company"]["ba:jobdemand_peacefulworkenvironment"])
        self.assertFalse(self.hiring["company"]["ba:jobdemand_bronzehealthinsurance"])

    def test_every_demand_is_classified(self):
        self.assertEqual(set(self.hiring["demandKinds"]), set(JOB_DEMANDS))
        self.assertEqual(self.hiring["demandKinds"]["ba:jobdemand_nonights"], "schedule")
        self.assertEqual(self.hiring["demandKinds"]["ba:jobdemand_coffeemachine"], "site")
        self.assertEqual(self.hiring["demandKinds"]["ba:jobdemand_goldhealthinsurance"], "company")

    def test_bench_and_the_people_it_names(self):
        self.assertEqual(self.hiring["bench"], ["e2"])
        person = self.hiring["people"]["e2"]
        self.assertEqual(person["skills"], [{"skill": CLEANING, "level": 70},
                                            {"skill": SERVICE, "level": 20}])
        self.assertIsNone(person["site"])
        self.assertEqual(person["demands"], ["ba:jobdemand_nonights"])

    def test_every_assign_table_type_is_one_the_board_knows(self):
        known = ts.ba_dashboard.RETAIL_TYPES | ts.ba_dashboard.OFFICE_TYPES | \
            ts.ba_dashboard.COST_CENTRE_TYPES
        self.assertFalse(set(ASSIGN_SKILLS) - known)


class HiringFromPlansTest(unittest.TestCase):
    def test_shop_plans_carry_both_variants_and_the_rows_lose_the_private_part(self):
        employees = [ts.employee("p1", [SERVICE])]
        rows = ts.plan_sites([dict(items=[(1, ts.REGISTER), (8, ts.CLEAN_STATION)],
                                   hourly=ts.FLAT)], employees)
        reg = dict(ts.registration([(1, ts.REGISTER)], ts.FLAT), RentedByPlayer=True)
        save = save_of({"EmployeeInstances": {"$items": employees},
                        "BuildingRegistrations": {"$items": [reg]}})
        business = dict(ts.business(), staff=1)
        hiring = _hiring(save, [business], rows, {}, [])
        [site] = hiring["sites"]
        self.assertEqual(sorted(site["plans"]), ["demand", "full"])
        self.assertNotIn("_hire", rows[0])
        self.assertNotIn("_hire", rows[0]["fullCover"])
        json.dumps(hiring)


class HashSeedTest(unittest.TestCase):
    SCRIPT = """
import json, sys
sys.path.insert(0, %r)
sys.path.insert(0, %r)
import test_staff_hire as t
import test_staffing as ts
row = ts.plan(
    [(1, ts.REGISTER), (2, ts.REGISTER), (8, ts.CLEAN_STATION), (9, ts.LOCKER)],
    [ts.employee("p%%d" %% i, [ts.SERVICE, ts.CLEANING, ts.GUARD], wage=20 + i,
                 here=i %% 3 != 0,
                 demands=("ba:jobdemand_fulltime", "ba:jobdemand_nonights"))
     for i in range(4)],
    ts.FLAT,
)
_s, _b, offices = t.office_rows(5, [[[8, 20]] for _ in range(7)],
                                [t.lawyer("l%%d" %% i, here=i %% 2 == 0) for i in range(4)])
cands = t._candidates(t.save_of({"CandidateEmployeeInstances": {"$items": [
    t.new_layout("c%%d" %% i, "N%%d" %% i, [(ts.SERVICE, 50.0), (ts.CLEANING, 50.0)],
                 demands={"$items": ["ba:jobdemand_nonights", "ba:jobdemand_fulltime",
                                     "ba:jobdemand_sofa"]})
    for i in range(6)]}}))
print(json.dumps([row["_hire"], row["fullCover"]["_hire"], offices, cands], sort_keys=True))
"""

    def test_two_hash_seeds_give_the_same_payload(self):
        script = self.SCRIPT % (ROOT, HERE)
        made = []
        for seed in ("0", "12345"):
            env = dict(os.environ, PYTHONHASHSEED=seed)
            made.append(subprocess.run([sys.executable, "-c", script], capture_output=True,
                                       text=True, check=True, env=env).stdout)
        self.assertEqual(made[0], made[1])
        self.assertTrue(json.loads(made[0])[0]["hireWeeks"])


if __name__ == "__main__":
    unittest.main()
