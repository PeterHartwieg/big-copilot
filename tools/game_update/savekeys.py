"""List every $type and field name the newest saves hold, as JSON for dllfields.ps1.

    python tools/game_update/savekeys.py <scratch>/keys.json
    python tools/game_update/savekeys.py <scratch>/keys.json --root FOLDER --min-build 3680 --saves 4

<scratch> is a folder outside the repository.

Walks the save root newest first and takes the newest save per character folder
whose buildNumberAtLastSave is at least --min-build (default: VERIFIED_BUILD in
ba_dashboard.py), up to --saves of them (default 4). Every object with a $type
adds its field names under "typed"; the rest go under "untyped". The output
holds type and field names only, no values, but the lines printed on the way
name the character folders and save files, so never paste them into an issue.

The save root defaults to SAVE_ROOT in ba_dashboard.py, the one check_saves.py
walks. See docs/game-update.md.
"""
from __future__ import annotations

import argparse
import collections
import glob
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from ba_dashboard import SAVE_ROOT, VERIFIED_BUILD  # noqa: E402
from ba_save import load_save  # noqa: E402


def pick(root: str, min_build: int, limit: int) -> list:
    """(path, save) for the newest qualifying save of each character folder."""
    paths = sorted(glob.glob(os.path.join(root, "*", "*.hsg")),
                   key=os.path.getmtime, reverse=True)
    picked, seen = [], set()
    for p in paths:
        d = os.path.dirname(p)
        if d in seen:
            continue
        s = load_save(p)
        if (s.root.get("buildNumberAtLastSave") or 0) >= min_build:
            seen.add(d)
            picked.append((p, s))
        if len(picked) >= limit:
            break
    return picked


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("out", help="where to write the JSON")
    parser.add_argument("--root", default=SAVE_ROOT, help="the save root to walk")
    parser.add_argument("--min-build", type=int, default=VERIFIED_BUILD,
                        help="skip saves older than this build (default %(default)s)")
    parser.add_argument("--saves", type=int, default=4,
                        help="how many character folders to read (default %(default)s)")
    args = parser.parse_args()

    picked = pick(args.root, args.min_build, args.saves)
    if not picked:
        raise SystemExit(f"no save at build {args.min_build} or later under {args.root}")

    typed = collections.defaultdict(set)
    untyped = set()

    def walk(o):
        if isinstance(o, dict):
            for k, v in o.items():
                if k.startswith("$"):
                    continue
                if o.get("$type"):
                    typed[o["$type"]].add(k)
                else:
                    untyped.add(k)
                walk(v)
            for v in o.get("$items", []):
                walk(v)
            for v in o.get("$vals", []):
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    for p, s in picked:
        print(os.path.basename(os.path.dirname(p)), os.path.basename(p),
              s.root.get("buildNumberAtLastSave"))
        walk(s.root)
        for r in s.refs.values():
            walk(r)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump({"typed": {k: sorted(v) for k, v in typed.items()},
                   "untyped": sorted(untyped)}, fh, indent=1)
    print(len(typed), "types,", sum(map(len, typed.values())), "typed keys,",
          len(untyped), "untyped keys")
    print(list(typed)[:15])


if __name__ == "__main__":
    main()
