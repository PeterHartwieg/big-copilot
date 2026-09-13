"""Generate the Map page mockup as Claude Design artboards.

Reuses the board's tokens, masthead and sphere from mockup/revamp/build_canvas.py so the
map page reads as one more page of the same board. Run, then seed with the design helper.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "revamp"))
import build_canvas as bc  # noqa: E402

MAP_ICON = '<svg viewBox="0 0 24 24"><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16"></path><circle cx="12" cy="10" r="2"></circle></svg>'
bc.ICON["map"] = MAP_ICON
bc.ICON["search"] = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"></circle><path d="m20 20-4.2-4.2"></path></svg>'
bc.ICON["x"] = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"></path></svg>'
bc.ICON["home"] = '<svg viewBox="0 0 24 24"><path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"></path></svg>'
if ("map", "Map") not in bc.PAGES:
    bc.PAGES.append(("map", "Map"))

W, H = 1728, 1195.36
DATA = json.load(open(os.path.join(HERE, "data.json"), encoding="utf-8"))
LOCATIONS = json.load(open(os.path.join(HERE, "..", "..", "web", "maps", "locations.json"), encoding="utf-8"))


def rnd(path: str) -> str:
    """Trim path precision: the mockup does not need six decimals."""
    import re
    return re.sub(r"(\d+\.\d{1,})", lambda m: f"{float(m.group(1)):.1f}".rstrip("0").rstrip("."), path)


CSS = r"""
/* map page ---------------------------------------------------------------- */
.srch{display:flex;align-items:center;gap:8px;height:32px;padding:0 10px;border-radius:7px;border:1px solid var(--rule);background:var(--surface);color:var(--ink-3);width:250px;transition:border-color .15s,width .25s}
.srch:focus-within{border-color:var(--ink-3);color:var(--ink-2);width:300px}
.srch svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;flex:none}
.srch input{flex:1;min-width:0;border:0;background:none;color:var(--ink);font:inherit;font-size:13px;outline:none}
.srch input::placeholder{color:var(--ink-3)}
.srch .cnt{font-size:11px;color:var(--ink-3);flex:none}
.layers{display:inline-flex;gap:2px}
.sev.lay.off{opacity:.35}.sev.lay.off:hover{opacity:.6}
.sev.mine i{background:var(--accent)}.sev.own i{background:var(--info)}.sev.fnd i{background:var(--warn)}.sev.all i{background:transparent;border:1px solid var(--ink-3);box-sizing:border-box}
.seg .n{font-family:"IBM Plex Mono",monospace;font-size:10.5px;color:var(--ink-3);margin-left:5px}
.seg a.on .n{color:var(--ground);opacity:.7}

.citymap{position:relative;margin-top:16px}
.stage{position:relative;height:720px;border-radius:10px;border:1px solid var(--rule-soft);background:#0d100f;overflow:hidden;cursor:grab;user-select:none;-webkit-user-select:none}
.stage.drag{cursor:grabbing}
.world{position:absolute;left:0;top:0;width:1728px;height:1195.36px;transform-origin:0 0;will-change:transform}
.world img{display:block;width:1728px;height:1195.36px;pointer-events:none}
.world svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.fp{fill:transparent;stroke:none;cursor:pointer;transition:fill .2s,stroke .2s}
.fp.mine{fill:#43c07a;fill-opacity:.26;stroke:#65e99b;stroke-width:1.5;vector-effect:non-scaling-stroke}
.fp.owned{fill:#6ea8ff;fill-opacity:.2;stroke:#8fbcff;stroke-width:1.5;stroke-dasharray:4 3;vector-effect:non-scaling-stroke}
.stage.all .fp{stroke:#9aa39d;stroke-opacity:.35;stroke-width:1;vector-effect:non-scaling-stroke}
.stage.all .fp.mine{stroke:#65e99b;stroke-opacity:1}
.fp.dim{fill-opacity:.06;stroke-opacity:.35}
.fp.hot,.fp:hover{fill:#a2f8c4;fill-opacity:.4;stroke:#d9ffe8;stroke-width:2;vector-effect:non-scaling-stroke}
.fp.sel{fill:#65e99b;fill-opacity:.45;stroke:#fff7cc;stroke-width:2.5;vector-effect:non-scaling-stroke}
.pip{display:none;pointer-events:none;stroke:#0d100f;stroke-width:1.5;vector-effect:non-scaling-stroke}
.pip.crit{fill:var(--neg)}.pip.watch{fill:var(--warn)}.pip.info{fill:#9aa39d}
.stage.zoomed .pip{display:inline}
.dlabel{position:absolute;transform:translate(-50%,-50%);font:600 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.16em;color:#bdcbbf;text-shadow:0 0 6px #0d100f,0 0 2px #0d100f;pointer-events:none;white-space:nowrap;transition:opacity .25s}
.stage.zoomed .dlabel{opacity:0}

/* the ball lives in Central Park; it hops to whatever you pick ------------- */
.ball{position:absolute;left:0;top:0;width:60px;height:60px;z-index:4;cursor:pointer;will-change:transform;transform-origin:50% 100%;pointer-events:auto}
.ball i{display:block;width:100%;height:100%;border-radius:50%;
  background:radial-gradient(circle at var(--hx,32%) var(--hy,30%),#d9ffe8 0%,#7fe3a8 14%,var(--accent) 38%,#146b3c 78%,#0b3d23 100%);
  box-shadow:0 18px 40px #43c07a3d,inset -14px -20px 34px #00000066,inset 6px 8px 18px #ffffff22}
.ball u{position:absolute;inset:0;border-radius:50%;pointer-events:none;
  background:radial-gradient(circle at 72% 28%,#0003 0 4.5%,transparent 5.5%),radial-gradient(circle at 26% 62%,#0003 0 3.5%,transparent 4.5%),radial-gradient(circle at 62% 80%,#0002 0 3%,transparent 4%),radial-gradient(circle at 40% 22%,#0002 0 2%,transparent 3%)}
.ball .squish{animation:squish .7s cubic-bezier(.34,1.56,.64,1)}
.ball.spin i{animation:coinspin .6s linear}
.shadow{position:absolute;left:0;top:0;width:88px;height:14px;border-radius:50%;background:#000;opacity:.5;filter:blur(5px);z-index:3;pointer-events:none;transform-origin:50% 50%}

/* places: a floating panel over the map ------------------------------------ */
.places{position:absolute;top:16px;right:16px;bottom:16px;width:300px;display:flex;flex-direction:column;z-index:5;border-radius:10px;border:1px solid var(--rule);background:color-mix(in srgb,var(--surface) 92%,transparent);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);overflow:hidden;transition:transform .35s cubic-bezier(.2,.7,.2,1),opacity .3s}
.places.away{transform:translateX(330px);opacity:0}
.places .head{display:flex;align-items:center;gap:8px;padding:12px 12px 10px;border-bottom:1px solid var(--rule-soft)}
.places .head .lab{font-family:"IBM Plex Mono",monospace;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3)}
.places .head .cnt{margin-left:auto;font-family:"IBM Plex Mono",monospace;font-size:11.5px;color:var(--ink-2)}
.places .list{overflow:auto;overscroll-behavior:contain;flex:1;padding:4px 0}
.place{display:grid;grid-template-columns:18px 30px 1fr auto;gap:0 8px;align-items:center;padding:9px 12px 9px 8px;cursor:pointer;color:var(--ink-2);transition:background .15s,color .15s;position:relative}
.place:hover{background:var(--raised);color:var(--ink)}
.place.on{background:var(--accent-soft);color:var(--ink);box-shadow:inset 3px 0 var(--accent)}
.place .mark{width:7px;height:7px;border-radius:50%;justify-self:center;background:var(--rule);transition:transform .2s cubic-bezier(.34,1.56,.64,1)}
.place.crit .mark{background:var(--neg)}.place.watch .mark{background:var(--warn)}.place.info .mark{background:var(--ink-3)}
.place:hover .mark{transform:scale(1.6)}
.place .nm{font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.place .nm small{display:block;font-size:11px;font-weight:400;color:var(--ink-3);overflow:hidden;text-overflow:ellipsis;max-height:0;opacity:0;transition:max-height .2s,opacity .2s,margin .2s}
.place:hover .nm small,.place.on .nm small{max-height:16px;opacity:1;margin-top:1px}
.place .amt{font-family:"IBM Plex Mono",monospace;font-size:12px;text-align:right;white-space:nowrap}
.place .amt.pos{color:var(--pos)}.place .amt.neg{color:var(--neg)}
.places .more{padding:10px 12px;font:400 11.5px/1.4 "IBM Plex Mono",monospace;color:var(--ink-3);border-top:1px solid var(--rule-soft)}
.places .empty{padding:24px 14px;font-size:12.5px;color:var(--ink-3);text-align:center}

/* the site card: opens beside the footprint ---------------------------------- */
.site{position:absolute;left:0;top:0;width:290px;z-index:6;border-radius:10px;border:1px solid var(--rule);background:var(--surface);box-shadow:0 12px 40px #0008;padding:14px 16px 14px;opacity:0;transform:translateY(8px) scale(.96);transform-origin:0 0;pointer-events:none;transition:opacity .25s,transform .3s cubic-bezier(.2,.7,.2,1)}
.site.in{opacity:1;transform:none;pointer-events:auto}
.site.flip{transform-origin:100% 0}
.site h3{margin:0;font-size:16px;font-weight:600;letter-spacing:-.01em;padding-right:26px}
.site .sub{display:flex;align-items:center;gap:6px;margin-top:5px;font-size:12px;color:var(--ink-2)}
.site .x{position:absolute;top:10px;right:10px;width:24px;height:24px;border-radius:6px;display:grid;place-items:center;color:var(--ink-3);cursor:pointer}
.site .x:hover{color:var(--ink);background:var(--raised)}
.site .x svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round}
.site .nums{display:flex;gap:18px;margin-top:12px}
.site .num{display:flex;flex-direction:column;gap:3px}
.site .num b{font-family:"IBM Plex Mono",monospace;font-size:17px;font-weight:500;letter-spacing:-.02em}
.site .num span{font-family:"IBM Plex Mono",monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}
.site .finds2{margin-top:12px;display:flex;flex-direction:column;gap:6px}
.site .f{display:flex;align-items:flex-start;gap:8px;font-size:12px;color:var(--ink-2);line-height:1.4}
.site .f i{flex:none;width:7px;height:7px;border-radius:50%;margin-top:5px}
.site .f.crit i{background:var(--neg)}.site .f.watch i{background:var(--warn)}.site .f.info i{background:var(--ink-3)}
.site .f b{font-weight:500;color:var(--ink);margin-left:4px}.site .f small{font-family:"IBM Plex Mono",monospace;font-size:9.5px;letter-spacing:.08em;color:var(--ink-3);margin-left:4px}
.site .go2{position:absolute;right:10px;bottom:12px;width:26px;height:26px;display:grid;place-items:center;border-radius:6px;color:var(--ink-3);text-decoration:none}
.site .go2:hover{color:var(--accent);background:var(--raised)}
.site .go2::after{top:auto;bottom:calc(100% + 6px)}
.site .go2 svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;transition:transform .2s}
.site .go2:hover svg{transform:translateX(3px)}
.site .tail{position:absolute;left:-7px;top:22px;width:12px;height:12px;background:var(--surface);border-left:1px solid var(--rule);border-bottom:1px solid var(--rule);transform:rotate(45deg)}
.site.flip .tail{left:auto;right:-7px;transform:rotate(-135deg)}

/* map chrome: zoom and fit, bottom-right --------------------------------------- */
.zoomer{position:absolute;right:16px;bottom:16px;z-index:5;display:flex;flex-direction:column;gap:4px}
.stage.panel .zoomer{right:332px}
.zoomer .ibtn{font:500 18px/1 "IBM Plex Mono",monospace;text-decoration:none}
.zoomer .ibtn[data-tip]::after{left:auto;right:calc(100% + 10px);top:50%;transform:translate(6px,-50%)}.zoomer .ibtn[data-tip]:hover::after{transform:translate(0,-50%)}

/* split layout alternative: list beside the map ------------------------------ */
.citymap.split{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:16px}
.citymap.split .places{position:static;width:auto;height:720px;background:var(--surface);backdrop-filter:none}
.citymap.split .stage.panel .zoomer{right:16px}

/* overlay: the map shortcut from a finding ------------------------------------ */
.dim{position:absolute;inset:0;background:#000a;z-index:20}
.dlg{position:absolute;left:50%;top:40px;transform:translateX(-50%);width:1080px;z-index:21;border-radius:12px;border:1px solid var(--rule);background:var(--ground);padding:18px 20px 20px;box-shadow:0 30px 80px #000c}
.dlg .dhead{display:flex;align-items:center;gap:12px;margin-bottom:12px}
.dlg .dhead h2{margin:0;font-size:18px;font-weight:600;letter-spacing:-.01em}
.dlg .dhead .crumb{font-family:"IBM Plex Mono",monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3)}
.dlg .dhead .ibtn{margin-left:auto}
.dlg .stage{height:560px}
.ghost{filter:blur(2px);opacity:.55;pointer-events:none}
"""

SCRIPT = r"""
    // ---- the city map: pan, zoom, pick; the ball hops to whatever you pick ----
    const city = $('.citymap');
    if (city) {
      const W = 1728, H = 1195.36, HOME = { x: 880, y: 542 }; // Central Park spans about x 590-1060, y 405-680
      const stage = $('.stage', city), world = $('.world', city), ball = $('.ball', city), shadow = $('.shadow', city);
      const card = $('.site', city), places = $('.places', city), list = $('.list', places);
      const ROWS = MAPROWS, ALL = MAPALL, byKey = {}; ROWS.forEach(r => byKey[r.key] = r);
      const paths = {}; $$('.fp', world).forEach(p => paths[p.dataset.k] = p);
      const labels = $$('.dlabel', stage);
      const sw = () => stage.clientWidth, sh = () => stage.clientHeight;
      // the floating panel takes the right 316px; the world is fitted into what is left
      const room = () => stage.classList.contains('panel') ? 316 : 0;
      const fitView = (b) => { const aw = sw() - room(); const s = Math.min(aw / b[2], sh() / b[3]) * .96; return { s, ox: (aw - b[2] * s) / 2 - b[0] * s, oy: (sh() - b[3] * s) / 2 - b[1] * s }; };
      const WORLD = [0, 0, W, H];
      let view = fitView(WORLD), goal = null, goalT0 = 0, goalFrom = null, goalDur = 700;
      let s0 = view.s;
      const b = { x: HOME.x, y: HOME.y, size: 170, lift: 0, busy: false, home: true, lean: { x: 0, y: 0 }, tx: 0, ty: 0 };
      let selected = null, hot = null, layers = { mine: true, own: true, fnd: true, all: false }, query = '';
      const proj = (x, y) => ({ x: view.ox + x * view.s, y: view.oy + y * view.s });
      const money = (v) => (v < 0 ? '−' : '+') + '$' + Math.abs(Math.round(v)).toLocaleString('en-US');

      const apply = () => {
        world.style.transform = 'translate(' + view.ox.toFixed(2) + 'px,' + view.oy.toFixed(2) + 'px) scale(' + view.s.toFixed(4) + ')';
        stage.classList.toggle('zoomed', view.s > s0 * 1.9);
        labels.forEach(l => { const p = proj(+l.dataset.x, +l.dataset.y); l.style.transform = 'translate(' + (p.x - 0) + 'px,' + p.y + 'px) translate(-50%,-50%)'; });
        $$('.pip', world).forEach(c => c.setAttribute('r', (4.5 / view.s).toFixed(2)));
        paintBall(); paintCard(); paintLeader();
      };
      const paintBall = () => {
        const p = proj(b.x, b.y), size = b.size * view.s;
        const lx = b.lean.x, ly = b.lean.y;
        ball.style.width = ball.style.height = size + 'px';
        ball.style.transform = 'translate(' + (p.x - size / 2 + lx) + 'px,' + (p.y - size / 2 - b.lift + ly) + 'px)';
        const k = Math.max(.35, 1 - b.lift / (size * 3));
        shadow.style.width = size + 'px'; shadow.style.height = (size * .16) + 'px';
        shadow.style.transform = 'translate(' + (p.x - size / 2 + lx * .4) + 'px,' + (p.y + size * .42) + 'px) scale(' + k + ')';
        shadow.style.opacity = (.5 * k).toFixed(2);
      };
      const paintCard = () => {
        if (!card || !selected) return;
        const r = byKey[selected]; if (!r || !r.bounds) return;
        const p = proj(r.bounds[0] + r.bounds[2] / 2, r.bounds[1] + r.bounds[3] / 2);
        const limit = sw() - (stage.classList.contains('panel') ? 330 : 16);
        const flip = p.x + 40 + 290 > limit;
        card.classList.toggle('flip', flip);
        const x = flip ? p.x - 40 - 290 : p.x + 40, y = Math.max(12, Math.min(sh() - card.offsetHeight - 12, p.y - 34));
        card.style.left = x + 'px'; card.style.top = y + 'px';
      };
      const paintLeader = () => {};
      const glide = (to, dur) => { goalFrom = { ...view }; goal = to; goalT0 = performance.now(); goalDur = dur || 700; };
      const squish = () => [$('i', ball), $('u', ball)].forEach(el => { el.classList.remove('squish'); void el.offsetWidth; el.classList.add('squish'); });
      const ring = () => { const r = ball.getBoundingClientRect(), i = document.createElement('i'); i.className = 'ring';
        i.style.left = (r.left + window.scrollX) + 'px'; i.style.top = (r.top + window.scrollY) + 'px'; i.style.width = r.width + 'px'; i.style.height = r.height + 'px';
        document.body.appendChild(i); setTimeout(() => i.remove(), 900); };
      // rows in the panel
      const level = (r) => r.alerts.some(a => a.level === 'critical') ? 'crit' : r.alerts.some(a => a.level === 'warn') ? 'watch' : r.alerts.length ? 'info' : '';
      const visibleRows = () => {
        // layers add up: whatever is switched on is in the list and lit on the map
        const seen = new Set(); let rows = [];
        const add = (r) => { if (!seen.has(r.key)) { seen.add(r.key); rows.push(r); } };
        if (layers.mine) ROWS.forEach(add);
        if (layers.fnd) ROWS.filter(r => r.alerts.length).forEach(add);
        if (layers.own) { ROWS.filter(r => r.owned).forEach(add); MAPOWNED.forEach(add); }
        if (layers.all) ALL.forEach(add);
        const q = query.trim().toLowerCase();
        if (q) rows = rows.filter(r => ((r.name || '') + ' ' + r.address + ' ' + (r.hood || '') + ' ' + (r.type || '')).toLowerCase().includes(q));
        return rows;
      };
      const render = () => {
        const rows = visibleRows(), keys = new Set(rows.map(r => r.key));
        stage.classList.toggle('all', layers.all);
        Object.keys(paths).forEach(k => { const p = paths[k], r = byKey[k];
          p.classList.toggle('dim', !keys.has(k) && k !== selected);
          p.classList.toggle('mine', !!r); p.classList.toggle('owned', !r && MAPOWNED.some(o => o.key === k)); });
        $$('.pip', world).forEach(c => c.style.visibility = layers.fnd && keys.has(c.dataset.k) ? '' : 'hidden');
        if (!list) return;
        const shown = rows.slice(0, 80);
        list.innerHTML = shown.map(r => {
          const lv = r.alerts ? level(r) : '', biz = !!r.name;
          return '<div class="place ' + lv + (r.key === selected ? ' on' : '') + '" data-k="' + r.key + '"><i class="mark"></i><span class="hood">' + (r.code || r.hood.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()) + '</span>' +
            '<span class="nm">' + (biz ? r.name.replace(/^\[\w+\]\s*/, '') : r.address) + '<small>' + (biz ? r.address + ' · ' + r.type : r.hood) + (r.owned && biz ? ' · owned' : '') + '</small></span>' +
            (biz && r.status !== 'vacant' ? '<span class="amt ' + (r.profit >= 0 ? 'pos' : 'neg') + '">' + money(r.profit) + '</span>' : '<span class="amt"></span>') + '</div>';
        }).join('') + (rows.length > shown.length ? '<div class="more">+' + (rows.length - shown.length) + '</div>' : '') + (rows.length ? '' : '<div class="empty">Nothing here.</div>');
        const cnt = $('.srch .cnt'); if (cnt) cnt.textContent = rows.length;
      };

      const select = (key, opts) => {
        opts = opts || {};
        const r = byKey[key] || MAPOWNED.find(o => o.key === key); if (!r || !r.bounds) return;
        if (selected && paths[selected]) paths[selected].classList.remove('sel');
        selected = key; paths[key] && paths[key].classList.add('sel');
        $$('.place', list || city).forEach(p => p.classList.toggle('on', p.dataset.k === key));
        const cx = r.bounds[0] + r.bounds[2] / 2, cy = r.bounds[1] + r.bounds[3] / 2;
        // the camera glides in and the card opens beside the building
        const zs = Math.max(view.s, s0 * 2.6);
        const panelShift = stage.classList.contains('panel') ? 150 : 0;
        const to = { s: zs, ox: sw() * .44 - panelShift - cx * zs, oy: sh() * .5 - cy * zs };
        card && card.classList.remove('in');
        fillCard(r);
        if (opts.instant) { view = to; apply(); paintCard(); card && card.classList.add('in'); return; }
        glide(to, 720);
        setTimeout(() => { if (selected === key) { paintCard(); card && card.classList.add('in'); } }, 560);
      };
      const fillCard = (r) => {
        if (!card) return;
        const biz = !!r.name;
        $('h3', card).textContent = biz ? r.name.replace(/^\[\w+\]\s*/, '') : r.address;
        $('.sub', card).innerHTML = '<span class="hood">' + (r.code || 'OWN') + '</span><span>' + (biz ? r.address + ' · ' + r.type : 'Owned building · bought day ' + r.purchaseDay) + '</span>';
        const nums = $('.nums', card);
        nums.innerHTML = biz && r.status !== 'vacant'
          ? '<div class="num"><b class="' + (r.profit >= 0 ? 'pos' : 'neg') + '">' + money(r.profit) + '</b><span>yesterday</span></div><div class="num"><b>$' + Math.round(r.rent).toLocaleString('en-US') + '</b><span>rent / day</span></div><div class="num"><b>' + r.staff + '</b><span>staff</span></div>'
          : biz ? '<div class="num"><b>$' + Math.round(r.rent).toLocaleString('en-US') + '</b><span>rent / day</span></div><div class="num"><b>—</b><span>not trading</span></div>'
          : '<div class="num"><b>$' + (r.purchasePrice / 1e6).toFixed(2) + 'M</b><span>paid</span></div>';
        const f = $('.finds2', card);
        f.innerHTML = (r.alerts || []).map(a => '<div class="f ' + (a.level === 'critical' ? 'crit' : a.level === 'warn' ? 'watch' : 'info') + '"><i></i><span>' + a.short + '</span></div>').join('');
        f.style.display = (r.alerts || []).length ? '' : 'none';
        $('.go2', card).style.display = biz && r.status !== 'vacant' ? '' : 'none';
      };
      const deselect = () => {
        if (!selected) return;
        paths[selected] && paths[selected].classList.remove('sel'); selected = null;
        $$('.place', list || city).forEach(p => p.classList.remove('on'));
        card && card.classList.remove('in');
      };

      // pointer: drag pans, wheel zooms about the pointer, a still click picks
      let down = null, moved = false;
      stage.addEventListener('pointerdown', (e) => { if (e.button !== 0 || e.target.closest('.places,.site,.zoomer,.ball')) return;
        down = { x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy }; moved = false; goal = null; stage.classList.add('drag'); stage.setPointerCapture(e.pointerId); });
      stage.addEventListener('pointermove', (e) => { if (!down) return; const dx = e.clientX - down.x, dy = e.clientY - down.y;
        if (Math.hypot(dx, dy) > 4) moved = true; view.ox = down.ox + dx; view.oy = down.oy + dy; apply(); });
      const up = (e) => { if (!down) return; stage.classList.remove('drag'); const wasMoved = moved; down = null;
        if (wasMoved) return; const fp = e.target.closest && e.target.closest('.fp');
        if (fp) select(fp.dataset.k); else deselect(); };
      stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', () => { down = null; stage.classList.remove('drag'); });
      const zoomAt = (f, px, py) => { const ns = Math.max(s0 * .7, Math.min(s0 * 9, view.s * f)); const k = ns / view.s;
        view = { s: ns, ox: px - (px - view.ox) * k, oy: py - (py - view.oy) * k }; goal = null; apply(); };
      stage.addEventListener('wheel', (e) => { e.preventDefault(); const r = stage.getBoundingClientRect();
        zoomAt(Math.exp(-Math.max(-1, Math.min(1, e.deltaY * .002))), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
      $$('.zoomer [data-z]', city).forEach(z => z.addEventListener('click', () => zoomAt(z.dataset.z === 'in' ? 1.5 : 1 / 1.5, sw() / 2, sh() / 2)));
      const REGIONS = MAPREGIONS;
      $$('[data-region]', city).forEach(a => a.addEventListener('click', (e) => { e.preventDefault();
        const id = a.dataset.region; const reg = REGIONS.find(r => r.id === id);
        glide(fitView(reg ? reg.bounds : WORLD), 800); }));

      // panel: filters, search, hover leans the ball toward the row, click picks
      if (places) {
        $$('.sev.lay').forEach(a => a.addEventListener('click', () => { layers[a.dataset.l] = !layers[a.dataset.l]; a.classList.toggle('off', !layers[a.dataset.l]); render(); }));
        const inp = $('.srch input'); if (inp) inp.addEventListener('input', () => { query = inp.value; render(); });
        list.addEventListener('mouseover', (e) => { const p = e.target.closest('.place'); if (!p) return; hot = p.dataset.k; paths[hot] && paths[hot].classList.add('hot');
          paintLeader(); });
        list.addEventListener('mouseout', (e) => { const p = e.target.closest('.place'); if (!p) return; paths[p.dataset.k] && paths[p.dataset.k].classList.remove('hot'); hot = null; paintLeader(); });
        list.addEventListener('click', (e) => { const p = e.target.closest('.place'); if (p) select(p.dataset.k); });
      }
      if (card) { $('.x', card).addEventListener('click', deselect); }
      world.addEventListener('mouseover', (e) => { const fp = e.target.closest('.fp'); if (fp) { hot = fp.dataset.k; paintLeader(); } });
      world.addEventListener('mouseout', (e) => { const fp = e.target.closest('.fp'); if (fp) { hot = null; paintLeader(); } });

      // the ball itself: click it and it pays out; it watches the pointer like its sibling on the masthead
      ball.addEventListener('click', () => { if (b.busy) return; squish(); ring();
        const r = ball.getBoundingClientRect();
        // the masthead balls are the same sphere: this one swallows them and grows a little per gulp
        if (window.__consumeBalls && window.__consumeBalls(r.left + r.width / 2, r.top + r.height * .55, () => { squish(); b.size = Math.min(230, b.size * 1.08); })) return;
        ball.classList.remove('spin'); void ball.offsetWidth; ball.classList.add('spin');
        for (let i = 0; i < 10; i++) { const c = document.createElement('i'); c.className = 'coin';
          const a = (Math.random() * Math.PI) - Math.PI, d = 50 + Math.random() * 110;
          c.style.left = (r.left + window.scrollX + r.width / 2) + 'px'; c.style.top = (r.top + window.scrollY + r.height * .4) + 'px';
          c.style.setProperty('--dx', Math.cos(a) * d + 'px'); c.style.setProperty('--dy', (Math.abs(Math.sin(a)) * d + 120) + 'px');
          c.style.animationDelay = (Math.random() * .12) + 's'; document.body.appendChild(c); setTimeout(() => c.remove(), 1400); } });
      document.addEventListener('mousemove', (e) => { const r = ball.getBoundingClientRect(); const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2), d = Math.hypot(dx, dy) || 1;
        ball.style.setProperty('--hx', (34 + dx / d * 20) + '%'); ball.style.setProperty('--hy', (32 + dy / d * 20) + '%'); });

      // the loop: the camera glides, the ball breathes at home and leans toward what you hover
      const size = () => b.size * view.s;
      const loop = (t) => {
        if (goal) { const p = Math.min(1, (t - goalT0) / goalDur), e = 1 - Math.pow(1 - p, 3);
          view = { s: goalFrom.s + (goal.s - goalFrom.s) * e, ox: goalFrom.ox + (goal.ox - goalFrom.ox) * e, oy: goalFrom.oy + (goal.oy - goalFrom.oy) * e };
          if (p >= 1) goal = null; apply(); }
        if (!b.busy) { b.lean.x += (b.tx - b.lean.x) * .08; b.lean.y += (b.ty - b.lean.y) * .08;
          b.lift = (1 + Math.sin(t / 700)) * size() * .012; paintBall(); paintLeader(); }
        requestAnimationFrame(loop);
      };
      // the pane that previews this canvas sometimes stops firing frames; real browsers do not
      requestAnimationFrame(loop);
      apply(); render();
      // the stage may not have a size yet when this runs (the canvas mounts artboards lazily)
      let sized = sw() > 0;
      const begin = () => {
        const start = city.dataset.start;
        if (start) select(start, { instant: true });
      };
      if (sized) begin();
      if ('ResizeObserver' in window) new ResizeObserver(() => {
        if (!sw()) return;
        if (!sized) { sized = true; view = fitView(WORLD); s0 = view.s; goal = null; apply(); begin(); }
        else { if (!goal) apply(); }
      }).observe(stage);
      
    }
"""


LABELS = {  # a verb, like the Today page: the sentence lives behind the ? mark, not in the card
    "notrading": "Not trading yet", "atcap": "At the door cap", "idlestaff": "Staff idle on quiet hours", "target": "Overstocked",
    "trend": "Revenue jumped", "hype": "Riding the hype", "shortfall": "Runs dry before the import",
}


GULP = r"""balls.push(makeBall(first, 0)); enter(balls[0], 400);
      // something on the page (the ball on the map) may swallow every ball on the shelf
      window.__consumeBalls = (tx, ty, onEach) => {
        if (!balls.length || balls.some(b => b.busy)) return false;
        const roll = Math.min(maxRun(), window.scrollY * .6), taken = balls.splice(0, balls.length);
        taken.forEach((b, i) => { const r = b.el.getBoundingClientRect(), dx = tx - (r.left + r.width / 2), dy = ty - (r.top + r.height / 2);
          const t0 = performance.now() + i * 140, dur = 700, x0 = b.px + roll, y0 = b.py, s0 = b.sc;
          const step = (t) => { const p = Math.max(0, Math.min(1, (t - t0) / dur)), e = p * p * (3 - 2 * p);
            b.el.style.transform = 'translate(' + (x0 + dx * e) + 'px,' + (y0 + dy * e - Math.sin(p * Math.PI) * 60) + 'px) scale(' + (s0 * (1 - .8 * e)) + ')';
            b.el.style.opacity = String(1 - Math.max(0, p - .85) / .15);
            if (p < 1) requestAnimationFrame(step); else { b.el.remove(); onEach && onEach(); } };
          requestAnimationFrame(step); });
        return true;
      };"""


def short_alert(a: dict) -> str:
    label = LABELS.get(a.get("group"), "Finding")
    worth, unit = a.get("worth"), (a.get("unit") or "").strip()
    if worth:
        return f'{label} <b class="mono">${round(worth):,}</b><small>{unit.upper()}</small>'
    return label


def rows_js() -> str:
    rows = []
    owned_keys = {o["key"] for o in DATA["owned"]}
    for r in DATA["rows"]:
        rows.append({
            "key": r["key"], "name": r["name"], "code": r["code"], "hood": r["hood"], "type": r["type"], "status": r["status"],
            "address": r["address"], "profit": round(r["profit"]), "rent": r["rent"], "staff": r["staff"], "bounds": [round(v, 1) for v in r["bounds"]],
            "owned": r["key"] in owned_keys,
            "alerts": [{"level": a["level"], "short": short_alert(a)} for a in r["alerts"]],
        })
    hoods = {b["key"]: b["hood"] for b in LOCATIONS["buildings"]}
    owned = [{"key": o["key"], "address": o["address"], "hood": hoods.get(o["key"], "Owned"), "purchaseDay": o["purchaseDay"], "purchasePrice": o["purchasePrice"],
              "bounds": [round(v, 1) for v in o["bounds"]], "alerts": []} for o in DATA["owned"]]
    everything = [{"key": b["key"], "address": b["address"], "hood": b["hood"], "alerts": []} for b in LOCATIONS["buildings"]]
    return (f"const MAPROWS = {json.dumps(rows, separators=(',', ':'))};\n"
            f"    const MAPOWNED = {json.dumps(owned, separators=(',', ':'))};\n"
            f"    const MAPALL = {json.dumps(everything, separators=(',', ':'))};\n"
            f"    const MAPREGIONS = {json.dumps(DATA['regions'], separators=(',', ':'))};\n")


def map_markup(*, start: str = "", drop: bool = False, layout: str = "float", panel: bool = True, chrome: bool = True) -> str:
    keys = {r["key"] for r in DATA["rows"]} | {o["key"] for o in DATA["owned"]}
    fps = []
    for b in LOCATIONS["buildings"]:
        if not b.get("path"):
            continue
        fps.append(f'<path class="fp" data-k="{b["key"]}" d="{rnd(b["path"])}" fill-rule="evenodd"><title>{b["address"]}</title></path>')
    pips = []
    for r in DATA["rows"]:
        if r["alerts"]:
            lv = "crit" if any(a["level"] == "critical" for a in r["alerts"]) else "watch" if any(a["level"] == "warn" for a in r["alerts"]) else "info"
            x, y, w, h = r["bounds"]
            pips.append(f'<circle class="pip {lv}" data-k="{r["key"]}" cx="{x + w / 2:.1f}" cy="{y + h / 2:.1f}" r="4"></circle>')
    labels = "".join(f'<span class="dlabel" data-x="{l["anchor"][0]:.1f}" data-y="{l["anchor"][1]:.1f}">{l["label"]}</span>' for l in DATA["labels"])
    n_mine = len(DATA["rows"]); n_owned = len(DATA["owned"]); n_issues = sum(1 for r in DATA["rows"] if r["alerts"]); n_all = len(LOCATIONS["buildings"])
    seg = (f'<span class="layers">'
           f'<span class="sev lay mine" data-l="mine" data-tip="Your businesses: {n_mine} sites. Click to hide them."><i></i>{n_mine}</span>'
           f'<span class="sev lay own" data-l="own" data-tip="Buildings you own, {n_owned} of them, dashed blue on the map."><i></i>{n_owned}</span>'
           f'<span class="sev lay fnd" data-l="fnd" data-tip="Sites with a finding from Today: {n_issues}. Red is critical, amber is worth a look, grey is for information."><i></i>{n_issues}</span>'
           f'<span class="sev lay all off" data-l="all" data-tip="Every address in the city, {n_all} of them, as faint outlines. Off by default."><i></i>{n_all}</span>'
           f'</span>')
    places_html = f"""
    <aside class="places">
      <div class="list"></div>
    </aside>""" if panel else ""
    chrome_html = f"""
    <div class="zoomer"><a class="ibtn" href="#in" data-z="in">+</a><a class="ibtn" href="#out" data-z="out">−</a><a class="ibtn" href="#city" data-region="world" data-tip="Whole city">{bc.ICON["home"]}</a></div>""" if chrome else ""
    head = f"""
<div class="sechead rv" style="margin-top:28px">
  {seg}
  <span class="why" data-tip="The dots are layers: your businesses, buildings you own, sites with a finding, every address. Click one to switch it off; off is dimmed, never gone. Pick a place from the list or on the map and its card opens beside the building. Drag to pan, wheel to zoom.">?</span>
  <span class="aside"><label class="srch">{bc.ICON["search"]}<input type="text" placeholder="Search"><span class="cnt mono"></span></label></span>
</div>""" if panel else ""
    stage_cls = "stage" + (" panel" if panel and layout == "float" else "")
    return f"""{head}
<div class="citymap rv {layout}" data-start="{start}"{' data-drop="1"' if drop else ""}>
  <div class="{stage_cls}">
    <div class="world">
      <img src="city.jpg" alt="">
      <svg viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg"><g class="fps">{"".join(fps)}</g><g class="pips">{"".join(pips)}</g></svg>
    </div>
    {labels}
    <div class="shadow"></div>
    <div class="ball"><i></i><u></u></div>
    <div class="site"><span class="tail"></span><span class="x">{bc.ICON["x"]}</span><h3>Place</h3><div class="sub"></div><div class="nums"></div><div class="finds2"></div><a class="go2 tr" href="#detail" data-tip="Open business details">{bc.ICON["go"]}</a></div>
    {chrome_html}
  </div>
  {places_html}
</div>"""


ORB = '<div class="orb"><i></i><u></u></div>'


def page(start: str = "", layout: str = "float") -> str:
    return bc.shell("map", map_markup(start=start, layout=layout))


def overlay() -> str:
    """The map shortcut from a finding: a dialog over the Today page."""
    ghost = f"""
<div class="ghost">{bc.masthead("today")}
<div class="kpis" style="margin-top:36px">
  <div class="kpi"><span class="lab">Profit yesterday</span><span class="v mono">+$3.47M</span><span class="sub">7-day avg +$3.31M</span></div>
  <div class="kpi"><span class="lab">Cash</span><span class="v mono">$41.2M</span><span class="sub">runway n/a</span></div>
  <div class="kpi"><span class="lab">Wages</span><span class="v mono">$149k</span><span class="sub">634 staff</span></div>
  <div class="kpi"><span class="lab">Findings</span><span class="v mono">11</span><span class="sub">21 more below the line</span></div>
</div>
<div class="finds" style="margin-top:36px">
  <a class="find crit" href="#f1"><i class="mark"></i><span class="site"><span class="hood">HK</span>Costco Liquor</span><span class="what">Not trading yet</span><span class="amt">$179<small>/DAY RENT</small></span><span class="go">{bc.ICON["go"]}</span></a>
  <a class="find crit" href="#f2"><i class="mark"></i><span class="site"><span class="hood">IC</span>Costco Liquor</span><span class="what">Not trading yet</span><span class="amt">$98<small>/DAY RENT</small></span><span class="go">{bc.ICON["go"]}</span></a>
  <a class="find watch" href="#f3"><i class="mark"></i><span class="site"><span class="hood">LM</span>Costco Cloth</span><span class="what">Order running tight</span><span class="amt">$367k<small>/DAY</small></span><span class="go">{bc.ICON["go"]}</span></a>
</div>
</div>"""
    dlg = f"""
<div class="dim"></div>
<div class="dlg">
  <div class="dhead"><h2>Costco Liquor · 37 Fifth Avenue</h2><a class="ibtn" href="#close">{bc.ICON["x"]}</a></div>
  {map_markup(start="ba:street_fifthavenue#37", drop=True, panel=False)}
</div>"""
    body = f'<div style="position:relative;min-height:900px">{ghost}{dlg}</div>'
    return bc.shell("today", body, mast=False, foot=False).replace(ORB, "")


def main() -> None:
    bc.CSS = bc.CSS + CSS
    tail = bc.SCRIPT.rstrip()
    assert tail.endswith("}\n}"), "unexpected script shape"
    body = tail[:-1].rstrip()[:-1]
    bc.SCRIPT = body + SCRIPT + "  }\n}\n"
    assert "balls.push(makeBall(first, 0)); enter(balls[0], 400);" in bc.SCRIPT
    bc.SCRIPT = bc.SCRIPT.replace("balls.push(makeBall(first, 0)); enter(balls[0], 400);", GULP, 1)
    bc.SCRIPT = bc.SCRIPT.replace("class Component extends DCLogic {", "const MAPDATA = 1;\n" + rows_js() + "class Component extends DCLogic {", 1)
    files = {
        "Main.dc.html": page(),
        "MapSelected.dc.html": page(start="ba:street_broadwaystreet#19"),
        "MapShortcut.dc.html": overlay(),
        "MapSplit.dc.html": page(layout="split"),
    }
    for name, src in files.items():
        with open(os.path.join(HERE, name), "w", encoding="utf-8", newline="\n") as f:
            f.write(src)
    XR = 1440 + 120
    artboards = [
        {"file": "Main.dc.html", "title": "Map", "x": 0, "y": 0, "w": 1440, "h": 1060, "is_interactive": True, "expand": "fill"},
        {"file": "MapSelected.dc.html", "title": "Map · a place picked", "x": XR, "y": 0, "w": 1440, "h": 1060, "is_interactive": True, "expand": "fill"},
        {"file": "MapShortcut.dc.html", "title": "Map shortcut from a finding", "x": 0, "y": 1300, "w": 1440, "h": 940, "is_interactive": True, "expand": "fill"},
        {"file": "MapSplit.dc.html", "title": "Alternative · list beside the map", "x": XR, "y": 1300, "w": 1440, "h": 1060, "is_interactive": True, "expand": "fill"},
    ]
    notes = [
        {"id": "try-map", "x": 0, "y": -150, "w": 560, "text": "The ball is an object on the map: it sits in Central Park, breathes, and zooms with the city. Hover a row and its footprint lights. Finding dots appear on the footprints once you zoom in. Click a place (list or footprint) and the camera glides in and the card opens beside the building. Click the ball: it squishes and swallows every ball on the masthead shelf (click Costco for more of them); with none left it pays out coins. The house button fits the whole city again. Drag to pan, wheel to zoom. Row details show on hover; the count sits in the search field."},
        {"id": "note-selected", "x": XR, "y": -110, "w": 460, "text": "The picked state, for reading: 19 Broadway Street. Three mono numbers, findings as dots, one link to the business page. No sentences in the card; the ? mark on the page carries the explanation."},
        {"id": "note-shortcut", "x": 0, "y": 1190, "w": 460, "text": "The map button beside a finding: a dialog over Today, camera already on the building, card open. No list, no filters; just the place and its card."},
        {"id": "note-split", "x": XR, "y": 1190, "w": 460, "text": "Alternative kept for comparison: the list as a fixed column beside the map (closer to today's layout). Trade-off: the map is 300px narrower and never full-bleed, but nothing ever covers a footprint."},
    ]
    canvas = {"artboards": artboards, "annotations": notes, "launch": {"view": "canvas"}}
    with open(os.path.join(HERE, "canvas.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(canvas, f, indent=2)
    print("wrote", len(files), "artboards and canvas.json")


if __name__ == "__main__":
    main()
