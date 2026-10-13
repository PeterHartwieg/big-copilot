"""While a plan waits on a hire, nobody here is moved off the hours they cover (issue #446).

A schedule write sends only the entries of people already at the site; a
hire's stay empty until the player adds them. A plan that moved somebody off
an hour they work now and gave it to a hire would, written before the hire
comes, leave that hour with fewer people than the game has. Synthetic
fixtures only.
"""
import collections
import itertools
import unittest
import unittest.mock

import ba_dashboard
from ba_save import Names
from tests import test_staffing as ts
from tests.test_staff_hire import COMPUTER, LAW, STREET, lawyer, office_registration, save_of, site_key

SKILL = "ba:skill_graphicdesigner"
OPEN = (9, 21)


def person(pid, band=(30, 50), **fields):
    return dict({"id": pid, "name": pid.upper(), "skills": {SKILL}, "wage": 20.0,
                 "addr": ("St", 1), "demands": [], "band": band, "days": None,
                 "weekendsOff": False, "blackouts": [], "nocleaning": False,
                 "training": False, "now": 0, "home": set(), "desks": []}, **fields)


def entry(pid, wd, station="pc0", start=OPEN[0], end=OPEN[1]):
    return {"wd": wd, "station": station, "from": start, "to": end, "employee": pid,
            "kind": "serve"}


def place(people, current, keep, stations=1, wanted=None):
    """_place_week() on `stations` computers wanted OPEN every day (or only `wanted` ones)."""
    posts = [{"id": f"pc{i}", "skill": SKILL, "rate": 1, "name": f"PC{i}"} for i in range(stations)]
    grid = {"roles": [{"skill": SKILL, "label": "x"}], "stations": posts}
    staffed = range(stations) if wanted is None else wanted
    runs = {i: [set(range(*OPEN)) for _ in range(7)] for i in staffed}
    need = {SKILL: {"need": [[len(runs) if OPEN[0] <= h < OPEN[1] else 0 for h in range(24)]
                             for _ in range(7)],
                    "basis": [["test"] * 24 for _ in range(7)], "stations": runs}}
    state = {p["id"]: ba_dashboard._fresh_state() for p in people}
    week = ba_dashboard._place_week(grid, need, ba_dashboard.ALL_DAY_OPEN, [], people,
                                    {p["id"]: p for p in people}, {"key": "k", "name": "T"},
                                    [], state, current=current, keep=keep)
    return week, need


OTHER = "ba:skill_lawyer"
WEEKDAYS = (0, 1, 2, 3, 4)


def place_roles(people, current, keep, roles, bench=()):
    """_place_week() on several roles: {skill: {station id: {weekday: (from, to)}}}.

    `bench` are people of `people` not assigned here (addr None), offered as
    the unassigned bench. Goes through _place_week(), blackout re-cut and all.
    """
    posts, need = [], {}
    for skill, stations in roles.items():
        runs = {}
        for index, (sid, days) in enumerate(stations.items()):
            posts.append({"id": sid, "skill": skill, "rate": 1, "name": sid})
            runs[index] = [set(range(*days[wd])) if wd in days else set() for wd in range(7)]
        need[skill] = {"need": [[sum(h in runs[i][wd] for i in runs) for h in range(24)]
                                for wd in range(7)],
                       "basis": [["test"] * 24 for _ in range(7)], "stations": runs}
    grid = {"roles": [{"skill": skill, "label": skill} for skill in roles], "stations": posts}
    state = {p["id"]: ba_dashboard._fresh_state() for p in people}
    return ba_dashboard._place_week(grid, need, ba_dashboard.ALL_DAY_OPEN, [], list(people),
                                    {p["id"]: p for p in people}, {"key": "k", "name": "T"},
                                    [p for p in people if p["id"] in bench], state,
                                    current=current, keep=keep)


def workers(week):
    """(people here with hours, bench members drawn, hires)."""
    here = {s["employee"] for s in week["shifts"]
            if s["employee"] is not None and not s.get("fromBench")}
    bench = {s["employee"] for s in week["shifts"] if s.get("fromBench")}
    return here, bench, hires(week)


def hours_of(week):
    out = collections.Counter()
    for s in week["shifts"]:
        if s["employee"] is not None:
            out[s["employee"]] += s["to"] - s["from"]
    return out


def fewer(week, current):
    """Person-hours the plan, written before its hires come, leaves short of now."""
    now, here, planned = (collections.Counter() for _ in range(3))
    for row in current:
        for hour in range(row["from"], row["to"]):
            now[row["wd"], hour] += 1
    for s in week["shifts"]:
        for hour in range(s["from"], s["to"]):
            planned[s["wd"], hour] += 1
            if s["employee"] is not None and not s.get("fromBench"):
                here[s["wd"], hour] += 1
    return sum(max(0, min(now[k], planned[k]) - here[k]) for k in now)


def hires(week):
    return sum(entry["hire"] for entry in week["headcount"].values())


def days_of(week, pid):
    return sorted(s["wd"] for s in week["shifts"] if s["employee"] == pid)


class KeepCurrentTest(unittest.TestCase):

    def test_the_plain_week_moves_somebody_off_their_days(self):
        """The case the issue found: one computer open 09-21 every day and one
        full-timer on it Thursday to Sunday. The plain placement fills their
        week from Monday and hands Thursday to Sunday to the hire, so written
        before the hire comes, three days have nobody where they have one now."""
        current = [entry("a", wd) for wd in (3, 4, 5, 6)]
        week, _need = place([person("a")], current, keep=False)
        self.assertGreater(fewer(week, current), 0)
        self.assertNotEqual(days_of(week, "a"), [3, 4, 5, 6])

    def test_while_a_hire_waits_they_keep_the_hours_they_cover(self):
        current = [entry("a", wd) for wd in (3, 4, 5, 6)]
        plain, _ = place([person("a")], current, keep=False)
        week, need = place([person("a")], current, keep=True)
        self.assertEqual(fewer(week, current), 0)
        self.assertEqual(days_of(week, "a"), [3, 4, 5, 6])
        # The plan still covers every hour it wants, with as many hires.
        self.assertEqual(hires(week), hires(plain))
        self.assertEqual(week["need"], need)
        self.assertEqual(sum(s["to"] - s["from"] for s in week["shifts"]), 7 * 12)

    def test_a_week_that_needs_nobody_new_is_the_plain_one(self):
        # Two people for one computer: nobody is waited on, so nothing is held.
        current = [entry("a", wd) for wd in (3, 4, 5, 6)]
        people = [person("a"), person("b")]
        plain, _ = place(people, current, keep=False)
        week, _ = place(people, current, keep=True)
        self.assertEqual(hires(plain), 0)
        self.assertEqual(week["shifts"], plain["shifts"])

    def test_an_entry_on_a_computer_the_plan_leaves_empty_moves_to_one_it_staffs(self):
        # Two computers, the plan staffs the first only; they sit at the second.
        current = [entry("a", wd, station="pc1") for wd in (3, 4, 5, 6)]
        week, _ = place([person("a")], current, keep=True, stations=2, wanted=[0])
        self.assertEqual(fewer(week, current), 0)
        mine = [s for s in week["shifts"] if s["employee"] == "a"]
        self.assertEqual(sorted(s["wd"] for s in mine), [3, 4, 5, 6])
        self.assertEqual({s["station"] for s in mine}, {"pc0"})

    def test_never_more_people_waited_on_and_never_fewer_people_in_an_hour(self):
        """Across small sites with people on rotated days now: the held week is
        kept only where it waits on no more people than the plain one, and where
        it is kept, no hour has fewer people than now."""
        for stations, crew, days in itertools.product(
                (1, 2, 3), (1, 2, 3, 4), ((0, 1, 2, 3), (3, 4, 5, 6), (0, 2, 4, 6))):
            people = [person(f"p{i}") for i in range(crew)]
            current, seen = [], set()
            for i in range(crew):
                for wd in ((d + i) % 7 for d in days):
                    if (i % stations, wd) not in seen:
                        seen.add((i % stations, wd))
                        current.append(entry(f"p{i}", wd, station=f"pc{i % stations}"))
            with self.subTest(stations=stations, crew=crew, days=days):
                plain, _ = place(people, current, keep=False, stations=stations)
                week, _ = place(people, current, keep=True, stations=stations)
                self.assertLessEqual(hires(week), hires(plain))
                if hires(week) == hires(plain):
                    self.assertEqual(fewer(week, current), 0)


def without_keep():
    """The placer as it was before issue #446, for a test to show the drop."""
    real = ba_dashboard._place_week

    def plain(*args, **kwargs):
        return real(*args, **dict(kwargs, keep=False))
    return unittest.mock.patch.object(ba_dashboard, "_place_week", plain)


def staffed_days(plan_row):
    return sorted(s["d"] for s in plan_row["shifts"] if s["p"] is not None)


class CallersTest(unittest.TestCase):
    """The plans a write replaces the week with hold: a shop's three, an office's demand plan."""

    def shop(self):
        crew = [ts.employee("a", [ts.SERVICE], demands=(ts.FULLTIME,))]
        shifts = [{"wd": wd, "employeeId": "a", "itemInstanceId": 1, "startingHour": 9,
                   "endingHour": 21, "type": 1} for wd in (3, 4, 5, 6)]
        return ts.plan([(1, ts.REGISTER)], crew, {h: (12 if 9 <= h < 21 else 0) for h in range(24)},
                       opens=((9, 21),), shifts=shifts)

    def office(self):
        # One computer measured busy 08-16 every day; the one lawyer works it
        # Thursday to Sunday now.
        employees = [lawyer("l0")]
        employees[0]["demands"] = {"$items": []}
        shifts = [dict(wd=wd, employeeId="l0", itemInstanceId="pc0", startingHour=8, endingHour=16,
                       type=1) for wd in (3, 4, 5, 6)]
        reg = office_registration(1, [[[8, 16]] for _ in range(7)], shifts=shifts)
        reg["customerCapacity"] = 50
        reg["orderHistory"] = {"$items": [
            {"dayNumber": day, "hourReports": {"$items": [{"hour": h, "customers": 1}
                                                          for h in range(8, 16)]}}
            for day in range(1, 15)]}
        save = save_of({"EmployeeInstances": {"$items": employees},
                        "BuildingRegistrations": {"$items": [reg]}})
        business = {"key": site_key((STREET, 10)), "name": "Test Law", "status": "office",
                    "typeSlug": LAW, "basket": 100, "staff": 1}
        _, staff = ba_dashboard._staff(save, Names({}))
        grids = ba_dashboard._hourly(save, [reg], [business], {}, {COMPUTER},
                                     {p["id"]: p["skill"] for p in staff}, Names({}))
        [row] = ba_dashboard._office_staffing(save, Names({}), [business], grids, staff)
        self.assertTrue(row["demandBased"])
        return row

    def test_a_shop_keeps_its_cashier_on_their_days(self):
        row = self.shop()
        for plan_row in (row, row["fullCover"], row["openCover"]):
            self.assertTrue({3, 4, 5, 6} <= set(staffed_days(plan_row)), staffed_days(plan_row))
        with without_keep():
            plain = self.shop()
        self.assertFalse({3, 4, 5, 6} <= set(staffed_days(plain)), staffed_days(plain))

    def test_an_office_keeps_its_lawyer_on_their_days(self):
        self.assertTrue({3, 4, 5, 6} <= set(staffed_days(self.office())))
        with without_keep():
            plain = self.office()
        self.assertFalse({3, 4, 5, 6} <= set(staffed_days(plain)), staffed_days(plain))


class FewestPeopleTest(unittest.TestCase):
    """Review round 1 on PR #459: holding entries never costs the owner's rule,
    the fewest people for the needed hours (spares go to 0 h, nobody surplus is
    kept by trimming a colleague, a held week hires nobody more)."""

    def assertNoMorePeople(self, plain, week):
        here, bench, hired = workers(week)
        here0, bench0, hired0 = workers(plain)
        self.assertLessEqual(here, here0)
        self.assertEqual(bench, bench0)
        self.assertLessEqual(hired, hired0)

    def test_a_role_with_no_short_hour_is_left_as_planned(self):
        # Role A waits on a hire; role B needs one person and has two now. The
        # plain week gives b1 the whole of B and leaves b2 spare at 0 h; holding
        # b2's Wednesday and Thursday would cut b1 to 24 h to keep a surplus person.
        roles = {SKILL: {"pc0": {wd: OPEN for wd in range(7)}},
                 OTHER: {"desk": {wd: OPEN for wd in (0, 1, 2, 3)}}}
        people = [person("a"), person("b1", skills={OTHER}), person("b2", skills={OTHER})]
        current = ([entry("a", wd) for wd in (3, 4, 5, 6)]
                   + [entry("b1", wd, station="desk") for wd in (0, 1)]
                   + [entry("b2", wd, station="desk") for wd in (2, 3)])
        plain = place_roles(people, current, False, roles)
        week = place_roles(people, current, True, roles)
        self.assertEqual(hours_of(plain)["b2"], 0)
        self.assertEqual(hours_of(week)["b2"], 0)
        self.assertEqual(hours_of(week)["b1"], hours_of(plain)["b1"])
        self.assertNoMorePeople(plain, week)
        # Role A's own drop is still held.
        self.assertEqual(sorted(s["wd"] for s in week["shifts"] if s["employee"] == "a"),
                         [3, 4, 5, 6])

    def test_nobody_the_plain_week_leaves_spare_is_given_hours(self):
        # Three weekday-only people for one station 09-21 every day: the plain
        # week is two of them and a hire for the weekend.
        roles = {SKILL: {"pc0": {wd: OPEN for wd in range(7)}}}
        people = [person(f"e{i}", weekendsOff=True) for i in range(3)]
        current = [entry("e0", 0), entry("e0", 1), entry("e1", 2), entry("e1", 3), entry("e2", 4)]
        plain = place_roles(people, current, False, roles)
        week = place_roles(people, current, True, roles)
        self.assertNoMorePeople(plain, week)

    def test_a_bench_member_is_never_traded_for_a_hire(self):
        # A weekday-only employee, a part-timer and a weekday-only bench member
        # who keeps the mornings free.
        roles = {SKILL: {"pc0": {wd: OPEN for wd in range(7)}}}
        people = [person("e", weekendsOff=True), person("p", band=(10, 30)),
                  person("z", weekendsOff=True, blackouts=[(0, 12)], addr=None)]
        current = [entry("e", 3), entry("e", 4), entry("p", 2), entry("p", 5)]
        plain = place_roles(people, current, False, roles, bench={"z"})
        week = place_roles(people, current, True, roles, bench={"z"})
        self.assertEqual(workers(plain)[1:], ({"z"}, 0))
        self.assertNoMorePeople(plain, week)

    def test_sweep_across_roles(self):
        """Small one- and two-role sites with people on rotated days now: a
        held week never puts anybody to work the plain week leaves at 0 h,
        never draws other bench members and never hires more."""
        shapes = [(0, 1, 2, 3), (3, 4, 5, 6), (0, 2, 4, 6), (1, 2)]
        for crew, second, days, weekends_off in itertools.product(
                (1, 2, 3), (0, 1, 2), shapes, (False, True)):
            roles = {SKILL: {"pc0": {wd: OPEN for wd in range(7)},
                             "pc1": {wd: OPEN for wd in WEEKDAYS}}}
            if second:
                roles[OTHER] = {"desk": {wd: OPEN for wd in (0, 1, 2, 3)}}
            people = [person(f"p{i}", weekendsOff=weekends_off and i == 0) for i in range(crew)]
            people += [person(f"o{i}", skills={OTHER}) for i in range(second)]
            current, seen = [], set()
            for i, who in enumerate(p["id"] for p in people):
                station = "desk" if who.startswith("o") else ("pc0", "pc1")[i % 2]
                for wd in ((d + i) % 7 for d in days):
                    if (station, wd) not in seen and wd in roles[OTHER if station == "desk" else SKILL][station]:
                        seen.add((station, wd))
                        current.append(entry(who, wd, station=station))
            with self.subTest(crew=crew, second=second, days=days, weekends_off=weekends_off):
                plain = place_roles(people, current, False, roles)
                week = place_roles(people, current, True, roles)
                self.assertNoMorePeople(plain, week)
                self.assertLessEqual(fewer(week, current), fewer(plain, current))


class HoldRowsTest(unittest.TestCase):
    """_hold_rows(): an entry as it stands is kept only as far as the rules allow."""

    def slots(self, station="pc0"):
        return [{"wd": wd, "station": station, "skill": SKILL, "from": 9, "to": 21,
                 "kind": "serve"} for wd in range(7)]

    def hold(self, rows, people, slots=None):
        keys = {"pc0": ("serve", SKILL), "pc1": ("serve", SKILL)}
        base = {p["id"]: ba_dashboard._fresh_state() for p in people}
        return ba_dashboard._hold_rows(rows, slots or self.slots(), keys,
                                       {p["id"]: p for p in people}, base)

    def test_an_entry_inside_the_plan_is_kept_as_it_is(self):
        [pin] = self.hold([entry("a", 2, start=10, end=18)], [person("a")])
        self.assertEqual((pin["wd"], pin["station"], pin["from"], pin["to"], pin["employee"]),
                         (2, "pc0", 10, 18, "a"))

    def test_only_the_hours_the_plan_wants(self):
        [pin] = self.hold([entry("a", 2, start=6, end=14)], [person("a")])
        self.assertEqual((pin["from"], pin["to"]), (9, 14))

    def test_not_past_their_ceiling(self):
        # Five twelve-hour days now with a 50-hour ceiling: the fifth stays out.
        pins = self.hold([entry("a", wd) for wd in range(5)], [person("a")])
        self.assertEqual(sum(p["to"] - p["from"] for p in pins), 48)

    def test_not_an_hour_they_keep_free(self):
        pins = self.hold([entry("a", 2)], [person("a", blackouts=[(18, 24)])])
        self.assertEqual(pins, [])

    def test_two_entries_never_share_a_computer_hour(self):
        pins = self.hold([entry("a", 2), entry("b", 2)], [person("a"), person("b")])
        self.assertEqual([p["employee"] for p in pins], ["a"])


if __name__ == "__main__":
    unittest.main()
