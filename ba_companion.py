"""Bounded, versioned companion snapshots shared by the mod adapters.

Providers own their fields and models. This module owns the transport checks:
JSON limits, independent module failures, snapshot identity and live binding.
It reads no files and runs unchanged in CPython and Pyodide.
"""
from __future__ import annotations

import hashlib
import json
import math

MAX_BYTES = 4 * 1024 * 1024
MAX_ROWS = 10000
MAX_INT = 2**53 - 1
STATES = ("ready", "disabled", "unavailable", "failed")


def integer(value, low=0, high=MAX_INT):
    if type(value) is not int or not low <= value <= high:
        raise ValueError("Invalid companion integer")
    return value


def text(value):
    if not isinstance(value, str) or not value or len(value) > 1024:
        raise ValueError("Invalid companion text")
    value.encode("utf-8")
    return value


def boolean(value):
    if type(value) is not bool:
        raise ValueError("Invalid companion boolean")
    return value


def rows(data, identity):
    if not isinstance(data, list) or len(data) > MAX_ROWS:
        raise ValueError("Invalid companion rows")
    seen = set()
    for row in data:
        if not isinstance(row, dict):
            raise ValueError("Invalid companion record")
        key = identity(row)
        if key in seen:
            raise ValueError("Duplicate companion identity")
        seen.add(key)
    return data


def _pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate companion field")
        result[key] = value
    return result


def _bounded(value, depth=0):
    if depth > 16:
        raise ValueError("Companion nesting is too deep")
    if isinstance(value, dict):
        if len(value) > MAX_ROWS:
            raise ValueError("Too many companion fields")
        for key, item in value.items():
            text(key)
            _bounded(item, depth + 1)
    elif isinstance(value, list):
        if len(value) > MAX_ROWS:
            raise ValueError("Too many companion rows")
        for item in value:
            _bounded(item, depth + 1)
    elif isinstance(value, str):
        text(value)
    elif type(value) is int:
        integer(value, -MAX_INT)
    elif value is not None and type(value) is not bool:
        # Public contracts use integer units or round-trip decimal strings.
        raise ValueError("Unsupported companion scalar")


def object_json(raw):
    if not isinstance(raw, str) or len(raw) > MAX_BYTES or len(raw.encode("utf-8")) > MAX_BYTES:
        raise ValueError("Invalid companion capture")
    value = json.loads(raw, object_pairs_hook=_pairs,
                       parse_constant=lambda _: (_ for _ in ()).throw(ValueError("Non-finite companion number")))
    if not isinstance(value, dict):
        raise ValueError("Invalid companion object")
    return value


def mod_data(save):
    """A Save is one immutable capture; index its reporting records once."""
    if not hasattr(save, "_companion_mod_data"):
        save._companion_mod_data = {
            p["$k"]: save.deref(p.get("$v")) for p in save.items(save.root.get("modData"))
            if isinstance(p, dict) and isinstance(p.get("$k"), str)
        }
    return save._companion_mod_data


def _clock_matches(captured, root):
    if not isinstance(captured, dict):
        raise ValueError("Missing companion capture identity")
    text(captured.get("character"))
    for field, high in (("day", MAX_INT), ("hour", 23), ("minute", 59)):
        integer(captured.get(field), 0, high)
    minute = root.get("Minute")
    return (type(root.get("Day")) is int and type(root.get("Hour")) is int
            and captured["character"] == root.get("characterId")
            and captured["day"] == root["Day"] and captured["hour"] == root["Hour"]
            and type(minute) in (int, float) and math.isfinite(minute)
            and 0 <= minute < 60 and int(minute) == captured["minute"])


def read(save, *, provider, key, marker, validators, required=(), evidence=()):
    """Read one provider once, validating only known module versions.

    Optional new modules don't make an older report globally unusable. Their
    consumers still have to require the specific module they need. A live
    capture never substitutes a retained on-save report after a capture fails.
    """
    cache = getattr(save, "_companions", None)
    if cache is None:
        cache = save._companions = {}
    cache_key = (provider, key, marker, tuple(validators), tuple(required))
    if cache_key in cache:
        return cache[cache_key]
    data = mod_data(save)
    if key not in data and marker not in data and not any(
            any(k.startswith(prefix) for prefix in evidence) for k in data):
        cache[cache_key] = None
        return None
    paired = bool(getattr(save, "live_source", False) or getattr(save, "facts", None) is not None or marker in data)
    result = {"status": "unavailable" if key in data or paired else "legacy",
              "source": "link" if paired else "save", "version": None, "modules": {}}
    try:
        raw = data.get(key)
        report = object_json(raw)
        if type(report.get("schemaVersion")) is not int or report["schemaVersion"] != 1 or report.get("provider") != provider:
            raise ValueError("Unsupported companion envelope")
        result["version"] = text(report.get("modVersion"))
        captured = report.get("captured")
        matches = _clock_matches(captured, save.root)
        if paired:
            binding = object_json(data.get(marker))
            matches = matches and binding.get("status") == "fresh" and binding.get("sha256") == hashlib.sha256(raw.encode("utf-8")).hexdigest()
        if not matches:
            result["status"] = "stale"
        else:
            modules = report.get("modules")
            if not isinstance(modules, dict):
                raise ValueError("Missing companion modules")
            for name, validate in validators.items():
                if name not in required and name not in modules:
                    continue
                module = modules.get(name)
                out = {"status": "unavailable"}
                try:
                    _bounded(module, 2)
                    if not isinstance(module, dict) or type(module.get("version")) is not int or module["version"] != 1:
                        raise ValueError("Unsupported companion module version")
                    if module.get("status") not in STATES:
                        raise ValueError("Invalid companion module status")
                    out = {"status": module["status"]}
                    if out["status"] == "ready":
                        out["data"] = validate(module.get("data"))
                    elif "data" not in module or module["data"] is not None:
                        raise ValueError("Non-ready companion module has data")
                except (ValueError, TypeError, KeyError, OverflowError, UnicodeError):
                    out = {"status": "unavailable"}
                result["modules"][name] = out
            result["status"] = "ready" if all(m["status"] in ("ready", "disabled") for m in result["modules"].values()) else "partial"
            result["captured"] = captured
    except (ValueError, TypeError, KeyError, RecursionError, OverflowError, UnicodeError):
        if paired:
            result["status"] = "stale" if key in data else "unavailable"
    cache[cache_key] = result
    return result
