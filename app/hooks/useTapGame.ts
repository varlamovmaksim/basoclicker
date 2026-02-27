"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import sdk from "@farcaster/miniapp-sdk";

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
}

function getStoredState(): StoredTapState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredTapState;
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

function getApiBase(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

export interface BoosterLevels {
  points: number;
  energy_max: number;
  energy_regen: number;
  auto_taps: number;
}

export interface BoosterNextPrices {
  points: number;
  energy_max: number;
  energy_regen: number;
  auto_taps: number;
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
  energyRegenPerMin: number;
  /** Timestamp when energy was last set by server (ms). */
  energyServerTime: number;
  pointsMultiplier: number;
  autoTapsPerMin: number;
  boosterLevels: BoosterLevels | null;
  boosterNextPrices: BoosterNextPrices | null;
  isLoading: boolean;
  error: string | null;
}

export interface CommitRecord {
  at: number;
  delta: number;
  applied: number;
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
  /** Display score: serverBalance + localTapDelta (smooth, no jumps). */
  score: number;
  /** Display energy: consumed on tap (server energy + regen − localTapDelta), capped to [0, energyMax]. */
  displayEnergy: number;
  /** Only present when NEXT_PUBLIC_IS_DEV === "true". */
  debug?: TapGameDebug;
  /** Refetch state from server (e.g. after restore energy or booster purchase). */
  refreshState: () => Promise<void>;
}

function getInitialStoredState(): StoredTapState | null {
  if (typeof window === "undefined") return null;
  return getStoredState();
}

export function useTapGame(): UseTapGameReturn {
  const stored = getInitialStoredState();
  const [serverBalance, setServerBalance] = useState(stored?.serverBalance ?? 0);
  const [localTapDelta, setLocalTapDelta] = useState(stored?.localTapDelta ?? 0);
  const [lastServerSeq, setLastServerSeq] = useState(stored?.lastServerSeq ?? 0);
  const [lastCommitTime, setLastCommitTime] = useState(stored?.lastCommitTime ?? 0);
  const [sessionId, setSessionId] = useState<string | null>(stored?.sessionId ?? null);
  const [energy, setEnergy] = useState(1000);
  const [energyMax, setEnergyMax] = useState(1000);
  const [energyRegenPerMin, setEnergyRegenPerMin] = useState(1);
  const [energyServerTime, setEnergyServerTime] = useState(0);
  const [pointsMultiplier, setPointsMultiplier] = useState(1);
  const [autoTapsPerMin, setAutoTapsPerMin] = useState(0);
  const [boosterLevels, setBoosterLevels] = useState<BoosterLevels | null>(null);
  const [boosterNextPrices, setBoosterNextPrices] = useState<BoosterNextPrices | null>(null);
  const [, setTick] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seqRef = useRef(0);
  const tokenRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const commitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitInFlightRef = useRef(false);
  const commitAnchorRef = useRef<{ sentDelta: number } | null>(null);
  /** After applying a commit, stateRef is still stale; use this when scheduling from finally. */
  const pendingLocalTapDeltaAfterCommitRef = useRef<number | null>(null);
  /** When set, commitFromRefs must use this delta (from when we scheduled) instead of reading stateRef. */
  const scheduledDeltaRef = useRef<number | null>(null);
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
    energyRegenPerMin: 1,
    energyServerTime: 0,
  });
  energyRef.current = {
    energy,
    energyMax,
    energyRegenPerMin,
    energyServerTime,
  };

  const getToken = useCallback(async (): Promise<string | null> => {
    if (IS_DEV) return "dev";
    try {
      const { token } = await sdk.quickAuth.getToken();
      return token ?? null;
    } catch {
      return null;
    }
  }, []);

  const fetchSession = useCallback(async (): Promise<boolean> => {
    const token = await getToken();
    tokenRef.current = token ?? null;
    if (!token) {
      setError("Not signed in");
      setIsLoading(false);
      return false;
    }
    const base = getApiBase();
    const res = await fetch(`${base}/api/auth/session`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
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
      energy_regen_per_min?: number;
      points_multiplier?: number;
      auto_taps_per_min?: number;
      booster_levels?: BoosterLevels;
      booster_next_prices?: BoosterNextPrices;
    };
    setSessionId(data.session_id);
    setServerBalance(data.balance);
    setLastServerSeq(data.last_seq);
    if (typeof data.energy === "number") setEnergy(data.energy);
    if (typeof data.energy_max === "number") setEnergyMax(data.energy_max);
    if (typeof data.energy_regen_per_min === "number") setEnergyRegenPerMin(data.energy_regen_per_min);
    if (typeof data.points_multiplier === "number") setPointsMultiplier(data.points_multiplier);
    if (typeof data.auto_taps_per_min === "number") setAutoTapsPerMin(data.auto_taps_per_min);
    if (data.booster_levels != null) setBoosterLevels(data.booster_levels);
    if (data.booster_next_prices != null) setBoosterNextPrices(data.booster_next_prices);
    setEnergyServerTime(Date.now());
    seqRef.current = data.last_seq;
    const stored = getStoredState();
    if (stored?.sessionId === data.session_id && stored.localTapDelta > 0) {
      setLocalTapDelta(stored.localTapDelta);
      setLastCommitTime(stored.lastCommitTime);
      logTap("fetchSession restored uncommitted", { localTapDelta: stored.localTapDelta });
    } else {
      setLocalTapDelta(0);
      setLastCommitTime(Date.now());
    }
    setError(null);
    logTap("fetchSession done", { session_id: data.session_id, lastCommitTime: Date.now() });
    return true;
  }, [getToken]);

  const fetchState = useCallback(async (): Promise<void> => {
    const token = await getToken();
    if (!token) return;
    const base = getApiBase();
    const res = await fetch(`${base}/api/v1/tap/state`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = (await res.json()) as {
      balance: number;
      last_seq: number;
      session_id: string;
      energy?: number;
      energy_max?: number;
      energy_regen_per_min?: number;
      server_time?: number;
      points_multiplier?: number;
      auto_taps_per_min?: number;
      booster_levels?: BoosterLevels;
      booster_next_prices?: BoosterNextPrices;
    };
    setServerBalance(data.balance);
    setLastServerSeq(data.last_seq);
    setSessionId(data.session_id || null);
    setLocalTapDelta(0);
    setLastCommitTime(Date.now());
    if (typeof data.energy === "number") setEnergy(data.energy);
    if (typeof data.energy_max === "number") setEnergyMax(data.energy_max);
    if (typeof data.energy_regen_per_min === "number") setEnergyRegenPerMin(data.energy_regen_per_min);
    if (typeof data.points_multiplier === "number") setPointsMultiplier(data.points_multiplier);
    if (typeof data.auto_taps_per_min === "number") setAutoTapsPerMin(data.auto_taps_per_min);
    if (data.booster_levels != null) setBoosterLevels(data.booster_levels);
    if (data.booster_next_prices != null) setBoosterNextPrices(data.booster_next_prices);
    if (typeof data.server_time === "number") setEnergyServerTime(data.server_time);
    seqRef.current = data.last_seq;
  }, [getToken]);

  const commitRef = useRef<
    (delta: number, commitTime: number, balanceAtSend: number) => Promise<void>
  >(() => Promise.resolve());
  const scheduleNextBatchIfNeededRef = useRef<() => void>(() => {});

  const commitFromRefs = useCallback(() => {
    commitTimeoutRef.current = null;
    if (IS_DEV) setDebugTimerScheduled(false);
    if (commitInFlightRef.current) return;
    const scheduled = scheduledDeltaRef.current;
    if (scheduled !== null) scheduledDeltaRef.current = null;
    const d = scheduled !== null ? scheduled : stateRef.current.localTapDelta;
    const { lastCommitTime: t, serverBalance: s } = stateRef.current;
    const balanceAtSend = s + d;
    logTap("commitFromRefs firing", { delta: d, lastCommitTime: t, balanceAtSend });
    if (d > 0) void commitRef.current(d, t, balanceAtSend);
  }, []);

  const scheduleNextBatchIfNeeded = useCallback(() => {
    if (commitInFlightRef.current || commitTimeoutRef.current != null) return;
    const pending = pendingLocalTapDeltaAfterCommitRef.current;
    if (pending !== null) pendingLocalTapDeltaAfterCommitRef.current = null;
    const d = pending !== null ? pending : stateRef.current.localTapDelta;
    if (d <= 0) return;
    const t = stateRef.current.lastCommitTime;
    const now = Date.now();
    const timeElapsed = now - t;
    const delay = Math.max(0, COMMIT_INTERVAL_MS - timeElapsed);
    logTap("scheduleNextBatchIfNeeded", { delay, localTapDelta: d });
    scheduledDeltaRef.current = d;
    commitTimeoutRef.current = setTimeout(commitFromRefs, delay);
    if (IS_DEV) setDebugTimerScheduled(true);
  }, [commitFromRefs]);

  useEffect(() => {
    scheduleNextBatchIfNeededRef.current = scheduleNextBatchIfNeeded;
  }, [scheduleNextBatchIfNeeded]);

  const commit = useCallback(
    async (delta: number, commitTime: number, balanceAtSend: number): Promise<void> => {
      const token = await getToken();
      tokenRef.current = token ?? null;
      if (!token || !sessionId || delta <= 0) return;

      const seq = seqRef.current + 1;
      commitInFlightRef.current = true;
      if (IS_DEV) setDebugCommitInFlight(true);
      commitAnchorRef.current = { sentDelta: delta };

      logTap("commit sending", { delta, commitTime, balanceAtSend });

      seqRef.current = seq;

      try {
        const base = getApiBase();
        const res = await fetch(`${base}/api/v1/tap/commit`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            session_id: sessionId,
            seq,
            taps_delta: delta,
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
          balance?: number;
          energy?: number;
          energy_max?: number;
          energy_regen_per_min?: number;
          points_multiplier?: number;
          auto_taps_per_min?: number;
          booster_levels?: BoosterLevels;
          booster_next_prices?: BoosterNextPrices;
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

        const anchor = commitAnchorRef.current;
        commitAnchorRef.current = null;

        if (IS_DEV) {
          setCommitHistory((h) =>
            [
              ...h,
              {
                at: Date.now(),
                delta,
                applied: data.applied_taps ?? anchor?.sentDelta ?? delta,
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

        const applied = data.applied_taps ?? anchor?.sentDelta ?? delta;
        const localBefore = stateRef.current.localTapDelta;
        const remainingAfterApply = localBefore - applied;
        pendingLocalTapDeltaAfterCommitRef.current = remainingAfterApply;
        if (data.balance != null) setServerBalance(data.balance);
        if (typeof data.energy === "number") setEnergy(data.energy);
        if (typeof data.energy_max === "number") setEnergyMax(data.energy_max);
        if (typeof data.energy_regen_per_min === "number") setEnergyRegenPerMin(data.energy_regen_per_min);
        if (typeof data.points_multiplier === "number") setPointsMultiplier(data.points_multiplier);
        if (typeof data.auto_taps_per_min === "number") setAutoTapsPerMin(data.auto_taps_per_min);
        if (data.booster_levels != null) setBoosterLevels(data.booster_levels);
        if (data.booster_next_prices != null) setBoosterNextPrices(data.booster_next_prices);
        if (typeof data.server_time === "number") setEnergyServerTime(data.server_time);
        setLocalTapDelta((d) => d - applied);
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
      if (delta <= 0 || inFlight || hasExistingTimeout) {
        logTap("checkCommitTrigger skip", { delta, inFlight, hasExistingTimeout });
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
    const { energy: e, energyMax: max, energyRegenPerMin: regenPerMin, energyServerTime: t0 } =
      energyRef.current;
    const now = Date.now();
    const elapsedMinutes = (now - t0) / 60_000;
    const regen = Math.floor(elapsedMinutes * regenPerMin);
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
  }, [checkCommitTrigger]);

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
  }, [isLoading]); // intentional: run only when loading finishes, then schedule for current localTapDelta

  // Persist state to localStorage so it survives refresh/close
  useEffect(() => {
    saveState({
      serverBalance,
      lastServerSeq,
      sessionId,
      localTapDelta,
      lastCommitTime,
    });
  }, [serverBalance, lastServerSeq, sessionId, localTapDelta, lastCommitTime]);

  // Commit current uncommitted taps on app close (fire-and-forget with keepalive), regardless of in-flight state
  const flushCommitOnUnloadRef = useRef((): void => {
    const token = tokenRef.current;
    const sid = sessionIdRef.current;
    const { localTapDelta: d, lastCommitTime: t, serverBalance: s } = stateRef.current;
    if (!token || !sid || d <= 0) return;
    const seq = seqRef.current + 1;
    const now = Date.now();
    const body = JSON.stringify({
      session_id: sid,
      seq,
      taps_delta: d,
      duration_ms: now - t,
      client_balance_view: s + d,
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
      });
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [serverBalance, lastServerSeq, sessionId, localTapDelta, lastCommitTime]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await fetchSession();
      if (!cancelled) setIsLoading(false);
    })();
    return () => {
      cancelled = true;
      if (commitTimeoutRef.current) {
        logTap("effect cleanup: clearing commit timeout");
        clearTimeout(commitTimeoutRef.current);
        commitTimeoutRef.current = null;
        scheduledDeltaRef.current = null;
        if (IS_DEV) setDebugTimerScheduled(false);
      }
    };
  }, [fetchSession]);

  // Tick every second so displayEnergy (and energy bar) updates in near real time
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Auto-tap: when autoTapsPerMin > 0, fire handleTap at that rate (min interval 1s to avoid runaway)
  const handleTapRef = useRef(handleTap);
  handleTapRef.current = handleTap;
  useEffect(() => {
    if (autoTapsPerMin <= 0) return;
    const intervalMs = Math.max(1000, Math.floor(60_000 / autoTapsPerMin));
    const id = setInterval(() => {
      handleTapRef.current();
    }, intervalMs);
    return () => clearInterval(id);
  }, [autoTapsPerMin]);


  // Refetch state from backend at next regen boundary so energy value is renewed from server
  const fetchStateRef = useRef(fetchState);
  fetchStateRef.current = fetchState;
  useEffect(() => {
    if (!sessionId || energyServerTime <= 0 || energyRegenPerMin <= 0) return;
    const msPerEnergy = 60_000 / energyRegenPerMin;
    const elapsed = Date.now() - energyServerTime;
    const nextBoundaryElapsed = (Math.floor(elapsed / msPerEnergy) + 1) * msPerEnergy;
    const delay = nextBoundaryElapsed - elapsed;
    const timeout = setTimeout(() => {
      fetchStateRef.current();
    }, Math.max(0, delay));
    return () => clearTimeout(timeout);
  }, [sessionId, energyServerTime, energyRegenPerMin]);

  const now = Date.now();
  const elapsedMinutes = (now - energyServerTime) / 60_000;
  const regen = Math.floor(elapsedMinutes * energyRegenPerMin);
  const effectiveEnergy = Math.min(energyMax, energy + regen);
  const displayEnergy = Math.max(0, effectiveEnergy - localTapDelta);

  const refreshState = useCallback(async () => {
    await fetchState();
  }, [fetchState]);

  return {
    state: {
      serverBalance,
      localTapDelta,
      lastServerSeq,
      lastCommitTime,
      sessionId,
      energy,
      energyMax,
      energyRegenPerMin,
      energyServerTime,
      pointsMultiplier,
      autoTapsPerMin,
      boosterLevels,
      boosterNextPrices,
      isLoading,
      error,
    },
    handleTap,
    score: serverBalance + localTapDelta,
    displayEnergy,
    refreshState,
    ...(IS_DEV && {
      debug: {
        commitInFlight: debugCommitInFlight,
        timerScheduled: debugTimerScheduled,
        commitHistory,
      },
    }),
  };
}
