"use client";

import { Card } from "./shared/Card";
import { formatCompact } from "../../lib/baso/utils";

export interface LeaderboardRowData {
  rank: number;
  fid: string | null;
  score: number;
  displayName: string | null;
  username: string | null;
  walletAddress: string | null;
  isYou?: boolean;
}

/** Display order: display_name, username, wallet_address, fid */
function leaderboardDisplayName(row: LeaderboardRowData): string {
  return (
    row.displayName ??
    row.username ??
    row.walletAddress ??
    row.fid ??
    "Unknown player"
  );
}

export interface LeaderboardViewProps {
  leaderboard: {
    top100: LeaderboardRowData[];
    myRank: number | null;
    totalPlayers: number;
  } | null;
  leaderboardLoading: boolean;
  leaderboardError: string | null;
  refreshLeaderboard: () => Promise<void>;
  score: number;
}

export function LeaderboardView({
  leaderboard,
  leaderboardLoading,
  leaderboardError,
  refreshLeaderboard,
  score,
}: LeaderboardViewProps): React.ReactElement {
  if (leaderboardLoading && !leaderboard) {
    return (
      <div className="flex justify-center py-8 text-sm text-slate-500">
        Loading leaderboard…
      </div>
    );
  }

  if (leaderboardError && !leaderboard) {
    return (
      <div className="space-y-3">
        <Card>
          <p className="text-sm text-red-600">{leaderboardError}</p>
          <button
            type="button"
            onClick={() => void refreshLeaderboard()}
            className="mt-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
          >
            Retry
          </button>
        </Card>
      </div>
    );
  }

  if (!leaderboard) {
    return (
      <div className="py-8 text-center text-sm text-slate-500">
        No leaderboard data
      </div>
    );
  }

  const { top100, myRank, totalPlayers } = leaderboard;

  return (
    <div className="space-y-3">
      <Card>
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 text-2xl">
            🏆
          </div>
          <div>
            <div className="text-sm font-black text-slate-900">
              Total players: {totalPlayers.toLocaleString("en-US")}
            </div>
          </div>
        </div>
      </Card>

      <div
        className="sticky top-0 z-10 mt-1"
        aria-live="polite"
      >
        <div className="rounded-2xl border border-slate-200 bg-white/90 px-3 py-2 shadow-md backdrop-blur">
          <div className="text-[11px] font-semibold text-slate-500">
            Your position
          </div>
          <div className="mt-1 flex items-center justify-between text-sm font-black text-slate-900">
            <div>
              #{myRank ?? "—"}{" "}
              <span className="text-xs font-semibold text-slate-500">
                of {totalPlayers.toLocaleString("en-US")}
              </span>
            </div>
            <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-black text-amber-800">
              🍩 {formatCompact(Math.floor(score))}
            </div>
          </div>
        </div>
      </div>

      <Card>
        <div className="flex items-center justify-between">
          <div className="text-sm font-black text-slate-900">Top 100</div>
          {leaderboardLoading && (
            <span className="text-xs text-slate-500">Updating…</span>
          )}
          {!leaderboardLoading && (
            <button
              type="button"
              onClick={() => void refreshLeaderboard()}
              className="text-xs font-semibold text-blue-600"
            >
              Refresh
            </button>
          )}
        </div>
        <div className="mt-2 flex flex-col gap-2">
          {top100.map((x) => (
            <div
              key={`${x.rank}:${x.walletAddress ?? x.fid ?? "unknown"}`}
              className={`flex items-center justify-between rounded-2xl border px-3 py-2 text-sm ${
                x.isYou
                  ? "border-blue-300 bg-blue-50"
                  : "border-slate-200 bg-white/80"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 text-xs font-black text-slate-500">
                  #{x.rank}
                </div>
                <div className="text-sm font-black text-slate-900">
                  {x.isYou ? "You" : leaderboardDisplayName(x)}
                </div>
              </div>
              <div className="text-sm font-black text-slate-900">
                {formatCompact(Math.floor(x.score))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
