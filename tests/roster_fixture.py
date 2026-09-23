"""The `staffing` rows tests/roster.test.cjs draws, straight out of the planner.

The roster block is easy to test against a shape the Python cannot produce —
a `current.shifts` that does not match `current.list`, a `hireHours` that is
not `hire * 30`, a hand-written `p: null` — and a block that passes on those is
not known to work on anything. So nothing here is hand-written: each row comes
out of `_staffing()` on a synthetic save, built with the same helpers
tests/test_staffing.py uses, and the JS suite runs this module once and reads
the JSON off stdout.

Synthetic saves only. `python -m tests.roster_fixture` prints them.

Eleven sites, each a state the block has to draw:

full     a measured shop: two counters, a cleaning station and a security
         locker, and a schedule already in the game as two-hour scraps. One
         guard cannot cover the locker's whole week, so half of it is lines
         nobody can be given; the bench member holds two skills; and there are
         more full-timers than two counters can find thirty hours each for, so
         several are left short.
cover    a shop that has never reported an hour: no serving shifts can be cut
         from nothing, but its cleaning station is covered every open hour, so
         it has a week worth typing and a strip with nothing on it.
fresh    the same, five days open, with a schedule already in the game: half
         of it serving shifts the plan cannot replace and half of it cleaning
         scraps it can, which is what a shop five days old really looks like.
         Everybody here is full time, so the planner writes both kinds of short
         week: the cashiers it could never have used, and the second cleaner it
         could and had no hours left for. Its cover roles
         each want 56 hours a week, so each needs two people and has a full
         week for only one of them.
pinned   every person on the counters holds a scheduling demand, so every
         shift they are given is one the plan placed because of it: the pin.
quiet    a shop measured in every hour and asked for by nobody: two weeks of
         reports, every one of them zero customers, so its basis is `measured`
         throughout and its plan is still cover alone. Its cashier is full time
         and there is nothing here for them, which is not the same as waiting
         to be measured. The block has to be as
         careful here as with a shop that has never been measured, and only the
         plan says so.
halfmop  the same shop with its cashier on the till as well as the mop: serving
         shifts the plan does not replace, over cover it cannot type yet, which
         is the state where the block must not tell anybody to clear anything.
nobody   a shop nobody can clean: a cleaning station, sixteen open hours a day,
         a crew of one cashier, and that cashier already mopping in the game.
         Every line of its plan waits on a hire, so clearing what is there
         would leave the shop with neither. Its cover is three hires.
shut     the two-slot weekday: open 08-12 and 14-20 on Friday, shut on Sunday,
         so the hour in the middle is the doors closed rather than trade
         dipping and nothing may be rostered into it.
weekend  a cleaning station open Saturday and Sunday around the clock and a
         crew of one cashier: 48 hours, one full week, but two entries a day
         nobody may work both of, so two hires. The one place the headcount
         band and the hiring line disagree on purpose.
newshop  a shop five days old, open 8 to 20, with two registers, a cleaning
         station, three cashiers, one cleaner and a second cleaner still
         unassigned: its demand plan is cover only, and its full-cover plan
         staffs both registers around the clock and draws on the unassigned
         cleaner.
handover a shop four weeks old whose schedule in the game has staffed both
         registers every hour of every day for the last two of them, as the
         board saw at two builds: the demand test is done.
"""
import json
import sys

from ba_dashboard import History

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


def fresh_row():
    """Never measured, and already staffed: the shop the board can half plan.

    A week of two-hour scraps is in the game, half of them on a register and
    half on the cleaning station. The plan replaces the cleaning and security
    half and cannot touch the other, which is the case every number on the
    block has to be careful about. Open eight hours a day, so each cover role
    wants 56 hours: two people by the 50-hour ceiling, a full week for one.
    """
    # Full-time contracts all round, so the planner writes the short weeks the
     # block has to explain: the cashiers get nothing at all, because no role
     # here can be planned for them, and the second cleaner gets what is left
     # of a 56-hour week after the first one's fifty.
    people = [
        employee(f"s{i}", [SERVICE], demands=("ba:jobdemand_fulltime",))
        for i in range(3)
    ]
    people += [
        employee("clean1", [CLEANING], demands=("ba:jobdemand_fulltime",)),
        employee("clean2", [CLEANING], demands=("ba:jobdemand_fulltime",)),
        employee("guard1", [GUARD], demands=("ba:jobdemand_fulltime",)),
    ]
    items = [(1, REGISTER), (2, REGISTER), (8, CLEAN_STATION), (9, LOCKER)]
    scraps = [
        {
            "wd": wd,
            "employeeId": "s0" if post == 1 else "clean1",
            "itemInstanceId": post,
            "startingHour": h,
            "endingHour": h + 2,
            "type": 1 if post == 1 else 0,
        }
        for wd in range(7)
        for post in (1, 8)
        for h in range(8, 16, 2)
    ]
    return plan(items, people, BUSY, weeks=0, opens=((8, 16),), shifts=scraps,
                days_open=5)


def halfmop_row():
    """`nobody`, with the cashier also working the till.

    So the schedule holds serving shifts the plan keeps and cover it cannot
    replace yet: both of the block's warnings are true at once, and the one
    about hiring has to win.
    """
    scraps = [
        {"wd": wd, "employeeId": "p0", "itemInstanceId": post,
         "startingHour": h, "endingHour": h + 2,
         "type": 1 if post == 1 else 0}
        for wd in range(7)
        for post, hours in ((1, range(8, 16, 2)), (8, range(8, 24, 2)))
        for h in hours
    ]
    return plan(
        [(1, REGISTER), (8, CLEAN_STATION)],
        [employee("p0", [SERVICE])],
        BUSY,
        weeks=0,
        opens=((8, 24),),
        shifts=scraps,
    )


def quiet_row():
    """Measured everywhere, and the measurement asks for nobody.

    `spRosterMeasured()` is true of this shop and there is not one serving
    shift in its plan, which is why the block reads what the plan covers rather
    than whether the shop was measured.
    """
    scraps = [
        {"wd": wd, "employeeId": who, "itemInstanceId": post,
         "startingHour": h, "endingHour": h + 2,
         "type": 1 if post == 1 else 0}
        for wd in range(7)
        for who, post in (("p0", 1), ("c0", 8))
        for h in range(8, 20, 2)
    ]
    return plan(
        [(1, REGISTER), (8, CLEAN_STATION)],
        [
            # Full time, and nothing here the plan can give them: the shop is
            # measured, so this is not somebody waiting to be measured.
            employee("p0", [SERVICE], demands=("ba:jobdemand_fulltime",)),
            employee("c0", [CLEANING]),
        ],
        {h: 0 for h in range(24)},
        shifts=scraps,
    )


def uncovered_row():
    """A cleaning station with nobody who may work it, on a 16-hour day.

    112 station-hours in fourteen eight-hour entries, two a day: three people.
    """
    # The cashier is mopping, which the game allows and the plan will not do.
    # So there is cover in the game, and not one line of the plan that anybody
    # can be put on: clearing it would leave the shop with neither.
    scraps = [
        {"wd": wd, "employeeId": "p0", "itemInstanceId": 8,
         "startingHour": h, "endingHour": h + 2, "type": 0}
        for wd in range(7)
        for h in range(8, 24, 2)
    ]
    return plan(
        [(1, REGISTER), (8, CLEAN_STATION)],
        [employee("p0", [SERVICE])],
        BUSY,
        weeks=0,
        opens=((8, 24),),
        shifts=scraps,
    )


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


def weekend_row():
    """Open two days a week around the clock: more hires than full weeks."""
    return plan(
        [(1, REGISTER), (8, CLEAN_STATION)],
        [employee("p0", [SERVICE])],
        BUSY,
        weeks=0,
        open_days=(6, 0),
    )


def newshop_row():
    """A new shop: the demand plan is cover only, the full-cover plan is the test."""
    people = [
        employee(f"s{i}", [SERVICE], demands=("ba:jobdemand_fulltime",))
        for i in range(3)
    ]
    people += [employee("clean1", [CLEANING]), employee("bench", [CLEANING], here=False)]
    items = [(1, REGISTER), (2, REGISTER), (8, CLEAN_STATION)]
    return plan(items, people, BUSY, weeks=0, opens=((8, 20),), days_open=5)


def handover_row():
    """Two measured weeks, and the game already runs every register every hour."""
    people = [employee(f"s{i}", [SERVICE]) for i in range(8)]
    people += [employee(f"c{i}", [CLEANING]) for i in range(4)]
    items = [(1, REGISTER), (2, REGISTER), (8, CLEAN_STATION)]
    week = [
        {"wd": wd, "employeeId": f"s{(2 * k + n + wd) % 8}", "itemInstanceId": post,
         "startingHour": start, "endingHour": start + 12, "type": 1}
        for wd in range(7)
        for k, post in enumerate((1, 2))
        for n, start in enumerate((0, 12))
    ]
    # Four weeks of reports; the board saw the test in the game on day 14 and
    # again on day 28, so it has held two weeks and those weeks are measured.
    history = History(None)
    plan(items, people, BUSY, shifts=week, weeks=4, history=history, day=14)
    return plan(items, people, BUSY, shifts=week, weeks=4, history=history, day=28)


def rows():
    return {
        "full": full_row(),
        "pinned": pinned_row(),
        "cover": cover_row(),
        "fresh": fresh_row(),
        "nobody": uncovered_row(),
        "quiet": quiet_row(),
        "halfmop": halfmop_row(),
        "shut": shut_row(),
        "weekend": weekend_row(),
        "newshop": newshop_row(),
        "handover": handover_row(),
    }


if __name__ == "__main__":
    sys.stdout.write(json.dumps(rows()))
