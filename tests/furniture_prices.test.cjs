'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {loadBoard} = require('./_board.cjs');
const prices = require('../ba_item_prices.json');

test('Sommerhus shopping prices distinguish one chair from ten chairs (#523)', () => {
  const board = loadBoard();
  const facts = {items: prices.items};
  const item = 'ba:itemname_armchair1';
  assert.equal(board.mcItemMoney(facts, item), '$130');
  assert.equal(board.mcItemMoney(facts, item, 10), '$1,300');
});
