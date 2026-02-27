"use client";

export interface NavRowProps {
  tab: "home" | "friends" | "rating" | "shop" | "dev";
  setTab: (tab: "home" | "friends" | "rating" | "shop" | "dev") => void;
}

const IS_DEV = process.env.NEXT_PUBLIC_IS_DEV === "true";

export function NavRow({ tab, setTab }: NavRowProps): React.ReactElement {
  return (
    <div className="grid grid-cols-3 gap-2">
      <NavBtn
        label="Friends"
        icon="👥"
        active={tab === "friends"}
        onClick={() => setTab("friends")}
      />
      <NavBtn
        label="Leaderboard"
        icon="🏆"
        active={tab === "rating"}
        onClick={() => setTab("rating")}
      />
      <NavBtn
        label="Shop"
        icon="🛍️"
        active={tab === "shop"}
        onClick={() => setTab("shop")}
      />
      {IS_DEV && (
        <NavBtn
          label="Dev"
          icon="⚙️"
          active={tab === "dev"}
          onClick={() => setTab("dev")}
        />
      )}
    </div>
  );
}

interface NavBtnProps {
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
}

function NavBtn({ label, icon, active, onClick }: NavBtnProps): React.ReactElement {
  return (
    <button
      type="button"
      className={`flex flex-col items-center justify-center rounded-2xl border px-3 py-3 text-xs font-black ${
        active
          ? "border-blue-400 bg-blue-50 text-blue-700"
          : "border-slate-200 bg-slate-50 text-slate-500"
      }`}
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
    >
      <div className="text-lg" aria-hidden>
        {icon}
      </div>
      <div className="mt-1 text-[11px]">{label}</div>
    </button>
  );
}

