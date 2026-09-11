"""Staffing summaries retain every gap without repeating identical days."""
import unittest

from ba_dashboard import _off_hours


class StaffingDisplayTests(unittest.TestCase):
    def test_daily_half_shift(self):
        covered = {(day, hour) for day in range(7) for hour in range(12)}
        self.assertEqual(_off_hours(covered), "Mon-Sun 12-24")

    def test_exception_day_keeps_its_own_hours(self):
        covered = {(day, hour) for day in range(7)
                   for hour in range(14 if day == 2 else 12)}
        self.assertEqual(_off_hours(covered), "Mon, Wed-Sun 12-24; Tue 14-24")

    def test_split_shifts_and_nonadjacent_days(self):
        covered = {(day, hour) for day in range(7) for hour in range(24)}
        covered -= {(day, hour) for day in (1, 3, 5) for hour in (0, 1, 12, 13)}
        self.assertEqual(_off_hours(covered), "Mon, Wed, Fri 0-2, 12-14")

    def test_fully_staffed_and_unstaffed(self):
        self.assertEqual(_off_hours({(d, h) for d in range(7) for h in range(24)}), "")
        self.assertEqual(_off_hours(set()), "Mon-Sun 0-24")

    def test_midnight_and_week_boundary(self):
        covered = {(day, hour) for day in range(7) for hour in range(24)}
        covered -= {(day, hour) for day in (0, 1) for hour in (0, 23)}
        self.assertEqual(_off_hours(covered), "Mon, Sun 0-1, 23-24")


if __name__ == "__main__":
    unittest.main()
