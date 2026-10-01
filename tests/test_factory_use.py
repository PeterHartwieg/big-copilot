"""A factory line's use against what it makes (issue #145), on synthetic
fixtures only.

Each named line carries what the shops down the plan sell of its product a
day (`soldDay`, no margin), that plus the margin (`needDay`, never capped),
and a `production` status: short by whole machines where the need is past
what the line makes at 24 h. The hours keep their 24 h cap. The ingredient
order is judged apart, on the input's own fact, so a line can be short on
both counts at once.
"""
import math
import unittest

from ba_dashboard import SUPPLY_MARGIN, _line_use
from test_factory_staffing import line_of, rostered_chain
from test_supply_facts import BEER, FACTORY, SHOP_A, WATER, Company


class LineUseTests(unittest.TestCase):
    def test_a_line_whose_shops_sell_past_24_hours_is_short_by_machines(self):
        # One machine makes 720 beer a day; the bar sells 1,000.
        _site, line = line_of(rostered_chain([24], sold_a=1000))
        self.assertEqual(line["makes"], 720)
        self.assertEqual((line["soldDay"], line["needDay"]), (1000, round(1000 * (1 + SUPPLY_MARGIN))))
        # 1,150 a day at 720 a machine: two machines, one more than now.
        self.assertEqual(line["production"], {"status": "short", "level": "critical",
                                              "more": 1, "makesWith": 1440})
        # Staffing and sizing keep their cap: the hours read 24 and covered.
        self.assertEqual(line["needHours"], {"cap": 24, "dem": 24})
        self.assertEqual((line["status"], line["dem"]["status"]), ("covered", "covered"))

    def test_more_machines_follow_the_recipe_rate(self):
        _site, line = line_of(rostered_chain([24], sold_a=2000))
        need = 2000 * (1 + SUPPLY_MARGIN)
        self.assertEqual(line["production"]["more"], math.ceil(need / 720) - 1)
        self.assertEqual(line["production"]["makesWith"], math.ceil(need / 720) * 720)

    def test_only_the_margin_past_capacity_is_a_warning(self):
        # 650 sold fits in 720; with the margin, 748 does not.
        _site, line = line_of(rostered_chain([24], sold_a=650))
        self.assertEqual(line["production"], {"status": "short", "level": "warn", "more": 1, "makesWith": 1440})

    def test_a_line_that_keeps_up_is_covered(self):
        _site, line = line_of(rostered_chain([24], sold_a=200))
        self.assertEqual((line["soldDay"], line["needDay"]), (200, 230))
        self.assertEqual(line["production"], {"status": "covered", "level": "ok"})

    def test_sold_does_not_depend_on_the_hours_on_the_schedule(self):
        # A line staffed 6 h a day: makes is still its 24 h rate, and what the
        # shops sell is still what they sell.
        _site, line = line_of(rostered_chain([6], sold_a=1000))
        self.assertEqual((line["makes"], line["soldDay"]), (720, 1000))
        self.assertEqual(line["production"]["more"], 1)

    def test_no_demand_read_means_no_figures(self):
        self.assertEqual(_line_use(1, 30, 720, None), {"soldDay": None, "needDay": None, "production": None})

    def test_exactly_at_capacity_with_the_margin_is_covered(self):
        sold = 720 / (1 + SUPPLY_MARGIN)
        self.assertEqual(_line_use(1, 30, 720, sold)["production"], {"status": "covered", "level": "ok"})


class TwoStatusesTests(unittest.TestCase):
    def test_an_order_short_and_a_production_short_are_two_statuses(self):
        # The brewery imports its own water, 500 a week against the 1,680 its
        # machine eats, and the bar sells more beer than the machine makes.
        c = Company()
        c.factory(FACTORY, "Brewery")
        c.shop(SHOP_A, "Beer Bar")
        c.hold(FACTORY, WATER, 250)
        c.hold(FACTORY, BEER, 300)
        c.hold(SHOP_A, BEER, 200, 1000)
        c.plan(FACTORY, SHOP_A, BEER, 400)
        c.contract(FACTORY, WATER, 500)
        c.run()
        _site, line = line_of(c)
        self.assertEqual(line["production"]["status"], "short")
        self.assertEqual(line["production"]["more"], 1)
        for mode in ("cap", "dem"):
            with self.subTest(mode=mode):
                order = c.fact(FACTORY, WATER, mode)
                self.assertEqual((order["st"], order["why"]), ("short", "order"))
        # The line's own hours status is neither of them.
        self.assertEqual(line["status"], "covered")


if __name__ == "__main__":
    unittest.main()
