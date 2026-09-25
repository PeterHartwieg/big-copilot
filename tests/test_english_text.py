"""The board reads the game's English text and refuses another language.

Recipes, station capacities and door caps are parsed from the English help
pages, so a player who picks de.json gets German names and silently loses all
of those. Every front door has to refuse it: BA_LOCALE on the CLI, the web
build, and the browser (web/app.js checks the same key before it keeps a file).
The tables here are tiny synthetic stand-ins, never a real game file.

    python -m unittest tests.test_english_text
"""

from __future__ import annotations

import json
import os
import re
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import ba_dashboard
import ba_save
import build_web

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ENGLISH = {
    "ba:itemname_gymcovercharge": "Gym Cover Charge",
    "menu_options_others_language": "Language",
    "help_ba:businesstype_gym_content": "Businesses of this type primarily sell:",
}
GERMAN = {
    "ba:itemname_gymcovercharge": "Fitnessstudio-Eintritt",
    "menu_options_others_language": "Sprache",
    "help_ba:businesstype_gym_content": "Unternehmen dieser Art verkaufen hauptsächlich:",
}


class EnglishTextTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def write(self, *parts, table):
        path = os.path.join(self.tmp.name, *parts)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(table, fh, ensure_ascii=False)
        return path

    def patched(self, candidates=(), bundled=(), env=None):
        return _Patched(candidates, bundled, env or {})

    def test_the_language_word_decides(self):
        self.assertTrue(ba_save.english_text(ENGLISH))
        self.assertFalse(ba_save.english_text(GERMAN))
        self.assertTrue(ba_save.english_text({**ENGLISH, "menu_options_others_language": " language "}))

    def test_a_table_without_the_key_cannot_be_judged_and_passes(self):
        # The bundled text keeps names and help pages only.
        self.assertTrue(ba_save.english_text({"ba:itemname_gymcovercharge": "Gym Cover Charge"}))
        self.assertTrue(ba_save.english_text({}))

    def test_the_bundle_that_ships_passes(self):
        bundle = next(p for p in ba_save._BUNDLED_LOCALES if os.path.isfile(p))
        self.assertTrue(ba_save.english_text(ba_save.load_locale(bundle)))

    def test_ba_locale_at_a_german_file_is_refused_not_passed_over(self):
        # Passing over it would quietly read the install's en.json instead and
        # hide that the override was wrong.
        german = self.write("locale", "de.json", table=GERMAN)
        english = self.write("locale", "en.json", table=ENGLISH)
        with self.patched((english,), env={"BA_LOCALE": german}):
            with self.assertRaises(ba_save.NotEnglishText) as caught:
                ba_save.load_game_locale()
            self.assertIn(german, str(caught.exception))
            self.assertIn("'Sprache'", str(caught.exception))
            self.assertIn("en.json", str(caught.exception))
            with self.assertRaises(ba_save.NotEnglishText):
                ba_save.load_best_locale()

    def test_an_english_override_still_wins(self):
        english = self.write("locale", "en.json", table=ENGLISH)
        with self.patched((), env={"BA_LOCALE": english}):
            self.assertEqual(ba_save.load_game_locale(), (english, ENGLISH))

    def test_the_cli_stops_with_the_sentence_not_a_traceback(self):
        german = self.write("locale", "de.json", table=GERMAN)
        with self.patched((), env={"BA_LOCALE": german}):
            with self.assertRaises(SystemExit) as caught:
                ba_dashboard.game_text()
        self.assertIn("another language", str(caught.exception))

    def test_the_web_build_refuses_it_before_writing_anything(self):
        german = self.write("Big Ambitions_Data", "StreamingAssets", "locale", "de.json", table=GERMAN)
        with self.patched((), env={"BA_LOCALE": german}), \
                mock.patch.object(build_web, "write_public_wiki") as wiki:
            with self.assertRaises(SystemExit) as caught:
                build_web.main()
        self.assertIn("another language", str(caught.exception))
        wiki.assert_not_called()

    def test_the_browser_build_leaves_a_kept_german_file_out(self):
        # web/app.js refuses one now, but a browser may still hold a file kept
        # before that check; the shipped names win over it.
        names = self.write("py", "gametext.json", table={"ba:itemname_gymcovercharge": "Gym Cover Charge"})
        german = self.write("data", "en.json", table=GERMAN)
        english = self.write("data2", "en.json", table=ENGLISH)
        history = os.path.join(self.tmp.name, "history.json")
        seen = []
        save = mock.Mock(root={"characterId": "c"})
        with mock.patch.object(ba_dashboard, "load_save", return_value=save), \
                mock.patch.object(ba_dashboard, "safe_extract",
                                  side_effect=lambda s, n, h: seen.append(n.locale) or {}):
            ba_dashboard.browser_build("x.hsg", german, history, names)
            ba_dashboard.browser_build("x.hsg", english, history, names)
        self.assertEqual(seen[0], {"ba:itemname_gymcovercharge": "Gym Cover Charge"})
        self.assertEqual(seen[1], ENGLISH)

    def test_the_browser_checks_the_same_key_and_word(self):
        with open(os.path.join(ROOT, "web", "app.js"), encoding="utf-8") as fh:
            app = fh.read()
        self.assertRegex(app, r'const LANGUAGE_KEY = "%s";' % re.escape(ba_save.LANGUAGE_KEY))
        self.assertRegex(app, r'const ENGLISH_WORD = "%s";' % re.escape(ba_save.ENGLISH_WORD))


class PageLanguageTests(unittest.TestCase):
    def test_the_page_declares_english(self):
        # Both front doors come out of render(): the CLI's dashboard.html and,
        # through build_web.page_html, the site's index.html.
        page = ba_dashboard.render(None, live=True)
        self.assertTrue(page.startswith('<!doctype html>\n<html lang="en">\n<meta charset="utf-8">\n'),
                        page[:80])
        with open(os.path.join(ROOT, "web", "index.html"), encoding="utf-8") as fh:
            self.assertIn('<html lang="en">', fh.read(200))


class _Patched:
    """Detection sees only these candidates, bundles and environment."""

    def __init__(self, candidates, bundled, env):
        self.patches = [
            mock.patch.object(ba_save, "_LOCALE_CANDIDATES", tuple(candidates)),
            mock.patch.object(ba_save, "_BUNDLED_LOCALES", tuple(bundled)),
            mock.patch.dict(os.environ, env, clear=True),
        ]

    def __enter__(self):
        for p in self.patches:
            p.start()

    def __exit__(self, *exc):
        for p in reversed(self.patches):
            p.stop()


if __name__ == "__main__":
    unittest.main()
