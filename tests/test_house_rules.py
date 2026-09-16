"""House rules: the difficulty a game is played on, and its settings against Normal."""
import struct
import unittest

from ba_dashboard import _difficulty
from ba_save import Save

# The game's own presets at builds 3675 and 3680, from its DifficultySetting assets. A save
# stores the multipliers as float32, so they come back as 0.550000011920929.
PRESETS = {
    1: {"startingMoney": 15000, "taxPercentage": 2, "marketPriceMultiplier": 0.7,
        "employeeHourlySalaryMultiplier": 0.5, "bankInterestMultiplier": 0.7,
        "rivalsDifficultyMultiplier": 0.7, "baseCustomerPromotionMultiplier": 0.75,
        "wholesaleUrgentFeeMultiplier": 0.1, "importerUrgentFeeMultiplier": 0.5,
        "exportMultiplier": 0.8, "sellingMultiplier": 0.8},
    2: {"startingMoney": 10000, "taxPercentage": 5, "marketPriceMultiplier": 0.7,
        "employeeHourlySalaryMultiplier": 0.7, "bankInterestMultiplier": 0.7,
        "rivalsDifficultyMultiplier": 1.0, "baseCustomerPromotionMultiplier": 0.55,
        "wholesaleUrgentFeeMultiplier": 0.2, "importerUrgentFeeMultiplier": 0.75,
        "exportMultiplier": 0.65, "sellingMultiplier": 0.75},
    3: {"startingMoney": 4200, "taxPercentage": 30, "marketPriceMultiplier": 1.3,
        "employeeHourlySalaryMultiplier": 1.0, "bankInterestMultiplier": 1.3,
        "rivalsDifficultyMultiplier": 1.2, "baseCustomerPromotionMultiplier": 0.5,
        "wholesaleUrgentFeeMultiplier": 0.3, "importerUrgentFeeMultiplier": 1.0,
        "exportMultiplier": 0.5, "sellingMultiplier": 0.5},
}


def float32(v):
    return struct.unpack("<f", struct.pack("<f", v))[0] if isinstance(v, float) else v


def rules_of(slot, **overrides):
    variables = {"difficulty": slot, **PRESETS.get(slot, PRESETS[2]), **overrides}
    variables = {k: float32(v) for k, v in variables.items()}
    return _difficulty(Save({"gameVariables": variables}, {}, "test.hsg"))


class HouseRulesTests(unittest.TestCase):
    def test_a_hard_game_is_hard_and_every_setting_is_harder_than_normal(self):
        h = rules_of(3)
        self.assertEqual(h["label"], "Hard")
        self.assertEqual((h["harder"], h["easier"]), (10, 0))
        self.assertEqual(h["startingMoney"], 4200)
        fee = next(r for r in h["rules"] if r["name"] == "Wholesale urgent fee")
        self.assertEqual((fee["value"], fee["normal"], fee["lean"]), (0.3, 0.2, "harder"))

    def test_a_normal_game_moves_nothing(self):
        h = rules_of(2)
        self.assertEqual(h["label"], "Normal")
        self.assertEqual((h["harder"], h["easier"]), (0, 0))
        self.assertTrue(all(r["lean"] == "level" for r in h["rules"]))

    def test_an_easy_game_is_never_harder_than_normal(self):
        h = rules_of(1)
        self.assertEqual(h["label"], "Easy")
        self.assertEqual(h["harder"], 0)
        self.assertEqual(h["easier"], 8)  # public prices and bank interest match Normal

    def test_a_custom_game_is_custom_whatever_its_sliders_say(self):
        self.assertEqual(rules_of(0)["label"], "Custom")
        h = rules_of(0, taxPercentage=51, wholesaleUrgentFeeMultiplier=0.1)
        self.assertEqual((h["harder"], h["easier"]), (1, 1))
        tax = next(r for r in h["rules"] if r["name"] == "Tax rate")
        self.assertEqual((tax["value"], tax["normal"], tax["unit"]), (51, 5, "%"))

    def test_base_customer_promotion_uses_the_games_wording(self):
        rules = rules_of(3)["rules"]
        self.assertNotIn("Base customers", [r["name"] for r in rules])
        rule = next(r for r in rules if r["name"] == "Base customer promotion")
        self.assertEqual(rule["what"], "base level of customers without traffic or marketing")
        self.assertEqual((rule["value"], rule["normal"], rule["lean"]), (0.5, 0.55, "harder"))

    def test_an_older_save_skips_the_sliders_it_does_not_have(self):
        old = {"difficulty": 3, "startingMoney": 4200, "taxPercentage": 30,
               "marketPriceMultiplier": float32(1.3), "employeeHourlySalaryMultiplier": float32(1.3),
               "bankInterestMultiplier": float32(1.3), "exportMultiplier": 0.0,
               "rivalsDifficultyMultiplier": 0.0}
        h = _difficulty(Save({"gameVariables": old}, {}, "old.hsg"))
        self.assertEqual(h["label"], "Hard")
        names = [r["name"] for r in h["rules"]]
        # An unset multiplier reads as 0; rival attacks at 0 are switched off.
        self.assertNotIn("Export price", names)
        self.assertIn("Rival attacks", names)
        self.assertEqual(h["harder"], 4)
        self.assertEqual(h["easier"], 1)

    def test_a_zero_tax_rate_is_a_setting(self):
        h = rules_of(0, taxPercentage=0)
        tax = next(r for r in h["rules"] if r["name"] == "Tax rate")
        self.assertEqual(tax["lean"], "easier")

    def test_a_missing_or_unknown_slot_is_not_passed_off_as_custom(self):
        self.assertEqual(_difficulty(Save({}, {}, "empty.hsg"))["label"], "Unknown")
        # A preset a later build adds still gets its settings compared with Normal.
        h = rules_of(4, taxPercentage=40)
        self.assertEqual(h["label"], "Unknown")
        self.assertEqual((h["harder"], h["easier"]), (1, 0))


if __name__ == "__main__":
    unittest.main()
