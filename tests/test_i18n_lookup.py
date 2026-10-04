"""Plural lookup keeps all forms' placeholders without scanning the catalogue."""
import unittest

from tools import i18n


class EnglishLookupTests(unittest.TestCase):
    def test_plural_uses_other_and_every_forms_placeholders(self):
        english = {
            "f.shop_other": "{n} shops",
            "f.shop_zero": "No shops in {place}",
            "f.shop_one": "A shop costs {cost:$}",
            "f.shop_two": "Two shops for {owner}",
            "f.shop_few": "A few {kind} shops",
            "f.shop_many": "Many shops since {day:day}",
            "f.shop": "Unrelated {plain}",
            "f.shop_more_one": "Unrelated {nested}",
        }
        for category in i18n.PLURAL_CATEGORIES:
            with self.subTest(category=category):
                self.assertEqual(i18n._english_for(f"f.shop_{category}", english),
                                 ("{n} shops", {"n:", "place:", "cost:$", "owner:", "kind:", "day:day"}))
        self.assertEqual(i18n._english_for("f.shop", english), ("Unrelated {plain}", {"plain:"}))

    def test_missing_category_uses_existing_forms(self):
        english = {"f.shop_one": "A shop", "f.shop_other": "{n} shops"}
        self.assertEqual(i18n._english_for("f.shop_few", english), ("{n} shops", {"n:"}))
        self.assertEqual(i18n._english_for("f.missing_few", english), (None, None))
        self.assertEqual(i18n._english_for("f.shop", english), (None, None))

    def test_partial_catalogue_fallback_keeps_insertion_order(self):
        pairs = [("f.shop_two", "Two {kind} shops"), ("f.shop_one", "A {place} shop")]
        for entries in (pairs, list(reversed(pairs))):
            with self.subTest(entries=entries):
                english = dict(entries)
                english["f.unrelated"] = "Unrelated {extra}"
                self.assertEqual(i18n._english_for("f.shop_other", english),
                                 (entries[-1][1], {"kind:", "place:"}))

    def test_empty_other_is_not_replaced_by_another_form(self):
        english = {"f.shop_other": "", "f.shop_one": "A shop"}
        self.assertEqual(i18n._english_for("f.shop_one", english), ("", set()))

    def test_catalogue_edits_are_visible_on_next_lookup(self):
        english = {"f.shop_one": "A shop", "f.shop_other": "{n} shops"}
        self.assertEqual(i18n._english_for("f.shop_few", english), ("{n} shops", {"n:"}))
        english["f.shop_other"] = "{n} shops in {place}"
        self.assertEqual(i18n._english_for("f.shop_few", english),
                         ("{n} shops in {place}", {"n:", "place:"}))
        english.clear()
        self.assertEqual(i18n._english_for("f.shop_few", english), (None, None))

    def test_complete_plural_does_not_iterate_unrelated_catalogue_entries(self):
        class NoScanDict(dict):
            def __iter__(self):
                raise AssertionError("Plural lookup must not scan the catalogue")

            def __reversed__(self):
                raise AssertionError("Complete plurals must not scan the catalogue")

            def items(self):
                raise AssertionError("Plural lookup must not scan the catalogue")

        english = NoScanDict({f"f.unrelated{i}": "Unrelated" for i in range(10000)})
        english.update({"f.shop_one": "A shop", "f.shop_other": "{n} shops"})
        self.assertEqual(i18n._english_for("f.shop_few", english), ("{n} shops", {"n:"}))


if __name__ == "__main__":
    unittest.main()
