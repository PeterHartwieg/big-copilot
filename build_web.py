"""Assemble the in-browser board under web/.

    python build_web.py

Writes web/index.html from the same template the local server uses, with the
landing copy above the board and the worker data source wired in ahead of the
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

BANNER = r"""<style>
.landing{max-width:1180px;margin:0 auto;padding:22px 24px 0}
.landing h1{font-size:22px;margin:0 0 4px;letter-spacing:-.01em}
.landing h1 span{color:var(--accent)}
.landing p{margin:0;color:var(--ink-2);max-width:70ch}
.landing .row{display:flex;flex-wrap:wrap;gap:10px 22px;align-items:center;margin-top:12px}
.landing .drop{border:1.5px dashed var(--rule);border-radius:6px;padding:12px 16px;background:var(--surface);
  display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;flex:1 1 420px;transition:border-color .15s}
.landing .drop.over{border-color:var(--accent);background:var(--accent-soft)}
.landing .drop b{font-weight:600}
.landing label.btn{display:inline-block;border:1px solid var(--rule);border-radius:4px;padding:5px 10px;
  background:var(--raised);cursor:pointer;font-size:13px}
.landing label.btn:hover{border-color:var(--ink-3)}
.landing label.btn input{display:none}
.landing button.link{background:none;border:0;padding:0;color:var(--ink-3);text-decoration:underline;cursor:pointer;font:inherit;font-size:12px}
.landing .st{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:12px;color:var(--ink-2)}
.landing .st[data-tone="busy"]::before{content:"● ";color:var(--warn)}
.landing .st[data-tone="bad"]{color:var(--neg)}
.landing .st[data-tone="warn"]{color:var(--warn)}
.landing .never{font-size:12px;color:var(--ink-3);margin-top:10px}
.landing .never b{color:var(--ink-2);font-weight:600}
body:not(.has-board) .wrap{display:none}
body.has-board .landing p.lede, body.has-board .landing .never{display:none}
body.has-board .landing{padding-bottom:6px}
</style>
<section class="landing">
  <h1>Big Ambitions <span>Ledger</span></h1>
  <p class="lede">A progress board read straight from your Big Ambitions save. Drop the save file on this page
    and the board is built here, in your browser. Nothing is uploaded and no game file is touched.</p>
  <div class="row">
    <div class="drop" id="drop">
      <b>Drop a save here</b>
      <label class="btn">Choose a save<input type="file" id="savePick" accept=".hsg"></label>
      <label class="btn" title="The game's own text: product names, recipes and station capacities. Found under the game folder at Big Ambitions_Data\StreamingAssets\locale\en.json">Pick en.json<input type="file" id="localePick" accept=".json"></label>
      <span class="st" id="localeState"></span>
    </div>
    <span class="st" id="srcStatus">Starting</span>
    <button type="button" class="link" id="forgetHistory" title="The board keeps sixty days of demand and cash history in this browser so it can show trends. Forgetting it starts a fresh record.">forget history</button>
  </div>
  <p class="st" id="srcNote" hidden></p>
  <p class="never"><b>Where the save is:</b> %USERPROFILE%\AppData\LocalLow\Hovgaard Games\Big Ambitions\SaveGames\Big Ambitions\ on Windows,
    ~/Library/Application Support/Hovgaard Games/Big Ambitions/ on a Mac. The game writes a Recover save every five minutes while you play.
    <b>Checked on game build __BUILD__.</b> Runs in any current browser; the Python runtime it needs is about 6 MB, fetched once and cached.</p>
</section>
""".replace("__BUILD__", str(VERIFIED_BUILD))

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
