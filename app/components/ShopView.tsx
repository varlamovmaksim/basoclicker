"use client";

import { useCallback, useState } from "react";
import sdk from "@farcaster/miniapp-sdk";
import type { TapGameState } from "../hooks/useTapGame";
import { Card } from "./shared/Card";
import { formatCompact } from "../../lib/baso/utils";
import { SKINS } from "../../lib/baso/constants";

export interface ShopViewProps {
  shopTab: "earn" | "custom";
  setShopTab: (tab: "earn" | "custom") => void;
  state: TapGameState;
  score: number;
  refreshState: () => Promise<void>;
  skinStageClass: string;
  setSkin: (id: string) => void;
}

const IS_DEV = process.env.NEXT_PUBLIC_IS_DEV === "true";

type BoosterType = "points" | "energy_max" | "energy_regen" | "auto_taps";

type BoostCategory = "tap" | "auto" | "energy";

const BOOSTER_CONFIG: Array<{
  key: BoosterType;
  category: BoostCategory;
  title: string;
  icon: string;
  effectLabel: (level: number) => string;
  unit: string;
}> = [
  {
    key: "points",
    category: "tap",
    title: "Bigger Bite",
    icon: "👆",
    effectLabel: (l) => `${(1 + l * 0.25).toFixed(2)}x`,
    unit: "/tap",
  },
  {
    key: "auto_taps",
    category: "auto",
    title: "Agent Upgrade",
    icon: "⏱️",
    effectLabel: (l) => `${((l * 5) / 60).toFixed(1).replace(/\.0$/, "")}`,
    unit: "/sec",
  },
  {
    key: "energy_max",
    category: "energy",
    title: "Bigger Stomach",
    icon: "⚡",
    effectLabel: (l) => `+${l * 100}`,
    unit: "",
  },
  {
    key: "energy_regen",
    category: "energy",
    title: "Faster Recharge",
    icon: "⚡",
    effectLabel: (l) => `+${(l * 0.5).toFixed(1)}/min`,
    unit: "",
  },
];

function getApiBase(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

function BoosterRow({
  cfg,
  level,
  price,
  score,
  canBuy,
  busy,
  onPurchase,
}: {
  cfg: (typeof BOOSTER_CONFIG)[number];
  level: number;
  price: number;
  score: number;
  canBuy: boolean;
  busy: boolean;
  onPurchase: (key: BoosterType) => void;
}): React.ReactElement {
  const valueStr = cfg.effectLabel(level) + (cfg.unit ? ` ${cfg.unit}` : "");
  const dimmed = !canBuy || busy;

  return (
    <button
      type="button"
      className={`relative flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left transition-opacity ${
        dimmed ? "opacity-80" : ""
      } ${canBuy && !busy ? "cursor-pointer" : "cursor-default"}`}
      onClick={(e) => {
        e.preventDefault();
        if (!canBuy || busy) return;
        onPurchase(cfg.key);
      }}
      disabled={!canBuy || busy}
      aria-label={`${cfg.title}, ${level} lvl, ${formatCompact(price)} donuts`}
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--blue)]/20 bg-[var(--blue)]/10 text-lg"
        aria-hidden
      >
        {cfg.icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-black text-slate-900">{cfg.title}</div>
        <div className="mt-0.5 text-xs font-extrabold text-slate-500">
          {level} lvl{valueStr ? ` | ${valueStr}` : ""}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span
          className={`text-sm font-black ${dimmed ? "text-slate-400" : "text-slate-900"}`}
        >
          🍩 {formatCompact(price)}
        </span>
        <span className="text-slate-400 font-black text-base leading-none" aria-hidden>
          ›
        </span>
      </div>
      {!canBuy && (
        <div
          className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/85 backdrop-blur-[2px]"
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
  shopTab,
  setShopTab,
  state,
  score,
  refreshState,
  skinStageClass,
  setSkin,
}: ShopViewProps): React.ReactElement {
  const [boostCategory, setBoostCategory] = useState<BoostCategory>("tap");
  const [purchasing, setPurchasing] = useState<BoosterType | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handlePurchase = useCallback(
    async (boosterType: BoosterType) => {
      const token = IS_DEV ? "dev" : (await sdk.quickAuth.getToken()).token ?? null;
      if (!token) {
        setMessage("Not signed in");
        return;
      }
      setPurchasing(boosterType);
      setMessage(null);
      try {
        const res = await fetch(`${getApiBase()}/api/v1/boosters/purchase`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ booster_type: boosterType }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          reason?: string;
        };
        if (data.ok) {
          await refreshState();
        } else if (data.reason === "insufficient_balance") {
          setMessage("Not enough points");
        } else {
          setMessage("Purchase failed");
        }
      } catch {
        setMessage("Request failed");
      } finally {
        setPurchasing(null);
      }
    },
    [refreshState]
  );

  if (state.isLoading) {
    return <div className="text-xs font-extrabold text-slate-500">Loading…</div>;
  }

  if (state.error) {
    return (
      <div className="text-xs font-extrabold text-red-600">{state.error}</div>
    );
  }

  const levels = state.boosterLevels ?? {
    points: 0,
    energy_max: 0,
    energy_regen: 0,
    auto_taps: 0,
  };
  const prices = state.boosterNextPrices ?? {
    points: 100,
    energy_max: 150,
    energy_regen: 200,
    auto_taps: 250,
  };

  const boostersByCategory = BOOSTER_CONFIG.filter(
    (c) => c.category === boostCategory
  );

  return (
    <div className="space-y-3">
      {/* Segmented: Boost | Customize */}
      <div className="grid grid-cols-2 gap-1 rounded-2xl border border-slate-200 bg-white/80 p-1">
        <button
          type="button"
          className={`rounded-xl px-3 py-2.5 text-sm font-black ${
            shopTab === "earn"
              ? "border border-[var(--blue)]/30 bg-[var(--blue)]/10 text-[var(--blue2)]"
              : "text-slate-500"
          }`}
          onClick={(e) => {
            e.preventDefault();
            setShopTab("earn");
          }}
        >
          Boost
        </button>
        <button
          type="button"
          className={`rounded-xl px-3 py-2.5 text-sm font-black ${
            shopTab === "custom"
              ? "border border-[var(--blue)]/30 bg-[var(--blue)]/10 text-[var(--blue2)]"
              : "text-slate-500"
          }`}
          onClick={(e) => {
            e.preventDefault();
            setShopTab("custom");
          }}
        >
          Customize
        </button>
      </div>

      {shopTab === "earn" && (
        <>
          <div className="flex justify-center py-1">
            <div className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-lg font-black text-slate-900 shadow-sm">
              🍩 {formatCompact(score)}
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
            {boostersByCategory.map((cfg) => (
              <BoosterRow
                key={cfg.key}
                cfg={cfg}
                level={levels[cfg.key]}
                price={prices[cfg.key]}
                score={score}
                canBuy={score >= prices[cfg.key]}
                busy={purchasing === cfg.key}
                onPurchase={(key) => void handlePurchase(key)}
              />
            ))}
          </div>
        </>
      )}

      {shopTab === "custom" && (
        <>
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
        </>
      )}
    </div>
  );
}
