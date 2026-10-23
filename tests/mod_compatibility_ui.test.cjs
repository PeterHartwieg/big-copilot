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
test('ownership refusals explain current owner effects without exposing unknown provider text', () => {
  const {b} = fixture();
  const p = b.gwProblem({error:'mod_owned',body:{owner:'rlo.managers',reasons:['manager-controls-scheduling'],effects:['manager-may-rewrite-week','<img src=x onerror=alert(1)>']}});
  assert.match(p.say,/A mod controls this change/);
  assert.match(p.text,/Nothing was changed/);
  assert.match(p.sub,/manager controls scheduling/);
  assert.match(p.sub,/replace these opening hours/);
  assert.match(p.sub,/A required mod condition could not be verified/);
  assert.doesNotMatch(p.sub,/<img|&lt;img|onerror/);
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


test('future unknown costs remain unavailable in ranges, charts and loan comparisons',()=>{
  const {b}=fixture(),unknown={status:'unavailable',reason:'future-cashflow-unavailable',offset:8};
  assert.match(b.osRange({low:3,mid:unknown,high:unknown}),/Unavailable.*future costs/);
  assert.equal(vm.runInContext('osMid({low:3,mid:{status:"unavailable"},high:null})',b),null);
  assert.match(b.osRange({low:{status:'unavailable',reason:'forecast-horizon-exceeded'}}),/Unavailable.*forecast horizon/);
  assert.match(b.osRange({low:null,mid:null,high:null}),/not at this profit/);
  const est={inv:{self:1000,firm:1200},profit:100,day:()=>null,days:{self:{low:unknown,mid:unknown,high:unknown}}};
  assert.match(b.osChart(est,'self'),/Unavailable/);
  Object.assign(b,{osMode:()=> 'self',osBreakDay:()=>unknown,osLoanDays:(own,day)=>{assert.equal(day(0),null);return unknown;},
    planFinFacts:(total,bank,amount,cells)=>cells({interest:1,repay:10,days:10,total:10})});
  const html=b.osFinFacts({},est,{},500);
  assert.match(html,/Unavailable.*future costs/);assert.doesNotMatch(html,/NaN|not at this profit|paid off at break even/);
  const cleaned=b.osSnapClean({inv:{},days:{self:{low:unknown,mid:unknown,high:unknown}}});
  assert.match(b.osRange(cleaned.days.self),/Unavailable/);
});

test('loan rate labels use each captured bank multiplier',()=>{
  const {b}=fixture(),bank={id:'bank',name:'Test Bank',rate:12,term:100,interestMultiplier:1};
  b.__bank=bank;vm.runInContext('D.openStore={finance:{banks:[__bank],multiplier:1.5}}',b);
  Object.assign(b,{planBank:()=>bank,osLoanLimit:()=>10000});
  const html=b.planFinanceHtml('os',{finance:{on:true}},2000,'',()=> 'facts');
  assert.match(html,/12% a year/);assert.doesNotMatch(html,/18% a year/);
});

test('unchanged estimate inputs reuse calculations and changed core or plan invalidates them',()=>{
  const {b}=fixture();let core={},calls=0;
  Object.assign(b,{osCore:()=>core,osEstimateUncached:()=>({serial:++calls})});
  const plan={type:'shop',optional:false},building={key:'A#1',rent:30};
  assert.equal(b.osEstimate(plan,building),b.osEstimate({...plan},{...building}));assert.equal(calls,1);
  plan.optional=true;b.osEstimate(plan,building);assert.equal(calls,2);
  core={};b.osEstimate(plan,building);assert.equal(calls,3);
});


test('unknown investments are unavailable, never persisted or described as full tuition',()=>{
  const {b}=fixture();
  vm.runInContext('D.openFactory={game:{},items:{},vendors:{},vehicles:{}};planTarget="new"',b);
  const inv={self:null,firm:null,upfrontSelf:null,upfrontFirm:null,b:{key:'A#1',address:'Test',deposit:null},out:{lines:[]},stores:[],items:1,
    fee:50,furniture:null,deposit:null,truck:0,delivery:0,boxes:0,modEducation:{totalCents:null,startupCents:0,requirements:[{courseId:18,status:'in-progress'}]},incomplete:['course-future-cost-unavailable']};
  for(const html of [b.ofSelfHtml(inv),b.ofFirmHtml(inv)]){
    assert.match(html,/Investment[\s\S]*Unavailable/);assert.doesNotMatch(html,/Includes full course tuition/);
  }
  Object.assign(b,{ofInvestment:()=>inv});
  assert.match(b.ofInvestHtml({mode:'self'}),/Items<\/span><b>Unavailable<\/b>/);
  const plan={site:null,mode:'self',inv:12345};b.ofSyncInvestment(plan);assert.equal(Object.hasOwn(plan,'inv'),false);
  assert.equal(vm.runInContext('ofCashUpfront({self:100,upfrontSelf:null},"self")',b),null);
  Object.assign(b,{osEstimate:()=>({inv:{self:null,firm:null}})});assert.equal(b.osSnapOf({},{}),null);
});

test('finance refusal names unsupported credit or principal basis even with no bank rows',()=>{
  const {b}=fixture();
  for(const [reason,text] of [['additional-credit-eligibility',/additional credit/],['principal-expense-basis',/principal as an expense/],['native-bank-terms',/bank terms/],['vehiclePrices',/vehicle prices/]]){
    b.__reason=reason;vm.runInContext('D.openStore={finance:{unavailable:__reason,banks:[]}}',b);
    const html=b.planFinanceHtml('os',{},1000,'',()=> 'unused');assert.match(html,text);
    if(reason!=='vehiclePrices')assert.doesNotMatch(html,/vehicle prices/);
  }
});


test('a selected bank with unknown secured eligibility keeps lender choice but no zero borrowing claim',()=>{
  const {b}=fixture(),bank={id:'secured',name:'Secured Bank',rate:10,term:100,unavailable:'secured-bank-eligibility'};
  b.__bank=bank;vm.runInContext('D.openStore={finance:{banks:[__bank],multiplier:1}}',b);
  Object.assign(b,{planBank:()=>bank});
  const plan={finance:{on:true,amount:500}};
  const html=b.planFinanceHtml('os',plan,1000,'',()=>{throw Error('must not quote');});
  assert.match(html,/secured-account borrowing eligibility could not be verified/);
  assert.match(html,/data-os-bank/);assert.doesNotMatch(html,/lends you up to|type="range"|data-os-fin-amount/);
  b.planFinanceUpdate('os',plan,1000,100,()=>{},()=>{throw Error('must not save unknown amount');});
  assert.equal(plan.finance.amount,500);
});


test('the store Items subtotal respects an unavailable selected equipment price',()=>{
  const {b}=fixture();
  vm.runInContext('D.openStore={priceUnavailable:["counter"]}',b);
  const html=b.osToolbar({type:'shop',mode:'self'},{self:null,firm:null,items:1},{lines:[['counter',1]],furniture:98765});
  assert.match(html,/Items<\/span><b>Unavailable<\/b>/);assert.doesNotMatch(html,/98,765/);
});

test('expansion keeps readable model diagnostics for a valid shop with debt, campaigns, raises or closures',()=>{
  const {b}=fixture();
  vm.runInContext(`
    D.openStore={game:{promo:0.5,wages:0.7,capInitial:true,satisfaction:95,wageBase:{cashier:16,cleaner:12,guard:15,perCashier:30}},
      hoods:{H:{idx:1.2,strength:1,demands:0,interior:0}},
      types:{T:{model:'retail',products:[['P',1]],amt:1,days:Array(7).fill(1),hours:Array(24).fill(1),layouts:{}}},
      market:{P:{p:10,r:0.5,d:1,s:0,cost:4,hoods:{H:[0,0,null]}}},built:{k:{sells:[]}},
      modEconomy:{day:12,rlo:{modules:Object.fromEntries(['prices','company','utilities','requirements','interiors','footfall','closures'].map(k=>[k,{status:'disabled'}]))}}};
    D.openStore.modEconomy.rlo.modules.prices={status:'ready',data:{costFactorThousandths:1000,takingsFactorThousandths:1000,adjustmentQuiet:3,livingTransactionTypes:[],carriedDebtInSiteForecast:true}};
    D.premises={buildings:[{hood:'H',cap:20,m2:100,traffic:20,layout:'C1',rent:50,key:'k'}]};
    D.hours=[{key:'k',open:[[[10,11]],[],[],[],[],[],[]]}];
    spExpansionState={open:true,extraCost:0,rows:new Set()};
  `,b);
  b.odNeed=()=>true;
  const shop={key:'k',typeSlug:'T',satisfaction:{overall:50},promotion:20};
  const result=b.spExpansionResult(shop);
  assert.equal(result.rows,null);assert.deepEqual(Array.from(result.reasons),['company-carried-debt-unavailable']);
  const html=b.spExpansionBody(shop);
  assert.match(html,/cannot allocate the company's carried debt/);
  assert.doesNotMatch(html,/known opening hours|current building-capacity rules/);
  for(const effect of ['campaign','raise','closure']){
    b.__effect=effect;
    vm.runInContext(`
      D.premises.buildings[0].key='road#1'; D.hours[0].key='road#1'; D.openStore.built={'road#1':{sells:[]}};
      var modules=D.openStore.modEconomy.rlo.modules;
      modules.prices={status:'disabled'};
      modules.company={status:'ready',data:{partStates:{staff:'ready',marketing:'ready'},sites:[{address:{street:'road',number:1},
        raises:__effect==='raise'?[{raiseHourlyCents:100}]:[],campaign:{active:__effect==='campaign'}}]}};
      modules.closures=__effect==='closure'?{status:'ready',data:{rows:[{address:{street:'road',number:1}}]}}:{status:'disabled'};
    `,b);
    const current={...shop,key:'road#1'},result=b.spExpansionResult(current),html=b.spExpansionBody(current);
    assert.deepEqual(Array.from(result.reasons),['mod-profit-inputs-unavailable'],effect);
    assert.match(html,/Current mod prices, staffing, campaigns or opening restrictions/);
    assert.doesNotMatch(html,/mod-profit-inputs-unavailable|known opening hours/);
  }
});

test('expansion diagnostic reasons are readable and the generic fallback is only for missing reasons',()=>{
  const {b}=fixture();
  vm.runInContext('D.openStore={};spExpansionState={open:true,extraCost:0,rows:new Set()}',b);
  b.odNeed=()=>true;
  for(const [reason,expected] of [
    ['expansion-interior-context-unavailable',/interior effect/],
    ['expansion-entrance-fee-context-unavailable',/entrance-fee effect/],
    ['expansion-price-demand-context-unavailable',/combined price and customer-demand effects/],
    ['expansion-equipment-price-unavailable',/price of equipment/]]){
    b.spExpansionResult=()=>({rows:null,reasons:[reason]});
    const html=b.spExpansionBody({typeSlug:'T'});
    assert.match(html,expected);assert.doesNotMatch(html,/known opening hours|expansion-.*-unavailable/);
  }
  b.spExpansionResult=()=>({rows:null,reasons:[]});
  assert.match(b.spExpansionBody({typeSlug:'T'}),/known opening hours/);
});

test('demand and basket diagnostics are readable and unknown internal codes stay hidden',()=>{
  const {b}=fixture();
  for(const [codes,words] of [
    [['expansion-neighbour-cashflow-unavailable'],/cash flow at your nearby shops/],
    [['expansion-operating-cost-unavailable'],/additional operating costs/],
    [['interiors-owner-unavailable','interior-site-unavailable','interior-district-unavailable'],/interior/],
    [['footfall-owner-unavailable','footfall-site-unavailable','price-district-unavailable'],/customer-demand/],
    [['city-price-owner-unavailable','planned-prices-unavailable','price-tolerance-unavailable'],/price/i],
    [['hart-ambience-owner-inputs-unavailable','hart-retail-demand-unavailable'],/demand/],
    [['cafe-owner-unavailable','cafe-rule-unknown','cafe-pairing-unproven'],/internet-cafe/],
    [['basket-share-unknown','basket-product-set-unknown','basket-order-bound-unknown','basket-eligible-products-unknown','basket-product-eligibility-unproven','basket-product-set-incomplete'],/Eligible products and per-order quantities/],
    [['basket-per-order-cap-may-bind','basket-order-bound-inconsistent'],/per-order limit/]]){
    for(const code of codes){const text=b.mcReason(code);assert.match(text,words,code);assert.ok(!text.includes(code));}
  }
  vm.runInContext('D.openStore={};spExpansionState={open:true,extraCost:0,rows:new Set()}',b);
  b.odNeed=()=>true;
  for(const code of ['future-provider-private-error','<img src=x onerror=alert(1)>','toString']){
    assert.equal(b.mcReason(code),'A required mod condition could not be verified.');
    b.spExpansionResult=()=>({rows:null,reasons:[code]});
    const html=b.spExpansionBody({typeSlug:'T'});
    assert.match(html,/A required mod condition could not be verified/);assert.ok(!html.includes(code));
  }
});

test('known interior and internet blockers explain the condition rather than unverifiable inputs',()=>{
  const {b}=fixture();
  for(const [reason,expected] of [
    ['interior-standard-unattainable',/interior standard cannot be reached with the available walls and floors/],
    ['internet-not-active',/internet connection is not active/]]){
    const html=b.mcCostsHtml({status:'unavailable',dailyCents:null,startupCents:null,reasons:[reason]});
    assert.match(html,expected);assert.doesNotMatch(html,/could not be verified/);assert.ok(!html.includes(reason));
  }
});

test('audited model, staffing and course refusal reasons have specific wording',()=>{
  const {b}=fixture(),generic=b.mcReason('future-unknown-reason');
  for(const [codes,words] of [
    [['interior-standard-unavailable'],/interior meets/],
    [['catalogue-price-unavailable'],/catalogue price/],
    [['city-prices-unavailable'],/city price adjustments/],
    [['company-staff-unavailable'],/company staffing costs/],
    [['company-cover-unavailable'],/company insurance costs/],
    [['hart-equipment-unknown'],/equipment utility costs/],
    [['hart-officeIt-unknown'],/office IT costs/],
    [['hart-utility-owner-disabled'],/utility provider is disabled/],
    [['utility-type-unavailable'],/utility category/],
    [['utility-account-identities-unresolved'],/utility accounts/],
    [['licence-type-unavailable'],/licences required/],
    [['mod-model-unavailable'],/model needed/],
    [['closure-observations-unavailable'],/restrictions on opening/],
    [['not-offered'],/not currently offered/],
    [['closed'],/closed to enrollment/],
    [['already'],/already enrolled/],
    [['passed'],/already completed/],
    [['needs'],/prerequisite course must be completed/],
    [['full'],/limit on courses/],
    [['nodistance'],/does not offer distance learning/],
    [['cash-insufficient','nomoney'],/not enough cash/],
    [['loan-full'],/student-loan capacity/]]){
    for(const code of codes){const text=b.mcReason(code);assert.match(text,words,code);assert.notEqual(text,generic);}
  }
  for(const code of ['equipmentUtilities','officeIt','factoryDiplomas','operatingCosts','economyUnknown','marketingUnknown']){
    assert.equal(b.mcReason(code),b.planCompatibilityText({compatibility:{test:[code]}},'test'));
    assert.notEqual(b.mcReason(code),generic);
  }
});

test('factory card preserves known course refusals in each prerequisite row',()=>{
  const {b}=fixture(),economy=require('../template/mod-economy-model.js');
  vm.runInContext('D.openFactory={game:{},items:{},vendors:{},vehicles:{}};planTarget="new"',b);
  for(const reason of ['not-offered','closed','already','passed','needs','full','nodistance','cash-insufficient','loan-full',null]){
    const companion={hart:{modules:{factoryPurchases:{status:'ready',data:{gate:{effective:true},
      courses:[{courseId:18,itemIds:['machine']}],heldRecords:{status:'ready',data:[]}}}}},
      rlo:{modules:{education:{status:'ready',data:{courses:[{courseId:18,offered:true,prerequisitesMet:true,qualified:false,enrollment:null,
        quotes:[{mode:0,loan:false,quoteStatus:'ineligible',reason}]}]}}}}};
    const education=economy.create(companion).factoryRequirements([['machine',1]]);
    assert.equal(education.requirements[0].status,'ineligible');
    const inv={self:null,firm:null,upfrontSelf:null,upfrontFirm:null,b:{key:'A#1',address:'Test',deposit:0},out:{lines:[]},stores:[],items:1,
      fee:0,furniture:100,deposit:0,truck:0,delivery:0,boxes:0,modEducation:education,modRequirements:education.requirements,incomplete:education.reasons};
    b.ofInvestment=()=>inv;
    const html=b.ofInvestHtml({mode:'self'}),row=html.match(/<li><b>Factory course 18<\/b>(.*?)<\/li>/)?.[1];
    assert.ok(row,reason);assert.ok(row.includes(b.mcReason(reason || 'education-ineligible')),reason);
    assert.doesNotMatch(html,/This prerequisite could not be verified/);
  }
});

test('other prerequisite statuses distinguish held records, active studies, qualifications and unknown facts',()=>{
  const {b}=fixture();
  for(const [requirement,expected] of [
    [{courseId:1,status:'in-progress'},/Already enrolled; no new enrollment fee/],
    [{courseId:1,status:'qualified'},/Qualification already verified/],
    [{courseId:1,status:'held'},/An existing record is held; no new fee is assumed/],
    [{kind:'licence',licence:1,status:'held'},/current licence is already held/],
    [{courseId:1,status:'required'},/Required before opening/],
    [{kind:'internet',status:'required'},/Required before opening/],
    [{courseId:1,status:'unknown'},/This prerequisite could not be verified/]]){
    const html=b.mcRequirementsHtml([requirement]);assert.match(html,expected);
    if(requirement.status!=='unknown')assert.doesNotMatch(html,/This prerequisite could not be verified/);
  }
});
