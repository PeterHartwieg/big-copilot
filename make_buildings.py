"""Turn the companion map dump into the building table the board ships.

    python make_buildings.py path\\to\\companion_buildings.json
    python make_buildings.py --versions

Writes ba_buildings.json beside this script: one compact object per building in
the city, sorted by street then number. The city map is fixed, so the file only
needs regenerating when the game adds a street or a neighbourhood.

Keys are single letters to keep the file under 100 KB:
  s street slug · n number · h neighbourhood id · t building type
  z size code   · m square metres · x traffic index · v building version

The companion dump has no version. `--versions` reads each building's
BuildingVersion from the installed game's buildings bundle and writes it into
the existing table. It is owner-side, like make_demand_curves.py:

    py -m pip install --target <scratch folder outside this repo> UnityPy
    set PYTHONPATH=<that folder>
    python make_buildings.py --versions

Size plus version is the building's layout ("C2"), the key the floor plans use
(make_floor_plans.py). A run from the companion dump keeps the versions already
in the table, so the two steps can run in either order.
"""

from __future__ import annotations

import json
import os
import sys

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ba_buildings.json")

# The game's neighbourhood ids (ba:neighborhood_<id>), stored as they are: the
# board knows a neighbourhood by its key and looks the words up. Keep the set in
# step with HOOD_IDS in ba_dashboard.py.
HOODS = {
    "midtown",
    "hellskitchen",
    "murrayhill",
    "lowermanhattan",
    "garmentdistrict",
    "industrycity",
    "thehamptons",
}


def _write(rows: list) -> None:
    with open(OUT, "w", encoding="utf-8", newline=chr(10)) as fh:
        json.dump(rows, fh, ensure_ascii=False, separators=(",", ":"))


def _read() -> list:
    try:
        with open(OUT, encoding="utf-8") as fh:
            return json.load(fh)
    except FileNotFoundError:
        return []


def game_versions() -> dict:
    """{(street slug, number): (type, size code, version)} from the game's bundle."""
    try:  # owner-side only: the board never imports this module
        import UnityPy
    except ImportError:  # pragma: no cover - depends on the operator's machine
        raise SystemExit(
            "UnityPy is not installed. It is an owner-side dependency and must not "
            "reach the board's requirements:\n"
            "  py -m pip install --target <scratch folder outside this repo> UnityPy\n"
            "then put that folder on PYTHONPATH and run this again."
        )
    from make_demand_curves import _bundle, _game_root

    path = _bundle(_game_root(), "defaultlocalgroup_assets_buildings")
    out = {}
    for obj in UnityPy.load(path).objects:
        if obj.type.name != "MonoBehaviour":
            continue
        try:
            tree = obj.read_typetree()
        except Exception:  # an asset whose script this build cannot resolve
            continue
        if not isinstance(tree, dict) or "BuildingVersion" not in tree:
            continue
        out[(tree["StreetName"], int(tree["StreetNumber"]))] = (
            tree["BuildingType"].removeprefix("ba:buildingtype_"),
            tree["BuildingSize"].removeprefix("ba:buildingsize_").upper(),
            int(tree["BuildingVersion"]),
        )
    return out


def add_versions() -> None:
    """Write each building's version into the existing table.

    The game and the table have to agree on the type and size of every
    building both hold; a disagreement means the table is from another game
    build and has to be regenerated first, so it stops rather than guess.
    """
    rows = _read()
    if not rows:
        raise SystemExit("no ba_buildings.json to add versions to; run the companion step first")
    game = game_versions()
    missing, clash = 0, []
    for r in rows:
        found = game.get((r["s"], r["n"]))
        if not found:
            missing += 1
            r.pop("v", None)
            continue
        kind, size, version = found
        if (kind, size) != (r["t"], r["z"]):
            clash.append(f"{r['n']} {r['s']}: table {r['t']} {r['z']}, game {kind} {size}")
        r["v"] = version
    if clash:
        raise SystemExit("the table and the game disagree:\n  " + "\n  ".join(clash[:20]))
    _write(rows)
    print(f"ba_buildings.json: versions for {len(rows) - missing} of {len(rows)} buildings, "
          f"{os.path.getsize(OUT) // 1024} KB")


def main() -> None:
    if sys.argv[1:] == ["--versions"]:
        add_versions()
        return
    if len(sys.argv) != 2:
        raise SystemExit("usage: python make_buildings.py <companion_buildings.json> | --versions")
    with open(sys.argv[1], encoding="utf-8") as fh:
        city = json.load(fh)
    versions = {(r["s"], r["n"]): r["v"] for r in _read() if "v" in r}

    rows = []
    for b in city:
        hood = b["neighborhood_id"]
        if hood not in HOODS:
            raise SystemExit(
                f"unknown neighbourhood id {b['neighborhood_id']!r} on {b['id']}; "
                "add it to HOODS"
            )
        # The companion's id is "<number>-<street slug without ba:street_>".
        rows.append(
            {
                "s": "ba:street_" + b["id"].split("-", 1)[1],
                "n": int(b["street_number"]),
                "h": hood,
                "t": b["building_type"],
                "z": b["building_size"].removeprefix("ba:buildingsize_").upper(),
                "m": b["square_meters"],
                "x": b["traffic_index"],
            }
        )
        # The companion dump has no version; keep the one --versions wrote.
        version = versions.get((rows[-1]["s"], rows[-1]["n"]))
        if version is not None:
            rows[-1]["v"] = version
    rows.sort(key=lambda r: (r["s"], r["n"]))

    _write(rows)
    print(f"ba_buildings.json: {len(rows)} buildings, {os.path.getsize(OUT) // 1024} KB")


if __name__ == "__main__":
    main()
