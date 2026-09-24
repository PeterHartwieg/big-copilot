# Write dialogs: design notes

Canvas: https://claude.ai/artifact/XjoW7vDDP15Kzm8bBCFUkD (Design type). Generator:
`build_write_canvas.py`; never hand-edit `project/`. `--preview` writes plain HTML to
`_preview/` (both themes) for Playwright screenshots; do not commit `_preview/`.

What the dialogs do is `docs/mod-write-back-scope.md` (sections 2 to 5 and 9) and
`docs/game-link-api.md` ("Writes"). The code they replace is the `gw*` block of the board
script in `ba_dashboard.py`.

## The idea in one line

One dialog shell for every write, read through one signal: **the wire**. Under the title sits
the board's green dot, a line, and the game. Blue packets travelling = asking; solid green =
the game agrees or it is done; broken red = refused; amber = waiting (permission, no answer,
moved on); grey bouncing = busy. The same wire, small, prefixes every write button on the
board, so "this changes your game" is visible before anything opens.

## Decisions made without Peter

1. **No tables.** Every before → after is drawn: shirts for uniforms (dashed = none, gets one;
   grey with a lock = has one, kept), a bar per material for imports (grey now, green added,
   hatched removed, red hatching past the cap = not covered), seven pairs of bars for the
   schedule week. Nothing scrolls sideways; the dialog is 480 px and a bottom sheet on a phone.
2. **Title says the action, not the preset**: "Set uniforms" rather than "Set Default
   uniforms", because the preset can change inside the dialog. The board button keeps "Set
   Default uniforms".
3. **Preset choice is its own row of pills** above the roles, never a dropdown in a sentence.
   With one preset (the usual case) it shows one pill and "the only one in your game".
4. **Apply names what it does and counts it**: "Set 3 uniforms", "Apply 3 changes", "Write the
   week". Cancel is a quiet text button; the hint at the left of the foot says the one thing to
   know ("Nothing changes until you apply", "Written all together, or not at all").
5. **Done stays in the dialog**: the shirts get ticks, the verdict turns to "Done in the game",
   a thin "Reading the game again" line runs until the board has rebuilt, Undo sits beside
   Close. After closing, the Undo strip carries the same sentence plus "Undo stays until your
   next uniform change".
6. **Refusals are grouped by rule**: one red card per rule, the objects as chips, the fix as
   one line with an arrow. The lock-window refusal also draws the hours Sunday 16:00 to Monday
   09:00 with the closed span hatched and "now" ringed.
7. **Uniforms at many shops: "Leave it out"** on a refused shop. The API is all or nothing, so
   today one missing locker blocks six shops. The button drops that shop from the request and
   dry-runs again (page-side only, no API change). Undo then covers all written shops at once.
8. **Imports: the lead sentence became a two-icon legend** (tank = Smart Delivery keeps this in
   stock, truck = arrives every Monday). The number beside each material carries the unit
   ("in stock" / "a week") so the two are never read as one figure.
9. **Imports notes sit on their material's card**, not in a list above: the cap sentence under
   Fabric (Cheap), the Smart-ahead note beside it, the restart with a cash bar (next delivery
   against cash) and an "also starts: Metal Band · 400 a week" chip under the stopped contract.
   Contracts show as numbered pills in delivery order, read-only. No cap marker on a Smart
   Delivery bar (a stock level is never capped).
10. **Verdict meta for imports shows the time left before the lock window** ("orders close Sun
    20:00 · in 6 h"), so the lock refusal is rarely a surprise.
11. **Schedule**: three tiles (entries, hours a week, people), the week as bars with a delta per
    day, then boxes: people left with no shift (pills), the add-people warning (pills for
    unassigned people and dashed pills for hires, a bar of hours written now against hours that
    wait), the overworked day as one line. Full cover shows its open-0-to-24 opt-out as a switch
    with two 24-hour strips, now against after.
12. **Write all N sites**: dots under the title are the run (green written, hollow skipped,
    ringed current). Before apply: "Skip this shop" / "Write the week"; after: Undo / "Next shop
    · 3 of 5". A last dialog sums the run and says Undo holds only the last shop written.
13. **Permission lives inside the write's own dialog**: its first dry run needs permission, so
    the dialog opens in "Waiting for you in the game" with a small scene of the game's popup and
    a cursor heading for Allow. Allowed → it carries on into the dry run by itself. Denied →
    "Ask again". An optional "no answer yet" state after two minutes asks whether the game is
    paused or minimised.
14. **Disabled buttons stay put, dashed**, with an icon for the reason (plug = mod too old, lock
    = lock window, person = nobody here yet) and the reason as the tooltip.
15. Light and dark use the board's own tokens; the canvas `dark` toggle switches every artboard.

## Open questions for Peter

1. **Leave it out** (uniforms, decision 7): keep it? The same could apply to imports ("apply
   only what the game takes"), but there the cap split makes a partial write change other lines'
   figures, so I left it out of imports.
2. **The in-game popup**: I sketched a neutral panel. Should the mod reuse the game's own
   confirmation popup (preferred: it looks native), and is "Settings → Mods → Big Copilot Link"
   the right place to list and remove allowed browsers?
3. **How long the board waits** for an answer in game before "Still waiting" (drawn at 2:00),
   and whether a denial should make the board stop asking for the rest of the session.
4. **Permission token**: the board needs something to remember "this browser is allowed"
   (a token the mod issues on Allow, kept in `localStorage`, not `sessionStorage` as the
   pairing code was). Fine to keep it until the player removes the browser in game?
5. The **"Set for all N shops"** dialog shows shops only as rows of shirts; role names come on
   hover (read-out line). Enough, or should a row expand on click?
6. The **write button's mini wire** (dot, dashes, square) is small at 12.5 px text. If it reads
   as noise, a plain arrow-into-box icon is the fallback.

## Porting note

Every class is `gw-` prefixed at the top level; helper classes inside a `gw-` block (`.a`,
`.ln`, `.p`, `.g` in the wire, `.bars`, `.dl` in the week, `.ic` in cards) are scoped under
their parent. The canvas already hit two collisions with board classes (`.why` and `.bar`), so
check each helper against the TEMPLATE before porting. The dialog stays a `<dialog>` hung off
`<body>` (top layer), as today.

| Canvas component | Classes | Current code it replaces |
| --- | --- | --- |
| Dialog shell (head, verdict, body, foot) | `gw-dlg`, `gw-head`, `gw-kind`, `gw-where`, `gw-x`, `gw-body`, `gw-foot`, `gw-hint`, `gw-b` (`.go`, `.ghost`, `.undo`) | `gwDialog()`, `gwPaint()` (the `btn2` buttons become `gw-b`) |
| The verdict wire | `gw-verdict`, `gw-w` (`.ask .ok .no .wait .busy .moved`), `gw-meta` | the `<p>` lines `gwConfirm()` paints: "Asking the game what it would do…", "Applying in the game…" |
| Loading skeleton | `gw-skel` | the "Asking the game…" paragraph in `gwConfirm().plan` |
| Refusal card | `gw-no` (`.rule`, `.fix`, `gw-chips`), `gw-lock` | `gwRefusals()`, `GW_REFUSE` (group rows by `error` before rendering) |
| Failure states | `gw-said` (`.neg .warn .ok`), `gw-sub`, `gw-drift`, `gw-tries`, `gw-ok` | `gwFailed()`, `gwProblem()`, `GW_CANNOT` |
| After apply | `gw-reread` (+ `.done`) | the "The board reads the game again" line in `gwConfirm().apply` |
| Undo strip | `gw-toast` | `gwToast()` / `#gwToast` |
| Uniform role cards, preset pills | `gw-roles`, `gw-role` (`.to .kept .done`), `gw-shirt`, `gw-badge`, `gw-pick`, `gw-preset` | `gwUniforms()`: `head`/`rows` table and the `gw-preset` `<select>` in `lead` |
| Many shops | `gw-tally`, `gw-shops`, `gw-shop` (`.bad .out`), `gw-minis`, `gw-why`, `gw-mini-b`, `gw-read` | `gwUniforms()` with several keys; "Leave it out" is new (re-run `plan()` without that site) |
| Import cards | `gw-legend`, `gw-depot`, `gw-line`, `gw-lt`, `gw-mat`, `gw-mode`, `gw-num`, `gw-lvl`, `gw-imps`, `gw-imp`, `gw-call`, `gw-cash`, `gw-chip` | `gwImports()` table rows, `gwImportLead()` list items, `gwLineWords()` (each sentence moves onto its line's card) |
| Schedule | `gw-plan`, `gw-tiles`, `gw-tile`, `gw-week`, `gw-wd`, `gw-key`, `gw-box`, `gw-pills`, `gw-cover`, `gw-toggle` (board `.sw`), `gw-hrs` | `gwSchedule()`: its `head`/`rows` table, `lead()`, the `gw-check` checkbox (`gw-open`) |
| Run of sites | `gw-steps`, `gw-run` | `gwSchedule(keys, i)` and its `next` spec |
| Permission | `gw-scene`, `gw-pop`, `gw-cursor`, `gw-ok` | the pairing prompt in `web/app.js` (`gw-pair`, `gwPairCode`) and the `not_paired` case of `gwProblem()` |
| Board buttons | `gw-btn` (`.alt .off .asking`), `gw-mw`, `gw-acts`, `gw-note` | `gwButton()`, `gwUniformButtons()`, `gwRosterButtons()`, the imports buttons |
| Phone sheet | `gw-sheet`, `gw-grab` | none today: the dialog becomes a sheet under 560 px |

`gwTable()` goes away: each kind renders its own visual from the same answer rows. The spec's
`head`/`rows` become one `draw(answer, phase)` per kind, where `phase` is ready, applying,
done or undone, so the done state reuses the ready visual with ticks.
