"use client";

import { useCallback, useRef, useState } from "react";
import { useTapGame } from "../hooks/useTapGame";
import { DevTapPanel } from "./DevTapPanel";
import styles from "./TapGame.module.css";

const IS_DEV = process.env.NEXT_PUBLIC_IS_DEV === "true";

export function TapGame(): React.ReactElement {
  const { state, handleTap, score, debug } = useTapGame();
  const [isPressing, setIsPressing] = useState(false);
  const activeTouchCountRef = useRef(0);

  const onTap = useCallback(() => {
    handleTap();
    setIsPressing(true);
    const t = setTimeout(() => setIsPressing(false), 120);
    return () => clearTimeout(t);
  }, [handleTap]);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      const touches = e.changedTouches;
      for (let i = 0; i < touches.length; i++) {
        handleTap();
      }
      activeTouchCountRef.current += touches.length;
      setIsPressing(activeTouchCountRef.current > 0);
    },
    [handleTap]
  );

  const onTouchEndOrCancel = useCallback((e: React.TouchEvent) => {
    activeTouchCountRef.current = Math.max(
      0,
      activeTouchCountRef.current - e.changedTouches.length
    );
    setIsPressing(activeTouchCountRef.current > 0);
  }, []);

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
    <>
      <div className={styles.wrapper}>
        <div className={styles.header}>
          <span className={styles.label}>Score</span>
          <span className={styles.score}>{score}</span>
        </div>

        <button
          type="button"
          className={`${styles.tapTarget} ${isPressing ? styles.tapTargetActive : ""}`}
          onClick={onTap}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEndOrCancel}
          onTouchCancel={onTouchEndOrCancel}
          aria-label="Tap to score"
        >
          <span className={styles.tapHint}>TAP</span>
        </button>

        <p className={styles.footer}>Tap as fast as you can!</p>
      </div>

      {IS_DEV && debug && (
        <DevTapPanel state={state} score={score} debug={debug} />
      )}
    </>
  );
}
