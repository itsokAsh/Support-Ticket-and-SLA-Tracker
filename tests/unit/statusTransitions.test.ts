import { describe, test, expect } from "bun:test";
import type { TicketStatus } from "@prisma/client";
import {
  isValidTransition,
  shouldFreezeResolutionClock,
  isReopenTransition,
} from "../../src/services/ticket/statusTransitions";

/**
 * Status transition state-machine unit tests.
 *
 * These functions are pure (no database, no request context), so we test them
 * directly rather than through the resolver. The integration test exercises the
 * same rules end-to-end against Postgres; here we lock down every edge of the
 * transition matrix in isolation.
 */

// ── isValidTransition ──

describe("isValidTransition — allowed transitions", () => {
  const allowed: Array<[TicketStatus, TicketStatus]> = [
    ["OPEN", "IN_PROGRESS"],
    ["OPEN", "RESOLVED"],
    ["OPEN", "CLOSED"],
    ["IN_PROGRESS", "RESOLVED"],
    ["IN_PROGRESS", "OPEN"],
    ["IN_PROGRESS", "CLOSED"],
    ["RESOLVED", "CLOSED"],
    ["RESOLVED", "IN_PROGRESS"], // reopen
    ["CLOSED", "OPEN"], // reopen
  ];

  for (const [from, to] of allowed) {
    test(`${from} → ${to} is allowed`, () => {
      expect(isValidTransition(from, to)).toBe(true);
    });
  }
});

describe("isValidTransition — rejected transitions", () => {
  const rejected: Array<[TicketStatus, TicketStatus]> = [
    ["CLOSED", "IN_PROGRESS"], // must reopen through OPEN, never straight to IN_PROGRESS
    ["CLOSED", "RESOLVED"],
    ["RESOLVED", "OPEN"], // a resolved ticket reopens to IN_PROGRESS, not OPEN
    ["OPEN", "OPEN"], // no-op self-transitions are not allowed
    ["IN_PROGRESS", "IN_PROGRESS"],
    ["RESOLVED", "RESOLVED"],
    ["CLOSED", "CLOSED"],
  ];

  for (const [from, to] of rejected) {
    test(`${from} → ${to} is rejected`, () => {
      expect(isValidTransition(from, to)).toBe(false);
    });
  }

  // Called out explicitly because it is the one "looks reasonable but isn't"
  // case: a closed ticket cannot jump back into work without being reopened.
  test("CLOSED → IN_PROGRESS is explicitly forbidden", () => {
    expect(isValidTransition("CLOSED", "IN_PROGRESS")).toBe(false);
  });
});

// ── shouldFreezeResolutionClock ──

describe("shouldFreezeResolutionClock", () => {
  test("RESOLVED freezes the resolution clock", () => {
    expect(shouldFreezeResolutionClock("RESOLVED")).toBe(true);
  });

  test("CLOSED freezes the resolution clock", () => {
    expect(shouldFreezeResolutionClock("CLOSED")).toBe(true);
  });

  test("OPEN does not freeze the clock", () => {
    expect(shouldFreezeResolutionClock("OPEN")).toBe(false);
  });

  test("IN_PROGRESS does not freeze the clock", () => {
    expect(shouldFreezeResolutionClock("IN_PROGRESS")).toBe(false);
  });
});

// ── isReopenTransition ──

describe("isReopenTransition", () => {
  test("RESOLVED → IN_PROGRESS is a reopen (clock resumes)", () => {
    expect(isReopenTransition("RESOLVED", "IN_PROGRESS")).toBe(true);
  });

  test("CLOSED → OPEN is a reopen (clock resumes)", () => {
    expect(isReopenTransition("CLOSED", "OPEN")).toBe(true);
  });

  test("OPEN → IN_PROGRESS is not a reopen (normal progression)", () => {
    expect(isReopenTransition("OPEN", "IN_PROGRESS")).toBe(false);
  });

  test("RESOLVED → CLOSED is not a reopen (still closing out)", () => {
    expect(isReopenTransition("RESOLVED", "CLOSED")).toBe(false);
  });

  test("IN_PROGRESS → RESOLVED is not a reopen", () => {
    expect(isReopenTransition("IN_PROGRESS", "RESOLVED")).toBe(false);
  });
});
