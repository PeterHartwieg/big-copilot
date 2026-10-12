"""Write web/supporters.json from the private donations ledger.

    python tools/supporters.py [--csv PATH] [--check]

The ledger is a CSV kept outside the repository, one row per PayPal payment:

    date,email,paypal_name,amount_eur,thanked,listed_as
    2026-09-29,someone@example.com,Some One,10.00,2026-10-12,Some O.

Donors are matched by email. A donor's place is the sum of their payments, most
first; a tie goes to whoever gave first. ``listed_as`` is the name the donor
agreed to show (first name and the initial of the last name, or a nickname of
their choosing); their latest non-empty one counts, and "anonymous" puts them
back to Anonymous. Everyone else is written as null, which the page shows as
Anonymous.

Only the order and the agreed names reach web/supporters.json, never an amount
or an email: that file is public. ``--check`` fails when the file is out of date.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from decimal import Decimal

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "web", "supporters.json")
DEFAULT_CSV = os.path.join(os.path.expanduser("~"), "Documents", "Big Copilot", "donations.csv")
ABOUT = ("Donors in order of everything each has given, most first; ties by who gave first. Never write amounts "
         "here: this file is public. A name is first name plus the initial of the last name, or a nickname the "
         "donor chose, and only with that person's yes; null shows as Anonymous. Written by "
         "tools/supporters.py from the private ledger.")


def ranking(rows) -> list[str | None]:
    """The public list: one entry per donor, best first, a name or None."""
    donors: dict[str, dict] = {}
    for row in rows:
        email = (row.get("email") or "").strip().lower()
        if not email:
            raise ValueError(f"a row has no email: {row}")
        d = donors.setdefault(email, {"total": Decimal(0), "first": row["date"].strip(), "name": None})
        d["total"] += Decimal((row.get("amount_eur") or "0").strip().replace(",", "."))
        d["first"] = min(d["first"], row["date"].strip())
        listed = (row.get("listed_as") or "").strip()
        if listed:
            d["name"] = None if listed.lower() == "anonymous" else listed
    order = sorted(donors.values(), key=lambda d: (-d["total"], d["first"]))
    return [d["name"] for d in order]


def render(names) -> str:
    return json.dumps({"about": ABOUT, "supporters": list(names)}, indent=2, ensure_ascii=False) + "\n"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--csv", default=DEFAULT_CSV, help=f"the ledger (default {DEFAULT_CSV})")
    ap.add_argument("--check", action="store_true", help="fail if web/supporters.json is out of date")
    args = ap.parse_args(argv)
    with open(args.csv, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    names = ranking(rows)
    text = render(names)
    current = open(OUT, encoding="utf-8").read() if os.path.exists(OUT) else ""
    if args.check:
        if current != text:
            print("web/supporters.json is out of date: run python tools/supporters.py", file=sys.stderr)
            return 1
        return 0
    if current != text:
        with open(OUT, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
    shown = sum(1 for n in names if n)
    print(f"{len(names)} supporters, {shown} named, {len(names) - shown} anonymous"
          + ("" if current != text else " (no change)"))
    unthanked = sorted({r["email"].strip() for r in rows if not (r.get("thanked") or "").strip()})
    if unthanked:
        print("not thanked yet: " + ", ".join(unthanked))
    return 0


if __name__ == "__main__":
    sys.exit(main())
