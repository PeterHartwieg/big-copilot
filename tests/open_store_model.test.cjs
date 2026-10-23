// Open a store business outcomes through explicit-input public model exports.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const OpenStoreModel = require('../template/open-store-model.js');

/* Arithmetic runs directly in Node, without board/DOM/storage globals. */
function model(facts, extra = {}){
  const company = {day: 40, businesses: [], ...extra};
  const core = OpenStoreModel.create({facts, company});
  return {company, ...core};
}

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);

/* One product, flat curves, one open hour a week. */
const RETAIL = {
  game: {promo: 0.5, wages: 0.7, capInitial: true, satisfaction: 95, wageBase: {cashier: 16, cleaner: 12, guard: 15, perCashier: 30},
    ramp: [0.55, 0.92, 0.94, 0.97, 0.99], office: {always: 3, fullDoor: 50, day: [8, 22], weekend: [6, 0]}},
  hoods: {H: {idx: 1.2, strength: 1, demands: 0, interior: 0}},
  types: {T: {model: 'retail', products: [['P', 1]], amt: 1, days: Array(7).fill(1), hours: Array(24).fill(1), layouts: {}}},
  market: {P: {p: 10, r: 0.5, d: 1, s: 0, cost: 4, hoods: {H: [0, 0, null]}}},
};
const SHOP = {hood: 'H', cap: 20, m2: 100, traffic: 20, layout: 'C1', rent: 50, key: 'k'};
const HOUR = [[[10, 11]], [], [], [], [], [], []];

test('runtime values and per-address outfits override shared layout assumptions', () => {
  const facts = structuredClone(RETAIL);
  const t = facts.types.T;
  t.initial = {C1: 20, k: 90};
  t.layouts = {C1: {furniture: 100}, k: {furniture: 200}};
  const m = model(facts);
  assert.equal(m.initial(t, SHOP, {}), 90);
  assert.equal(m.initial(t, {...SHOP, key: 'other'}, {}), 20);
  assert.equal(m.outfit({type: 'T'}, SHOP).furniture, 200);
  const modified = {...SHOP, marketingRules: {reachMultiplier: 2, strength: 0.5}};
  assert.equal(m.promo(modified, facts.hoods.H, {reach: 40}), 60);
  assert.equal(m.outfit({type: 'T'}, {...SHOP, layoutKnown: false}), null);
  assert.equal(m.layout({...SHOP, layoutKnown: false}), '');
  assert.equal(m.model('T', {...SHOP, factsUnavailable: true}), null);
});

test('the retail model, worked by hand for one product and one open hour', () => {
  const m = model(RETAIL).model('T', SHOP, {sat: 50, open: HOUR});
  // Promotion 20 (traffic, no marketing): 0.5 + 0.75 x 0.2 = 0.65; a current
  // game starts the hour from the capacity, 20: ceil(20 x 0.65) = 13 arrive.
  assert.equal(m.promo, 20);
  // The new shop is the product's one seller: price 10 leaves room for 7, so
  // demand is 100 - floor(100 / 7) - 0.5 = 85.5. No rival sells it: the
  // price is 10 x (1.2 + 0.3) = 15.
  assert.equal(m.lines[0].demand, 85.5);
  assert.equal(m.lines[0].price, 15);
  // 13 x 0.5 x 0.855 x satisfaction 1 = 5.5575 units, rounded up 30% of the
  // time and to the nearest otherwise: 0.3 x 6 + 0.7 x 6 = 6 a week.
  close(m.lines[0].units, 6 / 7, 'units a day');
  close(m.revenue, 6 / 7 * 15, 'sales');
  close(m.cogs, 6 / 7 * 4, 'goods at the import cost');
  // One cashier (20 an hour at most), a cleaner and a guard, at skill 100.
  const rate = (1 + Math.pow(1.05, 100) / 100) * 0.7;
  close(m.wages, (16 + 12 + 15) * rate / 7, 'wages');
  close(m.profit, 6 / 7 * 15 - 6 / 7 * 4 - 43 * rate / 7 - 50, 'profit');
  // Customers who bought something: each of the 13 missed by all 6 units with (12/13)^6.
  close(m.customers, 13 * (1 - Math.pow(12 / 13, 6)) / 7, 'buyers a day');
});

test('a rival that sells the product takes the monopoly bonus and caps the price', () => {
  const facts = JSON.parse(JSON.stringify(RETAIL));
  facts.market.P.hoods.H = [2, 1, 8];
  const m = model(facts).model('T', SHOP, {sat: 50, open: HOUR});
  assert.equal(m.lines[0].price, 8 * 1.2);
  assert.equal(m.lines[0].demand, 100 - Math.floor(300 / 7) - 0.5);
});

test('a store of the type already at the address is a seller already of what its shelves hold', () => {
  const facts = JSON.parse(JSON.stringify(RETAIL));
  facts.market.P.hoods.H = [1, 0, null];
  const at = (sells, biz = {key: 'k', typeSlug: 'T'}) =>
    model({...facts, built: {[biz.key]: {sells}}}, {businesses: [biz]}).model('T', SHOP, {sat: 50, open: HOUR});
  // Premises set up before the plan, offering P (the game's provider count):
  // the market's one seller is this store, so the demand is a lone seller's, 85.5.
  assert.equal(at(['P']).lines[0].demand, 85.5);
  // Nothing on offer (stock in the storeroom only): not counted, the plan adds itself.
  const added = model(facts).model('T', SHOP, {sat: 50, open: HOUR}).lines[0].demand;
  assert.ok(added < 85.5);
  assert.equal(at([]).lines[0].demand, added);
  // A store of another type at the address, or this type elsewhere, is no part of it.
  assert.equal(at(['P'], {key: 'k', typeSlug: 'U'}).lines[0].demand, added);
  assert.equal(at(['P'], {key: 'j', typeSlug: 'T'}).lines[0].demand, added);
  // Nor does it take a demand step from your other shops nearby.
  facts.sales = {H: {P: [['other', 10, 2]]}};
  const cannibal = sells => model({...facts, built: {k: {sells}}}, {businesses: [{key: 'k', typeSlug: 'T'}]});
  assert.equal(cannibal(['P']).cannibal('T', 'H', cannibal(['P']).provides('T', SHOP)), null);
  assert.ok(cannibal([]).cannibal('T', 'H', cannibal([]).provides('T', SHOP)).loss > 0);
});

test('the borrowing limit: whichever of the bank\'s room and the company\'s means binds', () => {
  const limit = (finance, bank) => model({...RETAIL, finance}).loanLimit({term: 240, owed: 0, max: 2000000, ...bank});
  // The bank's own cap less what it is owed.
  assert.equal(limit({wealth: 10e6}, {max: 40000, owed: 10000}), 30000);
  // Wealth less everything owed.
  assert.equal(limit({wealth: 20000, owed: 5000}), 15000);
  // A quarter of last week's daily profit over the term.
  assert.equal(limit({wealth: 0, profit7: 1000}), 60000);
  // The tutorial's floor while its first-loan objective is open.
  assert.equal(limit({wealth: 0, profit7: 0, floor: 15500}), 15500);
  // Owing more than it is worth: nothing.
  assert.equal(limit({wealth: 1000, owed: 5000}), 0);
});

test('a loan: flat interest, straight repayment, and the day the owner\'s own cash is back', () => {
  const ctx = model({...RETAIL, finance: {multiplier: 0.7, year: 60, minimum: 500}});
  const loan = ctx.loan(20000, {rate: 12, term: 240});
  assert.deepEqual([loan.interest, loan.repay, loan.days, loan.total], [28, 83, 241, 28 * 241]);
  assert.equal(ctx.loan(400, {rate: 12, term: 240}), null, 'under the minimum');
  // 1,000 of own cash at 300 a day, 100 a day to the bank for two days: 200, 400, 700, 1,000.
  assert.equal(ctx.loanDays(1000, 300, {days: 2, interest: 20, repay: 80}), 4);
  assert.equal(ctx.loanDays(0, 300, {days: 2, interest: 20, repay: 80}), 0);
  assert.equal(ctx.loanDays(1000, 0, {days: 2, interest: 20, repay: 80}), null, 'never at no profit');
});

test('what a new seller takes from the player\'s shops nearby, secondary products included', () => {
  const facts = JSON.parse(JSON.stringify(RETAIL));
  facts.types.T.products = [['P', 1], ['Q', 0.5]];
  facts.market.Q = {p: 10, r: 0.5, d: 1, cost: 4, hoods: {H: [1, 0, null]}};
  facts.sales = {H: {Q: [['k1', 10, 2]]}};
  const c = model(facts).cannibal('T', 'H');
  // One seller now (85.5), two after (100 - floor(200 / 7) - 0.5 = 71.5): 10 units at 2 each lose that share.
  close(c.loss, 10 * 2 * (1 - 71.5 / 85.5), 'the loss a day');
  assert.equal(JSON.stringify([c.shops, c.items]), JSON.stringify([1, ['Q']]));
  assert.equal(model(RETAIL).cannibal('T', 'H'), null, 'nothing sold nearby');
});

test('the first days: the ramp on the gross margin, fixed costs whole, and break even counted day by day', () => {
  const ctx = model(RETAIL);
  const m = {revenue: 1000, cogs: 400, wages: 100, rent: 50, marketing: 50, profit: 400};
  const days = [0, 1, 2, 3, 4, 5, 6].map(k => ctx.dayProfit(m, null, k));
  // Gross margin 600 at 0.55, 0.92, 0.94, 0.97, 0.99, then whole; 200 of costs every day.
  [130, 352, 364, 382, 394, 400, 400].forEach((want, k) => close(days[k], want, `day ${k}`));
  // 2,000 is covered on day 6 (130 + 352 + 364 + 382 + 394 + 400 = 2,022), not day 5 as 2,000 / 400 would say.
  const day = k => ctx.dayProfit(m, null, k);
  assert.equal(ctx.breakDay(2000, day), 6);
  assert.equal(ctx.days(2000, 400), 5);
  assert.equal(ctx.breakDay(1e9, k => ctx.dayProfit({...m, profit: -1, revenue: 100}, null, k)), null);
});

test('the first seller in a neighbourhood gets +20 demand on the product for its first 14 days', () => {
  const facts = JSON.parse(JSON.stringify(RETAIL));
  facts.types.T.products = [['P', 1], ['Q', 1], ['S', 1]];
  facts.market.Q = {p: 10, r: 0.5, d: 1, cost: 4, hoods: {H: [2, 1, null]}};   // two sellers there already
  facts.market.S = {p: 10, r: 0.5, d: 1, s: 1, cost: 0, hoods: {H: [0, 0, null]}}; // a service never hypes
  facts.market.R = {p: 10, r: 0.5, d: 1, cost: 4, hoods: {H: [0, 0, null, 30]}};  // nobody now, but sold on day 30
  facts.types.T.products.push(['R', 1]);
  const ctx = model(facts);
  // Day 40: P was last sold on day 0 (21 days ago or more), R on day 30.
  assert.equal(JSON.stringify(ctx.hyped('T', 'H')), JSON.stringify(['P']));
  ctx.company.day = 51;
  assert.equal(JSON.stringify(ctx.hyped('T', 'H')), JSON.stringify(['P', 'R']), '21 days after its last sale R hypes too');
  ctx.company.day = 40;
  const plain = ctx.model('T', SHOP, {sat: 50, open: HOUR});
  const hyped = ctx.model('T', SHOP, {sat: 50, open: HOUR, hype: ['P']});
  assert.equal(hyped.lines[0].demand, Math.min(100, plain.lines[0].demand + 20));
  assert.equal(hyped.lines[1].demand, plain.lines[1].demand, 'only the hyped product');
  // Days 1 to 14 run on the hyped model, the opening day and day 15 on the plain one.
  const gm = x => x.revenue - x.cogs, fixed = x => x.wages + x.rent + x.marketing;
  close(ctx.dayProfit(plain, hyped, 0), 0.55 * gm(plain) - fixed(plain), 'opening day');
  close(ctx.dayProfit(plain, hyped, 2), 0.94 * gm(hyped) - fixed(hyped), 'day 2');
  close(ctx.dayProfit(plain, hyped, 14), gm(hyped) - fixed(hyped), 'day 14');
  close(ctx.dayProfit(plain, hyped, 15), plain.profit, 'day 15');
});

test('investment uses layout, decoration and deterministic vendor order without board state', () => {
  const facts = JSON.parse(JSON.stringify(RETAIL));
  facts.game.delivery = 100;
  facts.hoods.H.interior = 50;
  facts.decor = {C1: {'50': {cost: 200}}};
  facts.types.T.layouts.C1 = {furniture: 1000, fee: 500, lines: [['A', 2], ['B', 1], ['C', 3]]};
  facts.items = {A: {v: ['z', 'a']}, B: {v: ['z', 'a']}, C: {v: ['c']}};
  const api = OpenStoreModel.create({facts});
  assert.deepEqual(api.stores(facts.types.T.layouts.C1), [{key: 'a', lines: [0, 1]}, {key: 'c', lines: [2]}]);
  assert.deepEqual(api.investment({type: 'T'}, {...SHOP, deposit: 50}),
    {furniture: 1000, fee: 500, deposit: 50, stores: 2, delivery: 200, decor: 200, firm: 1550, self: 1450, items: 6});
  assert.deepEqual(api.investment({type: 'T'}, {...SHOP, status: 'mine', occupant: null, deposit: 50}),
    {furniture: 1000, fee: 500, deposit: 0, stores: 2, delivery: 200, decor: 200, firm: 1500, self: 1400, items: 6});
  assert.equal(api.investment({type: 'missing'}, SHOP), null);
  assert.equal(api.model('missing', SHOP), null);
});

test('optional items join the outfit, its stores and the investment only when included', () => {
  const facts = JSON.parse(JSON.stringify(RETAIL));
  facts.game.delivery = 100;
  facts.types.T.layouts.C1 = {furniture: 1000, fee: 500, lines: [['A', 2]], opt: [['O', 1, 'opt', 'cleaning']], optFurniture: 40};
  facts.items = {A: {v: ['a']}, O: {v: ['o']}};
  const off = OpenStoreModel.create({facts}), on = OpenStoreModel.create({facts, optional: true});
  assert.deepEqual(off.outfit({type: 'T'}, SHOP).lines, [['A', 2]]);
  assert.deepEqual(on.outfit({type: 'T'}, SHOP).lines, [['A', 2], ['O', 1, 'opt', 'cleaning']]);
  assert.deepEqual(off.investment({type: 'T'}, {...SHOP, deposit: 50}),
    {furniture: 1000, fee: 500, deposit: 50, stores: 1, delivery: 100, decor: 0, firm: 1550, self: 1150, items: 2});
  assert.deepEqual(on.investment({type: 'T'}, {...SHOP, deposit: 50}),
    {furniture: 1040, fee: 500, deposit: 50, stores: 2, delivery: 200, decor: 0, firm: 1590, self: 1290, items: 3});
  assert.equal(facts.types.T.layouts.C1.lines.length, 1, 'the payload is not changed');
  // A layout without optional items is the same either way.
  delete facts.types.T.layouts.C1.opt;
  assert.deepEqual(OpenStoreModel.create({facts, optional: true}).outfit({type: 'T'}, SHOP), facts.types.T.layouts.C1);
});

test('availability follows the lease and occupant, not ownership of the real estate', () => {
  const b = {status: 'mine', occupant: null, deposit: 500, owner: 'city'};
  assert.equal(OpenStoreModel.availablePremises(b), true);
  assert.equal(OpenStoreModel.leaseDeposit(b), 0);
  b.occupant = {typeSlug: 'ba:businesstype_clothingstore'};
  assert.equal(OpenStoreModel.availablePremises(b), false);
  b.status = 'vacant'; b.occupant = null; b.owner = 'you';
  assert.equal(OpenStoreModel.availablePremises(b), true);
  assert.equal(OpenStoreModel.leaseDeposit(b), 500);
  for(const status of ['rival', 'service', 'unavailable']){
    assert.equal(OpenStoreModel.availablePremises({...b, status}), false);
  }
});

test('office billing, staffed-hour wages and own-shop calibration use explicit inputs', () => {
  const facts = JSON.parse(JSON.stringify(RETAIL));
  facts.types.T.model = 'office';
  facts.types.T.wage = 20;
  const company = {businesses: [{key: SHOP.key, rent: 50}], day: 40};
  const api = OpenStoreModel.create({facts, company});
  const options = {promoTotal: 20, sat: 50, open: HOUR, existing: true, computers: 20};
  const before = JSON.stringify({facts, company, options});
  const m = api.model('T', SHOP, options);
  // One weekend daytime hour staffs half the computers: 10, all billed.
  close(m.customers, 10 / 7, 'clients');
  close(m.revenue, 10 / 7 * 15, 'fees');
  const skill = 1 + Math.pow(1.05, 100) / 100;
  close(m.wages, (10 * 20 + 12) * skill * 0.7 / 7, 'staffed hours and cleaning');
  assert.equal(JSON.stringify({facts, company, options}), before, 'calculation leaves inputs intact');
  facts.own = {T: [{...SHOP, promo: 20, marketing: 0, open: HOUR, sat: 50, actual: 1, k: [0, 1]}]};
  // Use positive daily profit for the ratio; the company's rent remains explicit.
  facts.market.P.p = 1000;
  const expected = api.model('T', SHOP, {...options, computers: undefined});
  const ramped = (api.dayProfit(expected, null, 0) + api.dayProfit(expected, null, 1)) / 2;
  const ratio = api.ownRatio('T');
  close(ratio.rows[0].model, ramped, 'opening days included');
  close(ratio.ratio, 1 / ramped, 'actual divided by predicted');
  const other = OpenStoreModel.create({facts: {...facts, market: {...facts.market, P: {...facts.market.P, p: 2000}}}, company});
  assert.ok(other.model('T', SHOP, options).revenue > api.model('T', SHOP, options).revenue, 'factories do not share a facts cache');
});

test('demand with n sellers steps down past the room the price leaves, then bottoms out', () => {
  // ProductMarketHelper.CalculateDemand: a 55 item leaves room for five sellers.
  const m = model(RETAIL);
  assert.equal(m.demandWith(1, 55), 79.5);
  assert.equal(m.demandWith(2, 55), 59.5);
  assert.equal(m.demandWith(4, 55), 31.5);
  assert.equal(m.demandWith(0, 55), 99.5);
});

/* The game values come from the payload alone (issue #347): a missing one
   throws rather than falling back to a number kept here. */
test('a missing game value fails loudly instead of being guessed', () => {
  for(const key of ['wageBase', 'satisfaction']){
    const facts = structuredClone(RETAIL);
    delete facts.game[key];
    assert.throws(() => model(facts).model('T', SHOP, {open: HOUR}), new RegExp(`openStore\\.game\\.${key} is missing`));
  }
  const noRamp = structuredClone(RETAIL);
  delete noRamp.game.ramp;
  assert.throws(() => model(noRamp).rampDays(), /openStore\.game\.ramp is missing/);
  const noOffice = structuredClone(RETAIL);
  delete noOffice.game.office;
  assert.throws(() => model(noOffice).officeStaffed(4, 50, 1, 10), /openStore\.game\.office is missing/);
  assert.throws(() => model({...RETAIL, finance: {multiplier: 0.7, minimum: 500}}).loan(1000, {rate: 5, term: 240}),
    /openStore\.finance\.year is missing/);
  assert.equal(model(RETAIL).rampDays(), 5);
});

test('the office default follows the shipped office facts', () => {
  const m = model(RETAIL);
  assert.equal(m.officeStaffed(10, 50, 1, 3), 3, 'night: the always-on computers');
  assert.equal(m.officeStaffed(10, 50, 1, 10), 10, 'weekday daytime: every computer');
  assert.equal(m.officeStaffed(10, 50, 6, 10), 5, 'weekend daytime: half');
  const facts = structuredClone(RETAIL);
  facts.game.office = {always: 2, fullDoor: 50, day: [9, 17], weekend: [0]};
  const other = model(facts);
  assert.equal(other.officeStaffed(10, 50, 1, 8), 2);
  assert.equal(other.officeStaffed(10, 50, 6, 10), 10, 'Saturday is a weekday here');
});


test('unsupported economy forecasts are withheld without removing known outfit costs', () => {
  for(const capability of ['storeProfit', 'officeProfit']){
    const facts = structuredClone(RETAIL);
    facts.types.T.model = capability === 'officeProfit' ? 'office' : 'retail';
    facts.types.T.layouts.C1 = {furniture: 100, fee: 20, lines: []};
    facts.compatibility = {[capability]: ['equipmentUtilities']};
    const m = model(facts);
    assert.equal(m.model('T', SHOP), null);
    assert.equal(m.ownRatio('T'), null);
    assert.equal(m.investment({type: 'T'}, {...SHOP,deposit:0}).firm, 120);
  }
  assert.notEqual(model({...RETAIL, compatibility: {officeProfit: ['officeIt']}}).model('T', SHOP), null);
  assert.equal(model(RETAIL).model('T', {...SHOP, marketingUnavailable: true}), null);
});

test('incomplete vehicle wealth cannot produce an authoritative loan limit or loan', () => {
  const m = model({...RETAIL, finance: {wealth: null, unavailable: 'vehiclePrices'}});
  assert.equal(m.loanLimit({max: 2e6, term: 240}), 0);
  assert.equal(m.loan(10000, {max: 2e6, term: 240}), null);
});

const off=()=>({status:'disabled'}), ready=data=>({status:'ready',data});
function modFacts(){
  const f=structuredClone(RETAIL);
  f.types.T.layouts.C1={furniture:100,fee:20,lines:[['desk',1]]};f.items={desk:{p:100,v:['seller']}};
  f.game.delivery=5;f.modEconomy={day:40,rlo:{modules:Object.fromEntries(['prices','company','utilities','requirements','interiors','footfall','closures'].map(k=>[k,off()]))}};
  return f;
}
function companyRules(factor=1000){return {newHireWageFactorThousandths:factor,sites:[],
  partStates:{staff:'disabled',cover:'disabled',marketing:'disabled',tax:'disabled',licences:'disabled'}};}
function priceRules(factor=1200){return {costFactorThousandths:factor,takingsFactorThousandths:factor,adjustmentQuiet:1,
  livingTransactionTypes:['ba:transaction_interiorinstallation','ba:transaction_interiordesigner','ba:transaction_marketing'],depositAdjustment:'none'};}

test('known disabled mod rules preserve native profit; unknown module is scoped to its model',()=>{
  const f=modFacts(), plain=model(RETAIL).model('T',SHOP,{sat:50,open:HOUR});
  const result=model(f).model('T',SHOP,{sat:50,open:HOUR});
  close(result.profit,plain.profit,'disabled profit');assert.equal(result.modCosts.dailyCents,0);
  f.modEconomy.rlo.modules.utilities={status:'failed'};
  assert.equal(model(f).model('T',SHOP,{sat:50,open:HOUR}),null);
  assert.equal(model(f).investment({type:'T'},{...SHOP,deposit:10}).furniture,100);
});

test('registered prices are not scaled again; later native City settlement is applied once',()=>{
  const f=modFacts();f.modEconomy.rlo.modules.prices=ready(priceRules());
  f.modEconomy.rlo.modules.company=ready(companyRules(1100));
  const owner=require('../template/mod-demand-model.js'), result=model(f).model('T',SHOP,{sat:50,open:HOUR});
  const base=model(RETAIL).model('T',SHOP,{sat:50,open:HOUR});
  close(result.cogs,base.cogs,'current import cost already contains current catalogue');
  close(result.revenue,base.revenue+owner.cityAdjust(base.revenue*7,1200,1)/7,'native sales adjusted on its trading day');
  close(result.wages,base.wages+owner.cityAdjust(base.wages*7,1200,1)/7,'native payroll adjusted once per day');
  assert.notEqual(result.revenue,base.revenue+owner.cityAdjust(base.revenue,1200,1),'never round the weekly mean');
  assert.ok(result.assumptions.includes('company-aggregate-allocation-and-carried-debt-excluded'));
  assert.equal(result.rent,60);
});

test('firm installation and self delivery preserve their distinct native transaction boundaries',()=>{
  const f=modFacts();f.modEconomy.rlo.modules.prices=ready(priceRules());
  const inv=model(f).investment({type:'T'},{...SHOP,deposit:10});
  assert.equal(inv.firm,154); // 120 + City24 + deposit10.
  assert.equal(inv.self,115); // delivery105 unchanged + deposit10.
  assert.equal(inv.incomplete,undefined);
  f.modEconomy.rlo.modules.prices.data.depositAdjustment=null;
  assert.ok(model(f).investment({type:'T'},{...SHOP,deposit:10}).incomplete.includes('deposit-adjustment-unavailable'));
  assert.ok(!model(f).investment({type:'T'},{...SHOP,status:'mine',deposit:10}).incomplete);
});

test('missing prices only block affected products and never become free investment or rent',()=>{
  const f=modFacts();f.priceUnavailable=['other'];
  assert.ok(model(f).model('T',SHOP,{open:HOUR}));
  f.priceUnavailable=['P'];assert.equal(model(f).model('T',SHOP,{open:HOUR}),null);
  f.priceUnavailable=['desk'];assert.ok(model(f).investment({type:'T'},{...SHOP,deposit:10}).incomplete.includes('catalogue-price-unavailable'));
  assert.ok(model(f).investment({type:'T'},{...SHOP,deposit:null}).incomplete.includes('lease-quote-unavailable'));
  assert.equal(model(modFacts()).model('T',{...SHOP,rent:null}),null);
});

test('mod run-rate is subtracted once and a future unknown quote stops payback',()=>{
  const core=model(modFacts());
  const m={revenue:100,cogs:10,wages:10,rent:10,marketing:0,profit:60,
    modCosts:{dailyCents:1000,dayCost:()=>1000}};
  close(core.dayProfit(m,null,6),60,'single mod-cost subtraction');
  m.modCosts.dayCost=()=>null;assert.equal(core.dayProfit(m,null,6),null);
  assert.deepEqual(core.breakDay(100,k=>k<2?10:null),{status:'unavailable',reason:'future-cashflow-unavailable',offset:2});
  assert.deepEqual(core.loanDays(100,k=>k<2?10:null,{days:1,interest:1,repay:1}),{status:'unavailable',reason:'future-cashflow-unavailable',offset:2});
  assert.equal(core.ownRatio('T'),null);
});

test('observed owner promotion is applied once and missing site evidence is explicit',()=>{
  const f=modFacts(),v=require('../contracts/rlo/planning-vectors.json');
  f.modEconomy.rlo.modules.footfall=ready({terms:v.promotionTerms,priceTolerance:null,sites:[{
    address:{street:'road',number:1},status:'ready',ownPromotion:20,writtenPromotion:50,
    issuePercent:0,ambientPercent:10,interiorPercent:0,cityPercent:0,baseMultiplier:'0.5'}]});
  const b={...SHOP,key:'road#1'},core=model(f);
  const m=core.model('T',b,{existing:true,promoTotal:50,open:HOUR,sat:50});
  const owner=require('../template/mod-demand-model.js');
  assert.equal(m.promo,owner.promotion({terms:v.promotionTerms,own:20,issue:0,ambient:10,interior:0,baseMultiplier:'0.5'}));
  f.modEconomy.rlo.modules.footfall.data.sites[0].status='unavailable';
  const other=model(f);assert.equal(other.model('T',b,{existing:true,promoTotal:50,open:HOUR}),null);
  assert.ok(other.diagnostics('T',b).includes('footfall-site-unavailable'));
});


test('daily demand rebuild does not restart a licence renewal commitment',()=>{
  const core=model(modFacts());
  const m={revenue:100,cogs:0,wages:0,rent:0,marketing:0,profit:100,
    modCosts:{dailyCents:0,dayCost:k=>k===6?2500:0},
    modAtDay:()=>({revenue:100,cogs:0,wages:0,rent:0,marketing:0,modCosts:{dayCost:()=>0}})};
  assert.equal(core.dayProfit(m,null,6),75);
  assert.equal(core.dayProfit(m,null,7),100);
});


test('City timeline settles the actual weekday after ramping native receipts',()=>{
  const f=modFacts();f.modEconomy.rlo.modules.prices=ready(priceRules());
  const core=model(f),m=core.model('T',SHOP,{sat:50,open:HOUR});
  const owner=require('../template/mod-demand-model.js');
  const native=m.nativeByDay[0],r=f.game.ramp[2]; // capture day40 Friday, offset2 Sunday
  const expected=native.revenue*r+owner.cityAdjust(native.revenue*r,1200,1)-native.cogs*r
    -native.wages-owner.cityAdjust(native.wages,1200,1)-60;
  close(core.dayProfit(m,null,2),expected,'Sunday receipts and daily payroll');
  close(core.dayProfit(m,null,0),-60,'closed Friday still pays rent');
});

function expansionFacts(){
  const f=modFacts(),h=structuredClone(require('../contracts/hart/ready.json').modules.runningCosts.data);
  const u=structuredClone(require('../contracts/rlo/utilities-vectors.json').sample.terms);
  f.types.T.products.push(['Q',1]);f.market.Q=structuredClone(f.market.P);
  f.types.T.expansionDisplays={P:[{capacity:20,lines:[['shelf',1]],extra:[]}]};
  f.items.shelf={p:100,v:['seller']};f.built={'road#1':{sells:['Q']}};
  h.equipment.effective=true;h.officeIt.effective=false;
  h.items.push({itemId:'shelf',openWatts:100000,alwaysWatts:0,litresPerOpenHour:0,officeSeat:false});
  h.currentSites=[{address:{street:'road',number:1},equipmentApplies:true,openWatts:0,alwaysWatts:0,litresPerOpenHour:0,officeSeats:0}];
  f.modEconomy.hart={modules:{runningCosts:ready(h),retailDemand:off()}};
  f.modEconomy.rlo.modules.utilities=ready({model:'rlo-utilities-v1',terms:u,typeKinds:[{typeId:'T',kind:2}],
    accounts:['power','water'].map(service=>({address:{street:'road',number:1},service,state:'active'})),
    unresolvedAccountServices:[],internetEnabled:false,internet:{needs:[],providers:[]}});
  return f;
}

test('existing expansion charges only additional equipment above the owner billing cache',()=>{
  const f=expansionFacts(),b={...SHOP,key:'road#1'},o={sat:50,open:HOUR,promoTotal:20};
  const core=model(f),rows=core.expansions('T',b,o);assert.equal(rows.length,1);
  const row=rows[0],cost=require('../template/mod-economy-model.js').create(f.modEconomy);
  const before=cost.operating({typeId:'T',building:b,open:HOUR,existing:true});
  const after=cost.operating({typeId:'T',building:b,open:HOUR,existing:true,existingExtraLines:[['shelf',1]]});
  assert.ok(row.modOperatingDelta>0);
  close(row.modOperatingDelta,(after.dailyCents-before.dailyCents)/100,'incremental HART utility costs');
  close(row.net,row.margin-row.loss-row.modOperatingDelta,'only the added recurring amount');
  assert.equal(row.modStartupDelta,0);
  f.priceUnavailable=['shelf'];
  const missing=model(f);assert.equal(missing.expansions('T',b,o),null);
  assert.ok(missing.diagnostics('T',b).includes('expansion-equipment-price-unavailable'));
});

test('changed expansion cannot reuse current interior effects as a hypothetical projection',()=>{
  const f=expansionFacts(),b={...SHOP,key:'road#1'},o={sat:50,open:HOUR,promoTotal:20};
  const v=require('../contracts/rlo/planning-vectors.json');
  f.modEconomy.rlo.modules.interiors=ready({terms:v.interiorTerms,districts:[],items:[],sites:[{
    address:{street:'road',number:1},basketThousandths:0,officeBoostThousandths:0,footfallPercent:0,priceToleranceThousandths:0}]});
  const core=model(f);assert.equal(core.expansions('T',b,o),null);
  assert.ok(core.diagnostics('T',b).includes('expansion-interior-context-unavailable'));
});


test('negative closed days and renewal days do not end a profitable payback timeline',()=>{
  const core=model(modFacts()),day=k=>k===16?-200:k%7===0?500:-10;
  const expected=(()=>{let sum=0;for(let k=0;k<20000;k++){sum+=day(k);if(sum>=2000)return k+1;}})();
  assert.ok(expected>16);assert.equal(core.breakDay(2000,day),expected);
  assert.equal(core.loanDays(2000,day,{days:0,interest:0,repay:0}),expected);
});

test('steady captured demand is reused while anchored seasonal costs stay day-specific',()=>{
  const core=model(modFacts()),m=core.model('T',SHOP,{open:HOUR,sat:50});
  assert.equal(m.modAtDay(100),m.modAtDay(101));
  assert.equal(m.modAtDay(100).modCosts,m.modCosts);
});


test('failed company campaign ownership gates current sites but not a new site',()=>{
  const f=modFacts(), company=companyRules();company.partStates.marketing='failed';
  f.modEconomy.rlo.modules.company=ready(company);
  assert.equal(model(f).model('T',SHOP,{sat:50,open:HOUR,existing:true}),null);
  assert.ok(model(f).model('T',SHOP,{sat:50,open:HOUR}));
  company.partStates.marketing='disabled';
  assert.ok(model(f).model('T',SHOP,{sat:50,open:HOUR,existing:true}));
});


test('companion horizons stay unavailable while legacy unmodded limits retain their result',()=>{
  const core=model(modFacts()),expected={status:'unavailable',reason:'forecast-horizon-exceeded',offset:20000};
  assert.deepEqual(core.breakDay(1e9,()=>0),expected);
  assert.deepEqual(core.loanDays(1e9,()=>0,{days:0,interest:0,repay:0}),expected);
  assert.equal(model(RETAIL).breakDay(1e9,()=>0),null);
});

test('expansion payback survives an identical cover renewal beyond the known full-site horizon',()=>{
  const f=expansionFacts(),b={...SHOP,key:'road#1'},o={sat:50,open:HOUR,promoTotal:20};
  f.items.shelf.p=10000;
  const noCover=model(f).expansions('T',b,o)[0];
  const company=companyRules();company.partStates.cover='ready';
  company.sites=[{address:{street:'road',number:1},cover:[{active:true,fromDay:1,untilDay:48,dailyCents:100}],campaign:{active:false}}];
  f.modEconomy.rlo.modules.company=ready(company);
  const core=model(f),withCover=core.expansions('T',b,o)[0];
  assert.equal(core.model('T',b,{...o,existing:true}).modCosts.dayCost(9),null);
  assert.ok(Number.isFinite(withCover.payback) && withCover.payback>9);
  assert.equal(withCover.payback,noCover.payback);
});


test('City wholesale inclusion adjusts the daily goods category once, including the opening ramp',()=>{
  const f=modFacts(),prices=priceRules(1200);prices.livingExcludesWholesalePurchases=false;
  f.modEconomy.rlo.modules.prices=ready(prices);
  const core=model(f),m=core.model('T',SHOP,{sat:50,open:HOUR});
  const native=m.nativeByDay[0],owner=require('../template/mod-demand-model.js');
  close(m.cogs,(native.cogs+owner.cityAdjust(native.cogs,1200,1))/7,'whole trading day, not mean goods cost');
  const ramp=f.game.ramp[2],expected=core.dayProfit(m,null,2);
  prices.livingExcludesWholesalePurchases=true;
  const excluded=model(f),other=excluded.model('T',SHOP,{sat:50,open:HOUR});
  close(m.cogs-other.cogs,owner.cityAdjust(native.cogs,1200,1)/7,'one extra City step');
  close(excluded.dayProfit(other,null,2)-expected,owner.cityAdjust(native.cogs*ramp,1200,1),'ramp before daily City goods settlement');
});

test('carried company debt must be modelled before a site forecast can be numeric',()=>{
  const f=modFacts(),prices=priceRules();prices.carriedDebtInSiteForecast=true;
  f.modEconomy.rlo.modules.prices=ready(prices);
  const core=model(f);assert.equal(core.model('T',SHOP,{sat:50,open:HOUR}),null);
  assert.ok(core.diagnostics('T',SHOP).includes('company-carried-debt-unavailable'));
  prices.carriedDebtInSiteForecast=false;
  assert.ok(model(f).model('T',SHOP,{sat:50,open:HOUR}));
});

test('unknown required deposit leaves store totals null while known outfit amounts remain visible',()=>{
  const core=model(modFacts()),investment=core.investment({type:'T'},{...SHOP,deposit:null});
  assert.equal(investment.deposit,null);assert.equal(investment.firm,null);assert.equal(investment.self,null);
  assert.equal(investment.furniture,100);assert.ok(investment.incomplete.includes('lease-quote-unavailable'));
  const held=core.investment({type:'T'},{...SHOP,status:'mine',deposit:null});
  assert.equal(held.deposit,0);assert.ok(Number.isFinite(held.firm));
});


test('expansion initial stock is one purchase bill when City includes wholesale purchases',()=>{
  const f=expansionFacts(),b={...SHOP,key:'road#1'},o={sat:50,open:HOUR,promoTotal:20};
  const prices=priceRules(1200);prices.livingExcludesWholesalePurchases=true;
  f.modEconomy.rlo.modules.prices=ready(prices);
  const native=model(f).expansions('T',b,o)[0];
  prices.livingExcludesWholesalePurchases=false;
  const included=model(f).expansions('T',b,o)[0],owner=require('../template/mod-demand-model.js');
  assert.equal(included.stock,owner.wholesaleDayCost(native.stock,prices));
  close(included.investment-native.investment,included.stock-native.stock,'initial stock adjustment counted once');
  assert.ok(included.assumptions.includes('initial-stock-single-purchase'));
});
