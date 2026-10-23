const assert=require('node:assert/strict');
const {test}=require('node:test');
const model=require('../template/mod-demand-model.js');
const vectors=require('../contracts/rlo/planning-vectors.json');

test('money and wage helpers match owner-produced rounding vectors',()=>{
  for(const v of vectors.companyShare)assert.equal(model.companyShare(v.cents,v.factor),v.expected,JSON.stringify(v));
  for(const v of vectors.cityAdjust)assert.equal(model.cityAdjust(v.amount,v.factor,vectors.adjustmentQuiet),v.expectedAdjustmentMoney,JSON.stringify(v));
});
test('portable promotion matches owner float32 path, clamps and exact own no-change path',()=>{
  for(const v of vectors.promotions)assert.equal(model.promotion({terms:vectors.promotionTerms,...v}),v.expected,JSON.stringify(v));
});
test('portable decor and interior effects match production owner vectors',()=>{
  for(const v of vectors.interiors){
    const terms={...vectors.interiorTerms,standardScaleThousandths:v.standardScale,decorMille:v.decorMille,priceScaleThousandths:v.priceScale};
    const points=terms.categoryIds.map((_,i)=>model.kindPoints(terms,i,v.copiesEachCategory));
    const out=model.interiorModel({...v,terms,points});
    assert.deepEqual(points,v.expected.points);
    for(const [key,value] of Object.entries(v.expected))if(key!=='points')assert.deepEqual(out[key],value,`${key} ${JSON.stringify(v)}`);
  }
});
test('price tolerance follows float32 item ratios and owner rounding',()=>{
  for(const v of vectors.priceTolerance){
    const out=model.priceTolerance({terms:vectors.priceToleranceTerms,prices:[['p',v.amount]],markets:[{itemId:'p',marketAmount:v.market}],
      index:v.index,tolerance:v.tolerance,bears:v.bears,monopolies:v.monopoly?['p']:[],cycle:v.cycle,district:v.district});
    assert.deepEqual(out,v.expected,JSON.stringify(v));
  }
});

const ready=data=>({status:'ready',data});
const disabled=()=>({status:'disabled',data:null});
function report(){
  return {day:12,rlo:{modules:{prices:ready({}),interiors:ready({model:'rlo-interiors-v1',terms:vectors.interiorTerms,
    districts:[{districtId:'hood',income:113,nativeMinimum:20}],sites:[],
    items:[{itemId:'art',category:0},{itemId:'plant',category:1}]}),
    footfall:ready({model:'rlo-footfall-v1',terms:vectors.promotionTerms,sites:[],priceTolerance:{...vectors.priceToleranceTerms,
      districts:[{districtId:'hood',priceIndex:'1',toleranceThousandths:1000,cyclePercent:-4,districtPercent:1}],
      items:[{itemId:'product',marketAmount:'10'}],monopolies:[]}})}}};
}
function plan(){return {typeId:'shop',building:{key:'Test#1',hood:'hood',m2:100,baseMultiplier:'0.25',interiorKind:'shop'},
  lines:[['art',2],['plant',2]],prices:[['product',10]],interiorScore:70,ownPromotion:50,existing:false};}

test('new-site planning uses proposed prices and outfit, preserving own promotion exactly once',()=>{
  const c=report(),p=plan(),out=model.create(c).planning(p);
  assert.equal(out.status,'ready',JSON.stringify(out));
  assert.equal(out.promotion,model.promotion({terms:vectors.promotionTerms,own:50,issue:0,
    ambient:out.priceTolerance.footfallPercent,interior:out.interior.effectiveFootfall,baseMultiplier:'0.25'}));
  assert.equal(out.basketThousandths,1000+out.interior.effectiveBasket);
  assert.equal(out.officeBoostThousandths,0);
  p.prices=[['product',100]];
  const expensive=model.create(c).planning(p);
  assert.ok(expensive.priceTolerance.pricePercent<out.priceTolerance.pricePercent);
  assert.ok(expensive.promotion<=out.promotion);
  p.lines.push(['unknown',1]);
  assert.equal(model.create(c).planning(p).status,'unavailable');
});

test('existing observation replaces only city price part and never multiplies a written promotion again',()=>{
  const c=report(),p=plan();p.existing=true;
  c.rlo.modules.interiors.data.sites=[{address:{street:'Test',number:1},basketThousandths:20,officeBoostThousandths:0,
    footfallPercent:3,priceToleranceThousandths:10}];
  c.rlo.modules.footfall.data.sites=[{address:{street:'Test',number:1},status:'ready',ownPromotion:50,writtenPromotion:80,
    registrationPromotionAtCapture:80,issuePercent:-3,ambientPercent:10,cityPercent:2,interiorPercent:3,baseMultiplier:'0.25'}];
  const out=model.create(c).planning(p);
  assert.equal(out.status,'ready');
  assert.equal(out.promotion,model.promotion({terms:vectors.promotionTerms,own:50,issue:-3,
    ambient:8+out.priceTolerance.footfallPercent,interior:3,baseMultiplier:'0.25'}));
  assert.equal(out.basketThousandths,1020);
  c.rlo.modules.footfall.data.sites[0].status='unavailable';
  assert.equal(model.create(c).planning(p).status,'unavailable');
});

test('HART ambience unknown affects retail only, Cafe requires proven pairs',()=>{
  const c=report(),p=plan();
  c.hart={modules:{retailDemand:ready({ambience:{status:'unavailable'},cafe:ready({state:{effective:true},
    sessionsPerStationPerHour:2,currentSites:[{address:{street:'Test',number:1},status:'ready',usableStations:3}]})})}};
  assert.equal(model.create(c).planning(p).status,'unavailable');
  p.building.interiorKind='office';
  assert.equal(model.create(c).planning(p).status,'ready');
  c.hart.modules.retailDemand.data.ambience=disabled();p.building.interiorKind='shop';p.building.cafe=true;
  assert.ok(model.create(c).planning(p).reasons.includes('cafe-pairing-unproven'));
  p.outfit={usableCafeStations:2};
  assert.equal(model.create(c).planning(p).cafeCapacityPerHour,4);
});

test('vanilla and disabled models preserve native promotion and unit basket',()=>{
  const out=model.create({}).planning(plan());
  assert.equal(out.status,'ready');assert.equal(out.promotion,50);assert.equal(out.basketThousandths,1000);assert.equal(out.officeBoostThousandths,0);
  assert.throws(()=>model.companyShare(Number.MAX_SAFE_INTEGER+1,1000));
});

test('native hourly wages round float32 cents to even before company factors',()=>{
  assert.equal(model.wageCents(1.005,1000),100);
  assert.equal(model.wageCents(1.015,1000),102);
  assert.equal(model.wage(1.015,1500),1.53);
  assert.equal(model.adjustedMoney(10.5,1100,10),Math.fround(11.5));
});

test('office client carry and basket counts match production owner vectors',()=>{
  assert.ok(vectors.officeClients.length>0);assert.ok(vectors.basketExtra.length>0);
  for(const v of vectors.officeClients)assert.deepEqual(model.officeClients({terms:vectors.interiorTerms,
    gameClients:v.gameClients,free:v.free,boostThousandths:v.boost,carryThousandths:v.carry}),
    {added:v.expected,carryThousandths:v.expectedCarry},JSON.stringify(v));
  for(const v of vectors.basketExtra)assert.equal(model.basketExtra({terms:vectors.interiorTerms,
    products:v.products,shareThousandths:v.share,draw:v.draw,office:v.office}),v.expected,JSON.stringify(v));
});

test('office clients carry fractions and discard excess at staffed capacity',()=>{
  const terms=vectors.interiorTerms;
  let value=model.officeClients({terms,gameClients:3,free:10,boostThousandths:150});
  assert.deepEqual(value,{added:0,carryThousandths:450});
  value=model.officeClients({terms,gameClients:4,free:10,boostThousandths:150,carryThousandths:value.carryThousandths});
  assert.deepEqual(value,{added:1,carryThousandths:50});
  assert.deepEqual(model.officeClients({terms,gameClients:10,free:0,boostThousandths:200,carryThousandths:900}),{added:0,carryThousandths:0});
});

test('basket additions use eligible product mix and service exclusions, never entrance fees',()=>{
  const terms=vectors.interiorTerms;
  assert.equal(model.basketExtra({terms,products:3,shareThousandths:100,draw:299}),1);
  assert.equal(model.basketExtra({terms,products:3,shareThousandths:100,draw:300}),0);
  assert.deepEqual(model.expectedBasket({terms,orderItems:['fee','service','bread'],eligibleProducts:['service','bread','milk'],
    serviceProducts:['service'],entranceFees:['fee'],shareThousandths:1000}),{service:0,bread:1,milk:1});
  const extra=model.expectedBasket({terms,orderItems:['bread'],eligibleProducts:['bread','milk'],shareThousandths:100});
  assert.ok(Math.abs(extra.bread-.05)<1e-12);assert.ok(Math.abs(extra.milk-.05)<1e-12);
});

test('adapters index captured catalogs once, preserving captures and repeated results',()=>{
  const c=report(),p=plan(),before=JSON.stringify(c),adapter=model.create(c),expected=adapter.planning(p);
  // An accidental repeated array join would call this; indexed maps need none.
  for(const rows of [c.rlo.modules.interiors.data.items,c.rlo.modules.interiors.data.districts,c.rlo.modules.footfall.data.priceTolerance.items])
    Object.defineProperty(rows,'find',{value:()=>{throw new Error('repeated catalogue scan');}});
  for(let i=0;i<20;i++)assert.deepEqual(adapter.planning(p),expected);
  assert.equal(JSON.stringify(c),before);
});


test('aggregate basket equal additions match exhaustive orders under a proven nonbinding cap',()=>{
  const products=['bread','milk','fruit'],orders=[[]];
  let frontier=[[]];
  for(let size=1;size<=4;size++){
    frontier=frontier.flatMap(order=>products.map(id=>[...order,id]));orders.push(...frontier);
  }
  const totals=Object.fromEntries(products.map(id=>[id,0])),expected={...totals};
  for(const order of orders){
    for(const id of order)totals[id]+=1/orders.length;
    const extra=model.expectedBasket({terms:vectors.interiorTerms,orderItems:order,eligibleProducts:products,shareThousandths:500});
    for(const id of products)expected[id]+=extra[id]/orders.length;
  }
  const baselineUnits=products.map(itemId=>({itemId,units:totals[itemId],service:false,ticket:false,stocked:true}));
  const result=model.aggregateBasket({baselineUnits,eligibleProducts:products,shareThousandths:500,maxLinesPerOrder:4});
  assert.equal(result.status,'ready');
  for(const id of products)assert.ok(Math.abs(result.addedUnits[id]-expected[id])<1e-12);
  baselineUnits[0].service=true;
  assert.equal(model.aggregateBasket({baselineUnits,eligibleProducts:products,shareThousandths:500,maxLinesPerOrder:4}).status,'unavailable');
});

test('aggregate basket refuses unknown bounds and the cap-binding counterexample',()=>{
  const input={baselineUnits:[{itemId:'a',units:3,service:false,ticket:false,stocked:true},
    {itemId:'b',units:0,service:false,ticket:false,stocked:true}],eligibleProducts:['a','b'],shareThousandths:1000,maxLinesPerOrder:3};
  assert.deepEqual(model.aggregateBasket(input).reasons,['basket-per-order-cap-may-bind']);
  // Naive equal additions would be 1.5 each; the actual per-order cap permits one each.
  assert.deepEqual(model.expectedBasket({terms:vectors.interiorTerms,orderItems:['a','a','a'],eligibleProducts:['a','b'],shareThousandths:1000}),{a:1,b:1});
  delete input.maxLinesPerOrder;
  assert.deepEqual(model.aggregateBasket(input).reasons,['basket-order-bound-unknown']);
});


test('aggregate basket spreads additions equally despite unequal baseline demand',()=>{
  const input={baselineUnits:[{itemId:'a',units:2.1,service:false,ticket:false,stocked:true},
    {itemId:'b',units:.3,service:false,ticket:false,stocked:true}],eligibleProducts:['a','b'],shareThousandths:500,maxLinesPerOrder:3};
  const out=model.aggregateBasket(input);assert.equal(out.status,'ready');
  const a=model.expectedBasket({terms:vectors.interiorTerms,orderItems:['a','a','a'],eligibleProducts:['a','b'],shareThousandths:500});
  const b=model.expectedBasket({terms:vectors.interiorTerms,orderItems:['b'],eligibleProducts:['a','b'],shareThousandths:500});
  for(const id of input.eligibleProducts)assert.ok(Math.abs(out.addedUnits[id]-(.7*a[id]+.3*b[id]))<1e-12);
  assert.equal(out.addedUnits.a,out.addedUnits.b);
});


test('office carry follows owner sequence across skipped hours, a cap and morning reset',()=>{
  assert.ok(vectors.officeSequence.length>0);
  let carry=vectors.officeSequence[0].carry;
  for(const v of vectors.officeSequence){
    assert.equal(carry,v.carry);
    let added=0;
    if(v.action==='morning-reset')carry=0;
    else if(v.action!=='skip'){
      const out=model.officeClients({terms:vectors.interiorTerms,gameClients:v.gameClients,free:v.free,
        boostThousandths:v.boost,carryThousandths:carry});
      added=out.added;carry=out.carryThousandths;
    }
    assert.equal(added,v.expected,v.action);assert.equal(carry,v.expectedCarry,v.action);
  }
});


test('City price owner status gates retained tolerance independently of footfall',()=>{
  const c=report(),p=plan();c.rlo.modules.prices=disabled();
  delete p.prices;
  let out=model.create(c).planning(p);assert.equal(out.status,'ready');assert.equal(out.priceTolerance,null);
  c.rlo.modules.prices={status:'failed',data:null};
  out=model.create(c).planning(p);assert.ok(out.reasons.includes('city-price-owner-unavailable'));
  c.rlo.modules.prices={status:'unavailable',data:null};
  assert.ok(model.create(c).planning(p).reasons.includes('city-price-owner-unavailable'));
  c.rlo.modules.prices=ready({});
  assert.ok(model.create(c).planning(p).reasons.includes('planned-prices-unavailable'));
});
