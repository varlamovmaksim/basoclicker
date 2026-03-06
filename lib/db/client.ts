import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

let _db: ReturnType<typeof drizzle> | null = null;

function getDb(): ReturnType<typeof drizzle> {
  if (!_db) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    const client = postgres(connectionString, {
      max: 10,
      idle_timeout: 20,
      max_lifetime: 60 * 30,
    });
    _db = drizzle(client);
  }
  return _db;
}

/** Lazy-initialized so build can succeed without DATABASE_URL. */
export const db = new Proxy(
  {} as ReturnType<typeof drizzle>,
  {
    get(_, prop) {
      return (getDb() as unknown as Record<string, unknown>)[prop as string];
    },
  }
) as ReturnType<typeof drizzle>;
