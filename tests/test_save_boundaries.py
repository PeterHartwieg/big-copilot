"""Malformed ES3 lengths and truncated streams fail at the parser boundary."""
import gc
import gzip
import os
import struct
import tempfile
import unittest

from ba_save import SaveFormatError, _Reader, load_save
from tests.es3_fixture import encode
from tests.test_es3_tags import every_tag


class SaveBoundaries(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.path = os.path.join(tmp.name, "synthetic.hsg")

    def load(self, stream):
        with open(self.path, "wb") as fh:
            fh.write(gzip.compress(stream))
        return load_save(self.path)

    def test_every_truncated_prefix_reports_a_format_error(self):
        stream = gzip.decompress(encode(every_tag()))
        for end in range(len(stream)):
            with self.subTest(end=end), self.assertRaises(SaveFormatError):
                self.load(stream[:end])
        self.assertEqual(self.load(stream).root["Name"], "Tag Co")

    def test_string_lengths_are_checked_before_slicing(self):
        for raw in (b"", b"\x01", b"\x01\x01\x00\x00",
                    b"\x01" + struct.pack("<i", -1),
                    b"\x01" + struct.pack("<i", 4) + b"A\x00",
                    b"\x01" + struct.pack("<i", 2**31 - 1)):
            with self.subTest(raw=raw), self.assertRaises(SaveFormatError):
                _Reader(raw).string()

    def test_cached_property_keys_cannot_bypass_length_checks(self):
        # Empty keys are valid and cached. A negative length slices to the
        # same empty bytes but must not send the cursor back into the header.
        reader = _Reader(b"\x17\x01" + struct.pack("<i", -1) + b"\x00" * 4 + b"\x05")
        reader._strings[b""] = ""
        with self.assertRaises(SaveFormatError):
            reader.body(None, None)
        # A truncated key can also hit a cached string because slices clamp.
        reader = _Reader(b"\x17\x01" + struct.pack("<i", 4) + b"A\x00")
        reader._strings[b"A\x00"] = "A"
        with self.assertRaises(SaveFormatError):
            reader.body(None, None)

    def test_packed_arrays_check_the_full_declared_size(self):
        for type_name, size in (("System.Int32[]", 4), ("Unknown[]", 1)):
            for count in (2, 2**31 - 1):
                with self.subTest(type_name=type_name, count=count):
                    reader = _Reader(struct.pack("<ii", count, size) + b"X")
                    with self.assertRaises(SaveFormatError):
                        reader.packed(type_name)
        self.assertEqual(_Reader(struct.pack("<ii", 0, 4)).packed("System.Int32[]"), [])

    def test_root_must_be_an_object_and_consume_the_stream(self):
        for stream in (b"\x02\x00", b"\x02\x2d", b"\x01\x2e\x05", b"\x02\x2e\x05extra"):
            with self.subTest(stream=stream), self.assertRaises(SaveFormatError):
                self.load(stream)
        self.assertEqual(self.load(b"\x02\x2e\x05").root, {})

    def test_failure_restores_the_callers_gc_state(self):
        original = gc.isenabled()
        self.addCleanup(gc.enable if original else gc.disable)
        for enabled in (True, False):
            (gc.enable if enabled else gc.disable)()
            with self.assertRaises(SaveFormatError):
                self.load(b"\x02\x2e\x17")
            self.assertEqual(gc.isenabled(), enabled)

    def test_utf16_lengths_count_code_units_and_keep_null_values(self):
        root = {"": "", "Türkçe": "A🙂", "long": "🙂" * 80, "null": None}
        self.assertEqual(self.load(gzip.decompress(encode(root))).root, root)
