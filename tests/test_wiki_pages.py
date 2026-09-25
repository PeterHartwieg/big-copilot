"""The static wiki pages (tools/wiki_pages.py): every entry has one, slugs are
the payload's ids, links land, the output is stable, and --check notices drift.

Runs over the committed web/wiki-data.json, which is build output rather than a
save, plus small synthetic payloads for the markdown rules.
"""
from pathlib import Path
import json
import re
import shutil
import tempfile
import unittest

import build_web
from tools import wiki_pages

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
DATA = json.loads((WEB / "wiki-data.json").read_text(encoding="utf-8"))
FILES = wiki_pages.build(DATA)
HTML = {rel: body for rel, body in FILES.items() if rel.endswith(".html")}


def site_path(rel: str) -> str:
    """'wiki/x/index.html' -> '/wiki/x/'."""
    return "/" + rel[: -len("index.html")]


class ExpectedPages(unittest.TestCase):
    def test_every_non_furniture_entry_topic_and_category_has_a_page(self):
        expected = {"wiki/index.html"}
        expected |= {f"wiki/{p['id']}/index.html" for p in DATA["pages"]
                     if p["categoryId"] != wiki_pages.FURNITURE}
        expected |= {f"wiki/c/{c['id']}/index.html" for c in DATA["categories"]
                     if c["id"] != wiki_pages.FURNITURE}
        expected |= {f"wiki/topic/{t['slug']}/index.html" for t in DATA["topics"]}
        self.assertEqual(set(HTML), expected)
        self.assertGreater(len(expected), 300)

    def test_no_furniture_page(self):
        furniture = [p["id"] for p in DATA["pages"] if p["categoryId"] == wiki_pages.FURNITURE]
        self.assertTrue(furniture)
        for pid in furniture:
            self.assertNotIn(f"wiki/{pid}/index.html", HTML)
        self.assertNotIn(f"wiki/c/{wiki_pages.FURNITURE}/index.html", HTML)

    def test_slugs_are_the_ids(self):
        for page in DATA["pages"]:
            rel = f"wiki/{page['id']}/index.html"
            if rel in HTML:
                with self.subTest(id=page["id"]):
                    self.assertIn(f'<link rel="canonical" href="https://bigcopilot.com/wiki/{page["id"]}/">',
                                  HTML[rel])
                    self.assertIn(f'href="/#wiki/{page["id"]}"', HTML[rel])
        self.assertIn("wiki/employee_skill/index.html", HTML)

    def test_each_page_has_title_description_and_the_way_in(self):
        for rel, body in HTML.items():
            with self.subTest(rel=rel):
                self.assertRegex(body, r"<title>[^<]+</title>")
                self.assertRegex(body, r'<meta name="description" content="[^"]+">')
                self.assertIn('<a class="wp-btn" href="/">Open your save in Big Copilot</a>', body)
                self.assertIn("Open in the app</a>", body)
                self.assertIn('href="/impressum"', body)

    def test_guides_carry_their_table(self):
        for pid in DATA["guides"]:
            with self.subTest(id=pid):
                self.assertIn("<h2>What it sells</h2>", HTML[f"wiki/{pid}/index.html"])


class Links(unittest.TestCase):
    def test_no_internal_link_points_at_a_missing_page(self):
        pages = {site_path(rel) for rel in HTML}
        # Pages outside the generator that the header and footer link to.
        others = {"/": WEB / "index.html", "/impressum": WEB / "impressum.html",
                  "/privacy": WEB / "privacy.html", "/fonts/fonts.css": WEB / "fonts/fonts.css"}
        furniture = {p["id"] for p in DATA["pages"] if p["categoryId"] == wiki_pages.FURNITURE}
        for rel, body in HTML.items():
            for href in re.findall(r'href="([^"]*)"', body):
                if href.startswith(("https://bigcopilot.com/", "data:")):
                    continue
                with self.subTest(rel=rel, href=href):
                    self.assertTrue(href.startswith("/"), "links are site-absolute")
                    if href.startswith("/#wiki"):
                        route = href[len("/#wiki"):].lstrip("/")
                        self.assertTrue(route == "" or route.startswith(("c/", "topic/"))
                                        or route in furniture or route.split("/")[0] in {
                                            p["id"] for p in DATA["pages"]}, href)
                    elif href in others:
                        self.assertTrue(others[href].is_file())
                    else:
                        self.assertIn(href, pages)

    def test_furniture_links_go_to_the_app(self):
        body = HTML["wiki/businesstypes-bookstore/index.html"]
        self.assertIn('href="/#wiki/furniture-stackofshoppingbaskets"', body)
        self.assertIn('href="/wiki/products-novel/"', body)

    def test_index_links_every_page(self):
        index = HTML["wiki/index.html"]
        for rel in HTML:
            if rel != "wiki/index.html":
                self.assertIn(f'href="{site_path(rel)}"', index)


class NoScriptsNoThirdParties(unittest.TestCase):
    def test_pages_run_no_script_and_fetch_only_from_this_site(self):
        for rel, body in HTML.items():
            with self.subTest(rel=rel):
                self.assertNotIn("<script", body.lower())
                self.assertNotRegex(body, r"""\bsrc=["'](https?:)?//""")
                self.assertNotRegex(body, r"""url\(["']?(https?:)?//""")
                for tag in re.findall(r"<link\b[^>]*>", body):
                    if re.search(r"""href=["'](https?:)?//""", tag):
                        self.assertIn('rel="canonical"', tag)
                        self.assertIn('href="https://bigcopilot.com/', tag)


class Markdown(unittest.TestCase):
    def site(self, body, extra=()):
        pages = [{"id": "a", "categoryId": "g", "title": "A", "body": body},
                 {"id": "b", "categoryId": "g", "title": "B", "body": ""},
                 {"id": "f", "categoryId": wiki_pages.FURNITURE, "title": "F", "body": ""}, *extra]
        cats = [{"id": "g", "label": "G", "pageIds": ["a", "b"]},
                {"id": wiki_pages.FURNITURE, "label": "Furniture", "pageIds": ["f"]}]
        return {"schemaVersion": 1, "pages": pages, "categories": cats, "guides": {}, "topics": []}

    def page(self, body):
        return wiki_pages.build(self.site(body))["wiki/a/index.html"]

    def test_inline_rules_follow_wiki_js(self):
        html = self.page("**Bold [B](b)** and [F](f), [self](a), [gone](nowhere), "
                         "[shop](address:13 5a) <i>x</i> **open")
        self.assertIn('<b>Bold <a href="/wiki/b/">B</a></b>', html)
        self.assertIn('<a href="/#wiki/f">F</a>', html)
        self.assertIn(", self, gone, ", html)
        self.assertIn('<span class="wp-addr">shop</span>', html)
        self.assertIn("&lt;i&gt;x&lt;/i&gt; **open", html)

    def test_blocks_follow_wiki_js(self):
        html = self.page("**Needs**:\n* one\n- two\n\nLine one\nline two")
        self.assertIn("<h3>Needs</h3>", html)
        self.assertIn("<ul><li>one</li><li>two</li></ul>", html)
        self.assertIn("<p>Line one<br>line two</p>", html)

    def test_description_is_the_first_sentence(self):
        html = self.page("The **first** [sentence](b). The second.")
        self.assertIn('<meta name="description" content="The first sentence.">', html)

    def test_an_id_that_is_not_a_path_segment_is_refused(self):
        for bad in ("Has Space", "c", "topic", "a/b"):
            with self.subTest(id=bad), self.assertRaises(ValueError):
                wiki_pages.build(self.site("", extra=[{"id": bad, "categoryId": "g", "title": "x", "body": ""}]))


class Sitemap(unittest.TestCase):
    def test_sitemap_lists_exactly_the_generated_pages(self):
        locs = re.findall(r"<loc>([^<]+)</loc>", FILES["sitemap.xml"])
        self.assertEqual(len(locs), len(set(locs)))
        expected = {"https://bigcopilot.com/"} | {"https://bigcopilot.com" + site_path(rel) for rel in HTML}
        self.assertEqual(set(locs), expected)

    def test_robots_allows_all_and_names_the_sitemap(self):
        robots = FILES["robots.txt"]
        self.assertIn("User-agent: *\nAllow: /\n", robots)
        self.assertIn("Sitemap: https://bigcopilot.com/sitemap.xml\n", robots)


class Stable(unittest.TestCase):
    def test_two_runs_give_identical_output(self):
        self.assertEqual(wiki_pages.build(DATA), FILES)
        with tempfile.TemporaryDirectory() as tmp:
            shutil.copy(WEB / "wiki-data.json", Path(tmp, "wiki-data.json"))
            wiki_pages.write(tmp)
            first = {p.relative_to(tmp).as_posix(): p.read_bytes() for p in Path(tmp).rglob("*") if p.is_file()}
            wiki_pages.write(tmp)
            second = {p.relative_to(tmp).as_posix(): p.read_bytes() for p in Path(tmp).rglob("*") if p.is_file()}
            self.assertEqual(first, second)
            self.assertEqual(wiki_pages.check(tmp), [])


class Check(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.web = Path(self.tmp.name)
        shutil.copy(WEB / "wiki-data.json", self.web / "wiki-data.json")
        wiki_pages.write(self.web)

    def tearDown(self):
        self.tmp.cleanup()

    def test_a_fresh_folder_passes(self):
        self.assertEqual(wiki_pages.check(self.web), [])

    def test_a_deleted_page_fails(self):
        (self.web / "wiki/businesstypes-gym/index.html").unlink()
        self.assertEqual(wiki_pages.check(self.web), ["wiki/businesstypes-gym/index.html"])

    def test_an_edited_page_fails(self):
        page = self.web / "wiki/topic/how-rent-works/index.html"
        page.write_text(page.read_text(encoding="utf-8") + "<!-- edited -->", encoding="utf-8")
        self.assertEqual(wiki_pages.check(self.web), ["wiki/topic/how-rent-works/index.html"])

    def test_an_orphaned_page_fails_and_a_rebuild_removes_it(self):
        orphan = self.web / "wiki/gone/index.html"
        orphan.parent.mkdir()
        orphan.write_text("old", encoding="utf-8")
        self.assertEqual(wiki_pages.check(self.web), ["wiki/gone/index.html"])
        wiki_pages.write(self.web)
        self.assertFalse(orphan.parent.exists())
        self.assertEqual(wiki_pages.check(self.web), [])

    def test_a_stale_sitemap_fails(self):
        (self.web / "sitemap.xml").write_text("<urlset/>", encoding="utf-8")
        self.assertEqual(wiki_pages.check(self.web), ["sitemap.xml"])

    def test_line_endings_do_not_count(self):
        page = self.web / "wiki/index.html"
        page.write_bytes(page.read_bytes().replace(b"\n", b"\r\n"))
        self.assertEqual(wiki_pages.check(self.web), [])

    def test_build_web_check_reports_the_pages(self):
        with tempfile.TemporaryDirectory() as tmp:
            for rel in ("web/wiki-data.json", *build_web.STAMP_INPUTS, "web/version.json",
                        "web/index.html", "web/update.js", "ba_buildings.json", "ba_demand_curves.json",
                        "web/py/ba_save.py", "web/py/ba_dashboard.py", "web/py/ba_buildings.json",
                        "web/py/ba_demand_curves.json"):
                target = Path(tmp, rel)
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy(ROOT / rel, target)
            wiki_pages.write(Path(tmp, "web"))
            self.assertEqual(build_web.check(tmp), [])
            Path(tmp, "web/wiki/index.html").unlink()
            self.assertEqual(build_web.check(tmp), ["web/wiki/index.html"])


if __name__ == "__main__":
    unittest.main()
