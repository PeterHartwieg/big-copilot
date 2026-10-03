// Temporary draft-PR probe for CI sharding and failure propagation. Do not merge.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('temporary CI probe: newly discovered suites receive the assembled site', () => {
  assert.ok(fs.existsSync(path.join(__dirname, '../web/index.html')));
});
