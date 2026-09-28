/* --- Expansion › Open a store ------------------------------------------------
   docs/open-a-store-scope.md, phase 2. A plan walks four steps: what to open
   (a type, or a Demand cell), where (Find a location, embedded and fixed to
   the type), the investment for a 100% outfitted store in that building in
   either install mode, and when it breaks even, with a loan if the reader
   wants one. Steps 5 and 6 (the checklist until opening, and payback once it
   trades) come with phase 3 and 4; they stand in the bar, not yet reachable.

   Python sends the facts (_open_store(): each type's outfit per layout, what
   every product meets in every neighbourhood, the player's own shops, the
   banks); everything the reader moves is worked out here: the profit model
   runs in osModel() over the building on screen, the best of the 64
   marketing mixes is picked for it, and the loan is priced as the game does.
   The plans are kept per character in localStorage, like the finder's saved
   searches, and every read and write is guarded: a browser that refuses
   storage keeps the plans for the visit. */
const OS_KEY = "ba_open_store_v1";
const OS_MAX_PLANS = 12;
const OS_STEPS = ["what", "where", "investment", "breakeven", "opening", "open"];
/* The range the estimate is shown as: the p25 and p90 of the validation's
   actual ÷ model on real shops (research PROFIT_MODEL.md, section 6). */
const OS_LOW = 0.8, OS_HIGH = 1.05;
let osPlans = [], osPlansFor = null, osCur = null, osStep = "what", osFinder = null, osBest = new Map();
const osFacts = () => (typeof D !== "undefined" && D && D.openStore) || {};
const osStore = () => `${OS_KEY}:${(D && D.meta && D.meta.character) || "default"}`;
const OS_ICON = {
  store: '<path d="M4 10v10h16V10"></path><path d="M3 10l2-6h14l2 6"></path><path d="M3 10c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3"></path><path d="M10 20v-5h4v5"></path>',
  paint: '<rect x="4" y="3" width="14" height="6" rx="1.5"></rect><path d="M18 6h2v5h-8v3"></path><rect x="10.5" y="14" width="3" height="7" rx="1"></rect>',
  key: '<circle cx="8" cy="15" r="4"></circle><path d="M11 12l9-9M16 7l3 3"></path>',
  bank: '<path d="M3 10h18L12 4z"></path><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"></path>',
};
const osIcon = name => OS_ICON[name] ? `<svg class="os-ico" viewBox="0 0 24 24" aria-hidden="true">${OS_ICON[name]}</svg>` : icon(name);

/* --- the plans, per character -------------------------------------------- */
function osLoad(){
  const who = osStore();
  if(osPlansFor === who) return;
  osPlansFor = who; osPlans = []; osCur = null; osStep = "what"; osBest = new Map();
  try{
    const raw = JSON.parse(localStorage.getItem(who));
    if(raw && Array.isArray(raw.plans)){
      osPlans = raw.plans.filter(p => p && typeof p.id === "string" && typeof p.type === "string").slice(0, OS_MAX_PLANS)
        .map(p => ({id: p.id, type: p.type, hood: typeof p.hood === "string" ? p.hood : null,
          key: typeof p.key === "string" ? p.key : null, mode: p.mode === "self" ? "self" : p.mode === "firm" ? "firm" : null,
          finance: p.finance && typeof p.finance === "object" ? {on: !!p.finance.on, amount: Math.max(0, +p.finance.amount || 0),
            bank: typeof p.finance.bank === "string" ? p.finance.bank : null} : {on: false, amount: 0, bank: null},
          step: OS_STEPS.includes(p.step) ? p.step : "what", made: +p.made || null}));
      osCur = osPlans.some(p => p.id === raw.current) ? raw.current : null;
    }
  }catch(e){}
  const plan = osPlan();
  osStep = plan ? plan.step : "what";
}
function osSave(){
  const plan = osPlan();
  if(plan) plan.step = osStep;
  try{ localStorage.setItem(osStore(), JSON.stringify({plans: osPlans, current: osCur})); }catch(e){}
}
const osPlan = () => osPlans.find(p => p.id === osCur) || null;
/* A new plan for a type, from a Demand cell (its neighbourhood preselected)
   or the type grid. The newest plan comes first; the oldest drops past twelve. */
function osNew(type, hood){
  const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  osPlans.unshift({id, type, hood: hood || null, key: null, mode: null, finance: {on: false, amount: 0, bank: null},
    step: "where", made: (D.meta || {}).day || null});
  osPlans = osPlans.slice(0, OS_MAX_PLANS);
  osCur = id; osStep = "where";
  osSave();
  return osPlan();
}
/* The install mode: the plan's own once chosen, else the portfolio's
   (paybackMode(), kept per character); a switch here moves both. */
const osMode = plan => (plan && plan.mode) || paybackMode();
function osSetMode(mode){
  const plan = osPlan();
  if(plan) plan.mode = mode;
  paybackSetMode(mode);
  osSave();
}

/* --- what the plan stands on ---------------------------------------------- */
const osType = slug => (osFacts().types || {})[slug] || null;
const osBuilding = key => key && typeof premises === "function" && premises() ? premises().buildings.find(b => b.key === key) || null : null;
const osCap = b => Array.isArray(b && b.cap) ? b.cap[0] : (b && b.cap) || 0;
const osTypeName = slug => gameName(slug) || String(slug || "").replace(/^ba:businesstype_/, "");
const osItemName = item => gameName(item) || prettySlug(String(item || ""));
/* The outfit for the building's layout: its lines and furniture total. */
const osOutfit = (plan, b) => { const t = plan && osType(plan.type); return t && b ? (t.layouts || {})[b.layout] || null : null; };
/* Midtown asks for an interior score; the walls and floors that reach it. */
const osDecor = b => b && ((osFacts().hoods || {})[b.hood] || {}).interior > 0 ? (osFacts().decor || {})[b.layout] || null : null;

/* The investment in each mode, as setup_cost() counts it: the firm's fee on
   the floor, every item at its default price, the deposit; self-installation
   the items, a delivery per store, and the walls and floors where the
   neighbourhood asks for them. */
function osInvestment(plan, b){
  const out = osOutfit(plan, b);
  if(!out || !b) return null;
  const deposit = b.deposit || 0, decor = osDecor(b);
  const stores = osStores(out).length;
  const delivery = stores * ((osFacts().game || {}).delivery || 0);
  return {furniture: out.furniture, fee: out.fee, deposit, stores, delivery, decor: decor ? decor.cost : 0,
    firm: out.furniture + out.fee + deposit, self: out.furniture + delivery + (decor ? decor.cost : 0) + deposit,
    items: out.lines.reduce((n, l) => n + l[1], 0)};
}
/* Self-installation's shopping list by store: each item from a store that
   sells it, as few stores as will do, the one that sells the most first. */
function osStores(out){
  const items = osFacts().items || {};
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
/* A new shop counts itself among the sellers; an existing one already is. */
function osDemand(item, hood, existing){
  const m = (osFacts().market || {})[item];
  if(!m) return 0;
  if(!m.d) return 100;
  if(m.only && !m.only.includes(hood)) return 0;
  const row = (m.hoods || {})[hood] || [0];
  return osDemandWith((row[0] || 0) + (existing ? 0 : 1), m.p);
}
/* The satisfaction the plan settles at: the player's own shops of the type,
   their median, else a well-run shop's. */
function osSatisfaction(slug){
  const seen = ((osFacts().own || {})[slug] || []).map(s => s.sat).filter(v => Number.isFinite(v)).sort((a, b) => a - b);
  return seen.length ? seen[Math.floor(seen.length / 2)] : ((osFacts().game || {}).satisfaction || 95);
}
/* One day of a store of type `slug` in building `b`. `o`: reach (m² of
   marketing) and cost, or promoTotal for a shop whose promotion is known;
   open (per weekday [start, end) slots, 24/7 by default); sat; existing. */
function osModel(slug, b, o = {}){
  const F = osFacts(), t = osType(slug), g = F.game || {}, h = (F.hoods || {})[b.hood];
  if(!t || t.model !== "retail" || !h) return null;
  const cap = osCap(b), m2 = b.m2 || 0;
  const mk = Math.round(Math.min((o.reach || 0) / (m2 || 1), 1) * 100);
  const total = o.promoTotal ?? Math.min(100, Math.round((b.traffic || 0) + mk * h.strength));
  const promo = (g.promo || 0) + 0.75 * total / 100;
  /* The whole range the type sells, as the outfit stocks it: the validation's
     planner default. The best primary product's ratio starts an old game's hour. */
  const range = t.products.filter(([p]) => p !== t.fee && p !== t.feeWeekend);
  const best = Math.max(0, ...t.products.filter(([, impact]) => impact >= 1).map(([p]) => ((F.market || {})[p] || {}).r || 0));
  const initial = g.capInitial ? cap : best * m2;
  const sat = 1 + ((o.sat ?? osSatisfaction(slug)) - 50) / 100;
  const lines = range.map(([p, impact]) => {
    const m = F.market[p] || {};
    const amt = t.amt <= 1 ? t.amt : impact >= 1 ? (1 + t.amt) / 2 : 1;
    return {p, impact, amt, r: m.r || 1, demand: osDemand(p, b.hood, o.existing), service: !!m.s, cost: m.cost || 0, ...osPrice(p, b.hood), units: 0};
  });
  const slots = o.open || Array.from({length: 7}, () => [[0, 24]]);
  let customers = 0, fees = 0, open = 0;
  const feePrice = wd => { const f = t.feeWeekend && (wd === 0 || wd === 6) ? t.feeWeekend : t.fee; return f ? osPrice(f, b.hood).price : 0; };
  for(let wd = 0; wd < 7; wd++){
    for(const [a, z] of slots[wd] || []){
      for(let hr = a; hr < z; hr++){
        open++;
        const raw = initial * promo * (t.days[wd] || 0) * (t.hours[hr] || 0);
        const n = raw > 0 ? Math.ceil(Math.min(raw, cap)) : 0;
        if(n <= 0) continue;
        let none = 1;
        lines.forEach(l => {
          const u = osUnits(n * l.r * l.demand / 100 * sat * l.impact * l.amt);
          l.units += u;
          none *= l.service ? Math.max(0, 1 - Math.min(u, n) / n) : n > 1 ? Math.pow(1 - 1 / n, u) : (u >= 1 ? 0 : 1 - u);
        });
        const served = t.noOrder ? n : n * (1 - none);
        customers += served;
        fees += served * feePrice(wd);
      }
    }
  }
  let revenue = fees / 7, cogs = 0;
  lines.forEach(l => { l.units /= 7; revenue += l.units * l.price; cogs += l.units * l.cost; });
  /* A hairdresser's service uses one hair-care product at its cost. */
  const care = (F.market || {})["ba:itemname_haircareproduct"];
  if(slug === "ba:businesstype_hairdresser" && care) cogs += lines.filter(l => l.service).reduce((s, l) => s + l.units, 0) * care.cost;
  const w = g.wageBase || {}, rate = (1 + Math.pow(1.05, 100) / 100) * (g.wages || 0);
  const wages = open / 7 * (Math.ceil(cap / (w.perCashier || 30)) * (w.cashier || 0) + (w.cleaner || 0) + (w.guard || 0)) * rate;
  const rent = o.rent ?? (b.rent || 0), marketing = o.cost || 0;
  return {revenue, cogs, wages, rent, marketing, profit: revenue - cogs - wages - rent - marketing,
    customers: customers / 7, fees: fees / 7, lines, promo: total};
}
/* The best of the 64 marketing mixes for this building: one of each
   campaign at most, kept when it adds more than it costs. */
function osBestModel(slug, b){
  const id = `${slug}|${b.key}|${(D.meta || {}).day}`;
  if(osBest.has(id)) return osBest.get(id);
  const camps = osFacts().campaigns || [];
  let best = null;
  for(let mask = 0; mask < 1 << camps.length; mask++){
    let reach = 0, cost = 0;
    camps.forEach(([, price, sqm], i) => { if(mask >> i & 1){ reach += sqm; cost += price; } });
    const m = osModel(slug, b, {reach, cost});
    if(m && (!best || m.profit > best.profit)) best = {...m, mix: camps.filter((c, i) => mask >> i & 1).map(c => c[0])};
  }
  osBest.set(id, best);
  return best;
}
/* How the player's own shops of the type do against the same rules on their
   own buildings, hours and marketing: the median of actual ÷ model. */
function osOwnRatio(slug){
  const own = (osFacts().own || {})[slug] || [];
  const byKey = new Map((D.businesses || []).map(b => [b.key, b]));
  const rows = own.map(s => {
    const m = osModel(slug, {hood: s.hood, cap: s.cap, m2: s.m2, key: s.key}, {promoTotal: s.promo, cost: s.marketing,
      open: s.open, sat: s.sat, existing: true, rent: (byKey.get(s.key) || {}).rent || 0});
    return m && m.profit > 0 ? {...s, model: m.profit, ratio: s.actual / m.profit} : null;
  }).filter(Boolean);
  if(!rows.length) return null;
  const sorted = rows.map(r => r.ratio).sort((a, b) => a - b);
  const mid = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  return {ratio: mid, rows};
}
/* What the player's own shops in the neighbourhood lose: a new seller moves
   every product's demand one step down there, for them too. */
function osCannibal(slug, hood){
  const t = osType(slug), sales = ((osFacts().sales || {})[hood]) || {};
  const shops = new Set(), items = [];
  let loss = 0;
  (t ? t.products : []).forEach(([p, impact]) => {
    const rows = sales[p];
    const m = (osFacts().market || {})[p];
    if(impact < 1 || !rows || !m || !m.d) return;
    const n = ((m.hoods || {})[hood] || [0])[0] || 0;
    const now = osDemandWith(n, m.p), after = osDemandWith(n + 1, m.p);
    if(now <= 0 || after >= now) return;
    rows.forEach(([key, units, margin]) => { loss += units * Math.max(0, margin) * (1 - after / now); shops.add(key); });
    items.push(p);
  });
  return shops.size ? {loss, shops: shops.size, items} : null;
}
/* Days to earn `inv` back at `profit` a day; null when it never does. */
const osDays = (inv, profit) => profit > 0 ? Math.max(1, Math.ceil(inv / profit)) : null;

/* --- financing ---------------------------------------------------------------
   LoanHelper: flat interest on the amount borrowed, floor(L x rate x the
   difficulty's multiplier / 100 / days a year) a day, and max(5, floor(L /
   term)) of the principal, both at midnight. A bank lends up to its cap less
   what it is owed, and the company up to the larger of its wealth and a
   quarter of last week's daily profit over the term, less all it owes. */
function osLoanLimit(bank){
  const f = osFacts().finance || {};
  if(!bank) return 0;
  const room = Math.max(0, bank.max - (bank.owed || 0));
  const economy = Math.floor(Math.max(0, Math.max(f.wealth || 0, 0.25 * (f.profit7 || 0) * bank.term) - (f.owed || 0)));
  return Math.min(room, economy);
}
function osLoan(amount, bank){
  const f = osFacts().finance || {};
  if(!bank || amount < (f.minimum || 0)) return null;
  const interest = Math.floor(amount * bank.rate * (f.multiplier || 0) / 100 / (f.year || 60) + 1e-6);
  const repay = Math.max(5, Math.floor(amount / (bank.term || 1)));
  const days = Math.ceil(amount / repay);
  return {amount, interest, repay, days, total: days * interest};
}
/* The day the owner's own cash is back: the profit less the installments
   while the loan runs, the whole profit after it. */
function osLoanDays(own, profit, loan){
  if(own <= 0) return 0;
  let got = 0;
  for(let d = 1; d <= 20000; d++){
    got += profit - (d <= loan.days ? loan.interest + loan.repay : 0);
    if(got >= own) return d;
    if(d > loan.days && profit <= 0) return null;
  }
  return null;
}

/* --- the view ----------------------------------------------------------------- */
const osStepLabel = s => ({what: tt("os.step.what", "What"), where: tt("os.step.where", "Where"),
  investment: tt("os.step.investment", "Investment"), breakeven: tt("os.step.breakeven", "Break even"),
  opening: tt("os.step.opening", "Until opening"), open: tt("os.step.open", "Open")})[s];
/* A step can be opened once what it needs is chosen; the last two come with
   the checklist and payback monitoring. */
function osStepReady(s, plan){
  if(s === "what") return true;
  if(s === "where") return !!plan;
  if(s === "investment" || s === "breakeven") return !!(plan && osBuilding(plan.key));
  return false;
}
function osCtlHtml(plan){
  const at = OS_STEPS.indexOf(osStep);
  const steps = OS_STEPS.map((s, i) => {
    const ready = osStepReady(s, plan), done = i < at && ready, cls = s === osStep ? "on" : done ? "done" : "";
    const mark = done ? icon("tick") : String(i + 1);
    const later = s === "opening" || s === "open";
    return `${i ? `<span class="sep" aria-hidden="true"></span>` : ""}<button type="button" class="${cls}" data-os-step="${s}"${
      ready ? "" : ` disabled`}${s === osStep ? ` aria-current="step"` : ""}${later ? ` data-tip="${attr(tt("os.step.later",
      "Comes with the checklist until opening and payback once the store trades."))}"` : ""}><i>${mark}</i>${osStepLabel(s)}</button>`;
  }).join("");
  const opts = osPlans.map(p => `<option value="${attr(p.id)}"${p.id === osCur ? " selected" : ""}>${spEsc(osPlanName(p))}</option>`).join("");
  return `<nav class="os-steps" aria-label="${attr(tt("os.steps.label", "Open a store, step by step"))}">${steps}</nav>
    <div class="aside"><label class="os-planpick"><span>${tt("os.plan.pick", "Plan")}</span><select data-os-plan aria-label="${attr(tt("os.plan.pickAria", "Which plan"))}">
      <option value=""${osCur ? "" : " selected"}>${tt("os.plan.new", "New plan")}</option>${opts}</select>${icon("chev")}</label></div>`;
}
const osPlanName = p => {
  const b = osBuilding(p.key);
  return b ? tt("os.plan.name", "{type} · {address}", {type: osTypeName(p.type), address: b.address}) : osTypeName(p.type);
};
/* The plan, one strip under the steps: what, where, how much, how long. */
function osStripHtml(plan){
  const b = osBuilding(plan.key), inv = osInvestment(plan, b), mode = osMode(plan);
  const cell = (lab, body) => `<div><span class="os-lab">${lab}</span>${body}</div>`;
  const demand = plan.hood ? ((((D.premises || {}).demand || {})[plan.hood] || []).find(d => d.slug === plan.type) || {}).demand : null;
  const anyHood = tt("os.strip.anyhood", "any neighbourhood");
  const what = `<b>${spEsc(osTypeName(plan.type))}</b><small>${plan.hood && demand != null
    ? tt("os.strip.demand", "Demand in {hood} {n}", {hood: hoodName(plan.hood), n: demand}) : anyHood}</small>`;
  const where = b ? `<b>${spEsc(b.address)}</b><small>${tt("os.strip.where", "{hood} · {layout} · {m2} m² · rent {rent}/day",
      {hood: hoodName(b.hood), layout: b.layout || b.size || "", m2: num(b.m2), rent: fmt(b.rent || 0)})}</small>`
    : `<b class="dim">${tt("os.strip.nowhere", "Not picked yet")}</b><small>${tt("os.strip.nowhere.sub", "{type}, {where}",
      {type: osTypeName(plan.type), where: plan.hood ? hoodName(plan.hood) : anyHood})}</small>`;
  const invest = inv ? `<b class="m">${fmt(inv[mode])}</b><small>${mode === "self" ? tt("os.strip.self", "Self-installation · deposit included")
    : tt("os.strip.firm", "Installation firm · deposit included")}</small>` : `<b class="dim">–</b><small>${tt("os.strip.afterWhere", "after the location")}</small>`;
  const est = b && inv ? osEstimate(plan, b) : null;
  const be = est && est.days ? `<b class="m">${osRange(est.days[mode])}</b><small>${tt("os.strip.be", "after opening · at {w}/day", {w: fmt(est.profit)})}</small>`
    : est && est.none ? `<b class="dim">${tt("os.none.short", "No estimate")}</b><small>${est.none}</small>`
    : `<b class="dim">–</b><small>${tt("os.strip.afterInvest", "after the investment")}</small>`;
  return `<div class="os-pb">${cell(tt("os.strip.open", "Open"), what)}${cell(tt("os.strip.whereLab", "Where"), where)}${
    cell(tt("os.strip.invest", "Investment"), invest)}${cell(tt("os.strip.beLab", "Break even"), be)}</div>`;
}
/* "26–33 days", or one figure where the range closes up. */
function osRange(d){
  if(!d || d.low == null) return tt("os.be.never", "not at this profit");
  if(d.high == null) return tt("os.days.from", "from {n} days", {n: num(d.low)});
  return d.low === d.high ? tt("os.days", {one: "{n} day", other: "{n} days"}, {n: d.low})
    : tt("os.days.range", "{lo}–{hi} days", {lo: num(d.low), hi: num(d.high)});
}
/* The estimate behind steps 3 and 4 for a plan in its building. */
function osEstimate(plan, b){
  const t = osType(plan.type), inv = osInvestment(plan, b);
  if(!t || !inv) return null;
  if(t.model !== "retail" && t.model !== "office") return {inv, none: t.cat === "cinema" || t.cat === "theater"
    ? tt("os.none.venue", "the game's rules for screens, seats and actors are not modelled") : tt("os.none.type", "this type is not modelled")};
  const m = osBestModel(plan.type, b);
  if(!m) return {inv, none: tt("os.none.data", "the save lacks what the estimate needs")};
  const days = mode => ({low: osDays(inv[mode], m.profit * OS_HIGH), high: osDays(inv[mode], m.profit * OS_LOW)});
  return {model: m, profit: m.profit, inv, days: {firm: days("firm"), self: days("self")}};
}

/* Step 1: what to open. */
function osWhatHtml(){
  const F = osFacts(), M = D.market || {};
  const hoods = M.hoods || [];
  const rows = [];
  [...(M.types || []), ...(M.offices || [])].forEach(r => {
    if(!(F.types || {})[r.slug]) return;
    (r.cells || []).forEach((c, i) => { if(c && !c.here && hoods[i]) rows.push({slug: r.slug, hood: hoods[i], demand: c.demand, rivals: c.providers || 0}); });
  });
  rows.sort((a, b) => b.demand - a.demand || a.rivals - b.rivals || gnCompare(osTypeName(a.slug), osTypeName(b.slug)));
  const top = rows.slice(0, 6);
  const shade = v => `background:color-mix(in srgb,var(--accent) ${Math.max(8, Math.min(78, Math.round((v - 40) / 60 * 70 + 8)))}%,var(--surface))`;
  const runs = slug => ((F.types || {})[slug] || {}).run || 0;
  const demandRows = top.map(r => `<tr><td class="l"><b>${spEsc(osTypeName(r.slug))}</b><span class="sub">${runs(r.slug)
      ? tt("os.what.run", {one: "You run {n} elsewhere", other: "You run {n} elsewhere"}, {n: runs(r.slug)}) : tt("os.what.none", "You run none")}</span></td>
    <td class="l"><span class="hood">${spEsc(HOOD_TAGS[r.hood] || "")}</span> <span class="os-dim">${spEsc(hoodName(r.hood))}</span></td>
    <td><span class="sc" style="${shade(r.demand)}">${r.demand}</span></td><td>${r.rivals}</td>
    <td class="go"><button type="button" data-os-new="${attr(r.slug)}" data-os-hood="${attr(r.hood)}" aria-label="${attr(tt("os.what.go",
      "Plan a {type} in {hood}", {type: osTypeName(r.slug), hood: hoodName(r.hood)}))}">${icon("chev")}</button></td></tr>`).join("");
  const kinds = Object.entries(F.types || {}).sort((a, b) => gnCompare(osTypeName(a[0]), osTypeName(b[0])));
  const typeBtn = ([slug, t]) => `<button type="button" class="os-type" data-os-new="${attr(slug)}">${spEsc(osTypeName(slug))}${
    t.run ? `<small>${t.run}</small>` : ""}</button>`;
  const shops = kinds.filter(([, t]) => t.cat !== "office").map(typeBtn).join("");
  const offices = kinds.filter(([, t]) => t.cat === "office").map(typeBtn).join("");
  return `<div class="os-two os-start">
  <section class="os-card"><h3>${tt("os.what.demand", "From demand")}</h3>
    ${top.length ? `<table class="os-dl"><thead><tr><th class="l">${tt("os.what.col.type", "Type")}</th><th class="l">${tt("os.what.col.where", "Where")}</th>
      <th>${tt("os.what.col.demand", "Demand")}</th><th>${tt("os.what.col.rivals", "Rivals")}</th><th></th></tr></thead><tbody>${demandRows}</tbody></table>`
      : `<p class="quiet">${tt("os.what.demand.none", "No neighbourhood reading yet.")}</p>`}
    <p class="os-more"><a class="os-link" href="#expansion/demand" data-os-route="expansion/demand">${tt("os.what.grid", "Demand grid")}</a></p>
  </section>
  <section class="os-card"><h3>${tt("os.what.pick", "Or pick a type")}</h3>
    <div class="os-types">${shops}</div>
    ${offices ? `<div class="os-sub">${tt("os.what.offices", "Offices")}</div><div class="os-types">${offices}</div>` : ""}
  </section></div>
  ${osPlansHtml()}`;
}
function osPlansHtml(){
  if(!osPlans.length) return "";
  const rows = osPlans.map(p => {
    const b = osBuilding(p.key), inv = osInvestment(p, b), mode = osMode(p);
    const stage = !b ? [17, tt("os.stage.where", "Where")] : p.step === "breakeven" ? [50, tt("os.stage.be", "Break even")]
      : [33, tt("os.stage.invest", "Investment")];
    const sub = b ? tt("os.plans.at", "{address} · {hood}", {address: b.address, hood: hoodName(b.hood)})
      : p.hood ? tt("os.plans.hood", "{hood} · no location yet", {hood: hoodName(p.hood)}) : tt("os.plans.none", "no location yet");
    return `<div class="os-plan"><button type="button" class="os-plango" data-os-open="${attr(p.id)}"><span><b>${spEsc(osTypeName(p.type))}</b><small>${spEsc(sub)}</small></span>
      <span><span class="os-lab">${stage[1]}</span><span class="os-meter" style="--w:${stage[0]}%"><i></i></span></span>
      <span class="v">${inv ? fmt(inv[mode]) : `<span class="os-dim">–</span>`}</span>${icon("chev")}</button>
      <button type="button" class="os-x" data-os-drop="${attr(p.id)}" aria-label="${attr(tt("os.plans.drop", "Delete the plan {name}", {name: osPlanName(p)}))}" data-tip="${
        attr(tt("os.plans.dropTip", "Delete this plan"))}">×</button></div>`;
  }).join("");
  return `<div class="os-h"><h2>${tt("os.plans.title", "Your plans")}</h2><span class="c">${osPlans.length}</span></div><div class="os-plans">${rows}</div>`;
}

/* Step 2: Find a location, embedded, fixed to the plan's type. */
function osShowFinder(plan){
  if(typeof CityMapView !== "function" || !premises()) return;
  const t = osType(plan.type);
  const preset = {cat: t ? t.cat : "retail", type: plan.type, hoods: plan.hood ? [plan.hood] : null};
  if(!osFinder || !osFinder.root.isConnected){
    osFinder = new CityMapView($("osFinderMap"), {plan: {preset, onPlan: key => osPick(key), label: () => tt("os.where.go", "Plan here")}});
  } else osFinder.planFor(preset);
}
function osPick(key){
  const plan = osPlan();
  if(!plan) return;
  plan.key = key;
  if(!plan.hood){ const b = osBuilding(key); if(b) plan.hood = b.hood; }
  osStep = "investment";
  osSave();
  drawOpenStore();
  if(typeof settleScroll === "function") settleScroll($("secOpen"));
}

/* Step 3: the investment. */
function osWhy(group, why){
  if(group === "shelf") return Array.isArray(why) && why.length ? why.map(osItemName).join(", ") : tt("os.why.stock", "Stock");
  if(why === "mount") return tt("os.why.mount", "Stands on it");
  if(group === "cap") return tt("os.why.cap", "Capacity");
  if(group === "req") return why === "pointofsales" ? tt("os.why.pos", "Point of sale") : tt("os.why.req", "Required");
  return ({music: tt("os.why.music", "Music"), seating: tt("os.why.seating", "Seating"), sink: tt("os.why.sink", "Sink"),
    toilet: tt("os.why.toilet", "Toilet"), toiletprivacy: tt("os.why.privacy", "Privacy"), "toilet+privacy": tt("os.why.toiletPrivacy", "Toilet, privacy"),
    employeeuniforms: tt("os.why.uniforms", "Uniforms")})[why] || String(why);
}
const osTag = (group, why) => `<span class="os-tag ${group === "req" ? "req" : group === "dem" ? "dem" : group === "cap" ? "cap" : ""}">${spEsc(osWhy(group, why))}</span>`;
function osToolbar(plan, inv, out){
  const mode = osMode(plan);
  return `<div class="os-toolbar"><nav class="os-seg big" aria-label="${attr(tt("os.inv.mode", "Interior"))}">
    <button type="button" class="${mode === "firm" ? "on" : ""}" data-os-mode="firm" aria-pressed="${mode === "firm"}">${tt("os.inv.firm", "Installation firm")} <b>${fmt(inv.firm)}</b></button>
    <button type="button" class="${mode === "self" ? "on" : ""}" data-os-mode="self" aria-pressed="${mode === "self"}">${tt("os.inv.self", "Self-installation")} <b>${fmt(inv.self)}</b></button></nav>
    <div class="aside"><span>${tt("os.inv.outfitted", "100% outfitted")}</span><b>${tt("os.inv.items", {one: "{n} item", other: "{n} items"}, {n: inv.items})}</b>
    <span>${tt("os.inv.itemsLab", "Items")}</span><b>${fmt(out.furniture)}</b></div></div>`;
}
function osGroupNote(group, b, out){
  const h = (osFacts().hoods || {})[b.hood] || {};
  if(group === "req") return tt("os.grp.req.note", "what the type needs to open");
  if(group === "dem") return tt("os.grp.dem.note", "{hood}: each customer asks with a {n}% chance times the demand's weight", {hood: hoodName(b.hood), n: Math.round((h.demands || 0) * 100)});
  if(group === "cap") return tt("os.grp.cap.note", "stations for {n} customers an hour", {n: osCap(b)});
  const from = out.from && (D.businesses || []).find(x => x.key === out.from);
  return from ? tt("os.grp.shelf.copied", "as at {address}, same layout {layout}", {address: from.address, layout: b.layout})
    : tt("os.grp.shelf.note", "per product, enough for {n} customers an hour", {n: osCap(b)});
}
const OS_GROUPS = [["req", () => tt("os.grp.req", "Required to open")], ["dem", () => tt("os.grp.dem", "Customer demands")],
  ["cap", () => tt("os.grp.cap", "Building capacity")], ["shelf", () => tt("os.grp.shelf", "Shelves and displays")]];
function osInvestHtml(plan){
  const b = osBuilding(plan.key), out = osOutfit(plan, b), inv = osInvestment(plan, b);
  if(!b || !out || !inv) return `<p class="quiet os-gap">${tt("os.inv.none", "No outfit is known for this building's layout.")}</p>`;
  return osToolbar(plan, inv, out) + (osMode(plan) === "self" ? osSelfHtml(b, out, inv) : osFirmHtml(b, out, inv));
}
function osFirmHtml(b, out, inv){
  const items = osFacts().items || {}, decor = osDecor(b), fee = (osFacts().game || {}).installFee || 586;
  const grp = (title, note, total) => `<tr class="grp"><td colspan="5">${title}${note ? `<span>${note}</span>` : ""}<b>${fmt(total)}</b></td></tr>`;
  const rows = [grp(tt("os.inv.firm", "Installation firm"), "", inv.fee),
    `<tr><td class="l">${tt("os.inv.fee", "Installation fee")}<span class="sub">${tt("os.inv.fee.sub", "{fee} × {m2} m²", {fee: num(fee), m2: num(b.m2)})}</span></td><td class="w"></td><td></td><td></td><td>${fmt(inv.fee)}</td></tr>`,
    `<tr><td class="l">${tt("os.inv.walls", "Walls and floors")}<span class="sub">${decor ? tt("os.inv.walls.met", "{hood} asks for an interior score of {n}: the firm lays them",
      {hood: hoodName(b.hood), n: ((osFacts().hoods || {})[b.hood] || {}).interior}) : tt("os.inv.walls.free", "the firm lays them at no charge")}</span></td>
      <td class="w">${decor ? `<span class="os-tag dem">${tt("os.why.interior", "Interior")}</span>` : ""}</td><td></td><td></td><td class="free">${tt("os.inv.free", "free")}</td></tr>`];
  OS_GROUPS.forEach(([g, title]) => {
    const lines = out.lines.filter(l => l[2] === g);
    if(!lines.length) return;
    const total = lines.reduce((s, l) => s + l[1] * ((items[l[0]] || {}).p || 0), 0);
    rows.push(grp(title(), osGroupNote(g, b, out), total));
    lines.forEach(([item, qty, group, why]) => {
      const each = (items[item] || {}).p || 0;
      rows.push(`<tr><td class="l">${spEsc(osItemName(item))}</td><td class="w">${osTag(group, why)}</td><td>${qty}</td><td>${fmt(each)}</td><td>${fmt(each * qty)}</td></tr>`);
    });
  });
  rows.push(grp(tt("os.inv.deposit", "Deposit"), tt("os.inv.deposit.note", "refunded when the lease ends"), inv.deposit));
  rows.push(`<tr><td class="l">${tt("os.inv.deposit.row", "60 days of rent")}<span class="sub">${tt("os.inv.deposit.sub", "60 × {rent}", {rent: fmt(b.rent || 0)})}</span></td><td class="w"></td><td></td><td></td><td>${fmt(inv.deposit)}</td></tr>`);
  return `<table class="os-inv"><thead><tr><th class="l">${tt("os.inv.col.item", "Item")}</th><th class="l">${tt("os.inv.col.why", "Why")}</th>
    <th>${tt("os.inv.col.qty", "Qty")}</th><th>${tt("os.inv.col.each", "Each")}</th><th>${tt("os.inv.col.total", "Total")}</th></tr></thead>
    <tbody>${rows.join("")}</tbody><tfoot><tr><td class="l">${tt("os.inv.total", "Investment")}</td><td></td><td></td><td></td><td>${fmt(inv.firm)}</td></tr></tfoot></table>`;
}
const osLetter = i => String.fromCharCode(65 + i);
function osSelfHtml(b, out, inv){
  const F = osFacts(), items = F.items || {}, vendors = F.vendors || {}, fee = (F.game || {}).delivery || 0, decor = osDecor(b);
  const stores = osStores(out);
  const storeTotal = s => s.lines.reduce((t, k) => t + out.lines[k][1] * ((items[out.lines[k][0]] || {}).p || 0), 0) + fee;
  const tagCell = (group, why) => `<td class="w">${osTag(group, why)}</td>`;
  const cards = stores.map((s, i) => {
    const v = vendors[s.key] || {};
    const rows = s.lines.map(k => { const [item, qty, group, why] = out.lines[k];
      return `<tr><td class="l">${tt("os.self.line", "{n} × {item}", {n: qty, item: osItemName(item)})}</td>${tagCell(group, why)}<td>${fmt(qty * ((items[item] || {}).p || 0))}</td></tr>`; }).join("");
    return `<div class="os-store"><div class="os-sh"><span class="k">${osLetter(i)}</span><span><b>${spEsc(v.n || s.key)}</b><small>${spEsc(v.a || "")}${
      v.h ? ` · ${spEsc(hoodName(v.h))}` : ""}</small></span><span class="t">${fmt(storeTotal(s))}</span></div>
      <table><tbody>${rows}<tr class="del"><td class="l">${tt("os.self.delivery", "Delivery")}</td><td class="w"></td><td>${fmt(fee)}</td></tr></tbody></table></div>`;
  }).join("");
  const unsold = out.lines.filter((l, k) => !stores.some(s => s.lines.includes(k)));
  const interior = `<span class="os-tag dem">${tt("os.why.interior", "Interior")}</span>`;
  const paint = decor ? `<div class="os-store"><div class="os-sh"><span class="k p">${osIcon("paint")}</span><span><b>${tt("os.self.walls", "Walls and floors")}</b><small>${
      tt("os.self.walls.sub", "Interior Designer · {hood} asks for a score of {n}", {hood: hoodName(b.hood), n: ((F.hoods || {})[b.hood] || {}).interior})}</small></span><span class="t">${fmt(decor.cost)}</span></div>
    <table><tbody>${decor.floors ? `<tr><td class="l">${tt("os.self.floors", "{n} floor tiles at {p}", {n: num(decor.floors), p: fmt(decor.floorPrice)})}</td><td class="w">${interior}</td><td>${fmt(decor.floors * decor.floorPrice)}</td></tr>` : ""}${
      decor.walls ? `<tr><td class="l">${tt("os.self.wallslots", "{n} wall slots at {p}", {n: num(decor.walls), p: fmt(decor.wallPrice)})}</td><td class="w">${interior}</td><td>${fmt(decor.walls * decor.wallPrice)}</td></tr>` : ""}</tbody></table></div>` : "";
  const dep = `<div class="os-store"><div class="os-sh"><span class="k p">${osIcon("key")}</span><span><b>${tt("os.inv.deposit", "Deposit")}</b><small>${
    tt("os.self.deposit.sub", "60 × {rent} rent · refunded when the lease ends", {rent: fmt(b.rent || 0)})}</small></span><span class="t">${fmt(inv.deposit)}</span></div></div>`;
  const legend = stores.map((s, i) => `<div><i>${osLetter(i)}</i><span>${spEsc((vendors[s.key] || {}).n || s.key)}</span><b>${fmt(storeTotal(s))}</b></div>`).join("")
    + `<div><i class="n">${tt("os.map.new", "NEW")}</i><span>${spEsc(b.address)}</span><b></b></div>`;
  const note = unsold.length ? `<p class="quiet os-gap">${tt("os.self.unsold", "No store the game's help names sells these: {items}.", {items: unsold.map(l => osItemName(l[0])).join(", ")})}</p>` : "";
  const pins = JSON.stringify([...stores.map((s, i) => [s.key, osLetter(i), "store"]), [b.key, tt("os.map.new", "NEW"), "new"]]);
  const sub = decor ? tt("os.self.total.subWalls", "{n} items · {d} deliveries · walls and floors · deposit", {n: inv.items, d: stores.length})
    : tt("os.self.total.sub", "{n} items · {d} deliveries · deposit", {n: inv.items, d: stores.length});
  return `<div class="os-self"><div>${cards}${paint}${dep}${note}
    <div class="os-total"><span>${tt("os.inv.total", "Investment")}</span><small>${sub}</small><b>${fmt(inv.self)}</b></div></div>
    <div><div class="os-mini" id="osMini" data-pins="${attr(pins)}"></div><div class="os-maplist">${legend}</div></div></div>`;
}
/* The city with the stores and the new site pinned at their addresses: a
   still crop of the map around them, not the whole interactive map. */
function osPaintMini(){
  const host = $("osMini");
  if(!host || typeof loadCityMap !== "function") return;
  let pins = [];
  try{ pins = JSON.parse(host.dataset.pins || "[]"); }catch(e){}
  loadCityMap().then(a => {
    if(!host.isConnected) return;
    const at = pins.map(([key, label, kind]) => ({key, label, kind, b: a.byKey.get(key)})).filter(p => p.b && p.b.anchor);
    if(!at.length){ host.hidden = true; return; }
    const xs = at.map(p => p.b.anchor[0]), ys = at.map(p => p.b.anchor[1]);
    const pad = 60, side = Math.max(Math.max(...xs) - Math.min(...xs) + 2 * pad, Math.max(...ys) - Math.min(...ys) + 2 * pad, 260);
    const x = (Math.min(...xs) + Math.max(...xs)) / 2 - side / 2, y = (Math.min(...ys) + Math.max(...ys)) / 2 - side / 2;
    host.innerHTML = `<svg viewBox="${x.toFixed(1)} ${y.toFixed(1)} ${side.toFixed(1)} ${side.toFixed(1)}" aria-hidden="true"><image href="${attr(a.imageUrl)}" x="0" y="0" width="${a.viewBox[2]}" height="${a.viewBox[3]}"></image></svg>`
      + at.map(p => `<span class="os-pin ${p.kind}" style="left:${((p.b.anchor[0] - x) / side * 100).toFixed(2)}%;top:${((p.b.anchor[1] - y) / side * 100).toFixed(2)}%"><b>${spEsc(p.label)}</b><i></i>${
        p.kind === "new" ? `<em>${spEsc(p.b.address)}</em>` : ""}</span>`).join("");
    host.setAttribute("role", "img");
    host.setAttribute("aria-label", tt("os.map.aria", "The stores and the new site on the city map"));
  }).catch(() => { host.hidden = true; });
}

/* Step 4: break even. */
function osBreakHtml(plan){
  const b = osBuilding(plan.key), est = b && osEstimate(plan, b), mode = osMode(plan);
  if(!b || !est) return `<p class="quiet os-gap">${tt("os.be.nowhere", "Pick a location first.")}</p>`;
  const inv = est.inv;
  if(est.none) return `<div class="os-none">
    <div><span class="os-lab">${tt("os.inv.firm", "Installation firm")}</span><b>${fmt(inv.firm)}</b><small>${tt("os.be.investment", "investment")}</small></div>
    <div><span class="os-lab">${tt("os.inv.self", "Self-installation")}</span><b>${fmt(inv.self)}</b><small>${tt("os.be.investment", "investment")}</small></div>
    <div><span class="os-lab">${tt("os.strip.beLab", "Break even")}</span><b class="dim">${tt("os.none.short", "No estimate")}</b><small>${est.none}</small></div></div>`;
  const m = est.model, p = est.profit, other = mode === "firm" ? "self" : "firm";
  const big = (key, alt) => `<div${alt ? ` class="alt"` : ""}><span class="os-lab">${key === "firm" ? tt("os.inv.firm", "Installation firm") : tt("os.inv.self", "Self-installation")}</span><b>${
    p > 0 ? osRange(est.days[key]) : tt("os.be.never", "not at this profit")}</b></div>`;
  const tax = (osFacts().game || {}).tax || 0;
  const t = osType(plan.type), own = osOwnRatio(plan.type), cann = osCannibal(plan.type, b.hood);
  const row = (label, value, cls = "") => `<div class="os-site${cls}"><span><b>${label}</b></span><span class="v">${value}</span></div>`;
  const mix = (m.mix || []).length ? m.mix.map(osCampaignName).join(", ") : tt("os.be.mix.none", "none");
  const detail = [
    row(tt("os.be.revenue", "Sales"), fmt(m.revenue)),
    row(tt("os.be.goods", "Goods, at import prices"), fmt(-m.cogs)),
    row(tt("os.be.wages", "Wages"), fmt(-m.wages)),
    row(tt("os.be.rent", "Rent"), fmt(-m.rent)),
    row(tt("os.be.marketing", "Marketing"), fmt(-m.marketing)),
  ].join("");
  const lines = [
    `<p class="os-note">${tt("os.be.range", "Between {lo} and {hi} a day if it is priced, stocked and staffed as planned.", {lo: fmt(p * OS_LOW), hi: fmt(p * OS_HIGH)})}</p>`,
    tax ? `<p class="os-note">${tt("os.be.tax", "After {n}% tax: {w} a day.", {n: tax, w: fmt(p * (1 - tax / 100))})}</p>` : "",
    own ? `<p class="os-note">${tt("os.be.own", {one: "Your {type} earns {pct}% of what these rules give its own building.",
      other: "Your {n} {types} earn {pct}% of what these rules give their own buildings."},
      {n: own.rows.length, type: gnLower(osTypeName(plan.type)), types: gnLower(osTypeName(plan.type)), pct: Math.round(own.ratio * 100)})}</p>` : "",
    cann ? `<p class="os-note">${tt("os.be.cannibal", {one: "Your shop in {hood} that sells {items} loses about {w} a day: a new seller moves demand down there too.",
      other: "Your {n} shops in {hood} that sell {items} lose about {w} a day between them: a new seller moves demand down there too."},
      {n: cann.shops, hood: hoodName(b.hood), items: cann.items.map(osItemName).join(", "), w: fmt(cann.loss)})}</p>` : "",
  ].join("");
  const assume = tt("os.be.assume", "Open 24/7, the type's whole range at the highest price every customer in {hood} accepts, satisfaction {sat}, the best marketing: {mix}. Sold {units} units to {n} customers a day.",
    {hood: hoodName(b.hood), sat: osSatisfaction(plan.type), mix, units: num(Math.round(m.lines.reduce((s, l) => s + l.units, 0))), n: num(Math.round(m.customers))});
  return `<div class="os-be">
  <section class="os-card"><div class="os-big">${big(mode)}${big(other, true)}</div>${osChart(est, mode)}</section>
  <section class="os-card"><h3>${tt("os.be.profit", "Expected profit a day")}</h3>
    <div class="os-sites">${detail}<div class="os-site avg"><span><b>${tt("os.be.estimate", "The game's rules")}</b><small>${
      tt("os.be.estimate.sub", "{hood}, {layout}, {cap} customers an hour at most", {hood: hoodName(b.hood), layout: b.layout || "", cap: osCap(b)})}</small></span><span class="v${p < 0 ? " neg" : ""}">${fmt(p)}</span></div></div>
    ${lines}<p class="os-assume" data-tip="${attr(assume)}" tabindex="0">${tt("os.be.assumeLab", "What the estimate assumes")}</p>
  </section></div>
  ${own ? osOwnHtml(plan, own) : ""}
  ${osFinHtml(plan, est)}`;
}
const osCampaignName = id => ({smallinternet: tt("os.mk.smallinternet", "Small internet"), mediuminternet: tt("os.mk.mediuminternet", "Medium internet"),
  largeinternet: tt("os.mk.largeinternet", "Large internet"), smallbillboard: tt("os.mk.smallbillboard", "Small billboard"),
  mediumbillboard: tt("os.mk.mediumbillboard", "Medium billboard"), largebillboard: tt("os.mk.largebillboard", "Large billboard")})[id] || id;
/* Your own shops of the type: what each really earns beside what the same
   rules give its building. */
function osOwnHtml(plan, own){
  const byKey = new Map((D.businesses || []).map(b => [b.key, b]));
  const top = Math.max(...own.rows.map(r => Math.max(r.actual, r.model)), 1);
  const rows = own.rows.map(r => { const b = byKey.get(r.key) || {};
    return `<div class="os-site"><span><b>${spEsc(b.address || r.key)}</b><small><span class="hood">${spEsc(HOOD_TAGS[r.hood] || "")}</span> ${spEsc(r.layout || "")}</small></span>
      <span class="bar"><i style="width:${Math.max(2, r.actual / top * 100).toFixed(0)}%"></i></span><span class="v">${fmt(r.actual)}</span><span class="v os-dim">${Math.round(r.ratio * 100)}%</span></div>`; }).join("");
  return `<section class="os-card os-ownc"><h3>${tt("os.own.title", "Your {types} against the same rules", {types: gnLower(osTypeName(plan.type))})}</h3>
    <p class="quiet">${tt("os.own.note", "Profit a day over their last two weeks, goods at import prices, beside the rules' figure for each one's own building, hours and marketing.")}</p>
    <div class="os-sites os-own">${rows}</div></section>`;
}
/* Cumulative profit from the opening against both investments, the range as
   a band. */
function osChart(est, mode){
  const W = 560, H = 262, x0 = 58, y0 = 16, x1 = W - 16, y1 = H - 40, p = est.profit;
  if(!(p > 0)) return `<p class="quiet">${tt("os.be.noChart", "At this profit the store does not earn its investment back.")}</p>`;
  const inv = est.inv, hi = Math.max(inv.firm, inv.self);
  const dmax = Math.max(10, Math.ceil((hi / (p * OS_LOW)) * 1.15 / 5) * 5);
  const vmax = p * OS_HIGH * dmax;
  const X = d => x0 + (x1 - x0) * d / dmax, Y = v => y1 - (y1 - y0) * Math.min(v, vmax) / vmax;
  const step = osNiceStep(vmax / 4), dstep = osNiceStep(dmax / 5);
  const g = [];
  for(let v = 0; v <= vmax + 1e-6; v += step) g.push(`<line class="grid" x1="${x0}" x2="${x1}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"></line><text x="${x0 - 8}" y="${(Y(v) + 3.5).toFixed(1)}" text-anchor="end">${money(v)}</text>`);
  for(let d = 0; d <= dmax; d += dstep) g.push(`<text x="${X(d).toFixed(1)}" y="${y1 + 18}" text-anchor="middle">${d}</text>`);
  const line = k => `M${X(0).toFixed(1)},${Y(0).toFixed(1)} L${X(dmax).toFixed(1)},${Y(p * k * dmax).toFixed(1)}`;
  const band = `M${X(0).toFixed(1)},${Y(0).toFixed(1)} L${X(dmax).toFixed(1)},${Y(p * OS_HIGH * dmax).toFixed(1)} L${X(dmax).toFixed(1)},${Y(p * OS_LOW * dmax).toFixed(1)} Z`;
  const mark = (key, cls) => { const v = inv[key], d = v / p;
    return `<line class="${cls}" x1="${x0}" x2="${x1}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"></line><text class="lbl ${cls === "inv" ? "w" : "i"}" x="${x0 + 6}" y="${(Y(v) - 7).toFixed(1)}">${
      key === "firm" ? tt("os.inv.firm", "Installation firm") : tt("os.inv.self", "Self-installation")} ${fmt(v)}</text>${
      d <= dmax ? `<circle class="hit" cx="${X(d).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="5"></circle><text class="lbl" x="${(X(d) + 9).toFixed(1)}" y="${(Y(v) + 16).toFixed(1)}">${
      tt("os.be.day", "day {n}", {n: Math.ceil(d)})}</text>` : ""}`; };
  return `<svg class="os-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${attr(tt("os.be.chart", "Profit from the opening against the investment"))}">
    ${g.join("")}<line class="ax" x1="${x0}" x2="${x1}" y1="${y1}" y2="${y1}"></line>
    <path class="band" d="${band}"></path>${mark(mode, "inv")}${mark(mode === "firm" ? "self" : "firm", "inv2")}
    <path class="line" d="${line(1)}"></path><text x="${x1}" y="${y1 + 34}" text-anchor="end">${tt("os.be.axis", "days after opening")}</text></svg>`;
}
const osNiceStep = v => { const e = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1)))); const f = v / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e; };

/* The financing panel: part of the investment borrowed, what that costs a
   day against the expected profit, and break even with and without it. */
function osFinHtml(plan, est){
  const f = osFacts().finance || {}, banks = f.banks || [];
  if(!banks.length) return "";
  const fin = plan.finance || (plan.finance = {on: false, amount: 0, bank: null});
  const on = !!fin.on;
  const head = `<div class="os-finhead"><h3>${osIcon("bank")}${tt("os.fin.title", "Financing")}</h3>
    <label class="os-switch"><input type="checkbox" data-os-fin-on${on ? " checked" : ""}><span>${tt("os.fin.on", "Borrow part of it")}</span></label></div>`;
  if(!on) return `<section class="os-card os-fin" id="osFin">${head}<p class="quiet">${tt("os.fin.off",
    "A bank loan pays part of the investment now and costs interest every day until it is repaid. The game books the loan to the company, not to the store.")}</p></section>`;
  const bank = banks.find(b => b.id === fin.bank) || banks.find(b => b.id === "VantanderBankSettings") || banks[0];
  const lenders = banks.map(b => `<button type="button" class="${b.id === bank.id ? "on" : ""}" data-os-bank="${attr(b.id)}" aria-pressed="${b.id === bank.id}">${spEsc(b.name)} <b>${
    tt("os.fin.rate", "{r}% a year · {d} days", {r: num(Math.round(b.rate * (f.multiplier || 0) * 10) / 10), d: b.term})}</b></button>`).join("");
  const mode = osMode(plan), inv = est.inv[mode];
  const limit = Math.min(osLoanLimit(bank), Math.floor(inv));
  const amount = Math.max(0, Math.min(limit, fin.amount || Math.round(inv / 2)));
  return `<section class="os-card os-fin" id="osFin">${head}
    <div class="os-finctl"><div class="os-fr"><span>${tt("os.fin.lender", "Lender")}</span><nav class="os-seg">${lenders}</nav></div>
    <div class="os-fr"><span>${tt("os.fin.amount", "Amount")}</span><div class="os-amount"><label class="os-num">$<input type="number" min="0" max="${limit}" step="1000" value="${Math.round(amount)}" data-os-fin-amount aria-label="${attr(tt("os.fin.amountAria", "Amount to borrow"))}"></label>
      <input type="range" min="0" max="${limit}" step="${Math.max(500, osNiceStep(limit / 100))}" value="${Math.round(amount)}" data-os-fin-range aria-label="${attr(tt("os.fin.amountAria", "Amount to borrow"))}">
      <small>${tt("os.fin.limit", "{bank} lends you up to {w} now", {bank: bank.name, w: fmt(osLoanLimit(bank))})}</small></div></div></div>
    <div class="os-finfacts" id="osFinFacts">${osFinFacts(plan, est, bank, amount)}</div></section>`;
}
function osFinFacts(plan, est, bank, amount){
  const f = osFacts().finance || {}, mode = osMode(plan), inv = est.inv[mode], p = est.profit;
  const loan = osLoan(amount, bank);
  const cell = (lab, value, sub) => `<div><span class="os-lab">${lab}</span><b>${value}</b><small>${sub}</small></div>`;
  if(!loan) return cell(tt("os.fin.upfront", "Cash upfront"), fmt(inv), tt("os.fin.min", "a bank lends {w} at least", {w: fmt(f.minimum || 0)}));
  const own = inv - amount, daily = loan.interest + loan.repay;
  const without = osDays(inv, p), with_ = osLoanDays(own, p, loan);
  const payoff = without != null && without < loan.days ? without * loan.interest : null;
  const dayText = n => n == null ? tt("os.be.never", "not at this profit") : tt("os.days", {one: "{n} day", other: "{n} days"}, {n: num(n)});
  return cell(tt("os.fin.upfront", "Cash upfront"), fmt(own), tt("os.fin.upfront.sub", "{w} borrowed", {w: fmt(amount)}))
    + cell(tt("os.fin.daily", "A day while it runs"), fmt(daily), tt("os.fin.daily.sub", "{r} repaid + {i} interest, against {p} profit", {r: fmt(loan.repay), i: fmt(loan.interest), p: fmt(p)}))
    + cell(tt("os.fin.interest", "Interest"), fmt(loan.total), payoff != null ? tt("os.fin.interest.early", "over {n} days; {w} if paid off at break even", {n: num(loan.days), w: fmt(payoff)})
      : tt("os.fin.interest.term", "over {n} days, flat on the amount borrowed", {n: num(loan.days)}))
    + cell(tt("os.fin.be", "Your own cash back"), dayText(with_), tt("os.fin.be.sub", "{d} without the loan", {d: dayText(without)}));
}
/* Only the figures move while the amount is typed or dragged. */
function osFinUpdate(amount){
  const plan = osPlan(), b = plan && osBuilding(plan.key), est = b && osEstimate(plan, b);
  if(!plan || !est || !est.inv) return;
  const banks = (osFacts().finance || {}).banks || [];
  const bank = banks.find(x => x.id === (plan.finance || {}).bank) || banks.find(x => x.id === "VantanderBankSettings") || banks[0];
  const limit = Math.min(osLoanLimit(bank), Math.floor(est.inv[osMode(plan)]));
  amount = Math.max(0, Math.min(limit, Math.round(+amount || 0)));
  plan.finance.amount = amount;
  osSave();
  const facts = $("osFinFacts");
  if(facts) facts.innerHTML = osFinFacts(plan, est, bank, amount);
  const fin = $("osFin");
  if(fin) fin.querySelectorAll("[data-os-fin-amount], [data-os-fin-range]").forEach(i => { if(document.activeElement !== i) i.value = amount; });
}

/* The whole view, drawn for the step on screen. The embedded finder is kept
   between draws: it is built once and handed the plan's type again. */
function drawOpenStore(){
  const sec = $("secOpen");
  if(!sec || !hasData()) return;
  osLoad();
  const F = osFacts(), plan = osPlan();
  if(!OS_STEPS.slice(0, 4).includes(osStep) || !osStepReady(osStep, plan)) osStep = plan ? (osBuilding(plan.key) ? "investment" : "where") : "what";
  $("osCtl").innerHTML = F.types ? osCtlHtml(plan) : "";
  $("osStrip").innerHTML = plan && osStep !== "what" ? osStripHtml(plan) : "";
  const where = osStep === "where" && !!plan;
  $("osWhere").hidden = !where;
  $("osBody").innerHTML = !F.types ? `<p class="quiet os-gap">${tt("os.nodata", "This build carries no store rules, so there is nothing to plan with.")}</p>`
    : osStep === "what" ? osWhatHtml() : osStep === "investment" ? osInvestHtml(plan) : osStep === "breakeven" ? osBreakHtml(plan) : "";
  if(where) osShowFinder(plan);
  if(osStep === "investment" && plan && osMode(plan) === "self") osPaintMini();
  if(typeof wireTips === "function") wireTips();
}
function osGo(step){
  const plan = osPlan();
  if(!osStepReady(step, plan)) return;
  osStep = step;
  osSave();
  drawOpenStore();
  if(typeof settleScroll === "function") settleScroll($("secOpen"));
}
/* A new plan for a type, from a Demand cell, the grid of types or search. */
function osStart(type, hood){
  osLoad();
  osNew(type, hood);
  drawOpenStore();
}
const wireOpenStore = once(() => {
  on("click", "[data-os-step]", el => osGo(el.dataset.osStep));
  on("change", "[data-os-plan]", el => {
    osCur = el.value || null;
    const plan = osPlan();
    osStep = plan ? plan.step : "what";
    osSave(); drawOpenStore();
  });
  on("click", "[data-os-new]", (el, e) => { e.preventDefault(); osStart(el.dataset.osNew, el.dataset.osHood || null); if(typeof settleScroll === "function") settleScroll($("secOpen")); });
  on("click", "[data-os-open]", (el, e) => { e.preventDefault(); osCur = el.dataset.osOpen; const plan = osPlan(); osStep = plan ? plan.step : "what"; osSave(); drawOpenStore(); });
  on("click", "[data-os-drop]", (el, e) => {
    e.preventDefault();
    osPlans = osPlans.filter(p => p.id !== el.dataset.osDrop);
    if(!osPlan()) osCur = null;
    osSave(); drawOpenStore();
  });
  on("click", "[data-os-route]", (el, e) => { e.preventDefault(); openRoute(el.dataset.osRoute); });
  on("click", "[data-os-mode]", el => { osSetMode(el.dataset.osMode); drawOpenStore(); });
  on("change", "[data-os-fin-on]", el => { const plan = osPlan(); if(!plan) return; plan.finance = {...(plan.finance || {}), on: el.checked}; osSave(); drawOpenStore(); });
  on("click", "[data-os-bank]", el => { const plan = osPlan(); if(!plan) return; plan.finance = {...(plan.finance || {}), bank: el.dataset.osBank}; osSave(); drawOpenStore(); });
  on("input", "[data-os-fin-amount], [data-os-fin-range]", el => osFinUpdate(el.value));
});
