"""Uniform warnings cover installed furniture as well as cached customer demands."""
import unittest

from ba_dashboard import AMENITY_DEMANDS, _alerts, _business
from ba_save import Names, Save


UNIFORM = "ba:customerdemand_employeeuniforms"
LOCKER = "ba:itemname_uniformlocker"


class UniformAlertTests(unittest.TestCase):
    def warnings(self, items=(), fulfilled=True, btype="gym", trading=True, name="Gym"):
        demands = [s for s in AMENITY_DEMANDS if fulfilled or s != UNIFORM]
        building = {
            "BusinessName": name,
            "businessTypeName": "ba:businesstype_" + btype,
            "StreetName": "ba:street_fifthavenue", "StreetNumber": 46,
            "creationDay": 1,
            "orderHistory": {"$items": [{"dayNumber": 7, "totalCustomers": 100}]},
            "retailPrices": {"$items": []},
            "itemInstances": {"$items": [{"$v": {"$ref": i}} for i in range(len(items))]},
            "cachedFulfilledCustomerDemands": {"$items": demands},
            "uniformsBySkill": {"$items": []},
        }
        save = Save({}, dict(enumerate(items)), "")
        addr = (building["StreetName"], building["StreetNumber"])
        latest = {addr: {"TotalSales": 1000, "TotalProfit": 500}} if trading else {}
        business = _business(save, Names({}), building, addr, latest, [], {}, 8)
        supply = {"graph": {"links": []}, "shops": [], "idle": [],
                  "nextImportWeekday": None, "imports": []}
        result = _alerts([business], supply, [], [], [], [], [], 8, 1000000)
        return [a for a in result["lines"] if a["group"] == "uniform"]

    def test_gym_without_locker_warns_even_when_cached_demand_is_fulfilled(self):
        warnings = self.warnings([{"itemName": "ba:itemname_gymlockers"}])
        self.assertEqual(len(warnings), 1)
        self.assertIn("No uniform locker", warnings[0]["text"])
        self.assertEqual(warnings[0]["level"], "warn")
        self.assertEqual(warnings[0]["siteKey"], "ba:street_fifthavenue#46")

    def test_installed_locker_and_fulfilled_demand_do_not_warn(self):
        self.assertEqual(self.warnings([{"itemName": LOCKER}]), [])

    def test_installed_locker_does_not_hide_unset_uniforms(self):
        warnings = self.warnings([{"itemName": LOCKER}], fulfilled=False)
        self.assertEqual(len(warnings), 1)
        self.assertIn("No staff uniforms set", warnings[0]["text"])

    def test_missing_locker_and_uniforms_produce_one_actionable_warning(self):
        warnings = self.warnings(fulfilled=False)
        self.assertEqual(len(warnings), 1)
        self.assertIn("No uniform locker", warnings[0]["text"])

    def test_boxed_locker_is_not_installed(self):
        box = {"itemName": "ba:itemname_closedcardboardbox",
               "cargoInstances": {"$items": [{"itemName": LOCKER, "amount": 1}]}}
        self.assertEqual(len(self.warnings([box])), 1)

    def test_other_retail_types_also_need_a_locker(self):
        self.assertEqual(len(self.warnings(btype="giftshop")), 1)

    def test_support_vacant_and_new_nontrading_sites_are_not_flagged(self):
        for options in ({"btype": "warehouse"}, {"btype": "factory"}, {"btype": "lawfirm"},
                        {"name": ""}, {"trading": False}):
            with self.subTest(options=options):
                self.assertEqual(self.warnings(**options), [])


if __name__ == "__main__":
    unittest.main()
