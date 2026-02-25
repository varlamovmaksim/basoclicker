/** Request body for POST /api/v1/tap/commit */
export interface TapCommitRequest {
  session_id: string;
  seq: number;
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
  balance?: number;
  server_time?: number;
  resync_required?: boolean;
  /** Full state for resync without GET /api/v1/tap/state */
  session_id?: string;
  last_seq?: number;
}

/** Response for GET /api/v1/tap/state */
export interface TapStateResponse {
  balance: number;
  last_seq: number;
  session_id: string;
  server_time?: number;
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
