"use client";

import { useCallback, useState } from "react";
import sdk from "@farcaster/miniapp-sdk";
import type {
  TapGameState,
  TapGameDebug,
  CommitRecord,
} from "../hooks/useTapGame";
import styles from "./DevTapPanel.module.css";

const IS_DEV = process.env.NEXT_PUBLIC_IS_DEV === "true";

export interface DevTapPanelProps {
  state: TapGameState;
  score: number;
  displayEnergy: number;
  debug: TapGameDebug;
  onRestoreEnergy?: () => Promise<void>;
  onRefreshState?: () => Promise<void>;
}

/** Elapsed time since a timestamp (e.g. since previous commit). */
function formatElapsed(ts: number): string {
  if (!ts) return "—";
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 0) return "—";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function compressSessionId(s: string | null): string {
  if (!s) return "—";
  if (s.length <= 12) return s;
  return `${s.slice(0, 8)}…${s.slice(-4)}`;
}

function CopyIcon(): React.ReactElement {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function ExpandIcon(): React.ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
    </svg>
  );
}

function CollapseIcon(): React.ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
    </svg>
  );
}

const COMMITS_PREVIEW = 3;

function CommitRow({ c, now }: { c: CommitRecord; now: number }): React.ReactElement {
  const ago = Math.round((now - c.at) / 1000);
  const agoStr = ago < 60 ? `${ago}s ago` : `${Math.floor(ago / 60)}m ago`;
  return (
    <div className={styles.commitItem}>
      <span className={styles.commitTime}>{agoStr}</span>
      <div className={styles.commitData}>
        <span>Δ</span>
        <span className={styles.value}>{c.delta}</span>
        <span>applied</span>
        <span className={styles.value}>{c.applied}</span>
        <span>balance</span>
        <span className={styles.value}>{c.balance ?? "—"}</span>
        <span>ok</span>
        <span className={c.ok ? styles.commitOk : styles.commitFail}>
          {c.ok ? "yes" : "no"}
          {c.resyncRequired ? " (resync)" : ""}
        </span>
      </div>
    </div>
  );
}

function getApiBase(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

export function DevTapPanel({
  state,
  score,
  displayEnergy,
  debug,
  onRestoreEnergy,
  onRefreshState,
}: DevTapPanelProps): React.ReactElement {
  const [copied, setCopied] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [boosterUpdating, setBoosterUpdating] = useState<string | null>(null);
  const now = Date.now();
  const timeSinceCommit = state.lastCommitTime
    ? formatElapsed(state.lastCommitTime)
    : "—";

  const handleRestoreEnergy = useCallback(async () => {
    if (!onRestoreEnergy) return;
    setRestoring(true);
    try {
      const token = IS_DEV
        ? "dev"
        : (await sdk.quickAuth.getToken()).token ?? null;
      if (!token) return;
      const res = await fetch(`${getApiBase()}/api/dev/energy`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (res.ok) await onRestoreEnergy();
    } finally {
      setRestoring(false);
    }
  }, [onRestoreEnergy]);

  const copySessionId = useCallback(() => {
    const id = state.sessionId;
    if (!id) return;
    void navigator.clipboard.writeText(id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [state.sessionId]);

  const setBoosterLevel = useCallback(
    async (key: "points" | "energy_max" | "energy_regen" | "auto_taps", delta: number) => {
      const levels = state.boosterLevels;
      const current = levels?.[key] ?? 0;
      const nextLevel = Math.max(0, current + delta);
      setBoosterUpdating(key);
      try {
        const token = IS_DEV
          ? "dev"
          : (await sdk.quickAuth.getToken()).token ?? null;
        if (!token) return;
        const body: Record<string, number> = {};
        if (key === "points") body.points_booster_level = nextLevel;
        else if (key === "energy_max") body.energy_max_booster_level = nextLevel;
        else if (key === "energy_regen") body.energy_regen_booster_level = nextLevel;
        else body.auto_taps_booster_level = nextLevel;
        const res = await fetch(`${getApiBase()}/api/dev/boosters`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        if (res.ok && onRefreshState) await onRefreshState();
      } finally {
        setBoosterUpdating(null);
      }
    },
    [state.boosterLevels, onRefreshState]
  );

  const commitInFlightValue = debug.commitInFlight ? "yes" : timeSinceCommit;
  const history = debug.commitHistory ?? [];
  const previewCommits = history.slice(-COMMITS_PREVIEW).reverse();
  const fullListCommits = [...history].reverse();

  return (
    <>
      {!isOpen && (
        <button
          type="button"
          className={styles.toggleTab}
          onClick={() => setIsOpen(true)}
          title="Open dev panel"
          aria-label="Open dev panel"
        />
      )}
      <div
        className={
          styles.panel +
          (fullscreen ? " " + styles.fullscreen : "") +
          (!isOpen ? " " + styles.panelHidden : "")
        }
        role="region"
        aria-label="Dev tap state panel"
        aria-hidden={!isOpen}
      >
        <div className={styles.titleRow}>
          <span className={styles.title}>Tap game (dev)</span>
          <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span className={styles.sessionIdWrap}>
            <span
              className={styles.sessionIdShort}
              title={state.sessionId ?? undefined}
            >
              {compressSessionId(state.sessionId)}
            </span>
            {state.sessionId && (
              <button
                type="button"
                className={styles.copyBtn}
                onClick={copySessionId}
                title="Copy session ID"
                aria-label="Copy session ID"
              >
                <CopyIcon />
                {copied ? (
                  <span className={styles.copied}>Copied</span>
                ) : null}
              </button>
            )}
          </span>
          <button
            type="button"
            className={styles.fullscreenBtn}
            onClick={() => setFullscreen((f) => !f)}
            title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {fullscreen ? <CollapseIcon /> : <ExpandIcon />}
          </button>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={() => setIsOpen(false)}
            title="Close panel"
            aria-label="Close panel"
          >
            ×
          </button>
        </span>
      </div>

      <div className={fullscreen ? styles.panelBody : undefined}>
        <div className={styles.twoCols}>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>State</div>
            <div className={styles.row}>
              <span className={styles.key}>score</span>
              <span className={styles.value}>{score}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.key}>serverBalance</span>
              <span className={styles.value}>{state.serverBalance}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.key}>localTapDelta</span>
              <span className={styles.value}>{state.localTapDelta}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.key}>lastServerSeq</span>
              <span className={styles.value}>{state.lastServerSeq}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.key}>energy</span>
              <span className={styles.value}>
                {displayEnergy} / {state.energyMax}
              </span>
            </div>
            <div className={styles.row}>
              <span className={styles.key}>regen</span>
              <span className={styles.value}>{state.energyRegenPerMin}/min</span>
            </div>
            <div className={styles.row}>
              <span className={styles.key}>points</span>
              <span className={styles.value}>{state.pointsMultiplier.toFixed(2)}x</span>
            </div>
            <div className={styles.row}>
              <span className={styles.key}>auto taps</span>
              <span className={styles.value}>{state.autoTapsPerMin}/min</span>
            </div>
            {onRestoreEnergy && (
              <div className={styles.row}>
                <button
                  type="button"
                  className={styles.restoreEnergyBtn}
                  onClick={handleRestoreEnergy}
                  disabled={restoring}
                >
                  {restoring ? "Restoring…" : "Restore energy"}
                </button>
              </div>
            )}
          </div>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Processes</div>
            <div className={styles.row}>
              <span className={styles.key}>commit in flight</span>
              <span
                className={
                  styles.badge +
                  " " +
                  (debug.commitInFlight ? styles.badgeYes : styles.badgeNo)
                }
              >
                {commitInFlightValue}
              </span>
            </div>
            <div className={styles.row}>
              <span className={styles.key}>timer scheduled</span>
              <span
                className={
                  styles.badge +
                  " " +
                  (debug.timerScheduled ? styles.badgeYes : styles.badgeNo)
                }
              >
                {debug.timerScheduled ? "yes" : "no"}
              </span>
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Boosters</div>
          {[
            {
              key: "points" as const,
              label: "Points",
              effect: (l: number) => `${(1 + l * 0.25).toFixed(2)}x`,
            },
            {
              key: "energy_max" as const,
              label: "Energy max",
              effect: (l: number) => `+${l * 100}`,
            },
            {
              key: "energy_regen" as const,
              label: "Energy regen",
              effect: (l: number) => `+${(l * 0.5).toFixed(1)}/min`,
            },
            {
              key: "auto_taps" as const,
              label: "Auto taps",
              effect: (l: number) => `${l * 5}/min`,
            },
          ].map(({ key, label, effect }) => {
            const level = state.boosterLevels?.[key] ?? 0;
            const nextPrice = state.boosterNextPrices?.[key] ?? "—";
            const updating = boosterUpdating === key;
            return (
              <div key={key} className={styles.boosterRow}>
                <div className={styles.row}>
                  <span className={styles.key}>{label}</span>
                  <span className={styles.value}>Lv {level}</span>
                  <span className={styles.key}>effect</span>
                  <span className={styles.value}>{effect(level)}</span>
                  <span className={styles.key}>next</span>
                  <span className={styles.value}>{nextPrice}</span>
                </div>
                <button
                  type="button"
                  className={styles.boosterBtn}
                  onClick={() => setBoosterLevel(key, 1)}
                  disabled={updating}
                  title={`Add 1 level (cost ${nextPrice})`}
                >
                  {updating ? "…" : "+1"}
                </button>
              </div>
            );
          })}
        </div>

        <div className={styles.commitsSection + " " + styles.commitsScroll}>
          <div className={styles.sectionTitle}>
            Commits {fullscreen ? `(${history.length})` : `(last ${COMMITS_PREVIEW})`}
          </div>
          <div className={styles.commitsList}>
            {(fullscreen ? fullListCommits : previewCommits).map((c, i) => (
              <CommitRow key={`${c.at}-${i}`} c={c} now={now} />
            ))}
            {history.length === 0 && (
              <div className={styles.commitItem}>
                <span className={styles.commitTime}>—</span>
                <span style={{ color: "rgba(255,255,255,0.4)" }}>
                  No commits yet
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
