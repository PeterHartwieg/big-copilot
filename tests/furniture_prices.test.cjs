'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {loadBoard} = require('./_board.cjs');
const prices = require('../ba_item_prices.json');
const rules = require('../ba_store_rules.json');

test('Sommerhus shopping prices distinguish one chair from ten chairs (#523)', () => {
  const board = loadBoard();
  const facts = {items: prices.items};
  const item = 'ba:itemname_armchair1';
  assert.equal(board.mcItemMoney(facts, item), '$130');
  assert.equal(board.mcItemMoney(facts, item, 10), '$1,300');
});

test('the Open a store shopping rows show one armchair at $130 and ten at $1,300 (#523)', () => {
  const board = loadBoard();
  const item = 'ba:itemname_armchair1', vendor = rules.furniture[item].v[0];
  // The openStore payload's item and vendor records, as _open_store() writes them.
  const openStore = {items: {[item]: {p: prices.items[item].p, v: [vendor]}},
    vendors: {[vendor]: rules.vendors[vendor]}, game: {installFee: 586, delivery: 250}, hoods: {}};
  vm.runInContext(`D = {openStore: ${JSON.stringify(openStore)}}`, board);
  const b = {key: 'test:street#1', hood: 'test:hood', m2: 10, status: 'vacant', address: '1 Test St', deposit: 0};
  const out = {lines: [[item, 10, 'req', 'seat']]};
  const inv = {fee: 5860, deposit: 0, firm: 7160, self: 1550, items: 10};
  const row = html => html.match(/<tr><td class="l">[^<]*Armchair 1<\/td>.*?<\/tr>/)[0]
    .match(/<td[^>]*>([^<]*)<\/td>/g).map(td => td.replace(/<[^>]+>/g, ''));
  // Installation firm: Item, Why (tags), Qty, Each, Total.
  assert.deepEqual(row(board.osFirmHtml(b, out, inv)).slice(-3), ['10', '$130', '$1,300']);
  // Shopping yourself: the line is "10 × Armchair 1" and its total.
  const self = row(board.osSelfHtml(b, out, inv));
  assert.equal(self[0], '10 × Armchair 1');
  assert.equal(self.at(-1), '$1,300');
});
