const assert = require('node:assert/strict');
const {test} = require('node:test');
const model = require('../template/mod-economy-model.js');
const hart = require('../contracts/hart/ready.json').modules.runningCosts.data;
const hv = require('../contracts/hart/running-costs-vectors.json');
const rv = require('../contracts/rlo/utilities-vectors.json');
const cap = rv.sample.terms.dailyCapCents;

test('HART equipment and office IT match owner-generated production vectors', () => {
  for(const v of hv.use){
    assert.equal(model.equipmentUse({terms:hart, service:v.power ? 'power' : 'water', use:v.rloUse,
      hours:v.hours, equipment:v}), v.expectedUse, JSON.stringify(v));
  }
  for(const v of hv.seatDay){
    assert.equal(model.officeItDayCents({terms:hart, seats:v.seats, priceLevel:v.levelThousandths,
      monthDays:v.monthDays, cap}), v.expectedCents, JSON.stringify(v));
  }
  assert.equal(model.officeItDayCents({terms:hart, seats:1, priceLevel:1000, monthDays:5, cap, outage:true}),0);
});

test('RLO use, tariff and bill rounding match production vectors', () => {
  for(const v of rv.useVectors){
    const i = v.input, terms = {...rv.sample.terms, priceLevel:i.level};
    const service = i.service === 0 ? 'power' : 'water';
    const use = model.utilityUse({terms, service, kind:i.kind, area:i.sqm, people:i.people,
      open:i.open, season:v.expected.season});
    assert.equal(use, v.expected.use, JSON.stringify(i));
    const cents = model.utilityDayCents({terms, service, use, temporary:i.temporary});
    assert.equal(cents, v.expected.dayCents, JSON.stringify(i));
    assert.equal(model.billMoney(cents,cap), v.expected.money, JSON.stringify(i));
    if(i.year === terms.yearDays) assert.equal(model.seasonAt(terms,i.day),v.expected.season);
  }
  for(const v of rv.tariffVectors){
    assert.equal(model.utilityDayCents({terms:{...rv.sample.terms,priceLevel:v.level},
      service:v.service === 0 ? 'power' : 'water',use:v.use,temporary:v.temporary}),v.expectedCents);
  }
  for(const v of rv.internetVectors) assert.equal(model.internetDayCents(v),v.expectedDayCents);
});

test('equipment inputs are indexed, unknown items do not become known zero', () => {
  const items = [{itemId:'computer',openWatts:150,alwaysWatts:0,litresPerOpenHour:0,officeSeat:true}];
  assert.deepEqual(model.equipmentFor([['computer',3]],items),
    {status:'ready',openWatts:450,alwaysWatts:0,litresPerOpenHour:0,officeSeats:3});
  assert.equal(model.equipmentFor([['unknown',1]],items).status,'unavailable');
  assert.equal(model.equipmentFor([['unknown',0]],items).status,'ready');
  assert.throws(() => model.equipmentFor([['computer',NaN]],items));
});

const ready = data => ({status:'ready',data});
const disabled = () => ({status:'disabled',data:null});
function planning(){
  return {version:1,day:9,hart:{modules:{runningCosts:ready(structuredClone(hart)),
      factoryPurchases:ready({...structuredClone(require('../contracts/hart/ready.json').modules.factoryPurchases.data),
        gate:{requested:true,effective:true,state:'active',reason:null}})}},rlo:{modules:{
    utilities:ready({model:'rlo-utilities-v1',terms:structuredClone(rv.sample.terms),
      typeKinds:[{typeId:'office',kind:1},{typeId:'shop',kind:2}],accounts:[],unresolvedAccountServices:[],internetEnabled:true,
      internet:{needs:['office'],installDays:2,installFeeCents:12000,providers:[
        {provider:2,districts:['hood'],plans:[{plan:0,businessMonthlyMonthCents:9000}]},
        {provider:1,districts:['hood'],plans:[{plan:0,businessMonthlyMonthCents:6000}]},
        {provider:0,districts:['elsewhere'],plans:[{plan:0,businessMonthlyMonthCents:1000}]}]}}),
    company:ready({sites:[],accountant:{monthlyFeeCents:99999},parts:{licences:true},partStates:{staff:'ready',cover:'ready',licences:'ready',tax:'ready'}}),
    requirements:ready({model:'rlo-opening-requirements-v1',types:[{typeId:'office',licenceNeedsMask:1},{typeId:'shop',licenceNeedsMask:1}],
      licences:[{kind:0,feeCents:10000,termDays:10,closesWhenMissing:true},{kind:1,feeCents:20000,termDays:20,closesWhenMissing:false}],
      lateOpeningHours:{before:5,after:22,permitKind:1},newSiteGraceDays:3}),
    education:ready({courses:[{courseId:18,qualified:false,offered:true,prerequisitesMet:true,enrollment:null,
      quotes:[{mode:0,loan:false,quoteStatus:'ok',feeNowCents:120000,immediateCashCents:120000,totalFeeCents:360000,
        approximateDurationDays:21}]}]})}}};
}
const officePlan = () => ({typeId:'office',building:{key:'Test#1',hood:'hood',m2:100},
  lines:[['ba:itemname_computer',3]],open:Array.from({length:7},()=>[[8,20]]),existing:false});

test('operating selects covered monthly internet, separates startup and term renewal, excludes company accountant',()=>{
  const c=planning(); c.hart.modules.runningCosts.data.officeTypeIds.push('office');
  const result=model.create(c).operating(officePlan());
  assert.equal(result.status,'ready',JSON.stringify(result.reasons));
  assert.equal(result.startupCents,22000);
  assert.equal(result.preparationDays,2);
  assert.equal(result.requirements[0].provider,1);
  assert.equal(result.componentCost(0).licences,0);
  assert.equal(result.componentCost(12).licences,0);
  assert.equal(result.componentCost(13).licences,10000); // paid now extends the free grace
  assert.equal(result.componentCost(23).licences,10000);
  assert.equal(result.componentCost(0).company,0);
  assert.equal(result.componentCost(0).officeIt,model.officeItDayCents({terms:hart,seats:3,
    priceLevel:c.rlo.modules.utilities.data.terms.priceLevel,monthDays:c.rlo.modules.utilities.data.terms.monthDays,cap}));
  assert.equal(result.dayCost(0),Object.values(result.componentCost(0)).reduce((a,b)=>a+b,0));
  assert.ok(!Object.values(result.componentCost(0)).includes(99999));
});

test('closed days, seasonal future days and late hours use explicit inputs',()=>{
  const c=planning();
  c.rlo.modules.requirements=disabled(); c.rlo.modules.company=disabled();
  const p=officePlan(); p.typeId='shop'; p.open[2]=[];
  const result=model.create(c).operating(p);
  assert.equal(result.status,'ready');
  const t=c.rlo.modules.utilities.data.terms;
  const eq=model.equipmentFor(p.lines,hart.items);
  const base=model.utilityUse({terms:t,service:'power',kind:2,area:100,open:false,season:model.seasonAt(t,9)});
  assert.equal(result.componentCost(0).power,model.utilityDayCents({terms:t,service:'power',
    use:model.equipmentUse({terms:hart,service:'power',use:base,hours:0,equipment:eq})}));
  assert.equal(result.byDayCents[2],result.dayCost(0)); // day 9 is Tuesday
  assert.equal(result.componentCost(t.yearDays*7).power,result.componentCost(0).power);
  const late=officePlan();late.open[0]=[[4,5]];
  assert.equal(model.create(planning()).operating(late).startupCents,42000);
  late.open[0]=[[5,22]];
  assert.equal(model.create(planning()).operating(late).startupCents,22000);
});

test('unknown affected input stays unknown, explicit disabled owner is known zero',()=>{
  const c=planning(), p=officePlan();
  p.lines.push(['unknown',1]);
  assert.equal(model.create(c).operating(p).status,'unavailable');
  p.lines.pop(); p.building.hood='no-coverage';
  assert.ok(model.create(c).operating(p).reasons.includes('internet-coverage-unavailable'));
  const absent=model.create({}).operating(officePlan());
  assert.equal(absent.status,'ready');assert.equal(absent.dailyCents,0);assert.equal(absent.startupCents,0);
  c.hart.modules.runningCosts.status='unavailable';
  assert.equal(model.create(c).operating(officePlan()).status,'unavailable');
  c.hart.modules.runtime=ready({rules:{equipment_utilities:{effective:false},office_it:{effective:false}}});
  assert.equal(model.create(c).operating(officePlan()).status,'ready');
});

test('existing scoped commitments and outages are observed without adding accrued balances',()=>{
  const c=planning(); c.hart.modules.runningCosts.data.officeTypeIds.push('office');
  c.rlo.modules.requirements=disabled();
  c.hart.modules.runningCosts.data.currentSites[0].address={street:'Test',number:1};
  c.rlo.modules.company.data.sites=[{address:{street:'Test',number:1},managerDailyAllowanceCents:100,
    overtime:{active:true,fromDay:9,untilDay:10,dailyCents:200},cover:[],licences:[]}];
  c.rlo.modules.utilities.data.accounts=['power','water','internet'].map(service=>({address:{street:'Test',number:1},service,state:'active',
    monthCents:6000,accruedCents:999999,owedCents:888888,outageFromHour:9*24+23,outageUntilHour:10*24+2}));
  const p=officePlan();p.existing=true;
  const result=model.create(c).operating(p);
  assert.equal(result.status,'ready');assert.equal(result.startupCents,0);
  assert.equal(result.componentCost(0).internet,0);assert.equal(result.componentCost(0).officeIt,0);
  assert.ok(result.componentCost(1).internet>0);assert.ok(result.componentCost(1).officeIt>0);
  assert.equal(result.componentCost(0).company,300);assert.equal(result.componentCost(1).company,100);
  assert.ok(result.dayCost(0)<888888);
  c.rlo.modules.company.data.sites[0].cover=[{active:true,fromDay:1,untilDay:10,dailyCents:50}];
  const expiry=model.create(c).operating(p);
  assert.equal(expiry.componentCost(0).company,350);
  assert.equal(expiry.dayCost(2),null);
});

test('factory course quotes are charged once, exclude owned machines and preserve enrolled/unknown states',()=>{
  const c=planning(), lines=[['ba:itemname_industrialsewingmachine',4]];
  const adapter=model.create(c);
  let result=adapter.factoryRequirements(lines);
  assert.equal(result.status,'ready');assert.equal(result.startupCents,120000);assert.equal(result.totalCents,360000);
  assert.equal(result.requirements.length,1);
  assert.equal(adapter.factoryRequirements(lines,[['ba:itemname_industrialsewingmachine',4]]).startupCents,0);
  c.rlo.modules.education.data.courses[0].qualified=true;
  assert.equal(model.create(c).factoryRequirements(lines).startupCents,0);
  c.rlo.modules.education.data.courses[0].qualified=false;
  c.rlo.modules.education.data.courses[0].enrollment={status:'studying',paidCents:120000};
  result=model.create(c).factoryRequirements(lines);
  assert.equal(result.requirements[0].status,'in-progress');assert.equal(result.startupCents,0);assert.equal(result.totalCents,null);
  c.rlo.modules.education.data.courses[0].enrollment=null;
  c.hart.modules.factoryPurchases.data.heldRecords={status:'unavailable',data:null};
  assert.equal(model.create(c).factoryRequirements(lines).status,'unavailable');
  c.hart.modules.factoryPurchases.data.gate.effective=false;
  assert.equal(model.create(c).factoryRequirements(lines).startupCents,0);
});

test('existing equipment baseline is the owner billing cache, additions and explicit removals stay separate',()=>{
  const c=planning(),p=officePlan();p.existing=true;
  c.rlo.modules.company=disabled();c.rlo.modules.requirements=disabled();
  c.hart.modules.runningCosts.data.currentSites[0].address={street:'Test',number:1};
  c.rlo.modules.utilities.data.internetEnabled=false;
  c.rlo.modules.utilities.data.accounts=['power','water'].map(service=>({address:{street:'Test',number:1},service,state:'active'}));
  const adapter=model.create(c),base=adapter.operating(p);
  const changedLines=adapter.operating({...p,lines:[['ba:itemname_computer',1000]]});
  assert.equal(base.dayCost(0),changedLines.dayCost(0));
  const added=adapter.operating({...p,existingExtraLines:[['ba:itemname_computer',2]]});
  assert.ok(added.dayCost(0)>base.dayCost(0));
  const removed=adapter.operating({...p,equipmentOverride:{openWatts:0,alwaysWatts:0,litresPerOpenHour:0,officeSeats:0}});
  assert.ok(removed.dayCost(0)<base.dayCost(0));
  c.rlo.modules.company=ready({sites:[{address:{street:'Test',number:1}}],partStates:{staff:'failed',cover:'disabled'}});
  assert.ok(model.create(c).operating(p).reasons.includes('company-staff-unavailable'));
});


test('disabled company parts ignore leftover licence and tax rows; failed licences remain unknown',()=>{
  const c=planning(),p=officePlan();
  c.rlo.modules.company.data.partStates.licences='disabled';
  c.rlo.modules.company.data.partStates.tax='disabled';
  let out=model.create(c).operating(p);
  assert.equal(out.status,'ready');assert.equal(out.startupCents,12000);
  assert.equal(out.renewals.length,0);assert.equal(out.companyAccountant,null);
  assert.equal(out.requirements.filter(r=>r.kind==='licence').length,0);
  c.rlo.modules.company.data.partStates.licences='failed';
  out=model.create(c).operating(p);
  assert.equal(out.status,'unavailable');assert.ok(out.reasons.includes('company-licences-unavailable'));
  c.rlo.modules.company.data.partStates.licences='disabled';
  c.rlo.modules.requirements={status:'failed',data:null};
  assert.equal(model.create(c).operating(p).status,'ready');
});


test('existing site needs no company record when all site cost parts are disabled',()=>{
  const c=planning(),p=officePlan();p.existing=true;
  c.rlo.modules.company.data.partStates={staff:'disabled',cover:'disabled',licences:'disabled',tax:'disabled'};
  c.rlo.modules.utilities=disabled();c.hart.modules.runningCosts=disabled();
  let out=model.create(c).operating(p);
  assert.equal(out.status,'ready');assert.equal(out.dailyCents,0);assert.equal(out.startupCents,0);
  // Stale disabled rows may even be incomplete: none are dereferenced.
  c.rlo.modules.company.data.sites=[{address:{street:'Test',number:1}}];
  out=model.create(c).operating(p);assert.equal(out.status,'ready');assert.equal(out.dailyCents,0);
});


test('licence run-rate accrues fee per term independently from renewal dates and startup',()=>{
  const c=planning(),p=officePlan();c.hart.modules.runningCosts=disabled();c.rlo.modules.utilities=disabled();
  const fresh=model.create(c).operating(p);
  assert.equal(fresh.startupCents,10000);assert.equal(fresh.dailyCents,1000);
  assert.deepEqual(fresh.byDayCents,Array(7).fill(0));assert.equal(fresh.dayCost(13),10000);
  c.rlo.modules.company.data.partStates.staff='disabled';c.rlo.modules.company.data.partStates.cover='disabled';
  c.rlo.modules.company.data.sites=[{address:{street:'Test',number:1},licences:[{kind:0,valid:true,untilDay:10}]}];
  p.existing=true;
  let current=model.create(c).operating(p);
  assert.equal(current.startupCents,0);assert.equal(current.dailyCents,1000);assert.equal(current.dayCost(2),10000);
  c.rlo.modules.company.data.sites[0].licences[0].valid=false;
  current=model.create(c).operating(p);
  assert.equal(current.startupCents,10000);assert.equal(current.requirements[0].status,'required');
  assert.equal(current.dayCost(2),0);assert.equal(current.dayCost(12),10000); // Grant extends max(until, day-1).
});

test('component deltas cancel the same unknown cover renewal but retain changed unknown inputs',()=>{
  const c=planning(),p=officePlan();p.existing=true;
  c.hart.modules.runningCosts.data.currentSites[0].address={street:'Test',number:1};
  c.rlo.modules.requirements=disabled();c.rlo.modules.utilities.data.internetEnabled=false;
  c.rlo.modules.utilities.data.accounts=['power','water'].map(service=>({address:{street:'Test',number:1},service,state:'active'}));
  const site={address:{street:'Test',number:1},managerDailyAllowanceCents:100,overtime:{active:false},
    cover:[{active:true,fromDay:1,untilDay:10,dailyCents:50}],licences:[]};
  c.rlo.modules.company.data.sites=[site];
  const adapter=model.create(c),before=adapter.operating(p),after=adapter.operating({...p,existingExtraLines:[['ba:itemname_computer',2]]});
  assert.equal(before.dayCost(2),null);assert.equal(after.dayCost(2),null);
  const delta=model.deltaCosts(before,after);
  assert.equal(delta.status,'ready');assert.ok(delta.dailyCents>0);
  assert.equal(delta.componentCost(2).company,0);assert.ok(delta.dayCost(2)>0);
  site.cover[0].untilDay=12;
  const changed=model.create(c).operating({...p,existingExtraLines:[['ba:itemname_computer',2]]});
  assert.equal(model.deltaCosts(before,changed).dayCost(2),null,'different unknown commitment is not cancelled');
});

test('new site default raises are unknown while sick policy stays in the stated no-absence scope',()=>{
  const c=planning();c.rlo.modules.company.data.newSiteDefaults={raiseHourlyCents:500,sickPayPolicy:1};
  c.rlo.modules.company.data.sickShareThousandthsByPolicy=[0,1000];
  let quote=model.create(c).operating(officePlan());
  assert.ok(quote.reasons.includes('new-site-staff-defaults-unavailable'));
  c.rlo.modules.company.data.newSiteDefaults.raiseHourlyCents=0;
  quote=model.create(c).operating(officePlan());
  assert.equal(quote.status,'ready');assert.ok(quote.assumptions.includes('unforeseen-sick-pay-and-overtime-excluded'));
  c.rlo.modules.company.data.partStates.staff='disabled';c.rlo.modules.company.data.newSiteDefaults.raiseHourlyCents=500;
  assert.equal(model.create(c).operating(officePlan()).status,'ready');
});

test('long horizons cache daily components and utility arithmetic by weekday and season',()=>{
  const c=planning();let tariffReads=0;const terms=c.rlo.modules.utilities.data.terms,original=terms.unitCents;
  Object.defineProperty(terms,'unitCents',{get(){tariffReads++;return original;},enumerable:true});
  const quote=model.create(c).operating(officePlan());
  for(let k=0;k<20000;k++)quote.dayCost(k);
  const reads=tariffReads;
  for(let pass=0;pass<6;pass++)for(let k=0;k<20000;k++)quote.dayCost(k);
  assert.ok(reads<=60,`tariff reads are bounded by seasons and weekdays: ${reads}`);
  assert.equal(tariffReads,reads);assert.strictEqual(quote.componentCost(1234),quote.componentCost(1234));
});

test('adapter errors expose stable reason codes instead of native exception text',()=>{
  const adapter=model.create(planning()),p=officePlan();p.building.m2=null;
  assert.deepEqual(adapter.operating(p).reasons,['invalid-operating-input']);
  assert.deepEqual(adapter.factoryRequirements(null).reasons,['invalid-factory-input']);
});


test('missing current building classification does not become a zero equipment forecast',()=>{
  const c=planning(),p=officePlan();p.existing=true;
  c.rlo.modules.company=disabled();c.rlo.modules.requirements=disabled();
  c.hart.modules.runningCosts.data.currentSites[0].address={street:'Test',number:1};
  c.hart.modules.runningCosts.data.currentSites[0].equipmentApplies=null;
  c.rlo.modules.utilities.data.internetEnabled=false;
  c.rlo.modules.utilities.data.accounts=['power','water'].map(service=>({address:{street:'Test',number:1},service,state:'active'}));
  assert.ok(model.create(c).operating(p).reasons.includes('current-equipment-building-unavailable'));
});

test('future and unknown factory courses affect only their mapped purchases',()=>{
  const c=planning(),data=c.hart.modules.factoryPurchases.data;
  data.courses.push({courseId:100,itemIds:['future:machine'],status:'unavailable'});
  let adapter=model.create(c);
  assert.equal(adapter.factoryRequirements([['ba:itemname_industrialsewingmachine',1]]).status,'ready');
  assert.deepEqual(adapter.factoryRequirements([['future:machine',1]]).reasons,['factory-course-unavailable']);
  data.heldRecords.data=[{courseId:100,status:'unavailable'}];adapter=model.create(c);
  assert.equal(adapter.factoryRequirements([['ba:itemname_industrialsewingmachine',1]]).status,'ready');
  data.heldRecords.data.push({courseId:18,status:'unavailable'});
  assert.deepEqual(model.create(c).factoryRequirements([['ba:itemname_industrialsewingmachine',1]]).reasons,['held-course-unavailable']);
});
