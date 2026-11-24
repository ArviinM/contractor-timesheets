import fs from "node:fs";
import path from "node:path";
import { appNow } from "./clock";
import { isEmpty, openDatabase, type DB } from "./db";
import { seed } from "./seed";

export const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), "data", "app.db");

/**
 * The app's database (one shared connection). If the file is missing or empty,
 * it's created and seeded, so `npm run dev` works even if `db:reset` was skipped.
 */
export function getDb(): DB {
  const cache = globalThis as unknown as { __timesheetsDb?: DB };
  if (!cache.__timesheetsDb) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    const db = openDatabase(DB_PATH);
    if (isEmpty(db)) seed(db, appNow());
    cache.__timesheetsDb = db;
  }
  return cache.__timesheetsDb;
}
