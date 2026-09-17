import json
import os
import tempfile
import unittest
from unittest import mock

import ba_save


class FindLocaleTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def write(self, name, text):
        path = os.path.join(self.tmp.name, name)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(text)
        return path

    def test_prefers_the_game_file_over_the_bundle(self):
        game = self.write("en.json", json.dumps({"ba:itemname_gymcovercharge": "Game text"}))
        bundle = self.write("gametext.json", json.dumps({"ba:itemname_gymcovercharge": "Bundled"}))
        with mock.patch.object(ba_save, "_LOCALE_CANDIDATES", (game,)), \
                mock.patch.object(ba_save, "_BUNDLED_LOCALES", (bundle,)):
            self.assertEqual(ba_save.find_locale(), game)
            self.assertEqual(ba_save.load_locale()["ba:itemname_gymcovercharge"], "Game text")

    def test_falls_back_to_the_bundled_text(self):
        bundle = self.write(
            "gametext.json",
            json.dumps({"ba:itemname_hourlylawyerfee": "Lawyer Fee (Hourly)"}),
        )
        missing = os.path.join(self.tmp.name, "not-installed", "en.json")
        with mock.patch.object(ba_save, "_LOCALE_CANDIDATES", (missing,)), \
                mock.patch.object(ba_save, "_BUNDLED_LOCALES", (bundle,)):
            self.assertEqual(ba_save.find_locale(), bundle)
            self.assertEqual(
                ba_save.load_locale()["ba:itemname_hourlylawyerfee"], "Lawyer Fee (Hourly)"
            )

    def test_no_text_anywhere_yields_an_empty_table(self):
        missing = os.path.join(self.tmp.name, "not-installed", "en.json")
        with mock.patch.object(ba_save, "_LOCALE_CANDIDATES", (missing,)), \
                mock.patch.object(ba_save, "_BUNDLED_LOCALES", (missing,)):
            self.assertIsNone(ba_save.find_locale())
            self.assertEqual(ba_save.load_locale(), {})

    def test_explicit_path_still_wins(self):
        explicit = self.write("en.json", json.dumps({"ba:itemname_gymcovercharge": "Explicit"}))
        with mock.patch.object(ba_save, "_LOCALE_CANDIDATES", ()), \
                mock.patch.object(
                    ba_save, "_BUNDLED_LOCALES", (os.path.join(self.tmp.name, "none"),)
                ):
            self.assertEqual(
                ba_save.load_locale(explicit)["ba:itemname_gymcovercharge"], "Explicit"
            )

    def test_a_malformed_file_is_ignored(self):
        broken = self.write("en.json", "{not json")
        self.assertEqual(ba_save.load_locale(broken), {})


if __name__ == "__main__":
    unittest.main()
