"""Staffing summaries retain every gap without repeating identical days."""
import unittest

from ba_dashboard import _off_hours
from tests.i18n_check import MsgAsserts, msg_param


class StaffingDisplayTests(MsgAsserts, unittest.TestCase):
    def test_daily_half_shift(self):
        covered = {(day, hour) for day in range(7) for hour in range(12)}
        self.assertMsg(_off_hours(covered), "sp.py.when.part",
                       days=msg_param("sp.py.when.days", a=msg_param("sp.py.wd.1"), b=msg_param("sp.py.wd.0")),
                       hours=msg_param("sp.py.when.hours", a=12, b=24))

    def test_exception_day_keeps_its_own_hours(self):
        covered = {(day, hour) for day in range(7)
                   for hour in range(14 if day == 2 else 12)}
        self.assertMsg(_off_hours(covered), "sp.py.list.semi",
                       a=msg_param("sp.py.when.part",
                                   days=msg_param("sp.py.list.comma", a=msg_param("sp.py.wd.1"),
                                                  b=msg_param("sp.py.when.days", a=msg_param("sp.py.wd.3"), b=msg_param("sp.py.wd.0"))),
                                   hours=msg_param("sp.py.when.hours", a=12, b=24)),
                       b=msg_param("sp.py.when.part", days=msg_param("sp.py.wd.2"),
                                   hours=msg_param("sp.py.when.hours", a=14, b=24)))

    def test_split_shifts_and_nonadjacent_days(self):
        covered = {(day, hour) for day in range(7) for hour in range(24)}
        covered -= {(day, hour) for day in (1, 3, 5) for hour in (0, 1, 12, 13)}
        self.assertMsg(_off_hours(covered), "sp.py.when.part",
                       days=msg_param("sp.py.list.comma", a=msg_param("sp.py.wd.1"),
                                      b=msg_param("sp.py.list.comma", a=msg_param("sp.py.wd.3"),
                                                  b=msg_param("sp.py.wd.5"))),
                       hours=msg_param("sp.py.list.comma", a=msg_param("sp.py.when.hours", a=0, b=2),
                                       b=msg_param("sp.py.when.hours", a=12, b=14)))

    def test_fully_staffed_and_unstaffed(self):
        self.assertEqual(_off_hours({(d, h) for d in range(7) for h in range(24)}), "")
        self.assertMsg(_off_hours(set()), "sp.py.when.part",
                       days=msg_param("sp.py.when.days", a=msg_param("sp.py.wd.1"), b=msg_param("sp.py.wd.0")),
                       hours=msg_param("sp.py.when.hours", a=0, b=24))

    def test_midnight_and_week_boundary(self):
        covered = {(day, hour) for day in range(7) for hour in range(24)}
        covered -= {(day, hour) for day in (0, 1) for hour in (0, 23)}
        self.assertMsg(_off_hours(covered), "sp.py.when.part",
                       days=msg_param("sp.py.list.comma", a=msg_param("sp.py.wd.1"), b=msg_param("sp.py.wd.0")),
                       hours=msg_param("sp.py.list.comma", a=msg_param("sp.py.when.hours", a=0, b=1),
                                       b=msg_param("sp.py.when.hours", a=23, b=24)))


if __name__ == "__main__":
    unittest.main()
