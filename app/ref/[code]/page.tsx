"use client";

import { HomeView } from "@/app/components/HomeView";

/** Base App referral route: /ref/[code] — renders main app; useTapGame reads ref from pathname. */
export default function RefPage(): React.ReactElement {
  return <HomeView />;
}
