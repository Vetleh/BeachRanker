CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  displayName TEXT NOT NULL,
  passwordHash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'PLAYER' CHECK (role IN ('ADMIN', 'PLAYER')),
  active INTEGER NOT NULL DEFAULT 1,
  sessionVersion INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  initialRating INTEGER NOT NULL DEFAULT 1500,
  gender TEXT NOT NULL DEFAULT 'MEN' CHECK (gender IN ('MEN', 'WOMEN')),
  userId TEXT UNIQUE,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  playedAt TEXT NOT NULL,
  winningTeam TEXT NOT NULL CHECK (winningTeam IN ('A', 'B')),
  isTiebreak INTEGER NOT NULL DEFAULT 0,
  isRanked INTEGER NOT NULL DEFAULT 1,
  enteredByUserId TEXT NOT NULL,
  teamAPlayer1Id TEXT NOT NULL,
  teamAPlayer2Id TEXT NOT NULL,
  teamBPlayer1Id TEXT NOT NULL,
  teamBPlayer2Id TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (enteredByUserId) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (teamAPlayer1Id) REFERENCES players(id) ON DELETE RESTRICT,
  FOREIGN KEY (teamAPlayer2Id) REFERENCES players(id) ON DELETE RESTRICT,
  FOREIGN KEY (teamBPlayer1Id) REFERENCES players(id) ON DELETE RESTRICT,
  FOREIGN KEY (teamBPlayer2Id) REFERENCES players(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS matches_played_created_idx ON matches(playedAt, createdAt);

CREATE TABLE IF NOT EXISTS match_sets (
  id TEXT PRIMARY KEY,
  matchId TEXT NOT NULL,
  setNumber INTEGER NOT NULL,
  teamAPoints INTEGER NOT NULL,
  teamBPoints INTEGER NOT NULL,
  FOREIGN KEY (matchId) REFERENCES matches(id) ON DELETE CASCADE,
  UNIQUE (matchId, setNumber)
);

CREATE INDEX IF NOT EXISTS match_sets_match_idx ON match_sets(matchId, setNumber);

CREATE TABLE IF NOT EXISTS rating_snapshots (
  id TEXT PRIMARY KEY,
  matchId TEXT NOT NULL,
  playerId TEXT NOT NULL,
  preRating INTEGER NOT NULL,
  postRating INTEGER NOT NULL,
  delta INTEGER NOT NULL,
  FOREIGN KEY (matchId) REFERENCES matches(id) ON DELETE CASCADE,
  FOREIGN KEY (playerId) REFERENCES players(id) ON DELETE CASCADE,
  UNIQUE (matchId, playerId)
);

CREATE INDEX IF NOT EXISTS rating_snapshots_match_idx ON rating_snapshots(matchId);
CREATE INDEX IF NOT EXISTS rating_snapshots_player_idx ON rating_snapshots(playerId);
CREATE INDEX IF NOT EXISTS matches_team_a_player1_idx ON matches(teamAPlayer1Id);
CREATE INDEX IF NOT EXISTS matches_team_a_player2_idx ON matches(teamAPlayer2Id);
CREATE INDEX IF NOT EXISTS matches_team_b_player1_idx ON matches(teamBPlayer1Id);
CREATE INDEX IF NOT EXISTS matches_team_b_player2_idx ON matches(teamBPlayer2Id);

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

CREATE TABLE IF NOT EXISTS rating_recalc_lock (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  acquiredAt INTEGER NOT NULL,
  expiresAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS login_attempts (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  resetAt INTEGER NOT NULL,
  lockedUntil INTEGER NOT NULL
);
