// Big Copilot community API: approximate online count and curated feature votes.
// Dependency-free Workers runtime code (Web APIs only). Deliberately outside
// web/ -- web/worker.js is the existing in-browser Python worker.

import FEATURES from "./features.json";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Pseudo IPv4 "overwrite headers" mode fills CF-Connecting-IP with a 240.0.0.0/4
// address; the real client IP then only appears in CF-Connecting-IPv6.
const PSEUDO_IPV4 = /^2(4[0-9]|5[0-5])\./;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const LOCAL_FALLBACK_IP = "127.0.0.1"; // only ever used for localhost requests
const COUNT_WINDOW = 600; // browsers seen in the last ten minutes are online
const HEARTBEAT_AFTER = 300; // browser schedules its next heartbeat after 5 min
const REFRESH_AFTER = 240; // duplicate heartbeats younger than this skip writes
const COUNT_CACHE_TTL = 60;
const MAX_BODY_BYTES = 1024;
// caches.default key only; this path is not a routable endpoint.
const COUNT_CACHE_PATH = "/api/community/_presence-count-v1";

// Presence has its own, tighter limiter: a real tab sends one heartbeat every five
// minutes, so a loop of fresh browser ids cannot inflate the online count on the
// budget meant for voting. Every other route shares COMMUNITY_LIMITER.
const routes = {
  "/api/community/presence": { method: "POST", write: true, handler: presence, limiter: "PRESENCE_LIMITER" },
  "/api/community/vote": { method: "POST", write: true, handler: vote },
  "/api/community/features": { method: "GET", write: false, handler: features },
};

export default {
  async fetch(request, env) {
    try {
      return await handleApi(request, env);
    } catch {
      // Never leak internals: generic JSON for any unhandled failure.
      return json({ error: "Service unavailable" }, 503);
    }
  },
  async scheduled(_controller, env) {
    const db = env.COMMUNITY_DB;
    if (!db) return;
    // The privacy notice promises both: presence rows go within two days, and a
    // poll's vote hashes go once its feature leaves features.json.
    const ids = FEATURES.map((f) => f.id);
    await db.batch([
      db.prepare("DELETE FROM community_presence WHERE last_seen <= ?1")
        .bind(Math.floor(Date.now() / 1000) - 24 * 60 * 60),
      ids.length
        ? db.prepare(`DELETE FROM community_votes WHERE feature_id NOT IN (${ids.map((_, i) => `?${i + 1}`).join(", ")})`).bind(...ids)
        : db.prepare("DELETE FROM community_votes"),
    ]);
  },
};

async function handleApi(request, env) {
  const { pathname, origin } = new URL(request.url);
  if (!pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
  const route = routes[pathname];
  if (!route) return json({ error: "Not found" }, 404);
  if (request.method !== route.method) return json({ error: "Method not allowed" }, 405);
  const { COMMUNITY_DB: db, COMMUNITY_IP_SECRET: secret } = env;
  const limiter = env[route.limiter || "COMMUNITY_LIMITER"];
  if (!db || !limiter || !secret) return json({ error: "Service unavailable" }, 503);
  const ip = clientIp(request);
  if (!ip) return json({ error: "Invalid request" }, 400);
  const sign = await signer(secret);
  const { success } = await limiter.limit({ key: await sign("rate:" + ip) });
  if (!success) return json({ error: "Too many requests" }, 429, { "retry-after": "60" });
  let body = null;
  if (route.write) {
    body = await readJson(request, origin);
    if (body instanceof Response) return body;
    if (body === null) return json({ error: "Invalid request" }, 400);
  }
  return route.handler(request, env, body, ip, sign);
}

async function presence(request, env, body, _ip, _sign) {
  const browserId = singleString(body, "browserId");
  if (!browserId || !UUID_RE.test(browserId)) return json({ error: "Invalid request" }, 400);
  const id = browserId.toLowerCase();
  const db = env.COMMUNITY_DB;
  const now = Math.floor(Date.now() / 1000);
  const cacheUrl = new URL(COUNT_CACHE_PATH, request.url).toString();
  let snapshot = null;
  try {
    const hit = await caches.default.match(cacheUrl);
    if (hit) snapshot = await hit.json();
  } catch {} // cache is best effort; the database stays the source of truth
  // The upsert refreshes last_seen only for rows at least REFRESH_AFTER old, so
  // duplicate heartbeats neither write a fresh row nor change the count. The
  // batch reads observe the upsert atomically; cached counts skip the count scan.
  const statements = [
    db.prepare(
      "INSERT INTO community_presence (browser_id, last_seen) VALUES (?1, ?2) " +
        "ON CONFLICT (browser_id) DO UPDATE SET last_seen = excluded.last_seen " +
        "WHERE community_presence.last_seen <= ?3"
    ).bind(id, now, now - REFRESH_AFTER),
    db.prepare("SELECT last_seen FROM community_presence WHERE browser_id = ?1").bind(id),
  ];
  if (!snapshot) statements.push(
    db.prepare("SELECT COUNT(*) AS n FROM community_presence WHERE last_seen > ?1").bind(now - COUNT_WINDOW),
  );
  const [, row, total] = await db.batch(statements);
  if (!snapshot) {
    snapshot = { count: total.results[0].n, countedAt: now };
    try {
      // Only the public aggregate is cached, never the per-browser response.
      await caches.default.put(
        cacheUrl,
        new Response(JSON.stringify(snapshot), {
          headers: { "content-type": "application/json", "cache-control": `public, max-age=${COUNT_CACHE_TTL}` },
        }),
      );
    } catch {}
  }
  // TTL derives from the stored row, so ignored duplicates keep their real lease.
  const stored = row.results[0]?.last_seen ?? now;
  return json({
    count: snapshot.count,
    countedAt: snapshot.countedAt,
    nextHeartbeatIn: Math.max(1, stored + HEARTBEAT_AFTER - now),
  });
}

async function vote(_request, env, body, ip, sign) {
  const featureId = singleString(body, "featureId");
  const feature = FEATURES.find((f) => f.id === featureId);
  if (!feature) return json({ error: "Unknown feature" }, 400);
  const db = env.COMMUNITY_DB;
  const [, total] = await db.batch([
    // Insert-if-absent keeps retries and double clicks idempotent; totals are
    // always derived from stored votes, never a mutable counter.
    db.prepare(
      "INSERT INTO community_votes (feature_id, voter_hash, created_at) VALUES (?1, ?2, ?3) ON CONFLICT DO NOTHING"
    ).bind(feature.id, await sign(`vote:${feature.id}:${ip}`), Math.floor(Date.now() / 1000)),
    db.prepare("SELECT COUNT(*) AS n FROM community_votes WHERE feature_id = ?1").bind(feature.id),
  ]);
  return json({ feature: { ...feature, votes: total.results[0].n, voted: true } });
}

async function features(_request, env, _body, ip, sign) {
  if (!FEATURES.length) return json({ features: [] });
  const db = env.COMMUNITY_DB;
  const statements = [];
  for (const feature of FEATURES) {
    const voterHash = await sign(`vote:${feature.id}:${ip}`);
    statements.push(
      db.prepare("SELECT COUNT(*) AS n FROM community_votes WHERE feature_id = ?1").bind(feature.id),
      db.prepare("SELECT COUNT(*) AS n FROM community_votes WHERE feature_id = ?1 AND voter_hash = ?2").bind(feature.id, voterHash),
    );
  }
  const results = await db.batch(statements);
  return json({
    features: FEATURES.map((feature, i) => ({
      ...feature,
      votes: results[2 * i].results[0].n,
      voted: results[2 * i + 1].results[0].n > 0,
    })),
  });
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...headers,
    },
  });
}

// One CryptoKey per request, reused by every HMAC in that request; message
// prefixes ("rate:", "vote:") keep the uses domain-separated.
async function signer(secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return async (message) => {
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
    return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  };
}

function clientIp(request) {
  const v6 = request.headers.get("CF-Connecting-IPv6");
  const v4 = request.headers.get("CF-Connecting-IP");
  const ip = v4 && PSEUDO_IPV4.test(v4) ? v6 : v4;
  if (ip) return ip;
  if (LOCAL_HOSTS.has(new URL(request.url).hostname)) return LOCAL_FALLBACK_IP;
  return null;
}

// Rejects cross-origin writes, wrong content types, oversized bodies and
// malformed JSON before any database access. Returns a value, null, or a 413.
async function readJson(request, origin) {
  if (request.headers.get("Origin") !== origin) return null;
  const type = (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json" || !request.body) return null;
  // Enforce the byte cap on the stream itself, not just Content-Length.
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return json({ error: "Request too large" }, 413);
    }
    chunks.push(value);
  }
  const raw = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    raw.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
  } catch {
    return null;
  }
}

// Accepts exactly {"<key>": "<string>"} -- missing/wrong keys, extra keys, null,
// arrays and non-strings are all rejected.
function singleString(data, key) {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  return Object.keys(data).length === 1 && typeof data[key] === "string" ? data[key] : null;
}
