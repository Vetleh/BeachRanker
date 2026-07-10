import { createId, nowIso } from "./crypto";
import type { D1Database, D1PreparedStatement } from "./env";
import { STARTING_RATING } from "./elo";
import type { MatchInput, MatchRow, MatchSet, Player, PlayerGender, RatingSnapshot, User } from "./types";

export async function findUserByEmail(db: D1Database, email: string) {
  return db
    .prepare("SELECT id, email, displayName, passwordHash, role, active FROM users WHERE email = ?")
    .bind(email)
    .first<User>();
}

export async function listPlayers(db: D1Database) {
  const { results } = await db
    .prepare("SELECT id, name, active, initialRating, gender, userId FROM players ORDER BY name ASC")
    .all<Player>();
  return results.map(formatPlayer);
}

export async function findPlayerByUserId(db: D1Database, userId: string) {
  return db
    .prepare("SELECT id, name, active, initialRating, gender, userId FROM players WHERE userId = ?")
    .bind(userId)
    .first<Player>();
}

export async function createPlayer(
  db: D1Database,
  input: { name: string; active?: boolean; initialRating?: number; gender: PlayerGender },
) {
  const player = {
    id: createId(),
    name: input.name,
    active: input.active === false ? 0 : 1,
    initialRating: input.initialRating ?? STARTING_RATING,
    gender: input.gender,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await db
    .prepare(
      "INSERT INTO players (id, name, active, initialRating, gender, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      player.id,
      player.name,
      player.active,
      player.initialRating,
      player.gender,
      player.createdAt,
      player.updatedAt,
    )
    .run();
  return formatPlayer(player);
}

export async function createUser(
  db: D1Database,
  input: { email: string; displayName: string; passwordHash: string; role: string; playerId?: string },
) {
  const user = {
    id: createId(),
    email: input.email,
    displayName: input.displayName,
    passwordHash: input.passwordHash,
    role: input.role,
    active: 1,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await db
    .prepare(
      "INSERT INTO users (id, email, displayName, passwordHash, role, active, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      user.id,
      user.email,
      user.displayName,
      user.passwordHash,
      user.role,
      user.active,
      user.createdAt,
      user.updatedAt,
    )
    .run();
  if (input.playerId) {
    await linkPlayerToUser(db, input.playerId, user.id);
  }
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    active: true,
  };
}

export async function updatePlayer(db: D1Database, playerId: string, input: { name?: string; active?: boolean }) {
  const current = await db
    .prepare("SELECT id, name, active, initialRating, gender, userId FROM players WHERE id = ?")
    .bind(playerId)
    .first<Player>();
  if (!current) {
    return null;
  }
  const next = {
    name: input.name ?? current.name,
    active: input.active === undefined ? current.active : input.active ? 1 : 0,
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
  const isRanked = input.isRanked ?? true;
  const timestamp = nowIso();

  await db.batch([
    db
      .prepare(
        "INSERT INTO matches (id, playedAt, winningTeam, isTiebreak, isRanked, enteredByUserId, teamAPlayer1Id, teamAPlayer2Id, teamBPlayer1Id, teamBPlayer2Id, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        matchId,
        input.playedAt,
        winningTeam,
        isTiebreak ? 1 : 0,
        isRanked ? 1 : 0,
        enteredByUserId,
        input.teamAPlayerIds[0],
        input.teamAPlayerIds[1],
        input.teamBPlayerIds[0],
        input.teamBPlayerIds[1],
        timestamp,
        timestamp,
      ),
    ...input.sets.map((set, index) => insertSetStatement(db, matchId, index + 1, set)),
  ]);

  return matchId;
}

export async function updateMatch(db: D1Database, matchId: string, input: MatchInput, winningTeam: "A" | "B") {
  const isTiebreak = input.isTiebreak ?? input.sets.length >= 3;
  const isRanked = input.isRanked ?? true;
  await db.batch([
    db
      .prepare(
        "UPDATE matches SET playedAt = ?, winningTeam = ?, isTiebreak = ?, isRanked = ?, teamAPlayer1Id = ?, teamAPlayer2Id = ?, teamBPlayer1Id = ?, teamBPlayer2Id = ?, updatedAt = ? WHERE id = ?",
      )
      .bind(
        input.playedAt,
        winningTeam,
        isTiebreak ? 1 : 0,
        isRanked ? 1 : 0,
        input.teamAPlayerIds[0],
        input.teamAPlayerIds[1],
        input.teamBPlayerIds[0],
        input.teamBPlayerIds[1],
        nowIso(),
        matchId,
      ),
    db.prepare("DELETE FROM match_sets WHERE matchId = ?").bind(matchId),
    ...input.sets.map((set, index) => insertSetStatement(db, matchId, index + 1, set)),
  ]);
}

export async function deleteMatch(db: D1Database, matchId: string) {
  await db.prepare("DELETE FROM matches WHERE id = ?").bind(matchId).run();
}

export async function addAuditLog(
  db: D1Database,
  input: { actorUserId: string; action: string; entityType: string; entityId: string },
) {
  try {
    await db
      .prepare("INSERT INTO audit_log (id, actorUserId, action, entityType, entityId) VALUES (?, ?, ?, ?, ?)")
      .bind(createId(), input.actorUserId, input.action, input.entityType, input.entityId)
      .run();
  } catch (error) {
    // Keep match writes compatible while an environment is being migrated.
    if (!(error instanceof Error) || !error.message.includes("audit_log")) {
      throw error;
    }
  }
}

export async function listAuditLog(db: D1Database) {
  const { results } = await db
    .prepare(
      "SELECT a.id, a.actorUserId, a.action, a.entityType, a.entityId, a.createdAt, u.displayName as actorDisplayName FROM audit_log a JOIN users u ON u.id = a.actorUserId ORDER BY a.createdAt DESC LIMIT 200",
    )
    .all();
  return results;
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
        m.isRanked,
        m.enteredByUserId,
        m.teamAPlayer1Id,
        m.teamAPlayer2Id,
        m.teamBPlayer1Id,
        m.teamBPlayer2Id,
        p1.name as teamAPlayer1Name,
        p2.name as teamAPlayer2Name,
        p3.name as teamBPlayer1Name,
        p4.name as teamBPlayer2Name,
        p1.gender as teamAPlayer1Gender,
        p2.gender as teamAPlayer2Gender,
        p3.gender as teamBPlayer1Gender,
        p4.gender as teamBPlayer2Gender,
        u.displayName as enteredByDisplayName
      FROM matches m
      JOIN players p1 ON p1.id = m.teamAPlayer1Id
      JOIN players p2 ON p2.id = m.teamAPlayer2Id
      JOIN players p3 ON p3.id = m.teamBPlayer1Id
      JOIN players p4 ON p4.id = m.teamBPlayer2Id
      JOIN users u ON u.id = m.enteredByUserId
      ${playerFilter}
      ORDER BY m.playedAt DESC, m.createdAt DESC`,
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
    .prepare(
      `SELECT
          rs.matchId,
          rs.playerId,
          rs.preRating,
          rs.postRating,
          rs.delta
        FROM rating_snapshots rs
        JOIN matches m ON m.id = rs.matchId
        ORDER BY m.playedAt ASC, m.createdAt ASC, rs.playerId ASC`,
    )
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

export async function replaceAllSnapshots(db: D1Database, snapshots: RatingSnapshot[]) {
  await db.batch([
    db.prepare("DELETE FROM rating_snapshots"),
    ...snapshots.map((snapshot) =>
      db
        .prepare(
          "INSERT INTO rating_snapshots (id, matchId, playerId, preRating, postRating, delta) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(createId(), snapshot.matchId, snapshot.playerId, snapshot.preRating, snapshot.postRating, snapshot.delta),
    ),
  ]);
}

function insertSetStatement(db: D1Database, matchId: string, setNumber: number, set: MatchSet): D1PreparedStatement {
  return db
    .prepare("INSERT INTO match_sets (id, matchId, setNumber, teamAPoints, teamBPoints) VALUES (?, ?, ?, ?, ?)")
    .bind(createId(), matchId, setNumber, set.teamAPoints, set.teamBPoints);
}

function formatPlayer(
  player: Player | { id: string; name: string; active: number; initialRating?: number; gender?: PlayerGender },
) {
  return {
    id: player.id,
    name: player.name,
    active: player.active === 1,
    initialRating: player.initialRating ?? STARTING_RATING,
    gender: player.gender ?? "MEN",
  };
}
