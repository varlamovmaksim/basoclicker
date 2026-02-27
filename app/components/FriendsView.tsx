"use client";

import { IconBtn } from "./shared/IconBtn";
import { Card } from "./shared/Card";

export interface FriendsViewProps {
  referralLink: string;
  referrals: number;
  appliedReferralCode: string | null;
  referralCode: string;
  refCodeInput: string;
  setRefCodeInput: (v: string) => void;
  applyReferralCode: () => void;
  showToast: (text: string) => void;
}

export function FriendsView({
  referralLink,
  referrals,
  appliedReferralCode,
  referralCode,
  refCodeInput,
  setRefCodeInput,
  applyReferralCode,
  showToast,
}: FriendsViewProps): React.ReactElement {
  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(referralLink);
      showToast("Copied");
    } catch {
      showToast("Copy failed");
    }
  };

  return (
    <div className="space-y-3">
      <Card>
        <div className="space-y-2">
          <div className="text-sm font-black text-slate-900">
            <span className="text-emerald-600">+1,000</span> 🍩 per friend
          </div>
          <div className="text-xs font-semibold text-slate-500">
            Invite friends via your link. Each new friend gives you +1,000 🍩.
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-slate-900 px-3 py-3 text-center text-white">
            <div className="text-[11px] font-semibold text-slate-300">
              Total Friends
            </div>
            <div className="mt-2 text-3xl font-black tracking-tight">
              {referrals}
            </div>
          </div>
          <div className="rounded-2xl bg-slate-900 px-3 py-3 text-center text-white">
            <div className="text-[11px] font-semibold text-slate-300">
              Used code
            </div>
            <div className="mt-2 truncate text-lg font-black tracking-tight">
              {appliedReferralCode || "—"}
            </div>
          </div>
        </div>

        <button
          type="button"
          className="mt-3 w-full rounded-2xl bg-emerald-300 px-4 py-3 text-sm font-black text-emerald-950"
          onClick={(e) => {
            e.preventDefault();
            void handleCopy();
          }}
        >
          Invite a Friend
        </button>

        <div className="mt-3 flex items-center gap-2">
          <div className="min-w-0 flex-1 truncate rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-900">
            {referralLink}
          </div>
          <IconBtn onClick={() => void handleCopy()} ariaLabel="copy">
            ⧉
          </IconBtn>
        </div>
      </Card>

      <Card>
        <div className="text-sm font-black text-slate-900">Enter referral code</div>
        <div className="mt-1 text-xs font-semibold text-slate-500">
          If you joined from a friend, enter their code.
        </div>

        <div className="mt-3 flex items-center gap-2">
          <input
            className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm font-black text-slate-900 outline-none disabled:opacity-50"
            placeholder="Referral code"
            value={refCodeInput}
            onChange={(e) =>
              setRefCodeInput(
                e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16)
              )
            }
            disabled={!!appliedReferralCode}
          />
          <button
            type="button"
            className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-600 disabled:opacity-50"
            onClick={(e) => {
              e.preventDefault();
              setRefCodeInput("");
            }}
            disabled={!!appliedReferralCode || !refCodeInput}
            aria-label="clear"
          >
            Clear
          </button>
        </div>

        <button
          type="button"
          className="mt-3 w-full rounded-2xl bg-emerald-300 px-4 py-3 text-sm font-black text-emerald-950 disabled:opacity-50"
          disabled={!!appliedReferralCode || !refCodeInput}
          onClick={(e) => {
            e.preventDefault();
            applyReferralCode();
          }}
        >
          Submit
        </button>

        <div className="mt-2 text-[10px] font-semibold text-slate-500">
          Your code: <span className="font-black text-slate-900">{referralCode}</span>
        </div>
      </Card>
    </div>
  );
}

