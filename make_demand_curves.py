"""Read the game's arrival curves out of its Addressables bundles.

    py -m pip install --target <scratch folder outside this repo> UnityPy
    set PYTHONPATH=<that folder>
    python make_demand_curves.py

Writes ba_demand_curves.json beside this script. Like ba_buildings.json, the
result is committed and the board ships it: UnityPy and the installed game are
owner-side only, and nothing ba_dashboard.py imports needs either.

Two bundles under <game>/Big Ambitions_Data/StreamingAssets/aa/StandaloneWindows64/:

  defaultlocalgroup_assets_businesstypes_*.bundle
      every business type's dayFactorMultipliers and hourlyFactorMultipliers,
      the two per-type curves in CustomerEntriesCalculatorRetail.GetCustomersByHour
  defaultlocalgroup_assets_items_*.bundle
      every item's productSalesRatio, which sizes a shop's arrivals against its
      square metres

The third term of that formula, gameVariables.baseCustomerPromotionMultiplier,
is *not* in any bundle: it is a house rule stored in the save, and _difficulty()
in ba_dashboard.py already reads it. Nothing about it belongs in this file.

The written shape, keys kept short the way ba_buildings.json keeps them:

    {"types": {"<business type name>": {"d": [7 floats], "h": [24 floats],
                                        "p": ["<item name>", ...]}},
     "items": {"<item name>": ratio}}

`p` is the type's primary products — its businessProducts with `impact >= 1.0`,
the ones GetCustomersByHour sizes the shop by. Without them the ratios cannot be
filtered to the products that count, so the curves file carries them even though
they are not a curve. 80 names across the 44 types.

`d` is indexed by the board's weekday — the game's day number modulo 7, so 0 is
Sunday and 1 is Monday — and `h` by the hour, both already expanded out of the
game's range rows. `items` carries only the non-zero ratios; a name that is
absent sells nothing and reads as 0.0.
"""

from __future__ import annotations

import glob
import json
import os
import sys

try:  # owner-side only: the board never imports this module
    import UnityPy
except ImportError:  # pragma: no cover - depends on the operator's machine
    raise SystemExit(
        "UnityPy is not installed. It is an owner-side dependency, like the one "
        "export_map.py needs, and must not reach the board's requirements:\n"
        "  py -m pip install --target <scratch folder outside this repo> UnityPy\n"
        "then put that folder on PYTHONPATH and run this again."
    )

BUNDLE_DIR = os.path.join(
    "Big Ambitions_Data", "StreamingAssets", "aa", "StandaloneWindows64"
)


def _game_root() -> str:
    """The installed game's folder, found the way the board finds its locale."""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import ba_save

    locale = ba_save.find_game_locale()
    if not locale:
        raise SystemExit(
            "could not find the installed game. Set BA_LOCALE to its "
            "StreamingAssets/locale/en.json and run this again."
        )
    # <game>/Big Ambitions_Data/StreamingAssets/locale/en.json -> <game>
    return os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(locale))))


def _bundle(root: str, stem: str) -> str:
    found = sorted(glob.glob(os.path.join(root, BUNDLE_DIR, stem + "_*.bundle")))
    if not found:
        raise SystemExit(f"no {stem} bundle under {os.path.join(root, BUNDLE_DIR)}")
    return found[-1]


def _behaviours(path: str):
    """Every MonoBehaviour in a bundle, as the plain dictionaries UnityPy reads."""
    for obj in UnityPy.load(path).objects:
        if obj.type.name != "MonoBehaviour":
            continue
        try:
            tree = obj.read_typetree()
        except Exception:  # an asset whose script this build cannot resolve
            continue
        if isinstance(tree, dict):
            yield tree


def _round(value: float) -> float:
    """A Unity float as the number the designer typed: 1.399999976 is 1.4."""
    return round(float(value), 4)


def _day_curve(rows: list) -> list:
    """dayFactorMultipliers as 7 numbers indexed by the board's weekday.

    The game orders its days 1..7 from Monday, and the board's weekday is the
    game's day number modulo 7, which puts Sunday at 0. So ordered % 7 is the
    index, and 7 (Sunday) lands on 0.
    """
    out = [1.0] * 7
    for row in rows:
        out[int(row["dayOfWeekOrdered"]) % 7] = _round(row["multiplier"])
    return out


def _hour_curve(rows: list) -> list:
    """hourlyFactorMultipliers expanded from [start, end) ranges to 24 numbers."""
    out = [0.0] * 24
    for row in rows:
        for hour in range(max(0, int(row["startingHour"])), min(24, int(row["endingHour"]))):
            out[hour] = _round(row["multiplier"])
    return out


def main() -> None:
    root = _game_root()

    types = {}
    for tree in _behaviours(_bundle(root, "defaultlocalgroup_assets_businesstypes")):
        name = tree.get("businessTypeName")
        if not name or "dayFactorMultipliers" not in tree:
            continue
        types[name] = {
            "d": _day_curve(tree["dayFactorMultipliers"]),
            "h": _hour_curve(tree.get("hourlyFactorMultipliers") or []),
            "p": [
                row["itemName"]
                for row in tree.get("businessProducts") or []
                if float(row.get("impact") or 0) >= 1.0
            ],
        }

    items = {}
    for tree in _behaviours(_bundle(root, "defaultlocalgroup_assets_items")):
        name = tree.get("itemName")
        if not name or "productSalesRatio" not in tree:
            continue
        ratio = _round(tree["productSalesRatio"])
        if ratio:  # a zero ratio is the default a missing name already reads as
            items[name] = ratio

    if not types or not items:
        raise SystemExit(
            f"read {len(types)} business types and {len(items)} item ratios; "
            "the bundles did not parse as expected"
        )

    out = {
        "types": {name: types[name] for name in sorted(types)},
        "items": {name: items[name] for name in sorted(items)},
    }
    path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "ba_demand_curves.json"
    )
    with open(path, "w", encoding="utf-8", newline=chr(10)) as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print(
        f"ba_demand_curves.json: {len(out['types'])} business types, "
        f"{len(out['items'])} item ratios, {os.path.getsize(path) // 1024} KB"
    )


if __name__ == "__main__":
    main()
