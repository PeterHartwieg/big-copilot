// The browser keeps a player's own en.json only when it is the game's English:
// another language gives translated names and loses every recipe, station
// capacity and door cap, which are read from the English help pages.
// tests/test_english_text.py pins the same key and word on the Python side.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'web', 'app.js'), 'utf8');
const consts = source.slice(source.indexOf('  const LANGUAGE_KEY ='), source.indexOf('  const DB ='));
const helpers = source.slice(source.indexOf('  function gameTextLanguage('), source.indexOf('  async function takeLocale('));
// The page's tt(), which app.js writes every word through.
const i18n = fs.readFileSync(path.join(__dirname, '..', 'web', 'i18n.js'), 'utf8');
const take = source.slice(source.indexOf('  async function takeLocale('), source.indexOf('  /* --- what the board asks for'));

const ENGLISH = {'ba:neighborhood_global': 'Global', menu_options_others_language: 'Language'};
const GERMAN = {'ba:neighborhood_global': 'Global', menu_options_others_language: 'Sprache'};

function setup(kept = '') {
  const storage = {ledger_locale: kept};
  const notes = [];
  const context = vm.createContext({
    Intl, JSON, String,
    LOCALE_KEY: 'ledger_locale',
    localStorage: {removeItem(key) { delete storage[key]; }},
    stored: {get: (key) => storage[key] || '', set: (key, value) => { storage[key] = value; return true; }},
    // app.js hands note() its words as a function that writes them.
    note: (...args) => notes.push(args.map((a) => (typeof a === 'function' ? a() : a))),
    localeState() { context.painted = (context.painted || 0) + 1; },
    buildFrom(f) { builds.push(f); },
    sourceGen: 0, lastFile: null, lastFileGen: -1,
  });
  const builds = [];
  vm.runInContext(i18n, context);
  vm.runInContext(consts + helpers + take + '\nthis.api = {gameTextLanguage, dropForeignLocale, takeLocale, resetLocale};', context);
  return {api: context.api, storage, notes, builds, context};
}

const file = (name, table) => ({name, text: async () => JSON.stringify(table)});

test('English and the built-in text pass; another language is named from its file', () => {
  const {api} = setup();
  assert.equal(api.gameTextLanguage(ENGLISH, 'en.json'), null);
  assert.equal(api.gameTextLanguage({'ba:neighborhood_global': 'Global'}, 'gametext.json'), null);
  assert.equal(api.gameTextLanguage(GERMAN, 'de.json'), 'German');
  assert.equal(api.gameTextLanguage(GERMAN, 'my text.json'), '');
  assert.equal(api.gameTextLanguage(GERMAN, 'en.json'), '');  // renamed, so the name says nothing
  assert.equal(api.gameTextLanguage(GERMAN, 'zh-cn.json'), 'Chinese (China)');
});

test('a German file is refused with a note and never stored', async () => {
  const {api, storage, notes} = setup();
  await api.takeLocale(file('de.json', GERMAN));
  assert.equal(storage.ledger_locale, '');
  assert.deepEqual(notes.at(-1).slice(0, 2), ['warn', "That is the game's German text."]);
  assert.match(notes.at(-1)[2], /Choose en\.json/);
});

test('a renamed foreign file still says it is not English', async () => {
  const {api, notes} = setup();
  await api.takeLocale(file('en (1).json', GERMAN));
  assert.equal(notes.at(-1)[1], "That is not the game's English text.");
});

test('the English file is stored as before', async () => {
  const {api, storage} = setup();
  await api.takeLocale(file('en.json', ENGLISH));
  assert.deepEqual(JSON.parse(storage.ledger_locale), ENGLISH);
});

test('a foreign file kept before the check is dropped; English and junk are left alone', () => {
  for (const [kept, left] of [[JSON.stringify(GERMAN), false], [JSON.stringify(ENGLISH), true], ['{not json', true]]) {
    const {api, storage} = setup(kept);
    api.dropForeignLocale();
    assert.equal('ledger_locale' in storage, left, kept);
  }
});

// WB-4 in #109: a remembered en.json used to win over the shipped text for
// good. Using the built-in text again drops it and reads the board again.
test('the built-in text can be put back, and the board is read without the kept file', () => {
  const {api, storage, builds, context} = setup(JSON.stringify(ENGLISH));
  const save = {name: 'x.hsg'};
  context.lastFile = save; context.lastFileGen = 0;
  api.resetLocale();
  assert.equal('ledger_locale' in storage, false);
  assert.equal(context.painted, 1, 'the chip says built in again');
  assert.deepEqual(builds, [save]);
});
