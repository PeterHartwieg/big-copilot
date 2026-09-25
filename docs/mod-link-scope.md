# Game link mod: technical scope

Status: step 1 shipped (PR #72, 22 September 2026), step 2 in
[mod-write-back-scope.md](mod-write-back-scope.md). Kept in place because the mod source
cites it; the current contract is [game-link-api.md](game-link-api.md).

Written 22 September 2026. Scopes a second way for Big Copilot to get its numbers: a
Steam Workshop mod that hands the running game's state straight to the board, beside
the existing save-folder read. Players keep the choice. Step 1 is read only; step 2
writes the staffing plan's roster back into the game.

Everything under *What the game offers* was read from build 3680's
`BigAmbitions.dll` and `BigAmbitions.ModAPI.dll` by reflection on 22 September 2026,
and is quoted with its source. Step 1 is implemented; step 2 is not. Section 4 is
the scope as it was written that day and is left as written: the README in
`mod/BigCopilotLink/` and `docs/game-link-api.md` describe what was built, and win
wherever they differ from it.

---

## 1. The recommendation in one paragraph

The mod does not model the game. It serializes the game with the game's own
serializer settings and serves those bytes on loopback HTTP. Big Copilot
fetches them and feeds them to the same reader and the same `extract()` that read a
save file today, so both modes produce the same board from the same code, and a
game update that changes the save format breaks both modes in the same place, which
is the place already guarded by `MIN_BUILD` and `VERIFIED_BUILD`. The mod's game
surface is four calls. Step 2 adds one write endpoint that replaces a site's weekly
schedule, validated on the Unity main thread with the same rules the in-game grid
enforces.

## 2. Why not a JSON snapshot

Peter's private `BigAmbitionsMCP` repo (July 2026) did it the other way: a Bridge mod
with a 1,800-line `SnapshotBuilder` that walked `GameInstance` into its own JSON
schema (five schema versions in two days) for an MCP server. It worked, but every
field the board wants would have to be mapped twice, once in C# and once in
`extract()`, and every game update would have to be chased in both. The 11 September
evaluation in memory reached the same conclusion: never a C# exporter that
duplicates `extract()`. The Companion mod (tiagovitorin, now gone from GitHub; its
web app streamed cash, revenue and shifts to `127.0.0.1:8765`) was the same shape as
the Bridge, a hand-built telemetry schema, and had the same maintenance bill.

Reusable from `BigAmbitionsMCP` regardless: `BridgeHttpServer.cs` (a loopback
`HttpListener` on a background thread), `MainThreadDispatcher.cs`, `BridgeMod.cs`
(the entry point), and `src/BigAmbitionsMCP.Bridge/README.md`, which documents the
Mac build path with its three SDK workarounds. Roughly 300 lines, all Peter's.

## 3. What the game offers (build 3680)

**Serialization.** `SaveGameSerializationHelper.SerializeBinaryData(string path,
GameInstance instance, bool compressed)` writes GZip over the OdinSerializer binary
that `ba_save.py` reads (the reader's docstring calls it Easy Save 3; the wire format
is the same one, and every save on disk was written by this call). `SaveGameManager.Save()`
calls it on the main thread (`SerializeSaveGame` is a plain call; only the gzip,
`CompressSaveGame`, runs on its "SaveGame Compress Thread"), against
`SaveGameManager.Current` directly, with no copy (corrected 22 September 2026 from
the IL), and the feedback form
(`SavegameFeedbackData.AddToForm`) calls it on the main thread. The mod copies the
serializer settings, not the thread: see the README. Guards:
`SaveGameManager.SavingGameInProgress`, `CanSave()` (false inside
the interior designer, placement mode, the casino boat), `HasChangesSinceLastSave()`.
The game keeps a temp path for this in `SaveGamePathHelper.GetTempSavePath()`.

Cost, measured 11 September on the 4.9 MB Costco save: about 185 ms to serialize and
600 ms to compress. On the mod's own thread that is invisible; on the main thread it
is a visible hitch, so the mod uses a thread of its own, which the game does not.

**Lifecycle.** `[ModEntryOnCityLoad]` on an `IModBigAmbitions` gives `OnLoadAsync`
when a save is loaded and `OnUnloadAsync` when it unloads, so the listener only runs
while there is a game to serve. `UnityLifecycleProvider.OnUpdate` is the main-thread
pump. `ModContext.Logger` is the log. `ModOptions` (toggle, slider, dropdown, button)
gives an in-game options panel for the mod; `ModContext.ModRootPath` is where a
config file can live.

**Schedules.** A `BuildingRegistration` holds `scheduleDays: List<ScheduleDay>`; a
`ScheduleDay` is `{DayOfWeekOrdered day, bool isOpen, List openingHourSlots,
List<WorkShift> workShifts}`; a `WorkShift` is `{int startingHour, int endingHour,
string employeeId, string itemInstanceId, WorkShiftType type}` with `Clone()` and
`IsHourInShift()`. This is the same structure the board already reads for the hour
grid and the roster.

The game's own mutation helper, `ScheduleHelper`, lives in
`UI.Smartphone.Apps.BizMan.Schedule` and is static state bound to the BizMan
business that is open on screen (`Business`, `CurrentScheduleDay`, caches by
employee and workstation). It is not a service; calling it with no app open is
undefined. What matters is what it does after a change, read from
`UpdateEmployeeAfterWorkShiftChange`: `EmployeeInstance.UpdateWeeklyHoursAndDays(scheduleDays)`,
`EmployeeInstance.UpdateAssignedWorkStationItems()`,
`BusinessSecurityHelper.UpdateSecurityLevel(registration)` when the employee has a
security skill, `EmployeeInstance.UnAssignWork()` when they are left with no shift,
`AddTodoTask` for that case, `UpdateHQPlans` at a headquarters, and
`SaveGameManager.MarkChange()`. Step 2 edits `workShifts` directly and then calls
exactly these, in this order. The rules the grid enforces, from the staffing scope:
12 hours the longest shift, one person per station per hour, one shift per person
per hour, and a person must have the station's skill
(`ScheduleHelper.HasSkillForWorkstation`).

**Modded saves.** `Save()` sets `GameInstance.hasEverUsedMods` whenever any gameplay
mod is loaded and lists `activeModsAtLastSave` in the `.hsg.meta` sidecar. The game
then treats the character as modded for good. What that changes for the player
(achievements, support) is not read yet; it goes in the mod's description either
way.

## 4. Step 1: reading

### The mod

- Binds `http://127.0.0.1:<port>/` only. Port: one fixed default, changeable in the
  mod's options (a dropdown of a few alternatives is friendlier than a slider). Not
  8321, which the MCP bridge uses, and not 8765, the Companion's.
- `GET /health`: `{ok, modVersion, build, character, day, hour, stamp, busy}`. `stamp`
  changes whenever a new serialization finished. Never touches game state beyond
  cached fields the main-thread pump refreshes each second.
- `GET /save`: the latest serialized bytes, `application/octet-stream`, with the
  `stamp` and the in-game day in headers, and `ETag: stamp` so a poll that has the
  current bytes gets a 304.
- `POST /refresh`: asks for a new serialization now. Throttled to one in flight and
  no more than one every 15 seconds; answers 202 with the stamp to wait for. The main
  thread checks `SavingGameInProgress` and `CanSave()` before starting, hands
  `Current` to a worker thread that serializes it in memory with a private context
  configured like the game's helper (as built: no temporary file, and the game
  itself does not walk on a thread, so the tearing risk is the mod's alone; a walk
  that throws is retried, two failures fall back to the main thread).
- Automatic refresh: when a building's load screen appears (the stall is hidden
  there; as built, an option that is off by default),
  on any game save completing, every five minutes as a floor, and on the in-game hour
  change as an option that is on by default now that the walk is off the main thread
  (as built). Idle when no client has polled
  `/health` for two minutes, so an installed mod costs nothing to a player who is
  not looking at the board.
- CORS: `Access-Control-Allow-Origin` limited to `https://bigcopilot.com` and
  `http://127.0.0.1:<watch port>` for the local watcher; an `OPTIONS` preflight
  answering `Access-Control-Allow-Private-Network: true` for Chrome versions still
  on the older Private Network Access rules. No other origin can read the save.
- Options panel: enabled toggle, port, refresh interval, a "Copy address" button.

### The browser

Chrome and Edge from version 142 gate a fetch from a public HTTPS page to loopback
behind a one-time site permission prompt ("bigcopilot.com wants to access devices on
your local network"); the page must be HTTPS (it is) and annotate the call with
`fetch(url, {targetAddressSpace: "loopback"})` (Chrome 145 made loopback its own
grant; "local" is the fallback value). Once granted, mixed content from the HTTPS
page to `http://127.0.0.1` is allowed. Firefox treats loopback as secure and does not
prompt. Safari is unverified; it gets the folder path if loopback is refused.

`web/app.js` gains a third source beside the folder handle and the file input:

- Landing: a "Link to the game" button. It probes `/health`; if the mod is not there,
  a note says how to install it and the two other buttons stay. The choice is
  remembered in localStorage as the source, like `ledger_pick` today.
- Board: the source strip reads "Linked to the game · day 34, 14:00 · updated 12 s
  ago". Update posts `/refresh` and fetches `/save` when the stamp moves; the watch
  toggle polls `/health` on the existing 30-second cadence and fetches on a new
  stamp. The save selector (characters and files) is hidden in this mode: the mod
  serves whatever character is loaded, and `.hsg.meta` does not exist.
- The build path is unchanged. `buildFrom()` today takes a `File`; it gets a
  sibling that takes `{name, bytes, mtime}` from the fetch and posts the same
  `{kind: "build"}` message to the worker. Name: `<character>-live.hsg`; mtime: the
  stamp's time.
- History stays per character. `extract()` keys it by the save's own
  `characterId` (`root.get("characterId")`, never the folder name), so a live build
  lands in the same history as the folder builds of that character.
- Fallback: when the mod stops answering (game closed, city unloaded) the strip says
  so and keeps the last board, the way a vanished folder is handled today.

### The CLI

`ba_dashboard.py --watch --game[=http://127.0.0.1:<port>]` polls `/health` instead of
the folder and rebuilds from `/save` on a new stamp. The `Board` class already
rebuilds from bytes on disk; this writes them to the output folder first. Forty lines.

### Tests

- `tests/game_link.test.cjs`: the source choice, the strip states, the stamp poll,
  the fallback when `/health` fails, the hidden selector. Same shape as
  `tests/resume.test.cjs`, with a stub `fetch`.
- `tests/test_watch_game.py`: the CLI poll against a stub HTTP server.
- Manual, on Chrome stable and Firefox: the permission prompt, a build from the
  live bytes matching a build from the next autosave of the same minute.

## 5. Step 2: writing the roster

The staffing plan already carries what the game needs. `_plan_site()` produces
shifts as `{wd, station, from, to, employee, kind}`, where `station` is the
workstation's `itemInstances` id and `employee` the `EmployeeInstances` id, and
`_shift_row()` compresses them into per-site index tables the page holds. The page
expands the rows back and posts:

```
POST /schedule
{
  "address": {"street": "ba:street_secondavenue", "number": 12},
  "days": [
    {"d": 1, "shifts": [
      {"f": 8, "t": 20, "employeeId": "…24 chars…", "itemInstanceId": "…24 chars…"}
    ]},
    …seven entries…
  ]
}
```

The mod queues it, and on the main thread:

1. Refuses (409) while `SavingGameInProgress`, while the BizMan schedule app is open
   on that business (`ScheduleHelper.Business` matches the address; its caches would
   desync), or when the building is not `RentedByPlayer`.
2. Validates every row: the employee is assigned to this address; the item exists in
   the building's `itemInstances` and is a workstation; `HasSkillForWorkstation`
   holds; hours are within 0 to 24 with `f < t` and `t - f <= 12`; no two rows put
   one person or one station on the same hour of the same day. Any failure rejects
   the whole plan (400, listing the rows), nothing is half-written.
3. Replaces `scheduleDays[d].workShifts` for the seven days with new `WorkShift`
   objects, `type` from the station (cleaning stations get the cleaning type, the
   rest the station's type as `GetWorkShiftType` derives it). Opening hours are not
   touched: the plan is clear-and-re-enter for shifts only, as the staffing scope
   settled.
4. For every employee that had or has a shift here: `UpdateWeeklyHoursAndDays`,
   `UpdateAssignedWorkStationItems`, `UnAssignWork` plus the to-do task when they
   are left with nothing; then `UpdateSecurityLevel` for the building;
   `UpdateHQPlans` if it is a headquarters; `MarkChange()`.
5. Answers with the schedule as it now stands and triggers a `/refresh`, so the
   page's next build shows the written roster: read-after-write, not a success
   flag.

What is not written: the plan's hiring lines (no employee exists yet) and anything
for people on the bench who are not assigned to the site. Both stay as steps on the
page's checklist. Offices and factories follow when their plans exist.

**Consent.** Writes need more than the browser's permission prompt. The mod shows a
pairing code in its options panel; the page asks for it once and sends it as a
bearer header on every `POST /schedule`. `GET /save` stays code-free: the permission
prompt and the origin allowlist are enough for reading.

**The page.** A "Write to the game" button on the roster, enabled only in linked
mode, with the plan shown as the game will hold it and the game's own confirm
wording ("replaces the current schedule for this business"). After the write, the
board rebuilds and the roster's "now" view is the plan.

## 6. Build, repo and release

- The mod compiles only inside the SDK's Unity 2022.3.62f2 project
  (`hovgaardgames/bigambitions`, `Assets/Mods/<name>/` with an `.asmdef` listing the
  game DLLs; Mod Builder installs to `ModsLocal`). This machine has no Unity Hub;
  Peter's Mac has the SDK and the shims from the Bridge README. Windows needs Unity
  Hub plus the SDK clone once, then Auto-detect finds the Steam install.
- Source lives in this repo under `mod/` (C# and the asmdef only; game DLLs are never
  committed), copied into the SDK project to build. A separate repo would split the
  wire contract from the page that speaks it.
- Wire contract as `docs/game-link-api.md`, versioned with a `schemaVersion` in
  `/health`; the page refuses a mod older than it can talk to and says which
  version to update to.
- Publish to the Workshop through the in-game Mod Creator, pinned to the game build
  it was built against; the description says the mod opens a loopback HTTP port,
  what it serves, and that saves become modded. A GitHub release of the DLL for
  players who do not use the Workshop.
- Changelog entry: yes, it is a new capability ([[changelog-policy]]).

## 7. Effort

| Piece | Size |
| --- | --- |
| Mod, step 1 | ~400 lines C# (server, dispatcher, serializer call, options), plus the Unity build loop |
| Page, step 1 | ~150 lines in `web/app.js`, one test file |
| CLI, step 1 | ~40 lines |
| Mod, step 2 | ~250 lines C# (validation, apply, pairing code) |
| Page, step 2 | roster button, expand rows, one test file |

Step 1 is one to two days of code and a day of QA across Chrome, Edge and Firefox.
Step 2 is similar, most of it validation and the two verifications below.

## 8. To verify before building

1. That `SerializeBinaryData` off the main thread produces bytes `ba_save.py` reads
   identically to the next autosave (a diff of two `extract()` outputs a minute
   apart). If not, the `CreateSaveSnapshot` route.
2. What the game does with `hasEverUsedMods` (achievements, anything in the UI).
3. Chrome stable's exact `targetAddressSpace` value and prompt on the day of the
   build; Safari's behaviour.
4. Step 2: that the four post-change calls leave the game in the same state the grid
   leaves it, checked by writing a roster, then opening the BizMan schedule for
   that business and comparing; and that `WorkShiftType` for a station is what
   `GetWorkShiftType` returns for its workstation id.

## 9. Decisions for Peter

1. Port default, and whether the mod's options expose it.
2. `mod/` in this repo or a separate repo.
3. Workshop plus GitHub release, or GitHub only for the first version.
4. Pairing code for writes (recommended) or the browser prompt alone.
5. Whether a schedule write also triggers a game save (recommended no; the player
   saves, the board shows the written state from the live bytes either way).
