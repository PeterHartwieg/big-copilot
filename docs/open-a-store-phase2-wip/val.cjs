const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync(process.argv[2], 'utf8');
const code = src.split('const OS_KEY')[0].split('/* ---')[0] + src.slice(src.indexOf('const OS_KEY'));
const files = fs.readdirSync('.').filter(f => /^[A-Za-z0-9]{8}\.json$/.test(f));
const all = [];
for(const f of files){
  const P = JSON.parse(fs.readFileSync(f, 'utf8'));
  const ctx = {D: P, gameName: k => (P.names || {})[k] || '', icon: () => '', prettySlug: s => s, paybackMode: () => 'firm',
    premises: () => P.premises, localStorage: {getItem(){return null}, setItem(){}}, Map, Math, JSON, Number, Array, String, Object, Set, console};
  vm.createContext(ctx);
  vm.runInContext(code + '\n;this.osOwnRatio = osOwnRatio; this.osModel = osModel; this.osBestModel = osBestModel;', ctx);
  for(const slug of Object.keys(P.openStore.own || {})){
    const r = ctx.osOwnRatio(slug);
    if(!r) continue;
    r.rows.forEach(x => all.push({save: f.slice(0, 8), type: slug.replace('ba:businesstype_', ''), key: x.key, actual: x.actual, model: x.model, ratio: x.ratio}));
  }
}
const stats = v => { v = v.slice().sort((a, b) => a - b); const n = v.length, q = p => v[Math.min(n - 1, Math.floor(p * n))];
  const med = n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
  return {n, median: +med.toFixed(3), p10: +q(.1).toFixed(2), p25: +q(.25).toFixed(2), p75: +q(.75).toFixed(2), p90: +q(.9).toFixed(2),
    w15: Math.round(100 * v.filter(a => a >= .85 && a <= 1.15).length / n) + '%', w30: Math.round(100 * v.filter(a => a >= .7 && a <= 1.3).length / n) + '%'}; };
const pos = all.filter(x => x.actual > 0);
console.log('all', JSON.stringify(stats(pos.map(x => x.ratio))));
const byType = {}; pos.forEach(x => (byType[x.type] = byType[x.type] || []).push(x.ratio));
Object.entries(byType).sort().forEach(([t, v]) => console.log(t.padEnd(24), JSON.stringify(stats(v))));
const bySave = {}; pos.forEach(x => (bySave[x.save] = bySave[x.save] || []).push(x.ratio));
Object.entries(bySave).forEach(([t, v]) => console.log(t, JSON.stringify(stats(v))));
if(process.argv[3]) pos.sort((a,b)=>a.ratio-b.ratio).forEach(x => console.log(x.save, x.type.padEnd(22), x.key.padEnd(34), Math.round(x.actual), Math.round(x.model), x.ratio.toFixed(2)));
console.log('negative actual', all.length - pos.length);
