"""The history file on both doors: what survives a bad read, a cut write and an older save.

#109: EX-3 (a history that cannot be read is never overwritten, and a write
is never half done), EX-2 (a save older than the newest on record reads its
own days, not a later save's) and WB-2 (the browser's copy stays small enough
for localStorage).
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))

import ba_dashboard  # noqa: E402
from ba_dashboard import History  # noqa: E402


def snapshot(n: int) -> dict:
    return {"beer|Midtown": n}


class Tmp(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = os.path.join(self.tmp.name, "market_history.json")

    def put(self, text: str) -> None:
        with open(self.path, "w", encoding="utf-8") as fh:
            fh.write(text)

    def read(self, path: str | None = None) -> str:
        with open(path or self.path, encoding="utf-8") as fh:
            return fh.read()

    def seeded(self) -> str:
        """A history with two characters on record; its text."""
        history = History(self.path)
        for day in range(1, 61):
            history.demand("alice", day, snapshot(day))
            history.ledger("alice", day, {"cash": day * 1000, "profit": 10})
        history.demand("bob", 5, snapshot(5))
        history.named("alice", {"rid": "beer"})
        history.write()
        return self.read()


class UnreadableHistory(Tmp):
    def test_an_unparseable_file_is_kept_aside_and_not_overwritten(self):
        self.put('{"characters": {"alice": {"days": {"1": ')  # cut off mid-write
        history = History(self.path)
        self.assertEqual(history.book, {})
        history.demand("alice", 2, snapshot(2))
        history.ledger("alice", 2, {"cash": 1, "profit": 0})
        history.write()
        # This run wrote nothing: the damaged text is kept, as .bad, for a look.
        self.assertFalse(os.path.exists(self.path))
        self.assertEqual(self.read(self.path + ".bad"), '{"characters": {"alice": {"days": {"1": ')
        # The next run starts a fresh record and writes it.
        fresh = History(self.path)
        fresh.demand("alice", 3, snapshot(3))
        fresh.write()
        self.assertEqual(json.loads(self.read())["characters"]["alice"]["days"], {"3": snapshot(3)})

    def test_json_that_is_no_history_counts_as_unparseable(self):
        for text in ("[1, 2]", '{"characters": [1]}', "null"):
            with self.subTest(text=text):
                self.put(text)
                history = History(self.path)
                history.write()
                self.assertFalse(os.path.exists(self.path))
                self.assertEqual(self.read(self.path + ".bad"), text)

    def test_a_file_that_cannot_be_opened_is_left_alone(self):
        before = self.seeded()
        real = open

        def locked(path, *args, **kwargs):
            if os.path.abspath(str(path)) == os.path.abspath(self.path):
                raise PermissionError("another program holds it")
            return real(path, *args, **kwargs)

        with mock.patch("builtins.open", locked):
            history = History(self.path)
            history.demand("alice", 61, snapshot(61))
            history.write()
        self.assertEqual(self.read(), before, "a moment's lock never costs the record")
        self.assertFalse(os.path.exists(self.path + ".bad"))

    def test_a_write_cut_off_part_way_leaves_the_old_file_whole(self):
        before = self.seeded()
        history = History(self.path)
        history.demand("alice", 61, snapshot(61))

        def cut(obj, fh, **kwargs):
            fh.write('{"characters": {"ali')
            raise OSError("disk full")

        with mock.patch.object(ba_dashboard.json, "dump", cut):
            history.write()
        self.assertEqual(self.read(), before)
        self.assertEqual(sorted(os.listdir(self.tmp.name)), ["market_history.json"], "no temp file left behind")
        # And a whole write still lands.
        history.write()
        self.assertIn("61", json.loads(self.read())["characters"]["alice"]["days"])


class OlderSave(Tmp):
    def test_the_ledger_hands_back_the_run_up_to_today(self):
        history = History(None)
        for day in (40, 47):
            history.ledger("c", day, {"cash": day * 1000, "profit": 0})
        run = history.ledger("c", 44, {"cash": 44000, "profit": 0})
        self.assertEqual([e["day"] for e in run], [40, 44])
        # The later day is kept for when that save is opened again.
        self.assertEqual([e["day"] for e in history.ledger("c", 47, {"cash": 47000, "profit": 0})], [40, 44, 47])

    def test_cash_flow_on_an_older_save_ends_on_its_own_day(self):
        history = History(None)
        for day in (40, 47):
            history.ledger("c", day, {"cash": day * 1000, "profit": 0})
        run = history.ledger("c", 44, {"cash": 5, "profit": 0})
        flow = ba_dashboard._cash_flow(run, [], 44)
        self.assertEqual((flow["fromDay"], flow["days"], flow["cashFrom"], flow["cashTo"]), (40, 4, 40000, 5))

    def test_net_worth_carried_forward_is_never_from_a_later_save(self):
        history = History(None)
        history.ledger("c", 40, {"cash": 0, "profit": 0, "netWorth": 400})
        history.ledger("c", 47, {"cash": 0, "profit": 0, "netWorth": 470})
        self.assertEqual(ba_dashboard._net_worth({}, history, "c", 44), {"value": 400, "asOf": 40})
        self.assertEqual(ba_dashboard._net_worth({}, history, "c", 47), {"value": 470, "asOf": 47})


class BrowserBound(Tmp):
    def test_the_browser_keeps_two_weeks_of_demand_for_the_recent_characters(self):
        history = History(self.path)
        for n in range(10):
            history.demand(f"old{n}", 1, snapshot(1))
        for day in range(1, 61):
            history.demand("now", day, snapshot(day))
            history.ledger("now", day, {"cash": day, "profit": 0})
        history.named("old0", {"rid": "beer"})
        history.write()
        size = len(self.read())

        save = mock.Mock(root={"characterId": "old3"})
        with mock.patch.object(ba_dashboard, "load_save", return_value=save), \
                mock.patch.object(ba_dashboard, "safe_extract", return_value={}):
            ba_dashboard.browser_build("x.hsg", "", self.path, None)
        book = json.loads(self.read())["characters"]
        # The character just built is the most recent; the eight kept are the
        # last seven before it and it.
        self.assertEqual(list(book), ["old4", "old5", "old6", "old7", "old8", "old9", "now", "old3"])
        self.assertEqual(sorted(book["now"]["days"], key=int), [str(d) for d in range(47, 61)])
        self.assertEqual(len(book["now"]["ledger"]), 60, "the cash record keeps its sixty days")
        self.assertLess(len(self.read()), size)
        with open(self.path + ".character", encoding="utf-8") as fh:
            self.assertEqual(fh.read(), "old3")

    def test_a_damaged_browser_history_is_set_aside_and_nothing_written(self):
        self.put('{"characters": {"x"')
        save = mock.Mock(root={"characterId": "c"})
        # extract() loads the history first, as the real one does.
        with mock.patch.object(ba_dashboard, "load_save", return_value=save), \
                mock.patch.object(ba_dashboard, "safe_extract",
                                  side_effect=lambda s, n, h: (History(h).write(), {})[1]):
            ba_dashboard.browser_build("x.hsg", "", self.path, None)
        self.assertFalse(os.path.exists(self.path))
        self.assertEqual(self.read(self.path + ".bad"), '{"characters": {"x"')

    def test_the_cli_keeps_its_sixty_days(self):
        history = History(self.path)
        for day in range(1, 71):
            history.demand("c", day, snapshot(day))
        history.write()
        self.assertEqual(len(json.loads(self.read())["characters"]["c"]["days"]), ba_dashboard.HISTORY_DAYS)


if __name__ == "__main__":
    unittest.main()
