import unittest
from unittest.mock import patch

from ba_dashboard import _homes
from ba_save import Names

# Two rows of the static building table, keyed the way load_buildings() keys it.
TABLE = {
    ('ba:street_tenthstreet', 2): {'s': 'ba:street_tenthstreet', 'n': 2, 'h': 'greenwichvillage',
                                   't': 'residential', 'z': 'A1', 'm': 204, 'x': 3},
}


def homes(buildings, residential, names, table=TABLE):
    with patch('ba_dashboard.load_buildings', return_value=table):
        return _homes(buildings, residential, names)


class HomesTests(unittest.TestCase):
    def test_residential_registrations_become_homes(self):
        buildings = [
            {'StreetName': 'ba:street_tenthstreet', 'StreetNumber': 2, 'RentedByPlayer': True, 'RentPerDay': 34.0},
            {'StreetName': 'ba:street_fifthavenue', 'StreetNumber': 57, 'RentedByPlayer': True, 'RentPerDay': 453.0},
        ]
        residential = {('ba:street_tenthstreet', 2)}
        result = homes(buildings, residential, Names({'street_tenthstreet': 'Tenth Street'}))
        self.assertEqual(result, [{
            'key': 'ba:street_tenthstreet#2',
            'address': '2 Tenth Street',
            'rent': 34.0,
            'm': 204,
            'hood': 'ba:neighborhood_greenwichvillage',
        }])

    def test_building_missing_from_the_table_reads_unknown_not_zero(self):
        buildings = [{'StreetName': 'ba:street_fifthavenue', 'StreetNumber': 57, 'RentPerDay': 453.0}]
        result = homes(buildings, {('ba:street_fifthavenue', 57)}, Names({'street_fifthavenue': 'Fifth Avenue'}))
        self.assertEqual(len(result), 1)
        self.assertIsNone(result[0]['m'])
        self.assertIsNone(result[0]['hood'])
        self.assertEqual(result[0]['rent'], 453.0)

    def test_the_table_is_read_inside_the_call(self):
        """Pyodide opens no file at import time: the lookup happens per call."""
        with patch('ba_dashboard.load_buildings', return_value={}) as lookup:
            _homes([{'StreetName': 'ba:street_tenthstreet', 'StreetNumber': 2}],
                   {('ba:street_tenthstreet', 2)}, Names({}))
        lookup.assert_called_once_with()

    def test_no_residences(self):
        self.assertEqual(homes([{'StreetName': 'ba:street_fifthavenue', 'StreetNumber': 57}], set(), Names({})), [])


if __name__ == '__main__':
    unittest.main()
