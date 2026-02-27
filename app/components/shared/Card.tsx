"use client";

export interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps): React.ReactElement {
  const base = "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3";
  const cls = className ? `${base} ${className}` : base;
  return <div className={cls}>{children}</div>;
}

