"use client";

export function Toast({ text }: { text: string }): React.ReactElement {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center">
      <div className="rounded-full bg-slate-900/95 px-4 py-2.5 text-sm font-black text-white shadow-xl">
        {text}
      </div>
    </div>
  );
}

