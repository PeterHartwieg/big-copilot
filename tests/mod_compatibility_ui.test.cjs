'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {loadBoard, recordingDocument} = require('./_board.cjs');
function fixture(){
  const doc = recordingDocument(), b = loadBoard({document: doc.document, __source:{}}, {edit: s => s.replace("const SOURCE = window.LEDGER_SOURCE ||", "const SOURCE = __source ||")});
  vm.runInContext('D = {meta:{character:"test",day:12},businesses:[],mods:{}}', b);
  return {b, ...doc};
}
test('ownership refusals explain current owner effects and escape unknown provider text', () => {
  const {b} = fixture();
  const p = b.gwProblem({error:'mod_owned',body:{owner:'rlo.managers',reasons:['manager-controls-scheduling'],effects:['manager-may-rewrite-week','<img src=x onerror=alert(1)>']}});
  assert.match(p.say,/A mod controls this change/);
  assert.match(p.text,/Nothing was changed/);
  assert.match(p.sub,/manager controls scheduling/);
  assert.match(p.sub,/replace these opening hours/);
  assert.match(p.sub,/&lt;img/);
  assert.doesNotMatch(p.sub,/<img/);
  assert.equal(p.retry,true);
  const unknown = b.gwProblem({error:'ownership_unknown',body:{reasons:['fresh-managers-disabled-proof-required'],effects:[]}});
  assert.match(unknown.sub,/does not confirm.*switched off/);
  assert.match(unknown.say,/could not be verified/);
});
test('an ownership refusal on undo keeps the saved undo and offers a fresh retry', async () => {
  const {b} = fixture();
  let failed;
  Object.assign(b,{gwPaint:()=>{},gwState:()=>({}),gwLink:()=>({source:'game'}),gwWhose:()=> 'same',gwApprovalView:()=>null,
    gwFailed:(dlg,spec,res,retry)=>{failed={res,retry};}});
  const spec = {kind:'schedule'};
  b.__spec=spec;
  vm.runInContext('gwUndoable.schedule={spec:__spec,whose:"same"}; SOURCE.write=async()=>({error:"mod_owned",body:{reasons:["manager-controls-scheduling"],effects:[]}})',b);
  const dlg = {open:true,dataset:{}};
  await b.gwUndo(spec,dlg);
  assert.equal(vm.runInContext('!!gwUndoable.schedule',b),true);
  assert.equal(failed.res.error,'mod_owned');
  assert.equal(typeof failed.retry,'function');
});
test('costs show prerequisites, enrollment and missing estimates without turning null into zero', () => {
  const {b}=fixture();
  const html=b.mcCostsHtml({status:'unavailable',dailyCents:null,startupCents:12345,requirements:[{kind:'internet',status:'required',startupCents:12345,preparationDays:2}],reasons:['internet-coverage-unavailable']},[{courseId:4,status:'in-progress'}]);
  assert.match(html,/\$123/);
  assert.match(html,/Allow 2 days/);
  assert.match(html,/Already enrolled; no new enrollment fee/);
  assert.match(html,/completion is not guaranteed/);
  assert.match(html,/estimate is incomplete/);
  assert.doesNotMatch(html,/\$0|per day on average/);
  assert.match(b.mcCostsHtml({status:'ready',dailyCents:100,startupCents:0},[],[],true),/\$7 per week/);
});
test('paid, accrued and owed observations remain separate and escaped', () => {
  const {b}=fixture();
  const html=b.mcAccountingHtml({coverage:'partial',knownOmittedCategories:['<script>'],rows:[{category:'power',basis:'paid',fromDay:1,toDay:7,cents:10000},{category:'power',basis:'accrued',fromDay:8,toDay:12,cents:2000},{category:'power',basis:'owed',fromDay:1,toDay:12,cents:3000}]});
  assert.match(html,/Paid.*\$100/);assert.match(html,/Accrued.*\$20/);assert.match(html,/Owed.*\$30/);
  assert.match(html,/Recorded profit is unchanged/);assert.doesNotMatch(html,/\$150|<script>/);
  assert.match(html,/&lt;script&gt;/);
});
test('incomplete tax hides projection and recommendations while retaining recorded values', () => {
  const {b}=fixture();
  const html=b.reTaxPanel({tax:{projectionIncomplete:['mod-tax-effects-outside-native-forecast'],sales:1000,deductions:100,baseEnd:9999,spend:9999,assessed:true,pick:['x']}},false);
  assert.match(html,/Recorded sales: \$1,000; recorded deductions: \$100/);
  assert.match(html,/Mod tax effects are outside/);
  assert.doesNotMatch(html,/9,999|Buy these|Spend|projected taxable sales/);
});
test('current HART capabilities and statement payback are named without promising complete support',()=>{
  const {b,element}=fixture();
  vm.runInContext('D.mods.hart={status:"partial",version:"<v>",blockedByLegacy:true,gameplayActive:false,capabilities:{runtime:"ready",runningCosts:"unavailable"}}',b);
  b.drawMods();
  const html=element('secMods').innerHTML;
  assert.match(html,/HART Mod Pack/);assert.match(html,/legacy HART mod blocks/);
  assert.match(html,/runningCosts: report unavailable/);assert.match(html,/&lt;v&gt;/);
  assert.doesNotMatch(html,/id=undefined|do not yet account for RLO/);
  assert.match(b.paybackTip({basis:'statement-profit',cost:{},firm:{state:'unknown'}}),/recorded statement profit/);
});
test('owned factory costs use the actual factory address rather than a former location choice',()=>{
  const {b}=fixture();
  vm.runInContext('planTarget="current-factory"',b);
  let input;
  Object.assign(b,{ofLines:()=>[],ofNow:()=>({}),premises:()=>({buildings:[{key:"current-factory"},{key:"old-location"}]}),ofCore:()=>({running:value=>{input=value;return null;}})});
  b.ofRunning({key:'old-location'},{});
  assert.equal(input.building.key,'current-factory');
  assert.equal(input.owned,true);
});
test('mod-blocked staffing explains the actual condition and unknown quotes are not selectable',()=>{
  const {b}=fixture();
  const row={key:'A#1',failed:true,unavailable:'modCompatibility',modReasons:['ordinary-wage-unavailable','late-opening-permit-missing']};
  const html=b.spRosterNone(row,null,'A#1');
  assert.match(html,/Current hourly wages could not be verified/);
  assert.match(html,/late opening hours need a current permit/);
  assert.doesNotMatch(html,/schedule or stations could not be read/);
  b.__candidate={skill:'cashier',level:100,wage:12,wageUnavailable:true,demands:[]};
  assert.equal(vm.runInContext('hrPasses(__candidate,"cashier",{min:0,max:null,ex:[]})',b),false);
  assert.equal(vm.runInContext('hrWage(null)',b),'Unavailable');
});
test('factory course UI separates full tuition from immediate cash',()=>{
  const {b}=fixture();
  const html=b.mcEducationHtml({requirements:[{courseId:18}],totalCents:300000,startupCents:100000});
  assert.match(html,/tuition in investment: \$3,000; cash needed upfront: \$1,000/);
  assert.match(html,/payments depend on course sessions/);
});

test('planner cores reuse immutable inputs and invalidate on replacement, day and option changes',()=>{
  const {b}=fixture();
  vm.runInContext('D.openStore={};D.openFactory={};D.plan={sources:{}};D.supply={factories:{aliases:{}}};__store=osCore();__factory=ofCore()',b);
  assert.equal(vm.runInContext('osCore()===__store && ofCore()===__factory',b),true);
  vm.runInContext('D.meta.day++;',b);
  assert.equal(vm.runInContext('osCore()===__store || ofCore()===__factory',b),false);
  vm.runInContext('__store=osCore();osOptOn=!osOptional()',b);
  assert.equal(vm.runInContext('osCore()===__store',b),false);
  vm.runInContext('__factory=ofCore();D={...D}',b);
  assert.equal(vm.runInContext('ofCore()===__factory',b),false);
});
test('incomplete investments block payback and financing while education uses immediate cash',()=>{
  const {b}=fixture();
  Object.assign(b,{osCore:()=>({type:()=>({model:'retail'})}),osInvestment:()=>({self:1000,incomplete:['deposit-adjustment-unavailable']}),osIsHq:()=>false});
  const estimate=b.osEstimate({type:'shop'},{});
  assert.ok(estimate.none);assert.equal(estimate.days,undefined);assert.equal(b.osFinHtml({},estimate),'');
  assert.equal(b.ofFinHtml({}, {self:1000,incomplete:['course-future-cost-unavailable']}),'');
  assert.equal(vm.runInContext('ofCashUpfront({self:3000,upfrontSelf:1000},"self")',b),1000);
});

test('unknown payroll never appears as a precise site cost or overview cost base',()=>{
  const {b,element}=fixture();
  assert.equal(b.mcWageMoney({wageUnavailable:true},0),'Unavailable');
  assert.equal(b.mcWageMoney({staffCostUnavailable:true},900),'Unavailable');
  assert.equal(b.mcWageMoney({},0),'$0');
  Object.assign(b,{rlShown:()=>false,wireTips:()=>{}});
  vm.runInContext('D.kpi={profitAvg7:0,profitPrev7:0,rentBill:100,netWorth:null,debt:0,profitSum7:0,profitYesterday:0,revenue:0,customers:0,cash:0};D.staff={dailyCost:987654,wageUnavailable:true};D.daily=[];D.loans=[];',b);
  b.drawKpis();
  const fixed=element('kpis').innerHTML.split('data-kpi="fixed"')[1];
  assert.match(fixed,/Current hourly wages could not be verified/);assert.doesNotMatch(fixed,/987[,.]654|987[,.]754/);
});

test('ordinary-hourly recommendations retain known amounts and explain their payroll limits',()=>{
  const {b}=fixture();
  assert.match(b.mcOrdinaryWageNote({cost:{basis:'ordinary-hourly'}}),/ordinary hourly pay.*overtime, sick pay and future absences.*Actual payroll can differ/);
  assert.equal(b.mcOrdinaryWageNote({cost:{basis:'native'}}),'');
  assert.equal(b.mcWageMoney({wageBasis:'ordinary-hourly'},150),'$150');
  assert.match(b.mcReason('office-unread-hours-with-mod-demand'),/no measured working hours.*default schedule/);
});

test('accounting observations identify each site and company scope without combining balances',()=>{
  const {b}=fixture();
  vm.runInContext('D.businesses=[{key:"A#1",address:"1 First Street"},{key:"B#2",address:"2 Second Street"}]',b);
  const html=b.mcAccountingHtml({coverage:'partial',rows:[
    {scope:'place',address:{street:'A',number:1},category:'utilities.power',basis:'paid',fromDay:1,toDay:7,cents:10000},
    {scope:'place',address:{street:'B',number:2},category:'utilities.power',basis:'owed',fromDay:1,toDay:7,cents:20000},
    {scope:'company',address:null,category:'tax.accountant',basis:'accrued',fromDay:1,toDay:7,cents:null}]});
  assert.match(html,/1 First Street · Electricity · Paid/);assert.match(html,/2 Second Street · Electricity · Owed/);
  assert.match(html,/Company-wide · Accountant · Accrued.*Unavailable/);assert.doesNotMatch(html,/\$300|\$0/);
});

test('unavailable catalogue prices and exact native lease quotes have explicit labels',()=>{
  const {b}=fixture(),facts={priceUnavailable:['a'],items:{a:{p:0},b:{p:0},c:{p:20}}};
  assert.equal(b.mcItemMoney(facts,'a',2),'Unavailable');assert.equal(b.mcItemMoney(facts,'b',2),'$0');
  assert.equal(b.mcItemMoney(facts,'c',2),'$40');assert.equal(b.mcPriceMoney(facts,[['a',2],['c',2]],40),'Unavailable');
  assert.match(b.mcLeaseNote({leaseBasis:'native-live-quote'},'about 60 days'),/Current game lease quote/);
  assert.doesNotMatch(b.mcLeaseNote({leaseBasis:'native-live-quote'},'about 60 days'),/60/);
  assert.equal(b.mcLeaseMoney({leaseBasis:'unavailable',deposit:null},0),'Unavailable');
  assert.equal(b.mcLeaseMoney({status:'mine',leaseBasis:'unavailable',deposit:null},0),'$0');
});
