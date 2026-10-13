"""The static wiki pages (tools/wiki_pages.py): every entry has one, slugs are
the payload's ids, links land, the output is stable, and --check notices drift.

Runs over the committed web/wiki-data.json, which is build output rather than a
save, plus small synthetic payloads for the markdown rules.
"""
from pathlib import Path
import html
import json
import re
import shutil
import subprocess
import tempfile
import unittest

import build_web
from tools import wiki_pages

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
# Read the way the build reads it, each guide with its shared tables put back.
DATA = wiki_pages.load(WEB)
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

    def test_no_two_pages_share_a_title(self):
        titles = {}
        for rel, body in HTML.items():
            title = re.search(r"<title>([^<]+)</title>", body).group(1)
            self.assertNotIn(title, titles, f"{rel} and {titles.get(title)}")
            titles[title] = rel
        self.assertIn("<title>Bag of Lettuce (Factory Ingredients) · Big Ambitions wiki</title>",
                      HTML["wiki/products-rawlettuce/index.html"])

    def test_guide_table_ranks_and_supply(self):
        body = HTML["wiki/businesstypes-bookstore/index.html"]
        table = body[body.index("<h2>What it sells</h2>"):]
        self.assertNotIn("Secondary", table)
        self.assertIn("<td>Additional</td>", table)
        # Sold by importers and made from a recipe: both are listed.
        self.assertRegex(table, r"Novel</a></th><td>Primary</td><td>[^<]*</td><td>[^<]*Own production</td>")
        self.assertLess(table.index("Youth Novel"), table.index("Flower (Cheap)"))

    def test_suppliers_are_named_not_keyed(self):
        # A guide lists its suppliers by site key; the table names them.
        for rel, body in HTML.items():
            self.assertNotIn("ba:street_", body, rel)
        raw = json.loads((WEB / "wiki-data.json").read_text(encoding="utf-8"))
        named = 0
        for pid, guide in raw["guides"].items():
            body = HTML[f"wiki/{pid}/index.html"]
            table = body[body.index("<h2>What it sells</h2>"):]
            for product in guide["PRODUCTS"].values():
                for key in product.get("importers") or []:
                    name = raw["SUPPLIERS"][key]["name"]
                    self.assertIn(wiki_pages.text(name), table, (pid, key))
                    named += 1
        self.assertGreater(named, 0, "no guide names an importer: the check proves nothing")

    def test_a_payload_built_without_load_still_names_suppliers(self):
        raw = json.loads((WEB / "wiki-data.json").read_text(encoding="utf-8"))
        self.assertEqual(wiki_pages.build(raw), FILES)

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


LD = re.compile(r'<script type="application/ld\+json">([^<]*)</script>')


def ld_graph(body: str) -> list[dict]:
    m = LD.search(body)
    return json.loads(m.group(1))["@graph"] if m else []


class NoScriptsNoThirdParties(unittest.TestCase):
    def test_pages_run_no_script_and_fetch_only_from_this_site(self):
        for rel, body in HTML.items():
            with self.subTest(rel=rel):
                # The one <script> allowed is a JSON-LD data block, which no
                # browser executes; anything else would break the privacy notice.
                self.assertEqual(body.lower().count("<script"), len(LD.findall(body)))
                self.assertLessEqual(len(LD.findall(body)), 1)
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

    def test_description_skips_titles_and_labels(self):
        cases = {
            "**Movement**\n* You move with *WASD* keys\n* Shift walks": "You move with WASD keys.",
            "**Title**\n\nThe text here!": "The text here!",
            "**Needs**:\n\nA line without an end": "A line without an end.",
            "Made by adding machines:\n* [One](b)\n* Two\n\nMore.": "Made by adding machines: One, Two.",
        }
        for body, want in cases.items():
            with self.subTest(body=body):
                self.assertEqual(wiki_pages.description(body, "fallback"), want)
        self.assertEqual(wiki_pages.description("**Only a title**", "fallback"), "Only a title.")
        self.assertEqual(wiki_pages.description("", "fallback"), "fallback")

    def test_real_descriptions_start_with_a_sentence(self):
        for rel, body in HTML.items():
            desc = re.search(r'<meta name="description" content="([^"]+)">', body).group(1)
            with self.subTest(rel=rel):
                self.assertNotIn("*", desc)
                self.assertRegex(desc, r"[.!?…]$")
        self.assertIn('content="Your character moves using mouse',
                      HTML["wiki/general-movement/index.html"])

    def test_an_id_that_is_not_a_path_segment_is_refused(self):
        for bad in ("Has Space", "c", "topic", "a/b"):
            with self.subTest(id=bad), self.assertRaises(ValueError):
                wiki_pages.build(self.site("", extra=[{"id": bad, "categoryId": "g", "title": "x", "body": ""}]))


def js_blocks(bodies: list[str]) -> list[list[tuple]]:
    """`wikiBlocks` from web/wiki.js, run in node over `bodies`, as Python's tuples.

    The slice runs from `wikiIsLabel` to `wikiBody`: the label rule and the
    block parser, which use nothing else from the board.
    """
    source = (WEB / "wiki.js").read_text(encoding="utf-8")
    start, end = "function wikiIsLabel(", "function wikiBody("
    for anchor in (start, end):
        if source.count(anchor) != 1:
            raise AssertionError("web/wiki.js holds %r %d times, expected once"
                                 % (anchor, source.count(anchor)))
    code = source[source.index(start):source.index(end)]
    script = code + """
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => { input += chunk; });
process.stdin.on("end", () => {
  process.stdout.write(JSON.stringify(JSON.parse(input).map(wikiBlocks)));
});
"""
    out = subprocess.run(["node", "-e", script], input=json.dumps(bodies), check=True,
                         text=True, encoding="utf-8", capture_output=True).stdout
    shape = {"p": "lines", "ul": "items", "h": "line"}
    return [[(block["kind"], block[shape[block["kind"]]]) for block in blocks]
            for blocks in json.loads(out)]


class ParserParity(unittest.TestCase):
    """The static pages and the in-board reader parse help text with their own
    copies of one rule set (`markdown_blocks`/`is_label` here, `wikiBlocks`/
    `wikiIsLabel` in web/wiki.js). These tests hold the two to each other."""

    def assertSameBlocks(self, bodies):
        js = js_blocks(bodies)
        self.assertEqual(len(js), len(bodies))
        for body, theirs in zip(bodies, js):
            ours = [(kind, list(value) if isinstance(value, list) else value)
                    for kind, value in wiki_pages.markdown_blocks(body)]
            if ours != theirs:
                self.fail("markdown_blocks and wikiBlocks disagree on %r:\npython %r\njs     %r"
                          % (body[:200], ours, theirs))

    def test_every_committed_page_body_parses_the_same(self):
        bodies = [page.get("body") or "" for page in DATA["pages"]]
        self.assertGreater(len(bodies), 100)
        self.assertSameBlocks(bodies)

    def test_the_edges_of_the_rules_parse_the_same(self):
        self.assertSameBlocks([
            "",
            "**Needs**:\n* one\n- two\n• three\n‣ four\n\nLine one\r\nline two",
            "x" * 63 + ":",                 # a label at the limit
            "x" * 64 + ":",
            "x" * 65 + ":",                 # one over: a paragraph
            "**" + "y" * 64 + "**:",        # bold marks do not count
            "Ends here.:",                  # a sentence is never a label
            "Wait!:",
            "No colon",
            "  * indented bullet\n*not a bullet\n-",
            "Para\nLabel:\n* item\nAfter list\n\n\n* new list",
        ])


class ShareAndStructuredData(unittest.TestCase):
    def meta(self, body, attr, name):
        m = re.search(rf'<meta {attr}="{re.escape(name)}" content="([^"]*)">', body)
        return m and m.group(1)

    def test_every_page_has_open_graph_and_twitter_tags_matching_its_head(self):
        for rel, body in HTML.items():
            with self.subTest(rel=rel):
                title = re.search(r"<title>([^<]+)</title>", body).group(1)
                desc = self.meta(body, "name", "description")
                url = "https://bigcopilot.com" + site_path(rel)
                self.assertEqual(self.meta(body, "property", "og:title"), title)
                self.assertEqual(self.meta(body, "property", "og:description"), desc)
                self.assertEqual(self.meta(body, "property", "og:url"), url)
                self.assertEqual(self.meta(body, "property", "og:site_name"), "Big Copilot")
                self.assertEqual(self.meta(body, "name", "twitter:card"), "summary")
                self.assertEqual(self.meta(body, "name", "twitter:title"), title)
                self.assertEqual(self.meta(body, "name", "twitter:description"), desc)
                self.assertIn(f'<link rel="canonical" href="{url}">', body)
                article = rel.count("/") == 2 or rel.startswith("wiki/topic/")
                self.assertEqual(self.meta(body, "property", "og:type"), "article" if article else "website")

    def test_json_ld_parses_and_names_this_page(self):
        for rel, body in HTML.items():
            url = "https://bigcopilot.com" + site_path(rel)
            with self.subTest(rel=rel):
                graph = ld_graph(body)
                if rel == "wiki/index.html":
                    self.assertEqual(graph, [])
                    continue
                crumbs = [n for n in graph if n["@type"] == "BreadcrumbList"]
                self.assertEqual(len(crumbs), 1)
                items = crumbs[0]["itemListElement"]
                self.assertEqual([i["position"] for i in items], list(range(1, len(items) + 1)))
                self.assertEqual(items[0]["item"], "https://bigcopilot.com/wiki/")
                self.assertEqual(items[-1]["item"], url)
                self.assertEqual(items[-1]["name"], html.unescape(re.search(r"<h1>([^<]+)</h1>", body).group(1)))
                for item in items:
                    self.assertTrue(item["item"].startswith("https://bigcopilot.com/wiki/"))

    def test_entries_are_articles_dated_by_the_game_help(self):
        graph = ld_graph(HTML["wiki/businesstypes-bookstore/index.html"])
        crumbs, article = graph
        self.assertEqual([i["name"] for i in crumbs["itemListElement"]],
                         ["Wiki", "Business Types", "Bookstore"])
        self.assertEqual(article["@type"], "Article")
        self.assertEqual(article["headline"], "Bookstore")
        self.assertEqual(article["inLanguage"], "en")
        self.assertEqual(article["dateModified"], DATA["provenance"]["sourceDate"])
        # A hand-written topic is not dated by the game's help.
        topic = ld_graph(HTML["wiki/topic/how-rent-works/index.html"])
        self.assertEqual([n["@type"] for n in topic], ["BreadcrumbList", "Article"])
        self.assertNotIn("dateModified", topic[1])
        self.assertEqual([n["@type"] for n in ld_graph(HTML["wiki/c/common_business_types/index.html"])],
                         ["BreadcrumbList"])

    def test_json_ld_cannot_close_its_tag(self):
        page = {"id": "a", "categoryId": "g", "title": "A </script><b>&", "body": "x."}
        data = {"pages": [page], "categories": [{"id": "g", "label": "G", "pageIds": ["a"]}],
                "guides": {}, "topics": []}
        body = wiki_pages.build(data)["wiki/a/index.html"]
        block = LD.search(body).group(1)
        self.assertNotIn("<", block)
        self.assertEqual(json.loads(block)["@graph"][1]["headline"], "A </script><b>&")


class Sitemap(unittest.TestCase):
    def test_sitemap_lists_exactly_the_generated_pages(self):
        locs = re.findall(r"<loc>([^<]+)</loc>", FILES["sitemap.xml"])
        self.assertEqual(len(locs), len(set(locs)))
        expected = {"https://bigcopilot.com/"} | {"https://bigcopilot.com" + site_path(rel) for rel in HTML}
        self.assertEqual(set(locs), expected)

    def test_lastmod_is_the_game_help_date_on_pages_drawn_from_it(self):
        date = DATA["provenance"]["sourceDate"]
        self.assertRegex(date, r"^\d{4}-\d{2}-\d{2}$")
        urls = dict(re.findall(r"<url><loc>([^<]+)</loc>(?:<lastmod>([^<]+)</lastmod>)?</url>",
                               FILES["sitemap.xml"]))
        for loc, lastmod in urls.items():
            with self.subTest(loc=loc):
                undated = loc in ("https://bigcopilot.com/", "https://bigcopilot.com/wiki/") or "/wiki/topic/" in loc
                self.assertEqual(lastmod, "" if undated else date)

    def test_no_lastmod_without_a_source_date(self):
        for provenance in (None, {}, {"sourceDate": "23 Sep"}):
            data = {"pages": [{"id": "a", "categoryId": "g", "title": "A", "body": "x."}],
                    "categories": [{"id": "g", "label": "G", "pageIds": ["a"]}], "guides": {}, "topics": []}
            if provenance is not None:
                data["provenance"] = provenance
            with self.subTest(provenance=provenance):
                files = wiki_pages.build(data)
                self.assertNotIn("<lastmod>", files["sitemap.xml"])
                self.assertNotIn("dateModified", files["wiki/a/index.html"])

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
            for rel in ("web/wiki-data.json", "web/wiki-data.min.json", *build_web.STAMP_INPUTS, "web/version.json",
                        *build_web.worker_assets()[1],
                        "web/index.html", "web/translate/index.html", "web/update.js", *build_web.PY_COPIED,
                        *(f"web/py/{name}" for name in build_web.PY_COPIED)):
                target = Path(tmp, rel)
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy(ROOT / rel, target)
            wiki_pages.write(Path(tmp, "web"))
            self.assertEqual(build_web.check(tmp), [])
            Path(tmp, "web/wiki/index.html").unlink()
            self.assertEqual(build_web.check(tmp), ["web/wiki/index.html"])


if __name__ == "__main__":
    unittest.main()
