"""A depot that feeds two kinds of shop equally joins one chain, whatever the hash seed."""
import os
import subprocess
import sys
import unittest

from ba_dashboard import COST_KEYS, _chains
from ba_save import Save

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def site(street, status, type_slug, kind):
    record = {"key": f"{street}#1", "name": street, "status": status, "typeSlug": type_slug,
              "type": kind, "revenue": 100.0, "profit": 10.0, "staff": 1}
    record.update({k: 1.0 for k in COST_KEYS})
    return record


def destination(street, lines):
    return {"deliveryTargetAddress": {"streetName": street, "streetNumber": 1},
            "stockTargets": {"$items": [{} for _ in range(lines)]}}


def depot_chain():
    """The depot feeds three lines to a gift shop and three to an electronics store."""
    businesses = [
        site("depot", "warehouse", None, "Warehouse"),
        site("gifts", "retail", "ba:businesstype_giftshop", "Gift Shop"),
        site("gadgets", "retail", "ba:businesstype_electronicsstore", "Electronics Store"),
    ]
    plan = {"targetAddress": {"streetName": "depot", "streetNumber": 1},
            "destinations": {"$items": [destination("gifts", 3), destination("gadgets", 3)]}}
    save = Save({"logisticsManagerPlans": {"$items": [plan]}}, {}, "")
    chains = _chains(save, businesses, [])
    return next(c["name"] for c in chains if "depot#1" in c["sites"])


class ChainTieTests(unittest.TestCase):
    def test_a_tie_goes_to_the_kind_of_shop_named_first(self):
        # ba:businesstype_electronicsstore sorts before ba:businesstype_giftshop.
        self.assertEqual(depot_chain(), "Electronics Stores")

    def test_the_choice_does_not_depend_on_the_hash_seed(self):
        script = "from tests.test_chain_ties import depot_chain; print(depot_chain())"
        names = set()
        for seed in ("1", "2", "3", "4", "5", "6"):
            env = dict(os.environ, PYTHONHASHSEED=seed)
            result = subprocess.run([sys.executable, "-c", script], cwd=ROOT, env=env,
                                    capture_output=True, text=True, check=True)
            names.add(result.stdout.strip())
        self.assertEqual(names, {"Electronics Stores"})


if __name__ == "__main__":
    unittest.main()
