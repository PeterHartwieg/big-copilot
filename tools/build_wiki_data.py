"""Build the public wiki payload (web/wiki-data.json) from the game's own files.

    python tools/build_wiki_data.py --out web/wiki-data.json

Reads the same sources as the catalogue extractor - the shipped locale, the
help menu's table of contents, Big Copilot's building table, and the shipped
business layouts - and writes one JSON file the site can serve: every help page
as a page record, plus the worked example the wiki page renders. Nothing in it
comes from a save, and no number is invented here: capacities, rates,
addresses and names are read from the game text on every build, and what the
game does not state is `null`, never a value carried over from the last build.

Authored wording lives in `tools/wiki_sample.json` (labels, notes, the gap
sentences); this module fills it with facts and leaves out any sentence its
check cannot support. Output is deterministic apart from real source changes:
there is no run timestamp, so an unchanged install builds byte-identical
output. `build_web.py` calls `write_public_wiki` before stamping, so a rebuilt
site always ships the payload its pages were built against.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import extract_wiki  # noqa: E402  (path normalisation and Steam manifest lookup)
import wiki_data  # noqa: E402

SCHEMA = "ba-wiki-public"
SCHEMA_VERSION = 1
# Where the authored wording lives, beside this file.
WORDING_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "wiki_sample.json")
DEFAULT_OUT = os.path.join("web", "wiki-data.json")

# The worked example the wiki page renders. The selection is authored - this is
# the Gift Shop page's cast - and every value under it is read from the game.
SAMPLE_BUSINESS = "giftshop"
SAMPLE_FIXTURES = (
    "roundedshelf",
    "productpanel",
    "stackofshoppingbaskets",
    "cashregister",
    "checkoutcounterleft",
    "checkoutcounterright",
    "storageshelf",
)
SAMPLE_PRODUCTS = ("cheapgift", "expensivegift", "umbrella")
RETAIL_SIZES_PAGE = "building_types"
WHOLESALER_PAGE = "wholesalers_locations"

# Shipped layouts the placement counts come from: (label, path under
# StreamingAssets). A layout shows where the game's own shop puts things; it
# says nothing about what a layout must contain, and the wording keeps to that.
SAMPLE_LAYOUTS = (
    ("GiftShopRivals", "BusinessLayouts/GiftShop/M1/GiftShopRivals.json"),
    ("GolfAreaGiftShop", "BusinessLayouts/GiftShop/D3/GolfAreaGiftShop.json"),
    ("TennisAreaGiftShop", "BusinessLayouts/GiftShop/D3/TennisAreaGiftShop.json"),
)

# Help addresses are written `<number> <street><suffix>` - `13 5a` is 13 Fifth
# Avenue, `8 pier` is Pier 8. The suffix letters are the game's own shorthand,
# and the street slugs are the building table's.
_ADDRESS_RE = re.compile(r"^(\d+)\s+(\d*)([a-z]+)$")
_ORDINALS = {
    1: "first", 2: "second", 3: "third", 4: "fourth", 5: "fifth", 6: "sixth",
    7: "seventh", 8: "eighth", 9: "ninth", 10: "tenth", 11: "eleventh",
    12: "twelfth", 13: "thirteenth", 14: "fourteenth", 15: "fifteenth",
    16: "sixteenth", 17: "seventeenth", 18: "eighteenth", 19: "nineteenth",
    20: "twentieth", 21: "twentyfirst", 22: "twentysecond", 23: "twentythird",
    24: "twentyfourth", 25: "twentyfifth", 26: "twentysixth",
}
_SUFFIXES = {
    "a": "avenue",
    "s": "street",
    "bw": "broadwaystreet",
    "pier": "pier",
    "tur": "hamptonsturnpike",
}

# The links the help uses, as the catalogue extractor parses them; sharing its
# pattern keeps a link the game rewrites a miss in both places, not one.
_LINK_RE = wiki_data._LINK_RE
_ADDRESS_KINDS = ("address", "location")
# Link kinds whose target is a page slug outright (`(general-energy)`), as
# against naming a record through a known prefix (`(products-clay)`).
_SLUG_LINK_KINDS = (
    "wholesalers", "importers", "fees", "logistics", "vehicles", "employees",
    "general", "rivals", "finance", "building", "special", "minor",
)

# A place on this machine must never reach the payload, in any string.
_PRIVATE_PATH_RE = re.compile(r"(?i)([a-z]:[\\/]|/users/|\\users\\|/home/|file://)")

_INLINE_CAPACITY_RE = re.compile(r"^\*\*Product Capacity:\*\*\s*([\d,]+)\s*([A-Za-z]*)\s*$", re.M)
_RETAIL_SIZE_RE = re.compile(
    r"\*\*(?P<code>[A-Z]\d+)\*\*:\s*(?P<area>[\d,]+)\s*m\s*\(.*?\)\s*/\s*"
    r"(?P<customers>[\d,]+)\s*customer capacity"
)
_UNITY_RE = re.compile(rb"[0-9]{4}\.[0-9]+\.[0-9]+[a-z][0-9]+")
_MONEY_FIGURE_RE = re.compile(r"\$\s*[\d,]+|price\D{0,12}\d", re.I)
_AT_LEAST_ONE_RE = re.compile(r"at least one product", re.I)
_PLACEHOLDER_RE = re.compile(r"\{[a-zA-Z][a-zA-Z0-9]*\}")


def wording() -> dict:
    """The authored sentences, read per build."""
    with open(WORDING_PATH, encoding="utf-8") as fh:
        return json.load(fh)


# --- sources -------------------------------------------------------------


def load_buildings(repo_root: str | None = None,
                   buildings_path: str | None = None) -> tuple[dict, dict | None, str | None]:
    """ba_buildings.json as {(street slug, number): row}, plus how it was read.

    The table is Big Copilot's own file, not a game asset, so it is optional
    here in a way the locale is not. A missing or unreadable table costs the
    suppliers their neighbourhood, size, area and traffic; that loss comes back
    as a reason string the payload records, never a default and never a path.
    """
    path = buildings_path or os.path.join(
        repo_root or os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "ba_buildings.json",
    )
    try:
        with open(path, "rb") as fh:
            raw = fh.read()
        rows = json.loads(raw.decode("utf-8-sig"))
    except (OSError, ValueError):
        return {}, None, "ba_buildings.json is missing or unreadable"
    if not isinstance(rows, list):
        return {}, None, "ba_buildings.json is not a list of building rows"
    table = {(row["s"], row["n"]): row for row in rows if isinstance(row, dict) and row.get("s")}
    meta = {
        "path": "ba_buildings.json",
        "bytes": len(raw),
        "sha256": wiki_data.sha256_hex(raw),
        "mtime": None,  # a checkout refreshes it without the content changing
        "count": len(rows),
    }
    return table, meta, None


def parse_address(raw: str) -> tuple[str, int] | None:
    """`13 5a` as the building table's (street slug, number), or None."""
    match = _ADDRESS_RE.match((raw or "").strip())
    if not match:
        return None
    number, ordinal, suffix = int(match.group(1)), match.group(2), match.group(3)
    word = _SUFFIXES.get(suffix)
    if word is None:
        return None
    street = "ba:street_" + (_ORDINALS[int(ordinal)] + word if ordinal else word)
    return street, number


def site_key(address: tuple[str, int]) -> str:
    """The canonical key the board and the map page use for a building."""
    return "%s#%d" % address


def street_label(address: tuple[str, int]) -> str:
    """`13 5th Avenue`, from the street slugs the save reader already splits."""
    from ba_save import Names  # re-splitting street slugs is the save reader's job

    return "%d %s" % (address[1], Names(locale={}).street(address[0]))


def source_meta(relative: str, path: str) -> dict:
    """One source file as the payload records it: game-relative path and hash."""
    data = wiki_data.read_source(path)
    return {
        "path": relative,
        "bytes": len(data),
        "sha256": wiki_data.sha256_hex(data),
        "mtime": wiki_data.modified_utc(path),
    }


def app_identity(data_dir: str) -> tuple[str | None, str | None]:
    """(product, unity version) as the install states them, or nulls."""
    try:
        company, _, product = open(  # app.info is two lines: company, then product
            os.path.join(data_dir, "app.info"), encoding="utf-8-sig"
        ).read().strip().partition("\n")
    except (OSError, ValueError):
        return None, None
    product = product.strip() or None
    company = company.strip()
    unity = None
    try:
        with open(os.path.join(data_dir, "globalgamemanagers"), "rb") as fh:
            head = fh.read(8192)
        match = _UNITY_RE.search(head)
        if match:
            unity = match.group(0).decode("ascii")
    except OSError:
        pass
    if product and company:
        product = "%s - %s" % (product, company)
    return product, unity


# --- the help, as pages --------------------------------------------------


def build_pages(help_pages: list[dict], locale: dict[str, str]) -> tuple[list[dict], list[dict], list[dict]]:
    """The help menu as page records: one per unique slug, in menu order.

    A slug listed twice keeps its first entry - the shipped file carries one
    such double entry, whose second `pageLocalizorKeyPrefix` is unreachable
    through that slug, so it is reported rather than quietly dropped. A page
    whose text the locale does not carry is left out and reported too: a page
    record with no body would be an empty page, not a fact.
    """
    pages: list[dict] = []
    duplicates: list[dict] = []
    without_content: list[dict] = []
    seen: set[str] = set()
    for entry in help_pages:
        slug, prefix = entry.get("slug"), entry.get("prefix")
        if not slug or not prefix:
            continue
        if slug in seen:
            duplicates.append({"slug": slug, "category": entry.get("category"), "prefix": prefix})
            continue
        body = locale.get("help_%s_content" % prefix)
        if body is None:
            without_content.append({"slug": slug, "prefix": prefix})
            continue
        seen.add(slug)
        pages.append(
            {
                "id": slug,
                "categoryId": entry.get("category"),
                "title": locale.get(prefix) or slug,
                "body": body,
            }
        )
    return pages, duplicates, without_content


def build_categories(help_pages: list[dict], locale: dict[str, str], pages: list[dict]) -> list[dict]:
    """The menu's categories in file order, counting the pages that survived."""
    counts = Counter(page["categoryId"] for page in pages)
    order: list[str] = []
    for entry in help_pages:
        category = entry.get("category")
        if category and category not in order:
            order.append(category)
    return [
        {
            "id": category,
            "label": locale.get(category) or category,
            "count": counts.get(category, 0),
            "pageIds": [page["id"] for page in pages if page["categoryId"] == category],
        }
        for category in order
    ]


def page_slug_by_prefix(help_pages: list[dict]) -> dict[str, str]:
    """`ba:businesstype_giftshop` -> the page slug it is listed under."""
    mapping: dict[str, str] = {}
    for entry in help_pages:
        if entry.get("slug") and entry.get("prefix"):
            mapping.setdefault(entry["prefix"], entry["slug"])
    return mapping


# --- suppliers -----------------------------------------------------------


def canonical_importer_names(help_pages: list[dict], locale: dict[str, str]) -> dict[str, str]:
    """Each importer's own name for itself, keyed by its building.

    The help links one pier under more than one spelling (`JetCargo Imports`,
    `Jet Cargo Imports`). The importer's own page, and the `importertypename_*`
    key beside it, carry the game's spelling; link text is only evidence.
    """
    canonical: dict[str, str] = {}
    for entry in help_pages:
        prefix = entry.get("prefix") or ""
        if not prefix.startswith("importertypename_"):
            continue
        name = locale.get(prefix)
        text = locale.get("help_%s_content" % prefix, "")
        address = None
        for match in _LINK_RE.finditer(text):
            if match.group(2) in _ADDRESS_KINDS:
                address = parse_address(match.group(3))
                break
        if name and address:
            canonical[site_key(address)] = name
    return canonical


def importer_page_by_key(help_pages: list[dict], locale: dict[str, str]) -> dict[str, str]:
    """The importer page each building is written up on, keyed by building."""
    pages: dict[str, str] = {}
    for entry in help_pages:
        prefix = entry.get("prefix") or ""
        if not prefix.startswith("importertypename_") or not locale.get(prefix):
            continue
        for match in _LINK_RE.finditer(locale.get("help_%s_content" % prefix, "")):
            if match.group(2) in _ADDRESS_KINDS:
                address = parse_address(match.group(3))
                if address:
                    pages[site_key(address)] = prefix
                break
    return pages


def context_label(sections: list[dict], match: re.Match) -> str:
    """The heading the link sits under, or 'prose' when it sits in a sentence."""
    for section in sections:
        if any(match.group(0) in bullet for bullet in section["bullets"]):
            return wiki_data.key_of(section["label"])
    return "prose"


def collect_suppliers(
    locale: dict[str, str],
    buildings: dict,
    records: list[dict],
    importer_names: dict[str, str],
) -> tuple[dict, list[dict]]:
    """Every address the help links, as one supplier per building.

    Mentions count distinct help pages, and a supplier's kind is the kind of
    section it was linked in: a furniture vendor is an address the help sends
    you to for furniture, not a role anyone assigned it. An address the
    building table does not know still gets an entry, with the fields the table
    would have filled left `null` and the miss reported.
    """
    kinds = wording()["supplierKinds"]
    seen: dict[str, dict] = {}

    def slot(key: str, raw: str) -> dict:
        if key not in seen:
            seen[key] = {
                "raw": raw,
                "names": Counter(),
                "contexts": Counter(),
                "pages": set(),
                "address": parse_address(raw),
            }
        return seen[key]

    for key in sorted(locale):
        text = locale[key]
        if not (key.endswith("_content") and isinstance(text, str)):
            continue
        _, sections = wiki_data.sections(text)
        for match in _LINK_RE.finditer(text):
            if match.group(2) not in _ADDRESS_KINDS:
                continue
            raw = match.group(3).strip()
            address = parse_address(raw)
            entry = slot(site_key(address) if address else "unparsed:" + raw, raw)
            entry["names"][match.group(1)] += 1
            entry["contexts"][context_label(sections, match)] += 1
            entry["pages"].add(key)

    # What each importer imports, so a raw-goods pier reads differently from a
    # retail one: the item pages that link it say what kind of item it carries.
    imported: dict[str, Counter] = {}
    for record in records:
        if record.get("type") != "item":
            continue
        for ref in (record.get("suppliers") or {}).get("importers") or []:
            address = parse_address(ref.get("address") or "")
            if address and record.get("kind"):
                imported.setdefault(site_key(address), Counter())[record["kind"]] += 1

    suppliers, issues = {}, []
    for key, entry in sorted(seen.items()):
        address = entry["address"]
        if importer_names.get(key):
            # The game's own spelling wins over how a help page happened to link it.
            name = importer_names[key]
        else:
            name = sorted(entry["names"].items(), key=lambda item: (-item[1], item[0]))[0][0]
        labels: list[str] = []
        for context, _ in sorted(entry["contexts"].items(), key=lambda item: (-item[1], item[0])):
            label = kinds.get(context, kinds.get("_fallback", ""))
            if label and label not in labels:
                labels.append(label)
        if key in imported:
            dominant = sorted(imported[key].items(), key=lambda item: (-item[1], item[0]))[0][0]
            labels = [wording()["importerKinds"].get(dominant, "Importer") if label == "Importer"
                      else label for label in labels]
        row = buildings.get(address) if address else None
        suppliers[key] = {
            "name": name,
            "raw": "address:" + entry["raw"],
            "street": street_label(address) if address else None,
            "hood": row["h"] if row else None,
            "kind": " + ".join(labels) or kinds.get("_fallback", "Named in help"),
            "size": row["z"] if row else None,
            "area": row["m"] if row else None,
            "traffic": row["x"] if row else None,
            "mentions": len(entry["pages"]),
        }
        if row is None:
            issues.append({"key": key, "raw": entry["raw"], "reason": "no building in ba_buildings.json"})
    return suppliers, issues


def pier_flag(suppliers: dict) -> dict[str, str]:
    """A note for the piers, whose neighbourhoods the building table splits.

    The help treats the import piers alike; the table puts them in three
    neighbourhoods. That disagreement is worth a sentence, and only while it
    is true - when the table ever settles on one neighbourhood, no note ships.
    """
    hoods = sorted({s["hood"] for key, s in suppliers.items()
                    if key.startswith("ba:street_pier#") and s["hood"]})
    if len(hoods) < 2:
        return {}
    detail = wording()["pierFlag"].format(hoods=", ".join(hoods))
    return {key: detail for key in suppliers if key.startswith("ba:street_pier#")}


def collect_wholesalers(locale: dict[str, str], buildings: dict) -> list[dict]:
    """The wholesalers the help's own locations page lists, in page order."""
    text = locale.get("help_%s_content" % WHOLESALER_PAGE, "")
    out = []
    for match in _LINK_RE.finditer(text):
        if match.group(2) not in _ADDRESS_KINDS:
            continue
        address = parse_address(match.group(3))
        row = buildings.get(address) if address else None
        out.append(
            {
                "name": match.group(1),
                "raw": "address:" + match.group(3).strip(),
                "street": street_label(address) if address else None,
                "hood": row["h"] if row else None,
                "traffic": row["x"] if row else None,
            }
        )
    return out


def wholesaler_products(locale: dict[str, str]) -> list[str]:
    """The item slugs the wholesaler page says it carries."""
    _, sections = wiki_data.sections(locale.get("help_%s_content" % WHOLESALER_PAGE, ""))
    bullets = wiki_data.bullets_of(sections, "wholesaler products")
    slugs = []
    for bullet in bullets:
        for match in _LINK_RE.finditer(bullet):
            if match.group(2) in ("products", "fees"):
                slugs.append(match.group(3))
    return slugs


# --- layout placement ----------------------------------------------------


def layout_counts(streaming_dir: str | None) -> tuple[list[dict], list[dict]]:
    """Placed-item counts per shipped layout, with the layout's own build number.

    A layout is evidence of placement only, which is the only claim the sample
    makes from it. A layout that is missing or unreadable is recorded as a gap;
    the counts the other layouts still support are kept.
    """
    counted, issues = [], []
    for label, relative in SAMPLE_LAYOUTS:
        path = os.path.join(streaming_dir, relative.replace("/", os.sep)) if streaming_dir else None
        try:
            data = json.loads(wiki_data.read_source(path).decode("utf-8-sig"))
            if not isinstance(data, dict) or not isinstance(data.get("Items", []), list):
                raise ValueError("invalid layout shape")
            if any(not isinstance(item, dict) for item in data.get("Items", [])):
                raise ValueError("invalid layout item")
        except (wiki_data.SourceError, ValueError, TypeError):
            issues.append({"layout": label, "reason": "%s is not readable" % relative})
            continue
        counted.append(
            {
                "label": label,
                "path": "Big Ambitions_Data/StreamingAssets/" + relative,
                "size": relative.split("/")[2] or None,
                "build": data.get("buildNumber"),
                "items": len(data.get("Items") or []),
                "counts": Counter(item.get("itemName") for item in data.get("Items") or []),
            }
        )
    return counted, issues


def observed_text(layouts: list[dict], slug: str) -> str | None:
    """`10 in GiftShopRivals (M1), 4 in GolfAreaGiftShop (D3)` for one fixture."""
    parts = ["%d in %s (%s)" % (layout["counts"].get("ba:itemname_" + slug, 0),
                                layout["label"], layout["size"]) for layout in layouts]
    return ", ".join(parts) + "." if parts else None


# --- the worked example --------------------------------------------------


class Sample:
    """The Gift Shop page's cast, each value read from the catalogue records.

    The sections cross-reference each other: a fixture names the suppliers that
    sell it, a product names the fixtures that hold it, a recipe names the
    importers its ingredients come from. Pages touched along the way are
    recorded, so each category can say how much of it the worked example
    actually covers.
    """

    def __init__(self, locale, records, suppliers, layouts, wholesale_slugs, slugs_by_prefix,
                 importer_pages=None):
        self.locale = locale
        self.records = {record["slug"]: record for record in records}
        self.suppliers = suppliers
        self.layouts = layouts
        self.wholesale_slugs = set(wholesale_slugs)
        self.slugs_by_prefix = slugs_by_prefix
        self.importer_pages = importer_pages or {}
        self.touched: set[str] = set()
        self._recipes: dict | None = None
        self._product_slugs: list[str] | None = None

    # -- helpers
    def touch(self, prefix: str) -> None:
        self.touched.add(prefix)

    def page_slug(self, prefix: str) -> str | None:
        self.touch(prefix)
        return self.slugs_by_prefix.get(prefix)

    def supplier_key(self, raw: str | None) -> str | None:
        """A help address as a supplier key, or None when it cannot be placed."""
        address = parse_address(raw or "")
        if not address:
            return None
        key = site_key(address)
        prefix = self.importer_pages.get(key)
        if prefix:  # the importer's own page is part of what the sample leans on
            self.touch(prefix)
        return key

    def name_of(self, slug: str | None) -> str | None:
        return self.locale.get(slug) if slug else None

    def product_slugs(self) -> list[str]:
        """The products the sample describes, from this build's own primary list.

        The Gift Shop page names its primary products, so the sample follows it
        rather than a list frozen when the sample was written: a build that adds
        a fourth core product gains a fourth entry here instead of a silently
        narrower sample. The authored extras keep their places at the end.
        """
        if self._product_slugs is None:
            business = self.records.get("ba:businesstype_" + SAMPLE_BUSINESS) or {}
            slugs = [ref["slug"].removeprefix("ba:itemname_")
                     for ref in (business.get("products") or {}).get("primary") or []]
            for slug in SAMPLE_PRODUCTS:
                if slug not in slugs:
                    slugs.append(slug)
            self._product_slugs = slugs
        return self._product_slugs

    # -- sections
    def fixture_slugs(self) -> list[str]:
        """Keep the authored setup pieces plus current product relationships."""
        slugs = set(SAMPLE_FIXTURES)
        products = {"ba:itemname_" + slug for slug in self.product_slugs()}
        for prefix in products:
            slugs.update(ref["slug"].removeprefix("ba:itemname_")
                         for ref in (self.records.get(prefix) or {}).get("furniture") or [])
        for record in self.records.values():
            if any(ref["slug"] in products for ref in record.get("sells") or []):
                slugs.add(record["slug"].removeprefix("ba:itemname_"))
        return list(SAMPLE_FIXTURES) + sorted(slugs - set(SAMPLE_FIXTURES))

    def fixtures(self) -> dict:
        out = {}
        for slug in self.fixture_slugs():
            prefix = "ba:itemname_" + slug
            record = self.records.get(prefix)
            text = self.locale.get("help_%s_content" % prefix, "")
            _, sections = wiki_data.sections(text)
            capacity = [
                {"label": row["label"], "value": row["value"], "unit": "units"}
                for row in ((record or {}).get("capacities") or {}).get("product") or []
            ]
            if not capacity:
                inline = _INLINE_CAPACITY_RE.search(text)
                if inline:
                    unit = inline.group(2) or ""
                    capacity = [{
                        "label": unit or "Products",
                        "value": int(inline.group(1).replace(",", "")),
                        "unit": (unit or "units").lower(),
                    }]
            needs, _ = wiki_data.parse_bullets(
                wiki_data.bullets_of(sections, "requires the following products"),
                ("products", "fees"))
            mounts, _ = wiki_data.parse_bullets(
                wiki_data.bullets_of(sections, "must be placed on one of the following"),
                ("furniture",))
            for ref in needs + mounts:
                self.touch(ref.get("slug") or "")
            station = re.search(r"requires employees with \[([^\]]+)\]\(skill-", text)
            self.page_slug(prefix)
            out[slug] = {
                "name": self.name_of(prefix),
                "src": "help_%s_content" % prefix,
                "sells": [ref["slug"].removeprefix("ba:itemname_")
                          for ref in (record or {}).get("sells") or []],
                "capacity": capacity,
                "customers": ((record or {}).get("capacities") or {}).get("customer"),
                "vendors": [key for key in (
                    self.supplier_key(ref.get("address"))
                    for ref in (record or {}).get("suppliers", {}).get("purchasableFrom") or []
                ) if key],
                "observed": observed_text(self.layouts, slug),
                "station": station.group(1) if station else None,
                "needs": [ref["name"] for ref in needs] or None,
                "mount": _join_or([ref["name"] for ref in mounts]),
            }
        return out

    def products(self) -> dict:
        business = self.records.get("ba:businesstype_" + SAMPLE_BUSINESS) or {}
        primary = {ref["slug"] for ref in (business.get("products") or {}).get("primary") or []}
        out = {}
        for slug in self.product_slugs():
            prefix = "ba:itemname_" + slug
            record = self.records.get(prefix)
            self.page_slug(prefix)
            if record is None:
                # The page is gone from the help: an empty product, not a stale one.
                out[slug] = {
                    "name": self.name_of(prefix), "slug": prefix, "rank": None,
                    "src": "help_%s_content" % prefix, "alsoSoldBy": [], "fixtures": [],
                    "wholesale": None, "importers": [], "recipe": None, "crosscheck": None,
                }
                continue
            # Two help directions describe where a product sits. The product's
            # own page names furniture; each furniture page lists what it sells.
            # They are reported side by side, and a disagreement is stated, not
            # smoothed into agreement.
            named = [ref["slug"] for ref in record.get("furniture") or []]
            holders = sorted(
                other["slug"] for other in self.records.values()
                if other.get("type") == "item"
                and any(ref["slug"] == prefix for ref in other.get("sells") or [])
            )
            page_wholesale = bool(record["suppliers"]["wholesale"])
            list_wholesale = slug in self.wholesale_slugs
            wholesale = page_wholesale if page_wholesale == list_wholesale else None
            holder_names = list(filter(None, (self.name_of(other) for other in holders)))
            if len(holder_names) == 1:
                furniture_side = "1 furniture page lists it for sale: %s." % holder_names[0]
            elif holder_names:
                furniture_side = "%d furniture pages list it for sale: %s." % (
                    len(holder_names),
                    " and ".join(holder_names) if len(holder_names) == 2
                    else ", ".join(holder_names[:-1]) + " and " + holder_names[-1]
                )
            else:
                furniture_side = "No furniture page lists it for sale."
            named_names = list(filter(None, (self.name_of(other) for other in named)))
            product_side = (
                "Its own page names it in %s." % _join_or(named_names)
                if named_names else "Its own page names no furniture."
            )
            # where the two directions do not return each other, say so
            holder_slugs = {other.removeprefix("ba:itemname_") for other in holders}
            named_slugs = {other.removeprefix("ba:itemname_") for other in named}
            clauses = []
            unlisted = sorted(named_slugs - holder_slugs)
            unnamed = sorted(holder_slugs - named_slugs)
            if unlisted:
                clauses.append("%s does not list it back" % _join_or(list(filter(None, (
                    self.name_of("ba:itemname_" + s) for s in unlisted)))))
            if unnamed:
                clauses.append("%s lists it for sale without this page naming that furniture"
                               % _join_or(list(filter(None, (
                                   self.name_of("ba:itemname_" + s) for s in unnamed)))))
            disagreement = (" The two lists disagree: %s." % "; ".join(clauses)) if clauses else ""
            sentences = [
                product_side,
                furniture_side,
                "Named on the wholesaler product list."
                if slug in self.wholesale_slugs
                else "Absent from the wholesaler product list.",
            ]
            recipes = sorted(ref["slug"] for ref in record["recipes"]["makes"])
            for other in holders:
                self.touch(other)
            for ref in record["soldFrom"]["otherBusinesses"]:
                self.touch(ref.get("slug") or "")
            out[slug] = {
                "name": record["name"],
                "slug": prefix,
                "src": "help_%s_content" % prefix,
                "rank": "primary" if prefix in primary else "additional",
                "alsoSoldBy": [ref["name"] for ref in record["soldFrom"]["otherBusinesses"]],
                "fixtures": sorted(named_slugs | holder_slugs),
                "wholesale": wholesale,
                "importers": [key for key in (
                    self.supplier_key(ref.get("address"))
                    for ref in record["suppliers"]["importers"]
                ) if key],
                "recipe": recipes[0].removeprefix("recipe/") if recipes else None,
                "crosscheck": " ".join(sentences) + disagreement,
            }
        return out

    def recipes(self) -> dict:
        if self._recipes is not None:
            return self._recipes
        out: dict = {}
        for slug in self.product_slugs():
            record = self.records.get("ba:itemname_" + slug) or {}
            for ref in (record.get("recipes") or {}).get("makes") or []:
                tail = ref["slug"].removeprefix("recipe/")
                recipe = self.records.get(tail)
                if recipe is None or tail in out:
                    continue
                self.page_slug("recipes_" + tail)
                ingredients = []
                for ingredient in recipe["ingredients"]:
                    self.touch(ingredient["slug"])
                    ingredients.append({
                        "item": ingredient["name"],
                        "per": ingredient["perHour"],
                        "from": [key for key in (
                            self.supplier_key(source.get("address"))
                            for source in (self.records.get(ingredient["slug"]) or {}).get(
                                "suppliers", {}).get("importers") or []
                        ) if key],
                    })
                out[tail] = {
                    "name": recipe["name"],
                    "src": "help_recipes_%s_content" % tail,
                    "workstation": (recipe.get("workstation") or {}).get("name"),
                    "inputs": ingredients,
                    "out": {"item": recipe["output"]["name"], "per": recipe["output"]["perHour"]},
                }
        self._recipes = out
        return out

    def workstation(self) -> dict:
        """The workstation the sample's recipes run on, with its machines."""
        stations = set()
        for tail in self.recipes():
            record = self.records.get(tail) or {}
            slug = (record.get("workstation") or {}).get("slug")
            if slug:
                stations.add(slug)
        if len(stations) != 1:
            return {}
        # `ba:itemname_consumergoodsworkstation` names the workstation item; its
        # own help page is keyed without that Workstation suffix.
        station_slug = next(iter(stations)).removeprefix("ba:itemname_").removesuffix("workstation")
        record = self.records.get(station_slug)
        if record is None:
            return {}
        self.page_slug("factory_workstation_" + station_slug)
        machines = [ref["slug"] for ref in record.get("machines") or []]
        machines += [ref["slug"] for ref in record.get("assemblyMachines") or []]
        vendors = Counter()
        for slug in machines:
            self.touch(slug)
            for ref in (self.records.get(slug) or {}).get("suppliers", {}).get("purchasableFrom") or []:
                key = self.supplier_key(ref.get("address"))
                if key:
                    vendors[key] += 1
        vendor = sorted(vendors.items(), key=lambda item: (-item[1], item[0]))[0][0] if vendors else None
        return {
            "name": self.locale.get("factory_workstation_" + station_slug) or record.get("name"),
            "src": "help_factory_workstation_%s_content" % station_slug,
            "assembly": next((ref["name"] for ref in record.get("assemblyMachines") or []), None),
            "production": [ref["name"] for ref in record.get("machines") or []],
            "vendor": vendor,
            "runs": [ref["name"] for ref in record.get("recipes") or []],
        }

    def business(self) -> dict:
        prefix = "ba:businesstype_" + SAMPLE_BUSINESS
        record = self.records.get(prefix) or {}
        text = self.locale.get("help_%s_content" % prefix, "")
        blob = wiki_data.prose_text(wiki_data.sections(text)[0])
        wordings = wording()
        building = next((label for needle, label in wordings["buildingWords"].items()
                         if needle in blob.lower()), None)
        serving = next((label for needle, label in wordings["servingWords"].items()
                        if needle in blob), None)
        for ref in record.get("skills") or []:
            self.touch(ref.get("slug") or "")
        return {
            "slug": self.page_slug(prefix),
            "name": self.name_of(prefix),
            "nameSrc": prefix,
            "src": "help_%s_content" % prefix,
            "building": building,
            "serving": serving,
            "skills": [ref["name"] for ref in record.get("skills") or []],
            "hiring": self.recruiter(record),
            "primary": [ref["slug"].removeprefix("ba:itemname_")
                        for ref in (record.get("products") or {}).get("primary") or []],
            "extras": [ref["name"] for ref in (record.get("products") or {}).get("additional") or []],
            "requirements": self.requirements(prefix),
        }

    def requirements(self, prefix: str) -> dict:
        """The business page's own requirement list, with its wording kept.

        The list is the help's claim about what the business needs to function:
        the linked furniture, and a bullet saying a product is needed without
        naming one. Whether this is the complete rule set the game enforces is
        not something help text can establish, so the note travels with it and
        the bullets are kept verbatim for the UI to show.
        """
        text = self.locale.get("help_%s_content" % prefix, "")
        _, sections = wiki_data.sections(text)
        bullets = wiki_data.bullets_of(sections, "requires the following furniture")
        refs, loose = wiki_data.parse_bullets(bullets, ("furniture",))
        for ref in refs:
            self.touch(ref.get("slug") or "")
        # a bullet the parser cannot turn into a link is still a requirement the
        # help states in words ("At least one product to sell")
        # a bullet the parser cannot turn into a link is still a requirement the
        # help states in words ("At least one product to sell"); the bullets are
        # kept as written, so the wording the game shipped is the evidence
        return {
            "src": "help_%s_content" % prefix,
            "furniture": [ref["name"] for ref in refs],
            "furnitureSlugs": [ref["slug"].removeprefix("ba:itemname_") for ref in refs],
            "atLeastOneProduct": any(_AT_LEAST_ONE_RE.search(line) for line in bullets) or None,
            "raw": list(bullets),
            "note": wording()["provenanceNotes"]["requirements"],
        }

    def recruiter(self, business: dict) -> str | None:
        """The recruitment address the business's own skill pages send you to."""
        found: Counter = Counter()
        for ref in business.get("skills") or []:
            text = self.locale.get("help_%s_content" % (ref.get("slug") or ""), "")
            _, sections = wiki_data.sections(text)
            for match in _LINK_RE.finditer(text):
                if match.group(2) not in _ADDRESS_KINDS:
                    continue
                if not context_label(sections, match).startswith("they can be hired"):
                    continue
                key = self.supplier_key(match.group(3))
                if key:
                    found[key] += 1
        return next(iter(found)) if len(found) == 1 else None

    def retail_sizes(self) -> list[dict]:
        """The retail rows of the building-type page: code, area, door limit."""
        _, sections = wiki_data.sections(self.locale.get("help_%s_content" % RETAIL_SIZES_PAGE, ""))
        for section in sections:
            if wiki_data.key_of(section["label"]) != "retail":
                continue
            sizes = []
            for bullet in section["bullets"]:
                match = _RETAIL_SIZE_RE.search(bullet)
                if match:
                    sizes.append({
                        "code": match.group("code"),
                        "area": int(match.group("area").replace(",", "")),
                        "customers": int(match.group("customers").replace(",", "")),
                    })
            self.touch(RETAIL_SIZES_PAGE)
            return sizes
        return []


def _join_or(names: list[str]) -> str | None:
    """`Cabinets, Cocktail Bar, or Cocktail Bar (Wooden)`, as the help lists them."""
    if not names:
        return None
    if len(names) == 1:
        return names[0]
    return "%s or %s" % (", ".join(names[:-1]), names[-1])


# --- gaps ----------------------------------------------------------------


def build_gaps(locale: dict[str, str], pages: list[dict], help_pages: list[dict],
               records: list[dict], sample: dict, layouts: list[dict],
               steam: dict, suppliers: dict, touched: set[str]) -> list[dict]:
    """What this payload cannot say, each kept only while its check still holds.

    A gap is a claim about a limit, so it is verified the same way a fact is:
    the price gap is only written while the sample's own pages really carry no
    money figure, the size-code gap only while a code really is listed twice.
    A limit the game lifts disappears from this list rather than lingering as
    stale honesty.
    """
    templates, gaps = wording()["gaps"], []

    def add(key: str, **slots) -> None:
        entry = templates[key]
        gaps.append({"what": entry["what"], "detail": entry["detail"].format(**slots) if slots
                     else entry["detail"]})

    content = [(key, text) for key, text in locale.items()
               if isinstance(text, str) and key.endswith("_content")]

    # The gap is about this sample, not about the whole locale: the pages the
    # sample reads carry no money figure, which is why it can state no price.
    # A page that only mentions the word price does not close it - the claim is
    # about figures - and what the rest of the locale holds is reported as
    # measured, not as a claim about every file the game ships.
    sample_pages = [text for prefix, text in (
        (prefix, locale.get("help_%s_content" % prefix, "")) for prefix in sorted(touched)
    ) if text]
    if sample_pages and not any(_MONEY_FIGURE_RE.search(text) for text in sample_pages):
        priced_elsewhere = sum(1 for _, text in content if _MONEY_FIGURE_RE.search(text))
        if not priced_elsewhere:
            elsewhere = templates["pricesNowhereElse"]
        elif priced_elsewhere == 1:
            elsewhere = templates["pricesElsewhereOne"].format(count=1)
        else:
            elsewhere = templates["pricesElsewhereMany"].format(count=priced_elsewhere)
        add("prices", pages=len(sample_pages), elsewhere=elsewhere)

    limits = locale.get("help_wholesalers_weeklylimits_content", "")
    without_times = re.sub(r"\b\d{1,2}:\d{2}\b|\(\d+ [AP]M\)", "", limits)
    if limits and not re.search(r"\d", without_times):
        add("weeklyLimits")

    recipe_texts = [locale.get("help_recipes_%s_content" % record["slug"], "")
                    for record in records if record.get("type") == "recipe"]
    if recipe_texts and all("max production rate per hour" in text.lower() for text in recipe_texts):
        add("ratedRate")

    sizes = _sizes_by_section(locale)
    repeated = sorted(code for code, places in sizes.items() if len(places) > 1)
    if repeated:
        rows = "; ".join(
            "%s is %s" % (code, " and ".join(
                "%s customers as %s" % (count, label) for count, label in sizes[code]))
            for code in repeated)
        add("sizeCodes", page="help_%s_content" % RETAIL_SIZES_PAGE, rows=rows)

    dangling = _dangling_links(locale, help_pages)
    if dangling:
        top = ", ".join("%s (%d)" % row for row in dangling.most_common(5))
        add("danglingLinks", count=sum(dangling.values()), slugs=len(dangling), top=top)

    odd_bold = sum(1 for page in pages if page["body"].count("**") % 2)
    spelled = _multi_spelled(locale, suppliers)
    if odd_bold or spelled:
        add("sourceQuirks", oddBoldClause=_bold_clause(odd_bold), spelled=spelled)

    # Three build numbers, only two of them visible from an install. The gap
    # stands whichever of the two are known, because the third never is.
    layout_builds = sorted({str(layout["build"]) for layout in layouts if layout["build"]})
    add("buildNumber", steam=steam.get("steamLabel") or "unknown",
        layouts=", ".join(layout_builds) or "none")

    # A primary product this build's help no longer describes: the sample entry
    # exists (the UI maps BUSINESS.primary through it) and holds nulls.
    shop = next((record for record in records
                 if record["slug"] == "ba:businesstype_" + SAMPLE_BUSINESS), None)
    missing = sorted(
        ref["slug"].removeprefix("ba:itemname_")
        for ref in ((shop or {}).get("products") or {}).get("primary") or []
        if "ba:itemname_" + ref["slug"].removeprefix("ba:itemname_")
        not in {record["slug"] for record in records}
    )
    if missing:
        names = ", ".join(filter(None, (
            locale.get("ba:itemname_" + slug) for slug in missing))) or ", ".join(missing)
        add("missingProducts", products=names)

    soft = sorted(sample["PRODUCTS"][slug]["name"] for slug in sample["PRODUCTS"]
                  if sample["PRODUCTS"][slug]["wholesale"] is False)
    if soft:
        add("wholesaleNegative",
            productsClause=_list_clause(soft, "states no wholesale purchase and is absent from",
                                        "state no wholesale purchase and are absent from"))

    add("sampleCoverage")
    return gaps


def _bold_clause(count: int) -> str:
    """`1 help page opens a bold marker and never closes it`, pluralised."""
    if count == 1:
        return "1 help page opens a bold marker and never closes it."
    return "%d help pages open a bold marker and never close one." % count


def _list_clause(names: list[str], singular: str, plural: str) -> str:
    """`Gift (Expensive) states no wholesale purchase...`, with the right verb."""
    return "%s %s" % (", ".join(names), singular if len(names) == 1 else plural)


def _sizes_by_section(locale: dict[str, str]) -> dict[str, list[tuple[str, str]]]:
    """Every size code the building-type page lists, with the section and count."""
    _, sections = wiki_data.sections(locale.get("help_%s_content" % RETAIL_SIZES_PAGE, ""))
    sizes: dict[str, list[tuple[str, str]]] = {}
    for section in sections:
        label = wiki_data.key_of(section["label"])
        for bullet in section["bullets"]:
            match = _RETAIL_SIZE_RE.search(bullet)
            if match:
                sizes.setdefault(match.group("code"), []).append(
                    (match.group("customers"), label))
    return sizes


def _dangling_links(locale: dict[str, str], help_pages: list[dict]) -> Counter:
    """Count the full link targets the reader cannot resolve to menu pages."""
    slugs = {entry.get("slug") for entry in help_pages if entry.get("slug")}
    dangling: Counter = Counter()
    for key, text in locale.items():
        if not (key.endswith("_content") and isinstance(text, str)):
            continue
        for match in re.finditer(r"\[[^\]]+\]\(([^)]+)\)", text):
            target = match.group(1).strip()
            if re.match(r"(?:address|location):", target) or not target:
                continue
            if target not in slugs:
                dangling[target] += 1
    return dangling


def _multi_spelled(locale: dict[str, str], suppliers: dict) -> str:
    """Addresses the help names more than one way, as a short list."""
    spelled: dict[str, set[str]] = {}
    for key, text in locale.items():
        if not (key.endswith("_content") and isinstance(text, str)):
            continue
        for match in _LINK_RE.finditer(text):
            if match.group(2) in _ADDRESS_KINDS:
                spelled.setdefault(match.group(3).strip(), set()).add(match.group(1))
    rows = []
    for raw, names in sorted(spelled.items()):
        if len(names) > 1:
            rows.append("%s (%s)" % (raw, " / ".join(sorted(names))))
    return "; ".join(rows[:4]) + ("; %d more" % (len(rows) - 4) if len(rows) > 4 else "")


# --- provenance, privacy, validation ------------------------------------


def build_provenance(structure_info, pages, help_pages, duplicates, without_content,
                     buildings_meta, suppliers, supplier_issues, layout_metas, layout_issues,
                     records, unparsed, steam, extracted, building_rows,
                     buildings_issue=None) -> dict:
    """Where every number came from, and what was not available."""
    notes = dict(wording()["provenanceNotes"])
    notes["unparsed"] = notes["unparsed"].format(count=len(unparsed))
    issues = {"suppliers": supplier_issues, "layouts": layout_issues}
    if buildings_issue:
        issues["buildings"] = [{"reason": buildings_issue}]
    return {
        "schema": SCHEMA,
        "builtBy": "tools/build_wiki_data.py",
        # the sources' own newest mtime, not the moment this ran: see notes
        "sourceDate": extracted,
        "sources": {
            "locale": None,  # filled in by the caller, which has the paths
            "helpStructure": None,
            "buildings": buildings_meta,
            "layouts": layout_metas,
        },
        "steam": steam,
        "saveBuildNumber": None,  # a save's build number is a save fact, not an install fact
        "counts": {
            "categories": None,  # filled by the caller once the payload is assembled
            "pages": len(pages),
            "records": len(records),
            "suppliers": len(suppliers),
            "buildingRows": building_rows,
            "unparsed": len(unparsed),
        },
        "helpStructure": {
            "pageEntries": len(help_pages),
            "duplicates": duplicates,
            "pagesWithoutContent": without_content,
        },
        "parse": structure_info,
        "issues": issues,
        "notes": notes,
    }


def check_privacy(payload, source_paths: list[str]) -> None:
    """Refuse to write a payload that names a place on this machine.

    Game text is public - the site already ships some of it - but a build that
    runs on one machine must not leak that machine's paths into a file the
    world can fetch. The source paths themselves are checked too, so a relative
    path that quietly resolved to an absolute one is caught here.
    """
    def walk(node):
        if isinstance(node, str):
            if _PRIVATE_PATH_RE.search(node):
                raise wiki_data.SourceError(
                    "public payload carries a machine path (%r matched a private path)"
                    % node[:40].replace("\\", "/")
                )
        elif isinstance(node, dict):
            for key, value in node.items():
                walk(key)
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    walk(payload)
    for path in source_paths:
        if os.path.isabs(path):
            absolute = os.path.abspath(path)
            for string in _strings(payload):
                if absolute in string:
                    raise wiki_data.SourceError(
                        "public payload names its own source file by absolute path"
                    )


def _strings(node) -> list[str]:
    if isinstance(node, str):
        return [node]
    if isinstance(node, dict):
        return [s for key, value in node.items() for s in _strings(key) + _strings(value)]
    if isinstance(node, list):
        return [s for value in node for s in _strings(value)]
    return []


def validate_public(payload: dict) -> None:
    """The promises the contract makes, checked before anything is written."""
    if payload.get("schemaVersion") != SCHEMA_VERSION:
        raise wiki_data.SourceError("schemaVersion is %r, expected %r"
                                    % (payload.get("schemaVersion"), SCHEMA_VERSION))
    categories = payload.get("categories")
    if not isinstance(categories, list) or not categories:
        raise wiki_data.SourceError("payload has no categories")
    ids, seen = set(), set()
    for category in categories:
        for field in ("id", "label", "count", "pageIds"):
            if field not in category:
                raise wiki_data.SourceError("category %r has no %s" % (category.get("id"), field))
        if category["count"] != len(category["pageIds"]):
            raise wiki_data.SourceError("category %s counts %s pages, lists %d"
                                        % (category["id"], category["count"], len(category["pageIds"])))
        ids.add(category["id"])
        for page_id in category["pageIds"]:
            if page_id in seen:
                raise wiki_data.SourceError("page %s is listed twice" % page_id)
            seen.add(page_id)

    pages = payload.get("pages")
    if not isinstance(pages, list) or not pages:
        raise wiki_data.SourceError("payload has no pages")
    if len(pages) != len(seen):
        raise wiki_data.SourceError("pages holds %d records for %d listed ids"
                                    % (len(pages), len(seen)))
    for page in pages:
        for field in ("id", "categoryId", "title", "body"):
            if not page.get(field):
                raise wiki_data.SourceError("page %r has no %s" % (page.get("id"), field))
        if page["categoryId"] not in ids:
            raise wiki_data.SourceError("page %s sits in unknown category %s"
                                        % (page["id"], page["categoryId"]))
        if page["id"] not in seen:
            raise wiki_data.SourceError("page %s is not in any category" % page["id"])

    sample = payload.get("sample") or {}
    for field in ("SOURCES", "CATEGORIES", "SUPPLIERS", "WHOLESALERS", "FIXTURES", "PRODUCTS",
                  "RECIPES", "WORKSTATION", "BUSINESS", "RETAIL_SIZES", "GAPS"):
        if field not in sample:
            raise wiki_data.SourceError("sample has no %s" % field)
    suppliers = sample["SUPPLIERS"]
    if not isinstance(suppliers, dict) or not suppliers:
        raise wiki_data.SourceError("sample has no suppliers")
    for name, group in (("FIXTURES", sample["FIXTURES"]), ("PRODUCTS", sample["PRODUCTS"]),
                        ("RECIPES", sample["RECIPES"])):
        if not isinstance(group, dict):
            raise wiki_data.SourceError("sample %s is not an object" % name)
    # Everything the sample points at must resolve inside the same payload.
    for fixture in sample["FIXTURES"].values():
        for key in fixture["vendors"]:
            if key not in suppliers:
                raise wiki_data.SourceError("fixture names unknown supplier %s" % key)
    for product in sample["PRODUCTS"].values():
        for key in product["importers"]:
            if key not in suppliers:
                raise wiki_data.SourceError("product names unknown supplier %s" % key)
    for recipe in sample["RECIPES"].values():
        for ingredient in recipe["inputs"]:
            for key in ingredient["from"]:
                if key not in suppliers:
                    raise wiki_data.SourceError("recipe names unknown supplier %s" % key)
    station = sample["WORKSTATION"]
    if station and station["vendor"] and station["vendor"] not in suppliers:
        raise wiki_data.SourceError("workstation names unknown supplier %s" % station["vendor"])
    business = sample["BUSINESS"]
    if business["hiring"] and business["hiring"] not in suppliers:
        raise wiki_data.SourceError("business names unknown supplier %s" % business["hiring"])

    provenance = payload.get("provenance") or {}
    sources = provenance.get("sources") or {}
    for name in ("locale", "helpStructure"):
        meta = sources.get(name)
        if not meta or not meta.get("sha256"):
            raise wiki_data.SourceError("provenance has no %s hash" % name)
    if "saveBuildNumber" not in provenance:
        raise wiki_data.SourceError("provenance does not state the save build number")

    # Authored wording is filled from the sources at build time; a slot the
    # builder never filled would ship as a literal "{count}" for the UI to
    # render. Page bodies are excluded: game text may carry braces of its own.
    authored = []
    for row in (sample["SOURCES"].get("files") or []):
        authored.append(("source note for %s" % row.get("path"), row.get("note")))
    for row in (sample["SOURCES"].get("build") or []):
        authored.extend(("build row %s" % row.get("label"), row.get(field))
                        for field in ("where", "caveat"))
    for gap in sample["GAPS"]:
        authored.extend((("gap %s" % gap.get("what"), gap.get("what")),
                         ("gap %s" % gap.get("what"), gap.get("detail"))))
    for key, note in (provenance.get("notes") or {}).items():
        authored.append(("note %s" % key, note))
    for label, text in authored:
        match = _PLACEHOLDER_RE.search(text or "")
        if match:
            raise wiki_data.SourceError("unresolved wording slot %s in %s"
                                        % (match.group(0), label))
    requirements = business.get("requirements") or {}
    for field in ("src", "furniture", "furnitureSlugs", "raw"):
        if field not in requirements:
            raise wiki_data.SourceError("sample BUSINESS has no requirements %s" % field)


# --- build and write ----------------------------------------------------


def build_public_wiki(data_dir: str | None = None, buildings_path: str | None = None) -> dict:
    """The public payload: pages, categories, the worked example, provenance.

    `data_dir` is the Big Ambitions_Data directory. `buildings_path` points at
    a ba_buildings.json other than the checkout's, which is how the tests feed
    in a table of their own.
    """
    paths = extract_wiki.default_paths(data_dir)
    streaming_dir = os.path.join(paths["data_dir"], "StreamingAssets")

    locale = wiki_data.load_locale(paths["locale"])
    help_pages, structure_info = wiki_data.load_help_structure(paths["help_structure"])
    if not help_pages:
        raise wiki_data.SourceError("helpstructure.json lists no pages; the menu cannot be built")

    buildings, buildings_meta, buildings_issue = load_buildings(buildings_path=buildings_path)
    catalogue = wiki_data.build_catalogue(locale, businesses=None, help_pages=help_pages, with_raw=False)
    records = catalogue["records"]

    pages, duplicates, without_content = build_pages(help_pages, locale)
    categories = build_categories(help_pages, locale, pages)
    slugs_by_prefix = page_slug_by_prefix(help_pages)

    importer_names = canonical_importer_names(help_pages, locale)
    importer_pages = importer_page_by_key(help_pages, locale)
    suppliers, supplier_issues = collect_suppliers(locale, buildings, records, importer_names)
    flags = pier_flag(suppliers)
    for key, detail in flags.items():
        suppliers[key]["flag"] = detail

    layouts, layout_issues = layout_counts(streaming_dir)
    wholesalers = collect_wholesalers(locale, buildings)
    wholesale_slugs = wholesaler_products(locale)

    sample_builder = Sample(locale, records, suppliers, layouts, wholesale_slugs, slugs_by_prefix,
                            importer_pages)
    sample_builder.touch(WHOLESALER_PAGE)  # the wholesalers block is read off its page
    sample = {
        "SOURCES": {},
        "CATEGORIES": [],
        "SUPPLIERS": suppliers,
        "WHOLESALERS": wholesalers,
        "FIXTURES": sample_builder.fixtures(),
        "PRODUCTS": sample_builder.products(),
        "RECIPES": sample_builder.recipes(),
        "WORKSTATION": sample_builder.workstation(),
        "BUSINESS": sample_builder.business(),
        "RETAIL_SIZES": sample_builder.retail_sizes(),
        "GAPS": [],
    }

    steam, extracted = _steam_and_date(paths, layouts)
    layout_metas = [_layout_meta(streaming_dir, layout) for layout in layouts]
    sample["SOURCES"] = _sources(paths, locale, structure_info, help_pages, layout_metas,
                                 buildings_meta, steam)
    sample["CATEGORIES"] = _sample_categories(categories, sample_builder)

    provenance = build_provenance(
        structure_info, pages, help_pages, duplicates, without_content,
        buildings_meta, suppliers, supplier_issues, layout_metas, layout_issues,
        records, catalogue["unparsed"], steam, extracted, len(buildings),
        buildings_issue,
    )
    provenance["sources"]["locale"] = _locale_meta(paths)
    provenance["sources"]["helpStructure"] = _structure_meta(paths)
    provenance["counts"]["categories"] = len(categories)

    sample["GAPS"] = build_gaps(locale, pages, help_pages, records, sample, layouts, steam,
                                suppliers, sample_builder.touched)
    payload = {
        "schemaVersion": SCHEMA_VERSION,
        "categories": categories,
        "pages": pages,
        "sample": sample,
        "provenance": provenance,
    }
    check_privacy(payload, [paths["locale"], paths["help_structure"]])
    validate_public(payload)
    return payload


def _steam_and_date(paths, layouts) -> tuple[dict, str | None]:
    """The build metadata that was actually observed, and the sources' own date.

    The date is the sources' newest modification time, not the moment this ran:
    a payload rebuilt from an unchanged install must not differ from the last.
    """
    steam = {
        "appId": None,
        "buildId": None,
        "steamLabel": None,
        "source": None,
        "saveBuildNumber": None,
    }
    manifest = extract_wiki.find_steam_manifest(paths["data_dir"])
    if manifest:
        try:
            observed = wiki_data.steam_build_id(manifest)
        except wiki_data.SourceError:
            observed = None
        if observed:
            steam.update(
                appId="1331550",
                buildId=observed["steamBuildId"],
                steamLabel="app 1331550, buildid %s" % observed["steamBuildId"],
                source="steamapps/" + os.path.basename(manifest),
            )
    steam["product"], steam["unity"] = app_identity(paths["data_dir"])
    extracted = _source_date(paths, layouts)
    steam["extracted"] = extracted
    return steam, extracted


def _source_date(paths, layouts=()) -> str | None:
    """Newest modification date among the game help and counted layouts."""
    mtimes = []
    sources = [paths["locale"], paths["help_structure"]]
    sources.extend(os.path.join(paths["data_dir"], row["path"].split("Big Ambitions_Data/", 1)[1])
                   for row in layouts)
    for path in sources:
        try:
            mtimes.append(os.path.getmtime(path))
        except OSError:
            continue
    if not mtimes:
        return None
    from datetime import datetime, timezone

    return datetime.fromtimestamp(max(mtimes), timezone.utc).strftime("%Y-%m-%d")


def _sources(paths, locale, structure_info, help_pages, layout_metas, buildings_meta, steam) -> dict:
    """The sample's SOURCES block, in the shape the wiki page renders."""
    notes = wording()["sourceNotes"]
    files = [
        dict(
            _locale_meta(paths),
            note=notes["locale"].format(entries=len(locale)),
        ),
        dict(
            _structure_meta(paths),
            note=notes["helpStructure"].format(
                categories=len({entry.get("category") for entry in help_pages if entry.get("category")}),
                entries=len(help_pages),
                unique=len({entry.get("slug") for entry in help_pages if entry.get("slug")}),
                parse=wording()["lenientParse"] if (structure_info or {}).get("parseMode") == "lenient"
                else wording()["strictParse"],
            ),
        ),
    ]
    for meta in layout_metas:
        # the sample's file rows keep the five keys the wiki page renders; the
        # layout's build and item count travel in the note and in provenance
        files.append({
            "path": meta["path"],
            "bytes": meta["bytes"],
            "sha256": meta["sha256"],
            "mtime": meta["mtime"],
            "note": notes["layout"].format(items=meta["items"], build=meta["build"]),
        })
    if buildings_meta:
        files.append({
            "path": "ba_buildings.json (Big Copilot)",
            "bytes": buildings_meta["bytes"],
            "sha256": buildings_meta["sha256"],
            "mtime": buildings_meta["mtime"],
            "note": notes["buildings"].format(count=buildings_meta["count"]),
        })
    return {
        # `extracted` is the mockup's key; `sourceDate` says what the date is
        "extracted": steam["extracted"],
        "sourceDate": steam["extracted"],
        "files": files,
        "build": _build_rows(steam),
    }


def _build_rows(steam: dict) -> list[dict]:
    """The build rows the sample states, each only what was observed."""
    rows = []
    for key, value in (
        ("product", steam.get("product")),
        ("unity", steam.get("unity")),
        ("steam", steam.get("steamLabel")),
        ("saveBuild", None),
    ):
        template = wording()["buildRows"][key]
        entry = {
            "label": template["label"],
            "value": value,
            "where": template["where"],
            "certain": template["certain"],
        }
        if template.get("caveat"):
            entry["caveat"] = template["caveat"]
        rows.append(entry)
    return rows


def _locale_meta(paths) -> dict:
    return source_meta("Big Ambitions_Data/StreamingAssets/locale/en.json", paths["locale"])


def _structure_meta(paths) -> dict:
    return source_meta("Big Ambitions_Data/StreamingAssets/helpstructure.json",
                       paths["help_structure"])


def _layout_meta(streaming_dir, layout) -> dict:
    relative = layout["path"].split("StreamingAssets/", 1)[1]
    path = os.path.join(streaming_dir, relative.replace("/", os.sep))
    meta = source_meta(layout["path"], path)
    meta["build"] = layout["build"]
    meta["items"] = layout["items"]
    return meta


def _sample_categories(categories: list[dict], sample: "Sample") -> list[dict]:
    """The sample's CATEGORIES block: how much of each group the example covers."""
    covered = {page_id for page_id in (sample.slugs_by_prefix.get(prefix)
                                       for prefix in sample.touched) if page_id}
    return [
        {
            "key": category["id"],
            "name": category["label"],
            "pages": category["count"],
            "sample": sum(1 for page_id in category["pageIds"] if page_id in covered),
        }
        for category in categories
    ]


def serialise(payload: dict) -> str:
    """The payload as it is written: valid JSON, validated, no trailing newline games."""
    return json.dumps(payload, ensure_ascii=False, indent=2) + "\n"


def write_public_wiki(path: str, data_dir: str | None = None,
                      buildings_path: str | None = None) -> str:
    """Build, validate, then replace the payload; skip the write when unchanged.

    The temporary file lives beside the target so the swap is a rename, and a
    payload that fails validation leaves the previous one standing. When the
    bytes did not move, the existing file is left alone, so a rebuild does not
    touch a file it did not change.
    """
    payload = build_public_wiki(data_dir, buildings_path=buildings_path)
    text = serialise(payload)
    validate_public(json.loads(text))
    directory = os.path.dirname(os.path.abspath(path)) or "."
    os.makedirs(directory, exist_ok=True)
    if os.path.exists(path):
        try:
            with open(path, "rb") as fh:
                if fh.read().decode("utf-8") == text:
                    return text
        except (OSError, ValueError):
            pass
    import tempfile

    handle, temporary = tempfile.mkstemp(dir=directory, prefix=".wiki-data-", suffix=".tmp")
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(text)
        os.replace(temporary, path)
    except BaseException:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise
    return text


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--data-dir", help="Big Ambitions_Data directory (default: the Steam install)")
    parser.add_argument("--out", default=DEFAULT_OUT, help="output path (default: %(default)s)")
    parser.add_argument("--buildings", help="ba_buildings.json to place suppliers with "
                                            "(default: the checkout's)")
    parser.add_argument("--quiet", action="store_true", help="print only errors")
    args = parser.parse_args(argv)

    try:
        text = write_public_wiki(args.out, args.data_dir, buildings_path=args.buildings)
    except wiki_data.SourceError as exc:
        print("error: %s" % exc, file=sys.stderr)
        return 2
    if args.quiet:
        return 0
    payload = json.loads(text)
    provenance = payload["provenance"]
    print(
        "wrote %s (%d KB): %d categories, %d pages, %d suppliers"
        % (args.out, len(text) // 1024, len(payload["categories"]), len(payload["pages"]),
           len(payload["sample"]["SUPPLIERS"]))
    )
    print(
        "sources: %s; source date %s"
        % ("; ".join("%s %s" % (meta["path"], meta["sha256"][:12])
                     for meta in (provenance["sources"]["locale"],
                                  provenance["sources"]["helpStructure"])
                     if meta),
           provenance.get("sourceDate") or "unknown date")
    )
    steam = provenance["steam"]
    if steam.get("buildId"):
        print("steam: %s (save build number: not observed)" % steam["steamLabel"])
    issues = provenance["issues"]
    for kind, rows in issues.items():
        if rows:
            print("%d %s issue(s) recorded in provenance" % (len(rows), kind), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
