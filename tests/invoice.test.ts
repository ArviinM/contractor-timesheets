import { beforeEach, describe, expect, it } from "vitest";
import { getInvoice } from "../src/server/invoice";
import { approveWeek, rejectWeek, submitWeek } from "../src/server/weeks";
import { ENG, log, NOW, setup, type Fixture } from "./fixtures";

let f: Fixture;

function submit(engagementId: number, weekStart: string) {
  const who = engagementId === ENG.budiBluefin ? f.budi : f.ayu;
  return submitWeek(f.db, who, { engagementId, weekStart }, NOW);
}

beforeEach(() => {
  f = setup();
});

describe("invoice amounts", () => {
  it("bills approved minutes x rate, exact to the cent", () => {
    // 7h20m in one week at $33.33/h.
    log(f, f.ayu, ENG.ayuNorthwind, "2026-11-23T09:00", "2026-11-23T13:00");
    log(f, f.ayu, ENG.ayuNorthwind, "2026-11-24T09:00", "2026-11-24T12:20");
    approveWeek(f.db, f.northwind, submit(ENG.ayuNorthwind, "2026-11-23"), NOW);

    const invoice = getInvoice(f.db, f.northwind, "2026-11-01", "2026-11-30");
    expect(invoice.lines).toHaveLength(1);
    expect(invoice.lines[0]).toMatchObject({ minutes: 440, rateCents: 3333, amountCents: 24442 });
    expect(invoice.totalCents).toBe(24442);
  });

  it("rounds once per line (one approved week), not per entry", () => {
    // Three 10-minute entries at $25.03/h.
    f.db.prepare("UPDATE engagements SET hourly_rate_cents = 2503 WHERE id = ?").run(ENG.budiBluefin);
    log(f, f.budi, ENG.budiBluefin, "2026-11-23T09:00", "2026-11-23T09:10");
    log(f, f.budi, ENG.budiBluefin, "2026-11-24T09:00", "2026-11-24T09:10");
    log(f, f.budi, ENG.budiBluefin, "2026-11-25T09:00", "2026-11-25T09:10");
    approveWeek(f.db, f.bluefin, submit(ENG.budiBluefin, "2026-11-23"), NOW);
    // Per entry: 3 x round(417.17) = 1251. Per line: round(30 x 2503 / 60 = 1251.5) = 1252.
    expect(getInvoice(f.db, f.bluefin, "2026-11-23", "2026-11-29").totalCents).toBe(1252);
  });

  it("adds many small lines without drift", () => {
    // Ten approved weeks of 6 minutes at $1.00/h = ten lines of $0.10 = $1.00 exactly.
    f.db.prepare("UPDATE engagements SET hourly_rate_cents = 100 WHERE id = ?").run(ENG.ayuNorthwind);
    const mondays = Array.from({ length: 10 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 8, 21 + 7 * i)); // Mondays from 21 Sep 2026
      return d.toISOString().slice(0, 10);
    });
    for (const monday of mondays) {
      log(f, f.ayu, ENG.ayuNorthwind, `${monday}T09:00`, `${monday}T09:06`);
      approveWeek(f.db, f.northwind, submit(ENG.ayuNorthwind, monday), NOW);
    }
    const invoice = getInvoice(f.db, f.northwind, "2026-09-01", "2026-11-30");
    expect(invoice.lines).toHaveLength(10);
    expect(invoice.totalCents).toBe(100);
  });
});

describe("what goes on the invoice", () => {
  beforeEach(() => {
    log(f, f.ayu, ENG.ayuNorthwind, "2026-11-16T09:00", "2026-11-16T10:00"); // week of 16 Nov
    log(f, f.ayu, ENG.ayuNorthwind, "2026-11-23T09:00", "2026-11-23T10:00"); // week of 23 Nov, Monday
    log(f, f.ayu, ENG.ayuNorthwind, "2026-11-29T09:00", "2026-11-29T11:00"); // week of 23 Nov, Sunday
  });

  it("only counts approved weeks, and lists the rest as not invoiced", () => {
    submit(ENG.ayuNorthwind, "2026-11-16"); // submitted, not approved
    const invoice = getInvoice(f.db, f.northwind, "2026-11-01", "2026-11-30");
    expect(invoice.lines).toHaveLength(0);
    expect(invoice.totalCents).toBe(0);
    expect(invoice.notInvoiced.map((n) => [n.weekStart, n.status, n.minutes])).toEqual([
      ["2026-11-16", "submitted", 60],
      ["2026-11-23", "draft", 180],
    ]);
  });

  it("leaves out rejected weeks", () => {
    rejectWeek(f.db, f.northwind, submit(ENG.ayuNorthwind, "2026-11-16"), "Not ours.", NOW);
    const invoice = getInvoice(f.db, f.northwind, "2026-11-01", "2026-11-30");
    expect(invoice.lines).toHaveLength(0);
    expect(invoice.notInvoiced[0]).toMatchObject({ status: "rejected" });
  });

  it("includes both ends of the date range, by the contractor's work date", () => {
    approveWeek(f.db, f.northwind, submit(ENG.ayuNorthwind, "2026-11-23"), NOW);
    // Only the Sunday: 2 hours.
    const sunday = getInvoice(f.db, f.northwind, "2026-11-29", "2026-11-29");
    expect(sunday.lines[0]).toMatchObject({ minutes: 120, partial: true, periodFrom: "2026-11-29", periodTo: "2026-11-29" });
    // Monday to Sunday: 3 hours, whole week.
    const week = getInvoice(f.db, f.northwind, "2026-11-23", "2026-11-29");
    expect(week.lines[0]).toMatchObject({ minutes: 180, partial: false });
  });

  it("uses the contractor's day, not the client's: a Monday 06:00 Jakarta entry is Sunday in New York but bills as Monday", () => {
    log(f, f.ayu, ENG.ayuNorthwind, "2026-11-30T06:00", "2026-11-30T07:00"); // Sun 29 Nov 18:00 in New York
    const day = new Date("2026-12-01T00:00:00Z");
    approveWeek(f.db, f.northwind, submitWeek(f.db, f.ayu, { engagementId: ENG.ayuNorthwind, weekStart: "2026-11-30" }, day), day);
    expect(getInvoice(f.db, f.northwind, "2026-11-29", "2026-11-29").lines).toHaveLength(0);
    expect(getInvoice(f.db, f.northwind, "2026-11-30", "2026-11-30").lines[0]).toMatchObject({ minutes: 60 });
  });

  it("keeps the rate locked at approval, even after the rate changes", () => {
    approveWeek(f.db, f.northwind, submit(ENG.ayuNorthwind, "2026-11-23"), NOW);
    f.db.prepare("UPDATE engagements SET hourly_rate_cents = 9999 WHERE id = ?").run(ENG.ayuNorthwind);
    const line = getInvoice(f.db, f.northwind, "2026-11-23", "2026-11-29").lines[0];
    expect(line.rateCents).toBe(3333);
    expect(line.amountCents).toBe(9999); // 180 min x $33.33 = $99.99
  });
});

describe("date range checks", () => {
  it("refuses bad or reversed ranges", () => {
    expect(() => getInvoice(f.db, f.northwind, "2026-11-30", "2026-11-01")).toThrow(/on or before/);
    expect(() => getInvoice(f.db, f.northwind, "nope", "2026-11-01")).toThrow(/valid date range/);
  });
});
