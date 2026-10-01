# Progress on a change: marked, applied, confirmed

27 September 2026 · chunk 2 of the [UI implementation plan](ui-implementation-plan.md), "Three
meanings of done"; the uniform family and the two-tab rule completed in chunk 3. Code: the board script's `/* --- progress: marked by you, applied, confirmed`
section in `ba_dashboard.py` (`pgRecord()`, `PG_CHECK`, `pgEvaluate()`, `pgPill()`).

## The three states

| State | Looks like | Set by | Cleared by |
| --- | --- | --- | --- |
| **Marked by you** | outlined tick, neutral grey pill | the player's own tick on a change (Supply) or on every entry of a week (Schedules) | the player (untick, *Clear my marks*), or the change itself changing (a new figure is a new row) |
| **Applied · awaiting refresh** | blue link glyph and pill | a successful answer to a supported game-link write (imports, a schedule, a hire or move, uniforms), and nothing else | a later board judging it (below), an Undo of that write, or 14 game days |
| **Confirmed** | solid green tick and pill, "Confirmed · day N" | a board built **after** the write whose data shows the write's postcondition | the player (*Clear these* on Changes, which clears the import records it lists), or 14 game days |

*Not confirmed* (amber) is what a later board says when it shows something else: the game holds
another figure, or a person is at another site. It is never shown as done. A dry run, a click, a
hidden finding or a changed filter sets nothing. A write that failed, was refused, was cancelled or
got no answer records nothing; the dialog says what happened, as before.

"Later" is both: the company's board count (`n` in its store, one more for every board of that
company taken in, kept across reloads) is past the write's, and the game clock the board was read
at is not earlier than the link's clock at the write, both in whole minutes (the link reads the
game's minute as a fraction, the save holds a whole one). A board at the write's own minute may
confirm the write but never says *Not confirmed*: a read already in flight when the write is
applied (the game paused, Update clicked seconds before Apply), or a save file read again after a
reload, may hold the bytes from before it. A save file of the same company read afterwards counts
only if it was saved after the write. A judged record is not judged again.

## Records

Kept per character in `localStorage["ba_progress_v1:<character>"]` as `{v: 1, n, recs: {id: rec}}`.
Without a character id nothing is written, and records last as long as the page; another company's
board reads its own key, so no record crosses companies. Storage that refuses keeps the page's copy.
A save is merged into what is stored: what is stored stands, less what this page took away (an
undo, a clear, an expiry), with the records this page made or judged since its last save over it.
A record that was stored when this page last read or wrote the store (`synced`) and is stored no
longer was taken away in another tab: it goes from this page too, even where this page has judged
it since (chunk 3; chunk 2 kept a judged record and wrote it back). A record made here is never
taken for one. The page's copy then follows the store (another tab's records included), and the
count is the higher of the two. Tabs learn of each other's writes through the browser's storage,
a moment after the write: two tabs acting within that moment can still cross.

A record: `id`, `family`, `target`, `expect`, `rowKeys` (the checklist rows it answers, by key),
`label`, `state`, `at` (ms), `seq` (the company's board count at the write), `load` (the page
load), `clock` (game day, hour, minute), and
once judged `seen` (the board's clock).

## Postconditions by family

| Family | Identity (`id`) | Target | Expected fields | Evidence on a later board |
| --- | --- | --- | --- | --- |
| Import settings (`/write/imports`) | `imports|<depot key>|<material>|smart or weekly|<figure>` | the depot and material | every contract product the answer says it set: `{id, amount, activate}`; the figure shown after (`inGame`), its basis and unit | each named contract, on that line in `supply.factories.depots[<depot>][<material>].contracts`, holds `amount`, and runs where the write started it. Anything else is *Not confirmed*, with the figure the game holds now |
| Shop or office schedule (`/write/schedule`) | `schedule|<site key>|<shift print>` | the site; the plan written (demand, full cover, office default) | the week's shift print the answer gives (`after.print`), entries added and removed | the site's `shiftPrint` in the payload equals it. A site read without a print says nothing yet |
| Hire and move (`/write/hire`) | `hire|<time>` | every site a person was sent to | each person the answer hired or moved, by id (a candidate keeps its id once hired), and the site; counts hired, moved and skipped | every one of them is among that site's people (`staffing[].people`, `officeStaffing[].people`, `factoryStaffing.cap[].people`, or `hiring.people[].site`). Some seen: *partly*; one at another site: *Not confirmed*; none seen (a warehouse or a headquarters keeps no list the board reads): stays Applied, said as "not in the save yet" |
| Uniforms (`/write/uniforms`, chunk 3) | `uniform|<site key>|<skills set, sorted>` | the shop | the skills (roles) the answer says it set at that shop (`rows[].set`), and the preset's name; one record a shop dressed. A refused shop, or one with nothing to set, has none | none of those skills is in the shop's `uniformGapSkills` any more: *Confirmed*. One still there: *Not confirmed*. The shop gone from the save: *Not confirmed*. A board without `uniformGapSkills` (older payload) says nothing yet |

What confirmation does **not** say:

- An import setting confirmed is the figure the game holds. It does not say the stock gap is
  covered (the one-time catch-up is its own row, with its own mark), nor that the factory hours the
  figure was planned on have been set (their own row, never written by the link).
- A schedule confirmed is the week in the game. The people it waited on (hires, the bench) are
  Staff needs'.
- A hire confirmed is the person at the site. Their hours are the site's schedule.
- A uniform confirmed is the roles the write dressed no longer lacking one. It says nothing
  about the other amenities, the satisfaction score or a role hired since.

Undo: an undo of an import, schedule or uniform write takes that write's records back (`pgDrop()`);
a hire has no undo and no record is taken back.

Where a uniform record shows (chunk 3): Businesses › Standards, in the shop's Uniforms cell beside
the write button (`stdTable()`); the business's own page, beside the write in its Satisfaction
block (`spStandards()`); the Overview's uniform finding (`ovStatePill()`). Supply › Changes' clear
(`pgClearSettled()`, imports only) leaves it. Both read
`pgUniformState()`. The write marks Standards and the Overview out of date (`pgUniformStale()`),
so they say the new state when next drawn.

## Manual-only changes

Every other change stays a local note, *Marked by you*, with the checklist's existing
reconciliation: a daily top-up, a wholesale contract, a route to check, a factory's run hours or
input, a catch-up purchase, a Produce up to, a price. There is no verification engine for any of
them. The uniform write keeps its own dialog and undo, and since chunk 3 its records (above).

## Migrations and isolation

| Store | Before | Now | Rule |
| --- | --- | --- | --- |
| Planning basis | `ba_dash_sizing` (device) | `ba_dash_sizing:<character>` | The device key is the fallback for a character with no choice of its own and is never written again; a pick is kept for its company only |
| Import figures | `ba_import_set_v2:<character>` `{value, inGame}` | `ba_import_set_v3:<character>` `{value, inGame, basis}` | v2 entries move with `basis: null`: shown as Needs review, kept out of every write until kept for a basis or reset; v2 is removed only after v3 is written and reads back the same. v1 (bare numbers) is not read, as before |
| Order marks | `ba_order_marks_v1:<character>` | unchanged | Legacy ticks stay Marked by you, never Applied or Confirmed; a mark stands while either basis still has its row, so switching the basis and back loses none |
| Roster ticks | `ba_dash_roster:<site>`, `full:<character>:<site>` | unchanged | Schedules reads them as Marked by you when every entry the board can mark is ticked |
| Progress | – | `ba_progress_v1:<character>` | New; see above |
