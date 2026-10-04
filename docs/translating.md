# Help translate Big Copilot

Open [Translations](https://bigcopilot.com/translate/) and choose your language.
You can contribute without an account, Python, GitHub or a save file.
Italian is also open for contributions, with English shown where wording is missing.

1. Search for the wording you saw, in English or your language. Numbers in a
   displayed sentence can differ from the translation's placeholders.
2. Vote for wording that reads well, or choose **Correct** to suggest another version.
   An untranslated phrase offers **Translate** instead.
3. Submit the wording. A suggestion includes your vote; the version with the most
   votes is selected. Ties keep the current version.

A single contribution is enough to improve a phrase. You can change your vote,
and copy a link to a phrase to discuss it with another speaker. The site applies
selected wording on a subsequent language load. Moderation can correct mistakes
later; there is no approval queue.

Keep placeholders such as `{n}`, `{w:$}` and `{item}` unchanged. Put no article or
case ending before an inserted game name such as `{item}` or `{site}`, since the
name is inserted as it is. The form checks placeholders before accepting wording.

Many existing translations are machine drafts. Checking a single page is welcome.
Connection-based votes can be shared by people on the same network.

## See it

Open [bigcopilot.com](https://bigcopilot.com), pick your language under **Language** in
the footer, and open a save. Wording that reads wrong is worth a note even if you do not
want to touch the files: say which page and what it should say in the
[Discord support channel](https://discord.gg/EdjRzkxQTu) or in a GitHub issue.

## Working in the repository

Contributors who prefer editing files can still use Python 3 and a clone of this
repository. The browser flow above requires neither.

1. List what is still unreviewed, with the English and where each string appears:

   ```
   python tools/i18n.py draft-sheet fr --review --no-terms > review.json
   ```

   Each row has the key, the English (`en`), the draft (`fr`), the files that show it
   (`where`) and a length budget. `status fr` counts what is left.
2. Fix wording in `i18n/fr.json`. Keep every placeholder exactly as it is (`{n}`,
   `{w:$}`, `{item}`); put no article or case ending in front of a game name such as
   `{item}` or `{site}`, since the name is inserted as it is. Plural keys end in the
   language's forms (`_one`, `_many`, `_other`; Russian also `_few`; Korean has only `_other`).
3. Mark what you checked, fixed or not:

   ```
   python tools/i18n.py reviewed fr f.stock.low nav.today
   ```

4. Run `python tools/i18n.py status fr --strict` (it fails on a broken placeholder), then
   open a pull request.

To see your change on the page, run `python build_web.py --assemble` (it needs no game)
and serve `web/`.

How the tables work is in [architecture.md](architecture.md), "UI text". The
community API and publication rules are in [Community translations](community-translations.md).
