/* Portable owner models. Every adjustable term is captured by its producer;
   functions use explicit inputs and never read the board or persisted plans. */
const ModDemandModel = (() => {
  'use strict';
  const int = value => { if(!Number.isSafeInteger(value)) throw new TypeError('integer-input-unknown'); return value; };
  const finite = value => { const n=Number(value);if(!Number.isFinite(n)) throw new TypeError('decimal-input-unknown');return n; };
  const clamp = (n,lo,hi) => Math.max(lo,Math.min(hi,n));
  const trunc = Math.trunc, F = Math.fround;
  const exact = value => {const n=Number(value);return int(n);};
  const roundAway = n => (n<0?-Math.floor(-n+0.5):Math.floor(n+0.5)) || 0;
  const roundEven = n => {const floor=Math.floor(n),part=n-floor;return part<0.5?floor:part>0.5?floor+1:floor%2===0?floor:floor+1;};
  function companyShare(amount,factor){
    const n=BigInt(int(amount))*BigInt(int(factor));
    const result=(n+(n>=0n?500n:-500n))/1000n;
    return exact(result>1073741823n?1073741823n:result< -1073741824n?-1073741824n:result);
  }
  function cityAdjust(figure,factor,adjustmentQuiet){
    const f=F(finite(figure));int(factor);int(adjustmentQuiet);
    return f<=0 || Math.abs(factor-1000)<adjustmentQuiet ? 0
      : clamp(roundAway(f*(factor-1000)/1000),-1073741824,1073741823);
  }
  // Native hourly wages round the float32 cents to even before company scaling.
  function wageCents(nativeHourly,factor){return companyShare(roundEven(F(F(finite(nativeHourly))*100)),factor);}
  function wage(nativeHourly,factor){return wageCents(nativeHourly,factor)/100;}
  function adjustedMoney(figure,factor,quiet){const f=F(finite(figure));return F(f+cityAdjust(f,factor,quiet));}
  // Catalogue wholesale amounts precede City transaction settlement. When the
  // owner includes purchases, aggregate the purchase day's goods before rounding.
  function wholesaleDayCost(amount,prices){
    const value=finite(amount);
    return prices.livingExcludesWholesalePurchases===false
      ? value+cityAdjust(value,prices.costFactorThousandths,prices.adjustmentQuiet):value;
  }
  function officeClients({terms,gameClients,free,boostThousandths,carryThousandths=0}){
    int(free);
    const total=BigInt(Math.max(0,int(gameClients)))*BigInt(clamp(int(boostThousandths),0,terms.officeBoostMost))
      +BigInt(clamp(int(carryThousandths),0,999));
    let added=exact(total/1000n),carry=exact(total%1000n);
    if(added>free){added=Math.max(0,int(free));carry=0;}
    return {added,carryThousandths:carry};
  }
  function basketExtra({terms,products,shareThousandths,draw,office=false}){
    const total=BigInt(Math.max(0,int(products)))*BigInt(clamp(int(shareThousandths),0,1000));
    let added=exact(total/1000n)+(int(draw)<exact(total%1000n)?1:0);
    return office?Math.min(added,terms.basketOfficeMost):added;
  }
  // Exact expected additions for an explicitly known order and eligible product list.
  // Services already in the order cannot be added; each eligible SKU is visited once.
  function expectedBasket({terms,orderItems,eligibleProducts,serviceProducts=[],entranceFees=[],shareThousandths,office=false}){
    if(!Array.isArray(orderItems)||!Array.isArray(eligibleProducts)||new Set(eligibleProducts).size!==eligibleProducts.length)
      throw new TypeError('basket-order-input-unknown');
    const services=new Set(serviceProducts),had=new Set(orderItems),fees=new Set(entranceFees);
    const products=orderItems.filter(id=>!fees.has(id)).length;
    const total=BigInt(products)*BigInt(clamp(int(shareThousandths),0,1000));
    const low=exact(total/1000n),fraction=exact(total%1000n)/1000;
    const result=Object.fromEntries(eligibleProducts.map(id=>[id,0]));
    for(const [more,probability] of [[low,1-fraction],[low+1,fraction]]){
      const wanted=office?Math.min(more,terms.basketOfficeMost):more;
      if(!probability||!wanted)continue;
      for(let start=0;start<eligibleProducts.length;start++){
        let added=0;
        for(let tried=0;tried<eligibleProducts.length && added<wanted;tried++){
          const id=eligibleProducts[(start+tried)%eligibleProducts.length];
          if(services.has(id)&&had.has(id))continue;
          result[id]+=probability/eligibleProducts.length;added++;
        }
      }
    }
    return result;
  }
  // Exact aggregate only when a proven order-size bound makes the SKU cap inert.
  // Native retail assigns the whole hour's units randomly, so maxAmountPerProduct
  // is not an order bound. Callers must supply the maximum total hourly units.
  function aggregateBasket({baselineUnits,eligibleProducts,shareThousandths,maxLinesPerOrder}){
    const unavailable=reason=>({status:'unavailable',addedUnits:null,reasons:[reason]});
    if(!Number.isSafeInteger(shareThousandths)||shareThousandths<0||shareThousandths>1000)
      return unavailable('basket-share-unknown');
    if(!Array.isArray(baselineUnits)||!Array.isArray(eligibleProducts)||new Set(eligibleProducts).size!==eligibleProducts.length)
      return unavailable('basket-product-set-unknown');
    const zero=Object.fromEntries(eligibleProducts.map(id=>[id,0]));
    if(shareThousandths===0)return {status:'ready',addedUnits:zero,reasons:[]};
    if(!Number.isSafeInteger(maxLinesPerOrder)||maxLinesPerOrder<0)return unavailable('basket-order-bound-unknown');
    if(!eligibleProducts.length)return unavailable('basket-eligible-products-unknown');
    const ids=new Set();let units=0;
    for(const row of baselineUnits){
      if(!row||typeof row.itemId!=='string'||ids.has(row.itemId)||!eligibleProducts.includes(row.itemId)
        ||row.service!==false||row.ticket!==false||row.stocked!==true||!Number.isFinite(row.units)||row.units<0)
        return unavailable('basket-product-eligibility-unproven');
      ids.add(row.itemId);units+=row.units;
    }
    if(ids.size!==eligibleProducts.length)return unavailable('basket-product-set-incomplete');
    if(BigInt(maxLinesPerOrder)*BigInt(shareThousandths)>BigInt(eligibleProducts.length)*1000n)
      return unavailable('basket-per-order-cap-may-bind');
    if(maxLinesPerOrder===0&&units>0)return unavailable('basket-order-bound-inconsistent');
    const perProduct=units*shareThousandths/1000/eligibleProducts.length;
    return {status:'ready',addedUnits:Object.fromEntries(eligibleProducts.map(id=>[id,perProduct])),reasons:[],
      basis:'uniform-start-with-nonbinding-order-cap',maxLinesPerOrder};
  }
  function scale(value,mille){
    const n=BigInt(int(value))*BigInt(Math.max(0,int(mille)));
    return exact((n+(n>=0n?500n:-500n))/1000n);
  }
  function promotion({terms,own,issue,ambient,interior,baseMultiplier}){
    for(const v of [own,issue,ambient,interior]) int(v);
    if(issue===0 && ambient===0 && interior===0) return own;
    const coefficient=F(finite(terms.promotionCoefficient)), base=F(finite(baseMultiplier));
    if(coefficient<=0) throw new TypeError('promotion-coefficient-unknown');
    const sum=clamp(issue,terms.issueMin,terms.issueMax)+clamp(ambient,terms.ambientMin,terms.ambientMax)+clamp(interior,terms.interiorMin,terms.interiorMax);
    const multiplier=F(base+F(F(coefficient*own)/100));
    const wanted=F(multiplier*F(1+F(sum/100)));
    const value=F(F(F(wanted-base)/coefficient)*100);
    return clamp(trunc(F(value+0.5)),terms.promotionMin,terms.promotionMax);
  }
  function kindPoints(terms,category,copies){
    let step=BigInt(int(terms.itemPoints[category]))*1000n,sum=0n;
    for(let n=0;n<Math.min(int(copies),terms.repeatMost);n++){sum+=step;step=step*BigInt(terms.repeatShareThousandths)/1000n;}
    return exact((sum+500n)/1000n);
  }
  function interiorModel({terms,sqm,interior,income,gameMinimum,points,kinds,issuePercent=0,
    phaseFrom=null,day=1,fitting=false,kind='shop',saleStop=false}){
    for(const v of [sqm,interior,income,gameMinimum,kinds,issuePercent,day])int(v);
    const target=clamp(terms.targetLeast+trunc(Math.max(0,sqm-terms.targetFromSqm)/terms.targetSqmPerPoint),terms.targetLeast,terms.targetMost)*10;
    const capped=terms.categoryIds.map((_,i)=>clamp(int(points[i]??0),0,trunc(target*terms.capShareThousandths[i]/1000)));
    const sum=capped.reduce((a,b)=>a+b,0);
    const decor=clamp((target>0?trunc((sum*100+trunc(target/2))/target):0)+(sum>0?clamp(kinds-terms.varietyFrom,0,terms.varietyMost):0),0,100);
    const overall=clamp(trunc((clamp(interior,0,100)*terms.interiorShareThousandths+decor*(1000-terms.interiorShareThousandths)+500)/1000),0,100);
    const standard=clamp(Math.max(terms.standardLeast+trunc((clamp(income,terms.incomeLeast,terms.incomeMost)-terms.incomeLeast)
      *(terms.standardMost-terms.standardLeast)/(terms.incomeMost-terms.incomeLeast)),clamp(gameMinimum,0,100)),0,100);
    const gap=overall-standard;
    let standardPart=gap<0?-scale(Math.min(terms.shortFootfallMaxPercent,trunc(-gap/terms.shortPointsPerPercent)),terms.standardScaleThousandths)
      :scale(Math.min(terms.overFootfallMaxPercent,trunc(gap/terms.overPointsPerPercent)),terms.standardScaleThousandths);
    standardPart=standardPart || 0;
    let decorPart=trunc(decor*clamp(terms.decorMille,0,terms.maxDecorMille)/1000);
    const bound=scale(terms.shortFootfallMaxPercent,terms.standardScaleThousandths);
    const giveWay=(part)=>part>=0?part:Math.max(part,Math.min(0,-Math.max(0,bound)-Math.min(0,issuePercent)));
    const bears=gap>0?scale(Math.min(terms.bearsOverMaxThousandths,gap),terms.priceScaleThousandths):0;
    const most=terms.basketMostPoorThousandths-trunc((clamp(standard,terms.standardLeast,terms.standardMost)-terms.standardLeast)
      *(terms.basketMostPoorThousandths-terms.basketMostRichThousandths)/(terms.standardMost-terms.standardLeast));
    const span=terms.basketFullAt-standard;
    const basket=gap<=0?0:scale(span<=0?most:trunc(most*Math.min(gap,span)/span),terms.priceScaleThousandths);
    const ramp=phaseFrom==null?1000:clamp(trunc((day-int(phaseFrom)+1)*1000/terms.rampDays),0,1000);
    const raw={target,capped,decor,overall,standard,standardPart,decorPart,giveWay:giveWay(standardPart),
      footfall:clamp(giveWay(standardPart)+decorPart,terms.footfallLeast,terms.footfallMost),bears,basket,ramp};
    if(fitting)standardPart=Math.max(0,standardPart);
    if(saleStop){standardPart=Math.min(0,standardPart);decorPart=0;}
    return {...raw,effectiveFootfall:kind==='shop'?clamp(giveWay(scale(standardPart,ramp))+scale(decorPart,ramp),terms.footfallLeast,terms.footfallMost):0,
      effectiveBears:kind==='shop'?scale(bears,ramp):0,effectiveBasket:kind==='shop'&&terms.basket&&!saleStop?scale(basket,ramp):0,
      officeBoost:kind==='office'&&!saleStop?scale(clamp(trunc(overall*clamp(terms.decorMille,0,terms.officeBoostMost)/100),0,terms.officeBoostMost),ramp):0};
  }
  function decorFor(lines,items,terms){
    const lookup=items instanceof Map?items:new Map(items.map(i=>[i.itemId,i])),counts=new Map();
    for(const [id,qty] of lines){if(int(qty)<0)throw new TypeError('negative-item-count');counts.set(id,(counts.get(id)||0)+qty);}
    const points=terms.categoryIds.map(()=>0);let kinds=0;
    for(const [id,qty] of counts){
      if(!qty)continue;
      const item=lookup.get(id);if(!item)throw new TypeError('interior-item-unknown');
      const category=int(item.category);if(category<0)continue;
      if(category>=points.length)throw new TypeError('interior-category-unknown');
      points[category]+=kindPoints(terms,category,qty);
      if(!['furniture','equipment'].includes(terms.categoryIds[category]))kinds++;
    }
    return {points,kinds};
  }
  function priceTolerance({terms,prices,markets,index,tolerance,bears=0,monopolies=[],cycle=0,district=0}){
    let sum=0,count=0;
    const marketMap=markets instanceof Map?markets:new Map(markets.map(i=>[i.itemId,i.marketAmount]));
    for(const [id,amount] of prices){
      if(!marketMap.has(id))throw new TypeError('price-market-input-unknown');
      const price=F(finite(amount)),market=F(finite(marketMap.get(id))),ix=F(finite(index));
      if(price<=0 || market<=0 || ix<=0)continue;
      const allowance=monopolies.includes(id)?F(terms.monopolyAllowanceThousandths/1000):0;
      const divisor=F(market*F(ix+allowance));
      sum+=F(price/divisor);count++;
    }
    const ratio=count===0?0:int(roundEven(sum/count*1000));
    const toleranceNow=trunc(int(tolerance)*(1000+clamp(int(bears),int(terms.bearsMinThousandths),int(terms.bearsMaxThousandths)))/1000);
    const against=toleranceNow<=0?ratio:trunc(ratio*1000/toleranceNow);
    const pricePercent=against<=0?0:against<=1000?terms.underGainPercent:against<=1000+terms.overBandThousandths?0
      :-Math.min(terms.overLossMaxPercent,trunc((against-1000)*terms.overLossPerPercent/10000));
    let footfallPercent=clamp(cycle+district+pricePercent,terms.footfallMinPercent,terms.footfallMaxPercent);
    if(Math.abs(footfallPercent)<terms.footfallQuietPercent)footfallPercent=0;
    return {ratio,tolerance:toleranceNow,against,pricePercent,footfallPercent};
  }

  function create(companion={}){
    const get=(provider,name)=>!companion[provider]?{status:'disabled'}:companion[provider].modules?.[name]||{status:'unavailable'};
    const key=a=>a?`${a.street}#${a.number}`:null;
    const map=(rows,id)=>new Map((rows||[]).map(row=>[id(row),row]));
    const interiorCapture=get('rlo','interiors').data,footfallCapture=get('rlo','footfall').data;
    const retailCapture=get('hart','retailDemand').data,toleranceCapture=footfallCapture?.priceTolerance;
    const interiorSites=map(interiorCapture?.sites,s=>key(s.address)),interiorDistricts=map(interiorCapture?.districts,d=>d.districtId);
    const itemClasses=map(interiorCapture?.items,i=>i.itemId),footfallSites=map(footfallCapture?.sites,s=>key(s.address));
    const toleranceDistricts=map(toleranceCapture?.districts,d=>d.districtId);
    const markets=new Map((toleranceCapture?.items||[]).map(i=>[i.itemId,i.marketAmount]));
    const monopolies=new Map();for(const m of toleranceCapture?.monopolies||[]){if(!monopolies.has(m.districtId))monopolies.set(m.districtId,[]);monopolies.get(m.districtId).push(m.itemId);}
    const cafeSites=map(retailCapture?.cafe?.data?.currentSites,s=>key(s.address));
    function planning(input){
      try{return plan(input);}catch(error){return {status:'unavailable',promotion:null,basketThousandths:null,officeBoostThousandths:null,
        reasons:['invalid-demand-input'],assumptions:[]};}
    }
    function plan({typeId,building,lines=[],outfit={},interiorScore,ownPromotion,existing=false,
      prices=outfit.prices,day=companion.day??1,openingDay=companion.day??1}){
      int(ownPromotion);int(day);
      if(!building)throw new TypeError('building-unknown');
      const reasons=[],assumptions=['captured-city-settings-held-constant'];
      let basket=0,officeBoost=0,interiorPercent=0,bears=0,calculated=null;
      const interiors=get('rlo','interiors'),footfall=get('rlo','footfall'),retail=get('hart','retailDemand'),runtime=get('hart','runtime');
      const kind=building.interiorKind;
      const ready=m=>m.status==='ready',known=m=>['ready','disabled'].includes(m.status);
      if(!known(interiors))reasons.push('interiors-owner-unavailable');
      if(!known(footfall))reasons.push('footfall-owner-unavailable');
      if(ready(interiors)){
        if(!['shop','office','none'].includes(kind))throw new TypeError('interior-kind-unknown');
        if(existing){
          const site=interiorSites.get(building.key);
          if(!site)reasons.push('interior-site-unavailable');
          else{basket=site.basketThousandths;officeBoost=site.officeBoostThousandths;interiorPercent=site.footfallPercent;bears=site.priceToleranceThousandths;}
        }else if(kind!=='none'){
          const district=interiorDistricts.get(building.hood);
          if(!district)reasons.push('interior-district-unavailable');
          else{
            const decor=decorFor(lines,itemClasses,interiors.data.terms);
            calculated=interiorModel({terms:interiors.data.terms,sqm:building.m2,interior:int(interiorScore),income:district.income,
              gameMinimum:district.nativeMinimum,...decor,kind,phaseFrom:openingDay,day,fitting:day-openingDay<interiors.data.terms.graceDays});
            basket=calculated.effectiveBasket;officeBoost=calculated.officeBoost;interiorPercent=calculated.effectiveFootfall;bears=calculated.effectiveBears;
            assumptions.push('new-site-clean-unworn','opening-day-ramp','stocked-and-staffed');
          }
        }
      }
      let issue=0,ambient=0,base=building.baseMultiplier,current=null,city=0,priceResult=null;
      if(ready(footfall)){
        if(existing){
          current=footfallSites.get(building.key);
          if(!current || current.status!=='ready')reasons.push('footfall-site-unavailable');
          else{issue=current.issuePercent;ambient=current.ambientPercent;base=current.baseMultiplier;interiorPercent=current.interiorPercent;}
        }
        const tolerance=footfall.data.priceTolerance,priceOwner=get('rlo','prices');
        if(!known(priceOwner) && (!existing || Array.isArray(prices)))reasons.push('city-price-owner-unavailable');
        if(priceOwner.status==='ready' && tolerance){
          const district=toleranceDistricts.get(building.hood);
          if(!district || district.priceIndex==null)reasons.push('price-district-unavailable');
          else if(!Array.isArray(prices)){
            if(!existing)reasons.push('planned-prices-unavailable');
          }else{
            priceResult=priceTolerance({terms:tolerance,prices,markets,index:district.priceIndex,
              tolerance:district.toleranceThousandths,bears,cycle:district.cyclePercent,district:district.districtPercent,
              monopolies:monopolies.get(building.hood)||[]});
            city=priceResult.footfallPercent;
            ambient=current?ambient-current.cityPercent+city:city;
          }
        }else if(priceOwner.status==='ready' && !existing)reasons.push('price-tolerance-unavailable');
      }
      let cafeCapacityPerHour=null;
      if(ready(retail)){
        if(kind==='shop' && retail.data.ambience.status!=='disabled')reasons.push('hart-ambience-owner-inputs-unavailable');
        const cafe=retail.data.cafe;
        if(building.cafe===true || outfit.cafe===true){
          if(!ready(cafe))reasons.push('cafe-owner-unavailable');
          else if(cafe.data.state.effective===null)reasons.push('cafe-rule-unknown');
          else if(cafe.data.state.effective){
            const site=existing?cafeSites.get(building.key):null;
            const stations=site?.status==='ready'?site.usableStations:outfit.usableCafeStations;
            if(!Number.isSafeInteger(stations) || stations<0)reasons.push('cafe-pairing-unproven');
            else cafeCapacityPerHour=int(stations*cafe.data.sessionsPerStationPerHour);
          }
        }
      }else if(retail.status!=='disabled' && (kind==='shop' || building.cafe===true || outfit.cafe===true)){
        const off=ready(runtime) && (kind!=='shop' || runtime.data.rules?.ambience_scales_with_demand?.effective===false)
          && (!(building.cafe===true || outfit.cafe===true) || runtime.data.rules?.cafe_pc_capacity?.effective===false);
        if(!off)reasons.push('hart-retail-demand-unavailable');
      }
      const value=ready(footfall)?promotion({terms:footfall.data.terms,own:ownPromotion,issue,ambient,interior:interiorPercent,baseMultiplier:base}):ownPromotion;
      return {status:reasons.length?'unavailable':'ready',promotion:reasons.length?null:value,
        basketThousandths:reasons.length?null:1000+basket,officeBoostThousandths:reasons.length?null:officeBoost,
        cafeCapacityPerHour,reasons:[...new Set(reasons)],assumptions,basketDistribution:basket>0?'requires-per-order-eligible-products':'none',interior:calculated,priceTolerance:priceResult};
    }
    return {planning};
  }
  return {wholesaleDayCost,companyShare,cityAdjust,wageCents,wage,adjustedMoney,officeClients,basketExtra,expectedBasket,aggregateBasket,scale,promotion,kindPoints,interiorModel,decorFor,priceTolerance,create};
})();
if(typeof module!=='undefined' && module.exports)module.exports=ModDemandModel;
