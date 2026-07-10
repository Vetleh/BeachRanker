CREATE INDEX IF NOT EXISTS match_sets_match_idx ON match_sets(matchId, setNumber);
CREATE INDEX IF NOT EXISTS rating_snapshots_match_idx ON rating_snapshots(matchId);
CREATE INDEX IF NOT EXISTS rating_snapshots_player_idx ON rating_snapshots(playerId);
CREATE INDEX IF NOT EXISTS matches_team_a_player1_idx ON matches(teamAPlayer1Id);
CREATE INDEX IF NOT EXISTS matches_team_a_player2_idx ON matches(teamAPlayer2Id);
CREATE INDEX IF NOT EXISTS matches_team_b_player1_idx ON matches(teamBPlayer1Id);
CREATE INDEX IF NOT EXISTS matches_team_b_player2_idx ON matches(teamBPlayer2Id);
