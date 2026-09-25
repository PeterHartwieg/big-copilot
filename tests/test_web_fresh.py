"""web/ matches the sources, and the stamp does not depend on line endings.

The browser build is committed, so a change to ba_save.py, ba_dashboard.py, the
wiki generator or any stamped asset that is not followed by
`python build_web.py` ships a stale page. build_web.check() catches that without
the installed game, and this suite runs the same check over the repository, over
a doctored copy of it, and once through the command line itself.
"""
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import build_web

ROOT = Path(__file__).resolve().parents[1]

# The stamped assets, plus the copies and generated files check() compares.
CHECK_INPUTS = tuple(dict.fromkeys(
    build_web.STAMP_INPUTS
    + ("ba_buildings.json", "ba_demand_curves.json",
       "web/py/ba_save.py", "web/py/ba_dashboard.py",
       "web/py/ba_buildings.json", "web/py/ba_demand_curves.json",
       "web/version.json", "web/index.html", "web/update.js")
))

# What a standalone `python build_web.py --check` reads on top of those: the
# modules build_web imports, and the web/ assets render() embeds in the page.
CLI_INPUTS = tuple(dict.fromkeys(
    CHECK_INPUTS
    + ("ba_save.py", "ba_dashboard.py", "web/changelog.json", "web/map.js", "web/map.css",
       "web/wiki.js", "web/wiki.css", "web/wiki-data.json", "web/sitemap.xml", "web/robots.txt")
))
CLI_TREES = ("tools/*.py", "tools/wiki_sample.json", "web/py/*", "web/maps/*", "web/wiki/**/*")


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
        self.assertEqual(stale, [], f"run python build_web.py: {', '.join(stale)}")

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


if __name__ == "__main__":
    unittest.main()
