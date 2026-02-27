"use client";

export interface PrimaryBtnProps {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  className?: string;
}

export function PrimaryBtn({
  children,
  onClick,
  disabled,
  className,
}: PrimaryBtnProps): React.ReactElement {
  const base =
    "mt-3 w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black tracking-wide text-white shadow-sm";
  const disabledCls = disabled ? "cursor-not-allowed opacity-50" : "";
  const cls = [base, disabledCls, className].filter(Boolean).join(" ");
  return (
    <button
      type="button"
      className={cls}
      onClick={(e) => {
        e.preventDefault();
        if (disabled) return;
        onClick?.(e);
      }}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

