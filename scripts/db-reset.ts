/** npm run db:reset — deletes the local database and loads fresh seed data. */
import fs from "node:fs";
import path from "node:path";
import { appNow } from "../src/server/clock";
import { openDatabase } from "../src/server/db";
import { seed, SEED_USERS } from "../src/server/seed";

const file = process.env.DB_PATH ?? path.join(process.cwd(), "data", "app.db");
fs.mkdirSync(path.dirname(file), { recursive: true });
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(file + suffix, { force: true });

const db = openDatabase(file);
seed(db, appNow());
const count = (table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
console.log(`Database ready: ${path.relative(process.cwd(), file)}`);
console.log(`  ${count("users")} users, ${count("time_entries")} entries, ${count("weeks")} submitted weeks`);
console.log(`  Sign in as: ${SEED_USERS.map((u) => u.name).join(", ")}`);
db.close();
