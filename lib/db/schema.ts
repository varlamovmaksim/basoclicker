import {
  bigint,
  decimal,
  integer,
  pgEnum,
  pgTable,
  serial,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const abuseLevelEnum = pgEnum("abuse_level", [
  "none",
  "low",
  "medium",
  "high",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  fid: varchar("fid", { length: 64 }).notNull().unique(),
  balance: bigint("balance", { mode: "number" }).notNull().default(0),
  energy: bigint("energy", { mode: "number" }).notNull().default(1000),
  lastEnergyAt: timestamp("last_energy_at", { withTimezone: true }),
  lastCommitAt: timestamp("last_commit_at", { withTimezone: true }),
  lastSeq: bigint("last_seq", { mode: "number" }).notNull().default(0),
  avgTps: bigint("avg_tps", { mode: "number" }),
  pointsBoosterLevel: integer("points_booster_level").notNull().default(0),
  energyMaxBoosterLevel: integer("energy_max_booster_level").notNull().default(0),
  energyRegenBoosterLevel: integer("energy_regen_booster_level").notNull().default(0),
  autoTapsBoosterLevel: integer("auto_taps_booster_level").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deviceFingerprint: varchar("device_fingerprint", { length: 128 }),
  commitCount: bigint("commit_count", { mode: "number" }).notNull().default(0),
});

export const tapCommits = pgTable("tap_commits", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  sessionId: uuid("session_id").notNull(),
  seq: bigint("seq", { mode: "number" }).notNull(),
  requestedTaps: bigint("requested_taps", { mode: "number" }).notNull(),
  appliedTaps: bigint("applied_taps", { mode: "number" }).notNull(),
  maxAllowed: bigint("max_allowed", { mode: "number" }).notNull(),
  ratio: decimal("ratio", { precision: 10, scale: 4 }),
  abuseLevel: abuseLevelEnum("abuse_level"),
  serverTime: timestamp("server_time", { withTimezone: true }).notNull(),
  clientDurationMs: bigint("client_duration_ms", { mode: "number" }),
});
