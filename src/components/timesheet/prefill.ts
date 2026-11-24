import { DateTime } from "luxon";
import type { EntryView } from "@/server/queries";

/** datetime-local format. All maths here is on wall-clock values in the contractor's zone. */
export const LOCAL = "yyyy-MM-dd'T'HH:mm";

function wall(value: string): DateTime {
  return DateTime.fromFormat(value, LOCAL, { zone: "utc" });
}

/** A one-hour slot on this day, starting after its last entry (or at 09:00). */
export function slotAfterLast(date: string, entries: EntryView[]): { start: string; end: string } {
  const sameDay = entries.filter((e) => e.workDate === date);
  let start = wall(`${date}T09:00`);
  const last = sameDay.at(-1);
  if (last) {
    const lastEnd = wall(last.endInput);
    // After an overnight entry, the next free time that day is hard to guess; keep 09:00.
    if (lastEnd.toFormat("yyyy-MM-dd") === date && lastEnd > start) start = lastEnd;
  }
  return { start: start.toFormat(LOCAL), end: start.plus({ hours: 1 }).toFormat(LOCAL) };
}

/** A one-hour slot at this hour (Timeline click). */
export function slotAt(date: string, hour: number): { start: string; end: string } {
  const start = wall(`${date}T00:00`).plus({ hours: hour });
  return { start: start.toFormat(LOCAL), end: start.plus({ hours: 1 }).toFormat(LOCAL) };
}

/** Minutes between two datetime-local values, or null if either is incomplete. */
export function wallMinutes(start: string, end: string): number | null {
  const a = wall(start);
  const b = wall(end);
  if (!a.isValid || !b.isValid) return null;
  return Math.round(b.diff(a, "minutes").minutes);
}

export function sameWallDate(a: string, b: string): boolean {
  return a.slice(0, 10) === b.slice(0, 10);
}
