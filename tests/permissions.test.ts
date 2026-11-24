/**
 * Server-side permission checks. These call the services directly, the same code the
 * Server Actions call, so they hold no matter what the UI shows or hides.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createEntry, deleteEntry, updateEntry } from "../src/server/entries";
import { ForbiddenError } from "../src/server/errors";
import { getInvoice } from "../src/server/invoice";
import { getContractorWeek, getReviewQueue, getReviewWeek } from "../src/server/queries";
import { approveWeek, rejectWeek, submitWeek } from "../src/server/weeks";
import { ENG, entryCount, log, NOW, setup, type Fixture } from "./fixtures";

let f: Fixture;
let ayuEntry: number;
let ayuWeek: number; // Ayu's week for Northwind, submitted
const MON = "2026-11-23";

beforeEach(() => {
  f = setup();
  ayuEntry = log(f, f.ayu, ENG.ayuNorthwind, `${MON}T09:00`, `${MON}T10:00`);
  log(f, f.ayu, ENG.ayuNorthwind, `${MON}T11:00`, `${MON}T12:00`);
  ayuWeek = submitWeek(f.db, f.ayu, { engagementId: ENG.ayuNorthwind, weekStart: MON }, NOW);
});

describe("contractors can only touch their own entries", () => {
  it("Budi can't add an entry to Ayu's client engagement", () => {
    expect(() =>
      createEntry(f.db, f.budi, { engagementId: ENG.ayuBluefin, start: `${MON}T09:00`, end: `${MON}T10:00` }, NOW),
    ).toThrow(ForbiddenError);
  });

  it("Budi can't edit or delete Ayu's entry", () => {
    // Use Ayu's open (Bluefin) week so the only thing stopping Budi is ownership, not a lock.
    const open = log(f, f.ayu, ENG.ayuBluefin, `${MON}T13:00`, `${MON}T14:00`);
    expect(() =>
      updateEntry(f.db, f.budi, open, { engagementId: ENG.budiBluefin, start: `${MON}T13:00`, end: `${MON}T15:00` }, NOW),
    ).toThrow(ForbiddenError);
    expect(() => deleteEntry(f.db, f.budi, open)).toThrow(ForbiddenError);
    expect(entryCount(f.db)).toBe(3);
  });

  it("Ayu can't move her own entry onto someone else's engagement", () => {
    const open = log(f, f.ayu, ENG.ayuBluefin, `${MON}T13:00`, `${MON}T14:00`);
    expect(() =>
      updateEntry(f.db, f.ayu, open, { engagementId: ENG.budiBluefin, start: `${MON}T13:00`, end: `${MON}T14:00` }, NOW),
    ).toThrow(ForbiddenError);
  });

  it("Budi can't submit Ayu's week", () => {
    expect(() => submitWeek(f.db, f.budi, { engagementId: ENG.ayuBluefin, weekStart: MON }, NOW)).toThrow(ForbiddenError);
  });

  it("a contractor can't approve or reject, even their own week", () => {
    expect(() => approveWeek(f.db, f.ayu, ayuWeek, NOW)).toThrow(ForbiddenError);
    expect(() => rejectWeek(f.db, f.ayu, ayuWeek, "no", NOW)).toThrow(ForbiddenError);
  });

  it("only sees their own entries", () => {
    log(f, f.budi, ENG.budiBluefin, `${MON}T09:00`, `${MON}T10:00`);
    const week = getContractorWeek(f.db, f.budi, MON, NOW);
    expect(week.totalMinutes).toBe(60);
    expect(week.engagements.map((e) => e.clientName)).toEqual(["Bluefin"]);
  });
});

describe("clients can only decide their own contractors' weeks", () => {
  it("Bluefin can't approve or reject Ayu's Northwind week", () => {
    expect(() => approveWeek(f.db, f.bluefin, ayuWeek, NOW)).toThrow(ForbiddenError);
    expect(() => rejectWeek(f.db, f.bluefin, ayuWeek, "no", NOW)).toThrow(ForbiddenError);
    const row = f.db.prepare("SELECT status FROM weeks WHERE id = ?").get(ayuWeek) as { status: string };
    expect(row.status).toBe("submitted");
  });

  it("Bluefin can't open that week or see it in the queue", () => {
    expect(() => getReviewWeek(f.db, f.bluefin, ayuWeek)).toThrow(ForbiddenError);
    expect(getReviewQueue(f.db, f.bluefin).waiting).toEqual([]);
    expect(getReviewQueue(f.db, f.northwind).waiting.map((w) => w.weekId)).toEqual([ayuWeek]);
  });

  it("a client can't create entries", () => {
    expect(() =>
      createEntry(f.db, f.northwind, { engagementId: ENG.ayuNorthwind, start: `${MON}T13:00`, end: `${MON}T14:00` }, NOW),
    ).toThrow(ForbiddenError);
  });
});

describe("invoices are scoped to the signed-in client", () => {
  it("Bluefin's invoice never includes Northwind's hours", () => {
    approveWeek(f.db, f.northwind, ayuWeek, NOW);
    expect(getInvoice(f.db, f.bluefin, "2026-11-01", "2026-11-30").lines).toEqual([]);
    expect(getInvoice(f.db, f.northwind, "2026-11-01", "2026-11-30").lines).toHaveLength(1);
  });

  it("a contractor can't open an invoice", () => {
    expect(() => getInvoice(f.db, f.ayu, "2026-11-01", "2026-11-30")).toThrow(ForbiddenError);
  });
});
