"""The company's own costs, which no site's statement carries.

The Portfolio adds up the sites; Today's Profit tile is the company's
`totalProfit`. The gap between them is loan payments, health insurance, the
player's homes and parking, less real estate income and the player's salary,
and the daily row carries each so the Portfolio can say so. Synthetic numbers
only.
"""
import os
import tempfile
import unittest

from ba_dashboard import _daily_series, extract
from ba_save import Names, Save, load_save
from tests import save_fixtures as F
from tests.es3_fixture import address, encode


def summary(day=72, **over):
    row = {
        "dayNumber": day,
        "totalBusinessProfit": 100000.0,
        "totalLoanExpenses": -900.0,
        "totalHealthInsuranceExpenses": -450.5,
        # The game books this one as a positive number.
        "totalResidentialExpenses": 100.0,
        "parkingFees": -50.0,
        "totalRealEstate": 2949.98,
        "salaryIncome": 250.0,
        "totalProfit": 101699.48,
        "businessIncomeStatements": {"$items": [
            {"TotalSales": 150000.0, "TotalResources": 30000.0, "SalaryExpenses": 15000.0,
             "RentExpenses": 4000.0, "MarketingExpenses": 1000.0, "Theft": 0.0},
        ]},
    }
    row.update(over)
    return row


class CompanyCostTests(unittest.TestCase):
    def test_the_daily_row_itemises_what_the_company_pays(self):
        [row] = _daily_series(Save({}, {}, ""), [summary()])
        self.assertEqual((row["business"], row["profit"]), (100000.0, 101699.48))
        self.assertEqual((row["loans"], row["insurance"], row["homes"], row["parking"]),
                         (900.0, 450.5, 100.0, 50.0))
        self.assertEqual((row["realEstate"], row["salary"]), (2949.98, 250.0))

    def test_the_items_account_for_the_whole_gap(self):
        [row] = _daily_series(Save({}, {}, ""), [summary()])
        outside = row["business"] - row["profit"]
        self.assertAlmostEqual(
            outside, row["loans"] + row["insurance"] + row["homes"] + row["parking"]
            - row["realEstate"] - row["salary"])

    def test_an_older_save_without_the_fields_reads_zero(self):
        old = summary()
        for key in ("totalHealthInsuranceExpenses", "totalResidentialExpenses", "parkingFees",
                    "totalRealEstate", "salaryIncome"):
            del old[key]
        [row] = _daily_series(Save({}, {}, ""), [old])
        self.assertEqual((row["insurance"], row["homes"], row["parking"]), (0, 0, 0))
        self.assertEqual((row["realEstate"], row["salary"]), (0, 0))


class SitesAddUpTests(unittest.TestCase):
    """The Portfolio's sites, with what was booked before a business opened,
    are the game's business profit (issue #430)."""

    def payload(self, opened_today=(), given_up=()):
        tree = F.data_company()
        for reg in tree["BuildingRegistrations"]:
            where = (reg["StreetName"], reg["StreetNumber"])
            if where in opened_today:
                # The lease stood (and paid rent) yesterday; its business was set up today.
                reg["creationDay"] = F.DAY
            if where in given_up:
                # Traded yesterday, given up today: the registration stays, not rented.
                reg["RentedByPlayer"] = False
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "sites.hsg")
            with open(path, "wb") as fh:
                fh.write(encode(tree))
            return extract(load_save(path), Names(F.data_names()), None)

    def total(self, payload):
        return (sum(b["profit"] + b["profitBefore"] for b in payload["businesses"])
                + sum(g["profit"] for g in payload["sitesGone"]))

    def booked(self, payload, where):
        yesterday = next(s for s in F.data_company()["financialSummaries"]
                         if s["dayNumber"] == payload["daily"][-1]["day"])
        return next(st["TotalProfit"] for st in yesterday["businessIncomeStatements"]
                    if st["Address"] == address(*where))

    def test_every_site_trading_since_before_yesterday_adds_up(self):
        p = self.payload()
        self.assertTrue(all(b["profitBefore"] == 0 for b in p["businesses"]))
        self.assertEqual(p["sitesGone"], [])
        self.assertAlmostEqual(self.total(p), p["daily"][-1]["business"], delta=0.05)

    def test_a_business_opened_today_keeps_yesterdays_statement_apart(self):
        p = self.payload(opened_today=[F.GIFTS])
        gifts = next(b for b in p["businesses"] if b["key"] == f"{F.GIFTS[0]}#{F.GIFTS[1]}")
        booked = self.booked(p, F.GIFTS)
        # Not this business's own takings (Open a store reads them)...
        self.assertEqual((gifts["profit"], gifts["revenue"]), (0, 0))
        # ...but still the company's, so the footer can show it.
        self.assertAlmostEqual(gifts["profitBefore"], booked, places=2)
        self.assertNotEqual(booked, 0)
        self.assertAlmostEqual(self.total(p), p["daily"][-1]["business"], delta=0.05)

    def test_sites_given_up_today_keep_yesterdays_statement_in_the_footer(self):
        # The gift shop made money yesterday; the import hub only paid rent.
        p = self.payload(given_up=[F.GIFTS, F.HUB])
        keys = {b["key"] for b in p["businesses"]}
        self.assertNotIn(f"{F.GIFTS[0]}#{F.GIFTS[1]}", keys)
        gifts, hub = self.booked(p, F.GIFTS), self.booked(p, F.HUB)
        self.assertGreater(gifts, 0)
        self.assertLess(hub, 0)
        self.assertEqual(sorted(g["profit"] for g in p["sitesGone"]), sorted([round(gifts, 2), round(hub, 2)]))
        self.assertTrue(all(g["name"] for g in p["sitesGone"]))
        self.assertAlmostEqual(self.total(p), p["daily"][-1]["business"], delta=1)


if __name__ == "__main__":
    unittest.main()
