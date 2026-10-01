"""Dump extract()'s payload for every save on this machine, and compare two dumps.

    python tools/payload_diff.py dump research/payload-before          # every save under the save root
    python tools/payload_diff.py dump research/payload-after --root DIR --jobs 4
    python tools/payload_diff.py compare research/payload-before research/payload-after

The check for a refactor of ba_dashboard.py that must not change the payload:
dump on main, dump on the branch, compare. `compare` prints the differing
flattened paths per save (the payload snapshot test's differ) and exits 1 if
anything differs, a save present in one dump only included.

`dump` runs safe_extract() on every .hsg under the save root (the macOS one,
else check_saves.SAVE_ROOT, else --root), with no history file, and writes one
JSON per save, keys sorted, into a fresh OUTDIR that mirrors the save root's
folders. A save that fails is written as {"error": ...} so a changed failure
shows up too. The wall-clock fields are replaced as in the snapshot test, and
the line number in an error's "line N" is dropped, so moving code alone does
not read as a change.

The dumps are save contents: OUTDIR must be outside the repository or under
its gitignored research/ folder, and is never committed.
"""
from __future__ import annotations

import argparse
import json
import multiprocessing
import os
import re
import sys
import time
from concurrent.futures import ProcessPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TESTS = os.path.join(ROOT, "tests")
sys.path[:0] = [ROOT, TESTS]

import test_payload_snapshot as snapshot  # noqa: E402
from ba_dashboard import game_text, locale_note, safe_extract  # noqa: E402
from ba_save import Names, load_save  # noqa: E402
from check_saves import SAVE_ROOT, find_saves  # noqa: E402

MAC_SAVE_ROOT = os.path.expanduser(
    "~/Library/Application Support/com.Hovgaard-Games.Big-Ambitions/SaveGames"
)
# _raised_at() names the line an error passed through; the line moves with the code.
ERROR_LINE = re.compile(r"(\.py) line \d+")
ADDRESS = re.compile(r" at 0x[0-9a-fA-F]+")

_locale: dict[str, str] = {}


def default_root() -> str | None:
    for root in (MAC_SAVE_ROOT, SAVE_ROOT):
        if os.path.isabs(root) and os.path.isdir(root):
            return root
    return None


def _start(locale: dict[str, str]) -> None:
    global _locale
    _locale = locale


def dump_one(path: str) -> str:
    """The normalised payload text for one save, or its error as JSON."""
    try:
        # A fresh Names per save, so no save sees what an earlier one left in it.
        payload = safe_extract(load_save(path), Names(dict(_locale)), None)
        # Through JSON once, as the board receives it: a None or int key turns
        # into a string there, and sort_keys could not order it beside strings.
        payload = json.loads(json.dumps(payload, ensure_ascii=False))
        return snapshot.dump(payload)
    except Exception as exc:  # one bad save must not stop the sweep
        message = ADDRESS.sub("", ERROR_LINE.sub(r"\1", str(exc)))
        # Two checkouts dumped against each other differ in where they live.
        for where in sorted({os.path.realpath(ROOT), ROOT}, key=len, reverse=True):
            message = message.replace(where, "<repo>")
        return json.dumps({"error": f"{type(exc).__name__}: {message}"}, indent=1,
                          ensure_ascii=False) + "\n"


def _check_outdir(outdir: str) -> str | None:
    """Why OUTDIR will not do, or None."""
    # macOS and Windows folders ignore case, so compare without it there.
    fold = (lambda p: p.lower()) if sys.platform in ("darwin", "win32") else os.path.normcase
    full = fold(os.path.realpath(outdir))
    # research/ by name, not resolved: a research/ that links into tests/ does not count.
    repo = fold(os.path.realpath(ROOT))
    research = os.path.join(repo, "research")
    if (full == repo or full.startswith(repo + os.sep)) and not full.startswith(research + os.sep):
        return f"{outdir} is inside the repository; use research/<name> or a folder outside it"
    if os.path.exists(outdir) and (not os.path.isdir(outdir) or os.listdir(outdir)):
        return f"{outdir} exists and is not an empty folder"
    return None


def dump(outdir: str, root: str | None, jobs: int) -> int:
    root = root or default_root()
    if not root or not os.path.isdir(root):
        print(f"no save folder: {root or 'none found'}; pass --root", file=sys.stderr)
        return 2
    problem = _check_outdir(outdir)
    if problem:
        print(problem, file=sys.stderr)
        return 2
    saves = sorted(find_saves(root), key=lambda p: os.path.relpath(p, root))
    if not saves:
        print(f"no .hsg files under {root}", file=sys.stderr)
        return 2
    source, locale = game_text()
    print(locale_note(source, locale), file=sys.stderr)
    # Every worker (spawned, so it reads this) hashes alike: set order cannot differ between dumps.
    os.environ["PYTHONHASHSEED"] = "0"
    start = time.perf_counter()
    failed = 0
    with ProcessPoolExecutor(max_workers=jobs, mp_context=multiprocessing.get_context("spawn"),
                             initializer=_start, initargs=(locale,)) as pool:
        for path, text in zip(saves, pool.map(dump_one, saves)):
            target = os.path.join(outdir, os.path.relpath(path, root) + ".json")
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with open(target, "w", encoding="utf-8", newline="\n") as fh:
                fh.write(text)
            failed += text.startswith('{\n "error":')
    print(f"{len(saves)} saves dumped ({failed} as errors) in {time.perf_counter() - start:.1f} s",
          file=sys.stderr)
    return 0


def _files(folder: str) -> set[str]:
    return {os.path.relpath(os.path.join(d, f), folder)
            for d, _dirs, files in os.walk(folder) for f in files if f.endswith(".json")}


def compare(a: str, b: str) -> int:
    for folder in (a, b):
        if not os.path.isdir(folder):
            print(f"no such folder: {folder}", file=sys.stderr)
            return 2
    left, right = _files(a), _files(b)
    if not left or not right:
        print(f"no dump in {a if not left else b}", file=sys.stderr)
        return 2
    differing = 0
    for name in sorted(left | right):
        if name not in right or name not in left:
            print(f"{name}: only in {a if name in left else b}")
            differing += 1
            continue
        texts = []
        for folder in (a, b):
            with open(os.path.join(folder, name), encoding="utf-8") as fh:
                texts.append(fh.read())
        if texts[0] != texts[1]:
            print(f"{name}:\n{snapshot.diff(*texts)}")
            differing += 1
    print(f"{len(left | right)} saves compared, {differing} differ")
    return 1 if differing else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = parser.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("dump", help="extract every save into OUTDIR")
    d.add_argument("outdir")
    d.add_argument("--root", help="save folder to walk (default: this machine's)")
    d.add_argument("--jobs", type=int, default=os.cpu_count() or 1)
    c = sub.add_parser("compare", help="diff two dumps; exit 1 on any difference")
    c.add_argument("a")
    c.add_argument("b")
    c.add_argument("--limit", type=int, default=snapshot.MAX_DIFFS,
                   help=f"differing paths shown per save (default {snapshot.MAX_DIFFS})")
    args = parser.parse_args(argv)
    if args.cmd == "dump":
        # Windows caps a process pool at 61 workers.
        jobs = max(1, min(args.jobs, 61) if sys.platform == "win32" else args.jobs)
        return dump(args.outdir, args.root, jobs)
    snapshot.MAX_DIFFS = max(1, args.limit)
    return compare(args.a, args.b)


if __name__ == "__main__":
    sys.exit(main())
