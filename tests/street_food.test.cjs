'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {loadBoard, recordingDocument} = require('./_board.cjs');

test('fleet profit is shown once and does not become negative company costs', () => {
  const b = loadBoard();
  vm.runInContext('D = {businesses: [], daily: [{day: 4, profit: 603, business: 0, parking: 0, streetFood: {revenue: 1000, cogs: 200, wages: 120, parking: 30, otherCosts: 47, adjustment: 0, profit: 603}}]}', b);
  const html = b.outsideRows(8);
  assert.match(html, /Street Food/);
  assert.match(html, /Company profit/);
  assert.doesNotMatch(html, /Company costs outside sites/);
  assert.match(html, /crew wages/);
  assert.equal((html.match(/603/g) || []).length, 2);
});

test('Results remains useful for a company that only operates food vehicles', () => {
  const {document, element} = recordingDocument();
  const b = loadBoard({document});
  vm.runInContext('D = {businesses: [], chains: [], daily: [{day: 4, profit: 75, streetFood: {profit: 75}}]}; view = "pnl";', b);
  b.drawPortfolio();
  assert.match(element('portfolio').innerHTML, /Street Food/);
  assert.match(element('portfolio').innerHTML, /Company profit/);
});

test('missing live provider explains the staffing and tax limits', () => {
  const b = loadBoard();
  assert.match(b.mdFlag({streetFood: {status: 'stale'}}), /tax estimates and reassignment/);
  assert.match(b.reTaxPanel({tax: {unavailable: 'streetFood'}}, false), /Tax estimates are unavailable/);
});

test('restricted suppliers cannot produce import edits or production reductions', () => {
  const b = loadBoard();
  vm.runInContext(`D = {meta: {character: "test"}, businesses: [{key: "warehouse#1", lines: []}],
    supply: {streetFoodRestricted: [0], facts: {0: {food: {imp: true, st: "surplus", setTo: 0, use: 0}}},
      imports: [], shops: [], factories: {sites: [{s: 0, streetFoodRestricted: true, lines: [], needs: [], unnamed: []}]}}};`, b);
  const data = b.supplyChecklistRows();
  assert.equal(data.importRows.length, 0);
  assert.equal(data.lines.length, 0);
  assert.equal(data.rows.length, 0);
  assert.equal(data.f.sites.length, 0);
});
