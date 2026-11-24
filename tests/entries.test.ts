import { beforeEach, describe, expect, it } from "vitest";
import { createEntry, deleteEntry, updateEntry } from "../src/server/entries";
import { ValidationError } from "../src/server/errors";
import { approveWeek, rejectWeek, submitWeek } from "../src/server/weeks";
import { ENG, entryCount, log, NOW, setup, type Fixture } from "./fixtures";

let f: Fixture;
beforeEach(() => {
  f = setup();
});

const MON = "2026-11-23";
const TUE = "2026-11-24";

function weekId(engagementId: number, weekStart: string): number {
  return (
    f.db.prepare("SELECT id FROM weeks WHERE engagement_id = ? AND week_start = ?").get(engagementId, weekStart) as {
      id: number;
    }
  ).id;
}

describe("end after start", () => {
  it("refuses an end equal to the start", () => {
    expect(() => log(f, f.ayu, ENG.ayuNorthwind, `${MON}T09:00`, `${MON}T09:00`)).toThrow("End must be after start.");
  });

  it("refuses an end before the start", () => {
    expect(() => log(f, f.ayu, ENG.ayuNorthwind, `${MON}T10:00`, `${MON}T09:00`)).toThrow("End must be after start.");
  });

  it("saves a valid entry with its minutes, work date and week", () => {
    const id = log(f, f.ayu, ENG.ayuNorthwind, `${MON}T09:00`, `${MON}T10:30`, "  Planning  ");
    const row = f.db.prepare("SELECT * FROM time_entries WHERE id = ?").get(id) as Record<string, unknown>;
    expect(row).toMatchObject({
      start_utc: "2026-11-23T02:00:00Z",
      end_utc: "2026-11-23T03:30:00Z",
      minutes: 90,
      work_date: MON,
      week_start: MON,
      note: "Planning",
    });
  });

  it("refuses an entry that ends in the future", () => {
    // NOW is Mon 30 Nov 07:00 in Jakarta.
    expect(() => log(f, f.ayu, ENG.ayuNorthwind, "2026-11-30T06:00", "2026-11-30T08:00")).toThrow(
      "An entry can't end in the future.",
    );
    expect(log(f, f.ayu, ENG.ayuNorthwind, "2026-11-30T06:00", "2026-11-30T07:00")).toBeGreaterThan(0);
  });
});

describe("no overlapping entries", () => {
  beforeEach(() => {
    log(f, f.ayu, ENG.ayuNorthwind, `${MON}T09:00`, `${MON}T11:00`);
  });

  it("refuses an entry that overlaps", () => {
    expect(() => log(f, f.ayu, ENG.ayuNorthwind, `${MON}T10:00`, `${MON}T12:00`)).toThrow(/Overlaps another entry/);
    expect(() => log(f, f.ayu, ENG.ayuNorthwind, `${MON}T08:00`, `${MON}T12:00`)).toThrow(/Overlaps/); // covers it
    expect(() => log(f, f.ayu, ENG.ayuNorthwind, `${MON}T09:30`, `${MON}T10:00`)).toThrow(/Overlaps/); // inside it
  });

  it("allows entries that only touch", () => {
    expect(() => log(f, f.ayu, ENG.ayuNorthwind, `${MON}T11:00`, `${MON}T12:00`)).not.toThrow();
    expect(() => log(f, f.ayu, ENG.ayuNorthwind, `${MON}T08:00`, `${MON}T09:00`)).not.toThrow();
  });

  it("checks across all of the contractor's clients", () => {
    expect(() => log(f, f.ayu, ENG.ayuBluefin, `${MON}T10:00`, `${MON}T12:00`)).toThrow(/Overlaps.*Northwind/);
  });

  it("doesn't compare different contractors", () => {
    expect(() => log(f, f.budi, ENG.budiBluefin, `${MON}T09:00`, `${MON}T11:00`)).not.toThrow();
  });

  it("lets an edited entry keep its own time slot", () => {
    const id = f.db.prepare("SELECT id FROM time_entries").get() as { id: number };
    expect(() =>
      updateEntry(f.db, f.ayu, id.id, { engagementId: ENG.ayuNorthwind, start: `${MON}T09:00`, end: `${MON}T11:30` }, NOW),
    ).not.toThrow();
  });

  it("catches an overnight entry running into the next morning", () => {
    log(f, f.ayu, ENG.ayuNorthwind, `${MON}T22:00`, `${TUE}T02:00`);
    expect(() => log(f, f.ayu, ENG.ayuNorthwind, `${TUE}T01:00`, `${TUE}T03:00`)).toThrow(/Overlaps/);
  });
});

describe("12-hour daily cap", () => {
  it("allows exactly 12:00 in a day and refuses 12:01", () => {
    log(f, f.ayu, ENG.ayuNorthwind, `${MON}T06:00`, `${MON}T12:00`);
    log(f, f.ayu, ENG.ayuNorthwind, `${MON}T13:00`, `${MON}T19:00`); // 12:00 total
    expect(() => log(f, f.ayu, ENG.ayuNorthwind, `${MON}T19:00`, `${MON}T19:01`)).toThrow(
      "That makes 12:01 on Mon 23 Nov. The limit is 12:00 a day.",
    );
  });

  it("counts hours for all clients together", () => {
    log(f, f.ayu, ENG.ayuNorthwind, `${MON}T06:00`, `${MON}T14:00`); // 8h Northwind
    expect(() => log(f, f.ayu, ENG.ayuBluefin, `${MON}T14:00`, `${MON}T18:30`)).toThrow(/12:30/); // +4:30 Bluefin
  });

  it("counts an overnight entry on the day it starts", () => {
    log(f, f.ayu, ENG.ayuNorthwind, `${MON}T10:00`, `${MON}T18:00`); // 8h Monday
    // Monday 20:00 to Tuesday 01:00 is 5h, all on Monday: 13:00 > cap.
    expect(() => log(f, f.ayu, ENG.ayuNorthwind, `${MON}T20:00`, `${TUE}T01:00`)).toThrow(/Mon 23 Nov/);
    // The same hours starting after midnight count on Tuesday instead.
    expect(() => log(f, f.ayu, ENG.ayuNorthwind, `${TUE}T00:00`, `${TUE}T05:00`)).not.toThrow();
  });

  it("doesn't double count an entry being edited", () => {
    const id = log(f, f.ayu, ENG.ayuNorthwind, `${MON}T06:00`, `${MON}T18:00`); // 12h
    expect(() =>
      updateEntry(f.db, f.ayu, id, { engagementId: ENG.ayuNorthwind, start: `${MON}T06:00`, end: `${MON}T17:00` }, NOW),
    ).not.toThrow();
  });
});

describe("a submitted week locks its entries", () => {
  let entryId: number;
  beforeEach(() => {
    entryId = log(f, f.ayu, ENG.ayuNorthwind, `${MON}T09:00`, `${MON}T10:00`);
    submitWeek(f.db, f.ayu, { engagementId: ENG.ayuNorthwind, weekStart: MON }, NOW);
  });

  it("refuses new entries, edits and deletes in a submitted week", () => {
    expect(() => log(f, f.ayu, ENG.ayuNorthwind, `${TUE}T09:00`, `${TUE}T10:00`)).toThrow(/submitted, so its entries are locked/);
    expect(() =>
      updateEntry(f.db, f.ayu, entryId, { engagementId: ENG.ayuNorthwind, start: `${MON}T09:00`, end: `${MON}T09:30` }, NOW),
    ).toThrow(ValidationError);
    expect(() => deleteEntry(f.db, f.ayu, entryId)).toThrow(ValidationError);
    expect(entryCount(f.db)).toBe(1);
  });

  it("stays locked once approved", () => {
    approveWeek(f.db, f.northwind, weekId(ENG.ayuNorthwind, MON), NOW);
    expect(() => deleteEntry(f.db, f.ayu, entryId)).toThrow(/approved, so its entries are locked/);
  });

  it("reopens when rejected", () => {
    rejectWeek(f.db, f.northwind, weekId(ENG.ayuNorthwind, MON), "Please split the meeting out.", NOW);
    expect(() => deleteEntry(f.db, f.ayu, entryId)).not.toThrow();
  });

  it("refuses moving an entry out of a locked week into an open one", () => {
    expect(() =>
      updateEntry(f.db, f.ayu, entryId, { engagementId: ENG.ayuNorthwind, start: "2026-11-17T09:00", end: "2026-11-17T10:00" }, NOW),
    ).toThrow(/week of Mon 23 Nov is submitted/);
  });

  it("refuses moving an entry from an open week into a locked one", () => {
    const open = log(f, f.ayu, ENG.ayuNorthwind, "2026-11-17T09:00", "2026-11-17T10:00"); // week of 16 Nov, draft
    expect(() =>
      updateEntry(f.db, f.ayu, open, { engagementId: ENG.ayuNorthwind, start: `${TUE}T09:00`, end: `${TUE}T10:00` }, NOW),
    ).toThrow(/locked/);
  });

  it("only locks that client's week: the same days for another client stay open", () => {
    expect(() => log(f, f.ayu, ENG.ayuBluefin, `${TUE}T09:00`, `${TUE}T10:00`)).not.toThrow();
  });
});

describe("daylight saving (contractor in New York)", () => {
  it("refuses a time that happens twice when clocks go back, instead of guessing", () => {
    expect(() => log(f, f.nick, ENG.nickNorthwind, "2026-11-01T00:30", "2026-11-01T01:30")).toThrow(
      "01:30 on Sun 1 Nov happens twice (clocks go back). Pick a time outside that hour.",
    );
  });

  it("stores real minutes across the change: 00:00 to 03:00 is 4 hours", () => {
    const id = log(f, f.nick, ENG.nickNorthwind, "2026-11-01T00:00", "2026-11-01T03:00");
    expect(f.db.prepare("SELECT minutes FROM time_entries WHERE id = ?").get(id)).toEqual({ minutes: 240 });
  });
});

describe("input checks", () => {
  it("refuses malformed times", () => {
    expect(() => createEntry(f.db, f.ayu, { engagementId: ENG.ayuNorthwind, start: "yesterday", end: "today" }, NOW)).toThrow(
      "Start isn't a valid date and time.",
    );
  });

  it("refuses very long notes", () => {
    expect(() => log(f, f.ayu, ENG.ayuNorthwind, `${MON}T09:00`, `${MON}T10:00`, "x".repeat(501))).toThrow(/under 500/);
  });
});
