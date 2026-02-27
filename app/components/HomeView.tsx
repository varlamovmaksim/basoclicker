"use client";

import { useState } from "react";
import { useTapGame } from "../hooks/useTapGame";
import { BottomNav, type NavTab } from "./BottomNav";
import { BoosterShop } from "./BoosterShop";
import { TapGame } from "./TapGame";
import styles from "./HomeView.module.css";

export function HomeView(): React.ReactElement {
  const [tab, setTab] = useState<NavTab>("home");
  const { state, handleTap, score, displayEnergy, debug, refreshState } = useTapGame();

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {tab === "home" && (
          <>
            <h1 className={styles.title}>Tapper</h1>
            <TapGame
              state={state}
              handleTap={handleTap}
              score={score}
              displayEnergy={displayEnergy}
              debug={debug}
              refreshState={refreshState}
            />
          </>
        )}
        {tab === "shop" && (
          <BoosterShop
            state={state}
            score={score}
            onRefreshState={refreshState}
          />
        )}
      </div>
      <BottomNav activeTab={tab} onSelectTab={setTab} />
    </div>
  );
}
