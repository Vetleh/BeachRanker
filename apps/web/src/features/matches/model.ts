import type { MatchSet } from "@beach-ranker/api-client";

export const emptySets: MatchSet[] = [
  { teamAPoints: 21, teamBPoints: 18 },
  { teamAPoints: 21, teamBPoints: 18 },
];

export type EditableScore = number | "";
export type ScoreField = "teamAPoints" | "teamBPoints";
export type EditableMatchSet = {
  teamAPoints: EditableScore;
  teamBPoints: EditableScore;
};

export function parseEditableScore(value: string): EditableScore {
  if (value === "") {
    return "";
  }
  const score = Number(value);
  return Number.isFinite(score) ? score : "";
}

export function normalizeSets(sets: EditableMatchSet[]): MatchSet[] {
  return sets.map((set) => ({
    teamAPoints: set.teamAPoints === "" ? 0 : set.teamAPoints,
    teamBPoints: set.teamBPoints === "" ? 0 : set.teamBPoints,
  }));
}
