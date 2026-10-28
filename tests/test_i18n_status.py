"""`python tools/i18n.py status --strict` holds on main, and `prune` clears what
it fails on: orphaned keys, with their base and draft marks (issue #372).

A missing or stale translation never fails here: the page falls back to
English per key, and `status --complete` is the gate for translation work."""
import contextlib
import io
import unittest
from unittest import mock

from tools import i18n


def _call(key, en, params=frozenset()):
    return {"key": key, "en": en, "where": "snippet:1", "params": set(params)}


class Files:
    """One language's share of i18n/, in memory: its table, the English each
    key was made from and its draft marks (load(), drafted() and save()).
    tests/test_i18n_store.py covers the files themselves."""

    def __init__(self, table, base=None, marks=None):
        self.files = {"table": dict(table), "base": dict(base or {}), "marks": dict(marks or {})}

    def _save(self, lang, table=None, base=None, marks=None, root=None):
        for kind, data in (("table", table), ("base", base), ("marks", marks)):
            if data is not None:
                self.files[kind] = dict(data)

    def patch(self):
        return mock.patch.multiple(
            i18n,
            load=lambda lang, root=i18n.ROOT: (dict(self.files["table"]), dict(self.files["base"])),
            drafted=lambda lang, root=i18n.ROOT: dict(self.files["marks"]),
            save=self._save,
            languages=lambda root=i18n.ROOT: ["de"])


FOUND = [_call("f.a", "Lost {w:$}", {"w"}), _call("f.b", "No staff"),
         _call("f.m", {"one": "{n} machine", "other": "{n} machines"}, {"n"})]


def _status(files, *flags):
    out, err = io.StringIO(), io.StringIO()
    with files.patch(), mock.patch.object(i18n, "calls", lambda: FOUND), \
            contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        code = i18n.main(["status", *flags])
    return code, out.getvalue() + err.getvalue()


class PruneTests(unittest.TestCase):
    def files(self):
        return Files(
            {"f.a": "Verlust {w:$}", "f.m_one": "ein Automat", "f.m_other": "{n} Automaten",
             "f.gone": "Weg", "f.gone_other": "{n} weg"},
            {"f.a": "Lost {w:$}", "f.m_one": "{n} machine", "f.m_other": "{n} machines",
             "f.gone": "Gone", "f.gone_other": "{n} gone", "f.never": "Never translated"},
            {"f.a": "gpt", "f.gone": "gpt", "f.b": "gpt"})

    def test_prune_drops_orphans_with_their_base_and_marks_and_nothing_live(self):
        files = self.files()
        english = i18n.catalogue(FOUND)
        with files.patch():
            dry = i18n.prune("de", english, write=False)
            self.assertIn("f.gone", files.files["table"], "a dry run writes nothing")
            dropped = i18n.prune("de", english)
            again = i18n.prune("de", english)
        self.assertEqual(dry, dropped)
        self.assertEqual(dropped, {"table": ["f.gone", "f.gone_other"],
                                   "base": ["f.gone", "f.gone_other", "f.never"],
                                   "marks": ["f.b", "f.gone"]})
        self.assertEqual(again, {})
        self.assertEqual(files.files["table"],
                         {"f.a": "Verlust {w:$}", "f.m_one": "ein Automat", "f.m_other": "{n} Automaten"})
        self.assertEqual(sorted(files.files["base"]), ["f.a", "f.m_one", "f.m_other"])
        self.assertEqual(files.files["marks"], {"f.a": "gpt"})

    def test_strict_fails_on_orphans_and_leftover_marks_until_pruned(self):
        files = self.files()
        code, text = _status(files, "--strict")
        self.assertEqual(code, 1, text)
        self.assertIn("orphan: f.gone", text)
        self.assertIn("python tools/i18n.py prune", text)
        with files.patch(), mock.patch.object(i18n, "calls", lambda: FOUND), \
                contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(i18n.main(["prune", "de"]), 0)
        # f.b is missing: the page shows its English, so --strict passes and --complete does not.
        code, text = _status(files, "--strict")
        self.assertEqual(code, 0, text)
        self.assertIn("missing: f.b", text)
        self.assertEqual(_status(files, "--complete")[0], 1)
        self.assertEqual(_status(files)[0], 0)

    def test_strict_fails_on_a_mark_left_for_a_key_nobody_translated(self):
        files = Files({"f.b": "Niemand"}, {"f.b": "No staff"}, {"f.b": "gpt", "f.a": "gpt"})
        code, text = _status(files, "--strict")
        self.assertEqual(code, 1, text)
        self.assertIn("1 left in de's draft marks in i18n/base.json", text)

    def test_strict_fails_on_a_mismatch(self):
        files = Files({"f.a": "Verlust {x}"}, {"f.a": "Lost {w:$}"})
        code, text = _status(files, "--strict")
        self.assertEqual(code, 1, text)
        self.assertIn("mismatch: f.a", text)


class MainTests(unittest.TestCase):
    def test_status_strict_passes_on_this_checkout(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
            code = i18n.main(["status", "--strict"])
        summary = "\n".join(line for line in out.getvalue().splitlines() if not line.startswith("  missing"))
        self.assertEqual(code, 0, "orphaned or mismatched translations; after removing or renaming a key run "
                                  "python tools/i18n.py prune\n" + summary)
