/* Open a store calculation core. The Python renderer embeds this exact source;
   Node consumers require it directly. No board, DOM, storage or translations. */
const OpenStoreModel = (() => {
  "use strict";
  const economyModel = typeof ModEconomyModel !== "undefined" ? ModEconomyModel
    : typeof require === "function" ? require("./mod-economy-model.js") : null;
  const demandModel = typeof ModDemandModel !== "undefined" ? ModDemandModel
    : typeof require === "function" ? require("./mod-demand-model.js") : null;
  /* SkillData's wage lift at skill 100, 1 + 1.05^skill / 100: the plans staff
     every station at full skill. */
  const SKILL_100_WAGE = 1 + Math.pow(1.05, 100) / 100;
  const OS_HYPE = {demand: 20, days: 14, idle: 21};
  // Premises status describes the lease; occupant describes the business in it.
  const emptyLease = b => !!b && b.status === "mine" && !b.occupant;
  const availablePremises = b => !!b && (b.status === "vacant" || emptyLease(b));
  const leaseDeposit = b => b?.status === "mine" ? 0 : b?.deposit;

  /**
   * Bind calculation inputs for one payload; this function does not mutate them.
   * @param {Object} inputs Named inputs.
   * @param {Object} inputs.facts The extract() openStore payload: types, layouts,
   *   game rules, market, hoods, own shops, sales, campaigns and finance.
   * @param {Object} [inputs.company] Relevant company state: businesses
   *   ({key,typeSlug,rent} rows) and day (current game day for demand waves).
   * @param {boolean} [inputs.optional] Whether outfits include their optional
   *   items (a layout's `opt` lines and `optFurniture`).
   * @returns {Object} Calculations accepting a type slug, building
   *   ({key,hood,layout,size,cap,m2,traffic,rent,deposit}), plan ({type}),
   *   or options ({reach,cost,promoTotal,open,sat,existing,initial,staffed,
   *   computers,rent,hype}) as applicable. Profit models return daily revenue,
   *   cogs, wages, rent, marketing, profit, customers and ordered product lines;
   *   unavailable models/investments and unattainable payback days return null.
   *   `existing`/`provides` may be an item predicate; day callbacks use day 0
   *   for opening. Loan results retain integer interest/repayment rounding.
   */
  function create({facts = {}, company = {}, optional = false} = {}){
    const osFacts = () => facts;
    const companion = facts.modEconomy;
    const economy = companion && economyModel?.create(companion);
    const demand = companion && demandModel?.create(companion);
    const modModule = (name) => !companion?.rlo ? {status:"disabled"}
      : companion.rlo.modules?.[name] || {status:"unavailable"};
    const pricesModule = modModule("prices"), companyModule = modModule("company");
    const missingPrices = new Set(facts.priceUnavailable || []);
    const priceKnown = ids => !ids.some(id => missingPrices.has(id));
    const modSite = new Map((companyModule.data?.sites || []).map(row => [`${row.address.street}#${row.address.number}`, row]));
    const footfallSites = new Map((modModule("footfall").data?.sites || []).map(row => [`${row.address.street}#${row.address.number}`, row]));
    const cityCost = (amount, revenue=false) => pricesModule.status === "ready"
      ? amount + demandModel.cityAdjust(amount, pricesModule.data[revenue ? "takingsFactorThousandths" : "costFactorThousandths"], pricesModule.data.adjustmentQuiet)
      : amount;
    const failures=new Map();
    const fail=(slug,b,reasons)=>{failures.set(`${slug}|${b?.key}`,reasons);return null;};
    const allHours = () => Array.from({length:7}, () => [[0,24]]);
    const knownModule = m => ["ready","disabled"].includes(m.status);
    function operating(slug,b,o={},lines){
      if(o._modCosts)return o._modCosts;
      return economy?.operating({typeId:slug,building:b,lines:lines || osOutfit({type:slug},b)?.lines || [],
        open:o.open || allHours(),existing:!!o.existing,day:o._modDay ?? companion.day,
        existingExtraLines:o.existingExtraLines || [],equipmentOverride:o.equipmentOverride || null});
    }
    function modDemand(slug,t,b,o,own){
      if(!demand) return null;
      const current = o.existing && footfallSites.get(b.key);
      // Existing panel/own-shop inputs contain the already-written promotion.
      // Reconstruct from the owner's original exactly once.
      const ownPromotion = current && o.promoTotal != null ? current.ownPromotion : own;
      const outfit = osOutfit({type:slug},b);
      return demand.planning({typeId:slug,building:{...b,baseMultiplier:facts.game?.promo,
        interiorKind:t.model === "office" ? "office" : t.model === "retail" ? "shop" : "none"},
        lines:outfit?.lines || [],outfit:outfit || {},interiorScore:osDecor(b,slug)?.score ?? facts.hoods?.[b.hood]?.interior ?? 0,
        ownPromotion,existing:!!o.existing,prices:t.products.map(([id])=>[id,osPrice(id,b.hood).price]),
        day:o._modDay ?? (companion.day + 30),openingDay:companion.day});
    }
    function modReady(slug,t,b,o){
      if(!priceKnown(t.products.map(([p])=>p))) return false;
      if(!companion) return true;
      if(!economy || !demand || !knownModule(pricesModule) || !knownModule(companyModule)) return false;
      const site = o.existing && modSite.get(b.key);
      // A current raise/discount needs the actual staff/order allocation, not a
      // new-hire structural quote. Do not label that missing input as zero.
      if(companyModule.status === "ready" && !["ready","disabled"].includes(companyModule.data.partStates?.staff)) return false;
      if(o.existing && companyModule.status === "ready" && !["ready","disabled"].includes(companyModule.data.partStates?.marketing)) return false;
      if(site && ((companyModule.data.partStates?.staff === "ready" && site.raises.some(r=>r.raiseHourlyCents))
        || (companyModule.data.partStates?.marketing === "ready" && site.campaign.active))) return false;
      const closures=modModule("closures");
      if(!knownModule(closures)) return false;
      if(o.existing && closures.status === "ready" && closures.data.rows.some(r=>`${r.address.street}#${r.address.number}`===b.key)) return false;
      return true;
    }
    // Owner City settlement rounds a whole company category/day and then shares it.
    // A standalone site quote can reproduce daily rounding, but cannot invent
    // the other sites' allocation or carried debt.
    function settleDay(native,ramp=1){
      return {revenue:cityCost(native.revenue*ramp,true),cogs:native.cogs*ramp,
        wages:cityCost(native.wages),rent:cityCost(native.rent),
        marketing:pricesModule.status === "ready" && pricesModule.data.livingTransactionTypes.includes("ba:transaction_marketing")
          ? cityCost(native.marketing):native.marketing};
    }
    function finishModel(slug,t,b,o,result,modCosts,modDemandResult){
      if(!companion) return result;
      if(modCosts?.status !== "ready") return null;
      result.byDay=result.nativeByDay.map(day=>settleDay(day));
      for(const field of ['revenue','cogs','wages','rent','marketing'])
        result[field]=result.byDay.reduce((sum,day)=>sum+day[field],0)/7;
      result.modCosts=modCosts;
      result.modDemand=modDemandResult;
      result.profit=result.revenue-result.cogs-result.wages-result.rent-result.marketing-modCosts.dailyCents/100;
      result.assumptions=[...new Set([...(modCosts.assumptions||[]),...(modDemandResult?.assumptions||[]),
        "standalone-native-daily-category-estimate","company-aggregate-allocation-and-carried-debt-excluded",
        "no-unforeseen-absence-or-closure","full-day-office-carry-reset"])];
      if(!o._noTimeline){
        const terms=modModule('interiors').data?.terms;
        const stable=o.existing?0:Math.max(terms?.rampDays || 0,terms?.graceDays || 0),cache=new Map();
        result.modAtDay=k=>{
          const at=Math.min(k,stable);
          if(!cache.has(at))cache.set(at,osModel(slug,b,{...o,_modDay:companion.day+at,_noTimeline:true,_modCosts:modCosts}));
          return cache.get(at);
        };
      }
      return result;
    }
    /* A game value openStore.game ships (_open_store() in Python, its single
       source). A missing one is a payload bug, not a reason to guess. */
    const osGame = key => {
      const v = (osFacts().game || {})[key];
      if(v == null) throw new Error(`openStore.game.${key} is missing`);
      return v;
    };
    const osType = slug => (osFacts().types || {})[slug] || null;
    const osCap = b => { const v = b && (osFacts().venues || {})[b.key];
      return v && v[1] ? v[1] : (b && b.cap) || 0; };
    /* The outfit for the building's layout: its lines and furniture total,
       with its optional items (group "opt") when they are included. */
    /* The key an outfit is kept by: the layout, or a cinema's or theatre's size
       (Python's plan_layout()). */
    const osLayout = b => b?.layoutKnown === false ? "" : (b && (b.layout || ((osFacts().venues || {})[b.key] || [])[0] || b.size)) || "";
    const osOutfit = (plan, b) => { const t = plan && osType(plan.type);
      const out = t && b ? (b.layoutKnown === false ? null : (t.layouts || {})[b.key] || (t.layouts || {})[osLayout(b)] || null) : null;
      return out && optional && (out.opt || []).length
        ? {...out, lines: [...out.lines, ...out.opt], furniture: out.furniture + (out.optFurniture || 0)} : out; };
    /* The interior score the neighbourhood asks for (Midtown's 50), and the
       cheapest walls and floors that reach it in this layout. */
    const decorCache=new Map();
    const osDecor = (b,slug) => {
      const need=b && facts.hoods?.[b.hood]?.interior;
      const native=(need>0 ? facts.decor?.[osLayout(b)]?.[String(need)] : null) || null;
      const interiors=modModule("interiors");
      if(!slug || interiors.status !== "ready") return native;
      const cacheKey=`${slug}|${b.key}|${b.hood}|${osLayout(b)}|${optional}`;
      if(decorCache.has(cacheKey)) return decorCache.get(cacheKey);
      let chosen=native;
      try{
        const owner=interiors.data,district=owner.districts.find(d=>d.districtId===b.hood);
        if(!district) return native;
        const outfit=osOutfit({type:slug},b),kind=osType(slug)?.model === "office" ? "office" : "shop";
        const decor=demandModel.decorFor(outfit?.lines || [],owner.items,owner.terms);
        const routes=[{cost:0,score:0},...Object.values(facts.decor?.[osLayout(b)] || {})]
          .sort((a,z)=>a.cost-z.cost || a.score-z.score);
        let closest=null;
        for(const route of routes){
          const result=demandModel.interiorModel({terms:owner.terms,sqm:b.m2,interior:route.score,
            income:district.income,gameMinimum:district.nativeMinimum,...decor,kind,day:companion.day+30,phaseFrom:companion.day});
          const candidate={...route,modStandard:result.standard,modOverall:result.overall};
          if(!closest || result.overall>closest.modOverall) closest=candidate;
          if(result.overall>=result.standard){chosen=candidate;closest=null;break;}
        }
        if(closest) chosen={...closest,modStandardUnmet:true};
      }catch(_){ chosen=native ? {...native,modStandardUnknown:true} : {cost:0,score:0,modStandardUnknown:true}; }
      decorCache.set(cacheKey,chosen);return chosen;
    };

    /* The investment in each mode, as setup_cost() counts it: the firm's fee on
       the floor, every item at its default price, the deposit; self-installation
       the items, a delivery per store, and the walls and floors where the
       neighbourhood asks for them. */
    function osInvestment(plan, b){
      const out = osOutfit(plan, b);
      if(!out || !b) return null;
      const deposit = leaseDeposit(b) || 0, decor = osDecor(b,plan.type);
      const stores = osStores(out).length;
      const delivery = stores * ((osFacts().game || {}).delivery || 0);
      const result = {furniture: out.furniture, fee: out.fee, deposit, stores, delivery, decor: decor ? decor.cost : 0,
        firm: out.furniture + out.fee + deposit, self: out.furniture + delivery + (decor ? decor.cost : 0) + deposit,
        items: out.lines.reduce((n, l) => n + l[1], 0)};
      const incomplete=[];
      if(decor?.modStandardUnmet) incomplete.push("interior-standard-unattainable");
      if(decor?.modStandardUnknown) incomplete.push("interior-standard-unavailable");
      if(leaseDeposit(b) == null) incomplete.push("lease-quote-unavailable");
      if(!priceKnown(out.lines.map(([id])=>id))) incomplete.push("catalogue-price-unavailable");
      if(companion){
        const modCosts=operating(plan.type,b,{existing:!!osProvides(plan.type,b)});
        result.modCosts=modCosts;
        result.modRequirements=modCosts?.requirements || [];
        incomplete.push(...(modCosts?.reasons || []));
        if(!knownModule(pricesModule)) incomplete.push("city-prices-unavailable");
        if(pricesModule.status === "ready"){
          const prices=pricesModule.data,types=prices.livingTransactionTypes;
          if(types.includes("ba:transaction_interiorinstallation")) result.firm += cityCost(out.furniture+out.fee)-(out.furniture+out.fee);
          // Native furniture deliveries include items and their delivery fee in
          // transaction_deliverycontract; it is outside the City Living set.
          if(types.includes("ba:transaction_deliverycontract")) result.self += cityCost(out.furniture+delivery)-(out.furniture+delivery);
          if(types.includes("ba:transaction_interiordesigner")) result.self += cityCost(result.decor)-result.decor;
          if(deposit){
            if(prices.depositAdjustment === "rentCostFactor"){
              const change=cityCost(deposit)-deposit;result.firm+=change;result.self+=change;
            }else if(prices.depositAdjustment !== "none") incomplete.push("deposit-adjustment-unavailable");
          }
        }
        if(modCosts?.startupCents != null){ result.firm+=modCosts.startupCents/100;result.self+=modCosts.startupCents/100; }
      }
      if(incomplete.length) result.incomplete=[...new Set(incomplete)];
      return result;
    }
    /* Self-installation's shopping list by store: each item from a store that
       sells it, as few stores as will do, the one that sells the most first. */
    function osStores(out, items = osFacts().items || {}){
      let left = out.lines.map((l, i) => i);
      const stores = [];
      while(left.length){
        const count = new Map();
        left.forEach(i => ((items[out.lines[i][0]] || {}).v || []).forEach(v => count.set(v, (count.get(v) || 0) + 1)));
        if(!count.size) break;
        const [best] = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
        const mine = left.filter(i => ((items[out.lines[i][0]] || {}).v || []).includes(best));
        stores.push({key: best, lines: mine});
        left = left.filter(i => !mine.includes(i));
      }
      return stores;
    }

    /* --- the profit model ------------------------------------------------------
       CustomerEntriesCalculatorRetail, per open hour: arrivals are the building's
       capacity (or, in a game started before build 2847, the best primary
       product's sales ratio times the floor) times the promotion, the day's and
       the hour's multipliers, never above the capacity. Each product then sells
       arrivals x its sales ratio x the neighbourhood's demand x the satisfaction
       multiplier x its impact for the type x the amount a customer takes, 30% of
       the time rounded up and otherwise to the nearest. Arrivals with nothing to
       buy leave (not at a gym, a nightclub or a cinema). The price is the highest
       every customer accepts: the default, or a rival's lower one, times the
       neighbourhood's price index, +0.3 while no rival company sells it. Goods
       cost the import price; wages are the structural estimate. */
    const osUnits = x => x <= 0 ? 0 : 0.3 * Math.ceil(x) + 0.7 * Math.floor(x + 0.5);
    const osDemandWith = (n, price) => {
      const opt = !price ? 7 : Math.min(Math.ceil(Math.sqrt(1300 / price)), 7);
      const base = 100 - Math.floor(n * 100 / opt);
      return base >= 30 ? Math.min(100, base - 0.5) : 31.5;
    };
    /* The price everyone in the neighbourhood accepts, and whether it carries
       the monopoly's +0.3. */
    function osPrice(item, hood){
      const m = (osFacts().market || {})[item], h = (osFacts().hoods || {})[hood];
      if(!m || !h) return {price: 0, mono: false};
      const row = (m.hoods || {})[hood] || [0, 0, null];
      const mono = !!m.d && !row[1];
      const ref = row[2] ? Math.min(m.p, row[2]) : m.p;
      return {price: ref * (h.idx + (mono ? 0.3 : 0)), mono};
    }
    /* A new shop counts itself among the sellers; an existing one already is.
       `existing` may also say so item by item (osModel()). */
    function osDemand(item, hood, existing){
      const m = (osFacts().market || {})[item];
      if(!m) return 0;
      if(!m.d) return 100;
      if(m.only && !m.only.includes(hood)) return 0;
      const row = (m.hoods || {})[hood] || [0];
      const counted = typeof existing === "function" ? existing(item) : existing;
      return osDemandWith((row[0] || 0) + (counted ? 0 : 1), m.p);
    }
    /* The satisfaction the plan settles at: the player's own shops of the type,
       their median, else a well-run shop's. */
    function osSatisfaction(slug){
      const seen = ((osFacts().own || {})[slug] || []).map(s => s.sat).filter(v => Number.isFinite(v)).sort((a, b) => a - b);
      return seen.length ? seen[Math.floor(seen.length / 2)] : osGame("satisfaction");
    }
    /* One day of a store of type `slug` in building `b`. `o`: reach (m² of
       marketing) and cost, or promoTotal for a shop whose promotion is known;
       open (per weekday [start, end) slots, 24/7 by default); sat; existing. */
    /* What every open hour starts from (Python's _plan_initial(), shared with the
       staffing assistant): the shop's own figure where it is known, else the
       layout's, else the building's capacity (a current game) or the floor. */
    function osInitial(t, b, o){
      const known = o.initial ?? (t.initial || {})[b.key] ?? (t.initial || {})[osLayout(b)];
      if(known > 0) return known;
      return (osFacts().game || {}).capInitial || t.model === "office" ? osCap(b) : (b.m2 || 0);
    }
    /* The promotion total a building reaches with `reach` m² of marketing:
       its traffic plus the share of the floor the campaigns cover times the
       neighbourhood's marketing strength, never above 100. */
    const osPromo = (b, h, o) => o.promoTotal ?? Math.min(100, Math.round((b.traffic || 0)
      + Math.round(Math.min((o.reach || 0) * (b.marketingRules?.reachMultiplier ?? 1) / (b.m2 || 1), 1) * 100) * (b.marketingRules?.strength ?? h.strength)));
    /* A store of the type already at the building (premises set up before the
       plan picked them) is a seller already of what it offers for sale, as the
       game counts providers (cachedAvailableProducts): which items, or null. */
    function osProvides(slug, b){
      const here = b && (company.businesses || []).some(x => x.key === b.key && x.typeSlug === slug);
      const sells = here && ((osFacts().built || {})[b.key] || {}).sells;
      return Array.isArray(sells) && sells.length ? p => sells.includes(p) : null;
    }
    function osModel(slug, b, o = {}){
      const F = osFacts(), t = osType(slug), g = F.game || {}, h = (F.hoods || {})[b.hood];
      if(!t || !h || (o.rent == null && b.rent == null) || b.factsUnavailable || b.marketingUnavailable
          || (F.compatibility?.[t.model === "office" ? "officeProfit" : "storeProfit"] || []).length) return null;
      if(o.existing === undefined){ const provides = osProvides(slug, b); if(provides) o = {...o, existing: provides}; }
      failures.delete(`${slug}|${b.key}`);
      if(!modReady(slug,t,b,o)) return fail(slug,b,["mod-profit-inputs-unavailable"]);
      if(o.existing && o.rent == null){const signed=(company.businesses||[]).find(x=>x.key===b.key);if(signed) o={...o,rent:signed.rent};}
      if(t.model === "office") return osOfficeModel(slug, t, b, h, o);
      if(t.model !== "retail") return null;
      const cap = osCap(b);
      const demandResult=modDemand(slug,t,b,o,osPromo(b,h,o));
      if(demandResult?.status === "unavailable") return fail(slug,b,demandResult.reasons);
      const modCosts=operating(slug,b,o);
      if(modCosts && modCosts.status !== "ready") return fail(slug,b,modCosts.reasons);
      const total = demandResult?.promotion ?? osPromo(b, h, o);
      const promo = (g.promo || 0) + 0.75 * total / 100;
      /* The whole range the type sells, as the outfit stocks it: the validation's
         planner default. */
      const range = t.products.filter(([p]) => p !== t.fee && p !== t.feeWeekend);
      const initial = osInitial(t, b, o);
      const sat = 1 + ((o.sat ?? osSatisfaction(slug)) - 50) / 100;
      const lines = range.map(([p, impact]) => {
        const m = F.market[p] || {};
        const amt = t.amt <= 1 ? t.amt : impact >= 1 ? (1 + t.amt) / 2 : 1;
        const hyped = (o.hype || []).includes(p);
        return {p, impact, amt, r: m.r || 1, demand: Math.min(100, osDemand(p, b.hood, o.existing) + (hyped ? OS_HYPE.demand : 0)), hyped,
          service: !!m.s, cost: m.cost || 0, ...osPrice(p, b.hood), units: 0,...(companion?{byDayUnits:Array(7).fill(0)}:{})};
      });
      const slots = o.open || Array.from({length: 7}, () => [[0, 24]]);
      let customers = 0, fees = 0, open = 0;
      const days=Array.from({length:7},()=>({revenue:0,cogs:0,wages:0,open:0,fees:0}));
      const feePrice = wd => { const f = t.feeWeekend && (wd === 0 || wd === 6) ? t.feeWeekend : t.fee; return f ? osPrice(f, b.hood).price : 0; };
      for(let wd = 0; wd < 7; wd++){
        for(const [a, z] of slots[wd] || []){
          for(let hr = a; hr < z; hr++){
            open++;days[wd].open++;
            const raw = initial * promo * (t.days[wd] || 0) * (t.hours[hr] || 0);
            const n = raw > 0 ? Math.ceil(Math.min(raw, cap, demandResult?.cafeCapacityPerHour ?? Infinity)) : 0;
            if(n <= 0) continue;
            let none = 1;
            const hourly=lines.map(l=>({itemId:l.p,service:l.service,ticket:false,stocked:true,
              units:osUnits(n*l.r*l.demand/100*sat*l.impact*l.amt)}));
            const basketShare=(demandResult?.basketThousandths ?? 1000)-1000;
            let added={};
            if(basketShare>0){
              // Native retail assigns each hourly unit to a random customer.
              // All units may land in one order; t.amt alone is not a bound.
              const maximum=lines.reduce((sum,l)=>sum+Math.max(0,Math.ceil(n*l.r*sat*l.impact*Math.max(1,t.amt)*(1+1e-6))+1),0);
              const basket=demandModel.aggregateBasket({baselineUnits:hourly,eligibleProducts:lines.map(l=>l.p),
                shareThousandths:basketShare,maxLinesPerOrder:maximum});
              if(basket.status !== "ready") return fail(slug,b,basket.reasons);
              added=basket.addedUnits;
            }
            lines.forEach((l,i) => {
              const u=hourly[i].units;
              const sold=u+(added[l.p] || 0);
              l.units += sold;if(companion)l.byDayUnits[wd]+=sold;
              days[wd].revenue+=sold*l.price;days[wd].cogs+=sold*l.cost;
              if(slug==='ba:businesstype_hairdresser' && l.service)
                days[wd].cogs+=sold*(F.market['ba:itemname_haircareproduct']?.cost || 0);
              // Extra items attach to an existing order, so they cannot turn
              // a customer with no native order into a paying customer.
              none *= l.service ? Math.max(0, 1 - Math.min(u, n) / n) : n > 1 ? Math.pow(1 - 1 / n, u) : (u >= 1 ? 0 : 1 - u);
            });
            const served = t.noOrder ? n : n * (1 - none);
            customers += served;
            fees += served * feePrice(wd);days[wd].revenue+=served*feePrice(wd);days[wd].fees+=served*feePrice(wd);
          }
        }
      }
      let revenue = fees / 7, cogs = 0;
      lines.forEach(l => { l.units /= 7; revenue += l.units * l.price; cogs += l.units * l.cost; });
      /* A hairdresser's service uses one hair-care product at its cost. */
      const care = (F.market || {})["ba:itemname_haircareproduct"];
      if(slug === "ba:businesstype_hairdresser" && care) cogs += lines.filter(l => l.service).reduce((s, l) => s + l.units, 0) * care.cost;
      const w = osGame("wageBase"), rate = SKILL_100_WAGE * (g.wages || 0);
      const wages = open / 7 * ((Math.ceil(cap / w.perCashier) * (w.cashier || 0) + (w.cleaner || 0) + (w.guard || 0))*rate);
      const rent = o.rent ?? (b.rent || 0), marketing = o.cost || 0;
      return finishModel(slug,t,b,o,{revenue, cogs, wages, rent, marketing, profit: revenue - cogs - wages - rent - marketing,
        customers: customers / 7, fees: fees / 7, lines, promo: total,
        ...(companion?{nativeByDay:days.map(day=>({...day,wages:open?day.open*wages*7/open:0,rent,marketing}))}:{})},modCosts,demandResult);
    }
    /* CustomerEntriesCalculatorOffice, per open hour: the clients who come are
       ceil(initial x satisfaction x promotion x the day's and the hour's
       multipliers x the fee's neighbourhood demand / 100 - 0.2), never more than
       the computers staffed that hour, one client each. The computers are staffed
       as the board's office default writes them (_office_runs() in Python: a few
       around the clock, every computer 8 to 22 on weekdays, half of them 8 to 22
       at the weekend), and each is paid for every hour it is staffed, busy or
       not, with a cleaner through every open hour as in a shop. The fee is priced
       as a shop's goods are: the highest every client accepts. */
    function osOfficeStaffed(computers, cap, wd, hr){
      const office = osGame("office");
      const always = Math.min(computers, Math.max(1, Math.round(office.always * cap / office.fullDoor)));
      if(hr < office.day[0] || hr >= office.day[1]) return always;
      return office.weekend.includes(wd) ? Math.max(always, Math.ceil(computers / 2)) : computers;
    }
    function osOfficeModel(slug, t, b, h, o){
      const F = osFacts(), g = F.game || {};
      const fee = (t.products[0] || [])[0];
      if(!fee || !(F.market || {})[fee]) return null;
      const cap = osCap(b);
      const demandResult=modDemand(slug,t,b,o,osPromo(b,h,o));
      if(demandResult?.status === "unavailable") return fail(slug,b,demandResult.reasons);
      const modCosts=operating(slug,b,o);
      if(modCosts && modCosts.status !== "ready") return fail(slug,b,modCosts.reasons);
      const total = demandResult?.promotion ?? osPromo(b, h, o);
      const promo = (g.promo || 0) + 0.75 * total / 100;
      const initial = osInitial(t, b, o);
      const sat = 1 + ((o.sat ?? osSatisfaction(slug)) - 50) / 100;
      const demand = osDemand(fee, b.hood, o.existing), {price, mono} = osPrice(fee, b.hood);
      const wage = (t.wage || 0) * SKILL_100_WAGE * (g.wages || 0);
      const slots = o.open || Array.from({length: 7}, () => [[0, 24]]);
      const computers = o.computers || cap;
      let billed = 0, staffed = 0, open = 0;
      const days=Array.from({length:7},()=>({revenue:0,cogs:0,wages:0,open:0,staffed:0}));
      const interiorData=modModule("interiors").data;
      let carry=0; // Full-day forecasts start after the owner morning reset.
      for(let wd = 0; wd < 7; wd++){
        carry=0; // InteriorDirector.Round resets the booking remainder every morning.
        for(const [a, z] of slots[wd] || []){
          for(let hr = a; hr < z; hr++){
            const on = o.staffed ? ((o.staffed[wd] || [])[hr] || 0) : osOfficeStaffed(computers, cap, wd, hr);
            const raw = Math.ceil(initial * sat * promo * (t.days[wd] || 0) * (t.hours[hr] || 0) * demand / 100 - 0.2);
            staffed += on; open++;days[wd].staffed+=on;days[wd].open++;
            const base=Math.max(0,Math.min(raw,on,cap));
            billed+=base;days[wd].revenue+=base*price;
            // The director books the following hour; nobody can book hour 0
            // at hour 23 because native next=24 is out of range.
            if(hr>0 && demandResult?.officeBoostThousandths){
              const extra=demandModel.officeClients({terms:interiorData.terms,gameClients:base,
                free:Math.max(0,on-base),boostThousandths:demandResult.officeBoostThousandths,carryThousandths:carry});
              carry=extra.carryThousandths;billed+=extra.added;days[wd].revenue+=extra.added*price;
            }
          }
        }
      }
      const units = billed / 7;
      const revenue = units * price, wages = (staffed * wage + open * (osGame("wageBase").cleaner || 0) * SKILL_100_WAGE * (g.wages || 0)) / 7;
      const rent = o.rent ?? (b.rent || 0), marketing = o.cost || 0;
      return finishModel(slug,t,b,o,{revenue, cogs: 0, wages, rent, marketing, profit: revenue - wages - rent - marketing,
        ...(companion?{nativeByDay:days.map(day=>({...day,wages:day.staffed*wage+day.open*(osGame("wageBase").cleaner || 0)*SKILL_100_WAGE*(g.wages || 0),rent,marketing}))}:{}),
        customers: units, fees: 0, office: true, lines: [{p: fee, impact: 1, amt: 1, r: 1, demand, service: true, cost: 0, price, mono, units}], promo: total},modCosts,demandResult);
    }
    /* How the player's own shops of the type do against the same rules on their
       own buildings, hours and marketing: the median of actual ÷ model. */
    function osOwnRatio(slug){
      if(companion) return null; // Native statements exclude known outside-statement costs.
      const own = (osFacts().own || {})[slug] || [];
      const byKey = new Map((company.businesses || []).map(b => [b.key, b]));
      const rows = own.map(s => {
        const m = osModel(slug, {hood: s.hood, cap: s.cap, m2: s.m2, key: s.key, layout: s.layout}, {promoTotal: s.promo, cost: s.marketing,
          open: s.open, sat: s.sat, existing: true, initial: s.initial, staffed: s.staffed, rent: (byKey.get(s.key) || {}).rent || 0});
        /* A shop in its first days is held to its ramp over the very days measured. */
        const expect = m && Array.isArray(s.k) && s.k.length ? s.k.reduce((t, k) => t + osDayProfit(m, null, k), 0) / s.k.length : m && m.profit;
        return m && expect > 0 ? {...s, model: expect, ratio: s.actual / expect} : null;
      }).filter(Boolean);
      if(!rows.length) return null;
      const sorted = rows.map(r => r.ratio).sort((a, b) => a - b);
      const mid = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
      return {ratio: mid, rows};
    }
    /* What the player's own shops in the neighbourhood lose: a new seller moves
       the demand for every product it sells one step down there, for them too,
       whatever the product's weight for either type. A product the store at the
       address sells already (`provides`, osProvides()) moves nothing more. */
    function osCannibal(slug, hood, provides, excludeKey){
      const t = osType(slug), sales = ((osFacts().sales || {})[hood]) || {};
      const shops = new Set(), items = [];
      let loss = 0;
      (t ? t.products : []).forEach(([p]) => {
        const rows = sales[p];
        const m = (osFacts().market || {})[p];
        if(!rows || !m || !m.d || (provides && provides(p))) return;
        const n = ((m.hoods || {})[hood] || [0])[0] || 0;
        const now = osDemandWith(n, m.p), after = osDemandWith(n + 1, m.p);
        if(now <= 0 || after >= now) return;
        rows.forEach(([key, units, margin]) => { if(key === excludeKey) return; loss += units * Math.max(0, margin) * (1 - after / now); shops.add(key); });
        items.push(p);
      });
      return shops.size ? {loss, shops: shops.size, items} : null;
    }
    /* Independent additions to an existing shop, with unchanged hours, prices
       for its current range, promotion and satisfaction. The product's demand
       counts this shop as a new provider; neighbouring own shops lose demand.
       Full new equipment is budgeted (existing pieces may be occupied), plus
       delivery and seven days of stock. Extra daily costs are explicit inputs.
       Old floor-based arrival rules need a before/after range model: do not
       silently use a fully stocked shop's arrivals for those saves. */
    function osExpansions(slug, b, o = {}){
      const F = osFacts(), t = osType(slug), built = (F.built || {})[b?.key];
      if(!b || b.factsUnavailable || !t || t.model !== "retail" || !F.game?.capInitial
          || !Array.isArray(built?.sells) || !Array.isArray(o.open) || o.open.length !== 7
          || !Number.isFinite(o.sat) || !Number.isFinite(o.promoTotal) || !(osCap(b) > 0)) return null;
      const sells = new Set(built.sells), m = osModel(slug, b, {...o, existing: p => sells.has(p)});
      if(!m) return null;
      const extraCost = Number.isFinite(o.extraCost) ? Math.max(0, o.extraCost) : 0;
      if(companion){
        // Current interior effects are observations, not a complete changed-kit
        // projection. Adding a stocked SKU can also alter the price ratio/basket.
        if(modModule('interiors').status!=='disabled')return fail(slug,b,['expansion-interior-context-unavailable']);
        if(pricesModule.status==='ready' && (t.fee || t.feeWeekend))return fail(slug,b,['expansion-entrance-fee-context-unavailable']);
        if(modModule('footfall').status==='ready' && pricesModule.status==='ready')
          return fail(slug,b,['expansion-price-demand-context-unavailable']);
      }
      const rows=[];
      for(const l of m.lines.filter(l => !sells.has(l.p) && !l.service)){
        const choices = (t.expansionDisplays?.[l.p] || []).map(option => {
          if(!(option.capacity > 0)) return null;
          const n = Math.ceil(osCap(b) / option.capacity), counts = new Map();
          for(const [item, qty] of [...option.lines.map(([p, q]) => [p, q * n]), ...(option.extra || [])])
            counts.set(item, (counts.get(item) || 0) + qty);
          const lines = [...counts].map(([p, qty]) => [p, qty, "shelf", [l.p]]);
          if(lines.some(([p]) => !(F.items?.[p]?.p > 0) || !F.items[p].v?.length) || !priceKnown(lines.map(([id])=>id))) return null;
          const equipment = lines.reduce((sum, [p, qty]) => sum + F.items[p].p * qty, 0);
          const stores = osStores({lines}), delivery = stores.length * (F.game.delivery || 0);
          let setup=equipment+delivery;
          if(companion && pricesModule.status==='ready' && pricesModule.data.livingTransactionTypes.includes('ba:transaction_deliverycontract'))
            setup=cityCost(setup);
          return {lines, stores, equipment, delivery, setup};
        }).filter(Boolean).sort((a, z) => a.setup - z.setup);
        const kit = choices[0] || null;
        const loss = osCannibal(slug, b.hood, p => p !== l.p, b.key)?.loss || 0;
        let margin = l.units * (l.price - l.cost),utilityDelta=0,startupDelta=0,after=null,marginByDay=null;
        if(companion){
          if(!kit)return fail(slug,b,['expansion-equipment-price-unavailable']);
          if(loss && pricesModule.status==='ready' && pricesModule.data.takingsFactorThousandths!==1000)
            return fail(slug,b,['expansion-neighbour-cashflow-unavailable']);
          after=operating(slug,b,{...o,existing:true,existingExtraLines:kit.lines});
          if(after?.status!=='ready')return fail(slug,b,after?.reasons || ['expansion-operating-cost-unavailable']);
          utilityDelta=after.dailyCents/100-m.modCosts.dailyCents/100;
          startupDelta=(after.startupCents-m.modCosts.startupCents)/100;
          marginByDay=l.byDayUnits.map((units,wd)=>{
            const before=m.nativeByDay[wd].fees+m.lines.filter(row=>sells.has(row.p)).reduce((total,row)=>total+row.byDayUnits[wd]*row.price,0);
            return cityCost(before+units*l.price,true)-cityCost(before,true)-units*l.cost;
          });
          margin=marginByDay.reduce((sum,value)=>sum+value,0)/7;
        }
        const net = margin - loss - extraCost-utilityDelta;
        const stock = l.units * l.cost * 7, investment = kit ? kit.setup + stock+startupDelta : null;
        rows.push({...l, kit, margin, loss, extraCost:extraCost+utilityDelta, net, stock, investment,
          ...(companion?{modOperatingDelta:utilityDelta,modStartupDelta:startupDelta,assumptions:m.assumptions}:{}),
          payback:investment===null?null:!companion?osDays(investment,net):osBreakDay(investment,k=>{
            const next=after.dayCost(k),before=m.modCosts.dayCost(k);
            return next===null || before===null?null:marginByDay[(companion.day+k)%7]-loss-extraCost-(next-before)/100;
          })});
      }
      return rows.sort((a, z) => (a.payback ?? Infinity) - (z.payback ?? Infinity) || z.net - a.net || a.p.localeCompare(z.p));
    }

    /* Days to earn `inv` back at `profit` a day; null when it never does. */
    const osDays = (inv, profit) => profit > 0 ? Math.max(1, Math.ceil(inv / profit)) : null;

    /* --- the first days (research RAMP.md) ---------------------------------------
       A new store earns less at first. The opening day is a partial day at
       satisfaction 50 all round, taken as 0.8 of a day; new staff start at 50
       satisfaction and climb 0.6 an hour, and the shop's customer service
       follows them a day late. openStore.game.ramp (RAMP in Python) is each
       day's gross margin as a share of the steady one, from the opening day (0) on; rent, wages and marketing are
       paid in full from the start. The first shop in a neighbourhood to sell a
       product nobody has sold there for 21 days gets +20 demand on it for 14
       days (ProductMarketHelper.CreateHypeEventsForNewItemsAddedToANeighbourhood,
       NeighborhoodDemand.IsHypeEventAvailable: lastDaySold + 21 <= Day). */
    /* The products a new store of `slug` would be the first to sell in `hood`:
       demanded goods with a wholesale price (a service or a fee never hypes),
       nobody selling them there now and nobody for the last 21 days. */
    function osHyped(slug, hood){
      const t = osType(slug), M = osFacts().market || {};
      return (t ? t.products : []).map(([p]) => p).filter(p => {
        const m = M[p];
        if(!m || !m.d || !(m.cost > 0) || (m.only && !m.only.includes(hood))) return false;
        /* A save without the last day sold (older than MIN_BUILD) reads as never
           sold: nobody selling now, and the game 21 days old or more. */
        const row = (m.hoods || {})[hood] || [0, 0, null, null];
        return !(row[0] > 0) && (row[3] ?? 0) + OS_HYPE.idle <= company.day;
      });
    }
    /* Day k's profit after the opening (k = 0 is the opening day): the steady
       model `m`, the hyped one `mh` on days 1 to 14, each day's gross margin
       ramped, the fixed costs whole. */
    function osDayProfit(m, mh, k){
      let x = mh && k >= 1 && k <= OS_HYPE.days ? mh : m;
      const costs=x.modCosts; // Commitments are anchored to opening, never restarted per forecast day.
      if(x.modAtDay){ x=x.modAtDay(k); if(!x) return null; }
      const ramp = osGame("ramp");
      if(!m.modCosts && x === m && k >= ramp.length) return m.profit;
      const r = k < ramp.length ? ramp[k] : 1;
      const cost = costs ? costs.dayCost(k) : 0;
      if(cost === null) return null;
      if(x.nativeByDay){
        const native=x.nativeByDay[(companion.day+k)%7],day=settleDay(native,r);
        return day.revenue-day.cogs-day.wages-day.rent-day.marketing-cost/100;
      }
      return r * (x.revenue - x.cogs) - (x.wages + x.rent + x.marketing) - cost/100;
    }
    /* The day the running profit first covers `inv`, day by day: 1 is the
       opening day. `factor` scales every day, for the range. Null when the
       steady profit never gets there. */
    function osBreakDay(inv, day, factor = 1){
      let got = 0;
      for(let k = 0; k < 20000; k++){
        const value=day(k);
        if(!Number.isFinite(value)) return null;
        got += factor * value;
        if(got >= inv) return k + 1;
      }
      return null;
    }

    /* --- financing ---------------------------------------------------------------
       LoanHelper: flat interest on the amount borrowed, floor(L x rate x the
       difficulty's multiplier / 100 / days a year) a day, and max(5, floor(L /
       term)) of the principal, both at midnight. A bank lends up to its cap less
       what it is owed, and the company up to the largest of its wealth, a
       quarter of last week's daily profit over the term and the tutorial's floor
       while its first-loan objective is open, less all it owes. */
    function osLoanLimit(bank){
      const f = osFacts().finance || {};
      if(!bank || f.unavailable || bank.unavailable) return 0;
      const room = Math.max(0, bank.max - (bank.owed || 0));
      const economy = Math.floor(Math.max(0, Math.max(bank.floor ?? f.floor ?? 0, f.wealth || 0, (bank.incomeShare ?? 0.25) * (f.profit7 || 0) * bank.term) - (f.owed || 0)));
      return Math.min(room, economy);
    }
    const osYear = () => {
      const year = (osFacts().finance || {}).year;
      if(!year) throw new Error("openStore.finance.year is missing");
      return year;
    };
    function osLoan(amount, bank){
      const f = osFacts().finance || {};
      if(!bank || f.unavailable || bank.unavailable || amount < (f.minimum || 0)) return null;
      const interest = Math.floor(amount * bank.rate * (bank.interestMultiplier ?? f.multiplier ?? 0) / 100 / osYear() + 1e-6);
      const repay = Math.max(5, Math.floor(amount / (bank.term || 1)));
      const days = Math.ceil(amount / repay);
      return {amount, interest, repay, days, total: days * interest};
    }
    /* The day the owner's own cash is back: the profit less the installments
       while the loan runs, the whole profit after it. */
    function osLoanDays(own, profit, loan){
      if(own <= 0) return 0;
      /* `profit` is a day's profit, or osDayProfit() for the day after the opening. */
      const day = typeof profit === "function" ? profit : () => profit;
      let got = 0;
      for(let d = 1; d <= 20000; d++){
        const value=day(d-1);
        if(!Number.isFinite(value)) return null;
        got += value - (d <= loan.days ? loan.interest + loan.repay : 0);
        if(got >= own) return d;
      }
      return null;
    }

    return {
      diagnostics: (slug,b) => failures.get(`${slug}|${b?.key}`) || [],
      type: osType,
      cap: osCap,
      layout: osLayout,
      outfit: osOutfit,
      decor: osDecor,
      units: osUnits,
      demandWith: osDemandWith,
      promo: osPromo,
      days: osDays,
      investment: osInvestment,
      stores: osStores,
      price: osPrice,
      demand: osDemand,
      satisfaction: osSatisfaction,
      initial: osInitial,
      provides: osProvides,
      model: osModel,
      expansions: osExpansions,
      officeStaffed: osOfficeStaffed,
      officeModel: osOfficeModel,
      ownRatio: osOwnRatio,
      cannibal: osCannibal,
      hyped: osHyped,
      dayProfit: osDayProfit,
      breakDay: osBreakDay,
      loanLimit: osLoanLimit,
      loan: osLoan,
      loanDays: osLoanDays,
      rampDays: () => osFacts().game ? osGame("ramp").length : 0,
    };
  }
  return {create, emptyLease, availablePremises, leaseDeposit, HYPE: OS_HYPE, SKILL_100_WAGE};
})();
if(typeof module !== "undefined" && module.exports) module.exports = OpenStoreModel;
