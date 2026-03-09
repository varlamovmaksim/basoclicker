const ROOT_URL =
  process.env.NEXT_PUBLIC_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000');

/**
 * MiniApp configuration object. Must follow the Farcaster MiniApp specification.
 *
 * @see {@link https://miniapps.farcaster.xyz/docs/guides/publishing}
 */
export const farcasterConfig = {
  accountAssociation: {
    header: "",
    payload: "",
    signature: ""
  },
  miniapp: {
    version: "1",
    name: "Baso",
    subtitle: "Tap the screen and feed Baso",
    description: "Collect points and climb the leaderboard.",
    screenshotUrls: [`${ROOT_URL}/logo.png`],
    iconUrl: `${ROOT_URL}/favicon.png`,
    splashImageUrl: `${ROOT_URL}/logo.png`,
    splashBackgroundColor: "#000000",
    homeUrl: ROOT_URL,
    primaryCategory: "games",
    tags: ["tap", "points", "earn", "game", "clicker"],
    heroImageUrl: `${ROOT_URL}/logo.png`, 
    tagline: "Clicker game",
    ogTitle: "Baso",
    ogDescription: "Tap the screen and farm points to climb the leaderboard",
    ogImageUrl: `${ROOT_URL}/logo.png`,
  },
} as const;

