import { describe, expect, it } from "vitest";
import {
  clockTime,
  isRepeatedWallTime,
  minutesBetween,
  parseLocalDateTime,
  toUtcText,
  weekStartOf,
  workDateOf,
} from "../src/server/time";

const JAKARTA = "Asia/Jakarta";
const NEW_YORK = "America/New_York";

function utc(local: string, zone: string): string {
  const dt = parseLocalDateTime(local, zone);
  if (!dt) throw new Error(`bad test input ${local}`);
  return toUtcText(dt);
}

describe("storing and reading times", () => {
  it("stores a Jakarta wall time as UTC", () => {
    expect(utc("2026-11-23T06:00", JAKARTA)).toBe("2026-11-22T23:00:00Z");
  });

  it("puts a Monday-morning Jakarta entry on Monday and in Monday's week, even though it's still Sunday in UTC", () => {
    const start = utc("2026-11-23T06:00", JAKARTA);
    expect(workDateOf(start, JAKARTA)).toBe("2026-11-23");
    expect(weekStartOf(workDateOf(start, JAKARTA))).toBe("2026-11-23");
  });

  it("shows the same instant on Sunday evening for a New York client", () => {
    const start = utc("2026-11-23T06:00", JAKARTA);
    expect(workDateOf(start, NEW_YORK)).toBe("2026-11-22");
    expect(clockTime(start, NEW_YORK)).toBe("18:00");
  });
});

describe("day and week boundaries", () => {
  it("counts an entry that crosses midnight on the day it starts", () => {
    const start = utc("2026-11-23T22:00", JAKARTA); // Monday 22:00
    const end = utc("2026-11-24T02:00", JAKARTA); // Tuesday 02:00
    expect(workDateOf(start, JAKARTA)).toBe("2026-11-23");
    expect(minutesBetween(start, end)).toBe(240);
  });

  it("keeps a Sunday-night entry that crosses into Monday in the earlier week", () => {
    const start = utc("2026-11-22T22:00", JAKARTA); // Sunday 22:00 to Monday 01:00
    expect(workDateOf(start, JAKARTA)).toBe("2026-11-22");
    expect(weekStartOf("2026-11-22")).toBe("2026-11-16");
  });

  it("starts weeks on Monday", () => {
    expect(weekStartOf("2026-11-23")).toBe("2026-11-23"); // Monday
    expect(weekStartOf("2026-11-29")).toBe("2026-11-23"); // Sunday
    expect(weekStartOf("2026-11-30")).toBe("2026-11-30"); // next Monday
  });
});

describe("daylight saving (contractor in New York)", () => {
  it("counts real elapsed minutes on the 25-hour day (clocks go back on 1 Nov 2026)", () => {
    const start = utc("2026-11-01T00:00", NEW_YORK);
    const end = utc("2026-11-01T03:00", NEW_YORK);
    expect(minutesBetween(start, end)).toBe(240);
  });

  it("spots a wall time that happens twice when clocks go back", () => {
    expect(isRepeatedWallTime(parseLocalDateTime("2026-11-01T01:30", NEW_YORK)!)).toBe(true);
    expect(isRepeatedWallTime(parseLocalDateTime("2026-11-01T00:30", NEW_YORK)!)).toBe(false);
    expect(isRepeatedWallTime(parseLocalDateTime("2026-11-23T09:00", JAKARTA)!)).toBe(false);
  });

  it("refuses a wall time that doesn't exist when clocks go forward", () => {
    expect(parseLocalDateTime("2027-03-14T02:30", NEW_YORK)).toBeNull();
  });
});

describe("parsing", () => {
  it("refuses malformed input", () => {
    expect(parseLocalDateTime("", JAKARTA)).toBeNull();
    expect(parseLocalDateTime("2026-11-31T09:00", JAKARTA)).toBeNull();
    expect(parseLocalDateTime("2026-11-23 09:00", JAKARTA)).toBeNull();
    expect(parseLocalDateTime("2026-11-23T25:00", JAKARTA)).toBeNull();
  });
});
