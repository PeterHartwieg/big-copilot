"""Company-number fixes from the 25 Sep 2026 audit (issue #106), on synthetic
fixtures only: a home with no statement yet, two shops with one name, the
payload without `weekly`, the Products averages, story rival names, and a
station held by someone's second skill.
"""
import os
import tempfile
import unittest
from unittest.mock import patch

import es3_fixture
from ba_dashboard import (SPECIAL_RIVAL_NAMES, _hourly, _products, _residential_addresses,
                          _rival_names, _serves, extract)
from ba_save import Names, Save, load_save
from test_office_staffing import LAWYER, MONDAY, REGISTER, SERVICE, SHOP, building, shift, site

FLAT = ("ba:street_tenthstreet", 2)
TABLE = {FLAT: {"s": FLAT[0], "n": FLAT[1], "h": "greenwichvillage", "t": "residential",
                "z": "A1", "m": 204, "x": 3}}


def flat_registration():
    """A flat rented today: the game registers it with no business in it."""
    return {"StreetName": FLAT[0], "StreetNumber": FLAT[1], "RentedByPlayer": True,
            "RentPerDay": 34.0, "businessTypeName": "ba:businesstype_empty",
            "itemInstances": [], "scheduleDays": [], "orderHistory": [], "retailPrices": []}


def extract_company(change, table=None):
    """extract() over tests/es3_fixture.py's company after `change(root)`."""
    root = es3_fixture.link_company()
    change(root)
    with tempfile.TemporaryDirectory() as folder:
        path = os.path.join(folder, "company.hsg")
        with open(path, "wb") as fh:
            fh.write(es3_fixture.encode(root))
        save = load_save(path)
        if table is None:
            return extract(save, Names({}), None)
        with patch("ba_dashboard.load_buildings", return_value=table):
            return extract(save, Names({}), None)


class NewHomeTests(unittest.TestCase):
    """EX-1: a home rented today has no residential statement yet."""

    def test_a_residential_building_is_a_home_before_its_first_statement(self):
        save = Save({}, {}, "")
        with patch("ba_dashboard.load_buildings", return_value=TABLE):
            found = _residential_addresses(save, [], [flat_registration()])
        self.assertEqual(found, {FLAT})

    def test_the_new_home_is_a_home_not_a_vacant_lease(self):
        data = extract_company(lambda root: root["BuildingRegistrations"].append(flat_registration()),
                               table=TABLE)
        self.assertEqual([h["key"] for h in data["homes"]], ["ba:street_tenthstreet#2"])
        self.assertNotIn("ba:street_tenthstreet#2", [b["key"] for b in data["businesses"]])
        self.assertFalse([a for a in data["alerts"] + data["minor"]["rows"] if "vacant" in a["text"]])


class SameNameShopTests(unittest.TestCase):
    """NEW-1: two staffed shops with one name are two rows, each its own count."""

    def test_two_shops_with_one_name_keep_their_own_staff_counts(self):
        def rename(root):
            root["BuildingRegistrations"][1]["BusinessName"] = root["BuildingRegistrations"][0]["BusinessName"]
        data = extract_company(rename)
        rows = sorted((r["key"], r["site"], r["count"]) for r in data["staff"]["sites"])
        self.assertEqual(rows, [("ba:street_broadway#2", "HART. Gifts", 1),
                                ("ba:street_secondavenue#10", "HART. Gifts", 2)])


class WeeklyGoneTests(unittest.TestCase):
    """TD-10: nothing read `weekly`, and a save without its fields still extracts."""

    def test_the_payload_has_no_weekly_and_needs_no_income_history(self):
        def drop(root):
            del root["playerWeeklyIncomeHistory"]
            del root["playerNumberOfBusinessesHistory"]
        self.assertNotIn("weekly", extract_company(drop))


class ProductsTests(unittest.TestCase):
    """EX-6: the average price is revenue over the unrounded daily units."""

    def test_a_slow_line_prices_on_what_it_sells_not_on_a_rounded_zero(self):
        def line(revenue, rate):
            return {"slug": "ba:itemname_candle", "item": "Candle", "revenue": revenue, "rate": rate,
                    "soldPerDay": round(rate), "soldPerWeek": round(rate * 7), "units": 10}
        shops = [{"lines": [line(4.0, 0.4)]}, {"lines": [line(14.0, 1.4)]}]
        [product] = _products(shops)
        self.assertEqual(product["price"], 10.0)  # 18 over 1.8, not 18 over 0 + 1
        self.assertEqual(product["units"], 2)
        [alone] = _products(shops[:1])
        self.assertEqual((alone["price"], alone["units"]), (10.0, 0))


class RivalNameTests(unittest.TestCase):
    """EX-9: a story rival is named by its fixed id, whatever keys it holds."""

    def test_the_fixed_table_wins_over_another_rivals_message_key(self):
        ingrid = next(k for k, v in SPECIAL_RIVAL_NAMES.items() if v == "Ingrid Schneider")
        save = Save({"specialRivalStates": {"$items": [
            {"rivalId": ingrid, "sentMessageKeys": {"$items": [
                "rivals_jessica_johnson_lowdemand", "rivals_ingrid_schneider_entrance"]}},
            {"rivalId": "someoneelse", "sentMessageKeys": {"$items": ["rivals_ada_lovelace_entrance"]}},
        ]}}, {}, "")
        names = _rival_names(save, {ingrid: 3, "someoneelse": 7})
        self.assertEqual(names, {3: "Ingrid Schneider", 7: "Ada Lovelace"})


class SecondSkillTests(unittest.TestCase):
    """ST-3: a station is held by anyone with its skill, not only their best."""

    def test_serves_reads_every_skill_held(self):
        self.assertTrue(_serves("retail", [LAWYER, SERVICE], SERVICE))
        self.assertFalse(_serves("retail", [LAWYER], SERVICE))
        self.assertTrue(_serves("retail", SERVICE, SERVICE))
        self.assertFalse(_serves("retail", None, None))
        # An office goes by the top skill: a cleaner first is a cleaner.
        self.assertFalse(_serves("office", ["ba:skill_cleaning", LAWYER]))
        self.assertTrue(_serves("office", [LAWYER, "ba:skill_cleaning"]))

    def test_a_register_worked_by_a_second_skill_counts(self):
        crew = {"s": [LAWYER, SERVICE]}
        hourly = {h: 20 if 9 <= h < 17 else 0 for h in range(24)}
        b = building(SHOP, [(1, REGISTER)], [shift("s", 1, 9, 17)], hourly, door=30, name="Mart")
        [grid] = _hourly(Save({}, {}, ""), [b], [site("retail", name="Mart", basket=12.0)],
                         {REGISTER: (SERVICE, 20)}, set(), crew, Names({SERVICE: "Customer Service"}))
        self.assertEqual(grid["staffed"][MONDAY][10], 20)


if __name__ == "__main__":
    unittest.main()
