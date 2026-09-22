"""A stand-in for the Big Copilot Link mod, serving a save file from disk.

    python tools/game_link_mock.py "<path to a .hsg>" [--port 8322]

Speaks the contract in docs/game-link-api.md (schema 1) so the web app and the
local watcher can be developed and tested without the game or Unity. POST
/refresh and a change of the file's modification time both re-read the file
and issue a new stamp, so pointing it at the game's own autosave folder gives a
live-looking link.

Error paths on demand: --throttle answers every /refresh with 429, --refuse
<reason> with 409, --schema <n> advertises another schema version. Nothing in
here reads the save: the day, hour and cash in /health are whatever the flags
say, because a mock that parsed the save would be a second reader to keep in
step with the first.
"""
from __future__ import annotations

import argparse
import http.server
import json
import os
import re
import threading
import time
from datetime import datetime, timezone

SCHEMA_VERSION = 1
DEFAULT_PORT = 8322
REFRESH_WINDOW = 15  # seconds between refreshes, as the mod throttles
ALLOWED_ORIGINS = ("https://bigcopilot.com", "https://www.bigcopilot.com")
LOCAL_ORIGIN = re.compile(r"^http://(127\.0\.0\.1|localhost)(:\d+)?$")
EXPOSED = "ETag, X-Game-Link-Stamp, X-Game-Link-Day, X-Game-Link-Character"


def allowed_origin(origin: str | None) -> bool:
    return bool(origin) and (origin in ALLOWED_ORIGINS or bool(LOCAL_ORIGIN.match(origin)))


class Link:
    """The served state: the bytes of the last refresh and its stamp."""

    def __init__(self, path: str, *, character: str, company: str, day: int, hour: int,
                 cash: float, build: int, schema: int, throttle: bool, refuse: str | None):
        self.path = path
        self.character, self.company = character, company
        self.day, self.hour, self.cash, self.build = day, hour, cash, build
        self.schema, self.throttle, self.refuse = schema, throttle, refuse
        self.lock = threading.Lock()
        self.data = b""
        self.stamp = ""
        self.refreshed_at = None
        self.last_refresh = 0.0
        self.busy = False
        self._mtime = None
        self._last_seconds = 0
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

    def health(self) -> dict:
        with self.lock:
            return {
                "ok": True, "schemaVersion": self.schema, "modVersion": "mock",
                "source": "mock", "build": self.build, "character": self.character,
                "company": self.company, "day": self.day, "hour": self.hour, "minute": 0,
                "cash": self.cash, "stamp": self.stamp, "busy": self.busy,
                "size": len(self.data), "refreshedAt": self.refreshed_at,
            }


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
            self.send_header("Access-Control-Allow-Headers", "Content-Type, If-None-Match")
            self.send_header("Access-Control-Max-Age", "600")
            if self.headers.get("Access-Control-Request-Private-Network", "").lower() == "true":
                self.send_header("Access-Control-Allow-Private-Network", "true")
        self.end_headers()

    def do_GET(self):
        route = self._route()
        if route in ("/", "/health"):
            self._json(200, self.link.health())
        elif route == "/save":
            self._save()
        elif route == "/refresh":
            self._json(405, {"error": "method_not_allowed"})
        else:
            self._not_found()

    def do_PUT(self):
        self._other_method()

    def do_DELETE(self):
        self._other_method()

    def do_PATCH(self):
        self._other_method()

    def _other_method(self):
        if self._route() in ("/", "/health", "/save", "/refresh"):
            self._json(405, {"error": "method_not_allowed"})
        else:
            self._not_found()

    def do_POST(self):
        if self._route() != "/refresh":
            self._not_found() if self._route() not in ("/health", "/save") else self._json(405, {"error": "method_not_allowed"})
            return
        status, body = self.link.refresh()
        self._json(status, body)

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
        self._json(404, {"error": "not_found", "endpoints": ["/health", "/save", "/refresh"]})

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
    args = ap.parse_args()
    if not os.path.isfile(args.save):
        raise SystemExit(f"{args.save} is not a file")
    link = Link(args.save, character=args.character, company=args.company, day=args.day, hour=args.hour,
                cash=args.cash, build=args.build, schema=args.schema, throttle=args.throttle, refuse=args.refuse)
    server = MockServer(link, args.port).start()
    print(f"Serving {args.save} as the game link at {server.url}/  (Ctrl+C to stop)", flush=True)
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        server.stop()


if __name__ == "__main__":
    main()
