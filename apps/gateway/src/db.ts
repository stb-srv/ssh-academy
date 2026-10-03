import { createDb } from "@ssh-academy/db";
import { config } from "./config";

export const db = createDb(config.databaseUrl);
