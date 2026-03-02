"use client";

import { useRef } from "react";
import { useBasoGame } from "../hooks/useBasoGame";
import { clamp, formatCompact } from "../../lib/baso/utils";
import { BasoMascotSVG } from "@/app/components/BasoMascotSVG";
import { TopHeader } from "@/app/components/TopHeader";
import { SubPageShell } from "@/app/components/SubPageShell";
import { DonateSheet } from "@/app/components/DonateSheet";
import { Card } from "@/app/components/shared/Card";
import { ProgressBar } from "@/app/components/shared/ProgressBar";
import { Toast } from "@/app/components/shared/Toast";
import { NavRow } from "@/app/components/NavRow";
import { LeaderboardView } from "@/app/components/LeaderboardView";
import { FriendsView } from "@/app/components/FriendsView";
import { ShopView } from "@/app/components/ShopView";
import { DevView } from "@/app/components/DevView";
import { DevTapPanel } from "@/app/components/DevTapPanel";

const IS_DEV = process.env.NEXT_PUBLIC_IS_DEV === "true";

export function HomeView(): React.ReactElement {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const game = useBasoGame();

  const overlayOpen = game.tab !== "home";
  const overlayTitle =
    game.tab === "shop"
      ? "Shop"
      : game.tab === "rating"
        ? "Leaderboard"
        : game.tab === "friends"
          ? "Friends"
          : game.tab === "dev"
            ? "Dev"
            : "";

  return (
    <div className="baso-wrap">
      <div className="baso-phone">
        {game.tab === "home" && (
          <>
            <TopHeader
              onOpenDailyGM={game.doGM}
              dailyStatus={game.gmAvailable ? "Available" : "Done"}
              dailyTimeLeft={game.dailyTimeLeft}
              onDonateHalf={() => game.openDonatePreset(0.5)}
            />

            <div className="mt-5 text-center">
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  className="text-xl leading-none"
                  onClick={(e) => {
                    e.preventDefault();
                    game.openDonate();
                  }}
                  aria-label="donate-usdc"
                >
                  🍩
                </button>
                <div className="text-[54px] font-black tracking-tight text-slate-900 leading-none">
                  {formatCompact(game.score)}
                </div>
              </div>
            </div>

            <div className="mt-3">
              <div
                ref={stageRef}
                className={`relative overflow-hidden rounded-[22px] border border-slate-200 bg-white flex min-h-[340px] justify-center items-center shadow-sm ${game.skinStageClass}`}
              >
                <button
                  type="button"
                  className="absolute inset-0 w-full h-full border-0 bg-transparent p-0 touch-manipulation cursor-pointer flex items-center justify-center"
                  onPointerDown={(e) => {
                    game.onTap(e);
                    const el = stageRef.current;
                    if (!el) return;
                    const rect = el.getBoundingClientRect();
                    const tapVal = Math.max(1, Math.floor(game.tapState.pointsMultiplier));
                    game.addPop(e.clientX, e.clientY, rect, `+${tapVal}`);
                  }}
                  aria-label="tap-baso"
                >
                  <BasoMascotSVG
                    eatTick={game.eatTick}
                    donutProgress={game.donutProgress}
                    frostColor={game.donutColor}
                  />
                </button>

                {game.pops.map((p) => (
                  <div
                    key={p.id}
                    className="pop"
                    style={{ left: p.x, top: p.y }}
                  >
                    {p.text}
                  </div>
                ))}

                {game.displayEnergy <= 0 && (
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-slate-200 bg-slate-100/90 px-3 py-1.5 text-xs font-extrabold text-slate-700">
                    Out of energy
                  </div>
                )}
              </div>

              <Card className="mt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg" aria-hidden>⚡</span>
                    <span className="font-black text-slate-900">Energy</span>
                  </div>
                  <div className="font-black text-slate-900">
                    {Math.floor(game.displayEnergy).toLocaleString("en-US")}
                    <span className="ml-1 font-extrabold text-slate-500">
                      (+{game.tapState.energyRegenPerMin.toFixed(1)})
                    </span>
                    {" / "}
                    {game.tapState.energyMax.toLocaleString("en-US")}
                  </div>
                </div>
                <ProgressBar pct={clamp(game.displayEnergy / Math.max(1, game.tapState.energyMax), 0, 1)} />

                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span aria-hidden>👆</span>
                    <span className="font-black text-slate-900">Tap</span>
                  </div>
                  <div className="font-black text-slate-900">
                    +{Math.max(1, Math.floor(game.tapState.pointsMultiplier))}
                    <span className="ml-1 font-extrabold text-slate-500">/ tap</span>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span aria-hidden>⏱️</span>
                    <span className="font-black text-slate-900">Auto</span>
                  </div>
                  <div className="font-black text-slate-900">
                    +{Math.floor(game.tapState.autoTapsPerMin / 60)}
                    <span className="ml-1 font-extrabold text-slate-500">/ sec</span>
                  </div>
                </div>
              </Card>
            </div>

            <div className="mt-3 mb-4">
              <NavRow tab={game.tab} setTab={game.setTab} />
            </div>
          </>
        )}

        {overlayOpen && (
          <SubPageShell title={overlayTitle} onClose={() => game.setTab("home")}>
            {game.tab === "rating" && (
              <LeaderboardView
                leaderboard={game.leaderboard}
                score={game.score}
              />
            )}
            {game.tab === "friends" && (
              <FriendsView
                referralLink={game.referralLink}
                referrals={game.referrals}
                appliedReferralCode={game.appliedReferralCode}
                referralCode={game.referralCode}
                refCodeInput={game.refCodeInput}
                setRefCodeInput={game.setRefCodeInput}
                applyReferralCode={game.applyReferralCode}
                showToast={game.showToast}
              />
            )}
            {game.tab === "shop" && (
              <ShopView
                shopTab={game.shopTab}
                setShopTab={game.setShopTab}
                state={game.tapState}
                score={game.score}
                refreshState={game.refreshState}
                skinStageClass={game.skinStageClass}
                setSkin={game.setSkin}
              />
            )}
            {game.tab === "dev" && IS_DEV && (
              <DevView
                state={game.tapState}
                score={game.score}
                displayEnergy={game.displayEnergy}
                debug={game.debug}
                refreshState={game.refreshState}
              />
            )}
          </SubPageShell>
        )}

        {game.donateOpen && (
          <DonateSheet
            title="Donut some USDC"
            amount={game.donateAmount}
            onAmount={game.setDonateAmount}
            onClose={game.closeDonate}
            onMax={game.setMaxDonate}
            onSend={game.sendDonate}
            balance={game.usdcBalance}
          />
        )}
      </div>

      {game.toast && <Toast text={game.toast} />}

      {IS_DEV && game.debug && (
        <DevTapPanel
          state={game.tapState}
          score={game.score}
          displayEnergy={game.displayEnergy}
          debug={game.debug}
          showBoosters={false}
        />
      )}
    </div>
  );
}
