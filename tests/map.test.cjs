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
async function fixture(width=1280){
  const page=await browser.newPage({viewport:{width,height:960}});const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**',r=>r.abort());
  await page.goto(url);
  await page.evaluate(({place,other})=>{
    const business=(p,name)=>({key:p.key,name,address:p.address,neighbourhood:p.hood,code:'',type:'Shop',typeSlug:'shop',profit:100,rent:40,lines:[]});
    D={meta:{character:'map-a',day:190},businesses:[business(place,'Test shop'),business(other,'Industrial shop')],
      alerts:[{siteKey:place.key,level:'critical',text:'Check staffing',id:'map-alert'}],minor:{rows:[]}};
    refreshCityMaps();
  },{place,other});
  return {page,errors};
}
async function ready(page,selector='#cityMapPage'){
  await page.locator(selector+' .map-canvas').waitFor();
  await page.waitForFunction(selector=>document.querySelector(selector+' .map-canvas')?.getAttribute('viewBox'),selector);
}
test('lazy map retains geometry through filters and shares the load with the location overlay',async()=>{
  const {page,errors}=await fixture();const requests=[];
  page.on('request',r=>{if(r.url().includes('/maps/'))requests.push(r.url());});
  try{
    assert.equal(requests.length,0);
    await page.click('#nav a[data-id="map"]');await ready(page);
    assert.equal(await page.locator('#cityMapPage .location').count(),883);
    assert.equal(await page.locator('#cityMapPage .location.mine').count(),2);
    await page.locator('#cityMapPage [data-control="filter"]').selectOption('issues');
    assert.equal(await page.locator('#cityMapPage .map-results button').count(),1);
    await page.evaluate(()=>window.firstMapPath=document.querySelector('#cityMapPage .location'));
    await page.locator('#cityMapPage [data-control="search"]').fill('does not exist');
    assert.match(await page.locator('#cityMapPage .map-count').textContent(),/^0 matching/);
    await page.locator('#cityMapPage [data-control="search"]').fill('Test');
    assert.equal(await page.evaluate(()=>firstMapPath===document.querySelector('#cityMapPage .location')),true);
    await page.locator('#cityMapPage .map-results button').click();
    assert.equal(await page.locator('#cityMapPage .map-results button').evaluate(b=>document.activeElement===b),true);
    assert.equal(await page.locator('#cityMapPage .location.selected').getAttribute('data-location'),place.key);
    await page.evaluate(key=>openLocationMap(key),other.key);await ready(page,'#cityMapOverlay');
    assert.equal(await page.locator('#cityMapOverlay [data-control="region"]').inputValue(),'world');
    assert.equal(await page.locator('#cityMapOverlay .location.selected').getAttribute('data-location'),other.key);
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
    const box=(await page.locator('#cityMapOverlay svg.map-canvas').getAttribute('viewBox')).split(' ').map(Number);
    assert.ok(box[2]<300);assert.ok(place.anchor[0]>=box[0]&&place.anchor[0]<=box[0]+box[2]);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#locationMapDialog').evaluate(d=>d.open),false);
    assert.equal(await button.evaluate(b=>document.activeElement===b),true);
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});
test('refresh changes issue details, missing addresses remain reachable, and character changes clear selection',async()=>{
  const {page,errors}=await fixture();
  try{
    await page.evaluate(()=>showPage('map'));await ready(page);
    await page.evaluate(key=>cityMapPage.select(key),place.key);
    await page.evaluate(()=>{
      D={...D,alerts:[],businesses:[...D.businesses,{key:'modded#99',name:'New <img src=x onerror=alert(1)>',address:'99 New Street',type:'Shop'}]};refreshCityMaps();
    });
    assert.doesNotMatch(await page.locator('#cityMapPage .map-detail').textContent(),/Check staffing/);
    await page.locator('#cityMapPage [data-pick="modded#99"]').click();
    assert.match(await page.locator('#cityMapPage .map-detail').innerText(),/Map position unavailable/);
    assert.equal(await page.locator('#cityMapPage .map-detail img').count(),0);
    await page.evaluate(()=>{D={...D,meta:{character:'map-b',day:1},businesses:[]};refreshCityMaps();});
    assert.equal(await page.locator('#cityMapPage .location.selected').count(),0);
    assert.match(await page.locator('#cityMapPage .map-count').textContent(),/0 matching/);
    await page.locator('#cityMapPage [data-control="filter"]').selectOption('all');
    assert.ok(await page.locator('#cityMapPage .map-results button').count()>500);
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});
test('map dialog fits a narrow viewport and exposes list selection and zoom controls',async()=>{
  const {page,errors}=await fixture(390);
  try{
    await page.evaluate(key=>openLocationMap(key),place.key);await ready(page,'#cityMapOverlay');
    await page.evaluate(()=>{
      $('title').textContent='Example company';$('clock').innerHTML='<b>Day 190 · Mon 11:47</b><small>Year 4 · 38 sites · 634 staff</small>';
    });
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    const dialog=await page.locator('#locationMapDialog').boundingBox();assert.ok(dialog.x>=0 && dialog.x+dialog.width<=391);
    assert.equal(await page.locator('#locationMapDialog').evaluate(d=>d.scrollWidth<=d.clientWidth),true);
    const before=await page.locator('#cityMapOverlay .map-canvas').getAttribute('viewBox');
    await page.locator('#cityMapOverlay [data-action="in"]').click();
    await page.waitForFunction(before=>document.querySelector('#cityMapOverlay .map-canvas').getAttribute('viewBox')!==before,before);
    await page.locator('#cityMapOverlay [data-action="list"]').click();
    await page.locator(`#cityMapOverlay [data-pick="${place.key}"]`).focus();await page.keyboard.press('Enter');
    assert.match(await page.locator('#cityMapOverlay .map-detail').textContent(),/Test shop/);
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});
test('failed map load offers a working retry',async()=>{
  const {page,errors}=await fixture();let failed=false;
  try{
    await page.route('**/maps/locations.json?*',r=>{if(!failed){failed=true;return r.fulfill({status:503,body:'Unavailable'});}return r.continue();});
    await page.evaluate(()=>showPage('map'));
    await page.getByRole('button',{name:'Retry map'}).click();await ready(page);
    assert.equal(await page.locator('#cityMapPage .location').count(),883);
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});

test('dragging the map cannot select text or accidentally select a building',async()=>{
  const {page,errors}=await fixture();
  try{
    await page.evaluate(()=>showPage('map'));await ready(page);
    const stage=page.locator('#cityMapPage .map-stage');
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
    assert.equal(await page.locator('#cityMapPage .map-stage').evaluate(e=>e.classList.contains('interacting')),true);
    await page.mouse.up();
    assert.notEqual(await page.locator('#cityMapPage .map-canvas').getAttribute('viewBox'),before);
    assert.equal(await page.evaluate(()=>getSelection().toString()),'');
    assert.equal(await page.locator('#cityMapPage .location.selected').count(),0);
    await page.waitForFunction(()=>!document.querySelector('#cityMapPage .map-stage').classList.contains('interacting'));
    assert.equal(await page.locator('#cityMapPage .map-detail-background').isVisible(),true);
    assert.equal(await page.locator('#cityMapPage .map-fast-background').isVisible(),false);
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});

test('map controls use the shared UI and keep zoom inside the map without pins or footer copy',async()=>{
  const {page,errors}=await fixture();
  try{
    await page.evaluate(()=>showPage('map'));await ready(page);
    assert.equal(await page.locator('#cityMapPage .map-stage [data-action="in"].ibtn').count(),1);
    assert.equal(await page.locator('#cityMapPage .map-stage [data-action="out"].ibtn').count(),1);
    assert.equal(await page.locator('#cityMapPage [data-action="fit"], #cityMapPage .map-marker, #cityMapPage .map-caption, #cityMapPage .map-status').count(),0);
    assert.equal(await page.locator('#cityMapPage .map-toolbar .field').count(),4);
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});

test('owned buildings filter includes purchased property without a business and excludes rented sites',async()=>{
  const {page,errors}=await fixture();
  const property=geometry.buildings.find(b=>b.key==='ba:street_harborstreet#5');
  try{
    await page.evaluate(property=>{
      D.ownedBuildings=[{key:property.key,address:property.address,purchaseDay:156,purchasePrice:18250000}];
      showPage('map');
    },property);await ready(page);
    await page.locator('#cityMapPage [data-control="type"]').selectOption('Shop');
    await page.locator('#cityMapPage [data-control="filter"]').selectOption('owned');
    assert.equal(await page.locator('#cityMapPage .map-toolbar select').count(),3);
    assert.equal(await page.locator('#cityMapPage .map-results button').count(),1);
    assert.equal(await page.locator('#cityMapPage .map-results button').getAttribute('data-pick'),property.key);
    assert.equal(await page.locator('#cityMapPage .location.owned').count(),1);
    assert.equal(await page.locator('#cityMapPage [data-control="type"]').inputValue(),'');
    await page.locator('#cityMapPage .map-results button').click();
    assert.match(await page.locator('#cityMapPage .map-detail').textContent(),/Purchased on day 156/);
    assert.equal(await page.locator('#cityMapPage .location.selected').getAttribute('data-location'),property.key);
    await page.evaluate(()=>{D.ownedBuildings=[];refreshCityMaps();});
    assert.equal(await page.locator('#cityMapPage .location.owned').count(),0);
    assert.equal(await page.locator('#cityMapPage .map-results button').count(),0);
    assert.doesNotMatch(await page.locator('#cityMapPage .map-detail').textContent(),/Owned building/);
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});

test('selecting results and resetting the camera preserve the chosen region and list',async()=>{
  const {page,errors}=await fixture();
  try{
    await page.evaluate(()=>showPage('map'));await ready(page);
    await page.locator(`#cityMapPage [data-pick="${place.key}"]`).click();
    assert.equal(await page.locator('#cityMapPage [data-control="region"]').inputValue(),'world');
    assert.equal(await page.locator('#cityMapPage .map-results button').count(),2);
    await page.locator(`#cityMapPage [data-pick="${other.key}"]`).click();
    await page.locator('#cityMapPage [data-action="reset"]').click();
    assert.equal(await page.locator('#cityMapPage [data-control="region"]').inputValue(),'world');
    assert.equal(await page.locator('#cityMapPage .map-results button').count(),2);
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});

test('a reopened shortcut clears stale overlay filters and includes the requested place',async()=>{
  const {page,errors}=await fixture();
  try{
    await page.evaluate(key=>openLocationMap(key),place.key);await ready(page,'#cityMapOverlay');
    await page.locator('#cityMapOverlay [data-control="filter"]').selectOption('owned');
    await page.locator('#cityMapOverlay [data-control="region"]').selectOption('mainland');
    await page.locator('#cityMapOverlay [data-control="search"]').fill('unmatched');
    await page.keyboard.press('Escape');
    await page.evaluate(key=>openLocationMap(key),other.key);
    await page.locator(`#cityMapOverlay [data-pick="${other.key}"]`).waitFor();
    assert.equal(await page.locator('#cityMapOverlay [data-control="filter"]').inputValue(),'all');
    assert.equal(await page.locator('#cityMapOverlay [data-control="region"]').inputValue(),'world');
    assert.equal(await page.locator('#cityMapOverlay .location.selected').getAttribute('data-location'),other.key);
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});

test('active mobile map tabs remain readable on hover in both themes',async()=>{
  const {page,errors}=await fixture(390);
  try{
    await page.evaluate(()=>showPage('map'));await ready(page);
    for(const theme of ['light','dark']){
      await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
      for(const action of ['map','list']){
        const button=page.locator(`#cityMapPage .map-mobile-tabs [data-action="${action}"]`);
        await button.click();await button.hover();
        const colors=await button.evaluate(b=>({ink:getComputedStyle(b).color,background:getComputedStyle(b).backgroundColor}));
        assert.notEqual(colors.ink,colors.background,`${theme} ${action}`);
      }
    }
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
    assert.equal(await page.locator('#cityMapOverlay .location.selected').getAttribute('data-location'),place.key);
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

test('owned vacant property detail uses its address rather than Vacant lease',async()=>{
  const {page,errors}=await fixture();
  try{
    await page.evaluate(()=>{
      const b=D.businesses[0];b.name='Vacant lease';b.status='vacant';
      D.ownedBuildings=[{key:b.key,address:b.address,purchaseDay:156,purchasePrice:100000}];
      openLocationMap(b.key);
    });await ready(page,'#cityMapOverlay');
    assert.equal(await page.locator('#cityMapOverlay .map-detail h3').innerText(),place.address);
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});
