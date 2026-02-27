"use client";

import { useCallback, useState } from "react";
import sdk from "@farcaster/miniapp-sdk";
import type { TapGameDebug, TapGameState } from "../hooks/useTapGame";
import { DevTapPanel } from "./DevTapPanel";

export interface DevViewProps {
  state: TapGameState;
  score: number;
  displayEnergy: number;
  debug?: TapGameDebug;
  refreshState: () => Promise<void>;
}

function getApiBase(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

const IS_DEV = process.env.NEXT_PUBLIC_IS_DEV === "true";

export function DevView({
  state,
  score,
  displayEnergy,
  debug,
  refreshState,
}: DevViewProps): React.ReactElement {
  const [restoring, setRestoring] = useState(false);
  const [boosterUpdating, setBoosterUpdating] = useState<string | null>(null);

  const handleRestoreEnergy = useCallback(async () => {
    setRestoring(true);
    try {
      const token = IS_DEV ? "dev" : (await sdk.quickAuth.getToken()).token ?? null;
      if (!token) return;
      const res = await fetch(`${getApiBase()}/api/dev/energy`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (res.ok) await refreshState();
    } finally {
      setRestoring(false);
    }
  }, [refreshState]);

  const setBoosterLevel = useCallback(
    async (key: "points" | "energy_max" | "energy_regen" | "auto_taps", delta: number) => {
      const levels = state.boosterLevels;
      const current = levels?.[key] ?? 0;
      const nextLevel = Math.max(0, current + delta);
      setBoosterUpdating(key);
      try {
        const token = IS_DEV ? "dev" : (await sdk.quickAuth.getToken()).token ?? null;
        if (!token) return;
        const body: Record<string, number> = {};
        if (key === "points") body.points_booster_level = nextLevel;
        else if (key === "energy_max") body.energy_max_booster_level = nextLevel;
        else if (key === "energy_regen") body.energy_regen_booster_level = nextLevel;
        else body.auto_taps_booster_level = nextLevel;
        const res = await fetch(`${getApiBase()}/api/dev/boosters`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        if (res.ok) await refreshState();
      } finally {
        setBoosterUpdating(null);
      }
    },
    [state.boosterLevels, refreshState]
  );

  if (!debug) {
    return (
      <div className="text-xs font-semibold text-slate-500">
        Debug information is only available in dev mode.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs">
        <div className="text-[11px] font-bold text-slate-500">Dev controls</div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900 disabled:opacity-50"
            onClick={(e) => {
              e.preventDefault();
              void handleRestoreEnergy();
            }}
            disabled={restoring}
          >
            {restoring ? "Restoring…" : "Restore energy"}
          </button>
        </div>

        <div className="mt-2 space-y-1">
          <div className="text-[11px] font-bold text-slate-500">Boosters</div>
          {(["points", "energy_max", "energy_regen", "auto_taps"] as const).map((key) => {
            const level = state.boosterLevels?.[key] ?? 0;
            const updating = boosterUpdating === key;
            return (
              <div key={key} className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] text-slate-600">
                  {key} lv {level}
                </span>
                <button
                  type="button"
                  className="rounded-xl border border-blue-300 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-800 disabled:opacity-50"
                  onClick={(e) => {
                    e.preventDefault();
                    void setBoosterLevel(key, 1);
                  }}
                  disabled={updating}
                >
                  {updating ? "…" : "+1 level"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

