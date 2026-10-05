# Community features

Community translation suggestions and votes use the same Worker and D1 binding
with separate tables and routes. Their phrase search, selection, moderation and
retention rules are in [Community translations](community-translations.md).

The hosted dashboard shows an approximate online count and lets visitors vote on
the ideas in `server/features.json`. The ballot is empty for now: every idea on it
has shipped and left it (Find a location on 15 September 2026, Optimize staffing on
20 September 2026, Supply chain for factories not running 24/7 with Supply by
object's Demand sizing, Multilingual support as the footer's Language on 27
September 2026, and Time to break even as the Payback column of Businesses ›
Results on 28 September 2026). The vote dialog says so when the list is empty. The
count means
dashboard tabs seen in the last ten minutes, not verified people or players
currently in the game. Votes help prioritise work; they are not release promises.
The count paints into the masthead's live status, replacing the "In browser"
source label beside the green dot (the dot greys when no fresh count is
available); voting remains a control in the footer.

## Browser behavior

Presence starts once the board is up, after a save loads or the wiki opens. Each tab sends a heartbeat about every five
minutes and receives the public count in the same response. The random ID, the next
due time and the latest count live only in that tab's memory; nothing is written to
browser storage, because the privacy notice promises that and a stored ID for a
counter would need consent under § 25 TDDDG. So tabs count separately, and a reload
starts a new ID while the old one ages out of the ten-minute window. Changing saves
does not send another heartbeat. Background tabs remain eligible, though browser
suspension can make a session expire. Earlier versions stored the ID under
`ba_community_state`; the page removes that key when it loads.

The voting dialog fetches its list when opened. Each feature can receive one vote
per connection IP. Duplicate submissions are safe. Shared networks may share a
vote, and changing IP addresses can permit another vote. The online count uses a
random per-page-load ID independently of the voting identity.

Save bytes, company names, character IDs and calculations never enter the community
API's requests. The bug report form is separate and sends a save only when the player
attaches one (see Bug reports below). The voting database holds feature-specific HMACs of connection IPs, not
raw IPs. These hashes are pseudonymous identifiers, not a claim of anonymity.
Presence rows hold only the tab's ID and last-seen time. Daily cleanup deletes
rows not seen for 24 hours, so stale records can remain for approximately 48 hours.
The same cleanup deletes the votes of every feature no longer in
`server/features.json`, so a poll's hashes go within a day of its removal; the
privacy notice promises both. Cloudflare still processes the connection IP in
handling network requests. Worker invocation logs are switched off in
`wrangler.jsonc`, so no request URL or country is kept either.

## Bug reports

The footer's Report a bug control, its copy in Help & feedback, and the Report a bug
button in the source strip after a failed read open the form in `web/report.js`, which
`web/app.js` loads on first use. Only the site carries the control (`footer_html(site=True)`);
the CLI's `dashboard.html` keeps the plain Discord link. The form posts
`multipart/form-data` to `POST /api/report` in `server/worker.mjs`:

- `report`, always: the player's text (at most 5,000 characters), the site build
  (`LEDGER_BUILD`), the game build, the browser family, the source kind and, only with
  the technical details ticked, the error's class and where it was raised
  (`KeyError in _staffing (ba_dashboard.py line 4120)`, built by `brErrorLine()` from
  the part of a Python traceback that comes before any message text; for a script error,
  its name alone), never its message, which can carry anything the save holds. The Worker rejects any field
  or value outside its allowlist, an `error` of any other shape included.
- `details`, only when "Attach technical details" is ticked: the whole traceback and the
  language, theme and platform. Nothing else is read from browser storage.
- `save`, only when "Attach my save" is ticked: the bytes the page read. For a failed
  read the worker hands them back with the error; for a working board, or a save the
  board could not draw, `web/worker.js` copies the save it holds (`held`). The Worker stores them as they came, with no gzip
  check, and never decompresses them.

"Attach my save" starts ticked each time the form opens; the player can untick it
before sending, including while the save is being prepared. If no save is available,
the box is unticked and disabled. Technical details still start unticked. Opening
the form does not send either attachment.

The Worker refuses a body whose `Content-Length` is over 8 MB, or missing, before
reading it, and holds the stream to the same cap. It writes `report.json` (the public
facts, without the text), `details.json` and `save.hsg` to the `REPORTS` bucket under a
folder named `<date>-<uuid>`, then opens an issue in `PeterHartwieg/big-copilot` labelled
`bug-report`. The issue puts the player's text and the error line in fenced code blocks,
so no link, image or mention in them renders, and names the folder. Once the issue is
open it writes `issue.json` (number and address) into the folder. If GitHub fails, the
Worker deletes the folder (three tries) and answers 503, and the form points to the
Discord support channel. The writes, the issue and the cleanup run under
`ctx.waitUntil()`, so a closed tab does not stop them halfway. Whatever still slips
through, the report cron (`scheduled()`, `sweepReports()`) runs every minute and
visits folders older than an hour that have no `issue.json`. The sweep uses at
most 192 R2 calls per invocation, including a small root checkpoint
(`_bigcopilot-report-sweep-v1.json`) in the same bucket. Conditional ETag writes
elect one sweep owner when cron events overlap; a crashed run releases ownership
after 16 minutes, and an old owner cannot overwrite a newer checkpoint.
Subsequent runs resume through retained folders and large orphan backlogs in
bounded minute intervals. A synthetic 2,400-folder backlog clears within an hour
once eligible. With full 1,000-key list pages and ordinary small reports, the
budget supports roughly 47 orphan folders per minute (about 67,000 a day);
very large folders and service failures reduce that throughput. The published
two-day cleanup window is unchanged; unlimited uploads cannot have a finite
processing guarantee under platform limits. A separate daily cron retains the
presence and voting cleanup. The 30-day bucket lifecycle remains the final net.
The
sweep carries one folder's newest timestamp and issue marker across list pages, then
rechecks the complete candidate folder and deletes it in batches of at most 1,000
keys. Newer uploads stop cleanup, and each batch checks for an issue marker again;
issue markers are never deleted. R2 cannot make folder deletion atomic, so a later
write or failure may leave a partially cleaned folder for the next run. If
GitHub created the issue but its answer never arrived, the issue names a folder that is
already gone; that direction is accepted. With nothing attached the report request writes
nothing to R2.

`REPORT_LIMITER` allows three reports a minute per IP at each Cloudflare location: a
burst guard, not a daily cap. If spam shows up, add a daily cap counted in D1, then
Turnstile.

The bucket `big-copilot-reports` is in the EU jurisdiction, so its binding carries
`"jurisdiction": "eu"`, and its lifecycle rule `delete-after-30-days` deletes objects
after 30 days (set once with `npx wrangler r2 bucket lifecycle add`). The issue token is
the secret `GITHUB_REPORT_TOKEN`: a fine-grained token with Issues read and write on this
repository only, which expires on 1 October 2027. Renew it before then, or report filing
stops and every report answers 503.

To read a report's save, download it into the gitignored `reports/` folder:

```sh
npx wrangler r2 object get big-copilot-reports/<folder>/save.hsg --jurisdiction eu --remote --file reports/<folder>/save.hsg
```

Saves stay out of the repository. When a player withdraws consent, delete the folder
(`npx wrangler r2 object delete ... --jurisdiction eu --remote` for each object) and the
issue.

Locally, `npm run dev` simulates the bucket. The sample token in `.dev.vars.example` is
not a token, so a local report fails at GitHub and the form shows the Discord fallback;
never put a real token in `.dev.vars`. The tests replace GitHub with a stub
(`tests/community-report.test.cjs`, `tests/report_flow.test.cjs`).

## Configuration and release

The browser Python worker is still `web/worker.js`. The server entry point is
`server/worker.mjs`, outside the publicly served `web/` directory. It handles only
API requests; the existing assets continue to be served directly. D1 holds the
presence and vote tables. Cloudflare rate-limit bindings limit requests per IP at
each edge location: heartbeats have their own budget of 20 a minute
(`PRESENCE_LIMITER`), since a real tab sends one every five minutes, and the listing
and votes share 120 a minute (`COMMUNITY_LIMITER`). Neither is a global identity or
fraud-prevention guarantee.

Install the pinned development dependencies with `npm ci`. For local development:

1. Copy `.dev.vars.example` to `.dev.vars` and replace its example value with a
   local development secret. This file is ignored by Git.
2. Run `npx wrangler d1 migrations apply big-copilot-community --local`.
3. Run `python build_web.py --assemble`, then `npm run dev`. Open
   `http://127.0.0.1:8789`. The configured local host keeps same-origin checks and
   the local IP fallback working despite production custom-domain routes. If you
   change the dev port, update `dev.port` and `dev.host` together.

The production database is provisioned and its ID is tracked in `wrangler.jsonc`.
For a fresh deployment to another account:

1. Create the D1 database with `npx wrangler d1 create big-copilot-community` and
   replace `database_id` in `wrangler.jsonc` with its returned ID.
2. Apply `npx wrangler d1 migrations apply big-copilot-community --remote`.
3. Set `COMMUNITY_IP_SECRET` using `npx wrangler secret put COMMUNITY_IP_SECRET`.
   Use a random secret of at least 32 bytes. Keep it stable: replacing it changes
   voting identities and allows previous IPs to vote again.
4. Follow the release-baseline checks in [Contributing](contributing.md), validate with
   `npm run deploy -- --dry-run`, and deploy the complete site with `npm run deploy`.

Never publish the sample secret. An unconfigured community API returns unavailable
while static Copilot assets remain usable. Test locally without real saves or IPs.

## Maintaining voting options

Edit `server/features.json` and deploy. Keep IDs stable while a feature remains in
the poll; changing an ID creates a new voting identity and deletes the old ID's votes
at the next daily cleanup. That rotation is also how a poll's count is reset without
touching the database: `time-to-break-even` became `break-even-time` on 20 September
2026 to clear its votes while the idea stayed on the ballot. Removing an option stops new votes for it, and the next
cleanup deletes its rows. Titles and descriptions can
change without resetting votes. No administration interface is required.

## Usage

Forty tabs continuously open for a full day produce approximately 11,520
heartbeats, plus startup/retry overhead. Each normal heartbeat updates a presence
row and its timestamp index. Early duplicates avoid refreshing an already-fresh
row. A short edge cache reuses only the public aggregate; it reduces database reads
but does not remove Worker request charges. Cache entries are per data center,
not a single global timer. Expired rows are filtered out of counts even before the
daily cleanup runs.

Monitor Worker requests and D1 rows read/written after release; total unique visits
alone cannot establish daily backend consumption. Community failures should show
an unavailable count or a retryable voting message while the save dashboard keeps
working.

## Failure diagnostics

Handled request failures emit one structured console error with only three fields:
`event: "community_api_failure"`, `operation`, and `category`. Operations are
`presence`, `vote`, `features` or `report`; `request` is the fallback when a failure occurs
before a community route is selected. These tags come from application constants.

Categories identify the boundary that failed:

- `configuration`: a required D1 binding, rate limiter, IP secret, or the bug report route's bucket or token, is absent.
- `limiter`: the rate-limit binding call failed. A normal denied request is quiet.
- `database`: D1 statement preparation, binding, or batch execution failed.
- `storage`: a bug report's R2 write failed, or its folder could not be deleted after
  GitHub failed (the report sweep then deletes it), or `issue.json` could not be written.
- `github`: GitHub did not open the issue; the report's folder was deleted.
- `unexpected`: a failure outside those boundaries, including response processing.

Start with the category when checking deployment configuration or service health.
The event deliberately contains no exception message or stack, SQL, URL, query,
IP, browser ID, voter hash, request body, headers, or secret. Clients still receive
the same generic 503 response. Successful requests and ordinary validation or
rate-limit responses emit no event; best-effort cache failures remain quiet and
fall back to D1. Scheduled cleanup is outside this request diagnostic. Invocation
logging and tracing remain disabled, and no telemetry service is added.

At release validation, inspect a stored failure event's platform metadata as well
as these application fields. Confirm that the deployed logging configuration still
honors the documented absence of request access logs; local tests cover the event
body and configuration, not Cloudflare's stored metadata.
