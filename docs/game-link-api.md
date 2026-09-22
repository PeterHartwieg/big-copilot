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

The mod does not model the game. It asks the game to serialize itself with the call
the game's own save uses, `SaveGameSerializationHelper.SerializeBinaryData(path,
SaveGameManager.Current, compressed: true)`, on a background thread, and serves the
resulting bytes: a `.hsg` exactly as the game would write it. Clients feed those bytes
to `ba_save.py` unchanged.

A serialization is called a **refresh**. Each successful refresh gets a new **stamp**,
an opaque string; clients compare stamps for equality and never parse them. The mock
and the mod both use `"<day>-<hour>-<unix seconds>"` but nothing may depend on it.

### When the mod refreshes

- once, a few seconds after the city loads;
- on every change of the in-game hour (option "Refresh every game hour", default on);
- after any game save completes, so the served bytes are never older than the
  player's own save;
- on `POST /refresh`;
- as a floor, every 5 real minutes while attached.

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
state from the HTTP thread.

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

Asks for a refresh now. No body.

- `202 {"accepted": true, "stamp": "<stamp before this refresh>"}`. The client polls
  `/health` until `stamp` changes and `busy` is false, then fetches `/save`.
- `429 {"error": "throttled", "retryAfter": <seconds>}` inside the 15-second window
  or while one is in flight; the client waits and polls `/health` as above.
- `409 {"error": "cannot_save", "reason": "saving" | "placement" | "interior" | "casino"}`
  when the game refuses; the client shows the reason and keeps the last bytes.

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
2. If `schemaVersion` is unknown, stop and say which version this client needs.
3. If `stamp` differs from the stamp of the board on screen and `busy` is false,
   `GET /save` with `If-None-Match` and build from the bytes.
4. Update means `POST /refresh`, then step 1 until the stamp moves.
5. Watching means step 1 every 30 seconds while the page is visible, which also keeps
   the mod attached.

## The mock

```
python tools/game_link_mock.py <save.hsg> [--port 8322] [--character ID] [--company NAME]
```

Serves the file with this contract, `source: "mock"`. `POST /refresh` and a change of
the file's modification time both re-read it and issue a new stamp, so pointing the
mock at the game's own autosave folder gives a live-looking link without the mod.
`--throttle`, `--refuse <reason>` and `--schema <n>` exercise the clients' error paths.
