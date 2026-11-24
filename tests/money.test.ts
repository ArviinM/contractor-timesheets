import { describe, expect, it } from "vitest";
import { formatHours, formatUsd, lineAmountCents, sumCents } from "../src/server/money";

describe("line amount (minutes x cents per hour / 60, half up, once per line)", () => {
  it("7h20m at $33.33/h is exactly $244.42", () => {
    // 440 x 3333 / 60 = 24442.0 cents
    expect(lineAmountCents(440, 3333)).toBe(24442);
  });

  it("rounds down below half a cent: 10 min at $25.03/h = $4.17", () => {
    // 10 x 2503 / 60 = 417.17 cents
    expect(lineAmountCents(10, 2503)).toBe(417);
  });

  it("rounds half a cent up: 1 min at $30.30/h = $0.51", () => {
    // 1 x 3030 / 60 = 50.5 cents
    expect(lineAmountCents(1, 3030)).toBe(51);
  });

  it("is zero for zero minutes", () => {
    expect(lineAmountCents(0, 3333)).toBe(0);
  });
});

describe("totals have no floating-point drift", () => {
  it("ten lines of 6 minutes at $1.00/h add up to exactly $1.00", () => {
    const lines = Array.from({ length: 10 }, () => lineAmountCents(6, 100));
    expect(sumCents(lines)).toBe(100);
    // The float version of the same sum is not exact:
    expect(Array.from({ length: 10 }, () => 0.1).reduce((a, b) => a + b, 0)).not.toBe(1);
  });
});

describe("guards", () => {
  it("refuses fractions, negatives and amounts too large to be exact", () => {
    expect(() => lineAmountCents(1.5, 100)).toThrow(RangeError);
    expect(() => lineAmountCents(-1, 100)).toThrow(RangeError);
    expect(() => lineAmountCents(60, 33.33)).toThrow(RangeError);
    expect(() => lineAmountCents(Number.MAX_SAFE_INTEGER, 100)).toThrow(RangeError);
  });
});

describe("display", () => {
  it("formats cents as USD", () => {
    expect(formatUsd(24442)).toBe("$244.42");
    expect(formatUsd(5)).toBe("$0.05");
    expect(formatUsd(123456789)).toBe("$1,234,567.89");
  });

  it("formats minutes as h:mm, never rounded decimals", () => {
    expect(formatHours(440)).toBe("7:20");
    expect(formatHours(720)).toBe("12:00");
    expect(formatHours(5)).toBe("0:05");
  });
});
