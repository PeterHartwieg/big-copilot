// Expansion › Open a store's arithmetic, pinned by hand: the retail profit
// model on a one-product type with flat curves, the borrowing limit with each
// of its limits binding, the day the owner's cash is back with a loan, what a
// new seller takes from the player's own shops, and how plans are started.
// Arithmetic imports the feature module directly. Plan and chart integration
// checks below still use the board VM through loadBoard().
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {enRe} = require('./_i18n.cjs');
const vm = require('node:vm');
const {loadBoard} = require('./_board.cjs');

/* The board, its D the facts given. Its functions are properties of the
   context; D (a `let`) is read through the getter below. */
function boardModel(facts, extra = {}){
  const store = new Map();
  const D = {openStore: facts, meta: {day: 40, character: 'c1'}, businesses: [], ...extra};
  const board = loadBoard({__D: D,
    localStorage: {getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v)}});
  vm.runInContext('D = __D', board);
  Object.defineProperty(board, 'D', {get: () => vm.runInContext('D', board)});
  return board;
}
const OpenStoreModel = require('../template/open-store-model.js');

/* Arithmetic runs directly in Node, without board/DOM/storage globals. */
function model(facts, extra = {}){
  const company = {day: 40, businesses: [], ...extra};
  const core = OpenStoreModel.create({facts, company});
  return {company, ...Object.fromEntries(Object.entries(core).map(([name, fn]) => ['os' + name[0].toUpperCase() + name.slice(1), fn]))};
}

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);

/* One product, flat curves, one open hour a week. */
const RETAIL = {
  game: {promo: 0.5, wages: 0.7, capInitial: true, wageBase: {cashier: 16, cleaner: 12, guard: 15, perCashier: 30}},
  hoods: {H: {idx: 1.2, strength: 1, demands: 0, interior: 0}},
  types: {T: {model: 'retail', products: [['P', 1]], amt: 1, days: Array(7).fill(1), hours: Array(24).fill(1), layouts: {}}},
  market: {P: {p: 10, r: 0.5, d: 1, s: 0, cost: 4, hoods: {H: [0, 0, null]}}},
};
const SHOP = {hood: 'H', cap: 20, m2: 100, traffic: 20, layout: 'C1', rent: 50, key: 'k'};
const HOUR = [[[10, 11]], [], [], [], [], [], []];

test('the retail model, worked by hand for one product and one open hour', () => {
  const m = model(RETAIL).osModel('T', SHOP, {sat: 50, open: HOUR});
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
  const m = model(facts).osModel('T', SHOP, {sat: 50, open: HOUR});
  assert.equal(m.lines[0].price, 8 * 1.2);
  assert.equal(m.lines[0].demand, 100 - Math.floor(300 / 7) - 0.5);
});

test('a store of the type already at the address is a seller already of what its shelves hold', () => {
  const facts = JSON.parse(JSON.stringify(RETAIL));
  facts.market.P.hoods.H = [1, 0, null];
  const at = (sells, biz = {key: 'k', typeSlug: 'T'}) =>
    model({...facts, built: {[biz.key]: {sells}}}, {businesses: [biz]}).osModel('T', SHOP, {sat: 50, open: HOUR});
  // Premises set up before the plan, offering P (the game's provider count):
  // the market's one seller is this store, so the demand is a lone seller's, 85.5.
  assert.equal(at(['P']).lines[0].demand, 85.5);
  // Nothing on offer (stock in the storeroom only): not counted, the plan adds itself.
  const added = model(facts).osModel('T', SHOP, {sat: 50, open: HOUR}).lines[0].demand;
  assert.ok(added < 85.5);
  assert.equal(at([]).lines[0].demand, added);
  // A store of another type at the address, or this type elsewhere, is no part of it.
  assert.equal(at(['P'], {key: 'k', typeSlug: 'U'}).lines[0].demand, added);
  assert.equal(at(['P'], {key: 'j', typeSlug: 'T'}).lines[0].demand, added);
  // Nor does it take a demand step from your other shops nearby.
  facts.sales = {H: {P: [['other', 10, 2]]}};
  const cannibal = sells => model({...facts, built: {k: {sells}}}, {businesses: [{key: 'k', typeSlug: 'T'}]});
  assert.equal(cannibal(['P']).osCannibal('T', 'H', cannibal(['P']).osProvides('T', SHOP)), null);
  assert.ok(cannibal([]).osCannibal('T', 'H', cannibal([]).osProvides('T', SHOP)).loss > 0);
});

test('the borrowing limit: whichever of the bank\'s room and the company\'s means binds', () => {
  const limit = (finance, bank) => model({...RETAIL, finance}).osLoanLimit({term: 240, owed: 0, max: 2000000, ...bank});
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
  const loan = ctx.osLoan(20000, {rate: 12, term: 240});
  assert.deepEqual([loan.interest, loan.repay, loan.days, loan.total], [28, 83, 241, 28 * 241]);
  assert.equal(ctx.osLoan(400, {rate: 12, term: 240}), null, 'under the minimum');
  // 1,000 of own cash at 300 a day, 100 a day to the bank for two days: 200, 400, 700, 1,000.
  assert.equal(ctx.osLoanDays(1000, 300, {days: 2, interest: 20, repay: 80}), 4);
  assert.equal(ctx.osLoanDays(0, 300, {days: 2, interest: 20, repay: 80}), 0);
  assert.equal(ctx.osLoanDays(1000, 0, {days: 2, interest: 20, repay: 80}), null, 'never at no profit');
});

test('what a new seller takes from the player\'s shops nearby, secondary products included', () => {
  const facts = JSON.parse(JSON.stringify(RETAIL));
  facts.types.T.products = [['P', 1], ['Q', 0.5]];
  facts.market.Q = {p: 10, r: 0.5, d: 1, cost: 4, hoods: {H: [1, 0, null]}};
  facts.sales = {H: {Q: [['k1', 10, 2]]}};
  const c = model(facts).osCannibal('T', 'H');
  // One seller now (85.5), two after (100 - floor(200 / 7) - 0.5 = 71.5): 10 units at 2 each lose that share.
  close(c.loss, 10 * 2 * (1 - 71.5 / 85.5), 'the loss a day');
  assert.equal(JSON.stringify([c.shops, c.items]), JSON.stringify([1, ['Q']]));
  assert.equal(model(RETAIL).osCannibal('T', 'H'), null, 'nothing sold nearby');
});

test('a plan for the same type and neighbourhood is taken up again; a full list never drops a planned building', () => {
  const ctx = boardModel(RETAIL);
  vm.runInContext('osLoad()', ctx);
  const first = ctx.osNew('T', 'H');
  assert.equal(ctx.osNew('T', 'H').id, first.id, 'no second plan for the same question');
  assert.notEqual(ctx.osNew('T', 'G').id, first.id);
  vm.runInContext('osPlans = Array.from({length: 12}, (_, i) => ({id: "p" + i, type: "T", hood: null, key: "b" + i, finance: {}, step: "investment"}))', ctx);
  assert.equal(ctx.osNew('T', 'H'), null, 'twelve plans with buildings: none is dropped');
  vm.runInContext('osPlans[5].key = null', ctx);
  const made = ctx.osNew('T', 'H');
  assert.ok(made);
  assert.equal(vm.runInContext('osPlans.length', ctx), 12);
  assert.equal(vm.runInContext('osPlans.some(p => p.id === "p5")', ctx), false, 'the plan with no building made room');
  assert.equal(made.finance.amount, null, 'no loan amount chosen yet');
});

test('the first days: the ramp on the gross margin, fixed costs whole, and break even counted day by day', () => {
  const ctx = model(RETAIL);
  const m = {revenue: 1000, cogs: 400, wages: 100, rent: 50, marketing: 50, profit: 400};
  const days = [0, 1, 2, 3, 4, 5, 6].map(k => ctx.osDayProfit(m, null, k));
  // Gross margin 600 at 0.55, 0.92, 0.94, 0.97, 0.99, then whole; 200 of costs every day.
  [130, 352, 364, 382, 394, 400, 400].forEach((want, k) => close(days[k], want, `day ${k}`));
  // 2,000 is covered on day 6 (130 + 352 + 364 + 382 + 394 + 400 = 2,022), not day 5 as 2,000 / 400 would say.
  const day = k => ctx.osDayProfit(m, null, k);
  assert.equal(ctx.osBreakDay(2000, day), 6);
  assert.equal(ctx.osDays(2000, 400), 5);
  assert.equal(ctx.osBreakDay(1e9, k => ctx.osDayProfit({...m, profit: -1, revenue: 100}, null, k)), null);
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
  assert.equal(JSON.stringify(ctx.osHyped('T', 'H')), JSON.stringify(['P']));
  ctx.company.day = 51;
  assert.equal(JSON.stringify(ctx.osHyped('T', 'H')), JSON.stringify(['P', 'R']), '21 days after its last sale R hypes too');
  ctx.company.day = 40;
  const plain = ctx.osModel('T', SHOP, {sat: 50, open: HOUR});
  const hyped = ctx.osModel('T', SHOP, {sat: 50, open: HOUR, hype: ['P']});
  assert.equal(hyped.lines[0].demand, Math.min(100, plain.lines[0].demand + 20));
  assert.equal(hyped.lines[1].demand, plain.lines[1].demand, 'only the hyped product');
  // Days 1 to 14 run on the hyped model, the opening day and day 15 on the plain one.
  const gm = x => x.revenue - x.cogs, fixed = x => x.wages + x.rent + x.marketing;
  close(ctx.osDayProfit(plain, hyped, 0), 0.55 * gm(plain) - fixed(plain), 'opening day');
  close(ctx.osDayProfit(plain, hyped, 2), 0.94 * gm(hyped) - fixed(hyped), 'day 2');
  close(ctx.osDayProfit(plain, hyped, 14), gm(hyped) - fixed(hyped), 'day 14');
  close(ctx.osDayProfit(plain, hyped, 15), plain.profit, 'day 15');
});

test('a cinema or a theatre shows its investment and no estimate', () => {
  const facts = JSON.parse(JSON.stringify(RETAIL));
  facts.types.C = {cat: 'cinema', model: null, products: [], layouts: {S: {lines: [], furniture: 1000, fee: 500}}};
  const ctx = boardModel(facts);
  // premises() is map.js's, which loadBoard() does not load: the test hands one over.
  ctx.premises = () => ({buildings: [{key: 'c', hood: 'H', size: 'S', layout: null, deposit: 100, m2: 900, cap: 100}]});
  const est = vm.runInContext('osEstimate({type: "C", key: "c", mode: "firm"}, osBuilding("c"))', ctx);
  assert.equal(est.inv.firm, 1600, 'kept by the building\'s size, having no layout');
  assert.match(est.none, enRe('gr.os.none.venue'));
});

test('a store that pays back in a day or two keeps its two investment labels on opposite edges', () => {
  const ctx = boardModel(RETAIL);
  const m = {revenue: 12000, cogs: 2000, wages: 500, rent: 200, marketing: 300, profit: 9000};
  const est = {profit: m.profit, inv: {firm: 12000, self: 10000}, day: k => ctx.osDayProfit(m, null, k)};
  const svg = vm.runInContext('osChart', ctx)(est, 'firm');
  const label = cls => (svg.match(new RegExp(`<text class="lbl ${cls}"[^>]*>`)) || [''])[0];
  const w = label('w'), i = label('i');
  assert.ok(w && i, 'both labels drawn');
  assert.notEqual(/text-anchor="end"/.test(w), /text-anchor="end"/.test(i), `${w} ${i}`);
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


test('an estimate captures the calculation core once for its repeated day callback', () => {
  const facts = JSON.parse(JSON.stringify(RETAIL));
  facts.types.T.layouts.C1 = {furniture: 100, fee: 50, lines: []};
  const ctx = boardModel(facts);
  vm.runInContext(`
    const originalCreate = OpenStoreModel.create;
    let modelCreates = 0;
    OpenStoreModel.create = inputs => { modelCreates++; return originalCreate(inputs); };
  `, ctx);
  const estimate = ctx.osEstimate({type: 'T'}, SHOP);
  const before = vm.runInContext('modelCreates', ctx);
  assert.ok(estimate.day);
  for(let k = 0; k < 20000; k++) estimate.day(k);
  assert.equal(vm.runInContext('modelCreates', ctx), before, 'simulated days reuse the bound API');
});
