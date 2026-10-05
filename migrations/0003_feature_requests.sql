-- Public feature requests retain text/history, never a submitter identity.
CREATE TABLE feature_requests (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','hidden','retired','merged')),
  canonical_id TEXT REFERENCES feature_requests(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  state_changed_at INTEGER NOT NULL DEFAULT 0,
  CHECK((state = 'merged' AND canonical_id IS NOT NULL) OR (state != 'merged' AND canonical_id IS NULL))
);
CREATE INDEX feature_requests_public_idx ON feature_requests(state, id);
CREATE INDEX feature_requests_retention_idx ON feature_requests(state, state_changed_at);
CREATE INDEX feature_requests_alias_idx ON feature_requests(canonical_id);
CREATE INDEX feature_requests_moderation_idx ON feature_requests(created_at, id);
CREATE TABLE feature_request_votes (
  request_id TEXT NOT NULL REFERENCES feature_requests(id) ON DELETE CASCADE,
  voter_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(request_id, voter_hash)
) WITHOUT ROWID;

-- One UPDATE is the operator transaction: union support and flatten aliases.
CREATE TRIGGER feature_requests_restore_cap BEFORE UPDATE OF state ON feature_requests
WHEN NEW.state = 'active' AND OLD.state != 'active'
BEGIN
  SELECT RAISE(ABORT, 'active request limit reached')
    WHERE (SELECT COUNT(*) FROM feature_requests WHERE state = 'active') >= 1000;
END;
CREATE TRIGGER feature_requests_merge_guard BEFORE UPDATE OF state, canonical_id ON feature_requests
WHEN NEW.state = 'merged' AND OLD.state != 'merged'
BEGIN
  SELECT RAISE(ABORT, 'merge requires two distinct active visitor requests')
    WHERE OLD.state != 'active' OR NEW.canonical_id = OLD.id
      OR NOT EXISTS(SELECT 1 FROM feature_requests WHERE id = NEW.canonical_id AND state = 'active');
END;
CREATE TRIGGER feature_requests_merge AFTER UPDATE OF state, canonical_id ON feature_requests
WHEN NEW.state = 'merged' AND OLD.state = 'active'
BEGIN
  INSERT OR IGNORE INTO feature_request_votes(request_id, voter_hash, created_at)
    SELECT NEW.canonical_id, voter_hash, created_at FROM feature_request_votes WHERE request_id = OLD.id;
  DELETE FROM feature_request_votes WHERE request_id = OLD.id;
  UPDATE feature_requests SET canonical_id = NEW.canonical_id WHERE canonical_id = OLD.id AND state = 'merged';
END;
CREATE TRIGGER feature_requests_close AFTER UPDATE OF state ON feature_requests
WHEN NEW.state IN ('hidden','retired')
BEGIN
  DELETE FROM feature_request_votes WHERE request_id = NEW.id;
END;

-- Closure age follows moderation, never the original submission date.
CREATE TRIGGER feature_requests_state_age AFTER UPDATE OF state ON feature_requests
WHEN NEW.state != OLD.state
BEGIN
  UPDATE feature_requests SET state_changed_at = CAST(strftime('%s','now') AS INTEGER) WHERE id = NEW.id;
END;
