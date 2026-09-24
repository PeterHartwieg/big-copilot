"""The release a page announces is the newest changelog entry, first listed on a tie."""

import json
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import build_web


def entry(pr, date):
    return {"pr": pr, "date": date, "title": f"Change {pr}", "summary": "What changed."}


class ReleaseLatestTest(unittest.TestCase):
    def latest(self, changes):
        with tempfile.TemporaryDirectory() as root:
            os.makedirs(os.path.join(root, "web"))
            with open(os.path.join(root, "web", "changelog.json"), "w", encoding="utf-8") as fh:
                json.dump(changes, fh)
            with mock.patch.object(build_web, "stamp", return_value="0000000000"):
                return build_web.release_info(root)["latest"]

    def test_the_newest_date_wins(self):
        self.assertEqual(self.latest([entry(5, "2026-09-20"), entry(4, "2026-09-24")])["pr"], 4)

    def test_on_one_date_the_first_listed_wins_over_a_higher_pr(self):
        self.assertEqual(self.latest([entry(82, "2026-09-24"), entry(83, "2026-09-24"), entry(77, "2026-09-23")])["pr"], 82)

    def test_an_empty_changelog_announces_nothing(self):
        self.assertIsNone(self.latest([]))


if __name__ == "__main__":
    unittest.main()
