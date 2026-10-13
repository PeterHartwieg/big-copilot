// New feature badges retire: every badge id carries the date its feature
// shipped, and a badge shows only inside a window counted to the newest
// changelog entry the page ships with (docs/contributing.md, "New feature
// badges"). The day is always injected, so nothing here ages with the clock.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {between} = require('./_slice.cjs');

const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const markup = read('template/board.html');
const HELPER = between(markup, 'const featureDiscovery =', '/* --- changelog dialog');

/* The helper over a document holding `badges` (ids) and a changelog of `dates`. */
function discovery({badges = [], dates = [], saved = {}} = {}){
  const nodes = badges.map(id => ({dataset: {newFeature: id}, hidden: true}));
  const times = dates.map(d => ({getAttribute: () => d}));
  const context = vm.createContext({
    localStorage: {getItem: k => saved[k] ?? null, setItem(k, v){ saved[k] = String(v); }},
    document: {querySelectorAll: sel => sel.includes('time[datetime]') ? times : sel === '[data-new-feature]' ? nodes : []},
  });
  vm.runInContext(HELPER + '\nthis.featureDiscovery = featureDiscovery;', context);
  const fd = context.featureDiscovery;
  return {fd, shown: () => nodes.filter(n => !n.hidden).map(n => n.dataset.newFeature)};
}

const plus = (date, days) => new Date(Date.parse(date) + days * 864e5).toISOString().slice(0, 10);

test('a badge shows inside its window and retires at the end of it', () => {
  const {fd, shown} = discovery({badges: ['map', 'real-estate-buy']});
  const since = fd.since.map;
  fd.asOf(plus(since, fd.days - 1));
  assert.deepEqual(shown(), ['map', 'real-estate-buy']);
  fd.asOf(plus(since, fd.days));
  assert.deepEqual(shown(), ['real-estate-buy'], 'the window has passed for the map only');
  assert.equal(fd.isNew('map'), false);
  assert.equal(fd.isNew('real-estate-buy'), true);
});

test('the window is counted to the newest changelog date, not the clock or the first entry', () => {
  const since = '2026-09-12';
  assert.equal(since, discovery().fd.since.map);
  const fresh = discovery({badges: ['map'], dates: [plus(since, 3), plus(since, 10)]});
  fresh.fd.refresh();
  assert.deepEqual(fresh.shown(), ['map']);
  const old = discovery({badges: ['map'], dates: [plus(since, 3), plus(since, 60), plus(since, 10)]});
  old.fd.refresh();
  assert.deepEqual(old.shown(), [], 'the newest of the dates decides, wherever it is listed');
});

test('a visit hides a badge sooner, and is remembered', () => {
  const saved = {};
  const {fd, shown} = discovery({badges: ['open-store', 'factory-flow'], saved});
  fd.asOf(fd.since['factory-flow']);
  assert.deepEqual(shown(), ['open-store', 'factory-flow']);
  fd.visit('open-store');
  assert.deepEqual(shown(), ['factory-flow']);
  assert.equal(saved['ba_dash_feature_seen:open-store'], '1');
  const again = discovery({badges: ['open-store'], saved});
  again.fd.asOf(again.fd.since['open-store']);
  assert.deepEqual(again.shown(), [], 'a returning player keeps the visit');
});

test('without a date or a changelog the badge stays, so a missing date is noticed', () => {
  const {fd, shown} = discovery({badges: ['unregistered', 'map']});
  fd.refresh();
  assert.deepEqual(shown(), ['unregistered', 'map']);
  fd.asOf('2030-01-01');
  assert.deepEqual(shown(), ['unregistered']);
});

/* Every id a badge or an entry point uses, read from the sources that draw them. */
function badgeIds(){
  const ids = new Set();
  const grab = (text, re) => { for (const m of text.matchAll(re)) ids.add(m[1]); };
  for (const name of ['template/board.html', 'template/board.js', 'web/app.js', 'web/community.js',
    'web/map.js', 'ba_dashboard.py', 'build_web.py']) {
    const text = read(name);
    grab(text, /data-new-feature="([a-z0-9-]+)"/g);
    grab(text, /data-visit-feature="([a-z0-9-]+)"/g);
    grab(text, /newFeature\s*[:=]\s*["']([a-z0-9-]+)["']/g);
    grab(text, /featureDiscovery\.visit\(\s*["']([a-z0-9-]+)["']/g);
    if (name === 'ba_dashboard.py') grab(text, /feature="([a-z0-9-]+)"/g);   // _sf_out(..., feature=)
  }
  const viewNew = vm.runInNewContext('(' + between(read('template/board.js'), 'var VIEW_NEW = ', '};').slice('var VIEW_NEW = '.length) + '})');
  Object.values(viewNew).forEach(id => ids.add(id));
  const wiki = read('web/wiki.js');
  const wikiNew = vm.runInNewContext('(' + between(wiki, 'const WIKI_NEW = ', '};').slice('const WIKI_NEW = '.length) + '})');
  wikiNew.shelf.forEach(key => ids.add(`wiki-${key}`));
  wikiNew.topics.forEach(slug => ids.add(`wiki-topic-${slug}`));
  return ids;
}

test('every badge id has a ship date, and every date belongs to a badge', () => {
  const since = discovery().fd.since;
  const ids = badgeIds();
  assert.ok(ids.size >= 10, 'the sources were read');
  for (const id of ids) assert.match(since[id] || '', /^\d{4}-\d{2}-\d{2}$/, `${id} needs a date in NEW_SINCE`);
  for (const id of Object.keys(since)) assert.ok(ids.has(id), `${id} is dated but no badge uses it`);
});

test('every ship date is on or before the newest changelog entry', () => {
  const newest = JSON.parse(read('web/changelog.json')).map(e => e.date).sort().at(-1);
  for (const [id, date] of Object.entries(discovery().fd.since)) assert.ok(date <= newest, `${id}: ${date} is after ${newest}`);
});
