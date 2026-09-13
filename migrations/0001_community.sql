-- Community tables for the Big Copilot Worker API (presence + feature votes).
-- Local:  npx wrangler d1 migrations apply big-copilot-community --local
-- Remote: npx wrangler d1 migrations apply big-copilot-community --remote
-- No raw IPs, browser fingerprints or save data are stored in these tables.

CREATE TABLE community_presence (
  browser_id TEXT PRIMARY KEY,
  last_seen INTEGER NOT NULL
);

CREATE INDEX community_presence_last_seen_idx ON community_presence (last_seen);

CREATE TABLE community_votes (
  feature_id TEXT NOT NULL,
  voter_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (feature_id, voter_hash)
) WITHOUT ROWID;
