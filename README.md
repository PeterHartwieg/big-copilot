# Big Copilot

A dashboard for your Big Ambitions save: profits, stock, supply chains, staffing
and market demand. It reads `.hsg` files without modifying them.

## Use it in your browser

1. Open [bigcopilot.com](https://bigcopilot.com).
2. Drop a `.hsg` save onto the page, or choose your save folder below.
3. Use the save menu to switch characters or choose a particular save.

**No installation or game-text file is needed.** Names, recipes and station
capacities are included. Saves are processed on your computer and are not uploaded.
The browser downloads a Python runtime on first use.

Chrome and Edge can remember and watch a connected folder for new saves. Returning
visits reopen it automatically when access is still granted; otherwise, click
**Open newest save** or **Open chosen save** to reconnect. Firefox and Safari read a snapshot of the selected files;
use **Update** to pick them again. Dropping a single file does not watch its folder.

## Find your saves

The file-selection screen detects Windows or macOS and shows a copyable save
path. Use its operating-system selector to switch paths; your choice is remembered.
On other devices, choose
the system your game runs on or select a `.hsg` file you already have.

Choose the `Big Ambitions` folder inside `SaveGames`. Each character has a subfolder
with a generated name; the dashboard can find the newest save across those folders.

**Windows** — paste this into the folder picker's **File name** box:

```text
%USERPROFILE%\AppData\LocalLow\Hovgaard Games\Big Ambitions\SaveGames\Big Ambitions
```

**macOS (Steam native)** — in Finder or the folder picker, press **Cmd+Shift+G**
and paste:

```text
~/Library/Application Support/com.Hovgaard-Games.Big-Ambitions/SaveGames/Big Ambitions/
```

The game normally autosaves every five minutes. A folder-access prompt may use the
word “upload”; the dashboard still reads the files locally.

## Run locally with Python

Requires Python 3.10+; no third-party Python packages. Download or clone this
repository and run commands from its folder.

**Windows**, using the default save location:

```sh
python ba_dashboard.py
```

**macOS**, passing the save folder explicitly:

```sh
python3 ba_dashboard.py "$HOME/Library/Application Support/com.Hovgaard-Games.Big-Ambitions/SaveGames/Big Ambitions"
```

The script currently auto-detects only the Windows save location. On macOS or
Linux, pass the full path to a save folder or `.hsg` file. Use `$HOME` in the quoted
Mac command above; a quoted `~` is not expanded by the shell.

Open the generated `dashboard.html` in your browser. Output goes to the current
working directory unless you specify `-o`.

| Option | Purpose |
| --- | --- |
| `--watch` | Open a local server and refresh when a new save appears. Stop with Ctrl+C. |
| `--list` | List saves by character; pass your save folder on macOS/Linux. |
| `-o board.html` | Choose the output file. |
| `--backfill` | Seed trend history from other saves of the same character. |
| `--port 8770` | Set the local server port. |
| `--interval 5` | Set the seconds between save checks. |
| `--no-open` | Start watch mode without opening a browser. |

Add `--watch` to either startup command to keep the board live while playing.
The server listens on `127.0.0.1` and rebuilds only when the game writes a save.

With the default Windows save folder, you can also select a save or character by
name: `python ba_dashboard.py "Costy Co"` or `python ba_dashboard.py "Costy" --watch`.

### Product names and game text in local runs

**Browser:** game text is built in. To override it with a newer game's `en.json`,
choose that file through the **More** menu. The choice is remembered in that browser.

**Local Python:** the script currently looks for `en.json` in the default Windows
Steam installation. On macOS or a custom Steam installation, set `DEFAULT_LOCALE`
near the bottom of [ba_save.py](ba_save.py) to the full path of your game’s
`en.json`. On Windows it normally lives at:

```text
C:\Program Files (x86)\Steam\steamapps\common\Big Ambitions\Big Ambitions_Data\StreamingAssets\locale\en.json
```

You can also use the bundled English text at `web/py/gametext.json`, including on
macOS. Replace the existing `DEFAULT_LOCALE = (...)` assignment with its absolute
path, for example (replace the path with your checkout's location):

```python
DEFAULT_LOCALE = "/Users/yourname/big-copilot/web/py/gametext.json"
```

To find the game's own text on macOS, use **Steam → Manage → Browse local files**
and search that folder for `en.json`. If the files are inside an app bundle, use
Finder's **Show Package Contents**. Installation layouts can vary; the bundled
file above is an alternative that does not depend on the game installation.

Restart the script after changing it. There is currently no `--locale` option.
If names appear as `Haircareproduct` or `Expensiveflower`, the locale was not
loaded. Check the path above. Missing game text also limits recipe and station
analysis; it is more than a label issue.

## What's on the dashboard?

| Page | Use it for |
| --- | --- |
| Today | Profit, cash and issues needing attention. |
| Results | Trends, chains and individual business details. |
| Supply | Import orders, replenishment checklists, stock checks and goods flows. |
| Growth | Market demand, expansion opportunities and factory planning. |
| Company | Product totals, payroll and milestones. |
| Map | Your premises, existing issues and searchable city addresses. |

See the [dashboard reference](docs/dashboard-reference.md) for calculations,
assumptions and detailed views. Recommendations are estimates to apply in-game;
checklist ticks are your own notes, not confirmation that a game setting changed.
The map button beside a building opens a zoomed location overlay without leaving
your current page. Close it or press Escape to return. Map highlights update when
you change filters or load another save; the map does not show simulated deliveries.

## Troubleshooting and contributing

Checked against game build **3675**. Saves older than **3540** are unsupported;
load and save them in a current game build first. Game updates can change the format.

If a save fails, [open an issue](https://github.com/PeterHartwieg/big-copilot/issues)
with the error text, game build, operating system and whether you used the browser
or Python. Save files contain your company data; only attach one if you want it public.

Trend history is stored per character: in browser storage for the website, or in
`market_history.json` beside the local output. **Forget history** clears the browser
record. Keep a backup of the local file if you want to preserve accumulated trends.

For build instructions, tests and the source-file map, see
[Contributing](docs/contributing.md).

## Licence

[MIT](LICENSE). Not affiliated with Hovgaard Games.
