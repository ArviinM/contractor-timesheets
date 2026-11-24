/**
 * The same hours seen from different time zones. The contractor's zone decides the work date and
 * the week; each client sees the times on their own clock, grouped by their own days.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { loadActor, type Actor } from "../src/server/actor";
import { getInvoice } from "../src/server/invoice";
import { getContractorWeek, getReviewWeek } from "../src/server/queries";
import { approveWeek, submitWeek } from "../src/server/weeks";
import { ENG, log, NOW, setup, type Fixture } from "./fixtures";

let f: Fixture;
beforeEach(() => {
  f = setup();
});

function reviewFor(client: Actor, engagementId: number, contractor: Actor, monday: string) {
  const weekId = submitWeek(f.db, contractor, { engagementId, weekStart: monday }, NOW);
  return { weekId, review: getReviewWeek(f.db, client, weekId) };
}

describe("a client behind the contractor (New York, 12 hours behind Jakarta)", () => {
  it("shows a Jakarta Monday-morning entry on Sunday evening, still counted on Monday", () => {
    log(f, f.ayu, ENG.ayuNorthwind, "2026-11-23T06:00", "2026-11-23T08:00");
    const { review } = reviewFor(f.northwind, ENG.ayuNorthwind, f.ayu, "2026-11-23");
    expect(review.week.weekStart).toBe("2026-11-23");
    expect(review.days).toHaveLength(1);
    expect(review.days[0].date).toBe("2026-11-22"); // Sunday in New York
    expect(review.days[0].entries[0]).toMatchObject({
      clientStart: "18:00",
      clientEnd: "20:00",
      contractorStart: "06:00",
      contractorEnd: "08:00",
      workDate: "2026-11-23", // counts on Monday
      minutes: 120,
    });
  });

  it("splits one Jakarta day across two New York days when the work spans their midnight", () => {
    log(f, f.ayu, ENG.ayuNorthwind, "2026-11-24T09:00", "2026-11-24T11:00"); // Mon 21:00-23:00 New York
    log(f, f.ayu, ENG.ayuNorthwind, "2026-11-24T13:00", "2026-11-24T15:00"); // Tue 01:00-03:00 New York
    const { review } = reviewFor(f.northwind, ENG.ayuNorthwind, f.ayu, "2026-11-23");
    expect(review.days.map((d) => [d.date, d.minutes])).toEqual([
      ["2026-11-23", 120],
      ["2026-11-24", 120],
    ]);
    expect(review.days.flatMap((d) => d.entries.map((e) => e.workDate))).toEqual(["2026-11-24", "2026-11-24"]);
  });
});

describe("a client in London", () => {
  it("shows Jakarta 09:00 as 02:00 the same day", () => {
    log(f, f.ayu, ENG.ayuBluefin, "2026-11-23T09:00", "2026-11-23T10:00");
    const { review } = reviewFor(f.bluefin, ENG.ayuBluefin, f.ayu, "2026-11-23");
    expect(review.days[0].date).toBe("2026-11-23");
    expect(review.days[0].entries[0]).toMatchObject({ clientStart: "02:00", clientEnd: "03:00" });
  });
});

describe("a client ahead of the contractor (Auckland, 6 hours ahead of Jakarta in November)", () => {
  it("shows a Monday-night Jakarta entry on Tuesday, still counted on Monday", () => {
    f.db.prepare("UPDATE users SET time_zone = 'Pacific/Auckland' WHERE id = ?").run(f.bluefin.id);
    const auckland = loadActor(f.db, f.bluefin.id) as Actor;
    log(f, f.ayu, ENG.ayuBluefin, "2026-11-23T22:00", "2026-11-23T23:30");
    const { review } = reviewFor(auckland, ENG.ayuBluefin, f.ayu, "2026-11-23");
    expect(review.days[0].date).toBe("2026-11-24"); // Tuesday in Auckland
    expect(review.days[0].entries[0]).toMatchObject({ clientStart: "04:00", workDate: "2026-11-23" });
  });

  it("bills the entry by the contractor's date, whatever the client's calendar says", () => {
    f.db.prepare("UPDATE users SET time_zone = 'Pacific/Auckland' WHERE id = ?").run(f.bluefin.id);
    const auckland = loadActor(f.db, f.bluefin.id) as Actor;
    log(f, f.ayu, ENG.ayuBluefin, "2026-11-29T22:00", "2026-11-29T23:00"); // Sunday in Jakarta, Monday in Auckland
    const { weekId } = reviewFor(auckland, ENG.ayuBluefin, f.ayu, "2026-11-23");
    approveWeek(f.db, auckland, weekId, NOW);
    expect(getInvoice(f.db, auckland, "2026-11-29", "2026-11-29").lines[0]).toMatchObject({ minutes: 60 });
    expect(getInvoice(f.db, auckland, "2026-11-30", "2026-11-30").lines).toHaveLength(0);
  });
});

describe("a contractor outside Jakarta (New York, across the clock change)", () => {
  it("builds their week from New York days and counts the 25-hour Sunday in real minutes", () => {
    log(f, f.nick, ENG.nickNorthwind, "2026-11-01T00:00", "2026-11-01T03:00"); // 4 real hours
    log(f, f.nick, ENG.nickNorthwind, "2026-11-01T23:00", "2026-11-02T00:30"); // Sunday night into Monday
    const week = getContractorWeek(f.db, f.nick, "2026-10-26", NOW);
    expect(week.weekStart).toBe("2026-10-26");
    const sunday = week.days.find((d) => d.date === "2026-11-01");
    expect(sunday?.minutes).toBe(240 + 90);
    expect(week.totalMinutes).toBe(330);
    // Nothing leaks into the next week: Monday 2 Nov's week is empty.
    expect(getContractorWeek(f.db, f.nick, "2026-11-02", NOW).totalMinutes).toBe(0);
  });
});
