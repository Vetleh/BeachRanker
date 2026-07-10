import { deriveWinnerFromSets, formatScore, type MatchSetScore, type TeamSide } from "@beach-ranker/domain";

export function deriveWinner(sets: MatchSetScore[]): TeamSide | null {
  return deriveWinnerFromSets(sets);
}

export { formatScore };
