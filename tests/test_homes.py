import unittest

from ba_dashboard import _homes
from ba_save import Names


class HomesTests(unittest.TestCase):
    def test_residential_registrations_become_homes(self):
        buildings = [
            {'StreetName': 'ba:street_tenthstreet', 'StreetNumber': 2, 'RentedByPlayer': True, 'RentPerDay': 34.0},
            {'StreetName': 'ba:street_fifthavenue', 'StreetNumber': 57, 'RentedByPlayer': True, 'RentPerDay': 453.0},
        ]
        residential = {('ba:street_tenthstreet', 2)}
        result = _homes(buildings, residential, Names({'street_tenthstreet': 'Tenth Street'}))
        self.assertEqual(result, [{'key': 'ba:street_tenthstreet#2', 'address': '2 Tenth Street', 'rent': 34.0}])

    def test_no_residences(self):
        self.assertEqual(_homes([{'StreetName': 'ba:street_fifthavenue', 'StreetNumber': 57}], set(), Names({})), [])


if __name__ == '__main__':
    unittest.main()
