const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync(process.argv[2], 'utf8');
const code = src.slice(src.indexOf('const OS_KEY'));
const [f, want] = [process.argv[3], process.argv[4]];
const P = JSON.parse(fs.readFileSync(f, 'utf8'));
const ctx = {D: P, gameName: k => (P.names || {})[k] || '', icon: () => '', prettySlug: s => s, paybackMode: () => 'firm',
  premises: () => P.premises, localStorage: {getItem(){return null}, setItem(){}}, Map, Math, JSON, Number, Array, String, Object, Set, console};
vm.createContext(ctx);
vm.runInContext(code + '\n;this.osOwnRatio = osOwnRatio; this.osModel = osModel;', ctx);
const slug = 'ba:businesstype_' + want;
const byKey = new Map(P.businesses.map(b => [b.key, b]));
for(const s of P.openStore.own[slug] || []){
  const b = byKey.get(s.key);
  const m = ctx.osModel(slug, {hood: s.hood, cap: s.cap, m2: s.m2, key: s.key}, {promoTotal: s.promo, cost: s.marketing, open: s.open, sat: s.sat, existing: true, rent: b.rent});
  console.log(s.key, s.hood.slice(16), 'cap', s.cap, 'promo', s.promo, 'sat', s.sat, 'actual', s.actual, '| model rev', Math.round(m.revenue), 'fees', Math.round(m.fees), 'cogs', Math.round(m.cogs), 'wages', Math.round(m.wages), 'rent', m.rent, 'mkt', m.marketing, 'profit', Math.round(m.profit), 'cust', Math.round(m.customers));
  console.log('   actual stmt: rev', b.revenue, 'cogs', b.cogs, 'wages', b.wages, 'cust', b.customers);
  m.lines.forEach(l => console.log('    ', l.p.slice(13), 'u', l.units.toFixed(1), 'price', l.price.toFixed(2), 'cost', l.cost.toFixed(2), 'dem', l.demand));
}
console.log(JSON.stringify(P.openStore.types[slug] && {fee: P.openStore.types[slug].fee, fw: P.openStore.types[slug].feeWeekend, amt: P.openStore.types[slug].amt, noOrder: P.openStore.types[slug].noOrder, products: P.openStore.types[slug].products}));
