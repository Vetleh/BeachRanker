import { Router } from "express";
import { Role } from "@prisma/client";
import { z } from "zod";
import { clearAuthCookie, createSessionToken, hashPassword, requireAuth, requireRole, setAuthCookie, verifyPassword } from "./auth.js";
import { prisma } from "./db.js";
import { ApiError, asyncHandler } from "./errors.js";
import { assertLoginAllowed, clearLoginAttempts, loginAttemptKey, recordFailedLogin } from "./loginLimiter.js";
import { deriveWinnerFromSets, matchInputSchema, validateUniquePlayers } from "./matchValidation.js";
import { getMatches, getRankings, hydrateMatch, recalculateRatings } from "./ratingService.js";

const router = Router();
const requireAdmin = requireRole(Role.ADMIN);
const initialRatingOptions = [1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000] as const;
const playerGenderSchema = z.enum(["MEN", "WOMEN"]);

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const playerCreateSchema = z.object({
  name: z.string().trim().min(1),
  active: z.boolean().optional(),
  initialRating: z.number().int().refine((rating) => initialRatingOptions.includes(rating as (typeof initialRatingOptions)[number])).optional(),
  gender: playerGenderSchema
});

const playerPatchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  active: z.boolean().optional()
});

const userCreateSchema = z.object({
  email: z.string().email(),
  displayName: z.string().trim().min(1),
  password: z.string().min(8),
  role: z.nativeEnum(Role).default(Role.PLAYER),
  playerId: z.string().optional()
});

const resetPasswordSchema = z.object({
  password: z.string().min(8)
});

function routeParam(value: string | string[] | undefined, name: string) {
  if (typeof value !== "string") {
    throw new ApiError(400, `Missing route parameter: ${name}`);
  }

  return value;
}

router.post(
  "/auth/login",
  asyncHandler(async (req, res) => {
    const input = loginSchema.parse(req.body);
    const attemptKey = loginAttemptKey(req.ip, input.email);
    assertLoginAllowed(attemptKey);
    const user = await prisma.user.findUnique({ where: { email: input.email } });

    if (!user || !user.active || !(await verifyPassword(input.password, user.passwordHash))) {
      recordFailedLogin(attemptKey);
      throw new ApiError(401, "Invalid email or password");
    }

    clearLoginAttempts(attemptKey);
    setAuthCookie(res, user.id);
    return res.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role
      },
      token: createSessionToken(user.id)
    });
  })
);

router.post("/auth/logout", (_req, res) => {
  clearAuthCookie(res);
  return res.status(204).send();
});

router.get("/auth/me", requireAuth, (req, res) => {
  return res.json({ user: req.user });
});

router.get(
  "/players",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const players = await prisma.player.findMany({ orderBy: { name: "asc" } });
    return res.json({ players });
  })
);

router.post(
  "/players",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const input = playerCreateSchema.parse(req.body);
    const player = await prisma.player.create({ data: input });
    return res.status(201).json({ player });
  })
);

router.patch(
  "/players/:id",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const input = playerPatchSchema.parse(req.body);
    const playerId = routeParam(req.params.id, "id");
    const player = await prisma.player.update({
      where: { id: playerId },
      data: input
    });
    return res.json({ player });
  })
);

router.post(
  "/users",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const input = userCreateSchema.parse(req.body);
    const passwordHash = await hashPassword(input.password);
    const user = await prisma.user.create({
      data: {
        email: input.email,
        displayName: input.displayName,
        passwordHash,
        role: input.role,
        player: input.playerId ? { connect: { id: input.playerId } } : undefined
      },
      select: { id: true, email: true, displayName: true, role: true, active: true }
    });
    return res.status(201).json({ user });
  })
);

router.patch(
  "/users/:id/password",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const input = resetPasswordSchema.parse(req.body);
    const userId = routeParam(req.params.id, "id");
    const user = await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(input.password) },
      select: { id: true, email: true, displayName: true, role: true, active: true }
    });
    return res.json({ user });
  })
);

router.get(
  "/rankings",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const rankings = await getRankings();
    return res.json({ rankings });
  })
);

router.get(
  "/matches",
  requireAuth,
  asyncHandler(async (req, res) => {
    const requestedPlayerId = typeof req.query.playerId === "string" ? req.query.playerId : null;
    if (requestedPlayerId) {
      const matches = await getMatches(requestedPlayerId);
      return res.json({ matches });
    }

    const player = await prisma.player.findUnique({
      where: { userId: req.user!.id }
    });

    if (req.user!.role === "ADMIN" && (!player || !player.active)) {
      const matches = await getMatches();
      return res.json({ matches });
    }

    if (!player || !player.active) {
      return res.json({ matches: [] });
    }

    const matches = await getMatches(player.id);
    return res.json({ matches });
  })
);

async function assertPlayersExist(playerIds: string[]) {
  const count = await prisma.player.count({
    where: { id: { in: playerIds }, active: true }
  });

  if (count !== playerIds.length) {
    throw new ApiError(400, "All selected players must exist and be active");
  }
}

router.post(
  "/matches",
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = matchInputSchema.parse(req.body);
    validateUniquePlayers(input.teamAPlayerIds, input.teamBPlayerIds);
    await assertPlayersExist([...input.teamAPlayerIds, ...input.teamBPlayerIds]);
    const winningTeam = deriveWinnerFromSets(input.sets);

    const match = await prisma.match.create({
      data: {
        playedAt: input.playedAt,
        winningTeam,
        isTiebreak: input.isTiebreak ?? input.sets.length >= 3,
        enteredByUserId: req.user!.id,
        teamAPlayer1Id: input.teamAPlayerIds[0],
        teamAPlayer2Id: input.teamAPlayerIds[1],
        teamBPlayer1Id: input.teamBPlayerIds[0],
        teamBPlayer2Id: input.teamBPlayerIds[1],
        sets: {
          create: input.sets.map((set, index) => ({
            setNumber: index + 1,
            teamAPoints: set.teamAPoints,
            teamBPoints: set.teamBPoints
          }))
        }
      }
    });

    await recalculateRatings();

    return res.status(201).json({ match: await hydrateMatch(match.id) });
  })
);

router.patch(
  "/matches/:id",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const input = matchInputSchema.parse(req.body);
    const matchId = routeParam(req.params.id, "id");
    validateUniquePlayers(input.teamAPlayerIds, input.teamBPlayerIds);
    await assertPlayersExist([...input.teamAPlayerIds, ...input.teamBPlayerIds]);
    const winningTeam = deriveWinnerFromSets(input.sets);

    await prisma.$transaction(async (tx) => {
      await tx.matchSet.deleteMany({ where: { matchId } });
      await tx.match.update({
        where: { id: matchId },
        data: {
          playedAt: input.playedAt,
          winningTeam,
          isTiebreak: input.isTiebreak ?? input.sets.length >= 3,
          teamAPlayer1Id: input.teamAPlayerIds[0],
          teamAPlayer2Id: input.teamAPlayerIds[1],
          teamBPlayer1Id: input.teamBPlayerIds[0],
          teamBPlayer2Id: input.teamBPlayerIds[1],
          sets: {
            create: input.sets.map((set, index) => ({
              setNumber: index + 1,
              teamAPoints: set.teamAPoints,
              teamBPoints: set.teamBPoints
            }))
          }
        }
      });
    });

    await recalculateRatings();

    return res.json({ match: await hydrateMatch(matchId) });
  })
);

router.delete(
  "/matches/:id",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const matchId = routeParam(req.params.id, "id");
    await prisma.match.delete({ where: { id: matchId } });
    await recalculateRatings();
    return res.status(204).send();
  })
);

export { router };
