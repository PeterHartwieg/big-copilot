/* Shared city viewer. This file is embedded by render() into the shared script.
   Geometry and the decoded background are loaded once for page and modal views. */
const MAP_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16"></path><circle cx="12" cy="10" r="2"></circle></svg>';
ICON.map = MAP_ICON;
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

class CityMapView {
  constructor(root){
    this.root = root; this.selected = null; this.region = "world"; this.box = null;
    this.root.classList.add("city-map"); this.root.dataset.mobileView = "map";
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
    const a = this.assets;
    const clipId = `${this.root.id}-clip`;
    this.root.innerHTML = `<div class="map-toolbar">
      <div class="field"><input id="${this.root.id}-search" aria-label="Find a place" type="search" data-control="search" placeholder="Business name or address" autocomplete="off"></div>
      <div class="field"><select id="${this.root.id}-region" aria-label="Area" data-control="region"><option value="world">All regions</option>${a.regions.map(r => `<option value="${r.id}">${mapText(r.label)}</option>`).join('')}</select></div>
      <div class="field"><select id="${this.root.id}-filter" aria-label="Show" data-control="filter"><option value="mine">My businesses</option><option value="owned">Buildings I own</option><option value="issues">With issues</option><option value="all">All addresses</option></select></div>
      <div class="field"><select id="${this.root.id}-type" aria-label="Business type" data-control="type"><option value="">All types</option></select></div>
      <button class="btn2" data-action="reset">Reset</button>
      </div><div class="map-mobile-tabs"><button class="btn2" data-action="map" aria-pressed="true">Map</button><button class="btn2" data-action="list" aria-pressed="false">List</button></div>
      <div class="map-layout"><div class="map-stage"><svg class="map-canvas" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="City map. Select a building or use the places list.">
      <defs><clipPath id="${clipId}"><rect class="map-region-clip"/></clipPath></defs><g clip-path="url(#${clipId})"><image class="map-detail-background" x="0" y="0" width="${a.viewBox[2]}" height="${a.viewBox[3]}" href="${a.imageUrl}"/><image class="map-fast-background" x="0" y="0" width="${a.viewBox[2]}" height="${a.viewBox[3]}" href="${a.previewUrl}"/>
      <g class="map-footprints">${a.buildings.map(b => `<path class="location" data-location="${mapText(b.key)}" d="${b.path}" fill-rule="evenodd"><title>${mapText(b.address)}</title></path>`).join('')}</g><g class="map-districts">${(a.districtLabels || []).map(l=>`<g data-x="${l.anchor[0]}" data-y="${l.anchor[1]}"><text text-anchor="middle">${mapText(l.label)}</text></g>`).join('')}</g></g></svg>
      <div class="map-zoom" role="group" aria-label="Map zoom"><button type="button" class="ibtn" data-action="in" aria-label="Zoom in">+</button><button type="button" class="ibtn" data-action="out" aria-label="Zoom out">−</button></div></div>
      <aside class="map-side"><div class="map-detail" aria-live="polite"></div><p class="map-count" role="status"></p><div class="map-results" aria-label="Matching places"></div></aside></div>`;
    this.svg = this.root.querySelector('.map-canvas');
    this.search = this.root.querySelector('[data-control="search"]');
    this.filter = this.root.querySelector('[data-control="filter"]');
    this.typeControl = this.root.querySelector('[data-control="type"]');
    this.regionControl = this.root.querySelector('[data-control="region"]');
    this.paths = new Map([...this.root.querySelectorAll('[data-location]')].map(p => [p.dataset.location,p]));
    this.stage = this.root.querySelector('.map-stage');
    this.clip = this.root.querySelector('.map-region-clip');
    this.districts = [...this.root.querySelectorAll('.map-districts g')];
    this.search.oninput = () => {this.selected=null;this.update();};
    this.filter.onchange = this.typeControl.onchange = () => {this.selected=null;this.update();};
    this.regionControl.onchange = () => { this.selected=null;this.region = this.regionControl.value; this.reset(); this.update(); };
    this.root.addEventListener('click', e => {
      const pick = e.target.closest('[data-pick]');
      if(pick){ this.select(pick.dataset.pick); return; }
      const action = e.target.closest('[data-action]')?.dataset.action;
      if(action === 'in' || action === 'out') this.zoom(action === 'in' ? .65 : 1.5);
      if(action === 'reset') this.reset();
      if(action === 'map' || action === 'list'){
        this.root.dataset.mobileView = action;
        this.root.querySelectorAll('.map-mobile-tabs button').forEach(b => b.setAttribute('aria-pressed',b.dataset.action === action));
      }
      if(action === 'details'){
        if($('locationMapDialog').open) $('locationMapDialog').close();
        openSite(this.selected);
      }
    });
    this.wirePan();
    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => {this.rect=null;this.paintView();});
    this.resizeObserver.observe(this.svg);
    this.reset();
  }
  reset(){
    this.box = [...(this.assets.regions.find(r => r.id === this.region)?.bounds || this.assets.viewBox)];
    this.paintView();
  }
  paintView(){
    if(!this.svg || !this.box || this.frame) return;
    this.frame=requestAnimationFrame(()=>{this.frame=null;this.drawView();});
  }
  drawView(){
    const rect = this.rect || (this.rect=this.svg.getBoundingClientRect());
    this.svg.setAttribute('viewBox',this.box.join(' '));
    const bounds=this.assets.regions.find(r=>r.id===this.region)?.bounds || this.assets.viewBox;
    if(this.clipRegion!==this.region){
      ['x','y','width','height'].forEach((k,i)=>this.clip.setAttribute(k,bounds[i]));
      this.clipRegion=this.region;
    }
    const scale = Math.min(rect.width / this.box[2], rect.height / this.box[3]);
    if(!scale) return;
    this.districts.forEach(g=>{
      g.setAttribute('transform',`translate(${g.dataset.x} ${g.dataset.y}) scale(${1/scale})`);
      g.style.display=this.box[2]<bounds[2]*.4 ? 'none' : '';
    });
  }
  point(e){
    const r=this.rect || (this.rect=this.svg.getBoundingClientRect()), [x,y,w,h]=this.box;
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
      e.preventDefault(); this.rect=this.svg.getBoundingClientRect();
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
      if(e.type==='pointerup' && !moved && down) this.select(down,false);
      moved = true;
      if(pointers.size) previous=midpoint(); else {
        this.dragging=false; this.svg.classList.remove('dragging'); this.endInteraction();
      }
    };
    this.svg.onpointerup = end; this.svg.onpointercancel = end; this.svg.onlostpointercapture = end;
    this.stage.onselectstart = this.svg.ondragstart = e=>e.preventDefault();
    this.svg.addEventListener('wheel', e => {e.preventDefault(); this.rect=this.svg.getBoundingClientRect(); this.zoom(Math.exp(Math.max(-1,Math.min(1,e.deltaY*.002))),this.point(e));},{passive:false});
  }
  update(){
    if(!this.svg) return;
    this.businesses = mapBusinesses(); this.findings = mapFindings();
    this.owned = new Map((D?.ownedBuildings || []).map(b=>[b.key,b]));
    this.typeControl.disabled = this.filter.value==='owned';
    if(this.typeControl.disabled) this.typeControl.value='';
    const types=[...new Set([...this.businesses.values()].map(b=>b.type).filter(Boolean))].sort();
    const type=this.typeControl.value;
    this.typeControl.innerHTML='<option value="">All types</option>'+types.map(t=>`<option value="${mapText(t)}">${mapText(t)}</option>`).join('');
    this.typeControl.value=types.includes(type)?type:'';
    const query = this.search.value.trim().toLowerCase();
    const show = this.filter.value;
    let rows = this.assets.buildings.map(b => ({...b,business:this.businesses.get(b.key)}));
    const known = new Set(rows.map(b=>b.key));
    for(const b of [...this.businesses.values(),...this.owned.values()]) if(!known.has(b.key)){
      rows.push({key:b.key,address:b.address,hood:b.neighbourhood,business:this.businesses.get(b.key)});known.add(b.key);
    }
    this.matches = rows.filter(b => (show==='all' || (show==='owned' ? this.owned.has(b.key) : show==='issues' ? this.findings.has(b.key) : b.business))
      && (!this.typeControl.value || b.business?.type===this.typeControl.value)
      && (this.region==='world' || b.region===this.region || !b.region)
      && `${b.address} ${b.hood || ''} ${b.business?.name || ''} ${b.business?.type || ''}`.toLowerCase().includes(query));
    const keys = new Set(this.matches.map(b=>b.key));
    this.paths.forEach((path,key) => {
      const visible = keys.has(key) || key===this.selected;
      path.style.display = visible ? '' : 'none';
      path.classList.toggle('mine',this.businesses.has(key));
      path.classList.toggle('owned',this.owned.has(key));
      path.classList.toggle('selected',key===this.selected);
      path.querySelector('title').textContent=[this.businesses.get(key)?.name,this.assets.byKey.get(key).address].filter(Boolean).join(' · ');
    });
    const list=this.root.querySelector('.map-results'), focusedKey=list.contains(document.activeElement)?document.activeElement.dataset.pick:null;
    const listScroll=list.scrollTop;
    list.innerHTML = this.matches.map(b=>`<button type="button" data-pick="${mapText(b.key)}" aria-pressed="${b.key===this.selected}">${mapText(show==='owned' ? b.address : b.business?.name || b.address)}<small>${mapText(b.business ? b.address+' · '+b.business.type : b.hood)}${this.owned.has(b.key)?' · Owned':''}${!b.region?' · Map position unavailable':''}</small></button>`).join('');
    if(focusedKey) [...list.children].find(b=>b.dataset.pick===focusedKey)?.focus({preventScroll:true});
    list.scrollTop=listScroll;
    this.root.querySelector('.map-count').textContent = `${this.matches.length} matching place${this.matches.length===1?'':'s'}${this.matches.length ? '' : '. Try another area, All addresses, or clear the search.'}`;

    this.detail(); this.paintView();
  }
  detail(){
    const host=this.root.querySelector('.map-detail'), b=this.businesses.get(this.selected), location=this.assets.byKey.get(this.selected), owned=this.owned.get(this.selected);
    if(!this.selected){host.innerHTML=`<h3>${mapText(this.filter.selectedOptions[0].text)}</h3><p>Select a footprint or a place in the list.</p>`;return;}
    const findings=this.findings.get(this.selected)||[];
    const title=owned && (!b || b.status==='vacant') ? owned.address : b?.name || location?.address || owned?.address || 'Location unavailable';
    host.innerHTML=`<h3>${mapText(title)}</h3><p>${mapText(b?.address || location?.address || owned?.address || this.selected)}</p><p>${mapText([b?.type,location?.hood || b?.neighbourhood].filter(Boolean).join(' · '))}</p>${!location?'<p>Map position unavailable for this address. The map has not been moved to a guessed location.</p>':!location.path?'<p>Centered on the entrance; no building footprint is available.</p>':''}${owned?`<p>Owned building${owned.purchaseDay!=null?' · Purchased on day '+mapText(owned.purchaseDay):''}${owned.purchasePrice!=null?'<br>Purchase price: '+mapText(fmt(owned.purchasePrice)):''}</p>`:''}${b?`<p>Yesterday’s profit: ${mapText(fmt(b.profit || 0))}<br>Daily rent: ${mapText(fmt(b.rent || 0))}</p>`:owned?'':'<p>Static address information. Rental availability and business eligibility are not shown.</p>'}${findings.length?`<ul>${findings.map(f=>`<li>${mapText(f.text)}</li>`).join('')}</ul>`:''}${b?'<div class="map-detail-actions"><button class="btn2" data-action="details">Open business details</button></div>':''}`;
  }
  async select(key, focus=true, fresh=false){
    this.selected=key;this.freshSelection=fresh;
    if(!await this.ready) return;
    if(this.selected!==key) return; // A newer selection or character superseded this request.
    if(fresh){
      // A shortcut is a new location request, independent of earlier searches.
      this.region='world';this.regionControl.value='world';
      this.search.value='';this.typeControl.value='';this.filter.value='all';
    }
    const b=this.assets.byKey.get(key);
    if(b && focus){
      // Moving the camera must not narrow the user's result list.
      const [x,y,w,h]=b.bounds, size=Math.max(110,w*4,h*4);
      this.box=[x+w/2-size/2,y+h/2-size/2,size,size];
    }
    this.update();
  }
  resetCharacter(){
    this.selected=null;this.region='world';
    if(this.svg){this.search.value='';this.filter.value='mine';this.typeControl.value='';this.regionControl.value=this.region;this.reset();this.update();}
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
  if(!cityMapOverlay) cityMapOverlay=new CityMapView($('cityMapOverlay'));
  cityMapOverlay.root.dataset.mobileView='map';
  cityMapOverlay.root.querySelectorAll('.map-mobile-tabs button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.action==='map'));
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
