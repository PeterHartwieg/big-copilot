"""Mod-aware recommendation boundaries; all inputs are synthetic."""
import unittest

from ba_dashboard import _mod_office_fallback_issue, _tax_period, _wage_basis, _finance_facts, _service_wages, site_key
from ba_save import Save
from tests.test_economy import capture, ADDRESS
import ba_dashboard as dashboard


class ModRecommendationBoundaries(unittest.TestCase):
    def test_single_pass_decor_routes_match_every_individual_target(self):
        materials = {"floor": {"p": 90, "t": 1, "b": True}, "wall": {"p": 45, "t": 2, "b": True}}
        for dims in ((290, 225, 84), (1, 1, 1), (500, 1, 0), (0, 0, 0)):
            routes = dashboard._decor_routes(*dims, materials)
            for target in range(1, 101):
                actual = next((r for r in routes.values() if r["score"] >= target), None)
                self.assertEqual(actual, dashboard.decor_route(*dims, materials, target))
        self.assertLess(len(dashboard._decor_routes(1, 1, 1, materials)), 100)

    def test_unread_office_hours_require_known_no_extra_clients(self):
        building = {"StreetName": ADDRESS["street"], "StreetNumber": ADDRESS["number"]}
        unread = {"lawyer": {"basis": [["office", "closed"]]}}
        measured = {"lawyer": {"basis": [["measured", "cap", "closed"]]}}
        for boost, blocked in ((0, False), (200, True)):
            save = capture({"interiors": {"sites": [{"address": ADDRESS, "officeBoostThousandths": boost}]}})
            self.assertEqual(_mod_office_fallback_issue(save, building, unread, "lawyer"), blocked)
            self.assertFalse(_mod_office_fallback_issue(save, building, measured, "lawyer"))
        self.assertTrue(_mod_office_fallback_issue(capture(), building, unread, "lawyer"))
        save = capture()
        save._mod_economy["reports"]["rlo"]["modules"]["interiors"] = {"status": "disabled"}
        self.assertFalse(_mod_office_fallback_issue(save, building, unread, "lawyer"))
        self.assertFalse(_mod_office_fallback_issue(Save({}, {}, "plain.hsg"), building, unread, "lawyer"))

    def test_tax_ambiguity_keeps_recorded_deductions_without_poisoning_native_rows(self):
        outside = {"recurringDeductionLabels": [{"label": "Owner utility", "kind": "recurring"}],
                   "unclassifiedDeductionLabels": ["Mixed owner costs"],
                   "taxEffectsOutsideNativeForecast": []}
        native = {"key": "tax_vehicle", "amount": -125}
        save = capture({"outsideStatements": outside}, {"currentTaxPeriodDeductibleExpenses": {"$items": [native]}})
        result = _tax_period(save)
        self.assertEqual(result["deductions"], 125)
        self.assertNotIn("projectionIncomplete", result)
        for label in ("Mixed owner costs", "reallife_future_cost", "Future localized deduction"):
            save = capture({"outsideStatements": outside}, {"currentTaxPeriodDeductibleExpenses": {"$items": [native, {"key": label, "amount": -25}]}})
            result = _tax_period(save)
            self.assertEqual(result["deductions"], 150)
            self.assertEqual(result["projectionIncomplete"], ["unclassified-mod-deductions"])
            self.assertEqual(result["unclassifiedDeductions"], [label])

    def test_known_mod_wage_is_an_explicit_ordinary_hourly_estimate(self):
        self.assertEqual(_wage_basis(capture()), {"wageBasis": "ordinary-hourly"})
        self.assertEqual(_wage_basis(capture(), False), {"wageUnavailable": True, "wageBasis": "native-base-only"})
        self.assertEqual(_wage_basis(Save({}, {}, "plain.hsg")), {})

    def test_disabled_bank_owner_preserves_native_baseline(self):
        rules = {"banks": {"bank": {"r": 10, "y": 2, "x": 50000}}}
        for status, known in (("disabled", True), ("unavailable", False), ("failed", False)):
            save = capture()
            save._mod_economy["reports"]["rlo"]["modules"]["bankTerms"] = {"status": status}
            result = _finance_facts(save, [], rules)
            self.assertEqual(bool(result["banks"]), known)
            self.assertEqual("unavailable" not in result, known)

    def test_native_bank_quote_requires_supported_credit_and_expense_basis(self):
        bank = {"bankId": "bank", "address": ADDRESS, "annualRatePercent": "7.5",
                "termDays": 60, "capCents": 5000000, "nativeDebtAtBankCents": 12500,
                "incomeTermShareThousandths": 500, "tutorialMinimumCents": 0,
                "securedAccountRulesApply": False}
        for credit, principal, reason in ((False, False, None),
                (True, False, "additional-credit-eligibility"),
                (False, True, "principal-expense-basis"),
                (True, True, "additional-credit-eligibility")):
            with self.subTest(credit=credit, principal=principal):
                save = capture({"bankTerms": {"banks": [bank],
                    "additionalCreditIncluded": credit, "principalIsExpense": principal}})
                result = _finance_facts(save, [{"profit": 700}], {})
                self.assertEqual(result.get("unavailable"), reason)
                self.assertEqual(result["profit7"], 100)
                if reason:
                    self.assertEqual(result["banks"], [])
                else:
                    self.assertEqual(result["banks"][0]["max"], 50000)
                    self.assertEqual(result["banks"][0]["owed"], 125)

    def test_disabled_outside_cost_owner_does_not_invalidate_native_tax(self):
        for status in ("disabled", "failed", "unavailable"):
            save = capture()
            save._mod_economy["reports"]["rlo"]["modules"]["outsideStatements"] = {"status": status}
            result = _tax_period(save)
            self.assertEqual("projectionIncomplete" not in result, status == "disabled")

    def test_unknown_wage_never_prices_idle_hour_savings(self):
        addr = (ADDRESS["street"], ADDRESS["number"])
        key = site_key(addr)
        staff = [{"addr": addr, "skill": "lawyer", "wage": 25},
                 {"addr": addr, "skill": "lawyer", "wage": 50, "wageUnavailable": True},
                 {"addr": addr, "skill": "trainer", "wage": 30}]
        self.assertEqual(_service_wages(staff, {key: "retail"}), {key: {"trainer": 30}})
        self.assertEqual(_service_wages(staff, {key: "office"}), {key: {}})


if __name__ == "__main__":
    unittest.main()
