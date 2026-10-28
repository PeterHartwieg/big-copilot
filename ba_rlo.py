"""RLO companion contract v1: validated observations and owner planning inputs.

The same bounded reader runs in CPython and Pyodide. Capability failures stay
local, ordinary game statements remain authoritative, and retained records are
never evidence that RLO is installed or currently running. See contracts/rlo/.
"""
from __future__ import annotations

import ba_companion as companion
import ba_rlo_planning
from ba_companion import MAX_INT
from ba_companion import integer as _int, text as _text, boolean as _bool, rows as _rows

KEY = "reallife:companion"
MARKER = "bigcopilot:rlo-snapshot.v1"
CAPABILITIES = ("features", "businesses", "employment", "credit", "accounting")


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
    return companion.read(save, provider="rlo", key=KEY, marker=MARKER,
                          validators={**{name: lambda data, name=name: _validate(name, data) for name in CAPABILITIES},
                                      **ba_rlo_planning.VALIDATORS},
                          required=CAPABILITIES, evidence=("reallife:",))


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
