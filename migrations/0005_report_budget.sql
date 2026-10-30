-- Global daily budget for POST /api/report (server/worker.mjs, REPORT_DAILY_CAP).
-- One row per UTC day; n is how many valid reports have claimed a slot that day.
-- No client identity, report text or save data is stored here.
CREATE TABLE report_budget (
  day TEXT PRIMARY KEY,
  n INTEGER NOT NULL
) WITHOUT ROWID;
