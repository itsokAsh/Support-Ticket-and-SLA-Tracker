import { describe, test, expect } from "bun:test";
import { addBusinessMinutes, businessMinutesBetween } from "../../src/services/sla/businessHours";
import { deriveSLAClockState, deriveSLAInfo } from "../../src/services/sla/slaState";
import { getSLAPolicy } from "../../src/services/sla/slaConfig";

/**
 * SLA Engine Unit Tests
 *
 * All tests use Asia/Kolkata (UTC+5:30) as the business timezone,
 * matching the default configuration. Holidays are passed explicitly
 * to keep tests deterministic and self-contained.
 */

const TZ = "Asia/Kolkata";
const NO_HOLIDAYS = new Set<string>();
const opts = { timezone: TZ, holidays: NO_HOLIDAYS };

/**
 * Helper: create a Date from an IST (Asia/Kolkata) time string.
 * IST is UTC+5:30, so we subtract 5:30 to get UTC.
 */
function ist(dateStr: string): Date {
  // Parse as local → treat as IST → convert to UTC
  const [datePart, timePart] = dateStr.split("T");
  if (!datePart || !timePart) throw new Error(`Invalid date string: ${dateStr}`);
  const [y, m, d] = datePart.split("-").map(Number);
  const [h, min] = timePart.split(":").map(Number);
  if (y === undefined || m === undefined || d === undefined || h === undefined || min === undefined) {
    throw new Error(`Invalid date string: ${dateStr}`);
  }
  // IST = UTC + 5:30
  return new Date(Date.UTC(y, m - 1, d, h - 5, min - 30));
}

// ── addBusinessMinutes tests ──

describe("addBusinessMinutes", () => {
  test("normal weekday calculation — 60 minutes from Mon 10:00", () => {
    const start = ist("2026-08-24T10:00"); // Mon
    const result = addBusinessMinutes(start, 60, opts);
    expect(result.getTime()).toBe(ist("2026-08-24T11:00").getTime());
  });

  test("normal weekday — fits within same day", () => {
    const start = ist("2026-08-24T09:00"); // Mon 09:00
    const result = addBusinessMinutes(start, 540, opts); // full day
    expect(result.getTime()).toBe(ist("2026-08-24T18:00").getTime());
  });

  test("ticket created before business hours — Mon 07:00 snaps to 09:00", () => {
    const start = ist("2026-08-24T07:00"); // Mon 07:00
    const result = addBusinessMinutes(start, 60, opts);
    // Should start counting from 09:00, so 60 min → 10:00
    expect(result.getTime()).toBe(ist("2026-08-24T10:00").getTime());
  });

  test("ticket created after business hours — Mon 20:00 starts Tue 09:00", () => {
    const start = ist("2026-08-24T20:00"); // Mon 20:00
    const result = addBusinessMinutes(start, 60, opts);
    // Should start counting from Tue 09:00, so 60 min → Tue 10:00
    expect(result.getTime()).toBe(ist("2026-08-25T10:00").getTime());
  });

  test("Friday evening — only 1 minute counts before weekend", () => {
    const start = ist("2026-08-28T17:59"); // Fri 17:59
    const result = addBusinessMinutes(start, 1, opts);
    // 1 minute from 17:59 → 18:00 (end of business)
    expect(result.getTime()).toBe(ist("2026-08-28T18:00").getTime());
  });

  test("Friday evening — 2 minutes wraps to Monday", () => {
    const start = ist("2026-08-28T17:59"); // Fri 17:59
    const result = addBusinessMinutes(start, 2, opts);
    // 1 min Fri → 18:00, then 1 min Mon → Mon 09:01
    expect(result.getTime()).toBe(ist("2026-08-31T09:01").getTime());
  });

  test("weekend — ticket created on Saturday starts Monday", () => {
    const start = ist("2026-08-29T12:00"); // Sat
    const result = addBusinessMinutes(start, 60, opts);
    // Start from Mon 09:00, 60 min → Mon 10:00
    expect(result.getTime()).toBe(ist("2026-08-31T10:00").getTime());
  });

  test("weekend — ticket created on Sunday starts Monday", () => {
    const start = ist("2026-08-30T14:00"); // Sun
    const result = addBusinessMinutes(start, 120, opts);
    expect(result.getTime()).toBe(ist("2026-08-31T11:00").getTime());
  });

  test("public holiday — Monday is holiday, starts Tuesday", () => {
    const holidays = new Set(["2026-08-31"]); // Mon is holiday
    const start = ist("2026-08-28T17:59"); // Fri 17:59
    const result = addBusinessMinutes(start, 2, { timezone: TZ, holidays });
    // 1 min Fri → 18:00, Mon is holiday, so 1 min Tue → Tue 09:01
    expect(result.getTime()).toBe(ist("2026-09-01T09:01").getTime());
  });

  test("weekend + holiday — Sat/Sun + Mon holiday → starts Tuesday", () => {
    const holidays = new Set(["2026-08-31"]); // Mon is holiday
    const start = ist("2026-08-29T12:00"); // Saturday
    const result = addBusinessMinutes(start, 60, { timezone: TZ, holidays });
    // Sat + Sun skip, Mon holiday skip → Tue 09:00 + 60 min = Tue 10:00
    expect(result.getTime()).toBe(ist("2026-09-01T10:00").getTime());
  });

  test("SLA crossing multiple business days", () => {
    const start = ist("2026-08-24T09:00"); // Mon 09:00
    // 24 business hours = 24 * 60 = 1440 minutes
    // Day 1 (Mon): 540 min, Day 2 (Tue): 540 min, Day 3 (Wed): 360 min
    // 540 + 540 = 1080, remaining 360 → Wed 09:00 + 360 = Wed 15:00
    const result = addBusinessMinutes(start, 1440, opts);
    expect(result.getTime()).toBe(ist("2026-08-26T15:00").getTime());
  });

  test("PLAN.md worked example: HIGH first-response, created Fri 17:00", () => {
    // Priority: HIGH → 4 business hours = 240 minutes
    // Created: Friday 17:00
    // Fri 17:00 → 18:00 = 1 business hour (60 min)
    // Saturday = 0, Sunday = 0
    // Monday 09:00 → 12:00 = 3 business hours (180 min)
    // Total: 60 + 180 = 240 min ✓
    // Due: Monday 12:00
    const start = ist("2026-08-28T17:00"); // Fri 17:00
    const result = addBusinessMinutes(start, 240, opts);
    expect(result.getTime()).toBe(ist("2026-08-31T12:00").getTime());
  });

  test("zero minutes returns the same timestamp", () => {
    const start = ist("2026-08-24T10:00");
    const result = addBusinessMinutes(start, 0, opts);
    expect(result.getTime()).toBe(start.getTime());
  });

  test("exactly one full business day (540 minutes)", () => {
    const start = ist("2026-08-24T09:00"); // Mon
    const result = addBusinessMinutes(start, 540, opts);
    expect(result.getTime()).toBe(ist("2026-08-24T18:00").getTime());
  });

  test("541 minutes spills into next day", () => {
    const start = ist("2026-08-24T09:00"); // Mon
    const result = addBusinessMinutes(start, 541, opts);
    expect(result.getTime()).toBe(ist("2026-08-25T09:01").getTime());
  });
});

// ── businessMinutesBetween tests ──

describe("businessMinutesBetween", () => {
  test("same business day", () => {
    const from = ist("2026-08-24T09:00");
    const to = ist("2026-08-24T12:00");
    expect(businessMinutesBetween(from, to, opts)).toBe(180);
  });

  test("across a weekend", () => {
    const from = ist("2026-08-28T17:00"); // Fri 17:00
    const to = ist("2026-08-31T10:00"); // Mon 10:00
    // Fri: 60 min, Sat: 0, Sun: 0, Mon: 60 min = 120
    expect(businessMinutesBetween(from, to, opts)).toBe(120);
  });

  test("from before business hours", () => {
    const from = ist("2026-08-24T07:00"); // Mon 07:00
    const to = ist("2026-08-24T10:00"); // Mon 10:00
    // Starts counting at 09:00 → 10:00 = 60 min
    expect(businessMinutesBetween(from, to, opts)).toBe(60);
  });

  test("from after business hours to next day", () => {
    const from = ist("2026-08-24T20:00"); // Mon 20:00
    const to = ist("2026-08-25T10:00"); // Tue 10:00
    // Starts counting at Tue 09:00 → 10:00 = 60 min
    expect(businessMinutesBetween(from, to, opts)).toBe(60);
  });

  test("to equals from returns 0", () => {
    const date = ist("2026-08-24T10:00");
    expect(businessMinutesBetween(date, date, opts)).toBe(0);
  });

  test("to before from returns 0", () => {
    const from = ist("2026-08-24T12:00");
    const to = ist("2026-08-24T10:00");
    expect(businessMinutesBetween(from, to, opts)).toBe(0);
  });

  test("with holiday", () => {
    const holidays = new Set(["2026-08-25"]); // Tue is holiday
    const from = ist("2026-08-24T17:00"); // Mon 17:00
    const to = ist("2026-08-26T10:00"); // Wed 10:00
    // Mon: 60 min, Tue: 0 (holiday), Wed: 60 min = 120
    expect(businessMinutesBetween(from, to, { timezone: TZ, holidays })).toBe(120);
  });
});

// ── SLA state derivation tests ──

describe("deriveSLAClockState", () => {
  test("ON_TRACK — well within deadline", () => {
    const result = deriveSLAClockState({
      dueAt: ist("2026-08-24T14:00"),
      atRiskAt: ist("2026-08-24T12:00"),
      eventAt: null,
      now: ist("2026-08-24T10:00"),
    }, opts);
    expect(result.state).toBe("ON_TRACK");
    expect(result.remainingMinutes).toBeGreaterThan(0);
  });

  test("AT_RISK — past 75% threshold", () => {
    const result = deriveSLAClockState({
      dueAt: ist("2026-08-24T14:00"),
      atRiskAt: ist("2026-08-24T12:00"),
      eventAt: null,
      now: ist("2026-08-24T13:00"), // past atRiskAt, before dueAt
    }, opts);
    expect(result.state).toBe("AT_RISK");
    expect(result.remainingMinutes).toBeGreaterThan(0);
  });

  test("BREACHED — past deadline", () => {
    const result = deriveSLAClockState({
      dueAt: ist("2026-08-24T14:00"),
      atRiskAt: ist("2026-08-24T12:00"),
      eventAt: null,
      now: ist("2026-08-24T15:00"),
    }, opts);
    expect(result.state).toBe("BREACHED");
    expect(result.remainingMinutes).toBe(0);
  });

  test("BREACHED — exactly at deadline", () => {
    const result = deriveSLAClockState({
      dueAt: ist("2026-08-24T14:00"),
      atRiskAt: ist("2026-08-24T12:00"),
      eventAt: null,
      now: ist("2026-08-24T14:00"), // exactly at due
    }, opts);
    expect(result.state).toBe("BREACHED");
  });

  test("ON_TRACK — exactly at atRiskAt (boundary: strictly greater triggers AT_RISK)", () => {
    const result = deriveSLAClockState({
      dueAt: ist("2026-08-24T14:00"),
      atRiskAt: ist("2026-08-24T12:00"),
      eventAt: null,
      now: ist("2026-08-24T12:00"), // exactly at atRiskAt
    }, opts);
    expect(result.state).toBe("ON_TRACK");
  });

  test("completed clock (met) — stays ON_TRACK forever", () => {
    const result = deriveSLAClockState({
      dueAt: ist("2026-08-24T14:00"),
      atRiskAt: ist("2026-08-24T12:00"),
      eventAt: ist("2026-08-24T11:00"), // met before deadline
      now: ist("2026-08-28T18:00"), // way past deadline — doesn't matter
    }, opts);
    expect(result.state).toBe("ON_TRACK");
    expect(result.remainingMinutes).toBe(0);
  });

  test("completed clock (breached) — event happened after deadline", () => {
    const result = deriveSLAClockState({
      dueAt: ist("2026-08-24T14:00"),
      atRiskAt: ist("2026-08-24T12:00"),
      eventAt: ist("2026-08-24T16:00"), // responded after deadline
      now: ist("2026-08-24T18:00"),
    }, opts);
    expect(result.state).toBe("BREACHED");
    expect(result.remainingMinutes).toBe(0);
  });
});

// ── Full SLA info derivation ──

describe("deriveSLAInfo", () => {
  test("returns complete SLA info for both clocks", () => {
    const result = deriveSLAInfo({
      firstResponseDueAt: ist("2026-08-24T13:00"),
      firstResponseAtRiskAt: ist("2026-08-24T12:00"),
      resolutionDueAt: ist("2026-08-25T17:00"),
      resolutionAtRiskAt: ist("2026-08-25T11:00"),
      firstResponseAt: null,
      resolvedAt: null,
      now: ist("2026-08-24T10:00"),
    }, opts);

    expect(result.firstResponseState).toBe("ON_TRACK");
    expect(result.resolutionState).toBe("ON_TRACK");
    expect(result.firstResponseRemainingMinutes).toBeGreaterThan(0);
    expect(result.resolutionRemainingMinutes).toBeGreaterThan(0);
    expect(result.firstResponseDueAt).toContain("T");
    expect(result.resolutionDueAt).toContain("T");
  });

  test("first-response met, resolution still active", () => {
    const result = deriveSLAInfo({
      firstResponseDueAt: ist("2026-08-24T13:00"),
      firstResponseAtRiskAt: ist("2026-08-24T12:00"),
      resolutionDueAt: ist("2026-08-25T17:00"),
      resolutionAtRiskAt: ist("2026-08-25T11:00"),
      firstResponseAt: ist("2026-08-24T11:00"), // met
      resolvedAt: null,
      now: ist("2026-08-25T16:00"),
    }, opts);

    expect(result.firstResponseState).toBe("ON_TRACK"); // met → stays ON_TRACK
    expect(result.firstResponseRemainingMinutes).toBe(0);
    expect(result.resolutionState).toBe("AT_RISK");
    expect(result.resolutionRemainingMinutes).toBeGreaterThan(0);
  });

  test("both clocks frozen (resolved ticket)", () => {
    const result = deriveSLAInfo({
      firstResponseDueAt: ist("2026-08-24T13:00"),
      firstResponseAtRiskAt: ist("2026-08-24T12:00"),
      resolutionDueAt: ist("2026-08-25T17:00"),
      resolutionAtRiskAt: ist("2026-08-25T11:00"),
      firstResponseAt: ist("2026-08-24T11:00"),
      resolvedAt: ist("2026-08-25T10:00"),
      now: ist("2026-08-28T18:00"), // way past — doesn't matter
    }, opts);

    expect(result.firstResponseState).toBe("ON_TRACK");
    expect(result.resolutionState).toBe("ON_TRACK");
    expect(result.firstResponseRemainingMinutes).toBe(0);
    expect(result.resolutionRemainingMinutes).toBe(0);
  });
});

// ── SLA policy tests ──

describe("getSLAPolicy", () => {
  test("returns correct policies for all priorities", () => {
    expect(getSLAPolicy("URGENT")).toEqual({ firstResponseHours: 1, resolutionHours: 4 });
    expect(getSLAPolicy("HIGH")).toEqual({ firstResponseHours: 4, resolutionHours: 24 });
    expect(getSLAPolicy("MEDIUM")).toEqual({ firstResponseHours: 8, resolutionHours: 48 });
    expect(getSLAPolicy("LOW")).toEqual({ firstResponseHours: 24, resolutionHours: 72 });
  });

  test("throws for unknown priority", () => {
    expect(() => getSLAPolicy("INVALID")).toThrow("Unknown priority");
  });
});
