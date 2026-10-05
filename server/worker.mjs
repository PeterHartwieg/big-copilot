// Big Copilot community API: approximate online count and curated feature votes,
// and the bug report form's route (POST /api/report), which opens a public
// GitHub issue and keeps the save and the private details in R2 for 30 days.
// Dependency-free Workers runtime code (Web APIs only). Deliberately outside
// web/ -- web/worker.js is the existing in-browser Python worker.

import FEATURES from "./features.json";
import {isRequestId, listRequests, voteRequest, suggestRequest, cleanupRequestVotes, cleanupRequestText} from "./feature_requests.mjs";

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

// A bug report (docs/bug-report-scope.md). The whole multipart body is capped:
// a save is about 5 MB of gzip, so 8 MB leaves it headroom. The report part is
// a small JSON object, the details part the private traceback and settings.
const REPORT_MAX_BYTES = 8 * 1024 * 1024;
const REPORT_TEXT_MAX = 5000;
const REPORT_PART_MAX = 24 * 1024;
const REPORT_DETAILS_MAX = 256 * 1024;
// The error line the issue may show: an exception class and, for Python, the
// deepest frame of its traceback, both read from before any message text
// (web/report.js, brErrorLine()); never the message, which can carry anything
// the save holds.
const REPORT_ERROR = /^[A-Z]\w{0,79}(?: in (?:[A-Za-z_]\w{0,79}|<(?:module|lambda|genexpr|listcomp|dictcomp|setcomp)>) \([A-Za-z_]\w{0,56}\.py line [0-9]{1,7}\))?$/;
const REPORT_PARTS = ["report", "save", "details"];
const REPORT_BROWSERS = { chrome: "Chrome", edge: "Edge", firefox: "Firefox", safari: "Safari", other: "Other" };
const REPORT_SOURCES = { folder: "Save folder", file: "One save file", link: "Game link", none: "No save loaded" };
const REPORT_REPO = "PeterHartwieg/big-copilot";
const REPORT_LABEL = "bug-report";
const REPORT_ISSUE_URL = /^https:\/\/github\.com\/PeterHartwieg\/big-copilot\/issues\/[1-9][0-9]*$/;
const GITHUB_TIMEOUT_MS = 15000;
const REPORT_TRIES = 3;
const REPORT_SWEEP_AFTER_MS = 60 * 60 * 1000;

// Presence has its own, tighter limiter: a real tab sends one heartbeat every five
// minutes, so a loop of fresh browser ids cannot inflate the online count on the
// budget meant for voting. Suggestions have a small separate budget; other routes share COMMUNITY_LIMITER.
// A bug report has a budget of its own, needs no D1 but the R2 bucket and the
// GitHub token, and reads its own multipart body.
const routes = {
  "/api/translations": { operation: "translations", method: "GET", write: false, handler: translations },
  "/api/translations/entry": { operation: "translations", method: "GET", write: false, handler: translations },
  "/api/translations/overlay": { operation: "translations", method: "GET", write: false, handler: translations },
  "/api/translations/suggest": { operation: "translations", method: "POST", write: true, handler: translations, maxBodyBytes: 16384 },
  "/api/translations/vote": { operation: "translations", method: "POST", write: true, handler: translations },
  "/api/community/presence": { operation: "presence", method: "POST", write: true, handler: presence, limiter: "PRESENCE_LIMITER" },
  "/api/community/vote": { operation: "vote", method: "POST", write: true, handler: vote },
  "/api/community/suggest": { operation: "features", method: "POST", write: true, handler: suggest, maxBodyBytes: 8192, limiter: "SUGGEST_LIMITER" },
  "/api/community/features": { operation: "features", method: "GET", write: false, handler: features },
  "/api/report": {
    operation: "report", method: "POST", write: false, handler: report, limiter: "REPORT_LIMITER",
    database: false, bindings: ["REPORTS", "GITHUB_REPORT_TOKEN"],
  },
};

export default {
  async fetch(request, env, ctx) {
    const diagnostic = { operation: "request", category: "unexpected" };
    try {
      return await handleApi(request, env, diagnostic, ctx);
    } catch {
      reportFailure(diagnostic);
      // Never leak internals: generic JSON for any unhandled failure.
      return json({ error: "Service unavailable" }, 503);
    }
  },
  async scheduled(controller, env) {
    // A bug report folder whose issue never opened goes at the next run that finds
    // it over an hour old, with bounded progress across runs, whatever stopped the request
    // (docs/community-features.md, "Bug reports").
    // The cleanups run side by side and each is awaited to its end, so one
    // failing never cuts the other short.
    const reportTick = controller.cron === "* * * * *";
    const dailyTick = controller.cron !== "* * * * *";
    const db = dailyTick ? env.COMMUNITY_DB : null;
    const results = await Promise.allSettled([
      env.REPORTS && (reportTick || !controller.cron) ? sweepReports(env.REPORTS) : null,
      db && env.ASSETS ? (async () => {
        const { cleanupTranslationVotes } = await import("./translations.mjs");
        return cleanupTranslationVotes(env);
      })() : null,
      // The privacy notice promises both: presence rows go within two days, and a
      // poll's vote hashes go once its curated option or stored request closes.
      db ? (async () => db.batch([
        db.prepare("DELETE FROM community_presence WHERE last_seen <= ?1")
          .bind(Math.floor(Date.now() / 1000) - 24 * 60 * 60),
        FEATURES.length
          ? db.prepare(`DELETE FROM community_votes WHERE feature_id NOT IN (${FEATURES.map((_, i) => `?${i + 1}`).join(", ")})`).bind(...FEATURES.map((f) => f.id))
          : db.prepare("DELETE FROM community_votes"),
        cleanupRequestVotes(db),
        cleanupRequestText(db, Math.floor(Date.now() / 1000)),
      ]))() : null,
    ]);
    const failed = results.find((r) => r.status === "rejected");
    if (failed) throw failed.reason;
  },
};

// Only application constants reach console output; never inspect an exception.
function reportFailure({ operation, category }) {
  console.error({
    event: "community_api_failure",
    operation: ["presence", "vote", "features", "report", "translations"].includes(operation) ? operation : "request",
    category: ["configuration", "limiter", "database", "storage", "github"].includes(category) ? category : "unexpected",
  });
}

async function handleApi(request, env, diagnostic, ctx) {
  const { pathname, origin } = new URL(request.url);
  if (!pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
  const route = routes[pathname];
  if (!route) return json({ error: "Not found" }, 404);
  if (request.method !== route.method) return json({ error: "Method not allowed" }, 405);
  diagnostic.operation = route.operation;
  const { COMMUNITY_DB: db, COMMUNITY_IP_SECRET: secret } = env;
  const limiter = env[route.limiter || "COMMUNITY_LIMITER"];
  const unbound = (route.database !== false && !db) || (route.bindings || []).some((name) => !env[name]);
  if (unbound || !limiter || !secret) {
    reportFailure({ operation: route.operation, category: "configuration" });
    return json({ error: "Service unavailable" }, 503);
  }
  const ip = clientIp(request);
  if (!ip) return json({ error: "Invalid request" }, 400);
  const sign = await signer(secret);
  const key = await sign("rate:" + ip);
  diagnostic.category = "limiter";
  const { success } = await limiter.limit({ key });
  diagnostic.category = "unexpected";
  if (!success) return json({ error: "Too many requests" }, 429, { "retry-after": "60" });
  let body = null;
  if (route.write) {
    body = await readJson(request, origin, route.maxBodyBytes);
    if (body instanceof Response) return body;
    if (body === null) return json({ error: "Invalid request" }, 400);
  }
  return route.handler(request, env, body, ip, sign, diagnostic, ctx);
}

async function presence(request, env, body, _ip, _sign, diagnostic) {
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
  diagnostic.category = "database";
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
  diagnostic.category = "unexpected";
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

async function vote(_request, env, body, ip, sign, diagnostic) {
  const featureId = singleString(body, "featureId");
  if (isRequestId(featureId)) {
    diagnostic.category = "database";
    const result = await voteRequest(env.COMMUNITY_DB, featureId, await sign(`request-vote:${ip}`), Math.floor(Date.now() / 1000), diagnostic);
    diagnostic.category = "unexpected";
    return json(result.body, result.status);
  }
  const feature = FEATURES.find((f) => f.id === featureId);
  if (!feature) return json({ error: "Unknown feature" }, 400);
  const db = env.COMMUNITY_DB;
  const voterHash = await sign(`vote:${feature.id}:${ip}`);
  diagnostic.category = "database";
  const [, total] = await db.batch([
    // Insert-if-absent keeps retries and double clicks idempotent; totals are
    // always derived from stored votes, never a mutable counter.
    db.prepare(
      "INSERT INTO community_votes (feature_id, voter_hash, created_at) VALUES (?1, ?2, ?3) ON CONFLICT DO NOTHING"
    ).bind(feature.id, voterHash, Math.floor(Date.now() / 1000)),
    db.prepare("SELECT COUNT(*) AS n FROM community_votes WHERE feature_id = ?1").bind(feature.id),
  ]);
  diagnostic.category = "unexpected";
  return json({ feature: { ...feature, votes: total.results[0].n, voted: true } });
}

async function suggest(_request, env, body, ip, sign, diagnostic) {
  diagnostic.category = "database";
  const result = await suggestRequest(env.COMMUNITY_DB, body, await sign(`request-vote:${ip}`), Math.floor(Date.now() / 1000), diagnostic);
  diagnostic.category = "unexpected";
  return json(result.body, result.status);
}

async function features(request, env, _body, ip, sign, diagnostic) {
  const after = new URL(request.url).searchParams.get("after") || "";
  if (after && !isRequestId(after)) return json({error: "Invalid request"}, 400);
  diagnostic.category = "database";
  const visitor = await listRequests(env.COMMUNITY_DB, await sign(`request-vote:${ip}`), after, diagnostic);
  diagnostic.category = "unexpected";
  if (after || !FEATURES.length) return json(visitor.body);
  const db = env.COMMUNITY_DB;
  const statements = [];
  for (const feature of FEATURES) {
    const voterHash = await sign(`vote:${feature.id}:${ip}`);
    diagnostic.category = "database";
    statements.push(
      db.prepare("SELECT COUNT(*) AS n FROM community_votes WHERE feature_id = ?1").bind(feature.id),
      db.prepare("SELECT COUNT(*) AS n FROM community_votes WHERE feature_id = ?1 AND voter_hash = ?2").bind(feature.id, voterHash),
    );
    diagnostic.category = "unexpected";
  }
  diagnostic.category = "database";
  const results = await db.batch(statements);
  diagnostic.category = "unexpected";
  return json({
    features: [...FEATURES.map((feature, i) => ({
      ...feature,
      votes: results[2 * i].results[0].n,
      voted: results[2 * i + 1].results[0].n > 0,
    })), ...visitor.body.features],
    nextAfter: visitor.body.nextAfter,
  });
}

/* --- bug reports ------------------------------------------------------------ */

// POST /api/report takes multipart/form-data: a `report` part (a small JSON
// object), an optional `save` part and an optional `details` part, the last
// two only when the player ticked them. The attachments go to R2 first, under a
// random folder; then the issue opens. If GitHub fails the folder is deleted
// again, so no save sits in R2 without an issue that names it. Only the
// validated fields of the report part reach the public issue: the save and the
// details are stored as they came and never read here (a broken save is exactly
// what gets reported, so there is no gzip check and no decompression).
async function report(request, env, _body, _ip, _sign, diagnostic, ctx) {
  const { origin } = new URL(request.url);
  if (request.headers.get("Origin") !== origin) return json({ error: "Invalid request" }, 400);
  const type = (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (type !== "multipart/form-data" || !request.body) return json({ error: "Invalid request" }, 400);
  // Content-Length first, so an oversized upload is refused before it is read;
  // readCapped() then holds the stream to the same cap whatever the header said.
  const declared = request.headers.get("Content-Length");
  if (declared === null || !/^[0-9]{1,12}$/.test(declared)) return json({ error: "Length required" }, 411);
  if (Number(declared) > REPORT_MAX_BYTES) return json({ error: "Request too large" }, 413);
  const raw = await readCapped(request.body, REPORT_MAX_BYTES);
  if (!raw) return json({ error: "Request too large" }, 413);
  let form;
  try {
    form = await new Response(raw, { headers: { "content-type": request.headers.get("Content-Type") } }).formData();
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const parts = reportParts(form);
  const facts = parts && reportFacts(parts.report, parts.details !== null);
  if (!facts) return json({ error: "Invalid request" }, 400);
  // From the first write to the issue or the cleanup is one piece of work. A
  // player closing the tab cancels the request; waitUntil() keeps the work
  // running to its end, so a write is never left without its issue or its
  // cleanup.
  const work = fileReport(env, parts, facts, diagnostic);
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(work.catch(() => {}));
  return work;
}

async function fileReport(env, parts, facts, diagnostic) {
  const attached = { save: parts.save !== null, details: parts.details !== null };
  const folder = attached.save || attached.details
    ? `${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID()}` : "";
  const written = [];
  if (folder) {
    diagnostic.category = "storage";
    try {
      const put = async (name, value, contentType) => {
        const key = `${folder}/${name}`;
        written.push(key); // before the put: one that throws may still have landed
        await env.REPORTS.put(key, value, { httpMetadata: { contentType } });
      };
      const { text: _text, error: _error, ...shared } = facts;
      await put("report.json", JSON.stringify({ ...shared, ...attached, receivedAt: new Date().toISOString() }), "application/json");
      if (attached.details) await put("details.json", parts.details, "text/plain; charset=utf-8");
      if (attached.save) await put("save.hsg", await parts.save.arrayBuffer(), "application/octet-stream");
    } catch {
      await removeReport(env.REPORTS, written);
      reportFailure({ operation: "report", category: "storage" });
      return json({ error: "Service unavailable" }, 503);
    }
  }
  diagnostic.category = "github";
  let issue = null;
  try {
    issue = await openIssue(env.GITHUB_REPORT_TOKEN, reportTitle(facts), reportBody(facts, folder, attached));
  } catch {
    issue = null;
  }
  diagnostic.category = "unexpected";
  if (!issue) {
    // A folder that could not be removed is a storage failure: it now sits in
    // R2 without an issue for the report sweep; the 30-day lifecycle is the last net.
    const cleaned = await removeReport(env.REPORTS, written);
    reportFailure({ operation: "report", category: cleaned ? "github" : "storage" });
    return json({ error: "Service unavailable" }, 503);
  }
  // The folder now has its issue: say so in it, so the report sweep keeps it.
  // Should even that write fail, the sweep removes a save whose issue exists,
  // never the other way round.
  if (folder) {
    const marked = await retried(() => env.REPORTS.put(`${folder}/issue.json`, JSON.stringify(issue), {
      httpMetadata: { contentType: "application/json" },
    }));
    if (!marked) reportFailure({ operation: "report", category: "storage" });
  }
  return json({ issue }, 201);
}

// The three known parts, each at most once and within its own cap, or null.
function reportParts(form) {
  const names = [...form.keys()];
  if (names.length !== new Set(names).size || names.some((name) => !REPORT_PARTS.includes(name))) return null;
  const report = form.get("report");
  const save = form.get("save");
  const details = form.get("details");
  const bytes = (text) => new TextEncoder().encode(text).byteLength;
  if (typeof report !== "string" || bytes(report) > REPORT_PART_MAX) return null;
  if (save !== null && (typeof save === "string" || !(save.size > 0) || save.size > REPORT_MAX_BYTES)) return null;
  if (details !== null && (typeof details !== "string" || !details || bytes(details) > REPORT_DETAILS_MAX)) return null;
  return { report, save, details };
}

// The report part, held to exactly the fields the issue may show: the player's
// text, the site and game builds, the browser family, the source and, only when
// the technical details are attached, the error's class and place. Anything else, an
// unknown key or a value outside its allowlist, rejects the report.
function reportFacts(raw, withDetails) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const keys = ["text", "siteBuild", "gameBuild", "browser", "source", "error"];
  if (Object.keys(data).some((key) => !keys.includes(key))) return null;
  const { text, siteBuild, gameBuild = null, browser, source, error = null } = data;
  if (typeof text !== "string" || text.length > REPORT_TEXT_MAX) return null;
  const said = text.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim();
  if (!said) return null;
  if (typeof siteBuild !== "string" || !/^(?:[0-9a-f]{10}|dev)$/.test(siteBuild)) return null;
  if (gameBuild !== null && !(Number.isSafeInteger(gameBuild) && gameBuild > 0 && gameBuild < 1000000)) return null;
  if (typeof browser !== "string" || !Object.hasOwn(REPORT_BROWSERS, browser)) return null;
  if (typeof source !== "string" || !Object.hasOwn(REPORT_SOURCES, source)) return null;
  if (error !== null && (typeof error !== "string" || !REPORT_ERROR.test(error) || !withDetails)) return null;
  return { text: said, siteBuild, gameBuild, browser, source, error };
}

function reportTitle(facts) {
  const first = facts.text.split("\n").map((line) => line.replace(/\s+/g, " ").trim()).find(Boolean) || "";
  const chars = [...first];
  return `Bug report: ${chars.length > 60 ? chars.slice(0, 59).join("") + "…" : first}`;
}

// Player text and the error line sit in fenced code blocks, so the issue
// renders no link, image, mention or markup from them; every other value comes
// from an allowlist, a pattern or the random folder name.
function fenced(text) {
  const runs = text.match(/`+/g) || [];
  const tick = "`".repeat(Math.max(3, ...runs.map((run) => run.length + 1)));
  return `${tick}text\n${text}\n${tick}`;
}

function reportBody(facts, folder, attached) {
  const yes = (on) => (on ? "yes" : "no");
  const rows = [
    ["Site build", "`" + facts.siteBuild + "`"],
    ["Game build", facts.gameBuild === null ? "unknown" : String(facts.gameBuild)],
    ["Browser", REPORT_BROWSERS[facts.browser]],
    ["Source", REPORT_SOURCES[facts.source]],
    ["Save attached", yes(attached.save)],
    ["Technical details attached", yes(attached.details)],
  ];
  if (folder) rows.push(["Private folder", "`" + folder + "`"]);
  const lines = [
    "Sent with the bug report form on the site.",
    "",
    "### What went wrong",
    "",
    fenced(facts.text),
    "",
    "### Details",
    "",
    "| | |",
    "| --- | --- |",
    ...rows.map(([name, value]) => `| ${name} | ${value} |`),
  ];
  if (facts.error) lines.push("", "### Error", "", fenced(facts.error));
  if (folder) lines.push("", "The attachments are kept privately for 30 days and are never published here.");
  return lines.join("\n");
}

async function openIssue(token, title, body) {
  const res = await fetch(`https://api.github.com/repos/${REPORT_REPO}/issues`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
      "user-agent": "big-copilot-report",
      "x-github-api-version": "2022-11-28",
    },
    body: JSON.stringify({ title, body, labels: [REPORT_LABEL] }),
    signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
  });
  if (res.status !== 201) return null;
  const data = await res.json();
  const number = data && data.number;
  const url = data && data.html_url;
  if (!Number.isSafeInteger(number) || number < 1 || typeof url !== "string" || !REPORT_ISSUE_URL.test(url)) return null;
  return { number, url };
}

// True when nothing of the report is left in R2. A delete that still fails is
// caught by the report sweep.
async function removeReport(bucket, keys) {
  return !keys.length || retried(() => bucket.delete(keys));
}

// Three tries a short pause apart: an R2 hiccup should not leave a save behind.
async function retried(task) {
  for (let attempt = 0; attempt < REPORT_TRIES; attempt++) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    try {
      await task();
      return true;
    } catch {}
  }
  return false;
}

// The minute cron's part for bug reports: every folder without issue.json whose
// newest object is over an hour old lost its issue to a failure the request
// could not clean up after (a delete that kept failing, or the Worker stopped
// mid-request). An hour is far beyond any request; the 30-day lifecycle rule
// stays the last net.
const REPORT_SWEEP_CHECKPOINT = "_bigcopilot-report-sweep-v1.json";
const REPORT_SWEEP_CALLS = 192;
// Longer than the 15-minute scheduled invocation wall limit: a stopped run
// cannot keep the next checkpoint owner out indefinitely.
const REPORT_SWEEP_LEASE_MS = 16 * 60 * 1000;

async function sweepReports(bucket, now = Date.now()) {
  // Reserve the last call for a checkpoint, including on a failed operation.
  let remaining = REPORT_SWEEP_CALLS - 3;
  const saved = await bucket.get(REPORT_SWEEP_CHECKPOINT);
  let state = { version: 2, after: "", folder: null, phase: "scan", cursor: null, partAfter: "", end: false };
  if (saved && saved.size > 8192 && saved.body) await saved.body.cancel();
  if (saved && saved.size <= 8192) {
    let candidate;
    try { candidate = await saved.json(); } catch { /* Repair invalid JSON below. */ }
    if (candidate && candidate.version === 2 && typeof candidate.after === "string"
        && candidate.after.length <= 1024 && ["scan", "validate", "delete"].includes(candidate.phase)
        && (candidate.cursor === null || (typeof candidate.cursor === "string" && candidate.cursor.length <= 4096))
        && typeof candidate.partAfter === "string" && candidate.partAfter.length <= 1024
        && typeof candidate.end === "boolean"
        && (candidate.phase === "scan" || candidate.folder)
        && (!candidate.folder || (typeof candidate.folder.name === "string"
          && candidate.folder.name.length > 0 && candidate.folder.name.length <= 1024
          && !candidate.folder.name.includes("/") && typeof candidate.folder.issue === "boolean"
          && Number.isFinite(candidate.folder.newest)))) state = candidate;
  }
  if (Number.isFinite(state.leaseUntil) && state.leaseUntil > now
      && state.leaseUntil <= now + REPORT_SWEEP_LEASE_MS) return;
  // R2 conditional writes elect one checkpoint owner even when minute events
  // overlap. A crashed owner's lease expires; the final ETag fence prevents an
  // old owner from overwriting progress committed by a replacement.
  state.leaseUntil = now + REPORT_SWEEP_LEASE_MS;
  const lease = await bucket.put(REPORT_SWEEP_CHECKPOINT, JSON.stringify(state), {
    onlyIf: saved ? {etagMatches: saved.etag} : {etagDoesNotMatch: "*"},
    httpMetadata: {contentType: "application/json"},
  });
  if (!lease) return;
  const call = async (method, ...args) => { remaining--; return bucket[method](...args); };
  const finish = () => { state.folder = null; state.phase = "scan"; state.cursor = null; state.partAfter = ""; };
  let page = null, index = 0;
  try {
    while (remaining >= 4) {
      if (state.phase !== "scan") {
        const prefix = `${state.folder.name}/`;
        const changed = object => object.key === `${prefix}issue.json`
          || (new Date(object.uploaded).getTime() || now) > state.folder.newest;
        let part;
        try {
          part = await call("list", { prefix, ...(state.cursor ? {cursor: state.cursor}
            : {startAfter: state.partAfter || undefined}), limit: 1000 });
        } catch (error) {
          if (!state.cursor) throw error;
          // Only empty truncated pages need an opaque cursor. If one expires,
          // resume from the last returned key instead of retrying it forever.
          state.cursor = null;
          part = await call("list", { prefix, startAfter: state.partAfter || undefined, limit: 1000 });
        }
        if (part.objects.some(changed)) { finish(); continue; }
        if (state.phase === "delete") {
          // No atomic folder deletion: check late markers before every batch,
          // and never delete markers or objects newer than the accepted snapshot.
          if (await call("head", `${prefix}issue.json`)) { finish(); continue; }
          if (part.objects.length) await call("delete", part.objects.map(object => object.key));
        }
        if (part.objects.length) state.partAfter = part.objects.at(-1).key;
        state.cursor = part.truncated && !part.objects.length ? part.cursor : null;
        if (!part.truncated) {
          if (state.phase === "validate") { state.phase = "delete"; state.partAfter = ""; }
          else finish();
        }
        continue;
      }
      if (state.end) {
        // Start a new cycle next invocation. New keys behind the checkpoint
        // are visited then; retained folders cannot starve later folders.
        state.after = ""; state.end = false; state.cursor = null;
        break;
      }
      if (!page) {
        try {
          page = await call("list", { ...(state.cursor ? { cursor: state.cursor }
            : { startAfter: state.after || undefined }), limit: 1000 });
        } catch (error) {
          if (!state.cursor) throw error;
          state.cursor = null;
          page = await call("list", { startAfter: state.after || undefined, limit: 1000 });
        }
        index = 0;
      }
      if (index === page.objects.length) {
        state.cursor = page.truncated && !page.objects.length ? page.cursor : null;
        if (!page.truncated) {
          state.end = true;
          if (state.folder && !state.folder.issue && now - state.folder.newest > REPORT_SWEEP_AFTER_MS)
            state.phase = "validate";
          else finish();
        }
        page = null;
        continue;
      }
      const object = page.objects[index];
      const cut = object.key.indexOf("/");
      const name = cut < 1 ? null : object.key.slice(0, cut);
      if (name && state.folder && state.folder.name !== name) {
        if (!state.folder.issue && now - state.folder.newest > REPORT_SWEEP_AFTER_MS) {
          state.phase = "validate"; state.cursor = null;
        } else finish();
        continue;
      }
      state.after = object.key;
      state.cursor = null;
      index++;
      if (!name) continue;
      if (!state.folder) state.folder = { name, issue: false, newest: 0 };
      state.folder.issue ||= object.key.slice(cut + 1) === "issue.json";
      state.folder.newest = Math.max(state.folder.newest, new Date(object.uploaded).getTime() || now);
    }
  } finally {
    state.leaseUntil = 0;
    await bucket.put(REPORT_SWEEP_CHECKPOINT, JSON.stringify(state), {
      onlyIf: {etagMatches: lease.etag},
      httpMetadata: { contentType: "application/json" },
    });
  }
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
async function readJson(request, origin, maxBytes = MAX_BODY_BYTES) {
  if (request.headers.get("Origin") !== origin) return null;
  const type = (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json" || !request.body) return null;
  const raw = await readCapped(request.body, maxBytes);
  if (!raw) return json({ error: "Request too large" }, 413);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
  } catch {
    return null;
  }
}

// The body's bytes, or null once they pass `limit`. The cap is enforced on the
// stream itself, not just on Content-Length.
async function readCapped(body, limit) {
  const reader = body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const raw = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    raw.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return raw;
}

// Accepts exactly {"<key>": "<string>"} -- missing/wrong keys, extra keys, null,
// arrays and non-strings are all rejected.
function singleString(data, key) {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  return Object.keys(data).length === 1 && typeof data[key] === "string" ? data[key] : null;
}

// Loaded only for this route; the feature/presence service stays independent.
async function translations(...args) {
  const { handleTranslations } = await import("./translations.mjs");
  return handleTranslations(...args);
}
