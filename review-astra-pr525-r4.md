APPROVE WITH NITS

Review round 4 of PR #525, head `98843f81166c3814a3c3fdac2fca1e736cc603ac`, previous head `68d319ba1582052e4d6f3c9deb8731e503f8211a`, against `origin/main` `9b94cc9eef62c0277779aa25df20bce7d43d7371`. The round-3 P2 is fixed. No remaining P1/P2 found. One nonblocking P3 presentation issue remains.

**Finding**

1. **P3 ? Clearing the link does not repaint its running-build footer or warning on a retained board.** `web/app.js:1097`; notification handling at `template/board.js:28636` and `template/board.js:28642`.

   Exact reproduction: load a linked board with save build 3670, verified build 3682, and `/health.runningBuild=3690`. It displays ?Game 3690, save 3670? and ?BUILD 3690 UNCHECKED?. Choose a different `.hsg` file, then have its reader fail. The old board correctly stays visible and becomes Stale, but its footer and unchecked-build flag still show 3690 indefinitely until another redraw.

   Expected: once the source is a file and `linkRunning` has been cleared, repaint to ?Game build 3670? and remove the warning attributable solely to the former running game. This is exactly what the current `footGameLine(D.meta)` would render. Actual: report context correctly says `source:"file", runningBuild:null`, while the visible footer still says ?Game 3690, save 3670? and the warning remains. `dropLink()` resets the field directly; `linkChanged` does not perform the repaint supplied by `runningBuild()`.

   This is nonblocking because the retained board is marked Stale and report metadata is correct. It already exists on the round-3 head; it was not introduced by the round-4 ordering guard. It is a PR presentation regression relative to main, whose footer remains save-only and has no spurious 3690 flag. Repaint the build-dependent UI after a source reset, and cover a failed replacement read.

   Evidence: `footer-source-probe.cjs`, `footer-source-head.log`, `footer-source-r3.log`, `footer-source-main.log`. The Edge probe uses production page/shell/board, the real linked-load and file-picker paths, synthetic Worker replies, and no external service; all three runs have zero page errors. Only inspection entry points are exposed in memory.

**Earlier findings and ordering review**

- **Round-3 P2: fixed in all three variants.** The adapted `extended-health-probe.cjs` holds a watcher JSON body, clicks Update, receives `/refresh` 429/retryAfter 1, publishes 3682 from the retry health read, then releases zero, an omitted field, or an older positive build. Each retains 3682 with publication callbacks `[3682]`. The independent Edge `browser-order-probe.cjs`, using real Response/ReadableStream bodies and the actual one-second retry, returns `{before:3682,after:3682,afterUpdate:3682,published:[3682],reads:2,refreshes:2}`.
- **Round-2 P2-1: still fixed for metadata.** Adapted `race-probe.cjs` and `source-switch-probe.cjs` retain null for file/folder and 3690 for a newer link, including the same URL in a new generation. Extended probes reject old responses while headers or JSON are pending across disconnect, reader failure and same-URL reselection. The separate P3 above concerns already-rendered text, not an obsolete response republishing metadata.
- **Round-2 P2-2: still fixed.** `legacy-probe.cjs` reports save 3670 and running unknown for old-mod `health.build=3682`, with one lookup of the reader-held save stamp. `failreader-probe.cjs` reports an unknown unparsed save for known, zero, null and omitted running builds; a known running 3682 stays independent. Extraction failures retain the reader-derived stamp/lookup behavior rather than substituting `health.build`.
- **22 additional ordering cases pass.** A later network error, AbortError, non-200, invalid JSON, null, array, string or numeric body does not advance publication and does not suppress an earlier usable success. A supported later object with omitted/zero/null/invalid running build publishes unknown and prevents an older positive value from returning. All six completion orders of three concurrent reads preserve the latest-started successful publication, including schema and clock. An earlier success publishes while a later read is still pending. Counters remain monotonic across different-URL and same-URL reconnects; generation checks prevent an old reply from publishing even if the new generation's first read fails.
- The guard also covers `linkNotReady` reset, `linkSchema`, `tickClock()` and the running-build callback that repaints footer/build warning while preserving the live dot. The save's build still comes from parsed payload/reader state; `readHealth()` does not assign the save stamp. Callers receive their own response, so this is publication ordering, not cancellation of all older operations. Four additional watcher/Update cases (older unsupported/missing schema, non-200 and error) preserve Update's final status message; schema remains current. An old non-200 can still increment `linkNotReady` to one after a newer successful read, unchanged on main and the previous head, without changing the build or triggering a fallback in the repro.

**Other round-3 behavior retained**

- Grok corrections remain: known-running reader-failure reporting; build repaint removes transient `just` while retaining Stale/label/title; illustration caption stays right-aligned.
- **10 C# checks pass** against production HealthState.cs and JsonWriter.cs compiled with synthetic game API stubs: absent/zero/negative/throwing version, save-first fallback, later running version replacing it, retention through later misses, version-first loading, integer JSON. Running build never comes from the save. Mod manifest/runtime remain 0.8.2, schema 5. This is not a Unity SDK build; compatibility-test source was inspected, not run in Unity.
- **33 Worker/report-preview/footer assertions pass:** optional running build remains backward compatible; integer bounds and invalid types are enforced; both unknown, either known, equal/different builds, non-link footer and loading preview agree. The full Node suite covers multipart validation.
- **15 Edge accessibility/pointer/keyboard/caption assertions pass:** the sketch is an image named Illustration with the game-window/60-second description, no interactive descendants/tab stops and no pointer activation. Quiet starts at 30 seconds; wording says about 60 seconds, matching ApprovalService.PopupSeconds.
- All three removed i18n keys remain absent from 24 locale/metadata files and affected source lookups. Eight shipped non-English catalogues use call-site English for the 11 new keys and filter the obsolete quiet-text translation.
- Privacy, API and report documentation distinguish the save stamp from the optional running build and preserve consent/attachment boundaries. Changelog #525 is dated 2026-10-27 and describes both capabilities.

**Tests**

All commands ran in the foreground with `PYTHONUTF8=1`; browser runs used existing Edge via `PLAYWRIGHT_CHANNEL=msedge`. No CLI execution timeout was imposed.

- Full Python, `node tools/verify.mjs python`: **2,501 run; 2,500 passed, 1 skipped, 0 failed**, exit 0, 292.836 seconds.
- Full Node, `node tools/verify.mjs node` (all 114 test files, concurrency 2, Edge): **2,454 run; 2,454 passed, 0 failed/skipped/cancelled**, exit 0, 1,106.368 seconds. Neither intermittent full-suite failure recorded in round 3 recurred; no failing current test needed isolated or previous-head attribution.
- `python build_web.py --check`: passed, exit 0, ?web/ is up to date?.
- `git diff --check origin/main...HEAD`: passed, exit 0.
- New committed tests on archived `68d319ba` with the round-4 game-link test file: **3 run, 3 expected failures** (zero/omitted/older positive). Identical tests on `98843f81`: **3 passed**. The independent extended probe with fixed expectations also fails on the previous head (`null !== 3682`) and passes on the current head.
- Independent probes: the six requested probes pass; the extended probe includes six source invalidations, three legitimate replies and three same-source overlaps; ordering matrix 22 cases, C# 10 checks, rendering/validation 33 assertions and scene 15 assertions all pass. Footer-source probes document the P3 on current/previous heads and its absence on main.

**Evidence**

Directory: `C:/Users/Peter/Coding_Projects/.agent-logs/scratch-bc525-r4-astra`.

Requested probes and matching `.log` files: `extended-health-probe.cjs`, `browser-order-probe.cjs`, `race-probe.cjs`, `source-switch-probe.cjs`, `legacy-probe.cjs`, `failreader-probe.cjs`. Additional evidence: `ordering-matrix.cjs/.log`; `caller-order-probe.cjs` and `caller-order-{head,r3,main}.log`; `footer-source-probe.cjs` and `footer-source-{head,r3,main}.log`; `health-probe.ps1/.log`, `build-matrix.cjs/.log`, `scene-probe.cjs/.log`, `i18n-probe.py/.log`; `head-new-tests.log`, `r3-new-tests.log`, `r3-extended-health.log`; `python.log`, `node-edge.log`, `suite-exits.json`, `build-check.log`, `diff-check.log`. Previous-head and main archives are under scratch `r3/` and `main/`.

No tracked files were changed. Assembly wrote ignored outputs; the report is the sole untracked review deliverable in the worktree. No commit, push, merge, deployment, Wrangler invocation, GitHub post, WSL invocation, global install, other-worktree modification, process killing or background job was performed. Probe browsers close in finally blocks. Both foreground suites completed with exit 0. Final freshness and whitespace checks passed again after the suites. The working tree was clean before this report was written; no test servers or probe browsers were left running.
