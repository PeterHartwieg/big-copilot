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
failed walks with nothing served between them fall back to serializing on the main
thread for this city session, with one more try for the worker after ten refreshes
the fallback ran (one more throw sends it back). A building load, when its option is
on, serializes on the main thread, under the black screen; one that finds a refresh
already in flight is run once the fifteen-second window lifts instead, on whichever
path is on.

A serialization is called a **refresh**. Each successful refresh gets a new **stamp**,
an opaque string; clients compare stamps for equality and never parse them. The mock
and the mod both use `"<day>-<hour>-<unix seconds>"` but nothing may depend on it.

### When the mod refreshes

- once, a few seconds after the city loads;
- on the frame the player enters or leaves a building (option "Refresh when a
  building loads", **off** by default, a backup: the hourly and game-save refreshes
  make it redundant): the screen is black between the fade-out and the
  fade-in, so the serialize is not seen, and this trigger alone may pass the
  fifteen-second window below (a refresh already in flight still blocks it; the
  refresh then runs once the window lifts);
- after any game save completes, so the served bytes are never older than the
  player's own save;
- on `POST /refresh`;
- as a floor, every 5 real minutes while attached;
- on every change of the in-game hour, with the option "Refresh every game hour",
  which is **on** by default: while the worker path holds, it costs nothing visible.

A serialize takes a few hundred milliseconds of a worker thread on a 5 MB save, plus
the gzip on the same thread (`busy` covers both), and is not a stall; the mod logs
`serialized in N ms on a worker thread (<trigger>)` on each one,
or `… on the main thread …` for a building load (with that option on) and after it
has fallen back.

**Attached** means a client fetched `/health` in the last 120 seconds. When nothing is
attached the mod refreshes only on the first trigger after a client returns, so an
installed mod costs a player nothing while the board is closed.

A refresh is skipped, and the previous bytes kept, while `SaveGameManager.SavingGameInProgress`
is true or `SaveGameManager.CanSave()` is false (interior designer, placement mode, the
casino boat). Refreshes never overlap: one in flight at a time, at most one every 15
seconds, except that a building load may pass that window (never an in-flight one).

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
  "refreshedAt": "2026-09-22T14:33:20Z",
  "writes": ["uniforms", "imports", "schedule"],
  "paired": false
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
- `writes` lists the write kinds this mod accepts (see "Writes" below); a mod before 0.2.0
  sends no `writes`, which a client reads as `[]`. `paired` is true only when this request
  carried the right pairing code, so a code-free poll always says false. Both are
  additive: `schemaVersion` stays 1.

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
  `"other"` is `CanSave()` false for a reason the mod cannot name, no loaded game
  instance, or the mod itself failing to start the refresh (a thread that would not
  start, a main-thread walk that threw); the failed starts are in the log.
- `503 {"error": "main_thread_unavailable"}` when the mod could not hand the request to
  the game at all (no city is loaded any more). No refresh started. The client says the
  mod did not take the request and keeps the last bytes; it is not "the game is not running".

Every JSON answer, `/health` included, carries `Cache-Control: no-store`: a cached
`/health` would hide a moved stamp.

### Writes

Mod 0.2.0 and later. Three kinds change the game — `uniforms`, `imports`, `schedule` —
and a fourth undoes the last write of a kind. The scope and the game rules behind each are
`docs/mod-write-back-scope.md`; this section is only the wire.

**Every write** is `POST /write/<kind>` with a JSON body (`Content-Type: application/json`,
at most 256 KiB, else `413 {"error":"too_large"}`) and the header
`Authorization: Bearer <code>`.

- **Pairing code.** Six characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, drawn once per
  game launch (a city reload keeps it). The mod shows it on demand: the options panel's
  "Copy pairing code" button puts it on the clipboard and shows it in an in-game
  notification. A missing or wrong code answers `401 {"error":"not_paired"}` before the
  body is read. Reads (`/health`, `/save`, `/refresh`) never need it.
- **Dry run.** `"dryRun": true` in the body runs every check and answers the verdict and
  the values the game would hold, applying nothing. A well-formed, paired dry run always
  answers `200`, with `"ok": false` and the per-row `error`s when the real write would be
  refused. The page runs one when its confirm dialog opens.
- **Apply** (`"dryRun": false` or absent) is all or nothing: every row passes or nothing
  is written.
- **Compare-and-set.** Rows carry `expect`, the value the page read from the bytes. A
  mismatch refuses the whole write with `409 {"error":"changed", ...}`; the page refreshes
  and re-plans. `changed` is checked before any rule.
- **Threading.** The mod runs the whole check-and-apply on the game's main thread. While a
  refresh walk is in flight on the worker thread the main thread holds the write until the
  walk has published; if that is not done within three seconds the answer is
  `503 {"error":"busy"}` and nothing was written. The page retries after a second, up to
  three times.
- **After an apply** the mod calls `SaveGameManager.MarkChange()`, shows an in-game
  notification ("Big Copilot updated <what> at <business>"), and starts a refresh that may
  pass the fifteen-second window (never an in-flight one). The answer carries `stamp`,
  the stamp before that refresh; the page polls `/health` until it moves, as after
  `POST /refresh`, and rebuilds from the new bytes. No game save.

**Answers common to every kind**

| Status | Body | Meaning |
| --- | --- | --- |
| `200` | `{"ok": true, "kind", "dryRun", ...}` | Applied, or a dry run's verdict (`ok` false when an apply would be refused) |
| `400` | `{"error":"bad_request","detail":"<what>"}` | Not JSON, a missing or mistyped field |
| `401` | `{"error":"not_paired"}` | Pairing code missing or wrong |
| `409` | `{"error":"changed","rows":[...]}` | An `expect` no longer holds; nothing written |
| `409` | `{"error":"refused","rows":[...]}` | A rule refused a row (`rows[i].error`); nothing written |
| `409` | `{"error":"cannot_write","reason":"saving"}` | The game is saving, or `CanSave()` is false; `reason` as for `/refresh` (`saving`, `placement`, `interior`, `casino`, `other`) |
| `413` | `{"error":"too_large"}` | Body over 256 KiB |
| `503` | `{"error":"busy"}` or `{"error":"main_thread_unavailable"}` | Walk in flight past three seconds, or no city loaded |

`rows` in a `409` has the same shape as in the dry run's `200`, so the page renders both
the same way. An address on the wire is `{"street": "<StreetName>", "number": <StreetNumber>}`,
the two fields of the building registration as the save holds them.

#### `POST /write/uniforms`

```json
{"dryRun": true,
 "sites": [{"address": {"street": "ba:street_secondavenue", "number": 12},
            "skills": ["ba:skill_customerservice", "ba:skill_cleaning"],
            "presetId": null}]}
```

`skills` is the site's `uniformGapSkills` from the payload. `presetId` null means the preset
named "Default", else the first of `GameInstance.employeePresets`; a string names one.

```json
{"ok": true, "kind": "uniforms", "dryRun": true,
 "presets": [{"id": "…", "name": "Default"}],
 "rows": [{"address": {}, "business": "Costy Co 2", "presetId": "…", "presetName": "Default",
           "set": ["ba:skill_customerservice"],
           "skipped": [{"skill": "ba:skill_cleaning", "reason": "already_set"}],
           "error": null}]}
```

- `set` is what the write fills (a dry run: would fill): every requested skill the site's
  Uniforms window offers that has no uniform yet. A skill with a uniform is skipped as
  `already_set` and never overwritten; a skill the window does not offer is skipped as
  `not_offered`. Neither is a refusal.
- Row `error`: `not_found` (no registration at that address), `not_rented`, `no_business`
  (an empty building), `no_locker` (no item tagged `isuniformlocker`), `no_preset`.
- No `expect`: "has no uniform yet" is the compare-and-set.

#### `POST /write/imports`

```json
{"dryRun": true,
 "contracts": [{"id": "<ImportPartnership id>", "activate": true,
                "products": [{"itemName": "ba:item_…", "warehouse": {"street": "…", "number": 3},
                              "amount": 4200, "expect": 3800}]}],
 "order": ["<id>", "<id>"]}
```

- `contracts[].id` is the payload's `contracts[].id`; a product is found by `itemName` and
  `warehouse` among that contract's existing products (a write never adds or removes a
  product). `expect` is the product's `amount` as the bytes had it.
- `activate: true` switches a stopped contract on the way the game's Start does, and turns
  Repeating on with it; on a running contract it changes nothing. `false` leaves the
  running state alone. A write never stops a contract.
- An amount change on a running contract needs `DeliveryHelper.CanModifyContract` for its
  next delivery, as the game's Cancel does; inside the lock window (Sunday 20:00 to Monday
  08:00) that contract is refused `locked`.
- `order`, optional (null or absent keeps the order): contract ids in the new relative order.
  The mod takes the slots those contracts occupy in `GameInstance.importPartnerships` and
  refills the same slots in the given order; every other contract keeps its place. An id
  that is not a contract is `not_found`.

```json
{"ok": true, "kind": "imports", "dryRun": true, "cash": 148230.5,
 "rows": [{"id": "…", "importer": "…", "active": true, "repeating": true, "reactivated": true,
           "nextDeliveryDay": 36, "nextDeliveryTotal": 23100.0, "error": null,
           "reopens": null,
           "products": [{"itemName": "…", "warehouse": {}, "before": 3800, "amount": 4200,
                         "smart": true, "unitPrice": 5.5, "cap": 5000, "orderedThisWeek": 0,
                         "error": null, "max": null}]}]}
```

- Values are what the contract holds after the write (a dry run: would hold).
  `nextDeliveryTotal` is the game's `NextDeliveryTotal` for the contract as written.
  `unitPrice` is per unit after the importer's discount. `cap` is the importer's weekly cap
  for the item (null when none applies), `orderedThisWeek` what the player's contracts with
  that importer already ordered of it this week.
- Contract `error`: `not_found`, `no_agent` (no purchasing agent, or one who left),
  `locked` (with `reopens: {"day": <game day>, "hour": 8}`), `screen_open` (the BizMan
  plan screen is open on this contract), `changed`.
- Product `error`: `not_found`, `no_warehouse`, `backorder` (the item is in a backorder
  market event), `over_cap` (a plain contract's amount above what the importer allows,
  with `max`), `changed`, `bad_amount` (negative or not a whole number). A Smart Delivery
  amount is a stock level, never `over_cap`.

#### `POST /write/schedule`

One business per call: its seven days of shifts are replaced.

```json
{"dryRun": true,
 "address": {"street": "…", "number": 12},
 "expect": "9f86d081",
 "openAllHours": false,
 "days": [{"d": 1, "shifts": [{"f": 8, "t": 20, "employeeId": "…", "itemInstanceId": "…"}]}]}
```

- `d` is the payload's weekday, `scheduleDays[i].day % 7` (1 is Monday, 0 Sunday). A day
  not listed is written empty; all seven are replaced.
- A shift's type is the mod's to choose, as the game's schedule screen does
  (`GetWorkShiftType`: cleaning stations get the cleaning type).
- `openAllHours: true` also sets every day open 0 to 24 (`isOpen`, one slot `{0, 24}`), the
  full-cover plan's opening hours. Refused at a headquarters (`hq_hours`), as the game refuses
  to toggle open there.
- `expect` is the **shift print** of the business's current shifts (below).

```json
{"ok": true, "kind": "schedule", "dryRun": true, "address": {}, "business": "…",
 "before": {"shifts": 84, "print": "9f86d081"}, "after": {"shifts": 90, "print": "1b4f0e98"},
 "removed": 84, "added": 90, "openedHours": false,
 "leftWithout": [{"employeeId": "…", "name": "Ana Silva"}],
 "warnings": [{"type": "overworked", "employeeId": "…", "name": "…", "d": 3, "hours": 14}],
 "error": null, "rows": []}
```

- `leftWithout`: people with a shift here before and none after; the game unassigns their
  work and adds a to-do, as its own screen does.
- Site `error` (in `error`): `not_found`, `not_rented`, `screen_open` (the BizMan schedule is
  open on this business), `hq_hours`, `changed`.
- Shift `error`s in `rows`, each `{"d", "i" (index in that day's list), "error"}`:
  `not_assigned` (the employee is not assigned to this business), `no_station` (no such item
  here, or not a workstation), `no_skill` (`HasSkillForWorkstation` false), `bad_hours`
  (whole hours, `0 <= f < t <= 24`, `t - f <= 12`), `overlap_person`, `overlap_station`.

**Shift print.** Both sides compute it the same way: the page's payload (`ba_dashboard.py`,
from the bytes) and the mod (from live state). For each entry of the business's
`scheduleDays`, for each of its `workShifts`, one line
`<day % 7>|<startingHour>|<endingHour>|<employeeId>|<itemInstanceId>|<type>`: integers in
invariant decimal, a missing id as the empty string, a missing field at its default (0).
Sort the lines by ordinal string order, join them with `\n`, and take FNV-1a 32-bit
(offset basis `0x811c9dc5`, prime `0x01000193`) over the UTF-8 bytes; the print is eight
lowercase hex digits. No shifts at all is the print of the empty string, `811c9dc5`.
A test vector both sides pin: the two lines
`0|0|12|AAAAemployeeAAAAAAAAAAAA|CCCCcleanCCCCCCCCCCCCCCC|0` and
`1|8|20|AAAAemployeeAAAAAAAAAAAA|BBBBstationBBBBBBBBBBBBB|1` print as `ee01ac86`.

#### `POST /write/undo`

```json
{"kind": "imports", "dryRun": false}
```

Restores what the last applied write of that kind changed, in this city session, where
the target still holds what that write left there: uniforms only on the skills it set and
still holding its preset; imports the amounts, running state, Repeating, urgent flag, next
delivery day and plan order; the schedule the shifts and, when it opened them, the
opening hours. Answers like the write it undoes, with `"undo": true`;
`409 {"error":"nothing_to_undo"}` when there is none; `409 {"error":"changed"}` when the
game has moved on. An undo is not itself undoable; a new write of the kind replaces what
undo would restore.

### Anything else

`404 {"error": "not_found", "endpoints": [...]}`, listing the paths above (0.1.0 lists
`/health`, `/save`, `/refresh`).
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
Access-Control-Allow-Headers: Authorization, Content-Type, If-None-Match
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
