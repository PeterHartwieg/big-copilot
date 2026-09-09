# Ledger Release Plan

How the Big Ambitions ledger goes from one machine to anyone: a web page that runs the
analysis inside the browser. Nothing is uploaded. Hosting on Cloudflare. Three steps,
after a short proof that the browser integration works.

Written 9 Sep 2026, simplified the same day, then reviewed by Codex (gpt-6-astra). This
is a small aid for a game, not a live system, so anything that only pays off under load
or at scale is deferred until someone asks for it.

## What was measured

On the current save: 4.7 MB compressed, 50 MB decoded, 385,467 objects.

| Step | Native Python | Pyodide (browser Python) |
| --- | --- | --- |
| Parse the save, before the string cache | 2.3 s | 3.2 s |
| Parse the save, after the string cache | 1.6 s | 1.8 s |
| Extract and render | 0.1 s | 0.2 s |
| Runtime boot | none | 1.2 s in Node; first visit downloads 6.3 MB compressed, cached after |
| Twelve rebuilds in a row | — | 2.0 s each, memory plateaus at 345 MB, no growth |

The string cache is done (`ba_save.py`). Output is identical across seven recent saves.
Both Python files import and run under Pyodide unchanged in Node; the browser side
(worker, drop zone) is what step 0 proves.

## The seam

`extract(load_save(path), names, history_path)` then `render(data)`. Everything else is a
wrapper. The page's JavaScript touches the local server in six places, all in the
template: fetching `stamp`, fetching `data.json`, and posting a factory-line name. Those
become one small data-source object with two operations, "give me the data" and "name
this line", with two implementations: the local server, and a Web Worker running Pyodide.
The browser board is generated from the existing template, never a second copy of it.

## Decisions

| Question | Decision | Why |
| --- | --- | --- |
| Hosting | Cloudflare Workers with static assets, assets-only, deployed with one `wrangler deploy` from the laptop to the free workers.dev address | Asset requests are free and unlimited; no CI, no tokens, no domain to buy until the tool has users |
| Browser Python | Pyodide from its CDN, version pinned in the URL | One script tag; no 14 MB of runtime in the repo |
| Download | None at launch. The README shows the one command to run from source | The page serves everyone; an exe brings two OS builds, CI, and signing warnings for a handful of users |
| Live mode | A firm second release. First release is drop-a-file only | Remembered folder permissions, polling, reconnecting after reload and recovery are real work; drop-a-file is enough to publish and learn |
| History and locale | Kept as strings in localStorage on the main thread, sent to the worker before each rebuild, saved from the worker's reply | localStorage is not available inside a worker. History is 45 KB and the locale 820 KB today; catch a quota failure without losing the board |
| Neighbourhood badges | Hidden when a business name has no `[XX]` prefix | No table to build or maintain; a user who wants badges uses the prefix |
| Licence | MIT | Same as the game's own modding SDK |

## Steps

### 0. Prove the browser slice (half a session)

The one unproven piece is the browser itself, so it goes first, before any prep work
that assumes it.

- A throwaway page: a worker that loads Pyodide, imports both files as modules (never
  runs `main`, never touches the watcher or server), takes a dropped save, sets the
  virtual file's modification time from the browser file's `lastModified` (the "saved"
  stamp reads it), runs extract, and posts the data back as a JSON string, not a proxy.
- Rebuild the same save five times and watch the worker's memory.

Check: a board renders from a dropped save in Chrome and Firefox; memory levels off.

### 1. Prep (one session)

- Version guard: read `buildNumberAtLastSave`, print the build the tool was verified on
  (3674), and turn a missing field into a message naming the field, the game build and
  the tool version. On failure the page keeps the last good board.
- Locale check: the locale supplies recipes and station capacities, not only labels.
  Validate it once and mark the dependent views unavailable when it is missing.
- Escape save-derived text: `</` inside the embedded JSON, and the masthead title set
  as text, not HTML.
- Decouple line naming from the live flag, so the browser board can name lines without
  polling.
- Hide the neighbourhood badge when a name has no prefix.
- `check_saves.py`: parse and extract every `.hsg` under all 16 character folders, plus
  spot-checks of a few known numbers on an early-game save and a factory save, since a
  parse that succeeds can still produce plausible wrong figures.
- README: neutral product name; the artifact link and Costy Co examples out; one command
  to run from source, passing the save folder as the existing positional argument.
- `git init`, MIT licence, `.gitignore` for saves and history, push to GitHub.

Check: the save check passes on all 16; the watcher runs unchanged.

### 2. The page (the real work)

- `web/index.html` is generated from the template with the worker data source; the
  landing copy sits above the board. `web/worker.js` is step 0's worker, tidied.
- Main thread: drop zone; "Pick en.json" once, cached; a progress line during the first
  runtime download; history and locale handed to the worker and saved from its reply;
  serialised rebuilds and a stale-or-error status line, as the watcher has today.
- Landing copy: what it is, what it never does, one screenshot, the source command.

Check: drop a save in Firefox and get a board; drop a second save and see it update in
place with scroll and tab kept.

### 3. Deploy and tell people (an hour)

- `wrangler.jsonc` with `assets.directory = web` and no `main`; `npx wrangler deploy`.
- One post on the official forum's Mods category with the screenshot and the link.
- Watch the first reports. A save that fails is a job for the version guard.

Check: a cold load from another network renders a board in under ten seconds.

### Second release: watch the folder

"Watch my save folder" through the File System Access API, Chromium only. The handle is
kept in IndexedDB, and permission is re-requested on reload with a one-click reconnect,
since a stored handle does not keep its permission. The newest `.hsg` is polled by
modification time every 5 s with the same settle check the watcher has now.

## Deferred until someone asks

- A downloadable exe, and with it CI builds, path discovery for macOS and Proton, and
  code signing.
- A custom domain, Git-connected deploys, a `_headers` cache file, analytics.
- The package split and `pyproject.toml`.
- A street-to-neighbourhood table for the 39 street slugs.
- IndexedDB history with export and import.
- An issue template.

## Risks accepted

- **Game patches.** The format is reverse-engineered. The version guard reports a
  renamed field; it cannot see a field whose meaning changed. The 16-folder check and
  the spot-checks are the defence.
- **One CDN.** If the Pyodide CDN is down, the page is down. Vendoring is a folder copy
  if that ever matters.
- **Browser-only history.** Clearing site data clears sixty days of trend. History
  grows with characters and named recipes, not only days; the quota failure is caught.
- **Memory.** About 345 MB in the worker while a board is open. Fine on a gaming PC.
- **CPU in the browser.** A worker cannot lower its priority as the script does. A
  two-second burst per rebuild.

## Only you can do these

- Choose the product name. It does not block steps 0 to 2, only the README wording.
- Create the GitHub repository; log wrangler into your Cloudflare account.
- Post on the forum.

## What the second opinion changed

Codex agreed the three-step shape is proportionate and that the data-source shim is
the right seam. It added the browser proof as step 0, the modification-time and
JSON-not-proxy details in the worker, main-thread persistence, the locale check, the
escaping of save text, the spot-checks, the last-good-board rule, and the reconnect
behaviour for a stored folder handle. It moved live mode to a firm second release and
noted that the folder flag the first draft mentioned does not exist. Its memory concern
was tested and closed with the twelve-rebuild figure above.

## Status, 9 September 2026

Steps 0, 1 and 2 are done. Step 3 waits on two logins that are yours.

Done and checked:

- Step 0: a dropped save builds a board in the browser in about 4 s; twelve rebuilds
  plateau at 345 MB; a second drop keeps the page and scroll position; naming a line
  rebuilds in under 4 s; history (22 KB) and the game text (820 KB) are remembered in
  localStorage. Checked in the app's Chromium pane; Firefox not yet tried.
- Step 1: version guard with `MIN_BUILD = 3540` and `VERIFIED_BUILD = 3674`
  (`safe_extract`, `SaveShapeError`); the masthead notes a missing locale or a newer
  game build; the save name is set as text and `</` is escaped in the embedded JSON;
  naming goes through the data source, not the live flag; badges only with a prefix;
  `check_saves.py` reports 17 supported saves OK, 40 too old and skipped, spot-checks
  pass; MIT licence, `.gitignore`, `git init`.
- Step 2: `build_web.py` writes `web/index.html` from the same template with the
  landing copy and the worker source; `web/app.js` and `web/worker.js` are the page and
  the Pyodide worker (a module worker: the app's browser pane refuses a classic
  cross-origin importScripts, and every current browser supports the module form).
  The local `--watch` server runs unchanged against the same page.

Done later the same day, after your logins: deployed to
https://ba-ledger.peter-hartwieg.workers.dev (assets-only Worker `ba-ledger`), pushed to
https://github.com/PeterHartwieg/big-ambitions-ledger, page URL in the README, source
link on the page. The Cloudflare skills plugin was installed into Claude Code as
Cloudflare's agent-setup page instructs.

Left for you: the forum post. Not yet done, by choice: a test in Firefox and Safari, and
the second-release folder watcher.

UI round, 9 Sep afternoon: Codex built mockup/ui-mockup.html; its header, landing, return-visit,
reading and error states are live. Not yet ported: its Today tiles and findings grid.

Domain, 9 Sep evening: bigcopilot.com bought on Cloudflare Registrar and attached to the Worker
as a custom domain (apex and www) through wrangler.jsonc routes; the workers.dev address still works.
