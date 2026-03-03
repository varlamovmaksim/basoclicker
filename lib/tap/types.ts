/** Request body for POST /api/v1/tap/commit */
export interface TapCommitRequest {
  session_id: string;
  seq: number;
  /** Manual taps only; mining is applied server-side from idle time. */
  taps_delta: number;
  duration_ms: number;
  client_balance_view?: number;
  client_ts_start?: number;
  client_ts_end?: number;
  device_info?: {
    platform?: string;
    model?: string;
    version?: string;
  };
}

/** Response for POST /api/v1/tap/commit (full state so client can resync without GET) */
export interface TapCommitResponse {
  ok: boolean;
  server_seq?: number;
  applied_taps?: number;
  mining_points_applied?: number;
  balance?: number;
  energy?: number;
  energy_max?: number;
  energy_regen_per_sec?: number;
  server_time?: number;
  resync_required?: boolean;
  points_multiplier?: number;
  mining_points_per_sec?: number;
  boosters?: BoosterListItem[];
  /** Full state for resync without GET /api/v1/tap/state */
  session_id?: string;
  last_seq?: number;
}

/** Response for GET /api/v1/tap/state */
export interface TapStateResponse {
  balance: number;
  last_seq: number;
  session_id: string;
  energy: number;
  energy_max: number;
  energy_regen_per_sec: number;
  server_time?: number;
  points_multiplier?: number;
  mining_points_per_sec?: number;
  boosters?: BoosterListItem[];
}

/** One booster in the list returned to client (with user's count and unlock state). */
export interface BoosterListItem {
  id: string;
  type: string;
  order_index: number;
  name: string;
  emoji: string;
  effect_amount: number;
  count: number;
  next_price: number;
  unlocked: boolean;
  unlock_after_previous: number;
  current_previous_count?: number;
  max_level: number;
  level_effect_coefficient?: number;
}

/** Client-side game state (batched, optimistic) */
export interface ClientGameState {
  clientBalance: number;
  localTapDelta: number;
  serverBalance: number;
  lastServerSeq: number;
  sessionId: string | null;
  lastCommitTime: number;
  commitIntervalMs: number;
  commitTapThreshold: number;
}

export type AbuseLevel = "none" | "low" | "medium" | "high";
