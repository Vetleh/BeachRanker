import { describe, expect, it } from "vitest";
import { calculateEloUpdate } from "./elo.js";
import { deriveWinnerFromSets, findTiedSetNumber, formatScore, hasUniquePlayers } from "./matchRules.js";

describe("domain rules", () => {
  it("calculates Elo updates for a normal match", () => {
    expect(
      calculateEloUpdate({
        teamA: [
          { id: "a1", rating: 1500 },
          { id: "a2", rating: 1500 }
        ],
        teamB: [
          { id: "b1", rating: 1500 },
          { id: "b2", rating: 1500 }
        ],
        winningTeam: "A",
        isTiebreak: false
      })
    ).toEqual([
      { playerId: "a1", preRating: 1500, postRating: 1516, delta: 16 },
      { playerId: "a2", preRating: 1500, postRating: 1516, delta: 16 },
      { playerId: "b1", preRating: 1500, postRating: 1484, delta: -16 },
      { playerId: "b2", preRating: 1500, postRating: 1484, delta: -16 }
    ]);
  });

  it("derives match rules from set scores", () => {
    const sets = [
      { teamAPoints: 21, teamBPoints: 19 },
      { teamAPoints: 18, teamBPoints: 21 },
      { teamAPoints: 15, teamBPoints: 12 }
    ];

    expect(deriveWinnerFromSets(sets)).toBe("A");
    expect(findTiedSetNumber(sets)).toBeNull();
    expect(formatScore(sets)).toBe("21-19, 18-21, 15-12");
    expect(hasUniquePlayers(["a", "b"], ["c", "d"])).toBe(true);
    expect(hasUniquePlayers(["a", "b"], ["a", "d"])).toBe(false);
  });
});
