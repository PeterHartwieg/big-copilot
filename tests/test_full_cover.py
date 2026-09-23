"""The full-cover plan, its hand-over to the demand plan, and the add-people count.

The full-cover plan is the demand test for a new shop: every serving station
staffed every hour of every day, placed by the same placer as the demand plan
with every rule unchanged. Synthetic saves only, built with the helpers
tests/test_staffing.py uses.
"""
import collections
import math
import random
import unittest
import unittest.mock

import ba_dashboard
from ba_save import Save
from ba_dashboard import (
    ALL_DAY_OPEN,
    DEMAND_RUN_DAYS,
    HIRE_ORDERS,
    FULL_TIME,
    JOB_DEMANDS,
    OVERWORK_HOURS,
    SHIFT_CAP,
    _cut_run,
    _full_cover_in_game,
    _full_need,
    _hourly,
    _hires_for,
    _keeps_floors,
    _open_all_hours,
    _days_open,
    _open_day_average,
    _run_measured,
    _pack_hires,
)
from tests.test_staffing import (
    CLEAN_STATION,
    CLEANING,
    FIVE_DAYS,
    FLAT,
    FOUR_DAYS,
    FULLTIME,
    GUARD,
    LOCKER,
    PARTTIME,
    REGISTER,
    SCHEDULING_DEMANDS,
    SERVICE,
    LABELS,
    STATIONS,
    business,
    employee,
    hours,
    kind,
    plan,
    plan_sites,
    registration,
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


    def test_a_live_test_takes_the_unassigned_first(self):
        """An established shop's full cover, which nobody follows, waits its turn.

        Site 12 has fourteen days open around the clock, and sorts first; site
        14 is new and unmeasured, so its test is the live choice. The one
        unassigned cashier goes to site 14's test.
        """
        hourly = {h: 10 if 10 <= h < 16 else 0 for h in range(24)}
        rows = plan_sites(
            [dict(items=[(1, REGISTER)], hourly=hourly, weeks=2, number=12,
                  opens=((10, 16),)),
             dict(items=[(2, REGISTER)], hourly={}, weeks=0, number=14)],
            [employee("own1", [SERVICE], number=12), employee("free", [SERVICE], here=False)],
        )
        self.assertEqual(rows[0]["fullCover"]["daysMeasured"], 14)
        established, new = rows
        self.assertEqual(established["addPeople"]["assign"], [])
        self.assertEqual(established["fullCover"]["addPeople"]["assign"], [])
        self.assertEqual([r["id"] for r in new["fullCover"]["addPeople"]["assign"]], ["free"])



class HandOverTest(unittest.TestCase):
    """"Demand data complete": nine days since first open, full cover of open hours."""

    ITEMS = [(1, REGISTER), (2, REGISTER), (8, CLEAN_STATION)]

    def row(self, **kw):
        # Two weeks of reports by default; BUSY files them for 8 to 20 only,
        # because the game files none for an hour nobody came.
        kw.setdefault("shifts", game_week((1, 2)))
        return plan(self.ITEMS, crew(), BUSY, **kw)

    @staticmethod
    def days_open(days, today=None, edit=None):
        """_days_open() on a registration with `days` days of reports."""
        reg = registration([(1, REGISTER)], BUSY, days=days)
        if edit:
            edit(reg["orderHistory"]["$items"])
        return _days_open(Save({"Day": today} if today is not None else {}, {}, "t.hsg"), reg)

    def test_nine_days_since_first_open(self):
        self.assertEqual(DEMAND_RUN_DAYS, 9)
        self.assertEqual(self.days_open(8, today=9), 8)
        self.assertEqual(self.days_open(9, today=10), 9)

    def test_todays_unfinished_day_is_left_out(self):
        self.assertEqual(self.days_open(10, today=10), 9)

    def test_counted_from_the_first_day_with_a_report(self):
        """Days on file before the doors first opened do not count."""
        def unopened(entries):
            for entry in entries:
                if entry["dayNumber"] <= 3:
                    entry["hourReports"] = {"$items": []}
        self.assertEqual(self.days_open(12, today=13, edit=unopened), 9)

    def test_days_shut_since_do_not_break_it(self):
        """Not a run: a day with no report after the first open still counts."""
        def gap(entries):
            for entry in entries:
                if entry["dayNumber"] in (4, 5):
                    entry["hourReports"] = {"$items": []}
        self.assertEqual(self.days_open(9, today=10, edit=gap), 9)

    def test_a_history_past_its_window_is_complete(self):
        """The order history keeps about sixteen days: an older shop is complete."""
        def window(entries):
            entries[:] = [e for e in entries if e["dayNumber"] >= 40]
        self.assertEqual(self.days_open(55, today=56, edit=window), 16)

    def test_a_window_with_no_reports_is_not_complete(self):
        """Nobody came in the whole window: nothing measured, whatever the age."""
        def quiet(entries):
            entries[:] = [dict(e, hourReports={"$items": []}) for e in entries
                          if e["dayNumber"] >= 40]
        self.assertEqual(self.days_open(55, today=56, edit=quiet), 0)

    def test_a_shop_fitted_out_and_left_shut_gets_no_hand_over(self):
        """Twenty days on file, no report, the 24/7 test entered today."""
        # The schedule opens every day now; the fit-out filed nothing.
        row = plan(HandOverTest.ITEMS, crew(), {}, days=20, day=21,
                   shifts=game_week((1, 2)))
        self.assertIs(row["fullCover"]["inGame"], True)
        self.assertEqual(row["fullCover"]["daysMeasured"], 0)
        self.assertIs(row["demandDataComplete"], False)

    def test_no_reports_and_the_window_reaches_creation_is_not(self):
        """Created within the window and never served: not opened yet."""
        def unopened(entries):
            for entry in entries:
                entry["hourReports"] = {"$items": []}
        self.assertEqual(self.days_open(12, today=13, edit=unopened), 0)

    def test_nine_days_on_full_cover_shows_the_line(self):
        row = self.row(days=9, day=10)
        self.assertIs(row["fullCover"]["inGame"], True)
        self.assertEqual((row["fullCover"]["daysMeasured"], row["fullCover"]["daysNeeded"]), (9, 9))
        self.assertIs(row["demandDataComplete"], True)

    def test_eight_days_are_not_enough(self):
        row = self.row(days=8, day=9)
        self.assertEqual(row["fullCover"]["daysMeasured"], 8)
        self.assertIs(row["demandDataComplete"], False)

    def test_an_older_shop_gets_the_same_advice(self):
        """No age: a shop open for months on full cover with complete data."""
        row = self.row(weeks=12)
        self.assertIs(row["demandDataComplete"], True)

    def test_a_shop_open_8_to_22_completes_on_its_own_hours(self):
        """Not around the clock: full cover of the hours it opens is the test."""
        row = self.row(opens=((8, 22),), days=9, day=10)
        self.assertEqual(row["fullCover"]["daysMeasured"], 9)
        self.assertIs(row["fullCover"]["inGame"], True)
        self.assertIs(row["demandDataComplete"], True)

    def test_complete_data_without_full_cover_in_game_is_not(self):
        """A shop not on full cover now gets no line telling it to switch."""
        row = self.row(shifts=[])
        self.assertEqual(row["fullCover"]["daysMeasured"], 14)
        self.assertIs(row["demandDataComplete"], False)

    def test_two_empty_hours_a_day_are_not_full_cover(self):
        """An hour with a register empty is an hour the test never measured."""
        row = self.row(shifts=game_week((1, 2), gap=2))
        self.assertIs(row["fullCover"]["inGame"], False)
        self.assertIs(row["demandDataComplete"], False)

    def test_a_register_empty_for_a_day_is_not(self):
        row = self.row(shifts=game_week((1, 2), skip=(3, 2)))
        self.assertIs(row["fullCover"]["inGame"], False)
        self.assertIs(row["demandDataComplete"], False)

    def test_busy_every_open_hour_of_a_shorter_day_is_not(self):
        """Open 8 to 22 and busy all of it: the demand plan is its full cover already.

        The 24/7 full-cover plan would be 336 serving hours against the demand
        plan's 196; the shop's own hours are 196 too, so there is nothing to
        switch to.
        """
        busy = {h: 40 for h in range(8, 22)}
        row = plan(self.ITEMS, crew(), busy, opens=((8, 22),), days=12, day=13,
                   shifts=game_week((1, 2)))
        self.assertIs(row["fullCover"]["inGame"], True)
        self.assertEqual(sum(hours(s) for s in serving(row)), 2 * 14 * 7)
        self.assertIs(row["demandDataComplete"], False)

    def test_not_shown_where_the_demand_plan_is_full_cover_too(self):
        """A shop busy every hour is already on its demand plan: nothing to switch."""
        row = plan(self.ITEMS, crew(), {h: 40 for h in range(24)}, shifts=game_week((1, 2)))
        self.assertIs(row["fullCover"]["inGame"], True)
        self.assertEqual(sum(hours(s) for s in serving(row)),
                         sum(hours(s) for s in serving(row["fullCover"])))
        self.assertIs(row["demandDataComplete"], False)


class NineDayGateTest(unittest.TestCase):
    """A shop nine days since first open gets the whole demand plan.

    Nine days file every weekday once and two of them twice. The demand plan
    calls a weekday with fewer than HOUR_WEEKS_THIN weeks thin and reads it off
    another weekday through the day curve, and reads an hour with no report off
    another weekday too. With nine days, no weekday is thin and an hour with no
    report is no customers. Without them the gate is as it was.
    """

    ITEMS = [(1, REGISTER), (2, REGISTER), (8, CLEAN_STATION)]

    def bases(self, row):
        return [{b for b in day} for day in row["basis"][SERVICE]]

    def test_every_weekday_is_measured_after_nine_days(self):
        row = plan(self.ITEMS, crew(), BUSY, days=9, day=10)
        self.assertEqual(row["fullCover"]["daysMeasured"], 9)
        for wd, bases in enumerate(self.bases(row)):
            self.assertEqual(bases, {"measured"}, wd)
        self.assertEqual({s["d"] for s in serving(row)}, set(range(7)))

    def test_eight_days_keep_the_old_gate(self):
        """Every weekday but one seen once: the thin ones are not read as measured."""
        row = plan(self.ITEMS, crew(), BUSY, days=8, day=9)
        thin = [wd for wd, bases in enumerate(self.bases(row)) if "measured" not in bases]
        self.assertEqual(len(thin), 6)
        self.assertEqual(row["unmeasured"], [[] for _ in range(7)])

    def test_hours_nobody_came_are_not_staffed(self):
        """Open 0 to 24, customers only 8 to 20: the night is no demand."""
        row = plan(self.ITEMS, crew(), BUSY, days=9, day=10)
        need = row["need"][SERVICE]
        self.assertEqual([need[wd][h] for wd in range(7) for h in (0, 3, 21)], [0] * 21)
        for s in serving(row):
            self.assertGreaterEqual(s["f"], 8)
            self.assertLessEqual(s["t"], 20)
        # Cleaning cover is as it always was: every open hour.
        self.assertEqual(sum(hours(s) for s in row["shifts"] if kind(s) == "clean"), WEEK)
        # And those open hours are the missing data the page points at.
        night = [h for h in range(24) if not 8 <= h < 20]
        self.assertEqual(row["unmeasured"], [night] * 7)

    def test_a_nightclub_shut_every_wednesday(self):
        """Complete on its ninth day, and Wednesday is no demand."""
        row = plan(self.ITEMS, crew(), BUSY, days=9, day=10,
                   open_days=(0, 1, 2, 4, 5, 6))
        self.assertEqual(row["fullCover"]["daysMeasured"], 9)
        self.assertEqual(row["need"][SERVICE][3], [0] * 24)
        self.assertEqual(row["basis"][SERVICE][3], ["measured"] * 24)
        self.assertNotIn(3, {s["d"] for s in serving(row)})
        # A shut weekday is not missing data.
        self.assertEqual(row["unmeasured"][3], [])

    def test_a_shop_measured_8_to_22_now_open_around_the_clock(self):
        """The hours it never opened before are the ones the page names."""
        hourly = {h: 20 for h in range(24)}
        row = plan(self.ITEMS, crew(), hourly, days=9, day=10, hours=range(8, 22))
        self.assertEqual(row["unmeasured"][1], list(range(0, 8)) + [22, 23])
        self.assertEqual(row["need"][SERVICE][1][3], 0)

    def test_an_hour_is_averaged_over_the_days_the_shop_was_open(self):
        """Tuesday 03:00: 3 one week, nobody the next. The plan reads 1.5, not 3."""
        hourly = {3: 3, 12: 10}
        reg = registration([(1, REGISTER)], hourly, days=14)
        second = next(e for e in reg["orderHistory"]["$items"] if e["dayNumber"] == 9)
        second["hourReports"] = {"$items": [{"hour": 12, "customers": 10}]}
        save = Save({"Day": 15}, {}, "t.hsg")
        daily = _open_day_average(save, reg, ALL_DAY_OPEN)
        self.assertEqual(daily[2][3], 1.5)
        self.assertEqual(daily[2][12], 10.0)
        self.assertEqual(daily[3][3], 3.0)
        grid = {"customers": [[None] * 24 for _ in range(7)], "weeks": [2] * 7,
                "thin": [False] * 7}
        grid["customers"][2][3] = 3.0
        grid["customers"][2][12] = 10.0
        measured = _run_measured(grid, DEMAND_RUN_DAYS, daily)
        self.assertEqual(measured["customers"][2][3], 1.5)
        # An hour with no report at all stays none, and the board's own grid
        # is left as it was.
        self.assertEqual(measured["customers"][2][5], 0.0)
        self.assertEqual(grid["customers"][2][3], 3.0)
        # Without the nine days the grid is untouched.
        self.assertIs(_run_measured(grid, DEMAND_RUN_DAYS - 1, daily), grid)

    def test_a_day_nobody_came_all_day_counts(self):
        """Tuesday 03:00: 3 one week, and the next Tuesday filed no report at all."""
        reg = registration([(1, REGISTER)], {3: 3, 12: 10}, days=14)
        second = next(e for e in reg["orderHistory"]["$items"] if e["dayNumber"] == 9)
        second["hourReports"] = {"$items": []}
        daily = _open_day_average(Save({"Day": 15}, {}, "t.hsg"), reg, ALL_DAY_OPEN)
        self.assertEqual((daily[2][3], daily[2][12]), (1.5, 5.0))
        # A weekday the schedule keeps shut is not averaged over its days.
        shut = [[[0, 24]] if wd != 2 else [] for wd in range(7)]
        daily = _open_day_average(Save({"Day": 15}, {}, "t.hsg"), reg, shut)
        self.assertEqual(daily[2], [0.0] * 24)

    def test_the_fit_out_before_the_first_customer_is_not_averaged(self):
        """Days on file before the shop first served anybody are not open days.

        Days 1 and 2 are the fit-out, day 3 the first customer, and day 10 an
        open day nobody came: Wednesday halves, Tuesday does not.
        """
        reg = registration([(1, REGISTER)], {3: 3}, days=14)
        for entry in reg["orderHistory"]["$items"]:
            if entry["dayNumber"] in (1, 2, 10):
                entry["hourReports"] = {"$items": []}
        daily = _open_day_average(Save({"Day": 15}, {}, "t.hsg"), reg, ALL_DAY_OPEN)
        self.assertEqual(daily[2][3], 3.0)  # day 9 alone; day 2 was the fit-out
        self.assertEqual(daily[1][3], 3.0)  # day 8 alone; day 1 was the fit-out
        self.assertEqual(daily[3][3], 1.5)  # days 3 and 10; nobody came on 10

    def test_a_weekday_never_opened_averages_to_nothing(self):
        reg = registration([(1, REGISTER)], {12: 10}, days=14, open_days=(0, 1, 2, 4, 5, 6))
        slots = [[] if wd == 3 else [[0, 24]] for wd in range(7)]
        daily = _open_day_average(Save({"Day": 15}, {}, "t.hsg"), reg, slots)
        self.assertEqual(daily[3], [0.0] * 24)

    def test_todays_partial_day_cannot_set_a_weekday(self):
        """A weekday with no finished open day is none, not today's partial count.

        The order history runs from day 4 to day 10 and today is day 10, a
        Wednesday: the first Wednesday on file is today's, unfinished, with 25
        customers at 10:00 so far. The board's hour grid reads that; the demand
        plan's copy must not.
        """
        reg = dict(registration([(1, REGISTER)], {10: 25, 12: 5}, days=10), RentedByPlayer=True)
        reg["orderHistory"]["$items"] = [
            e for e in reg["orderHistory"]["$items"] if e["dayNumber"] >= 4]
        save = Save({"Day": 10, "EmployeeInstances": {"$items": []},
                     "BuildingRegistrations": {"$items": [reg]}}, {}, "t.hsg")
        grid = _hourly(save, [reg], [business()], STATIONS, set(), {}, LABELS)[0]
        self.assertEqual(grid["customers"][3][10], 25.0)
        daily = _open_day_average(save, reg, grid["open"])
        measured = _run_measured(grid, DEMAND_RUN_DAYS, daily)
        self.assertEqual(measured["customers"][3][10], 0.0)
        # A finished Tuesday still reads its own day.
        self.assertEqual(measured["customers"][2][10], 25.0)

    def test_the_threshold_directly(self):
        stations = [{"id": 1}, {"id": 2}]
        slots = [[[0, 24]]] * 7

        def week(covered):
            return [{"wd": wd, "station": post, "from": 0, "to": covered, "kind": "serve"}
                    for wd in range(7) for post in (1, 2)]

        self.assertTrue(_full_cover_in_game(week(24), stations, slots))
        self.assertFalse(_full_cover_in_game(week(23), stations, slots))
        # One register missing one hour of one day.
        short = week(24)
        short[0] = dict(short[0], to=23)
        self.assertFalse(_full_cover_in_game(short, stations, slots))
        # The shop's own hours: open 0 to 23, 23 hours staffed is full cover.
        self.assertTrue(_full_cover_in_game(week(23), stations, [[[0, 23]]] * 7))
        self.assertTrue(_full_cover_in_game(week(24), stations, [[[0, 12], [12, 24]]] * 7))
        # A shop shut every day has nothing to cover.
        self.assertFalse(_full_cover_in_game(week(24), stations, [[]] * 7))
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


    def live_case(self, first):
        """Site 12 as given, then a new unmeasured site 14 and one unassigned cashier."""
        today = first.pop("today")
        rows = plan_sites(
            [dict(first, items=[(1, REGISTER)], number=12),
             dict(items=[(2, REGISTER)], hourly={}, weeks=0, number=14)],
            [employee("own1", [SERVICE], number=12), employee("free", [SERVICE], here=False)],
            day=today,
        )
        return [[r["id"] for r in row["fullCover"]["addPeople"]["assign"]] for row in rows]

    def test_complete_data_is_not_a_live_test_even_with_thin_weekdays(self):
        """Nine days since first open, most weekdays seen once: measured, not live."""
        hourly = {h: 10 for h in range(10, 16)}
        promised = self.live_case(dict(hourly=hourly, days=9, opens=((10, 16),), today=10))
        self.assertEqual(promised, [[], ["free"]])

    def test_two_weeks_on_every_weekday_it_opens_is_not_live(self):
        """Open one weekday only: two of them measured is its whole week."""
        hourly = {h: 10 for h in range(10, 16)}
        promised = self.live_case(dict(hourly=hourly, days=8, opens=((10, 16),),
                                       open_days=(1,), today=9))
        self.assertEqual(promised, [[], ["free"]])


    def test_a_shop_on_its_normal_hours_is_not_a_live_test(self):
        """Open 10 to 16 with its register staffed then: that is not the 24/7 test."""
        hourly = {h: 10 for h in range(10, 16)}
        shifts = [{"wd": wd, "employeeId": "own1", "itemInstanceId": 1,
                   "startingHour": 10, "endingHour": 16, "type": 1} for wd in range(7)]
        promised = self.live_case(dict(hourly=hourly, weeks=2, opens=((10, 16),),
                                       shifts=shifts, today=15))
        self.assertEqual(promised, [[], ["free"]])


class HireCountTest(unittest.TestCase):
    """The hire count is never worse than the first-fit count it replaced."""

    def test_the_smallest_case_the_review_found(self):
        cases = [(0, 2, 9, 16), (1, 1, 7, 18), (2, 1, 6, 12), (2, 2, 1, 9), (3, 0, 9, 18),
                 (3, 1, 13, 16), (3, 2, 2, 13), (4, 1, 8, 15), (4, 2, 8, 18), (5, 0, 2, 9),
                 (5, 0, 9, 16), (6, 1, 13, 15), (6, 2, 7, 18)]
        slots = [{"wd": wd, "station": st, "from": f, "to": t, "skill": "x", "kind": "serve"}
                 for wd, st, f, t in cases]
        clock = _pack_hires(slots, None, HIRE_ORDERS[0])
        self.assertEqual(clock, 2)
        self.assertEqual(_hires_for(slots), 2)

    def test_never_above_either_first_fit_order(self):
        rng = random.Random(5)
        for _ in range(300):
            slots = []
            for st in range(rng.randint(1, 4)):
                for wd in range(7):
                    if rng.random() < .25:
                        continue
                    a = rng.randint(0, 20)
                    b = rng.randint(a + 1, 24)
                    for f, t in _cut_run(a, b):
                        slots.append({"wd": wd, "station": st, "from": f, "to": t,
                                      "skill": "x", "kind": "serve"})
            if not slots:
                continue
            count = _hires_for(slots)
            first_fit = min(_pack_hires(slots, None, o) for o in HIRE_ORDERS)
            self.assertLessEqual(count, first_fit)
            # And the count is one a packing reaches: first fit's own, or a
            # balanced packing at that count.
            self.assertTrue(count == first_fit or any(
                _pack_hires(slots, count, o) is not None for o in HIRE_ORDERS))


class ExchangeKeepsDemandsTest(unittest.TestCase):
    """The swap pass never breaks a demand the week without it meets.

    Random shops and crews, planned twice: as the board plans them, and with
    the swap pass switched off. The first may place more entries and hire
    fewer people; it may not leave anybody short of hours or days whom the
    second does not.
    """

    OPT = ["ba:jobdemand_freeweekends", "ba:jobdemand_nomornings",
           "ba:jobdemand_noafternoons", "ba:jobdemand_noevenings",
           "ba:jobdemand_nonights", "ba:jobdemand_nocleaning"]

    def scenario(self, rng):
        items, n = [], 1
        for _ in range(rng.randint(1, 3)):
            items.append((n, REGISTER))
            n += 1
        if rng.random() < .6:
            items.append((n, CLEAN_STATION))
            n += 1
        if rng.random() < .3:
            items.append((n, LOCKER))
        a, b = rng.choice([0, 6, 8, 10]), rng.choice([16, 18, 20, 22, 24])
        peak = rng.randint(5, 60)
        hourly = {h: (rng.randint(0, peak) if a <= h < b else 0) for h in range(24)}
        people = []
        for i in range(rng.randint(1, 10)):
            skills = rng.choice([[SERVICE], [SERVICE], [CLEANING], [GUARD],
                                 [SERVICE, CLEANING], [CLEANING, GUARD]])
            d = []
            r = rng.random()
            if r < .5:
                d.append(FULLTIME)
            elif r < .7:
                d.append(PARTTIME)
            r = rng.random()
            if r < .2:
                d.append(FOUR_DAYS)
            elif r < .4:
                d.append(FIVE_DAYS)
            d += [x for x in self.OPT if rng.random() < .12]
            people.append(employee(f"e{i}", skills, demands=tuple(d), here=rng.random() < .8))
        return dict(items=items, employees=people, hourly=hourly, opens=((a, b),),
                    weeks=rng.choice([0, 2, 2]))

    def test_a_swap_never_takes_the_giver_under_a_floor(self):
        """The giver's own check, apart from the whole-week comparison behind it."""
        def week(hours, days):
            state = {"hours": hours, "busy": [set() for _ in range(7)], "days": set(days),
                     "stations": set()}
            return state
        person = {"band": (30, 50), "days": 4}
        eight = {"wd": 1, "from": 0, "to": 8}
        twelve = {"wd": 1, "from": 0, "to": 12}
        # 32 hours over four days; hands a twelve away (20 left) and takes an eight.
        self.assertFalse(_keeps_floors(person, week(32, (1, 2, 3, 4)),
                                       week(20, (1, 2, 3, 4)), eight))
        self.assertTrue(_keeps_floors(person, week(32, (1, 2, 3, 4)),
                                      week(20, (1, 2, 3, 4)), twelve))
        # Four days, gives up a whole day and takes the new line on a day they
        # already work: three days, under an exact four.
        self.assertFalse(_keeps_floors(person, week(36, (1, 2, 3, 4)),
                                       week(24, (2, 3, 4)), dict(twelve, wd=2)))
        # Already short: not made any shorter, and allowed to stay where it was.
        self.assertTrue(_keeps_floors(person, week(24, (1, 2)),
                                      week(12, (2,)), twelve))
        self.assertFalse(_keeps_floors(person, week(24, (1, 2)),
                                       week(12, (2,)), eight))
        # No band, no count: only ceilings apply, and those are _can_work()'s.
        self.assertTrue(_keeps_floors({"band": None, "days": None}, week(10, (1,)),
                                      week(0, ()), eight))

    @staticmethod
    def broken(row, plan_row):
        ids = lambda rows: {(row["people"][r["p"]]["id"]) for r in rows}  # noqa: E731
        return ids(plan_row["shortHours"]), ids(plan_row["shortDays"])

    def test_random_plans(self):
        # Seeds 2 and 4 hold the two cases the review found (plans 116 and 97).
        for seed in (2, 4):
            rng = random.Random(seed)
            for _ in range(120):
                sc = self.scenario(rng)
                args = (sc["items"], sc["employees"], sc["hourly"])
                kw = dict(opens=sc["opens"], weeks=sc["weeks"])
                row = plan(*args, **kw)
                with unittest.mock.patch.object(ba_dashboard, "_fill_by_exchange",
                                                lambda *a, **k: 0):
                    base = plan(*args, **kw)
                for which in (lambda r: r, lambda r: r["fullCover"]):
                    hours_now, days_now = self.broken(row, which(row))
                    hours_was, days_was = self.broken(base, which(base))
                    self.assertLessEqual(hours_now, hours_was)
                    self.assertLessEqual(days_now, days_was)


if __name__ == "__main__":
    unittest.main()
