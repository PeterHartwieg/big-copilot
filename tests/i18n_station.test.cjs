// Station plurals stay English data; translated role words use game labels.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {spawnSync} = require('node:child_process');
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
    // A shared station can be idle while another role holds the site back.
    // Its read-out must also localize the fallback when its game name is absent.
    for(const station of [role, {...role, stationKey: null}, {...role, stationKey: 'ba:missing'}]){
      const output = c.hourGrid({...grid, roles: [grid.roles[0],
        {...station, shared: true, posts: week(2), staffed: week(30), onShift: week(2)}]}, 0);
      const noun = station.stationKey === stationKey ? label : c.tt('sp.hour.stations', 'stations');
      assert.ok(output.includes(c.tt('sp.hour.idle.roles', '{roles} idle', {roles: noun})), output);
      assert.doesNotMatch(output, /projection booths?/, output);
    }
    assert.equal(c.spIdleParts([{staff: 2, when: '09–10'}], c.tt('sp.idle.counters', 'counters')),
      c.tt('sp.idle.part', '{n} {noun} {when}', {n: 2, noun: 'counters', noun_name: c.tt('sp.idle.counters', 'counters'), when: '09–10'}));
  });
}

test('Python overstaffed alerts translate nested idle parts with station labels and counts', () => {
  const py = spawnSync(process.env.PYTHON || 'python', ['-c', `
import json
from ba_dashboard import _alerts, _hour_phrase, _sp_station_noun, _wire_msgs, tok
from tests.test_idle_week import business, EMPTY_SUPPLY
noun = _sp_station_noun({'noun': 'projection booths',
    'stationName': tok('ba:itemname_boothprojection', 'Projection Booth')})
rows = []
for n in [1, 2, 5, 1000000]:
    finding = {'kind': 'idle', 'key': business()['key'], 'site': 'Cinema',
        'week': {'spare': n, 'worth': 0, 'seen': 10, 'parts': [
            {'staff': n, 'noun': noun, 'when': _hour_phrase({1: {9, 10}})}]}}
    alerts = _alerts([business()], EMPTY_SUPPLY, [], [], [], [finding], [], 20, 0)
    [row] = [a for a in alerts['lines'] + alerts['minor']['rows'] if a['group'] == 'idlestaff']
    rows.append(_wire_msgs(row))
print(json.dumps(rows))`], {cwd: root});
  assert.equal(py.status, 0, py.stderr?.toString());
  const rows = JSON.parse(py.stdout.toString());
  for(const file of langs){
    const lang = file.slice(0, 2), c = loadBoard();
    const table = JSON.parse(fs.readFileSync(path.join(root, 'web/i18n', file)));
    const names = JSON.parse(fs.readFileSync(path.join(root, 'web/names', file)));
    c.ttSetTable(lang, table);
    c.stationNames = names;
    vm.runInContext('gnTable = stationNames;', c);
    rows.forEach((row, i) => {
      const n = [1, 2, 5, 1000000][i], label = names[stationKey];
      assert.equal(row.i18n.text[1].runs.m[0], 'sp.py.idle.part');
      const localized = c.localiseNames({alerts: [row]}).alerts[0];
      const part = lang === 'ko' ? `${label} ${n}개`
        : lang === 'ru' ? `${label}: ${n} ·` : `${label} ×${n}`;
      assert.ok(localized.text.includes(part), `${lang}: ${localized.text}`);
      assert.doesNotMatch(localized.text, /projection booths?/);
      assert.doesNotMatch(localized.text, /\{[^}]+\}|⟦/);
      assert.equal(c.enOf(localized, 'text'), row.text);
    });
  }
});

test('English role, header and idle sentences remain exactly unchanged', () => {
  const c = loadBoard();
  assert.equal(c.roleRead(role, 0, 0), '2 of 3 projection booths · 20/h');
  assert.equal(c.roleRead({...role, stationCount: 1}, 0, 0), '2 of 1 projection booth · 20/h');
  assert.equal(c.spHoursWhat({roles: [role], counters: 30}), '3 projection booths, 30 an hour between them');
  assert.equal(c.spIdleParts([{staff: 2, noun: role.noun, when: '09–10'}], 'counters'), '2 projection booths 09–10');
  assert.equal(role.noun, 'projection booths');
});
