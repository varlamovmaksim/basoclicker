"use client";

import { type ReactNode, useState } from "react";
import { base } from "wagmi/chains";
import { createConfig, http, WagmiProvider } from "wagmi";
import { baseAccount, injected } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { farcasterMiniApp } from "@farcaster/miniapp-wagmi-connector";
import { OnchainKitProvider } from "@coinbase/onchainkit";
import { MiniAppProvider } from "./MiniAppProvider";
import { farcasterConfig } from "@/farcaster.config";

/**
 * Base Account = Coinbase smart account on Base. Supports batch calls (EIP-5792 sendCalls).
 * Gas sponsorship via OnchainKitProvider (CDP paymaster when NEXT_PUBLIC_ONCHAINKIT_API_KEY set).
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
      <OnchainKitProvider chain={base} miniKit={{ enabled: true }}>
        <WagmiProvider config={config}>
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        </WagmiProvider>
      </OnchainKitProvider>
    </MiniAppProvider>
  );
}
