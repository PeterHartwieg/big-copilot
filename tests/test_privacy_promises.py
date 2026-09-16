"""The site keeps the promises its privacy notice (web/datenschutz.html) makes.

The notice names Cloudflare as the only party that sees a visitor's request,
so nothing the site loads may come from another host: the fonts and the
Pyodide runtime are served from web/. It also says the Worker keeps no access
logs. A change that breaks one of these has to change the notice too.
"""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"

# Resources a page fetches on its own, as opposed to links a visitor clicks.
FETCHED = re.compile(
    r"""<(?:script|img|iframe|source|video|audio)\b[^>]*\bsrc=["'](https?:)?//"""
    r"""|<link\b[^>]*\bhref=["'](https?:)?//"""
    r"""|@import\s+(?:url\()?["']?(https?:)?//"""
    r"""|url\(["']?(https?:)?//""",
    re.I,
)
PAGES = ("index.html", "impressum.html", "datenschutz.html")
SCRIPTS = ("app.js", "worker.js", "community.js", "map.js", "wiki.js", "update.js")
PYODIDE_FILES = ("pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json")


class PrivacyPromises(unittest.TestCase):
    def test_pages_fetch_nothing_from_other_hosts(self):
        for name in PAGES + ("fonts/fonts.css",):
            with self.subTest(name=name):
                text = (WEB / name).read_text(encoding="utf-8")
                self.assertIsNone(FETCHED.search(text), f"{name} loads a third-party resource")
                self.assertNotIn("fonts.googleapis.com", text)

    def test_scripts_fetch_only_from_this_site(self):
        for name in SCRIPTS:
            with self.subTest(name=name):
                text = (WEB / name).read_text(encoding="utf-8")
                # The SVG namespace in map.js is an identifier, never fetched.
                hosts = set(re.findall(r"https?://([^/\"'`\s]+)", text)) - {"www.w3.org"}
                self.assertEqual(hosts, set(), f"{name} names another host")

    def test_pyodide_is_served_from_this_site(self):
        worker = (WEB / "worker.js").read_text(encoding="utf-8")
        version = re.search(r'PYODIDE_VERSION = "([^"]+)"', worker).group(1)
        for name in PYODIDE_FILES:
            with self.subTest(name=name):
                self.assertTrue((WEB / "pyodide" / f"v{version}" / name).is_file())

    def test_font_files_exist(self):
        css = (WEB / "fonts" / "fonts.css").read_text(encoding="utf-8")
        files = set(re.findall(r"url\(([^)]+\.woff2)\)", css))
        self.assertTrue(files)
        for name in files:
            with self.subTest(name=name):
                self.assertTrue((WEB / "fonts" / name).is_file())

    def test_the_board_stores_no_presence_id(self):
        community = (WEB / "community.js").read_text(encoding="utf-8")
        self.assertNotIn("localStorage.setItem", community)
        self.assertNotIn("sessionStorage", community)

    def test_no_analytics_script(self):
        for path in (ROOT / "build_web.py", WEB / "index.html"):
            with self.subTest(name=path.name):
                text = path.read_text(encoding="utf-8")
                self.assertNotIn("cloudflareinsights", text)
                self.assertNotIn("ANALYTICS", text)

    def test_worker_keeps_no_request_logs_or_traces(self):
        config = (ROOT / "wrangler.jsonc").read_text(encoding="utf-8")
        self.assertRegex(config, r'"invocation_logs"\s*:\s*false')
        self.assertRegex(config, r'"traces"\s*:\s*\{\s*"enabled"\s*:\s*false\s*\}')


if __name__ == "__main__":
    unittest.main()
