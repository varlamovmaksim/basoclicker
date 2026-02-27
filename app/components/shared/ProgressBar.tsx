"use client";

import { clamp } from "../../../lib/baso/utils";

export interface ProgressBarProps {
  pct: number;
}

export function ProgressBar({ pct }: ProgressBarProps): React.ReactElement {
  const value = clamp(pct, 0, 1);
  return (
    <div className="mt-2 h-2 w-full overflow-hidden rounded-full border border-slate-200 bg-slate-100">
      <div
        className="h-full rounded-full bg-gradient-to-r from-sky-500 to-blue-600"
        style={{ width: `${value * 100}%` }}
      />
    </div>
  );
}

