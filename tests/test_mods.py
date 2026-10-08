"""Mod adapters and payload integration, using synthetic saves only."""
import json
from pathlib import Path
import tempfile
import unittest

import ba_dashboard as dashboard
import ba_mods as mods
from ba_save import Names, Save, load_save
from check_profit_model import seasonal_window
from tests.es3_fixture import encode, link_company
from tests.test_building_facts import renovation


DEFAULT = "ACS5|15|1|1|1|0|1|1|1|1|1|1|1|1"
ITEM = "ba:itemname_"


def calendar_text(length=15, demand=1, anchor_day=1, anchor_phase=0):
    fields = DEFAULT.split("|")
    fields[1], fields[2], fields[4], fields[5] = map(str, (length, demand, anchor_day, anchor_phase))
    return "|".join(fields)


def save_with(data=None, day=40, rivals=19):
    root = {"Day": day, "rivalStates": {"$items": [{} for _ in range(rivals)]}}
    if data is not None:
        root["modData"] = {"$items": [{"$k": k, "$v": v} for k, v in data.items()]}
    return Save(root, {}, "synthetic.hsg")


class CalendarTests(unittest.TestCase):
    def test_default_boundaries_and_wrap(self):
        cal = mods.calendar(DEFAULT)
        # The supplied Phase rule makes day 31 autumn and day 46 winter.
        for day, season, at in ((1, 0, 1), (15, 0, 15), (16, 1, 1), (30, 1, 15),
                                (31, 2, 1), (45, 2, 15), (46, 3, 1), (60, 3, 15),
                                (61, 0, 1), (6001, 0, 1)):
            with self.subTest(day=day):
                self.assertEqual(mods.season_of(cal, day), season)
                self.assertEqual(mods.day_of_season(cal, day), at)
                self.assertGreaterEqual(mods.phase(cal, day), 0)
                self.assertLess(mods.phase(cal, day), 4)
        self.assertEqual(mods.detect(save_with({mods.SEASONS_KEY: DEFAULT}, day=15))[
            "seasons"]["left"], 0)

    def test_short_calendars_at_every_boundary(self):
        for length in (7, 1):
            cal = mods.calendar(calendar_text(length=length))
            for cycle in (-3, 0, 1, 100):
                for season in range(4):
                    start = 1 + (cycle * 4 + season) * length
                    for day, at in ((start, 1), (start + length - 1, length)):
                        with self.subTest(length=length, day=day):
                            self.assertEqual(mods.season_of(cal, day), season)
                            self.assertEqual(mods.day_of_season(cal, day), at)
                            self.assertTrue(0 <= mods.phase(cal, day) < 4)

    def test_mid_cycle_anchor_and_negative_difference(self):
        cal = mods.calendar(calendar_text(length=7, anchor_day=20, anchor_phase=2.5))
        for day, phase, season, at in ((20, 2.5, 2, 4), (13, 1.5, 1, 4),
                                      (-1, 3.5, 3, 4), (27, 3.5, 3, 4), (34, .5, 0, 4)):
            with self.subTest(day=day):
                self.assertEqual(mods.phase(cal, day), phase)
                self.assertEqual(mods.season_of(cal, day), season)
                self.assertEqual(mods.day_of_season(cal, day), at)

    def test_accepts_all_versions_and_valid_flags(self):
        for version, count in ((1, 6), (2, 7), (3, 8), (4, 11), (5, 14)):
            fields = DEFAULT.split("|")[:count]
            fields[0] = f"ACS{version}"
            with self.subTest(version=version):
                self.assertEqual(mods.calendar("|".join(fields)),
                                 {"length": 15, "demand": True, "anchorDay": 1, "anchorPhase": 0.0})
                for flag in (2, 3, 6, 7, 8, 9, 11, 12):
                    if flag < count:
                        off = fields.copy()
                        off[flag] = "0"
                        self.assertIsNotNone(mods.calendar("|".join(off)))

    def test_rejects_bad_calendars(self):
        invalid = [None, {}, "", DEFAULT.replace("ACS5", "ACS6")]
        for version, count in ((1, 6), (2, 7), (3, 8), (4, 11), (5, 14)):
            fields = DEFAULT.split("|")[:count]
            fields[0] = f"ACS{version}"
            invalid.extend(("|".join(fields[:-1]), "|".join(fields + ["1"])))
            for flag in (2, 3, 6, 7, 8, 9, 11, 12):
                if flag < count:
                    bad = fields.copy()
                    bad[flag] = "2"
                    invalid.append("|".join(bad))
        for index, values in ((1, ("0", "-1", "abc", "1.5")),
                              (4, ("abc", "1.5")), (5, ("4", "nan", "inf", "-inf", "-0.5", "abc"))):
            for value in values:
                fields = DEFAULT.split("|")
                fields[index] = value
                invalid.append("|".join(fields))
        for value in invalid:
            with self.subTest(value=value):
                self.assertIsNone(mods.calendar(value))


class SalesTests(unittest.TestCase):
    def test_complete_factor_table_against_product_catalogue(self):
        expected = {}
        groups = (
            ((1, .85, 1.05, 1.1), ("cupofcoffee", "cupoftea")),
            ((1, 1.25, .95, .8), ("icecream",)),
            ((1, 1.15, 1, .85), ("sodacan", "salad")),
            ((.95, .95, .95, 1.15), ("cheapgift", "expensivegift")),
            ((1.2, 1, .95, .85), ("cheapflower", "expensiveflower")),
            ((1, 1, 1, 1.15), ("cheapjewelry", "expensivejewelry", "bottleofwine")),
            ((1, 1.15, 1, 1), ("beer",)),
            ((1, 1, 1.1, 1), tuple(style + price + gender + "clothing"
                                   for style in ("classic", "modern")
                                   for price in ("cheap", "expensive") for gender in ("female", "male"))),
            ((1.1, 1, 1, 1), ("smartphone1", "smartphone2", "smartwatch1", "smartwatch2",
                               "headphones01", "earbuds01")),
        )
        for factors, names in groups:
            expected.update({ITEM + name: factors for name in names})
        self.assertEqual(len(expected), 27)
        self.assertEqual(mods.SEASON_FACTORS, expected)
        products = dashboard.load_store_rules()["products"]
        cal = mods.calendar(DEFAULT)
        for item, factors in expected.items():
            self.assertIn(item, products)
            for season, factor in enumerate(factors):
                with self.subTest(item=item, season=season):
                    self.assertEqual(mods.factor(item, cal, 1 + season * 15), factor)
        self.assertEqual(mods.factor(ITEM + "paperbag", cal, 16), 1)
        self.assertEqual(mods.factor(ITEM + "icecream", None, 16), 1)

    def test_switched_off_demand_keeps_ratios_and_detection(self):
        text = calendar_text(demand=0)
        cal = mods.calendar(text)
        for item in (*mods.SEASON_FACTORS, ITEM + "paperbag"):
            for day in (1, 16, 31, 46):
                with self.subTest(item=item, day=day):
                    self.assertEqual(mods.factor(item, cal, day), 1)
                    for base in (0, .35, 1):
                        self.assertEqual(mods.sales_ratio(base, item, cal, day), base)
        self.assertEqual(mods.detect(save_with({mods.SEASONS_KEY: text}, day=19))["seasons"],
                         {"season": "summer", "day": 4, "length": 15, "left": 11, "demand": False})

    def test_zero_base_only_becomes_one_when_rescaled(self):
        cal = mods.calendar(DEFAULT)
        self.assertEqual(mods.sales_ratio(0, ITEM + "icecream", cal, 16), 1.25)
        self.assertEqual(mods.sales_ratio(.35, ITEM + "icecream", cal, 16), .4375)
        self.assertEqual(mods.sales_ratio(0, ITEM + "icecream", cal, 1), 0)
        self.assertEqual(mods.sales_ratio(.35, ITEM + "icecream", cal, 1), .35)
        self.assertEqual(mods.sales_ratio(0, ITEM + "paperbag", cal, 16), 0)


class DetectionTests(unittest.TestCase):
    def test_mod_data_dereferences_values_and_ignores_invalid_keys(self):
        save = save_with({mods.SEASONS_KEY: {"$ref": 7}})
        save.refs[7] = DEFAULT
        save.root["modData"]["$items"].extend([None, {"$k": 2, "$v": "bad"}])
        self.assertEqual(mods.mod_data(save), {mods.SEASONS_KEY: DEFAULT})
        self.assertEqual(mods.seasons(save), mods.calendar(DEFAULT))
        self.assertEqual(mods.mod_data(save_with()), {})
        self.assertIsNone(mods.seasons(save_with()))
        self.assertIsNone(mods.seasons(save_with({mods.SEASONS_KEY: "bad"})))

    def test_vanilla_and_rival_threshold(self):
        self.assertEqual(mods.detect(save_with()), {})
        for count in (19, 20, 49):
            with self.subTest(count=count):
                self.assertEqual(mods.detect(save_with(rivals=count)),
                                 {} if count == 19 else {"rivals": count})

    def test_economy_settlement_window(self):
        for settled in (40, 39, 38, 37, 41):
            with self.subTest(settled=settled):
                data = json.dumps({"Version": 14, "LastSettlementDay": settled})
                self.assertEqual(mods.detect(save_with({mods.ECONOMY_KEY: data})),
                                 {"economyExpansion": {"settled": settled}} if 38 <= settled <= 40 else {})

    def test_economy_rejects_malformed_and_non_integer_settlements(self):
        invalid = ["{", "[]", "null", "40", "{}", {"LastSettlementDay": 40}]
        invalid += [json.dumps({"Version": 14, "LastSettlementDay": value})
                    for value in (None, "40", 40.0, True, False)]
        for value in invalid:
            with self.subTest(value=value):
                self.assertEqual(mods.detect(save_with({mods.ECONOMY_KEY: value})), {})

    def test_seasons_and_retail_detection_together(self):
        for version in (3, 4, 5):
            with self.subTest(version=version):
                data = {mods.SEASONS_KEY: DEFAULT, mods.RETAIL_KEY: renovation(version)}
                self.assertEqual(mods.detect(save_with(data, day=19, rivals=49)), {
                    "seasons": {"season": "summer", "day": 4, "length": 15, "left": 11, "demand": True},
                    "rivals": 49, "retailExpansion": {"renovated": 1}})
        for value in ("garbage", "RCR5:not-base64"):
            with self.subTest(value=value):
                self.assertEqual(mods.detect(save_with({mods.RETAIL_KEY: value})),
                                 {"retailExpansion": {"renovated": None}})


class IntegrationTests(unittest.TestCase):
    def test_core_and_materialized_payload_use_seasons_and_optional_key_order(self):
        with tempfile.TemporaryDirectory() as folder:
            root = link_company()
            root["Day"] = 19
            path = Path(folder, "synthetic.hsg")
            path.write_bytes(encode(root))
            vanilla_build = dashboard.build_core(load_save(str(path)), Names({}), None)
            self.assertNotIn("mods", vanilla_build.core)
            vanilla = dashboard.materialize_all(vanilla_build)
            self.assertNotIn("mods", vanilla)
            self.assertIn("mods", dashboard.OPTIONAL_KEYS)
            self.assertEqual(list(vanilla), [k for k in dashboard.PAYLOAD_KEYS if k != "mods"])
            root["modData"] = [{"$k": mods.SEASONS_KEY, "$v": DEFAULT}]
            path.write_bytes(encode(root))
            build = dashboard.build_core(load_save(str(path)), Names({}), None)
            self.assertEqual(build.core["mods"]["seasons"]["season"], "summer")
            payload = dashboard.materialize_all(build)
            self.assertEqual(list(payload), list(dashboard.PAYLOAD_KEYS))
            self.assertEqual(list(payload)[:2], ["meta", "mods"])
            # openStore.market covers all plannable products, including ice cream,
            # even though link_company's own shops are gift shops.
            self.assertAlmostEqual(vanilla["openStore"]["market"][ITEM + "icecream"]["r"], .35)
            self.assertAlmostEqual(payload["openStore"]["market"][ITEM + "icecream"]["r"], .35 * 1.25)
            unaffected = [k for k in vanilla["openStore"]["market"] if k not in mods.SEASON_FACTORS]
            self.assertTrue(unaffected)
            for item in unaffected:
                self.assertEqual(payload["openStore"]["market"][item]["r"],
                                 vanilla["openStore"]["market"][item]["r"])
            self.assertEqual(json.loads(json.dumps(payload))["mods"], payload["mods"])

    def test_seasonal_window_averages_finished_days_across_boundary(self):
        market = {ITEM + "icecream": {"r": .4375, "p": 7}, ITEM + "paperbag": {"r": .123}}
        cal = mods.calendar(DEFAULT)
        # Day 20 uses finished days 6..19: ten spring, four summer.
        self.assertEqual(dashboard.OWN_PROFIT_DAYS, 14)
        seasonal_window({"market": market}, cal, 20)
        self.assertEqual(market[ITEM + "icecream"]["r"], round((10 * .35 + 4 * .4375) / 14, 6))
        self.assertEqual(market[ITEM + "icecream"]["p"], 7)
        self.assertEqual(market[ITEM + "paperbag"], {"r": .123})


if __name__ == "__main__":
    unittest.main()
