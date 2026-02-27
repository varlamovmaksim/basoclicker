"use client";

import { useCallback, useState } from "react";
import sdk from "@farcaster/miniapp-sdk";
import type { TapGameState } from "../hooks/useTapGame";
import styles from "./BoosterShop.module.css";

const IS_DEV = process.env.NEXT_PUBLIC_IS_DEV === "true";

export type BoosterType = "points" | "energy_max" | "energy_regen" | "auto_taps";

const BOOSTER_CONFIG: Array<{
  key: BoosterType;
  name: string;
  effectLabel: (level: number) => string;
}> = [
  { key: "points", name: "Points per tap", effectLabel: (l) => `${(1 + l * 0.25).toFixed(2)}x` },
  { key: "energy_max", name: "Energy max", effectLabel: (l) => `+${l * 100}` },
  { key: "energy_regen", name: "Energy regen", effectLabel: (l) => `+${(l * 0.5).toFixed(1)}/min` },
  { key: "auto_taps", name: "Auto taps", effectLabel: (l) => `${l * 5}/min` },
];

function getApiBase(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

export interface BoosterShopProps {
  state: TapGameState;
  score: number;
  onRefreshState: () => Promise<void>;
}

export function BoosterShop({
  state,
  score,
  onRefreshState,
}: BoosterShopProps): React.ReactElement {
  const [purchasing, setPurchasing] = useState<BoosterType | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handlePurchase = useCallback(
    async (boosterType: BoosterType) => {
      const token = IS_DEV
        ? "dev"
        : (await sdk.quickAuth.getToken()).token ?? null;
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
          balance?: number;
        };
        if (data.ok) {
          await onRefreshState();
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
    [onRefreshState]
  );

  if (state.isLoading) {
    return (
      <div className={styles.wrapper}>
        <p className={styles.message}>Loading...</p>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className={styles.wrapper}>
        <p className={styles.error}>{state.error}</p>
      </div>
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
    <div className={styles.wrapper}>
      <h2 className={styles.title}>Booster Shop</h2>
      <div className={styles.balance}>
        <span className={styles.balanceLabel}>Your points</span>
        <span className={styles.balanceValue}>{score}</span>
      </div>

      {message && (
        <p className={styles.message} role="alert">
          {message}
        </p>
      )}

      <ul className={styles.list}>
        {BOOSTER_CONFIG.map(({ key, name, effectLabel }) => {
          const level = levels[key];
          const price = prices[key];
          const canAfford = score >= price;
          const busy = purchasing === key;
          return (
            <li key={key} className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.cardName}>{name}</span>
                <span className={styles.cardLevel}>Level {level}</span>
              </div>
              <p className={styles.cardEffect}>
                Effect: {effectLabel(level)}
              </p>
              <div className={styles.cardFooter}>
                <span className={styles.cardPrice}>
                  Next: <strong>{price}</strong> pts
                </span>
                <button
                  type="button"
                  className={styles.buyBtn}
                  disabled={!canAfford || busy}
                  onClick={() => handlePurchase(key)}
                  aria-label={`Buy ${name} for ${price} points`}
                >
                  {busy ? "…" : "Buy"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
