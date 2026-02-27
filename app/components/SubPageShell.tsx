"use client";

export interface SubPageShellProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function SubPageShell({
  title,
  onClose,
  children,
}: SubPageShellProps): React.ReactElement {
  return (
    <div
      className="absolute inset-0 z-40 flex flex-col bg-white px-4 py-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex items-center gap-3 border-b border-slate-200 pb-3">
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-lg font-black text-slate-500"
          onClick={(e) => {
            e.preventDefault();
            onClose();
          }}
          aria-label="back"
        >
          ‹
        </button>
        <div className="text-base font-black text-slate-900">{title}</div>
      </div>
      <div className="mt-3 flex-1 overflow-auto pb-4">{children}</div>
    </div>
  );
}

