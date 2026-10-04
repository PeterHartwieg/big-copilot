/* Open a store calculation core. The Python renderer embeds this exact source;
   Node consumers require it directly. No board, DOM, storage or translations. */
const OpenStoreModel = (() => {
  "use strict";
  const OS_OFFICE = {always: 3, fullDoor: 50, day: [8, 22]};
  const OS_RAMP = [0.55, 0.92, 0.94, 0.97, 0.99];
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
   * @returns {Object} Calculations accepting a type slug, building
   *   ({key,hood,layout,size,cap,m2,traffic,rent,deposit}), plan ({type}),
   *   or options ({reach,cost,promoTotal,open,sat,existing,initial,staffed,
   *   computers,rent,hype}) as applicable. Profit models return daily revenue,
   *   cogs, wages, rent, marketing, profit, customers and ordered product lines;
   *   unavailable models/investments and unattainable payback days return null.
   *   `existing`/`provides` may be an item predicate; day callbacks use day 0
   *   for opening. Loan results retain integer interest/repayment rounding.
   */
  function create({facts = {}, company = {}} = {}){
    const osFacts = () => facts;
    const osType = slug => (osFacts().types || {})[slug] || null;
    const osCap = b => { const v = b && (osFacts().venues || {})[b.key];
      return v && v[1] ? v[1] : (b && b.cap) || 0; };
    /* The outfit for the building's layout: its lines and furniture total. */
    /* The key an outfit is kept by: the layout, or a cinema's or theatre's size
       (Python's plan_layout()). */
    const osLayout = b => (b && (b.layout || ((osFacts().venues || {})[b.key] || [])[0] || b.size)) || "";
    const osOutfit = (plan, b) => { const t = plan && osType(plan.type); return t && b ? (t.layouts || {})[osLayout(b)] || null : null; };
    /* The interior score the neighbourhood asks for (Midtown's 50), and the
       cheapest walls and floors that reach it in this layout. */
    const osDecor = b => { const need = b && ((osFacts().hoods || {})[b.hood] || {}).interior;
      return need > 0 ? ((osFacts().decor || {})[osLayout(b)] || {})[String(need)] || null : null; };

    /* The investment in each mode, as setup_cost() counts it: the firm's fee on
       the floor, every item at its default price, the deposit; self-installation
       the items, a delivery per store, and the walls and floors where the
       neighbourhood asks for them. */
    function osInvestment(plan, b){
      const out = osOutfit(plan, b);
      if(!out || !b) return null;
      const deposit = leaseDeposit(b) || 0, decor = osDecor(b);
      const stores = osStores(out).length;
      const delivery = stores * ((osFacts().game || {}).delivery || 0);
      return {furniture: out.furniture, fee: out.fee, deposit, stores, delivery, decor: decor ? decor.cost : 0,
        firm: out.furniture + out.fee + deposit, self: out.furniture + delivery + (decor ? decor.cost : 0) + deposit,
        items: out.lines.reduce((n, l) => n + l[1], 0)};
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
      return seen.length ? seen[Math.floor(seen.length / 2)] : ((osFacts().game || {}).satisfaction || 95);
    }
    /* One day of a store of type `slug` in building `b`. `o`: reach (m² of
       marketing) and cost, or promoTotal for a shop whose promotion is known;
       open (per weekday [start, end) slots, 24/7 by default); sat; existing. */
    /* What every open hour starts from (Python's _plan_initial(), shared with the
       staffing assistant): the shop's own figure where it is known, else the
       layout's, else the building's capacity (a current game) or the floor. */
    function osInitial(t, b, o){
      const known = o.initial ?? (t.initial || {})[osLayout(b)];
      if(known > 0) return known;
      return (osFacts().game || {}).capInitial || t.model === "office" ? osCap(b) : (b.m2 || 0);
    }
    /* The promotion total a building reaches with `reach` m² of marketing:
       its traffic plus the share of the floor the campaigns cover times the
       neighbourhood's marketing strength, never above 100. */
    const osPromo = (b, h, o) => o.promoTotal ?? Math.min(100, Math.round((b.traffic || 0)
      + Math.round(Math.min((o.reach || 0) / (b.m2 || 1), 1) * 100) * h.strength));
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
      if(!t || !h) return null;
      if(o.existing === undefined){ const provides = osProvides(slug, b); if(provides) o = {...o, existing: provides}; }
      if(t.model === "office") return osOfficeModel(slug, t, b, h, o);
      if(t.model !== "retail") return null;
      const cap = osCap(b);
      const total = osPromo(b, h, o);
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
          service: !!m.s, cost: m.cost || 0, ...osPrice(p, b.hood), units: 0};
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
      const always = Math.min(computers, Math.max(1, Math.round(OS_OFFICE.always * cap / OS_OFFICE.fullDoor)));
      if(hr < OS_OFFICE.day[0] || hr >= OS_OFFICE.day[1]) return always;
      return wd === 0 || wd === 6 ? Math.max(always, Math.ceil(computers / 2)) : computers;
    }
    function osOfficeModel(slug, t, b, h, o){
      const F = osFacts(), g = F.game || {};
      const fee = (t.products[0] || [])[0];
      if(!fee || !(F.market || {})[fee]) return null;
      const cap = osCap(b);
      const total = osPromo(b, h, o);
      const promo = (g.promo || 0) + 0.75 * total / 100;
      const initial = osInitial(t, b, o);
      const sat = 1 + ((o.sat ?? osSatisfaction(slug)) - 50) / 100;
      const demand = osDemand(fee, b.hood, o.existing), {price, mono} = osPrice(fee, b.hood);
      const wage = (t.wage || 0) * (1 + Math.pow(1.05, 100) / 100) * (g.wages || 0);
      const slots = o.open || Array.from({length: 7}, () => [[0, 24]]);
      const computers = o.computers || cap;
      let billed = 0, staffed = 0, open = 0;
      for(let wd = 0; wd < 7; wd++){
        for(const [a, z] of slots[wd] || []){
          for(let hr = a; hr < z; hr++){
            const on = o.staffed ? ((o.staffed[wd] || [])[hr] || 0) : osOfficeStaffed(computers, cap, wd, hr);
            const raw = Math.ceil(initial * sat * promo * (t.days[wd] || 0) * (t.hours[hr] || 0) * demand / 100 - 0.2);
            staffed += on; open++;
            if(raw > 0) billed += Math.min(raw, on, cap);
          }
        }
      }
      const units = billed / 7;
      const skill = 1 + Math.pow(1.05, 100) / 100;
      const revenue = units * price, wages = (staffed * wage + open * ((g.wageBase || {}).cleaner || 0) * skill * (g.wages || 0)) / 7;
      const rent = o.rent ?? (b.rent || 0), marketing = o.cost || 0;
      return {revenue, cogs: 0, wages, rent, marketing, profit: revenue - wages - rent - marketing,
        customers: units, fees: 0, office: true, lines: [{p: fee, impact: 1, amt: 1, r: 1, demand, service: true, cost: 0, price, mono, units}], promo: total};
    }
    /* How the player's own shops of the type do against the same rules on their
       own buildings, hours and marketing: the median of actual ÷ model. */
    function osOwnRatio(slug){
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
    function osCannibal(slug, hood, provides){
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
        rows.forEach(([key, units, margin]) => { loss += units * Math.max(0, margin) * (1 - after / now); shops.add(key); });
        items.push(p);
      });
      return shops.size ? {loss, shops: shops.size, items} : null;
    }
    /* Days to earn `inv` back at `profit` a day; null when it never does. */
    const osDays = (inv, profit) => profit > 0 ? Math.max(1, Math.ceil(inv / profit)) : null;

    /* --- the first days (research RAMP.md) ---------------------------------------
       A new store earns less at first. The opening day is a partial day at
       satisfaction 50 all round, taken as 0.8 of a day; new staff start at 50
       satisfaction and climb 0.6 an hour, and the shop's customer service
       follows them a day late. OS_RAMP is each day's gross margin as a share of
       the steady one, from the opening day (0) on; rent, wages and marketing are
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
      const x = mh && k >= 1 && k <= OS_HYPE.days ? mh : m;
      if(x === m && k >= OS_RAMP.length) return m.profit;
      const r = k < OS_RAMP.length ? OS_RAMP[k] : 1;
      return r * (x.revenue - x.cogs) - (x.wages + x.rent + x.marketing);
    }
    /* The day the running profit first covers `inv`, day by day: 1 is the
       opening day. `factor` scales every day, for the range. Null when the
       steady profit never gets there. */
    function osBreakDay(inv, day, factor = 1){
      let got = 0;
      for(let k = 0; k < 20000; k++){
        got += factor * day(k);
        if(got >= inv) return k + 1;
        if(k > OS_HYPE.days && day(k) <= 0) return null;
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
      if(!bank) return 0;
      const room = Math.max(0, bank.max - (bank.owed || 0));
      const economy = Math.floor(Math.max(0, Math.max(f.floor || 0, f.wealth || 0, 0.25 * (f.profit7 || 0) * bank.term) - (f.owed || 0)));
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
      /* `profit` is a day's profit, or osDayProfit() for the day after the opening. */
      const day = typeof profit === "function" ? profit : () => profit;
      let got = 0;
      for(let d = 1; d <= 20000; d++){
        got += day(d - 1) - (d <= loan.days ? loan.interest + loan.repay : 0);
        if(got >= own) return d;
        if(d > loan.days && d > OS_HYPE.days + 1 && day(d - 1) <= 0) return null;
      }
      return null;
    }

    return {
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
    };
  }
  return {create, emptyLease, availablePremises, leaseDeposit, OFFICE: OS_OFFICE, RAMP: OS_RAMP, HYPE: OS_HYPE};
})();
if(typeof module !== "undefined" && module.exports) module.exports = OpenStoreModel;
