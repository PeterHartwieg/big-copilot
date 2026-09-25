"""The staffing and hour-grid words as messages (sp.py.*), English unchanged.

_hour_phrase(), _off_hours(), _idle_parts(), _role_words(), _hour_findings()'s
limit, fix and noun, _staff_notes() and the factory roster's line and station
names return msg()s now. Each writes, byte for byte, what the f-strings it
replaced wrote: the old code is kept here as the reference and both run over
the same inputs. docs/architecture.md, "UI text".

Synthetic data only.
"""
import collections
import itertools
import json
import random
import unittest

from ba_dashboard import (
    IDLE_PARTS, PHRASE_SHAPES, STAFF_HOURS, WEEKDAYS, Msg, _cap_first, _hour_phrase, _idle_parts,
    _off_hours, _role_words, _sp_counters, _staff_notes, _wire_msgs, msg, plain, tok,
)
from tests import theatre_fixture


# --- the code these replaced, as it stood before the conversion ------------
def old_hour_phrase(hours_by_day, sep="; "):
    def runs(hours):
        out, start = [], None
        for h in range(25):
            if h in hours and start is None:
                start = h
            elif h not in hours and start is not None:
                out.append(f"{start}-{h}" if h - start > 1 else f"{start}")
                start = None
        return out

    shapes = collections.defaultdict(list)
    for wd, hours in hours_by_day.items():
        shapes[tuple(runs(hours))].append(wd)
    parts, spare = [], 0
    ranked = sorted(shapes.items(), key=lambda kv: (-len(kv[1]), -len(kv[0])))
    for shape, days in ranked:
        order = [1, 2, 3, 4, 5, 6, 0]
        picked = sorted(days, key=order.index)
        if len(parts) >= PHRASE_SHAPES:
            spare += sum(len(h) for d, h in hours_by_day.items() if d in picked)
            continue
        if len(picked) == 7:
            label = "every day"
        elif len(picked) > 2 and [order.index(d) for d in picked] == list(
            range(order.index(picked[0]), order.index(picked[0]) + len(picked))
        ):
            label = f"{WEEKDAYS[picked[0]][:3]}-{WEEKDAYS[picked[-1]][:3]}"
        else:
            label = ", ".join(WEEKDAYS[d][:3] for d in picked)
        parts.append(f"{label} {', '.join(shape)}")
    phrase = sep.join(parts)
    return f"{phrase} and {spare} scattered hours" if spare else phrase


def old_off_hours(covered):
    weekdays = (1, 2, 3, 4, 5, 6, 0)
    groups = {}
    for day, wd in enumerate(weekdays):
        gaps = [h for h in range(24) if (wd, h) not in covered]
        if not gaps:
            continue
        runs, start, prev = [], gaps[0], gaps[0]
        for h in gaps[1:]:
            if h != prev + 1:
                runs.append(f"{start}-{prev + 1}")
                start = h
            prev = h
        runs.append(f"{start}-{prev + 1}")
        groups.setdefault(', '.join(runs), []).append(day)
    parts = []
    for hours, days in groups.items():
        ranges, start, prev = [], days[0], days[0]

        def day_range(first, last):
            a, b = (WEEKDAYS[weekdays[d]][:3] for d in (first, last))
            return a if first == last else f"{a}-{b}"
        for day in days[1:]:
            if day != prev + 1:
                ranges.append(day_range(start, prev))
                start = day
            prev = day
        ranges.append(day_range(start, prev))
        parts.append(f"{', '.join(ranges)} {hours}")
    return "; ".join(parts)


def old_idle_parts(parts, default):
    ranked = sorted(range(len(parts)), key=lambda i: (-(parts[i].get("spare") or 0), i))
    named = sorted(ranked[:IDLE_PARTS])
    said = "; ".join(
        f"{parts[i]['staff']} {parts[i]['noun'] or default} {parts[i]['when']}" for i in named
    )
    more = len(parts) - len(named)
    return f"{said} (and {more} more)" if more else said


def old_staff_text(named, slot, hours, week, off, lost):
    return (
        f"{named} machine at list position {slot} is staffed "
        f"{hours} of {week} hours"
        + (" needed" if week < STAFF_HOURS else "")
        + f"; nobody on it {off}"
        + (f"; {lost:,} a day not made" if lost else "")
    )


def random_hours(rng):
    """A weekday -> set of hours map, from sparse to every hour of the week."""
    out = {}
    for wd in range(7):
        if rng.random() < 0.3:
            continue
        kind = rng.random()
        if kind < 0.2:
            out[wd] = set(range(24))
        elif kind < 0.5:
            a = rng.randrange(24)
            out[wd] = set(range(a, min(24, a + rng.randrange(1, 12))))
        else:
            out[wd] = {h for h in range(24) if rng.random() < 0.3}
    return out


def keys_in(m):
    """Every key a message and its nested messages use."""
    if not isinstance(m, Msg):
        return set()
    return {m.key} | set().union(*(keys_in(v) for v in m.p.values()))


class PhrasesAreTheOldEnglish(unittest.TestCase):
    def test_hour_phrase(self):
        rng = random.Random(7)
        fixed = [{}, {1: set(range(8, 12))}, {wd: set(range(24)) for wd in range(7)},
                 {wd: {8, 9, 10, 18, 19} for wd in (1, 2, 3, 4)}, {0: {3}, 6: {3}, 1: {3}},
                 {1: {1}, 2: {2}, 3: {3}, 4: {4}, 5: {5}}]
        for case in fixed + [random_hours(rng) for _ in range(400)]:
            for sep in ("; ", " and "):
                with self.subTest(case=case, sep=sep):
                    got = _hour_phrase(case, sep=sep)
                    self.assertEqual(got, old_hour_phrase(case, sep=sep))
                    if got:
                        self.assertIsInstance(got, Msg)
                        self.assertTrue(all(k.startswith("sp.py.") for k in keys_in(got)))

    def test_off_hours(self):
        rng = random.Random(11)
        cases = [set(), {(wd, h) for wd in range(7) for h in range(24)}]
        for _ in range(300):
            cases.append({(wd, h) for wd, hours in random_hours(rng).items() for h in hours})
        for covered in cases:
            with self.subTest(covered=sorted(covered)[:5]):
                got = _off_hours(covered)
                self.assertEqual(got, old_off_hours(covered))
                if got:
                    self.assertIsInstance(got, Msg)

    def test_idle_parts(self):
        rng = random.Random(3)
        for count in range(1, 6):
            for _ in range(20):
                parts = [{"staff": rng.randrange(2, 9), "spare": rng.randrange(0, 30),
                          "noun": rng.choice([None, "fitness planning boards"]),
                          "when": _hour_phrase(random_hours(rng), sep=" and ") or "Mon 8"}
                         for _ in range(count)]
                for office in (False, True):
                    got = _idle_parts(parts, _sp_counters(office))
                    self.assertEqual(got, old_idle_parts(parts, "workstations" if office else "counters"))
                    self.assertIsInstance(got, Msg)
                    # The plain default the Today line passes today reads the same.
                    self.assertEqual(_idle_parts(parts, "counters"), old_idle_parts(parts, "counters"))

    def test_staff_notes(self):
        tea = tok("ba:itemname_tea", "Tea")
        for week_dem, hours, lost_rate in itertools.product((None, 12), (40, 100), (0, 30.4)):
            line = {"item": "Tea", "slug": "ba:itemname_tea", "workstation": "Drink", "rate": lost_rate,
                    "gaps": [{"slot": 3, "hours": hours, "off": _off_hours({(1, h) for h in range(8, 20)})}]}
            if week_dem:
                line["needHours"] = {"dem": week_dem}
            factories = {"sites": [{"s": 0, "lines": [line], "unnamed": []}]}
            businesses = [{"key": "k", "name": "Works"}]
            for mode in ("cap", "dem"):
                notes = _staff_notes(businesses, factories, set(), mode)
                week = week_dem * 7 if mode == "dem" and week_dem else STAFF_HOURS
                if hours >= week:
                    self.assertEqual(notes, [])
                    continue
                [row] = notes
                lost = round((week - hours) / 7 * lost_rate)
                with self.subTest(mode=mode, week=week, hours=hours, lost=lost):
                    self.assertEqual(row["text"], old_staff_text(tea, 3, hours, week, line["gaps"][0]["off"], lost))
                    self.assertTrue(row["text"].key.startswith("sp.py.staff"))
                    self.assertEqual(row["named"], f"{tea} at position 3")
                    self.assertEqual(row["subject"], "Tea at position 3")
                    _wire_msgs(row)
                    self.assertEqual(row["i18n"]["text"][0], row["text"].key)


class LimitsAndCapitals(unittest.TestCase):
    def test_role_words_are_the_old_words(self):
        service = _role_words({"skill": "ba:skill_customerservice"}, False)
        self.assertEqual((service["staffing"], service["posts"]),
                         (("staffing", "more service staff on those hours"), ("registers", "another counter")))
        office = _role_words({"skill": None}, True)
        self.assertEqual((office["staffing"], office["posts"]),
                         (("staffing", "more staff at the computers on those hours"),
                          ("workstations", "another computer workstation")))
        trainer = tok("ba:skill_gymtrainer", "Gym Trainer")
        gym = _role_words({"skill": "ba:skill_gymtrainer", "label": "Gym Trainer",
                           "station": "Fitness Planning Board"}, False)
        self.assertEqual(gym["staffing"], (f"{trainer} staffing", f"another {trainer} on those hours"))
        self.assertEqual(gym["posts"], ("fitness planning boards", "another fitness planning board"))
        # The station's plural is the game's name in English, so a plain str.
        self.assertIs(type(gym["posts"][0]), str)
        self.assertIs(type(gym["noun"]), str)
        for words in (service, office, gym):
            for said in (words["staffing"][0], words["staffing"][1], words["posts"][1]):
                self.assertIsInstance(said, Msg)

    def test_cap_first_writes_the_old_capital_and_keeps_the_message(self):
        trainer = tok("ba:skill_gymtrainer", "Gym Trainer")
        joined = msg("sp.py.list.and", "{a} and {b}", a=msg("sp.py.limit.staffing", "staffing"),
                     b="projection booths")
        cases = [
            (msg("sp.py.limit.staffing", "staffing"), "sp.py.limit.staffing.first"),
            (msg("sp.py.limit.registers", "registers"), "sp.py.limit.registers.first"),
            (msg("sp.py.workstations", "workstations"), "sp.py.workstations.first"),
            (joined, "sp.py.list.and"),
            (msg("sp.py.limit.role", "{role} staffing", role=trainer), "sp.py.limit.role"),
        ]
        for limit, key in cases:
            with self.subTest(limit=limit):
                got = _cap_first(limit)
                self.assertEqual(got, limit[:1].upper() + limit[1:])
                self.assertIsInstance(got, Msg)
                self.assertEqual(got.key, key)
        self.assertEqual(_cap_first(joined).wire()[1]["a"], {"m": ["sp.py.limit.staffing.first", {}, "Staffing"]})
        # A station's own plural is a str, and stays one.
        self.assertEqual(_cap_first("projection booths"), "Projection booths")
        self.assertEqual(_cap_first(""), "")

    def test_the_theatre_findings_read_as_before_and_carry_their_messages(self):
        rows = theatre_fixture.rows()
        caps = [f for f in rows["findings"] if f["kind"] == "cap"]
        self.assertEqual(sorted((plain(f["limit"]), plain(f["fix"]), f["when"]) for f in caps), sorted([
            ("staffing and projection booths", "more service staff on those hours and another projection booth",
             "Mon 10"),
            ("Projectionist staffing", "another Projectionist on those hours", "Mon 12"),
        ]))
        payload = json.loads(json.dumps(_wire_msgs({"hourFindings": rows["findings"]})))
        for f in payload["hourFindings"]:
            if f["kind"] == "cap":
                self.assertLessEqual({"limit", "fix", "when"}, set(f["i18n"]))
                self.assertEqual(f["i18n"]["when"][0], "sp.py.when.part")


if __name__ == "__main__":
    unittest.main()
