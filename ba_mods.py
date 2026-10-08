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
import struct

import ba_facts

ECONOMY_KEY = "OcupancyCosts.State"
SEASONS_KEY = "AlcwareSeasons.calendar.v1"
RETAIL_KEY = "RetailCapacityUpgrades.renovations.v2"
VANILLA_RIVALS = 19
# Economy Expansion settles on GlobalEvents.onNewDay; a save written before
# the day's settlement still holds yesterday's, and one more day of slack
# covers a save written around midnight.
SETTLEMENT_SLACK = 2

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
    out = {}
    for pair in save.items(save.root.get("modData")):
        if isinstance(pair, dict) and isinstance(pair.get("$k"), str):
            out[pair["$k"]] = save.deref(pair.get("$v"))
    return out


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
    return out
