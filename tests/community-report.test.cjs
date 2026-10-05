'use strict';

/**
 * The bug report route, POST /api/report (docs/bug-report-scope.md).
 *
 * Runs the real worker (server/worker.mjs) in Miniflare with an in-memory R2
 * bucket, the report limiter as wrangler.jsonc declares it, a stubbed ASSETS
 * binding and an outbound service in place of GitHub, so no test ever reaches
 * api.github.com. The contract:
 *
 *   multipart/form-data: report (JSON), save (optional file), details (optional text)
 *   -> 201 {issue: {number, url}}; attachments in R2 under one random folder;
 *      one issue, labelled bug-report, that holds only the public fields.
 *   GitHub failing -> 503, and the folder is gone again.
 *
 * The last block runs the worker source in a VM with synthetic bindings, for
 * the R2 failures Miniflare cannot produce and the console events they write.
 */

const {test, before, after, beforeEach} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {Miniflare, convertV4MiniflareOptions, Response: MfResponse} = require('miniflare');

const ROOT = path.join(__dirname, '..');
const WORKER_PATH = path.join(ROOT, 'server', 'worker.mjs');
const TOKEN = 'test-token-not-a-github-token';
const MAX_BYTES = 8 * 1024 * 1024;
const ISSUE_URL = 'https://github.com/PeterHartwieg/big-copilot/issues/';
// What the private parts carry in these tests: none of it may reach GitHub.
const TRACE_SENTINEL = 'Traceback private-trace-sentinel /save/Alice Smith-live.hsg';
const SAVE_SENTINEL = 'private-save-bytes-sentinel';

let mf = null;
let bucket = null;
let workerScript = '';
let ipCounter = 0;
// What the stand-in for GitHub saw, and how it answers the next call.
const github = {calls: [], answer: null};

async function bundleWorker() {
  const result = await require('esbuild').build({
    entryPoints: [WORKER_PATH],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
  });
  return result.outputFiles[0].text;
}

function limiterFromConfig(name) {
  const config = fs.readFileSync(path.join(ROOT, 'wrangler.jsonc'), 'utf8');
  const m = new RegExp(`"name":\\s*"${name}",\\s*"namespace_id":\\s*"(\\d+)",\\s*"simple":\\s*\\{\\s*"limit":\\s*(\\d+),\\s*"period":\\s*(\\d+)`).exec(config);
  assert.ok(m, `wrangler.jsonc declares ${name}`);
  return {namespace_id: m[1], simple: {limit: Number(m[2]), period: Number(m[3])}};
}

function baseOptions() {
  return {
    modules: true,
    script: workerScript,
    compatibilityDate: '2026-09-01',
    d1Databases: ['COMMUNITY_DB'],
    r2Buckets: ['REPORTS'],
    bindings: {COMMUNITY_IP_SECRET: 'local-test-secret-not-production', GITHUB_REPORT_TOKEN: TOKEN},
    ratelimits: {
      COMMUNITY_LIMITER: {namespace_id: '1001', simple: {limit: 120, period: 60}},
      PRESENCE_LIMITER: {namespace_id: '1002', simple: {limit: 20, period: 60}},
      REPORT_LIMITER: limiterFromConfig('REPORT_LIMITER'),
    },
    serviceBindings: {ASSETS: async () => new MfResponse('static fixture')},
    outboundService: async (request) => {
      const call = {url: request.url, method: request.method, headers: Object.fromEntries(request.headers), body: await request.text()};
      github.calls.push(call);
      const answer = github.answer || defaultAnswer;
      return answer(call);
    },
  };
}

let issueNumber = 100;
function defaultAnswer() {
  issueNumber += 1;
  return new MfResponse(JSON.stringify({number: issueNumber, html_url: ISSUE_URL + issueNumber}), {
    status: 201, headers: {'content-type': 'application/json'},
  });
}

const nextIp = () => { ipCounter += 1; return `10.88.${Math.floor(ipCounter / 250) % 256}.${(ipCounter % 250) + 1}`; };
const ORIGIN = 'https://report.test';

function reportJson(overrides = {}) {
  return JSON.stringify(Object.assign({
    text: 'The board stopped at Reading the save.\nIt worked yesterday.',
    siteBuild: '0123456789',
    gameBuild: 3682,
    browser: 'chrome',
    source: 'folder',
  }, overrides));
}

// A multipart body as the browser's FormData writes it.
async function multipart(fields) {
  const form = new FormData();
  for (const [name, value, filename] of fields) {
    if (filename) form.append(name, value, filename); else form.append(name, value);
  }
  const request = new Request('https://encode.test/', {method: 'POST', body: form});
  return {body: Buffer.from(await request.arrayBuffer()), type: request.headers.get('content-type')};
}

async function send(fields, {ip = nextIp(), origin = ORIGIN, instance = mf, headers = {}} = {}) {
  const {body, type} = await multipart(fields);
  return instance.dispatchFetch(`${ORIGIN}/api/report`, {
    method: 'POST',
    headers: Object.assign({origin, 'content-type': type, 'content-length': String(body.length), 'CF-Connecting-IP': ip}, headers),
    body,
  });
}

async function objects(target = bucket) {
  return (await target.list()).objects.map((o) => o.key).sort();
}

async function expectStatus(res, status, label) {
  const text = await res.text();
  assert.equal(res.status, status, `${label}: ${text}`);
  assert.match(res.headers.get('content-type') || '', /application\/json/);
  return JSON.parse(text);
}

before(async () => {
  workerScript = await bundleWorker();
  mf = new Miniflare(convertV4MiniflareOptions(baseOptions()));
  await mf.ready;
  bucket = await mf.getR2Bucket('REPORTS');
});

beforeEach(async () => {
  github.calls = [];
  github.answer = null;
  const keys = await objects();
  if (keys.length) await bucket.delete(keys);
});

after(async () => { if (mf) await mf.dispose(); });

/* ------------------------------------------------------------- the happy path */

test('report: a save and details go to R2 in one folder; the issue holds only the public fields', async () => {
  const save = new Blob([SAVE_SENTINEL, new Uint8Array([0, 1, 2, 255])]); // not gzip: stored as it came
  const details = JSON.stringify({trace: TRACE_SENTINEL, settings: {language: 'en', theme: 'dark', platform: 'windows'}});
  const res = await send([
    ['report', reportJson({error: 'KeyError in _staffing (ba_dashboard.py line 4120)'})],
    ['details', details],
    ['save', save, 'save.hsg'],
  ]);
  const body = await expectStatus(res, 201, 'report with attachments');
  assert.equal(body.issue.url, ISSUE_URL + body.issue.number);
  assert.equal(res.headers.get('cache-control'), 'no-store');

  const keys = await objects();
  assert.equal(keys.length, 4, keys.join(', '));
  const folder = keys[0].split('/')[0];
  assert.match(folder, /^\d{4}-\d{2}-\d{2}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.deepEqual(keys, [`${folder}/details.json`, `${folder}/issue.json`, `${folder}/report.json`, `${folder}/save.hsg`]);
  assert.deepEqual(JSON.parse(await (await bucket.get(`${folder}/issue.json`)).text()), body.issue, "the folder knows its issue, so the sweep keeps it");
  const stored = await bucket.get(`${folder}/save.hsg`);
  assert.deepEqual(Buffer.from(await stored.arrayBuffer()), Buffer.from(await save.arrayBuffer()), 'the save is stored byte for byte');
  assert.equal(await (await bucket.get(`${folder}/details.json`)).text(), details);
  const meta = JSON.parse(await (await bucket.get(`${folder}/report.json`)).text());
  assert.deepEqual(Object.keys(meta).sort(), ['browser', 'details', 'gameBuild', 'receivedAt', 'save', 'siteBuild', 'source']);
  assert.equal(meta.save, true);
  assert.equal(JSON.stringify(meta).includes('worked yesterday'), false, "the player's text goes to the issue only");

  assert.equal(github.calls.length, 1);
  const [call] = github.calls;
  assert.equal(call.method, 'POST');
  assert.equal(call.url, 'https://api.github.com/repos/PeterHartwieg/big-copilot/issues');
  assert.equal(call.headers.authorization, `Bearer ${TOKEN}`);
  const issue = JSON.parse(call.body);
  assert.deepEqual(Object.keys(issue).sort(), ['body', 'labels', 'title']);
  assert.deepEqual(issue.labels, ['bug-report']);
  assert.equal(issue.title, 'Bug report: The board stopped at Reading the save.');
  assert.match(issue.body, /```text\nThe board stopped at Reading the save\.\nIt worked yesterday\.\n```/);
  assert.match(issue.body, /\| Site build \| `0123456789` \|/);
  assert.match(issue.body, /\| Game build \| 3682 \|/);
  assert.match(issue.body, /\| Browser \| Chrome \|/);
  assert.match(issue.body, /\| Source \| Save folder \|/);
  assert.match(issue.body, /\| Save attached \| yes \|/);
  assert.ok(issue.body.includes(`| Private folder | \`${folder}\` |`), 'the issue names the folder');
  assert.match(issue.body, /### Error\n\n```text\nKeyError in _staffing \(ba_dashboard\.py line 4120\)\n```/);
  for (const secret of ['private-trace-sentinel', 'Alice', SAVE_SENTINEL, 'windows', 'dark', TOKEN]) {
    assert.equal(issue.body.includes(secret) || issue.title.includes(secret), false, `the issue must not hold ${secret}`);
  }
});

test('report: with nothing attached nothing is stored, and the issue says so', async () => {
  const body = await expectStatus(await send([['report', reportJson({gameBuild: null, source: 'none'})]]), 201, 'bare report');
  assert.ok(body.issue.number > 0);
  assert.deepEqual(await objects(), []);
  const issue = JSON.parse(github.calls[0].body);
  assert.match(issue.body, /\| Game build \| unknown \|/);
  assert.match(issue.body, /\| Save attached \| no \|/);
  assert.match(issue.body, /\| Technical details attached \| no \|/);
  assert.doesNotMatch(issue.body, /Private folder|### Error/);
});

test('report: the error line is public only with the details, and only as a class and a place in the code', async () => {
  // An error without the details part is refused: the box was not ticked.
  await expectStatus(await send([['report', reportJson({error: 'KeyError'})]]), 400, 'error without details');
  assert.equal(github.calls.length, 0);
  // A message, a path, a quote or bytes: anything but the built shape is refused.
  for (const error of [
    'KeyError: shelf',
    "FileNotFoundError: '/save/Alice Smith-live.hsg'",
    'ValueError in body (ba_save.py line 255) Alice',
    'ValueError in Alice Smith (ba_save.py line 255)',
    'ValueError in body (/save/Alice.hsg line 1)',
    'ValueError 41 00 6c 00',
    'SyntaxError in onmessage (app.js line 340)',
    'valueError',
  ]) {
    await expectStatus(await send([['report', reportJson({error})], ['details', '{"trace":"x"}']]), 400, error);
  }
  assert.equal(github.calls.length, 0);
  for (const error of ['KeyError', 'KeyError in _staffing (ba_dashboard.py line 4120)', 'ImportError in <module> (x.py line 3)']) {
    github.calls = [];
    await expectStatus(await send([['report', reportJson({error})], ['details', '{"trace":"x"}']]), 201, error);
    assert.ok(JSON.parse(github.calls[0].body).body.includes('```text\n' + error + '\n```'));
  }
});

test('report: player text is fenced, so markup, links and mentions do not render', async () => {
  const text = 'Look ```` here @PeterHartwieg ![x](https://tracker.example/p.png) <img src=x>';
  await expectStatus(await send([['report', reportJson({text})]]), 201, 'fenced text');
  const issue = JSON.parse(github.calls[0].body);
  assert.ok(issue.body.includes('`````text\n' + text + '\n`````'), 'a fence longer than any backtick run in the text');
});

/* ------------------------------------------------------------- GitHub failing */

test('report: when GitHub fails the folder is deleted again and the form gets a 503', async () => {
  const answers = [
    () => new MfResponse('{"message":"Bad credentials"}', {status: 401}),
    () => new MfResponse('oops', {status: 500}),
    () => new MfResponse(JSON.stringify({number: 7, html_url: 'https://evil.test/issues/7'}), {status: 201}),
    () => new MfResponse('not json', {status: 201}),
    () => { throw new Error('network down'); },
  ];
  for (const [i, answer] of answers.entries()) {
    github.calls = [];
    github.answer = answer;
    const res = await send([
      ['report', reportJson()],
      ['details', '{"trace":"x"}'],
      ['save', new Blob([SAVE_SENTINEL]), 'save.hsg'],
    ]);
    const body = await expectStatus(res, 503, `GitHub answer #${i + 1}`);
    assert.deepEqual(body, {error: 'Service unavailable'});
    assert.equal(github.calls.length, 1);
    assert.deepEqual(await objects(), [], `answer #${i + 1}: no save may sit in R2 without an issue`);
  }
});

/* ------------------------------------------------------------- the body */

test('report: Content-Length is checked before reading, and over 8 MB is refused', async () => {
  // An oversized upload is answered from its header, without a read. (Run in the
  // VM: over a real socket the client may see the early answer as a broken pipe.)
  {
    const {body, type} = await multipart([['report', reportJson()], ['save', new Blob([new Uint8Array(MAX_BYTES + 1)]), 'save.hsg']]);
    const request = new Request('https://vm.test/api/report', {method: 'POST', body,
      headers: {Origin: 'https://vm.test', 'Content-Type': type, 'Content-Length': String(body.length), 'CF-Connecting-IP': '192.0.2.9'}});
    let read = false;
    const getReader = request.body.getReader.bind(request.body);
    request.body.getReader = () => { read = true; return getReader(); };
    const {worker} = vmWorker(created);
    const res = await worker.fetch(request, vmEnv({put: async () => { throw new Error('no write expected'); }, delete: async () => {}}));
    assert.equal(res.status, 413);
    assert.equal(read, false, 'refused before reading');
  }
  // A body with no declared length (a stream) is refused before it is read.
  const {body, type} = await multipart([['report', reportJson()]]);
  const res = await mf.dispatchFetch(`${ORIGIN}/api/report`, {
    method: 'POST',
    headers: {origin: ORIGIN, 'content-type': type, 'CF-Connecting-IP': nextIp()},
    body: new ReadableStream({start(c) { c.enqueue(body); c.close(); }}),
    duplex: 'half',
  });
  await expectStatus(res, 411, 'no Content-Length');
  assert.equal(github.calls.length, 0);
  assert.deepEqual(await objects(), []);
});

test('report: each part is checked by name, kind and size, and the report by its fields', async () => {
  const cases = [
    ['unknown part', [['report', reportJson()], ['extra', 'x']]],
    ['report twice', [['report', reportJson()], ['report', reportJson()]]],
    ['no report', [['details', '{}']]],
    ['report as a file', [['report', new Blob([reportJson()]), 'r.json']]],
    ['save as text', [['report', reportJson()], ['save', 'abc']]],
    ['empty save', [['report', reportJson()], ['save', new Blob([]), 'save.hsg']]],
    ['details as a file', [['report', reportJson()], ['details', new Blob(['{}']), 'd.json']]],
    ['details too large', [['report', reportJson()], ['details', 'x'.repeat(256 * 1024 + 1)]]],
    ['report too large', [['report', reportJson({text: 'x'.repeat(4000), extra: 'y'.repeat(20000)})]]],
    ['text too long', [['report', reportJson({text: 'x'.repeat(5001)})]]],
    ['blank text', [['report', reportJson({text: '  \n '})]]],
    ['unknown field', [['report', reportJson({email: 'a@b.c'})]]],
    ['bad site build', [['report', reportJson({siteBuild: 'abc'})]]],
    ['bad game build', [['report', reportJson({gameBuild: '3682'})]]],
    ['unknown browser', [['report', reportJson({browser: 'Mozilla/5.0 (Windows NT 10.0)'})]]],
    ['unknown source', [['report', reportJson({source: 'C:\\Users\\alice'})]]],
    ['error too long', [['report', reportJson({error: 'E' + 'e'.repeat(200)})], ['details', '{}']]],
    ['not JSON', [['report', '{']]],
    ['an array', [['report', '[]']]],
  ];
  for (const [label, fields] of cases) {
    await expectStatus(await send(fields), 400, label);
  }
  // The text cap is 5,000 characters, not bytes.
  await expectStatus(await send([['report', reportJson({text: 'é'.repeat(5000)})]]), 201, '5,000 characters');
  const json = await mf.dispatchFetch(`${ORIGIN}/api/report`, {
    method: 'POST', headers: {origin: ORIGIN, 'content-type': 'application/json', 'CF-Connecting-IP': nextIp()}, body: reportJson(),
  });
  await expectStatus(json, 400, 'JSON instead of multipart');
  await expectStatus(await send([['report', reportJson()]], {origin: 'https://elsewhere.test'}), 400, 'cross-origin');
  await expectStatus(await mf.dispatchFetch(`${ORIGIN}/api/report`, {headers: {'CF-Connecting-IP': nextIp()}}), 405, 'GET');
  assert.equal(github.calls.length, 1, 'only the valid report reached GitHub');
  assert.deepEqual(await objects(), []);
});

/* ------------------------------------------------------------- limits and config */

test('rate limit: a few reports a minute per IP, then 429 without touching GitHub or R2', async () => {
  const {limit, period} = limiterFromConfig('REPORT_LIMITER').simple;
  assert.equal(period, 60);
  assert.ok(limit >= 2 && limit <= 10, 'a few a minute');
  // Miniflare's limiter windows are aligned to the wall clock: start early in one.
  while (Date.now() % 60000 > 45000) await new Promise((resolve) => setTimeout(resolve, 250));
  const ip = nextIp();
  const statuses = [];
  for (let i = 0; i < limit + 2; i++) statuses.push((await send([['report', reportJson()], ['save', new Blob(['s']), 'save.hsg']], {ip})).status);
  assert.deepEqual(statuses, [...Array(limit).fill(201), 429, 429]);
  assert.equal(github.calls.length, limit);
  assert.equal((await objects()).length, limit * 3, 'report.json, save.hsg and issue.json per accepted report');
  // Another connection still has its budget.
  assert.equal((await send([['report', reportJson()]])).status, 201);
});

test('config: without the bucket or the token the route answers 503 and the community API still works', async () => {
  for (const drop of ['REPORTS', 'GITHUB_REPORT_TOKEN', 'REPORT_LIMITER']) {
    const options = baseOptions();
    if (drop === 'REPORTS') delete options.r2Buckets;
    else if (drop === 'GITHUB_REPORT_TOKEN') delete options.bindings.GITHUB_REPORT_TOKEN;
    else delete options.ratelimits.REPORT_LIMITER;
    const scoped = new Miniflare(convertV4MiniflareOptions(options));
    try {
      await scoped.ready;
      github.calls = [];
      await expectStatus(await send([['report', reportJson()]], {instance: scoped}), 503, `without ${drop}`);
      assert.equal(github.calls.length, 0);
      const features = await scoped.dispatchFetch(`${ORIGIN}/api/community/features`, {headers: {'CF-Connecting-IP': nextIp()}});
      // No D1 tables in this instance: only proves the route table is intact.
      assert.ok([200, 503].includes(features.status));
    } finally {
      await scoped.dispose();
    }
  }
});

test('config: wrangler.jsonc binds the EU bucket and names the token as a secret, never a var', () => {
  const config = fs.readFileSync(path.join(ROOT, 'wrangler.jsonc'), 'utf8');
  assert.match(config, /"binding":\s*"REPORTS",\s*"bucket_name":\s*"big-copilot-reports",\s*"jurisdiction":\s*"eu"/);
  assert.match(config, /"required":\s*\[[^\]]*"GITHUB_REPORT_TOKEN"/);
  assert.doesNotMatch(config, /"vars"/);
  const example = fs.readFileSync(path.join(ROOT, '.dev.vars.example'), 'utf8');
  assert.match(example, /^GITHUB_REPORT_TOKEN=local-dev-sample/m);
  assert.doesNotMatch(example, /gh[pousr]_|github_pat_/, 'no real token shape in the example');
});

/* ------------------------------------------------------------- R2 failures, in a VM */

// The unchanged worker source with synthetic bindings, as the diagnostics
// tests in community-api.test.cjs run it.
function vmWorker(fetchImpl) {
  const events = [];
  const source = fs.readFileSync(WORKER_PATH, 'utf8')
    .replace('import FEATURES from "./features.json";', 'const FEATURES = [];')
    .replace(/import .* from \"\.\/feature_requests\.mjs\";/, fs.readFileSync(path.join(ROOT,'server/feature_requests.mjs'),'utf8').replace(/^export /gm,''))
    .replace('export default {', 'globalThis.worker = {');
  const context = {
    Request, Response, FormData, Blob, File, URL, TextEncoder, TextDecoder, AbortSignal, setTimeout,
    crypto: crypto.webcrypto,
    console: {error: (...args) => events.push(args)},
    fetch: fetchImpl,
    caches: {default: {match: async () => null, put: async () => {}}},
  };
  require('node:vm').runInNewContext(source, context);
  return {worker: context.worker, events};
}

function vmEnv(bucketImpl) {
  return {
    COMMUNITY_IP_SECRET: 'secret',
    GITHUB_REPORT_TOKEN: TOKEN,
    REPORT_LIMITER: {limit: async () => ({success: true})},
    REPORTS: bucketImpl,
    ASSETS: {fetch: async () => new Response('static')},
  };
}

async function vmRequest(fields, headers = {}) {
  const {body, type} = await multipart(fields);
  return new Request('https://vm.test/api/report', {
    method: 'POST',
    headers: Object.assign({Origin: 'https://vm.test', 'Content-Type': type, 'Content-Length': String(body.length), 'CF-Connecting-IP': '192.0.2.9'}, headers),
    body,
  });
}

const created = async () => new Response(JSON.stringify({number: 5, html_url: ISSUE_URL + '5'}), {status: 201});

test('storage: a failed R2 write removes what landed, opens no issue and logs one bounded event', async () => {
  const deleted = [];
  let puts = 0;
  let fetched = 0;
  const {worker, events} = vmWorker(async () => { fetched++; return created(); });
  const res = await worker.fetch(await vmRequest([['report', reportJson()], ['details', '{}'], ['save', new Blob(['s']), 'save.hsg']]), vmEnv({
    put: async () => { if (++puts === 2) throw new Error('r2 down /save/Alice'); },
    delete: async (keys) => { deleted.push(...keys); },
  }));
  assert.equal(res.status, 503);
  assert.equal(fetched, 0, 'no issue without its attachments');
  assert.equal(deleted.length, 2, 'the written and the failed key are both removed');
  assert.deepEqual(JSON.parse(JSON.stringify(events)), [[{event: 'community_api_failure', operation: 'report', category: 'storage'}]]);
});

test('storage: GitHub failing with a cleanup that fails too is reported as storage; with a clean one as github', async () => {
  for (const [cleanup, category] of [[false, 'storage'], [true, 'github']]) {
    const {worker, events} = vmWorker(async () => new Response('no', {status: 502}));
    let tries = 0;
    const res = await worker.fetch(await vmRequest([['report', reportJson()], ['save', new Blob(['s']), 'save.hsg']]), vmEnv({
      put: async () => {},
      delete: async () => { tries++; if (!cleanup) throw new Error('still down'); },
    }));
    assert.equal(res.status, 503);
    assert.equal(tries, cleanup ? 1 : 3, 'a failing delete is tried three times');
    assert.deepEqual(JSON.parse(JSON.stringify(events)), [[{event: 'community_api_failure', operation: 'report', category}]]);
  }
});

test('report: a body longer than its declared length is cut off at the cap', async () => {
  let puts = 0;
  const {worker} = vmWorker(created);
  const request = new Request('https://vm.test/api/report', {
    method: 'POST',
    headers: {Origin: 'https://vm.test', 'Content-Type': 'multipart/form-data; boundary=x', 'Content-Length': '100', 'CF-Connecting-IP': '192.0.2.9'},
    body: new Uint8Array(MAX_BYTES + 10),
  });
  const res = await worker.fetch(request, vmEnv({put: async () => { puts++; }, delete: async () => {}}));
  assert.equal(res.status, 413);
  assert.equal(puts, 0);
});

test('report: the store-and-file work runs under waitUntil, so a closed tab cannot cut it short', async () => {
  const kept = [];
  const {worker} = vmWorker(created);
  const res = await worker.fetch(await vmRequest([['report', reportJson()], ['save', new Blob(['s']), 'save.hsg']]),
    vmEnv({put: async () => {}, delete: async () => {}}), {waitUntil: (promise) => kept.push(promise)});
  assert.equal(res.status, 201);
  assert.equal(kept.length, 1, 'one piece of work, from the first write to the issue or the cleanup');
});

test('sweep: the daily cron removes folders whose issue never opened, and only those', async () => {
  const hour = 60 * 60 * 1000;
  const now = Date.now();
  const stored = [
    ['2026-10-01-a/report.json', now - 5 * hour], ['2026-10-01-a/save.hsg', now - 5 * hour], ['2026-10-01-a/issue.json', now - 5 * hour],
    ['2026-10-01-b/report.json', now - 5 * hour], ['2026-10-01-b/save.hsg', now - 5 * hour],
    ['2026-10-02-c/report.json', now - 60 * 1000], ['2026-10-02-c/save.hsg', now - 60 * 1000],
  ];
  const deleted = [];
  const bucket = sweepBucket(stored, {pageSize: 4, deleted});
  const {worker} = vmWorker(created);
  await worker.scheduled({}, {REPORTS: bucket});
  assert.deepEqual(deleted.sort(), ['2026-10-01-b/report.json', '2026-10-01-b/save.hsg']);
  // A failing D1 cleanup still waits for the sweep to finish, then fails the run.
  deleted.length = 0;
  const again = sweepBucket(stored, {pageSize: 4, deleted});
  const slow = {...again, list: async (opts) => { await new Promise((r) => setTimeout(r, 30)); return again.list(opts); }};
  const db = {prepare: () => ({bind() { return this; }}), batch: async () => { throw new Error('d1 down'); }};
  await assert.rejects(worker.scheduled({}, {REPORTS: slow, COMMUNITY_DB: db}), /d1 down/);
  assert.deepEqual(deleted.sort(), ['2026-10-01-b/report.json', '2026-10-01-b/save.hsg']);
});


// An opaque continuation token names the last returned key, not an array
// offset: deletions between pages must not make the synthetic R2 skip objects.
function sweepBucket(stored, {pageSize = 2, deleted = [], onList, onDelete, checkpoint: initialCheckpoint = null} = {}) {
  const objects = new Map(stored.map(([key, at]) => [key, {key, uploaded: new Date(at)}]));
  const calls = [], batches = [];
  let checkpoint = initialCheckpoint, operations = 0, etag = "initial";
  return {
    objects, calls, batches,
    get operations() { return operations; },
    get checkpoint() { return checkpoint && JSON.parse(checkpoint); },
    async get() { operations++; const raw = checkpoint; return raw === null ? null : {size: raw.length, etag, json: async () => JSON.parse(raw)}; },
    async put(key, value, options = {}) {
      operations++;
      if ((options.onlyIf?.etagMatches && options.onlyIf.etagMatches !== etag)
          || (options.onlyIf?.etagDoesNotMatch === '*' && checkpoint !== null)) return null;
      checkpoint = value; etag = String(operations); return {etag};
    },
    async list(options = {}) {
      operations++;
      calls.push({...options});
      if (onList) await onList(options, calls.length);
      assert.equal(options.limit, 1000);
      const after = options.cursor ? Buffer.from(options.cursor, 'base64').toString() : options.startAfter || '';
      const remaining = [...objects.values()].filter(o => o.key.startsWith(options.prefix || '') && o.key > after)
        .sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
      const page = remaining.slice(0, pageSize);
      const truncated = remaining.length > page.length;
      return {objects: page, truncated, ...(truncated ? {cursor: Buffer.from(page.at(-1).key).toString('base64')} : {})};
    },
    async head(key) { operations++; return objects.get(key) || null; },
    async delete(keys) {
      operations++;
      assert.ok(keys.length > 0 && keys.length <= 1000);
      batches.push([...keys]);
      if (onDelete) await onDelete(keys, batches.length);
      for (const key of keys) { objects.delete(key); deleted.push(key); }
    },
  };
}

test('sweep: complete folder facts survive short pages, late markers and a recent last object', async () => {
  const now = Date.now(), hour = 3600000, old = now - 5 * hour;
  const rows = [
    ['a/details.json', old], ['a/report.json', old], ['a/save.hsg', old],
    ['b/aaa.json', old], ['b/issue.json', old], ['b/save.hsg', old],
    ['c/details.json', old], ['c/report.json', old], ['c/save.hsg', now - 1000],
    ['d/report.json', old], ['d/save.hsg', old], ['standalone', old],
  ];
  const bucket = sweepBucket(rows, {pageSize: 1});
  const {worker} = vmWorker(created);
  await worker.scheduled({}, {REPORTS: bucket});
  assert.deepEqual([...bucket.objects.keys()].sort(), rows.map(([key]) => key).filter(key => !key.startsWith('a/') && !key.startsWith('d/')).sort());
  assert.ok(bucket.calls.some(call => call.prefix === 'a/'));
  assert.ok(!bucket.calls.some(call => call.prefix === 'b/' || call.prefix === 'c/'), 'protected folders never enter the deletion pass');
});

test('sweep: deletion is bounded and starts before the whole bucket has been accumulated', async () => {
  const old = Date.now() - 5 * 3600000;
  const rows = Array.from({length: 2105}, (_, i) => ['a/' + String(i).padStart(5, '0'), old]);
  rows.push(['b/report.json', old], ['c/issue.json', old], ['c/save.hsg', old]);
  const retained = Array.from({length: 2000}, (_, i) => ['z' + String(i).padStart(5, '0') + '/issue.json', old]);
  rows.push(...retained);
  let bucket;
  bucket = sweepBucket(rows, {pageSize: 1000, onDelete: () => {
    assert.equal(bucket.calls.filter(call => !call.prefix).length, 3, 'deletion begins before listing the remaining thousands of folders');
  }});
  const {worker} = vmWorker(created);
  await worker.scheduled({}, {REPORTS: bucket});
  assert.deepEqual([...bucket.objects.keys()].sort(), ['c/issue.json', 'c/save.hsg', ...retained.map(([key]) => key)]);
  assert.deepEqual(bucket.batches.map(keys => keys.length), [1000, 1000, 105, 1]);
});

test('sweep: an interrupted folder scan deletes none of that folder and a retry sees its marker', async () => {
  const old = Date.now() - 5 * 3600000;
  let fail = true;
  const bucket = sweepBucket([['a/aaa.json', old], ['a/issue.json', old], ['a/save.hsg', old]], {
    pageSize: 1, onList: options => { if (fail && (options.cursor || options.startAfter)) throw new Error('list down'); },
  });
  const {worker} = vmWorker(created);
  await assert.rejects(worker.scheduled({}, {REPORTS: bucket}), /list down/);
  assert.equal(bucket.batches.length, 0);
  fail = false;
  await worker.scheduled({}, {REPORTS: bucket});
  assert.equal(bucket.objects.size, 3);
  assert.equal(bucket.batches.length, 0);
});

test('sweep: after a partial delete failure the next cron finishes only unmarked stale folders', async () => {
  const old = Date.now() - 5 * 3600000;
  let fail = true;
  const bucket = sweepBucket([['a/1', old], ['a/2', old], ['a/3', old], ['b/issue.json', old], ['b/save.hsg', old]], {
    pageSize: 1, onDelete: (_keys, number) => { if (fail && number === 2) throw new Error('delete down'); },
  });
  const {worker} = vmWorker(created);
  await assert.rejects(worker.scheduled({}, {REPORTS: bucket}), /delete down/);
  assert.deepEqual([...bucket.objects.keys()].sort(), ['a/2', 'a/3', 'b/issue.json', 'b/save.hsg']);
  fail = false;
  await worker.scheduled({}, {REPORTS: bucket});
  assert.deepEqual([...bucket.objects.keys()].sort(), ['b/issue.json', 'b/save.hsg']);
});


test('sweep: fresh attachments and new issue markers between passes protect the folder', async () => {
  for (const added of ['save.hsg', 'issue.json']) {
    const old = Date.now() - 5 * 3600000;
    let bucket, mutated = false;
    bucket = sweepBucket([['a/report.json', old], ['b/issue.json', old]], {
      pageSize: 1, onList: options => {
        if (options.prefix === 'a/' && !mutated) {
          mutated = true;
          bucket.objects.set('a/' + added, {key: 'a/' + added, uploaded: new Date()});
        }
      },
    });
    const {worker} = vmWorker(created);
    await worker.scheduled({}, {REPORTS: bucket});
    assert.equal(mutated, true);
    assert.ok(bucket.objects.has('a/report.json'));
    assert.ok(bucket.objects.has('a/' + added));
    assert.equal(bucket.batches.length, 0);
  }
});

test('sweep: a marker appearing after validation protects subsequent batches and is never deleted', async () => {
  const old = Date.now() - 5 * 3600000;
  let bucket;
  bucket = sweepBucket([['a/1', old], ['a/2', old], ['a/3', old], ['b/issue.json', old]], {
    pageSize: 1, onDelete: (_keys, number) => {
      if (number === 1) bucket.objects.set('a/issue.json', {key: 'a/issue.json', uploaded: new Date()});
    },
  });
  const {worker} = vmWorker(created);
  await worker.scheduled({}, {REPORTS: bucket});
  assert.deepEqual([...bucket.objects.keys()].sort(), ['a/2', 'a/3', 'a/issue.json', 'b/issue.json']);
  assert.equal(bucket.batches.length, 1);
});

test('sweep: a fresh object appearing after validation is not included in a delete batch', async () => {
  const old = Date.now() - 5 * 3600000;
  let bucket;
  bucket = sweepBucket([['a/1', old], ['a/2', old], ['b/issue.json', old]], {
    pageSize: 1, onDelete: (_keys, number) => {
      if (number === 1) bucket.objects.set('a/3', {key: 'a/3', uploaded: new Date()});
    },
  });
  const {worker} = vmWorker(created);
  await worker.scheduled({}, {REPORTS: bucket});
  assert.ok(bucket.objects.has('a/3'));
  assert.ok(bucket.batches.every(keys => !keys.includes('a/3')));
});


test('sweep: fixed call budget resumes orphan backlog without restarting', async () => {
  const old = Date.now() - 5 * 3600000;
  const rows = Array.from({length: 500}, (_, i) => [`r${String(i).padStart(4, '0')}/save.hsg`, old]);
  const bucket = sweepBucket(rows, {pageSize: 1000});
  const {worker} = vmWorker(created);
  let runs = 0;
  while (bucket.objects.size && runs < 20) {
    const before = bucket.operations, size = bucket.objects.size;
    await worker.scheduled({}, {REPORTS: bucket});
    assert.ok(bucket.operations - before <= 192, 'all R2 operations include checkpoint storage');
    assert.ok(bucket.objects.size < size, 'every invocation advances orphan cleanup');
    runs++;
  }
  assert.equal(bucket.objects.size, 0);
  assert.ok(runs > 1);
});

test('sweep: retained backlog and a giant folder resume through bounded invocations', async () => {
  const old = Date.now() - 5 * 3600000;
  const rows = Array.from({length: 250}, (_, i) => [`a${String(i).padStart(4, '0')}/issue.json`, old]);
  rows.push(...Array.from({length: 250}, (_, i) => [`z/${String(i).padStart(4, '0')}`, old]));
  const bucket = sweepBucket(rows, {pageSize: 1});
  const {worker} = vmWorker(created);
  for (let run = 0; run < 20 && bucket.objects.size > 250; run++) {
    const before = bucket.operations;
    await worker.scheduled({}, {REPORTS: bucket});
    assert.ok(bucket.operations - before <= 192);
  }
  assert.equal(bucket.objects.size, 250, 'later giant orphan cannot be starved by retained folders');
  assert.ok([...bucket.objects.keys()].every(key => key.endsWith('/issue.json')));
  // An object inserted behind the scan position is reached on the next cycle.
  bucket.objects.set('000/new.hsg', {key: '000/new.hsg', uploaded: new Date(old)});
  for (let run = 0; run < 8 && bucket.objects.has('000/new.hsg'); run++)
    await worker.scheduled({}, {REPORTS: bucket});
  assert.ok(!bucket.objects.has('000/new.hsg'));
});


test('sweep: a marker arriving during a paused validation protects the entire folder', async () => {
  const old = Date.now() - 5 * 3600000;
  const rows = Array.from({length: 250}, (_, i) => [`a/${String(i).padStart(4, '0')}`, old]);
  const bucket = sweepBucket(rows, {pageSize: 1});
  const {worker} = vmWorker(created);
  for (let run = 0; run < 5 && bucket.checkpoint?.phase !== 'validate'; run++)
    await worker.scheduled({}, {REPORTS: bucket});
  assert.equal(bucket.checkpoint.phase, 'validate');
  bucket.objects.set('a/issue.json', {key: 'a/issue.json', uploaded: new Date()});
  bucket.objects.set('a/fresh.hsg', {key: 'a/fresh.hsg', uploaded: new Date()});
  for (let run = 0; run < 6; run++) await worker.scheduled({}, {REPORTS: bucket});
  assert.equal(bucket.objects.size, 252);
  assert.equal(bucket.batches.length, 0);
});


test('sweep: invalid JSON, null and unsupported checkpoints are repaired without blocking cleanup', async () => {
  const old = Date.now() - 5 * 3600000;
  const {worker} = vmWorker(created);
  for (const checkpoint of ['{bad json', 'null', '{"version":999}']) {
    const bucket = sweepBucket([['a/save.hsg', old]], {checkpoint});
    await worker.scheduled({}, {REPORTS: bucket});
    assert.equal(bucket.objects.size, 0);
    assert.equal(bucket.checkpoint.version, 2);
    assert.ok(bucket.operations <= 192);
  }
  const bucket = sweepBucket([['a/save.hsg', old]]);
  bucket.get = async () => { throw new Error('checkpoint service down'); };
  await assert.rejects(worker.scheduled({}, {REPORTS: bucket}), /checkpoint service down/);
  assert.equal(bucket.objects.size, 1);
});


test('sweep: minute scheduling clears a large backlog inside the existing two-day window', async () => {
  const config = fs.readFileSync(path.join(ROOT, 'wrangler.jsonc'), 'utf8');
  assert.match(config, /"crons": \["17 3 \* \* \*", "\* \* \* \* \*"\]/);
  const old = Date.now() - 3600001;
  const rows = Array.from({length: 2400}, (_, i) => [`r${String(i).padStart(4, '0')}/save.hsg`, old]);
  const bucket = sweepBucket(rows, {pageSize: 1000});
  const {worker} = vmWorker(created);
  let minutes = 0, dailyCalls = 0;
  const db = {prepare() { dailyCalls++; throw new Error('daily cleanup on minute tick'); }};
  while (bucket.objects.size && minutes < 60) {
    const before = bucket.operations;
    await worker.scheduled({cron: '* * * * *'}, {REPORTS: bucket, COMMUNITY_DB: db});
    assert.ok(bucket.operations - before <= 192);
    minutes++;
  }
  assert.equal(bucket.objects.size, 0, '2,400 stale orphans clear within an hour after becoming eligible');
  assert.equal(dailyCalls, 0, 'minute sweeps do not multiply D1 daily cleanup');
  const before = bucket.operations;
  await worker.scheduled({cron: '17 3 * * *'}, {REPORTS: bucket});
  assert.equal(bucket.operations, before, 'daily tick cannot overlap the report-only minute sweep');
});

test('sweep: rejected persisted cursors resume giant folder progress from the last key', async () => {
  const old = Date.now() - 5 * 3600000;
  const rows = Array.from({length: 250}, (_, i) => [`a/${String(i).padStart(4, '0')}`, old]);
  const checkpoint = JSON.stringify({version: 2, after: 'a/0249', folder: {name: 'a', newest: old, issue: false},
    phase: 'validate', partAfter: 'a/0000', cursor: 'expired', end: true});
  const bucket = sweepBucket(rows, {pageSize: 1, checkpoint, onList: options => {
    if (options.cursor) throw new Error('invalid cursor');
  }});
  const {worker} = vmWorker(created);
  for (let run = 0; run < 10 && bucket.objects.size; run++) {
    const before = bucket.operations;
    await worker.scheduled({}, {REPORTS: bucket});
    assert.ok(bucket.operations - before <= 192);
  }
  assert.equal(bucket.objects.size, 0);
  assert.equal(bucket.calls.filter(call => call.cursor).length, 1, 'opaque rejection is not persisted into every future run');
});

test('sweep: late marker and fresh upload protect a paused deletion remainder', async () => {
  const old = Date.now() - 5 * 3600000;
  const rows = Array.from({length: 250}, (_, i) => [`a/${String(i).padStart(4, '0')}`, old]);
  const bucket = sweepBucket(rows, {pageSize: 1});
  const {worker} = vmWorker(created);
  for (let run = 0; run < 10 && bucket.checkpoint?.phase !== 'delete'; run++)
    await worker.scheduled({}, {REPORTS: bucket});
  assert.equal(bucket.checkpoint.phase, 'delete');
  const retained = bucket.objects.size;
  bucket.objects.set('a/issue.json', {key: 'a/issue.json', uploaded: new Date()});
  bucket.objects.set('a/fresh.hsg', {key: 'a/fresh.hsg', uploaded: new Date()});
  for (let run = 0; run < 8; run++) await worker.scheduled({}, {REPORTS: bucket});
  assert.equal(bucket.objects.size, retained + 2);
});


test('sweep: overlapping minute events elect one checkpoint owner and release the lease', async () => {
  const old = Date.now() - 5 * 3600000;
  let release, entered;
  const paused = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  let first = true;
  const bucket = sweepBucket([['a/save.hsg', old]], {onList: async () => {
    if (first) { first = false; entered(); await paused; }
  }});
  const {worker} = vmWorker(created);
  const run = worker.scheduled({cron: '* * * * *'}, {REPORTS: bucket});
  await started;
  const before = bucket.operations;
  await worker.scheduled({cron: '* * * * *'}, {REPORTS: bucket});
  assert.equal(bucket.operations - before, 1, 'active lease only reads checkpoint');
  assert.equal(bucket.batches.length, 0);
  release(); await run;
  assert.equal(bucket.objects.size, 0);
  assert.equal(bucket.checkpoint.leaseUntil, 0);
});


test('sweep: simultaneous lease acquisition uses atomic conditional writes', async () => {
  const old = Date.now() - 5 * 3600000;
  const bucket = sweepBucket([['a/save.hsg', old]]);
  const {worker} = vmWorker(created);
  await Promise.all([worker.scheduled({cron: '* * * * *'}, {REPORTS: bucket}),
    worker.scheduled({cron: '* * * * *'}, {REPORTS: bucket})]);
  assert.deepEqual(bucket.batches, [['a/save.hsg']]);
  assert.equal(bucket.checkpoint.leaseUntil, 0);
});


test('sweep: real R2 binding supports conditional checkpoint election and stable-key listing', async () => {
  const key = '_synthetic-sweep-checkpoint';
  const first = await bucket.put(key, 'one', {onlyIf: {etagDoesNotMatch: '*'}});
  assert.ok(first);
  assert.equal(await bucket.put(key, 'two', {onlyIf: {etagDoesNotMatch: '*'}}), null);
  assert.equal(await bucket.put(key, 'two', {onlyIf: {etagMatches: 'wrong'}}), null);
  const second = await bucket.put(key, 'two', {onlyIf: {etagMatches: first.etag}});
  assert.ok(second);
  await bucket.put('a/1', 'synthetic'); await bucket.put('a/2', 'synthetic');
  const page = await bucket.list({prefix: 'a/', startAfter: 'a/1'});
  assert.deepEqual(page.objects.map(object => object.key), ['a/2']);
});


test('sweep: expired ownership and oversized checkpoint bodies recover without stalling', async () => {
  const old = Date.now() - 5 * 3600000;
  const checkpoint = JSON.stringify({version: 2, after: '', folder: null, phase: 'scan',
    cursor: null, partAfter: '', end: false, leaseUntil: Date.now() - 1});
  const {worker} = vmWorker(created);
  const expired = sweepBucket([['a/save.hsg', old]], {checkpoint});
  await worker.scheduled({}, {REPORTS: expired});
  assert.equal(expired.objects.size, 0);
  let cancelled = false;
  const oversized = sweepBucket([['a/save.hsg', old]]);
  oversized.get = async () => ({size: 8193, etag: 'initial',
    body: {cancel: async () => { cancelled = true; }},
    json: async () => { throw new Error('oversized body must not be parsed'); }});
  await worker.scheduled({}, {REPORTS: oversized});
  assert.ok(cancelled);
  assert.equal(oversized.objects.size, 0);
});
