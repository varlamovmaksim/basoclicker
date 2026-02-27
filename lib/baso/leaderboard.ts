export type LeaderEntry = { name: string; score: number };

export type LeaderRow = { rank: number; name: string; score: number };

export const TOTAL_PLAYERS = 52_089;

export function buildLeaderboard(myScore: number): {
  top100: LeaderRow[];
  myRank: number;
  totalPlayers: number;
} {
  const fixedTop: LeaderEntry[] = [
    { name: "kingyru", score: 92_430_000 },
    { name: "arbase", score: 81_220_000 },
    { name: "base_builder", score: 75_800_000 },
    { name: "gm_farmer", score: 71_120_000 },
    { name: "blue_whale", score: 66_300_000 },
  ];

  const fillers: LeaderEntry[] = [];
  let s = 64_900_000;
  for (let i = 0; i < 220; i++) {
    const step = 360_000 + (i % 9) * 18_000;
    s = Math.max(350_000, s - step);
    fillers.push({ name: `builder_${String(i + 1).padStart(3, "0")}`, score: s });
  }

  const all: LeaderEntry[] = [...fixedTop, ...fillers, { name: "you", score: myScore }];
  all.sort((a, b) => b.score - a.score);

  const myRank = Math.max(1, all.findIndex((x) => x.name === "you") + 1);
  const top = all.slice(0, 100);
  const top100: LeaderRow[] = top.map((x, idx) => ({ rank: idx + 1, name: x.name, score: x.score }));
  return { top100, myRank, totalPlayers: TOTAL_PLAYERS };
}

