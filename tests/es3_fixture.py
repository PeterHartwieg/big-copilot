"""Synthetic .hsg bytes for tests: a dict tree written the way ba_save reads it.

Only the shapes ba_save.load_save() needs to hand the tree back: every dict is
an untyped struct, a list is a collection, and the scalars keep their Python
types (int as int32, float as double). Dictionary entries are written as the
reader returns them, {"$k": ..., "$v": ...}. Never a real save: tests use
synthetic fixtures only.

    python tests/es3_fixture.py out.hsg [payload.json]
        writes link_company() as a save, and the board's payload for it
"""
from __future__ import annotations

import gzip
import json
import os
import struct
import sys


def _string(value: str | None) -> bytes:
    if value is None:
        return b"\x00"
    raw = value.encode("utf-16-le")
    return b"\x01" + struct.pack("<i", len(raw) // 2) + raw


def _value(tag: int, value) -> bytes:
    """The bytes after a value tag; `tag` is the named form (odd)."""
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
    raise ValueError(tag)


def _tag(value) -> int:
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
             "products": [{"itemName": "ba:itemname_paperbag", "amount": 3800,
                           "assignedWarehouse": address("ba:street_pier", 9)}]},
            {"id": "CONTRACTtwo", "importAddress": address("ba:street_pier", 2),
             "nextDeliveryDay": 29, "isActive": False,
             "products": [{"itemName": "ba:itemname_paperbag", "amount": 0,
                           "assignedWarehouse": address("ba:street_pier", 9)}]},
            {"id": "CONTRACTthree", "importAddress": address("ba:street_pier", 3),
             "employeeInstanceId": "AGENTcccc", "nextDeliveryDay": 29, "isActive": False,
             "products": [{"itemName": "ba:itemname_candle", "amount": 500,
                           "assignedWarehouse": address("ba:street_pier", 9)}]},
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
