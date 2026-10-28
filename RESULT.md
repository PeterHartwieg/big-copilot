# bc-523-armchair-price

Status: partial â€” investigation and regression coverage delivered; reported wrong unit price not reproduced, so no speculative production change.

PR: https://github.com/PeterHartwieg/big-copilot/pull/542 (draft)
Branch: codex/issue-523-armchair-price
Commit: a29fc6d6 â€” test: guard armchair unit prices and quantity totals (#523)

## Findings and changes

- Read AGENTS.md, CLAUDE.md, README, issue #523 with comments (none), and open PR file lists. Added only tests/test_furniture_prices.py and tests/furniture_prices.test.cjs. No overlap with open refactors; no protected files edited. No delegation.
- The task summary reverses the report: #523 says Ika charges $130, not $1,300. The installed game's Items bundle has defaultMarketPrice=130.0 for ba:itemname_armchair1. Its English name is Sommerhus Arm Chair.
- Read-only audit of all 656 furniture items against ba_item_prices.json found zero differing prices, zero missing items and zero extra items. Other armchairs are $270 and $310. The original price-table commit 0dce9cf9 already contains $130.
- make_item_prices.py reads defaultMarketPrice directly and rounds to cents; no factor-of-ten conversion was found. item_price/setup_cost use the catalogue amount directly unless an actual purchase price is supplied. The planner's Each column uses the unit price and Total multiplies by quantity. Ten $130 chairs correctly total $1,300. This is a possible explanation, not a confirmed root cause of the report. Runtime mod catalogues can override prices; the report supplies no save or screen context to investigate that route.
- Added regression coverage for three armchair unit prices, setup costs for one and ten Sommerhus chairs, and the board's shopping-price formatter. These tests pass on existing production code; they are guard coverage, not evidence that a production bug was fixed.
- Confirmed an in-memory mutation of the Sommerhus price to 1300 makes the Python tests fail. No tracked data was mutated.

## Commands and results

- gh issue view 523 --comments; gh issue view 523 --json title,body,comments; gh pr list / --json number,files: read successfully.
- python -m pip install --disable-pip-version-check --no-cache-dir --target research/unity UnityPy: succeeded. TEMP/TMP and dependencies stayed in this worktree. No game files modified.
- Read-only Python audit using make_demand_curves._behaviours and make_item_prices._price on the installed Items bundle: 656/656 match. Details: research/price-audit.log.
- npm ci with worktree-local npm cache: succeeded (37 packages audited; npm reported four high-severity dependency findings; dependency files unchanged).
- python -m unittest tests.test_furniture_prices: 2 passed.
- node --test tests/furniture_prices.test.cjs: 1 passed.
- In-memory 1300 mutation: expected assertion failures detected.
- npm run verify, with PLAYWRIGHT_CHANNEL=msedge and TEMP/TMP=research/tmp: ran to completion of the Node stage, exit 1. Python: 2,501 tests, OK, one skip. Node: 2,456 tests, 2,349 passed, 107 failed. Log: research/verify.log.
- Of those 107 Node failures, 105 were community Worker setup/runtime failures caused by the long Windows temporary path. With TEMP/TMP set to the worktree root, all 105 Worker tests passed. A community wildcard rerun omitted the browser-channel variable, so its 23 browser tests failed to launch; node --test tests/community-browser.test.cjs with Edge then passed all 23. All 128 community tests are accounted for as passing. Logs: research/community-all.log and research/community-browser.log. The focused community API reproduction also passed 23/23 with the root temporary path.
- Two unrelated local failures remain under the explicit restriction that no temporary files may be created outside this worktree:
  - tests/i18n_catalogue.test.cjs, "the game's words are never written into a git work tree, this one or another": expects a temporary "free" directory outside every Git worktree; here it is correctly refused because TEMP is inside this worktree.
  - tests/verify.test.cjs, "Worker CLI resolves NODE_PATH dependencies without local node_modules or Python": its temporary fixture inherits the real parent node_modules before its mocked NODE_PATH dependency, so worker-args.json is not produced. Did not change these unrelated tests (both overlap refactor work).
- npm run test:optimized: passed (one hosted smoke test), readable assembly restored.
- npm run check:worker: passed; dry run only, no deploy.
- npm run verify:check: passed, web/ up to date.
- git diff --check: passed. Committed only the two test files; pushed only the assigned branch; opened draft PR with Refs #523, without closing/commenting on the issue.
- Hosted CI: all checks passed on run 40636094486: both Python shards and aggregate, all six Node shards and aggregate, and assembly freshness. Node shard 6 also passed the optimized hosted-page smoke and Worker bundle check. CodeRabbit skipped the draft. The two locally constrained fixture tests pass on Linux CI. Run: https://github.com/PeterHartwieg/big-copilot/actions/runs/40636094486

## Open questions and next steps

1. Identify the exact screen and quantity showing $1,300, plus game/save build and mod configuration. Do not attach a private save to the public issue. The issue has neither screenshot nor save.
2. If $1,300 was a ten-chair total, consider whether the existing Qty / Each / Total labels need clarification. That would touch protected template/board.js, so it is outside this task's permitted edits.
3. If a single unit was quoted at $1,300, reproduce with the relevant runtime catalogue or purchase-price data before changing extraction or pricing. Do not change the verified vanilla $130 to $1,300 based on the reversed task summary.
4. Review draft #542 as regression coverage and investigation evidence; the original bug remains unconfirmed. No deploy, merge, release or issue closure was performed.

Local scratch dependencies, audit and test logs remain under ignored research/. This RESULT.md is intentionally uncommitted and copied to the authorized handoff path.

