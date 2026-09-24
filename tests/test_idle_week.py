"""Overstaffed hours: one site is one line, and the line is the whole week.

The hour grid used to hand Today one idle run per site, the worst weekday, so a
gym overstaffed every evening read as one Monday's worth of wages. Every run is
now kept under the finding's `week`, and _alerts() prices and names them all in
one line. The site page's hours block reads the same `week`, and lights its
`cells`; tests/site_panel.test.cjs checks the page against this Python.
"""
import unittest

from ba_dashboard import _alerts, _hour_findings, _idle_parts, _idle_week, _service_stations, money
from tests.test_stations import (
    BOARD, EMPTY_SUPPLY, NAMES, REGISTER, SERVICE, STREET, TRAINER, grid_of, shift,
)

MONDAY, TUESDAY, WEDNESDAY = 1, 2, 3


def gym(days, boards=2, on=3, customers=10, start=8, end=20, cashiers=0, spans=None):
    """`on` trainers over `boards` boards, `start`-`end` on each weekday in `days`,
    with each of those weekdays reported twice. `on` may be a {weekday: trainers}
    map for a roster that differs by day. `cashiers` adds that many people on as
    many cash registers, a second role on the same hours. `spans` gives each
    trainer their own (start, end) instead, every day."""
    per_day = on if isinstance(on, dict) else {wd: on for wd in days}
    if spans:
        per_day = {wd: len(spans) for wd in days}
    most = max(per_day.values())
    items = [(i + 1, BOARD) for i in range(boards)]
    items += [(boards + i + 1, REGISTER) for i in range(cashiers)]
    crew = {str(i + 1): TRAINER for i in range(most)}
    crew.update({f"c{i + 1}": SERVICE for i in range(cashiers)})
    cash = [shift(f"c{i + 1}", boards + i + 1, start, end) for i in range(cashiers)]

    def shifts(wd):
        return [shift(str(i + 1), (i % boards) + 1, *(spans[i] if spans else (start, end)))
                for i in range(per_day[wd])] + cash
    hourly = {h: customers if start <= h < end else 0 for h in range(24)}
    reports = {"$items": [{"hour": h, "customers": c} for h, c in hourly.items()]}
    b = {
        "BusinessName": "Pump",
        "businessTypeName": "ba:businesstype_gym",
        "StreetName": STREET,
        "StreetNumber": 3,
        "creationDay": 1,
        "customerCapacity": 100,
        # Day 1 is a Monday: day d and d + 7 give its weekday two weeks.
        "orderHistory": {"$items": [
            {"dayNumber": wd + week, "totalCustomers": sum(hourly.values()), "hourReports": reports}
            for wd in days for week in (0, 7)
        ]},
        "itemInstances": {"$items": [{"$v": {"id": i, "itemName": slug}} for i, slug in items]},
        "cachedFulfilledCustomerDemands": {"$items": []},
        "retailPrices": {"$items": []},
        "scheduleDays": {"$items": [
            {"day": wd % 7, "workShifts": {"$items": shifts(wd)}} for wd in days
        ]},
    }
    return grid_of(b, crew, _service_stations(NAMES))


def business():
    return {"key": f"{STREET}#3", "name": "Pump", "status": "retail", "revenue": 1000,
            "profit": 100, "costCentre": False, "staff": 3, "opened": 1,
            "satisfaction": {"overall": 90}, "customers": 10, "missingAmenities": [],
            "lines": [], "rent": 10, "promotion": 100, "marketingIndex": 100}


WAGES = {f"{STREET}#3": {TRAINER: 105.0}}


class IdleWeekTests(unittest.TestCase):
    def test_every_idle_weekday_is_kept_and_the_worst_still_leads(self):
        grid = gym([MONDAY, TUESDAY, WEDNESDAY])
        [idle] = _hour_findings([grid], [business()], WAGES)
        # The worst run is still one weekday, first past the post.
        # Three trainers where one would do leave two spare for twelve hours.
        self.assertEqual((idle["day"], idle["from"], idle["to"], idle["spare"]),
                         ("Monday", 8, 20, 24))
        self.assertEqual(idle["worth"], money(24 * 105.0 / 7))
        week = idle["week"]
        self.assertEqual(week["spare"], 72)
        self.assertEqual(week["worth"], money(72 * 105.0 / 7))
        self.assertEqual(week["parts"], [
            {"noun": "fitness planning boards", "staff": 3, "spare": 72, "when": "Mon-Wed 8-20"}])
        # The hours the line names, each once, for the site page to light.
        self.assertEqual(week["cells"], [
            [wd, h] for wd in (MONDAY, TUESDAY, WEDNESDAY) for h in range(8, 20)])

    def test_one_site_is_one_line_with_the_week_summed(self):
        grid = gym([MONDAY, TUESDAY, WEDNESDAY])
        findings = _hour_findings([grid], [business()], WAGES)
        result = _alerts([business()], EMPTY_SUPPLY, [], [], [], findings, [], 20, 0.0)
        rows = [a for a in result["lines"] + result["minor"]["rows"] if a["group"] == "idlestaff"]
        self.assertEqual(len(rows), 1)
        [row] = rows
        self.assertEqual(row["worth"], money(72 * 105.0 / 7))
        self.assertEqual(
            row["text"],
            "Pump runs 72 staff-hours a week that buy nothing: "
            "3 fitness planning boards Mon-Wed 8-20 for 10 customers an hour")

    def test_the_id_does_not_move_with_the_days(self):
        """A silenced line stays silenced when another weekday joins it."""
        def row(days):
            findings = _hour_findings([gym(days)], [business()], WAGES)
            result = _alerts([business()], EMPTY_SUPPLY, [], [], [], findings, [], 20, 0.0)
            [r] = [a for a in result["lines"] + result["minor"]["rows"] if a["group"] == "idlestaff"]
            return r
        self.assertEqual(row([MONDAY])["id"], row([MONDAY, TUESDAY])["id"])

    def test_a_day_with_fewer_people_is_not_said_to_run_more(self):
        """Two on Monday and four on Tuesday are two parts, not "4 ... Mon, Tue"."""
        grid = gym([MONDAY, TUESDAY], boards=4, on={MONDAY: 2, TUESDAY: 4})
        [idle] = _hour_findings([grid], [business()], WAGES)
        week = idle["week"]
        self.assertEqual(week["parts"], [
            {"noun": "fitness planning boards", "staff": 2, "spare": 12, "when": "Mon 8-20"},
            {"noun": "fitness planning boards", "staff": 4, "spare": 36, "when": "Tue 8-20"}])
        # One spare on Monday, three on Tuesday, twelve hours each.
        self.assertEqual(week["spare"], 12 + 36)
        result = _alerts([business()], EMPTY_SUPPLY, [], [], [], [idle], [], 20, 0.0)
        [row] = [a for a in result["lines"] + result["minor"]["rows"] if a["group"] == "idlestaff"]
        # The parts are kept apart by a semicolon, since an hour phrase can
        # itself end "and 5 scattered hours".
        self.assertEqual(
            row["text"],
            "Pump runs 48 staff-hours a week that buy nothing: "
            "2 fitness planning boards Mon 8-20; 4 fitness planning boards Tue 8-20 "
            "for 10 customers an hour")

    def test_an_unpriced_role_does_not_hide_a_priced_one(self):
        """The biggest run belongs to a role with no wage; the priced one still shows."""
        grid = gym([MONDAY], boards=2, on=2, cashiers=4)
        roles = {r["skill"]: r for r in grid["roles"]}
        self.assertEqual(sorted(roles), sorted([TRAINER, SERVICE]))
        [idle] = _hour_findings([grid], [business()], WAGES)
        # Only the trainers carry a wage: their run leads and prices the line.
        self.assertEqual(idle["noun"], "fitness planning boards")
        self.assertEqual((idle["day"], idle["spare"], idle["staff"]), ("Monday", 12, 2))
        self.assertEqual(idle["worth"], money(12 * 105.0 / 7))
        self.assertEqual([p["noun"] for p in idle["week"]["parts"]], ["fitness planning boards"])

    def test_a_headcount_that_changes_mid_run_is_told_hour_by_hour(self):
        """Two trainers from 8 and four from 12 are two parts, not "4 ... 8-20"."""
        grid = gym([MONDAY], boards=4, spans=[(8, 20), (8, 20), (12, 20), (12, 20)])
        [idle] = _hour_findings([grid], [business()], WAGES)
        week = idle["week"]
        self.assertEqual(
            [(p["staff"], p["when"], p["spare"]) for p in week["parts"]],
            [(2, "Mon 8-12", 4), (4, "Mon 12-20", 24)])
        # One spare an hour for four hours, three for eight: the run's total.
        self.assertEqual(week["spare"], 4 + 24)
        self.assertEqual(week["cells"], [[MONDAY, h] for h in range(8, 20)])
        # The lead is a piece of one headcount too.
        self.assertEqual((idle["from"], idle["to"], idle["staff"]), (12, 20, 4))

    def test_a_piece_shorter_than_a_run_still_counts_when_the_run_qualifies(self):
        """Two trainers 8-10 then four 10-20: the unbroken run qualifies whole."""
        grid = gym([MONDAY], boards=4, spans=[(8, 20), (8, 20), (10, 20), (10, 20)])
        [idle] = _hour_findings([grid], [business()], WAGES)
        self.assertEqual(
            [(p["staff"], p["when"]) for p in idle["week"]["parts"]],
            [(2, "Mon 8-10"), (4, "Mon 10-20")])
        self.assertEqual(idle["week"]["spare"], 2 + 30)

    def test_a_part_with_two_day_shapes_keeps_them_inside_the_part(self):
        """"Mon-Wed 8-20 and Sat 10-14" is one part; "; " only ever divides parts."""
        def run(wd, hours, staff, spare):
            return {"noun": "counters", "wd": wd, "hours": list(hours), "staff": staff,
                    "seen": [1] * len(hours), "spare": spare, "worth": spare * 10}
        week = _idle_week([run(1, range(8, 20), 2, 12), run(2, range(8, 20), 2, 12),
                           run(3, range(8, 20), 2, 12), run(6, range(10, 14), 2, 4),
                           run(4, range(8, 20), 4, 36)])
        self.assertEqual([(p["staff"], p["when"]) for p in week["parts"]],
                         [(2, "Mon-Wed 8-20 and Sat 10-14"), (4, "Thu 8-20")])
        self.assertEqual(_idle_parts(week["parts"], "counters"),
                         "2 counters Mon-Wed 8-20 and Sat 10-14; 4 counters Thu 8-20")

    def test_the_line_names_the_two_biggest_parts_and_counts_the_rest(self):
        parts = [{"noun": "counters", "staff": 2, "when": "Mon 8-20", "spare": 12},
                 {"noun": None, "staff": 3, "when": "Tue 8-20", "spare": 24},
                 {"noun": "counters", "staff": 4, "when": "Wed 8-20", "spare": 36},
                 {"noun": "counters", "staff": 5, "when": "Thu 8-9", "spare": 4}]
        # The biggest two, in the week's own order, then how many more.
        self.assertEqual(_idle_parts(parts, "desks"),
                         "3 desks Tue 8-20; 4 counters Wed 8-20; and 2 more")
        self.assertEqual(_idle_parts(parts[:2], "desks"), "2 counters Mon 8-20; 3 desks Tue 8-20")

    def test_a_role_with_no_wage_prices_nothing(self):
        grid = gym([MONDAY, TUESDAY])
        self.assertEqual(_hour_findings([grid], [business()], {}), [])


if __name__ == "__main__":
    unittest.main()
