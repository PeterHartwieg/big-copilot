"""web/ matches the sources, and the stamp does not depend on line endings.

The browser build is committed, so a change to ba_save.py, ba_dashboard.py or
any stamped asset that is not followed by `python build_web.py` ships a stale
page. build_web.check() catches that without the installed game, and this suite
runs the same check over the repository.
"""
from pathlib import Path
import tempfile
import unittest

import build_web

ROOT = Path(__file__).resolve().parents[1]

# The stamped assets, plus the copies and generated files check() compares.
CHECK_INPUTS = tuple(dict.fromkeys(
    build_web.STAMP_INPUTS
    + ("ba_buildings.json", "web/py/ba_save.py", "web/py/ba_dashboard.py",
       "web/py/ba_buildings.json", "web/version.json", "web/index.html", "web/update.js")
))


def place(root, name, data):
    """Write one file under root, making its folder first."""
    path = Path(root, name)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return path


class WebFresh(unittest.TestCase):
    def test_repository_is_fresh(self):
        stale = build_web.check()
        self.assertEqual(stale, [], f"run python build_web.py: {', '.join(stale)}")

    def test_stale_copy_is_reported(self):
        with tempfile.TemporaryDirectory() as tmp:
            for name in CHECK_INPUTS:
                place(tmp, name, (ROOT / name).read_bytes())
            copy = Path(tmp, "web/py/ba_dashboard.py")
            copy.write_bytes(copy.read_bytes() + b"\n# stale\n")
            self.assertIn("web/py/ba_dashboard.py", build_web.check(tmp))

    def test_stamp_ignores_line_endings(self):
        with tempfile.TemporaryDirectory() as lf, tempfile.TemporaryDirectory() as crlf:
            for name in build_web.STAMP_INPUTS:
                data = (ROOT / name).read_bytes()
                if name.endswith(".svg"):
                    # Marked -text in .gitattributes: the same bytes everywhere.
                    place(lf, name, data)
                    place(crlf, name, data)
                    continue
                unix = data.replace(b"\r\n", b"\n")
                place(lf, name, unix)
                place(crlf, name, unix.replace(b"\n", b"\r\n"))
            self.assertEqual(build_web.stamp(lf), build_web.stamp(crlf))


if __name__ == "__main__":
    unittest.main()
