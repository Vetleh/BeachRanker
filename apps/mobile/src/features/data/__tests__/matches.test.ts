import type { Match } from "@beach-ranker/api-client";
import { mergeMatches } from "../matches";

function match(id: string) {
  return { id } as Match;
}

describe("mergeMatches", () => {
  it("appends only matches that are not already in the loaded page", () => {
    expect(mergeMatches([match("one"), match("two")], [match("two"), match("three")]).map((item) => item.id)).toEqual([
      "one",
      "two",
      "three",
    ]);
  });
});
