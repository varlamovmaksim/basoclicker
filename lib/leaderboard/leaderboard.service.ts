import {
  getTopByBalance,
  getTotalPlayers,
  getRankByFid,
} from "./leaderboard.repository";

export interface LeaderboardRow {
  rank: number;
  fid: string;
  score: number;
  displayName: string | null;
  username: string | null;
  walletAddress: string | null;
  isYou?: boolean;
}

export interface LeaderboardResult {
  top100: LeaderboardRow[];
  totalPlayers: number;
  myRank: number | null;
}

/**
 * Returns leaderboard from DB. If fid is provided, includes myRank and isYou on the current user's row.
 */
export async function getLeaderboard(fid: string | null): Promise<LeaderboardResult> {
  const [top100, totalPlayers, myRank] = await Promise.all([
    getTopByBalance(100),
    getTotalPlayers(),
    fid ? getRankByFid(fid) : Promise.resolve(null),
  ]);

  const top100WithYou = fid
    ? top100.map((row) => (row.fid === fid ? { ...row, isYou: true } : row))
    : top100;

  return {
    top100: top100WithYou,
    totalPlayers,
    myRank,
  };
}
