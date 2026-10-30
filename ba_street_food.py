"""Read Street Food schema 1; no game code or filesystem dependencies.

The accounting contract is FoodTrucks.Core.Saves.SalesLedger and
StreetFoodStatement (0.10.0). Money stays in cents until it reaches the board.
Presence in a save is not proof that a mod is running. Link snapshots explicitly
mark whether the live provider supplied the state captured with the save.
"""
from __future__ import annotations

import json
import math

KEY = "foodtrucks:state"
SNAPSHOT_KEY = "bigcopilot:street-food-snapshot.v1"
VEHICLES = {"foodtrucks:vehicletype_foodcart", "foodtrucks:vehicletype_foodtruck"}
# Source: Street Food 0.10.0 CartAssets/TruckAssets. Runtime prices, when
# supplied by the snapshot provider, take precedence over these defaults.
PRICES = {"foodtrucks:vehicletype_foodcart": 1200, "foodtrucks:vehicletype_foodtruck": 15000}
PARKING_STREET = "ba:street_parking"
COMMISSARY_EXPENSE = "foodtrucks:transaction_commissary_label"
MAX_BYTES = 8 * 1024 * 1024
MAX_ROWS = 10000
MAX_CENTS = 2**53 - 1


def _int(value, signed=False):
    if type(value) is not int or not (-MAX_CENTS if signed else 0) <= value <= MAX_CENTS:
        raise ValueError("Invalid Street Food integer")
    return value


def _rows(value):
    if not isinstance(value, list) or len(value) > MAX_ROWS or any(not isinstance(r, dict) for r in value):
        raise ValueError("Invalid Street Food records")
    return value


def _ids(rows, key):
    values = [r.get(key) for r in rows]
    if any(not isinstance(v, str) or not v or len(v) > 512 for v in values) or len(set(values)) != len(values):
        raise ValueError("Invalid Street Food identities")


def _object(raw):
    if not isinstance(raw, str) or len(raw) > MAX_BYTES:
        raise ValueError("Invalid Street Food data")
    obj = json.loads(raw, parse_constant=lambda _: (_ for _ in ()).throw(ValueError("Non-finite number")))
    if not isinstance(obj, dict):
        raise ValueError("Invalid Street Food object")
    return obj


def read(save):
    """One immutable parsed view per Save; None for a save with no evidence."""
    if hasattr(save, "_street_food"):
        return save._street_food
    data = {p.get("$k"): save.deref(p.get("$v")) for p in save.items(save.root.get("modData"))
            if isinstance(p, dict) and isinstance(p.get("$k"), str)}
    vehicles = [v for field in ("VehicleInstances", "privateDriverVehicleInstances")
                for v in save.items(save.root.get(field)) if isinstance(v, dict)]
    physical = {v.get("id") for v in vehicles if v.get("vehicleTypeName") in VEHICLES}
    if KEY not in data and SNAPSHOT_KEY not in data and not physical:
        save._street_food = None
        return None
    result = {"status": "unavailable", "live": False, "vehicles": len(physical),
              "state": None, "crew": set(), "commissaries": {}, "prices": dict(PRICES)}
    try:
        snapshot = _object(data[SNAPSHOT_KEY]) if SNAPSHOT_KEY in data else None
        # Portable exports retain validated Link facts after the live-source
        # flag is lost on reopening. Older links cannot attest to mod freshness.
        if snapshot is None and (getattr(save, "live_source", False)
                                 or getattr(save, "facts", None) is not None):
            snapshot = {"status": "unavailable"}
        if snapshot is not None:
            result["live"] = True
            result["fresh"] = snapshot.get("status") == "fresh"
        state = _object(data.get(KEY))
        if type(state.get("schemaVersion")) is not int or state["schemaVersion"] != 1:
            raise ValueError("Unsupported Street Food schema")
        fleet = _rows(state.get("vehicles", []))
        _ids(fleet, "vehicleId")
        crew = set()
        for vehicle in fleet:
            ids = vehicle.get("crew", [])
            if not isinstance(ids, list) or len(ids) > MAX_ROWS or any(not isinstance(i, str) or not i for i in ids):
                raise ValueError("Invalid Street Food crew")
            if vehicle["vehicleId"] in physical:
                crew.update(ids)
        days = _rows(state.get("dailySales", []))
        seen = set()
        for day in days:
            number = _int(day.get("day"))
            if number in seen:
                raise ValueError("Duplicate Street Food day")
            seen.add(number)
            for key in ("revenueCents", "costCents", "licenceCents", "eventPlacesCents", "deliveryFeesCents"):
                _int(day.get(key, 0), key in ("eventPlacesCents", "deliveryFeesCents"))
            if "summaryCents" in day and day["summaryCents"] is not None:
                _int(day["summaryCents"], True)
            if type(day.get("inSummary", False)) is not bool:
                raise ValueError("Invalid summary flag")
            entries = _rows(day.get("byVehicle", []))
            _ids(entries, "vehicleId")
            for entry in entries:
                for key in ("salesCents", "cateringCents", "stockCents", "wagesCents", "parkingCents",
                            "permitCents", "commissaryRentCents", "overnightFineCents"):
                    _int(entry.get(key, 0))
        commissary = state.get("commissary", {})
        if not isinstance(commissary, dict):
            raise ValueError("Invalid commissaries")
        sites = set()
        for row in _rows(commissary.get("spaces", [])):
            if not isinstance(row.get("commissaryId"), str) or not row["commissaryId"]:
                raise ValueError("Invalid commissary identity")
            sites.add(row["commissaryId"])
        for key in ("stock", "bays"):
            table = commissary.get(key, {})
            if not isinstance(table, dict):
                raise ValueError("Invalid commissary table")
            if any(not key or len(key) > 512 for key in table):
                raise ValueError("Invalid commissary identity")
            sites.update(table)
        # Names are mod data, never markup. The page escapes them normally.
        mapped = {address_number(i): i for i in sorted(sites)}
        if len(mapped) != len(sites):
            raise ValueError("Commissary address collision")
        result.update(status="ready", state=state, crew=crew, commissaries=mapped,
                      version=state.get("writtenByModVersion") if isinstance(state.get("writtenByModVersion"), str) else None)
        if snapshot is not None and not result.get("fresh"):
            result["status"] = "stale"
        if snapshot and isinstance(snapshot.get("vehiclePrices"), dict):
            for kind, price in snapshot["vehiclePrices"].items():
                if kind in VEHICLES and type(price) in (int, float) and math.isfinite(price) and 0 <= price <= 1e9:
                    result["prices"][kind] = price
    except (ValueError, TypeError, RecursionError, OverflowError):
        pass
    save._street_food = result
    return result


def metadata(save):
    data = read(save)
    if data is None:
        return None
    return {k: data[k] for k in ("status", "vehicles", "live", "version") if k in data}


def reserved(save, employee):
    """Never offer a vehicle's crew to a building. Unknown state is conservative."""
    data = read(save)
    if data is None:
        return False
    if data["status"] != "ready":
        return not save.address(employee.get("assignedAddress"))
    return employee.get("id") in data["crew"] and not save.address(employee.get("assignedAddress"))


def address_number(identity):
    """CommissaryLogistics.AddressNumber: FNV-1a over C# UTF-16 characters."""
    value = 2166136261
    raw = identity.encode("utf-16-le", errors="surrogatepass")
    for at in range(0, len(raw), 2):
        value = ((value ^ int.from_bytes(raw[at:at + 2], "little")) * 16777619) & 0xffffffff
    return -1 - (value & 0x3fffffff)


def is_commissary(address):
    return bool(address and address[0] == PARKING_STREET and type(address[1]) is int and address[1] < 0)


def commissary_name(save, address):
    data = read(save)
    identity = data["commissaries"].get(address[1]) if data else None
    return identity


def days(save):
    data = read(save)
    return data["state"].get("dailySales", []) if data and data["state"] is not None else []


def statement(save, summary):
    """Fleet contribution reconciled to the stored total, with no second booking."""
    day = next((d for d in days(save) if d["day"] == summary.get("dayNumber") and d.get("inSummary")), None)
    if day is None:
        return None
    entries = day.get("byVehicle", [])
    wages = sum(v.get("wagesCents", 0) for v in entries)
    parking = sum(v.get("parkingCents", 0) for v in entries)
    # These costs are already included in totalProfit by the game. Move only
    # the portion its saved rows actually hold (StreetFoodStatement's 5c slack).
    game_wages = round(abs(summary.get("totalUnassignedStaffWages", 0)) * 100)
    game_parking = round(abs(summary.get("parkingFees", 0)) * 100)
    wages = wages if game_wages > 0 and wages <= game_wages + 5 else 0
    parking = parking if game_parking > 0 and parking <= game_parking + 5 else 0
    revenue, stock = day.get("revenueCents", 0), day.get("costCents", 0)
    added = day.get("summaryCents")
    if added is None:
        added = revenue - stock
    costs = day.get("licenceCents", 0) + day.get("eventPlacesCents", 0) + day.get("deliveryFeesCents", 0)
    costs += sum(v.get("permitCents", 0) + v.get("commissaryRentCents", 0) + v.get("overnightFineCents", 0) for v in entries)
    return {"revenue": revenue / 100, "cogs": stock / 100, "wages": wages / 100,
            "parking": parking / 100, "otherCosts": costs / 100,
            "adjustment": (added - (revenue - stock - costs)) / 100,
            "profit": (added - wages - parking) / 100}


def protected_sites(save):
    """Upstream sites whose sizing is incomplete until commissary demand exists.

    Follow whole sites, including factory transformations, rather than treating
    a factory input as unrelated to the food it makes. Other networks stay usable.
    """
    plans = save.items(save.root.get("logisticsManagerPlans"))
    edges = []
    protected = set()
    for plan in plans:
        source = save.address(plan.get("targetAddress"))
        for dest in save.items(plan.get("destinations")):
            address = save.address(dest.get("deliveryTargetAddress"))
            if source and address:
                edges.append((source, address))
                if is_commissary(address):
                    protected.add(source)
    changed = True
    while changed:
        changed = False
        for source, dest in edges:
            if dest in protected and source not in protected:
                protected.add(source)
                changed = True
    return protected


def restrict_supply(save, businesses, supply):
    """Keep recorded routes, but withhold advice sized without fleet demand."""
    keys = {f"{street}#{number}" for street, number in protected_sites(save)}
    affected = {i for i, business in enumerate(businesses) if business["key"] in keys}
    if not affected:
        return supply
    supply["streetFoodRestricted"] = sorted(affected)
    def unknown(fact):
        if not isinstance(fact, dict):
            return
        fact.update(st="new", why="streetFood", lvl="info", use=None, need=None,
                    setTo=None, lower=None, imp=False)
        for key in ("dem", "import"):
            if key in fact:
                unknown(fact[key])
    for index in affected:
        for fact in supply["facts"].get(str(index), {}).values():
            unknown(fact)
    for key in ("imports", "importsDem", "idle"):
        supply[key] = [row for row in supply[key] if row["s"] not in affected]
    for site in supply["factories"].get("sites", []):
        if site["s"] in affected:
            site["streetFoodRestricted"] = True
    return supply
