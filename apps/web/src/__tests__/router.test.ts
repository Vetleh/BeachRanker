import { describe, expect, it } from "vitest";
import { getActiveTab, parseRoute } from "../router";

describe("router", () => {
  it("parses top-level routes", () => {
    expect(parseRoute("/")).toEqual({ name: "rankings", path: "/rankings/men", gender: "MEN" });
    expect(parseRoute("/rankings")).toEqual({ name: "rankings", path: "/rankings/men", gender: "MEN" });
    expect(parseRoute("/rankings/men")).toEqual({ name: "rankings", path: "/rankings/men", gender: "MEN" });
    expect(parseRoute("/rankings/women")).toEqual({ name: "rankings", path: "/rankings/women", gender: "WOMEN" });
    expect(parseRoute("/matches")).toEqual({ name: "matches", path: "/matches" });
    expect(parseRoute("/matches/new")).toEqual({ name: "newMatch", path: "/matches/new" });
    expect(parseRoute("/account")).toEqual({ name: "account", path: "/account" });
    expect(parseRoute("/admin")).toEqual({ name: "admin", path: "/admin" });
  });

  it("parses parameterized routes", () => {
    expect(parseRoute("/matches/match-1/edit")).toEqual({
      name: "editMatch",
      path: "/matches/match-1/edit",
      matchId: "match-1",
    });
    expect(parseRoute("/players/alice%20id")).toEqual({
      name: "player",
      path: "/players/alice%20id",
      playerId: "alice id",
    });
  });

  it("maps routes to active tabs", () => {
    expect(getActiveTab(parseRoute("/matches/new"))).toBe("add");
    expect(getActiveTab(parseRoute("/players/alice"))).toBe("profile");
    expect(getActiveTab(parseRoute("/unknown"))).toBe("rankings");
  });
});
