# Big Copilot Link — the game mod

This mod lets [Big Copilot](https://bigcopilot.com) read the game you are playing
instead of a save file you picked by hand. While a city is loaded it asks the game to
serialize itself with the game's own save call and serves the resulting bytes — a
`.hsg` exactly as the game would have written it — over loopback HTTP. It holds no
model of the game and changes nothing in it: every refresh is the same serialize the
game does when it saves.

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
- **Nothing on disk.** The mod writes nothing to disk: the bytes are produced in
  memory and only ever leave the process over the loopback listener.

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
fifteen-second window lifts; two consecutive failures switch the session to
serializing on the main thread, where nothing moves under the walk — a stall per
refresh, logged as `… on the main thread`.

The log lines:

```
serialized in 231 ms on a worker thread (first)
serialized in 229 ms on the main thread (hour)
background serialize failed (hour): InvalidOperationException: …
2 background serializes in a row failed; serializing on the main thread for the rest of this session.
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
   | Version | `0.1.0` |
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

Expect `{"ok":true,"schemaVersion":1,"modVersion":"0.1.0","source":"game",…}` and a
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

## Options

In the game's mod options, under **Big Copilot Link**:

| Option | Default | What it does |
| --- | --- | --- |
| Serve the game to Big Copilot | on | Off stops the listener; the mod stays loaded and costs nothing. |
| Port | 8322 | 8322–8325. 8321 belongs to the MCP bridge and 8765 to the Companion mod. Changing it restarts the listener. |
| Refresh when a building loads | on | Entering or leaving a building fades the screen to black while the game loads the other side; the serialize runs under that black, so it costs nothing you can see. |
| Refresh every game hour | on | The refresh runs on a worker thread, so it costs nothing you can see. If the mod has fallen back to the main thread (see the log), it is a short stall every game hour, a minute of play at normal speed; switch it off here. The other triggers stay: a completed game save, a building load, `POST /refresh`, and a five-minute floor. |
| Copy address | — | Puts `http://127.0.0.1:<port>/` on the clipboard. |

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

Whether the game restores persisted option values by calling the change callbacks at
registration is unverified. It is safe either way: restarting the listener is
idempotent.
