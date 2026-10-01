"""web/ matches the sources, and the stamp does not depend on line endings.

The code-derived site is not committed: `python build_web.py --assemble` writes
it from the sources (CI and `npm run deploy` run it first). build_web.check()
holds the assembled folder, and the committed game-derived files it reads, to
the sources without the installed game. This suite runs that check over the
repository, over a doctored copy of it, and once through the command line
itself, and assembles a copy with every route to the game shut.
"""
from pathlib import Path
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
    + ("ba_buildings.json", "ba_demand_curves.json", "ba_item_prices.json", "ba_store_rules.json",
       "web/py/ba_save.py", "web/py/ba_dashboard.py",
       "web/py/ba_buildings.json", "web/py/ba_demand_curves.json",
       "web/version.json", "web/index.html", "web/update.js")
))

# What a standalone `python build_web.py --check` reads on top of those: the
# modules build_web imports, and the web/ assets render() embeds in the page.
CLI_INPUTS = tuple(dict.fromkeys(
    CHECK_INPUTS
    + ("ba_save.py", "ba_dashboard.py", "template/board.html", "template/board.js", "web/changelog.json", "web/map.js", "web/map.css",
       "web/wiki.js", "web/wiki.css", "web/wiki-data.json", "web/sitemap.xml", "web/robots.txt")
))
# The translations under i18n/ are the source of web/i18n/, which --check rebuilds.
CLI_TREES = ("tools/*.py", "tools/wiki_sample.json", "web/py/*", "web/maps/*", "web/wiki/**/*", "i18n/*.json")


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

    def test_stale_copy_is_reported(self):
        with tempfile.TemporaryDirectory() as tmp:
            copy_inputs(tmp, CHECK_INPUTS)
            copy = Path(tmp, "web/py/ba_dashboard.py")
            copy.write_bytes(copy.read_bytes() + b"\n# stale\n")
            self.assertIn("web/py/ba_dashboard.py", build_web.check(tmp))

    def test_stale_wiki_generator_is_reported(self):
        # Nothing the page fetches changes when the generator does, so only the
        # stamp can tell that web/wiki-data.json needs rebuilding.
        for authored in ("tools/wiki_sample.json", "tools/wiki_topics.json"):
            with self.subTest(authored=authored), tempfile.TemporaryDirectory() as tmp:
                copy_inputs(tmp, CHECK_INPUTS)
                edited = Path(tmp, authored)
                edited.write_bytes(edited.read_bytes() + b"\n")
                self.assertIn("web/version.json", build_web.check(tmp))

    def test_an_edited_article_names_the_wiki_payload(self):
        # Not only the stamp: the payload that carries the articles is named.
        with tempfile.TemporaryDirectory() as tmp:
            copy_inputs(tmp, CHECK_INPUTS)
            edited = Path(tmp, "tools/wiki_topics.json")
            edited.write_text(edited.read_text(encoding="utf-8").replace(
                "0.02482", "0.02483", 1), encoding="utf-8")
            stale = build_web.check(tmp)
            self.assertIn("web/wiki-data.json", stale)
            self.assertIn("web/version.json", stale)

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

    def test_command_line_reports_a_stale_copy(self):
        with tempfile.TemporaryDirectory() as tmp:
            standalone(tmp)
            fresh = run_check(tmp)
            self.assertEqual(fresh.returncode, 0, fresh.stdout + fresh.stderr)
            self.assertIn("web/ is up to date", fresh.stdout)
            copy = Path(tmp, "web/py/ba_dashboard.py")
            copy.write_bytes(copy.read_bytes() + b"\n# stale\n")
            stale = run_check(tmp)
            self.assertEqual(stale.returncode, 1, stale.stdout + stale.stderr)
            self.assertIn("stale: web/py/ba_dashboard.py", stale.stdout)

    def test_command_line_reports_an_edited_template(self):
        # render() reads the board from template/board.html and board.js, so an
        # edit to either changes the page and, through STAMP_INPUTS, the stamp.
        for name, before in (("board.html", b"<title>"), ("board.js", b"let D = ")):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as tmp:
                standalone(tmp)
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

        assembled = ("web/index.html", "web/version.json", "web/sitemap.xml", "web/robots.txt",
                     "web/py/ba_save.py", "web/py/ba_dashboard.py", "web/py/ba_buildings.json",
                     "web/py/ba_demand_curves.json", "web/py/ba_item_prices.json",
                     "web/py/ba_store_rules.json")
        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch("ba_save.load_game_locale", no_game), \
                mock.patch("ba_save.find_game_locale", no_game), \
                mock.patch("build_web.load_game_locale", no_game), \
                mock.patch("build_web.game_data_dir", no_game), \
                mock.patch("build_web.write_public_wiki", no_game), \
                mock.patch("builtins.print"):
            standalone(tmp)
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
