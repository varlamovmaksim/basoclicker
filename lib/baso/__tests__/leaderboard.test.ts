import { describe, expect, it } from "vitest";
import { buildLeaderboard, TOTAL_PLAYERS } from "../leaderboard";

describe("buildLeaderboard", () => {
  it("returns exactly 100 entries in top100", () => {
    const { top100 } = buildLeaderboard(63_398_000);
    expect(top100).toHaveLength(100);
  });

  it("always assigns a rank >= 1 for the current player", () => {
    const { myRank } = buildLeaderboard(1_000);
    expect(myRank).toBeGreaterThanOrEqual(1);
  });

  it("uses the configured TOTAL_PLAYERS value", () => {
    const { totalPlayers } = buildLeaderboard(1_000);
    expect(totalPlayers).toBe(TOTAL_PLAYERS);
  });
});

