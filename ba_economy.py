"""Join public companion inputs once per immutable Save.

Providers validate their own contracts. This adapter selects effective inputs
for Copilot without decoding private state, adjusting recorded statements, or
turning missing observations into zero. It has no import-time file reads.
"""
from __future__ import annotations

import ba_facts
import ba_hart
import ba_rlo
import math
import struct


def context(save):
    if not hasattr(save, "_mod_economy"):
        reports = {"rlo": ba_rlo.read(save), "hart": ba_hart.read(save)}
        observed = (getattr(save, "facts", None) or {}).get("economy")
        if (isinstance(observed, dict) and observed.get("schemaVersion") == 1
                and observed.get("model") == "economy-capabilities-v1"):
            providers = {p.get("id") for p in observed.get("providers", [])}
            if "real-life-overhaul" not in providers:
                reports.pop("rlo", None)
            if not providers.intersection({"hart-mod-pack", "hard-mode-patch"}):
                reports.pop("hart", None)
        save._mod_economy = {"reports": {k: v for k, v in reports.items() if v is not None}, "indexes": {}}
    return save._mod_economy


def report(save, provider):
    return context(save)["reports"].get(provider)


def module(save, provider, name):
    current = report(save, provider)
    return (current or {}).get("modules", {}).get(name, {"status": "unavailable" if current is not None else "disabled"})


def data(save, provider, name):
    value = module(save, provider, name)
    return value["data"] if value.get("status") == "ready" else None


def address(row):
    value = row["address"]
    return value["street"], value["number"]


def index(save, provider, name, field=None, identity="address"):
    """Linear joins, cached separately from the immutable public module data."""
    cache = context(save)["indexes"]
    key = provider, name, field, identity
    if key not in cache:
        values = data(save, provider, name)
        values = values.get(field, []) if values is not None and field else values
        cache[key] = {(address(row) if identity == "address" else row[identity]): row for row in values or []}
    return cache[key]


def planner(save):
    """Section inputs only; the core payload carries compact status metadata."""
    state = context(save)
    if "planner" in state:
        return state["planner"]
    reports = state["reports"]
    if not reports:
        state["planner"] = None
        return None
    needed = {"rlo": {"prices", "utilities", "company", "requirements", "footfall", "interiors", "closures", "education"},
              "hart": {"runtime", "rent", "runningCosts", "factoryPurchases", "retailDemand"}}
    payload = {"version": 1, "day": save.root.get("Day", 0),
            **{provider: {"status": value["status"], "source": value["source"], "modules": {
                name: module for name, module in value["modules"].items() if name in needed[provider]}}
               for provider, value in reports.items()}}
    if data(save, "rlo", "footfall") is not None:
        rlo = payload["rlo"]
        rlo["modules"] = {**rlo["modules"], "footfall": {"status": "ready", "data": {
            **data(save, "rlo", "footfall"), "sites": list(footfall(save).values())}}}
    # Registered catalogue amounts have already been joined into each section's
    # product/furniture facts. The browser only needs the owner's price rules.
    prices = payload.get("rlo", {}).get("modules", {}).get("prices")
    if prices and prices.get("status") == "ready":
        payload["rlo"]["modules"]["prices"] = {**prices, "data": {
            key: value for key, value in prices["data"].items() if key != "items"}}
    state["planner"] = payload
    return payload


def footfall(save):
    """A same-clock report must also agree with the paired promotion value."""
    cache = context(save)["indexes"]
    if "pairedFootfall" not in cache:
        regs = {(r.get("StreetName"), r.get("StreetNumber")): r for r in save.items(save.root.get("BuildingRegistrations"))
                if isinstance(r, dict)}
        out = {}
        for addr, row in index(save, "rlo", "footfall", "sites").items():
            reg = regs.get(addr)
            native = (save.deref(reg.get("promotion")) or {}).get("total") if reg else None
            captured_fields = ("ownPromotion", "writtenPromotion", "registrationPromotionAtCapture", "issuePercent",
                               "ambientPercent", "interiorPercent", "baseMultiplier")
            if (row["status"] == "ready" and all(row.get(key) is not None for key in captured_fields)
                    and type(native) in (int, float)
                    and native == row["registrationPromotionAtCapture"]):
                out[addr] = row
            else:
                out[addr] = {**row, "status": "unavailable"}
        cache["pairedFootfall"] = out
    return cache["pairedFootfall"]


def catalogue(save):
    """Current registered amounts; RLO factors have already been applied once."""
    cache = context(save)["indexes"]
    if "catalogue" not in cache:
        facts = getattr(save, "facts", None) or {}
        rows = ba_facts.native_economy(facts, "itemPrices")
        if rows is not None:
            cache["catalogue"] = {
                row["itemId"]: {"p": ba_facts.catalogue_amount(row["defaultMarketAmount"]),
                                "w": ba_facts.catalogue_amount(row["wholesaleAmount"])} for row in rows}
        else:
            # Both capture the current registered fields. Failure of one reader
            # does not invalidate an independent ready owner projection.
            prices = data(save, "rlo", "prices")
            cache["catalogue"] = (None if prices is None else {
                row["itemId"]: {"p": ba_facts.catalogue_amount(row["defaultMarketAmount"]),
                                "w": ba_facts.catalogue_amount(row["effectiveAmount"])} for row in prices["items"]})
    return cache["catalogue"]



def price_unavailable(save, identifiers):
    """Only requested identities are gated; a known empty catalogue is not vanilla."""
    facts = getattr(save, "facts", None) or {}
    if "nativeEconomy" not in facts and report(save, "rlo") is None:
        return []
    # A disabled City price owner leaves the native baseline unchanged.
    if "nativeEconomy" not in facts and module(save, "rlo", "prices")["status"] == "disabled":
        return []
    current = catalogue(save)
    return sorted(set(identifiers) - set(current or {}))


def tables(save, rules, prices):
    """Detached planning tables; no global baseline or another save is changed."""
    current = catalogue(save)
    if current is None:
        return rules, prices
    products = {key: {**row, **current[key]} if key in current else dict(row)
                for key, row in rules.get("products", {}).items()}
    items = {key: {**row, "p": current[key]["p"]} if key in current else dict(row)
             for key, row in prices.get("items", {}).items()}
    return {**rules, "products": products}, {**prices, "items": items}


def hourly(save, employee_id, native_hourly):
    """An ordinary wage observation; no sick pay or overtime is fabricated."""
    if report(save, "rlo") is None:
        return native_hourly, True
    if module(save, "rlo", "employment")["status"] == "disabled":
        # This owner is off, but City can still affect salary. Without an
        # employment observation do not infer a complete current wage from a
        # base amount while another salary adjustment is active or unknown.
        prices = module(save, "rlo", "prices")
        if prices["status"] == "disabled":
            return native_hourly, True
        values = prices.get("data") if prices["status"] == "ready" else None
        no_adjustment = values is not None and values["levelThousandths"] == 1000 and (
            values["costFactorThousandths"] == 1000
            or abs(values["costFactorThousandths"] - 1000) < values["adjustmentQuiet"])
        return native_hourly, no_adjustment
    observed = index(save, "rlo", "employment", identity="employeeId").get(employee_id)
    if observed is not None:
        return observed["ordinaryHourlyCents"] / 100, True
    # The caller may display the native base, but must label it and must not
    # claim a complete cost recommendation from it.
    return native_hourly, False


def candidate_hourly(save, native_hourly):
    """A new hire has no stored raise; disabled Company still permits City wages."""
    if type(native_hourly) not in (int, float) or not math.isfinite(native_hourly):
        return native_hourly, False
    if report(save, "rlo") is None:
        return native_hourly, True
    company = data(save, "rlo", "company")
    if company is not None:
        factor = company["newHireWageFactorThousandths"]
    elif module(save, "rlo", "company")["status"] == "disabled":
        prices = data(save, "rlo", "prices")
        if prices is not None:
            factor = prices["levelThousandths"]
        elif module(save, "rlo", "prices")["status"] == "disabled":
            return native_hourly, True
        else:
            return native_hourly, False
    else:
        return native_hourly, False
    # CompanyGame: float32 wage*100, Unity RoundToInt (ties to even), then
    # CompanyCatalogue.Share's signed half-away rounding and saturation.
    f32 = lambda value: struct.unpack("<f", struct.pack("<f", value))[0]
    try:
        cents = round(f32(f32(native_hourly) * 100))
    except (OverflowError, ValueError):
        return native_hourly, False
    scaled = cents * factor
    rounded = (abs(scaled) + 500) // 1000 * (-1 if scaled < 0 else 1)
    return max(-1073741824, min(1073741823, rounded)) / 100, True


def staffing_issues(save, addr, opening=None):
    """Snapshot advice only. Link must still query current ownership at write."""
    if report(save, "rlo") is None:
        return []
    reasons = []
    ownership = index(save, "rlo", "ownership", "targets").get(addr)
    if ownership is not None:
        decision = ownership["operations"]["schedule"]
        if decision["decision"] != "allowed":
            reasons.extend(decision["reasons"] or ["ownership-unknown"])
    else:
        features = index(save, "rlo", "features", identity="id")
        if features.get("managers", {}).get("enabled") is not False:
            reasons.append("ownership-unknown")
    held = closures(save, addr)
    if held:
        reasons.append("active-mod-closure")
    elif held is None and module(save, "rlo", "closures")["status"] != "disabled":
        reasons.append("closure-observations-unavailable")
    if opening is not None:
        requirements = data(save, "rlo", "requirements")
        if requirements is None:
            if module(save, "rlo", "requirements")["status"] != "disabled":
                reasons.append("opening-requirements-unknown")
        else:
            company = data(save, "rlo", "company")
            state = (company or {}).get("partStates", {}).get("licences")
            if state == "disabled":
                return list(dict.fromkeys(reasons))
            if state != "ready":
                return list(dict.fromkeys(reasons + ["company-licences-unavailable"]))
            late = requirements["lateOpeningHours"]
            if any(end > start and (start < late["before"] or end > late["after"])
                   for slots in opening for start, end in slots):
                site = index(save, "rlo", "company", "sites").get(addr)
                valid = site is not None and any(p["kind"] == late["permitKind"] and p["valid"]
                                                and p["untilDay"] >= save.root.get("Day", 0) + 6
                                                for p in site["licences"])
                if not valid:
                    reasons.append("late-opening-permit-missing")
    return list(dict.fromkeys(reasons))


def deduction(save, label):
    """Return recurring/once/unknown for exact owner labels, otherwise no claim."""
    rows = data(save, "rlo", "outsideStatements")
    if rows is None:
        return None
    cache = context(save)["indexes"]
    if "deductions" not in cache:
        labels = {row["label"]: row["kind"] for row in rows["recurringDeductionLabels"]}
        # A shared localized label with mixed semantics cannot safely be extrapolated.
        labels.update((label, "unknown") for label in rows.get("unclassifiedDeductionLabels", []))
        cache["deductions"] = labels
    return cache["deductions"].get(label)


def outside(save, addr=None):
    """Separate bases stay separate. No invented net profit or history."""
    value = data(save, "rlo", "outsideStatements")
    if value is None:
        return None
    cache = context(save)["indexes"]
    if "outside" not in cache:
        grouped = {}
        for row in value["rows"]:
            if row["scope"] == "place":
                grouped.setdefault(address(row), []).append(row)
        cache["outside"] = grouped
    rows = value["rows"] if addr is None else cache["outside"].get(addr, [])
    return {"coverage": value["coverage"], "knownOmittedCategories": value["knownOmittedCategories"],
            "rows": rows, "statementAdjustment": "none", "balancesAreSeparate": True}


def closures(save, addr):
    value = data(save, "rlo", "closures")
    if value is None:
        return None
    cache = context(save)["indexes"]
    if "closures" not in cache:
        grouped = {}
        for row in value["rows"]:
            grouped.setdefault(address(row), []).append(row)
        cache["closures"] = grouped
    return cache["closures"].get(addr, [])


def promotion(save, addr, own):
    """Owner Written() at captured settings, with float32 intermediate steps."""
    current = footfall(save).get(addr)
    values = data(save, "rlo", "footfall")
    if not current or current["status"] != "ready" or values is None:
        return None
    issue, ambient, interior = (current[k] for k in ("issuePercent", "ambientPercent", "interiorPercent"))
    if issue == ambient == interior == 0:
        return own
    terms = values["terms"]
    clamp = lambda n, low, high: min(high, max(low, n))
    f = lambda n: struct.unpack("<f", struct.pack("<f", n))[0]
    coefficient, base = f(float(terms["promotionCoefficient"])), f(float(current["baseMultiplier"]))
    if coefficient <= 0:
        return None
    delta = sum(clamp(value, terms[name + "Min"], terms[name + "Max"])
                for name, value in (("issue", issue), ("ambient", ambient), ("interior", interior)))
    multiplier = f(base + f(f(coefficient * own) / 100))
    wanted = f(multiplier * f(1 + f(delta / 100)))
    value = f(f(f(wanted - base) / coefficient) * 100)
    return clamp(int(f(value + .5)), terms["promotionMin"], terms["promotionMax"])


def city_amount(save, amount, revenue=False):
    """Standalone quote with current City factors, excluding company carried debt."""
    values = data(save, "rlo", "prices")
    if values is None:
        return amount if module(save, "rlo", "prices")["status"] == "disabled" else None
    factor = values["takingsFactorThousandths" if revenue else "costFactorThousandths"]
    native = struct.unpack("<f", struct.pack("<f", amount))[0]
    if native <= 0 or abs(factor - 1000) < values["adjustmentQuiet"]:
        return native
    change = native * (factor - 1000) / 1000
    rounded = math.floor(abs(change) + .5) * (-1 if change < 0 else 1)
    return native + max(-1073741824, min(1073741823, rounded))
