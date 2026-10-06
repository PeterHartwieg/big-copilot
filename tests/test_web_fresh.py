"""web/ matches the sources, and the stamp does not depend on line endings.

The code-derived site is not committed: `python build_web.py --assemble` writes
it from the sources (CI and `npm run deploy` run it first). build_web.check()
holds the assembled folder, and the committed game-derived files it reads, to
the sources without the installed game. This suite runs that check over the
repository, over a doctored copy of it, and once through the command line
itself, and assembles a copy with every route to the game shut.

Each class makes its copy once. A test that doctors it puts the original bytes
back through kept(), so the next test starts from the same copy.
"""
from contextlib import contextmanager
from pathlib import Path
import json
import hashlib
import re
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

import build_web

ROOT = Path(__file__).resolve().parents[1]

# The stamped assets, plus the copies and generated files check() compares.
CHECK_INPUTS = tuple(dict.fromkeys(
    build_web.STAMP_INPUTS
    + tuple(build_web.worker_assets()[1])
    + build_web.PY_COPIED + tuple(f"web/py/{name}" for name in build_web.PY_COPIED)
    + ("web/version.json", "web/index.html", "web/update.js", "web/translate/index.html")
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


def run_check(root):
    """`python build_web.py --check` against a copy, with nothing of ours in it."""
    return subprocess.run(
        [sys.executable, str(Path(root, "build_web.py")), "--check"],
        cwd=root, capture_output=True, text=True,
    )


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

    def test_stale_wiki_generator_is_reported(self):
        # Nothing the page fetches changes when the generator does, so only the
        # stamp can tell that web/wiki-data.json needs rebuilding.
        tmp = self.root
        for authored in ("tools/wiki_sample.json", "tools/wiki_topics.json"):
            with self.subTest(authored=authored), kept(tmp, authored):
                edited = Path(tmp, authored)
                edited.write_bytes(edited.read_bytes() + b"\n")
                self.assertIn("web/version.json", build_web.check(tmp))

    def test_an_edited_article_names_the_wiki_payload(self):
        # Not only the stamp: the payload that carries the articles is named.
        tmp = self.root
        with kept(tmp, "tools/wiki_topics.json"):
            edited = Path(tmp, "tools/wiki_topics.json")
            edited.write_text(edited.read_text(encoding="utf-8").replace(
                "0.02482", "0.02483", 1), encoding="utf-8")
            stale = build_web.check(tmp)
            self.assertIn("web/wiki-data.json", stale)
            self.assertIn("web/version.json", stale)

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
        tmp = self.root
        fresh = run_check(tmp)
        self.assertEqual(fresh.returncode, 0, fresh.stdout + fresh.stderr)
        self.assertIn("web/ is up to date", fresh.stdout)
        with kept(tmp, "web/py/ba_dashboard.py"):
            copy = Path(tmp, "web/py/ba_dashboard.py")
            copy.write_bytes(copy.read_bytes() + b"\n# stale\n")
            stale = run_check(tmp)
            self.assertEqual(stale.returncode, 1, stale.stdout + stale.stderr)
            self.assertIn("stale: web/py/ba_dashboard.py", stale.stdout)

    def test_command_line_reports_an_edited_template(self):
        # render() reads the board markup, script and calculation core, so an
        # edit to any changes the page and, through STAMP_INPUTS, the stamp.
        tmp = self.root
        for name, before in (("board.html", b"<title>"), ("board.js", b"let D = "), ("open-store-model.js", b"const OpenStoreModel = "),
                             ("open-factory-model.js", b"const OpenFactoryModel = ")):
            with self.subTest(name=name), kept(tmp, f"template/{name}"):
                board = Path(tmp, "template", name)
                board.write_bytes(board.read_bytes().replace(before, before + b"x", 1))
                stale = run_check(tmp)
                self.assertEqual(stale.returncode, 1, stale.stdout + stale.stderr)
                self.assertIn("stale: web/version.json", stale.stdout)
                self.assertIn("stale: web/index.html", stale.stdout)

    def test_assemble_rebuilds_what_check_compares_without_the_game(self):
        # Every file --check compares is written from the committed sources;
        # any route to the installed game fails the test.
        def no_game(*_args, **_kwargs):
            raise AssertionError("assemble() looked for the installed game")

        tmp = self.root
        assembled = ("web/index.html", "web/version.json", "web/sitemap.xml", "web/robots.txt",
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
                self.assertEqual(Path(tmp, name).read_bytes().replace(b"\r\n", b"\n"),
                                 (ROOT / name).read_bytes().replace(b"\r\n", b"\n"), name)
            # An edited article reaches the wiki payload too, as check() expects.
            topics = Path(tmp, "tools/wiki_topics.json")
            topics.write_text(topics.read_text(encoding="utf-8").replace(
                "0.02482", "0.02483", 1), encoding="utf-8")
            self.assertIn("web/wiki-data.json", build_web.check(tmp))
            build_web.assemble(tmp)
            self.assertEqual(build_web.check(tmp), [])


if __name__ == "__main__":
    unittest.main()
