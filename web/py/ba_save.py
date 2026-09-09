"""Reader for Big Ambitions save games (.hsg).

A .hsg file is a gzip-compressed Easy Save 3 binary stream. The format was
reverse-engineered from the save itself; the notes below describe it.

Stream layout
-------------
Everything is little-endian. A *string* is ``01 <int32 char_count> <utf-16-le>``
or the single byte ``00`` for null.

An object body is a sequence of entries terminated by ``05``::

    <tag> <key:string> <value>      named property
    <tag+1> <value>                 unnamed value (e.g. the 4 bytes of a Color32)
    06 <int64 count> (<tag+1> <value>)* 07     collection payload

Value tags::

    0x01 class instance      header + int32 reference id
    0x03 struct instance     header, no reference id
    0x09 back-reference      int32 id of an already-written instance
    0x11 byte
    0x17 int32
    0x1d enum                int64
    0x1f float
    0x21 double
    0x27 string
    0x2b bool                one byte
    0x2d null

An instance header is one of::

    2f <int32 type_slot> <type_name:string>   defines the slot, then uses it
    30 <int32 type_slot>                      reuses a slot defined earlier
    2e                                        type implied by context

Usage
-----
    from ba_save import load_save
    save = load_save(r"...\\Costy Co.hsg")
    print(save.root["Money"], save.deref(some_field))
"""

from __future__ import annotations

import gzip
import json
import os
import re
import struct

# Tags that introduce a *named* property. The same tag + 1 introduces the same
# kind of value without a name (collection elements, tuple/struct components).
PROP_TAGS = frozenset(
    {0x01, 0x03, 0x09, 0x11, 0x17, 0x1D, 0x1F, 0x21, 0x27, 0x2B, 0x2D}
)

END_OBJECT = 0x05
BEGIN_ITEMS = 0x06
END_ITEMS = 0x07


class SaveFormatError(Exception):
    """The byte stream did not match the expected Easy Save 3 layout."""


_I32 = struct.Struct("<i").unpack_from
_I64 = struct.Struct("<q").unpack_from
_F32 = struct.Struct("<f").unpack_from
_F64 = struct.Struct("<d").unpack_from
STRING_CACHE_CHARS = 64  # keys and type names are short; prose is not worth caching


class _Reader:
    def __init__(self, data: bytes):
        self.d = data
        self.p = 0
        self.type_slots: dict[int, str] = {}
        self.refs: dict[int, dict] = {}
        # Property keys and type names repeat hundreds of thousands of times;
        # decoding each occurrence was half the parse. Short strings are decoded
        # once and looked up by their raw bytes thereafter.
        self._strings: dict[bytes, str] = {}

    # --- primitives ----------------------------------------------------
    def u8(self) -> int:
        v = self.d[self.p]
        self.p += 1
        return v

    def i32(self) -> int:
        v = _I32(self.d, self.p)[0]
        self.p += 4
        return v

    def i64(self) -> int:
        v = _I64(self.d, self.p)[0]
        self.p += 8
        return v

    def f32(self) -> float:
        v = _F32(self.d, self.p)[0]
        self.p += 4
        return v

    def f64(self) -> float:
        v = _F64(self.d, self.p)[0]
        self.p += 8
        return v

    def string(self) -> str | None:
        d = self.d
        p = self.p
        marker = d[p]
        if marker == 0:
            self.p = p + 1
            return None
        if marker != 1:
            self.p = p + 1
            raise SaveFormatError(self._where(f"string marker {marker:#04x}"))
        n = _I32(d, p + 1)[0]
        start = p + 5
        end = start + n * 2
        self.p = end
        if n > STRING_CACHE_CHARS:
            return d[start:end].decode("utf-16-le", "replace")
        raw = d[start:end]
        s = self._strings.get(raw)
        if s is None:
            s = raw.decode("utf-16-le", "replace")
            self._strings[raw] = s
        return s

    def _where(self, msg: str) -> str:
        lo = max(0, self.p - 24)
        window = " ".join(f"{b:02x}" for b in self.d[lo : self.p + 40])
        return f"{msg} at offset {self.p:#x}\n  {window}"

    # --- structure -----------------------------------------------------
    def value(self, tag: int):
        if tag == 0x17:
            return self.i32()
        if tag == 0x1F:
            return self.f32()
        if tag == 0x21:
            # Real-estate purchasePrice; a float loses whole dollars past ~16M.
            return self.f64()
        if tag == 0x27:
            return self.string()
        if tag == 0x2B:
            return bool(self.u8())
        if tag == 0x2D:
            return None
        if tag == 0x1D:
            return self.i64()
        if tag == 0x11:
            return self.u8()
        if tag == 0x09:
            return {"$ref": self.i32()}
        if tag == 0x01:
            return self.instance(with_ref_id=True)
        if tag == 0x03:
            return self.instance(with_ref_id=False)
        raise SaveFormatError(self._where(f"value tag {tag:#04x}"))

    def instance(self, with_ref_id: bool):
        head = self.u8()
        type_name = None
        if head in (0x00, 0x2D):
            return None
        if head == 0x2F:
            slot = self.i32()
            type_name = self.string()
            self.type_slots[slot] = type_name
        elif head == 0x30:
            slot = self.i32()
            type_name = self.type_slots.get(slot)
        elif head == 0x2E:
            with_ref_id = False
        else:
            raise SaveFormatError(self._where(f"instance header {head:#04x}"))

        ref_id = self.i32() if with_ref_id else None
        obj = self.body(type_name, ref_id)
        if ref_id is not None:
            self.refs[ref_id] = obj
        return obj

    def body(self, type_name: str | None, ref_id: int | None) -> dict:
        obj: dict = {}
        if type_name:
            obj["$type"] = type_name
        if ref_id is not None:
            obj["$id"] = ref_id
        while True:
            tag = self.u8()
            if tag == END_OBJECT:
                return obj
            if tag == BEGIN_ITEMS:
                obj["$items"] = self.items()
                continue
            if tag in PROP_TAGS:
                key = self.string()
                obj[key] = self.value(tag)
                continue
            if tag - 1 in PROP_TAGS:
                obj.setdefault("$vals", []).append(self.value(tag - 1))
                continue
            raise SaveFormatError(self._where(f"body tag {tag:#04x} in {type_name}"))

    def items(self) -> list:
        self.i64()  # declared count; the terminator is authoritative
        out = []
        while True:
            mark = self.u8()
            if mark == END_ITEMS:
                return out
            if mark - 1 not in PROP_TAGS:
                raise SaveFormatError(self._where(f"element marker {mark:#04x}"))
            out.append(self.value(mark - 1))


class Save:
    """A parsed save game plus the helpers needed to walk it."""

    def __init__(self, root: dict, refs: dict[int, dict], path: str):
        self.root = root
        self.refs = refs
        self.path = path

    def deref(self, value):
        """Follow back-references until a real object (or None) is reached."""
        seen = 0
        while isinstance(value, dict) and set(value) == {"$ref"}:
            value = self.refs.get(value["$ref"])
            seen += 1
            if seen > 32:
                return None
        return value

    def items(self, value) -> list:
        """The elements of a collection field, empty if absent."""
        value = self.deref(value)
        if not isinstance(value, dict):
            return []
        return [self.deref(v) for v in value.get("$items", [])]

    def address(self, value) -> tuple[str, int] | None:
        """An Address field as a hashable (street slug, number) pair."""
        value = self.deref(value)
        if not isinstance(value, dict) or "streetName" not in value:
            return None
        return (value["streetName"], value.get("streetNumber", 0))


def load_save(path: str) -> Save:
    with gzip.open(path, "rb") as fh:
        data = fh.read()
    r = _Reader(data)
    if r.u8() != 0x02:
        raise SaveFormatError("not an Easy Save 3 stream")
    root = r.instance(with_ref_id=True)
    if r.p != len(data):
        raise SaveFormatError(f"stopped at {r.p:#x} of {len(data):#x}")
    return Save(root, r.refs, path)


def newest_save(folder: str) -> str:
    """The most recently written .hsg in a save folder."""
    candidates = [
        os.path.join(folder, n) for n in os.listdir(folder) if n.endswith(".hsg")
    ]
    if not candidates:
        raise FileNotFoundError(f"no .hsg files in {folder}")
    return max(candidates, key=os.path.getmtime)


# --- display names -----------------------------------------------------
DEFAULT_LOCALE = (
    r"C:\Program Files (x86)\Steam\steamapps\common\Big Ambitions"
    r"\Big Ambitions_Data\StreamingAssets\locale\en.json"
)

# Street names are not in the locale file, so slugs are re-split by word.
_STREET_WORDS = [
    "twentyfirst", "twentysecond", "twentythird", "twentyfourth", "twentyfifth",
    "twentysixth", "eleventh", "twelfth", "thirteenth", "fourteenth",
    "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth",
    "twentieth", "first", "second", "third", "fourth", "fifth", "sixth",
    "seventh", "eighth", "ninth", "tenth", "broadway", "hamptons", "hovgaard",
    "oceancrest", "oldmerchant", "easthamptons", "legacy", "airport", "cottage",
    "harbor", "avenue", "street", "road", "lane", "turnpike", "way", "pier",
]
_STREET_FIX = {
    "Oceancrest": "Ocean Crest",
    "Oldmerchant": "Old Merchant",
    "Easthamptons": "East Hamptons",
    "Twentyfirst": "21st",
    "Twentysecond": "22nd",
    "Twentythird": "23rd",
    "Twentyfourth": "24th",
    "Twentyfifth": "25th",
    "Twentysixth": "26th",
}


def load_locale(path: str = DEFAULT_LOCALE) -> dict[str, str]:
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


class Names:
    """Turns ``ba:`` slugs into the labels the game shows players."""

    def __init__(self, locale: dict[str, str] | None = None):
        self.locale = locale if locale is not None else load_locale()

    def label(self, slug: str | None, default: str = "-") -> str:
        if not slug:
            return default
        text = self.locale.get(slug)
        if text:
            return text
        tail = slug.split("_", 1)[-1] if "_" in slug else slug.replace("ba:", "")
        # "smartphone1" reads better as "Smartphone 1"; a slug is all we have.
        tail = re.sub(r"(?<=[a-z])(?=\d)", " ", tail.replace("-", " "))
        return tail.title()

    def street(self, slug: str | None) -> str:
        if not slug:
            return "-"
        tail = slug.replace("ba:street_", "")
        parts, rest = [], tail
        while rest:
            for w in _STREET_WORDS:
                if rest.startswith(w):
                    parts.append(w.capitalize())
                    rest = rest[len(w) :]
                    break
            else:
                parts.append(rest.capitalize())
                break
        return " ".join(_STREET_FIX.get(p, p) for p in parts)

    def addr(self, address: tuple[str, int] | None) -> str:
        if not address:
            return "-"
        return f"{address[1]} {self.street(address[0])}"


if __name__ == "__main__":
    import sys

    save = load_save(sys.argv[1])
    print(f"{save.root['SaveGameName']} - day {save.root['Day']}")
    print(f"cash {save.root['Money']:,.0f}  net worth {save.root['NetWorth']:,.0f}")
