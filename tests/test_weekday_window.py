"""The weekday charts name what they read (UX audit R15, fold-views).

The company's own week, the Daily result chart's By weekday, reads the last four
weeks only; the full-length profiles stay what the supply sizing reads. The
Products table's peaks carry the weeks of sales they come from. Synthetic data only.
"""
import unittest

from ba_dashboard import RHYTHM_RECENT_DAYS, WEEKDAYS, _chain_rhythm, _product_rhythm, _weekday_profile
from ba_save import Save

# Day 1 was a Monday, so day % 7 counts from Sunday, as WEEKDAYS does.
EARLY = {5: 1.3, 6: 0.8, 0: 0.8}   # Friday strong, the weekend weak
LATE = {6: 1.3, 0: 1.2, 3: 0.8}    # Saturday and Sunday strong


def series(days, switch):
    """Revenue that peaks Friday until `switch`, then on the weekend."""
    return [(d, 10000 * (EARLY if d < switch else LATE).get(d % 7, 1.0)) for d in days]


def peak(profile):
    return max(profile, key=lambda p: p["index"])["day"]


class WeekdayWindowTests(unittest.TestCase):
    def test_the_last_four_weeks_give_every_weekday_four_readings(self):
        points = series(range(1, 60), switch=29)
        full = _weekday_profile(points)
        recent = _weekday_profile(points, RHYTHM_RECENT_DAYS)
        self.assertEqual(RHYTHM_RECENT_DAYS, 28)
        self.assertEqual({p["n"] for p in recent}, {4})
        self.assertGreater(min(p["n"] for p in full), 4)
        # The old week is gone from the recent read: it peaks on the weekend.
        self.assertIn(peak(recent), ("Saturday", "Sunday"))
        self.assertEqual([p["day"] for p in recent][:1], ["Monday"])

    def test_the_window_is_calendar_days_so_a_gappy_series_does_not_reach_back(self):
        # Profit leaves out the loss days. Two Mondays in the last four weeks
        # were losses: Monday reads from the two left, not from older Mondays.
        points = [(d, v) for d, v in series(range(1, 60), switch=29)
                  if not (d % 7 == 1 and d in (36, 50))]
        recent = _weekday_profile(points, RHYTHM_RECENT_DAYS, end=59)
        counts = {p["day"]: p["n"] for p in recent}
        self.assertEqual(counts.pop("Monday"), 2)
        self.assertEqual(set(counts.values()), {4})
        # And the chain counts back from its last finished day, not from the
        # last day a series happens to have.
        daily = [{"day": d, "revenue": v, "profit": v / 2 if d not in (57, 58) else -1}
                 for d, v in series(range(1, 60), switch=29)]
        profit = _chain_rhythm(Save({}, {}, "test.hsg"), [], daily, 60)["recent"]["profit"]
        self.assertLessEqual(max(p["n"] for p in profit), 4)
        self.assertEqual(sum(p["n"] for p in profit), 26)

    def test_a_short_history_reads_the_same_either_way(self):
        points = series(range(1, 22), switch=0)
        self.assertEqual(_weekday_profile(points), _weekday_profile(points, RHYTHM_RECENT_DAYS))

    def test_the_chain_carries_both_windows(self):
        daily = [{"day": d, "revenue": v, "profit": v / 2} for d, v in series(range(1, 60), switch=29)]
        rhythm = _chain_rhythm(Save({}, {}, "test.hsg"), [], daily, 60)
        recent = rhythm["recent"]
        self.assertEqual(recent["days"], RHYTHM_RECENT_DAYS)
        self.assertEqual({p["n"] for p in recent["revenue"]}, {4})
        self.assertEqual({p["n"] for p in recent["profit"]}, {4})
        # No shop reports customers here, so that series has nothing to draw.
        self.assertIsNone(recent["customers"])
        # The full-length series are unchanged, for the supply sizing.
        self.assertEqual(rhythm["revenue"], _weekday_profile([(d["day"], d["revenue"]) for d in daily]))
        self.assertEqual(rhythm["today"]["day"], WEEKDAYS[60 % 7])

    def test_a_product_peak_says_how_many_weeks_it_reads(self):
        history = {"$items": [
            {"dayNumber": d, "itemSales": {"$items": [{"itemName": "shirt", "amountSold": v}]}}
            for d, v in series(range(1, 22), switch=100)]}
        out = _product_rhythm(Save({}, {}, "test.hsg"), [{"orderHistory": history}])
        # Keyed by the item's key, never its name.
        self.assertEqual(out["shirt"]["weeks"], min(p["n"] for p in out["shirt"]["profile"]))
        self.assertEqual(out["shirt"]["peak"], "Friday")


if __name__ == "__main__":
    unittest.main()
