import type { TeamSide } from "./elo.js";

export type MatchSetScore = {
  teamAPoints: number;
  teamBPoints: number;
};

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
