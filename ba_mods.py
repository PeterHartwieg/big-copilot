"""Mod adapters: which mods a save carries, read from the save alone.

The ba_facts.py rule holds here too: parse the data a mod left in the save,
never execute a mod. Every adapter switches on only when the save carries
that mod's own data, so a vanilla save comes out exactly as it did before
(tools/payload_diff.py is the check). No file reads, no dashboard imports:
the same module runs in CPython and Pyodide.

What each mod leaves behind (the evaluation of 7 October 2026, issue #421):

- Economy Expansion keeps its state as JSON in modData["OcupancyCosts.State"].
  A removed mod leaves the key behind, so the signal is its
  LastSettlementDay: it settles on every new day, so a running mod has
  settled today or within the last two days.
- Alcware Seasons keeps its calendar in modData["AlcwareSeasons.calendar.v1"].
- Dynamic Rivals adds rival companies: more than the game's 19 rows in
  rivalStates says the save was expanded, not that the mod still runs.
- Retail Expansion keeps its renovations in
  modData["RetailCapacityUpgrades.renovations.v2"] (ba_facts._alcware()).
"""
from __future__ import annotations

import json
import math
import re
import struct

import ba_facts
import ba_street_food
import ba_rlo
import ba_hart
import ba_economy
import ba_companion
from collections import Counter, defaultdict

ECONOMY_KEY = "OcupancyCosts.State"
SEASONS_KEY = "AlcwareSeasons.calendar.v1"
RETAIL_KEY = "RetailCapacityUpgrades.renovations.v2"
VANILLA_RIVALS = 19
# Economy Expansion settles on GlobalEvents.onNewDay; a save written before
# the day's settlement still holds yesterday's, and one more day of slack
# covers a save written around midnight.
SETTLEMENT_SLACK = 2
# Economy Expansion pays the player's real estate five times the game's rent
# (its RealEstate.get_DailyIncome detour, below 2.25 x market rent, which the
# game's price slider never reaches). The board measures the factor from the
# save's rent statements and falls back on this one only without a statement
# (EconomyExpansion.dll read 12 Oct 2026).
ECONOMY_RENT_FACTOR = 5

# EE Workshop 2026-10-14, DLL sha256 4b29fe1d3e293d06. OcupancyCostsMod:
# *Multiplier, DistrictMultipliers, SecurityDepositDays, SetRuntimeBalanceOptions,
# EstimateVariableCostsForQuote/LerpRate, CalculateInternetContractCostForDemand,
# GetInternetInstallationFee, CalculateDataCenterCostForDemand and
# BuildSoftwareProviderDefinitions. Re-read these when EE updates.
EE_TYPES = {"retail": 59.85, "office": 22.4, "warehouse": 39.7,
            "residential": 25.3, "cinema": 14.5, "theater": 15.5}
EE_DISTRICTS = {
    "garmentdistrict": {"residential": .555556, "retail": .588235, "office": 1.428571},
    "murrayhill": {"residential": .833333, "retail": .5, "office": 2},
    "lowermanhattan": {"retail": .833333, "office": 2},
    "midtown": {"residential": .769231, "retail": .285714},
    "hellskitchen": {"residential": .392157, "retail": .769231},
    "industrycity": {"residential": .382353, "retail": .666667},
    "industrialdistrict": {"residential": .382353, "retail": .666667},
}
EE_DEPOSIT_DAYS = 15
EE_DEFAULT_RENT = .3  # Copilot fallback requested by Peter; EE's DefaultRentCostIndex is 10 (1x).
EE_DEFAULT_UTILITY = 1  # DefaultUtilityCostIndex = 4, times .25.
EE_QUOTES = {"retail": [[75, 10.18], [225, 8.27], [285, 7.63], [1000, 6.14]],
             "office": [[75, 20.37], [225, 14.41], [285, 12.03], [660, 14.92]],
             "warehouse": [[690, 101.35], [1292, 116.82], [2184, 133.47], [2610, 142.91]],
             "cinema": [[1, 9.68]], "theater": [[1, 5.57]]}
# Base/day, included connectivity demand, overage/unit/day, installation.
EE_INTERNET = {"business": [120, 8, 12, 2000], "fast": [220, 20, 7, 5000],
               "fiber": [380, 45, 4, 20000]}
# Core only: restores baseline capacity without Vault/Apex's office bonuses.
EE_CLOUD = [183.5, 40, 8.4, 485]
# GetBusinessDataMultiplier's office identity tokens and office fallback;
# GetWorkspaceDataMultiplier for the Voogle plan the forecast purchases.
# Same EE Workshop 2026-10-14, DLL sha256 4b29fe1d3e293d06 as above.
EE_CLOUD_DEMAND = {"business": {"lawfirm": 5, "webdevelopment": 2, "headquarter": 3,
                                "graphicdesigner": 1.25, "marketingagency": 1.25,
                                "eventplanning": 1.15, "travel": 1.15},
                   "office": 1, "voogle": .9}
# Cheapest workspace and required specialist tier, setup/assigned employee, daily/employee.
EE_SOFTWARE = {"workspace": [97, 18], "lawfirm": [1197, 113],
               "webdevelopmentagency": [719, 63], "graphicdesigner": [379, 23],
               "eventplanningagency": [379, 23], "marketingagency": [379, 23]}


def ee_multiplier(row):
    return EE_TYPES.get(row.get("t"), 25.3) * EE_DISTRICTS.get(row.get("h"), {}).get(row.get("t"), 1)


def ee_rent(vanilla, row, inputs, owned=False):
    if owned:
        return 0
    if vanilla is None:
        return None
    if not inputs["rent"]["rebalance"]:
        return vanilla
    # RoundMoney clamps even Rent Costs 0x to $1, then rounds away from zero.
    return math.floor(max(1, vanilla * ee_multiplier(row) * inputs["rent"]["factor"]) + .5)


def ee_inputs(save, table, vanilla_rent):
    """EE planning inputs only for a currently detected EE save.

    Modal (rebalance, factor) wins; ties prefer rebalance off, then the lower
    factor. Counts include only eligible leases, and support names the winner.
    Utility observations pool the last seven completed charged days per type,
    weighted by area/site-day, so neither large sites nor many saved days win
    by accident. These are estimates, not recovered PlayerPrefs.
    """
    if "economyExpansion" not in detect(save):
        return None
    owned = {save.address(x.get("address")) for x in save.items(save.root.get("realEstate"))}
    data = mod_data(save)
    try:
        renovated = {r[:2] for r in ba_facts._alcware(data[RETAIL_KEY])} if RETAIL_KEY in data else set()
    except (ValueError, struct.error, UnicodeError):
        renovated = set(table)  # Unreadable renovation records cannot supply a baseline.
    regs = {(r.get("StreetName"), r.get("StreetNumber")): r
            for r in save.items(save.root.get("BuildingRegistrations"))}
    votes = Counter()
    lease_keys = []
    eligible = {}
    for addr, reg in regs.items():
        row = table.get(addr)
        if (not row or row.get("t") == "residential" or addr in owned
                or reg.get("BuildingOwnedByPlayer") or not reg.get("RentedByPlayer")):
            continue
        eligible[addr] = row
        base, paid = vanilla_rent(row), reg.get("RentPerDay")
        if addr in renovated or row.get("factsSource") == "alcware" or not base or paid is None or paid < 0:
            continue
        if abs(paid - base) <= max(1, base * .01):
            votes[(False, 1.0)] += 1
            lease_keys.append(addr)
        else:
            scaled = base * ee_multiplier(row)
            factor = math.floor(paid / scaled * 10 + .5) / 10
            if 0 <= factor <= 2:
                estimate = math.floor(max(1, scaled * factor) + .5)
                if abs(paid - estimate) > max(1, paid * .01):
                    continue  # A rounded option alone is not evidence that EE set this lease.
                votes[(True, factor)] += 1
                lease_keys.append(addr)
    winner = min(votes, key=lambda k: (-votes[k], k)) if votes else (True, EE_DEFAULT_RENT)
    rent = {"rebalance": winner[0], "factor": winner[1], "source": "leases" if votes else "preference",
            "leases": sum(votes.values()), "support": votes[winner] if votes else 0,
            "leaseKeys": sorted(lease_keys)}
    charges = defaultdict(float)
    for tx in save.items(save.root.get("Transactions")):
        details = {p.get("$k"): save.deref(p.get("$v"))
                   for p in save.items(tx.get("transactionData")) if isinstance(p, dict)}
        component = details.get("occupancyComponent")
        if component not in ("electricity", "water", "waste"):
            continue
        addr = save.address(tx.get("address"))
        stamp = save.deref(tx.get("timestamp")) or {}
        day = stamp.get("Day")
        if addr not in eligible or not isinstance(day, int) or day >= save.root.get("Day", 0):
            continue
        amount = tx.get("amount")
        if isinstance(amount, (int, float)) and math.isfinite(amount) and amount <= 0:
            charges[addr, day] += abs(amount)
    observations = {}
    for kind in sorted(EE_QUOTES):
        days = sorted({day for (addr, day) in charges if eligible[addr]["t"] == kind})[-7:]
        rows = [(addr, day, amount) for (addr, day), amount in charges.items()
                if eligible[addr]["t"] == kind and day in days and eligible[addr].get("m")]
        area = sum(eligible[addr]["m"] for addr, _, _ in rows)
        if area:
            observations[kind] = {"perM2": sum(amount for _, _, amount in rows) / area,
                                  "source": "charges", "sites": len({addr for addr, _, _ in rows}),
                                  "days": len(days)}
    return {"source": "EE Workshop 2026-10-14, DLL sha256 4b29fe1d3e293d06", "rent": rent,
            "utilityFactor": EE_DEFAULT_UTILITY, "utilitySource": "preference", "utilities": observations,
            "quotes": EE_QUOTES, "depositDays": EE_DEPOSIT_DAYS, "internet": EE_INTERNET,
            "cloud": EE_CLOUD, "cloudDemand": EE_CLOUD_DEMAND, "software": EE_SOFTWARE}

# --- Alcware Seasons -------------------------------------------------------
# Copied from Alcware Seasons 0.4.1 (Workshop item 3803289067, its own notes
# say tested with build 3680), AlcwareSeasons.dll read on 8 Oct 2026:
# SeasonState.Decode/Phase/CurrentSeason/DayOfSeason for the calendar and
# SeasonalProducts.Multiplier/SalesRatio for the factors. A newer mod
# version may change them; re-read the DLL when it updates.
SEASONS_MOD_VERSION = "0.4.1"
SEASONS = ("spring", "summer", "autumn", "winter")
# Fields per calendar version, the version tag included (SeasonState.Decode).
_CALENDAR_FIELDS = {"ACS1": 6, "ACS2": 7, "ACS3": 8, "ACS4": 11, "ACS5": 14}
# The on/off fields Decode insists are "0" or "1" where the version has them.
_CALENDAR_FLAGS = (2, 3, 6, 7, 8, 9, 11, 12)
# Storm frequency and drying time, 0 to 2 (SeasonState.Validate).
_CALENDAR_LEVELS = (10, 13)
# What Int32.Parse with the invariant culture takes (Python's int() also takes "1_5").
_INT = re.compile(r"[\t-\r ]*[+-]?[0-9]+[\t-\r ]*")
_ITEM = "ba:itemname_"
# Spring, Summer, Autumn, Winter.
_FACTOR_ROWS = {
    (1.0, 0.85, 1.05, 1.1): ("cupofcoffee", "cupoftea"),
    (1.0, 1.25, 0.95, 0.8): ("icecream",),
    (1.0, 1.15, 1.0, 0.85): ("sodacan", "salad"),
    (0.95, 0.95, 0.95, 1.15): ("cheapgift", "expensivegift"),
    (1.2, 1.0, 0.95, 0.85): ("cheapflower", "expensiveflower"),
    (1.0, 1.0, 1.0, 1.15): ("cheapjewelry", "expensivejewelry", "bottleofwine"),
    (1.0, 1.15, 1.0, 1.0): ("beer",),
    # Clothing, all eight variants, in autumn.
    (1.0, 1.0, 1.1, 1.0): ("classiccheapfemaleclothing", "classiccheapmaleclothing",
                           "classicexpensivefemaleclothing", "classicexpensivemaleclothing",
                           "moderncheapfemaleclothing", "moderncheapmaleclothing",
                           "modernexpensivefemaleclothing", "modernexpensivemaleclothing"),
    # Electronics in spring.
    (1.1, 1.0, 1.0, 1.0): ("smartphone1", "smartphone2", "smartwatch1", "smartwatch2",
                           "headphones01", "earbuds01"),
}
SEASON_FACTORS = {_ITEM + name: factors for factors, names in _FACTOR_ROWS.items() for name in names}


def mod_data(save) -> dict:
    """modData as {key: value}; an empty dict where the save has none."""
    return ba_companion.mod_data(save)


def calendar(value) -> dict | None:
    """The Seasons calendar string as {length, demand, anchorDay, anchorPhase},
    or None where SeasonState.Decode would refuse it (the mod then keeps the
    data and changes nothing we could model)."""
    if not isinstance(value, str) or len(value) > 1000:
        return None
    parts = value.split("|")
    if _CALENDAR_FIELDS.get(parts[0]) != len(parts):
        return None
    if any(parts[i] not in ("0", "1") for i in _CALENDAR_FLAGS if i < len(parts)):
        return None
    ints = [1, 4] + [i for i in _CALENDAR_LEVELS if i < len(parts)]
    if not all(_INT.fullmatch(parts[i]) for i in ints) or "_" in parts[5]:
        return None
    if any(not 0 <= int(parts[i]) <= 2 for i in _CALENDAR_LEVELS if i < len(parts)):
        return None
    try:
        length, anchor_day, anchor_phase = int(parts[1]), int(parts[4]), float(parts[5])
    except ValueError:
        return None
    if length < 1 or not math.isfinite(anchor_phase) or not 0 <= anchor_phase < 4:
        return None
    return {"length": length, "demand": parts[2] == "1", "anchorDay": anchor_day, "anchorPhase": anchor_phase}


def phase(cal: dict, day: int) -> float:
    """SeasonState.Phase: 0 to 4, its whole part the season. C#'s % is fmod."""
    p = cal["anchorPhase"] + (day - cal["anchorDay"]) / cal["length"]
    return math.fmod(math.fmod(p, 4.0) + 4.0, 4.0)


def season_of(cal: dict, day: int) -> int:
    """SeasonState.CurrentSeason: 0 spring, 1 summer, 2 autumn, 3 winter."""
    return min(3, int(phase(cal, day)))


def day_of_season(cal: dict, day: int) -> int:
    """SeasonState.DayOfSeason: 1 to the season's length."""
    return min(cal["length"], math.floor(math.fmod(phase(cal, day), 1.0) * cal["length"] + 1e-5) + 1)


def factor(item: str, cal: dict | None, day: int) -> float:
    """SeasonalProducts.Multiplier for `item` on `day`: 1 with no calendar,
    with the seasonal-demand switch off, or for a product the mod leaves alone."""
    if not cal or not cal["demand"]:
        return 1.0
    row = SEASON_FACTORS.get(item)
    return row[season_of(cal, day)] if row else 1.0


def sales_ratio(base: float, item: str, cal: dict | None, day: int) -> float:
    """Item.productSalesRatio as the mod sets it on `day` (SeasonController.
    ApplyDemand): unchanged where the factor is 1, else the original ratio,
    a 0 counted as 1, times the factor."""
    f = factor(item, cal, day)
    if f == 1.0:
        return base
    return round((base or 1.0) * f, 6)


def seasons(save) -> dict | None:
    """The save's Seasons calendar, or None for a save without (a readable) one."""
    return calendar(mod_data(save).get(SEASONS_KEY))


def detect(save) -> dict:
    """The adapters this save needs and their inputs; {} for a vanilla save.

    Keys only where the mod's data says it is in use:
    `economyExpansion` {settled: the last day it settled},
    `seasons` {season, day, length, left, demand},
    `rivals` the rival companies when more than the game's 19,
    `retailExpansion` {renovated: buildings in its records, None if unreadable}.
    """
    data = mod_data(save)
    day = save.root.get("Day") or 0
    out = {}
    economy = data.get(ECONOMY_KEY)
    if isinstance(economy, str):
        try:
            settled = json.loads(economy).get("LastSettlementDay")
        except (ValueError, AttributeError):
            settled = None
        if type(settled) is int and day - SETTLEMENT_SLACK <= settled <= day:
            out["economyExpansion"] = {"settled": settled}
    cal = calendar(data.get(SEASONS_KEY))
    if cal:
        at = day_of_season(cal, day)
        out["seasons"] = {"season": SEASONS[season_of(cal, day)], "day": at, "length": cal["length"],
                          "left": cal["length"] - at, "demand": cal["demand"]}
    rivals = len(save.items(save.root.get("rivalStates")))
    if rivals > VANILLA_RIVALS:
        out["rivals"] = rivals
    retail = data.get(RETAIL_KEY)
    if retail is not None:
        try:
            renovated = len(ba_facts._alcware(retail))
        except (ValueError, struct.error, UnicodeError):
            renovated = None
        out["retailExpansion"] = {"renovated": renovated}
    rlo = ba_rlo.metadata(save)
    if rlo is not None:
        out["rlo"] = rlo
    hart = ba_hart.metadata(save)
    if hart is not None:
        out["hart"] = hart
    street_food = ba_street_food.metadata(save)
    if street_food is not None:
        out["streetFood"] = street_food
    return out


# --- Planner capabilities --------------------------------------------------
# Runtime facts are hash-bound to the save by ba_facts. A provider's selected
# flags establish possible missing rules, never their cost or readiness. Keep
# these decisions here rather than scattering mod names through the planners.
ECONOMY_MODEL = "economy-capabilities-v1"
ECONOMY_CAPABILITIES = ("storeProfit", "officeProfit", "factoryRunning", "factoryOpening")
ECONOMY_RULES = {
    "equipmentUtilities": ("storeProfit", "officeProfit", "factoryRunning"),
    "officeIt": ("officeProfit", "factoryRunning"),
    "factoryDiplomas": ("factoryOpening",),
    "operatingCosts": ("storeProfit", "officeProfit", "factoryRunning"),
}
# Presence says only that effective settings need checking. Retained state from
# a removed mod must never be described as proof that the mod is active.
# HMP Core/DiplomaHold.cs (CareersKey/HoldKey), Core/IndebtedStart.cs
# and Core/HardcoreStart.cs, reviewed 23 Oct 2026.
ECONOMY_SAVE_KEYS = frozenset({"reallife:careers", "hardmodepatch:factory_diplomas_held",
                               "HardModePatch.IndebtedStart", "HardModePatch.HardcoreNoFunds"})


def capabilities(save) -> dict:
    """Unavailable model capabilities as {capability: [reason code, ...]}.

    Missing runtime metadata retains baseline behavior for ordinary saves;
    recognized retained economy state explicitly requires a fresh snapshot.
    An observed empty provider list proves the captured runtime had none.
    Unsupported optional models affect forecasts, not recorded accounting.
    """
    facts = getattr(save, "facts", None) or {}
    out = {}

    def scoped(provider):
        current = ba_economy.report(save, provider)
        return current is not None and current.get("status") in ("ready", "partial")

    def disable(keys, reason):
        for key in keys:
            if reason not in out.setdefault(key, []):
                out[key].append(reason)

    economy = facts.get("economy")
    if economy is None:
        retained = ECONOMY_SAVE_KEYS.intersection(mod_data(save))
        if (("reallife:careers" in retained and not scoped("rlo"))
                or (retained - {"reallife:careers"} and not scoped("hart"))):
            disable(ECONOMY_CAPABILITIES, "economyUnknown")
    elif economy.get("schemaVersion") != 1 or economy.get("model") != ECONOMY_MODEL:
        disable(ECONOMY_CAPABILITIES, "economyUnknown")
    else:
        for provider in economy.get("providers", []):
            if provider.get("status") != "observed":
                disable(ECONOMY_CAPABILITIES, "economyUnknown")
                continue
            rules = provider.get("rules", {})
            identity = provider.get("id")
            if identity not in ("hard-mode-patch", "hart-mod-pack", "real-life-overhaul"):
                disable(ECONOMY_CAPABILITIES, "economyUnknown")
                continue
            # A fresh public report delegates each affected surface to its owner
            # modules. Missing or failed optional modules are handled there;
            # they must not erase independent supported planning surfaces.
            if scoped("rlo" if identity == "real-life-overhaul" else "hart"):
                continue
            expected = ("operatingCosts",) if identity == "real-life-overhaul" else ("equipmentUtilities", "officeIt", "factoryDiplomas")
            for rule, affected in ECONOMY_RULES.items():
                if rule not in expected and rule not in rules:
                    continue
                value = rules.get(rule)
                if value is not False:
                    disable(affected, rule if value is True else "economyUnknown")
            if any(rule not in ECONOMY_RULES and value is not False for rule, value in rules.items()):
                disable(ECONOMY_CAPABILITIES, "economyUnknown")
    if not ba_facts.marketing_supported(facts):
        disable(("marketing", "storeProfit", "officeProfit"), "marketingUnknown")
    return out


def vehicle_prices(save, baseline, non_motor=()) -> tuple[dict, bool]:
    """Effective runtime vehicle wealth values, else reviewed offline defaults; unsupported
    present models must not silently fall back to vanilla valuations.

    Only finance combines known non-motor zeros with motor purchase prices;
    payback must retain its distinct purchase-price table.
    """
    facts = getattr(save, "facts", None) or {}
    runtime = ba_facts.vehicle_prices(facts)
    if "vehiclePrices" in facts:
        return (runtime or {}), runtime is not None
    # Roadster's registered asset price, reviewed in ModAssets.cs on 23 Oct
    # 2026. Runtime catalogues override this baseline (including changed prices).
    prices = {**dict.fromkeys(non_motor, 0), **baseline, "roadster:vehicletype_roadster": 250000}
    street_food = ba_street_food.read(save)
    if street_food:
        prices.update(street_food["prices"])
    return prices, True
