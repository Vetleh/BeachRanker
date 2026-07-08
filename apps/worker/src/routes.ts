import {
  clearSessionCookie,
  createSessionCookie,
  getAuthUser,
  hashPassword,
  requireAdmin,
  requireAuth,
  verifyPassword
} from "./auth";
import {
  countActivePlayers,
  createMatch,
  createPlayer,
  createUser,
  deleteMatch,
  findPlayerByUserId,
  findUserByEmail,
  listMatches,
  listPlayers,
  updatePlayer,
  updateUserPassword,
  updateMatch
} from "./db";
import type { Env } from "./env";
import { ApiError, json, noContent, readJson, requireString } from "./http";
import { formatMatch, getMatchesForPlayer, getRankings, recalculateRatings } from "./ratingService";
import {
  deriveWinnerFromSets,
  parseLogin,
  parseMatch,
  parsePasswordReset,
  parsePlayer,
  parsePlayerPatch,
  parseUserCreate,
  validateUniquePlayers
} from "./validation";

type RouteContext = {
  request: Request;
  env: Env;
  params: Record<string, string>;
};

type Handler = (context: RouteContext) => Promise<Response>;

const routes: Array<{ method: string; pattern: RegExp; handler: Handler }> = [
  { method: "POST", pattern: /^\/api\/auth\/login$/, handler: login },
  { method: "POST", pattern: /^\/api\/auth\/logout$/, handler: logout },
  { method: "GET", pattern: /^\/api\/auth\/me$/, handler: me },
  { method: "GET", pattern: /^\/api\/players$/, handler: players },
  { method: "POST", pattern: /^\/api\/players$/, handler: addPlayer },
  { method: "PATCH", pattern: /^\/api\/players\/(?<id>[^/]+)$/, handler: editPlayer },
  { method: "POST", pattern: /^\/api\/users$/, handler: addUser },
  { method: "PATCH", pattern: /^\/api\/users\/(?<id>[^/]+)\/password$/, handler: resetPassword },
  { method: "GET", pattern: /^\/api\/rankings$/, handler: rankings },
  { method: "GET", pattern: /^\/api\/matches$/, handler: matches },
  { method: "POST", pattern: /^\/api\/matches$/, handler: addMatch },
  { method: "PATCH", pattern: /^\/api\/matches\/(?<id>[^/]+)$/, handler: correctMatch },
  { method: "DELETE", pattern: /^\/api\/matches\/(?<id>[^/]+)$/, handler: removeMatch }
];

export async function handleApi(request: Request, env: Env) {
  const url = new URL(request.url);
  for (const route of routes) {
    const match = url.pathname.match(route.pattern);
    if (request.method === route.method && match) {
      return route.handler({ request, env, params: match.groups ?? {} });
    }
  }

  return json({ error: "Not found" }, { status: 404 });
}

async function login({ request, env }: RouteContext) {
  const input = parseLogin(await readJson(request));
  const user = await findUserByEmail(env.DB, input.email);

  if (!user || user.active !== 1 || !(await verifyPassword(input.password, user.passwordHash))) {
    throw new ApiError(401, "Invalid email or password");
  }

  return json(
    {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role
      }
    },
    { headers: { "set-cookie": await createSessionCookie(env, user.id) } }
  );
}

async function logout() {
  return noContent({ headers: { "set-cookie": clearSessionCookie() } });
}

async function me({ request, env }: RouteContext) {
  return json({ user: requireAuth(await getAuthUser(request, env)) });
}

async function players({ request, env }: RouteContext) {
  requireAuth(await getAuthUser(request, env));
  return json({ players: await listPlayers(env.DB) });
}

async function addPlayer({ request, env }: RouteContext) {
  requireAdmin(await getAuthUser(request, env));
  const input = parsePlayer(await readJson(request));
  return json({ player: await createPlayer(env.DB, input) }, { status: 201 });
}

async function editPlayer({ request, env, params }: RouteContext) {
  requireAdmin(await getAuthUser(request, env));
  const player = await updatePlayer(env.DB, requireString(params.id, "id"), parsePlayerPatch(await readJson(request)));
  if (!player) {
    throw new ApiError(404, "Player not found");
  }
  return json({ player });
}

async function addUser({ request, env }: RouteContext) {
  requireAdmin(await getAuthUser(request, env));
  const input = parseUserCreate(await readJson(request));
  const user = await createUser(env.DB, {
    email: input.email,
    displayName: input.displayName,
    passwordHash: await hashPassword(input.password),
    role: input.role,
    playerId: input.playerId
  });
  return json({ user }, { status: 201 });
}

async function resetPassword({ request, env, params }: RouteContext) {
  requireAdmin(await getAuthUser(request, env));
  const input = parsePasswordReset(await readJson(request));
  const user = await updateUserPassword(env.DB, requireString(params.id, "id"), await hashPassword(input.password));
  if (!user) {
    throw new ApiError(404, "User not found");
  }
  return json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      active: user.active === 1
    }
  });
}

async function rankings({ request, env }: RouteContext) {
  requireAuth(await getAuthUser(request, env));
  return json({ rankings: await getRankings(env.DB) });
}

async function matches({ request, env }: RouteContext) {
  const user = requireAuth(await getAuthUser(request, env));
  const url = new URL(request.url);
  const requestedPlayerId = url.searchParams.get("playerId");

  if (requestedPlayerId) {
    return json({ matches: await getMatchesForPlayer(env.DB, requestedPlayerId) });
  }

  const player = await findPlayerByUserId(env.DB, user.id);
  if (!player || player.active !== 1) {
    return json({ matches: [] });
  }

  return json({ matches: await getMatchesForPlayer(env.DB, player.id) });
}

async function addMatch({ request, env }: RouteContext) {
  const user = requireAuth(await getAuthUser(request, env));
  const input = parseMatch(await readJson(request));
  validateUniquePlayers(input.teamAPlayerIds, input.teamBPlayerIds);
  await assertPlayersExist(env, [...input.teamAPlayerIds, ...input.teamBPlayerIds]);
  const winningTeam = deriveWinnerFromSets(input.sets);
  const matchId = await createMatch(env.DB, input, winningTeam, user.id);
  await recalculateRatings(env.DB);
  const match = (await listMatches(env.DB)).find((candidate) => candidate.id === matchId);
  if (!match) {
    throw new ApiError(500, "Could not load saved match");
  }
  return json({ match: await formatMatch(env.DB, match) }, { status: 201 });
}

async function correctMatch({ request, env, params }: RouteContext) {
  requireAdmin(await getAuthUser(request, env));
  const input = parseMatch(await readJson(request));
  validateUniquePlayers(input.teamAPlayerIds, input.teamBPlayerIds);
  await assertPlayersExist(env, [...input.teamAPlayerIds, ...input.teamBPlayerIds]);
  const winningTeam = deriveWinnerFromSets(input.sets);
  const matchId = requireString(params.id, "id");
  await updateMatch(env.DB, matchId, input, winningTeam);
  await recalculateRatings(env.DB);
  const match = (await listMatches(env.DB)).find((candidate) => candidate.id === matchId);
  if (!match) {
    throw new ApiError(404, "Match not found");
  }
  return json({ match: await formatMatch(env.DB, match) });
}

async function removeMatch({ request, env, params }: RouteContext) {
  requireAdmin(await getAuthUser(request, env));
  await deleteMatch(env.DB, requireString(params.id, "id"));
  await recalculateRatings(env.DB);
  return noContent();
}

async function assertPlayersExist(env: Env, playerIds: string[]) {
  const count = await countActivePlayers(env.DB, playerIds);
  if (count !== playerIds.length) {
    throw new ApiError(400, "All selected players must exist and be active");
  }
}
