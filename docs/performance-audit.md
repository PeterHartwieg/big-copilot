# Performance and loading audit — 2 October 2026

Audited main `33f289fd` in the `codex/performance-audit` worktree. The main
checkout was current at the start of the audit after `git pull --ff-only`. This audit covers the
hosted loading path, the browser Python worker, shared board rendering, Python
extraction, map and guide assets, and community database access. No real save
was used in tests or uploaded, and nothing was deployed.

## Implemented improvements

### Download board files alongside Pyodide

`web/worker.js` previously waited for the runtime, then fetched two Python files
and five data tables serially. Every download is independent of runtime startup.
They now begin together and join after all response bodies have been consumed.
Only then are the directories and files created and Python imported.

Required code still fails startup on unsuccessful HTTP responses. Optional tables
still use Python's fallback on unsuccessful HTTP responses; network errors retain
the existing startup-failure behavior. Build stamps, cache policy, worker messages
and queued save processing are preserved. Runtime completion and individual consumed
response bodies send progress before the join so the pending-save inactivity timer
does not expire while the concurrent branches are still working. Both concurrent branches are observed
immediately so an early download rejection cannot become an unhandled rejection
while the runtime is pending.

Nine deterministic regression tests exercise pending runtime/downloads, incomplete
response bodies, completion out of order, stamped/development caching, optional
HTTP errors, required HTTP errors, network failures and runtime failures. The
concurrency assertions failed on the original worker and pass after this change.

### Minify inline JavaScript before deployment

`tools/optimize_web.mjs` uses the existing, pinned esbuild dependency to minify
the assembled page's plain inline script blocks. It preserves identifiers and
classic script order, leaves HTML markup and CSS unchanged, and retains browser
escaping of script terminators. No wrapping, bundling or property mangling is used.
Blocks whose optimized code contains an HTML comment opener retain their original
escaping to avoid HTML script-tokenizer state changes. All transforms finish before
the output file is written.

`npm run deploy` assembles and checks the readable Python output first, then
optimizes the ignored `web/index.html` before the Wrangler step. Python assembly
still needs no Node dependencies. Running assembly again restores the readable
artifact for `--check`; the optimizer and esbuild’s lock entry are stamp inputs. Unrelated dependency updates do not
invalidate the browser asset cache.
The shared CLI export continues to use the original readable template.

| Generated page | Before | Optimized | Reduction |
| --- | ---: | ---: | ---: |
| UTF-8 HTML | 2,459,597 bytes | 1,757,064 bytes | 28.6% |
| gzip HTML | 706,065 bytes | 490,395 bytes | 30.5% |

These are local gzip measurements, not a guarantee of an edge server's exact
compression ratio. A read of the production landing on 2 October returned gzip,
`Cache-Control: no-cache`, an ETag and a Cloudflare cache hit; its transfer was
704,785 bytes. Compression already exists, so enabling gzip is not a missing fix.

The optimizer tests check shared globals, function names, hostile script
terminators and comment openers through Chromium’s HTML parser, forced layout
reads used by animation restarts, exact non-script output and compressed size. The CSP integration
tests serve the optimized page and exercise real Pyodide, a synthetic save,
the map background, guide pages and loopback game-link reads.

## Loading measurements

The local probe serves gzip assets to headless Chromium at 1440 × 1000, starts
the actual page and worker, and records paint timing, long tasks and the worker's
`ready` message. A controlled 100 ms delay on each `/py/` response exposes the
download dependency chain. This is a cold-cache lab experiment, not field Core Web Vitals or
a Lighthouse score. Its HTTP/1.1 server differs from the production edge’s HTTP/2
or HTTP/3 connections. Warm-cache repeat visits avoid these data downloads, so the
measured concurrency gain primarily concerns first visits and visits after a deploy. Chrome DevTools MCP is unavailable in this environment.

Final samples were collected without tests running concurrently. Each condition
used four fresh browser contexts in one browser process; the first run warmed
server compression and runtime compilation, and the table shows the median of the
remaining three. The bandwidth experiment limits only the HTML response to
125 KB/s; other assets stay local and `/py/` responses retain their 100 ms delay.

| Lab condition and metric | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Local gzip, 100 ms per data file: reader ready (concurrency alone) | 2.601 s | 1.999 s | 23.1% |
| HTML at 125 KB/s: reader ready (minification + concurrency) | 8.281 s | 5.850 s | 29.4% |
| HTML at 125 KB/s: DOMContentLoaded | 5.758 s | 3.961 s | 31.2% |
| HTML at 125 KB/s: first contentful paint | 0.944 s | 0.944 s | unchanged |

These experiments isolate the removed dependencies and transferred bytes; they
are not a simulation of all traffic sharing a constrained connection. First paint
and the animated landing's LCP are separate from Python readiness. The unchanged
first paint supports claiming faster reader availability, not an earlier initial
paint. INP and field Core Web Vitals were not measured.

The public-assets-only probe and JSONL samples are kept locally under the ignored
`research/` folder: `loadtime-profile.cjs`, `before-worker.js` and
`loadtime-{before,concurrent,limited-before,limited-after}.jsonl`. To reproduce,
run the locally retained probe with the worktree path, four runs and a 100 ms response delay. Set
`WORKER_SOURCE` to the saved original worker for the before condition, `OPTIMIZE=1`
for the optimized page, and `HTML_KBPS=125` for the bandwidth experiment.
These lab artifacts are not included in the repository; the committed startup,
optimizer and CSP tests provide portable regression checks.

## Findings for further work

| Area | Evidence | Next change to evaluate |
| --- | --- | --- |
| Store planner extraction | Ten profiled extractions of `tests.es3_fixture.link_company()` spent 0.77 s of 1.08 s in `_open_store()`, including 0.73 s in `outfit_lines()`. Repeated catalogue scans called `flags()` 448,380 times. Profiling adds overhead and this fixture is small. | Build per-extraction furniture indexes by flags and displayed products, then reuse across layouts. Compare complete payloads before accepting the change; avoid caching mutable save-dependent results globally. |
| Initial board drawing | `boot()` still runs every `PAGE_DRAWS` row. Same-company refreshes already draw only the active view and mark the others stale. | Extend lazy drawing to first load after separating state computed for search/navigation from view markup. Validate remembered routes, site deep links and first visits to every view. |
| Page transfer and repeat visits | After minification the page still transfers about 490 KB gzip, including the embedded board/map/guide script. | Separate cacheable hosted scripts/styles while retaining the standalone CLI export. Measure first-paint gains under bandwidth throttling and repeat visits before adding split-output complexity. |
| Map opening | `map-background.svg` is 8,219,937 bytes raw / 1,702,914 bytes gzip. `loadCityMap()` waits for SVG decoding and generation of its shared bitmap before completing. | Profile map-open latency and compare a prebuilt bitmap preview with current vector rendering. Keep detailed geometry and the approved appearance; asset generation needs the owner's pipeline. |
| Landing/guide-only visits | The page starts Pyodide at `DOMContentLoaded`, before a save is selected. | Evaluate demand-started runtime against the existing benefit of warming it while the user picks a save. This is a product tradeoff, not automatically a faster save-opening path. |

The parser already caches repeated short strings and uses fast scalar paths.
The map and guide catalogues are fetched lazily, floor plans load when needed,
hidden map views defer refresh work, animation loops sleep when settled, and
folder scans pause while hidden. Community presence uses a short aggregate cache;
its time-window query has an index. Vote lookups use the composite primary key.
No unindexed database query requiring a new index was found in this review.

The synthetic Python profile identifies a candidate, not large-company performance.
No Python extraction behavior was changed in this audit, and no payload snapshot
was regenerated. No performance-only changelog entry was added.

## Validation

- Full Node suite: **1,566 passed, 1 failed, 1 skipped** (1,568 total), rerun after review fixes. The failing
  pseudo-language layout check also fails on an untouched archive of main
  `33f289fd`: the Open a store page scrolls sideways at 360 px with expanded text.
  It is outside this performance change.
- Full Python suite: **1,736 passed, 2 failed, 13 skipped** (1,751 total). Both
  failures are in `tests.test_wiki_extract.ProvenanceTests`, comparing `/var/...`
  temporary paths with their `/private/var/...` canonical paths on macOS. Both
  fail on untouched main too. Running that entire 27-test group with
  `TMPDIR=/private/tmp` passes, with one skip.
- Final optimized deployment artifact: **170 passed, 1 skipped** across businesses,
  navigation, game names, translation runtime, news, theme, release, update,
  CSP, optimizer and save-restoration checks. The 171-test run caught one more
  test clicking the hidden landing footer’s changelog button; the corrected
  visible-footer selector passed its focused rerun. Preferences similarly uses
  the visible footer, and the update fixture matches the release script block
  rather than JavaScript whitespace. The optimized artifact also passes
  `npm run check:worker` without publishing.
- Final web freshness suite: **10 passed**. Startup and optimizer regressions:
  **14 passed**, with a further focused Chromium check for uppercase script
  terminators passing. The final full Node suite includes these corrections.
- esbuild **0.28.1** matches `package-lock.json`. The optimizer's failure test
  verifies that a later script compilation error leaves the file unchanged.
- `python3 build_web.py --check`, `node --check tools/deploy.mjs` and
  `git diff --check` pass. `npm run check:worker` passes against the isolated,
  optimized deployment artifact with Wrangler **4.131.1**, without publishing.

## Tooling references

- [esbuild minification options](https://esbuild.github.io/api/#minify) and
  [browser platform escaping](https://esbuild.github.io/api/#platform)
- [Pyodide JavaScript API](https://pyodide.org/en/stable/usage/api/js-api.html)
- [Promise.all concurrency and rejection behavior](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all)

## Independent review

Astra and Claude Opus 5.5 (high effort, normal Claude CLI login, model verified
from response metadata) independently reviewed the original patch. Astra found
a pending-save timeout regression under shared slow bandwidth. Runtime and file
completion heartbeats now fix it, with tests for both completion orders and
partial downloads. Astra’s original focused checks passed: 12 Node checks and
nine web freshness checks.

Claude identified gaps in recurring optimized-output coverage, deployment error
messages, cache-stamp scope and a size test that depended on readable artifacts.
CI now tests optimized hosted output, optimizer errors use the deploy’s normal
stop message, only esbuild’s lock entry affects the stamp, and the size check
builds readable input in memory. Its proposed hostile-comment test also exposed
an HTML parser edge case; affected blocks retain their original source escaping.
Claude’s initial review was static because the coordinator’s command allowlist
denied its test commands; follow-up verification uses explicit standalone test
commands. The reviews themselves did not publish or deploy changes.

Both reviewers re-reviewed the corrections and found no remaining actionable
blocking issues. Each ran all 14 startup/optimizer checks successfully; Claude
also passed deployment syntax and the focused compiler-stamp check, with no
permission denials in its follow-up. An additional Chromium check confirms
uppercase and mixed-case script terminators remain safe. The final full Node run passed 1,566 checks, skipped one, and reproduced only the
existing 360 px pseudo-language layout failure on main. All 10 web freshness
checks passed. The readable assembly passes `--check`; the optimized artifact
passes deployment compilation without publishing. Private full-run logs are
`research/review-node-tests.log` and `research/review-web-fresh.log`.
