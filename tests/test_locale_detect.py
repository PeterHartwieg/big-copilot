import json
import os
import tempfile
import unittest
from contextlib import contextmanager
from unittest import mock

import ba_save


@contextmanager
def patched(candidates, bundled=(), env=None):
    """Detection sees only these candidates, bundles and environment.

    The environment is replaced rather than overlaid, so a developer who has
    BA_LOCALE set for their own install cannot change what these tests detect.
    """
    with mock.patch.object(ba_save, "_LOCALE_CANDIDATES", tuple(candidates)), \
            mock.patch.object(ba_save, "_BUNDLED_LOCALES", tuple(bundled)), \
            mock.patch.dict(os.environ, env or {}, clear=True):
        yield


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
        with patched((game,), (bundle,)):
            self.assertEqual(ba_save.find_locale(), game)
            self.assertEqual(ba_save.load_locale()["ba:itemname_gymcovercharge"], "Game text")

    def test_first_existing_candidate_wins(self):
        first = self.write("first.json", json.dumps({"ba:itemname_gymcovercharge": "First"}))
        second = self.write("second.json", json.dumps({"ba:itemname_gymcovercharge": "Second"}))
        with patched((first, second)):
            self.assertEqual(ba_save.find_locale(), first)
            self.assertEqual(ba_save.load_locale()["ba:itemname_gymcovercharge"], "First")

    def test_candidates_are_expanded(self):
        self.write("en.json", json.dumps({"ba:itemname_gymcovercharge": "Home"}))
        home = self.tmp.name
        with patched(("~/en.json",), env={"HOME": home, "USERPROFILE": home}):
            found = ba_save.find_locale()
            self.assertIsNotNone(found)
            self.assertTrue(os.path.isfile(found))

    def test_ba_locale_override_wins(self):
        override = self.write(
            "override.json", json.dumps({"ba:itemname_gymcovercharge": "Override"})
        )
        with patched((), env={"BA_LOCALE": override}):
            self.assertEqual(ba_save.find_game_locale(), override)
            self.assertEqual(ba_save.find_locale(), override)

    def test_find_game_locale_ignores_the_bundle(self):
        bundle = self.write("gametext.json", json.dumps({"ba:itemname_gymcovercharge": "Bundled"}))
        missing = os.path.join(self.tmp.name, "not-installed", "en.json")
        with patched((missing,), (bundle,)):
            self.assertIsNone(ba_save.find_game_locale())
            self.assertEqual(ba_save.find_locale(), bundle)

    def test_falls_back_to_the_bundled_text(self):
        bundle = self.write(
            "gametext.json",
            json.dumps({"ba:itemname_hourlylawyerfee": "Lawyer Fee (Hourly)"}),
        )
        missing = os.path.join(self.tmp.name, "not-installed", "en.json")
        with patched((missing,), (bundle,)):
            self.assertEqual(ba_save.find_locale(), bundle)
            self.assertEqual(
                ba_save.load_locale()["ba:itemname_hourlylawyerfee"], "Lawyer Fee (Hourly)"
            )

    def test_no_text_anywhere_yields_an_empty_table(self):
        missing = os.path.join(self.tmp.name, "not-installed", "en.json")
        with patched((missing,), (missing,)):
            self.assertIsNone(ba_save.find_locale())
            self.assertEqual(ba_save.load_locale(), {})

    def test_explicit_path_still_wins(self):
        explicit = self.write("en.json", json.dumps({"ba:itemname_gymcovercharge": "Explicit"}))
        with patched(()):
            self.assertEqual(
                ba_save.load_locale(explicit)["ba:itemname_gymcovercharge"], "Explicit"
            )

    def test_a_malformed_file_is_ignored(self):
        broken = self.write("en.json", "{not json")
        self.assertEqual(ba_save.load_locale(broken), {})

    def test_a_missing_ba_locale_falls_through_to_a_candidate(self):
        # A stale override must not hide an install that is really there.
        game = self.write("en.json", json.dumps({"ba:itemname_gymcovercharge": "Game text"}))
        gone = os.path.join(self.tmp.name, "moved-away", "en.json")
        with patched((game,), env={"BA_LOCALE": gone}):
            self.assertEqual(ba_save.find_game_locale(), game)

    def test_the_bundle_that_ships_is_really_there(self):
        # Every other test replaces _BUNDLED_LOCALES, so nothing else would
        # notice gametext.json moving and taking the fallback with it.
        found = [p for p in ba_save._BUNDLED_LOCALES if os.path.isfile(p)]
        self.assertTrue(found, ba_save._BUNDLED_LOCALES)
        with open(found[0], encoding="utf-8") as fh:
            self.assertIn("ba:itemname_hourlylawyerfee", json.load(fh))

    def test_the_bundle_is_recognised_as_the_bundle(self):
        for path in ba_save._BUNDLED_LOCALES:
            self.assertTrue(ba_save.bundled_locale(path), path)
        self.assertFalse(ba_save.bundled_locale(ba_save.DEFAULT_LOCALE))
        self.assertFalse(ba_save.bundled_locale(None))

    def test_search_paths_report_what_would_be_tried(self):
        # What the build prints when it cannot find the game, so the override
        # is reported first and no unexpanded ~ reaches the message.
        home = self.tmp.name
        env = {"BA_LOCALE": "/override/en.json", "HOME": home, "USERPROFILE": home}
        with patched(("~/en.json",), env=env):
            paths = ba_save.locale_search_paths()
        self.assertEqual(paths[0], "/override/en.json")
        self.assertTrue(paths[1].startswith(home), paths[1])
        self.assertNotIn("~", paths[1])

    def test_the_candidate_list_is_well_formed(self):
        # Adjacent string literals merge silently if a comma is dropped, so the
        # count is pinned: update it when a location is added on purpose.
        self.assertEqual(len(ba_save._LOCALE_CANDIDATES), 8)
        for path in ba_save._LOCALE_CANDIDATES:
            self.assertTrue(path.endswith("en.json"), path)


if __name__ == "__main__":
    unittest.main()
