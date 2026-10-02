# Bug report with save: scope

2 October 2026. Agreed with Peter in conversation, after reviews by Fable and Astra. Built
in the pull request for issue #239; "Decided while building" at the end records what this
scope left open. The working reference is `docs/community-features.md`, "Bug reports".

Today the footer's "Bugs and feedback" link (`FEEDBACK_URL`) goes to the Discord support
channel. That loses the two things that make a report useful: the save that broke and the
error. The worker prints the whole Python traceback to the console (`console.error(whole)`
in `web/worker.js`) and shows the player only its last line.

This adds a form that files a GitHub issue and keeps the save in private storage.

## The flow

1. The player clicks **Report a bug**. The form has a text box for what went wrong, with
   "This text is posted publicly on GitHub" under it, and two boxes, both unticked:
   - Attach my save
   - Attach technical details
2. Send posts to `POST /api/report`. The Worker:
   - writes the attachments to a private R2 bucket, in a folder of its own
   - opens an issue in `PeterHartwieg/big-copilot`, labelled `bug-report`
3. The form shows a link to the new issue.
4. Peter triages it like any other issue and downloads the folder named in it when he
   needs the save. R2 deletes the folder after 30 days; the issue stays.

The repo is public, so the save never goes in the issue (AGENTS.md: never attach a save
to an issue). The issue holds only what is safe to publish.

## What goes where

| | Issue (public) | R2 (private, 30 days) |
| --- | --- | --- |
| The player's text | yes | |
| Site build, game build, browser family, source (folder, file, game link) | yes | yes |
| Last line of the error | yes | |
| The full traceback | | yes |
| A few settings: language, theme, platform | | yes |
| The save (`.hsg` as read, gzip, about 5 MB) | "save attached: yes" and the folder name | yes |

The full traceback stays private because it can hold the character's name: the game
link's file is `<character>-live.hsg` and the worker's path includes it.

Settings go through a short allowlist, never the whole of localStorage. localStorage
holds `ledger_history` (the market and cash history) and the board keeps typed names and
recent searches there too; none of that is sent.

## Browser side

- **Where the button goes.** First, the "Could not read the save" message: the catch in
  `buildFrom` in `web/app.js`. That is the case that matters, and there the board may not
  exist, so the form is a new `web/report.js` (with `web/report.css`) that `web/app.js`
  loads on demand. Second, the footer: Help & feedback already builds its button from
  the footer's `data-sf-feedback` link (`pxHelpHtml()`), so one footer control in
  `ba_dashboard.py` covers both the landing screen and the board.
- **Keeping the failed save.** The page does not hold the bytes it built from: it passes
  the buffer to the worker, and re-reading the `File` can return a newer save or fail
  (`NotReadableError`). On a failed build the worker posts the bytes back with the error,
  and the page keeps them until the next build.
- **Keeping the traceback.** The worker posts the whole traceback with its `failed` reply,
  not only the last line. The page keeps the latest one in memory, never in storage.
- **Build stamp.** Use the loaded page's `LEDGER_BUILD`, not a fresh fetch of
  `version.json`, which can be newer than the code that failed.
- **Without the API.** When `/api/report` answers 503 or fails, the form says so and
  points to the Discord channel instead of failing silently.
- **The CLI's `dashboard.html`** has no `web/app.js`; there the footer link stays the
  plain Discord link.

## Worker side

One route in `server/worker.mjs`, `POST /api/report`, taking `multipart/form-data`: a
`report` JSON part, an optional `save` part and an optional `details` part.

- **Reading the body.** It cannot go through `readJson`, which is JSON-only and capped at
  1 KiB. Check `Content-Length` first and reject anything over 8 MB before reading, then
  check each part's name and size. Text capped at 5,000 characters.
- **The save is an untrusted file.** Store it as it came. No gzip check: a broken save is
  exactly what gets reported. Never decompress it in the Worker.
- **Rate limit.** A `REPORT_LIMITER` binding, a few requests a minute per IP. The binding
  counts per 10 or 60 seconds and per Cloudflare location, so it is a burst guard, not a
  daily cap. If spam shows up, add a daily cap counted in D1, then Turnstile.
- **Order.** Write R2 first under a random folder name, then open the issue. If GitHub
  fails, delete the folder and answer 503, so no save sits in R2 without an issue.
- **GitHub token.** A fine-grained token with Issues read and write on this one repo, in
  a Worker secret (`GITHUB_REPORT_TOKEN`), with an entry in `.dev.vars.example`.
- **No logging.** `test_worker_code_logs_nothing` forbids `console.` in `server/`. Keep the
  existing catch-all that answers a generic 503.

`wrangler.jsonc` gains the R2 binding (bucket `big-copilot-reports`), the limiter and the
secret's name. The bucket's lifecycle rule deletes objects after 30 days; set it once with
`wrangler r2 bucket lifecycle add`. No D1 table and no cron.

Downloading a report: `wrangler r2 object get big-copilot-reports/<folder>/save.hsg`
into a gitignored `reports/` folder. Saves stay out of the repo.

## Privacy notice

Three sentences in `web/privacy.html` stop being true and get a "unless you send a bug
report" exception: saves "are never sent to us" (section 2), the game link's "nowhere
else" (section 2) and settings that "do not leave your device" (section 4). A new section
covers bug reports:

- what is sent, and only when the player ticks it
- the text and the safe details become a public GitHub issue; GitHub is a recipient
- the save and private details are kept at Cloudflare (R2) for 30 days
- legal basis: consent, Art. 6(1)(a) GDPR, given by sending. Withdrawal by email, naming
  the issue, deletes the R2 folder and the issue.

`docs/community-features.md` says save bytes never enter API requests; that becomes
"never enter the community API's requests". Bump "Last updated".

## Tests and wiring

- `npm run test:community`: the route's size cap, part checks, rate limit, R2 write, the
  GitHub call (mocked), and the R2 cleanup when GitHub fails. The Miniflare harness gets
  an R2 bucket.
- A Node test for `web/report.js`: nothing is attached unless ticked; the allowlist keeps
  `ledger_history`, searches and the approval token out; the full traceback is not in the
  issue body.
- `tests/test_privacy_promises.py`: add `report.js` to `SCRIPTS`.
- `tests/global_names.test.cjs`: add `web/report.js` to its file list; prefix its names `br`.
- `build_web.py`: add `web/report.js` and `web/report.css` to `STAMP_INPUTS`.
- i18n: every sentence through `tt()`, with the i18n suites.

## Decided while building

- **The error line needs the details box.** The issue gets the error's last line only
  when "Attach technical details" is ticked, so an unticked form sends nothing but the
  text and the safe details. The Worker rejects an `error` field without a `details` part.
  The page masks the save's file name, the company, any `/save/` or home-folder path,
  any quoted value (a `KeyError` can quote a name from the save) and any run of hex
  bytes (the save parser prints the bytes around a fault, and those can spell a name)
  before sending, and the Worker masks the same again. When the line on screen is that
  hex window, the page takes the traceback's last line that says something instead.
- **"Published", not "posted".** The board's vocabulary rule bans "post", so the form
  says "This text is published on GitHub, where anyone can read it."
- **No save without an issue, even when the request dies.** The Worker runs the writes,
  the issue and the cleanup under `ctx.waitUntil()`, so a closed tab does not cut them
  short; a failing delete is tried three times. After the issue opens it writes
  `issue.json` into the folder, and the existing daily cron deletes every folder older
  than an hour without one. The 30-day lifecycle rule stays the last net. This adds work
  to the cron the scope said not to add; the alternative was a save that could outlive
  its failed report by 30 days.
- **A save on a working board.** The footer's form can attach a save too. The page asks
  the Python worker for a copy of the save it holds (a new `held` message in
  `web/worker.js`); the same message, asked for the build, parses a failed save once
  more to read its game build. The board's own build comes from the payload
  (`meta.build`), a linked game's from `/health`.
- **What R2 holds.** Per report folder: `report.json` (the public facts without the
  player's text), `details.json`, `save.hsg` and, once the issue is open, `issue.json`
  (its number and address). With nothing ticked the Worker writes no folder.
- **A failure after the read.** When Python read the save but the board could not draw
  it, the reader still holds the save; the form asks it for a copy, as on a working
  board.
- **The form's own copy.** The open form holds the save and traceback while it is open
  and lets go when it closes. A send in flight keeps the form open (Cancel and Escape
  wait) and sends what it was started with.
- **The issue.** Title `Bug report: ` plus the text's first line, cut at 60 characters.
  The text and the error line sit in fenced code blocks, so links, images and mentions
  in them do not render. Every other value comes from an allowlist or a pattern.
- **Where the control lives.** The footer's Report a bug button is on the site's pages
  only (`footer_html(site=True)`), next to the Discord link, which stays. Help & feedback
  copies it; `#reportBtn` in the source strip shows whenever the strip reports a failure.
- **Limits.** Three reports a minute per IP (`REPORT_LIMITER`). An over-8 MB or
  length-less body is refused before it is read; the report part is capped at 16 KiB,
  the details at 256 KiB, the error line at 500 characters.
- **The secret's name.** `wrangler.jsonc` lists both secrets under `secrets.required`.

## Later

- **The game's log.** A third box where the player drops in `Player.log`. It holds the
  home path and the SteamID64, so it is redacted before sending and goes to R2 only. The
  mod could serve it as an additive endpoint announced by a capability, keeping
  `schemaVersion` 1 (`docs/game-link-api.md`).
- **CLI.** `python ba_dashboard.py --report` for players who use the CLI.
