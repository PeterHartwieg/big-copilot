"""Supply: Changes, Imports (the fix journey and its writes), Production, and their states."""
from __future__ import annotations

from kit import (ROUTE, app, btn, chip, cover, from_strip, gwbtn, hood, hours, hrow, ic, mw, state)
import boards_overview as ov

SUP_CSS = """
.sp-scope-note{font-size:12.5px;color:var(--ink-3);margin-left:6px}
.sp-grid{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:28px;align-items:start;margin-top:22px}
.sp-mat{border:1px solid color-mix(in srgb,var(--accent) 35%,var(--rule));border-radius:14px;background:var(--surface);overflow:hidden;box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 7%,transparent)}
.sp-mh{display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px;padding:16px 18px 12px;border-bottom:1px solid var(--rule-soft)}
.sp-mh h2{font-size:19px;font-weight:600;letter-spacing:-.01em}
.sp-mh .how{display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--ink-2)}
.sp-mh .how .i{width:15px;height:15px}
.sp-ev{display:grid;grid-template-columns:minmax(0,1fr) 250px;gap:22px;padding:16px 18px;border-bottom:1px solid var(--rule-soft)}
.sp-ev .nx-cov .d{height:22px;border-radius:3px}
.sp-ev .nx-cov .d .trk{top:-19px}
.sp-ev .nx-cov .d .trk .i{width:16px;height:16px}
.sp-ev .nx-cov .ax{font-size:10.5px;margin-top:3px}
.sp-kv{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px 12px;font-size:12.5px;color:var(--ink-2)}
.sp-kv b{font:500 13px/1.2 "IBM Plex Mono",monospace;color:var(--ink);text-align:right;white-space:nowrap}
.sp-kv small{grid-column:1/3;font-size:11.5px;color:var(--ink-3);margin-top:-4px}
.sp-dec{display:grid;grid-template-columns:1fr 1fr;gap:0}
.sp-d{padding:16px 18px;display:flex;flex-direction:column;gap:10px}
.sp-d + .sp-d{border-left:1px solid var(--rule-soft)}
.sp-d h3{display:flex;align-items:center;gap:8px;font-size:14.5px;font-weight:600}
.sp-d h3 .i{color:var(--ink-3)}
.sp-d .kind{font:500 10px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}
.sp-set{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.sp-set .now{font:500 15px/1 "IBM Plex Mono",monospace;color:var(--ink-3);text-decoration:line-through;text-decoration-color:color-mix(in srgb,var(--ink-3) 60%,transparent)}
.sp-set .arrow{color:var(--ink-3)}
.sp-in{display:inline-flex;align-items:center;height:40px;border-radius:9px;border:1.5px solid var(--accent);background:var(--ground);padding:0 10px;gap:6px}
.sp-in input{width:92px;border:0;background:none;color:var(--ink);font:600 18px/1 "IBM Plex Mono",monospace;text-align:right;padding:0;outline:none}
.sp-in span{font-size:12px;color:var(--ink-2)}
.sp-set .unit{font-size:12.5px;color:var(--ink-2)}
.sp-bar{position:relative;height:10px;border-radius:3px;background:var(--rule-soft);margin:14px 0 4px}
.sp-bar .now{position:absolute;left:0;top:0;bottom:0;background:var(--ink-3);opacity:.6;border-radius:3px 0 0 3px}
.sp-bar .add{position:absolute;top:0;bottom:0;background:var(--accent)}
.sp-bar .need{position:absolute;top:-5px;bottom:-5px;width:2px;background:var(--ink)}
.sp-bar .cap{position:absolute;top:-5px;bottom:-5px;width:2px;background:var(--ink-3)}
.sp-bar .lb{position:absolute;top:-17px;transform:translateX(-50%);font:500 9.5px/1 "IBM Plex Mono",monospace;color:var(--ink-3);white-space:nowrap}
.sp-where{display:flex;align-items:flex-start;gap:8px;padding:9px 10px;border-radius:8px;background:var(--ground);font-size:12px;color:var(--ink-2);line-height:1.45}
.sp-where .i{width:15px;height:15px;color:var(--ink-3);margin-top:1px}
.sp-where b{color:var(--ink);font-weight:600}
.sp-disc{border-top:1px solid var(--rule-soft);padding:12px 18px}
.sp-disc summary,.sp-disc > button{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--ink-2);cursor:pointer;background:none;border:0;padding:0;list-style:none}
.sp-disc .calc{margin-top:10px;font:400 12px/1.7 "IBM Plex Mono",monospace;color:var(--ink-2);display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:18px}
.sp-disc .calc b{color:var(--ink);font-weight:500;text-align:right}
.sp-disc .calc .tot{border-top:1px solid var(--rule);padding-top:4px;margin-top:4px}
.sp-exec{display:flex;flex-direction:column;gap:14px;position:sticky;top:0}
.sp-steps{display:flex;flex-direction:column;gap:0;border-left:1.5px solid var(--rule);margin-left:9px}
.sp-step{position:relative;padding:0 0 12px 18px;font-size:12.5px;color:var(--ink-3)}
.sp-step::before{content:"";position:absolute;left:-6px;top:3px;width:10px;height:10px;border-radius:50%;background:var(--ground);border:1.5px solid var(--rule)}
.sp-step b{display:block;color:var(--ink-2);font-weight:600;font-size:13px}
.sp-step.on::before{background:var(--ink);border-color:var(--ink)}
.sp-step.on b{color:var(--ink)}
.sp-step.dash::before{border-style:dashed}
.sp-step.done::before{background:var(--accent);border-color:var(--accent)}
.sp-step.link::before{background:var(--info);border-color:var(--info)}
.sp-or{display:flex;align-items:center;gap:10px;font:500 10px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;color:var(--ink-3)}
.sp-or::before,.sp-or::after{content:"";flex:1;border-top:1px solid var(--rule-soft)}
.sp-other{margin-top:26px}
.sp-legend{display:flex;align-items:center;gap:16px;font-size:12px;color:var(--ink-2);flex-wrap:wrap}
.sp-legend span{display:inline-flex;align-items:center;gap:6px}
.sp-legend .i{width:15px;height:15px;color:var(--ink-3)}
.sp-line{display:grid;grid-template-columns:28px 190px minmax(0,1fr) 170px 150px;gap:14px;align-items:center;padding:12px 0;border-bottom:1px solid var(--rule-soft);font-size:13px}
.sp-line .i{color:var(--ink-3)}
.sp-line .n{font:500 13px/1.3 "IBM Plex Mono",monospace;text-align:right}
.sp-line .n small{display:block;font-size:10.5px;color:var(--ink-3)}
.sp-scrim{position:absolute;inset:0;background:#000b;z-index:20}
.board.light .sp-scrim{background:#15181a66}
.sp-dlgwrap{position:absolute;left:0;right:0;top:70px;display:flex;justify-content:center;z-index:21}
.sp-dlgwrap.low{top:auto;bottom:0;align-items:flex-end}
.sp-mach{display:grid;grid-template-columns:62px minmax(0,1fr) minmax(0,1fr) 110px;gap:8px 18px;align-items:center}
.sp-mach .hd{font:500 10px/1.2 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3);padding-bottom:6px;border-bottom:1px solid var(--rule)}
.sp-mach .m{font:500 12px/1 "IBM Plex Mono",monospace;color:var(--ink-2)}
.sp-mach .nx-hrs i{height:16px}
.sp-mach .d{font:500 12.5px/1.2 "IBM Plex Mono",monospace;text-align:right}
.sp-mach .d small{display:block;font-size:10.5px;color:var(--ink-3)}
.sp-ax{display:grid;grid-template-columns:repeat(24,minmax(0,1fr));font:500 9px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.sp-out{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border:1px solid var(--rule-soft);border-radius:12px;overflow:hidden}
.sp-out > div{padding:12px 16px;display:flex;flex-direction:column;gap:4px;background:var(--surface)}
.sp-out > div + div{border-left:1px solid var(--rule-soft)}
.sp-out .v{font:500 20px/1.1 "IBM Plex Mono",monospace}
.sp-out small{font-size:11.5px;color:var(--ink-3)}
.sp-out .sel{background:color-mix(in srgb,var(--accent) 8%,var(--surface));box-shadow:inset 0 -2px 0 var(--accent)}
.sp-plan{border:1px solid var(--rule-soft);border-radius:14px;background:var(--surface);padding:16px 18px;display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:24px}
.sp-plan h3{font-size:16px;font-weight:600;display:flex;align-items:center;gap:10px}
.sp-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;background:var(--rule-soft);border:1px solid var(--rule-soft);border-radius:10px;overflow:hidden;margin-top:12px}
.sp-tiles > div{background:var(--ground);padding:10px 12px;display:flex;flex-direction:column;gap:3px}
.sp-tiles .v{font:500 18px/1.1 "IBM Plex Mono",monospace}
.sp-tiles small{font-size:11px;color:var(--ink-3)}
.sp-shifts{display:flex;flex-direction:column;gap:6px;margin-top:14px}
.sp-shift{display:grid;grid-template-columns:62px minmax(0,1fr);gap:18px;align-items:center}
.sp-shift .row{position:relative;height:22px;border-radius:5px;background:var(--rule-soft)}
.sp-shift .row b{position:absolute;top:2px;bottom:2px;border-radius:4px;background:var(--accent-soft);border:1px solid color-mix(in srgb,var(--accent) 55%,transparent);font:500 10.5px/16px "IBM Plex Mono",monospace;color:var(--ink);padding:0 6px;white-space:nowrap;overflow:hidden}
.sp-shift .row b.hire{border-style:dashed;background:transparent;color:var(--warn);border-color:color-mix(in srgb,var(--warn) 60%,transparent)}
.sp-empty{display:flex;flex-direction:column;align-items:flex-start;gap:12px;padding:30px 32px;border:1px dashed var(--rule);border-radius:14px;margin-top:22px;max-width:760px}
.sp-empty h2{font-size:20px;font-weight:600}
.sp-empty p{font-size:13.5px;color:var(--ink-2);line-height:1.55}
.sp-empty .pic{display:flex;align-items:center;gap:8px;color:var(--ink-3)}
.sp-empty .pic span{width:44px;height:30px;border-radius:7px;border:1.5px dashed var(--rule)}
.sp-empty .pic u{width:30px;border-top:2px dashed var(--rule)}
.sp-pick{display:inline-flex;align-items:center;gap:8px;height:34px;padding:0 10px;border-radius:8px;border:1.5px solid var(--warn);background:var(--ground);font-size:13px;color:var(--ink)}
"""

CRUMB = lambda v: [("Supply", ROUTE["supply"]), (v, "")]


def scope(sel: str = "", extra: str = "") -> str:
    s = (f'<span class="nx-pick sel">{ic("warehouse")}{sel}<span class="x" aria-label="Clear">{ic("x", style="width:12px;height:12px")}</span></span>'
         if sel else f'<button class="nx-pick" type="button">{ic("businesses")}Whole company{ic("chevd")}</button>')
    return (f'<div class="nx-scope"><span class="lab">Scope</span>{s}'
            f'<button class="nx-pick" type="button">{ic("shop")}Shops<span class="mono dim">11</span></button>'
            f'<button class="nx-pick" type="button">{ic("warehouse")}Warehouses<span class="mono dim">2</span></button>'
            f'<button class="nx-pick" type="button">{ic("factory")}Factories<span class="mono dim">2</span></button>'
            f'<span style="margin-left:auto;display:flex;gap:8px;align-items:center">{extra}'
            f'<div class="seg" data-seg="f"><button class="on" type="button">Needs a change</button><button type="button">Everything</button></div></span></div>')


def basis(which: str = "full", seg: bool = True, note: str = "") -> str:
    full = which == "full"
    txt = ("<b>Full production:</b> every factory line at its rated output, round the clock; the imports behind it are sized to match, with no margin on the factory part."
           if full else "<b>Shop demand:</b> each factory line sized to what your shops sell of its product, plus 15%, never past its rated output.")
    return (f'<div class="nx-basis"><span class="lab">Plan for</span>'
            f'<div class="seg" data-seg="basis"><button class="{"on" if full else ""}" type="button" data-v="full">Full production</button>'
            f'<button class="{"" if full else "on"}" type="button" data-v="demand">Shop demand</button></div>'
            f'<span class="txt">{txt}{note}</span></div>')


# --------------------------------------------------------------------------
# Supply › Changes: the company-wide checklist
# --------------------------------------------------------------------------
CHG = [
    ("Imports", [
        ("sug", "Set the weekly order of Water at 1 Pier to 18,740", "IC", "Bridge Hub", "a week · Full production", "8,400", "18,740", "a week", True, "supply/imports"),
        ("sug", "Set the weekly order of Fabric (Cheap) at 7 Pier to 6,300", "GD", "Garment Depot", "a week · 7 Pier caps it at 8,000", "5,000", "6,300", "a week", True, "supply/imports"),
        ("conf", "Set Smart Delivery stock of Soda Can at 1 Pier to 2,600", "IC", "Bridge Hub", "in stock · read day 83 09:40", "2,000", "2,600", "in stock", True, "supply/imports"),
    ]),
    ("Deliveries", [
        ("sug", "Add a daily top-up of Umbrella from Bridge Hub, 30", "MT", "Marlow Market", "a day · no plan brings it now", "none", "30", "a day", False, "supply/deliveries"),
        ("mine", "Raise the weekly wholesale delivery of Gift (Cheap) to 700", "LM", "Harbor Gifts", "a week, each Monday · wholesale store", "450", "700", "a week", False, "supply/deliveries"),
        ("mine", "Lower the top-up target of Soda Can to 300", "MT", "Marlow Market", "a day · a lower target, not a shortage", "1,400", "300", "target", False, "supply/deliveries"),
        ("sug", "Send Clothing (Cheap) from Garment Depot to Stitch &amp; Co", "GD", "Garment Depot", "new route · 3,000 held, not routed", "none", "180", "a day", False, "supply/deliveries"),
    ]),
    ("Production", [
        ("sug", "Raise Bridge Hub's top-up of Water to Canal Brewery to 2,400", "IC", "Canal Brewery", "a day · Full production", "1,200", "2,400", "a day", False, "supply/production"),
        ("sug", "Schedule all 4 Beer machines for 24 h a day", "IC", "Canal Brewery", "hire 7 · +$1,620 a day in wages", "60", "96", "machine-h a day", False, "supply/production"),
    ]),
]


def chg_row(r) -> str:
    st, what, hd, site, sub, now, to, unit, writable, route = r
    done = st in ("mine", "conf")
    tick_cls = {"mine": "nx-tick on", "conf": "nx-tick conf", "sug": "nx-tick"}[st]
    lab = {"mine": "Marked done by you", "conf": "Confirmed · 09:40", "sug": "Suggested"}[st]
    return (f'<div class="nx-chg{" done" if done else ""}"><button class="{tick_cls}" type="button" aria-pressed="{"true" if done else "false"}" aria-label="Mark done: {what}">{ic("tick")}</button>'
            f'<div class="s"><b>{what}</b><small>{hood(hd)}<a href="{ROUTE[route]}" style="color:var(--ink-2)">{site}</a> · {sub}</small></div>'
            f'<div class="v"><s>{now}</s> → <em>{to}</em><small>{unit}</small></div>'
            f'<div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px">{state(st, lab)}{"<span class=mono style=font-size:10.5px;color:var(--ink-3);display:flex;gap:6px;align-items:center>" + mw() + "game link can apply</span>" if writable and st == "sug" else ""}</div></div>')


def changes() -> str:
    groups = ""
    for g, rows in CHG:
        route = {"Imports": "supply/imports", "Deliveries": "supply/deliveries", "Production": "supply/production"}[g]
        groups += (f'<div class="nx-band" style="margin-top:14px"><span class="lab">{g}</span><span class="n">{len(rows)}</span>'
                   f'<a class="link" href="{ROUTE[route]}" style="margin-left:auto">Open {g}</a></div>' + "".join(chg_row(r) for r in rows))
    copy = """Marlow Trading · day 83 · plan for: Full production
[ ] Bridge Hub · 1 Pier · Water: weekly order 8,400 -> 18,740 a week
[ ] Garment Depot · 7 Pier · Fabric (Cheap): weekly order 5,000 -> 6,300 a week
[ ] Marlow Market (MT) · Umbrella: add a daily top-up of 30 from Bridge Hub
[ ] Garment Depot -> Stitch &amp; Co · Clothing (Cheap): add a route, 180 a day
[ ] Canal Brewery · Water top-up from Bridge Hub: 1,200 -> 2,400 a day
[ ] Canal Brewery · Beer, 4 machines: schedule 24 h a day (7 more people)"""
    body = f"""
<p class="nx-lede" style="margin-top:18px">Every setting the board suggests you change, across the company, with its units and the basis it was sized on. <b>Your ticks are notes kept in this browser</b>; only a refreshed save or game read can confirm a change.</p>
{scope(extra='<span class="chip dim">Plan for: Full production</span>')}
<div class="sp-grid">
  <div>
    <div class="nx-ck" style="--p:33%">
      <span class="lab">Change checklist</span>
      <span class="cnt"><b>3</b> of 9 done</span>
      <div class="road" aria-hidden="true"><i class="done"></i><span class="truck">{ic("truck")}</span></div>
      <button class="nx-btn sm" type="button">{ic("refresh")}Clear my ticks</button>
    </div>
    <p class="quiet" style="margin-top:10px">9 changes here, 17 findings on the Overview: the checklist also holds 1 lower target and 1 margin improvement, and leaves out findings with nothing to type (staff demands, amenities).</p>
    {groups}
  </div>
  <aside class="sp-exec">
    <div class="nx-box">
      <h4>{ic("copy")}Copy the 6 still to do</h4>
      <div class="nx-copy">{copy}</div>
      <div style="display:flex;gap:8px;margin-top:10px">{btn("Copy remaining", "go", icon="copy")}{btn("Copy all 9", "ghost")}</div>
      <p class="quiet" style="margin-top:8px">Units, the model and where each is set travel with the text. No clipboard? The text is selectable.</p>
    </div>
    <div class="nx-box">
      <h4>{mw()}Apply through the game link</h4>
      <p style="font-size:12.5px;color:var(--ink-2)"><b style="color:var(--ink)">2 of the 6</b> can be written: the import amounts at Bridge Hub and Garment Depot. Deliveries, routes and factory hours are yours to set in the game.</p>
      <div style="margin-top:10px">{gwbtn("Preview 2 import amounts", "", "WritePreview.dc.html")}</div>
    </div>
    <div class="nx-box">
      <h4>{ic("list")}What the marks mean</h4>
      <div class="nx-legend"><div>{state("sug")}</div><div>{state("mine")}</div><div>{state("link")}</div><div>{state("conf")}</div></div>
    </div>
  </aside>
</div>"""
    return app("supply", "changes", "Changes", body, CRUMB("Changes"))


# --------------------------------------------------------------------------
# Supply › Imports: the Water shortfall, from Needs attention
# --------------------------------------------------------------------------
def water_card(proposed: str = "18,740", st: str = "sug", stamp: str = "") -> str:
    steps = {
        "sug": ("on", "dash", "dash", "dash"),
        "mine": ("done", "on", "dash", "dash"),
        "link": ("done", "", "link on", "dash"),
        "conf": ("done", "", "link", "done on"),
    }[st]
    head_state = {"sug": state("sug"), "mine": state("mine", "Marked done by you · 09:44"), "link": state("link", "Applied through game link · 09:46"),
                  "conf": state("conf", "Confirmed · day 84 00:10")}[st]
    status = chip("bad", "short", "chevd") if st in ("sug", "mine", "link") else chip("ok", "covered", "tick")
    now_val = "8,400" if st != "conf" else "18,740"
    bar_now = 42 if st != "conf" else 93.7
    return f"""
<div class="sp-mat" id="water">
  <div class="sp-mh">{hood("IC")}<h2>Water · Bridge Hub</h2>{status}
    <span class="how">{ic("truck")}Fixed weekly amount from <b>1 Pier</b>, delivered Monday 08:00</span>
    <span style="margin-left:auto">{head_state}</span></div>
  <div class="sp-ev">
    <div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:24px"><span class="lab">Stock cover, next 7 days</span><span class="quiet">at today's draw · 1,740 a day</span></div>
      {cover(["", "", "", "half", "dry", "", ""] if st != "conf" else ["", "", "", "", "", "", ""], ["WED 83", "THU", "FRI", "SAT", "SUN", "MON", "TUE"], truck=5)}
      <div class="sp-legend" style="margin-top:12px"><span><i style="width:14px;height:8px;border-radius:2px;background:var(--accent);display:inline-block"></i>covered</span><span><i style="width:14px;height:8px;border-radius:2px;background:repeating-linear-gradient(135deg,var(--neg) 0 2px,transparent 2px 5px);display:inline-block"></i>dry</span><span>{ic("truck")}import lands</span></div>
    </div>
    <div class="sp-kv">
      <span>On hand</span><b>5,600</b>
      <span>Draw</span><b>1,740 a day</b><small>Canal Brewery 1,500 · 2 grocery shelves 240</small>
      <span>Runs dry</span><b class="{"neg" if st != "conf" else ""}">{"Sat ~14:00" if st != "conf" else "—"}</b>
      <span>Next import</span><b>Mon 08:00</b>
      <span>Arrived last week</span><b>8,400</b>
    </div>
  </div>
  <div class="sp-dec">
    <div class="sp-d">
      <span class="kind">Recurring setting</span>
      <h3>{ic("refresh")}Weekly order at 1 Pier</h3>
      <div class="sp-set"><span class="now">{now_val}</span><span class="arrow">→</span>
        <label class="sp-in"><input value="{proposed}" aria-label="Weekly order of Water, units a week"><span>a week</span></label>
        <button class="link" type="button">Reset to 18,740</button></div>
      <div class="sp-bar" aria-hidden="true"><i class="now" style="width:{bar_now}%"></i><i class="add" style="left:{bar_now}%;width:{max(0, 93.7 - bar_now)}%"></i>
        <i class="need" style="left:93.66%"><span class="lb">week needs 18,732</span></i><i class="cap" style="left:99.8%"></i></div>
      <div class="sp-legend" style="font-size:11.5px"><span>grey: now</span><span style="color:var(--accent)">green: added</span><span>cap 20,000 a week at 1 Pier</span></div>
      <div class="sp-where">{ic("pin")}<span>In the game: <b>BizMan › Purchasing agent › 1 Pier › Water › Amount</b>. Orders close Sun 20:00, in 3 d 10 h.</span></div>
    </div>
    <div class="sp-d">
      <span class="kind">One-time, by hand</span>
      <h3>{ic("hand")}Catch-up before Saturday</h3>
      <div class="sp-set"><span style="font:600 18px/1 'IBM Plex Mono',monospace">~3,050</span><span class="unit">units, bought once before Sat 14:00</span></div>
      <p style="font-size:12.5px;color:var(--ink-2);line-height:1.5">Bridges Sat 14:00 to Monday's truck at today's draw. An urgent import costs more (importer urgent fee ×0.75 on Normal) and counts against next Monday's cap at 1 Pier.</p>
      <div class="sp-where">{ic("pin")}<span>In the game: <b>BizMan › Purchasing agent › Urgent order</b>. The game link does not place urgent orders.</span></div>
      <div style="display:flex;gap:8px;margin-top:auto">{btn("Copy", "sm ghost", icon="copy")}{btn("Mark done by you", "sm ghost", icon="tick")}</div>
    </div>
  </div>
  <div class="sp-disc">
    <button type="button" data-open="why" aria-expanded="false">{ic("chevd")}Why 18,740 a week, and what Shop demand would say</button>
    <div data-pane="why" hidden>
      <div class="calc">
        <span>Canal Brewery, 4 Beer machines at rated output: 2,400 a day × 7</span><b>16,800</b>
        <span>Full production adds no margin on the factory part</span><b>+ 0</b>
        <span>2 grocery shelves: 240 a day × 7, plus 15%</span><b>+ 1,932</b>
        <span class="tot">The week, rounded up to the ten</span><b class="tot">18,740</b>
        <span style="color:var(--ink-3)">Plan for Shop demand instead: the brewery at 1,300 a day</span><b style="color:var(--ink-3)">11,040</b>
      </div>
    </div>
  </div>
</div>"""


def exec_panel(st: str = "sug") -> str:
    steps = {"sug": ("on", "dash", "dash", "dash"), "mine": ("done", "on", "dash", "dash"),
             "link": ("done", "dash", "link on", "dash"), "conf": ("done", "dash", "link", "done on")}[st]
    return f"""
<aside class="sp-exec">
  <div class="nx-box">
    <h4>{ic("list")}Where this change stands</h4>
    <div class="sp-steps">
      <div class="sp-step {steps[0]}"><b>Suggested</b>18,740 a week, Full production</div>
      <div class="sp-step {steps[1]}"><b>Marked done by you</b>A note in this browser, for manual play</div>
      <div class="sp-step {steps[2]}"><b>Applied through game link</b>The game took the amount</div>
      <div class="sp-step {steps[3]}"><b>Confirmed from refreshed data</b>A newer read shows the week covered</div>
    </div>
  </div>
  <div class="nx-box">
    <h4>{ic("hand")}Change it yourself</h4>
    <div style="display:flex;gap:8px">{btn("Copy change", "", icon="copy")}{btn("Mark done by you", "ghost", "ImportsMarked.dc.html", icon="tick")}</div>
    <div class="nx-copy" style="margin-top:10px;font-size:11px">Bridge Hub · 1 Pier · Water: weekly order 8,400 -> 18,740 a week (Full production)</div>
  </div>
  <div class="sp-or">OR</div>
  <div class="nx-box">
    <h4>{mw()}Let the game link set it</h4>
    <p style="font-size:12.5px;color:var(--ink-2);line-height:1.5">Writes the weekly amount only. You see what the game would do first; nothing changes until you apply.</p>
    <div style="margin-top:10px">{gwbtn("Preview in the game", "", "WritePreview.dc.html")}</div>
    <p class="quiet" style="margin-top:8px">Undo restores this contract until your next import change, in this city session.</p>
  </div>
</aside>"""


def other_lines() -> str:
    return f"""
<div class="sp-other">
  <div class="nx-band"><span class="lab">Other lines in scope</span><span class="n">Bridge Hub · 4</span><span class="quiet">3 covered lines folded · <button class="link" type="button">Show everything</button></span></div>
  <div class="sp-line">{ic("tank")}<span><b>Soda Can</b><small class="quiet" style="display:block">Smart Delivery at 1 Pier</small></span>
    <span class="quiet">Keeps the depot topped up to a stock level. The number is stock, not a week.</span>
    <span class="n">2,600 in stock<small>was 2,000 · level holds the week</small></span><span>{state("conf", "Confirmed · 09:40")}</span></div>
  <div class="sp-line">{ic("truck")}<span><b>Fabric (Cheap)</b><small class="quiet" style="display:block">Garment Depot · 7 Pier</small></span>
    <span class="quiet">Fixed weekly amount. 7 Pier allows 8,000 a week.</span>
    <span class="n">5,000 → 6,300 a week<small>the week takes 6,300</small></span><span>{state("sug")}</span></div>
</div>"""


def imports(st: str = "sug", arrived: bool = True) -> str:
    fs = from_strip("Water at Bridge Hub, import shortfall", "1 of 4 critical") if arrived else ""
    body = f"""
{fs}
{scope("Bridge Hub", '<a class="link" href="#">All depots and direct factory imports</a>')}
{basis("full", note=' <span style="color:var(--ink-3)">Shop demand would suggest 11,040 here.</span>')}
<div class="sp-grid">
  <div>{water_card(st=st)}{other_lines()}</div>
  {exec_panel(st)}
</div>"""
    return app("supply", "imports", "Imports", body, CRUMB("Imports"), source="live")


# --------------------------------------------------------------------------
# the write: preview, permission, applying, done, refused, changed, old mod
# --------------------------------------------------------------------------
def wire(kind: str) -> str:
    return (f'<span class="gw-w {kind}" aria-hidden="true"><i class="a"></i><i class="ln"></i><i class="p"></i><i class="p"></i><i class="p"></i>'
            f'<span class="g">{ic("game")}</span></span>')


def dlg(verdict_kind: str, verdict: str, meta: str, body: str, foot: str, title: str = "Set import amounts") -> str:
    return f"""
<div class="gw-dlg" role="dialog" aria-modal="true" aria-label="{title}">
  <div class="gw-head"><span class="gw-kind">{ic("truck")}</span><div><h2>{title}</h2><div class="gw-where">{hood("IC")}<span>Bridge Hub · 1 contract</span></div></div><button class="gw-x" type="button" aria-label="Close">{ic("x")}</button></div>
  <div class="gw-verdict" role="status">{wire(verdict_kind)}<span>{verdict}</span><span class="gw-meta">{meta}</span></div>
  <div class="gw-body">{body}</div>
  <div class="gw-foot">{foot}</div>
</div>"""


def mat(before: int, after: int, done: bool = False, over: bool = False) -> str:
    cap = 20000
    b, a = before / cap * 100, after / cap * 100
    ov_ = f'<i class="over" style="left:{a:.1f}%;width:{min(100, (after - cap) / cap * 100):.1f}%"></i>' if over else ""
    tickmark = f' {ic("tick", style="color:var(--accent);width:15px;height:15px")}' if done else ""
    return f"""
<div class="gw-mat">
  <div class="top">{ic("truck")}<b>Water</b><span class="quiet">a week</span><span class="num"><s>{before:,}</s><em>{after:,}</em>{tickmark}</span></div>
  <div class="gw-lvl"><i class="now" style="width:{b:.1f}%"></i><i class="add" style="left:{b:.1f}%;width:{max(0, min(a, 100) - b):.1f}%"></i>{ov_}<i class="cap" style="left:99.6%" data-l="cap 20,000"></i></div>
  <div class="meta"><span class="gw-pill"><b>1</b>1 Pier · delivers Mon</span><span>next delivery $15,930</span><span>$0.85 a unit</span></div>
</div>"""


def write_frame(which: str) -> str:
    over = which == "over"
    if which == "preview":
        d = dlg("ok", "<b>The game would take this.</b>", "orders close Sun 20:00<br>in 3 d 10 h",
                mat(8400, 18740) + '<p class="quiet">Only the amount changes. The contract keeps running, repeating each Monday.</p>',
                f'<span class="gw-hint">Nothing changes until you apply.</span><button class="gw-b ghost" type="button">Cancel</button><a class="gw-b go" href="WritePermission.dc.html">Apply 1 change</a>')
    elif which == "permission":
        d = dlg("wait", "<b>Waiting for you in the game.</b>", "first write from<br>this browser",
                f"""<div class="gw-scene"><div class="gw-pop"><b>Allow Big Copilot to change your game?</b>Chrome on Windows · bigcopilot.com<div class="bt"><span>Deny</span><span class="y">Allow</span></div></div><span class="gw-cursor" style="color:#fff">{ic("cursor")}</span></div>
<p style="font-size:12.5px;color:var(--ink-2);line-height:1.5">Switch to the game and choose <b style="color:var(--ink)">Allow</b>. The game asks once per browser and remembers it. You can forget browsers in the mod's options.</p>""",
                f'<span class="gw-hint">Asked 12 s ago · the game closes the popup after 60 s</span><a class="gw-b ghost" href="WritePreview.dc.html">Cancel</a><a class="gw-b go" href="WriteApplying.dc.html">Allowed in game</a>')
    elif which == "applying":
        d = dlg("busy", "<b>Applying in the game…</b>", "all together,<br>or not at all",
                mat(8400, 18740) + '<div class="gw-reread"><span>Reading the game again</span><span class="bar"></span></div>',
                '<span class="gw-hint">Keep the game running; this takes a few seconds.</span><button class="gw-b off" type="button" disabled>Apply 1 change</button>')
    elif which == "done":
        d = dlg("ok", "<b>Done in the game.</b> Big Copilot updated imports at Bridge Hub.", "read again<br>09:46",
                mat(8400, 18740, done=True) + '<div class="gw-reread done"><span>Board rebuilt from the game</span><span class="bar"></span></div>'
                + f'<div class="gw-no warn" style="background:var(--info-soft);border-color:color-mix(in srgb,var(--info) 40%,transparent)"><span class="rule" style="color:var(--info)">{ic("clock")}Applied, not yet proven</span><p>The amount is in the game now. The shortfall is marked confirmed only when a later read shows the week covered, after Monday\'s delivery.</p></div>'
                + f'<p class="quiet">Undo restores Water\'s amount, running state, Repeating and plan order at 1 Pier, <b style="color:var(--ink-2)">until your next import change</b>, in this city session.</p>',
                f'<button class="gw-b" type="button">{ic("back")}Undo</button><span style="margin-left:auto"></span><a class="gw-b ghost" href="ImportsApplied.dc.html">Close</a><a class="gw-b go" href="OverviewReturn.dc.html">{ic("back")}Back to Needs attention</a>')
    elif which == "lock":
        lock = "".join(f'<i class="{"x" if (h >= 20) else ""}{" now" if h == 21 else ""}"></i>' for h in range(24))
        d = dlg("no", "<b>The game refused.</b> Nothing was written.", "Sun 21:10",
                f"""<div class="gw-no"><span class="rule">{ic("lock")}Orders are locked until Monday 08:00</span>
<p>The game does not let a running contract change between Sunday 20:00 and Monday 08:00, while the delivery is being prepared.</p>
<div class="gw-lock" aria-label="Sunday, hours 0 to 24; 20 to 24 locked; now 21:10">{lock}</div>
<div class="sp-ax" style="margin-top:3px"><span>0</span><span></span><span></span><span></span><span></span><span></span><span>6</span><span></span><span></span><span></span><span></span><span></span><span>12</span><span></span><span></span><span></span><span></span><span></span><span>18</span><span></span><span>20</span><span></span><span></span><span></span></div>
<span class="fix">{ic("go")}Try again Monday after 08:00, or buy the catch-up by hand now</span></div>""",
                f'<span class="gw-hint">Your suggestion is kept. Nothing to undo.</span><button class="gw-b ghost" type="button">Close</button><button class="gw-b" type="button">{ic("copy")}Copy change</button>')
    elif which == "changed":
        d = dlg("moved", "<b>The game moved on.</b> Nothing was written.", "read 09:52",
                f"""<div class="gw-no warn"><span class="rule">{ic("refresh")}Water's amount is no longer 8,400</span>
<p>Someone set it to <b style="color:var(--ink)">12,000</b> in the game after this board read it. The board has read the game again and sized the change anew.</p>
<span class="fix">{ic("go")}Review the new suggestion: 12,000 → 18,740 a week</span></div>
{mat(12000, 18740)}""",
                f'<span class="gw-hint">A changed setting clears your old "Marked done" note.</span><button class="gw-b ghost" type="button">Cancel</button><button class="gw-b go" type="button">Preview again</button>')
    elif which == "old":
        d = dlg("no", "<b>This mod version reads only.</b>", "Big Copilot Link<br>0.1.4",
                f"""<div class="gw-no warn"><span class="rule">{ic("plug")}Writing needs Big Copilot Link 0.2.0 or later</span>
<p>Your game link reads fine. Update the mod from the Steam Workshop and restart the game to apply amounts from here.</p>
<span class="fix">{ic("ext")}Game link mod on the Steam Workshop</span></div>
<p class="quiet">Meanwhile, copy the change and set it in BizMan › Purchasing agent › 1 Pier.</p>""",
                f'<button class="gw-b ghost" type="button">Close</button><button class="gw-b go" type="button">{ic("copy")}Copy change</button>')
    else:  # over the cap
        d = dlg("no", "<b>The game would refuse 1 row.</b>", "dry run",
                mat(8400, 24000, over=True) + f"""<div class="gw-no"><span class="rule">{ic("warn")}Over 1 Pier's weekly cap</span>
<p>1 Pier allows 20,000 a week of Water, 0 of it ordered this week. 24,000 would not be delivered in full.</p><span class="fix">{ic("go")}Set 20,000 here and import the rest from 7 Pier</span></div>""",
                '<span class="gw-hint">Written all together, or not at all.</span><button class="gw-b ghost" type="button">Cancel</button><button class="gw-b off" type="button" disabled>Apply 1 change</button>')
    return imports() + f'<div class="sp-scrim"></div><div class="sp-dlgwrap">{d}</div>'


def overview_return() -> str:
    """Back on the Overview: same place in the list, the row keeps its state, nothing reorders."""
    states = {"imp": state("link", "Applied through game link · 09:46") + '<span class="alt" style="color:var(--info)">Confirmed after the next read shows the week covered</span>'}
    body = ov.kpis() + f'<section class="nx-att">{ov.att_head()}<div class="nx-attgrid"><div>{ov.queue(states=states)}</div>{ov.rail()}</div></section>' + ov.tasks_head() + ov.tasks()
    body = body.replace('<article class="nx-f crit" data-id="imp"', '<article class="nx-f crit held" data-id="imp" style="outline:2px solid var(--accent);outline-offset:-2px;border-radius:8px"', 1)
    note = (f'<div role="status" style="margin-top:14px;display:flex;align-items:center;gap:10px;font-size:12.5px;color:var(--ink-2)">{ic("back", style="color:var(--accent)")}'
            f'Back where you left: finding 1 of 4 critical. The list keeps its order until you leave the page.</div>')
    return ov.app("overview", "attention", "Overview", note + body)


def imports_confirmed() -> str:
    b = imports("conf", arrived=False)
    return b.replace('<div class="nx-scope">', f'<div role="status" style="margin-top:16px;display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:10px;background:var(--accent-soft);border:1px solid color-mix(in srgb,var(--accent) 35%,transparent);font-size:13px">{ic("tick", style="color:var(--accent)")}<span><b>Confirmed from refreshed data, day 84 00:10.</b> Monday\'s delivery brought 18,740; Bridge Hub now reaches next Monday with 2,100 spare. The finding has left Needs attention.</span></div><div class="nx-scope">', 1)


# --------------------------------------------------------------------------
# Supply › Production: current against planned hours, one staffing plan
# --------------------------------------------------------------------------
def machines(plan: str) -> str:
    cur = [range(24), range(24), range(6, 18), []]
    rows = ""
    for k, c in enumerate(cur):
        p = range(24) if plan == "full" else range(7, 20)
        planned = hours(set(), plan=set(p))
        cur_h = len(list(c))
        need = 24 if plan == "full" else 13
        delta = need - cur_h
        d = f'<span class="{"warnc" if delta > 0 else ("pos" if delta < 0 else "dim")}">{"+" if delta > 0 else ""}{delta} h</span>' if delta else '<span class="dim">matches</span>'
        rows += (f'<span class="m">Beer {k + 1}</span>{hours(c, gap=set(range(24)) - set(c) if not c else set())}{planned}'
                 f'<span class="d">{d}<small>{cur_h} → {need} h a day</small></span>')
    ax = "".join(f"<span>{h if h % 6 == 0 else ''}</span>" for h in range(24))
    return (f'<div class="sp-mach"><span class="hd">Machine</span><span class="hd">Staffed now (this week)</span><span class="hd">Planned · {"Full production" if plan == "full" else "Shop demand"}</span><span class="hd" style="text-align:right">Change</span>'
            f'{rows}<span></span><div class="sp-ax">{ax}</div><div class="sp-ax">{ax}</div><span></span></div>')


def staff_plan(plan: str) -> str:
    full = plan == "full"
    mh, need, hire, wage = ("672", "14", "hire 7", "+$1,620") if full else ("364", "8", "hire 1", "+$230")
    if full:
        shifts = "".join(f'<div class="sp-shift"><span class="m mono" style="font-size:12px;color:var(--ink-2)">Beer {k}</span><div class="row"><b style="left:0;width:49.5%">00–12 · 1 person</b><b style="left:50.5%;width:49.5%">12–24 · 1 person</b></div></div>'
                         for k in range(1, 5))
    else:
        shifts = "".join(f'<div class="sp-shift"><span class="m mono" style="font-size:12px;color:var(--ink-2)">Beer {k}</span><div class="row"><b style="left:29.2%;width:28.8%">07–14 · 1 person</b><b style="left:58.4%;width:24.6%">14–20 · 1 person</b></div></div>'
                         for k in range(1, 5))
    return f"""
<div class="sp-plan" id="staffplan">
  <div>
    <h3>{ic("staffing")}Factory staffing for this plan</h3>
    <div class="sp-tiles">
      <div><span class="lab">Machine-hours</span><span class="v">{mh}</span><small>a week</small></div>
      <div><span class="lab">Factory workers</span><span class="v">7 → {need}</span><small>people · {hire}</small></div>
      <div><span class="lab">Wages</span><span class="v {"warnc" if full else ""}">{wage}</span><small>a day, at today's rates</small></div>
      <div><span class="lab">Hours in a row</span><span class="v">12 h</span><small>at most, per person</small></div>
    </div>
    <div class="sp-shifts">{shifts}</div>
    <p class="quiet" style="margin-top:10px">A typical day: one person per machine per hour, at most 12 hours in a row.</p>
  </div>
  <div style="display:flex;flex-direction:column;gap:10px">
    <div class="sp-where">{ic("pin")}<span>In the game: <b>BizMan › Canal Brewery › Schedule</b>. The game link does not write factory hours or hire.</span></div>
    {btn("Copy the plan", "", icon="copy")}
    {btn("Mark done by you", "ghost", icon="tick")}
    <a class="link" href="{ROUTE["staffing/needs"]}" style="align-self:flex-start">See whom to hire in Staffing</a>
    
  </div>
</div>"""


def production(arrived: bool = True) -> str:
    fs = from_strip("Beer machine 4 at Canal Brewery, nobody staffed", "2 of 4 critical") if arrived else ""
    pane = lambda p: f"""
<div data-when-basis="{p}"{" hidden" if p != "full" else ""}>
  <div class="sp-out" style="margin-top:18px">
    <div><span class="lab">Staffed now · observation</span><span class="v">1,500</span><small>Beer a day · 60 machine-hours</small></div>
    <div class="{"sel" if p == "full" else ""}"><span class="lab">Full production</span><span class="v">2,400</span><small>rated · 4 machines × 25 an hour × 24</small></div>
    <div class="{"sel" if p == "demand" else ""}"><span class="lab">Shop demand</span><span class="v">1,300</span><small>shops sell 1,100 + 15%, rounded to whole hours</small></div>
  </div>
  <div class="nx-sechead" style="margin-top:24px"><h2>Beer line · hours a day</h2><span class="quiet">Bottled Goods Workstation × 4 · Produce up to: not set</span></div>
  {machines(p)}
  <div class="nx-sechead" style="margin-top:26px"><h2>What the plan eats</h2><span class="quiet">at the planned hours</span></div>
  <table class="nx-t"><thead><tr><th>Input</th><th class="n">Needs a day</th><th class="n">Top-up now</th><th class="n">On hand</th><th>Fix, where it is set</th></tr></thead><tbody>
    <tr class="sel"><td><b>Water</b><small>Beer × 4</small></td><td class="n">{"2,400" if p == "full" else "1,300"}</td><td class="n">1,200<small>from Bridge Hub</small></td><td class="n">900</td>
      <td>{"<a class='link' href='" + ROUTE["supply/deliveries"] + "'>Raise Bridge Hub's top-up to 2,400</a> · then <a class='link' href='" + ROUTE["supply/imports"] + "'>its import</a>" if p == "full" else "<a class='link' href='" + ROUTE["supply/deliveries"] + "'>Raise Bridge Hub's top-up to 1,300</a>"}</td></tr>
  </tbody></table>
  <div style="margin-top:26px">{staff_plan(p)}</div>
</div>"""
    body = f"""
{fs}
{scope().replace('Whole company', 'Canal Brewery').replace('class="nx-pick" type="button">' + ic("businesses"), 'class="nx-pick sel" type="button">' + ic("factory"), 1)}
{basis("full")}
{pane("full")}{pane("demand")}
<div class="nx-band" style="margin-top:30px"><span class="lab">Stitch Yard</span><span class="n">1 line the board cannot name</span></div>
<div class="sp-line" style="grid-template-columns:28px 190px minmax(0,1fr) 260px">{ic("factory")}<span><b>Unnamed line</b><small class="quiet" style="display:block">2 machines · Sewing Workstation</small></span>
  <span class="quiet">Draws Fabric (Cheap) and ships nothing yet. Name its recipe to plan its inputs.</span>
  <span style="display:flex;gap:8px;align-items:center"><span class="sp-pick">Clothing (Cheap)? {ic("chevd")}</span>{btn("Save", "sm")}</span></div>"""
    return app("supply", "production", "Production", body, CRUMB("Production"))


def production_none() -> str:
    body = f"""
{scope()}
<div class="sp-empty">
  <div class="pic"><span></span><u></u><span></span><u></u><span></span></div>
  <span class="nx-tag ex">no factories in this save</span>
  <h2>Factory running hours start once you run a factory</h2>
  <p>This view sizes each factory line's hours for full production or for what your shops sell, shows the inputs those hours eat, and plans the factory workers they need. Juniper &amp; Co runs 5 shops and no factory yet, so there is nothing to size.</p>
  <div style="display:flex;gap:10px">{btn("Plan a factory", "go", ROUTE["expansion/plan"], icon_end="go")}{btn("Factories in the Game guide", "ghost", ROUTE["guide"], icon="guide")}</div>
</div>"""
    return app("supply", "production", "Production", body, CRUMB("Production"), counts={"overview": ("1", "crit")}).replace("Marlow Trading", "Juniper &amp; Co")


# --------------------------------------------------------------------------
# phone: the import fix
# --------------------------------------------------------------------------
PH_SUP = """
.ph-from{display:flex;align-items:center;gap:8px;margin:12px 0 0;padding:8px;border-radius:10px;background:color-mix(in srgb,var(--accent) 9%,var(--surface));border:1px solid color-mix(in srgb,var(--accent) 30%,transparent);font-size:12px;color:var(--ink-2)}
.ph-from a{display:inline-flex;align-items:center;gap:5px;height:34px;padding:0 10px 0 7px;border-radius:17px;background:var(--accent);color:var(--on-accent);font-weight:600;white-space:nowrap}
.ph-from a .i{width:14px;height:14px}
.ph-crumb{display:flex;align-items:center;gap:6px;margin-top:14px;font-size:12px;color:var(--ink-3)}
.ph-crumb .i{width:12px;height:12px}
.ph-h1{font-size:22px;font-weight:700;letter-spacing:-.02em;margin-top:4px}
.ph-seg{display:flex;overflow:hidden;gap:2px;margin-top:10px;border:1px solid var(--rule);border-radius:9px;padding:2px;background:var(--surface)}
.ph-seg a{flex:none;padding:8px 10px;border-radius:7px;font-size:12px;font-weight:500;color:var(--ink-2);white-space:nowrap}
.ph-seg a.on{background:var(--ink);color:var(--ground)}
.ph-card{margin-top:12px;border:1px solid color-mix(in srgb,var(--accent) 35%,var(--rule));border-radius:14px;background:var(--surface);overflow:hidden}
.ph-card .hd{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--rule-soft);flex-wrap:wrap}
.ph-card .hd h2{font-size:16px;font-weight:600}
.ph-card .sec{padding:12px 14px;border-bottom:1px solid var(--rule-soft);display:flex;flex-direction:column;gap:9px}
.ph-card .sec:last-child{border-bottom:0}
.ph-card .nx-cov .d{height:18px}
.ph-basis{display:flex;flex-direction:column;gap:6px;margin-top:12px;font-size:12px;color:var(--ink-2)}
.ph-basis .seg{display:grid;grid-template-columns:1fr 1fr}
.ph-basis .seg button{justify-content:center;min-height:38px}
.ph-sheet{position:absolute;left:0;right:0;bottom:0;z-index:21;background:var(--surface);border-radius:18px 18px 0 0;border:1px solid var(--rule);border-bottom:0;box-shadow:0 -20px 50px -24px #000c;padding-bottom:18px}
.ph-sheet .grab{width:38px;height:4px;border-radius:2px;background:var(--rule);margin:8px auto 4px}
.ph-sheet .gw-dlg{width:100%;border:0;box-shadow:none;border-radius:0;background:transparent}
.ph-sheet .gw-foot{flex-wrap:wrap}
.ph-sheet .gw-b{flex:1;justify-content:center;height:44px}
.ph-sheet .gw-hint{flex-basis:100%}
"""


def phone_imports() -> str:
    body = f"""
<div class="ph-from"><a href="PhoneOverview.dc.html">{ic("back")}Needs attention</a><span>From <b style="color:var(--ink)">Water at Bridge Hub</b> · 1 of 4</span></div>
<div class="ph-crumb">Supply {ic("chev")} Imports</div>
<h1 class="ph-h1">Imports</h1>
<div class="ph-seg" role="tablist" aria-label="Supply views"><a href="{ROUTE["supply/changes"]}">Changes</a><a class="on" href="#">Imports</a><a href="#">Deliveries</a><a href="#">Production</a><a href="#">Goods flow</a></div>
<div class="ph-basis"><span class="lab">Plan for</span><div class="seg"><button class="on" type="button">Full production</button><button type="button">Shop demand</button></div><span>Every factory line at rated output, round the clock.</span></div>
<div class="ph-card">
  <div class="hd">{hood("IC")}<h2>Water · Bridge Hub</h2>{chip("bad", "short")}<span class="quiet" style="flex-basis:100%;display:flex;gap:6px;align-items:center">{ic("truck")}Fixed weekly amount · 1 Pier · Mondays</span></div>
  <div class="sec"><span class="lab" style="margin-bottom:18px">Cover, next 7 days</span>{cover(["", "", "", "half", "dry", "", ""], ["W", "T", "F", "S", "S", "M", "T"], truck=5)}
    <div class="sp-kv" style="margin-top:6px"><span>On hand</span><b>5,600</b><span>Draw</span><b>1,740 a day</b><span>Runs dry</span><b class="neg">Sat ~14:00</b></div></div>
  <div class="sec"><span class="lab">Recurring · weekly order at 1 Pier</span>
    <div class="sp-set"><span class="now">8,400</span><span class="arrow">→</span><label class="sp-in"><input value="18,740" aria-label="Weekly order, units a week"><span>a week</span></label></div>
    <div class="sp-where">{ic("pin")}<span><b>BizMan › Purchasing agent › 1 Pier › Water</b></span></div>
    <button class="link" type="button" style="align-self:flex-start">Why 18,740</button></div>
  <div class="sec"><span class="lab">One-time · by hand</span><span style="font-size:13px">Buy <b class="mono">~3,050</b> before Sat 14:00 as an urgent order. Not written by the game link.</span></div>
  <div class="sec">
    <div style="display:flex;gap:8px">{btn("Copy", "lg", icon="copy")}{btn("Mark done by you", "lg ghost", "#", icon="tick")}</div>
    {gwbtn("Preview in the game", "", "PhoneWrite.dc.html").replace('class="gw-btn "', 'class="gw-btn " style="height:44px;justify-content:center"')}
    <span class="quiet">{state("sug")} · undo lasts until your next import change</span>
  </div>
</div>"""
    return ov.phone_shell("supply", body)


def phone_write() -> str:
    d = dlg("ok", "<b>The game would take this.</b>", "closes Sun 20:00",
            mat(8400, 18740), '<span class="gw-hint">Nothing changes until you apply.</span><button class="gw-b ghost" type="button">Cancel</button><a class="gw-b go" href="#">Apply 1 change</a>')
    return phone_imports() + f'<div class="sp-scrim"></div><div class="ph-sheet" role="dialog" aria-label="Set import amounts"><div class="grab"></div>{d}</div>'


BOARDS = [
    ("Changes.dc.html", "Supply › Changes · the company-wide checklist", changes, 1440, 1240, "supply", 0, True, False, SUP_CSS),
    ("Imports.dc.html", "Supply › Imports · arrived from Needs attention", imports, 1440, 1200, "supply", 0, True, False, SUP_CSS),
    ("WritePreview.dc.html", "Write 1 · preview (dry run agrees)", lambda: write_frame("preview"), 1440, 900, "supply", 0, True, False, SUP_CSS),
    ("WritePermission.dc.html", "Write 2 · waiting for permission in the game", lambda: write_frame("permission"), 1440, 900, "supply", 0, True, False, SUP_CSS),
    ("WriteApplying.dc.html", "Write 3 · applying, reading again", lambda: write_frame("applying"), 1440, 900, "supply", 0, True, False, SUP_CSS),
    ("WriteDone.dc.html", "Write 4 · done, the undo scope", lambda: write_frame("done"), 1440, 900, "supply", 0, True, False, SUP_CSS),
    ("OverviewReturn.dc.html", "Back to Needs attention · position and state kept", overview_return, 1440, 900, "supply", 0, True, False, ""),
    ("ImportsApplied.dc.html", "Imports · applied, waiting for confirmation", lambda: imports("link", arrived=True), 1440, 1200, "supply", 1, True, False, SUP_CSS),
    ("ImportsMarked.dc.html", "Imports · manual path, marked done by you", lambda: imports("mine", arrived=True), 1440, 1200, "supply", 1, True, False, SUP_CSS),
    ("ImportsConfirmed.dc.html", "Imports · confirmed from refreshed data", imports_confirmed, 1440, 1240, "supply", 1, False, False, SUP_CSS),
    ("WriteRefused.dc.html", "Write · refused, lock window", lambda: write_frame("lock"), 1440, 900, "supply", 1, True, False, SUP_CSS),
    ("WriteOverCap.dc.html", "Write · a row over the supplier cap", lambda: write_frame("over"), 1440, 900, "supply", 1, True, False, SUP_CSS),
    ("WriteChanged.dc.html", "Write · conditions changed in the game", lambda: write_frame("changed"), 1440, 900, "supply", 1, True, False, SUP_CSS),
    ("WriteOldMod.dc.html", "Write · older mod, reads only", lambda: write_frame("old"), 1440, 900, "supply", 1, False, False, SUP_CSS),
    ("Production.dc.html", "Supply › Production · hours, basis, inputs, staffing plan", production, 1440, 1340, "supply", 2, True, False, SUP_CSS),
    ("ProductionNone.dc.html", "Supply › Production · no factories yet", production_none, 1440, 900, "supply", 2, False, False, SUP_CSS),
    ("PhoneImports.dc.html", "Imports · phone, dark", phone_imports, 390, 1100, "supply", 2, True, False, ov.PHONE + SUP_CSS + PH_SUP),
    ("PhoneImportsLight.dc.html", "Imports · phone, light", phone_imports, 390, 1100, "supply", 2, False, False, ov.PHONE + SUP_CSS + PH_SUP),
    ("PhoneWrite.dc.html", "Imports · phone, the write as a sheet", phone_write, 390, 1100, "supply", 2, True, False, ov.PHONE + SUP_CSS + PH_SUP),
]

ROW_TITLES = {
    ("supply", 0): "The import fix: notice › understand › review › apply › check › return",
    ("supply", 1): "Other outcomes: applied, manual, confirmed, refused, over cap, moved on, old mod",
    ("supply", 2): "Production and the phone journey",
}
NOTES = {
    "n-journey": ("supply", 0, 0, "Play from Overview (Main): Review import amount → Imports → Preview in the game → Apply → Allowed in game → Done → Back to Needs attention. The manual path is 'Mark done by you' on Imports."),
    "n-states": ("supply", 1, 0, "Four marks, never merged: Suggested (dashed), Marked done by you (your note), Applied through game link (blue), Confirmed from refreshed data (green). Only a newer read can confirm."),
    "n-prod": ("supply", 2, 0, "Production owns factory hours and the workers they need. Toggle 'Plan for' to see Full production against Shop demand change hours, inputs, hires and wages. Staffing links here; there is no second planner."),
}
