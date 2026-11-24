import { describe, expect, it } from "vitest";
import { ValidationError } from "../src/server/errors";
import { parseEntryInput, parseId, parseOptionalText, parseText } from "../src/server/input";

// Server Action arguments come from the network, so anything can arrive.
describe("action input checks", () => {
  it("accepts positive whole-number ids, as numbers or digit strings", () => {
    expect(parseId(7)).toBe(7);
    expect(parseId("7")).toBe(7);
  });

  it("refuses anything else as an id", () => {
    for (const bad of [0, -1, 1.5, "0", "1e3", " 7", "", null, undefined, [], {}, [7], NaN, Number.MAX_VALUE]) {
      expect(() => parseId(bad), String(bad)).toThrow(ValidationError);
    }
  });

  it("accepts strings and treats missing text as empty", () => {
    expect(parseText("hi")).toBe("hi");
    expect(parseText(undefined)).toBe("");
    expect(parseText(null)).toBe("");
    expect(() => parseText(5)).toThrow(ValidationError);
    expect(() => parseText({ toString: () => "x" })).toThrow(ValidationError);
    expect(parseOptionalText(undefined)).toBeUndefined();
    expect(() => parseOptionalText(1)).toThrow(ValidationError);
  });

  it("checks the whole entry object", () => {
    expect(parseEntryInput({ engagementId: "2", start: "a", end: "b" })).toEqual({
      engagementId: 2,
      start: "a",
      end: "b",
      note: "",
    });
    for (const bad of [null, "x", [], { engagementId: 2, start: 1, end: "b" }, { start: "a", end: "b" }]) {
      expect(() => parseEntryInput(bad)).toThrow(ValidationError);
    }
  });
});
