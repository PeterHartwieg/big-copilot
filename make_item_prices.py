"""Read the game's furniture prices and wall and floor materials out of its bundles.

    py -m pip install --target <scratch folder outside this repo> UnityPy
    set PYTHONPATH=<that folder>
    python make_item_prices.py

Writes ba_item_prices.json beside this script. Like ba_demand_curves.json, the
result is committed and the board ships it: UnityPy and the installed game are
owner-side only, and nothing ba_dashboard.py imports needs either.

Bundles under StreamingAssets/aa/StandaloneWindows64/ (StandaloneOSX on macOS):

  defaultlocalgroup_assets_items_*.bundle
      every Item: itemName, defaultMarketPrice (what the game charges for a new
      piece of furniture, whoever sells it, and what GetWorth falls back to when
      an ItemInstance's priceOnPurchase is 0), the `type` bit flags (music
      1024, seating 4096, point of sale 8, sink 16777216, toilet 33554432, ...)
      and isFurniture
  defaultlocalgroup_assets_interiormaterialpresets_*.bundle
      every InteriorMaterialPreset: uuid (the MaterialID a save's
      interiorDesigns hold), type (1 floor, 2 wall), price and canBePurchased
  defaultlocalgroup_assets_buildingtypes_*.bundle
      building types tagged calculateaiownedvaluation, for takeover estimates

StreamingAssets/BusinessLayouts supplies each rival interior's item list. Its
valuation is the sum of defaultMarketPrice for those items (BusinessLayoutSet
GetValuation), without stock, wall materials or the player's resale multiplier.

Prices change between game builds, so a game update runs this again
(docs/game-update.md). The written shape, keys kept short the way
ba_buildings.json keeps them:

    {"items": {"<item name>": {"p": price, "t": type flags}},
     "materials": {"<uuid>": {"t": 1 floor | 2 wall, "p": price, "b": 1 if it can be bought}},
     "takeover": {"types": ["retail", ...],
                  "layouts": {"<business slug>|<size/version>|<layout name, lower-case>": value}}}

Only furniture is kept (`isFurniture`): products are priced by the market, not
by this table. A price is written as the designer typed it, rounded to cents.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import struct
import sys

try:  # owner-side only: the board never imports this module
    import UnityPy  # noqa: F401  (make_demand_curves' readers use it)
except ImportError:  # pragma: no cover - depends on the operator's machine
    raise SystemExit(
        "UnityPy is not installed. It is an owner-side dependency, like the one "
        "make_demand_curves.py needs, and must not reach the board's requirements:\n"
        "  py -m pip install --target <scratch folder outside this repo> UnityPy\n"
        "then put that folder on PYTHONPATH and run this again."
    )

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_demand_curves import _behaviours  # noqa: E402
from ba_save import find_game_locale  # noqa: E402


def _price(value) -> float:
    """A Unity float as the price the designer typed: 899.99994 is 900."""
    price = round(float(value or 0), 2)
    return int(price) if price == int(price) else price


def main() -> None:
    locale = find_game_locale()
    if not locale:
        raise SystemExit("could not find the installed game; set BA_LOCALE to its locale/en.json")
    streaming = Path(locale).parents[1]

    def bundle(stem):
        found = sorted(streaming.glob(f"aa/Standalone*/{stem}_*.bundle"))
        if len(found) != 1:
            raise SystemExit(f"expected one {stem} bundle, found {len(found)}")
        return str(found[0])

    items, market_prices = {}, {}
    for tree in _behaviours(bundle("defaultlocalgroup_assets_items")):
        name = tree.get("itemName")
        if not name or "defaultMarketPrice" not in tree:
            continue
        market_prices[name] = float(tree["defaultMarketPrice"])
        if tree.get("isFurniture"):
            items[name] = {"p": _price(tree["defaultMarketPrice"]), "t": int(tree.get("type") or 0)}

    materials = {}
    for tree in _behaviours(bundle("defaultlocalgroup_assets_interiormaterialpresets")):
        uuid = tree.get("uuid")
        if not uuid or "price" not in tree:
            continue
        materials[uuid] = {
            "t": int(tree.get("type") or 0),
            "p": _price(tree["price"]),
            "b": 1 if tree.get("canBePurchased") else 0,
        }

    takeover_types = sorted(
        tree["buildingType"].removeprefix("ba:buildingtype_")
        for tree in _behaviours(bundle("defaultlocalgroup_assets_buildingtypes"))
        if "ba:buildingtypetag_calculateaiownedvaluation" in (tree.get("tags") or [])
    )
    layouts = {}
    for path in sorted((streaming / "BusinessLayouts").glob("*/*/*.json")):
        layout = json.loads(path.read_text(encoding="utf-8-sig"))
        size = layout["BuildingSize"].removeprefix("ba:buildingsize_").upper()
        key = f"{layout['BusinessType']}|{size}{layout['BuildingVersion']}|{path.stem.lower()}"
        # LINQ Sum(float) accumulates in double and returns a float. Missing
        # item facts must fail the export, not silently undervalue a takeover.
        total = sum(market_prices[item["itemName"]] for item in layout["Items"])
        value = struct.unpack("f", struct.pack("f", total))[0]
        if key in layouts:
            raise SystemExit(f"duplicate business layout: {key}")
        layouts[key] = value

    if not items or not materials or not layouts or not takeover_types:
        raise SystemExit(
            f"read {len(items)} items, {len(materials)} materials, {len(layouts)} layouts "
            f"and {len(takeover_types)} takeover building types; "
            "the bundles did not parse as expected"
        )

    out = {
        "items": {name: items[name] for name in sorted(items)},
        "materials": {uuid: materials[uuid] for uuid in sorted(materials)},
        "takeover": {"types": takeover_types, "layouts": dict(sorted(layouts.items()))},
    }
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ba_item_prices.json")
    with open(path, "w", encoding="utf-8", newline=chr(10)) as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print(
        f"ba_item_prices.json: {len(out['items'])} items, "
        f"{len(out['materials'])} materials, {len(layouts)} rival layouts, {os.path.getsize(path) // 1024} KB"
    )


if __name__ == "__main__":
    main()
