"use client";

export interface IconBtnProps {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  ariaLabel?: string;
  className?: string;
}

export function IconBtn({
  children,
  onClick,
  ariaLabel,
  className,
}: IconBtnProps): React.ReactElement {
  const base =
    "flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white/70 text-slate-500";
  const cls = className ? `${base} ${className}` : base;
  return (
    <button
      type="button"
      className={cls}
      onClick={(e) => {
        e.preventDefault();
        onClick?.(e);
      }}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}

