import { beforeEach, describe, expect, it } from "vitest";
import worker from "../index";
import { applySchema, createTestD1, seedAdmin } from "./helpers";

const env = async () => {
  const db = createTestD1();
  await applySchema(db);
  await seedAdmin(db);
  return {
    DB: db,
    JWT_SECRET: "test-secret"
  };
};

async function json(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("BeachRanker Worker API", () => {
  let testEnv: Awaited<ReturnType<typeof env>>;

  beforeEach(async () => {
    testEnv = await env();
  });

  it("authenticates with an HTTP-only session cookie", async () => {
    const response = await worker.fetch(
      new Request("https://beachranker.test/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "admin@example.com", password: "change-me" })
      }),
      testEnv
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("beachranker_session=");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(await json(response)).toMatchObject({
      user: { email: "admin@example.com", displayName: "Beach Admin", role: "ADMIN" }
    });
  });

  it("creates a match and marks it as tiebreak when it has three sets", async () => {
    const login = await worker.fetch(
      new Request("https://beachranker.test/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "admin@example.com", password: "change-me" })
      }),
      testEnv
    );
    const cookie = login.headers.get("set-cookie") ?? "";

    for (const name of ["Alice", "Bob", "Cara", "Dan"]) {
      const response = await worker.fetch(
        new Request("https://beachranker.test/api/players", {
          method: "POST",
          headers: { "content-type": "application/json", cookie },
          body: JSON.stringify({ name })
        }),
        testEnv
      );
      expect(response.status).toBe(201);
    }

    const playersResponse = await worker.fetch(
      new Request("https://beachranker.test/api/players", { headers: { cookie } }),
      testEnv
    );
    const playersPayload = (await json(playersResponse)) as { players: Array<{ id: string; name: string }> };
    const players = Object.fromEntries(playersPayload.players.map((player) => [player.name, player.id]));

    const matchResponse = await worker.fetch(
      new Request("https://beachranker.test/api/matches", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          playedAt: "2026-07-03T12:00:00.000Z",
          teamAPlayerIds: [players.Alice, players.Bob],
          teamBPlayerIds: [players.Cara, players.Dan],
          sets: [
            { teamAPoints: 21, teamBPoints: 19 },
            { teamAPoints: 18, teamBPoints: 21 },
            { teamAPoints: 15, teamBPoints: 12 }
          ]
        })
      }),
      testEnv
    );

    expect(matchResponse.status).toBe(201);
    expect(await json(matchResponse)).toMatchObject({
      match: {
        winningTeam: "A",
        isTiebreak: true,
        teamA: [{ name: "Alice" }, { name: "Bob" }],
        teamB: [{ name: "Cara" }, { name: "Dan" }]
      }
    });
  });

  it("lists only the logged-in player's matches unless a player profile is requested", async () => {
    const login = await worker.fetch(
      new Request("https://beachranker.test/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "admin@example.com", password: "change-me" })
      }),
      testEnv
    );
    const cookie = login.headers.get("set-cookie") ?? "";

    for (const name of ["Alice", "Bob", "Cara", "Dan"]) {
      await worker.fetch(
        new Request("https://beachranker.test/api/players", {
          method: "POST",
          headers: { "content-type": "application/json", cookie },
          body: JSON.stringify({ name })
        }),
        testEnv
      );
    }

    const playersResponse = await worker.fetch(
      new Request("https://beachranker.test/api/players", { headers: { cookie } }),
      testEnv
    );
    const playersPayload = (await json(playersResponse)) as { players: Array<{ id: string; name: string }> };
    const players = Object.fromEntries(playersPayload.players.map((player) => [player.name, player.id]));

    const postMatch = (playedAt: string, teamAPlayerIds: string[], teamBPlayerIds: string[]) =>
      worker.fetch(
        new Request("https://beachranker.test/api/matches", {
          method: "POST",
          headers: { "content-type": "application/json", cookie },
          body: JSON.stringify({
            playedAt,
            teamAPlayerIds,
            teamBPlayerIds,
            sets: [
              { teamAPoints: 21, teamBPoints: 19 },
              { teamAPoints: 21, teamBPoints: 18 }
            ]
          })
        }),
        testEnv
      );

    await postMatch("2026-07-03T12:00:00.000Z", [players.Alice, players.Bob], [players.Cara, players.Dan]);
    await postMatch("2026-07-04T12:00:00.000Z", [players["Beach Admin"], players.Alice], [players.Bob, players.Cara]);

    const ownMatchesResponse = await worker.fetch(
      new Request("https://beachranker.test/api/matches", { headers: { cookie } }),
      testEnv
    );
    const ownMatches = (await json(ownMatchesResponse)) as { matches: Array<{ teamA: Array<{ name: string }> }> };

    expect(ownMatches.matches).toHaveLength(1);
    expect(ownMatches.matches[0].teamA).toEqual([{ id: "admin-player", name: "Beach Admin", delta: 16 }, expect.objectContaining({ name: "Alice" })]);

    const danMatchesResponse = await worker.fetch(
      new Request(`https://beachranker.test/api/matches?playerId=${players.Dan}`, { headers: { cookie } }),
      testEnv
    );
    const danMatches = (await json(danMatchesResponse)) as { matches: Array<{ teamB: Array<{ name: string }> }> };

    expect(danMatches.matches).toHaveLength(1);
    expect(danMatches.matches[0].teamB).toEqual([
      expect.objectContaining({ name: "Cara" }),
      expect.objectContaining({ name: "Dan" })
    ]);
  });
});
