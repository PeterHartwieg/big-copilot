# Office demand: handover (10 Oct 2026, paused overnight)

Request (Peter, 10 Oct 2026): the office "demand test" never completes in a real game; plan
office staffing from reports like shops. Issue #445. Branch `office-demand`, worktree
`C:\Users\Peter\Coding_Projects\big-copilot-office-demand`. No PR yet. Delete this file
before the PR is opened.

## State

- 9b10c2e1: offices take the shop path (`_office_need()` -> `_run_measured()` + `_need_curve()`);
  the measurement / evidence machinery and its UI, worker/app/watch plumbing and 18 orphaned
  Italian keys are removed; old `staffingEvidence` records are dropped on history write;
  offices are `countsOnly` (no hour findings); `PLANNING_CACHE_VERSION` 3.
- Second commit: round-1 fixes (below). Targeted tests pass (436 Python, 169 Node), payload
  snapshot unchanged, `build_web.py --check` clean, shop staffing byte-identical to main on
  Peter's saves.
- Why measurement never completed: the context fingerprint included raw `building.retailPrices`,
  whose `$id` the game renumbers on save, so `_staff_evidence_ingest()` stopped every office
  measurement within a day or two, long before its 14 days.

## Round 1 (on 9b10c2e1)

gpt-6.1-sol: GREEN. Opus 5.5: NOT GREEN, fixed in the second commit:
1. MUST: a staffed hour with no report became a measured 0 once data was complete. Now it
   falls back to max(office default, today's staffing).
2. SHOULD: censoring compared old reports with today's schedule, so a just-added computer
   read as overstaffing. Coordinator's steer: compare each report with the staffing on at
   report time; if the save cannot give it, floor every hour with a reading at today's
   staffing and keep staffed+1 for full hours; no manual gate. The save holds only
   `{hour, customers}` per hour report and the current week's schedule, so the floor was
   taken. Consequence: office plans only add hours, never cut them.
3. SHOULD: docs/dashboard-reference.md and docs/architecture.md updated to match.
4. NIT: `factsRevision` and `ba_facts.digest()` deleted.

## Next

1. Round 2, scoped to the second commit: Opus 5.5 (Agent "Plan") + gpt-6.1-sol
   (`codex exec -m gpt-6.1-sol -s read-only - < prompt </dev/null`). Check items 1-4 above,
   that the floor is office-only, and that "never cut office hours" is acceptable (flag it to
   Peter in the PR if not obviously so).
2. Then one gpt-6.1-sol QA pass (`-s danger-full-access`) on the built board with real saves
   including an office.
3. Delete this file, open the PR ("Closes #445", no changelog entry), wait for CI green.
   Do not merge or deploy.

Implementation worker CLI session (Opus 5.5), resumable from the worktree:
`claude -p --resume 4b8ae0f8-3d96-4956-a851-98a508e1d254 --model claude-opus-5-5`
