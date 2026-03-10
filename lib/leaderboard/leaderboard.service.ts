import {
  getRankByAddress,
  getTopByBalance,
  getTotalPlayers,
} from "./leaderboard.repository";

export interface LeaderboardRow {
  rank: number;
  fid: string | null;
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
 * Returns leaderboard from DB. If address is provided, includes myRank and isYou on the current user's row.
 */
export async function getLeaderboard(address: string | null): Promise<LeaderboardResult> {
  const [top100, totalPlayers, myRank] = await Promise.all([
    getTopByBalance(100),
    getTotalPlayers(),
    address ? getRankByAddress(address) : Promise.resolve(null),
  ]);

  const top100WithYou = address
    ? top100.map((row) =>
        row.walletAddress === address ? { ...row, isYou: true } : row
      )
    : top100;

  return {
    top100: top100WithYou,
    totalPlayers,
    myRank,
  };
}
