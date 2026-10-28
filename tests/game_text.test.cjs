// The browser keeps a player's own en.json only when it is the game's English:
// another language gives translated names and loses every recipe, station
// capacity and door cap, which are read from the English help pages.
// tests/test_english_text.py pins the same key and word on the Python side.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {en, enRe} = require('./_i18n.cjs');
// web/app.js run whole: gameTextLanguage() and dropForeignLocale() are called
// through window.BigCopilotShell, over the storage given it, and
// takeLocale() and resetLocale(), which drive the strip and the build,
// through its scope, with stand-ins for the note, the chip and the build.
const {loadShell} = require('./_shell.cjs');

const ENGLISH = {'ba:neighborhood_global': 'Global', menu_options_others_language: 'Language'};
const GERMAN = {'ba:neighborhood_global': 'Global', menu_options_others_language: 'Sprache'};

function setup(kept = '') {
  const storage = {ledger_locale: kept};
  const notes = [];
  const builds = [];
  const {shell, scope: context} = loadShell({globals: {localStorage: {
    getItem: (key) => (key in storage ? storage[key] : null),
    setItem(key, value) { storage[key] = value; },
    removeItem(key) { delete storage[key]; },
  }}});
  // The storage the page keeps, over the same table.
  context.stored.get = (key) => storage[key] || '';
  context.stored.set = (key, value) => { storage[key] = value; return true; };
  Object.assign(context, {
    // app.js hands note() its words as a function that writes them.
    note: (...args) => notes.push(args.map((a) => (typeof a === 'function' ? a() : a))),
    localeState() { context.painted = (context.painted || 0) + 1; },
    buildFrom(f) { builds.push(f); },
  });
  const api = {gameTextLanguage: shell.gameTextLanguage, dropForeignLocale: shell.dropForeignLocale,
    takeLocale: context.takeLocale, resetLocale: context.resetLocale};
  return {api, storage, notes, builds, context};
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
  assert.deepEqual(notes.at(-1).slice(0, 2), ['warn', en("app.locale.language", {"language":"German"})]);
  assert.match(notes.at(-1)[2], enRe("app.locale.english"));
});

test('a renamed foreign file still says it is not English', async () => {
  const {api, notes} = setup();
  await api.takeLocale(file('en (1).json', GERMAN));
  assert.equal(notes.at(-1)[1], en("app.locale.notenglish"));
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
