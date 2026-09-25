"""What a two-run history extract means, not what its bytes are.

tests/test_payload_snapshot.py pins the bytes of tests/save_fixtures.py's
trading company extracted on day N (40) and again a week later against the
history file the first run wrote. This module states the contract behind four
of those payload keys -- cashFlow, trends, kpi and hypeExposure -- against the
fixture's own save trees, so a change that keeps the snapshot regenerable but
breaks the meaning is caught here:

- kpi is the save read straight: cash, debt, yesterday's profit and revenue, and
  the seven-day profit, from the fixture's financialSummaries.
- cashFlow needs two readings; a week later it spans the week from day N, and
  its profit is the fixture's booked profit over that week.
- A week later, the figures that look back a week are the ones day N computed
  (the previous week's profit, each site's previous week, the net worth the
  later build no longer reports, the hype wave's baseline).
- trends follow the fixture's revenue; market deltas follow its demand drift.
- hypeExposure is the fixture's one hype wave, and only it.
- A save older than the newest one on record (a player reloading) reads its
  cash flow up to its own day, never a later one.
"""
from __future__ import annotations

import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))

import ba_dashboard  # noqa: E402
import save_fixtures as fx  # noqa: E402
from ba_save import Names, load_save  # noqa: E402

N, LATER, BETWEEN = fx.DAY, fx.DAY + 7, fx.DAY + 4
LIQUOR, GIFTS = ba_dashboard.site_key(fx.LIQUOR), ba_dashboard.site_key(fx.GIFTS)
HUB, BREWERY = ba_dashboard.site_key(fx.HUB), ba_dashboard.site_key(fx.BREWERY)


def summaries(day: int) -> dict:
    """{day number: financial summary} as the fixture saves them on `day`."""
    return {s["dayNumber"]: s for s in fx.data_company(day)["financialSummaries"]}


def site_sales(day: int, addr: tuple, days) -> list:
    """The site's TotalSales on each of `days`, from the fixture's statements."""
    out = []
    for d in days:
        for st in summaries(day)[d]["businessIncomeStatements"]:
            if st["Address"] == fx.address(*addr):
                out.append(st["TotalSales"])
    return out


def demand(day: int) -> dict:
    """{(item, neighbourhood): demand} in the fixture's market on `day`, the global row left out."""
    return {(e["itemName"], v["neighborhood"]): v["demand"]
            for e in fx.data_company(day)["productMarketEntries"]
            for v in e["demandValues"] if v["neighborhood"] != "ba:neighborhood_global"}


class HistoryExtractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        names = fx.data_names()
        cls.runs = {}
        with tempfile.TemporaryDirectory() as tmp:
            path, history = os.path.join(tmp, "payload.hsg"), os.path.join(tmp, "history.json")
            # Day N, a week later, then an older save reloaded after the later one.
            for day in (N, LATER, BETWEEN):
                fx.write_data_save(path, day)
                cls.runs[day] = ba_dashboard.extract(load_save(path), Names(dict(names)), history)
        cls.first, cls.later = cls.runs[N], cls.runs[LATER]

    # --- kpi: the save read straight ---------------------------------------

    def test_kpi_is_the_save_and_its_summaries(self):
        for day, payload in ((N, self.first), (LATER, self.later)):
            with self.subTest(day=day):
                tree, books = fx.data_company(day), summaries(day)
                kpi = payload["kpi"]
                self.assertEqual(kpi["cash"], tree["Money"])
                self.assertEqual(kpi["debt"], sum(l["remainingAmount"] for l in tree["Loans"]))
                yesterday = books[day - 1]
                self.assertAlmostEqual(kpi["profitYesterday"], yesterday["totalProfit"], places=2)
                self.assertAlmostEqual(
                    kpi["revenue"],
                    sum(s["TotalSales"] for s in yesterday["businessIncomeStatements"]), places=2)
                week = [books[d]["totalProfit"] for d in range(day - 7, day)]
                self.assertAlmostEqual(kpi["profitSum7"], sum(week), places=2)
                self.assertAlmostEqual(kpi["profitAvg7"], sum(week) / 7, places=2)
                before = [books[d]["totalProfit"] for d in range(day - 14, day - 7)]
                self.assertAlmostEqual(kpi["profitPrev7"], sum(before) / 7, places=2)

    def test_net_worth_is_live_on_day_n_and_carried_forward_after(self):
        self.assertEqual(self.first["kpi"]["netWorth"], fx.data_company(N)["NetWorth"])
        self.assertIsNone(self.first["kpi"]["netWorthAsOf"])
        # The later build dropped NetWorth from the save: day N's figure, dated.
        self.assertNotIn("NetWorth", fx.data_company(LATER))
        self.assertEqual(self.later["kpi"]["netWorth"], self.first["kpi"]["netWorth"])
        self.assertEqual(self.later["kpi"]["netWorthAsOf"], N)

    # --- cashFlow ------------------------------------------------------------

    def test_one_reading_has_no_cash_flow(self):
        self.assertEqual(self.first["ledgerDays"], 1)
        self.assertIsNone(self.first["cashFlow"])

    def test_a_week_later_the_cash_flow_spans_the_week_from_day_n(self):
        flow = self.later["cashFlow"]
        self.assertEqual(self.later["ledgerDays"], 2)
        self.assertEqual((flow["fromDay"], flow["days"]), (N, LATER - N))
        self.assertEqual(flow["cashFrom"], self.first["kpi"]["cash"])
        self.assertEqual(flow["cashTo"], self.later["kpi"]["cash"])
        self.assertAlmostEqual(flow["cashChange"], flow["cashTo"] - flow["cashFrom"], places=2)

    def test_cash_flow_profit_is_the_profit_booked_over_its_days(self):
        flow, books = self.later["cashFlow"], summaries(LATER)
        booked = sum(books[d]["totalProfit"] for d in range(flow["fromDay"], LATER))
        self.assertAlmostEqual(flow["profit"], booked, places=2)
        # Over a seven-day span it is the kpi's seven-day profit.
        self.assertAlmostEqual(flow["profit"], self.later["kpi"]["profitSum7"], places=2)
        self.assertAlmostEqual(flow["reinvested"], flow["profit"] - flow["cashChange"], places=2)

    def test_net_worth_change_needs_both_ends(self):
        # Day N reported net worth, the later save does not: no change is invented.
        flow = self.later["cashFlow"]
        self.assertEqual((flow["netWorthFrom"], flow["netWorthTo"], flow["netWorthChange"]),
                         (None, None, None))

    # --- carried forward -----------------------------------------------------

    def test_the_week_before_is_the_week_day_n_computed(self):
        self.assertAlmostEqual(self.later["kpi"]["profitPrev7"], self.first["kpi"]["profitAvg7"], places=2)
        first = {t["key"]: t for t in self.first["trends"]}
        for t in self.later["trends"]:
            with self.subTest(site=t["key"]):
                self.assertEqual(t["prev7"], first[t["key"]]["last7"])

    # --- trends --------------------------------------------------------------

    def test_trends_follow_the_fixture_revenue(self):
        for day, payload in ((N, self.first), (LATER, self.later)):
            trends = {t["key"]: t for t in payload["trends"]}
            self.assertEqual(set(trends), {LIQUOR, GIFTS, HUB, BREWERY})
            for key, addr in ((LIQUOR, fx.LIQUOR), (GIFTS, fx.GIFTS)):
                with self.subTest(day=day, site=key):
                    t = trends[key]
                    last = sum(site_sales(day, addr, range(day - 7, day)))
                    prev = sum(site_sales(day, addr, range(day - 14, day - 7)))
                    self.assertTrue(t["ready"])  # open since day 3: two full weeks behind it
                    self.assertAlmostEqual(t["last7"], last, places=2)
                    self.assertAlmostEqual(t["prev7"], prev, places=2)
                    self.assertAlmostEqual(t["change"], round((last - prev) / prev, 4), places=4)
            # The hype wave lifts beer, so the liquor store rises; the gift shop's
            # weeks are the same shape, so it holds.
            self.assertGreater(trends[LIQUOR]["change"], 0)
            self.assertEqual(trends[GIFTS]["change"], 0)
            # Sites that sell nothing have no week to compare.
            self.assertIsNone(trends[HUB]["change"])
            self.assertIsNone(trends[BREWERY]["change"])

    def test_market_deltas_follow_the_fixture_demand(self):
        def cells(payload):
            return {(row["slug"], c["hood"]): c for row in payload["market"]["rows"]
                    for c in row["cells"] if c}

        self.assertEqual(self.first["market"]["trendDays"], 0)
        self.assertTrue(all(c["delta"] is None for c in cells(self.first).values()))

        self.assertEqual(self.later["market"]["trendDays"], LATER - N)
        was, now = demand(N), demand(LATER)
        later = cells(self.later)
        self.assertEqual(set(later), set(now))
        for key, cell in later.items():
            with self.subTest(cell=key):
                self.assertEqual(cell["demand"], now[key])
                self.assertEqual(cell["delta"], now[key] - was[key])
        # The fixture moves some cells each way, so both directions are checked.
        deltas = [c["delta"] for c in later.values()]
        self.assertTrue(any(d > 0 for d in deltas) and any(d < 0 for d in deltas))

    # --- hypeExposure --------------------------------------------------------

    def test_hype_exposure_is_the_fixture_wave(self):
        waves = [e for e in fx.data_company(N)["marketEvents"] if e["type"] == ba_dashboard.HYPE_EVENT]
        self.assertEqual(len(waves), 1)
        wave = waves[0]
        end = wave["startDay"] + wave["durationInDays"]
        for day, payload in ((N, self.first), (LATER, self.later)):
            with self.subTest(day=day):
                # One wave: the umbrella shortage and the rival's opening are not hype.
                self.assertEqual(len(payload["hypeExposure"]), 1)
                got = payload["hypeExposure"][0]
                self.assertEqual(got["hood"], wave["neighbourhood"])
                self.assertEqual(got["startDay"], wave["startDay"])
                self.assertEqual(got["daysLeft"], end - day)
                self.assertEqual(got["items"], [fx.data_names()[wave["itemName"]]])
                # Only the Midtown shop that sells beer; the gift shop is elsewhere.
                self.assertEqual([s["key"] for s in got["sites"]], [LIQUOR])
                self.assertEqual(got["top"], LIQUOR)
                self.assertEqual(got["sites"][0]["share"], 100)  # beer is all it sells
                self.assertAlmostEqual(got["revenue"], site_sales(day, fx.LIQUOR, [day - 1])[0], places=2)
                # The baseline is the shop's own week before the wave landed.
                before = site_sales(day, fx.LIQUOR, range(wave["startDay"] - 7, wave["startDay"]))
                self.assertEqual(got["baseline"]["name"], "HART. Spirits")
                self.assertAlmostEqual(got["baseline"]["revenue"], sum(before) / len(before), places=2)
                self.assertLess(got["baseline"]["revenue"], got["revenue"])
        self.assertEqual(self.later["hypeExposure"][0]["baseline"], self.first["hypeExposure"][0]["baseline"])

    # --- an older save reloaded after a later one ----------------------------

    def test_an_older_save_compares_demand_with_the_days_before_it(self):
        between = self.runs[BETWEEN]
        self.assertEqual(between["market"]["trendDays"], BETWEEN - N)
        was, now = demand(N), demand(BETWEEN)
        for row in between["market"]["rows"]:
            for c in row["cells"]:
                if c:
                    self.assertEqual(c["delta"], now[(row["slug"], c["hood"])] - was[(row["slug"], c["hood"])])

    def test_an_older_save_reads_its_cash_flow_up_to_its_own_day(self):
        between = self.runs[BETWEEN]
        flow = between["cashFlow"]
        self.assertEqual((flow["fromDay"], flow["days"]), (N, BETWEEN - N))
        self.assertEqual((flow["cashFrom"], flow["cashTo"]),
                         (self.first["kpi"]["cash"], between["kpi"]["cash"]))


if __name__ == "__main__":
    unittest.main()
