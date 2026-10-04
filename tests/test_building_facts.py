"""Synthetic renovations, runtime rules and portable snapshot boundaries."""
import base64
import copy
import hashlib
import json
from pathlib import Path
import struct
import tempfile
import unittest

import ba_dashboard as d
import ba_facts as f
from ba_save import load_save, Save, SaveFormatError, Names
from tests.es3_fixture import encode
from tests.save_fixtures import data_company, data_names, GIFTS


def facts_for(raw, root):
    row = d.load_buildings()[GIFTS]
    return {"schemaVersion": 1, "model": f.MODEL, "stamp": "one", "character": root["characterId"],
            "build": root["buildNumberAtLastSave"], "saveSha256": hashlib.sha256(raw).hexdigest(),
            "buildings": [{"street": GIFTS[0], "number": GIFTS[1], "type": "ba:buildingtype_retail",
                           "size": "ba:buildingsize_c", "version": row["v"], "neighbourhood": d.hood_key(row),
                           "area": 225, "propertyArea": 75, "capacity": 90, "traffic": 50,
                           "marketing": {"reachMultiplier": 1, "strength": 1}}],
            "marketingTypes": [{"id": i, "name": name, "price": price, "reach": reach}
                               for i, (name, price, reach) in enumerate(d.MARKETING_TYPES)],
            "agencies": [{"street": a[0], "number": a[1], "types": [d.MARKETING_TYPES[k][0] for k in kinds]}
                         for a, (_name, kinds) in d.MARKETING_AGENCIES.items()]}


def renovation(version=5, size="C", layout=0):
    def i(n): return struct.pack("<i", n)
    def string(s):
        b = s.encode()
        assert len(b) < 128
        return bytes([len(b)]) + b
    raw = i(version) + i(3) + i(90)
    if version == 4: raw += i(1)
    if version == 5: raw += b"\x01"
    raw += i(1) + i(90) + i(5000) + i(1)
    raw += i(1) + string(GIFTS[0]) + i(GIFTS[1]) + string("A") + i(0) + i(75)
    raw += string(size) + i(layout) + i(75) + string("")
    if version >= 4: raw += b"\x01" + struct.pack("<f", 123)
    return f"RCR{version}:" + base64.b64encode(raw).decode()


class BuildingFacts(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = data_company()
        self.raw = encode(self.root)
        self.facts = facts_for(self.raw, self.root)

    def load(self, facts=None, raw=None):
        path = Path(self.tmp.name, "company.bcsave")
        path.write_bytes(f.pack(raw or self.raw, facts or self.facts))
        return load_save(str(path))

    def test_portable_round_trip_and_save_local_resolution(self):
        baseline = copy.deepcopy(d.load_buildings())
        save = self.load()
        row = d.load_buildings(save)[GIFTS]
        self.assertEqual((row["m"], row["propertyArea"], d._size_cap(row, {})), (225, 75, 90))
        self.assertEqual(d.load_buildings(), baseline)
        plain = Save(self.root, {}, "plain.hsg")
        self.assertEqual(d.load_buildings(plain), baseline)
        # Changed values at the same address cannot reuse the learned demand context.
        before = row["factsRevision"]
        self.facts["buildings"][0]["capacity"] = 120
        self.assertNotEqual(d.load_buildings(self.load())[GIFTS]["factsRevision"], before)

    def test_mismatched_pairs_and_invalid_values_are_rejected(self):
        for field, value in (("saveSha256", "0" * 64), ("schemaVersion", 2), ("model", "new-formula"),
                             ("build", -1), ("marketingTypes", [])):
            bad = copy.deepcopy(self.facts)
            bad[field] = value
            with self.subTest(field=field), self.assertRaises(ValueError): f.pack(self.raw, bad)
        for field, value in (("area", float("nan")), ("traffic", -5), ("capacity", "90")):
            bad = copy.deepcopy(self.facts)
            bad["buildings"][0][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError): f.pack(self.raw, bad)
        for field, value in (("character", "other"), ("build", 111)):
            bad = copy.deepcopy(self.facts)
            bad[field] = value
            with self.subTest(field=field), self.assertRaises(SaveFormatError): self.load(bad)
        with self.assertRaises(ValueError): f.validate(self.facts, stamp="later")
        with self.assertRaises(ValueError): f.unpack(b'{"format":"big-copilot-save","version":1,"save":"!"}')

    def test_live_city_accepts_residential_version_sentinel(self):
        # Link captures the whole city, including homes without a numbered layout.
        # Include every version in the shipped catalogue, not only owned shops.
        for key, row in d.load_buildings().items():
            if key == GIFTS:
                continue
            item = copy.deepcopy(self.facts["buildings"][0])
            item.update(street=key[0], number=key[1], type="ba:buildingtype_" + row["t"],
                        size="ba:buildingsize_" + row["z"].lower(), version=row["v"])
            self.facts["buildings"].append(item)
        homes = [r for r in self.facts["buildings"] if r["version"] == -1]
        self.assertTrue(homes, "The city fixture must exercise the game's -1 sentinel")
        save = self.load()
        table = d.load_buildings(save)
        for home in homes:
            row = table[home["street"], home["number"]]
            self.assertEqual(row["v"], -1)
            self.assertIsNone(d._layout(row))
        self.assertTrue(d.extract(save, Names(data_names()), None)["businesses"])

    def test_invalid_building_versions_still_reject_portable_saves(self):
        for version in (-2, "-1", None, True, 1.5):
            with self.subTest(version=version):
                self.facts["buildings"][0]["version"] = version
                with self.assertRaisesRegex(ValueError, "Invalid building version"):
                    f.pack(self.raw, self.facts)

    def test_alcware_versions_use_layout_area_not_property_area(self):
        base = {GIFTS: {"t": "retail", "z": "A", "v": 0, "m": 75},
                ("other", 1): {"t": "retail", "z": "C", "v": 2, "m": 225}}
        for version in (3, 4, 5):
            save = Save({"modData": {"$items": [{"$k": "RetailCapacityUpgrades.renovations.v2",
                                      "$v": renovation(version, layout=2)}]}}, {}, "synthetic")
            row = f.resolve(save, base)[GIFTS]
            self.assertEqual((row["z"], row["v"], row["m"], row["propertyArea"]), ("C", 2, 225, 75))
            self.assertTrue(row["layoutKnown"])
            self.assertEqual(base[GIFTS]["m"], 75)
        save.root["modData"]["$items"][0]["$v"] = renovation(size="FUTURE")
        row = f.resolve(save, base)[GIFTS]
        self.assertIsNone(row["m"])
        self.assertIsNone(d._size_cap(row, {}))
        self.assertIsNone(d._layout(row))
        save.root["modData"]["$items"][0]["$v"] = "RCR9:unknown"
        self.assertTrue(f.resolve(save, base)[GIFTS]["factsUnavailable"])

    def test_larger_area_and_changed_runtime_prices_change_best_campaigns(self):
        hood = d.HOOD_PREFIX + "industrycity"
        old = d.marketing_plan(50, [0], 75, "retail", hood)
        new = d.marketing_plan(50, [0], 225, "retail", hood)
        self.assertEqual((old["on"], old["cost"]), ([1], 250))
        self.assertEqual((new["on"], new["cost"]), ([0, 3], 600))
        self.assertEqual(d.marketing_score(50, old["on"], 225, "retail", hood), (18, 68))
        rules = {**self.facts["buildings"][0]["marketing"], "types": self.facts["marketingTypes"]}
        rules["types"][5]["price"] = 1
        self.assertEqual(d.marketing_plan(50, [0], 225, "future-type", "future-hood", rules=rules)["on"], [5])

    def test_mismatch_withholds_recommendations_and_unknown_layout_still_extracts(self):
        from tests.test_marketing_plan import _Save, _camp, _city
        b = {"marketingCampaigns": [_camp(0, True)]}
        row = d.load_buildings(self.load())[GIFTS]
        _, plan = d._marketing(_Save(), b, row, "retail", d.hood_key(row),
                               {"trafficIndex": 50, "marketing": 27, "total": 77}, d._marketing_agencies(_city()))
        self.assertTrue(plan["unavailable"])
        self.assertIsNone(plan["on"])
        self.assertEqual(plan["visit"], [])
        self.facts["buildings"][0].update(size="CUSTOM", version=123)
        save = self.load()
        self.assertFalse(d.load_buildings(save)[GIFTS]["layoutKnown"])
        payload = d.extract(save, Names(data_names()), None)
        site = next(b for b in payload["premises"]["buildings"] if b["key"] == d.site_key(GIFTS))
        self.assertEqual(site["cap"], 90)

    def test_browser_and_deferred_sections_keep_the_same_runtime_facts(self):
        save = self.load()
        folder = Path(self.tmp.name)
        names = folder / "names.json"
        names.write_text(json.dumps(data_names()), encoding="utf-8")
        core = json.loads(d.browser_build(save.path, str(folder / "missing.json"),
                                         str(folder / "history.json"), str(names)))
        self.assertIn("businesses", core)
        section = json.loads(d.browser_section("premises", None))
        # The local CLI's extraction and a deferred worker section agree.
        direct = d.extract(save, Names(data_names()), None)
        self.assertEqual(section["sections"]["premises"]["premises"], json.loads(json.dumps(direct["premises"])))

    def test_zero_and_unsupported_capacity_remain_distinct(self):
        for value, expected in ((0, 0), (-1, None), (None, None)):
            self.facts["buildings"][0]["capacity"] = value
            row = d.load_buildings(self.load())[GIFTS]
            self.assertEqual(d._size_cap(row, {}), expected)
            if value == 0:
                self.assertEqual(d.marketing_score(50, [5], row["m"], row["t"], "any", row["marketingRules"]), (0, 50))

    def test_live_link_keeps_facts_with_the_download_and_rejects_refresh_race(self):
        from tools.game_link_mock import Link, MockServer
        path = Path(self.tmp.name, "input.bcsave")
        path.write_bytes(f.pack(self.raw, self.facts))
        mock = Link(str(path), character=self.root["characterId"], company="Test", day=40, hour=10,
                    cash=0, build=3671, schema=1, throttle=False, refuse=None)
        server = MockServer(mock, port=0).start(follow=False)
        self.addCleanup(server.stop)
        game = d.GameLink(server.url, self.tmp.name)
        first = game.poll()
        self.assertTrue(first.endswith(".bcsave"))
        self.assertEqual(load_save(first).facts["stamp"], mock.stamp)
        previous = Path(first).read_bytes()
        real = game._call
        mock.refresh(force=True)
        def call(route, *args, **kwargs):
            if route.startswith("/facts?"):
                mock.refresh(force=True)
            return real(route, *args, **kwargs)
        game._call = call
        self.assertIsNone(game.poll())
        self.assertEqual(Path(first).read_bytes(), previous)


if __name__ == "__main__":
    unittest.main()
