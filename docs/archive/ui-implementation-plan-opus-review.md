# Opus 5.5 implementation plan review

26 September 2026. Read-only review, completed successfully using Claude Code 2.1.283. Requested and responding model: `claude-opus-5-5`; no tool permission denials. No canvas inspection or tests were performed.

The findings below refer to the plan before review edits. All five suggested clarifications have been incorporated into [the implementation plan](ui-implementation-plan.md), with explicit migration safeguards. The deployment-policy claim in finding 1 was not established by the contributing document inspected by the coordinator; a dedicated integration branch was accepted independently to keep the incomplete migration out of main.

## Reviewer response

**Verdict: ready with minor edits.** The three chunks are practical, the coverage split adds up (22 + 33 + 50 = 105, and the IDs match the feature map), and I found no retirement or archive scope and no new writes. Two points need fixing before work starts, because they decide where chunk 1 lands and what "done" means for it. The other three are small wording edits.

### Blockers

**1. Where the chunks are integrated, and how release is held back** (lines 9, 104, 114)
- The plan says "integrate each chunk" and to hold public release until the whole migration passes. It never says what chunks are integrated into.
- Under the current project rule, any merged PR without a mod update may be deployed, including by other sessions. So if chunk 1 merges to `main`, a half-finished migration can go public. Line 114 also rules out a feature flag.
- Suggested edit to line 104: "Chunks merge into one integration branch (e.g. `ui-redesign`), not `main`. At the start of each chunk, and before the final PR, merge current `origin/main` into that branch and re-check the feature map for capabilities added since. Only the finished migration opens a PR to `main`."
- This also fixes a gap at line 20: capabilities are only reconciled against `09c5c32` once, while `main` keeps changing `ba_dashboard.py` (the hairdresser work, for example).

**2. Chunk 1's acceptance needs destinations that only exist after chunk 2** (lines 26, 40, 44)
- Chunk 1 must "open every finding kind's destination" and reach Imports, Production, Staff needs (hiring and demands views) and Goods flow with "no dead tabs".
- Those task views don't exist in current code. Today's Supply is split into Shops, Warehouses and Factories tabs, and chunk 2 builds the task views.
- As written, an implementer either builds half of chunk 2 inside chunk 1 or fails chunk 1's acceptance.
- Suggested edit, added to the paragraph at line 36: "Chunk 1 fixes the canonical route IDs for every final local view. Each one points at an interim target: an existing renderer or section, with scope, filter and row exposed. That target is listed in the route table. Chunks 2 and 3 replace what the route shows without changing the route or its aliases."
- Change line 44 to "open every finding kind's final route (showing the interim target at this stage)".

### Should fix (not blocking)

**3. Moving existing saved state into the new plan model is not specified** (lines 52–54, 80, 82)
- Current storage:
  - `ba_import_set_v2:<character>` holds `{value, inGame}` and does not record the planning basis (`ba_dashboard.py:21797`).
  - `ba_order_marks_v1:<character>` holds plain string marks, which `reconcileOrderMarks` checks against the current rows.
  - Staffing keeps its ticks under `SP_ROSTER_STORE`.
- The plan wants overrides tied to a basis and marks keyed by the proposed values. "Where the existing code permits" leaves the legacy data undefined.
- Suggested addition to Shared behavior: "Legacy overrides load as overrides whose basis is unknown and show 'needs review' on first display. Legacy ticks become 'Marked by you'. Neither is dropped or silently re-keyed. Migration tests cover v1/v2 keys."

**4. "Confirmed" may quietly become new work** (line 82)
- Confirming "later source evidence matching that action's postcondition" for every checklist action would mean a postcondition checker for delivery targets, routes and factory hours. None of that exists today.
- Suggested edit: "Confirmed applies only where a postcondition can be read back from the source: import amounts and shop staffing plans in chunk 2, the uniform write in chunk 3. Chunk 2 records these in a short postcondition table. Every other action stays 'Marked by you', using today's reconcile behaviour."

### Optional

**5. The arrival strip from the proposal is not in the plan** (§4 "Arrival", line 100 of the proposal)
- The proposal's "From Needs attention · Water at Bridge Hub" strip, with its return route, is the visible half of the return contract. The plan only describes restoring state.
- Suggested addition to chunk 1's acceptance at line 44: "The destination names why the player arrived and offers a return link."

Everything else is already covered: the proposal-consistency test from the QA, the recurring order vs one-time catch-up split, the All tools anchor fix, the contextual selectors, and the CLI and Pyodide boards sharing one template. This was a read-only review of the documents plus two storage functions. I didn't look at the canvas or run anything.
