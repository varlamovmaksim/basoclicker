"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import sdk from "@farcaster/miniapp-sdk";

const COMMIT_INTERVAL_MS = 3000;
const COMMIT_TAP_THRESHOLD = 50;

const IS_DEV = process.env.NEXT_PUBLIC_IS_DEV === "true";

function getApiBase(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

export interface TapGameState {
  clientBalance: number;
  localTapDelta: number;
  lastServerSeq: number;
  lastCommitTime: number;
  sessionId: string | null;
  isLoading: boolean;
  error: string | null;
}

export interface UseTapGameReturn {
  state: TapGameState;
  handleTap: () => void;
  score: number; // clientBalance for display
}

export function useTapGame(): UseTapGameReturn {
  const [clientBalance, setClientBalance] = useState(0);
  const [localTapDelta, setLocalTapDelta] = useState(0);
  const [lastServerSeq, setLastServerSeq] = useState(0);
  const [lastCommitTime, setLastCommitTime] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seqRef = useRef(0);
  const commitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef({ localTapDelta: 0, lastCommitTime: 0, clientBalance: 0 });
  stateRef.current = { localTapDelta, lastCommitTime, clientBalance };

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
    setClientBalance(data.balance);
    setLastServerSeq(data.last_seq);
    seqRef.current = data.last_seq;
    setLocalTapDelta(0);
    setLastCommitTime(Date.now());
    setError(null);
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
    setClientBalance(data.balance);
    setLastServerSeq(data.last_seq);
    setSessionId(data.session_id || null);
    setLocalTapDelta(0);
    setLastCommitTime(Date.now());
    seqRef.current = data.last_seq;
  }, [getToken]);

  const commit = useCallback(
    async (delta: number, commitTime: number, currentBalance: number): Promise<void> => {
      const token = await getToken();
      if (!token || !sessionId || delta <= 0) return;

      const seq = seqRef.current + 1;
      seqRef.current = seq;

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
          client_balance_view: currentBalance,
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
      };

      if (!data.ok || data.resync_required) {
        await fetchState();
        setLocalTapDelta(0);
        if (data.balance != null) setClientBalance(data.balance);
        return;
      }

      setLocalTapDelta((d) => d - (data.applied_taps ?? delta));
      setClientBalance(data.balance ?? currentBalance + (data.applied_taps ?? 0));
      setLastServerSeq(seq);
      setLastCommitTime(data.server_time ?? Date.now());
    },
    [getToken, sessionId, fetchState]
  );

  const commitFromRefs = useCallback(() => {
    const { localTapDelta: d, lastCommitTime: t, clientBalance: b } = stateRef.current;
    if (d > 0) void commit(d, t, b);
  }, [commit]);

  const checkCommitTrigger = useCallback(
    (delta: number) => {
      const now = Date.now();
      const timeElapsed = now - lastCommitTime;
      const shouldCommit =
        timeElapsed >= COMMIT_INTERVAL_MS || delta >= COMMIT_TAP_THRESHOLD;
      if (shouldCommit && delta > 0) {
        void commit(delta, lastCommitTime, clientBalance);
      } else if (delta > 0) {
        if (commitTimeoutRef.current) clearTimeout(commitTimeoutRef.current);
        commitTimeoutRef.current = setTimeout(
          commitFromRefs,
          COMMIT_INTERVAL_MS - timeElapsed
        );
      }
    },
    [lastCommitTime, clientBalance, commit, commitFromRefs]
  );

  const handleTap = useCallback(() => {
    setLocalTapDelta((d) => {
      const next = d + 1;
      setClientBalance((b) => b + 1);
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
      if (commitTimeoutRef.current) clearTimeout(commitTimeoutRef.current);
    };
  }, [fetchSession]);

  return {
    state: {
      clientBalance,
      localTapDelta,
      lastServerSeq,
      lastCommitTime,
      sessionId,
      isLoading,
      error,
    },
    handleTap,
    score: clientBalance,
  };
}
