# Open a store, phase 4: after opening

Branch `break-even-core` (PR #175, draft). Step 6 of Expansion › Open a store, ported from
artboard "AfterOpening" of the canvas (https://claude.ai/artifact/BEGQSRsuicrWSpGFsRd4mo).
This completes the flow: phases 1 to 4 release together.

## Merge of main (29 Sep 2026)

`origin/main` (42 commits) merged first. Conflicts: `_initial_customers()` (main's
arrival-ceiling fix is the same helper; main's copy kept), `hrIdleHtml()` (this branch's
`hrUnstaffedOf()` kept, now reading main's `spPlanOf()`), the news strip in `BANNER` and
`tests/news.test.cjs` (Open a store's announcement kept over main's Turkish one), and the
generated files, rebuilt. The payload snapshots moved because main's fixture now sets
`buildNumberAtStart`.

## What is built

- **Step 6, `osRoiHtml()`**, in the board script after `osMarketingWrite()`. `Open` in the
  step bar unlocks with `osOpenedAt(plan)`. Four tiles (Invested, Profit so far, Paid back,
  Break even), the chart (`osRoiChart()`), "Plan and now" (`osRoiTable()`), a PAID BACK
  strip or a NOT PAYING BACK line, the financing card (`osRoiLoan()`), and **Site page** /
  **Payback in Businesses › Results** (`osToResults()`, as search's portfolio entry goes).
  An incomplete checklist adds a note with a link back to step 5.
- **Reuse, not recompute**: the investment, profit so far, recent rate and outcome are
  `paybackSite(key)` in the plan's mode; the tile and strip wording reuse
  `paybackSentence()`/`paybackShort()`.
- **The plan's side is frozen at opening.** `osSnapTake()` stores `plan.snap` (investment by
  part, profit a day, days per mode, the first 30 days from `est.day(k)`) on every draw while
  the address holds nothing of the planned type; it stops once it does. No new storage key:
  the snapshot is a field of the plan in `ba_open_store_v1:<character>`, cleaned by
  `osSnapClean()` in `osLoad()`. Without a snapshot the plan column is worked out live and a
  note says so.
- **Plan history**: an opened plan stays in Your plans with an **Open** tag, "Open · n% paid
  back" or "Open · paid back", its actual investment, and "· open" in the picker. Opening it
  from the list lands on step 6. Step 5 shows a button to step 6 once the store trades.
- **Extraction** (Python): `payback.sites[key].days` (`[day, profit, sales]` from the opening)
  and `.before` for trading sites whose record reaches the opening (`exact`); `loans[].key`, the
  bank's site key, to match the plan's lender. Tests in `tests/test_payback.py`; snapshots
  regenerated; `docs/architecture.md` rows updated.
- CSS `os-roi`, `os-roic`, `os-pvsa`, `os-state`, `os-done`, `os-links`, `os-roiloan` from the
  canvas. The plan picker's select is capped at 200 px so the six steps fit on one line at
  1280 px.

## Decisions

- **Days to break even are compared from the first day with sales as day 1**, the way the
  plan counts (`osBreakDay()`), not from `creationDay` (`after`), since a store can stand set
  up for days before it trades. The tile keeps phase 1's "n days after opening".
- The ramp comparison is "The first 5 days" of sales against the sum of the plan's first
  five days (ramp and hype included).
- Profit a day compares the recent rate (`payback.recentDays`, 14) with the plan's range
  (× 0.80–1.05); the difference is "in the range" or the distance to its nearer edge.
- The chart's plan line starts at the first day with sales at 0; lines past the top are
  clipped, not flattened. Its x axis is capped at four times the days traded (min 40).
- Loans are matched by bank key and the amount closest to the planned one; none means
  "repaid, or not taken".
- Paid back = `reached`, `latest`, or a `window` day already past, as the portfolio says it.
- Changelog: PR 175's entry now describes the whole feature (checklist and after opening).

## Open items

- The 12-plan cap (`OS_MAX_PLANS`) still only drops plans with no building, so twelve
  opened plans block a new one. Consider letting a paid-back plan make room.
- The in-game paths in step 5's instruction boxes are still unchecked (phase 3).
- Wages still use the structural formula (phase 2 follow-up).
- New `gr.os.roi.*` keys are English only, like the rest of `gr.os.*`.

## How to verify

```
python -m unittest tests.test_payback tests.test_open_store tests.test_payload_snapshot tests.test_doc_registries
node --test --test-concurrency=2 tests/open_store.test.cjs tests/payback.test.cjs tests/navigation.test.cjs
python build_web.py && python build_web.py --check
```

`tests/open_store.test.cjs` has six step 6 tests: the snapshot frozen at opening and the
step unlocking, just opened with no sales, trading and paying back (tiles, chart, ramp,
days), paid back (done strip, plan list, both links), not paying back with a loan, and an
unfinished checklist plus a plan without kept figures.
