"""_tax_pick(): Real estate's Before tax day shopping list, the subset of listings
whose prices sum closest to the target from below, fewer buildings within the slack."""
import itertools
import random
import time
import unittest

from ba_dashboard import _tax_pick  # noqa: E402
from tests._seeds import under_seeds


def brute_pick_score(items, target, slack):
    candidates = []
    for count in range(len(items) + 1):
        for subset in itertools.combinations(items, count):
            total = sum(price for _, price in subset)
            if total <= target:
                candidates.append((count, total))
    best = max(total for _, total in candidates)
    return min((count, -total) for count, total in candidates
               if total >= best - slack)


class TaxPickTests(unittest.TestCase):
    def assert_valid(self, items, target, result):
        keys, total = result
        prices = dict(items)
        self.assertEqual(len(keys), len(set(keys)))
        self.assertEqual(total, sum(prices[key] for key in keys))
        self.assertLessEqual(total, target)
        self.assertEqual(keys, sorted(keys, key=lambda key: (-prices[key], key)))

    def test_empty_and_nothing_fits(self):
        for items, target in [([], 100), ([('a', 101)], 100),
                              ([('a', 1)], 0)]:
            self.assertEqual(_tax_pick(items, target, 0), ([], 0))

    def test_exact_hit(self):
        items = [('a', 7), ('b', 5), ('c', 3)]
        self.assertEqual(_tax_pick(items, 10, 0), (['a', 'c'], 10))

    def test_fewer_items_within_slack(self):
        items = [('one', 99_000), ('a', 40_000),
                 ('b', 35_000), ('c', 24_990)]
        self.assertEqual(_tax_pick(items, 100_000, 5_000), (['one'], 99_000))
        self.assertEqual(_tax_pick(items, 100_000, 500),
                         (['a', 'b', 'c'], 99_990))

    def test_larger_total_with_same_count(self):
        self.assertEqual(_tax_pick([('a', 80), ('b', 90)], 100, 20),
                         (['b'], 90))

    def test_exact_hit_still_prefers_fewer_within_slack(self):
        items = [('one', 99), ('a', 60), ('b', 40)]
        self.assertEqual(_tax_pick(items, 100, 1), (['one'], 99))

    def test_empty_subset_can_win_with_slack(self):
        self.assertEqual(_tax_pick([('a', 10)], 100, 10), ([], 0))
        self.assertEqual(_tax_pick([('a', 10)], 10, 10), ([], 0))

    def test_order_and_duplicate_prices(self):
        items = [('d', 8), ('c', 8), ('b', 5), ('a', 5)]
        expected = _tax_pick(items, 13, 0)
        for permutation in itertools.permutations(items):
            result = _tax_pick(list(permutation), 13, 0)
            self.assertEqual(result, expected)
            self.assert_valid(items, 13, result)

    def test_seeded_small_cases_match_brute_force(self):
        for seed in range(100):
            rng = random.Random(seed)
            items = [(f'key{i:02}', rng.randint(1, 100))
                     for i in range(rng.randint(0, 14))]
            target = rng.randint(0, sum(price for _, price in items) + 50)
            slack = rng.randint(0, 50)
            with self.subTest(seed=seed, target=target, slack=slack):
                result = _tax_pick(items, target, slack)
                self.assert_valid(items, target, result)
                self.assertEqual((len(result[0]), -result[1]),
                                 brute_pick_score(items, target, slack))
                rng.shuffle(items)
                self.assertEqual(_tax_pick(items, target, slack), result)

    def test_sixteen_items_match_brute_force(self):
        rng = random.Random(1600)
        items = [(str(i), rng.randint(1, 100)) for i in range(16)]
        result = _tax_pick(items, 417, 9)
        self.assert_valid(items, 417, result)
        self.assertEqual((len(result[0]), -result[1]),
                         brute_pick_score(items, 417, 9))

    def test_hash_seed_does_not_change_result(self):
        code = (
            'from tests.test_tax_pick import _tax_pick; '
            'import random; rng = random.Random(73); '
            'items = [(str(i), rng.randint(1, 90) * 1000000) '
            'for i in range(1000)]; '
            'print(_tax_pick(items, 31900000, 5000))'
        )
        outputs = under_seeds(code, seeds=('0', '1', '12345'))
        self.assertEqual(outputs, [outputs[0]] * len(outputs))

    def test_sixteen_items_within_the_capped_budget_match_brute_force(self):
        # A full search of 16 items is 2^17 nodes; the budget is capped at
        # four times TAX_PICK_NODES, so these cases hold the pruning to it.
        for seed in range(30):
            rng = random.Random(16_000 + seed)
            items = [(f'k{i:02}', rng.randint(1_000_000, 40_000_000)) for i in range(16)]
            target = rng.randint(10_000_000, sum(p for _, p in items) - 1)
            slack = rng.choice((0, 1_000, target // 500))
            with self.subTest(seed=seed):
                result = _tax_pick(items, target, slack)
                self.assert_valid(items, target, result)
                self.assertEqual((len(result[0]), -result[1]),
                                 brute_pick_score(items, target, slack))

    def test_large_target_returns_every_item(self):
        items = [(f'key{i:04}', i + 1) for i in range(1000)]
        total = sum(price for _, price in items)
        result = _tax_pick(items, total + 100, 0)
        self.assertEqual(result, ([key for key, _ in reversed(items)], total))

    def test_slack_when_every_item_fits(self):
        items = [('a', 8), ('b', 5), ('c', 3)]
        self.assertEqual(_tax_pick(items, 100, 3), (['a', 'b'], 13))

    def test_large_list_is_bounded_and_deterministic(self):
        rng = random.Random(1000)
        items = [(f'key{i:04}', rng.randint(1_000_000, 90_000_000))
                 for i in range(1000)]
        for target in (0, 5_000_000, 31_900_000, 100_000_000, 2_000_000_000):
            with self.subTest(target=target):
                start = time.perf_counter()
                result = _tax_pick(items, target, 5_000)
                elapsed = time.perf_counter() - start
                self.assertLess(elapsed, 0.2)
                self.assert_valid(items, target, result)
                rng.shuffle(items)
                self.assertEqual(_tax_pick(items, target, 5_000), result)


if __name__ == '__main__':
    unittest.main()
