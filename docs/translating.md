# Checking a translation

Big Copilot's own words come in English, German, Spanish, French, Portuguese, Russian, Korean
and Turkish. Most of the Spanish, French, Portuguese, Russian, Korean and Turkish was drafted by
a language model and has not been read by a native speaker yet. If you speak one of them,
checking it is the most useful help there is, and a single page at a time is welcome.

## See it

Open [bigcopilot.com](https://bigcopilot.com), pick your language under **Language** in
the footer, and open a save. Wording that reads wrong is worth a note even if you do not
want to touch the files: say which page and what it should say in the
[Discord support channel](https://discord.gg/EdjRzkxQTu) or in a GitHub issue.

## Fix it

You need Python 3 and a clone of this repository.

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

How the tables work is in [architecture.md](architecture.md), "UI text".
