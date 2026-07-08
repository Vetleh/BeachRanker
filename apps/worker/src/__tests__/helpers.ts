import schemaSql from "../schema.sql?raw";
import { hashPassword } from "../auth";
import type { D1Database, D1PreparedStatement, D1Result } from "../env";

type Row = Record<string, unknown>;

class TestPreparedStatement implements D1PreparedStatement {
  private values: unknown[] = [];

  constructor(
    private readonly database: TestD1Database,
    private readonly sql: string
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
    for (const statement of sql.split(";").map((part) => part.trim()).filter(Boolean)) {
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
      "INSERT INTO users (id, email, displayName, passwordHash, role, active, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
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
    table.push(Object.fromEntries(columns.map((column, index) => [column, values[index]])));
    return;
  }

  const deleteSetsMatch = sql.match(/^DELETE FROM match_sets WHERE matchId = \?/i);
  if (deleteSetsMatch) {
    const table = getTable(tables, "match_sets");
    tables.set(
      "match_sets",
      table.filter((row) => row.matchId !== values[0])
    );
    return;
  }

  if (/^DELETE FROM rating_snapshots$/i.test(sql)) {
    tables.set("rating_snapshots", []);
    return;
  }

  const deleteMatch = sql.match(/^DELETE FROM matches WHERE id = \?/i);
  if (deleteMatch) {
    tables.set(
      "matches",
      getTable(tables, "matches").filter((row) => row.id !== values[0])
    );
    tables.set(
      "match_sets",
      getTable(tables, "match_sets").filter((row) => row.matchId !== values[0])
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
        teamAPlayer1Id: values[3],
        teamAPlayer2Id: values[4],
        teamBPlayer1Id: values[5],
        teamBPlayer2Id: values[6],
        updatedAt: values[7]
      });
    }
    return;
  }

  throw new Error(`Unsupported write SQL: ${sql}`);
}

function executeSelect(tables: Map<string, Row[]>, sql: string, values: unknown[]) {
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
  if (/FROM rating_snapshots/i.test(sql)) {
    return getTable(tables, "rating_snapshots");
  }
  if (/FROM match_sets WHERE matchId = \?/i.test(sql)) {
    return getTable(tables, "match_sets")
      .filter((row) => row.matchId === values[0])
      .sort((a, b) => Number(a.setNumber) - Number(b.setNumber));
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
        [
          match.teamAPlayer1Id,
          match.teamAPlayer2Id,
          match.teamBPlayer1Id,
          match.teamBPlayer2Id
        ].includes(playerId)
    )
    .sort((a, b) => String(b.playedAt).localeCompare(String(a.playedAt)))
    .map((match) => ({
      ...match,
      teamAPlayer1Name: players.find((player) => player.id === match.teamAPlayer1Id)?.name,
      teamAPlayer2Name: players.find((player) => player.id === match.teamAPlayer2Id)?.name,
      teamBPlayer1Name: players.find((player) => player.id === match.teamBPlayer1Id)?.name,
      teamBPlayer2Name: players.find((player) => player.id === match.teamBPlayer2Id)?.name,
      enteredByDisplayName: users.find((user) => user.id === match.enteredByUserId)?.displayName
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
