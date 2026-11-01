"""EE Workshop 2026-10-14 adapter: synthetic saves, no mod execution."""
import copy
import json
import unittest
from unittest.mock import patch

import ba_dashboard as d
import ba_mods as m
from ba_save import Names, Save
from tests.test_building_facts import renovation, GIFTS
from tests.save_fixtures import data_company


def address(n):
    return "ba:street_test", n


def row(kind="retail", hood="industrycity", area=75):
    return {"t": kind, "h": hood, "m": area, "x": 30, "z": "A", "v": 1}


def registration(addr, rent, **extra):
    return {"StreetName": addr[0], "StreetNumber": addr[1], "RentedByPlayer": True,
            "RentPerDay": rent, "businessTypeName": "ba:businesstype_empty", **extra}


def fixture(table, factors=(), off=()):
    regs = [registration(addr, max(1, int(d._rent_estimate(table[addr]) * m.ee_multiplier(table[addr]) * factor + .5)))
            for addr, factor in factors]
    regs += [registration(addr, d._rent_estimate(table[addr])) for addr in off]
    return Save({"Day": 40, "BuildingRegistrations": {"$items": regs}, "modData": {"$items": [
        {"$k": m.ECONOMY_KEY, "$v": json.dumps({"LastSettlementDay": 39})}]}}, {}, "synthetic.hsg")


class FactorTests(unittest.TestCase):
    def inputs(self, save, table):
        return m.ee_inputs(save, table, d._rent_estimate)

    def test_one_and_agreeing_leases(self):
        table = {address(n): row() for n in range(3)}
        for count in (1, 3):
            inputs = self.inputs(fixture(table, [(a, .3) for a in list(table)[:count]]), table)
            self.assertEqual(inputs["rent"]["factor"], .3)
            self.assertEqual(inputs["rent"]["leases"], count)
            self.assertEqual(inputs["rent"]["support"], count)
            self.assertEqual(inputs["rent"]["source"], "leases")

    def test_mode_ties_and_registration_order(self):
        table = {address(n): row() for n in range(4)}
        for factors, expected in (([.5, .3, .5], .5), ([.5, .3], .3), ([.5, .3, .3, .5], .3)):
            save = fixture(table, list(zip(table, factors)))
            before = self.inputs(save, table)
            save.root["BuildingRegistrations"]["$items"].reverse()
            self.assertEqual(self.inputs(save, table), before)
            self.assertEqual(before["rent"]["factor"], expected)

    def test_mixed_types_and_districts_derive_the_same_factor(self):
        table = {address(n): row(kind, hood, 660 if kind == "office" else 225)
                 for n, (kind, hood) in enumerate((('retail', 'industrycity'), ('retail', 'midtown'),
                                                   ('office', 'murrayhill'), ('warehouse', 'industrycity')))}
        rent = self.inputs(fixture(table, [(a, .3) for a in table]), table)["rent"]
        self.assertEqual((rent["factor"], rent["leases"], rent["support"]), (.3, 4, 4))

    def test_rebalance_off_and_tie_prefers_off(self):
        table = {address(1): row(), address(2): row("office", "murrayhill")}
        save = fixture(table, [(address(1), .3)], [address(2)])
        inputs = self.inputs(save, table)
        self.assertFalse(inputs["rent"]["rebalance"])
        self.assertEqual(d._rent_estimate(table[address(1)], inputs), d._rent_estimate(table[address(1)]))
        self.assertEqual(d._deposit_estimate(row(), 100, inputs), d._deposit_estimate(row(), 100))

    def test_ignore_renovated_residential_and_owned(self):
        table = {GIFTS: row(), address(2): row("residential"), address(3): row(), address(4): row()}
        save = fixture(table, [(GIFTS, .9), (address(3), .7), (address(4), .5)])
        save.root["BuildingRegistrations"]["$items"] += [registration(address(2), 999)]
        save.root["BuildingRegistrations"]["$items"][-2]["BuildingOwnedByPlayer"] = True
        save.root["realEstate"] = {"$items": [{"address": {"streetName": address(3)[0], "streetNumber": 3}}]}
        save.root["modData"]["$items"].append({"$k": m.RETAIL_KEY, "$v": renovation()})
        rent = self.inputs(save, table)["rent"]
        self.assertEqual((rent["leases"], rent["factor"], rent["source"]), (0, .3, "preference"))

    def test_no_leases_default_zero_option_and_inactive_detection(self):
        table = {address(1): row()}
        save = fixture(table)
        self.assertEqual(self.inputs(save, table)["rent"]["source"], "preference")
        self.assertEqual(self.inputs(save, table)["utilityFactor"], 1)
        zero = fixture(table, [(address(1), 0)])
        inputs = self.inputs(zero, table)
        self.assertEqual(inputs["rent"]["factor"], 0)
        self.assertEqual(d._rent_estimate(row(), inputs), 1)  # EE RoundMoney's minimum.
        for value in ([], [{"$k": m.ECONOMY_KEY, "$v": '{"LastSettlementDay":1}'}]):
            root = copy.deepcopy(save.root)
            root["modData"]["$items"] = value
            self.assertIsNone(self.inputs(Save(root, {}, "synthetic.hsg"), table))


class QuotesTests(unittest.TestCase):
    def test_cloud_demand_factors_are_versioned_adapter_inputs(self):
        inputs = m.ee_inputs(fixture({}), {}, d._rent_estimate)
        self.assertIn("2026-10-14", inputs["source"])
        self.assertEqual(inputs["cloudDemand"], {"business": {
            "lawfirm": 5, "webdevelopment": 2, "headquarter": 3,
            "graphicdesigner": 1.25, "marketingagency": 1.25,
            "eventplanning": 1.15, "travel": 1.15}, "office": 1, "voogle": .9})

    def test_rent_and_deposit_types_districts_owned(self):
        inputs = m.ee_inputs(fixture({}), {}, d._rent_estimate)
        for kind in ("retail", "office", "warehouse", "cinema", "theater"):
            for hood in ("industrycity", "murrayhill", "midtown"):
                with self.subTest(kind=kind, hood=hood):
                    building = row(kind, hood)
                    vanilla = d._rent_estimate(building)
                    expected = int(max(1, vanilla * m.EE_TYPES[kind] * m.EE_DISTRICTS.get(hood, {}).get(kind, 1) * .3) + .5)
                    rent = d._rent_estimate(building, inputs)
                    self.assertEqual(rent, expected)
                    self.assertEqual(d._deposit_estimate(building, rent, inputs), 15 * rent)
                    self.assertEqual(d._rent_estimate(building, inputs, True), 0)
                    self.assertEqual(d._deposit_estimate(building, 0, inputs, True), 0)
        self.assertIsNone(d._rent_estimate(row("residential"), inputs))

    def test_premises_checks_and_vanilla_has_no_inputs(self):
        table = {address(1): row(), address(2): row("office", "murrayhill")}
        save = fixture(table, [(address(1), .3)])
        rent = save.root["BuildingRegistrations"]["$items"][0]["RentPerDay"]
        save.root["BuildingRegistrations"]["$items"].append(registration(address(2), 0, RentedByPlayer=False))
        save.root["Transactions"] = {"$items": [{"transactionType": d.DEPOSIT_TRANSACTION, "amount": -15*rent,
            "address": {"streetName": address(1)[0], "streetNumber": 1}}]}
        with patch.object(d, "load_buildings", return_value=table):
            payload = d._premises(save, Names({}), {})
            self.assertEqual(payload["rent"]["check"], {"leases": 1, "worst": 0})
            self.assertEqual(payload["rent"]["deposit"]["check"], {"deposits": 1, "worst": 0})
            self.assertTrue(all("ee" in b for b in payload["buildings"]))
            save.root["modData"] = {"$items": []}
            vanilla = d._premises(Save(copy.deepcopy(save.root), {}, "synthetic.hsg"), Names({}), {})
            self.assertNotIn("economyExpansion", vanilla["rent"])
            self.assertTrue(all("ee" not in b for b in vanilla["buildings"]))

    def test_ee_does_not_restore_rent_withheld_by_another_adapter(self):
        table = {address(1): row()}
        save = fixture(table, [(address(1), .3)])
        with (patch.object(d, "load_buildings", return_value=table),
              patch.object(d.ba_economy, "report", return_value={"status": "partial"}),
              patch.object(d.ba_economy, "module", return_value={"status": "unavailable"})):
            building = d._premises(save, Names({}), {})["buildings"][0]
        self.assertIsNone(building["rent"])
        self.assertIsNone(building["ee"]["vanillaRent"])

    def test_observed_utilities_are_type_specific_and_owned_are_ignored(self):
        table = {address(1): row(), address(2): row("office", "midtown")}
        save = fixture(table, [(address(1), .3), (address(2), .3)])
        def charge(n, component, amount, day=39):
            return {"address": {"streetName": address(n)[0], "streetNumber": n}, "amount": -amount,
                    "timestamp": {"Day": day}, "transactionData": {"$items": [
                        {"$k": "occupancyComponent", "$v": component}]}}
        save.root["Transactions"] = {"$items": [charge(1, "electricity", 60), charge(1, "water", 15),
            charge(1, "waste", 0), charge(1, "internet", 9000), charge(1, "electricity", 9000, 40),
            charge(2, "electricity", 150)]}
        inputs = m.ee_inputs(save, table, d._rent_estimate)
        self.assertEqual(inputs["utilities"]["retail"], {"perM2": 1, "source": "charges", "sites": 1, "days": 1})
        self.assertEqual(inputs["utilities"]["office"]["perM2"], 2)
        save.root["BuildingRegistrations"]["$items"][1]["BuildingOwnedByPlayer"] = True
        self.assertNotIn("office", m.ee_inputs(save, table, d._rent_estimate)["utilities"])

    def test_sections_get_inputs_only_for_detected_ee(self):
        root = data_company()
        original = Save(copy.deepcopy(root), {}, __file__)
        # Section integration uses the same synthetic fixture as payload snapshots.
        root["modData"] = {"$items": [{"$k": m.ECONOMY_KEY, "$v": json.dumps({"LastSettlementDay": root["Day"]})}]}
        modded = Save(root, {}, __file__)
        for save, expected in ((original, False), (modded, True)):
            build = d.build_core(save, Names({}))
            for section, key in (("premises", "premises"), ("openStore", "openStore"), ("openFactory", "openFactory")):
                result = d.section(build, section)[key]
                target = result["rent"] if key == "premises" else result
                self.assertEqual("economyExpansion" in target, expected)


if __name__ == "__main__":
    unittest.main()
