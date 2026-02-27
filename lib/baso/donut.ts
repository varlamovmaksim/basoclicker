export const DONUT_FROST_COLORS = [
  "#22C55E", // green
  "#FACC15", // yellow
  "#FFFFFF", // white
  "#8B5A2B", // brown
  "#FB923C", // orange
  "#EF4444", // red
] as const;

export function pickNextDonutColor(prev: string | null): string {
  const pool = prev ? DONUT_FROST_COLORS.filter((c) => c !== prev) : [...DONUT_FROST_COLORS];
  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx] as string;
}

