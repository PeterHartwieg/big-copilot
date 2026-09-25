"""Labels made from a slug, not from game text, carry no markup.

A crafted save can put anything in a slug or a street number; the game's own
text is left as it is.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from ba_save import Names, house_number  # noqa: E402


class SlugFallbacks(unittest.TestCase):
    def setUp(self):
        self.names = Names({"ba:itemname_beer": "Beer <b>& Co</b>"})

    def test_game_text_is_kept_as_written(self):
        self.assertEqual(self.names.label("ba:itemname_beer"), "Beer <b>& Co</b>")

    def test_an_unknown_slug_drops_markup(self):
        for slug in ("ba:businesstype_<img src=x onerror=alert(1)>", 'ba:itemname_"><svg/onload=x>'):
            self.assertRegex(self.names.label(slug), r"^[A-Za-z0-9 '.&-]+$")
        self.assertEqual(self.names.label("ba:itemname_smartphone1"), "Smartphone 1")

    def test_a_street_drops_markup_and_keeps_known_names(self):
        self.assertEqual(self.names.street("ba:street_fifthavenue"), "Fifth Avenue")
        self.assertEqual(self.names.street("ba:street_twentyfirststreet"), "21st Street")
        self.assertEqual(self.names.street("ba:street_oceancrest"), "Ocean Crest")
        self.assertNotIn("<", self.names.street("ba:street_<script>alert(1)</script>"))

    def test_a_street_number_is_digits(self):
        self.assertEqual(house_number(19), "19")
        self.assertEqual(house_number("19<img src=x>"), "19")
        self.assertEqual(house_number("<b>"), "-")
        self.assertEqual(self.names.addr(("ba:street_broadway", "7<i>")), "7 Broadway")


if __name__ == "__main__":
    unittest.main()
