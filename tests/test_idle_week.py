"""Overstaffed hours: one site is one line, and the line is the whole week.

The hour grid used to hand Today one idle run per site, the worst weekday, so a
gym overstaffed every evening read as one Monday's worth of wages. Every run is
now kept under the finding's `week`, and _alerts() prices and names them all in
one line, while the run the site page reads out stays the worst one.
"""
import unittest

from ba_dashboard import _alerts, _hour_findings, _service_stations, money
from tests.test_stations import (
    BOARD, EMPTY_SUPPLY, NAMES, STREET, TRAINER, grid_of, shift,
)

MONDAY, TUESDAY, WEDNESDAY = 1, 2, 3


def gym(days, boards=2, on=3, customers=10, start=8, end=20):
    """`on` trainers over `boards` boards, `start`-`end` on each weekday in `days`,
    with each of those weekdays reported twice."""
    items = [(i + 1, BOARD) for i in range(boards)]
    crew = {str(i + 1): TRAINER for i in range(on)}
    shifts = [shift(str(i + 1), (i % boards) + 1, start, end) for i in range(on)]
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
            {"day": wd % 7, "workShifts": {"$items": shifts}} for wd in days
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
        # The site page's run is unchanged: one weekday, first past the post.
        # Three trainers where one would do leave two spare for twelve hours.
        self.assertEqual((idle["day"], idle["from"], idle["to"], idle["spare"]),
                         ("Monday", 8, 20, 24))
        self.assertEqual(idle["worth"], money(24 * 105.0 / 7))
        week = idle["week"]
        self.assertEqual(week["spare"], 72)
        self.assertEqual(week["worth"], money(72 * 105.0 / 7))
        self.assertEqual(week["parts"], [
            {"noun": "fitness planning boards", "staff": 3, "when": "Mon-Wed 8-20"}])

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

    def test_a_role_with_no_wage_prices_nothing(self):
        grid = gym([MONDAY, TUESDAY])
        self.assertEqual(_hour_findings([grid], [business()], {}), [])


if __name__ == "__main__":
    unittest.main()
