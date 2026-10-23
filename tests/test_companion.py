"""The two public providers share limits and binding, not economic semantics."""
import copy
import hashlib
import json
import unittest

import ba_companion as c
from tests.test_rlo import company
from tests.test_street_food import load


def capture():
    return {"schemaVersion": 1, "provider": "fixture", "modVersion": "1",
            "captured": {"character": "fixture-player", "day": 12, "hour": 8, "minute": 30},
            "modules": {"first": {"version": 1, "status": "ready", "data": {"value": 4}},
                        "second": {"version": 1, "status": "ready", "data": {"value": 5}}}}


def read(save):
    def validate(data):
        if not isinstance(data, dict):
            raise ValueError("Expected an object")
        return {"value": c.integer(data.get("value"))}
    return c.read(save, provider="fixture", key="fixture:report", marker="fixture:live",
                  validators={name: validate for name in ("first", "second", "optional")},
                  required=("first", "second"), evidence=("fixture:",))


def saved(report=None, live=False):
    root = company()
    raw = json.dumps(capture() if report is None else report)
    root["modData"] = {"fixture:report": raw}
    if live:
        root["modData"]["fixture:live"] = json.dumps({"status": "fresh", "sha256": hashlib.sha256(raw.encode()).hexdigest()})
    return load(root)


class CompanionTests(unittest.TestCase):
    def test_shared_transport_is_read_only_and_cached_per_save(self):
        save = saved(live=True)
        before = copy.deepcopy(save.root)
        report = read(save)
        self.assertEqual(report["status"], "ready")
        self.assertEqual(report["source"], "link")
        self.assertIs(read(save), report)
        self.assertEqual(save.root, before)
        other = capture()
        other["modules"]["first"]["data"]["value"] = 8
        self.assertEqual(read(saved(other))["modules"]["first"]["data"]["value"], 8)

    def test_new_optional_module_does_not_break_older_reports(self):
        self.assertNotIn("optional", read(saved())["modules"])
        report = capture()
        report["modules"]["optional"] = {"version": 1, "status": "disabled", "data": None}
        self.assertEqual(read(saved(report))["status"], "ready")
        report["modules"]["optional"]["version"] = 2
        result = read(saved(report))
        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["modules"]["optional"]["status"], "unavailable")
        self.assertEqual(result["modules"]["first"]["status"], "ready")

    def test_invalid_scalar_or_deep_data_is_local_to_module(self):
        for value in (True, -1, 2**53, 1.25, "bad"):
            report = capture()
            report["modules"]["first"]["data"]["value"] = value
            result = read(saved(report))
            self.assertEqual(result["modules"]["first"]["status"], "unavailable")
            self.assertEqual(result["modules"]["second"]["data"], {"value": 5})
        report = capture()
        nested = report["modules"]["first"]["data"]
        for _ in range(20):
            nested["deep"] = {}
            nested = nested["deep"]
        self.assertEqual(read(saved(report))["modules"]["second"]["status"], "ready")
        self.assertEqual(read(saved(report))["modules"]["first"]["status"], "unavailable")

    def test_live_binding_must_belong_to_this_provider(self):
        save = saved()
        save.live_source = True
        self.assertEqual(read(save)["status"], "stale")
        report = capture()
        report["provider"] = "another-provider"
        self.assertEqual(read(saved(report, live=True))["status"], "stale")

    def test_boolean_native_clock_does_not_equal_integer_capture_clock(self):
        for field, report_field in (("Day", "day"), ("Hour", "hour")):
            report = capture()
            report["captured"][report_field] = 1
            save = saved(report)
            save.root[field] = True
            self.assertEqual(read(save)["status"], "stale")


if __name__ == "__main__":
    unittest.main()
