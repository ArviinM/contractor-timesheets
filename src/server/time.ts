import { DateTime } from "luxon";

/**
 * Time rules (see README, "Which time zone defines the week"):
 * - Entries are stored as UTC instants.
 * - The contractor's time zone decides the work date and the week (Monday to Sunday).
 * - An entry counts on the day it starts, even if it runs past midnight.
 * - Durations are real elapsed minutes between the two instants.
 */

export const DAILY_CAP_MINUTES = 12 * 60;

/** Format of <input type="datetime-local">, read in the contractor's zone. */
const LOCAL_INPUT = "yyyy-MM-dd'T'HH:mm";
const DATE = "yyyy-MM-dd";
const UTC_TEXT = "yyyy-MM-dd'T'HH:mm:ss'Z'";

/** 'YYYY-MM-DD' */
export type LocalDate = string;

export function toUtcText(dt: DateTime): string {
  return dt.toUTC().toFormat(UTC_TEXT);
}

export function fromUtcText(utc: string): DateTime {
  return DateTime.fromISO(utc, { zone: "utc" });
}

/**
 * Reads a wall-clock time like '2026-11-23T09:00' in the given zone.
 * Returns null if it isn't valid, or if that wall time doesn't exist
 * (skipped by a daylight-saving jump; Luxon would quietly move it).
 */
export function parseLocalDateTime(value: string, zone: string): DateTime | null {
  const text = value.trim();
  const dt = DateTime.fromFormat(text, LOCAL_INPUT, { zone });
  if (!dt.isValid) return null;
  if (dt.toFormat(LOCAL_INPUT) !== text) return null;
  return dt;
}

/** The value for <input type="datetime-local"> showing this instant in the zone. */
export function toLocalInput(utc: string, zone: string): string {
  return fromUtcText(utc).setZone(zone).toFormat(LOCAL_INPUT);
}

/** The day an entry belongs to: the date it starts in the contractor's zone. */
export function workDateOf(startUtc: string, zone: string): LocalDate {
  return fromUtcText(startUtc).setZone(zone).toFormat(DATE);
}

/** Monday of the week containing this date. */
export function weekStartOf(date: LocalDate): LocalDate {
  return DateTime.fromISO(date, { zone: "utc" }).startOf("week").toFormat(DATE);
}

export function isLocalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return DateTime.fromFormat(value, DATE, { zone: "utc" }).isValid;
}

export function isMonday(date: LocalDate): boolean {
  return isLocalDate(date) && weekStartOf(date) === date;
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return DateTime.fromISO(date, { zone: "utc" }).plus({ days }).toFormat(DATE);
}

export function weekDates(weekStart: LocalDate): LocalDate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/** Real elapsed minutes. Inputs are minute-precision, so this is a whole number. */
export function minutesBetween(startUtc: string, endUtc: string): number {
  return Math.round((Date.parse(endUtc) - Date.parse(startUtc)) / 60_000);
}

export function todayIn(zone: string, now: Date): LocalDate {
  return DateTime.fromJSDate(now).setZone(zone).toFormat(DATE);
}

/** e.g. '09:00' in the given zone. */
export function clockTime(utc: string, zone: string): string {
  return fromUtcText(utc).setZone(zone).toFormat("HH:mm");
}

/** e.g. 'Mon 23 Nov' */
export function dayLabel(date: LocalDate): string {
  return DateTime.fromISO(date, { zone: "utc" }).toFormat("ccc d LLL");
}

/** e.g. 'Mon 23 Nov 2026' */
export function longDayLabel(date: LocalDate): string {
  return DateTime.fromISO(date, { zone: "utc" }).toFormat("ccc d LLL yyyy");
}

/** Short zone name for labels, e.g. 'WIB' or 'EST' (falls back to the offset). */
export function zoneAbbrev(utc: string, zone: string): string {
  return fromUtcText(utc).setZone(zone).toFormat("ZZZZ");
}

/** A Date as stored UTC text, for created_at / submitted_at style stamps. */
export function utcStamp(now: Date): string {
  return toUtcText(DateTime.fromJSDate(now));
}
