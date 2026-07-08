import {
  deriveWinnerFromSets as deriveDomainWinnerFromSets,
  findTiedSetNumber,
  hasUniquePlayers
} from "@beach-ranker/domain/matchRules";
import { ApiError } from "./http";
import type { MatchInput, MatchSet, TeamSide } from "./types";

export function parseLogin(input: unknown) {
  const body = object(input);
  const email = string(body.email, "email");
  const password = string(body.password, "password");
  if (!email.includes("@")) {
    throw new ApiError(400, "Invalid email");
  }
  return { email, password };
}

export function parsePlayer(input: unknown) {
  const body = object(input);
  const name = string(body.name, "name").trim();
  if (!name) {
    throw new ApiError(400, "Player name is required");
  }
  const active = body.active === undefined ? undefined : Boolean(body.active);
  return { name, active };
}

export function parsePlayerPatch(input: unknown) {
  const body = object(input);
  return {
    name: body.name === undefined ? undefined : string(body.name, "name").trim(),
    active: body.active === undefined ? undefined : Boolean(body.active)
  };
}

export function parseUserCreate(input: unknown) {
  const body = object(input);
  const email = string(body.email, "email");
  const displayName = string(body.displayName, "displayName").trim();
  const password = string(body.password, "password");
  const role = body.role === "ADMIN" ? "ADMIN" : "PLAYER";
  const playerId = body.playerId === undefined ? undefined : string(body.playerId, "playerId");
  if (!email.includes("@") || !displayName || password.length < 8) {
    throw new ApiError(400, "Invalid user input");
  }
  return { email, displayName, password, role, playerId };
}

export function parsePasswordReset(input: unknown) {
  const body = object(input);
  const password = string(body.password, "password");
  if (password.length < 8) {
    throw new ApiError(400, "Password must be at least 8 characters");
  }
  return { password };
}

export function parseMatch(input: unknown): MatchInput {
  const body = object(input);
  const playedAt = isoDateString(body.playedAt, "playedAt");
  const teamAPlayerIds = stringArray(body.teamAPlayerIds, "teamAPlayerIds", 2);
  const teamBPlayerIds = stringArray(body.teamBPlayerIds, "teamBPlayerIds", 2);
  const sets = array(body.sets, "sets").map(parseSet);
  if (sets.length < 1 || sets.length > 3) {
    throw new ApiError(400, "A match must have one to three sets");
  }
  return {
    playedAt,
    teamAPlayerIds,
    teamBPlayerIds,
    sets,
    isTiebreak: body.isTiebreak === undefined ? undefined : Boolean(body.isTiebreak)
  };
}

export function deriveWinnerFromSets(sets: MatchSet[]): TeamSide {
  if (findTiedSetNumber(sets)) {
    throw new ApiError(400, "Set scores cannot be tied");
  }

  const winner = deriveDomainWinnerFromSets(sets);
  if (!winner) {
    throw new ApiError(400, "Match must have a winning team");
  }

  return winner;
}

export function validateUniquePlayers(teamAPlayerIds: string[], teamBPlayerIds: string[]) {
  if (!hasUniquePlayers(teamAPlayerIds, teamBPlayerIds)) {
    throw new ApiError(400, "A player can only appear once in a match");
  }
}

function parseSet(input: unknown): MatchSet {
  const body = object(input);
  const teamAPoints = number(body.teamAPoints, "teamAPoints");
  const teamBPoints = number(body.teamBPoints, "teamBPoints");
  return { teamAPoints, teamBPoints };
}

function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ApiError(400, "Invalid input");
  }
  return input as Record<string, unknown>;
}

function array(input: unknown, name: string) {
  if (!Array.isArray(input)) {
    throw new ApiError(400, `${name} must be an array`);
  }
  return input;
}

function stringArray(input: unknown, name: string, length: number) {
  const values = array(input, name);
  if (values.length !== length || values.some((value) => typeof value !== "string" || !value)) {
    throw new ApiError(400, `${name} must contain ${length} player IDs`);
  }
  return values as string[];
}

function string(input: unknown, name: string) {
  if (typeof input !== "string" || !input) {
    throw new ApiError(400, `${name} is required`);
  }
  return input;
}

function isoDateString(input: unknown, name: string) {
  const value = string(input, name);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    throw new ApiError(400, `${name} must be an ISO timestamp`);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, `${name} must be a valid date`);
  }

  return date.toISOString();
}

function number(input: unknown, name: string) {
  const value = Number(input);
  if (!Number.isInteger(value) || value < 0) {
    throw new ApiError(400, `${name} must be a non-negative integer`);
  }
  return value;
}
