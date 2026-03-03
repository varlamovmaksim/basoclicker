"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTapGame } from "./useTapGame";
import type { BasoShopTab, BasoTabKey, BasoPersisted } from "../../lib/baso/types";
import { DONUT_CYCLE, SKINS, STORAGE_KEY_BASO } from "../../lib/baso/constants";
import { buildLeaderboard } from "../../lib/baso/leaderboard";
import { msToHHMM, safeParse, timeToMidnightMs, todayKeyLocal, uid } from "../../lib/baso/utils";
import { pickNextDonutColor } from "../../lib/baso/donut";

export interface Pop {
  id: string;
  x: number;
  y: number;
  text: string;
}

export interface UseBasoGameReturn {
  tab: BasoTabKey;
  setTab: (tab: BasoTabKey) => void;
  shopTab: BasoShopTab;
  setShopTab: (tab: BasoShopTab) => void;

  score: number;
  displayEnergy: number;

  donutProgress: number;
  eatTick: number;

  gmAvailable: boolean;
  dailyTimeLeft: string;
  doGM: () => Promise<void>;

  referralLink: string;
  referrals: number;
  appliedReferralCode: string | null;
  referralCode: string;
  refCodeInput: string;
  setRefCodeInput: (v: string) => void;
  applyReferralCode: () => void;

  skinStageClass: string;
  setSkin: (id: string) => void;

  donateOpen: boolean;
  donateAmount: string;
  usdcBalance: number;
  openDonate: () => void;
  openDonatePreset: (amount: number) => void;
  closeDonate: () => void;
  setDonateAmount: (v: string) => void;
  setMaxDonate: () => void;
  sendDonate: () => Promise<void>;

  pops: Pop[];
  addPop: (clientX: number, clientY: number, bounds: DOMRect, text: string) => void;

  toast: string | null;
  showToast: (text: string) => void;

  onTap: (e: React.PointerEvent<HTMLButtonElement>) => void;

  leaderboard: ReturnType<typeof buildLeaderboard>;

  // from useTapGame
  tapState: ReturnType<typeof useTapGame>["state"];
  debug: ReturnType<typeof useTapGame>["debug"];
  refreshState: () => Promise<void>;
  donutColor: string;
}

function loadPersisted(): BasoPersisted | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY_BASO);
  const parsed = safeParse<BasoPersisted>(raw);
  if (!parsed) return null;
  return {
    skinId: parsed.skinId || "white",
    lastGMDay: parsed.lastGMDay ?? null,
    referralCode:
      parsed.referralCode && parsed.referralCode.length >= 4
        ? parsed.referralCode
        : "BASO" + Math.random().toString(36).slice(2, 7).toUpperCase(),
    referrals: parsed.referrals ?? 0,
    appliedReferralCode: parsed.appliedReferralCode ?? null,
  };
}

function savePersisted(data: BasoPersisted): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY_BASO, JSON.stringify(data));
  } catch {
    // ignore quota / private mode
  }
}

export function useBasoGame(): UseBasoGameReturn {
  const { state, handleTap, score, displayEnergy, debug, refreshState } = useTapGame();

  const [tab, setTab] = useState<BasoTabKey>("home");
  const [shopTab, setShopTab] = useState<BasoShopTab>("earn");

  const persisted = useMemo(() => loadPersisted(), []);
  const [skinId, setSkinId] = useState<string>(persisted?.skinId ?? "white");
  const [lastGMDay, setLastGMDay] = useState<string | null>(persisted?.lastGMDay ?? null);
  const [referralCode, _setReferralCode] = useState<string>(
    persisted?.referralCode ??
      ("BASO" + (typeof window !== "undefined" ? Math.random().toString(36).slice(2, 7).toUpperCase() : "XXXXX"))
  );
  const [referrals, setReferrals] = useState<number>(persisted?.referrals ?? 0);
  const [appliedReferralCode, setAppliedReferralCode] = useState<string | null>(
    persisted?.appliedReferralCode ?? null
  );

  useEffect(() => {
    const data: BasoPersisted = {
      skinId,
      lastGMDay,
      referralCode,
      referrals,
      appliedReferralCode,
    };
    savePersisted(data);
  }, [skinId, lastGMDay, referralCode, referrals, appliedReferralCode]);

  useEffect(() => {
    if (tab === "shop") setShopTab("earn");
  }, [tab]);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current != null && typeof window !== "undefined") {
      window.clearTimeout(toastTimerRef.current);
    }
    if (typeof window !== "undefined") {
      toastTimerRef.current = window.setTimeout(() => {
        setToast(null);
      }, 1400);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current != null && typeof window !== "undefined") {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const [donut, setDonut] = useState<{ bites: number; cycle: number }>({
    bites: 0,
    cycle: DONUT_CYCLE,
  });
  const [donutColor, setDonutColor] = useState<string>(() => pickNextDonutColor(null));
  const donutResetTimerRef = useRef<number | null>(null);
  const [eatTick, setEatTick] = useState(0);

  useEffect(() => {
    return () => {
      if (donutResetTimerRef.current != null && typeof window !== "undefined") {
        window.clearTimeout(donutResetTimerRef.current);
      }
    };
  }, []);

  const [pops, setPops] = useState<Pop[]>([]);

  const addPop = useCallback(
    (clientX: number, clientY: number, bounds: DOMRect, text: string) => {
      const x = clientX - bounds.left;
      const y = clientY - bounds.top;
      const id = uid();
      setPops((prev) => [...prev, { id, x, y, text }]);
      if (typeof window !== "undefined") {
        window.setTimeout(() => {
          setPops((prev) => prev.filter((p) => p.id !== id));
        }, 240);
      }
    },
    []
  );

  const today = todayKeyLocal();
  const gmAvailable = lastGMDay !== today;
  const dailyTimeLeft = gmAvailable ? msToHHMM(timeToMidnightMs()) : "";

  const doGM = useCallback(async () => {
    if (!gmAvailable) {
      showToast("GM already claimed");
      return;
    }
    showToast("Sending GM…");
    await new Promise((r) => setTimeout(r, 900));
    setLastGMDay(today);
    showToast("GM success (mock)");
  }, [gmAvailable, showToast, today]);

  const referralLink = useMemo(
    () => `https://base.app/miniapp/baso?ref=${referralCode}`,
    [referralCode]
  );

  const [refCodeInput, setRefCodeInput] = useState("");

  const applyReferralCode = useCallback(() => {
    if (appliedReferralCode) {
      showToast("Code already applied");
      return;
    }
    if (!refCodeInput) {
      showToast("Enter a code");
      return;
    }
    if (refCodeInput === referralCode) {
      showToast("Can't use your own code");
      return;
    }
    setAppliedReferralCode(refCodeInput);
    setReferrals((v) => v + 1_000);
    showToast("Referral code applied (mock)");
  }, [appliedReferralCode, refCodeInput, referralCode, showToast]);

  const skin = useMemo(
    () => SKINS.find((x) => x.id === skinId) ?? SKINS[0],
    [skinId]
  );

  const setSkin = useCallback(
    (id: string) => {
      setSkinId(id);
      showToast("Skin applied");
    },
    [showToast]
  );

  const [donateOpen, setDonateOpen] = useState(false);
  const [donateAmount, setDonateAmount] = useState<string>("");
  const [usdcBalance] = useState<number>(23.41);

  const openDonate = useCallback(() => {
    setDonateAmount("");
    setDonateOpen(true);
  }, []);

  const openDonatePreset = useCallback((amount: number) => {
    setDonateAmount(amount.toFixed(2));
    setDonateOpen(true);
  }, []);

  const closeDonate = useCallback(() => {
    setDonateOpen(false);
  }, []);

  const setMaxDonate = useCallback(() => {
    setDonateAmount(usdcBalance.toFixed(2));
  }, [usdcBalance]);

  const sendDonate = useCallback(async () => {
    const amt = Number(donateAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      showToast("Enter amount");
      return;
    }
    if (amt > usdcBalance) {
      showToast("Insufficient USDC");
      return;
    }
    showToast("Sending USDC… (mock)");
    await new Promise((r) => setTimeout(r, 900));
    showToast("Donation sent (mock)");
    setDonateOpen(false);
  }, [donateAmount, usdcBalance, showToast]);

  const onTap = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (displayEnergy <= 0) {
        showToast("No energy");
        return;
      }

      handleTap();

      setEatTick((t) => t + 1);

      setDonut((prev) => {
        const nextBites = Math.min(prev.cycle, prev.bites + 1);
        if (nextBites >= prev.cycle) {
          if (donutResetTimerRef.current == null && typeof window !== "undefined") {
            donutResetTimerRef.current = window.setTimeout(() => {
              setDonut({ bites: 0, cycle: DONUT_CYCLE });
              setDonutColor((c) => pickNextDonutColor(c));
              donutResetTimerRef.current = null;
            }, 180);
          }
          return { ...prev, bites: prev.cycle };
        }
        return { ...prev, bites: nextBites };
      });
    },
    [displayEnergy, handleTap, showToast]
  );

  const donutProgress = useMemo(
    () => (donut.cycle > 0 ? donut.bites / donut.cycle : 0),
    [donut]
  );

  const leaderboard = useMemo(
    () => buildLeaderboard(score),
    [score]
  );

  return {
    tab,
    setTab,
    shopTab,
    setShopTab,

    score,
    displayEnergy,

    donutProgress,
    eatTick,
    // color of current donut frosting
    donutColor,

    gmAvailable,
    dailyTimeLeft,
    doGM,

    referralLink,
    referrals,
    appliedReferralCode,
    referralCode,
    refCodeInput,
    setRefCodeInput,
    applyReferralCode,

    skinStageClass: skin.stageClass,
    setSkin,

    donateOpen,
    donateAmount,
    usdcBalance,
    openDonate,
    openDonatePreset,
    closeDonate,
    setDonateAmount,
    setMaxDonate,
    sendDonate,

    pops,
    addPop,

    toast,
    showToast,

    onTap,

    leaderboard,

    tapState: state,
    debug,
    refreshState,
  };
}

