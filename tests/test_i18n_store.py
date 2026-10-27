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
            "f.a": {"en": "Lost {w:$}", "of": ["de", "fr", "ru"], "ai": {"de": "gpt", "ru": "gpt"}},
            # On a tie the first language's English is the shared one. ru
            # translated f.b with no English recorded, so it names ru nowhere.
            "f.b": {"en": "No staff", "of": ["de"], "was": {"fr": "No staff before"}, "ai": {"ru": "codex"}},
            "f.c": {"en": "Fresh", "of": ["fr"]},
            # fr keeps an English for a key it does not translate: a leftover prune drops.
            "f.d": {"en": "Closed", "of": ["fr"]}})
        lines = tree.text().splitlines()
        self.assertEqual((lines[0], lines[-1], len(lines)), ("{", "}", 6), "one key a line")

    def test_saving_one_language_leaves_the_others_as_they_were(self):
        tree = self.tree({}, {"f.a": {"en": "Lost {w:$}", "of": ["fr", "it"], "was": {"de": "Lost {w:$} today"}}})
        # it now agrees with de: their English becomes the shared one, and fr keeps its own.
        i18n.save("it", base={"f.a": "Lost {w:$} today"}, root=tree.root)
        self.assertEqual(tree.store(), {"f.a": {"en": "Lost {w:$} today", "of": ["de", "it"],
                                                "was": {"fr": "Lost {w:$}"}}})
        self.assertEqual({lang: i18n.load(lang, tree.root)[1] for lang in ("de", "fr", "it")},
                         {"de": {"f.a": "Lost {w:$} today"}, "fr": {"f.a": "Lost {w:$}"},
                          "it": {"f.a": "Lost {w:$} today"}})

    def test_an_english_belongs_to_the_languages_it_names_whatever_their_tables_hold(self):
        # de translated f.a by hand and fr dropped it by hand, outside the tool:
        # de has no English recorded (stale until accepted) and fr keeps one (a
        # leftover), as with the per-language files.
        tree = self.tree({"de": {"f.a": "Verlust {w:$}"}, "fr": {}}, {"f.a": {"en": "Lost {w:$}", "of": ["fr"]}})
        self.assertEqual(i18n.load("de", tree.root), ({"f.a": "Verlust {w:$}"}, {}))
        self.assertEqual(i18n.load("fr", tree.root), ({}, {"f.a": "Lost {w:$}"}))
        self.assertEqual(i18n.shipped("de", ENGLISH, tree.root), {}, "stale: it ships nothing")

    def test_a_table_saved_without_its_base_keeps_the_base_as_it_was(self):
        tree = self.tree({"de": {"f.a": "x"}, "fr": {"f.a": "x"}}, {"f.a": {"en": "Lost {w:$}", "of": ["de", "fr"]}})
        i18n.save("de", table={"f.b": "Niemand"}, root=tree.root)
        self.assertEqual(i18n.load("de", tree.root), ({"f.b": "Niemand"}, {"f.a": "Lost {w:$}"}))
        self.assertEqual(i18n.load("fr", tree.root)[1], {"f.a": "Lost {w:$}"})

    def test_the_last_english_and_mark_take_the_file_with_them(self):
        tree = self.tree({"de": {"f.a": "x"}}, {"f.a": {"en": "Lost {w:$}", "of": ["de"], "ai": {"de": "gpt"}}})
        i18n.save("de", table={}, base={}, marks={}, root=tree.root)
        self.assertFalse(os.path.exists(tree.path(i18n.BASE_FILE)))
        self.assertEqual(i18n.load("de", tree.root), ({}, {}))

    def test_a_malformed_entry_is_refused(self):
        for entry in ({"en": "Lost", "of": ["de"], "xx": 1}, {"en": "Lost"}, {"of": ["de"]}, {},
                      {"en": "Lost", "of": ["de"], "was": {"de": "Lost before"}}, {"was": {"de": None}}):
            tree = self.tree({"de": {}}, {"f.a": entry})
            with self.assertRaisesRegex(i18n.CatalogueError, "base.json", msg=entry):
                i18n.load("de", tree.root)


class FoldTests(unittest.TestCase):
    def tree(self, tables, store, legacy):
        tree = Tree(tables, store, legacy)
        self.addCleanup(tree.close)
        return tree

    def test_fold_takes_the_old_files_in_and_deletes_them(self):
        # A branch from before base.json drafted f.c and redid f.a for a changed
        # English; main meanwhile reviewed f.b and recorded a newer f.d.
        tree = self.tree({"de": {"f.a": "Verlust {w:$}", "f.b": "Niemand", "f.c": "Frisch", "f.d": "Zu"},
                          "fr": {"f.a": "Perte", "f.b": "Personne"}},
                         {"f.a": {"en": "Lost {w:$} yesterday", "of": ["de", "fr"]},
                          "f.b": {"en": "No staff", "of": ["de", "fr"]}, "f.d": {"en": "Closed", "of": ["de"]}},
                         {"de.base.json": {"f.a": "Lost {w:$}", "f.b": "No staff", "f.c": "Fresh",
                                           "f.d": "Closed before"},
                          "de.ai.json": {"f.a": "gpt", "f.b": "gpt", "f.c": "gpt", "f.gone": "gpt"}})
        with self.assertRaisesRegex(i18n.CatalogueError, "fold"):
            i18n.load("de", tree.root)
        self.assertEqual(i18n.languages(tree.root), ["de", "fr"])
        main = {"de": {"f.a": "Verlust {w:$} gestern", "f.b": "Niemand", "f.d": "Zu"},
                "fr": {"f.a": "Perte", "f.b": "Personne"}}
        taken = i18n.fold(ENGLISH, tree.root, main)
        # f.b keeps main's review: the wording is main's, and the branch's mark predates it.
        self.assertEqual(taken, {"de": {"bases": ["f.a", "f.c"], "marked": ["f.a", "f.c", "f.gone"], "unmarked": []}})
        self.assertEqual(sorted(os.listdir(tree.path(""))), ["base.json", "de.json", "fr.json"])
        self.assertEqual(i18n.load("de", tree.root)[1],
                         {"f.a": "Lost {w:$}", "f.b": "No staff", "f.c": "Fresh", "f.d": "Closed"})
        self.assertEqual(i18n.drafted("de", tree.root), {"f.a": "gpt", "f.c": "gpt", "f.gone": "gpt"})
        self.assertEqual(i18n.load("fr", tree.root)[1], {"f.a": "Lost {w:$} yesterday", "f.b": "No staff"})
        self.assertEqual(i18n.fold(ENGLISH, tree.root), {}, "nothing left to fold")

    def test_fold_keeps_the_older_english_of_a_key_main_has_only_in_another_language(self):
        # Main translated f.a in French alone, from today's English. The branch
        # drafted it in German from an older English, and the merge brought
        # that German into de.json. German records no English on main, so the
        # old file's stands: the draft stays stale and marked, and never ships.
        english = {"f.a": "Lost {w:$} today"}
        tree = self.tree({"de": {"f.a": "Verlust {w:$}"}, "fr": {"f.a": "Perte {w:$} aujourd'hui"}},
                         {"f.a": {"en": "Lost {w:$} today", "of": ["fr"]}},
                         {"de.base.json": {"f.a": "Lost {w:$}"}, "de.ai.json": {"f.a": "gpt"}})
        self.assertEqual(i18n.fold(english, tree.root), {"de": {"bases": ["f.a"], "marked": ["f.a"], "unmarked": []}})
        self.assertEqual(i18n.load("de", tree.root)[1], {"f.a": "Lost {w:$}"})
        self.assertEqual(i18n.drafted("de", tree.root), {"f.a": "gpt"})
        self.assertEqual(i18n.shipped("de", english, tree.root), {}, "stale: it ships nothing")
        self.assertEqual(i18n.load("fr", tree.root)[1], {"f.a": "Lost {w:$} today"})

    def test_fold_keeps_a_review_the_branch_made(self):
        # Both sides record the same English for f.a and f.b, both drafts on
        # main. The branch ran `reviewed de f.a`, so its de.ai.json lacks f.a:
        # main's mark on it goes, and f.b stays marked.
        store = {"f.a": {"en": "Lost {w:$}", "of": ["de"], "ai": {"de": "gpt"}},
                 "f.b": {"en": "No staff", "of": ["de"], "ai": {"de": "gpt"}}}
        tables = {"de": {"f.a": "Verlust {w:$}", "f.b": "Niemand"}}
        bases = {"f.a": "Lost {w:$}", "f.b": "No staff"}
        for main in (None, tables):
            tree = self.tree(tables, store, {"de.base.json": bases, "de.ai.json": {"f.b": "gpt"}})
            self.assertEqual(i18n.fold(ENGLISH, tree.root, main),
                             {"de": {"bases": [], "marked": [], "unmarked": ["f.a"]}}, main)
            self.assertEqual(i18n.drafted("de", tree.root), {"f.b": "gpt"})
            self.assertEqual(i18n.load("de", tree.root)[1], bases)
        # Without the branch's marks file there is no telling, so main's marks stay.
        tree = self.tree(tables, store, {"de.base.json": bases})
        self.assertEqual(i18n.fold(ENGLISH, tree.root), {"de": {"bases": [], "marked": [], "unmarked": []}})
        self.assertEqual(i18n.drafted("de", tree.root), {"f.a": "gpt", "f.b": "gpt"})

    def test_fold_keeps_a_redraft_the_branch_made_over_a_review_on_main(self):
        # Main reviewed f.a's German; the branch redrafted it from the same
        # English, and the merge kept the branch's wording. Its mark wins, so
        # a later import-draft does not take the draft for a person's.
        store = {"f.a": {"en": "Lost {w:$}", "of": ["de"]}}
        legacy = {"de.base.json": {"f.a": "Lost {w:$}"}, "de.ai.json": {"f.a": "gpt-new"}}
        main = {"de": {"f.a": "Verlust {w:$} (geprüft)"}}
        for wording, main_tables, want in (
                ("Verlust {w:$} (Entwurf)", main, {"f.a": "gpt-new"}),
                ("Verlust {w:$} (Entwurf)", None, {"f.a": "gpt-new"}),
                # The merge kept main's reviewed wording: main's review stands.
                ("Verlust {w:$} (geprüft)", main, {})):
            tree = self.tree({"de": {"f.a": wording}}, store, legacy)
            got = i18n.fold(ENGLISH, tree.root, main_tables)
            self.assertEqual(got, {"de": {"bases": [], "marked": sorted(want), "unmarked": []}}, wording)
            self.assertEqual(i18n.drafted("de", tree.root), want, wording)


if __name__ == "__main__":
    unittest.main()
