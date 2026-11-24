/**
 * Shape checks for values that arrive from the network (Server Action arguments).
 * Anything unexpected is refused before a service sees it.
 */
import type { EntryInput } from "./entries";
import { ValidationError } from "./errors";

const BAD = "Bad request.";

/** A positive whole-number id, as a number or a numeric string. */
export function parseId(value: unknown): number {
  const n = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof n !== "number" || !Number.isSafeInteger(n) || n <= 0) throw new ValidationError(BAD);
  return n;
}

/** A string, or nothing (treated as empty). */
export function parseText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new ValidationError(BAD);
  return value;
}

/** An optional string: undefined when absent. */
export function parseOptionalText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new ValidationError(BAD);
  return value;
}

export function parseEntryInput(value: unknown): EntryInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new ValidationError(BAD);
  const v = value as Record<string, unknown>;
  return {
    engagementId: parseId(v.engagementId),
    start: parseText(v.start),
    end: parseText(v.end),
    note: parseText(v.note),
  };
}
