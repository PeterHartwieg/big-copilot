"""Regressions found when reviewing the generated catalogue with the reader."""
from collections import Counter
import json
import os

from tests.test_wiki_build import FixtureCase, LOCALE, CHEAPGIFT_HELP, build


class WikiReview(FixtureCase):
    def test_dangling_links_agree_with_reader_page_ids(self):
        pages = [
            {'slug': 'wholesalers-locations', 'prefix': 'wholesalers_locations'},
            {'slug': 'furniture-consumergoodsworkstation', 'prefix': 'different_prefix'},
        ]
        locale = {'help_example_content': (
            '[Buy](wholesalers-locations) [Make](furniture-consumergoodsworkstation) '
            '[Missing](common_exercise) [Missing again](common_exercise) '
            '[Missing page](general-nowhere) [Vendor](address:13 5a)'
        )}
        self.assertEqual(build._dangling_links(locale, pages),
                         Counter({'common_exercise': 2, 'general-nowhere': 1}))

    def test_source_date_moves_with_a_counted_layout(self):
        for name in ['locale/en.json', 'helpstructure.json']:
            os.utime(os.path.join(self.streaming, name), (1704067200, 1704067200))
        layout = os.path.join(self.streaming, 'BusinessLayouts/GiftShop/M1/GiftShopRivals.json')
        os.utime(layout, (1735689600, 1735689600))
        self.assertEqual(self.build()['provenance']['sourceDate'], '2025-01-01')

    def test_new_compatible_furniture_is_kept_in_cards_and_graph(self):
        locale = dict(LOCALE)
        locale['help_ba:itemname_cheapgift_content'] = CHEAPGIFT_HELP.replace(
            '* [Rounded Shelf](furniture-roundedshelf)',
            '* [Rounded Shelf](furniture-roundedshelf)\n* [New Shelf](furniture-newshelf)')
        locale['ba:itemname_newshelf'] = 'New Shelf'
        locale['help_ba:itemname_newshelf_content'] = '**New Shelf** can be used to sell:\n\n* [Gift (Cheap)](products-cheapgift)'
        self.write_locale(locale)
        sample = self.sample()
        self.assertIn('newshelf', sample['FIXTURES'])
        self.assertIn('newshelf', sample['PRODUCTS']['cheapgift']['fixtures'])

    def test_wrong_shape_optional_layout_is_a_gap(self):
        self.write('StreamingAssets/BusinessLayouts/GiftShop/M1/GiftShopRivals.json', '[]')
        self.assertTrue(self.build()['provenance']['issues']['layouts'])

    def test_conflicting_wholesale_help_is_unknown(self):
        locale = dict(LOCALE)
        locale['help_wholesalers_locations_content'] = 'No product list is available.'
        self.write_locale(locale)
        self.assertIsNone(self.sample()['PRODUCTS']['cheapgift']['wholesale'])
