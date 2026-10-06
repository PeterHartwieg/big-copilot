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


def js_code(source: str) -> str:
    """The source with comments and string contents blanked to spaces.

    Newlines and offsets stay, so line n of the result is line n of the
    source, holding only code: an identifier inside quotes or a comment
    (block comments across lines too) is gone. A template literal's ${...}
    expressions are code and stay. Good enough for the board's own scripts,
    not a full JavaScript lexer: a regex literal is told from division by the
    character before it.
    """
    out, i, n, depth = list(source), 0, len(source), []

    def blank(start, end):
        for k in range(start, end):
            if out[k] != "\n":
                out[k] = " "

    def template(start):  # from just after ` or }, to the closing ` or the next ${
        j = start
        while j < n and source[j] != "`" and not source.startswith("${", j):
            j += 2 if source[j] == "\\" else 1
        blank(start, min(j, n))
        if source.startswith("${", j):
            depth.append(0)
            return j + 2
        return j + 1

    while i < n:
        c = source[i]
        if source.startswith("//", i):
            end = source.find("\n", i)
            end = n if end < 0 else end
            blank(i, end)
            i = end
        elif source.startswith("/*", i):
            end = source.find("*/", i + 2)
            end = n if end < 0 else end + 2
            blank(i, end)
            i = end
        elif c == "/" and re.search(r"(?:^|[(,=:\[!&|?{};+\-*%<>~^]|\breturn|\btypeof)\s*$", "".join(out[max(0, i - 40):i])):
            # A regex literal: its quotes and slashes are not code.
            j, in_class = i + 1, False
            while j < n and source[j] != "\n" and (in_class or source[j] != "/"):
                if source[j] == "\\":
                    j += 1
                elif source[j] in "[]":
                    in_class = source[j] == "["
                j += 1
            blank(i + 1, min(j, n))
            i = j + 1
        elif c in "'\"":
            j = i + 1
            while j < n and source[j] not in (c, "\n"):
                j += 2 if source[j] == "\\" else 1
            blank(i + 1, min(j, n))
            i = j + 1
        elif c == "`":
            i = template(i + 1)
        elif c == "}" and depth and depth[-1] == 0:
            depth.pop()
            i = template(i + 1)
        else:
            if depth and c == "{":
                depth[-1] += 1
            elif depth and c == "}":
                depth[-1] -= 1
            i += 1
    return "".join(out)


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
            code = js_code(text).splitlines()
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
                        requests += [(use.strip(), use[use.index("${" + const.group(1) + "}"):], code[:n])
                                     for n, use in uses]
                        continue
                    requests.append((line.strip(), line[match.start():], code[:at]))
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
    def names_the_release(rest: str, code_before: list[str]) -> bool:
        """Whether the ?v= in a request comes from the build stamp or the file's hash.

        rest is the request's source text from its path on; code_before is
        js_code() of the lines above it. The value must be window.LEDGER_BUILD
        itself, a variable whose nearest assignment above reads it as code, or
        the map's imageHash. A constant such as ${"1"} survives a release, so a
        year-long cache would keep old bytes.
        """
        query = re.search(r"\?v=\$\{([^}]*)\}", rest)
        if not query:
            return False
        value = query.group(1).strip()
        if re.fullmatch(r"(?:window\.)?LEDGER_BUILD(?:\s*\|\|\s*\"\w*\")?|\w+\.imageHash", value):
            return True
        if not re.fullmatch(r"\w+", value):
            return False
        for line in reversed(code_before):
            assigned = re.match(r"\s*(?:const|let|var)\s+" + value + r"\s*=(.*)$", line)
            if assigned:
                return re.search(r"\bwindow\.LEDGER_BUILD\b", assigned.group(1)) is not None
        return False

    def test_the_stamp_check_rejects_constant_versions(self):
        request = "`report.js?v=${stamp}`"
        cases = [
            ("const stamp = window.LEDGER_BUILD;", True),
            ('const stamp = encodeURIComponent(window.LEDGER_BUILD || "dev");', True),
            ('const stamp = encodeURIComponent((typeof window !== "undefined" && window.LEDGER_BUILD) || "");', True),
            # A quote inside a regex literal in a template expression (wiki.js) must not
            # swallow the code after it.
            ('const wikiSelValue = v => `"${String(v ?? "").replace(/["\\\\]/g, "\\\\$&")}"`;\nconst stamp = window.LEDGER_BUILD;', True),
            ("const stamp = `${window.LEDGER_BUILD}`;", True),
            ('const stamp = "dev";', False),
            ('const stamp = encodeURIComponent("window.LEDGER_BUILD" || "dev");', False),
            ("const stamp = `window.LEDGER_BUILD`;", False),
            ('const stamp = "dev"; // window.LEDGER_BUILD', False),
            ('const stamp = encodeURIComponent("1" /* window.LEDGER_BUILD\n*/);', False),
            ('const stamp = "1";\n// const stamp = window.LEDGER_BUILD;', False),
            ('/* const stamp = window.LEDGER_BUILD;\n*/ const stamp = "1";', False),
            ("", False),
        ]
        for source, expected in cases:
            with self.subTest(source=source):
                before = js_code(source).splitlines()
                self.assertEqual(self.names_the_release(request, before), expected)
        for rest, expected in [('`maps/x.json?v=${window.LEDGER_BUILD || "1"}`', True),
                               ("`maps/${data.image}?v=${data.imageHash}`", True),
                               ('`maps/x.json?v=${"1"}`', False),
                               ('`maps/x.json?v=${"window.LEDGER_BUILD"}`', False),
                               ("`maps/x.json`", False)]:
            with self.subTest(request=rest):
                self.assertEqual(self.names_the_release(rest, []), expected)

if __name__ == "__main__":
    unittest.main()
