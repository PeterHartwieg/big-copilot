# Community features implementation plan

Status: implemented (PR #19, 13 September 2026). Kept because `tests/community-api.test.cjs`
cites its API contract; the current description is [community-features.md](community-features.md).

## Outcome

Add an approximate online dashboard count and curated feature voting to the hosted
Big Copilot site. Save contents stay in the browser. Preserve existing workspace
changes. Use GLM 5.3 Flash through a CLI for bounded mechanical implementation;
review and validate its output before delivery.

## Initial design

1. Add a Cloudflare Worker API alongside the existing static assets and one D1
   database containing presence and votes. Keep server code outside `web/`.
2. Send a presence heartbeat after a dashboard loads, then every five minutes.
   Count browser IDs seen within ten minutes. Deduplicate tabs, remember the next
   due time across reloads, return the total with each heartbeat, and share it
   between tabs. Background dashboards remain eligible. Back off after failures
   and skip missed intervals after sleep.
3. Reuse one presence row per browser, filter expiry using server time, cache only
   the public aggregate briefly, and clean stale rows periodically.
4. Provide a curated feature list and one upvote per connection IP per feature.
   Hash the IP with a server secret, enforce uniqueness atomically, validate
   inputs and same-origin writes, and limit abuse. Never store raw IPs in D1.
5. Add compact footer controls and an accessible voting dialog. Explain the
   ten-minute count window, IP voting limitations, and data sent. A community API
   failure must not interrupt loading or using saves. Local Python output stays
   independent of the community backend.
6. Test API/database behavior, duplicate voting, expiry, shared tab scheduling,
   reloads, failed requests, and the UI. Rebuild generated browser assets and run
   relevant existing regressions. Prepare setup instructions and validate a local
   deployment bundle; production release is a separate step.

## Simplification pass 1

- One Worker, one database, and one browser module; no framework, WebSockets,
  Durable Objects, separate cache database, or new general-purpose client layer.
- Maintain feature options in a small versioned data file rather than adding an
  administration interface. No public submissions or comments are in scope.
- Store votes themselves and derive totals; avoid a second mutable vote counter.
- Use insert-if-absent voting so retries and double clicks are safe.
- One heartbeat endpoint performs presence refresh and returns the count. Read
  voting data only when its dialog opens; refresh after a successful vote.
- Cache only a count snapshot, never per-browser responses. Cache misses are
  harmless; the database remains the source of truth.
- Start presence from the existing dashboard-ready behavior rather than coupling
  it to the save parser or adding game-data network calls.

## Simplification pass 2 / execution order

1. Confirm the requested CLI/model is available and document the exact invocation.
2. Delegate bounded backend/schema work to GLM, then review it against the above
   behavior. Keep its file ownership separate from active local work.
3. Delegate browser module and focused tests to GLM; integrate using the existing
   build/template conventions. Reuse existing styles and feature discovery.
4. Run local migrations, API checks, browser regressions, and the generated build.
   Fix failures, then review the full diff for unnecessary abstractions.
5. Record verified behavior, required production configuration, remaining product
   choices, and actual validation results here.

## Status

- Plan written before implementation; simplification passes recorded above.
- Existing uncommitted changes identified and will be preserved.
- User confirmed using the Z.ai key in 1Password if no existing GLM Claude Code
  instance is available. Use a process-scoped Claude Code provider/model override;
  do not change the user's normal Claude settings or write credentials to disk.
- Initial voting options are the two existing SOON cards: Optimize staffing and
  Find a location. Plan imports is already available and is not a voting option.
- Baseline: 58 Python tests pass with `.venv-map/Scripts/python.exe`; all 94 Node
  tests pass with `PLAYWRIGHT_CHANNEL=msedge`. Default Python lacks Shapely for the
  private map pipeline; bundled Playwright Chromium is absent.
- Wrangler 4.131.1 and current Workers type definitions are available for local
  validation. Development dependencies and lockfile added for repeatable checks.
- GLM 5.3 Flash confirmed through `claude --bare --model glm-5.3-flash` with a
  process-scoped Z.ai provider and a key read directly from 1Password. Backend,
  browser module and API-test work delegated through separate CLI runs.
- Backend and browser integration implemented. Local migration and Worker dry run
  pass. Browser community regressions: 12 pass, including cross-tab concurrency,
  abandoned claims, blocked/full storage, sleep, reload and pending-vote reopen.
- Mobile voting dialog visually inspected. Existing SOON feature text is used.

## Review / final simplification pass

- Keep cross-tab sharing entirely in localStorage; adding BroadcastChannel would
  duplicate the same function. Short Web Locks protect both claims and results;
  no lock is held while a request is pending, and no watchdog polling is needed.
- Cache hits skip the count SQL query itself, rather than merely returning a
  cached value after still running the expensive query.
- The static asset binding and API routing are inside the correct Wrangler assets
  configuration. The browser Python worker retains its original role and path.
- A vote response carries its new total; reopening during an outstanding vote
  waits for that vote before making the single on-open list request.
- Treat permanently full/blocked storage as a per-tab memory fallback. Avoid an
  invalid pseudo-UUID fallback; browser IDs remain UUIDs accepted by the backend.
- Rate-limit responses include Retry-After. Oversized bodies return 413. An empty
  future poll needs no database batch and displays the existing empty state.
- Production provisioning/deployment has not been performed. The all-zero D1 ID
  is explicitly marked for replacement, and setup is in community-features.md.
- Local end-to-end verification used the real Worker and D1: voting succeeds,
  voted state persists, presence and duplicates return a stable count. Explicit
  development host settings prevent Wrangler's default rewrite to the production
  domain from breaking the local IP fallback and same-origin checks.
- All 17 API tests pass. The cache regression measures real D1 row metrics and
  proves a warm cache skips at least 100 seeded-row reads; a fresh duplicate writes
  zero rows. Scheduled cleanup retains votes and recent presence.

## Final validation

- Rebuilt the generated browser site with `python build_web.py`.
- All 123 Node/browser tests pass with Edge, including 29 community regressions.
- All 58 Python tests pass using the existing map virtual environment.
- `python check_saves.py`: 18 supported saves pass; 16 unsupported older saves
  skipped; zero failures. Save data was not supplied to GLM or uploaded.
- Wrangler deployment dry run and `git diff --check` pass.
- Local browser-to-Worker-to-D1 verification passes, with desktop and mobile
  visual inspection. Local preview runs at http://127.0.0.1:8789.
- Existing unrelated changes are preserved. No commits, remote provisioning or
  production deployment were performed.

## API contract

- `POST /api/community/presence` accepts `{browserId}` and returns
  `{count, countedAt, nextHeartbeatIn: 300}`. Times are Unix seconds; the total may
  come from a public 60-second cache. Individual responses use `no-store`.
- `GET /api/community/features` returns `{features:[{id,title,description,votes,
  voted}]}`; `voted` is specific to the connecting IP, so this response is not
  publicly cached.
- `POST /api/community/vote` accepts `{featureId}` and returns the selected feature
  with its current total and `voted:true`. Duplicate requests succeed idempotently.
- Only the server's curated feature IDs are accepted. Use fixed-shape small JSON
  requests, prepared statements, edge-provided connection IP and HMAC-SHA-256.
- All application API errors are JSON; unavailable configuration returns 503.
  Handle unsupported methods, oversized bodies, invalid input and cross-origin
  writes before database access. Rate limiting protects reads and writes.
- Presence cleanup is scheduled, not repeated on each request. No save data,
  company name, character ID or raw IP enters the community tables.
