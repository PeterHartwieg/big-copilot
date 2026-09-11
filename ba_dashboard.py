"""Build a progress dashboard from a Big Ambitions save game.

    python ba_dashboard.py                          # newest save in the default folder
    python ba_dashboard.py "path\\to\\Costy Co.hsg"  # a specific save
    python ba_dashboard.py -o board.html            # choose the output file
    python ba_dashboard.py --watch                  # serve it and follow the save

The dashboard is a single self-contained HTML file. In watch mode it is also served
from 127.0.0.1 and refreshes itself whenever the game writes a new save.
"""

from __future__ import annotations

import argparse
import collections
import datetime as dt
import hashlib
import http.server
import json
import math
import os
import re
import statistics
import sys
import threading
import time
import traceback
import webbrowser
from html import escape as html_escape

from ba_save import Names, Save, load_locale, load_save

SAVE_ROOT = os.path.join(
    os.environ.get("USERPROFILE", ""),
    r"AppData\LocalLow\Hovgaard Games\Big Ambitions\SaveGames\Big Ambitions",
)
VERIFIED_BUILD = 3674  # the game build every number here was last checked against
MIN_BUILD = 3540  # saves older than this lack fields the board relies on (checked over 57 saves)

# The player tags each business with its neighbourhood, e.g. "[MT] Costco 38 1stAV".
NEIGHBOURHOODS = {
    "MT": "Midtown",
    "HK": "Hell's Kitchen",
    "MH": "Murray Hill",
    "LM": "Lower Manhattan",
    "GD": "Garment District",
    "IC": "Industry City",
    "HA": "The Hamptons",
}

# A neighbourhood's display name back to its tag, so a shop the building table
# places can wear the same two letters and colour a prefix would have given it.
HOOD_TAG = {name: tag for tag, name in NEIGHBOURHOODS.items()}

# Every building in the city, from the game's fixed map: make_buildings.py
# generates ba_buildings.json beside this file, and the browser worker writes it
# to /data/. A missing table is not an error — the [XX] prefix in the business
# name is then the only neighbourhood signal, as before the table existed.
_buildings = None


def load_buildings() -> dict:
    """ba_buildings.json as {(street slug, number): row}, read once.

    Row keys are single letters to keep the file small: s street slug, n number,
    h neighbourhood, t building type, z size code, m square metres, x traffic.
    """
    global _buildings
    if _buildings is None:
        for path in (
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "ba_buildings.json"),
            "/data/ba_buildings.json",  # where the worker puts it in a browser
        ):
            try:
                with open(path, encoding="utf-8") as fh:
                    _buildings = {(r["s"], r["n"]): r for r in json.load(fh)}
                break
            except (OSError, ValueError):
                continue  # not here, or unreadable: try the next place
        else:
            _buildings = {}
    return _buildings


# Business types that sell to walk-in customers; the rest are support sites.
# Every physical retail floor the game documents with an F1 help page (the
# handful of pure office agencies — law firm, travel agency and the like — say
# outright that "customers are handled digitally and are not physically
# present", so they stay out). This used to carry six slugs that do not exist
# anywhere in the game's own type registry — "grocerystore", "restaurant",
# "cafe", "bar", "fastfood", "hairsalon" — which silently misclassified every
# jewelry, bookstore, florist, theater, nightclub, fast food, coffee shop,
# fruit/veg, and hairdresser business as "support", so none of them ever got a
# satisfaction, no-staff, or amenity alert. Checked against
# BigAmbitions_Data/StreamingAssets/locale/en.json.
RETAIL_TYPES = {
    "ba:businesstype_bookstore",
    "ba:businesstype_cinema",
    "ba:businesstype_clothingstore",
    "ba:businesstype_coffeeshop",
    "ba:businesstype_electronicsstore",
    "ba:businesstype_fastfoodrestaurant",
    "ba:businesstype_florist",
    "ba:businesstype_fruitandvegetablestore",
    "ba:businesstype_giftshop",
    "ba:businesstype_gym",
    "ba:businesstype_hairdresser",
    "ba:businesstype_jewelrystore",
    "ba:businesstype_liquorstore",
    "ba:businesstype_nightclub",
    "ba:businesstype_supermarket",
    "ba:businesstype_theater",
}

# Shops that resell goods bought in, so running out is a restocking problem.
# Factories make their own output; a cinema, theater, gym or hairdresser's
# real line is a ticket or a service fee, not stock that can run out, even
# though each also carries a couple of incidental wholesaler-sourced drinks.
RESELLER_TYPES = RETAIL_TYPES - {
    "ba:businesstype_cinema",
    "ba:businesstype_gym",
    "ba:businesstype_hairdresser",
    "ba:businesstype_theater",
}

# Sites that exist to carry cost for the rest of the chain.
OVERHEAD_TYPES = {
    "ba:businesstype_headquarters",
    "ba:businesstype_warehouse",
    "ba:businesstype_distributioncenter",
}

# Cost centres: most of what a factory makes leaves as goods for the shops rather
# than as sales, so its books run negative by design. Overhead sites likewise.
# A red line at any of these is the plan working, not a problem to report.
COST_CENTRE_TYPES = OVERHEAD_TYPES | {
    "ba:businesstype_factory",
    "ba:businesstype_foodfactory",
    "ba:businesstype_electronicsfactory",
}

STOCK_COVER_DAYS = 7  # window used for the average daily sales rate

# Vending-machine drinks and the free checkout bag ride along in almost every
# business's price list regardless of what it actually specialises in. Left in,
# they pad every business type's product count by the same handful and drown
# out what the type is actually built around.
AMENITY_ITEMS = {
    "ba:itemname_paperbag",
    "ba:itemname_sodacan",
    "ba:itemname_energydrink",
    "ba:itemname_cupofcoffee",
}

# The per-type product range used to live here as a hand-typed table. It now
# comes straight from the game's own F1 help pages instead — see
# _type_catalogue_from_help() — so there is nothing to maintain by hand.

# Every customer-facing amenity the game itself checks for, keyed by what
# cachedFulfilledCustomerDemands calls it when present. Only ever populated for
# a business that is open, retail, and trading — see hasAmenity in _business().
AMENITY_DEMANDS = {
    "ba:customerdemand_employeeuniforms": (
        "uniform",
        "No staff uniforms set; customers notice the bare-clothes look",
    ),
    "ba:customerdemand_toilet": ("bathroom", "No customer bathroom here"),
    "ba:customerdemand_toiletprivacy": (
        "toiletprivacy",
        "Customer bathroom has no privacy: no stall or door",
    ),
    "ba:customerdemand_sink": ("sink", "No sink for customers to wash up"),
    "ba:customerdemand_music": ("music", "No music playing for customers"),
    "ba:customerdemand_interiordesign": (
        "interior",
        "Interior design falls short of what customers expect here",
    ),
}

# Day 1 of a save is a Monday, so day % 7 gives the weekday directly. Confirmed
# against payroll (hours logged this week) and against import delivery days.
WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

# Idle stock thresholds: enough weeks of cover, and enough units, to be worth saying.
IDLE_WEEKS = 4.0
IDLE_UNITS = 500
DEAD_UNITS = 1000  # held but with nothing flowing out at all

# Materiality. A finding with a dollar figure on it has to be worth a fraction of
# a day's profit before it is worth a line; below that it is counted, not read
# out. The floor keeps the gate meaningful on a day when profit is near zero.
MATERIAL_SHARE = 0.005
MATERIAL_FLOOR = 500.0

NEW_SITE_DAYS = 7  # "just opened" — old enough to judge starts here
GRAPH_MIN_STOCK = 100  # below this a holding is a drawer, not a depot
HYPE_BASELINE_DAYS = 3  # trading days needed before a wave to call it a baseline
TREND_MIN_DAYS = 14  # a week-on-week comparison needs two full weeks behind it
TREND_MOVE = 0.15  # how far a site's week has to move before it is news
PROMOTION_CAP = 100  # promotion and marketing both stop counting here
PROMOTION_GAP = 10  # a shortfall smaller than this is an opportunity, not a warning


def weekday(day: int) -> str:
    return WEEKDAYS[day % 7]


# --- what the game's own help text knows -------------------------------
# The save stores ids and counts; the rules behind them live in the locale
# file the game ships. Both are parsed here rather than written down, so a
# patch that changes a recipe changes the dashboard with it.

# "**Bacon** is a special *employee station* that requires employees with
# [Customer Service](skill-customerservice) skill." — only those serve a queue.
# Fridges and shelves carry a Customer Capacity too and must never be summed.
_STATION_RE = re.compile(
    r"special \*employee station\* that requires employees with \[([^\]]+)\]"
)
_CAPACITY_RE = re.compile(r"\*\*Customer Capacity:\*\*\s*([\d,]+)")
_ITEM_HELP_RE = re.compile(r"^help_(ba:itemname_[a-z0-9_]+)_content$")

# "* 40 X [Cheese](products-cheese)" against "* 200 [Burger](products-burger)"
_INGREDIENT_RE = re.compile(
    r"^\*\s*([\d,]+)\s*X\s*\[([^\]]+)\]\(products-([a-z0-9_]+)\)", re.M
)
_OUTPUT_RE = re.compile(r"^\*\s*([\d,]+)\s*\[([^\]]+)\]\(products-([a-z0-9_]+)\)", re.M)
_WORKSTATION_RE = re.compile(r"\[([^\]]+)\]\(furniture-([a-z0-9_]+)workstation\)")
_FURNITURE_RE = re.compile(r"\[([^\]]+)\]\(furniture-([a-z0-9_]+)\)")
_RECIPE_LINK_RE = re.compile(r"\[([^\]]+)\]\(recipes-([a-z0-9_]+)\)")

# A business type's F1 help page — the same text the in-game help menu shows —
# splits its range into "primarily sell" (or, for a one-product type, "can
# sell") and a separate "can additionally sell" for cross-sell extras. Goods
# link as [Label](products-slug), service fees as [Label](fees-slug); both use
# the same ba:itemname_ slug underneath.
_BUSINESS_HELP_RE = re.compile(r"^help_(ba:businesstype_[a-z0-9_]+)_content$")
_SELLS_HEADER_RE = re.compile(r"Businesses of this type (?:primarily sell|can sell):")
_SOLD_ITEM_RE = re.compile(r"\[([^\]]+)\]\((?:products|fees)-([a-z0-9_]+)\)")

SERVICE_SKILL = "ba:skill_customerservice"
CLEANING_SHIFT = 0  # a roaming cleaning-station duty
STATION_SHIFT = 1  # a post at one named station


def _int(text: str) -> int:
    return int(text.replace(",", ""))


def _service_stations(names: Names) -> dict:
    """Which furniture serves a customer queue, and how many an hour."""
    out = {}
    for key, text in names.locale.items():
        match = _ITEM_HELP_RE.match(key)
        if not match:
            continue
        station = _STATION_RE.search(text)
        capacity = _CAPACITY_RE.search(text)
        if station and capacity and "Customer Service" in station.group(1):
            out[match.group(1)] = _int(capacity.group(1))
    return out


def _recipes(names: Names) -> dict:
    """Every recipe the game documents, keyed by the product it makes."""
    out = {}
    for key, text in names.locale.items():
        if not (key.startswith("help_recipes_") and key.endswith("_content")):
            continue
        head, _, tail = text.partition("**Max Production Rate Per Hour:**")
        made = _OUTPUT_RE.findall(tail)
        if not made:
            continue
        rate, label, slug = made[0]
        station = _WORKSTATION_RE.search(head)
        out["ba:itemname_" + slug] = {
            "slug": "ba:itemname_" + slug,
            "item": label,
            "out": _int(rate),
            "workstation": station.group(2) if station else None,
            "ingredients": [
                {
                    "slug": "ba:itemname_" + ing,
                    "item": name,
                    "per": _int(amount),
                }
                for amount, name, ing in _INGREDIENT_RE.findall(head)
            ],
        }
    return out


def _type_catalogue_from_help(names: Names) -> dict:
    """The primary range for each business type, straight from its own F1 help page.

    That page also lists what it "can additionally sell" — a florist's spare
    umbrellas, a gift shop's headphones — and that part is deliberately left
    out: those extras belong to whichever type sells them as its main line,
    not to every type that happens to carry a few on the side.
    """
    out = {}
    for key, text in names.locale.items():
        match = _BUSINESS_HELP_RE.match(key)
        if not match:
            continue
        header = _SELLS_HEADER_RE.search(text)
        if not header:
            continue
        block = text[header.end() :].lstrip("\n").split("\n\n", 1)[0]
        items = {"ba:itemname_" + slug for _, slug in _SOLD_ITEM_RE.findall(block)}
        if items:
            out[match.group(1)] = items
    return out


def _workstations(names: Names) -> dict:
    """Which machines make up each workstation, and what it can run."""
    out = {}
    for key, text in names.locale.items():
        match = re.match(r"^help_factory_workstation_([a-z0-9]+)_content$", key)
        if not match:
            continue
        machines, _, rest = text.partition("To an Assembly Machine")
        assembly, _, makes = rest.partition("can be used to create")
        out[match.group(1)] = {
            "slug": match.group(1),
            "name": f"{match.group(1).title()} Workstation",
            "machines": [n for n, _s in _FURNITURE_RE.findall(machines)],
            "assembly": [n for n, _s in _FURNITURE_RE.findall(assembly)],
            "makes": [n for n, _s in _RECIPE_LINK_RE.findall(makes)],
        }
    return out


def site_key(address) -> str:
    return f"{address[0]}#{address[1]}" if address else ""


RHYTHM_MIN_DAYS = 10  # below this there is not enough to separate cycle from noise
RHYTHM_MIN_WEEKS = 2  # every weekday needs at least this many observations
# Steady growth is fine — the centred mean tracks it. A jump this large between
# neighbouring baselines is a level shift (a shop opening, a hype spike), and a
# weekly cycle cannot be told apart from one.
RHYTHM_MAX_STEP = 1.6
# Two-sided t at 95% by sample size. Two observations of a weekday say very
# little, eight say a good deal, and the threshold should reflect that rather
# than treating every sample as if it were large.
T_95 = {2: 12.71, 3: 4.30, 4: 3.18, 5: 2.78, 6: 2.57, 7: 2.45, 8: 2.36, 9: 2.31}


# Consumption is measured, not declared, so two figures this close are the same
# figure. Below the first band it is rounding; below the second it is worth
# knowing but not worth an alarm.
FIT_NOISE = 0.01
FIT_TIGHT = 0.05
FIT_FLOOR = 5  # units, so tiny lines are not judged on fractions
# A holding that empties a few hours before its delivery is an order sized to
# consumption, which is what a well set-up chain looks like.
COVER_NOISE_DAYS = 0.5
# Every site keeps its last sixty delivery transactions. Averaged over the days
# a logistics round actually ran, that log is the draw as it happened; below
# this many days it is an anecdote.
SHIPPED_WINDOW = 7
SHIPPED_MIN_DAYS = 3
# A factory input topped up every morning and holding less than this many
# rounds' worth is a buffer the machines eat through, not a pile.
BUFFER_DAYS = 2
# Naming a machine's recipe from what leaves the factory: within this of the
# rated output it is identified; with only the product in stock it is likely.
LINE_MEASURED = 0.15
LINE_LIKELY = 1.0
LINE_STARVED = 0.75  # a line fed less than this share of its need is losing hours
# The week's arrivals are measured backwards; the need is counted from the
# machines standing there today. A recipe switched on yesterday has six days of
# zeroes behind it and nothing wrong with it, so an input drawn on fewer than
# this share of the window is read from its last completed round instead of
# from an average that describes a factory which no longer exists.
FEED_SETTLED = 0.7
FEED_SLACK = 0.02  # a top-up within this of the need is sized to it
PILE_DAYS = 3  # output held beyond this many days of making it is piling up
LINE_OVERDRAW = 0.3  # a recipe that would eat this much more than arrives is not running
STAFF_HOURS = 168  # a machine runs only while a factory worker is posted to it
STAFF_CRITICAL = 0.5  # below this share of the week a line is barely running
WS_PREFIX = "ba:factoryworkstationtype_"
FLAT_WEEK = {wd: 1.0 for wd in range(7)}


def _fit(need: float, provision: float) -> str:
    """Whether a standing order covers a cycle: 'ok', 'tight' or 'short'."""
    if not need or not provision:
        return "ok"
    gap = need - provision
    if gap <= max(need * FIT_NOISE, FIT_FLOOR):
        return "ok"
    return "tight" if gap <= need * FIT_TIGHT else "short"


def _weekday_profile(points: list) -> list | None:
    """How each weekday compares with its own week, as a percentage.

    A business that grew tenfold over the sample would otherwise make late
    weekdays look strong purely because they happened later. Each day is divided
    by a centred seven-day mean first, which cancels the trend and leaves the
    weekly cycle behind.
    """
    values = {day: float(value) for day, value in points}
    if len(values) < RHYTHM_MIN_DAYS:
        return None

    baselines = {}
    for day, value in values.items():
        window = [values[d] for d in range(day - 3, day + 4) if d in values]
        if len(window) >= 5:  # enough neighbours to say what a normal week looked like
            baseline = sum(window) / len(window)
            if baseline > 0:
                baselines[day] = baseline

    ordered = sorted(baselines)
    for earlier, later in zip(ordered, ordered[1:]):
        step = baselines[later] / baselines[earlier]
        if step > RHYTHM_MAX_STEP or step < 1 / RHYTHM_MAX_STEP:
            return None

    indexed = collections.defaultdict(list)
    for day, baseline in baselines.items():
        indexed[day % 7].append(values[day] / baseline)

    if len(indexed) < 7 or sum(len(v) for v in indexed.values()) < RHYTHM_MIN_DAYS:
        return None
    if min(len(v) for v in indexed.values()) < RHYTHM_MIN_WEEKS:
        return None

    # Signal against noise: the gap between the best and worst weekday has to
    # clear the uncertainty in those weekday averages, or the pattern is drift
    # dressed up as a cycle. Standard error is used rather than raw spread so
    # that a long, noisy history is not penalised for simply having more of it.
    means = {wd: sum(v) / len(v) for wd, v in indexed.items()}
    signal = max(means.values()) - min(means.values())
    errors = [
        statistics.stdev(v) / math.sqrt(len(v)) for v in indexed.values() if len(v) > 1
    ]
    noise = sum(errors) / len(errors) if errors else 0.0
    thinnest = min(len(v) for v in indexed.values())
    if signal <= T_95.get(thinnest, 2.26) * noise:
        return None
    return [
        {
            "day": WEEKDAYS[wd],
            "short": WEEKDAYS[wd][:3],
            "index": round(sum(indexed[wd]) / len(indexed[wd]) * 100),
            "n": len(indexed[wd]),
        }
        for wd in (1, 2, 3, 4, 5, 6, 0)
    ]


def _weeks(profile: list | None) -> int:
    """How many observations back the thinnest weekday of a profile."""
    return min((p["n"] for p in profile), default=0) if profile else 0


def _swing(profile: list | None) -> int:
    """How far the best weekday sits above the worst, in points."""
    if not profile:
        return 0
    return max(p["index"] for p in profile) - min(p["index"] for p in profile)


def _peak_day(profile: list | None) -> str | None:
    return max(profile, key=lambda p: p["index"])["day"] if profile else None


def money(x: float) -> float:
    return round(float(x or 0), 2)


# ---------------------------------------------------------------- extraction
def extract(save: Save, names: Names, history_path: str | None = None) -> dict:
    root = save.root
    day = root["Day"]

    buildings = [
        b for b in save.items(root["BuildingRegistrations"]) if b.get("RentedByPlayer")
    ]
    summaries = sorted(
        save.items(root["financialSummaries"]), key=lambda s: s["dayNumber"]
    )

    stations = _service_stations(names)
    recipes = _recipes(names)
    staff_by_addr, staff = _staff(save, names)
    crew_skill = {p["id"]: p["skill"] for p in staff}
    residential = _residential_addresses(save, summaries)
    stmt_history = _statement_history(save, summaries)
    latest = stmt_history[-1][1] if stmt_history else {}

    businesses = []
    for b in buildings:
        addr = (b["StreetName"], b["StreetNumber"])
        if addr in residential:
            continue
        businesses.append(
            _business(save, names, b, addr, latest, stmt_history, staff_by_addr, day)
        )
    businesses.sort(key=lambda x: -x["profit"])

    daily = _daily_series(save, summaries)
    loans = _loans(save, names)
    products = _products(businesses)
    history = History(history_path)
    character = root.get("characterId") or "default"
    rhythm = _chain_rhythm(save, buildings, daily, day)
    supply = _supply(save, names, businesses, day, rhythm, recipes, history, character)
    product_rhythm = _product_rhythm(save, buildings, names)
    for entry in products:
        beat = product_rhythm.get(entry["item"])
        entry["peak"] = beat["peak"] if beat else None
        entry["swing"] = beat["swing"] if beat else 0
    market = _market(save, names, businesses, day, history, character)

    profits = [d["profit"] for d in daily]
    last7 = profits[-7:] or [0]
    prev7 = profits[-14:-7] or last7
    profit_avg7 = sum(last7) / len(last7)

    active = [b for b in businesses if b["status"] != "vacant"]
    rent_total = sum(b["rent"] for b in businesses)
    wage_total = sum(b["wages"] for b in businesses)

    # A rolling seven-day profit line, so the purchase calendar's sawtooth does
    # not read as trading moving up and down.
    for i, row in enumerate(daily):
        window = [d["profit"] for d in daily[max(0, i - 6) : i + 1]]
        row["profit7"] = money(sum(window) / len(window))

    trends = _site_trends(businesses, day)
    chains = _chains(save, businesses, trends)
    hype = _hype_exposure(businesses, market)

    grids = _hourly(save, buildings, businesses, stations, crew_skill)
    service_wage = collections.defaultdict(float)
    for person in staff:
        if person["skill"] == SERVICE_SKILL and person["addr"]:
            service_wage[site_key(person["addr"])] = max(
                service_wage[site_key(person["addr"])], person["wage"]
            )
    hour_findings = _hour_findings(grids, businesses, service_wage)
    plan = _plan(
        save,
        names,
        businesses,
        market.pop("catalogue"),
        recipes,
        stations,
        _ingredient_prices(save, names, supply, businesses),
        rhythm,
    )
    expansion = _expansion(hour_findings, market, businesses)
    net_worth = _net_worth(root, history, character)
    entry = {
        "hour": root["Hour"],
        "cash": money(root["Money"]),
        "profit": profits[-1] if profits else 0,
    }
    if root.get("NetWorth") is not None:
        entry["netWorth"] = money(root["NetWorth"])
    ledger = history.ledger(character, day, entry)
    history.write()
    gate = max(profit_avg7 * MATERIAL_SHARE, MATERIAL_FLOOR)
    alerts = _alerts(
        businesses, supply, chains, trends, hype, hour_findings, grids, day, gate
    )

    return {
        "meta": {
            "save": root.get("SaveGameName") or "Save",
            "day": day,
            "hour": root["Hour"],
            "minute": int(root["Minute"]),
            "cityDate": _city_date(save, day),
            "build": root.get("buildNumberAtLastSave"),
            "verifiedBuild": VERIFIED_BUILD,
            # Names alone can be shipped with the page; recipes and station
            # capacities only come from the game's own help pages.
            "locale": any(k.startswith("help_") for k in names.locale),
            "difficulty": _difficulty(save)["label"],
            "houseRules": _difficulty(save),
            "generated": dt.datetime.now().strftime("%d %b %Y, %H:%M"),
            "source": os.path.basename(save.path),
            "saved": dt.datetime.fromtimestamp(os.path.getmtime(save.path)).strftime(
                "%d %b %Y, %H:%M"
            ),
        },
        "kpi": {
            "cash": money(root["Money"]),
            "netWorth": net_worth["value"],
            "netWorthAsOf": net_worth["asOf"],
            "debt": sum(l["remaining"] for l in loans),
            "profitYesterday": profits[-1] if profits else 0,
            "profitAvg7": profit_avg7,
            "profitPrev7": sum(prev7) / len(prev7),
            "profitSum7": sum(last7),
            "materiality": round(gate, 2),
            "revenue": daily[-1]["revenue"] if daily else 0,
            "businesses": len(active),
            "vacant": len(businesses) - len(active),
            "employees": len(staff),
            "wageBill": wage_total,
            "rentBill": rent_total,
            "customers": sum(b["customers"] for b in businesses),
        },
        "daily": daily,
        "businesses": businesses,
        "products": products,
        "staff": _staff_summary(staff, businesses),
        "loans": loans,
        "supply": supply,
        "rhythm": rhythm,
        "market": market,
        "chains": chains,
        "trends": trends,
        "hypeExposure": hype,
        "hours": grids,
        "hourFindings": hour_findings,
        "plan": plan,
        # Every item name the text knows, so a material that no recipe or shop
        # line mentions is still named where the tables list it.
        "itemNames": {k: v for k, v in names.locale.items() if k.startswith("ba:itemname_")},
        "expansion": expansion,
        "cashFlow": _cash_flow(ledger, daily, day),
        "ledgerDays": len(ledger),
        "alerts": alerts["lines"],
        "minor": alerts["minor"],
        "goals": _goals(save, names),
        "weekly": _weekly(save),
    }


def _net_worth(root: dict, history, character: str) -> dict:
    """Net worth, or the last one the game told us.

    Build 3672 dropped ``NetWorth`` from the save (``midnightBankBalances``
    appeared in its place). There is no honest way to recompute the game's own
    figure from what is left, so the last recorded one is carried forward and
    labelled with the day it came from rather than passed off as today's.
    """
    live = root.get("NetWorth")
    if live is not None:
        return {"value": money(live), "asOf": None}
    for entry in reversed(history.ledger_entries(character)):
        if entry.get("netWorth"):
            return {"value": money(entry["netWorth"]), "asOf": entry["day"]}
    return {"value": None, "asOf": None}


def _city_date(save: Save, day: int) -> str:
    """In-game day number rendered as a year/day-of-year, using the save's calendar."""
    per_year = save.deref(save.root.get("gameVariables")).get("daysPerYear") or 60
    year = (day - 1) // per_year + 1
    return f"Year {year}, day {(day - 1) % per_year + 1} of {per_year}"


# The custom-game sliders, with the direction that makes the game harder. Names
# and effects are the game's own, from main_menu_custom_game_* in the locale.
HOUSE_RULES = [
    ("marketPriceMultiplier", "Public prices", 1.0, "up",
     "cost of wholesale and imported goods, hospital fees and the like"),
    ("employeeHourlySalaryMultiplier", "Salary demands", 1.0, "up", "what staff cost an hour"),
    ("bankInterestMultiplier", "Bank interest", 1.0, "up", "interest on loans and investments"),
    ("rivalsDifficultyMultiplier", "Rival attacks", 1.0, "up",
     "severity of rival attacks; 0 switches them off entirely"),
    ("baseCustomerPromotionMultiplier", "Base customers", 1.0, "down",
     "customers you get before any traffic or marketing"),
    ("exportMultiplier", "Export income", 1.0, "down", "what exporting pays"),
    ("sellingMultiplier", "Resale value", 1.0, "down", "what selling something back returns"),
    ("wholesaleUrgentFeeMultiplier", "Urgent wholesale fee", 1.0, "up",
     "surcharge for rushing a wholesale order"),
    ("importerUrgentFeeMultiplier", "Urgent import fee", 1.0, "up",
     "surcharge for rushing an import"),
    ("taxPercentage", "Tax rate", 30, "up", "annual rate from the IRS"),
]


def _difficulty(save: Save) -> dict:
    """The house rules, read off the save rather than guessed from a preset id.

    The stored ``difficulty`` is only a slot number, and a custom game keeps its
    own multipliers regardless of what that slot says — so the settings
    themselves are the honest answer to "how hard is this game".
    """
    gv = save.deref(save.root.get("gameVariables")) or {}
    rules = []
    for key, name, neutral, harder, what in HOUSE_RULES:
        value = gv.get(key)
        if value is None:
            continue
        value = round(value, 3)
        # An unset multiplier reads as 0 in older saves; that is absence, not a
        # setting, except for rival attacks where 0 genuinely means "off".
        if not value and key != "rivalsDifficultyMultiplier":
            continue
        if value == neutral:
            lean = "level"
        else:
            up = value > neutral
            lean = "harder" if (up == (harder == "up")) else "easier"
        rules.append({"name": name, "value": value, "neutral": neutral,
                      "lean": lean, "what": what})

    tougher = sum(1 for r in rules if r["lean"] == "harder")
    softer = sum(1 for r in rules if r["lean"] == "easier")
    custom = bool(tougher or softer)
    return {
        "label": "Custom" if custom else "Stock settings",
        "slot": gv.get("difficulty"),
        "harder": tougher,
        "easier": softer,
        "startingMoney": gv.get("startingMoney"),
        "rules": rules,
    }


def _residential_addresses(save: Save, summaries: list) -> set:
    """Apartments are billed as residences, not businesses."""
    out = set()
    for s in summaries[-5:]:
        for r in save.items(s.get("residentialStatements")):
            addr = save.address(r.get("Address"))
            if addr:
                out.add(addr)
    return out


def _statement_history(save: Save, summaries: list) -> list:
    history = []
    for s in summaries:
        by_addr = {}
        for st in save.items(s["businessIncomeStatements"]):
            addr = save.address(st.get("Address"))
            if addr:
                by_addr[addr] = st
        history.append((s["dayNumber"], by_addr))
    return history


def _staff(save: Save, names: Names):
    by_addr = collections.defaultdict(list)
    staff = []
    for e in save.items(save.root["EmployeeInstances"]):
        char = save.deref(e.get("characterData")) or {}
        skills = save.items(char.get("skills"))
        top = max(skills, key=lambda s: s["value"], default=None)
        rec = {
            "id": e.get("id"),
            "name": char.get("name", "?"),
            "role": names.label(top["name"]) if top else "-",
            "skill": top["name"] if top else None,
            "level": round(top["value"], 0) if top else 0,
            "wage": money(e.get("hourlyWage", 0)),
            "hours": e.get("assignedWeeklyHours", 0),
            "satisfaction": round(e.get("satisfaction", 0)),
            "hired": e.get("dayHired", 0),
            "addr": save.address(e.get("assignedAddress")),
            "absent": bool(e.get("isAbsent")),
            "complaining": bool(
                (save.deref(e.get("complaintData")) or {}).get("isComplaining")
            ),
        }
        rec["daily"] = rec["wage"] * rec["hours"] / 7
        staff.append(rec)
        by_addr[rec["addr"]].append(rec)
    return by_addr, staff


def _business(save, names, b, addr, latest, history, staff_by_addr, day) -> dict:
    st = latest.get(addr, {})
    name = b.get("BusinessName")
    tag = ""
    if name and name.startswith("[") and "]" in name:
        tag = name[1 : name.index("]")]

    # The city is fixed, so the building table knows the neighbourhood from the
    # address alone; the name prefix only covers an address it does not list.
    building = load_buildings().get(addr)
    neighbourhood = building["h"] if building else NEIGHBOURHOODS.get(tag, "")

    orders = save.items(b["orderHistory"])
    customer_days = [
        (e["dayNumber"], e.get("totalCustomers", 0))
        for e in orders
        if e.get("totalCustomers")
    ]
    revenue_days = [
        (dayno, by_addr[addr]["TotalSales"])
        for dayno, by_addr in history
        if addr in by_addr and by_addr[addr]["TotalSales"] > 0
    ]
    rhythm = _weekday_profile(revenue_days)
    customer_rhythm = _weekday_profile(customer_days)
    recent = orders[-STOCK_COVER_DAYS:]
    customers = recent[-1]["totalCustomers"] if recent else 0

    units_sold = collections.Counter()
    revenue_by_item = collections.Counter()
    for entry in recent:
        for sale in save.items(entry.get("itemSales")):
            units_sold[sale["itemName"]] += sale.get("amountSold", 0)
            revenue_by_item[sale["itemName"]] += sale.get("totalPrice", 0)
    span = max(len(recent), 1)

    stock = collections.Counter()
    for holder in save.items(b["itemInstances"]):
        item = save.deref(holder.get("$v")) if isinstance(holder, dict) else None
        if not item:
            continue
        for cargo in save.items(item.get("cargoInstances")):
            stock[cargo["itemName"]] += cargo.get("amount", 0)

    prices = {
        p["itemName"]: p["price"] for p in save.items(b["retailPrices"]) if p
    }

    lines = []
    for item in set(stock) | set(units_sold) | set(prices):
        rate = units_sold[item] / span
        lines.append(
            {
                "item": names.label(item),
                "slug": item,
                "units": int(stock[item]),
                "rate": round(rate, 1),
                "cover": round(stock[item] / rate, 1) if rate > 0.5 else None,
                "price": money(prices.get(item, 0)),
                "revenue": money(revenue_by_item[item] / span),
                "soldPerDay": round(units_sold[item] / span),
                "soldPerWeek": round(units_sold[item] / span * 7),
            }
        )
    lines.sort(key=lambda x: (x["cover"] is None, x["cover"] if x["cover"] else 0))

    series = []
    for dayno, by_addr in history[-30:]:
        s = by_addr.get(addr)
        if s:
            series.append(
                {
                    "day": dayno,
                    "profit": money(s["TotalProfit"]),
                    "revenue": money(s["TotalSales"]),
                }
            )

    crew = staff_by_addr.get(addr, [])
    sat = save.deref(b.get("satisfaction")) or {}
    promo = save.deref(b.get("promotion")) or {}
    btype = b.get("businessTypeName", "")
    revenue = money(st.get("TotalSales", 0))
    profit = money(st.get("TotalProfit", 0))

    if not name:
        status = "vacant"
    elif btype in RETAIL_TYPES:
        status = "retail"
    elif btype in OVERHEAD_TYPES:
        status = "overhead"
    else:
        status = "support"

    # What customers currently find when they walk in. The game tracks this
    # itself and only for a business that is open and trading — a factory or
    # warehouse never has it, so a missing entry only means something for a
    # retail floor that is actually seeing customers.
    demands = set(save.items(b.get("cachedFulfilledCustomerDemands")))
    missing_amenities = (
        [slug for slug in AMENITY_DEMANDS if slug not in demands]
        if status == "retail"
        else []
    )

    return {
        "name": name or "Vacant lease",
        "tag": tag,
        "neighbourhood": neighbourhood,
        # The badge's two letters: the player's own prefix, or the canonical
        # one for a neighbourhood only the table knows.
        "code": tag or HOOD_TAG.get(neighbourhood, ""),
        "type": names.label(btype, "Empty"),
        "typeSlug": btype,
        "status": status,
        "costCentre": btype in COST_CENTRE_TYPES,
        "key": site_key(addr),
        "restocks": btype in RESELLER_TYPES,
        "address": f"{b['StreetNumber']} {names.street(b['StreetName'])}",
        "opened": b.get("creationDay", 0),
        "rent": money(b.get("RentPerDay", 0)),
        "capacity": b.get("customerCapacity", 0),
        "revenue": revenue,
        "cogs": money(st.get("TotalResources", 0)),
        "wages": money(st.get("SalaryExpenses", 0)),
        "marketing": money(st.get("MarketingExpenses", 0)),
        "theft": money(st.get("Theft", 0)),
        "licensing": money(st.get("LicensingFees", 0)),
        "profit": profit,
        "margin": round(profit / revenue * 100, 1) if revenue else None,
        "satisfaction": {
            "overall": sat.get("overall", 0) if status == "retail" else None,
            "service": sat.get("customerService", 0),
            "pricing": sat.get("pricing", 0),
            "cleanliness": sat.get("cleanliness", 0),
            "facility": sat.get("facility", 0),
        },
        "promotion": promo.get("total", 0),
        "traffic": promo.get("trafficIndex", 0),
        "marketingIndex": promo.get("marketing", 0),
        "missingAmenities": missing_amenities,
        "staff": len(crew),
        "staffCost": sum(c["daily"] for c in crew),
        "crew": _crew(crew),
        "rhythm": rhythm,
        "customerRhythm": customer_rhythm,
        "swing": _swing(rhythm or customer_rhythm),
        "peakDay": _peak_day(rhythm or customer_rhythm),
        "customers": customers,
        # customerCapacity is how many shoppers fit inside at once, not a daily
        # figure, so spend per visit is the honest derived number here.
        "basket": round(revenue / customers, 2) if customers else None,
        "security": round(b.get("securityLevelPercentage", 0)),
        "lines": lines,
        "series": series,
        "daysOpen": max(day - b.get("creationDay", day), 1),
    }


def _crew(crew: list) -> list:
    """Who works here, folded into roles."""
    roles = collections.OrderedDict()
    for person in sorted(crew, key=lambda c: (c["role"], -c["level"])):
        entry = roles.setdefault(
            person["role"], {"role": person["role"], "count": 0, "daily": 0.0, "skill": 0}
        )
        entry["count"] += 1
        entry["daily"] += person["daily"]
        entry["skill"] = max(entry["skill"], person["level"])
    for entry in roles.values():
        entry["daily"] = money(entry["daily"])
    return sorted(roles.values(), key=lambda r: -r["count"])


def _chain_rhythm(save: Save, buildings: list, daily: list, day: int) -> dict:
    """The weekly cycle across the whole chain, in revenue and in footfall."""
    customers = collections.Counter()
    for b in buildings:
        for entry in save.items(b["orderHistory"]):
            customers[entry["dayNumber"]] += entry.get("totalCustomers", 0)
    profiles = {
        "revenue": _weekday_profile([(d["day"], d["revenue"]) for d in daily]),
        "profit": _weekday_profile(
            [(d["day"], d["profit"]) for d in daily if d["profit"] > 0]
        ),
        "customers": _weekday_profile(sorted(customers.items())),
    }
    # What today and yesterday are normally worth, so a single day's figure can
    # be read against its own weekday rather than a flat average.
    reference = profiles["customers"] or profiles["revenue"]
    by_name = {p["day"]: p["index"] for p in reference} if reference else {}
    today = WEEKDAYS[day % 7]
    yesterday = WEEKDAYS[(day - 1) % 7]
    profiles["today"] = {"day": today, "index": by_name.get(today)}
    profiles["yesterday"] = {"day": yesterday, "index": by_name.get(yesterday)}
    profiles["basis"] = "customers" if profiles["customers"] else "revenue"
    return profiles


def _product_rhythm(save: Save, buildings: list, names: Names) -> dict:
    """Which weekday each product peaks on, across every shop that sells it."""
    units = collections.defaultdict(collections.Counter)
    for b in buildings:
        for entry in save.items(b["orderHistory"]):
            for sale in save.items(entry.get("itemSales")):
                units[sale["itemName"]][entry["dayNumber"]] += sale.get("amountSold", 0)
    out = {}
    for item, by_day in units.items():
        profile = _weekday_profile(sorted(by_day.items()))
        if profile:
            out[names.label(item)] = {
                "profile": profile,
                "peak": _peak_day(profile),
                "swing": _swing(profile),
            }
    return out


def _daily_series(save: Save, summaries: list) -> list:
    out = []
    for s in summaries:
        revenue = cogs = wages = rent = marketing = theft = 0.0
        for st in save.items(s["businessIncomeStatements"]):
            revenue += st.get("TotalSales", 0)
            cogs += st.get("TotalResources", 0)
            wages += st.get("SalaryExpenses", 0)
            rent += st.get("RentExpenses", 0)
            marketing += st.get("MarketingExpenses", 0)
            theft += st.get("Theft", 0)
        out.append(
            {
                "day": s["dayNumber"],
                "profit": money(s.get("totalProfit", 0)),
                "business": money(s.get("totalBusinessProfit", 0)),
                "revenue": money(revenue),
                "cogs": money(cogs),
                "wages": money(wages),
                "rent": money(rent),
                "marketing": money(marketing),
                "theft": money(theft),
                "loans": money(-s.get("totalLoanExpenses", 0)),
            }
        )
    return out


def _loans(save: Save, names: Names) -> list:
    out = []
    for l in save.items(save.root["Loans"]):
        remaining = money(l.get("remainingAmount", 0))
        total = money(l.get("totalAmount", 0))
        out.append(
            {
                "bank": names.addr(save.address(l.get("bankAddress"))),
                "total": total,
                "remaining": remaining,
                "repaid": round((1 - remaining / total) * 100, 1) if total else 0,
                "dailyPayment": money(l.get("dailyPayment", 0)),
                "dailyInterest": money(l.get("dailyInterest", 0)),
            }
        )
    return sorted(out, key=lambda x: -x["remaining"])


def _products(businesses: list) -> list:
    agg = collections.defaultdict(
        lambda: {"revenue": 0.0, "units": 0, "week": 0, "stock": 0, "stores": 0}
    )
    for b in businesses:
        for line in b["lines"]:
            if not line["revenue"] and not line["units"]:
                continue
            rec = agg[line["item"]]
            rec["revenue"] += line["revenue"]
            rec["units"] += line["soldPerDay"]
            rec["week"] += line["soldPerWeek"]
            rec["stock"] += line["units"]
            rec["stores"] += 1 if line["revenue"] else 0
    out = [{"item": k, **v} for k, v in agg.items()]
    for rec in out:
        rec["revenue"] = money(rec["revenue"])
        rec["price"] = round(rec["revenue"] / rec["units"], 2) if rec["units"] else 0
    return sorted(out, key=lambda x: -x["revenue"])


def _staff_summary(staff: list, businesses: list) -> dict:
    by_role = collections.Counter(s["role"] for s in staff)
    cost_by_role = collections.Counter()
    for s in staff:
        cost_by_role[s["role"]] += s["daily"]
    by_site = collections.Counter()
    for b in businesses:
        by_site[b["name"]] = b["staff"]
    return {
        "total": len(staff),
        "dailyCost": sum(s["daily"] for s in staff),
        "avgSatisfaction": round(sum(s["satisfaction"] for s in staff) / len(staff), 1)
        if staff
        else 0,
        "unhappy": sum(1 for s in staff if s["satisfaction"] < 70),
        "absent": sum(1 for s in staff if s["absent"]),
        "complaining": sum(1 for s in staff if s["complaining"]),
        "roles": sorted(
            ({"role": r, "count": c, "cost": round(cost_by_role[r])} for r, c in by_role.items()),
            key=lambda x: -x["count"],
        ),
        "sites": sorted(
            ({"site": s, "count": c} for s, c in by_site.items() if c),
            key=lambda x: -x["count"],
        ),
    }


def _weekly(save: Save) -> list:
    income = {
        t["m_Item1"]: t["m_Item2"] for t in save.items(save.root["playerWeeklyIncomeHistory"])
    }
    count = {
        t["m_Item1"]: t["m_Item2"]
        for t in save.items(save.root["playerNumberOfBusinessesHistory"])
    }
    return [
        {"day": d, "income": money(income[d]), "businesses": count.get(d, 0)}
        for d in sorted(income)
    ]


def _goals(save: Save, names: Names) -> dict:
    """Career totals, with a denominator where the save carries one.

    The save lists every diploma the player can study and every story rival,
    so those two read "n of total". The personal goals list holds only the
    completed ones and the achievement counters have no target, so the rest
    are bare totals.
    """
    ach = save.deref(save.root.get("achievementsData")) or {}
    diplomas = save.items(save.root["PlayerDiplomas"])
    rivals = save.items(save.root.get("specialRivalStates"))
    return {
        "completed": len(save.items(save.root["completedPersonalGoals"])),
        "diplomas": sum(1 for d in diplomas if d.get("completed")),
        "diplomasTotal": len(diplomas),
        "rivalsDefeated": sum(1 for r in rivals if r.get("isDefeated")),
        "rivalsTotal": len(rivals),
        "goodsProduced": ach.get("goodsProducedInFactories", 0),
        "taxesPaid": money(ach.get("taxesPaid", 0)),
    }


def _supply(
    save: Save,
    names: Names,
    businesses: list,
    day: int,
    rhythm: dict,
    recipes: dict | None = None,
    history: "History | None" = None,
    character: str = "default",
) -> dict:
    """How the goods actually move: a daily top-up round, and a weekly import.

    The logistics manager refills every shop to a per-item target each morning,
    so a shop only runs dry if it sells more in a day than that target. Imports
    land once a week, so a warehouse only runs dry if its holding cannot cover
    the daily draw until the next delivery. Those are the two questions worth
    asking, plus: what is piling up and never moving?
    """
    index = {b["key"]: i for i, b in enumerate(businesses)}
    sold = {b["key"]: {l["slug"]: l["rate"] for l in b["lines"]} for b in businesses}
    held = {b["key"]: {l["slug"]: l["units"] for l in b["lines"]} for b in businesses}

    # Most of today is already spent. A save taken at 23:00 on a Saturday has one
    # hour of Saturday's selling left in it, not a whole day of it, and charging
    # the full day would report a warehouse running dry that is in fact fine.
    # Everything that walks forward from now starts with this fraction.
    left_today = max(0.0, (24 - save.root["Hour"] - int(save.root["Minute"]) / 60) / 24)
    spent_today = 1 - left_today

    # A flat daily average under-provisions a Saturday and over-provisions a
    # Wednesday, so every consumption figure below is read through the weekday
    # profile of the site doing the consuming.
    chain_beat = rhythm.get("customers") or rhythm.get("revenue")

    def beat(business: dict) -> dict:
        profile = business.get("rhythm") or chain_beat
        if not profile:
            return {wd: 1.0 for wd in range(7)}
        by_name = {p["day"]: p["index"] / 100 for p in profile}
        return {wd: by_name.get(WEEKDAYS[wd], 1.0) for wd in range(7)}

    def peak_of(business: dict):
        profile = business.get("rhythm") or chain_beat
        if not profile:
            return 1.0, None
        top = max(profile, key=lambda p: p["index"])
        return top["index"] / 100, top["day"]

    # The distribution graph: factory -> warehouse -> shop, with a stock target
    # on every edge.
    edges = collections.defaultdict(list)
    target_at = {}
    for plan in save.items(save.root["logisticsManagerPlans"]):
        source = site_key(save.address(plan["targetAddress"]))
        for dest in save.items(plan["destinations"]):
            dest_key = site_key(save.address(dest["deliveryTargetAddress"]))
            for target in save.items(dest["stockTargets"]):
                item, amount = target["itemName"], target["targetAmount"]
                edges[source].append((dest_key, item, amount))
                target_at[(dest_key, item)] = (amount, source)

    drawn = {}

    def draw(key: str, item: str, seen: frozenset = frozenset()) -> float:
        """Units of `item` leaving this site per day, following the chain down."""
        if key not in index or key in seen:
            return 0.0  # a pier or someone else's address: an export, not a draw
        if (key, item) in drawn:
            return drawn[(key, item)]
        total = sold.get(key, {}).get(item, 0.0)
        for dest_key, dest_item, _ in edges.get(key, []):
            if dest_item == item:
                total += draw(dest_key, item, seen | {key})
        drawn[(key, item)] = total
        return total

    def customer_driven(key: str, item: str, seen: frozenset = frozenset()) -> bool:
        """Whether this holding ends up on a shop floor.

        A shelf follows the week's rhythm; a machine fed to a target every
        morning takes the same amount on a Saturday as on a Tuesday.
        """
        if key not in index or key in seen:
            return False
        if businesses[index[key]]["status"] == "retail":
            return True
        return any(
            customer_driven(dest_key, item, seen | {key})
            for dest_key, dest_item, _ in edges.get(key, [])
            if dest_item == item
        )

    # What each depot actually shipped, from the game's own delivery log. A
    # negative amount is a logistics round leaving, a positive one an import or
    # a factory run arriving. Following sales down the chain cannot see a
    # factory that turns tobacco into cigarettes without selling either, and
    # last week's order is an order, not a measurement; this log is the draw.
    shipped = collections.defaultdict(lambda: collections.defaultdict(float))
    received = collections.defaultdict(lambda: collections.defaultdict(float))
    by_day = collections.defaultdict(lambda: collections.defaultdict(lambda: collections.defaultdict(float)))
    round_days = collections.defaultdict(set)
    inbound_days = collections.defaultdict(set)
    for building in save.items(save.root["BuildingRegistrations"]):
        if not building.get("RentedByPlayer"):
            continue
        key = site_key((building["StreetName"], building["StreetNumber"]))
        for transaction in save.items(building.get("deliveryTransactions")):
            when = transaction.get("dayOfDelivery")
            # Today's round may still be on the road; yesterday's is complete.
            if when is None or when >= day or when < day - SHIPPED_WINDOW:
                continue
            for entry in save.items(transaction.get("deliveryItems")):
                amount = entry.get("amountDelivered", 0)
                if not entry.get("itemName"):
                    continue
                if amount < 0:
                    shipped[key][entry["itemName"]] -= amount
                    round_days[key].add(when)
                elif amount > 0:
                    received[key][entry["itemName"]] += amount
                    inbound_days[key].add(when)
                by_day[key][entry["itemName"]][when] += amount

    def shipped_per_day(key: str, item: str) -> float | None:
        """Measured daily outflow, or None when too few rounds are on record."""
        days = round_days.get(key, ())
        if len(days) < SHIPPED_MIN_DAYS:
            return None
        return shipped[key].get(item, 0.0) / len(days)

    def received_per_day(key: str, item: str) -> float | None:
        """Measured daily inflow, or None when too few rounds are on record."""
        days = inbound_days.get(key, ())
        if len(days) < SHIPPED_MIN_DAYS:
            return None
        return received[key].get(item, 0.0) / len(days)

    # --- imports: what lands weekly, and when
    imports = {}
    next_day = None
    for partnership in save.items(save.root["importPartnerships"]):
        arrives = partnership.get("nextDeliveryDay") or 0
        active = bool(partnership.get("isActive"))
        if active and arrives >= day:
            next_day = arrives if next_day is None else min(next_day, arrives)
        for product in save.items(partnership["products"]):
            warehouse = site_key(save.address(product["assignedWarehouse"]))
            ordered = product.get("amountOrderedLastWeek", 0)
            if not warehouse or not ordered:
                continue
            imports[(warehouse, product["itemName"])] = {
                "weekly": product.get("amount", 0),
                "lastWeek": ordered,
                "arrives": arrives,
                "active": active,
                "from": names.addr(save.address(partnership.get("importAddress"))),
            }

    days_to_import = (next_day - day) if next_day is not None else None
    # The delivery lands at the start of its day, so the stock has to reach it
    # from now — the rest of today plus the whole days in between.
    hours_to_import = (
        max(days_to_import - spent_today, 0.0) if days_to_import is not None else None
    )
    depot_days = hours_to_import if hours_to_import else 7.0

    # --- 1. shops: does a day of selling outrun the morning top-up?
    shop_rows = []
    for business in businesses:
        if business["status"] != "retail":
            continue
        for line in business["lines"]:
            item, rate = line["slug"], line["rate"]
            if rate <= 0:
                continue
            target, source = target_at.get((business["key"], item), (0, None))
            factor, peak_day = peak_of(business)
            peak_rate = rate * factor
            if target:
                pressure = peak_rate / target
                fit = _fit(peak_rate, target)
                level = (
                    "critical" if fit == "short"
                    else "warn" if fit == "tight" or pressure >= 0.85
                    else "ok"
                )
            elif not line["units"]:
                continue  # never held here, so it is made on demand, not stocked
            else:
                # Nothing refills this shelf on a schedule, so the old
                # days-of-cover question is the right one after all.
                cover = line["units"] / peak_rate
                pressure = None
                level = "critical" if cover < 1 else "warn" if cover < 2 else "ok"
            shop_rows.append(
                {
                    "s": index[business["key"]],
                    "item": line["item"],
                    "sold": round(rate),
                    "peakSold": round(peak_rate),
                    "peakDay": peak_day,
                    "target": target,
                    "pressure": round(pressure * 100) if pressure is not None else None,
                    "stock": line["units"],
                    "from": index.get(source) if source else None,
                    "level": level,
                }
            )
    shop_rows.sort(
        key=lambda r: -(r["pressure"] if r["pressure"] is not None else 999)
    )

    # --- 2. depots: does the holding reach the next delivery?
    import_rows = []
    for business in businesses:
        if business["status"] not in ("overhead", "support"):
            continue
        for line in business["lines"]:
            item = line["slug"]
            supply = imports.get((business["key"], item))
            if not supply or not line["units"] and not supply["lastWeek"]:
                continue
            # The draw, in order of trust: what the delivery log says left,
            # then what the shops down the chain sell, then last week's order
            # as the only figure there is. The last is a guess and is labelled
            # as one below rather than judged.
            logged = shipped_per_day(business["key"], item)
            if logged is not None:
                per_day, basis = logged, "shipped"
            elif draw(business["key"], item) > 0:
                per_day, basis = draw(business["key"], item), "sales"
            else:
                per_day, basis = supply["lastWeek"] / 7, "order"
            if per_day <= 0:
                continue
            driven = customer_driven(business["key"], item)

            # Walk real days forward rather than dividing by an average: three
            # days that land on a weekend eat more than three ordinary ones. Today
            # is charged for the hours it has left, not for a whole day, so cover
            # is measured from now rather than from this morning.
            weekly = beat(business) if driven else FLAT_WEEK
            factor, peak_day = peak_of(business) if driven else (1.0, None)
            remaining, cover, runs_out = line["units"], 0.0, None
            for ahead in range(60):
                share = left_today if ahead == 0 else 1.0
                today_use = per_day * weekly[(day + ahead) % 7] * share
                if today_use <= 0:
                    cover += share
                    continue
                if remaining <= today_use:
                    cover += share * remaining / today_use
                    runs_out = day + ahead
                    break
                remaining -= today_use
                cover += share
            else:
                cover = 60.0

            due = (
                max(supply["arrives"] - day - spent_today, 0.0)
                if supply["active"]
                else None
            )

            # Is the standing order the right size? Last week's draw is not the
            # test — an order that exactly matched last week's use is a well
            # sized order, not a warning. The test is the week the order has to
            # cover, charged day by day at each weekday's own rate, the same
            # walk the cover figure above uses.
            start = supply["arrives"] if supply["active"] else day
            week_need = sum(per_day * weekly[(start + ahead) % 7] for ahead in range(7))
            # Last week's order against this week's is a change of mind, not a
            # shortfall; without a measured draw the order is not judged.
            order_fit = _fit(week_need, supply["weekly"]) if basis != "order" else "ok"

            # An order sized to consumption always looks as though it runs out a
            # few hours before the next drop — that is the design, not a finding.
            # So the same tolerance the order fit uses applies to the walk: a gap
            # under half a day, or under 5% of the week the order covers, is
            # tight rather than short.
            slack = max(COVER_NOISE_DAYS, FIT_TIGHT * week_need / per_day)
            short_by = max(due - cover, 0.0) if due is not None else 0.0
            cover_fit = (
                "short" if short_by > slack else "tight" if short_by > 0 else "ok"
            )

            # An order too small for its week and a shelf that runs dry before
            # the next drop are usually the same fact at two stages: the order
            # loses ground every week, and the buffer hides it until it cannot.
            # Naming the order first keeps them one finding with one fix, and
            # leaves 'shortfall' for the case that really is different — an
            # order sized right, and stock that still will not reach the drop.
            if not supply["active"]:
                level, reason = ("critical" if cover < 7 else "warn"), "paused"
            elif order_fit == "short":
                level, reason = "critical", "order"
            elif cover_fit == "short":
                level, reason = "critical", "shortfall"
            elif order_fit == "tight":
                level, reason = "warn", "order"
            elif cover_fit == "tight":
                level, reason = "warn", "shortfall"
            else:
                level, reason = "ok", None
            import_rows.append(
                {
                    "s": index[business["key"]],
                    "item": line["item"],
                    "stock": line["units"],
                    "perDay": round(per_day),
                    "basis": basis,
                    "peakDay": peak_day,
                    "peakPerDay": round(per_day * factor),
                    "cover": round(cover, 1),
                    # The plain division, without the weekday walk: units on the
                    # shelf against a flat day of draw.
                    "daysOnHand": round(line["units"] / per_day, 1) if per_day else None,
                    "runsOut": WEEKDAYS[runs_out % 7] if runs_out is not None else None,
                    "weekly": supply["weekly"],
                    "lastWeek": supply["lastWeek"],
                    "weekNeed": round(week_need),
                    "orderFit": order_fit,
                    "coverFit": cover_fit,
                    "due": round(due, 2) if due is not None else None,
                    "shortBy": round(short_by, 2),
                    "paused": not supply["active"],
                    "arrives": supply["arrives"],
                    "from": supply["from"],
                    "level": level,
                    "reason": reason,
                }
            )
    import_rows.sort(key=lambda r: r["cover"])

    # --- 3. anything just sitting there
    idle_rows = []
    for business in businesses:
        for line in business["lines"]:
            item, units = line["slug"], line["units"]
            if units < IDLE_UNITS:
                continue
            per_week = draw(business["key"], item) * 7
            if per_week <= 0:
                logged = shipped_per_day(business["key"], item)
                supply = imports.get((business["key"], item))
                taken = received_per_day(business["key"], item)
                if logged:
                    per_week = logged * 7
                elif supply:
                    per_week = supply["lastWeek"]
                elif taken and units < taken * BUFFER_DAYS:
                    # A factory neither sells nor ships its inputs. What the
                    # round brings in each morning is what the machines used
                    # the day before, and a holding smaller than two rounds is
                    # the end-of-day buffer that keeps them running, not stock
                    # that has stopped moving.
                    per_week = taken * 7
                else:
                    per_week = 0
            target = target_at.get((business["key"], item), (0, None))[0]
            if per_week <= 0:
                if units >= DEAD_UNITS:
                    idle_rows.append(
                        {
                            "s": index[business["key"]],
                            "item": line["item"],
                            "slug": item,
                            "stock": units,
                            "perWeek": 0,
                            "weeks": None,
                            "target": target,
                            "price": line["price"],
                            "value": money(units * line["price"]),
                            "dead": True,
                            "level": "warn",
                        }
                    )
                continue
            weeks = units / per_week
            if weeks >= IDLE_WEEKS:
                idle_rows.append(
                    {
                        "s": index[business["key"]],
                        "item": line["item"],
                        "slug": item,
                        "stock": units,
                        "perWeek": round(per_week),
                        "weeks": round(weeks, 1),
                        "target": target,
                        "price": line["price"],
                        "value": money(units * line["price"]),
                        "dead": False,
                        "level": "warn" if weeks >= IDLE_WEEKS * 2 else "info",
                    }
                )
    idle_rows.sort(key=lambda r: -(r["weeks"] or 999))

    # --- 3b. the factories: what each line makes and eats, against the flow
    flow = {
        "index": index,
        "held": held,
        "targets": target_at,
        "imports": imports,
        "edges": edges,
        "shipped": shipped_per_day,
        "received": received_per_day,
        "byDay": lambda key, item: by_day[key][item],
        "roundDays": lambda key: round_days.get(key, set()),
    }
    factories = _factories(save, names, businesses, recipes or {}, flow, history, character)

    # --- 4. the chain as a graph, with what each node holds against what it needs
    COLUMN = {"import": 0, "factory": 1, "depot": 2, "shop": 3}
    nodes, links = {}, []

    def node(key, name, kind, tag="", hood="", sub=""):
        if key not in nodes:
            nodes[key] = {
                "id": key,
                "name": name,
                "kind": kind,
                "col": COLUMN[kind],
                "tag": tag,
                "hood": hood,
                "sub": sub,
                "items": [],
                "site": index.get(key),
            }
        return nodes[key]

    def kind_of(business):
        if business["status"] == "retail":
            return "shop"
        if "factory" in (business["typeSlug"] or ""):
            return "factory"
        return "depot"

    for business in businesses:
        if business["status"] == "vacant":
            continue
        node(
            business["key"],
            business["name"],
            kind_of(business),
            business["code"],  # prefix or table-derived, like the site badge
            business["neighbourhood"],
            business["type"],
        )

    # Importers sit outside the company: they are where the week's goods enter.
    for partnership in save.items(save.root["importPartnerships"]):
        source = save.address(partnership.get("importAddress"))
        if not source:
            continue
        source_key = "import:" + site_key(source)
        arrives = partnership.get("nextDeliveryDay") or 0
        node(
            source_key,
            names.addr(source),
            "import",
            "",
            "",
            "Weekly import" if partnership.get("isActive") else "Import paused",
        )
        moved = collections.defaultdict(lambda: [0, 0])
        for product in save.items(partnership["products"]):
            warehouse = site_key(save.address(product["assignedWarehouse"]))
            if warehouse not in nodes or not product.get("amountOrderedLastWeek"):
                continue
            entry = moved[warehouse]
            entry[0] += product["amountOrderedLastWeek"]
            entry[1] += 1
        for warehouse, (amount, count) in moved.items():
            links.append(
                {
                    "from": source_key,
                    "to": warehouse,
                    "perDay": round(amount / 7),
                    "items": count,
                    "cadence": "weekly",
                    "paused": not partnership.get("isActive"),
                    "arrives": arrives,
                }
            )

    for source, destinations in edges.items():
        if source not in nodes:
            continue
        moved = collections.defaultdict(lambda: [0.0, 0])
        for dest_key, item, _target in destinations:
            if dest_key not in nodes:
                continue  # a pier: that is an export, not an internal move
            entry = moved[dest_key]
            entry[0] += draw(dest_key, item)
            entry[1] += 1
        for dest_key, (per_day, count) in moved.items():
            links.append(
                {
                    "from": source,
                    "to": dest_key,
                    "perDay": round(per_day),
                    "items": count,
                    "cadence": "daily",
                    "paused": False,
                    "arrives": None,
                }
            )

    # What each node holds, against what it has to cover before its next refill.
    shop_need = collections.defaultdict(dict)
    for row in shop_rows:
        shop_need[businesses[row["s"]]["key"]][row["item"]] = row
    depot_need = collections.defaultdict(dict)
    for row in import_rows:
        depot_need[businesses[row["s"]]["key"]][row["item"]] = row

    for business in businesses:
        entry = nodes.get(business["key"])
        if not entry:
            continue
        weekly = beat(business)
        factor, _peak_day = peak_of(business)
        for line in business["lines"]:
            shop = shop_need[business["key"]].get(line["item"])
            depot = depot_need[business["key"]].get(line["item"])
            if shop:
                need = shop["peakSold"]
                provision = shop["target"]
                # A shelf is refilled daily, so a day's peak is the whole test.
                cycle_need, cadence = need, "daily"
            elif depot:
                need = round(depot["perDay"] * max(depot_days, 0.0) * factor)
                provision = depot["weekly"]
                # The order arrives weekly, so it has to cover a week — comparing
                # it with the days left until the next one would flatter it.
                cycle_need, cadence = round(depot["perDay"] * 7), "weekly"
            else:
                out = draw(business["key"], line["item"])
                if out <= 0 and line["units"] <= 0:
                    continue
                target = next(
                    (
                        amount
                        for (dest, item), (amount, _src) in target_at.items()
                        if dest == business["key"] and item == line["slug"]
                    ),
                    0,
                )
                need = round(out * factor)
                provision, cycle_need, cadence = target, need, "daily"
            if not need and not line["units"]:
                continue
            # A depot line already carries its verdict, weekday-walked and
            # withheld where no draw has been measured; do not second-guess it.
            fit = depot["orderFit"] if depot else _fit(cycle_need, provision)
            entry["items"].append(
                {
                    "item": line["item"],
                    "stock": line["units"],
                    "need": need,
                    "cycleNeed": cycle_need,
                    "provision": provision,
                    "cadence": cadence,
                    "fit": fit,
                    "short": fit == "short",
                    # Only worth flagging where the next refill is days away. A
                    # half-empty shelf at teatime is tomorrow morning's business.
                    "low": bool(
                        cadence == "weekly" and need and line["units"] < need
                    ),
                }
            )
        rank = {"short": 0, "tight": 1, "ok": 2}
        entry["items"].sort(
            key=lambda i: (rank[i["fit"]], not i["low"], -i["need"])
        )
        entry["short"] = sum(1 for i in entry["items"] if i["fit"] == "short")
        entry["tight"] = sum(1 for i in entry["items"] if i["fit"] == "tight")
        entry["low"] = sum(1 for i in entry["items"] if i["low"])
        entry["stock"] = sum(i["stock"] for i in entry["items"])

    for entry in nodes.values():
        entry.setdefault("tight", 0)
        entry.setdefault("short", 0)
        entry.setdefault("low", 0)
        entry.setdefault("stock", 0)

    # A site earns a place on the diagram by being on a plan or by holding
    # something worth drawing. Head office keeps a dozen paper bags in a drawer;
    # that is not a depot.
    reached = {l["from"] for l in links} | {l["to"] for l in links}
    graph = {
        "nodes": [
            n
            for n in nodes.values()
            if n["id"] in reached or n["stock"] >= GRAPH_MIN_STOCK
        ],
        "links": links,
    }

    return {
        "day": day,
        "today": weekday(day),
        "graph": graph,
        "nextImportDay": next_day,
        "nextImportWeekday": weekday(next_day) if next_day else None,
        "daysToImport": days_to_import,
        "hoursToImport": round(hours_to_import, 2)
        if hours_to_import is not None
        else None,
        "leftToday": round(left_today, 3),
        "shops": shop_rows,
        "imports": import_rows,
        "idle": idle_rows,
        "idleWeeks": IDLE_WEEKS,
        "factories": factories,
    }


# --- staffing by hour ---------------------------------------------------
HOUR_WEEKS_THIN = 2  # a weekday resting on fewer weeks than this is marked thin
AT_CAP = 0.95  # this close to the ceiling is at the ceiling
IDLE_RATIO = 2.0  # capacity this many times the queue is capacity doing nothing
IDLE_RUN = 3  # ...for at least this many hours in a row
IDLE_STAFF = 2  # ...with at least this many people on
HYPE_TIGHT = 0.90  # a wave arriving at a shop already this full is being turned away
PHRASE_SHAPES = 2  # how many weekday-hour patterns to name before counting the rest


def _hour_phrase(hours_by_day: dict) -> str:
    """"Mon-Sun 8-11, 18-20" — the shape of a set of weekday-hours in words."""
    def runs(hours):
        out, start = [], None
        for h in range(25):
            if h in hours and start is None:
                start = h
            elif h not in hours and start is not None:
                out.append(f"{start}-{h}" if h - start > 1 else f"{start}")
                start = None
        return out

    shapes = collections.defaultdict(list)
    for wd, hours in hours_by_day.items():
        shapes[tuple(runs(hours))].append(wd)
    parts, spare = [], 0
    ranked = sorted(shapes.items(), key=lambda kv: (-len(kv[1]), -len(kv[0])))
    for shape, days in ranked:
        order = [1, 2, 3, 4, 5, 6, 0]
        picked = sorted(days, key=order.index)
        if len(parts) >= PHRASE_SHAPES:
            spare += sum(len(h) for d, h in hours_by_day.items() if d in picked)
            continue
        if len(picked) == 7:
            label = "every day"
        elif len(picked) > 2 and [order.index(d) for d in picked] == list(
            range(order.index(picked[0]), order.index(picked[0]) + len(picked))
        ):
            label = f"{WEEKDAYS[picked[0]][:3]}-{WEEKDAYS[picked[-1]][:3]}"
        else:
            label = ", ".join(WEEKDAYS[d][:3] for d in picked)
        parts.append(f"{label} {', '.join(shape)}")
    phrase = "; ".join(parts)
    # A list of every scattered hour is not a shape. Name the pattern and count
    # the rest.
    return f"{phrase} and {spare} scattered hours" if spare else phrase


def _assign(cost: list) -> list:
    """Hungarian assignment: the column for each row, at least total cost.

    Rows are recipe ids and columns candidate recipes. There are never more ids
    than recipes on a workstation, but if there were, the extra rows get None.
    """
    n = len(cost)
    if not n:
        return []
    width = max(len(row) for row in cost)
    m = max(width, n)
    big = 1e6
    a = [[row[j] if j < len(row) else big for j in range(m)] for row in cost]
    u, v = [0.0] * (n + 1), [0.0] * (m + 1)
    p, way = [0] * (m + 1), [0] * (m + 1)
    for i in range(1, n + 1):
        p[0], j0 = i, 0
        minv, used = [float("inf")] * (m + 1), [False] * (m + 1)
        while True:
            used[j0] = True
            i0, delta, j1 = p[j0], float("inf"), 0
            for j in range(1, m + 1):
                if used[j]:
                    continue
                cur = a[i0 - 1][j - 1] - u[i0] - v[j]
                if cur < minv[j]:
                    minv[j], way[j] = cur, j0
                if minv[j] < delta:
                    delta, j1 = minv[j], j
            for j in range(m + 1):
                if used[j]:
                    u[p[j]] += delta
                    v[j] -= delta
                else:
                    minv[j] -= delta
            j0 = j1
            if p[j0] == 0:
                break
        while True:
            j1 = way[j0]
            p[j0] = p[j1]
            j0 = j1
            if j0 == 0:
                break
    out = [None] * n
    for j in range(1, m + 1):
        if p[j] and j - 1 < len(cost[p[j] - 1]):
            out[p[j] - 1] = j - 1
    return out


def _off_hours(covered: set) -> str:
    """The hours nobody is posted, as 'Tue 16-24, Thu 16-24'."""
    parts = []
    for wd in (1, 2, 3, 4, 5, 6, 0):
        gaps = [h for h in range(24) if (wd, h) not in covered]
        if not gaps:
            continue
        runs, start, prev = [], gaps[0], gaps[0]
        for h in gaps[1:]:
            if h != prev + 1:
                runs.append(f"{start}-{prev + 1}")
                start = h
            prev = h
        runs.append(f"{start}-{prev + 1}")
        parts.append(f"{WEEKDAYS[wd][:3]} {', '.join(runs)}")
    return "; ".join(parts)


def _ceil_hundred(value: float) -> int:
    return int(math.ceil(value / 100.0) * 100)


def _depot_flow(flow: dict, index: dict, machines: dict, depot_need: dict) -> tuple:
    """What each depot imports a week, and what leaves it for the shops.

    Both come from the delivery log alone, so they are known even when the
    recipe pages are missing and no factory line can be read. That is why
    this sits apart from the line analysis: the import table must never go
    blank just because en.json was not loaded.
    """
    depots = collections.defaultdict(dict)
    for (depot, slug), supply in flow["imports"].items():
        if depot in index:
            depots[index[depot]][slug] = {"weekly": supply["weekly"]}
    # A depot's outflow that is not a factory's intake: the shops it also
    # serves, so an import order can be sized to the whole of what leaves.
    # Matched day by day: a single 2,500 of hops sent on Sunday must not turn
    # into "417 a week to the shops" because the depot's log holds six days
    # and the factory's seven. What the factories took that day comes off what
    # the depot sent that day; only a remainder is the shops', and a remainder
    # too small to size an order on is nothing.
    depot_other = collections.defaultdict(dict)
    pairs = set(flow["imports"]) | {
        (source, slug) for (_dest, slug), (_amount, source) in flow["targets"].items() if source
    }
    for depot, slug in pairs:
        if depot not in index:
            continue
        days = flow["roundDays"](depot)
        if len(days) < SHIPPED_MIN_DAYS:
            continue
        sent = flow["byDay"](depot, slug)
        taken = [
            flow["byDay"](fkey, slug)
            for fkey in machines
            if flow["targets"].get((fkey, slug), (0, None))[1] == depot
        ]
        rest = sum(
            max(0.0, -sent.get(d, 0.0) - sum(t.get(d, 0.0) for t in taken))
            for d in days
        )
        week = rest / len(days) * 7
        need = depot_need.get((depot, slug), 0.0)
        depot_other[index[depot]][slug] = 0 if week < max(need * FEED_SLACK, 50) else round(week)
    return depots, depot_other


def _factories(
    save: Save,
    names: Names,
    businesses: list,
    recipes: dict,
    flow: dict,
    history: "History | None",
    character: str,
) -> dict:
    """What each factory line makes and eats, against the flow set up to feed it.

    A machine's recipe is stored in the save only as an opaque id, so it is named
    from the flow instead: two machines rated 60 an hour that ship 2,880 garments
    a day are the cheap-clothing line. An id named once is remembered, so a line
    that stops for want of an ingredient keeps its name. Every assembly machine
    runs its recipe around the clock at the rated rate — the delivery log shows
    four tobacco machines at 100 an hour drawing exactly 9,600 a day — so a
    line's need is machines × rate × 24, and the question is whether the top-up
    and the import behind it are set to that.
    """
    index = flow["index"]
    empty = {"sites": [], "machines": 0, "unnamed": 0}
    machines = collections.defaultdict(collections.Counter)
    # Where each machine sits in the factory's workstation list — the one
    # handle the player can match against the game screen — and the hours a
    # factory worker is posted to it. A machine runs only while someone is on
    # it: the wine machine rostered 144 of 168 hours draws 86% of its grapes.
    slots = collections.defaultdict(lambda: collections.defaultdict(list))
    roster = collections.defaultdict(lambda: collections.defaultdict(list))
    for building in save.items(save.root["BuildingRegistrations"]):
        if not building.get("RentedByPlayer"):
            continue
        key = site_key((building["StreetName"], building["StreetNumber"]))
        if key not in index:
            continue
        posts = {}
        for holder in save.items(building["itemInstances"]):
            item = save.deref(holder.get("$v")) if isinstance(holder, dict) else None
            if not item or not item.get("workstationType"):
                continue
            station = item["workstationType"].replace(WS_PREFIX, "").removesuffix("workstation")
            line = (station, item.get("selectedRecipeId"))
            slot = (item.get("priority") or 0) + 1
            machines[key][line] += 1
            slots[key][line].append(slot)
            posts[item.get("id")] = (line, slot)
        covered = collections.defaultdict(set)
        for scheduled in save.items(building.get("scheduleDays")):
            wd = scheduled["day"] % 7
            for shift in save.items(scheduled.get("workShifts")):
                post = shift.get("itemInstanceId")
                if post not in posts or shift.get("type") != STATION_SHIFT:
                    continue
                for hour in range(max(0, shift["startingHour"]), min(24, shift["endingHour"])):
                    covered[post].add((wd, hour))
        for post, (line, slot) in posts.items():
            roster[key][line].append(
                {"slot": slot, "hours": len(covered[post]), "off": _off_hours(covered[post])}
            )
    if not machines or not recipes:
        # No line can be read (no machines, or no recipe pages to read them
        # with), but the depots' orders and outflow are still the log's.
        depots, depot_other = _depot_flow(flow, index, machines, {})
        return {
            **empty,
            "character": character,
            "aliases": {},
            "depots": depots,
            "depotOther": depot_other,
        }

    def station_name(slug: str) -> str:
        text = names.locale.get(f"help_factory_workstation_{slug}_content", "")
        match = re.search(r"\*\*([^*]+)\*\*", text)
        return match.group(1) if match else f"{slug.title()} Workstation"

    by_station = collections.defaultdict(list)
    for slug, rec in recipes.items():
        by_station[rec["workstation"]].append(slug)

    def held(key, slug):
        return flow["held"].get(key, {}).get(slug, 0)

    def out_of(key, slug):
        return flow["shipped"](key, slug) or 0.0

    def arrives(key, slug):
        """The daily feed this line is actually getting.

        The week behind an input only describes it if the input was drawn all
        week. Where the record is younger than the window the average is of a
        factory that has since changed, and the last completed round is the
        honest measure of what the logistics brings in.
        """
        # The log is already cut to the window and to completed days.
        seen = flow["byDay"](key, slug)
        drawn = [d for d, amount in seen.items() if amount > 0]
        if len(drawn) >= SHIPPED_WINDOW * FEED_SETTLED:
            return flow["received"](key, slug) or 0.0
        return seen[max(drawn)] if drawn else 0.0

    def hours_a_day(key, station, rid) -> float:
        """Machine-hours a day this line actually runs, from the roster."""
        return sum(m["hours"] for m in roster[key][(station, rid)]) / 7.0

    # The help text links an ingredient under one name and the game moves it
    # under another — "Bag of Tomatoes" is rawtomato on the page and tomato in
    # every warehouse — so each ingredient is matched to the item the city
    # actually holds, by label when the slug itself is never seen.
    seen = {slug for lines in flow["held"].values() for slug in lines}
    seen |= {slug for _key, slug in flow["targets"]} | {slug for _key, slug in flow["imports"]}
    by_label = collections.defaultdict(list)
    for slug, label in names.locale.items():
        if slug.startswith("ba:itemname_"):
            by_label[label].append(slug)

    def resolve(ing: dict) -> str:
        if ing["slug"] in seen:
            return ing["slug"]
        return next((alt for alt in by_label.get(ing["item"], []) if alt in seen), ing["slug"])

    # --- name the recipe ids: first from what the lines ship
    remembered = history.recipes(character, {}) if history else {}
    sites_of = collections.defaultdict(lambda: collections.defaultdict(dict))
    for key, counter in machines.items():
        for (station, rid), n in counter.items():
            if rid:
                sites_of[station][rid][key] = n
    named, basis, learned, guessed, recalled = {}, {}, {}, {}, {}
    fits = {}  # rid -> recipes whose rated output matches what the id ships
    for station, rid_sites in sites_of.items():
        candidates = by_station.get(station, [])
        rids = list(rid_sites)
        if not candidates:
            continue
        cost, total = [], []
        for rid in rids:
            row, row_total = [], []
            for slug in candidates:
                rec = recipes[slug]
                # A line measured at any one site is measured; the same id
                # standing idle elsewhere does not weaken that. But every
                # site votes on which id is which: the one that also stands
                # at the liquor factory beside 12,000 bottles of wine is the
                # wine id, however alike two single machines look elsewhere.
                best, summed = None, 0.0
                for key, n in rid_sites[rid].items():
                    predicted = hours_a_day(key, station, rid) * rec["out"]
                    shipped = out_of(key, slug)
                    if predicted <= 0:
                        here = 2.0  # nobody rostered: it makes nothing
                    elif shipped > 0:
                        here = min(abs(predicted - shipped) / predicted, 1.0)
                    elif held(key, slug) > 0:
                        here = LINE_LIKELY
                    else:
                        here = 2.0
                    # An ingredient never seen at the site argues against it.
                    here += 0.1 * sum(
                        1
                        for ing in rec["ingredients"]
                        if not held(key, resolve(ing)) and not arrives(key, resolve(ing))
                    )
                    best = here if best is None else min(best, here)
                    summed += here
                row.append(best)
                row_total.append(summed)
            cost.append(row)
            total.append(row_total)
            consistent = [slug for slug, c in zip(candidates, row) if c <= LINE_MEASURED]
            if consistent:
                fits[rid] = consistent
        # A name learnt earlier only breaks ties; fresh evidence outranks it.
        biased = [
            [c - (0.3 if remembered.get(rid) == slug else 0.0) for c, slug in zip(row, candidates)]
            for row, rid in zip(total, rids)
        ]
        assignment = _assign(biased)
        own = [cost[i][j] if j is not None else 9.0 for i, j in enumerate(assignment)]
        if os.environ.get("BA_DEBUG"):
            print("STAGE1", station, [r[:6] for r in rids])
            for i, rid in enumerate(rids):
                print("   ", rid[:6], "->", candidates[assignment[i]].split("_")[-1] if assignment[i] is not None else None,
                      "best", [round(c, 2) for c in cost[i]], "total", [round(c, 2) for c in total[i]])
        for i, j in enumerate(assignment):
            if j is None:
                continue
            rid, slug, c = rids[i], candidates[j], cost[i][j]
            # Two ids that could swap recipes at no cost cannot be told apart;
            # calling either a measurement would put a need on the wrong
            # machines and be remembered as fact.
            tied = any(
                k != i
                and assignment[k] is not None
                and abs(
                    (total[i][assignment[k]] + total[k][j]) - (total[i][j] + total[k][assignment[k]])
                ) < 0.02
                for k in range(len(rids))
            )
            if c <= LINE_MEASURED:
                # Same rate, same machine count, same shipment: the recipes
                # are certain as a set, and the needs follow from the set. Only
                # which id is which is a guess, so a tie is named but never
                # remembered.
                named[rid], basis[rid] = slug, "paired" if tied else "measured"
                if not tied:
                    learned[rid] = slug
            elif remembered.get(rid) == slug:
                # Kept back too: what the line eats today outranks what it
                # shipped on an earlier build.
                recalled[rid] = slug
            elif c <= LINE_LIKELY + 0.2 and not tied:
                # Held but never shipped: a guess, kept back until what the
                # line eats has had its say.
                guessed[rid] = slug

    # A name the player gave by hand outranks a guess, never a measurement.
    chosen = history.named(character) if history else {}
    for rid, slug in chosen.items():
        if (
            slug in recipes
            and (rid not in named or basis[rid] != "measured")
            and slug not in named.values()
        ):
            named[rid], basis[rid] = slug, "you"

    # --- then from what they eat: a line whose output never leaves the
    # factory still draws its ingredients every morning. Cigars and cigarettes
    # sit unsold, but 960 cigar paper a day is two machines at 20 an hour and
    # nothing else on that workstation. What the named lines eat is taken off
    # first; what is left has to be explained by the lines still unnamed. An
    # ingredient only one candidate could be eating decides before a shared
    # one: fresh food and french fries both take potatoes, but only fresh food
    # takes the ground beef that is also arriving.
    def missing(key, slug):
        """Inputs of a recipe that neither arrive nor are held at the site."""
        if flow["received"](key, "") is None:
            return []
        return [
            ing["item"]
            for ing in recipes[slug]["ingredients"]
            if not arrives(key, resolve(ing)) and not held(key, resolve(ing))
        ]

    for key, counter in machines.items():
        residual = {}

        def left(slug):
            if slug not in residual:
                residual[slug] = arrives(key, slug)
            return residual[slug]

        def eat(slug, station, rid):
            for ing in recipes[slug]["ingredients"]:
                item = resolve(ing)
                residual[item] = left(item) - hours_a_day(key, station, rid) * ing["per"]

        for (station, rid), n in counter.items():
            # A line stopped for want of one input eats none of the others.
            if rid and rid in named and not missing(key, named[rid]):
                eat(named[rid], station, rid)
        pending = [(st, rid, n) for (st, rid), n in counter.items() if rid and rid not in named]
        paired = set()
        while pending:
            options = {}
            for station, rid, n in pending:
                # First the recipes its shipments allow; if every one of those
                # is already another line's, anything on the workstation.
                pool = [
                    s for s in fits.get(rid, [])
                    if s in by_station.get(station, []) and s not in named.values()
                ]
                restricted = bool(pool)
                pool = pool or [s for s in by_station.get(station, []) if s not in named.values()]
                feasible = {}
                for slug in pool:
                    errors, over = {}, False
                    for ing in recipes[slug]["ingredients"]:
                        item = resolve(ing)
                        predicted = hours_a_day(key, station, rid) * ing["per"]
                        have = max(left(item), 0.0)
                        if predicted <= 0:
                            over = True
                            break
                        if have <= 0 or predicted > have * (1 + LINE_OVERDRAW):
                            over = True
                            break
                        errors[item] = abs(predicted - have) / predicted
                    if not over and errors:
                        feasible[slug] = errors
                scored = []
                for slug, errors in feasible.items():
                    shared = {
                        resolve(ing)
                        for other in feasible
                        if other != slug
                        for ing in recipes[other]["ingredients"]
                    }
                    own = [e for item, e in errors.items() if item not in shared]
                    scored.append((0, min(own), slug) if own else (1, min(errors.values()), slug))
                options[rid] = sorted(scored)
                if restricted:
                    fits[rid] = pool
                else:
                    fits.pop(rid, None)
            best = None
            for station, rid, n in pending:
                scored = options.get(rid) or []
                if not scored:
                    continue
                rank, err, slug = scored[0]
                # Sure when the anchor fits, or when the output already matched
                # and this is the only recipe left that it could be.
                if err > LINE_MEASURED and not (len(scored) == 1 and rid in fits):
                    continue
                if best is None or (rank, err) < best[:2]:
                    best = (rank, err, rid, station, n, slug)
            if best is None:
                break
            _rank, _err, rid, station, n, slug = best
            # A twin — same workstation, same machine count, and this recipe
            # open to it too — would fit exactly as well. The pair of lines is
            # certain; which id is which is not, so neither is remembered.
            twins = [
                r for st, r, m in pending
                if r != rid and st == station and m == n
                and any(s == slug for _r, _e, s in options.get(r, []))
            ]
            if twins:
                paired.update(twins)
                paired.add(rid)
            named[rid] = slug
            basis[rid] = "paired" if rid in paired else "measured"
            if rid not in paired:
                learned[rid] = slug
            eat(slug, station, rid)
            pending = [p for p in pending if p[1] != rid]
    for rid, slug in recalled.items():
        if rid not in named and slug not in named.values():
            named[rid], basis[rid] = slug, "remembered"
    for rid, slug in guessed.items():
        if rid not in named and slug not in named.values():
            named[rid], basis[rid] = slug, "likely"
    if history and learned:
        history.recipes(character, learned)

    # --- each factory: its lines, and what they eat
    made_by = collections.defaultdict(set)
    sites, depot_need = [], collections.defaultdict(float)
    for key, counter in machines.items():
        lines, unnamed, needs = [], [], {}
        for (station, rid), n in sorted(counter.items(), key=lambda kv: -kv[1]):
            slug = named.get(rid) if rid else None
            staffing = {
                "hoursWeek": sum(m["hours"] for m in roster[key][(station, rid)]),
                "fullWeek": n * STAFF_HOURS,
                "gaps": [
                    m for m in sorted(roster[key][(station, rid)], key=lambda m: m["hours"])
                    if m["hours"] < STAFF_HOURS
                ],
            }
            if not slug:
                # The plan still speaks: a recipe whose every input has a
                # top-up into this factory is what the machines were set up
                # for, even if what they need never turns up.
                hint, best_score, best = None, 0.0, []
                for cand in by_station.get(station, []):
                    ings = recipes[cand]["ingredients"]
                    if cand in named.values() or not ings:
                        continue
                    covered = sum(
                        1
                        for ing in ings
                        if (key, resolve(ing)) in flow["targets"]
                        or held(key, resolve(ing))
                        or arrives(key, resolve(ing))
                    )
                    score = covered / len(ings)
                    if score > best_score:
                        best_score, best = score, [cand]
                    elif score == best_score:
                        best.append(cand)
                if rid and best_score == 1.0 and len(best) == 1:
                    hint = {
                        "item": recipes[best[0]]["item"],
                        "missing": [
                            ing["item"]
                            for ing in recipes[best[0]]["ingredients"]
                            if not arrives(key, resolve(ing))
                        ],
                    }
                unnamed.append(
                    {
                        "rid": rid,
                        "workstation": station_name(station),
                        "slots": sorted(slots[key][(station, rid)]),
                        "machines": n,
                        "idle": rid is None,
                        "candidates": [
                            {"slug": c, "item": recipes[c]["item"]}
                            for c in by_station.get(station, [])
                            if c not in named.values()
                        ],
                        "hint": hint,
                        **staffing,
                    }
                )
                continue
            rec = recipes[slug]
            makes = n * rec["out"] * 24
            share = staffing["hoursWeek"] / staffing["fullWeek"] if staffing["fullWeek"] else 0.0
            ships = out_of(key, slug)
            stock = held(key, slug)
            to_city = sum(a for d, i, a in flow["edges"].get(key, []) if i == slug and d in index)
            to_pier = sum(a for d, i, a in flow["edges"].get(key, []) if i == slug and d not in index)
            stopped = missing(key, slug)
            lines.append(
                {
                    "rid": rid,
                    "item": rec["item"],
                    "slug": slug,
                    "missing": stopped,
                    "workstation": station_name(station),
                    "slots": sorted(slots[key][(station, rid)]),
                    # A line named without a measurement can be corrected.
                    "candidates": [
                        {"slug": c, "item": recipes[c]["item"]}
                        for c in by_station.get(station, [])
                        if c == slug or (c not in named.values())
                    ] if basis[rid] != "measured" else [],
                    "machines": n,
                    "rate": rec["out"],
                    "makes": round(makes),
                    "ships": round(ships),
                    "stock": stock,
                    "toCity": to_city,
                    "toPier": to_pier,
                    "basis": basis[rid],
                    "piling": stock > makes * PILE_DAYS and ships < makes * share * 0.8,
                    "atRoster": round(makes * share),
                    **staffing,
                }
            )
            made_by[slug].add(key)
            for ing in rec["ingredients"]:
                item = resolve(ing)
                row = needs.setdefault(
                    item,
                    {"item": ing["item"], "slug": item, "perDay": 0.0, "lines": [], "staffedDay": 0.0},
                )
                row["perDay"] += n * ing["per"] * 24
                row["staffedDay"] += n * ing["per"] * 24 * share
                if rec["item"] not in row["lines"]:
                    row["lines"].append(rec["item"])
        stopped_lines = {line["item"]: line["missing"] for line in lines if line["missing"]}
        for slug, row in needs.items():
            target, source = flow["targets"].get((key, slug), (0, None))
            # An input that only sits because every line using it is stopped
            # for want of something else is waiting, not being ignored.
            row["waitingOn"] = (
                sorted({m for line in row["lines"] for m in stopped_lines[line] if m != row["item"]})
                if all(line in stopped_lines for line in row["lines"])
                else []
            )
            row["target"] = target
            row["source"] = source
            row["from"] = index.get(source) if source else None
            row["known"] = flow["received"](key, slug) is not None
            row["arrives"] = round(arrives(key, slug))
            row["stock"] = held(key, slug)
            row["depotStock"] = held(source, slug) if source else 0
            # Planned, stocked at the depot, and yet nothing came all week.
            row["stalled"] = bool(row["known"] and not row["arrives"] and row["depotStock"] > 0)
            if source:
                depot_need[(source, slug)] += row["perDay"] * 7
        # What the page needs to work out a line the player names by hand:
        # every top-up into this factory, and what arrived over the week.
        into = {
            slug: [amount, index.get(source)]
            for (dest, slug), (amount, source) in flow["targets"].items()
            if dest == key
        }
        watched = set(into) | set(flow["held"].get(key, {}))
        sites.append(
            {
                "s": index[key],
                "machines": sum(counter.values()),
                "lines": lines,
                "unnamed": unnamed,
                "needs": list(needs.values()),
                "targets": into,
                "known": flow["received"](key, "") is not None,
                "arrivals": {slug: round(arrives(key, slug)) for slug in watched},
            }
        )

    # --- the verdict on each input, once the depot totals are known
    for site in sites:
        for row in site["needs"]:
            per_day, source = row["perDay"], row.pop("source")
            supply = flow["imports"].get((source, row["slug"])) if source else None
            weekly_need = depot_need.get((source, row["slug"]), 0.0)
            staffed = row.pop("staffedDay", per_day)
            row["staffedShare"] = round(staffed / per_day, 2) if per_day else 1.0
            row["perDay"] = round(per_day)
            row["perWeek"] = round(per_day * 7)
            row["depotNeed"] = round(weekly_need)
            row["importWeekly"] = supply["weekly"] if supply else None
            row["importFit"] = _fit(weekly_need, supply["weekly"]) if supply else None
            row["madeAt"] = sorted(index[k] for k in made_by.get(row["slug"], ()) if k in index)
            row["raiseTarget"] = row["raiseImport"] = None
            if not row["target"]:
                status, level = "unplanned", "critical"
            elif row["target"] < per_day * (1 - FEED_SLACK):
                status, level = "target", "critical"
                row["raiseTarget"] = _ceil_hundred(per_day)
            elif row["known"] and row["arrives"] < per_day * LINE_STARVED:
                if row["waitingOn"]:
                    status, level = "waiting", "info"
                elif row["arrives"] >= staffed * 0.85:
                    # The line takes what its roster lets it take.
                    status, level = "staffing", "warn"
                elif row["depotStock"] < per_day:
                    status, level = "dry", "critical"
                else:
                    status, level = "idle", "warn"
            elif supply and row["importFit"] == "short":
                status, level = "import", "critical"
                row["raiseImport"] = _ceil_hundred(weekly_need)
            elif supply and row["importFit"] == "tight":
                status, level = "import", "warn"
            elif not supply and row["madeAt"]:
                status, level = "made", "ok"
            elif not supply and row["depotStock"] < weekly_need:
                status, level = "noimport", "warn"
            else:
                status, level = "ok", "ok"
            row["status"], row["level"] = status, level
        site["needs"].sort(
            key=lambda r: ({"critical": 0, "warn": 1, "info": 2, "ok": 3}[r["level"]], -r["perDay"])
        )
    sites.sort(key=lambda s: -s["machines"])
    depots, depot_other = _depot_flow(flow, index, machines, depot_need)
    return {
        "sites": sites,
        "machines": sum(s["machines"] for s in sites),
        "unnamed": sum(u["machines"] for s in sites for u in s["unnamed"]),
        "character": character,
        "aliases": {
            ing["slug"]: resolve(ing)
            for rec in recipes.values()
            for ing in rec["ingredients"]
            if resolve(ing) != ing["slug"]
        },
        "depots": depots,
        "depotOther": depot_other,
    }


def _hourly(save: Save, buildings: list, businesses: list, stations: dict, crew: dict) -> list:
    """What each shop-front took per hour, against the capacity that was on.

    Three numbers meet in one grid. The customers are measured, an hour at a
    time, over the fortnight the save keeps. The registers are whatever service
    staff were rostered on that hour, at the capacity of the exact counters they
    were posted to. The door cap is the building's own limit. The smallest of
    them is the one that decides, and the finding is which.
    """
    by_key = {b["key"]: b for b in businesses}
    out = []
    for b in buildings:
        key = site_key((b["StreetName"], b["StreetNumber"]))
        business = by_key.get(key)
        if not business or business["status"] != "retail":
            continue

        seen = [[[] for _ in range(24)] for _ in range(7)]
        for entry in save.items(b["orderHistory"]):
            wd = entry["dayNumber"] % 7
            for report in save.items(entry.get("hourReports")):
                hour = report.get("hour")
                if hour is not None and 0 <= hour < 24:
                    seen[wd][hour].append(report.get("customers", 0))
        weeks = [max((len(h) for h in row), default=0) for row in seen]
        if not any(weeks):
            continue
        customers = [
            [round(sum(h) / len(h), 1) if h else None for h in row] for row in seen
        ]

        here = {}
        for holder in save.items(b["itemInstances"]):
            item = save.deref(holder.get("$v")) if isinstance(holder, dict) else None
            if item and item.get("itemName") in stations:
                here[item.get("id")] = stations[item["itemName"]]
        counters = sum(here.values())

        # The roster, read the same way the game reads it: scheduleDay.day is the
        # game day modulo 7, with 7 standing in for Sunday's 0.
        staffed = [[0] * 24 for _ in range(7)]
        on_shift = [[0] * 24 for _ in range(7)]
        for scheduled in save.items(b.get("scheduleDays")):
            wd = scheduled["day"] % 7
            manned = [set() for _ in range(24)]
            for shift in save.items(scheduled.get("workShifts")):
                if shift.get("type") != STATION_SHIFT:
                    continue
                if crew.get(shift.get("employeeId")) != SERVICE_SKILL:
                    continue
                post = shift.get("itemInstanceId")
                if post not in here:
                    continue
                for hour in range(
                    max(0, shift["startingHour"]), min(24, shift["endingHour"])
                ):
                    manned[hour].add(post)
                    on_shift[wd][hour] += 1
            for hour in range(24):
                staffed[wd][hour] = sum(here[post] for post in manned[hour])

        door = b.get("customerCapacity", 0) or 0
        effective = [
            [min(staffed[wd][h], door) if door else staffed[wd][h] for h in range(24)]
            for wd in range(7)
        ]
        entry = {
            "key": key,
            "name": business["name"],
            "customers": customers,
            "weeks": weeks,
            "thin": [w < HOUR_WEEKS_THIN for w in weeks],
            "staffed": staffed,
            "onShift": on_shift,
            "effective": effective,
            "door": door,
            # The same number under the name the cap findings think in.
            "cap": door,
            "counters": counters,
            "stationCount": len(here),
            "basket": business["basket"],
            "peak": max(
                (c for row in customers for c in row if c is not None), default=0
            ),
        }
        entry["capHours"] = len(_capped_cells(entry))
        out.append(entry)
    return out


def _capped_cells(grid: dict) -> set:
    """The weekday-hour cells measured at or above the cap that was on.

    One test shared by the grid's capHours and the cap findings in
    _hour_findings(): an hour is capped when the customers measured come
    within AT_CAP of what was actually available that hour, on a weekday
    with enough weeks behind it to measure.
    """
    return {
        (wd, hour)
        for wd in range(7)
        if not grid["thin"][wd]
        for hour in range(24)
        if grid["customers"][wd][hour] is not None
        and grid["effective"][wd][hour]
        and grid["customers"][wd][hour] >= grid["effective"][wd][hour] * AT_CAP
    }


def _hour_findings(grids: list, businesses: list, wages: dict) -> list:
    """The two things an hourly grid can tell you that a daily total cannot."""
    by_key = {b["key"]: b for b in businesses}
    out = []
    for grid in grids:
        business = by_key[grid["key"]]
        basket = grid["basket"] or 0
        door, counters = grid["door"], grid["counters"]

        capped = collections.defaultdict(set)
        for wd, hour in _capped_cells(grid):
            capped[wd].add(hour)
        hours = sum(len(h) for h in capped.values())
        if hours:
            staffed_at = [
                grid["staffed"][wd][h] for wd, hs in capped.items() for h in hs
            ]
            typical = min(staffed_at) if staffed_at else 0
            if door and door <= typical:
                limit, fix = "the building", "a bigger site or a second shop nearby"
            elif typical < counters:
                limit, fix = "staffing", "more service staff on those hours"
            else:
                limit, fix = "registers", "another counter"
            at_cap = min(door or 10**9, typical or 10**9)
            out.append(
                {
                    "kind": "cap",
                    "key": grid["key"],
                    "site": grid["name"],
                    "hours": hours,
                    "when": _hour_phrase(capped),
                    "limit": limit,
                    "fix": fix,
                    "cap": at_cap,
                    "basket": basket,
                    # What is measurably flowing through the ceiling. What is
                    # being turned away above it is not in the save at all.
                    "throughput": money(hours * at_cap * basket / 7),
                }
            )

        best = None
        service_wage = wages.get(grid["key"], 0)
        for wd in range(7):
            if grid["thin"][wd]:
                continue
            run = []
            for hour in range(25):
                seen = grid["customers"][wd][hour] if hour < 24 else None
                on = grid["onShift"][wd][hour] if hour < 24 else 0
                cap = grid["staffed"][wd][hour] if hour < 24 else 0
                slack = (
                    seen is not None
                    and on >= IDLE_STAFF
                    and cap > max(seen, 0.5) * IDLE_RATIO
                )
                if slack:
                    per_post = cap / on if on else 0
                    needed = max(1, math.ceil(seen / per_post)) if per_post else 1
                    run.append((hour, on - needed, seen, on))
                    continue
                if len(run) >= IDLE_RUN:
                    spare = sum(r[1] for r in run)
                    if not best or spare > best["spare"]:
                        best = {
                            "wd": wd,
                            "from": run[0][0],
                            "to": run[-1][0] + 1,
                            "spare": spare,
                            "staff": max(r[3] for r in run),
                            "seen": round(sum(r[2] for r in run) / len(run)),
                        }
                run = []
        if best and service_wage:
            out.append(
                {
                    "kind": "idle",
                    "key": grid["key"],
                    "site": grid["name"],
                    "day": WEEKDAYS[best["wd"]],
                    "from": best["from"],
                    "to": best["to"],
                    "staff": best["staff"],
                    "seen": best["seen"],
                    "spare": best["spare"],
                    "worth": money(best["spare"] * service_wage / 7),
                }
            )
    return out


GLOBAL_HOOD = "ba:neighborhood_global"
HYPE_EVENT = 2  # "Citizens in {hood} are showing strong demand for {item}"
SUPPLIER_EVENTS = {
    3: "Product shortage",
    4: "Supplier strain",
    5: "Backorder",
    6: "Supplier strain",
}
HISTORY_DAYS = 60  # how much demand history to keep on disk
TREND_WINDOW = 7  # compare against this many days back when the history reaches it


def _market(
    save: Save, names: Names, businesses: list, day: int, history, character: str
) -> dict:
    """Demand per product per neighbourhood, plus what is moving and why.

    The save stores only today's demand, so a rolling snapshot is kept on disk
    next to the dashboard. Until that fills up, the game's own hype events are
    the trend signal — they are authoritative about what just rose.
    """
    hood_of = {v: k for k, v in NEIGHBOURHOODS.items()}

    # What we sell, and where. What we make, anywhere.
    sells = collections.defaultdict(set)
    for b in businesses:
        if b["status"] != "retail" or not b["neighbourhood"]:
            continue
        for line in b["lines"]:
            if line["price"]:
                sells[line["slug"]].add(b["neighbourhood"])
    makes = set()
    for plan in save.items(save.root["logisticsManagerPlans"]):
        if not plan.get("isFactory"):
            continue
        for dest in save.items(plan["destinations"]):
            for target in save.items(dest["stockTargets"]):
                makes.add(target["itemName"])

    # Active events.
    hype = {}
    starts = {}
    shortages = []
    for event in save.items(save.root["marketEvents"]):
        span = event.get("durationInDays") or 0
        start = event.get("startDay") or 0
        left = start + span - day
        if event.get("stopped") or left <= 0 or start > day:
            continue
        item = event.get("itemName")
        if event["type"] == HYPE_EVENT and item:
            hood = names.label(event.get("neighbourhood"), "")
            hype[(item, hood)] = left
            starts[(item, hood)] = start
        elif event["type"] in SUPPLIER_EVENTS and item:
            shortages.append(
                {
                    "item": names.label(item),
                    "kind": SUPPLIER_EVENTS[event["type"]],
                    "where": names.addr(save.address(event.get("address")))
                    if event.get("address")
                    else names.label(event.get("neighbourhood"), "-"),
                    "daysLeft": left,
                    "mine": item in sells or item in makes,
                }
            )
    shortages.sort(key=lambda s: (not s["mine"], s["daysLeft"]))

    # Today's demand, and the trend against whatever history exists.
    hoods, today_snapshot, rows = [], {}, []
    for entry in save.items(save.root["productMarketEntries"]):
        item = entry["itemName"]
        cells = []
        for value in save.items(entry["demandValues"]):
            if value["neighborhood"] == GLOBAL_HOOD:
                continue
            hood = names.label(value["neighborhood"])
            if hood not in hoods:
                hoods.append(hood)
            today_snapshot[f"{item}|{hood}"] = value["demand"]
            cells.append(
                {
                    "hood": hood,
                    "demand": value["demand"],
                    "providers": value["providers"],
                    "monopoly": bool(value["hasPlayerMonopoly"]),
                    "sell": hood in sells.get(item, ()),
                    "hype": hype.get((item, hood)),
                }
            )
        if cells:
            rows.append(
                {
                    "item": names.label(item),
                    "slug": item,
                    "sell": bool(sells.get(item)),
                    "make": item in makes,
                    "cells": cells,
                }
            )

    by_item_hood = {
        (row["slug"], cell["hood"]): cell for row in rows for cell in row["cells"]
    }
    catalogue = _type_catalogue(save, names, {row["slug"] for row in rows})
    mine_types = {
        b["typeSlug"] for b in businesses if b["status"] in ("retail", "support")
    }

    seen = history.demand(character, day, today_snapshot)
    span = seen["span"]
    for row in rows:
        for cell in row["cells"]:
            was = seen["was"].get(f"{row['slug']}|{cell['hood']}")
            cell["delta"] = (cell["demand"] - was) if was is not None else None

    hoods.sort()
    for row in rows:
        by_hood = {c["hood"]: c for c in row["cells"]}
        row["cells"] = [by_hood.get(h) for h in hoods]
        live = [c for c in row["cells"] if c]
        row["peak"] = max((c["demand"] for c in live), default=0)
        row["rising"] = max((c["delta"] or 0 for c in live), default=0)
        row["hyped"] = any(c["hype"] for c in live)
        open_cells = [c for c in live if not c["sell"]]
        best = max(
            open_cells, key=lambda c: (c["demand"], -c["providers"]), default=None
        )
        row["gap"] = (
            {
                "hood": best["hood"],
                "demand": best["demand"],
                "providers": best["providers"],
            }
            if best
            else None
        )
    # What we touch first, then the loudest demand.
    rows.sort(key=lambda r: (not (r["sell"] or r["make"]), -r["peak"]))

    # Somewhere with real demand and few sellers that we are not in yet.
    gaps = []
    for row in rows:
        for cell in row["cells"]:
            if not cell or cell["sell"] or cell["demand"] < 50:
                continue
            gaps.append(
                {
                    "item": row["item"],
                    "hood": cell["hood"],
                    "demand": cell["demand"],
                    "providers": cell["providers"],
                    "make": row["make"],
                    "hype": cell["hype"],
                }
            )
    gaps.sort(key=lambda g: (g["providers"], -g["demand"]))

    singles = []
    if span:
        for row in rows:
            for cell in row["cells"]:
                if cell and cell["delta"] and abs(cell["delta"]) >= 5:
                    singles.append(
                        {
                            "item": row["item"],
                            "slug": row["slug"],
                            "hood": cell["hood"],
                            "demand": cell["demand"],
                            "delta": cell["delta"],
                            "sell": cell["sell"],
                        }
                    )
    # One hype wave, or one shop opening, moves a whole family of products in one
    # neighbourhood at once. That is one event, so it gets one line.
    opened_in = collections.defaultdict(list)
    if span:
        for b in businesses:
            if b["status"] == "retail" and day - b["opened"] <= span:
                opened_in[(b["neighbourhood"], b["type"])].append(b)
    movers = _group_movers(
        singles, _family_of(catalogue, names, mine_types), opened_in
    )

    stores = {
        (b["typeSlug"], b["neighbourhood"])
        for b in businesses
        if b["status"] == "retail" and b["neighbourhood"]
    }
    types = _type_demand(catalogue, by_item_hood, hoods, names, mine_types, stores)
    return {
        "hoods": hoods,
        "rows": rows,
        # The planner needs the same catalogue, so it travels once and extract
        # moves it across rather than deriving it twice.
        "catalogue": {kind: sorted(items) for kind, items in catalogue.items()},
        # A type with one or two products says nothing about opening a shop: the
        # cell reads "1/1" whatever the city wants.
        "types": [t for t in types if t["products"] >= TYPE_MIN_PRODUCTS],
        "typesHidden": sum(1 for t in types if t["products"] < TYPE_MIN_PRODUCTS),
        "openings": _openings(types, mine_types),
        "movers": movers,
        "hype": _group_hype(hype, starts, names, sells, makes),
        "shortages": _group_shortages(shortages),
        "gaps": gaps[:20],
        "trendDays": span,
        "trackedDays": seen["days"],
    }


TYPE_MIN_PRODUCTS = 3  # below this the by-type grid is describing a single product


def _family_of(catalogue: dict, names: Names, mine: set) -> dict:
    """Which kind of shop a product belongs to, learned from the city's shops.

    A smartwatch is stocked by jewellers as well as electronics stores. Where we
    run one of the shops that sells it, that is the family it belongs to here —
    otherwise a single wave across one shop's range would still read as several
    unrelated moves. Failing that, the narrowest catalogue wins.
    """
    best = {}
    ordered = sorted(catalogue.items(), key=lambda kv: (kv[0] not in mine, len(kv[1])))
    for kind, items in ordered:
        for item in items:
            best.setdefault(item, names.label(kind))
    return best


def _group_movers(singles: list, family: dict, opened_in: dict) -> list:
    """Group demand moves by neighbourhood and product family."""
    buckets = collections.OrderedDict()
    for row in sorted(singles, key=lambda m: (not m["sell"], -abs(m["delta"]))):
        key = (row["hood"], row["delta"] > 0, family.get(row["slug"], row["item"]))
        bucket = buckets.setdefault(
            key,
            {
                "hood": row["hood"],
                "family": family.get(row["slug"], row["item"]),
                "up": row["delta"] > 0,
                "items": [],
                "deltas": [],
                "sell": False,
            },
        )
        bucket["items"].append(row["item"])
        bucket["deltas"].append(row["delta"])
        bucket["demand"] = row["demand"]
        bucket["sell"] = bucket["sell"] or row["sell"]

    out = []
    for bucket in buckets.values():
        deltas = bucket["deltas"]
        # A drop across a whole family where we just opened a shop of that very
        # kind is our own shop taking the unmet demand, not the market cooling.
        # A phone shop opening does not explain apples getting cheaper, so the
        # kind has to match before the note is worth making.
        opened = opened_in.get((bucket["hood"], bucket["family"]), [])
        blame = opened[0] if opened and not bucket["up"] else None
        out.append(
            {
                "hood": bucket["hood"],
                "family": bucket["family"],
                "up": bucket["up"],
                "count": len(deltas),
                "items": bucket["items"][:3],
                "delta": round(sum(deltas) / len(deltas)),
                "worst": max(deltas) if bucket["up"] else min(deltas),
                "demand": bucket["demand"],
                "sell": bucket["sell"],
                "openedHere": blame["name"] if blame else None,
                "openedDay": blame["opened"] if blame else None,
            }
        )
    out.sort(key=lambda m: (not m["sell"], -abs(m["delta"]) * m["count"]))
    return out[:6]


def _openings(types: list, mine: set) -> list:
    """The three business types worth opening next, and why each one ranks.

    Most of the range wanted first, then the emptiest market, then the loudest
    demand — the order the decision is actually made in.
    """
    ranked = []
    for row in types:
        if row["products"] < TYPE_MIN_PRODUCTS:
            continue
        for cell in row["cells"]:
            if not cell or cell["sell"]:
                continue
            ranked.append(
                {
                    "type": row["type"],
                    "hood": cell["hood"],
                    "strong": cell["strong"],
                    "count": cell["count"],
                    "demand": cell["demand"],
                    "providers": cell["providers"],
                    "mine": row["slug"] in mine,
                }
            )
    ranked.sort(
        key=lambda r: (
            -(r["strong"] / r["count"]),
            r["providers"],
            -r["demand"],
        )
    )
    return ranked[:3]


def _type_catalogue(save: Save, names: Names, tradeable: set) -> dict:
    """Which products each kind of business sells.

    The game's own F1 help page for a type is the answer wherever it has one
    — see _type_catalogue_from_help() — so a store restocked with something
    unrelated to its licence can never skew it. For a type that page does not
    cover (a license this city has not built, or the game files are not on
    this machine), the range is learned from the city itself instead: every
    rival shop of that type contributes its price list, and an item only
    counts once at least two of them carry it — one repurposed shop cannot
    flood a type's whole range with its own one-off restock. A type with only
    one business in the city keeps whatever that one business has, for lack
    of anything to check it against.
    """
    known = _type_catalogue_from_help(names)

    counts = collections.defaultdict(collections.Counter)
    carriers = collections.Counter()
    for b in save.items(save.root["BuildingRegistrations"]):
        kind = b.get("businessTypeName")
        if not kind or kind == "ba:businesstype_empty" or kind in known:
            continue
        items = set()
        for price in save.items(b.get("retailPrices")):
            if price and price["itemName"] in tradeable and price["itemName"] not in AMENITY_ITEMS:
                items.add(price["itemName"])
        for item in save.items(b.get("cachedAvailableProducts")):
            if isinstance(item, str) and item in tradeable and item not in AMENITY_ITEMS:
                items.add(item)
        if not items:
            continue
        carriers[kind] += 1
        for item in items:
            counts[kind][item] += 1

    catalogue = {}
    for kind, item_counts in counts.items():
        threshold = min(2, carriers[kind])
        kept = {item for item, n in item_counts.items() if n >= threshold}
        if kept:
            catalogue[kind] = kept

    for kind, items in known.items():
        kept = items & tradeable
        if kept:
            catalogue[kind] = kept
    return catalogue


def _type_demand(
    catalogue: dict, demand: dict, hoods: list, names: Names, mine: set, stores: set
) -> list:
    """Demand for a business type is the whole basket it sells, not one product.

    Opening a shop is a commitment to its entire range, so the useful reading is
    how much of that range a neighbourhood wants at once.
    """
    rows = []
    for kind, items in catalogue.items():
        cells = []
        for hood in hoods:
            scores = [
                demand[(item, hood)]
                for item in items
                if (item, hood) in demand
            ]
            if not scores:
                cells.append(None)
                continue
            strong = [x for x in scores if x["demand"] >= 60]
            cells.append(
                {
                    "hood": hood,
                    "demand": round(sum(x["demand"] for x in scores) / len(scores)),
                    "strong": len(strong),
                    "count": len(scores),
                    "providers": round(
                        sum(x["providers"] for x in scores) / len(scores)
                    ),
                    "sell": sum(1 for x in scores if x["sell"]),
                    # A shop of this very type in this neighbourhood, from the
                    # building table or the [XX] prefix in its name.
                    "here": (kind, hood) in stores,
                }
            )
        live = [c for c in cells if c]
        if not live:
            continue
        rows.append(
            {
                "type": names.label(kind),
                "slug": kind,
                "products": len(items),
                "mine": kind in mine,
                "cells": cells,
                "peak": max(c["demand"] for c in live),
                "bestStrong": max(c["strong"] for c in live),
            }
        )
    return sorted(rows, key=lambda r: (-r["bestStrong"], -r["peak"]))


def _group_hype(hype: dict, starts: dict, names: Names, sells: dict, makes: set) -> list:
    """A hype wave usually hits a whole product family at once; say it once."""
    waves = collections.defaultdict(list)
    for (item, hood), left in hype.items():
        waves[(hood, left)].append(item)
    out = []
    for (hood, left), items in waves.items():
        began = min(starts.get((i, hood), 0) for i in items)
        out.append(
            {
                "hood": hood,
                "daysLeft": left,
                "startDay": began,
                "items": [names.label(i) for i in sorted(items)],
                "slugs": sorted(items),
                "count": len(items),
                "mine": any(i in sells or i in makes for i in items),
                "sellHere": any(hood in sells.get(i, ()) for i in items),
            }
        )
    return sorted(out, key=lambda h: (not h["mine"], -h["daysLeft"]))


def _group_shortages(shortages: list) -> list:
    """One product short at three suppliers is one problem, not three."""
    grouped = collections.OrderedDict()
    for row in shortages:
        key = (row["item"], row["kind"])
        if key in grouped:
            grouped[key]["count"] += 1
            grouped[key]["daysLeft"] = max(grouped[key]["daysLeft"], row["daysLeft"])
        else:
            grouped[key] = dict(row, count=1)
    return sorted(grouped.values(), key=lambda s: (not s["mine"], -s["daysLeft"]))


class History:
    """The on-disk record the save itself does not keep.

    The save stores only today: today's demand, today's cash, today's net worth.
    Anything that compares one day with another has to be remembered here. Every
    character is a separately generated city and a separate company, so the
    histories are kept apart; mixing them would invent movement that never
    happened.

    Two records live side by side under each character: ``days`` holds a demand
    snapshot per game day, ``ledger`` holds cash, net worth and that day's profit.
    Both are keyed by the game day, so rebuilding twice on the same day updates
    the entry rather than adding a second one.
    """

    def __init__(self, path: str | None):
        self.path = path
        self.book = self._load()
        self._touched = set()  # (character, rid) names this instance changed

    def _load(self) -> dict:
        if self.path and os.path.exists(self.path):
            try:
                with open(self.path, encoding="utf-8") as fh:
                    return json.load(fh).get("characters", {})
            except (OSError, ValueError):
                pass
        return {}

    def _for(self, character: str) -> dict:
        return self.book.setdefault(character, {})

    def demand(self, character: str, day: int, snapshot: dict) -> dict:
        store = self._for(character).setdefault("days", {})
        store[str(day)] = snapshot
        for old in sorted(store, key=int)[:-HISTORY_DAYS]:
            del store[old]

        earlier = [d for d in sorted(store, key=int) if int(d) < day]
        if not earlier:
            return {"was": {}, "span": 0, "days": len(store)}
        target = day - TREND_WINDOW
        reference = min(earlier, key=lambda d: abs(int(d) - target))
        return {
            "was": store[reference],
            "span": day - int(reference),
            "days": len(store),
        }

    def ledger_entries(self, character: str) -> list:
        """The balance sheets already on record, oldest first, without writing."""
        store = self._for(character).get("ledger", {})
        return [dict(store[d], day=int(d)) for d in sorted(store, key=int)]

    def ledger(self, character: str, day: int, entry: dict) -> list:
        """Record today's balance sheet and hand back the whole run of them.

        Merged rather than replaced: a later save on the same day may carry
        fewer fields than an earlier one, and dropping a figure the game has
        since stopped reporting would lose it for good.
        """
        store = self._for(character).setdefault("ledger", {})
        store[str(day)] = {**store.get(str(day), {}), **entry}
        for old in sorted(store, key=int)[:-HISTORY_DAYS]:
            del store[old]
        return [dict(store[d], day=int(d)) for d in sorted(store, key=int)]

    def recipes(self, character: str, learned: dict) -> dict:
        """Recipe ids the flow has identified, kept so an idle line stays named."""
        store = self._for(character).setdefault("recipes", {})
        store.update(learned)
        return dict(store)

    def named(self, character: str, updates: dict | None = None) -> dict:
        """Lines the player named by hand, by recipe id; a None clears one."""
        store = self._for(character).setdefault("lineNames", {})
        for rid, slug in (updates or {}).items():
            self._touched.add((character, rid))
            if slug:
                store[rid] = slug
            else:
                store.pop(rid, None)
        return dict(store)

    def write(self) -> None:
        if not self.path:
            return
        # A build takes seconds and loads this file at its start; a name given
        # in between must not be undone by the build writing what it loaded.
        # Names and learnt recipes are merged with the file as it is now: only
        # the names this instance itself changed overrule it.
        disk = self._load()
        for character, ours in self.book.items():
            theirs = disk.get(character, {})
            names = dict(theirs.get("lineNames", {}))
            mine = ours.get("lineNames", {})
            for rid in list(names) + list(mine):
                if (character, rid) in self._touched:
                    if rid in mine:
                        names[rid] = mine[rid]
                    else:
                        names.pop(rid, None)
            ours["lineNames"] = names
            learnt = dict(theirs.get("recipes", {}))
            learnt.update(ours.get("recipes", {}))
            ours["recipes"] = learnt
        try:
            with open(self.path, "w", encoding="utf-8") as fh:
                json.dump({"characters": self.book}, fh, separators=(",", ":"))
        except OSError:
            pass


def _cash_flow(ledger: list, daily: list, day: int) -> dict | None:
    """Where the profit went: what the books earned against what cash did.

    Profit is a claim about trading; cash is what is left after paying for the
    next shop and the next week's stock. The gap between them is the number
    worth seeing, and it needs at least two readings to exist at all.
    """
    if len(ledger) < 2:
        return None
    latest = ledger[-1]
    earlier = [e for e in ledger if e["day"] < day]
    if not earlier:
        return None
    target = day - TREND_WINDOW
    ref = min(earlier, key=lambda e: abs(e["day"] - target))
    booked = sum(d["profit"] for d in daily if ref["day"] <= d["day"] < day)
    change = latest["cash"] - ref["cash"]
    flow = {
        "days": day - ref["day"],
        "fromDay": ref["day"],
        "cashFrom": ref["cash"],
        "cashTo": latest["cash"],
        "cashChange": money(change),
        "profit": money(booked),
        "reinvested": money(booked - change),
        "netWorthFrom": None,
        "netWorthTo": None,
        "netWorthChange": None,
    }
    # Build 3672 stopped reporting net worth, so the ledger carries it only for
    # the days the game still did. Cash and profit stand on their own.
    if ref.get("netWorth") is not None and latest.get("netWorth") is not None:
        flow["netWorthFrom"] = ref["netWorth"]
        flow["netWorthTo"] = latest["netWorth"]
        flow["netWorthChange"] = money(latest["netWorth"] - ref["netWorth"])
    return flow


def _chains(save: Save, businesses: list, trends: list) -> list:
    """Which sites work as one business, read off the logistics plans.

    A shop, the depot that fills it and the factory behind that depot are one
    trading operation; judged apart, a 98% shop margin sits next to a factory
    running -80% and neither figure means anything.

    Connected components would put everything in one bucket — the food factory
    sends soda to the electronics depot, which links the two chains through a
    side line. So a chain is named by the kind of shop at the end of it, and each
    warehouse and factory joins the kind of shop it mostly feeds: follow its
    plans downstream, count where the goods actually end up, and let the majority
    decide. Nothing here is hand-written; it all comes out of the plans.
    """
    by_key = {b["key"]: b for b in businesses}
    edges = collections.defaultdict(set)
    fed_by = {}
    for plan in save.items(save.root["logisticsManagerPlans"]):
        source = site_key(save.address(plan["targetAddress"]))
        if source not in by_key:
            continue
        for dest in save.items(plan["destinations"]):
            target = site_key(save.address(dest["deliveryTargetAddress"]))
            if target not in by_key or target == source:
                continue
            fed_by.setdefault(target, source)
            edges[source].add((target, len(save.items(dest["stockTargets"]))))

    served = {}

    def downstream(key: str, seen: frozenset) -> collections.Counter:
        """Which kinds of shop this site's goods end up in, and how heavily."""
        if key in served:
            return served[key]
        counts = collections.Counter()
        for target, lines in edges.get(key, ()):
            if target in seen:
                continue
            site = by_key[target]
            if site["status"] == "retail":
                counts[site["typeSlug"]] += lines
            else:
                counts += downstream(target, seen | {key})
        if not seen:
            served[key] = counts
        return counts

    groups = collections.OrderedDict()
    for b in businesses:
        if b["status"] == "vacant":
            key = "\0vacant"
        elif b["status"] == "retail":
            key = b["typeSlug"]
        else:
            reach = downstream(b["key"], frozenset())
            key = reach.most_common(1)[0][0] if reach else "\0support"
        groups.setdefault(key, []).append(b)

    by_trend = {t["key"]: t for t in trends}
    chains = []
    for key, members in groups.items():
        shops = [b for b in members if b["status"] == "retail"]
        if key == "\0vacant":
            name = "Vacant leases"
        elif key == "\0support":
            name = "Head office and support"
        else:
            name = _plural(shops[0]["type"]) if shops else members[0]["type"]
        chains.append(_chain(name, members, fed_by, by_key, by_trend))
    chains.sort(key=lambda c: -c["profit"])
    return chains


def _plural(label: str) -> str:
    return label if label.endswith("s") else label + "s"


COST_KEYS = ("cogs", "wages", "rent", "marketing", "theft", "licensing")


def _chain(name: str, members: list, fed_by: dict, by_key: dict, by_trend: dict) -> dict:
    index = {b["key"]: b for b in members}
    revenue = sum(b["revenue"] for b in members)
    cost = sum(sum(b[k] for k in COST_KEYS) for b in members)
    profit = sum(b["profit"] for b in members)
    # Revenue booked away from the shop counter is a sale to somebody outside the
    # company — a factory shipping to a pier. It is real money, but it is not
    # what the shops took, so it is named rather than folded in.
    external = sum(b["revenue"] for b in members if b["status"] != "retail")
    outside = {
        fed_by[b["key"]]
        for b in members
        if b["key"] in fed_by and fed_by[b["key"]] not in index
    }
    # A chain's week only compares with the week before it if every member that
    # traded has both weeks behind it. One shop opened mid-window and the whole
    # comparison is measuring the opening, not the trading.
    earners = [b for b in members if b["revenue"] > 0]
    rows = [by_trend[b["key"]] for b in earners if b["key"] in by_trend]
    ready = bool(rows) and len(rows) == len(earners) and all(r["ready"] for r in rows)
    last7 = money(sum(r["last7"] for r in rows)) if ready else None
    prev7 = money(sum(r["prev7"] for r in rows)) if ready else None
    return {
        "name": name,
        "sites": [b["key"] for b in members],
        "count": len(members),
        "revenue": money(revenue),
        "retailRevenue": money(revenue - external),
        "external": money(external),
        "cost": money(cost),
        "profit": money(profit),
        "margin": round(profit / revenue * 100, 1) if revenue else None,
        "last7": last7,
        "prev7": prev7,
        "change": round((last7 - prev7) / prev7, 4) if ready and prev7 else None,
        "staff": sum(b["staff"] for b in members),
        "suppliedBy": sorted(
            by_key[k]["name"] for k in outside if k in by_key
        ),
        **{k: money(sum(b[k] for b in members)) for k in COST_KEYS},
    }


def _site_trends(businesses: list, day: int) -> list:
    """Each site's last seven days of revenue against the seven before them."""
    out = []
    for i, b in enumerate(businesses):
        if b["status"] == "vacant":
            continue
        series = {s["day"]: s["revenue"] for s in b["series"]}
        last = [series[d] for d in range(day - 7, day) if d in series]
        prev = [series[d] for d in range(day - 14, day - 7) if d in series]
        # A shop open under two weeks has no previous week to be compared with,
        # and its first days are a ramp, not a trend.
        ready = (
            day - b["opened"] >= TREND_MIN_DAYS and len(last) == 7 and len(prev) == 7
        )
        row = {
            "s": i,
            "key": b["key"],
            "ready": ready,
            "last7": money(sum(last)),
            "prev7": money(sum(prev)),
        }
        row["change"] = (
            round((row["last7"] - row["prev7"]) / row["prev7"], 4)
            if ready and row["prev7"]
            else None
        )
        out.append(row)
    return out


def _hype_exposure(businesses: list, market: dict) -> list:
    """What each running hype wave is worth, and what the day after looks like.

    The game says a wave is running and when it ends; it does not say what it is
    worth. The only honest answer is the same kind of shop where no wave is
    running — and where there is no such shop, the answer is that we cannot say.
    """
    retail = [b for b in businesses if b["status"] == "retail" and b["revenue"] > 0]
    hyped_hoods = {w["hood"] for w in market.get("hype", [])}

    out = []
    for wave in market.get("hype", []):
        slugs = set(wave.get("slugs", []))
        sites = []
        for b in retail:
            if b["neighbourhood"] != wave["hood"]:
                continue
            hyped = sum(l["revenue"] for l in b["lines"] if l["slug"] in slugs)
            whole = sum(l["revenue"] for l in b["lines"]) or 1
            if hyped <= 0:
                continue
            sites.append(
                {
                    "key": b["key"],
                    "name": b["name"],
                    "type": b["typeSlug"],
                    "revenue": b["revenue"],
                    "profit": b["profit"],
                    "share": round(hyped / whole * 100),
                }
            )
        if not sites:
            continue
        top = max(sites, key=lambda s: s["revenue"])
        best = next(b for b in retail if b["key"] == top["key"])

        # First choice is the shop's own trading before the wave landed: same
        # shop, same street, nothing else changed. Failing that, the same kind of
        # shop somewhere no wave is running — never a different kind of shop, and
        # never nothing dressed up as a number.
        before = [
            s["revenue"]
            for s in best["series"]
            if s["day"] < wave["startDay"] and s["revenue"] > 0
        ][-7:]
        if len(before) >= HYPE_BASELINE_DAYS:
            baseline = {
                "name": best["name"],
                "hood": best["neighbourhood"],
                "revenue": money(sum(before) / len(before)),
                "basis": f"its own {len(before)} days before day {wave['startDay']}",
            }
        else:
            pool = [
                b
                for b in retail
                if b["typeSlug"] in {s["type"] for s in sites}
                and b["neighbourhood"] not in hyped_hoods
            ]
            other = max(pool, key=lambda b: b["revenue"], default=None)
            baseline = (
                {
                    "name": other["name"],
                    "hood": other["neighbourhood"],
                    "revenue": other["revenue"],
                    "basis": f"the no-hype {other['name']}",
                }
                if other
                else None
            )
        out.append(
            {
                "hood": wave["hood"],
                "daysLeft": wave["daysLeft"],
                "startDay": wave["startDay"],
                "count": wave["count"],
                "items": wave["items"],
                "sites": sites,
                "top": top["key"],
                "revenue": money(sum(s["revenue"] for s in sites)),
                "profit": money(sum(s["profit"] for s in sites)),
                "baseline": baseline,
            }
        )
    out.sort(key=lambda w: w["daysLeft"])
    return out


def _ingredient_prices(save: Save, names: Names, supply: dict, businesses: list) -> dict:
    """What a unit of each raw material actually cost, from the owner's books.

    The save carries no importer price list — `importPartnerships.products` holds
    an item, an amount and a warehouse, and nothing about money. What it does
    carry is what was paid: yesterday's goods cost per line, against the units
    drawn that day. Dividing one by the other gives a real unit price for every
    material this company already buys, and nothing at all for one it does not.
    Guessing the rest would be inventing a price list.
    """
    summaries = sorted(save.items(save.root["financialSummaries"]), key=lambda s: s["dayNumber"])
    if not summaries:
        return {"unit": {}, "day": None}
    spend = collections.defaultdict(float)
    for statement in save.items(summaries[-1]["businessIncomeStatements"]):
        addr = save.address(statement.get("Address"))
        for line in save.items(statement.get("Resources")):
            if line.get("Amount"):
                spend[(site_key(addr), line["ItemName"])] += line["Amount"]

    by_label = {b["key"]: {} for b in businesses}
    for row in supply["imports"]:
        by_label[businesses[row["s"]]["key"]][row["item"]] = row["perDay"]

    prices = {}
    for (key, slug), paid in spend.items():
        units = by_label.get(key, {}).get(names.label(slug))
        if units and units > 0:
            prices.setdefault(slug, []).append(paid / units)
    return {
        "unit": {s: round(sum(v) / len(v), 4) for s, v in prices.items()},
        "day": summaries[-1]["dayNumber"],
    }


def _plan(
    save: Save,
    names: Names,
    businesses: list,
    catalogue: dict,
    recipes: dict,
    stations: dict,
    prices: dict,
    rhythm: dict,
) -> dict:
    """Everything a chain calculator needs, so the sliders can run in the browser.

    Nothing is decided here. The recipes, the workstations and the prices go
    across as they were read, and the arithmetic happens where the slider is.
    """
    catalogue_out = {}
    for kind, items in catalogue.items():
        catalogue_out[kind] = {
            "type": names.label(kind),
            "products": sorted(items),
        }

    # What the owner's own shops of each type actually sell, per product per day,
    # so the default target is his trading rather than a guess.
    mine = collections.defaultdict(lambda: collections.defaultdict(list))
    sites = collections.Counter()
    for b in businesses:
        if b["status"] != "retail" or not b["revenue"]:
            continue
        sites[b["typeSlug"]] += 1
        for line in b["lines"]:
            if line["price"] and line["rate"] > 0:
                mine[b["typeSlug"]][line["slug"]].append(line["rate"])
    own = {
        kind: {
            "sites": sites[kind],
            # The same count under the name the chain planner prints.
            "shops": sites[kind],
            "perDay": {s: round(sum(v) / len(v), 1) for s, v in products.items()},
        }
        for kind, products in mine.items()
    }

    labels = {}
    for recipe in recipes.values():
        labels[recipe["slug"]] = recipe["item"]
        for ing in recipe["ingredients"]:
            labels[ing["slug"]] = ing["item"]
    for items in catalogue.values():
        for slug in items:
            labels.setdefault(slug, names.label(slug))

    # Orders are placed importer by importer in the game, and each one already
    # has a number in the box. Carrying both across turns the shopping list into
    # something that can be typed straight in rather than added up by hand.
    sources = {}
    for partnership in save.items(save.root["importPartnerships"]):
        who = names.addr(save.address(partnership.get("importAddress")))
        for product in save.items(partnership["products"]):
            sources[product["itemName"]] = {
                "from": who,
                "warehouse": names.addr(save.address(product["assignedWarehouse"])),
                "ordered": product.get("amount", 0),
                "active": bool(partnership.get("isActive")),
            }

    beat = rhythm.get("customers") or rhythm.get("revenue")
    uplift = (max(p["index"] for p in beat) / 100) if beat else 1.0
    return {
        "sources": sources,
        "recipes": list(recipes.values()),
        "workstations": _workstations(names),
        "catalogue": catalogue_out,
        "items": labels,
        "own": own,
        "prices": prices["unit"],
        "priceDay": prices["day"],
        "priceCount": len(prices["unit"]),
        "peak": round(uplift, 3),
        "stations": {names.label(s): c for s, c in stations.items()},
    }


def _expansion(findings: list, market: dict, businesses: list) -> list:
    """Where to put the next dollar, measured first and inferred second.

    A shop turning people away at the door is a fact with a date on it. A gap in
    the demand grid is an inference about a shop that does not exist yet. They
    answer the same question, so they belong in one list — with the measured
    ones above the inferred ones, always.
    """
    by_key = {b["key"]: b for b in businesses}
    buildings = load_buildings()
    out = []
    for finding in findings:
        if finding["kind"] != "cap" or finding["limit"] != "the building":
            continue
        b = by_key[finding["key"]]
        # The building itself, when the table knows the address; a site_key is
        # "slug#number", so only a real address has both halves.
        slug, _, number = b["key"].partition("#")
        row = buildings.get((slug, int(number))) if number else None
        entry = {
            "measured": True,
            "what": b["name"],
            "where": b["neighbourhood"] or b["address"],
            "reason": f"at its {finding['cap']}/h door cap for {finding['hours']} "
            f"hours a week ({finding['when']})",
            "number": f"{finding['hours']} h/week at the ceiling, "
            f"${finding['basket']:,.2f} a customer",
            "worth": finding["throughput"],
            "action": finding["fix"],
        }
        if row:
            entry["traffic"] = row["x"]
            entry["size"] = row["z"]
        out.append(entry)
    out.sort(key=lambda r: -r["worth"])

    for opening in market.get("openings", []):
        out.append(
            {
                "measured": False,
                "what": opening["type"],
                "where": opening["hood"],
                "reason": f"{opening['strong']} of {opening['count']} products in "
                f"strong demand, {opening['providers']} rival"
                f"{'' if opening['providers'] == 1 else 's'} on average",
                "number": f"demand {opening['demand']}",
                "worth": None,
                "action": "open a second one" if opening["mine"] else "open one",
            }
        )
    return out


# What the number in a finding's "worth" is counted in, for the page to print
# under the amount. Only groups whose worth carries money get a unit; the rest
# are left empty because their worth is always None.
ALERT_UNITS = {
    "notrading": "/day rent",
    "vacant": "/day rent",
    "loss": "/day loss",
    "hype": "/day revenue",
    "trend": "/day revenue",
    "atcap": "/day trade",
    "idlestaff": "/day wages",
    "dead": "/day tied up",
    "target": "/day excess",
}


def _alert_id(*parts: str) -> str:
    """A stable id for a finding: the same finding keeps it across renders,
    and it does not depend on where the finding sits in the list."""
    return hashlib.sha1(":".join(parts).encode("utf-8")).hexdigest()[:10]


def _alerts(
    businesses: list,
    supply: dict,
    chains: list,
    trends: list,
    hype: list,
    hours: list,
    grids: list,
    day: int,
    gate: float,
) -> dict:
    """Only things worth acting on, with a number and a deadline where one exists.

    Two filters run over everything below. Findings that repeat across many
    products at one site collapse into a single counted line, and findings that
    carry a dollar figure have to clear the materiality gate — a fraction of a
    day's profit — or they are counted at the foot of the panel instead of read
    out. A site that cannot trade at all is never counted away.
    """
    found = []

    def note(level, site, group, text, rank=0.0, subject="", worth=None, always=False):
        found.append(
            {
                "level": level,
                "site": site,
                "group": group,
                "text": text,
                "rank": rank,
                "subject": subject,
                "worth": worth,
                "unit": ALERT_UNITS.get(group, ""),
                "id": _alert_id(group, site, subject),
                "always": always,
            }
        )

    planned = {link["to"] for link in supply["graph"]["links"]}

    # --- a site that has not started trading is one finding, not four
    silent = set()
    for b in businesses:
        # Only a shop can fail to trade. A warehouse, factory or head office
        # never books a sale, so silence there is its normal state.
        if b["status"] != "retail" or b["revenue"] or day - b["opened"] > NEW_SITE_DAYS:
            continue
        silent.add(b["key"])
        priced = [l for l in b["lines"] if l["price"] > 0]
        stocked = [l for l in priced if l["units"] > 0]
        reasons = []
        if b["staff"] == 0:
            reasons.append("no staff")
        if priced and not stocked:
            reasons.append("no stock")
        elif priced and len(stocked) * 2 < len(priced):
            reasons.append(f"{len(priced) - len(stocked)} of {len(priced)} shelves bare")
        if b["key"] not in planned:
            reasons.append("no delivery plan")
        if not reasons:
            reasons.append("staffed and stocked, no trading day booked yet")
        note(
            "critical",
            b["name"],
            "notrading",
            f"{b['name']} opened day {b['opened']}, not trading yet: "
            f"{', '.join(reasons)}, ${b['rent']:,.0f}/day rent",
            worth=b["rent"],
            always=True,
        )

    vacant = [b for b in businesses if b["status"] == "vacant"]
    if vacant:
        rent = sum(b["rent"] for b in vacant)
        note(
            "warn",
            f"{len(vacant)} leases",
            "vacant",
            f"{len(vacant)} vacant leases costing ${rent:,.0f}/day in rent",
            worth=rent,
        )

    for b in businesses:
        if b["status"] == "vacant" or b["key"] in silent:
            continue
        if b["profit"] < 0 and not b["costCentre"]:
            note(
                "critical" if b["profit"] < -1000 else "warn",
                b["name"],
                "loss",
                f"Lost ${abs(b['profit']):,.0f} yesterday",
                worth=abs(b["profit"]),
            )
        if b["status"] == "retail" and b["staff"] == 0:
            note("critical", b["name"], "staff", "No staff assigned", always=True)
        sat = b["satisfaction"]["overall"]
        if sat is not None and b["customers"] and sat < 80:
            note("warn", b["name"], "satisfaction", f"Customer satisfaction at {sat}%")
        for slug in b["missingAmenities"]:
            group, text = AMENITY_DEMANDS[slug]
            note("warn", b["name"], group, text, always=True)

    # --- the promotion cap, which is reached with campaigns or not at all
    # Promotion is the foot traffic the address comes with plus whatever the
    # marketing campaigns add, held at 100. The address is fixed, so a shop
    # short of the cap has only one lever: more campaigns. A shop already at
    # 100% marketing has pulled that lever all the way and is done, whatever
    # its total reads.
    short = []
    for b in businesses:
        if b["status"] != "retail" or b["key"] in silent:
            continue
        if not (b["customers"] or b["revenue"]):
            continue
        if b["promotion"] >= PROMOTION_CAP or b["marketingIndex"] >= PROMOTION_CAP:
            continue
        short.append(b)
    short.sort(key=lambda b: b["promotion"])
    if short:
        worst = PROMOTION_CAP - short[0]["promotion"]
        level = "warn" if worst >= PROMOTION_GAP else "info"
        where = short[0]["name"] if len(short) == 1 else f"{len(short)} shops"
        if len(short) == 1:
            b = short[0]
            text = (
                f"{b['name']} promotes at {b['promotion']}% of the 100% cap: "
                f"{b['traffic']}% foot traffic and {b['marketingIndex']}% marketing. "
                f"The address sets the foot traffic, so the missing "
                f"{PROMOTION_CAP - b['promotion']} points have to come from campaigns"
            )
        else:
            who = ", ".join(
                f"{b['name']} {b['promotion']}% ({b['marketingIndex']}% marketing)"
                for b in short
            )
            text = (
                f"{len(short)} shops promote below the 100% cap with marketing not yet "
                f"maxed: {who}. The address sets the foot traffic, so campaigns are "
                f"the only lever"
            )
        note(level, where, "promotion", text, rank=-worst, always=True)

    # --- what a hype wave is carrying, and what the day it ends costs
    grid_of = {g["key"]: g for g in grids}

    def full_hours(key: str) -> int:
        """Hours of a normal week this shop spends within 10% of its ceiling."""
        grid = grid_of.get(key)
        if not grid:
            return 0
        return sum(
            1
            for wd in range(7)
            if not grid["thin"][wd]
            for hour in range(24)
            if grid["customers"][wd][hour] is not None
            and grid["effective"][wd][hour]
            and grid["customers"][wd][hour] >= grid["effective"][wd][hour] * HYPE_TIGHT
        )

    for wave in hype:
        top = max(wave["sites"], key=lambda s: s["revenue"])
        when = (
            "ends today"
            if wave["daysLeft"] <= 0
            else "ends tomorrow"
            if wave["daysLeft"] == 1
            else f"has {wave['daysLeft']} days left"
        )
        # Pricing is somebody else's job in this company. When a wave lands on a
        # shop that is already full, the only lever left is capacity — and it has
        # the wave's end date on it.
        full = full_hours(top["key"])
        queue = (
            f" It already runs within 10% of capacity for {full} hour"
            f"{'' if full == 1 else 's'} of a normal week, so the door is turning part "
            f"of the wave away and capacity is the only lever left."
            if full
            else ""
        )
        base = wave["baseline"]
        if base:
            drop = max(top["revenue"] - base["revenue"], 0)
            note(
                "critical" if wave["daysLeft"] <= 2 else "warn",
                top["name"],
                "hype",
                f"{wave['hood']} hype on {wave['count']} lines {when}; "
                f"{top['name']} does ${top['revenue']:,.0f}/day under it against "
                f"${base['revenue']:,.0f} for {base['basis']}; "
                f"about ${drop:,.0f}/day of revenue rides on the wave.{queue}",
                worth=drop,
            )
        else:
            note(
                "warn",
                top["name"],
                "hype",
                f"{wave['hood']} hype on {wave['count']} lines {when}; "
                f"{top['name']} does ${top['revenue']:,.0f}/day under it. There is no "
                f"shop of the same kind trading without a wave and no trading days "
                f"before this one started, so there is no baseline to say what the "
                f"drop will be",
                always=True,
            )

    # --- a site whose week moved, against the week before it
    riding = {w["top"] for w in hype}
    for row in trends:
        if not row["ready"] or row["change"] is None:
            continue
        if abs(row["change"]) < TREND_MOVE:
            continue
        b = businesses[row["s"]]
        # A factory's takings are batch exports on the purchase calendar, not
        # trading; and a shop up under its own hype wave is the line above this
        # one said twice.
        if b["status"] != "retail":
            continue
        if row["change"] > 0 and b["key"] in riding:
            continue
        direction = "up" if row["change"] > 0 else "down"
        note(
            "warn" if row["change"] < 0 else "info",
            b["name"],
            "trend",
            f"Revenue {direction} {abs(row['change']) * 100:.0f}% week on week: "
            f"${row['last7']:,.0f} over days {day - 7}-{day - 1} against "
            f"${row['prev7']:,.0f} the week before",
            worth=abs(row["last7"] - row["prev7"]) / 7,
        )

    # A shop only runs dry if a day of selling outruns the morning top-up.
    for row in supply["shops"]:
        if row["level"] == "ok" or businesses[row["s"]]["key"] in silent:
            continue
        site = businesses[row["s"]]["name"]
        if row["pressure"] is None:
            note(
                row["level"],
                site,
                "unplanned",
                f"{row['item']} is on no distribution plan: {row['stock']:,} left "
                f"at {row['sold']:,}/day",
                -row["stock"],
                row["item"],
            )
        elif row["level"] == "critical":
            note(
                "critical",
                site,
                "outruns",
                f"{row['item']} sells {row['peakSold']:,} on a {row['peakDay']} against "
                f"a {row['target']:,} top-up; empties before the next drop",
                -row["pressure"],
                row["item"],
            )

    # A depot only runs dry if it cannot reach the next delivery by more than a
    # few hours, and an order is only wrong if it cannot cover the week it has to
    # cover.
    arrives = supply["nextImportWeekday"] or "the next"
    for row in supply["imports"]:
        if row["level"] != "critical" or businesses[row["s"]]["key"] in silent:
            continue
        site = businesses[row["s"]]["name"]
        when = f"on {row['runsOut']}" if row["runsOut"] else f"in {row['cover']} days"
        if row["reason"] == "paused":
            note(
                "critical",
                site,
                "paused",
                f"{row['item']} import is paused: {row['cover']:.0f} days left "
                f"at {row['perDay']:,}/day",
                row["cover"],
                row["item"],
            )
        elif row["reason"] == "shortfall":
            note(
                "critical",
                site,
                "shortfall",
                f"{row['item']} runs dry {when}, {row['shortBy']:.1f} days before "
                f"{arrives}'s import ({row['perDay']:,}/day, {row['peakPerDay']:,} at peak)",
                row["cover"],
                row["item"],
            )
        else:
            note(
                "critical",
                site,
                "order",
                f"{row['item']} orders {row['weekly']:,} a week against a "
                f"{row['weekNeed']:,} week of use, {row['weekNeed'] - row['weekly']:,} short"
                + (
                    f"; already runs dry {when}, {row['shortBy']:.1f} days before "
                    f"{arrives}'s import"
                    if row["coverFit"] == "short"
                    else ""
                ),
                row["cover"],
                row["item"],
            )

    # --- what the hour-by-hour grid says that a daily total cannot
    # Five shops hitting the same 30/h ceiling in the same hours is one finding
    # about five shops, not five findings.
    same = collections.OrderedDict()
    for finding in hours:
        if finding["kind"] == "cap" and finding["key"] not in silent:
            same.setdefault(
                (finding["limit"], finding["cap"], finding["when"], finding["hours"]),
                [],
            ).append(finding)
    for (limit, cap, when, per_week), group in same.items():
        worth = sum(f["throughput"] for f in group)
        where = (
            group[0]["site"]
            if len(group) == 1
            else f"{len(group)} shops"
        )
        who = "" if len(group) == 1 else ": " + ", ".join(f["site"] for f in group)
        subject = "is" if len(group) == 1 else "are"
        if limit == "the building":
            text = (
                f"{where} {subject} at the {cap}/h door cap {when}, {per_week} hours a "
                f"week at the ceiling with ${worth:,.0f}/day of trade going through it. "
                f"The building is the limit, so the answer is {group[0]['fix']}{who}"
            )
        else:
            text = (
                f"{where} fill{'s' if len(group) == 1 else ''} the counters {when}, "
                f"{per_week} hours a week at {cap}/h and ${worth:,.0f}/day through the "
                f"ceiling. {limit.capitalize()} is the limit, so the answer is "
                f"{group[0]['fix']}{who}"
            )
        note("warn", where, "atcap", text, worth=worth)

    for finding in hours:
        if finding["key"] in silent or finding["kind"] != "idle":
            continue
        site = finding["site"]
        note(
            "info",
            site,
            "idlestaff",
            f"{site} runs {finding['staff']} counters "
            f"{finding['from']:02d}:00-{finding['to']:02d}:00 on a "
            f"{finding['day']} for {finding['seen']} customers an hour; "
            f"{finding['spare']} staff-hours a week that buy nothing",
            worth=finding["worth"],
        )

    found.extend(_idle_notes(businesses, supply["idle"], silent))
    found.extend(_feed_notes(businesses, supply.get("factories", {}), silent))
    found.extend(_staff_notes(businesses, supply.get("factories", {}), silent))
    found.extend(_unnamed_notes(businesses, supply.get("factories", {}), silent))
    return _condense(found, gate)


def _unnamed_notes(businesses: list, factories: dict, silent: set) -> list:
    """A machine whose recipe the board cannot read, and the needs it hides.

    Two different things wear the same badge on the lines table. A machine with
    no recipe selected at all is standing still and costing rent; one that is
    running a recipe the flow cannot pin down is working perfectly well, but
    every input need at that site is short by whatever it eats — which is worth
    saying out loud, because nothing else on the board looks wrong.
    """
    notes = []
    for site in factories.get("sites", []):
        business = businesses[site["s"]]
        if business["key"] in silent:
            continue
        for kind, group, level in (("idle", "unset", "critical"), ("blind", "unnamed", "warn")):
            rows = [u for u in site["unnamed"] if u["idle"] == (kind == "idle")]
            machines = sum(u["machines"] for u in rows)
            if not machines:
                continue
            many = machines != 1
            where = ", ".join(
                sorted({f"{u['workstation']} #{s}" for u in rows for s in u["slots"]})
            )
            if kind == "idle":
                text = (
                    f"{machines} machine{'s' if many else ''} at {where} "
                    f"{'have' if many else 'has'} no recipe set: staffed and rented, making nothing"
                )
            else:
                guesses = sorted({u["hint"]["item"] for u in rows if u.get("hint")})
                likely = f"; the flow reads {' and '.join(guesses)}" if guesses else ""
                text = (
                    f"{machines} machine{'s' if many else ''} at {where} "
                    f"{'run' if many else 'runs'} a recipe the board cannot name{likely}. "
                    f"Every input need here is short by what it eats; name the line to "
                    f"put it in the numbers"
                )
            notes.append(
                {
                    "level": level,
                    "site": business["name"],
                    "group": group,
                    "text": text,
                    "rank": -machines,
                    "subject": where,
                    "worth": None,
                    "unit": ALERT_UNITS.get(group, ""),
                    "id": _alert_id(group, business["name"], where),
                    "always": False,
                }
            )
    return notes


def _staff_notes(businesses: list, factories: dict, silent: set) -> list:
    """A factory machine nobody is posted to for part of the week stands still."""
    notes = []
    for site in factories.get("sites", []):
        business = businesses[site["s"]]
        if business["key"] in silent:
            continue
        for line in site["lines"] + site["unnamed"]:
            name = line.get("item") or line["workstation"]
            for machine in line.get("gaps", []):
                share = machine["hours"] / STAFF_HOURS
                lost = round((STAFF_HOURS - machine["hours"]) / 7 * line.get("rate", 0))
                subject = f"{name} at position {machine['slot']}"
                text = (
                    f"{name} machine at list position {machine['slot']} is staffed "
                    f"{machine['hours']} of {STAFF_HOURS} hours; nobody on it {machine['off']}"
                    + (f"; {lost:,} a day not made" if lost else "")
                )
                notes.append(
                    {
                        "level": "critical" if share < STAFF_CRITICAL else "warn",
                        "site": business["name"],
                        "group": "staff",
                        "text": text,
                        "rank": machine["hours"],
                        "subject": subject,
                        "worth": None,
                        "unit": ALERT_UNITS.get("staff", ""),
                        "id": _alert_id("staff", business["name"], subject),
                        "always": False,
                    }
                )
    return notes


def _feed_notes(businesses: list, factories: dict, silent: set) -> list:
    """A factory input the flow does not cover, with the number to change."""
    notes = []
    said = set()
    for site in factories.get("sites", []):
        business = businesses[site["s"]]
        if business["key"] in silent:
            continue
        for row in site["needs"]:
            # Staffing has its own line, per machine and hour.
            if row["level"] == "ok" or row["status"] in ("waiting", "staffing"):
                continue
            depot = businesses[row["from"]]["name"] if row["from"] is not None else "the depot"
            # An import sized wrong is one finding about the depot, however
            # many factories draw on it.
            where = business["name"]
            if row["status"] in ("import", "noimport"):
                if (row["from"], row["slug"]) in said:
                    continue
                said.add((row["from"], row["slug"]))
                where = depot
            lines = ", ".join(row["lines"][:3])
            status = row["status"]
            if status == "unplanned":
                text = (
                    f"{row['item']} feeds {lines} at {row['perDay']:,}/day "
                    f"but no depot tops it up"
                )
            elif status == "target":
                hours = row["target"] / row["perDay"] * 24
                text = (
                    f"{row['item']} top-up of {row['target']:,} covers {hours:.0f} hours "
                    f"of a {row['perDay']:,}/day line; raise it to {row['raiseTarget']:,}"
                )
                if row["stalled"]:
                    text += (
                        f"; and none arrived last week though {depot} holds "
                        f"{row['depotStock']:,}"
                    )
            elif status == "dry":
                text = (
                    f"{row['item']} arrives at {row['arrives']:,}/day against "
                    f"{row['perDay']:,} needed and {depot} holds {row['depotStock']:,}; "
                    f"the import is not keeping up"
                )
            elif status == "idle":
                text = (
                    f"{row['item']} arrives at {row['arrives']:,}/day against "
                    f"{row['perDay']:,} needed while {depot} holds {row['depotStock']:,}; "
                    f"the line is not drawing it"
                )
            elif status == "staffing":
                text = (
                    f"{row['item']} arrives at {row['arrives']:,}/day against {row['perDay']:,} "
                    f"the machines could eat; the roster runs them {round(row['staffedShare'] * 100)}% "
                    f"of the week"
                )
            elif status == "import" and row["raiseImport"]:
                text = (
                    f"{row['item']}: the factories eat {row['depotNeed']:,} a week and the "
                    f"import order is {row['importWeekly']:,}; raise it to {row['raiseImport']:,}"
                )
            elif status == "import":
                text = (
                    f"{row['item']} import of {row['importWeekly']:,} is within 5% of the "
                    f"{row['depotNeed']:,} the factories eat a week"
                )
            else:
                weeks = row["depotStock"] / row["depotNeed"] if row["depotNeed"] else 0
                text = (
                    f"{row['item']} has no standing import; {depot} holds "
                    f"{row['depotStock']:,}, {weeks:.1f} weeks of the {row['depotNeed']:,} a week "
                    f"the factories eat"
                )
            notes.append(
                {
                    "level": row["level"],
                    "site": where,
                    "group": "feed",
                    "text": text,
                    "rank": -row["perDay"],
                    "subject": row["item"],
                    "worth": None,
                    "unit": ALERT_UNITS.get("feed", ""),
                    "id": _alert_id("feed", where, row["item"]),
                    "always": False,
                }
            )
    return notes


def _idle_notes(businesses: list, idle: list, silent: set) -> list:
    """Stock standing still, said once per cause rather than once per shelf.

    Six shops holding a thousand cupcakes each is not six findings; it is one
    top-up target set too high. Anything with nothing at all flowing out is a
    different problem and stays one line per site.
    """
    live = [r for r in idle if businesses[r["s"]]["key"] not in silent]
    notes = []

    dead_by_site = collections.OrderedDict()
    for row in (r for r in live if r["dead"]):
        dead_by_site.setdefault(row["s"], []).append(row)
    for site_index, rows in dead_by_site.items():
        name = businesses[site_index]["name"]
        for row in rows:
            # Raw materials carry no retail price, so there is no honest dollar
            # figure to gate them by — the units are the finding.
            worth = (
                row["value"] / max(1.0, (row["stock"] / max(row["perWeek"], 1)) * 7)
                if row["price"]
                else None
            )
            notes.append(
                {
                    "level": "info",
                    "site": name,
                    "group": "dead",
                    "text": f"{row['stock']:,} {row['item']} held with nothing moving out",
                    "rank": -row["stock"],
                    "subject": row["item"],
                    "worth": worth,
                    "unit": ALERT_UNITS.get("dead", ""),
                    "id": _alert_id("dead", name, row["item"]),
                    "always": False,
                }
            )

    # Everything else groups by the top-up target behind it: the same number in
    # the same plan, repeated across shops, is one setting to change.
    by_target = collections.OrderedDict()
    for row in (r for r in live if not r["dead"]):
        by_target.setdefault(row["target"] or 0, []).append(row)
    for target, rows in by_target.items():
        items = sorted({r["item"] for r in rows})
        sites = len({r["s"] for r in rows})
        daily = sum(r["perWeek"] for r in rows) / 7 / len(rows)
        stock = sum(r["stock"] for r in rows)
        # Value the excess at what it sells for, spread over how long it takes to
        # sell — a rate, so it can be read against a day's profit.
        worth = sum(
            r["value"] / max(1.0, r["weeks"] * 7) for r in rows if r["price"]
        ) or None
        if target and daily:
            text = (
                f"{', '.join(items)} top-up target of {target:,} is "
                f"{target / daily:.0f}x daily sales in {sites} "
                f"shop{'s' if sites > 1 else ''}; lower the target"
            )
        else:
            text = (
                f"{stock:,} units of {', '.join(items)} across {sites} "
                f"site{'s' if sites > 1 else ''} is "
                f"{stock / max(sum(r['perWeek'] for r in rows), 1):.0f} weeks of supply"
            )
        site = f"{sites} shops" if sites > 1 else businesses[rows[0]["s"]]["name"]
        notes.append(
            {
                "level": "info",
                "site": site,
                "group": "target",
                "text": text,
                "rank": -stock,
                "subject": items[0],
                "worth": worth,
                "unit": ALERT_UNITS.get("target", ""),
                "id": _alert_id("target", site, items[0]),
                "always": False,
            }
        )
    return notes


# How a pile of same-shaped findings at one site reads as a single line.
SUMMARIES = {
    "shortfall": "{n} items run dry before the next import; soonest {subject}",
    "order": "{n} weekly orders cannot cover their own week; worst {subject}",
    "paused": "{n} imports are paused; soonest to run out is {subject}",
    "outruns": "{n} products outsell their daily top-up; worst {subject}",
    "unplanned": "{n} stocked products are on no distribution plan; largest {subject}",
    "dead": "{n} products are held with nothing moving out; largest {subject}",
    "feed": "{n} factory inputs are not fed as the machines need; largest {subject}",
    "staff": "{n} factory machines are not staffed round the clock; worst {subject}",
    "unnamed": "{n} factory machines run recipes the board cannot name; {subject} the largest",
    "unset": "{n} factory machines have no recipe set; {subject} the largest",
    "target": "{n} top-up targets are set far above what sells; {subject} the deepest",
}
CONDENSE_AT = 3  # three or more of a kind at one site becomes one line


def _condense(found: list, gate: float) -> dict:
    buckets = collections.OrderedDict()
    for item in found:
        buckets.setdefault((item["site"], item["group"]), []).append(item)

    out = []
    for (site, group), rows in buckets.items():
        if len(rows) < CONDENSE_AT or group not in SUMMARIES:
            out.extend(rows)
            continue
        rows.sort(key=lambda r: r["rank"])
        worst = rows[0]
        worths = [r["worth"] for r in rows if r["worth"] is not None]
        out.append(
            {
                "level": worst["level"],
                "site": site,
                "group": group,
                "text": SUMMARIES[group].format(n=len(rows), subject=worst["subject"]),
                "detail": worst["text"],
                "worth": sum(worths) if worths else None,
                "unit": ALERT_UNITS.get(group, ""),
                # The subject is dropped here, so the merged row is keyed on
                # where it is alone.
                "id": _alert_id("summary", group, site),
                "always": any(r["always"] for r in rows),
            }
        )

    order = {"critical": 0, "warn": 1, "info": 2}
    lines, minor = [], []
    for row in out:
        for key in ("rank", "subject"):
            row.pop(key, None)
        small = (
            not row["always"]
            and row["worth"] is not None
            and abs(row["worth"]) < gate
        )
        row.pop("always")
        if row["worth"] is not None:
            row["worth"] = money(row["worth"])
        (minor if small else lines).append(row)

    lines.sort(key=lambda a: order[a["level"]])
    minor.sort(key=lambda a: -(a["worth"] or 0))
    return {
        "lines": lines,
        "minor": {
            "count": len(minor),
            "gate": round(gate, 2),
            "worth": money(sum(m["worth"] or 0 for m in minor)),
            "rows": minor,
        },
    }


# ------------------------------------------------------------------- render
def render(
    data: dict | None,
    live: bool = False,
    *,
    banner: str = "",
    before_script: str = "",
    head: str = "",
) -> str:
    """The page. With live=True it asks its data source for fresh numbers.

    ``data`` may be None for a page that receives its numbers later, as the
    in-browser board does. ``banner`` is markup placed above the board,
    ``before_script`` goes just ahead of the board's own script, which is where
    a host page defines ``window.LEDGER_SOURCE``, and ``head`` is extra markup
    for the document head (a viewport tag, an analytics beacon).

    The doctype comes first so the page runs in standards mode: without it the
    viewport height reads as the document's, tables do not inherit line-height
    and the tooltip layer has to guess where the window ends.

    A save name is the player's own text, so it is escaped on the way into the
    title, and ``</`` is escaped inside the JSON so a name can never close the
    script tag it sits in.
    """
    if data is None:
        payload, title = "null", "Big Copilot"
    else:
        payload = json.dumps(data, separators=(",", ":")).replace("</", "<\\/")
        title = f"{data['meta']['save']} · Big Copilot"
    return "<!doctype html>" + chr(10) + '<meta charset="utf-8">' + chr(10) + head + (
        TEMPLATE.replace("/*__DATA__*/null", payload)
        .replace("/*__LIVE__*/false", "true" if live else "false")
        .replace("__TITLE__", html_escape(title))
        .replace("<!--__BANNER__-->", banner)
        .replace("<!--__BEFORE_SCRIPT__-->", before_script)
    )


TEMPLATE = r"""<title>__TITLE__</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
<style>
/* Tokens: the generator's .board palette. Dark is the base, as on the canvas;
   the light values follow the system setting or an explicit data-theme, the way
   the board has always done it. */
:root{
  --ground:#0d100f; --surface:#151917; --raised:#1c211e;
  --ink:#e9ece6; --ink-2:#9aa39d; --ink-3:#6b756f;
  --rule:#262c28; --rule-soft:#1e2320;
  --accent:#43c07a; --accent-soft:#43c07a26;
  --pos:#43c07a; --neg:#ff6257; --warn:#f0913a; --info:#6ea8ff;
  --tip-bg:#e9ece6; --tip-ink:#0d100f;
  --shadow:0 1px 2px #00000059;
}
@media (prefers-color-scheme:light){
  :root:not([data-theme="dark"]){
    --ground:#eef0ea; --surface:#fdfdfb; --raised:#f3f4ef;
    --ink:#15181a; --ink-2:#5b6469; --ink-3:#8b9499;
    --rule:#d2d6cd; --rule-soft:#e0e3da;
    --accent:#00703a; --accent-soft:#00703a1f;
    --pos:#00703a; --neg:#cc2a20; --warn:#c25400; --info:#2a5ea8;
    --tip-bg:#15181a; --tip-ink:#f3f4ef;
    --shadow:0 1px 2px #15181a0f;
  }
  :root:not([data-theme="dark"]) .chip.dim{background:#00000010}
  :root:not([data-theme="dark"]) .orb::after{opacity:.2}
}
:root[data-theme="light"]{
  --ground:#eef0ea; --surface:#fdfdfb; --raised:#f3f4ef;
  --ink:#15181a; --ink-2:#5b6469; --ink-3:#8b9499;
  --rule:#d2d6cd; --rule-soft:#e0e3da;
  --accent:#00703a; --accent-soft:#00703a1f;
  --pos:#00703a; --neg:#cc2a20; --warn:#c25400; --info:#2a5ea8;
  --tip-bg:#15181a; --tip-ink:#f3f4ef;
  --shadow:0 1px 2px #15181a0f;
}
:root[data-theme="light"] .chip.dim{background:#00000010}
:root[data-theme="light"] .orb::after{opacity:.2}
*{box-sizing:border-box}
body{
  margin:0; background:var(--ground); color:var(--ink);
  font-family:Archivo,"Helvetica Neue",Arial,sans-serif;
  font-size:14px; line-height:1.45; -webkit-font-smoothing:antialiased;
}
.mono,.num{font-family:"IBM Plex Mono",ui-monospace,Consolas,monospace;font-variant-numeric:tabular-nums}
.pos{color:var(--pos)}.neg{color:var(--neg)}.warn{color:var(--warn)}.warnc{color:var(--warn)}
.wrap{width:min(1180px,calc(100% - 80px));margin:0 auto;position:relative;z-index:1;padding-bottom:72px}
svg{display:block}
/* The board runs to a dozen screens, most of it off-view at any moment, and it
   is read on a second monitor while the game has the GPU. Sections that are not
   on screen are skipped entirely; the reserved height keeps the scrollbar
   honest. The daily chart opts out because it sizes its viewBox from its own
   rendered width, which is zero while skipped. */
section{content-visibility:auto; contain-intrinsic-size:auto 620px}
section.measured{content-visibility:visible}
/* A finding's link scrolls to a section; the sticky masthead must not cover it. */
section,.sitehead{scroll-margin-top:116px}

/* ===== kept from the old board: what the artboards could not show ==========
   Header sorting, the site picker's full list inside its .seg, the open
   site's row in the portfolio, a paused import pipe, the two pipe tables
   under the map, the naming controls on the factory-lines view, and the
   growth grid's sortable columns and empty cells. ============================ */
thead th[data-i]{cursor:pointer; user-select:none}
thead th[data-i]:hover{color:var(--ink)}
thead th svg.sort{width:11px; height:11px; stroke:var(--accent); fill:none; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; vertical-align:-1px; margin-left:5px}
thead th[data-dir="desc"] svg.sort{transform:rotate(180deg)}
tr.kid.on td{background:var(--accent-soft)}
.seg select.sitepick{appearance:none; -webkit-appearance:none; font:500 12.5px Archivo,"Helvetica Neue",Arial,sans-serif; color:var(--ground); background:var(--ink); border:0; border-radius:5px; padding:6px 12px; cursor:pointer; max-width:260px}
.seg select.sitepick option,.seg select.sitepick optgroup{color:var(--ink); background:var(--surface)}
.flow .pipe.paused{stroke:var(--neg);stroke-opacity:.7}
.scrollx{overflow-x:auto}
#stock td.l+td.l,#importPlan td.l,#topupPlan td.l{white-space:normal}
.flowpipes{display:grid;grid-template-columns:1fr 1fr;gap:20px 32px;margin:0 0 4px}
select.linepick{
  font:inherit;font-size:12px;color:var(--ink);background:var(--surface);
  border:1px solid var(--rule);border-radius:6px;padding:3px 8px;margin-left:6px;
}
select.linepick:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
button.unname{
  font:inherit;font-size:12px;line-height:1.4;color:var(--ink-3);background:none;
  border:1px solid var(--rule);border-radius:5px;padding:0 6px;margin-left:4px;cursor:pointer;
}
button.unname:hover{color:var(--ink);border-color:var(--ink-3)}
button.unname:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.heat .h[data-hood]{cursor:pointer}
.heat .h.sort{color:var(--accent)}
.cell.none{background:var(--surface);color:var(--ink-3);cursor:default}
.cell.none:hover{transform:none;box-shadow:none}
.waves .quiet{padding:7px 0}
#planPicker .field select{padding:6px 10px;font-size:12.5px}

/* everything arrives: sections slide in when they come into view -------- */
.rv{opacity:0;transform:translateY(12px);transition:opacity .55s ease,transform .55s cubic-bezier(.2,.7,.2,1)}
.rv.in{opacity:1;transform:none}

/* masthead: wordmark, five places, the clock ------------------------------ */
.mast{display:flex;align-items:center;gap:40px;height:100px;border-bottom:1px solid var(--rule);position:sticky;top:0;z-index:5;background:var(--ground)}
.brand{display:flex;align-items:baseline;gap:2px;user-select:none}
.wordmark{font-size:30px;font-weight:800;letter-spacing:-.045em;line-height:1;cursor:pointer}
.brand .dot{
  display:inline-block;width:11px;height:11px;border-radius:50%;background:var(--accent);
  transform-origin:50% 100%;transition:transform .25s cubic-bezier(.34,1.56,.64,1);cursor:pointer;
}
.brand:hover .dot{transform:translateY(-6px) scale(1.15)}
.brand .dot.spin{animation:coinspin .6s linear}
.brand .dot.kick{animation:kick .7s cubic-bezier(.34,1.56,.64,1)}
@keyframes kick{30%{transform:translateY(-6px) scale(1.8)}60%{transform:scale(.6)}100%{transform:none}}
@keyframes coinspin{from{transform:rotateY(0)}to{transform:rotateY(720deg)}}
.coin{
  position:absolute;width:9px;height:9px;border-radius:50%;background:var(--accent);
  pointer-events:none;animation:fall 1.1s cubic-bezier(.2,.7,.4,1) forwards;z-index:9;
}
@keyframes fall{0%{transform:translate(0,0) scale(1);opacity:1}100%{transform:translate(var(--dx),var(--dy)) scale(.6);opacity:0}}
.nav{position:relative;display:flex;gap:4px;margin-left:8px}
.nav a{
  display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:6px;
  color:var(--ink-2);text-decoration:none;font-weight:500;font-size:13.5px;transition:color .15s;
}
.nav a svg{width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;transition:transform .25s cubic-bezier(.34,1.56,.64,1)}
.nav a:hover svg{transform:translateY(-2px) rotate(-6deg)}
.nav a:hover,.nav a.on{color:var(--ink)}
.nav .ink{
  position:absolute;bottom:-1px;height:2px;background:var(--accent);border-radius:2px;
  left:var(--nx,0);width:var(--nw,0);transition:left .28s cubic-bezier(.4,0,.2,1),width .28s cubic-bezier(.4,0,.2,1);
}
.clock{margin-left:auto;text-align:right;cursor:default}
.clock b{font-family:"IBM Plex Mono",monospace;font-weight:500;font-size:16px;letter-spacing:.01em}
.clock b i{font-style:normal;color:var(--ink-3);margin:0 6px}
@keyframes blink{50%{opacity:.25}}
.clock small{display:block;font-family:"IBM Plex Mono",monospace;font-size:10.5px;letter-spacing:.06em;color:var(--ink-3);margin-top:3px;text-transform:uppercase}
.clock small .flag{color:var(--warn)}
/* The live dot for a --watch board sits in the clock's small line. */
.live{display:inline-flex;align-items:center;gap:6px;color:var(--accent);transition:color .3s}
.live b{width:6px;height:6px;border-radius:50%;background:currentColor;animation:pulse 2.4s infinite}
.live em{font-style:normal}
.live.just{color:var(--info)}
.live.off{color:var(--ink-3)}
.live.off b{animation:none}
.live.stale{color:var(--warn)}
.live.stale b{animation:none}
@keyframes pulse{0%,100%{opacity:1} 50%{opacity:.2}}

/* tooltips: the sentence lives here now, not on the page --------------------
   One body-level element, positioned from the hovered [data-tip]'s rect, so a
   section's paint containment can never clip a note. wireTips() drives it. */
#tip{
  position:fixed;left:0;top:0;z-index:80;
  background:var(--tip-bg);color:var(--tip-ink);padding:7px 10px;border-radius:5px;
  font:400 12px/1.4 Archivo,sans-serif;white-space:normal;width:max-content;max-width:300px;
  opacity:0;transform:translateY(-3px);pointer-events:none;transition:opacity .15s,transform .15s;
}
#tip.side{transform:translateX(-6px)}
#tip.above{transform:translateY(3px)}
#tip.on{opacity:1;transform:none}
[data-tip]:focus-visible{outline:2px solid var(--accent);outline-offset:2px}

/* sections ----------------------------------------------------------------- */
.sec{margin-top:44px}
.page > .sec:first-child,.page > .duo.sec:first-child{margin-top:32px}
.subhead{margin-top:28px}
.subhead + .sec{margin-top:28px}
.sechead{display:flex;align-items:center;gap:14px;margin-bottom:14px}
.sechead h2{margin:0;font-size:17px;font-weight:600;letter-spacing:-.01em}
.sechead .aside{margin-left:auto;display:flex;align-items:center;gap:8px}
.why{
  width:18px;height:18px;border-radius:50%;border:1px solid var(--rule);color:var(--ink-3);
  display:grid;place-items:center;font:500 11px/1 "IBM Plex Mono",monospace;cursor:help;overflow:visible;z-index:30;
}
.why i{font-style:normal;display:block}
.why:hover,.why:focus-visible{color:var(--ink);border-color:var(--ink-3)}
.why:hover i{animation:qdrop .5s cubic-bezier(.34,1.56,.64,1)}
@keyframes qdrop{0%{transform:translateY(-16px);opacity:0}100%{transform:none;opacity:1}}
.seg{display:inline-flex;border:1px solid var(--rule);border-radius:7px;padding:2px;gap:2px;background:var(--surface)}
.seg a{padding:6px 12px;border-radius:5px;font-size:12.5px;font-weight:500;color:var(--ink-2);text-decoration:none;transition:background .15s,color .15s}
.seg a:hover{color:var(--ink)}
.seg a.on{background:var(--ink);color:var(--ground)}
.ibtn{
  width:32px;height:32px;border-radius:7px;border:1px solid var(--rule);background:var(--surface);
  display:grid;place-items:center;color:var(--ink-2);cursor:pointer;transition:color .15s,border-color .15s;
}
.ibtn:hover{color:var(--ink);border-color:var(--ink-3)}
.ibtn svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.quiet{color:var(--ink-3);font-size:12.5px}
.link{color:var(--ink-2);text-decoration:none;border-bottom:1px solid var(--rule);font-size:12.5px}
.link:hover{color:var(--ink);border-color:var(--ink-3)}

/* kpis: a number, a chip, a line ----------------------------------------- */
.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px;margin-top:36px}
.kpi{
  position:relative;padding:18px 20px 16px;border-radius:10px;background:var(--surface);
  border:1px solid var(--rule-soft);display:flex;flex-direction:column;gap:8px;
}
.kpi::before{
  content:"";position:absolute;inset:0;border-radius:10px;pointer-events:none;opacity:0;transition:opacity .25s;
  background:radial-gradient(220px circle at var(--mx,50%) var(--my,50%),var(--accent-soft),transparent 70%);
}
.kpi:hover::before{opacity:1}
.kpi .lab{font-family:"IBM Plex Mono",monospace;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3)}
.kpi .v{font-family:"IBM Plex Mono",monospace;font-size:30px;font-weight:500;letter-spacing:-.02em;line-height:1.05}
.kpi .row{display:flex;align-items:center;gap:10px;min-height:20px}
.chip{
  display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:4px;
  font:500 11px/1.5 "IBM Plex Mono",monospace;letter-spacing:.02em;
}
.chip.ok{background:var(--accent-soft);color:var(--accent)}
.chip.bad{background:#ff625722;color:var(--neg)}
.chip.warn{background:#f0913a22;color:var(--warn)}
.chip.dim{background:#ffffff10;color:var(--ink-2)}
.kpi .sub{font-family:"IBM Plex Mono",monospace;font-size:11.5px;color:var(--ink-2)}
.spark{position:relative;height:34px;margin-top:2px}
.spark svg{width:100%;height:34px;overflow:visible}
.spark polyline{fill:none;stroke:var(--accent);stroke-width:1.6;stroke-linejoin:round}
.spark .area{fill:var(--accent);opacity:.08}
.spark .pt{fill:var(--accent);opacity:0;transition:opacity .15s}
.spark .scrub{
  position:absolute;top:-22px;left:0;transform:translateX(-50%);opacity:0;
  font:500 10.5px/1 "IBM Plex Mono",monospace;color:var(--ink);white-space:nowrap;transition:opacity .15s;
}
.kpi:hover .spark .pt,.kpi:hover .spark .scrub{opacity:1}

/* findings: a dot, a verb, a number ------------------------------------- */
.sev{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:6px;cursor:pointer;color:var(--ink-2);font:500 12.5px/1 "IBM Plex Mono",monospace;border:1px solid transparent;transition:all .15s}
.sev i{width:8px;height:8px;border-radius:50%;display:inline-block}
.sev.crit i{background:var(--neg)}.sev.watch i{background:var(--warn)}.sev.opp i{background:var(--accent)}
.sev:hover{color:var(--ink);border-color:var(--rule)}
.sev.off{opacity:.35}
.finds{display:flex;flex-direction:column;border-top:1px solid var(--rule)}
.find{
  display:grid;grid-template-columns:22px 150px 1fr auto 28px;gap:0 14px;align-items:center;
  padding:12px 6px 12px 0;border-bottom:1px solid var(--rule-soft);text-decoration:none;color:inherit;
  transition:background .15s,opacity .35s,transform .35s;border-radius:0 6px 6px 0;
}
.find:hover{background:var(--surface);color:inherit}
.find.gone{opacity:0;transform:translateX(40px);pointer-events:none;max-height:0;padding:0;overflow:hidden;border:none}
.find .mark{width:8px;height:8px;border-radius:50%;justify-self:center;transition:transform .2s cubic-bezier(.34,1.56,.64,1);cursor:pointer;position:relative}
.find .mark::after{content:"";position:absolute;inset:-8px;border-radius:50%}
.find:hover .mark{transform:scale(1.6)}
.find .mark:hover{transform:scale(2.2)}
.find.crit .mark{background:var(--neg)}.find.watch .mark{background:var(--warn)}.find.opp .mark{background:var(--accent)}
.find .site{display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--ink-2);white-space:nowrap;overflow:hidden}
.hood{
  display:inline-grid;place-items:center;min-width:24px;height:20px;padding:0 4px;border-radius:4px;
  background:var(--raised);border:1px solid var(--rule);font:600 10px/1 "IBM Plex Mono",monospace;
  letter-spacing:.06em;color:var(--ink-2);flex:none;
}
.find .what{font-weight:600;font-size:14px;color:var(--ink)}
.find .more{
  grid-column:3/5;max-height:0;overflow:hidden;opacity:0;font-size:12.5px;color:var(--ink-2);
  transition:max-height .28s ease,opacity .2s,margin .28s;margin:0;
}
.find:hover .more{max-height:60px;opacity:1;margin-top:4px}
.find .amt{font-family:"IBM Plex Mono",monospace;font-size:13.5px;text-align:right;white-space:nowrap}
.find .amt small{display:block;font-size:10.5px;color:var(--ink-3);letter-spacing:.04em}
.find .go{color:var(--ink-3);display:grid;place-items:center;transition:transform .2s,color .15s}
.find .go svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.find:hover .go{color:var(--accent);transform:translateX(3px)}
.find.hide{display:none}
.silenced{margin:12px 0 0;font-size:12.5px;color:var(--ink-3);display:none}
.silenced.on{display:block}

/* next moves: things the board cannot do yet ------------------------------ */
.moves{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;perspective:900px}
.move{
  position:relative;padding:20px 20px 18px;border-radius:12px;background:var(--surface);border:1px solid var(--rule-soft);
  text-decoration:none;color:inherit;display:flex;flex-direction:column;gap:10px;
  transform:rotateX(var(--rx,0)) rotateY(var(--ry,0));transition:transform .12s ease-out,border-color .2s;transform-style:preserve-3d;
}
.move:hover{border-color:var(--rule);color:inherit}
.move .ic{
  width:40px;height:40px;border-radius:10px;background:var(--raised);display:grid;place-items:center;color:var(--accent);
  transform:translateZ(24px);transition:transform .2s;
}
.move .ic svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.move b{font-size:15px;font-weight:600;transform:translateZ(16px)}
.move span{font-size:12.5px;color:var(--ink-2);transform:translateZ(10px)}
.move .soon{position:absolute;top:16px;right:16px;font:500 10px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;color:var(--ink-3);border:1px dashed var(--rule);padding:4px 6px;border-radius:4px}
.move:hover .soon{color:var(--accent);border-color:var(--accent)}

/* tables ----------------------------------------------------------------- */
table{width:100%;border-collapse:collapse;font-size:13.5px}
th,td{padding:10px 12px;text-align:right;white-space:nowrap;border-bottom:1px solid var(--rule-soft)}
th:first-child,td:first-child,.l{text-align:left}
thead th{font:500 10.5px/1.4 "IBM Plex Mono",monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3);border-bottom:1px solid var(--rule)}
tbody tr{transition:background .12s}
tbody tr:hover{background:var(--surface)}
tbody td{font-family:"IBM Plex Mono",monospace}
tbody td.l{font-family:Archivo,sans-serif}
tfoot td{font-family:"IBM Plex Mono",monospace;font-weight:600;border-top:1px solid var(--ink);border-bottom:none}
.sub{display:block;font-size:11.5px;color:var(--ink-3);font-weight:400;font-family:Archivo,sans-serif}
.chev{display:inline-block;width:16px;vertical-align:-1px;color:var(--ink-3);transition:transform .25s cubic-bezier(.34,1.56,.64,1)}
tr.chain{cursor:pointer}
tr.chain:hover .chev{transform:translateX(2px)}
tr.chain.open .chev{transform:rotate(90deg)}
tr.kid{display:none}
tr.kid.show{display:table-row;animation:rowin .3s ease}
@keyframes rowin{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
tr.kid td:first-child{padding-left:42px}
tr.bump td{animation:bump .6s ease}
@keyframes bump{0%{background:var(--accent-soft)}100%{background:transparent}}
.grp td{background:var(--raised);font-family:"IBM Plex Mono",monospace;font-size:11px;letter-spacing:.06em;color:var(--ink-2);padding:7px 12px}
.bar{display:inline-block;vertical-align:middle;width:64px;height:4px;border-radius:3px;background:var(--rule);overflow:hidden;margin-right:8px}
.bar i{display:block;height:100%;background:var(--accent);transform-origin:left;transition:transform .35s cubic-bezier(.2,.7,.2,1)}
tr:hover .bar i{transform:scaleX(1.04)}
.set{color:var(--accent);font-weight:600}
.up{display:inline-flex;align-items:center;gap:3px;color:var(--warn);font-size:11px;margin-left:6px;cursor:pointer;padding:2px 6px;border-radius:4px;border:1px solid transparent;transition:all .15s}
.up:hover{border-color:var(--warn)}
.up svg{width:11px;height:11px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round}
.up.done{color:var(--accent);border-color:transparent}
.check{display:inline-grid;place-items:center;width:18px;height:18px;border-radius:50%;background:var(--accent-soft);color:var(--accent)}
.check svg{width:11px;height:11px;stroke:currentColor;fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
td.gauge{position:relative}
td.gauge i{position:absolute;left:12px;right:12px;bottom:6px;height:2px;background:var(--rule);border-radius:2px;overflow:hidden}
td.gauge i b{display:block;height:100%;background:var(--accent);width:var(--w,0);transition:width .5s cubic-bezier(.2,.7,.2,1)}
td.gauge.low i b{background:var(--neg)}

/* charts ----------------------------------------------------------------- */
.chartbox{position:relative;border-radius:10px;background:var(--surface);border:1px solid var(--rule-soft);padding:14px 20px 12px}
.readout{display:flex;justify-content:flex-end;align-items:center;gap:14px;min-height:22px;margin-bottom:6px;font:500 12px/1 "IBM Plex Mono",monospace;color:var(--ink-2)}
.readout b{color:var(--ink);font-weight:500}
.readout i{width:5px;height:5px;border-radius:50%;background:var(--accent);display:inline-block;margin-right:6px;vertical-align:1px}
.legend{display:flex;gap:8px;margin-top:10px}
.legend a{display:inline-flex;align-items:center;gap:7px;padding:4px 9px;border-radius:5px;font-size:12px;color:var(--ink-2);text-decoration:none;border:1px solid transparent;transition:all .15s;cursor:pointer}
.legend a i{width:12px;height:3px;border-radius:2px;background:var(--ink-3);transition:transform .2s}
.legend a.on{color:var(--ink);border-color:var(--rule)}
.legend a:hover{color:var(--ink)}
.legend a:hover i{transform:scaleX(1.4)}
.xh{opacity:0;transition:opacity .12s}
.chartbox:hover .xh{opacity:1}
g[data-series]{transition:opacity .25s}
g[data-series].off{opacity:0}
.chart rect{transition:opacity .15s}
.chart rect:hover{opacity:1}
.week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:10px;align-items:end;height:170px;padding-top:30px}
.wd{display:flex;flex-direction:column;align-items:center;gap:8px;height:100%;justify-content:flex-end}
.wd .track{position:relative;width:100%;flex:1;display:flex;align-items:center}
.wd .track::before{content:"";position:absolute;left:0;right:0;top:50%;height:1px;background:var(--rule)}
.wd .bar2{
  position:absolute;left:18%;right:18%;border-radius:4px;background:var(--accent);
  transform-origin:center;transition:transform .3s cubic-bezier(.34,1.56,.64,1),filter .2s;
}
.wd .bar2.down{background:var(--warn)}
.wd:hover .bar2{transform:scaleX(1.18);filter:brightness(1.15)}
.wd .n{
  position:absolute;left:50%;transform:translate(-50%,4px);padding:3px 7px;border-radius:4px;
  background:var(--ink);color:var(--ground);font:600 11px/1 "IBM Plex Mono",monospace;
  opacity:0;transition:opacity .15s,transform .2s cubic-bezier(.34,1.56,.64,1);pointer-events:none;white-space:nowrap;
}
.wd:hover .n{opacity:1;transform:translate(-50%,0)}
.wd .d{font:500 10px/1 "IBM Plex Mono",monospace;letter-spacing:.1em;color:var(--ink-3)}
.wd .d b{display:none;font-weight:500}
.wd:hover .d span{display:none}.wd:hover .d b{display:inline}
.wd.now .d{color:var(--ink)}
.wd.now .track{outline:1px dashed var(--rule);outline-offset:4px;border-radius:6px}

/* heat grid --------------------------------------------------------------- */
.heat{display:grid;grid-template-columns:200px repeat(7,minmax(0,1fr));gap:4px;align-items:center}
.heat .h{font:500 10px/1.3 "IBM Plex Mono",monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);text-align:center;padding-bottom:6px;transition:color .15s}
.heat .h.hl{color:var(--ink)}
.heat .r{font-size:13px;font-weight:500;padding-right:12px;transition:color .15s}
.heat .r.hl{color:var(--accent)}
.heat .r small{display:block;font-size:11px;color:var(--ink-3);font-weight:400}
.cell{
  position:relative;height:44px;border-radius:6px;display:grid;place-items:center;cursor:pointer;
  font:500 12px/1 "IBM Plex Mono",monospace;color:var(--ink);
  transition:transform .18s cubic-bezier(.34,1.56,.64,1),box-shadow .18s,outline-color .15s,filter .15s;
}
.cell.hl{filter:brightness(1.18)}
.cell:hover{transform:scale(1.12);box-shadow:0 8px 24px #0006;z-index:3}
.cell.picked{outline:2px solid var(--ink);outline-offset:-2px}
.cell .rv2{position:absolute;right:6px;bottom:5px;display:flex;gap:2px}
.cell .rv2 i{width:3px;height:3px;border-radius:50%;background:var(--ink);opacity:.5}
.cell.mine{outline:1.5px solid var(--accent);outline-offset:-1.5px}
.celldetail{margin-top:14px;min-height:22px;font-size:13px;color:var(--ink-2)}
.celldetail b{color:var(--ink);font-weight:600}
.celldetail .link{margin-left:10px}

/* waves ------------------------------------------------------------------ */
.waves{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:22px}
.wave{
  display:inline-flex;align-items:center;gap:8px;padding:7px 11px;border-radius:7px;border:1px solid var(--rule);
  font-size:12.5px;color:var(--ink-2);text-decoration:none;background:var(--surface);transition:border-color .15s,color .15s,transform .2s;
}
.wave:hover{color:var(--ink);border-color:var(--ink-3);transform:translateY(-2px)}
.wave b{color:var(--ink);font-weight:600}
.wave .t{font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.06em;color:var(--ink-3)}
.wave svg{width:12px;height:12px;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;fill:none;transition:transform .3s}
.wave.up svg{stroke:var(--accent)}.wave.dn svg{stroke:var(--neg)}
.wave:hover svg{transform:translateY(-2px) scale(1.2)}
.wave.dn:hover svg{transform:translateY(2px) scale(1.2)}

/* plan a chain ------------------------------------------------------------ */
.plan{display:grid;grid-template-columns:300px 1fr;gap:32px;align-items:start}
.field{display:flex;flex-direction:column;gap:8px;margin-bottom:22px}
.field label{font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}
.field select{font:inherit;font-size:13.5px;color:var(--ink);background:var(--surface);border:1px solid var(--rule);border-radius:7px;padding:8px 10px}
.field input[type=range]{width:100%;accent-color:var(--accent)}
.field output{font-family:"IBM Plex Mono",monospace;font-size:13px;color:var(--ink)}
.machines{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 14px}
.machines i{width:22px;height:22px;border-radius:5px;background:var(--rule);transition:background .25s,transform .25s cubic-bezier(.34,1.56,.64,1)}
.machines i.on{background:var(--accent);transform:scale(1)}
.machines i.new{animation:pop .35s cubic-bezier(.34,1.56,.64,1)}
@keyframes pop{from{transform:scale(.3)}to{transform:scale(1)}}
.shops{display:flex;flex-wrap:wrap;gap:5px;margin:6px 0 14px}
.shops i{width:12px;height:12px;border-radius:3px;background:var(--rule);transition:background .2s}
.shops i.on{background:var(--ink-2)}
.planstats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-bottom:18px}
.planstat{padding:14px 16px;border-radius:10px;background:var(--surface);border:1px solid var(--rule-soft)}
.planstat .lab{font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}
.planstat .v{font-family:"IBM Plex Mono",monospace;font-size:24px;font-weight:500;margin-top:8px;letter-spacing:-.02em}
.planstat .v small{font-size:12px;color:var(--ink-3);margin-left:4px;letter-spacing:0}

.step{display:inline-flex;align-items:center;gap:6px}
.step a{width:24px;height:24px;border-radius:6px;border:1px solid var(--rule);display:grid;place-items:center;color:var(--ink-2);text-decoration:none;font:500 14px/1 "IBM Plex Mono",monospace;transition:all .15s}
.step a:hover{color:var(--ink);border-color:var(--ink-3);transform:scale(1.1)}
.step b{font:600 14px/1 "IBM Plex Mono",monospace;min-width:14px;text-align:center}
.step .machines{margin:0 0 0 8px;gap:4px}
.step .machines i{width:14px;height:14px;border-radius:3px}
td .ing{font-size:12px;color:var(--ink-2);white-space:normal;font-family:Archivo,sans-serif}
td .ing b{font-family:"IBM Plex Mono",monospace;font-weight:500;color:var(--ink)}
.planline{margin:14px 0 0;font-size:13.5px;color:var(--ink-2)}
.planline b{color:var(--ink);font-family:"IBM Plex Mono",monospace;font-weight:500}

/* flow map ---------------------------------------------------------------- */
.flow .node rect{fill:var(--surface);stroke:var(--rule);transition:stroke .15s,transform .2s}
.flow .node{cursor:pointer}
.flow .node:hover rect{stroke:var(--ink-3)}
.flow .node.on rect{stroke:var(--accent);stroke-width:1.5}
.flow .node.faded{opacity:.35}
.flow .node text{font:500 11.5px Archivo,sans-serif;fill:var(--ink)}
.flow .node text.s{font:400 10px "IBM Plex Mono",monospace;fill:var(--ink-3)}
.flow .pipe{fill:none;stroke:var(--ink-3);stroke-opacity:.45;stroke-linecap:round;transition:stroke-opacity .2s,stroke .2s}
.flow .pipe.weekly{stroke-dasharray:6 7}
.flow .pipe:hover,.flow .pipe.lit{stroke:var(--accent);stroke-opacity:1;animation:flowdash .9s linear infinite}
.flow .pipe.daily:hover,.flow .pipe.daily.lit{stroke-dasharray:1 9;stroke-width:3}
.flow .pipe.dim{stroke-opacity:.12}
@keyframes flowdash{to{stroke-dashoffset:-26}}
.flow .cargo{fill:var(--accent);display:none}
.flow .cargo.go{display:block}
.flow .col{font:500 10px "IBM Plex Mono",monospace;letter-spacing:.14em;fill:var(--ink-3)}
.flow .warnd{fill:var(--warn)}.flow .badd{fill:var(--neg)}

/* site detail -------------------------------------------------------------- */
.sitehead{display:flex;align-items:center;gap:16px;margin-top:32px}
.bullet{width:40px;height:40px;border-radius:50%;background:var(--accent);color:#fff;display:grid;place-items:center;font:600 12px/1 "IBM Plex Mono",monospace;transition:transform .3s cubic-bezier(.34,1.56,.64,1)}
.sitehead:hover .bullet{transform:rotate(-12deg) scale(1.08)}
.sitehead h2{margin:0;font-size:22px;font-weight:600;letter-spacing:-.02em}
.sitehead .sub{font-size:13px}
.sstats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-top:22px}
.sstat{padding:14px 16px;border-radius:10px;background:var(--surface);border:1px solid var(--rule-soft)}
.sstat .lab{font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}
.sstat .v{font-family:"IBM Plex Mono",monospace;font-size:22px;font-weight:500;margin-top:8px;letter-spacing:-.02em}
.hours{display:grid;grid-template-columns:40px repeat(24,minmax(0,1fr));gap:3px;align-items:center}
.hours .hh{font:500 9px/1 "IBM Plex Mono",monospace;color:var(--ink-3);text-align:center;padding-bottom:4px}
.hours .dd{font:500 10px/1 "IBM Plex Mono",monospace;letter-spacing:.1em;color:var(--ink-3)}
.hours .dd.now{color:var(--ink)}
.hc{height:20px;border-radius:3px;background:var(--raised);cursor:pointer;transition:transform .15s cubic-bezier(.34,1.56,.64,1),box-shadow .15s}
.hc:hover{transform:scale(1.3);box-shadow:0 4px 14px #0007;z-index:2;position:relative}
.hc.cap{box-shadow:inset 0 0 0 1.5px var(--neg)}
.hc.cap:hover{box-shadow:inset 0 0 0 1.5px var(--neg),0 4px 14px #0007}
.hourread{min-height:22px;margin-top:12px;font:500 12px/1 "IBM Plex Mono",monospace;color:var(--ink-2)}
.hourread b{color:var(--ink);font-weight:500}
.crew{display:flex;flex-wrap:wrap;gap:8px}
.person{display:inline-flex;align-items:center;gap:8px;padding:6px 10px 6px 6px;border-radius:20px;background:var(--surface);border:1px solid var(--rule-soft);font-size:12.5px;transition:transform .2s}
.person:hover{transform:translateY(-2px)}
.person i{width:22px;height:22px;border-radius:50%;background:var(--raised);display:grid;place-items:center;font:600 9px/1 "IBM Plex Mono",monospace;color:var(--ink-2)}
.person small{color:var(--ink-3)}
.person.off{opacity:.5}
.person.off i{background:#ff625733}
.duo{display:grid;grid-template-columns:1fr 1fr;gap:32px;align-items:start}

/* kinds popover ------------------------------------------------------------ */
.pop{width:520px;margin:40px auto;padding:20px 22px;border-radius:12px;background:var(--surface);border:1px solid var(--rule);box-shadow:0 20px 60px #0008}
.pop h3{margin:0 0 4px;font-size:15px;font-weight:600}
.pop p{margin:0 0 14px;color:var(--ink-3);font-size:12.5px}
.kind{display:grid;grid-template-columns:1fr auto auto;gap:14px;align-items:center;padding:10px 0;border-bottom:1px solid var(--rule-soft)}
.kind:last-of-type{border-bottom:none}
.kind b{font-weight:500;font-size:13.5px}
.kind small{display:block;color:var(--ink-3);font-size:11.5px}
.kind .c{font:500 11px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.sw{width:34px;height:20px;border-radius:10px;background:var(--rule);position:relative;cursor:pointer;transition:background .2s}
.sw::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--ink);transition:transform .25s cubic-bezier(.34,1.56,.64,1)}
.sw.on{background:var(--accent)}
.sw.on::after{transform:translateX(14px);background:#fff}
.pop .foot2{display:flex;justify-content:space-between;align-items:center;margin-top:14px}
.btn2{display:inline-flex;align-items:center;gap:7px;padding:7px 12px;border-radius:7px;border:1px solid var(--rule);background:var(--surface);color:var(--ink);font-size:12.5px;font-weight:500;text-decoration:none;cursor:pointer;transition:border-color .15s,transform .15s}
.btn2:hover{border-color:var(--ink-3);transform:translateY(-1px);color:var(--ink)}
.btn2 svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.btn2.primary{background:var(--ink);color:var(--ground);border-color:var(--ink)}
.btn2.primary:hover{color:var(--ground)}
.btn2[aria-disabled="true"]{opacity:.4;pointer-events:none}
/* On the artboard the panel is the whole page, centred in it. Here it is a
   popover hung off the tune button, so the id carries what the artboard did
   not need: where it sits, and how it arrives. The board has 26 kinds against
   the artboard's eight, so the rows scroll inside it and the title, the note
   and the foot stay put. */
#alertPop{
  position:fixed;left:0;top:0;margin:0;z-index:60;max-width:calc(100vw - 24px);
  opacity:0;visibility:hidden;transform:translateY(-6px);transform-origin:100% 0;
  transition:opacity .16s ease,transform .16s cubic-bezier(.2,.7,.2,1),visibility .16s;
}
#alertPop.on{opacity:1;visibility:visible;transform:none}
#alertPop .kinds{max-height:min(52vh,430px);overflow-y:auto;overscroll-behavior:contain}
#alertPop .kind:last-child{border-bottom:none}
#alertPop .foot2{border-top:1px solid var(--rule-soft);margin-top:0;padding-top:14px}
.sw:focus-visible{outline:2px solid var(--accent);outline-offset:3px}

/* company ------------------------------------------------------------------ */
.roles{display:flex;flex-direction:column;gap:8px}
.role{display:grid;grid-template-columns:130px 1fr 44px;gap:12px;align-items:center;font-size:13px}
.role .tr{height:8px;border-radius:4px;background:var(--rule-soft);overflow:hidden}
.role .tr i{display:block;height:100%;background:var(--ink-2);border-radius:4px;transform-origin:left;transition:background .2s,transform .3s cubic-bezier(.2,.7,.2,1)}
.role:hover .tr i{background:var(--accent);transform:scaleX(1.03)}
.role .c{font:500 12px "IBM Plex Mono",monospace;color:var(--ink-2);text-align:right}
.role .c b{display:none;font-weight:500;color:var(--ink)}
.role:hover .c span{display:none}.role:hover .c b{display:inline}
.miles{display:flex;flex-direction:column;gap:2px}
.mile{display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--rule-soft);font-size:13.5px}
.mile .box{width:18px;height:18px;border-radius:5px;border:1.5px solid var(--rule);display:grid;place-items:center;color:var(--ground);transition:all .25s cubic-bezier(.34,1.56,.64,1)}
.mile .box svg{width:11px;height:11px;stroke:currentColor;fill:none;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}
.mile.done .box{background:var(--accent);border-color:var(--accent)}
.mile .c{margin-left:auto;font:500 12px "IBM Plex Mono",monospace;color:var(--ink-3)}
.rules{display:flex;flex-wrap:wrap;gap:6px;margin-top:14px}
.rules span{padding:3px 8px;border-radius:4px;background:var(--raised);font:500 11px "IBM Plex Mono",monospace;color:var(--ink-2);cursor:help}
.rules span b{color:var(--ink);font-weight:600;margin-left:4px}

/* the sphere: the dot grown up. It rolls out of the wordmark onto the masthead
   rule and sits there; it watches the pointer, squishes when clicked and rolls
   along its shelf as the page scrolls ---------------------------------------- */
.orb{position:absolute;left:0;top:0;width:100px;height:100px;z-index:6;cursor:pointer;will-change:transform;opacity:0}
.orb.live{opacity:1}
.orb i{
  display:block;width:100%;height:100%;border-radius:50%;
  background:radial-gradient(circle at var(--hx,32%) var(--hy,30%),#d9ffe8 0%,#7fe3a8 14%,var(--accent) 38%,#146b3c 78%,#0b3d23 100%);
  box-shadow:0 18px 40px #43c07a3d,inset -14px -20px 34px #00000066,inset 6px 8px 18px #ffffff22;
}
.orb u{
  position:absolute;inset:0;border-radius:50%;pointer-events:none;
  background:radial-gradient(circle at 72% 28%,#0003 0 4.5%,transparent 5.5%),radial-gradient(circle at 26% 62%,#0003 0 3.5%,transparent 4.5%),radial-gradient(circle at 62% 80%,#0002 0 3%,transparent 4%),radial-gradient(circle at 40% 22%,#0002 0 2%,transparent 3%);
}
.orb .squish{animation:squish .7s cubic-bezier(.34,1.56,.64,1)}
@keyframes squish{0%{scale:1 1}25%{scale:1.28 .74}50%{scale:.86 1.18}75%{scale:1.06 .95}100%{scale:1 1}}
.orb::after{content:"";position:absolute;left:14%;right:14%;bottom:-9px;height:14px;border-radius:50%;background:#000;opacity:.45;filter:blur(6px);z-index:-1}
.ring{position:absolute;border-radius:50%;border:2px solid var(--accent);pointer-events:none;animation:ring .8s ease-out forwards;z-index:0}
@keyframes ring{from{transform:scale(.6);opacity:.8}to{transform:scale(1.6);opacity:0}}

/* footer ------------------------------------------------------------------- */
.foot{margin-top:64px;padding-top:16px;border-top:1px solid var(--rule);display:flex;gap:22px;font:400 11px/1 "IBM Plex Mono",monospace;letter-spacing:.06em;color:var(--ink-3);text-transform:uppercase}
.foot span:last-child{margin-left:auto}
#footerLinks{display:flex;gap:14px;align-items:center;text-transform:none}
#footerLinks:empty{display:none}

/* The web shell hides .wrap until a save is loaded; the source strip it fills
   sits under the masthead and takes no room while empty. */
.source-row:empty, .source-note:empty{display:none}

@media (prefers-reduced-motion:reduce){
  *{transition:none!important; animation:none!important}
  .rv{opacity:1; transform:none}
}
</style>
<!--__BANNER__-->
<div class="wrap">
  <header class="mast" id="mast">
    <div class="brand" id="brand"><span class="wordmark" id="title"></span><span class="dot" id="dot"></span></div>
    <nav class="nav" id="nav" aria-label="Board pages"></nav>
    <div class="clock tr" id="clock" tabindex="0"
      data-tip="Game time when the save was written. Day 1 was a Monday."></div>
    <div class="orb" id="orb" aria-hidden="true"><i></i><u></u></div>
  </header>
  <!-- A host page (the in-browser board) fills these with its source controls;
       the local server page leaves them empty and they take no room. -->
  <div class="source-row" id="sourceRow"></div>
  <div class="source-note" id="sourceNote"></div>

  <div class="page" id="pageToday">
    <div class="kpis" id="kpis"></div>

    <section class="sec rv" id="alertSection">
      <!-- drawAlerts() fills the head (title, ? mark, the three severity
           counters) around this tune button, which is bound once at boot and
           is moved into each fresh head rather than rebuilt. -->
      <div id="alertHead">
        <span class="ibtn tr" id="alertKindsToggle" aria-pressed="false" tabindex="0"
          data-tip="Which kinds of finding make the list"><svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"></path><circle cx="16" cy="7" r="2"></circle><circle cx="10" cy="17" r="2"></circle></svg></span>
      </div>
      <div class="finds" id="alerts"></div>
      <p class="silenced" id="silenced"><b></b> · <a class="link" href="#">undo</a></p>
      <p class="quiet" id="alertMinor" style="margin:12px 0 0"></p>
      <div class="finds" id="minorList" style="margin-top:12px" hidden></div>
    </section>

    <!-- Next moves: things the board could do that it cannot do yet. Static
         placeholders that link nowhere; the cards tilt from wireCards(). -->
    <section class="sec rv" id="secMoves">
      <div class="sechead"><h2>Next moves</h2>
        <span class="why" data-tip="Things the board could do for you that it cannot do yet. Each one is a decision you make every week by hand today." tabindex="0"><i>?</i></span></div>
      <div class="moves">
        <a class="move rv" href="#"><span class="soon">SOON</span><span class="ic"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M3 10h18M8 3v4M16 3v4M8 14h3M13 14h3M8 18h3"></path></svg></span><b>Plan imports</b><span>Size next week's orders from the peak day, then set every manager in one pass.</span></a>
        <a class="move rv" href="#"><span class="soon">SOON</span><span class="ic"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"></circle><path d="M2.5 20a6.5 6.5 0 0 1 13 0"></path><circle cx="17" cy="9" r="2.5"></circle><path d="M15.5 14.5a5 5 0 0 1 6 5"></path></svg></span><b>Optimize staffing</b><span>Shifts from the hour grid: registers, door caps and who is off today.</span></a>
        <a class="move rv" href="#"><span class="soon">SOON</span><span class="ic"><svg viewBox="0 0 24 24"><path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"></path><circle cx="12" cy="10" r="2.2"></circle></svg></span><b>Find a location</b><span>Free buildings ranked by demand, rivals and the door cap you would get.</span></a>
      </div>
    </section>
  </div>

  <div class="page" id="pageResults" hidden>
    <section class="sec rv" id="secDaily">
      <div id="dailyHead"></div>
      <div id="dailyBox"></div>
    </section>

    <section class="sec rv" id="secRhythm">
      <div id="rhythmHead"></div>
      <div id="rhythmChart"></div>
      <div id="rhythmSitesBox" style="margin-top:20px" hidden><table id="rhythmSites"></table></div>
    </section>

    <section class="sec rv" id="secPortfolio">
      <div id="portHead"></div>
      <div style="overflow-x:auto"><table id="portfolio"></table></div>
    </section>

    <section class="sec rv" id="secDetail" hidden><div id="sitePanel"></div></section>
  </div>

  <div class="page" id="pageSupply" hidden>
    <div class="sechead subhead"><nav class="seg" id="supplyNav" aria-label="Supply views"></nav></div>

    <section class="sec rv" id="secLogistics" data-sub="orders">
      <div class="scrollx" id="importPlan"></div>
      <div class="sec scrollx" id="topupPlan"></div>
    </section>

    <section class="sec rv" id="secStock" data-sub="checks">
      <div id="stockHead"></div>
      <p class="quiet" id="stockVerdict" style="margin:0 0 14px"></p>
      <div class="scrollx"><table id="stock"></table></div>
      <p class="quiet" id="stockMore" style="margin:12px 0 0"></p>
    </section>

    <section class="sec rv" id="secFlow" data-sub="map">
      <div class="sechead"><h2>How goods move</h2><span class="why" tabindex="0" data-tip="Solid pipes are daily distribution, dashed ones weekly imports, a red one a paused import; width is volume. Hover a pipe and its cargo moves. Click a site to keep only its pipes lit and to see what it holds below. An amber dot is an order running tight or a holding below what its week needs, a red one an order too small."><i>?</i></span></div>
      <div class="chartbox" style="padding:18px 24px 24px"><svg class="flow" id="flow"></svg></div>
      <div class="sec" id="flowDetail"></div>
    </section>
  </div>

  <div class="page" id="pageGrowth" hidden>
    <div class="sechead subhead"><nav class="seg" id="growthNav" aria-label="Growth views"></nav></div>

    <section class="sec rv" id="secMarket" data-sub="market">
      <div class="sechead"><h2>Market demand</h2>
        <span class="why" id="marketWhy" data-tip="" tabindex="0"><i>?</i></span>
        <span class="quiet" id="marketNote"></span>
        <div class="aside"><span class="seg" id="marketTools" aria-label="Market views"></span></div></div>
      <div class="waves" id="movers"></div>
      <div class="heat" id="market"></div>
      <p class="celldetail" id="cellDetail">Click a cell</p>
    </section>

    <section class="sec rv" id="secPlan" data-sub="plan">
      <div class="sechead"><h2>Plan a chain</h2>
        <span class="why" data-tip="Every machine runs 24 hours at its rated rate, so a line makes its full quantity whether or not the shelves need it. Build the factory first; the shops come after, and what they do not take is exported. Step a single line up when one product deserves more, down to none to buy it in instead." tabindex="0"><i>?</i></span>
        <span class="quiet" id="planNote"></span>
        <div class="aside" id="planPicker"></div></div>
      <div id="planBody"></div>
    </section>
    <section class="sec rv" id="secIngredients" data-sub="plan">
      <div class="sechead"><h2>Ingredients</h2>
        <span class="why" data-tip="What the machines above eat, added up across every line that shares an ingredient. The order is the weekly figure rounded up to the hundred, the way the logistics manager takes it. Hover an ingredient for what is on order today." tabindex="0"><i>?</i></span></div>
      <table>
        <thead><tr><th>Ingredient</th><th class="l">Used by</th><th>Per day</th><th>Per week</th><th>Weekly order</th></tr></thead>
        <tbody id="ingBody"></tbody>
      </table>
    </section>
  </div>

  <!-- The reference page: the product table full width, then payroll beside the
       milestones. Each section's head and body are drawn by its own draw*(). -->
  <div class="page" id="pageCompany" hidden>
    <section class="sec rv" id="secProducts"></section>
    <div class="duo sec">
      <section class="rv" style="margin:0" id="secPayroll"></section>
      <section class="rv" style="margin:0" id="secGoals"></section>
    </div>
  </div>

  <footer class="foot" id="footer">
    <span>Big Copilot</span>
    <span id="footFile"></span>
    <!-- a host page may put its own links here; empty on the local page -->
    <span id="footerLinks"></span>
    <span id="footBuild"></span>
  </footer>
</div>
<!--__BEFORE_SCRIPT__-->
<script>
let D = /*__DATA__*/null;
const LIVE = /*__LIVE__*/false;
/* Where fresh numbers come from. By default the local server that wrote this
   page. A page that embeds the board sets window.LEDGER_SOURCE before this
   script runs, and then the board never touches the network. Either way the
   contract is the same: data() resolves to a fresh data object, name() records
   a factory-line name and resolves to the data that follows, and watch() is
   handed the callbacks changed(data), stale(why) and lost(). */
const SOURCE = window.LEDGER_SOURCE || {
  label: "Live",
  data: async () => (await fetch("data.json", {cache:"no-store"})).json(),
  name: async (rid, slug) => {
    await fetch("name", {method:"POST", headers:{"Content-Type":"application/json"},
                         body: JSON.stringify({rid, slug: slug || null})});
    return SOURCE.data();
  },
  /* The save on disk only changes when the game writes one, so this polls a
     cheap stamp and pulls fresh numbers only when that stamp moves. */
  watch(h){
    let stamp = null, misses = 0;
    const timer = setInterval(async () => {
      try{
        const res = await fetch("stamp", {cache:"no-store"});
        if(!res.ok) throw new Error(res.status);
        const body = await res.json();
        misses = 0;
        h.stale(body.error);
        if(stamp === null){ stamp = body.stamp; return; }
        if(body.stamp === stamp) return;
        stamp = body.stamp;
        h.changed(await SOURCE.data());
      }catch(err){
        if(++misses >= 5){ clearInterval(timer); h.lost(); }
      }
    }, 15000);  // the game writes a save every five minutes; this is plenty
  }
};

const LINE_COLOURS = {MT:"#f07a1f", HK:"#e0362c", MH:"#a83bb0", LM:"#0c5ec4",
                      GD:"#7a8f27", IC:"#5c6f7a", HA:"#0f8f86", "":"#8b9499"};
const fmt = n => (n<0?"-":"") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
const compact = n => {
  const a = Math.abs(n), s = n<0?"-":"";
  if(a>=1e6) return s+"$"+(a/1e6).toFixed(a>=1e7?1:2)+"M";
  if(a>=1e3) return s+"$"+Math.round(a/1e3)+"k";
  return s+"$"+Math.round(a);
};
const el = (t,c,h) => { const e=document.createElement(t); if(c)e.className=c; if(h!==undefined)e.innerHTML=h; return e; };
const sign = n => n>0?"pos":n<0?"neg":"";
const sum = (rows,key) => rows.reduce((a,b)=>a+(b[key]||0),0);
const $ = id => document.getElementById(id);

/* A percentage with the thin gauge under it, the way the design shows shelf
   pressure and depot cover; the cell that holds it carries class "gauge".
   Colour is the grade: accent, amber, red, or the quiet ink for a figure that
   describes rather than grades. */
const graded = (v, fill) => `<i><b style="--w:${Math.min(100, Math.max(v, 1.5))}%${
  fill ? `;background:var(--${fill})` : ""}"></b></i>${Math.round(v)}%`;
/* Graded meter: red through green, for numbers where higher is better. */
const meter = v => graded(v, v >= 85 ? "" : v >= 60 ? "warn" : "neg");
/* Neutral gauge: for numbers that describe a situation rather than grade it,
   like how busy a street is. */
const gauge = v => graded(v, "ink-3");

/* A neighbourhood badge: the player's [XX] prefix, or the canonical code for a
   shop the building table places. With neither, no badge. */
const bullet = b => b.code ? `<span class="bullet" style="background:${LINE_COLOURS[b.code]||LINE_COLOURS[""]}"
  title="${b.neighbourhood||"Unassigned"}">${b.code}</span>` : "";
const siteCell = b => `<div class="site">${bullet(b)}<span><b>${b.name}</b>
  <span class="sub">${b.type} · ${b.address}</span></span></div>`;

/* The tile sparkline, the generator's spark(): an area under the line, the
   line, a point and a read-out that follow the pointer (wireTiles). x runs
   0..100 so the wiring can find the nearest point from the pointer's share of
   the width; the labels are what it prints, one per point, comma-separated,
   so they must not carry commas themselves (compact money does not). */
function sparkHtml(values, labels){
  if(values.length < 2) return "";
  const lo = Math.min(...values), hi = Math.max(...values), span = (hi - lo) || 1;
  const pts = values.map((v, i) => [i / (values.length - 1) * 100, 30 - (v - lo) / span * 26]);
  const poly = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return `<div class="spark" data-vals="${attr(labels.join(","))}">
    <svg viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden="true">
      <polygon class="area" points="0,34 ${poly} 100,34"></polygon>
      <polyline points="${poly}" vector-effect="non-scaling-stroke"></polyline>
      <circle class="pt" r="3" cx="100" cy="${pts[pts.length - 1][1].toFixed(1)}" vector-effect="non-scaling-stroke"></circle>
    </svg><span class="scrub"></span></div>`;
}

/* --- the redesign's shared vocabulary ---------------------------------------
   Icons are inline stroke SVG on a 24 grid, never glyphs. Every view builds
   its section heads, chips, ? marks and segmented controls from these. */
const ICON = {
  today: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"></circle><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"></path></svg>',
  results: '<svg viewBox="0 0 24 24"><path d="M4 19h16"></path><path d="M5 15l4-5 4 3 6-7"></path></svg>',
  supply: '<svg viewBox="0 0 24 24"><path d="M3.5 8.5 12 4l8.5 4.5v8L12 21l-8.5-4.5z"></path><path d="M3.5 8.5 12 13l8.5-4.5M12 13v8"></path></svg>',
  growth: '<svg viewBox="0 0 24 24"><path d="M4 18 10 12l4 4 6-7"></path><path d="M15 9h5v5"></path></svg>',
  company: '<svg viewBox="0 0 24 24"><path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16"></path><path d="M14 10h5a1 1 0 0 1 1 1v10M4 21h17M8 8h2M8 12h2M8 16h2M17 14h1M17 18h1"></path></svg>',
  go: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"></path></svg>',
  tune: '<svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"></path><circle cx="16" cy="7" r="2"></circle><circle cx="10" cy="17" r="2"></circle></svg>',
  tick: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"></path></svg>',
  arrow_up: '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"></path></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>',
  trend_up: '<svg viewBox="0 0 24 24"><path d="M4 17l6-6 4 4 6-7"></path></svg>',
  trend_dn: '<svg viewBox="0 0 24 24"><path d="M4 7l6 6 4-4 6 7"></path></svg>',
  chev: '<svg viewBox="0 0 24 24" style="width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><path d="M9 6l6 6-6 6"></path></svg>',
  calendar: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M3 10h18M8 3v4M16 3v4M8 14h3M13 14h3M8 18h3"></path></svg>',
  people: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"></circle><path d="M2.5 20a6.5 6.5 0 0 1 13 0"></path><circle cx="17" cy="9" r="2.5"></circle><path d="M15.5 14.5a5 5 0 0 1 6 5"></path></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"></path><circle cx="12" cy="10" r="2.2"></circle></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"></path></svg>',
  refresh: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.7"></path><path d="M20 4v5h-5"></path></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="1.4"></circle><circle cx="12" cy="12" r="1.4"></circle><circle cx="18" cy="12" r="1.4"></circle></svg>',
};
const icon = name => ICON[name] || "";
/* Text that lands in an attribute (a tooltip, a data-id) is escaped once, here. */
const attr = s => String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
/* A ? mark whose sentence opens beside it; the sentence is the old .head p note. */
const why = text => `<span class="why" data-tip="${attr(text)}" tabindex="0"><i>?</i></span>`;
/* A section head: title, optional ? mark, optional quiet aside text, and the
   right-hand aside (a .seg, a .link, counters). `after` is raw markup that sits
   straight after the title, like the red "7 short" chip on Supply. */
const sechead = (title, o = {}) =>
  `<div class="sechead"><h2>${title}</h2>${o.after || ""}${o.why ? why(o.why) : ""}${
    o.quiet ? `<span class="quiet">${o.quiet}</span>` : ""}${
    o.aside ? `<div class="aside">${o.aside}</div>` : ""}</div>`;
const chipHtml = (kind, text, tip) =>
  `<span class="chip ${kind}"${tip ? ` data-tip="${attr(tip)}"` : ""}>${text}</span>`;
/* The neighbourhood pill: the player's [XX] prefix, or the code the building
   table gives the address. With neither, no pill. */
const hoodHtml = b => b && b.code ? `<span class="hood">${b.code}</span>` : "";
/* $3.57M, $751k, $98: the compact money the tiles and axes use. */
const money = compact;
/* A segmented control, the .seg of the design: options are [id, label] pairs,
   read() gives the current id, write(id) stores it, redraw() repaints the view. */
function seg(host, options, read, write, redraw){
  if(typeof host === "string") host = $(host);
  host.classList.add("seg");
  host.innerHTML = options.map(([id, label]) =>
    `<a href="#" data-id="${attr(id)}" class="${String(id) === String(read()) ? "on" : ""}">${label}</a>`).join("");
  host.onclick = e => {
    const a = e.target.closest("a[data-id]");
    if(!a) return;
    e.preventDefault();
    const opt = options.find(([k]) => String(k) === a.dataset.id);
    if(!opt) return;
    write(opt[0]);
    [...host.children].forEach(c => c.classList.toggle("on", c === a));
    redraw();
  };
}

/* View state lives out here so a live refresh redraws the numbers without
   resetting whichever tab, filter or sort order the reader had chosen. */
let chartWindow=30, shown=new Set(["profit7","profit"]);
let view="pnl", sortKey=null, sortDir=-1, stockView="shops", marketView="types";
/* The demand grid sorts by one neighbourhood at a time; numbers in the cells are
   off until asked for, the shade carries the reading. */
let marketSortHood=null, marketSortDir=-1;
let rhythmView="customers";
/* Everything that is folded away by default, so a refresh does not re-fold what
   the reader has just opened. */
let openChains = new Set(), showMinor = false, showRhythmSites = false;
let showAllStock = false, showAllShelves = false, showRhythmCards = false;
let showAllProducts = false;
/* Which kinds of "Needs attention" finding to show, set by buildAlertSettingsPanel()
   before the first render. */
let alertGroupPrefs = {};
/* No site is open until one is chosen from the portfolio or a finding. The
   roster re-sorts by profit on every refresh, so the open site is held by
   address — an index would silently point at a different shop after an update. */
let siteKey = null, siteTab = -1, siteOpen = false;
let chartRows=[];

/* The five lines of the daily chart. Two are on until the reader says
   otherwise; the choice lives in seriesState across renders. */
const SERIES = {
  avg:     {label:"7-day profit", colour:"var(--accent)", key:"profit7", on:true, width:2},
  net:     {label:"Net profit",   colour:"var(--ink-3)",  key:"profit",  on:true, bars:true},
  revenue: {label:"Revenue",      colour:"var(--info)",   key:"revenue"},
  goods:   {label:"Goods",        colour:"var(--warn)",   key:"cogs"},
  wages:   {label:"Wages",        colour:"var(--ink-2)",  key:"wages", width:1.2, dash:"3 3"},
};
const seriesOn = id => id in seriesState ? !!seriesState[id] : !!SERIES[id].on;

/* Week on week per site, keyed by address so it survives a re-sort. */
const TREND = {};
function indexTrends(){
  for(const k in TREND) delete TREND[k];
  (D.trends||[]).forEach(t => TREND[t.key] = t);
}
const pct = v => `${v>0?"+":""}${(v*100).toFixed(0)}%`;
/* The two weeks behind the percentage sit in its tooltip. */
const wow = (change, last7, prev7, empty) => change === null || change === undefined
  ? `<span class="sub" data-tip="${empty}">—</span>`
  : `<span class="${sign(change)}" data-tip="${compact(last7)} this week against ${compact(prev7)} the week before">${pct(change)}</span>`;
const wowCell = b => {
  const t = TREND[b.key];
  return wow(t && t.ready ? t.change : null, t && t.last7, t && t.prev7, "Needs two full weeks of trading");
};

const VIEWS = {
  pnl: {
    label: "Profit & loss",
    note: "Yesterday's income statement, by chain",
    cols: [
      ["Business", b=>kidCell(b), "l", null],
      ["Revenue", b=>fmt(b.revenue), "", b=>b.revenue],
      ["Wk / wk", b=>wowCell(b), "", b=>(TREND[b.key]||{}).change ?? -999],
      ["Goods", b=>fmt(-b.cogs), "", b=>b.cogs],
      ["Wages", b=>fmt(-b.wages), "", b=>b.wages],
      ["Rent", b=>fmt(-b.rent), "", b=>b.rent],
      ["Marketing", b=>fmt(-b.marketing), "", b=>b.marketing],
      ["Theft", b=>b.theft?fmt(-b.theft):"—", "", b=>b.theft],
      ["Profit", b=>`<span class="${sign(b.profit)}">${fmt(b.profit)}</span>`, "", b=>b.profit],
      ["Margin", b=>b.margin===null?"—":`${b.margin.toFixed(1)}%`, "", b=>b.margin??-999],
    ],
    /* The point of the chain row: revenue, every cost, and the margin the whole
       operation actually runs at. */
    chain: c => [null, fmt(c.revenue),
                 wow(c.change, c.last7, c.prev7, "A site here has under two weeks of trading"),
                 fmt(-c.cogs), fmt(-c.wages), fmt(-c.rent),
                 fmt(-c.marketing), c.theft?fmt(-c.theft):"—",
                 `<b class="${sign(c.profit)}">${fmt(c.profit)}</b>`,
                 c.margin===null?"—":`${c.margin.toFixed(1)}%`],
    total: bs => ["", fmt(sum(bs,"revenue")), "", fmt(-sum(bs,"cogs")), fmt(-sum(bs,"wages")),
                  fmt(-sum(bs,"rent")), fmt(-sum(bs,"marketing")), fmt(-sum(bs,"theft")),
                  `<span class="${sign(sum(bs,"profit"))}">${fmt(sum(bs,"profit"))}</span>`, ""],
  },
  ops: {
    label: "Operations",
    note: "Who shops here, and what pulls them in",
    cols: [
      ["Business", b=>kidCell(b), "l", null],
      ["Opened", b=>`day ${b.opened}`, "", b=>b.opened],
      ["Staff", b=>b.staff||"—", "", b=>b.staff],
      ["Customers", b=>b.customers?b.customers.toLocaleString():"—", "", b=>b.customers],
      ["Spend / visit", b=>b.basket===null?"—":`$${b.basket.toFixed(2)}`, "", b=>b.basket??-1],
      ["Satisfaction", b=>b.satisfaction.overall===null?"—":meter(b.satisfaction.overall), "gauge", b=>b.satisfaction.overall??-1],
      ["Promotion", b=>b.customers?meter(b.promotion):"—", "gauge", b=>b.promotion],
      ["Foot traffic", b=>b.customers?gauge(b.traffic):"—", "gauge", b=>b.traffic],
      ["Marketing", b=>b.customers?meter(b.marketingIndex):"—", "gauge", b=>b.marketingIndex],
      ["Security", b=>b.security?`${b.security}%`:"—", "", b=>b.security],
    ],
    chain: c => [null, "", c.staff||"—", "", "", "", "", "", "", ""],
    total: null,
  },
};

/* --- the weekly cycle ------------------------------------------------- */
const weeksOf = p => p ? Math.min(...p.map(d => d.n)) : 0;

/* Seven columns either side of a midline. Height is distance from a normal
   day in both directions, so a trough reads as clearly as a peak; the figure
   sits in a pill at the bar's tip and shows on hover, the weekday spells
   itself out, and today's column is outlined. */
function weekHtml(profile, todayName){
  const span = Math.max(...profile.map(d => Math.abs(d.index - 100)), 12);
  return `<div class="week">${profile.map(d => {
    const off = d.index - 100, up = off >= 0, side = up ? "bottom" : "top";
    /* 44 px keeps a downward bar's pill clear of the weekday label. */
    const h = Math.max(2, Math.round(Math.min(Math.abs(off) / span, 1) * 44));
    return `<div class="wd${d.day === todayName ? " now" : ""}"><div class="track">
      <i class="bar2${up ? "" : " down"}" style="height:${h}px;${side}:50%"></i>
      <span class="n" style="${side}:calc(50% + ${h + 8}px)">${off > 0 ? "+" : ""}${off} pts</span>
      </div><span class="d"><span>${d.short.toUpperCase()}</span><b>${d.day}</b></span></div>`;
  }).join("")}</div>`;
}
/* The same week at table-row size. */
function miniWeek(profile){
  if(!profile) return `<span class="quiet">not enough history</span>`;
  const span = Math.max(...profile.map(d => Math.abs(d.index - 100)), 12);
  return `<svg viewBox="0 0 140 28" style="width:140px;height:28px" aria-hidden="true">
    <line x1="0" x2="140" y1="14" y2="14" stroke="var(--rule)"/>
    ${profile.map((d, i) => {
      const off = d.index - 100, h = Math.max(1, Math.abs(off) / span * 12);
      return `<rect x="${i * 20 + 4}" y="${(off >= 0 ? 14 - h : 14).toFixed(1)}" width="12" height="${h.toFixed(1)}" rx="1.5"
        fill="${off >= 0 ? "var(--accent)" : "var(--warn)"}"><title>${d.day}: ${d.index}% of a normal day, from ${d.n} weeks</title></rect>`;
    }).join("")}
  </svg>`;
}

const RHYTHM_VIEWS = {
  customers: {label:"Customers", note:"Footfall across every shop"},
  revenue:   {label:"Revenue",   note:"Takings across every site"},
  profit:    {label:"Profit",    note:"Daily profit across every site"},
};
const signedPct = v => `${v > 0 ? "+" : ""}${v}%`;

function drawRhythm(){
  const r = D.rhythm, profile = r[rhythmView], weeks = weeksOf(profile);
  const today = r.today, yest = r.yesterday;
  const swingy = D.businesses.filter(b => b.rhythm).sort((a,z) => z.swing - a.swing);

  /* Nine rows saying the same thing is a sentence, not a table. When most sites
     peak on the same day within a narrow band, say that; the table stays a
     click away for the sites that break the pattern. The sentence, today's and
     yesterday's own weekday reading go behind the ? mark. */
  const byDay = {};
  swingy.forEach(b => (byDay[b.peakDay] = byDay[b.peakDay] || []).push(b));
  const ranked = Object.entries(byDay).sort((a,z) => z[1].length - a[1].length);
  const [topDay, pack] = ranked[0] || ["", []];
  const swings = pack.map(b => b.swing);
  const spread = swings.length ? Math.max(...swings) - Math.min(...swings) : 0;
  const rest = ranked.slice(1);
  const verdict = (pack.length >= 7 && spread <= 15)
    ? `${pack.length} site${pack.length===1?"":"s"} peak ${topDay}, +${Math.min(...swings)} to +${
        Math.max(...swings)} points between their best and worst day. ${rest.length
          ? rest.map(([d,bs]) => `${bs.map(b => shortName(b)).join(", ")} peak${
              bs.length===1?"s":""} ${d}`).join("; ") + "."
          : "Nothing runs the other way."}`
    : swingy.length
      ? `${swingy.length} site${swingy.length===1?"":"s"} clear the noise test.`
      : "No site has enough history to separate a weekly cycle from noise yet.";
  const days = [
    today && today.index ? `Today is ${today.day}, normally ${signedPct(today.index - 100)}.` : "",
    yest && yest.index ? `Yesterday was ${yest.day}, normally ${signedPct(yest.index - 100)}.` : "",
  ].filter(Boolean).join(" ");
  const note = `${RHYTHM_VIEWS[rhythmView].note} against a normal day${
    profile ? `, from ${weeks} week${weeks===1?"":"s"} of history.` : "."}`;

  $("rhythmHead").innerHTML = sechead("Weekly rhythm", {
    why: [note, verdict, days].filter(Boolean).join(" "),
    aside: `<span class="seg" id="rhythmTools"></span>${swingy.length
      ? `<a class="link" href="#" id="rhythmToggle" aria-expanded="${showRhythmSites}">${
          showRhythmSites ? "hide the table" : "site by site"}</a>` : ""}`,
  });
  seg($("rhythmTools"), Object.entries(RHYTHM_VIEWS).map(([id,v]) => [id, v.label]),
    () => rhythmView, v => rhythmView = v, drawRhythm);
  $("rhythmChart").innerHTML = profile
    ? `<div class="chartbox" style="padding-bottom:16px">${weekHtml(profile, today && today.day)}</div>`
    : `<p class="quiet">Not enough history to separate a weekly cycle from noise.</p>`;

  const toggle = $("rhythmToggle");
  if(toggle) toggle.onclick = e => { e.preventDefault(); showRhythmSites = !showRhythmSites; drawRhythm(); };
  $("rhythmSitesBox").hidden = !showRhythmSites || !swingy.length;
  $("rhythmSites").innerHTML = swingy.length ? `
    <thead><tr><th>Business</th><th class="l">Peaks</th><th>Swing</th>
      <th class="l" style="width:38%">Across the week</th></tr></thead>
    <tbody>${swingy.map(b => `<tr data-key="${attr(b.key)}" style="cursor:pointer">
      <td class="l">${siteLabel(b)}</td>
      <td class="l">${b.peakDay}</td>
      <td>${b.swing} pts</td>
      <td class="l">${miniWeek(b.rhythm)}</td></tr>`).join("")}</tbody>` : "";
  $$("#rhythmSites tr[data-key]").forEach(tr => tr.onclick = () => openSite(tr.dataset.key));
  wireTips();
}

/* --- the chain as a picture ------------------------------------------- */
const FLOW_COLS = ["Importers", "Factories", "Depots", "Shops"];
/* The artboard's stage: 180 × 44 boxes in four columns across 1128 units,
   drawn 1:1 inside the chart box. */
const NODE_W = 180, NODE_H = 44, ROW_GAP = 16, COL_GAP = 136;

/* The map is meant to be compact: four columns, a node 180 by 44. A chain of
   a dozen shops fits one column at a tight pitch; past what fits in ~900 px
   the shops interleave into two sub-columns, the second one's rows sitting
   in the gaps of the first, so a pipe to a back-row shop runs straight
   through a gap instead of behind a box. */
const SHOP_GAP = 8, SUB_GAP = 14, MAP_MAX_H = 900;
function flowLayout(){
  const g = D.supply.graph;
  const columns = [[], [], [], []];
  g.nodes.forEach(n => columns[n.col].push(n));
  // Keep each column near the sites it feeds, so the lines stay untangled.
  columns[3].sort((a, b) => b.stock - a.stock);
  const shops = columns[3].length;
  const split = shops * (NODE_H + SHOP_GAP) + 34 > MAP_MAX_H;
  /* Two sub-columns cost width; the columns close up a little to pay for it,
     and the svg scales to its box regardless. */
  const colGap = split ? 90 : COL_GAP;
  const pitch = split ? (NODE_H + 12) / 2 : NODE_H + SHOP_GAP;
  const spanOf = (ci, n) => ci === 3
    ? (split ? (n - 1) * pitch + NODE_H : n * pitch - SHOP_GAP)
    : n * (NODE_H + ROW_GAP) - ROW_GAP;
  const height = Math.max(...columns.map((c, ci) => spanOf(ci, c.length)), 1) + 34 + 8;
  const width = 4 * NODE_W + 3 * colGap + (split ? NODE_W + SUB_GAP : 0);
  const colX = [0, 1, 2, 3].map(ci => ci * (NODE_W + colGap));
  const at = {};
  columns.forEach((col, ci) => {
    const top = (height - 34 - spanOf(ci, col.length)) / 2 + 34;
    col.forEach((n, ri) => {
      const back = split && ci === 3 && ri % 2 === 1;
      at[n.id] = {
        x: colX[ci] + (back ? NODE_W + SUB_GAP : 0),
        y: top + ri * (ci === 3 ? pitch : NODE_H + ROW_GAP),
        /* Where a pipe to a back-row shop straightens out: just before the
           front row, so its last stretch is a level run through the gap. */
        corridor: back ? colX[3] - 10 : null,
        node: n,
      };
    });
  });
  return {at, width, height, columns, colX};
}

function drawFlow(){
  const g = D.supply.graph;
  const {at, width, height, colX} = flowLayout();
  const heaviest = Math.max(...g.links.map(l => l.perDay), 1);
  const named = id => (g.nodes.find(n => n.id === id) || {}).name || id;
  const heads = FLOW_COLS.map((label, i) =>
    `<text class="col" x="${colX[i]}" y="22">${label.toUpperCase()}</text>`);

  /* One pipe per link, with its cargo riding the same path while the pipe is
     hovered. Width is volume on a square-root scale, so the heaviest pipe is
     a few times the thinnest rather than ten. */
  const pipes = [], cargo = [];
  g.links.forEach((l, i) => {
    const a = at[l.from], b = at[l.to];
    if(!a || !b) return;
    const fwd = b.x > a.x;
    const x1 = a.x + (fwd ? NODE_W : 0), y1 = a.y + NODE_H / 2;
    const x2 = b.x + (fwd ? 0 : NODE_W), y2 = b.y + NODE_H / 2;
    /* A back-row shop is reached through the gap in the front row: the curve
       lands in the corridor before it and the rest is a level run. */
    const xc = fwd && b.corridor !== null ? b.corridor : x2;
    const mid = (x1 + xc) / 2;
    const w = 1 + Math.sqrt(l.perDay / heaviest) * 2.5;
    const tip = `${named(l.from)} to ${named(l.to)}: ${l.perDay.toLocaleString()} units a day over ${
      l.items} product${l.items === 1 ? "" : "s"}, ${l.paused ? "import paused"
      : l.cadence === "weekly" ? "weekly import" : "daily distribution"}`;
    pipes.push(`<path class="pipe ${l.cadence}${l.paused ? " paused" : ""}" id="pipe${i}"
      data-a="${attr(l.from)}" data-b="${attr(l.to)}" stroke-width="${w.toFixed(1)}"
      d="M${x1},${y1} C${mid},${y1} ${mid},${y2} ${xc},${y2}${xc !== x2 ? ` L${x2},${y2}` : ""}"><title>${attr(tip)}</title></path>`);
    cargo.push(`<circle class="cargo" data-pipe="pipe${i}" r="3.5"><animateMotion dur="${
      (1.1 + i % 3 * .25).toFixed(2)}s" repeatCount="indefinite"><mpath href="#pipe${i}"></mpath></animateMotion></circle>`);
  });

  /* A site is a box: the hood pill, the name, what it holds. The dot in the
     corner says an order there is too small (red), or running tight, or a
     holding will not reach its week's delivery (amber). */
  const boxes = [], dots = [];
  const plural = (n, w) => `${n} ${w}${n > 1 ? "s" : ""}`;
  Object.values(at).forEach(({x, y, node}) => {
    const hood = node.tag, tx = x + (hood ? 44 : 12);
    const flag = node.short ? ["badd", `${plural(node.short, "order")} too small`]
      : node.tight ? ["warnd", `${plural(node.tight, "order")} running tight`]
      : node.low ? ["warnd", `${plural(node.low, "holding")} below what the week needs`] : null;
    boxes.push(`<g class="node" data-id="${attr(node.id)}">
      <rect x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}" rx="7"></rect>${hood
        ? `<rect x="${x + 10}" y="${y + 13}" width="24" height="18" rx="3" fill="var(--raised)" stroke="var(--rule)"></rect>
           <text x="${x + 22}" y="${y + 26}" text-anchor="middle" class="s" style="font-weight:600;fill:var(--ink-2)">${hood}</text>` : ""}
      <text x="${tx}" y="${y + 19}">${attr(shortText(node.name, hood ? 19 : 24))}</text>
      <text class="s" x="${tx}" y="${y + 34}">${node.stock ? node.stock.toLocaleString() + " held" : attr(node.sub)}</text></g>`);
    if(flag) dots.push(`<circle class="${flag[0]}" cx="${x + NODE_W - 10}" cy="${y + 10}" r="4"><title>${flag[1]}</title></circle>`);
  });

  const svg = $("flow");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.style.width = "100%"; svg.style.height = height + "px";
  svg.innerHTML = heads.concat(pipes, boxes, dots, cargo).join("");
  drawFlowDetail();
}

const shortText = (t, n) => t.replace(/^\[[^\]]*\]\s*/, "").slice(0, n);

function drawFlowDetail(){
  const g = D.supply.graph;
  const node = g.nodes.find(n => n.id === flowPickId);
  const host = $("flowDetail");
  if(!node){
    host.innerHTML = `<p class="quiet" style="margin:0">Pick a site to see what it holds against what it has to cover before its next delivery.</p>`;
    return;
  }
  const named = id => { const n = g.nodes.find(x => x.id === id);
    return n ? `${hoodHtml({code: n.tag})}${n.tag ? "&nbsp; " : ""}${shortText(n.name, 60)}` : id; };
  const inbound = g.links.filter(l => l.to === node.id);
  const outbound = g.links.filter(l => l.from === node.id);
  const pipeTable = (title, links, other, empty) => `<table>
    <thead><tr><th class="l">${title}</th><th>Units / day</th></tr></thead>
    <tbody>${links.length ? links.map(l => `<tr><td class="l">${named(other(l))}${
        l.paused ? ` ${chipHtml("bad", "paused")}` : ""}</td><td>${l.perDay.toLocaleString()}</td></tr>`).join("")
      : `<tr><td class="l quiet" colspan="2">${empty}</td></tr>`}</tbody></table>`;
  const fitCell = i => i.fit === "ok"
    ? (i.low ? chipHtml("warn", "below need", "Holds less than it needs before the next delivery") : chipHtml("ok", "covered"))
    : `${chipHtml(i.fit === "short" ? "bad" : "warn", i.fit === "short" ? "order too small" : "tight")}
       <span class="sub" style="display:inline">a ${i.cadence === "weekly" ? "week" : "day"} takes ${
         i.cycleNeed.toLocaleString()}, ${(i.cycleNeed - i.provision).toLocaleString()} more</span>`;
  const plural = (n, w) => `${n} ${w}${n > 1 ? "s" : ""}`;
  const flags = (node.short ? chipHtml("bad", `${plural(node.short, "order")} too small`) : "")
    + (node.tight ? chipHtml("warn", `${plural(node.tight, "order")} running tight`) : "");
  host.innerHTML = `
    ${sechead(shortText(node.name, 60), {after: hoodHtml({code: node.tag}),
      quiet: `${node.sub}${node.hood ? ` · ${node.hood}` : ""}`,
      aside: `<a class="link" href="#" id="flowClear">clear selection</a>`})}
    <div class="flowpipes">
      ${pipeTable("Comes in from", inbound, l => l.from, "Nothing. This is where goods enter.")}
      ${pipeTable("Goes out to", outbound, l => l.to, "Nothing. This is the end of the line.")}
    </div>
    <div class="sec" style="margin-top:28px">
      ${sechead("Held against need", {after: flags})}
      ${node.items.length ? `<table>
        <thead><tr><th class="l">Product</th><th>On hand</th><th>Needs before next refill</th>
          <th>Refill brings</th><th class="l">Does the order cover a full cycle?</th></tr></thead>
        <tbody>${node.items.map(i => `<tr>
          <td class="l">${i.item}</td>
          <td>${i.stock.toLocaleString()}</td>
          <td>${i.need ? i.need.toLocaleString() : "—"}</td>
          <td>${i.provision ? i.provision.toLocaleString() : "—"}</td>
          <td class="l">${fitCell(i)}</td></tr>`).join("")}</tbody></table>`
      : `<p class="quiet" style="margin:0">Nothing stocked here; it only passes goods along.</p>`}
    </div>`;
  $("flowClear").onclick = e => { e.preventDefault(); flowPickId = null; applyFlow(); drawFlowDetail(); };
}

/* --- supply chain ---------------------------------------------------- */
const SUPPLY_VIEWS = {
  shops: {
    label: "Before the drop",
    note: () => `Does the busiest day of the week outrun tomorrow morning's top-up?`,
    empty: "Every shelf is refilled faster than it sells.",
    /* One line first: the count, and the single tightest shelf in it. The rows
       below are only the ones near the ceiling. */
    verdict: rows => {
      if(!rows.length) return "No shelf is on a top-up plan yet.";
      const worst = rows.filter(r => r.pressure !== null)
        .sort((a,b) => b.pressure - a.pressure)[0];
      const bad = rows.filter(r => r.level !== "ok").length;
      return `<b>${rows.length} shelves</b> clear their top-up${
        bad ? `, ${bad} do not` : ""}${worst
        ? `; tightest ${worst.item} at ${shortName(D.businesses[worst.s])}, ${
            worst.pressure}% on a ${worst.peakDay || "normal day"}` : ""}.`;
    },
    keep: r => r.level !== "ok" || r.pressure === null || r.pressure >= 85,
    head: `<th class="l">Shop</th><th class="l">Product</th><th>Sells / day</th>
           <th>Busiest day</th><th>Daily top-up</th><th>Pressure</th><th>On hand</th>`,
    rows: () => D.supply.shops,
    row: r => `
      <td class="l">${siteTd(D.businesses[r.s])}</td>
      <td class="l">${r.item}</td>
      <td>${r.sold.toLocaleString()}</td>
      <td>${r.peakDay ? `${r.peakDay.slice(0,3)} ` : ""}${r.peakSold.toLocaleString()}</td>
      <td>${r.target ? r.target.toLocaleString() : "—"}</td>
      ${r.pressure === null
        ? `<td>${chipHtml("bad", "no plan", "Nothing refills this shelf on a schedule, so it is judged on days of cover instead")}</td>`
        : `<td class="gauge${r.level !== "ok" ? " low" : ""}"><i><b style="--w:${Math.min(100, r.pressure)}%"></b></i>${r.pressure}%</td>`}
      <td>${r.stock.toLocaleString()}</td>`,
  },
  imports: {
    label: "Before the import",
    note: () => {
      const s = D.supply;
      if (s.daysToImport === null) return "No active import partnership.";
      // On delivery day the holdings are at their weekly low by design, so
      // "days left" stops being the question worth asking.
      if (s.daysToImport === 0)
        return `${s.nextImportWeekday}'s import arrives today; holdings are at their weekly low`;
      // Counted from now, not from this morning: most of today is already spent.
      return `Counting the real days ahead, does each holding reach ${s.nextImportWeekday}'s import, ${s.hoursToImport} days away from now?`;
    },
    empty: "Everything reaches the next import.",
    verdict: rows => {
      if(!rows.length) return "Nothing here is filled by import.";
      const short = rows.filter(r => r.coverFit === "short").length;
      const close = rows.filter(r => r.coverFit === "tight").length;
      const tight = rows.filter(r => r.orderFit === "tight").length;
      const worst = rows.slice().sort((a,b) => a.cover - b.cover)[0];
      return `<b>${rows.length - short} of ${rows.length} holdings</b> reach ${
        D.supply.nextImportWeekday || "the next"}'s import, ${
        D.supply.hoursToImport} days off; thinnest ${worst.item} at ${
        shortName(D.businesses[worst.s])}, ${worst.cover} days${
        close ? `. ${close} land within half a day of it` : ""}${
        tight ? `. ${tight} order${tight===1?" is":"s are"} within 5% of the week they cover` : ""}.`;
    },
    keep: r => r.level !== "ok" || r.orderFit !== "ok" || r.coverFit !== "ok",
    head: `<th class="l">Site</th><th class="l">Product</th><th>On hand</th>
           <th>Uses / day</th><th>Busiest day</th><th>Runs out</th><th>Weekly order</th>
           <th>A week takes</th>`,
    rows: () => D.supply.imports,
    row: r => {
      const due = r.due;
      /* A holding that empties a few hours early is an order sized to
         consumption, so it gets a chip and not a red one. */
      const cls = !due ? "dim"
        : r.coverFit === "short" ? "bad" : r.coverFit === "tight" ? "warn" : "ok";
      return `
      <td class="l">${siteTd(D.businesses[r.s])}</td>
      <td class="l">${r.item}${r.paused ? ` <span class="chip bad">paused</span>` : ""}</td>
      <td>${r.stock.toLocaleString()}</td>
      <td>${r.perDay.toLocaleString()}${r.basis === "order"
        ? `<span class="sub"> est.</span>` : ""}</td>
      <td>${r.peakPerDay.toLocaleString()}${r.peakDay
        ? `<span class="sub"> ${r.peakDay.slice(0,3)}</span>` : ""}</td>
      <td><span class="chip ${cls}">${r.runsOut
        ? r.runsOut.slice(0,3) : `${r.cover}d`}</span><span class="sub"> ${r.cover}d${
        due ? ` of ${due}` : ""}${r.coverFit === "tight"
          ? `, ${r.shortBy}d early` : ""}</span></td>
      <td>${r.weekly.toLocaleString()}</td>
      <td>${r.basis === "order"
        ? `<span class="chip dim" data-tip="No logistics round has shipped this yet, so its use is last week's order: a guess, not a measurement">no draw logged yet</span>`
        : `${r.weekNeed.toLocaleString()}${r.orderFit !== "ok"
          ? ` <span class="chip ${r.orderFit === "short" ? "bad" : "warn"}">${
              r.orderFit === "short" ? "order too small" : "tight"}</span>` : ""}`}</td>`;
    },
  },
  idle: {
    label: "Idle stock",
    note: () => "Goods held far beyond what flows through them",
    empty: "Nothing is piling up.",
    verdict: rows => {
      if(!rows.length) return "Nothing is piling up.";
      const dead = rows.filter(r => r.dead);
      const deepest = rows.filter(r => !r.dead).sort((a,b) => b.weeks - a.weeks)[0];
      return `<b>${rows.length} holding${rows.length===1?"":"s"}</b> above ${
        D.supply.idleWeeks} weeks of cover${dead.length
        ? `, ${dead.length} with nothing flowing out at all` : ""}${deepest
        ? `; deepest ${deepest.item} at ${shortName(D.businesses[deepest.s])}, ${
            deepest.weeks} weeks` : ""}.`;
    },
    keep: r => r.dead || r.weeks >= 5,
    head: `<th class="l">Site</th><th class="l">Product</th><th>Units held</th>
           <th>Out / week</th><th>Weeks of supply</th><th>Top-up target</th>`,
    rows: () => D.supply.idle,
    row: r => `
      <td class="l">${siteTd(D.businesses[r.s])}</td>
      <td class="l">${r.item}</td>
      <td>${r.stock.toLocaleString()}</td>
      <td>${r.perWeek ? r.perWeek.toLocaleString() : "—"}</td>
      <td>${r.weeks === null
        ? `<span class="chip bad">not moving</span>`
        : `<span class="chip ${r.weeks >= 8 ? "warn" : "dim"}">${r.weeks}</span>`}</td>
      <td>${r.target ? r.target.toLocaleString() : "—"}</td>`,
  },
  lines: {
    label: "Factory lines",
    note: () => `Every assembly machine runs its recipe round the clock at the rated rate; the board reads the recipe from what the line ships`,
    empty: "No factory machine is set up.",
    verdict: rows => {
      const f = factoryView();
      if(!f || !f.sites.length) return "No factory is set up.";
      const piling = rows.filter(r => r.piling).length;
      const guessed = rows.filter(r => !r.unnamed && r.basis !== "measured" && r.basis !== "paired").length;
      const short = rows.filter(r => r.fullWeek && r.hoursWeek < r.fullWeek).length;
      return `<b>${f.sites.length} factor${f.sites.length===1?"y":"ies"}, ${f.machines} assembly machines</b> on ${
        rows.filter(r => !r.unnamed).length} lines${
        f.unnamed ? `; ${f.unnamed} machine${f.unnamed===1?"":"s"} on recipes the flow has not identified` : ""}${
        guessed ? `; ${guessed} named from what they eat or hold rather than ship` : ""}${
        piling ? `. ${piling} line${piling===1?"":"s"} make more than leaves` : ""}${
        short ? `. <b>${short} line${short===1?" is":"s are"} not staffed round the clock</b>` : ""}.`;
    },
    keep: r => r.unnamed || r.piling || (r.basis !== "measured" && r.basis !== "paired") || (r.missing && r.missing.length)
              || (r.fullWeek && r.hoursWeek < r.fullWeek),
    head: `<th class="l">Factory</th><th class="l">Line</th><th>Machines</th><th>Staffed</th>
           <th>Makes / day</th><th>Ships / day</th><th>Held</th><th>Top-up out</th>`,
    rows: () => factoryView().sites.flatMap(s => [
      ...s.lines.map(l => ({...l, s: s.s})),
      ...s.unnamed.map(u => ({...u, s: s.s, unnamed: true}))]),
    row: r => r.unnamed ? `
      <td class="l">${siteTd(D.businesses[r.s])}</td>
      <td class="l">${r.workstation}${slotText(r)} <span class="chip dim">${
          r.idle ? "no recipe chosen" : "recipe not identified"}</span>${r.rid && r.candidates.length
          ? ` <select class="linepick" data-rid="${r.rid}" data-tip="Nothing this line makes or eats has moved, so the board cannot tell what it runs. Say which, and its needs are worked out below"><option value="">name this line…</option>${
              r.candidates.map(c => `<option value="${c.slug}">${c.item}</option>`).join("")}</select>` : ""}<span class="sub">${
          r.idle ? "the machines stand idle"
          : r.hint ? `set up as ${r.hint.item} by the look of the top-up plan${r.hint.missing.length
              ? `, but ${r.hint.missing.join(", ")} never arrive${r.hint.missing.length === 1 ? "s" : ""}` : ""}`
          : `nothing it could make has shipped or been fed in a week; one of ${r.candidates.length} recipes`}</span></td>
      <td>${r.machines}</td>
      <td>${staffCell(r)}</td>
      <td>—</td><td>—</td><td>—</td><td>—</td>` : `
      <td class="l">${siteTd(D.businesses[r.s])}</td>
      <td class="l">${r.item}${r.basis !== "measured" && r.basis !== "paired"
          ? ` <span class="chip dim" data-tip="${r.basis === "likely"
              ? "Nothing has shipped; named from the product held at the factory"
              : r.basis === "paired"
              ? "Twin lines with the same machine count: the pair is certain from what it eats, which is which is not"
              : r.basis === "you" ? "You named this line; the board takes your word for it"
              : "Identified on an earlier build and remembered"}">${
              r.basis === "you" ? "named by you" : r.basis}</span>` : ""}${r.basis === "you" && r.rid
          ? ` <button type="button" class="unname" data-rid="${r.rid}" data-tip="Forget this name">×</button>` : ""}${
          LIVE && r.basis !== "you" && r.basis !== "measured" && r.candidates && r.candidates.length
          ? ` <select class="linepick" data-rid="${r.rid}" data-tip="Named from evidence that could not tell it from its twin; correct it if the game says otherwise"><option value="">correct…</option>${
              r.candidates.filter(c => c.slug !== r.slug).map(c => `<option value="${c.slug}">${c.item}</option>`).join("")}</select>` : ""}
        <span class="sub">${r.workstation}${slotText(r)}, ${r.rate}/h a machine${r.basis === "paired"
          ? ` · one of a twin pair: which id is which cannot be told` : ""}</span></td>
      <td>${r.machines}</td>
      <td>${staffCell(r)}</td>
      <td>${r.makes.toLocaleString()}${r.missing && r.missing.length
          ? `<span class="sub">stopped: no ${r.missing.join(", ")}</span>`
          : r.fullWeek && r.hoursWeek < r.fullWeek
          ? `<span class="sub">${r.atRoster.toLocaleString()} at this roster</span>` : ""}</td>
      <td>${r.ships.toLocaleString()}${r.piling
          ? ` <span class="chip warn">piling up</span>` : ""}</td>
      <td>${r.stock.toLocaleString()}</td>
      <td>${r.toCity ? r.toCity.toLocaleString() : "—"}${r.toPier
          ? `<span class="sub"> +${r.toPier.toLocaleString()} export</span>` : ""}</td>`,
  },
  feed: {
    label: "Feed the factories",
    note: () => "",
    empty: "No factory line to feed.",
    verdict: rows => {
      if(!rows.length) return "No factory line to feed.";
      const bad = rows.filter(r => r.level === "critical").length;
      const watch = rows.filter(r => r.level === "warn").length;
      const wait = rows.filter(r => r.level === "info").length;
      const worst = rows.filter(r => r.level === "critical" || r.level === "warn").sort((a,b) => b.perDay - a.perDay)[0];
      return `<b>${rows.length - bad - watch - wait} of ${rows.length} inputs</b> are fed as the machines need${
        bad ? `; ${bad} ${bad===1?"is":"are"} not` : ""}${
        watch ? `; ${watch} worth watching` : ""}${
        wait ? `; ${wait} wait on a stopped line` : ""}${
        worst ? `; largest ${worst.item} at ${shortName(D.businesses[worst.s])}` : ""}.`;
    },
    keep: r => r.level !== "ok",
    head: `<th class="l">Factory</th><th class="l">Input</th><th>Needs / day</th>
           <th>Needs / week</th><th>Daily top-up</th><th>Arrives / day</th>
           <th>Import / week</th><th class="l">Change</th>`,
    rows: () => factoryView().sites.flatMap(s => s.needs.map(n => ({...n, s: s.s}))),
    row: r => {
      const depot = r.from !== null ? shortName(D.businesses[r.from]) : "a depot";
      const chip = (cls, t) => `<span class="chip ${cls}">${t}</span>`;
      const stalled = r.stalled ? `; none arrived last week though ${depot} holds ${r.depotStock.toLocaleString()}` : "";
      const change = {
        unplanned: () => `${chip("bad", "no top-up")} put ${r.item} on a plan at ${r.perDay.toLocaleString()} a day`,
        target: () => `${chip("bad", "top-up short")} raise ${depot}'s top-up to ${r.raiseTarget.toLocaleString()}${stalled}`,
        waiting: () => `${chip("dim", "waiting")} ${r.lines.join(", ")} stand${r.lines.length === 1 ? "s" : ""} still for want of ${r.waitingOn.join(", ")}`,
        staffing: () => `${chip("warn", "understaffed")} the roster runs these machines ${Math.round(r.staffedShare * 100)}% of the week; staff them and the need is the full ${r.perDay.toLocaleString()}`,
        dry: () => `${chip("bad", "depot out")} ${depot} holds ${r.depotStock.toLocaleString()}; the import is not keeping up`,
        idle: () => `${chip("warn", "not drawn")} ${depot} holds ${r.depotStock.toLocaleString()} but the line takes ${
                       Math.round(r.arrives / r.perDay * 100)}% of its need`,
        import: () => r.raiseImport
          ? `${chip("bad", "import short")} raise the weekly import to ${r.raiseImport.toLocaleString()}`
          : `${chip("warn", "import tight")} within 5% of what the factories eat`,
        noimport: () => `${chip("warn", "no import")} ${depot} holds ${(r.depotStock / Math.max(r.depotNeed, 1)).toFixed(1)} weeks of it`,
        made: () => `${chip("ok", "made in-house")} at ${r.madeAt.map(i => shortName(D.businesses[i])).join(", ")}`,
        ok: () => chip("ok", "covered"),
      }[r.status]();
      return `
      <td class="l">${siteTd(D.businesses[r.s])}</td>
      <td class="l">${r.item}<span class="sub">${r.lines.map(l => {
          const line = (factoryView().sites.find(s => s.s === r.s) || {lines: []}).lines.find(x => x.item === l);
          return line && line.machines > 1 ? `${l} ×${line.machines}` : l; }).join(", ")}</span></td>
      <td>${r.perDay.toLocaleString()}</td>
      <td>${r.perWeek.toLocaleString()}</td>
      <td>${r.target ? r.target.toLocaleString() : "—"}${r.from !== null
          ? `<span class="sub"> from ${depot}</span>` : ""}</td>
      <td>${r.known ? r.arrives.toLocaleString() : "—"}${r.known && r.perDay
          ? `<span class="sub"> ${Math.round(r.arrives / r.perDay * 100)}%</span>` : ""}</td>
      <td>${r.importWeekly !== null ? r.importWeekly.toLocaleString() : "—"}${
          r.depotNeed && r.depotNeed !== r.perWeek
          ? `<span class="sub"> all factories ${r.depotNeed.toLocaleString()}</span>` : ""}</td>
      <td class="l">${change}</td>`;
    },
  },
};

/* Hours a factory worker is posted to a line's machines, out of every hour
   of the week; a machine with nobody on it stands still. */
const staffCell = r => {
  if(!r.fullWeek) return "—";
  const full = r.hoursWeek >= r.fullWeek;
  const pct = Math.round(r.hoursWeek / r.fullWeek * 100);
  return `<span class="chip ${full ? "ok" : pct < 50 ? "bad" : "warn"}">${pct}%</span>${full ? "" :
    `<span class="sub">${r.gaps.slice(0, 3).map(m => `#${m.slot} off ${m.off}`).join("; ")}${
      r.gaps.length > 3 ? ` +${r.gaps.length - 3} more` : ""}</span>`}`;
};
/* Where a line's machines sit in the factory's workstation list, so a row
   here can be matched to a machine on the game screen. */
const slotText = r => r.slots && r.slots.length
  ? ` · list position${r.slots.length > 1 ? "s" : ""} ${r.slots.join(", ")}` : "";

/* --- naming a factory line by hand ------------------------------------
   The flow can only name a line that ships or eats something. One set up
   before its ingredients arrive — beer waiting on hops — is named here, kept
   in this browser, and sent to the watcher when the page is live so the
   alerts follow too. The needs of a line named here are worked out on the
   page from the same recipes the planner uses. */
const LINE_NAMES_KEY = "ba_line_names";
function localNames(){
  try{ return JSON.parse(localStorage.getItem(LINE_NAMES_KEY)) || {}; }catch(e){ return {}; }
}
function nameLine(rid, slug){
  const names = localNames();
  if(slug) names[rid] = slug; else delete names[rid];
  try{ localStorage.setItem(LINE_NAMES_KEY, JSON.stringify(names)); }catch(e){}
  if(!LIVE){ drawStock(); drawLogistics(); wireAll(); return; }
  SOURCE.name(rid, slug)
    .then(data => { if(data){ D = data; renderAll(); } })
    .catch(() => { drawStock(); drawLogistics(); wireAll(); });
}
const feedFit = (need, have) => {
  if(!need || !have) return "ok";
  const gap = need - have;
  if(gap <= Math.max(need * 0.01, 5)) return "ok";
  return gap <= need * 0.05 ? "tight" : "short";
};
/* The same verdict the board gives a factory input, for rows the page built. */
function feedVerdict(n){
  const ceil100 = v => Math.ceil(v / 100) * 100;
  n.importFit = n.importWeekly !== null ? feedFit(n.depotNeed, n.importWeekly) : null;
  n.raiseTarget = n.raiseImport = null;
  n.stalled = !!(n.known && !n.arrives && n.depotStock > 0);
  let status, level;
  if(!n.target){ status = "unplanned"; level = "critical"; }
  else if(n.target < n.perDay * 0.98){ status = "target"; level = "critical"; n.raiseTarget = ceil100(n.perDay); }
  else if(n.known && n.arrives < n.perDay * 0.75){
    [status, level] = n.waitingOn.length ? ["waiting", "info"]
      : n.arrives >= n.perDay * (n.staffedShare ?? 1) * 0.85 ? ["staffing", "warn"]
      : n.depotStock < n.perDay ? ["dry", "critical"] : ["idle", "warn"]; }
  else if(n.importWeekly !== null && n.importFit === "short"){
    status = "import"; level = "critical"; n.raiseImport = ceil100(n.depotNeed); }
  else if(n.importWeekly !== null && n.importFit === "tight"){ status = "import"; level = "warn"; }
  else if(n.importWeekly === null && n.madeAt.length){ status = "made"; level = "ok"; }
  else if(n.importWeekly === null && n.depotStock < n.depotNeed){ status = "noimport"; level = "warn"; }
  else { status = "ok"; level = "ok"; }
  n.status = status; n.level = level;
}
/* A name kept in this browser that the live board does not yet have — the
   watcher was down when it was picked, or it was picked on the published copy
   — is sent across once, so the alerts and the tables agree with the page. */
const syncedNames = new Set();
function syncLocalNames(view){
  if(!LIVE) return;
  const names = localNames();
  const missing = view.sites.flatMap(s => s.unnamed).filter(u => u.rid && names[u.rid] && !syncedNames.has(u.rid));
  if(!missing.length) return;
  missing.forEach(u => syncedNames.add(u.rid));
  Promise.all(missing.map(u => SOURCE.name(u.rid, names[u.rid])))
    .then(results => { const last = results.filter(Boolean).pop(); if(last){ D = last; renderAll(); } })
    .catch(() => {});
}

/* The factories as the board built them, plus any line named in this browser. */
function factoryView(){
  const f = D.supply.factories;
  if(!f || !f.sites) return {sites: [], machines: 0, unnamed: 0};
  const view = JSON.parse(JSON.stringify(f));
  const names = localNames();
  syncLocalNames(view);
  const recipes = {};
  (D.plan?.recipes || []).forEach(r => recipes[r.slug] = r);
  const held = (s, slug) => (D.businesses[s].lines.find(l => l.slug === slug) || {}).units || 0;
  const taken = new Set();
  view.sites.forEach(s => s.lines.forEach(l => taken.add(l.slug)));
  const touched = new Set();
  view.sites.forEach(s => {
    s.unnamed = s.unnamed.filter(u => {
      const slug = u.rid && names[u.rid], rec = slug && recipes[slug];
      if(!rec || taken.has(slug)){
        u.candidates = u.candidates.filter(c => !taken.has(c.slug));
        return true;
      }
      taken.add(slug);
      const makes = u.machines * rec.out * 24, stock = held(s.s, slug);
      const missing = s.known ? rec.ingredients
        .filter(ing => { const a = view.aliases[ing.slug] || ing.slug;
                         return !(s.arrivals[a] || 0) && !held(s.s, a); })
        .map(ing => ing.item) : [];
      const share = u.fullWeek ? u.hoursWeek / u.fullWeek : 1;
      s.lines.push({rid: u.rid, item: rec.item, slug, missing, workstation: u.workstation, slots: u.slots,
        machines: u.machines, rate: rec.out, makes, ships: 0, stock, toCity: 0, toPier: 0,
        basis: "you", piling: stock > makes * 3, atRoster: Math.round(makes * share),
        hoursWeek: u.hoursWeek, fullWeek: u.fullWeek, gaps: u.gaps || []});
      rec.ingredients.forEach(ing => {
        const islug = view.aliases[ing.slug] || ing.slug, perDay = u.machines * ing.per * 24;
        let row = s.needs.find(n => n.slug === islug);
        if(!row){
          const t = s.targets[islug], from = t ? t[1] : null;
          row = {item: ing.item, slug: islug, perDay: 0, perWeek: 0, lines: [],
            target: t ? t[0] : 0, from, known: s.known, arrives: s.arrivals[islug] || 0,
            stock: held(s.s, islug), depotStock: 0, importWeekly: null, depotNeed: 0, madeAt: []};
          if(from !== null){
            const d = (view.depots[from] || {})[islug];
            row.depotStock = held(from, islug);
            row.importWeekly = d ? d.weekly : null;
          }
          s.needs.push(row);
        }
        const before = row.perDay * (row.staffedShare ?? 1);
        row.perDay += perDay; row.perWeek += perDay * 7;
        row.staffedShare = row.perDay ? (before + perDay * share) / row.perDay : 1;
        if(!row.lines.includes(rec.item)) row.lines.push(rec.item);
        touched.add(row);
      });
      return false;
    });
  });
  if(touched.size){
    const depotNeed = {}, madeAt = {};
    view.sites.forEach(s => {
      s.needs.forEach(n => { if(n.from !== null){
        const k = n.from + "|" + n.slug; depotNeed[k] = (depotNeed[k] || 0) + n.perWeek; } });
      s.lines.forEach(l => (madeAt[l.slug] = madeAt[l.slug] || []).push(s.s));
    });
    const shares = new Set([...touched].map(t => t.from + "|" + t.slug));
    view.sites.forEach(s => {
      const stopped = {};
      s.lines.forEach(l => { if(l.missing && l.missing.length) stopped[l.item] = l.missing; });
      s.needs.forEach(n => {
        if(!touched.has(n) && !shares.has(n.from + "|" + n.slug)) return;
        n.depotNeed = Math.round(depotNeed[n.from + "|" + n.slug] || 0);
        n.madeAt = madeAt[n.slug] || [];
        n.waitingOn = n.lines.every(l => stopped[l])
          ? [...new Set(n.lines.flatMap(l => stopped[l]).filter(m => m !== n.item))].sort() : [];
        feedVerdict(n);
      });
      const rank = {critical: 0, warn: 1, info: 2, ok: 3};
      s.needs.sort((a, b) => rank[a.level] - rank[b.level] || b.perDay - a.perDay);
    });
  }
  // A recipe one line now runs is no longer on offer to the others.
  view.sites.forEach(s => s.unnamed.forEach(u => {
    u.candidates = u.candidates.filter(c => !taken.has(c.slug)); }));
  view.unnamed = view.sites.reduce((n, s) => n + s.unnamed.reduce((m, u) => m + u.machines, 0), 0);
  return view;
}

/* --- chrome, wired up once ----------------------------------------- */
// changed for growth: the market views are a .seg; "Everything" went, being the
// union of "What I sell" and "Not yet", and the numbers are always in the cells.
seg($("marketTools"), [["types","By type"],["mine","What I sell"],["new","Not yet"]],
  () => marketView, v => { marketView = v; showAllMarket = false; }, () => drawMarket());

/* --- draw ----------------------------------------------------------- */
function drawMast(){
  const m = D.meta, k = D.kpi;
  /* The save name is the player's own text: set it as text, never as markup.
     The green dot after it is the brand's one flourish (and the coin). */
  $("title").textContent = m.save.trim();
  /* Day 1 was a Monday; the year comes from the save's own calendar. */
  const wd = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][((m.day - 1) % 7 + 7) % 7];
  const year = ((m.cityDate || "").match(/Year (\d+)/) || [])[1];
  /* Two things the reader should know before trusting a number: whether the
     game's own text was available (without it names are slugs and recipes and
     station capacities are unknown), and whether the save comes from a newer
     game build than the one every figure here was checked against. */
  const bits = [];
  if(year) bits.push(`year ${year}`);
  bits.push(`${k.businesses} sites`, `${k.employees.toLocaleString()} staff`);
  /* The flags go on a line of their own so the first line stays short enough
     for the sphere to rest between the nav and the clock. */
  const flags = [];
  if(m.locale === false)
    flags.push(`<span class="flag" data-tip="Load the game's en.json for recipes and station capacities; without it the factory and capacity views cannot be filled">names only</span>`);
  if(m.verifiedBuild && m.build > m.verifiedBuild)
    flags.push(`<span class="flag" data-tip="This board was checked on build ${m.verifiedBuild}; a newer game may have changed what the save records">build ${m.build} unchecked</span>`);
  if(LIVE) flags.push(`<span class="live" id="live"><b></b><em>${SOURCE.label}</em></span>`);
  const clock = $("clock");
  clock.innerHTML =
    `<b>Day ${m.day}<i>·</i>${wd} ${String(m.hour).padStart(2,"0")}:${String(m.minute).padStart(2,"0")}</b>`
    + `<small>${bits.join(" · ")}</small>` + (flags.length ? `<small>${flags.join(" · ")}</small>` : "");
  clock.dataset.tip = `Game time when the save was written: ${m.cityDate}. Day 1 was a Monday.`
    + (k.vacant ? ` ${k.vacant} lease${k.vacant === 1 ? "" : "s"} vacant on top of the ${k.businesses} sites.` : "");
}

function drawKpis(){
  const k = D.kpi;
  /* This is the change in average daily profit, not the change in net worth —
     it belongs under Profit and it says so. */
  const trend = k.profitAvg7 - k.profitPrev7;
  const cf = D.cashFlow;
  /* Four tiles: what the day made, what it took, what is in the bank, and the
     pace metric once the game reports it again — until then, the cost base.
     Site and staff counts sit in the masthead; debt only appears when there is any. */
  const fixed = k.rentBill + D.staff.dailyCost;
  const owed = k.debt > 0
    ? ` · ${fmt(k.debt)} owed on ${D.loans.length} loan${D.loans.length===1?"":"s"}` : "";
  /* A tile is a number, one chip, a short sub line and a fortnight of history.
     The sentence the tile used to print is the chip's tooltip. The arrow chips
     read ▲/▼ with the size of the move; the dim ones carry a plain fact. */
  const SPARK_DAYS = 14;
  const hist = key => D.daily.slice(-SPARK_DAYS).map(key);
  const vs7 = k.profitAvg7 ? (k.profitYesterday - k.profitAvg7) / Math.abs(k.profitAvg7) : 0;
  const cashTile = cf
    ? {chip: chipHtml(cf.cashChange >= 0 ? "ok" : "bad", `${cf.cashChange >= 0 ? "▲" : "▼"} ${compact(Math.abs(cf.cashChange))}`,
         `${cf.days} days: ${compact(cf.profit)} profit, cash ${cf.cashChange>=0?"+":""}${compact(cf.cashChange)}; ${
           cf.reinvested>=0
             ? `${compact(cf.reinvested)} went into set-up and stock`
             : `${compact(-cf.reinvested)} more than the books earned`}${owed}`),
       sub: cf.days === 7 ? "this week" : `over ${cf.days} day${cf.days===1?"":"s"}`}
    : {chip: chipHtml("dim", `${compact(k.profitSum7)} profit`,
         `${fmt(k.profitSum7)} profit over 7 days; no cash history yet, it starts building today${owed}`),
       sub: "no cash history"};
  const tiles = [
    {l: "Profit yesterday", v: fmt(k.profitYesterday),
     chip: chipHtml(vs7 >= 0 ? "ok" : "bad", `${vs7 >= 0 ? "▲" : "▼"} ${Math.abs(vs7 * 100).toFixed(0)}%`,
       `7-day average ${fmt(k.profitAvg7)}, ${trend>=0?"+":""}${fmt(trend)} vs the previous 7`),
     sub: "vs 7-day", spark: hist(d => d.profit)},
    {l: "Revenue yesterday", v: fmt(k.revenue),
     chip: chipHtml("dim", k.customers.toLocaleString(), `${k.customers.toLocaleString()} customers served yesterday`),
     sub: "customers", spark: hist(d => d.revenue)},
    /* Cash has no day-by-day history in the save, so this tile has no line. */
    {l: "Cash on hand", v: fmt(k.cash), chip: cashTile.chip, sub: cashTile.sub},
    k.netWorth === null
      ? {l: "Fixed cost / day", v: fmt(fixed),
         chip: chipHtml("dim", `rent ${compact(k.rentBill)}`, `${fmt(k.rentBill)} rent, ${fmt(D.staff.dailyCost)} payroll`),
         sub: `payroll ${compact(D.staff.dailyCost)}`,
         /* What the days actually paid in rent and wages; the number above is
            today's contracted rate, which is why the last point can sit below it. */
         spark: hist(d => (d.rent || 0) + (d.wages || 0))}
      /* Build 3672 stopped reporting net worth. Rather than quietly showing a
         stale number as if it were today's, the tile says which day it is from. */
      : {l: "Net worth", v: fmt(k.netWorth),
         chip: k.netWorthAsOf
           ? chipHtml("dim", `day ${k.netWorthAsOf}`, `As of day ${k.netWorthAsOf}; the game stopped reporting it`)
           : cf && cf.netWorthChange !== null
           ? chipHtml(cf.netWorthChange >= 0 ? "ok" : "bad", `${cf.netWorthChange>=0?"▲":"▼"} ${compact(Math.abs(cf.netWorthChange))}`,
               `${cf.netWorthChange>=0?"+":""}${fmt(cf.netWorthChange)} over ${cf.days} day${cf.days===1?"":"s"}`)
           : chipHtml("dim", "new", "No net worth history yet; starts building today"),
         sub: k.netWorthAsOf ? "stale" : cf && cf.netWorthChange !== null ? `over ${cf.days} days` : "no history yet"},
  ];
  /* The tiles are rebuilt on every render; the entrance plays only the first time. */
  const seen = !!q("#kpis .kpi.in");
  $("kpis").innerHTML = tiles.map(t => `
    <div class="kpi rv${seen ? " in" : ""}">
      <span class="lab">${t.l}</span>
      <span class="v">${t.v}</span>
      <div class="row">${t.chip}<span class="sub">${t.sub}</span></div>
      ${t.spark ? sparkHtml(t.spark, t.spark.map(money)) : ""}
    </div>`).join("");
}

/* Where each kind of finding is spelt out on the board: a supply-chain view,
   the logistics set-up, or the site's own tab. A finding is a headline; the
   link is the rest of the story. */
const ALERT_LINKS = {
  shortfall: {sec:"secStock", view:"imports"}, order: {sec:"secStock", view:"imports"},
  paused: {sec:"secStock", view:"imports"},
  outruns: {sec:"secStock", view:"shops"}, unplanned: {sec:"secStock", view:"shops"},
  dead: {sec:"secStock", view:"idle"}, target: {sec:"secStock", view:"idle"},
  feed: {sec:"secStock", view:"feed"}, staff: {sec:"secStock", view:"lines"},
  unnamed: {sec:"secStock", view:"lines"}, unset: {sec:"secStock", view:"lines"},
  atcap: {sec:"secDetail", site:true}, idlestaff: {sec:"secDetail", site:true},
  trend: {sec:"secDetail", site:true}, loss: {sec:"secDetail", site:true},
  notrading: {sec:"secDetail", site:true}, satisfaction: {sec:"secDetail", site:true},
  uniform: {sec:"secDetail", site:true}, bathroom: {sec:"secDetail", site:true},
  toiletprivacy: {sec:"secDetail", site:true}, sink: {sec:"secDetail", site:true},
  music: {sec:"secDetail", site:true}, interior: {sec:"secDetail", site:true},
  hype: {sec:"secMarket"}, vacant: {sec:"secPortfolio"},
  promotion: {sec:"secPortfolio", port:"ops"},
};
/* Which page, and which view on it, each section lives on. A finding's link
   opens that page first, then scrolls; the reader never lands on a hidden
   section. */
const SEC_PAGE = {
  alertSection:["today"],
  secDaily:["results"], secRhythm:["results"], secPortfolio:["results"], secDetail:["results"],
  secLogistics:["supply","orders"], secStock:["supply","checks"], secFlow:["supply","map"],
  secMarket:["growth","market"], secPlan:["growth","plan"], secIngredients:["growth","plan"],  // changed for growth: no secExpand
  secProducts:["company"], secPayroll:["company"], secGoals:["company"],
};
function reveal(secId){
  const [p, sv] = SEC_PAGE[secId] || ["today"];
  showPage(p, false);
  if(sv) showSub(p, sv);
  const sec = $(secId);
  if(sec && !sec.hidden) requestAnimationFrame(() => sec.scrollIntoView({behavior:"smooth", block:"start"}));
}
function goToAlert(a){
  const link = ALERT_LINKS[a.group];
  if(!link) return;
  if(link.view){
    stockView = link.view; showAllStock = false;
    drawStock();
  }
  if(link.port){
    view = link.port; sortKey = null;
    drawPortfolio();
  }
  if(link.site){
    const b = D.businesses.find(x => x.name === a.site);
    if(b) openSite(b.key, false);
  }
  reveal(link.sec);
}
const alertPage = a => (SEC_PAGE[(ALERT_LINKS[a.group] || {}).sec] || ["today"])[0];

/* The three severities of the list: the alert levels Python assigns, in the
   design's words. */
const SEV_KIND = {critical: "crit", warn: "watch", info: "opp"};
const SEV_WORD = {crit: "urgent", watch: "watch", opp: "opportunity"};

/* A finding is a short verb phrase; the rest of the sentence unfolds on hover.
   Python's sentences often lead with the site, which the row already names, so
   that is dropped (with a following "is"/"are"); then the first colon,
   semicolon or full stop splits the headline from the detail. A condensed row
   (three of a kind at one site) carries its worst member's sentence as detail. */
function splitFinding(a){
  let t = String(a.text || "");
  if(a.site && t.startsWith(a.site)){
    t = t.slice(a.site.length).replace(/^[\s,:;-]+/, "").replace(/^(is|are)\s+/, "");
  }
  const m = t.match(/^(.*?)(?::|;|\.\s)\s*(.*)$/s);
  let what = m ? m[1] : t, more = m ? m[2] : "";
  what = what.charAt(0).toUpperCase() + what.slice(1);
  if(a.detail) more = more ? `${more.replace(/[.\s]+$/, "")}. ${a.detail}` : a.detail;
  return {what, more};
}
/* The figure on the right: the finding's worth in its unit, whole dollars up
   to a million and compact beyond it; a condensed row with no money shows
   how many findings it stands for; anything else leaves the column empty. */
function findingAmount(a){
  if(typeof a.worth === "number")
    return `${Math.abs(a.worth) >= 1e6 ? money(a.worth) : fmt(a.worth)}<small>${a.unit || ""}</small>`;
  if(a.detail){
    const n = (String(a.text).match(/^\d+/) || [])[0];
    if(n) return `${n}<small>findings</small>`;
  }
  return "";
}
function findingRow(a){
  const b = D.businesses.find(x => x.name === a.site);
  const {what, more} = splitFinding(a);
  /* Three shops can share a name; the pill already tells them apart, so the
     neighbourhood shortName() would add is only spelt out when there is no pill. */
  const site = !b ? a.site : b.code ? hoodHtml(b) + baseName(b) : shortName(b);
  return `<a class="find ${SEV_KIND[a.level] || "opp"}" href="#${alertPage(a)}" data-id="${attr(a.id)}">
    <span class="mark" data-tip="Silence this finding"></span>
    <span class="site">${site}</span>
    <span class="what">${what}</span>
    <span class="amt">${findingAmount(a)}</span>
    <span class="go">${icon("go")}</span>${more ? `
    <span class="more">${more}</span>` : ""}</a>`;
}
/* Row click opens the finding's page; a click on the mark is stopped in the
   capture phase by wireFinds() and never reaches this. */
function bindFindingRows(host, list){
  $$(".find", host).forEach((node, i) => {
    node.onclick = e => { e.preventDefault(); goToAlert(list[i]); };
  });
}

function drawAlerts(){
  const kindOn = a => alertGroupPrefs[a.group] !== false;
  const list = D.alerts.filter(kindOn);
  const counts = {crit: 0, watch: 0, opp: 0};
  list.forEach(a => counts[SEV_KIND[a.level] || "opp"]++);
  const gate = (D.minor || {}).gate || 0;

  /* The head: title, the threshold behind the ?, the three severity counters
     that filter the list, and the tune button. That button is bound once at
     boot, so it is carried over into the fresh head rather than rebuilt. */
  const tune = $("alertKindsToggle");
  $("alertHead").innerHTML = sechead("Needs attention", {
    why: `A site that is not trading always makes the list. Everything else needs to be worth ${
      fmt(gate)}/day; smaller findings are counted below.`,
    aside: ["crit", "watch", "opp"].map(k =>
      `<span class="sev ${k}" data-kind="${k}" data-tip="${attr(`${counts[k]} ${SEV_WORD[k]}; click to hide or show them`)}"><i></i>${counts[k]}</span>`
    ).join("") + `<span id="alertTuneSlot"></span>`,
  });
  $("alertTuneSlot").replaceWith(tune);

  $("alerts").innerHTML = list.length ? list.map(findingRow).join("")
    : `<span class="quiet" style="display:block;padding:12px 0">Nothing to flag here.</span>`;
  bindFindingRows($("alerts"), list);

  /* Anything worth less than the materiality gate is counted rather than read
     out. It is never dropped — the count and the money are both here, and
     "show" lays the rows out like the list above. Hidden kinds are dropped
     from both the count and the total, the same as above. */
  const rows = ((D.minor || {}).rows || []).filter(kindOn);
  const host = $("alertMinor"), more = $("minorList");
  if(!rows.length){ host.innerHTML = ""; more.innerHTML = ""; more.hidden = true; }
  else {
    const worth = rows.reduce((s,r) => s + (r.worth || 0), 0);
    host.innerHTML = `${rows.length} smaller · ${fmt(worth)}/day &nbsp;<a class="link" href="#" id="minorToggle" aria-expanded="${showMinor}">${
      showMinor ? "hide" : "show"}</a>`;
    $("minorToggle").onclick = e => { e.preventDefault(); showMinor = !showMinor; drawAlerts(); };
    more.hidden = !showMinor;
    more.innerHTML = showMinor ? rows.map(findingRow).join("") : "";
    bindFindingRows(more, rows);
  }
  /* The kinds switches and the "show" link redraw this view outside
     renderAll(), so the sticky state (filtered severities, silenced ids) is
     re-applied here; both calls are idempotent. */
  wireSev(); wireFinds();
}

/* A round step for the y axis: 1, 2, 2.5 or 5 times a power of ten, so about
   `ticks` gridlines cover the span. */
function niceStep(span, ticks){
  const raw = span / ticks, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
  return (f <= 1.2 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
}

function drawChart(){
  chartRows = chartWindow ? D.daily.slice(-chartWindow) : D.daily;
  const rows = chartRows, n = rows.length;
  if(!n) return;
  const first = rows[0], last = rows[n - 1];
  /* Daily profit swings by a million between a weekend and a Tuesday purely
     because that is when the week's goods are paid for. The rolling line is the
     one that says whether trading moved. */
  $("dailyHead").innerHTML = sechead("Daily result", {
    why: `Daily profit follows the purchase calendar, so the 7-day line is the trend. Day ${
      first.day} to ${last.day}. Click a legend chip to add or drop a line.`,
    aside: `<span class="seg" id="chartTools"></span>`,
  });
  seg($("chartTools"), [[30,"30 days"],[0,"All"]], () => chartWindow, v => chartWindow = v, drawChart);

  const W = 1140, H = 260, L = 56, R = 12, T = 16, B = 28;
  /* The axis fits every series, on or off, so a legend click never moves it. */
  let min = 0, max = 0;
  rows.forEach(r => Object.values(SERIES).forEach(s => { min = Math.min(min, r[s.key]); max = Math.max(max, r[s.key]); }));
  const step = niceStep((max - min) || 1, 5), fine = step / 5;
  const hi = Math.max(Math.ceil((max + step * .05) / fine) * fine, fine);
  const lo = min < 0 ? -Math.ceil((-min + step * .05) / fine) * fine : 0;
  const X = i => L + (n > 1 ? i / (n - 1) : .5) * (W - L - R);
  const Y = v => T + (hi - v) / (hi - lo) * (H - T - B);

  const out = [];
  for(let v = 0; v <= hi + 1e-9; v += step){
    const yy = Y(v).toFixed(1);
    out.push(`<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="var(--rule-soft)"></line>`
      + `<text x="${L - 10}" y="${(+yy + 4).toFixed(1)}" text-anchor="end" font-size="10" font-family="IBM Plex Mono" fill="var(--ink-3)">${money(v)}</text>`);
  }
  const bw = Math.min(12, (W - L - R) / n * .6), y0 = Y(0);
  const line = (key, colour, width, dash) => {
    const pts = rows.map((r, i) => `${X(i).toFixed(1)},${Y(r[key]).toFixed(1)}`).join(" ");
    return `<polyline points="${pts}" fill="none" stroke="${colour}" stroke-width="${width || 1.5}" stroke-linejoin="round"${
      dash ? ` stroke-dasharray="${dash}"` : ""}></polyline>`;
  };
  Object.entries(SERIES).forEach(([id, s]) => {
    const body = s.bars
      ? rows.map((r, i) => { const v = r[s.key], yy = Y(v);
          return `<rect x="${(X(i) - bw / 2).toFixed(1)}" y="${Math.min(yy, y0).toFixed(1)}" width="${bw.toFixed(1)}" height="${
            Math.abs(yy - y0).toFixed(1)}" rx="2" fill="${v < 0 ? "var(--neg)" : "var(--ink-3)"}" opacity=".45"><title>Day ${
            r.day}: net ${money(v)}</title></rect>`; }).join("")
      : line(s.key, s.colour, s.width, s.dash);
    out.push(`<g data-series="${id}"${seriesOn(id) ? "" : ' class="off"'}>${body}</g>`);
  });
  const stride = Math.max(1, Math.ceil(n / 10));
  rows.forEach((r, i) => { if(i % stride === 0 || i === n - 1)
    out.push(`<text x="${X(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="10" font-family="IBM Plex Mono" fill="var(--ink-3)">${r.day}</text>`); });
  const k = n - 1;
  out.push(`<g class="xh"><line x1="${X(k).toFixed(1)}" x2="${X(k).toFixed(1)}" y1="${T}" y2="${H - B}" stroke="var(--ink-3)" stroke-dasharray="3 4"></line>
    <circle cx="${X(k).toFixed(1)}" cy="${Y(last.profit7).toFixed(1)}" r="4" fill="var(--accent)" stroke="var(--ground)" stroke-width="2"></circle></g>`);

  const readout = r => `<i></i>Day ${r.day} <b>${money(r.profit)}</b> net <b>${money(r.profit7)}</b> 7-day <b>${money(r.revenue)}</b> revenue`;
  const xs = JSON.stringify(rows.map((r, i) => +X(i).toFixed(1)));
  const ys = JSON.stringify(rows.map(r => +Y(r.profit7).toFixed(1)));
  const labels = JSON.stringify(rows.map(readout));
  $("dailyBox").innerHTML = `
    <div class="chartbox chart" data-chart="1" data-xs="${attr(xs)}" data-ys="${attr(ys)}" data-labels="${attr(labels)}">
      <div class="readout">${readout(last)}</div>
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px;overflow:visible">${out.join("\n")}</svg>
      <div class="legend">${Object.entries(SERIES).map(([id, s]) =>
        `<a class="${seriesOn(id) ? "on" : ""}" data-series="${id}" href="#"><i style="background:${s.colour}"></i>${s.label}</a>`).join("")}</div>
    </div>`;
  wireChart(); wireTips();
}

/* A shop, its depot and the factory behind it are one operation. Reading them
   apart puts a 98% shop margin next to a factory at -80% and neither number
   means anything, so the chain total comes first and the sites fold underneath. */
const CHEV = () => `<span class="chev">${icon("chev")}</span>`;
/* A site in a table: its neighbourhood pill, its short name, and the type and
   address underneath. With `chev`, the arrow that says the row opens. */
const siteLabel = (b, chev) => `${hoodHtml(b)}${b.code ? "&nbsp; " : ""}${shortName(b)}${chev ? ` ${CHEV()}` : ""}
  <span class="sub">${b.type} · ${b.address}</span>`;
const kidCell = b => siteLabel(b, true);

function chainRow(c, v){
  const cells = v.chain(c);
  const note = c.external
    ? `${compact(c.external)} of it sold outside the company by its factory`
    : c.suppliedBy.length ? `supplied from ${c.suppliedBy.join(", ")}` : "";
  const name = `${CHEV()}${c.name}<span class="sub" style="padding-left:16px">${c.count} site${c.count===1?"":"s"}${
    note ? ` · ${note}` : ""}</span>`;
  return `<tr class="chain" data-chain="${attr(c.name)}">${
    cells.map((cell, i) => `<td class="${i ? "" : "l"}">${i === 0 ? name : cell}</td>`).join("")}</tr>`;
}

const SORT_ICON = `<svg class="sort" viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"></path></svg>`;

function drawPortfolio(){
  const v = VIEWS[view];
  $("portHead").innerHTML = sechead("Portfolio", {
    why: `${v.note}. Click a chain to open its sites, a site to open its detail. Click a column to sort the sites by it.`,
    aside: `<span class="seg" id="portTools"></span>`,
  });
  seg($("portTools"), Object.entries(VIEWS).map(([id, o]) => [id, o.label]),
    () => view, id => { view = id; sortKey = null; }, drawPortfolio);
  const byKey = {};
  D.businesses.forEach(b => byKey[b.key] = b);
  const sorter = (sortKey !== null && v.cols[sortKey] && v.cols[sortKey][3])
    ? (a,z) => (v.cols[sortKey][3](a) - v.cols[sortKey][3](z)) * sortDir : null;

  /* Every site row is in the table; wirePortfolio() shows the ones whose
     chain is open, from the openChains set, so a refresh keeps them open. */
  const body = [];
  (D.chains||[]).forEach(c => {
    body.push(chainRow(c, v));
    let kids = c.sites.map(k => byKey[k]).filter(Boolean);
    if(sorter) kids = kids.slice().sort(sorter);
    kids.forEach(b => body.push(`<tr class="kid${siteOpen && b.key === siteKey ? " on" : ""}" data-parent="${
      attr(c.name)}" data-key="${attr(b.key)}" title="Open this site's detail">${v.cols.map(([,f,cls]) =>
      `<td class="${cls||""}">${f(b)}</td>`).join("")}</tr>`));
  });

  const t = $("portfolio");
  t.innerHTML = `<thead><tr>${v.cols.map(([h,,cls,key],i) =>
      `<th class="${cls||""}"${key ? ` data-i="${i}"` : ""}${i===sortKey?` data-dir="${sortDir<0?"desc":"asc"}"`:""}>${h}${
        i===sortKey ? SORT_ICON : ""}</th>`).join("")}</tr></thead>
    <tbody>${body.join("")}</tbody>
    ${v.total ? `<tfoot><tr>${v.total(D.businesses).map((c,i) =>
      `<td class="${i?"":"l"}">${i===0?D.businesses.length+" sites":c}</td>`).join("")}</tr></tfoot>` : ""}`;
  t.querySelectorAll("thead th[data-i]").forEach(th => th.onclick = () => {
    const i = +th.dataset.i;
    if(sortKey===i) sortDir = -sortDir; else { sortKey=i; sortDir=-1; }
    drawPortfolio();
  });
  t.querySelectorAll("tr.kid").forEach(tr => tr.onclick = () => openSite(tr.dataset.key));
  wirePortfolio(); wireTips();
}

/* --- one business at a time ------------------------------------------ */
const baseName = b => b.name.replace(/^\[[^\]]*\]\s*/, "");
/* The bracket prefix moves into the bullet, but three shops can still share a
   name — those get their neighbourhood back so the tabs stay tellable apart. */
let NAME_USES = {}, NAME_USES_FOR = null;
/* Counted on demand, and again whenever the data object is replaced, so a
   page that receives its numbers after loading is counted too. */
const nameUses = () => {
  if(NAME_USES_FOR !== D){
    NAME_USES = {};
    D.businesses.forEach(b => { NAME_USES[baseName(b)] = (NAME_USES[baseName(b)] || 0) + 1; });
    NAME_USES_FOR = D;
  }
  return NAME_USES;
};
const shortName = b => nameUses()[baseName(b)] > 1 && b.neighbourhood
  ? `${baseName(b)} · ${b.neighbourhood}`
  : baseName(b);

/* A warehouse has no customers, no basket and no shelves worth reading; it is a
   pipe. Trading sites lead the picker, the rest sit in their own group. */
const trades = b => b.status !== "vacant" && b.revenue > 0;

/* A site opens from its portfolio row or from a finding; nothing is open until
   someone asks. The picker moves between sites without the trip back up: the
   previous and next site are a click away, the whole roster is in the list
   between them. Trading sites lead, the support sites sit in their own group. */
function drawSitePicker(){
  const host = $("sitePick");
  if(!host) return;
  const all = D.businesses.filter(b => b.status !== "vacant");
  const trading = all.filter(trades), support = all.filter(b => !trades(b));
  const order = trading.concat(support);
  const at = order.findIndex(b => b.key === siteKey);
  const prev = at > 0 ? order[at - 1] : null, next = at >= 0 && at < order.length - 1 ? order[at + 1] : null;
  const opt = b => `<option value="${attr(b.key)}"${b.key === siteKey ? " selected" : ""}>${shortName(b)}</option>`;
  const step = b => b ? `<a href="#" data-key="${attr(b.key)}">${shortName(b)}</a>` : "";
  host.innerHTML = `${step(prev)}<select class="sitepick" aria-label="Which site">${trading.map(opt).join("")}${
    support.length ? `<optgroup label="Support sites">${support.map(opt).join("")}</optgroup>` : ""}</select>${step(next)}`;
  host.onclick = e => { const a = e.target.closest("a[data-key]"); if(a){ e.preventDefault(); openSite(a.dataset.key); } };
  q("select", host).onchange = e => openSite(e.target.value);
}
function openSite(key, scroll = true){
  if(!D.businesses.some(b => b.key === key)) return;
  siteKey = key; siteOpen = true;
  drawSite(); drawPortfolio();
  if(scroll) reveal("secDetail");
}
function closeSite(){
  siteOpen = false;
  drawSite(); drawPortfolio();
}

/* A small area chart for one site's history: same grammar as the big one,
   without the axes it does not have room for. */
function miniChart(series, key, colour){
  if(series.length < 2) return `<p class="quiet">Not enough history yet.</p>`;
  const W = 540, H = 108, P = {t:8, r:6, b:16, l:4};
  const vals = series.map(d => d[key]);
  let lo = Math.min(...vals, 0), hi = Math.max(...vals, 1);
  const pad = (hi - lo) * 0.1; lo -= pad; hi += pad;
  const x = i => P.l + i/(series.length-1) * (W-P.l-P.r);
  const y = v => P.t + (1-(v-lo)/(hi-lo)) * (H-P.t-P.b);
  const pts = series.map((d,i) => `${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(" ");
  const base = y(Math.max(lo, 0)).toFixed(1);
  const last = series.length - 1;
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:108px;overflow:visible">
    ${lo < 0 ? `<line x1="${P.l}" y1="${y(0)}" x2="${W-P.r}" y2="${y(0)}"
        stroke="var(--ink-3)" stroke-width="1"/>` : ""}
    <polygon points="${x(0).toFixed(1)},${base} ${pts} ${x(last).toFixed(1)},${base}"
      fill="${colour}" opacity=".10"/>
    <polyline points="${pts}" fill="none" stroke="${colour}" stroke-width="2"
      stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    <circle cx="${x(last).toFixed(1)}" cy="${y(series[last][key]).toFixed(1)}" r="3.2"
      fill="var(--surface)" stroke="${colour}" stroke-width="2"/>
    <text x="${P.l}" y="${H-4}" fill="var(--ink-3)" font-family="IBM Plex Mono, monospace"
      font-size="10">day ${series[0].day}</text>
    <text x="${W-P.r}" y="${H-4}" text-anchor="end" fill="var(--ink-3)" font-family="IBM Plex Mono, monospace"
      font-size="10">day ${series[last].day}</text>
  </svg>`;
}

/* --- the shop's week, hour by hour ------------------------------------
   Three numbers meet here. Customers are measured an hour at a time over the
   fortnight the save keeps. The registers are whatever service staff were
   rostered that hour, at the capacity of the counters they were posted to. The
   door cap is the building's own limit. Shade is how busy against the site's
   own busiest hour; a red outline is an hour spent at the ceiling that was on.
   The sentence under the grid says which, and when capacity stood idle. */
const HOUR_ROWS = [1,2,3,4,5,6,0];
const WEEK_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const WEEK_FULL = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
/* Mirrors AT_CAP in the Python: this close to the ceiling is at the ceiling,
   so the outlined cells are the ones capHours counts. */
const AT_CAP = 0.95;

function hourGrid(g, todayWd){
  const peak = Math.max(g.peak, 1);
  let cells = `<div></div>${[...Array(24).keys()].map(h => `<div class="hh">${h % 3 === 0 ? h : ""}</div>`).join("")}`;
  HOUR_ROWS.forEach(wd => {
    cells += `<div class="dd${wd === todayWd ? " now" : ""}">${WEEK_SHORT[wd].toUpperCase()}${g.thin[wd] ? "*" : ""}</div>`;
    for(let h = 0; h < 24; h++){
      const seen = g.customers[wd][h], cap = g.effective[wd][h];
      const when = `<b>${WEEK_FULL[wd]} ${String(h).padStart(2, "0")}:00</b>`;
      if(seen === null){ cells += `<div class="hc" data-read="${attr(`${when} no reading`)}"></div>`; continue; }
      const a = seen ? 6 + Math.round(Math.min(seen / peak, 1) * 70) : 0;
      const bg = seen ? `color-mix(in oklab, var(--accent) ${a}%, var(--surface))` : "var(--raised)";
      const atCap = !g.thin[wd] && cap && seen >= cap * AT_CAP;
      const slack = cap && g.onShift[wd][h] >= 2 && cap > Math.max(seen, .5) * 2;
      const read = `${when} ${Math.round(seen)} customer${Math.round(seen) === 1 ? "" : "s"} · ${
        g.staffed[wd][h]} of ${g.counters} register capacity on${
        atCap ? " · <b>at the ceiling</b>" : slack ? " · capacity idle" : ""}`;
      cells += `<div class="hc${atCap ? " cap" : ""}" style="background:${bg}" data-read="${attr(read)}"></div>`;
    }
  });
  return `<div class="hours">${cells}</div>`;
}

/* A vending-machine side item earns a rounding error next to a store's real
   line — this is the cutoff, as a share of the best-selling line's revenue. */
const SHELF_MAIN_SHARE = 0.02;
const SMALL = `style="font-size:12px;color:var(--ink-3);margin-left:6px"`;
const CLOSE_ICON = `<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"></path></svg>`;
/* Two letters for a role: the initials of its first two words. */
const roleCode = role => { const w = role.trim().split(/\s+/); return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] || "??").slice(0, 2)).toUpperCase(); };

function drawSite(){
  siteTab = siteKey === null ? -1 : D.businesses.findIndex(x => x.key === siteKey);
  const b = siteTab >= 0 ? D.businesses[siteTab] : null;
  const sec = $("secDetail");
  if(!b || !siteOpen){ sec.hidden = true; $("sitePanel").innerHTML = ""; return; }
  sec.hidden = false;

  const targets = {};
  D.supply.shops.forEach(r => { if(r.s === siteTab) targets[r.item] = r; });
  const feeds = D.supply.shops.find(r => r.s === siteTab && r.from !== null);
  const depot = feeds ? D.businesses[feeds.from] : null;
  const grid = (D.hours || []).find(h => h.key === b.key);
  const todayName = D.rhythm && D.rhythm.today ? D.rhythm.today.day : null;
  const notes = (D.hourFindings || []).filter(f => f.key === b.key).map(f =>
    f.kind === "cap"
      ? `At the ceiling ${f.hours} hours a week (${f.when}); ${f.limit} is the limit, so
         the answer is ${f.fix}. ${fmt(f.throughput)}/day of trade goes through those
         hours; the save records nothing about what is turned away above them.`
      : `${f.staff} counters are on ${String(f.from).padStart(2,"0")}:00-${
         String(f.to).padStart(2,"0")}:00 on a ${f.day} for ${f.seen} customers an hour;
         ${f.spare} staff-hours a week, about ${fmt(f.worth)}/day of wages.`);

  /* The costs behind the profit tile, on hover. */
  const costs = [
    ["Goods", b.cogs], ["Wages", b.wages], ["Rent", b.rent],
    ["Marketing", b.marketing], ["Theft", b.theft], ["Licensing", b.licensing],
  ].filter(([, v]) => v);
  const costTip = costs.length
    ? `Yesterday's costs: ${costs.map(([l, v]) => `${l.toLowerCase()} ${fmt(v)}`).join(", ")}.`
    : "No costs recorded yesterday.";
  const capTile = !grid ? "—"
    : grid.cap ? `${grid.cap}<small ${SMALL}>/h · ${grid.capHours} h/wk at the ceiling</small>`
    : `—<small ${SMALL}>no door cap${grid.capHours ? ` · ${grid.capHours} h/wk at the ceiling` : ""}</small>`;
  const stats = `
    <div class="sstat"><span class="lab">Revenue yesterday</span><div class="v">${fmt(b.revenue)}</div></div>
    <div class="sstat"><span class="lab">Customers</span><div class="v">${b.customers ? b.customers.toLocaleString() : "—"}${
      b.basket === null ? "" : `<small ${SMALL}>$${b.basket.toFixed(2)}/visit</small>`}</div></div>
    <div class="sstat" data-tip="${attr(costTip)}"><span class="lab">Profit</span><div class="v ${sign(b.profit)}">${fmt(b.profit)}${
      b.margin === null ? "" : `<small ${SMALL}>${b.margin.toFixed(1)}% margin</small>`}</div></div>
    <div class="sstat"><span class="lab">Door cap</span><div class="v">${capTile}</div></div>`;

  const crew = b.crew.length
    ? b.crew.map(c => `<span class="person"><i>${roleCode(c.role)}</i>${c.role}<small>${
        c.count > 1 ? `${c.count} · ` : ""}${fmt(c.daily)}/day</small></span>`).join("")
    : `<span class="quiet">Nobody assigned.</span>`;

  /* A store's real shelves are what its type is built around; the paper bag
     handed out at every checkout and the odd soda/coffee machine are amenities
     the save logs as sales too, at a sliver of what the real lines move. They
     stay out of the main table and fold into a "show more" rather than
     vanishing outright. */
  const shelvesAll = b.lines.filter(l => l.rate > 0 || l.units > 0);
  const peakRevenue = Math.max(0, ...shelvesAll.filter(l => l.item !== "Paper Bag").map(l => l.revenue));
  const isMainShelf = l => l.item !== "Paper Bag" && l.revenue >= peakRevenue * SHELF_MAIN_SHARE;
  const sideShelves = shelvesAll.filter(l => !isMainShelf(l));
  const shelves = showAllShelves ? shelvesAll : shelvesAll.filter(isMainShelf);
  const gauge = t => {
    if(!t || t.pressure === null) return "—";
    const p = Math.round(t.pressure);
    return `<i><b style="--w:${Math.min(100, p)}%${t.level === "warn" ? ";background:var(--warn)" : ""}"></b></i>${p}%`;
  };
  const products = shelves.length ? `
    <table>
      <thead><tr><th>Product</th><th>Sells / day</th><th>Busiest</th><th>Revenue / day</th>
        <th>Top-up</th><th>Pressure</th><th>On hand</th></tr></thead>
      <tbody>${shelves.map(l => {
        const t = targets[l.item];
        return `<tr>
          <td class="l">${l.item}<span class="sub">${l.price ? `$${l.price.toFixed(2)}` : "no price"}</span></td>
          <td>${l.soldPerDay.toLocaleString()}</td>
          <td>${t && t.peakDay ? `${t.peakDay.slice(0, 3)} ${t.peakSold.toLocaleString()}` : "—"}</td>
          <td>${fmt(l.revenue)}</td>
          <td>${t && t.target ? t.target.toLocaleString() : "—"}</td>
          <td class="gauge${t && t.level === "critical" ? " low" : ""}">${gauge(t)}</td>
          <td>${l.units.toLocaleString()}</td></tr>`;
      }).join("")}</tbody></table>` : `<p class="quiet">Nothing stocked here.</p>`;
  const shelfMore = sideShelves.length ? `
    <p class="quiet" style="margin:12px 0 0"><a class="link" href="#" id="shelfToggle" aria-expanded="${showAllShelves}">${
      showAllShelves ? "hide the odds and ends" : `show ${sideShelves.length} more: bags, drinks, odds and ends`}</a></p>` : "";

  const sub = [b.type, b.address, b.neighbourhood, `opened day ${b.opened}`,
    depot ? `supplied from ${shortName(depot)}` : ""].filter(Boolean).join(" · ");
  $("sitePanel").innerHTML = `
    <div class="sitehead rv">
      ${b.code ? `<span class="bullet">${b.code}</span>` : ""}
      <div><h2>${baseName(b)}</h2><span class="sub">${sub}</span></div>
      <div class="aside" style="margin-left:auto;display:flex;gap:8px"><span class="seg" id="sitePick"></span><a href="#" class="ibtn tr" id="siteClose" data-tip="Close the detail">${CLOSE_ICON}</a></div>
    </div>
    <div class="sstats rv">${stats}</div>
    ${grid ? `<section class="sec rv">
      ${sechead("Customers by hour", {why: `${Math.min(...grid.weeks.filter(w => w))} week${
        Math.min(...grid.weeks.filter(w => w)) === 1 ? "" : "s"} of hour reports${
        grid.thin.some(Boolean) ? "; starred days rest on under 2 weeks" : ""}. Shade is customers against the busiest hour, ${
        Math.round(grid.peak)}. An outlined cell is an hour at the ceiling that was on: ${grid.counters} register capacity across ${
        grid.stationCount} counter${grid.stationCount === 1 ? "" : "s"}${grid.door ? `, ${grid.door}/h door cap` : ", no door cap"}.`})}
      <div class="chartbox">${hourGrid(grid, D.meta.day % 7)}<div class="hourread" id="hourRead">Hover an hour</div></div>
      ${notes.map(n => `<p class="quiet">${n}</p>`).join("")}
    </section>` : ""}
    <div class="duo sec" style="grid-template-columns:1fr 2fr">
      <section class="rv">
        ${sechead("Crew", {quiet: `${b.staff || "no"} ${b.staff === 1 ? "person" : "people"}${b.staff ? ` · ${fmt(b.staffCost)}/day` : ""}`})}
        <div class="crew">${crew}</div>
      </section>
      <section class="rv">
        ${sechead("Shelves", {quiet: "before tomorrow's top-up"})}
        ${products}${shelfMore}
      </section>
    </div>
    <div class="duo sec">
      <section class="rv">
        ${sechead(`Profit, last ${b.series.length} days`)}
        <div class="chartbox">${miniChart(b.series, "profit", "var(--accent)")}</div>
      </section>
      <section class="rv">
        ${sechead("Its week", {quiet: b.rhythm ? `peaks ${b.peakDay}, ${b.swing} points between best and worst` : ""})}
        <div class="chartbox" style="padding-bottom:16px">${b.rhythm ? weekHtml(b.rhythm, todayName)
          : `<p class="quiet" style="margin:0">Not enough trading history here yet.</p>`}</div>
      </section>
    </div>`;
  drawSitePicker();
  $("siteClose").onclick = e => { e.preventDefault(); closeSite(); };
  if($("shelfToggle")) $("shelfToggle").onclick = e => { e.preventDefault(); showAllShelves = !showAllShelves; drawSite(); };
  wireSiteHours(); wireTips(); wireReveal();
}

/* The site cell of the redesign's tables: the hood pill, the short name, and
   the type on a line under the name. */
const siteTd = b => `${hoodHtml(b)}${b.code ? "&nbsp; " : ""}${shortName(b)}<span class="sub"${
  b.code ? ` style="padding-left:34px"` : ""}>${b.type}</span>`;
const checkMark = `<span class="check" style="vertical-align:-4px;margin-right:6px">${icon("tick")}</span>`;

function drawStock(){
  const v = SUPPLY_VIEWS[stockView];
  const all = v.rows();
  const worth = all.filter(v.keep);
  const rows = showAllStock ? all : worth;
  const note = v.note();
  $("stockHead").innerHTML = sechead("Stock checks", {why: note || null,
    aside: `<span class="seg" id="stockTools"></span>`});
  seg($("stockTools"), Object.entries(SUPPLY_VIEWS).map(([id, x]) => [id, x.label]),
    () => stockView, x => { stockView = x; showAllStock = false; }, () => { drawStock(); wireAll(); });
  /* The tick means nothing in this view is graded critical or warn; a row the
     view flags without grading it (an unnamed line) counts against it. */
  const calm = all.length > 0
    && !worth.some(r => r.level ? r.level === "critical" || r.level === "warn" : true);
  $("stockVerdict").innerHTML = (calm ? checkMark : "") + v.verdict(all);
  const nothing = all.length
    ? `Nothing here needs reading: ${all.length === 1 ? "the one row is" : `all ${all.length} rows are`} inside their limits.`
    : v.empty;
  $("stock").innerHTML = rows.length
    ? `<thead><tr>${v.head}</tr></thead>
       <tbody>${rows.slice(0, 40).map(r => `<tr>${v.row(r)}</tr>`).join("")}</tbody>`
    : `<tbody><tr><td class="l quiet">${nothing}</td></tr></tbody>`;
  const more = $("stockMore");
  more.innerHTML = all.length > worth.length
    ? (showAllStock
        ? `<a class="link" href="#" id="stockToggle">just the ${worth.length} worth reading</a>`
        : `${all.length - worth.length} more &nbsp;<a class="link" href="#" id="stockToggle">show all ${all.length}</a>`)
      + (rows.length > 40 ? ` &nbsp;first 40 shown` : "")
    : "";
  more.hidden = !more.innerHTML;
  if($("stockToggle")) $("stockToggle").onclick = e => { e.preventDefault(); showAllStock = !showAllStock; drawStock(); wireAll(); };
  document.querySelectorAll("#stock select.linepick").forEach(sel => {
    sel.onchange = () => nameLine(sel.dataset.rid, sel.value || null);
  });
  document.querySelectorAll("#stock button.unname").forEach(b => {
    b.onclick = () => nameLine(b.dataset.rid, null);
  });
}

/* --- logistics set-up ------------------------------------------------ */
/* The two numbers a logistics manager is set with: the weekly import order
   at each depot, consolidated across every factory drawing on it, and the
   daily top-up into each factory. Both come from the factory lines as the
   board reads them (or as you named them), so a line named a minute ago is
   already in the totals. */
const ceil100 = v => Math.ceil(v / 100) * 100;
let logisticsView = "changes";
function drawLogistics(){
  const changesOnly = logisticsView === "changes";
  const f = factoryView();
  const other = (D.supply.factories && D.supply.factories.depotOther) || {};
  const depotsKnown = (D.supply.factories && D.supply.factories.depots) || {};
  const held = (s, slug) => (D.businesses[s].lines.find(l => l.slug === slug) || {}).units || 0;
  const label = (s, slug) => (D.businesses[s].lines.find(l => l.slug === slug) || {}).item || itemName(slug);
  const lines = f.sites.reduce((n, s) => n + s.lines.length, 0);
  const whyText = (f.sites.length
    ? `What to set the logistics managers to, from ${f.machines} machines on ${lines} lines${
        f.unnamed ? `, ${f.unnamed} still unnamed` : ""}.`
    : D.meta.locale === false
      ? "Factory lines need the game's recipe pages: load en.json (More menu) to see them. The import orders are read from the delivery log and are complete."
      : "No factory to feed; the import orders are read from the delivery log.")
    + " Click raise to see the order roll up; the thin line under the depot figure is how much of a day's use it holds.";
  const check = (n, what) => `<span class="check">${icon("tick")}</span><span class="quiet">All ${n} ${what}</span>`;
  const up = (text, tip) => `<span class="up"${tip ? ` data-tip="${attr(tip)}"` : ""}>${icon("arrow_up")}${text}</span>`;
  const set = n => `<span class="set">${n.toLocaleString()}</span>`;
  const grp = (b, cols) => `<tr class="grp"><td class="l" colspan="${cols}">${hoodHtml(b)}${b.code ? "&nbsp; " : ""}${
    shortName(b)} · ${b.type} · ${b.address}</td></tr>`;
  const users = r => r.users.map(u => `${shortName(D.businesses[u.s])} ${u.perDay.toLocaleString()}/d`).join(", ");

  /* --- imports, one group per depot ------------------------------------ */
  const depots = {}, loose = {};
  f.sites.forEach(s => s.needs.forEach(n => {
    if(n.from === null){
      const row = loose[n.slug] = loose[n.slug] || {item: n.item, slug: n.slug, week: 0, users: []};
      row.week += n.perWeek; row.users.push({s: s.s, perDay: n.perDay, lines: n.lines});
      return;
    }
    const d = depots[n.from] = depots[n.from] || {};
    const row = d[n.slug] = d[n.slug] || {item: n.item, slug: n.slug, factoryWeek: 0, users: []};
    row.factoryWeek += n.perWeek; row.users.push({s: s.s, perDay: n.perDay, lines: n.lines});
  }));
  Object.entries(depotsKnown).forEach(([si, items]) => {
    const d = depots[si] = depots[si] || {};
    Object.keys(items).forEach(slug => {
      d[slug] = d[slug] || {item: label(+si, slug), slug, factoryWeek: 0, users: []};
    });
  });
  const importRows = [];
  Object.entries(depots).forEach(([si, items]) => {
    const s = +si;
    const rows = Object.values(items).map(r => {
      const otherWeek = (other[si] || {})[r.slug] || 0;
      const total = r.factoryWeek + otherWeek;
      const current = ((depotsKnown[si] || {})[r.slug] || {}).weekly;
      const fit = current === undefined ? (total ? "none" : "idle") : feedFit(total, current);
      // A weekly order carries a buffer by design; only half again over is worth a word.
      const surplus = current !== undefined && total && current > total * 1.5;
      return {...r, s, otherWeek, total, current, fit, surplus, stock: held(s, r.slug),
              setTo: total ? ceil100(total) : null};
    }).sort((a, b) => b.total - a.total);
    importRows.push({s, rows});
  });
  const looseRows = Object.values(loose).sort((a, b) => b.week - a.week);
  const count = fit => importRows.reduce((n, d) => n + d.rows.filter(fit).length, 0);
  const short = count(r => r.fit === "short" || r.fit === "none");
  const tight = count(r => r.fit === "tight");
  const importAll = count(() => true);
  const shown = (changesOnly
    ? importRows.map(d => ({s: d.s, rows: d.rows.filter(r => r.fit === "short" || r.fit === "none" || r.fit === "tight")}))
    : importRows).filter(d => d.rows.length);
  /* The thin line under the depot figure: how much of a day's draw it holds,
     from the delivery log's measured draw where one is on record, else from
     what this table says leaves in a week. */
  const depotDays = r => {
    const imp = (D.supply.imports || []).find(i => i.s === r.s && i.item === r.item);
    if(imp && imp.daysOnHand !== null && imp.daysOnHand !== undefined) return imp.daysOnHand;
    return r.total ? r.stock / (r.total / 7) : null;
  };
  const depotCell = r => {
    const days = depotDays(r);
    return days === null ? `<td>${r.stock.toLocaleString()}</td>`
      : `<td class="gauge${days < 1 ? " low" : ""}"><i><b style="--w:${Math.min(100, days * 100).toFixed(0)}%"></b></i>${
          r.stock.toLocaleString()}</td>`;
  };
  const setCell = r => r.setTo === null ? chipHtml("dim", "nothing draws it")
    : r.fit === "none" ? `${set(r.setTo)}${up("add")}`
    : r.fit === "short" ? `${set(r.setTo)}${up("raise")}`
    : r.fit === "tight" ? `${set(r.setTo)}${up("raise", "Within 5% of the week it has to cover")}`
    : r.surplus ? `${r.setTo.toLocaleString()} ${chipHtml("dim", "could lower", "More than half again what leaves in a week")}`
    : chipHtml("ok", "covered");
  const importRow = r => `<tr>
      <td class="l">${r.item}<span class="sub">${r.users.length ? users(r) : "no factory line draws it"}</span></td>
      <td>${r.factoryWeek ? r.factoryWeek.toLocaleString() : "—"}</td>
      <td>${r.otherWeek ? r.otherWeek.toLocaleString() : "—"}</td>
      <td>${r.total ? r.total.toLocaleString() : "—"}</td>
      <td data-now="${r.current || 0}" data-to="${r.setTo || 0}">${
        r.current !== undefined ? r.current.toLocaleString() : chipHtml("bad", "not imported")}</td>
      <td>${setCell(r)}</td>
      ${depotCell(r)}</tr>`;
  const looseRow = r => `<tr>
      <td class="l">${r.item}<span class="sub">${users(r)}</span></td>
      <td>${r.week.toLocaleString()}</td><td>—</td><td>${r.week.toLocaleString()}</td>
      <td data-now="0" data-to="${ceil100(r.week)}">${chipHtml("bad", "not imported")}</td>
      <td>${set(ceil100(r.week))}${up("add")}</td>
      <td>—</td></tr>`;
  const importTable = shown.length || looseRows.length ? `<table>
    <thead><tr><th class="l">Material</th><th>Factories / week</th><th>Shops / week</th><th>Used / week</th>
      <th>Order now</th><th>Set order to</th><th>At depot</th></tr></thead>
    <tbody>${shown.map(d => grp(D.businesses[d.s], 7) + d.rows.map(importRow).join("")).join("")}${
      looseRows.length ? `<tr class="grp"><td class="l" colspan="7">On no depot's plan<span class="sub" style="display:inline;margin-left:10px;letter-spacing:0">needed by a factory line, but no top-up brings it from anywhere; add it to a depot's plan and import it there</span></td></tr>${
        looseRows.map(looseRow).join("")}` : ""}</tbody></table>` : "";
  const importState = !importRows.length && !looseRows.length ? `<span class="quiet">No depot imports anything yet</span>`
    : !short && !tight && !looseRows.length ? check(importAll, "cover what leaves")
    : (short ? chipHtml("bad", `${short} short`) : "")
      + (tight ? chipHtml("warn", `${tight} tight`, "Within 5% of the week the order has to cover") : "")
      + (looseRows.length ? chipHtml("bad", `${looseRows.length} on no plan`, "Needed by a factory line, but no depot imports it") : "");
  $("importPlan").innerHTML = sechead("Weekly imports", {after: importState, why: whyText,
    aside: `<span class="seg" id="logisticsTools"></span>`}) + importTable;
  seg($("logisticsTools"), [["changes", "Needs a change"], ["all", "Everything"]],
    () => logisticsView, v => logisticsView = v, () => { drawLogistics(); wireAll(); });

  /* --- top-ups, one group per factory ----------------------------------- */
  const needsChange = r => r.status === "unplanned" || r.status === "target" || r.stalled;
  const allSites = f.sites.map(s => ({s: s.s, rows: s.needs.slice().sort((a, b) => b.perDay - a.perDay)}))
    .filter(x => x.rows.length);
  const topShort = allSites.reduce((n, x) => n + x.rows.filter(r => r.status === "unplanned" || r.status === "target").length, 0);
  const topStalled = allSites.reduce((n, x) => n + x.rows.filter(r => r.stalled && r.status !== "unplanned" && r.status !== "target").length, 0);
  const topAll = allSites.reduce((n, x) => n + x.rows.length, 0);
  const sites = changesOnly
    ? allSites.map(x => ({s: x.s, rows: x.rows.filter(needsChange)})).filter(x => x.rows.length)
    : allSites;
  const lineText = (s, r) => r.lines.map(l => {
    const line = s.lines.find(x => x.item === l);
    return line && line.machines > 1 ? `${l} ×${line.machines}` : l; }).join(", ");
  const topupRow = (site, r) => {
    const over = r.target && r.target > r.perDay * 1.5;
    return `<tr>
      <td class="l">${r.item}<span class="sub">${lineText(site, r)}</span></td>
      <td>${r.perDay.toLocaleString()}</td>
      <td data-now="${r.target || 0}" data-to="${ceil100(r.perDay)}">${r.target ? r.target.toLocaleString() : chipHtml("bad", "none")}</td>
      <td>${r.status === "unplanned" ? `${set(ceil100(r.perDay))}${up("add")}`
        : r.status === "target" ? `${set(ceil100(r.perDay))}${up("raise")}`
        : over ? `${ceil100(r.perDay).toLocaleString()} ${chipHtml("dim", "could lower", "More than half again what the line eats")}`
        : chipHtml("ok", "covered")}</td>
      <td class="l">${r.from !== null ? shortName(D.businesses[r.from]) : "—"}</td>
      <td>${r.known ? r.arrives.toLocaleString() : "—"}${r.status === "waiting"
        ? ` ${chipHtml("dim", "waiting", `${r.lines.join(", ")} stand${r.lines.length === 1 ? "s" : ""} still for want of ${(r.waitingOn || []).join(", ")}`)}`
        : r.status === "staffing" ? ` ${chipHtml("warn", "understaffed", `The roster runs these machines ${Math.round(r.staffedShare * 100)}% of the week`)}`
        : r.stalled ? ` ${chipHtml("warn", "none arrived", "Nothing arrived last week, though the depot holds it")}` : ""}</td></tr>`;
  };
  const topupTable = sites.length ? `<table>
    <thead><tr><th class="l">Material</th><th>Eats / day</th><th>Top-up now</th><th>Set top-up to</th>
      <th class="l">From</th><th>Arrives / day</th></tr></thead>
    <tbody>${sites.map(x => { const site = f.sites.find(s => s.s === x.s);
      return grp(D.businesses[x.s], 6) + x.rows.map(r => topupRow(site, r)).join(""); }).join("")}</tbody></table>` : "";
  const topupState = !allSites.length ? `<span class="quiet">No factory line to feed</span>`
    : !topShort && !topStalled ? check(topAll, "cover their day")
    : (topShort ? chipHtml("bad", `${topShort} short`, "Below the day's need, or on no plan") : "")
      + (topStalled ? chipHtml("warn", `${topStalled} none arrived`) : "");
  $("topupPlan").innerHTML = sechead("Daily top-ups", {after: topupState,
    aside: allSites.length ? `<a class="link" href="#" id="topupAll">${changesOnly ? "show all" : "just what needs a change"}</a>` : ""})
    + topupTable;
  if($("topupAll")) $("topupAll").onclick = e => {
    e.preventDefault(); logisticsView = changesOnly ? "all" : "changes"; drawLogistics(); wireAll(); };
}

/* --- market demand ----------------------------------------------------
   The waves come first: the game's own hype events, supplier trouble, and
   the moves the board measured against its own history, one chip each. Then
   the grid, a business type (or a product) per row and a neighbourhood per
   column, each cell shaded by demand and dotted with rivals. */
let showAllMarket = false;

/* One hue, ramped by demand: the generator's shade(), so a cell reads the same
   here as on the canvas. */
const shadeDemand = d => {
  const a = 0.08 + (d - 40) / 55 * 0.55;
  return `color-mix(in oklab, var(--accent) ${Math.round(Math.max(6, Math.min(70, a * 100)))}%, var(--surface))`;
};
/* Column headers are ten characters wide; the full name is in the header's note. */
const HOOD_SUFFIX = /^(District|City|Heights|Park|Island|Village)$/i;
function shortHood(name){
  let n = name.replace(/^The\s+/i, "");
  if(n.length <= 10) return n;
  const w = n.split(/\s+/);
  if(w.length === 1) return n;
  if(HOOD_SUFFIX.test(w[w.length - 1])){
    const cut = w.slice(0, -1).join(" ");
    if(cut.length <= 10) return cut;
  }
  const head = w.slice(0, -1).join(" "), last = w[w.length - 1];
  const three = `${head} ${last.slice(0, 3)}.`;
  return three.length <= 10 ? three : `${head} ${last[0]}.`;
}
const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + "s")}`;
/* A rival per dot, ten at most; the exact count is in the cell's note. */
const rivalDots = n => n > 0 ? `<span class="rv2">${"<i></i>".repeat(Math.min(n, 10))}</span>` : "";

function waveHtml(dir, place, what, tag, tip, hood){
  const body = `${icon(dir === "up" ? "trend_up" : "trend_dn")}<b>${place}</b>${what}<span class="t">${tag}</span>`;
  return hood
    ? `<a class="wave ${dir}" href="#secMarket" data-hood="${attr(hood)}" data-tip="${attr(tip)}">${body}</a>`
    : `<span class="wave ${dir}" data-tip="${attr(tip)}">${body}</span>`;
}
function drawMovers(){
  const m = D.market;
  const out = [];
  const days = n => `${n} d`;
  m.hype.slice(0,5).forEach(h => {
    const what = (h.count > 1 ? `${h.count} products` : h.items[0])
      + (h.sellHere ? " you sell here" : h.mine ? " you stock" : "");
    const tip = `Hype in ${h.hood} since day ${h.startDay}, ${plural(h.daysLeft, "day")} left: ${
      h.items.join(", ")}. Click to sort the grid by ${h.hood}.`;
    out.push(waveHtml("up", h.hood, what, days(h.daysLeft), tip, h.hood));
  });
  m.shortages.slice(0,5).forEach(x => {
    const where = x.count > 1 ? `${x.count} suppliers` : x.where;
    const kind = x.kind.toLowerCase();
    out.push(waveHtml("dn", x.item, `${kind} at ${where}${x.mine ? ", affects you" : ""}`, days(x.daysLeft),
      `${x.item}: ${kind} at ${where}, ${plural(x.daysLeft, "day")} left${x.mine ? "; you sell or make it" : ""}`));
  });
  /* One wave, or one shop opening, moves a whole range at once, so it reads as
     one chip, and where our own shop opened in that window the note says so. */
  (m.movers || []).slice(0,6).forEach(x => {
    const what = (x.count > 1 ? `${x.count} ${x.family.toLowerCase()} lines` : x.items[0]) + (x.sell ? " you sell here" : "");
    const delta = `${x.delta > 0 ? "+" : ""}${x.delta}`;
    const tip = `${x.hood}: ${x.items.join(", ")}${x.count > x.items.length ? "…" : ""} moved ${delta} on average over ${
      plural(m.trendDays, "day")}${x.openedHere ? `; ${x.openedHere} opened day ${x.openedDay}, inside this window` : ""}. Click to sort the grid by ${x.hood}.`;
    out.push(waveHtml(x.up ? "up" : "dn", x.hood, what, delta, tip, x.hood));
  });
  $("movers").innerHTML = out.length ? out.join("")
    : `<span class="quiet">No demand events running right now${m.trendDays ? "" : "; trend history starts building from today"}.</span>`;
  $$("#movers a[data-hood]").forEach(a => a.onclick = e => {
    e.preventDefault();
    marketSortHood = a.dataset.hood; marketSortDir = -1;
    drawMarket();
  });
}

/* A business type is only worth opening if most of its range sells, so the
   cell leads with how much of the range is wanted; the shade is the average. */
function typeRow(r, i, hoods){
  let h = `<div class="r" data-r="${i}">${r.type}<small>${r.products} products${r.mine ? " · you run one" : ""}</small></div>`;
  r.cells.forEach((c, j) => {
    if(!c){ h += `<div class="cell none" data-r="${i}" data-c="${j}" data-tip="${attr(`${r.type} in ${hoods[j]}: no reading`)}">—</div>`; return; }
    const tip = `${r.type} in ${c.hood}: ${c.strong} of ${c.count} products in strong demand (60+), average demand ${
      c.demand}, ${plural(c.providers, "rival seller")} on average across the range${c.here ? ", you have a store here" : ""}`;
    h += `<div class="cell${c.here ? " mine" : ""}" data-r="${i}" data-c="${j}" style="background:${shadeDemand(c.demand)}" data-tip="${attr(tip)}">${
      c.strong}/${c.count}${rivalDots(c.providers)}</div>`;
  });
  return h;
}
function productRow(r, i, hoods, trendDays){
  const tag = r.make && !r.sell ? "you make this, not sold" : r.make ? "you make and sell it" : r.sell ? "you sell it" : "";
  let h = `<div class="r" data-r="${i}">${r.item}<small>${tag}</small></div>`;
  r.cells.forEach((c, j) => {
    if(!c){ h += `<div class="cell none" data-r="${i}" data-c="${j}" data-tip="${attr(`${r.item} in ${hoods[j]}: no reading`)}">—</div>`; return; }
    const tip = `${r.item} in ${c.hood}: demand ${c.demand}, ${c.monopoly ? "only you sell it" : plural(c.providers, "seller")}${
      c.hype ? `, hype for ${plural(c.hype, "more day")}` : ""}${
      c.delta ? `, ${c.delta > 0 ? "+" : ""}${c.delta} over ${plural(trendDays, "day")}` : ""}${
      c.sell && !c.monopoly ? ", you sell it here" : ""}`;
    h += `<div class="cell${c.sell ? " mine" : ""}" data-r="${i}" data-c="${j}" style="background:${shadeDemand(c.demand)}" data-tip="${attr(tip)}">${
      c.demand}${rivalDots(c.monopoly ? 0 : c.providers)}</div>`;
  });
  return h;
}

/* One click on a neighbourhood puts its strongest demand at the top; a second
   flips it. Cells with no reading stay at the bottom either way. */
function hoodSorted(rows, hoods){
  const at = hoods.indexOf(marketSortHood);
  if(at < 0) return rows;
  // A type row sorts by how much of its range is wanted, a product row by
  // demand, with the average as the tiebreak.
  const d = r => { const c = r.cells[at];
    return !c ? null : "strong" in c ? [c.strong / c.count, c.demand] : [c.demand, 0]; };
  return rows.slice().sort((a, b) => {
    const x = d(a), y = d(b);
    if(x === null || y === null) return (x === null) - (y === null);
    return ((x[0] - y[0]) || (x[1] - y[1])) * marketSortDir;
  });
}
function wireMarketSort(){
  $$("#market .h[data-hood]").forEach(h => h.onclick = () => {
    const name = h.dataset.hood;
    if(marketSortHood === name) marketSortDir = -marketSortDir;
    else { marketSortHood = name; marketSortDir = -1; }
    drawMarket();
  });
  const usual = $("marketUsual");
  if(usual) usual.onclick = e => { e.preventDefault(); marketSortHood = null; drawMarket(); };
  const more = $("marketMore");
  if(more) more.onclick = e => { e.preventDefault(); showAllMarket = !showAllMarket; drawMarket(); };
}

const MARKET_TOP = 20;  // product rows before "show all"
function drawMarket(){
  const m = D.market;
  if(marketSortHood && !m.hoods.includes(marketSortHood)) marketSortHood = null;
  const types = marketView === "types";
  let rows, limit;
  if(types){ rows = m.types; limit = rows.length; }
  else if(marketView === "mine"){ rows = m.rows.filter(r => r.sell || r.make); limit = 60; }
  else {
    // Strongest unserved demand first, and among equals the emptiest market.
    rows = m.rows.filter(r => !r.sell)
      .sort((a,b) => (b.gap?.demand ?? 0) - (a.gap?.demand ?? 0)
                  || (a.gap?.providers ?? 99) - (b.gap?.providers ?? 99));
    limit = 40;
  }
  rows = hoodSorted(rows, m.hoods);
  const cap = Math.min(rows.length, limit);
  const shown = rows.slice(0, types || showAllMarket ? cap : Math.min(MARKET_TOP, cap));

  const notes = [];
  if(marketSortHood) notes.push((types
      ? `Sorted by how much of the range ${marketSortHood} wants, ${marketSortDir < 0 ? "most" : "least"} first`
      : `Sorted by demand in ${marketSortHood}, ${marketSortDir < 0 ? "highest" : "lowest"} first`)
    + ` · <a class="link" href="#" id="marketUsual">usual order</a>`);
  else if(types && m.typesHidden) notes.push(`${plural(m.typesHidden, "type")} with under 3 products left out`);
  else if(marketView === "new") notes.push("Strongest unserved demand first");
  else if(!m.trendDays) notes.push("Trend history starts building from today");
  if(!types && cap > MARKET_TOP) notes.push(showAllMarket
    ? `all ${cap} · <a class="link" href="#" id="marketMore">top ${MARKET_TOP}</a>`
    : `${MARKET_TOP} of ${cap} · <a class="link" href="#" id="marketMore">show all ${cap}</a>`);
  $("marketNote").innerHTML = notes.join(" · ");
  $("marketWhy").dataset.tip = types
    ? `Each cell is how many of a type's products are in strong demand (60 or more) in that neighbourhood, shaded by the average demand across the range. Dots count rival sellers. An outlined cell is where you already run a shop of that type. Hover to light a row and a column, click a cell to pin its story below, click a neighbourhood to sort by it.`
    : `Each cell is the demand for a product in that neighbourhood, 0 to 100, shaded to match. Dots count sellers; no dots means only you. An outlined cell is where you already sell it. Hover to light a row and a column, click a cell to pin its story below, click a neighbourhood to sort by it.`;

  const grid = $("market");
  grid.style.gridTemplateColumns = `200px repeat(${m.hoods.length},minmax(0,1fr))`;
  grid.innerHTML = shown.length
    ? `<div></div>` + m.hoods.map((h, j) => `<div class="h${h === marketSortHood ? " sort" : ""}" data-c="${j}" data-hood="${attr(h)}" data-tip="${
        attr(`${h}: click to sort by demand here`)}">${shortHood(h)}</div>`).join("")
      + shown.map((r, i) => types ? typeRow(r, i, m.hoods) : productRow(r, i, m.hoods, m.trendDays)).join("")
    : `<span class="quiet" style="grid-column:1/-1">${types ? "No business type matched." : "Nothing here."}</span>`;
  $("cellDetail").textContent = "Click a cell";
  wireMarketSort();
  wireTips();
}

/* --- plan a chain -----------------------------------------------------
   The recipes, the workstations and the prices come across from the save as
   they were read; every number is worked out in the browser, so a stepper is
   instant and nothing about the plan is decided in Python.

   Two facts set the shape of this. A workstation runs flat out around the
   clock, so a line's output is fixed by how many machines are on it and never
   by what the shops happen to want. And anything the shops do not take is
   exported rather than wasted. So the number that has to be right is the raw
   material a week — order short and the machines stop; the shops are the
   ones the player already runs, and what they take is what they sell today.
   The arithmetic itself (machines × rate × 24 h × 7 d, the ingredient sums,
   the surplus) lives in planDraw() with the other wiring. */
let planType = null, planCounts = {};

const RECIPE_BY = {};
function indexPlan(){
  for(const k in RECIPE_BY) delete RECIPE_BY[k];
  (D.plan.recipes || []).forEach(r => RECIPE_BY[r.slug] = r);
}
/* A slug becomes a name through the plan's own list, then the full name map,
   then, if nobody named it, the slug made readable. */
const prettySlug = slug => slug.replace(/^ba:[a-z]+_/, "").replace(/([a-z])(\d)/g, "$1 $2")
  .replace(/^./, c => c.toUpperCase());
const itemName = slug => (D.plan.items || {})[slug] || (D.itemNames || {})[slug] || prettySlug(slug);
const HOURS = 24;  // a workstation keeps running while the shops are shut

function planTypes(){
  const cat = D.plan.catalogue || {};
  return Object.keys(cat)
    .filter(k => (cat[k].products || []).length >= 2)
    .sort((a,b) => cat[a].type.localeCompare(cat[b].type));
}

/* What one shop actually shifts is measured where the owner runs the type, so
   the split between shelf and export starts from his trading, not a guess. */
function defaultRate(kind){
  const own = (D.plan.own || {})[kind];
  const vals = own ? Object.values(own.perDay || {}) : [];
  if(!vals.length) return null;
  return Math.max(1, Math.round(vals.reduce((a,b) => a+b, 0) / vals.length));
}
const machinesOn = slug => Math.max(0, planCounts[slug] ?? 1);

function drawPlan(){
  indexPlan();
  const types = planTypes();
  if(!types.length){
    $("planNote").textContent = "No product catalogue in this save.";
    $("planPicker").innerHTML = ""; $("planBody").innerHTML = ""; $("ingBody").innerHTML = "";
    return;
  }
  if(!types.includes(planType))
    planType = types.includes("ba:businesstype_supermarket")
      ? "ba:businesstype_supermarket" : types[0];
  const cat = D.plan.catalogue, own = (D.plan.own || {})[planType];
  const kind = cat[planType].type, low = kind.toLowerCase();
  const shops = own ? (own.shops ?? own.sites) || 0 : 0;
  const perShop = defaultRate(planType) || 0;
  const pick = k => { planType = k; planCounts = {}; drawPlan(); };

  /* The types the player runs are the segments, as on the canvas; every other
     type the city sells is one select away. */
  const owned = types.filter(k => (D.plan.own || {})[k]);
  const others = types.filter(k => !owned.includes(k));
  $("planPicker").innerHTML = (owned.length ? `<span class="seg" id="planTypes"></span>` : "") + (others.length
    ? `<span class="field" style="margin:0"><select id="planPick" aria-label="Another business type">
        <option value="" ${others.includes(planType) ? "" : "selected"} disabled>Another type…</option>${
        others.map(k => `<option value="${attr(k)}" ${k === planType ? "selected" : ""}>${cat[k].type} · ${cat[k].products.length}</option>`).join("")}
      </select></span>` : "");
  if(owned.length) seg($("planTypes"), owned.map(k => [k, cat[k].type]), () => planType, k => { planType = k; planCounts = {}; }, drawPlan);
  const sel = $("planPick");
  if(sel) sel.onchange = e => pick(e.target.value);

  /* One line per product with a recipe. The ingredient factors are the recipe
     page flattened: units of ingredient per unit made, so the wiring's
     machines × rate × 24 × 7 × factor is the same figure the logistics table
     draws for a running line. */
  const ws = D.plan.workstations || {}, sources = D.plan.sources || {}, prices = D.plan.prices || {};
  const tips = {};
  let bought = 0;
  const lines = cat[planType].products.map(slug => {
    const r = RECIPE_BY[slug];
    if(!r){
      bought++;
      return `<tr><td class="l">${itemName(slug)}<span class="sub">no recipe in the game: bought in</span></td>
        <td class="l" colspan="4"><span class="quiet">the game documents no way to make this one; the shops buy it from an importer</span></td></tr>`;
    }
    const station = ws[r.workstation] || {};
    const kit = [...(station.assembly || []), ...(station.machines || [])];
    const ing = r.ingredients.map(i => `${i.item}:${i.per / r.out}`).join(",");
    r.ingredients.forEach(i => {
      const src = sources[i.slug], unit = prices[i.slug];
      tips[i.item] = (src
        ? `${src.ordered.toLocaleString("en-US")} a week on order now from ${src.from} to ${src.warehouse}${src.active ? "" : " (contract paused)"}`
        : "Not on any import contract yet") + (unit !== undefined ? `; ${fmt(unit)} each on day ${D.plan.priceDay}` : "");
    });
    return `<tr class="line" data-m="${machinesOn(slug)}" data-min="0" data-max="12" data-rate="${r.out}" data-ing="${attr(ing)}" data-slug="${attr(slug)}" data-name="${attr(r.item)}">
      <td class="l">${r.item}<span class="sub" data-tip="${attr(`One ${station.name || r.workstation} is ${kit.length ? kit.join(" + ") : "one machine"}; one makes ${(r.out * HOURS).toLocaleString("en-US")} a day`)}">${
        r.out.toLocaleString("en-US")}/h rated · ${station.name || r.workstation}</span></td>
      <td class="l"><span class="step"><a href="#" data-d="-1" aria-label="one machine fewer">−</a><b>${machinesOn(slug)}</b><a href="#" data-d="1" aria-label="one machine more">+</a><span class="machines"></span></span></td>
      <td class="made"></td><td class="covers"></td><td class="l"><span class="ing"></span></td></tr>`;
  });

  $("planNote").textContent = bought ? `${plural(bought, "product")} of ${cat[planType].products.length} bought in` : "";
  $("planBody").innerHTML = `
    <div class="planstats">
      <div class="planstat"><span class="lab">Machines</span><div class="v" id="vMachines"></div></div>
      <div class="planstat"><span class="lab">Made / week</span><div class="v"><span id="vMade"></span><small>units</small></div></div>
      <div class="planstat"><span class="lab">Raw material / week</span><div class="v"><span id="vRaw"></span><small>units to import</small></div></div>
    </div>
    <table data-pershop="${perShop}" data-shops="${shops}" data-ingtips="${attr(JSON.stringify(tips))}">
      <thead><tr><th>Product</th><th class="l">Machines</th><th>Made / week</th><th>Supplies</th><th class="l">Raw material / week</th></tr></thead>
      <tbody>${lines.join("")}</tbody>
    </table>
    <p class="planline">${own && perShop
      ? `Your <b>${shops}</b> ${low}${shops === 1 ? "" : "s"} take what ${shops === 1 ? "it sells" : "they sell"} today, <b>${
          perShop.toLocaleString("en-US")}</b> a day per product. Everything above that, <b id="vSurplus"></b> units a week, is surplus for export.`
      : `You do not run a ${low} yet, so nothing here is measured: everything made, <b id="vSurplus"></b> units a week, is surplus for export until the shops exist.`}</p>`;
  planDraw();
  wireTips();
}

/* The top of the list is the money; the full list is what a factory planner
   needs, every product with its week of sales across all stores. The revenue
   bar sits in the cell so the shape of the range reads before the figures do. */
function drawProducts(){
  const TOP = 14, all = D.products;
  const rows = showAllProducts ? all : all.slice(0, TOP);
  /* A column that is empty on two rows in three is not a column. When most
     products do have a weekday peak it stays; otherwise it moves into the
     product's own note. */
  const withPeak = rows.filter(p => p.peak).length;
  const showPeak = withPeak * 2 >= rows.length;
  /* The list is sorted by revenue, so the first row is the bar's full width. */
  const top = rows.length ? rows[0].revenue : 1;
  const peakTip = p => p.peak
    ? `Peaks ${p.peak}, ${p.swing} points between best and worst day`
    : "No weekly cycle clears the noise test";
  const more = all.length > TOP
    ? `<a class="link" href="#" id="productsToggle" aria-expanded="${showAllProducts}">${
        showAllProducts ? `top ${TOP} only` : `all ${all.length}`}</a>`
    : `<span class="quiet">all ${all.length}</span>`;
  $("secProducts").innerHTML = sechead("Products", {
    why: `Revenue and units are yesterday summed over every store that sells the line;`
      + ` units a week is the last seven days, and stores is how many carry it.`
      + (showPeak
        ? " Peaks names the weekday that sells best and the points between best and worst day."
        : ` Weekday peaks are on the product's own note; ${withPeak} of ${rows.length} have one.`),
    quiet: "by revenue yesterday",
    aside: more,
  }) + `<table>
    <thead><tr><th class="l">Product</th><th>Revenue / day</th><th>Units / day</th>
      <th data-tip="Sales across all stores over the last 7 days">Units / week</th>
      <th>Avg price</th><th>Stores</th>${showPeak?`<th>Peaks</th>`:""}</tr></thead>
    <tbody>${rows.map(p=>`<tr>
      <td class="l"${showPeak?"":` data-tip="${attr(peakTip(p))}"`}>${p.item}</td>
      <td><span class="bar"><i style="width:${(p.revenue / top * 100).toFixed(0)}%"></i></span>${fmt(p.revenue)}</td>
      <td>${p.units.toLocaleString()}</td>
      <td>${(p.week ?? p.units * 7).toLocaleString()}</td>
      <td>$${p.price.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
      <td>${p.stores}</td>
      ${showPeak?`<td class="${p.peak?"pos":""}" data-tip="${attr(peakTip(p))}">${
        p.peak ? `${p.peak.slice(0,3)} +${p.swing}` : "—"}</td>`:""}</tr>`).join("")}</tbody></table>`;
  const toggle = $("productsToggle");
  if(toggle) toggle.onclick = () => { showAllProducts = !showAllProducts; drawProducts(); };
}

/* Payroll is the headcount by role against the biggest role, and whatever needs
   doing as a chip beside the heading: nobody unhappy and nothing absent leaves
   one satisfaction chip. */
function drawPayroll(){
  const st = D.staff;
  const trouble = [["unhappy", st.unhappy, "Satisfaction below 70%"],
                   ["out", st.absent, "Absent today"],
                   ["complaining", st.complaining, "With an open complaint"]].filter(([,v]) => v);
  const max = Math.max(...st.roles.map(r => r.count), 1);
  $("secPayroll").innerHTML = sechead("Payroll", {
    quiet: `${st.total} people · ${fmt(st.dailyCost)} / day`,
    aside: chipHtml(st.avgSatisfaction >= 70 ? "ok tr" : "warn tr", `${st.avgSatisfaction}%`,
        `Average satisfaction across ${st.total} staff`)
      + trouble.map(([l, v, tip]) => chipHtml("warn tr", `${v} ${l}`, tip)).join(""),
  }) + `<div class="roles">${st.roles.map(r => `<div class="role rv">
      <span>${r.role}</span>
      <span class="tr"><i style="width:${(r.count / max * 100).toFixed(0)}%"></i></span>
      <span class="c">${r.cost != null
        ? `<span>${r.count}</span><b>${money(r.cost)}</b>`
        : r.count}</span></div>`).join("")}</div>`;
}

/* The career totals as a checklist, then the house rules. The stored difficulty
   is only a slot number, and a custom game keeps its own multipliers whatever
   that slot says, so the settings themselves are what answers "how hard is
   this game" — and they are worth stating, because several of them are doing
   real work here. */
function drawGoals(){
  const g = D.goals, h = D.meta.houseRules;
  const moved = (h?.rules || []).filter(r => r.lean !== "level");
  /* A row with a denominator is ticked when it is complete; the rest are
     totals the player has banked, with no target to count them against, so
     they are ticked once off zero. */
  const ofAll = (n, total) => [total > 0 && n >= total, `${n} / ${total}`];
  const miles = [
    ["Personal goals completed", g.completed > 0, g.completed.toLocaleString()],
    ["Diplomas earned", ...ofAll(g.diplomas, g.diplomasTotal)],
    ...(g.rivalsTotal ? [["Rivals seen off", ...ofAll(g.rivalsDefeated, g.rivalsTotal)]] : []),
    ["Goods produced in the factories", g.goodsProduced > 0, g.goodsProduced.toLocaleString()],
    ["Tax paid", g.taxesPaid > 0, fmt(g.taxesPaid)],
  ];
  $("secGoals").innerHTML = sechead("Milestones", {
    why: "The stored difficulty is only a slot number, and a custom game keeps its own"
      + " multipliers whatever that slot says, so the house rules below are the honest"
      + " answer to how hard this game is. Only the rules that moved off stock are listed.",
    quiet: h ? `career totals · playing on ${h.label.toLowerCase()}, ${h.harder} harder${
        h.easier ? `, ${h.easier} easier` : ""}, started on ${fmt(h.startingMoney)}`
      : `career totals · playing on ${D.meta.difficulty}`,
  }) + `<div class="miles">${miles.map(([label, done, text]) =>
      `<div class="mile${done ? " done" : ""}"><span class="box">${icon("tick")}</span>${
        label}<span class="c">${text}</span></div>`).join("")}</div>`
    + (moved.length ? `<div class="rules">${moved.map(r =>
        `<span data-tip="${attr(`${r.what[0].toUpperCase()}${r.what.slice(1)}. Stock is ×${
          r.neutral}, so this game is ${r.lean}.`)}">${r.name}<b>×${r.value}</b></span>`).join("")}</div>`
      : "");
}

function drawFooter(){
  const m = D.meta;
  const f = $("footFile");
  f.textContent = `${m.source} · saved ${m.saved}`;
  f.dataset.tip = `Board built ${m.generated}`;
  $("footBuild").textContent = `Game build ${m.build}`;
}

function renderAll(){
  indexTrends();
  drawMast(); drawKpis(); drawAlerts();
  drawChart(); drawRhythm(); drawPortfolio(); drawSitePicker(); drawSite();
  drawLogistics(); drawStock(); drawFlow();
  drawMovers(); drawMarket(); drawPlan();  // changed for growth: no drawExpansion()
  drawProducts(); drawPayroll(); drawGoals(); drawFooter();
  wireAll();
}

/* --- pages ------------------------------------------------------------ */
/* One page at a time. Today is the daily check: four tiles and the list.
   Everything else is a place you go on purpose — results by chain and site,
   the supply round, growth planning, the company's reference tables. Which
   page and which view are remembered on this device and mirrored in the hash. */
const PAGES = [
  {id:"today",   label:"Today",   host:"pageToday"},
  {id:"results", label:"Results", host:"pageResults"},
  {id:"supply",  label:"Supply",  host:"pageSupply"},
  {id:"growth",  label:"Growth",  host:"pageGrowth"},
  {id:"company", label:"Company", host:"pageCompany"},
];
const SUBS = {
  supply: {host:"pageSupply", nav:"supplyNav", key:"ba_dash_supply", start:"orders",
           items:[["orders","Orders"],["checks","Checks"],["map","Map"]]},
  // changed for growth: Expand is gone; Growth is Demand and Plan a chain.
  growth: {host:"pageGrowth", nav:"growthNav", key:"ba_dash_growth", start:"market",
           items:[["market","Demand"],["plan","Plan a chain"]]},
};
const PAGE_KEY = "ba_dash_page";
const remembered = key => { try{ return localStorage.getItem(key); }catch(e){ return null; } };
const remember = (key, v) => { try{ localStorage.setItem(key, v); }catch(e){} };
let page = "today";
const sub = {};
Object.entries(SUBS).forEach(([id, sv]) => {
  const saved = remembered(sv.key);
  sub[id] = sv.items.some(([k]) => k === saved) ? saved : sv.start;
});

function showSub(pageId, id){
  const sv = SUBS[pageId];
  if(!sv || !sv.items.some(([k]) => k === id)) return;
  sub[pageId] = id;
  document.querySelectorAll(`#${sv.host} section[data-sub]`).forEach(sec => { sec.hidden = sec.dataset.sub !== id; });
  $(sv.nav).innerHTML = sv.items.map(([k, label]) =>
    `<a href="#${k}" data-id="${k}" class="${k === id ? "on" : ""}">${label}</a>`).join("");
  remember(sv.key, id);
  wireReveal();
}
function showPage(id, scroll = true){
  if(!PAGES.some(p => p.id === id)) id = "today";
  page = id;
  PAGES.forEach(p => { $(p.host).hidden = p.id !== id; });
  document.querySelectorAll("#nav a[data-id]").forEach(a => a.classList.toggle("on", a.dataset.id === id));
  remember(PAGE_KEY, id);
  try{ if(location.hash !== "#" + id) history.replaceState(null, "", "#" + id); }catch(e){}
  /* The chart sizes itself from its rendered width, which was zero while its
     page was hidden. */
  if(id === "results") drawChart();
  /* The masthead is sticky, so the top of the new page is the top of the window. */
  if(scroll && window.scrollY > 0) window.scrollTo(0, 0);
  wireReveal();
  requestAnimationFrame(inkHome);
}
$("nav").innerHTML = PAGES.map(p =>
  `<a href="#${p.id}" data-id="${p.id}">${icon(p.id)}<span>${p.label}</span></a>`).join("") + '<i class="ink"></i>';
$("nav").addEventListener("click", e => {
  const a = e.target.closest("a[data-id]");
  if(!a) return;
  e.preventDefault();
  showPage(a.dataset.id);
});
Object.entries(SUBS).forEach(([id, sv]) => $(sv.nav).addEventListener("click", e => {
  const a = e.target.closest("a[data-id]");
  if(!a) return;
  e.preventDefault();
  showSub(id, a.dataset.id);
}));
window.addEventListener("hashchange", () => {
  const h = location.hash.slice(1);
  if(PAGES.some(p => p.id === h)) showPage(h, false);
  else if(SEC_PAGE[h]) reveal(h);
});

/* --- which kinds of finding make the list ------------------------------- */
/* Every "group" a finding in the Needs attention panel can carry — see note()
   and _idle_notes() in the Python build. Kept in sync by hand since the two
   sides only share the group key, not a label. */
const ALERT_GROUPS = [
  {id:"notrading",    label:"Not trading yet",        note:"Open, but with no staff, no stock or no trading day", on:true},
  {id:"vacant",       label:"Vacant leases",          note:"A lease still paying rent with no business in it", on:true},
  {id:"loss",         label:"Losing money",           note:"A business that lost money yesterday", on:true},
  {id:"staff",        label:"Staffing",               note:"A shop with nobody on, or a machine nobody is posted to", on:true},
  {id:"satisfaction", label:"Low satisfaction",       note:"Customer satisfaction under 80%", on:true},
  {id:"promotion",    label:"Promotion below cap",    note:"A shop under the 100% cap with campaigns left to run", on:true},
  {id:"uniform",      label:"No staff uniforms",      note:"Customers notice staff with no uniform set", on:true},
  {id:"bathroom",     label:"No customer bathroom",   note:"Customers here expect a bathroom and there is none", on:true},
  {id:"toiletprivacy",label:"Bathroom has no privacy",note:"A customer bathroom with no stall or door", on:true},
  {id:"sink",         label:"No customer sink",       note:"Nowhere for customers to wash their hands", on:true},
  {id:"music",        label:"No music playing",       note:"A shop trading in silence", on:true},
  {id:"interior",     label:"Interior design too low",note:"Interior design below what customers expect here", on:true},
  {id:"hype",         label:"Demand wave ending",     note:"A wave with days left and a site trading under it", on:true},
  {id:"trend",        label:"Revenue trend",          note:"A shop's week up or down by more than 15%", on:true},
  {id:"unplanned",    label:"No distribution plan",   note:"A shelf selling goods no plan tops up", on:true},
  {id:"outruns",      label:"Outsells its top-up",    note:"A peak day that empties the shelf before the next drop", on:true},
  {id:"paused",       label:"Import paused",          note:"An import switched off with the depot still drawing", on:true},
  {id:"feed",         label:"Factory inputs",         note:"An input arriving short of what the machines need", on:true},
  {id:"unnamed",      label:"Unnamed factory line",   note:"A machine running a recipe the board cannot name", on:true},
  {id:"unset",        label:"Machine with no recipe", note:"A machine staffed and rented, making nothing", on:true},
  {id:"shortfall",    label:"Import shortfall",       note:"A depot that runs dry before the next import lands", on:true},
  {id:"order",        label:"Weekly order too small", note:"An import that cannot cover its own week", on:true},
  {id:"atcap",        label:"At capacity",            note:"Hours a week the door, staff or registers turn people away", on:false},
  {id:"idlestaff",    label:"Overstaffed hours",      note:"Counters staffed through hours that buy nothing", on:false},
  {id:"dead",         label:"Stock not moving",       note:"Goods sitting in a depot no line draws from", on:true},
  {id:"target",       label:"Top-up target too high", note:"A top-up target far above what the shops sell", on:true},
];
const ALERT_SETTINGS_KEY = "ba_dash_alert_groups";
/* The control that opens the panel: the tune button in the Needs attention
   section head, anything marked data-kinds, or the legacy "Filter kinds"
   button while the old markup is still there. Whichever one is clicked becomes
   the anchor; with none on the page the panel hangs off the section's top
   right. */
const KINDS_TOGGLE = "#alertSection .sechead .ibtn, [data-kinds], #alertKindsToggle";
let kindsPop = null, kindsAnchor = null;

/* How many findings each kind puts on the board today — read from the whole
   unfiltered set, the read-out lines and the smaller ones counted below them
   together, so the number does not change as the switches move. */
function kindCounts(){
  const n = {};
  const add = rows => (rows || []).forEach(r => { n[r.group] = (n[r.group] || 0) + 1; });
  if(D){ add(D.alerts); add((D.minor || {}).rows); }
  return n;
}
function drawKindRows(){
  const host = kindsPop && kindsPop.querySelector(".kinds");
  if(!host) return;
  const n = kindCounts(), at = host.scrollTop;
  host.innerHTML = ALERT_GROUPS.map(g => {
    const on = !!alertGroupPrefs[g.id];
    return `<div class="kind"><div><b>${g.label}</b><small>${g.note}</small></div>`
      + `<span class="c">${n[g.id] || 0} today</span>`
      + `<span class="sw${on ? " on" : ""}" data-kind="${g.id}" role="switch"`
      + ` aria-checked="${on}" aria-label="${attr(g.label)}" tabindex="0"></span></div>`;
  }).join("");
  host.scrollTop = at;
}
/* Where the panel sits: under the button that opened it, its right edge in
   line with the button's, clamped into the window. With no button on the page
   yet it hangs off the top right of the Needs attention section. */
function placeKindsPop(){
  const vw = document.documentElement.clientWidth || window.innerWidth;
  const vh = document.documentElement.clientHeight || window.innerHeight;
  let r = kindsAnchor && kindsAnchor.getBoundingClientRect();
  if(!r || !r.width){
    const sec = document.getElementById("alertSection");
    const s = sec && sec.getBoundingClientRect();
    r = s && s.width ? {right: s.right, top: s.top, bottom: s.top + 8}
                     : {right: vw - 40, top: 120, bottom: 128};
  }
  const rows = kindsPop.querySelector(".kinds");
  if(rows) rows.style.maxHeight = "";
  let h = kindsPop.offsetHeight;
  const y0 = r.bottom + 10, room = vh - 12 - y0;
  /* Twenty-six kinds are taller than a short window. The rows give up whatever
     height the window cannot spare, down to a floor; only past that does the
     panel leave the button it hangs from. */
  if(rows && h > room && room > 240){
    rows.style.maxHeight = Math.max(200, rows.offsetHeight - (h - room)) + "px";
    h = kindsPop.offsetHeight;
  }
  let y = y0;
  if(y + h > vh - 12){
    const above = r.top - 10 - h;
    y = above >= 12 ? above : vh - 12 - h;
  }
  kindsPop.style.left = Math.max(12, Math.min(r.right - kindsPop.offsetWidth, vw - kindsPop.offsetWidth - 12)) + "px";
  kindsPop.style.top = Math.max(12, y) + "px";
}
function closeKindsPanel(){
  if(!kindsPop || !kindsPop.classList.contains("on")) return;
  kindsPop.classList.remove("on");
  document.querySelectorAll(KINDS_TOGGLE).forEach(a => a.setAttribute("aria-expanded", "false"));
}
function openKindsPanel(anchor){
  if(!kindsPop) buildAlertSettingsPanel();
  kindsAnchor = anchor && anchor.nodeType === 1 ? anchor : document.querySelector(KINDS_TOGGLE);
  drawKindRows();
  kindsPop.classList.add("on");
  placeKindsPop();
  if(kindsAnchor) kindsAnchor.setAttribute("aria-expanded", "true");
}
/* The one entry point the Needs attention head calls: the tune button toggles
   the panel and anchors it under itself. */
function toggleKindsPanel(anchor){
  if(kindsPop && kindsPop.classList.contains("on")) closeKindsPanel();
  else openKindsPanel(anchor);
}

/* The panel is a body-level popover, like #tip: a section's paint containment
   would clip one rendered inside it. Built once, on boot, because the
   preferences it reads have to be in place before the first drawAlerts(); the
   counts are filled in each time it opens, so a live refresh cannot leave a
   stale number behind. */
function buildAlertSettingsPanel(){
  let saved = {};
  try{ saved = JSON.parse(localStorage.getItem(ALERT_SETTINGS_KEY)) || {}; }catch(e){}
  ALERT_GROUPS.forEach(g => { alertGroupPrefs[g.id] = saved.hasOwnProperty(g.id) ? !!saved[g.id] : g.on; });
  if(kindsPop){ drawKindRows(); return; }
  kindsPop = document.createElement("div");
  kindsPop.className = "pop";
  kindsPop.id = "alertPop";
  kindsPop.setAttribute("role", "dialog");
  kindsPop.setAttribute("aria-label", "Which kinds make the list");
  kindsPop.innerHTML = `<h3>Which kinds make the list</h3>
    <p>Off means the kind is left out of the list and its counts. Saved on this device.</p>
    <div class="kinds"></div>
    <div class="foot2"><a class="link" href="#" data-kinds-reset>reset to the board's defaults</a>`
    + `<a class="btn2 primary" href="#" data-kinds-done>Done</a></div>`;
  document.body.appendChild(kindsPop);
  drawKindRows();

  /* The switches themselves are wired by wireKinds(), with everything else. */
  kindsPop.addEventListener("click", e => {
    if(!e.target.closest) return;
    if(e.target.closest("[data-kinds-done]")){ e.preventDefault(); closeKindsPanel(); return; }
    if(!e.target.closest("[data-kinds-reset]")) return;
    e.preventDefault();
    /* Back to the board's defaults, and out of storage entirely, so a later
       change to a default is picked up rather than frozen. */
    ALERT_GROUPS.forEach(g => { alertGroupPrefs[g.id] = g.on; });
    try{ localStorage.removeItem(ALERT_SETTINGS_KEY); }catch(e2){}
    drawKindRows();
    drawAlerts();
  });
  /* A switch is not a button, so the keyboard needs saying out loud. */
  kindsPop.addEventListener("keydown", e => {
    const sw = e.target.closest && e.target.closest(".sw");
    if(!sw || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    sw.click();
  });
  document.addEventListener("click", e => {
    const t = e.target.closest && e.target.closest(KINDS_TOGGLE);
    if(!t) return;
    e.preventDefault();
    toggleKindsPanel(t);
  });
  /* Outside click closes it; mousedown, so the click that follows lands on
     whatever was clicked rather than on a panel that is still there. */
  document.addEventListener("mousedown", e => {
    if(!kindsPop.classList.contains("on")) return;
    if(kindsPop.contains(e.target) || (e.target.closest && e.target.closest(KINDS_TOGGLE))) return;
    closeKindsPanel();
  });
  document.addEventListener("keydown", e => {
    if(e.key !== "Escape" || !kindsPop.classList.contains("on")) return;
    closeKindsPanel();
    if(kindsAnchor) kindsAnchor.focus();
  });
  window.addEventListener("resize", () => { if(kindsPop.classList.contains("on")) placeKindsPop(); });
  /* The panel follows the button as the page scrolls — but the rows scrolling
     inside it are not the page moving, and re-measuring would fight them. */
  window.addEventListener("scroll", e => {
    if(!kindsPop.classList.contains("on")) return;
    if(e.target && e.target.nodeType === 1 && kindsPop.contains(e.target)) return;
    placeKindsPop();
  }, true);
}
buildAlertSettingsPanel();

/* --- the redesign's interactions ---------------------------------------------
   MARKUP CONTRACT. Each wire*() below works on whatever is in the DOM, found by
   class and data attribute; a view only has to emit the markup. Pointer and
   click handlers are delegated on document and bound once, so wireAll() runs
   after every renderAll() without doubling up. Sticky UI state — which
   severities are filtered, which findings are silenced, which chart series are
   hidden, which chains are open, which flow node is picked — lives in the sets
   below and is re-applied to fresh markup by the same wire*() call, so a live
   refresh does not undo what the reader chose.

   Any view:
     tooltip   data-tip="sentence" on any element. Class "tr" right-aligns the
               note under the element; class "why" is the ? mark whose note
               opens to its right (why(text) builds it); a .cell's note opens
               above it. One body-level #tip, so section containment never clips
               a note. wireTips() gives non-focusable carriers tabindex=0.
     reveal    class="rv" on a section, tile or card: slides in when it enters
               the viewport, once. wireReveal() after render; no replay.
     sechead   sechead(title, {why, quiet, aside, after}) -> <div class="sechead">
     seg       seg(host, [[id,label],...], read, write, redraw) fills a .seg with
               <a data-id> links; the view's redraw rebuilds it.
     chip      chipHtml(kind, text, tip) -> <span class="chip ok|bad|warn|dim">
     hood      hoodHtml(b) -> <span class="hood">LM</span> from b.code
     money     money(v) -> $3.57M / $751k / $98 (compact())
     icon      icon(name) -> inline stroke SVG from ICON
     links     an <a href="#"> never navigates; give real targets a real hash.

   Today — wireTiles, wireSev, wireFinds, wireCards:
     .kpi                 spotlight under the pointer (--mx/--my); inside it
                          .spark[data-vals="l1,l2,…"] with a <polyline points>
                          in a 0..100 x space, circle.pt and span.scrub.
     .sev[data-kind=crit|watch|opp]   click toggles .off and hides .find.<kind>.
     .find.crit|watch|opp[data-id]    a row; its .mark silences the row, data-id
                          is remembered under localStorage ba_dash_silenced;
                          #silenced is <p class="silenced"><b></b> · <a class="link">undo</a></p>.
                          A row's own click handler should ignore clicks on .mark
                          (they are stopped in the capture phase, so an onclick
                          on the row never sees them).
     .move (and .drop)    tilts toward the pointer (--rx/--ry).

   FilterKinds — wireKinds:
     .sw[data-kind=<alert group id>]  click toggles .on, flips alertGroupPrefs,
                          saves under ALERT_SETTINGS_KEY, redraws the findings.
                          A .sw without data-kind only toggles .on.
     the panel itself    a body-level popover (#alertPop), built once by
                          buildAlertSettingsPanel(). toggleKindsPanel(anchor)
                          opens and closes it under whatever element is passed.
                          The tune button needs no wiring of its own: a click
                          on any KINDS_TOGGLE match — ".sechead .ibtn" inside
                          #alertSection, or anything marked data-kinds — opens
                          it and anchors it there.

   Results — wireChart, wirePortfolio, wireSiteHours:
     .chartbox[data-chart][data-xs][data-ys][data-labels]  JSON arrays, one per
                          day; inside it an svg with <g class="xh"><line/><circle/></g>,
                          a .readout line, and .legend a[data-series] toggling
                          g[data-series] (choices kept in seriesState across renders).
     tr.chain[data-chain]  click toggles .open and .show on tr.kid[data-parent=…];
                          open chains are the existing openChains set. A row
                          carrying its own onclick (the legacy table) is left alone.
     .hc[data-read]       hover writes data-read into #hourRead.

   Supply — wireOrders, wireFlow:
     .up                  in a row with td[data-now][data-to]: click rolls the
                          figure up to the target, then reads "set".
     svg.flow             g.node[data-id], path.pipe#pipeN[data-a][data-b],
                          circle.cargo[data-pipe=pipeN]: pipe hover moves cargo,
                          node click picks (flowPickId, re-applied after render).

   Growth — wireHeat, wirePlan:
     .heat                .h[data-c], .r[data-r], .cell[data-r][data-c][data-tip]:
                          hover lights row and column, click pins the story into
                          #cellDetail ("Name: rest" splits at the first colon).
     tr.line[data-m][data-rate][data-ing="Name:factor,…"][data-slug][data-max]
                          with .step a[data-d=-1|1], .step b, .machines, .made,
                          .covers, .ing; totals in #vMachines #vMade #vRaw
                          #vSurplus; ingredient rows go into #ingBody. The
                          nearest ancestor with data-pershop (units a day per
                          shop) and data-shops (shops owned) sizes the surplus;
                          data-slug keeps planCounts in step with the stepper.
   ------------------------------------------------------------------------- */
const REDUCED = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
const q = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const closest = (e, sel) => e.target && e.target.closest ? e.target.closest(sel) : null;
/* Delegation: one listener on document per (event, selector). isConnected
   skips an element a handler earlier in the chain has already re-rendered away. */
const on = (type, sel, fn, capture) => document.addEventListener(type, e => {
  const t = closest(e, sel);
  if(t && t.isConnected) fn(t, e);
}, !!capture);
/* mouseenter/mouseleave do not bubble; mouseover/out with a relatedTarget test
   give the same "entered this element" semantics from one listener. */
const onEnter = (sel, fn) => document.addEventListener("mouseover", e => {
  const t = closest(e, sel);
  if(t && !(e.relatedTarget && t.contains(e.relatedTarget))) fn(t, e);
});
const onLeave = (sel, fn) => document.addEventListener("mouseout", e => {
  const t = closest(e, sel);
  if(t && !(e.relatedTarget && t.contains(e.relatedTarget))) fn(t, e);
});
const once = fn => { let done = false; return () => { if(done) return; done = true; fn(); }; };
/* A bare "#" link is a control, never a navigation. */
document.addEventListener("click", e => { const a = closest(e, 'a[href="#"]'); if(a) e.preventDefault(); });

/* tooltips: one element at body level, placed from the carrier's rect ------- */
const tipEl = document.createElement("div");
tipEl.id = "tip"; tipEl.setAttribute("role", "tooltip");
document.body.appendChild(tipEl);
let tipFor = null;
function placeTip(t){
  const r = t.getBoundingClientRect();
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  tipEl.className = "";
  const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
  let x, y;
  if(t.classList.contains("why")){ x = r.right + 12; y = r.top + r.height / 2 - h / 2; tipEl.classList.add("side"); }
  else if(t.classList.contains("cell")){ x = r.left + r.width / 2 - w / 2; y = r.top - 8 - h; tipEl.classList.add("above"); }
  else if(t.classList.contains("tr")){ x = r.right - w; y = r.bottom + 8; }
  else { x = r.left; y = r.bottom + 8; }
  if(y + h > vh - 6) y = r.top - 8 - h;
  x = Math.max(6, Math.min(x, vw - w - 6)); y = Math.max(6, y);
  tipEl.style.left = x + "px"; tipEl.style.top = y + "px";
}
function showTip(t){
  const text = t.dataset.tip;
  if(!text) return;
  tipFor = t; tipEl.textContent = text;
  placeTip(t); tipEl.classList.add("on");
}
function hideTip(t){ if(t && t !== tipFor) return; tipFor = null; tipEl.classList.remove("on"); }
const bindTips = once(() => {
  onEnter("[data-tip]", showTip);
  onLeave("[data-tip]", hideTip);
  document.addEventListener("focusin", e => { const t = closest(e, "[data-tip]"); if(t) showTip(t); });
  document.addEventListener("focusout", e => { const t = closest(e, "[data-tip]"); if(t) hideTip(t); });
  document.addEventListener("keydown", e => { if(e.key === "Escape") hideTip(); });
  document.addEventListener("scroll", () => hideTip(), true);
});
function wireTips(){
  bindTips();
  $$("[data-tip]").forEach(t => {
    if(!t.hasAttribute("tabindex") && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) t.tabIndex = 0;
  });
}

/* sections arrive as they come into view (and after a beat regardless) ------ */
let rvIO = null;
function wireReveal(){
  const vh = window.innerHeight || 1000;
  if(rvIO) rvIO.disconnect();
  const pending = $$(".rv:not(.in)").filter(el => !el.closest("[hidden]"));
  pending.forEach((el, i) => {
    el.style.transitionDelay = (i % 8) * 70 + "ms";
    if(REDUCED || el.getBoundingClientRect().top < vh) el.classList.add("in");
  });
  const rest = pending.filter(el => !el.classList.contains("in"));
  if(!rest.length) return;
  if("IntersectionObserver" in window){
    rvIO = rvIO || new IntersectionObserver(es => es.forEach(en => {
      if(en.isIntersecting){ en.target.classList.add("in"); rvIO.unobserve(en.target); }
    }), {threshold: .05});
    rest.forEach(el => rvIO.observe(el));
  }
  setTimeout(() => rest.forEach(el => el.classList.add("in")), 2500);
}

/* the sphere is the dot grown up: it leaves the wordmark, rolls along the
   masthead rule and rests just past the nav. It watches the pointer, squishes
   when clicked and rolls along its shelf as the page scrolls. Clicking the
   wordmark rolls out another one, up to three; on the fourth the first ball on
   the shelf gulps its neighbour to make room. Wired once, on boot; the web
   shell shows the board only after the first build, so it waits for layout. */
let sphereWired = false;
function wireSphere(){
  if(sphereWired) return;
  const first = q(".orb"), dotEl = $("dot"), navEl = $("nav"), clockEl = $("clock");
  if(!first || !dotEl || !navEl) return;
  if(!navEl.getBoundingClientRect().width){ setTimeout(wireSphere, 200); return; }
  sphereWired = true;
  inkHome();  // the underline was homed while the board was hidden, so its width is 0
  const parent = first.offsetParent || first.parentElement;
  const GAP = 12, MAX = 3, SIZES = [100, 72, 54];
  let p0, base, clockLeft;
  const measure = () => {
    p0 = parent.getBoundingClientRect();
    const n = navEl.getBoundingClientRect();
    base = { x: n.right - p0.left + 40, mid: null };
    clockLeft = clockEl ? clockEl.getBoundingClientRect().left - p0.left : Infinity;
  };
  measure();
  const d0 = dotEl.getBoundingClientRect();
  const balls = [];
  const restX = k => base.x + balls.slice(0, k).reduce((a, b) => a + b.size + GAP, 0);
  const topOf = size => p0.height - size;
  const maxRun = () => { const l = balls[balls.length - 1]; return !l ? 0 : Math.max(0, clockLeft - (l.rest + l.size) - 28); };
  const paint = (b) => {
    const roll = REDUCED ? 0 : Math.min(maxRun(), window.scrollY * .6);
    b.el.style.transform = 'translate(' + (b.px + roll).toFixed(1) + 'px,' + b.py.toFixed(1) + 'px) scale(' + b.sc.toFixed(3) + ')';
    b.seam.style.transform = 'rotate(' + (((b.px - b.sx) + roll) / (Math.PI * b.size) * 360).toFixed(1) + 'deg)';
  };
  const squish = (b) => { [b.core, b.seam].forEach(el => { el.classList.remove('squish'); void el.offsetWidth; el.classList.add('squish'); }); };
  const ring = (b) => { const r = b.el.getBoundingClientRect(), i = document.createElement('i'); i.className = 'ring';
    i.style.left = (r.left + window.scrollX) + 'px'; i.style.top = (r.top + window.scrollY) + 'px'; i.style.width = r.width + 'px'; i.style.height = r.height + 'px';
    document.body.appendChild(i); setTimeout(() => i.remove(), 900); };
  const makeBall = (el, k) => {
    const size = SIZES[Math.min(k, SIZES.length - 1)], rest = restX(k), top = topOf(size);
    el.style.width = el.style.height = size + 'px'; el.style.left = rest + 'px'; el.style.top = top + 'px';
    const sx = d0.left - p0.left + d0.width / 2 - (rest + size / 2), sy = d0.top - p0.top + d0.height / 2 - (top + size / 2), s0 = d0.width / size;
    const b = { el, core: q('i', el), seam: q('u', el), size, rest, sx, sy, s0, px: sx, py: sy, sc: s0, tx: 0, ty: 0, busy: true };
    el.addEventListener('click', () => { squish(b); ring(b); });
    paint(b); el.classList.add('live'); return b;
  };
  const enter = (b, delay) => setTimeout(() => {
    if(REDUCED){ b.px = 0; b.py = 0; b.sc = 1; b.busy = false; paint(b); return; }
    dotEl.classList.remove('kick'); void dotEl.offsetWidth; dotEl.classList.add('kick');
    const t0 = performance.now() + 180, dur = 1300, lift = 26;
    const step = (t) => { const p = Math.max(0, Math.min(1, (t - t0) / dur)), e = 1 - Math.pow(1 - p, 3);
      b.px = b.sx * (1 - e); b.py = b.sy * (1 - e) - Math.sin(p * Math.PI) * lift; b.sc = b.s0 + (1 - b.s0) * e; paint(b);
      if (p < 1) requestAnimationFrame(step); else b.busy = false; };
    requestAnimationFrame(step);
  }, delay);
  const spawn = () => {
    if (balls.some(b => b.busy)) return;
    const el = first.cloneNode(true); el.removeAttribute('id'); parent.appendChild(el);
    const b = makeBall(el, balls.length); balls.push(b); enter(b, 60);
  };
  const eat = () => {
    const eater = balls[0], meal = balls[1]; if (!eater || !meal || balls.some(b => b.busy)) return;
    eater.busy = meal.busy = true;
    const t0 = performance.now(), dur = 520;
    const dx = (eater.rest + eater.size / 2) - (meal.rest + meal.size / 2), dy = (topOf(eater.size) + eater.size / 2) - (topOf(meal.size) + meal.size / 2);
    let gulped = false;
    const step = (t) => { const p = Math.min(1, (t - t0) / dur), e = p * p;
      meal.px = dx * e; meal.py = dy * e - 12 * Math.sin(p * Math.PI); meal.sc = 1 - .9 * e; paint(meal);
      if (p > .55 && !gulped) { gulped = true; squish(eater); }
      if (p < 1) requestAnimationFrame(step); else {
        meal.el.remove(); balls.splice(1, 1);
        balls.forEach((b, k) => { const old = b.rest; b.rest = restX(k); b.el.style.left = b.rest + 'px'; b.px += old - b.rest; b.busy = false; });
        setTimeout(spawn, 220);
      } };
    requestAnimationFrame(step);
  };
  balls.push(makeBall(first, 0)); enter(balls[0], 400);
  const wordmark = q('.wordmark');
  if (wordmark) wordmark.addEventListener('click', () => (balls.length < MAX ? spawn() : eat()));
  document.addEventListener('mousemove', (e) => balls.forEach(b => {
    if (b.busy) return;
    const r = b.el.getBoundingClientRect(); const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy) || 1, k = Math.min(10, d * .1);
    b.tx = dx / d * k; b.ty = Math.min(0, dy / d * k);
    b.el.style.setProperty('--hx', (34 + dx / d * 20) + '%'); b.el.style.setProperty('--hy', (32 + dy / d * 20) + '%');
  }));
  const loop = () => { balls.forEach(b => { if (!b.busy) { b.px += (b.tx - b.px) * .06; b.py += (b.ty - b.py) * .06; paint(b); } }); requestAnimationFrame(loop); };
  loop();
  /* The shelf moves when the window or the fonts do. */
  const relayout = () => { measure(); balls.forEach((b, k) => { b.rest = restX(k); b.el.style.left = b.rest + 'px'; paint(b); }); };
  window.addEventListener('resize', relayout);
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
}

/* nav underline follows the pointer, then goes home --------------------------- */
function inkHome(){
  const nav = $("nav"); if(!nav) return;
  const a = nav.querySelector("a.on"); if(!a) return;
  const r = a.getBoundingClientRect(), n = nav.getBoundingClientRect();
  nav.style.setProperty("--nx", (r.left - n.left) + "px"); nav.style.setProperty("--nw", r.width + "px");
}
const wireNav = once(() => {
  const nav = $("nav"); if(!nav) return;
  const ink = (a) => { const r = a.getBoundingClientRect(), n = nav.getBoundingClientRect();
    nav.style.setProperty("--nx", (r.left - n.left) + "px"); nav.style.setProperty("--nw", r.width + "px"); };
  nav.addEventListener("mouseover", e => { const a = closest(e, "a"); if(a) ink(a); });
  nav.addEventListener("mouseleave", inkHome);
  setTimeout(inkHome, 50); setTimeout(inkHome, 600);
  window.addEventListener("resize", inkHome);
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(inkHome);
});

/* the green dot is a coin: click it and it pays out ---------------------------- */
const wireCoin = once(() => {
  const dot = $("dot"); if(!dot) return;
  dot.addEventListener("click", () => {
    dot.classList.remove("spin"); void dot.offsetWidth; dot.classList.add("spin");
    if(REDUCED) return;
    const r = dot.getBoundingClientRect();
    for (let i = 0; i < 14; i++) {
      const c = document.createElement("i"); c.className = "coin";
      const a = (Math.random() * Math.PI) - Math.PI, d = 60 + Math.random() * 120;
      c.style.left = (r.left + window.scrollX + 1) + "px"; c.style.top = (r.top + window.scrollY + 1) + "px";
      c.style.setProperty("--dx", Math.cos(a) * d + "px"); c.style.setProperty("--dy", (Math.abs(Math.sin(a)) * d + 140) + "px");
      c.style.animationDelay = (Math.random() * .12) + "s";
      document.body.appendChild(c); setTimeout(() => c.remove(), 1400);
    }
  });
});

/* tiles: a spotlight under the pointer, and the sparkline reads out where you are */
const wireTiles = once(() => {
  document.addEventListener("mousemove", e => {
    const t = closest(e, ".kpi"); if(!t) return;
    const r = t.getBoundingClientRect();
    t.style.setProperty("--mx", (e.clientX - r.left) + "px"); t.style.setProperty("--my", (e.clientY - r.top) + "px");
    const sp = q(".spark", t); if(!sp) return;
    const pl = q("polyline", sp), pt = q(".pt", sp), lab = q(".scrub", sp);
    if(!pl || !pt || !lab) return;
    const pts = pl.getAttribute("points").trim().split(/\s+/).map(p => p.split(",").map(Number));
    const vals = (sp.dataset.vals || "").split(",");
    const sr = sp.getBoundingClientRect(), x = (e.clientX - sr.left) / sr.width * 100;
    let k = 0; for(let i = 1; i < pts.length; i++) if(Math.abs(pts[i][0] - x) < Math.abs(pts[k][0] - x)) k = i;
    pt.setAttribute("cx", pts[k][0]); pt.setAttribute("cy", pts[k][1]);
    lab.style.left = pts[k][0] + "%"; lab.textContent = vals[k] || "";
  });
});

/* cards tilt toward the pointer ------------------------------------------------ */
const wireCards = once(() => {
  document.addEventListener("mousemove", e => {
    const c = closest(e, ".move, .drop"); if(!c || REDUCED) return;
    const r = c.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
    c.style.setProperty("--ry", (x * 10) + "deg"); c.style.setProperty("--rx", (-y * 8) + "deg");
  });
  onLeave(".move, .drop", c => { c.style.setProperty("--ry", "0deg"); c.style.setProperty("--rx", "0deg"); });
});

/* severity dots filter the list; the dot on a row silences it ------------------ */
const sevOff = new Set();
function applySev(){
  $$(".sev[data-kind]").forEach(s => s.classList.toggle("off", sevOff.has(s.dataset.kind)));
  $$(".find").forEach(f => f.classList.toggle("hide", [...sevOff].some(k => f.classList.contains(k))));
}
const bindSev = once(() => on("click", ".sev[data-kind]", s => {
  sevOff.has(s.dataset.kind) ? sevOff.delete(s.dataset.kind) : sevOff.add(s.dataset.kind);
  applySev();
}));
function wireSev(){ bindSev(); applySev(); }

const SILENCED_KEY = "ba_dash_silenced";
let silencedIds = new Set();
try{ silencedIds = new Set(JSON.parse(localStorage.getItem(SILENCED_KEY)) || []); }catch(e){}
const saveSilenced = () => { try{ localStorage.setItem(SILENCED_KEY, JSON.stringify([...silencedIds])); }catch(e){} };
function silencedLine(){
  const line = $("silenced"); if(!line) return;
  const n = $$(".find.gone").length;
  line.classList.toggle("on", n > 0);
  const b = line.querySelector("b");
  if(b) b.textContent = n + (n === 1 ? " finding silenced" : " findings silenced");
}
const bindFinds = once(() => {
  /* Capture phase: the mark sits inside the row's link, and the row must not
     follow the click. */
  on("click", ".find .mark", (m, e) => {
    e.preventDefault(); e.stopPropagation();
    const f = m.closest(".find"); f.classList.add("gone");
    if(f.dataset.id){ silencedIds.add(f.dataset.id); saveSilenced(); }
    silencedLine();
  }, true);
  on("click", ".silenced a", (a, e) => {
    e.preventDefault();
    silencedIds.clear(); saveSilenced();
    $$(".find.gone").forEach(f => f.classList.remove("gone"));
    silencedLine();
  });
});
function wireFinds(){
  bindFinds();
  $$(".find[data-id]").forEach(f => f.classList.toggle("gone", silencedIds.has(f.dataset.id)));
  silencedLine();
}

/* daily chart: a crosshair reads the day into the reserved line above the plot -- */
const seriesState = {};
function applySeries(){
  $$(".chartbox[data-chart]").forEach(cb => {
    $$(".legend a[data-series]", cb).forEach(a => {
      const id = a.dataset.series;
      if(!(id in seriesState)) return;
      a.classList.toggle("on", seriesState[id]);
      const g = q(`g[data-series="${CSS.escape(id)}"]`, cb);
      if(g) g.classList.toggle("off", !seriesState[id]);
    });
  });
}
const bindChart = once(() => {
  document.addEventListener("mousemove", e => {
    const svg = closest(e, ".chartbox[data-chart] svg"); if(!svg) return;
    const cb = svg.closest(".chartbox");
    const line = q(".xh line", svg), dotc = q(".xh circle", svg), out = q(".readout", cb);
    if(!line || !dotc || !out) return;
    let xs, ys, labels;
    try{ xs = JSON.parse(cb.dataset.xs); ys = JSON.parse(cb.dataset.ys); labels = JSON.parse(cb.dataset.labels); }catch(err){ return; }
    const r = svg.getBoundingClientRect(); const vb = svg.viewBox.baseVal;
    const x = (e.clientX - r.left) / r.width * vb.width;
    let k = 0; for(let i = 1; i < xs.length; i++) if(Math.abs(xs[i] - x) < Math.abs(xs[k] - x)) k = i;
    line.setAttribute("x1", xs[k]); line.setAttribute("x2", xs[k]);
    dotc.setAttribute("cx", xs[k]); dotc.setAttribute("cy", ys[k]);
    out.innerHTML = labels[k];
  });
  on("click", ".chartbox[data-chart] .legend a[data-series]", (a, e) => {
    e.preventDefault();
    seriesState[a.dataset.series] = !a.classList.contains("on");
    applySeries();
  });
});
function wireChart(){ bindChart(); applySeries(); }

/* portfolio: a chain opens its sites ------------------------------------------- */
function applyChains(){
  $$("tr.chain[data-chain]").forEach(tr => {
    if(tr.onclick) return;
    const open = openChains.has(tr.dataset.chain);
    tr.classList.toggle("open", open);
    $$(`tr.kid[data-parent="${CSS.escape(tr.dataset.chain)}"]`).forEach(k => k.classList.toggle("show", open));
  });
}
const bindPortfolio = once(() => on("click", "tr.chain[data-chain]", tr => {
  if(tr.onclick) return;
  const name = tr.dataset.chain;
  openChains.has(name) ? openChains.delete(name) : openChains.add(name);
  applyChains();
}));
function wirePortfolio(){ bindPortfolio(); applyChains(); }

/* orders: "raise" rolls the order up to its target ------------------------------ */
const wireOrders = once(() => on("click", "td .up", (u, e) => {
  /* Only the raise chip in an orders row, the one whose tr carries the
     td[data-now] figure to roll up; a .wave.up on Growth is not this. */
  const tr = u.closest("tr"), td = tr && tr.querySelector("td[data-now]"); if(!td) return;
  e.preventDefault();
  if(u.classList.contains("done")) return;
  const from = +td.dataset.now, to = +td.dataset.to; const t0 = performance.now();
  const step = (t) => { const p = REDUCED ? 1 : Math.min(1, (t - t0) / 700), e2 = 1 - Math.pow(1 - p, 3);
    td.textContent = Math.round(from + (to - from) * e2).toLocaleString("en-US");
    if(p < 1) requestAnimationFrame(step); else { u.classList.add("done"); u.innerHTML = "set"; } };
  requestAnimationFrame(step);
}));

/* supply map: a pipe carries cargo while hovered; a node lights its own pipes --- */
let flowPickId = null;
function applyFlow(){
  const picked = flowPickId;
  const nodes = $$(".flow .node"); if(!nodes.length) return;
  nodes.forEach(m => { m.classList.toggle("on", m.dataset.id === picked); m.classList.remove("faded"); });
  const touched = new Set();
  $$(".flow .pipe").forEach(p => { const lit = picked && (p.dataset.a === picked || p.dataset.b === picked);
    p.classList.toggle("lit", !!lit); p.classList.toggle("dim", !!picked && !lit); if(lit){ touched.add(p.dataset.a); touched.add(p.dataset.b); } });
  if(picked) nodes.forEach(m => m.classList.toggle("faded", !touched.has(m.dataset.id) && m.dataset.id !== picked));
}
const bindFlow = once(() => {
  const cargoOf = p => q(`.cargo[data-pipe="${CSS.escape(p.id)}"]`);
  onEnter(".flow .pipe", p => { const c = cargoOf(p); if(c) c.classList.add("go"); });
  onLeave(".flow .pipe", p => { const c = cargoOf(p); if(c) c.classList.remove("go"); });
  on("click", ".flow .node[data-id]", n => { flowPickId = flowPickId === n.dataset.id ? null : n.dataset.id; applyFlow();
    drawFlowDetail(); });  // changed for supply: the table under the map follows the pick
});
function wireFlow(){ bindFlow(); applyFlow(); }

/* demand grid: rows and columns light up together; a click pins a cell's story -- */
const wireHeat = once(() => {
  onEnter(".heat .cell", c => {
    $$(`.cell[data-r="${CSS.escape(c.dataset.r)}"], .cell[data-c="${CSS.escape(c.dataset.c)}"]`).forEach(x => x.classList.add("hl"));
    $$(`.heat .h[data-c="${CSS.escape(c.dataset.c)}"], .heat .r[data-r="${CSS.escape(c.dataset.r)}"]`).forEach(x => x.classList.add("hl"));
  });
  onLeave(".heat .cell", () => $$(".hl").forEach(x => x.classList.remove("hl")));
  on("click", ".heat .cell", c => {
    $$(".cell.picked").forEach(x => x.classList.remove("picked")); c.classList.add("picked");
    const detail = $("cellDetail"), tip = c.dataset.tip || "";
    if(!detail) return;
    const i = tip.indexOf(":");
    detail.innerHTML = (i > 0 ? `<b>${tip.slice(0, i)}</b>${tip.slice(i + 1)}` : tip)
      + ` <a class="link" href="#secPlan">open in Plan a chain</a>`;
  });
});

/* plan a chain: every line runs 24/7; step a line's machines and everything follows */
function planDraw(){
  const lines = $$("tr.line[data-m][data-rate]"); if(!lines.length) return;
  const host = lines[0].closest("[data-pershop], [data-shops]");
  const perShopWeek = host ? (+host.dataset.pershop || 0) * 7 : 0, shopsOwned = host ? (+host.dataset.shops || 0) : 0;
  const fmtN = n => Math.round(n).toLocaleString("en-US");
  let machines = 0, made = 0, raw = 0, take = 0;
  const ing = {};
  lines.forEach(tr => {
    const m = +tr.dataset.m, rate = +tr.dataset.rate, wk = m * rate * HOURS * 7;
    machines += m; made += wk; take += perShopWeek ? Math.min(wk, shopsOwned * perShopWeek) : 0;
    const set = (sel, v) => { const n = q(sel, tr); if(n) n.textContent = v; };
    set(".step b", m); set(".made", fmtN(wk));
    set(".covers", perShopWeek ? Math.floor(wk / perShopWeek) + " shops" : "—");
    const cell = q("td.l", tr);
    const product = (tr.dataset.name || (cell && cell.firstChild && cell.firstChild.textContent) || "").trim();
    const parts = (tr.dataset.ing || "").split(",").filter(Boolean).map(x => {
      const i = x.lastIndexOf(":"); return [x.slice(0, i).trim(), +x.slice(i + 1)];
    });
    const ingEl = q(".ing", tr);
    if(ingEl) ingEl.innerHTML = parts.map(([name, f]) => `<b>${fmtN(wk * f)}</b> ${name}`).join(", ");
    parts.forEach(([name, f]) => {
      raw += wk * f;
      const r = ing[name] || (ing[name] = {week: 0, by: []});
      r.week += wk * f; if(product && !r.by.includes(product)) r.by.push(product);
    });
    const box = q(".machines", tr);
    if(box){
      const cur = box.children.length;
      while(box.children.length < m){ const i = document.createElement("i"); i.className = "on new"; box.appendChild(i); }
      while(box.children.length > m) box.lastChild.remove();
      Array.from(box.children).forEach((i, k) => { if(k < cur) i.classList.remove("new"); });
    }
  });
  const put = (id, v) => { const n = $(id); if(n) n.textContent = v; };
  put("vMachines", machines); put("vMade", fmtN(made)); put("vRaw", fmtN(raw)); put("vSurplus", fmtN(made - take));
  /* the ingredient table: one row per material, summed over the lines that share it */
  const body = $("ingBody");
  if(body){
    // changed for growth: the host's data-ingtips (JSON, name -> sentence) puts
    // what is on order today under each ingredient's name.
    let tips = {}; try{ tips = host && host.dataset.ingtips ? JSON.parse(host.dataset.ingtips) : {}; }catch(e){}
    const prev = {};
    Array.from(body.children).forEach(tr => { const w = q(".wk", tr); if(w) prev[tr.dataset.name] = w.textContent; });
    body.innerHTML = Object.entries(ing).sort((a, b) => b[1].week - a[1].week).map(([name, r]) =>
      `<tr data-name="${attr(name)}" class="${prev[name] && prev[name] !== fmtN(r.week) ? "bump" : ""}">` +
      `<td class="l"${tips[name] ? ` data-tip="${attr(tips[name])}"` : ""}>${name}</td><td class="l" style="color:var(--ink-2);font-family:Archivo,sans-serif">${r.by.join(", ")}</td>` +
      `<td>${fmtN(r.week / 7)}</td><td class="wk">${fmtN(r.week)}</td><td><span class="set">${fmtN(ceil100(r.week))}</span></td></tr>`).join("");
  }
}
const bindPlan = once(() => on("click", "tr.line .step a[data-d]", (a, e) => {
  e.preventDefault();
  const tr = a.closest("tr.line");
  const max = +tr.dataset.max || 12;
  // changed for growth: data-min="0" lets a line be switched off (bought in instead)
  const min = tr.dataset.min !== undefined ? +tr.dataset.min : 1;
  tr.dataset.m = Math.max(min, Math.min(max, +tr.dataset.m + +a.dataset.d));
  if(tr.dataset.slug) planCounts[tr.dataset.slug] = +tr.dataset.m;
  planDraw();
}));
function wirePlan(){ bindPlan(); planDraw(); }

/* site detail: the hour grid reads out under the pointer ------------------------- */
const wireSiteHours = once(() => onEnter(".hc[data-read]", c => { const hr = $("hourRead"); if(hr) hr.innerHTML = c.dataset.read; }));

/* kinds popover: switches flip; with a data-kind they also flip the preference --- */
const bindKinds = once(() => on("click", ".sw", s => {
  s.classList.toggle("on");
  /* changed for kinds: the switch is a span carrying role="switch", so the
     state a screen reader hears has to move with the class. */
  if(s.getAttribute("role") === "switch") s.setAttribute("aria-checked", String(s.classList.contains("on")));
  const kind = s.dataset.kind; if(!kind) return;
  alertGroupPrefs[kind] = s.classList.contains("on");
  try{ localStorage.setItem(ALERT_SETTINGS_KEY, JSON.stringify(alertGroupPrefs)); }catch(e){}
  drawAlerts();
}));
/* changed for kinds: bound once as before, plus the "n today" counts of an
   open panel, which a live refresh would otherwise leave a day behind. */
function wireKinds(){
  bindKinds();
  if(kindsPop && kindsPop.classList.contains("on")) drawKindRows();
}

/* Everything above, after every render. Delegated handlers bind once; the
   state-carrying ones re-apply their state to the fresh markup. */
function wireAll(){
  wireTips(); wireTiles(); wireCards();
  wireSev(); wireFinds(); wireKinds();
  wireChart(); wirePortfolio(); wireSiteHours();
  wireOrders(); wireFlow();
  wireHeat(); wirePlan();
  wireReveal();
}

function boot(){
  renderAll();
  Object.keys(SUBS).forEach(id => showSub(id, sub[id]));
  const h = location.hash.slice(1);
  showPage(PAGES.some(p => p.id === h) ? h
    : SEC_PAGE[h] ? SEC_PAGE[h][0]
    : remembered(PAGE_KEY) || "today", false);
  /* Bound once: the nav underline, the coin, and the sphere's entrance. A live
     refresh re-renders the numbers but never replays these. */
  wireNav(); wireCoin(); wireSphere();
}
/* A page written with its numbers boots now. One that receives them later,
   as the in-browser board does, boots on the first delivery. */
if(D) boot();

/* --- live refresh --------------------------------------------------- */
/* The save on disk only changes when the game writes one, so this polls a
   cheap stamp and pulls fresh numbers only when that stamp moves. */
function startWatching(){
  /* A failing rebuild otherwise reads as "nothing has changed" -- a pulsing
     Live dot over an hour-old board -- so the source says why it is stuck and
     the dot shows it. The last good board stays on screen. */
  const markStale = (why) => {
    const dot = $("live");
    if(!dot || dot.classList.contains("off")) return;
    dot.classList.toggle("stale", !!why);
    dot.querySelector("em").textContent = why ? "Stale" : SOURCE.label;
    dot.title = why ? "The save moved on but the board would not rebuild: " + why : "";
  };
  SOURCE.watch({
    changed(data){
      const first = !D;
      D = data;
      if(first) boot(); else renderAll();
      const dot = $("live");
      if(dot){ dot.classList.add("just"); setTimeout(() => dot.classList.remove("just"), 1600); }
    },
    stale: markStale,
    lost(){
      const dot = $("live");
      if(dot){ dot.classList.add("off"); dot.querySelector("em").textContent = "Not live"; }
    },
  });
}
if(LIVE) startWatching();
</script>
"""


def newest_under(target: str) -> str:
    """The most recently written save at or below `target`."""
    if os.path.isfile(target):
        return target
    folders = [target] + [
        os.path.join(target, n)
        for n in os.listdir(target)
        if os.path.isdir(os.path.join(target, n))
    ]
    saves = [
        os.path.join(f, n)
        for f in folders
        for n in os.listdir(f)
        if n.endswith(".hsg")
    ]
    if not saves:
        raise SystemExit(f"no .hsg saves under {target}")
    return max(saves, key=os.path.getmtime)


class SaveShapeError(Exception):
    """The save parsed, but a field the board relies on was not where expected."""


def safe_extract(save: Save, names: Names, history_path: str | None) -> dict:
    """extract(), with a game-patch failure turned into one readable sentence.

    The format is reverse-engineered, so a renamed field surfaces as a KeyError
    deep inside a helper. Nobody can act on that; the game build and the build
    this tool was checked against are what a report needs.
    """
    build = save.root.get("buildNumberAtLastSave")
    if build is not None and build < MIN_BUILD:
        raise SaveShapeError(
            f"this save is from game build {build}; the board understands saves "
            f"from build {MIN_BUILD} onward. Load the game and save again to bring it "
            "up to date"
        )
    try:
        return extract(save, names, history_path)
    except (KeyError, TypeError, AttributeError, IndexError, ValueError) as exc:
        newer = build is not None and build > VERIFIED_BUILD
        raise SaveShapeError(
            "the save does not have the shape this board expects "
            f"({type(exc).__name__}: {exc}). Game build {build}, board checked on "
            f"build {VERIFIED_BUILD}"
            + (": the game has probably changed its save format" if newer else "")
        ) from exc


def browser_build(
    save_path: str, locale_path: str, history_path: str, names_path: str | None = None
) -> str:
    """One rebuild for the in-browser board: parse, extract, JSON.

    Everything arrives as a path on Pyodide's virtual filesystem, so the same
    extract() runs unchanged; only this wrapper knows it is in a browser. The
    character id is kept beside the history so a later browser_name() can
    file the name under the right company without parsing the save again.

    ``names_path`` is the table of display names shipped with the page; the
    player's own en.json, when given, is laid over it and adds the help pages
    that recipes and station capacities are read from.
    """
    locale = dict(load_locale(names_path)) if names_path else {}
    locale.update(load_locale(locale_path))
    names = Names(locale)
    try:
        save = load_save(save_path)
    except Exception as exc:  # gzip, struct and format errors alike
        raise SaveShapeError(
            f"{os.path.basename(save_path)} is not a Big Ambitions save this board can "
            f"read ({type(exc).__name__}: {exc})"
        ) from exc
    data = safe_extract(save, names, history_path)
    with open(history_path + ".character", "w", encoding="utf-8") as fh:
        fh.write(save.root.get("characterId") or "default")
    return json.dumps(data, separators=(",", ":"))


def browser_name(history_path: str, rid: str, slug: str | None) -> None:
    """A factory line the player named in the browser; the next build follows."""
    try:
        with open(history_path + ".character", encoding="utf-8") as fh:
            character = fh.read().strip() or "default"
    except OSError:
        character = "default"
    history = History(history_path)
    history.named(character, {rid: slug})
    history.write()


BELOW_NORMAL_PRIORITY_CLASS = 0x00004000


def backfill_history(target: str, history_path: str, names: Names) -> int:
    """Seed demand history from the other saves of the same character.

    Older saves are real snapshots of the same city, so the trend line starts
    populated instead of waiting a week for its first comparison. Only the folder
    holding the newest save is read: every other folder is a different character,
    and a different city.
    """
    folder = os.path.dirname(newest_under(target))
    saves = sorted(
        os.path.join(folder, n) for n in os.listdir(folder) if n.endswith(".hsg")
    )
    print(f"Seeding demand history from {len(saves)} saves in {os.path.basename(folder)}")
    recorded = 0
    for path in saves:
        try:
            save = load_save(path)
            extract(save, names, history_path)
            print(f"  day {save.root['Day']:>4}  {os.path.basename(path)}", flush=True)
            recorded += 1
        except Exception as exc:
            print(f"  skipped {os.path.basename(path)}: {exc}", flush=True)
    return recorded


def yield_to_the_game() -> bool:
    """Drop below normal priority so the game always gets the core first."""
    try:
        if sys.platform != "win32":
            os.nice(10)
            return True
        import ctypes

        kernel32 = ctypes.windll.kernel32
        kernel32.SetPriorityClass.argtypes = [ctypes.c_void_p, ctypes.c_uint32]
        kernel32.SetPriorityClass.restype = ctypes.c_int
        # -1 is the pseudo-handle for the current process. It has to be passed
        # as a real pointer-width value or the call fails with a bad handle.
        current_process = ctypes.c_void_p(-1)
        return bool(
            kernel32.SetPriorityClass(current_process, BELOW_NORMAL_PRIORITY_CLASS)
        )
    except Exception:  # priority is a nicety, never a reason to fail
        return False


class Board:
    """Holds the current dashboard, and rebuilds it when the save changes."""

    def __init__(self, target: str, out: str):
        self.target = target
        self.out = out
        self.names = Names()
        self.history = os.path.join(os.path.dirname(out) or ".", "market_history.json")
        self.lock = threading.Lock()
        self.html = b""
        self.data = b"{}"
        self.stamp = b'{"stamp":""}'
        self.source = None
        self.error = None
        self._stamp = ""
        self._fingerprint = None
        self.character = None
        self.revision = 0  # bumps when the player names a line, so the page refetches
        self.build = threading.Lock()

    def name_line(self, rid: str, slug: str | None) -> None:
        """A recipe the player named by hand; rebuild so the needs follow."""
        with self.build:
            history = History(self.history)
            history.named(self.character or "default", {rid: slug})
            history.write()
            with self.lock:
                self.revision += 1
                self._fingerprint = None
            self._refresh(settle=False)

    def refresh(self, settle: bool = True) -> bool:
        """Rebuild if a newer save has appeared. True if anything changed."""
        with self.build:
            return self._refresh(settle)

    def _refresh(self, settle: bool) -> bool:
        path = newest_under(self.target)
        mark = (path, os.path.getmtime(path), os.path.getsize(path))
        if mark == self._fingerprint:
            return False
        if settle:
            # The game may still be writing; only read once the file holds still.
            time.sleep(0.75)
            if (os.path.getmtime(path), os.path.getsize(path)) != mark[1:]:
                return False

        try:
            data = safe_extract(load_save(path), self.names, self.history)
            live_page = render(data, live=True).encode("utf-8")
            static_page = render(data).encode("utf-8")
        except Exception as exc:
            # Fingerprint it anyway. Without this a save that will not build is
            # re-read every interval -- a 26 MB parse every few seconds, which
            # is precisely the CPU the game is supposed to get. The next save
            # the game writes clears the mark and we try again.
            with self.lock:
                self._fingerprint = mark
                self.error = f"{os.path.basename(path)}: {exc}"
                self._publish_stamp()
            raise

        with self.lock:
            self._fingerprint = mark
            self.source = path
            self.error = None
            self.html = live_page
            self.data = json.dumps(data, separators=(",", ":")).encode("utf-8")
            self.character = data["supply"].get("factories", {}).get("character")
            self._stamp = f"{os.path.basename(path)}@{mark[1]:.0f}#{self.revision}"
            self._publish_stamp()

        with open(self.out, "wb") as fh:
            fh.write(static_page)
        return True

    def _publish_stamp(self) -> None:
        """What the open page polls: the build it has, and why it is stuck.

        Called with the lock already held.
        """
        body = {"stamp": self._stamp}
        if self.error:
            body["error"] = self.error
        self.stamp = json.dumps(body).encode("utf-8")


class BoardHandler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    board: Board = None

    def do_GET(self):
        route = self.path.split("?")[0].rstrip("/") or "/"
        with self.board.lock:
            body, ctype = {
                "/": (self.board.html, "text/html; charset=utf-8"),
                "/index.html": (self.board.html, "text/html; charset=utf-8"),
                "/data.json": (self.board.data, "application/json"),
                "/stamp": (self.board.stamp, "application/json"),
            }.get(route, (None, None))
        if body is None:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        """The page naming a factory line by hand: {rid, slug}, slug null to clear."""
        route = self.path.split("?")[0].rstrip("/")
        if route != "/name":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(length) or b"{}")
            rid, slug = str(body["rid"]), body.get("slug") or None
        except (ValueError, KeyError, TypeError):
            self.send_error(400)
            return
        try:
            self.board.name_line(rid, slug)
        except Exception as exc:  # the board keeps serving the last build
            print(f"  naming a line failed -- {exc}", flush=True)
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def log_message(self, *args):
        pass  # the watcher prints what matters


def watch(target: str, out: str, port: int, interval: int, open_browser: bool) -> None:
    lowered = yield_to_the_game()
    board = Board(target, out)
    board.refresh(settle=False)
    BoardHandler.board = board
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), BoardHandler)
    url = f"http://127.0.0.1:{port}/"

    def poll():
        last_failure = None
        while True:
            try:
                if board.refresh():
                    print(
                        f"  {time.strftime('%H:%M:%S')}  rebuilt from "
                        f"{os.path.basename(board.source)}",
                        flush=True,
                    )
                    last_failure = None
            except Exception as exc:
                signature = f"{type(exc).__name__}: {exc}"
                print(
                    f"  {time.strftime('%H:%M:%S')}  skipped a rebuild -- "
                    f"{board.error or signature}",
                    flush=True,
                )
                # The traceback the first time each failure appears. A page of
                # bare "skipped a rebuild: 'NetWorth'" says nothing about where
                # it came from, and that is the only record there is.
                if signature != last_failure:
                    last_failure = signature
                    traceback.print_exc()
                    print(
                        "  serving the last board that built; retrying when "
                        "the game writes a new save",
                        flush=True,
                    )
            time.sleep(interval)

    threading.Thread(target=poll, daemon=True).start()

    print(f"Watching {target}", flush=True)
    print(f"  serving {url}  (checks every {interval}s, rebuilds only on a new save)")
    print(f"  priority {'lowered, the game gets the CPU first' if lowered else 'unchanged'}")
    print("  Ctrl+C to stop", flush=True)
    if open_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
        server.shutdown()


def main() -> None:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("save", nargs="?", help="a .hsg file or a save folder")
    ap.add_argument(
        "-o", "--out", default="dashboard.html", help="where to write the page"
    )
    ap.add_argument(
        "--watch",
        action="store_true",
        help="serve the board locally and rebuild it whenever the game saves",
    )
    ap.add_argument(
        "--port", type=int, default=8770, help="port for the local server in watch mode"
    )
    ap.add_argument(
        "--interval", type=int, default=5, help="seconds between save-file checks"
    )
    ap.add_argument("--no-open", action="store_true", help="do not open a browser")
    ap.add_argument(
        "--backfill",
        action="store_true",
        help="seed demand history from every save on disk, then build",
    )
    args = ap.parse_args()

    target = args.save or SAVE_ROOT
    out = os.path.abspath(args.out)
    history = os.path.join(os.path.dirname(out) or ".", "market_history.json")

    if args.backfill:
        recorded = backfill_history(target, history, Names())
        print(f"  merged {recorded} snapshots into {os.path.basename(history)}")

    if args.watch:
        watch(target, out, args.port, args.interval, not args.no_open)
        return

    path = newest_under(target)
    data = safe_extract(load_save(path), Names(), history)
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(render(data))

    k = data["kpi"]
    minor = data["minor"]
    print(
        f"{data['meta']['save']} - day {data['meta']['day']}  "
        f"(from {os.path.basename(path)}, game build {data['meta']['build']}, "
        f"board checked on {VERIFIED_BUILD})"
    )
    worth = f"{k['netWorth']:>14,.0f}" if k["netWorth"] is not None else "   not reported"
    print(f"  cash {k['cash']:>14,.0f}   net worth {worth}")
    print(f"  profit yesterday {k['profitYesterday']:>+11,.0f}   7-day avg {k['profitAvg7']:>+11,.0f}")
    print(
        f"  {k['businesses']} businesses, {k['employees']} staff, "
        f"{len(data['alerts'])} alerts "
        f"({minor['count']} more below the ${minor['gate']:,.0f}/day line)"
    )
    print(f"  wrote {out}")


if __name__ == "__main__":
    main()
