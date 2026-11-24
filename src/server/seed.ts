/**
 * Synthetic seed data. Dates are relative to the current week in Jakarta, so the app
 * always looks "live". It goes through the same services as the app, so every seeded
 * entry passes the real rules (no overlaps, 12-hour cap, locked weeks).
 */
import { DateTime } from "luxon";
import { loadActor, type Actor } from "./actor";
import type { DB } from "./db";
import { createEntry } from "./entries";
import { addDays, parseLocalDateTime, todayIn, weekStartOf } from "./time";
import { approveWeek, rejectWeek, submitWeek } from "./weeks";

const JAKARTA = "Asia/Jakarta";

export const SEED_USERS = [
  { id: 1, name: "Ayu Pratama", role: "contractor", timeZone: JAKARTA },
  { id: 2, name: "Budi Santoso", role: "contractor", timeZone: JAKARTA },
  { id: 3, name: "Citra Wijaya", role: "contractor", timeZone: JAKARTA },
  { id: 4, name: "Northwind Labs", role: "client", timeZone: "America/New_York" },
  { id: 5, name: "Bluefin Studio", role: "client", timeZone: "Europe/London" },
] as const;

// engagement id: [contractor, client, rate in cents]
const ENGAGEMENTS: [number, number, number, number][] = [
  [1, 1, 4, 3333], // Ayu   -> Northwind, $33.33/h
  [2, 2, 4, 2400], // Budi  -> Northwind, $24.00/h (raised to $25.00 after two approved weeks)
  [3, 3, 4, 4000], // Citra -> Northwind, $40.00/h
  [4, 3, 5, 3000], // Citra -> Bluefin,   $30.00/h
];

export function seed(db: DB, now: Date): void {
  const insertUser = db.prepare("INSERT INTO users (id, name, role, time_zone) VALUES (?, ?, ?, ?)");
  for (const u of SEED_USERS) insertUser.run(u.id, u.name, u.role, u.timeZone);
  const insertEngagement = db.prepare(
    "INSERT INTO engagements (id, contractor_id, client_id, hourly_rate_cents) VALUES (?, ?, ?, ?)",
  );
  for (const g of ENGAGEMENTS) insertEngagement.run(...g);

  const actor = (id: number) => loadActor(db, id) as Actor;
  const ayu = actor(1), budi = actor(2), citra = actor(3), northwind = actor(4), bluefin = actor(5);

  const w0 = weekStartOf(todayIn(JAKARTA, now));
  const [w3, w2, w1] = [-3, -2, -1].map((n) => addDays(w0, 7 * n));
  const weekdays = (ws: string) => [0, 1, 2, 3, 4].map((i) => addDays(ws, i));

  /** Logs one entry; in the current week, only what has already happened. */
  const log = (who: Actor, engagementId: number, date: string, start: string, end: string, note: string) => {
    const endDate = end <= start ? addDays(date, 1) : date;
    const input = { engagementId, start: `${date}T${start}`, end: `${endDate}T${end}`, note };
    const endsAt = parseLocalDateTime(input.end, JAKARTA);
    if (!endsAt || endsAt.toMillis() > now.getTime()) return;
    createEntry(db, who, input, now);
  };

  /** A moment in Jakarta time, never later than now. */
  const at = (date: string, time: string) => {
    const moment = DateTime.fromISO(`${date}T${time}`, { zone: JAKARTA }).toJSDate();
    return moment < now ? moment : now;
  };
  const weekId = (engagementId: number, ws: string) =>
    (db.prepare("SELECT id FROM weeks WHERE engagement_id = ? AND week_start = ?").get(engagementId, ws) as {
      id: number;
    }).id;
  const submit = (who: Actor, engagementId: number, ws: string) =>
    submitWeek(db, who, { engagementId, weekStart: ws }, at(addDays(ws, 4), "18:00"));
  const approve = (client: Actor, engagementId: number, ws: string) =>
    approveWeek(db, client, weekId(engagementId, ws), at(addDays(ws, 7), "22:00"));

  // Ayu: Northwind is in New York, so she works an afternoon block and an evening block (their morning).
  const ayuNotes = ["Checkout flow", "Payment form validation", "Order history page", "Bug fixes from QA", "Release prep"];
  for (const ws of [w3, w2, w1, w0]) {
    weekdays(ws).forEach((d, i) => {
      log(ayu, 1, d, "13:00", "17:00", ayuNotes[i]);
      if (ws === w0 && i === 0) {
        // Crosses midnight in Jakarta. Counts on Monday, the day it starts.
        log(ayu, 1, d, "21:00", "01:00", "Release night with the New York team");
      } else {
        log(ayu, 1, d, "20:00", "23:20", "Standup and code review with Northwind");
      }
    });
  }

  // Budi: day shift. Last week he logged a team offsite on Thursday, which Northwind rejects.
  for (const ws of [w3, w2, w1, w0]) {
    weekdays(ws).forEach((d, i) => {
      if (ws === w1 && i === 3) {
        log(budi, 2, d, "09:00", "17:00", "Team offsite");
        return;
      }
      log(budi, 2, d, "09:00", "12:00", "Support tickets");
      log(budi, 2, d, "13:00", "17:00", "API integration");
    });
  }

  // Citra: two clients. Mornings for Northwind, Mon/Wed/Fri afternoons for Bluefin (London morning).
  for (const ws of [w2, w1, w0]) {
    weekdays(ws).forEach((d, i) => {
      log(citra, 3, d, "09:00", "13:00", "Design system components");
      if (i % 2 === 0) log(citra, 4, d, "14:00", "18:00", "Bluefin brand site");
    });
  }

  // Decisions on past weeks.
  for (const ws of [w3, w2]) {
    submit(ayu, 1, ws);
    approve(northwind, 1, ws);
    submit(budi, 2, ws);
    approve(northwind, 2, ws);
  }
  // Budi's rate goes up after those approvals. Approved weeks keep the $24.00 they were approved at.
  db.prepare("UPDATE engagements SET hourly_rate_cents = 2500 WHERE id = 2").run();

  submit(citra, 3, w2);
  approve(northwind, 3, w2);
  submit(citra, 4, w2);
  approve(bluefin, 4, w2);

  // Last week: waiting for review, plus one rejection.
  submit(ayu, 1, w1);
  submit(citra, 3, w1);
  submit(citra, 4, w1);
  submit(budi, 2, w1);
  rejectWeek(
    db,
    northwind,
    weekId(2, w1),
    "Thursday's team offsite isn't billable to Northwind. Please remove that entry and resubmit.",
    at(addDays(w1, 7), "21:00"),
  );
}
