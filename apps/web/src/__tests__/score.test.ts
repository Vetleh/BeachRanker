import { describe, expect, it } from "vitest";
import { deriveWinner, formatScore } from "../score";

describe("score helpers", () => {
  it("derives the winning team from set scores", () => {
    expect(
      deriveWinner([
        { teamAPoints: 21, teamBPoints: 19 },
        { teamAPoints: 18, teamBPoints: 21 },
        { teamAPoints: 15, teamBPoints: 12 }
      ])
    ).toBe("A");
  });

  it("formats multi-set scores for history", () => {
    expect(
      formatScore([
        { teamAPoints: 21, teamBPoints: 19 },
        { teamAPoints: 15, teamBPoints: 13 }
      ])
    ).toBe("21-19, 15-13");
  });
});
