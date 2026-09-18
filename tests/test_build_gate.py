"""The gate build_web.main() puts in front of everything it writes.

The build needs the game's own en.json: the wiki reads helpstructure.json
beside it, and rebuilding gametext.json from the bundle would report success
while changing nothing. Each refusal here used to be a traceback, a silent
no-op, or a missing file reported two steps later, so each one is pinned.

    python -m unittest tests.test_build_gate
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import ba_save
import build_web


class BuildGateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def write(self, *parts, text="{}"):
        path = os.path.join(self.tmp.name, *parts)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(text)
        return path

    def run_main(self, env):
        """main() with detection under our control; returns the refusal."""
        with mock.patch.dict(os.environ, env, clear=True), \
                mock.patch.object(ba_save, "_LOCALE_CANDIDATES", ()):
            with self.assertRaises(SystemExit) as caught:
                build_web.main()
        return str(caught.exception)

    def test_no_game_text_says_where_it_looked(self):
        message = self.run_main({})
        self.assertIn("no game text found", message)
        self.assertIn("BA_LOCALE", message)
        self.assertIn("Looked in:", message)

    def test_the_bundle_is_refused_outright(self):
        bundle = next(p for p in ba_save._BUNDLED_LOCALES if os.path.isfile(p))
        message = self.run_main({"BA_LOCALE": bundle})
        self.assertIn("is the text this build ships", message)

    def test_a_locale_outside_an_install_is_refused(self):
        loose = self.write("Desktop", "en.json")
        message = self.run_main({"BA_LOCALE": loose})
        self.assertIn("not inside a game install", message)

    def test_an_empty_locale_inside_an_install_is_refused(self):
        empty = self.write(
            "Big Ambitions_Data", "StreamingAssets", "locale", "en.json", text="{}"
        )
        message = self.run_main({"BA_LOCALE": empty})
        self.assertIn("no game text at", message)

    def test_the_gate_runs_before_anything_is_written(self):
        # write_public_wiki used to go first, so a bad path surfaced as a
        # missing helpstructure.json instead of the message above.
        loose = self.write("Desktop", "en.json")
        with mock.patch.object(build_web, "write_public_wiki") as wiki:
            self.run_main({"BA_LOCALE": loose})
        wiki.assert_not_called()


if __name__ == "__main__":
    unittest.main()
