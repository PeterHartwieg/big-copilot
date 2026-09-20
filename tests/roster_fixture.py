"""The `staffing` rows tests/roster.test.cjs draws, straight out of the planner.

The roster block is easy to test against a shape the Python cannot produce —
a `current.shifts` that does not match `current.list`, a `hireHours` that is
not `hire * 30`, a hand-written `p: null` — and a block that passes on those is
not known to work on anything. So nothing here is hand-written: each row comes
out of `_staffing()` on a synthetic save, built with the same helpers
tests/test_staffing.py uses, and the JS suite runs this module once and reads
the JSON off stdout.

Synthetic saves only. `python -m tests.roster_fixture` prints them.

Four sites, each a state the block has to draw:

full     a measured shop: two counters, a cleaning station and a security
         locker, and a schedule already in the game as two-hour scraps. One
         guard cannot cover the locker's whole week, so half of it is lines
         nobody can be given; the bench member holds two skills; and there are
         more full-timers than two counters can find thirty hours each for, so
         several are left short.
cover    a shop that has never reported an hour: no serving shifts can be cut
         from nothing, but its cleaning station is covered every open hour, so
         it has a week worth typing and a strip with nothing on it.
pinned   every person on the counters holds a scheduling demand, so every
         shift they are given is one the plan placed because of it: the pin.
shut     the two-slot weekday: open 08-12 and 14-20 on Friday, shut on Sunday,
         so the hour in the middle is the doors closed rather than trade
         dipping and nothing may be rostered into it.
"""
import json
import sys

from tests.test_staffing import (
    CLEAN_STATION,
    CLEANING,
    GUARD,
    LOCKER,
    REGISTER,
    SERVICE,
    employee,
    plan,
)

BUSY = {h: 40 if 8 <= h < 20 else 0 for h in range(24)}


def fragments():
    """A schedule already in the game, in two-hour scraps: the "now" side.

    This is what the toggle compares the plan against, and why the block
    exists — the game leaves a busy shop's week as dozens of short pieces.
    """
    return [
        {
            "wd": wd,
            "employeeId": "free1",
            "itemInstanceId": 1,
            "startingHour": h,
            "endingHour": h + 2,
            "type": 1,
        }
        for wd in range(7)
        for h in range(8, 20, 2)
    ]


def full_row():
    """A measured shop whose weekend nobody may work."""
    people = [
        # Two who keep their weekends: with only these on the counters, both
        # weekend days come back uncovered and become hiring lines.
        employee("free1", [SERVICE], demands=("ba:jobdemand_freeweekends",)),
        employee("free2", [SERVICE], demands=("ba:jobdemand_freeweekends",)),
        # Somebody the plan has to work around rather than refuse.
        employee("noaft", [SERVICE], demands=("ba:jobdemand_noafternoons",)),
        # Two skills, and on the bench: `have` counts them under both, so the
        # page has to take them off both. Cleaning and Security, because a
        # customer service employee is never put on a cleaning station and a
        # bench member who could not be used would not be drawn at all.
        employee("bench", [CLEANING, GUARD], here=False),
        employee("clean1", [CLEANING]),
        employee("guard1", [GUARD]),
        # Somebody whose contract asks for four days, and more full-timers
        # than two counters can find thirty hours each for: the plan leaves
        # several of them short and has to say so rather than bend the week.
        employee("part1", [SERVICE], demands=("ba:jobdemand_fourdaysweek",)),
    ] + [
        employee(f"full{i}", [SERVICE], demands=("ba:jobdemand_fulltime",))
        for i in range(1, 10)
    ]
    items = [(1, REGISTER), (2, REGISTER), (8, CLEAN_STATION), (9, LOCKER)]
    return plan(items, people, BUSY, shifts=fragments())


def pinned_row():
    """A shop whose whole service crew has somewhere they will not work.

    Everybody on the counters holds a scheduling demand, so every shift they
    are given is a shift the plan placed *because* of one, which is what the
    pin on a bar means.
    """
    people = [
        employee("free1", [SERVICE], demands=("ba:jobdemand_freeweekends",)),
        employee("free2", [SERVICE], demands=("ba:jobdemand_freeweekends",)),
        employee("noaft", [SERVICE], demands=("ba:jobdemand_noafternoons",)),
        employee("bench", [CLEANING, GUARD], here=False),
        employee("clean1", [CLEANING]),
        employee("guard1", [GUARD]),
        employee("full1", [SERVICE], demands=("ba:jobdemand_fulltime",)),
        employee("part1", [SERVICE], demands=("ba:jobdemand_fourdaysweek",)),
    ]
    items = [(1, REGISTER), (2, REGISTER), (8, CLEAN_STATION), (9, LOCKER)]
    return plan(items, people, BUSY)


def cover_row():
    """Never measured, so cover only: the empty strip with a week behind it."""
    people = [employee("clean1", [CLEANING]), employee("clean2", [CLEANING])]
    items = [(1, REGISTER), (2, REGISTER), (8, CLEAN_STATION)]
    # weeks=0: the site has never filed an hour report, so every basis is
    # "none" and no serving shift can honestly be cut.
    return plan(items, people, BUSY, weeks=0)


def shut_row():
    """Two opening slots on a Friday, and a Sunday the shop never opens."""
    # Cleaners of their own: a customer service employee is never put on a
    # cleaning station, and this is the shop the page draws with nothing to hire.
    people = [employee(f"p{i}", [SERVICE]) for i in range(6)]
    people += [employee(f"c{i}", [CLEANING]) for i in range(3)]
    items = [(1, REGISTER), (8, CLEAN_STATION)]
    # One site per weekday shape is not possible in one registration, so the
    # whole week takes the two-slot day and Sunday is simply shut.
    return plan(
        items,
        people,
        BUSY,
        opens=((8, 12), (14, 20)),
        open_days=(1, 2, 3, 4, 5, 6),
    )


def rows():
    return {
        "full": full_row(),
        "pinned": pinned_row(),
        "cover": cover_row(),
        "shut": shut_row(),
    }


if __name__ == "__main__":
    sys.stdout.write(json.dumps(rows()))
