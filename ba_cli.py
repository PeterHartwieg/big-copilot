"""Build a progress dashboard from a Big Ambitions save game.

    python ba_dashboard.py                          # newest save in the default folder
    python ba_dashboard.py "path\\to\\Costy Co.hsg"  # a specific save
    python ba_dashboard.py --list                   # every save, by character
    python ba_dashboard.py "Costy Co"               # a character or save by name
    python ba_dashboard.py -o board.html            # choose the output file
    python ba_dashboard.py --watch                  # serve it and follow the save
    python ba_dashboard.py --game                   # the running game, through the link mod

The dashboard is a single self-contained HTML file. In watch mode it is also served
from 127.0.0.1 and refreshes itself whenever the game writes a new save. --game
reads the running game itself through the Big Copilot Link mod
(docs/game-link-api.md) instead of a save folder.
"""

from __future__ import annotations

import argparse
import datetime as dt
import http.client
import http.server
import json
import os
import re
import sys
import threading
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
import webbrowser

from ba_dashboard import (
    GAME_NAME_LANGS, NAME_COVERAGE, SAVE_ROOT, VERIFIED_BUILD, WIKI_SERVED, History, compact_wiki, extract,
    game_text, locale_note, name_coverage, name_table, render, safe_extract,
)
from ba_save import Names, bundled_locale, load_locale, load_save

# The command line, the save catalogue, the watch server and the game link: the
# part of the board only a local run uses. `python ba_dashboard.py` runs main()
# here. The Pyodide worker never fetches this file, so the browser neither
# compiles it nor imports the HTTP and argument modules it needs.

# ------------------------------------------------------- cli and watch server
def newest_under(target: str) -> str:
    """The most recently written save at or below `target`."""
    if os.path.isfile(target):
        return target
    folders = [target] + [
        os.path.join(target, n)
        for n in os.listdir(target)
        if os.path.isdir(os.path.join(target, n))
    ]
    saves = [
        os.path.join(f, n)
        for f in folders
        for n in os.listdir(f)
        if n.lower().endswith((".hsg", ".bcsave"))
    ]
    if not saves:
        raise SystemExit(f"no .hsg saves under {target}")
    return max(saves, key=os.path.getmtime)


def read_save_meta(path: str) -> dict:
    """The game's sidecar for a save: `<name>.hsg.meta`, a small JSON file.

    It names the character and the game day without opening the save itself.
    Missing or unreadable (very old saves have a different shape) gives {}.
    """
    try:
        with open(path + ".meta", encoding="utf-8") as fh:
            meta = json.load(fh)
    except (OSError, ValueError):
        return {}
    who = meta.get("characterData") or meta.get("playerCustomizationData") or {}
    return {
        "character": (who.get("name") or "").strip(),
        "day": meta.get("day"),
        "autosave": bool(meta.get("isRecoverSave")),
    }


def catalogue(root: str) -> list[dict]:
    """Every save under `root`, grouped by character folder, newest first.

    Each entry: folder (the character id the game generated), character (its
    name, from the sidecars, else from a "New <name> Save Game" file, else the
    folder), and saves: [{path, name, day, autosave, mtime}] newest first.
    Groups are ordered by their newest save, so the ones being played lead.
    """
    if os.path.isfile(root):
        root = os.path.dirname(root) or "."  # a bare filename has no dirname
    folders = [root] + sorted(
        os.path.join(root, n)
        for n in os.listdir(root)
        if os.path.isdir(os.path.join(root, n))
    )
    groups = []
    for folder in folders:
        saves = []
        for n in os.listdir(folder):
            if not n.lower().endswith((".hsg", ".bcsave")):
                continue
            path = os.path.join(folder, n)
            meta = read_save_meta(path)
            saves.append(
                {
                    "path": path,
                    "name": os.path.splitext(n)[0],
                    "day": meta.get("day"),
                    "autosave": meta.get("autosave", n.lower().startswith("recover")),
                    "character": meta.get("character", ""),
                    "mtime": os.path.getmtime(path),
                }
            )
        if not saves:
            continue
        saves.sort(key=lambda s: -s["mtime"])
        character = next((s["character"] for s in saves if s["character"]), "")
        if not character:
            for s in saves:
                m = re.match(r"New (.+?) Save Game", s["name"])
                if m:
                    character = m.group(1).strip()
                    break
        groups.append(
            {
                "folder": folder,
                "character": character or os.path.basename(folder),
                "saves": saves,
            }
        )
    groups.sort(key=lambda g: -g["saves"][0]["mtime"])
    return groups


def print_catalogue(groups: list[dict]) -> None:
    for g in groups:
        print(f"{g['character']}  ({os.path.basename(g['folder'])})")
        for s in g["saves"]:
            when = dt.datetime.fromtimestamp(s["mtime"]).strftime("%d %b %H:%M")
            day = f"day {s['day']:>4}" if s["day"] is not None else "day    ?"
            kind = "autosave" if s["autosave"] else "saved   "
            print(f"    {when}  {day}  {kind}  {s['name']}")
    print()
    print('Pass a character or save name to open it: python ba_dashboard.py "Costy Co"')


def default_root(lead: str = "") -> str:
    """SAVE_ROOT, or a SystemExit saying there is no folder to look in.

    Only the Windows location is found on its own: elsewhere USERPROFILE is
    unset, so SAVE_ROOT is a bare relative string rather than a place anyone
    could look, and naming it would send the reader after a folder that was
    never there. `lead` is what already went wrong, so the two ways on are
    spelled out once.
    """
    if os.path.isdir(SAVE_ROOT):
        return SAVE_ROOT
    missing = (
        f"no save folder at {SAVE_ROOT}"
        if os.path.isabs(SAVE_ROOT)
        else "no save folder to look in: only the Windows one is found on its own"
    )
    raise SystemExit(
        # ASCII only: a piped log under cp850 would show an em dash as an escape.
        f"{lead}there is {missing}. Pass the save folder or a .hsg file as the "
        "argument (the README has the Windows and macOS paths), or use "
        "bigcopilot.com, which reads saves in the browser."
    )


def resolve_target(arg: str | None) -> str:
    """Turn the positional argument into a file or folder to read.

    A path that exists is taken as is. Anything else is a name: a save
    (`Costy Co`, `Costy Co.hsg`) or a character; an exact match wins, then a
    case-insensitive substring. A save name gives that file; a character name
    gives its folder, so --watch follows the character's autosaves. Several
    matches are listed and the run stops, so a guess never opens the wrong city.
    """
    if not arg:
        return default_root()
    if os.path.exists(arg):
        return arg
    root = default_root(f"{arg} does not exist, and ")  # a name needs the folder
    want = arg.lower().removesuffix(".hsg")
    groups = catalogue(root)
    saves = [(g, s) for g in groups for s in g["saves"]]
    # Four tiers, each tried on its own: a save named exactly so, a character
    # named exactly so, then the same two as substrings. "Costy Co" is both a
    # save and a character here; the save wins, and "Costy" finds the character.
    tiers = [
        [(f"{g['character']} - {s['name']}", s["path"]) for g, s in saves if s["name"].lower() == want],
        [(g["character"], g["folder"]) for g in groups if g["character"].lower() == want],
        [(g["character"], g["folder"]) for g in groups if want in g["character"].lower()],
        [(f"{g['character']} - {s['name']}", s["path"]) for g, s in saves if want in s["name"].lower()],
    ]
    for hits in tiers:
        if len(hits) == 1:
            return hits[0][1]
        if hits:
            print(f"{arg!r} matches more than one save or character:")
            for label, path in hits:
                print(f"  {label:<40} {path}")
            raise SystemExit("be more specific, or pass the path")
    print(f"nothing named {arg!r} under {root}. The saves there:\n")
    print_catalogue(groups)
    raise SystemExit(1)


BELOW_NORMAL_PRIORITY_CLASS = 0x00004000


def backfill_history(target: str, history_path: str, names: Names) -> int:
    """Seed demand history from the other saves of the same character.

    Older saves are real snapshots of the same city, so the trend line starts
    populated instead of waiting a week for its first comparison. Only the folder
    holding the newest save is read: every other folder is a different character,
    and a different city.
    """
    folder = os.path.dirname(newest_under(target)) or "."  # a bare filename has none
    saves = sorted(
        os.path.join(folder, n) for n in os.listdir(folder) if n.lower().endswith((".hsg", ".bcsave"))
    )
    print(f"Seeding demand history from {len(saves)} saves in {os.path.basename(folder)}")
    recorded = 0
    for path in saves:
        try:
            save = load_save(path)
            extract(save, names, history_path)
            print(f"  day {save.root['Day']:>4}  {os.path.basename(path)}", flush=True)
            recorded += 1
        except Exception as exc:
            print(f"  skipped {os.path.basename(path)}: {exc}", flush=True)
    return recorded


def yield_to_the_game() -> bool:
    """Drop below normal priority so the game always gets the core first."""
    try:
        if sys.platform != "win32":
            os.nice(10)
            return True
        import ctypes

        kernel32 = ctypes.windll.kernel32
        kernel32.SetPriorityClass.argtypes = [ctypes.c_void_p, ctypes.c_uint32]
        kernel32.SetPriorityClass.restype = ctypes.c_int
        # -1 is the pseudo-handle for the current process. It has to be passed
        # as a real pointer-width value or the call fails with a bad handle.
        current_process = ctypes.c_void_p(-1)
        return bool(
            kernel32.SetPriorityClass(current_process, BELOW_NORMAL_PRIORITY_CLASS)
        )
    except Exception:  # priority is a nicety, never a reason to fail
        return False


class LinkUnavailable(Exception):
    """The game link did not answer: the game is closed or between cities."""


class LinkMismatch(LinkUnavailable):
    """The mod answered, but speaks a schema version this board does not know.

    An outage like any other to the watch loop (docs/game-link-api.md, the
    clients' loop, step 5): said once under the board it keeps, and over the
    moment a health answer of this version arrives. A one-shot run stops on it.
    """


def loopback_link(url: str) -> str:
    """The mod's address with localhost and [::1] spelt 127.0.0.1.

    The mod listens on http://127.0.0.1:<port>/ only, and its listener turns
    away any other Host, so the other two names for this machine would read as
    a game that is not there. Any other address is left as given.
    """
    try:
        parts = urllib.parse.urlsplit(url)
        port = parts.port
    except ValueError:  # a port that is no number: urllib says so on the call
        return url
    if parts.hostname not in ("localhost", "::1"):
        return url
    host = f"127.0.0.1:{port}" if port else "127.0.0.1"
    return urllib.parse.urlunsplit((parts.scheme, host, parts.path, parts.query, parts.fragment))


class GameLink:
    """The running game's save, served by the Big Copilot Link mod.

    docs/game-link-api.md is the contract; this is the watcher's client of it.
    urllib only, with 5-second timeouts: the link shares the machine with the
    game, so a stalled call must never hold the watch loop. poll() downloads
    a save only when /health shows a stamp this board has not built from, so
    an idle game costs nothing.

    LinkUnavailable is a normal answer, not a crash: the listener lives only
    while a city is loaded, so the watch loop reports it once and carries on.
    """

    SCHEMA = 5  # the schema version this client speaks; see the contract
    TIMEOUT = 5

    def __init__(self, url: str, out_dir: str):
        # --game takes a URL and nothing else; argparse would otherwise hand a
        # save name typed after the flag to urllib, which raises ValueError.
        if not re.match(r"^https?://", url or ""):
            raise SystemExit(
                f"--game takes the mod's address (default http://127.0.0.1:8322), "
                f"not {url!r}; a save or character name does not combine with it"
            )
        self.url = loopback_link(url.rstrip("/"))
        # No proxy, whatever HTTP_PROXY says: urllib would send even
        # 127.0.0.1 through one, which fails, or hands a local intercepting
        # proxy the player's whole save.
        self._opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        self.path = os.path.join(out_dir, "game-link.hsg")
        self.stamp = ""  # the stamp of the bytes last downloaded
        self.character = ""
        self.company = ""
        self.stale = False  # why wait_for_save() returned older bytes than it asked for, or False
        self.not_ready = 0  # /health answers in a row that were no health object (any status)

    def _call(self, route: str, method: str = "GET", headers: dict | None = None):
        try:
            # Request() is what raises ValueError for an address urllib cannot
            # use, so it belongs inside the try with the call.
            req = urllib.request.Request(
                self.url + route, method=method, headers=headers or {}
            )
            with self._opener.open(req, timeout=self.TIMEOUT) as res:
                return res.status, dict(res.headers), res.read()
        except urllib.error.HTTPError as err:
            return err.code, dict(err.headers), err.read()
        except (urllib.error.URLError, OSError, http.client.HTTPException, ValueError) as exc:
            raise LinkUnavailable(
                "the game link did not answer; start the game with the Big Copilot "
                "Link mod enabled and load a save"
            ) from exc

    def poll(self) -> str | None:
        """The path of a freshly downloaded game-link.hsg, else None.

        Keeps the last stamp it built from and sends it as If-None-Match, so
        a game that has moved on costs one /health and nothing more.
        Raises LinkUnavailable while the game is not there, and its
        LinkMismatch while the mod speaks a schema version this board does not
        know: the next poll asks again, so a mod put right is read as ever.
        """
        status, _, body = self._call("/health")
        health = None
        if status == 200 and body:
            try:
                health = json.loads(body)
            except ValueError:
                health = None
        if not isinstance(health, dict) or health.get("schemaVersion") is None:
            # Answered, but not with health: a status other than 200 (the mod is
            # there and not ready), or a 200 that is no health object, or one
            # with no version in it (something else on that port for a moment).
            # The next poll asks again; only a health object with a version says
            # what it speaks. Ten in a row is an outage, said once by the watch
            # loop and raised on every poll until a health answer, so it never
            # looks over between two polls, and one stray answer never stops
            # the watcher for good.
            self.not_ready += 1
            if self.not_ready >= 10:
                raise LinkUnavailable(
                    f"{self.url} answers, but not as the Big Copilot Link mod; "
                    "is another program on that port?"
                )
            return None
        self.not_ready = 0
        version = health.get("schemaVersion")
        if version not in (1, 2, 3, 4, self.SCHEMA):
            raise LinkMismatch(
                f"the Big Copilot Link mod speaks schema version {version}; this "
                f"board needs version {self.SCHEMA}. Update the mod or the board"
            )
        stamp = health.get("stamp") or ""
        if not stamp or stamp == self.stamp or health.get("busy"):
            return None
        headers = {"If-None-Match": f'"{self.stamp}"'} if self.stamp else {}
        status, res_headers, data = self._call("/save", headers=headers)
        if status != 200:  # 503 no_save_yet, or a race the next poll settles
            return None
        facts_enabled = "building-facts.v1" in health.get("features", [])
        if facts_enabled:
            import ba_facts
            actual_stamp = res_headers.get("X-Game-Link-Stamp") or stamp
            actual_character = res_headers.get("X-Game-Link-Character") or health.get("character")
            code, _, body = self._call("/facts?stamp=" + urllib.parse.quote(actual_stamp, safe=""))
            if code == 409:
                return None
            if code != 200:
                raise LinkUnavailable("The game could not provide matching building facts")
            try:
                facts = ba_facts.validate(json.loads(body), data, actual_stamp, actual_character)
                data = ba_facts.pack(data, facts)
            except ValueError as exc:
                raise LinkUnavailable(str(exc)) from exc
        destination = os.path.splitext(self.path)[0] + (".bcsave" if facts_enabled else ".hsg")
        pending = destination + ".tmp"
        with open(pending, "wb") as fh:
            fh.write(data)
        os.replace(pending, destination)
        self.path = destination
        self.stamp = res_headers.get("X-Game-Link-Stamp") or stamp
        self.character = res_headers.get("X-Game-Link-Character") or health.get("character") or ""
        self.company = health.get("company") or ""
        return self.path

    def wait_for_save(self, seconds: float = 45.0) -> str | None:
        """Ask the mod for fresh bytes and poll until they arrive, or time out.

        The one-shot build's way in: a refresh is requested, and poll() is
        tried every second until it hands over a path. An accepted refresh
        (202) is waited for: the bytes must carry a stamp newer than the one
        the mod named, or the build would show the state before the request.
        A refusal or a throttle is not an error here: this link has downloaded
        nothing yet, so poll() takes whatever the mod already serves. Only a
        mod with nothing to serve inside the deadline comes back None. A
        LinkUnavailable from the refresh surfaces.
        """
        self.stale = False
        status, body = self.refresh()
        superseded = body.get("stamp") if status == 202 else None
        deadline = time.monotonic() + seconds
        path = None
        while True:
            try:
                got = self.poll()
            except LinkUnavailable as exc:
                # The game went away mid-wait, or the port stopped answering as
                # the mod. Bytes already downloaded in this call are still a
                # board; only an empty-handed wait surfaces it. The reason is
                # the exception's own, whichever it was.
                if path is None:
                    raise
                self.stale = str(exc)
                return path
            if got is not None:
                path = got
                if superseded is None or self.stamp != superseded:
                    return path
            if time.monotonic() >= deadline:
                # The requested refresh never landed; the bytes that did are
                # still the game's state, only a little older. The caller says so.
                self.stale = "the mod did not finish the refresh in time" if path is not None else False
                return path
            time.sleep(1)

    def refresh(self) -> tuple[int, dict]:
        """Ask the mod to serialize the game now; /refresh's status and body."""
        status, _, body = self._call("/refresh", method="POST")
        try:
            parsed = json.loads(body or b"{}")
        except ValueError:
            parsed = {}
        # Some other local service on that port answers JSON that is no object.
        return status, parsed if isinstance(parsed, dict) else {}


class Board:
    """Holds the current dashboard, and rebuilds it when the save changes."""

    def __init__(self, target: str, out: str, link: GameLink | None = None, lang: str | None = None):
        self.target = target
        self.link = link
        self.out = out
        self.locale_source, locale = game_text()
        self.names = Names(locale)
        self.lang_names = cli_names(lang, self.locale_source, locale)
        self.lang_ui = cli_ui_table(lang)
        self.history = os.path.join(os.path.dirname(out) or ".", "market_history.json")
        self.lock = threading.Lock()
        self.html = b""
        self.data = b"{}"
        self.stamp = b'{"stamp":""}'
        self.source = None
        self.day = None
        self.error = None
        self._stamp = ""
        self._instance = os.urandom(8).hex()
        self._generation = 0
        self._fingerprint = None
        self.character = None
        self.revision = 0  # bumps when the player names a line, so the page refetches
        self.build = threading.Lock()

    def name_line(self, rid: str, slug: str | None) -> None:
        """A recipe the player named by hand; rebuild so the needs follow."""
        with self.build:
            history = History(self.history)
            history.named(self.character or "default", {rid: slug})
            if not history.write():
                print(f"The line name was not kept: {os.path.basename(self.history)} could not be "
                      "read or written. Name the line again once the board has rebuilt.", flush=True)
            with self.lock:
                self.revision += 1
                self._fingerprint = None
            self._refresh(settle=False)

    def refresh(self, settle: bool = True) -> bool:
        """Rebuild if a newer save has appeared. True if anything changed."""
        with self.build:
            return self._refresh(settle)

    def _refresh(self, settle: bool) -> bool:
        if self.link is not None:
            # The link has no folder to scan: the mod says when its bytes have
            # moved, and its stamp is the whole fingerprint. A cleared
            # fingerprint (the player named a line) rebuilds from the bytes
            # this link downloaded, since the mod has nothing newer to say. A
            # fresh board has no fingerprint either, and no stamp: a
            # game-link.hsg left by an earlier session is never its source.
            # The rebuild after a name does not need the game: with the game
            # closed, the downloaded bytes still carry the name to the board.
            try:
                path = self.link.poll()
            except LinkUnavailable:
                if (self._fingerprint is not None or not self.link.stamp
                        or not os.path.exists(self.link.path)):
                    raise
                path = None
            if path is None:
                if (self._fingerprint is not None or not self.link.stamp
                        or not os.path.exists(self.link.path)):
                    return False
                path = self.link.path
            mark = self.link.stamp
            if mark == self._fingerprint:
                return False
        else:
            path = newest_under(self.target)
            mark = (path, os.path.getmtime(path), os.path.getsize(path))
            if mark == self._fingerprint:
                return False
            if settle:
                # The game may still be writing; only read once the file holds still.
                time.sleep(0.75)
                if (os.path.getmtime(path), os.path.getsize(path)) != mark[1:]:
                    return False

        try:
            save = load_save(path)
            save.live_source = self.link is not None
            data = safe_extract(save, self.names, self.history)
            # names= only for --lang: an English board renders as it always has.
            lang = {"names": self.lang_names} if self.lang_names else {}
            if self.lang_ui:
                lang["ui"] = self.lang_ui
            live_page = render(data, live=True, **lang).encode("utf-8")
            static_page = render(data, **lang).encode("utf-8")
        except Exception as exc:
            # Fingerprint it anyway. Without this a save that will not build is
            # re-read every interval -- a 26 MB parse every few seconds, which
            # is precisely the CPU the game is supposed to get. The next save
            # the game writes clears the mark and we try again.
            with self.lock:
                self._fingerprint = mark
                self.error = f"{os.path.basename(path)}: {exc}"
                self._publish_stamp()
            raise

        with self.lock:
            self._fingerprint = mark
            self.source = path
            self.error = None
            self.html = live_page
            self.data = json.dumps(data, separators=(",", ":")).encode("utf-8")
            self.character = data["supply"].get("factories", {}).get("character")
            self.day = data["meta"]["day"]
            self._generation += 1
            self._stamp = f"{self._instance}@{self._generation}#{self.revision}"
            self._publish_stamp()

        with open(self.out, "wb") as fh:
            fh.write(static_page)
        return True

    def _publish_stamp(self) -> None:
        """What the open page polls: the build it has, and why it is stuck.

        Called with the lock already held.
        """
        body = {"stamp": self._stamp}
        if self.error:
            body["error"] = self.error
        self.stamp = json.dumps(body).encode("utf-8")


class BoardHandler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    board: Board = None
    NAME_MAX_BYTES = 16 * 1024  # a {rid, slug} is a few dozen bytes

    def _this_host(self) -> bool:
        """A request addressed to this server by a loopback name, and else
        answered 403. The server listens on 127.0.0.1 only, but a web page on
        a name that resolves here (DNS rebinding) would send its own Host."""
        port = self.server.server_address[1]
        host = (self.headers.get("Host") or "").strip().lower()
        if host in (f"127.0.0.1:{port}", f"localhost:{port}"):
            return True
        self.send_error(403)
        return False

    def do_GET(self):
        if not self._this_host():
            return
        route = self.path.split("?")[0].rstrip("/") or "/"
        # Explicit allowlist: the watch server exposes no arbitrary workspace
        # files. The wiki's catalogue is the public one beside the page, never
        # the extractor's own working copies.
        map_assets = {
            "/maps/locations.json": "application/json",
            "/maps/map-background.svg": "image/svg+xml",
            "/maps/floor-plans.json": "application/json",
        }
        # The wiki's compact copy, made here from the committed catalogue: a
        # checkout run without build_web.py has no web/wiki-data.min.json.
        if route == "/" + WIKI_SERVED:
            try:
                with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "web",
                                       "wiki-data.json"), encoding="utf-8") as fh:
                    body = compact_wiki(fh.read()).encode("utf-8")
            except (OSError, ValueError):
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(body)
            return
        if route in map_assets:
            path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web", route.lstrip("/"))
            try:
                with open(path, "rb") as fh:
                    body = fh.read()
            except OSError:
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header("Content-Type", map_assets[route])
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(body)
            return
        with self.board.lock:
            body, ctype = {
                "/": (self.board.html, "text/html; charset=utf-8"),
                "/index.html": (self.board.html, "text/html; charset=utf-8"),
                "/data.json": (self.board.data, "application/json"),
                "/stamp": (self.board.stamp, "application/json"),
            }.get(route, (None, None))
        if body is None:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        """The page naming a factory line by hand: {rid, slug}, slug null to clear."""
        if not self._this_host():
            return
        route = self.path.split("?")[0].rstrip("/")
        if route != "/name":
            self.send_error(404)
            return
        # JSON only: a page elsewhere can send a form or text/plain POST
        # without asking, but not this one, which needs a CORS preflight this
        # server never answers. The body is never read past its cap.
        if self.headers.get_content_type() != "application/json":
            self.send_error(415)
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            self.send_error(400)
            return
        if length < 0:
            self.send_error(400)
            return
        if length > self.NAME_MAX_BYTES:
            self.send_error(413)
            return
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
            rid, slug = str(body["rid"]), body.get("slug") or None
        except (ValueError, KeyError, TypeError):
            self.send_error(400)
            return
        try:
            self.board.name_line(rid, slug)
        except Exception as exc:  # the board keeps serving the last build
            print(f"  naming a line failed -- {exc}", flush=True)
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def log_message(self, *args):
        pass  # the watcher prints what matters


def watch(
    target: str,
    out: str,
    port: int,
    interval: int,
    open_browser: bool,
    link: GameLink | None = None,
    lang: str | None = None,
) -> None:
    lowered = yield_to_the_game()
    board = Board(target, out, link=link, lang=lang)
    try:
        board.refresh(settle=False)
    except LinkUnavailable as exc:
        # The game is not up yet, or the mod is off. The poll loop below
        # keeps trying; the server has nothing to be sorry for.
        print(f"  {exc}", flush=True)
    except Exception as exc:
        # A save that will not build is no reason to stop watching: the poll
        # loop below tries again when the game writes the next one.
        print(f"  skipped the first build -- {board.error or exc}", flush=True)
        traceback.print_exc()
    if not board.html:
        # Until a board builds, the page is the live shell with no numbers: it
        # polls the stamp and draws the first board that does.
        board.html = render(None, live=True).encode("utf-8")
    BoardHandler.board = board
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), BoardHandler)
    url = f"http://127.0.0.1:{port}/"

    def poll():
        last_failure = None
        link_down = ""  # what was last said about the link being out, while it is
        while True:
            try:
                moved = board.refresh()
            except LinkUnavailable as exc:
                # Once per outage, not once per interval: the game is closed
                # or between cities, or the mod speaks another schema version,
                # and the board on screen is still good. Polling goes on, so a
                # game that comes back, or a mod put right, is read again.
                if str(exc) != link_down:
                    link_down = str(exc)
                    print(f"  {time.strftime('%H:%M:%S')}  {exc}", flush=True)
            except Exception as exc:
                signature = f"{type(exc).__name__}: {exc}"
                print(
                    f"  {time.strftime('%H:%M:%S')}  skipped a rebuild -- "
                    f"{board.error or signature}",
                    flush=True,
                )
                # The traceback the first time each failure appears. A page of
                # bare "skipped a rebuild: 'NetWorth'" says nothing about where
                # it came from, and that is the only record there is.
                if signature != last_failure:
                    last_failure = signature
                    traceback.print_exc()
                    print(
                        "  serving the last board that built; retrying when "
                        "the game writes a new save",
                        flush=True,
                    )
            else:
                if link_down:
                    link_down = ""
                    print(f"  {time.strftime('%H:%M:%S')}  the game link is back", flush=True)
                if moved:
                    what = (
                        f"the game (day {board.day})"
                        if board.link is not None
                        else os.path.basename(board.source)
                    )
                    print(
                        f"  {time.strftime('%H:%M:%S')}  rebuilt from {what}",
                        flush=True,
                    )
                    last_failure = None
            time.sleep(interval)

    threading.Thread(target=poll, daemon=True).start()

    if board.link is not None:
        print(f"Linked to the game at {board.link.url}", flush=True)
    else:
        print(f"Watching {target}", flush=True)
    print(f"  serving {url}  (checks every {interval}s, rebuilds only on a new save)")
    print(f"  priority {'lowered, the game gets the CPU first' if lowered else 'unchanged'}")
    print(f"  {locale_note(board.locale_source, board.names.locale)}")
    print("  Ctrl+C to stop", flush=True)
    if open_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
        server.shutdown()


def cli_names(lang: str | None, source: str | None, english: dict[str, str]) -> dict | None:
    """--lang: the game names of one language, from the installed game, for
    render(names=...). None for English or no --lang."""
    if not lang or lang == "en":
        return None
    if lang not in GAME_NAME_LANGS:
        raise SystemExit(f"--lang {lang}: the game has no such language; one of "
                         + ", ".join(code for code in GAME_NAME_LANGS))
    if not source or bundled_locale(source):
        raise SystemExit(f"--lang {lang} reads the game's own {lang}.json beside its en.json, "
                         "and no installed game was found; set BA_LOCALE to the game's en.json")
    other = load_locale(os.path.join(os.path.dirname(source), f"{lang}.json"))
    if name_coverage(english, other) < NAME_COVERAGE:
        raise SystemExit(f"--lang {lang}: {os.path.join(os.path.dirname(source), lang + '.json')} "
                         "names too few of the game's items to use")
    return {"lang": lang, "names": name_table(english, other)}


def cli_ui_table(lang: str | None) -> dict | None:
    """--lang: Big Copilot's own text in that language, for render(ui=...),
    from the table the site ships (web/i18n/<lang>.json, which
    `python build_web.py` writes). None for English, or for a language with
    no table or an empty one: the page's own words then stay English."""
    if not lang or lang == "en":
        return None
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web", "i18n", f"{lang}.json")
    try:
        with open(path, encoding="utf-8") as fh:
            table = json.load(fh)
    except (OSError, ValueError):
        return None
    return {"lang": lang, "table": table} if isinstance(table, dict) and table else None


def main() -> None:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument(
        "save",
        nargs="?",
        help="a .hsg file, a save folder, or the name of a save or character",
    )
    ap.add_argument(
        "--list",
        action="store_true",
        help="list every save under the save folder, by character, and stop",
    )
    ap.add_argument(
        "-o", "--out", default="dashboard.html", help="where to write the page"
    )
    ap.add_argument(
        "--watch",
        action="store_true",
        help="serve the board locally and rebuild it whenever the game saves",
    )
    ap.add_argument(
        "--port", type=int, default=8770, help="port for the local server in watch mode"
    )
    ap.add_argument(
        "--interval",
        type=int,
        default=None,
        help="seconds between checks: 5 for a save folder, 30 for the game link",
    )
    ap.add_argument(
        "--no-open", action="store_true", help="with --watch, do not open a browser"
    )
    ap.add_argument(
        "--game",
        nargs="?",
        const="http://127.0.0.1:8322",
        default=None,
        metavar="URL",
        help="read the running game through the Big Copilot Link mod instead of a "
        "save folder; URL defaults to http://127.0.0.1:8322. The bytes are kept "
        "as game-link.hsg beside the output file",
    )
    ap.add_argument(
        "--lang",
        default=None,
        metavar="CODE",
        help="show the game's own names (items, business types, neighbourhoods, "
        "skills) in one of the game's languages, e.g. de, fr, ja, zh-cn; the rest "
        "of the page stays English, unless Big Copilot's own text has a "
        "translation into that language (web/i18n/<code>.json)",
    )
    ap.add_argument(
        "--backfill",
        action="store_true",
        help="seed demand history from every save on disk, then build",
    )
    args = ap.parse_args()

    if args.game and (args.list or args.save):
        raise SystemExit(
            "--game reads the running game; it does not combine with --list or a "
            "save or character name"
        )
    interval = args.interval if args.interval is not None else (30 if args.game else 5)

    if args.list:
        if not args.save:
            root = default_root()
        elif os.path.exists(args.save):
            root = args.save  # catalogue() takes the folder of a save file
        else:
            raise SystemExit(
                f"{args.save} does not exist. --list takes the save folder or a save file."
            )
        print_catalogue(catalogue(root))
        return

    out = os.path.abspath(args.out)
    history = os.path.join(os.path.dirname(out) or ".", "market_history.json")

    # The link needs no folder: the mod names the character and the day, so
    # the positional argument and the save-folder search are beside the point.
    link = GameLink(args.game, os.path.dirname(out) or ".") if args.game else None
    target = None if link is not None else resolve_target(args.save)
    if link is not None and args.backfill:
        raise SystemExit(
            "--backfill seeds history from the saves of a folder; it does not "
            "combine with --game"
        )

    # --watch has its own Board, which resolves the text itself, so a plain
    # watch run does not parse en.json here only to leave it behind.
    if args.backfill or not args.watch:
        locale_source, locale = game_text()
        names = Names(locale)

    if args.backfill:
        recorded = backfill_history(target, history, names)
        print(f"  merged {recorded} snapshots into {os.path.basename(history)}")

    if args.watch:
        watch(target, out, port=args.port, interval=interval, open_browser=not args.no_open, link=link,
              lang=args.lang)
        return

    if link is not None:
        try:
            path = link.wait_for_save()
        except LinkUnavailable as exc:
            raise SystemExit(str(exc)) from None
        if path is None:
            raise SystemExit(
                "the game link has no save to read yet; load a save in the game "
                "and try again"
            )
        source_name = "the game link"
    else:
        path = newest_under(target)
        source_name = os.path.basename(path)
    lang_names = cli_names(args.lang, locale_source, locale)
    save = load_save(path)
    save.live_source = link is not None
    data = safe_extract(save, names, history)
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(render(data, names=lang_names, ui=cli_ui_table(args.lang)))

    k = data["kpi"]
    minor = data["minor"]
    print(
        f"{data['meta']['save']} - day {data['meta']['day']}  "
        f"(from {source_name}, game build {data['meta']['build']}, "
        f"board checked on {VERIFIED_BUILD})"
    )
    if link is not None and link.stale:
        # Two lines: the reason is a sentence of its own, sometimes a question.
        print(f"  {link.stale}", flush=True)
        print("  the board shows the state the mod last served", flush=True)
    worth = f"{k['netWorth']:>14,.0f}" if k["netWorth"] is not None else "   not reported"
    print(f"  cash {k['cash']:>14,.0f}   net worth {worth}")
    print(f"  profit yesterday {k['profitYesterday']:>+11,.0f}   7-day avg {k['profitAvg7']:>+11,.0f}")
    print(
        f"  {k['businesses']} businesses, {k['employees']} staff, "
        f"{len(data['alerts'])} alerts "
        f"({minor['count']} more below the ${minor['gate']:,.0f}/day line)"
    )
    print(f"  wrote {out}")
    print(f"  {locale_note(locale_source, locale)}")


if __name__ == "__main__":
    main()
