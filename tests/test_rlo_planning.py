"""Synthetic shape and hostile-input checks for the owner planning contracts."""
import copy
import unittest

from ba_rlo_planning import SHAPES, VALIDATORS


def sample(shape):
    if isinstance(shape, dict):
        return {key: sample(child) for key, child in shape.items()}
    if isinstance(shape, tuple):
        if shape[0] == "nullable":
            return None
        if shape[0] == "enum":
            return shape[1]
        return []
    return {"int": 1, "uint": 1, "boolean": False, "text": "synthetic", "decimal": "0.000125", "null": None}[shape]


class PlanningContracts(unittest.TestCase):
    def test_ready_footfall_requires_all_fields_even_without_price_tolerance(self):
        value = sample(SHAPES["footfall"])
        site = sample(SHAPES["footfall"]["sites"][1])
        site["status"] = "ready"
        value["sites"] = [site]
        value["priceTolerance"] = None
        with self.assertRaises(ValueError):
            VALIDATORS["footfall"](value)

    def test_all_modules_accept_shape_and_additive_fields(self):
        for name, shape in SHAPES.items():
            with self.subTest(module=name):
                value = sample(shape)
                value["futureOwnerField"] = {"version": 2}
                self.assertIs(VALIDATORS[name](value), value)

    def test_every_required_field_is_checked(self):
        for name, shape in SHAPES.items():
            for field in shape:
                with self.subTest(module=name, field=field):
                    value = sample(shape)
                    del value[field]
                    with self.assertRaises((ValueError, KeyError)):
                        VALIDATORS[name](value)

    def test_wrong_model_fails_locally(self):
        for name, shape in SHAPES.items():
            if "model" in shape:
                value = sample(shape)
                value["model"] = "rlo-next-version"
                with self.assertRaises(ValueError):
                    VALIDATORS[name](value)

    def test_duplicate_address_and_item_identity(self):
        for name, field in (("company", "sites"), ("prices", "items"), ("education", "courses")):
            value = sample(SHAPES[name])
            row = sample(SHAPES[name][field][1])
            value[field] = [row, copy.deepcopy(row)]
            with self.assertRaises(ValueError):
                VALIDATORS[name](value)

    def test_prices_preserve_subcent_and_reject_bad_decimal(self):
        value = sample(SHAPES["prices"])
        row = sample(SHAPES["prices"]["items"][1])
        value["items"] = [row]
        self.assertEqual(VALIDATORS["prices"](value)["items"][0]["ownAmount"], "0.000125")
        for invalid in ("NaN", "Infinity", "1e9999", "1e-9999", "-1", 1.2, "1" * 65):
            row["ownAmount"] = invalid
            with self.assertRaises(ValueError):
                VALIDATORS["prices"](value)

    def test_boolean_is_not_integer_and_unknown_fields_are_bounded(self):
        value = sample(SHAPES["prices"])
        value["levelThousandths"] = True
        with self.assertRaises(ValueError):
            VALIDATORS["prices"](value)
        value["levelThousandths"] = 1000
        value["future"] = "x" * 1025
        with self.assertRaises(ValueError):
            VALIDATORS["prices"](value)

    def test_outside_scope_and_negative_refund(self):
        value = sample(SHAPES["outsideStatements"])
        row = sample(SHAPES["outsideStatements"]["rows"][1])
        row.update(scope="company", address=None, cents=-1234)
        value["rows"] = [row]
        self.assertEqual(VALIDATORS["outsideStatements"](value)["rows"][0]["cents"], -1234)
        row["scope"] = "place"
        with self.assertRaises(ValueError):
            VALIDATORS["outsideStatements"](value)


if __name__ == "__main__":
    unittest.main()
