/* The Wiki page: the game's own help, read as another page of the board.
   Embedded by render() into the shared script, the way map.js is, so it shares
   the board's helpers ($, attr, icon, wireTips, wireReveal) and its tokens.

   Everything on this page is either the game's own help text, a check against a
   second game file, Big Copilot's own reading, or a gap the files do not close.
   Which one it is rides on every claim as a badge, and the evidence is in the
   tooltip. Nothing here invents a price: the game's help carries none.

   Three layers:
     - the catalogue (web/wiki-data.json), fetched once, lazily, with the build
       stamp so a deploy busts the cache;
     - the routes under #wiki, so every page, category and search is a link the
       browser's Back button understands;
     - the views: a shelf of categories and a search on the home route, a list
       per category, and a reader per page. The one business the extraction
       verified end to end (the Gift Shop) gets the authored layout the design
       draws; every other page is a reader over the same help text.

   The reader renders the game's markdown itself. Source text is data: it is
   escaped on the way in, links are resolved against the pages this build
   actually has, and a link the game points at nothing degrades to plain text
   rather than to a dead link. */

const WIKI_URL = "wiki-data.json";
/* The game's help writes addresses as "13 5a"; the city's own tables spell the
   ordinal out. Only these two directions ever meet, so one table does both. */
const WIKI_ORDINALS = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh",
  "eighth", "ninth", "tenth", "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth",
  "sixteenth", "seventeenth", "eighteenth", "nineteenth", "twentieth", "twentyfirst",
  "twentysecond", "twentythird", "twentyfourth", "twentyfifth", "twentysixth"];
/* The named streets, as the help text shortens them and as the city's own
   table spells them. Every address the help links to in this build is either
   one of these or a numbered avenue or street. */
const WIKI_STREETS = {pier: "pier", bw: "broadwaystreet", tur: "hamptonsturnpike"};
const WIKI_SHOWN = 60;   // rows before a category asks whether you want them all
const WIKI_HITS = 10;    // search rows before the same question

/* What the badges mean. The words are the reader's, never the file's.
   "Checked" is reserved for a second kind of file — a shop the game ships, or
   the city's building table. Two help pages agreeing with each other is still
   help, and says so. */
const WIKI_BADGE = {
  help: ["help", "Game help", "Stated in the game's help."],
  asset: ["ok", "Checked", "Cross-checked with shop layouts or city data."],
  model: ["warn", "Big Copilot", "Big Copilot's guidance or calculation."],
  save: ["save", "Your save", "Read from your loaded save."],
  gap: ["bad", "Gap", "Not specified in the game files."],
};

/* The shelf's own order: what a player reaches for first, not the order the
   game's help menu happens to store. Ids and counts stay the file's. */
const WIKI_CAT_ORDER = ["common_business_types", "common_sellable_products", "common_furniture",
  "help_importers", "common_factoryrecipes", "common_factorymachines", "common_factory_ingredients",
  "building_title", "employee_types", "employee_management", "vehicles_title", "rivals_title",
  "common_finance", "help_general"];
/* Where the game's own name for a category reads as a file path rather than as
   a shelf, the shelf's word is used instead. Everything else keeps the name the
   game gives it, which is more precise than any rewording. */
const WIKI_CAT_LABEL = {help_importers: "Wholesalers & importers"};
const wikiCatLabel = cat => WIKI_CAT_LABEL[String(cat.id)] || cat.label || cat.id;

const WIKI_CAT_ICON = {
  general: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle><path d="M12 8v.5M12 11v5"></path></svg>',
  finance: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2"></rect><circle cx="12" cy="12" r="2.5"></circle><path d="M3 10h2M19 10h2M3 14h2M19 14h2"></path></svg>',
  business: '<svg viewBox="0 0 24 24"><path d="M4 9l1.5-5h13L20 9"></path><path d="M4 9a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0"></path><path d="M5 11v9h14v-9M10 20v-5h4v5"></path></svg>',
  management: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="15" rx="2"></rect><path d="M3 10h18M8 3v4M16 3v4"></path><path d="M8 15l2 2 4-4"></path></svg>',
  products: '<svg viewBox="0 0 24 24"><path d="M4 8h16v12H4z"></path><path d="M4 8l2-4h12l2 4M12 4v4M9 13h6"></path></svg>',
  furniture: '<svg viewBox="0 0 24 24"><path d="M4 12h16v8H4z"></path><path d="M6 12V6h12v6M6 20v1M18 20v1M4 16h16"></path></svg>',
  rivals: '<svg viewBox="0 0 24 24"><path d="M6 3h12v6a6 6 0 0 1-12 0z"></path><path d="M6 5H3v2a3 3 0 0 0 3 3M18 5h3v2a3 3 0 0 1-3 3M12 15v3M8 21h8M9 18h6"></path></svg>',
  recipes: '<svg viewBox="0 0 24 24"><path d="M5 4h10l4 4v12H5z"></path><path d="M15 4v4h4M8 12h8M8 16h5"></path></svg>',
  machines: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"></circle><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"></path></svg>',
  ingredients: '<svg viewBox="0 0 24 24"><path d="M9 3h6v4l4 12H5L9 7z"></path><path d="M9 7h6M7 15h10"></path></svg>',
  vehicles: '<svg viewBox="0 0 24 24"><path d="M3 16V9a1 1 0 0 1 1-1h10l3 4h3a1 1 0 0 1 1 1v3"></path><circle cx="7" cy="17" r="2"></circle><circle cx="17" cy="17" r="2"></circle><path d="M9 17h6M3 16h2M19 16h2"></path></svg>',
  page: '<svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z"></path><path d="M14 3v4h4M9 12h6M9 16h4"></path></svg>',
};
/* Which icon a category wears. The ids are the game's own category keys, which
   this build does not get to choose, so the label decides and the key only
   sharpens it. Anything unrecognised wears a page. */
function wikiCatIcon(cat){
  const text = `${cat.id || ""} ${cat.label || ""}`.toLowerCase();
  const pick = [
    ["furniture", "furniture"], ["ingredient", "ingredients"], ["recipe", "recipes"],
    ["machine", "machines"], ["vehicle", "vehicles"], ["rival", "rivals"],
    ["import", "supply"], ["wholesal", "supply"], ["product", "products"],
    ["business", "business"], ["building", "company"], ["employee management", "management"],
    ["management", "management"], ["employee", "people"], ["staff", "people"],
    ["finance", "finance"], ["general", "general"],
  ].find(([needle]) => text.includes(needle));
  const key = pick ? pick[1] : "page";
  return WIKI_CAT_ICON[key] || icon(key) || WIKI_CAT_ICON.page;
}

/* --- state ------------------------------------------------------------- */
let wikiData = null;            // the indexed catalogue, once it is in
let wikiStatus = "idle";        // idle · loading · ready · error
let wikiFailure = "";           // what to tell the reader when it is error
let wikiRoute = {kind: "home", id: "", query: ""};
let wikiWired = false;
let wikiShowAll = false;        // the current list is showing everything
const wikiTicked = new Set();   // the setup squares, this visit only, keyed by business
let wikiPicked = null;          // the node the relation graph is holding
let wikiFocus = "";             // the product a wide graph is drawn around
let wikiShowFix = false;        // the setup list is showing every alternative
/* The guide the page on screen is drawn from, set by the draw and read by the
   pieces that run after it. The payload is never rewritten to point at the
   business being read: navigation moves this, and nothing else. */
let wikiActive = null;

const wikiRoot = () => $("wikiRoot");
/* Counts are written the way the board writes money: one thousands mark, the
   same one whatever the browser's own locale would have chosen. */
const wikiNum = n => Number(n || 0).toLocaleString("en-US");
/* One of a thing or several, counted the way the rest of the page counts: the
   board never writes "1 gaps". */
const wikiCount = (n, word) => `${word}${Number(n) === 1 ? "" : "s"}`;
/* Text that lands between tags. attr() is the board's, for attributes. */
const wikiText = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));

/* --- the catalogue ------------------------------------------------------ */
/* Shape, as agreed with the extraction: schemaVersion 1, categories, pages
   (id, categoryId, title, body) and the verified sample the authored page is
   drawn from. Anything else in the file is left alone. */
function wikiIndex(raw){
  const pages = Array.isArray(raw.pages) ? raw.pages.filter(p => p && p.id) : [];
  const categories = Array.isArray(raw.categories) ? raw.categories.filter(c => c && c.id) : [];
  const byId = new Map(pages.map(p => [String(p.id), p]));
  const catById = new Map(categories.map(c => [String(c.id), c]));
  /* A page's category comes from the page itself; the category's own list is a
     fallback for a build that only carries one of the two. */
  categories.forEach(c => (c.pageIds || []).forEach(id => {
    const p = byId.get(String(id));
    if(p && !p.categoryId) p.categoryId = c.id;
  }));
  const counts = new Map();
  pages.forEach(p => counts.set(String(p.categoryId), (counts.get(String(p.categoryId)) || 0) + 1));
  /* The shelf's order, then anything the shelf does not know about, in the
     order the file gave it. */
  const rank = id => { const at = WIKI_CAT_ORDER.indexOf(String(id)); return at < 0 ? WIKI_CAT_ORDER.length : at; };
  categories.sort((a, b) => rank(a.id) - rank(b.id)
    || raw.categories.indexOf(a) - raw.categories.indexOf(b));
  const search = pages.map(p => ({
    id: String(p.id),
    title: String(p.title || p.id),
    lower: String(p.title || p.id).toLowerCase(),
    categoryId: String(p.categoryId || ""),
    category: catById.has(String(p.categoryId)) ? wikiCatLabel(catById.get(String(p.categoryId))) : "",
  })).sort((a, b) => a.title.localeCompare(b.title));
  return {
    raw, pages, categories, byId, catById, search,
    /* The shelf counts what the help menu holds; the reader can only open what
       this build carries, so both numbers are kept and the difference is said
       out loud rather than papered over. */
    has: id => byId.has(String(id)),
    held: id => counts.get(String(id)) || 0,
    sample: raw.sample && typeof raw.sample === "object" ? raw.sample : null,
    /* One guide per business the extraction could describe end to end, keyed by
       the same page id the reader routes on. A build that carries only the one
       worked example still has it under sample, and that is the fallback. */
    guides: raw.guides && typeof raw.guides === "object" ? raw.guides : {},
    provenance: raw.provenance && typeof raw.provenance === "object" ? raw.provenance : {},
  };
}

function loadWikiData(){
  if(wikiStatus === "loading" || wikiStatus === "ready") return;
  wikiStatus = "loading";
  wikiFailure = "";
  drawWiki();
  /* A host page (a static export) may carry the catalogue with it; otherwise it
     is fetched once, stamped with the build so a deploy busts the cache. */
  const embedded = window.BIG_COPILOT_WIKI;
  const got = embedded
    ? Promise.resolve(embedded)
    : fetch(`${WIKI_URL}?v=${window.LEDGER_BUILD || "1"}`).then(r => {
        if(!r.ok) throw new Error(`the wiki content could not be fetched (${r.status})`);
        return r.json();
      });
  got.then(raw => {
    if(!raw || raw.schemaVersion !== 1) throw new Error("this build does not understand that wiki file");
    if(!Array.isArray(raw.pages) || !raw.pages.length) throw new Error("the wiki file carries no pages");
    wikiData = wikiIndex(raw);
    wikiStatus = "ready";
    drawWiki();
  }).catch(error => {
    wikiStatus = "error";
    wikiFailure = (error && error.message) || String(error);
    drawWiki();
  });
}

/* --- routes ------------------------------------------------------------- */
/* #wiki, #wiki/c/<category>, #wiki/q/<query>, #wiki/<page>. */
/* A hash is whatever the address bar holds, so a half-typed escape decodes to
   itself rather than throwing the page away. */
const wikiDecode = s => { try{ return decodeURIComponent(s); }catch(e){ return s; } };
function wikiParse(hash){
  const rest = String(hash || "").replace(/^#/, "").replace(/^wiki(\/|$)/, "");
  if(!rest) return {kind: "home", id: "", query: ""};
  const parts = rest.split("/");
  const head = parts.shift();
  const tail = parts.join("/");
  if(head === "c" && tail) return {kind: "category", id: wikiDecode(tail), query: ""};
  if(head === "q") return {kind: "home", id: "", query: wikiDecode(tail || "")};
  return {kind: "page", id: wikiDecode([head, ...parts].join("/")), query: ""};
}
function wikiHref(route){
  if(!route || route.kind === "home")
    return route && route.query ? `#wiki/q/${encodeURIComponent(route.query)}` : "#wiki";
  if(route.kind === "category") return `#wiki/c/${encodeURIComponent(route.id)}`;
  return `#wiki/${encodeURIComponent(route.id)}`;
}
/* Called by showPage whenever the Wiki page comes up, and by the hash listener
   while it is up. */
function showWikiRoute(hash){
  const next = wikiParse(hash);
  const moved = next.kind !== wikiRoute.kind || next.id !== wikiRoute.id;
  wikiRoute = next;
  if(moved){
    wikiShowAll = false;
    /* Another business is another set of nodes: nothing the last one was
       holding means anything here. */
    wikiPicked = null;
    wikiFocus = "";
    wikiShowFix = false;
    /* A different page starts at its own top, however far down its link was. */
    if(window.scrollY > 0) window.scrollTo(0, 0);
  }
  if(wikiStatus === "idle"){ loadWikiData(); return; }
  drawWiki();
}

/* --- the markdown the game writes --------------------------------------- */
/* Inline: **bold** and [label](target). A bold that never closes stays as the
   characters the file holds, which is what the source does in at least one
   place. Text is escaped chunk by chunk, so nothing in the game's files can
   become markup, an attribute or a URL. */
function wikiInline(raw, ctx){
  const text = String(raw ?? "");
  const re = /\[([^\]\n]+)\]\(([^)\n]*)\)|\*\*([^*\n]+)\*\*/g;
  let out = "", at = 0, m;
  while((m = re.exec(text))){
    out += wikiText(text.slice(at, m.index));
    /* The game bolds whole sentences, links and all ("**[Nightclubs](…) and
       [Theaters](…)**:"), so what is inside the bold is read the same way as
       what is outside it. The inner text can hold no ** of its own, so this
       goes one level deep and stops. */
    if(m[1] !== undefined) out += wikiLink(m[1], m[2], ctx);
    else out += `<b>${wikiInline(m[3], ctx)}</b>`;
    at = re.lastIndex;
  }
  return out + wikiText(text.slice(at));
}
/* Where a link goes. A page this build carries becomes a link; an address
   becomes a place the map can open (the pin is added once the map's own tables
   confirm the building, never before); anything else — the help file points at
   five slugs that are not pages — degrades to the words it was wearing. */
function wikiLink(label, target, ctx){
  const to = String(target || "").trim();
  const address = /^address\s*:/i.test(to) ? to.replace(/^address\s*:/i, "").trim() : "";
  if(address)
    return `<span class="wk-addr" data-addr="${attr(address)}">${wikiText(label)}</span>`;
  if(wikiData && wikiData.has(to) && to !== (ctx && ctx.id))
    return `<a class="wk-link" href="${attr(wikiHref({kind: "page", id: to}))}">${wikiText(label)}</a>`;
  return wikiText(label);
}
/* A label line: the game's own way of titling a list ("**Required Workstation**:",
   "Product Capacity:"). Short, ends in a colon, and never a sentence. */
function wikiIsLabel(line){
  const bare = line.replace(/\*\*/g, "").trim();
  return bare.length > 0 && bare.length <= 64 && /:$/.test(bare) && !/[.!?]/.test(bare);
}
/* The body of a help page as blocks. Bullets become a list, label lines become
   a small heading over the list they title, everything else is a paragraph. */
function wikiBlocks(text){
  const blocks = [];
  let list = null, para = [];
  const flush = () => { if(para.length){ blocks.push({kind: "p", lines: para}); para = []; } };
  const stop = () => { flush(); list = null; };
  String(text ?? "").split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if(!trimmed){ stop(); return; }
    const bullet = /^[*•‣-]\s+(.*)$/.exec(trimmed);
    if(bullet){
      flush();
      if(!list){ list = {kind: "ul", items: []}; blocks.push(list); }
      list.items.push(bullet[1]);
      return;
    }
    if(wikiIsLabel(trimmed)){ stop(); blocks.push({kind: "h", line: trimmed.replace(/\*\*/g, "").trim()}); return; }
    list = null;
    para.push(trimmed);
  });
  flush();
  return blocks;
}
function wikiBody(text, ctx){
  const blocks = wikiBlocks(text);
  if(!blocks.length) return `<p class="quiet">This page carries no text in the game's help file.</p>`;
  return blocks.map(b => {
    if(b.kind === "ul") return `<ul class="wk-list">${b.items.map(i => `<li>${wikiInline(i, ctx)}</li>`).join("")}</ul>`;
    if(b.kind === "h") return `<h3 class="wk-lab">${wikiInline(b.line.replace(/:$/, ""), ctx)}</h3>`;
    return `<p>${b.lines.map(l => wikiInline(l, ctx)).join("<br>")}</p>`;
  }).join("");
}

/* --- addresses on the map ----------------------------------------------- */
/* "13 5a", "4 pier", "2 25th Street", "13 Fifth Avenue" all name one building.
   The key is the city map's own: ba:street_<street>#<number>. */
function wikiAddressKey(address){
  const found = /^\s*(\d+)\s+(.+?)\s*$/.exec(String(address || ""));
  if(!found) return null;
  const n = +found[1];
  let rest = found[2].toLowerCase().replace(/[^a-z0-9]/g, "");
  /* The streets the help text abbreviates by name rather than by number. One
     the table does not know stays words: a pin that opened the wrong building
     would be worse than no pin. */
  if(WIKI_STREETS[rest]) return `ba:street_${WIKI_STREETS[rest]}#${n}`;
  /* The short form the help text uses: a number and one letter for the kind. */
  const short = /^(\d{1,2})(a|s)$/.exec(rest);
  if(short) rest = `${short[1]}${short[2] === "a" ? "thavenue" : "thstreet"}`;
  const numbered = /^(\d{1,2})(?:st|nd|rd|th)(avenue|street)$/.exec(rest);
  if(numbered){
    const word = WIKI_ORDINALS[+numbered[1]];
    if(!word) return null;
    rest = word + numbered[2];
  }
  return /^[a-z]+$/.test(rest) ? `ba:street_${rest}#${n}` : null;
}
/* Every address on the page becomes a pin only once the map's own building
   table confirms it. Until then (and if the map data will not load at all) the
   address stays the words the help text used: no control that does nothing. */
function wikiPins(){
  const host = wikiRoot();
  const marks = host ? Array.from(host.querySelectorAll(".wk-addr:not([data-pinned])")) : [];
  if(!marks.length || typeof loadCityMap !== "function" || typeof mapButton !== "function") return;
  loadCityMap().then(assets => {
    marks.forEach(mark => {
      if(!mark.isConnected) return;
      mark.dataset.pinned = "1";
      /* The extraction already resolves a supplier to the city's own key; only
         an address read out of the help text has to be worked out here. */
      const key = mark.dataset.mapId || wikiAddressKey(mark.dataset.addr);
      if(!key || !assets.byKey || !assets.byKey.has(key)) return;
      const building = assets.byKey.get(key);
      mark.insertAdjacentHTML("beforeend", mapButton(key, building.address || mark.dataset.addr));
      if(building.hood) mark.dataset.tip = `${building.address} · ${building.hood}`;
    });
    wireTips();
  }).catch(() => { /* No map data, no pins. The addresses still read. */ });
}

/* --- small pieces the views share --------------------------------------- */
function wikiChip(kind, text, tip){
  const badge = WIKI_BADGE[kind];
  const cls = badge ? badge[0] : kind;
  const label = text === undefined && badge ? badge[1] : text;
  const say = tip === undefined && badge ? badge[2] : tip;
  return `<span class="chip ${cls}"${say ? ` data-tip="${attr(say)}"` : ""}><i></i>${wikiText(label)}</span>`;
}
const wikiWhy = text => text
  ? `<span class="why" data-tip="${attr(text)}" tabindex="0"><i>?</i></span>` : "";
const WIKI_CHEV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>';
function wikiCrumb(trail){
  return `<nav class="wk-crumb" aria-label="Breadcrumb">${trail.map((step, i) =>
    (i ? WIKI_CHEV : "") + (step.href
      ? `<a href="${attr(step.href)}">${wikiText(step.label)}</a>`
      : `<span>${wikiText(step.label)}</span>`)).join("")}</nav>`;
}
/* A findings-style row: the shape the board already uses for a list of things
   you can open. */
function wikiRow(entry, mark, withCategory = true){
  const title = mark ? wikiMark(entry.title, mark) : wikiText(entry.title);
  return `<a class="wk-hit" href="${attr(wikiHref({kind: "page", id: entry.id}))}">`
    + `<i class="wk-mark"></i><span class="wk-what">${title}</span>`
    + `<span class="wk-cat2">${withCategory ? wikiText(entry.category || "") : ""}</span>`
    + `<span class="wk-go">${icon("go")}</span></a>`;
}
/* The matched letters, marked in the row. Escaped either side of the match. */
function wikiMark(title, query){
  const at = String(title).toLowerCase().indexOf(String(query).toLowerCase());
  if(at < 0 || !query) return wikiText(title);
  return wikiText(title.slice(0, at)) + "<em>" + wikiText(title.slice(at, at + query.length))
    + "</em>" + wikiText(title.slice(at + query.length));
}
/* Search: title first, then the category's name, best match first. */
function wikiFind(query){
  const q = String(query || "").trim().toLowerCase();
  if(!q || !wikiData) return [];
  const hits = [];
  wikiData.search.forEach(entry => {
    const at = entry.lower.indexOf(q);
    if(at === 0) hits.push({entry, rank: 0});
    else if(at > 0) hits.push({entry, rank: 1});
    else if(entry.category.toLowerCase().includes(q)) hits.push({entry, rank: 2});
  });
  hits.sort((a, b) => a.rank - b.rank || a.entry.title.localeCompare(b.entry.title));
  return hits.map(h => h.entry);
}

/* --- the views ----------------------------------------------------------- */
function wikiHome(){
  const q = wikiRoute.query || "";
  const hits = wikiFind(q);
  const held = wikiData.pages.length;
  const listed = wikiData.categories.reduce((n, c) => n + (Number(c.count) || 0), 0) || held;
  const shown = wikiShowAll ? hits : hits.slice(0, WIKI_HITS);
  const matching = new Set(hits.map(h => h.categoryId));
  const shelf = wikiData.categories.map(c => {
    const label = wikiCatLabel(c);
    const count = Number(c.count) || wikiData.held(c.id);
    const off = q && !matching.has(String(c.id)) && !label.toLowerCase().includes(q.toLowerCase());
    return `<a class="wk-cat rv${off ? " off" : ""}" href="${attr(wikiHref({kind: "category", id: c.id}))}"`
      + `${off ? ' tabindex="-1" aria-hidden="true"' : ""}>`
      + `<span class="wk-ic">${wikiCatIcon(c)}</span><b>${wikiText(label)}</b>`
      + `<span class="wk-n">${wikiNum(count)}</span></a>`;
  }).join("");
  const legend = Object.keys(WIKI_BADGE).map(k => wikiChip(k)).join("");
  return `
<div class="sechead wk-top">
  <label class="wk-srch">${icon("search")}
    <input type="search" id="wikiSearch" autocomplete="off" spellcheck="false"
      placeholder="Search ${wikiNum(held)} pages" aria-label="Search the wiki"
      value="${attr(q)}">
    <span class="wk-cnt">${q ? wikiNum(hits.length) : ""}</span></label>
  ${wikiWhy("Search the game's help by page title or category. No save needed.")}
  <span class="aside">${wikiStamp()}</span>
</div>
${q ? `<div class="wk-hits">${
    shown.map(e => wikiRow(e, q)).join("")
    || `<p class="wk-none">Nothing called that. Try a product, a shop or a piece of furniture.</p>`}
  </div>${hits.length > shown.length
    ? `<p class="quiet wk-more"><button type="button" class="link" data-wiki-all>Show all ${wikiNum(hits.length)}</button></p>`
    : ""}` : ""}
${shelf ? `<div class="wk-shelf">${shelf}</div>`
  : `<p class="wk-none">This build carries the pages but not the help menu's own shelf of categories. Search still finds every one of them.</p>`}
<div class="wk-legend">
  ${legend}${wikiWhy("Badges show where a fact comes from. Hover or focus a badge for its meaning.")}
</div>
${listed > held ? `<p class="quiet wk-foot">${wikiNum(held)} of the help menu's ${wikiNum(listed)} pages are in this build.</p>` : ""}`;
}

function wikiCategoryView(){
  const cat = wikiData.catById.get(String(wikiRoute.id));
  if(!cat) return wikiMissing(`No category called “${wikiRoute.id}”.`);
  const entries = wikiData.search.filter(e => e.categoryId === String(cat.id));
  const shown = wikiShowAll ? entries : entries.slice(0, WIKI_SHOWN);
  const listed = Number(cat.count) || entries.length;
  return `
${wikiCrumb([{label: "Wiki", href: "#wiki"}, {label: wikiCatLabel(cat)}])}
<div class="wk-titlerow">
  <h1>${wikiText(wikiCatLabel(cat))}</h1>
  <span class="chips">${wikiChip("help", `${wikiNum(entries.length)} page${entries.length === 1 ? "" : "s"}`,
    listed > entries.length
      ? `The game's help menu lists ${wikiNum(listed)} pages in this category; ${wikiNum(entries.length)} of them are in this build.`
      : "Every page the game's help menu lists in this category.")}</span>
</div>
<div class="wk-hits">${shown.map(e => wikiRow(e, "", false)).join("")
  || `<p class="wk-none">No page in this build belongs to this category.</p>`}</div>
${entries.length > shown.length
  ? `<p class="quiet wk-more"><button type="button" class="link" data-wiki-all>Show all ${wikiNum(entries.length)}</button></p>`
  : ""}`;
}

/* The reader: one help page, its own words, with the links it carries resolved
   against the pages this build has. */
function wikiPageView(){
  const page = wikiData.byId.get(String(wikiRoute.id));
  if(!page) return wikiMissing(`No page called “${wikiRoute.id}”. It may be one of the help links the game's own files leave dangling.`);
  const cat = wikiData.catById.get(String(page.categoryId));
  if(wikiActive) return wikiGuidePage(wikiActive, page, cat);
  const ctx = {id: String(page.id)};
  return `
${wikiCrumb([{label: "Wiki", href: "#wiki"},
  ...(cat ? [{label: wikiCatLabel(cat), href: wikiHref({kind: "category", id: cat.id})}] : []),
  {label: page.title || page.id}])}
<div class="wk-titlerow">
  <h1>${wikiText(page.title || page.id)}</h1>
  <span class="chips">${wikiChip("help")}</span>
</div>
<div class="wk-read rv">${wikiBody(page.body, ctx)}</div>
${wikiYours(page)}
${wikiSource(page)}`;
}

function wikiMissing(line){
  return `${wikiCrumb([{label: "Wiki", href: "#wiki"}, {label: "Not here"}])}
<div class="wk-titlerow"><h1>Not here</h1></div>
<p class="wk-lede">${wikiText(line)}</p>
<p class="quiet"><a class="link" href="#wiki">Back to the categories</a></p>`;
}

/* Where a page's words come from, and what the extraction could not close.
   Keys and file names live behind this disclosure, never in the reading. */
function wikiSource(page){
  const sources = (wikiActive || wikiData.sample || {}).SOURCES || {};
  const files = Array.isArray((wikiData.provenance || {}).files) ? wikiData.provenance.files
    : Array.isArray(sources.files) ? sources.files : [];
  const build = Array.isArray(sources.build) ? sources.build : [];
  const sourceName = f => /BusinessLayouts/i.test(f.path || "") ? "Shipped shop layout"
    : /helpstructure/i.test(f.path || "") ? "Game help menu"
    : /ba_buildings/i.test(f.path || "") ? "Big Copilot's city map" : "Game help text";
  return `
<details class="wk-src">
  <summary>Where this page comes from</summary>
  <div class="wk-srcbody">
    <p>Reference facts come from the game's own help. Big Copilot arranges them into cards and
      diagrams; authored guidance and calculations carry the amber badge. Shipped shop layouts
      show observed placements, and do not establish every rule the game enforces.</p>
    ${files.length ? `<ul class="wk-files">${files.slice(0, 8).map(f =>
      `<li><b>${wikiText(sourceName(f))}</b>${f.note ? `<span>${wikiText(wikiUnkey(f.note))}</span>` : ""}</li>`).join("")}</ul>` : ""}
    ${build.length ? `<ul class="wk-files">${build.map(row =>
      `<li${row.caveat ? ` data-tip="${attr(row.caveat)}" tabindex="0"` : ""}><code>${wikiText(row.label)}</code>`
      + `<span>${row.value === null || row.value === undefined
        ? "not observed"
        : wikiText(row.value)}</span></li>`).join("")}</ul>` : ""}
  </div>
</details>`;
}

/* The stamp: how old the game's files were, and which build a save would have
   to report to match them. The date the extraction carries is the newest
   modification time of the files it read, not the moment it ran — an unchanged
   installation builds the same file — so it is worded as the files' date.

   A build number is only printed when the extraction names it as the number a
   save reports. Steam's depot id and the build a shipped layout was authored on
   are different numbers; they stay in the source list below, with their own
   words, where they cannot be mistaken for this one. */
function wikiStamp(){
  const p = wikiData.provenance || {};
  const sample = wikiData.sample || {};
  const when = p.sourceDate || p.extracted || (sample.SOURCES || {}).sourceDate || (sample.SOURCES || {}).extracted || "";
  const claimed = p.saveBuildNumber ?? p.gameBuild;
  const build = typeof claimed === "number" || typeof claimed === "string" ? claimed : null;
  const bits = [];
  if(when) bits.push(wikiChip("dim", `game files of ${String(when).slice(0, 10)}`,
    "The newest modification date of the game files this was read from — not when the reading ran."));
  if(build) bits.push(wikiChip("dim", `save build ${build}`,
    "The build number a save reports for this installation. A save from a newer build may not match what these pages say."));
  return bits.join("");
}

/* --- what a loaded save adds -------------------------------------------- */
/* The only part of a page that changes when a save is open. Empty is honest:
   a number that is not in the save is never invented, and a shape that is not
   in this save's data is left out rather than shown as a dash for ever. */
/* A unit price is cents, and the board's money rounds to whole dollars, so a
   small one is written out rather than rounded into a lie. */
const wikiMoney = n => Number.isFinite(n) && n > 0 ? (n < 100 ? `$${n.toFixed(2)}` : fmt(n)) : null;
function wikiOwn(title){
  if(!hasData()) return null;
  const name = String(title || "").trim().toLowerCase();
  const product = (D.products || []).find(p => String(p.item).trim().toLowerCase() === name);
  const sites = (D.businesses || []).filter(b => String(b.type || "").trim().toLowerCase() === name);
  const row = ((D.market || {}).rows || []).find(r => String(r.item).trim().toLowerCase() === name);
  let best = null;
  if(row) (row.cells || []).forEach(c => { if(c && (!best || c.demand > best.demand)) best = c; });
  return (product || sites.length || best) ? {product, sites, best} : null;
}
function wikiSlot(label, value, tip){
  return `<div class="wk-slot"${tip ? ` data-tip="${attr(tip)}"` : ""}>`
    + `<span class="wk-lab">${wikiText(label)}</span>`
    + `<span class="wk-v${value === null ? " none" : ""}">${value === null ? "—" : wikiText(value)}</span></div>`;
}
function wikiYours(page, extra){
  const own = wikiOwn(page.title);
  const slots = [];
  if(own && own.best)
    slots.push(wikiSlot("Demand", `${own.best.demand} in ${own.best.hood}`,
      "The strongest neighbourhood for this product in your save's own demand snapshot, 0 to 100."));
  if(own && own.product){
    slots.push(wikiSlot("You sell it", `${own.product.stores} shop${own.product.stores === 1 ? "" : "s"}`,
      "Your own sites with this product on a shelf, from yesterday's trading."));
    slots.push(wikiSlot("Sold a day", wikiNum(own.product.units),
      "Units your shops sold yesterday, added up."));
    slots.push(wikiSlot("Your price", wikiMoney(own.product.price),
      "Your own average take per unit yesterday: revenue over units sold in your shops. Your save's figure, not a number from the game's help."));
  }
  if(own && own.sites.length)
    slots.push(wikiSlot("Yours", `${own.sites.length} site${own.sites.length === 1 ? "" : "s"}`,
      "Businesses of this type in your company."));
  (extra || []).forEach(s => slots.push(s));
  const body = slots.length
    ? `<div class="wk-savebox">${slots.join("")}</div>`
    : `<div class="wk-savebox empty"><p class="quiet">${hasData()
        ? "Nothing in the open save matches this page by name."
        : "Open a save and what your own company does with this shows here. Until then the page is the game's help only."}</p></div>`;
  return `
<section class="sec">
  <div class="sechead"><h2>Yours</h2>
    ${wikiWhy("Your company's figures for this page. Load a save to see matching shops, sales and demand.")}
    <span class="aside">${hasData() ? wikiChip("save", "from your save") : wikiChip("save", "no save open")}</span></div>
  ${body}
</section>`;
}

/* --- the guides ---------------------------------------------------------- */
/* A guide is one business drawn the way the design draws it: glance tiles, what
   to buy in which order, everything it sells or charges for, how the pieces fit,
   the recipes, the addresses. Every business the extraction could describe end
   to end gets one; every other page is the reader above.

   A guide carries only its own business's records — its products, its fixtures,
   its recipes, and the suppliers those name — so nothing from the business that
   was extracted first can leak onto another's page. The first one is still
   carried as `sample`, and is the fallback for a build that has only it.

   Every claim here is the game's help unless the extraction carried other
   evidence with it, and the page says which is which rather than wearing one
   badge over the lot. */
function wikiGuideFor(id){
  const key = String(id ?? "");
  const guide = ((wikiData && wikiData.guides) || {})[key];
  if(guide && guide.BUSINESS) return guide;
  const s = wikiData && wikiData.sample;
  return s && s.BUSINESS && String(s.BUSINESS.slug) === key ? s : null;
}
/* The guide whose page is on screen, for the pieces that run after the draw. */
const wikiG = () => wikiActive || (wikiData && wikiData.sample) || {};
const wikiSup = (key, g) => ((g || wikiG()).SUPPLIERS || {})[key] || null;
const wikiFix = (key, g) => ((g || wikiG()).FIXTURES || {})[key] || null;
const wikiProd = (key, g) => ((g || wikiG()).PRODUCTS || {})[key] || null;

/* The short labels and hints the page wears. The words are authored beside the
   payload and travel with it; what stands in below is the label this page has
   always used, never a new sentence invented here. A guide may carry its own
   COPY; otherwise the payload's shared block answers for every guide. */
const WIKI_COPY = {
  primaryTitle: "Sells",
  secondaryTitle: "Also sells",
  servicesTitle: "Services",
  primaryRecipesTitle: "Make it",
  secondaryRecipesTitle: "Also make",
  dependenciesTitle: "Needs",
  suppliersTitle: "Where to go",
  staffTitle: "People",
  fixturesTitle: "Fixtures",
  stockTitle: "Stock",
  setupTitle: "To open",
  graphTitle: "Fits together",
  sourceTitle: "Source",
  roomTitle: "The room",
  automaticFee: "Automatic",
  automaticFeeTip: "Its own help page says this fee is charged automatically.",
  noRecipe: "No recipe",
  missingRecipe: "Recipe page missing",
  missingRecipeTip: "A product's page names this recipe, but the recipe's own page is not in this build, "
    + "so nothing about it can be read here.",
  noRequirements: "None stated",
  chooseProduct: "Choose a product",
  /* Where a claim would be, and the payload has none. */
  noEquipment: "no fixture named",
  noOtherSellers: "nobody else",
  noListedSuppliers: "no vendor listed",
  missingProduct: "Product details unavailable",
  /* The three kinds of line the opening list holds: what this business's own
     page requires, what another page requires of what it requires, and what the
     board suggests from the equipment's own pages. */
  listedRequirements: "Listed requirements",
  linkedRequirements: "Equipment and service requirements",
  suggestedEquipment: "Additional equipment",
  recruitmentTitle: "Recruitment",
  recruitmentHint: "",
  /* A line one of the offerings asks for, which the business page does not.
     Falls back to the caption for the requirements another page states. */
  conditionalRequirements: "",
  sharedRecipe: "Primary and secondary range",
  recipeLink: "Read the recipe",
  originalHelp: "The game's own words",
  plannerLabel: "Plan this range",
  /* The rank the payload gives an offering, as a label and as the sentence
     behind it. Both are copy: the page states the rank, it does not judge it. */
  alsoCarried: "also carried",
  alsoCarriedTip: "Not part of this type's own range: the help lists it among what the business also carries.",
  alsoOffered: "also offered",
  alsoOfferedTip: "Not part of this type's own range: the help lists it among what the business also offers.",
  primaryHint: "Shelf numbers show storage capacity. A red dashed label means no supplier is listed in the help.",
  recipeHint: "Rates are per workstation at full speed. Daily output assumes 24 hours without stopping.",
  setupHint: "Green squares mark listed requirements; hollow squares are suggestions. Tick items as you go; checkmarks reset on reload.",
  graphHint: "Select an item to highlight its shelves and suppliers. Select it again or press Escape to clear.",
  placesHint: "Select a map pin to locate a supplier or recruitment agency.",
  sourceHint: "Red dots mark missing information. Expand the sections below to read the original help and sources.",
  fullDayHint: "Big Copilot's own reading: the page's maximum hourly rate times 24. That assumes the line runs all day, "
    + "uninterrupted and at full rate — the help does not say what one achieves in practice, or what happens when "
    + "an input runs out mid-hour.",
  /* Hints a section only wears once the words for it are authored. */
  servicesHint: "", roomHint: "", equipmentHint: "", capacityHint: "", peopleHint: "", rangeHint: "",
};
function wikiCopy(key, fallback){
  const own = (wikiG().COPY || {})[key];
  const shared = (((wikiData && wikiData.raw) || {}).COPY || {})[key];
  const value = own ?? shared ?? WIKI_COPY[key];
  return value === undefined || value === null ? (fallback ?? "") : String(value);
}

/* Three states, not two: the help says you can, the help says nowhere that you
   can (which is an absence, not a rule), or the extraction did not read either
   way. Only the first is a claim. */
const wikiWholesale = p => p && (p.wholesale === true ? "yes" : p.wholesale === false ? "none" : "unknown");
/* A fixture's own numbers, as its page gives them. A number the page does not
   carry is left out, never printed as a blank or a zero. */
function wikiFixTip(f){
  const caps = (f.capacity || []).filter(c => c && Number.isFinite(c.value))
    .map(c => `${c.label} ${wikiNum(c.value)}${c.unit ? ` ${c.unit}` : ""}`);
  const bits = [];
  if(caps.length) bits.push(`Holds ${caps.join("; ")}.`);
  if(Number.isFinite(f.customers)) bits.push(`Serves ${wikiNum(f.customers)} customers an hour.`);
  if(f.observed) bits.push(`Counted in the shops the game ships: ${f.observed}`);
  return bits.join(" ") || "Its help page gives no numbers for this one.";
}
/* The first capacity a fixture's page states, for the meta line under a name. */
const wikiFixHolds = f => ((f.capacity || []).find(c => c && Number.isFinite(c.value)) || {}).value;
/* What one product may hold on one fixture. The extraction answers where the
   answer is unambiguous; where a fixture's page counts two kinds of goods and
   nothing says which line is this product's, every labelled row is shown. The
   largest is never picked: that would be a number the help does not give. */
function wikiCaps(p, key, f){
  const given = ((p || {}).fixtureCapacities || {})[key];
  if(Array.isArray(given) && given.length) return given.filter(c => c && Number.isFinite(c.value));
  const caps = (f.capacity || []).filter(c => c && Number.isFinite(c.value));
  if(caps.length < 2) return caps;
  /* The product's own first word may name its line ("Gifts 300, flowers 100").
     Its name is data, so it is escaped before it becomes a pattern. */
  const family = String(p && p.name || "").split(" ")[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const hit = family ? caps.filter(c => new RegExp(family, "i").test(c.label || "")) : [];
  return hit.length === 1 ? hit : caps;
}
const wikiCapText = caps => caps.length === 1
  ? wikiNum(caps[0].value)
  : caps.map(c => `${c.label} ${wikiNum(c.value)}`).join(" · ");
/* What the shipped shops actually contain, where the extraction counted them.
   That is the only evidence on a guide that is not the help text. */
function wikiPlaced(g){
  const counted = Object.values((g || wikiG()).FIXTURES || {}).filter(f => f && f.observed);
  return counted.length ? counted : null;
}

/* --- what a guide offers -------------------------------------------------- */
/* Everything the business's page puts its name to, in the order the page lists
   it: its own range first, then whatever it also carries. Both are drawn in
   full — a product carried on the side is still a product this shop sells, and
   the page says so rather than pointing somewhere else.

   A fee is not a thing on a shelf. The extraction says which is which from the
   help's own wording, and this page never hangs a shelf, a wholesaler or a
   recipe on one. */
function wikiOffers(g){
  const b = g.BUSINESS || {};
  const seen = new Set();
  const out = [];
  const take = (keys, group) => (keys || []).forEach(key => {
    const k = String(key);
    if(seen.has(k)) return;
    const p = wikiProd(k, g);
    if(!p) return;
    seen.add(k);
    /* A product the business page names whose own page this build has lost: it
       is still part of the range, so it keeps its card and says what it is. */
    out.push({...p, key: k, group, kind: p.kind === "fee" ? "fee" : "product",
      name: p.name || "", gone: !p.name});
  });
  take(b.primary, "primary");
  take(b.secondary, "additional");
  /* A guide whose business page names no range of its own: the products it
     carries say which rank they hold, and that is the order they are drawn in. */
  if(!out.length){
    const all = Object.keys(g.PRODUCTS || {});
    take(all.filter(k => (g.PRODUCTS[k] || {}).rank === "primary"), "primary");
    take(all.filter(k => (g.PRODUCTS[k] || {}).rank !== "primary"), "additional");
  }
  return out;
}
/* The recipes one offering names, the legacy single key included. */
function wikiRecipeKeys(p){
  const keys = (Array.isArray(p.recipes) ? p.recipes : []).map(String).filter(Boolean);
  if(p.recipe && !keys.includes(String(p.recipe))) keys.unshift(String(p.recipe));
  return keys;
}
/* One row per recipe, however many of the shop's products it makes, with the
   products it belongs to kept beside it so a shared one can say so. A key the
   payload names but carries no record for is a row too: it is a gap, and a gap
   that disappeared would be worse than one that is drawn. */
function wikiRecipeRows(offers, g){
  const rows = new Map();
  offers.forEach(p => {
    if(p.kind === "fee") return;
    wikiRecipeKeys(p).forEach(key => {
      const row = rows.get(key)
        || {key, recipe: (g.RECIPES || {})[key] || null, users: []};
      row.users.push({name: p.name, group: p.group});
      rows.set(key, row);
    });
  });
  return [...rows.values()];
}
/* Which workstation a recipe runs on: its own, by key, then by the name its
   page prints, and last the single station a one-station build carries. */
function wikiStation(r, g){
  const stations = (g || wikiG()).WORKSTATIONS || {};
  const byKey = r && r.workstationKey ? stations[r.workstationKey] : null;
  if(byKey) return byKey;
  const named = r && r.workstation
    ? Object.values(stations).find(s => s && s.name === r.workstation) : null;
  if(named) return named;
  const legacy = (g || wikiG()).WORKSTATION || {};
  return legacy && legacy.name ? legacy : {};
}
/* The recruiters a business's skills send you to: one key or several. */
const wikiHiring = b => [].concat(b.hiring || []).filter(Boolean);

function wikiGuidePage(g, page, cat){
  const b = g.BUSINESS || {};
  const ctx = {id: String(page.id)};
  const offers = wikiOffers(g);
  const goods = offers.filter(o => o.kind !== "fee");
  const fees = offers.filter(o => o.kind === "fee");
  const primary = goods.filter(o => o.group === "primary");
  const other = goods.filter(o => o.group !== "primary");
  const rows = wikiRecipeRows(offers, g);
  const ours = rows.filter(r => r.users.some(u => u.group === "primary"));
  const rest = rows.filter(r => !r.users.some(u => u.group === "primary"));
  /* The planner takes a business's own range, so its control sits with that
     range: never over a section of things the shop only carries on the side. */
  const plan = ours.length ? "recipes" : primary.length ? "primary" : fees.length ? "services" : "";
  const placed = wikiPlaced(g);
  return `
${wikiCrumb([{label: "Wiki", href: "#wiki"},
  ...(cat ? [{label: wikiCatLabel(cat), href: wikiHref({kind: "category", id: cat.id})}] : []),
  {label: b.name || page.title}])}
<div class="wk-titlerow">
  <h1>${wikiText(b.name || page.title)}</h1>
  <span class="chips">${wikiChip("help", "game help",
    "This page is the game's own help for this business, and the help pages for the products, fixtures and recipes it names.")}${
    placed ? wikiChip("asset", "fixtures counted in shipped shops",
      "Where the page says how many of a fixture a shipped shop holds, that count was read from the shop layouts the game "
      + "installs — not from the help text. It says what those shops do, not what the game requires.") : ""}</span>
</div>
${wikiGuideLede(g, primary, ctx)}
${wikiGuideTiles(g, offers)}
${wikiGuideSetup(g, page, offers, ctx)}
${wikiGuideCards(g, primary, "primary", plan === "primary", ctx)}
${wikiGuideServices(g, fees, plan === "services", ctx)}
${wikiGuideCards(g, other, "secondary", false, ctx)}
${wikiGuideGraph(g, goods)}
${wikiGuideRecipes(g, ours, "primary", plan === "recipes")}
${wikiGuideRecipes(g, rest, "secondary", false)}
${wikiGuidePlaces(g)}
${wikiYours(page, wikiGuideOwn(g, goods))}
${wikiGuideSource(g, page, ctx)}`;
}

/* The opening line, and the notes authored beside the payload. A note is only
   in the file while the help it was written against still reads that way, so
   what is here is shown as it arrived, and nothing is written in its place. */
function wikiGuideLede(g, primary, ctx){
  const b = g.BUSINESS || {};
  const authored = typeof b.lede === "string" ? b.lede
    : b.lede && typeof b.lede.text === "string" ? b.lede.text : "";
  const notes = (Array.isArray(b.notes) ? b.notes : [])
    .map(n => typeof n === "string" ? n : n && n.text).filter(Boolean);
  const yes = primary.filter(p => wikiWholesale(p) === "yes");
  const none = primary.filter(p => wikiWholesale(p) === "none");
  const unknown = primary.filter(p => wikiWholesale(p) === "unknown");
  /* The counted sentence is only written when the range is known either way; a
     product the extraction could not read is said out loud instead. */
  const counted = !primary.length ? ""
    : unknown.length ? `${wikiNum(yes.length)} of its ${wikiNum(primary.length)} products are named on a wholesaler's `
      + `list; ${wikiNum(unknown.length)} the help does not say either way.`
    : none.length ? `${wikiNum(yes.length)} of its ${wikiNum(primary.length)} products can be ordered from any wholesaler.`
    : `Every one of its ${wikiNum(primary.length)} products can be ordered from any wholesaler.`;
  const tail = !authored && none.length === 1
    ? ` <b>${wikiText(none[0].name)} is on no wholesaler's list.</b>` : "";
  return `<p class="wk-lede rv">${authored ? wikiInline(authored, ctx) : wikiText(counted)}${tail}</p>`
    + (notes.length ? `<ul class="wk-notes rv">${notes.map(n =>
        `<li>${wikiInline(n, ctx)}</li>`).join("")}</ul>` : "");
}

function wikiGuideTiles(g, offers){
  const b = g.BUSINESS || {};
  const sizes = (g.RETAIL_SIZES || []).map(r => r.code);
  const primary = offers.filter(o => o.group === "primary");
  const other = offers.filter(o => o.group !== "primary");
  /* An older payload names what a shop carries on the side without carrying the
     records, so those stay a count and a list of names, as they always were. */
  const extras = (b.extras || []);
  const side = other.length || extras.length;
  const skills = b.skills || [];
  const hiring = wikiHiring(b).map(k => wikiSup(k, g)).filter(Boolean);
  const said = wikiCopy("rangeHint");
  const range = (said ? `${said} ` : "") + (primary.length
    ? `Its own range: ${primary.map(p => p.name).join(", ")}.`
      + (other.length ? ` Also carried, and drawn in full below: ${other.map(p => p.name).join(", ")}.`
        : extras.length ? ` ${extras.length} more may be carried on the side; each belongs to another type's page.` : "")
    : other.length ? `Carried here: ${other.map(p => p.name).join(", ")}.`
    : "The help page names no range for this type.");
  return `<div class="kpis wk-tiles">
  <div class="kpi rv" data-tip="${attr(sizes.length
    ? `Any retail size code the help lists: ${sizes.join(", ")}. The door limit rises with the code.`
    : "The kind of building this business needs.")}">
    <span class="lab">Building</span><span class="v t">${wikiText(b.building || "—")}</span>
    ${sizes.length ? `<span class="sub">${wikiText(sizes[0])} – ${wikiText(sizes[sizes.length - 1])}</span>` : ""}</div>
  <div class="kpi rv" data-tip="How customers are served, from the help page's own wording.">
    <span class="lab">Customers</span><span class="v t">${wikiText(b.serving || "—")}</span></div>
  <div class="kpi rv" data-tip="${attr(range)}">
    <span class="lab">Core range</span><span class="v">${primary.length}</span>
    ${side ? `<span class="sub">${other.length
      ? `+${wikiNum(other.length)} also carried` : `+${wikiNum(extras.length)} on the side`}</span>` : ""}</div>
  <div class="kpi rv" data-tip="${attr(skills.length
    /* The agencies are named, not assigned: the payload's list is the business's,
       gathered across its skills, and this tile says no more than that. */
    ? `${skills.join(" and ")}.${hiring.length
      ? ` ${wikiCopy("recruitmentTitle")}: ${hiring.map(s => `${s.name}, ${s.street}`).join("; ")}.` : ""}`
    : "The help page names no staff skills for this type.")}">
    <span class="lab">Staff skills</span><span class="v">${skills.length}</span>
    ${skills.length ? `<span class="sub">${wikiText(skills.join(" · ").toLowerCase())}</span>` : ""}</div>
</div>`;
}

/* What to buy, in the order you buy it, with anything the business page forgets
   marked as such. The squares are keyed to the business as well as to the item,
   so two guides never tick each other's lines. Ticking is a scratch pad:
   nothing is stored. */
function wikiGuideSetup(g, page, offers, ctx){
  const b = g.BUSINESS || {};
  const sizes = (g.RETAIL_SIZES || []);
  const fixtures = g.FIXTURES || {};
  const slug = String(b.slug || page.id || "");
  /* What this business page itself calls required, in its own words — the
     extraction's own reading of its bullets where it has one, links and all.
     A filled square means the page said so; everything else is the board
     grouping the help's other pages, and stays hollow. */
  const stated = Array.isArray(b.requirements) ? b.requirements
    : b.requirements && Array.isArray(b.requirements.raw) ? b.requirements.raw
    : Array.isArray(b.required) ? b.required : null;
  const required = (stated ? stated.map(r => typeof r === "string" ? r : r && (r.name || r.label || r.text))
    : wikiRequired(page.body)).map(wikiBullet).filter(Boolean);
  const mentions = (haystack, needle) => {
    const a = wikiKey(wikiPlain(haystack)), c = wikiKey(needle);
    return !!a && !!c && (a.includes(c) || c.includes(a));
  };
  const isRequired = name => required.some(r => mentions(r, name));
  const keys = Object.keys(fixtures);
  const vendorLine = list => (list || []).map(k => (wikiSup(k, g) || {}).name).filter(Boolean).join(", ");
  const vendorCount = list => (list || []).length
    ? `${wikiNum(list.length)} vendor${list.length === 1 ? "" : "s"}` : wikiCopy("noListedSuppliers");

  /* A row is a square and a line, and the square is the only control on it: a
     requirement the help writes with links keeps them, and a link inside a
     checkbox would be a control inside a control. The square carries the line's
     own words as its label instead. */
  const item = (o) => {
    const id = `${slug}:${o.id}`;
    const done = wikiTicked.has(id);
    return `<div class="wk-item${o.req ? " req" : ""}${done ? " done" : ""}"${
      o.tip ? ` data-tip="${attr(o.tip)}"` : ""}>
    <button type="button" class="wk-tick" role="checkbox" aria-checked="${done ? "true" : "false"}"
      data-tick="${attr(id)}"${o.mark ? " data-wiki-more" : ""} aria-label="${attr(o.name)}"></button>
    <span><strong>${o.html || wikiText(o.name)}${o.catch
      ? `<i class="wk-catch" aria-label="named by another page, not by this one"></i>` : ""}</strong>
    <span class="wk-m">${o.meta || ""}</span></span></div>`;
  };
  /* A caption over a run of rows, where the rows in one card come from more
     than one kind of page. With no words for it, the rows simply run on. */
  const caption = (title, tip) => title
    ? `<p class="wk-sub"${tip ? ` data-tip="${attr(tip)}" tabindex="0"` : ""}>${wikiText(title)}</p>` : "";
  /* A line in a card that is not a thing to tick: a place named, not a job. */
  const said = (name, meta) => `<div class="wk-item said"><span aria-hidden="true"></span>
    <span><strong>${wikiText(name)}</strong><span class="wk-m">${wikiText(meta || "")}</span></span></div>`;
  const conditional = () => caption(wikiCopy("conditionalRequirements", wikiCopy("linkedRequirements")));
  const group = (title, items, hint) => items.filter(Boolean).length
    ? `<div class="wk-group rv"><h3${hint ? ` data-tip="${attr(hint)}" tabindex="0"` : ""}>${wikiText(title)}</h3>${
      items.filter(Boolean).join("")}
      <div class="wk-ph"><span class="wk-track"><i></i></span><b>0/${
        (items.join("").match(/data-tick=/g) || []).length}</b></div></div>`
    : "";

  /* The required lines the page gives that name neither a fixture this guide
     carries nor a product: kept in the page's own words. */
  const fixtureNamed = line => keys.find(k => mentions(line, fixtures[k].name));
  /* Which card a line belongs on. Where the help links its requirement, the
     link says what kind of thing it is — furniture, a skill, a product — and
     that is better evidence than the words around it. A line with no link at
     all is read the way this page has always read it. */
  const productLine = line => wikiLineKind(line) === "stock"
    || (wikiLineKind(line) === null && /product|sell/i.test(wikiPlain(line)) && !fixtureNamed(line)
      && !/point of sale/i.test(wikiPlain(line)));

  /* The size codes belong to the retail table; a business the table says
     nothing about is not given its sentence. */
  const room = group(wikiCopy("roomTitle"), b.building ? [item({
    id: "room", req: !!b.building, name: `${b.building} building`,
    meta: sizes.length ? `${wikiText(sizes[0].code)} – ${wikiText(sizes[sizes.length - 1].code)}` : "",
    tip: wikiCopy("roomHint", `The page's own opening line: this business operates out of `
      + `${String(b.building).toLowerCase()} buildings. Rented before anything else.`)
      + (sizes.length ? " The traffic index belongs to the address and the door limit rises with the size code." : ""),
  })] : [], wikiCopy("roomHint"));

  /* Each kind of thing named once, with what its own page says about it. */
  const eachNamed = list => [...new Map(list.map(k => [fixtures[k].name.split(" (")[0],
    `${wikiText(fixtures[k].name.split(" (")[0])}${Number.isFinite(fixtures[k].customers)
      ? ` <b>${wikiNum(fixtures[k].customers)}</b>/h` : ""}`])).values()].join(" · ");
  /* Which pieces a requirement names. Where the help links its requirement, the
     link is the help's own answer and is taken exactly: the fixture whose key,
     whose help page or whose whole name is that target, or — where the target
     is one of the game's own groups, like "Point of Sales" — the pieces the
     payload puts in that group.

     Nothing is matched by one name containing another. A Law Firm requires a
     Computer Workstation; a Computer is a different page, and the workstation's
     requirement is not a requirement for it. Only a line the help gives no link
     for falls back to its words, which is all there is to go on. */
  const groupsOf = f => [].concat(f.group || [], f.groups || []).filter(Boolean).map(wikiTargetKey);
  const linkedTo = line => {
    const targets = wikiTargets(line);
    if(!targets.length) return null;
    const out = [];
    targets.forEach(target => {
      const tail = wikiTargetKey(target);
      keys.forEach(k => {
        const f = fixtures[k];
        if(out.includes(k)) return;
        if(wikiKey(k) === tail || wikiKey(f.name) === tail
          || (f.pageId && wikiKey(f.pageId) === wikiKey(target))
          || groupsOf(f).includes(tail)) out.push(k);
      });
    });
    return out;
  };
  const covered = new Set();
  const requiredFixtures = required.filter(line => !productLine(line)).map((line, i) => {
    const linked = linkedTo(line);
    const members = linked === null ? keys.filter(k => mentions(line, fixtures[k].name)) : linked;
    members.forEach(k => covered.add(k));
    const one = members.length === 1 ? fixtures[members[0]] : null;
    /* A line that is nothing but the fixture's name is drawn as that fixture.
       Anything the page says around the name — an alternative, a minimum — is
       the requirement too, so that line is kept as the help wrote it, links
       and all, and the fixtures it names only fill in the meta below it. */
    const plain = wikiPlain(line);
    const exact = one && wikiKey(plain) === wikiKey(one.name);
    return item({
      id: `req-${members.length ? members.join("+") : i}`, req: true, name: exact ? one.name : plain,
      html: exact ? null : wikiInline(line, ctx),
      meta: one
        ? `${Number.isFinite(one.customers) ? `serves <b>${wikiNum(one.customers)}</b>/h · ` : ""}${vendorCount(one.vendors)}`
        /* Left and right of the same counter serve the same number, so each
           kind of till is named once. */
        : members.length ? eachNamed(members) : "",
      tip: one ? `${wikiFixTip(one)}${one.vendors && one.vendors.length ? ` Sold by ${vendorLine(one.vendors)}.` : ""}`
        : members.length ? members.map(k => `${fixtures[k].name}: ${wikiFixTip(fixtures[k])}`).join(" ")
        : "Listed on this business's own page under what it requires to function.",
    });
  });
  /* What the pieces on this page require in turn. A Computer Workstation's own
     help page says it takes a desk and a chair and a computer, and points each
     at one of the game's own furniture groups; the business page never repeats
     it. Each part of that sentence is a requirement of its own with its own
     alternatives, so each is a row, and none of its answers is a suggestion —
     an office with no computer is not an office that merely skipped a nicety.

     A requirement whose pieces the business page has already named is not
     repeated: the Bathrooms group is one line there and stays one line. The
     page credited is the piece the business itself requires where there is one,
     because that is the requirement the reader arrived by. */
  const linkedFixtures = [];
  const linkedClaims = new Set();
  const seenLinked = new Set();
  const sources = keys.slice().sort((a, b) => (covered.has(a) ? 0 : 1) - (covered.has(b) ? 0 : 1));
  sources.forEach(k => [].concat(fixtures[k].requirementsRaw || []).filter(Boolean).forEach(raw => {
    const line = wikiBullet(raw);
    wikiClauses(line).forEach(clause => {
      /* Only what the link calls furniture: a skill or a product on the same
         page belongs to the cards that hold those, not to the equipment. */
      if(wikiLineKind(clause) !== "fixture") return;
      const members = linkedTo(clause) || [];
      if(!members.length || members.every(m => covered.has(m))) return;
      const sign = members.join("+");
      if(seenLinked.has(sign)) return;
      seenLinked.add(sign);
      const links = wikiLinks(clause);
      /* Where the clause is one link, the help's own word for the group is the
         row — "Desk", still pointing at the group's own page, with the desks the
         payload puts in that group named under it. The words around it belong to
         the sentence, not to the requirement, and the sentence is in the note.
         Where the clause offers a choice, it is kept as the help wrote it. */
      const only = links.length === 1 ? clause.slice(links[0].at, links[0].end) : null;
      const one = members.length === 1 ? fixtures[members[0]] : null;
      linkedFixtures.push(item({
        id: `fix-need-${sign}`, req: true,
        name: only ? links[0].text : wikiPlain(clause),
        html: wikiInline(only || clause, ctx),
        meta: one
          ? `${Number.isFinite(one.customers) ? `serves <b>${wikiNum(one.customers)}</b>/h · ` : ""}${vendorCount(one.vendors)}`
          : eachNamed(members),
        tip: `${fixtures[k].name} requires this on its own help page: “${wikiPlain(line)}”. `
          + wikiCopy("linkedRequirementsHint", "Required when using the named equipment or service."),
      }));
      members.forEach(m => covered.add(m));
      wikiTargets(clause).forEach(t => linkedClaims.add(wikiTargetKey(t)));
    });
  }));

  /* Everything else the guide's own fixtures hold, as suggestions. A piece a
     requirement already named — itself, or as one of a group — is not listed
     twice; a piece it only resembles is still a suggestion, because nothing
     asked for it. A long tail of alternatives waits behind one control rather
     than burying the list. */
  const spare = keys.filter(k => !covered.has(k));
  const shownSpare = wikiShowFix ? spare : spare.slice(0, WIKI_SPARE);
  const optionalFixtures = shownSpare.map((k, i) => {
    const caps = (fixtures[k].capacity || []).filter(c => c && Number.isFinite(c.value));
    return item({
      id: `fix-${k}`, req: false, name: fixtures[k].name,
      /* The first piece the control revealed, so the reader who pressed it is
         put down on what it produced rather than at the top of the page. */
      mark: wikiShowFix && i === WIKI_SPARE,
      /* A number with no label over it would read as this fixture's one
         capacity; where its page gives several, each is named. */
      meta: `${caps.length ? `holds <b>${wikiText(wikiCapText(caps))}</b> · ` : ""}${vendorCount(fixtures[k].vendors)}`,
      tip: `${wikiFixTip(fixtures[k])}${fixtures[k].vendors && fixtures[k].vendors.length
        ? ` Sold by ${vendorLine(fixtures[k].vendors)}.` : ""} `
        + wikiCopy("equipmentSourceHint", "Listed by the equipment help; needed when using this equipment."),
    });
  }).concat(spare.length > shownSpare.length
    ? [`<p class="quiet wk-more"><button type="button" class="link" data-wiki-fix>Show all ${
        wikiNum(spare.length)}</button></p>`]
    : []);

  /* What a fixture consumes is a list on the fixture's own page. Where the
     business page does not carry it too, the square says whose page it is. */
  const needs = [];
  keys.forEach(k => [].concat(fixtures[k].needs || []).filter(Boolean).forEach(need => {
    if(needs.some(n => wikiKey(n.need) === wikiKey(need))) return;
    const missed = !mentions(page.body || "", need) && !isRequired(need);
    needs.push({need: String(need), from: fixtures[k].name, missed});
  }));
  /* A service's own requirements. The card for the service shows all of them,
     always; this list only adds what the shop would otherwise not know it has
     to buy. What the business page already requires, what its equipment card
     already holds and what its skills already name are not repeated here — the
     help says the same thing twice, and a checklist that did too would read as
     two jobs. A line that reaches further than the one already shown (a second
     chair the business page does not offer) is not the same thing, and stays. */
  const claimed = new Set();
  required.forEach(line => wikiTargets(line).forEach(t => claimed.add(wikiTargetKey(t))));
  keys.forEach(k => claimed.add(wikiKey(k)));
  keys.forEach(k => claimed.add(wikiKey(fixtures[k].name)));
  (b.skills || []).forEach(skill => claimed.add(wikiKey(skill)));
  /* A group the equipment card now carries as a requirement of its own is
     answered on this page, whichever page asked for it. */
  linkedClaims.forEach(t => claimed.add(t));
  const feeNeeds = [];
  offers.filter(o => o.kind === "fee").forEach(o => (o.requirementsRaw || []).forEach(raw => {
    const line = wikiBullet(raw);
    const plain = wikiPlain(line);
    if(!plain) return;
    const to = wikiTargets(line);
    /* Answered already: every page this line points at is on this page under
       its own square. With no links to go by, the words have to answer. */
    if(to.length ? to.every(t => claimed.has(wikiTargetKey(t)))
      : (fixtureNamed(line) || required.some(r => mentions(r, plain))
        || (b.skills || []).some(skill => mentions(plain, skill)))) return;
    if(feeNeeds.some(n => wikiKey(n.line) === wikiKey(plain))) return;
    /* Where the line belongs is what its links point at: furniture is equipment
       however little the payload knows about the piece itself. */
    const kind = wikiLineKind(line)
      || ((b.skills || []).some(skill => mentions(plain, skill)) ? "skill" : "stock");
    feeNeeds.push({line: plain, html: wikiInline(line, ctx), from: o.name, kind});
  }));
  const feeItem = (n, i) => item({
    id: `need-${i}`, req: false, name: n.line, html: n.html, meta: wikiText(n.from.toLowerCase()),
    tip: wikiCopy("equipmentSourceHint", `${n.from} lists this on its own help page under what it `
      + "requires. Its own page, not this business's."),
  });
  const feeRows = kind => feeNeeds.map((n, i) => n.kind === kind ? feeItem(n, i) : "").filter(Boolean);

  const own = required.filter(productLine).map((line, i) => item({
    id: `stock-${i}`, req: true, name: wikiPlain(line), html: wikiInline(line, ctx), meta: "",
    tip: "In the business page's own words, under what it requires to function.",
  }));
  const linked = [
    ...needs.map((n, i) => item({
      id: `stock-need-${i}`, req: true, name: n.need, meta: "the fixture's own page", catch: n.missed,
      tip: `${n.from} requires ${n.need}, according to its help page. `
        + (n.missed ? "The business page does not mention this requirement. " : "")
        + wikiCopy("linkedRequirementsHint", "Required when using the named equipment or service."),
    })),
  ];
  const stockFees = feeRows("stock");
  /* Three kinds of line can share this card: what this page requires, what the
     pages of the things it requires require in turn, and what one of the
     services asks for before it can be collected. Each says which it is. */
  const stock = group(wikiCopy("stockTitle"), [
    ...(own.length && (linked.length || stockFees.length) ? [caption(wikiCopy("listedRequirements"))] : []), ...own,
    ...(linked.length && (own.length || stockFees.length) ? [caption(wikiCopy("linkedRequirements"))] : []), ...linked,
    ...(stockFees.length && (own.length || linked.length) ? [conditional()] : []),
    ...stockFees,
  ]);

  /* The recruiters the payload names for this business are gathered from the
     help pages of all its skills at once. Which agency takes which skill is not
     something that list answers, so no skill is given one: the names are shown
     once, for the business, and a mapping the extraction has actually verified
     is used instead when the payload carries one. */
  const hiring = wikiHiring(b).map(k => wikiSup(k, g)).filter(Boolean);
  const bySkill = b.hiringBySkill && typeof b.hiringBySkill === "object" ? b.hiringBySkill : null;
  const forSkill = skill => !bySkill ? []
    : [].concat(bySkill[skill] || []).map(k => wikiSup(k, g)).filter(Boolean);
  const people = group(wikiCopy("staffTitle"), [
    ...(b.skills || []).map(skill => {
      const own = forSkill(skill);
      return item({
        id: `skill-${skill}`, req: isRequired(skill), name: skill,
        meta: own.length ? wikiText(own.map(s => s.name).join(" · ")) : "",
        tip: "The page says these skills can be assigned, not that the shop cannot open without them.",
      });
    }),
    ...feeRows("skill"),
    ...(hiring.length && !bySkill
      ? [caption(wikiCopy("recruitmentTitle"), wikiCopy("recruitmentHint")),
        ...hiring.map(s => said(s.name, s.street))]
      : []),
  ], wikiCopy("peopleHint"));
  /* A service that needs a piece of equipment needs equipment, whatever the
     payload knows about the piece: the line belongs on this card, never among
     the stock. */
  const kitFees = feeRows("fixture");
  /* The same three kinds of line as the stock card, in the same order: what the
     business page requires, what the pages of those things require in turn, and
     what a service asks for before it can be collected. The suggestions come
     last, after everything anyone asked for. */
  const kitKinds = [requiredFixtures, linkedFixtures, kitFees, optionalFixtures].filter(l => l.length).length;
  const kit = group(wikiCopy("fixturesTitle"), [
    ...(requiredFixtures.length && kitKinds > 1 ? [caption(wikiCopy("listedRequirements"))] : []),
    ...requiredFixtures,
    ...(linkedFixtures.length && kitKinds > 1 ? [caption(wikiCopy("linkedRequirements"))] : []),
    ...linkedFixtures,
    ...(kitFees.length && kitKinds > 1 ? [conditional()] : []),
    ...kitFees,
    ...(optionalFixtures.length && kitKinds > 1 ? [caption(wikiCopy("suggestedEquipment"))] : []),
    ...optionalFixtures,
  ], wikiCopy("equipmentHint"));
  return `
<section class="sec">
  <div class="sechead"><h2>${wikiText(wikiCopy("setupTitle"))}</h2>
    ${wikiWhy(wikiCopy("setupHint"))}
    <span class="aside">${wikiChip("help")}</span></div>
  <div class="wk-groups">${room}${kit}${stock}${people}</div>
</section>`;
}
/* A name reduced to its letters and digits, for comparing what two help pages
   call the same thing. */
const wikiKey = s => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
/* The bullets a help page lists under its own "requires the following" line,
   with the markdown taken off. Nothing else on the page counts as a
   requirement — the page has to say it. */
function wikiRequired(body){
  const blocks = wikiBlocks(body);
  const out = [];
  blocks.forEach((block, i) => {
    const lead = block.kind === "p" ? block.lines.join(" ") : block.kind === "h" ? block.line : "";
    if(!/\brequires? the following\b|\bthe following .*is required\b|\bare required\b/i.test(lead)) return;
    const next = blocks[i + 1];
    if(next && next.kind === "ul") next.items.forEach(line => out.push(wikiPlain(line)));
  });
  return out;
}
/* Markdown down to the words a reader sees. */
const wikiPlain = line => String(line ?? "")
  .replace(/\[([^\]\n]+)\]\([^)\n]*\)/g, "$1").replace(/\*\*/g, "").trim();
/* A bullet as the help file writes it, with only its own marker taken off: the
   square in front of the line is that marker here. Everything inside the line —
   an "or", a minimum, the links — is the requirement and stays. */
const wikiBullet = line => typeof line === "string" ? line.replace(/^\s*[*•‣-]\s+/, "") : line;
/* Where a line's links point, as the help writes them: "furniture-cashregister",
   "skill-hairstylist", "products-haircareproduct". A page this build does not
   carry still names the thing the line is about, so the target is read whether
   or not it resolves. */
const wikiTargets = line => [...String(line ?? "").matchAll(/\]\(([^)\n]*)\)/g)]
  .map(m => m[1].trim()).filter(Boolean);
/* The same links, with the words the help wrote over each and where each sits
   in the line: what a sentence naming several things has to be read by. */
const wikiLinks = line => [...String(line ?? "").matchAll(/\[([^\]\n]+)\]\(([^)\n]*)\)/g)]
  .map(m => ({text: m[1].replace(/\*\*/g, "").trim(), target: m[2].trim(),
    at: m.index, end: m.index + m[0].length}));
/* One line of help can hold more than one requirement. A workstation's page
   writes its needs as a sentence — "a [Desk] and a [Chair] and a [Computer]" —
   where "and" separates three things to buy while "or" offers two answers to
   one of them. The line is cut where it says "and" and never where it says
   "or", and only ever between one link and the next: an "and" inside a page's
   own name is part of that name and is left alone. A line with fewer than two
   links says one thing, whatever words it uses, and is returned as it came. */
function wikiClauses(line){
  const text = String(line ?? "");
  const links = wikiLinks(text);
  if(links.length < 2) return [text];
  const out = [];
  let start = 0;
  for(let i = 1; i < links.length; i++){
    const gap = text.slice(links[i - 1].end, links[i].at);
    if(/\bor\b|\bnor\b|\//i.test(gap)) continue;
    const cut = /\band\b|\bplus\b|[,;]/i.exec(gap);
    if(!cut) continue;
    out.push(text.slice(start, links[i - 1].end + cut.index));
    start = links[i - 1].end + cut.index + cut[0].length;
  }
  out.push(text.slice(start));
  return out.map(s => s.trim()).filter(Boolean);
}
/* What a line is about, from where its links point rather than from its words.
   A line with no link at all answers null, and the reading falls back to what
   the words say. */
function wikiLineKind(line){
  const to = wikiTargets(line);
  if(to.some(t => /^furniture-/i.test(t))) return "fixture";
  if(to.some(t => /^skill-/i.test(t))) return "skill";
  if(to.some(t => /^(products|fees)-/i.test(t))) return "stock";
  return null;
}
/* The thing a link names, whatever kind of page it is on: the tail the help's
   own slugs share with the payload's own keys. */
const wikiTargetKey = target => wikiKey(String(target).replace(/^(furniture|skill|products|fees)-/i, ""));
/* The extraction names the help page it read by its key. Under Source that is
   the evidence; anywhere else it is a file name in the middle of a sentence, so
   it goes back to being words. */
const wikiUnkey = s => String(s ?? "")
  .replace(/\bhelp_[a-z0-9_:]+\b/gi, "the help's own page").replace(/\s+/g, " ").trim();

/* --- what it sells -------------------------------------------------------- */
const wikiPill = (text, n, cls, tip) => `<span class="wk-pill${cls ? ` ${cls}` : ""}"`
  + `${tip ? ` data-tip="${attr(tip)}"` : ""}>${wikiText(text)}${n ? `<b>${wikiText(n)}</b>` : ""}</span>`;
/* A card's own title, and a link to the item's own help page where this build
   carries one. */
function wikiCardTitle(p){
  const name = wikiText(p.name);
  return p.pageId && wikiData.has(p.pageId)
    ? `<a class="wk-link" href="${attr(wikiHref({kind: "page", id: p.pageId}))}">${name}</a>`
    : name;
}
function wikiGoodsCard(p, g){
  if(p.gone) return `<div class="wk-card gone rv"><div class="wk-cardtop">
    <h3>${wikiText(wikiCopy("missingProduct"))}</h3>${wikiChip("gap")}</div>
    <dl><dt>Goes on</dt><dd><span class="quiet">${wikiText(wikiCopy("noEquipment"))}</span></dd></dl></div>`;
  const wholesalers = (g.WHOLESALERS || []).map(w => w.name);
  const goes = (p.fixtures || []).map(k => {
    const f = wikiFix(k, g);
    if(!f) return "";
    const caps = wikiCaps(p, k, f);
    return wikiPill(f.name, caps.length ? wikiCapText(caps) : "", "", wikiFixTip(f));
  }).join("");
  const state = wikiWholesale(p);
  const from = [
    state === "yes"
      ? wikiPill("Any wholesaler", wholesalers.length, "on",
          `${wholesalers.join(", ")}. Its own help page names the wholesalers, and it is on their product list.`)
      : state === "none"
      ? wikiPill("No wholesaler listed", "", "no",
          "No wholesaler's page lists it and its own page names none. That is the help being silent, not a rule in the "
          + "game: import it or make it, and check in-game before you count on it.")
      : wikiPill("Wholesale not stated", "", "unknown",
          "The help does not say either way for this one, so neither does this page."),
    ...(p.importers || []).map(k => {
      const sup = wikiSup(k, g);
      /* The address is the point of the pill: 4 Pier and 9 Pier are different
         buildings, so the number stays on. */
      return sup ? wikiPill(sup.name, sup.street, "", `${sup.kind}. ${sup.street}, ${sup.hood}.`) : "";
    }),
    wikiRecipeKeys(p).length ? wikiPill("Your factory", "", "", "Made in a factory; the recipe is below.") : "",
  ].join("");
  const also = (p.alsoSoldBy || []).map(n => wikiPill(n)).join("") || `<span class="quiet">${wikiText(wikiCopy("noOtherSellers"))}</span>`;
  return `<div class="wk-card rv"><div class="wk-cardtop"><h3>${wikiCardTitle(p)}</h3>${
    p.group === "additional" ? wikiChip("dim", wikiCopy("alsoCarried"), wikiCopy("alsoCarriedTip")) : ""}</div>
    <dl><dt${wikiCopy("capacityHint") ? ` data-tip="${attr(wikiCopy("capacityHint"))}" tabindex="0"` : ""}>Goes on</dt>
    <dd>${goes || `<span class="quiet">${wikiText(wikiCopy("noEquipment"))}</span>`}</dd>
    <dt>Comes from</dt><dd>${from}</dd>
    <dt>Also sold by</dt><dd>${also}</dd></dl></div>`;
}
/* One section of cards. The range a business calls its own and the range it
   also carries are drawn the same way, in their own sections, because a shop
   that stocks both has to buy, shelve and supply both. */
function wikiGuideCards(g, list, which, plan, ctx){
  if(!list.length) return "";
  const title = wikiCopy(which === "primary" ? "primaryTitle" : "secondaryTitle");
  const hint = wikiCopy(which === "primary" ? "primaryHint" : "secondaryHint", wikiCopy("primaryHint"));
  return `
<section class="sec">
  <div class="sechead"><h2>${wikiText(title)}</h2>
    ${wikiWhy(hint)}
    ${plan ? `<span class="aside" id="wikiPlanSlot"></span>` : ""}</div>
  <div class="wk-cards">${list.map(p => wikiGoodsCard(p, g)).join("")}</div>
</section>`;
}
/* A fee is collected, not stocked. Its card carries what the help says it
   depends on, in the help's own linked words, and never a shelf, a wholesaler
   or a recipe. */
function wikiGuideServices(g, fees, plan, ctx){
  if(!fees.length) return "";
  const cards = fees.map(p => {
    /* The help writes these as its own bulleted list; the card sets them as a
       list of its own, so the file's marker comes off and nothing inside the
       line does. */
    const lines = (p.requirementsRaw || []).map(line =>
      `<div class="wk-need">${wikiInline(wikiBullet(line), ctx)}</div>`).join("");
    const also = (p.alsoSoldBy || []).map(n => wikiPill(n)).join("") || `<span class="quiet">${wikiText(wikiCopy("noOtherSellers"))}</span>`;
    return `<div class="wk-card svc rv"><div class="wk-cardtop"><h3>${wikiCardTitle(p)}</h3>${
      p.automatic === true ? wikiChip("help", wikiCopy("automaticFee"), wikiCopy("automaticFeeTip")) : ""}${
      p.group === "additional" ? wikiChip("dim", wikiCopy("alsoOffered"), wikiCopy("alsoOfferedTip")) : ""}</div>
      <dl><dt>${wikiText(wikiCopy("dependenciesTitle"))}</dt>
      <dd class="wk-lines">${lines || `<span class="quiet">${wikiText(wikiCopy("noRequirements"))}</span>`}</dd>
      <dt>Also offered by</dt><dd>${also}</dd></dl></div>`;
  }).join("");
  return `
<section class="sec">
  <div class="sechead"><h2>${wikiText(wikiCopy("servicesTitle"))}</h2>
    ${/* No hint of its own yet: the section says nothing rather than saying it
          in words this page had no business writing. */
      wikiWhy(wikiCopy("servicesHint", ""))}
    ${plan ? `<span class="aside" id="wikiPlanSlot"></span>` : ""}</div>
  <div class="wk-cards">${cards}</div>
</section>`;
}

/* --- how it fits together -------------------------------------------------- */
/* Product, the fixture it goes on, where it comes from. Click a node and only
   its lines stay lit. The wires are drawn from the nodes' own boxes, so they
   survive a resize, and are dropped entirely on a narrow screen where the lanes
   stack: the picked state still reads from the dimming alone. */
function wikiGraphModel(primary, g){
  const guide = g || wikiG();
  const nodes = {product: [], fixture: [], source: []};
  const edges = [];
  const seen = new Set();
  const add = (lane, id, name, sub) => {
    if(seen.has(id)) return id;
    seen.add(id);
    nodes[lane].push({id, name, sub});
    return id;
  };
  let anyWholesale = false;
  primary.forEach(p => {
    add("product", `p:${p.key}`, p.name, "");
    (p.fixtures || []).forEach(k => {
      const f = wikiFix(k, guide);
      if(!f) return;
      const caps = wikiCaps(p, k, f);
      add("fixture", `f:${k}`, f.name, [
        caps.length ? `holds ${wikiCapText(caps)}` : "",
        Number.isFinite(f.customers) ? `${wikiNum(f.customers)}/h` : "",
      ].filter(Boolean).join(" · "));
      /* Supply reaches a product; a product goes on a fixture. The lines are
         stored the way they are read, so the ball can follow them in order. */
      edges.push([`p:${p.key}`, `f:${k}`, "on"]);
    });
    if(wikiWholesale(p) === "yes") anyWholesale = true;
    (p.importers || []).forEach(k => {
      const sup = wikiSup(k, guide);
      if(!sup) return;
      add("source", `s:${k}`, sup.name, `${sup.street} · import`);
      edges.push([`p:${p.key}`, `s:${k}`, "hop"]);
    });
    /* A shop's products may be made on more than one workstation, so each
       recipe brings its own rather than the page assuming a single line. */
    wikiRecipeKeys(p).forEach(key => {
      const station = wikiStation((guide.RECIPES || {})[key], guide);
      if(!station.name) return;
      const id = `s:ws:${wikiKey(station.name)}`;
      add("source", id, station.name, "your factory");
      edges.push([`p:${p.key}`, id, "hop"]);
    });
  });
  if(anyWholesale){
    const n = (guide.WHOLESALERS || []).length;
    nodes.source.unshift({id: "s:wholesale", name: "Any wholesaler", sub: `${wikiNum(n)} named`});
    primary.forEach(p => { if(wikiWholesale(p) === "yes") edges.push([`p:${p.key}`, "s:wholesale", "hop"]); });
  }
  return {nodes, edges};
}
/* What the lanes are worth. Where the extraction recorded how it read a product
   both ways — the product's page and the furniture pages — that sentence is the
   chip's own evidence, and it is help agreeing with help, not a second kind of
   file. With nothing recorded, no claim is made. */
function wikiCrosscheckChip(primary){
  const notes = primary.map(p => p.crosscheck).filter(Boolean);
  if(!notes.length) return "";
  return wikiChip("help", "read both ways",
    `${notes.join(" ")} Both directions are the same help file agreeing with itself, not a second source.`);
}
/* Above this many products the lanes stop being a picture, so the graph is
   drawn one product at a time and the cards above keep every relationship. */
const WIKI_GRAPH_MAX = 6;
/* How many pieces of equipment the setup list suggests before it offers the
   rest behind a control. An office can reach dozens of desks and chairs. */
const WIKI_SPARE = 6;
function wikiGuideGraph(g, goods){
  if(!goods.length) return "";
  const broad = goods.length > WIKI_GRAPH_MAX;
  const held = broad ? (goods.find(p => p.key === wikiFocus) || goods[0]) : null;
  const shown = broad ? [held] : goods;
  const model = wikiGraphModel(shown, g);
  const lane = (title, list) => `<div class="wk-lane"><h3>${wikiText(title)}</h3><div class="wk-stack">${
    list.map(n => `<button type="button" class="wk-node" data-node="${attr(n.id)}" aria-pressed="false">`
      + `<span>${wikiText(n.name)}</span>${n.sub ? `<small>${wikiText(n.sub)}</small>` : ""}</button>`).join("")}</div></div>`;
  const picker = broad ? `<div class="wk-picker" role="group" aria-label="${attr(wikiCopy("chooseProduct"))}">
    <span class="wk-pickerlab">${wikiText(wikiCopy("chooseProduct"))}</span>${goods.map(p =>
      `<button type="button" class="wk-tab${p === held ? " on" : ""}" data-focus="${attr(p.key)}"
        aria-pressed="${p === held ? "true" : "false"}">${wikiText(p.name)}</button>`).join("")}</div>` : "";
  return `
<section class="sec">
  <div class="sechead"><h2>${wikiText(wikiCopy("graphTitle"))}</h2>
    ${wikiWhy(wikiCopy("graphHint"))}
    <span class="aside">${wikiCrosscheckChip(shown)}</span></div>
  ${picker}
  <div class="wk-graph" id="wikiGraph" data-edges="${attr(JSON.stringify(model.edges))}">
    <svg class="wk-wires" aria-hidden="true"></svg>
    <div class="wk-shadow" aria-hidden="true"></div>
    <div class="wk-ball" aria-hidden="true"><i></i><u></u></div>
    <div class="wk-lanes">
      ${lane("Product", model.nodes.product)}
      ${lane("Goes on", model.nodes.fixture)}
      ${lane("Comes from", model.nodes.source)}
    </div>
    <div class="wk-graphfoot">
      <span class="wk-say" role="status"></span>
      <span class="wk-key"><i></i>goes on<i class="d"></i>comes from</span>
      <span class="wk-park" aria-hidden="true"></span>
      <button type="button" class="ibtn wk-letgo" data-wiki-letgo hidden aria-label="Let go of the picked node">${icon("x") || WIKI_CHEV}</button>
    </div>
  </div>
</section>`;
}

/* --- the recipes ----------------------------------------------------------- */
/* One flow per recipe, on the workstation that recipe's own page names. A
   recipe that makes more than one of the shop's products is drawn once, and
   says which of them it is for. */
function wikiRecipeFlow(row, g){
  const r = row.recipe;
  /* A recipe shared across the two ranges says so, and every product it makes
     for this shop is named: the flow is drawn once, not once per product. */
  const shared = row.users.some(u => u.group === "primary") && row.users.some(u => u.group !== "primary");
  const link = r && r.pageId && wikiData.has(r.pageId)
    ? `<a class="wk-link" href="${attr(wikiHref({kind: "page", id: r.pageId}))}">${wikiText(wikiCopy("recipeLink"))}</a>`
    : "";
  const roles = row.users.length > 1 || shared || link
    ? `<div class="wk-for">${row.users.length > 1 ? row.users.map(u => wikiPill(u.name, u.group)).join("") : ""}${
      shared ? wikiChip("help", wikiCopy("sharedRecipe")) : ""}${link}</div>` : "";
  if(!r) return `<div class="wk-flow miss rv">
    <div class="wk-box"><b>${wikiText(wikiCopy("missingRecipe"))}</b></div>
    <span class="wk-arrow" aria-hidden="true"><i></i><i></i><i></i></span>
    <div class="wk-box mid"><b>—</b></div>
    <span class="wk-arrow" aria-hidden="true"><i></i><i></i><i></i></span>
    <div class="wk-out"><b class="none">—</b>
      <span>${wikiText(row.users.map(u => u.name).join(", "))}</span>
      ${wikiChip("gap", wikiCopy("noRecipe"), wikiCopy("missingRecipeTip"))}</div>
  </div>`;
  const station = wikiStation(r, g);
  const ings = (r.inputs || []).map(i => {
    const froms = (i.from || []).map(k => (wikiSup(k, g) || {}).name).filter(Boolean).join(" · ");
    /* A rate the recipe page does not give stays a dash: a zero would read as
       a measurement. */
    const rate = Number.isFinite(i.per) ? `${wikiNum(i.per)}/h` : "—";
    return `<div class="wk-ing"><span>${wikiText(i.item)}${froms ? `<span class="wk-from">${wikiText(froms)}</span>` : ""}</span>`
      + `<span class="wk-r"${Number.isFinite(i.per) ? "" : ' data-tip="The recipe page gives no hourly rate for this input."'}>${rate}</span></div>`;
  }).join("");
  const per = (r.out || {}).per;
  const rated = Number.isFinite(per);
  return `<div class="wk-recipe rv">${roles}<div class="wk-flow">
    <div class="wk-box">${ings || `<span class="quiet">no ingredient stated</span>`}</div>
    <span class="wk-arrow" aria-hidden="true"><i></i><i></i><i></i></span>
    <div class="wk-box mid" data-tip="${attr(`${station.assembly || "An assembly machine"}`
      + `${(station.production || []).length ? ` with ${station.production.join(", ")}` : ""}`
      + `${(station.runs || []).length ? `. The same workstation runs ${station.runs.length} recipes.` : ""}`)}">
      <b>${wikiText(r.workstation || station.name || "Workstation")}</b>
      ${(station.runs || []).length
        ? `<small>${wikiNum(station.runs.length)} ${wikiCount(station.runs.length, "recipe")}</small>` : ""}</div>
    <span class="wk-arrow" aria-hidden="true"><i></i><i></i><i></i></span>
    <div class="wk-out">${rated
      ? `<b>${wikiNum(per)}<small>/h</small></b>` : `<b class="none">—</b>`}
      <span>${wikiText((r.out || {}).item || "")}</span>
      ${rated
        ? wikiChip("model", `${wikiNum(per * 24)}/day`, wikiCopy("fullDayHint"))
        : wikiChip("gap", "rate not stated", "This recipe page gives no maximum hourly rate, so there is no day figure to take from it.")}</div>
  </div></div>`;
}
function wikiGuideRecipes(g, rows, which, plan){
  if(!rows.length) return "";
  const first = which === "primary";
  const title = wikiCopy(first ? "primaryRecipesTitle" : "secondaryRecipesTitle");
  return `
<section class="sec">
  <div class="sechead"><h2>${wikiText(title)}</h2>
    ${wikiWhy(first ? wikiCopy("recipeHint") : wikiCopy("secondaryRecipeHint", wikiCopy("recipeHint")))}
    ${plan ? `<span class="aside" id="wikiPlanSlot"></span>` : ""}</div>
  <div class="wk-flows">${rows.map(row => wikiRecipeFlow(row, g)).join("")}</div>
</section>`;
}

/* --- where to go ----------------------------------------------------------- */
function wikiGuidePlaces(g){
  const roles = {};
  const role = (key, what) => {
    if(!key) return;
    roles[key] = roles[key] || new Set();
    roles[key].add(what);
  };
  Object.values(g.FIXTURES || {}).forEach(f => (f.vendors || []).forEach(v => role(v, "fixtures")));
  Object.values(g.PRODUCTS || {}).forEach(p => (p.importers || []).forEach(v => role(v, "products")));
  Object.values(g.RECIPES || {}).forEach(r => (r.inputs || []).forEach(i => (i.from || []).forEach(v => role(v, "ingredients"))));
  wikiHiring(g.BUSINESS || {}).forEach(v => role(v, "people"));
  Object.values(g.WORKSTATIONS || {}).forEach(s => {
    [].concat(s.vendors || [], s.vendor || []).forEach(v => role(v, "machines"));
  });
  const legacy = g.WORKSTATION || {};
  if(legacy.vendor) role(legacy.vendor, "machines");
  const rows = Object.keys(roles).map(key => {
    const sup = wikiSup(key, g);
    if(!sup) return "";
    const facts = [sup.size ? `size ${sup.size}` : "", sup.area ? `${wikiNum(sup.area)} m²` : "",
      Number.isFinite(sup.traffic) ? `traffic ${sup.traffic}` : ""].filter(Boolean).join(" · ");
    const mapId = /^ba:street_[a-z]+#\d+$/.test(key) ? ` data-map-id="${attr(key)}"` : "";
    /* The board's own two letters for the neighbourhood, not initials of our
       own invention: The Hamptons is HA here as it is everywhere else. */
    const code = (typeof HOOD_TAGS === "object" && HOOD_TAGS[sup.hood]) || "";
    return `<div class="wk-place">
      ${code ? `<span class="hood" data-tip="${attr(sup.hood)}">${wikiText(code)}</span>` : `<span></span>`}
      <span class="wk-nm">${wikiText(sup.name)}${sup.flag ? `<i class="wk-flag" data-tip="${attr(sup.flag)}"></i>` : ""}
        <small class="wk-addr" data-addr="${attr(sup.street)}"${mapId} data-tip="${attr(`${sup.hood}${facts ? ` · ${facts}` : ""}`)}">${wikiText(sup.street)}</small></span>
      <span class="wk-role">${wikiText([...roles[key]].join(" · "))}</span></div>`;
  }).join("");
  if(!rows) return "";
  const wholesalers = (g.WHOLESALERS || []);
  return `
<section class="sec">
  <div class="sechead"><h2>${wikiText(wikiCopy("suppliersTitle"))}</h2>
    ${wikiWhy(wikiCopy("placesHint"))}
    ${wholesalers.length ? `<span class="aside">${wikiChip("dim",
      `${wikiNum(wholesalers.length)} ${wikiCount(wholesalers.length, "wholesaler")}`,
      `${wholesalers.map(w => w.name).join(", ")}. Named on the help's own wholesale page.`)}</span>` : ""}</div>
  <div class="wk-places">${rows}</div>
</section>`;
}

/* The Growth hand-off. With a save open and this type in the planner's own
   catalogue the link really does select it; without one it says what it needs
   instead of pretending to work. */
function wikiPlanKey(){
  const b = wikiG().BUSINESS || {};
  return b.nameSrc || "";
}
function wikiCanPlan(){
  const key = wikiPlanKey();
  return !!(key && hasData() && ((D.plan || {}).catalogue || {})[key]);
}
function wikiPlanChain(){
  if(!wikiCanPlan()) return false;
  planType = wikiPlanKey();
  planCounts = {};
  showSub("growth", "plan");
  showPage("growth");
  drawPlan();
  return true;
}
function wikiPlanControl(){
  const slot = $("wikiPlanSlot");
  if(!slot) return;
  const name = (wikiG().BUSINESS || {}).name || "this range";
  if(wikiCanPlan())
    /* The planner works from the business's own range; the recipes for what it
       also carries stay here. The words for that distinction are authored. */
    slot.innerHTML = `<button type="button" class="btn2" data-wiki-plan
      data-tip="${attr(wikiCopy("plannerHint", `Open the Growth planner with ${name} selected.`))}"
      >${wikiText(wikiCopy("plannerLabel"))} ${icon("chev")}</button>`;
  else
    slot.innerHTML = `<span class="quiet" data-tip="${attr(hasData()
      ? "This business type is missing from your save's planner catalogue."
      : "Load a save to plan with your factories and orders.")}"
      >${hasData() ? "Not in this save's catalogue" : "Open a save to plan this range"}</span>`;
}

function wikiGuideOwn(g, goods){
  if(!hasData()) return [];
  const b = g.BUSINESS || {};
  const mine = (D.businesses || []).filter(x => String(x.type || "").toLowerCase() === String(b.name || "").toLowerCase());
  const slots = [];
  if(mine.length) slots.push(wikiSlot("Your shops", `${mine.length}`,
    `Businesses of this type in your company: ${mine.slice(0, 4).map(x => x.name).join(", ")}.`));
  const sold = (D.products || []).filter(p => goods.some(x => x.name === p.item));
  if(sold.length && goods.length) slots.push(wikiSlot("Its range, sold", `${sold.length} of ${goods.length}`,
    `${sold.map(p => p.item).join(", ")} moved in your shops yesterday.`));
  return slots;
}

function wikiGuideSource(g, page, ctx){
  const gaps = (g.GAPS || []).map(gap =>
    `<div class="wk-gap" data-tip="${attr(wikiUnkey(gap.detail))}" tabindex="0"><i></i><span>${wikiText(gap.what)}</span></div>`).join("");
  return `
<section class="sec">
  <div class="sechead"><h2>${wikiText(wikiCopy("sourceTitle"))}</h2>
    ${wikiWhy(wikiCopy("sourceHint"))}
    <span class="aside">${(g.GAPS || []).length
      ? wikiChip("gap", `${g.GAPS.length} ${wikiCount(g.GAPS.length, "gap")}`) : ""}</span></div>
  <div class="wk-gaps">${gaps}</div>
  <details class="wk-src">
    <summary>${wikiText(wikiCopy("originalHelp"))}</summary>
    <div class="wk-read">${wikiBody(page.body, ctx)}</div>
  </details>
  ${wikiSource(page)}
</section>`;
}

/* --- drawing ------------------------------------------------------------- */
/* The board's own tip layer, told to let go. It is keyed to the element the
   pointer or the keyboard last entered, and that element is about to stop
   existing, so nothing else would dismiss it. A note the reader opened with the
   keyboard survives, because focus moves with the redraw and brings it back. */
function wikiDropTip(){ if(typeof hideTip === "function") hideTip(); }
function wikiFrame(body){
  return `<div class="wk-wrap">${body}</div>`;
}
/* What the reader was holding when a control redrew the page under them. The
   node itself goes out with the rest of the guide, so it is remembered by what
   it is — a selector the new page answers with the same control — and by where
   on the screen it was, which is the place it has to be left in. */
function wikiHold(el, sel, then){
  if(!el || typeof el.getBoundingClientRect !== "function" || !sel) return null;
  return {sel, then: then || null, top: el.getBoundingClientRect().top};
}
/* An attribute value as a selector can quote it. */
const wikiSelValue = v => `"${String(v ?? "").replace(/["\\]/g, "\\$&")}"`;
/* The redraw hands the reader back what they pressed: the same control on the
   new page, or — where pressing it was the end of that control, as "Show all"
   is — the first thing it revealed. Focus goes back to it and the page is
   scrolled so it sits where it sat, rather than leaving the caret on the
   document and the reader at the top of the navigation again. */
function wikiRestore(hold){
  if(!hold) return;
  const host = wikiRoot();
  if(!host || !host.querySelector) return;
  const found = host.querySelector(hold.sel) || (hold.then ? host.querySelector(hold.then) : null);
  if(!found) return;
  const settle = () => {
    if(found.isConnected === false || typeof found.getBoundingClientRect !== "function") return;
    const by = found.getBoundingClientRect().top - hold.top;
    if(Math.abs(by) > 1 && typeof window.scrollBy === "function") window.scrollBy(0, by);
  };
  settle();
  /* Focus must not undo the scroll it was just given. */
  try{ found.focus({preventScroll: true}); }catch(e){ try{ found.focus(); }catch(err){} }
  /* A section the browser has not painted yet is measured from its estimate,
     so the same correction is made once more when the new layout has settled. */
  if(typeof requestAnimationFrame === "function") requestAnimationFrame(settle);
}
function drawWiki(hold){
  const host = wikiRoot();
  if(!host) return;
  if(wikiStatus === "loading" || wikiStatus === "idle"){
    host.innerHTML = wikiFrame(`<p class="wk-state" role="status">Reading the game's help…</p>`);
    return;
  }
  if(wikiStatus === "error"){
    host.innerHTML = wikiFrame(`<div class="wk-state err" role="status">
      <p><b>The wiki could not be opened.</b> ${wikiText(wikiFailure)}</p>
      <p class="quiet">The wiki is the game's own help text, kept beside the board. It is a separate file from your save,
        so nothing else on the board is affected.</p>
      <p><button type="button" class="btn2" data-wiki-retry>Try again</button></p>
    </div>`);
    wireWiki();
    return;
  }
  /* A note hanging off an element this redraw is about to remove would be left
     floating over whatever lands in its place: nothing else tells the tip layer
     that its carrier has gone. */
  wikiDropTip();
  /* The search is redrawn with the page it filters, so where the caret was has
     to survive the redraw — but only when the reader was actually in the field.
     A click on "Show all" must not steal it. */
  const was = $("wikiSearch");
  const held = !!was && typeof document !== "undefined" && document.activeElement === was;
  const caret = held ? [was.selectionStart, was.selectionEnd] : null;
  /* Which business is being read, worked out once per draw and left where the
     pieces that run after it can ask. */
  wikiActive = wikiRoute.kind === "page" ? wikiGuideFor(wikiRoute.id) : null;
  const body = wikiRoute.kind === "category" ? wikiCategoryView()
    : wikiRoute.kind === "page" ? wikiPageView()
    : wikiHome();
  host.innerHTML = wikiFrame(body);
  wireWiki();
  wikiPins();
  wikiPlanControl();
  wikiScores();
  wikiGraph();
  wireTips();
  wireReveal();
  const search = $("wikiSearch");
  if(search && held){
    search.focus();
    /* An empty box still keeps the caret: clearing the last letter must not
       feel like the control died. */
    try{ search.setSelectionRange(caret[0] ?? search.value.length, caret[1] ?? search.value.length); }catch(e){}
    return;
  }
  wikiRestore(hold);
}

/* --- what the reader can do --------------------------------------------- */
function wireWiki(){
  const host = wikiRoot();
  if(!host || wikiWired) return;
  wikiWired = true;
  host.addEventListener("input", e => {
    const field = e.target.closest("#wikiSearch");
    if(!field) return;
    /* The search is a route, so a reload keeps it — but typing must not fill
       the Back button with a visit per letter. */
    wikiRoute = {kind: "home", id: "", query: field.value};
    wikiShowAll = false;
    try{ history.replaceState(null, "", wikiHref(wikiRoute)); }catch(err){}
    drawWiki();
  });
  host.addEventListener("click", e => {
    if(e.target.closest("[data-wiki-retry]")){ wikiStatus = "idle"; loadWikiData(); return; }
    if(e.target.closest("[data-wiki-all]")){ wikiShowAll = true; drawWiki(); return; }
    /* The control has done its one job and is gone from the redrawn page, so
       the reader is put on the first piece it uncovered, where it stood. */
    const more = e.target.closest("[data-wiki-fix]");
    if(more){ wikiShowFix = true; drawWiki(wikiHold(more, "[data-wiki-more]")); return; }
    if(e.target.closest("[data-wiki-plan]")){ wikiPlanChain(); return; }
    if(e.target.closest("[data-wiki-letgo]")){ wikiPick(null); return; }
    /* A wide range is drawn one product at a time, so choosing another product
       redraws the lanes — and lets go of whatever the old ones were holding. */
    const focus = e.target.closest("[data-focus]");
    if(focus){
      wikiFocus = wikiFocus === focus.dataset.focus ? wikiFocus : focus.dataset.focus;
      wikiPicked = null;
      /* The chosen product is still the chooser's own tab on the new page, and
         the graph it redrew is the thing the reader is waiting to look at: both
         have to be left where they were on the screen. */
      drawWiki(wikiHold(focus, `[data-focus=${wikiSelValue(focus.dataset.focus)}]`));
      return;
    }
    const tick = e.target.closest("[data-tick]");
    if(tick){ wikiTick(tick); return; }
    const node = e.target.closest("[data-node]");
    if(node){ wikiPick(wikiPicked === node.dataset.node ? null : node.dataset.node); return; }
  });
  host.addEventListener("keydown", e => {
    /* A checkbox answers to Space as well as to Enter. */
    if(e.key === " " && e.target.closest("[data-tick]")){ e.preventDefault(); wikiTick(e.target.closest("[data-tick]")); }
  });
  /* Escape lets the graph go from anywhere on the page, not only from inside it. */
  document.addEventListener("keydown", e => {
    if(e.key === "Escape" && page === "wiki" && wikiPicked) wikiPick(null);
  });
  /* The tilt is a flourish: it follows the pointer and is skipped entirely when
     the reader has asked for less motion. */
  host.addEventListener("mousemove", e => {
    const card = e.target.closest(".wk-cat");
    if(!card || REDUCED) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty("--ry", ((e.clientX - r.left) / r.width - .5) * 10 + "deg");
    card.style.setProperty("--rx", -((e.clientY - r.top) / r.height - .5) * 8 + "deg");
  });
  host.addEventListener("mouseout", e => {
    const card = e.target.closest(".wk-cat");
    if(card){ card.style.setProperty("--ry", "0deg"); card.style.setProperty("--rx", "0deg"); }
    if(e.target.closest(".wk-node")) wikiHot(null);
  });
  /* Hovering a node warms its own lines, which is how the graph answers before
     anything is picked. It is repainted from the pointer, so a redraw in
     between costs nothing. */
  host.addEventListener("mouseover", e => {
    const node = e.target.closest(".wk-node");
    if(node) wikiHot(node.dataset.node);
  });
  window.addEventListener("resize", () => {
    if(page !== "wiki") return;
    /* A note measured against the old layout would be left behind by the new
       one, and the wires have to be redrawn from where the nodes now are. */
    wikiDropTip();
    wikiWires();
  });
  /* Someone who turns motion down while the page is open is answered at once. */
  const motion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)");
  if(motion && motion.addEventListener) motion.addEventListener("change", () => { if(page === "wiki") wikiBall(); });
}
/* Which lines are warm under the pointer. Never touches what is lit. */
function wikiHot(id){
  const graph = $("wikiGraph");
  if(!graph) return;
  $$("path", graph).forEach(p => p.classList.toggle("hot", !!id && (p.dataset.a === id || p.dataset.b === id)));
}

function wikiTick(el){
  const id = el.dataset.tick;
  if(wikiTicked.has(id)) wikiTicked.delete(id); else wikiTicked.add(id);
  el.setAttribute("aria-checked", wikiTicked.has(id) ? "true" : "false");
  /* The square is the control; the row is what wears the line through it. */
  const row = (el.closest && el.closest(".wk-item")) || el;
  row.classList.toggle("done", wikiTicked.has(id));
  wikiScores();
}
/* Each card keeps its own score. */
function wikiScores(){
  $$(".wk-group", wikiRoot()).forEach(group => {
    const items = $$("[data-tick]", group);
    const done = items.filter(i => wikiTicked.has(i.dataset.tick)).length;
    const ph = group.querySelector(".wk-ph");
    if(!ph || !items.length) return;
    ph.style.setProperty("--done", done / items.length);
    ph.querySelector("b").textContent = `${done}/${items.length}`;
    ph.classList.toggle("complete", done === items.length);
  });
}

/* --- the relation graph --------------------------------------------------- */
function wikiEdges(){
  const graph = $("wikiGraph");
  if(!graph) return [];
  try{ return JSON.parse(graph.dataset.edges || "[]"); }catch(e){ return []; }
}
function wikiPick(id){
  wikiPicked = id;
  wikiPaint();
}
function wikiPaint(){
  const graph = $("wikiGraph");
  if(!graph) return;
  const edges = wikiEdges();
  const lit = new Set();
  if(wikiPicked){
    lit.add(wikiPicked);
    edges.forEach(e => { if(e[0] === wikiPicked || e[1] === wikiPicked){ lit.add(e[0]); lit.add(e[1]); } });
  }
  graph.classList.toggle("picked", !!wikiPicked);
  let name = "";
  $$(".wk-node", graph).forEach(n => {
    const on = n.dataset.node === wikiPicked;
    n.classList.toggle("lit", lit.has(n.dataset.node));
    n.classList.toggle("on", on);
    n.setAttribute("aria-pressed", String(on));
    if(on) name = n.querySelector("span").textContent;
  });
  wikiPaintWires(graph);
  const say = graph.querySelector(".wk-say");
  const links = wikiPicked ? edges.filter(e => e[0] === wikiPicked || e[1] === wikiPicked).length : 0;
  /* The reading is the accessible one too: the status line says what is held
     and how many lines it has, and the button that lets go appears with it. */
  if(say) say.textContent = wikiPicked ? `${name} · ${links} link${links === 1 ? "" : "s"}` : "";
  const letgo = graph.querySelector("[data-wiki-letgo]");
  if(letgo) letgo.hidden = !wikiPicked;
  wikiBall();
}
/* Which wires are lit is a property of the pick, not of the last repaint, so it
   is applied wherever the paths come from — including a set drawn a moment ago
   by a resize. */
function wikiPaintWires(graph){
  $$("path", graph).forEach(p => p.classList.toggle("lit",
    !!wikiPicked && (p.dataset.a === wikiPicked || p.dataset.b === wikiPicked)));
}
/* The wires are drawn from where the nodes actually are, so a resize or a font
   swap never leaves them behind. Below the breakpoint the lanes stack and the
   wires are dropped: the picked state reads from the dimming alone. Whatever
   happens, the pick survives: the fresh paths are re-lit and the ball is sent
   after the new ones rather than the ones that have just been thrown away. */
function wikiWires(){
  const graph = $("wikiGraph");
  const svg = graph && graph.querySelector(".wk-wires");
  if(!svg) return;
  const box = graph.getBoundingClientRect();
  const stacked = graph.classList.contains("stacked")
    || (window.matchMedia && matchMedia("(max-width:760px)").matches);
  if(stacked || !box.width){
    svg.innerHTML = "";
    wikiBall();
    return;
  }
  const at = id => graph.querySelector(`[data-node="${CSS && CSS.escape ? CSS.escape(id) : id}"]`);
  svg.innerHTML = wikiEdges().map(e => {
    const a = at(e[0]), b = at(e[1]);
    if(!a || !b) return "";
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const x1 = ra.right - box.left, y1 = ra.top + ra.height / 2 - box.top;
    const x2 = rb.left - box.left, y2 = rb.top + rb.height / 2 - box.top;
    const hop = e[2] === "hop", c = hop ? 90 : 55;
    const d = hop
      ? `M${x1} ${y1} C ${x1 + c} ${y1}, ${x2 - c} ${y2 + 10}, ${x2} ${y2}`
      : `M${x1} ${y1} C ${x1 + c} ${y1}, ${x2 - c} ${y2}, ${x2} ${y2}`;
    return `<path class="${hop ? "hop" : ""}" data-a="${attr(e[0])}" data-b="${attr(e[1])}" d="${d}"></path>`;
  }).join("");
  wikiPaintWires(graph);
  wikiBall();
}
function wikiGraph(){
  const graph = $("wikiGraph");
  if(!graph) return;
  wikiWires();
  wikiPaint();
  /* The lanes and the fonts settle after the first frame, and a web font can
     land later still; the wires are cheap to redraw and wrong until then. */
  requestAnimationFrame(() => { if(page === "wiki") wikiWires(); });
  setTimeout(() => { if(page === "wiki") wikiWires(); }, 400);
  if(typeof document !== "undefined" && document.fonts && document.fonts.ready)
    document.fonts.ready.then(() => { if(page === "wiki") wikiWires(); }).catch(() => {});
}

/* The ball: parked on the rule at rest, and while something is picked it rides
   the lit wires — supply into the product first, because that is the way the
   goods travel, then the product onto its shelf. Motion is a flourish: with
   reduced motion asked for it stays parked, and it never runs while the Wiki is
   not the page on screen. */
const WIKI_BALL = 44;
let wikiBallFrame = null;
const wikiReduced = () => REDUCED
  || !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
function wikiBallStop(){
  if(wikiBallFrame){ cancelAnimationFrame(wikiBallFrame); wikiBallFrame = null; }
}
/* Where the ball waits: on the graph's own rule, at the right-hand end, in the
   gap the foot keeps for it. */
function wikiBallPark(graph, ball, shadow){
  const box = graph.getBoundingClientRect();
  const foot = graph.querySelector(".wk-graphfoot");
  const slot = graph.querySelector(".wk-park") || foot;
  if(!foot || !box.width){ ball.hidden = shadow.hidden = true; return; }
  const rule = foot.getBoundingClientRect(), seat = slot.getBoundingClientRect();
  const x = seat.left - box.left + seat.width / 2 - WIKI_BALL / 2;
  const y = rule.top - box.top - WIKI_BALL / 2;
  ball.hidden = shadow.hidden = false;
  ball.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
  shadow.style.transform = `translate(${x.toFixed(1)}px,${(y + WIKI_BALL / 2 - 5).toFixed(1)}px)`;
}
function wikiBall(){
  const graph = $("wikiGraph");
  const ball = graph && graph.querySelector(".wk-ball");
  const shadow = graph && graph.querySelector(".wk-shadow");
  if(!ball || !shadow) return;
  wikiBallStop();
  /* Supply first, then the shelf: the hops are ridden before the goes-on lines,
     and a hop is drawn product-to-supplier, so it is ridden backwards. */
  const lit = wikiPicked ? $$("path.lit", graph) : [];
  const legs = lit.filter(p => p.classList.contains("hop")).map(p => ({path: p, back: true}))
    .concat(lit.filter(p => !p.classList.contains("hop")).map(p => ({path: p, back: false})));
  if(!legs.length || typeof legs[0].path.getTotalLength !== "function" || wikiReduced()){
    wikiBallPark(graph, ball, shadow);
    return;
  }
  ball.hidden = shadow.hidden = false;
  const SPEED = 230;
  let leg = 0, started = null;
  const step = now => {
    /* The page under it may have gone: another tab, another wiki route, or a
       redraw that replaced these very paths. */
    if(page !== "wiki" || !graph.isConnected || !wikiPicked || !legs[0].path.isConnected){ wikiBallFrame = null; return; }
    const {path, back} = legs[leg % legs.length];
    const length = path.getTotalLength();
    if(started === null) started = now;
    const span = Math.max(650, length / SPEED * 1000);
    const t = Math.min(1, (now - started) / span);
    const point = path.getPointAtLength(length * (back ? 1 - t : t));
    ball.style.transform = `translate(${(point.x - WIKI_BALL / 2).toFixed(1)}px,${(point.y - WIKI_BALL / 2).toFixed(1)}px)`;
    shadow.style.transform = `translate(${(point.x - WIKI_BALL / 2).toFixed(1)}px,${(point.y + WIKI_BALL / 2 - 5).toFixed(1)}px)`;
    if(t >= 1){ leg += 1; started = null; }
    wikiBallFrame = requestAnimationFrame(step);
  };
  wikiBallFrame = requestAnimationFrame(step);
}

/* The web front door asks for these: the wiki opens with no save at all. */
window.BigCopilotWiki = {
  open(){ showPage("wiki"); },
  route: showWikiRoute,
  ready: () => wikiStatus === "ready",
};
