"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import sdk from "@farcaster/miniapp-sdk";
import { useAccount } from "wagmi";
import { getDevAuthHeaders } from "@/app/lib/devFingerprint";
import { useMiniApp } from "@/app/providers/MiniAppProvider";

/** Accumulated taps are sent once per this interval (ms). */
const COMMIT_INTERVAL_MS = 5000;

const IS_DEV = process.env.NEXT_PUBLIC_IS_DEV === "true";

const STORAGE_KEY = "tapper_state";

/** Persisted shape for in-browser state (localStorage). */
interface StoredTapState {
  serverBalance: number;
  lastServerSeq: number;
  sessionId: string | null;
  localTapDelta: number;
  lastCommitTime: number;
  /** Client-side virtual score that accumulates fractional points. */
  clientScore: number;
}

function getStoredState(): StoredTapState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredTapState> & {
      fractionalRemainder?: number;
    };
    if (
      typeof parsed.serverBalance !== "number" ||
      typeof parsed.lastServerSeq !== "number" ||
      typeof parsed.localTapDelta !== "number" ||
      typeof parsed.lastCommitTime !== "number"
    ) {
      return null;
    }
    return {
      serverBalance: parsed.serverBalance,
      lastServerSeq: parsed.lastServerSeq,
      sessionId: parsed.sessionId ?? null,
      localTapDelta: Math.max(0, parsed.localTapDelta),
      lastCommitTime: parsed.lastCommitTime,
      clientScore:
        typeof parsed.clientScore === "number"
          ? parsed.clientScore
          : parsed.serverBalance +
            (typeof parsed.fractionalRemainder === "number"
              ? parsed.fractionalRemainder
              : 0),
    };
  } catch {
    return null;
  }
}

function saveState(state: StoredTapState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota / private mode
  }
}

const DEBUG_TAP = false; // set to true to enable [tap] logs
function logTap(msg: string, ...args: unknown[]): void {
  if (DEBUG_TAP && typeof window !== "undefined") {
    console.log(`[tap] ${msg}`, ...args);
  }
}

/**
 * API base URL. Use current origin when we're already on the app domain (incl. www vs non-www)
 * to avoid cross-origin + redirect on preflight. Otherwise use NEXT_PUBLIC_URL for iframe/miniapp.
 */
function getApiBase(): string {
  if (typeof window === "undefined") return "";
  const current = window.location.hostname;
  const envUrl = process.env.NEXT_PUBLIC_URL;
  if (envUrl) {
    try {
      const envHost = new URL(envUrl).hostname;
      const sameHost =
        current === envHost ||
        current === `www.${envHost}` ||
        envHost === `www.${current}`;
      if (sameHost) return window.location.origin;
      return new URL(envUrl).origin;
    } catch {
      // ignore invalid URL
    }
  }
  return window.location.origin;
}

export interface BoosterListItem {
  id: string;
  type: string;
  order_index: number;
  name: string;
  emoji: string;
  effect_amount: number;
  count: number;
  next_price: number;
  unlocked: boolean;
  unlock_after_previous: number;
  current_previous_count?: number;
  max_level: number;
  level_effect_coefficient?: number;
}

export interface TapGameState {
  /** Last known server-confirmed balance (never incremented on tap). */
  serverBalance: number;
  /** Uncommitted tap count since last commit. Display = serverBalance + localTapDelta. */
  localTapDelta: number;
  lastServerSeq: number;
  lastCommitTime: number;
  sessionId: string | null;
  /** Last known energy from server (as of energyServerTime). */
  energy: number;
  energyMax: number;
  energyRegenPerSec: number;
  /** Timestamp when energy was last set by server (ms). */
  energyServerTime: number;
  pointsMultiplier: number;
  miningPointsPerSec: number;
  /** Client-side virtual score for display (may include fractional part). */
  clientScore: number;
  boosters: BoosterListItem[] | null;
  isLoading: boolean;
  error: string | null;
}

export interface CommitRecord {
  at: number;
  delta: number;
  applied: number;
  miningPointsApplied?: number;
  balance: number | undefined;
  ok: boolean;
  resyncRequired?: boolean;
}

export interface TapGameDebug {
  commitInFlight: boolean;
  timerScheduled: boolean;
  commitHistory: CommitRecord[];
}

export interface UseTapGameReturn {
  state: TapGameState;
  handleTap: () => void;
  /** Display score: serverBalance + localTapDelta * pointsMultiplier + mining since last commit, minus optimistic purchase deduction. */
  score: number;
  /** Display energy: consumed on tap (server energy + regen − localTapDelta), capped to [0, energyMax]. */
  displayEnergy: number;
  /** Display mining: optimistic points accumulated since last commit (synced on commit or ~1/min refetch). */
  displayMining: number;
  /** Only present when NEXT_PUBLIC_IS_DEV === "true". */
  debug?: TapGameDebug;
  /** Refetch state from server (e.g. after restore energy or booster purchase). */
  refreshState: () => Promise<void>;
  /** Auth token for API calls (e.g. daily-claim). */
  getToken: () => Promise<string | null>;
  /** Subtract amount from displayed score until revert or refresh (e.g. before booster purchase). */
  applyOptimisticPurchaseDeduction: (amount: number) => void;
  /** Restore amount to displayed score (e.g. when purchase fails). */
  revertOptimisticPurchaseDeduction: (amount: number) => void;
}

function getInitialStoredState(): StoredTapState | null {
  if (typeof window === "undefined") return null;
  return getStoredState();
}

export function useTapGame(): UseTapGameReturn {
  const { context, isReady } = useMiniApp();
  const { address: walletAddress } = useAccount();
  const stored = getInitialStoredState();
  const [serverBalance, setServerBalance] = useState(stored?.serverBalance ?? 0);
  const [localTapDelta, setLocalTapDelta] = useState(stored?.localTapDelta ?? 0);
  const [lastServerSeq, setLastServerSeq] = useState(stored?.lastServerSeq ?? 0);
  const [lastCommitTime, setLastCommitTime] = useState(stored?.lastCommitTime ?? 0);
  const [sessionId, setSessionId] = useState<string | null>(stored?.sessionId ?? null);
  const [clientScore, setClientScore] = useState(
    stored?.clientScore ?? stored?.serverBalance ?? 0
  );
  const [energy, setEnergy] = useState(1000);
  const [energyMax, setEnergyMax] = useState(1000);
  const [energyRegenPerSec, setEnergyRegenPerSec] = useState(1);
  const [energyServerTime, setEnergyServerTime] = useState(0);
  const [pointsMultiplier, setPointsMultiplier] = useState(1);
  const [miningPointsPerSec, setMiningPointsPerSec] = useState(0);
  const [boosters, setBoosters] = useState<BoosterListItem[] | null>(null);
  const [pendingPurchaseDeduction, setPendingPurchaseDeduction] = useState(0);
  const [, setTick] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seqRef = useRef(0);
  const tokenRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const commitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitInFlightRef = useRef(false);
  /** After applying a commit, stateRef is still stale; use this when scheduling from finally. */
  const pendingLocalTapDeltaAfterCommitRef = useRef<number | null>(null);
  /** When set, commitFromRefs must use this delta (from when we scheduled) instead of reading stateRef. */
  const scheduledDeltaRef = useRef<number | null>(null);
  /** Fractional points not yet sent to server; carried into next commit so we commit integer points without losing decimals. */
  const pointsRemainderRef = useRef(0);
  const [debugCommitInFlight, setDebugCommitInFlight] = useState(false);
  const [debugTimerScheduled, setDebugTimerScheduled] = useState(false);
  const [commitHistory, setCommitHistory] = useState<CommitRecord[]>([]);
  const stateRef = useRef({
    localTapDelta: 0,
    lastCommitTime: 0,
    serverBalance: 0,
  });
  stateRef.current = { localTapDelta, lastCommitTime, serverBalance };

  /** For handleTap: energy available = server energy + regen (no localTapDelta). Updated each render. */
  const energyRef = useRef({
    energy: 1000,
    energyMax: 1000,
    energyRegenPerSec: 1,
    energyServerTime: 0,
  });
  energyRef.current = {
    energy,
    energyMax,
    energyRegenPerSec,
    energyServerTime,
  };

  /** In prod, token comes from host via sdk.quickAuth.getToken() (triggers sign-in). No token => no session/commit/state requests. */
  const getToken = useCallback(async (): Promise<string | null> => {
    if (IS_DEV) return "dev";
    // When opened in Base app from localhost, quick-auth often isn't available; use dev token so session/commit still work.
    if (typeof window !== "undefined" && window.location.hostname === "localhost") {
      return "dev";
    }
    const TIMEOUT_MS = 10_000;
    if (typeof window !== "undefined") {
      console.log("[auth] getToken() called");
    }
    const start = typeof performance !== "undefined" ? performance.now() : 0;
    try {
      const { token } = await Promise.race([
        sdk.quickAuth.getToken(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("quickauth_timeout")), TIMEOUT_MS)
        ),
      ]);
      const elapsed = typeof performance !== "undefined" ? (performance.now() - start).toFixed(0) : "?";
      if (typeof window !== "undefined") {
        console.log("[auth] getToken() =>", token ? "token received" : "no token", `(${elapsed}ms)`);
      }
      return token ?? null;
    } catch (e) {
      const elapsed = typeof performance !== "undefined" ? (performance.now() - start).toFixed(0) : "?";
      if (typeof window !== "undefined") {
        console.warn("[auth] getToken() failed", e instanceof Error ? e.message : e, `(${elapsed}ms)`);
      }
      return null;
    }
  }, []);

  const fetchSession = useCallback(async (): Promise<boolean> => {
    if (typeof window !== "undefined") console.log("[auth] fetchSession: start");
    try {
      const token = await getToken();
      tokenRef.current = token ?? null;
      if (!token) {
        if (typeof window !== "undefined") {
          console.warn(
            "[auth] fetchSession: no token — session/commit disabled. Check miniapp sign-in and NEXT_PUBLIC_URL vs miniapp domain."
          );
        }
        setError("Not signed in");
        setIsLoading(false);
        return false;
      }
      if (typeof window !== "undefined") console.log("[auth] fetchSession: token ok, POST /api/auth/session");
      const base = getApiBase();
      const body: Record<string, unknown> = {};
      const inMiniApp = await sdk.isInMiniApp();
      if (inMiniApp) {
        // In Base/miniapp: always use real SDK context for username/displayName (even when IS_DEV)
        try {
          const ctx = await sdk.context;
          if (ctx?.user) {
            if (ctx.user.username != null && ctx.user.username !== "")
              body.username = ctx.user.username;
            if (ctx.user.displayName != null && ctx.user.displayName !== "")
              body.display_name = ctx.user.displayName;
          }
        } catch {
          if (context?.user) {
            if (context.user.username != null && context.user.username !== "")
              body.username = context.user.username;
            if (context.user.displayName != null && context.user.displayName !== "")
              body.display_name = context.user.displayName;
          }
        }
      } else if (IS_DEV && context?.user) {
        // Not in miniapp but dev: use fake context from React state
        if (context.user.username != null && context.user.username !== "")
          body.username = context.user.username;
        if (context.user.displayName != null && context.user.displayName !== "")
          body.display_name = context.user.displayName;
      }
      if (walletAddress != null && /^0x[a-fA-F0-9]{40}$/.test(walletAddress))
        body.wallet_address = walletAddress;

      // Optional referral code from URL (?ref=...), applied on first auth.
      if (typeof window !== "undefined") {
        try {
          const url = new URL(window.location.href);
          const ref = url.searchParams.get("ref");
          if (ref) {
            body.referral_code = ref.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
          }
        } catch {
          // ignore malformed URL
        }
      }
      const res = await fetch(`${base}/api/auth/session`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...getDevAuthHeaders(),
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        if (typeof window !== "undefined") console.warn("[auth] fetchSession: POST failed", res.status);
        setError("Failed to start session");
        setIsLoading(false);
        return false;
      }
      const data = (await res.json()) as {
        session_id: string;
        balance: number;
        last_seq: number;
        energy?: number;
        energy_max?: number;
        energy_regen_per_sec?: number;
        server_time?: number;
        points_multiplier?: number;
        mining_points_per_sec?: number;
        boosters?: BoosterListItem[];
      };
      setSessionId(data.session_id);
      setServerBalance(data.balance);
      setLastServerSeq(data.last_seq);
      if (typeof data.energy === "number") setEnergy(data.energy);
      if (typeof data.energy_max === "number") setEnergyMax(data.energy_max);
      if (typeof data.energy_regen_per_sec === "number") setEnergyRegenPerSec(data.energy_regen_per_sec);
      if (typeof data.points_multiplier === "number") setPointsMultiplier(data.points_multiplier);
      if (typeof data.mining_points_per_sec === "number") setMiningPointsPerSec(data.mining_points_per_sec);
      if (Array.isArray(data.boosters)) setBoosters(data.boosters);
      setEnergyServerTime(typeof data.server_time === "number" ? data.server_time : Date.now());
      seqRef.current = data.last_seq;
      const stored = getStoredState();
      const restoredFromStorage =
        !!(stored?.sessionId === data.session_id && stored.localTapDelta > 0);
      if (restoredFromStorage) {
        setLocalTapDelta(stored!.localTapDelta);
        setLastCommitTime(stored!.lastCommitTime);
        setClientScore(stored!.clientScore);
        logTap("fetchSession restored uncommitted", {
          localTapDelta: stored!.localTapDelta,
          clientScore: stored!.clientScore,
        });
      } else {
        setLocalTapDelta(0);
        setLastCommitTime(Date.now());
        setClientScore(data.balance);
      }
      setError(null);
      if (typeof window !== "undefined") console.log("[auth] fetchSession: session created", data.session_id);
      logTap("fetchSession done", { session_id: data.session_id, lastCommitTime: Date.now() });
      return true;
    } catch {
      setError("Failed to start session");
      setIsLoading(false);
      return false;
    }
  }, [getToken, context, walletAddress]);

  const fetchState = useCallback(async (): Promise<void> => {
    if (typeof window !== "undefined") console.log("[auth] fetchState: getToken");
    const token = await getToken();
    if (!token) return;
    const base = getApiBase();
    const res = await fetch(`${base}/api/v1/tap/state`, {
      headers: {
        Authorization: `Bearer ${token}`,
        ...getDevAuthHeaders(),
      },
    });
    if (!res.ok) return;
    const data = (await res.json()) as {
      balance: number;
      last_seq: number;
      session_id: string;
      energy?: number;
      energy_max?: number;
      energy_regen_per_sec?: number;
      server_time?: number;
      points_multiplier?: number;
      mining_points_per_sec?: number;
      boosters?: BoosterListItem[];
    };
    setServerBalance(data.balance);
    setLastServerSeq(data.last_seq);
    setSessionId(data.session_id || null);
    setLocalTapDelta(0);
    setLastCommitTime(Date.now());
    pointsRemainderRef.current = 0;
    // Full sync: server is source of truth; accept server balance so purchases/commits are reflected.
    setClientScore(data.balance);
    if (typeof data.energy === "number") setEnergy(data.energy);
    if (typeof data.energy_max === "number") setEnergyMax(data.energy_max);
    if (typeof data.energy_regen_per_sec === "number") setEnergyRegenPerSec(data.energy_regen_per_sec);
    if (typeof data.points_multiplier === "number") setPointsMultiplier(data.points_multiplier);
    if (typeof data.mining_points_per_sec === "number") setMiningPointsPerSec(data.mining_points_per_sec);
    if (Array.isArray(data.boosters)) setBoosters(data.boosters);
    if (typeof data.server_time === "number") setEnergyServerTime(data.server_time);
    seqRef.current = data.last_seq;
  }, [getToken]);

  /** Fetches state but only updates energy-related fields (and boosters). Does not clear localTapDelta or other balance/session state. */
  const fetchEnergyOnly = useCallback(async (): Promise<void> => {
    if (typeof window !== "undefined") console.log("[auth] fetchEnergyOnly: getToken");
    const token = await getToken();
    if (!token) return;
    const base = getApiBase();
    const res = await fetch(`${base}/api/v1/tap/state`, {
      headers: {
        Authorization: `Bearer ${token}`,
        ...getDevAuthHeaders(),
      },
    });
    if (!res.ok) return;
    const data = (await res.json()) as {
      energy?: number;
      energy_max?: number;
      energy_regen_per_sec?: number;
      server_time?: number;
      boosters?: BoosterListItem[];
    };
    if (typeof data.energy === "number") setEnergy(data.energy);
    if (typeof data.energy_max === "number") setEnergyMax(data.energy_max);
    if (typeof data.energy_regen_per_sec === "number") setEnergyRegenPerSec(data.energy_regen_per_sec);
    if (typeof data.server_time === "number") setEnergyServerTime(data.server_time);
    if (Array.isArray(data.boosters)) setBoosters(data.boosters);
  }, [getToken]);

  const commitRef = useRef<
    (
      delta: number,
      commitTime: number,
      balanceAtSend: number,
      pointsDelta: number
    ) => Promise<void>
  >(() => Promise.resolve());
  const scheduleNextBatchIfNeededRef = useRef<() => void>(() => {});

  const commitFromRefs = useCallback(() => {
    commitTimeoutRef.current = null;
    if (IS_DEV) setDebugTimerScheduled(false);
    if (commitInFlightRef.current) return;
    const scheduled = scheduledDeltaRef.current;
    if (scheduled !== null) scheduledDeltaRef.current = null;
    // Use scheduled delta when set (from scheduleNextBatchIfNeeded after a commit).
    // Otherwise stateRef may still hold pre-commit localTapDelta before React has flushed setState.
    const manual =
      scheduled !== null ? scheduled : stateRef.current.localTapDelta;
    const multiplierAtSend = pointsMultiplier ?? 1;
    const pointsThisBatch =
      manual * multiplierAtSend + pointsRemainderRef.current;
    const pointsDelta = Math.floor(pointsThisBatch);
    pointsRemainderRef.current = pointsThisBatch - pointsDelta;
    const balanceAtSend = Math.floor(
      stateRef.current.serverBalance + manual * multiplierAtSend
    );
    logTap("commitFromRefs firing", {
      delta: manual,
      pointsThisBatch,
      pointsDelta,
      pointsRemainder: pointsRemainderRef.current,
      lastCommitTime: stateRef.current.lastCommitTime,
      balanceAtSend,
    });
    if (manual <= 0) return;
    const { lastCommitTime: t } = stateRef.current;
    void commitRef.current(manual, t, balanceAtSend, pointsDelta);
  }, [pointsMultiplier]);

  const scheduleNextBatchIfNeeded = useCallback(() => {
    if (commitInFlightRef.current || commitTimeoutRef.current != null) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      logTap("scheduleNextBatchIfNeeded: skip (offline)");
      return;
    }
    const pending = pendingLocalTapDeltaAfterCommitRef.current;
    if (pending !== null) pendingLocalTapDeltaAfterCommitRef.current = null;
    const manual = pending !== null ? pending : stateRef.current.localTapDelta;
    if (manual <= 0) return;
    const t = stateRef.current.lastCommitTime;
    const now = Date.now();
    const timeElapsed = now - t;
    const delay = Math.max(0, COMMIT_INTERVAL_MS - timeElapsed);
    logTap("scheduleNextBatchIfNeeded", { delay, localTapDelta: manual });
    scheduledDeltaRef.current = manual;
    commitTimeoutRef.current = setTimeout(commitFromRefs, delay);
    if (IS_DEV) setDebugTimerScheduled(true);
  }, [commitFromRefs]);

  useEffect(() => {
    scheduleNextBatchIfNeededRef.current = scheduleNextBatchIfNeeded;
  }, [scheduleNextBatchIfNeeded]);

  const commit = useCallback(
    async (
      delta: number,
      commitTime: number,
      balanceAtSend: number,
      pointsDelta: number
    ): Promise<void> => {
      if (typeof window !== "undefined") console.log("[auth] commit: getToken for batch", { delta, pointsDelta });
      const token = await getToken();
      tokenRef.current = token ?? null;
      if (!token || !sessionId || delta <= 0) {
        if (typeof window !== "undefined" && !token) console.warn("[auth] commit: skipped (no token)");
        return;
      }

      const seq = seqRef.current + 1;
      commitInFlightRef.current = true;
      if (IS_DEV) setDebugCommitInFlight(true);
      // commitAnchorRef already set by commitFromRefs with sentManual/sentAuto when applicable

      logTap("commit sending", { delta, commitTime, balanceAtSend, pointsDelta });

      seqRef.current = seq;

      try {
        const base = getApiBase();
        const res = await fetch(`${base}/api/v1/tap/commit`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            ...getDevAuthHeaders(),
          },
          body: JSON.stringify({
            session_id: sessionId,
            seq,
            taps_delta: delta,
            points_delta: pointsDelta,
            duration_ms: Date.now() - commitTime,
            client_balance_view: balanceAtSend,
            client_ts_start: commitTime,
            client_ts_end: Date.now(),
          }),
        });

        const data = (await res.json()) as {
          ok: boolean;
          resync_required?: boolean;
          applied_taps?: number;
          mining_points_applied?: number;
          balance?: number;
          energy?: number;
          energy_max?: number;
          energy_regen_per_sec?: number;
          points_multiplier?: number;
          mining_points_per_sec?: number;
          boosters?: BoosterListItem[];
          server_time?: number;
          session_id?: string;
          last_seq?: number;
        };

        logTap("commit done", {
          ok: data.ok,
          resync_required: data.resync_required,
          applied_taps: data.applied_taps,
          balance: data.balance,
        });

        if (IS_DEV) {
          setCommitHistory((h) =>
            [
              ...h,
              {
                at: Date.now(),
                delta,
                applied: data.applied_taps ?? delta,
                miningPointsApplied: data.mining_points_applied,
                balance: data.balance,
                ok: data.ok,
                resyncRequired: data.resync_required,
              },
            ].slice(-100)
          );
        }

        if (!data.ok || data.resync_required) {
          if (
            data.session_id != null &&
            data.last_seq != null
          ) {
            setSessionId(data.session_id);
            seqRef.current = data.last_seq;
            setLastServerSeq(data.last_seq);
            if (data.balance != null) setServerBalance(data.balance);
            setLocalTapDelta(0);
          } else {
            await fetchState();
            setLocalTapDelta(0);
            if (data.balance != null) setServerBalance(data.balance);
          }
          return;
        }

        const applied = data.applied_taps ?? delta;
        const localBefore = stateRef.current.localTapDelta;
        const appliedManual = Math.min(applied, localBefore);
        const remainingManual = Math.max(0, localBefore - appliedManual);
        pendingLocalTapDeltaAfterCommitRef.current = remainingManual;

        if (typeof data.balance === "number") {
          setServerBalance(data.balance);
          setClientScore((s) => Math.max(s, data.balance as number));
        }
        if (typeof data.energy === "number") setEnergy(data.energy);
        if (typeof data.energy_max === "number") setEnergyMax(data.energy_max);
        if (typeof data.energy_regen_per_sec === "number") setEnergyRegenPerSec(data.energy_regen_per_sec);
        if (typeof data.points_multiplier === "number") setPointsMultiplier(data.points_multiplier);
        if (typeof data.mining_points_per_sec === "number") setMiningPointsPerSec(data.mining_points_per_sec);
        if (Array.isArray(data.boosters)) setBoosters(data.boosters);
        if (typeof data.server_time === "number") setEnergyServerTime(data.server_time);
        setLocalTapDelta((d) => Math.max(0, d - appliedManual));
        setLastServerSeq(seq);
        if (data.session_id != null) setSessionId(data.session_id);
        if (data.last_seq != null) {
          seqRef.current = data.last_seq;
          setLastServerSeq(data.last_seq);
        }
        setLastCommitTime(Date.now());
      } finally {
        commitInFlightRef.current = false;
        if (IS_DEV) setDebugCommitInFlight(false);
        scheduleNextBatchIfNeeded();
      }
    },
    [getToken, sessionId, fetchState, scheduleNextBatchIfNeeded]
  );

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    commitRef.current = commit;
    return () => {
      commitRef.current = () => Promise.resolve();
    };
  }, [commit]);

  /** Schedule a single commit for COMMIT_INTERVAL_MS from last commit; only when no commit in flight. */
  const checkCommitTrigger = useCallback(
    (delta: number) => {
      const inFlight = commitInFlightRef.current;
      const hasExistingTimeout = commitTimeoutRef.current != null;
      const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
      if (delta <= 0 || inFlight || hasExistingTimeout || isOffline) {
        logTap("checkCommitTrigger skip", {
          delta,
          inFlight,
          hasExistingTimeout,
          isOffline,
        });
        return;
      }
      const now = Date.now();
      const timeElapsed = now - lastCommitTime;
      const delay = Math.max(0, COMMIT_INTERVAL_MS - timeElapsed);
      logTap("checkCommitTrigger schedule", {
        delta,
        lastCommitTime,
        timeElapsed,
        delay,
        delaySec: (delay / 1000).toFixed(1),
      });
      scheduledDeltaRef.current = delta;
      commitTimeoutRef.current = setTimeout(commitFromRefs, delay);
      if (IS_DEV) setDebugTimerScheduled(true);
    },
    [lastCommitTime, commitFromRefs]
  );

  const handleTap = useCallback(() => {
    const { energy: e, energyMax: max, energyRegenPerSec: regenPerSec, energyServerTime: t0 } =
      energyRef.current;
    const now = Date.now();
    const elapsedSeconds = (now - t0) / 1000;
    const regen = Math.floor(elapsedSeconds * regenPerSec);
    const effective = Math.min(max, e + regen);
    const available = effective - stateRef.current.localTapDelta;
    if (available <= 0) {
      logTap("handleTap skipped (no energy)", { available, effective });
      return;
    }
    logTap("handleTap");
    setLocalTapDelta((d) => {
      const next = d + 1;
      checkCommitTrigger(next);
      return next;
    });
    setClientScore((s) => s + pointsMultiplier);
  }, [checkCommitTrigger, pointsMultiplier]);

  // Sync seq ref from restored storage so commit uses correct seq before fetchSession completes
  useEffect(() => {
    const s = getStoredState();
    if (s != null) seqRef.current = s.lastServerSeq;
  }, []);

  // When we finish loading with restored uncommitted taps, schedule a commit once
  useEffect(() => {
    if (!isLoading && sessionId && localTapDelta > 0) {
      scheduleNextBatchIfNeededRef.current();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: run only when loading finishes
  }, [isLoading]);

  // Persist state to localStorage so it survives refresh/close
  useEffect(() => {
    saveState({
      serverBalance,
      lastServerSeq,
      sessionId,
      localTapDelta,
      lastCommitTime,
      clientScore,
    });
  }, [serverBalance, lastServerSeq, sessionId, localTapDelta, lastCommitTime, clientScore]);

  // Commit current uncommitted taps on app close (fire-and-forget with keepalive), regardless of in-flight state
  const flushCommitOnUnloadRef = useRef((): void => {
    const token = tokenRef.current;
    const sid = sessionIdRef.current;
    const { localTapDelta: manual, lastCommitTime: t, serverBalance: s } = stateRef.current;
    if (!token || !sid || manual <= 0) return;
    const seq = seqRef.current + 1;
    const now = Date.now();
    const mult = 1; // approximate; server will apply correct multiplier
    const clientBalanceView = Math.floor(s + manual * mult);
    const body = JSON.stringify({
      session_id: sid,
      seq,
      taps_delta: manual,
      duration_ms: now - t,
      client_balance_view: clientBalanceView,
      client_ts_start: t,
      client_ts_end: now,
    });
    const base = getApiBase();
    try {
      fetch(`${base}/api/v1/tap/commit`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...getDevAuthHeaders(),
        },
        body,
        keepalive: true,
      });
    } catch {
      // ignore
    }
  });

  useEffect(() => {
    const onBeforeUnload = (): void => {
      flushCommitOnUnloadRef.current();
      saveState({
        serverBalance,
        lastServerSeq,
        sessionId,
        localTapDelta,
        lastCommitTime,
        clientScore,
      });
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [serverBalance, lastServerSeq, sessionId, localTapDelta, lastCommitTime, clientScore]);

  // Dedupe: React Strict Mode runs effect, then cleanup, then effect again. Clear the
  // shared promise only after a short delay so the second run reuses the same request.
  const SESSION_FETCH_DEDUPE_MS = 200;
  const sessionFetchPromiseRef = useRef<Promise<boolean> | null>(null);
  const sessionFetchClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // In production, wait for miniapp context (and thus username/display_name) before creating session
    if (!IS_DEV && !isReady) {
      if (typeof window !== "undefined") console.log("[auth] session effect: waiting for isReady (miniapp context)");
      return;
    }
    if (sessionFetchClearTimeoutRef.current) {
      clearTimeout(sessionFetchClearTimeoutRef.current);
      sessionFetchClearTimeoutRef.current = null;
    }
    if (!sessionFetchPromiseRef.current) {
      if (typeof window !== "undefined") console.log("[auth] session effect: starting fetchSession", { isReady, IS_DEV });
      sessionFetchPromiseRef.current = fetchSession();
    }
    const promise = sessionFetchPromiseRef.current;
    let cancelled = false;
    void promise.then((ok) => {
      if (!cancelled && typeof window !== "undefined") console.log("[auth] session effect: fetchSession finished", { ok });
      if (!cancelled) setIsLoading(false);
    });
    return () => {
      cancelled = true;
      sessionFetchClearTimeoutRef.current = setTimeout(() => {
        sessionFetchPromiseRef.current = null;
        sessionFetchClearTimeoutRef.current = null;
      }, SESSION_FETCH_DEDUPE_MS);
      if (commitTimeoutRef.current) {
        logTap("effect cleanup: clearing commit timeout");
        clearTimeout(commitTimeoutRef.current);
        commitTimeoutRef.current = null;
        scheduledDeltaRef.current = null;
        if (IS_DEV) setDebugTimerScheduled(false);
      }
    };
  }, [fetchSession, isReady]);

  // Tick every second so displayEnergy (and energy bar) updates in near real time
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Refetch energy (and mining state) from backend at next regen boundary so energy anchor is renewed. Does not clear localTapDelta.
  // Cap frequency so we never refetch more often than once per minute.
  const MIN_STATE_REFETCH_INTERVAL_MS = 60_000;
  const fetchEnergyOnlyRef = useRef(fetchEnergyOnly);
  fetchEnergyOnlyRef.current = fetchEnergyOnly;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOnline = (): void => {
      logTap("online event: scheduling pending commit & energy refresh");
      scheduleNextBatchIfNeededRef.current();
      fetchEnergyOnlyRef.current();
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);
  useEffect(() => {
    if (!sessionId || energyServerTime <= 0 || energyRegenPerSec <= 0) return;
    const msPerEnergy = 1000 / energyRegenPerSec;
    const elapsed = Date.now() - energyServerTime;
    const nextBoundaryElapsed = (Math.floor(elapsed / msPerEnergy) + 1) * msPerEnergy;
    const delayToBoundary = nextBoundaryElapsed - elapsed;
    const delay = Math.max(MIN_STATE_REFETCH_INTERVAL_MS, Math.max(0, delayToBoundary));
    const timeout = setTimeout(() => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        logTap("energy refetch skipped (offline)");
        return;
      }
      fetchEnergyOnlyRef.current();
    }, delay);
    return () => clearTimeout(timeout);
  }, [sessionId, energyServerTime, energyRegenPerSec, fetchEnergyOnly]);

  const now = Date.now();
  const elapsedSeconds = (now - energyServerTime) / 1000;
  const regen = Math.floor(elapsedSeconds * energyRegenPerSec);
  const effectiveEnergy = Math.min(energyMax, energy + regen);
  /** Only manual taps consume energy; mining does not. */
  const displayEnergy = Math.max(0, effectiveEnergy - localTapDelta);

  /** Optimistic mining pts since last commit; synced on commit (resets) and on ~1/min fetch (mining_points_per_sec). */
  const miningElapsedSec = lastCommitTime > 0 ? (now - lastCommitTime) / 1000 : 0;
  const displayMining =
    miningPointsPerSec > 0 && miningElapsedSec > 0
      ? Math.floor(miningElapsedSec * miningPointsPerSec)
      : 0;

  const refreshState = useCallback(async () => {
    await fetchState();
  }, [fetchState]);

  const applyOptimisticPurchaseDeduction = useCallback((amount: number) => {
    if (amount <= 0) return;
    setPendingPurchaseDeduction((prev) => prev + amount);
  }, []);

  const revertOptimisticPurchaseDeduction = useCallback((amount: number) => {
    if (amount <= 0) return;
    setPendingPurchaseDeduction((prev) => Math.max(0, prev - amount));
  }, []);

  const score = Math.max(0, clientScore + displayMining - pendingPurchaseDeduction);
  return {
    state: {
      serverBalance,
      localTapDelta,
      lastServerSeq,
      lastCommitTime,
      sessionId,
      energy,
      energyMax,
      energyRegenPerSec,
      energyServerTime,
      pointsMultiplier,
      miningPointsPerSec,
      boosters,
      isLoading,
      error,
      clientScore,
    },
    handleTap,
    score,
    displayEnergy,
    displayMining,
    refreshState,
    getToken,
    applyOptimisticPurchaseDeduction,
    revertOptimisticPurchaseDeduction,
    ...(IS_DEV && {
      debug: {
        commitInFlight: debugCommitInFlight,
        timerScheduled: debugTimerScheduled,
        commitHistory,
      },
    }),
  };
}
