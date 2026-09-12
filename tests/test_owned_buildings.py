import unittest

from ba_dashboard import _owned_buildings
from ba_save import Names, Save


class OwnedBuildingsTests(unittest.TestCase):
    def test_purchased_property_is_independent_of_business_tenancy(self):
        address = {'streetName': 'ba:street_harborstreet', 'streetNumber': 5}
        save = Save({
            'realEstate': {'$items': [{'$ref': 1}]},
            'BuildingRegistrations': {'$items': [
                {'StreetName': 'ba:street_fifthavenue', 'StreetNumber': 57, 'RentedByPlayer': True}
            ]},
        }, {1: {'address': {'$ref': 2}, 'purchaseDay': 156, 'purchasePrice': 18250000},
            2: address}, '')
        result = _owned_buildings(save, Names({'street_harborstreet': 'Harbor Street'}))
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['key'], 'ba:street_harborstreet#5')
        self.assertEqual(result[0]['purchaseDay'], 156)
        self.assertEqual(result[0]['purchasePrice'], 18250000)

    def test_missing_ownership_and_unresolved_addresses(self):
        names = Names({})
        self.assertEqual(_owned_buildings(Save({}, {}, ''), names), [])
        save = Save({'realEstate': {'$items': [{'address': {'$ref': 9}}]}}, {}, '')
        self.assertEqual(_owned_buildings(save, names), [])
