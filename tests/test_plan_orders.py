"""Run the shipped JavaScript order arithmetic under Node, with no browser deps:
the whole board script, loaded by tests/_board.cjs."""
import json
import subprocess
import unittest
from pathlib import Path

LOADER = Path(__file__).resolve().parent / "_board.cjs"


class CompanyOrderRegressions(unittest.TestCase):
    def test_company_order_scenarios(self):
        cases = [
            ("unchanged shared ingredient", 168000, 168000, 262000, 262000, 0),
            ("new range preserves other factories", 42000, 0, 262000, 304000, 42000),
            ("add machine to existing range", 210000, 168000, 262000, 304000, 42000),
            ("remove selected machine", 126000, 168000, 262000, 220000, -42000),
            ("new ingredient", 25200, 0, None, 25200, 25200),
            ("round new order up", 25123, 0, None, 25200, 25200),
            ("existing line without a contract", 25200, 25200, None, 25200, 25200),
            ("existing line with only paused orders", 25200, 25200, 0, 25200, 25200),
            ("empty plan", 0, 0, None, 0, 0),
        ]
        script = ("const {planOrder} = require(" + json.dumps(str(LOADER)) + ").loadBoard();\n"
                  "const cases = " + json.dumps(cases) + ";\n"
                  "console.log(JSON.stringify(cases.map(c => planOrder(c[1], c[2], c[3]))));")
        output = subprocess.run(["node", "-e", script], check=True, text=True, capture_output=True)
        for case, actual in zip(cases, json.loads(output.stdout)):
            with self.subTest(case=case[0]):
                self.assertEqual(actual, {"target": case[4], "gap": case[5]})


if __name__ == "__main__":
    unittest.main()
