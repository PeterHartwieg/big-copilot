"""Issue #523: furniture catalogue dollars must stay unit prices."""
import unittest

from ba_dashboard import item_price, load_item_prices, setup_cost


class FurniturePricesTests(unittest.TestCase):
    def test_armchair_unit_prices_match_the_game_catalogue(self):
        # Checked against the installed Items bundle, 2026-10-28. The issue
        # reports $130 at Ika; $1,300 is ten Sommerhus chairs, not one.
        prices = load_item_prices()
        for item, expected in (("armchair1", 130), ("armchair2", 270),
                               ("armchairluxury", 310)):
            with self.subTest(item=item):
                self.assertEqual(item_price("ba:itemname_" + item, 0, prices), expected)

    def test_sommerhus_setup_cost_scales_with_quantity(self):
        for quantity in (1, 10):
            with self.subTest(quantity=quantity):
                cost = setup_cost([("ba:itemname_armchair1", 0)] * quantity,
                                  [], 0, 0, load_item_prices())
                self.assertEqual(cost["furniture"], 130 * quantity)
                self.assertEqual(cost["self"], 130 * quantity)
                self.assertEqual(cost["firm"], 130 * quantity)


if __name__ == "__main__":
    unittest.main()
