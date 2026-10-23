"""Synthetic, independent checks of the public companion joins and accounting bases."""
import copy
import json
import struct
from pathlib import Path
import unittest
from unittest.mock import patch

import ba_facts
import ba_economy as economy
from ba_save import Save

ADDRESS = {"street": "ba:street_synthetic", "number": 1}
ADDR = (ADDRESS["street"], ADDRESS["number"])


def capture(modules=None, root=None):
    save = Save({"Day": 12, **(root or {})}, {}, "synthetic.hsg")
    save._mod_economy = {"reports": {"rlo": {"status": "ready", "source": "save",
        "modules": {key: {"status": "ready", "data": value} for key, value in (modules or {}).items()}}}, "indexes": {}}
    return save


class EconomyInputs(unittest.TestCase):
    def test_current_wages_are_owner_observations_and_missing_are_unknown(self):
        save = capture({"employment": [{"employeeId": "employee", "ordinaryHourlyCents": 2351}]})
        self.assertEqual(economy.hourly(save, "employee", 20), (23.51, True))
        self.assertEqual(economy.hourly(save, "unknown", 20), (20, False))
        self.assertEqual(economy.hourly(Save({}, {}, "plain.hsg"), "employee", 20), (20, True))

    def test_new_hire_uses_owner_share_rounding_and_no_current_raise(self):
        save = capture({"company": {"newHireWageFactorThousandths": 1137,
            "sites": [{"raises": [{"employeeId": "other", "raiseHourlyCents": 99999}]}]}})
        self.assertEqual(economy.candidate_hourly(save, 10.01), (11.38, True))
        self.assertEqual(economy.candidate_hourly(capture(), 10), (10, False))

    def test_new_hire_with_company_disabled_uses_city_level_once(self):
        save = capture({"prices": {"levelThousandths": 1137, "costFactorThousandths": 4000}})
        save._mod_economy["reports"]["rlo"]["modules"]["company"] = {"status": "disabled", "data": {
            "newHireWageFactorThousandths": 9999}}
        before = copy.deepcopy(save._mod_economy["reports"])
        self.assertEqual(economy.candidate_hourly(save, 10.01), (11.38, True))
        self.assertEqual(save._mod_economy["reports"], before)

    def test_new_hire_both_owners_disabled_preserves_native_wage(self):
        save = capture()
        save._mod_economy["reports"]["rlo"]["modules"] = {
            "company": {"status": "disabled"}, "prices": {"status": "disabled"}}
        self.assertEqual(economy.candidate_hourly(save, 10.015), (10.015, True))

    def test_new_hire_missing_or_failed_owner_never_falls_back_to_known(self):
        for company_status, price_status in (("unavailable", "ready"), ("failed", "ready"),
                ("disabled", "unavailable"), ("disabled", "failed")):
            with self.subTest(company=company_status, prices=price_status):
                save = capture()
                save._mod_economy["reports"]["rlo"]["modules"] = {
                    "company": {"status": company_status},
                    "prices": {"status": price_status, "data": {"levelThousandths": 1137}}}
                self.assertEqual(economy.candidate_hourly(save, 10.01), (10.01, False))
        self.assertEqual(economy.candidate_hourly(capture({"prices": {"levelThousandths": 1137}}), 10), (10, False))
        self.assertFalse(economy.candidate_hourly(capture({"company": {"newHireWageFactorThousandths": 1137}}), 1e100)[1])

    def test_deduction_unknown_is_exact_owner_evidence_not_all_native_labels(self):
        save = capture({"outsideStatements": {"recurringDeductionLabels": [
            {"label": "Owner bill", "kind": "recurring"}, {"label": "Owner setup", "kind": "once"},
            {"label": "Shared translation", "kind": "recurring"}],
            "unclassifiedDeductionLabels": ["Mixed owner costs", "Shared translation"]}})
        before = copy.deepcopy(save._mod_economy["reports"])
        self.assertEqual(economy.deduction(save, "Owner bill"), "recurring")
        self.assertEqual(economy.deduction(save, "Owner setup"), "once")
        self.assertEqual(economy.deduction(save, "Mixed owner costs"), "unknown")
        self.assertEqual(economy.deduction(save, "Shared translation"), "unknown")
        for native in ("tax_import", "tax_vehicle", "Furniture purchases", "mixed owner costs"):
            self.assertIsNone(economy.deduction(save, native))
        self.assertEqual(save._mod_economy["reports"], before)
        self.assertIsNone(economy.deduction(capture(), "Mixed owner costs"))

    def test_current_provider_absence_overrides_retained_reports(self):
        save = Save({}, {}, "capture.hsg")
        save.facts = {"economy": {"schemaVersion": 1, "model": "economy-capabilities-v1", "providers": []}}
        with patch.object(economy.ba_rlo, "read", return_value={"status": "legacy"}), patch.object(
                economy.ba_hart, "read", return_value={"status": "legacy"}):
            self.assertEqual(economy.context(save)["reports"], {})

    def test_footfall_pairs_registration_instead_of_requiring_play_written(self):
        row = {"address": ADDRESS, "status": "ready", "ownPromotion": 30,
               "writtenPromotion": 40, "registrationPromotionAtCapture": 30}
        save = capture({"footfall": {"sites": [row]}}, {"BuildingRegistrations": {"$items": [{
            "StreetName": ADDR[0], "StreetNumber": ADDR[1], "promotion": {"total": 30}}]}})
        self.assertEqual(economy.footfall(save)[ADDR]["status"], "ready")
        mismatched = capture({"footfall": {"sites": [row]}}, {"BuildingRegistrations": {"$items": [{
            "StreetName": ADDR[0], "StreetNumber": ADDR[1], "promotion": {"total": 31}}]}})
        self.assertEqual(economy.footfall(mismatched)[ADDR]["status"], "unavailable")
        self.assertEqual(row["status"], "ready")

    def test_catalogue_tables_detach_and_apply_effective_price_once(self):
        save = capture({"prices": {"items": [{"itemId": "product", "defaultMarketAmount": "2.125",
                                             "effectiveAmount": "0.000125", "factorThousandths": 4000}]}})
        rules = {"products": {"product": {"p": 1, "w": 1}, "unlisted": {"p": 3}}}
        prices = {"items": {"product": {"p": 1}}}
        before = copy.deepcopy((rules, prices))
        current_rules, current_prices = economy.tables(save, rules, prices)
        self.assertEqual(current_rules["products"]["product"]["w"], .000125)
        self.assertEqual(current_prices["items"]["product"]["p"], 2.125)
        self.assertEqual((rules, prices), before)
        self.assertEqual(economy.price_unavailable(save, ["product", "unlisted"]), ["unlisted"])

    def test_ready_owner_catalogue_survives_native_unavailable_or_newer_model(self):
        for native in ({"version": 1, "model": ba_facts.NATIVE_ECONOMY_MODEL,
                        "itemPrices": {"status": "unavailable"}},
                       {"version": 2, "model": "future-native-economy"}):
            with self.subTest(native=native):
                save = capture({"prices": {"items": [{"itemId": "product", "defaultMarketAmount": "12.5",
                    "effectiveAmount": "0.000125"}]}})
                save.facts = {"nativeEconomy": native}
                before = copy.deepcopy(save._mod_economy["reports"])
                self.assertEqual(economy.catalogue(save), {"product": {"p": 12.5, "w": .000125}})
                self.assertEqual(economy.price_unavailable(save, ["product", "other"]), ["other"])
                self.assertEqual(save._mod_economy["reports"], before)

    def test_ready_empty_native_catalogue_is_authoritative_and_both_unknown_stay_unknown(self):
        save = capture({"prices": {"items": [{"itemId": "product", "defaultMarketAmount": "12.5",
            "effectiveAmount": "2.75"}]}})
        save.facts = {"nativeEconomy": {"version": 1, "model": ba_facts.NATIVE_ECONOMY_MODEL,
            "itemPrices": {"status": "ready", "data": []}}}
        self.assertEqual(economy.catalogue(save), {})
        self.assertEqual(economy.price_unavailable(save, ["product"]), ["product"])
        unknown = capture()
        unknown.facts = {"nativeEconomy": {"version": 1, "model": ba_facts.NATIVE_ECONOMY_MODEL,
            "itemPrices": {"status": "unavailable"}}}
        self.assertIsNone(economy.catalogue(unknown))
        self.assertEqual(economy.price_unavailable(unknown, ["product"]), ["product"])

    def test_unavailable_catalogue_does_not_claim_baseline_completeness(self):
        save = capture()
        self.assertEqual(economy.price_unavailable(save, ["a", "a", "b"]), ["a", "b"])
        save._mod_economy["reports"]["rlo"]["modules"]["prices"] = {"status": "disabled"}
        self.assertEqual(economy.price_unavailable(save, ["a"]), [])

    def test_manager_and_late_permit_guards_are_advice_without_transfer(self):
        decision = {"decision": "conditional", "reasons": ["manager-controls-scheduling"]}
        save = capture({"ownership": {"targets": [{"address": ADDRESS, "operations": {"schedule": decision}}]},
            "requirements": {"lateOpeningHours": {"before": 6, "after": 22, "permitKind": 3}},
            "company": {"partStates": {"licences": "ready"}, "sites": [{"address": ADDRESS, "licences": []}]}, "closures": {"rows": []}})
        before = copy.deepcopy(save._mod_economy["reports"])
        self.assertEqual(economy.staffing_issues(save, ADDR, [[(5, 10)]]),
                         ["manager-controls-scheduling", "late-opening-permit-missing"])
        self.assertEqual(save._mod_economy["reports"], before)

    def test_old_managers_off_evidence_allows_only_snapshot_advice(self):
        save = capture({"features": [{"id": "managers", "enabled": False}], "closures": {"rows": []}})
        self.assertEqual(economy.staffing_issues(save, ADDR), [])
        self.assertEqual(economy.staffing_issues(capture(), ADDR), ["ownership-unknown", "closure-observations-unavailable"])

    def test_disabled_licences_ignore_stale_permits_but_failed_are_unknown(self):
        for state, expected in (("disabled", []), ("failed", ["company-licences-unavailable"])):
            save = capture({"features": [{"id": "managers", "enabled": False}], "closures": {"rows": []},
                "requirements": {"lateOpeningHours": {"before": 6, "after": 22, "permitKind": 3}},
                "company": {"partStates": {"licences": state}, "sites": [{"address": ADDRESS,
                    "licences": [{"kind": 3, "valid": False, "untilDay": 0}]}]}})
            self.assertEqual(economy.staffing_issues(save, ADDR, [[(5, 10)]]), expected)

    def test_production_city_and_promotion_vectors(self):
        vectors = json.loads((Path(__file__).resolve().parents[1] / "contracts/rlo/planning-vectors.json").read_text())
        for row in vectors["cityAdjust"]:
            save = capture({"prices": {"costFactorThousandths": row["factor"],
                "adjustmentQuiet": vectors["adjustmentQuiet"]}})
            native = struct.unpack("<f", struct.pack("<f", float(row["amount"])))[0]
            self.assertEqual(economy.city_amount(save, float(row["amount"])), native + row["expectedAdjustmentMoney"])
        for row in vectors["promotions"]:
            current = {"address": ADDRESS, "status": "ready", "issuePercent": row["issue"],
                "ambientPercent": row["ambient"], "interiorPercent": row["interior"], "baseMultiplier": row["baseMultiplier"]}
            save = capture({"footfall": {"terms": vectors["promotionTerms"]}})
            with patch.object(economy, "footfall", return_value={ADDR: current}):
                self.assertEqual(economy.promotion(save, ADDR, row["own"]), row["expected"])

    def test_outside_paid_owed_refund_remain_separate_from_statements(self):
        rows = [dict(address=ADDRESS, scope="place", basis="paid", cents=1200, category="utilities.power"),
                dict(address=ADDRESS, scope="place", basis="owed", cents=5000, category="utilities.power"),
                dict(address=None, scope="company", basis="paid", cents=-100, category="tax.rebate")]
        native = {"revenue": 9000, "costs": 2000}
        save = capture({"outsideStatements": {"rows": rows, "coverage": "partial", "knownOmittedCategories": ["other"],
            "recurringDeductionLabels": [{"label": "synthetic translated bill", "kind": "recurring"}]}},
            {"financialSummaries": native})
        result = economy.outside(save, ADDR)
        self.assertEqual([row["basis"] for row in result["rows"]], ["paid", "owed"])
        self.assertEqual(result["statementAdjustment"], "none")
        self.assertTrue(result["balancesAreSeparate"])
        self.assertEqual(economy.outside(save)["rows"][2]["cents"], -100)
        self.assertEqual(save.root["financialSummaries"], {"revenue": 9000, "costs": 2000})
        self.assertEqual(economy.deduction(save, "synthetic translated bill"), "recurring")
        self.assertIsNone(economy.deduction(save, "guess from English"))


if __name__ == "__main__":
    unittest.main()
