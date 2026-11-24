/**
 * Randomised tests for the entry and week rules, in several time zones.
 *
 * Thousands of random operations (add, edit, delete, submit, approve, reject, and attempts by the
 * wrong user) run against the real services AND a tiny separate model of the rules. The model
 * works on UTC instants and uses the platform's own Intl time zone data (not Luxon, which the app
 * uses), so the two are independent. After every step:
 *   1. the service and the model agree on whether the operation was accepted or refused;
 *   2. the database holds exactly the entries and week statuses the model expects;
 *   3. the invariants hold in the database itself: no contractor has two overlapping entries,
 *      no contractor has more than 12:00 on one work date, and minutes / work date / week are right.
 * The contractors are put in each zone below, including two weeks around a clock change.
 * The random generator is seeded, so a failure names the zone, seed and step, and replays exactly.
 */
import { describe, expect, it } from "vitest";
import { loadActor, type Actor } from "../src/server/actor";
import { createEntry, deleteEntry, updateEntry } from "../src/server/entries";
import { ForbiddenError, ValidationError } from "../src/server/errors";
import { approveWeek, rejectWeek, submitWeek } from "../src/server/weeks";
import { ENG, setup, type Fixture } from "./fixtures";

const ZONES = [
  { zone: "Asia/Jakarta", firstMonday: "2026-11-16", note: "UTC+7, no daylight saving" },
  { zone: "America/New_York", firstMonday: "2026-10-26", note: "clocks go back 1 Nov 2026 (01:00-02:00 twice)" },
  { zone: "Europe/London", firstMonday: "2026-10-19", note: "clocks go back 25 Oct 2026" },
  { zone: "Asia/Kolkata", firstMonday: "2026-11-16", note: "UTC+5:30, a half-hour offset" },
  { zone: "Australia/Lord_Howe", firstMonday: "2027-03-29", note: "clocks go back only 30 minutes, 4 Apr 2027" },
] as const;
const SEEDS_PER_ZONE = 4;
const STEPS = 300;

// ---------------------------------------------------------------- seeded random numbers

function random(seed: number) {
  let a = seed >>> 0; // mulberry32
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T,>(items: readonly T[]): T => items[Math.floor(next() * items.length)],
  };
}

// ---------------------------------------------------------------- the model's clock (Intl, not Luxon)

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

function wallClock(zone: string) {
  const format = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  /** UTC ms -> 'YYYY-MM-DDTHH:mm' on the wall clock in that zone. */
  const text = (ms: number) => {
    const p = Object.fromEntries(format.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  };
  /** The same wall time also happens 30 or 60 minutes earlier or later (clocks going back). */
  const repeated = (ms: number) =>
    [30, 60].some((m) => text(ms - m * MINUTE) === text(ms) || text(ms + m * MINUTE) === text(ms));
  return { text, repeated, date: (ms: number) => text(ms).slice(0, 10) };
}

const utcText = (ms: number) => new Date(ms).toISOString().slice(0, 19) + "Z";

function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - sinceMonday * DAY).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- the model

type ModelEntry = { id: number; contractorId: number; engagementId: number; start: number; end: number };
type Status = "submitted" | "approved" | "rejected";

const CLIENT_OF: Record<number, "northwind" | "bluefin"> = {
  [ENG.ayuNorthwind]: "northwind",
  [ENG.ayuBluefin]: "bluefin",
  [ENG.budiBluefin]: "bluefin",
};
const ENGAGEMENTS_OF = { ayu: [ENG.ayuNorthwind, ENG.ayuBluefin], budi: [ENG.budiBluefin] } as const;

class Model {
  entries = new Map<number, ModelEntry>();
  weeks = new Map<string, Status>(); // `${engagementId}|${monday}`

  constructor(
    private clock: ReturnType<typeof wallClock>,
    private now: number,
  ) {}

  workDate = (e: { start: number }) => this.clock.date(e.start);
  weekOf = (e: { start: number }) => mondayOf(this.workDate(e));

  status(engagementId: number, monday: string): Status | "draft" {
    return this.weeks.get(`${engagementId}|${monday}`) ?? "draft";
  }

  locked(engagementId: number, start: number): boolean {
    const s = this.status(engagementId, this.weekOf({ start }));
    return s === "submitted" || s === "approved";
  }

  /** Would this entry be accepted? `ignoreId` = the entry being edited. */
  allows(contractorId: number, engagementId: number, start: number, end: number, ignoreId: number | null): boolean {
    if (this.clock.repeated(start) || this.clock.repeated(end)) return false;
    if (end <= start) return false;
    if (end > this.now) return false;
    if (this.locked(engagementId, start)) return false;
    const mine = [...this.entries.values()].filter((e) => e.contractorId === contractorId && e.id !== ignoreId);
    if (mine.some((e) => e.start < end && e.end > start)) return false;
    const day = this.workDate({ start });
    const sameDay = mine.filter((e) => this.workDate(e) === day).reduce((sum, e) => sum + (e.end - e.start), 0);
    return (sameDay + (end - start)) / MINUTE <= 12 * 60;
  }
}

// ---------------------------------------------------------------- one random run

type Outcome = "accepted" | "refused" | "forbidden";

function attempt(work: () => void): { outcome: Outcome; message: string } {
  try {
    work();
    return { outcome: "accepted", message: "" };
  } catch (error) {
    if (error instanceof ForbiddenError) return { outcome: "forbidden", message: error.message };
    if (error instanceof ValidationError) return { outcome: "refused", message: error.message };
    throw error; // anything else is a bug
  }
}

const seen = { accepted: 0, overlap: 0, cap: 0, locked: 0, future: 0, empty: 0, repeatedHour: 0, forbidden: 0 };

function count(got: { outcome: Outcome; message: string }) {
  if (got.outcome === "accepted") seen.accepted++;
  else if (got.outcome === "forbidden") seen.forbidden++;
  else if (/Overlaps/.test(got.message)) seen.overlap++;
  else if (/limit is 12:00/.test(got.message)) seen.cap++;
  else if (/locked|already/.test(got.message)) seen.locked++;
  else if (/future/.test(got.message)) seen.future++;
  else if (/at least one entry/.test(got.message)) seen.empty++;
  else if (/happens twice/.test(got.message)) seen.repeatedHour++;
}

function runOnce(zone: string, firstMonday: string, seed: number) {
  const r = random(seed);
  const f: Fixture = setup();
  f.db.prepare("UPDATE users SET time_zone = ? WHERE role = 'contractor'").run(zone);
  const actor = (id: number) => loadActor(f.db, id) as Actor;
  const people = { ayu: actor(f.ayu.id), budi: actor(f.budi.id), northwind: f.northwind, bluefin: f.bluefin };

  const windowStart = Date.parse(`${firstMonday}T00:00:00Z`);
  const now = windowStart + 14 * DAY; // the last entries of the window can end "in the future"
  const clock = wallClock(zone);
  const model = new Model(clock, now);
  const local = clock.text;

  /** How far the zone's wall clock is ahead of UTC at this instant (ms). */
  const offsetAt = (ms: number) => Date.parse(`${local(ms)}:00Z`) - ms;

  const randomSlot = () => {
    // Two weeks; mostly on a 15-minute grid so entries collide often. One in five starts between
    // 22:00 and 04:00 local time, where midnight crossings and clock changes happen.
    let start: number;
    if (r.next() < 0.2) {
      const utcMidnight = Date.parse(`${clock.date(windowStart + r.int(0, 13) * DAY)}T00:00:00Z`);
      start = utcMidnight - offsetAt(utcMidnight) + r.int(-8, 16) * 15 * MINUTE;
    } else {
      start = windowStart + (r.next() < 0.8 ? r.int(0, 14 * 96 - 1) * 15 : r.int(0, 14 * 1440 - 1)) * MINUTE;
    }
    const length = r.next() < 0.7 ? r.int(1, 16) * 15 : r.int(1, 800);
    return { start, end: start + length * MINUTE };
  };

  for (let step = 0; step < STEPS; step++) {
    const where = `${zone}, seed ${seed}, step ${step}`;
    const roll = r.next();
    const who = r.pick(["ayu", "budi"] as const);
    const me: Actor = people[who];

    if (roll < 0.5) {
      // Add an entry.
      const engagementId = r.pick(ENGAGEMENTS_OF[who]);
      const { start, end } = randomSlot();
      const expected = model.allows(me.id, engagementId, start, end, null);
      let id = 0;
      const got = attempt(() => {
        id = createEntry(f.db, me, { engagementId, start: local(start), end: local(end) }, new Date(now));
      });
      expect(got.outcome, `${where}: add ${local(start)}..${local(end)} ${got.message}`).toBe(
        expected ? "accepted" : "refused",
      );
      if (got.outcome === "accepted") model.entries.set(id, { id, contractorId: me.id, engagementId, start, end });
      count(got);
    } else if (roll < 0.68) {
      // Edit one of their entries: a new time, sometimes the other client.
      const mine = [...model.entries.values()].filter((e) => e.contractorId === me.id);
      if (mine.length === 0) continue;
      const entry = r.pick(mine);
      const engagementId = r.next() < 0.3 ? r.pick(ENGAGEMENTS_OF[who]) : entry.engagementId;
      const { start, end } =
        r.next() < 0.5 ? randomSlot() : { start: entry.start, end: entry.end + r.int(-2, 4) * 15 * MINUTE };
      const expected =
        !model.locked(entry.engagementId, entry.start) && model.allows(me.id, engagementId, start, end, entry.id);
      const got = attempt(() =>
        updateEntry(f.db, me, entry.id, { engagementId, start: local(start), end: local(end) }, new Date(now)),
      );
      expect(got.outcome, `${where}: edit #${entry.id} to ${local(start)}..${local(end)} ${got.message}`).toBe(
        expected ? "accepted" : "refused",
      );
      if (got.outcome === "accepted") model.entries.set(entry.id, { ...entry, engagementId, start, end });
      count(got);
    } else if (roll < 0.78) {
      // Delete one of their entries.
      const mine = [...model.entries.values()].filter((e) => e.contractorId === me.id);
      if (mine.length === 0) continue;
      const entry = r.pick(mine);
      const expected = !model.locked(entry.engagementId, entry.start);
      const got = attempt(() => deleteEntry(f.db, me, entry.id));
      expect(got.outcome, `${where}: delete #${entry.id} ${got.message}`).toBe(expected ? "accepted" : "refused");
      if (got.outcome === "accepted") model.entries.delete(entry.id);
      count(got);
    } else if (roll < 0.83) {
      // Submit one of their weeks (one that has entries, or sometimes an empty one).
      const engagementId = r.pick(ENGAGEMENTS_OF[who]);
      const mondays = [...new Set([...model.entries.values()].map(model.weekOf)), mondayOf(firstMonday)];
      const monday = r.pick(mondays);
      const hasEntries = [...model.entries.values()].some(
        (e) => e.engagementId === engagementId && model.weekOf(e) === monday,
      );
      const status = model.status(engagementId, monday);
      const expected = hasEntries && (status === "draft" || status === "rejected");
      const got = attempt(() => submitWeek(f.db, me, { engagementId, weekStart: monday }, new Date(now)));
      expect(got.outcome, `${where}: submit ${engagementId}|${monday} ${got.message}`).toBe(
        expected ? "accepted" : "refused",
      );
      if (got.outcome === "accepted") model.weeks.set(`${engagementId}|${monday}`, "submitted");
      count(got);
    } else if (roll < 0.95) {
      // The right client approves or rejects a submitted week.
      const waiting = [...model.weeks.entries()].filter(([, s]) => s === "submitted");
      if (waiting.length === 0) continue;
      const [key] = r.pick(waiting);
      const [engagementId, monday] = key.split("|");
      const weekId = weekIdOf(f, Number(engagementId), monday);
      const client = people[CLIENT_OF[Number(engagementId)]];
      const approve = r.next() < 0.25; // approval is final, so keep it rarer than rejection
      const got = attempt(() =>
        approve
          ? approveWeek(f.db, client, weekId, new Date(now))
          : rejectWeek(f.db, client, weekId, "Please check", new Date(now)),
      );
      expect(got.outcome, `${where}: decide ${key} ${got.message}`).toBe("accepted");
      model.weeks.set(key, approve ? "approved" : "rejected");
    } else {
      // The wrong user tries something: always "Not allowed", and nothing changes.
      const others = [...model.entries.values()].filter((e) => e.contractorId !== me.id);
      if (others.length > 0 && r.next() < 0.5) {
        const entry = r.pick(others);
        const got = attempt(() => deleteEntry(f.db, me, entry.id));
        expect(got.outcome, `${where}: ${who} deletes someone else's #${entry.id}`).toBe("forbidden");
        count(got);
      } else {
        const waiting = [...model.weeks.entries()].filter(([, s]) => s === "submitted");
        if (waiting.length === 0) continue;
        const [key] = r.pick(waiting);
        const [engagementId, monday] = key.split("|");
        const outsider = CLIENT_OF[Number(engagementId)] === "northwind" ? people.bluefin : people.northwind;
        const got = attempt(() => approveWeek(f.db, outsider, weekIdOf(f, Number(engagementId), monday), new Date(now)));
        expect(got.outcome, `${where}: ${outsider.name} approves another client's week`).toBe("forbidden");
        count(got);
      }
    }

    checkDatabase(f, model, where);
  }
}

function weekIdOf(f: Fixture, engagementId: number, monday: string): number {
  return (f.db.prepare("SELECT id FROM weeks WHERE engagement_id = ? AND week_start = ?").get(engagementId, monday) as {
    id: number;
  }).id;
}

type Row = {
  id: number;
  contractorId: number;
  engagementId: number;
  startUtc: string;
  endUtc: string;
  minutes: number;
  workDate: string;
  weekStart: string;
};

function checkDatabase(f: Fixture, model: Model, where: string) {
  const rows = f.db
    .prepare(
      `SELECT e.id, g.contractor_id AS contractorId, e.engagement_id AS engagementId, e.start_utc AS startUtc,
              e.end_utc AS endUtc, e.minutes, e.work_date AS workDate, e.week_start AS weekStart
         FROM time_entries e JOIN engagements g ON g.id = e.engagement_id ORDER BY e.id`,
    )
    .all() as Row[];

  // 2. Exactly the entries the model expects, stored the way the model computes them.
  const expected = [...model.entries.values()]
    .sort((a, b) => a.id - b.id)
    .map((e) => ({
      id: e.id,
      contractorId: e.contractorId,
      engagementId: e.engagementId,
      startUtc: utcText(e.start),
      endUtc: utcText(e.end),
      minutes: (e.end - e.start) / MINUTE, // real elapsed minutes, even across a clock change
      workDate: model.workDate(e),
      weekStart: model.weekOf(e),
    }));
  expect(rows, `${where}: database differs from the model`).toEqual(expected);

  // 3. Invariants, checked on the stored data alone.
  for (const a of rows) {
    for (const b of rows) {
      if (a.id < b.id && a.contractorId === b.contractorId) {
        expect(a.startUtc < b.endUtc && a.endUtc > b.startUtc, `${where}: #${a.id} overlaps #${b.id}`).toBe(false);
      }
    }
  }
  const perDay = new Map<string, number>();
  for (const e of rows) {
    const key = `${e.contractorId}|${e.workDate}`;
    perDay.set(key, (perDay.get(key) ?? 0) + e.minutes);
  }
  for (const [key, total] of perDay) expect(total, `${where}: ${key} is over 12:00`).toBeLessThanOrEqual(720);

  const statuses = f.db.prepare("SELECT engagement_id AS e, week_start AS w, status FROM weeks").all() as {
    e: number;
    w: string;
    status: Status;
  }[];
  expect(
    Object.fromEntries(statuses.map((s) => [`${s.e}|${s.w}`, s.status])),
    `${where}: week statuses differ from the model`,
  ).toEqual(Object.fromEntries(model.weeks));
}

// ---------------------------------------------------------------- the tests

describe("randomised: services and an independent model agree, and the rules always hold", () => {
  for (const { zone, firstMonday, note } of ZONES) {
    describe(`contractors in ${zone} (${note})`, () => {
      for (let seed = 1; seed <= SEEDS_PER_ZONE; seed++) {
        it(`seed ${seed}: ${STEPS} random operations`, () => runOnce(zone, firstMonday, seed));
      }
    });
  }

  it("exercised every kind of outcome", () => {
    // Guards against a generator that only ever produces easy cases.
    for (const [kind, n] of Object.entries(seen)) expect(n, kind).toBeGreaterThan(0);
  });
});
