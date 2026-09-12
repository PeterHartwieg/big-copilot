const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'web', 'app.js'), 'utf8');
const help = source.slice(source.indexOf('  function savePlatform('), source.indexOf('  const stored ='));

function setup(nav, remembered = '', missing = false, blockedStorage = false) {
  const nodes = Object.fromEntries(['savePlatform', 'savePath', 'savePathRow', 'savePathCopy',
    'saveLocationHint', 'localeWindows', 'localeOther'].map(id => [id, {
      value: '', textContent: '', hidden: false, attrs: {},
      setAttribute(name, value) { this.attrs[name] = value; },
      addEventListener(name, handler) { this[name] = handler; },
    }]));
  const saved = {};
  const context = vm.createContext({navigator: nav, $: id => missing ? null : nodes[id],
    stored: {get: () => remembered}, localStorage: {setItem(key, value) {
      if (blockedStorage) throw new Error('Storage blocked');
      saved[key] = value;
    }}});
  vm.runInContext(help + '\nwireSaveLocation();', context);
  return {nodes, saved};
}

test('old cached markup without platform help does not abort startup', () => {
  assert.doesNotThrow(() => setup({platform: 'Win32'}, '', true));
});

test('desktop paths do not get mistaken for mobile paths', () => {
  for (const [nav, expected] of [
    [{platform: 'Win32', maxTouchPoints: 10, userAgentData: {platform: 'Windows'}}, 'windows'],
    [{platform: 'MacIntel', maxTouchPoints: 0}, 'mac'],
    [{platform: 'MacIntel', maxTouchPoints: 5}, 'other'],
    [{platform: 'Linux armv8l', userAgent: 'Mozilla Android'}, 'other'],
    [{platform: 'Linux x86_64'}, 'other'],
    [{platform: '', userAgent: 'Mozilla/5.0 (Windows NT 10.0)'}, 'windows'],
    [{}, 'other'],
  ]) {
    const {nodes} = setup(nav);
    assert.equal(nodes.savePlatform.value, expected);
    assert.equal(nodes.savePathRow.hidden, expected === 'other');
    assert.equal(nodes.localeWindows.hidden, expected !== 'windows');
  }
});

test('manual Mac selection updates the copy target and survives the next visit', () => {
  const {nodes, saved} = setup({platform: 'Win32'});
  nodes.savePlatform.value = 'mac';
  nodes.savePlatform.change();
  assert.equal(nodes.savePath.textContent,
    '~/Library/Application Support/com.Hovgaard-Games.Big-Ambitions/SaveGames/Big Ambitions/');
  assert.match(nodes.saveLocationHint.textContent, /Cmd\+Shift\+G/);
  assert.equal(nodes.localeWindows.hidden, true);
  assert.equal(nodes.localeOther.hidden, false);
  assert.equal(setup({platform: 'Win32'}, saved.ledger_save_platform).nodes.savePlatform.value, 'mac');
});

test('invalid remembered choices fall back to detection and blocked storage does not break selection', () => {
  const {nodes} = setup({platform: 'MacIntel'}, 'invalid', false, true);
  assert.equal(nodes.savePlatform.value, 'mac');
  nodes.savePlatform.value = 'windows';
  assert.doesNotThrow(() => nodes.savePlatform.change());
  assert.match(nodes.savePath.textContent, /^%USERPROFILE%\\AppData\\LocalLow/);
});
