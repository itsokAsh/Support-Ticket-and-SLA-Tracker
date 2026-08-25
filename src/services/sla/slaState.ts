/**
 * SLA state derivation.
 *
 * Determines whether each SLA clock is ON_TRACK, AT_RISK, or BREACHED
 * based on stored deadline timestamps and event timestamps.
 *
 * Key design: deadlines and the 75% "at-risk" moment are stored on the
 * ticket at creation time. State derivation at read time reduces to plain
 * timestamp comparisons against `now` — no business-hours math needed to
 * determine state. Only `remainingMinutes` requires business-hours math.
 */

import { businessMinutesBetween } from "./businessHours.js";

export type SLAState = "ON_TRACK" | "AT_RISK" | "BREACHED";

export interface SLAClockInput {
  /** When the SLA event is due. */
  dueAt: Date;
  /** When the clock becomes AT_RISK (75% of budget consumed). */
  atRiskAt: Date;
  /** When the SLA event actually happened (null = still active). */
  eventAt: Date | null;
  /** Current time. */
  now: Date;
}

export interface SLAClockResult {
  state: SLAState;
  remainingMinutes: number;
}

export interface SLAInfoInput {
  firstResponseDueAt: Date;
  firstResponseAtRiskAt: Date;
  resolutionDueAt: Date;
  resolutionAtRiskAt: Date;
  firstResponseAt: Date | null;
  resolvedAt: Date | null;
  now: Date;
}

export interface SLAInfoResult {
  firstResponseDueAt: string;
  resolutionDueAt: string;
  firstResponseState: SLAState;
  resolutionState: SLAState;
  firstResponseRemainingMinutes: number;
  resolutionRemainingMinutes: number;
}

/**
 * Derive the state of a single SLA clock.
 *
 * Rules:
 * - FROZEN (event happened):
 *   - ON_TRACK if eventAt <= dueAt (met), else BREACHED
 *   - remainingMinutes = 0
 *   - A met clock can NEVER later become BREACHED.
 *
 * - ACTIVE (event hasn't happened):
 *   - now >= dueAt      → BREACHED (remainingMinutes = 0)
 *   - now >= atRiskAt   → AT_RISK
 *   - otherwise         → ON_TRACK
 *   - remainingMinutes = businessMinutesBetween(now, dueAt)
 *
 * Documented boundary:
 *   - Exactly 75% consumed (now === atRiskAt) → ON_TRACK (strict >)
 *   - Exactly at deadline (now === dueAt) → BREACHED
 */
export function deriveSLAClockState(
  input: SLAClockInput,
  options?: { timezone?: string; holidays?: Set<string> }
): SLAClockResult {
  const { dueAt, atRiskAt, eventAt, now } = input;

  // FROZEN: event already happened
  if (eventAt !== null) {
    const met = eventAt.getTime() <= dueAt.getTime();
    return {
      state: met ? "ON_TRACK" : "BREACHED",
      remainingMinutes: 0,
    };
  }

  // ACTIVE: check against deadlines
  if (now.getTime() >= dueAt.getTime()) {
    return { state: "BREACHED", remainingMinutes: 0 };
  }

  if (now.getTime() > atRiskAt.getTime()) {
    const remaining = businessMinutesBetween(now, dueAt, options);
    return { state: "AT_RISK", remainingMinutes: remaining };
  }

  const remaining = businessMinutesBetween(now, dueAt, options);
  return { state: "ON_TRACK", remainingMinutes: remaining };
}

/**
 * Derive full SLA info for a ticket (both clocks).
 * Returns the shape expected by the GraphQL SLAInfo type.
 */
export function deriveSLAInfo(
  input: SLAInfoInput,
  options?: { timezone?: string; holidays?: Set<string> }
): SLAInfoResult {
  const firstResponse = deriveSLAClockState(
    {
      dueAt: input.firstResponseDueAt,
      atRiskAt: input.firstResponseAtRiskAt,
      eventAt: input.firstResponseAt,
      now: input.now,
    },
    options
  );

  const resolution = deriveSLAClockState(
    {
      dueAt: input.resolutionDueAt,
      atRiskAt: input.resolutionAtRiskAt,
      eventAt: input.resolvedAt,
      now: input.now,
    },
    options
  );

  return {
    firstResponseDueAt: input.firstResponseDueAt.toISOString(),
    resolutionDueAt: input.resolutionDueAt.toISOString(),
    firstResponseState: firstResponse.state,
    resolutionState: resolution.state,
    firstResponseRemainingMinutes: firstResponse.remainingMinutes,
    resolutionRemainingMinutes: resolution.remainingMinutes,
  };
}
