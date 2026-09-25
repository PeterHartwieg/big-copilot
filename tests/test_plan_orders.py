"""Run the shipped JavaScript order arithmetic under Node, with no browser deps."""
import json
import re
import subprocess
import unittest

from ba_dashboard import TEMPLATE


class CompanyOrderRegressions(unittest.TestCase):
    def test_company_order_scenarios(self):
        match = re.search(r"function planOrder\([^)]*\)\{.*?\n\}", TEMPLATE, re.S)
        self.assertIsNotNone(match, "Planner must expose its actual order calculation")
        # One 15% chain margin on what the range adds, rounded up to tens:
        # the same margin and rounding as every other supply figure.
        cases = [
            ("unchanged shared ingredient", 168000, 168000, 262000, 262000, 0),
            ("new range preserves other factories", 42000, 0, 262000, 310300, 48300),
            ("add machine to existing range", 210000, 168000, 262000, 310300, 48300),
            ("remove selected machine", 126000, 168000, 262000, 213700, -48300),
            ("new ingredient", 25200, 0, None, 28980, 28980),
            ("round new order up to tens", 25123, 0, None, 28900, 28900),
            ("existing line without a contract", 25200, 25200, None, 28980, 28980),
            ("existing line with only paused orders", 25200, 25200, 0, 28980, 28980),
            ("empty plan", 0, 0, None, 0, 0),
        ]
        # With what the imports feed now (`used`): stock ordered beyond that and
        # its margin is ordered ahead, and an added layout draws on it first.
        with_use = [
            ("ordered ahead covers the plan", 120960, 20160, 151300, 21600, 151300, 0),
            ("ordered ahead covers part", 60480, 10080, 20200, 3000, 69560, 49360),
            ("nothing ahead: the whole addition", 42000, 0, 262000, 262000, 310300, 48300),
            ("untouched range keeps the order", 168000, 168000, 262000, 100000, 262000, 0),
        ]
        script = match.group(0) + "\nconst cases = " + json.dumps(cases) + ";\n"
        script += "console.log(JSON.stringify(cases.map(c => planOrder(c[1], c[2], c[3], 0.15, 10))));"
        output = subprocess.run(["node", "-e", script], check=True, text=True, capture_output=True)
        for case, actual in zip(cases, json.loads(output.stdout)):
            with self.subTest(case=case[0]):
                self.assertEqual(actual, {"target": case[4], "gap": case[5]})
        script = match.group(0) + "\nconst cases = " + json.dumps(with_use) + ";\n"
        script += "console.log(JSON.stringify(cases.map(c => planOrder(c[1], c[2], c[3], 0.15, 10, c[4]))));"
        output = subprocess.run(["node", "-e", script], check=True, text=True, capture_output=True)
        for case, actual in zip(with_use, json.loads(output.stdout)):
            with self.subTest(case=case[0]):
                self.assertEqual(actual, {"target": case[5], "gap": case[6]})


if __name__ == "__main__":
    unittest.main()
