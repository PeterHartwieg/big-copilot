'use strict';

// Limiter keys are the IPv4 address or the IPv6 /64 (server/worker.mjs,
// rateIdentity). Vote hashes stay on the full address clientIp returns.

const {test, before} = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {vmWorkerSource} = require('./_community.cjs');

const SECRET = 'local-test-secret-not-production';
const ORIGIN = 'https://rate.test';
const BALLOT = [{id: 'test-idea-one', title: 'Test idea one', description: 'A synthetic idea.'}];
const PREFIX = '2001:db8:85a3::';

let script = '';

before(async () => {
  script = await vmWorkerSource(BALLOT);
});

function stubDb(seen) {
  return {
    prepare(sql) {
      const statement = {
        sql,
        bind(...args) {
          seen.push({sql, args});
          return statement;
        },
      };
      return statement;
    },
    batch: async (statements) => statements.map((statement) => (
      String(statement.sql).includes('community_votes') ? {results: [{n: 0}]} : {results: []}
    )),
  };
}

async function hmac(message) {
  const key = await crypto.webcrypto.subtle.importKey(
    'raw', new TextEncoder().encode(SECRET),
    {name: 'HMAC', hash: 'SHA-256'}, false, ['sign'],
  );
  const mac = await crypto.webcrypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Buffer.from(mac).toString('hex');
}

function loadWorker() {
  const events = [];
  const context = {
    Request, Response, URL, TextEncoder, TextDecoder,
    crypto: crypto.webcrypto,
    console: {error: (...args) => events.push(args), log() {}},
  };
  require('node:vm').runInNewContext(script, context);
  return {worker: context.worker, events};
}

async function send(headers, {method = 'GET', pathname = '/api/community/features', url, body, seen = []} = {}) {
  const keys = [];
  const {worker, events} = loadWorker();
  const env = {
    COMMUNITY_IP_SECRET: SECRET,
    COMMUNITY_DB: stubDb(seen),
    COMMUNITY_LIMITER: {limit: async ({key}) => { keys.push(key); return {success: true}; }},
    ASSETS: {fetch: async () => new Response('static fixture')},
  };
  const response = await worker.fetch(new Request(url || ORIGIN + pathname, {
    method,
    headers: {origin: ORIGIN, ...headers},
    body,
  }), env);
  const payload = await response.json();
  return {status: response.status, payload, key: keys[0] ?? null, calls: keys.length, events, seen};
}

async function assertIdentity(headers, identity, label) {
  const result = await send(headers);
  assert.equal(result.status, 200, `${label}: ${JSON.stringify(result.payload)} ${JSON.stringify(result.events)}`);
  assert.equal(result.calls, 1, label);
  assert.equal(result.key, await hmac('rate:' + identity), `${label}: limiter key`);
  return result.key;
}

test('an IPv4 address keeps its own limiter key', async () => {
  const one = await assertIdentity({'CF-Connecting-IP': '203.0.113.10'}, '203.0.113.10', 'ipv4');
  const two = await assertIdentity({'CF-Connecting-IP': '203.0.113.11'}, '203.0.113.11', 'other ipv4');
  assert.notEqual(one, two, 'two IPv4 addresses do not share a key');
  // A real IPv4 in CF-Connecting-IP wins over the IPv6 header.
  const alongside = await assertIdentity({
    'CF-Connecting-IP': '203.0.113.10',
    'CF-Connecting-IPv6': '2001:db8:85a3::1',
  }, '203.0.113.10', 'ipv4 beside an ipv6 header');
  assert.equal(alongside, one);
});

test('two IPv6 addresses in one /64 share a key and a different /64 does not', async () => {
  const full = '2001:0db8:85a3:0000:0000:8a2e:0370:7334';
  const shared = await assertIdentity({'CF-Connecting-IP': full}, PREFIX, 'full address');
  const same = await assertIdentity({'CF-Connecting-IP': '2001:db8:85a3:0:ffff:ffff:ffff:ffff'}, PREFIX, 'same prefix, other host bits');
  assert.equal(shared, same);
  const other = await assertIdentity({'CF-Connecting-IP': '2001:db8:85a3:1::1'}, '2001:db8:85a3:1::', 'next /64');
  assert.notEqual(shared, other);
  const link = await assertIdentity({'CF-Connecting-IP': 'fe80::1'}, 'fe80::', 'link-local /64');
  const linkHost = await assertIdentity({'CF-Connecting-IP': 'fe80::abcd:1'}, 'fe80::', 'same link-local /64');
  assert.equal(link, linkHost);
  assert.notEqual(link, shared);
});

test('compressed, uppercase, bracket and zone forms normalize to the /64', async () => {
  const expected = await hmac('rate:' + PREFIX);
  const forms = [
    '2001:db8:85a3::8a2e:370:7334',
    '2001:DB8:85A3::1',
    '2001:db8:85a3::',
    '[2001:db8:85a3::1]',
    '[2001:0db8:85a3:0000:0000:8a2e:0370:7334]',
    '2001:db8:85a3::1%eth0',
    '[2001:db8:85a3::1%25en0]',
  ];
  for (const form of forms) {
    assert.equal(await assertIdentity({'CF-Connecting-IP': form}, PREFIX, form), expected, form);
  }
  const compressedZero = await assertIdentity({'CF-Connecting-IP': '2001:0:0:0::5'}, '2001::', 'compressed leading prefix');
  const fullZero = await assertIdentity({'CF-Connecting-IP': '2001:0000:0000:0000:ffff::1'}, '2001::', 'full form of that prefix');
  assert.equal(compressedZero, fullZero);
  assert.notEqual(compressedZero, expected);
});

test('IPv4-mapped IPv6 normalizes to the embedded IPv4 and not to ::/64', async () => {
  const v4 = await assertIdentity({'CF-Connecting-IP': '203.0.113.10'}, '203.0.113.10', 'plain ipv4');
  const forms = [
    '::ffff:203.0.113.10',
    '::FFFF:203.0.113.10',
    '0:0:0:0:0:ffff:cb00:710a',
    '0000:0000:0000:0000:0000:ffff:203.0.113.10',
    '[::ffff:203.0.113.10]',
    '[::ffff:203.0.113.10%eth0]',
  ];
  for (const form of forms) assert.equal(await assertIdentity({'CF-Connecting-IP': form}, '203.0.113.10', form), v4, form);
  const other = await assertIdentity({'CF-Connecting-IP': '::ffff:203.0.113.11'}, '203.0.113.11', 'other mapped address');
  assert.notEqual(other, v4);
  const unspecified = await assertIdentity({'CF-Connecting-IP': '::1'}, '::', '::/64');
  assert.notEqual(unspecified, v4, 'mapped addresses do not fall into the ::/64 bucket');
});

test('pseudo-IPv4 mode still keys on the IPv6 header /64', async () => {
  const full = await assertIdentity({
    'CF-Connecting-IP': '240.0.0.1',
    'CF-Connecting-IPv6': '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
  }, PREFIX, 'pseudo with a full ipv6');
  const compressed = await assertIdentity({
    'CF-Connecting-IP': '255.1.2.3',
    'CF-Connecting-IPv6': '2001:db8:85a3::8a2e:370:1',
  }, PREFIX, 'a different pseudo address in the same /64');
  assert.equal(full, compressed, 'the 240.0.0.0/4 address is not the key');
  const other = await assertIdentity({
    'CF-Connecting-IP': '240.0.0.1',
    'CF-Connecting-IPv6': '2001:db8:85a3:1::1',
  }, '2001:db8:85a3:1::', 'same pseudo address, other /64');
  assert.notEqual(other, full);
  const mapped = await assertIdentity({
    'CF-Connecting-IP': '240.0.0.9',
    'CF-Connecting-IPv6': '::ffff:203.0.113.10',
  }, '203.0.113.10', 'pseudo header carrying an ipv4-mapped address');
  assert.equal(mapped, await hmac('rate:203.0.113.10'));
});

test('a missing client IP is rejected, including pseudo-IPv4 without the IPv6 header', async () => {
  const missing = await send({});
  assert.equal(missing.status, 400);
  assert.deepEqual(missing.payload, {error: 'Invalid request'});
  assert.equal(missing.calls, 0, 'no limiter call without an address');

  const loneV6 = await send({'CF-Connecting-IPv6': '2001:db8:85a3::1'});
  assert.equal(loneV6.status, 400);
  assert.equal(loneV6.calls, 0, 'the IPv6 header is used only for a pseudo-IPv4 address');

  const pseudo = await send({'CF-Connecting-IP': '240.0.0.1'});
  assert.equal(pseudo.status, 400);
  assert.deepEqual(pseudo.payload, {error: 'Invalid request'});
  assert.equal(pseudo.calls, 0);

  const local = await send({}, {url: 'http://localhost/api/community/features'});
  assert.equal(local.status, 200, JSON.stringify(local.payload));
  assert.equal(local.key, await hmac('rate:127.0.0.1'), 'localhost still falls back to its IPv4');
});

test('votes stay on the full address while the limiter key is the /64', async () => {
  const vote = async (ip) => {
    const seen = [];
    const result = await send({
      'CF-Connecting-IP': ip,
      'content-type': 'application/json',
    }, {
      method: 'POST',
      pathname: '/api/community/vote',
      body: JSON.stringify({featureId: 'test-idea-one'}),
      seen,
    });
    assert.equal(result.status, 200, JSON.stringify(result.payload));
    return {key: result.key, args: seen.flatMap((row) => row.args)};
  };
  const full = '2001:0db8:85a3:0000:0000:8a2e:0370:7334';
  const compressed = '2001:db8:85a3::ffff';
  const mapped = '::ffff:203.0.113.10';
  const a = await vote(full);
  const b = await vote(compressed);
  const c = await vote(mapped);
  assert.equal(a.key, b.key, 'one /64 shares a limiter key');
  assert.equal(a.key, await hmac('rate:' + PREFIX));
  assert.equal(c.key, await hmac('rate:203.0.113.10'));

  const hash = (ip) => hmac(`vote:test-idea-one:${ip}`);
  const hashA = await hash(full);
  const hashB = await hash(compressed);
  const hashMapped = await hash(mapped);
  assert.ok(a.args.includes(hashA), 'the vote hash is the full address');
  assert.ok(b.args.includes(hashB));
  assert.notEqual(hashA, hashB, 'two host addresses in one /64 are two voters');
  assert.equal(a.args.includes(await hash(PREFIX)), false, 'the vote hash is not the /64');
  assert.ok(c.args.includes(hashMapped), 'a mapped address votes as the raw header');
  assert.equal(c.args.includes(await hash('203.0.113.10')), false, 'mapping does not rewrite the vote');
});
