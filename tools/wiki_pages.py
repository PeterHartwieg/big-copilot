"""Static wiki pages for search engines, written from the committed wiki-data.json.

    python tools/wiki_pages.py            # write web/wiki/, web/sitemap.xml, web/robots.txt
    python tools/wiki_pages.py --check    # list what is stale; write nothing

The in-app wiki (web/wiki.js) draws every entry from web/wiki-data.json inside
the board, so a search engine sees one URL and none of the text. This module
writes the same entries as plain, script-free HTML under web/wiki/:

    /wiki/                     the index: every topic, category and entry
    /wiki/c/<category id>/     one per category
    /wiki/<page id>/           one per help page
    /wiki/topic/<slug>/        one per hand-written topic

Furniture (521 entries of equipment stats) is left to the app: its category
gets no page, its entries get none, and a link to one goes to /#wiki/<id>.

Slugs are the payload's ids, unchanged, because they are linked from outside.
The markdown is rendered with the same inline and link rules as wikiInline and
wikiBody in web/wiki.js. Nothing here reads the installed game, so
build_web.py can regenerate and --check these pages from the committed payload
alone. The output is deterministic: sorted, no timestamps.

Each page carries its styles inline and fetches only /fonts/fonts.css from this
site, so the privacy notice's promises (no third-party requests, no analytics,
no scripts beyond the board's own) still hold.
"""
from __future__ import annotations

import argparse
import json
import os
import re
from xml.sax.saxutils import escape as xml_escape

SITE = "https://bigcopilot.com"
FURNITURE = "common_furniture"
TOPIC_LABEL = "Big Copilot topics"
OUT_DIR = "wiki"
SITEMAP = "sitemap.xml"
ROBOTS = "robots.txt"

# The shelf's order and labels, as web/wiki.js keeps them (WIKI_CAT_ORDER,
# WIKI_CAT_LABEL). Categories the list does not know come last, in file order.
CAT_ORDER = ("common_business_types", "common_sellable_products", "common_furniture",
             "help_importers", "common_factoryrecipes", "common_factorymachines",
             "common_factory_ingredients", "building_title", "employee_types",
             "employee_management", "vehicles_title", "rivals_title", "common_finance",
             "help_general")
CAT_LABEL = {"help_importers": "Wholesalers & importers"}

# An id becomes a path segment as it stands, so it may hold nothing a URL would
# have to escape, and may not shadow the two route prefixes.
SAFE_ID = re.compile(r"[a-z0-9][a-z0-9_-]*\Z")
RESERVED = {"c", "topic"}

FAVICON = ("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E"
           "%3Crect width='32' height='32' rx='7' fill='%230d100f'/%3E%3Ccircle cx='16' cy='16' "
           "r='8' fill='%2343c07a'/%3E%3C/svg%3E")

# The legal pages' palette, light or dark by the visitor's system setting.
CSS = """\
:root{--ground:#0d100f;--panel:#141816;--ink:#e9ece6;--ink-2:#9aa39d;--rule:#262c28;--accent:#43c07a;--on-accent:#0d100f;color-scheme:dark}
@media (prefers-color-scheme:light){:root{--ground:#eef0ea;--panel:#f7f8f4;--ink:#15181a;--ink-2:#5b6469;--rule:#d2d6cd;--accent:#00703a;--on-accent:#fff;color-scheme:light}}
body{margin:0;background:var(--ground);color:var(--ink);font:16px/1.6 Archivo,"Helvetica Neue",Arial,sans-serif}
.wp-top,main,.wp-foot{max-width:720px;margin:0 auto;padding:0 16px}
.wp-top{display:flex;gap:16px;align-items:center;justify-content:space-between;padding-top:16px;padding-bottom:16px;border-bottom:1px solid var(--rule)}
.wp-brand{font-weight:600;color:var(--ink);text-decoration:none}
main{padding-top:24px;padding-bottom:40px}
h1{font-size:30px;line-height:1.2;margin:4px 0 12px}
h2{font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-2);margin:32px 0 8px}
h3{font-size:16px;margin:20px 0 4px}
p,ul{margin:0 0 12px}
a{color:var(--accent);overflow-wrap:anywhere}
.wp-crumb{font-size:14px;color:var(--ink-2)}
.wp-crumb a{color:var(--ink-2)}
.wp-lede{font-size:18px;color:var(--ink-2)}
.wp-cta{display:flex;flex-wrap:wrap;gap:12px 20px;align-items:center;margin:16px 0 28px}
.wp-btn{display:inline-block;padding:10px 16px;border-radius:8px;background:var(--accent);color:var(--on-accent);font-weight:600;text-decoration:none}
.wp-list{columns:2 240px;column-gap:32px;padding-left:18px}
.wp-list li{break-inside:avoid}
.wp-src{font-size:14px;color:var(--ink-2);margin-top:28px;padding-top:12px;border-top:1px solid var(--rule)}
.wp-tbl{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:14px}
th,td{text-align:left;vertical-align:top;padding:6px 10px 6px 0;border-bottom:1px solid var(--rule)}
thead th{color:var(--ink-2);font-weight:500}
.wp-foot{display:flex;flex-wrap:wrap;gap:8px 20px;padding-top:16px;padding-bottom:32px;border-top:1px solid var(--rule);font-size:14px}
.wp-foot a{color:var(--ink-2)}
"""


# --- the game's markdown, as web/wiki.js reads it -------------------------------

def text(value) -> str:
    """Text between tags or inside an attribute; the same five as wikiText."""
    table = {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}
    return re.sub(r"[&<>\"']", lambda m: table[m.group(0)], "" if value is None else str(value))


INLINE = re.compile(r"\[([^\]\n]+)\]\(([^)\n]*)\)|\*\*([^*\n]+)\*\*")
ADDRESS = re.compile(r"^address\s*:", re.I)
BULLET = re.compile(r"^[*•‣-]\s+(.*)$")


class Site:
    """The payload, indexed for linking: which ids get a page, and where each goes."""

    def __init__(self, data: dict):
        self.data = data
        self.pages = [p for p in data.get("pages") or [] if p and p.get("id")]
        self.by_id = {str(p["id"]): p for p in self.pages}
        cats = [c for c in data.get("categories") or [] if c and c.get("id")]
        rank = {cid: i for i, cid in enumerate(CAT_ORDER)}
        self.categories = sorted(
            (c for c in cats if c["id"] != FURNITURE),
            key=lambda c: (rank.get(c["id"], len(CAT_ORDER)), cats.index(c)))
        self.cat_by_id = {c["id"]: c for c in cats}
        self.topics = sorted((t for t in data.get("topics") or [] if t and t.get("slug")),
                             key=lambda t: str(t["slug"]))
        self.guides = data.get("guides") if isinstance(data.get("guides"), dict) else {}
        # The pages that get a static page of their own: every help page outside furniture.
        self.static = [p for p in self.pages if p.get("categoryId") != FURNITURE]
        self.static_ids = {str(p["id"]) for p in self.static}
        for ident in sorted(self.static_ids | {str(c["id"]) for c in self.categories}
                            | {str(t["slug"]) for t in self.topics}):
            if not SAFE_ID.match(ident) or ident in RESERVED:
                raise ValueError(f"wiki id {ident!r} cannot be a URL path segment as it stands")

    def entries(self, cat_id: str) -> list[dict]:
        """A category's static entries, alphabetical, the way the app lists them."""
        found = [p for p in self.static if p.get("categoryId") == cat_id]
        return sorted(found, key=lambda p: (str(p.get("title") or p["id"]).casefold(), str(p["id"])))

    def href(self, page_id: str) -> str:
        """Where a link to a help page goes: its static page, or the app for furniture."""
        if page_id in self.static_ids:
            return f"/wiki/{page_id}/"
        return f"/#wiki/{page_id}"

    def link(self, label: str, target: str, here: str) -> str:
        to = (target or "").strip()
        if ADDRESS.match(to):
            return f'<span class="wp-addr">{text(label)}</span>'
        if to in self.by_id and to != here:
            return f'<a href="{text(self.href(to))}">{text(label)}</a>'
        return text(label)

    def inline(self, raw, here: str) -> str:
        """**bold** and [label](target), everything else escaped; wikiInline's rules."""
        source = "" if raw is None else str(raw)
        out, at = [], 0
        for m in INLINE.finditer(source):
            out.append(text(source[at:m.start()]))
            if m.group(1) is not None:
                out.append(self.link(m.group(1), m.group(2), here))
            else:
                out.append(f"<b>{self.inline(m.group(3), here)}</b>")
            at = m.end()
        out.append(text(source[at:]))
        return "".join(out)

    def body(self, raw, here: str) -> str:
        blocks = markdown_blocks(raw)
        if not blocks:
            return "<p>This page carries no text in the game's help file.</p>"
        html = []
        for kind, value in blocks:
            if kind == "ul":
                items = "".join(f"<li>{self.inline(i, here)}</li>" for i in value)
                html.append(f"<ul>{items}</ul>")
            elif kind == "h":
                html.append(f"<h3>{self.inline(re.sub(r':$', '', value), here)}</h3>")
            else:
                html.append("<p>" + "<br>".join(self.inline(line, here) for line in value) + "</p>")
        return "\n".join(html)


def is_label(line: str) -> bool:
    bare = line.replace("**", "").strip()
    return 0 < len(bare) <= 64 and bare.endswith(":") and not re.search(r"[.!?]", bare)


def markdown_blocks(raw) -> list[tuple[str, object]]:
    """wikiBlocks: bullets become a list, label lines a heading, the rest paragraphs."""
    blocks: list[tuple[str, object]] = []
    para: list[str] = []
    items: list[str] | None = None

    def flush():
        nonlocal para
        if para:
            blocks.append(("p", para))
            para = []

    for line in re.split(r"\r?\n", "" if raw is None else str(raw)):
        trimmed = line.strip()
        if not trimmed:
            flush()
            items = None
            continue
        bullet = BULLET.match(trimmed)
        if bullet:
            flush()
            if items is None:
                items = []
                blocks.append(("ul", items))
            items.append(bullet.group(1))
            continue
        if is_label(trimmed):
            flush()
            items = None
            blocks.append(("h", trimmed.replace("**", "").strip()))
            continue
        items = None
        para.append(trimmed)
    flush()
    return blocks


def plain(raw) -> str:
    """The body as one line of words: links keep their label, markup goes."""
    source = "" if raw is None else str(raw)
    source = re.sub(r"\[([^\]\n]+)\]\(([^)\n]*)\)", r"\1", source)
    source = source.replace("**", "")
    lines = []
    for line in source.splitlines():
        line = line.strip()
        bullet = BULLET.match(line)
        lines.append(bullet.group(1) if bullet else line)
    return re.sub(r"\s+", " ", " ".join(lines)).strip()


def description(raw, fallback: str) -> str:
    """The first sentence, cut at a word under 160 characters when it runs long."""
    words = plain(raw)
    m = re.match(r"(.+?[.!?])(?:\s|$)", words)
    first = m.group(1) if m else words
    if len(first) > 160:
        first = first[:157].rsplit(" ", 1)[0].rstrip(",;:") + "…"
    return first or fallback


# --- the pages ------------------------------------------------------------------

def cat_label(cat: dict) -> str:
    return CAT_LABEL.get(str(cat["id"]), cat.get("label") or cat["id"])


def document(*, path: str, title: str, desc: str, app: str, crumb: list[tuple[str, str]],
             heading: str, main: str) -> str:
    """One page. path is the site path ('/wiki/x/'); app the in-app route ('#wiki/x')."""
    trail = " › ".join(f'<a href="{text(href)}">{text(label)}</a>' if href else text(label)
                       for label, href in crumb)
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{text(title)}</title>
<meta name="description" content="{text(desc)}">
<link rel="canonical" href="{SITE}{text(path)}">
<link rel="icon" href="{FAVICON}">
<link rel="stylesheet" href="/fonts/fonts.css">
<style>
{CSS}</style>
</head>
<body>
<header class="wp-top"><a class="wp-brand" href="/">Big Copilot</a><a href="/wiki/">Big Ambitions wiki</a></header>
<main>
<nav class="wp-crumb" aria-label="Breadcrumb">{trail}</nav>
<h1>{text(heading)}</h1>
<p class="wp-cta"><a class="wp-btn" href="/">Open your save in Big Copilot</a><a href="/{text(app)}">Open in the app</a></p>
{main}
</main>
<footer class="wp-foot"><a href="/wiki/">Wiki index</a><a href="/">Big Copilot</a><a href="/impressum">Impressum</a><a href="/privacy">Privacy</a></footer>
</body>
</html>
"""


def guide_table(site: Site, guide: dict, here: str) -> str:
    """A business guide's products as one plain table: range, where sold, where from."""
    products = guide.get("PRODUCTS") if isinstance(guide.get("PRODUCTS"), dict) else {}
    fixtures = guide.get("FIXTURES") if isinstance(guide.get("FIXTURES"), dict) else {}
    suppliers = guide.get("SUPPLIERS") if isinstance(guide.get("SUPPLIERS"), dict) else {}
    if not products:
        return ""
    order = {"primary": 0, "secondary": 1}
    rows = []
    for key, prod in sorted(products.items(), key=lambda kv: (order.get(kv[1].get("rank"), 2),
                                                              str(kv[1].get("name") or kv[0]).casefold(), kv[0])):
        name = str(prod.get("name") or key)
        page = str(prod.get("pageId") or "")
        cell = site.link(name, page, here) if page else text(name)
        rank = "Primary" if prod.get("rank") == "primary" else "Secondary"
        if prod.get("kind") == "fee":
            rank += " (fee)"
        sold = ", ".join(str((fixtures.get(f) or {}).get("name") or f) for f in prod.get("fixtures") or [])
        supply = (["Wholesalers"] if prod.get("wholesale") else []) + [
            str((suppliers.get(k) or {}).get("name") or k) for k in prod.get("importers") or []]
        if not supply:
            supply = ["Collected automatically"] if prod.get("automatic") else (
                ["Service"] if prod.get("kind") == "fee" else ["Own production"] if prod.get("recipes") else [])
        rows.append(f"<tr><th scope=\"row\">{cell}</th><td>{text(rank)}</td>"
                    f"<td>{text(sold or '—')}</td><td>{text(', '.join(supply) or '—')}</td></tr>")
    return ("<h2>What it sells</h2>\n<div class=\"wp-tbl\"><table>"
            "<thead><tr><th scope=\"col\">Product</th><th scope=\"col\">Range</th>"
            "<th scope=\"col\">Sold from</th><th scope=\"col\">Supplied by</th></tr></thead>"
            f"<tbody>{''.join(rows)}</tbody></table></div>")


def topic_table(table) -> str:
    if not isinstance(table, dict) or not table.get("rows") or not table.get("columns"):
        return ""
    head = "".join(f'<th scope="col">{text(c)}</th>' for c in table["columns"])
    body = "".join("<tr>" + "".join(
        f'<th scope="row">{text(cell)}</th>' if i == 0 else f"<td>{text(cell)}</td>"
        for i, cell in enumerate(row)) + "</tr>" for row in table["rows"])
    label = f' aria-label="{text(table["caption"])}"' if table.get("caption") else ""
    return f'<div class="wp-tbl"><table{label}><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>'


HELP_SOURCE = ('<p class="wp-src">From the game\'s own in-game help (Big Ambitions by Hovgaard Games), '
               'as shipped with the game. Big Copilot reads your save and shows your businesses, '
               'supply and staffing against it.</p>')


def entry_page(site: Site, page: dict) -> str:
    pid = str(page["id"])
    title = str(page.get("title") or pid)
    cat = site.cat_by_id.get(str(page.get("categoryId")))
    crumb = [("Wiki", "/wiki/")]
    if cat:
        crumb.append((cat_label(cat), f"/wiki/c/{cat['id']}/"))
    main = f"<article>\n{site.body(page.get('body'), pid)}\n</article>"
    guide = site.guides.get(pid)
    if isinstance(guide, dict):
        main += "\n" + guide_table(site, guide, pid)
    main += "\n" + HELP_SOURCE
    return document(path=f"/wiki/{pid}/", title=f"{title} · Big Ambitions wiki",
                    desc=description(page.get("body"), f"{title}, from Big Ambitions' in-game help."),
                    app=f"#wiki/{pid}", crumb=crumb, heading=title, main=main)


def topic_page(site: Site, topic: dict) -> str:
    slug = str(topic["slug"])
    here = f"topic/{slug}"
    title = str(topic.get("title") or slug)
    parts = [f'<p class="wp-lede">{site.inline(topic.get("lede"), here)}</p>']
    for section in topic.get("sections") or []:
        parts.append(f"<h2>{text(section.get('heading'))}</h2>")
        parts.extend(f"<p>{site.inline(line, here)}</p>" for line in section.get("paragraphs") or [])
        parts.append(topic_table(section.get("table")))
    if topic.get("provenance"):
        parts.append(f'<p class="wp-src">{site.inline(topic["provenance"], here)}</p>')
    return document(path=f"/wiki/topic/{slug}/", title=f"{title} · Big Ambitions wiki",
                    desc=description(topic.get("lede"), title), app=f"#wiki/{here}",
                    crumb=[("Wiki", "/wiki/"), (TOPIC_LABEL, "")], heading=title,
                    main="\n".join(p for p in parts if p))


def entry_list(site: Site, pages: list[dict]) -> str:
    items = "".join(f'<li><a href="/wiki/{text(p["id"])}/">{text(p.get("title") or p["id"])}</a></li>'
                    for p in pages)
    return f'<ul class="wp-list">{items}</ul>'


def category_page(site: Site, cat: dict) -> str:
    label = cat_label(cat)
    entries = site.entries(cat["id"])
    count = f"{len(entries)} page{'' if len(entries) == 1 else 's'}"
    main = (f'<p class="wp-lede">{text(count)} from the game\'s own help, under {text(label)}.</p>\n'
            + entry_list(site, entries))
    return document(path=f"/wiki/c/{cat['id']}/", title=f"{label} · Big Ambitions wiki",
                    desc=f"Every Big Ambitions help page under {label}: {count}, as the game states them.",
                    app=f"#wiki/c/{cat['id']}", crumb=[("Wiki", "/wiki/"), (label, "")],
                    heading=label, main=main)


def index_page(site: Site) -> str:
    parts = ['<p class="wp-lede">The game\'s own in-game help for Big Ambitions, one page per entry, '
             'plus Big Copilot\'s own articles. Furniture is listed in the app.</p>']
    if site.topics:
        parts.append(f"<h2>{text(TOPIC_LABEL)}</h2>")
        items = "".join(f'<li><a href="/wiki/topic/{text(t["slug"])}/">{text(t.get("title") or t["slug"])}</a></li>'
                        for t in site.topics)
        parts.append(f'<ul class="wp-list">{items}</ul>')
    for cat in site.categories:
        parts.append(f'<h2><a href="/wiki/c/{text(cat["id"])}/">{text(cat_label(cat))}</a></h2>')
        parts.append(entry_list(site, site.entries(cat["id"])))
    parts.append(f'<p><a href="/#wiki/c/{FURNITURE}">Furniture, in the app</a></p>')
    return document(path="/wiki/", title="Big Ambitions wiki · Big Copilot",
                    desc="Every Big Ambitions help page, business guide and Big Copilot article, "
                         "readable without the game.",
                    app="#wiki", crumb=[("Wiki", "")], heading="Big Ambitions wiki", main="\n".join(parts))


def sitemap(paths: list[str]) -> str:
    urls = "".join(f"  <url><loc>{xml_escape(SITE + p)}</loc></url>\n" for p in paths)
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + "</urlset>\n")


def robots() -> str:
    return f"User-agent: *\nAllow: /\n\nSitemap: {SITE}/{SITEMAP}\n"


def build(data: dict) -> dict[str, str]:
    """Every generated file, keyed by its path under web/ with forward slashes."""
    site = Site(data)
    files: dict[str, str] = {f"{OUT_DIR}/index.html": index_page(site)}
    paths = ["/", "/wiki/"]
    for cat in site.categories:
        files[f"{OUT_DIR}/c/{cat['id']}/index.html"] = category_page(site, cat)
        paths.append(f"/wiki/c/{cat['id']}/")
    for topic in site.topics:
        files[f"{OUT_DIR}/topic/{topic['slug']}/index.html"] = topic_page(site, topic)
        paths.append(f"/wiki/topic/{topic['slug']}/")
    for page in sorted(site.static, key=lambda p: str(p["id"])):
        files[f"{OUT_DIR}/{page['id']}/index.html"] = entry_page(site, page)
        paths.append(f"/wiki/{page['id']}/")
    files[SITEMAP] = sitemap(paths)
    files[ROBOTS] = robots()
    return files


def load(web: str) -> dict:
    with open(os.path.join(web, "wiki-data.json"), encoding="utf-8") as fh:
        return json.load(fh)


def existing(web: str) -> set[str]:
    """What web/wiki/ holds now, as build() keys."""
    found = set()
    for folder, _dirs, names in os.walk(os.path.join(web, OUT_DIR)):
        for name in names:
            rel = os.path.relpath(os.path.join(folder, name), web)
            found.add(rel.replace(os.sep, "/"))
    return found


def check(web: str) -> list[str]:
    """Generated files that are missing, differ, or should not be there; sorted."""
    files = build(load(web))
    stale = set(existing(web) - set(files))
    for rel, content in files.items():
        try:
            with open(os.path.join(web, rel), encoding="utf-8", newline="") as fh:
                if fh.read().replace("\r\n", "\n") != content:
                    stale.add(rel)
        except FileNotFoundError:
            stale.add(rel)
    return sorted(stale)


def write(web: str) -> int:
    """Write every page, drop pages the payload no longer has; returns the page count."""
    files = build(load(web))
    for rel in sorted(existing(web) - set(files)):
        os.remove(os.path.join(web, rel))
    for folder, _dirs, _names in os.walk(os.path.join(web, OUT_DIR), topdown=False):
        if not os.listdir(folder):
            os.rmdir(folder)
    for rel, content in files.items():
        path = os.path.join(web, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        try:
            with open(path, encoding="utf-8", newline="") as fh:
                if fh.read() == content:
                    continue
        except FileNotFoundError:
            pass
        with open(path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(content)
    return len(files) - 2


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--web", default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "web"))
    parser.add_argument("--check", action="store_true", help="list stale files; write nothing")
    args = parser.parse_args()
    if args.check:
        stale = check(args.web)
        for rel in stale:
            print(f"stale: web/{rel}")
        raise SystemExit(1 if stale else 0)
    print(f"wrote {write(args.web)} wiki pages, {SITEMAP} and {ROBOTS}")
