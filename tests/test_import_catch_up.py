import unittest

from ba_dashboard import _import_catch_up


class ImportCatchUpTests(unittest.TestCase):
    def test_partial_day_and_delivery_day_excluded(self):
        # Half of today plus two complete days; the drop covers day 3.
        self.assertEqual(_import_catch_up(200, 100, [1] * 7, 0, 3, .5), 50)

    def test_weekday_peak_across_week_boundary(self):
        self.assertEqual(_import_catch_up(100, 100, [2, 1, 1, 1, 1, 1, .5], 6, 9, .5), 225)

    def test_unrounded_demand_rounds_up_only_final_deficit(self):
        self.assertEqual(_import_catch_up(100, 50.2, [1] * 7, 0, 3, 1), 51)

    def test_no_top_up_when_stock_covers_gap_or_delivery_is_due(self):
        self.assertEqual(_import_catch_up(400, 100, [1] * 7, 0, 3, 1), 0)
        self.assertEqual(_import_catch_up(0, 100, [1] * 7, 3, 3, .5), 0)
        self.assertEqual(_import_catch_up(0, 100, [1] * 7, 3, 2, .5), 0)


if __name__ == "__main__":
    unittest.main()
