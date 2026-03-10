"use client";

import { useCallback, useState } from "react";
import type { BoosterListItem, TapGameState } from "../hooks/useTapGame";
import { Card } from "./shared/Card";
import { formatCompact } from "../../lib/baso/utils";
import { SKINS } from "../../lib/baso/constants";
import { getDevAuthHeaders } from "@/app/lib/devFingerprint";

export interface ShopViewProps {
  state: TapGameState;
  score: number;
  refreshState: () => Promise<void>;
  getToken: () => Promise<string | null>;
  applyOptimisticPurchaseDeduction: (amount: number) => void;
  revertOptimisticPurchaseDeduction: (amount: number) => void;
  skinStageClass: string;
  setSkin: (id: string) => void;
}

const IS_DEV = process.env.NEXT_PUBLIC_IS_DEV === "true";

type BoostCategory = "tap" | "auto" | "energy";

const TYPE_TO_CATEGORY: Record<string, BoostCategory> = {
  points_per_tap: "tap",
  auto_points: "auto",
  energy_regen: "energy",
};

function effectLabel(b: BoosterListItem): string {
  if (b.type === "points_per_tap") {
    const mult = (1 + b.count * b.effect_amount).toFixed(2);
    return `${mult}x /tap`;
  }
  if (b.type === "energy_regen") {
    const val = (b.count * b.effect_amount).toFixed(2);
    return `+${val}/sec`;
  }
  if (b.type === "auto_points") {
    const perSec = ((b.count * b.effect_amount) / 60).toFixed(1).replace(/\.0$/, "");
    return `${perSec}/sec`;
  }
  return "";
}

function getApiBase(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

function BoosterRow({
  booster,
  canBuy,
  busy,
  onPurchase,
}: {
  booster: BoosterListItem;
  canBuy: boolean;
  busy: boolean;
  onPurchase: (id: string) => void;
}): React.ReactElement {
  const valueStr = effectLabel(booster);
  const atMaxLevel = booster.count >= (booster.max_level ?? Infinity);
  const dimmed = booster.unlocked && (!canBuy || busy || atMaxLevel);

  return (
    <button
      type="button"
      className={`relative flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left transition-opacity ${
        dimmed ? "opacity-80" : ""
      } ${canBuy && !busy && booster.unlocked ? "cursor-pointer" : "cursor-default"}`}
      onClick={(e) => {
        e.preventDefault();
        if (!canBuy || busy || !booster.unlocked) return;
        onPurchase(booster.id);
      }}
      disabled={!canBuy || busy || !booster.unlocked || atMaxLevel}
      aria-label={`${booster.name}, ${booster.count} lvl, ${formatCompact(booster.next_price)} donuts`}
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--blue)]/20 bg-[var(--blue)]/10 text-lg"
        aria-hidden
      >
        {booster.emoji}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-black text-slate-900">{booster.name}</div>
        <div className="mt-0.5 text-xs font-extrabold text-slate-500">
          {booster.count} lvl{valueStr ? ` | ${valueStr}` : ""}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span
          className={`text-sm font-black ${dimmed ? "text-slate-400" : "text-slate-900"}`}
        >
          {atMaxLevel ? "Max" : `🍩 ${formatCompact(booster.next_price)}`}
        </span>
        <span className="text-slate-400 font-black text-base leading-none" aria-hidden>
          ›
        </span>
      </div>
      {!booster.unlocked && (
        <div
          className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/85"
          aria-hidden
        >
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-sm">
            🔒
          </span>
        </div>
      )}
    </button>
  );
}

export function ShopView({
  state,
  score,
  refreshState,
  getToken,
  applyOptimisticPurchaseDeduction,
  revertOptimisticPurchaseDeduction,
  skinStageClass,
  setSkin,
}: ShopViewProps): React.ReactElement {
  const [boostCategory, setBoostCategory] = useState<BoostCategory>("tap");
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handlePurchase = useCallback(
    async (boosterId: string) => {
      const token = await getToken();
      if (!token) {
        setMessage("Not signed in");
        return;
      }
      const booster = (state.boosters ?? []).find((b) => b.id === boosterId);
      const price = booster?.next_price ?? 0;
      if (price <= 0) {
        setMessage("Invalid booster");
        return;
      }
      setPurchasingId(boosterId);
      setMessage(null);
      applyOptimisticPurchaseDeduction(price);
      try {
        const res = await fetch(`${getApiBase()}/api/v1/boosters/purchase`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            ...getDevAuthHeaders(),
          },
          body: JSON.stringify({ booster_id: boosterId }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          reason?: string;
          balance?: number;
          boosters?: BoosterListItem[];
        };
        if (data.ok && Array.isArray(data.boosters)) {
          await refreshState();
          revertOptimisticPurchaseDeduction(price);
        } else {
          revertOptimisticPurchaseDeduction(price);
          if (data.reason === "insufficient_balance") {
            setMessage("Not enough points");
          } else if (data.reason === "booster_locked") {
            setMessage("Unlock previous booster first");
          } else if (data.reason === "booster_max_level") {
            setMessage("Max level reached");
          } else {
            setMessage("Purchase failed");
          }
        }
      } catch {
        revertOptimisticPurchaseDeduction(price);
        setMessage("Request failed");
      } finally {
        setPurchasingId(null);
      }
    },
    [
      getToken,
      state.boosters,
      refreshState,
      applyOptimisticPurchaseDeduction,
      revertOptimisticPurchaseDeduction,
    ]
  );

  if (state.isLoading) {
    return <div className="text-xs font-extrabold text-slate-500">Loading…</div>;
  }

  if (state.error) {
    return (
      <div className="text-xs font-extrabold text-red-600">{state.error}</div>
    );
  }

  const boosters = state.boosters ?? [];
  const boostersByCategory = boosters.filter(
    (b) => TYPE_TO_CATEGORY[b.type] === boostCategory
  );

  return (
    <div className="space-y-3">
      <div className="flex justify-center py-1">
        <div className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-lg font-black text-slate-900 shadow-sm">
          🍩 {formatCompact(Math.floor(score))}
        </div>
      </div>

      <div
        className="grid grid-cols-3 gap-1 rounded-xl border border-slate-200 bg-white/80 p-1"
        role="tablist"
        aria-label="Boost categories"
      >
        <button
          type="button"
          role="tab"
          aria-selected={boostCategory === "tap"}
          className={`rounded-lg px-2 py-2 text-xs font-black ${
            boostCategory === "tap"
              ? "border border-[var(--blue)]/25 bg-[var(--blue)]/10 text-[var(--blue2)]"
              : "text-slate-500"
          }`}
          onClick={(e) => {
            e.preventDefault();
            setBoostCategory("tap");
          }}
        >
          👆 Tap
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={boostCategory === "auto"}
          className={`rounded-lg px-2 py-2 text-xs font-black ${
            boostCategory === "auto"
              ? "border border-[var(--blue)]/25 bg-[var(--blue)]/10 text-[var(--blue2)]"
              : "text-slate-500"
          }`}
          onClick={(e) => {
            e.preventDefault();
            setBoostCategory("auto");
          }}
        >
          ⏱️ Auto
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={boostCategory === "energy"}
          className={`rounded-lg px-2 py-2 text-xs font-black ${
            boostCategory === "energy"
              ? "border border-[var(--blue)]/25 bg-[var(--blue)]/10 text-[var(--blue2)]"
              : "text-slate-500"
          }`}
          onClick={(e) => {
            e.preventDefault();
            setBoostCategory("energy");
          }}
        >
          ⚡ Energy
        </button>
      </div>

      {message && (
        <div className="text-xs font-extrabold text-red-600">{message}</div>
      )}

      <div className="flex flex-col gap-2" role="tabpanel">
        {boostersByCategory.map((booster) => (
          <BoosterRow
            key={booster.id}
            booster={booster}
            canBuy={
              score >= booster.next_price &&
              booster.count < (booster.max_level ?? Infinity)
            }
            busy={purchasingId === booster.id}
            onPurchase={(id) => void handlePurchase(id)}
          />
        ))}
      </div>

      <Card>
        <div className="font-black text-slate-900">Customization</div>
        <div className="mt-1 text-sm font-extrabold text-slate-500">
          More cosmetics coming soon.
        </div>
      </Card>

      <Card>
        <div className="font-black text-slate-900">Skins</div>
        <div className="mt-1 text-sm font-extrabold text-slate-500">
          Choose a scene background.
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {SKINS.map((skin) => (
            <button
              key={skin.id}
              type="button"
              className={`flex flex-col rounded-2xl border-2 p-2 text-left ${
                skinStageClass === skin.stageClass
                  ? "border-[var(--blue)] bg-[var(--blue)]/5 outline outline-2 outline-[var(--blue)]/30"
                  : "border-slate-200 bg-white/80"
              }`}
              onClick={(e) => {
                e.preventDefault();
                setSkin(skin.id);
              }}
              aria-label={`skin-${skin.id}`}
            >
              <div
                className={`aspect-square w-full rounded-xl border border-slate-200 ${skin.stageClass}`}
              />
              <div className="mt-2 truncate text-xs font-black text-slate-900">
                {skin.name}
              </div>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
