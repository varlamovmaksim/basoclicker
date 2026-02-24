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

    const init = async (): Promise<void> => {
      const isInApp = await sdk.isInMiniApp();
      if (isInApp) {
        const ctx = await sdk.context;
        setContext(ctx);
        await sdk.actions.ready();
        setIsReady(true);
      }
    };
    init();
  }, []);

  return (
    <MiniAppContext.Provider
      value={{ context, isReady, isDev: IS_DEV }}
    >
      {children}
    </MiniAppContext.Provider>
  );
}
