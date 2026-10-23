"""Malformed ES3 lengths and truncated streams fail at the parser boundary."""
import gc
import gzip
import os
import struct
import tempfile
import tracemalloc
from unittest.mock import patch
import unittest

from ba_save import SaveFormatError, _Reader, _decompress, load_save
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


class SaveMemoryBoundaries(unittest.TestCase):
    def test_limit_counts_decompressed_bytes_and_accepts_exact_boundary(self):
        raw = gzip.compress(b"a" * 4096)
        self.assertEqual(_decompress(raw, 4096), b"a" * 4096)
        with self.assertRaisesRegex(SaveFormatError, "decompressed safety limit"):
            _decompress(raw, 4095)

    def test_budget_applies_across_gzip_members_and_preserves_padding(self):
        first, second = b"a" * 50, b"b" * 50
        raw = gzip.compress(first) + gzip.compress(second) + b"\0" * 8
        self.assertEqual(_decompress(raw, 100), first + second)
        with self.assertRaisesRegex(SaveFormatError, "safety limit"):
            _decompress(raw, 99)

    def test_corrupt_truncated_and_trailing_gzip_still_fail(self):
        raw = gzip.compress(b"example")
        bad_crc = bytearray(raw)
        bad_crc[-8] ^= 1
        for data in (raw[:-1], raw[:-8], bytes(bad_crc), raw + b"garbage", b"not gzip"):
            with self.subTest(data=data), self.assertRaises(SaveFormatError):
                _decompress(data, 100)

    def test_bomb_is_stopped_without_allocating_its_expansion(self):
        raw = gzip.compress(b"x" * (16 * 1024 * 1024))
        tracemalloc.start()
        try:
            with self.assertRaises(SaveFormatError):
                _decompress(raw, 128 * 1024)
            _, peak = tracemalloc.get_traced_memory()
        finally:
            tracemalloc.stop()
        self.assertLess(peak, 2 * 1024 * 1024)

    def test_local_override_explicit_budget_and_unknown_data_preservation(self):
        opaque = "opaque \U0001f642" * 80000
        root = {"modData": [{"$k": "unknown.mod", "$v": opaque}]}
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "synthetic.hsg")
            with open(path, "wb") as fh:
                fh.write(encode(root))
            with patch.dict(os.environ, {"BA_MAX_SAVE_MIB": "1"}):
                with self.assertRaisesRegex(SaveFormatError, "BA_MAX_SAVE_MIB"):
                    load_save(path)
                parsed = load_save(path, max_decompressed_bytes=4 * 1024 * 1024)
            self.assertEqual(parsed.items(parsed.root["modData"])[0]["$v"], opaque)
            for setting in ("0", "-1", "nonsense"):
                with patch.dict(os.environ, {"BA_MAX_SAVE_MIB": setting}):
                    with self.assertRaisesRegex(SaveFormatError, "positive whole"):
                        load_save(path)

    def test_separate_facts_preserve_portable_validation(self):
        import ba_facts
        import json
        from tests.test_building_facts import facts_for
        from tests.save_fixtures import data_company
        root = data_company()
        raw = encode(root)
        facts = facts_for(raw, root)
        with tempfile.TemporaryDirectory() as tmp:
            path, facts_path = os.path.join(tmp, "synthetic.hsg"), os.path.join(tmp, "facts.json")
            with open(path, "wb") as fh:
                fh.write(raw)
            def write_facts(value):
                with open(facts_path, "w") as fh:
                    json.dump(value, fh)
            write_facts(facts)
            parsed = load_save(path, facts_path=facts_path)
            self.assertEqual(parsed.facts, facts)
            self.assertIsNone(load_save(path).facts)
            for field, value in (("saveSha256", "0" * 64), ("character", "another"), ("build", 1)):
                write_facts(dict(facts, **{field: value}))
                with self.subTest(field=field), self.assertRaises(SaveFormatError):
                    load_save(path, facts_path=facts_path)
            write_facts(facts)
            with open(path, "wb") as fh:
                fh.write(ba_facts.pack(raw, facts))
            with self.assertRaisesRegex(SaveFormatError, "supplied twice"):
                load_save(path, facts_path=facts_path)
            self.assertEqual(load_save(path).facts, facts)
