"""The local watch server in file mode: Board + BoardHandler over a save on disk.

watch() itself blocks in serve_forever() and lowers the process priority, so
this drives the same pieces it wires together: a Board over a synthetic .hsg,
BoardHandler on port 0, and a poll thread that calls board.refresh() the way
watch()'s does. The page's side is what is checked: /stamp moves when the save
is rewritten, /data.json follows, and POST /name rebuilds with the name kept.
Synthetic only: never a real save.
"""
from __future__ import annotations

import http.client
import http.server
import json
import os
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))

import ba_dashboard  # noqa: E402
import es3_fixture  # noqa: E402

DEADLINE = 120.0  # seconds to wait for the poll thread to see a change; never reached when it works


class WatchServer(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.save = os.path.join(self.tmp.name, "Link Co.hsg")
        # Held by the poll thread while it reads and by write_save() while it
        # rewrites, so a poll never sees a half-written save or the old mtime.
        self.lock = threading.Lock()
        self.write_save(day=34, mtime=1_700_000_000)
        self.out = os.path.join(self.tmp.name, "dashboard.html")
        self.board = ba_dashboard.Board(self.save, self.out)
        self.assertTrue(self.board.refresh(settle=False))

        board = self.board

        class Handler(ba_dashboard.BoardHandler):
            pass

        Handler.board = board
        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.base = f"http://127.0.0.1:{self.server.server_port}"
        self.serving = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.serving.start()

        # watch()'s poll loop, at a test's pace and with a way to stop it.
        self.stop = threading.Event()
        self.failures = []

        def poll():
            while not self.stop.is_set():
                try:
                    with self.lock:
                        board.refresh(settle=False)
                except Exception as exc:  # noqa: BLE001 -- reported by the test
                    self.failures.append(exc)
                self.stop.wait(0.05)

        self.poller = threading.Thread(target=poll, daemon=True)
        self.poller.start()

    def tearDown(self):
        self.stop.set()
        self.poller.join()
        self.server.shutdown()
        self.server.server_close()
        self.serving.join()
        self.tmp.cleanup()

    def write_save(self, day: int, mtime: int) -> None:
        root = es3_fixture.link_company()
        root["Day"] = day
        data = es3_fixture.encode(root)
        with self.lock:
            with open(self.save, "wb") as fh:
                fh.write(data)
            os.utime(self.save, (mtime, mtime))

    def get(self, route: str):
        with urllib.request.urlopen(self.base + route) as response:
            self.assertEqual(response.status, 200)
            self.assertEqual(response.headers["Cache-Control"], "no-store")
            return response.headers["Content-Type"], response.read()

    def stamp(self) -> str:
        ctype, body = self.get("/stamp")
        self.assertEqual(ctype, "application/json")
        payload = json.loads(body)
        self.assertNotIn("error", payload)
        return payload["stamp"]

    def day(self) -> int:
        ctype, body = self.get("/data.json")
        self.assertEqual(ctype, "application/json")
        return json.loads(body)["meta"]["day"]

    def wait_for_stamp_other_than(self, old: str) -> str:
        end = time.monotonic() + DEADLINE
        while time.monotonic() < end:
            self.assertEqual(self.failures, [])
            now = self.stamp()
            if now != old:
                return now
            self.stop.wait(0.05)
        self.fail(f"the stamp stayed {old!r} after the save changed")

    def test_the_stamp_moves_when_the_save_is_rewritten(self):
        first = self.stamp()
        self.assertEqual(first, "Link Co.hsg@1700000000#0")
        self.assertEqual(self.day(), 34)
        ctype, page = self.get("/")
        self.assertTrue(ctype.startswith("text/html"))
        self.assertIn(b"<html", page[:500].lower())
        self.assertTrue(os.path.exists(self.out), "the static board was not written")

        # A newer save: other bytes and a later modification time.
        self.write_save(day=35, mtime=1_700_000_100)
        second = self.wait_for_stamp_other_than(first)
        self.assertEqual(second, "Link Co.hsg@1700000100#0")
        self.assertEqual(self.day(), 35)
        self.assertEqual(self.failures, [])

    def test_naming_a_line_rebuilds_and_keeps_the_name(self):
        first = self.stamp()
        body = json.dumps({"rid": "RIDaaaa", "slug": "ba:itemname_beer"}).encode("utf-8")
        request = urllib.request.Request(self.base + "/name", data=body, method="POST",
                                         headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(request) as response:
            self.assertEqual(response.status, 204)
        # name_line() rebuilds before the 204, so the revision has moved already.
        self.assertEqual(self.stamp(), first[: first.rindex("#")] + "#1")
        with open(os.path.join(self.tmp.name, "market_history.json"), encoding="utf-8") as fh:
            book = json.load(fh)["characters"]
        # The link company has no characterId, so its names file under "default".
        self.assertEqual(book["default"]["lineNames"], {"RIDaaaa": "ba:itemname_beer"})

    def refused(self, request) -> int:
        with self.assertRaises(urllib.error.HTTPError) as caught:
            urllib.request.urlopen(request)
        caught.exception.close()
        return caught.exception.code

    def name_request(self, body: bytes, **headers):
        return urllib.request.Request(self.base + "/name", data=body, method="POST",
                                      headers={"Content-Type": "application/json", **headers})

    def test_a_bad_name_request_is_refused(self):
        self.assertEqual(self.refused(self.name_request(b"not json")), 400)
        self.assertEqual(self.refused(self.name_request(b'{"slug": "x"}')), 400, "no rid")

    def test_a_name_must_come_as_json(self):
        """EX-4 in #110: a form or text/plain POST, which any page can send
        without a preflight, is refused before it is read."""
        body = json.dumps({"rid": "RIDaaaa", "slug": None}).encode("utf-8")
        for ctype in ("text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x"):
            self.assertEqual(self.refused(self.name_request(body, **{"Content-Type": ctype})), 415, ctype)
        # No Content-Type at all (urllib would add a form's).
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port)
        try:
            conn.request("POST", "/name", body=body)
            response = conn.getresponse()
            response.read()
            self.assertEqual(response.status, 415)
        finally:
            conn.close()
        first = self.stamp()
        self.assertEqual(first[first.rindex("#"):], "#0", "nothing was named")
        request = self.name_request(body, **{"Content-Type": "application/json; charset=utf-8"})
        with urllib.request.urlopen(request) as response:
            self.assertEqual(response.status, 204, "JSON with a charset is still JSON")

    def test_a_name_body_past_the_cap_is_refused_unread(self):
        big = b"{" + b" " * ba_dashboard.BoardHandler.NAME_MAX_BYTES + b"}"
        self.assertEqual(self.refused(self.name_request(big)), 413)
        first = self.stamp()
        self.assertEqual(first[first.rindex("#"):], "#0")

    def test_only_a_loopback_host_is_served(self):
        """EX-4 in #110: a page on a name rebound to 127.0.0.1 sends its own Host."""
        port = self.server.server_port
        for route in ("/", "/data.json", "/stamp", "/wiki-data.json"):
            for host in ("attacker.example", f"attacker.example:{port}", f"127.0.0.1:{port + 1}", ""):
                request = urllib.request.Request(self.base + route, headers={"Host": host})
                self.assertEqual(self.refused(request), 403, (route, host))
        body = json.dumps({"rid": "RIDaaaa", "slug": "ba:itemname_beer"}).encode("utf-8")
        self.assertEqual(self.refused(self.name_request(body, Host=f"attacker.example:{port}")), 403)
        # Both loopback names this server answers to, in any case.
        for host in (f"127.0.0.1:{port}", f"localhost:{port}", f"LocalHost:{port}"):
            request = urllib.request.Request(self.base + "/stamp", headers={"Host": host})
            with urllib.request.urlopen(request) as response:
                self.assertEqual(response.status, 200, host)
                json.loads(response.read())


if __name__ == "__main__":
    unittest.main()
