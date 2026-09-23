"""Smart Delivery (isTarget) import contracts, on synthetic fixtures only.

A plain contract brings its amount every Monday. A Smart Delivery one keeps a
stock level: each delivery brings max(0, level - stock of that item at the
depot), and a later contract sees what an earlier one brought that morning.
"""
import unittest
from unittest.mock import patch

import test_import_routes as fixtures
from ba_dashboard import (_alerts, _feed_notes, _import_drop, _import_level, _scheduled_import_gap,
                          _supply)
from test_import_routes import contract
from test_recipe_identity import WATER


def smart(amount, **options):
    """A Smart Delivery contract: the level to keep, in the fixture's shape."""
    order = contract(amount, **options)
    order["isTarget"] = True
    return order


def drop(amount, is_smart=False, rank=0, day=11):
    return {"day": day, "amount": amount, "smart": is_smart, "rank": rank}


class ImportDropTests(unittest.TestCase):
    def test_plain_contracts_bring_their_amounts(self):
        self.assertEqual(_import_drop(5000, [drop(1000), drop(2000)]), 3000)

    def test_smart_delivery_tops_up_to_its_level(self):
        self.assertEqual(_import_drop(300, [drop(1000, True)]), 700)
        # Stock above the level: nothing comes.
        self.assertEqual(_import_drop(1500, [drop(1000, True)]), 0)
        # A depot that ran dry holds nothing, not less than nothing.
        self.assertEqual(_import_drop(-200, [drop(1000, True)]), 1000)

    def test_two_smart_contracts_hold_the_higher_level_not_the_sum(self):
        for order in ([drop(1000, True), drop(1500, True)], [drop(1500, True), drop(1000, True)]):
            with self.subTest(order=[d["amount"] for d in order]):
                self.assertEqual(_import_drop(0, order), 1500)

    def test_a_mixed_depot_follows_the_plan_order(self):
        # Plain first: the Smart Delivery contract sees the plain delivery.
        self.assertEqual(_import_drop(0, [drop(400), drop(1000, True)]), 1000)
        self.assertEqual(_import_drop(0, [drop(1400), drop(1000, True)]), 1400)
        # Smart Delivery first: the plain amount comes on top of the level.
        self.assertEqual(_import_drop(0, [drop(1000, True), drop(400)]), 1400)


class ImportLevelTests(unittest.TestCase):
    """What the page says of a line always equals what a delivery pass brings."""

    CASES = [
        # (delivery order, level shown, plain on top of it)
        ([drop(1000, True)], 1000, 0),
        ([drop(400), drop(1000, True)], 1000, 0),
        ([drop(1000, True), drop(400)], 1000, 400),
        # A second equal level finds the depot at 1,400 and brings nothing.
        ([drop(1000, True), drop(400), drop(1000, True)], 1000, 400),
        # A higher level after a plain amount can bring nothing too: 500 + 300
        # is 800 before the 600 is asked for, so 500 is the level that holds.
        ([drop(500, True), drop(300), drop(600, True)], 500, 300),
        ([drop(500, True), drop(300), drop(900, True)], 900, 0),
        ([drop(1000, True), drop(1500, True)], 1500, 0),
        # Plain amounts first already fill the level: the rest is on top.
        ([drop(1400), drop(1000, True)], 1000, 400),
        ([drop(700)], None, 0),
    ]

    def test_level_and_plain_after_add_up_to_the_delivery_pass(self):
        for drops, level, after in self.CASES:
            with self.subTest(drops=[(d["amount"], d["smart"]) for d in drops]):
                smart, shown, plain_after = _import_level(drops)
                self.assertEqual((shown, plain_after), (level, after))
                if smart:
                    self.assertEqual(shown + plain_after, _import_drop(0, drops))


class ScheduledGapTests(unittest.TestCase):
    """Day 10, a whole day left, 100 a day, a flat week."""

    def gap(self, stock, first, *, is_smart):
        return _scheduled_import_gap(
            stock, 100, [1] * 7, 10,
            [drop(first, is_smart, day=11), drop(700, day=15)], 1.0)

    def test_a_smart_drop_on_a_full_depot_brings_only_the_top_up(self):
        plain = self.gap(350, 300, is_smart=False)
        self.assertEqual((plain["runsOut"], plain["catchUp"]), (None, 0))
        # 250 left on day 11 against a level of 300: 50 arrive, and the four
        # days to day 15 need 400.
        level = self.gap(350, 300, is_smart=True)
        self.assertEqual(level["runsOut"], 14)
        self.assertEqual(level["until"], 15)

    def test_the_one_off_counts_that_a_smart_drop_brings_less_after_it(self):
        # Stock at day 11 must reach 400 on its own: 250 + 150. The running
        # deficit alone, 100, would be swallowed by a smaller top-up.
        self.assertEqual(self.gap(350, 300, is_smart=True)["catchUp"], 150)
        self.assertEqual(self.gap(500, 300, is_smart=True)["catchUp"], 0)

    def test_a_level_that_covers_the_week_leaves_only_the_days_before_it(self):
        result = self.gap(0, 500, is_smart=True)
        # Day 10 runs dry before any delivery: 100 short, then 500 carries four days.
        self.assertEqual((result["runsOut"], result["catchUp"]), (10, 100))

    def test_plain_schedules_keep_their_arithmetic(self):
        result = _scheduled_import_gap(0, 100, [1] * 7, 10,
                                       [{"day": 10, "amount": 100}, {"day": 12, "amount": 600}], .5)
        self.assertEqual((result["catchUp"], result["runsOut"]), (50, 11))


class SmartSupplyTests(unittest.TestCase):
    def setUp(self):
        # Built through the module, so its test class is not collected twice.
        self.routes = fixtures.ImportRoutesTests()

    def depot(self, contracts, **options):
        data = self.routes.build(contracts, **options)
        return data, data["supply"]["factories"]["depots"][1][WATER]

    def test_a_smart_contract_is_a_level_not_a_weekly_sum(self):
        order = smart(3000, last=1200)
        order.update(id="c-1", employeeInstanceId="agent-1", isRepeatingOrder=True)
        _, line = self.depot([order], routed=True)
        self.assertEqual((line["smart"], line["target"], line["weekly"]), (True, 3000, 3000))
        self.assertEqual(line["arrivedLastWeek"], 1200)
        self.assertEqual(line["contracts"], [{
            "order": 0, "id": "c-1", "importer": "1 Pier", "smart": True, "amount": 3000,
            "lastWeek": 1200, "active": True, "repeating": True, "agent": True}])

    def test_missing_flags_read_as_the_games_defaults(self):
        _, line = self.depot([contract(2000)], routed=True)
        self.assertEqual((line["smart"], line["target"], line["weekly"]), (False, None, 2000))
        [only] = line["contracts"]
        self.assertEqual((only["smart"], only["repeating"], only["agent"], only["id"]),
                         (False, False, False, None))

    def test_two_smart_contracts_count_the_higher_level(self):
        _, line = self.depot([smart(3000), smart(1000, pier=2)], routed=True)
        self.assertEqual((line["weekly"], line["target"]), (3000, 3000))
        self.assertEqual([c["order"] for c in line["contracts"]], [0, 1])

    def test_a_mixed_depot_is_modelled_in_the_games_delivery_order(self):
        # Plain first: the level tops up what the plain delivery left short,
        # so the 400 lands inside the 1,000 and nothing comes on top of it.
        _, line = self.depot([contract(400), smart(1000, pier=2)], routed=True)
        self.assertEqual((line["smart"], line["target"], line["plainAfter"], line["weekly"]),
                         (True, 1000, 0, 1000))
        # Level first: the plain amount lands on top.
        _, line = self.depot([smart(1000, pier=2), contract(400)], routed=True)
        self.assertEqual((line["target"], line["plainAfter"], line["weekly"]), (1000, 400, 1400))

    def test_a_mixed_line_names_the_level_and_sizes_the_raise_net_of_what_comes_on_top(self):
        # The factory eats 1,680 a week. A level of 700 with 400 a week after
        # it brings 1,100: the level has to rise to 1,300, not 1,700.
        data = self.routes.build([smart(700, destination=("factory", 0)),
                                  contract(400, pier=2, destination=("factory", 0))])
        need = self.routes.need(data)
        self.assertEqual((need["importWeekly"], need["importTarget"], need["importPlainAfter"]),
                         (1100, 700, 400))
        self.assertEqual(need["raiseImport"], 1300)
        [note] = _feed_notes(data["businesses"], data["supply"]["factories"], set())
        self.assertIn("Smart Delivery keeps 700 in stock plus 400 a week", note["text"])
        self.assertNotIn("1,100 in stock", note["text"])
        # Plain first, the same contracts read as the level alone.
        data = self.routes.build([contract(400, pier=2, destination=("factory", 0)),
                                  smart(700, destination=("factory", 0))])
        need = self.routes.need(data)
        self.assertEqual((need["importWeekly"], need["importTarget"], need["importPlainAfter"]),
                         (700, 700, 0))
        self.assertEqual(need["raiseImport"], 1700)

    def test_a_depot_line_reads_as_its_delivery_pass(self):
        for orders, level, after, week in (
            ([smart(1000), contract(400, pier=2), smart(1000)], 1000, 400, 1400),
            ([smart(500), contract(300, pier=2), smart(600, pier=3)], 500, 300, 800),
        ):
            with self.subTest(level=level):
                _, line = self.depot(orders, routed=True)
                self.assertEqual((line["target"], line["plainAfter"], line["weekly"]),
                                 (level, after, week))

    def test_a_contract_set_to_zero_is_listed_but_supplies_nothing(self):
        order = smart(0)
        order["id"] = "z-1"
        data = self.routes.build([order], routed=True)
        line = data["supply"]["factories"]["depots"][1][WATER]
        self.assertEqual((line["weekly"], line["zeroOnly"]), (0, True))
        self.assertEqual([c["id"] for c in line["contracts"]], ["z-1"])
        # The factory line still reads as fed by no import, as before.
        self.assertIsNone(self.routes.need(data)["importWeekly"])
        self.assertFalse(any(r["s"] == 1 for r in data["supply"]["imports"]))

    def test_an_importer_delivers_all_its_contracts_in_the_place_of_its_first(self):
        # Pier 1 is first in the plan, so both its contracts deliver before
        # Pier 2's level is topped up: 400 + 700, then nothing. In plain list
        # order the level would come second and 700 would land on top of it.
        orders = [contract(400), smart(1000, pier=2), contract(700)]
        _, line = self.depot(orders, routed=True)
        self.assertEqual(line["weekly"], 1100)
        # The list reads in that delivery order, A1, A2, B1, and each contract
        # keeps its raw place in the plan for a later reorder.
        self.assertEqual([(c["order"], c["importer"]) for c in line["contracts"]],
                         [(0, "1 Pier"), (2, "1 Pier"), (1, "2 Pier")])
        # Both plain amounts land before the level and already pass it, so
        # the level brings nothing and 100 sits on top of it.
        self.assertEqual((line["target"], line["plainAfter"]), (1000, 100))

    def test_paused_contracts_count_in_what_arrived_but_not_in_supply(self):
        _, line = self.depot([smart(3000, last=900), smart(8000, last=500, active=False, pier=2)],
                             routed=True)
        self.assertEqual((line["weekly"], line["arrivedLastWeek"]), (3000, 1400))
        _, line = self.depot([smart(3000, last=900, active=False)], routed=True)
        self.assertEqual((line["weekly"], line["pausedWeekly"], line["smart"]), (0, 3000, True))

    def test_the_fit_asks_whether_the_level_covers_a_full_week(self):
        # The factory eats 240 a day, 1,680 a week, from a direct import.
        for level, status in ((1700, "ok"), (1650, "import"), (700, "import")):
            with self.subTest(level=level):
                data = self.routes.build([smart(level, destination=("factory", 0))])
                need = self.routes.need(data)
                self.assertEqual((need["status"], need["importSmart"]), (status, True))
        need = self.routes.need(self.routes.build([smart(700, destination=("factory", 0))]))
        self.assertEqual(need["raiseImport"], 1700)

    def test_feed_findings_say_the_level_is_kept_in_stock(self):
        data = self.routes.build([smart(700, destination=("factory", 0))])
        [note] = _feed_notes(data["businesses"], data["supply"]["factories"], set())
        self.assertIn("Smart Delivery keeps 700 in stock", note["text"])
        self.assertIn("raise the stock level to 1,700", note["text"])
        self.assertNotIn("import order", note["text"])
        data = self.routes.build([smart(1650, destination=("factory", 0))])
        [note] = _feed_notes(data["businesses"], data["supply"]["factories"], set())
        self.assertIn("Smart Delivery keeps 1,650 in stock, within 5%", note["text"])
        data = self.routes.build([contract(700, destination=("factory", 0))])
        [note] = _feed_notes(data["businesses"], data["supply"]["factories"], set())
        self.assertIn("import order is 700", note["text"])

    def measured(self, contracts):
        """The depot sells 200 a day itself, so its draw is measured."""
        real = _supply

        def supply(save, names, businesses, *args, **kwargs):
            businesses[1]["lines"][0].update(rate=200, units=20000)
            return real(save, names, businesses, *args, **kwargs)

        with patch.object(fixtures, "_supply", supply):
            data = self.routes.build(contracts)
        return data, next(r for r in data["supply"]["imports"] if r["s"] == 1)

    def test_a_depot_row_carries_the_setting_and_the_order_finding_says_stock(self):
        data, row = self.measured([smart(1000, last=800)])
        self.assertEqual((row["smart"], row["target"], row["weekly"]), (True, 1000, 1000))
        self.assertEqual((row["orderFit"], row["reason"]), ("short", "order"))
        self.assertEqual(row["arrivedLastWeek"], 800)
        # The fields _alerts reads of a quiet support site, all at rest.
        for business in data["businesses"]:
            business.update(revenue=0, opened=0, profit=0, costCentre=True, rent=0, staff=0,
                            customers=0, promotion=0, marketingIndex=0, missingAmenities=[],
                            missingUniformLocker=False, uniformGaps=[], quitWarnings=0,
                            staffDemands=[], staffLacking=[], staffLackingAny=0,
                            staffLackingCompany=0, notTrading=False,
                            satisfaction={"overall": 100})
        result = _alerts(data["businesses"], data["supply"], [], [], [], [], [], 10, 1e9)
        texts = [a["text"] for a in result["lines"] + result["minor"]["rows"]
                 if a["group"] == "order"]
        self.assertTrue(any("Smart Delivery keeps 1,000 in stock against a 1,400 week" in t
                            for t in texts), texts)

    @staticmethod
    def pipes(data):
        """Each importer's pipe into the depot, units a day."""
        return {link["from"]: link["perDay"] for link in data["supply"]["graph"]["links"]
                if link["to"] == "depot#1"}

    def test_the_graph_draws_a_levels_weekly_top_up_not_the_level(self):
        # 200 a day leaves the depot: a level of 3,000 tops up 1,400 a week.
        data, _ = self.measured([smart(3000)])
        self.assertEqual(self.pipes(data), {"import:pier#1": 200})
        # A plain 3,000 still arrives whole.
        data, _ = self.measured([contract(3000)])
        self.assertEqual(self.pipes(data), {"import:pier#1": 429})
        # A level below the week's use brings the whole level.
        data, _ = self.measured([smart(700)])
        self.assertEqual(self.pipes(data), {"import:pier#1": 100})

    def test_with_no_measured_draw_the_pipe_is_what_arrived_last_week(self):
        data = self.routes.build([smart(3000, last=1200)])
        self.assertEqual(self.pipes(data), {"import:pier#1": 171})

    def test_two_levels_split_the_top_up_in_delivery_order(self):
        data, _ = self.measured([smart(3000), smart(1000, pier=2)])
        self.assertEqual(self.pipes(data), {"import:pier#1": 200, "import:pier#2": 0})
        # The plain order comes first, and the level only tops up the rest.
        data, _ = self.measured([contract(700), smart(3000, pier=2)])
        self.assertEqual(self.pipes(data), {"import:pier#1": 100, "import:pier#2": 100})

    def test_a_high_level_on_a_full_depot_brings_nothing_in_the_walk(self):
        # 20,000 held against 200 a day: two staggered levels change nothing.
        early, late = smart(1000, last=0), smart(1000, pier=2)
        early["nextDeliveryDay"], late["nextDeliveryDay"] = 11, 16
        _, row = self.measured([early, late])
        self.assertEqual((row["coverFit"], row["catchUp"]), ("ok", 0))


if __name__ == "__main__":
    unittest.main()
