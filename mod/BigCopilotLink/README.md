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
- **Saves made with the mod enabled are marked as modded by the game**, the same as
  with any other mod.
- The uncompressed copy the serializer writes lives in the game's temporary cache and
  is deleted as soon as it has been gzipped.

## Build and install (in the SDK's Unity project)

1. **Get the SDK**: `git clone https://github.com/hovgaardgames/bigambitions` and open
   it with Unity **2022.3.62f2** (Unity Hub will offer to install that version).
2. **Import the game DLLs**: follow the SDK's welcome dialog. It wants the `Managed`
   folder of an installed game — on Windows
   `…/steamapps/common/Big Ambitions/Big Ambitions_Data/Managed`. On a Mac without the
   game installed, copy that whole `Managed` folder over from the Windows machine and
   point the importer at the copy. Until this is done, the mod's code is excluded from
   compilation by the `BA_GAME_DLLS_IMPORTED` define constraint in
   `BigCopilotLink.asmdef` and the scripts show up greyed out with no errors at all —
   that symptom means the import, not the code.
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

5. **Build & Install**: menu **Big Ambitions → Mod Builder** → Build & Install. It
   validates, compiles, and installs into the game's `ModsLocal` folder. On a machine
   without the game, symlink `ModsLocal` to somewhere you can copy from, or take the
   built folder out of the SDK's build output and copy it to the game machine's
   `ModsLocal`.

Unity writes a `.meta` file next to every file in this folder. Commit them — the GUIDs
have to stay stable — along with the generated `ModManifest.asset`. The repo's
`.gitignore` keeps the built `.dll` out.

## Verify

Launch the game, enable **Big Copilot Link** in the Mods menu, load a save, then:

```
curl http://127.0.0.1:8322/health
```

Expect `{"ok":true,"schemaVersion":1,"modVersion":"0.1.0","source":"game",…}` and a
`[BigCopilotLink] serving the game to Big Copilot on http://127.0.0.1:8322/` line in
the player log (`%USERPROFILE%\AppData\LocalLow\Hovgaard Games\Big Ambitions\Player.log`;
on a Mac, `~/Library/Logs/Hovgaard Games/Big Ambitions/Player.log`). Every line the
mod writes carries the `[BigCopilotLink]` prefix, so filter on it.

`stamp` is `""` for the first few seconds. Once it is not, the bytes are there:

```
curl -o live.hsg http://127.0.0.1:8322/save
python ba_dashboard.py live.hsg
```

That writes `dashboard.html` from the running game. On Windows use `curl.exe` in
PowerShell — plain `curl` is an alias for `Invoke-WebRequest`.

## Options

In the game's mod options, under **Big Copilot Link**:

| Option | Default | What it does |
| --- | --- | --- |
| Serve the game to Big Copilot | on | Off stops the listener; the mod stays loaded and costs nothing. |
| Port | 8322 | 8322–8325. 8321 belongs to the MCP bridge and 8765 to the Companion mod. Changing it restarts the listener. |
| Refresh every game hour | on | Off leaves the other triggers: a completed game save, `POST /refresh`, and a five-minute floor. |
| Copy address | — | Puts `http://127.0.0.1:<port>/` on the clipboard. |

Nothing refreshes unless something fetched `/health` in the last 120 seconds, so an
installed mod with the board closed does no work at all.

## Notes for the first compile

Three things in here were written against an API surface that could not be checked on
the machine that wrote it. If the Mod Builder complains, look at these first.

- **`OptionsService`.** The calls are `OptionsService.Register(context.ModId, options)`
  and `OptionsService.RemoveModOptions(_context.ModId)`, copied from the SDK's own
  `Assets/Mods/Example-Options` mod, where they are static. A reflection read of build
  3680 listed them as instance methods on a class with no public constructor. If they
  are instance methods, these two calls need the instance the game holds, and this is
  the only file that has to change (`LinkMod.RegisterOptions` and `OnUnloadAsync`).
- **Option labels are literal English.** The SDK example passes localization keys and
  ships a `Locales/` folder; this mod ships none, on the assumption that an unknown key
  renders as itself. If the panel shows bare keys, add `Locales/en.json` and swap the
  strings for keys.
- **`build` comes from the version string.** There is no verified member holding the
  build number, so `HealthState` parses the trailing integer out of
  `GameVersion.GetCurrent().GetBuildVersionString()` and falls back to
  `SaveGameManager.Current.buildNumberAtLastSave`, which reads 0 until the player's
  first save. If `/health` reports a `build` of 0 or something odd, that parse is why.

Whether the game restores persisted option values by calling the change callbacks at
registration is also unverified. It is safe either way: restarting the listener is
idempotent.
