"""Parse, extract and render every save on this machine, then check a few numbers.

    python check_saves.py                     # every .hsg under the default save root
    python check_saves.py "path\\to\\folder"    # a different root to walk
    python check_saves.py -v                  # print a traceback for each failure

A save that parses can still yield plausible wrong figures, so the newest save is
also put through a handful of spot-checks against the raw save fields. Nothing is
written: the history path is None, so market_history.json is left alone.

Saves older than MIN_BUILD are listed as skipped rather than tried: they lack
fields the board relies on, so a failure there says nothing about the tool.

Exit code is 1 if a save at or above MIN_BUILD failed, or a spot-check failed.
"""

from __future__ import annotations

import os
import sys
import time
import traceback

from ba_save import load_save, load_locale
from ba_dashboard import MIN_BUILD, VERIFIED_BUILD, Names, render, safe_extract

SAVE_ROOT = os.path.join(
    os.environ.get("USERPROFILE", ""),
    r"AppData\LocalLow\Hovgaard Games\Big Ambitions\SaveGames\Big Ambitions",
)

EMPTY_TYPE = "ba:businesstype_empty"


def find_saves(root: str) -> list[str]:
    """Every .hsg under root, character folders included, newest last."""
    found = []
    for folder, _dirs, files in os.walk(root):
        for name in files:
            if name.lower().endswith(".hsg"):
                found.append(os.path.join(folder, name))
    found.sort(key=os.path.getmtime)
    return found


def character_of(path: str, root: str) -> str:
    """The character folder a save sits in, relative to the root being walked."""
    rel = os.path.relpath(os.path.dirname(path), root)
    return "." if rel == "." else rel.split(os.sep)[0]


# ------------------------------------------------------------------ spot-checks
def residential_addresses(save) -> set:
    """Apartments, billed as residences rather than businesses.

    Recomputed here rather than imported, so the check is a second opinion on
    extract() and not a restatement of it. Mirrors _residential_addresses in
    ba_dashboard.py: the addresses named in the last five days of residential
    statements.
    """
    summaries = sorted(
        save.items(save.root["financialSummaries"]), key=lambda s: s["dayNumber"]
    )
    out = set()
    for summary in summaries[-5:]:
        for statement in save.items(summary.get("residentialStatements")):
            addr = save.address(statement.get("Address"))
            if addr:
                out.add(addr)
    return out


def count_trading(save) -> tuple[int, int]:
    """(extract's rule, the businessTypeName rule) for rented, trading premises.

    extract() keeps every BuildingRegistration with RentedByPlayer, drops the
    residential ones, and calls a site vacant when it has no BusinessName --
    businessTypeName never enters into it. The second figure applies the
    business-type rule instead, so a divergence between the two is visible
    rather than hidden behind whichever one the check happened to pick.
    """
    residential = residential_addresses(save)
    rented = [
        b
        for b in save.items(save.root["BuildingRegistrations"])
        if b.get("RentedByPlayer")
    ]
    by_name = sum(
        1
        for b in rented
        if (b["StreetName"], b["StreetNumber"]) not in residential
        and b.get("BusinessName")
    )
    by_type = sum(1 for b in rented if b.get("businessTypeName", "") != EMPTY_TYPE)
    return by_name, by_type


def spot_check(save, data) -> bool:
    """A few invariants that catch wrong numbers, not just crashes."""
    results = []

    day, raw_day = data["meta"]["day"], save.root["Day"]
    results.append(("meta.day == root Day", day == raw_day, day, raw_day))

    by_name, by_type = count_trading(save)
    trading = data["kpi"]["businesses"]
    results.append(
        ("kpi.businesses == rented, non-residential, named", trading == by_name,
         trading, by_name)
    )

    cash, raw_cash = data["kpi"]["cash"], save.root["Money"]
    results.append(
        ("kpi.cash == root Money (+/- $1)", abs(cash - raw_cash) <= 1, cash, raw_cash)
    )

    print()
    print(f"Spot-checks on the newest save: {os.path.basename(save.path)}")
    for label, ok, got, want in results:
        print(f"  {'PASS' if ok else 'FAIL'}  {label:<48} {got!r} vs {want!r}")
    print(
        f"  note  rented premises whose businessTypeName is not "
        f"{EMPTY_TYPE}: {by_type}"
    )
    return all(ok for _, ok, _, _ in results)


# ------------------------------------------------------------------------- main
def main() -> int:
    args = [a for a in sys.argv[1:] if a not in ("-v", "--traceback")]
    verbose = len(args) != len(sys.argv) - 1
    root = args[0] if args else SAVE_ROOT
    if not os.path.isdir(root):
        print(f"no such folder: {root}")
        return 1

    names = Names(load_locale())
    saves = find_saves(root)
    if not saves:
        print(f"no .hsg files under {root}")
        return 1

    print(
        f"{len(saves)} saves under {root}\n"
        f"board verified on game build {VERIFIED_BUILD}; "
        f"saves below build {MIN_BUILD} are skipped as too old\n"
    )
    header = (
        f"{'character':<10} {'file':<28} {'day':>5} {'build':>6} "
        f"{'parse':>6} {'extr':>6} {'rendr':>6}  result"
    )
    print(header)
    print("-" * len(header))

    failures = 0
    skipped = 0
    newest = saves[-1]
    newest_pair = None
    newest_skipped = False
    by_build: dict[object, list[int]] = {}

    for path in saves:
        character = character_of(path, root)[:8]
        name = os.path.basename(path)[:28]
        day = build = "?"
        parse = ex = rn = 0.0
        try:
            t0 = time.perf_counter()
            save = load_save(path)
            parse = time.perf_counter() - t0
            # Day and build come from the save itself, so they are reported
            # even when the extraction below is the part that fails.
            day = save.root.get("Day", "?")
            raw_build = save.root.get("buildNumberAtLastSave")
            build = raw_build or "-"

            if isinstance(raw_build, int) and raw_build < MIN_BUILD:
                # Too old to carry the fields the board reads, so extraction is
                # not even attempted: a failure here would say nothing.
                skipped += 1
                result = f"skipped (build < {MIN_BUILD})"
                if path == newest:
                    newest_skipped = True
            else:
                t1 = time.perf_counter()
                # None as the history path: History skips both the read and the
                # write, so market_history.json is neither loaded nor touched.
                data = safe_extract(save, names, None)
                t2 = time.perf_counter()
                render(data)
                rn = time.perf_counter() - t2
                ex = t2 - t1
                result = "OK"
                if path == newest:
                    newest_pair = (save, data)
        except Exception as exc:  # a bad save must not stop the sweep
            failures += 1
            result = f"{type(exc).__name__}: {exc}"
            if verbose:
                traceback.print_exc(limit=3, file=sys.stdout)
        print(
            f"{character:<10} {name:<28} {str(day):>5} {str(build):>6} "
            f"{parse:>6.2f} {ex:>6.2f} {rn:>6.2f}  {result}"
        )
        tally = by_build.setdefault(build, [0, 0, 0])
        tally[0 if result == "OK" else 1 if result.startswith("skipped") else 2] += 1

    checks_ok = True
    if newest_pair:
        checks_ok = spot_check(*newest_pair)
    elif newest_skipped:
        # Nothing was claimed about this save, so nothing about it can be wrong.
        print("\nthe newest save is too old for the board, so no spot-checks ran")
    else:
        print("\nthe newest save failed to load, so no spot-checks ran")
        checks_ok = False

    # Failures cluster by game build far more than by anything else, so the
    # tally says at a glance whether a save is simply too old for the tool.
    print("\nBy game build:")
    for build in sorted(by_build, key=lambda b: (b == "-", b)):
        ok, old, bad = by_build[build]
        print(
            f"  build {str(build):>6}  {ok:>2} OK  {old:>2} skipped  {bad:>2} failed"
        )

    print(
        f"\n{len(saves) - failures - skipped} supported saves OK, "
        f"{skipped} skipped as too old, {failures} failed"
    )
    return 0 if failures == 0 and checks_ok else 1


if __name__ == "__main__":
    sys.exit(main())
