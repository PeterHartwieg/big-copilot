"""Hold marketing_score() against the promotion every save on this machine stores.

    python tools/check_marketing.py              # every .hsg under the save root
    python tools/check_marketing.py --root DIR

Owner only: it reads private saves, so it is not part of the test suite
(tests/test_marketing_plan.py covers the formula on synthetic sites). Run it
after a change to marketing_score(), MARKETING_REACH or the neighbourhood
factors. For every rented shop or office whose building has a known area it
recomputes (marketing, total) from the save's traffic index and enabled
campaigns and compares it with the save's own promotion. Prints each mismatch
and exits 1 if there is any, or if saves were found but no site was checked;
an error while comparing is raised, not skipped. Its output names saves and addresses: never
commit it.
"""
from __future__ import annotations

import argparse
import glob
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

import ba_dashboard as d  # noqa: E402
from ba_save import load_save  # noqa: E402


def check(save):
    """Yield (label, got, stored) for every comparable site in one loaded save."""
    for b in save.items(save.root.get("BuildingRegistrations")):
        if not b.get("RentedByPlayer"):
            continue
        row = d.load_buildings().get((b["StreetName"], b["StreetNumber"]))
        if not row or row.get("t") not in d.MARKETING_REACH or not row.get("m"):
            continue
        if b.get("businessTypeName") in (None, "ba:businesstype_empty"):
            continue
        promo = save.deref(b.get("promotion")) or {}
        on = {c.get("marketingTypeName") for c in save.items(b.get("marketingCampaigns")) if c.get("enabled")}
        got = d.marketing_score(promo.get("trafficIndex", 0), on, row["m"], row["t"], d.hood_key(row))
        label = f"{b.get('businessTypeName')} {b['StreetName']} {b['StreetNumber']}"
        yield label, got, (promo.get("marketing"), promo.get("total"))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--root", default=d.SAVE_ROOT, help="save root (default: the game's)")
    args = ap.parse_args(argv)
    saves = sorted(glob.glob(os.path.join(args.root, "**", "*.hsg"), recursive=True))
    if not saves:
        print(f"no saves under {args.root}")
        return 0
    checked = bad = unreadable = 0
    for path in saves:
        try:
            save = load_save(path)
        except Exception:  # noqa: BLE001 - an unreadable save is check_saves.py's business
            unreadable += 1
            continue
        # A comparison error is a formula bug, not an unreadable save: let it raise.
        for label, got, stored in check(save):
            checked += 1
            if got != stored:
                bad += 1
                print(f"{os.path.relpath(path, args.root)} {label}: computed {got}, save has {stored}")
    print(f"{len(saves)} saves, {unreadable} unreadable, {checked} sites checked, {bad} mismatches")
    if not checked:
        print("no shop or office was checked: nothing held the formula")
        return 1
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
