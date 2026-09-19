"""The need curve, its four bases, and the arrival ceiling that only ever bounds it.

Synthetic grids throughout: the shapes _hourly() produces, hand-built so each
case can be asked for on its own. The ceiling is checked as a bound and never as
a demand, which is the one thing this feature must not get wrong.
"""
import json
import os
import unittest

import ba_dashboard
from ba_dashboard import (
    _arrival_ceiling,
    _fill_stations,
    _need_curve,
    load_demand_curves,
)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERVICE = "ba:skill_customerservice"
TRAINER = "ba:skill_gymtrainer"
SHOP = "ba:businesstype_clothingstore"


def role(skill, rates, staffed=None):
    """One of a grid's roles, as _hourly() builds it."""
    return {
        "skill": skill,
        "label": skill,
        "station": "Cash register",
        "counters": sum(rates),
        "stationCount": len(rates),
        "staffed": staffed or [[0] * 24 for _ in range(7)],
        "onShift": [[0] * 24 for _ in range(7)],
        "noun": None,
    }


def grid(roles, customers=None, weeks=None, door=0, thin=None):
    """A site's hour grid with only the keys the need curve reads."""
    customers = customers or [[None] * 24 for _ in range(7)]
    weeks = weeks if weeks is not None else [2] * 7
    staffed = [
        [min(r["staffed"][wd][h] for r in roles) for h in range(24)] for wd in range(7)
    ]
    return {
        "customers": customers,
        "weeks": weeks,
        "thin": thin if thin is not None else [w < 2 for w in weeks],
        "door": door,
        "roles": roles,
        "staffed": staffed,
        "effective": [
            [min(staffed[wd][h], door) if door else staffed[wd][h] for h in range(24)]
            for wd in range(7)
        ],
    }


class NeedCurveTest(unittest.TestCase):
    """measured, censored, scaled and none, one case at a time."""

    def test_measured_hour_is_the_customers_that_came(self):
        customers = [[None] * 24 for _ in range(7)]
        customers[1][12] = 37.0
        # Plenty of capacity on, so the hour is nowhere near its ceiling.
        staffed = [[0] * 24 for _ in range(7)]
        staffed[1][12] = 200
        out = _need_curve(grid([role(SERVICE, [20, 20, 20], staffed)], customers))
        self.assertEqual(out[SERVICE]["basis"][1][12], "measured")
        self.assertEqual(out[SERVICE]["demand"][1][12], 37.0)
        # 37 customers an hour fills two of the three twenty-an-hour registers.
        self.assertEqual(out[SERVICE]["need"][1][12], 2)

    def test_an_hour_with_no_report_on_a_measured_day_has_no_basis(self):
        customers = [[None] * 24 for _ in range(7)]
        customers[1][12] = 10.0
        out = _need_curve(grid([role(SERVICE, [20])], customers))
        self.assertEqual(out[SERVICE]["basis"][1][3], "none")
        self.assertEqual(out[SERVICE]["need"][1][3], 0)

    def test_a_capped_hour_is_censored_and_asks_for_one_more_station(self):
        customers = [[None] * 24 for _ in range(7)]
        customers[1][12] = 40.0  # exactly what two manned registers could serve
        staffed = [[0] * 24 for _ in range(7)]
        staffed[1][12] = 40
        out = _need_curve(grid([role(SERVICE, [20, 20, 20], staffed)], customers))
        self.assertEqual(out[SERVICE]["basis"][1][12], "censored")
        self.assertEqual(out[SERVICE]["demand"][1][12], 60.0)
        self.assertEqual(out[SERVICE]["need"][1][12], 3)

    def test_the_censored_estimate_never_passes_the_stations_installed(self):
        customers = [[None] * 24 for _ in range(7)]
        customers[1][12] = 40.0
        staffed = [[0] * 24 for _ in range(7)]
        staffed[1][12] = 40
        # Both registers already manned: there is no third one to add.
        out = _need_curve(grid([role(SERVICE, [20, 20], staffed)], customers))
        self.assertEqual(out[SERVICE]["basis"][1][12], "censored")
        self.assertEqual(out[SERVICE]["demand"][1][12], 40.0)
        self.assertEqual(out[SERVICE]["need"][1][12], 2)

    def test_the_door_cap_bounds_a_censored_hour(self):
        customers = [[None] * 24 for _ in range(7)]
        customers[1][12] = 40.0
        staffed = [[0] * 24 for _ in range(7)]
        staffed[1][12] = 40
        out = _need_curve(
            grid([role(SERVICE, [20, 20, 20], staffed)], customers, door=45)
        )
        self.assertEqual(out[SERVICE]["demand"][1][12], 45.0)

    def test_the_arrival_ceiling_bounds_a_censored_hour(self):
        customers = [[None] * 24 for _ in range(7)]
        customers[1][12] = 40.0
        staffed = [[0] * 24 for _ in range(7)]
        staffed[1][12] = 40
        ceiling = [[9999] * 24 for _ in range(7)]
        ceiling[1][12] = 44
        out = _need_curve(
            grid([role(SERVICE, [20, 20, 20], staffed)], customers), ceiling=ceiling
        )
        self.assertEqual(out[SERVICE]["basis"][1][12], "censored")
        self.assertEqual(out[SERVICE]["demand"][1][12], 44.0)

    def test_a_ceiling_below_what_was_measured_never_lowers_the_demand(self):
        """The ceiling is an upper bound on arrivals, not a correction downwards."""
        customers = [[None] * 24 for _ in range(7)]
        customers[1][12] = 40.0
        staffed = [[0] * 24 for _ in range(7)]
        staffed[1][12] = 40
        ceiling = [[1] * 24 for _ in range(7)]
        out = _need_curve(
            grid([role(SERVICE, [20, 20, 20], staffed)], customers), ceiling=ceiling
        )
        self.assertEqual(out[SERVICE]["demand"][1][12], 40.0)

    def test_a_thin_weekday_is_scaled_from_a_measured_one(self):
        customers = [[None] * 24 for _ in range(7)]
        customers[1][12] = 40.0  # Monday, measured
        customers[2][12] = 3.0  # Tuesday, one week only
        staffed = [[0] * 24 for _ in range(7)]
        staffed[1][12] = 200
        weeks = [0, 2, 1, 0, 0, 0, 0]
        day = [1.0, 1.0, 0.5, 1.0, 1.0, 1.0, 1.0]
        out = _need_curve(
            grid([role(SERVICE, [20, 20, 20], staffed)], customers, weeks=weeks),
            day=day,
        )
        self.assertEqual(out[SERVICE]["basis"][2][12], "scaled")
        self.assertEqual(out[SERVICE]["demand"][2][12], 20.0)
        self.assertEqual(out[SERVICE]["need"][2][12], 1)

    def test_without_a_day_curve_a_thin_weekday_gets_nothing(self):
        customers = [[None] * 24 for _ in range(7)]
        customers[1][12] = 40.0
        weeks = [0, 2, 1, 0, 0, 0, 0]
        out = _need_curve(
            grid([role(SERVICE, [20, 20])], customers, weeks=weeks)
        )
        self.assertEqual(out[SERVICE]["basis"][2][12], "none")
        self.assertEqual(out[SERVICE]["demand"][2][12], 0.0)

    def test_nothing_measured_anywhere_is_none_everywhere(self):
        weeks = [1] * 7
        out = _need_curve(grid([role(SERVICE, [20])], weeks=weeks), day=[1.0] * 7)
        self.assertEqual(
            {case for row in out[SERVICE]["basis"] for case in row}, {"none"}
        )
        self.assertEqual(out[SERVICE]["need"][3][9], 0)

    def test_the_scaled_weekday_reads_off_the_best_measured_one(self):
        """Most weeks wins, and the earliest weekday breaks a tie, so it never moves."""
        customers = [[None] * 24 for _ in range(7)]
        customers[1][12] = 10.0  # Monday, 2 weeks
        customers[3][12] = 40.0  # Wednesday, 4 weeks: the source
        weeks = [0, 2, 1, 4, 0, 0, 0]
        day = [1.0, 1.0, 1.0, 2.0, 1.0, 1.0, 1.0]
        out = _need_curve(
            grid([role(SERVICE, [20, 20, 20])], customers, weeks=weeks), day=day
        )
        self.assertEqual(out[SERVICE]["demand"][2][12], 20.0)

    def test_a_multi_role_site_answers_per_role(self):
        """A theatre's roles each pack their own stations against the same demand."""
        customers = [[None] * 24 for _ in range(7)]
        customers[1][12] = 60.0
        staffed = [[0] * 24 for _ in range(7)]
        staffed[1][12] = 500
        roles = [
            role(SERVICE, [50, 50], staffed),  # ticket booths
            role(TRAINER, [20, 20, 20, 20], staffed),  # slower stations
        ]
        out = _need_curve(grid(roles, customers))
        self.assertEqual(out[SERVICE]["need"][1][12], 2)
        self.assertEqual(out[TRAINER]["need"][1][12], 3)

    def test_the_same_grid_twice_gives_the_same_answer(self):
        customers = [[None] * 24 for _ in range(7)]
        customers[1][12] = 37.0
        customers[4][9] = 12.0
        weeks = [0, 2, 1, 3, 2, 0, 1]
        day = [1.0, 1.0, 0.5, 1.2, 1.0, 0.9, 0.8]
        made = [
            json.dumps(
                _need_curve(
                    grid([role(SERVICE, [20, 30])], customers, weeks=weeks, door=40),
                    day=day,
                ),
                sort_keys=True,
            )
            for _ in range(2)
        ]
        self.assertEqual(made[0], made[1])


class FillStationsTest(unittest.TestCase):
    """The smallest set of a role's stations that covers the demand, largest first."""

    def test_zero_demand_needs_nobody(self):
        self.assertEqual(_fill_stations(0, [20, 20]), 0)

    def test_largest_first(self):
        # The 30 goes first, so one station covers 30 and two cover 35.
        self.assertEqual(_fill_stations(30, [20, 30, 5]), 1)
        self.assertEqual(_fill_stations(35, [20, 30, 5]), 2)
        self.assertEqual(_fill_stations(35, [20, 20, 20]), 2)

    def test_never_more_stations_than_are_installed(self):
        self.assertEqual(_fill_stations(500, [20, 20]), 2)

    def test_a_site_with_no_station_of_that_role_asks_for_nobody(self):
        self.assertEqual(_fill_stations(40, []), 0)


class ArrivalCeilingTest(unittest.TestCase):
    """GetCustomersByHour, which the board may bound with and never print."""

    def setUp(self):
        self.curves = {
            "types": {
                SHOP: {
                    "d": [1.0] * 7,
                    "h": [0.0] * 12 + [1.0] + [0.0] * 11,
                    "p": ["ba:itemname_shirt"],
                }
            },
            "items": {"ba:itemname_shirt": 0.5, "ba:itemname_towel": 9.0},
        }
        self.saved = ba_dashboard._demand_curves
        ba_dashboard._demand_curves = self.curves

    def tearDown(self):
        ba_dashboard._demand_curves = self.saved

    def ceiling(self, **kw):
        args = dict(
            type_slug=SHOP,
            sqm=100,
            products=["ba:itemname_shirt", "ba:itemname_towel"],
            promotion=0,
            base_promotion=0.55,
            door=0,
        )
        args.update(kw)
        return _arrival_ceiling(**args)

    def test_only_the_types_own_primary_products_size_it(self):
        # 0.5 x 100 sqm x 0.55, rounded up. The towel's 9.0 is not primary here.
        self.assertEqual(self.ceiling()[1][12], 28)

    def test_promotion_lifts_it(self):
        # base 0.55 + 0.75 x 100/100 = 1.3, times 50.
        self.assertEqual(self.ceiling(promotion=100)[1][12], 65)

    def test_the_door_cap_is_the_games_own_minimum(self):
        self.assertEqual(self.ceiling(door=10)[1][12], 10)

    def test_a_closed_hour_of_the_curve_is_zero(self):
        self.assertEqual(self.ceiling()[1][3], 0)

    def test_an_unknown_business_type_has_no_ceiling(self):
        self.assertIsNone(self.ceiling(type_slug="ba:businesstype_nowhere"))

    def test_a_shop_stocking_nothing_primary_has_no_arrivals(self):
        self.assertEqual(self.ceiling(products=["ba:itemname_towel"])[1][12], 0)


class DemandCurvesFileTest(unittest.TestCase):
    """The committed ba_demand_curves.json is present and the shape the board reads."""

    def setUp(self):
        ba_dashboard._demand_curves = None
        self.addCleanup(setattr, ba_dashboard, "_demand_curves", None)
        self.curves = load_demand_curves()

    def test_it_ships(self):
        self.assertTrue(
            os.path.exists(os.path.join(ROOT, "ba_demand_curves.json")),
            "ba_demand_curves.json is missing; run make_demand_curves.py",
        )
        self.assertTrue(self.curves["types"])
        self.assertTrue(self.curves["items"])

    def test_every_type_carries_seven_days_and_twenty_four_hours(self):
        for slug, curve in self.curves["types"].items():
            self.assertTrue(slug.startswith("ba:businesstype_"), slug)
            self.assertEqual(len(curve["d"]), 7, slug)
            self.assertEqual(len(curve["h"]), 24, slug)
            for value in curve["d"] + curve["h"]:
                self.assertIsInstance(value, (int, float), slug)
                self.assertGreaterEqual(value, 0, slug)
            for name in curve["p"]:
                self.assertTrue(name.startswith("ba:itemname_"), name)

    def test_every_ratio_is_a_positive_number_under_an_item_name(self):
        for name, ratio in self.curves["items"].items():
            self.assertTrue(name.startswith("ba:itemname_"), name)
            self.assertIsInstance(ratio, (int, float), name)
            self.assertGreater(ratio, 0, name)

    def test_the_retail_types_the_board_knows_all_have_a_curve(self):
        missing = [
            slug for slug in ba_dashboard.RETAIL_TYPES if slug not in self.curves["types"]
        ]
        self.assertEqual(missing, [])

    def test_the_copy_the_browser_fetches_matches(self):
        with open(os.path.join(ROOT, "ba_demand_curves.json"), encoding="utf-8") as fh:
            source = json.load(fh)
        with open(
            os.path.join(ROOT, "web", "py", "ba_demand_curves.json"), encoding="utf-8"
        ) as fh:
            shipped = json.load(fh)
        self.assertEqual(source, shipped)


if __name__ == "__main__":
    unittest.main()
