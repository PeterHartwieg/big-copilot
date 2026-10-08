"""Rivals leaderboard arithmetic and persistent records, using synthetic saves only."""
import json
import os
import tempfile
import unittest
from unittest.mock import patch

import ba_dashboard as bd
from ba_save import Names, load_save
from tests import save_fixtures as fx
from tests.es3_fixture import encode


class RivalSave:
    def __init__(self, states=None, registrations=None):
        self.root = {"rivalStates": states or [], "BuildingRegistrations": registrations or []}
        self.path = "synthetic.hsg"

    @staticmethod
    def items(value):
        return value or []

    @staticmethod
    def deref(value):
        return value

    @staticmethod
    def address(value):
        return value["StreetName"], value["StreetNumber"]


def state(rival, values=()):
    return {"rivalId": rival, "weeklyIncomeHistory": [
        {"m_Item1": d, "m_Item2": v} for d, v in values]}


def site(number, incomes, rival="a", **extra):
    return {"StreetName": "synthetic-street", "StreetNumber": number,
            "businessOwnerRivalId": rival, "dailyIncomes": incomes, **extra}


def record(first=True, gap=100):
    return {"rank": 1 if first else 2, "tied": 0, "first": first,
            "you": 700, "top": 700 - gap, "gap": gap, "src": "live"}


class WeeklyIncomeTests(unittest.TestCase):
    def incomes(self, registrations, kinds, states=None):
        save = RivalSave(states or [state("a"), state("empty")], registrations)
        table = {("synthetic-street", n): {"t": kind} for n, kind in kinds.items()}
        with patch.object(bd, "load_buildings", return_value=table) as load:
            result = bd._rival_weekly_incomes(save)
        load.assert_called_once_with(save)
        return result

    def test_last_seven_entries_and_only_rival_owned_trading_buildings(self):
        regs = [site(1, list(range(1, 21))), site(2, [9999]), site(3, [10, 20]),
                site(4, [40]), site(5, [9999], RentedByPlayer=True),
                site(6, [9999], rival="unlisted"), site(7, [9999], rival=None)]
        self.assertEqual(self.incomes(regs, {1: "retail", 2: "warehouse", 3: "cinema",
                         4: "theater", 5: "office", 6: "retail", 7: "retail"}),
                         {"a": sum(range(14, 21)) + 70.0, "empty": 0.0})

    def test_null_retail_and_office_each_zero_the_whole_rival(self):
        for kind in ("retail", "office"):
            with self.subTest(kind=kind):
                self.assertEqual(self.incomes([site(1, [200]), site(2, None)],
                                 {1: "retail", 2: kind})["a"], 0)

    def test_null_cinema_and_theater_do_not_zero_other_income(self):
        for kind in ("cinema", "theater"):
            with self.subTest(kind=kind):
                self.assertEqual(self.incomes([site(1, [200]), site(2, None)],
                                 {1: "retail", 2: kind})["a"], 200)

    def test_empty_shop_list_is_not_null(self):
        self.assertEqual(self.incomes([site(1, [200]), site(2, [])],
                         {1: "retail", 2: "office"})["a"], 200)

    def test_missing_table_rows_fall_back_to_business_type(self):
        office, retail = sorted(bd.OFFICE_TYPES)[0], sorted(bd.RETAIL_TYPES)[0]
        regs = [site(1, [20], businessTypeName=office),
                site(2, [30], businessTypeName=retail),
                site(3, [9999], businessTypeName="unknown")]
        self.assertEqual(self.incomes(regs, {})["a"], 50)
        self.assertEqual(bd._rival_building_type(regs[0], {}), "office")
        self.assertEqual(bd._rival_building_type(regs[1], {}), "retail")
        self.assertIsNone(bd._rival_building_type(regs[2], {}))

    def test_table_type_takes_precedence_over_business_type(self):
        reg = site(1, [9999], businessTypeName=sorted(bd.RETAIL_TYPES)[0])
        self.assertEqual(self.incomes([reg], {1: "warehouse"})["a"], 0)

    def test_player_uses_previous_seven_calendar_days_missing_is_zero(self):
        profits = {d: d * 10 for d in range(1, 11) if d != 6}
        self.assertEqual(bd._player_weekly_income(profits, 10), 360)
        self.assertEqual(bd._player_weekly_income({}, 10), 0)


class StandingTests(unittest.TestCase):
    def test_ordering_gap_and_best_rival_number_breaks_equal_income(self):
        numbers = {"z": 1, "a": 2, "b": 3, "c": 4}
        got = bd._rival_standing(100, {"a": 200, "z": 200, "b": 120, "c": 50}, numbers)
        self.assertEqual(got, {"rank": 4, "tied": 0, "first": False,
                              "you": 100, "top": 200, "gap": -100, "best": "z"})
        lead = bd._rival_standing(250, {"a": 200}, numbers)
        self.assertEqual((lead["rank"], lead["first"], lead["gap"]), (1, True, 50))

    def test_top_ties_on_both_sides_are_not_first(self):
        for income in (99.5, 100, 100.5):
            with self.subTest(income=income):
                got = bd._rival_standing(100, {"a": income}, {"a": 1})
                self.assertEqual((got["rank"], got["tied"], got["first"]), (1, 1, False))

    def test_one_dollar_boundary_and_one_fifty_above(self):
        for income in (101, 101.5):
            with self.subTest(income=income):
                got = bd._rival_standing(100, {"a": income}, {"a": 1})
                self.assertEqual((got["rank"], got["tied"], got["first"]), (2, 0, False))
        got = bd._rival_standing(100, {"a": 99}, {"a": 1})
        self.assertEqual((got["rank"], got["tied"], got["first"]), (1, 0, True))

    def test_defeated_zero_income_rivals_still_beat_negative_player(self):
        got = bd._rival_standing(-10, {"defeated": 0, "other": 0}, {"defeated": 1, "other": 2})
        self.assertEqual((got["rank"], got["gap"], got["first"]), (3, -10, False))


class TrustedHistoryTests(unittest.TestCase):
    def trusted(self, values):
        return bd._trusted_rival_history(RivalSave(), state("a", values))

    def test_ascending_is_all_trusted(self):
        self.assertEqual(self.trusted([(d, d * 10) for d in range(3, 10)]),
                         ({d: d * 10.0 for d in range(3, 10)}, False))

    def test_fill_then_daily_append_trusts_first_and_appended_only(self):
        self.assertEqual(self.trusted([(d, d * 10) for d in range(9, 2, -1)] + [(10, 100)]),
                         ({9: 90.0, 10: 100.0}, True))

    def test_fill_pruned_by_day_keeps_its_first_entry(self):
        # Filled on day 7, then RunDaily on day 8 removed day 1 (older than
        # six days back), not the list's first entry.
        self.assertEqual(self.trusted([(d, d * 10) for d in range(7, 1, -1)] + [(8, 80)]),
                         ({7: 70.0, 8: 80.0}, True))

    def test_descending_trusts_only_first(self):
        self.assertEqual(self.trusted([(9, 90), (8, 80), (7, 70)]), ({9: 90.0}, True))

    def test_invalid_days_and_values_ignored(self):
        self.assertEqual(self.trusted([("2", 10), (2.5, 10), (None, 10),
                                      (3, "10"), (4, None), (5, 50), (6, 60.5)]),
                         ({5: 50.0, 6: 60.5}, False))
        self.assertEqual(self.trusted([]), ({}, False))


class BackfillTests(unittest.TestCase):
    def test_clean_week_backfills_six_days_from_player_statements(self):
        save = RivalSave([state("a", [(d, 25) for d in range(3, 10)]),
                          state("b", [(d, 45) for d in range(3, 10)])])
        profits = {d: d * 2 for d in range(1, 10)}
        got = bd._rivalry_backfill(save, profits, 9, {"a": 1, "b": 2})
        self.assertEqual(list(got), list(range(3, 9)))
        for d, rank in zip(range(3, 9), (3, 3, 3, 2, 2, 1)):
            with self.subTest(day=d):
                you = sum(profits.get(p, 0) for p in range(d - 7, d))
                self.assertEqual((got[d]["you"], got[d]["rank"], got[d]["gap"]),
                                 (you, rank, you - 45))

    def test_filled_rival_drops_untrusted_days(self):
        save = RivalSave([state("a", [(d, 25) for d in range(3, 10)]),
                          state("b", [(d, 45) for d in range(8, 1, -1)] + [(9, 45)])])
        self.assertEqual(list(bd._rivalry_backfill(save, {}, 9, {"a": 1, "b": 2})), [8])

    def test_clean_late_arrival_is_absent_on_earlier_days(self):
        save = RivalSave([state("a", [(d, 0) for d in range(3, 10)]),
                          state("b", [(7, 1000), (8, 1000), (9, 1000)])])
        got = bd._rivalry_backfill(save, {d: 10 for d in range(1, 9)}, 9, {"a": 1, "b": 2})
        self.assertEqual(list(got), list(range(3, 9)))
        self.assertEqual([got[d]["rank"] for d in range(3, 9)], [1, 1, 1, 1, 2, 2])

    def test_missing_rival_history_or_internal_hole_is_unknown(self):
        for values in ([], [(2, 0), (4, 0)]):
            with self.subTest(values=values):
                got = bd._rivalry_backfill(RivalSave([state("a", values)]), {}, 4, {"a": 1})
                self.assertNotIn(3, got)

    def test_rival_with_no_history_yet_is_absent_beside_rivals_with_one(self):
        # A rival added today has no RunDaily entry yet: it was not in the city.
        save = RivalSave([state("a", [(d, 25) for d in range(3, 10)]), state("new")])
        got = bd._rivalry_backfill(save, {}, 9, {"a": 1, "new": 2})
        self.assertEqual(list(got), list(range(3, 9)))
        self.assertEqual({got[d]["rank"] for d in got}, {2})

    def test_day_one_never_backfilled(self):
        got = bd._rivalry_backfill(RivalSave([state("a", [(1, 0), (2, 0), (3, 0)])]), {}, 3, {"a": 1})
        self.assertEqual(list(got), [2])


class HistoryTests(unittest.TestCase):
    def test_live_overwrites_backfill_preserves_and_future_days_stay_stored(self):
        history = bd.History(None)
        history.rivalry("c", 10, record(), {8: record(False), 9: record()})
        got = history.rivalry("c", 9, record(False, -20), {8: record(), 7: record()})
        self.assertEqual([r["day"] for r in got], [7, 8, 9])
        self.assertFalse(got[1]["first"])
        self.assertEqual(got[2]["gap"], -20)
        self.assertTrue(history.book["c"]["rivalry"]["10"]["first"])

    def test_non_dict_store_replaced(self):
        for value in (None, [], "broken", 3):
            with self.subTest(value=value):
                history = bd.History(None)
                history.book["c"] = {"rivalry": value}
                self.assertEqual(history.rivalry("c", 2, record(), {}), [dict(record(), day=2)])

    def test_write_reload_preserves_book(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "history.json")
            history = bd.History(path)
            history.rivalry("c", 9, record(), {8: record(False)})
            self.assertTrue(history.write())
            loaded = bd.History(path)
            self.assertEqual(loaded.book, history.book)
            got = loaded.rivalry("c", 10, record(), {8: record()})
            self.assertEqual([r["day"] for r in got], [8, 9, 10])
            self.assertFalse(got[0]["first"])


class RivalryTests(unittest.TestCase):
    def run_rivalry(self, history, day=20, income=0, states=None, profit=100):
        save = RivalSave(states or [state("a")], [site(1, [income])])
        summaries = [{"dayNumber": d, "totalProfit": profit} for d in range(1, day + 1)]
        with patch.object(bd, "load_buildings", return_value={("synthetic-street", 1): {"t": "retail"}}):
            return bd._rivalry(save, summaries, history, "c", day)

    def test_exact_streak_stops_at_non_first_record(self):
        history = bd.History(None)
        history.rivalry("c", 19, record(), {17: record(False), 18: record()})
        got = self.run_rivalry(history)
        self.assertEqual((got["streak"], got["streakAtLeast"]), (3, False))

    def test_missing_record_means_at_least_and_strip_marks_unknown(self):
        got = self.run_rivalry(bd.History(None))
        self.assertEqual((got["streak"], got["streakAtLeast"]), (1, True))
        self.assertEqual(len(got["days"]), bd.RIVALRY_STRIP)
        self.assertEqual([r["day"] for r in got["days"]], list(range(6, 21)))
        self.assertTrue(all(set(r) == {"day"} for r in got["days"][:-1]))
        self.assertEqual(set(got["days"][-1]), {"day", "rank", "tied", "first", "gap"})
        json.dumps(got, allow_nan=False)

    def test_not_first_today_and_top_tie_each_zero_streak(self):
        for income, rank, tied in ((1000, 2, 0), (700, 1, 1)):
            with self.subTest(income=income):
                history = bd.History(None)
                history.rivalry("c", 19, record(), {})
                got = self.run_rivalry(history, income=income)
                self.assertEqual((got["rank"], got["tied"], got["first"], got["streak"],
                                  got["streakAtLeast"]), (rank, tied, False, 0, False))

    def test_older_save_uses_no_future_records(self):
        history = bd.History(None)
        self.run_rivalry(history, 22)
        got = self.run_rivalry(history, 20)
        self.assertEqual((got["streak"], got["streakAtLeast"]), (1, True))
        self.assertEqual(got["days"][-1]["day"], 20)
        self.assertIn("22", history.book["c"]["rivalry"])

    def test_streak_reaching_day_two_is_exact(self):
        got = self.run_rivalry(bd.History(None), 3, states=[state("a", [(2, 0), (3, 0)])])
        self.assertEqual((got["streak"], got["streakAtLeast"]), (2, False))
        self.assertEqual(got["days"][0], {"day": 1})

    def test_no_rivals_returns_none_and_writes_no_rivalry(self):
        history = bd.History(None)
        with patch.object(bd, "load_buildings", return_value={}):
            self.assertIsNone(bd._rivalry(RivalSave(), [], history, "c", 20))
        self.assertEqual(history.book, {})

    def test_build_core_a_week_later_continues_persisted_first_place(self):
        with tempfile.TemporaryDirectory() as tmp:
            save_path, history_path = os.path.join(tmp, "synthetic.hsg"), os.path.join(tmp, "history.json")
            runs = []
            for day in (fx.DAY, fx.DAY + 7):
                tree = fx.data_company(day)
                # Give each save only its remembered week. The second needs
                # the first build's live day to connect the consecutive run.
                tree["rivalStates"][0]["weeklyIncomeHistory"] = [
                    {"m_Item1": d, "m_Item2": -100000} for d in range(day - 6, day + 1)]
                rival = next(r for r in tree["BuildingRegistrations"] if r.get("businessOwnerRivalId"))
                rival["dailyIncomes"] = [-100000]
                with open(save_path, "wb") as fh:
                    fh.write(encode(tree))
                runs.append(bd.build_core(load_save(save_path), Names(fx.data_names()), history_path).core)
            self.assertIn("rivalry", runs[0])
            self.assertEqual((runs[0]["rivalry"]["streak"], runs[1]["rivalry"]["streak"]), (7, 14))
            self.assertTrue(runs[1]["rivalry"]["streakAtLeast"])
            loaded = bd.History(history_path)
            self.assertEqual(loaded.book[fx.CHARACTER]["rivalry"][str(fx.DAY)]["src"], "live")


if __name__ == "__main__":
    unittest.main()
