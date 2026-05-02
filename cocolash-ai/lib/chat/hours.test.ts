/**
 * Unit tests for the EST business-hours check.
 *
 * Each test pins a UTC instant and asserts the expected EST evaluation.
 * EST = UTC-5 in winter, UTC-4 in summer (EDT). DST tests cover both.
 */

import { describe, it, expect } from "vitest";
import { getBusinessHoursState, isBusinessHours } from "./hours";

describe("getBusinessHoursState", () => {
  it("Monday 14:00 EST (winter) is inside hours", () => {
    // 2026-01-12 19:00 UTC = 14:00 EST (Mon)
    const d = new Date("2026-01-12T19:00:00Z");
    const s = getBusinessHoursState(d);
    expect(s.weekday).toBe(1);
    expect(s.hour).toBe(14);
    expect(s.isBusinessHours).toBe(true);
  });

  it("Friday 16:30 EDT (summer) is inside hours", () => {
    // 2026-07-10 20:30 UTC = 16:30 EDT (Fri)
    const d = new Date("2026-07-10T20:30:00Z");
    const s = getBusinessHoursState(d);
    expect(s.weekday).toBe(5);
    expect(s.hour).toBe(16);
    expect(s.isBusinessHours).toBe(true);
  });

  it("Saturday is outside hours", () => {
    // 2026-01-10 17:00 UTC = 12:00 EST (Sat)
    const d = new Date("2026-01-10T17:00:00Z");
    const s = getBusinessHoursState(d);
    expect(s.weekday).toBe(6);
    expect(s.isBusinessHours).toBe(false);
  });

  it("Sunday is outside hours", () => {
    // 2026-07-12 17:00 UTC = 13:00 EDT (Sun)
    const d = new Date("2026-07-12T17:00:00Z");
    const s = getBusinessHoursState(d);
    expect(s.weekday).toBe(0);
    expect(s.isBusinessHours).toBe(false);
  });

  it("Mon 8:59 EST is outside (before 9)", () => {
    // 2026-01-12 13:59 UTC = 8:59 EST
    const d = new Date("2026-01-12T13:59:00Z");
    const s = getBusinessHoursState(d);
    expect(s.hour).toBe(8);
    expect(s.isBusinessHours).toBe(false);
  });

  it("Mon 17:00 EST is outside (cutoff exclusive)", () => {
    // 2026-01-12 22:00 UTC = 17:00 EST
    const d = new Date("2026-01-12T22:00:00Z");
    const s = getBusinessHoursState(d);
    expect(s.hour).toBe(17);
    expect(s.isBusinessHours).toBe(false);
  });

  it("Mon 9:00 EST is inside (lower bound inclusive)", () => {
    // 2026-01-12 14:00 UTC = 9:00 EST
    const d = new Date("2026-01-12T14:00:00Z");
    const s = getBusinessHoursState(d);
    expect(s.hour).toBe(9);
    expect(s.isBusinessHours).toBe(true);
  });
});

describe("isBusinessHours", () => {
  it("is a thin wrapper", () => {
    const d = new Date("2026-01-12T19:00:00Z"); // Mon 14:00 EST
    expect(isBusinessHours(d)).toBe(true);
  });
});
