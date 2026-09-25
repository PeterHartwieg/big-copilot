/* Shared city viewer. This file is embedded by render() into the shared script.
   Geometry and the decoded background are loaded once for page and modal views.

   The page: four layer chips and a search field above a full-width stage; the
   matching places float over the stage's right edge; picking a place glides the
   camera in and opens a card beside its footprint. The SVG keeps the camera
   (viewBox), the region clip and the bitmap swap while dragging; an HTML layer
   on top carries what must not scale with the map: district labels, the card,
   and the ball (wireBall(), in the ball step). */
const MAP_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16"></path><circle cx="12" cy="10" r="2"></circle></svg>';
ICON.map = MAP_ICON;
ICON.search = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"></circle><path d="m20 20-4.2-4.2"></path></svg>';
ICON.x = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg>';
ICON.full = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"></path></svg>';
ICON.home = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"></path></svg>';
ICON.pin = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"></path><circle cx="12" cy="10" r="2.2"></circle></svg>';
function mapButton(key, label = "this building"){
  if(!key) return "";
  return `<button type="button" class="map-shortcut" data-map-key="${attr(key)}" aria-label="${attr(`Show ${label} on map`)}" title="Show on map">${MAP_ICON}</button>`;
}
function mapRef(b, label){
  return b ? `${label === undefined ? shortName(b) : label}${mapButton(b.key, b.name || b.address)}` : "—";
}
/* A site's name, wherever the board prints it, is a way to the site's own
   page (siteHref() in the board script): plain text until the pointer is on
   it. `label` is text, not markup. A site the board cannot address stays
   text. The map button, where there is one, sits beside the link, never in it. */
function siteLink(b, label){
  if(!b) return "—";
  const text = mapText(label === undefined ? shortName(b) : label);
  const href = typeof siteHref === "function" ? siteHref(b.key) : "";
  return href ? `<a class="ss-sl" href="${attr(href)}" data-tip="Open its page">${text}</a>` : text;
}
/* The labelled way to a site's page where a name alone would be easy to miss:
   the map card, the goods-flow panel. */
const SS_PAGE = '<span class="ss-i"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"></rect><path d="M8 8h8M8 12h8M8 16h5"></path></svg></span>';
let cityMapAssets = null, cityMapPage = null, cityMapOverlay = null, cityMapCharacter;
const mapViews = new Set();
const mapText = value => String(value ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function loadCityMap(){
  if(!cityMapAssets){
    cityMapAssets = (async () => {
      const embedded = window.BIG_COPILOT_MAP;
      const response = embedded ? null : await fetch(`maps/locations.json?v=${window.LEDGER_BUILD || "1"}`);
      if(response && !response.ok) throw new Error("Map data could not be loaded.");
      const data = embedded?.data || await response.json();
      if(data.schema !== 1 || !Array.isArray(data.buildings)) throw new Error("Unsupported map data.");
      let imageUrl = embedded?.image;
      if(!imageUrl){
        const image = await fetch(`maps/${data.image}?v=${data.imageHash}`);
        if(!image.ok) throw new Error("Map background could not be loaded.");
        imageUrl = URL.createObjectURL(await image.blob());
      }
      const image = new Image(); image.src = imageUrl;
      try { await image.decode(); } catch(error){
        if(!embedded) URL.revokeObjectURL(imageUrl);
        throw new Error("Map background could not be displayed.");
      }
      // Repainting the detailed SVG on every drag frame is expensive. Share a
      // decoded bitmap while moving; restore the original vector when settled.
      let previewUrl = imageUrl;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 3600; canvas.height = Math.round(3600*data.viewBox[3]/data.viewBox[2]);
        canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
        const blob = await new Promise(resolve=>canvas.toBlob(resolve));
        if(blob){
          const url=URL.createObjectURL(blob), preview=new Image(); preview.src=url;
          try {await preview.decode(); previewUrl=url;} catch(error){URL.revokeObjectURL(url);}
        }
        canvas.width=canvas.height=0;
      } catch(error){ /* Vector rendering remains available if caching fails. */ }
      /* The exported data names each building's neighbourhood in English; the
         board knows a neighbourhood by the game's key, so it is read as one here. */
      const buildings = data.buildings.map(b => b.hood ? {...b, hood: hoodKeyOf(b.hood) || b.hood} : b);
      return {...data, buildings, imageUrl, previewUrl, byKey:new Map(buildings.map(b => [b.key,b]))};
    })().catch(error => { cityMapAssets = null; throw error; });
  }
  return cityMapAssets;
}
function mapBusinesses(){ return new Map((D?.businesses || []).map(b => [b.key,b])); }
/* A site's findings, as Needs attention holds them: a kind the player (or its
   default) switched off leaves the count, the pip and the card, so a site is
   never coloured by a finding the list has put away. */
function mapFindings(){
  const result = new Map();
  // The findings of the sizing on screen, as Today lists them (alertLines()).
  if(!D) return result;
  for(const a of [...alertLines(), ...(alertMinor().rows || [])]){
    if(!a.siteKey || kindOff(a)) continue;
    if(!result.has(a.siteKey)) result.set(a.siteKey, []);
    result.get(a.siteKey).push(a);
  }
  return result;
}
/* Worst level of a site's findings, in the board's three kinds. */
function mapKind(findings){
  if(!findings || !findings.length) return "";
  if(findings.some(a => a.level === "critical")) return "crit";
  if(findings.some(a => a.level === "warn")) return "watch";
  return "info";
}
function mapAddressKey(label){
  // Only explicit address labels, never business names or free-text matching.
  const found = /^(\d+)\s+(.+)$/.exec(label || "");
  if(!found) return null;
  if(!/(?:Street|Avenue|Road|Lane|Way|Turnpike|Pier)$/i.test(found[2])) return null;
  const street = found[2].toLowerCase().replace(/[^a-z0-9]/g, "");
  const normalized = {'21st':'twentyfirst','22nd':'twentysecond','23rd':'twentythird','24th':'twentyfourth','25th':'twentyfifth','26th':'twentysixth'};
  return `ba:street_${street.replace(/^(21st|22nd|23rd|24th|25th|26th)/, s => normalized[s])}#${+found[1]}`;
}
function mapAddress(label, key){ return `${mapText(label)}${mapButton(key || mapAddressKey(label),label)}`; }
/* One source for a neighbourhood's two letters: a business carries its own,
   anything else takes the board's table, and only a place the table does not
   name falls back to initials. The card and the list read the same tag. */
const hoodCode = (b, hood) => b?.code || (typeof HOOD_TAGS === "object" && HOOD_TAGS[hood])
  || hoodName(hood).split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
const PANEL_W = 501;   // the finder's panel plus its margin
const PICK_ZOOM = 2.6; // how far in a pick goes, relative to the whole city
const GLIDE_MS = 700;

/* find a location: a mode of the map page -------------------------------------
   The finder ranks premises the player could take by the neighbourhood's demand
   for a business type and the building's foot traffic. It is not a profit
   ranking and the panel says so. Everything it needs is in D.premises, which a
   board built before the feature does not carry: without it the chip is absent
   and the map is exactly what it was. */
const FINDER_CATS = [["retail","Retail"],["office","Office"],["warehouse","Warehouse"],["cinema","Cinema"],["theater","Theater"]];
const FINDER_KEY = "ba_finder_v1";
const premises = () => D?.premises || null;
/* Names sort in the language the board shows them in (gnCompare()). */
const mapCompare = (a, b) => typeof gnCompare === 'function' ? gnCompare(a, b) : String(a).localeCompare(String(b));
const mapCharacter = () => D?.meta?.character || D?.supply?.factories?.character || D?.meta?.save || "";
/* A size letter whose layouts disagree carries [min, max] rather than a number. */
const capText = c => c == null ? "—" : Array.isArray(c) ? `${c[0]}–${c[1]}` : String(c);
/* A cap you can count on is the smallest the size letter's variants give, so
   both ends of the filter read a range by its lower bound: a cinema seating
   100 to 150 is not a building that seats 125. */
const capMin = c => Array.isArray(c) ? c[0] : c;
/* A number filter left at 0 is no limit; one that is set turns away a building
   with no reading, since nothing is known about it either way. */
const finderFits = (v, lo, hi) => !(lo && (v == null || v < lo)) && !(hi && (v == null || v > hi));
const hoodTag = hood => hoodCode(null, hood);
/* What the list is a list of. One of the three is always chosen: premises to
   rent, rival businesses to take over, or whole buildings on sale. */
const FINDER_SHOWS = [
  ["rent", "To rent", "Buildings the save marks as available for rent."],
  ["takeover", "To take over", "Rival businesses you can make an offer to in-game; the price is not in the save. Game services like banks and wholesalers are not for sale."],
  ["sale", "For sale", "Whole buildings the game offers for sale, cheapest first. Buying one is an investment, not an opening, so it is not scored."],
];
const finderDefaults = () => ({on:false, cat:"retail", type:"", show:"rent",
  hoods:null, minM2:0, maxM2:0, minCap:0, maxCap:0, minTraffic:0, sort:"score", sortPicked:false});
/* Buildings run past a billion on a mature save, where the board's compact form
   would say "$5584.2M". An asking price gets its own scale. */
const askingPrice = n => n == null ? "—"
  : n >= 1e9 ? `$${(n / 1e9).toFixed(n >= 1e10 ? 1 : 2)}bn` : money(n);
const finderStatus = b => b.status === "vacant" ? "Vacant · for rent"
  : b.status === "rival" ? `Rival: ${b.occupant?.name || "unnamed"} · ${b.occupant?.type || "business"}`
  // A bank or a wholesaler is the game's own: occupied, but never for sale.
  : b.status === "service" ? `Game service · ${b.occupant?.name || "unnamed"} · ${b.occupant?.type || "business"}`
  : b.status === "mine" ? "Yours"
  : b.type === "residential" ? "Residential" : "Not for rent";
/* The save numbers rival companies and names only the ones that have opened a
   business, so a card shows the name when it has one and the number when it
   does not. The number is stable either way. */
const RIVAL_TIP = "The save names a rival company once it has opened a business; until then only its number is stable.";
const rivalName = n => n == null ? null : (premises()?.rivalNames || {})[n] || null;
const rivalTag = (n, lead) => {
  if(n == null) return lead;
  const name = rivalName(n);
  return name ? mapText(name) : `<span data-tip="${attr(RIVAL_TIP)}">${lead} ${n}</span>`;
};
const typeLabel = t => `${String(t || "").charAt(0).toUpperCase()}${String(t || "").slice(1)}`;
/* The rent estimate is a fitted formula, so it says how it did against the
   leases the player is billed for today. */
function rentNote(){
  const rent = premises()?.rent, check = rent?.check, deposit = rent?.deposit?.check;
  const tail = deposit && deposit.deposits
    ? ` Deposits matched your ${deposit.deposits} within ${(deposit.worst * 100).toFixed(1)}%.` : "";
  if(!check || !check.leases) return "Est. rent is fitted to observed leases; the save stores no rent for a vacant building, and you have no current lease to check against." + tail;
  return `Est. rent is fitted to observed leases; the save stores no rent for a vacant building. It matches your ${
    plural(check.leases, "current lease")} within ${(check.worst * 100).toFixed(1)}%.${tail}`;
}
/* What signing costs on the day. The game asks the same multiple of the rent
   every time, so the note names the multiple rather than this building's sum;
   a warehouse is its own, steeper, one. */
function depositNote(b){
  if(b.deposit == null) return "No deposit estimate for this building.";
  const factors = premises()?.rent?.deposit?.factors || {};
  const days = b.type === "warehouse" ? factors.warehouse : factors.lease;
  return `Estimated deposit${days ? `, about ${plural(Math.round(days), "day")} of rent` : ""}${
    b.rent != null ? `; est. rent ${fmt(b.rent)}/day` : ""}.`;
}
/* The ranked columns shade the way the market grid does: the board's accent
   mixed into the surface. The leading column carries most of it, the supporting
   ones a trace, so the eye lands on the score and still sees what made it. */
const SHADE_LEAD = 46, SHADE_SIDE = 18;
const shadeScore = (t, top) =>
  `color-mix(in oklab, var(--accent) ${Math.round(4 + Math.max(0, Math.min(1, t)) * (top - 4))}%, var(--surface))`;
const FINDER_WHY = "Score = foot traffic × the neighbourhood's demand for the type ÷ 100. Both numbers are the game's own. Rent, rivals, size and capacity are shown but do not change the score; click a column to sort by it instead. Any type takes the neighbourhood's strongest type of the category.";
/* Saved searches: named sets of filters, shared by every character because the
   city and its neighbourhoods are the same in every save. A search carries the
   filters and the sort, never the switch. Eight fit the panel. */
const FINDER_SAVED_KEY = "ba_finder_saved_v1";
const FINDER_SAVED_MAX = 8;
const finderPick = fs => Object.fromEntries(Object.keys(finderDefaults()).filter(k => k !== "on").map(k => [k, fs[k]]));
/* The list lives in memory, read from storage once and written back on every
   change, so a browser that refuses to store still keeps this session's
   searches. Another tab's changes arrive through the storage event. */
let finderSavedList = null;
/* Neighbourhoods are stored by the game's key. Filters stored before that
   named them in English; those read back as keys, and a name no neighbourhood
   has is dropped, as a neighbourhood this save lacks already was. */
const finderHoodKeys = hoods => hoods.map(hoodKeyOf).filter(Boolean);
const finderOldHoods = hoods => Array.isArray(hoods) && hoods.some(h => hoodKeyOf(h) !== h);
function finderReadSaved(raw){
  let list = null;
  try{ list = JSON.parse(raw); }catch(e){}
  return (Array.isArray(list) ? list : [])
    .filter(s => s && typeof s.name === "string" && s.name.trim() && s.filters && typeof s.filters === "object")
    .slice(0, FINDER_SAVED_MAX)
    .map(s => Array.isArray(s.filters.hoods) ? {...s, filters: {...s.filters, hoods: finderHoodKeys(s.filters.hoods)}} : s);
}
function finderSaved(){
  if(!finderSavedList){
    let raw = null, old = false;
    try{ raw = localStorage.getItem(FINDER_SAVED_KEY); }catch(e){}
    try{ old = (JSON.parse(raw) || []).some(s => finderOldHoods(s?.filters?.hoods)); }catch(e){}
    finderSavedList = finderReadSaved(raw);
    // Written back once in keys, so the old names are gone from storage.
    if(old) finderKeepSaved(finderSavedList);
  }
  return finderSavedList;
}
function finderKeepSaved(list){
  finderSavedList = list;
  try{ localStorage.setItem(FINDER_SAVED_KEY, JSON.stringify(list)); }catch(e){}
}
window.addEventListener("storage", e => {
  if(e.key !== FINDER_SAVED_KEY) return;
  finderSavedList = finderReadSaved(e.newValue);
  cityMapPage?.update();
});
/* The column a search is sorted by, for its tooltip: two searches that differ
   only in their sort should not read the same. */
const FINDER_SORT_NAMES = {score:"score", traffic:"traffic", demand:"demand", m2:"m²", cap:"cap", deposit:"upfront"};
const finderRange = (label, lo, hi) => lo && hi ? `${label} ${lo}–${hi}` : lo ? `${label} ≥ ${lo}` : hi ? `${label} ≤ ${hi}` : "";

/* floor plans: the game's own layout for each building ------------------------
   A layout is the building's size and version ("C2"); make_floor_plans.py
   draws every layout the finder's kinds use out of the game's own shells, as
   one path of rectangles for each of floor, bay, wall, window and door, 24
   units a metre. The finder fetches the file the first time it is on. A row
   with no plan (a cinema, or a save the file does not cover) shows nothing. */
let floorPlanAssets = null;
function loadFloorPlans(){
  if(!floorPlanAssets) floorPlanAssets = (async () => {
    // A page opened from a file carries its plans with the map, or goes without.
    const embedded = window.BIG_COPILOT_MAP;
    const data = embedded ? embedded.plans
      : await fetch(`maps/floor-plans.json?v=${window.LEDGER_BUILD || "1"}`).then(r => r.ok ? r.json() : null);
    return data?.schema === 1 && data.plans && data.kinds ? data : null;
  })().catch(() => null);
  return floorPlanAssets;
}
const FLOOR_PLAN_PX = 24;
/* The map area left of the panel the dock needs; a narrower one gets the switch. */
const FLOOR_PLAN_DOCK_MIN = 560;
const FLOOR_PLAN_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="1"></rect><path d="M4 11h7v9M11 4v4M15 11h5"></path></svg>';
const FLOOR_PLAN_TIP = "The game's own layout for the building, seen from above and shown the way the game stores it, so the top is not necessarily north or the street. Walls are grey, windows blue and doors green; a door on the outside wall is an entrance. In a warehouse, the gaps in the floor are the loading bays. m² and cap are the game's figures for the size.";
/* One plan at s pixels a metre, painted in the board's colours by class. */
function floorPlanSvg(plan, s, label){
  const k = s / FLOOR_PLAN_PX;
  return `<svg class="lp-svg" viewBox="0 0 ${plan.w} ${plan.h}" width="${(plan.w * k).toFixed(1)}" height="${(plan.h * k).toFixed(1)}" shape-rendering="crispEdges" role="img" aria-label="${attr(label)}">${
    ["f", "b", "w", "n", "d"].filter(c => plan.paths[c]).map(c => `<path class="lp-${c}" d="${plan.paths[c]}"></path>`).join('')}</svg>`;
}
/* The first of 1, 2, 5, 10, 20 or 50 m that is at least 36 px long. */
function floorPlanScale(s){
  const m = [1, 2, 5, 10, 20, 50].find(n => n * s >= 36) || 50;
  return `<span class="lp-scale" aria-label="Scale: ${m} metres"><i style="width:${(m * s).toFixed(1)}px"></i><span>${m} m</span></span>`;
}

class CityMapView {
  /* options.panel: the page shows chips, search and the places panel; the
     shortcut dialog shows the stage and the card only. */
  constructor(root, options = {}){
    this.root = root; this.selected = null; this.box = null; this.hot = null;
    this.panel = options.panel !== false;
    this.layers = {mine:true, own:true, home:true, fnd:true, all:false}; this.query = "";
    this.fs = finderDefaults();
    this.root.classList.add("city-map");
    this.buildToken = 0;
    // One breakpoint for CSS and script alike: the panel floats over the map
    // on wide stages and drops under it on narrow ones.
    this.mq = window.matchMedia ? window.matchMedia('(max-width:760px)') : null;
    this.narrow = !!this.mq?.matches;
    this.mq?.addEventListener?.('change', () => { this.narrow = this.mq.matches; this.citymap?.classList.toggle('narrow', this.narrow); this.rect = null;
      if(!this.svg) return; if(this.selected) this.select(this.selected, true); else this.reset(); });
    this.root.addEventListener('click', e => {
      if(!this.svg) return;
      const pick = e.target.closest('[data-pick]');
      if(pick){ this.select(pick.dataset.pick); return; }
      const sorter = e.target.closest('.fhead [data-s]');
      if(sorter){ this.sortBy(sorter.dataset.s); return; }
      if(e.target.closest('[data-more]')){ this.showAll = true; this.update(); return; }
      // A layout on the shelf lists only that layout; a second click, or the
      // chip in the filters, lists them all again.
      const tile = e.target.closest('[data-lp-tile]');
      if(tile){ this.layoutPick = this.layoutPick === tile.dataset.lpTile ? null : tile.dataset.lpTile; this.showAll = false; this.update(); return; }
      if(e.target.closest('[data-lp-clear]')){ this.layoutPick = null; this.showAll = false; this.update(); return; }
      const view = e.target.closest('[data-lp-view]');
      if(view){
        this.planView = view.dataset.lpView === 'plan'; this.paintPlans();
        // The card was out of layout under the plan; place it again now the map is back.
        if(!this.planView) this.paintView();
        return;
      }
      const action = e.target.closest('[data-action]')?.dataset.action;
      if(action === 'in' || action === 'out') this.zoom(action === 'in' ? .65 : 1.5);
      if(action === 'reset') this.reset(true);
      if(action === 'full') this.toggleFullscreen();
      if(action === 'close') this.deselect();
      // "its page" carries the site's address, which the board opens itself.
      if(action === 'details' && !inSiteLink(e)){
        e.preventDefault();
        if($('locationMapDialog').open) $('locationMapDialog').close();
        siteOpenOver(this.selected);
      }
    });
    // The column headers carry a button role, so they answer to a button's keys.
    this.root.addEventListener('keydown', e => {
      if(e.key !== 'Enter' && e.key !== ' ') return;
      const sorter = e.target.closest?.('.fhead [data-s]');
      if(!sorter) return;
      e.preventDefault();
      this.sortBy(sorter.dataset.s);
    });
    root.innerHTML = `<p class="map-status" role="status">Loading map…</p>`;
    mapViews.add(this);
    this.ready = this.load();
  }
  async load(){
    try {
      this.assets = await loadCityMap();
      this.build(); this.update();
      return true;
    } catch(error){
      this.root.innerHTML = `<p class="map-status" role="status">${mapText(error.message)}</p><button type="button" class="btn2">Retry map</button>`;
      this.root.querySelector('button').onclick = () => {
        this.ready = this.load();
        this.ready.then(ok=>{if(ok && this.selected)this.select(this.selected,true,this.freshSelection);});
      };
      return false;
    }
  }
  build(){
    const a = this.assets, id = this.root.id;
    const clipId = `${id}-clip`;
    // The whole header belongs to the plain map: the finder's own switch lives
    // in the map window and its filters in the panel. A chip's accessible name
    // is what it shows, "Mine 2", so a spoken command matches the word on it;
    // the note says the rest.
    const head = this.panel ? `<div class="sechead map-head moff">
      <span class="layers" role="group" aria-label="Layers">
        <button type="button" class="sev lay mine" data-l="mine" aria-pressed="true" data-tip="Your businesses. Click to hide them."><i></i><span class="lw">Mine</span><span class="n">0</span></button>
        <button type="button" class="sev lay own" data-l="own" aria-pressed="true" data-tip="Buildings you own, dashed blue on the map."><i></i><span class="lw">Owned</span><span class="n">0</span></button>
        <button type="button" class="sev lay home" data-l="home" aria-pressed="true" data-tip="Homes you rent, white on the map."><i></i><span class="lw">Homes</span><span class="n">0</span></button>
        <button type="button" class="sev lay fnd" data-l="fnd" aria-pressed="true" data-tip="Sites with a finding from Today. Red is critical, amber is worth a look, grey is for information. The dots show once you zoom in."><i></i><span class="lw">Findings</span><span class="n">0</span></button>
        <button type="button" class="sev lay all off" data-l="all" aria-pressed="false" data-tip="Every address in the city, as faint outlines. Off by default."><i></i><span class="lw">All</span><span class="n">${a.buildings.length}</span></button>
      </span>
      <span class="why" data-tip="The chips are layers: your businesses, buildings you own, homes you rent, sites with a finding, every address. Click one to switch it off; off is dimmed, never gone. Pick a place from the list or on the map and its card opens beside the building. Drag to pan, wheel to zoom."><i>?</i></span>
      <span class="aside"><label class="srch">${ICON.search}<input id="${id}-search" type="search" aria-label="Find a place" data-control="search" placeholder="Search" autocomplete="off"><span class="cnt mono" aria-live="polite"></span></label></span>
    </div>` : "";
    this.root.innerHTML = `${head}<div class="citymap${this.narrow ? " narrow" : ""}"><div class="stage" data-stage>
      <svg class="map-canvas" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="City map. Select a building or use the places list.">
      <defs><clipPath id="${clipId}"><rect class="map-region-clip" x="0" y="0" width="${a.viewBox[2]}" height="${a.viewBox[3]}"/></clipPath></defs><g clip-path="url(#${clipId})"><image class="map-detail-background" x="0" y="0" width="${a.viewBox[2]}" height="${a.viewBox[3]}" href="${a.imageUrl}"/><image class="map-fast-background" x="0" y="0" width="${a.viewBox[2]}" height="${a.viewBox[3]}" href="${a.previewUrl}"/>
      <g class="map-footprints">${a.buildings.map(b => `<path class="location fp" data-location="${mapText(b.key)}" d="${b.path}" fill-rule="evenodd"><title>${mapText(b.address)}</title></path>`).join('')}</g>
      <g class="map-pips"></g></g></svg>
      <div class="layer">${(a.districtLabels || []).map(l=>`<span class="dlabel" data-x="${l.anchor[0]}" data-y="${l.anchor[1]}">${mapText(l.label)}</span>`).join('')}
        <div class="shadow" aria-hidden="true"></div><div class="ball" aria-hidden="true"><i></i><u></u></div>
        <div class="site" role="region" aria-live="polite" hidden><span class="tail"></span><button type="button" class="x" aria-label="Close">${ICON.x}</button><h3></h3><div class="sub"></div><div class="nums"></div><div class="st" hidden></div><div class="facts" hidden></div><div class="fit" hidden></div><p class="why" hidden></p><div class="finds2"></div><a class="go2 ss-pagego" href="#detail" data-action="details">${SS_PAGE}its page</a></div>
      </div>
      ${this.panel ? `<div class="lp-dock" role="region" aria-label="Floor plans" hidden></div><div class="lp-phoneplan" hidden></div>` : ""}
      ${this.panel ? this.finderControls() : ""}
      ${this.panel ? `<div class="lp-seg" role="group" aria-label="Show the map or the floor plan" hidden><button type="button" data-lp-view="map" aria-pressed="true">Map</button><button type="button" data-lp-view="plan" aria-pressed="false">${FLOOR_PLAN_ICON}Plan</button></div>` : ""}
      <div class="zoomer" role="group" aria-label="Map zoom"><button type="button" class="ibtn" data-action="in" aria-label="Zoom in">+</button><button type="button" class="ibtn" data-action="out" aria-label="Zoom out">−</button><button type="button" class="ibtn" data-action="reset" aria-label="Whole city"${this.panel ? ' data-tip="Whole city"' : ''}>${ICON.home}</button>${this.panel && document.fullscreenEnabled ? `<button type="button" class="ibtn" data-action="full" aria-label="Full screen" data-tip="Full screen">${ICON.full}</button>` : ''}</div>
    </div>${this.panel ? `<aside class="places fonly" aria-label="Premises found">${this.finderPanel()}<div class="list"></div></aside>` : ""}</div>`;
    this.svg = this.root.querySelector('.map-canvas');
    this.stage = this.root.querySelector('[data-stage]');
    this.citymap = this.root.querySelector('.citymap');
    this.layer = this.root.querySelector('.layer');
    this.card = this.root.querySelector('.site');
    this.search = this.root.querySelector('[data-control="search"]');
    this.list = this.root.querySelector('.places .list');
    this.paths = new Map([...this.root.querySelectorAll('[data-location]')].map(p => [p.dataset.location,p]));
    this.pips = this.root.querySelector('.map-pips');
    this.districts = [...this.root.querySelectorAll('.dlabel')];
    this.dock = this.root.querySelector('.lp-dock');
    this.phonePlan = this.root.querySelector('.lp-phoneplan');
    this.seg = this.root.querySelector('.lp-seg');
    this.shelfSig = null;
    if(this.search){
      this.search.oninput = () => { this.query = this.search.value; this.showAll = false; this.update(); };
      // Without a list to click, Enter takes the first match.
      this.search.onkeydown = e => {
        if(e.key !== 'Enter' || !this.matches?.length) return;
        e.preventDefault(); this.select(this.matches[0].key);
      };
    }
    this.root.querySelectorAll('.lay').forEach(chip => chip.onclick = () => {
      const l = chip.dataset.l; this.layers[l] = !this.layers[l]; this.showAll = false;
      chip.classList.toggle('off', !this.layers[l]); chip.setAttribute('aria-pressed', String(this.layers[l]));
      this.update();
    });
    this.card.querySelector('.x').dataset.action = 'close';
    this.wireFinder();
    if(this.list){
      this.list.addEventListener('mouseover', e => { const p = e.target.closest('[data-pick]'); if(p) this.light(p.dataset.pick); });
      // A leave into the row's own children is no leave (onLeave's test).
      this.list.addEventListener('mouseout', e => { const p = e.target.closest('[data-pick]');
        if(p && !(e.relatedTarget && p.contains(e.relatedTarget))) this.light(null); });
    }
    this.buildToken++;
    this.wirePan();
    this.wireBall?.();
    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => {this.rect=null; if(!this.box) this.reset(); this.paintPlans(); this.paintView();});
    this.citymap.addEventListener('fullscreenchange', () => { this.rect = null; if(this.selected) this.select(this.selected, true); else this.reset(); });
    this.resizeObserver.observe(this.svg);
    this.reset();
    if(typeof wireTips === "function") wireTips();
    if(typeof featureDiscovery === "object") featureDiscovery.refresh();
  }
  /* --- find a location ------------------------------------------------------
     The chip and its filters live in the map head; while the finder is on the
     layer chips and the search step aside (class moff) and the filters take
     their place (class fonly), both switched by CSS off .city-map.finder. */
  hoodList(){
    const P = premises(); if(!P) return [];
    return [...new Set(P.buildings.map(b => b.hood).filter(Boolean))]
      .sort((a, b) => mapCompare(hoodName(a), hoodName(b)));
  }
  hoodOn(hood){ return !this.fs.hoods || this.fs.hoods.includes(hood); }
  /* The header carries the switch and nothing else; everything the finder asks
     for sits in the panel above its own results, so the section reads as one
     thing rather than as chrome scattered over the map. */
  finderControls(){
    if(!premises()) return "";
    /* A chip with its name on it: a bare pin in the corner was the most
       hidden way into a headline feature. */
    return `<div class="fswitch"><button type="button" class="ibtn" data-f="tog" aria-pressed="false" data-visit-feature="floor-plans" data-tip="Rank the buildings you could take for a business type">${ICON.pin}<span>Find a location</span><span class="feature-new" data-new-feature="floor-plans" aria-hidden="true" hidden>New</span></button></div>`;
  }
  /* Every control is the same chip: outlined when it is not chosen, filled when
     it is. Nothing is ever dimmed, so nothing reads as unavailable. */
  finderPanel(){
    const P = premises(); if(!P) return "";
    const row = (label, body, cls = "") => `<div class="frow${cls}"><span class="lab">${label}</span>${body}</div>`;
    const kinds = FINDER_CATS.map(([c, label]) =>
      `<button type="button" class="fchip cat" data-cat="${c}" aria-pressed="false">${label}</button>`).join('');
    const hoods = this.hoodList().map(h =>
      `<button type="button" class="fchip hd" data-h="${attr(h)}" aria-pressed="true" data-tip="${attr(hoodName(h))}">${mapText(hoodTag(h))}</button>`).join('');
    return `<div class="filters fonly">
      ${row('Kind', kinds)}
      ${row('Type', `<label class="fsel"><select data-f="type" aria-label="Business type"><option value="">Any type</option></select><i class="fchev">${ICON.chev}</i></label>`, ' ftype')}
      ${row('Show', FINDER_SHOWS.map(([key, label, tip]) =>
        `<button type="button" class="fchip show" data-show="${key}" aria-pressed="false" data-tip="${attr(tip)}">${label}<b>0</b></button>`).join('')
        + `<span class="why" tabindex="0" data-tip=""><i>?</i></span>`)}
      ${row('Where', hoods)}
      ${row('Size', `<label class="fchip num">min<input type="number" min="0" data-f="minM2" value="0" aria-label="Smallest floor area in square metres"><b>m²</b></label>
        <label class="fchip num">max<input type="number" min="0" data-f="maxM2" value="0" aria-label="Largest floor area in square metres"><b>m²</b></label>`)}
      ${row('Capacity', `<label class="fchip num">min<input type="number" min="0" data-f="minCap" value="0" aria-label="Smallest building capacity"></label>
        <label class="fchip num">max<input type="number" min="0" data-f="maxCap" value="0" aria-label="Largest building capacity"></label>`)}
      ${row('Traffic', `<label class="fchip num">min<input type="number" min="0" data-f="minTraffic" value="0" aria-label="Least foot traffic"></label>`)}
      ${row('Layout', '<span class="lp-laychip"></span>', ' flayout')}
      ${row('Saved', `<span class="fsaved" role="group" aria-label="Saved searches"><span class="fsaved-list"></span><span class="fsaved-new">
        <label class="fchip fname" hidden><input type="text" maxlength="24" data-f="name" aria-label="Name for this search"></label>
        <span class="fsave"><button type="button" class="fchip fnew" data-f="save" data-tip="Save these filters and the sort under a name. Every character shares the saved searches; a name already taken is replaced.">${ICON.plus}Save</button><button type="button" class="fdel" data-f="cancel" aria-label="Cancel saving" hidden>${ICON.x}</button></span>
      </span></span>`, ' fsaves')}
    </div>`;
  }
  wireFinder(){
    if(!premises() || !this.panel) return;
    const changed = () => { this.showAll = false; this.saveFinder(); this.update(); };
    this.root.querySelector('[data-f="tog"]').onclick = () => {
      this.fs.on = !this.fs.on; this.layoutPick = null; this.deselect(); changed();
    };
    this.root.querySelectorAll('.fchip.cat').forEach(chip => chip.onclick = () => {
      // A sort the player picked travels to the new category when it can; the
      // old category's own default does not, so a warehouse's floor-area order
      // never becomes the shops'.
      this.fs.cat = chip.dataset.cat; this.fs.type = ""; this.layoutPick = null;
      if(!this.fs.sortPicked) this.fs.sort = this.sortKeys()[0];
      this.clampSort();
      changed();
    });
    this.root.querySelector('[data-f="type"]').onchange = e => { this.fs.type = e.target.value; changed(); };
    // One of the three is always chosen, so a click picks rather than toggles.
    this.root.querySelectorAll('.fchip.show').forEach(chip => chip.onclick = () => {
      if(this.fs.show === chip.dataset.show) return;
      this.fs.show = chip.dataset.show; this.deselect(); changed();
    });
    this.root.querySelectorAll('.fchip.hd').forEach(chip => chip.onclick = () => {
      const all = this.hoodList(), h = chip.dataset.h;
      let picked = this.fs.hoods ? this.fs.hoods.slice() : all.slice();
      picked = picked.includes(h) ? picked.filter(x => x !== h) : [...picked, h];
      this.fs.hoods = picked.length === all.length ? null : picked;
      changed();
    });
    this.root.querySelectorAll('.fchip.num input').forEach(input => input.oninput = () => {
      this.fs[input.dataset.f] = Math.max(0, +input.value || 0); changed();
    });
    // The chips are drawn again whenever they change, so the row answers through
    // handlers on itself rather than on each chip. Naming a search is explicit:
    // Save or Enter keeps the name, the x or Escape drops it, and pressing
    // anything else leaves the field as it is.
    const saved = this.root.querySelector('.fsaved');
    saved.addEventListener('click', e => {
      const use = e.target.closest('[data-saved]'), drop = e.target.closest('[data-unsave]');
      if(use) this.applySaved(use.dataset.saved);
      else if(drop){
        // A delete from the keyboard leaves the focus in the row, not on the page.
        const keys = document.activeElement === drop;
        this.unsaveSearch(drop.dataset.unsave); this.update();
        if(keys) saved.querySelector('[data-saved], [data-f="save"]')?.focus();
      }
      else if(e.target.closest('[data-f="save"]')) this.naming() ? this.commitNaming(false) : this.openNaming();
      else if(e.target.closest('[data-f="cancel"]')) this.closeNaming(true);
    });
    // The full-row warning depends on the name typed, so each keystroke redraws
    // it; the chips themselves are only redrawn when one of them changed.
    saved.addEventListener('input', e => { if(e.target.closest('[data-f="name"]')) this.paintSaved(); });
    saved.addEventListener('keydown', e => {
      if(!e.target.closest('[data-f="name"]')) return;
      if(e.key === 'Enter'){ e.preventDefault(); this.commitNaming(true); }
      if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); this.closeNaming(true); }
    });
  }
  /* A warehouse has no score and no demand; every other category has both. A
     sort the new category cannot show falls back to the one it ranks by, so a
     header is always lit. */
  sortKeys(cat = this.fs.cat){ return cat === 'warehouse' ? ['m2', 'traffic', 'cap', 'deposit'] : ['score', 'traffic', 'demand', 'm2', 'cap', 'deposit']; }
  /* The business types this save reports demand for in a category, by slug. */
  catTypes(cat = this.fs.cat){
    const types = new Map();
    Object.values(premises()?.demand || {}).forEach(list =>
      list.forEach(d => { if(d.category === cat) types.set(d.slug, d.type); }));
    return types;
  }
  clampSort(){
    const keys = this.sortKeys();
    if(!keys.includes(this.fs.sort)){ this.fs.sort = keys[0]; this.fs.sortPicked = false; }
  }
  /* Every column reads best-first, so there is no ascending state to flip into:
     a second click on the column you are already sorted by puts the list back
     in the order the category ranks by. */
  sortBy(key){
    this.fs.sort = this.fs.sort === key ? this.sortKeys()[0] : key;
    // The category's own order is nobody's choice; any other column is.
    this.fs.sortPicked = this.fs.sort !== this.sortKeys()[0];
    this.showAll = false; this.saveFinder(); this.update();
  }
  /* The filters and the chip travel with the character, like the import marks. */
  finderStore(){ const who = mapCharacter(); return who ? `${FINDER_KEY}:${who}` : null; }
  loadFinder(){
    const who = mapCharacter();
    if(this.fsCharacter === who) return;
    this.fsCharacter = who;
    this.fs = finderDefaults();
    const store = this.finderStore(); if(!store) return;
    try{
      const saved = JSON.parse(localStorage.getItem(store));
      if(saved && typeof saved === "object") this.fs = {...this.fs, ...saved,
        hoods: Array.isArray(saved.hoods) ? finderHoodKeys(saved.hoods) : null,
        // Availability used to be two switches; a state saved then opens on
        // whichever list it was reading.
        show: saved.show || (saved.buy ? "takeover" : "rent")};
      delete this.fs.vac; delete this.fs.buy; delete this.fs.sale; delete this.fs.dir;
      // A sort saved before picks were recorded counts as picked unless it is
      // the category's own order.
      if(typeof saved?.sortPicked !== "boolean") this.fs.sortPicked = this.fs.sort !== this.sortKeys()[0];
    }catch(e){}
    this.fs.on = false;   // a new load opens the plain map; only the filters are stored
  }
  saveFinder(){
    const store = this.finderStore(); if(!store) return;
    // The switch lasts the session, not the storage: it stays on across pages,
    // and a new load opens the plain map with the filters where they were left.
    const {on, ...filters} = this.fs;
    try{ localStorage.setItem(store, JSON.stringify(filters)); }catch(e){}
  }
  /* Opened from Today or a Growth cell: the finder comes on with a preset. */
  setFinder(preset = {}){
    this.loadFinder();
    // A preset is a fresh question, and Today's card advertises the vacant
    // count: it opens on vacant premises with no minimum in the way, whatever
    // the last visit left behind. Only the neighbourhoods come from the caller.
    this.fs = {...this.fs, on:true, show:'rent', minM2:0, maxM2:0, minCap:0, maxCap:0, minTraffic:0, ...preset};
    // It also lands on the column the category ranks by, never on a stale sort.
    this.fs.sort = this.fs.cat === 'warehouse' ? 'm2' : 'score'; this.fs.sortPicked = false;
    this.saveFinder();
    // A layout picked on the shelf belonged to the last question, not this one.
    this.layoutPick = null;
    this.selected = null; this.showAll = false;  // back to the 80-row cap
    this.ready.then(ok => { if(ok) this.update(); });
  }
  /* --- saved searches ---------------------------------------------------------
     A saved search read against this save: a neighbourhood the save does not
     have is dropped, a number that is not one is no limit, and anything else
     unknown falls back to its default. paintControls settles the type and the
     sort, as it does for any state. */
  savedFilters(s){
    const f = finderPick({...finderDefaults(), ...s.filters}), all = this.hoodList();
    let hoods = Array.isArray(f.hoods) ? f.hoods.filter(h => all.includes(h)) : null;
    if(hoods && hoods.length === all.length) hoods = null;
    // A limit that is not a number, or one with no end to it, is no limit.
    const num = v => { const n = Math.max(0, +v || 0); return Number.isFinite(n) ? n : 0; };
    const cat = FINDER_CATS.some(([c]) => c === f.cat) ? f.cat : "retail";
    // The type and the sort fall back here exactly as paintControls makes the
    // live ones fall back, so a search this save cannot honour in full still
    // matches the list it opens.
    const keys = this.sortKeys(cat), sort = keys.includes(f.sort) ? f.sort : keys[0];
    return {...f, hoods, cat, sort, sortPicked: sort === keys[0] ? false : !!f.sortPicked,
      type: this.catTypes(cat).has(f.type) ? f.type : "",
      show: FINDER_SHOWS.some(([k]) => k === f.show) ? f.show : "rent",
      minM2: num(f.minM2), maxM2: num(f.maxM2), minCap: num(f.minCap), maxCap: num(f.maxCap),
      minTraffic: num(f.minTraffic)};
  }
  /* Two states are the same search when everything the player can see matches,
     the sort included, since a search is saved with its sort. */
  savedKey(f){
    const {sortPicked, ...shown} = finderPick(f);
    // For sale is always cheapest first: the sort it carries is not on screen,
    // so two sale searches that read alike are alike.
    if(shown.show === "sale") shown.sort = null;
    return JSON.stringify({...shown, hoods: shown.hoods ? shown.hoods.slice().sort() : null});
  }
  savedOn(){
    const now = this.savedKey(this.fs), list = finderSaved();
    const same = list.map((s, i) => this.savedKey(this.savedFilters(s)) === now ? i : -1).filter(i => i >= 0);
    // Two searches may hold the same filters under different names; the one the
    // player reached for is the one that reads as current.
    const used = list.findIndex(s => s.name === this.savedUsed);
    return same.includes(used) ? used : same.length ? same[0] : -1;
  }
  applySaved(name){
    const s = finderSaved().find(x => x.name === name); if(!s) return;
    this.savedUsed = s.name;
    const f = this.savedFilters(s);
    // For sale is cheapest first, so a sale search has no sort to give: it is
    // lit whatever the sort, and applying it leaves the sort as the player left it.
    if(f.show === "sale"){ f.sort = this.fs.sort; f.sortPicked = this.fs.sortPicked; }
    this.fs = {...this.fs, ...f, on:true};
    this.clampSort();
    this.layoutPick = null;   // a saved search carries no layout
    this.showAll = false; this.deselect(); this.saveFinder(); this.update();
  }
  /* A name already in the list replaces that search in place: the exact name if
     there is one, else the same name in any case, so names stay unique. */
  saveSearch(name){
    name = String(name || "").trim().slice(0, 24);
    if(!name) return;
    const list = finderSaved().slice(), exact = list.findIndex(s => s.name === name);
    const at = exact >= 0 ? exact : list.findIndex(s => s.name.toLowerCase() === name.toLowerCase());
    const entry = {name, filters: finderPick(this.fs)};
    if(at >= 0) list[at] = entry;
    else if(list.length < FINDER_SAVED_MAX) list.push(entry);
    else return false;
    this.savedUsed = name;
    finderKeepSaved(list);
    return true;
  }
  unsaveSearch(name){
    if(this.savedUsed === name) this.savedUsed = null;
    finderKeepSaved(finderSaved().filter(s => s.name !== name));
  }
  typeName(slug){
    return slug ? Object.values(premises()?.demand || {}).flat().find(d => d.slug === slug)?.type || "" : "";
  }
  /* The name offered for a new search says what it looks for and where; one
     already taken gets a number, so accepting the offer never replaces a search. */
  savedName(){
    const f = this.fs, taken = new Set(finderSaved().map(s => s.name.toLowerCase()));
    const base = `${this.typeName(f.type) || FINDER_CATS.find(([c]) => c === f.cat)?.[1] || "Search"}${
      f.hoods && f.hoods.length ? ` · ${f.hoods.map(hoodTag).join(" ")}` : ""}`.slice(0, 20);
    let name = base;
    for(let n = 2; taken.has(name.toLowerCase()); n++) name = `${base} ${n}`;
    return name;
  }
  savedTip(s){
    const f = this.savedFilters(s), type = this.typeName(f.type);
    return [`${FINDER_CATS.find(([c]) => c === f.cat)?.[1]}${type ? `: ${type}` : ""}`,
      FINDER_SHOWS.find(([k]) => k === f.show)?.[1],
      f.hoods ? f.hoods.map(hoodTag).join(" ") || "no neighbourhood" : "every neighbourhood",
      finderRange("m²", f.minM2, f.maxM2), finderRange("capacity", f.minCap, f.maxCap),
      f.minTraffic ? `traffic ≥ ${f.minTraffic}` : "",
      // For sale is always cheapest first, so only a ranked list names its sort.
      f.show === "sale" ? "" : `by ${FINDER_SORT_NAMES[f.sort] || f.sort}`].filter(Boolean).join(" · ");
  }
  /* The name field is open while its label is shown; its value is the name. */
  naming(){ const f = this.root.querySelector('.fsaved .fname'); return !!f && !f.hidden; }
  openNaming(){
    const field = this.root.querySelector('.fsaved .fname');
    if(!field || finderSaved().length >= FINDER_SAVED_MAX) return;
    const input = field.querySelector('input');
    field.hidden = false;
    this.root.querySelector('.fsaved [data-f="cancel"]').hidden = false;
    this.root.querySelector('.fsaved .fsaved-new').classList.add('naming');
    input.value = this.savedName();
    input.focus(); input.select();
  }
  closeNaming(focus = false){
    const field = this.root.querySelector('.fsaved .fname'); if(!field) return;
    field.hidden = true; field.querySelector('input').value = "";
    this.root.querySelector('.fsaved [data-f="cancel"]').hidden = true;
    this.root.querySelector('.fsaved .fsaved-new').classList.remove('naming');
    this.paintSaved();
    if(focus) this.root.querySelector('.fsaved [data-f="save"]:not([hidden])')?.focus();
  }
  /* A name saves what is on screen now. From the keyboard the focus follows the
     name to its chip, and so does a click whose save filled the row, since Save
     then steps aside; otherwise a click on Save leaves the focus on Save. */
  commitNaming(keys){
    const input = this.root.querySelector('.fsaved [data-f="name"]'), name = input.value;
    if(!name.trim()){ this.closeNaming(true); return; }
    if(!this.saveSearch(name)){
      // No room: the name stays where it is, and the field's own warning (drawn
      // by paintSaved from the row as it stands) is shown to the reader now,
      // since the focus never left the field and no tooltip would open by itself.
      this.paintSaved();
      input.focus();
      if(typeof showTip === "function") showTip(input.closest('.fname'));
      return;
    }
    this.closeNaming();
    this.update();
    // Save steps aside when that was the eighth, and a hidden button must not keep
    // the focus, so the focus goes to the new chip whenever Save is gone.
    const save = this.root.querySelector('.fsaved [data-f="save"]');
    if(keys || save.hidden) this.root.querySelector('.fsaved .fsaved-list .fchip.on')?.focus();
  }
  /* A chip per search, filled while its filters are the ones on screen, each
     with its own delete. Only the chips are drawn again, and only when one of
     them changed; the Save controls beside them are never redrawn. */
  paintSaved(){
    const host = this.root.querySelector('.fsaved-list'); if(!host) return;
    const list = finderSaved(), on = this.savedOn(), full = list.length >= FINDER_SAVED_MAX, naming = this.naming();
    // Save steps aside at eight, unless a name is already being typed.
    this.root.querySelector('.fsaved [data-f="save"]').hidden = full && !naming;
    /* A field open on a full row (another tab took the last place) warns only
       about a name that would need a new place: a name already saved, in any
       case, replaces that search and is fine, and an empty one saves nothing.
       The warning is worked out afresh on every paint, and a tooltip still
       showing it is put away the moment it stops being true. */
    const field = this.root.querySelector('.fsaved .fname'), input = field.querySelector('input');
    const typed = input.value.trim().toLowerCase();
    const warn = full && naming && !!typed && !list.some(s => s.name.toLowerCase() === typed);
    field.classList.toggle('full', warn);
    if(warn){
      field.dataset.tip = "Eight searches at most. Delete one to save a new name, or reuse a name to replace that search.";
      input.setAttribute('aria-invalid', 'true');
    } else {
      delete field.dataset.tip; input.removeAttribute('aria-invalid');
      if(typeof hideTip === "function") hideTip(field);
    }
    const sig = JSON.stringify([list.map(s => [s.name, this.savedTip(s)]), on]);
    if(host === this.savedHost && sig === this.savedSig) return;
    this.savedHost = host; this.savedSig = sig;
    host.innerHTML = list.map((s, i) => `<span class="fsave"><button type="button" class="fchip${i === on ? ' on' : ''}" data-saved="${attr(s.name)}" aria-pressed="${i === on}" data-tip="${attr(this.savedTip(s))}">${mapText(s.name)}</button><button type="button" class="fdel" data-unsave="${attr(s.name)}" aria-label="${attr(`Delete the saved search ${s.name}`)}">${ICON.x}</button></span>`).join('');
  }
  /* The type demand this row is scored on: the chosen type, or the strongest
     type of the category in that neighbourhood when "any type" is picked. */
  fitFor(b){
    const none = {demand:null, fit:null, slug:null, score:null, rivals:null, mine:null, list:[], rank:null};
    const P = premises(); if(!P || this.fs.cat === 'warehouse') return none;
    // Strongest first. The sort is stable, so among equal readings the payload's
    // own order still decides, exactly as picking the first maximum did.
    const list = (P.demand[b.hood] || []).filter(d => d.category === this.fs.cat)
      .slice().sort((x, y) => y.demand - x.demand);
    const d = this.fs.type ? list.find(x => x.slug === this.fs.type) : list[0];
    if(!d) return none;
    return {demand:d.demand, fit:d.type, slug:d.slug, score:Math.round(b.traffic * d.demand / 100),
      rivals:this.countHere(b.hood, d.slug, 'rival', b.key), mine:this.countHere(b.hood, d.slug, 'mine', b.key),
      list, rank:list.indexOf(d) + 1};
  }
  /* Rivals of a type in a neighbourhood. A buy-out row is one of them itself,
     and a building is not its own competition, so it never counts itself. */
  countHere(hood, slug, status, self){
    const P = premises(); if(!P) return 0;
    if(!this.counts) this.counts = new Map();
    const key = `${status}|${hood}|${slug}`;
    if(!this.counts.has(key)) this.counts.set(key, P.buildings.filter(b =>
      b.hood === hood && b.status === status && b.occupant?.typeSlug === slug).map(b => b.key));
    const keys = this.counts.get(key);
    return keys.length - (keys.includes(self) ? 1 : 0);
  }
  saleView(){ return this.fs.show === 'sale'; }
  /* A place you could actually take: an empty floor when the list is premises
     to rent, a rival business when it is businesses to take over. A game
     service is occupied by the game itself and is neither. */
  candidate(b){
    return this.fs.show === 'rent' ? b.status === 'vacant'
      : this.fs.show === 'takeover' ? b.status === 'rival' : false;
  }
  finderRows(){
    const P = premises(), fs = this.fs;
    if(!P) return [];
    const out = [];
    for(const b of P.buildings){
      if(b.type !== fs.cat) continue;
      if(!this.candidate(b)) continue;
      if(!this.hoodOn(b.hood) || b.traffic < fs.minTraffic) continue;
      if(!finderFits(b.m2, fs.minM2, fs.maxM2)) continue;
      // Both ends judge a range by its smallest variant: a cinema seating 100
      // to 150 clears a minimum of 100 and fits under a maximum of 120, but a
      // building with no door cap at all can promise neither.
      if(!finderFits(capMin(b.cap), fs.minCap, fs.maxCap)) continue;
      const loc = this.assets.byKey.get(b.key);
      out.push({key:b.key, address:b.address, hood:b.hood, bld:b, f:this.fitFor(b), region:loc?.region, bounds:loc?.bounds});
    }
    const shown = this.byLayout(out, r => r.bld.layout);
    // A range sorts on the cap it can promise, the same bound the filter reads.
    const value = r => fs.sort === 'traffic' ? r.bld.traffic : fs.sort === 'demand' ? r.f.demand
      : fs.sort === 'cap' ? capMin(r.bld.cap) : fs.sort === 'deposit' ? r.bld.deposit
      : fs.sort === 'm2' ? r.bld.m2 : r.f.score;
    // A row with nothing to sort on stays at the bottom whichever way the
    // column points; it is not the smallest value, it is no value at all.
    shown.sort((a, b) => {
      const x = value(a), y = value(b);
      if(x == null || y == null) return (x == null) - (y == null) || b.bld.traffic - a.bld.traffic;
      return (y - x) || b.bld.traffic - a.bld.traffic;
    });
    return shown;
  }
  /* The rows carry their geometry like every other row, so a listing lights its
     own footprint and a click on either one selects it. */
  saleRows(){
    const P = premises(), fs = this.fs; if(!P) return [];
    // A listing is an address with its own floor area; the kind, the traffic
    // and the door cap come from the building behind it, so the controls still
    // on screen all apply.
    return this.byLayout(P.forSale.filter(s => {
      if(!this.hoodOn(s.hood) || !this.saleKind(s)) return false;
      const b = this.sites?.get(s.key);
      return finderFits(b?.traffic, fs.minTraffic, 0) && finderFits(s.m2, fs.minM2, fs.maxM2)
        && finderFits(capMin(b?.cap), fs.minCap, fs.maxCap);
    }), s => s.layout).sort((a, b) => a.price - b.price)
      .map(s => { const loc = this.assets.byKey.get(s.key); return {...s, region:loc?.region, bounds:loc?.bounds}; });
  }
  saleKind(s){ return (this.sites?.get(s.key)?.type ?? s.type) === this.fs.cat; }
  finderList(rows){
    // A warehouse ranks by floor area already, so its list has no second m²
    // column and keeps the narrower grid (class wh).
    const fs = this.fs, wh = fs.cat === 'warehouse', grid = wh ? ' wh' : '';
    const cols = wh ? [["","#"],["",""],["","Address"],["m2","m²"],["traffic","Traffic"],["",""],["cap","Cap"],["deposit","Upfront"]]
                    : [["","#"],["",""],["","Address"],["score","Score"],["traffic","Traffic"],["demand","Demand"],["m2","m²"],["cap","Cap"],["deposit","Upfront"]];
    const head = `<div class="fhead${grid}">${cols.map(([key, label]) => key
      ? `<span data-s="${key}" role="button" tabindex="0" class="${key === fs.sort ? 'on' : ''}">${label}</span>`
      : `<span>${label}</span>`).join('')}</div>`;
    // Each shaded column is stretched over the values actually on screen, so a
    // field of close scores still reads. Rent is never shaded: high is not good.
    const scale = pick => {
      const seen = rows.map(pick).filter(v => v != null);
      const lo = Math.min(...seen), hi = Math.max(...seen);
      return (v, top) => v == null || hi === lo ? '' : ` style="background:${shadeScore((v - lo) / (hi - lo), top)}"`;
    };
    const lead = scale(r => wh ? r.bld.m2 : r.f.score), byTraffic = scale(r => r.bld.traffic), byDemand = scale(r => r.f.demand);
    return head + rows.map((r, i) => {
      const b = r.bld, f = r.f;
      const company = b.status === 'rival' ? rivalName(b.occupantRival) : null;
      // Floor area and cap have columns of their own, so a row with nothing
      // else to say names its neighbourhood in full, as a for-sale row does.
      const what = b.status === 'rival' && b.occupant ? `${b.occupant.name} · ${b.occupant.type}${company ? ` · ${company}` : ''}`
        : f.fit && !fs.type ? `best fit: ${f.fit}` : hoodName(b.hood);
      const sub = what + (f.rivals != null ? ` · ${f.rivals} rival${f.rivals === 1 ? '' : 's'}` : '');
      // Floor area is not shaded, like the cap: bigger is not better for every business.
      const numbers = wh
        ? `<span class="v sc sh"${lead(b.m2, SHADE_LEAD)}>${b.m2.toLocaleString('en-US')}</span><span class="v sh"${byTraffic(b.traffic, SHADE_SIDE)}>${b.traffic}</span><span class="v"></span>`
        : `<span class="v sc sh"${lead(f.score, SHADE_LEAD)}>${f.score ?? '—'}</span><span class="v sh"${byTraffic(b.traffic, SHADE_SIDE)}>${b.traffic}</span><span class="v sh"${byDemand(f.demand, SHADE_SIDE)}>${f.demand ?? '—'}</span><span class="v m2">${b.m2.toLocaleString('en-US')}</span>`;
      // The dot says what taking this place would mean: an empty floor to rent
      // or a rival to buy out.
      return `<button type="button" class="place fr${grid}${b.status === 'rival' ? ' buy' : ''}${r.key === this.selected ? ' on' : ''}" data-pick="${mapText(r.key)}" aria-pressed="${r.key === this.selected}"><span class="rk"><i></i>${i + 1}</span><span class="hood">${mapText(hoodTag(b.hood))}</span><span class="nm">${mapText(b.address)}<small>${this.layoutTag(b)}${mapText(sub)}</small></span>${numbers}<span class="v cap">${mapText(capText(b.cap))}</span><span class="v dep" data-tip="${attr(depositNote(b))}">${b.deposit != null ? mapText(fmt(b.deposit)) : '—'}</span></button>`;
    }).join('');
  }
  saleList(rows){
    return `<div class="fhead sale"><span></span><span>Address</span><span>Type</span><span>m²</span><span>Price</span></div>`
      + rows.map(s => `<button type="button" class="place fr sale${s.key === this.selected ? ' on' : ''}" data-pick="${mapText(s.key)}" aria-pressed="${s.key === this.selected}"><span class="hood">${mapText(hoodTag(s.hood))}</span><span class="nm">${mapText(s.address)}<small>${this.layoutTag(s)}${mapText(hoodName(s.hood))}</small></span><span class="v t">${mapText(typeLabel(s.type))}</span><span class="v">${s.m2.toLocaleString('en-US')}</span><span class="v">${mapText(askingPrice(s.price))}</span></button>`).join('');
  }
  /* The facts every address carries, finder on or off: what the place is, what
     it would cost and whether it is free. */
  paintFacts(key, focusGrow = false){
    const card = this.card, st = card.querySelector('.st'), facts = card.querySelector('.facts'), fit = card.querySelector('.fit');
    const b = this.sites?.get(key);
    st.hidden = facts.hidden = fit.hidden = card.querySelector('.why').hidden = true;
    if(!b) return;
    st.hidden = facts.hidden = false;
    st.className = `st ${b.status === 'rival' ? 'rival' : b.status === 'mine' ? 'mine' : b.status === 'vacant' ? 'vacant' : 'na'}`;
    st.innerHTML = `<i></i>${mapText(finderStatus(b))}`;
    facts.innerHTML = `<span class="wide">Owner<b>${this.ownerOf(b)}</b></span>`
      + `<span class="wide">Renter<b>${this.renterOf(b)}</b></span>`
      + `<span>${mapText(`${typeLabel(b.type)} ${b.size || ''}`.trim())}<b>${b.m2.toLocaleString('en-US')} m²</b></span>`
      + `<span>Foot traffic<b>${b.traffic}</b></span>`
      + `<span>Building capacity<b>${mapText(capText(b.cap))}</b></span>`
      + `<span>Est. rent / day<b>${b.rent != null ? mapText(fmt(b.rent)) : '—'}</b></span>`
      + `<span>Deposit<b>${b.deposit != null ? mapText(fmt(b.deposit)) : '—'}</b></span>`;
    // Only a candidate reads as one: your own shop keeps its business numbers.
    if(!this.finderOn() || this.saleView() || b.type !== this.fs.cat || !this.candidate(b)) return;
    const f = this.fitFor(b);
    fit.hidden = false;
    fit.innerHTML = f.fit ? `<b>${mapText(f.fit)}</b> in ${mapText(hoodName(b.hood))}`
      : 'No demand reading for this category here.';
    const why = card.querySelector('.why');
    why.hidden = !f.fit;
    if(f.fit) why.textContent = this.whyRanked(b, f);
    const num = (v, lab, cls = "") => `<div class="num"><b class="mono${cls}">${v}</b><span>${lab}</span></div>`;
    // The demand is the Growth grid's own reading, so it leads back to that
    // type's row there.
    const demand = f.slug
      ? `<a class="num mf-grow" href="#secMarket" data-grow="${mapText(f.slug)}" data-tip="${
          mapText(`${f.fit} in every neighbourhood, on Growth › Demand`)}"><b class="mono">${f.demand}</b><span>demand ›</span></a>`
      : num(f.demand, 'demand');
    card.querySelector('.nums').innerHTML = f.score != null
      ? num(f.score, 'score', ' sc') + num(b.traffic, 'traffic') + demand
      : num(b.m2.toLocaleString('en-US'), 'm²') + num(b.traffic, 'traffic');
    const grow = card.querySelector('.mf-grow');
    if(grow) grow.onclick = e => { e.preventDefault(); showGrowthRow(grow.dataset.grow); };
    if(grow && focusGrow) grow.focus({preventScroll: true});
  }
  /* Who the building belongs to, and who trades from it. Both name the rival
     company where the save knows its name. */
  ownerOf(b){
    return b.owner === 'you' ? 'You'
      : b.owner === 'rival' ? rivalTag(b.ownerRival, 'Rival company')
      : b.owner === 'city' ? 'The city' : '—';
  }
  renterOf(b){
    const who = b.occupant;
    // A place you rent is yours whether or not a business trades from it.
    // Your own is named by a way to its page.
    if(b.status === 'mine') return who?.name ? `${siteLink({key: b.key, name: who.name}, who.name)} (you)` : 'You';
    if(!who) return 'Nobody';
    // A hospital or a casino is occupied while still being unavailable, so the
    // occupant is named whatever the status says about taking the place.
    const name = mapText(who.name || 'unnamed'), kind = mapText(who.type || 'business');
    return b.status === 'rival' ? `${name} · ${kind} (${rivalTag(b.occupantRival, 'rival company')})`
      : b.status === 'service' ? `${name} · ${kind} (game service)`
      : `${name} · ${kind}`;
  }
  /* Why this row sits where it does, in sentences: what the neighbourhood wants
     most of this category, what else it wants, and the arithmetic of the score. */
  whyRanked(b, f){
    const shops = n => plural(n, `rival ${f.fit}`, `rival ${f.fit}s`);
    const mine = f.mine ? ` and ${f.mine} of your own` : '';
    const first = this.fs.type
      ? `${f.fit} demand in ${hoodName(b.hood)} is ${f.demand} (${f.rank} of ${plural(f.list.length, `${this.fs.cat} type`)} here), with ${shops(f.rivals)}${mine} in the neighbourhood.`
      : `${f.fit} is the strongest ${this.fs.cat} demand in ${hoodName(b.hood)} at ${f.demand}, with ${shops(f.rivals)}${mine} there${
          f.list.length > 1 ? `; next: ${f.list.slice(1, 3).map(d => `${d.type} ${d.demand}`).join(', ')}` : ''}.`;
    return `${first} Score ${f.score} = traffic ${b.traffic} × demand ${f.demand} ÷ 100.`;
  }
  finderOn(){ return !!(this.panel && premises() && this.fs.on); }
  /* Chips, select and inputs read back from the state, so a preset from Today
     or from a Growth cell shows in the controls it set. */
  paintControls(){
    const P = premises(); if(!P || !this.panel) return;
    this.clampSort();
    const on = this.finderOn();
    this.root.classList.toggle('finder', on);
    this.citymap.classList.toggle('finder', on);
    this.stage.classList.toggle('finder', on);
    this.stage.classList.toggle('panel', on);
    // A chip is filled when it is chosen and outlined when it is not; nothing
    // is ever dimmed, which would read as unavailable rather than unchosen.
    const mark = (el, chosen) => { if(!el) return; el.classList.toggle('on', !!chosen); el.setAttribute('aria-pressed', String(!!chosen)); };
    const tog = this.root.querySelector('[data-f="tog"]');
    mark(tog, on);
    tog.dataset.tip = on ? "Find a location is on: the list ranks premises you could take. Click to go back to the plain map."
      : "Find a location: rank premises you could take by the neighbourhood's demand and the building's foot traffic. Click to switch it on.";
    // The rent check comes from the payload, so it is written on every update.
    this.root.querySelector('.filters .why').dataset.tip = `${FINDER_WHY} ${rentNote()}`;
    this.root.querySelectorAll('.fchip.cat').forEach(chip => mark(chip, chip.dataset.cat === this.fs.cat));
    const select = this.root.querySelector('[data-f="type"]');
    const types = this.catTypes(this.fs.cat);
    const options = [...types].sort((a, b) => mapCompare(a[1], b[1]));
    if(this.fs.type && !types.has(this.fs.type)) this.fs.type = "";
    select.innerHTML = `<option value="">Any type</option>` + options.map(([slug, label]) =>
      `<option value="${attr(slug)}"${slug === this.fs.type ? ' selected' : ''}>${mapText(label)}</option>`).join('');
    select.disabled = !options.length;
    select.closest('.fsel').classList.toggle('on', !!this.fs.type);
    this.root.querySelector('.frow.ftype').hidden = this.saleView();
    // A game service is occupied but never on offer, so it counts for nothing.
    const counts = {rent:0, takeover:0};
    P.buildings.forEach(b => { if(b.type !== this.fs.cat) return;
      if(b.status === 'vacant') counts.rent++; else if(b.status === 'rival') counts.takeover++; });
    this.root.querySelectorAll('.fchip.hd').forEach(chip => mark(chip, this.hoodOn(chip.dataset.h)));
    this.root.querySelectorAll('.fchip.num').forEach(box => {
      const input = box.querySelector('input'), v = String(this.fs[input.dataset.f] || 0);
      if(input.value !== v && document.activeElement !== input) input.value = v;
      box.classList.toggle('on', +v > 0);
    });
    // The layout filter shows only while a layout on the shelf is chosen.
    const layout = this.root.querySelector('.frow.flayout');
    if(this.layoutPick && !this.planCodes().includes(this.layoutPick)) this.layoutPick = null;
    layout.hidden = !this.layoutPick;
    const chip = this.layoutPick ? `<button type="button" class="fchip on" data-lp-clear aria-label="${attr(`Layout ${this.layoutPick}: list every layout again`)}">Layout ${mapText(this.layoutPick)}<b aria-hidden="true">×</b></button>` : '';
    const host = layout.querySelector('.lp-laychip');
    if(host.dataset.sig !== chip){ host.dataset.sig = chip; host.innerHTML = chip; }
    this.root.querySelectorAll('.fchip.show').forEach(chip => {
      const key = chip.dataset.show;
      chip.querySelector('b').textContent = key === 'sale'
        ? P.forSale.filter(s => this.saleKind(s)).length : counts[key];
      mark(chip, this.fs.show === key);
    });
    this.paintSaved();
  }
  /* Full screen takes the whole map box (stage and panel); the camera refits
     when the size changes, keeping the selection. */
  toggleFullscreen(){
    const box = this.citymap; if(!box) return;
    if(document.fullscreenElement === box) document.exitFullscreen?.();
    else box.requestFullscreen?.().catch(() => {});
  }
  /* The camera: a viewBox with the stage's aspect, so nothing letterboxes. */
  stageRect(){ return this.rect || (this.rect=this.svg.getBoundingClientRect()); }
  /* The panel is the finder's. Off, the map has the whole stage: no list, no
     room reserved for one, and the zoom buttons back at the right edge. */
  hasPanel(){ return this.finderOn() && !this.narrow; }
  freeWidth(){ const r = this.stageRect(); return Math.max(120, r.width - (this.hasPanel() ? PANEL_W : 0)); }
  fitBox(bounds){
    const r = this.stageRect(); if(!r.width || !r.height) return [...this.assets.viewBox];
    const free = this.freeWidth(), [bx, by, bw, bh] = bounds;
    const s = Math.min(free / bw, r.height / bh) * .96;
    return [bx + bw/2 - (free/2)/s, by + bh/2 - (r.height/2)/s, r.width/s, r.height/s];
  }
  scale(){ const r = this.stageRect(); return this.box ? Math.min(r.width / this.box[2], r.height / this.box[3]) : 1; }
  cityScale(){ const r = this.stageRect(), b = this.fitBox(this.assets.viewBox); return Math.min(r.width / b[2], r.height / b[3]); }
  proj(x, y){
    const r = this.stageRect(), [bx, by, w, h] = this.box, s = this.scale();
    return {x:(r.width - w*s)/2 + (x-bx)*s, y:(r.height - h*s)/2 + (y-by)*s};
  }
  reset(animate = false){
    const box = this.fitBox(this.assets.viewBox);
    if(animate && this.box) this.glide(box); else { this.cancelGlide(); this.box = box; this.paintView(); }
  }
  /* A drag, a wheel or a button cuts a glide short; whatever waited for the
     glide (the card) must still happen. */
  cancelGlide(){ if(!this.goal) return; this.goal = null; this.endInteraction(); const done = this.onSettled; this.onSettled = null; done?.(); }
  glide(box, ms = GLIDE_MS){
    if(REDUCED || !this.box){ this.goal = null; this.box = box; this.paintView(); return; }
    this.goal = {from:[...this.box], to:box, t0:performance.now(), ms};
    this.beginInteraction();
    const step = t => {
      const g = this.goal; if(!g) return;
      const p = Math.min(1, (t - g.t0) / g.ms), e = 1 - Math.pow(1 - p, 3);
      this.box = g.from.map((v, i) => v + (g.to[i] - v) * e);
      this.paintView();
      if(p < 1) requestAnimationFrame(step); else { this.goal = null; this.endInteraction(); const done = this.onSettled; this.onSettled = null; done?.(); }
    };
    requestAnimationFrame(step);
  }
  paintView(){
    if(!this.svg || !this.box || this.frame) return;
    this.frame=requestAnimationFrame(()=>{this.frame=null;this.drawView();});
  }
  drawView(){
    this.svg.setAttribute('viewBox',this.box.join(' '));
    const s = this.scale(); if(!s) return;
    const zoomed = this.box[2] < this.fitBox(this.assets.viewBox)[2] / 1.9;
    this.stage.classList.toggle('zoomed', zoomed);
    this.districts.forEach(l=>{ const p = this.proj(+l.dataset.x, +l.dataset.y); l.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) translate(-50%,-50%)`; });
    this.pips.querySelectorAll('circle').forEach(c => c.setAttribute('r', (4.5 / s).toFixed(2)));
    this.placeCard();
    this.paintBall?.();
  }
  point(e){
    const r=this.stageRect(), [x,y,w,h]=this.box;
    const scale=Math.min(r.width/w,r.height/h);
    return {x:x+(e.clientX-r.left-(r.width-w*scale)/2)/scale,y:y+(e.clientY-r.top-(r.height-h*scale)/2)/scale};
  }
  beginInteraction(){
    clearTimeout(this.idleTimer); this.stage.classList.add('interacting');
  }
  endInteraction(){
    clearTimeout(this.idleTimer);
    if(!this.dragging) this.idleTimer=setTimeout(()=>this.stage.classList.remove('interacting'),120);
  }
  zoom(factor, point){
    if(!this.box) return;
    this.cancelGlide();
    this.beginInteraction();
    const [x,y,w,h] = this.box, width = Math.min(this.assets.viewBox[2]*1.5, Math.max(35,w*factor));
    const f = width/w, p = point || {x:x+w/2,y:y+h/2};
    this.box = [p.x-(p.x-x)*f,p.y-(p.y-y)*f,width,h*f]; this.paintView();
    this.endInteraction();
  }
  wirePan(){
    const pointers = new Map(); let previous = null, origin = null, down = null, moved = false;
    const midpoint = () => {
      const pts = [...pointers.values()];
      return {clientX:pts.reduce((s,p)=>s+p.x,0)/pts.length,clientY:pts.reduce((s,p)=>s+p.y,0)/pts.length,
        distance:pts.length===2 ? Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y) : 0};
    };
    this.svg.onpointerdown = e => {
      if(e.button !== 0) return;
      e.preventDefault(); this.rect=this.svg.getBoundingClientRect(); this.cancelGlide();
      this.dragging=true; this.beginInteraction();
      pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      previous = midpoint(); down = e.target.closest('[data-location]')?.dataset.location; moved = pointers.size>1;
      origin=previous;
      this.svg.setPointerCapture(e.pointerId); this.svg.classList.add('dragging');
    };
    this.svg.onpointermove = e => {
      if(!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      const next = midpoint();
      const from = this.point(previous), to = this.point(next);
      if(Math.hypot(next.clientX-origin.clientX,next.clientY-origin.clientY)>4) moved=true;
      this.box[0] += from.x-to.x; this.box[1] += from.y-to.y;
      if(previous.distance && next.distance) this.zoom(previous.distance/next.distance,this.point(next));
      this.paintView(); previous = next;
    };
    const end = e => {
      if(!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      // A still click picks a footprint; a still click on empty map closes the card.
      if(e.type==='pointerup' && !moved){ if(down) this.select(down, this.scale() < this.cityScale() * PICK_ZOOM * .9); else this.deselect(); }
      moved = true;
      if(pointers.size) previous=midpoint(); else {
        this.dragging=false; this.svg.classList.remove('dragging'); this.endInteraction();
      }
    };
    this.svg.onpointerup = end; this.svg.onpointercancel = end; this.svg.onlostpointercapture = end;
    this.stage.onselectstart = this.svg.ondragstart = e=>e.preventDefault();
    this.svg.addEventListener('wheel', e => {e.preventDefault(); this.rect=this.svg.getBoundingClientRect(); this.zoom(Math.exp(Math.max(-1,Math.min(1,e.deltaY*.002))),this.point(e));},{passive:false});
    this.svg.addEventListener('mouseover', e => { const fp = e.target.closest('[data-location]'); if(fp) this.light(fp.dataset.location, false); });
    this.svg.addEventListener('mouseout', e => { const fp = e.target.closest('[data-location]'); if(fp) this.light(null, false); });
  }
  /* The brand ball in Central Park. It breathes, watches the pointer like its
     masthead siblings, and pays out when clicked. It sits in the HTML layer,
     so pointer events never reach the SVG beneath: no drag, no pick, and an
     open card stays open. */
  wireBall(){
    this.ball = this.root.querySelector('.ball');
    this.shadow = this.root.querySelector('.shadow');
    if(!this.ball) return;
    // Central Park spans about x 590-1060, y 405-680; the ball stays inside it.
    this.orb = {x:880, y:542, size:170};
    this.busy = false;
    this.ball.addEventListener('click', () => {
      if(this.busy) return;
      this.squishBall(); this.ballRing();
      const r = this.ball.getBoundingClientRect();
      // The masthead balls are the same sphere: this one swallows them and
      // grows a little per gulp. busy until every last orb has arrived.
      let orbs = 0;
      const onEach = () => {
        this.squishBall();
        this.orb.size = Math.min(230, this.orb.size * 1.08);
        this.paintBall();
        if(--orbs <= 0) this.busy = false;
      };
      orbs = window.__consumeBalls ? window.__consumeBalls(r.left + r.width/2, r.top + r.height/2, onEach) : 0;
      if(orbs > 0){ this.busy = true; return; }
      // nothing to swallow: spin and pay out
      this.ball.classList.remove('spin'); void this.ball.offsetWidth; this.ball.classList.add('spin');
      if(REDUCED) return;
      for(let i = 0; i < 10; i++){
        const c = document.createElement('i'); c.className = 'coin';
        const a = Math.random() * Math.PI - Math.PI, d = 50 + Math.random() * 110;
        c.style.left = (r.left + window.scrollX + r.width/2) + 'px'; c.style.top = (r.top + window.scrollY + r.height*.4) + 'px';
        c.style.setProperty('--dx', Math.cos(a) * d + 'px'); c.style.setProperty('--dy', (Math.abs(Math.sin(a)) * d + 120) + 'px');
        c.style.animationDelay = (Math.random() * .12) + 's';
        document.body.appendChild(c); setTimeout(() => c.remove(), 1400);
      }
    });
    if(REDUCED){ this.lift = 0; return; } // drawView paints it still, once per camera move
    if(this.ballHover) document.removeEventListener('mousemove', this.ballHover);
    document.addEventListener('mousemove', this.ballHover = e => {
      const r = this.ball.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width/2), dy = e.clientY - (r.top + r.height/2), d = Math.hypot(dx, dy) || 1;
      this.ball.style.setProperty('--hx', (34 + dx/d * 20) + '%'); this.ball.style.setProperty('--hy', (32 + dy/d * 20) + '%');
    });
    const token = this.buildToken;
    const loop = t => {
      if(token !== this.buildToken || !this.svg.isConnected) return;
      if(!document.hidden && this.stage.offsetParent){
        const px = this.orb.size * this.scale();
        this.lift = (1 + Math.sin(t/700)) * px * .012;
        this.paintBall();
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  squishBall(){
    [this.ball.querySelector('i'), this.ball.querySelector('u')].forEach(el => { el.classList.remove('squish'); void el.offsetWidth; el.classList.add('squish'); });
  }
  ballRing(){
    const r = this.ball.getBoundingClientRect(), i = document.createElement('i');
    i.className = 'ring';
    i.style.left = (r.left + window.scrollX) + 'px'; i.style.top = (r.top + window.scrollY) + 'px';
    i.style.width = r.width + 'px'; i.style.height = r.height + 'px';
    document.body.appendChild(i); setTimeout(() => i.remove(), 900);
  }
  /* Ball and shadow in stage pixels from map units: it scales with the camera
     exactly, never clamped. lift is the breathing offset (0 under REDUCED). */
  paintBall(){
    if(!this.ball || !this.box) return;
    const s = this.scale(), p = this.proj(this.orb.x, this.orb.y), px = this.orb.size * s;
    const lift = this.lift || 0;
    this.ball.style.width = this.ball.style.height = px + 'px';
    this.ball.style.transform = `translate(${(p.x - px/2).toFixed(1)}px,${(p.y - px/2 - lift).toFixed(1)}px)`;
    const k = Math.max(.35, 1 - lift/(px*3));
    this.shadow.style.width = px + 'px'; this.shadow.style.height = (px*.16) + 'px';
    this.shadow.style.transform = `translate(${(p.x - px/2).toFixed(1)}px,${(p.y + px*.42).toFixed(1)}px) scale(${k.toFixed(3)})`;
    this.shadow.style.opacity = (.5*k).toFixed(2);
  }
  /* Hovering a row lights its footprint; hovering a footprint marks its row. */
  light(key, fromList = true){
    if(this.hot && this.paths.get(this.hot)) this.paths.get(this.hot).classList.remove('hot');
    this.hot = key;
    if(key && fromList && this.paths.get(key)) this.paths.get(key).classList.add('hot');
    if(this.list) this.list.querySelectorAll('.hot').forEach(p => p.classList.remove('hot'));
    if(key && !fromList && this.list) this.list.querySelector(`[data-pick="${CSS.escape(key)}"]`)?.classList.add('hot');
    // The dock follows the pointer and falls back to the pick when it leaves.
    this.hoverFromList = !!key && fromList;
    if(this.hoverKey !== key){ this.hoverKey = key; this.paintDockState(); }
  }
  /* --- floor plans ------------------------------------------------------------
     Desktop: a dock bottom-left of the map area holds the kind's layouts on one
     shelf at one scale, with the hovered or picked row's layout lit and its
     numbers above. Phone: once a picked row has a plan, a Map / Plan switch in
     the map window shows it full size. A row with no plan shows nothing. */
  wantPlans(){
    if(this.plansAsked) return;
    this.plansAsked = true;
    loadFloorPlans().then(plans => { this.plans = plans; if(plans && this.svg) this.update(); });
  }
  /* The building behind a key, from the premises or a sale listing. */
  planSite(key){
    if(!key) return null;
    return this.sites?.get(key) || premises()?.forSale.find(s => s.key === key) || null;
  }
  /* The layout code of a building this finder can draw, or null. Only a
     building of the kind on show counts, so a footprint hovered on the map
     never lights a layout the shelf does not hold. */
  planOf(b){
    const code = b?.layout;
    return code && b.type === this.fs.cat && this.plans?.plans?.[code] && this.planCodes().includes(code) ? code : null;
  }
  /* The kind's layouts the file can draw. None while the payload carries no
     layouts for the kind, so a board made before the plans shows no shelf. */
  planCodes(){
    const cat = this.fs.cat;
    if(!(premises()?.buildings || []).some(b => b.type === cat && b.layout)) return [];
    return (this.plans?.kinds?.[cat] || []).filter(c => this.plans.plans[c]);
  }
  layoutTag(b){ const code = this.planOf(b); return code ? `<span class="lp-tag">${mapText(code)}</span>` : ''; }
  /* Counts every listed row's layout before the layout filter applies, so the
     shelf can say how many of each the other filters leave. */
  byLayout(rows, layoutOf){
    const counts = new Map();
    rows.forEach(r => { const c = layoutOf(r); if(c) counts.set(c, (counts.get(c) || 0) + 1); });
    this.layoutCounts = counts;
    if(this.layoutPick && !this.planCodes().includes(this.layoutPick)) this.layoutPick = null;
    return this.layoutPick ? rows.filter(r => layoutOf(r) === this.layoutPick) : rows;
  }
  /* The height the dock takes from the bottom of the stage, 0 when it is away. */
  dockRoom(){ return this.dock && !this.dock.hidden ? this.dock.offsetHeight + 16 : 0; }
  /* How this stage shows plans: the dock when the map area left of the panel
     has room for the shelf, else (a phone, or a stage the panel nearly fills)
     the Map / Plan switch. */
  planMode(){
    if(!this.finderOn() || !this.plans || !this.planCodes().length) return null;
    return !this.narrow && this.freeWidth() >= FLOOR_PLAN_DOCK_MIN ? 'dock' : 'switch';
  }
  paintPlans(){
    if(!this.dock || !this.svg) return;
    const mode = this.planMode();
    // Showing the dock again replays its entrance (CSS on .lp-dock); nothing
    // else does.
    if(this.dock.hidden === (mode === 'dock')) this.dock.hidden = mode !== 'dock';
    if(mode === 'dock') this.paintShelf(this.planCodes());
    this.paintPhonePlan(mode === 'switch');
  }
  /* The kind's layouts at one scale: one row, or two when there are more than
     six (the warehouses' twelve). The scale is the largest that fits the free
     map area, never more than 10 px a metre. The tiles are built once for a
     kind and a scale; counts, the filter and the lights change in place, so a
     keystroke or a live refresh never redraws the shelf or moves the focus. */
  paintShelf(codes){
    const plans = this.plans.plans, wrap = codes.length > 6;
    const lines = wrap ? [codes.slice(0, Math.ceil(codes.length / 2)), codes.slice(Math.ceil(codes.length / 2))] : [codes];
    const perLine = lines[0].length, boxH = wrap ? 64 : 112;
    const room = Math.max(240, Math.min(660, this.freeWidth() - 100)) - 26 - perLine * 20;
    const tall = Math.max(...codes.map(c => plans[c].h)) / FLOOR_PLAN_PX;
    const wide = Math.max(...lines.map(l => l.reduce((t, c) => t + plans[c].w / FLOOR_PLAN_PX, 0)));
    const s = Math.max(.5, Math.min(10, boxH / tall, room / wide));
    const sig = JSON.stringify([this.fs.cat, codes, s.toFixed(2)]);
    if(sig !== this.shelfSig){
      this.shelfSig = sig;
      // Every building of a kind and size has the same floor area in the game.
      const m2 = new Map();
      (premises()?.buildings || []).forEach(b => { if(b.type === this.fs.cat && !m2.has(b.size)) m2.set(b.size, b.m2); });
      const kind = FINDER_CATS.find(([c]) => c === this.fs.cat)?.[1] || "";
      const tile = code => {
        const area = m2.get(code.replace(/\d+$/, ''));
        return `<button type="button" class="lp-tile" data-lp-tile="${attr(code)}" aria-pressed="false"><span class="lp-tilebox" style="height:${boxH}px">${floorPlanSvg(plans[code], s, `Floor plan ${code}`)}</span><span class="lp-tilecode"><b>${mapText(code)}</b>${area ? `${area.toLocaleString('en-US')} m²` : ''}</span><span class="lp-tilen"></span></button>`;
      };
      this.dock.innerHTML = `<div class="lp-shelf"><div class="lp-detail"><div class="lp-body"></div><span class="why lp-why" tabindex="0" data-tip="${attr(FLOOR_PLAN_TIP)}"><i>?</i></span></div><div class="lp-shelfhead"><span class="lp-lab">${mapText(kind)} layouts at one scale</span><span class="lp-note"></span>${floorPlanScale(s)}</div>${lines.map(l => `<div class="lp-tiles">${l.map(tile).join('')}</div>`).join('')}</div>`;
      this.detailSig = null;
    }
    const counts = this.layoutCounts || new Map();
    this.dock.querySelectorAll('[data-lp-tile]').forEach(t => {
      const code = t.dataset.lpTile, n = counts.get(code) || 0, picked = this.layoutPick === code;
      const label = `Layout ${code}, ${n || 'none'} listed. ${picked ? 'List every layout again.' : 'List only this layout.'}`;
      t.classList.toggle('none', !n);
      if(t.getAttribute('aria-pressed') !== String(picked)) t.setAttribute('aria-pressed', String(picked));
      if(t.getAttribute('aria-label') !== label) t.setAttribute('aria-label', label);
      const count = t.querySelector('.lp-tilen'), text = n ? `${n} listed` : 'none listed';
      if(count.textContent !== text) count.textContent = text;
    });
    const note = this.dock.querySelector('.lp-note'), noteText = this.layoutPick ? 'click it again to list every layout' : 'click one to list only it';
    if(note.textContent !== noteText) note.textContent = noteText;
    this.paintDockState();
  }
  /* The row the dock describes: the hovered one if it has a plan, else the
     picked one, else none. */
  planShown(){
    for(const [key, how] of [[this.hoverKey, 'hover'], [this.selected, 'pick']]){
      const b = this.planSite(key), code = this.planOf(b);
      if(code) return {key, b, code, how: how === 'hover' && key === this.selected ? 'pick' : how};
    }
    return null;
  }
  planNumbers(b, code){
    const plan = this.plans.plans[code], wh = b.type === 'warehouse';
    const site = this.sites?.get(b.key) || b;
    const n = wh ? plan.bays : plan.doors;
    const num = (v, label) => `<div><b>${mapText(v)}</b><span>${label}</span></div>`;
    return `<div class="lp-nums">${num(b.m2.toLocaleString('en-US'), 'm²')}${num(capText(site.cap), 'cap')}${
      num(n, wh ? (n === 1 ? 'loading bay' : 'loading bays') : (n === 1 ? 'entrance' : 'entrances'))}</div>`;
  }
  paintDockState(){
    if(!this.dock || this.dock.hidden) return;
    const shown = this.planShown(), hoverCode = shown?.how === 'hover' ? shown.code : null;
    const pickCode = this.planOf(this.planSite(this.selected));
    this.dock.querySelectorAll('[data-lp-tile]').forEach(t => {
      t.classList.toggle('lit', t.dataset.lpTile === pickCode);
      t.classList.toggle('hover', t.dataset.lpTile === hoverCode && hoverCode !== pickCode);
    });
    const detail = this.dock.querySelector('.lp-detail'); if(!detail) return;
    // The ? stays put; only the words beside it change, and only when they do.
    let cls = 'lp-detail empty', body = '<p class="lp-hint">Hover a row to light its layout here; pick one to keep it lit.</p>';
    if(shown){
      const {b, code, how} = shown;
      const kind = FINDER_CATS.find(([c]) => c === b.type)?.[1] || typeLabel(b.type);
      cls = `lp-detail ${how}`;
      body = `<div class="lp-id"><div class="lp-state"><i></i><span>${how === 'hover' ? 'Hovered' : 'Picked'}</span></div>`
        + `<div class="lp-code"><b>${mapText(code)}</b><span>${mapText(`${kind}, size ${b.size}`)}</span></div>`
        + `<div class="lp-addr">${mapText(b.address)}</div></div>${this.planNumbers(b, code)}`;
    }
    if(detail.className !== cls) detail.className = cls;
    if(this.detailSig !== body){ this.detailSig = body; detail.querySelector('.lp-body').innerHTML = body; }
  }
  /* The Map / Plan switch, on a phone or a stage too narrow for the dock: it
     shows the pick, since a phone has no hover. The plan covers the map area
     left of the panel, where there is one. */
  paintPhonePlan(on){
    if(!this.seg || !this.phonePlan) return;
    // Plan stays chosen while the dock has the stage (a maximised window), and
    // comes back with the switch; only a pick with no plan resets it.
    if(!this.planOf(this.planSite(this.selected))) this.planView = false;
    const b = on ? this.planSite(this.selected) : null, code = this.planOf(b), view = !!code && !!this.planView;
    this.seg.hidden = !code;
    this.seg.querySelectorAll('[data-lp-view]').forEach(btn => {
      const pressed = (btn.dataset.lpView === 'plan') === view;
      btn.classList.toggle('on', pressed); btn.setAttribute('aria-pressed', String(pressed));
    });
    // The plan view hides the map's layer, the site card with it (map.css).
    this.stage.classList.toggle('lp-planview', view);
    this.phonePlan.hidden = !view;
    if(!view){ this.phonePlanSig = null; return; }
    const r = this.stageRect(), plan = this.plans.plans[code], panel = this.hasPanel() ? PANEL_W : 0;
    this.phonePlan.style.right = `${panel}px`;
    const s = Math.max(.5, Math.min(14, (r.width - panel - 44) / (plan.w / FLOOR_PLAN_PX), (r.height - 190) / (plan.h / FLOOR_PLAN_PX)));
    const sig = JSON.stringify([b.key, code, s.toFixed(2)]);
    if(sig === this.phonePlanSig) return;
    this.phonePlanSig = sig;
    this.phonePlan.innerHTML = `<div class="lp-ppbox">${floorPlanSvg(plan, s, `Floor plan ${code}, ${b.address}`)}</div>`
      + `<div class="lp-pphead"><div class="lp-code"><b>${mapText(code)}</b><span>${mapText(b.address)}</span></div>${this.planNumbers(b, code)}${floorPlanScale(s)}</div>`;
  }
  /* The rows: whatever layers are on, added up and deduped, then searched. */
  rows(){
    if(this.finderOn()) return this.saleView() ? this.saleRows() : this.finderRows();
    const seen = new Set(), rows = [];
    const add = r => { if(!seen.has(r.key)){ seen.add(r.key); rows.push(r); } };
    const site = b => ({key:b.key, address:b.address, hood:b.neighbourhood, business:b, region:this.assets.byKey.get(b.key)?.region, bounds:this.assets.byKey.get(b.key)?.bounds});
    const mine = [...this.businesses.values()].map(site);
    if(this.layers.mine) mine.forEach(add);
    if(this.layers.fnd) mine.filter(r => this.findings.has(r.key)).forEach(add);
    if(this.layers.own){
      mine.filter(r => this.owned.has(r.key)).forEach(add);
      for(const o of this.owned.values()) add({key:o.key, address:o.address, hood:this.assets.byKey.get(o.key)?.hood, owned:o, region:this.assets.byKey.get(o.key)?.region, bounds:this.assets.byKey.get(o.key)?.bounds});
    }
    if(this.layers.home) for(const h of this.homes.values()) add({key:h.key, address:h.address, hood:this.assets.byKey.get(h.key)?.hood, home:h, region:this.assets.byKey.get(h.key)?.region, bounds:this.assets.byKey.get(h.key)?.bounds});
    if(this.layers.all) this.assets.buildings.forEach(b => add({key:b.key, address:b.address, hood:b.hood, business:this.businesses.get(b.key), region:b.region, bounds:b.bounds}));
    const q = this.query.trim().toLowerCase();
    return q ? rows.filter(r => `${r.address} ${r.hood ? hoodName(r.hood) : ''} ${r.business?.name || ''} ${r.business?.type || ''}`.toLowerCase().includes(q)) : rows;
  }
  update(){
    if(!this.svg) return;
    // A view built before a save was open has no finder controls; the first
    // payload that carries premises brings them in.
    if(this.panel && premises() && !this.root.querySelector('[data-f="tog"]')) this.build();
    this.businesses = mapBusinesses(); this.findings = mapFindings();
    this.owned = new Map((D?.ownedBuildings || []).map(b=>[b.key,b]));
    this.homes = new Map((D?.homes || []).map(h=>[h.key,h]));
    this.sites = new Map((premises()?.buildings || []).map(b => [b.key, b]));
    this.counts = null;
    this.loadFinder();
    if(this.finderOn()) this.wantPlans();
    this.paintControls();
    const counts = {mine:this.businesses.size, own:this.owned.size, home:this.homes.size, fnd:[...this.businesses.keys()].filter(k => this.findings.has(k)).length, all:this.assets.buildings.length};
    this.root.querySelectorAll('.lay').forEach(chip => { chip.querySelector('.n').textContent = counts[chip.dataset.l]; });
    this.matches = this.rows();
    const keys = new Set(this.matches.map(b=>b.key));
    const searching = !this.finderOn() && !!this.query.trim();
    this.stage.classList.toggle('all', this.layers.all);
    this.paths.forEach((path,key) => {
      const business = this.businesses.has(key), owned = this.owned.has(key);
      path.classList.toggle('mine', business);
      path.classList.toggle('owned', !business && owned);
      path.classList.toggle('home', !business && this.homes.has(key));
      // In finder mode the candidates are the only highlighted footprints;
      // on the plain map a search lights what it found.
      path.classList.toggle('cand', this.finderOn() && keys.has(key));
      path.classList.toggle('hot', searching && keys.has(key));
      // Amber marks a buy-out candidate; a building for sale is not one.
      path.classList.toggle('buy', this.finderOn() && !this.saleView() && keys.has(key) && this.sites.get(key)?.status === 'rival');
      path.classList.toggle('dim', !keys.has(key) && key!==this.selected);
      path.classList.toggle('sel', key===this.selected);
      path.querySelector('title').textContent=[this.businesses.get(key)?.name,this.assets.byKey.get(key).address].filter(Boolean).join(' · ');
    });
    // Finding dots at the footprint centres; the stage shows them once zoomed in.
    this.pips.innerHTML = this.layers.fnd ? [...this.findings.keys()].filter(k => keys.has(k) && this.assets.byKey.get(k)?.bounds).map(k => {
      const [x,y,w,h] = this.assets.byKey.get(k).bounds;
      return `<circle class="pip ${mapKind(this.findings.get(k))}" cx="${(x+w/2).toFixed(1)}" cy="${(y+h/2).toFixed(1)}" r="4"></circle>`;
    }).join('') : '';
    const cnt = this.root.querySelector('.srch .cnt'); if(cnt) cnt.textContent = this.matches.length;
    if(this.list && this.finderOn()){
      const focusedKey=this.list.contains(document.activeElement)?document.activeElement.dataset.pick:null, listScroll=this.list.scrollTop;
      // Rebuilding the rows under the pointer fires a leave; the hover survives
      // a live refresh as long as its row does.
      const hovered = this.hoverKey, hoveredFromList = this.hoverFromList;
      const all = this.matches;
      const some = this.showAll ? all : all.slice(0, 80);
      this.list.innerHTML = (this.saleView() ? this.saleList(some) : this.finderList(some))
        + (all.length > some.length ? `<button type="button" class="more" data-more aria-label="Show the remaining places">+${all.length - some.length}</button>` : '')
        + (all.length ? '' : '<div class="empty">Nothing matches.</div>');
      if(focusedKey) [...this.list.children].find(b=>b.dataset.pick===focusedKey)?.focus({preventScroll:true});
      this.list.scrollTop=listScroll;
      // A list hover whose row the change took away ends with it; a footprint
      // hovered on the map stays hovered, whatever the list now holds.
      const row = hovered && this.list.querySelector(`[data-pick="${CSS.escape(hovered)}"]`);
      if(hovered && hoveredFromList){ if(row){ this.light(hovered); row.classList.add('hot'); } else this.light(null); }
      else if(hovered) this.light(hovered, false);
    }
    // The dock first, so the card is placed against the dock as it now stands.
    this.paintPlans(); this.fillCard(); this.paintView();
  }
  /* The card beside the picked footprint: name, one identity line, three mono
     numbers, the findings as dot + verb + amount, and the arrow to the site. */
  fillCard(){
    const card = this.card; if(!card) return;
    const key = this.selected, b = this.businesses.get(key), loc = this.assets.byKey.get(key), owned = this.owned.get(key), home = this.homes.get(key);
    // A live refresh repaints the card; its Demand link keeps the focus it had.
    const focusGrow = !!document.activeElement?.classList?.contains('mf-grow') && card.contains(document.activeElement);
    if(!key){ card.hidden = true; card.classList.remove('in'); this.paintFacts(null); return; }
    // Filled now, shown by showCard() once the camera has settled: until then
    // it stays out of the tab order and out of the live region.
    const trading = b && b.status !== 'vacant';
    const title = owned && (!b || b.status === 'vacant') ? owned.address : b?.name || home?.address || loc?.address || owned?.address || 'Location unavailable';
    /* A business's or a home's name is a way to its own page, as it is
       everywhere else on the board. */
    const siteAddr = (b || home) && typeof siteHref === 'function' ? siteHref(key) : '';
    const shown = mapText(title.replace(/^\[\w+\]\s*/, ''));
    card.querySelector('h3').innerHTML = siteAddr ? `<a class="ss-sl" href="${attr(siteAddr)}" data-tip="Open its page">${shown}</a>` : shown;
    const sub = b ? `${mapText(b.address)} · ${mapText(b.type)}` : owned ? `Owned building${owned.purchaseDay != null ? ` · bought day ${mapText(owned.purchaseDay)}` : ''}` : home ? `Home${loc?.hood ? ` · ${mapText(hoodName(loc.hood))}` : ''}`
      // The title is already the address; a bare location adds its neighbourhood.
      : mapText((loc?.hood && hoodName(loc.hood)) || loc?.address || '');
    card.querySelector('.sub').innerHTML = `<span class="hood">${mapText(hoodCode(b, loc?.hood || b?.neighbourhood))}</span><span>${sub}${!loc ? ' · no map position' : ''}</span>`;
    const num = (v, lab) => `<div class="num"><b class="mono">${v}</b><span>${lab}</span></div>`;
    card.querySelector('.nums').innerHTML = trading
      ? num(`<span class="${(b.profit || 0) >= 0 ? 'pos' : 'neg'}">${mapText(fmt(b.profit || 0))}</span>`, 'yesterday') + num(mapText(fmt(b.rent || 0)), 'rent / day') + num(mapText(b.staff ?? '—'), 'staff')
      : b ? num(mapText(fmt(b.rent || 0)), 'rent / day') + num('—', 'not trading')
      : owned ? num(owned.purchasePrice != null ? mapText(money(owned.purchasePrice)) : '—', 'paid')
      : home ? num(mapText(fmt(home.rent || 0)), 'rent / day') : '';
    const findings = this.findings.get(key) || [];
    const f = card.querySelector('.finds2');
    f.innerHTML = findings.map(a => `<div class="f ${mapKind([a])}"><i></i><span>${mapText(splitFinding(a).what)}<span class="fa">${findingAmount(a)}</span></span></div>`).join('');
    f.hidden = !findings.length;
    /* "its page" opens the site's own page, at its address. A business has
       always had one; a home has one too, and it is the only way in — a flat
       is in no picker. */
    const go = card.querySelector('.go2');
    go.hidden = !b && !home;
    go.setAttribute('href', siteAddr || '#detail');
    this.paintFacts(key, focusGrow);
    if(card.classList.contains('in')) this.placeCard();
  }
  showCard(){
    const card = this.card; if(!card || !this.selected) return;
    card.hidden = false; this.placeCard(); card.classList.add('in');
  }
  placeCard(){
    const card = this.card; if(!card || card.hidden || !this.selected) return;
    const loc = this.assets.byKey.get(this.selected), r = this.stageRect();
    if(!loc?.bounds){ // no geometry: the card sits in the free corner of the stage
      card.classList.remove('flip'); card.style.transform = 'translate(16px,16px)'; return;
    }
    const [x,y,w,h] = loc.bounds, p = this.proj(x + w/2, y + h/2);
    const limit = r.width - (this.hasPanel() ? PANEL_W + 14 : 16);
    const flip = p.x + 40 + card.offsetWidth > limit;
    card.classList.toggle('flip', flip);
    const cw = card.offsetWidth, ch = card.offsetHeight;
    let left = flip ? p.x - 40 - cw : p.x + 40;
    left = Math.max(12, Math.min(limit - cw, left)); // never under the panel, even after a drag
    let top = Math.max(12, Math.min(r.height - ch - 12, p.y - 34));
    // the zoom buttons keep their corner: a card that would cover them moves aside
    const z = this.root.querySelector('.zoomer');
    if(z){
      const zr = z.getBoundingClientRect(), sr = this.stageRect();
      const zl = zr.left - sr.left - 8, zt = zr.top - sr.top - 8, zrgt = zr.right - sr.left + 8, zb = zr.bottom - sr.top + 8;
      if(left < zrgt && left + cw > zl && top < zb && top + ch > zt){
        if(zl - cw >= 12) left = zl - cw; else top = Math.max(12, zt - ch);
      }
    }
    // Last, once the card's column is settled: a card that reaches over the
    // dock stays above it, since the dock paints over the card.
    const dockRight = this.dock && !this.dock.hidden ? 16 + this.dock.offsetWidth : 0;
    if(left < dockRight) top = Math.max(12, Math.min(top, r.height - ch - 12 - this.dockRoom()));
    card.style.transform = `translate(${left.toFixed(1)}px,${top.toFixed(1)}px)`;
  }
  async select(key, focus=true, fresh=false){
    this.selected=key;this.freshSelection=fresh;
    if(!await this.ready) return;
    if(this.selected!==key) return; // A newer selection or character superseded this request.
    // A dialog that was just reopened has no layout yet; a cached rect from
    // its closed state is zero. Measure afresh and wait a frame if needed.
    this.rect = null;
    if(!this.stageRect().width){ this.rect = null; requestAnimationFrame(() => { if(this.selected === key) this.select(key, focus, fresh); }); return; }
    if(fresh){
      // A shortcut is a new location request, independent of earlier searches.
      this.query = ''; if(this.search) this.search.value = '';
    }
    const b=this.assets.byKey.get(key);
    this.card?.classList.remove('in');
    if(b?.bounds && focus){
      // The camera glides in; the building lands left of the free area's middle
      // so the card has room; the panel is never over it.
      const r = this.stageRect(), [x,y,w,h]=b.bounds, cx = x+w/2, cy = y+h/2;
      const s = Math.max(this.scale(), this.cityScale() * PICK_ZOOM);
      const free = this.freeWidth();
      // With the plans docked at the bottom, it lands in the middle of the map
      // above them, so the card beside it stays clear of the dock.
      const box = [cx - (free*.44)/s, cy - ((r.height - this.dockRoom())/2)/s, r.width/s, r.height/s];
      this.cancelGlide();
      this.onSettled = () => { if(this.selected === key) this.showCard(); };
      this.update();
      this.glide(box);
      if(!this.goal){ const done = this.onSettled; this.onSettled = null; done?.(); }
    } else {
      this.update();
      this.showCard();
    }
  }
  deselect(){
    if(!this.selected) return;
    this.selected = null; this.onSettled = null;
    this.update();
  }
  resetCharacter(){
    this.selected=null; this.query=''; this.hot=null; this.onSettled=null;
    this.fsCharacter = undefined; this.fs = finderDefaults(); this.showAll = false;
    this.savedUsed = null; this.closeNaming();
    this.layoutPick = null; this.hoverKey = null; this.planView = false;
    if(this.orb) this.orb.size = 170;
    if(this.svg){ if(this.search) this.search.value=''; this.layers = {mine:true, own:true, home:true, fnd:true, all:false};
      this.root.querySelectorAll('.lay').forEach(c => { c.classList.toggle('off', !this.layers[c.dataset.l]); c.setAttribute('aria-pressed', String(this.layers[c.dataset.l])); });
      this.reset(); this.update(); }
  }
}
function showCityMap(){
  // A fresh view starts plain. One that is already here keeps the finder as the
  // player left it, so a trip to another page and back finds the list still up.
  // openFinder() switches it on afterwards.
  if(!cityMapPage) cityMapPage=new CityMapView($('cityMapPage'));
  else cityMapPage.paintView();
}
/* Today's card and a Growth cell both open the map with the finder on and a
   category, a type and a neighbourhood already chosen. `focus` hands the
   keyboard to the first result (the switch when nothing matches), since the
   control that opened the finder is on a page now hidden. */
function openFinder(preset = {}, focus = false){
  if(!premises()) return;
  showPage("map");
  showCityMap();
  const view = cityMapPage;
  // A Growth cell's question starts at the top of its answers, whatever the
  // list was scrolled to before; on a narrow map the whole panel scrolls.
  const toTop = () => view.root.querySelectorAll('.places, .places .list').forEach(el => { el.scrollTop = 0; });
  if(focus) toTop();
  view.setFinder(preset);
  if(focus) view.ready.then(ok => {
    // The player may have left while the map loaded; the focus stays where they went.
    if(!ok || page !== "map") return;
    toTop();
    const to = view.root.querySelector('.place.fr') || view.root.querySelector('[data-f="tog"]');
    if(!to) return;
    to.focus({preventScroll: true});
    // Narrow, the filters sit above the results in the same scroller, so the
    // first result may still be below what the panel shows.
    if(view.narrow) to.scrollIntoView({block: "nearest"});
  });
}
function refreshCityMaps(){
  const character=D?.meta?.character || D?.supply?.factories?.character || D?.meta?.save;
  if(cityMapCharacter !== undefined && character!==cityMapCharacter){
    if($('locationMapDialog').open) $('locationMapDialog').close();
    mapViews.forEach(view=>view.resetCharacter());
  }
  cityMapCharacter=character;
  mapViews.forEach(view=>view.update());
}
function openLocationMap(key, trigger){
  const dialog=$('locationMapDialog');
  if(!dialog.open){
    dialog._returnFocus=trigger || document.activeElement;
    dialog.showModal();document.body.classList.add('map-modal-open');
  }
  const b = mapBusinesses().get(key);
  const title = $('locationMapTitle');
  if(title){
    /* A flat you rent is the third thing with an address here: its own panel
       carries a map pin, so a home key reaches this dialog too. */
    const address = b?.address || (D?.ownedBuildings || []).find(o => o.key === key)?.address
      || (D?.homes || []).find(h => h.key === key)?.address || '';
    title.textContent = b ? `${b.name.replace(/^\[\w+\]\s*/, '')} · ${address}` : address || 'Location map';
  }
  if(!cityMapOverlay) cityMapOverlay=new CityMapView($('cityMapOverlay'), {panel:false});
  cityMapOverlay.select(key,true,true);
}
document.addEventListener('click', e=>{
  const button=e.target.closest('[data-map-key]');
  if(!button) return;
  // Capture prevents a table-row, finding link, or summary opening underneath.
  e.preventDefault();e.stopImmediatePropagation();openLocationMap(button.dataset.mapKey,button);
},true);
const locationMapDialog=$('locationMapDialog');
$('closeLocationMap').onclick=()=>locationMapDialog.close();
locationMapDialog.addEventListener('close',()=>{
  document.body.classList.remove('map-modal-open');
  const trigger=locationMapDialog._returnFocus;
  if(trigger?.isConnected) trigger.focus({preventScroll:true});
});
locationMapDialog.addEventListener('click',e=>{if(e.target===locationMapDialog){const r=locationMapDialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)locationMapDialog.close();}});
