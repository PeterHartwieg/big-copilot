# Game link API

The wire contract between the Big Copilot Link mod (`mod/BigCopilotLink/`) and its
two clients: the web app at bigcopilot.com (`web/app.js`) and the local watcher
(`ba_dashboard.py --watch --game`). `tools/game_link_mock.py` serves the same contract
from a save file on disk, so the clients can be developed and tested without the game.

Schema version **1**. Bump it on any breaking change and update the mod, the mock, the
two clients and this file in the same commit. A client refuses a mod whose
`schemaVersion` it does not know and says which version it needs.

## Where the mod listens

`http://127.0.0.1:<port>/`, loopback only, never a public interface. The default port
is **8322**; the mod's options panel offers 8322 to 8325. 8321 belongs to Peter's MCP
bridge and 8765 to the Companion mod, so neither is used.

The listener runs only while a city is loaded (`[ModEntryOnCityLoad]`): it starts in
`OnLoadAsync` and stops in `OnUnloadAsync`. A client that gets a connection error
treats it as "the game is not running or no save is loaded".

## What the mod serves

The mod does not model the game. It serializes `SaveGameManager.Current` the way the
game's own save does — `SaveGameSerializationHelper.SerializeBinaryData` is the
template, not a call the mod makes — and serves the resulting bytes: a `.hsg` as the
game would write it, except that a walk on the worker thread can mix two moments a
few hundred milliseconds apart (the game keeps running under it). Clients feed those
bytes to `ba_save.py` unchanged.

The mod serializes on a worker thread of its own, with a private
`SerializationContext` configured like the game's helper — the same policy
(`Player.SaveSystem.SaveGameSerializationPolicy`), the same error policy
(`ErrorHandlingPolicy.ThrowOnErrors`) and `DataFormat.Binary` — so the bytes are
what `SerializeBinaryData` would write. The game keeps running meanwhile. The same
thread gzips the result with `SaveGameSerializationHelper.CompressBytes`. A walk
that throws because the game changed state keeps the previous bytes and retries; two
consecutive failures fall back to serializing on the main thread for this city
session, with one more try for the worker after ten main-thread refreshes. A
building load always serializes on the main thread, under the black screen.

A serialization is called a **refresh**. Each successful refresh gets a new **stamp**,
an opaque string; clients compare stamps for equality and never parse them. The mock
and the mod both use `"<day>-<hour>-<unix seconds>"` but nothing may depend on it.

### When the mod refreshes

- once, a few seconds after the city loads;
- on the frame the player enters or leaves a building (option "Refresh when a
  building loads", default on): the screen is black between the fade-out and the
  fade-in, so the serialize is not seen, and this trigger alone may pass the
  fifteen-second window below;
- after any game save completes, so the served bytes are never older than the
  player's own save;
- on `POST /refresh`;
- as a floor, every 5 real minutes while attached;
- on every change of the in-game hour, with the option "Refresh every game hour",
  which is **on** by default: while the worker path holds, it costs nothing visible.

A building load's two edges (the loading spinner rising, the inside/outside flip)
land within one load screen of each other and count as one refresh: the second passes
only three seconds after the first.

A serialize takes a few hundred milliseconds of a worker thread on a 5 MB save, plus
the gzip on the same thread (`busy` covers both), and is not a stall; the mod logs
`serialized in N ms on a worker thread (<trigger>)` on each one,
or `… on the main thread …` for a building load and after it has fallen back.

**Attached** means a client fetched `/health` in the last 120 seconds. When nothing is
attached the mod refreshes only on the first trigger after a client returns, so an
installed mod costs a player nothing while the board is closed.

A refresh is skipped, and the previous bytes kept, while `SaveGameManager.SavingGameInProgress`
is true or `SaveGameManager.CanSave()` is false (interior designer, placement mode, the
casino boat). Refreshes never overlap: one in flight at a time, at most one every 15
seconds.

## Endpoints

### `GET /health`

Cheap. Reads only fields the main-thread pump caches once a second; never touches game
state from the listener's threads.

```json
{
  "ok": true,
  "schemaVersion": 1,
  "modVersion": "0.1.0",
  "source": "game",
  "build": 3680,
  "character": "58e6a328-…",
  "company": "HART. YT",
  "day": 34,
  "hour": 14,
  "minute": 12,
  "cash": 148230.5,
  "stamp": "34-14-1758550000",
  "busy": false,
  "size": 5123456,
  "refreshedAt": "2026-09-22T14:33:20Z"
}
```

- `source` is `"game"` from the mod and `"mock"` from the mock.
- `build` is the game's build number; `character` the loaded character's id (the
  save folder's name); `company` is `GameInstance.SaveGameName`.
- `stamp` is `""`, `size` is `0` and `refreshedAt` is `null` until the first refresh
  has finished.
- `busy` is true while a refresh is in flight.
- `cash`, `day`, `hour`, `minute` are the live values for a ticker; they can be newer
  than the served bytes.

### `GET /save`

The bytes of the latest refresh.

- `200`, `Content-Type: application/octet-stream`, `Content-Length` set,
  `Cache-Control: no-store`, `ETag: "<stamp>"`, `X-Game-Link-Stamp: <stamp>`,
  `X-Game-Link-Day: <day of the bytes>`, `X-Game-Link-Character: <character>`.
- `304` with no body when the request carries `If-None-Match` equal to the current
  `ETag`.
- `503 {"error": "no_save_yet"}` before the first refresh has finished.

Clients name the bytes `<character>-live.hsg` and use `refreshedAt` (or the time of
the fetch) as the file time.

### `POST /refresh`

Asks for a refresh now. No body, but a `Content-Length: 0` header: Mono's
`HttpListener` answers a body-less POST without one with `411 Length Required` before
the mod sees it. Browsers' `fetch` and Python's `urllib` send it; curl does not, so
`curl -X POST -H "Content-Length: 0" …`.

- `202 {"accepted": true, "stamp": "<stamp before this refresh>"}`. The client polls
  `/health` until `stamp` changes and `busy` is false, then fetches `/save`. The mod
  answers within about three seconds: when the game's main thread has not taken the
  request by then (mid-load, a long frame) it is still accepted and runs when the
  thread is free, so a 202 can precede the refresh by a moment. A walk that fails
  after the 202 (the game changed state under it) keeps the previous stamp; the mod
  retries once the fifteen-second window lifts, so the stamp can move only fifteen to
  about thirty seconds later (one window per failed walk; after the second failure
  the main thread takes it). The clients' wait allows that. Clients time out a call
  after five seconds; the mod never holds one longer than that.
- `429 {"error": "throttled", "retryAfter": <seconds>}` inside the 15-second window
  or while one is in flight; the client waits and polls `/health` as above.
- `409 {"error": "cannot_save", "reason": "saving" | "placement" | "interior" | "casino" | "other"}`
  when the game refuses; the client shows the reason and keeps the last bytes.
  `"other"` is `CanSave()` false for a reason the mod cannot name, or the mod itself
  failing to start the refresh (a thread that would not start, a main-thread walk
  that threw); the log says which.
- `503 {"error": "main_thread_unavailable"}` when the mod could not hand the request to
  the game at all (no city is loaded any more). No refresh started. The client says the
  mod did not take the request and keeps the last bytes; it is not "the game is not running".

Every JSON answer, `/health` included, carries `Cache-Control: no-store`: a cached
`/health` would hide a moved stamp.

### Anything else

`404 {"error": "not_found", "endpoints": ["/health", "/save", "/refresh"]}`.
Methods other than the ones above answer `405`.

## CORS and the browser

The web app runs on `https://bigcopilot.com` and fetches `http://127.0.0.1:<port>`.
Two things make that work.

**The mod answers CORS for an allowlist of origins.** When the request carries an
`Origin` header the mod compares it with the allowlist; on a match every response
carries:

```
Access-Control-Allow-Origin: <that origin>
Vary: Origin
Access-Control-Expose-Headers: ETag, X-Game-Link-Stamp, X-Game-Link-Day, X-Game-Link-Character
```

A preflight `OPTIONS` answers `204` with those headers plus:

```
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, If-None-Match
Access-Control-Max-Age: 600
Access-Control-Allow-Private-Network: true     (only when the request carried
                                                Access-Control-Request-Private-Network: true)
```

An `Origin` that is not on the list gets the response without any `Access-Control-*`
headers, which the browser then blocks. A request with no `Origin` (curl, the CLI
watcher) is served as is.

The allowlist: `https://bigcopilot.com`, `https://www.bigcopilot.com`, and any
`http://127.0.0.1:<port>` or `http://localhost:<port>` (the local watcher and a local
`build_web.py` preview). Nothing else, ever: the bytes are the player's whole company.

**The browser asks the player once.** Chrome and Edge from version 142 gate a fetch
from a public HTTPS page to loopback behind a site permission prompt. The page must be
HTTPS (it is) and should annotate the call:

```js
fetch(url, {targetAddressSpace: "loopback"})
```

Chrome 145 introduced `"loopback"`; earlier versions know `"local"`; browsers that
know neither throw a `TypeError` on an unknown value. The client therefore tries
`"loopback"`, then `"local"`, then no annotation, remembering which one worked for the
session. Once granted, the permission also lifts mixed-content blocking for the
loopback request. Firefox treats loopback as secure and does not prompt. Safari is
unverified.

## The clients' loop

1. `GET /health`. A connection error means the game is not there: say so, keep the
   last board, retry on the next poll or on Update.
2. Only a `200` with a JSON object is judged: any other status, or a `200` whose body
   is no JSON object, means the mod is there and not ready (or something else held the
   port for a moment) and is waited out like `busy`, for a bounded time (the page
   thirty seconds, the CLI ten answers), after which the client says the address
   answers but not as the mod; a wait in which any answer was health blames the save
   the mod has not produced, never the port. On a health object with no
   `schemaVersion`, say the same about the port; with one this client does not know,
   stop and say which version it needs.
3. If `stamp` differs from the stamp of the board on screen and `busy` is false,
   `GET /save` with `If-None-Match` and build from the bytes.
4. Update means `POST /refresh`, then step 1 until the stamp moves.
5. Watching means step 1 every 30 seconds while the page is visible, which also keeps
   the mod attached. A watcher that meets ten answers in a row that were never health,
   or a health object that is not this client's version, says so once under the board
   it keeps, and withdraws that the moment a health answer of its version arrives.

## The mock

```
python tools/game_link_mock.py <save.hsg> [--port 8322] [--character ID] [--company NAME]
```

Serves the file with this contract, `source: "mock"`. `POST /refresh` and a change of
the file's modification time both re-read it and issue a new stamp, so pointing the
mock at the game's own autosave folder gives a live-looking link without the mod.
`--throttle`, `--refuse <reason>` and `--schema <n>` exercise the clients' error paths.
