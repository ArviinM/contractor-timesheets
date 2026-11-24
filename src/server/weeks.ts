import { getEngagement, requireContractorEngagement, requireRole, type Actor } from "./actor";
import type { DB } from "./db";
import { ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { addDays, dayLabel, isMonday, utcStamp } from "./time";

export type WeekStatus = "draft" | "submitted" | "approved" | "rejected";

const COMMENT_MAX = 1000;

/** No row means the week is still a draft. */
export function getWeekStatus(db: DB, engagementId: number, weekStart: string): WeekStatus {
  const row = db
    .prepare("SELECT status FROM weeks WHERE engagement_id = ? AND week_start = ?")
    .get(engagementId, weekStart) as { status: WeekStatus } | undefined;
  return row?.status ?? "draft";
}

/** Contractor submits one week for one client. Its entries lock until the client decides. */
export function submitWeek(
  db: DB,
  actor: Actor,
  input: { engagementId: number; weekStart: string },
  now: Date,
): number {
  return db
    .transaction(() => {
      requireContractorEngagement(db, actor, input.engagementId);
      if (!isMonday(input.weekStart)) throw new ValidationError("A week starts on a Monday.");

      const { n } = db
        .prepare("SELECT COUNT(*) AS n FROM time_entries WHERE engagement_id = ? AND week_start = ?")
        .get(input.engagementId, input.weekStart) as { n: number };
      if (n === 0) throw new ValidationError("Add at least one entry before submitting the week.");

      const existing = db
        .prepare("SELECT id, status FROM weeks WHERE engagement_id = ? AND week_start = ?")
        .get(input.engagementId, input.weekStart) as { id: number; status: WeekStatus } | undefined;

      if (existing?.status === "submitted") throw new ValidationError("This week is already submitted.");
      if (existing?.status === "approved") throw new ValidationError("This week is already approved.");

      const stamp = utcStamp(now);
      if (existing) {
        // A rejected week comes back. The last comment is kept so the client sees what was asked.
        db.prepare(
          `UPDATE weeks SET status = 'submitted', submitted_at = ?, decided_at = NULL, decided_by = NULL
            WHERE id = ?`,
        ).run(stamp, existing.id);
        return existing.id;
      }
      const result = db
        .prepare(
          "INSERT INTO weeks (engagement_id, week_start, status, submitted_at) VALUES (?, ?, 'submitted', ?)",
        )
        .run(input.engagementId, input.weekStart, stamp);
      return Number(result.lastInsertRowid);
    })
    .immediate();
}

/** Client approves. Final, and the hourly rate is locked into the week. */
export function approveWeek(db: DB, actor: Actor, weekId: number, now: Date): void {
  db.transaction(() => {
    const week = requireClientWeek(db, actor, weekId);
    if (week.status !== "submitted") {
      throw new ValidationError("Only a submitted week can be approved.");
    }
    const { hourlyRateCents } = getEngagement(db, week.engagementId);
    db.prepare(
      `UPDATE weeks SET status = 'approved', approved_rate_cents = ?, decided_at = ?, decided_by = ?
        WHERE id = ?`,
    ).run(hourlyRateCents, utcStamp(now), actor.id, weekId);
  }).immediate();
}

/** Client rejects with a comment. The week reopens for the contractor to fix and resubmit. */
export function rejectWeek(db: DB, actor: Actor, weekId: number, comment: string, now: Date): void {
  db.transaction(() => {
    const week = requireClientWeek(db, actor, weekId);
    if (week.status !== "submitted") {
      throw new ValidationError("Only a submitted week can be rejected.");
    }
    const text = (comment ?? "").trim();
    if (!text) throw new ValidationError("Add a comment so the contractor knows what to fix.");
    if (text.length > COMMENT_MAX) {
      throw new ValidationError(`Keep the comment under ${COMMENT_MAX} characters.`);
    }
    db.prepare(
      `UPDATE weeks SET status = 'rejected', reject_comment = ?, decided_at = ?, decided_by = ?
        WHERE id = ?`,
    ).run(text, utcStamp(now), actor.id, weekId);
  }).immediate();
}

type ClientWeek = { id: number; engagementId: number; status: WeekStatus; weekStart: string };

/** The week must belong to one of this client's contractors. */
function requireClientWeek(db: DB, actor: Actor, weekId: number): ClientWeek {
  requireRole(actor, "client");
  const row = db
    .prepare(
      `SELECT w.id, w.engagement_id AS engagementId, w.status, w.week_start AS weekStart,
              g.client_id AS clientId
         FROM weeks w JOIN engagements g ON g.id = w.engagement_id
        WHERE w.id = ?`,
    )
    .get(weekId) as (ClientWeek & { clientId: number }) | undefined;
  if (!row) throw new NotFoundError("Week");
  if (row.clientId !== actor.id) throw new ForbiddenError();
  return row;
}

/** 'Week of Mon 23 Nov' */
export function weekLabel(weekStart: string): string {
  return `Week of ${dayLabel(weekStart)}`;
}

/** 'Mon 23 Nov to Sun 29 Nov' */
export function weekRangeLabel(weekStart: string): string {
  return `${dayLabel(weekStart)} to ${dayLabel(addDays(weekStart, 6))}`;
}
