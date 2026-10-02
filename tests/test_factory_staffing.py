"""Staffing for factory lines (R13), on synthetic fixtures only.

A factory line needs its machines x the hours it must run: 24 sized 24/7,
else the hours the ends' demand plus the margin takes. `_factories()` puts
those hours on each line with a verdict per sizing, and `_factory_staffing()`
rosters them through the shop placer: one Factory Worker station per machine,
the factory's own staff, each run cut into shifts of at most 12 hours.
"""
import json
import math
import os
import subprocess
import sys
import unittest
from tests.i18n_check import MsgAsserts
import unittest.mock

import ba_dashboard
from ba_dashboard import (SHIFT_CAP, SUPPLY_MARGIN, _factory_run_start, _factory_staffing,
                          _line_hours, site_key)
from test_supply_facts import (FACTORY, HUB, RID, SHOP_A, BEER, WATER, Company, beer_chain)

HERE = os.path.dirname(os.path.abspath(__file__))
WORKER = "ba:skill_factoryworker"
NOMORNINGS = "ba:jobdemand_nomornings"
KEY = site_key(FACTORY)


# --- a factory's own roster in the game, and its people -------------------------

class Rostered(Company):
    """A Company whose factory machines are rostered `hours[i]` a day (from
    00:00), or not at all where it is 0, instead of all 24."""

    def __init__(self, hours, **kw):
        super().__init__(**kw)
        self.hours = hours

    def save(self):
        stub = super().save()
        for reg in stub.root["BuildingRegistrations"]:
            if (reg["StreetName"], reg["StreetNumber"]) != FACTORY:
                continue
            for day in reg["scheduleDays"]:
                day["workShifts"] = [
                    {"itemInstanceId": f"m-{i}", "type": 1, "startingHour": 0, "endingHour": h}
                    for i, h in enumerate(self.hours) if h
                ]
        return stub


def rostered_chain(hours, machines=None, sold_a=200, sold_b=100, bar_target=400, bar_units=200):
    """beer_chain()'s company (one machine makes 720 beer a day), with the
    factory's machines rostered `hours` a day and the shops selling what
    they are given."""
    c = Rostered(hours)
    c.site(HUB, "Import Hub")
    c.site(FACTORY, "Brewery", kind="ba:businesstype_factory",
           machines=machines if machines is not None else [RID] * len(hours))
    c.shop(SHOP_A, "Beer Bar")
    c.hold(HUB, WATER, 2000)
    c.hold(FACTORY, WATER, 250)
    c.hold(FACTORY, BEER, 300)
    c.hold(SHOP_A, BEER, bar_units, sold_a)
    c.plan(HUB, FACTORY, WATER, 300 * len(hours))
    c.plan(FACTORY, SHOP_A, BEER, bar_target)
    c.contract(HUB, WATER, 1700 * len(hours))
    for d in range(13, 20):
        c.ship(d, HUB, FACTORY, {WATER: 240 * len(hours)})
    c.run()
    return c


class People:
    """Factory workers assigned to the factory, as a save and _staff() hold them."""

    def __init__(self):
        self.save_rows, self.staff = [], []

    def add(self, n, daily=211.0, demands=(), skills=(WORKER,), addr=FACTORY):
        for _ in range(n):
            pid = f"w{len(self.staff):02d}"
            self.save_rows.append({"id": pid, "demands": list(demands)})
            self.staff.append({"id": pid, "name": pid.upper(), "skills": list(skills),
                               "wage": daily * 7 / 42, "hours": 42, "daily": daily, "addr": addr})
        return self


def factory_rows(c, people, names=None):
    """_factory_staffing() on company `c` with `people` on staff."""
    stub = c.save()
    stub.root["EmployeeInstances"] = people.save_rows
    return _factory_staffing(stub, names, c.business_list, c.supply["factories"], people.staff, detail=True)


def hand_factory(lines):
    """A factories payload with one factory at site 0, lines given as
    (slug, machines, cap hours, dem hours, hoursNow)."""
    out = []
    for n, (slug, machines, cap, dem, now) in enumerate(lines):
        out.append({"slug": slug, "item": slug.title(), "machines": machines,
                    "slots": list(range(1, machines + 1)), "hoursNow": now,
                    "needHours": {"cap": cap, "dem": dem},
                    "_posts": [f"{slug}-{i}" for i in range(machines)]})
    return {"sites": [{"s": 0, "machines": sum(l["machines"] for l in out), "lines": out}]}


class Bare:
    """The one thing _factory_staffing() reads off a save: its employees' demands."""

    def __init__(self, people):
        self.root = {"EmployeeInstances": people.save_rows}

    def items(self, value):
        return value or []

    def deref(self, value):
        return value


def hand_rows(lines, people):
    business = [{"key": KEY, "name": "Brewery", "status": "support"}]
    return _factory_staffing(Bare(people), None, business, hand_factory(lines), people.staff, detail=True)


def line_of(c, addr=FACTORY):
    site = next(s for s in c.supply["factories"]["sites"]
                if c.business_list[s["s"]]["key"] == site_key(addr))
    return site, site["lines"][0]


# --- tests ---------------------------------------------------------------------

class RosterTests(unittest.TestCase):
    def test_two_machines_round_the_clock_are_336_machine_hours_and_seven_workers(self):
        [row] = hand_rows([("beer", 2, 24, 24, 24)], People().add(7))["cap"]
        self.assertEqual(row["headcount"], {"needed": 336, "min": 7, "have": 7, "spare": 0,
                                            "hire": 0})
        [line] = row["lines"]
        self.assertEqual((line["hours"], line["from"], line["to"]), (24, 0, 24))
        self.assertEqual(line["cuts"], [[0, 12], [12, 24]])
        # Every shift is a legal one: at most 12 hours, one person per machine an hour.
        self.assertTrue(all(s["t"] - s["f"] <= SHIFT_CAP for s in row["shifts"]))
        seen = set()
        for s in row["shifts"]:
            for hour in range(s["f"], s["t"]):
                self.assertNotIn((s["d"], s["s"], hour), seen)
                seen.add((s["d"], s["s"], hour))
        self.assertEqual(len(seen), 336)
        self.assertTrue(all(s["p"] is not None for s in row["shifts"]))
        self.assertEqual(len(row["stations"]), 2)

    def test_a_17_hour_run_is_cut_9_and_8_from_six(self):
        [row] = hand_rows([("beer", 1, 24, 17, 24)], People().add(4))["dem"]
        [line] = row["lines"]
        self.assertEqual((line["from"], line["to"]), (6, 23))
        self.assertEqual(line["cuts"], [[6, 15], [15, 23]])
        self.assertEqual(row["headcount"]["needed"], 17 * 7)

    def test_a_pool_refusing_mornings_moves_the_run_off_six_to_ten(self):
        people = People().add(3, demands=[NOMORNINGS])
        [row] = hand_rows([("beer", 1, 24, 12, 24)], people)["dem"]
        [line] = row["lines"]
        self.assertEqual((line["from"], line["to"]), (10, 22))
        # Placed there because of their demand.
        self.assertTrue(row["placed"])
        self.assertEqual(_factory_run_start(12, []), 6)
        self.assertEqual(_factory_run_start(12, [{"blackouts": [(6, 10)]}]), 10)
        # A tie goes to the start nearest 06:00, then the earliest.
        self.assertEqual(_factory_run_start(23, []), 1)
        self.assertEqual(_factory_run_start(24, [{"blackouts": [(6, 10)]}]), 0)

    def test_delta_and_wages(self):
        # Eight on staff at $211 a day, seven needed: one spare, $211 a day less.
        [row] = hand_rows([("beer", 2, 24, 24, 24)], People().add(8))["cap"]
        self.assertEqual((row["headcount"]["have"], row["headcount"]["min"],
                          row["headcount"]["spare"], row["headcount"]["hire"]), (8, 7, 1, 0))
        self.assertEqual(row["wageDay"], 211.0)
        self.assertEqual(row["delta"], {"workers": -1, "perDay": -211.0})
        # Too few: five for two machines round the clock is at least two to
        # hire (the placer's own count, which the day's 14-hour limit can raise).
        [row] = hand_rows([("beer", 2, 24, 24, 24)], People().add(5))["cap"]
        hire = row["headcount"]["hire"]
        self.assertGreaterEqual(hire, 2)
        self.assertEqual(row["headcount"]["spare"], 0)
        self.assertEqual(row["delta"], {"workers": hire, "perDay": hire * 211.0})

    def test_only_the_factorys_own_factory_workers_count(self):
        people = People().add(7).add(2, skills=("ba:skill_cleaning",)).add(3, addr=None)
        [row] = hand_rows([("beer", 2, 24, 24, 24)], people)["cap"]
        self.assertEqual(row["headcount"]["have"], 7)
        self.assertEqual({p["id"] for p in row["people"]} & {"w07", "w08", "w09", "w10", "w11"},
                         set())

    def test_both_sizings_come_through_extract_shapes(self):
        c = rostered_chain([24])
        rows = factory_rows(c, People().add(4))
        self.assertEqual(set(rows), {"cap", "dem"})
        cap, dem = rows["cap"][0], rows["dem"][0]
        self.assertEqual((cap["key"], cap["s"]), (KEY, c.index(FACTORY)))
        self.assertEqual(cap["lines"][0]["hours"], 24)
        self.assertEqual(dem["lines"][0]["hours"], 8)
        # The lines' machine ids leave the payload with the roster.
        for site in c.supply["factories"]["sites"]:
            for line in site["lines"]:
                self.assertNotIn("_posts", line)
        json.dumps(rows)

    def test_the_rows_do_not_depend_on_the_hash_seed(self):
        script = ("import json, test_factory_staffing as t;"
                  "c = t.rostered_chain([24, 24]);"
                  "p = t.People().add(9, demands=[t.NOMORNINGS]).add(3);"
                  "print(json.dumps(t.factory_rows(c, p), sort_keys=True))")
        runs = []
        for seed in ("1", "2", "3"):
            env = dict(os.environ, PYTHONHASHSEED=seed,
                       PYTHONPATH=os.pathsep.join([HERE, os.path.dirname(HERE)]))
            runs.append(subprocess.run([sys.executable, "-c", script], check=True, text=True,
                                       capture_output=True, env=env, cwd=HERE).stdout)
        self.assertEqual(runs[0], runs[1])
        self.assertEqual(runs[0], runs[2])


class LineHoursTests(unittest.TestCase):
    def test_the_demand_formula(self):
        # One machine, 30 beer an hour (720 a day); the bar sells 200 a day:
        # 200 x 1.15 / 30 = 7.67, so 8 hours.
        c = rostered_chain([24])
        _site, line = line_of(c)
        self.assertEqual(line["needHours"], {"cap": 24,
                                             "dem": math.ceil(200 * (1 + SUPPLY_MARGIN) / 30)})
        self.assertEqual(line["demBasis"], "sales")
        # Split across two machines of the same line: 400 a day over 60 an hour.
        c = rostered_chain([24, 24], sold_a=400)
        _site, line = line_of(c)
        self.assertEqual(line["needHours"]["dem"], math.ceil(400 * 1.15 / 60))

    def test_demand_never_asks_past_24(self):
        _site, line = line_of(rostered_chain([24], sold_a=5000))
        self.assertEqual(line["needHours"], {"cap": 24, "dem": 24})
        self.assertEqual(_line_hours([], 1, 30, 720, "sales")["needHours"]["dem"], 24)

    def test_nothing_drawn_sizes_demand_at_24(self):
        c = rostered_chain([24], sold_a=0, bar_target=0)
        _site, line = line_of(c)
        self.assertEqual((line["demBasis"], line["needHours"]), ("none", {"cap": 24, "dem": 24}))
        self.assertEqual(line["dem"], {"status": "covered", "why": None, "level": "ok"})

    def test_a_shelf_with_no_sales_yet_asks_for_its_target(self):
        # The bar has never held or sold beer but is topped up to 400 a day:
        # that is its need until it sells, 400 x 1.15 / 30 = 15.3, so 16 hours.
        _site, line = line_of(rostered_chain([24], sold_a=0, bar_units=0))
        self.assertEqual((line["demBasis"], line["needHours"]), ("sales", {"cap": 24, "dem": 16}))
        # A bar trading for weeks with beer on the shelf and none sold needs none.
        _site, line = line_of(rostered_chain([24], sold_a=0))
        self.assertEqual(line["demBasis"], "none")

    def test_too_few_hours_are_short_in_both_sizings(self):
        # Rostered 3 a day, needed 24 (24/7) and 8 (Demand).
        _site, line = line_of(rostered_chain([3]))
        self.assertEqual(line["hoursNow"], 3)
        self.assertEqual((line["status"], line["why"], line["level"]), ("short", "hours", "critical"))
        self.assertEqual(line["dem"], {"status": "short", "why": "hours", "level": "critical"})
        # 20 a day: a warning at 24/7, and plenty for Demand.
        _site, line = line_of(rostered_chain([20]))
        self.assertEqual((line["status"], line["level"]), ("short", "warn"))
        self.assertEqual(line["dem"]["status"], "covered")

    def test_too_many_under_demand_is_a_lower_suggestion_not_a_change(self):
        _site, line = line_of(rostered_chain([24]))
        self.assertEqual((line["status"], line["why"], line["level"]), ("covered", None, "ok"))
        self.assertNotIn("lower", line)
        self.assertEqual(line["dem"], {"status": "covered", "why": None, "level": "ok", "lower": 8})
        self.assertNotIn("setTo", line)
        self.assertNotIn("setTo", line["dem"])

    def test_hours_now_is_the_least_rostered_machine_and_weekday(self):
        _site, line = line_of(rostered_chain([24, 10]))
        self.assertEqual(line["hoursNow"], 10)

    def test_a_day_off_is_judged_on_the_week_and_named(self):
        # 24 h Monday to Saturday, nothing on Sunday: 144 of the week's 168.
        week = [{"slot": 1, "id": "m-0", "days": [0, 24, 24, 24, 24, 24, 24], "running": True}]
        line = _line_hours(week, 1, 30, 30 * 8 / 1.15, "sales")
        self.assertEqual((line["hoursNow"], line["thinDay"]), (20, {"day": "Sun", "hours": 0}))
        self.assertEqual((line["status"], line["why"]), ("short", "hours"))
        # Demand needs 8 a day, 56 a week: the week covers it, fewer would do.
        self.assertEqual(line["dem"], {"status": "covered", "why": None, "level": "ok", "lower": 8})
        # The thin day is the least-rostered machine's: a fuller machine off on
        # Monday does not name Monday.
        pair = [{**week[0], "days": [8] * 7}, {"slot": 2, "id": "m-1", "days": [24, 0, 24, 24, 24, 24, 24], "running": True}]
        self.assertNotIn("thinDay", _line_hours(pair, 2, 30, 0, "none"))
        pair[0]["days"] = [8, 8, 8, 8, 8, 8, 2]
        got = _line_hours(pair, 2, 30, 0, "none")
        self.assertEqual((got["hoursNow"], got["thinDay"]), (7, {"day": "Sat", "hours": 2}))
        # Every day alike: no day named.
        self.assertNotIn("thinDay", _line_hours([{**week[0], "days": [20] * 7}], 1, 30, 0, "none"))

    def test_placed_against_running(self):
        # Three placed: one with no recipe, one nobody is posted to, one running.
        c = rostered_chain([24, 0, 24], machines=[RID, RID, None])
        site, line = line_of(c)
        self.assertEqual((site["machines"], site["running"]), (3, 1))
        self.assertEqual((line["machines"], line["running"]), (2, 1))


class UnnamedAndSharedLineTests(MsgAsserts, unittest.TestCase):
    def test_machines_on_a_recipe_the_board_cannot_name_are_rostered_too(self):
        # Two beer machines and two on a recipe no table names, all 24 h, and
        # 14 workers: 672 machine-hours need all 14, none spare.
        c = rostered_chain([24, 24, 24, 24], machines=[RID, RID, "rid-unknown", "rid-unknown"])
        site, _line = line_of(c)
        self.assertEqual([u["machines"] for u in site["unnamed"]], [2])
        rows = factory_rows(c, People().add(14))
        cap, dem = rows["cap"][0], rows["dem"][0]
        self.assertEqual((cap["headcount"]["needed"], cap["headcount"]["spare"], cap["unnamedMachines"]), (672, 0, 2))
        [unnamed] = [l for l in cap["lines"] if l.get("unnamed")]
        self.assertEqual((unnamed["hours"], unnamed["slug"], unnamed["machines"]), (24, None, 2))
        self.assertMsg(unnamed["item"], "sp.py.factory.unnamed")
        # Under Demand its use is unknown: it keeps the hours it has now.
        [unnamed] = [l for l in dem["lines"] if l.get("unnamed")]
        self.assertEqual(unnamed["hours"], 24)
        self.assertEqual(dem["unnamedMachines"], 2)
        self.assertEqual(dem["headcount"]["needed"], 2 * _line["needHours"]["dem"] * 7 + 2 * 24 * 7)
        for site in c.supply["factories"]["sites"]:
            for u in site["unnamed"]:
                self.assertNotIn("_posts", u)

    def test_a_machine_with_no_recipe_stays_out(self):
        c = rostered_chain([24, 24], machines=[RID, None])
        cap = factory_rows(c, People().add(4))["cap"][0]
        self.assertNotIn("unnamedMachines", cap)
        self.assertEqual(cap["headcount"]["needed"], 168)

    def test_two_lines_making_one_item_keep_their_own_machines(self):
        business = [{"key": KEY, "name": "Brewery", "status": "support"}]
        factories = {"sites": [{"s": 0, "machines": 4, "lines": [
            {"slug": "beer", "item": "Beer", "machines": 2, "slots": [1, 2], "hoursNow": 24,
             "needHours": {"cap": 24, "dem": 24}, "_posts": ["a-0", "a-1"]},
            {"slug": "beer", "item": "Beer", "machines": 2, "slots": [3, 4], "hoursNow": 24,
             "needHours": {"cap": 24, "dem": 24}, "_posts": ["b-0", "b-1"]}]}]}
        people = People().add(14)
        [row] = _factory_staffing(Bare(people), None, business, factories, people.staff, detail=True)["cap"]
        self.assertEqual(sorted(st["id"] for st in row["stations"]), ["a-0", "a-1", "b-0", "b-1"])
        self.assertEqual(row["headcount"]["needed"], 672)

    def test_the_payload_row_carries_only_what_the_board_reads(self):
        c = rostered_chain([24])
        stub = c.save()
        people = People().add(4)
        stub.root["EmployeeInstances"] = people.save_rows
        [row] = _factory_staffing(stub, None, c.business_list, c.supply["factories"], people.staff)["cap"]
        # The week stays so the Staff page can write it; `_hire` is the Staff
        # page's part, which _hiring() takes off before the payload ships.
        self.assertEqual(set(row), {"key", "s", "name", "lines", "headcount", "wageDay", "delta",
                                    "stations", "people", "shifts", "current", "addPeople", "_hire"})


class StaffFindingTests(MsgAsserts, unittest.TestCase):
    def staff(self, c, mode):
        return [f for f in c.findings(mode) if f["group"] == "staff"]

    def test_the_demand_finding_goes_when_the_hours_meet_the_need(self):
        # 12 a day: short of 24/7, more than Demand's 8.
        c = rostered_chain([12])
        [cap] = self.staff(c, "cap")
        self.assertEqual(self.staff(c, "dem"), [])
        # 5 a day is short of both, and the finding keeps its id.
        c = rostered_chain([5])
        [cap] = self.staff(c, "cap")
        [dem] = self.staff(c, "dem")
        self.assertEqual(cap["id"], dem["id"])
        self.assertMsg(dem["text"], "sp.py.staff.needed.lost", hours=35, week=56)


class BenchTest(unittest.TestCase):
    """Factories draw on the unassigned factory workers the shops and offices left."""

    def test_the_bench_is_drawn_before_anybody_is_hired(self):
        people = People().add(3).add(4, addr=None)
        [row] = hand_rows([("beer", 2, 24, 24, 24)], people)["cap"]
        # 336 machine-hours: seven people, three here and four off the bench.
        self.assertEqual(row["headcount"]["hire"], 0)
        self.assertEqual(row["headcount"]["have"], 7)
        self.assertEqual(row["headcount"]["spare"], 0)
        self.assertEqual(sorted(row["_hire"]["bench"]), ["w03", "w04", "w05", "w06"])
        self.assertEqual([a["id"] for a in row["addPeople"]["assign"]],
                         ["w03", "w04", "w05", "w06"])

    def test_the_bench_does_not_move_the_line(self):
        """Review round 1, item 3: three unassigned workers who refuse mornings
        moved a twelve-hour line off 06:00 though the factory's own four cover it."""
        people = People().add(4).add(3, demands=[NOMORNINGS], addr=None)
        [row] = hand_rows([("beer", 1, 24, 12, 24)], people)["dem"]
        [line] = row["lines"]
        self.assertEqual((line["from"], line["to"]), (6, 18))
        # With nobody of its own, the bench decides.
        people = People().add(3, demands=[NOMORNINGS], addr=None)
        [row] = hand_rows([("beer", 1, 24, 12, 24)], people)["dem"]
        self.assertEqual(row["lines"][0]["from"], 10)

    def test_the_factory_s_own_first_and_the_bench_it_draws_leaves_it(self):
        people = People().add(7).add(2, addr=None)
        world = ba_dashboard._plan_world(Bare(people), people.staff)
        business = [{"key": KEY, "name": "Brewery", "status": "support"}]
        rows = _factory_staffing(Bare(people), None, business,
                                 hand_factory([("beer", 2, 24, 24, 24)]), people.staff,
                                 detail=True, world=world)
        [row] = rows["cap"]
        self.assertEqual(row["_hire"]["bench"], [])
        self.assertEqual([p["id"] for p in world["bench"]], ["w07", "w08"])
        people = People().add(5).add(3, addr=None)
        world = ba_dashboard._plan_world(Bare(people), people.staff)
        _factory_staffing(Bare(people), None, business, hand_factory([("beer", 2, 24, 24, 24)]),
                          people.staff, detail=True, world=world)
        # Two drawn to make seven, one left for whoever plans next.
        self.assertEqual([p["id"] for p in world["bench"]], ["w07"])


class SameHoursBothSizingsTest(unittest.TestCase):
    """Both sizings asking every line for the same hours is one week, placed once."""

    LINES = [("beer", 2, 24, 24, 24), ("water", 1, 16, 16, 0)]

    def rows(self):
        people = People().add(5).add(2, demands=("ba:jobdemand_fulltime",))
        return hand_rows(self.LINES, people)

    def test_the_copy_is_the_week_placed_again(self):
        placed = []
        real = ba_dashboard._factory_site_plan

        def counting(*a, **k):
            placed.append(a[7])  # the sizing
            return real(*a, **k)

        with unittest.mock.patch.object(ba_dashboard, "_factory_site_plan", counting):
            rows = self.rows()
        self.assertEqual(placed, ["cap"])
        # Placed twice over, the week is the same week.
        with unittest.mock.patch.object(ba_dashboard, "_factory_hours",
                                        lambda site, mode: [mode]):
            twice = self.rows()
        self.assertEqual(json.dumps(rows, sort_keys=True, default=str),
                         json.dumps(twice, sort_keys=True, default=str))
        # And nothing of it is shared: the Staff page takes each `_hire` off.
        [cap], [dem] = rows["cap"], rows["dem"]
        self.assertIsNot(cap["_hire"], dem["_hire"])
        self.assertIsNot(cap["shifts"], dem["shifts"])

    def test_different_hours_are_placed_each(self):
        lines = [("beer", 2, 24, 12, 24)]
        placed = []
        real = ba_dashboard._factory_site_plan

        def counting(*a, **k):
            placed.append(a[7])
            return real(*a, **k)

        with unittest.mock.patch.object(ba_dashboard, "_factory_site_plan", counting):
            hand_rows(lines, People().add(3))
        self.assertEqual(placed, ["cap", "dem"])


class FewestCoveringTests(unittest.TestCase):
    """_fewest_covering() over a made-up answer per count, as a string of
    F (a shift left open) and T (covered) from `low` on."""

    def search(self, low, pattern):
        high = low + len(pattern) - 1
        asked = []

        def place(count):
            self.assertTrue(low <= count <= high, count)
            asked.append(count)
            return {"count": count, "shifts": [{"employee": None if pattern[count - low] == "F" else 1}]}

        return ba_dashboard._fewest_covering(place, low, high)["count"], asked

    def first_covering(self, low, pattern):
        """What trying every count upward gave: the first T below the last count, else the last."""
        return low + next((i for i, c in enumerate(pattern[:-1]) if c == "T"), len(pattern) - 1)

    def test_monotonic_answers_match_trying_every_count(self):
        for low, length in ((0, 1), (3, 1), (25, 199), (17, 112), (41, 8)):
            for first in range(length):
                pattern = "F" * first + "T" * (length - first)
                with self.subTest(low=low, pattern=pattern):
                    count, asked = self.search(low, pattern)
                    self.assertEqual(count, self.first_covering(low, pattern))
                    self.assertEqual(len(asked), len(set(asked)))
                    high = low + length - 1
                    self.assertEqual(high in asked, count == high)

    def test_every_short_pattern_answers_a_covering_count_or_the_last(self):
        for low in (0, 1, 5):
            for length in range(1, 9):
                for bits in range(2 ** length):
                    pattern = "".join("T" if bits >> i & 1 else "F" for i in range(length))
                    with self.subTest(low=low, pattern=pattern):
                        count, asked = self.search(low, pattern)
                        high = low + length - 1
                        self.assertTrue(count == high or pattern[count - low] == "T")
                        self.assertEqual(high in asked, count == high)
                        self.assertEqual(len(asked), len(set(asked)))

    def test_the_hiring_count_is_not_the_answer_when_a_count_below_covers(self):
        # The doubling strides step past 2 and every count after up to the
        # last fails: the walk down still finds 2.
        for pattern in ("FFTFF", "FFTFT"):
            with self.subTest(pattern=pattern):
                count, asked = self.search(0, pattern)
                self.assertEqual(count, 2)
                self.assertNotIn(4, asked)

    def test_a_dip_above_the_fewest_is_walked_past(self):
        # The player's warehouse: 55 and 56 cover, 57 does not, 58 on do again.
        pattern = "F" * (55 - 17) + "TTF" + "T" * (128 - 57)
        self.assertEqual(self.search(17, pattern)[0], 55)
        # And a lone covering count between misses, below the halving's answer.
        self.assertEqual(self.search(9, "FFTFTTT")[0], 11)
        # Two misses in a row do not end the walk down; three would.
        self.assertEqual(self.search(0, "FFTFFTT")[0], 2)

    def test_nothing_below_the_last_count_covers_gives_the_last_count(self):
        # The last count is the one that may hire; it is placed, covering or not.
        count, asked = self.search(24, "F" * 10)
        self.assertEqual(count, 33)
        self.assertEqual(asked[-1], 33)
        self.assertEqual(self.search(24, "FFFFT")[0], 28)

    def test_a_large_pool_asks_a_few_counts_not_every_one(self):
        pattern = "F" * (188 - 25) + "T" * (223 - 187)
        count, asked = self.search(25, pattern)
        self.assertEqual(count, 188)
        self.assertLess(len(asked), 25)
        self.assertEqual(len(asked), len(set(asked)))


if __name__ == "__main__":
    unittest.main()
