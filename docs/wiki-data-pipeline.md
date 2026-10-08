# Wiki data pipeline

`tools/build_wiki_data.py` builds the Wiki's pages, business guides and source
metadata from the installed game's help. Hand-written topics travel alongside
them. This document describes the inputs, output and limits.

## What it reads

Game files, the building table and authored wording, never a save:

| Source | Path | What it provides |
| --- | --- | --- |
| Locale | `<Big Ambitions_Data>/StreamingAssets/locale/en.json` | Every help page's text and every name, keyed `ba:businesstype_*`, `ba:itemname_*`, `recipes_*`, `help_factory_workstation_*` |
| Help structure | `<Big Ambitions_Data>/StreamingAssets/helpstructure.json` | The help menu's table of contents: `pageLocalizorKeyPrefix` → page `slug` |
| Layouts | `<Big Ambitions_Data>/StreamingAssets/BusinessLayouts/GiftShop/` | Observed furniture placements and layout build numbers |
| Buildings | `ba_buildings.json` | Supplier addresses, neighbourhoods and building facts |
| Wording and topics | `tools/wiki_sample.json`, `tools/wiki_topics.json` | Guide labels, notes and hand-written articles |

`helpstructure.json` is hand-edited and fails a strict JSON parse on trailing
commas. `wiki_data.load_help_structure` repairs exactly that — a string-aware
scan that drops trailing commas — and records in provenance that the parse
was lenient and what was dropped. Anything it still cannot parse is an error,
never `eval` and never an empty success.

## What the facts are not

These are **documented game facts**: what the help text states, not what the
running game does.

- **The help can lag runtime behaviour.** A recipe's rated output in help text
  is the number the manual states, not a measured rate. The dashboard's recipe
  and workstation parsers also read help text; they do not independently verify
  those rates. Save-specific observations need separate provenance.
- **Nothing numeric is invented.** If a rate, capacity or requirement is not in
  the text, the field is absent or `null`. Wording the parser cannot resolve
  (a requirement stated in prose, alternatives joined by "or") is listed under
  internal `unparsed` records instead of being guessed; the original page
  preserves that wording.
- **Build metadata is only what was observed.** The Steam `buildid` comes from
  `appmanifest_1331550.acf` when that file is readable and identifies Big Ambitions; the save's
  `buildNumberAtLastSave` is a different number and is not available to the
  builder at all, so it is `null` with an explanatory note. Unknown values never
  use the dashboard's `MIN_BUILD`/`VERIFIED_BUILD` constants, which are code,
  not observations.
- **Raw help ships as written**: each page's `body` in `pages[]` is the game's
  own text, so a half-understood page can always be read as the game wrote it.

## Parsing limits

- Recipe help that states no rated output produces no record — the same choice
  the dashboard makes. Guides report the missing rate and leave it unknown.
- Item pages the game links inconsistently ("used in the following recipes"
  sometimes links products) are handled by accepting both link kinds and
  recording the field honestly; they are not reconciled against save data.
- Business types whose help states no primary range (factory, headquarters,
  warehouse) appear in internal `unparsed` records with the reason. That is expected; those
  businesses do not sell a product range.
- Locale coverage comes from the installed English `en.json`.

## Tests

`python -m unittest discover -s tests -p "test_wiki*.py"` covers parsing,
guide behaviour, source metadata, malformed inputs, deterministic writes and
static pages. Fixtures are synthetic; no test needs a save or installed game.

## The public payload

`tools/build_wiki_data.py` builds what the wiki tab ships:
`web/wiki-data.json`, built by `build_public_wiki(data_dir)` and written by
`write_public_wiki(path, data_dir)` — the latter is what `build_web.py` calls
before stamping, so the payload's hash is part of the page's build stamp.

The contract (`schemaVersion: 1`):

- `categories` — the fourteen help menu groups, each with its slug as `id`, the
  game's label, an honest `count`, and the `pageIds` it holds.
- `pages` — every distinct help page, `id` being the helpstructure slug and
  `body` the help text as the game wrote it (markdown-ish, links and all). A
  slug listed twice keeps its first entry; the second is named in provenance.
- `guides` — visual guides keyed by `businesstypes-*` page ID for the 21
  customer-facing businesses. Each includes
  its primary and secondary products, equipment, suppliers and recipes.
  `BUSINESS.primary` and `BUSINESS.secondary` contain short product IDs;
  `extras` retains the secondary product names for older consumers.

  `PRODUCTS` distinguishes physical goods from fees. Fee cards carry source
  wording for collection requirements, preserving alternatives and conditions.
  Every product can reference multiple recipes; each recipe selects its own
  entry in `WORKSTATIONS`. `WORKSTATION` remains a compatibility field for a
  guide with only one workstation. Secondary products receive the same cards
  and recipe flows as the primary range, in separately labeled sections.

  `BUSINESS.requirements.raw` preserves the original linked requirement lines.
  Capacities retain their product labels and units. Missing facts remain
  unknown, with source links or gaps, rather than reusing old values. Shipped
  Gift Shop layout observations are scoped to Gift Shop.
  Fixture `groups` preserve links to equipment groups, and office workstation
  components resolve to their own equipment and suppliers. All neutral sections
  of a group are retained, including both toilet and sink options; business-specific
  extensions remain scoped. Linked prose requirements retain their conditions.
  Product furniture lists honor the source's business-specific assignments, and
  other sellers include both primary and additional businesses. `BUSINESS.hiring`
  carries the business’s recruiters; `hiringBySkill`, when present, keeps the
  verified recruitment links for each skill.

  Each guide's `GAPS` combines missing-data notices with applicable source limits.
  Price and source-quality checks use the pages that guide reads; recipe limits
  appear only where recipes are shown.

  Authored copy lives in `tools/wiki_sample.json`: `guideUi` supplies shared
  labels, `guideGaps` supplies missing-data messages, and `guides` contains
  business summaries and notes. Each summary
  and note has source conditions; it is included only while those literal
  excerpts still appear in the named help pages. Review the wording whenever
  related game content changes. Facts continue to come from the builder.
- `topics` — hand-authored articles, sorted by slug, carried through from
  `tools/wiki_topics.json` exactly as written. This is the one part of the
  payload the game does not write: an article covers something the help never
  states, so each carries `slug`, `title`, `lede`, `sections` (a `heading`, its
  `paragraphs`, and at most one `table` of `columns` and `rows`) and a
  `provenance` line naming what it was checked against and when.
  `validate_topics` refuses a missing provenance line, a duplicate slug, a
  section with no paragraphs, and a table row that does not fit its columns;
  nothing here is derived, filled in or dropped. `provenance.counts.topics`
  counts them, and the wiki renders them under the Big Copilot badge. Nothing
  rebuilds an article when the game patches, so each is reviewed by hand
  ([Hand-written topics](#hand-written-topics)).
- `provenance` — schema name, source paths as game-relative names with SHA256
  and byte counts, Steam app and depot build, the sources' newest file
  modification time as `sourceDate`, duplicates, links that point at no page,
  and issues (addresses the building table does not know, a missing or corrupt
  building table, layouts that would not read).

Supplier keys are the same `ba:street_<slug>#<number>` site keys the map page
uses, so cross-references join. `ba_buildings.json` gives each address its
neighbourhood (as the game's key, `ba:neighborhood_<id>`, which the page names
through `hoodName()`), size code, area and traffic; without it those fields are
null and the miss is listed, not guessed. A page record whose help prefix is a
game key (an item, a business type) carries it as `key`, which is what the
page's "Yours" strip matches the open save on; the title is only words.

What the payload deliberately does not carry, each as a gap that is only
written while its check still holds: prices for a guide (the pages the
guide reads carry no money figure — what other pages hold is reported as
measured, not claimed away), weekly delivery limit numbers (the help states the
caps exist and never gives one), and the save build number (an install shows
Steam's depot build id and the builds its shipped layouts were authored at;
neither is the number a save carries, and no save was read). A patch that
prices a guide's goods or numbers the limits removes its own gap from the
next build. A wording slot the builder cannot fill is a build failure, not a
literal `{count}` in the shipped file.

The output is deterministic: sorted iteration, no run timestamp, `sourceDate`
is the newest mtime of the game help and counted layouts rather than the moment this ran (each guide's
SOURCES block repeats it as `sourceDate` and keeps the mockup's `extracted` key
with the same value), each source row records its hash and size with a null `mtime`
(Steam touches unchanged files, and the hash already says whether the bytes moved), and
`write_public_wiki` skips the write when the bytes
did not change. When the source date is all that changed (Steam touched a file without
changing it on a later day), it keeps the standing file and its date. Source paths in the payload are game-relative; a privacy check
rejects any build that would leak an absolute path, a user name or save data.

### Commands

With no `--data-dir`, the builder uses `ba_save.find_game_locale()` or
`BA_LOCALE`. The locale must be inside the game install at
`<game>/.../StreamingAssets/locale/en.json`, beside `helpstructure.json`.

```sh
# Rebuild the shipped payload (build_web.py does this too)
python tools/build_wiki_data.py --out web/wiki-data.json

# A second install, and an alternative building table
python tools/build_wiki_data.py --data-dir "/path/to/Big Ambitions_Data" \
    --buildings /path/to/ba_buildings.json
```

A bad required source — locale or helpstructure — exits with code 2, prints
`error: …` on stderr, and leaves the previous payload standing. The optional
sources (`ba_buildings.json`, shipped layouts, the Steam manifest) are recorded
as absent instead.

### Hand-written topics

A topic is an article about something the game's help never states, such as how
rent is computed. One object per article in `tools/wiki_topics.json`.

- Paragraphs take the help's own `**bold**` and `[label](target)` markdown and
  are drawn by the same reader, in the guides' vocabulary, under the
  **Big Copilot** badge; the provenance line closes the page.
- State the date and game build the numbers were checked against, in the text
  and again in `provenance`, so a patch dates the article rather than silently
  contradicting it.
- It is routed as `#wiki/topic%2F<slug>`, found by the wiki's search, listed
  under "Big Copilot topics", and gets `/wiki/topic/<slug>/` from
  `tools/wiki_pages.py`. A new one is marked New by listing its slug in
  `WIKI_NEW.topics` in `web/wiki.js`.
- Nothing rebuilds a topic: review each one on every game update
  (`docs/game-update.md`).

## Static pages for search engines

The in-app wiki draws every entry inside the board, so a search engine sees one
URL and none of the text. `tools/wiki_pages.py` writes the same entries as
plain, script-free HTML from the committed `web/wiki-data.json`:

| Path | What |
| --- | --- |
| `/wiki/` | the index: every topic, category and entry |
| `/wiki/c/<category id>/` | one per category |
| `/wiki/<page id>/` | one per help page |
| `/wiki/topic/<slug>/` | one per hand-written topic |
| `/sitemap.xml`, `/robots.txt` | `/`, and every page above; robots allows all and names the sitemap |

- **Furniture is left to the app.** Its 521 entries of equipment stats get no
  page, its category gets none, and a link to one goes to `/#wiki/<id>`.
- **Slugs are the payload's ids, unchanged**, because they are linked from
  outside. An id that could not stand as a path segment (or would shadow `c`
  or `topic`) stops the build rather than being rewritten.
- **The markdown follows `web/wiki.js`**: `wikiInline`'s bold and link rules,
  `wikiBody`'s bullets, label headings and paragraphs. A link to a page that
  does not exist, or to the page itself, is plain text; an address is text.
- Each page has its own title, a meta description (the body's first sentence,
  or the topic's lede), a canonical `https://bigcopilot.com/wiki/.../` URL, an
  "Open your save in Big Copilot" link to `/` and an "Open in the app" link to
  the same entry under `/#wiki`. A business guide adds one table of what it
  sells, where it is sold from and who supplies it.
- Styles are inline; the only request is `/fonts/fonts.css`. No script, no
  third-party request, so the privacy notice holds.

`python build_web.py` and `python build_web.py --assemble` write them after the
payload, and remove pages the payload no longer has. They are not committed. `python build_web.py --check` rebuilds them in memory
from the committed payload and reports a missing, edited or orphaned page or a
stale sitemap. Neither step needs the installed game for this part, and
`python tools/wiki_pages.py` (or `--check`) runs it alone. Tests:
`tests/test_wiki_pages.py`.
