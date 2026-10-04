"""Big Copilot's own text in other languages: the catalogue tool.

    python tools/i18n.py extract [--where]         the English catalogue, as JSON, to stdout
    python tools/i18n.py status [LANG] [--strict]  missing, stale, orphaned and mismatched keys
    python tools/i18n.py ship [--check]            write web/i18n/<lang>.json (build_web.py calls ship())
    python tools/i18n.py accept LANG [KEY ...]     record the current English as what KEY was translated from
    python tools/i18n.py glossary LANG --out PATH  the game's own words for terms our English uses
    python tools/i18n.py draft-sheet LANG [--out PATH] [--review]  what a translator has to do, with context
    python tools/i18n.py import-draft LANG FILE --model M  take a machine draft in, marked unreviewed
    python tools/i18n.py reviewed LANG KEY ... | --all  a native speaker has checked KEY

The English is never kept in a file: it stays at the call site, beside its key
(docs/architecture.md, "UI text"), and `extract` reads it from there:

- scripts: tt("key", "English") and tt("key", {one: "...", other: "..."}) in the
  board script (template/board.js), the page's smaller scripts
  (template/board.html), the landing (build_web.py's BANNER) and web/*.js;
- markup: data-tt="key" around English, and data-tt-title, -aria-label,
  -placeholder and -tip beside the attribute they fill;
- Python: msg("key", "English", ...) in ba_dashboard.py;
- the Wiki guides' labels: `guideUi` in tools/wiki_sample.json, one key
  `wiki.ui.<name>` per entry, the one source whose keys are not literals at
  the call site (guide_ui_calls()).

A translation lives in i18n/<lang>.json (flat; plurals as key_one, key_other,
in the language's CLDR categories), and i18n/<lang>.base.json keeps the English
each one was translated from, which is how a changed English shows up as stale.
The build ships i18n/<lang>.json minus orphans, placeholder mismatches and
stale keys (English changed, or none recorded) as web/i18n/<lang>.json.
Missing and stale translations never fail the build: the page falls back to
English per key. `status --strict` fails on them, for a
translation pull request.

A machine draft (`import-draft`) ships like any translation, and
i18n/<lang>.ai.json names each drafted key and the model that wrote it until a
native speaker checks it (`reviewed`, which also accepts it). `status` counts
the drafts awaiting review; they never fail it.

`glossary` and `draft-sheet` read the installed game's text. That text is the
game's, so neither writes into this repository.
"""
from __future__ import annotations

import argparse
import ast
import collections
import html.parser
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

SOURCE_DIR = os.path.join(ROOT, "i18n")
# Beside <lang>.json and <lang>.base.json: the machine-drafted keys awaiting review.
AI_SUFFIX = ".ai.json"
# The scripts a page runs, beside the board script in template/board.js.
JS_FILES = ("web/i18n.js", "web/app.js", "web/update.js", "web/community.js", "web/report.js", "web/map.js", "web/wiki.js", "web/translate.js")
# A key is <area>.<thing>[.<part>]; the area names the page, and the pull
# request that owns it (docs/architecture.md, "UI text").
AREAS = ("nav", "land", "app", "foot", "today", "f", "co", "sp", "sb", "gr", "map", "wiki", "comm",
         "upd", "br", "day")
KEY = re.compile(r"[a-z]+(\.[A-Za-z0-9_-]+)+")
PLURAL_CATEGORIES = ("zero", "one", "two", "few", "many", "other")
PLURAL_SUFFIX = re.compile(r"_(" + "|".join(PLURAL_CATEGORIES) + r")$")
# The placeholder syntax tt() and msg() share, and the specs both implement.
FIELD = re.compile(r"\{(\w+)(?::([^{}]+))?\}")
SPECS = re.compile(r",|\$|\$c|day|,?\.\df")
# CLDR plural categories of the languages Big Copilot is translated into.
PLURALS = {"en": ("one", "other"), "de": ("one", "other"), "pt": ("one", "many", "other"),
           "fr": ("one", "many", "other"), "es": ("one", "many", "other"), "ru": ("one", "few", "many", "other"),
           "ko": ("other",), "tr": ("one", "other"), "it": ("one", "many", "other")}
ATTRS = ("data-tt-title", "data-tt-aria-label", "data-tt-placeholder", "data-tt-tip")
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}


class CatalogueError(Exception):
    """Something at a call site the catalogue cannot hold."""


# ------------------------------------------------------------------ scripts
_JS_TOKEN = re.compile(r"""
    (?P<ws>\s+)
  | (?P<lc>//[^\n]*)
  | (?P<bc>/\*.*?\*/)
  | (?P<str>"(?:[^"\\\n]|\\.|\\\n)*"|'(?:[^'\\\n]|\\.|\\\n)*')
  | (?P<num>\.?\d[\w.]*)
  | (?P<id>[A-Za-z_$\u00c0-\uffff][\w$\u00c0-\uffff]*)
  | (?P<tick>`)
  | (?P<punct>\?\.|\.\.\.|[{}()\[\];,<>+\-*%&|^!~?:=.@#]|/)
""", re.S | re.X)
_REGEX_AFTER = set("(,=:[!&|?{};+-*%<>~^") | {"return", "typeof", "case", "do", "else", "in", "of", "new",
                                              "delete", "void", "throw", "instanceof", "yield", "await", "=>"}


def _js_tokens(src: str):
    """(kind, value, offset) for the code of one script: strings, template
    literals (value is their text, None when they hold ${}), identifiers and
    punctuation. Comments and regex literals are skipped."""
    i, n = 0, len(src)
    prev = None  # the last significant token's value, for regex-or-divide
    stack = []   # brace depth of each ${ ... } we are inside
    while i < n:
        c = src[i]
        if c == "`":
            j, parts, subst = i + 1, [], False
            while j < n and src[j] != "`":
                if src[j] == "\\":
                    parts.append(src[j:j + 2])
                    j += 2
                elif src.startswith("${", j):
                    subst = True
                    stack.append(0)
                    j += 2
                    break
                else:
                    parts.append(src[j])
                    j += 1
            else:
                yield "tmpl", None if subst else _unescape("".join(parts)), i
                i, prev = j + 1, "tmpl"
                continue
            yield "tmpl", None, i
            i, prev = j, "("
            continue
        if c == "}" and stack and stack[-1] == 0:
            # the end of a ${ ... }: the template goes on to its next ${ or `
            stack.pop()
            j = i + 1
            while j < n and src[j] != "`":
                if src[j] == "\\":
                    j += 2
                elif src.startswith("${", j):
                    stack.append(0)
                    j += 2
                    break
                else:
                    j += 1
            else:
                i, prev = j + 1, "tmpl"
                continue
            i, prev = j, "("
            continue
        if c == "/" and not src.startswith("//", i) and not src.startswith("/*", i) and (
                prev is None or prev in _REGEX_AFTER):
            j, cls = i + 1, False
            while j < n and src[j] != "\n":
                if src[j] == "\\":
                    j += 2
                    continue
                if src[j] == "[":
                    cls = True
                elif src[j] == "]":
                    cls = False
                elif src[j] == "/" and not cls:
                    break
                j += 1
            if j < n and src[j] == "/":
                j += 1
                while j < n and (src[j].isalnum() or src[j] == "_"):
                    j += 1
                i, prev = j, "regex"
                continue
        m = _JS_TOKEN.match(src, i)
        if not m:
            i += 1
            continue
        kind, value = m.lastgroup, m.group()
        i = m.end()
        if kind in ("ws", "lc", "bc"):
            continue
        if kind == "punct" and stack:
            if value == "{":
                stack[-1] += 1
            elif value == "}":
                stack[-1] -= 1
        if kind == "punct" and value == "=" and src.startswith(">", i):
            value, i = "=>", i + 1
        if kind == "str":
            yield "str", _unescape(value[1:-1]), m.start()
        else:
            yield kind, value, m.start()
        prev = value if kind in ("punct", "id") else kind


_ESC = {"n": "\n", "t": "\t", "r": "\r", "b": "\b", "f": "\f", "v": "\v", "0": "\0", "\n": ""}


def _unescape(s: str) -> str:
    def one(m):
        e = m.group(1)
        if e[0] == "u":
            return chr(int(e[2:-1] if e[1] == "{" else e[1:], 16))
        if e[0] == "x":
            return chr(int(e[1:], 16))
        return _ESC.get(e, e)
    return re.sub(r"\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)", one, s, flags=re.S)


def js_calls(src: str, where: str, first_line: int = 1) -> list[dict]:
    """Every tt() call of one script: {key, en, where}. A call whose key or
    English is not a literal, or holds ${}, is an error: the catalogue could
    not read it."""
    toks = list(_js_tokens(src))
    out = []
    line_at = _line_counter(src, first_line)
    for i, (kind, value, at) in enumerate(toks):
        if kind != "id" or value != "tt" or i + 1 >= len(toks) or toks[i + 1][1] != "(":
            continue
        if i and toks[i - 1][1] in (".", "function", "?."):
            continue
        place = f"{where}:{line_at(at)}"
        # Enough tokens for the English and a long params object: a window that
        # ends inside the params reads them as unknown (_js_params).
        args = toks[i + 2:i + 400]

        def literal(t):
            return t[0] in ("str", "tmpl") and t[1] is not None

        if not args or not literal(args[0]) or len(args) < 3 or args[1][1] != ",":
            raise CatalogueError(f"{place}: tt() needs a literal key and English (no ${{}})")
        key, rest = args[0][1], args[2:]
        if literal(rest[0]):
            en, after = rest[0][1], rest[1:]
        elif rest[0][1] == "{":
            en, j = {}, 1
            while j + 2 < len(rest) and rest[j][1] != "}":
                name, colon, text = rest[j], rest[j + 1], rest[j + 2]
                if name[0] not in ("id", "str") or colon[1] != ":" or not literal(text):
                    raise CatalogueError(f"{place}: tt({key!r}) plural English must be {{one: \"…\", other: \"…\"}} literals")
                en[name[1]] = text[1]
                j += 3
                if rest[j][1] == ",":
                    j += 1
            if j >= len(rest) or rest[j][1] != "}":
                raise CatalogueError(f"{place}: tt({key!r}) plural English is not a plain object")
            after = rest[j + 1:]
        else:
            raise CatalogueError(f"{place}: tt({key!r}) needs literal English (no ${{}})")
        if not after or after[0][1] not in (",", ")"):
            raise CatalogueError(f"{place}: tt({key!r}): the English must be one literal, not an expression")
        out.append({"key": key, "en": en, "where": place, "params": _js_params(after)})
    return out


def _js_params(after: list):
    """The names a tt() call passes as its params, read off the tokens after
    its English: the keys of a plain object literal, or none when the call
    ends there. None when they cannot be read (a variable, a spread, a
    computed key): a translation is then held to its English's own."""
    if after[0][1] == ")":
        return set()
    if len(after) < 2 or after[1][1] != "{":
        return None
    names, depth, expect_key = set(), 0, True
    for kind, value, _at in after[2:]:
        if depth == 0 and value == "}":
            return names
        if value in ("{", "[", "("):
            if depth == 0 and expect_key:
                return None  # a computed key
            depth += 1
            continue
        if value in ("}", "]", ")"):
            depth -= 1
            continue
        if depth:
            continue
        if expect_key:
            if kind not in ("id", "str"):
                return None  # a spread, or something the catalogue cannot read
            names.add(value)
            expect_key = False
        elif value == ",":
            expect_key = True
    return None


def _line_counter(src: str, first_line: int):
    starts = [0] + [m.end() for m in re.finditer("\n", src)]

    def line_at(offset):
        import bisect
        return first_line + bisect.bisect_right(starts, offset) - 1
    return line_at


# ------------------------------------------------------------------- markup
class _Markup(html.parser.HTMLParser):
    """data-tt* attributes, and the scripts inside a piece of markup."""

    def __init__(self, where, first_line):
        super().__init__(convert_charrefs=True)
        self.where, self.first_line = where, first_line
        self.found, self.scripts, self.open = [], [], []
        self.in_script = None

    def _place(self):
        return f"{self.where}:{self.first_line + self.getpos()[0] - 1}"

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        for cap in self.open:
            cap["depth"] += 0 if tag in VOID else 1
            cap["children"] = True
        for name in ATTRS:
            if a.get(name):
                target = "data-tip" if name == "data-tt-tip" else name[len("data-tt-"):]
                self.found.append({"key": a[name], "en": a.get(target) or "", "where": self._place()})
        if a.get("data-tt") and tag not in VOID:
            self.open.append({"key": a["data-tt"], "depth": 1, "text": [], "children": False,
                              "where": self._place()})
        if tag == "script":
            self.in_script = (self.first_line + self.getpos()[0] - 1)

    def handle_endtag(self, tag):
        if tag == "script":
            self.in_script = None
        for cap in list(self.open):
            cap["depth"] -= 1
            if cap["depth"] == 0:
                self.open.remove(cap)
                if cap["children"]:
                    raise CatalogueError(f"{cap['where']}: data-tt={cap['key']!r} is on an element with "
                                         "element children; put it on the innermost element that holds the words")
                self.found.append({"key": cap["key"], "en": " ".join("".join(cap["text"]).split()),
                                   "where": cap["where"]})

    def handle_data(self, data):
        if self.in_script is not None:
            self.scripts.append((data, self.in_script))
            return
        for cap in self.open:
            cap["text"].append(data)


def markup_calls(text: str, where: str, first_line: int = 1) -> list[dict]:
    p = _Markup(where, first_line)
    p.feed(text)
    p.close()
    found = list(p.found)
    for src, line in p.scripts:
        found.extend(js_calls(src, where, line))
    return found


# ------------------------------------------------------------------- Python
def python_calls(path: str) -> list[dict]:
    """Every msg() call in one Python file, by ast."""
    rel = os.path.relpath(path, ROOT).replace(os.sep, "/")
    with open(path, encoding="utf-8") as fh:
        tree = ast.parse(fh.read(), path)
    out = []
    for node in ast.walk(tree):
        if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "msg"):
            continue
        place = f"{rel}:{node.lineno}"
        if len(node.args) < 2 or not (isinstance(node.args[0], ast.Constant) and isinstance(node.args[0].value, str)):
            raise CatalogueError(f"{place}: msg() needs a literal key and English")
        en_node = node.args[1]
        if isinstance(en_node, ast.Constant) and isinstance(en_node.value, str):
            en = en_node.value
        elif isinstance(en_node, ast.Dict) and all(
                isinstance(k, ast.Constant) and isinstance(k.value, str)
                and isinstance(v, ast.Constant) and isinstance(v.value, str)
                for k, v in zip(en_node.keys, en_node.values)):
            en = {k.value: v.value for k, v in zip(en_node.keys, en_node.values)}
        else:
            raise CatalogueError(f"{place}: msg({node.args[0].value!r}) needs literal English")
        given = {kw.arg for kw in node.keywords}
        if None not in given:
            used = {m.group(1) for text in _forms(en) for m in FIELD.finditer(text)}
            if used - given:
                raise CatalogueError(f"{place}: msg({node.args[0].value!r}) has no param for "
                                     + ", ".join(sorted(used - given)))
        # The names it passes, where they can be read: a **spread hides them.
        out.append({"key": node.args[0].value, "en": en, "where": place,
                    "params": None if None in given else given})
    return out


# ---------------------------------------------------------------- catalogue
def _forms(en) -> list[str]:
    return list(en.values()) if isinstance(en, dict) else [en]


def _file_line(rel: str, needle: str) -> int:
    """The line of `needle` in a repository file, 1 when it is not there."""
    with open(os.path.join(ROOT, rel), encoding="utf-8") as fh:
        text = fh.read()
    at = text.find(needle)
    return text.count("\n", 0, at) + 1 if at >= 0 else 1


def calls() -> list[dict]:
    """Every call site of the page's text, from every source."""
    import ba_dashboard
    import build_web
    found = []
    # The page, then its board script, in the order the page runs them, each
    # with its own file's line numbers.
    with open(os.path.join(ROOT, "template", "board.html"), encoding="utf-8") as fh:
        found += markup_calls(fh.read(), "template/board.html")
    translate = os.path.join(ROOT, "template", "translate.html")
    if os.path.isfile(translate):
        with open(translate, encoding="utf-8") as fh:
            found += markup_calls(fh.read(), "template/translate.html")
    with open(os.path.join(ROOT, "template", "board.js"), encoding="utf-8") as fh:
        found += js_calls(fh.read(), "template/board.js")
    found += markup_calls(build_web.BANNER, "build_web.py", _file_line("build_web.py", "BANNER = "))
    for landing in (False, True):
        found += markup_calls(ba_dashboard.footer_html(landing=landing, site=True), "ba_dashboard.py",
                              _file_line("ba_dashboard.py", "def footer_html("))
    for rel in JS_FILES:
        path = os.path.join(ROOT, rel)
        if os.path.isfile(path):
            with open(path, encoding="utf-8") as fh:
                found += js_calls(fh.read(), rel)
    found += python_calls(os.path.join(ROOT, "ba_dashboard.py"))
    found += guide_ui_calls()
    return found


GUIDE_UI = "tools/wiki_sample.json"


def guide_ui_calls(path: str | None = None) -> list[dict]:
    """The Wiki guides' interface labels: one key per entry of `guideUi` in
    tools/wiki_sample.json, `wiki.ui.<name>`, whose English is the entry.

    The one exception to the literal-key rule. The labels travel in the wiki
    payload (each guide's COPY), so web/wiki.js cannot name them as literals:
    wikiCopy() looks each up with ttText(`wiki.ui.${name}`, <the payload's
    English>). The key set is read here, from the same JSON the payload is
    built from, so the catalogue checks hold for these keys as for any other.
    Article prose, topic texts and the gap and source notes are not labels
    and stay English."""
    rel = GUIDE_UI if path is None else os.path.relpath(path, ROOT).replace(os.sep, "/")
    full = os.path.join(ROOT, GUIDE_UI) if path is None else path
    if not os.path.isfile(full):
        return []
    with open(full, encoding="utf-8") as fh:
        ui = (json.load(fh) or {}).get("guideUi") or {}
    line = _file_line(rel, '"guideUi"') if path is None else 1
    out = []
    for name, en in ui.items():
        if not isinstance(en, str) or not en:
            continue
        out.append({"key": f"wiki.ui.{name}", "en": en, "where": f"{rel}:{line}", "params": set()})
    return out


def check_call(c: dict) -> None:
    key, en = c["key"], c["en"]
    if not KEY.fullmatch(key) or key.split(".")[0] not in AREAS:
        raise CatalogueError(f"{c['where']}: key {key!r} is not <area>.<thing> with an area of {', '.join(AREAS)}")
    if PLURAL_SUFFIX.search(key):
        raise CatalogueError(f"{c['where']}: key {key!r} ends in a plural suffix, which the catalogue reserves")
    if isinstance(en, dict) and set(en) != set(PLURALS["en"]):
        raise CatalogueError(f"{c['where']}: {key!r}: plural English takes one and other")
    # A template literal with ${} never gets this far: js_calls() refuses it.
    # A plain "${x:,.0f}" is a literal dollar before a placeholder, which is
    # how Python's f"${x:,.0f}" converts (docs/architecture.md, "UI text").
    for text in _forms(en):
        for m in FIELD.finditer(text):
            if m.group(2) and not SPECS.fullmatch(m.group(2)):
                raise CatalogueError(f"{c['where']}: {key!r}: unknown placeholder spec {m.group(2)!r}")


def catalogue(found: list[dict] | None = None, where: bool = False) -> dict:
    """The English catalogue: {key: English} with a plural as key_one and
    key_other, in key order. Raises CatalogueError on a key with two different
    English defaults, or a call site the catalogue cannot read."""
    found = calls() if found is None else found
    seen = {}
    for c in found:
        check_call(c)
        before = seen.get(c["key"])
        if before is not None and before["en"] != c["en"]:
            raise CatalogueError(f"key {c['key']!r} has two English defaults: {before['where']} "
                                 f"{before['en']!r} and {c['where']} {c['en']!r}")
        if before is None:
            seen[c["key"]] = dict(c, all=[c["where"]])
        elif c["where"] not in before["all"]:
            before["all"].append(c["where"])
    flat = {}
    for key in sorted(seen):
        en = seen[key]["en"]
        entries = {f"{key}_{cat}": text for cat, text in en.items()} if isinstance(en, dict) else {key: en}
        for k, text in entries.items():
            if k in flat:
                raise CatalogueError(f"key {k!r} is both a plural form and a key of its own")
            flat[k] = {"en": text, "where": seen[key]["all"]} if where else text
    return dict(sorted(flat.items()))


def passed(found: list[dict] | None = None) -> dict:
    """{key: the param names every call site of the key passes}, or None for
    a key where one call site's cannot be read. A translation may use any of
    them, not only those its English prints: "{station_name}", a game name's
    token passed beside the English plural "{stations}" (fits())."""
    found = calls() if found is None else found
    out = {}
    for c in found:
        mine = c.get("params")
        if c["key"] not in out:
            out[c["key"]] = None if mine is None else set(mine)
        elif out[c["key"]] is not None:
            out[c["key"]] = None if mine is None else out[c["key"]] & set(mine)
    return out


# ------------------------------------------------------------- translations
def fields(text: str) -> set[str]:
    """A text's placeholders, name and spec."""
    return {f"{m.group(1)}:{m.group(2) or ''}" for m in FIELD.finditer(text)}


def _base_key(key: str) -> str:
    return PLURAL_SUFFIX.sub("", key)


def _english_for(key: str, english: dict) -> tuple[str | None, set | None]:
    """What a translated key stands for in the English: the English text of
    the key (or of its plural's `other`), and the placeholders a translation
    may use (every form's, for a plural)."""
    base = _base_key(key)
    # Only these six keys can be forms of this plural. Scanning the whole
    # catalogue here made shipping translations quadratic in catalogue size.
    forms = {k: english[k] for category in PLURAL_CATEGORIES
             if (k := f"{base}_{category}") in english} if base != key else {}
    if forms:
        names = set().union(*(fields(f) for f in forms.values()))
        other = f"{base}_other"
        if other in forms:
            return forms[other], names
        # catalogue() requires `other`; callers supplying a partial catalogue
        # still get the last form in their original insertion order.
        return next(english[k] for k in reversed(english) if k in forms), names
    if key in english:
        return english[key], fields(english[key])
    return None, None


def _names_it(token: str, param: str) -> bool:
    """Whether a game name's token param stands in for an English param: X_name
    for X, and station_name for stations, as the pattern passes them."""
    return token.endswith("_name") and token[:-5] in (param, param[:-1] if param.endswith("s") else param)


def fits(key: str, text: str, english: dict, lang: str, params: dict | None = None) -> bool:
    """Whether a translation can stand in for its English.

    Where every call site's params are known (`params`, from passed()), it
    may use any param the calls pass, whether the English prints it or not;
    a param the English prints keeps the English's spec, and is used, except
    that a passed token param stands in for its English word (X_name for X,
    station_name for stations: _names_it()) and a `one` or `zero` plural
    form may leave out {n} ("ein Laden"); `few`, `many` and `other` may not.
    Otherwise every placeholder of a plain key, no more and no fewer, and a
    plural form uses no placeholder its English lacks (`other` all of them).
    Either way a plural form names a category the language has."""
    en, names = _english_for(key, english)
    if en is None:
        return False
    got = fields(text)
    m = PLURAL_SUFFIX.search(key)
    plural = bool(m) and _base_key(key) not in english
    if plural and m.group(1) not in PLURALS.get(lang, PLURALS["en"]):
        return False
    given = (params or {}).get(_base_key(key) if plural else key)
    if given is not None:
        specs = collections.defaultdict(set)
        for f in names:
            name, spec = f.split(":", 1)
            specs[name].add(spec)
        used = set()
        for f in got:
            name, spec = f.split(":", 1)
            if name not in given or (name in specs and spec not in specs[name]):
                return False
            used.add(name)
        for name in specs:
            if name in used or (name == "n" and plural and m.group(1) in ("one", "zero")):
                continue
            if not any(_names_it(token, name) for token in used - set(specs)):
                return False
        return True
    if not plural:
        return got == names
    return got <= names if m.group(1) != "other" else got == names


def load(lang: str, root: str = ROOT) -> tuple[dict, dict]:
    """i18n/<lang>.json and i18n/<lang>.base.json."""
    def read(name):
        path = os.path.join(root, "i18n", name)
        if not os.path.isfile(path):
            return {}
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
        if not isinstance(data, dict) or not all(isinstance(k, str) and isinstance(v, str) for k, v in data.items()):
            raise CatalogueError(f"i18n/{name} is not a flat object of strings")
        return data
    return read(f"{lang}.json"), read(f"{lang}.base.json")


def drafted(lang: str, root: str = ROOT) -> dict:
    """i18n/<lang>.ai.json: {key: model} for every machine-drafted key nobody
    has reviewed yet."""
    path = os.path.join(root, "i18n", f"{lang}{AI_SUFFIX}")
    if not os.path.isfile(path):
        return {}
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    if not isinstance(data, dict) or not all(isinstance(k, str) and isinstance(v, str) for k, v in data.items()):
        raise CatalogueError(f"i18n/{lang}{AI_SUFFIX} is not a flat object of strings")
    return data


def _write(name: str, data: dict) -> None:
    """One of i18n/'s files, sorted, one key a line; an empty .ai.json is removed."""
    path = os.path.join(SOURCE_DIR, name)
    if not data and name.endswith(AI_SUFFIX):
        if os.path.isfile(path):
            os.remove(path)
        return
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(dict(sorted(data.items())), fh, ensure_ascii=False, indent=1)
        fh.write("\n")


def languages(root: str = ROOT) -> list[str]:
    """The languages with a translation under i18n/."""
    folder = os.path.join(root, "i18n")
    if not os.path.isdir(folder):
        return []
    return sorted(n[:-5] for n in os.listdir(folder)
                  if n.endswith(".json") and not n.endswith((".base.json", AI_SUFFIX)))


def status(lang: str, english: dict | None = None, params: dict | None = None) -> dict:
    """{missing, stale, orphan, mismatch}: lists of keys. `params` is
    passed()'s; with neither given, both are read off the sources."""
    if english is None:
        found = calls()
        english, params = catalogue(found), passed(found)
    table, base = load(lang)
    bases = {_base_key(k) for k in table}
    missing = [k for k in english if k not in table and not (
        _base_key(k) != k and _base_key(k) in bases)]
    orphan = [k for k in table if _english_for(k, english)[0] is None]
    mismatch = [k for k in table if k not in orphan and not fits(k, table[k], english, lang, params)]
    stale = [k for k in table if k not in orphan and base.get(k) != _english_text(k, english)]
    return {"missing": missing, "stale": stale, "orphan": orphan, "mismatch": mismatch}


def _english_text(key: str, english: dict) -> str | None:
    """The English a translated key was made from: its own, or for a plural
    form the English form of that category, else `other`."""
    if key in english:
        return english[key]
    base = _base_key(key)
    return english.get(key) or english.get(f"{base}_other")


def shipped(lang: str, english: dict, root: str = ROOT, params: dict | None = None) -> dict:
    """The table the page gets: the translation minus orphans, mismatches and
    stale keys (whose English changed since, or which have no recorded
    English in <lang>.base.json). Those show their English until the
    translation is redone and `accept`ed."""
    table, base = load(lang, root)
    return {k: v for k, v in sorted(table.items())
            if _english_for(k, english)[0] is not None and fits(k, v, english, lang, params)
            and base.get(k) == _english_text(k, english)}


def _dump(table: dict) -> str:
    return json.dumps(table, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n"


def ship(check: bool = False, root: str = ROOT, english: dict | None = None,
         params: dict | None = None) -> list[str]:
    """Write web/i18n/<lang>.json for every translation under i18n/, and drop
    any for a language no longer there. With check=True write nothing and
    return the paths that differ, forward-slashed and relative to root.

    The English and the translations are always this checkout's (catalogue()
    reads the imported sources, and i18n/ sits beside them); root redirects
    only the tables compared or written, as build_web.check() redirects the
    page it compares while render() reads this checkout's board. `params` is
    passed()'s; with neither given, both are read off the sources."""
    if english is None:
        found = calls()
        english, params = catalogue(found), passed(found)
    out_dir = os.path.join(root, "web", "i18n")
    stale = []
    langs = languages()
    for lang in langs:
        text = _dump(shipped(lang, english, params=params))
        path = os.path.join(out_dir, f"{lang}.json")
        try:
            with open(path, encoding="utf-8", newline="") as fh:
                same = fh.read().replace("\r\n", "\n") == text
        except OSError:
            same = False
        if same:
            continue
        if check:
            stale.append(f"web/i18n/{lang}.json")
        else:
            os.makedirs(out_dir, exist_ok=True)
            with open(path, "w", encoding="utf-8", newline="\n") as fh:
                fh.write(text)
    if os.path.isdir(out_dir):
        for name in sorted(os.listdir(out_dir)):
            if name.endswith(".json") and name[:-5] not in langs:
                if check:
                    stale.append(f"web/i18n/{name}")
                else:
                    os.remove(os.path.join(out_dir, name))
    return stale


def accept(lang: str, keys: list[str], english: dict | None = None) -> list[str]:
    """Record the current English as what each key was translated from. With
    no keys, every translated key that has no base yet. A person accepting a
    key has checked it, so any machine-draft mark on it goes too, and so do
    the marks of keys no longer translated or no longer in the English."""
    english = catalogue() if english is None else english
    table, base = load(lang)
    marks = drafted(lang)
    keys = keys or [k for k in table if k not in base]
    done = []
    for k in keys:
        if k not in table:
            raise CatalogueError(f"{k!r} has no {lang} translation")
        text = _english_text(k, english)
        if text is None:
            raise CatalogueError(f"{k!r} is no longer in the English")
        base[k] = text
        done.append(k)
    _write(f"{lang}.base.json", base)
    if marks:
        _write(f"{lang}{AI_SUFFIX}", {k: m for k, m in marks.items() if k not in set(done)
                                      and k in table and _english_for(k, english)[0] is not None})
    return done


def live_marks(lang: str, english: dict) -> dict:
    """drafted() minus the marks of keys no longer translated or no longer in
    the English: the drafts a native speaker still has to check."""
    table, _ = load(lang)
    return {k: m for k, m in drafted(lang).items() if k in table and _english_for(k, english)[0] is not None}


def import_draft(lang: str, draft: dict, model: str, english: dict | None = None,
                 params: dict | None = None) -> dict:
    """Take a machine draft ({key: text}) into i18n/<lang>.json, record its
    English and mark each key as drafted by `model`. A current translation a
    person wrote or reviewed is never replaced: a draft only fills keys that
    are missing, stale, mismatched or still unreviewed drafts. Returns
    {"taken": [...], "kept": [...], "refused": {key: why}}."""
    if english is None:
        found = calls()
        english, params = catalogue(found), passed(found)
    table, base = load(lang)
    marks = drafted(lang)
    st = status(lang, english, params)
    redo = set(st["stale"]) | set(st["mismatch"]) | set(marks)
    forms = PLURALS.get(lang, ("one", "other"))
    kept, refused, good = [], {}, {}
    # A plural comes whole: every form the language has, from the draft or
    # already translated and current (a changed English may leave one form to redo).
    given = collections.defaultdict(set)
    current = [k for k in table if k not in st["stale"] and k not in st["mismatch"]]
    for k in [*draft, *current]:
        if PLURAL_SUFFIX.search(k):
            given[_base_key(k)].add(PLURAL_SUFFIX.search(k).group(1))
    for k, text in sorted(draft.items()):
        plural = PLURAL_SUFFIX.search(k)
        lacking = sorted(set(forms) - given[_base_key(k)]) if plural else []
        if not isinstance(text, str) or not text.strip():
            refused[k] = "empty"
        elif _english_for(k, english)[0] is None:
            refused[k] = "not in the English"
        elif plural and plural.group(1) not in forms:
            refused[k] = f"{lang} has no plural form {plural.group(1)!r}"
        elif lacking:
            refused[k] = f"the draft lacks the plural forms {', '.join(lacking)}"
        elif not fits(k, text, english, lang, params):
            refused[k] = "placeholders unlike the English"
        elif k in table and k not in redo:
            kept.append(k)
        else:
            good[k] = text
    # A form the language lacks is refused alone; any other refused form takes its group with it.
    broken = {_base_key(k) for k in refused if PLURAL_SUFFIX.search(k) and PLURAL_SUFFIX.search(k).group(1) in forms}
    taken = []
    for k, text in good.items():
        if PLURAL_SUFFIX.search(k) and _base_key(k) in broken:
            refused[k] = "another plural form of it was refused"
            continue
        table[k], base[k], marks[k] = text, _english_text(k, english), model
        taken.append(k)
    _write(f"{lang}.json", table)
    _write(f"{lang}.base.json", base)
    _write(f"{lang}{AI_SUFFIX}", marks)
    return {"taken": taken, "kept": kept, "refused": refused}


def reviewed(lang: str, keys: list[str], english: dict | None = None) -> list[str]:
    """A native speaker has checked these keys against today's English: accept
    them, which drops their machine-draft marks. With no keys, every drafted
    key still translated and still in the English."""
    english = catalogue() if english is None else english
    keys = keys or sorted(live_marks(lang, english))
    return accept(lang, keys, english) if keys else []


# -------------------------------------------------------- the game's words
def work_tree(path: str) -> str | None:
    """The git work tree a path lies in (a folder holding .git, a directory
    or a worktree's file), resolving links; None outside any."""
    here = os.path.realpath(os.path.abspath(path))
    while True:
        if os.path.exists(os.path.join(here, ".git")):
            return here
        up = os.path.dirname(here)
        if up == here:
            return None
        here = up


def _outside_repo(path: str) -> str:
    """The path, refused when it is inside any git work tree: the game's text
    is not ours to commit, in this checkout or any other."""
    full = os.path.normcase(os.path.realpath(os.path.abspath(path)))
    root = os.path.normcase(os.path.realpath(ROOT))
    # This checkout is refused even without a .git (a copy unpacked from a zip).
    tree = root if full == root or full.startswith(root + os.sep) else work_tree(path)
    if tree is not None:
        raise SystemExit(f"{path} is inside the git work tree {tree}; the game's text is not ours to "
                         "commit. Write it to a scratch folder instead.")
    return os.path.realpath(os.path.abspath(path))


def glossary(lang: str, english: dict | None = None) -> dict:
    """The game's own word in `lang` for every game term our English uses:
    its display names (items, business types, neighbourhoods, stations,
    skills) and its other short phrases of up to four words."""
    from ba_save import load_game_locale, load_locale
    english = catalogue() if english is None else english
    path, en = load_game_locale()
    if not path:
        raise SystemExit("no installed game found; set BA_LOCALE to the game's en.json")
    other = load_locale(os.path.join(os.path.dirname(path), f"{lang}.json"))
    ours = " \n ".join(english.values()).lower()
    out = {}
    for key, term in en.items():
        if not isinstance(term, str) or key not in other or len(term) < 3 or len(term.split()) > 4:
            continue
        if "{" in term or "<" in term or not re.search(r"[A-Za-z]", term):
            continue
        if re.search(r"(?<![a-z])" + re.escape(term.lower()) + r"(?![a-z])", ours):
            out.setdefault(term, other[key])
    return dict(sorted(out.items()))


def draft_sheet(lang: str, english: dict | None = None, terms: dict | None = None,
                review: bool = False) -> list[dict]:
    """The keys a translator has to do (missing and stale), with the context
    a good translation needs: the English, what it was before, the page, the
    call sites, a length budget, and the game's words in it. With review=True,
    instead the machine drafts a native speaker has to check, each with its
    text and the model that wrote it."""
    full = catalogue(where=True)
    english = {k: v["en"] for k, v in full.items()} if english is None else english
    table, base = load(lang)
    marks = drafted(lang)
    if review:
        st = {"review": sorted(live_marks(lang, english))}
    else:
        st = {s: v for s, v in status(lang, english).items() if s in ("missing", "stale")}
    rows = []
    for state in st:
        for k in st[state]:
            en = english.get(k) or _english_text(k, english) or ""
            row = {"key": k, "state": state, "area": k.split(".")[0], "en": en,
                   "where": full.get(k, full.get(f"{_base_key(k)}_other", {})).get("where", []),
                   "budget": int(len(en) * 1.3 + 0.999)}
            if state == "stale":
                row["was"], row[lang] = base.get(k), table.get(k)
            elif state == "review":
                row[lang], row["model"] = table[k], marks[k]
            if terms:
                low = en.lower()
                row["terms"] = {t: w for t, w in terms.items()
                                if re.search(r"(?<![a-z])" + re.escape(t.lower()) + r"(?![a-z])", low)}
            rows.append(row)
    return rows


# ---------------------------------------------------------------------- CLI
def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("extract", help="the English catalogue, as JSON")
    p.add_argument("--where", action="store_true", help="each key's English and its call sites")
    p.add_argument("--params", action="store_true",
                   help="instead, the param names each key's calls pass (null where they cannot be read)")
    p = sub.add_parser("status", help="missing, stale, orphaned and mismatched translations")
    p.add_argument("lang", nargs="?")
    p.add_argument("--strict", action="store_true", help="fail on anything but a clean translation")
    p = sub.add_parser("ship", help="write web/i18n/<lang>.json")
    p.add_argument("--check", action="store_true", help="write nothing; fail when web/i18n/ is stale")
    p = sub.add_parser("accept", help="record the current English as the base of translated keys")
    p.add_argument("lang")
    p.add_argument("keys", nargs="*")
    p = sub.add_parser("glossary", help="the game's words for terms our English uses (needs the game)")
    p.add_argument("lang")
    p.add_argument("--out", required=True, help="a path outside the repository")
    p = sub.add_parser("draft-sheet", help="what a translator has to do, as JSON")
    p.add_argument("lang")
    p.add_argument("--out", help="a path outside the repository; stdout by default")
    p.add_argument("--no-terms", action="store_true", help="leave out the game's words (no game needed)")
    p.add_argument("--review", action="store_true", help="instead, the machine drafts awaiting review")
    p = sub.add_parser("import-draft", help="take a machine draft in, marked unreviewed")
    p.add_argument("lang")
    p.add_argument("file", help='a JSON object {"key": "text"}')
    p.add_argument("--model", required=True, help="the model that wrote it, recorded per key")
    p = sub.add_parser("reviewed", help="a native speaker has checked these keys")
    p.add_argument("lang")
    p.add_argument("keys", nargs="*")
    p.add_argument("--all", action="store_true", help="every machine-drafted key")
    args = ap.parse_args(argv)
    out = sys.stdout
    if hasattr(out, "reconfigure"):
        out.reconfigure(encoding="utf-8")
    try:
        if args.cmd == "extract" and args.params:
            json.dump({k: None if v is None else sorted(v) for k, v in sorted(passed().items())},
                      out, ensure_ascii=False, indent=1)
            out.write("\n")
        elif args.cmd == "extract":
            json.dump(catalogue(where=args.where), out, ensure_ascii=False, indent=1)
            out.write("\n")
        elif args.cmd == "status":
            found = calls()
            english, params = catalogue(found), passed(found)
            bad = 0
            for lang in [args.lang] if args.lang else languages():
                st = status(lang, english, params)
                print(f"{lang}: {len(english)} English keys; " + ", ".join(f"{len(v)} {k}" for k, v in st.items()))
                for kind, keys in st.items():
                    for k in keys:
                        print(f"  {kind}: {k}")
                marks = live_marks(lang, english)
                if marks:
                    models = collections.Counter(marks.values())
                    print(f"  {len(marks)} machine-drafted, awaiting review ("
                          + ", ".join(f"{n} by {m}" for m, n in sorted(models.items())) + ")")
                if args.strict:
                    bad += sum(len(v) for v in st.values())
            return 1 if bad else 0
        elif args.cmd == "ship":
            stale = ship(check=args.check)
            for path in stale:
                print(f"stale: {path} (run python build_web.py --assemble)")
            return 1 if stale else 0
        elif args.cmd == "accept":
            done = accept(args.lang, args.keys)
            print(f"i18n/{args.lang}.base.json: {len(done)} keys accepted")
        elif args.cmd == "import-draft":
            with open(args.file, encoding="utf-8") as fh:
                draft = json.load(fh)
            if not isinstance(draft, dict):
                raise CatalogueError(f"{args.file} is not a JSON object")
            got = import_draft(args.lang, draft, args.model)
            print(f"i18n/{args.lang}.json: {len(got['taken'])} drafted keys taken, "
                  f"{len(got['kept'])} kept as a person wrote them, {len(got['refused'])} refused")
            for k, why in got["refused"].items():
                print(f"  refused: {k} ({why})")
            return 1 if got["refused"] else 0
        elif args.cmd == "reviewed":
            if not args.keys and not args.all:
                raise CatalogueError("name the reviewed keys, or give --all")
            english = catalogue()
            done = reviewed(args.lang, args.keys, english)
            print(f"i18n/{args.lang}{AI_SUFFIX}: {len(done)} keys reviewed, "
                  f"{len(live_marks(args.lang, english))} left")
        elif args.cmd == "glossary":
            path = _outside_repo(args.out)
            terms = glossary(args.lang)
            with open(path, "w", encoding="utf-8") as fh:
                json.dump(terms, fh, ensure_ascii=False, indent=1)
            print(f"{path}: {len(terms)} terms")
        elif args.cmd == "draft-sheet":
            terms = None if args.no_terms else glossary(args.lang)
            rows = draft_sheet(args.lang, terms=terms, review=args.review)
            if args.out:
                with open(_outside_repo(args.out), "w", encoding="utf-8") as fh:
                    json.dump(rows, fh, ensure_ascii=False, indent=1)
                print(f"{args.out}: {len(rows)} keys")
            else:
                if terms:
                    raise SystemExit("the sheet carries the game's words; give --out outside the repository, "
                                     "or --no-terms")
                json.dump(rows, out, ensure_ascii=False, indent=1)
                out.write("\n")
    except CatalogueError as exc:
        print(f"i18n: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
