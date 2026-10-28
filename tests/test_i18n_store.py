"""i18n/base.json, every language's English and draft marks in one file:
what load(), drafted() and save() read and write, and `fold`, which takes in
the per-language files it replaced, here after real git merges (tools/i18n.py's docstring)."""
import json
import os
import subprocess
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


class Repo:
    """A git repository in a temporary directory: a branch made before
    base.json, and main, which replaced the old files with it."""

    def __init__(self, case):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name
        case.addCleanup(self.tmp.cleanup)
        self.git("init", "-q", "-b", "main")

    def git(self, *args, check=True):
        env = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@example.com",
               "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@example.com"}
        out = subprocess.run(["git", "-C", self.root, "-c", "commit.gpgsign=false", *args],
                             capture_output=True, text=True, env=env)
        if check and out.returncode:
            raise AssertionError(out.stderr)
        return out

    def put(self, files):
        """Write {name under i18n/: data}; None deletes, a dict under base.json is a store."""
        os.makedirs(os.path.join(self.root, "i18n"), exist_ok=True)
        for name, data in files.items():
            path = os.path.join(self.root, "i18n", name)
            if data is None:
                if os.path.exists(path):
                    os.remove(path)
            else:
                with open(path, "w", encoding="utf-8") as fh:
                    fh.write(i18n._dump_store(data) if name == i18n.BASE_FILE else json.dumps(data, indent=1) + "\n")

    def commit(self, files, message):
        self.put(files)
        self.git("add", "-A", "i18n")
        self.git("commit", "-q", "--allow-empty", "-m", message)

    @classmethod
    def merged(cls, case, point, main, branch, *merge):
        """Commit the branch point, main's and the branch's changes, and merge
        main into the branch with `merge`'s options (unfinished by default)."""
        repo = cls(case)
        repo.commit(point, "point")
        repo.git("checkout", "-q", "-b", "branch")
        repo.commit(branch, "branch")
        repo.git("checkout", "-q", "main")
        repo.commit({**{n: None for n in point if n.endswith(i18n.LEGACY_SUFFIXES)}, **main}, "main")
        repo.git("checkout", "-q", "branch")
        repo.git("merge", *(merge or ("--no-commit", "--no-ff")), "main", check=False)
        return repo


# German f.a and f.b, both machine drafts, translated from today's English.
POINT = {"de.json": {"f.a": "Verlust {w:$}", "f.b": "Niemand"},
         "de.base.json": {"f.a": "Lost {w:$}", "f.b": "No staff"},
         "de.ai.json": {"f.a": "gpt", "f.b": "gpt"}}
STORE = {"f.a": {"en": "Lost {w:$}", "of": ["de"], "ai": {"de": "gpt"}},
         "f.b": {"en": "No staff", "of": ["de"], "ai": {"de": "gpt"}}}


class FoldTests(unittest.TestCase):
    def test_a_review_on_the_branch_survives_when_git_deletes_the_unchanged_base_file(self):
        # The branch reviewed f.a: de.base.json is as it was, so the merge
        # deletes it; only de.ai.json is left, as a conflict.
        repo = Repo.merged(self, POINT, {"base.json": STORE}, {"de.ai.json": {"f.b": "gpt"}})
        self.assertFalse(os.path.exists(os.path.join(repo.root, "i18n", "de.base.json")))
        self.assertEqual(i18n.fold(ENGLISH, repo.root), {"de": {"bases": [], "marked": [], "unmarked": ["f.a"]}})
        self.assertEqual(i18n.drafted("de", repo.root), {"f.b": "gpt"})
        self.assertEqual(i18n.load("de", repo.root)[1], POINT["de.base.json"])
        self.assertEqual(i18n.languages(repo.root), ["de"])

    def test_a_review_of_the_last_draft_survives_a_clean_merge_and_its_commit(self):
        # The branch reviewed both keys, so the old _write() deleted
        # de.ai.json; the merge is clean and leaves no old file at all.
        for merge in (("--no-commit", "--no-ff"), ("--no-edit", "--no-ff")):
            repo = Repo.merged(self, POINT, {"base.json": STORE}, {"de.ai.json": None}, *merge)
            self.assertEqual(i18n._legacy(repo.root), [])
            self.assertEqual(i18n.fold(ENGLISH, repo.root),
                             {"de": {"bases": [], "marked": [], "unmarked": ["f.a", "f.b"]}}, merge)
            self.assertEqual(i18n.drafted("de", repo.root), {}, merge)

    def test_a_redraft_on_the_branch_keeps_its_mark_over_a_review_on_main(self):
        main = {"base.json": {"f.a": {"en": "Lost {w:$}", "of": ["de"]}, "f.b": STORE["f.b"]}}
        branch = {"de.json": {"f.a": "Verlust: {w:$}", "f.b": "Niemand"},
                  "de.ai.json": {"f.a": "gpt-new", "f.b": "gpt"}}
        repo = Repo.merged(self, POINT, main, branch)
        self.assertEqual(i18n.fold(ENGLISH, repo.root), {"de": {"bases": [], "marked": ["f.a"], "unmarked": []}})
        self.assertEqual(i18n.drafted("de", repo.root), {"f.a": "gpt-new", "f.b": "gpt"})

    def test_a_review_on_main_stands_against_the_branch_s_older_mark(self):
        main = {"base.json": {"f.a": {"en": "Lost {w:$}", "of": ["de"]}, "f.b": STORE["f.b"]}}
        repo = Repo.merged(self, POINT, main, {"de.ai.json": {"f.a": "gpt", "f.b": "gpt", "f.x": "gpt"}})
        self.assertEqual(i18n.fold(ENGLISH, repo.root)["de"]["marked"], [])
        self.assertEqual(i18n.drafted("de", repo.root), {"f.b": "gpt"})

    def test_main_s_mark_stays_when_the_conflict_kept_main_s_redraft(self):
        # Main redrafted f.a; the branch edited it by hand and reviewed it.
        # The conflict went to main's words, which nobody has reviewed.
        main = {"de.json": {"f.a": "Verlust (neu) {w:$}", "f.b": "Niemand"},
                "base.json": {"f.a": {"en": "Lost {w:$}", "of": ["de"], "ai": {"de": "gpt-new"}}, "f.b": STORE["f.b"]}}
        branch = {"de.json": {"f.a": "Verlust (Hand) {w:$}", "f.b": "Niemand"}, "de.ai.json": {"f.b": "gpt"}}
        repo = Repo.merged(self, POINT, main, branch)
        repo.put({"de.json": main["de.json"]})
        self.assertEqual(i18n.fold(ENGLISH, repo.root), {"de": {"bases": [], "marked": [], "unmarked": []}})
        self.assertEqual(i18n.drafted("de", repo.root), {"f.a": "gpt-new", "f.b": "gpt"})

    def test_without_a_merge_fold_asks_which_side_is_which(self):
        repo = Repo(self)
        repo.commit({**POINT, "base.json": STORE}, "both")
        with self.assertRaisesRegex(i18n.CatalogueError, "--branch"):
            i18n.fold(ENGLISH, repo.root)
        self.assertEqual(i18n.fold(ENGLISH, repo.root, "HEAD", "HEAD")["de"]["unmarked"], [])
        self.assertEqual(i18n._legacy(repo.root), [], "the work tree's old files are gone")

    def test_a_new_english_on_the_branch_goes_with_the_words_the_conflict_kept(self):
        # The branch changed f.b's English and redrafted it; main changed the
        # German too, against the old English. The conflict decides.
        english = {"f.b": "No staff at all"}
        point = {"de.json": {"f.b": "Niemand"}, "de.base.json": {"f.b": "No staff"}, "de.ai.json": {"f.b": "gpt"}}
        branch = {"de.json": {"f.b": "Gar niemand"}, "de.base.json": {"f.b": "No staff at all"},
                  "de.ai.json": {"f.b": "gpt-new"}}
        reviewed = {"de.json": {"f.b": "Keiner"}, "base.json": {"f.b": {"en": "No staff", "of": ["de"]}}}
        drafted = {"de.json": {"f.b": "Keiner (Entwurf)"},
                   "base.json": {"f.b": {"en": "No staff", "of": ["de"], "ai": {"de": "gpt-main"}}}}
        for main, kept, base, marks in (
                # Main's reviewed words kept: its review and old English stand, so they do not ship.
                (reviewed, reviewed["de.json"], "No staff", {}),
                # Main's unreviewed redraft kept: its mark stays.
                (drafted, drafted["de.json"], "No staff", {"f.b": "gpt-main"}),
                # The branch's words kept: its English and mark come along.
                (reviewed, branch["de.json"], "No staff at all", {"f.b": "gpt-new"})):
            repo = Repo.merged(self, point, main, branch)
            repo.put({"de.json": kept})
            i18n.fold(english, repo.root)
            self.assertEqual(i18n.load("de", repo.root)[1], {"f.b": base}, kept)
            self.assertEqual(i18n.drafted("de", repo.root), marks, kept)
        # Left in conflict, the table stops fold before it changes anything.
        repo = Repo.merged(self, point, reviewed, branch)
        with self.assertRaisesRegex(i18n.CatalogueError, "resolve the conflict"):
            i18n.fold(english, repo.root)
        self.assertEqual(i18n._legacy(repo.root), ["de.ai.json", "de.base.json"])
        self.assertEqual(i18n._store(repo.root), reviewed["base.json"])

    def test_a_mistyped_ref_stops_fold_before_it_touches_anything(self):
        repo = Repo(self)
        repo.commit({**POINT, "base.json": STORE}, "both")
        before = sorted(os.listdir(os.path.join(repo.root, "i18n")))
        for branch, main, side in (("HAED", "HEAD", "--branch HAED"), ("HEAD", "mian", "--main mian")):
            with self.assertRaisesRegex(i18n.CatalogueError, side):
                i18n.fold(ENGLISH, repo.root, branch, main)
        self.assertEqual(sorted(os.listdir(os.path.join(repo.root, "i18n"))), before)
        self.assertEqual(i18n._store(repo.root), STORE)

    def test_the_branch_s_english_fills_and_wins_where_it_is_today_s(self):
        # Main translated f.a in French alone, from today's English; the branch
        # drafted German f.a from an older one and f.c afresh, and redid f.b
        # for a changed English main has not caught up with.
        english = {"f.a": "Lost {w:$} today", "f.b": "No staff at all", "f.c": "Fresh"}
        point = {"de.json": {"f.b": "Niemand"}, "de.base.json": {"f.b": "No staff"}, "de.ai.json": {}}
        main = {"fr.json": {"f.a": "Perte {w:$}"},
                "base.json": {"f.a": {"en": "Lost {w:$} today", "of": ["fr"]}, "f.b": {"en": "No staff", "of": ["de"]}}}
        branch = {"de.json": {"f.a": "Verlust {w:$}", "f.b": "Gar niemand", "f.c": "Frisch"},
                  "de.base.json": {"f.a": "Lost {w:$}", "f.b": "No staff at all", "f.c": "Fresh"},
                  "de.ai.json": {"f.a": "gpt", "f.b": "gpt", "f.c": "gpt"}}
        repo = Repo.merged(self, point, main, branch)
        self.assertEqual(i18n.fold(english, repo.root)["de"]["bases"], ["f.a", "f.b", "f.c"])
        self.assertEqual(i18n.load("de", repo.root)[1], branch["de.base.json"])
        self.assertEqual(i18n.drafted("de", repo.root), {"f.a": "gpt", "f.b": "gpt", "f.c": "gpt"})
        self.assertEqual(i18n.shipped("de", english, repo.root), {"f.b": "Gar niemand", "f.c": "Frisch"},
                         "German f.a was made from an older English, so it does not ship")
        self.assertEqual(i18n.load("fr", repo.root)[1], {"f.a": "Lost {w:$} today"})


if __name__ == "__main__":
    unittest.main()
