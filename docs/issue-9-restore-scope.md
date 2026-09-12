# Issue #9: loading a previous save

Selected scope, 12 September 2026. The user chose the prominent loading indicator and subsequently authorized implementation and release.

## Proposed change

When reopening a remembered save, make **Loading your previous save…** the landing screen's main message, with an indeterminate progress bar. Reuse the existing source strip and make the large import prompt secondary. Keep Change folder, One save file, and drag-and-drop available.

Use one loading message throughout folder scanning, reader startup, and save processing. Detailed stages, percentages, personalized messages, and a separate slow-loading state are unnecessary for this slice.

When fresh data is ready, open the remembered page. Cached page content is excluded: it would let players read old figures during the wait, but adds storage, stale-data labeling, and invalidation work that the chosen approach does not need.

## Four visible states

| State | What the user sees |
| --- | --- |
| No remembered folder | The existing import screen. While checking stored access, a neutral “Checking for a previous save…” message is sufficient. |
| Permission needed | “Your save folder is remembered” and the existing Open chosen/newest save button. Request permission only after a click. No spinner while waiting for permission. |
| Restoring | Prominent “Loading your previous save…” and progress animation. Remove the misleading one-click instruction. |
| Failed | A clear reason and usable recovery: reopen/change the folder for access or file problems; Reload app for a failed reader. Stop the animation and release busy state. |

Success removes the landing and shows the board. Keep status accessible to screen readers, respect reduced motion, and ensure controls wrap and remain keyboard accessible.

Use one timeout to prevent an indefinitely stuck restore; 120 seconds is a provisional default to validate with a slow startup and large save. Explain timeout honestly, offer Reload app, and ignore late results. No automatic reload or in-place worker restart.

## Preserve existing behavior

- Remember the page/subpage and save selection: newest anywhere, newest for a character, or a named file. Keep recognized URL destinations ahead of stored page preferences and avoid extra history entries.
- Preserve current missing-selection fallbacks and their visible warnings: a missing named save falls back to that character's newest save; a missing character folder falls back to newest anywhere.
- Never request folder permission automatically. Missing or unsupported stored access leaves manual import usable.
- A newly selected folder, file, or save supersedes restoration. Old completions and errors must not change the board, status, persisted history, or watcher. Dismissing a picker alone does not supersede it.
- Subsequent refresh failures still retain the last good board.

## Necessary code work

| Touchpoint | Work |
| --- | --- |
| `build_web.py` | Adjust landing prominence and accessible progress markup; regenerate `web/index.html`. |
| `web/app.js` | Drive the states above, settle failed/timed-out requests, and guard asynchronous results so only the current selection takes effect. |
| `web/worker.js` | Change only if needed for reliable startup-failure reporting. Detailed progress stages are not required. |
| `ba_dashboard.py` | Verify the existing first-data boot and navigation handoff; prefer leaving navigation logic intact. |

Two findings make this more than a text change: `buildFrom` can deliver an obsolete result, and `worker.onerror` does not settle pending requests. Save-menu changes within the same folder also need to supersede old work. Fix these within the restore flow; avoid a general loader rewrite.

## Done when

1. Reload and a fresh visit clearly show restoration during slow reader startup and a large-save load, then open the correct page and save without an intermediate Today visit.
2. Granted, prompt, denied, missing, and unavailable access all behave correctly, with explicit permission gestures and usable recovery.
3. Changing source or save during any pending restore prevents old results or errors from taking over, including persisted history changes.
4. Folder/save errors, reader failure, and timeout stop loading and expose working recovery. Late results cannot revive an expired attempt.
5. Existing resume/navigation tests pass, with added delayed-restore and remembered-selection coverage. Browser checks verify the actual landing-to-board transition, narrow layouts, keyboard access, and reduced motion.

Validation: 62 JavaScript/browser tests and 17 Python tests pass. The save checker passed all 25 supported saves and skipped 40 older saves. A real-reader smoke test loaded a 4.9 MB save into the remembered Supply / Checks page in about 5.8 seconds, including a deliberate two-second worker-start delay; reload also passed with no uncaught errors. That smoke test used a simulated granted folder handle with the actual worker, save processing, and board rendering. Native permission-dialog behavior was not manually tested. Desktop and narrow loading layouts were visually inspected.

The 120-second timeout remains a conservative default, not a measured limit for every device. Obsolete callbacks, permission states, malformed responses, worker failure, timeout/reload, and source changes during loading have browser regression coverage in `tests/restore.test.cjs`.

Review decision: the user accepted the two medium-severity findings without changing their behavior. When a failed save build leaves automatic watching off, show “Automatic updates are paused. Click Update to retry.” The warning clears on a successful retry. The unrelated-file drop behavior remains as reviewed.

Source: [issue #9](https://github.com/PeterHartwieg/big-copilot/issues/9), inspected with no comments; code at `ee867829b31647e5e063d022729ef6bab80859a7`. No further product decision is needed to scope the indicator approach.

Excluded: cached content, performance optimization, navigation redesign, new browser/file restoration support, README/Mac documentation, and product-grouped shipments. The pull request and deployment record track the release of this scope.
