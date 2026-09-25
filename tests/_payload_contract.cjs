// The key contract for hand-built board payloads (`D`).
//
// Most Node suites build `D` by hand rather than running extract(), so a key
// renamed in ba_dashboard.py would leave them passing against a name Python no
// longer writes. assertPayloadShape(D, label) checks that the fixture's
// top-level keys, and the keys of every entry in D.businesses, are among the
// ones a real extract() payload carries: the union over the committed
// snapshots in tests/fixtures/payload_snapshot/, which test_payload_snapshot.py
// keeps in step with extract(). It checks names only, never values or depth;
// a fixture may leave out anything it does not need.
//
// A real key the snapshots cannot show -- one the board adds on the client, or
// one Python writes only in a state the snapshot fixtures do not reach -- is
// listed in EXTRA_KEYS, one by one with where it comes from; never widen the
// check any other way.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SNAPSHOTS = path.join(__dirname, 'fixtures', 'payload_snapshot');

// Real keys absent from every snapshot, each with its source.
const EXTRA_KEYS = {
  top: {},
  business: {
    // _alerts() writes it only on a retail or office site in its first days
    // that has booked no revenue yet (the not-trading finding); the snapshot
    // companies have none.
    notTrading: 'ba_dashboard.py _alerts(), b["notTrading"] = failed',
  },
};

let known = null;
function payloadKeys() {
  if(known) return known;
  const top = new Set(Object.keys(EXTRA_KEYS.top));
  const business = new Set(Object.keys(EXTRA_KEYS.business));
  const files = fs.readdirSync(SNAPSHOTS).filter(f => f.endsWith('.json'));
  assert.ok(files.length, `no payload snapshots in ${SNAPSHOTS}`);
  for(const file of files){
    const payload = JSON.parse(fs.readFileSync(path.join(SNAPSHOTS, file), 'utf8'));
    Object.keys(payload).forEach(k => top.add(k));
    for(const b of payload.businesses || []) Object.keys(b).forEach(k => business.add(k));
  }
  known = {top, business};
  return known;
}

function assertPayloadShape(D, label) {
  const {top, business} = payloadKeys();
  const where = `${label}: the hand-built D`;
  assert.ok(D && typeof D === 'object', `${where} is not an object`);
  const unknownTop = Object.keys(D).filter(k => !top.has(k));
  assert.deepEqual(unknownTop, [], `${where} has top-level keys no extract() payload carries: ` +
    `${unknownTop.join(', ')}. Rename them to the payload's (tests/fixtures/payload_snapshot/), ` +
    'or list a real key the snapshots miss in EXTRA_KEYS in tests/_payload_contract.cjs with its reason.');
  (D.businesses || []).forEach((b, i) => {
    const unknown = Object.keys(b || {}).filter(k => !business.has(k));
    assert.deepEqual(unknown, [], `${where}.businesses[${i}] has keys no extract() business carries: ` +
      `${unknown.join(', ')}. Rename them to the payload's, or list a client-side key in ` +
      'EXTRA_KEYS in tests/_payload_contract.cjs with its reason.');
  });
}

module.exports = {assertPayloadShape, payloadKeys, EXTRA_KEYS};
