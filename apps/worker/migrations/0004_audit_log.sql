CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actorUserId TEXT NOT NULL,
  action TEXT NOT NULL,
  entityType TEXT NOT NULL,
  entityId TEXT NOT NULL,
  details TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (actorUserId) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log(createdAt DESC);
