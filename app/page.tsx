"use client";

import { TapGame } from "./components/TapGame";
import styles from "./page.module.css";

export default function Home() {
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
