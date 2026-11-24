import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export type DB = Database.Database;

const SCHEMA_PATH = path.join(process.cwd(), "src", "server", "schema.sql");

/** Opens a database and makes sure the tables exist. ':memory:' is used by the tests. */
export function openDatabase(file: string = ":memory:"): DB {
  const db = new Database(file);
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  if (file !== ":memory:") db.pragma("journal_mode = WAL");
  db.exec(fs.readFileSync(SCHEMA_PATH, "utf8"));
  return db;
}

export function isEmpty(db: DB): boolean {
  const row = db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
  return row.n === 0;
}
