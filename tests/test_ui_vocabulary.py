"""The words the board does not use (AGENTS.md, "Names on screen and in code").

One lint over the whole English catalogue (`python tools/i18n.py extract`), so
the vocabulary rules do not have to be pinned sentence by sentence in the
tests of each feature: no "roster", "shift" or "post", and "building capacity",
not "door cap". Placeholder names ({rostered}) are code, not words, and the
Shift key is a key. The game's own text (a job demand's "No evening shifts")
never enters the catalogue, so it is not checked here.
"""
import importlib.util
import os
import re
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

BANNED = re.compile(r"\b(rosters?|rostered|rostering|shifts?|posts?|posted|door[ -]?caps?)\b", re.I)
PLACEHOLDER = re.compile(r"\{\w+(?::[^{}]+)?\}")
SHIFT_KEY = re.compile(r"\b(?:Cmd|Ctrl|Alt|Option)\+Shift\b|\bShift\+", re.I)


def catalogue() -> dict:
    spec = importlib.util.spec_from_file_location("i18n_tool", os.path.join(ROOT, "tools", "i18n.py"))
    tool = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(tool)
    return tool.catalogue()


class UiVocabularyTests(unittest.TestCase):
    def test_no_catalogue_text_uses_the_words_the_board_avoids(self):
        bad = {}
        for key, english in catalogue().items():
            words = SHIFT_KEY.sub("", PLACEHOLDER.sub("", english))
            found = BANNED.findall(words)
            if found:
                bad[key] = (found, english)
        self.assertEqual(bad, {}, "say staffing or scheduling, hours and days, the station's name, "
                                  "and building capacity (AGENTS.md)")

    def test_the_lint_catches_each_word(self):
        for text in ("Edit the roster", "2 shifts", "the cleaning post", "at its door cap", "Rostered hours"):
            self.assertRegex(text, BANNED)
        for text in ("Press Cmd+Shift+G", "{rostered}; needs {need} h"):
            self.assertNotRegex(SHIFT_KEY.sub("", PLACEHOLDER.sub("", text)), BANNED)


if __name__ == "__main__":
    unittest.main()
