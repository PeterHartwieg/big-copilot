"""Generate the Find a location mockup as Claude Design artboards.

Builds on mockup/map-revamp/build_map_canvas.py (which itself builds on the board canvas)
so the finder reads as a mode of the shipped map page. Data comes from data.json, made by
make_data.py from the HART. YT save. Run, then seed with the design helper.
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "map-revamp"))
import build_map_canvas as bm  # noqa: E402

bc = bm.bc
F = json.load(open(os.path.join(HERE, "data.json"), encoding="utf-8"))
bc.ICON["pin"] = '<svg viewBox="0 0 24 24"><path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"></path><circle cx="12" cy="10" r="2.2"></circle></svg>'

HOODS = ["Garment District", "Hell's Kitchen", "Industry City", "Lower Manhattan", "Midtown", "Murray Hill", "The Hamptons"]
TAG = {"Garment District": "GD", "Hell's Kitchen": "HK", "Industry City": "IC", "Lower Manhattan": "LM", "Midtown": "MT", "Murray Hill": "MH", "The Hamptons": "HA"}
CATS = [("retail", "Retail"), ("office", "Office"), ("warehouse", "Warehouse"), ("cinema", "Cinema"), ("theater", "Theater")]

CSS = r"""
/* find a location: a mode of the map page ---------------------------------- */
.sev.fc i{background:var(--accent)}
.sev.fc.off{opacity:.35}.sev.fc.off:hover{opacity:.6}
.sev.fc.tog{border-color:var(--rule);gap:7px}
.sev.fc.tog svg{width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.sev.fc.tog.on{background:var(--accent-soft);color:var(--ink)}
.sev.fc .n{margin-left:2px;color:var(--ink-3);font-weight:400}
.sev.fc.buy i{background:var(--warn)}
.sev.fc.hd{padding:5px 8px;letter-spacing:.08em}.sev.fc.hd i{display:none}
.frow{display:flex;align-items:center;gap:6px;margin:-2px 0 10px}
.frow .sp{flex:1}
.frow .lab{font:500 10px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3);margin-right:4px}
.srch.mini{width:auto;gap:6px;color:var(--ink-3);font-family:"IBM Plex Mono",monospace;font-size:11px;height:30px}
.srch.mini:focus-within{width:auto}
.srch.mini input{width:34px;text-align:right;font-family:"IBM Plex Mono",monospace;font-size:12px}
.srch.sel{width:auto;padding-right:6px}.srch.sel:focus-within{width:auto}
.srch.sel select{border:0;background:none;color:var(--ink);font:inherit;font-size:13px;outline:none;cursor:pointer}
.fnote{margin:0 0 10px;font-size:12px;color:var(--ink-3)}
.fnote b{color:var(--ink-2);font-weight:500}
.citymap.finder .places{width:440px}
.stage.finder .zoomer{right:472px}
.fhead{display:grid;grid-template-columns:22px 26px 1fr 46px 46px 46px 58px;gap:0 8px;padding:10px 12px 8px 8px;border-bottom:1px solid var(--rule-soft);font:500 9.5px/1 "IBM Plex Mono",monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3)}
.fhead span{cursor:pointer;text-align:right;white-space:nowrap}
.fhead span:nth-child(-n+3){text-align:left;cursor:default}
.fhead span.on{color:var(--ink)}
.fhead span.on::after{content:" ↓";color:var(--accent)}
.fhead.sale{grid-template-columns:26px 1fr 70px 52px 76px}
.place.fr{grid-template-columns:22px 26px 1fr 46px 46px 46px 58px}
.place.fr .rk{font:500 11px/1 "IBM Plex Mono",monospace;color:var(--ink-3);text-align:right}
.place.fr .v{font-family:"IBM Plex Mono",monospace;font-size:12px;text-align:right;color:var(--ink-2);white-space:nowrap}
.place.fr .v.sc{color:var(--ink);font-weight:500}
.place.fr.sale{grid-template-columns:26px 1fr 70px 52px 76px}
.place.fr.sale .v.t{text-align:left;font-family:inherit;font-size:11.5px;color:var(--ink-3)}
.fp.cand{fill:#43c07a;fill-opacity:.2;stroke:#65e99b;stroke-width:1.2;vector-effect:non-scaling-stroke}
.fp.cand.buy{fill:#e0b84a;fill-opacity:.18;stroke:#f2cf6b}
.stage.finder .fp.mine{fill-opacity:.1;stroke-opacity:.45}
.stage.finder .fp.dim.mine{fill-opacity:.06}
.site .st{display:inline-flex;align-items:center;gap:5px;font-family:"IBM Plex Mono",monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3);margin-top:8px}
.site .st i{width:7px;height:7px;border-radius:50%;background:var(--accent)}
.site .st.rival i{background:var(--warn)}.site .st.na i{background:var(--rule)}.site .st.mine i{background:var(--accent)}
.site .facts{display:grid;grid-template-columns:1fr 1fr;gap:5px 14px;margin-top:10px;font-size:11.5px;color:var(--ink-3)}
.site .facts b{font-family:"IBM Plex Mono",monospace;font-weight:500;color:var(--ink);float:right}
.site .fit{margin-top:8px;font-size:12px;color:var(--ink-2)}
.site .fit b{color:var(--ink);font-weight:500}
.site .nums .num b.sc{color:var(--accent)}
.cell.picked{outline:2px solid var(--accent);outline-offset:-2px}
.celldetail .link.pin{display:inline-flex;align-items:center;gap:5px;margin-left:10px}
.celldetail .link.pin svg{width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.move .soon.live{border-style:solid;color:var(--accent);border-color:var(--accent-soft);background:var(--accent-soft)}
"""

# the finder's own script: spliced into the map closure so it shares select(), paths and the card
FINDER_JS = r"""
      // ---- find a location: a mode of this map -----------------------------------
      const F = FINDER, CAT_T = { retail: 'retail', office: 'office', warehouse: 'warehouse', cinema: 'cinema', theater: 'theater' };
      let finder = city.dataset.finder === '1' || city.dataset.finder === 'sale';
      const fs = { cat: city.dataset.cat || 'retail', type: city.dataset.type || '', vac: true, buy: city.dataset.buy === '1', hoods: new Set(F.hoods), minCap: 0, minTraffic: 0, sort: 'score', dir: -1, view: city.dataset.finder === 'sale' ? 'sale' : 'rank' };
      F.buildings.forEach(b => { if (!byKey[b.key]) byKey[b.key] = { key: b.key, address: b.address, hood: b.hood, code: b.code, bounds: b.bounds, alerts: [], cand: true }; byKey[b.key].bld = b; });
      const fmt = (v) => '$' + Math.round(v).toLocaleString('en-US');
      const capText = (c) => c == null ? '—' : Array.isArray(c) ? c[0] + '–' + c[1] : String(c);
      const demandFor = (hood, cat, slug) => { const list = (F.demand[hood] || []).filter(d => d.category === cat); if (slug) return list.find(d => d.slug === slug) || null;
        return list.reduce((best, d) => !best || d.demand > best.demand ? d : best, null); };
      const rivalsOf = (hood, slug) => F.buildings.filter(b => b.hood === hood && b.status === 'rival' && b.occupant && b.occupant.typeSlug === slug).length;
      const mineOf = (hood, slug) => F.buildings.filter(b => b.hood === hood && b.status === 'mine' && b.occupant && b.occupant.typeSlug === slug).length;
      const rankRows = () => {
        const t = CAT_T[fs.cat]; const out = [];
        F.buildings.forEach(b => {
          if (b.type !== t) return;
          if (!((fs.vac && b.status === 'vacant') || (fs.buy && b.status === 'rival'))) return;
          if (!fs.hoods.has(b.hood)) return;
          if (b.traffic < fs.minTraffic) return;
          const capN = Array.isArray(b.cap) ? b.cap[1] : b.cap; if (fs.minCap && (capN == null || capN < fs.minCap)) return;
          const r = byKey[b.key]; if (!r) return;
          const d = fs.cat === 'warehouse' ? null : demandFor(b.hood, fs.cat, fs.type);
          r.f = { demand: d ? d.demand : null, fit: d ? d.type : null, slug: d ? d.slug : null, score: d ? Math.round(b.traffic * d.demand / 100) : null,
            rivals: d ? rivalsOf(b.hood, d.slug) : null, mine: d ? mineOf(b.hood, d.slug) : null };
          out.push(r);
        });
        const k = fs.sort, get = (r) => k === 'score' ? (r.f.score ?? -1) : k === 'traffic' ? r.bld.traffic : k === 'demand' ? (r.f.demand ?? -1) : k === 'rent' ? (r.bld.rent ?? -1) : k === 'm2' ? r.bld.m2 : 0;
        out.sort((a, b) => (get(b) - get(a)) * -fs.dir || b.bld.traffic - a.bld.traffic);
        return out;
      };
      const HEAD = fs.cat === 'warehouse' ? [['', '#'], ['', ''], ['', 'Address'], ['m2', 'm²'], ['traffic', 'Traffic'], ['', ''], ['rent', 'Rent']]
                                          : [['', '#'], ['', ''], ['', 'Address'], ['score', 'Score'], ['traffic', 'Traffic'], ['demand', 'Demand'], ['rent', 'Rent']];
      const finderList = (rows) => {
        const head = '<div class="fhead">' + HEAD.map(h => '<span' + (h[0] ? ' data-s="' + h[0] + '"' : '') + (h[0] === fs.sort ? ' class="on"' : '') + '>' + h[1] + '</span>').join('') + '</div>';
        return head + rows.map((r, i) => { const b = r.bld, f = r.f; const wh = fs.cat === 'warehouse';
          const sub = (b.status === 'rival' && b.occupant ? b.occupant.name + ' · ' + b.occupant.type : (f.fit && !fs.type ? 'best fit: ' + f.fit : b.m2 + ' m² · cap ' + capText(b.cap))) + (f.rivals != null ? ' · ' + f.rivals + ' rival' + (f.rivals === 1 ? '' : 's') : '');
          return '<div class="place fr' + (r.key === selected ? ' on' : '') + '" data-k="' + r.key + '"><span class="rk">' + (i + 1) + '</span><span class="hood">' + b.code + '</span>' +
            '<span class="nm">' + b.address + '<small>' + sub + '</small></span>' +
            (wh ? '<span class="v">' + b.m2 + '</span><span class="v">' + b.traffic + '</span><span class="v"></span>' : '<span class="v sc">' + (f.score ?? '—') + '</span><span class="v">' + b.traffic + '</span><span class="v">' + (f.demand ?? '—') + '</span>') +
            '<span class="v">' + (b.rent != null ? fmt(b.rent) : '—') + '</span></div>'; }).join('') + (rows.length ? '' : '<div class="empty">Nothing matches.</div>');
      };
      const saleRows = () => F.forSale.filter(s => fs.hoods.has(s.hood)).sort((a, b) => a.price - b.price);
      const saleList = (rows) => '<div class="fhead sale"><span></span><span>Address</span><span>Type</span><span>m²</span><span class="on">Price</span></div>' +
        rows.slice(0, 120).map(s => '<div class="place fr sale" data-k="' + s.key + '"><span class="hood">' + s.code + '</span><span class="nm">' + s.address + '<small>' + s.hood + '</small></span><span class="v t">' + s.type + '</span><span class="v">' + s.m2.toLocaleString('en-US') + '</span><span class="v">' + (s.price >= 1e6 ? '$' + (s.price / 1e6).toFixed(1) + 'M' : fmt(s.price)) + '</span></div>').join('') +
        (rows.length > 120 ? '<div class="more">+' + (rows.length - 120) + '</div>' : '');
      const paintFacts = (r) => {
        const b = r.bld, st = $('.st', card), facts = $('.facts', card), fit = $('.fit', card);
        if (!b) { st.style.display = facts.style.display = fit.style.display = 'none'; return; }
        st.style.display = facts.style.display = '';
        const cls = b.status === 'rival' ? 'rival' : b.status === 'unavailable' ? 'na' : b.status;
        st.className = 'st ' + cls;
        st.innerHTML = '<i></i>' + (b.status === 'vacant' ? 'Vacant · for rent' : b.status === 'rival' ? 'Rival: ' + b.occupant.name + ' · ' + b.occupant.type : b.status === 'mine' ? 'Yours' : b.type === 'residential' ? 'Residential' : 'Not for rent');
        const tname = b.type.charAt(0).toUpperCase() + b.type.slice(1);
        facts.innerHTML = '<span>' + tname + ' ' + b.size + '<b>' + b.m2.toLocaleString('en-US') + ' m²</b></span>' +
          '<span>Foot traffic<b>' + b.traffic + '</b></span>' +
          '<span>Door cap<b>' + capText(b.cap) + '</b></span>' +
          '<span>Est. rent<b>' + (b.rent != null ? fmt(b.rent) + '/d' : '—') + '</b></span>';
        if (finder && r.f && fs.view === 'rank') { const f = r.f;
          fit.style.display = ''; fit.innerHTML = f.fit ? ('<b>' + f.fit + '</b> · demand ' + f.demand + ' · ' + f.rivals + ' rival' + (f.rivals === 1 ? '' : 's') + (f.mine ? ' · ' + f.mine + ' of yours' : '') + ' in ' + b.hood) : 'No demand reading for this category here.';
          $('.nums', card).innerHTML = f.score != null ? '<div class="num"><b class="sc">' + f.score + '</b><span>score</span></div><div class="num"><b>' + b.traffic + '</b><span>traffic</span></div><div class="num"><b>' + f.demand + '</b><span>demand</span></div>' : '<div class="num"><b>' + b.m2.toLocaleString('en-US') + '</b><span>m²</span></div><div class="num"><b>' + b.traffic + '</b><span>traffic</span></div>';
        } else { fit.style.display = 'none'; if (r.cand) $('.nums', card).innerHTML = '<div class="num"><b>' + b.traffic + '</b><span>traffic</span></div><div class="num"><b>' + (b.rent != null ? fmt(b.rent) : '—') + '</b><span>est. rent / day</span></div><div class="num"><b>' + capText(b.cap) + '</b><span>door cap</span></div>'; }
      };
      const wireFinder = () => {
        const hd = $('.sechead', city.parentElement) || document;
        $$('.seg.cat a').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); $$('.seg.cat a').forEach(x => x.classList.remove('on')); a.classList.add('on'); fs.cat = a.dataset.cat; fs.type = ''; const sel = $('select.ftype'); if (sel) { fillTypes(); } render(); }));
        const fillTypes = () => { const sel = $('select.ftype'); if (!sel) return; const seen = {}; Object.values(F.demand).flat().filter(d => d.category === fs.cat).forEach(d => seen[d.slug] = d.type);
          sel.innerHTML = '<option value="">Any type</option>' + Object.keys(seen).sort((a, b) => seen[a].localeCompare(seen[b])).map(s => '<option value="' + s + '"' + (s === fs.type ? ' selected' : '') + '>' + seen[s] + '</option>').join(''); };
        fillTypes();
        const sel = $('select.ftype'); if (sel) sel.addEventListener('change', () => { fs.type = sel.value; render(); });
        $$('.sev.fc.av').forEach(a => a.addEventListener('click', () => { fs[a.dataset.av] = !fs[a.dataset.av]; a.classList.toggle('off', !fs[a.dataset.av]); render(); }));
        $$('.sev.fc.hd').forEach(a => a.addEventListener('click', () => { const h = a.dataset.h; if (fs.hoods.has(h)) fs.hoods.delete(h); else fs.hoods.add(h); a.classList.toggle('off', !fs.hoods.has(h)); render(); }));
        $$('.srch.mini input').forEach(i => i.addEventListener('input', () => { fs[i.dataset.f] = +i.value || 0; render(); }));
        const sale = $('.sev.fc.sale'); if (sale) sale.addEventListener('click', () => { fs.view = fs.view === 'sale' ? 'rank' : 'sale'; sale.classList.toggle('on', fs.view === 'sale'); render(); });
        list && list.addEventListener('click', (e) => { const s = e.target.closest('.fhead span[data-s]'); if (!s) return; if (fs.sort === s.dataset.s) fs.dir = -fs.dir; else { fs.sort = s.dataset.s; fs.dir = -1; } render(); });
        const tog = $('.sev.fc.tog'); if (tog) tog.addEventListener('click', () => { finder = !finder; tog.classList.toggle('on', finder); tog.classList.toggle('off', !finder); $$('.fonly').forEach(el => el.style.display = finder ? '' : 'none'); $$('.moff').forEach(el => el.style.display = finder ? 'none' : ''); deselect(); render(); });
      };
"""


def hood_chips() -> str:
    return "".join(f'<span class="sev fc hd" data-h="{h}" data-tip="{h}"><i></i>{TAG[h]}</span>' for h in HOODS)


def finder_head(on: bool, cat: str = "retail", buy: bool = False) -> str:
    n_vac = sum(1 for b in F["buildings"] if b["status"] == "vacant" and b["type"] == bm.CAT_T.get(cat, cat) if False) or sum(1 for b in F["buildings"] if b["status"] == "vacant" and b["type"] == cat)
    n_buy = sum(1 for b in F["buildings"] if b["status"] == "rival" and b["type"] == cat)
    n_sale = len(F["forSale"])
    tog = (f'<span class="sev fc tog {"on" if on else "off"}" data-tip="{"Find a location is on: the list ranks available premises. Click to go back to the plain map." if on else "Find a location: rank available premises by demand and foot traffic. Click to switch it on."}">{bc.ICON["pin"]}Find a location</span>')
    seg = '<span class="seg cat fonly">' + "".join(f'<a class="{"on" if c == cat else ""}" href="#" data-cat="{c}">{l}</a>' for c, l in CATS) + "</span>"
    typesel = '<label class="srch sel fonly"><select class="ftype"><option value="">Any type</option></select></label>'
    avail = (f'<span class="layers fonly"><span class="sev fc av" data-av="vac" data-tip="Vacant units the save marks as available for rent: {n_vac} of this kind."><i></i>vacant<b class="n">{n_vac}</b></span>'
             f'<span class="sev fc av buy{"" if buy else " off"}" data-av="buy" data-tip="Buildings a rival business occupies: {n_buy}. You can make a takeover offer in-game; the price is not in the save."><i></i>buy-out<b class="n">{n_buy}</b></span></span>')
    why = ('<span class="why fonly" data-tip="Score = foot traffic × the neighbourhood\'s demand for the type ÷ 100. Both numbers are the game\'s own. Rent, rivals and capacity are shown but do not change the score; click any column to sort by it instead. Any type: each row takes the neighbourhood\'s strongest type. Est. rent is fitted to observed leases and matched yours within 1%.">?</span>')
    n_mine = sum(1 for b in F["buildings"] if b["status"] == "mine")
    off_chips = (f'<span class="layers moff"><span class="sev lay mine" data-l="mine" data-tip="Your businesses: {n_mine} sites."><i></i>{n_mine}</span>'
                 f'<span class="sev lay own" data-l="own" data-tip="Buildings you own."><i></i>0</span>'
                 f'<span class="sev lay fnd" data-l="fnd" data-tip="Sites with a finding from Today."><i></i>0</span>'
                 f'<span class="sev lay all off" data-l="all" data-tip="Every address in the city, as faint outlines."><i></i>885</span></span>'
                 '<span class="why moff" data-tip="The dots are layers. Pick a place from the list or on the map and its card opens beside the building. Any address now shows its size, door cap, traffic, availability and estimated rent.">?</span>'
                 f'<span class="aside moff"><label class="srch">{bc.ICON["search"]}<input type="text" placeholder="Search"><span class="cnt mono"></span></label></span>')
    row2 = (f'<div class="frow fonly"><span class="lab">Where</span>{hood_chips()}'
            f'<span class="lab" style="margin-left:10px">Min</span><label class="srch mini">cap<input data-f="minCap" value="0"></label><label class="srch mini">traffic<input data-f="minTraffic" value="0"></label>'
            f'<span class="sp"></span><span class="sev fc sale off" data-tip="Whole buildings the game offers for sale: {n_sale}. A plain list with the asking price; buying is an investment, not an opening, so it is not scored.">for sale<b class="n">{n_sale}</b></span></div>'
            '<p class="fnote fonly">Ranked by <b>neighbourhood demand</b> and <b>foot traffic</b>, not by profit. Score = traffic × type demand ÷ 100.</p>')
    hide = "" if on else ' style="display:none"'
    return (f'\n<div class="sechead rv" style="margin-top:28px">{tog}{seg}{typesel}{avail}{why}{off_chips}</div>'
            + row2.replace('class="frow fonly"', f'class="frow fonly"{hide}').replace('class="fnote fonly"', f'class="fnote fonly"{hide}'))


def hart_rows() -> list:
    rows = []
    for b in F["buildings"]:
        if b["status"] != "mine" or not b["bounds"]:
            continue
        occ = b["occupant"] or {}
        rows.append({"key": b["key"], "name": occ.get("name") or "", "code": b["code"], "hood": b["hood"], "type": occ.get("type") or "", "status": "retail" if occ else "vacant",
                     "address": b["address"], "profit": 0, "rent": b["rent"] or 0, "staff": 0, "bounds": b["bounds"], "alerts": []})
    return rows


def finder_page(*, finder: str = "1", cat: str = "retail", buy: bool = False, start: str = "", type_slug: str = "") -> str:
    html = bm.map_markup(start=start)
    html = re.sub(r'\n<div class="sechead rv" style="margin-top:28px">.*?</div>(?=\n<div class="citymap)', lambda m: finder_head(finder != "0", cat, buy), html, count=1, flags=re.S)
    html = html.replace('<div class="citymap rv float" data-start="', f'<div class="citymap rv float" data-finder="{finder}" data-cat="{cat}" data-buy="{"1" if buy else "0"}" data-type="{type_slug}" data-start="', 1)
    html = html.replace('<div class="finds2"></div>', '<div class="st"></div><div class="facts"></div><div class="fit"></div><div class="finds2"></div>', 1)
    if finder == "sale":
        html = html.replace('class="sev fc sale off"', 'class="sev fc sale on"', 1)
    if finder != "0":
        html = html.replace('<div class="stage panel">', '<div class="stage panel finder">', 1).replace('<div class="citymap rv float"', '<div class="citymap rv float finder"', 1)
        html = html.replace('class="layers moff"', 'class="layers moff" style="display:none"').replace('class="why moff"', 'class="why moff" style="display:none"').replace('class="aside moff"', 'class="aside moff" style="display:none"')
    else:
        for c in ("seg cat fonly", "srch sel fonly", "layers fonly", "why fonly"):
            html = html.replace(f'class="{c}"', f'class="{c}" style="display:none"')
    return bc.shell("map", html)


def today_card() -> str:
    page = bc.today()
    vac = [b for b in F["buildings"] if b["status"] == "vacant" and b["type"] == "retail"]
    best = max(vac, key=lambda b: b["traffic"])
    old = re.search(r'<a class="move rv" href="#"><span class="soon">SOON</span><span class="ic">.*?</span><b>Find a location</b><span>.*?</span></a>', page, re.S).group(0)
    new = (f'<a class="move rv" href="#map"><span class="soon live">{len(vac)} VACANT</span><span class="ic">{bc.ICON["pin"]}</span><b>Find a location</b>'
           f'<span>{len(vac)} vacant retail units right now. Best foot traffic: {best["address"]}, {best["hood"]} ({best["traffic"]}).</span></a>')
    return page.replace(old, new, 1)


def growth_cell() -> str:
    page = bc.growth()
    page = page.replace('data-r="6" data-c="1"', 'data-r="6" data-c="1" class="picked"', 1) if 'data-r="6" data-c="1"' in page else page
    page = re.sub(r'<div class="cell (mine )?" data-r="6" data-c="1"', lambda m: f'<div class="cell {m.group(1) or ""}picked" data-r="6" data-c="1"', page, count=1)
    detail = ('<p class="celldetail" id="cellDetail"><b>Coffee Shop in Hell\'s Kitchen</b> · average demand 58, 3 rivals'
              f' <a class="link pin" href="#map">{bc.ICON["pin"]}find premises</a><a class="link" href="#" style="margin-left:10px">open in Plan a chain</a></p>')
    return page.replace('<p class="celldetail" id="cellDetail">Click a cell</p>', detail, 1)


def main() -> None:
    bm.CAT_T = {c: c for c, _ in CATS}
    bm.DATA["rows"] = hart_rows()
    bm.DATA["owned"] = []
    bc.CSS = bc.CSS + bm.CSS + CSS
    tail = bc.SCRIPT.rstrip()
    assert tail.endswith("}\n}"), "unexpected script shape"
    body = tail[:-1].rstrip()[:-1]
    script = bm.SCRIPT
    # splice the finder into the map closure
    anchor = "const money = (v) => (v < 0 ? '−' : '+') + '$' + Math.abs(Math.round(v)).toLocaleString('en-US');"
    assert anchor in script
    script = script.replace(anchor, anchor + FINDER_JS, 1)
    reps = [
        ("const room = () => stage.classList.contains('panel') ? 316 : 0;", "const room = () => stage.classList.contains('panel') ? (stage.classList.contains('finder') ? 456 : 316) : 0;"),
        ("const visibleRows = () => {", "const visibleRows = () => {\n        if (finder) return fs.view === 'sale' ? [] : rankRows();"),
        ("const shown = rows.slice(0, 80);", "if (finder) { stage.classList.add('finder'); city.classList.add('finder'); Object.keys(paths).forEach(k => { const b = byKey[k] && byKey[k].bld; paths[k].classList.toggle('cand', keys.has(k)); paths[k].classList.toggle('buy', keys.has(k) && !!b && b.status === 'rival'); paths[k].classList.toggle('dim', !keys.has(k) && k !== selected); });\n          list.innerHTML = fs.view === 'sale' ? saleList(saleRows()) : finderList(rows); return; }\n        stage.classList.remove('finder'); city.classList.remove('finder'); Object.keys(paths).forEach(k => paths[k].classList.remove('cand', 'buy'));\n        const shown = rows.slice(0, 80);"),
        ("p.classList.toggle('mine', !!r); p.classList.toggle('owned', !r && MAPOWNED.some(o => o.key === k)); });", "p.classList.toggle('mine', !!r && !r.cand); p.classList.toggle('owned', !r && MAPOWNED.some(o => o.key === k)); });"),
        ("$('.go2', card).style.display = biz && r.status !== 'vacant' ? '' : 'none';", "$('.go2', card).style.display = biz && r.status !== 'vacant' ? '' : 'none';\n        paintFacts(r);"),
        ("const limit = sw() - (stage.classList.contains('panel') ? 330 : 16);", "const limit = sw() - (stage.classList.contains('panel') ? (stage.classList.contains('finder') ? 470 : 330) : 16);"),
        ("const panelShift = stage.classList.contains('panel') ? 150 : 0;", "const panelShift = stage.classList.contains('panel') ? (stage.classList.contains('finder') ? 220 : 150) : 0;"),
        ("apply(); render();\n", "wireFinder(); apply(); render();\n"),
    ]
    for old, new in reps:
        assert old in script, old[:60]
        script = script.replace(old, new, 1)
    # the card for a finder row: the name is the address, the sub line the neighbourhood
    script = script.replace("const biz = !!r.name;\n        $('h3', card).textContent", "const biz = !!r.name;\n        if (r.cand) { $('h3', card).textContent = r.address; $('.sub', card).innerHTML = '<span class=\"hood\">' + r.code + '</span><span>' + r.hood + '</span>'; $('.nums', card).innerHTML = ''; $('.finds2', card).style.display = 'none'; $('.go2', card).style.display = 'none'; paintFacts(r); return; }\n        $('h3', card).textContent", 1)
    bc.SCRIPT = body + script + "  }\n}\n"
    bc.SCRIPT = bc.SCRIPT.replace("balls.push(makeBall(first, 0)); enter(balls[0], 400);", bm.GULP, 1)
    finder_data = {"buildings": [{k: v for k, v in b.items()} for b in F["buildings"]], "forSale": F["forSale"], "demand": F["demand"], "hoods": HOODS}
    bc.SCRIPT = bc.SCRIPT.replace("class Component extends DCLogic {", "const MAPDATA = 1;\n" + bm.rows_js() + f"    const FINDER = {json.dumps(finder_data, separators=(',', ':'))};\n" + "class Component extends DCLogic {", 1)

    vac = sorted([b for b in F["buildings"] if b["status"] == "vacant" and b["type"] == "retail" and b["bounds"]], key=lambda b: -b["traffic"])
    rival = next(b for b in F["buildings"] if b["status"] == "rival" and b["type"] == "retail" and b["bounds"] and b["hood"] == "Hell's Kitchen")
    files = {
        "Main.dc.html": finder_page(),
        "FinderPicked.dc.html": finder_page(start=vac[0]["key"]),
        "FinderBuyout.dc.html": finder_page(buy=True, type_slug="ba:businesstype_coffeeshop"),
        "FinderOff.dc.html": finder_page(finder="0", start=rival["key"]),
        "ForSale.dc.html": finder_page(finder="sale"),
        "TodayCard.dc.html": today_card(),
        "GrowthCell.dc.html": growth_cell(),
    }
    for name, src in files.items():
        with open(os.path.join(HERE, name), "w", encoding="utf-8", newline="\n") as f:
            f.write(src)
    XR = 1440 + 120
    artboards = [
        {"file": "Main.dc.html", "title": "Map · Find a location on", "x": 0, "y": 0, "w": 1440, "h": 1100, "is_interactive": True, "expand": "fill"},
        {"file": "FinderPicked.dc.html", "title": "A candidate picked", "x": XR, "y": 0, "w": 1440, "h": 1100, "is_interactive": True, "expand": "fill"},
        {"file": "FinderBuyout.dc.html", "title": "Coffee shop · buy-out rows on", "x": 0, "y": 1300, "w": 1440, "h": 1100, "is_interactive": True, "expand": "fill"},
        {"file": "FinderOff.dc.html", "title": "Finder off · any building's card", "x": XR, "y": 1300, "w": 1440, "h": 1100, "is_interactive": True, "expand": "fill"},
        {"file": "ForSale.dc.html", "title": "For sale list", "x": 0, "y": 2600, "w": 1440, "h": 1100, "is_interactive": True, "expand": "fill"},
        {"file": "TodayCard.dc.html", "title": "Today · the card goes live", "x": XR, "y": 2600, "w": 1440, "h": 1100, "is_interactive": True, "expand": "fill"},
        {"file": "GrowthCell.dc.html", "title": "Growth · a cell links to premises", "x": 0, "y": 3900, "w": 1440, "h": 1000, "is_interactive": True, "expand": "fill"},
    ]
    notes = [
        {"id": "n-main", "x": 0, "y": -170, "w": 600, "text": "Find a location is a chip on the map page, off by default. On: the layer chips and search give way to category, type, availability and neighbourhood filters; the side list becomes a ranked table (score, traffic, demand, est. rent; click a header to sort). Score = traffic × type demand ÷ 100, said plainly under the filters with the not-a-profit-ranking line. Any type: each row names the neighbourhood's best fit. Data is your HART. YT save on day 20: 176 vacant retail units."},
        {"id": "n-picked", "x": XR, "y": -130, "w": 520, "text": "A picked candidate: the card shows score, traffic and demand as three mono numbers, then the building facts (size, traffic, door cap, est. rent) and the type line (best fit, demand, rivals in the neighbourhood). Candidates are green footprints; your own shops stay faint."},
        {"id": "n-buyout", "x": 0, "y": 1180, "w": 520, "text": "Coffee shop chosen and buy-out switched on: rival-occupied retail buildings join the list in amber, occupant named on the row. No takeover price: the save does not carry it, and the ? says so."},
        {"id": "n-off", "x": XR, "y": 1180, "w": 520, "text": "Finder off: the map is exactly today's map, plus one chip. What changes for everyone: any building's card now shows availability, occupant, size, door cap, traffic and est. rent."},
        {"id": "n-sale", "x": 0, "y": 2480, "w": 520, "text": "For sale: a plain list behind the chip on the filter row, cheapest first, neighbourhood chips still apply. Not scored."},
        {"id": "n-today", "x": XR, "y": 2480, "w": 520, "text": "The Today card drops SOON: a live count where the badge was and one line naming the best-traffic vacant unit. Clicking opens the map with the finder on."},
        {"id": "n-growth", "x": 0, "y": 3780, "w": 520, "text": "Growth: clicking a type × neighbourhood cell keeps today's detail line and adds 'find premises', which opens the map with that type and neighbourhood preset."},
    ]
    canvas = {"artboards": artboards, "annotations": notes, "launch": {"view": "canvas"}}
    with open(os.path.join(HERE, "canvas.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(canvas, f, indent=2)
    print("wrote", len(files), "artboards and canvas.json")


if __name__ == "__main__":
    main()
