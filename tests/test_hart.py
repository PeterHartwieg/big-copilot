"""Synthetic outputs from the HART production companion, shared by both front doors."""
import copy
import hashlib
import json
from pathlib import Path
import unittest

import ba_hart as hart
from tests import save_fixtures as f
from tests.test_street_food import load

FIXTURES = Path(__file__).resolve().parents[1] / "contracts" / "hart"


def report(name="ready"):
    return json.loads((FIXTURES / (name + ".json")).read_text())


def company(block=None, marker=False):
    block = report() if block is None else block
    root = f.data_company(day=9)
    root.update(characterId="synthetic-companion", Hour=12, Minute=17.75, buildNumberAtLastSave=2479)
    raw = json.dumps(block, ensure_ascii=False)
    root["modData"] = {hart.KEY: raw}
    if marker:
        root["modData"][hart.MARKER] = json.dumps({"status": "fresh", "sha256": hashlib.sha256(raw.encode()).hexdigest()})
    return root


class HartTests(unittest.TestCase):
    def test_exact_producer_fixtures(self):
        for name in ("ready", "inactive", "blocked", "partial"):
            with self.subTest(name=name):
                save = load(company(report(name)))
                result = hart.read(save)
                self.assertEqual(result["status"], "partial" if name == "partial" else "ready")
                self.assertEqual(hart.module(save, "runtime")["blockedByLegacy"], name in ("blocked", "partial"))
                self.assertIs(result, hart.read(save))
                self.assertEqual(hart.metadata(save)["source"], "save")
        costs = hart.module(load(company()), "runningCosts")
        self.assertTrue(costs["equipment"]["effective"])
        self.assertEqual(costs["currentSites"][0]["itBasis"], "included-in-rlo-internet-accrual")
        self.assertEqual(costs["currentSites"][0]["itSeatDayCents"], 3000)
        self.assertEqual(hart.module(load(company()), "factoryPurchases")["courses"][0]["baseFeeCents"], 360000)

    def test_no_evidence_and_legacy_records(self):
        root = f.data_company()
        self.assertIsNone(hart.read(load(root)))
        root["modData"] = {"hardmodepatch:factory_diplomas_held": "private-data"}
        save = load(root)
        self.assertEqual(hart.read(save)["status"], "legacy")
        self.assertIsNone(hart.module(save, "factoryPurchases"))

    def test_failures_and_versions_are_local(self):
        for value in (None, {}, {"version": True, "status": "ready", "data": {}},
                      {"version": 2, "status": "ready", "data": {}},
                      {"version": 1, "status": "failed", "data": []}):
            block = report()
            block["modules"]["rent"] = value
            save = load(company(block))
            self.assertIsNone(hart.module(save, "rent"))
            self.assertIsNotNone(hart.module(save, "runningCosts"))
            self.assertEqual(hart.read(save)["status"], "partial")
        block = report()
        block["modules"]["rent"] = {"version": 1, "status": "failed", "data": None}
        self.assertEqual(hart.read(load(company(block)))["modules"]["rent"], {"status": "failed"})

    def test_model_and_units_are_validated(self):
        mutations = (("rent", "model", "future-model"), ("rent", "otherMultiplierThousandths", True),
                     ("runningCosts", "referenceHours", 13), ("runningCosts", "closedShareThousandths", 250.0),
                     ("factoryPurchases", "restriction", "owned-machines"))
        for module, key, value in mutations:
            block = report()
            block["modules"][module]["data"][key] = value
            save = load(company(block))
            self.assertIsNone(hart.module(save, module), (module, key))
            self.assertIsNotNone(hart.module(save, "runtime"))

    def test_duplicate_identities_fail_only_owner_module(self):
        for module, field in (("runningCosts", "items"), ("runningCosts", "currentSites"),
                              ("factoryPurchases", "courses"), ("runtime", "targets")):
            block = report()
            rows = block["modules"][module]["data"][field]
            rows.append(copy.deepcopy(rows[0]))
            save = load(company(block))
            self.assertIsNone(hart.module(save, module))
            self.assertIsNotNone(hart.module(save, "rent"))

    def test_effective_unknown_is_preserved_and_invalid_bool_rejected(self):
        for value in (None, False, True, 0, "true"):
            block = report()
            feature = block["modules"]["runningCosts"]["data"]["equipment"]
            feature["effective"] = value
            save = load(company(block))
            result = hart.module(save, "runningCosts")
            if value is None or type(value) is bool:
                self.assertIs(result["equipment"]["effective"], value)
            else:
                self.assertIsNone(result)
        block = report()
        block["modules"]["runtime"]["data"]["blockedByLegacy"] = True
        self.assertIsNone(hart.module(load(company(block)), "runtime"))

    def test_current_it_unknown_is_not_zero_and_basis_is_mandatory(self):
        block = report()
        row = block["modules"]["runningCosts"]["data"]["currentSites"][0]
        row.update(itStatus="unavailable", itSeatDayCents=None)
        self.assertIsNone(hart.module(load(company(block)), "runningCosts")["currentSites"][0]["itSeatDayCents"])
        row["itSeatDayCents"] = 0
        self.assertIsNone(hart.module(load(company(block)), "runningCosts"))
        row.update(itStatus="ready", itBasis="new-extra-charge")
        self.assertIsNone(hart.module(load(company(block)), "runningCosts"))

    def test_cafe_site_unknown_and_nested_failure_preserve_siblings(self):
        block = report()
        retail = block["modules"]["retailDemand"]["data"]
        cafe = retail["cafe"]["data"]
        cafe["currentSites"] = [dict(address=dict(street="Unknown", number=1), status="unavailable",
                                     reason="cafe-requirement-unreviewed", usableStations=None),
                                dict(address=dict(street="Known", number=2), status="ready", reason=None, usableStations=4)]
        result = hart.module(load(company(block)), "retailDemand")
        self.assertIsNone(result["cafe"]["data"]["currentSites"][0]["usableStations"])
        self.assertEqual(result["cafe"]["data"]["currentSites"][1]["usableStations"], 4)
        cafe["currentSites"][0]["usableStations"] = 0
        result = hart.module(load(company(block)), "retailDemand")
        self.assertEqual(result["cafe"]["status"], "unavailable")
        self.assertEqual(result["ambience"]["status"], "disabled")
        retail["ambience"].update(status="ready", data={"unreviewed": "model"})
        self.assertEqual(hart.module(load(company(block)), "retailDemand")["ambience"]["status"], "unavailable")

    def test_held_records_typed_independently_and_education_delegated(self):
        block = report()
        factory = block["modules"]["factoryPurchases"]["data"]
        factory["heldRecords"]["data"] = [dict(courseId=18, kind="enrollment", stage=0, heldSinceDay=8)]
        result = hart.module(load(company(block)), "factoryPurchases")
        self.assertEqual(result["education"], {"provider": "rlo", "module": "education", "minimumVersion": 1})
        self.assertEqual(result["heldRecords"]["data"][0]["courseId"], 18)
        factory["heldRecords"]["data"][0]["courseId"] = 12
        result = hart.module(load(company(block)), "factoryPurchases")
        self.assertEqual(result["heldRecords"]["status"], "ready")
        self.assertEqual(result["heldRecords"]["data"][0]["courseId"], 12)
        self.assertEqual(len(result["courses"]), 3)

    def test_future_courses_and_unsupported_rows_are_isolated(self):
        block = report()
        factory = block["modules"]["factoryPurchases"]["data"]
        future = copy.deepcopy(factory["courses"][0])
        future.update(courseId=100, itemIds=["future:machine"], needsAnyCourseIds=[99])
        factory["courses"].append(future)
        factory["heldRecords"]["data"] = [dict(courseId=100, kind="result", stage=4, heldSinceDay=2),
            dict(courseId=18, kind="unknown-future-kind", stage=9, heldSinceDay=2)]
        result = hart.module(load(company(block)), "factoryPurchases")
        self.assertEqual(result["courses"][-1]["courseId"], 100)
        self.assertEqual(result["heldRecords"]["data"][0]["courseId"], 100)
        self.assertEqual(result["heldRecords"]["data"][1]["status"], "unavailable")
        future["campus"] = "future-campus"
        result = hart.module(load(company(block)), "factoryPurchases")
        self.assertEqual(result["courses"][-1], dict(courseId=100, itemIds=["future:machine"],
            status="unavailable", reason="factory-course-unavailable"))
        self.assertEqual(len(result["courses"]), 4)
        self.assertNotIn("status", result["courses"][0])
        future["courseId"] = 2**53
        self.assertIsNone(hart.module(load(company(block)), "factoryPurchases"))

    def test_unknown_native_building_keeps_equipment_applicability_unknown(self):
        block = report("missing-building")
        result = hart.module(load(company(block)), "runningCosts")
        self.assertIsNone(result["currentSites"][0]["equipmentApplies"])

    def test_exact_clock_and_live_digest_binding(self):
        root = company(marker=True)
        self.assertEqual(hart.read(load(root))["source"], "link")
        for key, value in (("characterId", "other"), ("Day", 10), ("Hour", 13), ("Minute", 18)):
            altered = copy.deepcopy(root)
            altered[key] = value
            self.assertEqual(hart.read(load(altered))["status"], "stale")
        root["modData"][hart.KEY] += " "
        self.assertEqual(hart.read(load(root))["status"], "stale")
        root = company()
        root["buildNumberAtLastSave"] = 9999
        self.assertEqual(hart.read(load(root))["status"], "ready")
        save = load(root)
        save.live_source = True
        self.assertEqual(hart.read(save)["status"], "stale")

    def test_additive_fields_dont_change_normalized_contract(self):
        block = report()
        block["future"] = {"anything": "new"}
        block["modules"]["future"] = {"version": 2, "status": "ready", "data": []}
        block["modules"]["runningCosts"]["data"]["items"][0]["future"] = 1
        self.assertEqual(hart.module(load(company(block)), "runningCosts"), hart.module(load(company()), "runningCosts"))

    def test_reader_never_changes_source(self):
        block = report()
        before = copy.deepcopy(block)
        save = load(company(block))
        hart.read(save)
        hart.metadata(save)
        self.assertEqual(block, before)


if __name__ == "__main__":
    unittest.main()
