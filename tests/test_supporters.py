"""tools/supporters.py: the public supporters list from the private ledger."""
import json
from pathlib import Path
import unittest

from tools.supporters import ranking, render

ROOT = Path(__file__).resolve().parents[1]


def row(date, email, amount, listed=""):
    return {"date": date, "email": email, "amount_eur": amount, "listed_as": listed}


class Ranking(unittest.TestCase):
    def test_totals_rank_and_the_first_gift_breaks_a_tie(self):
        rows = [row("2026-09-01", "a@x", "10"), row("2026-09-02", "b@x", "15"),
                row("2026-09-03", "a@x", "10"), row("2026-08-30", "c@x", "15")]
        # a: 20; c and b tie at 15, c gave first.
        self.assertEqual(ranking(rows), [None, None, None])
        rows[0]["listed_as"] = "Ann A."
        rows[1]["listed_as"] = "Bob B."
        rows[3]["listed_as"] = "Cat C."
        self.assertEqual(ranking(rows), ["Ann A.", "Cat C.", "Bob B."])

    def test_the_latest_answer_counts_and_anonymous_withdraws(self):
        rows = [row("2026-09-01", "A@x", "5", "Ann A."), row("2026-09-05", "a@x ", "5", "anonymous")]
        self.assertEqual(ranking(rows), [None])

    def test_a_comma_decimal_is_read(self):
        self.assertEqual(ranking([row("2026-09-01", "a@x", "2,50"), row("2026-09-01", "b@x", "2.40", "B.")]),
                         [None, "B."])

    def test_the_public_file_holds_no_amount_or_email(self):
        text = render(ranking([row("2026-09-01", "secret@x", "123.45", "Ann A.")]))
        self.assertNotIn("secret@x", text)
        self.assertNotIn("123", text)
        self.assertEqual(json.loads(text)["supporters"], ["Ann A."])

    def test_the_committed_file_is_in_the_written_shape(self):
        text = (ROOT / "web" / "supporters.json").read_text(encoding="utf-8")
        self.assertEqual(text, render(json.loads(text)["supporters"]))
