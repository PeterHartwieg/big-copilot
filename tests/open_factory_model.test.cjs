'use strict';
// Arithmetic runs through the same module Python embeds, without a board or DOM.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {create} = require('../template/open-factory-model.js');

function frozen(value){
  if(value && typeof value === 'object'){
    Object.values(value).forEach(frozen);
    Object.freeze(value);
  }
  return value;
}
function fixture(){
  return {
    facts: {
      game: {prices: 2, agent: 100, export: 0.5, wages: 0.7, delivery: 100, installFee: 5, driverHours: 5.7, hqHours: 40},
      products: {beer: {w: 20, i: 1.5, bx: 20}, cider: {w: 12, i: 1, bx: 10},
        water: {w: 1, i: 2, bx: 10}, grain: {w: 4, i: 1, bx: 25}, fruit: {w: 5, i: 1, bx: 40}},
      skills: {'ba:skill_factoryworker': 10, 'ba:skill_deliverydriver': 8,
        'ba:skill_purchasingagent': 12, 'ba:skill_logisticsmanager': 14},
      kits: {brew: [['machine', 1000], ['mount', 100]], press: [['press', 500]]},
      items: {machine: {p: 1000, v: ['equipment']}, mount: {p: 100, v: ['equipment', 'storage']},
        shelf: {p: 200, v: ['storage']}, press: {p: 500, v: ['equipment']}},
      shelf: {item: 'shelf', p: 200, cc: 60}, vehicles: {truck: {p: 4000}, van: {p: 2000}},
      sites: {factory: {shelves: 2}}, hq: {agents: 0, contracts: 0, managers: 0, managed: 0},
    },
    recipes: {beer: {out: 10, workstation: 'brew', ingredients: [{slug: 'water', per: 2}, {slug: 'grain', per: 3}]},
      cider: {out: 5, workstation: 'press', ingredients: [{slug: 'water', per: 1}, {slug: 'fruit', per: 4}]}},
    aliases: {water: 'tap'}, sources: {tap: {active: true}},
  };
}
const factory = frozen({key: 'factory', hood: 'industry', m2: 100, rent: 50, deposit: 1000});
const depot = frozen({key: 'depot', hood: 'industry', type: 'warehouse', status: 'vacant', rent: 30, deposit: 900});
const wage = base => base * (1 + Math.pow(1.05, 100) / 100) * 0.7;
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('new factory prices kits, shared mounts, rounded storage, delivery and both installation modes', () => {
  const model = create(frozen(fixture()));
  const input = frozen({counts: {beer: 2}, building: factory});
  const inv = model.investment(input);
  assert.equal(inv.boxes, 157); // 48 beer + 68 water + 41 grain
  assert.equal(inv.shelves, 3);
  assert.deepEqual(inv.out.lines, [['machine', 2, 'ws'], ['mount', 2, 'ws'], ['shelf', 3, 'shelf']]);
  assert.deepEqual(inv.stores, [{key: 'equipment', lines: [0, 1]}, {key: 'storage', lines: [2]}]);
  assert.equal(inv.furniture, 2800);
  assert.equal(inv.delivery, 200);
  assert.equal(inv.fee, 500);
  assert.equal(inv.self, 8000);
  assert.equal(inv.firm, 8300);
  assert.deepEqual(model.investment(input), inv, 'repeated reads are identical and do not mutate frozen inputs');
});

test('a selected depot adds eight shelves, van, deposit and one delivery', () => {
  const inv = create(frozen(fixture())).investment(frozen({counts: {beer: 2}, building: factory, depot}));
  assert.deepEqual(inv.depot, {b: depot, deposit: 900, shelves: 8, racks: 1600, van: 2000, delivery: 100, total: 4600});
  assert.equal(inv.self, 12600);
  assert.equal(inv.firm, 12900);
});

test('empty rented factory and depot premises waive deposits but keep equipment and running rent', () => {
  const model = create(frozen(fixture()));
  const input = frozen({counts: {beer: 2}, building: {...factory, status: 'mine', occupant: null},
    depot: {...depot, status: 'mine', occupant: null}});
  const inv = model.investment(input);
  assert.equal(inv.deposit, 0);
  assert.equal(inv.depot.deposit, 0);
  assert.equal(inv.self, 12600 - factory.deposit - depot.deposit);
  assert.equal(inv.firm, 12900 - factory.deposit - depot.deposit);
  assert.equal(inv.truck, 4000);
  assert.equal(inv.depot.van, 2000);
  assert.equal(model.running(input, inv).rent, (factory.rent + depot.rent) * 7);
});

test('owned factories buy only added machines and storage, retaining other product ranges', () => {
  const model = create(frozen(fixture()));
  const inv = model.investment(frozen({counts: {beer: 2}, building: factory, owned: true, current: {beer: 1, cider: 2}, depot}));
  assert.deepEqual(inv.adds, {beer: 1});
  assert.equal(inv.boxes, 272, 'storage includes the retained cider range and pooled water');
  assert.equal(inv.placed, 2);
  assert.equal(inv.shelves, 3);
  assert.equal(inv.furniture, 1700);
  assert.equal(inv.truck, 0);
  assert.equal(inv.deposit, 0);
  assert.equal(inv.depot, null);
  assert.equal(inv.self, 1900);
  assert.equal(inv.firm, 2200);
});

test('unchanged or reduced owned production does not buy machines or bill delivery', () => {
  const model = create(frozen(fixture()));
  for(const count of [0, 1]){
    const inv = model.investment(frozen({counts: {beer: count}, building: factory, owned: true, current: {beer: 1}}));
    assert.equal(inv.items, 0);
    assert.equal(inv.furniture, 0);
    assert.equal(inv.delivery, 0);
    assert.equal(inv.self, 0);
  }
});

test('weekly running costs separate ingredients, machine hours, drivers, headquarters and rent', () => {
  const model = create(frozen(fixture()));
  const input = frozen({counts: {beer: 2}, building: factory, depot, wantsDepot: true});
  const inv = model.investment(input), run = model.running(input, inv);
  assert.equal(run.raw, 8064);
  close(run.workers, 2 * 168 * wage(10));
  close(run.driver, 2 * 5.7 * 7 * wage(8));
  close(run.hq, (wage(12) + 2 * wage(14)) * 40);
  assert.equal(run.rent, 560);
  close(run.wages, run.workers + run.driver + run.hq);
  close(run.total, run.raw + run.wages + run.rent);
});

test('owned running costs count only the selected range delta, including material savings', () => {
  const model = create(frozen(fixture()));
  const run = model.running(frozen({counts: {beer: 2}, owned: true, current: {beer: 1, cider: 2}}));
  assert.equal(run.raw, 4032);
  close(run.workers, 168 * wage(10));
  assert.equal(run.rent, 0);
  assert.equal(run.driver, 0);
  assert.equal(run.hq, 0);
  const less = model.running(frozen({counts: {beer: 0}, owned: true, current: {beer: 1}}));
  assert.equal(less.raw, -4032);
  assert.equal(less.wages, 0);
});

test('price lookup preserves aliases, agent discounts, exports and raw-unit conversion', () => {
  const input = frozen(fixture()), model = create(input);
  assert.equal(model.product('tap'), input.facts.products.water);
  assert.equal(model.wholesale('beer'), 60);
  assert.equal(model.importPrice('beer'), 45);
  assert.equal(model.exportPrice('beer'), 30);
  assert.equal(model.rawUnit('beer'), 2.4);
  assert.deepEqual(model.rawWeek({beer: 2, cider: 1}), {water: 840, grain: 1008, fruit: 672});
  assert.equal(model.saves({slug: 'beer', made: 100, want: 80}), 3360);
  for(const [agent, discount] of [[-1, 1], [0, 1], [100, 0.75], [120, 0.75], [undefined, 0.75]]){
    const data = fixture(); data.facts.game.agent = agent;
    assert.equal(create(frozen(data)).discount(), discount);
  }
});

test('headquarters hiring uses active aliased contracts and spare management capacity', () => {
  const input = fixture();
  input.facts.hq = {agents: 2, contracts: 1, managers: 3, managed: 1};
  const model = create(frozen(input));
  assert.deepEqual(model.uncontracted({beer: 1}), ['grain']);
  assert.deepEqual(model.hq({beer: 1}, true), {managers: 0, agents: 0});
  const contracted = fixture(); contracted.sources.grain = {active: true};
  assert.deepEqual(create(frozen(contracted)).hq({beer: 1}), {managers: 1, agents: 0});
});

test('depot choice is deterministic, keeps owned premises, and replaces invalid choices without mutation', () => {
  const model = create();
  const a = {...depot, key: 'a'}, b = {...depot, key: 'b'}, far = {...depot, key: 'far', hood: 'elsewhere', rent: 1};
  const buildings = frozen([b, far, a, {...depot, key: factory.key, rent: 0}, {...depot, key: 'no-rent', rent: null}]);
  assert.equal(model.selectDepot({building: factory, buildings}).key, 'a');
  assert.equal(model.selectDepot({building: factory, buildings, rememberedKey: 'b'}).key, 'b');
  assert.equal(model.selectDepot({building: factory, buildings, rememberedKey: factory.key}).key, 'a');
  const owned = frozen([{...a, status: 'mine'}, b]);
  assert.equal(model.selectDepot({building: factory, buildings: owned, rememberedKey: 'a'}).key, 'a');
  assert.equal(model.selectDepot({building: factory, buildings: owned}).key, 'a');
  const occupied = frozen([{...a, status: 'mine', occupant: {typeSlug: 'ba:businesstype_factory'}}, b]);
  assert.equal(model.selectDepot({building: factory, buildings: occupied, rememberedKey: 'a'}).key, 'b');
  const rival = frozen([{...a, status: 'rival'}, far]);
  assert.equal(model.selectDepot({building: factory, buildings: rival, rememberedKey: 'a'}).key, 'far');
  assert.equal(model.selectDepot({building: factory, buildings: []}), null);
});

test('missing game tables, prices, recipes and buildings retain existing fallbacks', () => {
  const model = create();
  assert.equal(model.investment({counts: {}, building: factory}), null);
  assert.equal(create({facts: {kits: {}}}).investment({counts: {}, building: null}), null);
  assert.equal(model.importPrice('unknown'), 0);
  assert.equal(model.rawUnit('unknown'), 0);
  assert.equal(model.boxes({unknown: 10}), 0);
  assert.deepEqual(model.rawWeek({unknown: 10}), {});
  assert.deepEqual([...model.kit({unknown: 10})], []);
  assert.equal(model.running({counts: {}}).total, 0);
  const noBox = fixture(); delete noBox.facts.products.grain.bx;
  assert.equal(create(frozen(noBox)).boxes({beer: 2}), 116);
});

/* The game values come from the payload alone (issue #347). */
test('a missing game value fails loudly instead of being guessed', () => {
  for(const [where, key] of [['game', 'driverHours'], ['game', 'hqHours']]){
    const {facts, ...rest} = fixture();
    const copy = structuredClone(facts);
    delete copy[where][key];
    const m = create({...rest, facts: copy});
    assert.throws(() => m.running({counts: {beer: 1}}), new RegExp(`openFactory\\.${where}\\.${key} is missing`));
  }
  const {facts, ...rest} = fixture();
  const copy = structuredClone(facts);
  delete copy.shelf.cc;
  assert.throws(() => create({...rest, facts: copy}).investment({counts: {beer: 1}, building: {key: 'b', m2: 100}}),
    /openFactory\.shelf\.cc is missing/);
});


test('unsupported running costs leave material quantities and known equipment costs usable', () => {
  const inputs = fixture();
  inputs.facts.compatibility = {factoryRunning: ['equipmentUtilities'], factoryOpening: ['factoryDiplomas']};
  const model = create(frozen(inputs));
  const input = {counts: {beer: 2}, building: factory};
  assert.equal(model.running(input, model.investment(input)), null);
  assert.equal(model.running({...input, owned: true, current: {beer: 1}}, null), null);
  assert.ok(model.rawCost(input.counts) > 0);
  assert.equal(model.investment(input).self, 8000);
  assert.deepEqual(model.investment(input).incomplete, ['factoryDiplomas']);
});

const ModEconomy = require('../template/mod-economy-model.js');
function companionFixture(){
  const f=fixture(), disabled=()=>({status:'disabled',data:null}), ready=data=>({status:'ready',data});
  const terms=structuredClone(require('../contracts/rlo/utilities-vectors.json').sample.terms);
  const load=structuredClone(require('../contracts/hart/ready.json').modules.runningCosts.data);
  load.equipment.effective=true;load.officeIt.effective=false;
  load.items=['machine','mount','shelf','computer'].map((itemId,i)=>({itemId,openWatts:i===0?400:0,alwaysWatts:i===0?20:0,litresPerOpenHour:i===0?5:0,officeSeat:itemId==='computer'}));
  load.currentSites=[{address:{street:'A',number:1},equipmentApplies:true,openWatts:400,alwaysWatts:20,litresPerOpenHour:5,officeSeats:0}];
  f.facts.modEconomy={day:9,rlo:{modules:{prices:disabled(),company:disabled(),requirements:disabled(),education:disabled(),
    utilities:ready({model:'rlo-utilities-v1',terms,typeKinds:['factory','warehouse','headquarters'].map(t=>({typeId:'ba:businesstype_'+t,kind:2})),
      accounts:['power','water'].map(service=>({address:{street:'A',number:1},service,state:'active'})),
      unresolvedAccountServices:[],internetEnabled:false,internet:{needs:[]}})}},
    hart:{modules:{runningCosts:ready(load),factoryPurchases:disabled()}}};
  f.facts.hq={agents:10,contracts:0,managers:10,managed:0};
  f.facts.sites['A#1']={shelves:2,open:Array.from({length:7},()=>[[0,24]])};
  return f;
}
const actualFactory={...factory,key:'A#1'};
test('new factory utility costs enter weekly totals once while upfront costs stay in investment',()=>{
  const f=companionFixture(), model=create(f), input={counts:{beer:1},building:actualFactory};
  const inv=model.investment(input),run=model.running(input,inv);
  assert.equal(inv.modCosts.status,'ready',JSON.stringify(inv.modCosts.reasons));
  const expected=ModEconomy.create(f.facts.modEconomy).operating({typeId:'ba:businesstype_factory',building:actualFactory,lines:inv.out.lines,open:Array.from({length:7},()=>[[0,24]])});
  close(run.modCosts.dailyCents,expected.dailyCents);
  close(run.total,run.raw+run.wages+run.rent+expected.dailyCents*7/100);
  assert.equal(inv.modCosts.dayCost(0),expected.dayCost(0));
});
test('owned expansion subtracts captured full baseline and never bills unchanged equipment again',()=>{
  const f=companionFixture(), model=create(f), input={counts:{beer:2},current:{beer:1},owned:true,building:actualFactory};
  const inv=model.investment(input),run=model.running(input,inv),owner=ModEconomy.create(f.facts.modEconomy);
  const base={typeId:'ba:businesstype_factory',building:actualFactory,existing:true,open:f.facts.sites['A#1'].open};
  const before=owner.operating(base),after=owner.operating({...base,existingExtraLines:inv.out.lines});
  assert.equal(run.modCosts.status,'ready',JSON.stringify(run.modCosts.reasons));
  close(run.modCosts.dailyCents,after.dailyCents-before.dailyCents);
  assert.ok(run.modCosts.dailyCents<after.dailyCents);
  const unchanged={...input,counts:{beer:1}};
  const zero=model.running(unchanged,model.investment(unchanged));
  assert.equal(zero.modCosts.dailyCents,0);assert.equal(zero.total,0);
});
test('missing depot or HQ support placement makes the affected estimate incomplete',()=>{
  const f=companionFixture();f.facts.hq={agents:0,contracts:0,managers:0,managed:0};
  const model=create(f),input={counts:{beer:1},building:actualFactory,wantsDepot:true};
  const inv=model.investment(input),run=model.running(input,inv);
  assert.ok(inv.incomplete.includes('depot-site-unavailable'));
  assert.ok(inv.incomplete.includes('hq-support-site-unavailable'));
  assert.equal(run.total,null);assert.ok(run.raw>0);
});
test('added HQ workstations are a before/after delta at the actual captured support site',()=>{
  const f=companionFixture(),c=f.facts.modEconomy;
  const hq={...actualFactory,key:'H#1'};
  f.facts.hq={agents:0,contracts:0,managers:0,managed:0,site:hq,spareWorkstations:0,open:Array.from({length:7},()=>[[8,16]]),workstationLines:[['machine',1]]};
  c.hart.modules.runningCosts.data.currentSites.push({address:{street:'H',number:1},equipmentApplies:true,openWatts:1000,alwaysWatts:100,litresPerOpenHour:10,officeSeats:2});
  c.rlo.modules.utilities.data.accounts.push(...['power','water'].map(service=>({address:{street:'H',number:1},service,state:'active'})));
  const model=create(f),input={counts:{beer:1},building:actualFactory},inv=model.investment(input);
  assert.equal(inv.modCosts.status,'ready',JSON.stringify(inv.modCosts.reasons));
  const owner=ModEconomy.create(c),base={typeId:'ba:businesstype_headquarters',building:hq,open:f.facts.hq.open,existing:true};
  const delta=owner.operating({...base,existingExtraLines:[['machine',2]]}).dailyCents-owner.operating(base).dailyCents;
  const direct=owner.operating({typeId:'ba:businesstype_factory',building:actualFactory,lines:inv.out.lines,open:Array.from({length:7},()=>[[0,24]])});
  close(inv.modCosts.dailyCents,direct.dailyCents+delta);
});
test('factory education includes full tuition once and separates first payment; existing machines are not retrocharged',()=>{
  const f=companionFixture(),c=f.facts.modEconomy;
  c.hart.modules.factoryPurchases={status:'ready',data:{gate:{effective:true},courses:[{courseId:18,courseKey:'course',itemIds:['machine']}],heldRecords:{status:'ready',data:[]}}};
  c.rlo.modules.education={status:'ready',data:{courses:[{courseId:18,qualified:false,offered:true,prerequisitesMet:true,enrollment:null,quotes:[{mode:0,loan:false,quoteStatus:'ok',immediateCashCents:100000,totalFeeCents:300000}]}]}};
  const model=create(f),input={counts:{beer:2},building:actualFactory},inv=model.investment(input);
  assert.equal(inv.modEducation.totalCents,300000);assert.equal(inv.modEducation.requirements.length,1);
  assert.equal(inv.self-inv.upfrontSelf,2000);
  const owned=model.investment({...input,owned:true,current:{beer:2}});
  assert.equal(owned.modEducation.totalCents,0);
  const expansion=model.investment({...input,owned:true,current:{beer:1}});
  assert.equal(expansion.modEducation.totalCents,300000,'buying another copy still needs the course');
  c.rlo.modules.education.data.courses[0].enrollment={paidCents:100000};
  const enrolled=create(f).investment(input);
  assert.equal(enrolled.modEducation.startupCents,0);
  assert.equal(enrolled.modEducation.totalCents,null);
  assert.ok(enrolled.incomplete.includes('course-future-cost-unavailable'));
});
test('unknown wages, selected prices and deposit treatment never become complete zero costs',()=>{
  const f=companionFixture();f.facts.priceUnavailable=['machine','grain'];
  f.facts.modEconomy.rlo.modules.company={status:'unavailable',data:null};
  f.facts.modEconomy.rlo.modules.prices={status:'ready',data:{depositAdjustment:null,costFactorThousandths:1100,adjustmentQuiet:3,livingTransactionTypes:['ba:transaction_interiorinstallation']}};
  const model=create(f),input={counts:{beer:1},building:actualFactory},inv=model.investment(input),run=model.running(input,inv);
  assert.ok(inv.incomplete.includes('equipment-price-unavailable'));assert.ok(inv.incomplete.includes('deposit-adjustment-unavailable'));
  assert.equal(run.raw,null);assert.equal(run.wages,null);assert.equal(run.total,null);
  assert.equal(model.saves({slug:'beer',made:100,want:100}),null);
});

test('HQ spare workstations avoid purchases and unverified spare capacity blocks the affected estimate',()=>{
  const f=companionFixture(),c=f.facts.modEconomy,hq={...actualFactory,key:'H#1'};
  f.facts.hq={agents:0,contracts:0,managers:0,managed:0,site:hq,spareWorkstations:2,open:Array.from({length:7},()=>[[8,16]]),workstationLines:[['machine',1]]};
  const input={counts:{beer:1},building:actualFactory},inv=create(f).investment(input);
  assert.equal(inv.modCosts.status,'ready');assert.equal(inv.hqPurchase.total,0);assert.equal(inv.hqPurchase.seats,0);
  f.facts.hq.spareWorkstations=null;
  assert.ok(create(f).investment(input).incomplete.includes('hq-spare-workstations-unavailable'));
  f.facts.hq.spareWorkstations=1;
  c.hart.modules.runningCosts.data.currentSites.push({address:{street:'H',number:1},equipmentApplies:true,openWatts:1000,alwaysWatts:100,litresPerOpenHour:10,officeSeats:2});
  c.rlo.modules.utilities.data.accounts.push(...['power','water'].map(service=>({address:{street:'H',number:1},service,state:'active'})));
  const added=create(f).investment(input);
  assert.equal(added.hqPurchase.seats,1);assert.equal(added.hqPurchase.furniture,1000);assert.equal(added.hqPurchase.delivery,100);
});
test('existing depot shelves and baseline rent are not charged again',()=>{
  const f=companionFixture(),c=f.facts.modEconomy,site={...depot,key:'W#1',status:'mine',occupant:{typeSlug:'ba:businesstype_warehouse'}};
  f.facts.sites[site.key]={shelves:8,open:Array.from({length:7},()=>[[0,24]])};
  c.hart.modules.runningCosts.data.currentSites.push({address:{street:'W',number:1},equipmentApplies:true,openWatts:1000,alwaysWatts:100,litresPerOpenHour:10,officeSeats:0});
  c.rlo.modules.utilities.data.accounts.push(...['power','water'].map(service=>({address:{street:'W',number:1},service,state:'active'})));
  const model=create(f),input={counts:{beer:1},building:actualFactory,depot:site,wantsDepot:true},inv=model.investment(input);
  assert.equal(inv.depot.shelves,0);assert.equal(inv.depot.racks,0);assert.equal(inv.depot.delivery,0);
  const noDepot=model.investment({...input,depot:null,wantsDepot:false});
  assert.equal(inv.modCosts.status,"ready",JSON.stringify(inv.modCosts.reasons));
  close(inv.modCosts.dailyCents,noDepot.modCosts.dailyCents);
  close(model.running(input,inv).rent,actualFactory.rent*7);
});
test('registered wholesale prices scale once and city adjustments follow the native installation bill',()=>{
  const f=companionFixture();f.facts.game.prices=1.3;
  f.facts.modEconomy.rlo.modules.prices={status:'ready',data:{depositAdjustment:'none',costFactorThousandths:1300,adjustmentQuiet:3,livingTransactionTypes:['ba:transaction_interiorinstallation']}};
  const model=create(f),inv=model.investment({counts:{beer:1},building:actualFactory});
  close(model.wholesale('beer'),20*1.5*1.3);
  const owner=require('../template/mod-demand-model.js');
  close(inv.firm-inv.self,inv.fee-inv.delivery+owner.cityAdjust(inv.furniture+inv.fee,1300,3));
});

test('an unchanged owned factory needs no new purchase qualification proof',()=>{
  const f=companionFixture();f.facts.modEconomy.hart.modules.factoryPurchases={status:'unavailable',data:null};
  const inv=create(f).investment({counts:{beer:1},current:{beer:1},owned:true,building:actualFactory});
  assert.equal(inv.modEducation.status,'ready');assert.equal(inv.modEducation.totalCents,0);
});

test('unavailable native lease quotes block investment and dependent running rent',()=>{
  const f=companionFixture(),model=create(f),input={counts:{beer:1},building:{...actualFactory,rent:null,deposit:null}},inv=model.investment(input);
  assert.ok(inv.incomplete.includes('lease-quote-unavailable'));
  const running=model.running(input,inv);assert.equal(running.rent,null);assert.equal(running.total,null);
});

test('planned payroll applies the city factor once to native base wages, separately from hourly display quotes',()=>{
  const f=companionFixture(),owner=require('../template/mod-demand-model.js');
  f.facts.modEconomy.rlo.modules.company={status:'ready',data:{partStates:{staff:'ready',licences:'disabled',cover:'disabled',tax:'disabled'},newHireWageFactorThousandths:1300,sites:[]}};
  f.facts.modEconomy.rlo.modules.prices={status:'ready',data:{depositAdjustment:'none',costFactorThousandths:1300,adjustmentQuiet:3,livingTransactionTypes:['ba:transaction_interiorinstallation']}};
  const model=create(f),input={counts:{beer:1},building:actualFactory},inv=model.investment(input),run=model.running(input,inv);
  const nativeWeek=168*wage(10)+f.facts.game.driverHours*7*wage(8);
  close(run.wages,(nativeWeek/7+owner.cityAdjust(nativeWeek/7,1300,3))*7);
  close(model.hourly('factoryworker'),owner.wage(wage(10),1300));
  assert.ok(run.wages<nativeWeek*1.3*1.3);
});


test('new-site default raises gate factory forecasts while standard sick pay remains an excluded absence assumption',()=>{
  const f=companionFixture(),company={partStates:{staff:'ready',licences:'disabled',cover:'disabled',tax:'disabled'},
    newHireWageFactorThousandths:1000,newSiteDefaults:{raiseHourlyCents:100,sickPayPolicy:1},sites:[]};
  f.facts.modEconomy.rlo.modules.company={status:'ready',data:company};
  const input={counts:{beer:1},building:actualFactory};
  let model=create(f),inv=model.investment(input);
  assert.ok(inv.incomplete.includes('new-site-staff-defaults-unavailable'));
  assert.equal(model.running(input,inv).total,null);
  company.newSiteDefaults.raiseHourlyCents=0;
  model=create(f);inv=model.investment(input);
  assert.equal(inv.modCosts.status,'ready');assert.ok(Number.isFinite(model.running(input,inv).total));
});


test('factory weekly costs use licence accrual rather than the first week cash payments',()=>{
  const f=companionFixture();
  f.facts.modEconomy.rlo.modules.company={status:'ready',data:{partStates:{staff:'disabled',licences:'ready',cover:'disabled',tax:'disabled'},sites:[]}};
  f.facts.modEconomy.rlo.modules.requirements={status:'ready',data:{types:[{typeId:'ba:businesstype_factory',licenceNeedsMask:1}],
    licences:[{kind:0,feeCents:10000,termDays:10,closesWhenMissing:true},{kind:1,feeCents:20000,termDays:20,closesWhenMissing:false}],
    lateOpeningHours:{before:5,after:22,permitKind:1},newSiteGraceDays:3}};
  const model=create(f),input={counts:{beer:1},building:actualFactory},inv=model.investment(input),run=model.running(input,inv);
  const cashDaily=inv.modCosts.byDayCents.reduce((a,b)=>a+b,0)/7;
  close(run.modCosts.dailyCents-cashDaily,2000);
  assert.match(run.modCosts.basis,/accrual/);
});
