/* Plan a factory calculation core. Python embeds this source after the store
   model; Node imports it directly. No board, DOM, storage or translations.
   OpenStoreModel supplies the same deterministic vendor grouping as stores. */
const OpenFactoryModel = ((storeModel, economyModel, ownerModel) => {
  "use strict";
  // Weekly imports, daily output deliveries, and the starter depot's shelves.
  const OF_RAW_DAYS = 7, OF_OUT_DAYS = 2, OF_DEPOT_SHELVES = 8;
  const storesFor = storeModel.create({}).stores;

  /**
   * Bind read-only facts from one payload. recipes is keyed by product slug;
   * aliases map recipe ingredients to traded products; sources hold active
   * import contracts. hours is production hours per day (24 on the board).
   * investment/running take explicit counts, building, owned and current
   * machine counts. investment additionally takes a selected depot building;
   * running takes wantsDepot (HQ needs even when no depot is available yet).
   * Methods never change their arguments. Missing kits/building yield a null
   * investment; other missing facts retain the board's existing zero/fallbacks,
   * except a game value a present table lacks (driverHours, hqHours, shelf.cc),
   * which throws: Python ships each one, and the model keeps no copy of it.
   */
  function create({facts = {}, recipes = {}, aliases = {}, sources = {}, hours = 24} = {}){
    const game = facts.game || {};
    const companion = facts.modEconomy, modded = !!(companion?.rlo || companion?.hart);
    const economy = modded && economyModel ? economyModel.create(companion) : null;
    const moduleOf = name => !companion?.rlo ? {status:"disabled"} : companion.rlo.modules?.[name] || {status:"unavailable"};
    const prices = moduleOf("prices"), company = moduleOf("company");
    const unavailablePrices = new Set(facts.priceUnavailable || []);
    const known = xs => xs.every(Number.isFinite);
    const sum = xs => known(xs) ? xs.reduce((n,v)=>n+v,0) : null;
    const fullWeek = () => Array.from({length:7},()=>[[0,hours]]);
    const missingCost = reason => ({status:"unavailable",dailyCents:null,byDayCents:Array(7).fill(null),startupCents:null,
      requirements:[],reasons:[reason],dayCost:()=>null});
    const wageKnown = () => company.status === "disabled" || (company.status === "ready" && company.data.partStates?.staff === "disabled")
      || (company.status === "ready" && company.data.partStates?.staff === "ready" && Number.isSafeInteger(company.data.newHireWageFactorThousandths));
    function rentCost(amount, deposit = false){
      if(!Number.isFinite(amount)) return null;
      if(amount === 0 || prices.status === "disabled") return amount;
      if(prices.status !== "ready" || !ownerModel || !Number.isFinite(amount)) return null;
      if(deposit && prices.data.depositAdjustment == null) return null;
      return deposit && prices.data.depositAdjustment === "none" ? amount
        : amount + ownerModel.cityAdjust(amount,prices.data.costFactorThousandths,prices.data.adjustmentQuiet);
    }
    function combineCosts(rows){
      const reasons = [...new Set(rows.flatMap(r=>r.reasons || []))];
      const dayCost = offset => sum(rows.map(r=>r.dayCost(offset)));
      const byDayCents = Array.from({length:7},(_,d)=>sum(rows.map(r=>r.byDayCents[d])));
      const dailyCents = known(byDayCents) ? sum(byDayCents)/7 : null;
      return {status:dailyCents === null || reasons.length ? "unavailable":"ready", dailyCents,byDayCents,
        startupCents:sum(rows.map(r=>r.startupCents)),requirements:rows.flatMap(r=>r.requirements || []),reasons,
        preparationDays:Math.max(0,...rows.map(r=>r.preparationDays || 0)),dayCost};
    }
    function deltaCosts(before, after){
      const subtract = (a,b)=>known([a,b]) ? a-b : null;
      const dayCost = d=>subtract(after.dayCost(d),before.dayCost(d));
      const byDayCents = after.byDayCents.map((v,d)=>subtract(v,before.byDayCents[d]));
      const reasons=[...new Set([...(before.reasons || []),...(after.reasons || [])])];
      return {status:known(byDayCents)&&!reasons.length?"ready":"unavailable",dailyCents:known(byDayCents)?sum(byDayCents)/7:null,
        byDayCents,startupCents:subtract(after.startupCents,before.startupCents),requirements:[],reasons,dayCost};
    }
    function operating({building,typeId,lines=[],existing=false,extra=[]}){
      if(!economy) return missingCost("mod-model-unavailable");
      const open = existing ? (facts.sites?.[building?.key]?.open || (facts.hq?.site?.key === building?.key ? facts.hq.open : null)) : fullWeek();
      return economy.operating({building,typeId,lines,existing,open,existingExtraLines:extra});
    }
    function modOperating({counts,building,owned=false,lines=[],depot=null,wantsDepot=false}){
      if(!modded) return null;
      const typeId="ba:businesstype_factory", rows=[];
      const input={building,typeId,existing:owned};
      if(!owned || lines.some(([,n])=>n>0)) rows.push(owned ? deltaCosts(operating(input),operating({...input,extra:lines})) : operating({...input,lines}));
      if(!owned && wantsDepot){
        if(!depot) rows.push(missingCost("depot-site-unavailable"));
        else{
          const site=depot.b, existing=!!facts.sites?.[site.key];
          const args={building:site,typeId:"ba:businesstype_warehouse",existing};
          const extra=[[facts.shelf.item,depot.shelves]];
          if(!existing || depot.shelves > 0) rows.push(existing ? deltaCosts(operating(args),operating({...args,extra})) : operating({...args,lines:extra}));
        }
      }
      const staffing=owned ? {agents:0,managers:0} : ofHq(counts,wantsDepot), seats=staffing.agents+staffing.managers;
      if(seats){
        const support=facts.hq || {}, ids=support.workstationLines;
        if(!support.site || !Array.isArray(ids) || !ids.length) rows.push(missingCost("hq-support-site-unavailable"));
        else if(!Number.isSafeInteger(support.spareWorkstations) || support.spareWorkstations < 0) rows.push(missingCost("hq-spare-workstations-unavailable"));
        else{
          const added=Math.max(0,seats-support.spareWorkstations);
          if(added){
            const args={building:support.site,typeId:"ba:businesstype_headquarters",existing:true};
            const extra=ids.map(([id,n])=>[id,n*added]);
            rows.push(deltaCosts(operating(args),operating({...args,extra})));
          }
        }
      }
      return combineCosts(rows);
    }
    /* A value openFactory ships (_open_factory() in Python, its single source).
       A table that is there without it is a payload bug, not a reason to guess;
       no table at all is a plan with no facts, which counts nothing. */
    const need = (from, key, where) => {
      if(from == null) return 0;
      const v = from[key];
      if(v == null) throw new Error(`openFactory.${where}.${key} is missing`);
      return v;
    };
    function ofProd(slug){
      const P = facts.products || {};
      if(P[slug]) return P[slug];
      const alias = aliases;
      const from = Object.keys(alias).find(k => alias[k] === slug && P[k]);
      return from ? P[from] : null;
    }
    const ofDiscount = () => 1 - 0.25 * Math.max(0, Math.min(100, game.agent ?? 100)) / 100;
    const ofWholesale = slug => { const p = ofProd(slug); return unavailablePrices.has(slug) ? null : p ? (p.w || 0) * (p.i || 1) * (game.prices || 1) : 0; };
    const ofImportPrice = slug => (ofWholesale(slug) == null ? null : ofWholesale(slug) * ofDiscount());
    const ofExportPrice = slug => (ofWholesale(slug) == null ? null : ofWholesale(slug) * (game.export || 0));
    /* The raw material one unit made eats, at import prices. */
    const ofRawUnit = slug => { const r = recipes[slug];
      return r && r.out ? (r.ingredients.some(i=>ofImportPrice(i.slug)==null) ? null : r.ingredients.reduce((s, i) => s + i.per * ofImportPrice(i.slug), 0) / r.out) : 0; };
    /* SkillData.baseHourlyWage × (1 + 1.05^skill / 100) × the game's salary
       multiplier, at skill 100, as the store flow plans its staff. */
    const baseHourly = skill => ((facts.skills || {})[`ba:skill_${skill}`] || 0) * storeModel.SKILL_100_WAGE * (game.wages || 0);
    const ofHourly = skill => {
      const base=baseHourly(skill);
      if(!wageKnown()) return null;
      return company.status === "ready" && company.data.partStates?.staff !== "disabled"
        ? ownerModel.wage(base,company.data.newHireWageFactorThousandths) : base;
    };
    /* What a line saves a week: the imports it replaces, less the raw material
       its machines eat running flat out. The surplus is valued apart, as an export. */
    const ofSaves = l => known([ofImportPrice(l.slug),ofRawUnit(l.slug)]) ? Math.min(l.made, l.want) * ofImportPrice(l.slug) - l.made * ofRawUnit(l.slug) : null;
    /* A week of raw material for these machines, per ingredient. */
    function ofRawWeek(counts){
      const out = {};
      Object.entries(counts).forEach(([slug, m]) => { const r = recipes[slug];
        if(r && m > 0) r.ingredients.forEach(i => { out[i.slug] = (out[i.slug] || 0) + m * i.per * hours * 7; }); });
      return out;
    }
    const ofRawCost = counts => sum(Object.entries(ofRawWeek(counts)).map(([slug,n])=>ofImportPrice(slug)==null ? null : n*ofImportPrice(slug)));
    function ofKit(counts){
      const kits = facts.kits || {}, out = new Map();
      Object.entries(counts).forEach(([slug, m]) => { const r = recipes[slug];
        if(r && m > 0) (kits[r.workstation] || []).forEach(([item]) => out.set(item, (out.get(item) || 0) + m)); });
      return out;
    }
    /* Boxes for a week of each ingredient and two days of each product. A box
       holds the item's own box size (Item.boxSize); an item with none is not counted. */
    function ofBoxes(counts){
      const box = slug => (ofProd(slug) || {}).bx || 0, need = new Map();
      const add = (slug, n) => need.set(slug, (need.get(slug) || 0) + n);
      Object.entries(counts).forEach(([slug, m]) => { const r = recipes[slug];
        if(!r || !(m > 0)) return;
        add(slug, m * r.out * hours * OF_OUT_DAYS);
        r.ingredients.forEach(i => add(i.slug, m * i.per * hours * OF_RAW_DAYS)); });
      let boxes = 0;
      need.forEach((n, slug) => { if(box(slug)) boxes += Math.ceil(n / box(slug)); });
      return boxes;
    }
    /* Keep an empty warehouse or the depot already opened for this plan.
       Otherwise choose an available warehouse nearby, then city-wide. */
    function selectDepot({building, buildings = [], rememberedKey = null}){
      const kept = rememberedKey && (!building || rememberedKey !== building.key)
        ? buildings.find(b => b.key === rememberedKey) : null;
      if(kept && kept.type === "warehouse" && (storeModel.availablePremises(kept)
        || (kept.status === "mine" && kept.occupant?.typeSlug === "ba:businesstype_warehouse"))) return kept;
      const free = buildings.filter(b => b.type === "warehouse" && storeModel.availablePremises(b)
        && (!building || b.key !== building.key) && b.rent != null);
      const near = free.filter(b => building && b.hood === building.hood);
      return (near.length ? near : free).slice().sort((a, b) => a.rent - b.rent || a.key.localeCompare(b.key))[0] || null;
    }
    function ofInvestment({counts, building: b, owned = false, current: now = {}, depot: at = null, wantsDepot = !!at}){
      const F = facts, g = game, items = F.items || {};
      if(!F.kits) return null;
      if(!b) return null;
      const adds = owned ? Object.fromEntries(Object.entries(counts).map(([slug, m]) => [slug, Math.max(0, m - (now[slug] || 0))])) : counts;
      /* A factory you run stores for every line it keeps after the change, its
         other types' included, against the shelves standing there. */
      const shelf = F.shelf || {}, cc = need(F.shelf, "cc", "shelf"), boxes = ofBoxes(owned ? {...now, ...counts} : counts);
      const placed = owned ? (((F.sites || {})[b.key] || {}).shelves || 0) : 0;
      const shelves = cc ? Math.max(0, Math.ceil(boxes / cc) - placed) : 0;
      const out = {lines: [...ofKit(adds)].map(([item, qty]) => [item, qty, "ws"])};
      if(shelves && shelf.item) out.lines.push([shelf.item, shelves, "shelf"]);
      const price = item => (items[item] || {}).p || 0;
      const furniture = out.lines.reduce((s, [item, qty]) => s + qty * price(item), 0);
      const stores = storesFor(out, items);
      const delivery = furniture ? stores.length * (g.delivery || 0) : 0;
      const fee = (g.installFee || 0) * (b.m2 || 0);
      const truck = owned ? 0 : ((F.vehicles || {}).truck || {}).p || 0;
      const deposit = owned ? 0 : storeModel.leaseDeposit(b) || 0;
      let depot = null;
      if(!owned && at){
        const van = ((F.vehicles || {}).van || {}).p || 0;
        const shelvesToBuy = modded ? Math.max(0,OF_DEPOT_SHELVES-(F.sites?.[at.key]?.shelves || 0)) : OF_DEPOT_SHELVES;
        const racks = shelvesToBuy * (shelf.p || 0);
        const depotDeposit = storeModel.leaseDeposit(at) || 0;
        depot = {b: at, deposit: depotDeposit, shelves: shelvesToBuy, racks, van, delivery: shelvesToBuy ? g.delivery || 0 : 0,
          total: depotDeposit + racks + van + (shelvesToBuy ? g.delivery || 0 : 0)};
      }
      const modCosts=modOperating({counts,building:b,owned,lines:out.lines,depot,wantsDepot:!owned && wantsDepot});
      const support=F.hq || {}, hqStaff=owned ? {agents:0,managers:0} : ofHq(counts,wantsDepot);
      const seats=modded && Number.isSafeInteger(support.spareWorkstations) ? Math.max(0,hqStaff.agents+hqStaff.managers-support.spareWorkstations) : 0;
      const hqLines=(support.workstationLines || []).map(([id,n])=>[id,n*seats]).filter(([,n])=>n>0);
      const hqOut={lines:hqLines}, hqFurniture=hqLines.reduce((n,[id,q])=>n+q*price(id),0);
      const hqDelivery=hqLines.length ? storesFor(hqOut,items).length*(g.delivery || 0) : 0;
      const hqPurchase={lines:hqLines,seats,furniture:hqFurniture,delivery:hqDelivery,total:hqFurniture+hqDelivery};
      const education=modded ? (!out.lines.length ? {status:"ready",startupCents:0,totalCents:0,requirements:[],reasons:[]} : economy ? economy.factoryRequirements(out.lines) : {status:"unavailable",startupCents:null,totalCents:null,requirements:[],reasons:["mod-model-unavailable"]}) : null;
      const incomplete=[...(F.compatibility?.factoryOpening || []),...(modCosts?.reasons || []),...(education?.reasons || [])];
      if(education?.totalCents === null) incomplete.push("course-future-cost-unavailable");
      if(modded && !owned && (storeModel.leaseDeposit(b) == null || (at && storeModel.leaseDeposit(at) == null))) incomplete.push("lease-quote-unavailable");
      if([...out.lines,...hqLines,...(depot?.shelves ? [[shelf.item,depot.shelves]] : [])].some(([id,n])=>n>0 && (unavailablePrices.has(id) || !items[id]))) incomplete.push("equipment-price-unavailable");
      const adjustedDeposit=rentCost(deposit,true), depotAdjustment=depot ? rentCost(depot.deposit,true) : 0;
      if(!known([adjustedDeposit,depotAdjustment])) incomplete.push("deposit-adjustment-unavailable");
      const firmCost = prices.status === "disabled" ? fee+furniture : prices.status === "ready"
        ? (prices.data.livingTransactionTypes.includes("ba:transaction_interiorinstallation") ? rentCost(fee+furniture) : fee+furniture) : null;
      if(firmCost === null) incomplete.push("installation-adjustment-unavailable");
      const modCapital=(modCosts?.startupCents || 0)/100+(education?.totalCents || 0)/100;
      const extra = hqPurchase.total + truck + (adjustedDeposit ?? deposit) + (depot ? depot.total - depot.deposit + (depotAdjustment ?? depot.deposit) : 0) + modCapital;
      return {b, out, stores, furniture, delivery, fee, truck, deposit, depot, boxes, shelves, placed,
        ...(incomplete.length ? {incomplete:[...new Set(incomplete)]}:{}),
        ...(modded ? {modCosts,modEducation:education,modRequirements:education.requirements,hqPurchase,
          assumptions:["captured-settings-constant","self-installation-uses-furniture-delivery","firm-net-installation-without-resales","additional-depot-van","course-installments-session-triggered"],
          upfrontSelf:furniture+delivery+extra-(education.totalCents || 0)/100+(education.startupCents || 0)/100,
          upfrontFirm:(firmCost ?? fee+furniture)+extra-(education.totalCents || 0)/100+(education.startupCents || 0)/100}:{}),
        items: out.lines.reduce((n, l) => n + l[1], 0), adds,
        self: furniture + delivery + extra, firm: (firmCost ?? fee+furniture) + extra};
    }
    function ofHq(counts, wantsDepot = false){
      const hq = facts.hq || {}, need = ofIngredientsUncontracted(counts).length > 0;
      const managers = Math.max(0, 1 + (wantsDepot ? 1 : 0) - Math.max(0, (hq.managers || 0) - (hq.managed || 0)));
      const agents = need && (hq.agents || 0) <= (hq.contracts || 0) ? 1 : 0;
      return {managers, agents};
    }
    function ofRunning({counts, owned = false, current = {}, building = null, wantsDepot = false}, inv){
      if(facts.compatibility?.factoryRunning?.length && !modded) return null;
      const g = game, machines = Object.values(counts).reduce((n, m) => n + m, 0);
      const modCosts=modded ? (inv?.modCosts || modOperating({counts,building,owned,lines:inv?.out.lines || [...ofKit(owned ? Object.fromEntries(Object.entries(counts).map(([k,n])=>[k,Math.max(0,n-(current[k]||0))])) : counts)],depot:inv?.depot,wantsDepot})) : null;
      const finish = result => {
        if(!modded) return result;
        const incomplete=[...(facts.compatibility?.factoryRunning || []),...(modCosts?.reasons || [])];
        if(!wageKnown() && result.wages !== 0) incomplete.push("new-hire-wage-unavailable");
        if(result.raw === null) incomplete.push("material-price-unavailable");
        if(result.rent === null) incomplete.push("rent-adjustment-unavailable");
        // CityDayFigures applies the city factor to native daily salary once.
        // The Company ordinary-hourly quote already displays that factor;
        // it is not the unadjusted salary transaction basis.
        const cityWages = result.wages === null ? null : rentCost(result.wages/7);
        if(cityWages === null) incomplete.push("wage-adjustment-unavailable");
        const wages=cityWages === null ? null : cityWages*7;
        return {...result,wages,modCosts,incomplete:[...new Set(incomplete)],total:incomplete.length || modCosts?.dailyCents == null ? null : sum([result.raw,wages,result.rent,modCosts.dailyCents*7/100])};
      };
      if(owned){
        const now = Object.fromEntries(Object.keys(counts).map(slug => [slug, current[slug] || 0]));
        const was = Object.values(now).reduce((n, m) => n + m, 0);
        const raw = known([ofRawCost(counts),ofRawCost(now)]) ? ofRawCost(counts)-ofRawCost(now) : null, workers = machines <= was ? 0 : wageKnown() ? (machines - was) * 168 * baseHourly("factoryworker") : null;
        return finish({raw, wages: workers, rent: 0, workers, driver: 0, hq: 0, total: sum([raw,workers])});
      }
      const hq = ofHq(counts, wantsDepot), b = inv ? inv.b : building;
      const raw = ofRawCost(counts), workers = machines * 168 * baseHourly("factoryworker");
      const drivers = 1 + (inv && inv.depot ? 1 : 0);
      const driver = drivers * need(facts.game, "driverHours", "game") * 7 * baseHourly("deliverydriver");
      const office = (hq.agents * baseHourly("purchasingagent") + hq.managers * baseHourly("logisticsmanager")) * need(facts.game, "hqHours", "game");
      const rent = sum([rentCost(modded ? b?.rent ?? null : b?.rent || 0),rentCost(modded && inv?.depot ? (facts.sites?.[inv.depot.b.key] ? 0 : inv.depot.b.rent ?? null) : inv?.depot?.b.rent || 0)]);
      return finish({raw, wages: wageKnown() ? workers + driver + office : null, rent:rent==null?null:rent*7, workers, driver, hq: office, total: sum([raw, workers, driver, office, rent==null?null:rent*7])});
    }
    /* The ingredients the plan's lines eat that no active import contract brings. */
    function ofIngredientsUncontracted(counts){
      const alias = aliases;
      return Object.keys(ofRawWeek(counts)).filter(slug => { const s = sources[alias[slug] || slug] || sources[slug]; return !(s && s.active); });
    }
    return {
      product: ofProd, discount: ofDiscount, wholesale: ofWholesale,
      importPrice: ofImportPrice, exportPrice: ofExportPrice, rawUnit: ofRawUnit,
      hourly: ofHourly, saves: ofSaves, rawWeek: ofRawWeek, rawCost: ofRawCost,
      kit: ofKit, boxes: ofBoxes, selectDepot, investment: ofInvestment,
      hq: ofHq, running: ofRunning, uncontracted: ofIngredientsUncontracted,
    };
  }
  return {create};
})(typeof module !== "undefined" && module.exports ? require("./open-store-model.js") : OpenStoreModel,
   typeof module !== "undefined" && module.exports ? require("./mod-economy-model.js") : (typeof ModEconomyModel !== "undefined" ? ModEconomyModel : null),
   typeof module !== "undefined" && module.exports ? require("./mod-demand-model.js") : (typeof ModDemandModel !== "undefined" ? ModDemandModel : null));
if(typeof module !== "undefined" && module.exports) module.exports = OpenFactoryModel;
