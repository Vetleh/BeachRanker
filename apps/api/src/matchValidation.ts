import { z } from "zod";
import {
  deriveWinnerFromSets as deriveDomainWinnerFromSets,
  findTiedSetNumber,
  hasUniquePlayers
} from "@beach-ranker/domain/matchRules";
import { ApiError } from "./errors.js";
import type { TeamSide } from "./elo.js";

export const matchSetSchema = z.object({
  teamAPoints: z.coerce.number().int().min(0),
  teamBPoints: z.coerce.number().int().min(0)
});

export const matchInputSchema = z.object({
  playedAt: z.coerce.date(),
  teamAPlayerIds: z.array(z.string().min(1)).length(2),
  teamBPlayerIds: z.array(z.string().min(1)).length(2),
  sets: z.array(matchSetSchema).min(1).max(3),
  isTiebreak: z.boolean().optional()
});

export type MatchInput = z.infer<typeof matchInputSchema>;

export function deriveWinnerFromSets(sets: MatchInput["sets"]): TeamSide {
  const tiedSetNumber = findTiedSetNumber(sets);
  if (tiedSetNumber) {
    throw new ApiError(400, `Set ${tiedSetNumber} cannot be tied`);
  }

  const winner = deriveDomainWinnerFromSets(sets);
  if (!winner) {
    throw new ApiError(400, "Set scores must produce a match winner");
  }

  return winner;
}

export function validateUniquePlayers(teamAPlayerIds: string[], teamBPlayerIds: string[]) {
  if (!hasUniquePlayers(teamAPlayerIds, teamBPlayerIds)) {
    throw new ApiError(400, "A player can only appear once in a match");
  }
}
