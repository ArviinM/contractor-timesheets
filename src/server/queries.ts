/**
 * Read models for the screens. Every read is scoped to the signed-in user:
 * contractors only see their own entries, clients only their own contractors' weeks.
 */
import { requireRole, type Actor, type Role } from "./actor";
import type { DB } from "./db";
import { ForbiddenError, NotFoundError } from "./errors";
import { lineAmountCents } from "./money";
import {
  addDays,
  clockTime,
  dayLabel,
  fromUtcText,
  todayIn,
  toLocalInput,
  weekDates,
  weekStartOf,
  workDateOf,
} from "./time";
import type { WeekStatus } from "./weeks";

// ---------------------------------------------------------------- users

export type UserCard = {
  id: number;
  name: string;
  role: Role;
  timeZone: string;
  /** One line for the sign-in page, e.g. 'Northwind Labs' or '2 weeks waiting for review'. */
  hint: string;
};

export function listUsers(db: DB): UserCard[] {
  const users = db
    .prepare("SELECT id, name, role, time_zone AS timeZone FROM users ORDER BY role DESC, name")
    .all() as Omit<UserCard, "hint">[];
  return users.map((u) => {
    if (u.role === "contractor") {
      const clients = db
        .prepare(
          `SELECT c.name FROM engagements g JOIN users c ON c.id = g.client_id
            WHERE g.contractor_id = ? ORDER BY c.name`,
        )
        .all(u.id) as { name: string }[];
      const rejected = db
        .prepare(
          `SELECT COUNT(*) AS n FROM weeks w JOIN engagements g ON g.id = w.engagement_id
            WHERE g.contractor_id = ? AND w.status = 'rejected'`,
        )
        .get(u.id) as { n: number };
      const names = clients.map((c) => c.name).join(", ");
      return { ...u, hint: rejected.n > 0 ? `${names} · a week was rejected` : names };
    }
    const waiting = db
      .prepare(
        `SELECT COUNT(*) AS n FROM weeks w JOIN engagements g ON g.id = w.engagement_id
          WHERE g.client_id = ? AND w.status = 'submitted'`,
      )
      .get(u.id) as { n: number };
    const hint =
      waiting.n === 0 ? "Nothing waiting for review" : `${waiting.n} week${waiting.n === 1 ? "" : "s"} waiting for review`;
    return { ...u, hint };
  });
}

// ---------------------------------------------------------------- contractor

export type ContractorEngagement = {
  id: number;
  clientName: string;
  clientTimeZone: string;
  rateCents: number;
};

export function getContractorEngagements(db: DB, actor: Actor): ContractorEngagement[] {
  requireRole(actor, "contractor");
  return db
    .prepare(
      `SELECT g.id, c.name AS clientName, c.time_zone AS clientTimeZone, g.hourly_rate_cents AS rateCents
         FROM engagements g JOIN users c ON c.id = g.client_id
        WHERE g.contractor_id = ?
        ORDER BY c.name`,
    )
    .all(actor.id) as ContractorEngagement[];
}

export type EntryView = {
  id: number;
  engagementId: number;
  clientName: string;
  startUtc: string;
  endUtc: string;
  /** datetime-local values in the contractor's zone, for the edit form. */
  startInput: string;
  endInput: string;
  /** 'HH:mm' in the contractor's zone. */
  startTime: string;
  endTime: string;
  /** Ends on a later calendar day than it starts (still counts on its start day). */
  endsNextDay: boolean;
  minutes: number;
  workDate: string;
  note: string;
  locked: boolean;
};

export type EngagementWeek = {
  engagementId: number;
  clientName: string;
  clientTimeZone: string;
  weekId: number | null;
  status: WeekStatus;
  rejectComment: string | null;
  /** Locked rate once approved, otherwise the current rate. */
  rateCents: number;
  minutes: number;
  amountCents: number;
  submittedAt: string | null;
  decidedAt: string | null;
};

export type ContractorWeek = {
  weekStart: string;
  prevWeek: string;
  nextWeek: string;
  today: string;
  /** This week has not finished yet (submitting early is allowed, with a warning). */
  inProgress: boolean;
  isFuture: boolean;
  timeZone: string;
  days: { date: string; label: string; minutes: number; entries: EntryView[] }[];
  engagements: EngagementWeek[];
  totalMinutes: number;
};

export function getContractorWeek(db: DB, actor: Actor, weekStart: string, now: Date): ContractorWeek {
  requireRole(actor, "contractor");
  const ws = weekStartOf(weekStart);
  const today = todayIn(actor.timeZone, now);

  const rows = db
    .prepare(
      `SELECT e.id, e.engagement_id AS engagementId, c.name AS clientName, e.start_utc AS startUtc,
              e.end_utc AS endUtc, e.minutes, e.work_date AS workDate, e.note,
              COALESCE(w.status, 'draft') AS status
         FROM time_entries e
         JOIN engagements g ON g.id = e.engagement_id
         JOIN users c ON c.id = g.client_id
         LEFT JOIN weeks w ON w.engagement_id = e.engagement_id AND w.week_start = e.week_start
        WHERE g.contractor_id = ? AND e.week_start = ?
        ORDER BY e.start_utc`,
    )
    .all(actor.id, ws) as (Omit<EntryView, "startInput" | "endInput" | "startTime" | "endTime" | "endsNextDay" | "locked"> & {
    status: WeekStatus;
  })[];

  const entries: EntryView[] = rows.map(({ status, ...e }) => ({
    ...e,
    startInput: toLocalInput(e.startUtc, actor.timeZone),
    endInput: toLocalInput(e.endUtc, actor.timeZone),
    startTime: clockTime(e.startUtc, actor.timeZone),
    endTime: clockTime(e.endUtc, actor.timeZone),
    endsNextDay: workDateOf(e.endUtc, actor.timeZone) !== e.workDate && clockTime(e.endUtc, actor.timeZone) !== "00:00",
    locked: status === "submitted" || status === "approved",
  }));

  const days = weekDates(ws).map((date) => {
    const dayEntries = entries.filter((e) => e.workDate === date);
    return {
      date,
      label: dayLabel(date),
      minutes: dayEntries.reduce((sum, e) => sum + e.minutes, 0),
      entries: dayEntries,
    };
  });

  const engagements = getContractorEngagements(db, actor).map((g): EngagementWeek => {
    const week = db
      .prepare(
        `SELECT id, status, reject_comment AS rejectComment, approved_rate_cents AS approvedRateCents,
                submitted_at AS submittedAt, decided_at AS decidedAt
           FROM weeks WHERE engagement_id = ? AND week_start = ?`,
      )
      .get(g.id, ws) as
      | {
          id: number;
          status: WeekStatus;
          rejectComment: string | null;
          approvedRateCents: number | null;
          submittedAt: string;
          decidedAt: string | null;
        }
      | undefined;
    const minutes = entries.filter((e) => e.engagementId === g.id).reduce((s, e) => s + e.minutes, 0);
    const rateCents = week?.approvedRateCents ?? g.rateCents;
    return {
      engagementId: g.id,
      clientName: g.clientName,
      clientTimeZone: g.clientTimeZone,
      weekId: week?.id ?? null,
      status: week?.status ?? "draft",
      rejectComment: week?.status === "rejected" ? week.rejectComment : null,
      rateCents,
      minutes,
      amountCents: lineAmountCents(minutes, rateCents),
      submittedAt: week?.submittedAt ?? null,
      decidedAt: week?.decidedAt ?? null,
    };
  });

  const currentWeek = weekStartOf(today);
  return {
    weekStart: ws,
    prevWeek: addDays(ws, -7),
    nextWeek: addDays(ws, 7),
    today,
    inProgress: ws === currentWeek,
    isFuture: ws > currentWeek,
    timeZone: actor.timeZone,
    days,
    engagements,
    totalMinutes: entries.reduce((s, e) => s + e.minutes, 0),
  };
}

export type RecentWeek = {
  weekStart: string;
  minutes: number;
  statuses: { clientName: string; status: WeekStatus }[];
};

/** For the sidebar: the latest weeks that have entries, newest first. */
export function getRecentWeeks(db: DB, actor: Actor, limit = 6): RecentWeek[] {
  requireRole(actor, "contractor");
  const weeks = db
    .prepare(
      `SELECT e.week_start AS weekStart, SUM(e.minutes) AS minutes
         FROM time_entries e JOIN engagements g ON g.id = e.engagement_id
        WHERE g.contractor_id = ?
        GROUP BY e.week_start ORDER BY e.week_start DESC LIMIT ?`,
    )
    .all(actor.id, limit) as { weekStart: string; minutes: number }[];
  return weeks.map((w) => ({
    ...w,
    statuses: db
      .prepare(
        `SELECT c.name AS clientName, COALESCE(wk.status, 'draft') AS status
           FROM engagements g
           JOIN users c ON c.id = g.client_id
           LEFT JOIN weeks wk ON wk.engagement_id = g.id AND wk.week_start = ?
          WHERE g.contractor_id = ?
            AND EXISTS (SELECT 1 FROM time_entries e WHERE e.engagement_id = g.id AND e.week_start = ?)
          ORDER BY c.name`,
      )
      .all(w.weekStart, actor.id, w.weekStart) as { clientName: string; status: WeekStatus }[],
  }));
}

// ---------------------------------------------------------------- client

export type ReviewWeek = {
  weekId: number;
  engagementId: number;
  contractorName: string;
  contractorTimeZone: string;
  weekStart: string;
  status: WeekStatus;
  rejectComment: string | null;
  rateCents: number;
  minutes: number;
  amountCents: number;
  submittedAt: string;
  decidedAt: string | null;
};

const REVIEW_SELECT = `
  SELECT w.id AS weekId, w.engagement_id AS engagementId, u.name AS contractorName,
         u.time_zone AS contractorTimeZone, w.week_start AS weekStart, w.status,
         w.reject_comment AS rejectComment,
         COALESCE(w.approved_rate_cents, g.hourly_rate_cents) AS rateCents,
         (SELECT COALESCE(SUM(e.minutes), 0) FROM time_entries e
           WHERE e.engagement_id = w.engagement_id AND e.week_start = w.week_start) AS minutes,
         w.submitted_at AS submittedAt, w.decided_at AS decidedAt
    FROM weeks w
    JOIN engagements g ON g.id = w.engagement_id
    JOIN users u ON u.id = g.contractor_id`;

function withAmount(row: Omit<ReviewWeek, "amountCents">): ReviewWeek {
  return { ...row, amountCents: lineAmountCents(row.minutes, row.rateCents) };
}

/** Waiting weeks (oldest first), then recent decisions. */
export function getReviewQueue(db: DB, actor: Actor): { waiting: ReviewWeek[]; decided: ReviewWeek[] } {
  requireRole(actor, "client");
  const waiting = db
    .prepare(`${REVIEW_SELECT} WHERE g.client_id = ? AND w.status = 'submitted' ORDER BY w.week_start, w.submitted_at`)
    .all(actor.id) as Omit<ReviewWeek, "amountCents">[];
  const decided = db
    .prepare(
      `${REVIEW_SELECT} WHERE g.client_id = ? AND w.status IN ('approved', 'rejected')
        ORDER BY w.decided_at DESC, w.week_start DESC LIMIT 20`,
    )
    .all(actor.id) as Omit<ReviewWeek, "amountCents">[];
  return { waiting: waiting.map(withAmount), decided: decided.map(withAmount) };
}

export type ReviewEntry = {
  id: number;
  /** In the client's own zone. */
  clientDate: string;
  clientStart: string;
  clientEnd: string;
  /** In the contractor's zone (the zone that decides the day and week). */
  workDate: string;
  contractorStart: string;
  contractorEnd: string;
  minutes: number;
  note: string;
};

export type ReviewWeekDetail = {
  week: ReviewWeek;
  clientTimeZone: string;
  days: { date: string; label: string; minutes: number; entries: ReviewEntry[] }[];
  /** The next week waiting for this client, for "approve and go to next". */
  nextWaitingWeekId: number | null;
};

export function getReviewWeek(db: DB, actor: Actor, weekId: number): ReviewWeekDetail {
  requireRole(actor, "client");
  const owner = db
    .prepare("SELECT g.client_id AS clientId FROM weeks w JOIN engagements g ON g.id = w.engagement_id WHERE w.id = ?")
    .get(weekId) as { clientId: number } | undefined;
  if (!owner) throw new NotFoundError("Week");
  if (owner.clientId !== actor.id) throw new ForbiddenError();

  const week = withAmount(
    db.prepare(`${REVIEW_SELECT} WHERE w.id = ?`).get(weekId) as Omit<ReviewWeek, "amountCents">,
  );
  const rows = db
    .prepare(
      `SELECT id, start_utc AS startUtc, end_utc AS endUtc, minutes, work_date AS workDate, note
         FROM time_entries WHERE engagement_id = ? AND week_start = ? ORDER BY start_utc`,
    )
    .all(week.engagementId, week.weekStart) as {
    id: number;
    startUtc: string;
    endUtc: string;
    minutes: number;
    workDate: string;
    note: string;
  }[];

  const zone = actor.timeZone;
  const entries: ReviewEntry[] = rows.map((r) => ({
    id: r.id,
    clientDate: fromUtcText(r.startUtc).setZone(zone).toFormat("yyyy-MM-dd"),
    clientStart: clockTime(r.startUtc, zone),
    clientEnd: clockTime(r.endUtc, zone),
    workDate: r.workDate,
    contractorStart: clockTime(r.startUtc, week.contractorTimeZone),
    contractorEnd: clockTime(r.endUtc, week.contractorTimeZone),
    minutes: r.minutes,
    note: r.note,
  }));

  // Grouped by the client's own calendar day, so a Jakarta Monday morning shows under Sunday in New York.
  const dates = [...new Set(entries.map((e) => e.clientDate))].sort();
  const days = dates.map((date) => {
    const dayEntries = entries.filter((e) => e.clientDate === date);
    return { date, label: dayLabel(date), minutes: dayEntries.reduce((s, e) => s + e.minutes, 0), entries: dayEntries };
  });

  const next = db
    .prepare(
      `SELECT w.id FROM weeks w JOIN engagements g ON g.id = w.engagement_id
        WHERE g.client_id = ? AND w.status = 'submitted' AND w.id <> ?
        ORDER BY w.week_start, w.submitted_at LIMIT 1`,
    )
    .get(actor.id, weekId) as { id: number } | undefined;

  return { week, clientTimeZone: zone, days, nextWaitingWeekId: next?.id ?? null };
}

export function countWaiting(db: DB, actor: Actor): number {
  if (actor.role !== "client") return 0;
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM weeks w JOIN engagements g ON g.id = w.engagement_id
        WHERE g.client_id = ? AND w.status = 'submitted'`,
    )
    .get(actor.id) as { n: number };
  return row.n;
}

/** Today in the user's own zone, for default dates. */
export function todayFor(actor: Actor, now: Date): string {
  return todayIn(actor.timeZone, now);
}
