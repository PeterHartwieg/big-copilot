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

## Merge of main (30 Sep 2026)

`origin/main` (122 commits: #174 marketing write, #185 staffing in one step, #189-#192
spare staff and planner) merged. Main wins on staffing and marketing; step 5 adapts:

- **Staff**: the button is main's **Staff this site** (`hrReview({scope: "site", site})`,
  the site panel's action; `osStaffWork()` counts what it would do). Its `only` counts, the
  "Hire n · move m" labels and the scoped "Pick N more" (`hrLast.site`) are gone; main's Pick
  more is scoped by its `site|role` keys. People the plan gives no week (`spSpareIds()`) are
  spare: not counted in "n of m people", never a warning. A gap the plan's own people would
  work (`hrUnstaffedOf()`, kept) offers Staff this site too, which writes the week.
  Review round 1: every pending path offers Staff this site when the site-scoped action does
  anything (`osStaffAct()`, bench assignments and week-only writes included), else the
  in-game step (BizMan › Schedule without the link). Main's short weeks (`band: "short"`)
  are no places: said as "n h a week too few for a hire", and the row stays pending until
  someone here works them. Unticked reassigns count as open places, not moves; the row
  reads `hrMemoModel()`. A marketing mix the write would not change has no button.
  Review round 2: any short week keeps the row pending (a planned move onto it included:
  Staff this site stays) until a later save no longer plans it; a linked player with nothing
  for the action to do still sees the in-game step; the headhunter hint stays beside the
  button. A mix of no campaigns reads "No campaign would raise promotion here" (done), but
  keeps spMkLine's set-up button (`needsSetup`, mode "setup") and a better-mix visit hint.
  Review round 3: the set-up button carries `data-os-mk-mode`, never `data-os-mode` (the
  install-mode toggle); without the write a set-up reads done: it is optional, promotion is
  unchanged; with an unvisited agency the row says "No campaign for …", not "none would". The
  headhunter hint names only the places with nobody; a placed short week's in-game step is its
  hire or move; a padded short week with no slots is none.
  Review round 4: the in-game step names short weeks' planned hires and moves too; a set-up
  with an unvisited agency says "No campaign for …" and keeps the better-mix visit hint.
  Review round 5: `osCkStaff()` builds one action for the row: Staff this site where the
  link can act, else every planned hire and move (regular or short) plus BizMan › Schedule
  where people here have no hours or short hours stay open, plus the headhunter for regular
  places with nobody. Only the row's text differs by path; a table-driven test covers them.
  Review round 6: the plan's bench (fixed moves with no week in `S.weeks`) joins the step as
  "assign n people from the bench"; the schedule step asks only for people the plan uses.
  Review round 7: the bench is state too: it blocks "covered", every text adds "n from the
  bench to assign", and a store whose only people are on the bench says "n hired, on the
  bench · assign them here".
  Review round 8: with only spares at 0 h the row says "n people on staff", no warning;
  bench people count in "n of m" and the bar.

## Release QA (30 Sep 2026)

- After tax is the shown forecast (the range's middle, `OS_MID`) less the tax, with the range
  on hover; the financing panel and step 6 already used `OS_MID`.
- `drawPlan()` keeps `#secIngredients` hidden unless Expansion's view is Plan a factory, so a
  redraw of every page (a language switch) no longer shows it under Open a store. The same
  line exists on main.
- The own-shops heading needs no plural type name: "Your shops of this type, by the same
  rules"; `osTypePlural()` is gone.
- **Marketing**: phase 3's own write (`osMarketingWrite`, `OS_MK_WIRE`, the `marketingOn`
  payload key) is gone. The row reads main's `campaigns` and `marketingPlan`, and the button,
  **Set the cheapest mix**, calls main's `gwMarketing([key], "mix")`; it is disabled with
  `gwMkWhy()`'s reason while an agency cannot add a switch, and without the write it shows
  main's BizMan instruction (`gwMkHand()`, taken out of `spMkLine()`). A plan whose cheapest
  mix is no campaign (promotion full) reads done. `MARKETING_CAMPAIGNS` is now derived from
  main's `MARKETING_TYPES`. The GW refusal texts are main's.
- `_business()` keeps this branch's "no statement before the business opened" rule with
  main's `agencies` argument. i18n catalogues merged per key (main wins on a clash); this
  branch's orphaned keys pruned; two new keys drafted by gpt-6.1-sol.

## What is built

- **Step 6, `osRoiHtml()`**, in the board script after `osUntilHtml()`. `Open` in the
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

## Review round 1 (29 Sep 2026)

- **Peter's UI requests.** A range of profit or days shows its middle, the range on hover
  (`osRange()`, `osMidMoney()`, `.os-rng`), in every step. Step 6's strip shows Open and
  Where only (`.os-pb2`). The checklist line became a third link button, "Until opening ·
  n of 7" (`osRoiUntilBtn()`), gone once all seven are done.
- **Window roll-off.** `_payback_trail()` keeps a site's days from its opening in the payback
  history while the record reaches it (to break even + 30 days, 180 at most) and joins them
  to the record's newer days later, so the row stays exact. Chains still judge by the
  record's own reach. Where the trail and the record no longer meet the row says `rolled`;
  step 6 then shows "Profit in the record" and an unknown share, 100% for a remembered break
  even (`osProgress()`).
- **Plan identity.** `plan.opened` is kept the first time the store is seen (`osMarkPlans()`,
  every plan on every draw); snapshots stop for good. `osAttached()` wants the same opening
  day; otherwise `osClosed()`: step 6 and the list say Closed and what stands there now.
- **Mode.** "Now" follows `paybackMode()`, as Results and the site page; the plan column
  keeps the plan's mode, both headed with their mode when they differ, no difference drawn.
- **Plan cap.** `osCapPlans()`: 12 unfinished, 24 opened (oldest paid-back dropped first);
  `osLoad()` and `osNew()` both apply it.
- **Loan.** `plan.debts` (the loans at creation) and `plan.loan` (bank key and original
  amount of the first new loan from the plan's bank, `osLoanTake()`); two same-amount loans
  are told apart by what is left. Before a match the card shows the bank's whole debt.
- **Chart** points are in days after opening; the calendar day stays in the tile.
- A plan without a snapshot compares the investment only.
- News: Open a store stays in the strip; `upd.news.lang-tr` and `upd.news.help-translate`
  are no longer in the page but remain in the `i18n/` catalogues, left for the i18n round.

## Review round 2 (29 Sep 2026)

- **Trail.** `_payback_trail()` writes the whole known run back to the history on every save
  (capped at break even + 30 days, 180 at most) and drops it, marking `rolled`, once the
  record starts after its last day. Tested over four saves a record apart.
- **Chains** whose members all have whole runs (a trading site's run, or a cost centre the
  record reaches) sum those runs and are exact, so a one-site chain agrees with its site.
- **Older saves.** `osClosed()` needs the save's day past `plan.opened`; before that the plan
  is simply not open and nothing is rewritten.
- **Closed plans** show the closed note on Until opening too; the checklist, the marketing
  write and every `data-os-write` act only on `osAttached(plan)`.
- **Cap.** `osReconcile()` fills `plan.opened` before `osCapPlans()` in `osLoad()` and before
  the room check in `osNew()`.
- **Loans** simplified: the planned loan beside the bank's total debt and daily charges from
  the save, labelled the bank's; no per-plan loan matching (`plan.debts`/`plan.loan` gone).
- **One basis for days.** `est.days[mode].mid` is the break-even day at the middle of the
  profit range (`OS_MID`); the headline, the step 4 chart's line and points, the strip, the
  financing panel and step 6's plan line and first days all use it. Step 6's chart counts
  days after opening from 0 at the opening day, like the tile, with its own key
  (`gr.os.roi.chart.after`).
- `osMarkPlans()` takes a plan's snapshot again only when the board or the plan's type or
  building changed.

## Review round 3 (29 Sep 2026)

- An older save sees only its own days: `_payback_trail()` clips a trail a newer save wrote
  to the viewed save's last statement before joining it and judging the gap.
- A chain is never paid back before its newest member opens (`not_before` through
  `_payback_row()` and `payback_outcome()`, a remembered day included): each member's
  investment is spent on its own opening, as `chain_window_day()` counts it.
- `osLoad()` and `osNew()` save what `osReconcile()` found (openings, paid back), so a reload
  after saving in the game keeps them.
- Step 6's bars are drawn inside the chart's clip.

## Open items

- The in-game paths in step 5's instruction boxes are still unchecked (phase 3).
- Wages still use the structural formula (phase 2 follow-up).
- New `gr.os.roi.*` keys are English only, like the rest of `gr.os.*`.

## How to verify

```
python -m unittest tests.test_payback tests.test_open_store tests.test_payload_snapshot tests.test_doc_registries
node --test --test-concurrency=2 tests/open_store.test.cjs tests/payback.test.cjs tests/navigation.test.cjs
python build_web.py && python build_web.py --check
```

`tests/open_store.test.cjs` has twelve step 6 tests (round 1 added mode, window roll-off, closure and replacement, the cap, two loans, a forecast past the edge, a cost centre and a real `_payback()` row); the first six were: the snapshot frozen at opening and the
step unlocking, just opened with no sales, trading and paying back (tiles, chart, ramp,
days), paid back (done strip, plan list, both links), not paying back with a loan, and an
unfinished checklist plus a plan without kept figures.
