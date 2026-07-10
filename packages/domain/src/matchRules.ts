import type { TeamSide } from "./elo.js";

export type MatchSetScore = {
  teamAPoints: number;
  teamBPoints: number;
};

export function validateMatchSets(sets: MatchSetScore[]): string | null {
  if (sets.length === 0) {
    return "A match must contain at least one set.";
  }

  for (const [index, set] of sets.entries()) {
    const high = Math.max(set.teamAPoints, set.teamBPoints);
    const low = Math.min(set.teamAPoints, set.teamBPoints);

    if (!Number.isInteger(set.teamAPoints) || !Number.isInteger(set.teamBPoints) || low < 0) {
      return `Set ${index + 1} must contain whole, non-negative scores.`;
    }
    if (set.teamAPoints === set.teamBPoints || high - low < 2) {
      return `Set ${index + 1} must have a winner by at least two points.`;
    }
  }

  return null;
}

export function deriveWinnerFromSets(sets: MatchSetScore[]): TeamSide | null {
  let teamAWins = 0;
  let teamBWins = 0;

  for (const set of sets) {
    if (set.teamAPoints === set.teamBPoints) {
      continue;
    }
    if (set.teamAPoints > set.teamBPoints) {
      teamAWins += 1;
    } else {
      teamBWins += 1;
    }
  }

  if (teamAWins === teamBWins) {
    return null;
  }

  return teamAWins > teamBWins ? "A" : "B";
}

export function findTiedSetNumber(sets: MatchSetScore[]) {
  const tiedSetIndex = sets.findIndex((set) => set.teamAPoints === set.teamBPoints);
  return tiedSetIndex === -1 ? null : tiedSetIndex + 1;
}

export function hasUniquePlayers(teamAPlayerIds: string[], teamBPlayerIds: string[]) {
  const playerIds = [...teamAPlayerIds, ...teamBPlayerIds];
  return new Set(playerIds).size === playerIds.length;
}

export function formatScore(sets: MatchSetScore[]) {
  return sets.map((set) => `${set.teamAPoints}-${set.teamBPoints}`).join(", ");
}
