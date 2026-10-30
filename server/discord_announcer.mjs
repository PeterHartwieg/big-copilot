// Announces new changelog entries (web/changelog.json, as deployed) to the BigCopilot
// Discord channel through a webhook, from the minute cron at :07, :22, :37 and :52.
// State is D1 (migrations/0004_discord_announcements.sql) and fails closed: an entry is
// written as pending before its send and cleared only once Discord confirms a message
// id, so an ambiguous delivery stops the announcer until a person resolves it
// (docs/community-features.md, "Discord announcements"), never posts twice.

const WEBHOOK_RE = /^https:\/\/discord\.com\/api\/webhooks\/[0-9]+\/[A-Za-z0-9_-]+$/;
const CHANGELOG_URL = "https://bigcopilot.com/changelog.json";
const MAX_SENDS = 5;
const LEASE_MS = 20 * 60 * 1000; // longer than the 15-minute scheduled wall limit
const COLOR = 0x43c07a;

export function announcerDue(controller) {
  return controller.cron === "* * * * *" && Number.isFinite(controller.scheduledTime) &&
    new Date(controller.scheduledTime).getUTCMinutes() % 15 === 7;
}

// Only application constants reach console output; never the webhook, a response
// body or an exception.
function report(outcome) {
  console.error({
    event: "discord_announcer",
    outcome: ["unconfigured", "invalid_webhook", "configuration", "changelog_unavailable", "invalid_changelog", "leased", "pending", "pending_write_failed", "discord_failed", "record_failed"].includes(outcome) ? outcome : "unexpected",
  });
}

class Stop extends Error {
  constructor(outcome) {
    super("discord announcer stopped");
    this.outcome = outcome;
  }
}

export async function announceChangelog(env) {
  const webhook = env.BIGCOPILOT_DISCORD_WEBHOOK;
  if (!webhook) return report("unconfigured");
  let outcome = null;
  try {
    if (!WEBHOOK_RE.test(webhook)) throw new Stop("invalid_webhook");
    if (!env.COMMUNITY_DB || !env.ASSETS) throw new Stop("configuration");
    await announce(env.COMMUNITY_DB, env.ASSETS, webhook);
  } catch (error) {
    outcome = error instanceof Stop ? error.outcome : "unexpected";
  }
  if (!outcome) return;
  report(outcome);
  // A held lease or a pending entry is a wait, not a failure. The failure carries
  // no cause: the caught error may hold the webhook.
  if (outcome !== "pending" && outcome !== "leased") throw new Error("discord announcer failed");
}

async function announce(db, assets, webhook) {
  const entries = await changelog(assets);
  const now = Date.now();
  const lease = now + LEASE_MS;
  const state = await db.prepare(
    `INSERT INTO discord_announcer_state(id, lease_until) VALUES (1, ?1)
     ON CONFLICT(id) DO UPDATE SET lease_until = excluded.lease_until WHERE lease_until <= ?2
     RETURNING baselined_at, pending_key`,
  ).bind(lease, now).first();
  if (!state) throw new Stop("leased");
  try {
    if (state.pending_key !== null) throw new Stop("pending");
    const at = Math.floor(now / 1000);
    if (state.baselined_at === null) {
      // First run: everything already released counts as seen, and nothing is sent.
      await db.batch([
        ...entries.map((entry) => db.prepare("INSERT OR IGNORE INTO discord_announced(key, announced_at) VALUES (?1, ?2)").bind(entry.key, at)),
        db.prepare("UPDATE discord_announcer_state SET baselined_at = ?1 WHERE id = 1").bind(at),
      ]);
      return;
    }
    const seen = new Set((await db.prepare("SELECT key FROM discord_announced").all()).results.map((row) => row.key));
    const fresh = entries.filter((entry) => !seen.has(entry.key)).reverse().slice(0, MAX_SENDS);
    for (const entry of fresh) {
      const payload = JSON.stringify(message(entry));
      let written;
      try {
        written = await db.prepare(
          `UPDATE discord_announcer_state SET pending_key = ?1, pending_payload = ?2
           WHERE id = 1 AND pending_key IS NULL AND lease_until = ?3`,
        ).bind(entry.key, payload, lease).run();
      } catch {
        throw new Stop("pending_write_failed");
      }
      if (written.meta.changes !== 1) throw new Stop("pending_write_failed");
      const id = await post(webhook, payload);
      try {
        await db.batch([
          db.prepare("INSERT OR IGNORE INTO discord_announced(key, announced_at) VALUES (?1, ?2)").bind(entry.key, Math.floor(Date.now() / 1000)),
          db.prepare("UPDATE discord_announcer_state SET pending_key = NULL, pending_payload = NULL, last_message_id = ?1 WHERE id = 1").bind(id),
        ]);
      } catch {
        throw new Stop("record_failed");
      }
    }
  } finally {
    // A release that fails only delays the next tick until the lease runs out.
    await db.prepare("UPDATE discord_announcer_state SET lease_until = 0 WHERE id = 1 AND lease_until = ?1")
      .bind(lease).run().catch(() => {});
  }
}

// The deployed changelog, newest first, each entry with its identity key. Any
// invalid entry or repeated identity stops the whole tick.
async function changelog(assets) {
  let data;
  try {
    const response = await assets.fetch(new Request(CHANGELOG_URL));
    if (!response.ok) throw new Error();
    data = await response.json();
  } catch {
    throw new Stop("changelog_unavailable");
  }
  const text = (value) => typeof value === "string" && value.trim() !== "";
  if (!Array.isArray(data) || !data.length) throw new Stop("invalid_changelog");
  const keys = new Set();
  const entries = [];
  for (const item of data) {
    if (typeof item !== "object" || item === null || !Number.isInteger(item.pr) || item.pr <= 0 ||
        !text(item.date) || !text(item.title) || !text(item.summary)) throw new Stop("invalid_changelog");
    const key = await sha256(`${item.pr}:${item.title}`);
    if (keys.has(key)) throw new Stop("invalid_changelog");
    keys.add(key);
    entries.push({ key, pr: item.pr, date: item.date, title: item.title, summary: item.summary });
  }
  return entries;
}

async function sha256(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Cut by characters, not UTF-16 units, so a cut never splits an emoji.
function cut(text, limit) {
  const chars = [...text];
  return chars.length > limit ? chars.slice(0, limit).join("") : text;
}

function message(entry) {
  return {
    username: "BigCopilot",
    allowed_mentions: { parse: [] },
    embeds: [{
      title: cut(`BigCopilot update: ${entry.title}`, 256),
      description: cut(entry.summary, 4000),
      url: "https://bigcopilot.com/",
      color: COLOR,
      footer: { text: cut(`Released ${entry.date} · PR #${entry.pr}`, 2048) },
    }],
  };
}

// Discord's message id. Anything else leaves the entry pending.
async function post(webhook, payload) {
  let id;
  try {
    const response = await fetch(`${webhook}?wait=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });
    if (response.ok) id = (await response.json()).id;
  } catch {
    throw new Stop("discord_failed");
  }
  if (typeof id !== "string" || !id) throw new Stop("discord_failed");
  return id;
}
