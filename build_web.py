"""Assemble the in-browser board under web/.

    python build_web.py

Writes web/index.html from the same template the local server uses, with the
source bar above the board and the worker data source wired in ahead of the
board's script, and copies the two Python files into web/py/ for the worker to
fetch. web/app.js and web/worker.js are kept by hand. Nothing else is needed:
the folder is a static site.
"""
from __future__ import annotations

import os
import shutil

from ba_dashboard import VERIFIED_BUILD, render

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(HERE, "web")
REPO = "https://github.com/PeterHartwieg/big-ambitions-ledger"

# The source bar. One card says what is loaded and whether it is current; the
# two actions that matter sit beside it; everything rarer is a chip, a
# disclosure or a quiet link. Tokens come from the board's own stylesheet.
BANNER = r"""<style>
[hidden]{display:none!important}
.landing{max-width:1180px;margin:0 auto;padding:18px 24px 0}
.landing h1{font-size:22px;margin:0;letter-spacing:-.01em;line-height:1.2}
.landing h1 span{color:var(--accent)}
.landing .lede{margin:6px 0 0;color:var(--ink-2);max-width:70ch}
.src{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;margin-top:14px}
.src .card{display:flex;align-items:center;gap:10px;background:var(--surface);border:1px solid var(--rule);
  border-radius:6px;padding:8px 12px;min-width:260px;flex:1 1 300px;max-width:560px}
.src .card .dot{width:9px;height:9px;border-radius:50%;background:var(--ink-3);flex:none}
.src .card[data-tone="busy"] .dot{background:var(--warn);animation:srcpulse 1s ease-in-out infinite}
.src .card[data-tone="ok"] .dot{background:var(--pos)}
.src .card[data-tone="bad"] .dot{background:var(--neg)}
@keyframes srcpulse{50%{opacity:.35}}
@media (prefers-reduced-motion:reduce){.src .card .dot{animation:none!important}}
.src .card .txt{display:flex;flex-direction:column;min-width:0;flex:1}
.src .card .txt b{font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.src .card .txt span{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:11px;color:var(--ink-3)}
.src .card em{font-style:normal;font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:11px;color:var(--ink-2);white-space:nowrap}
.src .btn{font:inherit;font-size:13px;border:1px solid var(--rule);border-radius:4px;padding:7px 12px;background:var(--raised);
  color:var(--ink);cursor:pointer;line-height:1.2}
.src .btn:hover{border-color:var(--ink-3)}
.src .btn:disabled{opacity:.45;cursor:default}
.src .btn.primary{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:600}
.src .btn.primary:disabled{background:var(--raised);border-color:var(--rule);color:var(--ink-3);font-weight:500}
.src label.btn input{display:none}
.src .chip{display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:12px;border:1px solid var(--rule);border-radius:999px;
  padding:4px 10px;background:var(--surface);color:var(--ink-2);cursor:pointer}
.src .chip i{width:7px;height:7px;border-radius:50%;background:var(--warn)}
.src .chip[data-state="ok"] i{background:var(--pos)}
.src .chip[data-state="ok"]{color:var(--ink-3)}
.src .more{font-size:12px;color:var(--ink-3);margin-left:auto;white-space:nowrap}
.src .more a{color:var(--ink-3)}
.src .link{font:inherit;font-size:12px;background:none;border:0;padding:0;color:var(--ink-3);text-decoration:underline;cursor:pointer}
.src details{font-size:12px;color:var(--ink-2)}
.src details summary{cursor:pointer;color:var(--ink-3);text-decoration:underline;list-style:none;white-space:nowrap}
.src details summary::-webkit-details-marker{display:none}
.src details[open]{flex-basis:100%;background:var(--surface);border:1px solid var(--rule);border-radius:6px;padding:10px 14px}
.src details[open] summary{margin-bottom:6px;text-decoration:none;color:var(--ink)}
.src details p{margin:4px 0;max-width:none}
.src details code{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:11.5px;background:var(--raised);padding:2px 6px;border-radius:3px;user-select:all}
.src details .muted{color:var(--ink-3)}
.src button.copy{font:inherit;font-size:11px;border:1px solid var(--rule);background:var(--surface);color:var(--ink-2);border-radius:3px;padding:1px 7px;cursor:pointer;margin-left:4px}
.src button.copy:hover{border-color:var(--ink-3)}
.srcNote{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:12px;color:var(--ink-2);margin:8px 0 0}
.srcNote[data-tone="bad"]{color:var(--neg)}
.srcNote[data-tone="warn"]{color:var(--warn)}
.veil{position:fixed;inset:0;z-index:50;background:color-mix(in srgb,var(--ground) 80%,transparent);display:flex;align-items:center;justify-content:center;pointer-events:none}
.veil div{border:2px dashed var(--accent);border-radius:10px;padding:26px 40px;font-size:18px;font-weight:600;color:var(--accent);background:var(--surface)}
body:not(.has-board) .wrap{display:none}
body.has-board .landing .lede{display:none}
body.has-board .landing{padding-bottom:4px}
</style>
<section class="landing">
  <h1>Big Ambitions <span>Ledger</span></h1>
  <p class="lede">A progress board read straight from your Big Ambitions save. Choose the save folder, or drop a save anywhere on this
    page, and the board is built here in your browser. Nothing is uploaded and no game file is touched.</p>
  <div class="src">
    <div class="card" id="srcCard" data-tone="busy">
      <i class="dot"></i>
      <div class="txt"><b id="srcFile">No save loaded</b><span id="srcMeta"></span></div>
      <em id="srcStatus">Starting</em>
    </div>
    <button type="button" class="btn primary" id="updateBtn" disabled title="Read the newest save from the chosen folder again">Update</button>
    <button type="button" class="btn" id="folderBtn" title="Pick the folder named Big Ambitions inside SaveGames. The page looks through every company folder in it and takes the newest save.">Choose save folder</button>
    <label class="btn" title="Pick one specific .hsg file instead">One save file<input type="file" id="savePick" accept=".hsg"></label>
    <button type="button" class="chip" id="localeChip" data-state="missing"><i></i><span>Game text missing</span></button>
    <details>
      <summary>Where is my save?</summary>
      <p>The folder is hidden in Explorer, so browsing will not find it. Copy the path, paste it into the dialog's <i>File name</i>
        box, press Enter, and the folder opens. Choose the <code>Big Ambitions</code> folder itself; the company folders inside it
        have generated names and cannot be told apart by eye, so the page takes the newest save across all of them. The game
        writes a <code>Recover</code> save every five minutes while you play.</p>
      <p><code id="savePath">%USERPROFILE%\AppData\LocalLow\Hovgaard Games\Big Ambitions\SaveGames\Big Ambitions</code>
        <button type="button" class="copy" data-copy="savePath">copy</button>
        <span class="muted">Windows. On a Mac: ~/Library/Application Support/Hovgaard Games/Big Ambitions/SaveGames/Big Ambitions</span></p>
      <p><code id="localePath">C:\Program Files (x86)\Steam\steamapps\common\Big Ambitions\Big Ambitions_Data\StreamingAssets\locale</code>
        <button type="button" class="copy" data-copy="localePath">copy</button>
        <span class="muted">where en.json lives: the game's product names, recipes and station capacities</span></p>
      <p class="muted">Your browser may ask whether to "upload" or "let this site view" the folder. That is its wording for
        letting this page read it; nothing leaves your computer. Checked on game build __BUILD__. The Python runtime the page
        needs is about 6 MB, fetched once and cached.</p>
    </details>
    <span class="more"><a href="__REPO__" title="MIT-licensed; report a save that will not build there">source</a> ·
      <button type="button" class="link" id="forgetHistory" title="Sixty days of demand and cash history are kept in this browser for the trends. Forgetting them starts a fresh record.">forget history</button></span>
    <input type="file" id="folderPick" webkitdirectory directory multiple hidden>
    <input type="file" id="localePick" accept=".json" hidden>
  </div>
  <p class="srcNote" id="srcNote" hidden></p>
  <div class="veil" id="dropVeil" hidden><div>Drop the save to load it</div></div>
</section>
""".replace("__BUILD__", str(VERIFIED_BUILD)).replace("__REPO__", REPO)

BEFORE_SCRIPT = '<script src="app.js"></script>\n'


def main() -> None:
    os.makedirs(os.path.join(WEB, "py"), exist_ok=True)
    for name in ("ba_save.py", "ba_dashboard.py"):
        shutil.copyfile(os.path.join(HERE, name), os.path.join(WEB, "py", name))
    # A static host sends no charset, so the page must say so itself.
    head = "".join(
        line + chr(10)
        for line in (
            '<meta charset="utf-8">',
            '<meta name="viewport" content="width=device-width, initial-scale=1">',
        )
    )
    page = head + render(None, live=True, banner=BANNER, before_script=BEFORE_SCRIPT)
    out = os.path.join(WEB, "index.html")
    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(page)
    print(f"wrote {out} ({len(page) // 1024} KB) and web/py/")


if __name__ == "__main__":
    main()
