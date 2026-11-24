import { requireRole, type Actor } from "./actor";
import type { DB } from "./db";
import { ValidationError } from "./errors";
import { lineAmountCents, sumCents } from "./money";
import { addDays, isLocalDate } from "./time";
import type { WeekStatus } from "./weeks";

export type InvoiceLine = {
  weekId: number;
  contractorName: string;
  weekStart: string;
  /** The part of the week inside the date range (a range can cut a week). */
  periodFrom: string;
  periodTo: string;
  partial: boolean;
  minutes: number;
  /** Rate locked when the week was approved. */
  rateCents: number;
  amountCents: number;
};

export type NotInvoiced = {
  contractorName: string;
  weekStart: string;
  status: WeekStatus;
  minutes: number;
};

export type Invoice = {
  clientName: string;
  from: string;
  to: string;
  lines: InvoiceLine[];
  totalMinutes: number;
  totalCents: number;
  /** Submitted or rejected hours in the range that aren't billable yet, so nothing silently disappears. */
  notInvoiced: NotInvoiced[];
};

/**
 * Invoice for the signed-in client and an inclusive date range.
 * Dates are contractor work dates (the same day an entry counts on everywhere else).
 * One line per approved week; each line is rounded once, half up, to the cent.
 */
export function getInvoice(db: DB, actor: Actor, from: string, to: string): Invoice {
  requireRole(actor, "client");
  if (!isLocalDate(from) || !isLocalDate(to)) throw new ValidationError("Pick a valid date range.");
  if (from > to) throw new ValidationError("The start date must be on or before the end date.");

  const rows = db
    .prepare(
      `SELECT w.id AS weekId, u.name AS contractorName, w.week_start AS weekStart,
              w.approved_rate_cents AS rateCents, SUM(e.minutes) AS minutes
         FROM weeks w
         JOIN engagements g ON g.id = w.engagement_id
         JOIN users u ON u.id = g.contractor_id
         JOIN time_entries e ON e.engagement_id = w.engagement_id AND e.week_start = w.week_start
        WHERE g.client_id = ?
          AND w.status = 'approved'
          AND e.work_date BETWEEN ? AND ?
        GROUP BY w.id
        ORDER BY w.week_start, u.name`,
    )
    .all(actor.id, from, to) as {
    weekId: number;
    contractorName: string;
    weekStart: string;
    rateCents: number;
    minutes: number;
  }[];

  const lines: InvoiceLine[] = rows.map((r) => {
    const weekEnd = addDays(r.weekStart, 6);
    const periodFrom = r.weekStart < from ? from : r.weekStart;
    const periodTo = weekEnd > to ? to : weekEnd;
    return {
      ...r,
      periodFrom,
      periodTo,
      partial: periodFrom !== r.weekStart || periodTo !== weekEnd,
      amountCents: lineAmountCents(r.minutes, r.rateCents),
    };
  });

  // Submitted or rejected weeks only: a contractor's drafts stay private until they submit.
  const notInvoiced = db
    .prepare(
      `SELECT u.name AS contractorName, e.week_start AS weekStart, w.status, SUM(e.minutes) AS minutes
         FROM time_entries e
         JOIN engagements g ON g.id = e.engagement_id
         JOIN users u ON u.id = g.contractor_id
         JOIN weeks w ON w.engagement_id = e.engagement_id AND w.week_start = e.week_start
        WHERE g.client_id = ?
          AND w.status IN ('submitted', 'rejected')
          AND e.work_date BETWEEN ? AND ?
        GROUP BY e.engagement_id, e.week_start
        ORDER BY e.week_start, u.name`,
    )
    .all(actor.id, from, to) as NotInvoiced[];

  const client = db.prepare("SELECT name FROM users WHERE id = ?").get(actor.id) as { name: string };

  return {
    clientName: client.name,
    from,
    to,
    lines,
    totalMinutes: lines.reduce((s, l) => s + l.minutes, 0),
    totalCents: sumCents(lines.map((l) => l.amountCents)),
    notInvoiced,
  };
}
