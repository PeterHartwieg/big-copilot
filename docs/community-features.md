# Community features

The hosted dashboard shows an approximate online count and lets visitors vote for
the **Optimize staffing** and **Time to break even** ideas (Find a location shipped on
15 September 2026 and left the ballot).
Time to break even would estimate how many in-game days each business needs to
earn back its setup costs, based on its net profit. The count means
dashboard browsers seen in the last ten minutes, not verified people or players
currently in the game. Votes help prioritise work; they are not release promises.
The count paints into the masthead's live status, replacing the "In browser"
source label beside the green dot (the dot greys when no fresh count is
available); voting remains a control in the footer.

## Browser behavior

Presence starts after a save loads. One browser sends a heartbeat about every five
minutes and receives the public count in the same response. Tabs coordinate through
browser storage and Web Locks, sharing the ID, next due time and latest result.
Reloading or changing saves does not deliberately send another heartbeat. When
storage or locking is unavailable, coordination is best effort. Background tabs
remain eligible, though browser suspension can make a session expire.

The voting dialog fetches its list when opened. Each feature can receive one vote
per connection IP. Duplicate submissions are safe. Shared networks may share a
vote, and changing IP addresses can permit another vote. The online count uses a
random browser ID independently of the voting identity.

Save bytes, company names, character IDs and calculations never enter these API
requests. The voting database holds feature-specific HMACs of connection IPs, not
raw IPs. These hashes are pseudonymous identifiers, not a claim of anonymity.
Presence rows hold only the browser ID and last-seen time. Daily cleanup deletes
rows not seen for 24 hours, so stale records can remain for approximately 48 hours.
Votes remain until the operator removes them. Cloudflare still processes the
connection IP in handling network requests.

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
the poll; changing an ID creates a new voting identity. Removing an option stops
new votes for it but does not delete historical rows. Titles and descriptions can
change without resetting votes. No administration interface is required.

## Usage

Forty browsers continuously connected for a full day produce approximately 11,520
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
