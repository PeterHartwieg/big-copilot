'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {loadBoard} = require('./_board.cjs');

const board = loadBoard();
const season = {season: 'summer', day: 4, length: 15, left: 11, demand: true};

function flagParts(mods){
  const html = board.mdFlag(mods);
  const match = /^<span class="flag md-flag" data-tip="([^"]*)">([^<]*)<\/span>$/.exec(html);
  assert.ok(match, `Expected exactly one escaped flag span: ${html}`);
  return {html, tip: match[1], text: match[2]};
}

test('missing or empty mods produce no flag', () => {
  for(const mods of [undefined, null, {}]) assert.equal(board.mdFlag(mods), '');
});

test('season names cover the calendar and preserve an unknown name', () => {
  for(const [id, name] of Object.entries({spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter'})){
    assert.equal(board.mdSeasonName(id), name);
  }
  assert.equal(board.mdSeasonName('unknown'), 'unknown');
});

test('combined mods share one flag with a sentence for each mod', () => {
  const {text, tip} = flagParts({economyExpansion: {settled: 40}, seasons: season, rivals: 49});
  assert.equal(text, 'MODDED: ECONOMY EXPANSION · SUMMER DAY 4/15 · 49 RIVALS');
  assert.match(tip, /Economy Expansion is running \(it last settled on day 40\)\./);
  assert.match(tip, /Alcware Seasons: Summer, day 4 of 15, 11 days left\./);
  assert.match(tip, /This save holds 49 rival companies; the game has 19 \(Dynamic Rivals\)\./);
});

// tt() picks the plural form by the param n, so n is the days left.
test('one remaining season day uses the singular', () => {
  const {text, tip} = flagParts({seasons: {...season, day: 14, left: 1}});
  assert.equal(text, 'MODDED: SUMMER DAY 14/15');
  assert.match(tip, /day 14 of 15, 1 day left\./);
  assert.doesNotMatch(tip, /1 days left/);
});

test('switched-off demand explains the unmodified sales ratios', () => {
  const {tip} = flagParts({seasons: {...season, demand: false}});
  assert.match(tip, /Its seasonal demand is switched off, so sales follow the game(?:'|&#39;|&#x27;)s own ratios\./);
  assert.ok(tip.includes('11 days left.'));
  assert.doesNotMatch(tip, /Open a store uses/);
});

test('switched-off demand also uses the singular for one day left', () => {
    const {tip} = flagParts({seasons: {...season, demand: false, day: 14, left: 1}});
    assert.match(tip, /day 14 of 15, 1 day left\./);
  });

test('retail records distinguish unreadable, one and multiple buildings', () => {
  const unreadable = flagParts({retailExpansion: {renovated: null}});
  assert.equal(unreadable.text, 'MODDED: RETAIL EXPANSION');
  assert.match(unreadable.tip, /its records could not be read/);
  assert.match(unreadable.tip, /capacity or floor area are left out/);
  const one = flagParts({retailExpansion: {renovated: 1}});
  assert.match(one.tip, /1 renovated building; its building capacity and floor area/);
  assert.doesNotMatch(one.tip, /1 renovated buildings/);
  assert.match(flagParts({retailExpansion: {renovated: 2}}).tip, /2 renovated buildings; their building capacity/);
});

test('hostile rival values are escaped in both text and tooltip attribute', () => {
  const {text, tip, html} = flagParts({rivals: '<b>"x&'});
  // A literal > is safe once < has been escaped; attr leaves it literal.
  assert.match(text, /&lt;b(?:>|&gt;)&quot;x&amp;/);
  assert.match(tip, /&lt;b(?:>|&gt;)&quot;x&amp;/);
  assert.doesNotMatch(html, /<b>|"x/);
});
