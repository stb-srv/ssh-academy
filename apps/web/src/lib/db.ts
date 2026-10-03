import "server-only";
import { createDb, type Database } from "@ssh-academy/db";
import { env } from "./env";

const globalForDb = globalThis as unknown as { db?: Database };

// Im Dev-Modus überlebt die Verbindung Hot-Reloads.
export const db = globalForDb.db ?? createDb(env.DATABASE_URL);
if (env.NODE_ENV !== "production") globalForDb.db = db;
