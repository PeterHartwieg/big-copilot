"""build_web.check() scans the UI text once, and the shared inputs change nothing.

check() and assemble() hand one i18n.calls() result, with its English and
params, to both ship()s; translation_catalogue.ship() builds each language
from one sources(). Reads the assembled web/, like tests.test_web_fresh.
"""
import unittest
from unittest import mock

import build_web
from tools import i18n
from tools import translation_catalogue as tc


class CatalogueScan(unittest.TestCase):
    def test_check_scans_the_call_sites_once(self):
        with mock.patch.object(i18n, 'calls', wraps=i18n.calls) as calls, \
                mock.patch.object(i18n, 'catalogue', wraps=i18n.catalogue) as catalogue, \
                mock.patch.object(i18n, 'passed', wraps=i18n.passed) as passed:
            self.assertEqual(build_web.check(), [])
        self.assertEqual(calls.call_count, 1)
        self.assertEqual(passed.call_count, 1)
        # The English once for both ship()s, the located English once for every language.
        self.assertEqual(sorted(c.kwargs.get('where', False) for c in catalogue.call_args_list), [False, True])

    def test_shared_inputs_build_the_same_catalogues(self):
        found = i18n.calls()
        inputs = tc.sources(found)
        for lang in i18n.languages():
            self.assertEqual(tc.catalogue(lang, inputs=inputs), tc.catalogue(lang, found), lang)
        english, params = i18n.catalogue(found), i18n.passed(found)
        self.assertEqual(tc.sources(found, english, params), inputs)
        with self.assertRaises(ValueError):
            tc.catalogue(i18n.languages()[0], found, inputs=inputs)


if __name__ == '__main__':
    unittest.main()
