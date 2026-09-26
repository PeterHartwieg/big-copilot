"""The site keeps the promises its privacy notice (web/privacy.html) makes.

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
PAGES = ("index.html", "impressum.html", "privacy.html")
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
        # The game link (docs/game-link-api.md) is the one sanctioned
        # exception: at the player's own click, app.js reads the running
        # game from the Big Copilot Link mod on the player's loopback. The
        # data goes to the machine it came from, so no third party sees it;
        # the mod answers CORS for this site and for loopback origins only.
        # Anything else a script names is still a broken promise.
        loopback = {"127.0.0.1", "localhost"}
        for name in SCRIPTS:
            with self.subTest(name=name):
                text = (WEB / name).read_text(encoding="utf-8")
                # The SVG namespace in map.js is an identifier, never fetched.
                hosts = {host.split(":")[0] for host in re.findall(r"https?://([^/\"'`\s]+)", text)}
                hosts -= {"www.w3.org"}
                if name == "app.js":
                    self.assertTrue(hosts, "app.js should still name the game link's loopback")
                    self.assertLessEqual(hosts, loopback, "app.js names a host that is not loopback")
                else:
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
        # "The identifier ... is not stored in your browser": no store at all.
        self.assertNotIn("indexedDB", community)

    def test_the_site_sets_no_cookies_of_its_own(self):
        # "Big Copilot sets no cookies of its own." IndexedDB is named in the
        # notice (the history lives there, in app.js); cookies are not.
        for path in [WEB / name for name in SCRIPTS + ("i18n.js",) + PAGES] + [ROOT / "ba_dashboard.py"]:
            with self.subTest(name=path.name):
                self.assertNotIn("document.cookie", path.read_text(encoding="utf-8"))
        for path in (ROOT / "server").glob("*.mjs"):
            with self.subTest(name=path.name):
                self.assertNotRegex(path.read_text(encoding="utf-8"), r"(?i)set-cookie")

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

    def test_worker_code_logs_nothing(self):
        # "We keep no access logs ourselves." Observability is on, so anything
        # the Worker prints is stored in Workers Logs; the Worker prints nothing,
        # and nothing ships its logs elsewhere. A new log line has to be checked
        # for request data (IP, URL, ids) before this test is loosened.
        config = (ROOT / "wrangler.jsonc").read_text(encoding="utf-8")
        self.assertNotIn("logpush", config)
        self.assertNotIn("tail_consumers", config)
        for path in (ROOT / "server").glob("*.mjs"):
            with self.subTest(name=path.name):
                self.assertNotRegex(path.read_text(encoding="utf-8"), r"\bconsole\s*\.")

    def test_daily_cleanup_is_scheduled(self):
        # "Both are deleted within two days" (presence) and "within one day
        # after we close the poll" (votes): a daily cron runs scheduled(),
        # which deletes presence rows older than 24 hours and the votes of
        # polls no longer in server/features.json.
        config = (ROOT / "wrangler.jsonc").read_text(encoding="utf-8")
        crons = re.search(r'"crons"\s*:\s*\[([^\]]*)\]', config)
        self.assertIsNotNone(crons, "wrangler.jsonc schedules no cron")
        schedules = re.findall(r'"([^"]+)"', crons.group(1))
        self.assertTrue(schedules)
        # Daily or more often: the day, month and weekday fields are all "*".
        self.assertTrue(any(s.split()[2:] == ["*", "*", "*"] for s in schedules), schedules)
        worker = (ROOT / "server" / "worker.mjs").read_text(encoding="utf-8")
        handler = worker[worker.index("async scheduled("):]
        handler = handler[:handler.index("\n  },")]
        self.assertIn("DELETE FROM community_presence WHERE last_seen <=", handler)
        self.assertIn("24 * 60 * 60", handler)
        self.assertIn("DELETE FROM community_votes WHERE feature_id NOT IN", handler)


if __name__ == "__main__":
    unittest.main()
