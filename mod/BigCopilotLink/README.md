# Big Copilot Link — the game mod

This mod lets [Big Copilot](https://bigcopilot.com) read the game you are playing
instead of a save file you picked by hand. While a city is loaded it serializes the
running game with the game's own serializer settings, on a thread of its own, and
serves the resulting bytes — a `.hsg` as the game would write it — over loopback
HTTP. It holds no model of the game. From 0.2.0 it also makes three changes the board
proposes, and only when you confirm them on the board from a browser you approved in
the game: default uniforms, import contract amounts, and a business's staff schedule (see
"What it changes" below).

**Players:** subscribe on the Steam Workshop,
[Big Copilot Link: Live Business Dashboard](https://steamcommunity.com/sharedfiles/filedetails/?id=3806322395)
(item 3806322395), enable it in the game's Mods menu, load a save, then click **Link to
the game** on bigcopilot.com. The rest of this file is for building it.

The wire contract is [`docs/game-link-api.md`](../../docs/game-link-api.md). This
folder is a drop-in mod for the official
[Big Ambitions modding SDK](https://github.com/hovgaardgames/bigambitions); it does
not build in this repo, only inside the SDK's Unity project through the in-editor
Mod Builder.

## What it shares, and with whom

- **Loopback only.** The listener binds `http://127.0.0.1:<port>/` and nothing else.
  Nothing outside your machine can reach it.
- **An origin allowlist.** Browser requests are answered only for
  `https://bigcopilot.com`, `https://www.bigcopilot.com`, and any `http://127.0.0.1`
  or `http://localhost` page (the local watcher, a local `build_web.py` preview).
  Every other origin gets a response with no CORS headers, which the browser then
  refuses to hand to the page.
- **It is the whole save.** What `/save` serves is your entire company, not a summary.
  Big Copilot reads it in your own browser; it is not uploaded anywhere. Anything else
  that could reach loopback on your machine could read it too, which is what the
  allowlist is for.
- **Chrome asks you once.** Chrome and Edge gate a fetch from a public HTTPS page to
  loopback behind a site permission prompt. Big Copilot only works after you allow it.
- **Saves made with the mod enabled are modded saves**, the same as with any other
  mod. Loading an unmodded save with the mod on asks "Load with mods?" and writes a
  copy, `<name> (Modded).hsg`, leaving the original untouched; that copy carries a
  mod icon on the Load Game screen ("Saved with Mods", listing the mods), and the
  game's bug reporting is off for it. `/health` then reports the company as
  "<name> (Modded)". No achievement text mentions mods (build 3680).
- **Almost nothing on disk.** The save bytes are produced in memory and only ever leave
  the process over the loopback listener. The one thing the mod stores is the list of
  browsers you approved (from 0.2.0): for each, the SHA-256 of its token (never the token
  itself), its origin (such as `https://bigcopilot.com`), the short name the page gave it
  (such as "Chrome on Windows") and when it was approved and last used. It lives in the
  game's PlayerPrefs under the key `BigCopilotLink.approved` (the Windows registry under
  `HKEY_CURRENT_USER\Software\Hovgaard Games\Big Ambitions`, a plist on a Mac), where the
  SDK keeps mod options too. **Forget approved browsers** in the mod's options empties it.

## What it changes (0.2.0)

Four `POST` endpoints, all in [`docs/game-link-api.md`](../../docs/game-link-api.md)
under "Writes":

| Endpoint | What it changes |
| --- | --- |
| `/write/uniforms` | Puts a preset (the one named "Default" unless the page names another) on every skill of a site's Uniforms window that has no uniform yet (or on the skills the page names). A skill you dressed yourself is never touched. |
| `/write/imports` | Sets purchasing-agent contract amounts, switches a stopped contract back on (with Repeating), and reorders contracts in the plan order. It never stops a contract, and never adds or removes a product. |
| `/write/schedule` | Replaces one business's seven days of shifts; with `openAllHours`, also opens every day 0 to 24. Never at a headquarters. |
| `/write/undo` | Puts back what the last write of a kind changed, in this city session, where the game still holds what that write left. |

- **Approving a browser.** Every write needs `Authorization: Bearer <token>`, a token
  the game gives a browser once you allow it. The first write from a browser asks in the
  game, with the game's own confirm popup: "Allow Big Copilot to change your game?",
  naming the page's origin and the browser. **Allow** approves that browser for good, across
  game launches; **Deny**, Escape or opening the phone refuses, and a popup left for 60
  seconds closes itself. After either, that page waits before it may ask again: 10 seconds,
  then 30, then 120 for repeats within ten minutes, back to 10 after an approval. A confirm
  within a second of the popup opening counts as a Deny, because the game also confirms on
  its Confirm key. No popup is shown while the city map is open. The browser name the page
  sends is shown stripped of markup and invisible formatting characters. A token works only
  from the origin it was issued to. At most 10 browsers are kept (one approved but never
  used goes first, then the one used longest ago), and one unused for 90 days expires. **Forget approved
  browsers** in the mod's options withdraws every approval. Reads (`/health`, `/save`,
  `/refresh`) never need a token.
- **The game's own rules.** Every write is checked on the game's main thread against
  the rules the game's own screens enforce (build 3680 IL), and is all or nothing: one
  refused row and nothing is written. A dry run (`"dryRun": true`) runs every check and
  changes nothing; the board runs one when its confirm dialog opens.
- **Compare-and-set.** Each write carries what the board read from the last refresh
  (an amount, the shift print of a business); if the game has moved on since, the
  write is refused as `changed` and the board refreshes.
- **Not while you are looking at it.** A schedule write is refused while the BizMan
  schedule is open on that business (or the game's auto-fill is still filling it), an
  imports write while the purchasing-agent plan screen shows that contract or, for a
  reorder, while a headquarters' purchasing-agent list is on screen.
- **After a write** the mod marks the game as changed (as the game's own screens do),
  shows "Big Copilot updated … at …", and refreshes the served bytes so the board
  rebuilds from what the game now holds. It does not save the game.
- **Threading.** A write never runs while a refresh walk is in flight on the worker
  thread: the main thread turns the job away without touching anything, and the
  request asks again every 100 ms for up to three seconds before withdrawing it and
  answering `503 busy`. A write the main thread has started is always waited for and
  answered with its result.

## How a refresh runs

The main thread checks the guards (nothing saving, `CanSave()`, a loaded city) and
captures the in-game clock, then hands the whole job to a worker thread of its own.
That thread walks `SaveGameManager.Current` with a private `SerializationContext`
configured like the game's own helper — the policy
`Player.SaveSystem.SaveGameSerializationPolicy`, the error policy
`ErrorHandlingPolicy.ThrowOnErrors`, `DataFormat.Binary` — so the bytes are what the
game's `SerializeBinaryData` would write, and gzips them with the game's
`CompressBytes`. The game's own save serializes on the main thread (verified in the
IL of build 3680), so the mod is walking a graph the main thread is still changing: a
snapshot can therefore mix two moments a few hundred milliseconds apart, which a
dashboard tolerates, and a collection that changed under the walk makes
OdinSerializer throw. That walk keeps the previous bytes and retries once the
fifteen-second window lifts; two failed walks with nothing served between them
switch this city session to serializing on the main thread, where nothing moves
under the walk — a stall per refresh, logged as `… on the main thread`; after ten
such refreshes the worker gets one more chance (one more throw sends it back), and
loading a save starts afresh. With the option "Refresh when a building loads" on
(off by default, a backup), a building load (entering or leaving) serializes on the
main thread: the screen is black, the load is rewriting the state a walk would read,
and its stall is hidden anyway. One that finds a refresh already in flight is run
once the fifteen-second window lifts instead, on whichever path is on.

The log lines:

```
serialized in 231 ms on a worker thread (first)
serialized in 229 ms on the main thread (hour)
background serialize failed (hour): InvalidOperationException: …
2 background serializes in a row failed; serializing on the main thread; the worker gets another chance after 10 fallback refreshes.
trying the worker thread again after 10 fallback refreshes.
the worker thread failed again on its second chance; serializing on the main thread; the worker gets another chance after 10 fallback refreshes.
```

## Build and install (in the SDK's Unity project)

1. **Get the SDK**: `git clone https://github.com/hovgaardgames/bigambitions` and open
   it with Unity **2022.3.62f2** (Unity Hub will offer to install that version).
2. **Import the game DLLs**: the SDK's welcome dialog (Big Ambitions → Welcome →
   Import DLLs from Steam) wants the `Managed` folder of an installed game in the
   Windows layout, `<install>/Big Ambitions_Data/Managed`, with a
   `Facepunch.Steamworks.Win64.dll` in it. On Windows, Auto-detect finds the Steam
   install. On a Mac the game keeps its DLLs at
   `…/Big Ambitions.app/Contents/Resources/Data/Managed` and ships
   `Facepunch.Steamworks.Posix.dll` instead, so make a shim: a real folder
   `~/Library/Application Support/BigCopilotLink/dll-shim/Big Ambitions_Data/Managed`
   holding a symlink to each DLL in the bundle plus one named
   `Facepunch.Steamworks.Win64.dll` pointing at the Posix one, and give the dialog the
   shim's `Big Ambitions_Data` parent as Path. Never write inside the `.app`: it is
   signed.

   The SDK commits `BA_GAME_DLLS_IMPORTED` in `ProjectSettings/ProjectSettings.asset`,
   so a fresh clone opens with hundreds of "type not found" errors rather than greyed
   scripts, and the Welcome window cannot run until the import has happened once. If
   the dialog will not, do what it does: copy the 32 canonical DLLs into
   `Assets/_BaDependencies/GameDlls/`, give each a `.dll.meta` PluginImporter with
   `isExplicitlyReferenced: 1`, `validateReferences: 0`, Editor and Standalone enabled
   and the SDK's GUID (`md5("BAModTemplate.GameDllGuid:" + name.ToLowerInvariant())`),
   and call `GameDllImporter.Import(<shim parent>)` from a batch-mode editor method
   (`mod/build/BclBatch.cs` does). Without explicit referencing Unity auto-references
   the game DLLs everywhere and the game's `PlayerPrefs` type breaks the Addressables
   and VFX packages. Unity Hub must be running, or the editor stops for want of a
   licence.
3. **Link the folder in** as `Assets/Mods/BigCopilotLink/`, so the SDK project and this
   repo share the files:
   - macOS/Linux: `ln -s <repo>/mod/BigCopilotLink <sdk>/Assets/Mods/BigCopilotLink`
   - Windows (junction): `mklink /J <sdk>\Assets\Mods\BigCopilotLink <repo>\mod\BigCopilotLink`
4. **Create the manifest**: in the Project window, right-click the mod folder → Create
   → **Big Ambitions → Mod Manifest**. It is not in this repo because it is an editor
   asset. Enter:

   | Field | Value |
   | --- | --- |
   | ModId | `BigCopilotLink` |
   | DisplayName | `Big Copilot Link` |
   | Author | `Peter Hartwieg` |
   | Version | `0.2.0` |
   | Mod Assembly | drag `BigCopilotLink.asmdef` into the field |
   | Locales Folder | drag the `Locales` folder into the field; the option labels are keys in `Locales/en.json` |

5. **Build & Install**: menu **Big Ambitions → Mod Builder** → Build & Install. It
   validates, compiles, and installs into the game's `ModsLocal` folder. The SDK's
   installer derives that folder from .NET's `LocalApplicationData`, which Mono on a
   Mac maps to `~/.local/share/Hovgaard Games/Big Ambitions/ModsLocal`, while the game
   reads `~/Library/Application Support/com.Hovgaard-Games.Big-Ambitions/ModsLocal`.
   Bridge them once:
   `ln -s "$HOME/Library/Application Support/com.Hovgaard-Games.Big-Ambitions" "$HOME/.local/share/Hovgaard Games/Big Ambitions"`
   (the Mod Builder also honours an EditorPrefs override, `BAModBuilder.ModsLocalPath`).
   On a machine without the game, take the built folder out of the SDK's
   `Output/BigCopilotLink` and copy it to the game machine's `ModsLocal`.

   **Headless:** `mod/build/BclBatch.cs` and its asmdef, copied to
   `<sdk>/Assets/Editor/BclBatch/`, do the import, the manifest, the validation and
   Build & Install without the editor UI:

   ```
   /Applications/Unity/Hub/Editor/2022.3.62f2/Unity.app/Contents/MacOS/Unity \
     -batchmode -projectPath ~/bigambitions -executeMethod BclBatch.Run -logFile ~/bcl-build.log
   ```

   (no `-quit`: the script exits the editor itself when the job is terminal; on a Mac
   the Windows build module is not installed and that is fine, the packager's assembly
   build works and the bundle step is skipped because the mod has no assets).

Unity writes a `.meta` file next to every file in this folder; they are committed,
along with `ModManifest.asset`, because the GUIDs have to stay stable. The repo's
`.gitignore` keeps the built `.dll` out.

## Verify

Launch the game, enable **Big Copilot Link** in the Mods menu, load a save, then:

```
curl http://127.0.0.1:8322/health
```

Expect `{"ok":true,"schemaVersion":1,"modVersion":"0.2.0","source":"game",…,"writes":["uniforms","imports","schedule"],"paired":false}` and a
`[BigCopilotLink] serving the game to Big Copilot on http://127.0.0.1:8322/` line in
the player log (`%USERPROFILE%\AppData\LocalLow\Hovgaard Games\Big Ambitions\Player.log`;
on a Mac, `~/Library/Logs/Hovgaard Games/Big Ambitions/Player.log`), then, a few
seconds later, `[BigCopilotLink] serialized in N ms on a worker thread (first)`.
Every line the mod writes carries the `[BigCopilotLink]` prefix, so filter on it.

`stamp` is `""` for the first few seconds. Once it is not, the bytes are there:

```
curl -o live.hsg http://127.0.0.1:8322/save
python ba_dashboard.py live.hsg
curl -X POST -H "Content-Length: 0" http://127.0.0.1:8322/refresh
```

That writes `dashboard.html` from the running game. The `Content-Length` header
matters: Mono's `HttpListener` answers a body-less POST without one with `411` before
the mod sees it (browsers and Python send it on their own). On Windows use `curl.exe`
in PowerShell — plain `curl` is an alias for `Invoke-WebRequest`. In the game, F5 is
Quick Save, which the mod follows with a refresh of its own.

Verified on a Mac, build 3680 (22 Sep 2026): every endpoint as the contract says;
the board built from `/save` matched the board built from the game's own save of the
same paused moment line for line; the stamp moved at every game hour; Chrome, Safari
and Firefox linked from a local page. The bytes are not identical to the game's file
(one Odin reference id and a 367-byte block after the `Minute` field differ, likely
`CreateSaveSnapshot` versus serializing `Current`); nothing the board reads differs.

### Writes by hand

Ask for a token first; curl sends no `Origin`, so the popup names "a program on this
computer". Click **Allow** in the game within 60 seconds, then fetch the token (it is
answered once) and use it. `-d` and `--data-binary @file` set `Content-Length` for you:

```
curl -X POST -H "Content-Type: application/json" -d '{"name":"curl"}' http://127.0.0.1:8322/pair/request
curl "http://127.0.0.1:8322/pair/status?id=<requestId>"
curl -H "Authorization: Bearer <token>" http://127.0.0.1:8322/health
curl -X POST -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"dryRun":true,"sites":[{"address":{"street":"ba:street_secondavenue","number":12},"skills":null,"presetId":null}]}' \
  http://127.0.0.1:8322/write/uniforms
curl -X POST -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  --data-binary @imports.json http://127.0.0.1:8322/write/imports
curl -X POST -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"kind":"uniforms","dryRun":false}' http://127.0.0.1:8322/write/undo
```

The health call answers `"paired":true`. A POST with no body needs
`-H "Content-Length: 0"`, as for `/refresh`. In PowerShell use `curl.exe` and put the
body in a file: PowerShell's quoting mangles inline JSON.

### In-game checklist for 0.2.0

Built into `ModsLocal`, a save loaded, the board linked and the browser approved (item 1). After each apply,
check the notification, that `/health`'s stamp moved, and that the board rebuilt from
the new bytes.

1. **Approving a browser.** The mod options' labels, the popup and the notifications read
   as in `Locales/en.json`, not as raw keys.
   - *Approve.* The first write from the board shows "Allow Big Copilot to change your
     game?" with the page's origin and browser name; Allow, and the write goes through.
     `/health` from that page says `"paired":true`. Restart the game: the same browser
     writes without asking.
   - *Deny.* Deny: the page says it was not approved; asking again within 10 seconds
     answers 429, after that the popup shows again. Deny twice more: the waits grow to 30
     and then 120 seconds.
   - *Escape.* Escape (and, separately, opening the phone) while the popup is up counts as
     Deny.
   - *Expiry.* Leave the popup for 60 seconds: it closes itself and the page hears
     `expired`.
   - *The Confirm key.* Press the game's Confirm key within one second of the popup
     appearing: it closes and counts as Deny.
   - *Where it shows.* Ask while paused, inside a building and with BizMan open: the popup
     shows each time. With the city map open the page hears `cannot_pair` `no_ui`; close
     the map and ask again. In placement mode or the interior designer the page hears
     `cannot_pair` with the reason, and no popup appears.
   - *A second browser.* Another browser (or a private window) asks on its own; the first
     stays approved. A token copied from one origin to another answers 401.
   - *Forget.* Forget approved browsers: the notification names how many; the next write
     from each browser asks again.
2. **Uniforms.** On a shop with a uniform locker and the "No staff uniforms set"
   warning: dry run, then apply. The Uniforms window (BizMan → business → Settings)
   shows Default on every skill it offers that had none; a skill you had set keeps
   yours. The warning clears at once, not at midnight. Standing in the shop, staff at
   their stations change into the uniform. A shop without a locker answers
   `no_locker`.
3. **Imports across the lock window.** Change a running contract's amount on a weekday:
   applied, and the plan screen shows the new amount with the next Monday's delivery.
   Sunday after 20:00 (or Monday before 08:00): the same change answers `locked` with
   `reopens` on that Monday at 8, and nothing changes.
4. **A capped item with a backup contract.** Two contracts bring one item to one depot
   from two importers. A plain amount above the first importer's cap answers `over_cap`
   with `max` (the cap less what that importer already delivered of the item this week,
   urgent orders included) in the dry run. Reorder the two with `order`; the headquarters'
   purchasing-agent list shows the new order when it is opened again. With both on
   Smart Delivery, check after Monday's delivery that the second contract brought only
   what the first left short (scope section 7 item 5).
5. **A reactivated one-off.** A stopped contract without Repeating: `activate: true`
   switches it on with Repeating on and the next Monday as its delivery day; the dry
   run's `nextDeliveryTotal` matches the plan screen's next-delivery total. One with
   every amount at 0 answers `no_amounts`.
6. **Schedule.** Write a roster to a shop, then open BizMan → Schedule on it and
   compare every day with the board's plan: same people, stations and hours; cleaning
   stations carry the cleaning type. Anyone left without a shift gets the "employee
   idle" to-do. Standing in the shop, the stations staff up for the current hour. With
   the schedule screen open on that shop the write answers `screen_open`; on another
   shop it goes through.
7. **A partial write, then the holes.** A plan that needs a hire: the write sends only
   the assigned staff's shifts and the board says how many people to add. Hire and
   assign them in game, let the board refresh, write again: the holes fill, and the
   second write's `expect` matched the first write's result.
8. **Full cover.** `openAllHours` on a shop opens every day 0 to 24 in BizMan. Any
   schedule write at a headquarters answers `headquarters`.
9. **Undo, each kind.** After each of 2, 3 and 6, undo: uniforms go back to unassigned
   only where they still hold the preset the write set; amounts, running state,
   Repeating, next delivery day and plan order come back; the schedule and, after a
   full-cover write, the opening hours come back. Change one of the written values by
   hand first and undo answers `changed`; so does a schedule undo after a person it
   would put back was moved to another business. A field the write did not touch (say,
   Repeating on a running contract whose amount it changed) may be changed by hand
   without blocking the undo, and the undo leaves it as you set it. A second undo answers `nothing_to_undo`, and
   so does any undo after loading another save.
10. **Busy.** With "Refresh every game hour" on, apply just as the hour turns: the
    write waits for the walk (up to three seconds) and applies, or answers `503 busy`
    with nothing written; never a half-written state.

## Publish to the Workshop

The Workshop item is 3806322395, owned by Peter's Steam account; its page, art and
description come from [`mod/workshop/`](../workshop/). To publish a new build: put the
built `BigCopilotLink.dll` and `Locales/` in the game's `ModsLocal/BigCopilotLink/`
with `thumbnail.png` beside them (the Mod Creator takes the thumbnail from the mod
folder's root, 1 MB at most), then in the game's main menu open **Mods → Mod Creator**,
choose **Edit mod** on the item under **My created mods**, select the mod folder, fill in **Change Logs** and
set **Target Build** to the game build it was built against, and upload. The
description is Steam BBCode: `mod/workshop/description.bbcode`, pasted whole.
`node mod/workshop/render.cjs` re-renders the thumbnail and `how-it-works.png` (an extra
image added on the Workshop page under Add/edit images & videos) from `art.html`.

## Options

In the game's mod options, under **Big Copilot Link**:

| Option | Default | What it does |
| --- | --- | --- |
| Serve the game to Big Copilot | on | Off stops the listener; the mod stays loaded and costs nothing. |
| Port | 8322 | 8322–8325. 8321 belongs to the MCP bridge and 8765 to the Companion mod. Changing it restarts the listener. |
| Refresh when a building loads | off | A backup: the hourly and game-save refreshes already keep the board fresh with no cost, so this buys at most one game hour. On, entering or leaving a building fades the screen to black while the game loads the other side and the serialize runs on the main thread under that black, about 250 ms added to the load that you do not see. |
| Refresh every game hour | on | The refresh runs on a worker thread, so it costs nothing you can see. If the mod has fallen back to the main thread (see the log), it is a short stall every game hour, a minute of play at normal speed, until the worker is tried again; switch it off here if that bothers you. The other triggers stay: a completed game save, `POST /refresh`, a five-minute floor, and a building load if that option is on. |
| Copy address | — | Puts `http://127.0.0.1:<port>/` on the clipboard. |
| Forget approved browsers | — | Withdraws every browser's approval to write (see "Approving a browser"); a notification says how many. |

Nothing refreshes unless something fetched `/health` in the last 120 seconds, so an
installed mod with the board closed does no work at all.

## The game members it uses (build 3680)

Read by reflection and confirmed by the Mac compile. Public unless noted.

| Member | Used for |
| --- | --- |
| `SaveGameManager.Current` (static `GameInstance`), fields `Day`, `Hour`, `Minute`, `Money`, `characterId`, `SaveGameName`, `buildNumberAtLastSave` | health, the serialize |
| `SaveGameManager.SavingGameInProgress`, `HasChangesSinceLastSave()` | the save-completed edges; the second dereferences the player and throws once on exit to desktop, which the pump swallows |
| `SaveGameManager.CanSave()` | **private static**: called by reflection, looked up once; falls back to the four public states below |
| `OdinSerializer.SerializationUtility.SerializeValue<GameInstance>(instance, stream, DataFormat.Binary, context)` with a private `SerializationContext` (policy `Player.SaveSystem.SaveGameSerializationPolicy`, error policy `ErrorHandlingPolicy.ThrowOnErrors`) | the bytes, as `SaveGameSerializationHelper.SerializeBinaryData` makes them |
| `SaveGameSerializationHelper.CompressBytes(byte[])` | the gzip |
| `TimeHelper.CurrentDay/CurrentHour/CurrentMinute` | the clock |
| `GameVersion.GetCurrent().buildNumber` | `build`; `GetBuildVersionString()` is **private** |
| `UI.InteriorDesigner.InteriorDesignerUI.IsOpen`, `BigAmbitions.PlacementSystem.PlacementSystem.IsInPlacementMode`, `CasinoBoatManager.IsOnCasinoBoat`, `PlayerActivity.PlayerActivityUI.IsPanelOpen` | the refusal reason, and the fallback when `CanSave` is not found |
| `BAModAPI`: `RegisterModClass`, `ModEntryOnCityLoad`, `IModBigAmbitions`, `ModContext`, `IModLogger` | the entry point |
| `BigAmbitions.Mods.ModOptions`, static `OptionsService.Register/RemoveModOptions` | the options panel (compiles; the panel itself is not yet checked in-game) |
| `SaveGameManager.MarkChange()`, `UI.Notification.Notifications.Show(...)` | after every write; Forget approved browsers |
| `HudConfirm.Show(LanguageChangeEventDataHolder, LanguageChangeEventDataHolder, Action, Action, string, string, bool, bool)`, `HudConfirm.isOpen`, `onShow`, `onClose`; `Localizor.LocalizorManager.Localize(key, args)`; `HudConfirmUi._onConfirmAction` (**private**, reflection, to tell our popup from another); `UnityEngine.PlayerPrefs` (not the game's own `PlayerPrefs` class) | approving a browser. `Show` confirms unseen when no popup UI is registered (`onShow` null) and drops the call when one is already open, so the mod checks both first. Also `CityMap.IsOpen` (no popup over the map), `LocalizorManager.IsLocalizedKey` (a browser name must not expand to game text) |
| `GameInstance.BuildingRegistrations`, `employeePresets`, `importPartnerships`; `BuildingRegistration` fields `StreetName`, `StreetNumber`, `RentedByPlayer`, `businessTypeName`, `BusinessName`, `itemInstances`, `uniformsBySkill`, `scheduleDays`, `GetAssignableItems(list)` | finding and reading the target. A registration is found by searching the list, never with `BuildingHelper.GetBuildingRegistration`, which creates one for a building that has none |
| `BusinessTypeHelper.GetData(reg).employeePrimarySkills`, `BuildingTypeHelper.GetData(reg).requiredBuildingSkills`, `ItemsGetter.GetByName` + `TagRef.Itemtag.isuniformlocker`, `CustomerDemandHelper.ReloadCachedFulfilled(reg)`, `BuildingManager.Instance.onUniformChanged`, `GameEvent.Invoke` | uniforms, as `SetUpUniformsWindow` does it |
| `ImportPartnership` fields and `NextDeliveryTotal`, `GetDiscount`, static `GetItemAmountOrderedThisWeek`; `ImportProduct.Price`; `DeliveryHelper.CanModifyContract`, `GetNextDeliveryDay`, `IsLockPeriod`, `ShouldLimitImporterMaxAmount`, `AreWholesaleAndImportLimitsDisabled`; `ProductMarketHelper.IsProductInMarketEvent`; `EmployeeHelper.GetEmployeeById(id, false)` | imports. `ImportPartnership.GetMaxOrderAmountPerImporter` is **private static**: by reflection, with its build-3680 body (the item's `maxOrderAmountPerImporter`, ×0.66 rounded in a shortage) as the fallback |
| `PurchasingAgentPlanUI._currentImportPartnership` (**private**, reflection), reached through `UIs.Instance.fullMenu.bizMan.business.purchasingAgentsPlanList.purchasingAgentPlanUISettings` | "is the plan screen open on this contract" |
| `UIs.Instance.fullMenu.schedule` (`BizManSchedule`), `ScheduleHelper.Business`, `BizManSchedule._activeAutoFillers` (**private**, reflection), `ScheduleAutoFiller.Registration` | "is the schedule screen open on this business, or its auto-fill running" |
| `ScheduleDay`, `WorkShift`, `OpeningHourSlot` fields; `ScheduleHelper.IsCleaningStation(ItemInstance)`; `EmployeeInstance.UpdateWeeklyHoursAndDays`, `UpdateAssignedWorkStationItems`, `IsAssignedToAnyWorkShift`, `UnAssignWork`, `AddTodoTask`, `HasAnySkillWithTag`; `BusinessSecurityHelper.UpdateSecurityLevel`; `TasksUI.forceCheckForCompletedTodoTasks`; `CustomerEntriesHelper.UpdateCustomerEntriesForPlayerBusiness`, `BusinessHelper.CheckIfTheaterHasNoActors`, `IsMissingEmployeeTaskActive`, `ForceRecheckMissingEmployeeAlert`, `GlobalEvents.onBuildingRegistrationChange` | the schedule. `ScheduleHelper.UpdateEmployeeAfterWorkShiftChange` is **private**, so it is re-implemented from its IL; its `UpdateHQPlans` step never applies, because headquarters are refused |

Whether the game restores persisted option values by calling the change callbacks at
registration is unverified. It is safe either way: restarting the listener is
idempotent.
