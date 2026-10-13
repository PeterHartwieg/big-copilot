"""web/ matches the sources, and the stamp does not depend on line endings.

The code-derived site is not committed: `python build_web.py --assemble` writes
it from the sources (CI and `npm run deploy` run it first). build_web.check()
holds the assembled folder, and the committed game-derived files it reads, to
the sources without the installed game. This suite runs that check over the
repository, over a doctored copy of it, and once through the command line
itself, and assembles a copy with every route to the game shut.

Each class makes its copy once. A test that doctors it puts the original bytes
back through kept(), so the next test starts from the same copy. The command
line checks run side by side, each on a hard-linked sibling of the copy, and
the module works out this checkout's UI text once (setUpModule).
"""
from contextlib import contextmanager
from pathlib import Path
import json
import os
import hashlib
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

import build_web

ROOT = Path(__file__).resolve().parents[1]

# The stamped assets, plus the copies and generated files check() compares,
# and the hand-written articles it holds web/wiki-data.json to.
CHECK_INPUTS = tuple(dict.fromkeys(
    build_web.STAMP_INPUTS + ("tools/wiki_topics.json",)
    + tuple(build_web.worker_assets()[1])
    + build_web.PY_COPIED + tuple(f"web/py/{name}" for name in build_web.PY_COPIED)
    + ("web/version.json", "web/index.html", "web/update.js", "web/translate/index.html", "web/wiki-data.min.json")
))

# What a standalone `python build_web.py --check` reads on top of those: the
# modules build_web imports, and the web/ assets render() embeds in the page.
CLI_INPUTS = tuple(dict.fromkeys(
    CHECK_INPUTS
    + ("ba_save.py", "ba_dashboard.py", "template/board.html", "template/board.js", "template/open-store-model.js", "template/open-factory-model.js", "web/changelog.json", "web/map.js", "web/map.css",
       "web/wiki.js", "web/wiki.css", "web/wiki-data.json", "web/sitemap.xml", "web/robots.txt")
))
# The translations under i18n/ are the source of web/i18n/, which --check rebuilds.
CLI_TREES = ("tools/*.py", "tools/wiki_sample.json", "web/py/*", "web/assets/**/*", "web/maps/*", "web/wiki/**/*", "i18n/*.json")


def place(root, name, data):
    """Write one file under root, making its folder first."""
    path = Path(root, name)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return path


def copy_inputs(root, names):
    """Copy files out of the repository into root, keeping relative paths."""
    for name in names:
        place(root, name, (ROOT / name).read_bytes())


def standalone(root):
    """A copy of the repository holding everything --check reads, and no more."""
    copy_inputs(root, CLI_INPUTS)
    for pattern in CLI_TREES:
        for source in sorted(ROOT.glob(pattern)):
            if source.is_file():
                place(root, source.relative_to(ROOT).as_posix(), source.read_bytes())


@contextmanager
def kept(root, *names, trees=()):
    """Put names, and every file under trees, back as they were once the block ends.

    A file the block deletes comes back; one it adds under a tree is removed.
    """
    paths = [Path(root, name) for name in names]
    for tree in trees:
        paths += [path for path in Path(root, tree).rglob("*") if path.is_file()]
    saved = {path: path.read_bytes() if path.is_file() else None for path in paths}
    try:
        yield
    finally:
        for tree in trees:
            for path in Path(root, tree).rglob("*"):
                if path.is_file() and path not in saved:
                    path.unlink()
        for path, data in saved.items():
            if data is None:
                path.unlink(missing_ok=True)
            else:
                place(root, path.relative_to(root), data)


def setUpModule():
    """Work out this checkout's UI text once for the whole module.

    check() and assemble() spend most of their time on the expected UI tables:
    the call-site scan, then each language's shipped table and public
    catalogue. All of that reads this checkout only (root redirects just the
    tables compared or written), and no test here edits this checkout, so the
    answers cannot change between calls. The comparison against each copy's
    own web/i18n/ and web/translations/ still runs every time.
    """
    from tools import i18n, translation_catalogue

    memo = {}

    def remembered(module, name, key):
        original = getattr(module, name)

        def wrapper(*args, **kwargs):
            # Keep the arguments alive with the answer, so an id() in the key
            # is never reused by a later object.
            slot = (name, key(*args, **kwargs))
            if slot not in memo:
                memo[slot] = (args, kwargs, original(*args, **kwargs))
            return memo[slot][2]

        patcher = mock.patch.object(module, name, wrapper)
        patcher.start()
        unittest.addModuleCleanup(patcher.stop)

    def arg(args, kwargs, index, name, default=None):
        return args[index] if len(args) > index else kwargs.get(name, default)

    # The scan reads this checkout's sources; its list is only ever read.
    remembered(i18n, "calls", lambda: ())
    remembered(i18n, "catalogue", lambda *a, **k: (id(arg(a, k, 0, "found")), arg(a, k, 1, "where", False)))
    remembered(i18n, "passed", lambda *a, **k: id(arg(a, k, 0, "found")))
    remembered(i18n, "shipped", lambda *a, **k: (
        arg(a, k, 0, "lang"), id(arg(a, k, 1, "english")), str(arg(a, k, 2, "root", i18n.ROOT)), id(arg(a, k, 3, "params"))))
    remembered(translation_catalogue, "catalogue", lambda *a, **k: (
        arg(a, k, 0, "lang"), id(arg(a, k, 1, "found")), str(arg(a, k, 2, "root", translation_catalogue.ROOT)),
        tuple(id(v) for v in (arg(a, k, 3, "inputs") or {}).values())))


class SharedCopy(unittest.TestCase):
    """One copy of the repository per class, made by fill(root) before its tests."""

    @staticmethod
    def fill(root):
        raise NotImplementedError

    @classmethod
    def setUpClass(cls):
        folder = tempfile.TemporaryDirectory()
        cls.addClassCleanup(folder.cleanup)
        cls.root = folder.name
        cls.fill(cls.root)


def start_check(root):
    """`python build_web.py --check` against a copy, with nothing of ours in it, started."""
    return subprocess.Popen(
        [sys.executable, str(Path(root, "build_web.py")), "--check"],
        cwd=root, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
    )


@contextmanager
def started():
    """A list for start_check()'s runs. Any run still going when the block
    ends, say because a sibling could not be made, is killed and waited for,
    so the folder it runs in can go and the real error shows."""
    runs = []
    try:
        yield runs
    finally:
        for run in runs:
            if run.poll() is None:
                run.kill()
            run.communicate()


def linked_copy(root, target):
    """A copy of root whose files are hard links to root's. Replace a file
    (unlink, then write) rather than writing into it, or root changes too."""
    shutil.copytree(root, target, copy_function=os.link, ignore=shutil.ignore_patterns("__pycache__"))
    return target


class WebFresh(unittest.TestCase):
    def test_repository_is_fresh(self):
        stale = build_web.check()
        self.assertEqual(stale, [], f"run python build_web.py --assemble: {', '.join(stale)}")

    def test_stamp_ignores_line_endings(self):
        with tempfile.TemporaryDirectory() as lf, tempfile.TemporaryDirectory() as crlf, \
                tempfile.TemporaryDirectory() as svg_crlf:
            for name in build_web.STAMP_INPUTS:
                unix = (ROOT / name).read_bytes().replace(b"\r\n", b"\n")
                dos = unix.replace(b"\n", b"\r\n")
                if name.endswith(".svg"):
                    # Marked -text in .gitattributes: the same bytes everywhere,
                    # so the stamp has to notice when they are not.
                    place(lf, name, unix)
                    place(crlf, name, unix)
                    place(svg_crlf, name, dos)
                    continue
                place(lf, name, unix)
                place(crlf, name, dos)
                place(svg_crlf, name, unix)
            self.assertEqual(build_web.stamp(lf), build_web.stamp(crlf))
            self.assertNotEqual(build_web.stamp(lf), build_web.stamp(svg_crlf))

    def test_worker_fetches_the_manifest_files_and_each_is_a_stamp_input(self):
        worker = (ROOT / "web/worker.js").read_text(encoding="utf-8")
        for group, expected in (("CODE_FILES", build_web.PY_CODE), ("DATA_FILES", build_web.PY_DATA)):
            listed = re.search(r"const " + group + r" = \[([^\]]*)\]", worker)
            self.assertIsNotNone(listed)
            self.assertEqual(tuple(re.findall(r'"([^"]+)"', listed.group(1))), expected)
        for name in build_web.PY_CODE:
            self.assertIn(name, build_web.STAMP_INPUTS)
        for name in build_web.PY_DATA:
            self.assertIn(f"web/py/{name}", build_web.STAMP_INPUTS)

    def test_manifest_hashes_exact_emitted_bytes_and_is_pinned_in_the_page(self):
        manifest, outputs = build_web.worker_assets()
        self.assertEqual(set(manifest["files"]), set(build_web.PY_CODE + build_web.PY_DATA))
        dashboard = build_web.strip_copy(build_web.read_text(str(ROOT / "ba_dashboard.py"))).encode("utf-8")
        entry = manifest["files"]["ba_dashboard.py"]
        self.assertEqual(entry["sha256"], hashlib.sha256(dashboard).hexdigest())
        self.assertEqual(outputs["web/" + entry["url"]], dashboard)
        for name in build_web.PY_COPIED:
            self.assertEqual(build_web.read_text(str(ROOT / "web/py" / name)),
                             build_web.shipped_text(str(ROOT), name), name)
            if name not in build_web.STRIPPED:
                self.assertEqual(build_web.shipped_text(str(ROOT), name),
                                 build_web.read_text(str(ROOT / name)), name)
        for entry in (manifest["worker"], *manifest["files"].values()):
            data = outputs["web/" + entry["url"]]
            self.assertNotIn(b"\r\n", data)
            self.assertEqual(hashlib.sha256(data).hexdigest(), entry["sha256"])
            self.assertEqual((ROOT / "web" / entry["url"]).read_bytes(), data)
        html = (ROOT / "web/index.html").read_text(encoding="utf-8")
        embedded = re.search(r"window\.LEDGER_ASSETS = (.+?);</script>", html)
        self.assertEqual(json.loads(embedded.group(1)), manifest)

    def test_standalone_render_keeps_board_code_and_styles_embedded(self):
        standalone = build_web.render(None, live=True)
        self.assertNotIn("assets/", standalone)
        self.assertNotIn("LEDGER_ASSETS", standalone)
        scripts = re.findall(r"<script>(.*?)</script>", standalone, re.S)
        styles = re.findall(r"<style>(.*?)</style>", standalone, re.S)
        self.assertTrue(any(len(code) > 100000 for code in scripts))
        self.assertTrue(any(len(code) > 100000 for code in styles))

    def test_stamp_tracks_compiler_changes_without_unrelated_dependency_cache_busts(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(build_web, "STAMP_INPUTS", ("package-lock.json",)):
            lock = {"packages": {"node_modules/esbuild": {"version": "0.28.1", "integrity": "compiler-a"},
                                 "node_modules/playwright": {"version": "1.0.0"}}}
            def write():
                place(tmp, "package-lock.json", json.dumps(lock).encode("utf-8"))
            write()
            original = build_web.stamp(tmp)
            lock["packages"]["node_modules/playwright"]["version"] = "2.0.0"
            write()
            self.assertEqual(build_web.stamp(tmp), original)
            lock["packages"]["node_modules/esbuild"]["integrity"] = "compiler-b"
            write()
            self.assertNotEqual(build_web.stamp(tmp), original)


class CheckedCopy(SharedCopy):
    """build_web.check() and friends over one copy of what check() reads."""

    @staticmethod
    def fill(root):
        copy_inputs(root, CHECK_INPUTS)

    def test_stale_copy_is_reported(self):
        tmp = self.root
        with kept(tmp, "web/py/ba_dashboard.py"):
            copy = Path(tmp, "web/py/ba_dashboard.py")
            copy.write_bytes(copy.read_bytes() + b"\n# stale\n")
            self.assertIn("web/py/ba_dashboard.py", build_web.check(tmp))

    def test_unstripped_dashboard_copy_is_reported_stale(self):
        tmp = self.root
        with kept(tmp, "web/py/ba_dashboard.py"):
            place(tmp, "web/py/ba_dashboard.py", Path(tmp, "ba_dashboard.py").read_bytes())
            self.assertIn("web/py/ba_dashboard.py", build_web.check(tmp))

    def test_the_wiki_s_compact_copy_is_checked(self):
        # The copy the page fetches is assembled from web/wiki-data.json:
        # edited, indented or missing, it is named.
        tmp = self.root
        served = "web/" + build_web.WIKI_SERVED
        self.assertNotIn(served, build_web.check(tmp))
        with kept(tmp, served):
            copy = Path(tmp, served)
            for broken in (copy.read_bytes().replace(b'"schemaVersion":1', b'"schemaVersion":2', 1),
                           Path(tmp, "web/wiki-data.json").read_bytes()):
                with self.subTest(size=len(broken)):
                    copy.write_bytes(broken)
                    self.assertIn(served, build_web.check(tmp))
            copy.unlink()
            self.assertIn(served, build_web.check(tmp))

    def test_generators_are_not_stamp_inputs(self):
        # Their output is stamped and compared, so an edit that changes nothing
        # served must not tell every open tab to update (#345).
        for generator in ("tools/build_wiki_data.py", "tools/wiki_data.py", "tools/wiki_paths.py",
                          "tools/wiki_sample.json", "tools/wiki_topics.json", "tools/i18n.py",
                          "tools/translation_catalogue.py"):
            self.assertNotIn(generator, build_web.STAMP_INPUTS)

    def test_an_edited_article_names_the_wiki_payload(self):
        # Not only the stamp: the payload that carries the articles is named.
        tmp = self.root
        with kept(tmp, "tools/wiki_topics.json"):
            edited = Path(tmp, "tools/wiki_topics.json")
            edited.write_text(edited.read_text(encoding="utf-8").replace(
                "0.02482", "0.02483", 1), encoding="utf-8")
            self.assertIn("web/wiki-data.json", build_web.check(tmp))

    def test_unrelated_release_changes_leave_content_urls_unchanged(self):
        tmp = self.root
        with kept(tmp, "web/report.js", "ba_dashboard.py", "ba_store_rules.json"):
            before = build_web.worker_assets(tmp)[0]
            version = build_web.stamp(tmp)
            report = Path(tmp, "web/report.js")
            report.write_bytes(report.read_bytes() + b"\n// unrelated edit\n")
            self.assertNotEqual(build_web.stamp(tmp), version)
            self.assertEqual(build_web.worker_assets(tmp)[0], before)
            for name in ("ba_dashboard.py", "ba_store_rules.json"):
                source = Path(tmp, name)
                original = source.read_bytes()
                source.write_bytes(original + b"\n")
                changed = build_web.worker_assets(tmp)[0]
                self.assertNotEqual(changed["files"][name], before["files"][name])
                self.assertEqual(changed["worker"], before["worker"])
                for other in before["files"]:
                    if other != name:
                        self.assertEqual(changed["files"][other], before["files"][other])
                source.write_bytes(original)

    def test_missing_modified_and_crlf_content_assets_are_stale(self):
        tmp = self.root
        assets = build_web.worker_assets()[1]
        # The loop handles all descriptors alike. Exercise code, data, worker
        # and metadata without repeating the full page/wiki freshness build
        # for every table; worker startup covers every individual digest.
        for entry in (name for name in assets if name.endswith(("worker.js", "ba_dashboard.py", "ba_item_prices.json")) or "/manifest-" in name):
            with self.subTest(asset=entry), kept(tmp, entry):
                asset = Path(tmp, entry)
                original = asset.read_bytes()
                asset.unlink()
                self.assertIn(entry, build_web.check(tmp))
                asset.write_bytes(original + b"modified")
                self.assertIn(entry, build_web.check(tmp))
                asset.write_bytes(original)
                self.assertNotIn(entry, build_web.check(tmp))
                if b"\n" in original:
                    asset.write_bytes(original.replace(b"\n", b"\r\n"))
                    self.assertIn(entry, build_web.check(tmp))

    def test_manifest_identity_ignores_checkout_line_endings(self):
        tmp = self.root
        sources = (*build_web.PY_COPIED, "web/py/gametext.json", "web/worker.js")
        with kept(tmp, *sources):
            for source in sources:
                file = Path(tmp, source)
                file.write_bytes(file.read_bytes().replace(b"\r\n", b"\n").replace(b"\n", b"\r\n"))
            self.assertEqual(build_web.worker_assets(tmp), build_web.worker_assets())


class CommandLine(SharedCopy):
    """`python build_web.py --check` and assemble() over one standalone copy."""

    @staticmethod
    def fill(root):
        standalone(root)

    def test_command_line_reports_a_stale_copy(self):
        # unittest runs a class's tests in name order, so this runs after the
        # assemble test: its "up to date" also shows that test left nothing behind.
        # The stale run edits a hard-linked sibling, so both checks run at once.
        with tempfile.TemporaryDirectory() as siblings:
            sibling = linked_copy(self.root, Path(siblings, "stale"))
            copy = Path(sibling, "web/py/ba_dashboard.py")
            data = copy.read_bytes()
            copy.unlink()  # never write through the link into the shared copy
            copy.write_bytes(data + b"\n# stale\n")
            with started() as runs:
                runs += start_check(self.root), start_check(sibling)
                fresh, stale = [(*run.communicate(), run.returncode) for run in runs]
        self.assertEqual(fresh[2], 0, fresh[0] + fresh[1])
        self.assertIn("web/ is up to date", fresh[0])
        self.assertEqual(stale[2], 1, stale[0] + stale[1])
        self.assertIn("stale: web/py/ba_dashboard.py", stale[0])

    def test_command_line_reports_an_edited_template(self):
        # render() reads the board markup, script and calculation core, so an
        # edit to any changes the page and, through STAMP_INPUTS, the stamp.
        # --check writes nothing, so each edit gets its own sibling of the copy,
        # hard-linked but for the one file it replaces, and the four checks run
        # at once.
        edits = (("board.html", b"<title>"), ("board.js", b"let D = "), ("open-store-model.js", b"const OpenStoreModel = "),
                 ("open-factory-model.js", b"const OpenFactoryModel = "))
        with tempfile.TemporaryDirectory() as siblings, started() as runs:
            for name, before in edits:
                sibling = linked_copy(self.root, Path(siblings, name))
                board = Path(sibling, "template", name)
                data = board.read_bytes()
                board.unlink()  # never write through the link into the shared copy
                board.write_bytes(data.replace(before, before + b"x", 1))
                runs.append(start_check(sibling))
            results = {name: (*run.communicate(), run.returncode) for (name, _before), run in zip(edits, runs)}
            for name, _before in edits:
                with self.subTest(name=name):
                    stdout, stderr, returncode = results[name]
                    self.assertEqual(returncode, 1, stdout + stderr)
                    self.assertIn("stale: web/version.json", stdout)
                    self.assertIn("stale: web/index.html", stdout)

    def test_assemble_rebuilds_what_check_compares_without_the_game(self):
        # Every file --check compares is written from the committed sources;
        # any route to the installed game fails the test.
        def no_game(*_args, **_kwargs):
            raise AssertionError("assemble() looked for the installed game")

        tmp = self.root
        assembled = ("web/index.html", "web/version.json", "web/sitemap.xml", "web/robots.txt", "web/wiki-data.min.json",
                     *(f"web/py/{name}" for name in build_web.PY_COPIED))
        # What assemble() deletes or writes, put back for the other tests.
        with kept(tmp, *assembled, "web/translate/index.html", "web/wiki-data.json", "tools/wiki_topics.json",
                  trees=("web/i18n", "web/translations", "web/wiki", "web/assets")), \
                mock.patch("ba_save.load_game_locale", no_game), \
                mock.patch("ba_save.find_game_locale", no_game), \
                mock.patch("build_web.load_game_locale", no_game), \
                mock.patch("build_web.game_data_dir", no_game), \
                mock.patch("build_web.write_public_wiki", no_game), \
                mock.patch("builtins.print"):
            for name in assembled:
                Path(tmp, name).unlink()
            for tree in ("web/i18n", "web/wiki"):
                for path in sorted(Path(tmp, tree).rglob("*"), reverse=True):
                    path.unlink() if path.is_file() else path.rmdir()
            build_web.assemble(tmp)
            self.assertEqual(build_web.check(tmp), [])
            for name in assembled:
                expected = (build_web.shipped_text(tmp, name.removeprefix("web/py/")).encode("utf-8")
                            if name.startswith("web/py/") else
                            (ROOT / name).read_bytes().replace(b"\r\n", b"\n"))
                self.assertEqual(Path(tmp, name).read_bytes().replace(b"\r\n", b"\n"),
                                 expected, name)
            # An edited article reaches the wiki payload too, as check() expects.
            topics = Path(tmp, "tools/wiki_topics.json")
            topics.write_text(topics.read_text(encoding="utf-8").replace(
                "0.02482", "0.02483", 1), encoding="utf-8")
            self.assertIn("web/wiki-data.json", build_web.check(tmp))
            build_web.assemble(tmp)
            self.assertEqual(build_web.check(tmp), [])
