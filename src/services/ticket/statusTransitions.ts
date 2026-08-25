/**
 * Ticket status transition rules.
 *
 * Transitions are enforced server-side via an explicit map.
 * Invalid transitions return INVALID_STATUS_TRANSITION.
 *
 * Rules:
 *   OPEN         → IN_PROGRESS | RESOLVED | CLOSED
 *   IN_PROGRESS  → RESOLVED | OPEN | CLOSED
 *   RESOLVED     → CLOSED | IN_PROGRESS        (reopen)
 *   CLOSED       → OPEN                         (reopen only — NOT directly to IN_PROGRESS)
 *
 * Side effects tied to transitions:
 *   - Entering RESOLVED or CLOSED sets resolvedAt = now (freezes resolution clock)
 *   - Reopening (RESOLVED → IN_PROGRESS, CLOSED → OPEN) clears resolvedAt (clock resumes)
 *   - CLOSED → IN_PROGRESS is rejected: "Ticket cannot transition from CLOSED to IN_PROGRESS."
 */

import type { TicketStatus } from "@prisma/client";

const ALLOWED_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  OPEN: ["IN_PROGRESS", "RESOLVED", "CLOSED"],
  IN_PROGRESS: ["RESOLVED", "OPEN", "CLOSED"],
  RESOLVED: ["CLOSED", "IN_PROGRESS"],
  CLOSED: ["OPEN"],
};

/**
 * Check if a status transition is valid.
 */
export function isValidTransition(
  from: TicketStatus,
  to: TicketStatus
): boolean {
  const allowed = ALLOWED_TRANSITIONS[from];
  return allowed.includes(to);
}

/**
 * Determine if entering a status should freeze the resolution clock.
 * RESOLVED and CLOSED both freeze the clock.
 */
export function shouldFreezeResolutionClock(status: TicketStatus): boolean {
  return status === "RESOLVED" || status === "CLOSED";
}

/**
 * Determine if a transition is a reopen (clock should resume).
 * RESOLVED → IN_PROGRESS or CLOSED → OPEN clears resolvedAt.
 */
export function isReopenTransition(
  from: TicketStatus,
  to: TicketStatus
): boolean {
  return (
    (from === "RESOLVED" && to === "IN_PROGRESS") ||
    (from === "CLOSED" && to === "OPEN")
  );
}
