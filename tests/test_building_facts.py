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

    def test_wholesale_runtime_catalogue_is_optional_validated_and_preserved(self):
        row = {"street": "supplier", "number": 4, "fee": 100, "products": ["ba:itemname_sodacan"]}
        self.facts["wholesalers"] = [row]
        self.assertEqual(self.load().facts["wholesalers"], [row])
        for changes in ({"fee": -1}, {"fee": True}, {"products": ["x", "x"]}, {"products": [None]},
                        {"number": True}, {"street": ""}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                f.validate(dict(self.facts, wholesalers=[dict(row, **changes)]))
        with self.assertRaises(ValueError):
            f.validate(dict(self.facts, wholesalers=[row, row]))
        del self.facts["wholesalers"]
        self.assertEqual(f.validate(self.facts), self.facts)

    def test_portable_round_trip_and_save_local_resolution(self):
        baseline = copy.deepcopy(d.load_buildings())
        save = self.load()
        row = d.load_buildings(save)[GIFTS]
        self.assertEqual((row["m"], row["propertyArea"], d._size_cap(row, {})), (225, 75, 90))
        self.assertEqual(d.load_buildings(), baseline)
        plain = Save(self.root, {}, "plain.hsg")
        self.assertEqual(d.load_buildings(plain), baseline)

    def test_live_lease_quote_is_distinct_from_signed_lease_and_unknown_stays_unknown(self):
        row = self.facts["buildings"][0]
        row["signedDepositCents"] = 123400
        row["newLease"] = {"version": 1, "status": "ready", "data": {
            "rentCents": 45600, "depositCents": 789000,
            "basis": "native-live-quote", "depositBasis": "native-rent-times-deposit-days"}}
        save = self.load()
        resolved = d.load_buildings(save)[GIFTS]
        self.assertEqual(f.lease_quote(resolved)["rentCents"], 45600)
        result = d._premises(save, Names(data_names()), {})
        building = next(b for b in result["buildings"] if b["key"] == d.site_key(GIFTS))
        self.assertEqual((building["rent"], building["deposit"], building["signedDeposit"]), (456, 7890, 1234))
        row["newLease"] = {"version": 2, "status": "ready", "data": {"different": True}}
        save = self.load()
        building = next(b for b in d._premises(save, Names(data_names()), {})["buildings"] if b["key"] == d.site_key(GIFTS))
        self.assertIsNone(building["rent"])
        self.assertIsNone(building["deposit"])

    def test_owned_property_zero_lease_has_its_own_basis(self):
        row = self.facts["buildings"][0]
        quote = {"rentCents": 0, "depositCents": 0, "basis": "owned-no-lease", "depositBasis": "owned-no-lease"}
        row["newLease"] = {"version": 1, "status": "ready", "data": quote}
        save = self.load()
        building = next(b for b in d._premises(save, Names(data_names()), {})["buildings"] if b["key"] == d.site_key(GIFTS))
        self.assertEqual((building["rent"], building["deposit"], building["leaseBasis"]), (0, 0, "owned-no-lease"))
        quote["rentCents"] = 1
        with self.assertRaises(ValueError):
            self.load()

    def test_native_catalogue_keeps_fractional_cents_and_transaction_basis(self):
        self.facts["nativeEconomy"] = {"version": 1, "model": f.NATIVE_ECONOMY_MODEL,
            "itemPrices": {"status": "ready", "basis": "registered-catalogue-before-transaction-multipliers",
                           "gameMarketMultiplierIncluded": False, "importMultiplierIncluded": False,
                           "data": [{"itemId": "fraction", "wholesaleAmount": "0.012345679", "defaultMarketAmount": "1E-05"}]},
            "banks": {"status": "ready", "data": []}}
        save = self.load()
        rows = f.native_economy(save.facts, "itemPrices")
        self.assertEqual(f.catalogue_amount(rows[0]["wholesaleAmount"]), 0.012345679)
        self.assertEqual(f.native_economy(save.facts, "banks"), [])
        for value in ("NaN", "Infinity", "-1", "1_000", "1e99", "", 1.25, True):
            with self.subTest(value=value), self.assertRaises(ValueError):
                f.catalogue_amount(value)
        self.facts["nativeEconomy"]["version"] = 2
        self.assertIsNone(f.native_economy(self.load().facts, "itemPrices"))

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

    def test_every_rejection_branch_of_validate(self):
        # One case per raise in validate(), each pinned to its own message so a
        # case cannot pass by tripping an earlier check.
        def building(x): return x["buildings"][0]
        def campaign(x): return x["marketingTypes"][0]
        def agency(x): return x["agencies"][0]
        too_many = [{}] * (f.MAX_ROWS + 1)
        cases = (
            ("not a dict", lambda x: x.clear(), "schema"),
            ("too large", lambda x: x.update(pad="x" * f.MAX_FACTS), "too large"),
            ("no character", lambda x: x.update(character=""), "no character"),
            ("no stamp", lambda x: x.update(stamp=None), "no snapshot stamp"),
            ("build not int", lambda x: x.update(build=True), "game build"),
            ("hash not hex", lambda x: x.update(saveSha256="Z" * 64), "no save hash"),
            ("buildings not a list", lambda x: x.update(buildings={}), "building facts list"),
            ("too many buildings", lambda x: x.update(buildings=too_many), "building facts list"),
            ("row not a dict", lambda x: x["buildings"].append("row"), "building address"),
            ("empty street", lambda x: building(x).update(street=""), "building address"),
            ("negative number", lambda x: building(x).update(number=-1), "building number"),
            ("float number", lambda x: building(x).update(number=1.0), "building number"),
            ("duplicate building", lambda x: x["buildings"].append(copy.deepcopy(building(x))), "Duplicate building"),
            ("no type", lambda x: building(x).pop("type"), "Incomplete building identity"),
            ("empty size", lambda x: building(x).update(size=""), "Incomplete building identity"),
            ("no neighbourhood", lambda x: building(x).update(neighbourhood=None), "Incomplete building identity"),
            ("negative version", lambda x: building(x).update(version=-2), "building version"),
            ("property area", lambda x: building(x).update(propertyArea=-1), "building propertyArea"),
            ("no capacity key", lambda x: building(x).pop("capacity"), "building capacity"),
            ("capacity below -1", lambda x: building(x).update(capacity=-2), "building capacity"),
            ("marketing not a dict", lambda x: building(x).update(marketing=[1, 1]), "marketing multipliers"),
            ("no strength", lambda x: building(x)["marketing"].pop("strength"), "marketing multipliers"),
            ("negative reach", lambda x: building(x)["marketing"].update(reachMultiplier=-1), "marketing multipliers"),
            ("catalogue not a list", lambda x: x.update(marketingTypes={}), "campaign catalogue"),
            ("duplicate campaign", lambda x: x["marketingTypes"].append(copy.deepcopy(campaign(x))), "campaign identity"),
            ("campaign not a dict", lambda x: x["marketingTypes"].__setitem__(0, "SmallInternet"), "campaign identity"),
            ("campaign id order", lambda x: campaign(x).update(id=1), "campaign identity"),
            ("campaign id bool", lambda x: campaign(x).update(id=False), "campaign identity"),
            ("campaign empty name", lambda x: campaign(x).update(name=""), "campaign identity"),
            ("campaign price", lambda x: campaign(x).update(price="10"), "campaign values"),
            ("campaign reach", lambda x: campaign(x).pop("reach"), "campaign values"),
            ("agencies missing", lambda x: x.pop("agencies"), "marketing agencies"),
            ("too many agencies", lambda x: x.update(agencies=too_many), "marketing agencies"),
            ("agency not a dict", lambda x: x["agencies"].append(None), "marketing agency$"),
            ("agency empty street", lambda x: agency(x).update(street=""), "marketing agency$"),
            ("agency negative number", lambda x: agency(x).update(number=-1), "marketing agency$"),
            ("agency types not a list", lambda x: agency(x).update(types="SmallInternet"), "marketing agency$"),
            ("agency unknown type", lambda x: agency(x)["types"].append("Radio"), "marketing agency$"),
            ("duplicate agency", lambda x: x["agencies"].append(copy.deepcopy(agency(x))), "Duplicate marketing agency"),
        )
        self.assertTrue(self.facts["agencies"] and self.facts["agencies"][0]["types"], "fixture needs an agency")
        f.validate(self.facts)
        for label, mutate, message in cases:
            bad = copy.deepcopy(self.facts)
            mutate(bad)
            with self.subTest(label), self.assertRaisesRegex(ValueError, message):
                f.validate(bad)
        # The pairing checks, each against the argument it compares.
        for kwargs, message in (({"raw": b"other"}, "different save"), ({"stamp": "later"}, "different refresh"),
                                ({"character": "other"}, "different character")):
            with self.subTest(**kwargs), self.assertRaisesRegex(ValueError, message):
                f.validate(self.facts, **kwargs)
        with self.assertRaisesRegex(ValueError, "schema"):
            f.validate([self.facts])
        # A missing or empty catalogue is fine; residential -1 and unknown capacity are too.
        ok = copy.deepcopy(self.facts)
        ok.pop("marketingTypes")
        building(ok).update(version=-1, capacity=None, marketing=None)
        ok["agencies"] = []
        f.validate(ok)

    def test_unknown_marketing_catalogue_preserves_buildings_but_withholds_rules(self):
        self.facts["marketingTypes"].append({"id": 7, "name": "Radio", "price": 123, "reach": 20})
        self.facts["agencies"][0]["types"].append("Radio")
        save = self.load()
        self.assertFalse(f.marketing_supported(save.facts))
        row = d.load_buildings(save)[GIFTS]
        self.assertTrue(row["marketingUnavailable"])
        self.assertNotIn("marketingRules", row)
        self.assertNotIn("factsUnavailable", row)
        self.assertEqual((row["m"], row["layoutCapacity"]), (225, 90))
        self.assertEqual(save.facts["marketingTypes"][-1]["name"], "Radio")
        with self.assertRaisesRegex(ValueError, "different save"):
            f.validate(self.facts, b"other")
        with self.assertRaisesRegex(ValueError, "different character"):
            f.validate(self.facts, character="other")

    def test_unknown_marketing_model_is_valid_but_never_supported(self):
        self.facts["marketingModel"] = "future-v2"
        save = self.load()
        self.assertFalse(f.marketing_supported(save.facts))
        self.assertTrue(d.load_buildings(save)[GIFTS]["marketingUnavailable"])
        self.facts["marketingModel"] = f.MARKETING_MODEL
        self.assertTrue(f.marketing_supported(self.facts))
        self.facts["marketingTypes"] = list(reversed(self.facts["marketingTypes"]))
        self.assertIs(f.validate(self.facts), self.facts)
        self.assertFalse(f.marketing_supported(self.facts))

    def test_registered_vehicle_prices_validate_and_round_trip(self):
        block = {"schemaVersion": 1, "model": f.VEHICLE_MODEL,
                 "prices": {"roadster:vehicletype_roadster": 250000, "test:free": 0}}
        self.facts["vehiclePrices"] = block
        self.assertEqual(f.vehicle_prices(self.load().facts), block["prices"])
        prices = f.vehicle_prices(self.facts)
        prices.clear()
        self.assertTrue(block["prices"])
        for value in (-1, True, None, float("nan"), "250000", 1e13):
            bad = copy.deepcopy(self.facts)
            bad["vehiclePrices"]["prices"]["test:bad"] = value
            with self.subTest(value=value), self.assertRaises(ValueError):
                f.validate(bad)
        for update in ({"schemaVersion": True}, {"schemaVersion": 0}, {"model": ""}, {"prices": []}, {"prices": {"": 1}}):
            with self.subTest(update=update), self.assertRaises(ValueError):
                f.validate(dict(self.facts, vehiclePrices=dict(block, **update)))
        block["schemaVersion"] = 2
        self.assertIsNone(f.vehicle_prices(self.load().facts))
        del self.facts["vehiclePrices"]
        self.assertIsNone(f.vehicle_prices(self.load().facts))

    def test_economy_observations_preserve_unknown_and_disabled_states(self):
        block = {"schemaVersion": 1, "model": "economy-capabilities-v1", "providers": [
            {"id": "hard-mode-patch", "version": "1.0", "status": "observed", "runningCostsAvailable": True,
             "rules": {"equipmentUtilities": True, "officeIt": False, "factoryDiplomas": None}},
            {"id": "real-life-overhaul", "version": "1.0", "status": "unavailable", "rules": {"operatingCosts": None}}]}
        self.facts["economy"] = block
        self.assertEqual(self.load().facts["economy"], block)
        for changes in ({"rules": {"officeIt": 0}}, {"runningCostsAvailable": "yes"}, {"status": "active"},
                        {"id": ""}, {"version": None}):
            bad = copy.deepcopy(self.facts)
            bad["economy"]["providers"][0].update(changes)
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                f.validate(bad)
        block["providers"].append(copy.deepcopy(block["providers"][0]))
        with self.assertRaisesRegex(ValueError, "provider identity"):
            f.validate(self.facts)
        block["providers"] = []
        self.assertEqual(self.load().facts["economy"]["providers"], [])

    def test_future_optional_blocks_preserve_changed_shapes_and_gate_consumers(self):
        for key, model in (("vehiclePrices", f.VEHICLE_MODEL), ("economy", f.ECONOMY_MODEL)):
            for version, identity in ((2, model), (1, "future-model-v2")):
                with self.subTest(key=key, version=version, model=identity):
                    # Neither v1 payload field exists: future shapes remain
                    # intact through a portable save, without authorizing v1.
                    block = {"schemaVersion": version, "model": identity,
                             "entries": [["future", {"value": 123}]]}
                    facts = dict(self.facts, **{key: block})
                    save = self.load(facts)
                    self.assertEqual(save.facts[key], block)
                    self.assertEqual(d.load_buildings(save)[GIFTS]["m"], 225)
                    if key == "vehiclePrices":
                        self.assertIsNone(f.vehicle_prices(save.facts))
                        self.assertEqual(d.ba_mods.vehicle_prices(save, {"known": 100}), ({}, False))
                    else:
                        self.assertEqual(d.ba_mods.capabilities(save),
                                         {cap: ["economyUnknown"] for cap in d.ba_mods.ECONOMY_CAPABILITIES})
                    with self.assertRaisesRegex(ValueError, "different save"):
                        f.validate(facts, b"wrong save")

    def test_optional_blocks_require_valid_envelopes_even_when_unsupported(self):
        for key in ("vehiclePrices", "economy"):
            future = {"schemaVersion": 2, "model": "future-v2", "entries": []}
            for block in (None, [], {}, {"model": "future-v2"}, {"schemaVersion": 2},
                          *[dict(future, schemaVersion=v) for v in (0, -1, True, 1.5, "2")],
                          *[dict(future, model=v) for v in (None, "", 2)]):
                with self.subTest(key=key, block=block), self.assertRaises(ValueError):
                    f.validate(dict(self.facts, **{key: block}))
            for value in (float("nan"), float("inf"), -float("inf")):
                with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                    f.validate(dict(self.facts, **{key: dict(future, entries=[{"nested": value}])}))

    def test_supported_optional_blocks_still_require_their_full_shape(self):
        for key, model, field in (("vehiclePrices", f.VEHICLE_MODEL, "prices"),
                                  ("economy", f.ECONOMY_MODEL, "providers")):
            block = {"schemaVersion": 1, "model": model}
            for malformed in (block, dict(block, **{field: None}), dict(block, **{field: "unknown"})):
                with self.subTest(key=key, malformed=malformed), self.assertRaises(ValueError):
                    f.validate(dict(self.facts, **{key: malformed}))

    def test_partial_or_failed_vehicle_catalogue_never_authorizes_fallback(self):
        block = {"schemaVersion": 1, "model": f.VEHICLE_MODEL, "prices": {"known": 0}}
        self.facts["vehiclePrices"] = block
        for expected in ({"known": 0}, {}):
            block["prices"] = expected
            save = self.load()
            self.assertEqual(d.ba_mods.vehicle_prices(save, {"known": 100, "unreadable": 200}),
                             (expected, True))
            # Unrelated facts still load when optional registry entries failed.
            self.assertEqual(d.load_buildings(save)[GIFTS]["m"], 225)

    def test_ambiguous_provider_observation_loads_but_withholds_forecasts(self):
        provider = {"id": "hard-mode-patch", "version": "0.5.0.0, 0.6.0.0", "status": "unavailable",
                    "runningCostsAvailable": None,
                    "rules": {"equipmentUtilities": None, "officeIt": None, "factoryDiplomas": None}}
        self.facts["economy"] = {"schemaVersion": 1, "model": f.ECONOMY_MODEL, "providers": [provider]}
        save = self.load()
        self.assertEqual(save.facts["economy"]["providers"], [provider])
        self.assertEqual(d.ba_mods.capabilities(save),
                         {cap: ["economyUnknown"] for cap in d.ba_mods.ECONOMY_CAPABILITIES})
        self.facts["economy"]["providers"].append(copy.deepcopy(provider))
        with self.assertRaisesRegex(ValueError, "provider identity"):
            f.validate(self.facts)

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
