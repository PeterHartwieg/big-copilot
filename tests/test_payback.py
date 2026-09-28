"""Investment, profit so far and break-even (_payback(), docs/open-a-store-scope.md).

The rules are the game's own: an installation firm charges 586 per square metre
of the building on top of every item at its default price, and the walls and
floors are free; installing it yourself costs the items and every paid wall and
floor slot. The deposit counts in both. The fixtures are synthetic: a price
table of three items and two materials, and hand-built registrations and
statements at real addresses (so the building table knows their size). Never a
real save.
"""
import json
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import ba_dashboard
from ba_dashboard import (
    History, INSTALL_FEE_PER_M2, PAYBACK_RECENT_DAYS, _address_words, _payback, _payback_rate,
    payback_outcome, setup_cost,
)
from ba_save import Names, Save

PRICES = {
    "items": {
        "ba:itemname_cashregister": {"p": 900, "t": 24},
        "ba:itemname_storageshelf": {"p": 1200, "t": 64},
        "ba:itemname_bottlingmachine": {"p": 50000, "t": 128},
    },
    "materials": {
        "FLOORpaid": {"t": 1, "p": 20, "b": 1},
        "WALLpaid": {"t": 2, "p": 30, "b": 1},
        "FLOORfree": {"t": 1, "p": 0, "b": 1},
    },
}

SHOP = ("ba:street_eighthstreet", 5)      # retail, size C: 225 m²
BREWERY = ("ba:street_eighthavenue", 8)   # warehouse, size I: 1292 m²
KEY_SHOP, KEY_BREWERY = "ba:street_eighthstreet#5", "ba:street_eighthavenue#8"


def coll(items):
    return {"$items": list(items)}


def registration(addr, items, materials, deposit):
    return {
        "StreetName": addr[0], "StreetNumber": addr[1], "lastDeposit": deposit,
        "itemInstances": coll({"$k": f"id{i}", "$v": {"itemName": name, "priceOnPurchase": paid}}
                              for i, (name, paid) in enumerate(items)),
        "interiorDesigns": coll({"materials": coll({"MaterialID": m} for m in slots)} for slots in materials),
    }


def bill(text, amount, day):
    return {"transactionType": "ba:transaction_interiorinstallation", "amount": -amount,
            "address": None, "timestamp": {"Day": day},
            "transactionData": coll([{"$k": "address", "$v": text}])}


def business(addr, opened, cost_centre=False, status="retail"):
    return {"key": ba_dashboard.site_key(addr), "status": status, "costCentre": cost_centre, "opened": opened}


def statements(rows):
    """[(day, {addr: (profit, sales)})] as _statement_history() gives them."""
    return [(day, {addr: {"TotalProfit": p, "TotalSales": s} for addr, (p, s) in by.items()})
            for day, by in rows]


class PricesTestCase(unittest.TestCase):
    def setUp(self):
        patcher = mock.patch.object(ba_dashboard, "_item_prices", PRICES)
        patcher.start()
        self.addCleanup(patcher.stop)


class SetupCostTest(PricesTestCase):
    def test_the_firm_charges_the_floor_and_the_items_and_the_walls_are_free(self):
        cost = setup_cost([("ba:itemname_cashregister", 900), ("ba:itemname_storageshelf", 1200)],
                          ["FLOORpaid", "WALLpaid", "FLOORfree"], 225, 5880)
        self.assertEqual(cost["furniture"], 2100)
        self.assertEqual(cost["fee"], INSTALL_FEE_PER_M2 * 225)
        self.assertEqual(cost["materials"], 50)
        self.assertEqual(cost["firm"], 2100 + 586 * 225 + 5880)
        self.assertEqual(cost["self"], 2100 + 50 + 5880)

    def test_an_item_with_nothing_paid_counts_at_its_default_price(self):
        cost = setup_cost([("ba:itemname_cashregister", 0), ("ba:itemname_storageshelf", None),
                           ("ba:itemname_bottlingmachine", 45000)], [], 0, 0)
        # What was paid wins where the save records it (an older build's price).
        self.assertEqual(cost["furniture"], 900 + 1200 + 45000)

    def test_an_item_or_material_the_table_lacks_counts_nothing(self):
        cost = setup_cost([("ba:itemname_unknown", 0)], ["NOTaMATERIAL"], 54, 1020)
        self.assertEqual((cost["furniture"], cost["materials"]), (0, 0))
        self.assertEqual(cost["firm"], 586 * 54 + 1020)

    def test_a_real_bill_is_the_estimate_less_the_trade_in(self):
        # The Costy Co liquor store on 4 3rd Avenue: 1000 m², items at 372,479
        # today's default prices, 147,022 of trade-in; billed 811,456.5.
        estimate = setup_cost([("ba:itemname_bottlingmachine", 372479)], [], 1000, 0)["firm"]
        self.assertAlmostEqual(estimate - 147022, 811456.5, delta=1)


class OutcomeTest(unittest.TestCase):
    DAYS = [(10, -100), (11, 400), (12, 500), (13, 600)]

    def test_the_first_day_the_running_total_reaches_the_investment(self):
        self.assertEqual(payback_outcome(800, self.DAYS, True, 9, 500),
                         {"state": "reached", "day": 12, "after": 3})

    def test_statements_that_start_inside_the_lease_say_at_the_latest(self):
        self.assertEqual(payback_outcome(800, self.DAYS, False, 9, 500), {"state": "latest", "day": 12})

    def test_what_is_left_at_the_recent_rate_rounds_up(self):
        # 1,400 so far, 2,000 invested: 600 at 250 a day is 2.4, so 3 days.
        self.assertEqual(payback_outcome(2000, self.DAYS, True, 9, 250), {"state": "togo", "days": 3})

    def test_a_rate_that_earns_nothing_never_pays_back(self):
        self.assertEqual(payback_outcome(2000, self.DAYS, True, 9, 0), {"state": "never"})
        self.assertEqual(payback_outcome(2000, self.DAYS, True, 9, -50), {"state": "never"})

    def test_from_inside_the_lease_it_gives_the_payback_period_instead(self):
        # The profit before the record is unknown: no days to go, no "never",
        # but the whole setup over the recent rate.
        self.assertEqual(payback_outcome(2000, self.DAYS, False, 9, 250), {"state": "window", "days": 8})
        self.assertEqual(payback_outcome(2000, self.DAYS, False, 9, -50), {"state": "window"})
        self.assertEqual(payback_outcome(2000, self.DAYS, False, 9, None), {"state": "window"})

    def test_no_rate_is_unknown(self):
        self.assertEqual(payback_outcome(2000, [(10, -100)], True, 9, None), {"state": "unknown"})

    def test_the_rate_starts_at_the_first_sale_after_opening_and_keeps_closed_days(self):
        days = [(8, -50, 0), (9, -50, 0), (10, -50, 0), (11, 300, 400), (12, -50, 0), (13, 400, 500)]
        # Opened on day 9; nothing sold before day 11; day 12 was closed but paid rent.
        self.assertAlmostEqual(_payback_rate(days, 9), (300 - 50 + 400) / 3)
        self.assertIsNone(_payback_rate(days[:3], 9))

    def test_the_rate_reads_the_last_recent_days_only(self):
        days = [(d, 1000 if d <= 20 else 100, 1) for d in range(1, 41)]
        self.assertEqual(len([d for d in days[-PAYBACK_RECENT_DAYS:]]), PAYBACK_RECENT_DAYS)
        self.assertAlmostEqual(_payback_rate(days, 0), 100)


class AddressWordsTest(unittest.TestCase):
    def test_the_bill_s_address_matches_the_board_s(self):
        names = Names({})
        self.assertEqual(_address_words(names.addr(("ba:street_thirdavenue", 4))), _address_words("4 3rd Avenue"))
        self.assertEqual(_address_words(names.addr(("ba:street_ninthstreet", 12))), _address_words("12 9th Street"))
        self.assertEqual(_address_words(names.addr(("ba:street_twentythirdstreet", 4))), _address_words("4 23rd Street"))
        self.assertNotEqual(_address_words("4 3rd Avenue"), _address_words("43 Avenue"))


class PaybackTest(PricesTestCase):
    """A liquor store fed by a brewery: one chain, the brewery a cost centre."""

    def company(self, transactions=(), shop_items=None):
        shop = registration(SHOP, shop_items or [("ba:itemname_cashregister", 900), ("ba:itemname_storageshelf", 0)],
                            [["FLOORpaid", "WALLpaid"]], 5880)
        brewery = registration(BREWERY, [("ba:itemname_bottlingmachine", 50000)], [["FLOORpaid"]], 20000)
        save = Save({"Transactions": coll(transactions)}, {}, "synthetic")
        businesses = [business(SHOP, 30), business(BREWERY, 30, cost_centre=True, status="support")]
        chains = [{"name": "Liquor Stores", "sites": [KEY_SHOP, KEY_BREWERY]}]
        return save, [shop, brewery], businesses, chains

    def run_payback(self, rows, history=None, **company):
        save, regs, businesses, chains = self.company(**company)
        history = history or History(None)
        return _payback(save, Names({}), regs, businesses, chains, statements(rows), history, "CHAR"), history

    def test_a_site_opened_inside_the_window_breaks_even_on_an_exact_day(self):
        # The shop: 900 + 1,200 of furniture, 225 m², deposit 5,880.
        firm = 2100 + 586 * 225 + 5880
        rows = [(29, {BREWERY: (-500, 0)})] + [
            (d, {SHOP: (-98 if d < 32 else 40000, 0 if d < 32 else 50000), BREWERY: (-500, 0)})
            for d in range(30, 40)]
        out, _ = self.run_payback(rows)
        site = out["sites"][KEY_SHOP]
        self.assertEqual(site["cost"]["firm"], firm)
        self.assertEqual(site["cost"]["self"], 2100 + 50 + 5880)
        self.assertTrue(site["exact"])
        # -196 on days 30 and 31, then 40,000 a day: 139,806 after day 35.
        self.assertEqual(site["firm"], {"state": "reached", "day": 35, "after": 5})
        self.assertEqual(site["self"], {"state": "reached", "day": 32, "after": 2})
        self.assertEqual(site["rate"], 40000)

    def test_a_cost_centre_has_no_payback_of_its_own_and_counts_in_its_chain(self):
        rows = [(d, {SHOP: (10000, 12000), BREWERY: (-4000, 0)}) for d in range(30, 40)]
        out, _ = self.run_payback(rows)
        brewery = out["sites"][KEY_BREWERY]
        self.assertTrue(brewery["costCentre"])
        self.assertNotIn("firm", brewery)
        chain = out["chains"][KEY_SHOP]
        self.assertEqual(chain["cost"]["firm"], out["sites"][KEY_SHOP]["cost"]["firm"] + brewery["cost"]["firm"])
        self.assertEqual(chain["profit"], 10 * 6000)
        self.assertEqual(chain["rate"], 6000)
        self.assertEqual(chain["sites"], [KEY_SHOP, KEY_BREWERY])

    def test_a_chain_of_cost_centres_alone_has_no_row(self):
        save, regs, businesses, _ = self.company()
        chains = [{"name": "Head office and support", "sites": [KEY_BREWERY]},
                  {"name": "Liquor Stores", "sites": [KEY_SHOP]}]
        out = _payback(save, Names({}), regs, businesses, chains,
                       statements([(30, {SHOP: (1, 1), BREWERY: (-1, 0)})]), History(None), "CHAR")
        self.assertEqual(list(out["chains"]), [KEY_SHOP])

    def test_a_chain_of_cost_centres_that_sells_outside_has_a_row(self):
        save, regs, businesses, _ = self.company()
        chains = [{"name": "Factory", "sites": [KEY_BREWERY]}, {"name": "Liquor Stores", "sites": [KEY_SHOP]}]
        rows = [(d, {SHOP: (1, 1), BREWERY: (100000, 120000)}) for d in range(30, 40)]
        out = _payback(save, Names({}), regs, businesses, chains, statements(rows), History(None), "CHAR")
        self.assertEqual(sorted(out["chains"]), sorted([KEY_SHOP, KEY_BREWERY]))
        self.assertNotIn("firm", out["sites"][KEY_BREWERY])
        self.assertEqual(out["chains"][KEY_BREWERY]["firm"]["state"], "reached")

    def test_statements_older_than_the_window_say_at_the_latest(self):
        # 61 days kept, and the shop has a statement on the first of them.
        rows = [(d, {SHOP: (20000, 25000)}) for d in range(100, 161)]
        out, _ = self.run_payback(rows)
        site = out["sites"][KEY_SHOP]
        self.assertFalse(site["exact"])
        self.assertEqual(site["firm"]["state"], "latest")
        self.assertEqual(site["since"], 100)

    def test_a_site_opened_before_the_record_that_has_not_paid_back_in_it(self):
        rows = [(d, {SHOP: (100, 50000)}) for d in range(100, 161)]
        out, _ = self.run_payback(rows)
        site = out["sites"][KEY_SHOP]
        self.assertFalse(site["exact"])
        # 2,100 + 131,850 + 5,880 at 100 a day.
        self.assertEqual(site["firm"], {"state": "window", "days": 1399})
        losing = [(d, {SHOP: (-100, 50)}) for d in range(100, 161)]
        out, _ = self.run_payback(losing)
        self.assertEqual(out["sites"][KEY_SHOP]["firm"], {"state": "window"})

    def test_the_firm_s_bill_replaces_the_firm_estimate_and_is_remembered(self):
        rows = [(d, {SHOP: (-98, 0)}) for d in range(30, 33)]
        out, history = self.run_payback(rows, transactions=[bill("5 8th Street", 120000.5, 31)])
        cost = out["sites"][KEY_SHOP]["cost"]
        self.assertEqual(cost["billed"], 120000.5)
        self.assertEqual(cost["firm"], 120000.5 + 5880)
        # Installing it yourself is still the furniture, the paid slots and the deposit.
        self.assertEqual(cost["self"], 2100 + 50 + 5880)
        # A week on, the log no longer holds the bill: the investment stays put.
        later, _ = self.run_payback(rows + [(33, {SHOP: (-98, 0)})], history)
        self.assertEqual(later["sites"][KEY_SHOP]["cost"]["firm"], 120000.5 + 5880)

    def test_a_later_re_layout_s_bill_is_not_the_setup(self):
        # Trading since day 32; the firm re-laid the shop out on day 36.
        rows = [(d, {SHOP: (-98 if d < 32 else 500, 0 if d < 32 else 900)}) for d in range(30, 40)]
        out, _ = self.run_payback(rows, transactions=[bill("5 8th Street", 250000, 36)])
        self.assertNotIn("billed", out["sites"][KEY_SHOP]["cost"])
        # A lease older than the record: any bill in the log is a re-layout.
        old = [(d, {SHOP: (500, 900)}) for d in range(100, 161)]
        out, _ = self.run_payback(old, transactions=[bill("5 8th Street", 250000, 158)])
        self.assertNotIn("billed", out["sites"][KEY_SHOP]["cost"])

    def test_a_bill_for_an_earlier_business_at_the_address_is_not_this_one_s(self):
        rows = [(d, {SHOP: (-98, 0)}) for d in range(30, 33)]
        out, _ = self.run_payback(rows, transactions=[bill("5 8th Street", 99999, 12)])
        self.assertNotIn("billed", out["sites"][KEY_SHOP]["cost"])

    def test_a_break_even_day_outlives_the_statements_that_showed_it(self):
        history = History(None)
        opening = [(d, {SHOP: (-98, 0)}) for d in range(29, 31)] + [
            (d, {SHOP: (40000, 50000)}) for d in range(31, 40)]
        first, _ = self.run_payback(opening, history)
        self.assertEqual(first["sites"][KEY_SHOP]["firm"]["state"], "reached")
        reached = first["sites"][KEY_SHOP]["firm"]["day"]
        # Sixty days later the window starts long after the opening.
        later = [(d, {SHOP: (100, 50000)}) for d in range(100, 161)]
        again, _ = self.run_payback(later, history)
        self.assertEqual(again["sites"][KEY_SHOP]["firm"],
                         {"state": "reached", "day": reached, "after": reached - 30, "kept": True})

    def test_a_remembered_day_is_dropped_when_the_investment_moved(self):
        history = History(None)
        opening = [(d, {SHOP: (40000, 50000)}) for d in range(29, 40)]
        self.run_payback(opening, history)
        later = [(d, {SHOP: (100, 50000)}) for d in range(100, 161)]
        # A bottling machine added since: the setup is no longer the one paid
        # back, and 6,100 over the window does not reach it. The lease is older
        # than the record, so the payback period stands in: (50,900 + 131,850
        # + 5,880) at 100 a day.
        again, _ = self.run_payback(later, history, shop_items=[
            ("ba:itemname_cashregister", 900), ("ba:itemname_bottlingmachine", 50000)])
        self.assertEqual(again["sites"][KEY_SHOP]["firm"], {"state": "window", "days": 1887})

    def test_an_older_save_reads_the_memory_and_changes_none_of_it(self):
        history = History(None)
        opening = [(d, {SHOP: (-98, 0)}) for d in range(29, 31)] + [
            (d, {SHOP: (40000, 50000)}) for d in range(31, 40)]
        newer, _ = self.run_payback(opening, history)
        reached = newer["sites"][KEY_SHOP]["firm"]["day"]
        before = json.loads(json.dumps(history.payback("CHAR")))
        # An older save of the same character, from before the shop opened.
        save, regs, businesses, chains = self.company()
        _payback(save, Names({}), regs[1:], businesses[1:], [{"name": "Head office and support",
                 "sites": [KEY_BREWERY]}], statements([(20, {BREWERY: (-500, 0)})]), history, "CHAR")
        self.assertEqual(history.payback("CHAR"), before)
        # And the newer save again, its statements rolled on past the opening.
        later = [(d, {SHOP: (100, 50000)}) for d in range(100, 161)]
        again, _ = self.run_payback(later, history)
        self.assertEqual(again["sites"][KEY_SHOP]["firm"]["day"], reached)
        self.assertTrue(again["sites"][KEY_SHOP]["firm"]["kept"])

    def test_sales_before_the_opening_day_were_another_business(self):
        rows = [(d, {SHOP: (5000000, 6000000)}) for d in range(100, 120)] + [
            (d, {SHOP: (-98, 0)}) for d in range(120, 125)] + [
            (d, {SHOP: (1000, 2000)}) for d in range(125, 160)]
        save, regs, businesses, chains = self.company()
        businesses[0]["opened"] = 124
        out = _payback(save, Names({}), regs, businesses, chains, statements(rows), History(None), "CHAR")
        site = out["sites"][KEY_SHOP]
        self.assertEqual(site["since"], 120)
        self.assertTrue(site["exact"])
        self.assertEqual(site["profit"], -98 * 5 + 1000 * 35)
        self.assertEqual(site["firm"]["state"], "togo")

    def test_a_site_given_up_leaves_the_memory(self):
        history = History(None)
        self.run_payback([(30, {SHOP: (1, 1)})], history)
        history.payback("CHAR")["sites"]["ba:street_gone#1"] = {"opened": 1}
        self.run_payback([(31, {SHOP: (1, 1)})], history)
        self.assertNotIn("ba:street_gone#1", history.payback("CHAR")["sites"])


class ExtractTest(unittest.TestCase):
    def test_the_payload_carries_the_key_and_it_serialises(self):
        import json
        import tempfile

        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from save_fixtures import data_names, write_data_save
        from ba_save import load_save

        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "fixture.hsg")
            write_data_save(path)
            data = ba_dashboard.extract(load_save(path), Names(data_names()), os.path.join(tmp, "h.json"))
        payback = data["payback"]
        json.dumps(payback)
        trading = [b["key"] for b in data["businesses"] if b["status"] in ("retail", "office")]
        self.assertTrue(trading)
        for key in trading:
            self.assertIn(payback["sites"][key]["firm"]["state"],
                          ("reached", "latest", "togo", "never", "unknown"))


if __name__ == "__main__":
    unittest.main()
