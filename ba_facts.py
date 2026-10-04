"""Versioned runtime building facts and portable, hash-bound save snapshots.

No game libraries, file reads or dashboard imports. The same resolver runs in
CPython and Pyodide; a Save owns its resolved table, never the module cache.
"""
from __future__ import annotations

import base64
import hashlib
import io
import json
import math
import re
import struct

MODEL = "building-values-v1"
MAX_FACTS = 8 * 1024 * 1024
MAX_ROWS = 10000
CAMPAIGNS = ("SmallInternet", "MediumInternet", "LargeInternet", "SmallBillboard", "MediumBillboard", "LargeBillboard")


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"),
                                     allow_nan=False).encode()).hexdigest()


def number(value, minimum=0):
    return type(value) in (int, float) and math.isfinite(value) and minimum <= value <= 1e12


def validate(facts, raw=None, stamp=None, character=None):
    """Reject a bad pairing instead of silently substituting baseline facts."""
    if not isinstance(facts, dict) or facts.get("schemaVersion") != 1 or facts.get("model") != MODEL:
        raise ValueError("Unsupported building facts schema or calculation model")
    if len(json.dumps(facts, allow_nan=False)) > MAX_FACTS:
        raise ValueError("Building facts are too large")
    if not isinstance(facts.get("character"), str) or not facts["character"]:
        raise ValueError("Building facts have no character")
    if not isinstance(facts.get("stamp"), str) or not facts["stamp"]:
        raise ValueError("Building facts have no snapshot stamp")
    if type(facts.get("build")) is not int or facts["build"] < 0:
        raise ValueError("Invalid building facts game build")
    if not isinstance(facts.get("saveSha256"), str) or not re.fullmatch(r"[0-9a-f]{64}", facts["saveSha256"]):
        raise ValueError("Building facts have no save hash")
    if raw is not None and hashlib.sha256(raw).hexdigest() != facts["saveSha256"]:
        raise ValueError("Building facts belong to a different save")
    if stamp is not None and stamp != facts["stamp"]:
        raise ValueError("Building facts belong to a different refresh")
    if character is not None and character != facts["character"]:
        raise ValueError("Building facts belong to a different character")
    rows = facts.get("buildings")
    if not isinstance(rows, list) or len(rows) > MAX_ROWS:
        raise ValueError("Invalid building facts list")
    seen = set()
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get("street"), str) or not row["street"]:
            raise ValueError("Invalid building address")
        if type(row.get("number")) is not int or row["number"] < 0:
            raise ValueError("Invalid building number")
        key = (row["street"], row["number"])
        if key in seen:
            raise ValueError("Duplicate building facts")
        seen.add(key)
        for field in ("type", "size", "neighbourhood"):
            if not isinstance(row.get(field), str) or not row[field]:
                raise ValueError("Incomplete building identity")
        # The game uses -1 for residential buildings without a numbered layout.
        # Link captures those too, even when the player owns only retail sites.
        if type(row.get("version")) is not int or row["version"] < -1:
            raise ValueError("Invalid building version")
        for field in ("area", "propertyArea", "traffic"):
            if not number(row.get(field)):
                raise ValueError("Invalid building " + field)
        if "capacity" not in row or (row["capacity"] is not None and not number(row["capacity"], -1)):
            raise ValueError("Invalid building capacity")
        marketing = row.get("marketing")
        if marketing is not None and (not isinstance(marketing, dict) or
                not all(number(marketing.get(k)) for k in ("reachMultiplier", "strength"))):
            raise ValueError("Invalid marketing multipliers")
    types = facts.get("marketingTypes")
    # Six known switches are the current optimizer's supported model. Unknown
    # enum additions require a model update, not silently dropping campaigns.
    if types is not None:
        if not isinstance(types, list) or len(types) != 6:
            raise ValueError("Unsupported marketing campaign catalogue")
        for i, row in enumerate(types):
            if not isinstance(row, dict) or type(row.get("id")) is not int or row["id"] != i or row.get("name") != CAMPAIGNS[i]:
                raise ValueError("Invalid marketing campaign identity")
            if not all(number(row.get(k)) for k in ("price", "reach")):
                raise ValueError("Invalid marketing campaign values")
    agencies = facts.get("agencies")
    if not isinstance(agencies, list) or len(agencies) > MAX_ROWS:
        raise ValueError("Invalid marketing agencies")
    seen = set()
    for row in agencies:
        if (not isinstance(row, dict) or not isinstance(row.get("street"), str) or not row["street"] or
                type(row.get("number")) is not int or row["number"] < 0 or
                not isinstance(row.get("types"), list) or
                any(t not in CAMPAIGNS for t in row["types"])):
            raise ValueError("Invalid marketing agency")
        key = row["street"], row["number"]
        if key in seen:
            raise ValueError("Duplicate marketing agency")
        seen.add(key)
    return facts


def pack(raw, facts):
    validate(facts, raw)
    return json.dumps({"format": "big-copilot-save", "version": 1,
                       "save": base64.b64encode(raw).decode("ascii"), "facts": facts},
                      separators=(",", ":"), allow_nan=False).encode()


def unpack(data):
    # Leave ordinary/corrupt hsg diagnostics to gzip, as before.
    if not data.lstrip().startswith(b"{"):
        return data, None
    try:
        obj = json.loads(data)
        if obj.get("format") != "big-copilot-save" or obj.get("version") != 1:
            raise ValueError("Unsupported portable save format")
        raw = base64.b64decode(obj["save"], validate=True)
        return raw, validate(obj["facts"], raw)
    except (KeyError, TypeError, AttributeError) as exc:
        raise ValueError("Invalid portable save") from exc


def _size(value):
    return value.removeprefix("ba:buildingsize_").upper()


def _alcware(value):
    """The inspected Retail Expansion RCR3/4/5 wire formats. Never execute mods."""
    if not isinstance(value, str) or len(value) > MAX_FACTS:
        raise ValueError("Invalid renovation data")
    if not value.startswith(("RCR3:", "RCR4:", "RCR5:")):
        raise ValueError("Unsupported renovation data")
    stream = io.BytesIO(base64.b64decode(value[5:], validate=True))
    def read(fmt):
        size = struct.calcsize(fmt)
        return struct.unpack(fmt, stream.read(size))[0]
    def count():
        n = read("<i")
        if not 0 <= n <= MAX_ROWS:
            raise ValueError("Invalid renovation count")
        return n
    def string():
        n = 0
        for shift in range(0, 35, 7):
            b = read("<B")
            n |= (b & 127) << shift
            if b < 128:
                if n > MAX_FACTS:
                    raise ValueError("Invalid renovation string")
                raw = stream.read(n)
                if len(raw) != n:
                    raise ValueError("Truncated renovation string")
                return raw.decode("utf-8")
        raise ValueError("Invalid renovation string length")
    version = read("<i")
    if value[:5] != f"RCR{version}:" or version not in (3, 4, 5):
        raise ValueError("Unsupported renovation version")
    read("<i")  # max tiers
    read("<i")  # max capacity
    if version == 4:
        read("<i")
    elif version == 5:
        read("<?")
    for _ in range(count()):
        read("<i"), read("<i")  # price tiers
    rows = []
    for _ in range(count()):
        if read("<i") != 1:
            raise ValueError("Unsupported renovation record")
        street, number_ = string(), read("<i")
        string(), read("<i")  # original layout
        original_area = read("<i")
        size, version_ = string(), read("<i")
        read("<i"), string()  # targetArea is NOT simulation area; finishes
        if version >= 4:
            read("<?"), read("<f")
        rows.append((street, number_, _size(size), version_, original_area))
        if not street or number_ < 0 or version_ < 0 or not size or original_area < 0:
            raise ValueError("Invalid renovation record")
    if stream.read(1):
        raise ValueError("Trailing renovation data")
    if len({(r[0], r[1]) for r in rows}) != len(rows):
        raise ValueError("Duplicate renovation record")
    return rows


def resolve(save, baseline):
    """A detached index for this parsed save; baseline rows remain untouched."""
    table = {key: dict(row) for key, row in baseline.items()}
    layouts = {(r.get("t"), r.get("z"), r.get("v")) for r in baseline.values()}
    mod_data = {p.get("$k"): save.deref(p.get("$v"))
                for p in save.items(save.root.get("modData")) if isinstance(p, dict)}
    value = mod_data.get("RetailCapacityUpgrades.renovations.v2")
    if value is not None:
        try:
            records = _alcware(value)
        except (ValueError, struct.error, UnicodeError):
            records = []
            for row in table.values():
                row.update(factsUnavailable=True, layoutKnown=False, layoutCapacity=None, m=None)
        for street, n, size, version, area in records:
            row = table.get((street, n))
            if row is None:
                continue
            areas = {r["m"] for r in baseline.values() if r.get("t") == row.get("t") and r.get("z") == size}
            known = (row.get("t"), size, version) in layouts and len(areas) == 1
            row.update(z=size, v=version, m=next(iter(areas)) if known else None,
                       propertyArea=area, factsSource="alcware", layoutKnown=known)
            if not known:
                row.update(layoutCapacity=None, factsUnavailable=True)
    facts = getattr(save, "facts", None)
    if facts:
        validate(facts, character=save.root.get("characterId"))
        types = facts.get("marketingTypes")
        present = {(item["street"], item["number"]) for item in facts["buildings"]}
        for key, row in table.items():
            if key not in present:
                row.update(factsUnavailable=True, layoutKnown=False, layoutCapacity=None, m=None)
        for item in facts["buildings"]:
            key = item["street"], item["number"]
            row = table.setdefault(key, {"s": key[0], "n": key[1]})
            kind = item["type"].removeprefix("ba:buildingtype_")
            size = _size(item["size"])
            row.update(t=kind, z=size, v=item["version"], m=item["area"], h=item["neighbourhood"].removeprefix("ba:neighborhood_"),
                       x=item["traffic"], layoutCapacity=item["capacity"] if item["capacity"] is not None and item["capacity"] >= 0 else None, propertyArea=item["propertyArea"],
                       factsSource="game", layoutKnown=(kind, size, item["version"]) in layouts)
            row.pop("factsUnavailable", None)
            if item.get("marketing") is not None and types is not None:
                row["marketingRules"] = {**item["marketing"], "types": types}
                if item["capacity"] == 0:
                    row["marketingRules"]["reachMultiplier"] = 0
            else:
                row["factsUnavailable"] = True
    for row in table.values():
        if "factsSource" in row or row.get("factsUnavailable"):
            row["factsRevision"] = digest(row)
    return table
