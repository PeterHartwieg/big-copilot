# Community translations

The hosted translation page at `/translate/` lets players find wording, suggest a
correction and vote without an account or a save file. It uses the existing
Cloudflare Worker and community D1 database. The page follows the board's typography,
colours and compact controls; corrections open beside the phrase being changed.

## Finding a phrase

Choose the target language, then search for either the English or the wording seen
on the board. Search includes the bundled translation, the selected community text
and alternatives. It ignores case and accents, and recognises displayed values in
place of placeholders, so a sentence containing an employee count can find its
translation template. Page/area and translation-state filters narrow the list.

`/translate/?lang=it&key=<key>` opens a specific phrase. `q` supplies a search query.
The page can copy a link to a phrase. Search works on the downloaded catalogue;
opening the contribution page never uploads a save or reads its company data.

## Contributions and votes

- **Suggest a change** opens the current wording for editing; **Translate** does
  the same for an untranslated phrase. **View alternatives (N)** separately opens
  the other versions without editing or voting. The count appears once community
  data is available. Each version has a **Vote for this** button with its vote count;
  **Your vote** identifies the connection's choice after its details have loaded.
- A suggestion includes its contributor's vote. The first contribution can replace
  a bundled draft, which starts with zero community votes.
- Suggestions have their own best-effort budget of ten a minute per IPv4 address or IPv6 /64
  at each Cloudflare location (`TRANSLATION_SUGGEST_LIMITER`, namespace 1005), since each
  one stores a candidate. Past it the API answers 429 with `Retry-After: 60`.
  Votes share the general 120-a-minute budget.
- One active choice is recorded per connection, target language, phrase and English
  source version. Choosing another candidate moves that vote. Retrying the same
  request or submitting identical wording does not create another vote.
- The highest vote count selects the wording. A tie preserves the current choice.
- Bundled wording remains an available choice. Moderation can hide an inappropriate
  candidate or pin a choice; a pin takes precedence until removed.
- Changing the English or its placeholder contract starts a new source version.
  Votes and suggestions for the previous version cannot change the current page.

Connection identity uses the feature-voting system's HMAC approach with a separate
translation scope. It is not a verified person: shared connections can share a
vote and a changed connection can obtain another. This is intentional for the
small community; there is no reviewer threshold or account registration.

Candidate text and timestamps remain available for history and moderation. A
candidate has no stored submitter identity. Only active vote records hold scoped
connection hashes. Daily cleanup removes vote records for retired source versions
after successfully reading the current catalogue; it retains them if that catalogue
cannot be read. Feature-poll cleanup never touches translation tables.

## Catalogue and publication

English remains in its existing `tt()` and `msg()` call sites. Assembly extracts a
catalogue for each supported target language, including Italian, and preserves the
runtime's placeholder and plural rules. Catalogue output is generated and ignored
by Git. A plural form's contract requires the placeholders of its own English form,
and assembly stops when a contract, markup rule included, would reject its own
English or bundled wording.
A source version includes the phrase's English and validation contract;
the whole-catalogue revision also changes with bundled wording and review metadata.

The API validates contributions against its own generated catalogue, not metadata
supplied by the browser. Community wording is plain text, except on a phrase whose
English has tags (`<b>`, `<span class="ok">` and the like), which the board draws as
HTML. Its contract lists those tags as `markup`, copied character for character
from the English, and its wording must carry exactly them: as many of each, properly
nested, in any order, with no other `<`, attribute or entity. Such wording is no
more able to add an element or attribute than the English is. A bare `>` ("a -> b")
is text and allowed anywhere. The same rule runs in `tools/translation_catalogue.py`
(`keeps_markup()`), the Worker (`keepsMarkup()` in `server/translations.mjs`), the
hosted loader (`ttKeepsMarkup()` in `web/i18n.js`, again at the rendering boundary)
and the contribution page, which keeps the tags in the editor and shows the English
with them. The contribution page otherwise uses safe text rendering, and the
dashboard keeps its normal escaping at HTML and attribute boundaries. Invalid
placeholders, stale submissions and other markup are rejected before a candidate
can become an overlay.

The hosted language loader overlays selected community wording on the bundled
translation only when it matches the source version shipped with that page.
For any language other than English it asks `GET /api/translations/overlay?lang=<lang>`
on every page load, a remembered language included, before the player does anything; the
request carries only the language code. Only when the overlay has a row does it fetch
`/translations/<lang>.manifest.json`. The privacy notice, section 5, says so.
Each hosted page pins its catalogue revisions, so an older open page rejects a
manifest replaced by a later deployment rather than trusting its cache-busting URL.
Unavailable or mismatched community data leaves the bundled translation or English
fallback in place. Community selections appear on a subsequent language load;
contributing does not reload or interrupt an open save.

The Worker caches each overlay by language, translation revision and build stamp.
Every vote, suggestion, moderation action and vote cleanup moves the revision, and
a deployment that replaces a catalogue moves the stamp, so neither change can be
answered from an old entry. A browser reuses its copy for up to a minute and then
revalidates with the `ETag` (`"<format>-<revision>-<stamp>"`). A new selection can
therefore take a minute to reach a visitor who loaded the language just before it.
The Worker's code is not part of the build stamp: a change that makes the overlay
answer differently for the same revision and catalogue bumps `OVERLAY_FORMAT` in
`server/translations.mjs`, which retires both the cached entries and browser tags.

Each Worker isolate also keeps the parsed catalogue of its last two languages in
memory. Every request still asks `ASSETS` for the catalogue, with `If-None-Match`
set to the `ETag` of the copy it holds, and reuses that copy only on a 304 or a
response with the same tag; a catalogue served without an `ETag` is parsed every
time. The `{key: sourceVersion}` map that the summary, overlay and cleanup queries
join with `json_each()` is built once per parsed catalogue, and the summary binds it
in a single statement.

The local CLI remains offline. Exporting accepted community wording into `i18n/`
makes it available in subsequent bundled builds. Import must validate the English
source version before recording the language's English in `i18n/base.json`, and only
accepted human contributions clear the language's draft marks there.

Download `/api/translations/overlay?lang=it` as `overlay.json`, then use:

```sh
python tools/translation_catalogue.py export it overlay.json --out selected.json
python tools/translation_catalogue.py import it selected.json
```

Export keeps only validated selected wording. Import checks the current catalogue
again and updates the Italian source files; normal assembly bundles those changes.

## Occasional moderation

The operator uses the existing Wrangler login, with no public admin endpoint:

```sh
node tools/translation_moderate.mjs list --lang it
node tools/translation_moderate.mjs hide <candidate-id>
node tools/translation_moderate.mjs restore-pin <candidate-id>
node tools/translation_moderate.mjs unpin <candidate-id>
```

These commands default to local D1. Append `--remote` to operate on production.
Use a full candidate ID from `list`, which shows wording, votes and moderation
state without contributor identifiers. `restore-pin` also restores hidden wording;
`unpin` resumes selection by votes.

## Validation and release

Use synthetic catalogues and identities in API and browser tests. Run
`npm run verify` for the complete build, Python, Node, optimized-page and Worker gate.
The browser QA journey should include finding a displayed sentence, opening a
shared phrase link, correcting it, changing a vote, reloading to check persistence,
invalid placeholders, a failed submission and a narrow screen.

The database migration must be applied before deploying the new Worker. Development
and QA use local D1 and the nonproduction values in `.dev.vars.example`; never reuse
production bindings or upload a real save to validate this feature.

Released with [PR #283](https://github.com/PeterHartwieg/big-copilot/pull/283).
