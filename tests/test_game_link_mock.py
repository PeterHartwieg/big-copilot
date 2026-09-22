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
import game_link_mock  # noqa: E402


def call(url, method="GET", headers=None):
    req = urllib.request.Request(url, method=method, headers=headers or {})
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
                    "hour", "minute", "cash", "stamp", "busy", "size", "refreshedAt"):
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
        self.assertEqual(json.loads(body)["endpoints"], ["/health", "/save", "/refresh"])
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


if __name__ == "__main__":
    unittest.main()
