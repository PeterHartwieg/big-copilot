# Community features

The hosted dashboard shows an approximate online count and lets visitors vote for
the **Time to break even**, **Supply chain for factories not running 24/7** and
**Multilingual support** ideas (Find a location shipped on 15 September 2026 and
Optimize staffing on 20 September 2026; both left the ballot). Time to break even
would estimate how many in-game days each business needs to earn back its setup
costs, based on its net profit; the factory idea would plan lines that make just
enough for a week's demand rather than full output, and say how long each one has
to run; and multilingual support would put the board's own wording into other
languages. The
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

Save bytes, company names, character IDs and calculations never enter these API
requests. The voting database holds feature-specific HMACs of connection IPs, not
raw IPs. These hashes are pseudonymous identifiers, not a claim of anonymity.
Presence rows hold only the tab's ID and last-seen time. Daily cleanup deletes
rows not seen for 24 hours, so stale records can remain for approximately 48 hours.
The same cleanup deletes the votes of every feature no longer in
`server/features.json`, so a poll's hashes go within a day of its removal; the
privacy notice promises both. Cloudflare still processes the connection IP in
handling network requests. Worker invocation logs are switched off in
`wrangler.jsonc`, so no request URL or country is kept either.

## Configuration and release

The browser Python worker is still `web/worker.js`. The server entry point is
`server/worker.mjs`, outside the publicly served `web/` directory. It handles only
API requests; the existing assets continue to be served directly. D1 holds the
presence and vote tables. A Cloudflare rate-limit binding limits requests per IP
at each edge location; it is not a global identity or fraud-prevention guarantee.

Install the pinned development dependencies with `npm ci`. For local development:

1. Copy `.dev.vars.example` to `.dev.vars` and replace its example value with a
   local development secret. This file is ignored by Git.
2. Run `npx wrangler d1 migrations apply big-copilot-community --local`.
3. Run `python build_web.py`, then `npm run dev`. Open
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
4. Follow the release-baseline checks in [Contributing](contributing.md), rebuild,
   validate with `npx wrangler deploy --dry-run`, and deploy the complete site.

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
