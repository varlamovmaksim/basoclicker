"use client";

import { useState, useCallback } from "react";
import styles from "./TapGame.module.css";

export function TapGame(): React.ReactElement {
  const [score, setScore] = useState(0);
  const [isPressing, setIsPressing] = useState(false);

  const handleTap = useCallback(() => {
    setScore((s) => s + 1);
    setIsPressing(true);
    const t = setTimeout(() => setIsPressing(false), 120);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <span className={styles.label}>Score</span>
        <span className={styles.score}>{score}</span>
      </div>

      <button
        type="button"
        className={`${styles.tapTarget} ${isPressing ? styles.tapTargetActive : ""}`}
        onClick={handleTap}
        onTouchStart={(e) => {
          e.preventDefault();
          handleTap();
        }}
        aria-label="Tap to score"
      >
        <span className={styles.tapHint}>TAP</span>
      </button>

      <p className={styles.footer}>Tap as fast as you can!</p>
    </div>
  );
}
