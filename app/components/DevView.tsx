"use client";

import { useCallback, useState } from "react";
import sdk from "@farcaster/miniapp-sdk";
import { getDevAuthHeaders } from "@/app/lib/devFingerprint";
import { encodeFunctionData } from "viem";
import { getVaultAddress, getTokenAddress, TAPPER_VAULT_ABI } from "@/app/lib/contracts";
import { getPaymasterServiceUrl } from "@/app/lib/sponsoredTx";
import type { TapGameDebug, TapGameState } from "../hooks/useTapGame";

export interface DevViewProps {
  state: TapGameState;
  score: number;
  displayEnergy: number;
  debug?: TapGameDebug;
  refreshState: () => Promise<void>;
  /** For contract/env check panel */
  chainId?: number;
  dailyClaimStatus?: { can_claim_daily: boolean; last_claim_at: string | null };
}

function getApiBase(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

const IS_DEV = process.env.NEXT_PUBLIC_IS_DEV === "true";

function shortAddr(addr: string | null): string {
  if (!addr) return "—";
  const a = addr.toLowerCase();
  return a.length >= 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

export function DevView({
  state,
  score: _score,
  displayEnergy: _displayEnergy,
  debug,
  refreshState,
  chainId = 8453,
  dailyClaimStatus,
}: DevViewProps): React.ReactElement {
  const vaultAddr = getVaultAddress();
  const tokenAddr = getTokenAddress();
  const paymasterUrl = getPaymasterServiceUrl(chainId);
  const recordDailySelector =
    encodeFunctionData({
      abi: TAPPER_VAULT_ABI,
      functionName: "recordDaily",
    }).slice(0, 10);
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
          ...getDevAuthHeaders(),
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
            ...getDevAuthHeaders(),
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
        <div className="text-[11px] font-bold text-slate-500">Contract & env check</div>
        <dl className="mt-1 grid gap-1 font-mono text-[11px] text-slate-600">
          <div className="flex justify-between gap-2">
            <dt>Vault</dt>
            <dd className={vaultAddr ? "text-emerald-600" : "text-red-600"}>
              {vaultAddr ? shortAddr(vaultAddr) : "not set"}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Token</dt>
            <dd className={tokenAddr ? "text-emerald-600" : "text-red-600"}>
              {tokenAddr ? shortAddr(tokenAddr) : "not set"}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Chain ID</dt>
            <dd>{chainId}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Paymaster</dt>
            <dd className={paymasterUrl ? "text-emerald-600" : "text-amber-600"}>
              {paymasterUrl ? "set" : "not set"}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>recordDaily() selector</dt>
            <dd className="font-mono text-slate-700">{recordDailySelector}</dd>
          </div>
          {dailyClaimStatus != null && (
            <>
              <div className="flex justify-between gap-2">
                <dt>Daily can claim</dt>
                <dd className={dailyClaimStatus.can_claim_daily ? "text-emerald-600" : "text-slate-500"}>
                  {dailyClaimStatus.can_claim_daily ? "yes" : "no"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Daily last at</dt>
                <dd className="text-slate-500">
                  {dailyClaimStatus.last_claim_at ?? "—"}
                </dd>
              </div>
            </>
          )}
        </dl>
        <p className="mt-1 text-[10px] text-slate-400">
          Backend: set BASE_RPC_URL and NEXT_PUBLIC_TAPPER_VAULT_ADDRESS in .env
        </p>
      </div>

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

