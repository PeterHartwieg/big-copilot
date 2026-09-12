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

# The game text shipped with the page: the display names of items, business
# types, neighbourhoods, stations and skills, and the few help pages the
# analysis reads: recipes, the item pages that state a station's customer
# capacity, each business type's range, and the workstation pages. Nothing
# else from the locale travels. A player's own en.json, when given, is laid
# over this, so a newer game wins.
NAME_PREFIXES = (
    "ba:itemname_",
    "ba:businesstype_",
    "ba:neighborhood_",
    "ba:factoryworkstationtype_",
    "ba:skill_",
)


def ships(key: str, text: str) -> bool:
    """Whether one locale entry travels with the page."""
    if key.startswith(NAME_PREFIXES) or key.startswith("recipes_"):
        return True
    if key.startswith("help_factory_workstation_"):
        return True
    if not key.endswith("_content"):
        return False
    if key.startswith(("help_recipes_", "help_ba:businesstype_")):
        return True
    if key.startswith("help_ba:itemname_"):
        return "Customer Capacity" in text or "employee station" in text
    return False

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(HERE, "web")
REPO = "https://github.com/PeterHartwieg/big-copilot"
ISSUES_URL = REPO + "/issues/new"
# Where "Support the project" goes. GitHub Sponsors for now; swap in a Ko-fi
# or PayPal address here and rebuild if you prefer one.
DONATE_URL = "https://github.com/sponsors/PeterHartwieg"
# Cloudflare Web Analytics: cookieless visit counts, nothing about the save.
# Paste the site token from the dashboard (Analytics & Logs > Web Analytics)
# here and rebuild; empty means no beacon on the page. The token is public,
# it sits in the HTML every visitor gets.
ANALYTICS_TOKEN = ""

# One set of controls, two homes.
#
# The landing is a screen you leave: the wordmark, one sentence, the drop zone,
# the folder button, a footer line. When a save loads, app.js moves the source
# strip into the slot the template leaves empty under the masthead, the rarer
# controls into the strip's More menu, and drops the landing. The elements
# below carry ids; app.js knows which slot each one belongs to in each mode.
# Layout after mockup/revamp/build_canvas.py (Landing, SourceStates): the
# class names without a prefix are the generator's, the CSS for them is copied
# from it; anything this shell invents is prefixed lg- so it cannot collide
# with the board's stylesheet.
ICON_FOLDER = '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>'
ICON_MORE = '<svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="1.4"></circle><circle cx="12" cy="12" r="1.4"></circle><circle cx="18" cy="12" r="1.4"></circle></svg>'

BANNER = r"""<style>
[hidden]{display:none!important}
body.has-board .landing{display:none}
body:not(.has-board) .wrap{display:none}
button.btn,button.btn2,button.ibtn{font-family:inherit;line-height:inherit}

/* landing (generator) ------------------------------------------------------ */
.landing{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px;padding:80px 0;perspective:1000px}
.landing .wordmark{font-size:44px}
.landing > p{margin:0;color:var(--ink-2);font-size:15px;max-width:460px;text-align:center;text-wrap:pretty}
.drop{
  width:560px;height:280px;border-radius:16px;border:1.5px dashed var(--rule);display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:16px;cursor:pointer;transition:border-color .2s,background .2s,transform .12s ease-out;position:relative;
  transform:rotateX(var(--rx,0)) rotateY(var(--ry,0));transform-style:preserve-3d;
}
.drop:hover,.drop.lg-over{border-color:var(--accent);background:var(--surface)}
.drop .folder{width:64px;height:52px;position:relative;transform:translateZ(30px)}
.drop .folder i{position:absolute;inset:0;border-radius:6px;background:var(--raised);border:1.5px solid var(--rule)}
.drop .folder i.tab{width:26px;height:10px;top:-8px;left:0;border-bottom:none;border-radius:6px 6px 0 0}
.drop .folder i.flap{top:10px;transform-origin:50% 100%;transition:transform .35s cubic-bezier(.34,1.56,.64,1);background:var(--surface)}
.drop:hover .folder i.flap,.drop.lg-over .folder i.flap{transform:perspective(200px) rotateX(-38deg)}
.drop .folder .file{position:absolute;left:18px;right:18px;top:4px;height:30px;border-radius:3px;background:var(--accent);opacity:0;transform:translateY(8px);transition:all .3s .05s}
.drop:hover .folder .file,.drop.lg-over .folder .file{opacity:1;transform:translateY(-10px)}
.drop b{font-size:15px;font-weight:600;transform:translateZ(16px)}
.drop span{font-size:12.5px;color:var(--ink-3);transform:translateZ(10px)}
.drop:focus-visible{outline:2px solid var(--accent);outline-offset:4px}
.btn{
  display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border-radius:8px;background:var(--ink);color:var(--ground);
  font-weight:600;font-size:13.5px;text-decoration:none;transition:transform .15s,opacity .15s;
}
.btn:hover{transform:translateY(-1px);opacity:.92;color:var(--ground)}
.btn svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
button.btn{border:0;cursor:pointer}
.landing .row{display:flex;align-items:center;gap:18px}
.landing footer{margin-top:40px;display:flex;gap:18px;align-items:center;font:400 11px/1 "IBM Plex Mono",monospace;letter-spacing:.06em;color:var(--ink-3)}
.landing{position:relative;overflow:clip}
.landing .orb{width:360px;height:360px;z-index:0}
.landing .orb i{box-shadow:0 40px 90px #43c07a44,inset -24px -34px 60px #00000066,inset 10px 14px 30px #ffffff22}
.landing .orb::after{bottom:-30px;height:26px;filter:blur(10px)}

/* source strip states (generator) -------------------------------------------- */
.strip{display:flex;align-items:center;gap:14px;padding:12px 16px;border-radius:10px;background:var(--surface);border:1px solid var(--rule-soft);margin-top:14px}
.strip .st{display:flex;align-items:center;gap:10px;font-size:13px}
.strip .st .led{width:8px;height:8px;border-radius:50%;background:var(--accent)}
.strip .st .led.busy{background:var(--info);animation:blink 1s steps(1) infinite}
.strip .st .led.err{background:var(--neg)}
.strip .file{font:400 12px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.strip .right{margin-left:auto;display:flex;gap:8px;align-items:center}
.strip .prog{position:relative;width:160px;height:3px;border-radius:2px;background:var(--rule);overflow:hidden}
.strip .prog i{position:absolute;top:0;bottom:0;width:40%;background:var(--info);border-radius:2px;animation:slide 1.2s ease-in-out infinite}
@keyframes slide{0%{left:-40%}100%{left:100%}}
.strip .err{color:var(--neg);font-size:12.5px}

/* the shell's own additions to the strip and the landing --------------------- */
.strip .st .led.lg-dim{background:var(--ink-3)}
.strip .file{text-transform:uppercase}
.strip .file:empty,.strip #srcStatus:empty{display:none}
.strip .btn2:disabled{opacity:.4;pointer-events:none}
.strip .st{min-width:0;flex-wrap:wrap}
.strip #srcStatus:not(.err),.strip .file,.strip .right > *{white-space:nowrap}
.strip .right{flex:none}
.strip #srcStatus.err{flex:1 1 0;min-width:200px}
.landing .strip{width:560px;margin:0}
.landing #updateBtn:disabled{display:none}
.lg-src{display:contents}
.lg-note{margin:-14px 0 0;max-width:560px;text-align:center}
.lg-note.warn{color:var(--warn)}
.source-note .lg-note{margin:8px 2px 0;max-width:none;text-align:left}
.lg-pick{cursor:pointer}
.lg-pick input{display:none}
/* the save menu: which character or save the board follows */
.lg-sel{font:inherit;font-size:12.5px;font-weight:500;line-height:1.4;color:var(--ink);background:var(--surface);
  border:1px solid var(--rule);border-radius:7px;padding:7px 10px;max-width:260px;cursor:pointer}
.lg-sel:hover{border-color:var(--ink-3)}
.lg-sel:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.menu-panel .lg-sel{display:block;width:100%;max-width:none;margin:0 0 6px;border-radius:4px}
.strip .right .menu-panel{white-space:normal}
.lg-foot{display:contents}
.landing footer a{cursor:pointer}
.landing details.help{width:560px;margin-top:-8px}
.landing details.help:not([open]){display:none}
.landing details.help > summary{display:none}
.landing .help-content{padding:16px 20px;border-radius:10px;background:var(--surface);border:1px solid var(--rule-soft)}
.lg-gametext{margin-top:16px;padding-top:12px;border-top:1px solid var(--rule-soft)}
.lg-gametext p{margin:8px 0 0;line-height:1.7}
.lg-gametext p.quiet{margin-top:4px}
.lg-gametext .path-label{margin-top:12px}
.save-location{width:560px;max-width:calc(100vw - 48px);min-width:0}
.save-location label{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:0 0 8px;font-size:12px;color:var(--ink-3)}
.save-location select{max-width:100%;font:inherit;color:var(--ink);background:var(--surface);border:1px solid var(--rule);border-radius:4px;padding:4px 6px}
.save-location p{margin:8px 0 0;font-size:12px;line-height:1.6;color:var(--ink-3)}
.menu-panel .save-location{width:100%;max-width:100%}
.foot #footerLinks a.lg-footlink{color:var(--ink-3);text-decoration:none;border-bottom:1px solid var(--rule)}
.foot #footerLinks a.lg-footlink:hover{color:var(--ink);border-color:var(--ink-3)}
@media (max-width:1100px){.landing .orb{display:none}}
@media (max-width:640px){.drop,.landing .strip,.landing details.help{width:calc(100vw - 48px)}.landing footer{flex-wrap:wrap;justify-content:center;line-height:1.8}}

/* shared pieces the More menu still uses --------------------------------- */
.lg-btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:36px;padding:8px 14px;
  border:1px solid var(--rule);border-radius:4px;background:var(--surface);color:var(--ink);font:inherit;font-size:12.5px;
  font-weight:500;line-height:1.4;text-decoration:none;white-space:nowrap;cursor:pointer}
.lg-btn:hover:not(:disabled){border-color:var(--ink-3)}
.lg-btn:disabled{cursor:default;color:var(--ink-3);background:var(--raised);border-color:var(--rule)}
.lg-text{font:inherit;font-size:12px;background:none;border:0;padding:0;color:var(--ink-2);text-decoration:underline;
  text-underline-offset:3px;cursor:pointer}
.lg-text:hover{color:var(--ink)}
.lg-chip{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--rule);border-radius:20px;padding:6px 10px;
  font:inherit;font-size:11.5px;color:var(--ink);background:var(--surface);cursor:pointer;white-space:nowrap}
.lg-chip i{width:7px;height:7px;border-radius:50%;background:var(--warn);flex:none}
.lg-chip[data-state="ok"] i{background:var(--pos)}
.lg-watch::before{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--ink-3);margin-right:2px;flex:none}
.lg-watch[data-on="true"]{color:var(--pos)}
.lg-watch[data-on="true"]::before{background:var(--pos);animation:lgpulse 2.4s infinite}
@keyframes lgpulse{50%{opacity:.35}}
@media (prefers-reduced-motion:reduce){.lg-watch::before{animation:none!important}}

/* the save-location help: on the landing under "Where saves live", in the
   More menu on the board ------------------------------------------------- */
details.help summary{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:15px 0;font-size:12px;
  color:var(--ink-2);cursor:pointer;list-style:none}
details.help summary::-webkit-details-marker{display:none}
details.help summary::after{content:"+";font-size:14px;color:var(--ink-3)}
details.help[open] summary{color:var(--ink)}
details.help[open] summary::after{content:"\2013"}
.help-content{padding:0 0 20px;font-size:12px;color:var(--ink-2)}
.help-content>p{max-width:850px;line-height:1.8;margin:0}
.help-content>p.lg-quiet{margin-top:12px;font-size:11px}
.path-label{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:9px;text-transform:uppercase;letter-spacing:.07em;margin:14px 0 6px}
.path-row{display:flex;align-items:center;gap:14px;background:var(--raised);padding:9px 12px;border:1px solid var(--rule-soft)}
.path-row code{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:11px;flex:1;overflow-wrap:anywhere;user-select:all;color:var(--ink)}
.path-row button{font:inherit;font-size:11px;border:1px solid var(--rule);border-radius:3px;padding:4px 10px;background:var(--surface);
  color:var(--ink);cursor:pointer;flex:none}

/* the More menu's panel ------------------------------------------------- */
.menu{position:relative}
.menu-panel{display:none;position:absolute;right:0;top:calc(100% + 8px);width:320px;padding:10px;background:var(--surface);
  border:1px solid var(--rule);border-radius:5px;box-shadow:0 12px 32px color-mix(in srgb,var(--ink) 16%,transparent);z-index:40;
  max-height:min(650px,80vh);overflow:auto;text-align:left}
.menu.open .menu-panel{display:block}
.menu.open>.ibtn{color:var(--ink);border-color:var(--ink-3)}
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
.foot-links{display:flex;gap:10px 18px;align-items:center;flex-wrap:wrap}
.foot-links a.lg-text{color:var(--ink-2)}
.menu-foot .foot-links{width:100%;gap:4px 14px}
.menu-foot .foot-links .lg-btn{width:100%;margin:0 0 4px}
.menu-foot .foot-links .lg-text{margin-top:6px}
@media (max-width:760px){.menu-panel{width:min(320px,calc(100vw - 60px))}.path-row{flex-wrap:wrap}.path-row code{flex-basis:100%}}
</style>
<section class="landing" id="landing">
  <div class="brand rv" id="lgBrand"><span class="wordmark">Big Copilot</span><span class="dot" id="lgDot"></span></div>
  <p class="rv" id="welcomeLede">Drop a Big Ambitions save. Everything is read in this tab and nothing leaves it.</p>
  <div class="drop rv" id="drop" role="button" tabindex="0" title="Choose the folder named Big Ambitions inside SaveGames, or drop it here. The page looks through every company folder in it and takes the newest save; a menu then lets you pick another character or save.">
    <div class="folder"><i class="tab"></i><i></i><span class="file"></span><i class="flap"></i></div>
    <b>Drop your save folder anywhere</b>
    <span>the newest .hsg in it opens</span>
  </div>
  <div class="row rv" id="entryRow">
    <button type="button" class="btn" id="folderBtn" title="Choose the folder named Big Ambitions inside SaveGames. The page looks through every company folder in it and takes the newest save.">__ICON_FOLDER__Choose the folder</button>
    <label class="link lg-pick" id="savePickLabel" title="Choose one specific .hsg file instead"><span id="savePickText">or one save file</span><input type="file" id="savePick" accept=".hsg"></label>
  </div>
  <div class="save-location rv" id="saveLocation">
    <label for="savePlatform">Save folder <select id="savePlatform" aria-label="Operating system for save folder help"><option value="windows">Windows</option><option value="mac">macOS</option><option value="other" selected>Other / unknown</option></select></label>
    <div class="path-row" id="savePathRow" hidden><code id="savePath"></code><button type="button" class="copy" id="savePathCopy" data-copy="savePath">Copy</button></div>
    <p id="saveLocationHint">Choose Windows or macOS to see its save folder, or select a .hsg file.</p>
  </div>
  <div class="lg-src" id="srcSlot">
    <div class="strip" id="srcStrip" hidden>
      <div class="st"><span class="led" id="srcLed"></span><span id="srcStatus"></span><span class="prog" id="srcProg" hidden><i></i></span><span class="file" id="srcMeta"></span></div>
      <div class="right" id="srcActions">
        <button type="button" class="btn2 primary" id="recoverBtn" hidden>__ICON_FOLDER__Choose the folder again</button>
        <button type="button" class="btn2" id="updateBtn" disabled title="Read the newest save from the chosen folder again">Update</button>
      </div>
    </div>
    <p class="quiet lg-note" id="srcNote" hidden></p>
  </div>
  <footer class="rv">
    <a class="link" id="helpLink" href="#help">Where saves live</a><span>&middot;</span>
    <span class="lg-foot" id="footSlot">
      <a class="link" id="issueLink" href="__ISSUES__" target="_blank" rel="noopener" title="Opens a new issue on GitHub. A save that will not build, a wrong number, or something the board should show: all welcome.">Report a bug</a><span>&middot;</span>
      <a class="link" id="donateLink" href="__DONATE__" target="_blank" rel="noopener" title="A small thank-you keeps this and future Big Ambitions projects going.">Support the project</a><span>&middot;</span>
      <a class="link" id="sourceLink" href="__REPO__" target="_blank" rel="noopener" title="MIT-licensed">Source</a>
    </span>
    <span>&middot;</span><span>GAME BUILD __BUILD__</span>
  </footer>
  <details class="help" id="help">
    <summary>Where is my save?</summary>
    <div class="help-content">
      <p>Choose the <b>Big Ambitions</b> folder inside <b>SaveGames</b>; the page finds the newest save across the company folders inside it.</p>
      <p>The game autosaves every five minutes. Your browser may call folder access an "upload" or ask to "let this site view files"; the save stays on your computer. Checked on game build __BUILD__; the Python runtime the page needs is about 6 MB, fetched once and cached.__ANALYTICS_NOTE__</p>
      <div class="lg-gametext">
        <div class="path-label" id="asideEyebrow">Game text</div>
        <div id="asideChip"><button type="button" class="lg-chip" id="localeChip" data-state="ok"><i></i><span>Game text built in</span></button></div>
        <p id="asideText">Names, recipes and station capacities come with the page, from game build __BUILD__.</p>
        <p class="quiet" id="asideQuiet">If your game is newer, click the chip and choose its <code>en.json</code>; it is remembered in this browser and wins over the built-in text.</p>
        <div id="localeWindows" hidden><div class="path-label">en.json lives here &middot; default Windows Steam installation</div>
        <div class="path-row"><code id="localePath">C:\Program Files (x86)\Steam\steamapps\common\Big Ambitions\Big Ambitions_Data\StreamingAssets\locale</code><button type="button" class="copy" data-copy="localePath">Copy</button></div>
        </div>
        <p id="localeOther" class="quiet">To find your game's <code>en.json</code>, open Steam &rarr; Manage &rarr; Browse local files. On macOS, search that folder for <code>en.json</code>; use Show Package Contents if the game files are inside an app bundle.</p>
      </div>
      <p class="lg-quiet"><button type="button" class="lg-text" id="forgetHistory" title="Sixty days of demand and cash history are kept in this browser for the trends. Forgetting them starts a fresh record.">Forget history</button> &middot; the page only reads your save files.</p>
    </div>
  </details>
  <div class="orb" id="lgOrb" aria-hidden="true"><i></i><u></u></div>
  <input type="file" id="folderPick" webkitdirectory directory multiple hidden>
  <input type="file" id="localePick" accept=".json" hidden>
</section>
<!-- The strip's More menu, cloned into the strip when a save loads. app.js
     moves the folder button, the one-file picker, the game-text chip, the help
     and the footer links into its slots. -->
<template id="boardControls">
  <div class="menu" id="srcMenu">
    <button type="button" class="ibtn tr" id="menuBtn" aria-haspopup="true" aria-expanded="false" aria-label="More" data-tip="Change folder · one file · watch · game text · history · about">__ICON_MORE__</button>
    <div class="menu-panel">
      <div class="menu-heading">Save source</div>
      <div id="menuSourceSlot"></div>
      <button type="button" class="lg-btn lg-watch" id="watchBtn" hidden>Watch</button>
      <p class="menu-hint">Pick a character or one save above and the board follows it. Or drop a .hsg save anywhere.</p>
      <div class="menu-divider"></div>
      <div id="menuChipSlot"></div>
      <p class="menu-hint" id="menuChipHint"></p>
      <div id="menuHelpSlot"></div>
      <div class="menu-foot"><div id="menuFootSlot" class="foot-links"></div></div>
    </div>
  </div>
</template>
""".replace("__ICON_FOLDER__", ICON_FOLDER).replace("__ICON_MORE__", ICON_MORE).replace("__BUILD__", str(VERIFIED_BUILD)).replace("__REPO__", REPO).replace("__ISSUES__", ISSUES_URL).replace("__DONATE__", DONATE_URL).replace(
    # Cloudflare injects its cookieless beacon at the edge for this domain, so
    # the note is true whether or not a token is set here.
    "__ANALYTICS_NOTE__",
    " Visits are counted by Cloudflare's cookieless analytics; nothing about your save or company is in that count.",
)

def stamp() -> str:
    """A short hash of everything the page fetches, so a deploy busts caches."""
    import hashlib

    h = hashlib.md5()
    for name in ("web/app.js", "web/worker.js", "ba_save.py", "ba_dashboard.py", "web/py/gametext.json", "web/py/ba_buildings.json"):
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
    # The building table travels with the code; make_buildings.py has to have
    # been run, since the worker hands it to Python as data.
    shutil.copyfile(
        os.path.join(HERE, "ba_buildings.json"), os.path.join(WEB, "py", "ba_buildings.json")
    )
    locale = load_locale(DEFAULT_LOCALE)
    if not locale:
        raise SystemExit(f"no game text at {DEFAULT_LOCALE}; gametext.json cannot be built")
    text = {k: v for k, v in locale.items() if ships(k, v)}
    with open(os.path.join(WEB, "py", "gametext.json"), "w", encoding="utf-8", newline=chr(10)) as fh:
        json.dump(text, fh, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    print(f"gametext.json: {len(text)} entries")
    # The template carries the doctype, its own charset tag and the inline SVG
    # favicon (so this door never asks for /favicon.ico either); a viewport tag
    # is all the page adds, placed after them by render().
    head = '<meta name="viewport" content="width=device-width, initial-scale=1">' + chr(10)
    if ANALYTICS_TOKEN:
        head += (
            "<script defer src='https://static.cloudflareinsights.com/beacon.min.js' "
            + "data-cf-beacon='{\"token\": \"" + ANALYTICS_TOKEN + "\"}'></script>" + chr(10)
        )
    page = render(
        None, live=True, banner=BANNER, before_script=BEFORE_SCRIPT.replace("__STAMP__", stamp()),
        head=head,
    )
    out = os.path.join(WEB, "index.html")
    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(page)
    print(f"wrote {out} ({len(page) // 1024} KB) and web/py/")


if __name__ == "__main__":
    main()
