"""Synthetic .hsg bytes for tests: a dict tree written the way ba_save reads it.

Only the shapes ba_save.load_save() needs to hand the tree back: every dict is
an untyped struct, a list is a collection, and the scalars keep their Python
types (int as int32, float as double). Dictionary entries are written as the
reader returns them, {"$k": ..., "$v": ...}. A Shared is a class instance with a
reference id and a Ref a back-reference to one, the way the game writes an
object held in two places (an import product's warehouse Address). Never a real
save: tests use synthetic fixtures only.

    python tests/es3_fixture.py out.hsg [payload.json]
        writes link_company() as a save, and the board's payload for it
"""
from __future__ import annotations

import gzip
import json
import os
import struct
import sys


class Shared:
    """A class instance with a reference id: `fields`, written once, of `type_name`."""

    def __init__(self, ref_id: int, type_name: str, fields: dict):
        self.ref_id, self.type_name, self.fields = ref_id, type_name, fields


class Ref:
    """A back-reference to the Shared with this id, wherever in the file it is."""

    def __init__(self, ref_id: int):
        self.ref_id = ref_id


# --- the tags the plain Python types never produce ---------------------------
# Real saves also carry bytes, enums, 32-bit floats, packed primitive arrays and
# instances that reuse a type slot defined earlier. These markers write them, so
# a test can hand ba_save the same shapes; a tree without them encodes exactly
# as before. Each one knows its value tag and the bytes after it.

class _Marker:
    tag = 0

    def encode(self) -> bytes:
        raise NotImplementedError


class Byte(_Marker):
    """0x11: one unsigned byte; ba_save reads it back as an int."""
    tag = 0x11

    def __init__(self, value: int):
        self.value = value

    def encode(self) -> bytes:
        return struct.pack("<B", self.value)


class Enum(_Marker):
    """0x1D: an enum, written as an int64; ba_save reads it back as an int."""
    tag = 0x1D

    def __init__(self, value: int):
        self.value = value

    def encode(self) -> bytes:
        return struct.pack("<q", self.value)


class Float32(_Marker):
    """0x1F: a single-precision float; ba_save reads it back as a float."""
    tag = 0x1F

    def __init__(self, value: float):
        self.value = value

    def encode(self) -> bytes:
        return struct.pack("<f", self.value)


# Element formats of a packed array by .NET element type, as ba_save._PACKED reads them.
PACKED_FORMATS = {
    "System.Boolean": ("?", 1),
    "System.Int32": ("i", 4),
    "System.Int64": ("q", 8),
    "System.Single": ("f", 4),
    "System.Double": ("d", 8),
}


def _header(slot: int, type_name: str | None, reuse: bool) -> bytes:
    """An instance header: 2f defines `slot` as `type_name`, 30 reuses it."""
    if reuse:
        return b"\x30" + struct.pack("<i", slot)
    return b"\x2f" + struct.pack("<i", slot) + _string(type_name)


class Instance(_Marker):
    """An instance with an explicit type slot.

    With `reuse` the header is 30 <slot>, a back-reference to a slot an earlier
    Instance (or Packed) defined; ba_save then names it by that slot's type. A
    `ref_id` makes it a class instance (0x01), otherwise it is a struct (0x03).
    """

    def __init__(self, type_name: str | None, fields, slot: int, ref_id: int | None = None,
                 reuse: bool = False):
        self.type_name, self.fields, self.slot = type_name, fields, slot
        self.ref_id, self.reuse = ref_id, reuse
        self.tag = 0x03 if ref_id is None else 0x01

    def encode(self) -> bytes:
        ref = b"" if self.ref_id is None else struct.pack("<i", self.ref_id)
        return _header(self.slot, self.type_name, self.reuse) + ref + _body(self.fields)


class Packed(_Marker):
    """A packed primitive array: 08 <count> <size> <raw>, in an instance of `type_name`.

    The element type comes from `type_name` (System.Int32[], System.Single[],
    ...). For a type ba_save does not decode, pass `raw` and `size`; it hands
    back one bytes object per element.
    """

    def __init__(self, type_name: str, values=(), slot: int = 0, ref_id: int | None = None,
                 reuse: bool = False, raw: bytes | None = None, size: int | None = None):
        self.type_name, self.values, self.slot = type_name, list(values), slot
        self.ref_id, self.reuse, self.raw, self.size = ref_id, reuse, raw, size
        self.tag = 0x03 if ref_id is None else 0x01

    def encode(self) -> bytes:
        if self.raw is not None:
            size, raw = self.size, self.raw
            count = len(raw) // size
        else:
            fmt, size = PACKED_FORMATS[self.type_name.split("[", 1)[0]]
            count = len(self.values)
            raw = struct.pack(f"<{count}{fmt}", *self.values)
        ref = b"" if self.ref_id is None else struct.pack("<i", self.ref_id)
        return (_header(self.slot, self.type_name, self.reuse) + ref
                + b"\x08" + struct.pack("<ii", count, size) + raw + b"\x05")


class NullInstance(_Marker):
    """An instance whose header byte says null (00 or 2d); ba_save reads None."""

    def __init__(self, head: int = 0x00, ref: bool = True):
        self.head = head
        self.tag = 0x01 if ref else 0x03

    def encode(self) -> bytes:
        return bytes([self.head])


class Unnamed:
    """A dict value written as unnamed entries (tag + 1, no key), the way a
    Color32 holds its four bytes; ba_save collects them under "$vals". The key
    it sits under is not written."""

    def __init__(self, *values):
        self.values = values


def _string(value: str | None) -> bytes:
    if value is None:
        return b"\x00"
    raw = value.encode("utf-16-le")
    return b"\x01" + struct.pack("<i", len(raw) // 2) + raw


def _value(tag: int, value) -> bytes:
    """The bytes after a value tag; `tag` is the named form (odd)."""
    if isinstance(value, _Marker):
        return value.encode()
    if tag == 0x17:
        return struct.pack("<i", value)
    if tag == 0x21:
        return struct.pack("<d", value)
    if tag == 0x27:
        return _string(value)
    if tag == 0x2B:
        return b"\x01" if value else b"\x00"
    if tag == 0x2D:
        return b""
    if tag == 0x03:
        return b"\x2e" + _body(value)
    if tag == 0x01:
        # A type slot of its own per instance: the reader only maps slots to names.
        slot = 1000 + value.ref_id
        return (b"\x2f" + struct.pack("<i", slot) + _string(value.type_name)
                + struct.pack("<i", value.ref_id) + _body(value.fields))
    if tag == 0x09:
        return struct.pack("<i", value.ref_id)
    raise ValueError(tag)


def _tag(value) -> int:
    if isinstance(value, _Marker):
        return value.tag
    if isinstance(value, Shared):
        return 0x01
    if isinstance(value, Ref):
        return 0x09
    if value is None:
        return 0x2D
    if isinstance(value, bool):
        return 0x2B
    if isinstance(value, int):
        return 0x17
    if isinstance(value, float):
        return 0x21
    if isinstance(value, str):
        return 0x27
    if isinstance(value, (dict, list)):
        return 0x03
    raise TypeError(type(value))


def _body(value) -> bytes:
    out = bytearray()
    if isinstance(value, list):
        out += b"\x06" + struct.pack("<q", len(value))
        for item in value:
            tag = _tag(item)
            out += bytes([tag + 1]) + _value(tag, item)
        out += b"\x07"
    else:
        for key, item in value.items():
            if isinstance(item, Unnamed):
                for each in item.values:
                    tag = _tag(each)
                    out += bytes([tag + 1]) + _value(tag, each)
                continue
            tag = _tag(item)
            out += bytes([tag]) + _string(key) + _value(tag, item)
    return bytes(out + b"\x05")


def encode(root: dict) -> bytes:
    """The gzipped Easy Save 3 stream of `root`."""
    return gzip.compress(b"\x02\x2e" + _body(root))


def write_link_save(path: str) -> None:
    """The company tests/game_link_write.test.cjs and the mock's tests share."""
    with open(path, "wb") as fh:
        fh.write(encode(link_company()))


DEPOT_REF = 7  # the reference id of the depot's shared Address


def address(street: str, number: int) -> dict:
    return {"streetName": street, "streetNumber": number}


def link_company() -> dict:
    """Three shops: two with a locker and a role on shift without a uniform,
    one with no locker; a depot; two import contracts on one item and a
    stopped one, with an agent, on another; a schedule of two shifts at the
    first shop. Enough besides for extract() to run."""
    preset = "PRESETdefaultAAAAAAAAAA=="

    def shop(street, number, name, uniforms, locker=True):
        items = [{"$k": "REGISTERaaaaaaaaaaaaaa==" + street[-2:], "$v": {"itemName": "ba:itemname_cashregister"}},
                 {"$k": "CLEANcccccccccccccccccc==" + street[-2:], "$v": {"itemName": "ba:itemname_cleaningstation"}}]
        if locker:
            items.append({"$k": "LOCKERllllllllllllllll==" + street[-2:], "$v": {"itemName": "ba:itemname_uniformlocker"}})
        return {
            "StreetName": street, "StreetNumber": number, "RentedByPlayer": True,
            "BusinessName": name, "businessTypeName": "ba:businesstype_giftshop",
            "itemInstances": items,
            "uniformsBySkill": [{"$k": skill, "$v": preset} for skill in uniforms],
            "scheduleDays": [], "orderHistory": [], "retailPrices": [],
        }

    first = shop("ba:street_secondavenue", 10, "HART. Gifts", ["ba:skill_cleaning"])
    first["scheduleDays"] = [
        {"day": 7, "isOpen": True, "workShifts": [
            {"startingHour": 0, "endingHour": 12, "employeeId": "AAAAemployeeAAAAAAAAAAAA",
             "itemInstanceId": "CLEANcccccccccccccccccc==ue"}]},
        {"day": 1, "isOpen": True, "workShifts": [
            {"startingHour": 8, "endingHour": 20, "employeeId": "AAAAemployeeAAAAAAAAAAAA",
             "itemInstanceId": "REGISTERaaaaaaaaaaaaaa==ue", "type": 1}]},
    ]
    second = shop("ba:street_broadway", 2, "HART. Corner", ["ba:skill_cleaning"])
    second["scheduleDays"] = [{"day": 2, "isOpen": True, "workShifts": [
        {"startingHour": 8, "endingHour": 20, "employeeId": "CCCCemployeeCCCCCCCCCCCC",
         "itemInstanceId": "REGISTERaaaaaaaaaaaaaa==ay", "type": 1}]}]
    bare = shop("ba:street_fifthavenue", 4, "HART. Bare", [], locker=False)
    depot = {"StreetName": "ba:street_pier", "StreetNumber": 9, "RentedByPlayer": True,
             "BusinessName": "HART. Depot", "businessTypeName": "ba:businesstype_warehouse",
             "itemInstances": [], "scheduleDays": [], "orderHistory": [], "retailPrices": []}
    served = {"name": "ba:skill_customerservice", "value": 60.0}
    cleans = {"name": "ba:skill_cleaning", "value": 40.0}
    return {
        "Day": 34, "Hour": 14, "Minute": 0, "Money": 10000.0, "SaveGameName": "Link Co",
        "gameVariables": {"daysPerYear": 60},
        **{key: [] for key in ("financialSummaries", "Loans", "logisticsManagerPlans", "marketEvents",
                               "productMarketEntries", "PlayerDiplomas", "completedPersonalGoals",
                               "playerWeeklyIncomeHistory", "playerNumberOfBusinessesHistory")},
        "BuildingRegistrations": [first, second, bare, depot],
        "EmployeeInstances": [
            {"id": "AAAAemployeeAAAAAAAAAAAA", "characterData": {"name": "Ana Silva", "skills": [served, cleans]},
             "assignedAddress": address("ba:street_secondavenue", 10)},
            {"id": "BBBBemployeeBBBBBBBBBBBB", "characterData": {"name": "Ben Ode", "skills": [served]},
             "assignedAddress": address("ba:street_secondavenue", 10)},
            {"id": "CCCCemployeeCCCCCCCCCCCC", "characterData": {"name": "Cy Moss", "skills": [served]},
             "assignedAddress": address("ba:street_broadway", 2)},
        ],
        "employeePresets": [{"id": preset, "name": "Default"}],
        "importPartnerships": [
            {"id": "CONTRACTone", "importAddress": address("ba:street_pier", 1),
             "employeeInstanceId": "AGENTaaaa", "nextDeliveryDay": 36, "isActive": True,
             "isRepeatingOrder": True, "isTarget": True,
             # The warehouse as a real save stores it: a reference to an Address
             # written elsewhere in the file (by CONTRACTthree's product below).
             "products": [{"itemName": "ba:itemname_paperbag", "amount": 3800,
                           "assignedWarehouse": Ref(DEPOT_REF)}]},
            {"id": "CONTRACTtwo", "importAddress": address("ba:street_pier", 2),
             "nextDeliveryDay": 29, "isActive": False,
             "products": [{"itemName": "ba:itemname_paperbag", "amount": 0,
                           "assignedWarehouse": address("ba:street_pier", 9)}]},
            {"id": "CONTRACTthree", "importAddress": address("ba:street_pier", 3),
             "employeeInstanceId": "AGENTcccc", "nextDeliveryDay": 29, "isActive": False,
             "products": [{"itemName": "ba:itemname_candle", "amount": 500,
                           "assignedWarehouse": Shared(DEPOT_REF, "Address", address("ba:street_pier", 9))}]},
        ],
    }


def link_payload(path: str) -> dict:
    """The board's payload for the save at `path`, as the worker would build it."""
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    import ba_dashboard
    from ba_save import Names, load_save
    return ba_dashboard.extract(load_save(path), Names({}), None)


if __name__ == "__main__":
    write_link_save(sys.argv[1])
    if len(sys.argv) > 2:
        with open(sys.argv[2], "w", encoding="utf-8") as fh:
            json.dump(link_payload(sys.argv[1]), fh)
