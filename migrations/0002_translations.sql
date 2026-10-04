-- Translation text is public. Only active votes carry a source-scoped HMAC;
-- candidate history stores no author, browser id, IP address or save data.
CREATE TABLE translation_entries (
  lang TEXT NOT NULL,
  key TEXT NOT NULL,
  source_version TEXT NOT NULL,
  selected_id TEXT,
  pinned_id TEXT,
  PRIMARY KEY (lang, key, source_version)
) WITHOUT ROWID;

CREATE TABLE translation_candidates (
  id TEXT PRIMARY KEY,
  lang TEXT NOT NULL,
  key TEXT NOT NULL,
  source_version TEXT NOT NULL,
  text TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)),
  created_at INTEGER NOT NULL,
  FOREIGN KEY (lang, key, source_version) REFERENCES translation_entries(lang, key, source_version),
  UNIQUE (lang, key, source_version, text)
);
CREATE INDEX translation_candidates_entry ON translation_candidates(lang, key, source_version, hidden);
CREATE INDEX translation_candidates_recent ON translation_candidates(created_at DESC);

CREATE TABLE translation_votes (
  lang TEXT NOT NULL,
  key TEXT NOT NULL,
  source_version TEXT NOT NULL,
  voter_hash TEXT NOT NULL,
  candidate_id TEXT NOT NULL REFERENCES translation_candidates(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (lang, key, source_version, voter_hash)
) WITHOUT ROWID;
CREATE INDEX translation_votes_candidate ON translation_votes(candidate_id);

CREATE TABLE translation_revisions (
  lang TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;

-- Winner and revision changes share the mutation transaction. Ties keep the incumbent.
CREATE TRIGGER translation_candidate_insert AFTER INSERT ON translation_candidates
BEGIN
  UPDATE translation_entries SET selected_id = (
    SELECT c.id FROM translation_candidates c
    JOIN translation_entries e ON e.lang = c.lang AND e.key = c.key AND e.source_version = c.source_version
    WHERE c.lang = NEW.lang AND c.key = NEW.key AND c.source_version = NEW.source_version
      AND c.hidden = 0
    ORDER BY (c.id = e.pinned_id) IS TRUE DESC,
      (SELECT COUNT(*) FROM translation_votes v WHERE v.candidate_id = c.id) DESC,
      (c.id = e.selected_id) IS TRUE DESC, c.created_at ASC, c.id ASC
    LIMIT 1
  ) WHERE lang = NEW.lang AND key = NEW.key AND source_version = NEW.source_version;
  INSERT INTO translation_revisions (lang, revision) VALUES (NEW.lang, 1)
    ON CONFLICT(lang) DO UPDATE SET revision = revision + 1;
END;

-- Winner and revision changes share the mutation transaction. Ties keep the incumbent.
CREATE TRIGGER translation_candidate_hide AFTER UPDATE OF hidden ON translation_candidates
BEGIN
  UPDATE translation_entries SET pinned_id = NULL
    WHERE lang = NEW.lang AND key = NEW.key AND source_version = NEW.source_version
      AND pinned_id = NEW.id AND NEW.hidden = 1;
  UPDATE translation_entries SET selected_id = (
    SELECT c.id FROM translation_candidates c
    JOIN translation_entries e ON e.lang = c.lang AND e.key = c.key AND e.source_version = c.source_version
    WHERE c.lang = NEW.lang AND c.key = NEW.key AND c.source_version = NEW.source_version
      AND c.hidden = 0
    ORDER BY (c.id = e.pinned_id) IS TRUE DESC,
      (SELECT COUNT(*) FROM translation_votes v WHERE v.candidate_id = c.id) DESC,
      (c.id = e.selected_id) IS TRUE DESC, c.created_at ASC, c.id ASC
    LIMIT 1
  ) WHERE lang = NEW.lang AND key = NEW.key AND source_version = NEW.source_version;
  INSERT INTO translation_revisions (lang, revision) VALUES (NEW.lang, 1)
    ON CONFLICT(lang) DO UPDATE SET revision = revision + 1;
END;

-- Winner and revision changes share the mutation transaction. Ties keep the incumbent.
CREATE TRIGGER translation_vote_insert AFTER INSERT ON translation_votes
BEGIN
  UPDATE translation_entries SET selected_id = (
    SELECT c.id FROM translation_candidates c
    JOIN translation_entries e ON e.lang = c.lang AND e.key = c.key AND e.source_version = c.source_version
    WHERE c.lang = NEW.lang AND c.key = NEW.key AND c.source_version = NEW.source_version
      AND c.hidden = 0
    ORDER BY (c.id = e.pinned_id) IS TRUE DESC,
      (SELECT COUNT(*) FROM translation_votes v WHERE v.candidate_id = c.id) DESC,
      (c.id = e.selected_id) IS TRUE DESC, c.created_at ASC, c.id ASC
    LIMIT 1
  ) WHERE lang = NEW.lang AND key = NEW.key AND source_version = NEW.source_version;
  INSERT INTO translation_revisions (lang, revision) VALUES (NEW.lang, 1)
    ON CONFLICT(lang) DO UPDATE SET revision = revision + 1;
END;

-- Winner and revision changes share the mutation transaction. Ties keep the incumbent.
CREATE TRIGGER translation_vote_switch AFTER UPDATE OF candidate_id ON translation_votes
BEGIN
  UPDATE translation_entries SET selected_id = (
    SELECT c.id FROM translation_candidates c
    JOIN translation_entries e ON e.lang = c.lang AND e.key = c.key AND e.source_version = c.source_version
    WHERE c.lang = NEW.lang AND c.key = NEW.key AND c.source_version = NEW.source_version
      AND c.hidden = 0
    ORDER BY (c.id = e.pinned_id) IS TRUE DESC,
      (SELECT COUNT(*) FROM translation_votes v WHERE v.candidate_id = c.id) DESC,
      (c.id = e.selected_id) IS TRUE DESC, c.created_at ASC, c.id ASC
    LIMIT 1
  ) WHERE lang = NEW.lang AND key = NEW.key AND source_version = NEW.source_version;
  INSERT INTO translation_revisions (lang, revision) VALUES (NEW.lang, 1)
    ON CONFLICT(lang) DO UPDATE SET revision = revision + 1;
END;

-- Winner and revision changes share the mutation transaction. Ties keep the incumbent.
CREATE TRIGGER translation_vote_delete AFTER DELETE ON translation_votes
BEGIN
  UPDATE translation_entries SET selected_id = (
    SELECT c.id FROM translation_candidates c
    JOIN translation_entries e ON e.lang = c.lang AND e.key = c.key AND e.source_version = c.source_version
    WHERE c.lang = OLD.lang AND c.key = OLD.key AND c.source_version = OLD.source_version
      AND c.hidden = 0
    ORDER BY (c.id = e.pinned_id) IS TRUE DESC,
      (SELECT COUNT(*) FROM translation_votes v WHERE v.candidate_id = c.id) DESC,
      (c.id = e.selected_id) IS TRUE DESC, c.created_at ASC, c.id ASC
    LIMIT 1
  ) WHERE lang = OLD.lang AND key = OLD.key AND source_version = OLD.source_version;
  INSERT INTO translation_revisions (lang, revision) VALUES (OLD.lang, 1)
    ON CONFLICT(lang) DO UPDATE SET revision = revision + 1;
END;

-- Pinning is an operator action. It restores hidden text and picks it atomically.
CREATE TRIGGER translation_pin AFTER UPDATE OF pinned_id ON translation_entries
BEGIN
  UPDATE translation_candidates SET hidden = 0 WHERE id = NEW.pinned_id AND hidden <> 0;
  UPDATE translation_entries SET selected_id = (
    SELECT c.id FROM translation_candidates c
    JOIN translation_entries e ON e.lang = c.lang AND e.key = c.key AND e.source_version = c.source_version
    WHERE c.lang = NEW.lang AND c.key = NEW.key AND c.source_version = NEW.source_version
      AND c.hidden = 0
    ORDER BY (c.id = e.pinned_id) IS TRUE DESC,
      (SELECT COUNT(*) FROM translation_votes v WHERE v.candidate_id = c.id) DESC,
      (c.id = e.selected_id) IS TRUE DESC, c.created_at ASC, c.id ASC
    LIMIT 1
  ) WHERE lang = NEW.lang AND key = NEW.key AND source_version = NEW.source_version;
  INSERT INTO translation_revisions (lang, revision) VALUES (NEW.lang, 1)
    ON CONFLICT(lang) DO UPDATE SET revision = revision + 1;
END;
