"""A factory line's use against what it makes (issue #145), on synthetic
fixtures only.

Each named line carries what the shops down the plan measurably sell of its
product a day (`soldDay`: no margin, no target, no factory line eating it),
what Demand sizing works from plus the margin (`needDay`, never capped), and
a `production` status: short by whole machines where the need is past
what the line makes at 24 h. The hours keep their 24 h cap. The ingredient
order is judged apart, on the input's own fact, so a line can be short on
both counts at once.
"""
import math
import unittest

from ba_dashboard import RECIPE_ITEMS, SUPPLY_MARGIN, Names, _line_use, _supply, site_key
from test_factory_staffing import line_of, rostered_chain
from test_supply_facts import BEER, FACTORY, RECIPES, RID, SHOP_A, WATER, Company, beer_chain

MALTINGS = ("upper_road", 7)


def lines_at(c, addr):
    site = next(s for s in c.supply["factories"]["sites"]
                if c.business_list[s["s"]]["key"] == site_key(addr))
    return site["lines"]


def run_with(c, recipes, history=None):
    c.business_list = c.businesses()
    c.supply = _supply(c.save(), Names({}), c.business_list, c.day, {}, recipes, history)
    return c


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
        self.assertEqual(_line_use(1, 30, 720, None, None), {"soldDay": None, "needDay": None, "production": None})

    def test_a_line_nothing_draws_on_reads_zero_and_covered(self):
        _site, line = line_of(rostered_chain([24], sold_a=0, bar_target=0))
        self.assertEqual((line["soldDay"], line["needDay"], line["production"]),
                         (0, 0, {"status": "covered", "level": "ok"}))

    def test_exactly_at_capacity_with_the_margin_is_covered(self):
        use = 720 / (1 + SUPPLY_MARGIN)
        self.assertEqual(_line_use(1, 30, 720, use, use)["production"], {"status": "covered", "level": "ok"})


class SoldIsMeasuredTests(unittest.TestCase):
    """Sold / day is the shops' measured sales; the need is what sizing reads."""

    def test_a_new_shops_coming_week_is_in_the_need_not_in_sold(self):
        # Shop B opened on day 16 and sells 75 a day so far; Demand sizing
        # reads its coming week as 200 (test_supply_facts). Measured: 200 + 75.
        c = beer_chain(opened_b=16, sold_b=75, sold_days_b=[[17, 50], [18, 75], [19, 100]])
        line = lines_at(c, FACTORY)[0]
        self.assertEqual(line["soldDay"], 275)
        self.assertEqual(line["needDay"], round(400 * (1 + SUPPLY_MARGIN)))

    def test_a_shelf_with_a_target_and_no_sales_is_need_not_sold(self):
        # The bar never sold beer but is topped up to 400 a day.
        _site, line = line_of(rostered_chain([24], sold_a=0, bar_units=0))
        self.assertEqual((line["soldDay"], line["needDay"]), (0, round(400 * (1 + SUPPLY_MARGIN))))
        self.assertEqual(line["needHours"]["dem"], math.ceil(400 * (1 + SUPPLY_MARGIN) / 30))

    def test_a_line_only_a_downstream_factory_eats_sells_nothing(self):
        # The maltings make malt for the brewery; no shop sells malt. The bar
        # sells 300 beer a day, which eats 100 malt.
        rid, malt = next((r, i) for r, i in sorted(RECIPE_ITEMS.items()) if i != BEER)
        recipes = {
            BEER: {"slug": BEER, "item": "Beer", "out": 30, "workstation": "bottledgoods",
                   "ingredients": [{"slug": malt, "item": "Malt", "per": 10}]},
            malt: {"slug": malt, "item": "Malt", "out": 20, "workstation": "bottledgoods", "ingredients": []},
        }
        c = Company()
        c.factory(MALTINGS, "Maltings", rid=rid)
        c.factory(FACTORY, "Brewery")
        c.shop(SHOP_A, "Beer Bar")
        c.hold(MALTINGS, malt, 100)
        c.hold(FACTORY, malt, 250)
        c.hold(FACTORY, BEER, 300)
        c.hold(SHOP_A, BEER, 200, 300)
        c.plan(MALTINGS, FACTORY, malt, 300)
        c.plan(FACTORY, SHOP_A, BEER, 400)
        run_with(c, recipes)
        line = lines_at(c, MALTINGS)[0]
        self.assertEqual(line["soldDay"], 0)
        self.assertEqual(line["needDay"], round(100 * (1 + SUPPLY_MARGIN)))
        self.assertEqual(lines_at(c, FACTORY)[0]["soldDay"], 300)


class SharedProductTests(unittest.TestCase):
    def test_two_lines_making_one_product_split_sold_and_need(self):
        # Two one-machine beer lines (one named by hand), 720 a day each; the
        # bar sells 1,500. Each line's share is 750 sold, 862 needed: one more
        # machine each.
        class History:
            def named(self, _character):
                return {"rid-x": BEER}

        c = Company()
        c.site(FACTORY, "Brewery", kind="ba:businesstype_factory", machines=[RID, "rid-x"])
        c.shop(SHOP_A, "Beer Bar")
        c.hold(FACTORY, WATER, 500)
        c.hold(FACTORY, BEER, 300)
        c.hold(SHOP_A, BEER, 200, 1500)
        c.plan(FACTORY, SHOP_A, BEER, 400)
        run_with(c, RECIPES, History())
        lines = lines_at(c, FACTORY)
        self.assertEqual(len(lines), 2)
        for line in lines:
            self.assertEqual((line["makes"], line["soldDay"], line["needDay"]),
                             (720, 750, round(750 * (1 + SUPPLY_MARGIN))))
            self.assertEqual(line["production"], {"status": "short", "level": "critical",
                                                  "more": 1, "makesWith": 1440})


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
