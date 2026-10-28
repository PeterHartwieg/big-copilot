REQUEST CHANGES

PR #525, review round 1 (Astra). Reviewed detached HEAD `8921712236f6e608d865417b3fdff0516edc1d84` against `origin/main` `9b94cc9eef62c0277779aa25df20bce7d43d7371`.

**Findings**

1. **P2 — Discard obsolete health replies before publishing their running build.** `web/app.js:1170` (also `web/app.js:811` and `web/app.js:2788`).

   Exact repro: start a linked `/health` read, hold its JSON response, select a local save file (which increments `sourceGen` and clears the link), then release the old response with `{schemaVersion:5, build:3682, runningBuild:3682}`. Open a bug report for the file. The production `readHealth()` calls `noteRunningBuild()` before its callers can discard the superseded request. The scratch VM probe runs the actual shell functions, with only synthetic initialization and a deferred fetch; it prints `linkUrl:null, linkRunning:null` after selection, then `linkUrl:null, linkRunning:3682` after the old response. The report context is `{source:"file", runningBuild:3682}`.

   Expected: file/folder reports have an unknown running build, and an obsolete link cannot overwrite the metadata of a newly selected source. Actual: the previous game's build is published with an unrelated file and persists until another source change or health response. Capture and verify source generation/link identity across the awaits before updating this state; also avoid exposing it for a non-link report. A `linkUrl`-only check would not cover switching between two links.

   Evidence: `race-probe.cjs`, `race-probe.log` in the scratch directory below.

2. **P2 — Do not promote an older mod's ambiguous `build` into the save stamp.** `web/app.js:2056` (fallback expression on line 2057; early return at `web/app.js:2781`).

   Exact repro: use an older mod with no `runningBuild`, whose first health refresh already reads `GameVersion` successfully, so `/health.build` is 3682. Load a save stamped 3670, and make dashboard extraction fail before it returns a payload. The reader can still answer its held-save build query with 3670. `buildFrom()` nevertheless stores 3682 in `heldFailure.build`, and `reportContext().gameBuild()` returns it without asking the reader. The scratch probe executes those production functions with a synthetic failing reader and records `{source:"link", reportedSave:3682, reportedRunning:null, actualSaveStamp:3670, readerBuildLookups:0}`.

   Expected: `game unknown, save 3670` when the stamp is recoverable, or unknown save when it is not. Actual: `game unknown, save 3682`, mislabelling the executable build as a save stamp. The old mod's `build` has always been capable of meaning the running executable; absence of the new field does not prove it is a save stamp. Leave `heldFailure.build` unknown unless it came from parsed save metadata, allowing the existing held-save lookup to run.

   Evidence: `legacy-probe.cjs`, `legacy-probe.log`.

**What holds**

- C# stores the running build in a separate volatile integer, reads the game API on the main thread, retries every pump, replaces the early save fallback when a positive version arrives, and retains the running value through later misses. No torn scalar access was introduced. The two published integers are not an atomic snapshot, consistent with the existing health fields; a transition can span a poll. `JsonWriter.Prop(string,int)` emits JSON numbers. Both manifest/runtime versions are 0.8.2; the optional field leaves schema 5 compatible with old consumers.
- Ten scratch checks compiled the production `HealthState.cs` and `JsonWriter.cs` with synthetic game API stubs: unavailable, zero, negative and throwing/unparsable version reads; save-first and version-first loading; later misses; integer JSON output. This is not a Unity SDK build. `BclCompatibilityTests.cs` was inspected, not executed in Unity.
- Worker validation accepts an absent/null running build and only positive integers below 1,000,000 otherwise. The request and report-part byte limits still apply. Strings, objects, arrays, booleans, fractional/out-of-range values and injection strings were rejected. Thirty-three scratch assertions covered validation and the issue/preview/footer combinations: neither build, either build, equal builds and different builds. Old pages omitting the field are accepted; new metadata adds a nullable field without requiring migration of stored reports.
- The sketch has no focusable descendants or action handlers; pointer events are disabled, the visible label says Illustration, and `aria-hidden` keeps the decorative mock buttons out of the accessibility tree. Eight browser assertions checked focus movement, hit-testing and accessible text. Instructions outside the hidden illustration remain accessible. The 30-second transition and 60-second wording agree with the timer and `ApprovalService.PopupSeconds = 60`.
- The three removed keys are absent from all 24 locale/metadata JSON files and affected source lookups. All eight non-English shipped catalogues consistently use call-site English for the 11 new keys and the changed quiet text: stale old translations are filtered by the build. These strings are not newly translated, but they do not use orphaned or mismatched translations.
- `privacy.html`, the API documentation and report documentation describe the intended running/save distinction and optional-field compatibility. Finding 2 is an implementation exception to that documented distinction.

**Test quality and execution**

- Full Python suite: **2,501 run, 2,500 passed, 1 skipped**, exit 0. Command: `$env:PYTHONUTF8='1'; node tools/verify.mjs python` in the review worktree (assembly plus `python -m unittest discover -s tests`).
- Full Node suite with existing Edge (`PYTHONUTF8=1`, `PLAYWRIGHT_CHANNEL=msedge`, `node tools/verify.mjs node`, archived HEAD under scratch): **2,439 run, 2,438 passed, 1 failed, 0 skipped**, exit 1. The sole failure was `tests/finder_costs.test.cjs:124`: `Cannot read properties of null (reading 'width')` while inspecting an address bounding box. Its isolated rerun passed on both HEAD and base (one selected test each); the failure did not reproduce and is not counted as a PR finding. All four changed Node suites passed on HEAD. The first full attempt with the default Playwright channel could not launch its missing Chromium binary (**2,427 run, 912 passed, 1,515 failed**); no browser was installed. The successful browser launch on rerun used the existing Edge installation. No Worker dry-run/deploy stage was invoked.
- `python build_web.py --check`: exit 0, `web/ is up to date`. `git diff --check origin/main...HEAD`: exit 0, no output.
- To verify regression sensitivity, copied the five changed Python/Node test files onto an archived base tree. Report unit/API suites: **44 tests, 39 passed, 5 expected failures** (new field/schema/rendering). Approval/report browser suites: **42 tests, 39 passed, 3 expected failures** (pointer events remain `auto`, new waiting key absent, running field absent). Mock suite: **124 tests, 123 passed, 1 expected failure** (health omits `runningBuild`). The changed 30-second assertion on base fails at missing-catalogue-key lookup, not a distinct assertion about the existing timer, which already worked.
- The committed tests cover the direct field plumbing and basic UI change, but miss both failing shell paths above. Add source-switch/delayed-health and failed-old-mod-reader regressions. C# compatibility tests exercise `RememberBuild` directly; they do not by themselves protect its invocation on every pump or HTTP serialization. The new `getByRole('button')` sketch assertion also excludes aria-hidden descendants by default; explicitly inspect focusable descendants/tab movement to guard future accessibility regressions.

**Evidence and scope**

Scratch directory: `C:/Users/Peter/Coding_Projects/.agent-logs/scratch-bc525-r1-astra`.

- Full-run logs: `python.log`, `node.log` (missing default browser), `node-edge.log`.
- Checks: `build-check.log`, `diff-check.log`.
- Reproductions: `race-probe.cjs/.log`, `legacy-probe.cjs/.log`.
- Additional checks: `health-probe.ps1/.log`, `build-matrix.cjs/.log`, `scene-probe.cjs/.log`, `i18n-probe.py/.log`.
- Base comparisons: `base-node.log`, `base-browser.log`, `base-python.log`; finder reruns: `base-finder-costs.log`, `head-finder-costs.log`.

No tracked files were changed. No commit, push, GitHub post, deployment, WSL invocation or global installation was performed. Probes and archived comparison trees are in the scratch directory. Tests ran in foreground CLI sessions with `PYTHONUTF8=1`; Node used the supplied dependencies through a junction and the existing Edge installation after the default Playwright browser was unavailable.
