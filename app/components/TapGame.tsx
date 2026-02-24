"use client";

import { useCallback, useState } from "react";
import { useTapGame } from "../hooks/useTapGame";
import styles from "./TapGame.module.css";

export function TapGame(): React.ReactElement {
  const { state, handleTap, score } = useTapGame();
  const [isPressing, setIsPressing] = useState(false);

  const onTap = useCallback(() => {
    handleTap();
    setIsPressing(true);
    const t = setTimeout(() => setIsPressing(false), 120);
    return () => clearTimeout(t);
  }, [handleTap]);

  if (state.isLoading) {
    return (
      <div className={styles.wrapper}>
        <p className={styles.footer}>Loading...</p>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className={styles.wrapper}>
        <p className={styles.footer}>{state.error}</p>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <span className={styles.label}>Score</span>
        <span className={styles.score}>{score}</span>
      </div>

      <button
        type="button"
        className={`${styles.tapTarget} ${isPressing ? styles.tapTargetActive : ""}`}
        onClick={onTap}
        onTouchStart={(e) => {
          e.preventDefault();
          onTap();
        }}
        aria-label="Tap to score"
      >
        <span className={styles.tapHint}>TAP</span>
      </button>

      <p className={styles.footer}>Tap as fast as you can!</p>
    </div>
  );
}
