"""The rules oracle: every week the planner puts out, held to the rules it must keep.

One checker (`problems()`), written from the game's rules and the owner's, not
from the planner's code, run over every plan the planner puts out -- the site's
own people, the hires' weeks, every variant of a shop (demand, full cover, open
hours), offices and factories -- on a synthetic sweep and on the payload
snapshot fixtures. It tells two things apart:

- **illegal output**, which fails the test: a shift over 12 hours or a day over
  12, a person in two places at once, a station manned twice, a band's ceiling
  passed, more days than an exact day count, a shift on a weekend for somebody
  with free weekends, inside a blackout window, on cleaning for somebody who
  may not clean (a no-cleaning demand, or customer service: the owner's
  policy), a station of a role the person does not hold, a station-hour the
  plan wants and has no line for (every role, the head wash included, in every
  variant), a hire week that breaks the same rules or points at a line that is
  not open, an unassigned person promised to two sites, and a person already
  working at the site given some hours but left further from an hours band or
  a day count than the week they have (the owner's rule of 28-29 September
  2026: no hours at all is fine, they are spare);
- **reported infeasibility**, which is allowed: a band's floor or an exact day
  count the week cannot reach, provided it is in `shortHours` / `shortDays`
  with the right figures -- and nothing is there that is not so.

What it does NOT check: that the week is the best one (fewest people, longest
shifts, cheapest, the order people are started in, whether fewer hires would
do); the need curve itself or the bridging budget; desk and chair demands;
the `fewer` list, the costs and the add-people counts; the board's writes and
the Staff page's candidate matching; anybody's week at another site than the
plan's; that a hire week reaches thirty hours (it is counted, not required);
and, for a kept week, which of the person's current shifts it keeps.
"""
import collections
import json
import math
import os
import random
import sys
import tempfile
import unittest
import unittest.mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))

import ba_dashboard  # noqa: E402
from ba_dashboard import JOB_DEMANDS, SERVICE_SKILL, SHIFT_CAP, FULL_TIME  # noqa: E402
from ba_save import Names, Save, load_save  # noqa: E402

import test_staffing as ts  # noqa: E402
from test_staffing import (CLEAN_STATION, CLEANING, FIVE_DAYS, FLAT, FOUR_DAYS, FULLTIME,  # noqa: E402
                           GUARD, LOCKER, PARTTIME, REGISTER, SERVICE, employee)

COVER = {"ba:skill_cleaning": "clean", "ba:skill_securityguard": "security"}
WEEKEND = (6, 0)


# --- the contracts, read from the save's own employees -------------------------

def contract(employee_row: dict) -> dict:
    """One employee's schedule demands, read straight off the save's row."""
    held = [d for d in (employee_row.get("demands") or {}).get("$items", ()) if d in JOB_DEMANDS]
    rules = [JOB_DEMANDS[slug] for slug in held]
    skills = {s["name"] for s in (employee_row.get("characterData") or {}).get("skills", {}).get("$items", ())}
    return {
        "skills": skills,
        "band": next((tuple(r[1]) for r in rules if r[0] == "hours"), None),
        "days": next((r[1] for r in rules if r[0] == "days"), None),
        "weekendsOff": any(r[0] == "daysoff" for r in rules),
        "blackouts": [tuple(w) for r in rules if r[0] == "noshift" for w in r[1]],
        "nocleaning": any(r[0] == "nocleaning" for r in rules),
        "site": ts.site_key((employee_row["assignedAddress"]["streetName"],
                             employee_row["assignedAddress"]["streetNumber"]))
        if employee_row.get("assignedAddress") else None,
    }


def contracts(save_root: dict) -> dict:
    return {e["id"]: contract(e) for e in save_root["EmployeeInstances"]["$items"]}


# --- the checker ------------------------------------------------------------------

def week_of(row: dict, shifts) -> dict:
    """{person id: {"hours", "days", "busy": {wd: set}}} over a list of payload rows."""
    out = collections.defaultdict(lambda: {"hours": 0, "days": set(),
                                           "busy": collections.defaultdict(set)})
    for s in shifts:
        if s.get("p") is None:
            continue
        mine = out[row["people"][s["p"]]["id"]]
        mine["hours"] += s["t"] - s["f"]
        mine["days"].add(s["d"])
        mine["busy"][s["d"]].update(range(s["f"], s["t"]))
    return out


def kind_of(row: dict, s: dict) -> str:
    return s.get("k", "serve")


def wanted(row: dict, plan: dict, variant: str) -> dict:
    """{(station index, wd): hours} every station-hour the plan must put a line on.

    Written from the rule each variant states, never read off the plan's lines:
    full cover is every station every hour; the open-hours plan every station
    every open hour with complete data, and otherwise the demand plan's need
    with every open hour nothing read (basis `none`) at every station of the
    role; the demand plan at least as many of a role's stations as its need
    asks for each open hour; cleaning and security every hour the plan opens.
    A role's stations are its own (`roles[].stations`), so a hairdresser's head
    wash is a role apart from its chairs.
    """
    out = collections.defaultdict(set)
    frame = plan.get("open") or row.get("open") or [[] for _ in range(7)]
    opened = [{h for a, b in frame[wd] for h in range(max(0, a), min(24, b))} for wd in range(7)]
    role_stations = set()
    counts = {}
    for role in row.get("roles") or ():
        key = role.get("key", role["skill"])
        stations = list(role.get("stations") or ())
        role_stations.update(stations)
        counts[key] = stations
    for index, station in enumerate(row["stations"]):
        if index not in role_stations and station.get("skill") in COVER:
            for wd in range(7):
                out[("cover", index, wd)] |= opened[wd]
    need = row.get("need") or {}
    basis = row.get("basis") or {}
    for key, stations in counts.items():
        for wd in range(7):
            for hour in opened[wd]:
                if variant == "full" or (variant == "open" and plan.get("complete")):
                    n = len(stations)
                elif variant == "open":
                    n = len(stations) if basis.get(key, [[None] * 24] * 7)[wd][hour] == "none" \
                        else (need.get(key) or [[0] * 24] * 7)[wd][hour]
                else:
                    n = (need.get(key) or [[0] * 24] * 7)[wd][hour]
                # Station k is wanted where the need reaches k + 1.
                if int(n):
                    out[("role", key, wd, hour)] = (min(int(n), len(stations)), stations)
    return out


def problems(row: dict, plan: dict, variant: str, people: dict, site: str,
             hire: dict | None = None, coverage=True, protect=True, own_all=True,
             skilled_only=False) -> list:
    """Every rule `plan` (one variant of `row`) breaks, as (kind, text); [] when it keeps them all.

    `people` are the contracts (contracts()); `site` the row's business key, so
    the site's own people can be told from the bench; `hire` the plan's hire
    part (`_hire`, or the `hiring` key's plan) where the caller has it.
    `own_all` false owes a report only for the site's own people the row
    names at all: a factory's week leaves out whom its count search leaves
    spare, and says nothing of them (their hours now are none, or they would
    be in it). `skilled_only` owes it only for those holding a skill of the
    row's stations: an office plans its professionals and nobody else there.
    """
    out = []
    shifts = plan["shifts"]
    manned = set()
    for s in shifts:
        length = s["t"] - s["f"]
        if not (0 < length <= SHIFT_CAP and 0 <= s["f"] and s["t"] <= 24):
            out.append(("shift", f"a {length} h line {s}"))
        for hour in range(s["f"], s["t"]):
            if (s["s"], s["d"], hour) in manned:
                out.append(("station", f"station {s['s']} manned twice day {s['d']} {hour}:00"))
            manned.add((s["s"], s["d"], hour))
    weeks = week_of(row, shifts)
    taken = collections.defaultdict(set)
    for s in shifts:
        if s.get("p") is None:
            continue
        pid = row["people"][s["p"]]["id"]
        rule = people.get(pid)
        if rule is None:
            out.append(("person", f"{pid} is nobody the save holds"))
            continue
        station = row["stations"][s["s"]]
        k = kind_of(row, s)
        if station.get("skill") and station["skill"] not in rule["skills"]:
            out.append(("skill", f"{pid} on {station.get('name')} without {station['skill']}"))
        if k == "clean" and (rule["nocleaning"] or SERVICE_SKILL in rule["skills"]):
            out.append(("cleaning", f"{pid} cleans"))
        if rule["weekendsOff"] and s["d"] in WEEKEND:
            out.append(("weekend", f"{pid} works day {s['d']}"))
        for low, high in rule["blackouts"]:
            if low < s["t"] and s["f"] < high:
                out.append(("blackout", f"{pid} works {s['f']}-{s['t']} inside {low}-{high}"))
        span = set(range(s["f"], s["t"]))
        if span & taken[(pid, s["d"])]:
            out.append(("double", f"{pid} in two places on day {s['d']}"))
        taken[(pid, s["d"])] |= span
    for pid, mine in weeks.items():
        rule = people.get(pid)
        if rule is None:
            continue
        ceiling = (rule["band"] or FULL_TIME)[1]
        if mine["hours"] > ceiling:
            out.append(("ceiling", f"{pid} {mine['hours']} h over {ceiling}"))
        if rule["days"] is not None and len(mine["days"]) > rule["days"]:
            out.append(("days", f"{pid} {len(mine['days'])} days over {rule['days']}"))
        for wd, busy in mine["busy"].items():
            if len(busy) > SHIFT_CAP:
                out.append(("day", f"{pid} {len(busy)} h on day {wd}"))
    # Reported infeasibility, both ways: owed and said.
    named = {p["id"] for p in row["people"]}
    skills = {st.get("skill") for st in row["stations"]}
    here = {pid for pid, rule in people.items()
            if rule["site"] == site and (own_all or pid in named)
            and (not skilled_only or rule["skills"] & skills)} | set(weeks)
    owed_hours = {pid: (float(weeks[pid]["hours"] if pid in weeks else 0), people[pid]["band"][0])
                  for pid in here if pid in people and people[pid]["band"]
                  and (weeks[pid]["hours"] if pid in weeks else 0) < people[pid]["band"][0]}
    said_hours = {row["people"][e["p"]]["id"]: (float(e["hours"]), e["min"])
                  for e in plan.get("shortHours") or ()}
    if "shortHours" in plan and owed_hours != said_hours:
        out.append(("short", f"shortHours {said_hours} but the week owes {owed_hours}"))
    owed_days = {pid: (len(weeks[pid]["days"]) if pid in weeks else 0, people[pid]["days"])
                 for pid in here if pid in people and people[pid]["days"] is not None
                 and (len(weeks[pid]["days"]) if pid in weeks else 0) != people[pid]["days"]}
    said_days = {row["people"][e["p"]]["id"]: (e["days"], e["want"])
                 for e in plan.get("shortDays") or ()}
    if "shortDays" in plan and owed_days != said_days:
        out.append(("short", f"shortDays {said_days} but the week owes {owed_days}"))
    # Every station-hour the variant wants has a line, staffed or open.
    if coverage:
        on = collections.defaultdict(set)
        for s in shifts:
            on[(s["s"], s["d"])].update(range(s["f"], s["t"]))
        for key, want in wanted(row, plan, variant).items():
            if key[0] == "cover":
                missing = want - on[(key[1], key[2])]
                if missing:
                    out.append(("cover", f"{variant}: cover station {key[1]} day {key[2]} "
                                          f"has nobody at {sorted(missing)[:4]}"))
            else:
                n, stations = want
                have = sum(1 for index in stations if key[3] in on[(index, key[2])])
                if have < n:
                    out.append(("cover", f"{variant}: role {key[1]} day {key[2]} {key[3]}:00 "
                                          f"has {have} of {n} stations"))
    # The hires' weeks.
    if hire is not None:
        open_rows = {i for i, s in enumerate(shifts) if s.get("p") is None}
        claimed = collections.Counter()
        for w in hire.get("hireWeeks") or ():
            busy = collections.defaultdict(set)
            hours = 0
            for slot in w["slots"]:
                i = slot["shift"]
                if i not in open_rows:
                    out.append(("hire", f"a hire week points at line {i}, which is not open"))
                    continue
                s = shifts[i]
                if (s["d"], s["f"], s["t"]) != (slot["d"], slot["f"], slot["t"]):
                    out.append(("hire", f"a hire slot {slot} is not its line {s}"))
                claimed[i] += 1
                span = set(range(slot["f"], slot["t"]))
                if span & busy[slot["d"]]:
                    out.append(("hire", "a hire in two places at once"))
                busy[slot["d"]] |= span
                hours += slot["t"] - slot["f"]
            if hours > FULL_TIME[1] or any(len(b) > SHIFT_CAP for b in busy.values()):
                out.append(("hire", f"a hire week of {hours} h breaks a cap"))
            if hours != w["hours"] or len(busy) != w["days"]:
                out.append(("hire", f"a hire week says {w['hours']} h / {w['days']} d"))
        if any(n > 1 for n in claimed.values()):
            out.append(("hire", "one open line in two hire weeks"))
        if hire.get("hireWeeks") is not None and set(claimed) != open_rows:
            out.append(("hire", f"{len(open_rows - set(claimed))} open lines no hire week holds"))
    # The owner's rule for the people a site already has: checked for
    # everybody whose week here now the plan could keep whole.
    if protect:
        current = (row.get("current") or {}).get("list") or ()
        now = week_of(row, current)
        planned = {(row["stations"][s["s"]].get("skill"), kind_of(row, s)) for s in shifts}
        keepable = keepable_weeks(row, plan, current, people)
        for pid, cur in now.items():
            rule = people.get(pid)
            if rule is None or rule["site"] != site or not cur["hours"] or pid not in keepable:
                continue
            if not any((not skill or skill in rule["skills"])
                       and not (k == "clean" and (rule["nocleaning"] or SERVICE_SKILL in rule["skills"]))
                       for skill, k in planned):
                continue  # the plan staffs nothing they could work
            mine = weeks.get(pid)
            if not mine:
                continue  # no hours at all is spare, never worse off (29 September)
            band, want = rule["band"], rule["days"]
            if band and mine["hours"] < band[0] and mine["hours"] < cur["hours"]:
                out.append(("kept", f"{variant}: {pid} works {cur['hours']} h here now, "
                                    f"the plan gives {mine['hours']} under {band[0]}"))
            if want is not None and abs(len(mine["days"]) - want) > abs(len(cur["days"]) - want):
                out.append(("kept", f"{variant}: {pid} works {len(cur['days'])} days now, "
                                    f"the plan {len(mine['days'])} against {want}"))
    return out


def keepable_weeks(row: dict, plan: dict, current, people: dict) -> set:
    """Who holds a week here now that the plan could keep as it is.

    Every one of their lines inside the hours the plan opens, on a station of
    a role (or a cleaning or security post) the plan puts lines on, within
    12 hours a line and a day, on no station-hour somebody else holds now,
    and inside their own contract. Anybody else's week can only be kept in
    part, and the rule is not checked for them.
    """
    frame = plan.get("open") or row.get("open") or [[] for _ in range(7)]
    opened = [{h for a, b in frame[wd] for h in range(max(0, a), min(24, b))} for wd in range(7)]
    role_of = {}
    for role in row.get("roles") or ():
        for index in role.get("stations") or ():
            role_of[index] = role.get("key", role["skill"])
    staffed = {role_of.get(s["s"], ("post", s["s"])) for s in plan["shifts"]}
    held = collections.Counter()
    for s in current:
        for hour in range(s["f"], s["t"]):
            held[(s["s"], s["d"], hour)] += 1
    ok, bad, day = set(), set(), collections.Counter()
    for s in current:
        if s.get("p") is None:
            continue
        pid = row["people"][s["p"]]["id"]
        rule = people.get(pid)
        station = row["stations"][s["s"]]
        day[(pid, s["d"])] += s["t"] - s["f"]
        fits = (
            rule is not None
            and set(range(s["f"], s["t"])) <= opened[s["d"]]
            and role_of.get(s["s"], ("post", s["s"])) in staffed
            and s["t"] - s["f"] <= SHIFT_CAP
            and all(held[(s["s"], s["d"], h)] == 1 for h in range(s["f"], s["t"]))
            and (not station.get("skill") or station["skill"] in rule["skills"])
            and not (kind_of(row, s) == "clean"
                     and (rule["nocleaning"] or SERVICE_SKILL in rule["skills"]))
            and not (rule["weekendsOff"] and s["d"] in WEEKEND)
            and not any(a < s["t"] and s["f"] < b for a, b in rule["blackouts"])
        )
        (ok if fits else bad).add(pid)
    bad |= {pid for (pid, _d), hours in day.items() if hours > SHIFT_CAP}
    for pid, mine in week_of(row, current).items():
        rule = people.get(pid)
        if rule and (mine["hours"] > (rule["band"] or FULL_TIME)[1]
                     or (rule["days"] is not None and len(mine["days"]) > rule["days"])):
            bad.add(pid)
    return ok - bad


def shop_plans(row: dict):
    """(variant, plan, hire part) for every plan of a shop row."""
    yield "demand", row, row.get("_hire")
    if row.get("fullCover"):
        yield "full", row["fullCover"], row["fullCover"].get("_hire")
    if row.get("openCover"):
        yield "open", row["openCover"], row["openCover"].get("_hire")


def one_business_each(rows: list) -> list:
    """Anybody with a week at two sites of one save (the bench is shared)."""
    seen = collections.defaultdict(set)
    for row in rows:
        for _variant, plan, _hire in shop_plans(row):
            for pid in week_of(row, plan["shifts"]):
                seen[pid].add(row["key"])
    return [("site", f"{pid} works at {sorted(keys)}") for pid, keys in seen.items() if len(keys) > 1]


# --- the synthetic sweep ------------------------------------------------------------

EMPLOYEE_SHAPES = [
    (), (FULLTIME,), (PARTTIME,), (FULLTIME, FOUR_DAYS), (FULLTIME, FIVE_DAYS),
    (PARTTIME, FOUR_DAYS), ("ba:jobdemand_freeweekends",), ("ba:jobdemand_nocleaning",),
    # An hours band, a day count and a blackout window on one person: the shape
    # that needs the hours settled again after the days have moved.
    (FULLTIME, FIVE_DAYS, "ba:jobdemand_noevenings"),
    (FULLTIME, FOUR_DAYS, "ba:jobdemand_nomornings"),
    (PARTTIME, FIVE_DAYS, "ba:jobdemand_nonights"),
    (FULLTIME, FOUR_DAYS, "ba:jobdemand_freeweekends", "ba:jobdemand_noafternoons"),
]


def scenario(rng: random.Random) -> dict:
    """One random shop: stations, doors, customers and a crew, some off the bench."""
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
    crew = []
    for i in range(rng.randint(1, 10)):
        skills = rng.choice([[SERVICE], [SERVICE], [CLEANING], [GUARD], [SERVICE, CLEANING],
                             [CLEANING, GUARD]])
        crew.append(employee(f"e{i}", skills, demands=rng.choice(EMPLOYEE_SHAPES),
                             here=rng.random() < .8))
    return dict(items=items, employees=crew, hourly=hourly, opens=((a, b),),
                weeks=rng.choice([0, 2, 2]))


def current_from(row: dict, plan: dict, rng: random.Random, keep=0.8) -> list:
    """A game week to start from: most of a plan's own lines, as the save holds shifts.

    A week the planner itself wrote keeps every rule, so the people in it are
    satisfied now wherever that plan satisfied them.
    """
    out = []
    for s in plan["shifts"]:
        if s.get("p") is None:
            continue
        pid = row["people"][s["p"]]["id"]
        if not pid or rng.random() > keep:
            continue
        station = row["stations"][s["s"]]
        out.append({"wd": s["d"], "employeeId": pid, "itemInstanceId": station["id"],
                    "startingHour": s["f"], "endingHour": s["t"],
                    "type": ba_dashboard.CLEANING_SHIFT if s.get("k") == "clean" else 1})
    return out


def plan_with(sc: dict, shifts=(), hourly=None) -> tuple:
    """The shop of `sc` planned with the game week `shifts`: (row, contracts)."""
    for e in sc["employees"]:
        e["assignedWeeklyHours"] = 0
    rows = ts.plan_sites([dict(items=sc["items"], hourly=hourly or sc["hourly"], opens=sc["opens"],
                               weeks=sc["weeks"], shifts=list(shifts))], sc["employees"])
    return rows[0], contracts({"EmployeeInstances": {"$items": sc["employees"]}})


class OracleSweepTest(unittest.TestCase):
    """Every plan of every synthetic shop, office and factory keeps the rules."""

    def check_row(self, row, people, label):
        self.assertFalse(row.get("failed"), label)
        for variant, plan, hire in shop_plans(row):
            found = problems(row, plan, variant, people, row["key"], hire)
            self.assertEqual(found, [], f"{label} {variant}")

    def test_the_invariant_shops(self):
        for spec in ts.RosterInvariantTest.SHOPS:
            row, crew = ts.RosterInvariantTest().shop(spec)
            people = contracts({"EmployeeInstances": {"$items": crew}})
            self.check_row(row, people, spec[0])

    def test_random_shops_and_the_weeks_they_start_from(self):
        """Planned from nothing, then planned again from a week of their own
        with fewer customers, so the plan has hours to take off people the old
        week satisfied (the owner's rule decides what it may take)."""
        rng = random.Random(11)
        for n in range(70):
            sc = scenario(rng)
            row, people = plan_with(sc)
            self.check_row(row, people, f"shop {n}")
            source = rng.choice([row, row["fullCover"]])
            week = current_from(row, source, rng)
            quiet = {h: c // rng.choice([2, 3, 5]) for h, c in sc["hourly"].items()}
            again, people = plan_with(sc, week, quiet)
            self.check_row(again, people, f"shop {n} again")

    def test_a_hairdresser_s_head_wash_in_every_variant(self):
        case = ts.HeadWashTest()
        for kw in (dict(weeks=0, days_open=1), dict(day=7, weeks=2, days_open=6,
                                                    hours=set(range(10, 14)))):
            for stylists in (0, 2, 6):
                row, site = case.shop(stylists, **kw)
                crew = [employee(f"p{i}", [case.STYLIST]) for i in range(stylists)]
                people = contracts({"EmployeeInstances": {"$items": crew}})
                for variant, plan, _hire in shop_plans(row):
                    hire = site["plans"].get("open") if variant == "open" else None
                    self.assertEqual(problems(row, plan, variant, people, row["key"], hire), [],
                                     (stylists, kw, variant))

    def test_offices(self):
        from test_staff_hire import office_rows, lawyer
        rng = random.Random(3)
        for n in range(12):
            crew = []
            for i in range(rng.randint(0, 14)):
                person = lawyer(f"l{i:02d}", here=rng.random() < .85)
                person["demands"] = {"$items": list(rng.choice(EMPLOYEE_SHAPES))}
                crew.append(person)
            opens = rng.choice([[[[8, 20]] for _ in range(7)], [[[0, 24]] for _ in range(7)],
                                [[[9, 17]] if wd not in (6, 0) else [] for wd in range(7)]])
            _save, business, rows = office_rows(rng.randint(1, 8), opens, crew)
            people = contracts({"EmployeeInstances": {"$items": crew}})
            for row in rows:
                found = problems(row, row, "office", people, row["key"], row.get("_hire"),
                                 coverage=False, skilled_only=True)
                self.assertEqual(found, [], n)
                self.assertEqual(office_cover(row), [], n)

    def test_factories(self):
        from test_factory_staffing import People, hand_rows
        rng = random.Random(8)
        for n in range(15):
            lines = [(f"l{i}", rng.randint(1, 4), rng.choice([24, 16, 12]),
                      rng.choice([24, 12, 8, 0]), rng.choice([24, 8, 0]))
                     for i in range(rng.randint(1, 3))]
            crew = People()
            for _ in range(rng.randint(0, 6)):
                crew.add(1, demands=rng.choice(EMPLOYEE_SHAPES))
            for _ in range(rng.randint(0, 2)):
                crew.add(1, demands=rng.choice(EMPLOYEE_SHAPES), addr=None)
            rows = hand_rows(lines, crew)
            people = {r["id"]: factory_contract(r, s) for r, s in zip(crew.save_rows, crew.staff)}
            for mode, found in rows.items():
                for row in found:
                    self.assertEqual(problems(row, row, mode, people, row["key"],
                                              row.get("_hire"), coverage=False, own_all=False),
                                     [], (n, mode))
                    self.assertEqual(factory_cover(row), [], (n, mode))


def factory_contract(save_row: dict, staff_row: dict) -> dict:
    """A contract off the factory tests' People, which hold the save row and the staff row apart."""
    return contract({"demands": {"$items": save_row["demands"]},
                     "characterData": {"skills": {"$items": [{"name": s} for s in staff_row["skills"]]}},
                     "assignedAddress": {"streetName": staff_row["addr"][0],
                                         "streetNumber": staff_row["addr"][1]}
                     if staff_row["addr"] else None})


def office_cover(row: dict) -> list:
    """Peter's office default, written out again: every computer's hours have a line."""
    computers, always = row["computers"], row["alwaysOn"]
    opened = [{h for a, b in row["open"][wd] for h in range(a, b)} for wd in range(7)]
    on = collections.defaultdict(set)
    for s in row["shifts"]:
        on[(s["s"], s["d"])].update(range(s["f"], s["t"]))
    out = []
    for index in range(computers):
        for wd in range(7):
            if index < always:
                want = set(range(24))
            elif wd not in WEEKEND or index < math.ceil(computers / 2):
                want = set(range(8, 22))
            else:
                want = set()
            missing = (want & opened[wd]) - on[(index, wd)]
            if missing:
                out.append(("cover", f"computer {index} day {wd} has nobody at {sorted(missing)[:4]}"))
    return out


def factory_cover(row: dict) -> list:
    """Every machine of every line has a line of the week for the hours its line runs."""
    on = collections.defaultdict(set)
    for s in row["shifts"]:
        on[(s["s"], s["d"])].update(range(s["f"], s["t"]))
    out, index = [], 0
    for line in row["lines"]:
        for _ in range(line["machines"]):
            for wd in range(7):
                missing = set(range(line["from"], line["to"])) - on[(index, wd)]
                if missing:
                    out.append(("cover", f"{line['item']} machine {index} day {wd}"))
            index += 1
    return out


class OracleSnapshotTest(unittest.TestCase):
    """The payload snapshot fixtures' plans, through extract() as the board gets them."""

    def payloads(self):
        import es3_fixture
        import save_fixtures
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "payload.hsg")
            es3_fixture.write_link_save(path)
            save = load_save(path)
            yield "link", save, ba_dashboard.extract(save, Names({}), None)
            names = save_fixtures.data_names()
            history = os.path.join(tmp, "history.json")
            for day in (save_fixtures.DAY, save_fixtures.DAY + 7):
                save_fixtures.write_data_save(path, day)
                save = load_save(path)
                yield f"day {day}", save, ba_dashboard.extract(save, Names(dict(names)), history)

    def test_every_plan_in_the_payload(self):
        checked = 0
        for label, save, payload in self.payloads():
            people = {}
            for e in save.items(save.root.get("EmployeeInstances")):
                addr = save.address(e.get("assignedAddress"))
                char = ba_dashboard._character(save, e)
                people[e.get("id")] = {
                    "skills": {s["skill"] for s in ba_dashboard._skill_rows(char)},
                    **{k: v for k, v in contract({"demands": {"$items": [
                        d for d in save.items(e.get("demands")) if isinstance(d, str)]}}).items()
                       if k not in ("skills", "site")},
                    "site": ts.site_key(addr) if addr else None,
                }
            hiring = {site["key"]: site for site in payload["hiring"]["sites"]}
            names = {"demand": "demand", "full": None, "open": "open"}
            for row in payload["staffing"]:
                if row.get("failed"):
                    continue
                site = hiring.get(row["key"]) or {"plans": {}}
                for variant, plan, _ in shop_plans(row):
                    hire = site["plans"].get(names[variant]) if names[variant] else None
                    self.assertEqual(problems(row, plan, variant, people, row["key"], hire), [],
                                     (label, row["name"], variant))
                    checked += 1
            for row in payload.get("officeStaffing") or ():
                if row.get("failed"):
                    continue
                hire = (hiring.get(row["key"]) or {"plans": {}})["plans"].get("office")
                self.assertEqual(problems(row, row, "office", people, row["key"], hire,
                                          coverage=False, skilled_only=True)
                                 + office_cover(row), [], label)
                checked += 1
            for mode, rows in (payload.get("factoryStaffing") or {}).items():
                for row in rows:
                    if row.get("failed"):
                        continue
                    hire = (hiring.get(row["key"]) or {"plans": {}})["plans"].get(mode)
                    self.assertEqual(problems(row, row, mode, people, row["key"], hire,
                                              coverage=False, own_all=False)
                                     + factory_cover(row), [], label)
                    checked += 1
            self.assertEqual(one_business_each(
                [r for r in payload["staffing"] if not r.get("failed")]), [], label)
        self.assertGreater(checked, 5)


class OracleControlTest(unittest.TestCase):
    """The oracle fails on a week that breaks a rule, and each pin fails when its fix goes.

    A checker that never fails proves nothing: each case below breaks one rule
    in a good week, or takes one fix out of the planner, and the oracle has to
    say so under the right kind.
    """

    def good(self):
        spec = ts.RosterInvariantTest.SHOPS[2]  # "everything at once"
        row, crew = ts.RosterInvariantTest().shop(spec)
        people = contracts({"EmployeeInstances": {"$items": crew}})
        self.assertEqual(problems(row, row, "demand", people, row["key"], row["_hire"]), [])
        return row, people

    def kinds(self, row, plan, people, variant="demand", hire=None):
        return {kind for kind, _text in problems(row, plan, variant, people, row["key"], hire)}

    def staffed(self, row, who):
        index = next(i for i, p in enumerate(row["people"]) if p["id"] == who)
        return [s for s in row["shifts"] if s.get("p") == index]

    def test_a_thirteen_hour_line(self):
        row, people = self.good()
        broken = json.loads(json.dumps(row))
        s = next(s for s in broken["shifts"] if s.get("p") is not None)
        s["f"], s["t"] = 0, 13
        self.assertIn("shift", self.kinds(broken, broken, people))

    def test_a_line_twice(self):
        row, people = self.good()
        broken = json.loads(json.dumps(row))
        broken["shifts"].append(dict(next(s for s in broken["shifts"] if s.get("p") is not None)))
        found = self.kinds(broken, broken, people)
        self.assertIn("station", found)
        self.assertIn("double", found)

    def test_a_weekend_for_free_weekends(self):
        row, people = self.good()
        broken = json.loads(json.dumps(row))
        s = self.staffed(broken, "f")[0]
        s["d"] = 6
        self.assertIn("weekend", self.kinds(broken, broken, people))

    def test_a_server_on_cleaning(self):
        row, people = self.good()
        broken = json.loads(json.dumps(row))
        s = self.staffed(broken, "a")[0]
        s["k"] = "clean"
        self.assertIn("cleaning", self.kinds(broken, broken, people))

    def test_a_blackout(self):
        row, people = self.good()
        broken = json.loads(json.dumps(row))
        s = self.staffed(broken, "c")[0]  # no afternoons
        s["f"], s["t"] = 13, 17
        self.assertIn("blackout", self.kinds(broken, broken, people))

    def test_a_short_week_left_unsaid(self):
        row, people = self.good()
        broken = json.loads(json.dumps(row))
        mine = self.staffed(broken, "d")
        broken["shifts"] = [s for s in broken["shifts"] if s not in mine[1:]]
        for s in mine[1:]:
            broken["shifts"].append(dict(s, p=None))
        self.assertIn("short", self.kinds(broken, broken, people))

    def test_a_station_hour_with_no_line(self):
        row, people = self.good()
        broken = json.loads(json.dumps(row))
        broken["shifts"] = [s for s in broken["shifts"] if s.get("k") != "security"]
        self.assertIn("cover", self.kinds(broken, broken, people))

    def test_a_hire_week_on_a_staffed_line(self):
        row, people = self.good()
        hire = json.loads(json.dumps(row["_hire"]))
        if not hire["hireWeeks"]:
            hire["hireWeeks"] = [{"skill": SERVICE, "hours": 0, "days": 0, "slots": []}]
        staffed = next(i for i, s in enumerate(row["shifts"]) if s.get("p") is not None)
        s = row["shifts"][staffed]
        hire["hireWeeks"][0]["slots"].append({"shift": staffed, "d": s["d"], "f": s["f"],
                                              "t": s["t"], "station": None})
        self.assertIn("hire", self.kinds(row, row, people, hire=hire))

    def test_without_the_head_wash_fix_the_open_plan_leaves_it_empty(self):
        """The fix of PR 1 (_open_floor() by role): counted by skill again,
        the open-hours plan of a new hairdresser has no head wash."""
        case = ts.HeadWashTest()

        def by_skill(need, grid):
            stations = collections.Counter(s["skill"] for s in grid["stations"])
            out = {}
            for skill, row in need.items():
                cells = [list(day) for day in row["need"]]
                basis = [list(day) for day in row["basis"]]
                count = stations.get(skill, 0)
                for wd in range(7):
                    for start, end in grid["open"][wd]:
                        for hour in range(max(0, start), min(24, end)):
                            if count and basis[wd][hour] == "none":
                                cells[wd][hour] = count
                                basis[wd][hour] = "open"
                out[skill] = dict(row, need=cells, basis=basis)
            return out

        for patched in (False, True):
            with unittest.mock.patch.object(ba_dashboard, "_open_floor",
                                            by_skill if patched else ba_dashboard._open_floor):
                row, _site = case.shop(2, weeks=0, days_open=1)
            crew = contracts({"EmployeeInstances": {"$items": [
                employee(f"p{i}", [case.STYLIST]) for i in range(2)]}})
            found = {k for k, _t in problems(row, row["openCover"], "open", crew, row["key"])}
            self.assertEqual("cover" in found, patched)

    def stub(self):
        """Two full-timers on 32 hours each now, on two registers, and customers
        for one register 08-16, 56 hours: the fewest people is one on 48 and
        the other on a stub of 8, which no swap can lift to 30."""
        crew = [employee("a", [SERVICE], demands=(FULLTIME,)),
                employee("b", [SERVICE], demands=(FULLTIME,))]
        shifts = [{"wd": wd, "employeeId": who, "itemInstanceId": reg, "startingHour": 8,
                   "endingHour": 16, "type": 1}
                  for who, reg, days in (("a", 1, (0, 1, 2, 3)), ("b", 2, (3, 4, 5, 6)))
                  for wd in days]
        sc = dict(items=[(1, REGISTER), (2, REGISTER)], employees=crew,
                  hourly={h: (12 if 8 <= h < 16 else 0) for h in range(24)}, opens=((8, 16),),
                  weeks=2)
        return sc, shifts

    def test_without_the_rule_for_existing_staff_a_week_is_cut_short(self):
        sc, shifts = self.stub()
        row, people = plan_with(sc, shifts)
        self.assertEqual({k for k, _t in problems(row, row, "demand", people, row["key"])}
                         & {"kept"}, set())
        with unittest.mock.patch.object(ba_dashboard, "_weeks_now", lambda current, pool: {}):
            row, people = plan_with(sc, shifts)
        self.assertIn("kept", {k for k, _t in problems(row, row, "demand", people, row["key"])})

    def test_no_hours_at_all_is_not_worse_off(self):
        """The owner's answer (29 September 2026): 0 h is fine, the person is spare."""
        sc, shifts = self.stub()
        row, people = plan_with(sc, shifts)
        emptied = json.loads(json.dumps(row))
        b = next(i for i, p in enumerate(emptied["people"]) if p["id"] == "b")
        emptied["shifts"] = [x for x in emptied["shifts"] if x.get("p") != b]
        emptied["shortHours"] = [{"p": b, "hours": 0.0, "min": 30, "planned": True}]
        self.assertEqual({k for k, _t in problems(emptied, emptied, "demand", people,
                                                  emptied["key"], coverage=False)}, set())

    def test_a_hire_ranks_after_every_real_person(self):
        """A placeholder holds one skill, so the scarcity key alone would start
        it ahead of a real person holding two; it is ranked after them all."""
        real = {"id": "r", "name": "R", "skills": {SERVICE, CLEANING}, "wage": 9.0, "addr": ("x", 1),
                "demands": [], "band": None, "days": None, "weekendsOff": False, "blackouts": [],
                "nocleaning": False, "training": False, "now": 0, "home": set(), "desks": []}
        hire = ba_dashboard._placeholder(SERVICE, 0)
        slot = {"wd": 1, "from": 8, "to": 16, "skill": SERVICE, "kind": "serve", "station": 1}
        state = {"r": ba_dashboard._fresh_state(), hire["id"]: ba_dashboard._fresh_state()}
        here = {"groups": {}, "rostered": {hire["id"]}, "flex": {"r": 2, hire["id"]: 1}}
        self.assertLess(ba_dashboard._placement_rank(real, state["r"], slot, here),
                        ba_dashboard._placement_rank(hire, state[hire["id"]], slot, here))
        self.assertIs(ba_dashboard._best_for(slot, [hire, real], state, here), real)


if __name__ == "__main__":
    unittest.main()
