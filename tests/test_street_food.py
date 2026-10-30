"""Street Food compatibility uses synthetic saves, including broken mod blocks."""
import copy
import json
from pathlib import Path
import tempfile
import unittest

import ba_dashboard as d
import ba_facts
import ba_street_food as sf
from ba_save import Names, load_save
from tests import save_fixtures as f
from tests.es3_fixture import address, encode
from tests.test_building_facts import facts_for
from tests.test_real_estate import load as load_tree


def load(root):
    root = copy.deepcopy(root)
    if isinstance(root.get("modData"), dict):
        root["modData"] = [{"$k": k, "$v": v} for k, v in root["modData"].items()]
    return load_tree(root)


def state():
    return {"schemaVersion": 1, "writtenByModVersion": "0.10.0",
            "vehicles": [{"vehicleId": "cart", "crew": ["crew"]}],
            "dailySales": [{"day": 4, "revenueCents": 100000, "costCents": 20000,
                "licenceCents": 1000, "eventPlacesCents": -500, "deliveryFeesCents": 200,
                "inSummary": True, "summaryCents": 75300,
                "byVehicle": [{"vehicleId": "cart", "wagesCents": 12000, "parkingCents": 3000,
                    "commissaryRentCents": 4000}]}]}


def company(block=None, marker=None):
    root = f.data_company(day=5)
    root["modData"] = {sf.KEY: json.dumps(block if block is not None else state())}
    if marker is not None:
        root["modData"][sf.SNAPSHOT_KEY] = json.dumps(marker)
    root["VehicleInstances"].append({"id": "cart", "vehicleTypeName": "foodtrucks:vehicletype_foodcart"})
    root["EmployeeInstances"].append({"id": "crew", "assignedAddress": None,
        "characterData": {"name": "Cart Crew", "skills": [{"name": f.CLEANING, "value": 70.0}]}})
    root["EmployeeInstances"].append({"id": "free", "assignedAddress": None,
        "characterData": {"name": "Free Person", "skills": [{"name": f.CLEANING, "value": 70.0}]}})
    return root


class StreetFoodTests(unittest.TestCase):
    def test_presence_is_evidence_in_save_not_installed_claim(self):
        self.assertIsNone(sf.metadata(load(f.data_company())))
        save = load(company())
        self.assertEqual(sf.metadata(save), {"status": "ready", "vehicles": 1, "live": False, "version": "0.10.0"})
        self.assertEqual(d.ba_mods.detect(save)["streetFood"]["vehicles"], 1)

    def test_bad_and_future_blocks_fail_closed(self):
        invalid = [None, "{", '{"schemaVersion":2}', '{"schemaVersion":true}',
                   '{"schemaVersion":1,"dailySales":[null]}', '{"schemaVersion":1,"dailySales":[{"day":1,"revenueCents":NaN}]}']
        for raw in invalid:
            with self.subTest(raw=raw):
                root = company()
                root["modData"][sf.KEY] = raw
                save = load(root)
                self.assertEqual(sf.read(save)["status"], "unavailable")
                self.assertTrue(sf.reserved(save, {"id": "free"}))
                self.assertFalse(sf.reserved(save, {"id": "assigned", "assignedAddress": address(*f.HUB)}))

    def test_live_source_requires_a_fresh_provider_and_file_does_not(self):
        save = load(company())
        save.live_source = True
        self.assertEqual(sf.read(save)["status"], "stale")
        self.assertTrue(sf.reserved(save, {"id": "free"}))
        fresh = load(company(marker={"status": "fresh"}))
        fresh.live_source = True
        self.assertEqual(sf.read(fresh)["status"], "ready")
        self.assertFalse(sf.reserved(fresh, {"id": "free"}))
        self.assertEqual(sf.read(load(company(marker={"status": "unavailable"})))["status"], "stale")
        self.assertEqual(sf.read(load(company(marker={})))["status"], "stale")

    def test_daily_accounts_move_costs_without_booking_profit_twice(self):
        save = load(company())
        summary = {"dayNumber": 4, "businessIncomeStatements": {"$items": []},
                   "totalProfit": 603.0, "totalUnassignedStaffWages": -120.0, "parkingFees": -30.0}
        row = d._daily_series(save, [summary])[0]
        self.assertEqual(row["profit"], 603.0)
        self.assertEqual((row["revenue"], row["cogs"], row["wages"], row["parking"]), (1000, 200, 120, 0))
        food = row["streetFood"]
        self.assertEqual(food["profit"], 603)
        self.assertEqual(food["otherCosts"], 47)
        self.assertEqual(food["adjustment"], 0)
        summary["totalUnassignedStaffWages"] = -10
        summary["parkingFees"] = -5
        food = sf.statement(save, summary)
        self.assertEqual((food["wages"], food["parking"], food["profit"]), (0, 0, 753))

    def test_exported_link_snapshot_preserves_freshness_requirement(self):
        # Old links export current game data alongside the last saved modData.
        # A new crew assignment after that save is absent from the mod block.
        for marker, status, reserved in ((None, "stale", True),
                                         ({"status": "fresh"}, "ready", False)):
            with self.subTest(marker=marker), tempfile.TemporaryDirectory() as tmp:
                root = company(marker=marker)
                root["modData"] = [{"$k": k, "$v": v} for k, v in root["modData"].items()]
                raw = encode(root)
                path = Path(tmp, "exported.bcsave")
                path.write_bytes(ba_facts.pack(raw, facts_for(raw, root)))
                save = load_save(str(path))
                self.assertFalse(getattr(save, "live_source", False))
                self.assertEqual(sf.read(save)["status"], status)
                self.assertEqual(sf.reserved(save, {"id": "free"}), reserved)
                period = d._tax_period(save)
                self.assertEqual(period.get("unavailable"), "streetFood" if reserved else None)
                if reserved:
                    self.assertFalse(d._tax_shelter(save, period, [])["assessed"])

    def test_legacy_summary_and_unbooked_days(self):
        block = state()
        del block["dailySales"][0]["summaryCents"]
        save = load(company(block))
        summary = {"dayNumber": 4}
        self.assertEqual(sf.statement(save, summary)["profit"], 800)
        self.assertEqual(sf.statement(save, summary)["adjustment"], 47)
        block["dailySales"][0]["inSummary"] = False
        self.assertIsNone(sf.statement(load(company(block)), summary))
        self.assertIsNone(sf.statement(save, {"dayNumber": 3}))

    def test_tax_revenue_and_only_paid_rent_are_projected(self):
        root = company()
        root["financialSummaries"] = []
        root["currentTaxPeriodDeductibleExpenses"] = [{"key": sf.COMMISSARY_EXPENSE, "amount": -140.0}]
        period = d._tax_period(load(root))
        self.assertEqual(period["sales"], 1000)
        self.assertEqual(period["salesEnd"], 1000 * 56)
        self.assertEqual(period["deductionsEnd"], 100 + 40 * 60 / 5)
        root["modData"][sf.SNAPSHOT_KEY] = '{"status":"unavailable"}'
        period = d._tax_period(load(root))
        self.assertEqual(period["unavailable"], "streetFood")
        self.assertFalse(d._tax_shelter(load(root), period, [])["assessed"])

    def test_crews_are_absent_from_both_planning_and_hiring(self):
        save = load(company())
        _, staff = d._staff(save, Names(f.data_names()))
        self.assertTrue(next(p for p in staff if p["id"] == "crew")["streetFood"])
        people = d._plan_people(save, staff)
        self.assertNotIn("crew", people)
        self.assertIn("free", people)
        hiring = d._hiring(save, [], [], {}, [])
        self.assertNotIn("crew", hiring["bench"])
        self.assertIn("free", hiring["bench"])

    def test_commissary_addresses_and_upstream_factory_inputs_are_protected(self):
        self.assertEqual(sf.address_number("hells-kitchen"), -715930767)
        root = company()
        comm = (sf.PARKING_STREET, sf.address_number("test"))
        warehouse, factory, upstream = f.HUB, ("test-street", 2), ("test-street", 3)
        root["logisticsManagerPlans"] = [
            {"targetAddress": address(*source), "destinations": [{"deliveryTargetAddress": address(*dest)}]}
            for source, dest in [(warehouse, comm), (factory, warehouse), (upstream, factory)]]
        save = load(root)
        self.assertEqual(sf.protected_sites(save), {warehouse, factory, upstream})
        businesses = [{"key": d.site_key(k)} for k in [warehouse, factory, upstream, ("other", 4)]]
        fact = {"st": "surplus", "setTo": 0, "imp": True, "use": 0, "need": 0, "dem": {"setTo": 0}}
        supply = {"facts": {str(i): {"food": copy.deepcopy(fact)} for i in range(4)},
                  "imports": [{"s": 0}, {"s": 3}], "importsDem": [], "idle": [{"s": 0}, {"s": 3}],
                  "factories": {"sites": [{"s": 1}, {"s": 3}]}}
        sf.restrict_supply(save, businesses, supply)
        self.assertEqual(supply["streetFoodRestricted"], [0, 1, 2])
        self.assertEqual(supply["imports"], [{"s": 3}])
        self.assertEqual(supply["idle"], [{"s": 3}])
        self.assertEqual(supply["facts"]["0"]["food"]["why"], "streetFood")
        self.assertIsNone(supply["facts"]["0"]["food"]["dem"]["setTo"])
        self.assertEqual(supply["facts"]["3"]["food"], fact)
        self.assertTrue(supply["factories"]["sites"][0]["streetFoodRestricted"])

    def test_extracted_commissary_supplier_has_no_import_recommendations(self):
        root = company()
        root["logisticsManagerPlans"][0]["destinations"].append({
            "deliveryTargetAddress": address(sf.PARKING_STREET, sf.address_number("test")),
            "stockTargets": [{"itemName": f.WATER, "targetAmount": 100}]})
        root["modData"] = [{"$k": k, "$v": v} for k, v in root["modData"].items()]
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp, "commissary-supplier.hsg")
            path.write_bytes(encode(root))
            payload = d.extract(load_save(str(path)), Names(f.data_names()))
        businesses, supply = payload["businesses"], payload["supply"]
        key = d.site_key(f.HUB)
        index = next(i for i, b in enumerate(businesses) if b["key"] == key)
        self.assertIn(index, supply["streetFoodRestricted"])
        self.assertTrue(supply["facts"][str(index)])
        for mode in d.SIZING_MODES:
            with self.subTest(mode=mode):
                for slug in supply["facts"][str(index)]:
                    fact = d._supply_fact(supply["facts"], index, slug, mode)
                    self.assertEqual((fact["st"], fact["why"], fact["imp"]), ("new", "streetFood", False))
                    self.assertIsNone(fact["setTo"])
                    self.assertIsNone(fact["need"])
                findings = d._import_notes(businesses, supply, set(), mode)
                self.assertFalse(any(row.get("siteKey") == key for row in findings))

    def test_tax_excludes_partial_today_from_the_finished_day_average(self):
        block = state()
        block["dailySales"].append({"day": 5, "revenueCents": 10000})
        root = company(block)
        root["financialSummaries"] = []
        period = d._tax_period(load(root))
        self.assertEqual(period["sales"], 1100)
        self.assertEqual(period["salesEnd"], 1000 + 1000 * 55)

    def test_partial_today_cannot_trigger_tax_purchase_advice(self):
        block = state()
        block["dailySales"] = [{"day": 58, "revenueCents": 7440000},
                               {"day": 59, "revenueCents": 200000}]
        root = company(block)
        root["Day"] = 59
        root["financialSummaries"] = []
        save = load(root)
        period = d._tax_period(save)
        self.assertEqual(period["sales"], 76400)
        self.assertEqual(period["salesEnd"], 148800)
        shelter = d._tax_shelter(save, period, [("test-building", 100000)])
        self.assertFalse(shelter["assessed"])
        self.assertEqual(shelter["pick"], [])


if __name__ == "__main__":
    unittest.main()
