import { json, plainObject, fields } from './http.mjs';

// Public catalogue-backed translations. All strings and source versions are
// checked against the deployed ASSETS catalogue, never client-supplied metadata.
// D1 triggers keep winner selection atomic for votes and operator moderation.
const PAGE_SIZE = 50;
const MAX_CANDIDATES = 32;
const MAX_CATALOGUE_BYTES = 16 * 1024 * 1024;
const LANG = /^[a-z]{2}(?:-[A-Za-z]{2,8})?$/;
const VERSION = /^[a-f0-9]{64}$/;
const TOKEN = /\{(\w+)(?::([^{}]+))?\}/g;
// Entities HTML would decode: any &name; or numeric one, and the legacy ones it
// decodes without a semicolon (&lt, &gt, &amp, &quot even before letters). "R&D" is text.
const ENTITY = /&(?:#(?:x[\da-f]+|\d+);?|[a-z][a-z\d]+;|lt|gt|amp|quot|(?:apos|nbsp)(?![a-z\d]))/i;
// The overlay changes only when translation_revisions.revision moves (every vote,
// suggestion, moderation action and vote cleanup bumps it in the same transaction)
// or a deployment replaces the catalogue, which changes the build stamp in
// /version.json. caches.default keeps each (language, revision, stamp) overlay;
// the path is a cache key only, not a routable endpoint. Worker code is not in the
// stamp, so bump OVERLAY_FORMAT when overlay() would answer differently for the same
// revision and catalogue; it is in both the cache key and the browser's ETag.
const OVERLAY_FORMAT = 'v1';
const OVERLAY_EDGE_TTL = 24 * 60 * 60;
const OVERLAY_BROWSER_TTL = 60;
const STAMP = /^[\w.-]{1,64}$/;

// Entry replies carry the voter's own flags; the summary is the same for everyone.
const PRIVATE = { 'cache-control': 'private, no-store' };
const PUBLIC = { 'cache-control': 'public, max-age=0, must-revalidate' };
// The code alone: the page words each code through tt().
const error = (code, status = 400) => json({ error: code }, status, PRIVATE);

// A key whose English has tags is drawn as HTML, so its wording may carry
// exactly those tags (validation.markup, copied character for character from
// the English by tools/translation_catalogue.py), as many of each, properly
// nested, in any order. Any other '<' is refused; a bare '>' is text.
// keeps_markup() there and ttCommunityValid() in web/i18n.js mirror this.
const MARKUP = /<[^<>]*>/g;
const TAG = /^<(\/?)([a-z][a-z\d]*)(?=[\s>/])/i;
const VOID_TAGS = new Set(['br']);
export function keepsMarkup(text, markup = []) {
  if (!Array.isArray(markup) || text.replace(MARKUP, '').includes('<')) return false;
  const pieces = text.match(MARKUP) || [];
  const want = [...markup].sort(), got = [...pieces].sort();
  if (got.length !== want.length || got.some((piece, i) => piece !== want[i])) return false;
  const open = [];
  for (const piece of pieces) {
    const tag = TAG.exec(piece);
    if (!tag) return false;
    const name = tag[2].toLowerCase();
    if (VOID_TAGS.has(name)) continue;
    if (!tag[1]) open.push(name);
    else if (open.pop() !== name) return false;
  }
  return open.length === 0;
}

export function validateTranslation(text, validation) {
  if (typeof text !== 'string' || !text.trim() || !plainObject(validation)) return false;
  if ([...text].length > Math.min(validation.maxLength || 2000, 2000)) return false;
  // Quotes and apostrophes are ordinary characters; consumers escape at HTML
  // sinks. Entities and control characters are not accepted as a second,
  // ambiguous representation of the submitted text, and markup only as
  // keepsMarkup() allows.
  if (/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/.test(text) || ENTITY.test(text)) return false;
  if (!keepsMarkup(text, validation.markup)) return false;
  const tokens = [...text.matchAll(TOKEN)].map(match => `${match[1]}:${match[2] || ''}`);
  if (/[{}]/.test(text.replace(TOKEN, ''))) return false;
  if (!Array.isArray(validation.allowed) || !Array.isArray(validation.required)) return false;
  return tokens.every(token => validation.allowed.includes(token)) &&
    validation.required.every(group => Array.isArray(group) && group.some(token => tokens.includes(token)));
}

// Parsed catalogues, least recently used first. A catalogue is deployment-immutable
// and the ETag that ASSETS sends names its bytes, so a parse is reused, across
// requests in this isolate, only while ASSETS still reports that ETag: a 304 to
// If-None-Match, or a 200 carrying the same tag. A response without an ETag is
// parsed every time and never kept. A parsed catalogue is several MB, so only the
// last CATALOGUE_CACHE languages are kept. Callers must not mutate what they get.
const CATALOGUE_CACHE = 2;
const parsedCatalogues = new Map();
const sourceMaps = new WeakMap();
// Every insertion, a revalidated hit included, goes through here: a hit whose
// revalidation finishes after other languages evicted it must still evict.
function rememberCatalogue(lang, held) {
  parsedCatalogues.delete(lang);
  parsedCatalogues.set(lang, held);
  while (parsedCatalogues.size > CATALOGUE_CACHE) parsedCatalogues.delete(parsedCatalogues.keys().next().value);
}

async function catalogue(request, env, lang) {
  if (!LANG.test(lang || '')) return null;
  const cached = parsedCatalogues.get(lang);
  const response = await env.ASSETS.fetch(new Request(new URL(`/translations/${lang}.json`, request.url),
    cached ? { headers: { 'if-none-match': cached.etag } } : undefined));
  const etag = response.headers.get('etag');
  if (cached && (response.status === 304 || (response.ok && etag === cached.etag))) {
    rememberCatalogue(lang, cached);
    await response.body?.cancel();
    return cached.cat;
  }
  parsedCatalogues.delete(lang);
  if (!response.ok) {
    await response.body?.cancel();
    return null;
  }
  const raw = await response.text();
  if (raw.length > MAX_CATALOGUE_BYTES) return null;
  const data = JSON.parse(raw);
  if (data.schemaVersion !== 1 || data.lang !== lang || !Array.isArray(data.entries) || data.entries.length > 20000) return null;
  const entries = new Map();
  for (const entry of data.entries) {
    if (!plainObject(entry) || typeof entry.key !== 'string' || !VERSION.test(entry.sourceVersion) ||
        typeof entry.en !== 'string' || !(entry.text === null || typeof entry.text === 'string') || !plainObject(entry.validation)) return null;
    entries.set(entry.key, entry);
  }
  const cat = { ...data, entries };
  if (etag) rememberCatalogue(lang, { etag, cat });
  return cat;
}
// {key: sourceVersion} as JSON, the text json_each() joins against; built once per parse.
function sourceMap(cat) {
  let text = sourceMaps.get(cat);
  if (text === undefined) {
    text = JSON.stringify(Object.fromEntries([...cat.entries].map(([key, entry]) => [key, entry.sourceVersion])));
    sourceMaps.set(cat, text);
  }
  return text;
}
const baseline = entry => entry.text ?? entry.en;
async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
const candidateId = (lang, entry, text) => digest(JSON.stringify([lang, entry.key, entry.sourceVersion, text]));
const revisionQuery = db => db.prepare('SELECT revision FROM translation_revisions WHERE lang = ?1');
const candidateQuery = `SELECT c.id, c.text, COUNT(v.voter_hash) AS votes,
  MAX(CASE WHEN v.voter_hash = ?4 THEN 1 ELSE 0 END) AS voted
  FROM translation_candidates c LEFT JOIN translation_votes v ON v.candidate_id = c.id
  WHERE c.lang = ?1 AND c.key = ?2 AND c.source_version = ?3 AND c.hidden = 0
  GROUP BY c.id ORDER BY c.created_at, c.id`;

async function entryReply(db, lang, entry, voterHash, prefix = []) {
  const result = await db.batch([...prefix,
    db.prepare(candidateQuery).bind(lang, entry.key, entry.sourceVersion, voterHash),
    db.prepare('SELECT selected_id, pinned_id FROM translation_entries WHERE lang = ?1 AND key = ?2 AND source_version = ?3')
      .bind(lang, entry.key, entry.sourceVersion),
    revisionQuery(db).bind(lang),
    db.prepare('SELECT hidden FROM translation_candidates WHERE lang = ?1 AND key = ?2 AND source_version = ?3 AND text = ?4').bind(lang, entry.key, entry.sourceVersion, baseline(entry)),
  ]);
  const [rows, state, revision, bundled] = result.slice(-4);
  const bundledId = await candidateId(lang, entry, baseline(entry));
  const wireId = id => id === bundledId || !id ? 'bundled' : id;
  const candidates = rows.results.map(row => ({ id: wireId(row.id), text: row.text, votes: row.votes, voted: Boolean(row.voted) }));
  // A fresh entry has no database rows. The bundled candidate always starts at
  // zero; never seed an implicit vote for machine-drafted wording.
  if (!candidates.some(row => row.id === 'bundled')) {
    if (!bundled.results[0]?.hidden) candidates.unshift({ id: 'bundled', text: baseline(entry), votes: 0, voted: false });
  }
  return json({ schemaVersion: 1, lang, key: entry.key, sourceVersion: entry.sourceVersion,
    revision: revision.results[0]?.revision || 0,
    selectedId: wireId(state.results[0]?.selected_id), pinned: Boolean(state.results[0]?.pinned_id), candidates }, 200, PRIVATE);
}

export async function handleTranslations(request, env, body, ip, sign, diagnostic, ctx) {
  const url = new URL(request.url);
  const operation = url.pathname.split('/').at(-1);
  const writing = request.method === 'POST';
  if (writing && !fields(body, ['lang', 'key', 'sourceVersion', operation === 'suggest' ? 'text' : 'candidateId'])) {
    return error('invalid_request');
  }
  const lang = writing ? body.lang : url.searchParams.get('lang');
  if (operation === 'overlay') return cachedOverlay(request, env, ctx, lang, diagnostic);
  const cat = await catalogue(request, env, lang);
  if (!cat) return error('unknown_language', 404);
  const db = env.COMMUNITY_DB;
  if (operation === 'translations') {
    diagnostic.category = 'database';
    return summary(db, lang, cat, url.searchParams.get('cursor') || '');
  }
  const key = writing ? body.key : url.searchParams.get('key');
  const version = writing ? body.sourceVersion : url.searchParams.get('sourceVersion');
  const entry = cat.entries.get(key);
  if (!entry) return error('unknown_entry', 404);
  if (version !== entry.sourceVersion) return error('stale_source', 409);
  const voterHash = await sign(`translation-vote:${JSON.stringify([lang, key, version, ip])}`);
  diagnostic.category = 'database';
  if (!writing) return entryReply(db, lang, entry, voterHash);

  const baseText = baseline(entry);
  const baseId = await candidateId(lang, entry, baseText);
  let text = operation === 'suggest' ? body.text.replace(/\r\n?/g, '\n').normalize('NFC').trim() : null;
  if (text !== null && !validateTranslation(text, entry.validation)) {
    return error('invalid_translation');
  }
  let id = text !== null ? await candidateId(lang, entry, text) : body.candidateId === 'bundled' ? baseId : body.candidateId;
  if (!VERSION.test(id)) return error('unknown_candidate', 404);
  const existing = await db.prepare('SELECT id, hidden FROM translation_candidates WHERE id = ?1 AND lang = ?2 AND key = ?3 AND source_version = ?4')
    .bind(id, lang, key, version).first();
  if (existing?.hidden || (text === null && !existing && id !== baseId)) return error('unknown_candidate', 404);
  const now = Math.floor(Date.now() / 1000);
  const prefix = [
    db.prepare('INSERT INTO translation_entries (lang, key, source_version) VALUES (?1, ?2, ?3) ON CONFLICT DO NOTHING').bind(lang, key, version),
    db.prepare('INSERT INTO translation_candidates (id, lang, key, source_version, text, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT DO NOTHING')
      .bind(baseId, lang, key, version, baseText, now),
  ];
  if (text !== null && id !== baseId) prefix.push(db.prepare(
    `INSERT INTO translation_candidates (id, lang, key, source_version, text, created_at)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE
       (SELECT COUNT(*) FROM translation_candidates WHERE lang = ?2 AND key = ?3 AND source_version = ?4 AND hidden = 0) < ?7
     ON CONFLICT DO NOTHING`).bind(id, lang, key, version, text, now, MAX_CANDIDATES));
  // The insert-select rechecks visibility in the transaction, so a concurrent
  // moderation hide cannot receive a new vote after it has been hidden.
  prefix.push(db.prepare(
    `INSERT INTO translation_votes (lang, key, source_version, voter_hash, candidate_id, created_at)
     SELECT ?1, ?2, ?3, ?4, c.id, ?6 FROM translation_candidates c
     WHERE c.id = ?5 AND c.lang = ?1 AND c.key = ?2 AND c.source_version = ?3 AND c.hidden = 0
     ON CONFLICT (lang, key, source_version, voter_hash) DO UPDATE SET candidate_id = excluded.candidate_id
     WHERE translation_votes.candidate_id <> excluded.candidate_id`).bind(lang, key, version, voterHash, id, now));
  const response = await entryReply(db, lang, entry, voterHash, prefix);
  // Candidate cap is checked inside the transaction; no race can exceed it.
  const snapshot = await response.clone().json();
  if (!snapshot.candidates.some(candidate => (candidate.id === 'bundled' ? baseId : candidate.id) === id)) {
    // A vote cannot hit the candidate cap. A candidate may instead have been
    // hidden after the pre-check but before the transaction took its snapshot.
    const hidden = operation === 'vote' || existing || await db.prepare(
      'SELECT id FROM translation_candidates WHERE id = ?1 AND hidden = 1').bind(id).first();
    if (hidden) return error('unknown_candidate', 404);
    return error('candidate_limit', 409);
  }
  return response;
}

// One statement binds the source map once: the page's current entries (one more
// than a page, to tell whether another follows), each with its visible candidates.
// An entry without visible candidates still yields one row, with a null c.id; the
// extra entry (n > ?4) yields only that row, since its candidates are not joined.
// CROSS JOIN keeps json_each() the outer loop, read once, with a primary-key lookup
// per catalogue key; as the inner loop SQLite rescans it for every entry row.
const summarySql = `WITH page AS (
    SELECT e.key, e.source_version, e.selected_id, ROW_NUMBER() OVER (ORDER BY e.key) AS n FROM json_each(?2) current
    CROSS JOIN translation_entries e ON e.lang = ?1 AND e.key = current.key AND e.source_version = current.value
    WHERE e.key > ?3 ORDER BY e.key LIMIT ?4 + 1)
  SELECT page.key, page.source_version, page.selected_id, page.n, c.id, c.text, COUNT(v.voter_hash) AS votes FROM page
  LEFT JOIN translation_candidates c ON page.n <= ?4 AND c.lang = ?1 AND c.key = page.key
    AND c.source_version = page.source_version AND c.hidden = 0
  LEFT JOIN translation_votes v ON v.candidate_id = c.id
  GROUP BY page.key, c.id ORDER BY page.key, c.created_at, c.id`;

async function summary(db, lang, cat, cursor) {
  if (cursor.length > 240) return error('invalid_cursor');
  const [rows, revision] = await db.batch([
    db.prepare(summarySql).bind(lang, sourceMap(cat), cursor, PAGE_SIZE),
    revisionQuery(db).bind(lang),
  ]);
  const entries = {};
  let last = null, more = false, wire = null;
  for (const row of rows.results) {
    if (row.n > PAGE_SIZE) {
      more = true;
      continue;
    }
    if (row.key !== last) {
      last = row.key;
      const entry = cat.entries.get(row.key);
      const baseId = await candidateId(lang, entry, baseline(entry));
      wire = id => id === baseId || !id ? 'bundled' : id;
      entries[row.key] = { sourceVersion: row.source_version, selectedId: wire(row.selected_id), candidates: [] };
    }
    if (row.id !== null) entries[row.key].candidates.push({ id: wire(row.id), text: row.text, votes: row.votes });
  }
  return json({ schemaVersion: 1, lang, revision: revision.results[0]?.revision || 0, entries,
    nextCursor: more ? last : null }, 200, PUBLIC);
}

async function overlay(db, lang, cat) {
  const [rows, revision] = await db.batch([
    // json_each() stays the outer loop, as in summarySql.
    db.prepare(`SELECT c.key, c.source_version, c.text FROM json_each(?2) current
      CROSS JOIN translation_entries e ON e.lang = ?1 AND e.key = current.key AND e.source_version = current.value
      JOIN translation_candidates c ON c.id = e.selected_id AND c.hidden = 0
      ORDER BY e.key`).bind(lang, sourceMap(cat)), revisionQuery(db).bind(lang),
  ]);
  const translations = {};
  for (const row of rows.results) {
    const entry = cat.entries.get(row.key);
    if (row.text !== baseline(entry) && validateTranslation(row.text, entry.validation)) {
      translations[row.key] = { text: row.text, sourceVersion: row.source_version };
    }
  }
  return { schemaVersion: 1, lang, revision: revision.results[0]?.revision || 0, translations };
}

// The deployment's build stamp, or null when it cannot be read; the overlay is
// then computed without the cache, as before caching existed.
async function buildStamp(request, env) {
  try {
    const response = await env.ASSETS.fetch(new Request(new URL('/version.json', request.url)));
    if (!response.ok) {
      await response.body?.cancel();
      return null;
    }
    const version = JSON.parse(await response.text())?.version;
    return typeof version === 'string' && STAMP.test(version) ? version : null;
  } catch {
    return null;
  }
}

function overlayReply(request, body, revision, stamp) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': `public, max-age=${OVERLAY_BROWSER_TTL}`,
    'x-content-type-options': 'nosniff',
  };
  // The format and the stamp are part of the tag: a deployment can change the
  // overlay without a vote, and a 304 must never keep an older body.
  const tag = stamp ? `"${OVERLAY_FORMAT}-${revision}-${stamp}"` : null;
  if (tag) {
    headers.etag = tag;
    const wanted = (request.headers.get('if-none-match') || '').split(',').map(value => value.trim().replace(/^W\//, ''));
    if (wanted.includes(tag) || wanted.includes('*')) return new Response(null, { status: 304, headers });
  }
  return new Response(body, { headers });
}

// One primary-key read decides whether the cached overlay is current. Only a miss
// fetches and parses the catalogue and runs the json_each() join.
async function cachedOverlay(request, env, ctx, lang, diagnostic) {
  if (!LANG.test(lang || '')) return error('unknown_language', 404);
  const db = env.COMMUNITY_DB;
  diagnostic.category = 'database';
  const [stamp, current] = await Promise.all([buildStamp(request, env), revisionQuery(db).bind(lang).first()]);
  const cacheKey = revision => new URL(`/api/translations/_overlay/${OVERLAY_FORMAT}/${lang}/${revision}/${stamp}`, request.url).toString();
  if (stamp) {
    let hit = null;
    try { hit = await caches.default.match(cacheKey(current?.revision || 0)); } catch { hit = null; }
    if (hit) {
      const response = overlayReply(request, hit.body, current?.revision || 0, stamp);
      if (response.status === 304) await hit.body?.cancel();
      return response;
    }
  }
  const cat = await catalogue(request, env, lang);
  if (!cat) return error('unknown_language', 404);
  const data = await overlay(db, lang, cat);
  const body = JSON.stringify(data);
  if (stamp) {
    // Keyed on the revision read in the same transaction as the rows, so a vote
    // landing between the lookup above and this batch cannot mislabel the body.
    const stored = new Response(body, { headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${OVERLAY_EDGE_TTL}`,
    } });
    const put = Promise.resolve().then(() => caches.default.put(cacheKey(data.revision), stored)).catch(() => {});
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(put);
    else await put;
  }
  return overlayReply(request, body, data.revision, stamp);
}

export async function cleanupTranslationVotes(env) {
  const db = env.COMMUNITY_DB;
  if (!db || !env.ASSETS) return;
  // Migration rollout may temporarily run a newer Worker against 0001 only.
  if (!await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'translation_votes'").first()) return;
  const langs = await db.prepare('SELECT DISTINCT lang FROM translation_votes').all();
  for (const { lang } of langs.results) {
    const cat = await catalogue(new Request('https://bigcopilot.com/'), env, lang);
    if (!cat) continue; // never discard votes on an unavailable catalogue
    // NOT IN reads json_each() once; a correlated NOT EXISTS rescans it per vote.
    await db.prepare(`DELETE FROM translation_votes WHERE lang = ?1 AND (key, source_version) NOT IN (
      SELECT key, value FROM json_each(?2)
    )`).bind(lang, sourceMap(cat)).run();
  }
}
