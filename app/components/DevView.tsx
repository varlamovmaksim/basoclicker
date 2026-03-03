"use client";

import { useCallback, useState } from "react";
import sdk from "@farcaster/miniapp-sdk";
import type { TapGameDebug, TapGameState } from "../hooks/useTapGame";

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
  score: _score,
  displayEnergy: _displayEnergy,
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

  const setBoosterCount = useCallback(
    async (boosterId: string, delta: number) => {
      const booster = state.boosters?.find((b) => b.id === boosterId);
      const current = booster?.count ?? 0;
      const nextCount = Math.max(0, current + delta);
      setBoosterUpdating(boosterId);
      try {
        const token = IS_DEV ? "dev" : (await sdk.quickAuth.getToken()).token ?? null;
        if (!token) return;
        const res = await fetch(`${getApiBase()}/api/dev/boosters`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ booster_id: boosterId, count: nextCount }),
        });
        if (res.ok) await refreshState();
      } finally {
        setBoosterUpdating(null);
      }
    },
    [state.boosters, refreshState]
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
          {(state.boosters ?? []).map((b) => {
            const updating = boosterUpdating === b.id;
            return (
              <div key={b.id} className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] text-slate-600">
                  {b.name} lv {b.count}
                </span>
                <button
                  type="button"
                  className="rounded-xl border border-blue-300 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-800 disabled:opacity-50"
                  onClick={(e) => {
                    e.preventDefault();
                    void setBoosterCount(b.id, 1);
                  }}
                  disabled={updating}
                >
                  {updating ? "…" : "+1"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

