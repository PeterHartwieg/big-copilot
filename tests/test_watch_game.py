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
