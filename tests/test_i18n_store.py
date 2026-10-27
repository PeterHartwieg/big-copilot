"""i18n/base.json, every language's English and draft marks in one file:
what load(), drafted() and save() read and write, and `fold`, which takes in
the per-language files it replaced (tools/i18n.py's docstring)."""
import json
import os
import tempfile
import unittest

from tools import i18n

ENGLISH = {"f.a": "Lost {w:$}", "f.b": "No staff", "f.c": "Fresh", "f.d": "Closed"}


class Tree:
    """A checkout's i18n/ folder in a temporary directory."""

    def __init__(self, tables, store=None, legacy=None):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name
        os.makedirs(self.path(""))
        for lang, table in tables.items():
            self.write(f"{lang}.json", table)
        if store is not None:
            with open(self.path(i18n.BASE_FILE), "w", encoding="utf-8") as fh:
                fh.write(i18n._dump_store(store))
        for name, data in (legacy or {}).items():
            self.write(name, data)

    def path(self, name):
        return os.path.join(self.root, "i18n", name)

    def write(self, name, data):
        with open(self.path(name), "w", encoding="utf-8") as fh:
            json.dump(data, fh)

    def store(self):
        with open(self.path(i18n.BASE_FILE), encoding="utf-8") as fh:
            return json.load(fh)

    def text(self):
        with open(self.path(i18n.BASE_FILE), encoding="utf-8") as fh:
            return fh.read()

    def close(self):
        self.tmp.cleanup()


class StoreTests(unittest.TestCase):
    def tree(self, tables, store=None, legacy=None):
        tree = Tree(tables, store, legacy)
        self.addCleanup(tree.close)
        return tree

    def test_each_language_reads_back_what_it_saved(self):
        tree = self.tree({"de": {"f.a": "Verlust {w:$}", "f.b": "Niemand"},
                          "fr": {"f.a": "Perte {w:$}", "f.b": "Personne", "f.c": "Frais"},
                          "ru": {"f.a": "Убыток {w:$}", "f.b": "Никого"}})
        shares = {"de": ({"f.a": "Lost {w:$}", "f.b": "No staff"}, {"f.a": "gpt"}),
                  "fr": ({"f.a": "Lost {w:$}", "f.b": "No staff before", "f.c": "Fresh", "f.d": "Closed"}, {}),
                  "ru": ({"f.a": "Lost {w:$}"}, {"f.a": "gpt", "f.b": "codex"})}
        for lang, (base, marks) in shares.items():
            i18n.save(lang, base=base, marks=marks, root=tree.root)
        for lang, (base, marks) in shares.items():
            self.assertEqual(i18n.load(lang, tree.root)[1], base, lang)
            self.assertEqual(i18n.drafted(lang, tree.root), marks, lang)
        self.assertEqual(tree.store(), {
            # Shared by all three, so stored once.
            "f.a": {"en": "Lost {w:$}", "ai": {"de": "gpt", "ru": "gpt"}},
            # On a tie the first language's English is shared; ru translated
            # f.b with none recorded, so it stays stale.
            "f.b": {"en": "No staff", "was": {"fr": "No staff before", "ru": None}, "ai": {"ru": "codex"}},
            "f.c": {"en": "Fresh"},
            # fr keeps an English for a key it does not translate: a leftover.
            "f.d": {"was": {"fr": "Closed"}}})
        lines = tree.text().splitlines()
        self.assertEqual((lines[0], lines[-1], len(lines)), ("{", "}", 6), "one key a line")

    def test_saving_one_language_leaves_the_others_as_they_were(self):
        tree = self.tree({"de": {"f.a": "x"}, "fr": {"f.a": "x"}, "it": {"f.a": "x"}},
                         {"f.a": {"en": "Lost {w:$}", "was": {"de": "Lost {w:$} today"}}})
        # it now agrees with de: their English becomes the shared one, and fr keeps its own.
        i18n.save("it", base={"f.a": "Lost {w:$} today"}, root=tree.root)
        self.assertEqual(tree.store(), {"f.a": {"en": "Lost {w:$} today", "was": {"fr": "Lost {w:$}"}}})
        self.assertEqual({lang: i18n.load(lang, tree.root)[1] for lang in ("de", "fr", "it")},
                         {"de": {"f.a": "Lost {w:$} today"}, "fr": {"f.a": "Lost {w:$}"},
                          "it": {"f.a": "Lost {w:$} today"}})

    def test_a_table_saved_without_its_base_keeps_the_base_as_it_was(self):
        tree = self.tree({"de": {"f.a": "x"}, "fr": {"f.a": "x"}}, {"f.a": {"en": "Lost {w:$}"}})
        # A key that leaves the table keeps its English as a leftover; one that
        # joins it has none recorded, as before base.json.
        i18n.save("de", table={"f.b": "Niemand"}, root=tree.root)
        self.assertEqual(i18n.load("de", tree.root), ({"f.b": "Niemand"}, {"f.a": "Lost {w:$}"}))
        self.assertEqual(i18n.load("fr", tree.root)[1], {"f.a": "Lost {w:$}"})

    def test_the_last_english_and_mark_take_the_file_with_them(self):
        tree = self.tree({"de": {"f.a": "x"}}, {"f.a": {"en": "Lost {w:$}", "ai": {"de": "gpt"}}})
        i18n.save("de", table={}, base={}, marks={}, root=tree.root)
        self.assertFalse(os.path.exists(tree.path(i18n.BASE_FILE)))
        self.assertEqual(i18n.load("de", tree.root), ({}, {}))

    def test_an_english_no_language_takes_is_unused_until_tidied(self):
        tree = self.tree({"de": {"f.a": "x"}, "fr": {"f.a": "x"}},
                         {"f.a": {"en": "Lost {w:$}"}, "f.b": {"en": "No staff", "ai": {"de": "gpt"}},
                          "f.c": {"en": "Fresh", "was": {"de": "Fresh before"}}})
        self.assertEqual(i18n.unused(tree.root), ["f.b", "f.c"])
        self.assertEqual(i18n.languages(tree.root), ["de", "fr"])
        self.assertEqual(i18n.tidy(tree.root), ["f.b", "f.c"])
        self.assertEqual(tree.store(), {"f.a": {"en": "Lost {w:$}"}, "f.b": {"ai": {"de": "gpt"}},
                                        "f.c": {"was": {"de": "Fresh before"}}})
        self.assertEqual(i18n.unused(tree.root), [])

    def test_a_malformed_entry_is_refused(self):
        tree = self.tree({"de": {}}, {"f.a": {"en": "Lost", "xx": 1}})
        with self.assertRaisesRegex(i18n.CatalogueError, "base.json"):
            i18n.load("de", tree.root)


class FoldTests(unittest.TestCase):
    def test_fold_takes_the_old_files_in_and_deletes_them(self):
        # A branch from before base.json drafted f.c and redid f.a for a changed
        # English; main meanwhile reviewed f.b and recorded a newer f.d.
        tree = Tree({"de": {"f.a": "Verlust {w:$}", "f.b": "Niemand", "f.c": "Frisch", "f.d": "Zu"},
                     "fr": {"f.a": "Perte", "f.b": "Personne"}},
                    {"f.a": {"en": "Lost {w:$} yesterday"}, "f.b": {"en": "No staff"},
                     "f.d": {"was": {"de": "Closed"}}},
                    {"de.base.json": {"f.a": "Lost {w:$}", "f.b": "No staff", "f.c": "Fresh", "f.d": "Closed before"},
                     "de.ai.json": {"f.a": "gpt", "f.b": "gpt", "f.c": "gpt", "f.gone": "gpt"}})
        self.addCleanup(tree.close)
        with self.assertRaisesRegex(i18n.CatalogueError, "fold"):
            i18n.load("de", tree.root)
        self.assertEqual(i18n.languages(tree.root), ["de", "fr"])
        taken = i18n.fold(ENGLISH, tree.root)
        self.assertEqual(taken, {"de": ["f.a", "f.c", "f.gone"]})
        self.assertEqual(sorted(os.listdir(tree.path(""))), ["base.json", "de.json", "fr.json"])
        self.assertEqual(i18n.load("de", tree.root)[1],
                         {"f.a": "Lost {w:$}", "f.b": "No staff", "f.c": "Fresh", "f.d": "Closed"})
        self.assertEqual(i18n.drafted("de", tree.root), {"f.a": "gpt", "f.c": "gpt", "f.gone": "gpt"})
        self.assertEqual(i18n.load("fr", tree.root)[1], {"f.a": "Lost {w:$} yesterday", "f.b": "No staff"})
        self.assertEqual(i18n.fold(ENGLISH, tree.root), {}, "nothing left to fold")


if __name__ == "__main__":
    unittest.main()
