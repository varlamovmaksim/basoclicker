"use client";

import { PrimaryBtn } from "./shared/PrimaryBtn";

export interface TopHeaderProps {
  onOpenDailyGM: () => void;
  dailyStatus: "Available" | "Done";
  dailyTimeLeft: string;
  onDonateHalf: () => void;
}

export function TopHeader({
  onOpenDailyGM,
  dailyStatus,
  dailyTimeLeft,
  onDonateHalf,
}: TopHeaderProps): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[24px] leading-snug font-black tracking-tight text-slate-900">
          Baso Clicker
        </div>
        <div className="mt-3 text-[16px] leading-snug font-semibold text-slate-600">
          Tap Baso to earn 🍩
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          className={`flex h-20 w-20 flex-col items-center justify-center rounded-2xl border-2 text-xs font-black ${
            dailyStatus === "Available"
              ? "border-emerald-300 bg-emerald-50"
              : "border-slate-200 bg-slate-100/80 opacity-70"
          }`}
          onClick={(e) => {
            e.preventDefault();
            onOpenDailyGM();
          }}
        >
          <div className="text-lg">🗓️</div>
          <div className="mt-1 text-[11px] font-extrabold text-slate-900">
            Daily
          </div>
          <div className="mt-0.5 text-[10px] font-semibold text-slate-500">
            {dailyStatus === "Available" ? dailyTimeLeft : "Done"}
          </div>
        </button>

        <button
          type="button"
          className="flex h-20 w-20 flex-col items-center justify-center rounded-2xl border-2 border-slate-200 bg-slate-50 text-xs font-black"
          onClick={(e) => {
            e.preventDefault();
            onDonateHalf();
          }}
        >
          <div className="text-lg">🍩</div>
          <div className="mt-1 text-[11px] font-extrabold text-slate-900">
            Donate
          </div>
          <div className="mt-0.5 text-[10px] font-semibold text-slate-500">
            0.5 USDC
          </div>
        </button>
      </div>
    </div>
  );
}

