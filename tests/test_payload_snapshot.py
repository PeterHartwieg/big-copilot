"""extract() payload snapshots; after an intended change run `python tests/test_payload_snapshot.py --update`, review the diff and commit tests/fixtures/payload_snapshot/.

Three cases, each extract() end to end on a synthetic ES3 save, compared with
json.dumps(payload, sort_keys=True, indent=1) as committed:

- link: tests/es3_fixture.py's skeleton company, with no game text.
- data_day40: tests/save_fixtures.py's trading company on its day N (40),
  with its own game text and a fresh history file.
- data_day47_history: the same company a week later (day N + 7), extracted
  against the history file the day-40 run wrote, so the ledger, cash flow, net
  worth carried forward and demand trend have two readings behind them.

The payload's wall-clock fields (WALL_CLOCK) are replaced with a placeholder;
everything else must be byte-identical across runs and hash seeds.
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, ROOT)

import ba_dashboard  # noqa: E402
import es3_fixture  # noqa: E402
import save_fixtures  # noqa: E402
from ba_save import Names, load_save  # noqa: E402

SNAPSHOTS = os.path.join(HERE, "fixtures", "payload_snapshot")
UPDATE = os.environ.get("UPDATE_SNAPSHOTS") == "1"
UPDATE_HINT = ("If the change is intended, regenerate the snapshots with "
               "`python tests/test_payload_snapshot.py --update`, review the diff and commit "
               "tests/fixtures/payload_snapshot/.")
# Fields that hold the time of the run or of the save file, never the save's content.
WALL_CLOCK = (("meta", "generated"), ("meta", "saved"))
PLACEHOLDER = "<wall clock>"
SAVE_NAME = "payload.hsg"  # meta.source is the save's file name, so it is fixed
MAX_DIFFS = 15


def normalise(payload: dict) -> dict:
    for path in WALL_CLOCK:
        node = payload
        for key in path[:-1]:
            node = node[key]
        if path[-1] in node:
            node[path[-1]] = PLACEHOLDER
    return payload


def dump(payload: dict) -> str:
    return json.dumps(normalise(payload), sort_keys=True, indent=1, ensure_ascii=False) + "\n"


def snapshots() -> dict:
    """{case name: the snapshot text} for every case, freshly extracted."""
    out = {}
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, SAVE_NAME)
        es3_fixture.write_link_save(path)
        out["link"] = dump(ba_dashboard.extract(load_save(path), Names({}), None))

        names = save_fixtures.data_names()
        history = os.path.join(tmp, "history.json")
        for day, case in ((save_fixtures.DAY, "data_day40"),
                          (save_fixtures.DAY + 7, "data_day47_history")):
            save_fixtures.write_data_save(path, day)
            out[case] = dump(ba_dashboard.extract(load_save(path), Names(dict(names)), history))
    return out


def _flatten(value, path="", out=None) -> dict:
    out = {} if out is None else out
    if isinstance(value, dict) and value:
        for key in sorted(value):
            _flatten(value[key], f"{path}.{key}" if path else key, out)
    elif isinstance(value, list) and value:
        for i, item in enumerate(value):
            _flatten(item, f"{path}[{i}]", out)
    else:
        out[path] = value
    return out


def _short(value) -> str:
    text = json.dumps(value, ensure_ascii=False)
    return text if len(text) <= 80 else text[:77] + "..."


def _top(path: str) -> str:
    return path.split(".", 1)[0].split("[", 1)[0]


def diff(expected: str, actual: str) -> str:
    """The differing paths between two snapshot texts: a count per top-level
    key, then a sample in document order that takes from every top-level key
    in turn, so one inserted row cannot hide a change elsewhere."""
    old, new = _flatten(json.loads(expected)), _flatten(json.loads(actual))
    by_top = {}
    for path in list(old) + [p for p in new if p not in old]:
        if path not in new:
            line = f"  - {path}: {_short(old[path])} (gone)"
        elif path not in old:
            line = f"  + {path}: {_short(new[path])} (new)"
        elif old[path] != new[path] or type(old[path]) is not type(new[path]):
            line = f"  ~ {path}: {_short(old[path])} -> {_short(new[path])}"
        else:
            continue
        by_top.setdefault(_top(path), []).append(line)
    if not by_top:
        return "  (same values; only the text differs, e.g. key order or float format)"
    total = sum(len(lines) for lines in by_top.values())
    head = f"  {total} differing paths: " + ", ".join(f"{k}: {len(v)}" for k, v in by_top.items())
    # Round robin over the top-level keys, then back into document order.
    taken = [0] * len(by_top)
    queues = list(by_top.values())
    while sum(taken) < min(MAX_DIFFS, total):
        for i, lines in enumerate(queues):
            if taken[i] < len(lines) and sum(taken) < MAX_DIFFS:
                taken[i] += 1
    shown = [line for i, lines in enumerate(queues) for line in lines[:taken[i]]]
    if total > len(shown):
        shown.append(f"  ... and {total - len(shown)} more")
    return "\n".join([head] + shown)


def read(case: str) -> str | None:
    try:
        with open(os.path.join(SNAPSHOTS, case + ".json"), encoding="utf-8") as fh:
            # A checkout with core.autocrlf may hand the file back with CRLF.
            return fh.read().replace("\r\n", "\n")
    except FileNotFoundError:
        return None


def write_all(texts: dict) -> None:
    """Write every case, drop a snapshot no case makes any more, and name on
    stderr each file that changed."""
    os.makedirs(SNAPSHOTS, exist_ok=True)
    for name in sorted(os.listdir(SNAPSHOTS)):
        if name.endswith(".json") and name[:-5] not in texts:
            os.remove(os.path.join(SNAPSHOTS, name))
            print(f"payload snapshot: removed {name}", file=sys.stderr)
    for case, text in texts.items():
        if read(case) == text:
            continue
        with open(os.path.join(SNAPSHOTS, case + ".json"), "w", encoding="utf-8", newline="\n") as fh:
            fh.write(text)
        print(f"payload snapshot: rewrote {case}.json", file=sys.stderr)


class PayloadSnapshotTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.texts = snapshots()
        if UPDATE:
            write_all(cls.texts)

    def check(self, case: str):
        expected = read(case)
        if expected is None:
            self.fail(f"no snapshot for {case} in {SNAPSHOTS}. {UPDATE_HINT}")
        actual = self.texts[case]
        if actual != expected:
            self.fail(f"extract() payload for {case} differs from "
                      f"tests/fixtures/payload_snapshot/{case}.json:\n{diff(expected, actual)}\n{UPDATE_HINT}")

    def test_link_skeleton(self):
        self.check("link")

    def test_data_company_day_n(self):
        self.check("data_day40")

    def test_data_company_a_week_later_against_its_history(self):
        self.check("data_day47_history")

    def test_the_data_company_reaches_the_producers_it_is_for(self):
        """Guard the fixture itself: a later edit that empties a producer would
        still pass the snapshot once regenerated, so name what it must reach."""
        day40 = json.loads(self.texts["data_day40"])
        later = json.loads(self.texts["data_day47_history"])
        self.assertTrue(day40["daily"] and day40["loans"] and day40["homes"] and day40["ownedBuildings"])
        self.assertTrue(day40["hypeExposure"] and day40["market"]["rows"] and day40["market"]["shortages"])
        self.assertTrue(day40["supply"]["factories"]["sites"] and day40["supply"]["imports"])
        self.assertTrue(day40["alerts"] and day40["staffing"] and day40["hourFindings"])
        self.assertTrue(day40["factoryStaffing"]["cap"] and day40["factoryStaffing"]["dem"])
        self.assertTrue(day40["plan"]["prices"])
        self.assertTrue(day40["trends"] and all(t["ready"] for t in day40["trends"]))
        self.assertIsNone(day40["cashFlow"])
        self.assertEqual((later["ledgerDays"], later["cashFlow"]["days"]), (2, 7))
        self.assertEqual(later["kpi"]["netWorthAsOf"], save_fixtures.DAY)
        self.assertEqual(later["market"]["trendDays"], 7)

    def test_no_machine_or_run_specific_values(self):
        for case, text in self.texts.items():
            for marker in (tempfile.gettempdir(), ROOT, os.path.expanduser("~")):
                for form in {marker, marker.replace("\\", "/"), json.dumps(marker)[1:-1]}:
                    self.assertNotIn(form, text, f"{case} holds a local path")

    def test_the_same_bytes_under_two_hash_seeds(self):
        script = ("import hashlib, json, test_payload_snapshot as t;"
                  "print(json.dumps({k: hashlib.sha256(v.encode()).hexdigest()"
                  " for k, v in t.snapshots().items()}, sort_keys=True))")
        runs = []
        for seed in ("1", "2"):
            env = dict(os.environ, PYTHONHASHSEED=seed, PYTHONPATH=os.pathsep.join([HERE, ROOT]))
            env.pop("UPDATE_SNAPSHOTS", None)
            runs.append(subprocess.run([sys.executable, "-c", script], check=True, text=True,
                                       capture_output=True, env=env, cwd=HERE).stdout)
        self.assertEqual(runs[0], runs[1])
        ours = {k: hashlib.sha256(v.encode()).hexdigest() for k, v in self.texts.items()}
        self.assertEqual(json.loads(runs[0]), ours)


if __name__ == "__main__":
    if "--update" in sys.argv:
        sys.argv.remove("--update")
        os.environ["UPDATE_SNAPSHOTS"] = "1"
        UPDATE = True
    unittest.main()
