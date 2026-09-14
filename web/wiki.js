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
const wikiTicked = new Set();   // the setup squares, this visit only
let wikiPicked = null;          // the node the relation graph is holding

const wikiRoot = () => $("wikiRoot");
/* Counts are written the way the board writes money: one thousands mark, the
   same one whatever the browser's own locale would have chosen. */
const wikiNum = n => Number(n || 0).toLocaleString("en-US");
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
    wikiPicked = null;
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
const wikiWhy = text => `<span class="why" data-tip="${attr(text)}" tabindex="0"><i>?</i></span>`;
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
  if(wikiIsSample(page)) return wikiSamplePage(page, cat);
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
  const sources = (wikiData.sample || {}).SOURCES || {};
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

/* --- the authored page --------------------------------------------------- */
/* One business was extracted end to end, so it is drawn as the design draws it:
   glance tiles, what to buy in which order, the range, how the pieces fit, the
   recipes, the addresses. Every other page is the reader above.

   Every claim here is the game's help unless the extraction carried other
   evidence with it, and the page says which is which rather than wearing one
   badge over the lot. */
function wikiIsSample(page){
  const s = wikiData.sample;
  return !!(s && s.BUSINESS && String(s.BUSINESS.slug) === String(page.id));
}
const wikiSup = key => ((wikiData.sample || {}).SUPPLIERS || {})[key] || null;
const wikiFix = key => ((wikiData.sample || {}).FIXTURES || {})[key] || null;
const wikiProd = key => ((wikiData.sample || {}).PRODUCTS || {})[key] || null;
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
/* What the shipped shops actually contain, where the extraction counted them.
   That is the only evidence on this page that is not the help text. */
function wikiPlaced(){
  const fixtures = Object.values((wikiData.sample || {}).FIXTURES || {});
  const counted = fixtures.filter(f => f && f.observed);
  return counted.length ? counted : null;
}

function wikiSamplePage(page, cat){
  const s = wikiData.sample;
  const b = s.BUSINESS;
  const primary = (b.primary || []).map(k => ({key: k, ...(wikiProd(k) || {})})).filter(p => p.name);
  const ctx = {id: String(page.id)};
  const yes = primary.filter(p => wikiWholesale(p) === "yes");
  const none = primary.filter(p => wikiWholesale(p) === "none");
  const unknown = primary.filter(p => wikiWholesale(p) === "unknown");
  /* The one sentence at the top is only written when the range is known either
     way; a product the extraction could not read is said out loud instead. */
  const lede = !primary.length ? ""
    : unknown.length ? `${wikiNum(yes.length)} of its ${wikiNum(primary.length)} products are named on a wholesaler's `
      + `list; ${wikiNum(unknown.length)} the help does not say either way.`
    : none.length ? `${wikiNum(yes.length)} of its ${wikiNum(primary.length)} products can be ordered from any wholesaler.`
    : `Every one of its ${wikiNum(primary.length)} products can be ordered from any wholesaler.`;
  const placed = wikiPlaced();
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
<p class="wk-lede rv">${wikiText(lede)}${none.length === 1
  ? ` <b>${wikiText(none[0].name)} is on no wholesaler's list.</b>` : ""}</p>
${wikiSampleTiles(b, primary)}
${wikiSampleSetup(b, page)}
${wikiSampleProducts(primary)}
${wikiSampleGraph(primary)}
${wikiSampleRecipes(primary)}
${wikiSamplePlaces()}
${wikiYours(page, wikiSampleOwn(b, primary))}
${wikiSampleSource(page, ctx)}`;
}

function wikiSampleTiles(b, primary){
  const s = wikiData.sample;
  const sizes = (s.RETAIL_SIZES || []).map(r => r.code);
  const extras = (b.extras || []).length;
  const skills = b.skills || [];
  const hiring = wikiSup(b.hiring);
  return `<div class="kpis wk-tiles">
  <div class="kpi rv" data-tip="${attr(sizes.length
    ? `Any retail size code the help lists: ${sizes.join(", ")}. The door limit rises with the code.`
    : "The kind of building this business needs.")}">
    <span class="lab">Building</span><span class="v t">${wikiText(b.building || "—")}</span>
    ${sizes.length ? `<span class="sub">${wikiText(sizes[0])} – ${wikiText(sizes[sizes.length - 1])}</span>` : ""}</div>
  <div class="kpi rv" data-tip="How customers are served, from the help page's own wording.">
    <span class="lab">Customers</span><span class="v t">${wikiText(b.serving || "—")}</span></div>
  <div class="kpi rv" data-tip="${attr(`Its own range: ${primary.map(p => p.name).join(", ")}.`
    + (extras ? ` ${extras} more may be carried on the side; each belongs to another type's page.` : ""))}">
    <span class="lab">Core range</span><span class="v">${primary.length}</span>
    ${extras ? `<span class="sub">+${extras} on the side</span>` : ""}</div>
  <div class="kpi rv" data-tip="${attr(skills.length
    ? `${skills.join(" and ")}.${hiring ? ` Hired at ${hiring.name}, ${hiring.street}.` : ""}`
    : "The help page names no staff skills for this type.")}">
    <span class="lab">Staff skills</span><span class="v">${skills.length}</span>
    ${skills.length ? `<span class="sub">${wikiText(skills.join(" · ").toLowerCase())}</span>` : ""}</div>
</div>`;
}

/* What to buy, in the order you buy it, with the one requirement the business
   page forgets marked as such. Ticking is a scratch pad: nothing is stored. */
function wikiSampleSetup(b, page){
  const s = wikiData.sample;
  const sizes = (s.RETAIL_SIZES || []);
  /* What this business page itself calls required, in its own words. A filled
     square means the page said so; everything else is the board grouping the
     help's other pages, and stays hollow. If the game rewrites the page, the
     filled squares follow it. */
  const stated = Array.isArray(b.requirements) ? b.requirements : Array.isArray(b.required) ? b.required : null;
  const required = (stated ? stated.map(r => typeof r === "string" ? r : r && (r.name || r.label))
    : wikiRequired(page.body)).filter(Boolean);
  const mentions = (haystack, needle) => {
    const a = wikiKey(haystack), c = wikiKey(needle);
    return !!a && !!c && (a.includes(c) || c.includes(a));
  };
  const isRequired = name => required.some(r => mentions(r, name));
  /* A till is any fixture the help gives a work station; what a till consumes
     is a list on its own page, and only some of the tills carry it. */
  const tills = Object.keys(s.FIXTURES || {}).filter(k => s.FIXTURES[k].station);
  const sellers = Object.keys(s.FIXTURES || {}).filter(k => (s.FIXTURES[k].sells || []).length);
  const store = Object.keys(s.FIXTURES || {}).filter(k =>
    (s.FIXTURES[k].capacity || []).some(c => /box/i.test(c.unit || "")) && !(s.FIXTURES[k].sells || []).length);
  const consumer = tills.find(k => [].concat(s.FIXTURES[k].needs || []).length);
  const need = consumer ? String([].concat(s.FIXTURES[consumer].needs)[0]) : "";
  /* The catch only exists while the business page really is silent about it. */
  const bagCatch = !!need && !mentions(page.body || "", need) && !isRequired(need);
  const vendorLine = keys => (keys || []).map(k => (wikiSup(k) || {}).name).filter(Boolean).join(", ");
  const vendorCount = keys => `${wikiNum((keys || []).length)} vendor${(keys || []).length === 1 ? "" : "s"}`;

  const item = (o) => `<button type="button" class="wk-item${o.req ? " req" : ""}" role="checkbox"
    aria-checked="${wikiTicked.has(o.id) ? "true" : "false"}" data-tick="${attr(o.id)}"
    ${o.tip ? `data-tip="${attr(o.tip)}"` : ""}>
    <span class="wk-tick"></span><span><strong>${wikiText(o.name)}${o.catch
      ? `<i class="wk-catch" aria-label="named by the till's page, not by this one"></i>` : ""}</strong>
    <span class="wk-m">${o.meta || ""}</span></span></button>`;
  const group = (title, items) => `<div class="wk-group rv"><h3>${wikiText(title)}</h3>${items.join("")}
    <div class="wk-ph"><span class="wk-track"><i></i></span><b>0/${items.length}</b></div></div>`;

  /* The required lines the page gives that name neither a fixture this sample
     carries nor a product: kept in the page's own words. */
  const fixtureNamed = line => Object.keys(s.FIXTURES || {}).find(k => mentions(line, s.FIXTURES[k].name));
  const productLine = line => /product|sell/i.test(line) && !fixtureNamed(line) && !/point of sale/i.test(line);

  const room = group("The room", [item({
    id: "room", req: !!b.building, name: `${b.building || "A"} building`,
    meta: sizes.length ? `${wikiText(sizes[0].code)} – ${wikiText(sizes[sizes.length - 1].code)}` : "",
    tip: `The page's own opening line: this business operates out of ${String(b.building || "these").toLowerCase()} buildings. `
      + "Rented before anything else; the traffic index belongs to the address and the door limit rises with the size code.",
  })]);

  const requiredFixtures = required.filter(line => !productLine(line)).map((line, i) => {
    const key = fixtureNamed(line);
    const f = key ? s.FIXTURES[key] : null;
    const till = !f && /point of sale/i.test(line);
    return item({
      id: `req-${key || i}`, req: true, name: f ? f.name : line,
      meta: f
        ? `${Number.isFinite(f.customers) ? `serves <b>${wikiNum(f.customers)}</b>/h · ` : ""}${vendorCount(f.vendors)}`
        /* Left and right of the same counter serve the same number, so each
           kind of till is named once. */
        : till ? [...new Map(tills.map(k => [s.FIXTURES[k].name.split(" (")[0],
            `${wikiText(s.FIXTURES[k].name.split(" (")[0])}${Number.isFinite(s.FIXTURES[k].customers)
              ? ` <b>${wikiNum(s.FIXTURES[k].customers)}</b>/h` : ""}`])).values()].join(" · ")
          : "",
      tip: f ? `${wikiFixTip(f)} Sold by ${vendorLine(f.vendors)}.`
        : till && tills.length ? `${tills.map(k => s.FIXTURES[k].name).join(", ")}. `
            + `${s.FIXTURES[tills[0]].mount ? `The register stands on ${s.FIXTURES[tills[0]].mount}. ` : ""}`
            + `${need ? `${s.FIXTURES[consumer].name} also needs ${need}s of its own.` : ""}`
          : "Listed on this business's own page under what it requires to function.",
    });
  });
  const optionalFixtures = [...sellers, ...store].filter(k => !isRequired(s.FIXTURES[k].name)).map(k => item({
    id: `fix-${k}`, req: false, name: s.FIXTURES[k].name,
    meta: `${Number.isFinite(wikiFixHolds(s.FIXTURES[k])) ? `holds <b>${wikiNum(wikiFixHolds(s.FIXTURES[k]))}</b> · ` : ""}${vendorCount(s.FIXTURES[k].vendors)}`,
    tip: `${wikiFixTip(s.FIXTURES[k])} Sold by ${vendorLine(s.FIXTURES[k].vendors)}. `
      + "Its own help page, not this business's: the shop can open without it.",
  }));
  const fixtures = group("Fixtures", [...requiredFixtures, ...optionalFixtures]);

  const stock = group("Stock", [
    ...required.filter(productLine).map((line, i) => item({
      id: `stock-${i}`, req: true, name: line, meta: "",
      tip: "In the business page's own words, under what it requires to function.",
    })),
    ...(need ? [item({
      id: "stock-need", req: true, name: `${need}s`, meta: "the till's own page", catch: bagCatch,
      tip: `${s.FIXTURES[consumer].name} lists ${need}s on its own help page under what it requires to function`
        + `${bagCatch ? ", and this business's page does not mention them at all" : ""}. `
        + `A shop with a till and no ${need.toLowerCase()}s has nothing to ring a sale into.`,
    })] : []),
  ]);

  const people = group("People", (b.skills || []).map(skill => item({
    id: `skill-${skill}`, req: isRequired(skill), name: skill,
    meta: wikiSup(b.hiring) ? wikiText(wikiSup(b.hiring).name) : "",
    tip: (wikiSup(b.hiring) ? `Hired at ${wikiSup(b.hiring).name}, ${wikiSup(b.hiring).street}. ` : "")
      + "The page says these skills can be assigned, not that the shop cannot open without them.",
  })));
  return `
<section class="sec">
  <div class="sechead"><h2>To open</h2>
    ${wikiWhy("Green squares mark listed requirements; hollow squares are suggestions. Tick items as you go; checkmarks reset on reload.")}
    <span class="aside">${wikiChip("help")}</span></div>
  <div class="wk-groups">${room}${fixtures}${stock}${people}</div>
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
/* The extraction names the help page it read by its key. Under Source that is
   the evidence; anywhere else it is a file name in the middle of a sentence, so
   it goes back to being words. */
const wikiUnkey = s => String(s ?? "")
  .replace(/\bhelp_[a-z0-9_:]+\b/gi, "the help's own page").replace(/\s+/g, " ").trim();

function wikiSampleProducts(primary){
  const s = wikiData.sample;
  const wholesalers = (s.WHOLESALERS || []).map(w => w.name);
  const pill = (text, n, cls, tip) => `<span class="wk-pill${cls ? ` ${cls}` : ""}"${tip ? ` data-tip="${attr(tip)}"` : ""}>`
    + `${wikiText(text)}${n ? `<b>${wikiText(n)}</b>` : ""}</span>`;
  const cards = primary.map(p => {
    const goes = (p.fixtures || []).map(k => {
      const f = wikiFix(k);
      if(!f) return "";
      /* A fixture lists a capacity per kind of goods ("Gifts 300, flowers 100");
         the product's own first word picks its line, and its own name is data,
         so it is escaped before it becomes a pattern. A fixture whose page gives
         no capacity carries no number rather than an empty one. */
      const family = p.name.split(" ")[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const cap = (f.capacity || []).find(c => new RegExp(family, "i").test(c.label || "")) || (f.capacity || [])[0];
      return pill(f.name, cap && Number.isFinite(cap.value) ? wikiNum(cap.value) : "", "", wikiFixTip(f));
    }).join("");
    const state = wikiWholesale(p);
    const from = [
      state === "yes"
        ? pill("Any wholesaler", wholesalers.length, "on",
            `${wholesalers.join(", ")}. Its own help page names the wholesalers, and it is on their product list.`)
        : state === "none"
        ? pill("No wholesaler listed", "", "no",
            "No wholesaler's page lists it and its own page names none. That is the help being silent, not a rule in the "
            + "game: import it or make it, and check in-game before you count on it.")
        : pill("Wholesale not stated", "", "unknown",
            "The help does not say either way for this one, so neither does this page."),
      ...(p.importers || []).map(k => {
        const sup = wikiSup(k);
        /* The address is the point of the pill: 4 Pier and 9 Pier are different
           buildings, so the number stays on. */
        return sup ? pill(sup.name, sup.street, "", `${sup.kind}. ${sup.street}, ${sup.hood}.`) : "";
      }),
      p.recipe ? pill("Your factory", "", "", "Made in a factory; the recipe is below.") : "",
    ].join("");
    const also = (p.alsoSoldBy || []).map(n => pill(n)).join("") || `<span class="quiet">nobody else</span>`;
    return `<div class="wk-card rv"><div class="wk-cardtop"><h3>${wikiText(p.name)}</h3></div>
      <dl><dt>Goes on</dt><dd>${goes || `<span class="quiet">no fixture named</span>`}</dd>
      <dt>Comes from</dt><dd>${from}</dd>
      <dt>Also sold by</dt><dd>${also}</dd></dl></div>`;
  }).join("");
  const extras = (s.BUSINESS.extras || []);
  return `
<section class="sec">
  <div class="sechead"><h2>Sells</h2>
    ${wikiWhy("Shelf numbers show storage capacity. A red dashed label means that supply option isn't listed in the help.")}
    ${extras.length ? `<span class="aside">${wikiChip("dim", `+${extras.length} on the side`,
      `${extras.join(", ")}. Each belongs to another type's main range and is documented there.`)}</span>` : ""}</div>
  <div class="wk-cards">${cards}</div>
</section>`;
}

/* Product, the fixture it goes on, where it comes from. Click a node and only
   its lines stay lit. The wires are drawn from the nodes' own boxes, so they
   survive a resize, and are dropped entirely on a narrow screen where the lanes
   stack: the picked state still reads from the dimming alone. */
function wikiGraphModel(primary){
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
      const f = wikiFix(k);
      if(!f) return;
      const holds = wikiFixHolds(f);
      add("fixture", `f:${k}`, f.name, [
        Number.isFinite(holds) ? `holds ${wikiNum(holds)}` : "",
        Number.isFinite(f.customers) ? `${wikiNum(f.customers)}/h` : "",
      ].filter(Boolean).join(" · "));
      /* Supply reaches a product; a product goes on a fixture. The lines are
         stored the way they are read, so the ball can follow them in order. */
      edges.push([`p:${p.key}`, `f:${k}`, "on"]);
    });
    if(wikiWholesale(p) === "yes") anyWholesale = true;
    (p.importers || []).forEach(k => {
      const sup = wikiSup(k);
      if(!sup) return;
      add("source", `s:${k}`, sup.name, `${sup.street} · import`);
      edges.push([`p:${p.key}`, `s:${k}`, "hop"]);
    });
    const station = (wikiData.sample || {}).WORKSTATION || {};
    if(p.recipe && station.name){
      add("source", "s:station", station.name, "your factory");
      edges.push([`p:${p.key}`, "s:station", "hop"]);
    }
  });
  if(anyWholesale){
    const n = ((wikiData.sample || {}).WHOLESALERS || []).length;
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
function wikiSampleGraph(primary){
  const model = wikiGraphModel(primary);
  const lane = (title, list) => `<div class="wk-lane"><h3>${wikiText(title)}</h3><div class="wk-stack">${
    list.map(n => `<button type="button" class="wk-node" data-node="${attr(n.id)}" aria-pressed="false">`
      + `<span>${wikiText(n.name)}</span>${n.sub ? `<small>${wikiText(n.sub)}</small>` : ""}</button>`).join("")}</div></div>`;
  return `
<section class="sec">
  <div class="sechead"><h2>Fits together</h2>
    ${wikiWhy("Select an item to highlight its connections. Select it again or press Escape to clear.")}
    <span class="aside">${wikiCrosscheckChip(primary)}</span></div>
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

function wikiSampleRecipes(primary){
  const s = wikiData.sample;
  const station = s.WORKSTATION || {};
  const rows = primary.map(p => s.RECIPES && s.RECIPES[p.recipe]).filter(Boolean);
  if(!rows.length) return "";
  const flows = rows.map(r => {
    const ings = (r.inputs || []).map(i => {
      const froms = (i.from || []).map(k => (wikiSup(k) || {}).name).filter(Boolean).join(" · ");
      /* A rate the recipe page does not give stays a dash: a zero would read as
         a measurement. */
      const rate = Number.isFinite(i.per) ? `${wikiNum(i.per)}/h` : "—";
      return `<div class="wk-ing"><span>${wikiText(i.item)}${froms ? `<span class="wk-from">${wikiText(froms)}</span>` : ""}</span>`
        + `<span class="wk-r"${Number.isFinite(i.per) ? "" : ' data-tip="The recipe page gives no hourly rate for this input."'}>${rate}</span></div>`;
    }).join("");
    const per = (r.out || {}).per;
    const rated = Number.isFinite(per);
    return `<div class="wk-flow rv">
      <div class="wk-box">${ings}</div>
      <span class="wk-arrow" aria-hidden="true"><i></i><i></i><i></i></span>
      <div class="wk-box mid" data-tip="${attr(`${station.assembly || "An assembly machine"}`
        + `${(station.production || []).length ? ` with ${station.production.join(", ")}` : ""}`
        + `${(station.runs || []).length ? `. The same workstation runs ${station.runs.length} recipes.` : ""}`)}">
        <b>${wikiText(r.workstation || station.name || "Workstation")}</b>
        ${(station.runs || []).length ? `<small>${wikiNum(station.runs.length)} recipes</small>` : ""}</div>
      <span class="wk-arrow" aria-hidden="true"><i></i><i></i><i></i></span>
      <div class="wk-out">${rated
        ? `<b>${wikiNum(per)}<small>/h</small></b>` : `<b class="none">—</b>`}
        <span>${wikiText((r.out || {}).item || "")}</span>
        ${rated
          ? wikiChip("model", `${wikiNum(per * 24)}/day`,
              "Big Copilot's own reading: the page's maximum hourly rate times 24. That assumes the line runs all day, "
              + "uninterrupted and at full rate — the help does not say what one achieves in practice, or what happens when "
              + "an input runs out mid-hour.")
          : wikiChip("gap", "rate not stated", "This recipe page gives no maximum hourly rate, so there is no day figure to take from it.")}</div>
    </div>`;
  }).join("");
  return `
<section class="sec">
  <div class="sechead"><h2>Make it</h2>
    ${wikiWhy("Rates are per workstation at full speed. Daily output assumes 24 hours without stopping.")}
    <span class="aside" id="wikiPlanSlot"></span></div>
  <div class="wk-flows">${flows}</div>
</section>`;
}

function wikiSamplePlaces(){
  const s = wikiData.sample;
  const roles = {};
  Object.entries(s.FIXTURES || {}).forEach(([, f]) => (f.vendors || []).forEach(v => {
    roles[v] = roles[v] || new Set();
    roles[v].add("fixtures");
  }));
  Object.entries(s.PRODUCTS || {}).forEach(([, p]) => (p.importers || []).forEach(v => {
    roles[v] = roles[v] || new Set();
    roles[v].add("products");
  }));
  Object.entries(s.RECIPES || {}).forEach(([, r]) => (r.inputs || []).forEach(i => (i.from || []).forEach(v => {
    roles[v] = roles[v] || new Set();
    roles[v].add("ingredients");
  })));
  if(s.BUSINESS && s.BUSINESS.hiring){ roles[s.BUSINESS.hiring] = roles[s.BUSINESS.hiring] || new Set(); roles[s.BUSINESS.hiring].add("people"); }
  if((s.WORKSTATION || {}).vendor){ roles[s.WORKSTATION.vendor] = roles[s.WORKSTATION.vendor] || new Set(); roles[s.WORKSTATION.vendor].add("machines"); }
  const rows = Object.keys(roles).map(key => {
    const sup = wikiSup(key);
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
  const wholesalers = (s.WHOLESALERS || []);
  return `
<section class="sec">
  <div class="sechead"><h2>Where to go</h2>
    ${wikiWhy("Select a map pin to locate a supplier or recruitment agency.")}
    ${wholesalers.length ? `<span class="aside">${wikiChip("dim", `${wikiNum(wholesalers.length)} wholesalers`,
      `${wholesalers.map(w => w.name).join(", ")}. Named on the help's own wholesale page.`)}</span>` : ""}</div>
  <div class="wk-places">${rows}</div>
</section>`;
}

/* The Growth hand-off. With a save open and this type in the planner's own
   catalogue the link really does select it; without one it says what it needs
   instead of pretending to work. */
function wikiPlanKey(){
  const b = (wikiData.sample || {}).BUSINESS || {};
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
  const name = ((wikiData.sample || {}).BUSINESS || {}).name || "this range";
  if(wikiCanPlan())
    slot.innerHTML = `<button type="button" class="btn2" data-wiki-plan
      data-tip="${attr(`Open the Growth planner with ${name} selected.`)}"
      >Plan this range ${icon("chev")}</button>`;
  else
    slot.innerHTML = `<span class="quiet" data-tip="${attr(hasData()
      ? "This business type is missing from your save's planner catalogue."
      : "Load a save to plan with your factories and orders.")}"
      >${hasData() ? "Not in this save's catalogue" : "Open a save to plan this range"}</span>`;
}

function wikiSampleOwn(b, primary){
  if(!hasData()) return [];
  const mine = (D.businesses || []).filter(x => String(x.type || "").toLowerCase() === String(b.name || "").toLowerCase());
  const slots = [];
  if(mine.length) slots.push(wikiSlot("Your shops", `${mine.length}`,
    `Businesses of this type in your company: ${mine.slice(0, 4).map(x => x.name).join(", ")}.`));
  const sold = (D.products || []).filter(p => primary.some(x => x.name === p.item));
  if(sold.length) slots.push(wikiSlot("Its range, sold", `${sold.length} of ${primary.length}`,
    `${sold.map(p => p.item).join(", ")} moved in your shops yesterday.`));
  return slots;
}

function wikiSampleSource(page, ctx){
  const s = wikiData.sample;
  const gaps = (s.GAPS || []).map(g =>
    `<div class="wk-gap" data-tip="${attr(wikiUnkey(g.detail))}" tabindex="0"><i></i><span>${wikiText(g.what)}</span></div>`).join("");
  return `
<section class="sec">
  <div class="sechead"><h2>Source</h2>
    ${wikiWhy("Red dots mark missing information. Expand the sections below to read the original help and sources.")}
    <span class="aside">${(s.GAPS || []).length ? wikiChip("gap", `${s.GAPS.length} gaps`) : ""}</span></div>
  <div class="wk-gaps">${gaps}</div>
  <details class="wk-src">
    <summary>The game's own words</summary>
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
function drawWiki(){
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
  }
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
    if(e.target.closest("[data-wiki-plan]")){ wikiPlanChain(); return; }
    if(e.target.closest("[data-wiki-letgo]")){ wikiPick(null); return; }
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
  el.classList.toggle("done", wikiTicked.has(id));
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
