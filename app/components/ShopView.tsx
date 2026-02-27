"use client";

import { useCallback, useState } from "react";
import sdk from "@farcaster/miniapp-sdk";
import type { TapGameState } from "../hooks/useTapGame";
import { Card } from "./shared/Card";
import { PrimaryBtn } from "./shared/PrimaryBtn";
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

const BOOSTER_CONFIG: Array<{
  key: BoosterType;
  title: string;
  desc: string;
  effectLabel: (level: number) => string;
}> = [
  {
    key: "points",
    title: "Bigger Bite",
    desc: "Increase points per tap.",
    effectLabel: (l) => `${(1 + l * 0.25).toFixed(2)}x`,
  },
  {
    key: "energy_max",
    title: "Bigger Stomach",
    desc: "Increase max energy (+100).",
    effectLabel: (l) => `+${l * 100}`,
  },
  {
    key: "energy_regen",
    title: "Faster Recharge",
    desc: "Energy regenerates faster.",
    effectLabel: (l) => `+${(l * 0.5).toFixed(1)}/min`,
  },
  {
    key: "auto_taps",
    title: "Agent Upgrade",
    desc: "Increase auto taps.",
    effectLabel: (l) => `${l * 5}/min`,
  },
];

function getApiBase(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
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
    return <div className="text-xs font-semibold text-slate-500">Loading…</div>;
  }

  if (state.error) {
    return (
      <div className="text-xs font-semibold text-red-600">{state.error}</div>
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

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1 rounded-2xl border border-slate-200 bg-white/80 p-1 text-xs font-black">
        <button
          type="button"
          className={`rounded-xl px-3 py-2 ${
            shopTab === "earn"
              ? "border border-blue-300 bg-blue-50 text-blue-700"
              : "text-slate-500"
          }`}
          onClick={(e) => {
            e.preventDefault();
            setShopTab("earn");
          }}
        >
          Earn
        </button>
        <button
          type="button"
          className={`rounded-xl px-3 py-2 ${
            shopTab === "custom"
              ? "border border-blue-300 bg-blue-50 text-blue-700"
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
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-black text-slate-900">Upgrades</div>
                <div className="text-xs font-semibold text-slate-500">
                  Boost your earnings (🍩).
                </div>
              </div>
              <div className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-black text-slate-900">
                🍩 {formatCompact(score)}
              </div>
            </div>
          </Card>

          {message && (
            <div className="text-xs font-semibold text-red-600">{message}</div>
          )}

          {BOOSTER_CONFIG.map((cfg) => {
            const level = levels[cfg.key];
            const price = prices[cfg.key];
            const canBuy = score >= price;
            const busy = purchasing === cfg.key;
            return (
              <Card key={cfg.key}>
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-black text-slate-900">
                      {cfg.title}
                    </div>
                    <div className="text-xs font-semibold text-slate-500">
                      {cfg.desc}
                    </div>
                  </div>
                  <div className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-black text-slate-900">
                    🍩 {formatCompact(price)}
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">Level {level}</span>
                    <span className="text-slate-400">·</span>
                    <span>Effect {cfg.effectLabel(level)}</span>
                  </div>
                </div>
                <PrimaryBtn
                  onClick={() => void handlePurchase(cfg.key)}
                  disabled={!canBuy || busy}
                  className="mt-2"
                >
                  {busy ? "Processing…" : "Buy"}
                </PrimaryBtn>
              </Card>
            );
          })}
        </>
      )}

      {shopTab === "custom" && (
        <>
          <Card>
            <div className="text-sm font-black text-slate-900">Skins</div>
            <div className="mt-1 text-xs font-semibold text-slate-500">
              Change the tap scene.
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {SKINS.map((skin) => (
                <button
                  key={skin.id}
                  type="button"
                  className={`flex flex-col rounded-2xl border px-2 py-2 text-left text-xs font-semibold ${
                    skinStageClass === skin.stageClass
                      ? "border-blue-300 bg-blue-50"
                      : "border-slate-200 bg-white/80"
                  }`}
                  onClick={(e) => {
                    e.preventDefault();
                    setSkin(skin.id);
                  }}
                >
                  <div className={`mb-2 h-16 rounded-xl border border-slate-200 ${skin.stageClass}`} />
                  <div className="text-[11px] font-black text-slate-900">
                    {skin.name}
                  </div>
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <div className="text-sm font-black text-slate-900">Customization</div>
            <div className="mt-1 text-xs font-semibold text-slate-500">
              More cosmetics coming soon.
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

