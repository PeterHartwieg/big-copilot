"""The ES3 tags real saves use and the plain fixture never wrote, round-tripped.

tests/es3_fixture.py writes Python ints as int32 and floats as doubles, so
ba_save's byte, enum, float, packed-array and type-slot branches ran only on
real saves. One synthetic tree uses every one of them; load_save() must hand
it back as the reader documents. Synthetic only: never a real save.
"""
from __future__ import annotations

import gzip
import os
import sys
import tempfile
import unittest
import warnings

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))

from tests.es3_fixture import (  # noqa: E402
    Byte, Enum, Float32, Instance, NullInstance, Packed, Ref, Shared, Unnamed, encode,
    SByte, Short, UShort, UInt, Long, Decimal, Char, Guid,
    ExternalReferenceByIndex, ExternalReferenceByGuid, ExternalReferenceByString,
)
from ba_save import PROP_TAGS, STRING_CACHE_CHARS, SaveFormatError, load_save  # noqa: E402

BIG_ENUM = 2**40 + 3  # needs all eight bytes of the int64


def every_tag() -> dict:
    return {
        "Money": 12.5,                      # 0x21 double (the plain path)
        "Day": 34,                          # 0x17 int32
        "Name": "Tag Co",                   # 0x27 string
        "Nothing": None,                    # 0x2d null
        "Open": True,                       # 0x2b bool
        "level": Byte(200),                 # 0x11 byte
        "kind": Enum(BIG_ENUM),             # 0x1d enum
        "rate": Float32(1.25),              # 0x1f float
        "levels": [Byte(1), Byte(255)],     # 0x12 / 0x1e / 0x20 unnamed in a collection
        "kinds": [Enum(0), Enum(-1)],
        "rates": [Float32(0.5), Float32(-2.0)],
        "color": {"rgba": Unnamed(Byte(10), Byte(20), Byte(30), Byte(255))},
        "flags": Packed("System.Boolean[]", [True, False, True], slot=1),
        "counts": Packed("System.Int32[]", [3, -7, 2**31 - 1], slot=2),
        "longs": Packed("System.Int64[]", [2**40, -1], slot=3),
        "singles": Packed("System.Single[]", [0.5, 1.75], slot=4),
        "doubles": Packed("System.Double[]", [0.1, -3.5], slot=5),
        "bytes": Packed("System.Byte[]", raw=b"\x01\x02\x03", size=1, slot=6),
        "empty": Packed("System.Int32[]", [], slot=7),
        # A second array of an already-seen type reuses slot 2: header 30.
        "moreCounts": Packed("System.Int32[]", [9], slot=2, reuse=True),
        # A typed class instance defines slot 8; a struct and a second class
        # instance of the same type reuse it, and a Ref points at the latter.
        "home": Instance("Address", {"streetName": "ba:street_a", "streetNumber": 1}, slot=8, ref_id=40),
        "work": Instance("Address", {"streetName": "ba:street_b", "streetNumber": 2}, slot=8, reuse=True),
        "depot": Instance("Address", {"streetName": "ba:street_c", "streetNumber": 3}, slot=8,
                          ref_id=41, reuse=True),
        "depotAgain": Ref(41),
        "old": Shared(42, "Loan", {"amount": 5.0}),
        "none00": NullInstance(0x00),
        "none2d": NullInstance(0x2D, ref=False),
    }


class EveryTagRoundTrip(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        path = os.path.join(cls.tmp.name, "tags.hsg")
        with open(path, "wb") as fh:
            fh.write(encode(every_tag()))
        cls.save = load_save(path)
        cls.root = cls.save.root

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_scalars(self):
        r = self.root
        self.assertEqual((r["Money"], r["Day"], r["Name"], r["Nothing"], r["Open"]),
                         (12.5, 34, "Tag Co", None, True))
        self.assertIs(r["Open"], True)

    def test_byte_enum_and_float(self):
        r = self.root
        self.assertEqual(r["level"], 200)
        self.assertIsInstance(r["level"], int)
        self.assertEqual(r["kind"], BIG_ENUM)
        self.assertEqual(r["rate"], 1.25)
        self.assertIsInstance(r["rate"], float)

    def test_unnamed_forms_in_a_collection(self):
        r = self.root
        self.assertEqual(r["levels"], {"$items": [1, 255]})
        self.assertEqual(r["kinds"], {"$items": [0, -1]})
        self.assertEqual(r["rates"], {"$items": [0.5, -2.0]})

    def test_unnamed_values_in_a_body(self):
        self.assertEqual(self.root["color"], {"$vals": [10, 20, 30, 255]})

    def test_packed_arrays(self):
        r = self.root
        self.assertEqual(r["flags"], {"$type": "System.Boolean[]", "$items": [True, False, True]})
        self.assertEqual(r["counts"]["$items"], [3, -7, 2**31 - 1])
        self.assertEqual(r["longs"]["$items"], [2**40, -1])
        self.assertEqual(r["singles"]["$items"], [0.5, 1.75])
        self.assertEqual(r["doubles"]["$items"], [0.1, -3.5])
        self.assertEqual(r["empty"], {"$type": "System.Int32[]", "$items": []})

    def test_an_unknown_packed_element_type_keeps_its_bytes(self):
        self.assertEqual(self.root["bytes"]["$items"], [b"\x01", b"\x02", b"\x03"])

    def test_a_reused_slot_carries_its_type(self):
        r = self.root
        self.assertEqual(r["moreCounts"], {"$type": "System.Int32[]", "$items": [9]})
        self.assertEqual(r["home"], {"$type": "Address", "$id": 40,
                                     "streetName": "ba:street_a", "streetNumber": 1})
        self.assertEqual(r["work"], {"$type": "Address", "streetName": "ba:street_b", "streetNumber": 2})
        self.assertEqual(r["depot"]["$type"], "Address")
        self.assertEqual(r["depot"]["$id"], 41)

    def test_references_resolve(self):
        r = self.root
        self.assertEqual(r["depotAgain"], {"$ref": 41})
        self.assertIs(self.save.deref(r["depotAgain"]), r["depot"])
        self.assertEqual(self.save.address(r["depotAgain"]), ("ba:street_c", 3))
        self.assertEqual(set(self.save.refs), {40, 41, 42})
        self.assertEqual(r["old"], {"$type": "Loan", "$id": 42, "amount": 5.0})

    def test_null_instance_heads(self):
        self.assertIsNone(self.root["none00"])
        self.assertIsNone(self.root["none2d"])

    def test_the_wire_bytes_are_the_documented_ones(self):
        """Spot-check a few encodings against ba_save's module docstring."""
        stream = gzip.decompress(encode({"b": Byte(7), "e": Enum(1), "f": Float32(1.0),
                                         "p": Packed("System.Int32[]", [5], slot=3, reuse=True)}))
        key = lambda k: b"\x01\x01\x00\x00\x00" + k.encode("utf-16-le")  # noqa: E731
        self.assertEqual(
            stream,
            b"\x02\x2e"
            + b"\x11" + key("b") + b"\x07"
            + b"\x1d" + key("e") + (1).to_bytes(8, "little")
            + b"\x1f" + key("f") + b"\x00\x00\x80\x3f"
            + b"\x03" + key("p") + b"\x30\x03\x00\x00\x00" + b"\x08" + (1).to_bytes(4, "little")
            + (4).to_bytes(4, "little") + (5).to_bytes(4, "little") + b"\x05"
            + b"\x05",
        )


class RemainingOdinTags(unittest.TestCase):
    GUID = "00112233-4455-6677-8899-aabbccddeeff"

    def load(self, root):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "tags.hsg")
            with open(path, "wb") as fh:
                fh.write(encode(root))
            return load_save(path).root

    def test_named_collection_and_unnamed_body_primitives(self):
        cases = [
            (SByte(-128), -128), (SByte(127), 127),
            (Short(-32768), -32768), (Short(32767), 32767),
            (UShort(65535), 65535), (UInt(2**32 - 1), 2**32 - 1),
            (Long(-2**63), -2**63), (Long(2**63 - 1), 2**63 - 1),
            (Decimal(12345, 3), 12.345), (Decimal(-98765, 4), -9.8765),
            # Exercise every coefficient word, including their high bits.
            (Decimal(2**96 - 1, 28), (2**96 - 1) / 10**28),
            (Char("界"), "界"), (Char("\ud800"), "\ud800"),
            (Guid(self.GUID), self.GUID),
        ]
        for marker, expected in cases:
            with self.subTest(tag=marker.tag, expected=expected):
                got = self.load({"value": marker, "after": 42, "items": [marker, 43],
                                 "body": {"values": Unnamed(marker, 44)}})
                self.assertEqual(got, {"value": expected, "after": 42,
                                       "items": {"$items": [expected, 43]},
                                       "body": {"$vals": [expected, 44]}})
                self.assertIsInstance(got["value"], type(expected))

    def test_external_references_are_skipped_with_one_warning(self):
        refs = [ExternalReferenceByIndex(-1), ExternalReferenceByGuid(self.GUID),
                ExternalReferenceByString("外部"), ExternalReferenceByString(None)]
        root = {"items": [*refs, 43], "body": {"values": Unnamed(*refs, 44)}}
        for n, ref in enumerate(refs):
            root[f"ref{n}"] = ref
            root[f"after{n}"] = n
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            got = self.load(root)
        self.assertEqual(len(caught), 1)
        self.assertIn("Skipped 12 external references", str(caught[0].message))
        self.assertEqual(got["items"], {"$items": [None, None, None, None, 43]})
        self.assertEqual(got["body"], {"$vals": [None, None, None, None, 44]})
        for n in range(len(refs)):
            self.assertIsNone(got[f"ref{n}"])
            self.assertEqual(got[f"after{n}"], n)

    def test_no_external_references_means_no_warning(self):
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            self.load({"value": Long(7), "enum": Enum(-1)})
        self.assertEqual(caught, [])

    def test_wire_bytes_pin_decimal_words_guid_order_and_string_tags(self):
        key = lambda k: b"\x01\x01\x00\x00\x00" + k.encode("utf-16-le")
        self.assertEqual(
            gzip.decompress(encode({"d": Decimal(-12345, 3), "g": Guid(self.GUID),
                                    "s": ExternalReferenceByString("x"),
                                    "v": Unnamed(ExternalReferenceByString("x"))})),
            b"\x02\x2e"
            + b"\x23" + key("d")
            + bytes.fromhex("39300000 00000000 00000000 00000380")
            + b"\x29" + key("g")
            + bytes.fromhex("33221100 5544 7766 8899 aabbccddeeff")
            + b"\x32" + key("s") + key("x") + b"\x33" + key("x") + b"\x05",
        )
        self.assertEqual(Decimal(0x112233445566778899AABBCC, 2).encode(),
                         bytes.fromhex("ccbbaa99 88776655 44332211 00000200"))

    def test_non_value_markers_do_not_become_properties(self):
        markers = {0x05, 0x06, 0x07, 0x08, 0x2E, 0x2F, 0x30, 0x31}
        self.assertTrue(PROP_TAGS.isdisjoint(markers))
        # 0x2e is also the unnamed null (0x2d + 1), which it has always been.
        self.assertTrue({tag + 1 for tag in PROP_TAGS}.isdisjoint(markers - {0x2E}))
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "end.hsg")
            with open(path, "wb") as fh:
                fh.write(gzip.compress(b"\x02\x2e\x31\x05"))
            with self.assertRaisesRegex(SaveFormatError, "body tag 0x31"):
                load_save(path)


class PropertyKeys(unittest.TestCase):
    """The body loop reads a key it has already decoded, and the int32 or float
    after it, in place; a new key, and one too long to keep, go through
    string(). Every path has to give the same object, in the same key order."""

    def test_repeated_new_and_long_keys_read_alike(self):
        long_key = "k" * (STRING_CACHE_CHARS + 16)  # never kept, always decoded
        rows = [
            {"id": n, "rate": Float32(n / 2), "name": f"row {n}", long_key: n * 10,
             "": n, "money": n + 0.25, "ok": bool(n % 2)}
            for n in range(3)
        ]
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "keys.hsg")
            with open(path, "wb") as fh:
                fh.write(encode({"rows": rows}))
            got = load_save(path).root["rows"]["$items"]
        want = [
            {"id": n, "rate": n / 2, "name": f"row {n}", long_key: n * 10,
             "": n, "money": n + 0.25, "ok": bool(n % 2)}
            for n in range(3)
        ]
        self.assertEqual(got, want)
        self.assertEqual([list(row) for row in got], [list(row) for row in want])


if __name__ == "__main__":
    unittest.main()
