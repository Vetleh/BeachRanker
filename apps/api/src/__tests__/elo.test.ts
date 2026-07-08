import { describe, expect, it } from "vitest";
import { calculateEloUpdate, NORMAL_K, STARTING_RATING, TIEBREAK_K } from "../elo.js";
import { deriveWinnerFromSets, validateUniquePlayers } from "../matchValidation.js";

describe("calculateEloUpdate", () => {
  it("applies equal deltas to both partners in a doubles match", () => {
    const results = calculateEloUpdate({
      teamA: [
        { id: "a1", rating: STARTING_RATING },
        { id: "a2", rating: STARTING_RATING }
      ],
      teamB: [
        { id: "b1", rating: STARTING_RATING },
        { id: "b2", rating: STARTING_RATING }
      ],
      winningTeam: "A",
      isTiebreak: false
    });

    expect(results).toEqual([
      { playerId: "a1", preRating: 1500, postRating: 1516, delta: 16 },
      { playerId: "a2", preRating: 1500, postRating: 1516, delta: 16 },
      { playerId: "b1", preRating: 1500, postRating: 1484, delta: -16 },
      { playerId: "b2", preRating: 1500, postRating: 1484, delta: -16 }
    ]);
  });

  it("uses a smaller K-factor for tiebreak matches", () => {
    const normal = calculateEloUpdate({
      teamA: [{ id: "a1", rating: 1500 }, { id: "a2", rating: 1500 }],
      teamB: [{ id: "b1", rating: 1500 }, { id: "b2", rating: 1500 }],
      winningTeam: "A",
      isTiebreak: false
    });
    const tiebreak = calculateEloUpdate({
      teamA: [{ id: "a1", rating: 1500 }, { id: "a2", rating: 1500 }],
      teamB: [{ id: "b1", rating: 1500 }, { id: "b2", rating: 1500 }],
      winningTeam: "A",
      isTiebreak: true
    });

    expect(Math.abs(tiebreak[0].delta)).toBeLessThan(Math.abs(normal[0].delta));
    expect(NORMAL_K).toBe(32);
    expect(TIEBREAK_K).toBe(24);
  });
});

describe("match validation", () => {
  it("derives the winner from structured set scores", () => {
    expect(
      deriveWinnerFromSets([
        { teamAPoints: 21, teamBPoints: 18 },
        { teamAPoints: 18, teamBPoints: 21 },
        { teamAPoints: 15, teamBPoints: 13 }
      ])
    ).toBe("A");
  });

  it("rejects duplicate players", () => {
    expect(() => validateUniquePlayers(["a", "b"], ["c", "a"])).toThrow(
      "A player can only appear once in a match"
    );
  });
});
