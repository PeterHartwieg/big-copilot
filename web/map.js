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
      return {...data, imageUrl, previewUrl, byKey:new Map(data.buildings.map(b => [b.key,b]))};
    })().catch(error => { cityMapAssets = null; throw error; });
  }
  return cityMapAssets;
}
function mapBusinesses(){ return new Map((D?.businesses || []).map(b => [b.key,b])); }
function mapFindings(){
  const result = new Map();
  for(const a of [...(D?.alerts || []), ...(D?.minor?.rows || [])]){
    if(!a.siteKey) continue;
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
  || String(hood || "").split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
const PANEL_W = 456;   // the finder's panel plus its margin
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
const mapCharacter = () => D?.meta?.character || D?.supply?.factories?.character || D?.meta?.save || "";
/* A size letter whose layouts disagree carries [min, max] rather than a number. */
const capText = c => c == null ? "—" : Array.isArray(c) ? `${c[0]}–${c[1]}` : String(c);
/* A cap you can count on is the smallest the size letter's variants give, so
   both ends of the filter read a range by its lower bound: a cinema seating
   100 to 150 is not a building that seats 125. */
const capMin = c => Array.isArray(c) ? c[0] : c;
const hoodTag = hood => hoodCode(null, hood);
/* What the list is a list of. One of the three is always chosen: premises to
   rent, rival businesses to take over, or whole buildings on sale. */
const FINDER_SHOWS = [
  ["rent", "To rent", "Buildings the save marks as available for rent."],
  ["takeover", "To take over", "Rival businesses you can make an offer to in-game; the price is not in the save. Game services like banks and wholesalers are not for sale."],
  ["sale", "For sale", "Whole buildings the game offers for sale, cheapest first. Buying one is an investment, not an opening, so it is not scored."],
];
const finderDefaults = () => ({on:false, cat:"retail", type:"", show:"rent",
  hoods:null, minCap:0, maxCap:0, minTraffic:0, sort:"score"});
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
const FINDER_WHY = "Score = foot traffic × the neighbourhood's demand for the type ÷ 100. Both numbers are the game's own. Rent, rivals and capacity are shown but do not change the score; click a column to sort by it instead. Any type takes the neighbourhood's strongest type of the category.";

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
      const action = e.target.closest('[data-action]')?.dataset.action;
      if(action === 'in' || action === 'out') this.zoom(action === 'in' ? .65 : 1.5);
      if(action === 'reset') this.reset(true);
      if(action === 'full') this.toggleFullscreen();
      if(action === 'close') this.deselect();
      if(action === 'details'){
        e.preventDefault();
        if($('locationMapDialog').open) $('locationMapDialog').close();
        openSite(this.selected);
      }
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
    // in the map window and its filters in the panel.
    const head = this.panel ? `<div class="sechead map-head moff">
      <span class="layers" role="group" aria-label="Layers">
        <button type="button" class="sev lay mine" data-l="mine" aria-pressed="true" aria-label="Your businesses" data-tip="Your businesses. Click to hide them."><i></i><span class="n">0</span></button>
        <button type="button" class="sev lay own" data-l="own" aria-pressed="true" aria-label="Buildings you own" data-tip="Buildings you own, dashed blue on the map."><i></i><span class="n">0</span></button>
        <button type="button" class="sev lay home" data-l="home" aria-pressed="true" aria-label="Your homes" data-tip="Homes you rent, white on the map."><i></i><span class="n">0</span></button>
        <button type="button" class="sev lay fnd" data-l="fnd" aria-pressed="true" aria-label="Sites with a finding" data-tip="Sites with a finding from Today. Red is critical, amber is worth a look, grey is for information. The dots show once you zoom in."><i></i><span class="n">0</span></button>
        <button type="button" class="sev lay all off" data-l="all" aria-pressed="false" aria-label="Every address" data-tip="Every address in the city, as faint outlines. Off by default."><i></i><span class="n">${a.buildings.length}</span></button>
      </span>
      <span class="why" data-tip="The dots are layers: your businesses, buildings you own, homes you rent, sites with a finding, every address. Click one to switch it off; off is dimmed, never gone. Pick a place from the list or on the map and its card opens beside the building. Drag to pan, wheel to zoom."><i>?</i></span>
      <span class="aside"><label class="srch">${ICON.search}<input id="${id}-search" type="search" aria-label="Find a place" data-control="search" placeholder="Search" autocomplete="off"><span class="cnt mono" aria-live="polite"></span></label></span>
    </div>` : "";
    this.root.innerHTML = `${head}<div class="citymap${this.narrow ? " narrow" : ""}"><div class="stage" data-stage>
      <svg class="map-canvas" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="City map. Select a building or use the places list.">
      <defs><clipPath id="${clipId}"><rect class="map-region-clip" x="0" y="0" width="${a.viewBox[2]}" height="${a.viewBox[3]}"/></clipPath></defs><g clip-path="url(#${clipId})"><image class="map-detail-background" x="0" y="0" width="${a.viewBox[2]}" height="${a.viewBox[3]}" href="${a.imageUrl}"/><image class="map-fast-background" x="0" y="0" width="${a.viewBox[2]}" height="${a.viewBox[3]}" href="${a.previewUrl}"/>
      <g class="map-footprints">${a.buildings.map(b => `<path class="location fp" data-location="${mapText(b.key)}" d="${b.path}" fill-rule="evenodd"><title>${mapText(b.address)}</title></path>`).join('')}</g>
      <g class="map-pips"></g></g></svg>
      <div class="layer">${(a.districtLabels || []).map(l=>`<span class="dlabel" data-x="${l.anchor[0]}" data-y="${l.anchor[1]}">${mapText(l.label)}</span>`).join('')}
        <div class="shadow" aria-hidden="true"></div><div class="ball" aria-hidden="true"><i></i><u></u></div>
        <div class="site" role="region" aria-live="polite" hidden><span class="tail"></span><button type="button" class="x" aria-label="Close">${ICON.x}</button><h3></h3><div class="sub"></div><div class="nums"></div><div class="st" hidden></div><div class="facts" hidden></div><div class="fit" hidden></div><div class="finds2"></div><a class="go2" href="#detail" data-action="details" aria-label="Open business details"${this.panel ? ' data-tip="Open business details"' : ''}>${ICON.go}</a></div>
      </div>
      ${this.panel ? this.finderControls() : ""}
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
      this.list.addEventListener('mouseout', e => { const p = e.target.closest('[data-pick]'); if(p) this.light(null); });
    }
    this.buildToken++;
    this.wirePan();
    this.wireBall?.();
    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => {this.rect=null; if(!this.box) this.reset(); this.paintView();});
    this.citymap.addEventListener('fullscreenchange', () => { this.rect = null; if(this.selected) this.select(this.selected, true); else this.reset(); });
    this.resizeObserver.observe(this.svg);
    this.reset();
    if(typeof wireTips === "function") wireTips();
  }
  /* --- find a location ------------------------------------------------------
     The chip and its filters live in the map head; while the finder is on the
     layer chips and the search step aside (class moff) and the filters take
     their place (class fonly), both switched by CSS off .city-map.finder. */
  hoodList(){
    const P = premises(); if(!P) return [];
    return [...new Set(P.buildings.map(b => b.hood).filter(Boolean))].sort();
  }
  hoodOn(hood){ return !this.fs.hoods || this.fs.hoods.includes(hood); }
  /* The header carries the switch and nothing else; everything the finder asks
     for sits in the panel above its own results, so the section reads as one
     thing rather than as chrome scattered over the map. */
  finderControls(){
    if(!premises()) return "";
    return `<div class="fswitch"><button type="button" class="ibtn" data-f="tog" aria-pressed="false" aria-label="Find a location" data-tip="Find a location">${ICON.pin}</button></div>`;
  }
  /* Every control is the same chip: outlined when it is not chosen, filled when
     it is. Nothing is ever dimmed, so nothing reads as unavailable. */
  finderPanel(){
    const P = premises(); if(!P) return "";
    const row = (label, body) => `<div class="frow"><span class="lab">${label}</span>${body}</div>`;
    const kinds = FINDER_CATS.map(([c, label]) =>
      `<button type="button" class="fchip cat" data-cat="${c}" aria-pressed="false">${label}</button>`).join('');
    const hoods = this.hoodList().map(h =>
      `<button type="button" class="fchip hd" data-h="${attr(h)}" aria-pressed="true" data-tip="${attr(h)}">${mapText(hoodTag(h))}</button>`).join('');
    return `<div class="filters fonly">
      ${row('Kind', kinds)}
      ${row('Type', `<label class="fsel"><select data-f="type" aria-label="Business type"><option value="">Any type</option></select><i class="fchev">${ICON.chev}</i></label>`)}
      ${row('Show', FINDER_SHOWS.map(([key, label, tip]) =>
        `<button type="button" class="fchip show" data-show="${key}" aria-pressed="false" data-tip="${attr(tip)}">${label}<b>0</b></button>`).join('')
        + `<span class="why" tabindex="0" data-tip=""><i>?</i></span>`)}
      ${row('Where', hoods)}
      ${row('Cap', `<label class="fchip num">min<input type="number" min="0" data-f="minCap" value="0" aria-label="Smallest door cap"></label>
        <label class="fchip num">max<input type="number" min="0" data-f="maxCap" value="0" aria-label="Largest door cap"></label>`)}
      ${row('Traffic', `<label class="fchip num">min<input type="number" min="0" data-f="minTraffic" value="0" aria-label="Least foot traffic"></label>`)}
    </div>`;
  }
  wireFinder(){
    if(!premises() || !this.panel) return;
    const changed = () => { this.showAll = false; this.saveFinder(); this.update(); };
    this.root.querySelector('[data-f="tog"]').onclick = () => {
      this.fs.on = !this.fs.on; this.deselect(); changed();
    };
    this.root.querySelectorAll('.fchip.cat').forEach(chip => chip.onclick = () => {
      this.fs.cat = chip.dataset.cat; this.fs.type = "";
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
  }
  /* A warehouse has no score and no demand; every other category has both. A
     sort the new category cannot show falls back to the one it ranks by, so a
     header is always lit. */
  sortKeys(){ return this.fs.cat === 'warehouse' ? ['m2', 'traffic', 'cap', 'deposit'] : ['score', 'traffic', 'demand', 'cap', 'deposit']; }
  clampSort(){
    const keys = this.sortKeys();
    if(!keys.includes(this.fs.sort)) this.fs.sort = keys[0];
  }
  /* Every column reads best-first, so there is no ascending state to flip into:
     a second click on the column you are already sorted by puts the list back
     in the order the category ranks by. */
  sortBy(key){
    this.fs.sort = this.fs.sort === key ? this.sortKeys()[0] : key;
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
        hoods: Array.isArray(saved.hoods) ? saved.hoods : null,
        // Availability used to be two switches; a state saved then opens on
        // whichever list it was reading.
        show: saved.show || (saved.buy ? "takeover" : "rent")};
      delete this.fs.vac; delete this.fs.buy; delete this.fs.sale; delete this.fs.dir;
    }catch(e){}
    this.fs.on = false;   // the switch is never restored, only the filters
  }
  saveFinder(){
    const store = this.finderStore(); if(!store) return;
    // Opening the Map is opening the map: the finder is something you ask for,
    // so its switch is not remembered even though its filters are.
    const {on, ...filters} = this.fs;
    try{ localStorage.setItem(store, JSON.stringify(filters)); }catch(e){}
  }
  /* The plain map, whatever the last visit left on. */
  hideFinder(){
    if(!this.fs.on) return;
    this.fs.on = false; this.showAll = false; this.deselect(); this.update();
  }
  /* Opened from Today or a Growth cell: the finder comes on with a preset. */
  setFinder(preset = {}){
    this.loadFinder();
    // A preset is a fresh question, and Today's card advertises the vacant
    // count: it opens on vacant premises with no minimum in the way, whatever
    // the last visit left behind. Only the neighbourhoods come from the caller.
    this.fs = {...this.fs, on:true, show:'rent', minCap:0, maxCap:0, minTraffic:0, ...preset};
    // It also lands on the column the category ranks by, never on a stale sort.
    this.fs.sort = this.fs.cat === 'warehouse' ? 'm2' : 'score';
    this.saveFinder();
    this.selected = null; this.showAll = false;  // back to the 80-row cap
    this.ready.then(ok => { if(ok) this.update(); });
  }
  /* The type demand this row is scored on: the chosen type, or the strongest
     type of the category in that neighbourhood when "any type" is picked. */
  fitFor(b){
    const none = {demand:null, fit:null, slug:null, score:null, rivals:null, mine:null};
    const P = premises(); if(!P || this.fs.cat === 'warehouse') return none;
    const list = (P.demand[b.hood] || []).filter(d => d.category === this.fs.cat);
    const d = this.fs.type ? list.find(x => x.slug === this.fs.type)
      : list.reduce((best, x) => !best || x.demand > best.demand ? x : best, null);
    if(!d) return none;
    return {demand:d.demand, fit:d.type, slug:d.slug, score:Math.round(b.traffic * d.demand / 100),
      rivals:this.countHere(b.hood, d.slug, 'rival', b.key), mine:this.countHere(b.hood, d.slug, 'mine', b.key)};
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
      // Both ends judge a range by its smallest variant: a cinema seating 100
      // to 150 clears a minimum of 100 and fits under a maximum of 120, but a
      // building with no door cap at all can promise neither.
      const cap = capMin(b.cap);
      if(fs.minCap && (cap == null || cap < fs.minCap)) continue;
      if(fs.maxCap && (cap == null || cap > fs.maxCap)) continue;
      const loc = this.assets.byKey.get(b.key);
      out.push({key:b.key, address:b.address, hood:b.hood, bld:b, f:this.fitFor(b), region:loc?.region, bounds:loc?.bounds});
    }
    // A range sorts on the cap it can promise, the same bound the filter reads.
    const value = r => fs.sort === 'traffic' ? r.bld.traffic : fs.sort === 'demand' ? r.f.demand
      : fs.sort === 'cap' ? capMin(r.bld.cap) : fs.sort === 'deposit' ? r.bld.deposit
      : fs.sort === 'm2' ? r.bld.m2 : r.f.score;
    // A row with nothing to sort on stays at the bottom whichever way the
    // column points; it is not the smallest value, it is no value at all.
    out.sort((a, b) => {
      const x = value(a), y = value(b);
      if(x == null || y == null) return (x == null) - (y == null) || b.bld.traffic - a.bld.traffic;
      return (y - x) || b.bld.traffic - a.bld.traffic;
    });
    return out;
  }
  /* The rows carry their geometry like every other row, so a listing lights its
     own footprint and a click on either one selects it. */
  saleRows(){
    const P = premises(); if(!P) return [];
    return P.forSale.filter(s => this.hoodOn(s.hood)).sort((a, b) => a.price - b.price)
      .map(s => { const loc = this.assets.byKey.get(s.key); return {...s, region:loc?.region, bounds:loc?.bounds}; });
  }
  finderList(rows){
    const fs = this.fs, wh = fs.cat === 'warehouse';
    const cols = wh ? [["","#"],["",""],["","Address"],["m2","m²"],["traffic","Traffic"],["",""],["cap","Cap"],["deposit","Upfront"]]
                    : [["","#"],["",""],["","Address"],["score","Score"],["traffic","Traffic"],["demand","Demand"],["cap","Cap"],["deposit","Upfront"]];
    const head = `<div class="fhead">${cols.map(([key, label]) => key
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
      const what = b.status === 'rival' && b.occupant ? `${b.occupant.name} · ${b.occupant.type}`
        : f.fit && !fs.type ? `best fit: ${f.fit}` : `${b.m2.toLocaleString('en-US')} m² · cap ${capText(b.cap)}`;
      const sub = what + (f.rivals != null ? ` · ${f.rivals} rival${f.rivals === 1 ? '' : 's'}` : '');
      const numbers = wh
        ? `<span class="v sc sh"${lead(b.m2, SHADE_LEAD)}>${b.m2.toLocaleString('en-US')}</span><span class="v sh"${byTraffic(b.traffic, SHADE_SIDE)}>${b.traffic}</span><span class="v"></span>`
        : `<span class="v sc sh"${lead(f.score, SHADE_LEAD)}>${f.score ?? '—'}</span><span class="v sh"${byTraffic(b.traffic, SHADE_SIDE)}>${b.traffic}</span><span class="v sh"${byDemand(f.demand, SHADE_SIDE)}>${f.demand ?? '—'}</span>`;
      // The dot says what taking this place would mean: an empty floor to rent
      // or a rival to buy out.
      return `<button type="button" class="place fr${b.status === 'rival' ? ' buy' : ''}${r.key === this.selected ? ' on' : ''}" data-pick="${mapText(r.key)}" aria-pressed="${r.key === this.selected}"><span class="rk"><i></i>${i + 1}</span><span class="hood">${mapText(hoodTag(b.hood))}</span><span class="nm">${mapText(b.address)}<small>${mapText(sub)}</small></span>${numbers}<span class="v cap">${mapText(capText(b.cap))}</span><span class="v dep" data-tip="${attr(depositNote(b))}">${b.deposit != null ? mapText(fmt(b.deposit)) : '—'}</span></button>`;
    }).join('');
  }
  saleList(rows){
    return `<div class="fhead sale"><span></span><span>Address</span><span>Type</span><span>m²</span><span>Price</span></div>`
      + rows.map(s => `<button type="button" class="place fr sale${s.key === this.selected ? ' on' : ''}" data-pick="${mapText(s.key)}" aria-pressed="${s.key === this.selected}"><span class="hood">${mapText(hoodTag(s.hood))}</span><span class="nm">${mapText(s.address)}<small>${mapText(s.hood)}</small></span><span class="v t">${mapText(typeLabel(s.type))}</span><span class="v">${s.m2.toLocaleString('en-US')}</span><span class="v">${mapText(askingPrice(s.price))}</span></button>`).join('');
  }
  /* The facts every address carries, finder on or off: what the place is, what
     it would cost and whether it is free. */
  paintFacts(key){
    const card = this.card, st = card.querySelector('.st'), facts = card.querySelector('.facts'), fit = card.querySelector('.fit');
    const b = this.sites?.get(key);
    st.hidden = facts.hidden = fit.hidden = true;
    if(!b) return;
    st.hidden = facts.hidden = false;
    st.className = `st ${b.status === 'rival' ? 'rival' : b.status === 'mine' ? 'mine' : b.status === 'vacant' ? 'vacant' : 'na'}`;
    st.innerHTML = `<i></i>${mapText(finderStatus(b))}`;
    facts.innerHTML = `<span>${mapText(`${typeLabel(b.type)} ${b.size || ''}`.trim())}<b>${b.m2.toLocaleString('en-US')} m²</b></span>`
      + `<span>Foot traffic<b>${b.traffic}</b></span>`
      + `<span>Door cap<b>${mapText(capText(b.cap))}</b></span>`
      + `<span>Est. rent / day<b>${b.rent != null ? mapText(fmt(b.rent)) : '—'}</b></span>`
      + `<span>Deposit<b>${b.deposit != null ? mapText(fmt(b.deposit)) : '—'}</b></span>`;
    // Only a candidate reads as one: your own shop keeps its business numbers.
    if(!this.finderOn() || this.saleView() || b.type !== this.fs.cat || !this.candidate(b)) return;
    const f = this.fitFor(b);
    fit.hidden = false;
    fit.innerHTML = f.fit
      ? `<b>${mapText(f.fit)}</b> · demand ${f.demand} · ${plural(f.rivals, 'rival')}${f.mine ? ` · ${f.mine} of yours` : ''} in ${mapText(b.hood)}`
      : 'No demand reading for this category here.';
    const num = (v, lab, cls = "") => `<div class="num"><b class="mono${cls}">${v}</b><span>${lab}</span></div>`;
    card.querySelector('.nums').innerHTML = f.score != null
      ? num(f.score, 'score', ' sc') + num(b.traffic, 'traffic') + num(f.demand, 'demand')
      : num(b.m2.toLocaleString('en-US'), 'm²') + num(b.traffic, 'traffic');
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
    const types = new Map();
    Object.values(P.demand).forEach(list => list.forEach(d => { if(d.category === this.fs.cat) types.set(d.slug, d.type); }));
    const options = [...types].sort((a, b) => a[1].localeCompare(b[1]));
    if(this.fs.type && !types.has(this.fs.type)) this.fs.type = "";
    select.innerHTML = `<option value="">Any type</option>` + options.map(([slug, label]) =>
      `<option value="${attr(slug)}"${slug === this.fs.type ? ' selected' : ''}>${mapText(label)}</option>`).join('');
    select.disabled = !options.length;
    select.closest('.fsel').classList.toggle('on', !!this.fs.type);
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
    this.root.querySelectorAll('.fchip.show').forEach(chip => {
      const key = chip.dataset.show;
      chip.querySelector('b').textContent = key === 'sale' ? P.forSale.length : counts[key];
      mark(chip, this.fs.show === key);
    });
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
    return q ? rows.filter(r => `${r.address} ${r.hood || ''} ${r.business?.name || ''} ${r.business?.type || ''}`.toLowerCase().includes(q)) : rows;
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
    this.loadFinder(); this.paintControls();
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
      const all = this.matches;
      const some = this.showAll ? all : all.slice(0, 80);
      this.list.innerHTML = (this.saleView() ? this.saleList(some) : this.finderList(some))
        + (all.length > some.length ? `<button type="button" class="more" data-more aria-label="Show the remaining places">+${all.length - some.length}</button>` : '')
        + (all.length ? '' : '<div class="empty">Nothing matches.</div>');
      if(focusedKey) [...this.list.children].find(b=>b.dataset.pick===focusedKey)?.focus({preventScroll:true});
      this.list.scrollTop=listScroll;
    }
    this.fillCard(); this.paintView();
  }
  /* The card beside the picked footprint: name, one identity line, three mono
     numbers, the findings as dot + verb + amount, and the arrow to the site. */
  fillCard(){
    const card = this.card; if(!card) return;
    const key = this.selected, b = this.businesses.get(key), loc = this.assets.byKey.get(key), owned = this.owned.get(key), home = this.homes.get(key);
    if(!key){ card.hidden = true; card.classList.remove('in'); this.paintFacts(null); return; }
    // Filled now, shown by showCard() once the camera has settled: until then
    // it stays out of the tab order and out of the live region.
    const trading = b && b.status !== 'vacant';
    const title = owned && (!b || b.status === 'vacant') ? owned.address : b?.name || home?.address || loc?.address || owned?.address || 'Location unavailable';
    card.querySelector('h3').textContent = title.replace(/^\[\w+\]\s*/, '');
    const sub = b ? `${mapText(b.address)} · ${mapText(b.type)}` : owned ? `Owned building${owned.purchaseDay != null ? ` · bought day ${mapText(owned.purchaseDay)}` : ''}` : home ? `Home${loc?.hood ? ` · ${mapText(loc.hood)}` : ''}`
      // The title is already the address; a bare location adds its neighbourhood.
      : mapText(loc?.hood || loc?.address || '');
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
    card.querySelector('.go2').hidden = !b;
    this.paintFacts(key);
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
      const box = [cx - (free*.44)/s, cy - (r.height/2)/s, r.width/s, r.height/s];
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
    if(this.orb) this.orb.size = 170;
    if(this.svg){ if(this.search) this.search.value=''; this.layers = {mine:true, own:true, home:true, fnd:true, all:false};
      this.root.querySelectorAll('.lay').forEach(c => { c.classList.toggle('off', !this.layers[c.dataset.l]); c.setAttribute('aria-pressed', String(this.layers[c.dataset.l])); });
      this.reset(); this.update(); }
  }
}
function showCityMap(){
  // A fresh view starts plain; one that is already here is put back to plain,
  // because the Map tab is the map. openFinder() switches it on afterwards.
  if(!cityMapPage) cityMapPage=new CityMapView($('cityMapPage'));
  else { cityMapPage.hideFinder(); cityMapPage.paintView(); }
}
/* Today's card and a Growth cell both open the map with the finder on and a
   category, a type and a neighbourhood already chosen. */
function openFinder(preset = {}){
  if(!premises()) return;
  showPage("map");
  showCityMap();
  cityMapPage.setFinder(preset);
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
    const address = b?.address || (D?.ownedBuildings || []).find(o => o.key === key)?.address || '';
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
