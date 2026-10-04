/* Plan a factory calculation core. Python embeds this source after the store
   model; Node imports it directly. No board, DOM, storage or translations.
   OpenStoreModel supplies the same deterministic vendor grouping as stores. */
const OpenFactoryModel = ((storeModel) => {
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
   * investment; other missing facts retain the board's existing zero/fallbacks.
   */
  function create({facts = {}, recipes = {}, aliases = {}, sources = {}, hours = 24} = {}){
    const game = facts.game || {};
    function ofProd(slug){
      const P = facts.products || {};
      if(P[slug]) return P[slug];
      const alias = aliases;
      const from = Object.keys(alias).find(k => alias[k] === slug && P[k]);
      return from ? P[from] : null;
    }
    const ofDiscount = () => 1 - 0.25 * Math.max(0, Math.min(100, game.agent ?? 100)) / 100;
    const ofWholesale = slug => { const p = ofProd(slug); return p ? (p.w || 0) * (p.i || 1) * (game.prices || 1) : 0; };
    const ofImportPrice = slug => ofWholesale(slug) * ofDiscount();
    const ofExportPrice = slug => ofWholesale(slug) * (game.export || 0);
    /* The raw material one unit made eats, at import prices. */
    const ofRawUnit = slug => { const r = recipes[slug];
      return r && r.out ? r.ingredients.reduce((s, i) => s + i.per * ofImportPrice(i.slug), 0) / r.out : 0; };
    /* SkillData.baseHourlyWage × (1 + 1.05^skill / 100) × the game's salary
       multiplier, at skill 100, as the store flow plans its staff. */
    const ofHourly = skill => ((facts.skills || {})[`ba:skill_${skill}`] || 0) * (1 + Math.pow(1.05, 100) / 100) * (game.wages || 0);
    /* What a line saves a week: the imports it replaces, less the raw material
       its machines eat running flat out. The surplus is valued apart, as an export. */
    const ofSaves = l => Math.min(l.made, l.want) * ofImportPrice(l.slug) - l.made * ofRawUnit(l.slug);
    /* A week of raw material for these machines, per ingredient. */
    function ofRawWeek(counts){
      const out = {};
      Object.entries(counts).forEach(([slug, m]) => { const r = recipes[slug];
        if(r && m > 0) r.ingredients.forEach(i => { out[i.slug] = (out[i.slug] || 0) + m * i.per * hours * 7; }); });
      return out;
    }
    const ofRawCost = counts => Object.entries(ofRawWeek(counts)).reduce((s, [slug, n]) => s + n * ofImportPrice(slug), 0);
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
    /* Keep a remembered depot while free or owned, unless it is the factory.
       Otherwise choose the cheapest vacant warehouse nearby, then city-wide. */
    function selectDepot({building, buildings = [], rememberedKey = null}){
      const kept = rememberedKey && (!building || rememberedKey !== building.key)
        ? buildings.find(b => b.key === rememberedKey) : null;
      if(kept && (kept.status === "vacant" || kept.status === "mine")) return kept;
      const free = buildings.filter(b => b.type === "warehouse" && b.status === "vacant"
        && (!building || b.key !== building.key) && b.rent != null);
      const near = free.filter(b => building && b.hood === building.hood);
      return (near.length ? near : free).slice().sort((a, b) => a.rent - b.rent || a.key.localeCompare(b.key))[0] || null;
    }
    function ofInvestment({counts, building: b, owned = false, current: now = {}, depot: at = null}){
      const F = facts, g = game, items = F.items || {};
      if(!F.kits) return null;
      if(!b) return null;
      const adds = owned ? Object.fromEntries(Object.entries(counts).map(([slug, m]) => [slug, Math.max(0, m - (now[slug] || 0))])) : counts;
      /* A factory you run stores for every line it keeps after the change, its
         other types' included, against the shelves standing there. */
      const shelf = F.shelf || {}, cc = shelf.cc || 60, boxes = ofBoxes(owned ? {...now, ...counts} : counts);
      const placed = owned ? (((F.sites || {})[b.key] || {}).shelves || 0) : 0;
      const shelves = Math.max(0, Math.ceil(boxes / cc) - placed);
      const out = {lines: [...ofKit(adds)].map(([item, qty]) => [item, qty, "ws"])};
      if(shelves && shelf.item) out.lines.push([shelf.item, shelves, "shelf"]);
      const price = item => (items[item] || {}).p || 0;
      const furniture = out.lines.reduce((s, [item, qty]) => s + qty * price(item), 0);
      const stores = storesFor(out, items);
      const delivery = furniture ? stores.length * (g.delivery || 0) : 0;
      const fee = (g.installFee || 0) * (b.m2 || 0);
      const truck = owned ? 0 : ((F.vehicles || {}).truck || {}).p || 0;
      const deposit = owned ? 0 : b.deposit || 0;
      let depot = null;
      if(!owned && at){
        const van = ((F.vehicles || {}).van || {}).p || 0;
        const racks = OF_DEPOT_SHELVES * (shelf.p || 0);
        depot = {b: at, deposit: at.deposit || 0, shelves: OF_DEPOT_SHELVES, racks, van, delivery: g.delivery || 0,
          total: (at.deposit || 0) + racks + van + (g.delivery || 0)};
      }
      const extra = truck + deposit + (depot ? depot.total : 0);
      return {b, out, stores, furniture, delivery, fee, truck, deposit, depot, boxes, shelves, placed,
        items: out.lines.reduce((n, l) => n + l[1], 0), adds,
        self: furniture + delivery + extra, firm: fee + furniture + extra};
    }
    function ofHq(counts, wantsDepot = false){
      const hq = facts.hq || {}, need = ofIngredientsUncontracted(counts).length > 0;
      const managers = Math.max(0, 1 + (wantsDepot ? 1 : 0) - Math.max(0, (hq.managers || 0) - (hq.managed || 0)));
      const agents = need && (hq.agents || 0) <= (hq.contracts || 0) ? 1 : 0;
      return {managers, agents};
    }
    function ofRunning({counts, owned = false, current = {}, building = null, wantsDepot = false}, inv){
      const g = game, machines = Object.values(counts).reduce((n, m) => n + m, 0);
      if(owned){
        const now = Object.fromEntries(Object.keys(counts).map(slug => [slug, current[slug] || 0]));
        const was = Object.values(now).reduce((n, m) => n + m, 0);
        const raw = ofRawCost(counts) - ofRawCost(now), workers = Math.max(0, machines - was) * 168 * ofHourly("factoryworker");
        return {raw, wages: workers, rent: 0, workers, driver: 0, hq: 0, total: raw + workers};
      }
      const hq = ofHq(counts, wantsDepot), b = inv ? inv.b : building;
      const raw = ofRawCost(counts), workers = machines * 168 * ofHourly("factoryworker");
      const drivers = 1 + (inv && inv.depot ? 1 : 0);
      const driver = drivers * (g.driverHours || 5.7) * 7 * ofHourly("deliverydriver");
      const office = (hq.agents * ofHourly("purchasingagent") + hq.managers * ofHourly("logisticsmanager")) * (g.hqHours || 40);
      const rent = ((b && b.rent) || 0) * 7 + (inv && inv.depot ? (inv.depot.b.rent || 0) * 7 : 0);
      return {raw, wages: workers + driver + office, rent, workers, driver, hq: office, total: raw + workers + driver + office + rent};
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
})(typeof module !== "undefined" && module.exports ? require("./open-store-model.js") : OpenStoreModel);
if(typeof module !== "undefined" && module.exports) module.exports = OpenFactoryModel;
