"""Read the game's furniture prices and wall and floor materials out of its bundles.

    py -m pip install --target <scratch folder outside this repo> UnityPy
    set PYTHONPATH=<that folder>
    python make_item_prices.py

Writes ba_item_prices.json beside this script. Like ba_demand_curves.json, the
result is committed and the board ships it: UnityPy and the installed game are
owner-side only, and nothing ba_dashboard.py imports needs either.

Two bundles under <game>/Big Ambitions_Data/StreamingAssets/aa/StandaloneWindows64/:

  defaultlocalgroup_assets_items_*.bundle
      every Item: itemName, defaultMarketPrice (what the game charges for a new
      piece of furniture, whoever sells it, and what GetWorth falls back to when
      an ItemInstance's priceOnPurchase is 0), the `type` bit flags (music
      1024, seating 4096, point of sale 8, sink 16777216, toilet 33554432, ...)
      and isFurniture
  defaultlocalgroup_assets_interiormaterialpresets_*.bundle
      every InteriorMaterialPreset: uuid (the MaterialID a save's
      interiorDesigns hold), type (1 floor, 2 wall), price and canBePurchased

Prices change between game builds, so a game update runs this again
(docs/game-update.md). The written shape, keys kept short the way
ba_buildings.json keeps them:

    {"items": {"<item name>": {"p": price, "t": type flags}},
     "materials": {"<uuid>": {"t": 1 floor | 2 wall, "p": price, "b": 1 if it can be bought}}}

Only furniture is kept (`isFurniture`): products are priced by the market, not
by this table. A price is written as the designer typed it, rounded to cents.
"""

from __future__ import annotations

import json
import os
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
from make_demand_curves import _behaviours, _bundle, _game_root  # noqa: E402


def _price(value) -> float:
    """A Unity float as the price the designer typed: 899.99994 is 900."""
    price = round(float(value or 0), 2)
    return int(price) if price == int(price) else price


def main() -> None:
    root = _game_root()

    items = {}
    for tree in _behaviours(_bundle(root, "defaultlocalgroup_assets_items")):
        name = tree.get("itemName")
        if not name or "defaultMarketPrice" not in tree or not tree.get("isFurniture"):
            continue
        items[name] = {"p": _price(tree["defaultMarketPrice"]), "t": int(tree.get("type") or 0)}

    materials = {}
    for tree in _behaviours(_bundle(root, "defaultlocalgroup_assets_interiormaterialpresets")):
        uuid = tree.get("uuid")
        if not uuid or "price" not in tree:
            continue
        materials[uuid] = {
            "t": int(tree.get("type") or 0),
            "p": _price(tree["price"]),
            "b": 1 if tree.get("canBePurchased") else 0,
        }

    if not items or not materials:
        raise SystemExit(
            f"read {len(items)} items and {len(materials)} materials; "
            "the bundles did not parse as expected"
        )

    out = {
        "items": {name: items[name] for name in sorted(items)},
        "materials": {uuid: materials[uuid] for uuid in sorted(materials)},
    }
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ba_item_prices.json")
    with open(path, "w", encoding="utf-8", newline=chr(10)) as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print(
        f"ba_item_prices.json: {len(out['items'])} items, "
        f"{len(out['materials'])} materials, {os.path.getsize(path) // 1024} KB"
    )


if __name__ == "__main__":
    main()
