-- The Discord changelog announcer (server/discord_announcer.mjs). Changelog entries
-- already announced, or recorded by the first run's baseline, by identity key.
CREATE TABLE discord_announced (
  key TEXT PRIMARY KEY,
  announced_at INTEGER NOT NULL
) WITHOUT ROWID;
-- One row, written by the first run. The lease keeps overlapping ticks apart; a
-- pending entry is the outbox: written before a send, cleared once Discord confirms.
CREATE TABLE discord_announcer_state (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  lease_until INTEGER NOT NULL DEFAULT 0,
  baselined_at INTEGER,
  pending_key TEXT,
  pending_payload TEXT,
  last_message_id TEXT
);
