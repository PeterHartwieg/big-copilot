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
ICON.home = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"></path></svg>';
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
/* A place with no business still gets a tag: the neighbourhood's initials. */
const hoodCode = (b, hood) => b?.code || String(hood || "").split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
const PANEL_W = 316;   // the floating places panel plus its margin
const PICK_ZOOM = 2.6; // how far in a pick goes, relative to the whole city
const GLIDE_MS = 700;

class CityMapView {
  /* options.panel: the page shows chips, search and the places panel; the
     shortcut dialog shows the stage and the card only. */
  constructor(root, options = {}){
    this.root = root; this.selected = null; this.box = null; this.hot = null;
    this.panel = options.panel !== false;
    this.layers = {mine:true, own:true, fnd:true, all:false}; this.query = "";
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
      if(e.target.closest('[data-more]')){ this.showAll = true; this.update(); return; }
      const action = e.target.closest('[data-action]')?.dataset.action;
      if(action === 'in' || action === 'out') this.zoom(action === 'in' ? .65 : 1.5);
      if(action === 'reset') this.reset(true);
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
    const head = this.panel ? `<div class="sechead map-head">
      <span class="layers" role="group" aria-label="Layers">
        <button type="button" class="sev lay mine" data-l="mine" aria-pressed="true" aria-label="Your businesses" data-tip="Your businesses. Click to hide them."><i></i><span class="n">0</span></button>
        <button type="button" class="sev lay own" data-l="own" aria-pressed="true" aria-label="Buildings you own" data-tip="Buildings you own, dashed blue on the map."><i></i><span class="n">0</span></button>
        <button type="button" class="sev lay fnd" data-l="fnd" aria-pressed="true" aria-label="Sites with a finding" data-tip="Sites with a finding from Today. Red is critical, amber is worth a look, grey is for information. The dots show once you zoom in."><i></i><span class="n">0</span></button>
        <button type="button" class="sev lay all off" data-l="all" aria-pressed="false" aria-label="Every address" data-tip="Every address in the city, as faint outlines. Off by default."><i></i><span class="n">${a.buildings.length}</span></button>
      </span>
      <span class="why" data-tip="The dots are layers: your businesses, buildings you own, sites with a finding, every address. Click one to switch it off; off is dimmed, never gone. Pick a place from the list or on the map and its card opens beside the building. Drag to pan, wheel to zoom."><i>?</i></span>
      <span class="aside"><label class="srch">${ICON.search}<input id="${id}-search" type="search" aria-label="Find a place" data-control="search" placeholder="Search" autocomplete="off"><span class="cnt mono" aria-live="polite"></span></label></span>
    </div>` : "";
    this.root.innerHTML = `${head}<div class="citymap${this.narrow ? " narrow" : ""}"><div class="stage${this.panel ? " panel" : ""}" data-stage>
      <svg class="map-canvas" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="City map. Select a building or use the places list.">
      <defs><clipPath id="${clipId}"><rect class="map-region-clip" x="0" y="0" width="${a.viewBox[2]}" height="${a.viewBox[3]}"/></clipPath></defs><g clip-path="url(#${clipId})"><image class="map-detail-background" x="0" y="0" width="${a.viewBox[2]}" height="${a.viewBox[3]}" href="${a.imageUrl}"/><image class="map-fast-background" x="0" y="0" width="${a.viewBox[2]}" height="${a.viewBox[3]}" href="${a.previewUrl}"/>
      <g class="map-footprints">${a.buildings.map(b => `<path class="location fp" data-location="${mapText(b.key)}" d="${b.path}" fill-rule="evenodd"><title>${mapText(b.address)}</title></path>`).join('')}</g>
      <g class="map-pips"></g></g></svg>
      <div class="layer">${(a.districtLabels || []).map(l=>`<span class="dlabel" data-x="${l.anchor[0]}" data-y="${l.anchor[1]}">${mapText(l.label)}</span>`).join('')}
        <div class="shadow" aria-hidden="true"></div><div class="ball" aria-hidden="true"><i></i><u></u></div>
        <div class="site" role="region" aria-live="polite" hidden><span class="tail"></span><button type="button" class="x" aria-label="Close">${ICON.x}</button><h3></h3><div class="sub"></div><div class="nums"></div><div class="finds2"></div><a class="go2" href="#detail" data-action="details" aria-label="Open business details"${this.panel ? ' data-tip="Open business details"' : ''}>${ICON.go}</a></div>
      </div>
      <div class="zoomer" role="group" aria-label="Map zoom"><button type="button" class="ibtn" data-action="in" aria-label="Zoom in">+</button><button type="button" class="ibtn" data-action="out" aria-label="Zoom out">−</button><button type="button" class="ibtn" data-action="reset" aria-label="Whole city"${this.panel ? ' data-tip="Whole city"' : ''}>${ICON.home}</button></div>
    </div>${this.panel ? `<aside class="places" aria-label="Matching places"><div class="list"></div></aside>` : ""}</div>`;
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
    if(this.search) this.search.oninput = () => { this.query = this.search.value; this.showAll = false; this.update(); };
    this.root.querySelectorAll('.lay').forEach(chip => chip.onclick = () => {
      const l = chip.dataset.l; this.layers[l] = !this.layers[l]; this.showAll = false;
      chip.classList.toggle('off', !this.layers[l]); chip.setAttribute('aria-pressed', String(this.layers[l]));
      this.update();
    });
    this.card.querySelector('.x').dataset.action = 'close';
    if(this.list){
      this.list.addEventListener('mouseover', e => { const p = e.target.closest('[data-pick]'); if(p) this.light(p.dataset.pick); });
      this.list.addEventListener('mouseout', e => { const p = e.target.closest('[data-pick]'); if(p) this.light(null); });
    }
    this.buildToken++;
    this.wirePan();
    this.wireBall?.();
    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => {this.rect=null; if(!this.box) this.reset(); this.paintView();});
    this.resizeObserver.observe(this.svg);
    this.reset();
    if(typeof wireTips === "function") wireTips();
  }
  /* The camera: a viewBox with the stage's aspect, so nothing letterboxes. */
  stageRect(){ return this.rect || (this.rect=this.svg.getBoundingClientRect()); }
  hasPanel(){ return this.panel && !this.narrow; }
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
    if(this.layers.all) this.assets.buildings.forEach(b => add({key:b.key, address:b.address, hood:b.hood, business:this.businesses.get(b.key), region:b.region, bounds:b.bounds}));
    const q = this.query.trim().toLowerCase();
    return q ? rows.filter(r => `${r.address} ${r.hood || ''} ${r.business?.name || ''} ${r.business?.type || ''}`.toLowerCase().includes(q)) : rows;
  }
  update(){
    if(!this.svg) return;
    this.businesses = mapBusinesses(); this.findings = mapFindings();
    this.owned = new Map((D?.ownedBuildings || []).map(b=>[b.key,b]));
    const counts = {mine:this.businesses.size, own:this.owned.size, fnd:[...this.businesses.keys()].filter(k => this.findings.has(k)).length, all:this.assets.buildings.length};
    this.root.querySelectorAll('.lay').forEach(chip => { chip.querySelector('.n').textContent = counts[chip.dataset.l]; });
    this.matches = this.rows();
    const keys = new Set(this.matches.map(b=>b.key));
    this.stage.classList.toggle('all', this.layers.all);
    this.paths.forEach((path,key) => {
      const business = this.businesses.has(key), owned = this.owned.has(key);
      path.classList.toggle('mine', business);
      path.classList.toggle('owned', !business && owned);
      path.classList.toggle('dim', !keys.has(key) && key!==this.selected);
      path.classList.toggle('sel', key===this.selected);
      path.querySelector('title').textContent=[this.businesses.get(key)?.name,this.assets.byKey.get(key).address].filter(Boolean).join(' · ');
    });
    // Finding dots at the footprint centres; the stage shows them once zoomed in.
    this.pips.innerHTML = this.layers.fnd ? [...this.findings.keys()].filter(k => keys.has(k) && this.assets.byKey.get(k)?.bounds).map(k => {
      const [x,y,w,h] = this.assets.byKey.get(k).bounds;
      return `<circle class="pip ${mapKind(this.findings.get(k))}" cx="${(x+w/2).toFixed(1)}" cy="${(y+h/2).toFixed(1)}" r="4"></circle>`;
    }).join('') : '';
    if(this.list){
      const focusedKey=this.list.contains(document.activeElement)?document.activeElement.dataset.pick:null, listScroll=this.list.scrollTop;
      const shown = this.showAll ? this.matches : this.matches.slice(0, 80);
      this.list.innerHTML = shown.map(r => {
        const b = r.business, trading = b && b.status !== 'vacant', kind = mapKind(this.findings.get(r.key));
        const name = b ? b.name.replace(/^\[\w+\]\s*/, '') : r.address;
        const small = b ? `${r.address} · ${b.type}${this.owned.has(r.key) ? ' · owned' : ''}` : r.owned ? `${r.hood || ''} · owned` : r.hood || '';
        const amt = trading ? `<span class="amt ${b.profit >= 0 ? 'pos' : 'neg'}">${mapText(fmt(b.profit || 0))}</span>` : '<span class="amt"></span>';
        return `<button type="button" class="place ${kind}${r.key===this.selected ? ' on' : ''}" data-pick="${mapText(r.key)}" aria-pressed="${r.key===this.selected}"><i class="mark"></i><span class="hood">${mapText(hoodCode(b, r.hood))}</span><span class="nm">${mapText(name)}<small>${mapText(small)}${!r.region ? ' · no map position' : ''}</small></span>${amt}</button>`;
      }).join('') + (this.matches.length > shown.length ? `<button type="button" class="more" data-more aria-label="Show the remaining places">+${this.matches.length - shown.length}</button>` : '') + (this.matches.length ? '' : '<div class="empty">Nothing here.</div>');
      if(focusedKey) [...this.list.children].find(b=>b.dataset.pick===focusedKey)?.focus({preventScroll:true});
      this.list.scrollTop=listScroll;
      const cnt = this.root.querySelector('.srch .cnt'); if(cnt) cnt.textContent = this.matches.length;
    }
    this.fillCard(); this.paintView();
  }
  /* The card beside the picked footprint: name, one identity line, three mono
     numbers, the findings as dot + verb + amount, and the arrow to the site. */
  fillCard(){
    const card = this.card; if(!card) return;
    const key = this.selected, b = this.businesses.get(key), loc = this.assets.byKey.get(key), owned = this.owned.get(key);
    if(!key){ card.hidden = true; card.classList.remove('in'); return; }
    // Filled now, shown by showCard() once the camera has settled: until then
    // it stays out of the tab order and out of the live region.
    const trading = b && b.status !== 'vacant';
    const title = owned && (!b || b.status === 'vacant') ? owned.address : b?.name || loc?.address || owned?.address || 'Location unavailable';
    card.querySelector('h3').textContent = title.replace(/^\[\w+\]\s*/, '');
    const sub = b ? `${mapText(b.address)} · ${mapText(b.type)}` : owned ? `Owned building${owned.purchaseDay != null ? ` · bought day ${mapText(owned.purchaseDay)}` : ''}` : mapText([loc?.address, loc?.hood].filter(Boolean).join(' · '));
    card.querySelector('.sub').innerHTML = `<span class="hood">${mapText(hoodCode(b, loc?.hood || b?.neighbourhood))}</span><span>${sub}${!loc ? ' · no map position' : ''}</span>`;
    const num = (v, lab) => `<div class="num"><b class="mono">${v}</b><span>${lab}</span></div>`;
    card.querySelector('.nums').innerHTML = trading
      ? num(`<span class="${(b.profit || 0) >= 0 ? 'pos' : 'neg'}">${mapText(fmt(b.profit || 0))}</span>`, 'yesterday') + num(mapText(fmt(b.rent || 0)), 'rent / day') + num(mapText(b.staff ?? '—'), 'staff')
      : b ? num(mapText(fmt(b.rent || 0)), 'rent / day') + num('—', 'not trading')
      : owned ? num(owned.purchasePrice != null ? mapText(money(owned.purchasePrice)) : '—', 'paid') : '';
    const findings = this.findings.get(key) || [];
    const f = card.querySelector('.finds2');
    f.innerHTML = findings.map(a => `<div class="f ${mapKind([a])}"><i></i><span>${mapText(splitFinding(a).what)}<span class="fa">${findingAmount(a)}</span></span></div>`).join('');
    f.hidden = !findings.length;
    card.querySelector('.go2').hidden = !b;
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
    if(this.orb) this.orb.size = 170;
    if(this.svg){ if(this.search) this.search.value=''; this.layers = {mine:true, own:true, fnd:true, all:false};
      this.root.querySelectorAll('.lay').forEach(c => { c.classList.toggle('off', !this.layers[c.dataset.l]); c.setAttribute('aria-pressed', String(this.layers[c.dataset.l])); });
      this.reset(); this.update(); }
  }
}
function showCityMap(){
  if(!cityMapPage) cityMapPage=new CityMapView($('cityMapPage')); else cityMapPage.paintView();
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
