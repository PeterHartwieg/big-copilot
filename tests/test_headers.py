"""web/_headers: the security headers every response carries, and the caching rules.

Cloudflare applies web/_headers to the static assets (wrangler dev does too).
The CSP backs the privacy notice (tests/test_privacy_promises.py): nothing
the site loads or fetches may come from another host, except the game link on
the player's own loopback. tests/csp.test.cjs boots Pyodide and the link under
the same policy in a browser; this file only reads the text.
"""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"


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

    def test_python_files_are_cached_only_because_every_fetch_is_stamped(self):
        self.assertIn("immutable", self.rules["/py/*"].get("cache-control", ""))
        # Every web/py file is a stamp input, so new content means a new URL.
        import build_web  # noqa: E402  (the repo root is on sys.path under unittest discover)
        for path in sorted((WEB / "py").iterdir()):
            if path.is_file():
                with self.subTest(file=path.name):
                    source = f"web/py/{path.name}"
                    copied_from = path.name if path.suffix == ".py" else None
                    self.assertTrue(source in build_web.STAMP_INPUTS or copied_from in build_web.STAMP_INPUTS,
                                    f"{source} is cached immutable but is not a stamp input")
        # Every fetch of py/ in the shipped scripts carries the stamp.
        for name in ("app.js", "worker.js", "map.js", "wiki.js", "community.js", "update.js", "i18n.js"):
            text = (WEB / name).read_text(encoding="utf-8")
            for match in re.finditer(r"""fetch\(\s*[`'"]py/[^`'"]*[`'"]""", text):
                with self.subTest(script=name, fetch=match.group(0)):
                    self.assertIn("?v=${stamp}", match.group(0))


if __name__ == "__main__":
    unittest.main()
