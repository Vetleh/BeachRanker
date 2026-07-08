import type { MatchSet, TeamSide } from "./types";

export function deriveWinner(sets: MatchSet[]): TeamSide | null {
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

export function formatScore(sets: MatchSet[]) {
  return sets.map((set) => `${set.teamAPoints}-${set.teamBPoints}`).join(", ");
}
