import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

export type Database = ReturnType<typeof createDb>;

export function createDb(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL ist nicht gesetzt");
  const client = postgres(url, { max: 10 });
  return drizzle(client, { schema });
}

export { schema };
export * from "drizzle-orm";
