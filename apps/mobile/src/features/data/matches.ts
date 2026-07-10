import type { Match } from "@beach-ranker/api-client";

export function mergeMatches(current: Match[], next: Match[]) {
  const existing = new Set(current.map((match) => match.id));
  return [...current, ...next.filter((match) => !existing.has(match.id))];
}
