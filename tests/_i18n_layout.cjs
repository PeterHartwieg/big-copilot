// Shared browser fixture for the independent translation layout suites.
const {before, after} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const WEB = path.join(ROOT, 'web');

/* The pseudo text: accents on the letters, 40% longer, in brackets; the
   placeholders and game-name tokens untouched, so the page fills them. The
   few tags a sentence may hold (<b>, <code>, <a>) stay tags, and each run of
   text between them gets its own brackets, as each is its own text node. */
const ACCENT = {a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', A: 'Å', E: 'É', I: 'Í', O: 'Ó', U: 'Ú', c: 'ç', n: 'ñ', s: 'š', y: 'ý'};
const TAG = /(<\/?(?:b|code|a)>)/;
function pseudo(en){
  const runs = String(en).split(TAG);
  const last = runs.length - 1;
  return runs.map((run, r) => {
    if(r % 2) return run;
    if(!run && r !== last) return run;
    const parts = run.split(/(\{[^{}]+\}|⟦[^⟧]*⟧)/);
    const text = parts.map((p, i) => i % 2 ? p : p.replace(/[A-Za-z]/g, ch => ACCENT[ch] || ch)).join('');
    const letters = (r === last ? runs.filter((x, i) => i % 2 === 0).join('') : run).replace(/\{[^{}]+\}/g, '').length;
    return `[${text}${r === last ? '·'.repeat(Math.ceil(letters * 0.4)) : ''}]`;
  }).join('');
}

function layoutFixture(){
  let browser, TABLE, PAYLOAD;
  before(async () => {
    const cat = spawnSync(process.env.PYTHON || 'python', [path.join('tools', 'i18n.py'), 'extract'],
      {cwd: ROOT, maxBuffer: 16 * 1024 * 1024});
    assert.equal(cat.status, 0, cat.stderr.toString());
    const english = JSON.parse(cat.stdout.toString('utf8'));
    TABLE = Object.fromEntries(Object.entries(english).map(([k, v]) => [k, pseudo(v)]));
    const fix = spawnSync(process.env.PYTHON || 'python', ['-c', `
import json, sys
from ba_dashboard import _wire_msgs
from tests.game_names_fixture import fixture
sys.stdout.buffer.write(json.dumps(_wire_msgs(fixture()["payload"]), ensure_ascii=False).encode("utf-8"))`],
    {cwd: ROOT, maxBuffer: 64 * 1024 * 1024});
    assert.equal(fix.status, 0, fix.stderr.toString());
    PAYLOAD = JSON.parse(fix.stdout.toString('utf8'));
    const {chromium} = require('playwright');
    browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL});
  });
  after(async () => { await browser?.close(); });

  /* Serve the assembled page and tables; pseudo text can stand in for German. */
  async function site(t, {ui = '', width = 1280, payload = PAYLOAD, pseudoTable = true} = {}){
    const context = await browser.newContext({viewport: {width, height: 900}, locale: 'en-US', reducedMotion: 'reduce'});
    t.after(() => context.close());
    const page = await context.newPage();
    const errors = [], fetched = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if(url.hostname !== 'i18n.test') return route.abort();
      const name = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
      if(name.startsWith('/i18n/')) fetched.push(url.pathname + url.search);
      if(pseudoTable && name === '/i18n/de.json') return route.fulfill({contentType: 'application/json', body: JSON.stringify(TABLE)});
      const file = path.join(WEB, name);
      if(!fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
      return route.fulfill({path: file});
    });
    await page.goto(`http://i18n.test/${ui ? `?ui=${ui}` : ''}`);
    if(ui) await page.waitForFunction(lang => ttLang === lang, ui);
    await page.evaluate(raw => { document.body.classList.add('has-board'); takeData(raw); boot(); }, payload);
    return {page, errors, fetched};
  }

  return {site, get browser(){ return browser; }, get TABLE(){ return TABLE; }, get PAYLOAD(){ return PAYLOAD; }};
}

module.exports = {layoutFixture};
