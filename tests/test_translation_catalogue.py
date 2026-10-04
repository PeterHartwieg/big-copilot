"""Community contracts stay tied to English and to the existing placeholder rules."""
import unittest
import json
import re
from pathlib import Path
from tools import i18n
from tools import translation_catalogue as tc


class TranslationCatalogue(unittest.TestCase):
    def test_hosted_pages_pin_the_generated_catalogue_contract(self):
        root = Path(__file__).resolve().parents[1]
        expected = {lang: json.loads((root / 'web' / 'translations' / f'{lang}.manifest.json').read_text())['revision']
                    for lang in i18n.languages()}
        for name in ('index.html', 'translate/index.html'):
            source = (root / 'web' / name).read_text()
            match = re.search(r'const TT_CATALOGUES = (\{[^;]+\});', source)
            self.assertIsNotNone(match, name)
            self.assertEqual(json.loads(match.group(1)), expected, name)

    def found(self, en=None, params=None):
        return [{'key': 'comm.test', 'en': en or {'one': '{n} shop: {item}', 'other': '{n} shops: {item}'},
                 'params': {'n', 'item', 'item_name'} if params is None else params,
                 'where': 'web/translate.js:10'}]

    def test_target_plural_categories_and_italian(self):
        for lang, categories in i18n.PLURALS.items():
            if lang == 'en':
                continue
            data = tc.catalogue(lang, self.found())
            self.assertEqual({e['key'] for e in data['entries']}, {f'comm.test_{x}' for x in categories})
        self.assertIn('it', i18n.languages())

    def test_compiled_contract_agrees_with_fits(self):
        found = self.found()
        en, params = i18n.catalogue(found), i18n.passed(found)
        for lang in ('it', 'ru', 'ko'):
            for entry in tc.catalogue(lang, found)['entries']:
                for text in ('{n} negozi: {item}', 'Un negozio: {item_name}', '{n} negozi: {item_name}',
                             '{n:$} negozi: {item}', '{n} negozi', '{other}', '{n} {item} {item_name}'):
                    self.assertEqual(tc.valid_text(text, entry['validation']),
                                     i18n.fits(entry['key'], text, en, lang, params), (lang, entry['key'], text))

    def test_unknown_params_contract_matches(self):
        found = self.found()
        found[0]['params'] = None
        en = i18n.catalogue(found)
        for entry in tc.catalogue('ru', found)['entries']:
            for text in ('{n} {item}', '{item}', 'shop', '{n} {item_name}'):
                self.assertEqual(tc.valid_text(text, entry['validation']), i18n.fits(entry['key'], text, en, 'ru'))

    def test_source_version_changes_for_english_or_contract_not_location(self):
        first = tc.catalogue('it', self.found())
        shifted = self.found(); shifted[0]['where'] = 'web/translate.js:99'
        self.assertEqual(first['revision'], tc.catalogue('it', shifted)['revision'])
        changed = self.found(); changed[0]['en']['one'] = '{n} store: {item}'
        self.assertTrue(all(a['sourceVersion'] != b['sourceVersion'] for a,b in zip(first['entries'], tc.catalogue('it', changed)['entries'])))
        changed = self.found(params={'n', 'item'})
        self.assertNotEqual(first['entries'][0]['sourceVersion'], tc.catalogue('it', changed)['entries'][0]['sourceVersion'])

    def test_text_boundary_preserves_italian_apostrophes(self):
        rule = {'allowed': [], 'required': [], 'maxLength': 2000}
        self.assertTrue(tc.valid_text('L\'attività "migliore" & più chiara', rule))
        for text in ('<img onerror=alert(1)>', '&lt;script&gt;', '&#60;img&#62;', '&amp;lt;img&amp;gt;', '{bad', '\x00hello', 'x'*2001):
            self.assertFalse(tc.valid_text(text, rule), text)

    def test_overlay_export_drops_metadata_and_refuses_stale_sources(self):
        data = tc.catalogue('it', self.found('Hello', set()))
        entry = data['entries'][0]
        raw = {'schemaVersion':1, 'lang':'it', 'revision':'old', 'voter':'private', 'translations':{
            entry['key']: {'text':'Ciao', 'sourceVersion':entry['sourceVersion'], 'votes':12}}}
        out = tc.selected_overlay('it', raw, data)
        self.assertNotIn('voter', out)
        self.assertEqual(set(out['translations'][entry['key']]), {'text','sourceVersion'})
        raw['translations'][entry['key']]['sourceVersion'] = 'stale'
        with self.assertRaises(i18n.CatalogueError): tc.selected_overlay('it', raw, data)


if __name__ == '__main__':
    unittest.main()
