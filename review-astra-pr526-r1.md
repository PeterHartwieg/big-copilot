APPROVE WITH NITS

Review round 1 of PR #526, head `00d0c5fde3c453031504c0b40f24a34faa567362`, against `origin/main` / `bbbc3fc1fc936f20adb8e19148ce8958d2261a3a`. The targeted #525 round-4 P3 is fixed. No new blocking issue found. One related, pre-existing P3 remains in the requested link-switch coverage.

**Finding — nonblocking, also present on the base commit**

1. **P3: A newly selected link's running build is not painted when its replacement save fails to build.** `web/app.js:1201`, `web/app.js:1366`, `web/app.js:2859`; the repaint consumer is `template/board.js:28615`.

   Exact repro: open a linked board with save build 3670, verified build 3682, running build 3690. Re-choose Link at the same URL, or select a link at another port. Have the new link answer supported schema 5 and `runningBuild:3700`, then make the replacement Worker build fail. The retained board is correctly Stale and report context correctly contains `source:"link", runningBuild:3700`, but the footer says **Game build 3670**, with no **BUILD 3700 UNCHECKED** flag. Expected: **Game 3700, save 3670** and the 3700 warning. Another identical health reply does not repair it; a subsequent successful build does.

   `readHealth()` calls `noteRunningBuild()` before `loadFromLink()` sets `linkHealth`. During that notification, `LEDGER_SOURCE.link()` returns null, so the repaint sees no link. Assigning `linkHealth` does not notify again, and an unchanged running build short-circuits subsequent notifications. Consider notifying once the link metadata exposed to the board becomes available.

   This is **not introduced by #526**: the same-URL and different-URL cases reproduce identically on the archived base commit, including recovery. The targeted removal of the former running build works. Evidence: `link-reselect-probe.cjs`, `link-reselect-head.log`, `link-reselect-base.log`. This Edge probe uses the production Link button handler, HTTP routes and synthetic Worker replies; no production source is changed. Both runs have zero page errors. Strict matrix failures were also rerun individually in `footer-{different-link,same-link}-isolated.log` before base attribution.

**Status of the #525 P3 and source-switch checks**

- Adapted and reran `footer-source-probe.cjs`. Choosing a failing `.hsg` changes **Game 3690, save 3670** to **Game build 3670**, removes the former running game's warning, and leaves the retained board Stale. Report context is file/null. Zero page errors.
- The extended real-DOM matrix covers file selection, folder selection through a mocked native folder picker, direct `dropLink()` disconnect, different-URL link selection, and same-URL reselection. All five clear the former build immediately. The strict file/folder/disconnect cases pass; the two link cases expose the pre-existing finding above after their new health/read sequence.
- Repaint preserves the live indicator's persistent classes, Stale label, reason/title, and board title, and removes the transient `just` flash. The lost-handler/off-state check retains **Not live**, no Stale class, and an empty title.
- Later successful reads on file, folder and both link replacements render the new save build 3675, clear Stale/title, and show the proper running/save pair. Recovery from disconnect was checked by choosing a new file. The actual Link-button diagnostic also confirms the new 3700 warning appears after recovery.

**#525 regressions and test quality**

- All seven requested probes pass: `extended-health-probe.cjs`, `browser-order-probe.cjs`, `race-probe.cjs`, `source-switch-probe.cjs`, `legacy-probe.cjs`, `failreader-probe.cjs`, and `ordering-matrix.cjs`.
- Extended health: 12 cases, including six source invalidations, three legitimate replies and three out-of-order watcher/Update overlaps. The older zero, omitted and positive values never overwrite 3682. The independent Edge Response/ReadableStream case also retains 3682 through the actual retry.
- Ordering matrix: 22 cases pass, including every completion order of three reads, later invalid/failed reads, newer explicit unknown values, same/different-URL generations, and an earlier success while a newer read remains pending. Schema and clock stay with the newest accepted publication.
- File/folder report context remains running-unknown; a newer link keeps its own running build. Old-mod `health.build=3682` does not become the running build or replace the reader-derived save stamp 3670. Four reader-startup failure variants keep an unparsed save unknown and preserve an independently known running build.
- Probe adaptations change only the review root, the old footer bug expectation to the fixed expectation, and the expected new null callback on drop/reselection. Prior probe sources remain untouched.
- The two changed committed test files pass **132/132** on HEAD. Copying those HEAD tests into an archive of `bbbc3fc1` yields **126 passes and 6 expected failures**: the two new tests and four existing source-switch cases updated to require the clear notification. The failures are the intended callback/footer assertions, not setup failures. The tests meaningfully protect shell notification ordering and the retained board's footer/warning. The mast test's stub keeps one element per ID rather than recreating DOM children; real replacement-node/label/title behavior is independently covered by the Edge probes above.

**Full verification**

All commands ran in the foreground with `PYTHONUTF8=1`; browser tests used the existing Edge through `PLAYWRIGHT_CHANNEL=msedge`. No CLI execution timeout was imposed.

- Full Python, `node tools/verify.mjs python`: **2,501 run; 2,500 passed, 1 skipped, 0 failures**, exit 0, 293.736 seconds. The logged synthetic `RuntimeError: half way` is an exercised recovery path; the suite finishes OK.
- Full Node, `node tools/verify.mjs node`, all 114 test files at concurrency 2: **2,456 run; 2,456 passed, 0 failures/skips/cancellations**, exit 0, 1,107.203 seconds.
- `python build_web.py --check`: passed after the suites, exit 0, `web/ is up to date`.
- `git diff --check origin/main...HEAD`: passed after the suites, exit 0.

**Evidence and workspace**

Evidence directory: `C:/Users/Peter/Coding_Projects/.agent-logs/scratch-bc526-r1-astra`.

The seven regression probes have matching `.log` files. Footer evidence: `footer-source-probe.cjs`, `footer-source-head.log`, `footer-matrix.cjs`, `footer-matrix-clear-strict.log`, `footer-matrix-observed.log`, `footer-link-base-observed.log`, the isolated strict logs, and `link-reselect-{head,base}.log`. The observed matrix deliberately records the identified discrepancy and continues to test recovery; its successful diagnostic exit does not mean the discrepancy passed. Other evidence: `head-focused.log`, `base-new-tests.log`, `base-assemble.log`, `python.log`, `node-edge.log`, `suite-exits.json`, `build-check.log`, `diff-check.log`, and the base archive under `base/`.

Tracked files remain unchanged. Assembly writes ignored outputs; this report is the sole untracked review deliverable in the worktree. The base comparison was extracted into this review's scratch directory, not another worktree. No commit, push, merge, deployment, Wrangler invocation, GitHub post, WSL invocation, global install, process killing or background job was performed. Probe browsers close in finally blocks; all foreground test commands completed before delivery.
