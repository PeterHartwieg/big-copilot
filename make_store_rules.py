"""Read what a store needs and sells out of the game's bundles, for the store planner.

    py -m pip install --target <scratch folder outside this repo> UnityPy
    set PYTHONPATH=<that folder>
    python make_store_rules.py

Writes ba_store_rules.json beside this script. Like ba_item_prices.json, the
result is committed and the board ships it: UnityPy and the installed game are
owner-side only, and nothing ba_dashboard.py imports needs either. The planner
reads it to price a store that does not exist yet and to list the furniture a
fully outfitted one needs.

Five bundles under <game>/Big Ambitions_Data/StreamingAssets/aa/StandaloneWindows64/:

  defaultlocalgroup_assets_items_*.bundle
      every Item (wholesalePrice, defaultMarketPrice, productSalesRatio, type
      flags, tags, isADemandedProduct, limitDemandToNeighbourhoods, and for
      furniture addedCustomersPerHour, itemsThatCanShowcase,
      producerSettings.itemsToProduce, furnitureRequirements and the tags
      naming the business types a piece serves, ba:itemtag_<type>), plus the
      placement requirements those furnitureRequirements point at. Only two
      kinds name other furniture: "Has counter/desk/chair attached" carry an
      `itemType` bit, expanded to the furniture carrying it, and "Is attached
      to factory ... workstation" carry a `workstationItemName`. "Can only be
      used in ..." (IsPlacedInBusinessOfType(s), `businessTypeName(s)` and
      `invertResult`) limits the business types a piece works in. The rest
      (height, entrance, not duplicated, licensing fee) name no item and are
      left out.
  defaultlocalgroup_assets_businesstypes_*.bundle
      every business type: building type, products and their impact, the
      entrance fees, customer demand sets, requirements and primary skills
  defaultlocalgroup_assets_businessrequirements_*.bundle
      the requirement objects a business type's businessRequirements point at
  defaultlocalgroup_assets_neighborhoods_*.bundle
      each neighbourhood's class mix, marketing strength, demand weight and
      minimum interior score
  defaultlocalgroup_assets_buildings_*.bundle
      the banks' loan terms (VantanderBankSettings, JensenCapitalSettings)
  defaultlocalgroup_assets_vehicletypes_*.bundle
      each VehicleType's price; a motor vehicle (maxFuel above 0) counts
      towards the wealth a bank lends against (PlayerHelper.GetTotalAssetsWorth)
  defaultlocalgroup_assets_prefabs_*.bundle
      the gym machines' controllers (WorkoutMachineController, and the
      treadmill's own), each naming its item and pointing at the
      WorkoutExercise whose workoutType the gym's workout-variety demand counts, and every seat's
      controller (SeatController, SeatFoldingController) with one sitting
      position per seat

Which furniture store sells which piece is not in any bundle. It is in the
game's help text, which tools/build_wiki_data.py has already parsed into the
committed web/wiki-data.json: each business guide's FIXTURES lists vendor site
keys and its SUPPLIERS names them, and the furniture help pages link the rest
as `[Name](address:16 11s)`. Every key is checked against ba_buildings.json.

All of it changes between game builds, so a game update runs this again
(docs/game-update.md). The written shape, keys kept short the way
ba_buildings.json keeps them (a key with an empty or zero value is left out
where noted):

    {"products": {"<item>": {"w": wholesale price, "p": market price,
                             "r": productSalesRatio, "d": 1 demanded product,
                             "s": 1 service, "k": 1 ticket,
                             "l": [neighbourhoods] (omitted when empty)}},
     "furniture": {"<item>": {"c": customers per hour (omitted when 0),
                              "h": [products it holds], "x": [short tags],
                              "bt": [business types its tags name, no prefix],
                              "m": [[furniture it must be attached to], ...], one
                                    group per placement requirement: one of each group,
                              "o": [the only business types it works in, no prefix],
                              "no": [business types it does not work in, no prefix],
                                    "wt": the WorkoutExercise.workoutType a gym machine trains,
                                    "st": the seats a seat carries (its sittingPositions),
                              "v": [vendor site keys]}},  (lists omitted when empty)
     "types": {"<business type>": {"b": building type, "c": 1 player can create,
                                   "i": [[item, impact], ...], "a": maxAmountPerProduct,
                                   "n": 1 accepts customers without orders,
                                   "f": entrance fee item, "fw": weekend fee item,
                                   "dm": [[demand, weight], ...],
                                   "rq": [{"n", "i", "t", "sq", "mx", "any", "lic"}],
                                   "sk": [skills]}},
     "hoods": {"<neighbourhood>": {"w", "m", "u": class percentages,
                                   "ms": marketingStrength, "cw": customerDemandsWeight,
                                   "mi": minimumInteriorScore}},
     "banks": {"<asset name>": {"r": annual interest %, "y": years, "x": max loan,
                                "e": 1 emergency loan}},
     "vendors": {"<site key>": {"n": name, "a": street label, "h": neighbourhood}},
     "vehicles": {"<vehicle type>": price}}  (motor vehicles only: what a bank counts as wealth)

`products` holds every item a business type sells (the gifts and flowers are
furniture too, and sit in both tables), every entrance fee, and every other
non-furniture item with a sales ratio; `furniture` every item with isFurniture.
Furniture prices and type flags stay in ba_item_prices.json.
"""

from __future__ import annotations

import json
import os
import re
import sys

try:  # owner-side only: the board never imports this module
    import UnityPy
except ImportError:  # pragma: no cover - depends on the operator's machine
    raise SystemExit(
        "UnityPy is not installed. It is an owner-side dependency, like the one "
        "make_demand_curves.py needs, and must not reach the board's requirements:\n"
        "  py -m pip install --target <scratch folder outside this repo> UnityPy\n"
        "then put that folder on PYTHONPATH and run this again."
    )

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "tools"))
from make_demand_curves import _behaviours, _bundle, _game_root  # noqa: E402
from make_item_prices import _price  # noqa: E402
from build_wiki_data import parse_address, site_key, street_label  # noqa: E402

SERVICE = 4  # Item.type bit for a product sold as a service
TICKET = "ba:itemtag_isticket"
# The furniture tags the planner counts, by the short name it reads them under.
SHORT_TAGS = {
    "ba:itemtag_isprivacytoilet": "privacy",
    "ba:itemtag_isbusinessstorage": "storage",
    "ba:itemtag_isuniformlocker": "uniform",
    "ba:itemtag_isshoppingcontainerprovider": "basket",
    "ba:itemtag_iscashregister": "register",
    "ba:itemtag_isweighingscale": "scale",
    "ba:itemtag_shelf": "shelf",
}
# The help's own sentence ahead of a furniture page's vendor list.
_PURCHASE = "can be purchased from the following locations"
_ADDRESS_LINK = re.compile(r"\[([^\]]+)\]\(address:\s*([^)]+)\)")


def _behaviours_by_id(path: str) -> dict:
    """Every MonoBehaviour in a bundle by path id, for resolving PPtrs into it."""
    out = {}
    for obj in UnityPy.load(path).objects:
        if obj.type.name != "MonoBehaviour":
            continue
        try:
            tree = obj.read_typetree()
        except Exception:  # an asset whose script this build cannot resolve
            continue
        if isinstance(tree, dict):
            out[obj.path_id] = tree
    return out


def _round(value) -> float:
    """A Unity float as the number the designer typed, to 4 places: 0.699999988 is 0.7."""
    number = round(float(value or 0), 4)
    return int(number) if number == int(number) else number


def _names(values) -> list:
    return sorted({v for v in values or [] if v})


def _requirement_items(req: dict, by_type: dict) -> list:
    """The furniture a placement requirement needs the piece attached to, or []."""
    if req.get("workstationItemName"):
        return [req["workstationItemName"]]
    bit = int(req.get("itemType") or 0)
    if bit:
        return by_type.get(bit, [])
    return []


def _items(root: str):
    trees = _behaviours_by_id(_bundle(root, "defaultlocalgroup_assets_items"))
    items = {t["itemName"]: t for t in trees.values() if t.get("itemName")}
    placement = {pid: t for pid, t in trees.items() if not t.get("itemName")}
    by_type = {}
    for name, tree in items.items():
        if tree.get("isFurniture"):
            flags = int(tree.get("type") or 0)
            bit = 1
            while bit <= flags:
                if flags & bit:
                    by_type.setdefault(bit, []).append(name)
                bit <<= 1
    return items, placement, by_type


def _furniture(items: dict, placement: dict, by_type: dict, type_slugs: set) -> dict:
    out = {}
    unresolved = set()
    for name, tree in items.items():
        if not tree.get("isFurniture"):
            continue
        row = {}
        customers = int(tree.get("addedCustomersPerHour") or 0)
        if customers:
            row["c"] = customers
        holds = list(tree.get("itemsThatCanShowcase") or [])
        holds += (tree.get("producerSettings") or {}).get("itemsToProduce") or []
        if _names(holds):
            row["h"] = _names(holds)
        tags = _names(SHORT_TAGS.get(tag) for tag in tree.get("tags") or [])
        if tags:
            row["x"] = tags
        # A piece tagged for a business type (ba:itemtag_liquorstore) serves that type.
        kinds = _names(tag.removeprefix("ba:itemtag_") for tag in tree.get("tags") or []
                       if tag.removeprefix("ba:itemtag_") in type_slugs)
        if kinds:
            row["bt"] = kinds
        # Each placement requirement is a group of its own: a computer needs a
        # desk and a chair, one of each, never the cheapest of all of them.
        needs = []
        for ref in tree.get("furnitureRequirements") or []:
            req = placement.get(ref.get("m_PathID"))
            if req is None or ref.get("m_FileID"):
                unresolved.add(str(ref))
                continue
            # "Can only be used in Cinemas or Theaters": the game leaves a piece
            # whose requirement is unmet out of the business (HasAnyMissingRequirements).
            kinds = req.get("businessTypeNames") or ([req["businessTypeName"]] if req.get("businessTypeName") else [])
            if kinds:
                row["no" if req.get("invertResult") else "o"] = _names(k.removeprefix("ba:businesstype_") for k in kinds)
                continue
            group = _names(_requirement_items(req, by_type))
            if group and group not in needs:
                needs.append(group)
        if needs:
            row["m"] = needs
        out[name] = row
    if unresolved:
        raise SystemExit(f"furniture requirements outside the items bundle: {sorted(unresolved)}")
    return out


def _products(items: dict, types: list) -> dict:
    wanted = set()
    for tree in types:
        wanted.update(row.get("itemName") for row in tree.get("businessProducts") or [])
        if tree.get("hasEntranceFee"):
            wanted.add(tree.get("defaultEntranceFee"))
        if tree.get("hasWeekendOnlyEntranceFee"):
            wanted.add(tree.get("weekendOnlyEntranceFee"))
    # Gifts and flowers are furniture the player places, yet a business type
    # sells them, so a type's products are kept whatever isFurniture says.
    wanted.update(n for n, t in items.items()
                  if not t.get("isFurniture") and float(t.get("productSalesRatio") or 0) > 0)
    out = {}
    for name in _names(wanted):
        tree = items.get(name)
        if tree is None:
            raise SystemExit(f"a business type sells {name}, which the items bundle does not hold")
        row = {
            "w": _price(tree.get("wholesalePrice")),
            "p": _price(tree.get("defaultMarketPrice")),
            "r": _round(tree.get("productSalesRatio")),
            "d": 1 if tree.get("isADemandedProduct") else 0,
            "s": 1 if int(tree.get("type") or 0) & SERVICE else 0,
            "k": 1 if TICKET in (tree.get("tags") or []) else 0,
        }
        hoods = list(tree.get("limitDemandToNeighbourhoods") or [])
        if hoods:
            row["l"] = hoods
        out[name] = row
    return out


def _requirement(tree: dict) -> dict:
    label = tree.get("businessRequirementName") or ""
    row = {"n": label.removeprefix("ba:businessrequirement_") or str(tree.get("m_Name", "")).lower()}
    if tree.get("items"):
        row["i"] = list(tree["items"])
    if tree.get("itemType"):
        row["t"] = int(tree["itemType"])
    if "squareMetersPerItem" in tree:
        row["sq"] = _round(tree["squareMetersPerItem"])
    if "maxItems" in tree:
        row["mx"] = int(tree["maxItems"])
    if tree.get("m_Name") == "AnyPrimaryProduct":
        row["any"] = 1
    if tree.get("m_Name") == "PaidLicensingFees":
        row["lic"] = 1
    return row


def _types(types: list, requirements: dict) -> dict:
    out = {}
    for tree in types:
        rq = []
        for ref in tree.get("businessRequirements") or []:
            req = requirements.get(ref.get("m_PathID"))
            if req is None:
                raise SystemExit(
                    f"{tree['businessTypeName']} points at requirement {ref}, "
                    "which the businessrequirements bundle does not hold"
                )
            rq.append(_requirement(req))
        row = {
            "b": str(tree.get("suitableBuildingType") or "").removeprefix("ba:buildingtype_"),
            "c": 1 if "ba:businesstag_allowplayercreation" in (tree.get("tags") or []) else 0,
            "i": [[p["itemName"], _round(p.get("impact"))] for p in tree.get("businessProducts") or []],
            "a": _round(tree.get("maxAmountPerProduct")),
            "n": 1 if tree.get("acceptCustomersWithoutOrderEntries") else 0,
        }
        if tree.get("hasEntranceFee") and tree.get("defaultEntranceFee"):
            row["f"] = tree["defaultEntranceFee"]
        if tree.get("hasWeekendOnlyEntranceFee") and tree.get("weekendOnlyEntranceFee"):
            row["fw"] = tree["weekendOnlyEntranceFee"]
        row["dm"] = [
            [str(d["type"]).removeprefix("ba:customerdemand_"), _round(d.get("weight"))]
            for d in tree.get("customerDemandSets") or []
        ]
        row["rq"] = rq
        row["sk"] = list(tree.get("employeePrimarySkills") or [])
        out[tree["businessTypeName"]] = row
    return out


def _hoods(root: str) -> dict:
    out = {}
    for tree in _behaviours(_bundle(root, "defaultlocalgroup_assets_neighborhoods")):
        key = tree.get("neighbourhood")
        if not key or key == "ba:neighborhood_global" or "workingClassPercentage" not in tree:
            continue
        out[key] = {
            "w": _round(tree["workingClassPercentage"]),
            "m": _round(tree.get("middleClassPercentage")),
            "u": _round(tree.get("upperClassClassPercentage")),
            "ms": _round(tree.get("marketingStrength")),
            "cw": _round(tree.get("customerDemandsWeight")),
            "mi": _round(tree.get("minimumInteriorScore")),
        }
    return out


def _banks(root: str) -> dict:
    out = {}
    for tree in _behaviours(_bundle(root, "defaultlocalgroup_assets_buildings")):
        if "annualInterestRate" not in tree or "maxTotalLoanAmount" not in tree:
            continue
        out[tree["m_Name"]] = {
            "r": _round(tree["annualInterestRate"]),
            "y": _round(tree.get("yearsToPayLoan")),
            "x": _price(tree["maxTotalLoanAmount"]),
            "e": 1 if tree.get("allowSideQuestEmergencyLoan") else 0,
        }
    return out


def _vehicles(root: str) -> dict:
    """{vehicle type: price} for the motor vehicles (maxFuel above 0), the ones
    VehicleType.IsMotorVehicle counts as the player's assets."""
    out = {}
    for tree in _behaviours(_bundle(root, "defaultlocalgroup_assets_vehicletypes")):
        name = tree.get("vehicleTypeName")
        if name and float(tree.get("maxFuel") or 0) > 0:
            out[name] = _price(tree.get("price"))
    return out


def _seats(root: str) -> dict:
    """{item: seats} for every seat: its SeatController (or folding theatre
    seat) in the prefab bundle lists one sitting position per seat."""
    out = {}
    for obj in UnityPy.load(_bundle(root, "defaultlocalgroup_assets_prefabs")).objects:
        if obj.type.name != "MonoBehaviour":
            continue
        try:
            script = obj.read(check_read=False).m_Script.read().m_ClassName
        except Exception:  # a component whose script this build cannot resolve
            continue
        if script in ("SeatController", "SeatFoldingController"):
            tree = obj.read_typetree()
            if tree.get("itemName") and tree.get("sittingPositions"):
                out[tree["itemName"]] = len(tree["sittingPositions"])
    return out


def _workout_types(root: str) -> dict:
    """{item: workoutType} for every gym machine: its controller in the prefab
    bundle names the item and points at the WorkoutExercise it trains."""
    env = UnityPy.load(_bundle(root, "defaultlocalgroup_assets_prefabs"))
    exercises, controllers = {}, []
    for obj in env.objects:
        if obj.type.name != "MonoBehaviour":
            continue
        try:
            script = obj.read(check_read=False).m_Script.read().m_ClassName
        except Exception:  # a component whose script this build cannot resolve
            continue
        if script == "WorkoutExercise":
            exercises[obj.path_id] = int(obj.read_typetree()["workoutType"])
        elif "Workout" in script or "Treadmill" in script:
            controllers.append(obj.read_typetree())
    def trains(value):
        """The workout types a controller's fields point at, however nested."""
        if isinstance(value, dict):
            if value.get("m_PathID") in exercises:
                yield exercises[value["m_PathID"]]
            for inner in value.values():
                yield from trains(inner)
        elif isinstance(value, list):
            for inner in value:
                yield from trains(inner)

    out = {}
    for tree in controllers:
        kinds = sorted(set(trains(tree)))
        if tree.get("itemName") and len(kinds) == 1:
            out[tree["itemName"]] = kinds[0]
        elif tree.get("itemName") and kinds:
            raise SystemExit(f"{tree['itemName']} trains {kinds}; the planner counts one type a machine")
    return out


def _vendors(furniture: dict) -> dict:
    """Fill each piece's "v" from the help text and return the vendor table."""
    with open(os.path.join(HERE, "web", "wiki-data.json"), encoding="utf-8") as fh:
        wiki = json.load(fh)
    with open(os.path.join(HERE, "ba_buildings.json"), encoding="utf-8") as fh:
        sites = {f"{row['s']}#{row['n']}": row for row in json.load(fh) if row.get("s")}

    sold, named = {}, {}
    for guide in (wiki.get("guides") or {}).values():
        for slug, fixture in (guide.get("FIXTURES") or {}).items():
            sold.setdefault("ba:itemname_" + slug, set()).update(fixture.get("vendors") or [])
        for key, supplier in (guide.get("SUPPLIERS") or {}).items():
            named.setdefault(key, supplier)

    # A piece no guide lists: its own help page names the stores that sell it.
    link_names = {}
    for page in wiki.get("pages") or []:
        name, body = page.get("key"), page.get("body") or ""
        if name not in furniture or sold.get(name) or _PURCHASE not in body:
            continue
        section = body.split(_PURCHASE, 1)[1].split("\n\n", 1)[0]
        keys = set()
        for label, raw in _ADDRESS_LINK.findall(section):
            address = parse_address(raw)
            if not address:
                raise SystemExit(f"{name}: cannot place the vendor address {raw!r}")
            keys.add(site_key(address))
            link_names.setdefault(site_key(address), (label.strip(), address))
        sold[name] = keys

    vendors = {}
    for name, keys in sold.items():
        if name not in furniture:
            continue
        for key in keys:
            if key not in sites:
                raise SystemExit(f"{name}: vendor {key} is not in ba_buildings.json")
            if key not in vendors:
                supplier = named.get(key)
                if supplier:
                    vendors[key] = {"n": supplier["name"], "a": supplier["street"], "h": supplier["hood"]}
                else:
                    label, address = link_names[key]
                    vendors[key] = {"n": label, "a": street_label(address),
                                    "h": "ba:neighborhood_" + sites[key]["h"]}
        if keys:
            furniture[name]["v"] = sorted(keys)
    return vendors


def main() -> None:
    root = _game_root()

    items, placement, by_type = _items(root)
    types = [t for t in _behaviours(_bundle(root, "defaultlocalgroup_assets_businesstypes"))
             if t.get("businessTypeName")]
    requirements = _behaviours_by_id(_bundle(root, "defaultlocalgroup_assets_businessrequirements"))

    type_slugs = {t["businessTypeName"].removeprefix("ba:businesstype_") for t in types}
    furniture = _furniture(items, placement, by_type, type_slugs)
    for item, kind in _workout_types(root).items():
        if item in furniture:
            furniture[item]["wt"] = kind
    for item, seats in _seats(root).items():
        if item in furniture:
            furniture[item]["st"] = seats
    vendors = _vendors(furniture)
    out = {
        "products": _products(items, types),
        "furniture": furniture,
        "types": _types(types, requirements),
        "hoods": _hoods(root),
        "banks": _banks(root),
        "vendors": vendors,
        "vehicles": _vehicles(root),
    }
    if not all(out.values()):
        raise SystemExit(
            "read " + ", ".join(f"{len(v)} {k}" for k, v in out.items())
            + "; the bundles did not parse as expected"
        )
    out = {k: {name: v[name] for name in sorted(v)} for k, v in out.items()}

    path = os.path.join(HERE, "ba_store_rules.json")
    with open(path, "w", encoding="utf-8", newline=chr(10)) as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print(
        "ba_store_rules.json: " + ", ".join(f"{len(v)} {k}" for k, v in out.items())
        + f", {sum(1 for f in furniture.values() if 'v' in f)} furniture with vendors, "
        f"{os.path.getsize(path) // 1024} KB"
    )


if __name__ == "__main__":
    main()
