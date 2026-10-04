"""Synthetic catalogue reuse regressions; layout state never enters the index."""
import copy
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch

import ba_dashboard as board
from tests.test_open_store import SHOP, RULES, PRICES


class CatalogueTests(unittest.TestCase):
    def test_shared_catalogue_matches_fresh_calls_with_independent_layouts(self):
        catalogue = board._OutfitCatalogue(RULES, PRICES)
        for cap, sqm, copied in ((20, 80, None), (75, 220, [('ba:itemname_fridge', 3, ['ba:itemname_beer'])]),
                                 (0, 0, None), (40, 100, None)):
            self.assertEqual(board.outfit_lines(SHOP, RULES, PRICES, cap, sqm, copied),
                             board.outfit_lines(SHOP, RULES, PRICES, cap, sqm, copied, _catalogue=catalogue))

    def test_union_flags_ties_and_duplicate_display_entries(self):
        rules = {'types': {SHOP: {'rq': [{'t': 3, 'n': 'station'}], 'i': [['product', 1]]}},
                 'furniture': {'z': {'v': ['shop'], 'c': 10, 'h': ['product', 'product']},
                               'a': {'v': ['shop'], 'c': 10, 'h': ['product']}}}
        prices = {'items': {'z': {'p': 100, 't': 1}, 'a': {'p': 100, 't': 2}}}
        self.assertEqual(board.outfit_lines(SHOP, rules, prices, 20, 10), [
            {'item': 'a', 'qty': 1, 'group': 'req', 'why': 'station'},
            {'item': 'a', 'qty': 1, 'group': 'cap', 'why': 'station'},
            {'item': 'a', 'qty': 2, 'group': 'shelf', 'why': ['product']}])

    def test_mount_preferences_are_type_specific_and_reused(self):
        other = 'ba:businesstype_giftshop'
        rules = {'types': {slug: {'rq': [{'i': ['station'], 'n': 'station'}]} for slug in (SHOP, other)},
                 'furniture': {'station': {'v': ['shop'], 'm': [['liquor', 'gift', 'cheap']]},
                               'liquor': {'v': ['shop'], 'bt': ['liquorstore']},
                               'gift': {'v': ['shop'], 'bt': ['giftshop']},
                               'cheap': {'v': ['shop']}}}
        prices = {'items': {n: {'p': p} for n, p in [('station', 100), ('liquor', 30), ('gift', 20), ('cheap', 1)]}}
        catalogue = board._OutfitCatalogue(rules, prices)
        for slug, expected in ((SHOP, 'liquor'), (other, 'gift'), (SHOP, 'liquor')):
            self.assertEqual(board.outfit_lines(slug, rules, prices, 20, 10, _catalogue=catalogue)[1]['item'], expected)
        with patch.object(board, 'works_in', side_effect=AssertionError('recomputed sold facts')):
            board.outfit_lines(SHOP, rules, prices, 40, 20, _catalogue=catalogue)

    def test_fresh_calls_read_changed_rules_and_prices(self):
        rules, prices = copy.deepcopy(RULES), copy.deepcopy(PRICES)
        first = board.outfit_lines(SHOP, rules, prices, 20, 100)
        prices['items']['ba:itemname_till']['p'] = 10000
        rules['furniture']['ba:itemname_speaker']['v'] = []
        rules['furniture']['ba:itemname_fridge']['h'] = []
        second = board.outfit_lines(SHOP, rules, prices, 20, 100)
        self.assertNotEqual(first, second)
        items = {line['item'] for line in second}
        self.assertIn('ba:itemname_bigtill', items)
        self.assertNotIn('ba:itemname_speaker', items)
        self.assertNotIn('ba:itemname_fridge', items)

    def test_store_builds_recreate_catalogue_after_price_and_rule_edits(self):
        from ba_save import Names, load_save
        from tests.es3_fixture import write_link_save
        with tempfile.TemporaryDirectory() as tmp:
            path = str(Path(tmp) / 'synthetic.hsg')
            write_link_save(path)
            build = board.build_core(load_save(path), Names({}), None)
            board.section(build, 'premises')
            rules, prices = copy.deepcopy(board.load_store_rules()), copy.deepcopy(board.load_item_prices())
            with patch.object(board, 'load_store_rules', return_value=rules), \
                 patch.object(board, 'load_item_prices', return_value=prices):
                first = board._open_store_section(build)['openStore']
                # All catalogue prices change; each subsequent invocation must
                # read them, even with the same Build and rule dictionary.
                for row in prices['items'].values():
                    if row.get('p'):
                        row['p'] *= 2
                second = board._open_store_section(build)['openStore']
                self.assertTrue(first['items'])
                for item, facts in first['items'].items():
                    if item in second['items']:
                        self.assertEqual(second['items'][item]['p'], facts['p'] * 2)
                for row in rules['furniture'].values():
                    row['v'] = []
                third = board._open_store_section(build)['openStore']
                self.assertEqual(third['items'], {})
