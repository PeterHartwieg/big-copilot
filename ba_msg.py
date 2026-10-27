"""Big Copilot's own sentences, and the game names inside them.

msg() writes a sentence in English and keeps its catalogue key and params
beside it (Msg), so the page can write it in the reader's language;
_wire_msgs() hands those to the page at the end of a build. tok() and plain()
carry a game name inside a sentence as a token the page can swap
(docs/architecture.md, "UI text"). ba_dashboard re-exports every name here.

Nothing here reads a file or imports another of the board's modules, so any
module can import it first.
"""

from __future__ import annotations

import decimal
import math
import numbers
import re

# A game name inside a sentence the page shows travels as a token,
# U+27E6 <key>|<English> U+27E7, so the page can write it in the language the player picked
# (gnString() in the board script) and in English otherwise. Only text that
# reaches the page carries one: ids, subjects, history keys and anything sent to
# the game stay plain English, and plain() turns a token back into its English
# for Python's own reading (the CLI, the tests). A plural or a lowercased name
# cannot be a token, since the page swaps the whole name: those stay English.
NAME_TOKEN = re.compile("\u27e6(ba:[^\u27e7|\\s]+)\\|([^\u27e7]*)\u27e7")


def tok(key, english) -> str:
    """A game name for a sentence: a token where it has a game key, else as is."""
    if not english:
        return english or ""
    if not isinstance(key, str) or not key.startswith("ba:") or "\u27e7" in english or "|" in key:
        return english
    return f"\u27e6{key}|{english}\u27e7"


def plain(text):
    """Text with every game-name token back in its English."""
    return NAME_TOKEN.sub(lambda m: m.group(2), text) if isinstance(text, str) else text


# Big Copilot's own sentences in the reader's language (docs/architecture.md,
# "UI text"). Python keeps writing English: msg() returns that English as a
# str, which every reader, test and plain() sees as before, and which also
# carries the key and the params the page needs to write the sentence in
# another language. _wire_msgs() hands those to the page at the end of
# extract(). Concatenating or .replace()-ing a Msg gives a plain str: that
# sentence then stays English on every page, which the coverage test in
# tests/test_i18n_msg.py catches for a converted area.
MSG_FIELD = re.compile(r"\{(\w+)(?::([^{}]+))?\}")
MSG_FIXED = re.compile(r"(,)?\.(\d)f")


class Msg(str):
    """An English sentence that knows its catalogue key and params."""

    def __new__(cls, text, key=None, p=None):
        self = super().__new__(cls, text)
        self.key = key
        self.p = dict(p or {})
        return self

    def __reduce__(self):
        return (Msg, (str(self), self.key, self.p))

    def wire(self) -> list:
        """[key, params] for the page: numbers raw, game names as tokens, a
        nested Msg as {"m": [key, params, english]}."""
        return [self.key, {k: _wire_value(v) for k, v in self.p.items()}]


def _wire_value(v):
    if isinstance(v, Msg):
        return {"m": [v.key, {k: _wire_value(x) for k, x in v.p.items()}, str(v)]}
    if isinstance(v, (list, tuple)):
        return [_wire_value(x) for x in v]
    if isinstance(v, bool) or v is None or isinstance(v, (int, float)):
        return v
    if isinstance(v, (numbers.Real, decimal.Decimal)):
        return float(v)  # a Fraction or Decimal travels as JSON's number
    return str(v)


def _js_round(x: float) -> int:
    """Math.round(): halves go up, as the page's compact() rounds."""
    return int(math.floor(x + 0.5))


def _half_away(v, places: int = 0) -> decimal.Decimal:
    """v rounded to `places` decimals, halves away from zero.

    The one rounding rule for numbers written into text, on both sides of the
    payload: the page's fmt() and tt() round the size of a number and put the
    sign back (Math.round(Math.abs(n))), and Intl.NumberFormat, which writes
    every fixed-decimal number on the page, rounds halves away from zero too.
    Python's format() rounds halves to even, so $2.50 would read "$2" in a
    finding and "$3" on the tile beside it. A float is read at its shortest
    decimal form (repr), as Intl reads it, so 2.675 is 2.68 on both sides.
    """
    shown = decimal.Decimal(v if isinstance(v, (int, decimal.Decimal)) else repr(float(v)))
    if not shown.is_finite():  # inf and nan are written as they are
        return shown
    return shown.quantize(decimal.Decimal(1).scaleb(-places), decimal.ROUND_HALF_UP)


def _msg_format(v, spec: str | None) -> str:
    """One placeholder's English, by the spec tt() in web/i18n.js shares. Each
    writes what the f-string it replaces wrote, with halves rounded away from
    zero (_half_away()) as the page rounds them: {x} as f"{x}", {x:,} as
    f"{x:,}", {x:.1f} / {x:,.0f} as the same f-string spec, {w:$} as the
    board's fmt() ("-$1,234"; f"${x:,.0f}", which writes "$-1,234", becomes
    "${x:,.0f}" instead), {w:$c} as compact(), {d:day} a weekday name."""
    if isinstance(v, Msg) or spec is None:
        return str(v)
    if spec == "day":
        return WEEKDAYS[int(v) % 7]
    if spec == ",":
        return format(v, ",")
    if spec == "$":
        return ("-" if v < 0 else "") + "$" + format(_half_away(abs(v)), ",.0f")
    if spec == "$c":
        a, s = abs(v), "-" if v < 0 else ""
        if a >= 1e6:
            places = "0.1" if a >= 1e7 else "0.01"
            return s + "$" + str(decimal.Decimal(a / 1e6).quantize(decimal.Decimal(places), decimal.ROUND_HALF_UP)) + "M"
        if a >= 1e3:
            return s + "$" + str(_js_round(a / 1e3)) + "k"
        return s + "$" + str(_js_round(a))
    fixed = MSG_FIXED.fullmatch(spec)
    if fixed:
        return format(_half_away(v, int(fixed.group(2))), spec)
    raise ValueError(f"msg(): unknown placeholder spec {spec!r}")


def msg(key: str, en, **p) -> Msg:
    """A sentence the page can translate: its English, with {name} and
    {name:spec} filled from p. `en` is a string, or {"one": ..., "other": ...}
    chosen by the param n. The specs (_msg_format()): {n:,} grouped, {x:.1f}
    and {x:,.0f} fixed decimals, {w:$} money with the sign first, {w:$c}
    compact money, {d:day} a weekday index (0 Sunday). A game name goes in as a token (tok()), a nested
    sentence as another msg()."""
    if isinstance(en, dict):
        en = en["one"] if p.get("n") == 1 else en["other"]

    def fill(m):
        if m.group(1) not in p:
            raise KeyError(f"msg({key!r}): no param {m.group(1)!r}")
        return _msg_format(p[m.group(1)], m.group(2))

    return Msg(MSG_FIELD.sub(fill, en), key, p)


def _wire_msgs(payload):
    """Every field holding a Msg gets row["i18n"][field] = [key, params] beside
    it, so the page can write the sentence in the UI language. One pass over
    the whole payload, at the end of extract()."""
    # Only a dict or a list can hold a Msg further down, so nothing else is
    # descended into: the payload's numbers and strings run to six figures.
    if isinstance(payload, dict):
        wires = {k: v.wire() for k, v in payload.items() if isinstance(v, Msg) and v.key}
        for v in payload.values():
            if isinstance(v, (dict, list)):
                _wire_msgs(v)
        if wires:
            payload.setdefault("i18n", {}).update(wires)
    elif isinstance(payload, list):
        for v in payload:
            if isinstance(v, (dict, list)):
                _wire_msgs(v)
    return payload


# Day 1 of a save is a Monday, so day % 7 gives the weekday directly. Confirmed
# against payroll (hours logged this week) and against import delivery days.
WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
