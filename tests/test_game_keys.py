"""Game names are words; the game's keys are identities.

The page names an item, a business type or a neighbourhood from the payload's
`names`, and joins, stores and matches on the key only. These pin the keys the
payload carries where it used to carry only a name.
"""
import json
import os
import unittest
from unittest.mock import patch

from ba_dashboard import (
    HOOD_IDS,
    HOOD_LABEL,
    HOOD_TAG,
    NEIGHBOURHOODS,
    RENT_RATES,
    _game_names,
    _products,
    _rent_estimate,
    hood_key,
    hood_label,
    load_buildings,
)
from ba_save import Names

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class NeighbourhoodKeyTests(unittest.TestCase):
    def test_the_building_table_stores_the_games_ids(self):
        with open(os.path.join(ROOT, "ba_buildings.json"), encoding="utf-8") as fh:
            rows = json.load(fh)
        self.assertEqual({r["h"] for r in rows}, set(HOOD_IDS.values()))

    def test_a_row_reads_as_the_games_key(self):
        self.assertEqual(hood_key({"h": "thehamptons"}), "ba:neighborhood_thehamptons")
        self.assertIsNone(hood_key({}))
        self.assertIsNone(hood_key(None))

    def test_the_tables_agree_on_the_seven_keys(self):
        keys = set(NEIGHBOURHOODS.values())
        self.assertEqual(len(keys), 7)
        self.assertEqual(set(HOOD_LABEL), keys)
        self.assertEqual(set(HOOD_TAG), keys)
        # Every English name the rent fit was written by still finds its rate.
        self.assertEqual(set(HOOD_LABEL.values()), set(RENT_RATES))

    def test_python_sentences_keep_the_english_name(self):
        self.assertEqual(hood_label("ba:neighborhood_hellskitchen"), "Hell's Kitchen")
        self.assertEqual(hood_label(None, "-"), "-")

    def test_the_rent_estimate_finds_its_rate_by_key(self):
        row = {"h": "midtown", "t": "retail", "m": 100, "x": 40}
        self.assertEqual(_rent_estimate(row), round(100 * 70 * RENT_RATES["Midtown"]))

    def test_every_real_building_is_priced_by_its_neighbourhood(self):
        # The rewritten table: no building lost its rate to the change of key.
        for row in load_buildings().values():
            if row.get("m") and row.get("t") != "residential":
                self.assertIsNotNone(_rent_estimate(row), row)


class NamesTableTests(unittest.TestCase):
    def test_the_payload_names_every_display_key_and_no_description(self):
        names = Names({
            "ba:itemname_paperbag": "Paper Bag",
            "ba:businesstype_coffeeshop": "Coffee Shop",
            "ba:jobdemand_gym": "Gym",
            "ba:jobdemand_gym_description": "A long sentence",
            "help_ba:itemname_paperbag_content": "not a name",
        })
        out = _game_names(names)
        self.assertEqual(out["ba:itemname_paperbag"], "Paper Bag")
        self.assertEqual(out["ba:businesstype_coffeeshop"], "Coffee Shop")
        self.assertIn("ba:jobdemand_gym", out)
        self.assertNotIn("ba:jobdemand_gym_description", out)
        self.assertNotIn("help_ba:itemname_paperbag_content", out)

    def test_a_board_without_game_text_still_names_its_neighbourhoods(self):
        out = _game_names(Names({}))
        self.assertEqual(out["ba:neighborhood_midtown"], "Midtown")
        self.assertEqual(len(out), 7)

    def test_the_game_text_wins_over_the_fallback(self):
        out = _game_names(Names({"ba:neighborhood_thehamptons": "Les Hamptons"}))
        self.assertEqual(out["ba:neighborhood_thehamptons"], "Les Hamptons")


class ProductKeyTests(unittest.TestCase):
    def test_two_items_that_share_a_name_stay_two_products(self):
        # The game names both lettuces "Bag of Lettuce"; they are two items.
        line = lambda slug: {"item": "Bag of Lettuce", "slug": slug, "revenue": 10.0,
                             "soldPerDay": 2, "soldPerWeek": 14, "units": 5}
        rows = _products([{"lines": [line("ba:itemname_lettuce"), line("ba:itemname_rawlettuce")]}])
        self.assertEqual(sorted(r["slug"] for r in rows),
                         ["ba:itemname_lettuce", "ba:itemname_rawlettuce"])
        self.assertEqual({r["item"] for r in rows}, {"Bag of Lettuce"})


if __name__ == "__main__":
    unittest.main()
