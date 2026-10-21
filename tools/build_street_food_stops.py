"""Build public stopping-place facts from the owner's native route catalogue export.

Input is the combined `rows` from the isolated test bridge's read-only
`route {op: catalogue, start, count}` batches, never a player save. Regenerate
after changes to city geometry or Street Food's StopPicker/Legality rules.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path


def catalogue(rows, source):
    spots = {}
    for row in rows:
        if "refusal" in row:
            continue
        if row.get("kind") not in ("cart", "truck") or not isinstance(row.get("key"), str):
            raise ValueError("Invalid stopping-place identity")
        if any(type(row.get(k)) not in (int, float) or not math.isfinite(row[k]) or abs(row[k]) > 1e6
               for k in ("x", "y", "z", "heading")):
            raise ValueError("Invalid stopping-place coordinates")
        # Preserve native float coordinates; don't move a valid place by rounding.
        spot = {k: row[k] for k in ("kind", "key", "x", "y", "z", "heading")}
        identity = json.dumps([spot[k] for k in ("kind", "x", "z", "heading")], separators=(",", ":"))
        ident = hashlib.sha256(identity.encode()).hexdigest()[:16]
        spots.setdefault(ident, {"id": ident, **spot})
    if not spots or {s["kind"] for s in spots.values()} != {"cart", "truck"}:
        raise ValueError("The export must contain cart and truck places")
    return {"version": 1, "source": source, "spots": sorted(spots.values(), key=lambda s: s["id"])}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--game-build", required=True)
    parser.add_argument("--mod-source", required=True, help="Street Food commit used for the native picker")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "ba_street_food_stops.json")
    args = parser.parse_args()
    data = json.loads(args.input.read_text())
    if data.get("complete") is not True:
        raise ValueError("Export is incomplete")
    output = catalogue(data["rows"], {"gameBuild": args.game_build, "modCommit": args.mod_source,
        "method": "StopPicker.Snap at city building entrances; prefab hull checked against permanent obstacles", "entrances": data["total"],
        "refused": sum("refusal" in r for r in data["rows"])})
    args.output.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"Wrote {len(output['spots'])} checked places to {args.output}")


if __name__ == "__main__":
    main()
