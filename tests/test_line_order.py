"""A business's product lines come out in one order, whatever the hash seed."""
import unittest

from ba_dashboard import _business
from ba_save import Names, Save


SLUGS = [
    "ba:itemname_paperbag", "ba:itemname_smartwatch2", "ba:itemname_calculator",
    "ba:itemname_mousepad", "ba:itemname_officephone", "ba:itemname_graphictablet",
    "ba:itemname_computermonitor", "ba:itemname_umbrella",
]


class LineOrderTests(unittest.TestCase):
    def lines(self, slugs=SLUGS):
        # One shelf holding every item and no sales, so every line ties on cover (None).
        shelf = {"itemName": "ba:itemname_roundedshelf",
                 "cargoInstances": {"$items": [{"itemName": s, "amount": 10} for s in slugs]}}
        building = {
            "BusinessName": "Shop",
            "businessTypeName": "ba:businesstype_giftshop",
            "StreetName": "ba:street_fifthavenue", "StreetNumber": 46,
            "creationDay": 1,
            "orderHistory": {"$items": [{"dayNumber": 7, "totalCustomers": 100}]},
            "retailPrices": {"$items": []},
            "itemInstances": {"$items": [{"$v": {"$ref": 0}}]},
            "cachedFulfilledCustomerDemands": {"$items": []},
            "uniformsBySkill": {"$items": []},
        }
        save = Save({}, {0: shelf}, "")
        addr = (building["StreetName"], building["StreetNumber"])
        return _business(save, Names({}), building, addr, {}, [], {}, 8)["lines"]

    def test_lines_tied_on_cover_are_ordered_by_item(self):
        # Set iteration follows the per-process hash seed, so without a tiebreak these
        # rows reshuffled between runs and between page loads.
        lines = self.lines()
        self.assertTrue(all(line["cover"] is None for line in lines))
        self.assertEqual([line["slug"] for line in lines], sorted(SLUGS))

    def test_an_item_with_no_name_sorts_last_instead_of_failing(self):
        # Real saves hold cargo with no itemName; sorting it beside strings must not raise.
        lines = self.lines(SLUGS + [None])
        self.assertEqual([line["slug"] for line in lines], sorted(SLUGS) + [None])


if __name__ == "__main__":
    unittest.main()
