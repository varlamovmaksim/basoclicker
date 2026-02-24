"use client";

import { TapGame } from "./TapGame";
import styles from "./HomeView.module.css";

export function HomeView(): React.ReactElement {
  return (
    <div className={styles.container}>
      <button className={styles.closeButton} type="button" aria-label="Close">
        ✕
      </button>

      <div className={styles.content}>
        <h1 className={styles.title}>Tapper</h1>
        <TapGame />
      </div>
    </div>
  );
}
