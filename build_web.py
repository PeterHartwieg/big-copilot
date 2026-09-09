"""Assemble the in-browser board under web/.

    python build_web.py

Writes web/index.html from the same template the local server uses, with the
landing screen above the board and the worker data source wired in ahead of
the board's script, and copies the two Python files into web/py/ for the
worker to fetch. web/app.js and web/worker.js are kept by hand. Nothing else
is needed: the folder is a static site.
"""
from __future__ import annotations

import json
import os
import shutil

from ba_dashboard import VERIFIED_BUILD, render
from ba_save import DEFAULT_LOCALE, load_locale

# The display names shipped with the page: what the game calls its items,
# business types, neighbourhoods, stations and skills. Nothing else from the
# locale travels; the help pages that recipes and capacities are read from
# stay the player's own file to pick.
NAME_PREFIXES = (
    "ba:itemname_",
    "ba:businesstype_",
    "ba:neighborhood_",
    "ba:factoryworkstationtype_",
    "ba:skill_",
)

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(HERE, "web")
REPO = "https://github.com/PeterHartwieg/big-ambitions-ledger"
ISSUES_URL = REPO + "/issues/new"
# Where "Support the project" goes. GitHub Sponsors for now; swap in a Ko-fi
# or PayPal address here and rebuild if you prefer one.
DONATE_URL = "https://github.com/sponsors/PeterHartwieg"

# Two screens, one set of controls.
#
# The landing is a screen you leave: a heading, one sentence, the folder
# button, and the rarer controls laid out in full. When a save loads, the
# landing is hidden and app.js moves the controls into the board's own header:
# the status and the Update button into the source row the template leaves
# empty under the masthead, and everything else into the More menu. The
# elements below carry ids; app.js knows which slot each one belongs to in
# each mode. Layout after the UI reference in mockup/ui-mockup.html.
BANNER = r"""<style>
[hidden]{display:none!important}
/* The board gives every section content-visibility:auto, which implies paint
   containment and would clip a dropdown. Not here. */
.landing{max-width:1240px;margin:0 auto;padding:0 24px;content-visibility:visible;contain:none}
body.has-board .landing{display:none}
body:not(.has-board) .wrap{display:none}

/* shared pieces ------------------------------------------------------ */
.lg-btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:36px;padding:8px 14px;
  border:1px solid var(--rule);border-radius:4px;background:var(--surface);color:var(--ink);font:inherit;font-size:12.5px;
  font-weight:500;line-height:1.4;text-decoration:none;white-space:nowrap;cursor:pointer}
.lg-btn:hover:not(:disabled){border-color:var(--ink-3)}
.lg-btn:disabled{cursor:default;color:var(--ink-3);background:var(--raised);border-color:var(--rule)}
.lg-btn.primary{color:#fff;background:var(--accent);border-color:var(--accent);font-weight:600}
.lg-btn.primary:disabled{color:var(--ink-3);background:var(--raised);border-color:var(--rule);font-weight:500}
.lg-btn.large{font-size:13px;min-height:44px;padding:12px 18px}
.lg-btn input{display:none}
.lg-text{font:inherit;font-size:12px;background:none;border:0;padding:0;color:var(--ink-2);text-decoration:underline;
  text-underline-offset:3px;cursor:pointer}
.lg-text input{display:none}
.lg-text:hover{color:var(--ink)}
.lg-chip{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--rule);border-radius:20px;padding:6px 10px;
  font:inherit;font-size:11.5px;color:var(--ink);background:var(--surface);cursor:pointer;white-space:nowrap}
.lg-chip i{width:7px;height:7px;border-radius:50%;background:var(--warn);flex:none}
.lg-chip[data-state="ok"] i{background:var(--pos)}
.dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--ink-3);flex:none}
.dot.ok{background:var(--pos)}
@keyframes lgspin{to{transform:rotate(360deg)}}

/* the status card: a symbol, a headline, a detail line ---------------- */
.src-card{display:flex;align-items:center;gap:12px;min-width:0}
.src-card .sym{width:20px;height:20px;display:grid;place-items:center;border-radius:50%;flex:none;font-size:12px;font-weight:600}
.src-card[data-tone="ready"] .sym::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--ink-3)}
.src-card[data-tone="remembered"] .sym::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--pos)}
.src-card[data-tone="ok"] .sym{color:var(--pos);background:var(--accent-soft)}
.src-card[data-tone="ok"] .sym::before{content:"\2713"}
.src-card[data-tone="bad"] .sym{border:1px solid var(--neg);color:var(--neg)}
.src-card[data-tone="bad"] .sym::before{content:"!"}
.src-card[data-tone="busy"] .sym{border:2px solid var(--rule);border-top-color:var(--warn);border-radius:50%;width:17px;height:17px;
  animation:lgspin 1s linear infinite}
@media (prefers-reduced-motion:reduce){.src-card[data-tone="busy"] .sym{animation:none}}
.src-card .txt{min-width:0}
.src-card .txt b{display:block;font-size:13px;font-weight:600}
.src-card[data-tone="bad"] .txt b{color:var(--neg)}
.src-card[data-tone="busy"] .txt b{color:var(--warn)}
.src-card .txt span{display:block;font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:10.5px;color:var(--ink-2);
  margin-top:2px;overflow-wrap:anywhere}
.src-card .txt span:empty{display:none}

/* the note under the status: an explanation, or an error with a way out */
.note{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:11px 14px;margin:10px 0 0;
  font-size:12px;color:var(--ink-2);border-left:2px solid var(--rule);background:var(--raised)}
.note[data-tone="bad"]{border-left-color:var(--neg)}
.note[data-tone="warn"]{border-left-color:var(--warn)}
.note[data-tone="info"]{border-left:0;background:none;padding:8px 0 0}
.note p{margin:0 0 2px;color:var(--ink)}
.note[data-tone="info"] p{color:var(--ink-2)}
.note span{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:11px}
.note span:empty{display:none}
.source-note .note{margin:10px 0 0}
.source-note:not(:empty)+.pages{margin-top:10px}

/* the landing ---------------------------------------------------------- */
.onb-mast{display:flex;justify-content:space-between;align-items:center;padding:23px 0;border-bottom:2px solid var(--ink)}
.onb-mast .eyebrow{font-size:12px}
.local{display:inline-flex;align-items:center;gap:7px;font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:10px;color:var(--ink-2)}
.welcome{display:grid;grid-template-columns:minmax(0,1fr) 265px;gap:60px;padding:40px 0 32px}
.welcome h2{font-size:44px;font-weight:800;letter-spacing:-.045em;line-height:1.08;margin:0;text-wrap:balance}
.welcome .lede{max-width:550px;color:var(--ink-2);font-size:15px;line-height:1.7;margin:17px 0 0}
.entry-actions{display:flex;align-items:center;gap:18px;flex-wrap:wrap;margin-top:27px}
.entry-actions #updateBtn:disabled{display:none}
.drop-hint{font-size:12px;color:var(--ink-2)}
.drop-hint code{font-family:"IBM Plex Mono",ui-monospace,monospace}
.entry-secondary{display:flex;gap:22px;margin-top:13px;font-size:12px;min-height:18px}
.entry-secondary .lg-btn{border:0;background:none;padding:0;min-height:0;font-size:12px;font-weight:400;color:var(--ink-2);
  text-decoration:underline;text-underline-offset:3px}
.entry-secondary .lg-btn:hover{color:var(--ink)}
.entry-status{margin-top:28px;min-height:47px}
.game-text{border-left:1px solid var(--rule);padding-left:28px;align-self:center}
.game-text .lg-chip{margin:14px 0 12px}
.game-text p{font-size:12px;line-height:1.8;color:var(--ink-2);margin:0}
.game-text p code{font-family:"IBM Plex Mono",ui-monospace,monospace}
.game-text p.quiet{font-size:11px;margin-top:10px}
.onb-bottom{border-top:1px solid var(--rule)}
details.help summary{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:15px 0;font-size:12px;
  color:var(--ink-2);cursor:pointer;list-style:none}
details.help summary::-webkit-details-marker{display:none}
details.help summary::after{content:"+";font-size:14px;color:var(--ink-3)}
details.help[open] summary{color:var(--ink)}
details.help[open] summary::after{content:"\2013"}
.help-content{padding:0 0 20px;font-size:12px;color:var(--ink-2)}
.help-content>p{max-width:850px;line-height:1.8;margin:0}
.help-content>p:last-child{margin-top:12px;font-size:11px}
.path-label{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:9px;text-transform:uppercase;letter-spacing:.07em;margin:14px 0 6px}
.path-row{display:flex;align-items:center;gap:14px;background:var(--raised);padding:9px 12px;border:1px solid var(--rule-soft)}
.path-row code{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:11px;flex:1;overflow-wrap:anywhere;user-select:all;color:var(--ink)}
.path-row button{font:inherit;font-size:11px;border:1px solid var(--rule);border-radius:3px;padding:4px 10px;background:var(--surface);
  color:var(--ink);cursor:pointer;flex:none}
.help-content .mac{font-size:10px;margin:7px 0}
.help-content .mac code{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:10px;overflow-wrap:anywhere;user-select:all}
.onb-foot{display:flex;align-items:center;justify-content:space-between;gap:16px;border-top:1px solid var(--rule);padding:15px 0;
  font-size:11px;color:var(--ink-2)}
.foot-links{display:flex;gap:10px 18px;align-items:center;flex-wrap:wrap}
.foot-links a.lg-text{color:var(--ink-2)}
.foot-links .lg-btn{font-size:12px;min-height:32px;padding:6px 12px}
.veil{position:fixed;inset:0;z-index:70;background:color-mix(in srgb,var(--ground) 80%,transparent);display:flex;align-items:center;
  justify-content:center;pointer-events:none}
.veil div{border:2px dashed var(--accent);border-radius:10px;padding:26px 40px;font-size:18px;font-weight:600;color:var(--accent);background:var(--surface)}

/* the board's source row ----------------------------------------------- */
.source-row{display:flex;align-items:center;gap:24px;min-height:68px;padding:10px 0;border-bottom:1px solid var(--rule)}
.source-actions{display:flex;align-items:center;gap:8px;margin-left:auto;flex:none}
.source-actions .lg-btn.primary{min-width:98px}
.menu{position:relative}
.menu-panel{display:none;position:absolute;right:0;top:calc(100% + 8px);width:320px;padding:10px;background:var(--surface);
  border:1px solid var(--rule);border-radius:5px;box-shadow:0 12px 32px color-mix(in srgb,var(--ink) 16%,transparent);z-index:40;
  max-height:min(650px,80vh);overflow:auto}
.menu.open .menu-panel{display:block}
.menu.open>.lg-btn{background:var(--raised);border-color:var(--ink-3)}
.menu-heading{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--ink-2);padding:6px 10px}
.menu-panel .lg-btn{display:flex;width:100%;justify-content:flex-start;border:0;background:none;padding:10px;border-radius:3px;font-size:13px;font-weight:500;min-height:0}
.menu-panel .lg-btn:hover{background:var(--raised)}
.menu-hint{font-size:11px;color:var(--ink-2);margin:4px 10px 10px}
.menu-divider{border-top:1px solid var(--rule);margin:6px 0 12px}
.menu-panel .lg-chip{margin-left:9px}
.menu-panel details.help{margin-top:12px;border-top:1px solid var(--rule);padding:0 10px}
.menu-panel details.help summary{padding:12px 0}
.menu-panel .help-content{padding-bottom:12px}
.menu-panel .path-row{flex-wrap:wrap}
.menu-panel .path-row code{flex-basis:100%;font-size:10px}
.menu-foot{border-top:1px solid var(--rule);padding:14px 10px 5px;display:flex;justify-content:space-between;font-size:11px}
.menu-foot .foot-links{width:100%;gap:4px 14px}
.menu-foot .foot-links .lg-btn{width:100%;margin:0 0 4px}
.menu-foot .foot-links .lg-text{margin-top:6px}

@media (max-width:1050px){.welcome{gap:30px;grid-template-columns:minmax(0,1fr) 220px}.welcome h2{font-size:38px}.game-text{padding-left:22px}}
@media (max-width:760px){.welcome{grid-template-columns:1fr;gap:24px;padding-top:30px}.welcome h2{font-size:36px}
  .game-text{border-left:0;border-top:1px solid var(--rule);padding:22px 0 0}.source-row{gap:14px;flex-wrap:wrap}
  .menu-panel{width:min(320px,calc(100vw - 60px))}.path-row{flex-wrap:wrap}.path-row code{flex-basis:100%}.note{flex-wrap:wrap}}
</style>
<section class="landing" id="landing" data-visit="first">
  <header class="onb-mast">
    <div class="eyebrow">Big Ambitions <span>Ledger</span></div>
    <span class="local"><i class="dot ok"></i>In browser</span>
  </header>
  <div class="welcome">
    <div class="welcome-copy">
      <h2 id="welcomeTitle">Your company,<br>at a glance.</h2>
      <p class="lede" id="welcomeLede">Turn your Big Ambitions save into a daily board, built in your browser with nothing uploaded.</p>
      <div class="entry-actions" id="entryActions">
        <button type="button" class="lg-btn primary large" id="folderBtn" title="Choose the folder named Big Ambitions inside SaveGames. The page looks through every company folder in it and takes the newest save.">Choose save folder <span aria-hidden="true">&rarr;</span></button>
        <button type="button" class="lg-btn primary large" id="updateBtn" disabled title="Read the newest save from the chosen folder again">Update</button>
        <span class="drop-hint">or drop a <code>.hsg</code> save anywhere</span>
      </div>
      <div class="entry-secondary" id="entrySecondary">
        <label class="lg-btn" id="savePickLabel" title="Choose one specific .hsg file instead">One save file<input type="file" id="savePick" accept=".hsg"></label>
      </div>
      <div class="entry-status" id="entryStatus">
        <div class="src-card" id="srcCard" data-tone="busy"><span class="sym" aria-hidden="true"></span><div class="txt"><b id="srcStatus">Starting</b><span id="srcMeta"></span></div></div>
        <div class="note" id="srcNote" hidden><div><p id="noteText"></p><span id="noteSub"></span></div><button type="button" class="lg-btn" id="recoverBtn" hidden>Choose save folder</button></div>
      </div>
    </div>
    <aside class="game-text">
      <div class="eyebrow" id="asideEyebrow">One-time set-up</div>
      <div id="asideChip"><button type="button" class="lg-chip" id="localeChip" data-state="missing"><i></i><span>Game text: names only</span></button></div>
      <p id="asideText">Product and business names are built in. Choose the game's <code>en.json</code> for recipes and station capacities as well.</p>
      <p class="quiet" id="asideQuiet">Remembered in this browser. Without it the factory and capacity views stay empty.</p>
    </aside>
  </div>
  <div class="onb-bottom">
    <div id="helpSlot">
      <details class="help" id="help" open>
        <summary>Where is my save?</summary>
        <div class="help-content">
          <p>In the folder picker, paste the Windows path into <b>File name</b> and press Enter. Choose the <b>Big Ambitions</b> folder; the page finds the newest save across the company folders inside it, whose generated names cannot be told apart by eye.</p>
          <div class="path-label">Save folder &middot; Windows</div>
          <div class="path-row"><code id="savePath">%USERPROFILE%\AppData\LocalLow\Hovgaard Games\Big Ambitions\SaveGames\Big Ambitions</code><button type="button" class="copy" data-copy="savePath">Copy</button></div>
          <p class="mac">On macOS: <code>~/Library/Application Support/Hovgaard Games/Big Ambitions/SaveGames/Big Ambitions</code></p>
          <div class="path-label">Game text &middot; en.json lives here (recipes and capacities)</div>
          <div class="path-row"><code id="localePath">C:\Program Files (x86)\Steam\steamapps\common\Big Ambitions\Big Ambitions_Data\StreamingAssets\locale</code><button type="button" class="copy" data-copy="localePath">Copy</button></div>
          <p>The game autosaves every five minutes. Your browser may call folder access an "upload" or ask to "let this site view files"; the save stays on your computer. Checked on game build __BUILD__; the Python runtime the page needs is about 6 MB, fetched once and cached.</p>
        </div>
      </details>
    </div>
    <div class="onb-foot">
      <span>The page only reads your save files.</span>
      <div class="foot-links" id="footSlot">
        <a class="lg-btn" href="__ISSUES__" target="_blank" rel="noopener" title="Opens a new issue on GitHub. A save that will not build, a wrong number, or something the board should show: all welcome.">Report a bug or request a feature &#8599;</a>
        <a class="lg-btn" href="__DONATE__" target="_blank" rel="noopener" title="A small thank-you keeps this and future Big Ambitions projects going.">Support the project &#8599;</a>
        <a class="lg-text" href="__REPO__" target="_blank" rel="noopener" title="MIT-licensed">Source &#8599;</a>
        <button type="button" class="lg-text" id="forgetHistory" title="Sixty days of demand and cash history are kept in this browser for the trends. Forgetting them starts a fresh record.">Forget history</button>
      </div>
    </div>
  </div>
  <input type="file" id="folderPick" webkitdirectory directory multiple hidden>
  <input type="file" id="localePick" accept=".json" hidden>
  <div class="veil" id="dropVeil" hidden><div>Drop the save to load it</div></div>
</section>
<!-- The board's source controls, empty until a save loads. app.js moves the
     card and the Update button here and the rest into the More menu. -->
<template id="boardControls">
  <div class="source-actions" id="sourceActions">
    <div class="menu" id="srcMenu">
      <button type="button" class="lg-btn" id="menuBtn" aria-haspopup="true" aria-expanded="false">More <span aria-hidden="true">&#8964;</span></button>
      <div class="menu-panel">
        <div class="menu-heading">Save source</div>
        <div id="menuSourceSlot"></div>
        <p class="menu-hint">Or drop a .hsg save anywhere.</p>
        <div class="menu-divider"></div>
        <div id="menuChipSlot"></div>
        <p class="menu-hint" id="menuChipHint"></p>
        <div id="menuHelpSlot"></div>
        <div class="menu-foot"><div id="menuFootSlot" class="foot-links"></div></div>
      </div>
    </div>
  </div>
</template>
""".replace("__BUILD__", str(VERIFIED_BUILD)).replace("__REPO__", REPO).replace("__ISSUES__", ISSUES_URL).replace("__DONATE__", DONATE_URL)

def stamp() -> str:
    """A short hash of everything the page fetches, so a deploy busts caches."""
    import hashlib

    h = hashlib.md5()
    for name in ("web/app.js", "web/worker.js", "ba_save.py", "ba_dashboard.py", "web/py/names.json"):
        with open(os.path.join(HERE, name), "rb") as fh:
            h.update(fh.read())
    return h.hexdigest()[:10]


# app.js is fetched with the build stamp, and hands the same stamp to the
# worker, which hands it to the Python files: one deploy, one version.
BEFORE_SCRIPT = (
    '<script>window.LEDGER_BUILD = "__STAMP__";</script>' + chr(10)
    + '<script src="app.js?v=__STAMP__"></script>' + chr(10)
)


def main() -> None:
    os.makedirs(os.path.join(WEB, "py"), exist_ok=True)
    for name in ("ba_save.py", "ba_dashboard.py"):
        shutil.copyfile(os.path.join(HERE, name), os.path.join(WEB, "py", name))
    locale = load_locale(DEFAULT_LOCALE)
    if not locale:
        raise SystemExit(f"no game text at {DEFAULT_LOCALE}; names.json cannot be built")
    names = {k: v for k, v in locale.items() if k.startswith(NAME_PREFIXES)}
    with open(os.path.join(WEB, "py", "names.json"), "w", encoding="utf-8", newline="\n") as fh:
        json.dump(names, fh, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    print(f"names.json: {len(names)} display names")
    # The template carries its own charset tag; a viewport tag is all the page adds.
    head = '<meta name="viewport" content="width=device-width, initial-scale=1">' + chr(10)
    page = head + render(
        None, live=True, banner=BANNER, before_script=BEFORE_SCRIPT.replace("__STAMP__", stamp())
    )
    out = os.path.join(WEB, "index.html")
    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(page)
    print(f"wrote {out} ({len(page) // 1024} KB) and web/py/")


if __name__ == "__main__":
    main()
