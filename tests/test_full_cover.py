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
    FULL_COVER_SHARE,
    FULL_TIME,
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
        self.assertEqual(full["need"][SERVICE], [[2] * 24 for _ in range(7)])
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
        """The scope's floor is eleven: seven for the registers, four for the mop.

        The hires are packed by _hires_for(), first fit in day order, and that
        lands on eight for the registers: the first four hires fill Monday to
        Thursday and four more take the rest. Pinned so a better packing shows
        up here as a change to decide on, not as a quiet one.
        """
        row = plan([(1, REGISTER), (2, REGISTER), (8, CLEAN_STATION)], [], BUSY, weeks=0)
        add = row["fullCover"]["addPeople"]
        self.assertGreaterEqual(add["people"], 11)
        self.assertEqual(add["people"], 12)
        self.assertEqual(
            [(h["skill"], h["people"]) for h in add["hire"]],
            [(CLEANING, 4), (SERVICE, 8)],
        )
        self.assertEqual(add["hoursUncovered"], 3 * WEEK)

    def test_the_full_cover_plan_takes_nothing_off_the_bench(self):
        """It is a choice for one site, so the next site sees the same bench."""
        rows = plan_sites(
            [
                dict(items=[(1, REGISTER)], hourly={}, weeks=0, number=12),
                dict(items=[(2, REGISTER)], hourly={h: 1 for h in range(24)}, number=14),
            ],
            [employee("free", [SERVICE], here=False)],
        )
        first, second = rows
        # The first site's demand plan has no serving hour, so it leaves the
        # bench member alone; its full-cover plan uses them.
        self.assertEqual(first["bench"], [])
        self.assertEqual(len(first["fullCover"]["bench"]), 1)
        # And the second site still gets them for its own demand plan.
        self.assertEqual(len(second["bench"]), 1)


class HandOverTest(unittest.TestCase):
    """"Demand test done": two measured weeks while the game runs a full-cover week."""

    ITEMS = [(1, REGISTER), (2, REGISTER), (8, CLEAN_STATION)]

    def row(self, **kw):
        kw.setdefault("shifts", game_week((1, 2)))
        return plan(self.ITEMS, crew(), BUSY, **kw)

    def test_a_measured_shop_running_full_cover_is_done(self):
        row = self.row()
        self.assertIs(row["fullCover"]["inGame"], True)
        self.assertIs(row["demandTestDone"], True)

    def test_not_done_before_two_weeks_are_measured(self):
        row = self.row(weeks=1)
        self.assertIs(row["fullCover"]["inGame"], True)
        self.assertIs(row["demandTestDone"], False)

    def test_not_done_while_the_game_runs_something_else(self):
        self.assertIs(self.row(shifts=[])["demandTestDone"], False)

    def test_a_short_gap_each_day_is_still_full_cover(self):
        """Two hours a day off each register is 154 of 168, over nine tenths."""
        row = self.row(shifts=game_week((1, 2), gap=2))
        self.assertIs(row["fullCover"]["inGame"], True)
        self.assertIs(row["demandTestDone"], True)

    def test_a_register_empty_for_a_day_is_not(self):
        """144 of 168 is under nine tenths."""
        row = self.row(shifts=game_week((1, 2), skip=(3, 2)))
        self.assertIs(row["fullCover"]["inGame"], False)
        self.assertIs(row["demandTestDone"], False)

    def test_a_shop_shut_at_night_is_not(self):
        row = self.row(opens=((6, 24),))
        self.assertIs(row["fullCover"]["inGame"], False)
        self.assertIs(row["demandTestDone"], False)

    def test_not_done_where_the_demand_plan_is_full_cover_too(self):
        """A shop busy every hour is already on its demand plan: nothing to switch."""
        row = plan(self.ITEMS, crew(), {h: 40 for h in range(24)}, shifts=game_week((1, 2)))
        self.assertIs(row["fullCover"]["inGame"], True)
        self.assertEqual(sum(hours(s) for s in serving(row)),
                         sum(hours(s) for s in serving(row["fullCover"])))
        self.assertIs(row["demandTestDone"], False)

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
