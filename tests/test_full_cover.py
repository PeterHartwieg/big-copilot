"""The full-cover plan, its hand-over to the demand plan, and the add-people count.

The full-cover plan is the demand test for a new shop: every serving station
staffed every hour of every day, placed by the same placer as the demand plan
with every rule unchanged. Synthetic saves only, built with the helpers
tests/test_staffing.py uses.
"""
import collections
import math
import unittest

from ba_dashboard import (
    ALL_DAY_OPEN,
    DEMAND_TEST_DAYS,
    FULL_COVER_SHARE,
    FULL_TIME,
    History,
    JOB_DEMANDS,
    OVERWORK_HOURS,
    SHIFT_CAP,
    _full_cover_in_game,
    _full_need,
    _open_all_hours,
)
from tests.test_staffing import (
    CLEAN_STATION,
    CLEANING,
    FLAT,
    GUARD,
    REGISTER,
    SCHEDULING_DEMANDS,
    SERVICE,
    employee,
    hours,
    kind,
    plan,
    plan_sites,
    who,
)

WEEK = 7 * 24
BUSY = {h: 40 if 8 <= h < 20 else 0 for h in range(24)}  # two registers 8-20, none at night


def serving(site):
    return [s for s in site["shifts"] if kind(s) == "serve"]


def game_week(posts, gap=0, skip=None):
    """A full-cover schedule already in the game: every register 0-24, two twelves a day.

    `gap` leaves that many hours off the end of each day's second entry, and
    `skip` names a (weekday, post) pair left with nothing at all.
    """
    rows = []
    for wd in range(7):
        for k, post in enumerate(posts):
            if skip == (wd, post):
                continue
            for n, (start, end) in enumerate(((0, 12), (12, 24 - gap))):
                rows.append({"wd": wd, "employeeId": f"s{(2 * k + n) % 8}",
                             "itemInstanceId": post, "startingHour": start,
                             "endingHour": end, "type": 1})
    return rows


def crew(service=8, cleaners=4):
    return ([employee(f"s{i}", [SERVICE]) for i in range(service)]
            + [employee(f"c{i}", [CLEANING]) for i in range(cleaners)])


class FullNeedTest(unittest.TestCase):
    """Every station of every role, every hour: the one thing that differs."""

    def test_the_need_is_every_station_every_hour(self):
        grid = {
            "roles": [{"skill": SERVICE}, {"skill": GUARD}],
            "stations": [{"skill": SERVICE}, {"skill": SERVICE}, {"skill": GUARD}],
        }
        need = _full_need(grid)
        self.assertEqual(need[SERVICE]["need"], [[2] * 24 for _ in range(7)])
        self.assertEqual(need[GUARD]["need"], [[1] * 24 for _ in range(7)])
        self.assertEqual({b for day in need[SERVICE]["basis"] for b in day}, {"full"})

    def test_the_payload_carries_it_on_a_shop_never_measured(self):
        row = plan([(1, REGISTER), (2, REGISTER), (8, CLEAN_STATION)], crew(), BUSY,
                   weeks=0, opens=((8, 20),))
        full = row["fullCover"]
        # The need is constant, so the payload leaves it to the page.
        self.assertNotIn("need", full)
        self.assertNotIn("basis", full)
        # The demand plan beside it is still cover only.
        self.assertEqual(serving(row), [])
        # Every register every hour, whatever the doors say today.
        by_station = collections.Counter()
        for s in serving(full):
            by_station[s["s"]] += hours(s)
        self.assertEqual(sorted(by_station.values()), [WEEK, WEEK])
        # And the cleaning station follows the hours the plan assumes.
        self.assertEqual(sum(hours(s) for s in full["shifts"] if kind(s) == "clean"), WEEK)
        self.assertEqual(full["open"], ALL_DAY_OPEN)
        self.assertIs(full["openAllHours"], True)
        self.assertIs(full["openNow"], False)

    def test_a_shop_already_open_around_the_clock_says_so(self):
        row = plan([(1, REGISTER)], crew(4, 0), BUSY, weeks=0)
        self.assertIs(row["fullCover"]["openNow"], True)

    def test_open_all_hours_reads_every_weekday(self):
        self.assertTrue(_open_all_hours([[[0, 24]]] * 7))
        self.assertTrue(_open_all_hours([[[0, 10], [10, 24]]] * 7))
        self.assertFalse(_open_all_hours([[[0, 24]]] * 6 + [[]]))
        self.assertFalse(_open_all_hours([[[6, 24]]] * 7))


class FullCoverRulesTest(unittest.TestCase):
    """The placer's rules hold on the full-cover plan as on the demand plan."""

    DEMANDS = SCHEDULING_DEMANDS + [
        (),
        ("ba:jobdemand_fulltime", "ba:jobdemand_nonights", "ba:jobdemand_freeweekends"),
    ]

    def row(self):
        # Servers only on the registers and a cleaner apart: a server is never
        # put on a cleaning station, and the test below checks that too.
        people = [employee(f"p{i:02d}", [SERVICE], wage=20 + i, demands=d)
                  for i, d in enumerate(self.DEMANDS)]
        people += [employee(f"c{i}", [CLEANING, SERVICE] if i == 0 else [CLEANING])
                   for i in range(3)]
        items = [(1, REGISTER), (2, REGISTER), (8, CLEAN_STATION)]
        return plan(items, people, FLAT, weeks=0, opens=((8, 20),)), {
            p["id"]: p for p in people}

    def test_no_entry_breaks_a_rule(self):
        row, people = self.row()
        full = row["fullCover"]
        by_person = collections.defaultdict(list)
        cells = collections.Counter()
        for s in full["shifts"]:
            self.assertLessEqual(hours(s), SHIFT_CAP, "no entry over 12 hours")
            for hour in range(s["f"], s["t"]):
                cells[(s["d"], s["s"], hour)] += 1
            if s["p"] is not None:
                by_person[who(full | {"people": row["people"]}, s)].append(s)
        self.assertEqual(max(cells.values()), 1, "one person per station per hour")
        self.assertTrue(by_person)
        for eid, shifts in by_person.items():
            person = people[eid]
            skills = {x["name"] for x in person["characterData"]["skills"]["$items"]}
            worked = sum(hours(s) for s in shifts)
            self.assertLessEqual(worked, FULL_TIME[1], f"{eid}: nobody over 50 hours")
            per_day = collections.Counter()
            for s in shifts:
                per_day[s["d"]] += hours(s)
            self.assertLessEqual(max(per_day.values()), OVERWORK_HOURS, f"{eid}: 14-hour day")
            if SERVICE in skills:
                self.assertFalse([s for s in shifts if kind(s) == "clean"],
                                 f"{eid}: a server is never put on cleaning")
            rules = [JOB_DEMANDS[d] for d in person["demands"]["$items"] if d in JOB_DEMANDS]
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
                        for s in shifts:
                            self.assertFalse(low < s["t"] and s["f"] < high, (eid, s))

    def test_each_station_takes_at_least_four_people(self):
        """168 hours at no more than 50 a person is four people a station."""
        row = plan([(1, REGISTER), (2, REGISTER), (8, CLEAN_STATION)], crew(20, 6), BUSY,
                   weeks=0)
        full = row["fullCover"]
        floor = math.ceil(WEEK / FULL_TIME[1])
        self.assertEqual(floor, 4)
        # A role's people may move between its stations, so two registers are
        # 336 hours and seven people, not eight.
        self.assertEqual(full["headcount"][SERVICE]["min"], math.ceil(2 * WEEK / FULL_TIME[1]))
        self.assertEqual(full["headcount"][CLEANING]["min"], floor)
        # But no one station's week can be worked by fewer than four people.
        on_station = collections.defaultdict(set)
        for s in full["shifts"]:
            self.assertIsNotNone(s["p"])
            on_station[s["s"]].add(s["p"])
        self.assertEqual(len(on_station), 3)
        for people in on_station.values():
            self.assertGreaterEqual(len(people), floor)
        # With a crew this size nobody has to be hired.
        self.assertEqual(sum(h["hire"] for h in full["headcount"].values()), 0)

    def test_two_registers_and_a_cleaner_with_nobody_to_staff_them(self):
        """The fewest people: seven for the registers, four for the mop."""
        row = plan([(1, REGISTER), (2, REGISTER), (8, CLEAN_STATION)], [], BUSY, weeks=0)
        add = row["fullCover"]["addPeople"]
        self.assertEqual(add["people"], 11)
        self.assertEqual(
            [(h["skill"], h["people"]) for h in add["hire"]],
            [(CLEANING, 4), (SERVICE, 7)],
        )
        self.assertEqual(add["hoursUncovered"], 3 * WEEK)

    def test_the_hires_it_counts_can_be_placed(self):
        """Hire exactly that many full-timers and the placer fills every entry.

        Seven servers and four cleaners, all on full-time contracts: nobody is
        left an open entry, every rule holds, and every one of them gets the
        thirty hours their band asks for.
        """
        people = [employee(f"s{i}", [SERVICE], demands=("ba:jobdemand_fulltime",))
                  for i in range(7)]
        people += [employee(f"c{i}", [CLEANING], demands=("ba:jobdemand_fulltime",))
                   for i in range(4)]
        row = plan([(1, REGISTER), (2, REGISTER), (8, CLEAN_STATION)], people, BUSY, weeks=0)
        full = row["fullCover"]
        self.assertEqual([s for s in full["shifts"] if s["p"] is None], [])
        self.assertEqual(full["addPeople"]["people"], 0)
        self.assertEqual(full["shortHours"], [])
        worked = collections.Counter()
        per_day = collections.Counter()
        for s in full["shifts"]:
            self.assertLessEqual(hours(s), SHIFT_CAP)
            worked[s["p"]] += hours(s)
            per_day[(s["p"], s["d"])] += hours(s)
        self.assertEqual(len(worked), 11)
        self.assertLessEqual(max(worked.values()), FULL_TIME[1])
        self.assertGreaterEqual(min(worked.values()), FULL_TIME[0])
        self.assertLessEqual(max(per_day.values()), OVERWORK_HOURS)

    def test_a_cleaning_station_on_sixteen_hour_days_takes_three(self):
        """112 hours in 8-hour entries, two a day: three people, not four."""
        row = plan([(1, REGISTER), (8, CLEAN_STATION)], [], BUSY, weeks=0, opens=((8, 24),))
        self.assertEqual(row["headcount"][CLEANING]["hire"], 3)
        people = [employee(f"c{i}", [CLEANING], demands=("ba:jobdemand_fulltime",))
                  for i in range(3)]
        row = plan([(1, REGISTER), (8, CLEAN_STATION)], people, BUSY, weeks=0, opens=((8, 24),))
        self.assertEqual([s for s in row["shifts"] if s["p"] is None], [])
        worked = collections.Counter()
        for s in row["shifts"]:
            worked[s["p"]] += hours(s)
        self.assertGreaterEqual(min(worked.values()), FULL_TIME[0])

    def test_a_site_uses_whom_its_own_demand_plan_took(self):
        """Demand plans draw first; a site's full-cover plan may use its own draw."""
        rows = plan_sites(
            [
                dict(items=[(1, REGISTER)], hourly={}, weeks=0, number=12),
                dict(items=[(2, REGISTER)], hourly={h: 1 for h in range(24)}, number=14),
            ],
            [employee("free", [SERVICE], here=False)],
        )
        first, second = rows
        # The first site's demand plan has no serving hour, so it leaves the
        # bench member alone; the second site's demand plan takes them.
        self.assertEqual(first["bench"], [])
        self.assertEqual(len(second["bench"]), 1)
        # So the first site's full-cover plan may not promise them too; the
        # second site's may, because they are that site's either way.
        self.assertEqual(first["fullCover"]["bench"], [])
        self.assertEqual(first["fullCover"]["addPeople"]["assign"], [])
        self.assertEqual([r["id"] for r in second["fullCover"]["addPeople"]["assign"]],
                         ["free"])

    def test_one_unassigned_person_goes_to_one_full_cover_plan(self):
        """Two new shops, one unassigned person: the first test gets them."""
        rows = plan_sites(
            [
                dict(items=[(1, REGISTER)], hourly={}, weeks=0, number=12),
                dict(items=[(2, REGISTER)], hourly={}, weeks=0, number=14),
            ],
            [employee("free", [SERVICE], here=False)],
        )
        promised = [[r["id"] for r in row["fullCover"]["addPeople"]["assign"]]
                    for row in rows]
        self.assertEqual(promised, [["free"], []])
        # And nobody is promised across a demand plan and another site's test.
        for row in rows:
            self.assertEqual(row["addPeople"]["assign"], [])


class HandOverTest(unittest.TestCase):
    """"Demand test done": full cover held for two weeks, and measured."""

    ITEMS = [(1, REGISTER), (2, REGISTER), (8, CLEAN_STATION)]

    def row(self, history=None, day=28, **kw):
        # Four weeks of hour reports, days 1 to 28, from a shop created on day 1.
        kw.setdefault("shifts", game_week((1, 2)))
        kw.setdefault("weeks", 4)
        return plan(self.ITEMS, crew(), BUSY, history=history, day=day, **kw)

    def held(self, start=14, end=28, **kw):
        """Built on `start` with the test in the game, and again on `end`."""
        history = History(None)
        self.row(history=history, day=start, **kw)
        return self.row(history=history, day=end, **kw), history

    def test_done_after_fourteen_recorded_days(self):
        row, _ = self.held()
        self.assertIs(row["fullCover"]["inGame"], True)
        self.assertIs(row["demandTestDone"], True)

    def test_not_done_the_day_full_cover_is_entered(self):
        """Two cover-only weeks of reports, full cover entered today: not done."""
        history = History(None)
        row = self.row(history=history)
        self.assertIs(row["fullCover"]["inGame"], True)
        self.assertIs(row["demandTestDone"], False)
        self.assertEqual(history.book["test"]["fullCover"], {row["key"]: 28})

    def test_not_done_a_day_short(self):
        row, _ = self.held(end=27, weeks=4)
        self.assertIs(row["demandTestDone"], False)

    def test_not_done_without_the_reports_of_those_days(self):
        """Held fourteen days, but only one week of reports filed since."""
        row, _ = self.held(weeks=3)
        self.assertIs(row["demandTestDone"], False)

    def test_not_done_without_a_record(self):
        """No board was built during the test, so nothing is claimed."""
        self.assertIs(self.row(history=None)["demandTestDone"], False)
        self.assertIs(self.row(history=History(None))["demandTestDone"], False)

    def test_the_record_is_cleared_when_full_cover_stops(self):
        history = History(None)
        first = self.row(history=history, day=14)
        self.assertEqual(history.book["test"]["fullCover"], {first["key"]: 14})
        self.row(history=history, day=20, shifts=[])
        self.assertEqual(history.book["test"]["fullCover"], {})
        again = self.row(history=history, day=28)
        self.assertEqual(history.book["test"]["fullCover"], {again["key"]: 28})
        self.assertIs(again["demandTestDone"], False)

    def test_done_only_on_a_new_shop(self):
        """Six weeks open is the edge: a shop older than that has its demand plan."""
        self.assertEqual(DEMAND_TEST_DAYS, 42)
        young, _ = self.held(creation_day=28 - (DEMAND_TEST_DAYS - 1))
        self.assertIs(young["demandTestDone"], True)
        old, _ = self.held(creation_day=28 - DEMAND_TEST_DAYS)
        self.assertIs(old["fullCover"]["inGame"], True)
        self.assertIs(old["demandTestDone"], False)

    def test_not_done_where_the_save_gives_no_creation_day(self):
        row, _ = self.held(creation_day=None)
        self.assertIs(row["fullCover"]["inGame"], True)
        self.assertIs(row["demandTestDone"], False)

    def test_not_done_while_the_game_runs_something_else(self):
        row, _ = self.held(shifts=[])
        self.assertIs(row["demandTestDone"], False)

    def test_a_short_gap_each_day_is_still_full_cover(self):
        """Two hours a day off each register is 154 of 168, over nine tenths."""
        row, _ = self.held(shifts=game_week((1, 2), gap=2))
        self.assertIs(row["fullCover"]["inGame"], True)
        self.assertIs(row["demandTestDone"], True)

    def test_a_register_empty_for_a_day_is_not(self):
        """144 of 168 is under nine tenths."""
        row, _ = self.held(shifts=game_week((1, 2), skip=(3, 2)))
        self.assertIs(row["fullCover"]["inGame"], False)
        self.assertIs(row["demandTestDone"], False)

    def test_a_shop_shut_at_night_is_not(self):
        row, _ = self.held(opens=((6, 24),))
        self.assertIs(row["fullCover"]["inGame"], False)
        self.assertIs(row["demandTestDone"], False)

    def test_not_done_where_the_demand_plan_is_full_cover_too(self):
        """A shop busy every hour is already on its demand plan: nothing to switch."""
        history = History(None)
        busy = {h: 40 for h in range(24)}
        kw = dict(shifts=game_week((1, 2)), weeks=4)
        plan(self.ITEMS, crew(), busy, history=history, day=14, **kw)
        row = plan(self.ITEMS, crew(), busy, history=history, day=28, **kw)
        self.assertIs(row["fullCover"]["inGame"], True)
        self.assertEqual(sum(hours(s) for s in serving(row)),
                         sum(hours(s) for s in serving(row["fullCover"])))
        self.assertIs(row["demandTestDone"], False)

    def test_an_older_save_starts_the_run_again(self):
        history = History(None)
        history.full_cover("test", 30, "k", True)
        self.assertEqual(history.full_cover("test", 20, "k", True), 20)

    def test_the_threshold_directly(self):
        stations = [{"id": 1}, {"id": 2}]
        slots = [[[0, 24]]] * 7

        def week(covered):
            return [{"wd": wd, "station": post, "from": 0, "to": covered, "kind": "serve"}
                    for wd in range(7) for post in (1, 2)]

        edge = math.ceil(FULL_COVER_SHARE * 24)
        self.assertTrue(_full_cover_in_game(week(24), stations, slots))
        self.assertTrue(_full_cover_in_game(week(edge), stations, slots))
        self.assertFalse(_full_cover_in_game(week(edge - 1), stations, slots))
        # Cleaning on a register's hours is not serving it.
        cleaning = [dict(r, kind="clean") for r in week(24)]
        self.assertFalse(_full_cover_in_game(cleaning, stations, slots))
        # A site with no serving station has no demand to test.
        self.assertFalse(_full_cover_in_game(week(24), [], slots))
        # Overlapping entries count an hour once.
        twice = week(12) + week(12)
        self.assertFalse(_full_cover_in_game(twice, stations, slots))


class AddPeopleTest(unittest.TestCase):
    """Who the player adds before a plan can be filled, for both plans."""

    def row(self):
        # One server of the site's own, one cleaner on the bench: a register and
        # a cleaning station open around the clock, measured at one customer an
        # hour, so the demand plan wants both all week.
        people = [employee("a", [SERVICE]), employee("b", [CLEANING], here=False)]
        return plan([(1, REGISTER), (8, CLEAN_STATION)], people, {h: 1 for h in range(24)})

    def test_a_hand_worked_site(self):
        row = self.row()
        add = row["addPeople"]
        # "a" works 48 of the register's 168 hours; the bench cleaner 48 of the
        # mop's. The rest is ten twelve-hour entries each, three hires each.
        self.assertEqual([(r["id"], r["name"], r["skill"], r["role"]) for r in add["assign"]],
                         [("b", "B", CLEANING, "Cleaning")])
        self.assertEqual(row["people"][add["assign"][0]["p"]]["id"], "b")
        self.assertEqual(
            [(h["skill"], h["role"], h["people"]) for h in add["hire"]],
            [(CLEANING, "Cleaning", 3), (SERVICE, "Customer Service", 3)],
        )
        self.assertEqual(add["people"], 7)
        own = sum(hours(s) for s in row["shifts"] if s["p"] is not None
                  and row["people"][s["p"]]["id"] == "a")
        self.assertEqual(own, 48)
        self.assertEqual(add["hoursUncovered"], 2 * WEEK - own)

    def test_the_count_agrees_with_the_plan_in_both_plans(self):
        row = self.row()
        for plan_row in (row, row["fullCover"]):
            add = plan_row["addPeople"]
            self.assertEqual(add["people"],
                             len(add["assign"]) + sum(h["people"] for h in add["hire"]))
            self.assertEqual(sorted(r["p"] for r in add["assign"]),
                             sorted(r["p"] for r in plan_row["bench"]))
            self.assertEqual(
                {h["skill"]: h["people"] for h in add["hire"]},
                {k: v["hire"] for k, v in plan_row["headcount"].items() if v["hire"]},
            )
            bench = {r["p"] for r in plan_row["bench"]}
            self.assertEqual(
                add["hoursUncovered"],
                sum(hours(s) for s in plan_row["shifts"] if s["p"] is None or s["p"] in bench),
            )

    def test_a_fully_staffed_plan_adds_nobody(self):
        people = [employee(f"s{i}", [SERVICE]) for i in range(5)]
        row = plan([(1, REGISTER)], people, {h: 1 for h in range(24)})
        self.assertEqual(row["addPeople"],
                         {"assign": [], "hire": [], "people": 0, "hoursUncovered": 0})


if __name__ == "__main__":
    unittest.main()
