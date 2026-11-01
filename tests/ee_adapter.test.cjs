'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {selectPython} = require('../tools/verify.mjs');
const {loadBoard} = require('./_board.cjs');
const H = require('./_page.cjs');
const Store = require('../template/open-store-model.js');
const Factory = require('../template/open-factory-model.js');
const Economy = require('../template/mod-economy-model.js');

// The authored adapter constants, not a second copy of EE's prices in tests.
const rules = JSON.parse(execFileSync(selectPython(), ['-c',
  'import json; from tests.test_ee_adapter import fixture; import ba_mods as m, ba_dashboard as d; print(json.dumps(m.ee_inputs(fixture({}), {}, d._rent_estimate)))'],
  {cwd:path.join(__dirname,'..'),encoding:'utf8'}));
const shop = {key:'k',type:'retail',hood:'H',cap:20,m2:75,traffic:20,layout:'C1',rent:50,deposit:1000,status:'vacant'};
function facts(office=false){
  return {game:{promo:.5,wages:.7,capInitial:true,satisfaction:95,tax:.3,delivery:100,
    wageBase:{cashier:16,cleaner:12,guard:15,perCashier:30},ramp:[.55,.92],
    office:{always:3,fullDoor:50,day:[8,22],weekend:[6,0]}},
    hoods:{H:{idx:1.2,strength:1,demands:0,interior:0}},
    types:{T:{model:office?'office':'retail',wage:20,products:[['P',1]],amt:1,days:Array(7).fill(1),hours:Array(24).fill(1),
      layouts:{C1:{furniture:100,fee:50,lines:[['computer',4]],opt:[]}}}},
    market:{P:{p:10,r:.5,d:1,s:office?1:0,cost:4,hoods:{H:[0,0,null]}}},items:{computer:{p:25,v:['shop']}}};
}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('EE utilities interpolate quote bands, scale after rounding, and use observed rates before preferences',()=>{
  assert.equal(Economy.eeCosts({rules,building:shop}).daily,764);
  assert.equal(Economy.eeCosts({rules:{...rules,utilityFactor:.25},building:shop}).daily,191);
  assert.equal(Economy.eeCosts({rules,building:{...shop,m2:225}}).daily,1861);
  assert.equal(Economy.eeCosts({rules,building:{...shop,type:'warehouse',m2:690}}).daily,69932);
  const observed={...rules,utilityFactor:0,utilities:{retail:{perM2:2,sites:2,days:7}}};
  const cost=Economy.eeCosts({rules:observed,building:shop});
  assert.equal(cost.daily,150);assert.equal(cost.source,'charges');
  assert.equal(Economy.eeCosts({rules,building:{...shop,ee:{owned:true}}}),null);
  assert.equal(Economy.eeCosts({rules,building:{...shop,owner:'you'}}),null);
});

test('retail and office costs reduce profit before tax; opening investment includes all setup fees',()=>{
  for(const office of [false,true]){
    const f=facts(office), b={...shop,type:office?'office':'retail'};
    const original=Store.create({facts:f}), ee=Store.create({facts:f,occupancy:rules});
    const baseline=original.model('T',b), model=ee.model('T',b);
    assert.ok(model);assert.ok(model.occupancyCosts);
    close(baseline.profit-model.profit,model.occupancyCosts.daily);
    close(baseline.profit*.7-model.profit*.7,model.occupancyCosts.daily*.7);
    for(const day of [0,1,10]) close(original.dayProfit(baseline,null,day)-ee.dayProfit(model,null,day),model.occupancyCosts.daily);
    const inv=ee.investment({type:'T'},b), before=original.investment({type:'T'},b);
    close(inv.self-before.self,inv.occupancyCosts.startup);close(inv.firm-before.firm,inv.occupancyCosts.startup);
    if(office){
      assert.equal(model.occupancyCosts.internet,120);
      assert.equal(model.occupancyCosts.cloud,184); // Math.Round to even, unlike quote rounding.
      assert.ok(inv.occupancyCosts.startup>=2000+485);
      assert.equal(model.occupancyCosts.software,model.occupancyCosts.seats*18);
    }
  }
});

test('explicit running inputs and zero/absent inputs keep model parity',()=>{
  const core=Store.create({facts:facts()}), baseline=core.model('T',shop);
  assert.deepEqual(core.model('T',shop,{runningCosts:{daily:0,startup:0}}),baseline);
  const changed=core.model('T',shop,{runningCosts:{daily:75,startup:0}});
  close(baseline.profit-changed.profit,75);
  const zero=Store.create({facts:facts(),occupancy:{...rules,utilityFactor:0}});
  assert.deepEqual(zero.model('T',shop),baseline);
  assert.deepEqual(zero.investment({type:'T'},shop),core.investment({type:'T'},shop));
  assert.deepEqual(Store.create({facts:facts(),occupancy:rules}).model('T',{...shop,owner:'you'}),core.model('T',{...shop,owner:'you'}));
});

test('HQ software seats follow the five planned roles, independent of building capacity',()=>{
  const payload=JSON.parse(execFileSync(selectPython(),['-c',
    'import json; from tests.test_open_store import headquarters_payload; print(json.dumps(headquarters_payload()))'],
    {cwd:path.join(__dirname,'..'),encoding:'utf8',maxBuffer:64*1024*1024}));
  const type='ba:businesstype_headquarters', f=payload.openStore;
  assert.equal(f.types[type].staffSkills.length,5);
  delete f.game.office; // HQ has no customer-office staffing forecast to consume.
  const core=Store.create({facts:f,occupancy:rules}), native=Store.create({facts:f});
  const site=payload.premises.buildings.find(b=>b.key==='ba:street_broadwaystreet#1');
  let first;
  for(const cap of [4,10,50]){
    const b={...site,key:`hq-${cap}`,cap}, inv=core.investment({type},b), before=native.investment({type},b);
    assert.equal(inv.occupancyCosts.seats,5);assert.equal(inv.occupancyCosts.software,90);
    assert.equal(inv.occupancyCosts.startup,2970);
    assert.equal(inv.self-before.self,2970);assert.equal(inv.firm-before.firm,2970);
    if(first) assert.deepEqual(inv.occupancyCosts,first);else first=inv.occupancyCosts;
  }
  const html=loadBoard().eeCostsHtml(first);
  assert.match(html,/planned headquarters roles \(software seats: 5, one per role\)/);
  assert.doesNotMatch(html,/40-hour/);
});

test('office outfit demand selects an internet plan and includes required software',()=>{
  const cost=Economy.eeCosts({rules,building:{...shop,type:'office'},typeId:'ba:businesstype_lawfirm',lines:[['computer',50]],seats:10});
  assert.equal(cost.internetPlan,'fiber');assert.equal(cost.internet,400);
  assert.equal(cost.cloudDemand,450);assert.equal(cost.cloud,3628);assert.equal(cost.software,1310);
  assert.equal(cost.startup,20000+485+10*(97+1197));
  const board=loadBoard();assert.match(board.eeCostsHtml(cost),/CloudHarbor Core/);
  assert.match(board.eeCostsHtml(cost),/full office capacity/);assert.match(board.eeCostsHtml(cost),/closes an office without internet/);
});

test('CloudHarbor demand applies EE business and planned Voogle factors before billing',()=>{
  const cases=[['lawfirm',450,3628],['webdevelopmentagency',180,1360],['headquarters',270,2116],
    ['graphicdesigner',112.5,792],['marketingagency',112.5,792],['eventplanningagency',103.5,717],
    ['travelagency',103.5,717],['otheroffice',90,604]];
  for(const [type,demand,bill] of cases){
    const cost=Economy.eeCosts({rules,building:{...shop,type:'office'},typeId:`ba:businesstype_${type}`,
      lines:[['computer',50]],seats:10});
    close(cost.cloudDemand,demand);assert.equal(cost.cloud,bill,type);
  }
  const cabinet=Economy.eeCosts({rules,building:{...shop,type:'office'},typeId:'ba:businesstype_lawfirm',
    lines:[['computer',50],['bigcabinet',1]],seats:10});
  assert.equal(cabinet.cloudDemand,342);assert.equal(cabinet.cloud,2720);
  const empty=Economy.eeCosts({rules,building:{...shop,type:'office'},typeId:'ba:businesstype_lawfirm',
    lines:[['computer',50],['bigcabinet',5]],seats:10});
  assert.equal(empty.cloudDemand,0);assert.equal(empty.cloud,184);
});

test('office assumptions show translated internet plan names',()=>{
  const board=loadBoard(), cost={office:true,seats:1,daily:1,startup:0,source:'quote',utilityFactor:1};
  for(const [id,name] of [['business','Business'],['fast','Fast'],['fiber','Fiber']])
    assert.match(board.eeCostsHtml({...cost,internetPlan:id}),new RegExp(`active ${name} internet plan`));
  board.__table=JSON.parse(fs.readFileSync(path.join(__dirname,'../i18n/de.json'),'utf8'));
  vm.runInContext('ttSetTable("de",__table)',board);
  for(const [id,name] of [['business','Geschäftlich'],['fast','Schnell'],['fiber','Glasfaser']])
    assert.ok(board.eeCostsHtml({...cost,internetPlan:id}).includes(`(${name})`));
});

test('factory running strip separates EE costs with a middle dot',()=>{
  const board=loadBoard();
  vm.runInContext('D={meta:{character:"EE synthetic"},openFactory:{}};planTarget="new"',board);
  Object.assign(board,{ofLines:()=>[],ofInvestment:()=>null});
  for(const rent of [0,30]){
    board.ofRunning=()=>({raw:10,wages:20,rent,total:100,occupancyCosts:{daily:10}});
    const html=board.ofStripHtml(null);
    assert.match(html,rent ? /wages \$20 · rent \$30 · EE \$70\/week/ : /wages \$20 · EE \$70\/week/);
    assert.ok(!html.includes(' ? '));
  }
});

test('factory running costs include factory and depot utilities; explicit zero preserves all results',()=>{
  const f={game:{wages:1,driverHours:5.7,hqHours:40},products:{},skills:{'ba:skill_deliverydriver':8,'ba:skill_factoryworker':10},hq:{agents:0,contracts:0,managers:0,managed:0}};
  const baseline=Factory.create({facts:f}), ee=Factory.create({facts:f,occupancy:rules});
  const building={...shop,type:'warehouse',m2:690}, depot={...building,key:'depot',m2:1292};
  const input={counts:{},building}, inv={b:building,depot:{b:depot}};
  const before=baseline.running(input,inv), result=ee.running(input,inv);
  const daily=Economy.eeCosts({rules,building}).daily+Economy.eeCosts({rules,building:depot}).daily;
  close(result.total-before.total,daily*7);
  assert.deepEqual(baseline.running({...input,runningCosts:{daily:0}},inv),before);
  close(baseline.running({...input,runningCosts:{daily:20}},inv).total-before.total,140);
  assert.deepEqual(ee.running({...input,owned:true},inv),baseline.running({...input,owned:true},inv));
});

function payload(){
  return {meta:{character:'EE synthetic'},mods:{economyExpansion:{settled:39}},
    premises:{buildings:[{...shop,ee:{vanillaRent:100,multiplier:40,owned:false,paidRent:1200,checkLease:true,deposits:[18000]}}],
      rent:{economyExpansion:structuredClone(rules),deposit:{factors:{lease:62.84,warehouse:93.61}}}}};
}
test('both installation modes describe EE deposits as 15 days and preserve vanilla wording',()=>{
  const board=loadBoard({}, {edit:s=>s.replace('/*__MAP_SCRIPT__*/',()=>fs.readFileSync(path.join(__dirname,'../web/map.js'),'utf8'))});
  board.payload={...payload(),openStore:facts()};vm.runInContext('D=payload',board);
  for(const ee of [true,false]){
    board.payload.mods=ee?{economyExpansion:{settled:39}}:{};
    const b=vm.runInContext('premises().buildings[0]',board), core=board.osCore();
    const out=core.outfit({type:'T'},b), inv=core.investment({type:'T'},b);
    for(const render of [board.osFirmHtml,board.osSelfHtml]){
      const html=render(b,out,inv);
      if(ee){
        assert.equal(inv.deposit,15*b.rent);
        assert.ok(html.includes(board.depositNote(b)));
        assert.match(html,/Economy Expansion deposit: 15 days/);
        assert.doesNotMatch(html,/60 days/);
      }else assert.match(html,/about 60 days of rent, with the building's own fittings/);
    }
  }
});

test('factory location and both investment modes describe EE deposits and preserve vanilla wording',()=>{
  const board=loadBoard({}, {edit:s=>s.replace('/*__MAP_SCRIPT__*/',()=>fs.readFileSync(path.join(__dirname,'../web/map.js'),'utf8'))});
  board.payload={...payload(),openFactory:{game:{},kits:{},shelf:{cc:60}}};
  board.payload.premises.buildings[0].type='warehouse';
  vm.runInContext('D=payload;planTarget="new"',board);
  for(const ee of [true,false]){
    board.payload.mods=ee?{economyExpansion:{settled:39}}:{};
    const b=vm.runInContext('premises().buildings[0]',board);
    const inv=board.ofCore().investment({building:b,counts:{}});
    const where=board.ofWhereHtml();
    assert.match(where,ee ? /<b>15 days<\/b>/ : /<b>~90 days<\/b>/);
    for(const render of [board.ofFirmHtml,board.ofSelfHtml]){
      const html=render(inv);
      if(ee){
        assert.equal(inv.deposit,15*b.rent);
        assert.ok(html.includes(board.depositNote(b)));
        assert.match(html,/Economy Expansion deposit: 15 days/);
        assert.doesNotMatch(html,/90 days/);
      }else assert.match(html,/bout 90 days of rent/);
    }
  }
  board.payload.mods={economyExpansion:{settled:39}};
  board.eeSetPreferences({rent:'off',utility:4});
  assert.match(board.ofWhereHtml(),/<b>~90 days<\/b>/,'Rebalance off retains the vanilla deposit label');
});

test('map notes explain EE rent source, checks, deposit and owned exemption; vanilla payload is untouched',()=>{
  const board=loadBoard({}, {edit:s=>s.replace('/*__MAP_SCRIPT__*/',()=>fs.readFileSync(path.join(__dirname,'../web/map.js'),'utf8'))});
  board.payload=payload();vm.runInContext('D=payload',board);
  let p=vm.runInContext('premises()',board);assert.equal(p.buildings[0].rent,1200);
  assert.match(board.rentNote(),/per-character preference/);assert.match(board.rentNote(),/1 current lease within 0.0%/);
  assert.match(board.depositNote(p.buildings[0]),/15 days.*1,200/);
  assert.match(board.depositNote({...p.buildings[0],ee:{owned:true}}),/Owned building/);
  board.eeSetPreferences({rent:'5',utility:4});
  p=vm.runInContext('premises()',board);assert.equal(p.buildings[0].rent,2000);assert.equal(p.buildings[0].deposit,30000);
  assert.equal(board.payload.premises.buildings[0].rent,50,'raw save payload is immutable');
  board.payload.premises={...board.payload.premises,buildings:[{...shop,rent:null,deposit:null,ee:{vanillaRent:null}}]};
  assert.equal(vm.runInContext('premises().buildings[0].rent',board),null,'an unavailable baseline is never restored');
  board.payload.mods={};assert.strictEqual(vm.runInContext('premises()',board),board.payload.premises);
});

test('preferences validate option indices and retain session choices when storage is denied',()=>{
  const board=loadBoard({localStorage:{getItem(){throw Error('denied');},setItem(){throw Error('denied');}}});
  board.payload=payload();vm.runInContext('D=payload',board);
  board.eeSetPreferences({rent:'21',utility:1.5});
  assert.equal(board.eePreferences().rent,'auto');assert.equal(board.eeRules().utilityFactor,1);
  board.eeSetPreferences({rent:'off',utility:0});
  assert.equal(board.eeRules().rent.rebalance,false);assert.equal(board.eeRules().utilityFactor,0);
  const before=board.eeRules();assert.strictEqual(board.eeRules(),before);
});

const browser=H.suiteBrowser();
test('EE preferences redraw the factory strip and body on investment, until and running steps',async t=>{
  const raw=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/payload_snapshot/data_day47_history.json'),'utf8'));
  raw.mods={economyExpansion:{settled:raw.meta.day}};
  raw.premises.rent.economyExpansion=rules;raw.openStore.economyExpansion=rules;raw.openFactory.economyExpansion=rules;
  const key='ba:street_eighthavenue#8', building=raw.premises.buildings.find(b=>b.key===key);
  building.owner='city';building.ee={vanillaRent:building.rent,multiplier:39.7,owned:false};
  const {page}=await H.openPage(t,await browser(),{html:H.boardHtml(),hash:'#expansion/factory'});
  await H.loadPayload(page,raw);
  await page.evaluate(key=>{
    planTarget='new';planType='ba:businesstype_liquorstore';
    ofPlans=[{id:'ee-factory',type:planType,key,mode:'firm',counts:{'ba:itemname_beer':1}}];ofCur='ee-factory';
    drawPlan();
  },key);
  for(const [step,utility] of [['investment','2'],['until','3'],['running','1']]){
    const before=await page.evaluate(step=>{
      ofStep=step;ofDraw();pxOpen('prefs');
      document.getElementById('ofBody').insertAdjacentHTML('beforeend','<span id="ee-stale">Old estimate</span>');
      return document.getElementById('ofStrip').textContent;
    },step);
    await page.locator('[data-ee-pref="utility"]').selectOption(utility);
    assert.equal(await page.evaluate(()=>ofStep),step);
    assert.equal(await page.locator('#ee-stale').count(),0,`${step} body redraws immediately`);
    const after=await page.locator('#ofStrip').textContent();assert.notEqual(after,before,step);
    const expected=await page.evaluate(()=>fmt(ofRunning(ofPlan(),ofInvestment(ofPlan())).occupancyCosts.daily*7));
    assert.ok(after.includes(`EE ${expected}/week`),step);
  }
});

test('preference controls update estimates without a save reload, persist, and stay per character',async t=>{
  const {page}=await H.openPage(t,await browser(),{html:H.boardHtml()});
  await page.setViewportSize({width:375,height:820});
  const raw=payload();
  await page.evaluate(raw=>{D=raw;pxOpen('prefs');},raw);
  assert.equal(await page.locator('.px-ee-controls').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
  await page.locator('[data-ee-pref="rent"]').selectOption('5');
  assert.equal(await page.evaluate(()=>premises().buildings[0].rent),2000);
  await page.locator('[data-ee-pref="utility"]').selectOption('2');
  assert.equal(await page.evaluate(()=>eeRules().utilityFactor),.5);
  await page.evaluate(()=>{D.meta.character='Other';pxRender('prefs');});
  assert.equal(await page.locator('[data-ee-pref="rent"]').inputValue(),'auto');
  await page.reload();
  await page.evaluate(raw=>{D=raw;pxOpen('prefs');},raw);
  assert.equal(await page.locator('[data-ee-pref="rent"]').inputValue(),'5');
  assert.equal(await page.evaluate(()=>premises().buildings[0].deposit),30000);
});
