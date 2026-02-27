"use client";

import { PrimaryBtn } from "./shared/PrimaryBtn";
import { UsdcLogo } from "./UsdcLogo";

export interface DonateSheetProps {
  title: string;
  amount: string;
  onAmount: (v: string) => void;
  onMax: () => void;
  onSend: () => void;
  onClose: () => void;
  balance: number;
}

export function DonateSheet({
  title,
  amount,
  onAmount,
  onMax,
  onSend,
  onClose,
  balance,
}: DonateSheetProps): React.ReactElement {
  return (
    <div
      className="absolute inset-0 z-50 flex items-end justify-center bg-slate-950/40 px-3 pb-4"
      onPointerDown={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="text-base font-black text-slate-900">{title}</div>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-black text-slate-500"
            onClick={onClose}
            aria-label="close"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="text-[11px] font-black text-slate-500">Amount:</span>
            <input
              className="min-w-0 flex-1 border-0 bg-transparent text-sm font-black text-slate-900 outline-none"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9.]/g, "");
                const parts = v.split(".");
                const cleaned = parts.length <= 2 ? v : parts[0] + "." + parts.slice(1).join("");
                onAmount(cleaned);
              }}
            />
            <button
              type="button"
              className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-black text-blue-700"
              onClick={onMax}
            >
              Max
            </button>
            <div className="flex items-center gap-2 border-l border-slate-200 pl-2">
              <div className="flex items-center justify-center rounded-full border border-blue-200 bg-blue-50 px-1.5 py-1">
                <UsdcLogo size={18} />
              </div>
              <div className="leading-tight">
                <div className="text-[10px] font-bold text-slate-500">Balance</div>
                <div className="text-xs font-black text-slate-900">
                  {balance.toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          <PrimaryBtn
            onClick={onSend}
            disabled={
              !amount ||
              !Number.isFinite(Number(amount)) ||
              Number(amount) <= 0 ||
              Number(amount) > balance
            }
            className="mt-1"
          >
            Send
          </PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

