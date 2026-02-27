"use client";

import styles from "./BottomNav.module.css";

export type NavTab = "home" | "shop";

export interface BottomNavProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
}

export function BottomNav({
  activeTab,
  onSelectTab,
}: BottomNavProps): React.ReactElement {
  return (
    <nav
      className={styles.nav}
      role="tablist"
      aria-label="Main navigation"
    >
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === "home"}
        aria-label="Home"
        className={activeTab === "home" ? styles.tabActive : styles.tab}
        onClick={() => onSelectTab("home")}
      >
        <span className={styles.tabIcon} aria-hidden>
          ⌂
        </span>
        <span className={styles.tabLabel}>Home</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === "shop"}
        aria-label="Booster shop"
        className={activeTab === "shop" ? styles.tabActive : styles.tab}
        onClick={() => onSelectTab("shop")}
      >
        <span className={styles.tabIcon} aria-hidden>
          ⬡
        </span>
        <span className={styles.tabLabel}>Shop</span>
      </button>
    </nav>
  );
}
