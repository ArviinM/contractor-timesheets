/** Small, fixed fixtures for the tests (separate from the seed data, which moves with today's date). */
import { loadActor, type Actor } from "../src/server/actor";
import { openDatabase, type DB } from "../src/server/db";
import { createEntry } from "../src/server/entries";

/** Mon 30 Nov 2026, 07:00 in Jakarta. Everything in the week of 23 Nov is in the past. */
export const NOW = new Date("2026-11-30T00:00:00Z");

export const ENG = {
  ayuNorthwind: 1, // $33.33/h
  ayuBluefin: 2, // $30.00/h
  budiBluefin: 3, // $25.00/h
  nickNorthwind: 4, // $10.00/h, contractor in New York (daylight-saving tests)
} as const;

export type Fixture = {
  db: DB;
  ayu: Actor; // contractor, Jakarta, works for Northwind and Bluefin
  budi: Actor; // contractor, Jakarta, works for Bluefin only
  nick: Actor; // contractor, New York
  northwind: Actor; // client, New York
  bluefin: Actor; // client, London
};

export function setup(): Fixture {
  const db = openDatabase(":memory:");
  db.exec(`
    INSERT INTO users (id, name, role, time_zone) VALUES
      (1, 'Ayu',       'contractor', 'Asia/Jakarta'),
      (2, 'Budi',      'contractor', 'Asia/Jakarta'),
      (3, 'Nick',      'contractor', 'America/New_York'),
      (4, 'Northwind', 'client',     'America/New_York'),
      (5, 'Bluefin',   'client',     'Europe/London');
    INSERT INTO engagements (id, contractor_id, client_id, hourly_rate_cents) VALUES
      (1, 1, 4, 3333),
      (2, 1, 5, 3000),
      (3, 2, 5, 2500),
      (4, 3, 4, 1000);
  `);
  const actor = (id: number) => loadActor(db, id) as Actor;
  return { db, ayu: actor(1), budi: actor(2), nick: actor(3), northwind: actor(4), bluefin: actor(5) };
}

/** Logs an entry with wall-clock times in the contractor's zone. */
export function log(
  f: Fixture,
  who: Actor,
  engagementId: number,
  start: string,
  end: string,
  note = "",
): number {
  return createEntry(f.db, who, { engagementId, start, end, note }, NOW);
}

export function entryCount(db: DB): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM time_entries").get() as { n: number }).n;
}
