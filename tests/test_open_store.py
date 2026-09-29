"""Expansion › Open a store: the facts a plan is worked out from (_open_store(),
docs/open-a-store-scope.md, phase 2).

The rules are the game's own: what a type needs to open, one item per customer
demand, tills and displays sized to the building's customer capacity, the
interior score Midtown asks for, the neighbourhood demand a new seller moves,
and the arrivals each open hour starts from. The fixtures are synthetic: small
hand-made rule and price tables, and tests/save_fixtures.py's trading company
for the payload end to end. Never a real save.
"""
import json
import math
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))

import ba_dashboard  # noqa: E402
import save_fixtures  # noqa: E402
from ba_dashboard import (  # noqa: E402
    CAPPED_INITIAL_BUILD, _plan_initial, decor_route, demand_with, optimal_providers, outfit_lines,
)
from ba_save import Names, load_save  # noqa: E402

POS, MUSIC, SINK, TOILET = 8, ba_dashboard.MUSIC_FLAG, ba_dashboard.SINK_FLAG, ba_dashboard.TOILET_FLAG
SHOP = "ba:businesstype_liquorstore"
VENDOR = ["ba:street_fifthavenue#13"]

# A liquor store's rules, cut down: a point of sale by its type flag, baskets
# by name, a stall per 100 m² at most two, and four customer demands.
RULES = {
    "types": {SHOP: {
        "b": "retail", "c": 1,
        "i": [["ba:itemname_beer", 1], ["ba:itemname_whisky", 1], ["ba:itemname_sodacan", 0.85]],
        "dm": [["music", 1], ["toilet", 0.5], ["toiletprivacy", 0.5], ["interiordesign", 1]],
        "rq": [{"n": "anyprimaryproduct", "any": 1}, {"n": "pointofsales", "t": POS},
               {"n": "stackofshoppingbaskets", "i": ["ba:itemname_baskets"]},
               {"n": "sinks", "t": SINK, "sq": 100, "mx": 2}],
    }},
    "furniture": {
        "ba:itemname_till": {"c": 20, "v": VENDOR},
        "ba:itemname_bigtill": {"c": 40, "v": VENDOR},
        "ba:itemname_cinematill": {"c": 100, "v": VENDOR, "bt": ["cinema"]},  # made for cinemas only
        "ba:itemname_baskets": {"v": VENDOR},
        "ba:itemname_sink": {"v": VENDOR},
        "ba:itemname_speaker": {"v": VENDOR},
        "ba:itemname_nobodysells": {"v": []},   # a speaker no store sells
        "ba:itemname_toilet": {"v": VENDOR},
        "ba:itemname_stall": {"v": VENDOR, "x": ["privacy"]},
        "ba:itemname_fridge": {"c": 10, "h": ["ba:itemname_beer", "ba:itemname_sodacan"], "v": VENDOR},
        "ba:itemname_shelf": {"c": 25, "h": ["ba:itemname_whisky"], "v": VENDOR},
    },
    "products": {"ba:itemname_beer": {"p": 4}, "ba:itemname_whisky": {"p": 40}, "ba:itemname_sodacan": {"p": 2}},
}
PRICES = {"items": {
    "ba:itemname_till": {"p": 900, "t": POS}, "ba:itemname_bigtill": {"p": 2300, "t": POS},
    "ba:itemname_cinematill": {"p": 100, "t": POS}, "ba:itemname_baskets": {"p": 200},
    "ba:itemname_sink": {"p": 220, "t": SINK}, "ba:itemname_speaker": {"p": 80, "t": MUSIC},
    "ba:itemname_nobodysells": {"p": 10, "t": MUSIC}, "ba:itemname_toilet": {"p": 380, "t": TOILET},
    "ba:itemname_stall": {"p": 2100, "t": TOILET}, "ba:itemname_fridge": {"p": 1500},
    "ba:itemname_shelf": {"p": 600},
}}


def lines_of(cap, sqm, copied=None):
    return {(line["item"], line["group"]): line
            for line in outfit_lines(SHOP, RULES, PRICES, cap, sqm, copied)}


class OutfitTests(unittest.TestCase):
    def test_a_fully_outfitted_store_holds_what_it_needs_and_one_item_per_demand(self):
        got = lines_of(30, 225)
        # Tills cover 30 customers an hour for the least: two small tills (1,800)
        # over one big one (2,300); the cinema's cheaper till is not made for a
        # liquor store. The first till is the requirement, the second capacity.
        self.assertEqual(got[("ba:itemname_till", "req")]["qty"], 1)
        self.assertEqual(got[("ba:itemname_till", "cap")]["qty"], 1)
        self.assertNotIn(("ba:itemname_cinematill", "req"), got)
        self.assertEqual(got[("ba:itemname_baskets", "req")]["qty"], 1)
        # Sinks: one per 100 m², at most two.
        self.assertEqual(got[("ba:itemname_sink", "req")]["qty"], 2)
        # Music from the cheapest speaker somebody sells; toilet and privacy
        # from one stall, since a plain toilet beside it could fail privacy.
        self.assertEqual(got[("ba:itemname_speaker", "dem")]["why"], "music")
        self.assertNotIn(("ba:itemname_nobodysells", "dem"), got)
        self.assertEqual(got[("ba:itemname_stall", "dem")]["why"], "toilet+privacy")
        self.assertNotIn(("ba:itemname_toilet", "dem"), got)
        # The interior score is walls and floors, never an item.
        self.assertFalse(any(line["why"] == "interiordesign" for line in got.values()))

    def test_displays_cover_the_building_capacity_for_every_product(self):
        got = lines_of(30, 225)
        fridge = got[("ba:itemname_fridge", "shelf")]
        # Beer and soda share the fridge: three for each (10 an hour each).
        self.assertEqual(fridge["qty"], 6)
        self.assertEqual(fridge["why"], ["ba:itemname_beer", "ba:itemname_sodacan"])
        self.assertEqual(got[("ba:itemname_shelf", "shelf")]["qty"], 2)

    def test_the_players_own_shelving_is_copied_instead(self):
        got = lines_of(30, 225, copied=[("ba:itemname_shelf", 9, ["ba:itemname_whisky"])])
        self.assertEqual(got[("ba:itemname_shelf", "shelf")]["qty"], 9)
        self.assertNotIn(("ba:itemname_fridge", "shelf"), got)


class DemandTests(unittest.TestCase):
    def test_a_new_seller_moves_demand_down_a_step_past_the_room_the_price_leaves(self):
        # ProductMarketHelper: dear goods leave room for fewer sellers.
        self.assertEqual(optimal_providers(55), 5)
        self.assertEqual(optimal_providers(799), 2)
        self.assertEqual(optimal_providers(3), 7)
        self.assertEqual(optimal_providers(0), 7)
        self.assertEqual(demand_with(1, 55), 79.5)
        self.assertEqual(demand_with(2, 55), 59.5)
        self.assertEqual(demand_with(4, 55), 31.5)   # bottomed out
        self.assertEqual(demand_with(0, 55), 99.5)


class DecorTests(unittest.TestCase):
    MATERIALS = {
        "grass": {"t": 1, "p": 5, "b": 1}, "marble": {"t": 1, "p": 90, "b": 1},
        "paint": {"t": 2, "p": 30, "b": 1}, "unsold": {"t": 2, "p": 1, "b": 0},
    }

    def test_the_cheapest_walls_and_floors_to_the_neighbourhoods_score(self):
        route = decor_route(290, 225, 84, self.MATERIALS, 50)
        self.assertGreaterEqual(route["score"], 50)
        self.assertEqual(route["floor"], "grass")
        self.assertEqual(route["wall"], "paint")
        self.assertEqual(route["cost"], route["floors"] * 5 + route["walls"] * 30)
        # One slot fewer would not reach the score.
        spend = route["cost"] - 30 if route["walls"] else route["cost"] - 5
        slots = route["floors"] + route["walls"] - 1
        self.assertLess(math.floor((min(spend / 290, 100) + 100 * slots / 309) / 2), 50)

    def test_no_score_asked_costs_nothing_and_an_unknown_layout_has_no_route(self):
        self.assertEqual(decor_route(290, 225, 84, self.MATERIALS, 0)["cost"], 0)
        self.assertIsNone(decor_route(0, 0, 0, self.MATERIALS, 50))


class InitialTests(unittest.TestCase):
    """_plan_initial() is _initial_customers(), shared with the staffing
    assistant's arrival ceiling."""

    def test_a_current_game_starts_from_the_building_capacity(self):
        self.assertEqual(_plan_initial(CAPPED_INITIAL_BUILD, "retail", 30, SHOP, 225, ["ba:itemname_beer"]), 30)

    def test_an_old_game_starts_from_the_best_primary_products_ratio_times_the_floor(self):
        curves = ba_dashboard.load_demand_curves()
        primary = curves["types"][SHOP]["p"]
        best = max(curves["items"].get(p, 0) for p in primary)
        self.assertAlmostEqual(_plan_initial(2701, "retail", 30, SHOP, 225, primary), best * 225)

    def test_an_office_starts_from_its_capacity_whatever_the_build(self):
        law = "ba:businesstype_lawfirm"
        self.assertEqual(_plan_initial(2701, "office", 50, law, 660, ["ba:itemname_hourlylawyerfee"]), 50)
        self.assertEqual(_plan_initial(None, "office", 10, law, 285, []), 10)


class PayloadTests(unittest.TestCase):
    """_open_store() end to end on the synthetic trading company."""

    @classmethod
    def setUpClass(cls):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "payload.hsg")
            save_fixtures.write_data_save(path, save_fixtures.DAY)
            payload = ba_dashboard.extract(load_save(path), Names(save_fixtures.data_names()), None)
        cls.facts = payload["openStore"]
        cls.payload = payload

    def test_every_planned_type_has_an_outfit_per_layout_to_rent_and_its_model(self):
        types = self.facts["types"]
        self.assertTrue(types)
        for slug, t in types.items():
            self.assertIn(t["model"], ("retail", "office", None), slug)
            self.assertTrue(t["layouts"], slug)
            for layout, outfit in t["layouts"].items():
                self.assertGreaterEqual(outfit["furniture"], 0)
                self.assertEqual(outfit["fee"], ba_dashboard.INSTALL_FEE_PER_M2 * next(
                    b["m2"] for b in self.payload["premises"]["buildings"] if b.get("layout") == layout
                    and b["type"] == t["cat"]))
                self.assertGreater(t["initial"][layout], 0, (slug, layout))
            if t["model"] == "office":
                self.assertGreater(t["wage"], 0)

    def test_the_facts_are_json_and_carry_the_game_the_market_and_the_banks(self):
        json.dumps(self.facts)
        game = self.facts["game"]
        self.assertEqual(game["installFee"], ba_dashboard.INSTALL_FEE_PER_M2)
        self.assertEqual(game["delivery"], ba_dashboard.FURNITURE_DELIVERY_FEE)
        self.assertEqual(len(self.facts["campaigns"]), 6)
        banks = {b["id"]: b for b in self.facts["finance"]["banks"]}
        self.assertEqual(banks["VantanderBankSettings"]["name"], "Vantander Bank")
        self.assertEqual(banks["VantanderBankSettings"]["term"], 60 * 4)
        for item, row in self.facts["market"].items():
            self.assertGreaterEqual(row["cost"], 0, item)
            self.assertEqual(row["opt"], optimal_providers(row["p"]))

    def test_a_players_own_shop_carries_what_the_model_needs_to_price_it(self):
        own = [row for rows in self.facts["own"].values() for row in rows]
        for row in own:
            for key in ("key", "hood", "cap", "initial", "promo", "marketing", "open", "actual", "days"):
                self.assertIn(key, row)
            self.assertGreaterEqual(row["days"], 3)


if __name__ == "__main__":
    unittest.main()
