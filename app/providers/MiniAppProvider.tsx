"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import sdk from "@farcaster/miniapp-sdk";
import { farcasterConfig } from "@/farcaster.config";

const IS_DEV = process.env.NEXT_PUBLIC_IS_DEV === "true";

/** Shape of context we fake in dev. Extend this when the app starts using more context fields. */
export interface DevMiniAppContext {
  client: {
    platformType?: "web" | "mobile";
    clientFid: number;
    added: boolean;
    safeAreaInsets?: { top: number; bottom: number; left: number; right: number };
  };
  user: {
    fid: number;
    username?: string;
    displayName?: string;
    pfpUrl?: string;
  };
  location?: unknown;
  features?: { haptics: boolean; cameraAndMicrophoneAccess?: boolean };
}

const DEV_CONTEXT: DevMiniAppContext = {
  client: {
    platformType: "web",
    clientFid: 0,
    added: false,
    safeAreaInsets: { top: 0, bottom: 0, left: 0, right: 0 },
  },
  user: { fid: 0 },
};

/** Builds fake miniapp context when NEXT_PUBLIC_IS_DEV is true (e.g. browser dev). */
function getDevContext(): Awaited<typeof sdk.context> {
  return DEV_CONTEXT as Awaited<typeof sdk.context>;
}

interface MiniAppContextValue {
  context: Awaited<typeof sdk.context> | null;
  isReady: boolean;
  isDev: boolean;
  /** Resolves when miniapp init has finished (context ready or fallback). Call before getToken() in prod so SIWF runs after ready(). */
  whenReady: () => Promise<void>;
}

export const MiniAppContext = createContext<MiniAppContextValue | null>(null);

export function useMiniApp(): MiniAppContextValue {
  const context = useContext(MiniAppContext);
  if (!context) {
    throw new Error("useMiniApp must be used within MiniAppProvider");
  }
  return context;
}

export function MiniAppProvider({
  children,
}: {
  children: ReactNode;
}): React.ReactElement {
  const [context, setContext] = useState<Awaited<typeof sdk.context> | null>(
    IS_DEV ? getDevContext() : null
  );
  const [isReady, setIsReady] = useState(IS_DEV);
  const resolveReadyRef = useRef<(() => void) | null>(null);
  const readyPromise = useMemo(
    () =>
      IS_DEV ? Promise.resolve() : new Promise<void>((r) => { resolveReadyRef.current = r; }),
    []
  );
  const whenReady = useMemo(() => () => readyPromise, [readyPromise]);

  useEffect(() => {
    const initId = Math.random().toString(36).slice(2, 8);
    const log = (step: string, detail?: Record<string, unknown>) => {
      const payload = detail ? ` ${JSON.stringify(detail)}` : "";
      console.log(`[auth] init(${initId}) ${step}${payload}`);
    };
    const warn = (step: string, err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      console.warn(`[auth] init(${initId}) ${step}`, msg, stack ? { stack: stack.slice(0, 200) } : "");
    };

    if (IS_DEV) {
      log("skip (IS_DEV=true)", { isReady: true });
      return;
    }

    let cancelled = false;
    const TIMEOUT_MS = 10_000;
    const READY_TIMEOUT_MS = 5000;
    const t0 = typeof performance !== "undefined" ? performance.now() : 0;

    log("start", {
      timeoutMs: TIMEOUT_MS,
      readyTimeoutMs: READY_TIMEOUT_MS,
      origin: typeof window !== "undefined" ? window.location.origin : "",
      nextPublicUrl: process.env.NEXT_PUBLIC_URL ?? "(not set)",
      manifestHomeUrl: farcasterConfig.miniapp.homeUrl,
      domainCheck: "for verify-siwf, origin should match manifestHomeUrl and Farcaster app domain in dev portal",
    });

    const init = async (): Promise<void> => {
      try {
        // Step 1: isInMiniApp
        log("step: isInMiniApp", { timeoutMs: TIMEOUT_MS });
        const t1 = typeof performance !== "undefined" ? performance.now() : 0;
        const isInApp = await (sdk.isInMiniApp as (timeoutMs?: number) => Promise<boolean>)(TIMEOUT_MS);
        const elapsed1 = typeof performance !== "undefined" ? Math.round(performance.now() - t1) : 0;
        if (cancelled) {
          log("cancelled after isInMiniApp");
          return;
        }
        log("step: isInMiniApp done", { isInApp, elapsedMs: elapsed1 });
        if (!isInApp) {
          log("not in miniapp → fallback context");
          setContext(getDevContext());
          setIsReady(true);
          resolveReadyRef.current?.();
          resolveReadyRef.current = null;
          return;
        }

        // Step 2: sdk.actions.ready()
        log("step: ready()", { timeoutMs: READY_TIMEOUT_MS });
        const t2 = typeof performance !== "undefined" ? performance.now() : 0;
        await Promise.race([
          sdk.actions.ready(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("ready_timeout")), READY_TIMEOUT_MS)
          ),
        ]);
        const elapsed2 = typeof performance !== "undefined" ? Math.round(performance.now() - t2) : 0;
        if (cancelled) {
          log("cancelled after ready()");
          return;
        }
        log("step: ready() done", { elapsedMs: elapsed2 });

        // Step 3: sdk.context
        log("step: context", { timeoutMs: TIMEOUT_MS });
        const t3 = typeof performance !== "undefined" ? performance.now() : 0;
        const ctx = await Promise.race([
          sdk.context,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("context_timeout")), TIMEOUT_MS)
          ),
        ]);
        const elapsed3 = typeof performance !== "undefined" ? Math.round(performance.now() - t3) : 0;
        if (cancelled) {
          log("cancelled after context");
          return;
        }
        const totalMs = typeof performance !== "undefined" ? Math.round(performance.now() - t0) : 0;
        const user = ctx?.user;
        const userInfo =
          user != null
            ? {
                fid: user.fid ?? null,
                address: (user as { address?: string; custodyAddress?: string }).address ?? (user as { address?: string; custodyAddress?: string }).custodyAddress ?? null,
                username: user.username ?? null,
                display_name: user.displayName ?? null,
              }
            : null;
        log("step: context done", {
          elapsedMs: elapsed3,
          totalMs,
          hasUser: !!user,
          user: userInfo,
        });
        setContext(ctx);
        setIsReady(true);
        resolveReadyRef.current?.();
        resolveReadyRef.current = null;
        log("init complete");
      } catch (e) {
        if (cancelled) {
          log("cancelled in catch");
          return;
        }
        const failedStep =
          e instanceof Error && e.message === "ready_timeout"
            ? "ready()"
            : e instanceof Error && e.message === "context_timeout"
              ? "context"
              : "unknown";
        warn(`init failed (${failedStep})`, e);
        console.warn("[auth] MiniAppProvider: using fallback context after init failure");
        setContext(getDevContext());
        setIsReady(true);
        resolveReadyRef.current?.();
        resolveReadyRef.current = null;
      }
    };
    init();
    return () => {
      cancelled = true;
      log("cleanup (cancelled=true)");
    };
  }, []);

  return (
    <MiniAppContext.Provider
      value={{ context, isReady, isDev: IS_DEV, whenReady }}
    >
      {children}
    </MiniAppContext.Provider>
  );
}
