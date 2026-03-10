"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import sdk from "@farcaster/miniapp-sdk";

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

  useEffect(() => {
    if (IS_DEV) return;

    let cancelled = false;
    const TIMEOUT_MS = 10_000;

    const init = async (): Promise<void> => {
      try {
        // SDK default is 1s; host (Base/Farcaster) may need longer to send context in prod. Types omit timeoutMs.
        const isInApp = await (sdk.isInMiniApp as (timeoutMs?: number) => Promise<boolean>)(TIMEOUT_MS);
        if (cancelled) return;
        if (!isInApp) {
          // Opened in browser or not in miniapp: still mark ready with fallback so UI can render (e.g. "Open in Farcaster")
          setContext(getDevContext());
          setIsReady(true);
          return;
        }
        const ctx = await Promise.race([
          sdk.context,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("context_timeout")), TIMEOUT_MS)
          ),
        ]);
        if (cancelled) return;
        setContext(ctx);
        await Promise.race([
          sdk.actions.ready(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("ready_timeout")), 5000)
          ),
        ]);
        if (!cancelled) setIsReady(true);
      } catch {
        if (cancelled) return;
        // Timeout or error: allow app to render so user sees content or error state
        setContext(getDevContext());
        setIsReady(true);
      }
    };
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <MiniAppContext.Provider
      value={{ context, isReady, isDev: IS_DEV }}
    >
      {children}
    </MiniAppContext.Provider>
  );
}
