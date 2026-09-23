"""A stand-in for the Big Copilot Link mod, serving a save file from disk.

    python tools/game_link_mock.py "<path to a .hsg>" [--port 8322]

Speaks the contract in docs/game-link-api.md (schema 1) so the web app and the
local watcher can be developed and tested without the game or Unity. POST
/refresh and a change of the file's modification time both re-read the file
and issue a new stamp, so pointing it at the game's own autosave folder gives a
live-looking link.

Error paths on demand: --throttle answers every /refresh with 429, --refuse
<reason> with 409, --schema <n> advertises another schema version. The day,
hour and cash in /health are whatever the flags say, not the save's.

The writes (POST /write/uniforms, /imports, /schedule, /undo) are checked
against the save as ba_save reads it, as far as the bytes allow: addresses,
contract ids and amounts, the shift print, uniforms already set, who is
assigned where, which stations exist. What the game alone knows (importer caps,
prices, the Uniforms window's skill list) is not checked. The mock never
rewrites the file: an apply is kept in memory, over the bytes, so a later write
sees it, answers the state it left, and moves the stamp as /refresh does.
GET /debug/writes lists the applies; POST /debug/config changes the error
switches while it runs, for the page's tests. --code sets the pairing code
(else one is drawn and printed), --refuse-write <error>[:<detail>] makes every
apply answer that refusal, --busy-writes <n> answers the next n writes busy,
--writes names the kinds /health lists ("" for a 0.1.0 mod that lists none).
"""
from __future__ import annotations

import argparse
import gzip
import http.server
import json
import os
import re
import secrets
import sys
import threading
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import ba_save  # noqa: E402
from ba_dashboard import schedule_entries, shift_print  # noqa: E402

SCHEMA_VERSION = 1
DEFAULT_PORT = 8322
REFRESH_WINDOW = 15  # seconds between refreshes, as the mod throttles
ALLOWED_ORIGINS = ("https://bigcopilot.com", "https://www.bigcopilot.com")
LOCAL_ORIGIN = re.compile(r"^http://(127\.0\.0\.1|localhost)(:\d+)?$")
EXPOSED = "ETag, X-Game-Link-Stamp, X-Game-Link-Day, X-Game-Link-Character"
WRITE_KINDS = ("uniforms", "imports", "schedule")
PAIR_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
MAX_BODY = 256 * 1024
ENDPOINTS = ["/health", "/save", "/refresh"] + [f"/write/{k}" for k in (*WRITE_KINDS, "undo")]
# The refusal --refuse-write refused answers per kind when it names no rule.
REFUSED_DEFAULT = {"uniforms": "no_locker", "imports": "locked", "schedule": "screen_open"}
HQ_TYPE = "ba:businesstype_headquarters"
CLEANING_STATION = "ba:itemname_cleaningstation"
LOCKER = "ba:itemname_uniformlocker"


def allowed_origin(origin: str | None) -> bool:
    return bool(origin) and (origin in ALLOWED_ORIGINS or bool(LOCAL_ORIGIN.match(origin)))


def pairing_code() -> str:
    return "".join(secrets.choice(PAIR_ALPHABET) for _ in range(6))


class BadRequest(Exception):
    """A body the contract does not allow: 400 bad_request with this detail."""


def _address(value, where: str) -> tuple[str, int]:
    if not (isinstance(value, dict) and isinstance(value.get("street"), str)
            and isinstance(value.get("number"), int) and not isinstance(value.get("number"), bool)):
        raise BadRequest(f"{where} must be {{street, number}}")
    return value["street"], value["number"]


def _wire(address: tuple[str, int]) -> dict:
    return {"street": address[0], "number": address[1]}


def _whole(value) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


class Link:
    """The served state: the bytes of the last refresh and its stamp, and the
    writes applied over them."""

    def __init__(self, path: str, *, character: str, company: str, day: int, hour: int,
                 cash: float, build: int, schema: int, throttle: bool, refuse: str | None,
                 code: str | None = None, writes: list | None = list(WRITE_KINDS),
                 refuse_write: str | None = None, busy_writes: int = 0):
        self.path = path
        self.character, self.company = character, company
        self.day, self.hour, self.cash, self.build = day, hour, cash, build
        self.schema, self.throttle, self.refuse = schema, throttle, refuse
        self.code = code or pairing_code()
        self.writes = writes  # None: the key is left out, as a 0.1.0 mod does
        self.refuse_write, self.busy_writes = refuse_write, busy_writes
        self.lock = threading.Lock()
        self.data = b""
        self.stamp = ""
        self.refreshed_at = None
        self.last_refresh = 0.0
        self.busy = False
        self._mtime = None
        self._last_seconds = 0
        self._parsed = (None, None)
        # What the applies left over the bytes, and what undo would restore.
        self.applied: list[dict] = []
        self.uniforms: dict = {}    # address -> {skill: preset id}
        self.products: dict = {}    # (contract id, item, address) -> amount
        self.contracts: dict = {}   # contract id -> {active, repeating, nextDeliveryDay}
        self.order: list | None = None
        self.schedules: dict = {}   # address -> [entries], as schedule_entries()
        self.opened: set = set()    # addresses a write opened 0 to 24
        self.undo: dict = {}
        self.refresh(force=True)

    def refresh(self, force: bool = False) -> tuple[int, dict]:
        """Re-read the file. Returns the status and body /refresh would answer."""
        with self.lock:
            now = time.monotonic()
            if self.refuse and not force:
                return 409, {"error": "cannot_save", "reason": self.refuse}
            if not force and (self.busy or self.throttle or now - self.last_refresh < REFRESH_WINDOW):
                wait = REFRESH_WINDOW if self.throttle else int(REFRESH_WINDOW - (now - self.last_refresh)) + 1
                return 429, {"error": "throttled", "retryAfter": wait}
            before = self.stamp
            self.busy = True
        try:
            with open(self.path, "rb") as fh:
                data = fh.read()
            mtime = os.path.getmtime(self.path)
        except OSError:
            with self.lock:
                self.busy = False
            return 409, {"error": "cannot_save", "reason": "saving"}
        with self.lock:
            self.data = data
            self._mtime = mtime
            # The contract's shape, kept distinct even inside one second: the
            # stamp is opaque, but two refreshes must never share one.
            seconds = max(int(time.time()), self._last_seconds + 1)
            self._last_seconds = seconds
            self.stamp = f"{self.day}-{self.hour}-{seconds}"
            self.refreshed_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            self.last_refresh = now
            self.busy = False
        return 202, {"accepted": True, "stamp": before}

    def follow(self, interval: float = 2.0) -> None:
        """Re-read when the file on disk changes, the way the mod refreshes after a game save."""
        while True:
            time.sleep(interval)
            try:
                mtime = os.path.getmtime(self.path)
            except OSError:
                continue
            if mtime != self._mtime:
                time.sleep(0.75)  # the game may still be writing
                self.refresh(force=True)

    def health(self, paired: bool = False) -> dict:
        with self.lock:
            body = {
                "ok": True, "schemaVersion": self.schema, "modVersion": "mock",
                "source": "mock", "build": self.build, "character": self.character,
                "company": self.company, "day": self.day, "hour": self.hour, "minute": 0,
                "cash": self.cash, "stamp": self.stamp, "busy": self.busy,
                "size": len(self.data), "refreshedAt": self.refreshed_at,
            }
            if self.writes is not None:
                body["writes"] = list(self.writes)
                body["paired"] = paired
            return body

    def paired(self, header: str | None) -> bool:
        return bool(header) and header.strip() == f"Bearer {self.code}"

    # --- the save, as ba_save reads it ---------------------------------------
    def _save(self) -> ba_save.Save:
        """The bytes served now, parsed once per stamp. Bytes that do not parse
        read as an empty company: every address is then not_found."""
        if self._parsed[0] != self.stamp:
            try:
                # ba_save reads a path; the served bytes can be newer than the
                # file on disk is old, so they are parsed as they are.
                reader = ba_save._Reader(gzip.decompress(self.data))
                if reader.u8() != 0x02:
                    raise ba_save.SaveFormatError("not an Easy Save 3 stream")
                save = ba_save.Save(reader.instance(with_ref_id=True), reader.refs, self.path)
            except (OSError, EOFError, ValueError, IndexError, ba_save.SaveFormatError):
                save = ba_save.Save({}, {}, self.path)
            self._parsed = (self.stamp, save)
        return self._parsed[1]

    @staticmethod
    def _registration(save, address):
        for reg in save.items(save.root.get("BuildingRegistrations")):
            if (reg.get("StreetName"), reg.get("StreetNumber")) == address:
                return reg
        return None

    @staticmethod
    def _site_error(reg) -> str | None:
        if reg is None:
            return "not_found"
        if not reg.get("RentedByPlayer"):
            return "not_rented"
        return None

    # --- writes ----------------------------------------------------------------
    def write(self, kind: str, body: dict) -> tuple[int, dict]:
        """One POST /write/<kind> with a parsed, paired body."""
        dry = body.get("dryRun", False)
        if not isinstance(dry, bool):
            raise BadRequest("dryRun must be true or false")
        with self.lock:
            if self.busy_writes > 0:
                self.busy_writes -= 1
                return 503, {"error": "busy"}
            if not dry and self.refuse_write:
                return self._refusal(kind, body)
            if kind == "undo":
                status, answer = self._undo(body, dry)
            else:
                status, answer = getattr(self, "_" + kind)(self._save(), body, dry)
            applied = status == 200 and not dry
            if applied:
                self.applied.append({"kind": kind, "body": body, "answer": answer})
                before = self.stamp
        if applied:
            self.refresh(force=True)  # as the mod refreshes after an apply
            answer["stamp"] = before
        return status, answer

    def _refusal(self, kind: str, body: dict) -> tuple[int, dict]:
        error, _, detail = self.refuse_write.partition(":")
        if error == "not_paired":
            return 401, {"error": "not_paired"}
        if error == "too_large":
            return 413, {"error": "too_large"}
        if error in ("busy", "main_thread_unavailable"):
            return 503, {"error": error}
        if error == "cannot_write":
            return 409, {"error": "cannot_write", "reason": detail or "saving"}
        if error in ("changed", "refused") and kind in WRITE_KINDS:
            # The rows the dry run of this body answers, each refused alike.
            _, answer = getattr(self, "_" + kind)(self._save(), body, True)
            rule = "changed" if error == "changed" else detail or REFUSED_DEFAULT[kind]
            rows = answer.get("rows", [])
            if kind == "schedule":
                rows = [] if error == "changed" else [{"d": 0, "i": 0, "error": rule}]
            for row in rows:
                if "error" in row:
                    row["error"] = rule
                if rule == "locked":
                    row["reopens"] = {"day": self._monday(), "hour": 8}
            return 409, {"error": error, "rows": rows}
        return 409, {"error": error}

    # uniforms ---------------------------------------------------------------------
    def _uniforms(self, save, body, dry):
        sites = body.get("sites")
        if not isinstance(sites, list) or not sites:
            raise BadRequest("sites must be a non-empty list")
        presets = [{"id": p.get("id"), "name": p.get("name")}
                   for p in save.items(save.root.get("employeePresets"))]
        rows, writes = [], []
        for site in sites:
            if not isinstance(site, dict):
                raise BadRequest("sites[] must be objects")
            address = _address(site.get("address"), "sites[].address")
            skills = site.get("skills")
            if not isinstance(skills, list) or not all(isinstance(s, str) for s in skills):
                raise BadRequest("sites[].skills must be a list of skill ids")
            wanted = site.get("presetId")
            if wanted is not None and not isinstance(wanted, str):
                raise BadRequest("sites[].presetId must be null or a string")
            reg = self._registration(save, address)
            row = {"address": _wire(address), "business": reg.get("BusinessName") if reg else None,
                   "presetId": None, "presetName": None, "set": [], "skipped": [], "error": None}
            rows.append(row)
            error = self._site_error(reg)
            if not error and (not reg.get("BusinessName")
                              or reg.get("businessTypeName") in (None, "", "ba:businesstype_empty")):
                error = "no_business"
            if not error and not any(
                    (save.deref(h.get("$v")) or {}).get("itemName") == LOCKER
                    for h in save.items(reg.get("itemInstances")) if isinstance(h, dict)):
                error = "no_locker"
            preset = None
            if not error:
                if wanted is None:
                    preset = next((p for p in presets if p["name"] == "Default"), presets[0] if presets else None)
                else:
                    preset = next((p for p in presets if p["id"] == wanted), None)
                if preset is None:
                    error = "no_preset"
            if error:
                row["error"] = error
                continue
            row["presetId"], row["presetName"] = preset["id"], preset["name"]
            have = {e.get("$k") for e in save.items(reg.get("uniformsBySkill"))}
            have |= set(self.uniforms.get(address, {}))
            for skill in dict.fromkeys(skills):
                if skill in have:
                    row["skipped"].append({"skill": skill, "reason": "already_set"})
                elif not skill.startswith("ba:skill_"):
                    row["skipped"].append({"skill": skill, "reason": "not_offered"})
                else:
                    row["set"].append(skill)
            writes.append((address, row["set"], preset["id"]))
        ok = all(row["error"] is None for row in rows)
        answer = {"ok": ok, "kind": "uniforms", "dryRun": dry, "presets": presets, "rows": rows}
        if dry:
            return 200, answer
        if not ok:
            return 409, {"error": "refused", "rows": rows}
        for address, skills, preset_id in writes:
            self.uniforms.setdefault(address, {}).update({skill: preset_id for skill in skills})
        self.undo["uniforms"] = {"rows": [dict(row) for row in rows]}
        return 200, answer

    # imports --------------------------------------------------------------------
    def _lock_window(self) -> bool:
        weekday = self.day % 7
        return (weekday == 0 and self.hour >= 20) or (weekday == 1 and self.hour < 8)

    def _monday(self) -> int:
        """The Monday of the next delivery, as the game's Start picks it."""
        monday = self.day + ((1 - self.day) % 7 or 7)
        return monday + 7 if self._lock_window() and self.day % 7 == 0 else monday

    def _imminent_monday(self) -> int:
        """The Monday whose delivery the lock window closes."""
        return self.day + (1 - self.day) % 7

    def _contract_state(self, contract) -> dict:
        state = {"active": bool(contract.get("isActive")),
                 "repeating": bool(contract.get("isRepeatingOrder")),
                 "nextDeliveryDay": contract.get("nextDeliveryDay") or 0}
        state.update(self.contracts.get(contract.get("id"), {}))
        return state

    def _amount(self, cid, product) -> int:
        key = (cid, product.get("itemName"), self._product_address(product))
        return self.products.get(key, product.get("amount", 0))

    @staticmethod
    def _product_address(product):
        where = product.get("assignedWarehouse")
        return (where.get("streetName"), where.get("streetNumber", 0)) if isinstance(where, dict) else None

    def _imports(self, save, body, dry):
        wanted = body.get("contracts")
        order = body.get("order")
        if not isinstance(wanted, list):
            raise BadRequest("contracts must be a list")
        if order is not None and not (isinstance(order, list) and all(isinstance(i, str) for i in order)):
            raise BadRequest("order must be null or a list of contract ids")
        contracts = {c.get("id"): c for c in save.items(save.root.get("importPartnerships"))}
        current = self.order or list(contracts)
        rows, changes = [], []
        changed = False
        for ask in wanted:
            if not (isinstance(ask, dict) and isinstance(ask.get("id"), str)
                    and isinstance(ask.get("activate", False), bool) and isinstance(ask.get("products", []), list)):
                raise BadRequest("contracts[] must be {id, activate, products}")
            contract = contracts.get(ask["id"])
            row = {"id": ask["id"], "importer": None, "active": None, "repeating": None,
                   "reactivated": False, "nextDeliveryDay": None, "nextDeliveryTotal": None,
                   "error": None, "reopens": None, "products": []}
            rows.append(row)
            if contract is None:
                row["error"] = "not_found"
                continue
            source = save.address(contract.get("importAddress"))
            row["importer"] = f"{source[1]} {source[0]}" if source else None
            state = self._contract_state(contract)
            after = dict(state)
            if ask.get("activate") and not state["active"]:
                after.update(active=True, repeating=True, nextDeliveryDay=self._monday())
                row["reactivated"] = True
            amounts = {}
            for want in ask.get("products", []):
                if not (isinstance(want, dict) and isinstance(want.get("itemName"), str)):
                    raise BadRequest("products[] must carry itemName")
                warehouse = _address(want.get("warehouse"), "products[].warehouse")
                product = next((p for p in save.items(contract.get("products"))
                                if p.get("itemName") == want["itemName"]
                                and self._product_address(p) == warehouse), None)
                line = {"itemName": want["itemName"], "warehouse": _wire(warehouse), "before": None,
                        "amount": want.get("amount"), "smart": bool(contract.get("isTarget")),
                        "unitPrice": None, "cap": None, "orderedThisWeek": None, "error": None, "max": None}
                row["products"].append(line)
                if product is None:
                    line["error"] = "not_found"
                    continue
                before = self._amount(ask["id"], product)
                line["before"] = before
                line["orderedThisWeek"] = product.get("amountOrderedThisWeek", 0)
                if want.get("expect") != before:
                    line["error"] = "changed"
                    changed = True
                elif not _whole(want.get("amount")) or want["amount"] < 0:
                    line["error"] = "bad_amount"
                elif self._site_error(self._registration(save, warehouse)):
                    line["error"] = "no_warehouse"
                else:
                    amounts[(ask["id"], want["itemName"], warehouse)] = (before, want["amount"])
            if any(line["error"] == "changed" for line in row["products"]):
                row["error"] = "changed"
            elif not contract.get("employeeInstanceId"):
                row["error"] = "no_agent"
            elif (state["active"] and any(b != a for b, a in amounts.values())
                  and self._lock_window() and state["nextDeliveryDay"] == self._imminent_monday()):
                row["error"] = "locked"
                row["reopens"] = {"day": state["nextDeliveryDay"], "hour": 8}
            row.update(active=after["active"], repeating=after["repeating"],
                       nextDeliveryDay=after["nextDeliveryDay"])
            if row["error"] is None and any(line["error"] for line in row["products"]):
                row["error"] = next(line["error"] for line in row["products"] if line["error"])
            changes.append((ask["id"], state, after, amounts))
        new_order = None
        if order is not None:
            for cid in order:
                if cid not in contracts:
                    rows.append({"id": cid, "importer": None, "error": "not_found", "products": []})
            if all(cid in contracts for cid in order):
                slots = sorted(current.index(cid) for cid in order)
                new_order = list(current)
                for slot, cid in zip(slots, order):
                    new_order[slot] = cid
        ok = all(row["error"] is None for row in rows)
        answer = {"ok": ok, "kind": "imports", "dryRun": dry, "cash": self.cash, "rows": rows}
        if dry:
            return 200, answer
        if changed:
            return 409, {"error": "changed", "rows": rows}
        if not ok:
            return 409, {"error": "refused", "rows": rows}
        undo = {"contracts": {}, "products": {}, "order": self.order}
        for cid, state, after, amounts in changes:
            undo["contracts"][cid] = self.contracts.get(cid)
            self.contracts[cid] = after
            for key, (before, amount) in amounts.items():
                undo["products"][key] = self.products.get(key)
                self.products[key] = amount
        if new_order is not None:
            self.order = new_order
        self.undo["imports"] = {"rows": rows, "state": undo}
        return 200, answer

    # schedule -------------------------------------------------------------------
    def _schedule(self, save, body, dry):
        address = _address(body.get("address"), "address")
        expect = body.get("expect")
        open_all = body.get("openAllHours", False)
        days = body.get("days")
        if not isinstance(expect, str):
            raise BadRequest("expect must be the shift print")
        if not isinstance(open_all, bool):
            raise BadRequest("openAllHours must be true or false")
        if not isinstance(days, list):
            raise BadRequest("days must be a list")
        reg = self._registration(save, address)
        answer = {"ok": False, "kind": "schedule", "dryRun": dry, "address": _wire(address),
                  "business": reg.get("BusinessName") if reg else None, "before": None, "after": None,
                  "removed": 0, "added": 0, "openedHours": False, "leftWithout": [], "warnings": [],
                  "error": self._site_error(reg), "rows": []}
        shifts = []
        for day in days:
            if not (isinstance(day, dict) and _whole(day.get("d")) and 0 <= day["d"] <= 6
                    and isinstance(day.get("shifts"), list)):
                raise BadRequest("days[] must be {d: 0-6, shifts: [...]}")
            for i, shift in enumerate(day["shifts"]):
                if not isinstance(shift, dict):
                    raise BadRequest("shifts[] must be objects")
                shifts.append((day["d"], i, shift))
        if answer["error"]:
            return self._schedule_refused(answer, dry)
        before = self.schedules.get(address, schedule_entries(save, reg))
        answer["before"] = {"shifts": len(before), "print": shift_print(before)}
        if expect != answer["before"]["print"]:
            answer["error"] = "changed"
            return (200, answer) if dry else (409, {"error": "changed", "rows": []})
        if open_all and reg.get("businessTypeName") == HQ_TYPE:
            answer["error"] = "hq_hours"
            return self._schedule_refused(answer, dry)
        staff = {e.get("id"): e for e in save.items(save.root.get("EmployeeInstances"))}
        stations = {h.get("$k"): (save.deref(h.get("$v")) or {}).get("itemName")
                    for h in save.items(reg.get("itemInstances")) if isinstance(h, dict)}
        after, taken = [], []
        for d, i, shift in shifts:
            f, t = shift.get("f"), shift.get("t")
            who, post = shift.get("employeeId"), shift.get("itemInstanceId")
            person = staff.get(who)
            error = None
            if not person or save.address(person.get("assignedAddress")) != address:
                error = "not_assigned"
            elif post not in stations:
                error = "no_station"
            elif not (_whole(f) and _whole(t) and 0 <= f < t <= 24 and t - f <= 12):
                error = "bad_hours"
            elif any(d == d2 and f < t2 and f2 < t and who == w2 for d2, f2, t2, w2, _p in taken):
                error = "overlap_person"
            elif any(d == d2 and f < t2 and f2 < t and post == p2 for d2, f2, t2, _w, p2 in taken):
                error = "overlap_station"
            if error:
                answer["rows"].append({"d": d, "i": i, "error": error})
                continue
            taken.append((d, f, t, who, post))
            after.append((d, f, t, who, post, 0 if stations[post] == CLEANING_STATION else 1))
        answer["ok"] = answer["error"] is None and not answer["rows"]
        self._schedule_answer(answer, save, before, after, open_all)
        if dry or not answer["ok"]:
            return self._schedule_refused(answer, dry)
        self.schedules[address] = after
        opened_before = address in self.opened
        if open_all:
            self.opened.add(address)
        self.undo["schedule"] = {"address": address, "before": before, "after": after,
                                 "opened": open_all and not opened_before, "business": answer["business"]}
        return 200, answer

    @staticmethod
    def _schedule_refused(answer, dry):
        """A dry run's 200, or an apply's 409 whose rows hold the shift errors
        and, as a row with no d and i, the site's own."""
        if dry or answer["ok"]:
            return 200, answer
        rows = ([{"error": answer["error"]}] if answer["error"] else []) + answer["rows"]
        return 409, {"error": "refused", "rows": rows}

    @staticmethod
    def _schedule_answer(answer, save, before, after, open_all):
        names = {e.get("id"): (save.deref(e.get("characterData")) or {}).get("name")
                 for e in save.items(save.root.get("EmployeeInstances"))}
        answer["before"] = {"shifts": len(before), "print": shift_print(before)}
        answer["after"] = {"shifts": len(after), "print": shift_print(after)}
        answer["removed"], answer["added"] = len(before), len(after)
        answer["openedHours"] = open_all
        kept = {e[3] for e in after}
        answer["leftWithout"] = [{"employeeId": who, "name": names.get(who)}
                                 for who in dict.fromkeys(e[3] for e in before) if who and who not in kept]
        hours = {}
        for d, f, t, who, _post, _type in after:
            hours[(who, d)] = hours.get((who, d), 0) + t - f
        answer["warnings"] = [{"type": "overworked", "employeeId": who, "name": names.get(who), "d": d, "hours": h}
                              for (who, d), h in sorted(hours.items()) if h > 14]

    # undo -----------------------------------------------------------------------
    def _undo(self, body, dry):
        kind = body.get("kind")
        if kind not in WRITE_KINDS:
            raise BadRequest("kind must be uniforms, imports or schedule")
        record = self.undo.get(kind)
        if record is None:
            return 409, {"error": "nothing_to_undo"}
        rows = json.loads(json.dumps(record.get("rows", [])))  # a dry run leaves the record alone
        if kind == "uniforms":
            rows = [dict(row, skipped=[]) for row in rows]
            answer = {"ok": True, "kind": kind, "dryRun": dry, "undo": True, "rows": rows}
            if not dry:
                for row in rows:
                    held = self.uniforms.get((row["address"]["street"], row["address"]["number"]), {})
                    for skill in row["set"]:
                        held.pop(skill, None)
        elif kind == "imports":
            for row in rows:
                for line in row.get("products", []):
                    line["before"], line["amount"] = line["amount"], line["before"]
            answer = {"ok": True, "kind": kind, "dryRun": dry, "undo": True, "cash": self.cash, "rows": rows}
            if not dry:
                state = record["state"]
                for cid, was in state["contracts"].items():
                    if was is None:
                        self.contracts.pop(cid, None)
                    else:
                        self.contracts[cid] = was
                for key, was in state["products"].items():
                    if was is None:
                        self.products.pop(key, None)
                    else:
                        self.products[key] = was
                self.order = state["order"]
        else:
            address = record["address"]
            answer = {"ok": True, "kind": kind, "dryRun": dry, "undo": True, "address": _wire(address),
                      "business": record["business"], "error": None, "rows": []}
            self._schedule_answer(answer, self._save(), record["after"], record["before"], False)
            answer["openedHours"] = record["opened"]
            if not dry:
                self.schedules[address] = record["before"]
                if record["opened"]:
                    self.opened.discard(address)
        if not dry:
            del self.undo[kind]  # an undo is not itself undoable
        return 200, answer

    def configure(self, body: dict) -> dict:
        """POST /debug/config: the error switches, changed while the mock runs."""
        with self.lock:
            if body.get("reset"):  # forget every apply, as a reloaded city would
                self.applied, self.undo, self.order = [], {}, None
                self.uniforms, self.products, self.contracts, self.schedules = {}, {}, {}, {}
                self.opened = set()
            if "refuseWrite" in body:
                self.refuse_write = body["refuseWrite"] or None
            if "busyWrites" in body:
                self.busy_writes = int(body["busyWrites"] or 0)
            if "writes" in body:
                self.writes = body["writes"]
            if body.get("code"):
                self.code = body["code"]
            return {"refuseWrite": self.refuse_write, "busyWrites": self.busy_writes,
                    "writes": self.writes, "applied": len(self.applied)}


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    link: Link = None

    def _cors(self) -> None:
        origin = self.headers.get("Origin")
        if allowed_origin(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Expose-Headers", EXPOSED)

    def _json(self, status: int, body: dict, extra: dict | None = None) -> None:
        data = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        self._cors()
        self.end_headers()
        self.wfile.write(data)

    def _route(self) -> str:
        return self.path.split("?")[0].rstrip("/") or "/"

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self._cors()
        if allowed_origin(self.headers.get("Origin")):
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type, If-None-Match")
            self.send_header("Access-Control-Max-Age", "600")
            if self.headers.get("Access-Control-Request-Private-Network", "").lower() == "true":
                self.send_header("Access-Control-Allow-Private-Network", "true")
        self.end_headers()

    def do_GET(self):
        route = self._route()
        if route in ("/", "/health"):
            self._json(200, self.link.health(self.link.paired(self.headers.get("Authorization"))))
        elif route == "/save":
            self._save()
        elif route == "/debug/writes":
            with self.link.lock:
                self._json(200, {"writes": self.link.applied, "code": self.link.code})
        elif route in ENDPOINTS:
            self._json(405, {"error": "method_not_allowed"})
        else:
            self._not_found()

    def do_PUT(self):
        self._other_method()

    def do_DELETE(self):
        self._other_method()

    def do_PATCH(self):
        self._other_method()

    def do_HEAD(self):
        # A HEAD answer carries no body, or the next request on a kept-alive
        # connection reads the leftover bytes as its status line.
        status = 405 if self._route() in ("/", *ENDPOINTS) else 404
        self.send_response(status)
        self.send_header("Content-Length", "0")
        self._cors()
        self.end_headers()

    def do_TRACE(self):
        self._other_method()

    def _other_method(self):
        if self._route() in ("/", *ENDPOINTS):
            self._json(405, {"error": "method_not_allowed"})
        else:
            self._not_found()

    def do_POST(self):
        route = self._route()
        if route == "/refresh":
            status, body = self.link.refresh()
            self._json(status, body)
        elif route in ENDPOINTS and route.startswith("/write/"):
            self._write(route[len("/write/"):])
        elif route == "/debug/config":
            body = self._body()
            if body is not None:
                self._json(200, self.link.configure(body))
        else:
            self._other_method()

    def _body(self) -> dict | None:
        """The JSON object in the request, or None with a 400 already sent."""
        try:
            length = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(length) or b"null")
        except (ValueError, UnicodeDecodeError):
            body = None
        if not isinstance(body, dict):
            self._json(400, {"error": "bad_request", "detail": "the body is not a JSON object"})
            return None
        return body

    def _write(self, kind: str):
        # Refused before the body is read, as the mod does; the unread body
        # would be the next request on this connection, so it is closed.
        if not self.link.paired(self.headers.get("Authorization")):
            self.close_connection = True
            self._json(401, {"error": "not_paired"}, {"Connection": "close"})
            return
        if int(self.headers.get("Content-Length") or 0) > MAX_BODY:
            self.close_connection = True
            self._json(413, {"error": "too_large"}, {"Connection": "close"})
            return
        body = self._body()
        if body is None:
            return
        try:
            status, answer = self.link.write(kind, body)
        except BadRequest as err:
            status, answer = 400, {"error": "bad_request", "detail": str(err)}
        self._json(status, answer)

    def _save(self):
        with self.link.lock:
            data, stamp, day, character = self.link.data, self.link.stamp, self.link.day, self.link.character
        if not stamp:
            self._json(503, {"error": "no_save_yet"})
            return
        etag = f'"{stamp}"'
        headers = {"ETag": etag, "X-Game-Link-Stamp": stamp, "X-Game-Link-Day": str(day),
                   "X-Game-Link-Character": character, "Cache-Control": "no-store"}
        if self.headers.get("If-None-Match") == etag:
            self.send_response(304)
            for key, value in headers.items():
                self.send_header(key, value)
            self._cors()
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Length", str(len(data)))
        for key, value in headers.items():
            self.send_header(key, value)
        self._cors()
        self.end_headers()
        self.wfile.write(data)

    def _not_found(self):
        self._json(404, {"error": "not_found", "endpoints": ENDPOINTS})

    def log_message(self, *args):
        pass


class MockServer:
    """The listener, for the CLI and for tests: start(), stop(), .url."""

    def __init__(self, link: Link, port: int = DEFAULT_PORT):
        handler = type("LinkHandler", (Handler,), {"link": link})
        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
        self.server.daemon_threads = True
        self.link = link
        self.thread = None

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.server.server_address[1]}"

    def start(self, follow: bool = True) -> "MockServer":
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        if follow:
            threading.Thread(target=self.link.follow, daemon=True).start()
        return self

    def stop(self) -> None:
        self.server.shutdown()
        self.server.server_close()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("save", help="the .hsg file to serve")
    ap.add_argument("--port", type=int, default=DEFAULT_PORT)
    ap.add_argument("--character", default="mock-character")
    ap.add_argument("--company", default="Mock Co")
    ap.add_argument("--day", type=int, default=1)
    ap.add_argument("--hour", type=int, default=9)
    ap.add_argument("--cash", type=float, default=10000.0)
    ap.add_argument("--build", type=int, default=3680)
    ap.add_argument("--schema", type=int, default=SCHEMA_VERSION, help="advertise another schema version")
    ap.add_argument("--throttle", action="store_true", help="answer every POST /refresh with 429")
    ap.add_argument("--refuse", choices=["saving", "placement", "interior", "casino"], help="answer every POST /refresh with 409")
    ap.add_argument("--code", help="the pairing code (default: drawn at start and printed)")
    ap.add_argument("--writes", default=",".join(WRITE_KINDS),
                    help='the write kinds /health lists, comma-separated; "" leaves the key out, as mod 0.1.0 does')
    ap.add_argument("--refuse-write", metavar="ERROR[:DETAIL]",
                    help="answer every apply with this refusal: changed, refused[:rule], cannot_write[:reason], "
                         "busy, main_thread_unavailable, not_paired, too_large")
    ap.add_argument("--busy-writes", type=int, default=0, help="answer the next N writes 503 busy")
    args = ap.parse_args()
    if not os.path.isfile(args.save):
        raise SystemExit(f"{args.save} is not a file")
    if args.code and not re.fullmatch(f"[{PAIR_ALPHABET}]{{6}}", args.code):
        raise SystemExit(f"--code takes six characters from {PAIR_ALPHABET}")
    writes = [k for k in args.writes.split(",") if k] if args.writes else None
    link = Link(args.save, character=args.character, company=args.company, day=args.day, hour=args.hour,
                cash=args.cash, build=args.build, schema=args.schema, throttle=args.throttle, refuse=args.refuse,
                code=args.code, writes=writes, refuse_write=args.refuse_write, busy_writes=args.busy_writes)
    server = MockServer(link, args.port).start()
    print(f"Serving {args.save} as the game link at {server.url}/  (Ctrl+C to stop)", flush=True)
    print(f"Pairing code: {link.code}", flush=True)
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        server.stop()


if __name__ == "__main__":
    main()
