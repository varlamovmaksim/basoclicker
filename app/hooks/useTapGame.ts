"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import sdk from "@farcaster/miniapp-sdk";

/** Accumulated taps are sent once per this interval (ms). */
const COMMIT_INTERVAL_MS = 5000;

const IS_DEV = process.env.NEXT_PUBLIC_IS_DEV === "true";

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

export interface TapGameState {
  /** Last known server-confirmed balance (never incremented on tap). */
  serverBalance: number;
  /** Uncommitted tap count since last commit. Display = serverBalance + localTapDelta. */
  localTapDelta: number;
  lastServerSeq: number;
  lastCommitTime: number;
  sessionId: string | null;
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
  /** Only present when NEXT_PUBLIC_IS_DEV === "true". */
  debug?: TapGameDebug;
}

export function useTapGame(): UseTapGameReturn {
  const [serverBalance, setServerBalance] = useState(0);
  const [localTapDelta, setLocalTapDelta] = useState(0);
  const [lastServerSeq, setLastServerSeq] = useState(0);
  const [lastCommitTime, setLastCommitTime] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seqRef = useRef(0);
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
    };
    setSessionId(data.session_id);
    setServerBalance(data.balance);
    setLastServerSeq(data.last_seq);
    seqRef.current = data.last_seq;
    setLocalTapDelta(0);
    setLastCommitTime(Date.now());
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
    };
    setServerBalance(data.balance);
    setLastServerSeq(data.last_seq);
    setSessionId(data.session_id || null);
    setLocalTapDelta(0);
    setLastCommitTime(Date.now());
    seqRef.current = data.last_seq;
  }, [getToken]);

  const commitRef = useRef<
    (delta: number, commitTime: number, balanceAtSend: number) => Promise<void>
  >(() => Promise.resolve());

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

  const commit = useCallback(
    async (delta: number, commitTime: number, balanceAtSend: number): Promise<void> => {
      const token = await getToken();
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
    logTap("handleTap");
    setLocalTapDelta((d) => {
      const next = d + 1;
      checkCommitTrigger(next);
      return next;
    });
  }, [checkCommitTrigger]);

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

  return {
    state: {
      serverBalance,
      localTapDelta,
      lastServerSeq,
      lastCommitTime,
      sessionId,
      isLoading,
      error,
    },
    handleTap,
    score: serverBalance + localTapDelta,
    ...(IS_DEV && {
      debug: {
        commitInFlight: debugCommitInFlight,
        timerScheduled: debugTimerScheduled,
        commitHistory,
      },
    }),
  };
}
