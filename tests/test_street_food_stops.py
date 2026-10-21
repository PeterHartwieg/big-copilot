"""Public map facts, not player saves; fixture coordinates are synthetic."""
import json
from pathlib import Path
import unittest
from tools.build_street_food_stops import catalogue


class StopCatalogueTests(unittest.TestCase):
    def rows(self):
        return [{"kind": kind, "key": "test#1", "x": 12.3456789, "y": 0.5, "z": 8.0, "heading": 90}
                for kind in ("cart", "truck")]

    def test_keeps_exact_native_positions_and_separates_kinds(self):
        rows = self.rows()
        output = catalogue(rows + rows + [{"kind": "truck", "refusal": "no_position"}], {})
        self.assertEqual(len(output["spots"]), 2)
        self.assertEqual({s["kind"] for s in output["spots"]}, {"cart", "truck"})
        self.assertEqual({s["x"] for s in output["spots"]}, {12.3456789})
        self.assertEqual(output, catalogue(list(reversed(rows)), {}))

    def test_rejects_invalid_coordinates_and_incomplete_kind_coverage(self):
        for bad in (None, True, float("nan"), float("inf"), 1000001):
            rows = self.rows()
            rows[0]["x"] = bad
            with self.subTest(value=bad), self.assertRaises(ValueError):
                catalogue(rows, {})
        with self.assertRaises(ValueError):
            catalogue(self.rows()[:1], {})

    def test_shipped_catalogue_has_unique_places_and_projects_inside_the_city(self):
        root = Path(__file__).resolve().parents[1]
        output = json.loads((root / "ba_street_food_stops.json").read_text())
        self.assertEqual(output["version"], 1)
        self.assertEqual(output["source"]["gameBuild"], "3682")
        spots = output["spots"]
        self.assertEqual(len(spots), len({s["id"] for s in spots}))
        self.assertGreater(len(spots), 500)
        regions = json.loads((root / "web/maps/locations.json").read_text())["regions"]
        bounds = [r["worldBounds"] for r in regions]
        for s in spots:
            self.assertTrue(any(x0 <= s["x"] <= x1 and z0 <= s["z"] <= z1 for x0, z0, x1, z1 in bounds), s)
        self.assertEqual({s["kind"] for s in spots}, {"cart", "truck"})


if __name__ == "__main__":
    unittest.main()
