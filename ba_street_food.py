"""Read Street Food schemas 1 and 2 and public route-planning facts.

The accounting contract is FoodTrucks.Core.Saves.SalesLedger and
StreetFoodStatement (0.10.0). Money stays in cents until it reaches the board.
Presence in a save is not proof that a mod is running. Link snapshots explicitly
mark whether the live provider supplied the state captured with the save.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path
from functools import lru_cache

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
        if type(state.get("schemaVersion")) is not int or state["schemaVersion"] not in (1, 2):
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
                      snapshot=snapshot,
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


@lru_cache(maxsize=1)
def planning_rules():
    # Loaded only by the on-demand section; the worker fetches this public file.
    folder = Path("/data") if sys.platform == "emscripten" else Path(__file__).parent
    return json.loads((folder / "ba_street_food_rules.json").read_text(encoding="utf-8"))


def _point(value):
    if not isinstance(value, dict):
        return None
    if all(type(value.get(k)) in (int, float) and math.isfinite(value[k]) and abs(value[k]) <= 1e6 for k in ("x", "z")):
        return {k: value[k] for k in ("x", "z")}
    return None


def _week(value):
    # SaveCodec writes DayOfWeek as a number (Sunday zero); older hand-made
    # data may name it. Do not silently interpret unknown values as Monday.
    days = ("sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday")
    if isinstance(value, str) and value.lower() in days:
        value = days.index(value.lower())
    return (value + 6) % 7 if type(value) is int and 0 <= value <= 6 else None


def _schedule(value):
    if value is None:
        return None
    if not isinstance(value, dict):
        raise ValueError("Invalid route")
    stops, crew = [], []
    closed = {_week(v) for v in value.get("closed", [])}
    for index, row in enumerate(_rows(value.get("stops", []))):
        point = _point(row)
        if not point or type(row.get("openAt")) is not int or type(row.get("closeAt")) is not int:
            raise ValueError("Invalid route stop")
        days = [_week(row["day"])] if "day" in row else [_week(d) for d in (value.get("days") or list(range(7)))]
        for day in days:
            if day is None:
                raise ValueError("Invalid route weekday")
            stops.append({"id": f"{day}:{index}", "name": str(row.get("spotKey") or ""), "key": row.get("spotKey"),
                          "day": day, **point, "open": row["openAt"], "close": row["closeAt"],
                          **{k: row[k] for k in ("y", "heading") if type(row.get(k)) in (int, float) and math.isfinite(row[k])}})
    for row in _rows(value.get("crewShifts", [])):
        day = _week(row.get("day"))
        if day is None or not isinstance(row.get("employeeId"), str) or any(type(row.get(k)) is not int for k in ("start", "end")):
            raise ValueError("Invalid crew hours")
        crew.append({"id": row["employeeId"], "day": day, "start": row["start"] * 60, "end": row["end"] * 60})
    return {"days": sorted({s["day"] for s in stops} - closed), "stops": stops, "crewHours": crew}


def planner(save, names, buildings, open_hours):
    """Map evidence and the player's routes, without hidden scoring inputs."""
    data, published = read(save), planning_rules()
    state = data.get("state") if data else None
    snapshot = (data.get("snapshot") or {}) if data else {}
    today = save.root.get("Day", 1)
    output = {"status": data["status"] if data else "absent", "version": data.get("version") if data else None,
              "schemaVersion": state.get("schemaVersion") if state else None, "day": today,
              "weekday": (today - 1) % 7, "minute": int(save.root.get("Hour", 0) * 60 + save.root.get("Minute", 0)),
              "gameSpeed": 1, "travelBasis": "default", "rules": published["rules"], "vehicles": [], "opportunities": []}
    speed = snapshot.get("gameSpeed")
    if type(speed) in (float, int) and math.isfinite(speed) and speed > 0:
        output.update(gameSpeed=speed, travelBasis="live")
    classifier = published["classifier"]
    by_address = {}
    for reg in save.items(save.root.get("BuildingRegistrations")):
        address = save.address(reg.get("address"))
        # Registrations flatten their address in ordinary ES3 saves.
        if not address and reg.get("StreetName") is not None and reg.get("StreetNumber") is not None:
            address = (reg["StreetName"], reg["StreetNumber"])
        if address not in buildings:
            continue
        row = buildings[address]
        key = f"{address[0]}#{address[1]}"
        kind = reg.get("businessTypeName") or ""
        categories = classifier["businessTypes"].get(kind, classifier["buildingTypes"].get("ba:buildingtype_" + row["t"], []))
        categories = [c for c in categories if c != "transit"]
        if kind in ("ba:businesstype_cinema", "ba:businesstype_theater") or row["t"] in ("cinema", "theater"):
            categories = [c for c in categories if c != "nightlife"] + ["shows"]
        hours = open_hours(save, reg) if "scheduleDays" in reg else None
        item = {"key": key, "address": names.addr(address), "name": reg.get("BusinessName") or names.addr(address),
                "type": names.label(kind, "") if kind else row["t"], "hood": row.get("h", ""), "kind": "building",
                "categories": categories, "hours": [[[a * 60, b * 60] for a, b in hours[(i + 1) % 7]] for i in range(7)] if hours else None,
                "closed": bool(reg.get("temporarilyClosed")), "x": None, "z": None}
        output["opportunities"].append(item)
        by_address[key] = item
    def place(row, kind, **extra):
        base = by_address.get(row["address"], {})
        return {"key": f"{kind}:{row['id']}", "buildingKey": row["address"], "address": base.get("address", row["address"]),
                "name": row["name"], "type": "", "hood": base.get("hood", ""), "kind": kind,
                "categories": row.get("categories", []), "hours": None, "closed": False, "x": None, "z": None, **extra}
    output["opportunities"].extend(place(row, "pitch") for row in published["pitches"])
    bays = (state.get("commissary") or {}).get("bays", {}) if state else {}
    homes = {}
    for row in published["commissaries"]:
        saved = bays.get(row["id"], {})
        points = saved.get("points", []) if isinstance(saved, dict) else []
        points = points if isinstance(points, list) else []
        point = next((p for p in (_point(v) for v in points) if p), None) or _point(row.get("bay"))
        homes[row["id"]] = {**point, "name": row["name"]} if point else None
        output["opportunities"].append(place(row, "commissary", **(point or {})))
    if state:
        places = {r["id"]: r for r in published["eventPlaces"]}
        events = state.get("events", {})
        events = events.get("events", []) if isinstance(events, dict) else []
        for event in events if isinstance(events, list) else []:
            if not isinstance(event, dict) or not all(type(event.get(k)) is int for k in ("announcedDay", "day", "start", "end")):
                continue
            location, kind = places.get(event.get("placeId")), published["eventKinds"].get(event.get("kind"))
            if not location or not kind or event["announcedDay"] > today or event["day"] < today:
                continue
            hours = [[] for _ in range(7)]
            hours[(event["day"] - 1) % 7] = [[event["start"], event["end"]]]
            output["opportunities"].append(place({**location, "id": str(event.get("id")), "name": kind["name"], "categories": kind["categories"]},
                                                "event", hours=hours, eventDay=event["day"], booked=event.get("booked", 0)))
        employees = {p.get("id"): p for p in save.items(save.root.get("EmployeeInstances"))}
        vehicles = {p.get("id"): p for field in ("VehicleInstances", "privateDriverVehicleInstances") for p in save.items(save.root.get(field))}
        spaces = {p.get("vehicleId"): p.get("commissaryId") for p in (state.get("commissary") or {}).get("spaces", [])}
        revisions = snapshot.get("routeRevisions")
        revisions = revisions if isinstance(revisions, dict) else {}
        numbers = state.get("vehicleNumbers")
        numbers = numbers if isinstance(numbers, list) else []
        for row in state.get("vehicles", []):
            ident = row["vehicleId"]
            physical = vehicles.get(ident)
            if not physical or physical.get("vehicleTypeName") not in VEHICLES:
                continue
            kind = "truck" if physical["vehicleTypeName"].endswith("foodtruck") else "cart"
            try:
                schedule = _schedule(row.get("schedule"))
                route_status = "ready"
            except (ValueError, TypeError, KeyError):
                schedule, route_status = None, "unavailable"
            label = names.label(physical["vehicleTypeName"], kind.title())
            # Match the mod's stable displayed numbers; never use an opaque ID
            # suffix as a vehicle name. Old saves may not have numbers yet.
            number = next((n["number"] for n in numbers if isinstance(n, dict) and n.get("id") == ident
                           and n.get("kind") == physical["vehicleTypeName"]
                           and type(n.get("number")) is int and n["number"] > 0), None)
            of_kind = sum(v.get("vehicleTypeName") == physical["vehicleTypeName"] for v in vehicles.values())
            if number and of_kind > 1:
                label += f" {number}"
            output["vehicles"].append({"id": ident, "name": label,
                "kind": kind, "position": _point(save.deref(physical.get("position"))), "home": homes.get(spaces.get(ident)),
                "crew": [{"id": e, "name": (save.deref(employees[e].get("characterData")) or {}).get("name", e) if e in employees else e,
                          "exists": e in employees} for e in row.get("crew", [])], "schedule": schedule, "routeStatus": route_status,
                "routeRevision": revisions.get(ident) if isinstance(revisions.get(ident), str) else None})
    output["opportunities"].sort(key=lambda r: r["key"])
    output["vehicles"].sort(key=lambda r: r["id"])
    return output


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
