"""A three-role site's hour grid, and the findings the Python really draws from it.

tests/office_site.test.cjs used to carry both the grid and a hand-written
finding beside it, and the two disagreed: the finding said "staffing and
projection booths" over hours where both roles were in fact short of *people*,
and it merged hours whose limits were not the same. A test whose fixture cannot
happen proves nothing about the page.

So the grid is built here and `_hour_findings()` is run over it, exactly as
`extract()` does. Whatever it returns is what the page is given.

The Monday it describes, hour by hour:

10:00  50 customers. One ticket booth of two is manned (50/h) and both
       projection booths are (50/h). Two roles tied at the site's own 50, one
       short of people and one short of furniture: a genuine staffing/posts
       tie, which is the case the joined wording exists for.
12:00  25 customers. Both ticket booths are manned (100/h) and one projection
       booth of two is (25/h), so projection alone holds the hour, and holds
       it for want of a person rather than of a booth.
14-16  5 customers, with five stage crew on. The site as a whole never has two
       people on those hours, so only a per-role reading sees the idle crew.

10:00 and 12:00 are therefore two findings of overlapping kinds on different
roles — the case where a chip keyed on the kind alone lights the other one's
hours.
"""
import json
import sys

import ba_dashboard
from ba_dashboard import _hour_findings

KEY = "ba:street_secondavenue#7"
TICKET = "ba:skill_customerservice"
PROJ = "ba:skill_projectionist"
CREW = "ba:skill_stagecrew"

# [customers, ticket booths manned, projection booths manned]; the five costume
# booths are manned every hour listed.
MONDAY = {
    10: (50, 1, 2),
    12: (25, 2, 1),
    14: (5, 1, 1),
    15: (5, 1, 1),
    16: (5, 1, 1),
}


def week(value):
    return [[value] * 24 for _ in range(7)]


def role(skill, label, station, noun, rate, stations):
    return {
        "skill": skill,
        "label": label,
        "station": station,
        "noun": noun,
        "one": station.lower(),
        "many": station.lower() + "s",
        "counters": rate * stations,
        "stationCount": stations,
        "staffed": week(0),
        "onShift": week(0),
        "posts": week(0),
    }


def grid():
    # Customer Service keeps the words the board has always used, so its
    # `noun` is None and only its station names it on a cell.
    ticket = role(TICKET, "Customer Service", "Ticket Booth", None, 50, 2)
    proj = role(PROJ, "Projectionist", "Projection Booth", "projection booths", 25, 2)
    crew = role(CREW, "Stage Crew", "Costume Booth", "costume booths", 100, 5)
    customers = week(None)
    staffed, on_shift = week(0), week(0)
    for hour, (seen, tp, pp) in MONDAY.items():
        customers[1][hour] = float(seen)
        for post, manned, rate in ((ticket, tp, 50), (proj, pp, 25), (crew, 5, 100)):
            post["posts"][1][hour] = manned
            post["staffed"][1][hour] = manned * rate
            post["onShift"][1][hour] = manned
        staffed[1][hour] = min(
            r["staffed"][1][hour] for r in (ticket, proj, crew)
        )
        on_shift[1][hour] = min(r["onShift"][1][hour] for r in (ticket, proj, crew))
    return {
        "key": KEY,
        "name": "Playhouse",
        "office": False,
        "reported": True,
        "postRate": None,
        "customers": customers,
        "weeks": [0, 2, 0, 0, 0, 0, 0],
        "thin": [True, False, True, True, True, True, True],
        "staffed": staffed,
        "onShift": on_shift,
        "effective": [row[:] for row in staffed],  # no door cap at this site
        "door": 0,
        "cap": 0,
        "counters": min(r["counters"] for r in (ticket, proj, crew)),
        "stationCount": 9,
        "basket": 20.0,
        "peak": 50,
        "roles": [ticket, proj, crew],
        "stations": [],
        "open": [[[0, 24]] for _ in range(7)],
    }


def rows():
    g = grid()
    g["capHours"] = len(ba_dashboard._capped_cells(g))
    business = {
        "key": KEY,
        "name": "Playhouse",
        "status": "retail",
        "typeSlug": "ba:businesstype_theatre",
    }
    wages = {KEY: {TICKET: 18.0, PROJ: 22.0, CREW: 15.0}}
    findings = _hour_findings([g], [business], wages)
    return {"grid": g, "findings": findings}


if __name__ == "__main__":
    sys.stdout.write(json.dumps(rows()))
