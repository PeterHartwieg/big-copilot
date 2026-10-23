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
MARKETING_MODEL = "marketing-six-v1"
VEHICLE_MODEL = "registered-vehicle-wealth-v1"
ECONOMY_MODEL = "economy-capabilities-v1"
NATIVE_ECONOMY_MODEL = "native-economy-v1"
CAMPAIGNS = ("SmallInternet", "MediumInternet", "LargeInternet", "SmallBillboard", "MediumBillboard", "LargeBillboard")


def number(value, minimum=0):
    return type(value) in (int, float) and math.isfinite(value) and minimum <= value <= 1e12


def catalogue_amount(value):
    """Invariant native float amount, before later transaction multipliers."""
    if (not isinstance(value, str) or len(value) > 64 or
            not re.fullmatch(r"(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?", value)):
        raise ValueError("Invalid native catalogue amount")
    amount = float(value)
    if not number(amount):
        raise ValueError("Invalid native catalogue amount")
    return amount


def _native_economy(block):
    if (not isinstance(block, dict) or type(block.get("version")) is not int or block["version"] < 1
            or not isinstance(block.get("model"), str) or not block["model"]):
        raise ValueError("Invalid native economy metadata")
    if block["version"] != 1 or block["model"] != NATIVE_ECONOMY_MODEL:
        return
    for name in ("itemPrices", "banks"):
        module = block.get(name)
        if not isinstance(module, dict) or module.get("status") not in ("ready", "unavailable"):
            raise ValueError("Invalid native economy status")
        if module["status"] != "ready":
            if module.get("data") is not None:
                raise ValueError("Unavailable native economy has data")
            continue
        rows = module.get("data")
        if not isinstance(rows, list) or len(rows) > MAX_ROWS:
            raise ValueError("Invalid native economy rows")
        if name == "itemPrices" and (module.get("basis") != "registered-catalogue-before-transaction-multipliers"
                or module.get("gameMarketMultiplierIncluded") is not False or module.get("importMultiplierIncluded") is not False):
            raise ValueError("Unsupported native catalogue basis")
        seen = set()
        for row in rows:
            if not isinstance(row, dict):
                raise ValueError("Invalid native economy row")
            if name == "itemPrices":
                key = row.get("itemId")
                if not isinstance(key, str) or not key:
                    raise ValueError("Invalid native item identity")
                for field in ("wholesaleAmount", "defaultMarketAmount"):
                    catalogue_amount(row.get(field))
            else:
                address = row.get("address")
                if (not isinstance(address, dict) or not isinstance(address.get("street"), str) or not address["street"]
                        or type(address.get("number")) is not int or address["number"] < 0):
                    raise ValueError("Invalid native bank address")
                key = (address["street"], address["number"])
                if not isinstance(row.get("name"), str) or not row["name"]:
                    raise ValueError("Invalid native bank name")
                for field in ("capAmount", "interestMultiplier"):
                    catalogue_amount(row.get(field))
                for field in ("annualRatePercent", "yearsToPayLoan", "paybackDays"):
                    if type(row.get(field)) is not int or not 0 <= row[field] <= 2**31 - 1:
                        raise ValueError("Invalid native bank terms")
                if (row.get("eligibilityBasis") != "native-statements-and-wealth"
                        or row.get("securedAccountRules") not in ("provider-owned", "none")):
                    raise ValueError("Unsupported native bank eligibility")
            if key in seen:
                raise ValueError("Duplicate native economy identity")
            seen.add(key)


def native_economy(facts, name):
    """None means unknown, including a present newer model; [] is known empty."""
    block = (facts or {}).get("nativeEconomy") or {}
    if block.get("version") == 1 and block.get("model") == NATIVE_ECONOMY_MODEL:
        module = block.get(name) or {}
        if module.get("status") == "ready":
            return module["data"]
    return None


def lease_quote(row):
    """The live new-lease quote is separate from an existing signed rent."""
    quote = row.get("newLease") or {}
    if quote.get("version") == 1 and quote.get("status") == "ready":
        return quote["data"]
    return None


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
        if "signedDepositCents" in row and (type(row["signedDepositCents"]) is not int or not 0 <= row["signedDepositCents"] <= 2**53 - 1):
            raise ValueError("Invalid signed lease deposit")
        if "newLease" in row:
            quote = row["newLease"]
            if not isinstance(quote, dict) or type(quote.get("version")) is not int or quote["version"] < 1:
                raise ValueError("Invalid new lease quote version")
            if quote["version"] == 1:
                if quote.get("status") not in ("ready", "unavailable"):
                    raise ValueError("Invalid new lease quote status")
                value = quote.get("data")
                if quote["status"] == "unavailable":
                    if value is not None:
                        raise ValueError("Unavailable new lease quote has data")
                elif (not isinstance(value, dict)
                      or (value.get("basis"), value.get("depositBasis")) not in (
                          ("native-live-quote", "native-rent-times-deposit-days"), ("owned-no-lease", "owned-no-lease"))
                      or (value.get("basis") == "owned-no-lease" and (value.get("rentCents") != 0 or value.get("depositCents") != 0))
                      or any(type(value.get(k)) is not int or not 0 <= value[k] <= 2**53 - 1 for k in ("rentCents", "depositCents"))):
                    raise ValueError("Invalid new lease quote")
        if "capacity" not in row or (row["capacity"] is not None and not number(row["capacity"], -1)):
            raise ValueError("Invalid building capacity")
        marketing = row.get("marketing")
        if marketing is not None and (not isinstance(marketing, dict) or
                not all(number(marketing.get(k)) for k in ("reachMultiplier", "strength"))):
            raise ValueError("Invalid marketing multipliers")
    types = facts.get("marketingTypes")
    # Catalogue validity is independent of this client's calculation support.
    campaign_names = set(CAMPAIGNS)
    if types is not None:
        if not isinstance(types, list) or not types or len(types) > MAX_ROWS:
            raise ValueError("Invalid marketing campaign catalogue")
        ids, campaign_names = set(), set()
        for row in types:
            if (not isinstance(row, dict) or type(row.get("id")) is not int or row["id"] < 0 or
                    not isinstance(row.get("name"), str) or not row["name"] or
                    row["id"] in ids or row["name"] in campaign_names):
                raise ValueError("Invalid marketing campaign identity")
            ids.add(row["id"])
            campaign_names.add(row["name"])
            if not all(number(row.get(k)) for k in ("price", "reach")):
                raise ValueError("Invalid marketing campaign values")
    if "marketingModel" in facts and (not isinstance(facts["marketingModel"], str) or not facts["marketingModel"]):
        raise ValueError("Invalid marketing calculation model")
    agencies = facts.get("agencies")
    if not isinstance(agencies, list) or len(agencies) > MAX_ROWS:
        raise ValueError("Invalid marketing agencies")
    seen = set()
    for row in agencies:
        if (not isinstance(row, dict) or not isinstance(row.get("street"), str) or not row["street"] or
                type(row.get("number")) is not int or row["number"] < 0 or
                not isinstance(row.get("types"), list) or
                any(not isinstance(t, str) or t not in campaign_names for t in row["types"]) or
                len(set(row["types"])) != len(row["types"])):
            raise ValueError("Invalid marketing agency")
        key = row["street"], row["number"]
        if key in seen:
            raise ValueError("Duplicate marketing agency")
        seen.add(key)
    wholesalers = facts.get("wholesalers", [])  # optional before mod 0.7.0
    if not isinstance(wholesalers, list) or len(wholesalers) > MAX_ROWS:
        raise ValueError("Invalid wholesalers")
    seen = set()
    for row in wholesalers:
        if not isinstance(row, dict) or not isinstance(row.get("street"), str) or not row["street"] \
                or type(row.get("number")) is not int or row["number"] < 0:
            raise ValueError("Invalid wholesaler address")
        key = row["street"], row["number"]
        if key in seen:
            raise ValueError("Duplicate wholesaler")
        seen.add(key)
        fee = row.get("fee")
        products = row.get("products")
        if type(fee) not in (int, float) or not math.isfinite(fee) or fee < 0:
            raise ValueError("Invalid wholesale delivery fee")
        if not isinstance(products, list) or len(products) > MAX_ROWS or any(not isinstance(p, str) or not p for p in products) \
                or len(set(products)) != len(products):
            raise ValueError("Invalid wholesale products")
    vehicles = facts.get("vehiclePrices")
    if "vehiclePrices" in facts:
        if (not isinstance(vehicles, dict) or type(vehicles.get("schemaVersion")) is not int or
                vehicles["schemaVersion"] < 1 or not isinstance(vehicles.get("model"), str) or not vehicles["model"]):
            raise ValueError("Invalid vehicle price catalogue metadata")
        # An independently versioned optional block may change its payload
        # shape. Only this client's supported model has known field rules;
        # the whole-document finite-number/size check above still applies.
        if vehicles["schemaVersion"] == 1 and vehicles["model"] == VEHICLE_MODEL:
            prices = vehicles.get("prices")
            if (not isinstance(prices, dict) or len(prices) > MAX_ROWS or
                    any(not isinstance(k, str) or not k or not number(v) for k, v in prices.items())):
                raise ValueError("Invalid vehicle price catalogue")
    economy = facts.get("economy")
    if "economy" in facts:
        if (not isinstance(economy, dict) or type(economy.get("schemaVersion")) is not int or
                economy["schemaVersion"] < 1 or not isinstance(economy.get("model"), str) or not economy["model"]):
            raise ValueError("Invalid economy capability metadata")
        if economy["schemaVersion"] == 1 and economy["model"] == ECONOMY_MODEL:
            providers = economy.get("providers")
            if not isinstance(providers, list) or len(providers) > MAX_ROWS:
                raise ValueError("Invalid economy providers")
            seen = set()
            for provider in providers:
                if (not isinstance(provider, dict) or not isinstance(provider.get("id"), str) or not provider["id"] or
                        provider["id"] in seen or not isinstance(provider.get("version"), str) or not provider["version"] or
                        provider.get("status") not in ("observed", "unavailable")):
                    raise ValueError("Invalid economy provider identity")
                seen.add(provider["id"])
                rules = provider.get("rules")
                if (not isinstance(rules, dict) or len(rules) > MAX_ROWS or
                        any(not isinstance(k, str) or not k or (v is not None and type(v) is not bool) for k, v in rules.items()) or
                        (provider.get("runningCostsAvailable") is not None and type(provider["runningCostsAvailable"]) is not bool)):
                    raise ValueError("Invalid economy provider observations")
    if "nativeEconomy" in facts:
        _native_economy(facts["nativeEconomy"])
    return facts


def marketing_supported(facts):
    """Calculation support after validate(); absent runtime facts use baseline rules."""
    if not facts:
        return True
    types = facts.get("marketingTypes")
    return (facts.get("marketingModel", MARKETING_MODEL) == MARKETING_MODEL and
            isinstance(types, list) and len(types) == len(CAMPAIGNS) and
            all(row["id"] == i and row["name"] == name
                for i, (row, name) in enumerate(zip(types, CAMPAIGNS))))


def vehicle_prices(facts):
    """Validated bank-wealth values, or None when this catalogue is unavailable."""
    block = (facts or {}).get("vehiclePrices")
    if block and block["schemaVersion"] == 1 and block["model"] == VEHICLE_MODEL:
        return dict(block["prices"])
    return None


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
        # One baseline scan per (type, size), not per record: up to MAX_ROWS
        # records against the whole table otherwise.
        areas_of = {}
        for street, n, size, version, area in records:
            row = table.get((street, n))
            if row is None:
                continue
            group = row.get("t"), size
            areas = areas_of.get(group)
            if areas is None:
                areas = areas_of[group] = {r["m"] for r in baseline.values()
                                           if r.get("t") == group[0] and r.get("z") == size}
            known = (row.get("t"), size, version) in layouts and len(areas) == 1
            row.update(z=size, v=version, m=next(iter(areas)) if known else None,
                       propertyArea=area, factsSource="alcware", layoutKnown=known)
            if not known:
                row.update(layoutCapacity=None, factsUnavailable=True)
    # save.facts is set only by ba_save.load_save(), after unpack() validated
    # it against the save's hash and load_save() matched its character.
    facts = getattr(save, "facts", None)
    if facts:
        types = facts.get("marketingTypes") if marketing_supported(facts) else None
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
            for field in ("newLease", "signedDepositCents"):
                if field in item:
                    row[field] = item[field]
            if item.get("marketing") is not None and types is not None:
                row["marketingRules"] = {**item["marketing"], "types": types}
                if item["capacity"] == 0:
                    row["marketingRules"]["reachMultiplier"] = 0
            else:
                row["marketingUnavailable"] = True
                row.pop("marketingRules", None)
    return table
