-- Contractor timesheets schema (SQLite).
-- Times are stored in UTC as 'YYYY-MM-DDTHH:MM:SSZ' text, so string order = time order.
-- Money is integer cents, durations are integer minutes. No floats.

CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL,
  role       TEXT    NOT NULL CHECK (role IN ('contractor', 'client')),
  time_zone  TEXT    NOT NULL -- IANA name, e.g. 'Asia/Jakarta'
);

-- Who works for whom, at what rate.
CREATE TABLE IF NOT EXISTS engagements (
  id                 INTEGER PRIMARY KEY,
  contractor_id      INTEGER NOT NULL REFERENCES users (id),
  client_id          INTEGER NOT NULL REFERENCES users (id),
  hourly_rate_cents  INTEGER NOT NULL CHECK (hourly_rate_cents > 0),
  UNIQUE (contractor_id, client_id)
);

CREATE TABLE IF NOT EXISTS time_entries (
  id             INTEGER PRIMARY KEY,
  engagement_id  INTEGER NOT NULL REFERENCES engagements (id),
  start_utc      TEXT    NOT NULL,
  end_utc        TEXT    NOT NULL,
  -- Derived once at save, from the contractor's time zone:
  minutes        INTEGER NOT NULL CHECK (minutes > 0),  -- real elapsed minutes
  work_date      TEXT    NOT NULL,                       -- contractor-local day the entry starts
  week_start     TEXT    NOT NULL,                       -- Monday of that day's week
  note           TEXT    NOT NULL DEFAULT '',
  created_at     TEXT    NOT NULL,
  updated_at     TEXT    NOT NULL,
  CHECK (end_utc > start_utc)
);
CREATE INDEX IF NOT EXISTS time_entries_week ON time_entries (engagement_id, week_start);
CREATE INDEX IF NOT EXISTS time_entries_start ON time_entries (start_utc);

-- No row = the week is still a draft. The row is created on first submit.
CREATE TABLE IF NOT EXISTS weeks (
  id                   INTEGER PRIMARY KEY,
  engagement_id        INTEGER NOT NULL REFERENCES engagements (id),
  week_start           TEXT    NOT NULL,
  status               TEXT    NOT NULL CHECK (status IN ('submitted', 'approved', 'rejected')),
  reject_comment       TEXT,
  approved_rate_cents  INTEGER,  -- rate locked when the week is approved
  submitted_at         TEXT    NOT NULL,
  decided_at           TEXT,
  decided_by           INTEGER REFERENCES users (id),
  UNIQUE (engagement_id, week_start),
  CHECK (status <> 'approved' OR approved_rate_cents IS NOT NULL),
  CHECK (status <> 'rejected' OR length(trim(reject_comment)) > 0)
);
