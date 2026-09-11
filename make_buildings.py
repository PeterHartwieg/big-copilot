"""Turn the companion map dump into the building table the board ships.

    python make_buildings.py path\\to\\companion_buildings.json

Writes ba_buildings.json beside this script: one compact object per building in
the city, sorted by street then number. The city map is fixed, so the file only
needs regenerating when the game adds a street or a neighbourhood.

Keys are single letters to keep the file under 100 KB:
  s street slug · n number · h neighbourhood · t building type
  z size code   · m square metres · x traffic index
"""

from __future__ import annotations

import json
import os
import sys

# The game's neighbourhood ids (ba:neighborhood_<id>) as the display names the
# board matches on. Keep the spellings in step with NEIGHBOURHOODS in
# ba_dashboard.py: the demand grid and the name-prefix fallback compare them
# verbatim.
HOODS = {
    "midtown": "Midtown",
    "hellskitchen": "Hell's Kitchen",
    "murrayhill": "Murray Hill",
    "lowermanhattan": "Lower Manhattan",
    "garmentdistrict": "Garment District",
    "industrycity": "Industry City",
    "thehamptons": "The Hamptons",
}


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: python make_buildings.py <companion_buildings.json>")
    with open(sys.argv[1], encoding="utf-8") as fh:
        city = json.load(fh)

    rows = []
    for b in city:
        hood = HOODS.get(b["neighborhood_id"])
        if hood is None:
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
    rows.sort(key=lambda r: (r["s"], r["n"]))

    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ba_buildings.json")
    with open(out, "w", encoding="utf-8", newline=chr(10)) as fh:
        json.dump(rows, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"ba_buildings.json: {len(rows)} buildings, {os.path.getsize(out) // 1024} KB")


if __name__ == "__main__":
    main()
