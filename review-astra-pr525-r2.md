REQUEST CHANGES

PR #525, review round 2 (Astra). Reviewed detached HEAD `c583f57c906bf74cd5548bb8ccdadcbbc2ac4bc9`, the fixes since `8921712236f6e608d865417b3fdff0516edc1d84`, and the full PR against `origin/main` `9b94cc9eef62c0277779aa25df20bce7d43d7371`.

**Findings**

1. **P2 ? Obsolete health responses still publish another source's running build.** `web/app.js:1175`, with state publication at `web/app.js:816` and report exposure at `web/app.js:2795`. **Round-1 P2-1: NOT FIXED.**

   Exact reproduction: start `readHealth()` for link A and hold its JSON response; call the production `becomeSource()` to select a local file or folder; release A's response with `{schemaVersion:5, build:3682, runningBuild:3682}`; inspect `reportContext().runningBuild()`. Expected: null for the file/folder. Actual: 3682, even though `linkUrl` is null. The original race probe still reproduces unchanged except for its review-root path.

   Also reproduced both link-to-link cases: select another URL (8322 ? 8323), or select the same URL again in a new source generation; complete the new source's real `readHealth()` with running build 3690; then release the old reply with 3682. Expected: 3690 survives. Actual: the old reply overwrites it with 3682. The probe exercises the production source switch and both health reads; only initialization/network responses are synthetic. Callers' later generation checks cannot undo the mutation already made inside `readHealth()`.

   Bind each read to its source generation/link identity and discard obsolete replies before publishing metadata; a URL-only check misses reconnection to the same address. Non-link report contexts should not expose link metadata. Evidence: `race-probe.cjs/.log`, `source-switch-probe.cjs/.log` (all four source transitions reproduce).

2. **P2 ? An older mod's ambiguous health build is still labelled as the save stamp, bypassing the recoverable stamp.** `web/app.js:2063?2064`, early return `web/app.js:2788`; the same assumption remains in the revised startup fallback at `web/app.js:362`. **Round-1 P2-2: NOT FIXED.**

   Exact reproduction: an older mod omits `runningBuild` and returns `health.build=3682` because GameVersion was already available on its first refresh. Its loaded save is stamped 3670. Make extraction fail before a payload returns while the reader can still answer its held-save build query with 3670. The original legacy probe executes `buildFrom()` and `reportContext()` and returns `{source:"link", reportedSave:3682, reportedRunning:null, actualSaveStamp:3670, readerBuildLookups:0}`.

   Expected: `game unknown, save 3670` when recoverable, otherwise unknown save. Actual: `game unknown, save 3682`; the cached health number prevents the reader lookup. Omission of `runningBuild` cannot establish that `build` is a save stamp: older mods could publish either the running version or an early save fallback. Leave the save stamp unknown until obtained from actual save metadata. The revised `failReader()` fixes the known-running case but still reports 3682 as the save for an old mod when no save was parsed. Its startup failure should leave the save unknown.

   `tests/save_memory.test.cjs:25?31` now explicitly describes and asserts the incorrect older-mod assumption. Replace those expectations with unknown/unambiguously recovered save stamps, and add the old-mod extraction-failure case with different game/save numbers. Evidence: `legacy-probe.cjs/.log`, `failreader-probe.cjs/.log`.

**Fix-round verification**

- Grok's known-running `failReader` mislabel: fixed for a healthy current source with positive `runningBuild`. The independent startup probe returns running 3682 and save null; the new browser test fails on round 1 with `3682 !== null`. This does not resolve the older-mod finding above.
- Live-dot `just` class: fixed at `template/board.js:28654`; repaint removes only the transient flash and preserves `stale`, title and label. The new test fails on round 1 (`live just stale` rather than `live stale`).
- Caption CSS: fixed at `template/board.html:769`. An independent Edge comparison using each revision's production markup/CSS measures a trailing gap of 266.40625 px on round 1 and 10 px on the fix; the committed assertion requires less than 12 px. This checks the CSS separately from the role assertion that stops the combined test earlier on round 1.
- Sketch accessibility: fixed. Production `gwScene()` has role `img`, name from `gwSceneCap`, and description from `gwSceneNote`. Edge's AX tree names it `ILLUSTRATION` (CSS uppercase); Playwright resolves `img` named `Illustration`. The description explicitly identifies the game window and about 60 seconds. The popup is aria-hidden; mock Allow/Deny spans have no interactive roles or focusable descendants, Tab moves straight from a preceding real button to a following one, and hit-testing sends no click to the sketch. The browser probe explicitly checks the DOM and AX tree rather than relying solely on `getByRole('button')`, which excludes hidden descendants.
- Changelog: entry 525 is present, newest first, dated 2026-10-27, describing the new build distinction and illustration instructions. It satisfies the repository's user-facing-capability rule. Its intended unknown handling is subject to the two unresolved findings.

**What still holds from round 1**

- Ten checks compile production `HealthState.cs` and `JsonWriter.cs` against synthetic game API stubs. They cover no version/save, save-first fallback, zero/negative/throwing version reads, a later running build replacing the fallback, retaining it through later misses, version-first loading, and integer JSON serialization. The game API is read on the main-thread refresh on every pump; running build is a separate volatile integer and never comes from the save. Manifest/runtime versions remain 0.8.2, with optional `runningBuild` and schema 5. This is not a Unity SDK build; Unity compatibility tests were inspected, not run in Unity.
- Thirty-three independent validation/rendering assertions pass: missing/null running build is accepted; positive integers below 1,000,000 are accepted; zero, negative, fractional, out-of-range, strings/injection strings, arrays, objects and booleans are rejected. Existing multipart limits remain. Issue body, preview and footer handle neither build, either build, equal builds and different builds; file/folder footer and reading state also pass. Older report clients may omit the field.
- The quiet state still starts after 30 seconds; waiting/quiet wording says the question is in the game and closes after about 60 seconds, consistent with `ApprovalService.PopupSeconds = 60`. The browser regression suite exercises the clock transition.
- All three removed i18n keys are absent from all 24 locale/metadata JSON files and affected source lookups. All eight shipped non-English catalogues use call-site English for the 11 new keys and filter the stale quiet-text translation. There are no orphaned removed-key lookups; this PR does not supply translations of the new wording.
- API/report/privacy documentation consistently describes the optional running build and save stamp, preserves the consent/attachment boundaries, and documents old-client compatibility. The two findings are implementation exceptions to that intended metadata accuracy.

**Tests and evidence**

All commands ran as foreground CLI commands with `PYTHONUTF8=1`; browser tests used the existing Edge (`PLAYWRIGHT_CHANNEL=msedge`). No CLI execution timeout was added.

- Full Python: **2,501 run, 2,500 passed, 1 skipped**, exit 0 (344.665 seconds). Command: `node tools/verify.mjs python` (assembly plus full unittest discovery).
- Full Node: **2,446 run, all 2,446 passed**, no skips/cancellations, exit 0 (1,086.133 seconds). Command: `node tools/verify.mjs node` (assembly plus every `tests/*.test.cjs` suite at concurrency 2, using Edge).
- Freshness: `python build_web.py --check`: exit 0, `web/ is up to date`.
- `git diff --check origin/main...HEAD`: exit 0, no output.
- Regression sensitivity: archived round-1 commit into scratch and copied only the three fix-round test files into that archive. **40 tests: 37 passed, 3 expected failures** (missing image role, retained live flash, known-running startup fallback). The identical three suites on the current head run **40 tests, all passed**, exit 0. The other three new masthead cases and zero/null/old-mod startup cases already pass on round 1; they add coverage rather than distinguish the fix. The old-mod cases need the correction described in finding 2.
- Scratch checks: 10 C# behavior/serialization checks, 33 validation/rendering assertions, 15 accessibility/pointer/keyboard/caption assertions, separate caption comparison, original race and legacy reproductions, four source-switch races, startup-failure matrix, and i18n catalogue checks.

Evidence directory: `C:/Users/Peter/Coding_Projects/.agent-logs/scratch-bc525-r2-astra`.

Logs and reproducible probes: `python.log`, `node-edge.log`, `build-check.log`, `diff-check.log`; `r1-regression.log`, `head-regression.log`, archived `r1/`; `race-probe.cjs/.log`, `source-switch-probe.cjs/.log`, `legacy-probe.cjs/.log`, `failreader-probe.cjs/.log`, `health-probe.ps1/.log`, `build-matrix.cjs/.log`, `scene-probe.cjs/.log`, `caption-compare.cjs/.log`, `i18n-probe.py/.log`.

No tracked files were changed. Probes and archived comparison files are in the designated scratch directory; assembly produced ignored outputs. The only review deliverable in the worktree is this untracked report. No commit, push, merge, deployment, GitHub post, WSL invocation, global installation or modification of another worktree was performed. No separate Worker deployment/dry-run command was invoked. All foreground test/probe invocations completed; no background jobs or watchers were started, and test/probe browsers and servers were closed by their teardown.
