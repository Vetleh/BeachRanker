import {
  clearSessionCookie,
  createSessionCookie,
  createSessionToken,
  getAuthUser,
  hashPassword,
  requireAdmin,
  requireAuth,
  verifyPassword,
} from "./auth";
import {
  countActivePlayers,
  createMatch,
  createPlayer,
  createUser,
  deleteMatch,
  findPlayerByUserId,
  findMatchIdByIdempotencyKey,
  findUserByEmail,
  listMatches,
  listPlayers,
  updatePlayer,
  updateUserPassword,
  updateMatch,
  addAuditLog,
  listAuditLog,
  revokeUserSessions,
} from "./db";
import type { Env } from "./env";
import { ApiError, json, noContent, readJson, requireString } from "./http";
import { assertLoginAllowed, clearLoginAttempts, loginAttemptKey, recordFailedLogin } from "./loginLimiter";
import { withRatingWriteLock } from "./ratingWriteLock";
import { formatMatch, getMatches, getMatchesForPlayer, getRankings, recalculateRatings } from "./ratingService";
import {
  deriveWinnerFromSets,
  parseLogin,
  parseMatch,
  parsePasswordReset,
  parsePlayer,
  parsePlayerPatch,
  parseUserCreate,
  validateUniquePlayers,
} from "./validation";

type RouteContext = {
  request: Request;
  env: Env;
  params: Record<string, string>;
};

type Handler = (context: RouteContext) => Promise<Response>;

const routes: Array<{ method: string; pattern: RegExp; handler: Handler }> = [
  { method: "GET", pattern: /^\/api\/health$/, handler: health },
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
  { method: "DELETE", pattern: /^\/api\/matches\/(?<id>[^/]+)$/, handler: removeMatch },
  { method: "GET", pattern: /^\/api\/admin\/audit-log$/, handler: auditLog },
];

async function health({ env }: RouteContext) {
  await env.DB.prepare("SELECT 1").first();
  return json({ status: "ok" });
}

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
  const attemptKey = loginAttemptKey(request, input.email);
  await assertLoginAllowed(env.DB, attemptKey);
  const user = await findUserByEmail(env.DB, input.email);

  if (!user || user.active !== 1 || !(await verifyPassword(input.password, user.passwordHash))) {
    await recordFailedLogin(env.DB, attemptKey);
    throw new ApiError(401, "Invalid email or password");
  }

  await clearLoginAttempts(env.DB, attemptKey);
  const responseUser = {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  };

  if (input.authMode === "bearer") {
    return json({ user: responseUser, token: await createSessionToken(env, user.id) });
  }

  return json({ user: responseUser }, { headers: { "set-cookie": await createSessionCookie(env, user.id) } });
}

async function logout({ request, env }: RouteContext) {
  const user = await getAuthUser(request, env);
  if (user) {
    await revokeUserSessions(env.DB, user.id);
  }
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
  const user = requireAdmin(await getAuthUser(request, env));
  const input = parsePlayer(await readJson(request));
  const player = await createPlayer(env.DB, input);
  await addAuditLog(env.DB, { actorUserId: user.id, action: "CREATE", entityType: "PLAYER", entityId: player.id });
  return json({ player }, { status: 201 });
}

async function editPlayer({ request, env, params }: RouteContext) {
  const user = requireAdmin(await getAuthUser(request, env));
  const playerId = requireString(params.id, "id");
  const player = await updatePlayer(env.DB, playerId, parsePlayerPatch(await readJson(request)));
  if (!player) {
    throw new ApiError(404, "Player not found");
  }
  await addAuditLog(env.DB, { actorUserId: user.id, action: "UPDATE", entityType: "PLAYER", entityId: playerId });
  return json({ player });
}

async function addUser({ request, env }: RouteContext) {
  const admin = requireAdmin(await getAuthUser(request, env));
  const input = parseUserCreate(await readJson(request));
  const user = await createUser(env.DB, {
    email: input.email,
    displayName: input.displayName,
    passwordHash: await hashPassword(input.password),
    role: input.role,
    playerId: input.playerId,
  });
  await addAuditLog(env.DB, { actorUserId: admin.id, action: "CREATE", entityType: "USER", entityId: user.id });
  return json({ user }, { status: 201 });
}

async function resetPassword({ request, env, params }: RouteContext) {
  const admin = requireAdmin(await getAuthUser(request, env));
  const input = parsePasswordReset(await readJson(request));
  const userId = requireString(params.id, "id");
  const user = await updateUserPassword(env.DB, userId, await hashPassword(input.password));
  if (!user) {
    throw new ApiError(404, "User not found");
  }
  await addAuditLog(env.DB, { actorUserId: admin.id, action: "RESET_PASSWORD", entityType: "USER", entityId: userId });
  return json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      active: user.active === 1,
    },
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
  const page = parseMatchPage(url);

  if (requestedPlayerId) {
    return json(await getMatchesForPlayer(env.DB, requestedPlayerId, page));
  }

  const player = await findPlayerByUserId(env.DB, user.id);

  if (user.role === "ADMIN" && (!player || player.active !== 1)) {
    return json(await getMatches(env.DB, page));
  }

  if (!player || player.active !== 1) {
    return json({ matches: [], hasMore: false });
  }

  return json(await getMatchesForPlayer(env.DB, player.id, page));
}

function parseMatchPage(url: URL) {
  const limit = parsePositiveInteger(url.searchParams.get("limit"), 200);
  const offset = parseNonNegativeInteger(url.searchParams.get("offset"), 0);
  if (limit > 200) {
    throw new ApiError(400, "limit cannot exceed 200");
  }
  return { limit, offset };
}

function parsePositiveInteger(value: string | null, fallback: number) {
  if (value === null) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new ApiError(400, "limit must be a positive integer");
  }
  return parsed;
}

function parseNonNegativeInteger(value: string | null, fallback: number) {
  if (value === null) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new ApiError(400, "offset must be a non-negative integer");
  }
  return parsed;
}

async function addMatch({ request, env }: RouteContext) {
  const user = requireAuth(await getAuthUser(request, env));
  const input = parseMatch(await readJson(request));
  validateUniquePlayers(input.teamAPlayerIds, input.teamBPlayerIds);
  await assertPlayersExist(env, [...input.teamAPlayerIds, ...input.teamBPlayerIds]);
  const winningTeam = deriveWinnerFromSets(input.sets);
  const idempotencyKey = request.headers.get("idempotency-key")?.trim() || undefined;
  if (idempotencyKey && idempotencyKey.length > 128) {
    throw new ApiError(400, "Idempotency-Key is too long");
  }
  input.idempotencyKey = idempotencyKey;
  return withRatingWriteLock(env.DB, async () => {
    if (idempotencyKey) {
      const existingMatchId = await findMatchIdByIdempotencyKey(env.DB, user.id, idempotencyKey);
      if (existingMatchId) {
        return formatExistingMatch(env, existingMatchId);
      }
    }

    const matchId = await createMatch(env.DB, input, winningTeam, user.id);
    await recalculateRatings(env.DB);
    await addAuditLog(env.DB, { actorUserId: user.id, action: "CREATE", entityType: "MATCH", entityId: matchId });
    const match = (await listMatches(env.DB)).find((candidate) => candidate.id === matchId);
    if (!match) {
      throw new ApiError(500, "Could not load saved match");
    }
    return json({ match: await formatMatch(env.DB, match) }, { status: 201 });
  });
}

async function formatExistingMatch(env: Env, matchId: string) {
  const match = (await listMatches(env.DB)).find((candidate) => candidate.id === matchId);
  if (!match) {
    throw new ApiError(409, "The idempotent match is unavailable");
  }
  return json({ match: await formatMatch(env.DB, match) });
}

async function correctMatch({ request, env, params }: RouteContext) {
  const user = requireAdmin(await getAuthUser(request, env));
  const input = parseMatch(await readJson(request));
  validateUniquePlayers(input.teamAPlayerIds, input.teamBPlayerIds);
  await assertPlayersExist(env, [...input.teamAPlayerIds, ...input.teamBPlayerIds]);
  const winningTeam = deriveWinnerFromSets(input.sets);
  const matchId = requireString(params.id, "id");
  return withRatingWriteLock(env.DB, async () => {
    const updated = await updateMatch(env.DB, matchId, input, winningTeam);
    if (!updated) {
      throw new ApiError(404, "Match not found");
    }
    await recalculateRatings(env.DB);
    await addAuditLog(env.DB, { actorUserId: user.id, action: "UPDATE", entityType: "MATCH", entityId: matchId });
    const match = (await listMatches(env.DB)).find((candidate) => candidate.id === matchId);
    if (!match) {
      throw new ApiError(404, "Match not found");
    }
    return json({ match: await formatMatch(env.DB, match) });
  });
}

async function removeMatch({ request, env, params }: RouteContext) {
  const user = requireAdmin(await getAuthUser(request, env));
  const matchId = requireString(params.id, "id");
  return withRatingWriteLock(env.DB, async () => {
    const deleted = await deleteMatch(env.DB, matchId);
    if (!deleted) {
      throw new ApiError(404, "Match not found");
    }
    await recalculateRatings(env.DB);
    await addAuditLog(env.DB, { actorUserId: user.id, action: "DELETE", entityType: "MATCH", entityId: matchId });
    return noContent();
  });
}

async function auditLog({ request, env }: RouteContext) {
  requireAdmin(await getAuthUser(request, env));
  return json({ entries: await listAuditLog(env.DB) });
}

async function assertPlayersExist(env: Env, playerIds: string[]) {
  const count = await countActivePlayers(env.DB, playerIds);
  if (count !== playerIds.length) {
    throw new ApiError(400, "All selected players must exist and be active");
  }
}
