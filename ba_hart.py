"""HART companion v1: provider-owned models and explicit effective state.

No model is inferred from retained private mod records. This reader runs unchanged
in the local CLI and Pyodide; transport and freshness belong to ba_companion.
"""
from __future__ import annotations

import ba_companion as companion
from ba_companion import integer as _int, text as _text, boolean as _bool, rows as _rows

KEY = "hartmodpack:companion"
MARKER = "bigcopilot:hart-snapshot.v1"
CAPABILITIES = ("runtime", "rent", "runningCosts", "factoryPurchases", "retailDemand")


def _object(value):
    if not isinstance(value, dict):
        raise ValueError("Invalid HART record")
    return value


def _enum(value, choices):
    if value not in choices or type(value) is not type(choices[0]):
        raise ValueError("Unsupported HART value")
    return value


def _constant(data, **values):
    for key, value in values.items():
        if type(data.get(key)) is not type(value) or data[key] != value:
            raise ValueError("Unsupported HART model")


def _nullable_text(value):
    return None if value is None else _text(value)


def _feature(value):
    value = _object(value)
    requested = _bool(value["requested"])
    effective = value["effective"]
    if effective is not None:
        _bool(effective)
    if effective is True and not requested:
        raise ValueError("Inconsistent HART effective state")
    return {"requested": requested, "effective": effective,
            "state": _text(value["state"]), "reason": _nullable_text(value["reason"])}


def _address(row):
    value = _object(row["address"])
    return (_text(value["street"]), _int(value["number"]))


def _strings(value):
    if not isinstance(value, list) or len(value) > companion.MAX_ROWS:
        raise ValueError("Invalid HART identities")
    out = [_text(item) for item in value]
    if len(out) != len(set(out)):
        raise ValueError("Duplicate HART identity")
    return out


def _nested(value, validate):
    # A malformed nested capability does not poison its siblings.
    try:
        value = _object(value)
        _constant(value, version=1)
        status = _enum(value["status"], companion.STATES)
        reason = _nullable_text(value.get("reason"))
        data = validate(value["data"]) if status == "ready" else None
        if status != "ready" and value["data"] is not None:
            raise ValueError("Nonready HART data")
        return {"version": 1, "status": status, "reason": reason, "data": data}
    except (ValueError, TypeError, KeyError, OverflowError):
        return {"version": 1, "status": "unavailable", "reason": "invalid-module", "data": None}


def _runtime(data):
    data = _object(data)
    active, blocked = _bool(data["gameplayActive"]), _bool(data["blockedByLegacy"])
    if active and blocked:
        raise ValueError("Inconsistent HART owner")
    rules = {_text(key): _feature(value) for key, value in _object(data["rules"]).items()}
    if (not active or blocked) and any(r["effective"] is True for r in rules.values()):
        raise ValueError("Inactive HART owner has effective rules")
    targets = []
    for row in _rows(data["targets"], lambda r: _text(r["id"])):
        targets.append({"id": row["id"], "assemblyName": _text(row["assemblyName"]),
                        "state": _enum(row["state"], ("missing", "verified", "compatible", "refused", "incompatible"))})
    return {"gameplayActive": active, "blockedByLegacy": blocked,
            "rloReview": _enum(data["rloReview"], ("accepted", "refused", "undecided", "absent")),
            "rules": rules, "targets": targets}


def _rent(data):
    data = _object(data)
    _constant(data, model="hart-rent-v1", rounding="ceil-whole-money",
              appliesTo="new-lease-market-rent", signedLeases="unchanged")
    out = {k: data[k] for k in ("model", "rounding", "appliesTo", "signedLeases")}
    out.update(state=_feature(data["state"]), residentialTypeId=_text(data["residentialTypeId"]))
    for key in ("residentialMultiplierThousandths", "otherMultiplierThousandths"):
        out[key] = _int(data[key], 1)
    return out


def _costs(data):
    data = _object(data)
    constants = dict(model="hart-running-costs-v1", referenceHours=12, closedShareThousandths=250,
                     priceLevelMin=500, priceLevelMax=4000, seatMonthCentsAtBasePrice=15000)
    _constant(data, **constants)
    out = dict(constants, equipment=_feature(data["equipment"]), officeIt=_feature(data["officeIt"]),
               officeTypeIds=_strings(data["officeTypeIds"]), items=[], currentSites=[])
    load_keys = ("openWatts", "alwaysWatts", "litresPerOpenHour")
    for row in _rows(data["items"], lambda r: _text(r["itemId"])):
        out["items"].append(dict(itemId=row["itemId"], officeSeat=_bool(row["officeSeat"]),
                                 **{k: _int(row[k]) for k in load_keys}))
    for row in _rows(data["currentSites"], _address):
        street, number = _address(row)
        _constant(row, itBasis="included-in-rlo-internet-accrual")
        status = _enum(row["itStatus"], ("ready", "unavailable"))
        cents = row["itSeatDayCents"]
        if status == "ready":
            _int(cents)
        elif cents is not None:
            raise ValueError("Unknown HART IT cost must be null")
        out["currentSites"].append(dict(address={"street": street, "number": number},
            equipmentApplies=_bool(row["equipmentApplies"]),
            inputBasis=_enum(row["inputBasis"], ("billing-cache", "current-items")),
            officeSeats=_int(row["officeSeats"]), itSeatDayCents=cents, itStatus=status,
            itDay=_int(row["itDay"]), itBasis=row["itBasis"], **{k: _int(row[k]) for k in load_keys}))
    return out


def _held(data):
    out = []
    if not isinstance(data, list) or len(data) > companion.MAX_ROWS:
        raise ValueError("Invalid HART held records")
    # Attempts are historical records, not unique course identities: retakes may repeat.
    for row in data:
        _object(row)
        out.append(dict(courseId=_enum(row["courseId"], (18, 19, 34)),
            kind=_enum(row["kind"], ("enrollment", "result")), stage=_int(row["stage"], 0, 6),
            heldSinceDay=_int(row["heldSinceDay"])))
    return out


def _factory(data):
    data = _object(data)
    _constant(data, model="hart-factory-purchase-gate-v1", restriction="purchase-only")
    education = _object(data["education"])
    _constant(education, provider="rlo", module="education", minimumVersion=1)
    courses, items = [], set()
    for row in _rows(data["courses"], lambda r: _int(r["courseId"])):
        course = dict(courseId=_enum(row["courseId"], (18, 19, 34)), courseKey=_text(row["courseKey"]),
                      itemIds=_strings(row["itemIds"]), campus=_enum(row["campus"], ("school",)),
                      distanceAllowed=_bool(row["distanceAllowed"]), needsDegree=_bool(row["needsDegree"]))
        for key in ("baseFeeCents", "sessions", "homeworkPieces"):
            course[key] = _int(row[key])
        for key, low, high in (("hoursPerSession", 1, 24), ("fullTimeStartHour", 0, 23), ("fullTimeWeekdayMask", 0, 127)):
            course[key] = _int(row[key], low, high)
        needs = row["needsAnyCourseIds"]
        if not isinstance(needs, list):
            raise ValueError("Invalid HART prerequisites")
        course["needsAnyCourseIds"] = [_int(v, 0, 63) for v in needs]
        if len(set(needs)) != len(needs) or items.intersection(course["itemIds"]):
            raise ValueError("Duplicate HART course mapping")
        items.update(course["itemIds"])
        courses.append(course)
    return dict(model=data["model"], restriction=data["restriction"], gate=_feature(data["gate"]),
                education={k: education[k] for k in ("provider", "module", "minimumVersion")},
                courses=courses, heldRecords=_nested(data["heldRecords"], _held))


def _cafe(data):
    data = _object(data)
    _constant(data, model="hart-cafe-stations-v1", sessionsPerStationPerHour=2)
    sites = []
    for row in _rows(data["currentSites"], _address):
        street, number = _address(row)
        status = _enum(row["status"], ("ready", "unavailable"))
        stations = row["usableStations"]
        if status == "ready":
            _int(stations)
        elif stations is not None:
            raise ValueError("Unknown HART cafe stations must be null")
        sites.append(dict(address={"street": street, "number": number}, status=status,
                          reason=_nullable_text(row["reason"]), usableStations=stations))
    return dict(model=data["model"], sessionsPerStationPerHour=2, state=_feature(data["state"]), currentSites=sites)


def _ambience(data):
    # v1 intentionally has no usable score model until its owner publishes inputs.
    raise ValueError("HART ambience model inputs unavailable")


def _retail(data):
    data = _object(data)
    _constant(data, ambienceModel="hart-ambience-demand-v1", officeAmbience="unchanged")
    return dict(ambienceModel=data["ambienceModel"], officeAmbience="unchanged",
                cafe=_nested(data["cafe"], _cafe), ambience=_nested(data["ambience"], _ambience))


VALIDATORS = dict(zip(CAPABILITIES, (_runtime, _rent, _costs, _factory, _retail)))


def read(save):
    """Read and normalize each module once per immutable Save."""
    return companion.read(save, provider="hart-mod-pack", key=KEY, marker=MARKER,
                          validators=VALIDATORS, required=CAPABILITIES,
                          evidence=("hartmodpack:", "hardmodepatch:"))


def module(save, name):
    report = read(save)
    value = (report or {}).get("modules", {}).get(name, {})
    return value.get("data") if value.get("status") == "ready" else None


def metadata(save):
    report = read(save)
    if report is None:
        return None
    out = {k: report[k] for k in ("status", "source", "version")}
    out["capabilities"] = {k: v["status"] for k, v in report["modules"].items()}
    runtime = module(save, "runtime")
    if runtime is not None:
        out.update({k: runtime[k] for k in ("gameplayActive", "blockedByLegacy", "rloReview")})
    return out
