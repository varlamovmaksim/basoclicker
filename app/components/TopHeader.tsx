"use client";

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
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[24px] leading-snug font-black tracking-tight text-slate-900 truncate">
          Baso Clicker
        </h1>
        <p className="mt-3 text-[16px] leading-snug font-semibold text-slate-600">
          Tap Baso to earn 🍩
        </p>
      </div>

      <div className="flex gap-2 shrink-0">
        <button
          type="button"
          className={`flex h-[72px] w-[72px] flex-col items-center justify-center rounded-xl border text-[10px] font-black ${
            dailyStatus === "Available"
              ? "border-emerald-300/80 bg-emerald-50 shadow-sm"
              : "border-slate-200 bg-slate-50/90 opacity-70"
          }`}
          onClick={(e) => {
            e.preventDefault();
            onOpenDailyGM();
          }}
        >
          <span className="text-base leading-none">🗓️</span>
          <span className="mt-1 font-extrabold text-slate-900">Daily</span>
          <span className="mt-0.5 font-bold text-slate-500 text-[10px]">
            {dailyStatus === "Available" ? dailyTimeLeft : "Done"}
          </span>
        </button>

        <button
          type="button"
          className="flex h-[72px] w-[72px] flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-[10px] font-black shadow-sm"
          onClick={(e) => {
            e.preventDefault();
            onDonateHalf();
          }}
        >
          <span className="text-base leading-none">🍩</span>
          <span className="mt-1 font-extrabold text-slate-900">Donate</span>
          <span className="mt-0.5 font-bold text-slate-500 text-[10px]">
            0.5 USDC
          </span>
        </button>
      </div>
    </div>
  );
}

