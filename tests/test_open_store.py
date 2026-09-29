"""Expansion › Open a store: the facts a plan is worked out from (_open_store(),
docs/open-a-store-scope.md, phase 2).

The rules are the game's own: what a type needs to open, one item per customer
demand, tills and displays sized to the building's customer capacity, the
interior score Midtown asks for, the neighbourhood demand a new seller moves,
and the arrivals each open hour starts from. The fixtures are synthetic: small
hand-made rule and price tables, and tests/save_fixtures.py's trading company
for the payload end to end. Never a real save.
"""
import collections
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


class RequiredPlacedTests(unittest.TestCase):
    def rows(self, placed, sqm=150):
        return {r[0]: r[1:] for r in ba_dashboard.required_placed(collections.Counter(placed), SHOP, RULES, PRICES, sqm)}

    def test_a_bare_shop_lacks_everything(self):
        self.assertEqual(self.rows({}), {"anyprimaryproduct": [1, 0], "pointofsales": [1, 0],
                                         "stackofshoppingbaskets": [1, 0], "sinks": [2, 0]})

    def test_each_requirement_counts_its_items_by_name_or_tag(self):
        got = self.rows({"ba:itemname_bigtill": 1, "ba:itemname_till": 2, "ba:itemname_baskets": 1,
                         "ba:itemname_sink": 1, "ba:itemname_shelf": 3, "ba:itemname_speaker": 4})
        self.assertEqual(got["pointofsales"], [1, 3])
        self.assertEqual(got["stackofshoppingbaskets"], [1, 1])
        self.assertEqual(got["sinks"], [2, 1])
        self.assertEqual(got["anyprimaryproduct"], [1, 3])

    def test_a_sink_is_needed_per_area_at_most_the_cap(self):
        self.assertEqual(self.rows({}, 60)["sinks"], [1, 0])
        self.assertEqual(self.rows({}, 900)["sinks"], [2, 0])
        self.assertEqual(self.rows({}, None)["sinks"], [1, 0])

    def test_a_per_area_rule_without_a_cap_is_not_capped(self):
        rules = {"types": {SHOP: {**RULES["types"][SHOP], "rq": [{"n": "sinks", "t": SINK, "sq": 100}]}}}
        got = ba_dashboard.required_placed(collections.Counter(), SHOP, rules, PRICES, 950)
        self.assertEqual(got, [["sinks", 10, 0]])

    def test_a_requirement_naming_a_product_is_met_by_a_display_that_holds_it(self):
        rules = {"types": {SHOP: {**RULES["types"][SHOP], "rq": [{"n": "shelfwithbeer", "i": ["ba:itemname_beer"]}]}},
                 "furniture": RULES["furniture"]}
        rows = lambda placed, available=None: ba_dashboard.required_placed(
            collections.Counter(placed), SHOP, rules, PRICES, 100, available)
        self.assertEqual(rows({}), [["shelfwithbeer", 1, 0]])
        self.assertEqual(rows({"ba:itemname_shelf": 2}), [["shelfwithbeer", 1, 0]])
        self.assertEqual(rows({"ba:itemname_fridge": 2}), [["shelfwithbeer", 1, 2]])

    def test_a_product_the_shop_lists_as_available_meets_the_product_requirements(self):
        rules = {"types": {SHOP: {**RULES["types"][SHOP], "rq": [
            {"n": "anyprimaryproduct", "any": 1}, {"n": "shelfwithbeer", "i": ["ba:itemname_beer"]}]}},
            "furniture": RULES["furniture"]}
        got = lambda available: {r[0]: r[2] for r in ba_dashboard.required_placed(
            collections.Counter(), SHOP, rules, PRICES, 100, available)}
        self.assertEqual(got(set()), {"anyprimaryproduct": 0, "shelfwithbeer": 0})
        self.assertEqual(got({"ba:itemname_whisky"}), {"anyprimaryproduct": 1, "shelfwithbeer": 0})
        self.assertEqual(got({"ba:itemname_beer"}), {"anyprimaryproduct": 1, "shelfwithbeer": 1})

    def test_a_fee_paid_in_game_has_no_row(self):
        rules = {"types": {SHOP: {**RULES["types"][SHOP], "rq": [{"n": "paidlicensingfees", "lic": 1}]}}}
        self.assertEqual(ba_dashboard.required_placed(collections.Counter(), SHOP, rules, PRICES, 100), [])


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
        self.assertEqual(row[1:], [1, 3.5])

    def test_the_players_own_cheap_shop_counts_and_an_unstocked_price_does_not(self):
        got = self.market(self.shop(5, 3.0, mine=True), self.shop(9, 2.0, stocks=False, rival="r1"))
        hoods = got["ba:itemname_beer"]["hoods"]
        self.assertEqual(hoods["ba:neighborhood_midtown"][1:], [0, 3.0])
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

    def test_every_running_business_of_a_planned_type_reports_its_placed_furniture(self):
        built = self.facts["built"]
        json.dumps(built)
        planned = set(self.facts["types"])
        expected = {b["key"] for b in self.payload["businesses"] if b["typeSlug"] in planned and b["status"] != "vacant"}
        self.assertEqual(set(built), expected)
        for row in built.values():
            self.assertIsInstance(row["seating"], bool)
            self.assertGreaterEqual(row["placed"], 0)
            for name, need, have in row["req"]:
                self.assertGreaterEqual(need, 1)
                self.assertGreaterEqual(have, 0)

    def test_every_business_reports_its_running_campaigns_and_station_shifts(self):
        for b in self.payload["businesses"]:
            self.assertIsInstance(b["marketingOn"], list, b["key"])
            self.assertTrue(set(b["marketingOn"]) <= {c[0] for c in ba_dashboard.MARKETING_CAMPAIGNS})
            self.assertIsInstance(b["stationShifts"], int, b["key"])

    def test_a_players_own_shop_carries_what_the_model_needs_to_price_it(self):
        own = [row for rows in self.facts["own"].values() for row in rows]
        for row in own:
            for key in ("key", "hood", "cap", "initial", "promo", "marketing", "open", "actual", "days"):
                self.assertIn(key, row)
            self.assertGreaterEqual(row["days"], 3)


if __name__ == "__main__":
    unittest.main()
