"""The finder's floor plans: web/maps/floor-plans.json against the building table.

make_floor_plans.py writes the file from the installed game, so these checks
read the committed result: every layout the table gives a finder kind has a
plan, every plan is only rectangles inside its own box, and the file stays
small enough to fetch on the first plan the finder shows.
"""
import json
import os
import re
import shutil
import tempfile
import unittest
from pathlib import Path

import build_web
from ba_dashboard import FLOOR_PLAN_KINDS

ROOT = Path(__file__).resolve().parents[1]
PLANS = json.loads((ROOT / "web/maps/floor-plans.json").read_text(encoding="utf-8"))
TABLE = json.loads((ROOT / "ba_buildings.json").read_text(encoding="utf-8"))
RECT = re.compile(r"M(\d+) (\d+)h(\d+)v(\d+)h-(\d+)z")


class FloorPlans(unittest.TestCase):
    def test_every_layout_the_table_uses_has_a_plan(self):
        self.assertEqual(PLANS["schema"], 1)
        self.assertEqual(PLANS["px"], 24)
        self.assertEqual(sorted(PLANS["kinds"]), sorted(FLOOR_PLAN_KINDS))
        used = {}
        for row in TABLE:
            if row["t"] in FLOOR_PLAN_KINDS:
                self.assertIn("v", row, f"{row['n']} {row['s']} has no version")
                used.setdefault(row["t"], set()).add(f"{row['z']}{row['v']}")
        for kind, codes in used.items():
            with self.subTest(kind=kind):
                self.assertEqual(sorted(codes), sorted(PLANS["kinds"][kind]))
                for code in codes:
                    self.assertIn(code, PLANS["plans"])
        self.assertEqual(build_web.floor_plan_gaps(), [])

    def test_a_plan_is_rectangles_inside_its_box(self):
        for code, plan in PLANS["plans"].items():
            with self.subTest(layout=code):
                self.assertTrue(set(plan["paths"]) <= set("fbwnd"))
                self.assertIn("f", plan["paths"])
                self.assertIn("w", plan["paths"])
                self.assertGreaterEqual(plan["doors"], 1)
                for d in plan["paths"].values():
                    self.assertEqual(RECT.sub("", d), "")
                    for x, y, w, h, back in RECT.findall(d):
                        self.assertEqual(w, back)
                        self.assertLessEqual(int(x) + int(w), plan["w"])
                        self.assertLessEqual(int(y) + int(h), plan["h"])

    def test_only_a_warehouse_has_bays(self):
        for kind, codes in PLANS["kinds"].items():
            for code in codes:
                with self.subTest(layout=code):
                    bays = PLANS["plans"][code]["bays"]
                    if kind == "warehouse":
                        self.assertGreaterEqual(bays, 1)
                    else:
                        self.assertEqual(bays, 0)

    def test_a_page_opened_from_a_file_carries_the_plans(self):
        # dashboard.html has nowhere to fetch from, so render() embeds the plans
        # beside the map; the hosted and watched pages fetch them instead.
        from ba_dashboard import render
        page = render({"meta": {"save": "Fixture"}}, live=False)
        start = page.index("window.BIG_COPILOT_MAP=") + len("window.BIG_COPILOT_MAP=")
        embedded = json.JSONDecoder().raw_decode(page[start:].replace("<\/", "</"))[0]
        self.assertEqual(embedded["plans"], PLANS)
        self.assertNotIn("window.BIG_COPILOT_MAP=", render(None, live=True))

    def test_the_file_stays_small(self):
        self.assertLess((ROOT / "web/maps/floor-plans.json").stat().st_size, 80_000)

    def test_a_layout_with_no_plan_is_a_gap(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "web/maps").mkdir(parents=True)
            plans = json.loads(json.dumps(PLANS))
            del plans["plans"]["H3"]
            (Path(tmp) / "web/maps/floor-plans.json").write_text(json.dumps(plans), encoding="utf-8")
            shutil.copyfile(ROOT / "ba_buildings.json", Path(tmp) / "ba_buildings.json")
            self.assertEqual(build_web.floor_plan_gaps(tmp), ["warehouse H3"])
            os.remove(Path(tmp) / "web/maps/floor-plans.json")
            self.assertEqual(build_web.floor_plan_gaps(tmp), ["web/maps/floor-plans.json"])


if __name__ == "__main__":
    unittest.main()
