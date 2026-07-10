CREATE TABLE IF NOT EXISTS rating_recalc_lock (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  acquiredAt INTEGER NOT NULL,
  expiresAt INTEGER NOT NULL
);
