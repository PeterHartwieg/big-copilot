# Wiki data pipeline

How the game's own help text becomes the catalogue of documented facts the
Companion's wiki pages will read, and what those facts are and are not.

Status: first increment. The extractor runs and its output is verified, and
`tools/build_wiki_data.py` builds the public payload the wiki tab ships (see
[The public payload](#the-public-payload)). Content design lives in
[wiki-content-design.md](wiki-content-design.md); this document is about the
data and its provenance.

## What it reads

Only files the game ships, never a save and never the dashboard's own
inferences:

| Source | Path | What it provides |
| --- | --- | --- |
| Locale | `<Big Ambitions_Data>/StreamingAssets/locale/en.json` | Every help page's text and every name, keyed `ba:businesstype_*`, `ba:itemname_*`, `recipes_*`, `help_factory_workstation_*` |
| Help structure | `<Big Ambitions_Data>/StreamingAssets/helpstructure.json` | The help menu's table of contents: `pageLocalizorKeyPrefix` → page `slug` |

`helpstructure.json` is hand-edited and fails a strict JSON parse on trailing
commas. `wiki_data.load_help_structure` repairs exactly that — a string-aware
scan that drops trailing commas — and records in the catalogue that the parse
was lenient and what was dropped. Anything it still cannot parse is an error,
never `eval` and never an empty success.

## What it writes

One JSON catalogue. `tools/wiki_data.py` validates the shape before anything
is written:

```text
schema "ba-wiki-catalogue", schemaVersion 1, generated <UTC>
source:   kind "game-help", per-file sha256 and size
build:    steamBuildId / saveBuildNumber, null unless observed
records:  businesstype / item / recipe / workstation
unparsed: help text the parser could not honestly turn into a field
raw.help: the untouched help text, keyed by locale key (--no-raw omits it)
```

Records link to each other by slug (`ba:itemname_cheapgift`, `recipe/x`),
every record carries the locale keys it was read from, and `counts` summarises
the record types. Writing is atomic: the text is validated first, then moved
into place, so a failed run leaves the previous catalogue standing.

Sample output from the current game install is under `research/wiki-data/`,
which is gitignored — it is exploratory, and no game asset is copied into
`web/` or published.

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
  `unparsed` with the verbatim text instead of being guessed.
- **Build metadata is only what was observed.** The Steam `buildid` comes from
  `appmanifest_1331550.acf` when that file is readable and identifies Big Ambitions; the save's
  `buildNumberAtLastSave` is a different number and is not available to the
  extractor at all, so it is `null` with an explanatory note. Both are `null`
  rather than the dashboard's `MIN_BUILD`/`VERIFIED_BUILD` constants, which are
  code, not observations.
- **Raw help is preserved separately** from the parsed facts, so a half-
  understood page can always be read as the game wrote it.

## Limits of the first increment

- Recipe help that states no rated output produces no record — the same choice
  the dashboard makes — and the gap is not currently itemised beyond `counts`.
- Item pages the game links inconsistently ("used in the following recipes"
  sometimes links products) are handled by accepting both link kinds and
  recording the field honestly; they are not reconciled against save data.
- Business types whose help states no primary range (factory, headquarters,
  warehouse) appear in `unparsed` with the reason. That is expected; those
  businesses do not sell a product range.
- Locale coverage is whatever `en.json` has. Other locales are accepted by
  `--locale` but untested.

## Commands

Run from the repository root. With no `--data-dir`, the extractor reads the
Steam install `ba_save.find_game_locale()` detects, or the one `BA_LOCALE`
names. Either way the path has to be the game's own
`<game>/.../StreamingAssets/locale/en.json`: the extractor reads
`helpstructure.json` beside the locale folder, so an `en.json` copied
somewhere else is refused rather than half-read.

```sh
# What can be extracted
python tools/extract_wiki.py --list

# One business type and everything it references (default)
python tools/extract_wiki.py --business giftshop --out research/wiki-data/gift-shop.json

# The whole catalogue
python tools/extract_wiki.py --all --out research/wiki-data/catalogue.json

# Diff a fresh run against the previous one
python tools/extract_wiki.py --all --out research/wiki-data/catalogue.json \
    --compare research/wiki-data/catalogue.json

# Explicit sources, e.g. a second machine or a copied install
python tools/extract_wiki.py --data-dir "/path/to/Big Ambitions_Data" \
    --locale /path/to/en.json --help-structure /path/to/helpstructure.json

# Smaller output, or a known appmanifest instead of a lookup
python tools/extract_wiki.py --business giftshop --no-raw --steam-manifest appmanifest_1331550.acf
```

A bad source — missing, non-JSON, or not an object — exits with code 2, prints
`error: …` on stderr, and writes nothing. An unreadable `helpstructure.json`
warns and continues, recording `helpStructure: {used: false, error: …}` in the
output.

## Tests

```sh
python -m unittest tests.test_wiki_extract tests.test_wiki_build tests.test_wiki_review tests.test_wiki_guides
```

Synthetic fixtures only: the suite writes its own locale and help structure
into a temporary directory and covers parsing (ranges, requirements, recipes,
capacities, workstations), provenance (per-record sources, file hashes, parse
mode, unknown build metadata, raw help), malformed sources (clear failure, no
output written, previous output preserved), and change detection. No test
depends on a private save or the installed game.

## The public payload

`tools/build_wiki_data.py` turns the extraction into what the wiki tab ships:
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
  customer-facing businesses. Each uses the existing sample shape and includes
  its primary and secondary products, equipment, suppliers and recipes.
  `BUSINESS.primary` and `BUSINESS.secondary` contain short product IDs;
  `extras` retains the secondary product names for older consumers.
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
  rebuilds an article when the game patches, so each is reviewed by hand — see
  [wiki-content-design.md](wiki-content-design.md#hand-authored-topics).
- `sample` — the Gift Shop compatibility entry. Older payloads containing only
  this entry still work with the reader.

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
  appear only where recipes are shown. The legacy sample's gaps remain independent.

  Authored copy lives in `tools/wiki_sample.json`: `guideUi` supplies shared
  labels, `guideGaps` supplies missing-data messages, and `guides` contains
  business summaries and notes. Each summary
  and note has source conditions; it is included only while those literal
  excerpts still appear in the named help pages. Review the wording whenever
  related game content changes. Facts continue to come from the extractor.
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
written while its check still holds: prices for the sample (the pages the
sample reads carry no money figure — what other pages hold is reported as
measured, not claimed away), weekly delivery limit numbers (the help states the
caps exist and never gives one), and the save build number (an install shows
Steam's depot build id and the builds its shipped layouts were authored at;
neither is the number a save carries, and no save was read). A patch that
prices the sample's goods or numbers the limits removes its own gap from the
next build. A wording slot the builder cannot fill is a build failure, not a
literal `{count}` in the shipped file.

The output is deterministic: sorted iteration, no run timestamp, `sourceDate`
is the newest mtime of the game help and counted layouts rather than the moment this ran (the sample's
SOURCES block repeats it as `sourceDate` and keeps the mockup's `extracted` key
with the same value), each source row records its hash and size with a null `mtime`
(Steam touches unchanged files, and the hash already says whether the bytes moved), and
`write_public_wiki` skips the write when the bytes
did not change. Source paths in the payload are game-relative; a privacy check
rejects any build that would leak an absolute path, a user name or save data.

### Commands

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

`python build_web.py` writes them after the payload, and removes pages the
payload no longer has. `python build_web.py --check` rebuilds them in memory
from the committed payload and reports a missing, edited or orphaned page or a
stale sitemap. Neither step needs the installed game for this part, and
`python tools/wiki_pages.py` (or `--check`) runs it alone. Tests:
`tests/test_wiki_pages.py`.
