"""RLO companion contract v1: observations, never a second economic simulation.

The same bounded reader runs in CPython and Pyodide. Capability failures stay
local, ordinary game statements remain authoritative, and retained records are
never evidence that RLO is installed or currently running. See contracts/rlo/.
"""
from __future__ import annotations

import hashlib
import json
import math

KEY = "reallife:companion"
MARKER = "bigcopilot:rlo-snapshot.v1"
MAX_BYTES = 4 * 1024 * 1024
MAX_ROWS = 10000
MAX_INT = 2**53 - 1
CAPABILITIES = ("features", "businesses", "employment", "credit", "accounting")
STATES = ("ready", "disabled", "unavailable", "failed")


def _int(value, low=0, high=MAX_INT):
    if type(value) is not int or not low <= value <= high:
        raise ValueError("Invalid RLO integer")
    return value


def _text(value):
    if not isinstance(value, str) or not value or len(value) > 1024:
        raise ValueError("Invalid RLO text")
    value.encode("utf-8")  # Reject lone surrogates before a value can reach the payload.
    return value


def _bool(value):
    if type(value) is not bool:
        raise ValueError("Invalid RLO boolean")


def _pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate RLO field")
        result[key] = value
    return result


def _object(raw):
    if not isinstance(raw, str) or len(raw) > MAX_BYTES or len(raw.encode("utf-8")) > MAX_BYTES:
        raise ValueError("Invalid RLO capture")
    value = json.loads(raw, object_pairs_hook=_pairs,
                       parse_constant=lambda _: (_ for _ in ()).throw(ValueError("Non-finite RLO number")))
    if not isinstance(value, dict):
        raise ValueError("Invalid RLO object")
    return value


def _rows(data, identity):
    if not isinstance(data, list) or len(data) > MAX_ROWS:
        raise ValueError("Invalid RLO rows")
    seen = set()
    for row in data:
        if not isinstance(row, dict):
            raise ValueError("Invalid RLO record")
        key = identity(row)
        if key in seen:
            raise ValueError("Duplicate RLO identity")
        seen.add(key)
    return data


def _validate(name, data):
    if name == "accounting":
        if not isinstance(data, dict) or any(data.get(k) != v for k, v in
                (("source", "game.financialSummaries"), ("coverage", "statement-backed-only"), ("adjustment", "none"))):
            raise ValueError("Unsupported RLO accounting")
        return {k: data[k] for k in ("source", "coverage", "adjustment")}
    rows = _rows(data, (lambda r: (_text(r.get("street")), _int(r.get("number")))) if name == "businesses"
                 else lambda r: _text(r.get("employeeId" if name == "employment" else "id")))
    result = []
    for row in rows:
        if name == "features":
            _bool(row.get("enabled"))
            _bool(row.get("running"))
            keys = ("id", "enabled", "running")
        elif name == "businesses":
            _text(row.get("name"))
            _text(row.get("typeId"))
            _bool(row.get("temporarilyClosed"))
            keys = ("street", "number", "name", "typeId", "temporarilyClosed")
        elif name == "employment":
            keys = ("employeeId", "baseHourlyCents", "cityHourlyCents", "raiseHourlyCents", "ordinaryHourlyCents")
            for key in keys[1:]:
                _int(row.get(key), -MAX_INT if key == "cityHourlyCents" else 0)
            if sum(row[k] for k in keys[1:4]) != row["ordinaryHourlyCents"]:
                raise ValueError("RLO hourly wage does not reconcile")
        elif name == "credit":
            keys = ("id", "kind", "balanceCents", "paymentTomorrowCents", "annualRateBasisPoints", "frozen", "includedInGameLoans")
            _text(row.get("kind"))
            for key in keys[2:5]:
                _int(row.get(key))
            _bool(row.get("frozen"))
            if row.get("includedInGameLoans") is not False:
                raise ValueError("Unsupported RLO debt provenance")
        else:
            raise ValueError("Unsupported RLO capability")
        result.append({k: row[k] for k in keys})
    return result


def read(save):
    """One parsed capture per Save, with independently usable capabilities."""
    if hasattr(save, "_rlo"):
        return save._rlo
    data = {p["$k"]: save.deref(p.get("$v")) for p in save.items(save.root.get("modData"))
            if isinstance(p, dict) and isinstance(p.get("$k"), str)}
    if not any(k.startswith("reallife:") or k == MARKER for k in data):
        save._rlo = None
        return None
    paired = bool(getattr(save, "live_source", False) or getattr(save, "facts", None) is not None or MARKER in data)
    result = {"status": "unavailable" if KEY in data or paired else "legacy",
              "source": "link" if paired else "save", "version": None, "modules": {}}
    try:
        raw = data.get(KEY)
        report = _object(raw)
        if type(report.get("schemaVersion")) is not int or report["schemaVersion"] != 1 or report.get("provider") != "rlo":
            raise ValueError("Unsupported RLO envelope")
        result["version"] = _text(report.get("modVersion"))
        captured = report.get("captured")
        if not isinstance(captured, dict):
            raise ValueError("Missing RLO capture identity")
        _text(captured.get("character"))
        for key, high in (("day", MAX_INT), ("hour", 23), ("minute", 59)):
            _int(captured.get(key), 0, high)
        matches = all(captured[k] == save.root.get(v) for k, v in
                      (("character", "characterId"), ("day", "Day"), ("hour", "Hour")))
        minute = save.root.get("Minute")  # GameInstance.Minute is a float, unlike Day and Hour.
        matches = matches and type(minute) in (int, float) and math.isfinite(minute) and 0 <= minute < 60 and int(minute) == captured["minute"]
        if paired:
            marker = _object(data.get(MARKER))
            matches = matches and marker.get("status") == "fresh" and marker.get("sha256") == hashlib.sha256(raw.encode("utf-8")).hexdigest()
        if not matches:
            result["status"] = "stale"
        else:
            modules = report.get("modules")
            if not isinstance(modules, dict):
                raise ValueError("Missing RLO capabilities")
            for name in CAPABILITIES:
                module = modules.get(name)
                out = {"status": "unavailable"}
                try:
                    if not isinstance(module, dict) or type(module.get("version")) is not int or module["version"] != 1:
                        raise ValueError("Unsupported RLO capability version")
                    if module.get("status") not in STATES:
                        raise ValueError("Invalid RLO status")
                    out = {"status": module["status"]}
                    if out["status"] == "ready":
                        out["data"] = _validate(name, module.get("data"))
                    elif "data" not in module or module["data"] is not None:
                        raise ValueError("Non-ready RLO capability has data")
                except (ValueError, TypeError, KeyError, OverflowError, UnicodeError):
                    out = {"status": "unavailable"}
                result["modules"][name] = out
            result["status"] = "ready" if all(m["status"] in ("ready", "disabled") for m in result["modules"].values()) else "partial"
            result["captured"] = captured
    except (ValueError, TypeError, KeyError, RecursionError, OverflowError, UnicodeError):
        if paired:
            result["status"] = "stale" if KEY in data else "unavailable"
    save._rlo = result
    return result


def metadata(save):
    """Small masthead/Mods summary. Observations do not modify any base-game total or planning model."""
    report = read(save)
    if report is None:
        return None
    out = {k: report[k] for k in ("status", "source", "version")}
    out["capabilities"] = {k: v["status"] for k, v in report["modules"].items()}
    for name, field in (("businesses", "businesses"), ("employment", "employees"), ("credit", "accounts")):
        module = report["modules"].get(name, {})
        if module.get("status") == "ready":
            out[field] = len(module["data"])
            if name == "credit":
                total = sum(row["balanceCents"] for row in module["data"])
                out["creditAccountBalance"] = total / 100 if total <= MAX_INT else None
    return out
