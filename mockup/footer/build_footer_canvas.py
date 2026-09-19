"""Generates the Big Copilot footer canvas: project/*.dc.html and project/canvas.json.

The canvas is published at https://claude.ai/artifact/1YVEPZP4CCjKKTxK1VBvAC; the porting
plan is IMPLEMENTATION.md beside this file. Never hand-edit project/: change this and rerun.
"""
import json
from pathlib import Path

ROOT = Path(__file__).parent / "project"
STEAM = "https://store.steampowered.com/app/1331550/Big_Ambitions/"
YOUTUBE = "https://www.youtube.com/@PeterHartwieg"
REPO = "https://github.com/PeterHartwieg/big-copilot"
REDDIT = "https://www.reddit.com/r/bigambitions/"
# The index keeps the stamp the canvas was created with.
CREATED_AT = "2026-09-18T19:59:04Z"

CSS = """
body{margin:0;background:#0d100f}
.ft{--ground:#0d100f;--surface:#151917;--raised:#1c211e;--ink:#e9ece6;--ink-2:#9aa39d;--rule:#262c28;--rule-soft:#1e2320;--accent:#43c07a;--accent-soft:#43c07a26;--on-accent:#08130d;position:relative;font-family:Archivo,"Helvetica Neue",sans-serif;background:var(--ground);color:var(--ink)}
.ft.light{--ground:#eef0ea;--surface:#fdfdfb;--raised:#f3f4ef;--ink:#15181a;--ink-2:#5b6469;--rule:#d2d6cd;--rule-soft:#e0e3da;--accent:#00703a;--accent-soft:#00703a1f;--on-accent:#ffffff}
.ft a{color:var(--ink);text-decoration:none}
.ft a:hover{color:var(--accent)}
.ft .ic{fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
.ft .ext{color:var(--ink-2)}
.ft .mono{font-family:"IBM Plex Mono",monospace}
.ft .orb{position:absolute;left:0;bottom:0;width:26px;height:26px;border-radius:50%;background:radial-gradient(circle at 35% 30%,color-mix(in srgb,var(--accent) 45%,white),var(--accent) 52%,color-mix(in srgb,var(--accent) 55%,black));box-shadow:0 0 18px var(--accent-soft)}
.ft .door{transition:transform .18s ease,border-color .18s ease}
.ft .door:hover{transform:translateY(-2px);border-color:var(--accent)}
.ft .door:hover .beat{animation:ftbeat .7s ease-in-out infinite}
.ft .door:hover .nudge{animation:ftnudge .7s ease-in-out infinite}
.ft .cta{cursor:pointer;font:600 14px/1 Archivo,"Helvetica Neue",sans-serif;border-radius:999px;border:1px solid var(--accent);display:inline-flex;align-items:center;gap:8px;white-space:nowrap;box-sizing:border-box}
.ft .cta.fill,.ft a.cta.fill{background:var(--accent);color:var(--on-accent)}
.ft .cta.fill:hover{filter:brightness(1.08);color:var(--on-accent)}
.ft .cta.line,.ft a.cta.line{background:transparent;color:var(--accent)}
.ft .cta.line:hover{background:var(--accent-soft);color:var(--accent)}
.ft .legal a{color:var(--ink-2);border-bottom:1px solid var(--rule)}
.ft .legal a:hover{color:var(--ink)}
.ft .seg{cursor:pointer;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:999px;background:transparent;color:var(--ink-2)}
.ft .seg:hover{color:var(--ink)}
.ft .seg.on{background:var(--raised);color:var(--accent);box-shadow:inset 0 0 0 1px var(--rule)}
.ft .live{width:7px;height:7px;border-radius:50%;background:var(--accent);animation:ftpulse 2s ease-in-out infinite}
@keyframes ftbeat{0%,100%{transform:scale(1)}40%{transform:scale(1.22)}}
@keyframes ftnudge{0%,100%{transform:translateY(0)}40%{transform:translateY(-3px)}}
@keyframes ftpulse{0%,100%{opacity:1}50%{opacity:.35}}
@media (prefers-reduced-motion:reduce){.ft .door,.ft .beat,.ft .nudge,.ft .live{animation:none!important;transition:none}}
"""

IC = {
    "vote": '<svg class="ic nudge" viewBox="0 0 24 24" width="SZ" height="SZ" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4"></rect><path d="M8 13.5l4-4 4 4"></path></svg>',
    "heart": '<svg class="ic beat" viewBox="0 0 24 24" width="SZ" height="SZ" aria-hidden="true"><path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.500 15.4 12 20 12 20z"></path></svg>',
    "youtube": '<svg class="ic" viewBox="0 0 24 24" width="SZ" height="SZ" aria-hidden="true"><rect x="2.5" y="5.5" width="19" height="13" rx="4"></rect><path d="M10.2 9.4l4.4 2.6-4.4 2.6z"></path></svg>',
    "reddit": '<svg class="ic" viewBox="0 0 24 24" width="SZ" height="SZ" aria-hidden="true"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5z"></path></svg>',
    "ext": '<svg class="ic ext" viewBox="0 0 24 24" width="SZ" height="SZ" aria-hidden="true"><path d="M8 16l8-8M9.5 8H16v6.5"></path></svg>',
    "auto": '<svg class="ic" viewBox="0 0 24 24" width="SZ" height="SZ" aria-hidden="true"><rect x="3" y="4.5" width="18" height="12" rx="2"></rect><path d="M9 20.5h6M12 16.500v4"></path></svg>',
    "sun": '<svg class="ic" viewBox="0 0 24 24" width="SZ" height="SZ" aria-hidden="true"><circle cx="12" cy="12" r="3.8"></circle><path d="M12 2.8v2.4M12 18.800v2.4M2.8 12h2.4M18.800 12h2.4M5.500 5.500l1.700 1.700M16.800 16.800l1.700 1.700M5.500 18.500l1.700-1.700M16.800 7.200l1.700-1.700"></path></svg>',
    "moon": '<svg class="ic" viewBox="0 0 24 24" width="SZ" height="SZ" aria-hidden="true"><path d="M20 14.2A8.2 8.2 0 0 1 9.800 4a8.200 8.200 0 1 0 10.200 10.200z"></path></svg>',
}


def ic(name, size=16):
    return IC[name].replace("SZ", str(size))


def segs(btn):
    """The theme switch: match the system, light, dark. It works in Play."""
    b = f"width: {btn}px; height: {btn}px;"
    return f"""<div role="group" aria-label="Theme" style="display: inline-flex; gap: 2px; padding: 3px; border: 1px solid var(--rule); border-radius: 999px; background: var(--surface);">
<button type="button" class="{{{{autoCls}}}}" aria-pressed="{{{{autoOn}}}}" aria-label="Match system" title="Match system" onClick="{{{{setAuto}}}}" style="{b}">{ic("auto")}</button>
<button type="button" class="{{{{lightCls}}}}" aria-pressed="{{{{lightOn}}}}" aria-label="Light" title="Light" onClick="{{{{setLight}}}}" style="{b}">{ic("sun")}</button>
<button type="button" class="{{{{darkCls}}}}" aria-pressed="{{{{darkOn}}}}" aria-label="Dark" title="Dark" onClick="{{{{setDark}}}}" style="{b}">{ic("moon")}</button>
</div>"""


def wordmark(size=15):
    return f"""<span style="display: inline-flex; align-items: center; gap: 8px; font-weight: 800; font-size: {size}px; letter-spacing: -0.01em;"><span style="width: 9px; height: 9px; border-radius: 50%; background: var(--accent);"></span>Big Copilot</span>"""


DISCLAIMER = "Fan-made companion for Big Ambitions. Not affiliated with, endorsed by or supported by Hovgaard Games."

def heading(text):
    return f"""<div class="mono" style="font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-2);">{text}</div>"""


def link(label, href="#", icon=None, ext=False, h=None):
    box = f"min-height: {h}px; " if h else ""
    lead = ic(icon) if icon else ""
    tail = ic("ext", 14) if ext else ""
    target = ' target="_blank" rel="noopener"' if ext else ""
    return f"""<a href="{href}"{target} style="{box}display: inline-flex; align-items: center; gap: 8px; font-size: 14px;">{lead}{label}{tail}</a>"""


def column(title, items, gap=10):
    return f"""<div style="display: flex; flex-direction: column; align-items: flex-start; gap: {gap}px;">
{heading(title)}
{chr(10).join(items)}
</div>"""


def cols(h=None, gap=10):
    return [
        column("Big Copilot", [link("Changelog", h=h), link("Report a bug", REPO + "/issues/new", ext=True, h=h), link("Source code", REPO, ext=True, h=h)], gap),
        column("Follow", [link("YouTube", YOUTUBE, icon="youtube", ext=True, h=h), link("r/bigambitions", REDDIT, icon="reddit", ext=True, h=h)], gap),
        column("Big Ambitions · official", [link("Steam store page", STEAM, ext=True, h=h), link("Hovgaard Games", ext=True, h=h)], gap),
    ]


def door(kind, phone=False):
    if kind == "vote":
        icon, title, sub = ic("vote", 22), "Vote on what comes next", "Pick the features Big Copilot gets next."
        cta = f"""<button type="button" class="cta fill" aria-haspopup="dialog" style="height: 44px; padding: 0 20px;{' width: 100%; justify-content: center;' if phone else ''}">Vote on features</button>"""
    else:
        icon, title, sub = ic("heart", 22), "Support the project", "A small thank-you keeps this and future Big Ambitions projects going."
        cta = f"""<a href="#" class="cta line" style="height: 44px; padding: 0 20px;{' width: 100%; justify-content: center;' if phone else ''}">{ic("heart")}Donate via PayPal</a>"""
    direction = "flex-direction: column; align-items: stretch; gap: 16px;" if phone else "align-items: center; gap: 18px;"
    return f"""<div class="door" style="display: flex; {direction} padding: 20px; background: var(--surface); border: 1px solid var(--rule); border-radius: 8px;">
<div style="display: flex; align-items: flex-start; gap: 14px; flex-grow: 1;">
<span style="display: inline-flex; align-items: center; justify-content: center; width: 42px; height: 42px; border-radius: 50%; background: var(--accent-soft); color: var(--accent); flex-shrink: 0;">{icon}</span>
<div style="display: flex; flex-direction: column; gap: 5px;">
<div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;"><span style="font-size: 17px; font-weight: 600;">{title}</span></div>
<div style="font-size: 13px; line-height: 1.5; color: var(--ink-2);">{sub}</div>
</div>
</div>
{cta}
</div>"""


def legal(h=None):
    box = f"min-height: {h}px; display: inline-flex; align-items: center;" if h else ""
    return f"""<span class="legal mono" style="display: inline-flex; align-items: center; gap: 14px; font-size: 11px; letter-spacing: 0.04em; color: var(--ink-2); white-space: nowrap;"><a href="#" style="{box}">Impressum</a><a href="#" style="{box}">Privacy</a><span>Game build 3680</span></span>"""


def main_board(w, h):
    return f"""<div class="{{{{themeClass}}}}" style="width: {w}px; height: {h}px; box-sizing: border-box; padding: 0 64px 26px; display: flex; flex-direction: column;">
<div style="position: relative; height: 1px; margin-top: 52px; background: var(--rule);"><span class="orb"></span></div>
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 32px;">
{door("vote")}
{door("support")}
</div>
<div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 48px; margin-top: 40px;">
<div style="display: flex; gap: 88px;">
{chr(10).join(cols())}
</div>
<div style="display: flex; flex-direction: column; align-items: flex-end; gap: 10px;">
{heading("Theme")}
{segs(34)}
</div>
</div>
<div style="display: flex; justify-content: space-between; align-items: center; gap: 32px; margin-top: auto; padding-top: 16px; border-top: 1px solid var(--rule-soft);">
<div style="display: flex; align-items: center; gap: 18px;">
{wordmark()}
<span style="font-size: 12px; color: var(--ink-2);">{DISCLAIMER}</span>
</div>
{legal()}
</div>
</div>"""


def phone_board(w, h):
    c = cols(h=44, gap=0)
    return f"""<div class="{{{{themeClass}}}}" style="width: {w}px; height: {h}px; box-sizing: border-box; padding: 0 16px 24px; display: flex; flex-direction: column;">
<div style="position: relative; height: 1px; margin-top: 48px; background: var(--rule);"><span class="orb"></span></div>
<div style="display: flex; flex-direction: column; gap: 12px; margin-top: 24px;">
{door("vote", phone=True)}
{door("support", phone=True)}
</div>
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px 16px; margin-top: 32px;">
{c[0]}
{c[1]}
{c[2]}
<div style="display: flex; flex-direction: column; align-items: flex-start; gap: 10px;">
{heading("Theme")}
{segs(44)}
</div>
</div>
<div style="display: flex; flex-direction: column; gap: 10px; margin-top: 32px; padding-top: 16px; border-top: 1px solid var(--rule-soft);">
{wordmark()}
<span style="font-size: 12px; line-height: 1.6; color: var(--ink-2);">{DISCLAIMER}</span>
{legal(h=44)}
</div>
</div>"""


LOGIC = """class Component extends DCLogic {
renderVals() {
const base = this.props.theme ?? '__BASE__';
const mode = (this.state && this.state.mode) || 'auto';
const resolved = mode === 'auto' ? base : mode;
const seg = (m) => 'seg' + (mode === m ? ' on' : '');
return {
themeClass: 'ft' + (resolved === 'light' ? ' light' : ''),
autoCls: seg('auto'), lightCls: seg('light'), darkCls: seg('dark'),
autoOn: mode === 'auto', lightOn: mode === 'light', darkOn: mode === 'dark',
setAuto: () => this.setState({ mode: 'auto' }),
setLight: () => this.setState({ mode: 'light' }),
setDark: () => this.setState({ mode: 'dark' }),
};
}
}"""

PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>__TITLE__</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
<style>__CSS__</style>
</helmet>
__BODY__
</x-dc>
<script type="text/x-dc" data-dc-script data-props='__PROPS__'>
__LOGIC__
</script>
</body>
</html>
"""

# name, title, builder, w, h, base theme, x, y
BOARDS = [
    ("Main.dc.html", "Footer", main_board, 1280, 440, "dark", 0, 0),
    ("MainLight.dc.html", "Footer, light", main_board, 1280, 440, "light", 0, 560),
    ("Phone.dc.html", "Footer, phone", phone_board, 390, 960, "dark", 1360, 0),
]


def build():
    ROOT.mkdir(parents=True, exist_ok=True)
    boards, order = {}, []
    for name, title, builder, w, h, base, x, y in BOARDS:
        props = {
            "theme": {"editor": "enum", "options": ["dark", "light"], "default": base},
            "$preview": {"width": w, "height": h},
        }
        css = CSS if base == "dark" else CSS.replace("body{margin:0;background:#0d100f}", "body{margin:0;background:#eef0ea}")
        page = (PAGE.replace("__TITLE__", "Big Copilot footer: " + title.replace(" · ", " "))
                .replace("__CSS__", css)
                .replace("__BODY__", builder(w, h))
                .replace("__PROPS__", json.dumps(props, separators=(",", ":")))
                .replace("__LOGIC__", LOGIC.replace("__BASE__", base)))
        (ROOT / name).write_text(page, encoding="utf-8", newline="\n")
        boards[name] = {"x": x, "y": y, "w": w, "h": h, "title": title, "is_interactive": True}
        order.append(name)
    index = {
        "v": 3,
        "createdOnFiles": {"v": 1, "at": CREATED_AT},
        "title": "Big Copilot Footer",
        "launch": {"view": "canvas"},
        "pages": [],
        "boards": boards,
        "order": order,
        "notes": {},
        "designSystems": [],
    }
    (ROOT / "canvas.json").write_text(json.dumps(index, indent=1), encoding="utf-8", newline="\n")


if __name__ == "__main__":
    build()
