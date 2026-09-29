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
from ba_save import Names, Save, load_save  # noqa: E402

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

    def test_the_players_own_shelving_is_copied_and_whatever_it_does_not_hold_is_added(self):
        got = lines_of(30, 225, copied=[("ba:itemname_shelf", 9, ["ba:itemname_whisky"])])
        self.assertEqual(got[("ba:itemname_shelf", "shelf")]["qty"], 9)
        # The model sells beer and soda too: the copied shop has no fridge for
        # them, so the fallback adds one per product as if nothing were copied.
        fridge = got[("ba:itemname_fridge", "shelf")]
        self.assertEqual((fridge["qty"], fridge["why"]), (6, ["ba:itemname_beer", "ba:itemname_sodacan"]))

    def test_a_display_several_products_share_stands_on_its_whole_count(self):
        rules = json.loads(json.dumps(RULES))
        rules["furniture"]["ba:itemname_fridge"]["m"] = [["ba:itemname_plinth"]]
        rules["furniture"]["ba:itemname_plinth"] = {"v": VENDOR}
        prices = {"items": {**PRICES["items"], "ba:itemname_plinth": {"p": 5}}}
        got = {(l["item"], l["group"], str(l["why"])): l["qty"] for l in outfit_lines(SHOP, rules, prices, 30, 225)}
        self.assertEqual(got[("ba:itemname_fridge", "shelf", "['ba:itemname_beer', 'ba:itemname_sodacan']")], 6)
        self.assertEqual(got[("ba:itemname_plinth", "shelf", "mount")], 6)

    def test_a_station_takes_the_cheapest_piece_of_each_placement_requirement(self):
        # A computer needs a desk and a chair: one of each, not the cheapest of both.
        rules = json.loads(json.dumps(RULES))
        for till in ("ba:itemname_till", "ba:itemname_bigtill"):
            rules["furniture"][till]["m"] = [["ba:itemname_towel", "ba:itemname_chair"], ["ba:itemname_desk", "ba:itemname_bigdesk"]]
        rules["furniture"].update({n: {"v": VENDOR} for n in ("ba:itemname_towel", "ba:itemname_chair", "ba:itemname_desk", "ba:itemname_bigdesk")})
        prices = {"items": {**PRICES["items"], "ba:itemname_towel": {"p": 10}, "ba:itemname_chair": {"p": 90},
                            "ba:itemname_desk": {"p": 300}, "ba:itemname_bigdesk": {"p": 700}}}
        got = [(l["item"], l["group"], l["qty"]) for l in outfit_lines(SHOP, rules, prices, 30, 225) if l["why"] == "mount"
               and l["group"] in ("req", "cap")]
        self.assertEqual(sorted(got), [("ba:itemname_desk", "cap", 1), ("ba:itemname_desk", "req", 1),
                                       ("ba:itemname_towel", "cap", 1), ("ba:itemname_towel", "req", 1)])

    def test_a_piece_the_stations_own_store_sells_goes_with_it(self):
        rules = json.loads(json.dumps(RULES))
        for till in ("ba:itemname_till", "ba:itemname_bigtill"):
            rules["furniture"][till]["m"] = [["ba:itemname_towel", "ba:itemname_chair"]]
        rules["furniture"]["ba:itemname_towel"] = {"v": ["ba:street_seventhavenue#5"]}   # a beach shop
        rules["furniture"]["ba:itemname_chair"] = {"v": VENDOR}                          # the till's own store
        prices = {"items": {**PRICES["items"], "ba:itemname_towel": {"p": 10}, "ba:itemname_chair": {"p": 90}}}
        mounts = {l["item"] for l in outfit_lines(SHOP, rules, prices, 30, 225) if l["why"] == "mount"}
        self.assertEqual(mounts, {"ba:itemname_chair"})

    def test_an_item_for_a_customer_demand_is_any_the_stores_sell_whatever_its_catalogue_tags(self):
        # The designer's type tags sort the catalogue; a nightclub's speaker plays in a liquor store.
        rules = json.loads(json.dumps(RULES))
        rules["furniture"]["ba:itemname_clubspeaker"] = {"v": VENDOR, "bt": ["nightclub"]}
        prices = {"items": {**PRICES["items"], "ba:itemname_clubspeaker": {"p": 40, "t": MUSIC}}}
        music = [l["item"] for l in outfit_lines(SHOP, rules, prices, 30, 225) if l["why"] == "music"]
        self.assertEqual(music, ["ba:itemname_clubspeaker"])

    def test_a_cinema_seats_its_capacity_across_its_screens(self):
        cinema = "ba:businesstype_cinema"
        rules = {"types": {cinema: {"b": "cinema", "c": 1, "i": [], "dm": [],
                                    "rq": [{"n": "cinemascreen", "i": ["ba:itemname_screen"]}]}},
                 "furniture": {"ba:itemname_screen": {"c": 25, "v": VENDOR, "bt": ["cinema"]},
                               "ba:itemname_seat": {"st": 1, "v": VENDOR, "bt": ["cinema"]},
                               "ba:itemname_row": {"st": 4, "v": VENDOR, "bt": ["cinema"]},
                               "ba:itemname_armchair": {"st": 1, "v": VENDOR}},
                 "products": {}}
        prices = {"items": {"ba:itemname_screen": {"p": 2800}, "ba:itemname_seat": {"p": 250},
                            "ba:itemname_row": {"p": 800}, "ba:itemname_armchair": {"p": 100}}}
        lines = {(l["item"], l["group"]): l["qty"] for l in outfit_lines(cinema, rules, prices, [100, 150], 2000)}
        # Four screens for 100 an hour at 25 each; 25 seats each for the least:
        # six rows of 4 and one single (5,050) beat seven rows (5,600).
        self.assertEqual(lines[("ba:itemname_screen", "req")] + lines[("ba:itemname_screen", "cap")], 4)
        self.assertEqual((lines[("ba:itemname_row", "cap")], lines[("ba:itemname_seat", "cap")]), (24, 4))
        self.assertNotIn(("ba:itemname_armchair", "cap"), lines)

    def test_each_venue_version_keeps_its_own_capacity(self):
        # 15 Third Avenue is an S3; 4 Broadway Street an S1.
        self.assertEqual(ba_dashboard.plan_layout({"key": "ba:street_thirdavenue#15", "layout": None, "size": "S"}), "S3")
        self.assertEqual(ba_dashboard.plan_layout({"key": "ba:street_broadwaystreet#4", "layout": None, "size": "S"}), "S1")
        text = chr(10).join(["**Cinema**", "* **S1**: 2,000m / 150 customer capacity", "* **S3**: 2,000m / 100 customer capacity"])
        self.assertEqual(ba_dashboard._venue_caps(Names({"help_building_types_content": text})), {"S1": 150, "S3": 100})

    def test_a_gym_holds_five_distinct_workout_types_the_cheapest_way(self):
        gym = "ba:businesstype_gym"
        rules = {"types": {gym: {"b": "retail", "c": 1, "i": [], "dm": [["workoutvariety", 1]],
                                 "rq": [{"n": "workoutmachine", "t": 1048576}]}},
                 "furniture": {}, "products": {}}
        machines = {"mat": (150, 2), "ball": (60, 2), "bar": (280, 6), "bag": (450, 3), "trampoline": (525, 0),
                    "barbell": (2100, 8), "treadmill": (5250, 1), "bell": (20, 7)}
        prices = {"items": {}}
        for name, (price, kind) in machines.items():
            item = f"ba:itemname_{name}"
            rules["furniture"][item] = {"c": 2, "wt": kind, "v": [] if name == "bell" else VENDOR}  # nobody sells the kettlebell
            prices["items"][item] = {"p": price, "t": 1048576}
        lines = outfit_lines(gym, rules, prices, 4, 225)
        kinds = {rules["furniture"][l["item"]]["wt"] for l in lines}
        self.assertEqual(len(kinds), 5)
        # The requirement's two fitballs (4 customers an hour, 2 each), then the
        # four cheapest other types; the mat trains what the ball does.
        self.assertEqual(sorted((l["item"], l["group"]) for l in lines if l["group"] == "dem"),
                         [("ba:itemname_bag", "dem"), ("ba:itemname_bar", "dem"), ("ba:itemname_barbell", "dem"),
                          ("ba:itemname_trampoline", "dem")])


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


def coll(items):
    return {"$items": list(items)}


class FinanceTests(unittest.TestCase):
    """_finance_facts(): the wealth and debts the banks weigh (LOANS.md)."""
    RULES = {"banks": {"VantanderBankSettings": {"r": 12, "y": 4, "x": 2000000},
                       "JensenCapitalSettings": {"r": 20, "y": 2, "x": 40000}},
             "vehicles": {"ba:vehicletype_vordv150": 44000}}

    def facts(self, **root):
        base = {"Money": 10000.0, "gameVariables": {"daysPerYear": 60, "bankInterestMultiplier": 0.7}}
        save = Save({**base, **root}, {}, "synthetic")
        daily = [{"profit": p} for p in (100, 200, 300, 400, 500, 600, 700, 800)]
        return ba_dashboard._finance_facts(save, daily, self.RULES)

    def test_wealth_counts_cash_funds_motor_vehicles_boats_and_property(self):
        f = self.facts(
            investmentFunds=coll([{"initialDeposit": 5000, "additionalInvestment": 1000, "withdrawal": 500, "interestPayment": 20}]),
            VehicleInstances=coll([{"vehicleTypeName": "ba:vehicletype_vordv150"}, {"vehicleTypeName": "ba:vehicletype_handtruck"}]),
            playerBoats=coll([{"type": 1}]),
            realEstate=coll([{"purchasePrice": 300000}]))
        self.assertEqual(f["wealth"], 10000 + 5520 + 44000 + 2_500_000 + 300000)
        # The last seven days' average profit: 200 to 800.
        self.assertEqual(f["profit7"], 500)
        self.assertEqual(f["floor"], 0)

    def test_each_loan_is_owed_to_the_bank_at_its_address(self):
        vantander = {"streetName": "ba:street_secondavenue", "streetNumber": 6}
        jensen = {"streetName": "ba:street_fourthavenue", "streetNumber": 17}
        nowhere = {"streetName": "ba:street_broadwaystreet", "streetNumber": 1}
        f = self.facts(Loans=coll([{"bankAddress": vantander, "remainingAmount": 1000},
                                   {"bankAddress": jensen, "remainingAmount": 250},
                                   {"bankAddress": nowhere, "remainingAmount": 30}]))
        owed = {b["id"]: b["owed"] for b in f["banks"]}
        self.assertEqual(owed, {"VantanderBankSettings": 1000, "JensenCapitalSettings": 250})
        # A loan at an address no bank has is owed all the same, overall.
        self.assertEqual(f["owed"], 1280)

    def test_the_tutorials_floor_holds_while_its_first_loan_is_asked_for(self):
        on = {"daysPerYear": 60, "tutorialEnabled": True}
        self.assertEqual(self.facts(gameVariables=on)["floor"], ba_dashboard.TUTORIAL_LOAN_FLOOR)
        done = coll([ba_dashboard.TUTORIAL_LOAN_OBJECTIVE])
        self.assertEqual(self.facts(gameVariables=on, CompletedQuestEntries=done)["floor"], 0)


class MarketTests(unittest.TestCase):
    """_store_market(): the lowest price a customer sees, from shops that stock the item."""
    RULES = {"products": {"ba:itemname_beer": {"p": 4, "w": 1, "r": 0.5, "d": 1}}}

    def market(self, *regs):
        root = {"productMarketEntries": coll([]), "BuildingRegistrations": coll(regs)}
        return ba_dashboard._store_market(Save(root, {}, "synthetic"), self.RULES, {"ba:itemname_beer"}, 1.0, 0)

    @staticmethod
    def shop(number, price, stocks=True, rival=None, mine=False):
        return {"StreetName": "ba:street_eighthstreet", "StreetNumber": number, "BusinessName": "Shop",
                "RentedByPlayer": mine, "businessOwnerRivalId": rival,
                "retailPrices": coll([{"itemName": "ba:itemname_beer", "price": price}]),
                "cachedAvailableProducts": coll(["ba:itemname_beer"] if stocks else [])}

    def test_a_rival_that_stocks_the_item_sets_the_price_and_takes_the_monopoly(self):
        row = self.market(self.shop(5, 3.5, rival="r1"))["ba:itemname_beer"]["hoods"]["ba:neighborhood_midtown"]
        self.assertEqual(row[1:3], [1, 3.5])

    def test_the_last_day_anyone_sold_the_item_there_is_kept(self):
        entry = {"itemName": "ba:itemname_beer", "importPriceIndex": 1.0, "demandValues": coll([
            {"neighborhood": "ba:neighborhood_midtown", "providers": 0, "lastDaySold": 33}])}
        root = {"productMarketEntries": coll([entry]), "BuildingRegistrations": coll([])}
        got = ba_dashboard._store_market(Save(root, {}, "synthetic"), self.RULES, {"ba:itemname_beer"}, 1.0, 0)
        self.assertEqual(got["ba:itemname_beer"]["hoods"]["ba:neighborhood_midtown"], [0, 0, None, 33])
        # A save without the field (older than build 3675) sends None.
        del entry["demandValues"]["$items"][0]["lastDaySold"]
        got = ba_dashboard._store_market(Save(root, {}, "synthetic"), self.RULES, {"ba:itemname_beer"}, 1.0, 0)
        self.assertIsNone(got["ba:itemname_beer"]["hoods"]["ba:neighborhood_midtown"][3])

    def test_the_players_own_price_counts_stocked_or_not_and_a_rivals_unstocked_price_does_not(self):
        got = self.market(self.shop(5, 3.0, stocks=False, mine=True), self.shop(9, 2.0, stocks=False, rival="r1"))
        hoods = got["ba:itemname_beer"]["hoods"]
        self.assertEqual(hoods["ba:neighborhood_midtown"][1:3], [0, 3.0])
        # The rival in Lower Manhattan prices beer but holds none: no offer, no rival seller.
        self.assertNotIn("ba:neighborhood_lowermanhattan", hoods)


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
