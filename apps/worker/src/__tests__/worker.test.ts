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
    const payload = await json(response);
    expect(payload).toMatchObject({
      user: { email: "admin@example.com", displayName: "Beach Admin", role: "ADMIN" }
    });
    expect(payload).not.toHaveProperty("token");
  });

  it("returns a bearer token only when explicitly requested", async () => {
    const response = await worker.fetch(
      new Request("https://beachranker.test/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "admin@example.com", password: "change-me", authMode: "bearer" })
      }),
      testEnv
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
    const payload = await json(response);
    expect(payload).toMatchObject({
      token: expect.any(String),
      user: { email: "admin@example.com", displayName: "Beach Admin", role: "ADMIN" }
    });

    const meResponse = await worker.fetch(
      new Request("https://beachranker.test/api/auth/me", {
        headers: { authorization: `Bearer ${String(payload.token)}` }
      }),
      testEnv
    );
    expect(meResponse.status).toBe(200);
  });

  it("creates players with a selected initial rating", async () => {
    const login = await worker.fetch(
      new Request("https://beachranker.test/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "admin@example.com", password: "change-me" })
      }),
      testEnv
    );
    const cookie = login.headers.get("set-cookie") ?? "";

    const response = await worker.fetch(
      new Request("https://beachranker.test/api/players", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ name: "Seeded Player", initialRating: 1800, gender: "MEN" })
      }),
      testEnv
    );

    expect(response.status).toBe(201);
    expect(await json(response)).toMatchObject({
      player: { name: "Seeded Player", initialRating: 1800 }
    });

    const rankingsResponse = await worker.fetch(
      new Request("https://beachranker.test/api/rankings", { headers: { cookie } }),
      testEnv
    );
    const rankingsPayload = (await json(rankingsResponse)) as { rankings: Array<{ name: string; rating: number }> };
    expect(rankingsPayload.rankings.find((player) => player.name === "Seeded Player")).toMatchObject({ rating: 1800 });
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
          body: JSON.stringify({ name, gender: "MEN" })
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

  it("does not rate mixed matches", async () => {
    const login = await worker.fetch(
      new Request("https://beachranker.test/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "admin@example.com", password: "change-me" })
      }),
      testEnv
    );
    const cookie = login.headers.get("set-cookie") ?? "";

    for (const player of [
      { name: "Alice", gender: "WOMEN" },
      { name: "Bob", gender: "MEN" },
      { name: "Cara", gender: "WOMEN" },
      { name: "Dan", gender: "MEN" }
    ]) {
      const response = await worker.fetch(
        new Request("https://beachranker.test/api/players", {
          method: "POST",
          headers: { "content-type": "application/json", cookie },
          body: JSON.stringify(player)
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
          sets: [{ teamAPoints: 21, teamBPoints: 18 }]
        })
      }),
      testEnv
    );

    expect(matchResponse.status).toBe(201);
    expect(await json(matchResponse)).toMatchObject({
      match: {
        rated: false,
        teamA: [{ name: "Alice", delta: 0 }, { name: "Bob", delta: 0 }],
        teamB: [{ name: "Cara", delta: 0 }, { name: "Dan", delta: 0 }]
      }
    });

    const rankingsResponse = await worker.fetch(
      new Request("https://beachranker.test/api/rankings", { headers: { cookie } }),
      testEnv
    );
    const rankingsPayload = (await json(rankingsResponse)) as {
      rankings: Array<{ name: string; rating: number; matchesPlayed: number; wins: number; losses: number }>;
    };
    expect(rankingsPayload.rankings.find((player) => player.name === "Alice")).toMatchObject({
      rating: 1500,
      matchesPlayed: 0,
      wins: 0,
      losses: 0
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
          body: JSON.stringify({ name, gender: "MEN" })
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

    const createPlayerResponse = await worker.fetch(
      new Request("https://beachranker.test/api/users", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          email: "dan.player@example.com",
          displayName: "Dan Player",
          password: "change-me-too",
          role: "PLAYER",
          playerId: players.Dan
        })
      }),
      testEnv
    );
    expect(createPlayerResponse.status).toBe(201);

    const playerLogin = await worker.fetch(
      new Request("https://beachranker.test/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "dan.player@example.com", password: "change-me-too" })
      }),
      testEnv
    );
    const playerCookie = playerLogin.headers.get("set-cookie") ?? "";

    const ownMatchesResponse = await worker.fetch(
      new Request("https://beachranker.test/api/matches", { headers: { cookie: playerCookie } }),
      testEnv
    );
    const ownMatches = (await json(ownMatchesResponse)) as { matches: Array<{ teamA: Array<{ name: string }>; teamB: Array<{ name: string }> }> };

    expect(ownMatches.matches).toHaveLength(1);
    expect(ownMatches.matches[0].teamB.map((player) => player.name)).toEqual(["Cara", "Dan"]);

    const danMatchesResponse = await worker.fetch(
      new Request(`https://beachranker.test/api/matches?playerId=${players.Dan}`, { headers: { cookie: playerCookie } }),
      testEnv
    );
    const danMatches = (await json(danMatchesResponse)) as { matches: Array<{ teamB: Array<{ name: string }> }> };

    expect(danMatches.matches).toHaveLength(1);
    expect(danMatches.matches[0].teamB).toEqual([
      expect.objectContaining({ name: "Cara" }),
      expect.objectContaining({ name: "Dan" })
    ]);
  });

  it("lets admins without a linked player see all matches", async () => {
    const adminLogin = await worker.fetch(
      new Request("https://beachranker.test/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "admin@example.com", password: "change-me" })
      }),
      testEnv
    );
    const adminCookie = adminLogin.headers.get("set-cookie") ?? "";

    const createAdminResponse = await worker.fetch(
      new Request("https://beachranker.test/api/users", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: adminCookie },
        body: JSON.stringify({
          email: "vetlewh@example.com",
          displayName: "Vetle Harnes",
          password: "change-me-too",
          role: "ADMIN"
        })
      }),
      testEnv
    );
    expect(createAdminResponse.status).toBe(201);

    for (const name of ["Alice", "Bob", "Cara", "Dan"]) {
      await worker.fetch(
        new Request("https://beachranker.test/api/players", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: adminCookie },
          body: JSON.stringify({ name, gender: "MEN" })
        }),
        testEnv
      );
    }

    const playersResponse = await worker.fetch(
      new Request("https://beachranker.test/api/players", { headers: { cookie: adminCookie } }),
      testEnv
    );
    const playersPayload = (await json(playersResponse)) as { players: Array<{ id: string; name: string }> };
    const players = Object.fromEntries(playersPayload.players.map((player) => [player.name, player.id]));

    await worker.fetch(
      new Request("https://beachranker.test/api/matches", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: adminCookie },
        body: JSON.stringify({
          playedAt: "2026-07-03T12:00:00.000Z",
          teamAPlayerIds: [players.Alice, players.Bob],
          teamBPlayerIds: [players.Cara, players.Dan],
          sets: [
            { teamAPoints: 21, teamBPoints: 19 },
            { teamAPoints: 21, teamBPoints: 18 }
          ]
        })
      }),
      testEnv
    );

    const vetleLogin = await worker.fetch(
      new Request("https://beachranker.test/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "vetlewh@example.com", password: "change-me-too" })
      }),
      testEnv
    );
    const vetleCookie = vetleLogin.headers.get("set-cookie") ?? "";

    const matchesResponse = await worker.fetch(
      new Request("https://beachranker.test/api/matches", { headers: { cookie: vetleCookie } }),
      testEnv
    );
    const matchesPayload = (await json(matchesResponse)) as { matches: Array<{ teamA: Array<{ name: string }> }> };

    expect(matchesPayload.matches).toHaveLength(1);
    expect(matchesPayload.matches[0].teamA.map((player) => player.name)).toEqual(["Alice", "Bob"]);
  });
});
