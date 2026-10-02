// Station plurals stay English data; translated role words use game labels.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {loadBoard} = require('./_board.cjs');
const root = path.join(__dirname, '..');
const langs = fs.readdirSync(path.join(root, 'i18n')).filter(f => /^[a-z]{2}\.json$/.test(f));
const boardKeys = ['sp.hour.role', 'sp.hours.what.noun', 'sp.idle.part'];
const pythonKeys = ['sp.py.limit.station', 'sp.py.limit.station.first', 'sp.py.noun.station',
  'sp.py.fix.role.post', 'sp.py.fix.station.staff', 'sp.py.limit.station.staff', 'sp.py.limit.station.staff.first'];
const stationKey = 'ba:itemname_boothprojection';
const week = value => Array.from({length: 7}, () => Array(24).fill(value));
const role = {stationKey, stationCount: 3, noun: 'projection booths', many: 'projection booths',
  one: 'projection booth', posts: [[2]], staffed: [[20]]};

test('every language uses game-name placeholders for station words', () => {
  assert.equal(langs.length, 7);
  for(const file of langs){
    const table = JSON.parse(fs.readFileSync(path.join(root, 'i18n', file)));
    for(const key of [...boardKeys, ...pythonKeys]){
      assert.equal(typeof table[key], 'string', `${file}: ${key}`);
      assert.doesNotMatch(table[key], /\{(?:noun|station|stations)(?::[^}]*)?\}/, `${file}: ${key}`);
      assert.ok(table[key].includes(boardKeys.includes(key) ? '{noun_name}' : '{station_name}'), `${file}: ${key}`);
    }
  }
});

for(const file of langs){
  const lang = file.slice(0, 2);
  test(`${lang}: a cinema's hourly read, header and idle line use the game label`, () => {
    const c = loadBoard();
    const table = JSON.parse(fs.readFileSync(path.join(root, 'web/i18n', file)));
    const names = JSON.parse(fs.readFileSync(path.join(root, 'web/names', file)));
    const label = names[stationKey];
    assert.ok(label, `${lang}: game name exists`);
    c.ttSetTable(lang, table);
    c.stationNames = names;
    vm.runInContext('gnTable = stationNames;', c);
    const grid = {roles: [{...role, posts: week(2), staffed: week(20), onShift: week(2)}],
      counters: 30, peak: 10, customers: week(10), effective: week(20), thin: Array(7).fill(false)};
    for(const output of [c.roleRead(role, 0, 0), c.spHoursWhat(grid), c.hourGrid(grid, 0)]){
      assert.ok(output.includes(label), output);
      assert.doesNotMatch(output, /projection booths?/, output);
    }
    // Python's noun Msg follows the same localization path as a real payload.
    const part = {staff: 2, noun: role.noun, when: '09–10',
      i18n: {noun: ['sp.py.noun.station', {stations: role.noun,
        station_name: `⟦${stationKey}|Projection Booth⟧`}]}};
    const localized = c.localiseNames({parts: [part]});
    const idle = c.spIdleParts(localized.parts, 'counters');
    assert.ok(idle.includes(label), idle);
    assert.doesNotMatch(idle, /projection booths?/, idle);
    assert.equal(c.enOf(localized.parts[0], 'noun'), role.noun);
    for(const missing of [{...role, stationKey: null}, {...role, stationKey: 'ba:missing'}]){
      assert.doesNotMatch(c.roleRead(missing, 0, 0), /projection booths?/);
      assert.doesNotMatch(c.spHoursWhat({roles: [missing], counters: 30}), /projection booths?/);
    }
    assert.equal(c.spIdleParts([{staff: 2, when: '09–10'}], c.tt('sp.idle.counters', 'counters')),
      c.tt('sp.idle.part', '{n} {noun} {when}', {n: 2, noun: 'counters', noun_name: c.tt('sp.idle.counters', 'counters'), when: '09–10'}));
  });
}

test('English role, header and idle sentences remain exactly unchanged', () => {
  const c = loadBoard();
  assert.equal(c.roleRead(role, 0, 0), '2 of 3 projection booths · 20/h');
  assert.equal(c.roleRead({...role, stationCount: 1}, 0, 0), '2 of 1 projection booth · 20/h');
  assert.equal(c.spHoursWhat({roles: [role], counters: 30}), '3 projection booths, 30 an hour between them');
  assert.equal(c.spIdleParts([{staff: 2, noun: role.noun, when: '09–10'}], 'counters'), '2 projection booths 09–10');
  assert.equal(role.noun, 'projection booths');
});
