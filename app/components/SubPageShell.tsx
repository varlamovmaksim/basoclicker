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
      className="absolute inset-0 z-40 flex flex-col bg-white"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
        <button
          type="button"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50/80 text-xl font-black leading-none text-slate-500 hover:bg-slate-100/80"
          onClick={(e) => {
            e.preventDefault();
            onClose();
          }}
          aria-label="back"
        >
          ‹
        </button>
        <h2 className="text-lg font-black text-slate-900">{title}</h2>
      </div>
      <div className="flex-1 overflow-auto px-4 py-3 pb-6">{children}</div>
    </div>
  );
}

