"use client";

import { useCallback, useState } from "react";
import sdk from "@farcaster/miniapp-sdk";
import type { BoosterListItem, TapGameState } from "../hooks/useTapGame";
import styles from "./BoosterShop.module.css";

const IS_DEV = process.env.NEXT_PUBLIC_IS_DEV === "true";

function effectLabel(b: BoosterListItem): string {
  if (b.type === "points_per_tap") {
    return `${(1 + b.count * b.effect_amount).toFixed(2)}x`;
  }
  if (b.type === "energy_regen") {
    return `+${(b.count * b.effect_amount).toFixed(2)}/sec`;
  }
  if (b.type === "auto_points") {
    return `${b.count * b.effect_amount}/min`;
  }
  return "—";
}

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
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handlePurchase = useCallback(
    async (boosterId: string) => {
      const token = IS_DEV
        ? "dev"
        : (await sdk.quickAuth.getToken()).token ?? null;
      if (!token) {
        setMessage("Not signed in");
        return;
      }
      setPurchasingId(boosterId);
      setMessage(null);
      try {
        const res = await fetch(`${getApiBase()}/api/v1/boosters/purchase`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ booster_id: boosterId }),
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
        } else if (data.reason === "booster_max_level") {
          setMessage("Max level reached");
        } else {
          setMessage("Purchase failed");
        }
      } catch {
        setMessage("Request failed");
      } finally {
        setPurchasingId(null);
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

  const boosters = state.boosters ?? [];

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
        {boosters.map((b) => {
          const atMaxLevel = b.count >= (b.max_level ?? Infinity);
          const canAfford =
            b.unlocked && score >= b.next_price && !atMaxLevel;
          const busy = purchasingId === b.id;
          return (
            <li key={b.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.cardName}>{b.emoji} {b.name}</span>
                <span className={styles.cardLevel}>Level {b.count}</span>
              </div>
              <p className={styles.cardEffect}>
                Effect: {effectLabel(b)}
              </p>
              <div className={styles.cardFooter}>
                <span className={styles.cardPrice}>
                  {atMaxLevel
                    ? "Max level"
                    : `Next: ${b.next_price} pts`}
                </span>
                <button
                  type="button"
                  className={styles.buyBtn}
                  disabled={!canAfford || busy || atMaxLevel}
                  onClick={() => handlePurchase(b.id)}
                  aria-label={`Buy ${b.name} for ${b.next_price} points`}
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
