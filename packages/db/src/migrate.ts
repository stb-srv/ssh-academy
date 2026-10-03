// Führt alle ausstehenden Datenbank-Migrationen aus.
// Aufruf: node packages/db/src/migrate.ts (Node >= 22.18 führt TypeScript direkt aus)
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { fileURLToPath } from "node:url";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL ist nicht gesetzt");

const client = postgres(url, { max: 1, onnotice: () => {} });
const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));

await migrate(drizzle(client), { migrationsFolder });
await client.end();
console.log("Migrationen ausgeführt.");
