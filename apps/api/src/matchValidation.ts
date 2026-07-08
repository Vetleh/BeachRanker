import { z } from "zod";
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
  let teamAWins = 0;
  let teamBWins = 0;

  sets.forEach((set, index) => {
    if (set.teamAPoints === set.teamBPoints) {
      throw new ApiError(400, `Set ${index + 1} cannot be tied`);
    }

    if (set.teamAPoints > set.teamBPoints) {
      teamAWins += 1;
    } else {
      teamBWins += 1;
    }
  });

  if (teamAWins === teamBWins) {
    throw new ApiError(400, "Set scores must produce a match winner");
  }

  return teamAWins > teamBWins ? "A" : "B";
}

export function validateUniquePlayers(teamAPlayerIds: string[], teamBPlayerIds: string[]) {
  const playerIds = [...teamAPlayerIds, ...teamBPlayerIds];
  const uniquePlayerIds = new Set(playerIds);

  if (uniquePlayerIds.size !== playerIds.length) {
    throw new ApiError(400, "A player can only appear once in a match");
  }
}
