"""Say what a rebuild changed in web/py/gametext.json and web/wiki-data.json.

    python tools/game_update/textdiff.py            # the working tree against HEAD
    python tools/game_update/textdiff.py --rev 92c3ef8~1 --to 92c3ef8

Run it after `python build_web.py` against a new game install. A line diff of
wiki-data.json is hundreds of lines for one changed fact, so this compares the
two files by structure instead: game text keys added, removed or changed, and
wiki pages, guides and categories added, removed or changed, with the first
difference inside each changed page. Provenance (hashes, dates, the Steam build
id) is summarised on one line; the per-guide SOURCES and the Steam build id the
guides quote are not counted as changes. Nothing is written. See docs/game-update.md.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
GAMETEXT = "web/py/gametext.json"
WIKI = "web/wiki-data.json"


def at_rev(rev: str, path: str):
    """The file as committed at rev, parsed."""
    raw = subprocess.run(["git", "show", f"{rev}:{path}"], cwd=ROOT, check=True,
                         capture_output=True).stdout
    return json.loads(raw.decode("utf-8"))


def load(rev: str | None, path: str):
    """The file at rev, or in the working tree when rev is None."""
    if rev:
        return at_rev(rev, path)
    with open(os.path.join(ROOT, path), encoding="utf-8") as fh:
        return json.load(fh)


def first_difference(a, b, where: str = "") -> str:
    """The path to the first place two JSON values part, and both sides there."""
    if isinstance(a, dict) and isinstance(b, dict):
        for k in sorted(set(a) | set(b)):
            if a.get(k) != b.get(k):
                return first_difference(a.get(k), b.get(k), f"{where}.{k}")
    elif isinstance(a, list) and isinstance(b, list) and len(a) == len(b):
        for i, (x, y) in enumerate(zip(a, b)):
            if x != y:
                return first_difference(x, y, f"{where}[{i}]")
    if isinstance(a, str) and isinstance(b, str):
        # Long help text: start a little before the first character that differs.
        at = next((i for i, (x, y) in enumerate(zip(a, b)) if x != y), min(len(a), len(b)))
        a, b = a[max(0, at - 40):], b[max(0, at - 40):]
    short = lambda v: json.dumps(v, ensure_ascii=False)[:120]  # noqa: E731
    return f"{where or '.'}: {short(a)} -> {short(b)}"


def by_id(rows: list, key: str) -> dict:
    return {r[key]: r for r in rows}


def compare(label: str, old: dict, new: dict, detail: bool) -> int:
    """Print keys added, removed and changed; return how many changed at all."""
    added = sorted(set(new) - set(old))
    removed = sorted(set(old) - set(new))
    changed = sorted(k for k in set(old) & set(new) if old[k] != new[k])
    for k in added:
        print(f"{label} + {k}")
    for k in removed:
        print(f"{label} - {k}")
    for k in changed:
        print(f"{label} ~ {k}" + (f"   {first_difference(old[k], new[k])}" if detail else ""))
    return len(added) + len(removed) + len(changed)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--rev", default="HEAD", help="the commit to compare from")
    parser.add_argument("--to", help="the commit to compare to (default: the working tree)")
    args = parser.parse_args()

    total = compare("gametext", load(args.rev, GAMETEXT), load(args.to, GAMETEXT), detail=True)

    old, new = load(args.rev, WIKI), load(args.to, WIKI)
    po, pn = old.get("provenance", {}), new.get("provenance", {})
    sha = lambda p, k: ((p.get("sources") or {}).get(k) or {}).get("sha256", "")[:12]  # noqa: E731
    provenance = ("provenance: en.json %s -> %s, helpstructure.json %s -> %s, "
                  "Steam build id %s -> %s, extracted %s -> %s"
                  % (sha(po, "locale"), sha(pn, "locale"), sha(po, "helpStructure"),
                     sha(pn, "helpStructure"), (po.get("steam") or {}).get("buildId"),
                     (pn.get("steam") or {}).get("buildId"), po.get("sourceDate"),
                     pn.get("sourceDate")))
    # Every guide carries its own SOURCES (file sizes, hashes, the extraction
    # date) and quotes the Steam build id in its GAPS, so any rebuild changes
    # them all. Leave SOURCES out, and read the old side as if it had quoted the
    # new build id, which leaves the changes that matter.
    a, b = (po.get("steam") or {}).get("buildId"), (pn.get("steam") or {}).get("buildId")
    if a and b and a != b:
        old = json.loads(json.dumps(old, ensure_ascii=False)
                         .replace(f"buildid {a}", f"buildid {b}"))
    for side in (old, new):
        for guide in [side.get("sample") or {}, *(side.get("guides") or {}).values()]:
            guide.pop("SOURCES", None)
    total += compare("page", by_id(old["pages"], "id"), by_id(new["pages"], "id"), detail=True)
    total += compare("category", by_id(old["categories"], "id"),
                     by_id(new["categories"], "id"), detail=False)
    total += compare("guide", old["guides"], new["guides"], detail=True)
    total += compare("topic", by_id(old["topics"], "slug"), by_id(new["topics"], "slug"),
                     detail=True)
    for key in sorted((set(old) | set(new)) - {"pages", "categories", "guides", "topics",
                                                "provenance"}):
        if old.get(key) != new.get(key):
            total += 1
            print(f"wiki ~ {key}   {first_difference(old.get(key), new.get(key))}")

    print(provenance)
    print(f"{total} change(s) outside provenance")


if __name__ == "__main__":
    main()
