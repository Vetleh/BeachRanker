import { createId, nowIso } from "./crypto";
import type { D1Database } from "./env";
import type { MatchInput, MatchRow, MatchSet, Player, RatingSnapshot, User } from "./types";

export async function findUserByEmail(db: D1Database, email: string) {
  return db
    .prepare("SELECT id, email, displayName, passwordHash, role, active FROM users WHERE email = ?")
    .bind(email)
    .first<User>();
}

export async function listPlayers(db: D1Database) {
  const { results } = await db
    .prepare("SELECT id, name, active, userId FROM players ORDER BY name ASC")
    .all<Player>();
  return results.map(formatPlayer);
}

export async function findPlayerByUserId(db: D1Database, userId: string) {
  return db
    .prepare("SELECT id, name, active, userId FROM players WHERE userId = ?")
    .bind(userId)
    .first<Player>();
}

export async function createPlayer(db: D1Database, input: { name: string; active?: boolean }) {
  const player = {
    id: createId(),
    name: input.name,
    active: input.active === false ? 0 : 1,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  await db
    .prepare("INSERT INTO players (id, name, active, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)")
    .bind(player.id, player.name, player.active, player.createdAt, player.updatedAt)
    .run();
  return formatPlayer(player);
}

export async function createUser(
  db: D1Database,
  input: { email: string; displayName: string; passwordHash: string; role: string; playerId?: string }
) {
  const user = {
    id: createId(),
    email: input.email,
    displayName: input.displayName,
    passwordHash: input.passwordHash,
    role: input.role,
    active: 1,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  await db
    .prepare(
      "INSERT INTO users (id, email, displayName, passwordHash, role, active, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(user.id, user.email, user.displayName, user.passwordHash, user.role, user.active, user.createdAt, user.updatedAt)
    .run();
  if (input.playerId) {
    await linkPlayerToUser(db, input.playerId, user.id);
  }
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    active: true
  };
}

export async function updatePlayer(db: D1Database, playerId: string, input: { name?: string; active?: boolean }) {
  const current = await db
    .prepare("SELECT id, name, active, userId FROM players WHERE id = ?")
    .bind(playerId)
    .first<Player>();
  if (!current) {
    return null;
  }
  const next = {
    name: input.name ?? current.name,
    active: input.active === undefined ? current.active : input.active ? 1 : 0
  };
  await db
    .prepare("UPDATE players SET name = ?, active = ?, updatedAt = ? WHERE id = ?")
    .bind(next.name, next.active, nowIso(), playerId)
    .run();
  return formatPlayer({ ...current, ...next });
}

export async function updateUserPassword(db: D1Database, userId: string, passwordHash: string) {
  await db
    .prepare("UPDATE users SET passwordHash = ?, updatedAt = ? WHERE id = ?")
    .bind(passwordHash, nowIso(), userId)
    .run();
  return db
    .prepare("SELECT id, email, displayName, passwordHash, role, active FROM users WHERE id = ?")
    .bind(userId)
    .first<User>();
}

async function linkPlayerToUser(db: D1Database, playerId: string, userId: string) {
  await db.prepare("UPDATE players SET userId = ?, updatedAt = ? WHERE id = ?").bind(userId, nowIso(), playerId).run();
}

export async function countActivePlayers(db: D1Database, playerIds: string[]) {
  const placeholders = playerIds.map(() => "?").join(", ");
  const row = await db
    .prepare(`SELECT COUNT(*) as count FROM players WHERE active = 1 AND id IN (${placeholders})`)
    .bind(...playerIds)
    .first<{ count: number }>();
  return Number(row?.count ?? 0);
}

export async function createMatch(db: D1Database, input: MatchInput, winningTeam: "A" | "B", enteredByUserId: string) {
  const matchId = createId();
  const isTiebreak = input.isTiebreak ?? input.sets.length >= 3;
  const timestamp = nowIso();

  await db
    .prepare(
      "INSERT INTO matches (id, playedAt, winningTeam, isTiebreak, enteredByUserId, teamAPlayer1Id, teamAPlayer2Id, teamBPlayer1Id, teamBPlayer2Id, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(
      matchId,
      input.playedAt,
      winningTeam,
      isTiebreak ? 1 : 0,
      enteredByUserId,
      input.teamAPlayerIds[0],
      input.teamAPlayerIds[1],
      input.teamBPlayerIds[0],
      input.teamBPlayerIds[1],
      timestamp,
      timestamp
    )
    .run();

  for (const [index, set] of input.sets.entries()) {
    await insertSet(db, matchId, index + 1, set);
  }

  return matchId;
}

export async function updateMatch(db: D1Database, matchId: string, input: MatchInput, winningTeam: "A" | "B") {
  const isTiebreak = input.isTiebreak ?? input.sets.length >= 3;
  await db
    .prepare(
      "UPDATE matches SET playedAt = ?, winningTeam = ?, isTiebreak = ?, teamAPlayer1Id = ?, teamAPlayer2Id = ?, teamBPlayer1Id = ?, teamBPlayer2Id = ?, updatedAt = ? WHERE id = ?"
    )
    .bind(
      input.playedAt,
      winningTeam,
      isTiebreak ? 1 : 0,
      input.teamAPlayerIds[0],
      input.teamAPlayerIds[1],
      input.teamBPlayerIds[0],
      input.teamBPlayerIds[1],
      nowIso(),
      matchId
    )
    .run();
  await db.prepare("DELETE FROM match_sets WHERE matchId = ?").bind(matchId).run();
  for (const [index, set] of input.sets.entries()) {
    await insertSet(db, matchId, index + 1, set);
  }
}

export async function deleteMatch(db: D1Database, matchId: string) {
  await db.prepare("DELETE FROM matches WHERE id = ?").bind(matchId).run();
}

export async function listMatches(db: D1Database, playerId?: string) {
  const playerFilter = playerId
    ? `WHERE ? IN (
        m.teamAPlayer1Id,
        m.teamAPlayer2Id,
        m.teamBPlayer1Id,
        m.teamBPlayer2Id
      )`
    : "";
  const statement = db.prepare(
    `SELECT
        m.id,
        m.playedAt,
        m.winningTeam,
        m.isTiebreak,
        m.enteredByUserId,
        m.teamAPlayer1Id,
        m.teamAPlayer2Id,
        m.teamBPlayer1Id,
        m.teamBPlayer2Id,
        p1.name as teamAPlayer1Name,
        p2.name as teamAPlayer2Name,
        p3.name as teamBPlayer1Name,
        p4.name as teamBPlayer2Name,
        u.displayName as enteredByDisplayName
      FROM matches m
      JOIN players p1 ON p1.id = m.teamAPlayer1Id
      JOIN players p2 ON p2.id = m.teamAPlayer2Id
      JOIN players p3 ON p3.id = m.teamBPlayer1Id
      JOIN players p4 ON p4.id = m.teamBPlayer2Id
      JOIN users u ON u.id = m.enteredByUserId
      ${playerFilter}
      ORDER BY m.playedAt DESC, m.createdAt DESC`
  );
  const { results } = playerId ? await statement.bind(playerId).all<MatchRow>() : await statement.all<MatchRow>();
  return results;
}

export async function listSets(db: D1Database, matchId: string) {
  const { results } = await db
    .prepare("SELECT id, setNumber, teamAPoints, teamBPoints FROM match_sets WHERE matchId = ? ORDER BY setNumber ASC")
    .bind(matchId)
    .all<Required<MatchSet>>();
  return results;
}

export async function listSnapshots(db: D1Database) {
  const { results } = await db
    .prepare("SELECT matchId, playerId, preRating, postRating, delta FROM rating_snapshots")
    .all<RatingSnapshot>();
  return results;
}

export async function snapshotsForMatch(db: D1Database, matchId: string) {
  const { results } = await db
    .prepare("SELECT matchId, playerId, preRating, postRating, delta FROM rating_snapshots WHERE matchId = ?")
    .bind(matchId)
    .all<RatingSnapshot>();
  return results;
}

export async function replaceSnapshots(db: D1Database, snapshots: Array<RatingSnapshot & { id?: string }>) {
  for (const snapshot of snapshots) {
    await db
      .prepare(
        "INSERT INTO rating_snapshots (id, matchId, playerId, preRating, postRating, delta) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .bind(createId(), snapshot.matchId, snapshot.playerId, snapshot.preRating, snapshot.postRating, snapshot.delta)
      .run();
  }
}

export async function clearAllSnapshots(db: D1Database) {
  await db.prepare("DELETE FROM rating_snapshots").run();
}

function insertSet(db: D1Database, matchId: string, setNumber: number, set: MatchSet) {
  return db
    .prepare("INSERT INTO match_sets (id, matchId, setNumber, teamAPoints, teamBPoints) VALUES (?, ?, ?, ?, ?)")
    .bind(createId(), matchId, setNumber, set.teamAPoints, set.teamBPoints)
    .run();
}

function formatPlayer(player: Player | { id: string; name: string; active: number }) {
  return {
    id: player.id,
    name: player.name,
    active: player.active === 1
  };
}
