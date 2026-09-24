"""The company's own costs, which no site's statement carries.

The Portfolio adds up the sites; Today's Profit tile is the company's
`totalProfit`. The gap between them is loan payments, health insurance, the
player's homes and parking, and the daily row carries each so the Portfolio can
say so. Synthetic numbers only.
"""
import unittest

from ba_dashboard import _daily_series
from ba_save import Save


def summary(day=72, **over):
    row = {
        "dayNumber": day,
        "totalBusinessProfit": 100000.0,
        "totalLoanExpenses": -900.0,
        "totalHealthInsuranceExpenses": -450.5,
        # The game books this one as a positive number.
        "totalResidentialExpenses": 100.0,
        "parkingFees": -50.0,
        "totalProfit": 98499.5,
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
        self.assertEqual((row["business"], row["profit"]), (100000.0, 98499.5))
        self.assertEqual((row["loans"], row["insurance"], row["homes"], row["parking"]),
                         (900.0, 450.5, 100.0, 50.0))

    def test_the_items_account_for_the_whole_gap(self):
        [row] = _daily_series(Save({}, {}, ""), [summary()])
        outside = row["business"] - row["profit"]
        self.assertAlmostEqual(
            outside, row["loans"] + row["insurance"] + row["homes"] + row["parking"])

    def test_an_older_save_without_the_fields_reads_zero(self):
        old = summary()
        for key in ("totalHealthInsuranceExpenses", "totalResidentialExpenses", "parkingFees"):
            del old[key]
        [row] = _daily_series(Save({}, {}, ""), [old])
        self.assertEqual((row["insurance"], row["homes"], row["parking"]), (0, 0, 0))


if __name__ == "__main__":
    unittest.main()
