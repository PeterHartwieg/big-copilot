/* --- writing to the game (docs/game-link-api.md, "Writes") -------------- */
/* In linked mode the board can change the game, and SOURCE.write() is the only
   way there: web/app.js owns the game's approval of this browser, retries a busy game and reads
   the game again after an apply. Every write goes through gwConfirm(): a dry
   run as the dialog opens, the game's verdict row by row, Apply, then Undo.
   Outside linked mode SOURCE.link is missing or answers null, and nothing here
   draws. */
const gwLink = () => (typeof SOURCE.link === "function" && SOURCE.link()) || null;
/* A mod too old for a kind of write, said on its button. */
function gwUpdateMod(kind){
  if(kind === "uniforms") return tt("nav.dlg.mod.uniforms", "Update the Big Copilot Link mod to set uniforms from here");
  if(kind === "imports") return tt("nav.dlg.mod.imports", "Update the Big Copilot Link mod to change imports from here");
  if(kind === "schedule") return tt("nav.dlg.mod.schedule", "Update the Big Copilot Link mod to write schedules from here");
  if(kind === "hire") return tt("nav.dlg.mod.hire", "Update the Big Copilot Link mod to hire and place staff from here");
  if(kind === "marketing") return tt("nav.dlg.mod.marketing", "Update the Big Copilot Link mod to set marketing from here");
  if(kind === "rent") return tt("nav.dlg.mod.rent", "Update the Big Copilot Link mod to set rent from here (version 0.6.0 or later)");
  if(kind === "wholesale") return tt("sb.wholesale.mod", "Update Big Copilot Link to version 0.7.0 or later to place wholesale orders.");
  if(kind === "streetFoodRoute") return tt("nav.dlg.mod.streetFoodRoute", "Update the Big Copilot Link mod, with Street Food running, to set routes from here");
  return tt("nav.dlg.mod.other", "Update the Big Copilot Link mod to {kind} from here", {kind});
}
/* How long an apply's Undo lasts, by the kind of write (no full stop). */
function gwUndoStays(kind){
  if(kind === "uniforms") return tt("nav.dlg.stays.uniforms", "Undo stays until your next uniform change");
  if(kind === "imports") return tt("nav.dlg.stays.imports", "Undo stays until your next imports change");
  if(kind === "schedule") return tt("nav.dlg.stays.schedule", "Undo stays until your next schedule change");
  if(kind === "hire") return tt("nav.dlg.stays.hire", "Undo stays until your next staffing step, on this game day");
  if(kind === "marketing") return tt("nav.dlg.stays.marketing", "Undo stays until your next marketing change");
  if(kind === "rent") return tt("nav.dlg.stays.rent", "Undo stays until your next rent change, on this game day");
  if(kind === "wholesale") return tt("sb.wholesale.undoStays", "Undo stays until your next wholesale order, on this game day");
  return tt("nav.dlg.stays.other", "Undo stays until your next {kind} change", {kind});
}
const gwUndoable = {};  // kind -> {spec, text, sub, character, at}: its last apply, until undone or replaced
let gwOpen = null;      // the dialog on screen
/* What a write dialog keeps between its paints, one record per dialog, read
   through gwState(dlg) (or gwOpenState() for the one on screen):
     gone(replaced)  takes the dialog down (gwDialog())
     cancel          stops this page waiting on the game's question (gwApprovalView())
     tick            the approval clock's interval (gwAsking(), gwPaint())
     want            where a keyboard's focus goes on the next paint (gwFocusKey())
     soft            the answer on screen is being asked again in place (gwConfirm())
     idle            {at, now, ask}: a "nothing to change" answer, asked again
                     once the game's hour moves on (gwIdleAgain())
     board           the board an apply or undo answered on; its "read again"
                     line turns done on a newer one (gwReadBack())
     replan          back to the write after an undo (gwConfirm(), gwUndo())
     gate            the undo's gate, weighed on every board built (gwGate())
     built           a board was built since the undo answered
     odCurrent       false, and closes the dialog, once the company it was
                     opened for is gone (odDialog())
     odWait          plans again once a missing section arrives (odDialog())
     odBoard         a new board suspends an unfinished review, except while
                     approval is pending (odBoard()) */
const gwStates = new WeakMap();
function gwState(dlg){
  let st = gwStates.get(dlg);
  if(!st) gwStates.set(dlg, st = {gone: null, cancel: null, tick: null, want: null, soft: false, idle: null,
    board: null, replan: null, gate: null, built: false, odCurrent: null, odWait: null, odBoard: null});
  return st;
}
const gwOpenState = () => gwOpen ? gwState(gwOpen) : null;
/* The open dialog's undo gate, if it has one: `built` marks a board built
   since the undo, `weigh` repaints the gate. */
function gwGate(built, weigh){
  const st = gwOpenState();
  if(!st || !st.gate) return;
  if(built) st.built = true;
  if(weigh) st.gate();
}

/* The dialogs' icons: strokes on a 24 grid, as the design draws them. */
const GW_P = {
  shirt: PATHS.shirt,
  crate: PATHS.crate,
  roster: PATHS.roster,
  game: PATHS.game,
  tank: '<ellipse cx="12" cy="5.5" rx="7" ry="2.5"></ellipse><path d="M5 5.5v13c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-13"></path><path d="M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5"></path>',
  truck: PATHS.truck,
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"></rect><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"></path>',
  tick: PATHS.tick,
  close: '<path d="M6 6l12 12M18 6L6 18"></path>',
  right: PATHS.right,
  undo: '<path d="M9 14L4 9l5-5"></path><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"></path>',
  refresh: PATHS.refresh,
  alert: PATHS.alert,
  info: '<circle cx="12" cy="12" r="8.5"></circle><path d="M12 11v5M12 8v.01"></path>',
  play: '<path d="M8 5.5v13l10.5-6.5z"></path>',
  pause: PATHS.pause,
  cap: '<path d="M4 20V8M4 8h16M20 8v12"></path><path d="M8 14h8"></path>',
  exit: PATHS.exit,
  plus: PATHS.plus,
  clock: PATHS.clock,
  flame: '<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.1 2.1-5.1 3.6-7.3.5 1.7 1.5 2.8 2.6 3.3C11.7 7.3 13 4.6 15.2 3c-.3 2.9 3.3 5.7 3.3 10.6 0 4.3-2.8 7.4-6.5 7.4z"></path>',
  key: '<circle cx="8" cy="14" r="4"></circle><path d="M11 11l9-8M16 6.5l3 3"></path>',
  plug: PATHS.plug,
  sun: PATHS.sun,
  cursor: '<path d="M5 3l14 7-6 2-2 6z"></path>',
  sofa: PATHS.sofa,
  save: '<path d="M5 4h11l3 3v13H5z"></path><path d="M8 4v5h7V4M8 20v-6h8v6"></path>',
  skip: '<path d="M6 5.5v13l9-6.5zM18 5v14"></path>',
  hire: PATHS.hire,
  phone: PATHS.phone,
  magnet: PATHS.magnet,
  tag: '<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1 1 0 0 1 0 1.4l-7.1 7.1a1 1 0 0 1-1.4 0z"></path><circle cx="8" cy="8" r="1.5"></circle>',
};
const gwSvg = (name, cls) => `<svg${cls ? ` class="${cls}"` : ""} viewBox="0 0 24 24" aria-hidden="true">${GW_P[name] || ""}</svg>`;
const gwI = name => `<span class="gw-i">${gwSvg(name)}</span>`;
/* A line with its icon: tone is warn, neg, info or ok. */
const gwCall = (tone, name, html) => `<div class="gw-call ${tone === "warn" || tone === "neg" ? `gw-${tone}` : tone}">${gwI(name)}<div>${html}</div></div>`;
/* The same, as a note that goes up to the dialog's fixed strip (gwLift()). */
const gwLiftCall = (tone, name, html) => gwCall(tone, name, html).replace('class="gw-call ', 'class="gw-call gw-lift ');
/* The wire: the board's dot, a line, the game. ask | ok | no | wait | busy | moved. */
const gwWire = state => `<span class="gw-w ${state}" aria-hidden="true"><span class="a"></span><span class="ln"></span><i class="p"></i><i class="p"></i><i class="p"></i><span class="g">${gwSvg("game")}</span></span>`;
/* The game's clock as the dialogs show it, "Sun 14:02": now, by the link's
   last health, or as this board was read. Day 1 is a Monday. */
function gwClock(day, hour, minute){
  const d = Number(day), h = Number(hour), m = Math.floor(Number(minute) || 0);
  if(!Number.isFinite(d) || !Number.isFinite(h)) return "";
  return `${navShortDay((((d - 1) % 7) + 7) % 7)} ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
const gwNow = () => { const l = gwLink() || {}; return gwClock(l.day, l.hour, l.minute); };
const gwBoardRead = () => { const m = (D && D.meta) || {}; return gwClock(m.day, m.hour, m.minute); };
/* Whose game a dry run judged: the same company again, or a dry run afresh. */
const gwWhose = () => { const l = gwLink() || {}; return `${l.character || ""}|${l.company || ""}`; };

/* A write button. None outside linked mode; with the link on but a mod that
   cannot take this kind, disabled with the reason, never hidden, and so with
   `blocked`, a reason of the board's own. `data` is the attribute markup the
   click handler reads. It wears the wire: "this changes your game" shows
   before anything opens. `o`: {count, name (the full words), alt, icon (for
   a board reason)}. */
function gwButton(kind, label, data, blocked, o = {}){
  const link = gwLink();
  if(!link) return "";
  const old = !(link.writes || []).includes(kind);
  const why = old ? gwUpdateMod(kind) : blocked || "";
  const name = o.name || label;
  /* A browser the game has not approved yet is asked on the game's screen.
     A reason the caller shows beside the button (o.shown) is not said again
     on hover. */
  const tip = why ? (o.shown && !old ? "" : why)
    : link.approved === false ? tt("nav.dlg.firstuse", "The game asks you once, on its screen, when you first use this") : "";
  return `<button type="button" class="gw-btn${o.alt ? " alt" : ""}${why ? " off" : ""}" data-gw="${kind}" ${data}${
    why ? ` aria-disabled="true"` : ""}${tip ? ` data-tip="${attr(tip)}"` : ""} aria-label="${attr(why ? tt("nav.dlg.offlabel", "{name}: {why}", {name, why}) : name)}">${
    why ? gwSvg(old ? "plug" : o.icon || "lock") : `<span class="gw-mw" aria-hidden="true"><i></i><b></b></span>`}<span class="gw-l">${label}</span>${
    o.count ? `<span class="n" aria-hidden="true">${o.count}</span>` : ""}</button>`;
}

/* Uniforms: the shops with a role to dress and a locker to dress it from. */
const gwUniformSites = () => (D.businesses || []).filter(b => (b.uniformGapSkills || []).length && !b.missingUniformLocker);
/* A finding the uniforms write answers, and what "Set for all" dresses: every
   shop such a finding names that the player has not silenced. */
const gwDressable = x => { const s = x.group === "uniform" && alertSite(x); return !!s && gwUniformSites().includes(s); };
let gwUniformAllId = null;  // the finding row that carries "Set for all"; drawAlerts() picks it
function gwUniformAll(){
  const finds = [...alertLines(), ...(alertMinor().rows || [])]
    .filter(x => gwDressable(x) && !silencedIds.has(x.id));
  return [...new Set(finds.map(alertSite))];
}
function gwUniformButtons(b, all){
  const one = gwButton("uniforms", tt("sp.gw.uni.button", "Set Default uniforms"), `data-gw-sites="${attr(JSON.stringify([b.key]))}"`);
  const sites = all ? gwUniformAll() : [];
  return one + (one && sites.length > 1 ? gwButton("uniforms", tt("sp.gw.uni.all", "Set for all {n} shops", {n: sites.length}),
    `data-gw-all data-gw-sites="${attr(JSON.stringify(sites.map(s => s.key)))}"`, "", {alt: true}) : "");
}
/* A finding silenced since the list was drawn leaves "Set for all" at once. */
function gwRelabelAll(){
  const sites = gwUniformAll();
  document.querySelectorAll("[data-gw-all]").forEach(btn => {
    if(sites.length < 2) return btn.remove();
    const label = tt("sp.gw.uni.all", "Set for all {n} shops", {n: sites.length});
    btn.querySelector(".gw-l").textContent = label;
    btn.setAttribute("aria-label", btn.getAttribute("aria-disabled") === "true" ? tt("nav.dlg.offlabel", "{name}: {why}", {name: label, why: btn.dataset.tip || ""}) : label);
    btn.dataset.gwSites = JSON.stringify(sites.map(s => s.key));
  });
}
/* The wire address is the site key taken apart: "<street>#<number>". */
const gwAddress = key => ({street: key.slice(0, key.lastIndexOf("#")), number: Number(key.slice(key.lastIndexOf("#") + 1))});
const gwKeyOf = address => address ? `${address.street}#${address.number}` : "";
const gwSiteOf = address => address && (D.businesses || []).find(b => b.key === gwKeyOf(address)) || null;
const gwSiteName = row => { const b = gwSiteOf(row.address); return spEsc(b ? shortName(b) : row.business || tt("nav.dlg.ashop", "A shop")); };
/* Where a dialog is: the shop's pill, its name and its neighbourhood. */
const gwWhere = b => b ? `${hoodHtml(b)}<span>${spEsc(baseName(b))}${b.neighbourhood ? ` · ${spEsc(hoodName(b.neighbourhood))}` : ""}</span>` : "";
/* The game's name for a skill, from wherever the payload carries one: the
   uniform gaps, then the roles of the hour grid and the staffing plan. */
function gwSkillName(skill){
  const named = (D.skillNames || {})[skill];
  if(named) return spEsc(named);
  for(const b of D.businesses || []){
    const i = (b.uniformGapSkills || []).indexOf(skill);
    if(i >= 0 && b.uniformGaps?.[i]) return spEsc(b.uniformGaps[i]);
  }
  for(const site of [...(D.hours || []), ...(D.staffing || [])])
    for(const r of site.roles || []) if(r.skill === skill && r.label) return spEsc(r.label);
  const slug = String(skill).replace(/^ba:skill_/, "");
  return spEsc(slug.charAt(0).toUpperCase() + slug.slice(1));
}

/* One uniform role as a card: dashed shirt, none now and the preset after;
   a grey shirt with a lock, one already set and kept. Done, the dialog's
   is-done ticks the cards that were dressed. */
function gwRole(name, state, preset){
  if(state === "kept" || state === "off"){
    const said = state === "kept" ? tt("sp.gw.role.kept", "has one · kept") : tt("sp.gw.role.off", "not offered here");
    return `<div class="gw-role kept" tabindex="0" data-read="${attr(state === "kept"
      ? tt("sp.gw.role.kept.read", "<b>{role}</b> has a uniform already: the write never changes it", {role: name})
      : tt("sp.gw.role.off.read", "<b>{role}</b> is not in this shop's Uniforms window", {role: name}))}"><span class="gw-shirt">${
      gwSvg("shirt")}<span class="gw-badge">${gwSvg("lock")}</span></span><div><b>${name}</b><small>${said}</small></div></div>`;
  }
  if(state === "back") return `<div class="gw-role to" tabindex="0" data-read="${attr(tt("sp.gw.role.back.read", "<b>{role}</b>: back to no uniform", {role: name}))}"><span class="gw-shirt">${
    gwSvg("shirt")}</span><div><b>${name}</b><small><span>${preset} ${gwSvg("right")}</span>${tt("sp.gw.role.none", "none")}</small></div></div>`;
  return `<div class="gw-role to" tabindex="0" data-read="${attr(tt("sp.gw.role.to.read", "<b>{role}</b>: no uniform now, <em>{preset}</em> after", {role: name, preset}))}"><span class="gw-shirt">${
    gwSvg("shirt")}<span class="gw-badge gw-tk">${gwSvg("tick")}</span></span><div><b>${name}</b><small><span class="gw-was">${tt("sp.gw.role.none", "none")} ${
    gwSvg("right")}</span><span class="gw-now">${gwSvg("tick")}</span><em>${preset}</em></small></div></div>`;
}
/* The game's uniforms as pills: one is the usual case, and says so. */
function gwPresets(answer, on){
  const ps = (answer.presets || []).filter(p => p && p.id !== undefined);
  if(!ps.length) return "";
  if(ps.length === 1) return `<div class="gw-pick"><span class="gw-presets" aria-label="${attr(tt("sp.gw.uni.label", "Uniform"))}"><span class="gw-preset only"><span class="ic">${
    gwSvg("shirt")}</span>${spEsc(ps[0].name)}</span></span></div>`;
  return `<div class="gw-pick"><span class="nx-sr" id="gwPresetLab">${tt("sp.gw.uni.label", "Uniform")}</span><span class="gw-presets" role="group" aria-labelledby="gwPresetLab">${
    ps.map(p => `<button type="button" class="gw-preset" aria-pressed="${p.id === on ? "true" : "false"}" data-gw-preset="${attr(p.id)}"><span class="ic">${
      gwSvg("shirt")}</span>${spEsc(p.name)}</button>`).join("")}</span></div>`;
}

/* Uniforms at one shop, or at every shop the alert names. The game sets all
   of them or none, so a shop it refuses can be left out: the dialog asks the
   game again without it. */
function gwUniforms(keys){
  const sites = keys.map(k => (D.businesses || []).find(b => b.key === k)).filter(Boolean);
  if(!sites.length) return;
  const many = sites.length > 1;
  const out = new Set();  // shops left out
  let presetId = null;
  const kept = () => sites.filter(b => !out.has(b.key));
  const presetOf = answer => spEsc((answer.rows || []).find(r => r.presetName)?.presetName || tt("sp.gw.uni.default", "Default"));
  const toSet = answer => (answer.rows || []).reduce((n, r) => n + (r.set || []).length, 0);
  const refusal = r => {
    const known = GW_REFUSE.uniforms[r.error] || GW_REFUSE.any[r.error];
    return known || {rule: tt("sp.gw.uni.refused", "The game refused this ({code})", {code: spEsc(r.error)}), fix: ""};
  };
  /* A row a shop, a small shirt a role: outlined gets the uniform, grey keeps its own. */
  const shopRow = (r, phase) => {
    const b = gwSiteOf(r.address), key = gwKeyOf(r.address);
    const name = gwSiteName(r), preset = spEsc(r.presetName || tt("sp.gw.uni.default", "Default"));
    const set = r.set || [], skipped = (r.skipped || []).map(s => s.skill);
    const minis = [...set.map(s => ["to", s]), ...skipped.map(s => ["k", s])].map(([k, s], i) =>
      `<i class="${k === "k" ? "k" : ""}" style="--k:${i}">${gwSvg(k !== "k" && phase === "done" ? "tick" : "shirt")}</i>`).join("");
    const roles = `${set.length ? `${set.map(gwSkillName).join(", ")} <em>${phase === "undone" ? tt("sp.gw.uni.tonone", "→ none") : `→ ${preset}`}</em>`
      : tt("sp.gw.uni.nothing", "nothing to set")}${
      skipped.length ? ` · ${tt("sp.gw.uni.kept", "{roles} kept", {roles: skipped.map(gwSkillName).join(", ")})}` : ""}`;
    const read = `<b>${name}</b> · ${roles}`;
    const say = r.error ? refusal(r) : null;
    return `<div class="gw-shop${r.error ? " bad" : ""}" tabindex="0" data-read="${attr(read)}"><div class="nm">${b ? hoodHtml(b) : ""}<span>${name}</span></div><span class="gw-sr">: ${roles}</span>${
      `<span class="gw-minis" aria-hidden="true">${minis}</span><span class="c">${r.error ? "" : set.length}</span>`}${say ? `<div class="gw-why"><span><b>${
      say.rule}</b>.${say.fix ? ` ${say.fix}` : ""}</span>${phase === "ready" && kept().length > 1 ? `<button type="button" class="gw-mini-b" data-gw-leave="${
      attr(key)}" aria-label="${attr(tt("sp.gw.uni.leave.label", "Leave it out: {name}", {name: b ? shortName(b) : r.business || tt("sp.gw.uni.thisshop", "this shop")}))}">${
      gwSvg("skip")}${tt("sp.gw.uni.leave", "Leave it out")}</button>` : ""}</div>` : ""}</div>`;
  };
  const outRow = b => `<div class="gw-shop out"><div class="nm">${hoodHtml(b)}<span>${spEsc(shortName(b))}</span></div><span class="gw-minis"></span><span class="c">${tt("sp.gw.uni.out", "out")}</span></div>`;
  /* The records this write made (docs/architecture.md, "Progress: marked,
     applied, confirmed"): Applied from its answer, Confirmed by a later board;
     its undo takes them back. */
  let written = [];
  gwConfirm({
    kind: "uniforms", icon: "shirt", againLabel: tt("sp.gw.uni.again", "Set again"),
    onDone: answer => { written = pgUniformDone(answer); },
    onUndo: () => { pgDrop(written); written = []; pgUniformStale(); },
    title: () => many ? tt("sp.gw.uni.title.many", "Set uniforms at {n} shops", {n: kept().length}) : tt("sp.gw.uni.title", "Set uniforms"),
    where: () => !many ? gwWhere(sites[0])
      : out.size ? `<span>${tt("sp.gw.uni.leftout", "{names} left out", {names: [...out].map(k => spEsc(shortName(sites.find(b => b.key === k)))).join(", ")})}</span>`
      : `<span>${tt("sp.gw.uni.every", "Every shop the alert names")}</span>`,
    /* skills null: every skill the shop's Uniforms window offers, not only the
       roles on shift now, so the warning cannot come back with the roster. */
    body: () => ({sites: kept().map(b => ({address: gwAddress(b.key), skills: null, presetId}))}),
    verdict: answer => {
      const bad = (answer.rows || []).filter(r => r.error).length, n = toSet(answer);
      if(bad) return many ? `<b>${tt("sp.gw.uni.refuses", "The game refuses {n} of {of} shops", {n: bad, of: (answer.rows || []).length})}</b>`
        : `<b>${tt("sp.gw.refuses", "The game refuses this")}</b>`;
      return n ? `<b>${tt("sp.gw.uni.dress", {one: "The game will dress {n} role", other: "The game will dress {n} roles"}, {n})}</b>`
        : `<b>${tt("sp.gw.uni.dressed", "Every role already has a uniform")}</b>`;
    },
    /* The refused shops say why in their own row. */
    inline: many,
    draw: (answer, phase) => {
      const rows = answer.rows || [];
      const preset = presetOf(answer);
      const pick = phase === "ready" && !answer.undo ? gwPresets(answer, presetId ?? rows.find(r => r.presetId)?.presetId) : "";
      if(!many){
        const r = rows[0] || {};
        const cards = [...(r.set || []).map(s => gwRole(gwSkillName(s), phase === "undone" ? "back" : "to", preset)),
          ...(r.skipped || []).map(s => gwRole(gwSkillName(s.skill), s.reason === "already_set" ? "kept" : "off", preset))];
        // A kept role is said where there is one; the cards show the rest.
        const kept = (r.skipped || []).some(s => s.reason === "already_set");
        const lead = phase === "ready" && kept ? `<p class="gw-lead">${tt("sp.gw.uni.keptlead", "One already set stays as it is.")}</p>` : "";
        return lead + pick + (cards.length ? `<div data-readzone><div class="gw-roles">${cards.join("")}</div><div class="gw-read sp-readout">&nbsp;</div></div>` : "");
      }
      const set = toSet(answer), keptN = rows.reduce((n, r) => n + (r.skipped || []).length, 0);
      const bad = rows.filter(r => r.error).length;
      const tally = phase === "ready" ? `<div class="gw-tally"><div><span class="gw-lab">${tt("sp.gw.uni.get", "Get {preset}", {preset})}</span><span class="gw-big">${gwSvg("shirt")}${set}</span></div>
        <div><span class="gw-lab">${tt("sp.gw.uni.keptlab", "Kept")}</span><span class="gw-big dim">${gwSvg("lock")}${keptN}</span></div>
        <div><span class="gw-lab">${tt("sp.gw.uni.shops", "Shops")}</span><span class="gw-big dim">${rows.length - bad}${bad ? `<small>+${bad}</small>` : ""}</span></div></div>` : "";
      return pick + tally + `<div data-readzone><div class="gw-shops">${rows.map(r => shopRow(r, phase)).join("")}${
        [...out].map(k => sites.find(b => b.key === k)).filter(Boolean).map(outRow).join("")}</div><div class="gw-read sp-readout">&nbsp;</div></div>`;
    },
    refusedHint: answer => many ? tt("sp.gw.uni.refusedmany", "Every shop is set, or none: leave a refused shop out, or fix it first.") : tt("sp.gw.unchanged", "Nothing was changed."),
    bind: (dlg, replan) => {
      dlg.querySelectorAll("[data-gw-preset]").forEach(b => { b.onclick = () => {
        if(b.getAttribute("aria-pressed") === "true" || b.classList.contains("gw-busy")) return;
        presetId = b.dataset.gwPreset;
        /* Said at once on the pill; the rest waits for the game's answer. */
        dlg.querySelectorAll("[data-gw-preset]").forEach(x => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
        replan(b);
      }; });
      dlg.querySelectorAll("[data-gw-leave]").forEach(b => { b.onclick = () => {
        if(b.classList.contains("gw-busy")) return;
        out.add(b.dataset.gwLeave);
        const row = b.closest(".gw-shop");
        if(row) row.classList.add("out");
        replan(b);
      }; });
    },
    object: gwSiteName,
    applyLabel: answer => { const n = answer ? toSet(answer) : 0;
      return n ? tt("sp.gw.uni.apply", {one: "Set {n} uniform", other: "Set {n} uniforms"}, {n}) : tt("sp.gw.uni.title", "Set uniforms"); },
    applying: tt("sp.gw.uni.applying", "Setting uniforms in the game…"),
    undoHint: () => many && kept().length > 1 ? tt("sp.gw.uni.undohint", "Undo takes back all {n} shops at once.", {n: kept().length}) : null,
    changed: answer => (answer.rows || []).some(r => (r.set || []).length),
    done: answer => {
      const rows = (answer.rows || []).filter(r => (r.set || []).length);
      const n = rows.reduce((s, r) => s + r.set.length, 0);
      if(answer.undo) return n ? tt("sp.gw.uni.undone", {one: "Undone: {n} role back to no uniform.", other: "Undone: {n} roles back to no uniform."}, {n})
        : tt("sp.gw.undone", "Undone.");
      if(!n) return tt("sp.gw.uni.none", "Nothing to set: every role already has a uniform.");
      return rows.length === 1
        ? tt("sp.gw.uni.done.one", {one: "{preset} is on {n} role at {shop}.", other: "{preset} is on {n} roles at {shop}."}, {preset: presetOf(answer), n, shop: gwSiteName(rows[0])})
        : tt("sp.gw.uni.done.many", {one: "{preset} is on {n} role at {shops} shops.", other: "{preset} is on {n} roles at {shops} shops."}, {preset: presetOf(answer), n, shops: rows.length});
    },
  });
}

/* Marketing: the cheapest campaign mix (docs/dashboard-reference.md, Promotion). Each
   shop's and office's marketingPlan comes from Python: `on`, the mix to run,
   and `was`, what runs now, both as the game's enum names. A write sends both,
   and also adds whatever BizMan needs to show every switch (`needsSetup`).
   Peter's rule: a switch the site already has flips at any time; only a new
   one needs its agency to be a phone contact and open (`agencies`). */
function gwMkName(type){
  switch(type){
    case "SmallInternet": return tt("sp.mk.type.smallinternet", "Small internet");
    case "MediumInternet": return tt("sp.mk.type.mediuminternet", "Medium internet");
    case "LargeInternet": return tt("sp.mk.type.largeinternet", "Large internet");
    case "SmallBillboard": return tt("sp.mk.type.smallbillboard", "Small billboard");
    case "MediumBillboard": return tt("sp.mk.type.mediumbillboard", "Medium billboard");
    case "LargeBillboard": return tt("sp.mk.type.largebillboard", "Large billboard");
  }
  return spEsc(type);
}
const gwMkMix = types => types.length ? types.map(gwMkName).join(" + ") : tt("sp.mk.none", "no campaigns");
const gwMkSame = p => !!p.on && p.on.length === p.was.length && p.on.every(t => p.was.includes(t));
/* A plan's promotion line, as _alerts() splits them: "raise", a plan that
   raises promotion (or costs more to), else "save", one that only saves. */
const gwMkLine = p => p.promotionPlan > p.promotionNow || p.costPlan > p.costNow ? "raise" : "save";
/* The line a promotion finding is, by its sentence's key; null for a
   "Visit … once" line, which has no mix to set. */
const gwMkLineOf = a => {
  const key = ovKey(a);
  return /^f\.promotion\.(reach|gain)\./.test(key) ? "raise" : /^f\.promotion\.save\./.test(key) ? "save" : null;
};
/* The sites a marketing write is for: `mix`, every one whose plan differs
   from what runs (of one promotion line, when `line` names it), less the
   ones not trading yet (b.notTrading), which the promotion finding leaves to
   their own; `setup`, every one missing a switch in BizMan, a new site above
   all. A site with no plan (no switch, no agency a phone contact) is in
   neither. */
const gwMkWants = (mode, line = null) => (D.businesses || []).filter(b => {
  const p = b.marketingPlan;
  if(!p || !p.on) return false;
  if(mode === "setup") return !!p.needsSetup;
  return !gwMkSame(p) && b.notTrading === undefined && (!line || gwMkLine(p) === line);
});
/* Of those, the ones the game takes now: a plan that only flips switches the
   site has, always; one that needs new switches, when every agency adding
   them can now; a set-up, while at least one agency it adds from can. */
const gwMkReady = b => {
  const p = b.marketingPlan;
  if(!gwMkSame(p)) return !gwMkBlocked(p.agencies || []).length;
  const from = [...new Set(p.setupAgencies || [])];
  return gwMkBlocked(from).length < from.length;
};
const gwMkSites = (mode, line = null) => gwMkWants(mode, line).filter(gwMkReady);
const gwMkCan = () => { const l = gwLink(); return !!l && (l.writes || []).includes("marketing"); };
/* The agencies (payload marketingAgencies), and whether one is open: the
   game's own rule (open_at() in Python) at the game's clock now, as the link
   last read it, else as the board was read. */
const gwMkAgency = key => (D.marketingAgencies || []).find(a => a.key === key) || null;
function gwMkClock(){
  const l = gwLink(), m = (D && D.meta) || {};
  const day = Number(l ? l.day : m.day), hour = Math.floor(Number(l ? l.hour : m.hour));
  return Number.isFinite(day) && Number.isFinite(hour) ? {day, hour} : null;
}
const gwMkOpenAt = (a, day, hour) => !a.closed && ((a.hours || [])[((day % 7) + 7) % 7] || []).some(([s, e]) => s <= hour && hour < e);
function gwMkNext(a, c){
  if(a.closed) return null;
  for(let k = 0; k < 8 * 24; k++){
    const day = c.day + Math.floor((c.hour + k) / 24), hour = (c.hour + k) % 24;
    if(gwMkOpenAt(a, day, hour)) return {day, hour};
  }
  return null;
}
/* The agencies among `keys` that cannot add a switch now: unknown to the
   board, not a phone contact, or shut at the game's clock. */
function gwMkBlocked(keys){
  const c = gwMkClock();
  return [...new Set(keys)].filter(k => {
    const a = gwMkAgency(k);
    return !a || !a.contact || (!!c && !gwMkOpenAt(a, c.day, c.hour));
  });
}
/* Why they cannot, in one short line: "Visit CityAds once", "CityAds opens
   Tuesday at 8:00", "Agencies open at 8:00". */
function gwMkWhy(keys){
  const blocked = gwMkBlocked(keys).map(gwMkAgency);
  if(!blocked.length) return "";
  const strangers = blocked.filter(a => a && !a.contact);
  if(strangers.length) return tt("sp.mk.why.visit", "Visit {agency} once", {agency: todayList(strangers.map(a => spEsc(a.name)))});
  if(blocked.some(a => !a)) return tt("sp.mk.why.none", "No agency can add these switches");
  const c = gwMkClock(), by = new Map();
  blocked.forEach(a => {
    const next = c ? gwMkNext(a, c) : null, k = next ? `${next.day}|${next.hour}` : "";
    if(!by.has(k)) by.set(k, {next, names: []});
    by.get(k).names.push(spEsc(a.name));
  });
  return [...by.values()].map(({next, names}) => {
    const one = names.length === 1, o = {agency: names[0], h: next ? next.hour : 0, d: next ? next.day % 7 : 0};
    if(!next) return one ? tt("sp.mk.why.shut", "{agency} is closed", o) : tt("sp.mk.why.shutall", "The agencies are closed");
    if(next.day === c.day) return one ? tt("sp.mk.why.opens", "{agency} opens at {h}:00", o) : tt("sp.mk.why.open", "Agencies open at {h}:00", o);
    return one ? tt("sp.mk.why.opens.day", "{agency} opens {d:day} at {h}:00", o) : tt("sp.mk.why.open.day", "Agencies open {d:day} at {h}:00", o);
  }).join(" · ");
}
/* "Visit CityAds (5 Second Avenue) once": the agencies a site's plan waits on. */
const gwMkVisit = keys => todayList(keys.map(gwMkAgency).filter(Boolean).map(a =>
  tt("sp.mk.agency", "{agency} ({address})", {agency: spEsc(a.name), address: spEsc(a.address || "")})));
/* The Promotion block's last line: the plan, and its Set button with, when it
   waits, why. Where the board cannot write it, what to switch in BizMan. */
/* What to switch in BizMan for a site's cheapest mix, where the board cannot
   write it. BizMan shows a switch only for a type the site already has an
   entry for; any other is booked at a marketing agency. */
function gwMkHand(b){
  const p = b.marketingPlan;
  if(!p || !p.on) return "";
  const entered = new Set((b.campaigns || []).map(c => c.type));
  const add = p.on.filter(t => !p.was.includes(t));
  const on = add.filter(t => entered.has(t)).map(gwMkName), visit = add.filter(t => !entered.has(t)).map(gwMkName);
  const off = p.was.filter(t => !p.on.includes(t)).map(gwMkName);
  const flip = on.length && off.length ? tt("sp.mk.hand.both", "In BizMan › Marketing, switch on {on} and switch off {off}.", {on: todayList(on), off: todayList(off)})
    : on.length ? tt("sp.mk.hand.on", "In BizMan › Marketing, switch on {on}.", {on: todayList(on)})
    : off.length ? tt("sp.mk.hand.off", "In BizMan › Marketing, switch off {off}.", {off: todayList(off)}) : "";
  const book = visit.length ? tt("sp.mk.hand.visit", "Book {types} at a marketing agency: BizMan has no switch for them yet.", {types: todayList(visit)}) : "";
  return [flip, book].filter(Boolean).join(" ");
}
function spMkLine(b){
  const p = b.marketingPlan;
  if(p?.unavailable) return `<div class="spmk"><p>${tt("sp.mk.unavailable", "Campaign planning is unavailable because the model does not match this save. Refresh from the game or check for a dashboard update.")}</p></div>`;
  if(!p) return "";
  /* No agency is a phone contact yet: the plan waits on a first visit. */
  if(!p.on) return p.visit.length ? `<div class="spmk"><p>${tt("sp.mk.novisit2", "Visit {agencies} once to book campaigns.", {agencies: gwMkVisit(p.visit)})}</p></div>` : "";
  const same = gwMkSame(p);
  const mix = `<b>${gwMkMix(p.on)}</b>`;
  const line = same ? tt("sp.mk.running", "Cheapest mix, running: {mix} · {cost:$}/day", {mix, cost: p.costPlan})
    : tt("sp.mk.line", "Cheapest mix: {mix} · {cost:$}/day · {p}%", {mix, cost: p.costPlan, p: p.promotionPlan});
  /* A better mix needs an agency not in the phone's contacts yet. */
  const better = p.visit.length ? tt("sp.mk.better2", "Visit {agencies} once for a better mix.", {agencies: gwMkVisit(p.visit)}) : "";
  const can = gwMkCan();
  const hand = same || can ? "" : gwMkHand(b);
  /* Switches the site has flip at any time. The button waits only while a
     new switch the plan needs has no agency to add it now, and a set-up
     only while none of its agencies can; the line beside it says why. */
  const from = [...new Set(p.setupAgencies || [])];
  const why = !can ? "" : !same ? gwMkWhy(p.agencies || [])
    : from.length && gwMkBlocked(from).length === from.length ? gwMkWhy(from) : "";
  const sites = `data-gw-sites="${attr(JSON.stringify([b.key]))}"`;
  const btn = !same ? gwButton("marketing", tt("sp.mk.set", "Set"), `${sites} data-gw-mode="mix"`, why, {name: tt("sp.mk.set.name", "Set the cheapest mix"), icon: "clock", shown: true})
    : p.needsSetup ? gwButton("marketing", tt("sp.mk.setup", "Set up"), `${sites} data-gw-mode="setup"`, why, {alt: true, icon: "clock", shown: true,
      name: can && !why && gwMkBlocked(from).length ? tt("sp.mk.setup.now", "Add the campaign switches open agencies can add now")
        : tt("sp.mk.setup.name", "Add every campaign switch to BizMan")})
    : "";
  const notes = [hand, better].filter(Boolean).map(t => `<p class="spmk-hand">${t}</p>`).join("");
  return `<div class="spmk"><p>${line}</p>${notes}${btn ? `<div class="gw-acts gw-panel">${btn}${
    why ? `<span class="spmk-why" aria-hidden="true">${why}</span>` : ""}</div>` : ""}</div>`;
}
/* Every site at once: the cheapest mix wherever it differs, or the set-up
   wherever a switch is missing. It counts only the sites the game takes now;
   with none, it waits and says why. */
function gwMkAll(mode, alt, line = null){
  const wants = gwMkWants(mode, line);
  if(!wants.length) return "";
  const ready = wants.filter(gwMkReady), n = ready.length || wants.length;
  const label = mode === "setup" ? tt("sp.gw.mk.setupall", {one: "Set up {n} site", other: "Set up all {n} sites"}, {n})
    : tt("sp.gw.mk.all", {one: "Set the cheapest mix at {n} site", other: "Set the cheapest mix at {n} sites"}, {n});
  const why = ready.length || !gwMkCan() ? ""
    : gwMkWhy(wants.flatMap(b => gwMkSame(b.marketingPlan) ? b.marketingPlan.setupAgencies || [] : b.marketingPlan.agencies || []));
  return gwButton("marketing", label, `data-gw-mk-all data-gw-mode="${mode}"${line ? ` data-gw-mk-line="${line}"` : ""}`, why, {alt, icon: "clock"});
}
/* The game's clock moved (web/app.js reads it with every /health): where an
   agency opened or shut since the page was drawn, the pages on screen are
   drawn again, so the marketing buttons follow the game's hour. */
let gwMkSig = "";
function gwMkOpenSig(){
  const c = gwMkClock();
  return [...((D && D.marketingAgencies) || []), ...((D && D.wholesale?.suppliers) || [])].map(a => c && gwMkOpenAt(a, c.day, c.hour) ? "1" : "0").join("");
}
function gwMkTick(){
  if(!hasData()) return;
  gwIdleAgain();
  const sig = gwMkOpenSig();
  if(sig === gwMkSig) return;
  gwMkSig = sig;
  renderCalm(true);
}

/* Campaigns at one site, or at many. The game sets all of them or none, so a
   site it refuses can be left out, as with uniforms. */
function gwMarketing(keys, mode){
  const out = new Set();  // sites left out
  const many = keys.length > 1;
  const setup = mode === "setup";
  const site = k => (D.businesses || []).find(b => b.key === k && b.marketingPlan && !b.marketingPlan.unavailable);
  const kept = () => keys.filter(k => !out.has(k)).map(site).filter(Boolean);
  /* The plans the game last judged, so the drawing stays with its answer
     while the board reads the game again after an apply. */
  let judged = new Map();
  const plan = r => judged.get(gwKeyOf(r.address));
  const moved = answer => (answer.rows || []).filter(r => !r.error && plan(r) && !gwMkSame(plan(r)));
  const sellerOf = (p, t) => (p.setupAgencies || []).find(k => ((gwMkAgency(k) || {}).types || []).includes(t)) || "";
  /* The switches a row adds: the game's entriesAdded, else (an older mod)
     the board's reckoning, the missing ones an agency can add now. A refused
     row adds nothing. */
  const added = r => {
    if(r.error) return [];
    if(Array.isArray(r.entriesAdded)) return r.entriesAdded.slice();
    const p = plan(r) || {}, blocked = new Set(gwMkBlocked(p.setupAgencies || []));
    return (p.setupTypes || []).filter(t => !blocked.has(sellerOf(p, t)));
  };
  /* The switches that come later, each with what it waits for: the answer's
     `waiting`, the game's own word (a first visit, an opening hour, a
     reopening); from an older mod, the board's reckoning by its clock.
     `at` is the opening as {day, hour}, for the earliest. */
  const waitList = r => {
    if(r.error) return [];
    if(Array.isArray(r.waiting)) return r.waiting.filter(w => w && w.type).map(w => {
      const known = w.agency && w.agency.address ? gwMkAgency(gwKeyOf(w.agency.address)) : null;
      return {type: w.type, agency: gwMkAgencyOf({agency: w.agency}), opens: w.opens ? gwMkOpensOf({opens: w.opens}) : null, at: w.opens || null,
        why: w.opens ? "open" : !known ? "" : !known.contact ? "visit" : known.closed ? "reopen" : ""};
    });
    const p = plan(r) || {}, got = added(r), blocked = new Set(gwMkBlocked(p.setupAgencies || [])), c = gwMkClock();
    return (p.setupTypes || []).filter(t => !got.includes(t) && blocked.has(sellerOf(p, t))).map(t => {
      const a = gwMkAgency(sellerOf(p, t)), at = a && c ? gwMkNext(a, c) : null;
      return {type: t, agency: spEsc((a || {}).name || ""), opens: at ? gwMkOpensOf({opens: at}) : null, at, why: at ? "open" : ""};
    });
  };
  /* A row's short clause for them: "3 switches later, Tuesday 8:00". */
  const later = r => {
    const by = new Map();
    waitList(r).forEach(w => {
      const k = w.why === "open" ? `open|${w.opens.d}|${w.opens.h}` : `${w.why}|${w.why ? w.agency : ""}`;
      if(!by.has(k)) by.set(k, {why: w.why, agency: w.agency, opens: w.opens, n: 0});
      by.get(k).n++;
    });
    return [...by.values()].map(({why, agency, opens, n}) => {
      const o = {n, agency};
      if(why === "visit") return tt("sp.gw.mk.later.visit", {one: "{n} switch later: first visit to {agency}", other: "{n} switches later: first visit to {agency}"}, o);
      if(why === "reopen") return tt("sp.gw.mk.later.reopen", {one: "{n} switch later, when {agency} reopens", other: "{n} switches later, when {agency} reopens"}, o);
      if(why === "open") return opens.d === null
        ? tt("sp.gw.mk.later.at", {one: "{n} switch later, {h}:00", other: "{n} switches later, {h}:00"}, Object.assign(o, {h: opens.h}))
        : tt("sp.gw.mk.later.day", {one: "{n} switch later, {d:day} {h}:00", other: "{n} switches later, {d:day} {h}:00"}, Object.assign(o, {h: opens.h, d: opens.d}));
      return tt("sp.gw.mk.later", {one: "{n} switch later", other: "{n} switches later"}, o);
    }).join(" · ");
  };
  const okRows = answer => (answer.rows || []).filter(r => !r.error && plan(r));
  const addedN = answer => okRows(answer).reduce((n, r) => n + added(r).length, 0);
  const laterN = answer => okRows(answer).reduce((n, r) => n + waitList(r).length, 0);
  /* A dry run that would switch nothing and add nothing: one line, and no
     Apply (gwConfirm's `idle`). When it can change, if the answer says. */
  const idle = answer => {
    if(!okRows(answer).length || moved(answer).length || addedN(answer)) return "";
    const waits = okRows(answer).flatMap(waitList);
    if(!waits.length) return tt("sp.gw.mk.idle.none", "Nothing to change: every switch is in BizMan already");
    if(waits.every(w => w.why === "visit"))
      return tt("sp.gw.mk.idle.visit", "Nothing can change before a first visit to {agency}", {agency: todayList([...new Set(waits.map(w => w.agency))])});
    if(waits.every(w => w.why === "reopen"))
      return tt("sp.gw.mk.idle.reopen", "Nothing can change before {agency} reopens", {agency: todayList([...new Set(waits.map(w => w.agency))])});
    if(!waits.every(w => w.why === "open" && w.at)) return tt("sp.gw.mk.idle.wait", "Nothing can change now: no agency can add these switches");
    const when = w => Number(w.at.day) * 24 + Number(w.at.hour);
    const first = waits.reduce((a, w) => when(w) < when(a) ? w : a);
    const names = [...new Set(waits.filter(w => when(w) === when(first)).map(w => w.agency))];
    const o = {agency: names[0], h: first.opens.h, d: first.opens.d};
    if(names.length === 1) return o.d === null ? tt("sp.gw.mk.idle.at", "Nothing can change before {h}:00, when {agency} opens", o)
      : tt("sp.gw.mk.idle.day", "Nothing can change before {d:day} at {h}:00, when {agency} opens", o);
    return o.d === null ? tt("sp.gw.mk.idle.atall", "Nothing can change before {h}:00, when the agencies open", o)
      : tt("sp.gw.mk.idle.dayall", "Nothing can change before {d:day} at {h}:00, when the agencies open", o);
  };
  const first = site(keys[0]);
  if(!first) return;
  const refusal = r => {
    const known = GW_REFUSE.marketing[r.error] || GW_REFUSE.any[r.error];
    return (typeof known === "function" ? known(r) : known) || {rule: tt("sp.gw.uni.refused", "The game refused this ({code})", {code: spEsc(r.error)}), fix: ""};
  };
  const row = (r, phase) => {
    const b = gwSiteOf(r.address), p = plan(r), key = gwKeyOf(r.address);
    if(!p) return "";
    const back = phase === "undone", same = gwMkSame(p), got = added(r);
    /* A site on its plan says only what it adds; the rest is the cost column. */
    const main = !same ? `${gwMkMix(back ? p.on : p.was)} <em>→ ${gwMkMix(back ? p.was : p.on)}</em>`
      : !back && got.length ? tt("sp.gw.mk.plus", {one: "+{n} switch", other: "+{n} switches"}, {n: got.length}) : "";
    const change = [main, back ? "" : later(r)].filter(Boolean).join(" · ") || (back ? tt("sp.gw.mk.nochange", "no change")
      : r.error ? tt("sp.gw.mk.setupplan", "missing switches only") : tt("sp.gw.mk.nothing2", "nothing to add"));
    const cost = same ? tt("sp.gw.mk.perday", "{w:$}/day", {w: p.costNow})
      : tt("sp.gw.mk.costs", "{a:$} → {b:$}/day", {a: back ? p.costPlan : p.costNow, b: back ? p.costNow : p.costPlan});
    /* The game's own reckoning, before and after an apply; said only where
       it is not what the board planned. */
    const total = r.promotion && Number(r.promotion.total);
    const game = (phase === "ready" || phase === "done") && !r.error && !same && Number.isFinite(total) && total !== p.promotionPlan
      ? ` · ${tt("sp.gw.mk.game", "the game says {p}%", {p: total})}` : "";
    /* The read-out adds what the row does not show: the promotion it moves. */
    const read = !same && p.promotionNow !== p.promotionPlan
      ? tt("sp.gw.mk.read", "Promotion {a}% → {b}%", {a: back ? p.promotionPlan : p.promotionNow, b: back ? p.promotionNow : p.promotionPlan}) : "";
    const say = r.error ? refusal(r) : null;
    const name = gwSiteName(r);
    return `<div class="gw-shop gw-mkrow${r.error ? " bad" : ""}"${read ? ` tabindex="0" data-read="${attr(read)}"` : ""}><div class="nm">${b ? hoodHtml(b) : ""}<span>${name}</span></div>${
      `<span class="gw-mk">${change}${game}</span><span class="c">${cost}</span>`}${say ? `<div class="gw-why"><span><b>${say.rule}</b>.${say.fix ? ` ${say.fix}` : ""}</span>${
      phase === "ready" && kept().length > 1 ? `<button type="button" class="gw-mini-b" data-gw-leave="${attr(key)}" aria-label="${
      attr(tt("sp.gw.mk.leave.label", "Leave it out: {name}", {name: b ? shortName(b) : r.business || tt("sp.gw.mk.thissite", "this site")}))}">${
      gwSvg("skip")}${tt("sp.gw.uni.leave", "Leave it out")}</button>` : ""}</div>` : ""}</div>`;
  };
  const outRow = b => `<div class="gw-shop out"><div class="nm">${hoodHtml(b)}<span>${spEsc(shortName(b))}</span></div><span class="gw-minis"></span><span class="c">${tt("sp.gw.uni.out", "out")}</span></div>`;
  const title = () => {
    const n = kept().length;
    if(setup) return many ? tt("sp.gw.mk.title.setupmany", {one: "Set up marketing at {n} site", other: "Set up marketing at {n} sites"}, {n})
      : tt("sp.gw.mk.title.setup", "Set up marketing");
    return many ? tt("sp.gw.mk.title.many", {one: "Set the cheapest mix at {n} site", other: "Set the cheapest mix at {n} sites"}, {n})
      : tt("sp.gw.mk.title", "Set the cheapest mix");
  };
  gwConfirm({
    kind: "marketing", icon: "magnet", againLabel: tt("sp.gw.mk.again", "Set again"),
    title,
    where: () => !many ? gwWhere(first)
      : out.size ? `<span>${tt("sp.gw.uni.leftout", "{names} left out", {names: [...out].map(k => spEsc(shortName(site(k) || {name: k}))).join(", ")})}</span>` : "",
    nothing: () => kept().length ? "" : tt("sp.gw.mk.nothing", "No site left to set."),
    body: () => {
      const sites = kept();
      judged = new Map(sites.map(b => [b.key, b.marketingPlan]));
      return {sites: sites.map(b => ({address: gwAddress(b.key), on: b.marketingPlan.on.slice(), was: b.marketingPlan.was.slice(),
        prediction: {dailyCost: b.marketingPlan.costPlan, marketing: b.marketingPlan.marketingPlan, total: b.marketingPlan.promotionPlan}}))};
    },
    learn: answer => {
      for(const r of answer.rows || []){
        const p = judged.get(gwKeyOf(r.address));
        if(!r.error && p && (!Number.isFinite(r.dailyCost) || Math.abs(r.dailyCost - p.costPlan) > 0.005 || !r.promotion ||
            r.promotion.marketing !== p.marketingPlan || r.promotion.total !== p.promotionPlan)){
          r.error = "changed";
          answer.ok = false;
        }
      }
    },
    idle,
    idleAt: () => { const c = gwMkClock(); return c ? `${c.day}|${c.hour}` : ""; },
    verdict: answer => {
      const rows = answer.rows || [], bad = rows.filter(r => r.error).length, n = moved(answer).length;
      if(bad) return many ? `<b>${tt("sp.gw.mk.refuses", "The game refuses {n} of {of} sites", {n: bad, of: rows.length})}</b>`
        : `<b>${tt("sp.gw.refuses", "The game refuses this")}</b>`;
      const k = addedN(answer);
      return n ? `<b>${tt("sp.gw.mk.change", {one: "The game will change the campaigns at {n} site", other: "The game will change the campaigns at {n} sites"}, {n})}</b>`
        : k ? `<b>${tt("sp.gw.mk.switches", {one: "The game will add {n} switch", other: "The game will add {n} switches"}, {n: k})}</b>`
        : `<b>${tt("sp.gw.mk.noneneeded", "No switches to add")}</b>`;
    },
    inline: many,
    draw: (answer, phase) => {
      const rows = answer.rows || [];
      const ok = rows.filter(r => !r.error && plan(r));
      const sum = f => ok.reduce((s, r) => s + (plan(r)[f] || 0), 0);
      const tally = many && phase === "ready" ? `<div class="gw-tally"><div><span class="gw-lab">${tt("sp.gw.mk.now", "Now, a day")}</span><span class="gw-big dim">${fmt(sum("costNow"))}</span></div>
        <div><span class="gw-lab">${tt("sp.gw.mk.after", "After, a day")}</span><span class="gw-big">${fmt(sum("costPlan"))}</span></div>
        <div><span class="gw-lab">${tt("sp.gw.mk.sites", "Sites")}</span><span class="gw-big dim">${ok.length}${rows.length > ok.length ? `<small>+${rows.length - ok.length}</small>` : ""}</span></div></div>` : "";
      return tally + `<div data-readzone><div class="gw-shops">${rows.map(r => row(r, phase)).join("")}${
        [...out].map(site).filter(Boolean).map(outRow).join("")}</div><div class="gw-read sp-readout">&nbsp;</div></div>`;
    },
    refusedHint: () => many ? tt("sp.gw.mk.refusedmany", "Every site is set, or none: leave a refused site out, or fix it first.") : tt("sp.gw.unchanged", "Nothing was changed."),
    bind: (dlg, replan) => {
      dlg.querySelectorAll("[data-gw-leave]").forEach(b => { b.onclick = () => {
        if(b.classList.contains("gw-busy")) return;
        out.add(b.dataset.gwLeave);
        const r = b.closest(".gw-shop");
        if(r) r.classList.add("out");
        replan(b);
      }; });
    },
    object: gwSiteName,
    applyLabel: answer => {
      if(many) return tt("sp.gw.mk.apply", {one: "Set at {n} site", other: "Set at {n} sites"}, {n: kept().length});
      return (answer ? moved(answer).length : !setup) ? tt("sp.gw.mk.title", "Set the cheapest mix") : tt("sp.mk.setup", "Set up");
    },
    applying: tt("sp.gw.mk.applying", "Setting campaigns in the game…"),
    undoHint: () => many && kept().length > 1 ? tt("sp.gw.mk.undohint", "Undo takes back all {n} sites at once.", {n: kept().length}) : null,
    /* Set-up alone switches nothing on or off: there is nothing to undo. */
    changed: answer => moved(answer).length > 0,
    done: answer => {
      const n = moved(answer).length;
      if(answer.undo) return n > 1 ? tt("sp.gw.mk.undone.many", "Undone: campaigns back as they were at {n} sites.", {n})
        : tt("sp.gw.mk.undone", "Undone: campaigns back as they were.");
      const k = addedN(answer), left = laterN(answer);
      const rest = left ? ` ${tt("sp.gw.mk.done.later", {one: "{n} switch comes later.", other: "{n} switches come later."}, {n: left})}` : "";
      if(n) return (n === 1 ? tt("sp.gw.mk.done.one", "The cheapest mix runs at {shop}.", {shop: gwSiteName(moved(answer)[0])})
        : tt("sp.gw.mk.done.many", "The cheapest mix runs at {n} sites.", {n})) + rest;
      return (k ? tt("sp.gw.mk.done.some", {one: "{n} switch added to BizMan.", other: "{n} switches added to BizMan."}, {n: k})
        : tt("sp.gw.mk.done.none2", "No switch was added.")) + rest;
    },
  });
}

/* Rent (Real estate › My buildings): the best price at one building, or at
   every building off its best price (`keys` null). Read from the realEstate
   section, so the dialog waits for it; the game clamps a price to BizMan's
   slider and holds it as pending for its seven-day wait, which the answer's
   appliesOnDay names. Every building is set, or none: a refused one can be
   left out, as with marketing. */
function gwRent(keys){
  /* The buildings are fixed as the dialog opens: the board read again after
     the apply holds them pending, and no longer off their best price. */
  const re0 = reData();
  if(!re0) return;
  keys = keys || re0.owned.filter(o => o.flag).map(o => o.key);
  const many = keys.length > 1;
  const out = new Set();  // buildings left out
  const pool = () => {
    const re = reData() || re0;
    return keys.map(k => re.owned.find(o => o.key === k)).filter(Boolean);
  };
  const kept = () => pool().filter(o => !out.has(o.key));
  /* The rows the game last judged, so the drawing stays with its answer
     while the board reads the game again after an apply. */
  let judged = new Map();
  const plan = r => judged.get(gwKeyOf(r.address));
  const setRows = answer => (answer.rows || []).filter(r => !r.error && r.set && plan(r));
  const day = answer => {
    const d = (answer.rows || []).filter(r => r.appliesOnDay !== null && r.appliesOnDay !== undefined)
      .map(r => Number(r.appliesOnDay)).find(Number.isFinite);
    return Number.isFinite(d) ? d : (Number((D.meta || {}).day) || 0) + 7;
  };
  const first = pool()[0];
  if(!first) return;
  let applied = 0;  // the prices the last apply set, for the undo note
  const refusal = r => {
    const known = GW_REFUSE.rent[r.error] || GW_REFUSE.any[r.error];
    return (typeof known === "function" ? known(r) : known) || {rule: tt("sp.gw.uni.refused", "The game refused this ({code})", {code: spEsc(r.error)}), fix: ""};
  };
  const where = o => `${reHood(o.hood)}<span>${spEsc(o.address)}</span>`;
  /* What the game will hold: its own after-price where it answered one. */
  const to = (r, p) => Number.isFinite(Number(r.pendingPricePerSqm)) && r.set ? Number(r.pendingPricePerSqm) : p.best;
  const read = p => p.fill ? tt("re.gw.read", {one: "Occupancy {occ}% now · fills in about {n} day", other: "Occupancy {occ}% now · fills in about {n} days"}, {occ: p.occ, n: p.fill})
    : tt("re.gw.read.full", "Full · keeps every tenant");
  const row = (r, phase) => {
    const p = plan(r), key = gwKeyOf(r.address);
    if(!p) return "";
    const back = phase === "undone";
    /* An undo's answer: from the price the write left (`before`) back to the
       one it restored, each the price that holds (pending while its days run). */
    const holds = s => s && Number.isFinite(Number(s.pendingPricePerSqm)) && Number(s.daysUntilUpdatingPricePerSqm) > 0
      ? Number(s.pendingPricePerSqm) : s && Number.isFinite(Number(s.pricePerSqm)) ? Number(s.pricePerSqm) : null;
    const was = back ? holds(r.before) ?? to(r, p) : (p.pending ?? p.price);
    const now = back ? holds(r) ?? (p.pending ?? p.price) : to(r, p);
    const tick = phase === "done" && !r.error && r.set ? `<span class="re-tick">${gwSvg("tick")}</span>` : "";
    const say = r.error ? refusal(r) : null;
    const same = !r.error && r.set === false;
    return `<div class="gw-shop gw-mkrow${r.error ? " bad" : ""}" tabindex="0" data-read="${attr(read(p))}"><div class="nm">${reHood(p.hood)}<span>${spEsc(p.address)}</span>${tick}</div>`
      + `<span class="c${back ? "" : " re-plus"}">${back ? tt("re.gw.putback", "put back") : same ? tt("re.gw.same", "already set") : tt("re.gw.gain", "{w}/day", {w: reGainText(p.gain || 0)})}</span>`
      + `<span class="gw-mk">${tt("re.gw.change", "{change} a m²", {change: `<span class="re-gwk"><s>${reP2(was)}</s>${gwSvg("right")}<b>${reP2(now)}</b></span>`})}${
        r.clamped ? ` · ${tt("re.gw.clamped", "the game's limit")}` : ""}</span>`
      + (say ? `<div class="gw-why"><span><b>${say.rule}</b>.${say.fix ? ` ${say.fix}` : ""}</span>${
        phase === "ready" && kept().length > 1 ? `<button type="button" class="gw-mini-b" data-gw-leave="${attr(key)}" aria-label="${
        attr(tt("re.gw.leave.label", "Leave it out: {name}", {name: p.address}))}">${gwSvg("skip")}${tt("sp.gw.uni.leave", "Leave it out")}</button>` : ""}</div>` : "")
      + `</div>`;
  };
  const outRow = o => `<div class="gw-shop out"><div class="nm">${reHood(o.hood)}<span>${spEsc(o.address)}</span></div><span class="gw-minis"></span><span class="c">${tt("sp.gw.uni.out", "out")}</span></div>`;
  const title = () => many ? tt("re.gw.title.many", {one: "Set the best price at {n} building", other: "Set best prices at {n} buildings"}, {n: kept().length})
    : tt("re.gw.title", "Set the best price");
  gwConfirm({
    kind: "rent", icon: "tag", needs: ["realEstate"], againLabel: tt("re.gw.again", "Set again"),
    title,
    where: () => !many ? where(first)
      : out.size ? `<span>${tt("sp.gw.uni.leftout", "{names} left out", {names: [...out].map(k => spEsc((pool().find(o => o.key === k) || {address: k}).address)).join(", ")})}</span>` : "",
    nothing: () => kept().length ? "" : tt("re.gw.nothing", "No building left to set."),
    body: () => {
      const list = kept();
      judged = new Map(list.map(o => [o.key, o]));
      return {items: list.map(o => ({address: gwAddress(o.key), pricePerSqm: o.best,
        expect: {pricePerSqm: o.price, pendingPricePerSqm: o.pendingRaw ?? (o.pending ?? 0)}}))};
    },
    /* Every price is pending at its best already: nothing to send. */
    idle: answer => (answer.rows || []).some(r => !r.error && r.set) ? "" : tt("re.gw.idle", "Nothing to change: every price is set already"),
    verdict: answer => {
      const rows = answer.rows || [], bad = rows.filter(r => r.error).length, n = setRows(answer).length;
      if(bad) return many ? `<b>${tt("re.gw.refuses", "The game refuses {n} of {of} buildings", {n: bad, of: rows.length})}</b>`
        : `<b>${tt("sp.gw.refuses", "The game refuses this")}</b>`;
      return `<b>${tt("re.gw.will", {one: "The game will set {n} price", other: "The game will set {n} prices"}, {n})}</b>`;
    },
    inline: true,
    draw: (answer, phase) => {
      const rows = answer.rows || [];
      const ok = rows.filter(r => !r.error && plan(r)), set = ok.filter(r => r.set);
      const sum = f => set.reduce((s, r) => s + (f(plan(r)) || 0), 0);
      const d = day(answer);
      if(!many){
        const r = rows[0] || {}, p = plan(r);
        if(!p) return "";
        const tally = phase === "ready" ? `<div class="gw-tally"><div><span class="gw-lab">${tt("re.gw.now1", "Now, a day")}</span><span class="gw-big dim">${fmt(p.now || 0)}</span></div>
          <div><span class="gw-lab">${tt("re.gw.full1", "Full, a day")}</span><span class="gw-big">${fmt(p.full || 0)}</span></div>
          <div><span class="gw-lab">${tt("re.gw.price1", "Price / m²")}</span><span class="gw-big dim re-gwp">${reP2(p.pending ?? p.price)} → ${reP2(to(r, p))}</span></div></div>` : "";
        const note = phase === "ready" && !r.error ? gwCall("info", "clock", p.fill
          ? tt("re.gw.wait1", {one: "The price applies after the game's <b>7-day wait</b>, on day {d}. The building then fills in about {n} day; nobody moves out at this price.",
              other: "The price applies after the game's <b>7-day wait</b>, on day {d}. The building then fills in about {n} days; nobody moves out at this price."}, {d, n: p.fill})
          : tt("re.gw.wait1.full", "The price applies after the game's <b>7-day wait</b>, on day {d}. The building stays full: nobody moves out at this price.", {d})) : "";
        return tally + note + (r.error || phase === "undone" ? `<div class="gw-shops">${row(r, phase)}</div>` : "");
      }
      const tally = phase === "ready" ? `<div class="gw-tally"><div><span class="gw-lab">${tt("re.gw.now", "Rent now, a day")}</span><span class="gw-big dim">${fmt(sum(p => p.now))}</span></div>
        <div><span class="gw-lab">${tt("re.gw.full", "Once full, a day")}</span><span class="gw-big">${fmt(sum(p => p.full))}</span></div>
        <div><span class="gw-lab">${tt("re.gw.n", "Buildings")}</span><span class="gw-big dim">${set.length}${rows.length > set.length ? `<small>+${rows.length - set.length}</small>` : ""}</span></div></div>` : "";
      const note = phase === "ready" && set.length ? gwCall("info", "clock", tt("re.gw.wait", "Each price applies after the game's <b>7-day wait</b>, on day {d}. The buildings then fill over the weeks after; the gain is what they earn once full.", {d})) : "";
      /* The largest gain first, as the view's button lists them. */
      const order = rows.slice().sort((a, b) => ((plan(b) || {}).gain || 0) - ((plan(a) || {}).gain || 0));
      return tally + note + `<div data-readzone><div class="gw-shops">${order.map(r => row(r, phase)).join("")}${
        [...out].map(k => pool().find(o => o.key === k)).filter(Boolean).map(outRow).join("")}</div><div class="gw-read sp-readout">&nbsp;</div></div>`;
    },
    doneBody: (answer, spec) => {
      const n = setRows(answer).length, d = day(answer);
      const said = answer.undo ? spec.done(answer)
        : n === 1 ? tt("re.gw.done.one", "<b>The price waits in the game.</b> It applies on day {d}; occupancy climbs from then.", {d})
        : tt("re.gw.done.many", "<b>{n} prices wait in the game.</b> They apply on day {d}; occupancy climbs from then.", {n, d});
      return gwBox("tick", "", said) + (many ? `<div class="gw-shops">${(answer.rows || []).filter(r => !r.error && r.set).map(r => row(r, "done")).join("")}</div>` : "");
    },
    refusedHint: () => many ? tt("re.gw.refusedmany", "Every price is set, or none: leave a refused building out, or refresh the board.") : tt("sp.gw.unchanged", "Nothing was changed."),
    bind: (dlg, replan) => {
      dlg.querySelectorAll("[data-gw-leave]").forEach(b => { b.onclick = () => {
        if(b.classList.contains("gw-busy")) return;
        out.add(b.dataset.gwLeave);
        const r = b.closest(".gw-shop");
        if(r) r.classList.add("out");
        replan(b);
      }; });
    },
    object: r => spEsc((plan(r) || {}).address || tt("re.gw.abuilding", "A building")),
    applyLabel: answer => many ? tt("re.gw.apply", {one: "Set {n} price", other: "Set {n} prices"}, {n: answer ? setRows(answer).length || kept().length : kept().length})
      : tt("re.gw.apply1", "Set the price"),
    applying: tt("re.gw.applying", "Setting rent in the game…"),
    undoHint: () => many && applied > 1 ? tt("re.gw.undohint", "Undo puts back all {n} prices at once, until the game's next day.", {n: applied})
      : tt("re.gw.undohint1", "Undo puts the price back, until the game's next day."),
    changed: answer => setRows(answer).length > 0,
    done: answer => {
      const n = setRows(answer).length;
      if(answer.undo) return n > 1 ? tt("re.gw.undone.many", "Undone: the prices are back as they were at {n} buildings.", {n})
        : tt("re.gw.undone", "Undone: the price is back as it was.");
      applied = n;
      return tt("re.gw.toast", {one: "Best price set at {n} building · it applies on day {d}", other: "Best prices set at {n} buildings · they apply on day {d}"}, {n, d: day(answer)});
    },
  });
}

/* The agency a marketing refusal names: its own name, else the board's name
   for its address, else a plain word. */
function gwMkAgencyOf(r){
  const a = r && (r.agency || r.agencies && r.agencies[0]);
  if(a && a.name) return spEsc(a.name);
  const known = a && gwMkAgency(a.address ? gwKeyOf(a.address) : a.street ? gwKeyOf(a) : String(a));
  return known ? spEsc(known.name) : tt("nav.dlg.refuse.anagency", "The marketing agency");
}
/* When a closed agency opens, as the refusal says it ({day, hour}), else as
   the board works it out: {h, d}, the hour and the weekday when it is not
   today, else null. */
function gwMkOpensOf(r){
  const a = r && (r.agency || r.agencies && r.agencies[0]) || {};
  let at = r && (r.opens || a.opens || r.reopens);
  const known = !at && gwMkAgency(a.address ? gwKeyOf(a.address) : a.street ? gwKeyOf(a) : "");
  const c = gwMkClock();
  if(!at && known && c) at = gwMkNext(known, c);
  if(!at || !Number.isFinite(Number(at.hour))) return null;
  const other = c && Number.isFinite(Number(at.day)) && Number(at.day) !== c.day;
  return {h: Number(at.hour), d: other ? Number(at.day) % 7 : null};
}

/* The refusals the player can fix in the game while the same request stays
   valid (a screen closed, a locker placed, a week's lock over). Try again is
   offered only when every error the answer names is one of them; the rest
   ask for another request, or a refreshed board. */
const GW_FIXABLE = new Set(["screen_open", "no_locker", "no_preset", "no_business", "no_agent", "no_warehouse",
  "locked", "backorder", "not_assigned", "myemployees", "no_contact", "agency_closed", "supplier_closed", "no_storage"]);
const gwFixable = answer => {
  const a = answer || {};
  /* A hire's dry run names an app open in the game as `blocked`. */
  const codes = [a.siteError, a.blocked, ...(a.rows || []).flatMap(r => r ? [r.error, ...(r.products || []).map(p => p && p.error)] : [])].filter(Boolean);
  return codes.length > 0 && codes.every(c => GW_FIXABLE.has(c));
};
/* Why a row was refused, in plain words: the rule, then the fix. An entry may
   be a function of the row, for a refusal that carries its own numbers. */
const GW_REFUSE = {
  any: {
    not_found: {get rule(){ return tt("nav.dlg.refuse.notfound.rule", "No building at this address any more"); }, get fix(){ return tt("nav.dlg.refuse.notfound.fix", "Refresh the board: the shop may have closed or moved."); }},
    not_rented: {get rule(){ return tt("nav.dlg.refuse.notrented.rule", "You no longer rent this building"); }, get fix(){ return tt("nav.dlg.refuse.notrented.fix", "Refresh the board."); }},
    changed: {get rule(){ return tt("nav.dlg.refuse.changed.rule", "Changed in the game since this board was read"); }, get fix(){ return tt("nav.dlg.refuse.changed.fix", "Refresh the board, then try again."); }},
    screen_open: {get rule(){ return tt("nav.dlg.refuse.screen.rule", "Open in BizMan right now"); }, get fix(){ return tt("nav.dlg.refuse.screen.fix", "Close that BizMan screen in the game, then try again."); }},
  },
  uniforms: {
    no_business: {get rule(){ return tt("nav.dlg.refuse.nobusiness.rule", "No business is set up here"); }, get fix(){ return tt("nav.dlg.refuse.nobusiness.fix", "Set one up in BizMan first."); }},
    no_locker: {get rule(){ return tt("nav.dlg.refuse.nolocker.rule", "No uniform locker: the game sets uniforms only where one stands"); }, get fix(){ return tt("nav.dlg.refuse.nolocker.fix", "Place a uniform locker in the shop, then try again."); }},
    no_preset: {get rule(){ return tt("nav.dlg.refuse.nopreset.rule", "The game has no uniform to set"); }, get fix(){ return tt("nav.dlg.refuse.nopreset.fix", "Create one in the game's uniform settings, then try again."); }},
  },
  imports: {
    no_agent: {get rule(){ return tt("nav.dlg.refuse.noagent.rule", "No purchasing agent runs this contract"); }, get fix(){ return tt("nav.dlg.refuse.noagent.fix", "Assign a purchasing agent at the headquarters, then try again."); }},
    no_amounts: {get rule(){ return tt("nav.dlg.refuse.noamounts.rule", "Every amount on this contract would be 0, and the game runs no contract with nothing to order"); }, get fix(){ return tt("nav.dlg.refuse.noamounts.fix", "Give it an amount, or stop it in BizMan."); }},
    locked: r => {
      const day = Number((r.reopens || {}).day);
      return {rule: tt("nav.dlg.refuse.locked.rule", "Orders for Monday's delivery closed Sunday 20:00; they reopen Monday 08:00"),
        fix: r.reopens && Number.isFinite(day) ? tt("nav.dlg.refuse.locked.day", "That is day {day}, 08:00 game time: try again then.", {day})
          : tt("nav.dlg.refuse.locked.fix", "Try again then.")};
    },
    no_warehouse: {get rule(){ return tt("nav.dlg.refuse.nowarehouse.rule", "A product on this contract has no warehouse to deliver to"); }, get fix(){ return tt("nav.dlg.refuse.nowarehouse.fix", "Pick a warehouse for it on the contract in BizMan."); }},
    backorder: {get rule(){ return tt("nav.dlg.refuse.backorder.rule", "The item is on backorder at the importer this week"); }, get fix(){ return tt("nav.dlg.refuse.backorder.fix", "Try again once the market event is over."); }},
    /* The contract row repeats its product's error; the figure is on the product. */
    over_cap: r => {
      const p = (r.products || []).find(x => x && x.error === "over_cap") || r;
      const max = p.max === null || p.max === undefined ? NaN : Number(p.max);
      return {rule: Number.isFinite(max) ? tt("nav.dlg.refuse.overcap.max", "More than the importer still allows this week ({n})", {n: num(max)})
          : tt("nav.dlg.refuse.overcap.rule", "More than the importer still allows this week"),
        fix: tt("nav.dlg.refuse.overcap.fix", "Lower the amount, or bring the rest through another importer.")};
    },
    bad_amount: {get rule(){ return tt("nav.dlg.refuse.badamount.rule", "An amount is not a whole number of 0 or more"); }, get fix(){ return tt("nav.dlg.refuse.badamount.fix", "Correct it, then try again."); }},
  },
  marketing: {
    no_business: {get rule(){ return tt("nav.dlg.refuse.nobusiness.rule", "No business is set up here"); }, get fix(){ return tt("nav.dlg.refuse.nobusiness.fix", "Set one up in BizMan first."); }},
    no_promotion: {get rule(){ return tt("nav.dlg.refuse.nopromotion.rule", "Campaigns bring this business no promotion"); }, get fix(){ return tt("nav.dlg.refuse.nopromotion.fix", "Leave it out."); }},
    no_agency: {get rule(){ return tt("nav.dlg.refuse.noagency.rule", "No marketing agency in the city offers a campaign in this mix"); }, get fix(){ return tt("nav.dlg.refuse.noagency.fix", "Refresh the board."); }},
    no_contact: r => ({rule: tt("nav.dlg.refuse.nocontact.rule", "{agency} is not in your phone's contacts", {agency: gwMkAgencyOf(r)}),
      fix: tt("nav.dlg.refuse.nocontact.fix", "Visit it once in the game, then try again.")}),
    agency_closed: r => {
      const o = gwMkOpensOf(r);
      return {rule: tt("nav.dlg.refuse.closed.rule", "{agency} is closed right now", {agency: gwMkAgencyOf(r)}),
        fix: !o ? tt("nav.dlg.refuse.closed.fix", "Try again once it opens.")
          : o.d === null ? tt("nav.dlg.refuse.closed.at", "It opens at {h}:00: try again then.", {h: o.h})
          : tt("nav.dlg.refuse.closed.day", "It opens {d:day} at {h}:00: try again then.", {d: o.d, h: o.h})};
    },
  },
  schedule: {
    headquarters: {get rule(){ return tt("nav.dlg.refuse.hq.rule", "A headquarters' schedule is not written from here"); }, get fix(){ return tt("nav.dlg.refuse.hq.fix", "Change it in BizMan in the game."); }},
    not_assigned: {get rule(){ return tt("nav.dlg.refuse.notassigned.rule", "Someone on the plan is not assigned to this business"); }, get fix(){ return tt("nav.dlg.refuse.notassigned.fix", "Assign them in BizMan, or refresh the board."); }},
    no_station: {get rule(){ return tt("nav.dlg.refuse.nostation.rule", "A station on the plan is no longer here"); }, get fix(){ return tt("nav.dlg.refuse.nostation.fix", "Refresh the board."); }},
    no_skill: {get rule(){ return tt("nav.dlg.refuse.noskill.rule", "Someone on the plan lacks the skill for their station"); }, get fix(){ return tt("nav.dlg.refuse.noskill.fix", "Refresh the board."); }},
    bad_hours: {get rule(){ return tt("nav.dlg.refuse.badhours.rule", "Someone's hours are not whole hours, at most 12, within the day"); }, get fix(){ return tt("nav.dlg.refuse.badhours.fix", "Refresh the board."); }},
    overlap_person: {get rule(){ return tt("nav.dlg.refuse.overlapperson.rule", "Someone would work two places at once"); }, get fix(){ return tt("nav.dlg.refuse.overlapperson.fix", "Refresh the board."); }},
    overlap_station: {get rule(){ return tt("nav.dlg.refuse.overlapstation.rule", "Two people would share one station"); }, get fix(){ return tt("nav.dlg.refuse.overlapstation.fix", "Refresh the board."); }},
  },
};
/* Rent (gwRent()): a building sold since, or a villa, which the game pays no rent. */
GW_REFUSE.rent = {
  not_owned: {get rule(){ return tt("re.gw.refuse.notowned.rule", "You no longer own this building"); }, get fix(){ return tt("re.gw.refuse.notowned.fix", "Refresh the board."); }},
  villa: {get rule(){ return tt("re.gw.refuse.villa.rule", "A Hamptons villa: the game pays it no rent"); }, get fix(){ return tt("re.gw.refuse.villa.fix", "Leave it out."); }},
};
GW_REFUSE.wholesale = {
  locked: GW_REFUSE.imports.locked,
  not_supported: {get rule(){ return tt("sb.wholesale.refuse.not_supported.rule", "This business cannot receive wholesale deliveries"); }, get fix(){ return tt("sb.wholesale.refuse.not_supported.fix", "Choose a shop that accepts wholesale deliveries."); }},
  supplier_missing: {get rule(){ return tt("sb.wholesale.refuse.supplier_missing.rule", "This wholesaler is no longer available"); }, get fix(){ return tt("sb.wholesale.refuse.supplier_missing.fix", "Refresh the board."); }},
  no_contact: {get rule(){ return tt("sb.wholesale.refuse.no_contact.rule", "This wholesaler is not in your contacts"); }, get fix(){ return tt("sb.wholesale.refuse.no_contact.fix", "Visit it once in the game, then try again."); }},
  supplier_closed: {get rule(){ return tt("sb.wholesale.refuse.supplier_closed.rule", "The wholesaler is closed now"); }, get fix(){ return tt("sb.wholesale.refuse.supplier_closed.fix", "Try again during its opening hours."); }},
  no_storage: {get rule(){ return tt("sb.wholesale.refuse.no_storage.rule", "The shop has no business storage"); }, get fix(){ return tt("sb.wholesale.refuse.no_storage.fix", "Place business storage at the shop, then try again."); }},
  duplicate_contracts: {get rule(){ return tt("sb.wholesale.refuse.duplicate_contracts.rule", "Several contracts exist for this shop and wholesaler"); }, get fix(){ return tt("sb.wholesale.refuse.duplicate_contracts.fix", "Review these contracts in BizMan first."); }},
  active_order: {get rule(){ return tt("sb.wholesale.refuse.active_order.rule", "An order is already active with this wholesaler"); }, get fix(){ return tt("sb.wholesale.refuse.active_order.fix", "Finish or cancel it in BizMan, or choose another wholesaler."); }},
  other_contract: {get rule(){ return tt("sb.wholesale.refuse.other_contract.rule", "Another weekly contract supplies these products"); }, get fix(){ return tt("sb.wholesale.refuse.other_contract.fix", "Review that contract in BizMan before adding another weekly order."); }},
  other_products: {get rule(){ return tt("sb.wholesale.refuse.other_products.rule", "The existing contract also orders products outside this list"); }, get fix(){ return tt("sb.wholesale.refuse.other_products.fix", "Edit the whole contract in BizMan to keep those quantities under your control."); }},
  product_unavailable: {get rule(){ return tt("sb.wholesale.refuse.product_unavailable.rule", "A product is not available for this shop from this wholesaler"); }, get fix(){ return tt("sb.wholesale.refuse.product_unavailable.fix", "Refresh the board or choose another wholesaler."); }},
  over_cap: {get rule(){ return tt("sb.wholesale.refuse.over_cap.rule", "This order exceeds the remaining wholesale limit"); }, get fix(){ return tt("sb.wholesale.refuse.over_cap.fix", "Order the smaller amount in BizMan or use another wholesaler."); }},
  backorder: {get rule(){ return tt("sb.wholesale.refuse.backorder.rule", "A product is on backorder at this wholesaler"); }, get fix(){ return tt("sb.wholesale.refuse.backorder.fix", "Try again after the market event ends."); }},
  shortage: {get rule(){ return tt("sb.wholesale.refuse.shortage.rule", "A shortage would reduce this order"); }, get fix(){ return tt("sb.wholesale.refuse.shortage.fix", "Order the available amount in BizMan or choose another wholesaler."); }},
};
/* A hire's rows name their scope: a candidate hired, an employee moved, a
   site, or one shift of a site's week (the schedule's own codes). */
GW_REFUSE.hire = Object.assign({}, GW_REFUSE.schedule, {
  not_found: r => r.scope === "hire" ? {rule: tt("sp.gw.hire.refuse.gone.rule", "No longer among the headhunters' candidates"), fix: tt("sp.gw.hire.refuse.refresh", "Refresh the board.")}
    : r.scope === "move" ? {rule: tt("sp.gw.hire.refuse.noone.rule", "Nobody by that id works for you any more"), fix: tt("sp.gw.hire.refuse.refresh", "Refresh the board.")} : GW_REFUSE.any.not_found,
  changed: r => r.scope === "hire" ? {rule: tt("sp.gw.hire.refuse.wage.rule", "The candidate's wage has changed since this board was read"), fix: tt("sp.gw.hire.refuse.wage.fix", "Refresh the board: the page picks again.")}
    : r.scope === "move" ? {rule: tt("sp.gw.hire.refuse.moved.rule", "Not where this board read them any more"), fix: tt("sp.gw.hire.refuse.refresh", "Refresh the board.")} : GW_REFUSE.any.changed,
  /* Refreshing would plan the same hire again, so the fix is to leave it out. */
  no_skill: r => r.scope === "shift" ? GW_REFUSE.schedule.no_skill
    : {rule: tt("sp.gw.hire.refuse.skill.rule", "Has none of the skills this business takes"),
       fix: r.scope === "move" ? tt("sp.gw.hire.refuse.skill.move", "Untick the move.")
         : tt("sp.gw.hire.refuse.skill.fix", "Untick them in Change picks.")},
  in_training: {get rule(){ return tt("sp.gw.hire.refuse.training.rule", "In training: the game moves nobody who is training"); },
    get fix(){ return tt("sp.gw.hire.refuse.training.fix", "Wait for the training to end, or untick the move."); }},
  no_business: {get rule(){ return tt("sp.gw.hire.refuse.nobusiness.rule", "No business is set up here"); },
    get fix(){ return tt("sp.gw.hire.refuse.nobusiness.fix", "Set one up in BizMan first."); }},
  screen_open: {get rule(){ return tt("sp.gw.hire.refuse.screen.rule", "Open in BizMan right now, or being filled in automatically"); },
    get fix(){ return tt("nav.dlg.refuse.screen.fix", "Close that BizMan screen in the game, then try again."); }},
  headquarters: {get rule(){ return tt("sp.gw.hire.refuse.hq.rule", "A headquarters' hours are not written from here"); },
    get fix(){ return tt("sp.gw.hire.refuse.refresh", "Refresh the board."); }},
});
/* The lock window, Sunday 16:00 to Monday 09:00 an hour a cell: shut from
   20:00 to 08:00, and now ringed when it falls inside. */
function gwLockStrip(){
  const l = gwLink() || {};
  const d = ((Number(l.day) % 7) + 7) % 7, h = Number(l.hour);
  const at = d === 0 && h >= 16 ? h - 16 : d === 1 && h < 10 ? h + 8 : -1;
  const cells = [...Array(18).keys()].map(k => `<i class="${k >= 4 && k < 16 ? "x" : ""}${k === at ? " now" : ""}"></i>`).join("");
  /* gwNow() is "Sun 14:02": its time, after the weekday and a space. */
  const time = gwNow().replace(/^\S+ /, "");
  const now = at >= 0 ? `<span class="n" style="grid-row:2;grid-column:${Math.min(at, 14) + 1}/span 4">${tt("nav.dlg.lock.now", "now {t}", {t: time})}</span>` : "";
  return `<div class="gw-lock" aria-hidden="true"><div class="cells">${cells}</div><div class="labs"><span style="grid-column:1/span 4">${navShortDay(6)} 16</span><span style="grid-column:5/span 3">20:00</span><span class="r" style="grid-column:15/span 4">${navShortDay(0)} 08:00</span>${now}</div></div>`;
}
/* A dry run the game refused because the board's figures are no longer the
   game's. */
const gwMovedOn = answer => !answer.ok && (answer.siteError === "changed"
  || (answer.rows || []).some(r => r && (r.error === "changed" || (r.products || []).some(p => p && p.error === "changed"))));
/* The game's refusals, one card a rule: the rule, what it is about as
   chips, and the fix on one line. */
function gwRefusals(spec, answer){
  /* A schedule answer names its business's own refusal apart from the rows;
     a 409's rows already lead with it. */
  const site = answer.siteError && !(answer.rows || []).some(r => r && r.error === answer.siteError && r.d === undefined)
    ? [Object.assign({}, answer, {error: answer.siteError})] : [];
  const groups = new Map();
  /* A write may fold rows that only follow from another row (spec.fold). */
  const rows = spec.fold ? spec.fold(answer.rows || []) : answer.rows || [];
  site.concat(rows).filter(r => r && r.error).forEach(r => {
    const known = (GW_REFUSE[spec.kind] || {})[r.error] || GW_REFUSE.any[r.error];
    const say = typeof known === "function" ? known(r) : known || {rule: tt("nav.dlg.refused.code", "The game refused this ({code})", {code: spEsc(r.error)}), fix: ""};
    const key = `${say.rule}|${say.fix}`;
    if(!groups.has(key)) groups.set(key, {say, error: r.error, chips: []});
    const chip = spec.object ? spec.object(r) : "";
    if(chip && !groups.get(key).chips.includes(chip)) groups.get(key).chips.push(chip);
  });
  return [...groups.values()].map(({say, error, chips}) => `<div class="gw-no"><span class="ic">${gwSvg(error === "locked" || error === "no_locker" ? "lock" : "alert")}</span><div class="rule">${
    say.rule}.</div>${chips.length ? `<div class="gw-chips">${chips.map(c => `<span class="gw-chip gw-neg">${c}</span>`).join("")}</div>` : ""}${
    say.fix ? `<div class="fix">${gwSvg("right")}<span>${say.fix}</span></div>` : ""}${error === "locked" ? gwLockStrip() : ""}</div>`).join("");
}
const GW_CANNOT = {
  get saving(){ return [tt("nav.dlg.cannot.saving.text", "The game is saving right now"), tt("nav.dlg.moment", "Try again in a moment."), "save"]; },
  get placement(){ return [tt("nav.dlg.cannot.placement.text", "The game takes no changes while you are placing items"),
    tt("nav.dlg.cannot.placement.fix", "Finish placing in the game, then try again."), "clock"]; },
  get interior(){ return [tt("nav.dlg.cannot.interior.text", "The game takes no changes while the interior designer is open"),
    tt("nav.dlg.cannot.interior.fix", "Close it in the game, then try again."), "sofa"]; },
  get casino(){ return [tt("nav.dlg.cannot.casino.text", "The game takes no changes on the casino boat"),
    tt("nav.dlg.cannot.casino.fix", "Leave the boat in the game, then try again."), "clock"]; },
  get myemployees(){ return [tt("nav.dlg.cannot.myemployees.text", "MyEmployees is open in the game"),
    tt("nav.dlg.cannot.myemployees.fix", "Close the MyEmployees app on your phone in the game, then try again."), "phone"]; },
  get other(){ return [tt("nav.dlg.cannot.other.text", "The game takes no changes right now"), tt("nav.dlg.moment", "Try again in a moment."), "clock"]; },
};
/* What a failed write says, and what the dialog offers next: `wire` and
   `say` for the verdict, `text` (and `sub`), or `box` [icon, tone] to set the
   text beside an icon; `retry` with its label `again`, `refresh`, `wait` (s). */
function gwProblem(res){
  const body = res.body || {};
  const ask = tt("nav.dlg.askagain", "Ask again");
  const cannot = reason => GW_CANNOT[reason] || GW_CANNOT.other;
  /* A verdict is a few words in bold; a sentence in bold leads the text. */
  const say = words => `<b>${words}</b>`;
  const unchanged = tt("nav.dlg.unchanged", "Nothing was changed."), unsent = tt("nav.dlg.unsent", "Nothing was sent.");
  switch(res.error){
    /* A hire's undo keeps only to the game day of its write: reading the game
       again cannot help. */
    case "changed": if(((body.rows) || []).some(r => r && r.scope === "day")) return {wire: "moved",
      say: say(tt("nav.dlg.say.toolate", "Too late to undo")), box: ["clock", "dim"],
      text: tt("nav.dlg.undo.day", "Undo only works on the game day of the write. Nothing was changed.")};
      return {wire: "moved", say: say(tt("nav.dlg.say.moved", "The game moved on")),
      text: unchanged,
      drift: true, sub: tt("nav.dlg.moved.sub", "Something was hired, set or sold in the game meanwhile. Refresh, and the board plans again from what the game holds."), refresh: true};
    /* A refusal the player fixes in the game (a BizMan screen closed, a
       locker placed) can be tried again from here; see gwFixable(). */
    case "mod_owned":
    case "ownership_unknown": return {wire: "no", say: say(res.error === "mod_owned"
      ? tt("nav.dlg.modOwned", "A mod controls this change") : tt("nav.dlg.ownerUnknown", "Mod ownership could not be verified")),
      text: unchanged, retry: true,
      sub: [...(Array.isArray(body.reasons) ? body.reasons : []), ...(Array.isArray(body.effects) ? body.effects : [])]
        .filter(x => typeof x === "string").map(x => spEsc(mcReason(x))).join(" ")};
    case "refused": return {wire: "no", say: say(tt("nav.dlg.say.refuses", "The game refuses this")),
      text: unchanged, retry: gwFixable(body)};
    case "cannot_write": { const [text, fix, icon] = cannot(body.reason);
      return {wire: "busy", say: say(tt("nav.dlg.say.notnow", "Not now")), box: [icon, "dim"], text: `<b>${text}.</b> ${unchanged} ${fix}`, retry: true}; }
    case "busy": return {wire: "busy", say: say(tt("nav.dlg.say.busy", "The game is busy")), text: unchanged,
      sub: `<span class="gw-tries" aria-hidden="true"><i></i><i></i><i></i></span>${tt("nav.dlg.busy.tries", "tried {n} times, a second apart", {n: 3})}`, retry: true};
    case "main_thread_unavailable": return {wire: "busy", say: say(tt("nav.dlg.say.nocity", "No city loaded")),
      text: tt("nav.dlg.nocity.text", "The game did not take the change: no city is loaded."), retry: true};
    case "nothing_to_undo": return {wire: "no", say: say(tt("nav.dlg.say.noundo", "Nothing to undo")), box: ["info", "dim"],
      text: tt("nav.dlg.noundo.text", "There is nothing left to undo: a later change replaced it, or the city was loaded again.")};
    /* The game's approval of this browser, asked for on the first write. */
    case "cancelled": return {wire: "no", say: say(tt("nav.dlg.say.notapproved", "Not approved")), box: ["close", "no"],
      text: `${unsent} ${tt("nav.dlg.cancelled.text", "Its question may still be open there: asking again picks it up.")}`, retry: true, again: ask};
    case "denied": return {wire: "no", say: say(tt("nav.dlg.say.notallowed", "Not allowed")), box: ["close", "no"],
      text: `${unsent} ${
        tt("nav.dlg.denied.text", "The board changes the game only with your yes, and asks again when you try.")}`, retry: true, again: ask};
    case "expired": return {wire: "wait", say: say(tt("nav.dlg.say.noanswergame", "No answer in the game")), box: ["clock", "wait"],
      text: `${unsent} ${
        tt("nav.dlg.expired.text", "Is the game paused in a menu, or minimised? It closes its question after a minute.")}`, retry: true, again: ask};
    case "throttled": { const wait = Number(res.retryAfter) || 10;
      return {wire: "wait", say: say(tt("nav.dlg.say.asked", "Asked a moment ago")),
        text: tt("nav.dlg.throttled.text", "The game asked you a moment ago. Ask again in {n} s.", {n: wait}), retry: true, again: ask, wait}; }
    case "lost": return {wire: "no", say: say(tt("nav.dlg.say.lost", "Answer lost")), text: tt("nav.dlg.lost.text", "Approved, but the game's answer was lost: click again."), retry: true, again: ask};
    case "not_taken": return {wire: "busy", say: say(tt("nav.dlg.say.nottaken", "Not taken")), text: tt("nav.dlg.nottaken.text", "The game did not take the request. Nothing was sent."),
      sub: tt("nav.dlg.moment", "Try again in a moment."), retry: true, again: ask};
    case "reapproved": return {wire: "ok", say: say(tt("nav.dlg.say.allowedword", "Allowed")), text: tt("nav.dlg.reapproved.text", "This browser is approved again. Nothing was changed yet."),
      sub: tt("nav.dlg.reapproved.sub", "Try again to send it."), retry: true};
    case "origin_not_allowed": return {wire: "no", say: say(tt("nav.dlg.say.notsite", "Not this site")), text: tt("nav.dlg.origin.text", "The mod does not take changes from this site. Nothing was sent.")};
    case "not_paired": return {wire: "no", say: say(tt("nav.dlg.say.notallowed", "Not allowed")),
      text: tt("nav.dlg.notpaired.text", "The game no longer knows this browser's approval. Nothing was changed."),
      sub: tt("nav.dlg.notpaired.sub", "Ask again, and the game asks you once more."), retry: true, again: ask};
    case "cannot_pair": return {wire: "busy", say: say(tt("nav.dlg.say.cannotask", "The game cannot ask now")), again: ask, retry: true,
      text: res.reason === "popup_open" ? tt("nav.dlg.pair.popup", "Close the open question in the game first.")
        : res.reason === "no_ui" ? tt("nav.dlg.pair.noui.text", "The game cannot ask you right now. Nothing was sent.") : `${cannot(res.reason)[0]}. ${unsent}`,
      sub: res.reason === "no_ui" ? tt("nav.dlg.pair.noui.sub", "Go back into the game, then try again.") : ""};
    case "unreachable": return {wire: "no", say: say(tt("nav.dlg.say.noanswer", "No answer")), text: spEsc(res.message || tt("nav.dlg.unreachable.text", "The game did not answer.")), retry: true};
    case "uncertain": return {uncertain: true, text: tt("nav.dlg.uncertain.text", "The game did not answer, so this may or may not have been applied.")};
    case "not_linked": return {wire: "no", say: say(tt("nav.dlg.say.notlinked", "Not linked")), text: tt("nav.dlg.notlinked.text", "The board is no longer linked to the same game. Nothing was sent.")};
    /* The mod answered in another schema version since this board was read. */
    case "mismatch": return {wire: "no", say: say(tt("nav.dlg.say.mismatch", "The mod does not match")),
      text: tt("nav.dlg.mismatch.text", "The Big Copilot Link mod now speaks version {v}; this page needs version {need}. Nothing was sent.",
        {v: spEsc(String(res.version)), need: spEsc(String(res.need))}),
      sub: tt("nav.dlg.mismatch.sub", "Update the mod, or reload this page.")};
    default: return {wire: "no", say: say(tt("nav.dlg.say.refused", "Refused")),
      text: body.detail ? tt("nav.dlg.status.detail", "The game answered {status} ({detail}). Nothing was changed.", {status: res.status, detail: spEsc(body.detail)})
        : tt("nav.dlg.status.text", "The game answered {status}. Nothing was changed.", {status: res.status})};
  }
}
/* A sentence beside a round icon; tone no, wait or dim (plain is green). */
const gwBox = (icon, tone, html) => `<div class="gw-ok${tone ? ` ${tone}` : ""}"><span class="ic">${gwSvg(icon)}</span><p>${html}</p></div>`;
const gwReread = done => done
  ? `<div class="gw-reread done">${gwSvg("tick")}<span>${tt("nav.dlg.reread.done", "The board shows the game as it now stands")}</span></div>`
  : `<div class="gw-reread"><span>${tt("nav.dlg.reread.now", "Reading the game again")}</span><div class="gw-prog"><i></i></div></div>`;
/* A picture of the game's screen, not a control. Allow is clicked in the
   game window. The words inside the picture are the game's own. */
function gwScene(){
  return `<div class="gw-scene" role="img" aria-labelledby="gwSceneCap" aria-describedby="gwSceneNote"><div class="gw-sbar"><i></i><i></i><i></i><span>BIG AMBITIONS</span><span class="gw-cap" id="gwSceneCap">${
    tt("nav.dlg.scene", "Illustration")}</span></div><div class="city">${
    [26, 40, 18, 48, 30, 22, 44, 34, 20, 38, 28].map(h => `<i style="height:${h}px"></i>`).join("")}</div><div class="gw-pop" aria-hidden="true"><b><i></i>Allow Big Copilot to change your game?</b><div class="bt"><span>Deny</span><span class="y">Allow</span></div></div>${
    gwSvg("cursor", "gw-cursor")}</div>`;
}

/* The board could not read the game after a write: its follow read gave up
   or its build failed. Cleared by the next board built. */
let gwReadStuck = false;
function gwFollowFailed(){
  gwReadStuck = true;
  gwGate(false, true);
}
/* Before a focused button is switched off: its place is remembered for the
   next paint, and the dialog holds the focus meanwhile. */
function gwKeepFocus(dlg, selector){
  const st = gwState(dlg);
  const a = document.activeElement;
  if(!a || a === dlg || !dlg.contains(a) || !a.matches(selector)) return;
  st.want = gwFocusKey(a) || st.want;
  dlg.focus();
}
/* The dialog hangs off <body> in the top layer, so no section's paint
   containment can clip it; one at a time. Its head names the write, its
   verdict carries the wire, and its body and foot are the state's. */
function gwDialog(icon, title, where){
  /* The one before goes at once, not when its close event comes round. */
  if(gwOpen){ const was = gwOpen; was.close(); gwState(was).gone(true); }
  const dlg = document.createElement("dialog");
  const st = gwState(dlg);
  dlg.className = "gw-dlg";
  dlg.tabIndex = -1;  // where focus goes when the control that held it is drawn away
  dlg.setAttribute("aria-labelledby", "gwTitle");
  dlg.innerHTML = `<div class="gw-grab" aria-hidden="true"></div><div class="gw-head"><span class="gw-kind" aria-hidden="true">${gwSvg(icon)}</span><div><h2 id="gwTitle"></h2><div class="gw-where"></div></div><button type="button" class="gw-x" data-gw-close data-od-close aria-label="${attr(tt("nav.dlg.close", "Close"))}">${gwSvg("close")}</button></div>
    <div class="gw-verdict"></div><div class="gw-fix" aria-live="polite"></div><div class="gw-body" aria-live="polite"></div><div class="gw-foot"></div>`;
  gwHead(dlg, title, where);
  dlg.querySelector("[data-gw-close]").onclick = () => dlg.close();
  /* `replaced`: another dialog takes its place, so no Undo strip comes up
     under it; the new one's own gwToast() decides. */
  st.gone = replaced => {
    if(!dlg.isConnected) return;
    /* Closed while the game asks the player: this page stops waiting. */
    if(st.cancel) st.cancel();
    clearInterval(st.tick);
    dlg.remove(); if(gwOpen === dlg) gwOpen = null;
    if(replaced !== true) gwToast();
  };
  dlg.addEventListener("close", () => st.gone());
  document.body.appendChild(dlg);
  dlg.showModal();
  gwOpen = dlg;
  gwToast();
  return dlg;
}
function gwHead(dlg, title, where){
  dlg.querySelector("h2").textContent = title;
  dlg.querySelector(".gw-where").innerHTML = where || "";
}
/* The control a keyboard was on, as a selector that finds it again once the
   dialog is drawn afresh: a pill, a "Leave it out", the switch, a foot button. */
function gwFocusKey(el){
  for(const [key, name] of [["gwPreset", "data-gw-preset"], ["gwLeave", "data-gw-leave"], ["gwOpen", "data-gw-open"], ["hrMode", "data-hr-mode"], ["gwB", "data-gw-b"]])
    if(el.dataset && key in el.dataset) return `[${name}="${CSS.escape(el.dataset[key])}"]`;
  return null;
}
/* The fixed strip under the verdict holds the most urgent note and what the
   player must act on before the foot's first button; only the rows' detail
   scrolls. The notes that open the body (what the game said, what was
   undone, the approval asked in the game), and any note marked gw-lift or a
   "read again" line wherever it sits, go up in their order. A refusal (its
   card, with the lock-window strip) is urgent enough to stand alone there:
   the other notes then open the scrolling body instead, in the same order. */
const GW_LEAD = ".gw-said,.gw-sub,.gw-lead,.gw-drift,.gw-ok,.gw-no,.gw-reread,.gw-scene,.gw-call,.gw-lift";
function gwLift(dlg, body){
  const kids = [...body.children];
  let lead = true;
  const up = kids.filter(el => {
    lead = lead && el.matches(GW_LEAD);
    return lead || el.matches(".gw-lift,.gw-reread");
  });
  const cards = up.filter(el => el.matches(".gw-no"));
  const fixed = cards.length ? cards : up;
  /* Nothing would be left to scroll: the notes stay where they are. */
  if(fixed.length === kids.length) return dlg.querySelector(".gw-fix").replaceChildren();
  if(cards.length) body.prepend(...up.filter(el => !el.matches(".gw-no")));
  dlg.querySelector(".gw-fix").replaceChildren(...fixed);
}
/* One state of the dialog. `v`: {phase, wire, say, meta, body, hint, warn,
   buttons, keepTick}; a button is [label, onclick, {kind: go | ghost | undo,
   icon, disabled, why, busy}], and "|" is the gap between the left and the
   right. The phase is on the dialog as data-phase. A keyboard inside the
   dialog keeps its place: the same control when it is drawn again, else the
   primary button, else the dialog itself. */
function gwPaint(dlg, v){
  const st = gwState(dlg);
  const was = document.activeElement;
  const inside = !!was && dlg.contains(was);
  if(inside && was !== dlg) st.want = gwFocusKey(was) || st.want || null;
  dlg.dataset.phase = v.phase || "";
  st.soft = false;
  dlg.classList.toggle("is-applying", v.phase === "applying");
  dlg.classList.toggle("is-done", v.phase === "done");
  if(!v.keepTick){ clearInterval(st.tick); st.tick = null; }
  dlg.querySelector(".gw-verdict").innerHTML = `${gwWire(v.wire || "ask")}<span>${v.say || ""}</span>${v.meta ? `<span class="gw-meta">${v.meta}</span>` : ""}`;
  const body = dlg.querySelector(".gw-body");
  body.innerHTML = v.body || "";
  body.removeAttribute("aria-busy");
  gwLift(dlg, body);
  const list = (v.buttons || []).slice();
  if(!v.hint && !list.includes("|")) list.unshift("|");
  const parts = [];
  if(v.hint){
    const h = document.createElement("span");
    h.className = "gw-hint" + (v.warn ? " gw-warn" : "");
    h.innerHTML = v.hint;
    parts.push(h);
  }
  list.forEach(item => {
    if(item === "|"){ const gap = document.createElement("span"); gap.className = "gw-gap"; return parts.push(gap); }
    const [label, fn, o = {}] = item;
    const b = document.createElement("button");
    b.type = "button";
    b.className = `gw-b ${o.kind || "ghost"}${o.busy ? " busy" : ""}`;
    b.dataset.gwB = o.key || label;
    if(o.close) b.dataset.odClose = "";
    if(o.busy) b.insertAdjacentHTML("beforeend", `<span class="gw-spin" aria-hidden="true"></span>`);
    else if(["undo", "refresh", "skip", "key"].includes(o.icon)) b.insertAdjacentHTML("beforeend", gwSvg(o.icon));
    const text = document.createElement("span");
    text.textContent = label;
    b.appendChild(text);
    if(o.icon === "right") b.insertAdjacentHTML("beforeend", gwSvg("right", "go"));
    if(o.disabled){ b.disabled = true; if(o.why) b.title = o.why; }
    if(o.again) b.dataset.gwAgain = "";
    if(fn) b.onclick = fn;
    parts.push(b);
  });
  dlg.querySelector(".gw-foot").replaceChildren(...parts);
  if(!inside) return;
  const want = st.want && dlg.querySelector(st.want);
  if(want && !want.disabled){ want.focus(); st.want = null; return; }
  if(dlg.contains(document.activeElement) && document.activeElement !== dlg) return;
  (dlg.querySelector(".gw-foot .gw-b.go:not([disabled])") || dlg).focus();
}
/* The permission, asked in the game while the dialog waits: the states
   web/app.js reports, drawn in the write's own dialog. */
function gwAsking(dlg, state, info){
  const st = gwState(dlg);
  const cancel = [tt("nav.dlg.cancel", "Cancel"), () => info.cancel && info.cancel(), {kind: "ghost"}];
  const hint = "";
  if(state === "retry") return gwPaint(dlg, {phase: "approval", wire: "busy", say: `<b>${tt("nav.dlg.say.question", "The game is busy with a question")}</b>`,
    body: `<p class="gw-said">${tt("nav.dlg.retry.text", "The game is still answering an earlier request. Asking again in {n} s…", {n: Number(info.wait) || 1})}</p>`, hint, buttons: [cancel]});
  const where = () => tt("nav.dlg.waiting.where", "Allow is a button in the game window, not on this picture. The game closes that question after about 60 seconds.");
  const note = () => `<p class="gw-lead" id="gwSceneNote">${where()}</p>`;
  if(state !== "waiting") return gwPaint(dlg, {phase: "approval", wire: "ask", say: `<b>${tt("nav.dlg.say.asking", "Asking the game…")}</b>`,
    body: `${gwScene()}<p class="gw-lead">${tt("nav.dlg.about.text", "The game is about to ask you, on its own screen, whether this browser may change it.")}</p>${note()}`, hint, buttons: [cancel]});
  const since = info.since || Date.now();
  const clock = () => { const s = Math.max(0, Math.floor((Date.now() - since) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
  const waiting = () => gwPaint(dlg, {phase: "approval", wire: "wait", say: `<b>${tt("nav.dlg.say.waiting", "Waiting for you in the game")}</b>`, meta: clock(),
    body: `${gwScene()}<p class="gw-lead">${info.resumed ? tt("nav.dlg.waiting.open", "The question is still open in the game.") + " " : ""}${
      tt("nav.dlg.waiting.text", "The game is asking you on its screen.")} <b>${tt("nav.dlg.waiting.do", "Switch to Big Ambitions and choose Allow.")}</b> ${
      tt("nav.dlg.waiting.once", "It asks once for this browser.")}</p>${note()}`,
    hint, buttons: [cancel]});
  /* The game closes its question after about 60 seconds; halfway, the dialog
     asks whether the game is where the player can see it. The clock keeps going. */
  const quiet = keepTick => gwPaint(dlg, {phase: "approval", wire: "wait", say: `<b>${tt("nav.dlg.say.still", "Still waiting")}</b>`, meta: clock(), keepTick,
    body: gwBox("clock", "wait", `<b>${tt("nav.dlg.quiet.lead", "No answer from the game yet.")}</b> ${
      tt("nav.dlg.quiet.text", "Is the game paused in a menu, or minimised?")} ${where()}`),
    hint, buttons: [cancel]});
  const late = () => Date.now() - since >= 30000;
  let shown = late() ? "quiet" : "waiting";
  if(shown === "quiet") quiet(false); else waiting();
  st.tick = setInterval(() => {
    if(!dlg.open) return clearInterval(st.tick);
    if(shown === "waiting" && late()){ shown = "quiet"; return quiet(true); }
    const meta = dlg.querySelector(".gw-meta");
    if(meta) meta.textContent = clock();
  }, 1000);
}
/* The approval view SOURCE.write() reports to: the dialog shows each state,
   and its Cancel (or closing it) stops this page waiting. `allowed` hears when
   the game said yes. */
function gwApprovalView(dlg, allowed){
  const st = gwState(dlg);
  return (state, info = {}) => {
    if(!dlg.open) return;
    st.cancel = state === "end" || state === "approved" ? null : info.cancel || null;
    if(state === "approved") return allowed();
    if(state === "end") return;
    gwAsking(dlg, state, info);
  };
}
/* `retry` repeats what failed; `recheck` is what may follow a write that got
   no answer, once the board has read the game again: the dry run afresh,
   never the write itself. */
function gwFailed(dlg, spec, res, retry, recheck){
  const p = gwProblem(res);
  const close = [tt("nav.dlg.close", "Close"), () => dlg.close(), {kind: "ghost", close: true}];
  if(p.uncertain){
    gwPaint(dlg, {phase: "uncertain", wire: "wait", say: `<b>${tt("nav.dlg.say.noanswer", "No answer")}</b>`, meta: gwNow(),
      body: `<p class="gw-said gw-warn">${p.text}</p><div class="gw-reread"><span>${tt("nav.dlg.reread.first", "Reading the game again before anything else is offered")}</span><div class="gw-prog gw-warn"><i></i></div></div>`,
      hint: tt("nav.dlg.noundo.hint", "No Undo: what it would restore is unknown."), buttons: [close]});
    Promise.resolve(res.reread).catch(() => {}).then(() => {
      if(!dlg.open) return;
      if(recheck) return recheck();
      gwPaint(dlg, {phase: "uncertain", wire: "ok", say: `<b>${tt("nav.dlg.say.uptodate", "The board is up to date")}</b>`, meta: gwNow(),
        body: `<p class="gw-said gw-warn">${p.text}</p>${gwBox("refresh", "dim", `<b>${tt("nav.dlg.uptodate.lead", "The board now shows what the game holds.")}</b> ${
          tt("nav.dlg.uptodate.text", "Check it there: the warning is gone if it went through.")}`)}`,
        buttons: ["|", [tt("nav.dlg.close", "Close"), () => dlg.close(), {kind: "go", close: true}]]});
    });
    return;
  }
  const refused = res.error === "refused" && res.body;
  const text = p.box ? gwBox(p.box[0], p.box[1], p.text) : `<p class="gw-said${p.wire === "no" ? " gw-neg" : ""}">${p.text}</p>`;
  const drift = p.drift ? `<div class="gw-drift"><div><span class="gw-lab">${tt("nav.dlg.drift.read", "Board read")}</span><b>${gwBoardRead() || "—"}</b></div><span class="ar" aria-hidden="true"></span><div class="now"><span class="gw-lab">${
    tt("nav.dlg.drift.now", "Game now")}</span><b>${gwNow() || "—"}</b></div></div>` : "";
  /* A refusal is said once: as cards, or in the drawing where the kind says it there. */
  const body = (refused ? (spec.inline ? "" : gwRefusals(spec, res.body)) + (spec.draw ? spec.draw(res.body, "refused") : "")
    : `${text}${p.sub && !p.drift ? `<p class="gw-sub">${p.sub}</p>` : ""}${drift}${p.drift ? `<p class="gw-lead">${p.sub}</p>` : ""}`);
  /* A wait the game named keeps the button off until it has run out. */
  const again = p.again || tt("nav.dlg.tryagain", "Try again");
  gwPaint(dlg, {phase: "failed", wire: p.wire, say: p.say, meta: gwNow(), body, hint: refused ? tt("nav.dlg.unchanged", "Nothing was changed.") : "",
    buttons: [close, "|",
      ...(p.refresh ? [[tt("nav.dlg.refresh", "Refresh the board"), () => spec.refreshBoard ? spec.refreshBoard() : (dlg.close(), typeof SOURCE.refresh === "function" && SOURCE.refresh()), {kind: "go", icon: "refresh"}]]
        : p.retry && retry ? [[again, retry, {kind: "go", icon: p.again ? "key" : "refresh", disabled: !!p.wait, why: p.wait ? p.text : "", again: true}]] : [])]});
  if(p.wait && p.retry && retry) setTimeout(() => {
    const b = dlg.querySelector("[data-gw-again]");
    if(b){ b.disabled = false; b.removeAttribute("title"); }
  }, p.wait * 1000);
}

/* One write, confirmed. The spec is the kind's whole say:
     kind, icon, title, where   the write, its icon, and where it is (both
                               may be functions, asked at every paint)
     body()                    the request without dryRun, built at each call
     verdict(answer)           the game's answer in a few words, by the wire
     draw(answer, phase)       the before → after, drawn: phase is ready,
                               applying, done, undone or refused
     meta(answer)              optional: the verdict's right-hand note (the
                               game's clock otherwise)
     object(row)               the name a refused row is about, as a chip
     inline                    optional: refusals are drawn in draw(), not
                               as cards above it
     refusedHint(answer)       optional: the foot's note when the game refuses
     bind(dlg, replan)         optional: wiring for any control in the drawing;
                               replan(control) dry-runs again in place: the
                               drawing stays, the wire asks, and the control
                               that changed shows it is busy
     applyLabel(answer), applying   the Apply button's words, and the verdict
                               while it applies
     done(answer)              one line after an apply, and after its undo;
                               doneBody(answer) optional, the whole drawing
     undoLabel(), undoHint()   optional: Undo's words and the foot's note
                               beside it (null for the usual one)
     changed(answer)           optional: false when an apply changed nothing,
                               which leaves nothing to undo
     nothing()                 optional: why there is nothing to write, which
                               skips the dry run
     more                      optional, {label, go}: a second way on
                               beside Close once an apply went through
     onDone(answer)            optional: heard once an apply went through
     settle(answer)            optional: a promise the dialog waits on, still
                               applying, before it says Done
     onFailed(res)             optional: heard when an apply fails (not
                               when the game approved afresh in an open
                               dialog, which asks the game again)
     onUndo()                  optional: heard once its undo went through
     oneClick                  optional: apply the first successful check from this click
     applyBody(answer, body)   optional: bind apply to the returned quote
     scope                     optional: company/source captured at opening;
                               a pending plan closes when that scope changes
   The dialog dry-runs as it opens, offers Apply only when the game would take
   every row, and after an apply offers Undo until the next write of the kind. */
function gwConfirm(spec){
  let oneClick = !!spec.oneClick;  // only this user gesture; retries and clock changes never auto-apply
  const title = () => typeof spec.title === "function" ? spec.title() : spec.title;
  const where = () => typeof spec.where === "function" ? spec.where() : spec.where || "";
  const dlg = gwDialog(spec.icon, title(), where());
  const st = gwState(dlg);
  dlg.querySelector(".gw-body").dataset.odNeeds = (spec.needs || []).join(" ");
  const stays = () => gwUndoStays(spec.kind);
  const cancel = [tt("nav.dlg.cancel", "Cancel"), () => dlg.close(), {kind: "ghost", close: true}];
  const left = [cancel];
  const current = () => {
    if(!spec.scope || odSameScope(spec.scope, odScope())) return true;
    st.odWait = null;
    dlg.close();
    return false;
  };
  st.odCurrent = current;
  let applying = false;  // one apply per go: a second click must not send a second write
  let judged = "";       // the body the answer on screen judged, as sent
  let whose = "";        // and the game it judged it for
  let last = null;       // that answer
  let seq = 0;           // the newest dry run: an older one's late answer is dropped
  let allowed = false;   // the game approved this browser for the dry run under way
  const view = mine => {
    const show = gwApprovalView(dlg, () => { allowed = true; asking(); });
    return (state, info) => { if(mine === seq && current()) show(state, info); };
  };
  /* A write is judged and sent only on a board that has every section it
     reads (`spec.needs`, odNeed()): until then the dialog says it is being
     worked out, Apply stays off, and the section's arrival plans it again
     (odArrived()). */
  const waiting = () => {
    if(!current()) return true;
    /* The old board can stay clickable after a source selection. Its
       completed sections cannot plan a write for the new source. */
    const rereading = spec.scope && odBoardScope && !odSameScope(odBoardScope, odScope());
    const missing = (spec.needs || []).filter(n => rereading || !odNeed(n));
    const soft = dlg.dataset.phase === "ready" || (dlg.dataset.phase === "asking" && st.soft);
    st.odWait = missing.length ? () => plan({soft}) : null;
    if(!missing.length) return false;
    judged = "";
    /* Keep a judged answer readable through refreshes, including another
       refresh while it is being replanned in place. A section that failed
       takes the full paint instead, which shows the error and Try again. */
    if(soft && !missing.some(odError)){
      quietly();
      dlg.querySelector(".gw-verdict").innerHTML = `${gwWire("ask")}<span><b>${odWords(missing[0])}</b></span>`;
      const go = dlg.querySelector('.gw-foot [data-gw-b="apply"]');
      if(go) go.title = tt("nav.od.dlg.title", "Apply waits for the new board's numbers");
      return true;
    }
    gwPaint(dlg, {phase: "asking", wire: "ask", say: `<b>${odWords(missing[0])}</b>`, meta: "",
      body: odWaitHtml(missing[0]), hint: tt("nav.od.dlg.hint", "Apply waits until this is worked out."),
      buttons: [...left, [spec.applyLabel(null), null, {kind: "go", icon: "right", disabled: true, key: "apply"}]]});
    return true;
  };
  const nothing = none => gwPaint(dlg, {phase: "nothing", wire: "ok", say: (spec.nothingSay && spec.nothingSay()) || `<b>${tt("nav.dlg.say.nothing", "Nothing to write")}</b>`, meta: gwNow(),
    body: `<p class="gw-said">${none}</p>`,
    buttons: ["|", [tt("nav.dlg.close", "Close"), () => dlg.close(), {kind: "go", close: true}]]});
  const asking = () => gwPaint(dlg, {phase: "asking", wire: "ask",
    say: allowed ? `<b>${tt("nav.dlg.say.allowed.lead", "Allowed.")}</b> ${tt("nav.dlg.say.allowed.asking", "Asking the game what it would do…")}`
      : `<b>${tt("nav.dlg.say.asking", "Asking the game…")}</b>`, meta: allowed ? "" : tt("nav.dlg.dryrun", "dry run"),
    body: (allowed ? gwBox("tick", "", `<b>${tt("nav.dlg.approved.lead", "This browser may now change your game.")}</b> ${
        tt("nav.dlg.approved.text", "The game remembers it and will not ask again; “Forget approved browsers” in the Big Copilot Link options takes it back.")}`) : "")
      + `<div class="gw-skel" aria-hidden="true"><i></i><i></i>${allowed ? "" : "<i></i>"}</div>`,
    hint: allowed ? tt("nav.dlg.next.hint", "Next: the game's answer.") : tt("nav.dlg.wait.hint", "Apply waits for the game's answer."),
    buttons: [...left, [spec.applyLabel(null), null, {kind: "go", icon: "right", disabled: true, key: "apply"}]]});
  /* How plan() runs: `asked`, the approval the game gave for an Apply just
     now, so the dry run that follows it does not ask a second time; `soft`,
     a control changed in a dialog that shows the game's answer, so the
     drawing stays where it is while the wire asks, `from` being the control;
     `undone`, the undo just made, said once above the fresh answer. */
  const plan = async (o = {}) => {
    if(!current()) return;
    const mine = ++seq, autoApply = oneClick;
    oneClick = false;
    judged = "";
    gwHead(dlg, title(), where());
    if(waiting()) return;
    const none = spec.nothing ? spec.nothing() : "";
    if(none) return nothing(none);
    /* In place only over the game's answer on screen, or over one already
       being asked about in place: a second change while the first is asked. */
    if(o.soft && (dlg.dataset.phase === "ready" || (dlg.dataset.phase === "asking" && st.soft))) quietly(o.from);
    else asking();
    const body = spec.body();
    const sent = JSON.stringify(body), game = gwWhose(), board = D;
    /* A write with nothing for the game to do answers here (spec.local). */
    const here = spec.local ? spec.local(body, true) : null;
    const res = here ? {status: 200, error: null, body: here}
      : await SOURCE.write(spec.kind, body, {dryRun: true, approval: view(mine), asked: typeof o.asked === "string" ? o.asked : ""});
    if(!dlg.open || mine !== seq || !current()) return;
    /* "Allowed." is said once: a Try again after this does not say it again. */
    if(res.error){ allowed = false; return gwFailed(dlg, spec, res, () => plan(), () => plan()); }
    /* A dry run that outlived its board (approval may span a refresh)
       cannot judge the new one: wait for its sections and check again
       before offering Apply. The recheck is reviewed, never auto-applied:
       a one-click write stops at Apply on purpose. */
    if(board !== D) return plan();
    /* The answer on screen and the body it judged go together. */
    const answer = last = res.body || {};
    judged = sent;
    whose = game;
    if(spec.learn) spec.learn(answer);
    /* A dry run that would change nothing is said in one line, and Apply
       stays off: never an Apply that does nothing (`spec.idle`). */
    const idle = answer.ok && spec.idle ? spec.idle(answer) : "";
    const top = st.soft ? dlg.querySelector(".gw-body").scrollTop : null;
    gwPaint(dlg, {phase: "ready", wire: answer.ok ? "ok" : "no", say: idle ? `<b>${idle}</b>` : spec.verdict(answer), meta: spec.meta ? spec.meta(answer) : gwNow(),
      body: idle ? "" : (answer.ok || spec.inline ? "" : gwRefusals(spec, answer)) + spec.draw(answer, "ready"),
      hint: idle ? "" : answer.ok ? spec.hint || "" : spec.refusedHint ? spec.refusedHint(answer) : tt("nav.dlg.unchanged", "Nothing was changed."),
      warn: !answer.ok && !!spec.refusedHint,
      /* Refused, nothing is left to cancel: the dialog closes. */
      buttons: [...(answer.ok ? left : [[tt("nav.dlg.close", "Close"), () => dlg.close(), {kind: "ghost", close: true}]]),
        /* The game moved on since the board was read: the way on is to read it again. */
        ...(gwMovedOn(answer) ? [[tt("nav.dlg.refresh", "Refresh the board"), () => spec.refreshBoard(), {kind: "go", icon: "refresh"}]]
          /* Refused: fixed in the game, the game is asked again from here. */
          : [...(idle || (!answer.ok && gwFixable(answer)) ? [[tt("nav.dlg.tryagain", "Try again"), () => plan(), {kind: "ghost", icon: "refresh", key: "retry"}]] : []),
             [spec.applyLabel(answer), apply, {kind: "go", icon: "right", disabled: !answer.ok || !!idle,
               why: idle ? "" : tt("nav.dlg.wouldrefuse", "The game would refuse this; see above"), key: "apply"}]])]});
    allowed = false;
    /* An idle answer is asked again at the player's Try again, and by
       itself once `spec.idleAt()` moves on (gwIdleAgain(), after every
       render and every tick of the game's clock): an agency may have opened. */
    st.idle = idle ? {at: spec.idleAt ? spec.idleAt() : "", now: spec.idleAt || null, ask: () => plan({soft: true})} : null;
    if(spec.bind) spec.bind(dlg, from => plan({soft: true, from}));
    if(top !== null) dlg.querySelector(".gw-body").scrollTop = top;
    if(autoApply && answer.ok && !idle) apply();
  };
  /* The game asked again from a dialog that shows its answer: the answer on
     screen stays until the new one replaces it; the wire asks, Apply waits,
     and the control that changed says it is busy. */
  const quietly = from => {
    gwKeepFocus(dlg, '.gw-foot [data-gw-b="apply"]');
    st.soft = true;
    dlg.dataset.phase = "asking";
    dlg.querySelector(".gw-verdict").innerHTML = `${gwWire("ask")}<span><b>${tt("nav.dlg.say.asking", "Asking the game…")}</b></span><span class="gw-meta">${tt("nav.dlg.dryrun", "dry run")}</span>`;
    dlg.querySelector(".gw-body").setAttribute("aria-busy", "true");
    const go = dlg.querySelector('.gw-foot [data-gw-b="apply"]');
    if(go){ go.disabled = true; go.title = tt("nav.dlg.wait.title", "Apply waits for the game's answer"); }
    dlg.querySelectorAll(".gw-busy").forEach(x => x.classList.remove("gw-busy"));
    if(from && from.classList) from.classList.add("gw-busy");
  };
  const apply = async () => {
    if(applying) return;
    /* A board read again since the dry run may not have the sections yet. */
    if(waiting()) return;
    /* The board may have been read again since the dry run. */
    const none = spec.nothing ? spec.nothing() : "";
    if(none) return nothing(none);
    /* Apply sends only what the game has judged: a board read again since, a
       changed control, or another company in the game asks the game again
       first. */
    if(!judged || JSON.stringify(spec.body()) !== judged || gwWhose() !== whose) return plan({soft: true});
    applying = true;
    gwPaint(dlg, {phase: "applying", wire: "ask", say: `<b>${spec.applying}</b>`, body: spec.draw(last || {}, "applying"),
      buttons: ["|", [tt("nav.dlg.applying", "Applying"), null, {kind: "go", busy: true, disabled: true}]]});
    const local = spec.local ? spec.local(JSON.parse(judged), false) : null;
    const applyBody = spec.applyBody ? spec.applyBody(last, JSON.parse(judged)) : JSON.parse(judged);
    const res = local ? {status: 200, error: null, body: local} : await SOURCE.write(spec.kind, applyBody, {dryRun: false, approval: view(seq)});
    if(res.error){
      /* No answer: whether the game holds it is unknown, and so is what an
         undo would restore. */
      if(res.error === "uncertain") delete gwUndoable[spec.kind];
      applying = false;
      /* Approved again mid-apply: the apply was not sent twice; the player
         reviews the game's answer afresh first, on the same approval. */
      if(res.error === "reapproved" && dlg.open) return plan({asked: res.asked});
      if(spec.onFailed) spec.onFailed(res);
      allowed = false;
      return dlg.open ? gwFailed(dlg, spec, res, () => plan(), () => plan()) : gwToast();
    }
    applying = false;  // done: after an undo the write can be applied again
    const answer = res.body || {};
    /* An apply replaces its kind's undo, with nothing when it changed nothing. */
    const undoable = !spec.changed || spec.changed(answer);
    if(undoable) gwUndoable[spec.kind] = {spec, text: spec.done(answer), sub: stays(),
                                           whose: gwWhose(), at: Date.now(), sites: spec.sites ? spec.sites() : null};
    else delete gwUndoable[spec.kind];
    if(spec.onDone) spec.onDone(answer);
    /* Work the kind does after the write (an older mod's chained weeks): the
       dialog stays applying until it is over. */
    const settling = spec.settle ? spec.settle(answer) : null;
    if(settling) await Promise.resolve(settling).catch(e => { if(window.console) console.error(e); });
    if(!dlg.open) return gwToast();
    gwHead(dlg, title(), where());
    /* The board reads the game again; the line under the drawing says when it has. */
    st.board = D;
    const hint = spec.undoHint ? spec.undoHint() : null;
    gwPaint(dlg, {phase: "done", wire: "ok", say: `<b>${tt("nav.dlg.say.done", "Done in the game")}</b>`, meta: gwNow(),
      body: (spec.doneBody ? spec.doneBody(answer, spec) : `<p class="gw-said ok nx-sr">${spec.done(answer)}</p>${spec.draw(answer, "done")}`) + gwReread(false),
      hint: !undoable ? "" : typeof hint === "string" ? hint : "",
      buttons: [...(undoable ? [[spec.undoLabel ? spec.undoLabel() : tt("nav.dlg.undo.button", "Undo"), () => gwUndo(spec, dlg), {kind: "undo", icon: "undo", key: "undo"}]] : []), "|",
        ...(spec.more ? [[spec.more.label, spec.more.go, {kind: "ghost", key: "more"}]] : []),
        [tt("nav.dlg.close", "Close"), () => dlg.close(), {kind: "go", close: true}]]});
  };
  /* After an undo in this dialog: the undo said, and the write offered
     again once a board has been built since the undo answered, from the same
     source and company as the undo (`undo` is {source, whose}); another
     source or company closes it again. Weighed on every board built, never on
     a timer. A board that has still not caught up with the undo is caught by
     the game: the write's `expect` no longer matches, the dry run answers
     `changed`, and the way on is a refresh. Should the board's read give up,
     a refresh is offered, and the wait goes on. */
  st.replan = (undone, undo) => {
    const mine = ++seq;
    st.built = false;  // set by the next board built
    st.board = null;   // the apply's "read again" line is this gate's now
    gwHead(dlg, title(), where());
    let shown = "";
    const gate = force => {
      if(!dlg.open || mine !== seq){ if(st.gate === gate) st.gate = null; return; }
      const l = gwLink();
      const same = !!l && l.source === undo.source && gwWhose() === undo.whose;
      const fresh = same && st.built;
      const stuck = same && !fresh && gwReadStuck;
      /* Drawn again only when it says something new: a board built with
         nothing to change keeps the click, the focus and the screen reader's peace. */
      const key = `${same}|${fresh}|${stuck}`;
      if(key === shown && force !== true) return;
      shown = key;
      gwPaint(dlg, {phase: "undone", wire: "ok", say: `<b>${tt("nav.dlg.say.undone", "Undone in the game")}</b>`, meta: gwNow(),
        body: `<div class="gw-reread done">${gwSvg("undo")}<span>${undone}</span></div>${fresh ? gwReread(true)
          : !same ? `<p class="gw-sub">${tt("nav.dlg.undone.unlinked", "The board is no longer linked to the game this was undone in.")}</p>`
          : stuck ? `<p class="gw-sub">${tt("nav.dlg.undone.stuck", "The board could not read the game after the undo. Refresh it to go on.")}</p>` : gwReread(false)}`,
        hint: fresh || !same ? "" : tt("nav.dlg.undone.hint", "Offered again once the board has read the game."),
        buttons: [...left,
          ...(stuck ? [[tt("nav.dlg.refresh", "Refresh the board"), () => { if(typeof SOURCE.refresh === "function") SOURCE.refresh(); }, {kind: "ghost", icon: "refresh", key: "refresh"}]] : []),
          [spec.againLabel || tt("nav.dlg.applyagain", "Apply again"), () => { st.gate = null; plan(); },
           {kind: "go", icon: "right", disabled: !fresh, why: !same ? tt("nav.dlg.unlinked", "The board is no longer linked to this game")
             : tt("nav.dlg.rereading", "Reading the game again…"), key: "again"}]]});
    };
    st.gate = gate;
    gate(true);
  };
  /* The board read again at the player's word: the dialog closes. */
  spec.refreshBoard = () => {
    if(typeof SOURCE.refresh !== "function") return dlg.close();
    dlg.close(); return SOURCE.refresh();
  };
  /* A new board suspends an unfinished review unless approval is pending.
     Completed writes keep their result and Undo. */
  st.odBoard = () => {
    if(applying || ["applying", "done", "undone"].includes(dlg.dataset.phase)) return;
    /* Keep the game's pending question visible while staffing recalculates.
       plan() rechecks the new board once this request has an answer. */
    if(dlg.dataset.phase === "approval"){ current(); return; }
    if((spec.needs || []).some(n => !odReady(n))) plan({soft: true});
  };
  plan();
}
/* Undo the kind's last write. In the write's own dialog the dialog goes back
   to that write, asked afresh; from the strip, the dialog it opens says what
   was undone and closes. */
async function gwUndo(spec, dlg){
  if(!(dlg && dlg.open)){
    dlg = gwDialog(spec.icon, tt("nav.dlg.undo.title", "Undo: {title}", {title: typeof spec.title === "function" ? spec.title() : spec.title}),
      typeof spec.where === "function" ? spec.where() : spec.where || "");
  }
  const st = gwState(dlg);
  if(st.replan && dlg.dataset.phase){
    /* In the write's own dialog the drawing stays while the game undoes it. */
    gwKeepFocus(dlg, ".gw-foot button");
    dlg.dataset.phase = "applying";
    dlg.querySelector(".gw-verdict").innerHTML = `${gwWire("ask")}<span><b>${tt("nav.dlg.say.undoing", "Undoing in the game…")}</b></span>`;
    dlg.querySelectorAll(".gw-foot button").forEach(b => { b.disabled = true; });
  } else gwPaint(dlg, {phase: "applying", wire: "ask", say: `<b>${tt("nav.dlg.say.undoing", "Undoing in the game…")}</b>`,
    buttons: ["|", [tt("nav.dlg.undoing", "Undoing"), null, {kind: "go", busy: true, disabled: true}]]});
  /* The game and source the undo is sent to: its gate opens only on a board of the same. */
  const sentTo = {source: (gwLink() || {}).source, whose: gwWhose()};
  gwReadStuck = false;  // an earlier write's failed read is not this undo's
  const res = await SOURCE.write("undo", {kind: spec.kind}, {dryRun: false, approval: gwApprovalView(dlg, () => {})});
  /* Gone for good once the game says so; kept for a retry when it only could
     not take it now. */
  if(!res.error || ["changed", "nothing_to_undo", "uncertain"].includes(res.error)) delete gwUndoable[spec.kind];
  if(!dlg.open) return gwToast();
  /* An undo that got no answer is never sent again on its own. */
  if(res.error){
    /* A refresh after a failed undo reads the game and leaves the write as it
       stands: the dialog is not asked about the write again. */
    const refreshBoard = () => { dlg.close(); if(typeof SOURCE.refresh === "function") SOURCE.refresh(); };
    return gwFailed(dlg, Object.assign({}, spec, {refreshBoard}), res, () => gwUndo(spec, dlg), null);
  }
  const answer = res.body || {};
  if(spec.onUndo) spec.onUndo();
  if(st.replan) return st.replan(spec.done(answer), sentTo);
  st.board = D;
  gwPaint(dlg, {phase: "undone", wire: "ok", say: `<b>${tt("nav.dlg.say.undone", "Undone in the game")}</b>`, meta: gwNow(),
    body: `<p class="gw-said ok">${spec.done(answer)}</p>${spec.draw ? spec.draw(answer, "undone") : ""}${gwReread(false)}`,
    buttons: ["|", [tt("nav.dlg.close", "Close"), () => dlg.close(), {kind: "go", close: true}]]});
}
/* Undo, once the dialog is closed: a strip at the foot of the window until
   the next write of that kind, or until the board is another character's or
   another company's. */
function gwToast(){
  const link = gwLink();
  for(const kind of Object.keys(gwUndoable))
    if(!link || gwWhose() !== gwUndoable[kind].whose) delete gwUndoable[kind];
  /* The newest apply's undo; an older kind's comes back once that one is gone. */
  const last = Object.values(gwUndoable).sort((a, b) => b.at - a.at)[0];
  let bar = $("gwToast");
  if(!last || gwOpen){ if(bar) bar.remove(); return; }
  /* The same undo as the strip already shows: left alone, so a refresh does
     not take the focus off its Undo button or announce it again. */
  if(bar && bar._gwLast === last) return;
  if(!bar){
    bar = document.createElement("div");
    bar.id = "gwToast"; bar.setAttribute("role", "status");
    document.body.appendChild(bar);
  }
  const {spec, text, sub} = last;
  bar.innerHTML = `<span class="ic" aria-hidden="true">${gwSvg("tick")}</span><span class="t">${text}<small>${sub || ""}</small></span><button type="button" class="gw-b undo" data-gw-undo>${
    gwSvg("undo")}<span>${tt("nav.toast.undo", "Undo")}</span></button><button type="button" class="gw-x" data-gw-dismiss aria-label="${attr(tt("nav.toast.dismiss", "Dismiss"))}">${gwSvg("close")}</button>`;
  bar._gwLast = last;
  bar.querySelector("[data-gw-undo]").onclick = () => gwUndo(spec);
  bar.querySelector("[data-gw-dismiss]").onclick = () => { delete gwUndoable[spec.kind]; gwToast(); };
}
/* A dialog that said nothing could change asks the game again once the
   hour it asked at has passed, whether the hour came with a new board or
   only with the game's clock. */
function gwIdleAgain(){
  const dlg = gwOpen, st = gwOpenState(), idle = st && st.idle;
  if(!idle || !idle.now || dlg.dataset.phase !== "ready" || idle.now() === idle.at) return;
  st.idle = null;
  idle.ask();
}
/* After every render: an open dialog whose apply the board has now read
   says so under its drawing. */
function gwReadBack(){
  gwIdleAgain();
  /* The pages on screen are drawn at the game's hour now. */
  if(hasData()) gwMkSig = gwMkOpenSig();
  const dlg = gwOpen, st = gwOpenState();
  /* A dialog waiting on an undo's gate says only what the gate says. */
  if(st && st.gate) return st.gate();
  if(!st || !st.board || st.board === D) return;
  st.board = null;
  const line = dlg.querySelector(".gw-reread:not(.done)");
  /* Read back: the line says so to a screen reader only; a read that failed stays loud. */
  if(line && !line.querySelector(".gw-prog.gw-warn")) line.outerHTML = gwReread(true).replace('class="gw-reread done"', 'class="gw-reread done nx-sr"');
}
/* --- imports: the Weekly imports table's Set to figures, written ---------- */
/* supplyChecklistRows() leaves its rows here: per depot and material, the Set to
   figure, the figure in game and the line's contracts in the order the game
   delivers them. The order itself is the player's to set at the headquarters
   in game; a write never sends one. */
let gwImportRows = [];
/* What the dry runs said of each contract's product, keyed "<contract id>|
   <item>|<depot key>": the importer's cap, what was ordered of the item this
   week and, after an over_cap, what the importer still allows. Cleared with
   every new board. */
const gwTerms = new Map();
const gwDepotKey = r => (D.businesses[r.s] || {}).key;
const gwImportsWritable = () => ((gwLink() || {}).writes || []).includes("imports");
const gwLineKey = (c, slug, depotKey) => `${c.id}|${slug}|${depotKey}`;

/* Sunday 20:00 to Monday 08:00, by the game's clock as the link last read it:
   an amount set then is for the Monday after the week's count resets, so the
   importer allows its whole cap. */
function gwLockWindow(){
  const link = gwLink() || {};
  const day = Number(link.day), hour = Number(link.hour);
  if(!Number.isFinite(day) || !Number.isFinite(hour)) return false;
  return (day % 7 === 0 && hour >= 20) || (day % 7 === 1 && hour < 8);
}
/* What an importer still allows of an item for the delivery a write is for,
   from what the last dry run said of any contract with it; with no cap named
   yet, no bound (the dry run then names one, and the split is made again). */
function gwAllowance(importer, slug){
  let least = Infinity;
  gwImportRows.filter(r => r.slug === slug).forEach(r => r.contracts.forEach(c => {
    if((c.importer || c.id) !== importer) return;
    const t = gwTerms.get(gwLineKey(c, slug, gwDepotKey(r)));
    if(!t || !Number.isFinite(t.cap)) return;
    least = Math.min(least, Number.isFinite(t.max) ? t.max
      : gwLockWindow() ? t.cap : Math.max(0, t.cap - (t.orderedThisWeek || 0)));
  }));
  return least;
}

/* The whole write, one line per depot and material with a change: each
   contract's new amount.

   Smart Delivery puts the Set to level on every Smart Delivery contract of
   the line, so a backup brings only what the ones before it could not; the
   plain contracts on that line keep their amounts, which the level counts.

   Plain amounts come from one walk over every plain contract's products in
   the order the game delivers them: importer by importer (an importer's
   place is its first contract in the plan), each importer's contracts in plan
   order, each contract's products in its own order. A running count per
   importer and item starts at what the importer still allows and takes off
   every product it passes: a product on a line in this write gets what its
   line still needs, as far as the count allows; any other its standing
   amount. So every figure is final when it is set, and what the caps leave of
   a line's week is its `uncovered`, said in the dialog. Smart Delivery
   contracts ahead in that order depend on stock and are not counted, only
   named. A stopped contract starts when one of its products on a line here
   gets something; started, all its products count and each one here is
   written, 0 included. A running contract whose every amount would come to 0
   keeps its amounts, since the game runs no contract with nothing to order
   and a write never stops one; and a product of a running contract that the
   caps leave nothing while its line wants some keeps its own amount, however
   its other products fare. A contract with no purchasing agent cannot
   deliver and is left out. */
function gwImportPlan(depotKey, only = null){
  /* A figure kept from before bases were recorded is reviewed first, never
     written as it stands (importSetting(), `review`). `only` is one line's
     id, for the card's own preview. */
  const lines = gwImportRows
    .filter(r => Number.isFinite(r.value) && (r.changed || (r.paused && r.need > 0)) && D.businesses[r.s] && !r.review
      && (!depotKey || gwDepotKey(r) === depotKey) && (!only || r.impId === only))
    .map(r => ({r, depot: D.businesses[r.s], need: r.smart ? 0 : r.value, uncovered: 0, kept: [], smartAhead: [],
                usable: r.contracts.filter(c => c.agent !== false && !!c.smart === !!r.smart),
                left: r.contracts.filter(c => c.agent === false && !!c.smart === !!r.smart)}));
  const lineOf = new Map(lines.filter(l => !l.r.smart).map(l => [l.r, l]));
  const smartLineOf = new Map(lines.filter(l => l.r.smart).map(l => [l.r, l]));
  const amounts = new Map();  // "<id>|<item>|<depot key>" -> the amount written
  const started = new Set(), smartStarted = new Set();

  /* Every product of every contract the payload places, in delivery order. */
  const walk = gwImportRows.flatMap(r => r.contracts.map(c => ({c, r, line: lineOf.get(r) || null})))
    .sort((a, b) => (a.c.group ?? a.c.order) - (b.c.group ?? b.c.order) || a.c.order - b.c.order
      || (a.c.product ?? 0) - (b.c.product ?? 0));
  const budgets = new Map(), smartSeen = new Map();
  const capKey = e => `${e.c.importer || e.c.id}|${e.r.slug}`;
  const budget = k => budgets.has(k) ? budgets.get(k) : gwAllowance(k.slice(0, k.lastIndexOf("|")), k.slice(k.lastIndexOf("|") + 1));
  /* One contract's products against the counts as they stand: what each gets
     when every one of them orders (`keep`: at its standing amount), and the
     counts after. Nothing is committed. */
  const tryContract = (group, keep) => {
    const left = new Map(), need = new Map();
    const got = group.map(e => {
      const k = capKey(e), room = left.has(k) ? left.get(k) : budget(k);
      if(e.line && !keep){
        const want = need.has(e.line) ? need.get(e.line) : e.line.need;
        const n = Math.max(0, Math.min(want, room));
        need.set(e.line, want - n); left.set(k, room - n);
        return n;
      }
      /* A standing amount (or one a kept contract keeps) is sent as it is, but
         the game delivers only what the importer still allows of it. */
      const n = Math.min(e.c.amount, room);
      if(e.line) need.set(e.line, Math.max(0, (need.has(e.line) ? need.get(e.line) : e.line.need) - n));
      left.set(k, room - n);
      return e.c.amount;
    });
    return {got, left, need};
  };
  const commit = (group, t) => {
    t.left.forEach((v, k) => budgets.set(k, v));
    t.need.forEach((v, l) => { l.need = v; });
    group.forEach((e, i) => { if(e.line) amounts.set(gwLineKey(e.c, e.r.slug, e.depotKey), t.got[i]); });
  };
  for(let i = 0; i < walk.length;){
    let j = i;
    while(j < walk.length && walk[j].c.id === walk[i].c.id && walk[j].c.order === walk[i].c.order) j++;
    const group = walk.slice(i, j);
    i = j;
    group.forEach(e => { e.depotKey = gwDepotKey(e.r); });
    const c = group[0].c;
    if(c.smart){
      /* Named for the plain products after it with the same importer and item,
         at the level it will hold: the one a Smart line here sets, which
         also starts it. */
      if(c.agent === false) continue;
      const setHere = e => { const here = smartLineOf.get(e.r); return here && here.usable.includes(e.c) ? here : null; };
      /* Started when a Smart line here gives any of its products a level. */
      if(!c.active && !group.some(e => setHere(e) && setHere(e).r.value > 0)) continue;
      if(!c.active) smartStarted.add(c.id);
      group.forEach(e => {
        const level = setHere(e) ? setHere(e).r.value : e.c.amount;
        if(!(level > 0)) return;
        const k = capKey(e);
        if(!smartSeen.has(k)) smartSeen.set(k, []);
        smartSeen.get(k).push({c: e.c, r: e.r, level});
      });
      continue;
    }
    if(c.agent === false) continue;
    group.filter(e => e.line).forEach(e => (smartSeen.get(capKey(e)) || []).forEach(s => {
      if(!e.line.smartAhead.some(x => x.c.id === s.c.id && x.r.slug === s.r.slug)) e.line.smartAhead.push(s);
    }));
    if(!c.active){
      const t = tryContract(group, false);
      if(group.some((e, n) => e.line && t.got[n] > 0)){ started.add(c.id); commit(group, t); }
      continue;
    }
    let t = tryContract(group, false);
    if(group.some(e => e.c.amount > 0) && t.got.every(n => n === 0)){
      t = tryContract(group, true);
      group.filter(e => e.line).forEach(e => { if(!e.line.kept.includes(e.c)) e.line.kept.push(e.c); });
    } else {
      /* A product the caps leave nothing while its line still wants some,
         beside one the contract still writes: writing it 0 would stop what
         it brings. It keeps its standing amount, which the cap passes nothing
         of, and the line's week stays uncovered, said in the dialog. */
      group.forEach((e, n) => {
        if(!e.line || t.got[n] !== 0 || !(e.c.amount > 0) || !(t.need.get(e.line) > 0)) return;
        t.got[n] = e.c.amount;
        if(!e.line.kept.includes(e.c)) e.line.kept.push(e.c);
      });
    }
    commit(group, t);
  }

  lines.forEach(l => {
    const {r, depot} = l;
    /* Why a week is left uncovered: the caps, no contract that runs, or none at all. */
    l.cause = l.usable.length ? "caps"
      : r.contracts.some(c => !!c.smart === !!r.smart) ? (r.smart ? "smartAgent" : "agent") : "none";
    if(r.smart){
      /* A Smart contract this write starts is written on every line here, 0 included. */
      l.contracts = l.usable.map(c => ({c, amount: r.value}))
        .filter(({c, amount}) => c.active ? amount !== c.amount : smartStarted.has(c.id));
      return;
    }
    l.uncovered = l.need;
    l.contracts = l.usable.map(c => ({c, amount: amounts.has(gwLineKey(c, r.slug, depot.key))
        ? amounts.get(gwLineKey(c, r.slug, depot.key)) : c.active ? c.amount : 0}))
      .filter(({c, amount}) => started.has(c.id) || (c.active && amount !== c.amount));
  });
  return lines;
}
/* The lines a write would change: what the "Apply N changes" buttons count. */
const gwImportLines = (depotKey, only = null) => gwImportPlan(depotKey, only).filter(l => l.contracts.length);
/* What a plan leaves uncovered, said the same way in the dialog and when
   there is nothing to write. */
const GW_UNCOVERED = {
  get caps(){ return tt("sb.gw.unc.caps", "the importers' caps are reached"); },
  get agent(){ return tt("sb.gw.unc.agent", "no contract for it here has a purchasing agent"); },
  get smartAgent(){ return tt("sb.gw.unc.smartAgent", "no Smart Delivery contract here has a purchasing agent"); },
  get none(){ return tt("sb.gw.unc.none", "no contract here"); }};
/* A line a write leaves short, or leaves as it is when the Set to box asks
   otherwise: the row, the dialog and the empty dialog all say why, and the
   same way. */
const gwNeedsWord = l => !l.contracts.length && (l.uncovered > 0 || l.cause !== "caps" || l.kept.length > 0);
/* Why, as sentences: `place` names the material and depot, for the dialog. */
function gwLineWords(l, place){
  const item = spEsc(l.r.item), depot = spEsc(l.depot.name), why = GW_UNCOVERED[l.cause];
  const words = [];
  if(l.uncovered > 0) words.push(place
    ? tt("sb.gw.unc.at", "<b>{n:,} a week of {item} at {depot} not covered</b>: {why}.", {n: Math.round(l.uncovered), item, depot, why})
    : tt("sb.gw.unc.week", "{n:,} a week not covered: {why}.", {n: Math.round(l.uncovered), why}));
  else if(l.cause !== "caps") words.push(place ? tt("sb.gw.unc.line", "<b>{item} at {depot}</b>: {why}.", {item, depot, why})
    : `${sbCap(why)}.`);
  /* Stopping it is the advice only where the others cover the week; short of
     it, the cap is what leaves the kept contract nothing to bring. */
  l.kept.forEach(c => {
    const who = spEsc(c.importer || tt("sb.gw.aContract", "A contract")), reason = gwKeptWhy(l);
    words.push(place ? tt("sb.gw.kept.at", "<b>{who}</b> keeps its {n:,} a week of {item} at {depot}: {reason}.", {who, n: c.amount, item, depot, reason})
      : tt("sb.gw.kept", "<b>{who}</b> keeps its {n:,} a week: {reason}.", {who, n: c.amount, reason}));
  });
  return words;
}
/* Why a contract a write keeps is kept: the cap leaves it nothing, or a write
   never stops one. */
const gwKeptWhy = l => l.uncovered > 0 ? tt("sb.gw.kept.cap", "its importer's cap leaves it nothing this week")
  : tt("sb.gw.kept.never", "a write never stops a contract; stop it in BizMan");
/* The request: one entry per contract, its products from every line it serves. */
function gwImportBody(lines){
  const byId = new Map();
  lines.forEach(({r, depot, contracts}) => contracts.forEach(({c, amount}) => {
    if(!byId.has(c.id)) byId.set(c.id, {id: c.id, activate: false, products: []});
    const row = byId.get(c.id);
    row.activate = row.activate || (!c.active && amount > 0);
    row.products.push({itemName: r.slug, warehouse: gwAddress(depot.key), amount, expect: c.amount});
  }));
  return {contracts: [...byId.values()]};
}
function gwLearnTerms(answer){
  (answer.rows || []).forEach(row => (row.products || []).forEach(p => {
    if(!p || !p.warehouse) return;
    const key = `${row.id}|${p.itemName}|${p.warehouse.street}#${p.warehouse.number}`;
    const was = gwTerms.get(key) || {};
    const cap = Number.isFinite(p.cap) ? p.cap : null;
    const orderedThisWeek = Number.isFinite(p.orderedThisWeek) ? p.orderedThisWeek : 0;
    /* A later answer names `max` only with an over_cap; the one before still
       stands while the cap and the week's orders it came with do. */
    const same = was.cap === cap && was.orderedThisWeek === orderedThisWeek;
    gwTerms.set(key, {cap, orderedThisWeek,
                      max: Number.isFinite(p.max) ? p.max : same && Number.isFinite(was.max) ? was.max : null});
  }));
}
const gwContract = id => {
  for(const r of gwImportRows) for(const c of r.contracts) if(c.id === id) return c;
  return null;
};
const gwContractName = row => spEsc((gwContract(row.id) || {}).importer || row.importer || tt("sb.gw.aContract", "A contract"));
/* What a refused contract is about, as its chip: the importer and the
   materials the refusal names. */
const gwContractChip = row => {
  const products = (row.products || []).filter(p => p && p.itemName);
  const named = products.filter(p => p.error).length ? products.filter(p => p.error) : products;
  const items = [...new Set(named.map(p => spEsc(itemName(p.itemName))))];
  return `${gwContractName(row)}${items.length ? ` · ${items.join(", ")}` : ""}`;
};
/* The game's answer for one contract's product on a line. */
function gwProduct(answer, c, l){
  const row = (answer.rows || []).find(x => x.id === c.id);
  return row && (row.products || []).find(p => p && p.itemName === l.r.slug && gwKeyOf(p.warehouse) === l.depot.key) || null;
}
/* When orders for Monday close, by the game's clock: inside the window the
   clock itself, else "Sun 20:00 · in 6 h", so the lock is rarely a surprise. */
function gwOrdersClose(){
  const l = gwLink() || {};
  const d = Number(l.day), h = Number(l.hour), m = Number(l.minute) || 0;
  if(!Number.isFinite(d) || !Number.isFinite(h)) return "";
  if(gwLockWindow()) return gwNow();
  const hours = ((7 - ((d % 7) + 7) % 7) % 7) * 24 + 20 - h - m / 60;
  const left = hours >= 48 ? tt("sb.gw.left.d", "{n} d", {n: Math.floor(hours / 24)}) : hours >= 1 ? tt("sb.unit.nh", "{n} h", {n: Math.floor(hours)})
    : tt("sb.gw.left.min", "{n} min", {n: Math.max(1, Math.round(hours * 60))});
  return tt("sb.gw.close", "orders close<br>Sun 20:00 · in {left}", {left});
}
const gwN = n => num(Math.round(Number(n) || 0));
/* The write as the player reads it: a card a material, grouped by depot. The
   bar is what the contracts hold now (grey) and what the write sets (green);
   red hatching past the cap is what the importers' caps leave uncovered. The
   contracts are pills in the game's delivery order, read-only, and every
   sentence about a line sits on its card. */
function gwImportView(lines, answer, phase){
  const rows = answer.rows || [];
  const done = phase === "done";
  const dim = phase === "refused" || (phase === "ready" && answer.ok === false);
  const cash = answer.cash === null || answer.cash === undefined ? NaN : Number(answer.cash);
  const totalOf = r => r.nextDeliveryTotal === null || r.nextDeliveryTotal === undefined ? NaN : Number(r.nextDeliveryTotal);
  const started = rows.filter(r => r.reactivated);
  const top = [];
  /* Each start is weighed on its card; together they can still be more. */
  const totals = started.map(totalOf), sum = totals.reduce((n, v) => n + v, 0);
  if(!done && !dim && started.length > 1 && totals.every(Number.isFinite) && Number.isFinite(cash) && sum > cash)
    top.push(gwCall("neg", "alert", tt("sb.gw.together", {one: "<b>Together the {n} started contracts' next deliveries cost {sum:$}</b>, more than the {cash:$} you hold: the game stops a contract it cannot pay for at delivery.",
      other: "<b>Together the {n} started contracts' next deliveries cost {sum:$}</b>, more than the {cash:$} you hold: the game stops a contract it cannot pay for at delivery."},
      {n: started.length, sum, cash})));
  const aheadSaid = new Set(), startSaid = new Set();
  const card = l => {
    const r = l.r, smart = !!r.smart, unit = smart ? tt("sb.unit.stock", "in stock") : tt("sb.unit.week", "a week");
    const now = Number.isFinite(r.inGame) ? r.inGame : 0;
    const target = Number.isFinite(r.value) ? r.value : 0;
    const after = smart ? target : Math.max(0, target - (l.uncovered || 0));
    const figure = done || now === after
      ? `<span class="gw-num">${gwN(after)}<small>${unit}</small></span>`
      : `<span class="gw-num">${gwFromTo(gwN(now), gwN(after))}<small>${unit}</small></span>`;
    const mode = smart ? `<span class="gw-mode smart" title="${attr(tt("sb.gw.smart.title", "Smart Delivery: keeps this much in stock"))}">${gwSvg("tank")}<span class="gw-sr">${
        tt("sb.gw.smart", "Smart Delivery")}</span></span>`
      : `<span class="gw-mode" title="${attr(tt("sb.gw.weekly.title", "Arrives every Monday"))}">${gwSvg("truck")}<span class="gw-sr">${tt("sb.gw.weekly", "weekly")}</span></span>`;
    let bar = "";
    if(!done && !dim){
      const scale = Math.max(now, target, 1) * 1.12;
      const pc = v => `${(Math.max(0, v) / scale * 100).toFixed(1)}%`;
      const lo = Math.min(now, after), hi = Math.max(now, after);
      bar = `<i class="base${r.paused ? " stopped" : ""}${hi === lo ? " full" : ""}" style="width:${pc(lo)}"></i>`;
      if(after > now) bar += `<i class="add" style="left:${pc(now)};width:${pc(after - now)}"></i>`;
      else if(now > after) bar += `<i class="cut" style="left:${pc(after)};width:${pc(now - after)}"></i>`;
      if(!smart && l.uncovered > 0){
        bar += `<i class="short" style="left:${pc(after)};width:${pc(l.uncovered)}"></i>`;
        if(l.cause === "caps") bar += `<u class="cap" style="left:${pc(after)}"><span>${tt("sb.gw.cap", "cap {n:,}", {n: Math.round(after)})}</span></u>`;
      } else if(now > 0 && now !== after) bar += `<u style="left:${pc(now)};opacity:.7"><span>${tt("sb.gw.now", "now")}</span></u>`;
      bar = `<div class="gw-lvl" aria-hidden="true">${bar}</div>`;
    }
    /* The contracts on the line, in the order the game delivers them. */
    const pills = (done ? [`<span class="gw-chip ok">${gwSvg("tick")}${tt("sb.gw.set", "set")}</span>`] : []).concat(r.contracts.map((c, i) => {
      const row = rows.find(x => x.id === c.id);
      if(done) return row && row.reactivated ? `<span class="gw-chip ok">${gwSvg("play")}${
        tt("sb.gw.started", "{who} started", {who: spEsc(c.importer || tt("sb.imp.importer", "Importer"))})}</span>` : "";
      const p = gwProduct(answer, c, l);
      const terms = p && Number.isFinite(p.unitPrice) ? tt("sb.gw.each", "${p:.2f} each", {p: p.unitPrice}) : "";
      return `<span class="gw-imp${c.active ? "" : " stopped"}"><i><span class="gw-sr">${i + 1}. </span>${c.active ? `<span aria-hidden="true">${i + 1}</span>` : gwSvg("pause")}</i>${
        spEsc(c.importer || tt("sb.imp.importer", "Importer"))}${terms ? `<small>${terms}</small>` : ""}${c.active ? "" : `<small>${tt("sb.gw.stopped", "stopped")}</small>`}${
        c.agent === false ? `<small>${tt("sb.gw.noAgent", "no agent")}</small>` : ""}</span>`;
    })).filter(Boolean);
    /* Every sentence about the line, on its card. */
    const notes = [];
    if(!dim){
      if(l.uncovered > 0) notes.push(gwCall("neg", "cap", done
        ? tt("sb.gw.unc.still", "<b>{n:,} a week still not covered</b>: {why}.", {n: Math.round(Number(l.uncovered) || 0), why: GW_UNCOVERED[l.cause]})
        : tt("sb.gw.unc.bold", "<b>{n:,} a week not covered</b>: {why}.", {n: Math.round(Number(l.uncovered) || 0), why: GW_UNCOVERED[l.cause]})));
      else if(l.cause !== "caps") notes.push(gwCall("warn", "alert", `<b>${sbCap(GW_UNCOVERED[l.cause])}</b>.`));
    }
    if(!done && !dim){
      /* Stopping it is the advice only where the others cover the week; short
         of it, the cap is what leaves the kept contract nothing to bring. */
      l.kept.forEach(c => notes.push(gwCall("warn", "pause", tt("sb.gw.kept", "<b>{who}</b> keeps its {n:,} a week: {reason}.",
        {who: spEsc(c.importer || tt("sb.gw.aContract", "A contract")), n: Math.round(Number(c.amount) || 0), reason: gwKeptWhy(l)}))));
      (l.smartAhead || []).forEach(e => {
        const k = `${e.c.id}|${e.r.slug}`;
        if(aheadSaid.has(k)) return;
        aheadSaid.add(k);
        notes.push(gwCall("info", "tank", tt("sb.gw.ahead", "{who}'s Smart Delivery contract for {item} at {depot} orders first and can use up to {n:,} of the cap.",
          {who: spEsc(e.c.importer || tt("sb.gw.anImporter", "An importer")), item: spEsc(e.r.item),
           depot: spEsc((D.businesses[e.r.s] || {}).name || tt("sb.imp.aDepot", "a depot")), n: Math.round(Number(e.level) || 0)})));
      });
      /* A Smart Delivery write sets the level alone; the plain contracts on the
         line keep their amounts, which the level already counts. */
      const plain = smart && l.contracts.length ? r.contracts.filter(c => !c.smart) : [];
      if(plain.length) notes.push(gwCall("info", "truck", tt("sb.gw.plain", {one: "The plain contract ({list}) is left as it is: the level counts what it brings.",
        other: "The plain contracts ({list}) are left as they are: the level counts what they bring."},
        {n: plain.length, list: sbList(plain.map(c => spEsc(c.importer || tt("sb.imp.importer", "Importer"))))})));
      l.left.forEach(c => notes.push(gwCall("warn", "alert", tt("sb.gw.leftOut", "<b>{who}</b> is left out: no purchasing agent runs it. Assign one at the headquarters to use it.",
        {who: spEsc(c.importer || tt("sb.gw.aContract", "A contract"))}))));
      /* A stopped contract this write starts: its next delivery against the
         cash, and what else starting it starts. */
      started.filter(row => !startSaid.has(row.id) && l.contracts.some(({c}) => c.id === row.id)).forEach(row => {
        startSaid.add(row.id);
        const total = totalOf(row), day = Number(row.nextDeliveryDay);
        const named = new Set((row.products || []).filter(p => p && p.warehouse).map(p => `${p.itemName}|${gwKeyOf(p.warehouse)}`));
        const others = gwImportRows.flatMap(x => (x.contracts || []).filter(c => c.id === row.id).map(c => ({x, c})))
          .filter(({x}) => !named.has(`${x.slug}|${gwDepotKey(x)}`));
        const over = Number.isFinite(total) && Number.isFinite(cash) && total > cash;
        const next = day > 0 ? tt("sb.gw.next.day", "next delivery, day {day}", {day}) : tt("sb.gw.next", "next delivery");
        const bill = Number.isFinite(total)
          ? `<div class="gw-cash">${Number.isFinite(cash) && cash > 0 ? `<div class="tr${over ? " over" : ""}" aria-hidden="true"><i style="--w:${
            Math.min(100, total / cash * 100).toFixed(1)}%"></i></div>` : "<span></span>"}<span>${Number.isFinite(cash)
            ? tt("sb.gw.bill.of", "{next}: <b>{total:$}</b> of {cash:$}", {next, total, cash}) : tt("sb.gw.bill", "{next}: <b>{total:$}</b>", {next, total})}</span></div>`
          : `<div class="gw-cash"><span></span><span>${tt("sb.gw.bill.none", "next delivery: an amount the game did not give")}</span></div>`;
        notes.push(gwCall(over ? "neg" : "warn", "play", `${tt("sb.gw.stoppedRow", "<b>{name} is stopped.</b> This starts it again, with Repeating on.", {name: gwContractName(row)})}${
          over ? ` ${tt("sb.gw.over", "<b>Its next delivery is more than you hold</b>: the game stops a contract it cannot pay for at delivery.")}` : ""}${bill}${others.length
          ? `<div class="gw-chips">${others.map(({x, c}) => `<span class="gw-chip">${gwSvg("play")}${tt("sb.gw.alsoStarts", "also starts: <b>{item}</b> at {depot} · {amount}",
            {item: spEsc(x.item), depot: spEsc((D.businesses[x.s] || {}).name || tt("sb.imp.aDepot", "a depot")),
             amount: c.smart ? tt("sb.gw.inStock", "{n:,} in stock", {n: Math.round(Number(c.amount) || 0)})
               : tt("sb.imp.perWeek", "{n:,} a week", {n: Math.round(Number(c.amount) || 0)})})}</span>`).join("")}</div>` : ""}`));
      });
    }
    /* The basis the figure was planned for, as the card and the copy say it. */
    const basis = (r.basis === "cap" || r.basis === "dem") && r.basis !== sizing
      ? `<p class="gw-basis">${r.edited ? tt("sb.gw.basis.own", "Your figure, planned for {basis}", {basis: `<b>${szNameLow(r.basis)}</b>`})
        : tt("sb.gw.basis", "Planned for {basis}", {basis: `<b>${szNameLow(r.basis)}</b>`})}</p>` : "";
    return `<div class="gw-line${dim ? " dim" : ""}${done ? " ticked" : ""}"><div class="gw-lt"><span class="gw-mat" aria-hidden="true">${gwSvg("crate")}</span><b>${
      spEsc(r.item)}</b>${mode}${figure}</div>${basis}${bar}${pills.length ? `<div class="gw-imps">${pills.join("")}</div>` : ""}${notes.join("")}</div>`;
  };
  const depots = new Map();
  lines.forEach(l => { if(!depots.has(l.depot.key)) depots.set(l.depot.key, []); depots.get(l.depot.key).push(l); });
  const smartIn = lines.some(l => l.r && l.r.smart), weeklyIn = lines.some(l => !(l.r && l.r.smart));
  const legend = done || dim ? "" : `<div class="gw-legend">${smartIn ? `<span class="sm">${gwSvg("tank")}${tt("sb.gw.legend.smart", "Smart Delivery keeps this much in stock")}</span>` : ""}${
    weeklyIn ? `<span>${gwSvg("truck")}${tt("sb.gw.legend.weekly", "arrives every Monday")}</span>` : ""}</div>`;
  const wait = dim && lines.length > 1 ? `<p class="gw-lead">${tt("sb.gw.wait", {one: "Waiting with them, since the {n} go together:", other: "Waiting with them, since the {n} go together:"},
    {n: lines.length})}</p>` : "";
  return top.join("") + legend + wait + [...depots.values()].map(ls => `<div class="gw-depot">${hoodHtml(ls[0].depot)}<span>${
    spEsc(ls[0].depot.name)}</span></div>${ls.map(card).join("")}`).join("");
}

function gwImports(depotKey, only = null){
  const lines = () => gwImportLines(depotKey, only);
  const depot = depotKey ? (D.businesses || []).find(b => b.key === depotKey) : null;
  let sent = null, shown = [], replans = 0, board = D, written = [];
  const changes = () => shown.filter(l => l.contracts.length).length || lines().length;
  gwConfirm({
    kind: "imports", icon: "crate", againLabel: tt("sb.gw.applyAgain", "Apply again"),
    title: tt("sb.gw.imports.title", "Weekly imports"),
    // One depot is named below, on its card; two or more are counted here.
    /* Every write names its site: the depot, one depot's lines under its
       name too, or how many depots. */
    where: () => {
      if(depot) return gwWhere(depot);
      const keys = [...new Set(lines().map(l => l.depot.key))];
      if(keys.length === 1) return gwWhere((D.businesses || []).find(b => b.key === keys[0]) || lines()[0].depot);
      return keys.length > 1 ? `<span>${tt("sb.gw.depots", {one: "{n} depot", other: "{n} depots"}, {n: keys.length})}</span>` : "";
    },
    /* With nothing to write, why each line asking for a change gets none. */
    nothing: () => {
      if(lines().length) return "";
      const plan = gwImportPlan(depotKey, only), said = plan.filter(gwNeedsWord);
      if(said.length) return tt("sb.gw.nothing.why", "Nothing to write. {why}", {why: said.flatMap(l => gwLineWords(l, true)).join(" ")});
      if(gwImportRows.some(r => r.review && r.changed && (!depotKey || gwDepotKey(r) === depotKey) && (!only || r.impId === only)))
        return tt("sb.gw.nothing.review", "Nothing to write yet: a figure kept from before the board recorded a planning basis needs your review first, on Supply › Imports.");
      return plan.length ? tt("sb.gw.nothing.change", "Nothing to write: no contract here would change.")
        : tt("sb.gw.nothing.left", "Nothing left to change: the game holds these figures.");
    },
    /* The request, and the lines it was made from, drawn with the answer. */
    body: () => {
      shown = gwImportPlan(depotKey, only).filter(l => l.contracts.length || gwNeedsWord(l));
      sent = gwImportBody(shown.filter(l => l.contracts.length));
      return sent;
    },
    learn: gwLearnTerms,
    verdict: answer => {
      const rows = answer.rows || [], bad = rows.filter(r => r.error).length, n = changes();
      return `<b>${bad ? tt("sb.gw.refuses", "The game refuses {bad} of {n}", {bad, n: rows.length})
        : n === 1 ? tt("sb.gw.takes.one", "The game takes the change") : n === 2 ? tt("sb.gw.takes.both", "The game takes both")
        : tt("sb.gw.takes.all", "The game takes all {n}", {n})}</b>`;
    },
    meta: () => gwOrdersClose(),
    draw: (answer, phase) => phase === "undone" ? "" : gwImportView(shown, answer, phase),
    // Said only where the write holds more than one change (declutter G8).
    get hint(){ return changes() > 1 ? tt("sb.gw.hint", "Written all together, or not at all.") : ""; },
    object: gwContractChip,
    /* A dry run that named a cap can change how plain amounts split: ask again
       with the split it allows, a few times at most. */
    bind: (dlg, replan) => {
      if(board !== D){ board = D; replans = 0; }  // a new board, new terms: counted afresh
      if(replans < 3 && JSON.stringify(gwImportBody(lines())) !== JSON.stringify(sent)){ replans++; replan(null); }
    },
    applyLabel: () => tt("sb.gw.apply", {one: "Apply {n} change", other: "Apply {n} changes"}, {n: changes()}),
    applying: tt("sb.gw.applying", "Changing the imports in the game…"),
    changed: answer => (answer.rows || []).some(r => r.reactivated || (r.products || []).some(p => p.before !== p.amount)),
    /* Applied: each line written is Applied until a later read shows its
       contracts holding what was written (docs/architecture.md, "Progress:
       marked, applied, confirmed"). */
    onDone: answer => { pgImportsDone(shown, answer); written = pgImportIds(shown); },
    onUndo: () => { pgDrop(written); written = []; },
    done: answer => {
      if(answer.undo) return tt("sb.gw.undone", "Undone: the imports are back as they were.");
      const rows = answer.rows || [];
      const n = rows.reduce((k, r) => k + (r.products || []).filter(p => p.before !== p.amount).length, 0);
      const started = rows.filter(r => r.reactivated).length;
      const parts = [n ? tt("sb.gw.done.set", {one: "{n} amount set", other: "{n} amounts set"}, {n}) : "",
        started ? tt("sb.gw.done.started", {one: "{n} contract started", other: "{n} contracts started"}, {n: started}) : ""].filter(Boolean);
      return parts.length ? tt("sb.gw.done", "{parts} in the game.", {parts: sbCap(sbList(parts))})
        : tt("sb.gw.done.none", "Nothing to change: the game already holds these figures.");
    },
  });
}

/* --- the schedule: a roster's plan, written ----------------------------- */
const GW_HQ = "ba:businesstype_headquarters";
/* The plan a shop's roster shows: the demand plan, or full cover where the
   player picked it. None at a headquarters, whose shifts the game ties to its
   opening hours, and none where nothing was planned. */
function gwRosterPlan(key){
  const b = (D.businesses || []).find(x => x.key === key);
  if(!b || b.typeSlug === GW_HQ) return null;
  /* An office: its demand plan or default, keeping its opening hours. */
  if(b.status === "office"){
    const office = gwOfficeRow(key);
    return office && (office.demandBased || (office.shifts || []).length) ? spRowLess(office) : null;
  }
  if(b.status !== "retail") return null;
  const base = spRosterRow(key);
  if(!base || base.failed) return null;
  const row = spShownRow(base);
  return row.demandBased || (row.shifts || []).length ? spRowLess(row) : null;
}
/* --- every week a write sends, checked per person ------------------------
   The game takes whatever week the mod hands it, and the mod checks overlap,
   not contracts: the office default's additive write once gave a lawyer 60
   hours. So each week a write is about to send (a Staffing write, a hire,
   Quick hire) is checked here, person by person, against the rules the
   planner keeps -- 12 hours an entry and a day, one entry at a time -- and
   their own schedule demands: the hours band (at most 50 without one), an
   exact four or five days, free weekends, the hours they keep free, no
   cleaning. What is still broken is named in the review before the confirm;
   nothing here blocks a write. */
const GW_BANDS = {"ba:jobdemand_fulltime": [30, 50], "ba:jobdemand_parttime": [10, 30]};
const GW_DAYS = {"ba:jobdemand_fourdaysweek": 4, "ba:jobdemand_fivedaysweek": 5};
const GW_CAP = 12, GW_MOST = 50;
/* One person's entries ({d, f, t, st}) against those rules: [{k, ...}]. */
function gwPersonBreaks(list, demands, clean){
  /* No hours at all is no break: whoever a write leaves with none stays on
     as spare, which is fine (Peter, 29 September 2026). */
  if(!list.length) return [];
  const out = [], dem = demands || [];
  const hours = gwHours(list);
  const band = dem.map(d => GW_BANDS[d]).find(Boolean);
  const [lo, hi] = band || [0, GW_MOST];
  if(hours > hi || (band && hours < lo)) out.push({k: band ? "hours" : "most", n: hours, lo, hi});
  const days = new Set(list.map(e => e.d));
  const want = dem.map(d => GW_DAYS[d]).find(Boolean);
  if(want && days.size !== want) out.push({k: "days", n: days.size, want});
  [...days].sort((a, b) => HR_DAYS.indexOf(a) - HR_DAYS.indexOf(b)).forEach(d => {
    const day = list.filter(e => e.d === d).sort((a, b) => a.f - b.f);
    const long = day.find(e => e.t - e.f > GW_CAP);
    const total = gwHours(day);
    /* One long entry is the long day too: said once. */
    if(long) out.push({k: "entry", d, n: long.t - long.f});
    else if(total > GW_CAP) out.push({k: "day", d, n: total});
    if(day.some((e, i) => i && e.f < day[i - 1].t)) out.push({k: "twice", d});
  });
  dem.forEach(slug => {
    const hit = slug === "ba:jobdemand_freeweekends" ? list.some(e => e.d === 6 || e.d === 0)
      : slug === "ba:jobdemand_nocleaning" ? list.some(e => clean(e.st))
      : !!HR_WINDOWS[slug] && list.some(e => HR_WINDOWS[slug].some(([a, b]) => a < e.t && e.f < b));
    if(hit) out.push({k: "demand", slug});
  });
  return out;
}
/* Whether one more entry `e` on a person's week `list` would break a rule:
   past the top of their hours, a day more than their four or five, a long
   entry or day, an overlap, or a demand the entry itself breaks. Only what
   adding can break: a week short of hours is not one entry's doing. */
function gwAddBreaks(list, e, demands, clean){
  const dem = demands || [];
  const band = dem.map(d => GW_BANDS[d]).find(Boolean), want = dem.map(d => GW_DAYS[d]).find(Boolean);
  const day = list.filter(x => x.d === e.d);
  return gwHours(list) + e.t - e.f > (band ? band[1] : GW_MOST)
    || (!!want && !day.length && new Set(list.map(x => x.d)).size >= want)
    || e.t - e.f > GW_CAP || gwHours(day) + e.t - e.f > GW_CAP
    || day.some(x => x.f < e.t && e.f < x.t)
    || gwPersonBreaks([e], dem.filter(d => !GW_BANDS[d] && !GW_DAYS[d]), clean).some(b => b.k === "demand");
}
/* Who someone is to the check: a row's people carry their schedule demands;
   a candidate or somebody moved in carries theirs on the hiring payload. */
const gwWho = (id, row) => {
  const p = ((row || {}).people || []).find(x => x.id === id) || {};
  const h = ((D.hiring || {}).people || {})[id] || {};
  const c = (D.candidates || []).find(x => x.id === id) || {};
  return {name: p.name || h.name || c.name || null, demands: p.demands || h.demands || c.demands || []};
};
/* A row's cleaning stations, by the game's id. */
const gwCleanOf = row => {
  const ids = new Set(((row || {}).stations || []).filter(s => s && s.skill === "ba:skill_cleaning").map(s => s.id));
  return st => ids.has(st);
};
/* The people a week (`days`, as a write sends it) leaves breaking something,
   against the site's row: [{id, name, breaks}]. Somebody whose entries the
   write leaves exactly as the game has them is not the write's to answer
   for. Somebody with hours here now and none in the week is checked against
   an empty week: a write that takes a full-timer's whole week away says so.
   `away` are people the same write moves elsewhere, whose week is there. */
function gwWeekCheck(row, days, away){
  const mine = new Map(), now = new Map();
  (days || []).forEach(({d, shifts}) => (shifts || []).forEach(s => {
    if(!mine.has(s.employeeId)) mine.set(s.employeeId, []);
    mine.get(s.employeeId).push({d, f: s.f, t: s.t, st: s.itemInstanceId});
  }));
  (((row || {}).current || {}).list || []).forEach(s => {
    const who = ((row.people || [])[s.p] || {}).id, st = ((row.stations || [])[s.s] || {}).id;
    if(!spHasId(who)) return;
    if(!now.has(who)) now.set(who, []);
    now.get(who).push(`${s.d}|${s.f}|${s.t}|${st}`);
  });
  const sig = list => list.slice().sort().join(",");
  const clean = gwCleanOf(row), out = [];
  const check = (id, list) => {
    const who = gwWho(id, row);
    const breaks = gwPersonBreaks(list, who.demands, clean);
    if(breaks.length) out.push({id, name: who.name, breaks});
  };
  mine.forEach((list, id) => {
    if(sig(list.map(e => `${e.d}|${e.f}|${e.t}|${e.st}`)) !== sig(now.get(id) || [])) check(id, list);
  });
  return out;
}
/* What the check found, one line a break, each its own sentence; `site`
   names the site on a write that touches several. */
function gwCheckLines(found){
  const line = (b, who) => b.k === "hours" ? tt("sp.gw.chk.hours", "<b>{who}</b>: {n} h a week, asks for {lo} to {hi}", {who, n: b.n, lo: b.lo, hi: b.hi})
    : b.k === "most" ? tt("sp.gw.chk.most", "<b>{who}</b>: {n} h a week, more than {hi}", {who, n: b.n, hi: b.hi})
    : b.k === "days" ? tt("sp.gw.chk.days", "<b>{who}</b>: {n} days a week, asks for {want}", {who, n: b.n, want: b.want})
    : b.k === "entry" ? tt("sp.gw.chk.entry", "<b>{who}</b>: an entry of {n} h on {day}", {who, n: b.n, day: ttDay(b.d)})
    : b.k === "day" ? tt("sp.gw.chk.day", "<b>{who}</b>: {n} h on {day}", {who, n: b.n, day: ttDay(b.d)})
    : b.k === "twice" ? tt("sp.gw.chk.twice", "<b>{who}</b>: two entries at once on {day}", {who, day: ttDay(b.d)})
    : tt("sp.gw.chk.demand", "<b>{who}</b>: the week breaks {demand}", {who, demand: hrName(b.slug)});
  const lines = found.map(p => {
    const name = spEsc(p.name || tt("sp.gw.someone.cap", "Someone"));
    const who = p.site ? tt("sp.gw.chk.who.at", "{name} at {site}", {name, site: p.site}) : name;
    return p.breaks.map(b => `<li>${line(b, who)}</li>`).join("");
  }).join("");
  return found.length ? gwCall("warn", "alert", `${tt("sp.gw.chk.head", {one: "This week breaks a rule or a demand for {n} person:",
    other: "This week breaks a rule or a demand for {n} people:"}, {n: found.length})}<ul class="gw-chk">${lines}</ul>`) : "";
}
/* The hours of the day a week (`days`, as a write sends it) leaves fewer
   people on than the game has now, per station kind and skill, and no more
   than the plan wants there (an hour it wants fewer on is the plan's to cut).
   Only while the plan waits on somebody: then their entries go out empty.
   The full-cover plan is placed without holding anybody where they work now
   unless the shop is open around the clock already (issue #446), so its
   review says it. Returns how many weekday hours. */
function gwFewerNow(row, days){
  const plan = (row || {}).shifts || [];
  const waits = new Set((((row || {}).addPeople || {}).assign || []).map(x => x.p));
  if(!plan.some(s => spNobody(s.p) || waits.has(s.p))) return 0;
  const stations = (row.stations || []), index = new Map(stations.map((st, i) => [st && st.id, i]));
  const kind = i => ((stations[i] || {}).skill) || "";
  const count = (list, at) => {
    const out = new Map();
    list.forEach(s => { for(let h = s.f; h < s.t; h++){ const k = `${at(s)}|${s.d}|${h}`; out.set(k, (out.get(k) || 0) + 1); } });
    return out;
  };
  const now = count(((row.current || {}).list || []).filter(s => !spNobody(s.p)), s => kind(s.s));
  const planned = count(plan, s => kind(s.s));
  const sent = count((days || []).flatMap(({d, shifts}) => (shifts || []).map(s => ({d, f: s.f, t: s.t, s: index.get(s.itemInstanceId)}))),
    s => kind(s.s));
  const hours = new Set();
  now.forEach((n, k) => { if((sent.get(k) || 0) < Math.min(n, planned.get(k) || 0)) hours.add(k.split("|").slice(1).join("|")); });
  return hours.size;
}
/* The week a write sends, from the plan's rows, their station and person
   indices turned back into the game's ids. Only the people already working
   here: a hire's entry has nobody on it and a bench member's somebody not
   assigned here yet, and both stay empty until the player adds them. A
   cover-only plan leaves the serving entries in the game where they are, so
   they go back as they stand: the write replaces the week whole. */
function gwRosterWeek(row){
  const bench = new Set([...(row.bench || []), ...((row.addPeople || {}).assign || [])].map(r => r.p));
  const days = new Map();
  let sent = 0, kept = 0, unreadable = 0, dropped = 0;
  const added = [];  // an office's: the planned entries the write adds
  const left = new Map();  // an office's: person index -> planned hours left out
  const put = s => {
    const st = (row.stations || [])[s.s], who = (row.people || [])[s.p];
    if(!st || !spHasId(st.id) || !who || !spHasId(who.id) || !(s.d >= 0 && s.d < 7)) return false;
    if(!days.has(s.d)) days.set(s.d, []);
    days.get(s.d).push({f: s.f, t: s.t, employeeId: who.id, itemInstanceId: st.id});
    return true;
  };
  if(row.office && !row.demandBased){
    /* An office's write adds, like Quick hire: every entry at the office
       stays as it stands, and the office default's entries for the office's
       own people go in only where that computer and that person are free
       then. Nobody's hours change, so nobody is taken off the office. */
    /* Busy by the rows' own indices, so an entry this board cannot send (a
       station or person with no id) still keeps its hours from an addition;
       and any such entry stops the write (`unreadable`), since the week sent
       replaces the office's and would drop it. */
    const busy = [];
    unreadable += Number(row.unrepresentable) || 0;
    const clash = s => busy.some(b => b.d === s.d && b.f < s.t && s.f < b.t && (b.p === s.p || b.s === s.s));
    /* Each person's week at the office as the write leaves it: an entry
       is added only where their week can take it (gwAddBreaks()), since
       the entries already there are kept whatever they come to. */
    const weeks = new Map(), clean = gwCleanOf(row);
    const entry = s => ({d: s.d, f: s.f, t: s.t, st: ((row.stations || [])[s.s] || {}).id});
    const weekOf = p => { if(!weeks.has(p)) weeks.set(p, []); return weeks.get(p); };
    ((row.current || {}).list || []).forEach(s => {
      busy.push({d: s.d, f: s.f, t: s.t, p: s.p, s: s.s});
      if(!spNobody(s.p)) weekOf(s.p).push(entry(s));
      if(put(s)) kept++; else unreadable++;
    });
    (row.shifts || []).forEach(s => {
      if(spNobody(s.p) || bench.has(s.p) || clash(s)) return;
      if(gwAddBreaks(weekOf(s.p), entry(s), ((row.people || [])[s.p] || {}).demands, clean)){
        dropped++; left.set(s.p, (left.get(s.p) || 0) + s.t - s.f); return;
      }
      if(put(s)){ sent++; added.push(s); busy.push({d: s.d, f: s.f, t: s.t, p: s.p, s: s.s}); weekOf(s.p).push(entry(s)); }
    });
  } else (row.shifts || []).forEach(s => { if(!spNobody(s.p) && !bench.has(s.p) && put(s)) sent++; });
  if(row.office && row.demandBased){
    unreadable += Number(row.unrepresentable) || 0;
    const computers = gwOfficeComputers(row);
    ((row.current || {}).list || []).forEach(s => {
      if(s.k || !computers.has(s.s)){ if(put(s)) kept++; else unreadable++; }
      else if(!spHasId(((row.stations || [])[s.s] || {}).id) || !spHasId(((row.people || [])[s.p] || {}).id)) unreadable++;
    });
  }
  if(!row.office && !row.full && spCoverOnly(row))
    ((row.current || {}).list || []).filter(s => !s.k).forEach(s => { if(put(s)) kept++; });
  return {days: [...days].sort((a, b) => a[0] - b[0]).map(([d, shifts]) => ({d, shifts})), sent, kept, unreadable, added, dropped,
    leftOut: [...left].map(([p, hours]) => ({p, hours}))};
}
/* An office row's computers: the stations of its one role, by index. */
const gwOfficeComputers = row => new Set((row.roles || []).flatMap(r => r.stations || []));
const gwOfficeRow = key => {
  const list = Array.isArray(D.officeStaffing) ? D.officeStaffing : [];
  const row = list.find(r => r.key === key && !r.failed);
  return row ? Object.assign({}, row, {full: false, office: true}) : null;
};

/* Staff this site: where the Staff page's plan hires or reassigns somebody
   into the site, or reassigns its own spares out; whether or not the site
   has a week of its own to write. `alone` wraps it as the block's only act. */
function gwStaffButton(key, alone){
  if(!hrCanHire()) return "";
  if(!odNeed("hiring")) return alone ? odWaitHtml("hiring", true) : "";
  const people = hrSitePeople(key), out = people ? 0 : hrSiteOut(key);
  if(!people && !out) return "";
  const b = gwButton("hire", tt("sp.gw.staff", "Staff this site"), `data-hr-staff="${attr(key)}"`, "", people ? {count: people} : {});
  return alone ? `<div class="gw-acts gw-panel">${b}</div>` : b;
}
/* The site's own write, Staff this site and Staff all sites. How many people
   the plan still waits on stays beside them until they are added, so a
   partial write never reads as the whole week. */
function gwRosterButtons(key){
  if(!gwLink()) return "";
  /* Every write here is reviewed against the Staff page's plan (who can come
     from other sites, who is hired): none is offered before the board has it. */
  if(!odNeed("hiring")) return odWaitHtml("hiring", true);
  const row = gwRosterPlan(key);
  if(!row) return gwStaffButton(key, true);
  /* Staff this site: the one action, where the Staff page's plan hires or
     reassigns somebody into this site (hrSitePeople()); it writes the week
     with them on it, so the "add them first" note below it goes. */
  const staff = gwStaffButton(key);
  const one = gwButton("schedule", tt("sp.gw.sch.one", "Write this schedule to the game"), `data-gw-sites="${attr(JSON.stringify([key]))}"`,
    row.office && gwRosterWeek(row).unreadable ? tt("sp.gw.sch.office.unreadable", "An entry here can't be read; change it in the game first")
      : (row.demandBased && !(row.shifts || []).length) || gwRosterWeek(row).sent ? "" : row.office && !row.demandBased ? (gwRosterWeek(row).dropped ? tt("sp.gw.sch.office.full", "Nothing more fits: the rest of the office default is more than its staff's weeks can take")
        : tt("sp.gw.sch.office.written", "Every entry the office default can add is in the game"))
      : tt("sp.gw.sch.blocked", "Every entry in this plan waits on somebody who does not work here yet: add them first"), {icon: "hire", alt: !!staff});
  /* Every planned site at once: Staff all sites, the one action (spares
     moved first, one Undo), opening on Schedule only where nobody is hired or
     moved. Offered where it reaches more than this site. */
  const many = hrCanHire() && hrAllSites() > 1
    ? gwButton("hire", tt("co.hire.title.all", "Staff all sites"), "data-hr-all", "", {alt: true}) : "";
  const add = row.addPeople || {};
  return one ? `<div class="gw-acts gw-panel">${staff}${one}${many}${add.people && !staff ? `<span class="gw-note">${gwSvg("hire")}${
    tt("sp.gw.sch.empty", {one: "{h} h a week stay empty until {n} person is added", other: "{h} h a week stay empty until {n} people are added"},
      {h: add.hoursUncovered || 0, n: add.people})}</span>` : ""}</div>` : "";
}
const gwInitials = name => String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
/* The hours in a list of entries or slots ({f, t}), for every schedule on the board. */
const gwHours = list => list.reduce((n, s) => n + s.t - s.f, 0);
/* Three figures, now → after. */
const gwTiles = items => `<div class="gw-tiles">${items.map(([label, a, b]) => `<div class="gw-tile"><span class="gw-lab">${label}</span><div class="v">${
  a === b || a === null ? b : `<span class="gw-sr">${tt("sp.gw.tile.from", "from")} </span><s>${a}</s>${gwSvg("right")}<span class="gw-sr"> ${tt("sp.gw.tile.to", "to")} </span>${b}`}</div></div>`).join("")}</div>`;
/* Now, the arrow, after, in an import's card; a screen reader hears "from … to …". */
const gwFromTo = (a, b) => `<span class="gw-sr">${tt("sp.gw.tile.from", "from")} </span><s>${a}</s>${gwSvg("right")}<span class="gw-sr"> ${tt("sp.gw.tile.to", "to")} </span>${b}`;
/* The week a write sends, against the one the board read: a pair of bars a day. */
function gwWeek(now, days){
  const per = HOUR_ROWS.map(d => {
    const a = now.filter(s => s.d === d), b = (days.find(x => x.d === d) || {shifts: []}).shifts;
    return {d, a, b, ah: gwHours(a), bh: gwHours(b)};
  });
  const top = Math.max(1, ...per.map(x => Math.max(x.ah, x.bh)));
  const h = v => `${Math.max(v / top * 64, 2).toFixed(0)}px`;
  const cols = per.map(({d, a, b, ah, bh}) => {
    const delta = bh - ah;
    const dl = delta > 0 ? `<span class="dl gw-up">${tt("sp.gw.week.up", "+{n} h", {n: delta})}</span>` : delta < 0 ? `<span class="dl gw-dn">${tt("sp.gw.week.dn", "−{n} h", {n: -delta})}</span>` : `<span class="dl">=</span>`;
    const entries = n => tt("sp.n.entries", {one: "{n} entry", other: "{n} entries"}, {n});
    const p = {d, was: entries(a.length), wasH: ah, now: entries(b.length), nowH: bh};
    const said = tt("sp.gw.week.said", "{d:day}: {was}, {wasH} h → {now}, {nowH} h", p);
    return `<div class="gw-wd${delta === 0 && a.length === b.length ? " same" : ""}" tabindex="0" data-read="${attr(tt("sp.gw.week.read",
      "<b>{d:day}</b> · {was}, {wasH} h <em>→ {now}, {nowH} h</em>", p))}"><span class="gw-sr">${said}</span>${dl}<div class="bars" aria-hidden="true"><i class="n" style="--h:${
      h(ah)}"></i><i class="a" style="--h:${h(bh)}"></i></div><span class="d" aria-hidden="true">${spWd(d).toUpperCase()}</span></div>`;
  }).join("");
  return `<div data-readzone><div class="gw-week">${cols}</div><div class="gw-keyrow"><div class="gw-read sp-readout">${tt("sp.gw.week.hover", "Hover a day")}</div><div class="gw-key" aria-hidden="true"><span><i></i>${
    tt("sp.gw.now", "now")}</span><span><i class="a"></i>${tt("sp.gw.after", "after")}</span></div></div></div>`;
}
/* The add-people box: who to assign and whom to hire, and the hours written
   now against the hours that wait for them. */
function gwAddBox(add, staffed, from = 0){
  const pills = (add.assign || []).map(p => `<span class="person bench"><i>${spEsc(gwInitials(p.name))}</i>${spEsc(p.name || "?")}<small>${tt("sp.gw.add.unassigned", "unassigned")}</small></span>`)
    .concat((add.hire || []).map(h => `<span class="person hire"><i>${gwSvg("plus")}</i>${h.people} × ${spEsc(h.role || "")}<small>${tt("sp.gw.add.tohire", "to hire")}</small></span>`));
  const empty = Number(add.hoursUncovered) || 0, total = staffed + empty;
  return `<div class="gw-box gw-warn gw-lift">${gwCall("warn", "hire", from ? tt("sp.gw.add.from", {
    one: "<b>Add {n} person to fill this plan</b>: {who}; {h} h a week stay empty until then and until the people from other sites come.",
    other: "<b>Add {n} people to fill this plan</b>: {who}; {h} h a week stay empty until then and until the people from other sites come."}, {n: add.people, who: spAddWords(add), h: empty})
    : tt("sp.gw.add", {
    one: "<b>Add {n} person to fill this plan</b>: {who}; {h} h a week stay empty until then.",
    other: "<b>Add {n} people to fill this plan</b>: {who}; {h} h a week stay empty until then."}, {n: add.people, who: spAddWords(add), h: empty}))}${
    pills.length ? `<div class="gw-pills">${pills.join("")}</div>` : ""}${
    total > 0 ? `<div class="gw-cover" aria-hidden="true"><i class="c" style="flex:${(staffed / total).toFixed(3)}"></i><i class="e" style="flex:${
      (empty / total).toFixed(3)}"></i></div><div class="gw-coverk"><span>${tt("sp.gw.add.written", "<b>{h} h</b> written now", {h: staffed})}</span><span class="w">${
      tt("sp.gw.add.wait", "{h} h wait for them", {h: empty})}</span></div>` : ""}</div>`;
}

/* One site's schedule. Every planned site at once is Staff all sites
   (hrReview()), with the moves and one Undo (Peter, 29 September 2026). */
function gwSchedule(key){
  const site = () => (D.businesses || []).find(x => x.key === key) || null;
  const b = site();
  if(!b) return;
  const name = spEsc(shortName(b));
  let openAll = true, last = null, schedWritten = [];
  gwConfirm({
    /* The company it was opened on: another company's board closes it. */
    kind: "schedule", icon: "roster", needs: ["hiring"], scope: odScope(), againLabel: tt("sp.gw.sch.again", "Write again"),
    /* The site its Undo is for: a later write of the site elsewhere drops it. */
    sites: () => [key],
    title: tt("sp.gw.sch.one", "Write this schedule to the game"),
    where: () => gwWhere(b),
    nothing: () => !gwRosterPlan(key) ? (b.status === "office" ? tt("sp.gw.sch.noplan.office", "This office has no plan to write any more.")
        : tt("sp.gw.sch.noplan", "This shop has no plan to write any more."))
      : b.status === "office" && gwRosterWeek(gwRosterPlan(key)).unreadable
        ? tt("sp.gw.sch.office.unreadable", "An entry here can't be read; change it in the game first")
      : typeof (site() || {}).shiftPrint !== "string" ? (b.status === "office"
        ? tt("sp.gw.sch.reread.office", "Read the game again first: this board does not know the office's schedule well enough to add to it.")
        : tt("sp.gw.sch.reread", "Read the game again first: this board does not know the shop's schedule well enough to replace it."))
      : "",
    body: () => {
      const row = gwRosterPlan(key), week = gwRosterWeek(row);
      last = {row, week, now: (row.current || {}).list || []};
      return {address: gwAddress(key), expect: site().shiftPrint,
              openAllHours: !!(!row.office && row.full && !row.openNow && openAll), days: week.days};
    },
    verdict: answer => answer.ok ? `<b>${tt("sp.gw.sch.takes", "The game takes the week")}</b>` : `<b>${tt("sp.gw.refuses", "The game refuses this")}</b>`,
    object: row => {
      if(row.d === undefined) return name;
      const s = last && ((last.week.days.find(x => x.d === row.d) || {}).shifts || [])[row.i];
      const who = s && (last.row.people || []).find(p => p.id === s.employeeId);
      const day = WEEKDAY_NAMES[row.d] ? ttDay(row.d) : tt("sp.gw.aday.cap", "A day");
      return s ? tt("sp.gw.sch.object", "{day} {f}-{t}, {who}", {day, f: s.f, t: s.t, who: spEsc((who || {}).name || tt("sp.gw.someone", "someone"))}) : day;
    },
    draw: (answer, phase) => {
      if(!last) return "";
      const {row, week, now} = last, add = row.addPeople || {};
      const sentList = week.days.flatMap(x => x.shifts);
      const people = list => new Set(list.map(x => x)).size;
      const nowPeople = people(now.map(s => s.p).filter(p => p !== null && p !== undefined));
      const afterPeople = people(sentList.map(s => s.employeeId));
      if(phase === "undone"){
        const a = Number((answer.before || {}).shifts) || 0, z = Number((answer.after || {}).shifts) || 0;
        return gwTiles([[tt("sp.gw.tile.entries", "Entries"), a, z]]);
      }
      const labels = [tt("sp.gw.tile.entries", "Entries"), tt("sp.gw.tile.hours", "Hours / week"), tt("sp.gw.tile.people", "People")];
      if(phase === "done") return gwTiles([[labels[0], null, sentList.length], [labels[1], null, gwHours(sentList)], [labels[2], null, afterPeople]])
        + (add.people && row.fromOthers ? gwLiftCall("warn", "hire", gwBothWait(add.hoursUncovered, row.fromOthers, add.people))
          : add.people ? gwLiftCall("warn", "hire", tt("sp.gw.sch.doneempty", {
          one: "<b>{h} h a week stay empty</b> until you add {n} person. Write the schedule again then: the board keeps this note until it is full.",
          other: "<b>{h} h a week stay empty</b> until you add {n} people. Write the schedule again then: the board keeps this note until it is full."},
          {h: add.hoursUncovered || 0, n: add.people}))
          /* Nobody to add, and somebody to come from another site: the hours wait on them. */
          : row.fromOthers ? gwLiftCall("warn", "hire", gwFromWait(add.hoursUncovered, row.fromOthers)) : "");
      const whole = tt("sp.gw.plan.whole", "replaces the whole week");
      const which = row.office && !row.demandBased ? `<span class="gw-plan">${gwSvg("roster")}${tt("sp.gw.plan.office", "Office default")}</span><span class="gw-only">${tt("sp.gw.plan.adds", "adds to the week")}</span>`
        : row.full ? `<span class="gw-plan full">${gwSvg("sun")}${tt("sp.pick.full", "Full cover 24/7")}</span><span class="gw-only">${tt("sp.gw.plan.every", "every station, every hour")}</span>`
        : row.variant === "open" ? `<span class="gw-plan">${gwSvg("roster")}${spOffersOpen(spRosterRow(row.key))
          ? tt("sp.pick.openall", "Every open hour") : tt("sp.pick.open", "Open hours")}</span><span class="gw-only">${whole}</span>`
        : !row.office && spCoverOnly(row) ? `<span class="gw-plan">${gwSvg("roster")}${tt("sp.gw.plan.cover", "Cleaning and security")}</span><span class="gw-only">${whole}</span>`
        : `<span class="gw-plan">${gwSvg("roster")}${tt("sp.pick.demand", "Demand plan")}</span><span class="gw-only">${whole}</span>`;
      const fewer = row.full && phase === "ready" ? gwFewerNow(row, week.days) : 0;
      const short = fewer ? gwCall("info", "info", tt("sp.gw.sch.fewer", {
        one: "<b>{n} hour of the week</b> has fewer people than now until you add the people this plan waits on.",
        other: "<b>{n} hours of the week</b> have fewer people than now until you add the people this plan waits on."}, {n: fewer})) : "";
      const kept = week.kept && !row.office ? gwCall("info", "info", tt("sp.gw.sch.kept", {
        one: "The {n} serving entry in the game stays as it stands: this plan covers cleaning and security only.",
        other: "The {n} serving entries in the game stay as they stand: this plan covers cleaning and security only."}, {n: week.kept})) : "";
      /* Full cover opens the shop around the clock, unless the player opts out. */
      let toggle = "";
      if(row.full && !row.openNow && phase === "ready"){
        const open = new Set(((spRosterRow(key) || {}).open || []).flatMap(day => (day || []).flatMap(([a, z]) =>
          [...Array(Math.max(0, Math.min(24, z) - Math.max(0, a))).keys()].map(k => a + k))));
        const strip = (label, all) => `<span>${label}</span><div class="h">${[...Array(24).keys()].map(hr =>
          `<i class="${all || open.has(hr) ? "o" : ""}${all && !open.has(hr) ? " new" : ""}"></i>`).join("")}</div>`;
        toggle = `<div class="gw-toggle${openAll ? "" : " off"}"><div><b id="gwOpenLab">${tt("sp.gw.open", "Also open every day 0 to 24")}</b><small>${
          tt("sp.gw.open.why", "An hour the shop is closed is an hour the demand test never measures.")}</small></div><button type="button" class="sw${
          openAll ? " on" : ""}" role="switch" aria-checked="${openAll ? "true" : "false"}" aria-labelledby="gwOpenLab" data-gw-open></button><div class="gw-hrs" aria-hidden="true">${
          strip(tt("sp.gw.now", "now"), false)}${strip(tt("sp.gw.after", "after"), true)}</div></div>`;
      }
      const roleOf = id => {
        const p = (row.people || []).findIndex(x => x.id === id);
        const s = now.find(x => x.p === p), st = s && (row.stations || [])[s.s];
        return st ? gwSkillName(st.skill) : "";
      };
      const left = (answer.leftWithout || []).map(p => `<span class="person"><i>${spEsc(gwInitials(p.name))}</i>${spEsc(p.name || tt("sp.gw.someone", "someone"))}${
        roleOf(p.employeeId) ? `<small>${roleOf(p.employeeId)}</small>` : ""}</span>`);
      /* An office's write adds: the hours and the people it adds them for. */
      let adds = "";
      if(row.office && !row.demandBased){
        const had = new Set(now.map(s => `${s.d}|${s.f}|${s.t}|${((row.people || [])[s.p] || {}).id}|${((row.stations || [])[s.s] || {}).id}`));
        const added = week.days.flatMap(({d, shifts}) => shifts.map(s => Object.assign({d}, s)))
          .filter(s => !had.has(`${s.d}|${s.f}|${s.t}|${s.employeeId}|${s.itemInstanceId}`));
        const who = [...new Set(added.map(s => s.employeeId))].map(id => spEsc(((row.people || []).find(p => p.id === id) || {}).name || tt("sp.gw.someone", "someone")));
        adds = (added.length ? gwCall("info", "roster", tt("sp.gw.sch.adds", "<b>Adds {h} h for {who}</b>; nobody's current hours change.", {h: gwHours(added), who: who.join(", ")}))
          : week.dropped ? gwCall("info", "roster", tt("sp.gw.sch.office.full", "Nothing more fits: the rest of the office default is more than its staff's weeks can take"))
          : gwCall("info", "roster", tt("sp.gw.sch.office.written", "Every entry the office default can add is in the game")))
          /* The office default's hours left out for someone, one line each. */
          + (week.leftOut || []).map(x => gwCall("warn", "alert", tt("sp.gw.sch.office.left",
            "<b>{name}</b>: {h} h of the office default left out, more than their week can take",
            {name: spEsc(((row.people || [])[x.p] || {}).name || tt("sp.gw.someone.cap", "Someone")), h: x.hours}))).join("");
      }
      const over = (answer.warnings || []).filter(w => w.type === "overworked").map(w =>
        gwCall("warn", "flame", tt("sp.gw.over", "<b>{name}</b> works {n} h on {day}. The game allows it.",
          {name: spEsc(w.name || tt("sp.gw.someone.cap", "Someone")), n: Number(w.hours), day: WEEKDAY_NAMES[w.d] ? ttDay(w.d) : tt("sp.gw.aday", "a day")})));
      return `<div class="gw-planrow">${which}</div>`
        + gwTiles([[labels[0], now.length, sentList.length], [labels[1], gwHours(now), gwHours(sentList)], [labels[2], nowPeople, afterPeople]])
        + gwWeek(now, week.days) + kept + short + toggle
        + (left.length ? `<div class="gw-box">${gwCall("", "exit", tt("sp.gw.left.head", "<b>No hours here after this</b>"))}<div class="gw-pills">${left.join("")}</div></div>` : "")
        /* People elsewhere who fit come before any hire (spRowLess()): said
           in the fixed strip with the add box. */
        + adds + hrFromCall(row, true) + (add.people ? gwAddBox(add, gwHours(sentList), row.fromOthers || 0) : "") + over.join("")
        + gwCheckLines(gwWeekCheck(row, week.days));
    },
    bind: (dlg, replan) => {
      const sw = dlg.querySelector("[data-gw-open]");
      if(sw) sw.onclick = () => {
        if(sw.classList.contains("gw-busy")) return;
        openAll = !openAll;
        sw.classList.toggle("on", openAll);
        sw.setAttribute("aria-checked", openAll ? "true" : "false");
        const box = sw.closest(".gw-toggle");
        if(box) box.classList.toggle("off", !openAll);
        replan(sw);
      };
    },
    applyLabel: () => tt("sp.gw.sch.apply", "Write the week"),
    applying: tt("sp.gw.sch.applying", "Writing the week in the game…"),
    changed: answer => (answer.before || {}).print !== (answer.after || {}).print || !!answer.openedHours,
    onUndo: () => { pgDrop(schedWritten); schedWritten = []; },
    onDone: answer => { schedWritten = pgScheduleDone(key, last, answer); },
    doneBody: (answer, spec) => {
      const shop = name;  // the board's name for it: the game's carries the [code] prefix
      const said = `<p class="gw-said ok">${gwScheduleSaid(shop, answer)}</p>`;
      return said + spec.draw(answer, "done");
    },
    done: answer => {
      const shop = name;  // the board's name for it: the game's carries the [code] prefix
      if(answer.undo) return answer.openedHours
        ? tt("sp.gw.sch.undone.hours", "Undone: the schedule at {shop} is back as it was, opening hours too.", {shop})
        : tt("sp.gw.sch.undone", "Undone: the schedule at {shop} is back as it was.", {shop});
      const add = (last && last.row.addPeople) || {}, from = (last && last.row.fromOthers) || 0;
      return `${gwScheduleSaid(shop, answer)}${add.people && from ? ` ${gwBothWait(add.hoursUncovered, from, add.people)}` : add.people ? ` ${tt("sp.gw.sch.stillempty", {
        one: "{h} h a week stay empty until you add {n} person; write it again then.",
        other: "{h} h a week stay empty until you add {n} people; write it again then."}, {h: add.hoursUncovered || 0, n: add.people})}`
        : from ? ` ${gwFromWait(add.hoursUncovered, from)}` : ""}`;
    },
  });
}

/* The hours that wait on people from other sites and on hires both. */
const gwBothWait = (h, n, m) => tt("sp.gw.sch.bothwait", {
  one: "<b>{h} h a week stay empty</b> until {n} person comes from another site and you add {m} more: Staff this site does both.",
  other: "<b>{h} h a week stay empty</b> until {n} people come from other sites and you add {m} more: Staff this site does both."},
  {h: Number(h) || 0, n, m});
/* The hours a schedule-only write leaves to the people from other sites. */
const gwFromWait = (h, n) => tt("sp.gw.sch.fromwait", {
  one: "<b>{h} h a week stay empty</b> until {n} person comes from another site: Staff this site moves them.",
  other: "<b>{h} h a week stay empty</b> until {n} people come from other sites: Staff this site moves them."}, {h: Number(h) || 0, n});
/* What one shop's write did, as the dialog and its toast say it. */
const gwScheduleSaid = (shop, answer) => answer.openedHours
  ? tt("sp.gw.sch.said.open", {one: "{shop}: {n} entry set in place of {was}, open 0 to 24 every day.",
      other: "{shop}: {n} entries set in place of {was}, open 0 to 24 every day."}, {shop, n: Number(answer.added) || 0, was: Number(answer.removed) || 0})
  : tt("sp.gw.sch.said", {one: "{shop}: {n} entry set in place of {was}.", other: "{shop}: {n} entries set in place of {was}."},
      {shop, n: Number(answer.added) || 0, was: Number(answer.removed) || 0});
const bindWrites = once(() => {
  on("click", "[data-gw]", (btn, e) => {
    /* Capture phase: a button inside a finding row must not open the row. */
    e.preventDefault(); e.stopPropagation();
    if(btn.getAttribute("aria-disabled") === "true") return;
    const kind = btn.dataset.gw;
    if(kind === "uniforms") gwUniforms(btn.hasAttribute("data-gw-all")
      ? gwUniformAll().map(b => b.key) : JSON.parse(btn.dataset.gwSites || "[]"));
    else if(kind === "imports") gwImports(btn.dataset.gwDepot || null, btn.dataset.gwLine || null);
    else if(kind === "schedule") gwSchedule(JSON.parse(btn.dataset.gwSites || "[]")[0]);
    else if(kind === "hire") hrReview(btn.dataset.hrStaff ? {scope: "site", site: btn.dataset.hrStaff} : {});
    else if(kind === "marketing") gwMarketing(btn.hasAttribute("data-gw-mk-all")
      ? gwMkSites(btn.dataset.gwMode, btn.dataset.gwMkLine || null).map(b => b.key) : JSON.parse(btn.dataset.gwSites || "[]"), btn.dataset.gwMode);
    else if(kind === "rent") gwRent(btn.hasAttribute("data-gw-rent-all") ? null : [btn.dataset.gwRent]);
    else if(kind === "wholesale") gwWholesale(btn.dataset.gwMode);
    else if(kind === "streetFoodRoute") gwStreetFoodRoute(btn.dataset.gwPlan);
  }, true);
});
function wireWrites(){ bindWrites(); gwToast(); gwReadBack(); }
