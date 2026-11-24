import { describe, expect, it } from "vitest";
import { openDatabase } from "../src/server/db";
import { seed } from "../src/server/seed";

// The seed is relative to "now" and goes through the real rules, so check awkward moments too.
const moments = {
  "Monday just after midnight in Jakarta": "2026-11-22T17:30:00Z",
  "Friday evening in Jakarta": "2026-11-27T13:00:00Z",
  "Sunday late night in Jakarta": "2026-11-29T16:59:00Z",
  "New York daylight-saving day": "2026-11-01T12:00:00Z",
};

describe("seed data", () => {
  for (const [name, iso] of Object.entries(moments)) {
    it(`loads cleanly: ${name}`, () => {
      const db = openDatabase(":memory:");
      expect(() => seed(db, new Date(iso))).not.toThrow();
      const statuses = db.prepare("SELECT status, COUNT(*) AS n FROM weeks GROUP BY status ORDER BY status").all();
      expect(statuses).toEqual([
        { status: "approved", n: 6 },
        { status: "rejected", n: 1 },
        { status: "submitted", n: 3 },
      ]);
    });
  }
});
