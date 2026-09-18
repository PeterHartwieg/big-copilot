import json
import os
import sys
import tempfile
import unittest
from contextlib import contextmanager
from unittest import mock

import ba_save

SAVE_SHAPE = {
    "meta": {"save": "Co", "day": 1, "build": 3680},
    "kpi": {"cash": 0, "netWorth": 0, "profitYesterday": 0, "profitAvg7": 0,
            "businesses": 0, "employees": 0},
    "alerts": [],
    "minor": {"count": 0, "gate": 0},
}


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
        root = os.path.dirname(os.path.dirname(os.path.abspath(ba_save.__file__)))
        found = [p for p in ba_save._BUNDLED_LOCALES
                 if os.path.isfile(p) and os.path.abspath(p).startswith(root)]
        self.assertTrue(found, ba_save._BUNDLED_LOCALES)
        with open(found[0], encoding="utf-8") as fh:
            self.assertIn("ba:itemname_hourlylawyerfee", json.load(fh))

    def test_the_bundle_is_recognised_however_it_is_spelled(self):
        # Comparing the strings as given would pass trivially, so each spelling
        # here reaches the same file by a different route. Case is deliberately
        # not one of them: it only differs on a case-insensitive filesystem,
        # and four of the candidate paths are Linux ones.
        real = next(p for p in ba_save._BUNDLED_LOCALES if os.path.isfile(p))
        self.assertTrue(ba_save.bundled_locale(real))
        self.assertTrue(ba_save.bundled_locale(
            os.path.join(os.path.dirname(real), os.pardir, os.path.basename(os.path.dirname(real)),
                         os.path.basename(real))))
        cwd = os.getcwd()
        try:
            os.chdir(os.path.dirname(real))
            self.assertTrue(ba_save.bundled_locale(os.path.basename(real)))
        finally:
            os.chdir(cwd)
        self.assertFalse(ba_save.bundled_locale(ba_save.DEFAULT_LOCALE))
        self.assertFalse(ba_save.bundled_locale(None))

    def test_a_link_to_the_bundle_is_still_the_bundle(self):
        # The guard that makes this work is realpath; every other spelling in
        # the test above survives plain abspath, so without this case reverting
        # realpath would break nothing. BA_LOCALE pointed at such a link would
        # let build_web rebuild gametext.json from itself.
        real = next(p for p in ba_save._BUNDLED_LOCALES if os.path.isfile(p))
        link = os.path.join(self.tmp.name, "en.json")
        try:
            os.symlink(real, link)
        except (OSError, NotImplementedError, AttributeError) as exc:
            self.skipTest(f"symlinks unavailable here: {exc}")
        self.assertTrue(ba_save.bundled_locale(link))

    def test_a_short_name_for_the_bundle_is_still_the_bundle(self):
        # The Windows half of the same guard, since symlinks there need a
        # privilege this suite cannot assume. An 8.3 name reaches the file and
        # isfile accepts it, but only realpath spells it back out.
        if sys.platform != "win32":
            self.skipTest("8.3 short names are a Windows filesystem feature")
        import ctypes
        real = next(p for p in ba_save._BUNDLED_LOCALES if os.path.isfile(p))
        buf = ctypes.create_unicode_buffer(1024)
        if not ctypes.windll.kernel32.GetShortPathNameW(real, buf, 1024):
            self.skipTest("no short name for the bundle on this volume")
        short = buf.value
        if os.path.normcase(short) == os.path.normcase(real):
            self.skipTest("8.3 names are disabled on this volume")
        self.assertTrue(os.path.isfile(short))
        self.assertTrue(ba_save.bundled_locale(short))

    def test_a_broken_file_falls_through_to_text_that_loads(self):
        # A path that exists is not text that loaded: a truncated en.json used
        # to win the search and take every label down with it.
        broken = self.write("en.json", "{not json")
        empty = self.write("empty.json", "{}")
        good = self.write("good.json", json.dumps({"ba:itemname_gymcovercharge": "Gym Cover Charge"}))
        with patched((broken, empty, good)):
            source, table = ba_save.load_best_locale()
            self.assertEqual(source, good)
            self.assertEqual(table["ba:itemname_gymcovercharge"], "Gym Cover Charge")
            self.assertEqual(ba_save.load_locale()["ba:itemname_gymcovercharge"], "Gym Cover Charge")

    def test_a_broken_file_falls_through_to_the_bundle(self):
        broken = self.write("en.json", "{not json")
        bundle = self.write("gametext.json", json.dumps({"ba:itemname_gymcovercharge": "Bundled"}))
        with patched((broken,), (bundle,)):
            self.assertEqual(ba_save.load_best_locale(), (bundle, {"ba:itemname_gymcovercharge": "Bundled"}))

    def test_nothing_that_loads_reports_no_source(self):
        broken = self.write("en.json", "{not json")
        with patched((broken,), (broken,)):
            self.assertEqual(ba_save.load_best_locale(), (None, {}))

    def test_search_paths_report_what_would_be_tried(self):
        # What the build prints when it cannot find the game, so the override
        # is reported first and no unexpanded ~ reaches the message.
        home = self.tmp.name
        env = {"BA_LOCALE": "/override/en.json", "HOME": home, "USERPROFILE": home}
        with patched(("~/en.json",), env=env):
            paths = ba_save.locale_search_paths()
        self.assertEqual(paths[0], "/override/en.json")
        # Compared against expanduser under the same environment: asserting on
        # the spelling would fail where TMP resolves to an 8.3 short name.
        with mock.patch.dict(os.environ, env, clear=True):
            self.assertEqual(paths[1], os.path.expanduser("~/en.json"))
        self.assertNotEqual(paths[1], "~/en.json")

    def test_the_note_reports_the_table_not_the_path(self):
        # The point of the note: a file that is there but holds nothing must
        # not read as a healthy run. Asserting on find_locale alone would pass
        # with the isfile version this replaced.
        import ba_dashboard
        truncated = self.write("en.json", "{not json")
        with patched((truncated,)):
            source, table = ba_save.load_best_locale()
            self.assertEqual(ba_dashboard.locale_note(source, table),
                             "game text: none found, so names fall back to raw slugs")

        bundle = self.write("gametext.json", json.dumps({"ba:itemname_gymcovercharge": "Bundled"}))
        with patched((truncated,), (bundle,)):
            note = ba_dashboard.locale_note(*ba_save.load_best_locale())
        self.assertIn("bundled with the board", note)

        game = self.write("good.json", json.dumps({"ba:itemname_gymcovercharge": "Gym Cover Charge"}))
        with patched((game,), (bundle,)):
            note = ba_dashboard.locale_note(*ba_save.load_best_locale())
        self.assertEqual(note, f"game text: {game}")

    def test_only_pyodide_gets_the_virtual_bundle_path(self):
        # "/data/gametext.json" is where web/worker.js writes the text on
        # Pyodide's virtual disk. Anywhere else it is someone else's file: on
        # Windows it resolves against the current drive, and on Linux /data is
        # an ordinary directory. Asserted for both platforms, since the suite
        # runs on one of them and the entry it is about only appears on the
        # other.
        for path in ba_save._BUNDLED_LOCALES:
            self.assertTrue(os.path.isabs(path), path)
        here = os.path.dirname(os.path.abspath(ba_save.__file__))
        self.assertIn("/data/gametext.json", ba_save._bundled_locales(here, "emscripten"))
        for platform in ("win32", "linux", "darwin"):
            self.assertNotIn("/data/gametext.json", ba_save._bundled_locales(here, platform))
        self.assertEqual(ba_save._BUNDLED_LOCALES, ba_save._bundled_locales(here, sys.platform))

    def test_json_that_is_not_an_object_counts_as_malformed(self):
        # It parses, so it used to read as text that loaded, and then failed on
        # .get() inside a render and on .items() inside the build.
        for name, content in (("l.json", "[1, 2]"), ("s.json", '"text"'), ("n.json", "42")):
            self.assertEqual(ba_save.load_locale(self.write(name, content)), {}, name)
        good = self.write("good.json", json.dumps({"ba:itemname_gymcovercharge": "Gym"}))
        with patched((self.write("bad.json", "[1, 2]"), good)):
            self.assertEqual(ba_save.load_best_locale()[0], good)

    def test_main_binds_its_names_on_every_flag_combination(self):
        # The binding is conditional on --watch/--backfill, so a combination
        # that skipped it would raise NameError at the first use. Driven for
        # real rather than read off the source, which drifts.
        import ba_dashboard

        for argv, watching, backfilling in (
            ([], False, False),
            (["--watch"], True, False),
            (["--backfill"], False, True),
            (["--backfill", "--watch"], True, True),
        ):
            with self.subTest(argv=argv):
                with mock.patch.object(sys, "argv", ["ba_dashboard.py", *argv]),                         mock.patch.object(ba_dashboard, "resolve_target", return_value="T"),                         mock.patch.object(ba_dashboard, "newest_under", return_value="s.hsg"),                         mock.patch.object(ba_dashboard, "load_save"),                         mock.patch.object(ba_dashboard, "render", return_value=""),                         mock.patch.object(ba_dashboard, "watch") as watch,                         mock.patch.object(ba_dashboard, "backfill_history", return_value=0) as bf,                         mock.patch.object(ba_dashboard, "safe_extract", return_value=SAVE_SHAPE),                         mock.patch("builtins.open", mock.mock_open()),                         mock.patch("builtins.print"):
                    ba_dashboard.main()
                self.assertEqual(watch.called, watching)
                self.assertEqual(bf.called, backfilling)

    def test_the_candidate_list_is_well_formed(self):
        # Adjacent string literals merge silently if a comma is dropped, so the
        # count is pinned: update it when a location is added on purpose.
        self.assertEqual(len(ba_save._LOCALE_CANDIDATES), 8)
        for path in ba_save._LOCALE_CANDIDATES:
            self.assertTrue(path.endswith("en.json"), path)


if __name__ == "__main__":
    unittest.main()
