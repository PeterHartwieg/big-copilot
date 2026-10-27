// The masthead's BUILD UNCHECKED flag names the newer of the save stamp and
// the running game. 0 and null are unknown. A link object that carries
// health.build and no runningBuild must not treat that number as the game.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {en} = require('./_i18n.cjs');
const {loadBoard, recordingDocument} = require('./_board.cjs');

const inert = new Proxy(function(){}, {
  get(_, key){
    if(key === Symbol.toPrimitive) return () => 0;
    if(key === 'length') return 0;
    return inert;
  },
  apply: () => inert,
  set: () => true,
});

function paint(link, meta, {live = false} = {}){
  const {document, element} = recordingDocument();
  let handlers = null;
  const window = new Proxy({
    LEDGER_SOURCE: {
      link: () => link,
      watch(h){ handlers = h; },
    },
    addEventListener(){},
  }, {
    get(target, key){ return key in target ? target[key] : inert[key]; },
    set: () => true,
  });
  const context = loadBoard({document, window}, live
    ? {edit: src => src.replace('const LIVE = /*__LIVE__*/false', 'const LIVE = true')}
    : {});
  const m = {save: 'Synthetic', day: 12, hour: 9, minute: 5, cityDate: '', locale: true,
    verifiedBuild: 3682, build: null, ...meta};
  context.__D = {meta: m, kpi: {vacant: 0, businesses: 1}, mods: null};
  vm.runInContext('D = __D', context);
  context.drawMast();
  context.drawFooter();
  return {context, element, handlers, html: element('clock').innerHTML, foot: element('footBuild').textContent};
}

test('BUILD UNCHECKED names the newer of the save and the running game', () => {
  const running = paint({runningBuild: 3690}, {build: 3670});
  assert.ok(running.html.includes(en('nav.mast.unchecked.text', {b: 3690})));
  assert.equal(running.foot, en('foot.build.both', {game: 3690, save: 3670}));

  const save = paint({runningBuild: 3680}, {build: 3690});
  assert.ok(save.html.includes(en('nav.mast.unchecked.text', {b: 3690})));
  assert.doesNotMatch(save.html, /3680/);

  const older = paint({runningBuild: 3670}, {build: 3670});
  assert.doesNotMatch(older.html, /UNCHECKED/);
});

test('0 and null are not a build, so neither half raises the flag', () => {
  for (const link of [null, {}, {runningBuild: 0}, {runningBuild: null}, {build: 4000}]) {
    for (const build of [0, null]) {
      const drawn = paint(link, {build});
      assert.doesNotMatch(drawn.html, /UNCHECKED/, JSON.stringify({link, build}));
      assert.doesNotMatch(drawn.html, /4000/);
      assert.doesNotMatch(drawn.foot, /4000/);
    }
  }
  const gameOnly = paint({runningBuild: 3690, build: 4000}, {build: 0});
  assert.ok(gameOnly.html.includes(en('nav.mast.unchecked.text', {b: 3690})));
  assert.doesNotMatch(gameOnly.html, /4000/);
  assert.equal(gameOnly.foot, en('foot.build.game', {game: 3690}));

  const saveOnly = paint({runningBuild: null, build: 4000}, {build: 3690});
  assert.ok(saveOnly.html.includes(en('nav.mast.unchecked.text', {b: 3690})));
  assert.equal(saveOnly.foot, en('foot.build.save', {save: 3690}));
});

test('a folder names only the save stamp', () => {
  const drawn = paint(null, {build: 3690});
  assert.ok(drawn.html.includes(en('nav.mast.unchecked.text', {b: 3690})));
  assert.equal(drawn.foot, en('foot.build', {n: 3690}));
  const quiet = paint(null, {build: 3670});
  assert.doesNotMatch(quiet.html, /UNCHECKED/);
  assert.equal(quiet.foot, en('foot.build', {n: 3670}));
});

test('a running-build repaint drops the live flash and keeps Stale', () => {
  const drawn = paint({runningBuild: 3690}, {build: 3670}, {live: true});
  const live = drawn.element('live');
  live.className = 'live just stale';
  live.title = 'a moment ago';
  drawn.handlers.runningBuild();
  assert.equal(live.className, 'live stale');
  assert.equal(live.title, 'a moment ago');
  assert.ok(drawn.element('clock').innerHTML.includes(en('nav.mast.unchecked.text', {b: 3690})));
});
