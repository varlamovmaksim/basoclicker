"use client";

export function LoadingScreen(): React.ReactElement {
  return (
    <div
      className="flex min-h-screen min-h-dvh w-full flex-col items-center justify-center gap-6 bg-[length:100%_100%]"
      style={{
        background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #16213e 100%)",
      }}
    >
      <div
        className="h-12 w-12 animate-spin rounded-full border-4 border-slate-600 border-t-blue-500"
        aria-hidden
      />
      <p className="text-sm font-medium text-slate-400">Loading…</p>
    </div>
  );
}
