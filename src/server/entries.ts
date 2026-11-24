import { requireContractorEngagement, requireRole, type Actor } from "./actor";
import type { DB } from "./db";
import { ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { formatHours } from "./money";
import {
  DAILY_CAP_MINUTES,
  clockTime,
  dayLabel,
  minutesBetween,
  parseLocalDateTime,
  toUtcText,
  utcStamp,
  weekStartOf,
  workDateOf,
} from "./time";
import { getWeekStatus } from "./weeks";

export type EntryInput = {
  engagementId: number;
  /** Wall-clock time in the contractor's zone, 'YYYY-MM-DDTHH:mm' (datetime-local). */
  start: string;
  end: string;
  note?: string;
};

const NOTE_MAX = 500;

type StoredEntry = {
  id: number;
  engagementId: number;
  contractorId: number;
  weekStart: string;
};

/**
 * Every write runs its checks and its save in one IMMEDIATE transaction, so two
 * requests can't both pass the overlap or 12-hour check and then both save.
 */
export function createEntry(db: DB, actor: Actor, input: EntryInput, now: Date): number {
  return db
    .transaction(() => {
      requireContractorEngagement(db, actor, input.engagementId);
      const entry = validate(actor, input, now);
      assertWeekOpen(db, input.engagementId, entry.weekStart);
      assertNoOverlap(db, actor, entry.startUtc, entry.endUtc, null);
      assertDailyCap(db, actor, entry.workDate, entry.minutes, null);
      const stamp = utcStamp(now);
      const result = db
        .prepare(
          `INSERT INTO time_entries
             (engagement_id, start_utc, end_utc, minutes, work_date, week_start, note, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.engagementId,
          entry.startUtc,
          entry.endUtc,
          entry.minutes,
          entry.workDate,
          entry.weekStart,
          entry.note,
          stamp,
          stamp,
        );
      return Number(result.lastInsertRowid);
    })
    .immediate();
}

export function updateEntry(db: DB, actor: Actor, entryId: number, input: EntryInput, now: Date): void {
  db.transaction(() => {
    const existing = requireOwnEntry(db, actor, entryId);
    // The week it's leaving must be open...
    assertWeekOpen(db, existing.engagementId, existing.weekStart);
    requireContractorEngagement(db, actor, input.engagementId);
    const entry = validate(actor, input, now);
    // ...and so must the week it's moving into (it may be a different week or client).
    assertWeekOpen(db, input.engagementId, entry.weekStart);
    assertNoOverlap(db, actor, entry.startUtc, entry.endUtc, entryId);
    assertDailyCap(db, actor, entry.workDate, entry.minutes, entryId);
    db.prepare(
      `UPDATE time_entries
          SET engagement_id = ?, start_utc = ?, end_utc = ?, minutes = ?, work_date = ?,
              week_start = ?, note = ?, updated_at = ?
        WHERE id = ?`,
    ).run(
      input.engagementId,
      entry.startUtc,
      entry.endUtc,
      entry.minutes,
      entry.workDate,
      entry.weekStart,
      entry.note,
      utcStamp(now),
      entryId,
    );
  }).immediate();
}

export function deleteEntry(db: DB, actor: Actor, entryId: number): void {
  db.transaction(() => {
    const existing = requireOwnEntry(db, actor, entryId);
    assertWeekOpen(db, existing.engagementId, existing.weekStart);
    db.prepare("DELETE FROM time_entries WHERE id = ?").run(entryId);
  }).immediate();
}

// ---------------------------------------------------------------------------

function requireOwnEntry(db: DB, actor: Actor, entryId: number): StoredEntry {
  requireRole(actor, "contractor");
  const row = db
    .prepare(
      `SELECT e.id, e.engagement_id AS engagementId, g.contractor_id AS contractorId,
              e.week_start AS weekStart
         FROM time_entries e
         JOIN engagements g ON g.id = e.engagement_id
        WHERE e.id = ?`,
    )
    .get(entryId) as StoredEntry | undefined;
  if (!row) throw new NotFoundError("Entry");
  if (row.contractorId !== actor.id) throw new ForbiddenError();
  return row;
}

function validate(actor: Actor, input: EntryInput, now: Date) {
  const start = parseLocalDateTime(input.start ?? "", actor.timeZone);
  if (!start) throw new ValidationError("Start isn't a valid date and time.");
  const end = parseLocalDateTime(input.end ?? "", actor.timeZone);
  if (!end) throw new ValidationError("End isn't a valid date and time.");
  if (end <= start) throw new ValidationError("End must be after start.");
  if (end.toMillis() > now.getTime()) {
    throw new ValidationError("An entry can't end in the future.");
  }
  const note = (input.note ?? "").trim();
  if (note.length > NOTE_MAX) {
    throw new ValidationError(`Keep the note under ${NOTE_MAX} characters.`);
  }
  const startUtc = toUtcText(start);
  const endUtc = toUtcText(end);
  const workDate = workDateOf(startUtc, actor.timeZone);
  return {
    startUtc,
    endUtc,
    minutes: minutesBetween(startUtc, endUtc),
    workDate,
    weekStart: weekStartOf(workDate),
    note,
  };
}

function assertWeekOpen(db: DB, engagementId: number, weekStart: string): void {
  const status = getWeekStatus(db, engagementId, weekStart);
  if (status === "submitted") {
    throw new ValidationError(`The week of ${dayLabel(weekStart)} is submitted, so its entries are locked.`);
  }
  if (status === "approved") {
    throw new ValidationError(`The week of ${dayLabel(weekStart)} is approved, so its entries are locked.`);
  }
}

/**
 * Half-open intervals: [start, end). Touching (9-10 then 10-11) is fine.
 * Checked across all of this contractor's clients, on real UTC instants.
 */
function assertNoOverlap(db: DB, actor: Actor, startUtc: string, endUtc: string, ignoreId: number | null): void {
  const clash = db
    .prepare(
      `SELECT e.start_utc AS startUtc, e.end_utc AS endUtc, c.name AS clientName
         FROM time_entries e
         JOIN engagements g ON g.id = e.engagement_id
         JOIN users c ON c.id = g.client_id
        WHERE g.contractor_id = ?
          AND e.start_utc < ?
          AND e.end_utc > ?
          AND e.id IS NOT ?
        ORDER BY e.start_utc
        LIMIT 1`,
    )
    .get(actor.id, endUtc, startUtc, ignoreId) as
    | { startUtc: string; endUtc: string; clientName: string }
    | undefined;
  if (clash) {
    const day = dayLabel(workDateOf(clash.startUtc, actor.timeZone));
    throw new ValidationError(
      `Overlaps another entry: ${day}, ${clockTime(clash.startUtc, actor.timeZone)} to ` +
        `${clockTime(clash.endUtc, actor.timeZone)} (${clash.clientName}).`,
    );
  }
}

/** At most 12:00 per work date, across all clients. Exactly 12:00 is allowed. */
function assertDailyCap(db: DB, actor: Actor, workDate: string, minutes: number, ignoreId: number | null): void {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(e.minutes), 0) AS total
         FROM time_entries e
         JOIN engagements g ON g.id = e.engagement_id
        WHERE g.contractor_id = ? AND e.work_date = ? AND e.id IS NOT ?`,
    )
    .get(actor.id, workDate, ignoreId) as { total: number };
  const total = row.total + minutes;
  if (total > DAILY_CAP_MINUTES) {
    throw new ValidationError(
      `That makes ${formatHours(total)} on ${dayLabel(workDate)}. The limit is 12:00 a day.`,
    );
  }
}
