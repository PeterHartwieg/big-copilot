"""The languages Big Copilot's own text comes in: UI_LANGUAGES in ba_dashboard.py
is the one table, and every other list of them is read off it or held to it here.

TT_LANGS and TT_NUM_LOCALES in web/i18n.js are copies (the page and the Node
tests run that file as it is, unbuilt), so they must name the same codes in the
same order. PLURALS in tools/i18n.py is read off the table. Each language's
locale and plural categories are checked against Intl in Node, so a new
language cannot get en-US numbers or English plurals by accident.
"""
import json
import re
import subprocess
import unittest
from pathlib import Path

from ba_dashboard import GAME_NAME_LANGS, UI_LANGS, UI_LANGS_DRAFTED, UI_LANGUAGES
from tools import i18n

ROOT = Path(__file__).resolve().parents[1]


def _script():
    return (ROOT / "web" / "i18n.js").read_text(encoding="utf-8")


class UiLanguagesTest(unittest.TestCase):
    def test_each_entry_has_a_locale_plurals_and_a_drafted_flag(self):
        self.assertEqual(UI_LANGS[0], "en")
        self.assertEqual(UI_LANGUAGES["en"]["locale"], "en-US")
        for code, lang in UI_LANGUAGES.items():
            with self.subTest(code=code):
                self.assertEqual(set(lang), {"locale", "plurals", "drafted"})
                # The locale is the language's own: its first subtag is the code.
                self.assertEqual(lang["locale"].split("-")[0], code)
                self.assertIsInstance(lang["drafted"], bool)
                self.assertIn("other", lang["plurals"])
        self.assertFalse(UI_LANGUAGES["en"]["drafted"])
        self.assertEqual(UI_LANGS, tuple(UI_LANGUAGES))
        self.assertEqual(UI_LANGS_DRAFTED, tuple(c for c in UI_LANGS if UI_LANGUAGES[c]["drafted"]))

    def test_the_order_is_the_footers(self):
        # The footer lists the whole-page languages in GAME_NAME_LANGS' order,
        # which names each in its own words; the table keeps that one order.
        self.assertTrue(set(UI_LANGS) <= set(GAME_NAME_LANGS))
        self.assertEqual(list(UI_LANGS), [c for c in GAME_NAME_LANGS if c in UI_LANGUAGES])

    def test_web_i18n_js_lists_the_same_languages_and_locales_in_order(self):
        script = _script()
        langs = json.loads(re.search(r"const TT_LANGS = (\[[^\]]*\]);", script).group(1))
        self.assertEqual(langs, list(UI_LANGS))
        body = re.search(r"const TT_NUM_LOCALES = \{([^}]*)\};", script).group(1)
        locales = re.findall(r'([a-z-]+): "([^"]+)"', body)
        self.assertEqual(locales, [(c, UI_LANGUAGES[c]["locale"]) for c in UI_LANGS])

    def test_the_catalogue_tool_reads_the_plurals_off_the_table(self):
        self.assertEqual(list(i18n.PLURALS), list(UI_LANGS))
        for code in UI_LANGS:
            self.assertEqual(i18n.PLURALS[code], UI_LANGUAGES[code]["plurals"])

    def test_each_language_but_english_has_a_translation(self):
        ours = sorted(n.name[:-5] for n in (ROOT / "i18n").iterdir() if n.name.endswith(".json") and n.name.count(".") == 1)
        self.assertEqual(ours, sorted(set(UI_LANGS) - {"en"}))

    def test_locales_and_plurals_are_what_intl_says(self):
        # The page formats numbers with Intl.NumberFormat(locale) and picks a
        # plural form with Intl.PluralRules(code); the catalogue's PLURALS must
        # be the categories those rules return, in CLDR order.
        probe = (
            "const want = JSON.parse(process.argv[1]); const out = {};"
            "for (const [code, locale] of want) out[code] = {"
            " supported: Intl.NumberFormat.supportedLocalesOf([locale]),"
            " plurals: new Intl.PluralRules(locale).resolvedOptions().pluralCategories,"
            " byCode: new Intl.PluralRules(code).resolvedOptions().pluralCategories};"
            "console.log(JSON.stringify(out));"
        )
        want = [[c, UI_LANGUAGES[c]["locale"]] for c in UI_LANGS]
        run = subprocess.run(["node", "-e", probe, json.dumps(want)], capture_output=True, text=True, check=True)
        got = json.loads(run.stdout)
        order = ("zero", "one", "two", "few", "many", "other")
        for code in UI_LANGS:
            with self.subTest(code=code):
                lang = UI_LANGUAGES[code]
                self.assertEqual(got[code]["supported"], [lang["locale"]])
                self.assertEqual(sorted(got[code]["plurals"], key=order.index), list(lang["plurals"]))
                self.assertEqual(sorted(got[code]["byCode"], key=order.index), list(lang["plurals"]))


if __name__ == "__main__":
    unittest.main()
