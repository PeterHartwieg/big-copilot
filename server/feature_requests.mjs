// Separate visitor-request identity allows exact duplicate vote unions. Curated
// polls keep their existing, incompatible per-feature hashes and cannot merge.
const PREFIX = 'request-';
const ID = /^request-[a-f0-9]{64}$/;
const PAGE_SIZE = 25;
const MAX_ACTIVE = 1000;
const resolve = `SELECT live.id FROM feature_requests original JOIN feature_requests live
  ON live.id = COALESCE(original.canonical_id, original.id) WHERE original.id = ?1 AND live.state = 'active'`;
const selectOne = `SELECT r.id, r.title, r.description, COUNT(v.voter_hash) AS votes,
  MAX(CASE WHEN v.voter_hash = ?2 THEN 1 ELSE 0 END) AS voted
  FROM feature_requests r LEFT JOIN feature_request_votes v ON v.request_id = r.id
  WHERE r.id = (${resolve}) GROUP BY r.id`;
const insertVote = `INSERT INTO feature_request_votes(request_id,voter_hash,created_at)
  SELECT id, ?2, ?3 FROM feature_requests WHERE id = (${resolve}) ON CONFLICT DO NOTHING`;
const feature = row => ({id: PREFIX + row.id, title: row.title, description: row.description,
  votes: row.votes, voted: row.voted === 1});
const invalid = () => ({status: 400, body: {error: 'Invalid request'}});

function text(value, max) {
  if (typeof value !== 'string' || /[<>\p{Cf}\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/u.test(value)) return null;
  const normalized = value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
  return normalized && !/[<>\p{Cf}]/u.test(normalized) && [...normalized].length <= max ? normalized : null;
}
export function isRequestId(id) { return ID.test(id || ''); }

export async function listRequests(db, hash, after = '', diagnostic = {}) {
  if (after && !isRequestId(after)) return invalid();
  const [page] = await db.batch([db.prepare(`WITH page AS (
    SELECT id,title,description FROM feature_requests WHERE state = 'active' AND id > ?1 ORDER BY id LIMIT ?2)
    SELECT page.id,page.title,page.description,COUNT(v.voter_hash) AS votes,
      MAX(CASE WHEN v.voter_hash = ?3 THEN 1 ELSE 0 END) AS voted
    FROM page LEFT JOIN feature_request_votes v ON v.request_id = page.id GROUP BY page.id ORDER BY page.id`)
    .bind(after ? after.slice(PREFIX.length) : '', PAGE_SIZE + 1, hash)]);
  diagnostic.category = "unexpected";
  const rows = page.results;
  return {status: 200, body: {features: rows.slice(0, PAGE_SIZE).map(feature),
    nextAfter: rows.length > PAGE_SIZE ? PREFIX + rows[PAGE_SIZE - 1].id : null}};
}

export async function voteRequest(db, id, hash, now, diagnostic = {}) {
  if (!isRequestId(id)) return invalid();
  const key = id.slice(PREFIX.length);
  const [, result] = await db.batch([db.prepare(insertVote).bind(key, hash, now),
    db.prepare(selectOne).bind(key, hash)]);
  diagnostic.category = "unexpected";
  return result.results[0] ? {status: 200, body: {feature: feature(result.results[0])}}
    : {status: 409, body: {error: 'Feature is unavailable'}};
}

export async function suggestRequest(db, body, hash, now, diagnostic = {}) {
  if (!body || Object.keys(body).length !== 2 || !Object.hasOwn(body, 'title') || !Object.hasOwn(body, 'description')) return invalid();
  const title = text(body.title, 100), description = text(body.description, 1000);
  if (!title || !description) return invalid();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(
    title.toLowerCase() + '\0' + description.toLowerCase()));
  const id = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const [, , result, original] = await db.batch([
    db.prepare(`INSERT INTO feature_requests(id,title,description,created_at,state_changed_at)
      SELECT ?1,?2,?3,?4,?4 WHERE (SELECT COUNT(*) FROM feature_requests WHERE state = 'active') < ?5
      ON CONFLICT DO NOTHING`).bind(id, title, description, now, MAX_ACTIVE),
    db.prepare(insertVote).bind(id, hash, now), db.prepare(selectOne).bind(id, hash),
    db.prepare("SELECT id FROM feature_requests WHERE id = ?1").bind(id),
  ]);
  diagnostic.category = "unexpected";
  return result.results[0] ? {status: 200, body: {feature: feature(result.results[0])}}
    : original.results.length ? {status: 409, body: {error: 'Feature is unavailable'}}
    : {status: 503, body: {error: 'Request list full'}};
}

// Daily cleanup starts at 29 days so closed text is removed within 30 days.
export const cleanupRequestText = (db, now) => db.prepare(`DELETE FROM feature_requests
  WHERE state IN ('hidden','retired','merged') AND state_changed_at <= ?1`).bind(now - 29 * 86400);

export const cleanupRequestVotes = db => db.prepare(`DELETE FROM feature_request_votes
  WHERE request_id NOT IN (SELECT id FROM feature_requests WHERE state = 'active')`);
