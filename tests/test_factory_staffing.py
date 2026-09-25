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


def rostered_chain(hours, machines=None, sold_a=200, sold_b=100):
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
    c.hold(SHOP_A, BEER, 200, sold_a)
    c.plan(HUB, FACTORY, WATER, 300 * len(hours))
    c.plan(FACTORY, SHOP_A, BEER, 400)
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
        c = rostered_chain([24], sold_a=0)
        _site, line = line_of(c)
        self.assertEqual((line["demBasis"], line["needHours"]), ("none", {"cap": 24, "dem": 24}))
        self.assertEqual(line["dem"], {"status": "covered", "why": None, "level": "ok"})

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
        # Every day alike: no day named.
        self.assertNotIn("thinDay", _line_hours([{**week[0], "days": [20] * 7}], 1, 30, 0, "none"))

    def test_placed_against_running(self):
        # Three placed: one with no recipe, one nobody is posted to, one running.
        c = rostered_chain([24, 0, 24], machines=[RID, RID, None])
        site, line = line_of(c)
        self.assertEqual((site["machines"], site["running"]), (3, 1))
        self.assertEqual((line["machines"], line["running"]), (2, 1))


class UnnamedAndSharedLineTests(unittest.TestCase):
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
        self.assertIn("recipe not named", unnamed["item"])
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
        self.assertEqual(set(row), {"key", "s", "name", "lines", "headcount", "wageDay", "delta"})


class StaffFindingTests(unittest.TestCase):
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
        self.assertIn("35 of 56 hours needed", dem["text"])


if __name__ == "__main__":
    unittest.main()
