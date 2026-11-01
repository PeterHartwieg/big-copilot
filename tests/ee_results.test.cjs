'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const {selectPython} = require('../tools/verify.mjs');
const {loadBoard} = require('./_board.cjs');
const H = require('./_page.cjs');

const raw = JSON.parse(execFileSync(selectPython(), ['-c',
  'import json; from tests.test_ee_results import payload; print(json.dumps(payload()))'],
  {cwd:path.join(__dirname,'..'), encoding:'utf8', maxBuffer:64*1024*1024}));
const KEY = 'ba:street_eighthstreet#5';

test('EE Results columns, chain and total reconcile with itemised recurring bills',()=>{
  const b = loadBoard({payload:structuredClone(raw)});
  vm.runInContext('D=payload',b);
  const columns=vm.runInContext('VIEWS.pnl.cols',b), site=raw.businesses.find(b=>b.key===KEY);
  const at=columns.findIndex(c=>c[0]==='Economy Expansion');
  assert.ok(at>0);
  const cell=columns[at][1](site);
  assert.match(cell,/-\$694/);
  for(const label of ['Electricity','Water','Waste','Internet','Software','CloudHarbor','Maintenance'])
    assert.ok(cell.includes(label), label);
  assert.match(columns[at+1][1](site),/-\$2,000/);
  const chain=raw.chains.find(c=>c.sites.includes(KEY));
  b.chain=chain;
  assert.equal(vm.runInContext('VIEWS.pnl.chain(chain).length',b),columns.length);
  assert.equal(vm.runInContext('VIEWS.pnl.total(D.businesses).length',b),columns.length);
  assert.match(b.paybackTip(raw.payback.sites[KEY]),/Economy Expansion setup investment/);
});

test('vanilla has the same columns and ignores stray EE fields',()=>{
  const b=loadBoard({payload:structuredClone(raw)});
  vm.runInContext('D=payload;D.mods={}',b);
  const before=vm.runInContext('VIEWS.pnl.cols.map(c=>c[0])',b);
  assert.equal(before.length,11);
  assert.ok(!before.includes('Economy Expansion'));
  vm.runInContext('delete D.businesses[0].economyExpansion',b);
  assert.deepEqual(vm.runInContext('VIEWS.pnl.cols.map(c=>c[0])',b),before);
});

test('technology demands have translated readable names through hrName',()=>{
  const b=loadBoard({payload:structuredClone(raw)});
  vm.runInContext('D=payload',b);
  for(const [category,label] of [['internet','Internet plan'],['workspace','Workspace software'],['software','Specialist software']]){
    const name=b.hrName(`oc:jobdemand_technology_${category}_t3`);
    assert.match(name,new RegExp(`${label}, tier 3`));
    assert.doesNotMatch(name,/oc:|jobdemand_/);
  }
  b.__table=JSON.parse(fs.readFileSync(path.join(__dirname,'../i18n/de.json'),'utf8'));
  vm.runInContext('gnRedraw=()=>{};ttSetTable("de",__table)',b);
  assert.match(b.hrName('oc:jobdemand_technology_internet_t2'),/Internet.*2/);
  assert.doesNotMatch(b.hrName('oc:jobdemand_technology_internet_t2'),/tier/);
});

const browser=H.suiteBrowser();
test('Overview fixed-cost value and tooltip include EE only when detected',async t=>{
  const {page}=await H.openPage(t,await browser(),{html:H.boardHtml(),hash:'#overview'});
  const payload=structuredClone(raw);payload.kpi.netWorth=null;
  await H.loadPayload(page,payload);
  for(const ee of [true,false]){
    const result=await page.evaluate(ee=>{
      D.mods=ee?{economyExpansion:{settled:D.meta.day}}:{};
      drawKpis();
      const el=document.querySelector('[data-kpi="fixed"]');
      return {html:el?.outerHTML,expected:fmt(D.kpi.rentBill+D.staff.dailyCost+(ee?D.kpi.economyExpansionBill:0))};
    },ee);
    assert.ok(result.html,result.html);
    assert.ok(result.html.includes(result.expected));
    if(ee) assert.match(result.html,/Economy Expansion recurring bills/);
    else assert.doesNotMatch(result.html,/Economy Expansion/);
  }
});

test('EE Results render with aligned rows and site cost bars on desktop and phone',async t=>{
  const {page}=await H.openPage(t,await browser(),{html:H.boardHtml(),hash:'#businesses/results'});
  await H.loadPayload(page,raw);
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:900});
    const result=await page.evaluate(key=>{
      drawPortfolio();
      const heads=[...document.querySelectorAll('#portfolio thead th')].map(x=>x.textContent.trim());
      const widths=[...document.querySelectorAll('#portfolio tbody tr,#portfolio tfoot tr')].map(r=>
        [...r.children].reduce((n,td)=>n+(+td.getAttribute('colspan')||1),0));
      const site=D.businesses.find(b=>b.key===key);
      return {heads,widths,html:(openSite(site.key,false),document.querySelector("#sitePanel").innerHTML),expected:heads.length};
    },KEY);
    assert.ok(result.heads.includes('Economy Expansion'));
    assert.ok(result.heads.includes('EE installation'));
    for(const n of result.widths) assert.equal(n,result.expected);
    assert.match(result.html,/Economy Expansion/);
    assert.doesNotMatch(result.html,/undefined/);
  }
});
