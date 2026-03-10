"use client";

import { useMiniApp } from "@/app/providers/MiniAppProvider";
import { type ReactNode } from "react";

interface SafeAreaProps {
  children: ReactNode;
  className?: string;
}

export function SafeArea({
  children,
  className,
}: SafeAreaProps): React.ReactElement {
  const { context, isReady } = useMiniApp();

  const insets =
    isReady && context?.client?.safeAreaInsets
      ? context.client.safeAreaInsets
      : null;

  return (
    <div
      className={className}
      style={{
        minHeight: "100dvh",
        backgroundColor: "#fff",
        paddingTop: insets?.top ?? "env(safe-area-inset-top, 0)",
        paddingBottom: insets?.bottom ?? "env(safe-area-inset-bottom, 0)",
        paddingLeft: insets?.left ?? "env(safe-area-inset-left, 0)",
        paddingRight: insets?.right ?? "env(safe-area-inset-right, 0)",
      }}
    >
      {children}
    </div>
  );
}
