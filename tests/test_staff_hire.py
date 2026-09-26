"""The Staff page's payload: candidates, hiring and the office default (issue #89).

Synthetic fixtures only, never a real save, and invented names throughout:
candidate names are save data like employee names.
"""
import collections
import json
import math
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
    _factory_staffing,
    _office_staffing,
    _staff,
    _staffing,
    site_key,
)
from ba_save import Names, Save

import ba_dashboard
import test_staffing as ts
from test_factory_staffing import FACTORY as FACTORY_ADDR, Bare, People, hand_factory, hand_rows

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


class CompanyFactsTest(unittest.TestCase):
    def test_an_insurance_tier_on_offer_still_needs_the_hire_added_to_a_plan(self):
        """A hire joins no HR manager plan: "plan" says one offers the tier."""
        manager = new_layout("m1", "Mara", [("ba:skill_hrmanager", 80.0)])
        save = save_of({"EmployeeInstances": {"$items": [manager]}, "Happiness": 40,
                        "hrManagerPlans": {"$items": [{"assignedEmployeeId": "m1",
                                                       "healthInsurancePlan": {"planType": 1}}]}})
        facts = ba_dashboard._company_facts(save)
        self.assertEqual(facts["ba:jobdemand_bronzehealthinsurance"], "plan")
        self.assertEqual(facts["ba:jobdemand_silverhealthinsurance"], "plan")
        self.assertIs(facts["ba:jobdemand_goldhealthinsurance"], False)
        self.assertIs(facts["ba:jobdemand_peacefulworkenvironment"], False)


class RecruitingTest(unittest.TestCase):
    def test_headhunters_recruiting_now_by_skill(self):
        plan = lambda who, skill, on=True: {"assignedEmployeeId": who, "isRecruiting": on,  # noqa: E731
                                            "skillRecruiting": skill}
        save = save_of({"headhunterPlans": {"$items": [
            plan("h1", LAWYER), plan("h2", LAWYER), plan("h3", SERVICE, on=False),
            plan(None, CLEANING), plan("h4", GUARD)]}})
        self.assertEqual(ba_dashboard._recruiting(save), {GUARD: 1, LAWYER: 2})
        self.assertEqual(ba_dashboard._recruiting(save_of({})), {})


class StationFactsTest(unittest.TestCase):
    """A desk or chair demand is met by the furniture of the station a person
    works (the game's assignedWorkStationItems), not by the site holding such
    an item anywhere (Peter's in-game test, 25 September 2026)."""

    def reg(self):
        item = lambda iid, name, parent=None: {"$v": dict({"id": iid, "itemName": "ba:itemname_" + name},  # noqa: E731
                                                            **({"parentId": parent} if parent else {}))}
        return {"itemInstances": {"$items": [
            item("d1", "officedesk1"), item("pc1", "computer", "d1"), item("ch1", "officechair", "d1"),
            item("d2", "officedesk2left"), item("pc2", "computer", "d2"), item("ch2", "officechair2", "d2"),
            item("m2", "computermonitor", "d2"),
        ]}}

    def test_groups_follow_the_parent_to_the_desk_and_back_down(self):
        groups = ba_dashboard._station_groups(save_of({}), self.reg())
        self.assertEqual(groups["pc1"], {"ba:itemname_officedesk1", "ba:itemname_computer",
                                         "ba:itemname_officechair"})
        self.assertIn("ba:itemname_computermonitor", groups["pc2"])
        self.assertIs(groups["pc2"], groups["m2"])

    def test_each_station_lists_the_demands_its_desk_meets(self):
        facts = ba_dashboard._station_facts(save_of({}), self.reg(), ["pc1", "pc2"])
        self.assertIn("ba:jobdemand_seatedatofficedesk1", facts["pc1"])
        self.assertNotIn("ba:jobdemand_seatedatofficedesk2", facts["pc1"])
        self.assertNotIn("ba:jobdemand_seatedatofficechair2", facts["pc1"])
        for slug in ("ba:jobdemand_seatedatofficedesk2", "ba:jobdemand_seatedatofficechair2",
                     "ba:jobdemand_hascomputermonitor"):
            self.assertIn(slug, facts["pc2"])

    def test_an_office_plan_keeps_a_desk_demand_at_a_desk_that_meets_it(self):
        """Two computers, one at an executive desk; the lawyer who asks for one
        works it, and each keeps the computer they are on now."""
        reg = office_registration(2, [[[8, 20]] for _ in range(7)])
        reg["itemInstances"]["$items"] += [
            {"$v": {"id": "desk0", "itemName": "ba:itemname_officedesk1"}},
            {"$v": {"id": "desk1", "itemName": "ba:itemname_officedesk2left"}},
        ]
        for holder in reg["itemInstances"]["$items"]:
            item = holder["$v"]
            if item["id"] in ("pc0", "pc1"):
                item["parentId"] = "desk" + item["id"][-1]
        # The one who asks sorts last, so the other is on the roster first and
        # would take the executive desk if desk fit ranked below that.
        wants = dict(lawyer("z"), demands={"$items": ["ba:jobdemand_seatedatofficedesk2"]})
        people = [lawyer("a"), wants]
        save = save_of({"EmployeeInstances": {"$items": people},
                        "BuildingRegistrations": {"$items": [reg]}})
        business = {"key": site_key((STREET, 10)), "name": "Halden Law", "status": "office",
                    "typeSlug": LAW, "basket": 388.0, "staff": 2}
        _by_addr, staff = _staff(save, Names({}))
        grids = _hourly(save, [reg], [business], {}, {COMPUTER},
                        {p["id"]: p["skill"] for p in staff}, Names({}))
        [row] = _office_staffing(save, Names({}), [business], grids, staff, set())
        on = collections.defaultdict(set)
        for s in row["shifts"]:
            if s["p"] is not None:
                on[row["people"][s["p"]]["id"]].add(row["stations"][s["s"]]["id"])
        self.assertEqual(on["z"], {"pc1"})

    def test_the_desk_goes_to_the_one_who_asks_within_the_same_tier(self):
        """sol's case: of the site's own people, the one whose executive-desk
        demand the slot meets takes it; somebody already given hours still
        comes first, and nobody from the bench is put ahead of the site's own."""
        person = lambda pid, desks, addr=("s", 1): {  # noqa: E731
            "id": pid, "name": pid, "skills": {LAWYER}, "wage": 1.0, "addr": addr,
            "band": (30, 50), "days": None, "weekendsOff": False, "blackouts": [],
            "nocleaning": False, "desks": desks, "home": set()}
        EXEC = [("ba:itemname_officedesk2left", "ba:itemname_officedesk2right")]
        plain, asks = person("a", []), person("z", EXEC)
        outsider = person("o", EXEC, addr=None)
        groups = {"pc1": {"ba:itemname_officedesk2left", "ba:itemname_computer"}}
        slot = {"wd": 1, "station": "pc1", "skill": LAWYER, "from": 8, "to": 15, "kind": "serve"}
        fresh = ba_dashboard._fresh_state
        rank = ba_dashboard._placement_rank
        # Neither started yet: the one who asks takes the executive desk.
        here = {"rostered": set(), "flex": {}, "groups": groups}
        self.assertLess(rank(asks, fresh(), slot, here), rank(plain, fresh(), slot, here))
        # Somebody from the bench who asks for it never goes ahead of the site's own.
        self.assertLess(rank(plain, fresh(), slot, here), rank(outsider, fresh(), slot, here))
        # Already given hours: the roster tier still comes first.
        here = {"rostered": {"a"}, "flex": {}, "groups": groups}
        self.assertLess(rank(plain, fresh(), slot, here), rank(asks, fresh(), slot, here))

    def test_a_desk_demand_ranks_nobody_where_the_furniture_is_unknown(self):
        """Opus's case: at a shop (no desk groups) somebody with a desk demand
        is not put first for every slot."""
        person = lambda pid, desks: {  # noqa: E731
            "id": pid, "name": pid, "skills": {SERVICE}, "wage": 1.0, "addr": ("s", 1),
            "band": (30, 50), "days": None, "weekendsOff": False, "blackouts": [],
            "nocleaning": False, "desks": desks, "home": set()}
        slot = {"wd": 1, "station": 1, "skill": SERVICE, "from": 8, "to": 15, "kind": "serve"}
        here = {"rostered": {"a"}, "flex": {}, "groups": {}}
        rank = ba_dashboard._placement_rank
        state = lambda h: dict(ba_dashboard._fresh_state(), hours=h)  # noqa: E731
        self.assertLess(rank(person("a", []), state(12.0), slot, here),
                        rank(person("z", [("ba:itemname_officedesk2left",)]), state(0.0), slot, here))

    def test_a_site_with_no_plan_lists_the_desks_it_has(self):
        """The headquarters has no plan rows: its desks are its groups' roots."""
        hq = {"BusinessName": "HQ", "businessTypeName": "ba:businesstype_headquarters",
              "RentedByPlayer": True, "StreetName": STREET, "StreetNumber": 3,
              "itemInstances": {"$items": [
                  {"$v": {"id": "d1", "itemName": "ba:itemname_officedesk2left"}},
                  {"$v": {"id": "c1", "itemName": "ba:itemname_computer", "parentId": "d1"}},
                  {"$v": {"id": "d2", "itemName": "ba:itemname_officedesk1"}}]}}
        save = save_of({"BuildingRegistrations": {"$items": [hq]}})
        business = {"key": site_key((STREET, 3)), "name": "HQ", "typeSlug": "ba:businesstype_headquarters",
                    "status": "overhead", "staff": 1}
        [site] = _hiring(save, [business], [], {}, [])["sites"]
        self.assertIn("ba:jobdemand_seatedatofficedesk2", site["stations"]["d1"])
        self.assertNotIn("ba:jobdemand_seatedatofficedesk2", site["stations"].get("d2", []))


def shop_hiring(weeks, opens=((0, 24),)):
    """One staffed shop through _staffing() and _hiring(), `weeks` of reports behind it."""
    reg = ts.registration([(1, ts.REGISTER), (8, ts.CLEAN_STATION)], ts.FLAT, weeks=weeks, opens=opens)
    save = Save({"EmployeeInstances": {"$items": [ts.employee("p1", [SERVICE])]},
                 "BuildingRegistrations": {"$items": [dict(reg, RentedByPlayer=True)]}},
                {}, "t.hsg")
    business = dict(ts.business(), staff=1)
    _by_addr, staff = _staff(save, ts.LABELS)
    grids = _hourly(save, [reg], [business], ts.STATIONS, set(),
                    {p["id"]: p["skill"] for p in staff}, ts.LABELS)
    rows = _staffing(save, ts.LABELS, [business], grids, staff, 0.55)
    return rows[0], _hiring(save, [business], rows, {}, [])["sites"][0]


class UnreadShopTest(unittest.TestCase):
    """Peter (26 September 2026): "Staff the hours it's open, never change
    opening." A shop with no hour read is hired for by every station the hours
    it opens now, and nothing opens it longer. Evil Genius opened more hours
    with no hour read yet and was hired nobody for them."""

    def test_a_shop_open_10_to_18_with_no_data_is_staffed_10_to_18_only(self):
        row, site = shop_hiring(weeks=1, opens=((10, 18),))
        self.assertFalse(site["new"])
        self.assertEqual(sorted(site["plans"]), ["open"])
        plan = row["openCover"]
        self.assertIs(plan["openAllHours"], False)
        self.assertEqual(plan["open"], [[[10, 18]] for _ in range(7)])
        # Every station, the register and the cleaning station, 10 to 18 each day.
        per = collections.defaultdict(set)
        for s in plan["shifts"]:
            self.assertGreaterEqual(s["f"], 10)
            self.assertLessEqual(s["t"], 18)
            per[(s["s"], s["d"])].update(range(s["f"], s["t"]))
        self.assertEqual(len(per), 2 * 7)
        self.assertTrue(all(hours == set(range(10, 18)) for hours in per.values()))
        # The hires it needs, and each slot on an open entry of that plan.
        weeks = site["plans"]["open"]["hireWeeks"]
        self.assertTrue(weeks)
        for week in weeks:
            for slot in week["slots"]:
                entry = plan["shifts"][slot["shift"]]
                self.assertIsNone(entry["p"])
                self.assertEqual((entry["d"], entry["f"], entry["t"]), (slot["d"], slot["f"], slot["t"]))
        self.assertNotIn("_hire", plan)

    def test_a_shop_with_complete_data_keeps_its_demand_plan(self):
        """Its open-hours plan is full cover of the hours it opens, for where
        the player runs full cover; the page never has full cover itself."""
        row, site = shop_hiring(weeks=2, opens=((10, 18),))
        self.assertEqual(sorted(site["plans"]), ["demand", "open"])
        self.assertIs(row["openCover"]["complete"], True)
        self.assertIs(row["openCover"]["openAllHours"], False)
        self.assertTrue(all(10 <= s["f"] and s["t"] <= 18 for s in row["openCover"]["shifts"]))

    def test_without_complete_data_every_unread_open_hour_gets_every_station(self):
        """Six days: some hours scaled or measured, the rest read nothing.
        Every open hour with nothing read is staffed in full; the rest keep
        the demand plan's need."""
        reg = ts.registration([(1, ts.REGISTER), (2, ts.REGISTER), (8, ts.CLEAN_STATION)],
                              {h: 1 for h in range(10, 14)}, weeks=2, opens=((8, 20),))
        save = Save({"EmployeeInstances": {"$items": [ts.employee("p1", [SERVICE])]},
                     "BuildingRegistrations": {"$items": [dict(reg, RentedByPlayer=True)]},
                     "Day": 7}, {}, "t.hsg")
        business = dict(ts.business(), staff=1)
        _by_addr, staff = _staff(save, ts.LABELS)
        grids = _hourly(save, [reg], [business], ts.STATIONS, set(),
                        {p["id"]: p["skill"] for p in staff}, ts.LABELS)
        [row] = _staffing(save, ts.LABELS, [business], grids, staff, 0.55)
        site = _hiring(save, [business], [row], {}, [])["sites"][0]
        self.assertEqual(sorted(site["plans"]), ["open"])
        self.assertIs(row["openCover"]["complete"], False)
        cover = collections.defaultdict(set)
        for s in row["openCover"]["shifts"]:
            if not s.get("k"):
                cover[(s["d"], s["s"])].update(range(s["f"], s["t"]))
        basis = row["basis"][SERVICE]
        read = []
        for wd in range(7):
            for hour in range(8, 20):
                staffed = sum(hour in cover[(wd, st)] for st in (0, 1))
                if basis[wd][hour] == "none":
                    self.assertEqual(staffed, 2, (wd, hour))
                else:
                    # The demand plan's own need, with its troughs bridged.
                    self.assertGreaterEqual(staffed, row["need"][SERVICE][wd][hour], (wd, hour))
                    read.append(staffed)
            self.assertFalse(any(h in cover[(wd, st)] for st in (0, 1) for h in (7, 20, 23)))
        # Some hours were read, and they are not all staffed in full.
        self.assertTrue(read)
        self.assertLess(min(read), 2)
        self.assertTrue(any(b == "none" for day in basis for b in day[8:20]))


class OpenPlanBenchTest(unittest.TestCase):
    def test_one_unassigned_person_is_promised_to_one_site(self):
        """The open-hours plans draw on the bench like full cover's, and
        record it: two new shops, one unassigned person, one promise."""
        spec = lambda n: dict(items=[(1, ts.REGISTER)], hourly={}, weeks=0, number=n,  # noqa: E731
                              opens=((8, 20),))
        rows = ts.plan_sites([spec(12), spec(14)], [ts.employee("free", [SERVICE], here=False)])
        promised = [row["openCover"]["_hire"]["bench"] for row in rows]
        self.assertEqual(sum(b.count("free") for b in promised), 1)
        for row in rows:
            ids = set(row["openCover"]["_hire"]["bench"]) | set(row["fullCover"]["_hire"]["bench"])
            if "free" in ids:
                self.assertIn("free", row["openCover"]["_hire"]["bench"])
        self.assertIn("free", ba_dashboard._bench_claimed(rows))


class UnstaffedTest(unittest.TestCase):
    """Staff with no hours (Peter's live game, 26 September 2026): Evil Genius 2
    kept its four cashiers assigned with no hours in BizMan; the plan fills the
    register with them and hires nobody, so the page said nothing."""

    ROW = {"stations": [{"id": 1, "skill": SERVICE}, {"id": 8, "skill": CLEANING}],
           "people": [{"id": "p1"}, {"id": "p2"}, {"id": "c1"}],
           "current": {"list": [{"d": d, "s": 1, "f": 0, "t": 24, "p": 2} for d in range(7)]}}

    def test_own_cashiers_with_no_hours_are_named_with_the_hours_nobody_works(self):
        plan = [{"d": d, "s": 0, "f": 0, "t": 12, "p": 0} for d in range(4)]
        plan += [{"d": d, "s": 0, "f": 12, "t": 24, "p": 1} for d in range(4)]
        plan += [{"d": d, "s": 1, "f": 0, "t": 24, "p": 2} for d in range(7)]
        plan += [{"d": 5, "s": 0, "f": 0, "t": 12, "p": None}]  # a hire's: not counted
        gap = ba_dashboard._unstaffed(self.ROW, plan, {"p1", "p2", "c1"})
        self.assertEqual(gap, {"hours": 96, "roles": [{"skill": SERVICE, "hours": 96, "idle": 2}]})

    def test_a_small_gap_or_nobody_idle_is_not_named(self):
        small = [{"d": 1, "s": 0, "f": 8, "t": 14, "p": 0}]
        self.assertIsNone(ba_dashboard._unstaffed(self.ROW, small, {"p1"}))
        # The same person already works the register some of the week: not idle.
        row = dict(self.ROW, current={"list": [{"d": 0, "s": 0, "f": 8, "t": 12, "p": 0}]})
        more = [{"d": d, "s": 0, "f": 8, "t": 20, "p": 0} for d in range(4)]
        self.assertIsNone(ba_dashboard._unstaffed(row, more, {"p1"}))
        # Somebody who is not the site's own (a bench member the plan draws on).
        self.assertIsNone(ba_dashboard._unstaffed(self.ROW, more, set()))

    def test_another_register_of_the_role_is_not_a_gap(self):
        """Somebody on register 2 where the plan uses register 1 covers the hour."""
        row = {"stations": [{"id": 1, "skill": SERVICE}, {"id": 2, "skill": SERVICE}],
               "people": [{"id": "p1"}, {"id": "x"}],
               "current": {"list": [{"d": d, "s": 1, "f": 0, "t": 24, "p": 1} for d in range(7)]}}
        plan = [{"d": d, "s": 0, "f": 0, "t": 12, "p": 0} for d in range(7)]
        self.assertIsNone(ba_dashboard._unstaffed(row, plan, {"p1", "x"}))
        # One of two planned cashiers at an hour a single register is worked:
        # the other is the gap, one person-hour each such hour.
        row2 = dict(row, people=[{"id": "p1"}, {"id": "x"}, {"id": "p2"}])
        plan2 = [{"d": d, "s": 0, "f": 0, "t": 12, "p": 0} for d in range(7)]
        plan2 += [{"d": d, "s": 1, "f": 0, "t": 12, "p": 2} for d in range(7)]
        gap = ba_dashboard._unstaffed(row2, plan2, {"p1", "p2", "x"})
        self.assertEqual(gap, {"hours": 84, "roles": [{"skill": SERVICE, "hours": 84, "idle": 2}]})

    def test_somebody_working_another_role_or_in_training_is_not_idle(self):
        # c1 cleans all week now; the plan puts them on the register too.
        plan = [{"d": d, "s": 0, "f": 0, "t": 12, "p": 2} for d in range(4)]
        self.assertIsNone(ba_dashboard._unstaffed(self.ROW, plan, {"p1", "p2", "c1"}))
        plan = [{"d": d, "s": 0, "f": 0, "t": 12, "p": 0} for d in range(4)]
        self.assertIsNone(ba_dashboard._unstaffed(self.ROW, plan, {"p1"}, training={"p1"}))

    def test_the_hiring_payload_carries_it(self):
        # On the site, per plan the Staffing block writes (demand, full cover).
        _row, site = shop_hiring(weeks=2)
        for mode in ("demand", "full"):
            gap = site["unstaffed"][mode]
            self.assertGreaterEqual(gap["hours"], ba_dashboard.UNSTAFFED_MIN_HOURS)
            self.assertEqual([(r["skill"], r["idle"]) for r in gap["roles"]], [(SERVICE, 1)])

    def test_an_idle_person_whose_own_hours_are_covered_is_not_counted(self):
        """p2's planned hours are all worked by somebody else now: not idle."""
        row = {"stations": [{"id": 1, "skill": SERVICE}, {"id": 2, "skill": SERVICE}],
               "people": [{"id": "p1"}, {"id": "p2"}, {"id": "x"}],
               "current": {"list": [{"d": d, "s": 1, "f": 12, "t": 24, "p": 2} for d in range(7)]}}
        plan = [{"d": d, "s": 0, "f": 0, "t": 12, "p": 0} for d in range(7)]
        plan += [{"d": d, "s": 1, "f": 12, "t": 24, "p": 1} for d in range(7)]
        gap = ba_dashboard._unstaffed(row, plan, {"p1", "p2", "x"})
        self.assertEqual(gap, {"hours": 84, "roles": [{"skill": SERVICE, "hours": 84, "idle": 1}]})

    def test_an_office_is_not_listed(self):
        """An office has no Staffing block to write its week from."""
        _save, _b, [row] = office_rows(2, [[[8, 20]] for _ in range(7)], [lawyer("l1")])
        business = {"key": site_key((STREET, 10)), "name": "Halden Law", "status": "office",
                    "typeSlug": LAW, "basket": 388.0, "staff": 1}
        save = save_of({"EmployeeInstances": {"$items": [lawyer("l1")]},
                        "BuildingRegistrations": {"$items": [office_registration(2, [[[8, 20]] for _ in range(7)])]}})
        [site] = _hiring(save, [business], [], {}, [row])["sites"]
        self.assertNotIn("unstaffed", site)


class NoOpeningHoursTest(unittest.TestCase):
    def test_a_shop_the_game_opens_no_hour_has_no_plan(self):
        row, site = shop_hiring(weeks=0, opens=())
        self.assertEqual(site["plans"], {})
        self.assertIs(site["noHours"], True)
        self.assertNotIn("openCover", row)


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

    def test_spare_skills_are_the_roles_they_are_spare_in(self):
        # A cashier who also cleans is spare as a cashier only: the plan never
        # puts customer service on a cleaning station, so a move keeps them there.
        row = ts.plan(
            [(1, ts.REGISTER), (8, ts.CLEAN_STATION)],
            [ts.employee(f"p{i}", [SERVICE, CLEANING]) for i in range(5)],
            ts.FLAT, opens=((8, 12),),
        )
        hire = row["_hire"]
        self.assertTrue(hire["spare"])
        self.assertEqual(sorted(hire["spareSkills"]), hire["spare"])
        for pid in hire["spare"]:
            self.assertEqual(hire["spareSkills"][pid], [SERVICE])

    def test_nobody_in_training_is_counted_on_from_the_bench(self):
        trainee = dict(ts.employee("p1", [SERVICE], here=False),
                       trainingSession={"skill": SERVICE, "startDay": 30})
        row = ts.plan([(1, ts.REGISTER)], [trainee], ts.FLAT, opens=((8, 12),))
        self.assertEqual(row["_hire"]["bench"], [])
        self.assertTrue(row["_hire"]["hireWeeks"], "the plan hires for those hours")

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
        self.assertEqual(row["_hire"]["spareSkills"], {pid: [WORKER] for pid in row["_hire"]["spare"]})

    def test_an_idle_line_s_machines_are_machines_in_the_table(self):
        # Sized for demand, the wine line runs no hours: its machine has no
        # plan entry but is listed as a factory worker's station.
        [row] = hand_rows([("beer", 1, 24, 24, 24), ("wine", 1, 24, 0, 24)], People().add(2))["dem"]
        wine = next(i for i, st in enumerate(row["stations"]) if st["id"] == "wine-0")
        self.assertEqual(row["stations"][wine]["skill"], WORKER)
        self.assertFalse(any(s["s"] == wine for s in row["shifts"]))

    def test_the_schedule_as_it_stands_ships_with_the_drivers(self):
        # A driver's shift on the van and a worker's on a machine: both in
        # `current`, so the Staff page can keep the driver's when it replaces
        # the week.
        people = People().add(2)
        reg = {"StreetName": FACTORY_ADDR[0], "StreetNumber": FACTORY_ADDR[1], "RentedByPlayer": True,
               "scheduleDays": [{"day": 1, "workShifts": [
                   {"startingHour": 6, "endingHour": 14, "itemInstanceId": "van-1", "employeeId": "d1", "type": 1},
                   {"startingHour": 6, "endingHour": 14, "itemInstanceId": "beer-0", "employeeId": "w00", "type": 1},
               ]}]}
        save = Bare(people)
        save.root["BuildingRegistrations"] = [reg]
        business = [{"key": site_key(FACTORY_ADDR), "name": "Brewery", "status": "support"}]
        [row] = _factory_staffing(save, None, business, hand_factory([("beer", 1, 24, 24, 24)]),
                                  people.staff)["cap"]
        now = [(row["stations"][s["s"]]["id"], (row["people"][s["p"]] or {}).get("id"), s["d"], s["f"], s["t"])
               for s in row["current"]["list"]]
        self.assertEqual(sorted(now), [("beer-0", "w00", 1, 6, 14), ("van-1", "d1", 1, 6, 14)])
        # The van is no station of the plan's: no skill, and no plan entry on it.
        van = next(i for i, st in enumerate(row["stations"]) if st["id"] == "van-1")
        self.assertIsNone(row["stations"][van]["skill"])
        self.assertFalse(any(s["s"] == van for s in row["shifts"]))


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

    def test_a_hire_gets_a_full_week_and_nobody_here_works_less(self):
        """Peter's in-game test (25 September 2026): the lawyers already there
        filled every day but one, and the hires got that one day, 7 to 14
        hours each. Now the open hours are spread over the week by swapping
        days with the staff, and each hire takes a full-time week, with
        nobody here planned under the 40 hours the game has them on."""
        for n in (14, 20):
            people = [dict(lawyer(f"l{i:02d}"), assignedWeeklyHours=40) for i in range(n)]
            _save, _b, [row] = office_rows(10, [[[0, 24]] for _ in range(7)], people)
            weeks = row["_hire"]["hireWeeks"]
            self.assertTrue(weeks, n)
            self.assertEqual(len(weeks), row["headcount"][LAWYER]["hire"])
            for week in weeks:
                self.assertGreaterEqual(week["hours"], FULL_TIME[0], (n, week["hours"]))
                self.assertGreaterEqual(week["days"], 3, n)
            open_hours = sum(s["t"] - s["f"] for s in row["shifts"] if s["p"] is None)
            self.assertLessEqual(len(weeks), math.ceil(open_hours / FULL_TIME[0]), n)
            worked = collections.Counter()
            for s in row["shifts"]:
                if s["p"] is not None:
                    worked[s["p"]] += s["t"] - s["f"]
            self.assertEqual(len(worked), n)
            self.assertGreaterEqual(min(worked.values()), 40, n)
            slots_point_at_open_entries(self, row, row["_hire"])

    def test_the_bench_is_drawn_unless_a_shop_counts_on_them(self):
        people = [lawyer("l1"), lawyer("b1", here=False)]
        _save, _b, [row] = office_rows(2, self.WEEKDAYS_8_20, people)
        self.assertEqual(row["_hire"]["bench"], ["b1"])
        _save, _b, [row] = office_rows(2, self.WEEKDAYS_8_20, people, claimed={"b1"})
        self.assertEqual(row["_hire"]["bench"], [])
        trainee = dict(lawyer("b1", here=False), trainingSession={"skill": LAWYER, "startDay": 30})
        _save, _b, [row] = office_rows(2, self.WEEKDAYS_8_20, [lawyer("l1"), trainee])
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
        self.assertIs(self.hiring["company"]["ba:jobdemand_bronzehealthinsurance"], False)

    def test_every_demand_is_classified(self):
        self.assertEqual(set(self.hiring["demandKinds"]), set(JOB_DEMANDS))
        self.assertEqual(self.hiring["demandKinds"]["ba:jobdemand_nonights"], "schedule")
        self.assertEqual(self.hiring["demandKinds"]["ba:jobdemand_coffeemachine"], "site")
        self.assertEqual(self.hiring["demandKinds"]["ba:jobdemand_goldhealthinsurance"], "company")
        self.assertEqual(self.hiring["demandKinds"]["ba:jobdemand_seatedatofficedesk2"], "station")
        # A desk demand is never a site fact: it is met at a station or not.
        self.assertNotIn("ba:jobdemand_seatedatofficedesk2", self.site("Shop A")["facts"])



    def test_bench_and_the_people_it_names(self):
        self.assertEqual(self.hiring["bench"], ["e2"])
        person = self.hiring["people"]["e2"]
        self.assertEqual(person["skills"], [{"skill": CLEANING, "level": 70},
                                            {"skill": SERVICE, "level": 20}])
        self.assertIsNone(person["site"])
        self.assertEqual(person["demands"], ["ba:jobdemand_nonights"])
        self.assertFalse(person["training"])

    def test_someone_in_training_says_so(self):
        e3 = new_layout("e3", "Cy Moreau", [(SERVICE, 40.0)], assignedAddress=None,
                        trainingSession={"skill": SERVICE, "startDay": 30})
        save = save_of(dict(self.save.root, EmployeeInstances={"$items": [e3]}))
        hiring = _hiring(save, self.businesses, [], {}, [])
        self.assertTrue(hiring["people"]["e3"]["training"])

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
        # Never full cover, whose write opens a shop 0 to 24: the open-hours plan.
        self.assertEqual(sorted(site["plans"]), ["demand", "open"])
        self.assertNotIn("_hire", rows[0])
        self.assertNotIn("_hire", rows[0]["fullCover"])
        self.assertNotIn("_hire", rows[0]["openCover"])
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
