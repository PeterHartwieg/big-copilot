"""Existing-site EE adapter, synthetic ES3-shaped data only.

Source: EE Workshop 2026-10-14, DLL sha256 4b29fe1d3e293d06.
Real EconoView and office connectivity checks remain an owner gate.
"""
import json
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch

import ba_dashboard as d
import ba_mods as m
from ba_save import Names, Save, load_save
from tests.es3_fixture import encode
from tests.save_fixtures import data_company, data_names
from tests.test_job_demands import building, employee, STREET
from tests.test_office_staffing import alerts
from tests.test_payback import PRICES, SHOP, KEY_SHOP, registration, business, statements
from tests.test_staff_hire import office_registration, LAW, COMPUTER


def activate(save, internet="fiber", cloud="standard", forced=False, plans=None):
    providers = {"voogle": "complete", "lexi": "counsel"} if plans is None else dict(plans)
    if cloud:
        providers["cloudharbor"] = cloud
    state = {"LastSettlementDay": save.root.get("Day", 40),
             "Locations": [{"AddressKey": f"{STREET}_10", "InternetPlan": internet,
                            "ConnectivityForcedClosed": forced}],
             "SoftwareContracts": [{"AddressKey": f"{STREET}_10", "ProviderId": provider,
                                    "ActivePlanId": plan} for provider, plan in providers.items()]}
    save.root["modData"] = {"$items": [{"$k": m.ECONOMY_KEY, "$v": json.dumps(state)}]}
    return save


def charge(addr, day, amount, component=None, setup=None):
    return {"address": {"streetName": addr[0], "streetNumber": addr[1]},
            "amount": -amount, "timestamp": {"Day": day},
            "transactionType": setup or "oc:transaction_synthetic",
            "transactionData": {"$items": [{"$k": "occupancyComponent", "$v": component}]
                                if component else []}}


def synthetic_save(root):
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "synthetic.hsg"
        path.write_bytes(encode(root))
        save = load_save(str(path))
    save.path = __file__
    return save


def payload():
    save = activate(synthetic_save(data_company()))
    reg = next(r for r in save.items(save.root["BuildingRegistrations"])
               if (r.get("StreetName"), r.get("StreetNumber")) == SHOP)
    day = save.root["Day"] - 1
    transactions = [charge(SHOP, day, amount, component)
                    for component, amount in (("electricity", 120), ("water", 30),
                                              ("waste", 20), ("internet", 220),
                                              ("software", 110), ("datacenter", 184),
                                              ("maintenance", 10))]
    transactions += [charge(SHOP, day, 2000, setup="oc:tx_internet_installation"),
                     charge(SHOP, day, 500, setup="oc:tx_software_setup"),
                     charge(SHOP, day, 485, setup="oc:tx_datacenter_setup")]
    save.root["Transactions"] = {"$items": transactions}
    for summary in save.items(save.root["financialSummaries"]):
        if summary["dayNumber"] != day:
            continue
        for st in save.items(summary["businessIncomeStatements"]):
            if save.address(st["Address"]) != SHOP:
                continue
            before = st["TotalProfit"]
            st["RentExpenses"] = reg["RentPerDay"]
            st["LicensingFees"] = 25
            st["TotalProfit"] = st["TotalSales"] - sum(st.get(k, 0) for k in
                ("TotalResources", "SalaryExpenses", "RentExpenses", "MarketingExpenses", "Theft", "LicensingFees")) - 694 - 2000
            for key in ("totalProfit", "totalBusinessProfit"):
                summary[key] += st["TotalProfit"] - before
    return d.materialize_all(d.build_core(save, Names(data_names())))


class ResultsTests(unittest.TestCase):
    def test_costs_reconcile_and_setup_is_separate(self):
        result = payload()
        b = next(b for b in result["businesses"] if b["key"] == KEY_SHOP)
        ee = b["economyExpansion"]
        self.assertEqual(ee["cost"], 694)
        self.assertEqual(sum(ee["components"].values()), 694)
        self.assertEqual(ee["installation"], 2000)
        self.assertEqual(b["revenue"] - sum(b[k] for k in d.COST_KEYS)
                         - ee["cost"] - ee["installation"], b["profit"])
        chain = next(c for c in result["chains"] if KEY_SHOP in c["sites"])
        self.assertEqual(chain["economyExpansion"]["cost"], 694)
        self.assertEqual(result["kpi"]["economyExpansionBill"], 694)
        self.assertEqual(result["daily"][-1]["economyExpansionBill"], 694)

    def test_no_adapter_for_absent_or_stale_detection(self):
        for state in (None, {"LastSettlementDay": 1}):
            root = data_company()
            save = synthetic_save(root)
            if state:
                save.root["modData"] = {"$items": [{"$k": m.ECONOMY_KEY, "$v": json.dumps(state)}]}
            save.root["Transactions"] = {"$items": [charge(SHOP, 39, 999, "internet")]}
            result = d.build_core(save, Names(data_names())).core
            self.assertNotIn("economyExpansionBill", result["kpi"])
            self.assertTrue(all("economyExpansion" not in b for b in result["businesses"]))

    def test_bills_belong_to_the_statement_day_and_site(self):
        reg = building()
        save = activate(Save({"Day": 40}, {}, __file__))
        save.root["Transactions"] = {"$items": [charge((STREET, 10), 38, 100, "internet"),
            charge((STREET, 10), 39, 999, "internet"), charge((STREET, 12), 38, 999, "water")]}
        b = d._business(save, Names({}), reg, (STREET, 10), {(STREET, 10): {}},
                        [(38, {})], {}, 40)
        self.assertEqual(b["economyExpansion"]["cost"], 100)


class PaybackTests(unittest.TestCase):
    def run_case(self, setup, history=None, transactions=True, enabled=True, recurring=True, fee_day=2, today=12):
        reg = registration(SHOP, [], [], 100)
        save = Save({"Day": today}, {}, __file__)
        if enabled:
            activate(save)
        save.root["Transactions"] = {"$items": [charge(SHOP, fee_day, amount, setup=kind)
            for kind, amount in setup] + ([charge(SHOP, fee_day, 1, "water")] if recurring else []) if transactions else []}
        deducted = sum(amount for kind, amount in setup if kind == "oc:tx_internet_installation") if recurring else 0
        rows = statements([(day, {SHOP: (1000 - (deducted if day == fee_day else 0), 2000)})
                           for day in range(2, today)])
        with patch.object(d, "_item_prices", PRICES):
            out = d._payback(save, Names({}), [reg], [business(SHOP, 1)], [], rows,
                             history or d.History(None), "EE")
        return out["sites"][KEY_SHOP]

    def test_installation_reclassification_keeps_break_even_day(self):
        setup = [("oc:tx_internet_installation", 2000)]
        baseline = self.run_case(setup, enabled=False)
        row = self.run_case(setup)
        self.assertEqual(row["cost"]["self"] - baseline["cost"]["self"], 2000)
        self.assertEqual(row["profit"] - baseline["profit"], 2000)
        self.assertEqual(row["self"]["day"], baseline["self"]["day"])

    def test_software_and_cloud_setup_are_cash_only_and_remembered_once(self):
        setup = [("oc:tx_software_setup", 500), ("oc:tx_datacenter_setup", 485),
                 ("oc:tx_internet_installation", 2000)]
        history = d.History(None)
        row = self.run_case(setup, history)
        again = self.run_case(setup, history)
        rolled = self.run_case(setup, history, transactions=False)
        self.assertEqual(row, again)
        self.assertEqual(row, rolled)
        self.assertEqual(row["cost"]["economyExpansion"], 2985)
        self.assertEqual(row["profit"], 10000)  # only internet added back
        self.assertEqual(d.setup_cost([], [], 0, 100, PRICES, occupancy_setup=2985)["self"], 3085)

    def test_installation_without_a_recurring_bill_is_not_added_back(self):
        row = self.run_case([("oc:tx_internet_installation", 2000)], recurring=False)
        self.assertEqual(row["cost"]["economyExpansion"], 2000)
        self.assertEqual(row["profit"], 10000)

    def test_todays_setup_is_already_investment_before_its_statement(self):
        row = self.run_case([("oc:tx_software_setup", 500)], fee_day=12)
        self.assertEqual(row["cost"]["economyExpansion"], 500)
        self.assertEqual(row["profit"], 10000)

    def test_older_save_does_not_include_a_future_remembered_setup(self):
        history = d.History(None)
        self.run_case([("oc:tx_software_setup", 500)], history, fee_day=8)
        before = json.dumps(history.payback("EE"), sort_keys=True)
        row = self.run_case([], history, transactions=False, today=6)
        self.assertNotIn("economyExpansion", row["cost"])
        self.assertEqual(json.dumps(history.payback("EE"), sort_keys=True), before)


class OfficeTests(unittest.TestCase):
    def office(self, **options):
        reg = building(closed=options.get("forced", False))
        reg["customerCapacity"] = 50
        save = activate(Save({"Day": 40, "BuildingRegistrations": {"$items": [reg]},
                              "EmployeeInstances": {"$items": []}}, {}, __file__), **options)
        b = d._business(save, Names({}), reg, (STREET, 10), {}, [], {}, 40)
        b["closed"] = reg["temporarilyClosed"]
        return save, reg, b

    def test_forced_closure_has_its_own_action_even_for_an_old_office(self):
        _, _, b = self.office(forced=True, internet="none")
        rows = [r for r in alerts([b], day=40) if r["group"] == "notrading"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["text"].key, "f.ee.internet")
        self.assertIn("internet plan", rows[0]["text"])
        self.assertNotIn("temporarily closed", rows[0]["text"])

    def test_player_closed_office_keeps_existing_finding(self):
        _, _, b = self.office()
        b.update(opened=39, closed=True)
        rows = [r for r in alerts([b], day=40) if r["group"] == "notrading"]
        self.assertEqual(rows[0]["text"].key, "f.notrading")

    def test_demands_read_active_tiers_and_skip_non_offices(self):
        for options, expected in (({}, []), ({"internet": "business", "plans": {}},
                ["internet", "software", "workspace"]), ({"plans": {"voogle": "complete"}}, ["software"])):
            save, _, b = self.office(**options)
            save.root["EmployeeInstances"] = {"$items": [employee([
                f"oc:jobdemand_technology_{kind}_t3" for kind in ("internet", "workspace", "software")])]}
            d._job_demands(save, Names({}), [b])
            self.assertEqual([r["slug"].split("_")[-2] for r in b["staffDemands"]], expected)
            self.assertTrue(all(r["priority"] == 2 for r in b["staffDemands"]))
            b["status"] = "retail"
            d._job_demands(save, Names({}), [b])
            self.assertEqual(b["staffDemands"], [])

    def test_default_staffing_uses_active_capacity_including_zero(self):
        for options, expected in (({}, 8), ({"cloud": ""}, 4),
                                  ({"cloud": "", "plans": {}}, 2),
                                  ({"forced": True, "internet": "none"}, 0)):
            save, _, b = self.office(**options)
            reg = office_registration(8, [[[8, 20]] for _ in range(7)])
            save.root["BuildingRegistrations"] = {"$items": [reg]}
            b["typeSlug"] = LAW
            grids = d._hourly(save, [reg], [b], {}, {COMPUTER}, {}, Names({}))
            with patch.object(d, "load_buildings", return_value={(STREET, 10): {"t": "office", "z": "C", "v": 1}}):
                [row] = d._office_staffing(save, Names({}), [b], grids, [])
            self.assertFalse(row.get("failed"), row.get("error"))
            self.assertEqual(len({s["s"] for s in row["shifts"]}), expected)
            self.assertEqual(m.ee_office_capacity(save, (STREET, 10), LAW, 8), expected)

    def test_headquarters_connectivity_and_workspace_demands(self):
        save, reg, b = self.office(forced=True, internet="none", plans={})
        reg["businessTypeName"] = "ba:businesstype_headquarters"
        b = d._business(save, Names({}), reg, (STREET, 10), {}, [], {}, 40)
        b["closed"] = True
        save.root["EmployeeInstances"] = {"$items": [employee([
            "oc:jobdemand_technology_workspace_t1", "oc:jobdemand_technology_software_t3"])]}
        d._job_demands(save, Names({}), [b])
        self.assertEqual([r["slug"] for r in b["staffDemands"]], ["oc:jobdemand_technology_workspace_t1"])
        self.assertEqual([r["text"].key for r in alerts([b], day=40) if r["group"] == "notrading"], ["f.ee.internet"])

    def test_pending_contract_is_not_active(self):
        save, _, _ = self.office(plans={})
        state = json.loads(save.root["modData"]["$items"][0]["$v"])
        state["SoftwareContracts"].append({"AddressKey": f"{STREET}_10", "ProviderId": "voogle",
                                          "HasPendingPlan": True, "PendingPlanId": "complete"})
        save.root["modData"]["$items"][0]["$v"] = json.dumps(state)
        self.assertEqual(m.ee_office(save, (STREET, 10), LAW)["workspace"], 0)


if __name__ == "__main__":
    unittest.main()
