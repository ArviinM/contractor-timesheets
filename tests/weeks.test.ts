import { beforeEach, describe, expect, it } from "vitest";
import { approveWeek, getWeekStatus, rejectWeek, submitWeek } from "../src/server/weeks";
import { ENG, log, NOW, setup, type Fixture } from "./fixtures";

let f: Fixture;
const MON = "2026-11-23";
const submit = () => submitWeek(f.db, f.ayu, { engagementId: ENG.ayuNorthwind, weekStart: MON }, NOW);

beforeEach(() => {
  f = setup();
});

describe("submitting a week", () => {
  it("refuses an empty week", () => {
    expect(submit).toThrow("Add at least one entry before submitting the week.");
  });

  it("refuses a date that isn't a Monday", () => {
    log(f, f.ayu, ENG.ayuNorthwind, `${MON}T09:00`, `${MON}T10:00`);
    expect(() => submitWeek(f.db, f.ayu, { engagementId: ENG.ayuNorthwind, weekStart: "2026-11-24" }, NOW)).toThrow(
      "A week starts on a Monday.",
    );
  });

  it("submits once, then refuses a second submit", () => {
    log(f, f.ayu, ENG.ayuNorthwind, `${MON}T09:00`, `${MON}T10:00`);
    submit();
    expect(getWeekStatus(f.db, ENG.ayuNorthwind, MON)).toBe("submitted");
    expect(submit).toThrow("This week is already submitted.");
  });

  it("is per client: submitting Northwind's week leaves Bluefin's as a draft", () => {
    log(f, f.ayu, ENG.ayuNorthwind, `${MON}T09:00`, `${MON}T10:00`);
    log(f, f.ayu, ENG.ayuBluefin, `${MON}T10:00`, `${MON}T11:00`);
    submit();
    expect(getWeekStatus(f.db, ENG.ayuBluefin, MON)).toBe("draft");
  });
});

describe("approving and rejecting", () => {
  let weekId: number;
  beforeEach(() => {
    log(f, f.ayu, ENG.ayuNorthwind, `${MON}T09:00`, `${MON}T10:00`);
    weekId = submit();
  });

  it("approves a submitted week and locks in the current rate", () => {
    approveWeek(f.db, f.northwind, weekId, NOW);
    const row = f.db.prepare("SELECT status, approved_rate_cents, decided_by FROM weeks WHERE id = ?").get(weekId);
    expect(row).toEqual({ status: "approved", approved_rate_cents: 3333, decided_by: f.northwind.id });
  });

  it("rejects with a comment, and the comment is kept", () => {
    rejectWeek(f.db, f.northwind, weekId, "  Monday's call was internal.  ", NOW);
    const row = f.db.prepare("SELECT status, reject_comment FROM weeks WHERE id = ?").get(weekId);
    expect(row).toEqual({ status: "rejected", reject_comment: "Monday's call was internal." });
  });

  it("requires a comment to reject", () => {
    expect(() => rejectWeek(f.db, f.northwind, weekId, "", NOW)).toThrow("Add a comment so the contractor knows what to fix.");
    expect(() => rejectWeek(f.db, f.northwind, weekId, "   ", NOW)).toThrow(/Add a comment/);
    expect(getWeekStatus(f.db, ENG.ayuNorthwind, MON)).toBe("submitted");
  });

  it("lets a rejected week be fixed and resubmitted", () => {
    rejectWeek(f.db, f.northwind, weekId, "Wrong day.", NOW);
    log(f, f.ayu, ENG.ayuNorthwind, `${MON}T10:00`, `${MON}T11:00`);
    expect(submit()).toBe(weekId);
    expect(getWeekStatus(f.db, ENG.ayuNorthwind, MON)).toBe("submitted");
  });

  it("treats approval as final", () => {
    approveWeek(f.db, f.northwind, weekId, NOW);
    expect(() => rejectWeek(f.db, f.northwind, weekId, "Changed my mind", NOW)).toThrow(
      "Only a submitted week can be rejected.",
    );
    expect(() => approveWeek(f.db, f.northwind, weekId, NOW)).toThrow("Only a submitted week can be approved.");
    expect(submit).toThrow("This week is already approved.");
  });

  it("can't approve a rejected week until it's resubmitted", () => {
    rejectWeek(f.db, f.northwind, weekId, "Fix Monday.", NOW);
    expect(() => approveWeek(f.db, f.northwind, weekId, NOW)).toThrow("Only a submitted week can be approved.");
  });
});
