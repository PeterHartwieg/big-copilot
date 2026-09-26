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
            "/health", "/save", "/refresh", "/write/uniforms", "/write/imports", "/write/schedule", "/write/hire",
            "/write/undo",
            "/pair/request", "/pair/status"])
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
        # In any case, as the mod's IsAllowedOrigin compares them (GL-8 in #110).
        for origin in ("https://bigcopilot.com", "http://127.0.0.1:8770", "http://localhost:8080",
                       "https://BigCopilot.com", "http://LocalHost:8080"):
            _, headers, _ = call(self.url + "/health", headers={"Origin": origin})
            self.assertEqual(headers.get("Access-Control-Allow-Origin"), origin, origin)
            self.assertIn("X-Game-Link-Stamp", headers.get("Access-Control-Expose-Headers", ""))
        for origin in ("https://evil.example", "http://localhost:123456", "http://localhost.evil.example"):
            _, headers, _ = call(self.url + "/health", headers={"Origin": origin})
            self.assertNotIn("Access-Control-Allow-Origin", headers, origin)
        status, headers, _ = call(self.url + "/save", "OPTIONS", headers={
            "Origin": "https://bigcopilot.com", "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Private-Network": "true"})
        self.assertEqual(status, 204)
        self.assertEqual(headers.get("Access-Control-Allow-Private-Network"), "true")
        self.assertIn("Authorization", headers.get("Access-Control-Allow-Headers", ""))
        self.assertIn("GET", headers.get("Access-Control-Allow-Methods", ""))

    def test_an_origin_off_the_list_is_refused_before_any_work(self):
        # As the mod from 0.3.1: 403 on every method but OPTIONS, and nothing done.
        before = self.link.stamp
        self.link.last_refresh = 0  # a refresh would run
        evil = {"Origin": "https://evil.example"}
        for method, route in (("GET", "/health"), ("GET", "/save"), ("POST", "/refresh"),
                              ("POST", "/write/uniforms"), ("PUT", "/save"), ("GET", "/nothing")):
            status, headers, body = call(self.url + route, method, dict(evil, **{"Content-Length": "0"}))
            self.assertEqual((status, json.loads(body)), (403, {"error": "origin_not_allowed"}), f"{method} {route}")
            self.assertNotIn("Access-Control-Allow-Origin", headers)
        self.assertEqual(self.link.stamp, before, "the refresh did not run")
        status, _, body = call(self.url + "/save", "HEAD", evil)
        self.assertEqual((status, body), (403, b""))
        # A preflight still answers, without the headers the browser needs.
        status, headers, _ = call(self.url + "/refresh", "OPTIONS", dict(evil, **{"Access-Control-Request-Method": "POST"}))
        self.assertEqual(status, 204)
        self.assertNotIn("Access-Control-Allow-Methods", headers)
        # No Origin (curl, the CLI watcher) and an allowed one are served as before.
        for headers in ({}, {"Origin": "https://bigcopilot.com"}, {"Origin": "http://localhost:9321"}):
            self.assertEqual(call(self.url + "/health", headers=headers)[0], 200, headers)
            self.assertEqual(call(self.url + "/save", headers=headers)[0], 200, headers)

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


TOKEN = "approvedTokenForTheTestsAAAAAAAAAAAAAAAAAA"  # issued to requests with no Origin
GIFTS = {"street": "ba:street_secondavenue", "number": 10}
CORNER = {"street": "ba:street_broadway", "number": 2}
BARE = {"street": "ba:street_fifthavenue", "number": 4}
DEPOT = {"street": "ba:street_pier", "number": 9}
ANA, BEN = "AAAAemployeeAAAAAAAAAAAA", "BBBBemployeeBBBBBBBBBBBB"
REGISTER, CLEAN = "REGISTERaaaaaaaaaaaaaa==ue", "CLEANcccccccccccccccccc==ue"


class LinkedMock(unittest.TestCase):
    """The mock serving the synthetic company in es3_fixture, this test's browser approved."""

    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.dir.name, "link.hsg")
        es3_fixture.write_link_save(self.path)
        self.link = game_link_mock.Link(
            self.path, character="abc", company="Mock Co", day=34, hour=14, cash=1.5,
            build=3680, schema=1, throttle=False, refuse=None,
        )
        self.link.tokens[TOKEN] = ""  # this browser, approved before
        self.server = game_link_mock.MockServer(self.link, port=0).start(follow=False)
        self.url = self.server.url

    def tearDown(self):
        self.server.stop()
        self.dir.cleanup()

    def post(self, kind, body, token=TOKEN, origin=None):
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        if origin:
            headers["Origin"] = origin
        status, _, raw = call(f"{self.url}/write/{kind}", "POST", headers, json.dumps(body).encode())
        return status, json.loads(raw)

    def stamp(self):
        return json.loads(call(self.url + "/health")[2])["stamp"]


class MockWrites(LinkedMock):
    """POST /write/*: checked against the synthetic company in es3_fixture."""

    def test_health_lists_the_writes_and_says_paired_only_with_a_token_for_its_origin(self):
        health = json.loads(call(self.url + "/health")[2])
        self.assertEqual(health["writes"], ["uniforms", "imports", "schedule", "hire"])
        self.assertIs(health["paired"], False)
        health = json.loads(call(self.url + "/health", headers={"Authorization": f"Bearer {TOKEN}"})[2])
        self.assertIs(health["paired"], True)
        health = json.loads(call(self.url + "/health", headers={"Authorization": f"Bearer {TOKEN}",
                                                                 "Origin": "https://bigcopilot.com"})[2])
        self.assertIs(health["paired"], False, "a token is its origin's alone")
        self.link.writes = None  # a 0.1.0 mod sends neither key
        health = json.loads(call(self.url + "/health")[2])
        self.assertNotIn("writes", health)
        self.assertNotIn("paired", health)

    def test_a_write_without_an_approved_token_is_not_paired_and_writes_nothing(self):
        for token, origin in ((None, None), ("unknown", None), (TOKEN, "https://bigcopilot.com")):
            status, body = self.post("uniforms", {"sites": [{"address": GIFTS, "skills": []}]}, token, origin)
            self.assertEqual((status, body), (401, {"error": "not_paired"}))
        self.assertEqual(self.link.applied, [])
        # The scheme in any case.
        status, _, _ = call(f"{self.url}/write/uniforms", "POST", {"Authorization": f"bEARER {TOKEN}"},
                            json.dumps({"dryRun": True, "sites": []}).encode())
        self.assertEqual(status, 200)
        # The applies the tests read back never carry a token.
        self.assertNotIn(TOKEN, call(self.url + "/debug/writes")[2].decode())

    def pair(self, origin=None, name="Chrome on Windows"):
        headers = {"Content-Type": "application/json", **({"Origin": origin} if origin else {})}
        status, _, raw = call(self.url + "/pair/request", "POST", headers, json.dumps({"name": name}).encode())
        return status, json.loads(raw)

    def status(self, rid):
        status, _, raw = call(f"{self.url}/pair/status?id={rid}")
        return status, json.loads(raw)

    def test_approving_a_browser_issues_a_token_once_for_its_origin(self):
        self.link.pair_delay = 0.2
        status, answer = self.pair("http://localhost:9321", "<b>Chrome</b> on Windows" + "x" * 60)
        self.assertEqual((status, answer["expiresIn"]), (202, 60))
        rid = answer["requestId"]
        # The mod's CleanName: letters, digits, space and . , - ( ) / + only, at most 39.
        self.assertEqual(self.link.pair_requests[rid]["name"], ("bChrome/b on Windows" + "x" * 60)[:39])
        self.assertEqual(self.status(rid), (200, {"state": "pending"}))
        self.assertEqual(self.pair()[0], 429, "one request at a time")
        time.sleep(0.3)
        status, answer = self.status(rid)
        self.assertEqual(answer["state"], "approved")
        token = answer["token"]
        self.assertEqual(self.status(rid), (200, {"state": "approved"}), "the token is handed out once")
        # Good for its origin, and no other.
        self.assertEqual(self.post("uniforms", {"dryRun": True, "sites": []}, token, "http://localhost:9321")[0], 200)
        self.assertEqual(self.post("uniforms", {"dryRun": True, "sites": []}, token)[0], 401)
        self.assertEqual(self.status("nothing"), (404, {"error": "not_found"}))

    def test_a_denied_expired_or_blocked_request_issues_nothing(self):
        self.link.pair_delay, self.link.pair_cooldowns = 0, [0]
        for outcome, state in (("deny", "denied"), ("expire", "expired")):
            self.link.pair = outcome
            _, answer = self.pair()
            self.assertEqual(self.status(answer["requestId"]), (200, {"state": state}))
        for reason in ("popup_open", "no_ui"):
            self.link.pair = reason
            self.assertEqual(self.pair(), (409, {"error": "cannot_pair", "reason": reason}))
        self.assertEqual(self.link.tokens, {TOKEN: ""})

    def test_a_pair_request_refused_before_any_popup(self):
        self.assertEqual(self.pair("https://evil.example"), (403, {"error": "origin_not_allowed"}))
        status, _, raw = call(self.url + "/pair/request", "POST", {"Content-Type": "application/json"}, b"x" * 5000)
        self.assertEqual((status, json.loads(raw)), (413, {"error": "too_large"}))
        status, _, raw = call(self.url + "/pair/request", "POST", {"Content-Type": "application/json"}, b"not json")
        self.assertEqual(status, 400)
        for error in ("busy", "main_thread_unavailable"):
            self.link.pair = error
            self.assertEqual(self.pair(), (503, {"error": error}))
        self.assertEqual(self.link.pair_requests, {})

    def test_an_origin_off_the_list_is_refused_before_its_body_and_a_blank_body_names_nothing(self):
        status, _, raw = call(self.url + "/pair/request", "POST",
                              {"Content-Type": "application/json", "Origin": "https://evil.example"}, b"x" * 5000)
        self.assertEqual((status, json.loads(raw)), (403, {"error": "origin_not_allowed"}))
        status, _, raw = call(self.url + "/pair/request", "POST",
                              {"Content-Type": "application/json", "Origin": "http://localhost:9321"}, b"  \n ")
        self.assertEqual(status, 202)
        self.assertEqual(self.link.pair_requests[json.loads(raw)["requestId"]]["name"], "a browser")

    def test_the_wait_after_a_denial_grows_on_repeats_within_ten_minutes(self):
        self.link.pair_delay, self.link.pair = 0, "deny"
        page = "http://localhost:9321"
        waits = []
        for _ in range(4):
            _, answer = self.pair(page, "Chrome\u200b  on\x07 Windows<>")
            self.assertEqual(self.link.pair_requests[answer["requestId"]]["name"], "Chrome on Windows")
            self.status(answer["requestId"])
            status, refused = self.pair(page)
            waits.append((status, refused["retryAfter"]))
            # The wait sat out; the strike is still remembered.
            count, at = self.link.strikes[page]
            self.link.strikes[page] = (count, at - 125)
        self.assertEqual(waits, [(429, 10), (429, 30), (429, 120), (429, 120)])
        # Another origin is not held back by this one's denials.
        self.link.pair = "approve"
        self.assertEqual(self.pair()[0], 202)
        # Ten minutes on, a denial counts as the first again.
        self.link.pair_requests.clear()
        self.link.pair = "deny"
        count, at = self.link.strikes[page]
        self.link.strikes[page] = (count, at - 601)
        _, answer = self.pair(page)
        self.status(answer["requestId"])
        self.assertEqual(self.pair(page), (429, {"error": "throttled", "retryAfter": 10}))

    def test_a_pending_request_holds_the_rest_off_for_the_time_it_has_left(self):
        self.link.pair_delay = 1000  # the player never answers
        _, answer = self.pair("http://localhost:9321")
        rid = answer["requestId"]
        self.link.pair_requests[rid]["at"] -= 45
        # Pending and cooldowns come before popup_open and no_ui, as in the mod.
        self.link.pair = "popup_open"
        self.assertEqual(self.pair("http://localhost:9321"), (429, {"error": "throttled", "retryAfter": 15}))
        self.link.pair = "approve"
        # Unanswered for 60 s it expires, and counts as a strike.
        self.link.pair_requests[rid]["at"] -= 16
        self.assertEqual(self.status(rid), (200, {"state": "expired"}))
        self.assertEqual(self.pair("http://localhost:9321")[1]["retryAfter"], 10)

    def test_the_name_and_origin_as_the_mod_reads_them(self):
        self.link.pair_delay = 0
        cases = [("HTTP://LOCALHOST:9321", None, "a browser"), (None, None, ""), ("http://localhost:9321", "cancel", "cancel_"),
                 ("http://localhost:9321", "  Edge   on   macOS  ", "Edge on macOS")]
        for origin, name, shown in cases:
            headers = {"Content-Type": "application/json", **({"Origin": origin} if origin else {})}
            body = b"" if name is None else json.dumps({"name": name}).encode()
            status, _, raw = call(self.url + "/pair/request", "POST", headers, body)
            rid = json.loads(raw)["requestId"]
            self.assertEqual((status, self.link.pair_requests[rid]["name"]), (202, shown), (origin, name))
            token = self.status(rid)[1]["token"]
            # Approved for the origin trimmed and lower-cased.
            self.assertEqual(self.link.tokens[token], (origin or "").lower())
        self.assertEqual(self.post("uniforms", {"dryRun": True, "sites": []}, token, "http://localhost:9321")[0], 200)

    def test_a_refusal_before_the_body_still_reads_it(self):
        # A large unread body could reset the socket under the answer.
        for code, size, status in ((None, 200 * 1024, 401), (TOKEN, 256 * 1024 + 1, 413)):
            headers = {"Authorization": f"Bearer {code}"} if code else {}
            got, _, raw = call(self.url + "/write/uniforms", "POST", headers, b"x" * size)
            self.assertEqual(got, status)
            self.assertIn("error", json.loads(raw))

    def test_bad_bodies_are_bad_requests(self):
        for body in ({"sites": None}, {"sites": [{"address": {"street": "x"}, "skills": []}]},
                     {"dryRun": "yes", "sites": [{"address": GIFTS, "skills": []}]},
                     {"sites": [{"address": GIFTS, "skills": []}, {"address": GIFTS, "skills": []}]}):
            status, answer = self.post("uniforms", body)
            self.assertEqual(status, 400, body)
            self.assertEqual(answer["error"], "bad_request")
        # No site at all is a well-formed request that sets nothing, as the mod answers it.
        self.assertEqual(self.post("uniforms", {"dryRun": True, "sites": []})[1]["rows"], [])
        # The same contract, product or order entry twice is refused whole.
        product = {"itemName": "ba:itemname_paperbag", "warehouse": DEPOT, "amount": 4200, "expect": 3800}
        for body in ({"contracts": [{"id": "CONTRACTone", "products": [product]},
                                    {"id": "CONTRACTone", "products": []}]},
                     {"contracts": [{"id": "CONTRACTone", "products": [product, product]}]},
                     {"contracts": [], "order": ["CONTRACTone", "CONTRACTone"]}):
            self.assertEqual(self.post("imports", dict(body, dryRun=True))[0], 400, body)
        status, _, raw = call(self.url + "/write/uniforms", "POST",
                              {"Authorization": f"Bearer {TOKEN}"}, b"not json")
        self.assertEqual((status, json.loads(raw)["error"]), (400, "bad_request"))
        status, _, raw = call(self.url + "/write/uniforms", "POST",
                              {"Authorization": f"Bearer {TOKEN}"}, b"x" * (256 * 1024 + 1))
        self.assertEqual((status, json.loads(raw)), (413, {"error": "too_large"}))
        status, _, _ = call(self.url + "/write/everything", "POST", {"Authorization": f"Bearer {TOKEN}"}, b"{}")
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

    def test_uniforms_expect_names_the_save_and_another_one_is_changed(self):
        site = {"address": GIFTS, "skills": ["ba:skill_customerservice"], "presetId": None}
        # Left out, or naming the loaded save: as before.
        for expect in (None, {}, {"character": "abc"}, {"company": "Mock Co"}, {"character": "abc", "company": "Mock Co"}):
            body = {"dryRun": True, "sites": [site], **({"expect": expect} if expect is not None else {})}
            status, answer = self.post("uniforms", body)
            self.assertEqual((status, answer["ok"], answer["rows"][0]["set"]), (200, True, ["ba:skill_customerservice"]), expect)
        # Another save of the same character, or another character: every row changed.
        for expect in ({"character": "abc", "company": "Other Co"}, {"character": "xyz"}):
            status, answer = self.post("uniforms", {"dryRun": True, "expect": expect, "sites": [
                site, {"address": {"street": "ba:street_nowhere", "number": 1}, "skills": None}]})
            self.assertEqual((status, answer["ok"]), (200, False), expect)
            self.assertEqual([r["error"] for r in answer["rows"]], ["changed", "changed"], expect)
            self.assertEqual([r["set"] for r in answer["rows"]], [[], []])
            status, answer = self.post("uniforms", {"expect": expect, "sites": [site]})
            self.assertEqual((status, answer["error"]), (409, "changed"), expect)
        self.assertEqual(self.link.applied, [], "nothing written for another save")
        for expect in ("abc", {"character": 3}, {"company": ["Mock Co"]}):
            status, answer = self.post("uniforms", {"dryRun": True, "expect": expect, "sites": [site]})
            self.assertEqual((status, answer["error"]), (400, "bad_request"), expect)
        status, _ = self.post("uniforms", {"expect": {"character": "abc", "company": "Mock Co"}, "sites": [site]})
        self.assertEqual(status, 200)

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
        self.assertEqual(self.link.order, ["CONTRACTtwo", "CONTRACTone", "CONTRACTthree"])
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

    def test_refused_undos_answer_as_the_mods_do(self):
        self.link.refuse_write = "refused"
        # Uniforms: the mod's undo is only ever refused as changed.
        status, answer = self.post("undo", {"kind": "uniforms"})
        self.assertEqual((status, answer["error"], answer["rows"]), (409, "changed", [{"error": "changed"}]))
        # Schedule: the site's own refusal, leading the rows.
        self.link.refuse_write = "refused:screen_open"
        status, answer = self.post("undo", {"kind": "schedule"})
        self.assertEqual((status, answer["error"], answer["siteError"], answer["rows"]),
                         (409, "refused", "screen_open", [{"error": "screen_open"}]))
        # Imports: a locked row names when the window reopens; changed rows carry changed.
        self.link.refuse_write = "refused:locked"
        self.link.day, self.link.hour = 35, 21  # Sunday 21:00: the mod reopens Monday, day 36
        status, answer = self.post("undo", {"kind": "imports"})
        self.assertEqual((status, answer["rows"][0]["error"]), (409, "locked"))
        self.assertEqual(answer["rows"][0]["reopens"], {"day": 36, "hour": 8})
        self.link.refuse_write = "changed"
        status, answer = self.post("undo", {"kind": "imports"})
        self.assertEqual((status, answer["error"], answer["rows"][0]["error"]), (409, "changed", "changed"))
        self.assertEqual(self.link.applied, [])

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

    def test_an_empty_uniform_is_no_uniform_and_undo_needs_the_preset_still_set(self):
        reg = self.link._save().items(self.link._save().root["BuildingRegistrations"])[0]
        self.link._save().items(reg["uniformsBySkill"])[0]["$v"] = ""  # cleaning, set to nothing
        _, answer = self.post("uniforms", {"dryRun": True, "sites": [{"address": GIFTS, "skills": None}]})
        self.assertEqual(answer["rows"][0]["set"], ["ba:skill_cleaning", "ba:skill_customerservice"])
        self.assertEqual(self.post("uniforms", {"sites": [{"address": GIFTS, "skills": None}]})[0], 200)
        self.link.uniforms[("ba:street_secondavenue", 10)]["ba:skill_cleaning"] = "PRESETotherAAAAAAAAAAAA=="
        self.assertEqual(self.post("undo", {"kind": "uniforms"}), (409, {"error": "changed"}))

    def test_schedule_refuses_what_is_no_workstation_and_who_lacks_its_skill(self):
        fixture_print = shift_print([(0, 0, 12, ANA, CLEAN, 0), (1, 8, 20, ANA, REGISTER, 1)])
        locker = "LOCKERllllllllllllllll==ue"
        _, answer = self.post("schedule", {"dryRun": True, "address": GIFTS, "expect": fixture_print, "days": [
            {"d": 3, "shifts": [{"f": 8, "t": 20, "employeeId": ANA, "itemInstanceId": locker},
                                {"f": 8, "t": 20, "employeeId": BEN, "itemInstanceId": CLEAN}]}]})
        self.assertEqual([r["error"] for r in answer["rows"]], ["no_station", "no_skill"])

    def test_schedule_checks_not_found_then_changed_then_the_site(self):
        nowhere = {"street": "ba:street_nowhere", "number": 1}
        for expect in ("9f86d081", "811c9dc5"):  # nothing to compare without the building
            _, answer = self.post("schedule", {"dryRun": True, "address": nowhere, "expect": expect, "days": []})
            self.assertEqual(answer["siteError"], "not_found")
        reg = self.link._save().items(self.link._save().root["BuildingRegistrations"])[2]
        reg["RentedByPlayer"] = False  # the Bare shop, no shifts: print 811c9dc5
        _, answer = self.post("schedule", {"dryRun": True, "address": BARE, "expect": "9f86d081", "days": []})
        self.assertEqual(answer["siteError"], "changed")
        _, answer = self.post("schedule", {"dryRun": True, "address": BARE, "expect": "811c9dc5", "days": []})
        self.assertEqual(answer["siteError"], "not_rented")

    def test_overworked_counts_the_days_the_shop_is_open(self):
        fixture_print = shift_print([(0, 0, 12, ANA, CLEAN, 0), (1, 8, 20, ANA, REGISTER, 1)])
        long_day = [{"f": 0, "t": 12, "employeeId": ANA, "itemInstanceId": CLEAN},
                    {"f": 12, "t": 20, "employeeId": ANA, "itemInstanceId": REGISTER}]
        body = {"dryRun": True, "address": GIFTS, "expect": fixture_print,
                "days": [{"d": 1, "shifts": long_day}, {"d": 3, "shifts": long_day}]}
        reg = self.link._save().items(self.link._save().root["BuildingRegistrations"])[0]
        reg["scheduleDays"]["$items"].append({"day": 3, "isOpen": False, "workShifts": []})
        _, answer = self.post("schedule", body)
        # Gifts opens Sunday and Monday only; Wednesday is closed and not counted.
        self.assertEqual([(w["d"], w["hours"]) for w in answer["warnings"]], [(1, 20)])
        _, answer = self.post("schedule", dict(body, openAllHours=True))
        self.assertEqual([(w["d"], w["hours"]) for w in answer["warnings"]], [(1, 20), (3, 20)])

    def test_open_all_hours_opens_only_the_days_not_open_all_day(self):
        reg = self.link._save().items(self.link._save().root["BuildingRegistrations"])[0]
        days = self.link._save().items(reg["scheduleDays"])
        for day in days:  # both of Gifts' days already open 0 to 24
            day["openingHourSlots"] = {"$items": [{"startingHour": 0, "endingHour": 24}]}
        fixture_print = shift_print([(0, 0, 12, ANA, CLEAN, 0), (1, 8, 20, ANA, REGISTER, 1)])
        body = {"address": GIFTS, "expect": fixture_print, "openAllHours": True,
                "days": [{"d": 1, "shifts": [{"f": 8, "t": 20, "employeeId": BEN, "itemInstanceId": REGISTER}]}]}
        status, answer = self.post("schedule", body)
        self.assertEqual((status, answer["openedHours"]), (200, False))
        status, undone = self.post("undo", {"kind": "schedule"})
        self.assertEqual((status, undone["openedHours"]), (200, False), "nothing opened, nothing restored")
        # One day not open all day: that day alone is the write's, and the undo's.
        # (An apply moves the stamp, and the mock reads the bytes afresh.)
        reg = self.link._save().items(self.link._save().root["BuildingRegistrations"])[0]
        self.link._save().items(reg["scheduleDays"])[0]["openingHourSlots"] = {
            "$items": [{"startingHour": 0, "endingHour": 24}]}  # Sunday
        status, answer = self.post("schedule", body)
        self.assertEqual((status, answer["openedHours"]), (200, True))
        self.assertEqual(self.link.undo["schedule"]["opened"], [1])
        _, undone = self.post("undo", {"kind": "schedule"})
        self.assertTrue(undone["openedHours"])
        self.assertEqual(self.link.opened[("ba:street_secondavenue", 10)], set())

    def test_a_contract_the_write_leaves_alone_is_not_refused_for_it(self):
        # CONTRACTtwo has no agent; named with its own amount it is not touched.
        same = {"itemName": "ba:itemname_paperbag", "warehouse": DEPOT, "amount": 0, "expect": 0}
        _, answer = self.post("imports", {"dryRun": True, "contracts": [{"id": "CONTRACTtwo", "products": [same]}]})
        self.assertIsNone(answer["rows"][0]["error"])
        _, answer = self.post("imports", {"dryRun": True, "contracts": [
            {"id": "CONTRACTtwo", "products": [dict(same, amount=10)]}]})
        self.assertEqual(answer["rows"][0]["error"], "no_agent")
        # An unchanged amount over the cap is not over_cap; a changed one is.
        self.link.terms["CONTRACTone"] = {"cap": 100}
        contracts = {c["id"]: c for c in self.link._save().items(self.link._save().root["importPartnerships"])}
        contracts["CONTRACTone"]["isTarget"] = False
        paper = {"itemName": "ba:itemname_paperbag", "warehouse": DEPOT, "amount": 3800, "expect": 3800}
        _, answer = self.post("imports", {"dryRun": True, "contracts": [{"id": "CONTRACTone", "products": [paper]}]})
        self.assertIsNone(answer["rows"][0]["error"])
        _, answer = self.post("imports", {"dryRun": True, "contracts": [
            {"id": "CONTRACTone", "products": [dict(paper, amount=3900)]}]})
        self.assertEqual(answer["rows"][0]["error"], "over_cap")
        # no_amounts reads the amounts asked for, even one refused over the cap.
        _, answer = self.post("imports", {"dryRun": True, "contracts": [
            {"id": "CONTRACTone", "products": [dict(paper, amount=0)]}]})
        self.assertEqual(answer["rows"][0]["error"], "no_amounts")


    def test_import_terms_cap_a_plain_amount_and_price_the_next_delivery(self):
        status, _, _ = call(self.url + "/debug/config", "POST", {"Content-Type": "application/json"},
                            json.dumps({"importTerms": {"CONTRACTthree": {"unitPrice": 2.5, "cap": 400}},
                                        "day": 35, "hour": 9}).encode())
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(call(self.url + "/health")[2])["day"], 35)
        candle = {"itemName": "ba:itemname_candle", "warehouse": DEPOT, "amount": 600, "expect": 500}
        _, answer = self.post("imports", {"dryRun": True, "contracts": [
            {"id": "CONTRACTthree", "activate": True, "products": [candle]}]})
        row = answer["rows"][0]
        self.assertEqual((row["error"], row["products"][0]["max"], row["products"][0]["cap"]), ("over_cap", 400, 400))
        _, answer = self.post("imports", {"dryRun": True, "contracts": [
            {"id": "CONTRACTthree", "activate": True, "products": [dict(candle, amount=400)]}]})
        row = answer["rows"][0]
        self.assertTrue(answer["ok"], answer)
        self.assertEqual((row["reactivated"], row["nextDeliveryTotal"], row["products"][0]["unitPrice"]),
                         (True, 1000.0, 2.5))
        # A Smart Delivery amount is a stock level: never over the cap.
        self.link.terms["CONTRACTone"] = {"cap": 100}
        _, answer = self.post("imports", {"dryRun": True, "contracts": [{"id": "CONTRACTone", "products": [
            {"itemName": "ba:itemname_paperbag", "warehouse": DEPOT, "amount": 4200, "expect": 3800}]}]})
        self.assertTrue(answer["ok"])
        self.link.configure({"reset": True})
        self.assertEqual((self.link.day, self.link.terms), (34, {}))

    def test_order_alone_answers_a_row_per_contract_and_needs_no_agent(self):
        status, answer = self.post("imports", {"dryRun": True, "contracts": [],
                                               "order": ["CONTRACTtwo", "CONTRACTone"]})
        self.assertEqual(status, 200)
        self.assertTrue(answer["ok"], answer)  # CONTRACTtwo has no agent, and may still move
        two, one = answer["rows"]
        self.assertEqual((two["id"], two["importer"], two["active"], two["repeating"], two["nextDeliveryDay"]),
                         ("CONTRACTtwo", "2 ba:street_pier", False, False, 29))
        self.assertEqual((one["active"], one["nextDeliveryDay"], one["products"], one["reactivated"]),
                         (True, 36, [], False))
        self.assertEqual([r["reordered"] for r in answer["rows"]], [True, True])
        # The same relative sequence moves nothing.
        _, answer = self.post("imports", {"dryRun": True, "contracts": [], "order": ["CONTRACTone", "CONTRACTtwo"]})
        self.assertEqual([r["reordered"] for r in answer["rows"]], [False, False])

    def test_the_lock_window_allows_the_whole_cap(self):
        contracts = {c["id"]: c for c in self.link._save().items(self.link._save().root["importPartnerships"])}
        self.link._save().items(contracts["CONTRACTthree"]["products"])[0]["amountOrderedThisWeek"] = 300
        self.link.terms["CONTRACTthree"] = {"cap": 400}
        candle = {"itemName": "ba:itemname_candle", "warehouse": DEPOT, "amount": 400, "expect": 500}
        body = {"dryRun": True, "contracts": [{"id": "CONTRACTthree", "activate": True, "products": [candle]}]}
        _, answer = self.post("imports", body)
        self.assertEqual((answer["rows"][0]["error"], answer["rows"][0]["products"][0]["max"]), ("over_cap", 100))
        self.link.day, self.link.hour = 35, 21  # Sunday 21:00: the next delivery is after the reset
        _, answer = self.post("imports", body)
        self.assertTrue(answer["ok"], answer)

    def test_a_running_contract_set_to_nothing_is_no_amounts_and_changed_comes_first(self):
        zero = {"itemName": "ba:itemname_paperbag", "warehouse": DEPOT, "amount": 0, "expect": 3800}
        _, answer = self.post("imports", {"dryRun": True, "contracts": [{"id": "CONTRACTone", "products": [zero]}]})
        self.assertEqual(answer["rows"][0]["error"], "no_amounts")
        # A stale expect on an agent-less contract is changed, not no_agent.
        stale = {"itemName": "ba:itemname_paperbag", "warehouse": DEPOT, "amount": 10, "expect": 99}
        _, answer = self.post("imports", {"dryRun": True, "contracts": [{"id": "CONTRACTtwo", "products": [stale]}]})
        self.assertEqual(answer["rows"][0]["error"], "changed")

    def test_a_bad_amount_touches_nothing_and_a_refused_dry_run_opens_nothing(self):
        bad = {"itemName": "ba:itemname_paperbag", "warehouse": DEPOT, "amount": -1, "expect": 0}
        # CONTRACTtwo has no agent, but a refused amount does not touch it.
        _, answer = self.post("imports", {"dryRun": True, "contracts": [{"id": "CONTRACTtwo", "products": [bad]}]})
        self.assertEqual(answer["rows"][0]["error"], "bad_amount")
        fixture_print = shift_print([(0, 0, 12, ANA, CLEAN, 0), (1, 8, 20, ANA, REGISTER, 1)])
        _, answer = self.post("schedule", {"dryRun": True, "address": GIFTS, "expect": fixture_print, "openAllHours": True,
                                           "days": [{"d": 1, "shifts": [{"f": 8, "t": 20, "employeeId": "nobody",
                                                                        "itemInstanceId": REGISTER}]}]})
        self.assertEqual((answer["ok"], answer["openedHours"]), (False, False))

    def test_a_warehouse_held_by_reference_is_found(self):
        # A real save writes a product's warehouse as a reference to an Address
        # stored elsewhere; the fixture's CONTRACTone does the same.
        contract = self.link._save().items(self.link._save().root["importPartnerships"])[0]
        product = self.link._save().items(contract["products"])[0]
        self.assertEqual(set(product["assignedWarehouse"]), {"$ref"})
        paper = {"itemName": "ba:itemname_paperbag", "warehouse": DEPOT, "amount": 4200, "expect": 3800}
        _, answer = self.post("imports", {"dryRun": True, "contracts": [{"id": "CONTRACTone", "products": [paper]}]})
        line = answer["rows"][0]["products"][0]
        self.assertEqual((line["error"], line["before"], answer["ok"]), (None, 3800, True))


IDA, OSKAR, VERA = "IIIIcandidateIIIIIIIIIII", "OOOOcandidateOOOOOOOOOOO", "VVVVcandidateVVVVVVVVVVV"
CY = "CCCCemployeeCCCCCCCCCCCC"
CORNER_REGISTER = "REGISTERaaaaaaaaaaaaaa==ay"
GIFTS_PRINT = shift_print([(0, 0, 12, ANA, CLEAN, 0), (1, 8, 20, ANA, REGISTER, 1)])
CORNER_PRINT = shift_print([(2, 8, 20, CY, CORNER_REGISTER, 1)])


def shift(who, post, f=8, t=20):
    return {"f": f, "t": t, "employeeId": who, "itemInstanceId": post}


class MockHire(LinkedMock):
    """POST /write/hire: candidates hired, staff moved, weeks written, in one call."""

    def body(self, **over):
        """Ida and Oskar hired into Gifts with a week each, Ben moved from Gifts
        (where he has no hours) to Corner, and both weeks written."""
        body = {"dryRun": True,
                "sites": [{"address": GIFTS, "expect": GIFTS_PRINT, "openAllHours": False,
                           "days": [{"d": 1, "shifts": [shift(ANA, REGISTER)]},
                                    {"d": 3, "shifts": [shift(IDA, REGISTER)]},
                                    {"d": 4, "shifts": [shift(OSKAR, REGISTER)]}]},
                          {"address": CORNER, "expect": CORNER_PRINT, "openAllHours": False,
                           "days": [{"d": 2, "shifts": [shift(CY, CORNER_REGISTER)]},
                                    {"d": 3, "shifts": [shift(BEN, CORNER_REGISTER)]}]}],
                "hires": [{"candidateId": IDA, "address": GIFTS, "expect": {"wage": 26.5}, "seenHoursLeft": 71},
                          {"candidateId": OSKAR, "address": GIFTS, "expect": {"wage": 22.0}, "seenHoursLeft": 5}],
                "moves": [{"employeeId": BEN, "from": GIFTS, "to": CORNER}]}
        body.update(over)
        return body

    def test_health_lists_hire(self):
        self.assertIn("hire", json.loads(call(self.url + "/health")[2])["writes"])

    def test_a_dry_run_answers_who_is_hired_and_moved_and_each_week(self):
        before = self.stamp()
        status, answer = self.post("hire", self.body())
        self.assertEqual(status, 200)
        self.assertEqual((answer["ok"], answer["kind"], answer["dryRun"], answer["rows"]), (True, "hire", True, []))
        # Oskar is an older save's candidate: name and skills at the top level.
        self.assertEqual(answer["hired"], [
            {"candidateId": IDA, "name": "Ida Nord", "business": "HART. Gifts", "wage": 26.5, "hoursLeft": 71},
            {"candidateId": OSKAR, "name": "Oskar Lind", "business": "HART. Gifts", "wage": 22.0, "hoursLeft": 5}])
        self.assertEqual(answer["moved"], [{"employeeId": BEN, "name": "Ben Ode", "from": "HART. Gifts",
                                            "to": "HART. Corner", "shiftsCleared": 0}])
        self.assertEqual((answer["skipped"], answer["wageAdded"]), ([], 48.5))
        gifts, corner = answer["sites"]
        self.assertEqual((gifts["business"], gifts["before"], gifts["after"]["shifts"], gifts["siteError"]),
                         ("HART. Gifts", {"shifts": 2, "print": GIFTS_PRINT}, 3, None))
        self.assertEqual((gifts["removed"], gifts["added"], gifts["leftWithout"]), (2, 3, []))
        self.assertEqual(corner["after"]["print"],
                         shift_print([(2, 8, 20, CY, CORNER_REGISTER, 1), (3, 8, 20, BEN, CORNER_REGISTER, 1)]))
        self.assertNotIn("blocked", answer)
        self.assertEqual(self.stamp(), before, "a dry run moves nothing")
        self.assertEqual(self.link.applied, [])

    def test_an_apply_hires_moves_and_writes_and_the_next_write_sees_it(self):
        before = self.stamp()
        status, answer = self.post("hire", self.body(dryRun=False))
        self.assertEqual(status, 200, answer)
        self.assertEqual((answer["ok"], answer["stamp"]), (True, before))
        self.assertNotEqual(self.stamp(), before)
        self.assertEqual([w["kind"] for w in json.loads(call(self.url + "/debug/writes")[2])["writes"]], ["hire"])
        # Hired: gone from the candidate list, so hiring Ida again skips her.
        _, again = self.post("hire", self.body(sites=[self.body()["sites"][0] | {"expect": answer["sites"][0]["after"]["print"],
                                                                             "days": []}],
                                                hires=self.body()["hires"][:1], moves=[]))
        self.assertEqual([(s["candidateId"], s["reason"]) for s in again["skipped"]], [(IDA, "gone")])
        # Ben is at Corner now: moving him from Gifts again is changed.
        _, again = self.post("hire", {"dryRun": True, "hires": [], "moves": [{"employeeId": BEN, "from": GIFTS, "to": CORNER}],
                                      "sites": [{"address": CORNER, "expect": None, "days": None}]})
        self.assertEqual(again["rows"], [{"scope": "move", "id": BEN, "error": "changed"}])
        # Ida works at Gifts: the schedule write takes her shift on the new print.
        new_print = answer["sites"][0]["after"]["print"]
        status, answer = self.post("schedule", {"dryRun": True, "address": GIFTS, "expect": new_print,
                                                "days": [{"d": 5, "shifts": [shift(IDA, CLEAN)]}]})
        self.assertTrue(answer["ok"], answer)
        # No undo, ever.
        self.assertEqual(self.post("undo", {"kind": "hire"}), (409, {"error": "no_undo"}))
        self.assertEqual(self.post("undo", {"kind": "hire", "dryRun": True}), (409, {"error": "no_undo"}))

    def test_a_hire_clears_the_schedule_undo_of_a_site_it_wrote(self):
        body = {"address": GIFTS, "expect": GIFTS_PRINT, "days": [{"d": 1, "shifts": [shift(ANA, REGISTER)]}]}
        _, answer = self.post("schedule", body)
        self.assertIn("schedule", self.link.undo)
        hire = self.body(dryRun=False, moves=[], sites=[
            {"address": GIFTS, "expect": answer["after"]["print"], "days": [{"d": 3, "shifts": [shift(IDA, REGISTER)]}]}])
        self.assertEqual(self.post("hire", hire)[0], 200)
        self.assertEqual(self.post("undo", {"kind": "schedule"}), (409, {"error": "nothing_to_undo"}))

    def test_a_gone_candidate_is_skipped_and_their_hours_left_empty(self):
        self.link.configure({"hireGone": [OSKAR]})
        status, answer = self.post("hire", self.body())
        self.assertEqual(status, 200)
        self.assertTrue(answer["ok"], "gone never refuses")
        self.assertEqual(answer["skipped"], [{"candidateId": OSKAR, "name": "Oskar Lind", "reason": "gone", "hoursDropped": 12}])
        self.assertEqual([h["candidateId"] for h in answer["hired"]], [IDA])
        self.assertEqual((answer["wageAdded"], answer["sites"][0]["after"]["shifts"]), (26.5, 2))
        status, answer = self.post("hire", self.body(dryRun=False))
        self.assertEqual((status, [s["candidateId"] for s in answer["skipped"]]), (200, [OSKAR]))
        self.assertEqual(self.link.schedules[("ba:street_secondavenue", 10)],
                         [(1, 8, 20, ANA, REGISTER, 1), (3, 8, 20, IDA, REGISTER, 1)])
        self.link.configure({"reset": True})
        self.assertEqual(self.link.gone, set())

    def test_refusals_name_their_scope(self):
        # Every hire and move rule, and a shift naming someone the call does not bring.
        body = self.body(
            hires=[{"candidateId": IDA, "address": GIFTS, "expect": {"wage": 25.0}},
                   {"candidateId": VERA, "address": DEPOT, "expect": {"wage": 30.0}}],
            moves=[{"employeeId": "nobody", "from": None, "to": CORNER},
                   {"employeeId": CY, "from": GIFTS, "to": CORNER}])
        body["sites"].append({"address": DEPOT, "expect": None, "days": None})
        status, answer = self.post("hire", body)
        self.assertEqual(status, 200)
        self.assertFalse(answer["ok"])
        self.assertEqual(answer["rows"], [
            {"scope": "move", "id": "nobody", "error": "not_found"},
            {"scope": "move", "id": CY, "error": "changed"},
            {"scope": "hire", "id": IDA, "error": "changed"},
            {"scope": "hire", "id": VERA, "error": "no_skill"},
            {"scope": "shift", "address": GIFTS, "d": 3, "i": 0, "error": "not_assigned"},
            {"scope": "shift", "address": GIFTS, "d": 4, "i": 0, "error": "not_assigned"},
            {"scope": "shift", "address": CORNER, "d": 3, "i": 0, "error": "not_assigned"}])
        status, answer = self.post("hire", dict(body, dryRun=False))
        self.assertEqual((status, answer["error"]), (409, "changed"), "a changed row makes the refusal changed")
        status, answer = self.post("hire", self.body(dryRun=False, hires=[
            {"candidateId": VERA, "address": DEPOT, "expect": {"wage": 30.0}}], moves=[], sites=[
            {"address": DEPOT, "expect": None, "days": None}]))
        self.assertEqual((status, answer), (409, {"error": "refused", "rows": [
            {"scope": "hire", "id": VERA, "error": "no_skill"}]}))
        self.assertEqual(self.link.applied, [])

    def test_a_move_the_game_refuses_and_a_bench_move(self):
        ben = self.link._save().items(self.link._save().root["EmployeeInstances"])[1]
        ben["trainingSession"] = {"skill": "ba:skill_customerservice", "startDay": 30}
        _, answer = self.post("hire", self.body(hires=[], sites=[{"address": CORNER, "expect": None, "days": None}]))
        self.assertEqual(answer["rows"], [{"scope": "move", "id": BEN, "error": "in_training"}])
        del ben["trainingSession"]
        ben["assignedAddress"] = None  # on the bench
        _, answer = self.post("hire", self.body(hires=[], sites=[{"address": CORNER, "expect": None, "days": None}],
                                                moves=[{"employeeId": BEN, "from": None, "to": CORNER}]))
        self.assertTrue(answer["ok"], answer)
        self.assertEqual(answer["moved"][0]["from"], None)

    def test_the_sites_own_refusals(self):
        nowhere = {"street": "ba:street_nowhere", "number": 1}
        hire = [{"candidateId": IDA, "address": nowhere, "expect": {"wage": 26.5}}]
        _, answer = self.post("hire", {"dryRun": True, "hires": hire, "moves": [],
                                       "sites": [{"address": nowhere, "expect": None, "days": None}]})
        self.assertEqual(answer["rows"], [{"scope": "site", "address": nowhere, "error": "not_found"}])
        self.assertEqual(answer["sites"][0]["siteError"], "not_found")
        # A stale print, and a week at a headquarters.
        _, answer = self.post("hire", self.body(sites=[dict(self.body()["sites"][0], expect="811c9dc5"),
                                                       self.body()["sites"][1]]))
        self.assertEqual(answer["rows"][0], {"scope": "site", "address": GIFTS, "error": "changed"})
        regs = self.link._save().items(self.link._save().root["BuildingRegistrations"])
        regs[0]["businessTypeName"] = HQ = "ba:businesstype_headquarters"
        _, answer = self.post("hire", self.body(hires=self.body()["hires"][:1]))
        self.assertEqual(answer["rows"][0], {"scope": "site", "address": GIFTS, "error": "headquarters"})
        # Assign only at a headquarters is fine (Ida cleans, which a headquarters
        # takes); an empty building is no business.
        _, answer = self.post("hire", self.body(moves=[], hires=self.body()["hires"][:1],
                                                sites=[{"address": GIFTS, "expect": None, "days": None}]))
        self.assertTrue(answer["ok"], answer)
        self.assertEqual(regs[0]["businessTypeName"], HQ)
        regs[0]["businessTypeName"] = "ba:businesstype_empty"
        _, answer = self.post("hire", self.body(moves=[], sites=[{"address": GIFTS, "expect": None, "days": None}]))
        self.assertEqual(answer["rows"], [{"scope": "site", "address": GIFTS, "error": "no_business"}])

    def vera_to_depot(self, dry):
        return self.post("hire", {"dryRun": dry, "moves": [],
                                  "hires": [{"candidateId": VERA, "address": DEPOT, "expect": {"wage": 30.0}}],
                                  "sites": [{"address": DEPOT, "expect": None, "days": None}]})

    def test_a_warehouse_takes_drivers_only(self):
        # The business type's skills (ASSIGN_SKILLS), not the stations: the depot has none.
        self.assertEqual(self.vera_to_depot(False), (409, {"error": "refused", "rows": [
            {"scope": "hire", "id": VERA, "error": "no_skill"}]}))
        vera = self.link._candidates(self.link._save())[VERA]
        vera["characterData"]["skills"]["$items"][0]["name"] = "ba:skill_deliverydriver"
        status, answer = self.vera_to_depot(False)
        self.assertEqual(status, 200, answer)
        self.assertEqual(answer["sites"], [{"address": DEPOT, "business": "HART. Depot", "before": None, "after": None,
                                            "removed": 0, "added": 0, "openedHours": False, "leftWithout": [],
                                            "warnings": [], "siteError": None}])
        self.assertEqual(self.link.moved[VERA], ("ba:street_pier", 9))

    def test_a_schedule_screen_open_on_a_site_refuses_it(self):
        self.link.configure({"screenOpen": [CORNER]})
        self.assertEqual(self.link.screen_open, {("ba:street_broadway", 2)})
        # A site with a week, in a dry run and an apply.
        _, answer = self.post("hire", self.body())
        self.assertFalse(answer["ok"])
        self.assertEqual(answer["rows"], [{"scope": "site", "address": CORNER, "error": "screen_open"}])
        self.assertEqual(answer["sites"][1]["siteError"], "screen_open")
        self.assertEqual(self.post("hire", self.body(dryRun=False)), (409, {"error": "refused", "rows": [
            {"scope": "site", "address": CORNER, "error": "screen_open"}]}))
        # An assign-only site too.
        assign = self.body(hires=[], sites=[{"address": CORNER, "expect": None, "days": None}])
        _, answer = self.post("hire", assign)
        self.assertEqual(answer["rows"], [{"scope": "site", "address": CORNER, "error": "screen_open"}])
        self.assertEqual(self.post("hire", dict(assign, dryRun=False)), (409, {"error": "refused", "rows": [
            {"scope": "site", "address": CORNER, "error": "screen_open"}]}))
        # The schedule write to the same site, after `changed`; other sites are free.
        status, answer = self.post("schedule", {"dryRun": True, "address": CORNER, "expect": CORNER_PRINT, "days": []})
        self.assertEqual((status, answer["ok"], answer["siteError"]), (200, False, "screen_open"))
        self.assertEqual(self.post("schedule", {"address": CORNER, "expect": CORNER_PRINT, "days": []}),
                         (409, {"error": "refused", "rows": [{"error": "screen_open"}]}))
        self.assertEqual(self.post("schedule", {"address": CORNER, "expect": "811c9dc5", "days": []}),
                         (409, {"error": "changed", "rows": []}))
        self.assertTrue(self.post("schedule", {"dryRun": True, "address": GIFTS, "expect": GIFTS_PRINT,
                                               "days": []})[1]["ok"])
        self.assertEqual(self.link.applied, [])
        self.link.configure({"reset": True})
        self.assertEqual(self.link.screen_open, set())

    def test_a_hire_body_may_be_up_to_2_mib(self):
        headers = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
        # Past the other kinds' 256 KiB: parsed, so a padded but valid body goes through.
        padded = json.dumps(dict(self.body(), pad="x" * (300 * 1024))).encode()
        status, _, raw = call(self.url + "/write/hire", "POST", headers, padded)
        self.assertEqual(status, 200, raw[:200])
        self.assertTrue(json.loads(raw)["ok"])
        status, _, raw = call(self.url + "/write/hire", "POST", headers, b"x" * (2 * 1024 * 1024 + 1))
        self.assertEqual((status, json.loads(raw)), (413, {"error": "too_large"}))
        # Every other kind keeps 256 KiB.
        status, _, raw = call(self.url + "/write/schedule", "POST", headers, b"x" * (256 * 1024 + 1))
        self.assertEqual((status, json.loads(raw)), (413, {"error": "too_large"}))

    def test_a_move_clears_the_persons_shifts_at_the_site_they_leave(self):
        # Ana works both of Gifts' shifts; Gifts is not rewritten, the game's move clears them.
        status, answer = self.post("hire", {"dryRun": False, "hires": [],
                                            "moves": [{"employeeId": ANA, "from": GIFTS, "to": CORNER}],
                                            "sites": [{"address": CORNER, "expect": None, "days": None}]})
        self.assertEqual(status, 200, answer)
        self.assertEqual(answer["moved"][0]["shiftsCleared"], 2)
        _, answer = self.post("schedule", {"dryRun": True, "address": GIFTS, "expect": "811c9dc5", "days": []})
        self.assertTrue(answer["ok"], "Gifts' week is empty now")

    def test_myemployees_open_blocks_the_dry_run_and_refuses_the_apply(self):
        self.link.configure({"myEmployees": True})
        status, answer = self.post("hire", self.body())
        self.assertEqual((status, answer["ok"], answer["blocked"], answer["rows"]), (200, False, "myemployees", []))
        self.assertEqual(self.post("hire", self.body(dryRun=False)),
                         (409, {"error": "cannot_write", "reason": "myemployees"}))
        self.link.configure({"myEmployees": False})
        self.assertEqual(self.post("hire", self.body(dryRun=False))[0], 200)

    def test_bad_hire_bodies(self):
        good = self.body()
        cases = [
            {"dryRun": True, "sites": [], "hires": []},  # moves missing
            dict(good, sites=good["sites"][:1]),  # Corner, a move's target, has no sites[] entry
            dict(good, sites=good["sites"] + [{"address": BARE, "expect": None, "days": None}]),  # nobody goes to Bare
            dict(good, sites=[dict(good["sites"][0], days=None), good["sites"][1]]),  # expect with no days
            dict(good, sites=[dict(good["sites"][0], expect=None), good["sites"][1]]),  # days with no expect
            dict(good, sites=[good["sites"][0], good["sites"][0], good["sites"][1]]),
            dict(good, hires=good["hires"] + good["hires"][:1]),
            dict(good, hires=[dict(good["hires"][0], expect=26.5)]),
            dict(good, moves=[{"employeeId": BEN, "from": CORNER, "to": CORNER}]),
            dict(good, moves=good["moves"] + good["moves"]),
        ]
        for body in cases:
            status, answer = self.post("hire", body)
            self.assertEqual((status, answer["error"]), (400, "bad_request"), body)

    def test_refuse_write_answers_a_hire_as_a_site_refusal(self):
        self.link.refuse_write = "refused"
        self.assertEqual(self.post("hire", self.body(dryRun=False)),
                         (409, {"error": "refused", "rows": [{"scope": "site", "address": GIFTS, "error": "screen_open"}]}))
        self.link.refuse_write = "cannot_write:myemployees"
        self.assertEqual(self.post("hire", self.body(dryRun=False)),
                         (409, {"error": "cannot_write", "reason": "myemployees"}))
        self.assertEqual(self.post("hire", self.body())[0], 200)


if __name__ == "__main__":
    unittest.main()


class MockOfficeSchedule(LinkedMock):
    """An office's week goes through /write/schedule like a shop's: only a
    headquarters is refused (the mod's ScheduleWrite.cs)."""

    OFFICE = {"street": "ba:street_park", "number": 88}
    LAWYER = "LLLLemployeeLLLLLLLLLLLL"

    def setUp(self):
        # The synthetic company with an office in it, written where the mock reads.
        real = es3_fixture.write_link_save

        def write(path):
            with open(path, "wb") as fh:
                fh.write(es3_fixture.encode(self.company()))
        es3_fixture.write_link_save = write
        try:
            super().setUp()
        finally:
            es3_fixture.write_link_save = real

    def company(self):
        company = es3_fixture.link_company()
        company["BuildingRegistrations"].append({
            "StreetName": "ba:street_park", "StreetNumber": 88, "RentedByPlayer": True,
            "BusinessName": "HART. Law", "businessTypeName": "ba:businesstype_lawfirm",
            "itemInstances": [{"$k": "PCpppppppppppppppppp==", "$v": {"itemName": "ba:itemname_computer"}}],
            "scheduleDays": [{"day": d, "isOpen": True, "workShifts": [],
                              "openingHourSlots": [{"startingHour": 8, "endingHour": 22}]} for d in range(1, 8)],
            "orderHistory": [], "retailPrices": []})
        company["EmployeeInstances"].append({
            "id": self.LAWYER, "characterData": {"name": "Lena Voss", "skills": [{"name": "ba:skill_lawyer", "value": 80.0}]},
            "assignedAddress": es3_fixture.address("ba:street_park", 88)})
        return company

    def test_an_office_week_is_accepted_and_never_opens_it(self):
        shifts = [{"f": 8, "t": 18, "employeeId": self.LAWYER, "itemInstanceId": "PCpppppppppppppppppp=="}]
        body = {"dryRun": True, "address": self.OFFICE, "expect": shift_print([]), "openAllHours": False,
                "days": [{"d": 1, "shifts": shifts}, {"d": 2, "shifts": shifts}]}
        status, answer = self.post("schedule", body)
        self.assertEqual(status, 200)
        self.assertTrue(answer["ok"], answer)
        self.assertEqual((answer["added"], answer["openedHours"], answer["siteError"]), (2, False, None))
