"""web/_headers: the security headers every response carries, and the caching rules.

Cloudflare applies web/_headers to the static assets (wrangler dev does too).
The CSP backs the privacy notice (tests/test_privacy_promises.py): nothing
the site loads or fetches may come from another host, except the game link on
the player's own loopback. tests/csp.test.cjs boots Pyodide and the link under
the same policy in a browser; this file only reads the text.
"""
from fnmatch import fnmatch
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"

# Cached immutable only because every request names the release: the files are
# stamp inputs, and every fetch carries ?v=<build stamp> (the map background
# ?v=<its SHA-256>). _headers cannot see the query string.
STAMPED_RULES = ("/app.js", "/community.js", "/community.css", "/report.js", "/report.css",
                 "/i18n/*", "/names/*", "/maps/*", "/wiki-data.json")
STAMPED_PATH = r"(?:app\.js|community\.(?:js|css)|report\.(?:js|css)|i18n/|names/|maps/|wiki-data\.json)"
# A string or template literal that starts with one of those paths, after an
# optional leading slash or ${...} prefix.
STAMPED_LITERAL = re.compile(r"""[`'"](?:\$\{[^}]*\})?/?""" + STAMPED_PATH)
# The scripts that can request them, and how many requests each makes at least,
# so a pattern that stopped matching cannot pass the check vacuously.
STAMPED_FETCHERS = {
    "web/app.js": 2,          # report.css and report.js, on demand
    "web/i18n.js": 1,         # ttLoad(): i18n/<lang>.json
    "web/map.js": 3,          # locations.json, the background, floor-plans.json
    "web/wiki.js": 1,         # WIKI_URL
    "template/board.js": 1,   # gnLoad(): names/<lang>.json
    "web/community.js": 0,
    "web/report.js": 0,
    "web/update.js": 0,
}


def rules() -> dict[str, dict[str, str]]:
    """{path pattern: {header name (lower case): value}} in file order."""
    out: dict[str, dict[str, str]] = {}
    current = None
    for line in (WEB / "_headers").read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if not line[0].isspace():
            current = out.setdefault(line.strip(), {})
            continue
        name, _, value = line.strip().partition(":")
        assert current is not None, f"header before any path: {line!r}"
        current[name.strip().lower()] = value.strip()
    return out


def csp_directives(policy: str) -> dict[str, list[str]]:
    out = {}
    for part in policy.split(";"):
        words = part.split()
        if words:
            out[words[0]] = words[1:]
    return out


class Headers(unittest.TestCase):
    def setUp(self):
        self.rules = rules()
        self.all = self.rules.get("/*", {})

    def test_every_response_carries_the_security_headers(self):
        self.assertEqual(self.all.get("x-content-type-options"), "nosniff")
        self.assertEqual(self.all.get("x-frame-options"), "DENY")
        self.assertEqual(self.all.get("referrer-policy"), "strict-origin-when-cross-origin")
        hsts = self.all.get("strict-transport-security", "")
        self.assertRegex(hsts, r"^max-age=\d{7,}")
        self.assertNotIn("preload", hsts)
        self.assertIn("content-security-policy", self.all, "the CSP is enforced, not report-only")

    def test_the_csp_allows_this_site_and_loopback_only(self):
        csp = csp_directives(self.all["content-security-policy"])
        self.assertEqual(csp.get("default-src"), ["'self'"])
        self.assertEqual(csp.get("frame-ancestors"), ["'none'"])
        self.assertEqual(csp.get("object-src"), ["'none'"])
        self.assertEqual(csp.get("base-uri"), ["'self'"])
        # Pyodide compiles WebAssembly; it needs no JavaScript eval.
        self.assertIn("'wasm-unsafe-eval'", csp["script-src"])
        self.assertNotIn("'unsafe-eval'", csp["script-src"])
        # The game link: the mod on this machine, at any port (#link= moves it).
        self.assertIn("http://127.0.0.1:*", csp["connect-src"])
        allowed = {"'self'", "'none'", "'unsafe-inline'", "'wasm-unsafe-eval'", "data:", "blob:",
                   "http://127.0.0.1:*", "http://localhost:*"}
        for directive, sources in csp.items():
            with self.subTest(directive=directive):
                self.assertLessEqual(set(sources), allowed, f"{directive} names another host")
        self.assertLessEqual(set(csp["connect-src"]) - {"'self'"}, {"http://127.0.0.1:*", "http://localhost:*"})

    def test_update_check_and_page_revalidate(self):
        self.assertEqual(self.rules["/version.json"].get("cache-control"), "no-store")
        self.assertEqual(self.rules["/"].get("cache-control"), "no-cache")

    def test_only_content_and_runtime_paths_are_immutable(self):
        self.assertIn("immutable", self.rules["/assets/*"].get("cache-control", ""))
        self.assertIn("immutable", self.rules["/pyodide/*"].get("cache-control", ""))
        self.assertEqual(self.rules["/py/*"].get("cache-control"), "no-store")
        self.assertEqual(self.rules["/worker.js"].get("cache-control"), "no-store")

    def test_stamped_paths_are_immutable_and_translations_revalidate(self):
        for pattern in STAMPED_RULES:
            with self.subTest(pattern=pattern):
                self.assertEqual(self.rules.get(pattern, {}).get("cache-control"),
                                 "public, max-age=31536000, immutable")
        self.assertEqual(self.rules["/translations/*"].get("cache-control"), "no-cache")

    def test_every_stamped_file_is_a_stamp_input(self):
        # New bytes must mean a new stamp, or a year-long cache serves the old ones.
        import build_web  # noqa: E402  (the repo root is on sys.path under unittest discover)
        ignored = [line.strip() for line in (WEB / ".assetsignore").read_text(encoding="utf-8").splitlines()
                   if line.strip() and not line.startswith("#")]
        files = [WEB / rule.strip("/") for rule in STAMPED_RULES if not rule.endswith("*")]
        for rule in STAMPED_RULES:
            if rule.endswith("/*"):
                folder = WEB / rule[1:-2]
                files += sorted(p for p in folder.rglob("*") if p.is_file()) if folder.is_dir() else []
        langs = [lang for lang in build_web.ui_text.languages() if lang != "en"]
        self.assertTrue(langs and any(p.parent.name == "i18n" for p in files),
                        "web/i18n/ is missing: run python3 build_web.py --assemble")
        for path in files:
            served = path.relative_to(WEB).as_posix()
            if any(fnmatch(served, pattern) for pattern in ignored):
                continue  # never deployed (maps/full-map.*)
            with self.subTest(file=served):
                self.assertIn(f"web/{served}", build_web.STAMP_INPUTS,
                              f"/{served} is cached immutable but is not a stamp input")

    def test_every_request_for_a_stamped_path_carries_the_stamp(self):
        for name, at_least in STAMPED_FETCHERS.items():
            text = (ROOT / name).read_text(encoding="utf-8")
            lines = text.splitlines()
            requests = []  # (where, the text from the path on, the lines before it)
            for at, line in enumerate(lines):
                if line.lstrip().startswith(("//", "/*", "*")):
                    continue
                for match in STAMPED_LITERAL.finditer(line):
                    # An error message names the file; it requests nothing.
                    if line[:match.start()].endswith("Error("):
                        continue
                    const = re.match(r"\s*const (\w+) = [`'\"][^`'\"]*[`'\"];\s*$", line)
                    if const:
                        # A path kept in a constant: every use takes the stamp.
                        uses = [(n, use) for n, use in enumerate(lines) if "${" + const.group(1) + "}" in use]
                        self.assertTrue(uses, f"{name}: {const.group(1)} is never requested")
                        requests += [(use.strip(), use[use.index("${" + const.group(1) + "}"):], lines[:n])
                                     for n, use in uses]
                        continue
                    requests.append((line.strip(), line[match.start():], lines[:at]))
            self.assertGreaterEqual(len(requests), at_least, f"{name}: stamped requests found: {requests}")
            for where, rest, before in requests:
                with self.subTest(script=name, request=where):
                    self.assertTrue(self.names_the_release(rest, before),
                                    "a stamped path requested without ?v=<build stamp> or ?v=<content hash>")
        # Each hosted page sets the stamp before any of its scripts fetches, and
        # loads app.js, community.js and community.css with that same stamp.
        pages = [WEB / "index.html", WEB / "translate" / "index.html"]
        for page in pages:
            with self.subTest(page=page.relative_to(WEB).as_posix()):
                self.assertTrue(page.is_file(), f"{page} is missing: run python3 build_web.py --assemble")
                html = page.read_text(encoding="utf-8")
                stamp = re.search(r'<script>window\.LEDGER_BUILD\s*=\s*"([0-9a-f]{10})";</script>', html)
                self.assertTrue(stamp, "the page does not set window.LEDGER_BUILD to a build stamp")
                first_fetcher = min((m.start() for m in re.finditer(r"<script[^>]*>", html)
                                     if " src=" in m.group(0) or "fetch(" in html[m.end():html.find("</script>", m.end())]),
                                    default=len(html))
                self.assertLess(stamp.start(), first_fetcher, "a script runs before window.LEDGER_BUILD is set")
                refs = re.findall(r'(?:src|href)="(/?' + STAMPED_PATH + r'[^"]*)"', html)
                if page.parent == WEB:
                    self.assertGreaterEqual(len(refs), 3, refs)
                for ref in refs:
                    self.assertTrue(ref.endswith(f"?v={stamp.group(1)}"), f"{ref} does not carry the page's stamp")

    @staticmethod
    def names_the_release(rest: str, before: list[str]) -> bool:
        """Whether the ?v= in a request comes from the build stamp or the file's hash.

        The value must read window.LEDGER_BUILD, or a variable assigned from it
        (the nearest assignment above), or the map's imageHash. A constant such
        as ${"1"} survives a release, so a year-long cache would keep old bytes.
        """
        query = re.search(r"\?v=\$\{([^}]*)\}", rest)
        if not query:
            return False
        value = query.group(1).strip()
        if re.fullmatch(r"(?:window\.)?LEDGER_BUILD(?:\s*\|\|\s*\"\w*\")?|\w+\.imageHash", value):
            return True
        if not re.fullmatch(r"\w+", value):
            return False
        for line in reversed(before):
            assigned = re.match(r"\s*(?:const|let|var)\s+" + value + r"\s*=\s*(.*)$", line)
            if assigned:
                # The identifier must be code: drop string literals, then
                # comments, so "window.LEDGER_BUILD" in quotes is a constant.
                code = re.sub(r"""(["'`])(?:\\.|(?!\1)[^\\])*\1""", '""', assigned.group(1))
                code = re.sub(r"//.*$|/\*.*?\*/", "", code)
                return re.search(r"\bwindow\.LEDGER_BUILD\b", code) is not None
        return False

if __name__ == "__main__":
    unittest.main()
