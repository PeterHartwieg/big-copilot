const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {spawnSync} = require('node:child_process');
const {chromium} = require('playwright');
const root = path.join(__dirname, '..');
const geometry = JSON.parse(fs.readFileSync(path.join(root,'web/maps/locations.json')));
const place = geometry.buildings.find(b=>b.key==='ba:street_fifthavenue#57');
const other = geometry.buildings.find(b=>b.region==='industry-city' && b.path);
const property = geometry.buildings.find(b=>b.key==='ba:street_harborstreet#5');
const edge = geometry.buildings.find(b=>b.key==='ba:street_fifthavenue#1'); // far east side
let browser,server,url,html;
before(async()=>{
  const rendered=spawnSync(process.env.PYTHON || 'python',['-c','from ba_dashboard import render; import sys; sys.stdout.buffer.write(render(None).encode("utf-8"))'],{cwd:root,maxBuffer:4*1024*1024});
  assert.equal(rendered.status,0,rendered.stderr.toString());html=rendered.stdout;
  server=http.createServer((req,res)=>{
    const route=req.url.split('?')[0];
    const files={'/maps/locations.json':['locations.json','application/json'],'/maps/map-background.svg':['map-background.svg','image/svg+xml']};
    if(files[route]){res.setHeader('Content-Type',files[route][1]);res.end(fs.readFileSync(path.join(root,'web/maps',files[route][0])));}
    else {res.setHeader('Content-Type','text/html');res.end(html);}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));url=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL});
});
after(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve));});
async function fixture(width=1280, media=null){
  const page=await browser.newPage({viewport:{width,height:960}});const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  if(media) await page.emulateMedia(media);
  await page.route('https://**',r=>r.abort());
  await page.goto(url);
  await page.evaluate(({place,other})=>{
    const business=(p,name)=>({key:p.key,name,address:p.address,neighbourhood:p.hood,code:'',type:'Shop',typeSlug:'shop',
      profit:100,rent:40,lines:[],crew:[],people:[],basket:null,margin:null,customers:30,revenue:120,status:'open',
      series:[{profit:80},{profit:120}]});
    D={meta:{character:'map-a',day:190},businesses:[business(place,'Test shop'),business(other,'Industrial shop')],
      alerts:[{siteKey:place.key,level:'critical',text:'Check staffing',id:'map-alert'}],minor:{rows:[]},supply:{shops:[]},daily:[]};
    refreshCityMaps();
  },{place,other});
  return {page,errors};
}
async function ready(page,selector='#cityMapPage'){
  await page.locator(selector+' .map-canvas').waitFor();
  await page.waitForFunction(selector=>document.querySelector(selector+' .map-canvas')?.getAttribute('viewBox'),selector);
}
async function openPage(page){ await page.evaluate(()=>showPage('map')); await ready(page); }
/* The plain map has no list, so a pick is the map's own select(). */
async function pickRow(page,key,view='#cityMapPage'){
  await page.evaluate(({key,view})=>(view==='#cityMapPage'?cityMapPage:cityMapOverlay).select(key),{key,view});
  await page.locator(`${view} .site.in`).waitFor();
}
const matchKeys=page=>page.evaluate(()=>cityMapPage.matches.map(m=>m.key));
const viewBox = async (page,view='#cityMapPage') =>
  (await page.locator(`${view} .map-canvas`).getAttribute('viewBox')).split(' ').map(Number);
/* A screen point over bare map: no footprint, no chrome, no ball, no card. */
async function emptySpot(page){
  return page.evaluate(()=>{
    const stage=document.querySelector('#cityMapPage [data-stage]').getBoundingClientRect();
    const avoid=[...document.querySelectorAll('#cityMapPage .places, #cityMapPage .zoomer, #cityMapPage .layer .ball, #cityMapPage .site')]
      .map(el=>el.getBoundingClientRect());
    for(let gx=.08;gx<=.92;gx+=.06)for(let gy=.08;gy<=.92;gy+=.06){
      const x=stage.left+stage.width*gx,y=stage.top+stage.height*gy;
      if(avoid.some(a=>x>a.left-4&&x<a.right+4&&y>a.top-4&&y<a.bottom+4))continue;
      const el=document.elementFromPoint(x,y);
      if(el&&el.closest('.map-canvas')&&!el.closest('[data-location]'))return{x,y};
    }
    return null;
  });
}
/* A screen point that hits the footprint itself (a path can be a union of
   shapes whose bounding-box centre is bare map). */
async function onPath(page,key){
  return page.evaluate(key=>{
    const path=document.querySelector(`#cityMapPage path[data-location="${key}"]`);
    if(!path)return null;
    const r=path.getBoundingClientRect();
    for(let i=0;i<=12;i++)for(let j=0;j<=12;j++){
      const x=r.left+r.width*i/12,y=r.top+r.height*j/12;
      if(document.elementFromPoint(x,y)===path)return{x,y};
    }
    return null;
  },key);
}

test('lazy map retains geometry through searches and shares the load with the location overlay',async()=>{
  const {page,errors}=await fixture();const requests=[];
  page.on('request',r=>{if(r.url().includes('/maps/'))requests.push(r.url());});
  try{
    assert.equal(requests.length,0);
    await openPage(page);
    assert.equal(await page.locator('#cityMapPage .location.fp').count(),883);
    assert.equal(await page.locator('#cityMapPage .location.fp.mine').count(),2);
    await page.evaluate(()=>window.firstMapPath=document.querySelector('#cityMapPage .location'));
    await page.locator('#cityMapPage [data-control="search"]').fill('does not exist');
    assert.equal(await page.locator('#cityMapPage .srch .cnt').textContent(),'0');
    await page.locator('#cityMapPage [data-control="search"]').fill('Test');
    // The footprints survive a search; only their classes are redrawn.
    assert.equal(await page.evaluate(()=>firstMapPath===document.querySelector('#cityMapPage .location')),true);
    await pickRow(page,place.key);
    assert.equal(await page.locator('#cityMapPage .location.fp.sel').getAttribute('data-location'),place.key);
    await page.evaluate(key=>openLocationMap(key),other.key);await ready(page,'#cityMapOverlay');
    assert.equal(await page.locator('#cityMapOverlay .location.fp.sel').getAttribute('data-location'),other.key);
    assert.equal(await page.evaluate(()=>cityMapPage.assets===cityMapOverlay.assets),true);
    assert.equal(requests.length,2);
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});
test('a building shortcut in a finding and in a supply summary does not trigger either parent',async()=>{
  const {page,errors}=await fixture();
  try{
    await page.evaluate(()=>{
      D.supply={factories:{character:'map-a'}};
      const host=document.createElement('div');host.id='reference';
      const b=D.businesses[0];
      host.innerHTML=findingRow({siteKey:b.key,site:b.name,id:'a',level:'critical',group:'staff',text:'No staff assigned'})+supplyLocation('test',0,1,'Contents');
      window.parentClicks=0;host.querySelector('.find').onclick=()=>parentClicks++;
      document.body.append(host);
    });
    await page.locator('#reference .find .map-shortcut').click();await ready(page,'#cityMapOverlay');
    assert.equal(await page.evaluate(()=>parentClicks),0);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#locationMapDialog').evaluate(d=>d.open),false);
    const before=await page.locator('#reference details').getAttribute('open');
    await page.locator('#reference summary .map-shortcut').click();
    assert.equal(await page.locator('#reference details').getAttribute('open'),before);
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});
test('map shortcut in a site row opens a focused dialog without opening the row; Escape restores focus',async()=>{
  const {page,errors}=await fixture();
  try{
    await page.evaluate(()=>{
      const row=document.createElement('div');row.id='reference';row.innerHTML=siteLabel(D.businesses[0]);
      window.rowOpened=false;row.onclick=()=>window.rowOpened=true;document.body.append(row);
    });
    const button=page.locator('#reference .map-shortcut');await button.click();await ready(page,'#cityMapOverlay');
    assert.equal(await page.evaluate(()=>rowOpened),false);
    assert.equal(await page.evaluate(()=>location.hash),'');
    // The camera glides onto the requested building; the card opens on arrival.
    await page.locator('#cityMapOverlay .site.in').waitFor();
    assert.equal(await page.locator('#cityMapOverlay [data-stage]').evaluate(e=>e.classList.contains('zoomed')),true);
    const vb=await viewBox(page,'#cityMapOverlay');
    assert.ok(place.anchor[0]>=vb[0]&&place.anchor[0]<=vb[0]+vb[2]);
    assert.ok(place.anchor[1]>=vb[1]&&place.anchor[1]<=vb[1]+vb[3]);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#locationMapDialog').evaluate(d=>d.open),false);
    assert.equal(await button.evaluate(b=>document.activeElement===b),true);
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});
test('refresh changes the card, missing addresses stay escaped, and a character change clears the selection',async()=>{
  const {page,errors}=await fixture();
  try{
    await openPage(page);
    await pickRow(page,place.key);
    assert.match(await page.locator('#cityMapPage .site').innerText(),/Check staffing/);
    await page.evaluate(()=>{
      D={...D,alerts:[],businesses:[...D.businesses,{key:'modded#99',name:'New <img src=x onerror=alert(1)>',address:'99 New Street',type:'Shop'}]};refreshCityMaps();
    });
    assert.doesNotMatch(await page.locator('#cityMapPage .site').innerText(),/Check staffing/);
    await pickRow(page,'modded#99');
    assert.match(await page.locator('#cityMapPage .site').innerText(),/no map position/);
    assert.equal(await page.locator('#cityMapPage .site img').count(),0);
    await page.evaluate(()=>{D={...D,meta:{character:'map-b',day:1},businesses:[]};refreshCityMaps();});
    assert.equal(await page.locator('#cityMapPage .location.fp.sel').count(),0);
    assert.equal(await page.locator('#cityMapPage [data-control="search"]').inputValue(),'');
    assert.equal(await page.locator('#cityMapPage .srch .cnt').textContent(),'0');
    await page.locator('#cityMapPage .lay[data-l="all"]').click();
    assert.equal(await page.locator('#cityMapPage .srch .cnt').textContent(),'883');
    // A new character closes an open shortcut dialog with the rest of the state.
    await page.evaluate(key=>openLocationMap(key),place.key);
    assert.equal(await page.locator('#locationMapDialog').evaluate(d=>d.open),true);
    await page.evaluate(()=>{D={...D,meta:{character:'map-c',day:2},businesses:[]};refreshCityMaps();});
    assert.equal(await page.locator('#locationMapDialog').evaluate(d=>d.open),false);
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});
test('failed map load offers a working retry',async()=>{
  const {page,errors}=await fixture();let failed=false;
  try{
    await page.route('**/maps/locations.json?*',r=>{if(!failed){failed=true;return r.fulfill({status:503,body:'Unavailable'});}return r.continue();});
    await page.evaluate(()=>showPage('map'));
    await page.getByRole('button',{name:'Retry map'}).click();await ready(page);
    assert.equal(await page.locator('#cityMapPage .location.fp').count(),883);
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});

test('dragging the map cannot select text or accidentally select a building',async()=>{
  const {page,errors}=await fixture();
  try{
    await openPage(page);
    const stage=page.locator('#cityMapPage [data-stage]');
    assert.equal(await stage.evaluate(e=>getComputedStyle(e).userSelect),'none');
    const start=await page.evaluate(anchor=>{
      const svg=document.querySelector('#cityMapPage .map-canvas');
      const p=new DOMPoint(...anchor).matrixTransform(svg.getScreenCTM());
      return {x:p.x,y:p.y};
    },place.anchor);
    await page.mouse.move(start.x,start.y);
    const before=await page.locator('#cityMapPage .map-canvas').getAttribute('viewBox');
    await page.mouse.down();
    // Each movement is less than a pixel; the total still constitutes a drag.
    await page.mouse.move(start.x+8,start.y+5,{steps:20});
    assert.equal(await stage.evaluate(e=>e.classList.contains('interacting')),true);
    await page.mouse.up();
    assert.notEqual(await page.locator('#cityMapPage .map-canvas').getAttribute('viewBox'),before);
    assert.equal(await page.evaluate(()=>getSelection().toString()),'');
    assert.equal(await page.locator('#cityMapPage .location.fp.sel').count(),0);
    await page.waitForFunction(()=>!document.querySelector('#cityMapPage [data-stage]').classList.contains('interacting'));
    assert.equal(await page.locator('#cityMapPage .map-detail-background').isVisible(),true);
    assert.equal(await page.locator('#cityMapPage .map-fast-background').isVisible(),false);
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});

test('the map head keeps five layer chips, a why mark, search with a count, and zoom inside the stage',async()=>{
  const {page,errors}=await fixture();
  try{
    await openPage(page);
    assert.equal(await page.locator('#cityMapPage .map-head .lay').count(),5);
    // Each layer names itself beside its count, rather than behind the ?.
    assert.deepEqual(await page.$$eval('#cityMapPage .map-head .lay',ls=>ls.map(l=>l.innerText.replace(/\s+/g,' ').trim())),
      ['Mine 2','Owned 0','Homes 0','Findings 1','All 883']);
    assert.equal(await page.locator('#cityMapPage .map-head .why').count(),1);
    assert.equal(await page.locator('#cityMapPage .srch input[data-control="search"]').count(),1);
    assert.equal(await page.locator('#cityMapPage [data-stage] .zoomer .ibtn[data-action="in"]').count(),1);
    assert.equal(await page.locator('#cityMapPage [data-stage] .zoomer .ibtn[data-action="out"]').count(),1);
    assert.equal(await page.locator('#cityMapPage [data-stage] .zoomer .ibtn[data-action="reset"]').count(),1);
    assert.equal(await page.locator('#cityMapPage .map-marker, #cityMapPage .map-caption, #cityMapPage .map-status').count(),0);
    const inside=await page.evaluate(()=>{
      const s=document.querySelector('#cityMapPage [data-stage]').getBoundingClientRect();
      const z=document.querySelector('#cityMapPage .zoomer').getBoundingClientRect();
      return z.left>=s.left&&z.right<=s.right&&z.top>=s.top&&z.bottom<=s.bottom;
    });
    assert.equal(inside,true);
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});

test('layers add up and dim rather than remove',async()=>{
  const {page,errors}=await fixture();
  try{
    await page.evaluate(prop=>{
      D.ownedBuildings=[{key:prop.key,address:prop.address,purchaseDay:156,purchasePrice:18250000}];
      showPage('map');
    },property);await ready(page);
    // The chip counters describe the layers, not the current list.
    assert.equal(await page.locator('#cityMapPage .lay[data-l="mine"] .n').textContent(),'2');
    assert.equal(await page.locator('#cityMapPage .lay[data-l="own"] .n').textContent(),'1');
    assert.equal(await page.locator('#cityMapPage .lay[data-l="fnd"] .n').textContent(),'1');
    assert.equal(await page.locator('#cityMapPage .lay[data-l="all"] .n').textContent(),'883');
    assert.equal(await page.locator('#cityMapPage .lay[data-l="all"].off').count(),1);
    assert.equal(await page.locator('#cityMapPage .lay[data-l="all"]').getAttribute('aria-pressed'),'false');
    assert.equal(await page.locator('#cityMapPage [data-stage].all').count(),0);
    // Three rows: two businesses plus the owned property.
    assert.equal(await page.locator('#cityMapPage .srch .cnt').textContent(),'3');
    // Switching mine off keeps the finding row and the owned row...
    await page.locator('#cityMapPage .lay[data-l="mine"]').click();
    assert.equal(await page.locator('#cityMapPage .lay[data-l="mine"].off').count(),1);
    assert.equal(await page.locator('#cityMapPage .lay[data-l="mine"]').getAttribute('aria-pressed'),'false');
    assert.equal(await page.locator('#cityMapPage .srch .cnt').textContent(),'2');
    const kept=await matchKeys(page);
    assert.equal(kept.includes(place.key),true);
    assert.equal(kept.includes(property.key),true);
    assert.equal(kept.includes(other.key),false);
    // ...and dims the orphaned footprint instead of deleting it.
    assert.equal(await page.locator('#cityMapPage .location.fp.mine').count(),2);
    assert.equal(await page.locator('#cityMapPage .location.fp.mine.dim').count(),1);
    assert.equal(await page.locator('#cityMapPage .location.fp.mine:not(.dim)').getAttribute('data-location'),place.key);
    assert.equal(await page.locator('#cityMapPage .location.fp.owned').count(),1);
    // Every address: on top of the rest, so nothing stays dim.
    await page.locator('#cityMapPage .lay[data-l="all"]').click();
    assert.equal(await page.locator('#cityMapPage .lay[data-l="all"].off').count(),0);
    assert.equal(await page.locator('#cityMapPage .lay[data-l="all"]').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#cityMapPage [data-stage].all').count(),1);
    assert.equal(await page.locator('#cityMapPage .location.fp.dim').count(),0);
    assert.equal(await page.locator('#cityMapPage .srch .cnt').textContent(),'883');
    // No list to fill: the plain map is the map, and the panel belongs to the finder.
    assert.equal(await page.locator('#cityMapPage .places').isVisible(),false);
    assert.equal(await page.locator('#cityMapPage [data-stage].panel').count(),0);
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});

test('search lights what it finds on the map itself, and Enter takes the first',async()=>{
  const {page,errors}=await fixture();
  const search=()=>page.locator('#cityMapPage [data-control="search"]');
  try{
    await openPage(page);
    await search().fill('Test');
    assert.equal(await page.locator('#cityMapPage .srch .cnt').textContent(),'1');
    // No list: the match is lit on the map and everything else is dimmed.
    assert.equal(await page.locator('#cityMapPage .location.fp.hot').count(),1);
    assert.equal(await page.locator('#cityMapPage .location.fp.hot').getAttribute('data-location'),place.key);
    assert.equal(await page.locator('#cityMapPage .location.fp.dim').count(),882);
    await search().press('Enter');
    await page.locator('#cityMapPage .site.in').waitFor();
    assert.equal(await page.locator('#cityMapPage .location.fp.sel').getAttribute('data-location'),place.key);
    await search().fill('does not exist');
    assert.equal(await page.locator('#cityMapPage .srch .cnt').textContent(),'0');
    assert.equal(await page.locator('#cityMapPage .location.fp.hot').count(),0);
    assert.equal(await page.locator('#cityMapPage .location.fp.dim').count(),882);  // the pick stays lit
    await search().fill('');
    assert.equal(await page.locator('#cityMapPage .srch .cnt').textContent(),'2');
    assert.equal(await page.locator('#cityMapPage .location.fp.hot').count(),0);
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});

test('finding dots appear only when zoomed and the fnd switch clears them',async()=>{
  const {page,errors}=await fixture();
  try{
    await openPage(page);
    // At the city view the dots exist but stay hidden.
    assert.equal(await page.locator('#cityMapPage .map-pips .pip.crit').count(),1);
    assert.equal(await page.locator('#cityMapPage .map-pips .pip.crit').evaluate(c=>getComputedStyle(c).display),'none');
    assert.notEqual(await page.locator('#cityMapPage .dlabel').first().evaluate(l=>getComputedStyle(l).opacity),'0');
    await pickRow(page,place.key);
    assert.equal(await page.locator('#cityMapPage [data-stage].zoomed').count(),1);
    assert.equal(await page.locator('#cityMapPage .map-pips .pip.crit').evaluate(c=>getComputedStyle(c).display),'inline');
    const center=await page.locator('#cityMapPage .map-pips .pip.crit').evaluate(c=>({x:+c.getAttribute('cx'),y:+c.getAttribute('cy')}));
    assert.ok(Math.abs(center.x-(place.bounds[0]+place.bounds[2]/2))<.2);
    assert.ok(Math.abs(center.y-(place.bounds[1]+place.bounds[3]/2))<.2);
    // Labels give way to the close view.
    assert.equal(await page.locator('#cityMapPage .dlabel').first().evaluate(l=>getComputedStyle(l).opacity),'0');
    await page.locator('#cityMapPage .lay[data-l="fnd"]').click();
    assert.equal(await page.locator('#cityMapPage .map-pips circle').count(),0);
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});

test('the card opens beside the picked footprint, inside the stage, and closes from the map',async()=>{
  const {page,errors}=await fixture();
  try{
    await openPage(page);
    await page.evaluate(b=>{
      D.businesses=[...D.businesses,{key:b.key,name:'Edge shop',address:b.address,neighbourhood:b.hood,code:'',type:'Shop',typeSlug:'shop',
        profit:100,rent:40,lines:[],crew:[],people:[],basket:null,margin:null,customers:30,revenue:120,status:'open',
        series:[{profit:80},{profit:120}]}];
      refreshCityMaps();
    },edge);
    await pickRow(page,place.key);
    const card=page.locator('#cityMapPage .site');
    assert.equal(await card.locator('h3').innerText(),'Test shop');
    assert.equal(await card.locator('.sub .hood').count(),1);
    assert.equal(await card.locator('.nums .num').count(),3);
    assert.equal(await card.locator('.finds2 .f.crit').count(),1);
    assert.match(await card.locator('.finds2').innerText(),/Check staffing/);
    const clear=await page.evaluate(()=>{
      const c=document.querySelector('#cityMapPage .site').getBoundingClientRect();
      const p=document.querySelector('#cityMapPage [data-stage]').getBoundingClientRect();
      return c.right<=p.right-11||document.querySelector('#cityMapPage .site').classList.contains('flip');
    });
    assert.equal(clear,true);
    // A second pick moves the card; it stays inside the stage.
    await pickRow(page,other.key);
    assert.equal(await card.locator('h3').innerText(),'Industrial shop');
    assert.equal(await card.evaluate(c=>c.classList.contains('flip')),false);
    const clear2=await page.evaluate(()=>{
      const c=document.querySelector('#cityMapPage .site').getBoundingClientRect();
      const p=document.querySelector('#cityMapPage [data-stage]').getBoundingClientRect();
      return c.right<=p.right-11;
    });
    assert.equal(clear2,true);
    // A footprint picked at the city view glides in like a shortcut; the card stays inside the stage.
    await page.locator('#cityMapPage .zoomer [data-action="reset"]').click();
    await page.waitForFunction(()=>{const s=document.querySelector('#cityMapPage [data-stage]');
      return !s.classList.contains('zoomed')&&!s.classList.contains('interacting')&&cityMapPage.goal===null;},null,{timeout:3000});
    const at=await onPath(page,edge.key);
    assert.ok(at,'no clickable point on the east footprint');
    await page.mouse.click(at.x,at.y);
    await page.waitForFunction(()=>document.querySelector('#cityMapPage .site h3')?.textContent==='Edge shop',null,{timeout:3000});
    await page.locator('#cityMapPage .site.in').waitFor();
    assert.equal(await page.evaluate(()=>document.querySelector('#cityMapPage [data-stage]').classList.contains('zoomed')),true);
    const clear3=await page.evaluate(()=>{
      const c=document.querySelector('#cityMapPage .site').getBoundingClientRect();
      const p=document.querySelector('#cityMapPage [data-stage]').getBoundingClientRect();
      return c.right<=p.right-11;
    });
    assert.equal(clear3,true);
    assert.equal(await card.locator('h3').innerText(),'Edge shop');
    // The arrow opens the site page. (The section fades in, so read textContent.)
    await page.locator('#cityMapPage .site .go2').click();
    assert.equal(await page.locator('#secDetail').evaluate(s=>!s.hidden),true);
    assert.match(await page.locator('#sitePanel').textContent(),/Edge shop/);
    await page.evaluate(()=>showPage('map'));await ready(page);
    // The x button closes.
    await pickRow(page,place.key);
    await page.locator('#cityMapPage .site .x').click();
    assert.equal(await card.evaluate(c=>c.hidden),true);
    assert.equal(await card.evaluate(c=>c.classList.contains('in')),false);
    assert.equal(await page.locator('#cityMapPage .location.fp.sel').count(),0);
    // So does a still click on empty map.
    await pickRow(page,place.key);
    const spot=await emptySpot(page);
    assert.ok(spot,'no empty map point found');
    await page.mouse.click(spot.x,spot.y);
    assert.equal(await card.evaluate(c=>c.hidden),true);
    assert.equal(await page.locator('#cityMapPage .location.fp.sel').count(),0);
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});

test('selecting results and resetting the camera keep the count and the selection',async()=>{
  const {page,errors}=await fixture();
  try{
    await openPage(page);
    await pickRow(page,place.key);
    await pickRow(page,other.key);
    assert.equal(await page.locator('#cityMapPage .location.fp.sel').getAttribute('data-location'),other.key);
    assert.equal(await page.locator('#cityMapPage .srch .cnt').textContent(),'2');
    await page.locator('#cityMapPage .zoomer [data-action="reset"]').click();
    await page.waitForFunction(()=>{const s=document.querySelector('#cityMapPage [data-stage]');
      return !s.classList.contains('zoomed')&&cityMapPage.goal===null;},null,{timeout:3000});
    // Reset is the whole city; the list and the selection are untouched.
    assert.equal(await page.locator('#cityMapPage [data-stage].zoomed').count(),0);
    const wide=await viewBox(page);
    assert.ok(wide[2]>1600,`expected the whole city, got ${wide[2]}`);
    assert.equal(await page.locator('#cityMapPage .location.fp.sel').getAttribute('data-location'),other.key);
    assert.equal(await page.locator('#cityMapPage .srch .cnt').textContent(),'2');
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});

test('the ball sits inside Central Park at every zoom',async t=>{
  const {page,errors}=await fixture();
  try{
    await openPage(page);
    if(!await page.locator('#cityMapPage .layer .ball').count())return t.skip('the map ball is not in this checkout');
    assert.equal(await page.locator('#cityMapPage .layer .shadow').count(),1);
    // The ball rect converted back to map units: it lives in the park and is
    // exactly orb-size however close the camera is.
    const probe=async()=>{
      // The camera moves synchronously, the ball repaints a frame later.
      await page.waitForFunction(()=>{
        const v=cityMapPage,b=document.querySelector('#cityMapPage .layer .ball').getBoundingClientRect();
        return Math.abs(b.width-170*v.scale())<=1;
      },null,{timeout:2000});
      return page.evaluate(()=>{
        const v=cityMapPage,b=document.querySelector('#cityMapPage .layer .ball').getBoundingClientRect();
        const tl=v.point({clientX:b.left,clientY:b.top}),br=v.point({clientX:b.right,clientY:b.bottom});
        return {left:tl.x,top:tl.y,right:br.x,bottom:br.y,px:b.width,scale:v.scale()};
      });
    };
    const inside=b=>{
      assert.ok(b.left>=791&&b.right<=973&&b.top>=452&&b.bottom<=634,`outside the park: ${JSON.stringify(b)}`);
      assert.ok(Math.abs(b.px-170*b.scale)<=1,`width ${b.px} vs ${170*b.scale}`);
    };
    let b=await probe();inside(b);
    await page.locator('#cityMapPage .zoomer [data-action="in"]').click();
    await page.locator('#cityMapPage .zoomer [data-action="in"]').click();
    b=await probe();inside(b);
    assert.ok(b.scale>1.1,`two + clicks should zoom in, scale ${b.scale}`);
    await pickRow(page,other.key);
    b=await probe();inside(b);
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});

test('clicking the ball swallows the masthead balls',async t=>{
  const {page,errors}=await fixture();
  try{
    await openPage(page);
    if(!await page.locator('#cityMapPage .layer .ball').count())return t.skip('the map ball is not in this checkout');
    // A bare board never boots, so the sphere is wired by hand, as elsewhere.
    await page.evaluate(()=>{ $('title').textContent='Big Copilot'; wireSphere(); });
    try{await page.waitForSelector('.orb.live',{timeout:5000});}
    catch{return t.skip('the masthead never produced a live ball');}
    if(await page.evaluate(()=>typeof window.__consumeBalls!=='function'))return t.skip('window.__consumeBalls is not in this checkout');
    // The masthead ball finishes its entrance first; the hook refuses while it is busy.
    await page.waitForTimeout(2000);
    const before=await page.evaluate(()=>document.querySelector('#cityMapPage .layer .ball').getBoundingClientRect().width);
    await page.evaluate(()=>document.querySelector('#cityMapPage .layer .ball').click());
    await page.waitForFunction(()=>document.querySelectorAll('.orb').length===0,null,{timeout:2500});
    await page.waitForFunction(w=>document.querySelector('#cityMapPage .layer .ball').getBoundingClientRect().width>w,before,{timeout:2500});
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});

test('clicking the ball with nothing to swallow pays out coins',async t=>{
  const {page,errors}=await fixture();
  try{
    await openPage(page);
    if(!await page.locator('#cityMapPage .layer .ball').count())return t.skip('the map ball is not in this checkout');
    // No orb on the shelf and nothing that can be swallowed: the ball spins and pays out.
    await page.evaluate(()=>{document.querySelectorAll('.orb').forEach(o=>o.remove());delete window.__consumeBalls;});
    await page.evaluate(()=>document.querySelector('#cityMapPage .layer .ball').click());
    await page.waitForFunction(()=>document.querySelectorAll('body > .coin').length>0,null,{timeout:2000});
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});

test('the shortcut dialog shows no head or panel, titles the place, and closes cleanly',async()=>{
  const {page,errors}=await fixture();
  try{
    await page.evaluate(b=>{D.businesses[1].name='[HK] Industrial shop';},other);
    await page.evaluate(key=>openLocationMap(key),other.key);await ready(page,'#cityMapOverlay');
    assert.equal(await page.locator('#locationMapDialog .map-head').count(),0);
    assert.equal(await page.locator('#cityMapOverlay .places').count(),0);
    assert.equal(await page.locator('#cityMapOverlay [data-stage].panel').count(),0);
    assert.equal(await page.locator('#locationMapTitle').innerText(),'Industrial shop · 10 Eighth Avenue');
    await page.locator('#cityMapOverlay .site.in').waitFor();
    assert.equal(await page.locator('#cityMapOverlay .site h3').innerText(),'Industrial shop');
    // The card's arrow opens the site page and takes the dialog with it.
    await page.locator('#cityMapOverlay .site .go2').click();
    assert.equal(await page.locator('#locationMapDialog').evaluate(d=>d.open),false);
    assert.equal(await page.locator('#secDetail').evaluate(s=>!s.hidden),true);
    // Reopening retitles; the close button works.
    await page.evaluate(key=>openLocationMap(key),other.key);
    assert.equal(await page.locator('#locationMapTitle').innerText(),'Industrial shop · 10 Eighth Avenue');
    await page.locator('#closeLocationMap').click();
    assert.equal(await page.locator('#locationMapDialog').evaluate(d=>d.open),false);
    // The close event tidies up a tick later.
    await page.waitForFunction(()=>!document.body.classList.contains('map-modal-open'),null,{timeout:2000});
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#locationMapDialog').evaluate(d=>d.open),false);
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});

test('chips, search and card stay readable in the light scheme',async()=>{
  const styles=async media=>{
    const {page,errors}=await fixture(1280,media);
    try{
      await openPage(page);
      await pickRow(page,place.key);
      const read=await page.evaluate(()=>{
        const cs=e=>getComputedStyle(e);
        const stage=document.querySelector('#cityMapPage [data-stage]'),card=document.querySelector('#cityMapPage .site'),
          chip=document.querySelector('#cityMapPage .sev.lay.mine'),search=document.querySelector('#cityMapPage .srch');
        return {stage:cs(stage).borderColor,card:cs(card).backgroundColor,chip:cs(chip).color,
          searchInk:cs(search).color,headInk:cs(card.querySelector('h3')).color,
          ok:cs(card).backgroundColor!==cs(card.querySelector('h3')).color};
      });
      assert.deepEqual(errors,[]);
      return read;
    }finally{await page.close();}
  };
  const dark=await styles({colorScheme:'dark'});
  const light=await styles({colorScheme:'light'});
  for(const k of ['stage','card','chip','searchInk','headInk'])assert.notEqual(dark[k],light[k],k);
  assert.equal(dark.ok,true,'dark unreadable');
  assert.equal(light.ok,true,'light unreadable');
});

test('under reduced motion the pick lands without waiting',async()=>{
  const {page,errors}=await fixture(1280,{reducedMotion:'reduce'});
  try{
    await openPage(page);
    await page.evaluate(key=>cityMapPage.select(key),place.key);
    // No glide: the card and the camera are in place by the next frame.
    await page.locator('#cityMapPage .site.in').waitFor({timeout:500});
    await page.waitForFunction(()=>document.querySelector('#cityMapPage [data-stage]').classList.contains('zoomed'),null,{timeout:1000});
    const view=await viewBox(page);
    assert.ok(place.anchor[0]>=view[0]&&place.anchor[0]<=view[0]+view[2]);
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});

test('on a narrow screen the zoomer and the card stay inside the stage',async()=>{
  const {page,errors}=await fixture(375);
  try{
    await openPage(page);
    assert.equal(await page.locator('#cityMapPage .places').isVisible(),false);
    const inside=await page.evaluate(()=>{
      const rect=(el,host)=>{const a=el.getBoundingClientRect(),b=host.getBoundingClientRect();
        return a.left>=b.left-1&&a.right<=b.right+1&&a.top>=b.top-1&&a.bottom<=b.bottom+1;};
      return rect(document.querySelector('#cityMapPage .zoomer'),document.querySelector('#cityMapPage [data-stage]'));
    });
    assert.equal(inside,true);
    // The named layer chips wrap inside the page rather than widening it.
    assert.equal(await page.evaluate(()=>{
      const w=document.documentElement.clientWidth;
      return [...document.querySelectorAll('#cityMapPage .map-head .lay')].every(l=>l.getBoundingClientRect().right<=w+1)
        &&document.documentElement.scrollWidth<=innerWidth;
    }),true);
    await page.evaluate(key=>cityMapPage.select(key),place.key);
    await page.locator('#cityMapPage .site.in').waitFor();
    assert.equal(await page.evaluate(()=>{
      const c=document.querySelector('#cityMapPage .site').getBoundingClientRect();
      const s=document.querySelector('#cityMapPage [data-stage]').getBoundingClientRect();
      return c.left>=s.left-1&&c.right<=s.right+1&&c.top>=s.top-1&&c.bottom<=s.bottom+1;
    }),true);
    // The dialog keeps the narrow viewport too.
    await page.evaluate(key=>openLocationMap(key),place.key);await ready(page,'#cityMapOverlay');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    const fits=await page.evaluate(()=>{
      const d=document.getElementById('locationMapDialog').getBoundingClientRect();
      return d.left>=0&&d.right<=innerWidth;
    });
    assert.equal(fits,true);
    assert.equal(await page.locator('#locationMapDialog').evaluate(d=>d.scrollWidth<=d.clientWidth),true);
    const before=await page.locator('#cityMapOverlay .map-canvas').getAttribute('viewBox');
    await page.locator('#cityMapOverlay .zoomer [data-action="in"]').click();
    await page.waitForFunction(before=>document.querySelector('#cityMapOverlay .map-canvas').getAttribute('viewBox')!==before,before);
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});

test('finding map buttons remain visible beside long business names',async()=>{
  const {page,errors}=await fixture();
  try{
    await page.evaluate(()=>{
      const b=D.businesses[0];b.name='[HK] Z-Clothing Factory and Warehouse';b.code='HK';
      $('pageToday').innerHTML=findingRow({siteKey:b.key,id:'long-name',level:'critical',group:'staff',text:'Check staffing'});
    });
    const button=page.locator('#pageToday .find .map-shortcut');
    const bounds=await button.evaluate(b=>({button:b.getBoundingClientRect().toJSON(),parent:b.parentElement.getBoundingClientRect().toJSON()}));
    assert.ok(bounds.button.right<=bounds.parent.right && bounds.button.left>=bounds.parent.left);
    await button.click();await ready(page,'#cityMapOverlay');
    assert.equal(await page.locator('#cityMapOverlay .location.fp.sel').getAttribute('data-location'),place.key);
    // The card speaks the name without the pill.
    await page.locator('#cityMapOverlay .site.in').waitFor();
    assert.equal(await page.locator('#cityMapOverlay .site h3').innerText(),'Z-Clothing Factory and Warehouse');
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});

test('weekly rhythm tooltip keeps off-peak business references as plain text',async()=>{
  const {page,errors}=await fixture();
  try{
    const tip=await page.evaluate(()=>{
      const b=D.businesses[0];D.businesses=Array.from({length:8},(_,i)=>({...b,key:b.key+'-'+i,name:'Shop '+i,rhythm:[],peakDay:i===7?'Tuesday':'Monday',swing:20}));
      D.rhythm={};drawRhythm();return $('rhythmHead').querySelector('.why').dataset.tip;
    });
    assert.match(tip,/Shop 7/);assert.doesNotMatch(tip,/<button|<svg|data-map-key/);
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});

test('owned vacant property is carded under its address rather than Vacant lease',async()=>{
  const {page,errors}=await fixture();
  try{
    await page.evaluate(()=>{
      const b=D.businesses[0];b.name='Vacant lease';b.status='vacant';
      D.ownedBuildings=[{key:b.key,address:b.address,purchaseDay:156,purchasePrice:100000},
        {key:'ba:street_harborstreet#5',address:'5 Harbor Street',purchaseDay:156,purchasePrice:18250000}];
      showPage('map');
    });await ready(page);
    // Both owned rows are listed; the one without a business wears the owned tag.
    assert.equal(await page.locator('#cityMapPage .location.fp.owned').count(),1);
    assert.equal((await matchKeys(page)).includes(property.key),true);
    await pickRow(page,property.key);
    assert.equal(await page.locator('#cityMapPage .site h3').innerText(),property.address);
    assert.match(await page.locator('#cityMapPage .site .sub').innerText(),/Owned building · bought day 156/);
    assert.equal(await page.locator('#cityMapPage .site .go2').evaluate(g=>g.hidden),true);
    assert.match(await page.locator('#cityMapPage .site .nums').innerText(),/\$18\.3M/);
    // A vacant business you own keeps its address too, never the lease name.
    await pickRow(page,place.key);
    assert.equal(await page.locator('#cityMapPage .site h3').innerText(),place.address);
    assert.doesNotMatch(await page.locator('#cityMapPage .site').innerText(),/Vacant lease/);
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});

test('a rented home is its own layer: white footprint, counted, and a card with the rent',async()=>{
  const {page,errors}=await fixture();
  try{
    const home=geometry.buildings.find(b=>b.key==='ba:street_tenthstreet#2' && b.path) || geometry.buildings.find(b=>b.region==='mainland' && b.path && b.key!==place.key);
    await openPage(page);
    await page.evaluate(h=>{ D.homes=[{key:h.key,address:h.address,rent:34}]; refreshCityMaps(); },home);
    assert.equal(await page.locator('#cityMapPage .sev.lay.home .n').innerText(),'1');
    assert.equal(await page.locator(`#cityMapPage .fp.home[data-location="${home.key}"]`).count(),1);
    assert.equal((await matchKeys(page)).includes(home.key),true);
    await pickRow(page,home.key);
    const card=page.locator('#cityMapPage .site');
    assert.equal(await card.locator('h3').innerText(),home.address);
    assert.match(await card.locator('.sub').innerText(),/Home/);
    assert.equal(await card.locator('.nums .num').count(),1);
    assert.match(await card.locator('.nums').innerText(),/\$34/);
    // "its page" is the only way into a flat's panel besides its name: it is
    // in no picker. Both go to the flat's own address.
    assert.equal(await card.locator('.go2').isHidden(),false);
    assert.equal(await card.locator('.go2').innerText(),'its page');
    const address=await page.evaluate(k=>siteHref(k),home.key);
    assert.match(address,/^#site\/[a-z0-9-]+$/);
    assert.equal(await card.locator('.go2').getAttribute('href'),address);
    assert.equal(await card.locator('h3 a.ss-sl').getAttribute('href'),address);
    await card.locator('.go2').click();
    assert.equal(await page.locator('#secDetail').evaluate(s=>!s.hidden),true);
    assert.equal(await page.locator('#sitePanel .sp-house').count(),1);
    assert.equal(await page.evaluate(()=>location.hash),address,'the flat opens at its address');
    const panel=await page.locator('#sitePanel').textContent();
    assert.match(panel,new RegExp(home.address.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
    assert.deepEqual(await page.$$eval('#sitePanel .sp-hometiles .sstat .lab',ls=>ls.map(l=>l.textContent)),
      ['Rent / day','Rent / week','Size','Per m²']);
    // $34 a day is $238 a week; the flat is in no picker and in no portfolio row.
    assert.match(panel,/\$34/);assert.match(panel,/\$238/);
    assert.equal(await page.locator('#sitePanel #sitePick').count(),0);
    await page.evaluate(()=>{closeSite();showPage('map');});await ready(page);
    // The same arrow in the dialog map, which closes behind it.
    await page.evaluate(key=>openLocationMap(key),home.key);await ready(page,'#cityMapOverlay');
    await page.locator('#cityMapOverlay .site.in').waitFor();
    await page.locator('#cityMapOverlay .site .go2').click();
    assert.equal(await page.locator('#locationMapDialog').evaluate(d=>d.open),false);
    assert.equal(await page.locator('#secDetail').evaluate(s=>!s.hidden),true);
    assert.equal(await page.locator('#sitePanel .sp-house').count(),1);
    await page.evaluate(()=>{closeSite();showPage('map');});await ready(page);
    await pickRow(page,home.key);
    await page.locator('#cityMapPage .sev.lay.home').click();
    assert.equal((await matchKeys(page)).includes(home.key),false);
    assert.equal(await page.locator('#cityMapPage .sev.lay.home').getAttribute('aria-pressed'),'false');
    assert.deepEqual(errors,[]);
  } finally { await page.close(); }
});

test("the home panel's map pin titles the dialog with the flat's address",async()=>{
  // The head of a home carries the same map shortcut every site head does, so a
  // home key reaches openLocationMap(), which used to name a business or an
  // owned building and nothing else.
  const {page,errors}=await fixture();
  try{
    const home=geometry.buildings.find(b=>b.key==='ba:street_tenthstreet#2' && b.path) || geometry.buildings.find(b=>b.region==='mainland' && b.path && b.key!==place.key);
    await page.evaluate(h=>{
      D.homes=[{key:h.key,address:h.address,rent:34,m:96,hood:"Hell's Kitchen"}];
      refreshCityMaps();showPage('company');openSite(h.key,false);
    },home);
    assert.equal(await page.locator('#sitePanel .sp-house').count(),1);
    await page.locator('#sitePanel .sitehead .map-shortcut').click();
    await ready(page,'#cityMapOverlay');
    assert.equal(await page.locator('#locationMapDialog').evaluate(d=>d.open),true);
    assert.equal(await page.locator('#locationMapTitle').innerText(),home.address);
    await page.keyboard.press('Escape');
    assert.deepEqual(errors,[]);
  } finally { await page.close(); }
});
