"""Game help text as a wiki catalogue: the facts the game itself states.

`ba_dashboard.py` parses the handful of help pages the board needs every time
it loads a save. This module reads the same files once and writes them out as
records instead, so a wiki can be built from the game's own words. The raw help
text travels beside the parsed facts on purpose: a page the parser only half
understood is then still visible as the game wrote it, rather than silently
reduced to whatever happened to match.

Everything here is standard library only, and nothing is read from or imported
from the dashboard: importing a 9,000-line template to lift six regexes out of
it would couple two things that change for different reasons. `ba_save` is
imported lazily by the CLI for its `DEFAULT_LOCALE` path only.

Every number comes from a match in the game's text, never from a default, and
anything the text does not state is recorded as missing. The help can lag the
running game, so these records are documented game facts, not runtime truth.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from datetime import datetime, timezone

SCHEMA = "ba-wiki-catalogue"
SCHEMA_VERSION = 1

# The locale keys each kind of record is built from.
_BUSINESS_HELP_RE = re.compile(r"^help_(ba:businesstype_[a-z0-9_]+)_content$")
_ITEM_HELP_RE = re.compile(r"^help_(ba:itemname_[a-z0-9_]+)_content$")
_RECIPE_HELP_RE = re.compile(r"^help_recipes_([a-z0-9_]+)_content$")
_WORKSTATION_HELP_RE = re.compile(r"^help_factory_workstation_([a-z0-9]+)_content$")

# Links the help uses, and the slug each one names. Products, fees and
# furniture all sit on ba:itemname_ slugs underneath; only the help's own link
# kind differs, and that difference is kept as `link` so nothing is lost.
# `[Wholesalers](wholesalers-locations)` and `[X](address: 4 pier)` are the two
# shapes: kind, then a dash or a colon and space.
_LINK_RE = re.compile(r"\[([^\]]+)\]\(([a-z]+)(?:-|:\s*)([^)]*)\)")
_SOLD_ITEM_RE = re.compile(r"\[([^\]]+)\]\((?:products|fees)-([a-z0-9_]+)\)")
_QUANTITY_RE = re.compile(r"^\*\s*([\d,]+)\s*[xX]\s*\[([^\]]+)\]\((?:products)-([a-z0-9_]+)\)")
_OUTPUT_RE = re.compile(r"^\*\s*([\d,]+)\s*\[([^\]]+)\]\((?:products)-([a-z0-9_]+)\)")
_CAPACITY_RE = re.compile(r"^\*\*Customer Capacity:\*\*\s*([\d,]+)", re.M)
_PRODUCT_CAPACITY_RE = re.compile(r"^\*\s*([^:*]+):\s*([\d,]+)\s*$", re.M)
_PRIMARY_SOLD_RE = re.compile(
    r"\*\* is (?:a type of product )?(?:primarily )?sold from ([^.]+)\."
)
_STORE_ORDERING_RE = re.compile(
    r"(All|Some) of this store's items can be ordered from"
    r" \[[^\]]+\]\(wholesalers-locations\)"
    r"( and the rest can be ordered from \[[^\]]+\]\(importers-contract\))?"
)
_WHOLESALE_RE = re.compile(
    r"The product can be purchased from any \[wholesale location\]"
)

# Sentences, not labels: they carry no colon and end in a full stop, which is
# what keeps them out of the labelled sections below.
_LABEL_MAX = 200


class SourceError(Exception):
    """A source file is missing, unreadable or not the format it claims."""


def help_prefix(help_key: str) -> str | None:
    """The helpstructure key a help page is listed under, if it is listed.

    The table of contents keys its pages by the same prefix the locale uses
    without the `help_` wrapper and the `_content` tail, so `giftshop`'s page
    is found through `ba:businesstype_giftshop` and its slug comes back as
    `businesstypes-giftshop`.
    """
    for pattern in (
        _BUSINESS_HELP_RE,
        _ITEM_HELP_RE,
        _RECIPE_HELP_RE,
        _WORKSTATION_HELP_RE,
    ):
        match = pattern.match(help_key)
        if not match:
            continue
        groups = [g for g in match.groups() if g]
        if pattern is _RECIPE_HELP_RE:
            return "recipes_" + groups[0]
        if pattern is _WORKSTATION_HELP_RE:
            return "factory_workstation_" + groups[0]
        return groups[0]
    return None


# --- sources ------------------------------------------------------------


def read_source(path: str) -> bytes:
    """The bytes of a source file, failing clearly rather than quietly."""
    try:
        with open(path, "rb") as fh:
            return fh.read()
    except OSError as exc:
        raise SourceError(f"cannot read {path}: {exc}") from exc


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def modified_utc(path: str) -> str | None:
    """The file's own mtime, as observed metadata; never a build number."""
    try:
        return datetime.fromtimestamp(os.path.getmtime(path), timezone.utc).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
    except OSError:
        return None


def file_meta(path: str) -> dict:
    data = read_source(path)
    return {
        "path": os.path.abspath(path),
        "sha256": sha256_hex(data),
        "bytes": len(data),
        "modified": modified_utc(path),
    }


def load_locale(path: str) -> dict[str, str]:
    """The locale file as {key: text}. Strict JSON, and loud about failure.

    `ba_save.load_locale` returns {} when the file cannot be read, which is the
    right behaviour for a dashboard that can still show a save. Here an empty
    catalogue is exactly the silent failure this extractor must not produce.
    """
    data = read_source(path)
    try:
        parsed = json.loads(data.decode("utf-8-sig"))
    except (UnicodeDecodeError, ValueError) as exc:
        raise SourceError(f"{path} is not valid JSON: {exc}") from exc
    if not isinstance(parsed, dict):
        raise SourceError(f"{path} is a JSON {type(parsed).__name__}, expected an object")
    return parsed


def repair_json(text: str) -> tuple[str, int]:
    """Drop the trailing commas the shipped helpstructure.json contains.

    The game's file is hand-edited and carries two `},` before a `]`. Python's
    parser refuses the whole file for them, and the point of a repair is to
    keep every page it lists, not to interpret the text, so the scan is a
    character-by-character comma drop that understands JSON strings and
    nothing else. `eval` is never in the picture: the result still has to pass
    `json.loads` to be used.
    """
    out: list[str] = []
    pending = None  # index in `out` of a comma that may yet prove trailing
    in_string = escape = False
    for ch in text:
        if in_string:
            out.append(ch)
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
            pending = None
            out.append(ch)
        elif ch == ",":
            pending = len(out)
            out.append(ch)
        elif ch in "}]":
            # A comma still pending when a closer arrives was a trailing one,
            # along with whatever whitespace followed it.
            if pending is not None:
                del out[pending:]
                pending = None
            out.append(ch)
        else:
            if not ch.isspace():
                pending = None
            out.append(ch)
    repaired = "".join(out)
    return repaired, len(text) - len(repaired)


def load_help_structure(path: str) -> tuple[list, dict]:
    """The help menu's own table of contents, with how it was parsed.

    Returns (pages, info). `pages` is a flat [{category, slug, prefix}] list;
    `info` records the parse mode and what the repair had to do, so the
    catalogue says honestly which of the two parsers produced it.
    """
    raw = read_source(path)
    text = raw.decode("utf-8-sig")
    try:
        data = json.loads(text)
        return _flatten_help_structure(data), {
            "parseMode": "strict",
            "repairs": [],
        }
    except ValueError as strict_error:
        repaired, dropped = repair_json(text)
        try:
            data = json.loads(repaired)
        except ValueError as lenient_error:
            raise SourceError(
                f"{path} will not parse even with trailing commas dropped "
                f"({lenient_error}); strict parser said: {strict_error}"
            ) from lenient_error
        return _flatten_help_structure(data), {
            "parseMode": "lenient",
            "repairs": [f"dropped {dropped} trailing comma character(s)"],
        }


def _flatten_help_structure(data) -> list[dict]:
    if not isinstance(data, list):
        raise SourceError("helpstructure.json is not a list of categories")
    pages = []
    for category in data:
        if not isinstance(category, dict):
            continue
        cat = category.get("CategoryLocalizorKey")
        for page in category.get("pages") or []:
            if not isinstance(page, dict):
                continue
            pages.append(
                {
                    "category": cat,
                    "slug": page.get("slug"),
                    "prefix": page.get("pageLocalizorKeyPrefix"),
                }
            )
    return pages


# --- labelled sections --------------------------------------------------
#
# A help page is a list of sections, each opened by a heading line and
# followed by `* ` bullets. Headings either end in a colon ("Businesses of
# this type primarily sell:") or are bare fragments ("To an Assembly
# Machine"); prose is anything that ends in a full stop. Parsing the shape
# rather than each page's exact wording is what lets one parser read all 869
# help pages, and what keeps a page the game rewords from being parsed as if
# it were still the old one.


def sections(text: str) -> tuple[list[str], list[dict]]:
    """A help page as (prose lines, [{label, bullets, inline}])."""
    prose: list[str] = []
    out: list[dict] = []
    current: dict | None = None
    for line in text.split("\n"):
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("* "):
            if current is None:
                prose.append(stripped)
            else:
                current["bullets"].append(stripped)
            continue
        if current is not None:
            out.append(current)
            current = None
        if _is_label(stripped):
            label, _, inline = stripped.rstrip().partition(": ")
            current = {
                "label": label.rstrip(":").strip(),
                "bullets": [],
                "inline": inline.strip(),
            }
        else:
            prose.append(stripped)
    if current is not None:
        out.append(current)
    return prose, out


def _is_label(line: str) -> bool:
    """A heading, as opposed to a sentence of prose."""
    if line.endswith((".", "!", "?")) or len(line) > _LABEL_MAX:
        return False
    return True


def key_of(label: str) -> str:
    """A section label as a comparable key, markdown and case stripped."""
    plain = label.replace("**", "").replace("*", "").replace("_", " ")
    return re.sub(r"\s+", " ", plain).strip().lower()


def bullets_of(section_list: list[dict], *needles: str) -> list[str]:
    """The bullets of the first section whose label contains every needle."""
    for section in section_list:
        key = key_of(section["label"])
        if all(needle in key for needle in needles):
            return section["bullets"]
    return []


def inline_of(section_list: list[dict], *needles: str) -> str:
    for section in section_list:
        key = key_of(section["label"])
        if all(needle in key for needle in needles):
            return section["inline"]
    return ""


def label_of(section_list: list[dict], *needles: str) -> str | None:
    for section in section_list:
        key = key_of(section["label"])
        if all(needle in key for needle in needles):
            return section["label"]
    return None


def prose_text(prose: list[str]) -> str:
    return "\n".join(prose)


# --- links to records ---------------------------------------------------


def ref(name: str, slug: str | None, link: str | None = None) -> dict:
    """A mention of another record, or of an address, as the help wrote it."""
    out = {"name": name, "slug": slug}
    if link is not None:
        out["link"] = link
    return out


def parse_bullets(bullets: list[str], wanted: tuple[str, ...]) -> tuple[list[dict], list[dict]]:
    """Links of the wanted kind(s) from bullet lines, plus what did not parse.

    A bullet with no link is a real requirement the help states in words
    ("At least one product to sell"), and a bullet joining two links with
    "or" states alternatives the record must not read as "all of these", so
    both come back as issues for the record's `unparsed` list rather than
    being quietly dropped or quietly widened.
    """
    links, issues = [], []
    for bullet in bullets:
        found = [m for m in _LINK_RE.finditer(bullet) if m.group(2) in wanted]
        plain = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", bullet).lstrip("* ")
        if not found:
            issues.append({"reason": "bullet without a link", "text": plain})
        elif len(found) > 1 and " or " in plain.lower():
            issues.append(
                {"reason": "alternatives in one bullet; kept in the raw help", "text": plain}
            )
        else:
            for m in found:
                links.append(ref(m.group(1), _slug_for(m.group(2), m.group(3)), m.group(2)))
    return links, issues


def primary_business_refs(blob: str) -> list[dict]:
    """`**X** is a type of product primarily sold from [Gift Shops](...)`
    as business refs, from an item page's own opening sentence."""
    out = []
    for sentence in _PRIMARY_SOLD_RE.findall(blob):
        for m in _LINK_RE.finditer(sentence):
            if m.group(2) == "businesstypes":
                out.append(ref(m.group(1), "ba:businesstype_" + m.group(3), "businesstypes"))
    return out


def _slug_for(kind: str, target: str) -> str | None:
    if kind in ("products", "fees", "furniture"):
        return "ba:itemname_" + target
    if kind == "businesstypes":
        return "ba:businesstype_" + target
    if kind == "skill":
        return "ba:skill_" + target
    if kind == "recipes":
        return "recipe/" + target
    return None


def address_refs(bullets: list[str]) -> list[dict]:
    """`[BlueStone Imports](address: 4 pier)` as {name, address}."""
    out = []
    for bullet in bullets:
        for m in _LINK_RE.finditer(bullet):
            if m.group(2) == "address":
                out.append({"name": m.group(1), "address": m.group(3).strip()})
    return out


# --- record extractors --------------------------------------------------


def business_requirement_lines(text: str) -> list[str]:
    """Listed requirements plus explicit, linked conditions stated in prose."""
    _, section_list = sections(text)
    lines = list(bullets_of(section_list, "requires the following furniture"))
    for line in text.splitlines():
        if re.search(r"\b(?:is|are) required to\b", line, re.I) and any(
            match.group(2) == "furniture" for match in _LINK_RE.finditer(line)
        ) and line.strip() not in lines:
            lines.append(line.strip())
    return lines


def furniture_by_business(text: str) -> dict[str, list[dict]]:
    """Store-typed furniture lists, retaining the business links as scope.

    The introductory sentence ends in a full stop, so it deliberately is not
    a generic section heading. Read only this block, stopping at the next
    non-bullet/non-business heading rather than swallowing supplier lists.
    """
    out: dict[str, list[dict]] = {}
    active, businesses = False, []
    for line in text.splitlines():
        line = line.strip()
        if "placed in the following furniture" in line.lower():
            active = True
            continue
        if not active or not line:
            continue
        links = list(_LINK_RE.finditer(line))
        scopes = ["ba:businesstype_" + m.group(3) for m in links
                  if m.group(2) == "businesstypes"]
        if scopes and not line.startswith("* "):
            businesses = scopes
            for business in businesses:
                out.setdefault(business, [])
        elif line.startswith("* "):
            for business in businesses:
                out[business].extend(ref(m.group(1), _slug_for("furniture", m.group(3)), "furniture")
                                     for m in links if m.group(2) == "furniture")
        else:
            break
    return {business: _dedupe(fixtures) for business, fixtures in out.items()}


def extract_business(slug: str, text: str, names: dict[str, str], page_slugs: list[str]) -> dict:
    """One business type: its range, its fittings, its skills, its suppliers."""
    prose, sections_ = sections(text)
    unparsed: list[dict] = []
    primary, primary_loose = parse_bullets(
        bullets_of(sections_, "primarily sell") or bullets_of(sections_, "can sell"),
        ("products", "fees"),
    )
    additional, additional_loose = parse_bullets(
        bullets_of(sections_, "additionally sell"), ("products", "fees")
    )
    furniture, furniture_loose = parse_bullets(
        business_requirement_lines(text), ("furniture",)
    )
    skills, skills_loose = parse_bullets(
        bullets_of(sections_, "skills can be assigned"), ("skill",)
    )
    for field, loose in (
        ("products.primary", primary_loose),
        ("products.additional", additional_loose),
        ("furnitureRequired", furniture_loose),
        ("skills", skills_loose),
    ):
        for issue in loose:
            unparsed.append({"field": field, **issue})

    prose_blob = prose_text(prose)
    ordering = _STORE_ORDERING_RE.search(prose_blob)
    suppliers = {
        "wholesalers": ordering.group(1).lower() if ordering else None,
        "importers": "rest" if ordering and ordering.group(2) else None,
    }
    if not primary:
        unparsed.append(
            {
                "field": "products.primary",
                "reason": "no 'primarily sell' or 'can sell' section with linked products",
            }
        )

    record = {
        "id": "businesstype/" + slug.removeprefix("ba:businesstype_"),
        "type": "businesstype",
        "slug": slug,
        "name": names.get(slug),
        "sources": [slug, "help_%s_content" % slug] + ["helpstructure:" + s for s in page_slugs],
        "products": {
            "primary": _dedupe(primary),
            "additional": _dedupe(additional),
        },
        "furnitureRequired": _dedupe(furniture),
        "skills": _dedupe(skills),
        "suppliers": suppliers,
        "unparsed": unparsed,
    }
    if page_slugs:
        record["helpPages"] = page_slugs
    return record


def extract_item(slug: str, text: str, names: dict[str, str], page_slugs: list[str]) -> dict:
    """One item: product, fee, furniture or machine, with what its page states."""
    prose, sections_ = sections(text)
    unparsed: list[dict] = []
    blob = prose_text(prose)
    primary_sold = primary_business_refs(blob)

    furniture, loose = parse_bullets(
        bullets_of(sections_, "placed in the following furniture"), ("furniture",)
    )
    scoped_furniture = furniture_by_business(text)
    for fixtures in scoped_furniture.values():
        furniture.extend(fixtures)
    _report_loose(unparsed, "furniture", loose)
    makes, loose = parse_bullets(
        bullets_of(sections_, "manufactured using the following recipes"), ("recipes",)
    )
    _report_loose(unparsed, "recipes.makes", loose)
    used_in, loose = parse_bullets(
        bullets_of(sections_, "used in the following recipes"), ("recipes", "products")
    )
    _report_loose(unparsed, "recipes.usedIn", loose)
    workstations, loose = parse_bullets(
        bullets_of(sections_, "used by the following factory workstations"), ("furniture",)
    )
    _report_loose(unparsed, "workstations", loose)
    sells, loose = parse_bullets(bullets_of(sections_, "used to sell"), ("products", "fees"))
    _report_loose(unparsed, "sells", loose)
    holds, loose = parse_bullets(
        bullets_of(sections_, "hold the following items"), ("products", "fees", "furniture")
    )
    _report_loose(unparsed, "holds", loose)
    fee_needs, loose = parse_bullets(
        bullets_of(sections_, "to collect this fee"), ("furniture", "skill", "products")
    )
    _report_loose(unparsed, "feeRequirements", loose)
    creates, loose = parse_bullets(
        bullets_of(sections_, "to create") or bullets_of(sections_, "can be used to create"),
        ("furniture",),
    )
    _report_loose(unparsed, "createsWorkstations", loose)

    importers = address_refs(bullets_of(sections_, "imported from the following locations"))
    purchasable = address_refs(
        bullets_of(sections_, "purchased from the following locations")
    )

    other = _other_businesses(sections_, blob, unparsed)

    capacity = _CAPACITY_RE.search(text)
    product_capacity = [
        {"label": label.strip(), "value": int(value.replace(",", ""))}
        for label, value in _PRODUCT_CAPACITY_RE.findall(text)
    ]

    record = {
        "id": "item/" + slug.removeprefix("ba:itemname_"),
        "type": "item",
        "slug": slug,
        "name": names.get(slug),
        "sources": [slug, "help_%s_content" % slug] + ["helpstructure:" + s for s in page_slugs],
        "kind": _item_kind(prose, sections_),
        "soldFrom": {
            "primaryBusinesses": _dedupe(primary_sold),
            "otherBusinesses": _dedupe(other),
        },
        "furniture": _dedupe(furniture),
        "recipes": {"makes": _dedupe(makes), "usedIn": _dedupe(used_in)},
        "workstations": _dedupe(workstations),
        "suppliers": {
            "wholesale": True if _WHOLESALE_RE.search(blob) else None,
            "importers": importers,
            "purchasableFrom": purchasable,
        },
        "capacities": {
            "customer": int(capacity.group(1).replace(",", "")) if capacity else None,
            "product": product_capacity,
        },
        "unparsed": unparsed,
    }
    if scoped_furniture:
        record["furnitureByBusiness"] = scoped_furniture
    for field, value in (("sells", sells), ("holds", holds), ("feeRequirements", fee_needs), ("createsWorkstations", creates)):
        if value:
            record[field] = _dedupe(value)
    if page_slugs:
        record["helpPages"] = page_slugs
    return record


def extract_recipe(
    slug: str, text: str, names: dict[str, str], page_slugs: list[str]
) -> dict | None:
    """One recipe: workstation, ingredients per hour, output per hour.

    None when the page states no rated output: the dashboard skips those too,
    and a recipe without a rate cannot be told apart from a page the parser
    misread. The raw text still travels with the catalogue either way.
    """
    prose, sections_ = sections(text)
    unparsed: list[dict] = []
    outputs, issues = _rated_bullets(
        bullets_of(sections_, "max production rate per hour"), _OUTPUT_RE
    )
    _report_loose(unparsed, "output", issues)
    if not outputs:
        return None
    if len(outputs) > 1:
        unparsed.append(
            {
                "field": "output",
                "reason": "more than one rated output line; the first was kept",
                "text": "; ".join(f"{row['name']} {row['perHour']}" for row in outputs[1:]),
            }
        )
    output = outputs[0]
    ingredients, issues = _rated_bullets(
        bullets_of(sections_, "required raw ingredients per hour"), _QUANTITY_RE
    )
    _report_loose(unparsed, "ingredients", issues)
    workstation, issues = parse_bullets(
        bullets_of(sections_, "required workstation"), ("furniture",)
    )
    _report_loose(unparsed, "workstation", issues)
    name_key = "recipes_" + slug
    return {
        "id": "recipe/" + slug,
        "type": "recipe",
        "slug": slug,
        "name": names.get(name_key),
        "sources": ["help_recipes_%s_content" % slug]
        + ([name_key] if name_key in names else [])
        + ["helpstructure:" + s for s in page_slugs],
        "output": output,
        "workstation": workstation[0] if workstation else None,
        "ingredients": ingredients,
        "unparsed": unparsed,
    }


def _rated_bullets(bullets: list[str], pattern: re.Pattern) -> tuple[list[dict], list[dict]]:
    """`* 50 X [Clay](products-clay)` and `* 100 [Gift (Cheap)](products-cheapgift)`
    as rated entries, with the lines that matched neither kept for reporting."""
    out, issues = [], []
    for bullet in bullets:
        match = pattern.match(bullet)
        if not match:
            issues.append(
                {
                    "reason": "rated line that did not parse",
                    "text": re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", bullet).lstrip("* "),
                }
            )
            continue
        amount, name, target = match.groups()
        out.append(
            {
                "slug": "ba:itemname_" + target,
                "name": name,
                "perHour": int(amount.replace(",", "")),
            }
        )
    return out, issues


def extract_workstation(
    slug: str, text: str, names: dict[str, str], page_slugs: list[str]
) -> dict:
    """One workstation: the machines that make it up and the recipes it runs."""
    prose, sections_ = sections(text)
    unparsed: list[dict] = []
    machines, loose = parse_bullets(
        bullets_of(sections_, "is created by adding production machines"), ("furniture",)
    )
    _report_loose(unparsed, "machines", loose)
    assembly, loose = parse_bullets(
        bullets_of(sections_, "to an assembly machine"), ("furniture",)
    )
    _report_loose(unparsed, "assemblyMachines", loose)
    makes, loose = parse_bullets(bullets_of(sections_, "used to create"), ("recipes",))
    _report_loose(unparsed, "recipes", loose)
    return {
        "id": "workstation/" + slug,
        "type": "workstation",
        "slug": slug,
        "name": f"{slug.title()} Workstation",
        "sources": ["help_factory_workstation_%s_content" % slug]
        + ["helpstructure:" + s for s in page_slugs],
        "machines": _dedupe(machines),
        "assemblyMachines": _dedupe(assembly),
        "recipes": _dedupe(makes),
        "unparsed": unparsed,
    }


def _item_kind(prose: list[str], sections_: list[dict] | None = None) -> str | None:
    """The kind of item, taken from the page's own first sentence.

    A kind is only claimed when the page says so in words it uses for that kind
    alone; anything else stays unknown rather than being guessed from the slug.
    A page that states how to collect the fee is a fee whatever its opening
    line does - the cinema and theater tickets are worded that way.
    """
    blob = prose_text(prose)
    if " is collected from customers" in blob or " is a fee collected" in blob:
        return "fee"
    if sections_ is not None and bullets_of(sections_, "to collect this fee"):
        return "fee"
    if re.search(r" is a Factory (Assembly|Production) Machine\.", blob):
        return "machine"
    if " is a raw ingredient" in blob or " are a raw ingredient" in blob:
        return "ingredient"
    if " is a type of product" in blob:
        return "product"
    if (
        " can be used to sell" in blob
        or " can be used to hold the following items" in blob
        or " can be used to set up a " in blob
        or " is a special *employee station*" in blob
        or " are required on retail businesses" in blob
        or " is required to run a " in blob
    ):
        return "furniture"
    return None


def _other_businesses(sections_: list[dict], blob: str, unparsed: list[dict]) -> list[dict]:
    """Where else an item can be sold, from the bullets or from one-line prose."""
    listed, loose = parse_bullets(
        bullets_of(sections_, "additionally, it can be sold from")
        or bullets_of(sections_, "additionally, it can be sold")
        or bullets_of(sections_, "it can be sold from"),
        ("businesstypes",),
    )
    for line in loose:
        unparsed.append({"field": "soldFrom.otherBusinesses", "reason": "bullet without a link", "text": line})
    # Missing terminal punctuation makes an inline sentence a section label.
    # Read its links too, without treating unrelated section bullets as sellers.
    sentences = blob.split("\n") + [section["label"] + " " + section["inline"] for section in sections_]
    for sentence in sentences:
        if "can be sold from" not in sentence:
            continue
        for m in _LINK_RE.finditer(sentence):
            if m.group(2) == "businesstypes":
                listed.append(ref(m.group(1), "ba:businesstype_" + m.group(3), "businesstypes"))
    return listed


def _report_loose(unparsed: list[dict], field: str, issues: list[dict]) -> None:
    for issue in issues:
        unparsed.append({"field": field, **issue})


def _dedupe(refs: list[dict]) -> list[dict]:
    """One entry per slug, in a stable order; nameless mentions keep their text."""
    seen, out = set(), []
    for entry in refs:
        key = json.dumps(entry, sort_keys=True)
        if key in seen:
            continue
        seen.add(key)
        out.append(entry)
    return out


# --- catalogue ----------------------------------------------------------


def build_catalogue(
    locale: dict[str, str],
    *,
    businesses: list[str] | None = None,
    help_pages: list[dict] | None = None,
    source_files: dict[str, dict] | None = None,
    build_metadata: dict | None = None,
    with_raw: bool = True,
) -> dict:
    """The catalogue: records for the selected businesses and everything they
    reference, each with the keys it was read from, and the raw help beside
    them. With `businesses=None` the whole catalogue is extracted."""
    names = {
        key: text
        for key, text in locale.items()
        if not key.endswith("_content") and not text.startswith(("[", "{"))
    }

    def slugs_for(help_key: str) -> list[str]:
        prefix = help_prefix(help_key)
        if not prefix:
            return []
        return [
            page["slug"]
            for page in (help_pages or [])
            if page.get("prefix") == prefix and page.get("slug")
        ]

    selected = _select_businesses(locale, businesses)
    records: list[dict] = []
    raw_help: dict[str, str] = {}

    for slug, text in selected.items():
        help_key = "help_%s_content" % slug
        raw_help[help_key] = text
        records.append(extract_business(slug, text, names, slugs_for(help_key)))

    # Each hop is walked after the records it follows from are in: an item's
    # recipes are only known once the items are read, and a recipe's
    # workstation once the recipes are. With every business selected nothing
    # is filtered, which here is an empty wanted set rather than a flag.
    unfiltered = businesses is None
    wanted_items = set() if unfiltered else _referenced(records)[0]
    item_keys = {
        m.group(1): text
        for key, text in locale.items()
        if (m := _ITEM_HELP_RE.match(key)) and (not wanted_items or m.group(1) in wanted_items)
    }
    for slug, text in sorted(item_keys.items()):
        help_key = "help_ba:itemname_%s_content" % slug
        raw_help[help_key] = text
        records.append(extract_item(slug, text, names, slugs_for(help_key)))

    wanted_recipes = set() if unfiltered else _referenced(records)[1]
    recipe_keys = {
        m.group(1): text
        for key, text in locale.items()
        if (m := _RECIPE_HELP_RE.match(key)) and (not wanted_recipes or "recipe/" + m.group(1) in wanted_recipes)
    }
    for slug, text in sorted(recipe_keys.items()):
        help_key = "help_recipes_%s_content" % slug
        record = extract_recipe(slug, text, names, slugs_for(help_key))
        if record:
            raw_help[help_key] = text
            records.append(record)

    wanted_stations = set() if unfiltered else _referenced(records)[2]
    station_keys = {
        m.group(1): text
        for key, text in locale.items()
        if (m := _WORKSTATION_HELP_RE.match(key))
        and (not wanted_stations or m.group(1) in wanted_stations)
    }
    for slug, text in sorted(station_keys.items()):
        help_key = "help_factory_workstation_%s_content" % slug
        raw_help[help_key] = text
        records.append(extract_workstation(slug, text, names, slugs_for(help_key)))

    records.sort(key=lambda record: (record["type"], record["id"]))
    counts: dict[str, int] = {}
    for record in records:
        counts[record["type"]] = counts.get(record["type"], 0) + 1

    catalogue = {
        "schema": SCHEMA,
        "schemaVersion": SCHEMA_VERSION,
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": {
            "kind": "game-help",
            "files": source_files or {},
            "buildMetadata": build_metadata or _unknown_build(),
        },
        "helpStructure": {
            "used": bool(help_pages),
            "categories": len({p.get("category") for p in (help_pages or []) if p.get("category")}),
            "pages": len(help_pages or []),
        },
        "locale": {
            "entries": len(locale),
            "helpContentEntries": sum(1 for key in locale if key.endswith("_content")),
        },
        "counts": dict(sorted(counts.items())) | {"records": len(records)},
        "unparsed": [
            {"record": record["id"], **issue}
            for record in records
            for issue in record["unparsed"]
        ],
        "records": records,
    }
    if with_raw:
        catalogue["raw"] = {"help": dict(sorted(raw_help.items()))}
    return catalogue


def _unknown_build() -> dict:
    """Build metadata that was not observed, stated as exactly that."""
    return {
        "steamBuildId": None,
        "steamBuildIdSource": None,
        "saveBuildNumber": None,
        "saveBuildNumberSource": None,
        "note": (
            "Not observed by this extraction. A Steam build id comes from the "
            "game's appmanifest, a save build number from buildNumberAtLastSave "
            "in a .hsg file; neither is read here, and neither is guessed."
        ),
    }


def steam_build_id(manifest_path: str) -> dict:
    """The Steam build id from an appmanifest, or a clear failure."""
    text = read_source(manifest_path).decode("utf-8", "replace")
    app_id = re.search(r'"appid"\s*"(\d+)"', text)
    if not app_id or app_id.group(1) != "1331550":
        raise SourceError(f"expected Big Ambitions appid 1331550 in {manifest_path}")
    match = re.search(r'"buildid"\s*"(\d+)"', text)
    if not match:
        raise SourceError(f"no buildid in {manifest_path}")
    return {
        "steamBuildId": match.group(1),
        "steamBuildIdSource": os.path.abspath(manifest_path),
        "saveBuildNumber": None,
        "saveBuildNumberSource": None,
        "note": (
            "Steam build id read from the appmanifest. It is not the game save "
            "build number the dashboard reports from a save."
        ),
    }


def _select_businesses(locale: dict[str, str], wanted: list[str] | None) -> dict[str, str]:
    """The business help pages to extract, failing loudly on an unknown slug.

    A slug is accepted whole (`ba:businesstype_giftshop`) or as its tail
    (`giftshop`), which is how the help's own link names it.
    """
    available = {
        m.group(1): text
        for key, text in locale.items()
        if (m := _BUSINESS_HELP_RE.match(key))
    }
    if not available:
        raise SourceError(
            "no help_ba:businesstype_*_content pages in the locale; "
            "is this the game's own en.json?"
        )
    if wanted is None:
        return available
    chosen = {}
    for name in wanted:
        matches = [
            slug
            for slug in available
            if slug == name or slug.removeprefix("ba:businesstype_") == name
        ]
        if not matches:
            raise SourceError(
                "no help page for business type %r; known: %s"
                % (name, ", ".join(sorted(available)))
            )
        chosen[matches[0]] = available[matches[0]]
    return {slug: chosen[slug] for slug in sorted(chosen)}


def _referenced(records: list[dict]) -> tuple[set[str], set[str], set[str]]:
    """The items, recipes and workstations the selected records talk about."""
    items: set[str] = set()
    recipes: set[str] = set()
    stations: set[str] = set()

    def walk(value) -> None:
        if isinstance(value, dict):
            slug = value.get("slug")
            if isinstance(slug, str):
                if slug.startswith("ba:itemname_"):
                    items.add(slug)
                    # A workstation is named as the furniture it is assembled
                    # from; its own pages are keyed without that suffix.
                    if slug.endswith("workstation"):
                        stations.add(
                            slug.removeprefix("ba:itemname_").removesuffix("workstation")
                        )
                elif slug.startswith("recipe/"):
                    recipes.add(slug)
                elif slug.startswith("workstation/"):
                    stations.add(slug.removeprefix("workstation/"))
            for key, child in value.items():
                if key == "suppliers":
                    continue
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)

    for record in records:
        walk(record)
    return items, recipes, stations


# --- validation, writing, comparing ------------------------------------


def validate_catalogue_text(text: str) -> dict:
    """Parse a serialised catalogue and check the promises the schema makes.

    Runs before any output file is touched: a catalogue that fails here never
    replaces the previous one.
    """
    try:
        catalogue = json.loads(text)
    except ValueError as exc:
        raise SourceError(f"serialised catalogue is not valid JSON: {exc}") from exc
    validate_catalogue(catalogue)
    return catalogue


def validate_catalogue(catalogue: dict) -> None:
    if catalogue.get("schema") != SCHEMA:
        raise SourceError(f"schema is {catalogue.get('schema')!r}, expected {SCHEMA!r}")
    if catalogue.get("schemaVersion") != SCHEMA_VERSION:
        raise SourceError(
            f"schemaVersion is {catalogue.get('schemaVersion')!r}, expected {SCHEMA_VERSION!r}"
        )
    if not catalogue.get("generated"):
        raise SourceError("catalogue has no extraction timestamp")
    source = catalogue.get("source") or {}
    if source.get("kind") != "game-help":
        raise SourceError(f"source kind is {source.get('kind')!r}, expected 'game-help'")
    for name, meta in (source.get("files") or {}).items():
        if not meta.get("sha256"):
            raise SourceError(f"source file {name} has no sha256")
    records = catalogue.get("records")
    if not isinstance(records, list) or not records:
        raise SourceError("catalogue has no records")
    seen = set()
    for record in records:
        for field in ("id", "type", "slug", "sources"):
            if not record.get(field):
                raise SourceError(f"record {record.get('id')!r} has no {field}")
        if record["id"] in seen:
            raise SourceError(f"duplicate record id {record['id']!r}")
        seen.add(record["id"])
        if not isinstance(record["sources"], list):
            raise SourceError(f"record {record['id']} sources is not a list")
    counted = catalogue.get("counts", {}).get("records")
    if counted != len(records):
        raise SourceError(f"counts.records says {counted}, catalogue holds {len(records)}")


def write_catalogue(path: str, catalogue: dict) -> str:
    """Serialise, validate, then replace the output in one move.

    The temporary file lives beside the target so the swap is a rename, which
    is atomic on the systems this runs on; a failed validation leaves the
    previous catalogue standing.
    """
    import tempfile

    text = json.dumps(catalogue, ensure_ascii=False, indent=2) + "\n"
    validate_catalogue_text(text)
    directory = os.path.dirname(os.path.abspath(path)) or "."
    os.makedirs(directory, exist_ok=True)
    handle, temporary = tempfile.mkstemp(dir=directory, prefix=".wiki-", suffix=".tmp")
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


def diff_records(old: list[dict], new: list[dict]) -> dict:
    """Added, removed and changed records between two catalogues.

    Records are matched on `id`, so a re-selection or a re-ordering does not
    read as churn. Metadata keys that only describe when a catalogue was
    written are excluded before comparing.
    """
    volatile = {"generated"}
    strip = lambda record: {k: v for k, v in record.items() if k not in volatile}
    before = {record["id"]: strip(record) for record in old}
    after = {record["id"]: strip(record) for record in new}
    changed = []
    for record_id in sorted(set(before) & set(after)):
        if before[record_id] == after[record_id]:
            continue
        fields = sorted(
            key
            for key in set(before[record_id]) | set(after[record_id])
            if before[record_id].get(key) != after[record_id].get(key)
        )
        changed.append({"id": record_id, "fields": fields})
    return {
        "added": sorted(set(after) - set(before)),
        "removed": sorted(set(before) - set(after)),
        "changed": changed,
    }


def load_catalogue(path: str) -> dict:
    catalogue = json.loads(read_source(path).decode("utf-8-sig"))
    if catalogue.get("schema") != SCHEMA:
        raise SourceError(f"{path} is not a {SCHEMA} catalogue")
    return catalogue
