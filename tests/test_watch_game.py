"""GameLink against the mock: the watcher's side of docs/game-link-api.md.

The bytes are dummy ones -- the mock never parses them and neither does
GameLink; the board's parsing is the folder path's and is covered elsewhere.
"""
import os
import socket
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "tools"))

import ba_dashboard  # noqa: E402
import game_link_mock  # noqa: E402

BYTES = b"\x1f\x8b dummy save bytes"


class GameLinkAgainstMock(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.dir.name, "Recover #1.hsg")
        with open(self.path, "wb") as fh:
            fh.write(BYTES)
        self.mock = game_link_mock.Link(
            self.path, character="abc", company="Mock Co", day=34, hour=14, cash=1.5,
            build=3680, schema=1, throttle=False, refuse=None,
        )
        self.server = game_link_mock.MockServer(self.mock, port=0).start(follow=False)
        self.out = os.path.join(self.dir.name, "out")
        os.makedirs(self.out)
        self.game = ba_dashboard.GameLink(self.server.url, self.out)

    def tearDown(self):
        self.server.stop()
        self.dir.cleanup()

    def test_first_poll_downloads_the_bytes(self):
        self.assertEqual(self.game.poll(), self.game.path)
        self.assertEqual(os.path.basename(self.game.path), "game-link.hsg")
        with open(self.game.path, "rb") as fh:
            self.assertEqual(fh.read(), BYTES)
        self.assertEqual(self.game.stamp, self.mock.stamp)
        self.assertEqual(self.game.character, "abc")
        self.assertEqual(self.game.company, "Mock Co")

    def test_second_poll_is_quiet(self):
        self.game.poll()
        self.assertIsNone(self.game.poll())

    def test_poll_downloads_new_bytes_after_a_refresh(self):
        self.game.poll()
        with open(self.path, "ab") as fh:
            fh.write(b" more")
        self.mock.refresh(force=True)
        got = self.game.poll()
        self.assertEqual(got, self.game.path)
        with open(got, "rb") as fh:
            self.assertEqual(fh.read(), BYTES + b" more")
        self.assertEqual(self.game.stamp, self.mock.stamp)

    def test_a_200_that_is_no_health_object_counts_as_not_ready(self):
        """One stray 200 from whatever held the port must not stop the watcher for good."""
        real = self.game._call
        self.game._call = lambda route, method="GET", headers=None: (200, {}, b"<html>hi</html>")
        try:
            for _ in range(9):
                self.assertIsNone(self.game.poll())
            with self.assertRaises(ba_dashboard.LinkUnavailable):
                self.game.poll()
        finally:
            self.game._call = real

    def test_a_health_that_is_not_200_is_not_a_schema_mismatch(self):
        """Some other status on /health means not ready, never a version refusal.

        Ten of them in a row is another program on the port, and is said so
        as an outage the watch loop prints once, not as a version mismatch.
        """
        real = self.game._call
        self.game._call = lambda route, method="GET", headers=None: (503, {}, b'{"error":"x"}')
        try:
            for _ in range(9):
                self.assertIsNone(self.game.poll())
            with self.assertRaises(ba_dashboard.LinkUnavailable) as caught:
                self.game.poll()
            self.assertIn("not as the Big Copilot Link mod", str(caught.exception))
            with self.assertRaises(ba_dashboard.LinkUnavailable):
                self.game.poll()  # still the same outage, not a quiet None
        finally:
            self.game._call = real
        self.assertIsNotNone(self.game.poll(), "a real answer after that is read as ever")
        self.assertEqual(self.game.not_ready, 0, "and the count starts from zero")

    def test_a_busy_game_polls_to_nothing(self):
        self.mock.busy = True
        self.assertIsNone(self.game.poll())

    def test_schema_mismatch_stops_naming_the_version_needed(self):
        self.mock.schema = 2
        with self.assertRaises(SystemExit) as caught:
            self.game.poll()
        self.assertIn("version 2", str(caught.exception))
        self.assertIn("version 1", str(caught.exception))

    def test_the_board_only_builds_from_bytes_its_own_link_downloaded(self):
        """Board._refresh in link mode: a stale file, the first stamp, a rename."""
        seen = []
        real = (ba_dashboard.load_save, ba_dashboard.safe_extract, ba_dashboard.render)
        ba_dashboard.load_save = lambda path: path
        ba_dashboard.safe_extract = lambda path, names, history: (
            seen.append(path) or {"meta": {"day": 7, "save": "Mock Co"}, "supply": {"factories": {"character": "abc"}}})
        ba_dashboard.render = lambda data, live=False: "<html>"
        try:
            out = os.path.join(self.out, "board.html")
            # A game-link.hsg left behind by an earlier session, and a mod that
            # has not produced a stamp yet: nothing builds.
            with open(os.path.join(self.out, "game-link.hsg"), "wb") as fh:
                fh.write(b"stale")
            self.mock.stamp = ""  # the mock's state before its first refresh
            board = ba_dashboard.Board(None, out, link=ba_dashboard.GameLink(self.server.url, self.out))
            self.assertFalse(board.refresh(settle=False))
            self.assertEqual(seen, [])
            # The mock's first stamp: one build, from the downloaded bytes.
            self.mock.refresh(force=True)
            self.assertTrue(board.refresh(settle=False))
            self.assertEqual(len(seen), 1)
            self.assertEqual(seen[0], board.link.path)
            # Nothing new from the mod: no rebuild.
            self.assertFalse(board.refresh(settle=False))
            # A renamed line rebuilds from the same bytes without a new stamp.
            board.name_line("rid", "beer")
            self.assertEqual(len(seen), 2)
            self.assertEqual(seen[1], board.link.path)
        finally:
            ba_dashboard.load_save, ba_dashboard.safe_extract, ba_dashboard.render = real

    def test_wait_for_save_waits_for_the_refresh_it_asked_for(self):
        """A 202 names the stamp being replaced; the bytes returned are newer.

        The mock refreshes inside /refresh, which would let a wait_for_save()
        that takes the first bytes on offer pass. So the request is answered
        here as the mod answers a queued one: accepted, not yet run, with the
        old stamp still served, and the new bytes land a moment later.
        """
        import threading
        before = self.mock.stamp
        self.game.refresh = lambda: (202, {"accepted": True, "stamp": before})
        threading.Timer(1.5, lambda: self.mock.refresh(force=True)).start()
        path = self.game.wait_for_save(seconds=10)
        self.assertIsNotNone(path)
        self.assertNotEqual(self.game.stamp, before, "the old bytes were not taken")
        self.assertEqual(self.game.stamp, self.mock.stamp)

    def test_wait_for_save_falls_through_on_a_throttle(self):
        """Inside the window the mod refuses; the bytes it serves are read as they are."""
        self.assertEqual(self.game.refresh()[0], 429, "setUp's read left the mock inside its window")
        path = self.game.wait_for_save(seconds=5)
        self.assertIsNotNone(path)
        self.assertEqual(self.game.stamp, self.mock.stamp)
        self.assertFalse(self.game.stale)

    def test_wait_for_save_keeps_the_bytes_it_has_when_the_game_goes_away(self):
        """A 202 whose refresh never lands, then the listener stops: the older bytes, marked stale."""
        before = self.mock.stamp
        self.game.refresh = lambda: (202, {"accepted": True, "stamp": before})
        import threading
        # Three seconds: the first poll inside wait_for_save() must download
        # before the listener goes, even on a loaded machine.
        threading.Timer(3.0, self.server.stop).start()
        path = self.game.wait_for_save(seconds=10)
        self.assertIsNotNone(path)
        self.assertEqual(self.game.stamp, before)
        self.assertIn("went away", self.game.stale)
        # tearDown's stop() on the already stopped server returns at once.

    def test_wait_for_save_names_a_port_that_stopped_answering_as_the_mod(self):
        """Bytes in hand, then ten non-health answers: the stale reason is the port, not the game."""
        before = self.mock.stamp
        self.game.refresh = lambda: (202, {"accepted": True, "stamp": before})
        real = self.game._call
        calls = {"n": 0}

        def flaky(route, method="GET", headers=None):
            calls["n"] += 1
            if calls["n"] <= 2:  # the first /health and /save succeed
                return real(route, method, headers)
            return (503, {}, b'{"error":"x"}')

        self.game._call = flaky
        try:
            path = self.game.wait_for_save(seconds=30)
        finally:
            self.game._call = real
        self.assertIsNotNone(path)
        self.assertIn("not as the Big Copilot Link mod", self.game.stale)

    def test_a_save_name_after_the_flag_is_refused(self):
        with self.assertRaises(SystemExit) as caught:
            ba_dashboard.GameLink("Hart", self.dir.name)
        self.assertIn("takes the mod's address", str(caught.exception))

    def test_a_closed_port_raises_unavailable(self):
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            port = probe.getsockname()[1]
        game = ba_dashboard.GameLink(f"http://127.0.0.1:{port}", self.out)
        with self.assertRaises(ba_dashboard.LinkUnavailable):
            game.poll()

    def test_refresh_returns_the_status_and_body(self):
        self.mock.last_refresh = 0  # outside the mock's throttle window
        status, body = self.game.refresh()
        self.assertEqual(status, 202)
        self.assertTrue(body["accepted"])


if __name__ == "__main__":
    unittest.main()
