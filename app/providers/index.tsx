"use client";

import { type ReactNode, useState } from "react";
import { base } from "wagmi/chains";
import { createConfig, http, WagmiProvider } from "wagmi";
import { baseAccount, injected } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { farcasterMiniApp } from "@farcaster/miniapp-wagmi-connector";
import { MiniAppProvider } from "./MiniAppProvider";
import { farcasterConfig } from "@/farcaster.config";

/**
 * Base Account = Coinbase smart account on Base. Supports batch calls (EIP-5792 sendCalls).
 * Gas sponsorship is not configured in this repo; if any, it is on Base/Coinbase infra side.
 */
export const config = createConfig({
  chains: [base],
  transports: { [base.id]: http() },
  connectors: [
    farcasterMiniApp(),
    baseAccount({
      appName: farcasterConfig.miniapp.name,
      appLogoUrl: farcasterConfig.miniapp.iconUrl,
    }),
    injected(),
  ],
});

export function Providers({ children }: { children: ReactNode }): ReactNode {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <MiniAppProvider>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </WagmiProvider>
    </MiniAppProvider>
  );
}
