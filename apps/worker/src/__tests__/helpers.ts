import schemaSql from "../schema.sql?raw";
import { hashPassword } from "../auth";
import type { D1Database, D1PreparedStatement, D1Result } from "../env";

type Row = Record<string, unknown>;

class TestPreparedStatement implements D1PreparedStatement {
  private values: unknown[] = [];

  constructor(
    private readonly database: TestD1Database,
    private readonly sql: string,
  ) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async first<T = Row>(): Promise<T | null> {
    return (await this.database.first(this.sql, this.values)) as T | null;
  }

  async all<T = Row>(): Promise<D1Result<T>> {
    const results = (await this.database.all(this.sql, this.values)) as T[];
    return { results, success: true, meta: {} };
  }

  async run(): Promise<D1Result> {
    await this.database.run(this.sql, this.values);
    return { results: [], success: true, meta: {} };
  }
}

class TestD1Database implements D1Database {
  private readonly tables = new Map<string, Row[]>();

  prepare(sql: string) {
    return new TestPreparedStatement(this, sql);
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<Array<D1Result<T>>> {
    const results: Array<D1Result<T>> = [];
    for (const statement of statements) {
      results.push((await statement.run()) as D1Result<T>);
    }
    return results;
  }

  async exec(sql: string) {
    for (const statement of sql
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)) {
      const createMatch = statement.match(/^CREATE TABLE IF NOT EXISTS ([\w_]+)/i);
      if (createMatch) {
        this.tables.set(createMatch[1], []);
      }
    }
    return { count: 0, duration: 0 };
  }

  async first(sql: string, values: unknown[]) {
    return (await this.all(sql, values))[0] ?? null;
  }

  async all(sql: string, values: unknown[]) {
    return executeSelect(this.tables, sql, values);
  }

  async run(sql: string, values: unknown[]) {
    executeWrite(this.tables, sql, values);
  }
}

export function createTestD1() {
  return new TestD1Database();
}

export async function applySchema(db: D1Database) {
  await db.exec(schemaSql);
}

export async function seedAdmin(db: D1Database) {
  await db
    .prepare(
      "INSERT INTO users (id, email, displayName, passwordHash, role, active, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind("admin-user", "admin@example.com", "Beach Admin", await hashPassword("change-me"), "ADMIN", 1, now(), now())
    .run();
  await db
    .prepare("INSERT INTO players (id, name, active, userId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)")
    .bind("admin-player", "Beach Admin", 1, "admin-user", now(), now())
    .run();
}

function now() {
  return new Date("2026-07-03T12:00:00.000Z").toISOString();
}

function executeWrite(tables: Map<string, Row[]>, sql: string, values: unknown[]) {
  const insertMatch = sql.match(/^INSERT INTO ([\w_]+) \(([^)]+)\) VALUES \(([^)]+)\)/i);
  if (insertMatch) {
    const table = getTable(tables, insertMatch[1]);
    const columns = insertMatch[2].split(",").map((column) => column.trim());
    const row = Object.fromEntries(columns.map((column, index) => [column, values[index]]));
    if (insertMatch[1] === "users" && row.sessionVersion === undefined) {
      row.sessionVersion = 0;
    }
    table.push(row);
    return;
  }

  const deleteSetsMatch = sql.match(/^DELETE FROM match_sets WHERE matchId = \?/i);
  if (deleteSetsMatch) {
    const table = getTable(tables, "match_sets");
    tables.set(
      "match_sets",
      table.filter((row) => row.matchId !== values[0]),
    );
    return;
  }

  if (/^DELETE FROM rating_snapshots$/i.test(sql)) {
    tables.set("rating_snapshots", []);
    return;
  }

  const deleteExpiredLoginAttempts = sql.match(/^DELETE FROM login_attempts WHERE resetAt <= \? AND lockedUntil <= \?/i);
  if (deleteExpiredLoginAttempts) {
    tables.set(
      "login_attempts",
      getTable(tables, "login_attempts").filter(
        (row) => Number(row.resetAt) > Number(values[0]) || Number(row.lockedUntil) > Number(values[1]),
      ),
    );
    return;
  }

  const deleteLoginAttempt = sql.match(/^DELETE FROM login_attempts WHERE key = \?/i);
  if (deleteLoginAttempt) {
    tables.set(
      "login_attempts",
      getTable(tables, "login_attempts").filter((row) => row.key !== values[0]),
    );
    return;
  }

  const updateLoginAttempt = sql.match(/^UPDATE login_attempts SET /i);
  if (updateLoginAttempt) {
    const attempt = getTable(tables, "login_attempts").find((row) => row.key === values[3]);
    if (attempt) {
      Object.assign(attempt, { count: values[0], resetAt: values[1], lockedUntil: values[2] });
    }
    return;
  }

  const deleteRatingLock = sql.match(/^DELETE FROM rating_recalc_lock WHERE id = \? AND expiresAt <= \?/i);
  if (deleteRatingLock) {
    tables.set(
      "rating_recalc_lock",
      getTable(tables, "rating_recalc_lock").filter(
        (row) => row.id !== values[0] || Number(row.expiresAt) > Number(values[1]),
      ),
    );
    return;
  }

  const releaseRatingLock = sql.match(/^DELETE FROM rating_recalc_lock WHERE id = \? AND owner = \?/i);
  if (releaseRatingLock) {
    tables.set(
      "rating_recalc_lock",
      getTable(tables, "rating_recalc_lock").filter((row) => row.id !== values[0] || row.owner !== values[1]),
    );
    return;
  }

  const deleteMatch = sql.match(/^DELETE FROM matches WHERE id = \?/i);
  if (deleteMatch) {
    tables.set(
      "matches",
      getTable(tables, "matches").filter((row) => row.id !== values[0]),
    );
    tables.set(
      "match_sets",
      getTable(tables, "match_sets").filter((row) => row.matchId !== values[0]),
    );
    return;
  }

  const updateMatch = sql.match(/^UPDATE matches SET /i);
  if (updateMatch) {
    const match = getTable(tables, "matches").find((row) => row.id === values[9]);
    if (match) {
      Object.assign(match, {
        playedAt: values[0],
        winningTeam: values[1],
        isTiebreak: values[2],
        isRanked: values[3],
        teamAPlayer1Id: values[4],
        teamAPlayer2Id: values[5],
        teamBPlayer1Id: values[6],
        teamBPlayer2Id: values[7],
        updatedAt: values[8],
      });
    }
    return;
  }

  const updateUserPassword = sql.match(/^UPDATE users SET passwordHash = /i);
  if (updateUserPassword) {
    const user = getTable(tables, "users").find((row) => row.id === values[2]);
    if (user) {
      Object.assign(user, {
        passwordHash: values[0],
        sessionVersion: Number(user.sessionVersion ?? 0) + 1,
        updatedAt: values[1],
      });
    }
    return;
  }

  const revokeUserSessions = sql.match(/^UPDATE users SET sessionVersion = sessionVersion \+ 1/i);
  if (revokeUserSessions) {
    const user = getTable(tables, "users").find((row) => row.id === values[1]);
    if (user) {
      user.sessionVersion = Number(user.sessionVersion ?? 0) + 1;
      user.updatedAt = values[0];
    }
    return;
  }

  const updatePlayerUser = sql.match(/^UPDATE players SET userId = \?, updatedAt = \? WHERE id = \?(?: AND userId IS NULL)?/i);
  if (updatePlayerUser) {
    const player = getTable(tables, "players").find((row) => row.id === values[2]);
    if (player && (values.length < 4 || player.userId == null)) {
      Object.assign(player, {
        userId: values[0],
        updatedAt: values[1],
      });
    }
    return;
  }

  throw new Error(`Unsupported write SQL: ${sql}`);
}

function executeSelect(tables: Map<string, Row[]>, sql: string, values: unknown[]) {
  if (/^SELECT 1$/i.test(sql.trim())) {
    return [{ "1": 1 }];
  }
  if (/FROM users WHERE email = \?/i.test(sql)) {
    return getTable(tables, "users").filter((row) => row.email === values[0]);
  }
  if (/FROM users WHERE id = \?/i.test(sql)) {
    return getTable(tables, "users").filter((row) => row.id === values[0]);
  }
  if (/FROM players ORDER BY name ASC/i.test(sql)) {
    return [...getTable(tables, "players")].sort(compareName);
  }
  if (/FROM players WHERE userId = \?/i.test(sql)) {
    return getTable(tables, "players").filter((row) => row.userId === values[0]);
  }
  if (/FROM players WHERE id = \?/i.test(sql)) {
    return getTable(tables, "players").filter((row) => row.id === values[0]);
  }
  if (/^SELECT id FROM matches WHERE id = \?/i.test(sql.trim())) {
    return getTable(tables, "matches").filter((row) => row.id === values[0]);
  }
  if (/FROM rating_recalc_lock WHERE id = \?/i.test(sql)) {
    return getTable(tables, "rating_recalc_lock").filter((row) => row.id === values[0]);
  }
  if (/FROM login_attempts WHERE key = \?/i.test(sql)) {
    return getTable(tables, "login_attempts").filter((row) => row.key === values[0]);
  }
  if (/FROM audit_log/i.test(sql)) {
    const users = getTable(tables, "users");
    return [...getTable(tables, "audit_log")]
      .sort((left, right) => String(right.createdAt ?? "").localeCompare(String(left.createdAt ?? "")))
      .map((row) => ({
        ...row,
        actorDisplayName: users.find((user) => user.id === row.actorUserId)?.displayName,
      }));
  }
  if (/COUNT\(\*\) as count FROM players/i.test(sql)) {
    const ids = values;
    return [{ count: getTable(tables, "players").filter((row) => row.active === 1 && ids.includes(row.id)).length }];
  }
  if (/FROM matches/i.test(sql)) {
    return hydrateMatches(tables, values[0]);
  }
  if (/FROM rating_snapshots WHERE matchId = \?/i.test(sql)) {
    return getTable(tables, "rating_snapshots").filter((row) => row.matchId === values[0]);
  }
  if (/FROM rating_snapshots WHERE matchId IN/i.test(sql)) {
    return getTable(tables, "rating_snapshots").filter((row) => values.includes(row.matchId));
  }
  if (/FROM rating_snapshots/i.test(sql)) {
    return getTable(tables, "rating_snapshots");
  }
  if (/FROM match_sets WHERE matchId = \?/i.test(sql)) {
    return getTable(tables, "match_sets")
      .filter((row) => row.matchId === values[0])
      .sort((a, b) => Number(a.setNumber) - Number(b.setNumber));
  }
  if (/FROM match_sets\s+WHERE matchId IN/i.test(sql)) {
    return getTable(tables, "match_sets")
      .filter((row) => values.includes(row.matchId))
      .sort((a, b) => String(a.matchId).localeCompare(String(b.matchId)) || Number(a.setNumber) - Number(b.setNumber));
  }

  throw new Error(`Unsupported select SQL: ${sql}`);
}

function hydrateMatches(tables: Map<string, Row[]>, playerId?: unknown) {
  const players = getTable(tables, "players");
  const users = getTable(tables, "users");
  return [...getTable(tables, "matches")]
    .filter(
      (match) =>
        !playerId ||
        [match.teamAPlayer1Id, match.teamAPlayer2Id, match.teamBPlayer1Id, match.teamBPlayer2Id].includes(playerId),
    )
    .sort((a, b) => String(b.playedAt).localeCompare(String(a.playedAt)))
    .map((match) => ({
      ...match,
      teamAPlayer1Name: players.find((player) => player.id === match.teamAPlayer1Id)?.name,
      teamAPlayer2Name: players.find((player) => player.id === match.teamAPlayer2Id)?.name,
      teamBPlayer1Name: players.find((player) => player.id === match.teamBPlayer1Id)?.name,
      teamBPlayer2Name: players.find((player) => player.id === match.teamBPlayer2Id)?.name,
      teamAPlayer1Gender: players.find((player) => player.id === match.teamAPlayer1Id)?.gender ?? "MEN",
      teamAPlayer2Gender: players.find((player) => player.id === match.teamAPlayer2Id)?.gender ?? "MEN",
      teamBPlayer1Gender: players.find((player) => player.id === match.teamBPlayer1Id)?.gender ?? "MEN",
      teamBPlayer2Gender: players.find((player) => player.id === match.teamBPlayer2Id)?.gender ?? "MEN",
      enteredByDisplayName: users.find((user) => user.id === match.enteredByUserId)?.displayName,
    }));
}

function getTable(tables: Map<string, Row[]>, table: string) {
  const rows = tables.get(table);
  if (!rows) {
    throw new Error(`Unknown table: ${table}`);
  }
  return rows;
}

function compareName(left: Row, right: Row) {
  return String(left.name).localeCompare(String(right.name));
}
