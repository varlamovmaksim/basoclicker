"use client";

import type { LeaderRow } from "../../lib/baso/leaderboard";
import { Card } from "./shared/Card";
import { formatCompact } from "../../lib/baso/utils";

export interface LeaderboardViewProps {
  leaderboard: {
    top100: LeaderRow[];
    myRank: number;
    totalPlayers: number;
  };
  score: number;
}

export function LeaderboardView({
  leaderboard,
  score,
}: LeaderboardViewProps): React.ReactElement {
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
              #{myRank}{" "}
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
        <div className="text-sm font-black text-slate-900">Top 100</div>
        <div className="mt-2 flex flex-col gap-2">
          {top100.map((x) => (
            <div
              key={`${x.rank}:${x.name}`}
              className={`flex items-center justify-between rounded-2xl border px-3 py-2 text-sm ${
                x.name === "you"
                  ? "border-blue-300 bg-blue-50"
                  : "border-slate-200 bg-white/80"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 text-xs font-black text-slate-500">
                  #{x.rank}
                </div>
                <div className="text-sm font-black text-slate-900">
                  {x.name === "you" ? "You" : x.name}
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

