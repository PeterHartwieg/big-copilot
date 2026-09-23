"""The game-link mock speaks docs/game-link-api.md: the clients' tests lean on it."""
import json
import os
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools"))
sys.path.insert(0, os.path.dirname(__file__))
import es3_fixture  # noqa: E402
import game_link_mock  # noqa: E402
from ba_dashboard import shift_print  # noqa: E402


def call(url, method="GET", headers=None, data=None):
    req = urllib.request.Request(url, method=method, headers=headers or {}, data=data)
    try:
        with urllib.request.urlopen(req) as res:
            return res.status, dict(res.headers), res.read()
    except urllib.error.HTTPError as err:
        return err.code, dict(err.headers), err.read()


class MockContract(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.dir.name, "Recover #1.hsg")
        with open(self.path, "wb") as fh:
            fh.write(b"\x1f\x8b not really a save")
        self.link = game_link_mock.Link(
            self.path, character="abc", company="Mock Co", day=34, hour=14, cash=1.5,
            build=3680, schema=1, throttle=False, refuse=None,
        )
        self.server = game_link_mock.MockServer(self.link, port=0).start(follow=False)
        self.url = self.server.url

    def tearDown(self):
        self.server.stop()
        self.dir.cleanup()

    def test_health_carries_the_contract_fields(self):
        status, _, body = call(self.url + "/health")
        health = json.loads(body)
        self.assertEqual(status, 200)
        for key in ("ok", "schemaVersion", "source", "build", "character", "company", "day",
                    "hour", "minute", "cash", "stamp", "busy", "size", "refreshedAt", "writes", "paired"):
            self.assertIn(key, health)
        self.assertEqual(health["source"], "mock")
        self.assertEqual(health["schemaVersion"], 1)
        self.assertTrue(health["stamp"])
        self.assertEqual(health["size"], os.path.getsize(self.path))

    def test_save_serves_the_bytes_with_etag_and_304(self):
        status, headers, body = call(self.url + "/save")
        self.assertEqual(status, 200)
        with open(self.path, "rb") as fh:
            self.assertEqual(body, fh.read())
        self.assertEqual(headers["Content-Type"], "application/octet-stream")
        self.assertEqual(headers["X-Game-Link-Day"], "34")
        self.assertEqual(headers["X-Game-Link-Character"], "abc")
        self.assertEqual(headers["ETag"], f'"{headers["X-Game-Link-Stamp"]}"')
        status, _, body = call(self.url + "/save", headers={"If-None-Match": headers["ETag"]})
        self.assertEqual((status, body), (304, b""))

    def test_refresh_reads_the_file_again_and_throttles(self):
        before = json.loads(call(self.url + "/health")[2])["stamp"]
        self.link.last_refresh = 0  # outside the window
        with open(self.path, "ab") as fh:
            fh.write(b" more")
        status, _, body = call(self.url + "/refresh", "POST")
        self.assertEqual(status, 202)
        self.assertEqual(json.loads(body), {"accepted": True, "stamp": before})
        health = json.loads(call(self.url + "/health")[2])
        self.assertNotEqual(health["stamp"], before)
        self.assertEqual(health["size"], os.path.getsize(self.path))
        status, _, body = call(self.url + "/refresh", "POST")
        self.assertEqual(status, 429)
        self.assertEqual(json.loads(body)["error"], "throttled")

    def test_refuse_and_unknown_routes(self):
        self.link.refuse = "placement"
        status, _, body = call(self.url + "/refresh", "POST")
        self.assertEqual((status, json.loads(body)), (409, {"error": "cannot_save", "reason": "placement"}))
        status, _, body = call(self.url + "/nothing")
        self.assertEqual(status, 404)
        self.assertEqual(json.loads(body)["endpoints"], [
            "/health", "/save", "/refresh", "/write/uniforms", "/write/imports", "/write/schedule", "/write/undo"])
        self.assertEqual(call(self.url + "/refresh")[0], 405)
        for method, route in (("HEAD", "/health"), ("PUT", "/save"), ("POST", "/"), ("DELETE", "/refresh"), ("TRACE", "/health")):
            self.assertEqual(call(self.url + route, method)[0], 405, f"{method} {route}")
        # A HEAD answer must leave nothing on the wire: the next request on the
        # same kept-alive connection has to parse cleanly.
        import http.client
        host, port = self.url[len("http://"):].split(":")
        conn = http.client.HTTPConnection(host, int(port), timeout=5)
        try:
            conn.request("HEAD", "/health")
            head = conn.getresponse()
            self.assertEqual(head.status, 405)
            self.assertEqual(head.read(), b"")
            conn.request("GET", "/health")
            after = conn.getresponse()
            self.assertEqual(after.status, 200)
            self.assertEqual(json.loads(after.read())["source"], "mock")
        finally:
            conn.close()

    def test_cors_only_for_the_allowlist(self):
        for origin in ("https://bigcopilot.com", "http://127.0.0.1:8770", "http://localhost:8080"):
            _, headers, _ = call(self.url + "/health", headers={"Origin": origin})
            self.assertEqual(headers.get("Access-Control-Allow-Origin"), origin, origin)
            self.assertIn("X-Game-Link-Stamp", headers.get("Access-Control-Expose-Headers", ""))
        _, headers, _ = call(self.url + "/health", headers={"Origin": "https://evil.example"})
        self.assertNotIn("Access-Control-Allow-Origin", headers)
        status, headers, _ = call(self.url + "/save", "OPTIONS", headers={
            "Origin": "https://bigcopilot.com", "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Private-Network": "true"})
        self.assertEqual(status, 204)
        self.assertEqual(headers.get("Access-Control-Allow-Private-Network"), "true")
        self.assertIn("Authorization", headers.get("Access-Control-Allow-Headers", ""))
        self.assertIn("GET", headers.get("Access-Control-Allow-Methods", ""))

    def test_no_save_yet_before_the_first_refresh(self):
        self.link.stamp = ""
        status, _, body = call(self.url + "/save")
        self.assertEqual((status, json.loads(body)), (503, {"error": "no_save_yet"}))

    def test_follow_picks_up_a_rewritten_file(self):
        before = self.link.stamp
        import threading
        threading.Thread(target=self.link.follow, args=(0.05,), daemon=True).start()
        time.sleep(0.2)
        os.utime(self.path, (time.time() + 5, time.time() + 5))
        for _ in range(60):
            time.sleep(0.05)
            if self.link.stamp != before:
                break
        self.assertNotEqual(self.link.stamp, before)


CODE = "ABC234"
GIFTS = {"street": "ba:street_secondavenue", "number": 10}
CORNER = {"street": "ba:street_broadway", "number": 2}
BARE = {"street": "ba:street_fifthavenue", "number": 4}
DEPOT = {"street": "ba:street_pier", "number": 9}
ANA, BEN = "AAAAemployeeAAAAAAAAAAAA", "BBBBemployeeBBBBBBBBBBBB"
REGISTER, CLEAN = "REGISTERaaaaaaaaaaaaaa==ue", "CLEANcccccccccccccccccc==ue"


class MockWrites(unittest.TestCase):
    """POST /write/*: checked against the synthetic company in es3_fixture."""

    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.dir.name, "link.hsg")
        es3_fixture.write_link_save(self.path)
        self.link = game_link_mock.Link(
            self.path, character="abc", company="Mock Co", day=34, hour=14, cash=1.5,
            build=3680, schema=1, throttle=False, refuse=None, code=CODE,
        )
        self.server = game_link_mock.MockServer(self.link, port=0).start(follow=False)
        self.url = self.server.url

    def tearDown(self):
        self.server.stop()
        self.dir.cleanup()

    def post(self, kind, body, code=CODE):
        headers = {"Content-Type": "application/json"}
        if code:
            headers["Authorization"] = f"Bearer {code}"
        status, _, raw = call(f"{self.url}/write/{kind}", "POST", headers, json.dumps(body).encode())
        return status, json.loads(raw)

    def stamp(self):
        return json.loads(call(self.url + "/health")[2])["stamp"]

    def test_health_lists_the_writes_and_says_paired_only_with_the_code(self):
        health = json.loads(call(self.url + "/health")[2])
        self.assertEqual(health["writes"], ["uniforms", "imports", "schedule"])
        self.assertIs(health["paired"], False)
        health = json.loads(call(self.url + "/health", headers={"Authorization": f"Bearer {CODE}"})[2])
        self.assertIs(health["paired"], True)
        self.link.writes = None  # a 0.1.0 mod sends neither key
        health = json.loads(call(self.url + "/health")[2])
        self.assertNotIn("writes", health)
        self.assertNotIn("paired", health)

    def test_a_write_without_the_code_is_not_paired_and_writes_nothing(self):
        for code in (None, "WRONG2"):
            status, body = self.post("uniforms", {"sites": [{"address": GIFTS, "skills": []}]}, code)
            self.assertEqual((status, body), (401, {"error": "not_paired"}))
        self.assertEqual(self.link.applied, [])

    def test_bad_bodies_are_bad_requests(self):
        for body in ({"sites": []}, {"sites": [{"address": {"street": "x"}, "skills": []}]},
                     {"dryRun": "yes", "sites": [{"address": GIFTS, "skills": []}]}):
            status, answer = self.post("uniforms", body)
            self.assertEqual(status, 400, body)
            self.assertEqual(answer["error"], "bad_request")
        status, _, raw = call(self.url + "/write/uniforms", "POST",
                              {"Authorization": f"Bearer {CODE}"}, b"not json")
        self.assertEqual((status, json.loads(raw)["error"]), (400, "bad_request"))
        status, _, raw = call(self.url + "/write/uniforms", "POST",
                              {"Authorization": f"Bearer {CODE}"}, b"x" * (256 * 1024 + 1))
        self.assertEqual((status, json.loads(raw)), (413, {"error": "too_large"}))
        status, _, _ = call(self.url + "/write/everything", "POST", {"Authorization": f"Bearer {CODE}"}, b"{}")
        self.assertEqual(status, 404)
        self.assertEqual(call(self.url + "/write/uniforms")[0], 405)

    def test_uniforms_dry_run_sets_the_gaps_skips_what_is_set_and_names_refusals(self):
        before = self.stamp()
        status, answer = self.post("uniforms", {"dryRun": True, "sites": [
            {"address": GIFTS, "skills": ["ba:skill_customerservice", "ba:skill_cleaning"], "presetId": None},
            {"address": BARE, "skills": ["ba:skill_customerservice"], "presetId": None},
            {"address": {"street": "ba:street_nowhere", "number": 1}, "skills": [], "presetId": None},
        ]})
        self.assertEqual(status, 200)
        self.assertEqual((answer["ok"], answer["kind"], answer["dryRun"]), (False, "uniforms", True))
        self.assertEqual(answer["presets"], [{"id": "PRESETdefaultAAAAAAAAAA==", "name": "Default"}])
        gifts, bare, nowhere = answer["rows"]
        self.assertEqual(gifts["business"], "HART. Gifts")
        self.assertEqual(gifts["presetName"], "Default")
        self.assertEqual(gifts["set"], ["ba:skill_customerservice"])
        self.assertEqual(gifts["skipped"], [{"skill": "ba:skill_cleaning", "reason": "already_set"}])
        self.assertIsNone(gifts["error"])
        self.assertEqual(bare["error"], "no_locker")
        self.assertEqual(nowhere["error"], "not_found")
        self.assertEqual(self.stamp(), before, "a dry run moves nothing")
        self.assertEqual(self.link.applied, [])

    def test_a_refused_apply_writes_nothing(self):
        status, answer = self.post("uniforms", {"sites": [
            {"address": GIFTS, "skills": ["ba:skill_customerservice"]},
            {"address": BARE, "skills": ["ba:skill_customerservice"]}]})
        self.assertEqual(status, 409)
        self.assertEqual(answer["error"], "refused")
        self.assertEqual([row["error"] for row in answer["rows"]], [None, "no_locker"])
        self.assertEqual(self.link.applied, [])

    def test_uniforms_apply_moves_the_stamp_is_kept_and_undoes(self):
        before = self.stamp()
        body = {"sites": [{"address": GIFTS, "skills": ["ba:skill_customerservice"], "presetId": None}]}
        status, answer = self.post("uniforms", body)
        self.assertEqual(status, 200)
        self.assertTrue(answer["ok"])
        self.assertEqual(answer["stamp"], before, "the stamp before the refresh the apply started")
        self.assertNotEqual(self.stamp(), before)
        applied = json.loads(call(self.url + "/debug/writes")[2])["writes"]
        self.assertEqual([w["kind"] for w in applied], ["uniforms"])
        # The mock keeps what it wrote: the same skill is now already set.
        _, again = self.post("uniforms", dict(body, dryRun=True))
        self.assertEqual(again["rows"][0]["skipped"], [{"skill": "ba:skill_customerservice", "reason": "already_set"}])
        status, undone = self.post("undo", {"kind": "uniforms", "dryRun": False})
        self.assertEqual(status, 200)
        self.assertTrue(undone["undo"])
        self.assertEqual(undone["rows"][0]["set"], ["ba:skill_customerservice"])
        _, again = self.post("uniforms", dict(body, dryRun=True))
        self.assertEqual(again["rows"][0]["set"], ["ba:skill_customerservice"])
        status, answer = self.post("undo", {"kind": "uniforms"})
        self.assertEqual((status, answer), (409, {"error": "nothing_to_undo"}), "an undo is not undoable")

    def test_imports_compare_and_set_activation_and_order(self):
        product = {"itemName": "ba:itemname_paperbag", "warehouse": DEPOT, "amount": 4200, "expect": 3800}
        status, answer = self.post("imports", {"dryRun": True, "contracts": [
            {"id": "CONTRACTone", "activate": True, "products": [product]}]})
        self.assertEqual(status, 200)
        row = answer["rows"][0]
        self.assertTrue(answer["ok"])
        self.assertEqual((row["products"][0]["before"], row["products"][0]["amount"]), (3800, 4200))
        self.assertTrue(row["products"][0]["smart"])
        # A stale expect is changed: a dry run says so per row, an apply is a 409.
        stale = dict(product, expect=3000)
        _, answer = self.post("imports", {"dryRun": True, "contracts": [{"id": "CONTRACTone", "products": [stale]}]})
        self.assertEqual((answer["ok"], answer["rows"][0]["error"]), (False, "changed"))
        status, answer = self.post("imports", {"contracts": [{"id": "CONTRACTone", "products": [stale]}]})
        self.assertEqual((status, answer["error"]), (409, "changed"))
        # No purchasing agent on the paused contract.
        _, answer = self.post("imports", {"dryRun": True, "contracts": [
            {"id": "CONTRACTtwo", "activate": True, "products": []}]})
        self.assertEqual(answer["rows"][0]["error"], "no_agent")
        status, answer = self.post("imports", {"contracts": [
            {"id": "CONTRACTone", "activate": False, "products": [product]}], "order": ["CONTRACTtwo", "CONTRACTone"]})
        self.assertEqual(status, 200)
        self.assertEqual(self.link.order, ["CONTRACTtwo", "CONTRACTone"])
        _, answer = self.post("imports", {"dryRun": True, "contracts": [{"id": "CONTRACTone", "products": [product]}]})
        self.assertEqual(answer["rows"][0]["error"], "changed", "the amount written is the new expect")
        self.assertEqual(self.post("undo", {"kind": "imports"})[0], 200)
        self.assertIsNone(self.link.order)
        _, answer = self.post("imports", {"dryRun": True, "contracts": [{"id": "CONTRACTone", "products": [product]}]})
        self.assertTrue(answer["ok"])

    def test_imports_inside_the_lock_window_is_locked_with_the_reopen_time(self):
        self.link.day, self.link.hour = 35, 21  # Sunday 21:00; the contract delivers on day 36
        product = {"itemName": "ba:itemname_paperbag", "warehouse": DEPOT, "amount": 4200, "expect": 3800}
        _, answer = self.post("imports", {"dryRun": True, "contracts": [{"id": "CONTRACTone", "products": [product]}]})
        self.assertEqual(answer["rows"][0]["error"], "locked")
        self.assertEqual(answer["rows"][0]["reopens"], {"day": 36, "hour": 8})

    def test_schedule_checks_the_print_and_the_grid(self):
        fixture_print = shift_print([(0, 0, 12, ANA, CLEAN, 0), (1, 8, 20, ANA, REGISTER, 1)])
        shifts = [{"f": 8, "t": 20, "employeeId": ANA, "itemInstanceId": REGISTER}]
        body = {"dryRun": True, "address": GIFTS, "expect": fixture_print, "openAllHours": False,
                "days": [{"d": 1, "shifts": shifts}]}
        status, answer = self.post("schedule", body)
        self.assertEqual(status, 200)
        self.assertTrue(answer["ok"], answer)
        self.assertEqual(answer["before"], {"shifts": 2, "print": fixture_print})
        self.assertEqual(answer["after"]["shifts"], 1)
        self.assertEqual((answer["removed"], answer["added"]), (2, 1))
        # A stale print is changed.
        _, answer = self.post("schedule", dict(body, expect="811c9dc5"))
        self.assertEqual((answer["ok"], answer["siteError"]), (False, "changed"))
        status, answer = self.post("schedule", dict(body, dryRun=False, expect="811c9dc5"))
        self.assertEqual((status, answer["error"]), (409, "changed"))
        # Every rule of the grid, one shift each.
        bad = [{"f": 8, "t": 20, "employeeId": "nobody", "itemInstanceId": REGISTER},
               {"f": 8, "t": 20, "employeeId": BEN, "itemInstanceId": "not-here"},
               {"f": 6, "t": 20, "employeeId": BEN, "itemInstanceId": REGISTER},
               {"f": 8, "t": 20, "employeeId": ANA, "itemInstanceId": REGISTER},
               {"f": 10, "t": 12, "employeeId": ANA, "itemInstanceId": CLEAN},
               {"f": 10, "t": 12, "employeeId": BEN, "itemInstanceId": REGISTER}]
        _, answer = self.post("schedule", dict(body, days=[{"d": 3, "shifts": bad}]))
        self.assertEqual([(r["i"], r["error"]) for r in answer["rows"]], [
            (0, "not_assigned"), (1, "no_station"), (2, "bad_hours"), (4, "overlap_person"), (5, "overlap_station")])
        self.assertFalse(answer["ok"])

    def test_schedule_apply_names_who_is_left_and_undoes(self):
        fixture_print = shift_print([(0, 0, 12, ANA, CLEAN, 0), (1, 8, 20, ANA, REGISTER, 1)])
        body = {"address": GIFTS, "expect": fixture_print, "openAllHours": True,
                "days": [{"d": 2, "shifts": [{"f": 8, "t": 20, "employeeId": BEN, "itemInstanceId": REGISTER}]}]}
        status, answer = self.post("schedule", body)
        self.assertEqual(status, 200)
        self.assertEqual(answer["leftWithout"], [{"employeeId": ANA, "name": "Ana Silva"}])
        self.assertTrue(answer["openedHours"])
        new_print = answer["after"]["print"]
        self.assertEqual(new_print, shift_print([(2, 8, 20, BEN, REGISTER, 1)]))
        # The next write expects the print the last one left.
        _, answer = self.post("schedule", dict(body, dryRun=True, expect=new_print))
        self.assertTrue(answer["ok"])
        status, undone = self.post("undo", {"kind": "schedule"})
        self.assertEqual(status, 200)
        self.assertEqual(undone["after"]["print"], fixture_print)

    def test_refuse_write_and_busy_answer_every_apply_but_not_the_dry_run(self):
        body = {"sites": [{"address": GIFTS, "skills": ["ba:skill_customerservice"]}]}
        self.link.refuse_write = "cannot_write:placement"
        self.assertEqual(self.post("uniforms", body), (409, {"error": "cannot_write", "reason": "placement"}))
        self.assertEqual(self.post("uniforms", dict(body, dryRun=True))[0], 200)
        self.link.refuse_write = "refused"
        status, answer = self.post("uniforms", body)
        self.assertEqual((status, answer["error"], answer["rows"][0]["error"]), (409, "refused", "no_locker"))
        self.link.refuse_write = "changed"
        status, answer = self.post("uniforms", body)
        self.assertEqual((status, answer["error"]), (409, "changed"))
        self.link.refuse_write = None
        self.link.busy_writes = 2
        self.assertEqual(self.post("uniforms", body), (503, {"error": "busy"}))
        self.assertEqual(self.post("uniforms", body), (503, {"error": "busy"}))
        self.assertEqual(self.post("uniforms", body)[0], 200)

    def test_debug_config_switches_while_running(self):
        status, _, raw = call(self.url + "/debug/config", "POST", {"Content-Type": "application/json"},
                              json.dumps({"refuseWrite": "busy", "writes": ["imports"]}).encode())
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(call(self.url + "/health")[2])["writes"], ["imports"])
        self.assertEqual(self.post("uniforms", {"sites": [{"address": GIFTS, "skills": []}]}), (503, {"error": "busy"}))

    def test_uniforms_null_asks_for_every_offered_skill_and_a_list_filters(self):
        _, answer = self.post("uniforms", {"dryRun": True, "sites": [{"address": GIFTS, "skills": None}]})
        row = answer["rows"][0]
        # The register and the cleaning station stand in for the Uniforms window.
        self.assertEqual(row["set"], ["ba:skill_customerservice"])
        self.assertEqual(row["skipped"], [{"skill": "ba:skill_cleaning", "reason": "already_set"}])
        _, answer = self.post("uniforms", {"dryRun": True, "sites": [
            {"address": GIFTS, "skills": ["ba:skill_securityguard", "ba:skill_customerservice"]}]})
        row = answer["rows"][0]
        self.assertEqual(row["set"], ["ba:skill_customerservice"])
        self.assertEqual(row["skipped"], [{"skill": "ba:skill_securityguard", "reason": "not_offered"}])

    def test_an_apply_that_changes_nothing_answers_a_stamp_and_clears_the_undo(self):
        body = {"sites": [{"address": GIFTS, "skills": None}]}
        self.assertEqual(self.post("uniforms", body)[0], 200)
        self.assertIn("uniforms", self.link.undo)
        before = self.stamp()
        status, answer = self.post("uniforms", body)  # everything is set now
        self.assertEqual((status, answer["rows"][0]["set"], answer["stamp"]), (200, [], before))
        self.assertNotEqual(self.stamp(), before)
        self.assertEqual(self.post("undo", {"kind": "uniforms"}), (409, {"error": "nothing_to_undo"}))

    def test_imports_activation_needs_amounts_and_rows_say_what_moved(self):
        # The paused contract gets an agent in memory only for this check.
        self.link.contracts["CONTRACTtwo"] = {"active": False, "repeating": False, "nextDeliveryDay": 29}
        contracts = {c["id"]: c for c in self.link._save().items(self.link._save().root["importPartnerships"])}
        contracts["CONTRACTtwo"]["employeeInstanceId"] = "AGENTbbbb"
        zero = {"itemName": "ba:itemname_paperbag", "warehouse": DEPOT, "amount": 0, "expect": 0}
        _, answer = self.post("imports", {"dryRun": True, "contracts": [
            {"id": "CONTRACTtwo", "activate": True, "products": [zero]}]})
        self.assertEqual(answer["rows"][0]["error"], "no_amounts")
        _, answer = self.post("imports", {"dryRun": True, "contracts": [
            {"id": "CONTRACTtwo", "activate": True, "products": [dict(zero, amount=500)]}],
            "order": ["CONTRACTtwo", "CONTRACTone"]})
        self.assertTrue(answer["ok"], answer)
        self.assertEqual((answer["rows"][0]["reordered"], answer["rows"][0]["reactivated"]), (True, True))
        # A product error is repeated on its contract row.
        _, answer = self.post("imports", {"dryRun": True, "contracts": [
            {"id": "CONTRACTone", "products": [{"itemName": "ba:itemname_paperbag", "warehouse": DEPOT,
                                                "amount": -1, "expect": 3800}]}]})
        self.assertEqual((answer["rows"][0]["error"], answer["rows"][0]["products"][0]["error"]),
                         ("bad_amount", "bad_amount"))

    def test_imports_activation_lists_a_product_with_no_warehouse(self):
        contract = self.link._save().items(self.link._save().root["importPartnerships"])[1]
        contract["employeeInstanceId"] = "AGENTbbbb"
        contract["products"]["$items"].append(
            {"itemName": "ba:itemname_burger", "amount": 10,
             "assignedWarehouse": {"streetName": "ba:street_nowhere", "streetNumber": 1}})
        _, answer = self.post("imports", {"dryRun": True, "contracts": [{"id": "CONTRACTtwo", "activate": True, "products": [
            {"itemName": "ba:itemname_paperbag", "warehouse": DEPOT, "amount": 500, "expect": 0}]}]})
        row = answer["rows"][0]
        self.assertEqual([(p["itemName"], p["error"]) for p in row["products"]],
                         [("ba:itemname_paperbag", None), ("ba:itemname_burger", "no_warehouse")])
        self.assertEqual(row["error"], "no_warehouse")

    def test_schedule_refusals_lead_with_the_site_error(self):
        body = {"address": BARE, "expect": "811c9dc5", "openAllHours": False, "days": []}
        self.link.refuse_write = "refused:screen_open"
        status, answer = self.post("schedule", body)
        self.assertEqual((status, answer), (409, {"error": "refused", "rows": [{"error": "screen_open"}]}))
        self.link.refuse_write = None
        status, answer = self.post("schedule", dict(body, address={"street": "ba:street_nowhere", "number": 1}))
        self.assertEqual((status, answer), (409, {"error": "refused", "rows": [{"error": "not_found"}]}))
        _, answer = self.post("schedule", dict(body, dryRun=True, address={"street": "ba:street_nowhere", "number": 1}))
        self.assertEqual((answer["ok"], answer["siteError"]), (False, "not_found"))

    def test_a_headquarters_is_never_written(self):
        reg = self.link._save().items(self.link._save().root["BuildingRegistrations"])[0]
        reg["businessTypeName"] = "ba:businesstype_headquarters"
        fixture_print = shift_print([(0, 0, 12, ANA, CLEAN, 0), (1, 8, 20, ANA, REGISTER, 1)])
        _, answer = self.post("schedule", {"dryRun": True, "address": GIFTS, "expect": fixture_print, "days": []})
        self.assertEqual((answer["ok"], answer["siteError"]), (False, "headquarters"))

    def test_a_schedule_undo_whose_shifts_no_longer_hold_is_changed(self):
        fixture_print = shift_print([(0, 0, 12, ANA, CLEAN, 0), (1, 8, 20, ANA, REGISTER, 1)])
        body = {"address": GIFTS, "expect": fixture_print,
                "days": [{"d": 2, "shifts": [{"f": 8, "t": 20, "employeeId": BEN, "itemInstanceId": REGISTER}]}]}
        self.assertEqual(self.post("schedule", body)[0], 200)
        ana = self.link._save().items(self.link._save().root["EmployeeInstances"])[0]
        ana["assignedAddress"] = {"streetName": "ba:street_broadway", "streetNumber": 2}  # moved since
        self.assertEqual(self.post("undo", {"kind": "schedule"}), (409, {"error": "changed"}))


if __name__ == "__main__":
    unittest.main()
