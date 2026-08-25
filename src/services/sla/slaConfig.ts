/**
 * SLA policy configuration.
 *
 * Business hours: Mon–Fri, 09:00–18:00 (9 hours = 540 minutes per day).
 * Timezone: configurable via BUSINESS_TIMEZONE env (default Asia/Kolkata).
 * At-risk threshold: 75% of budget consumed.
 *
 * These are the default SLA targets; they are defined in one place
 * and can be made configurable later.
 */

// ── Business hours ──

export const BUSINESS_START_HOUR = 9;
export const BUSINESS_END_HOUR = 18;
export const BUSINESS_MINUTES_PER_DAY =
  (BUSINESS_END_HOUR - BUSINESS_START_HOUR) * 60; // 540

/** Monday = 1, Friday = 5 (ISO weekday convention) */
export const BUSINESS_DAYS = [1, 2, 3, 4, 5] as const;

export const BUSINESS_TIMEZONE =
  process.env["BUSINESS_TIMEZONE"] ?? "Asia/Kolkata";

// ── SLA targets (business hours) ──

export interface SLAPolicy {
  firstResponseHours: number;
  resolutionHours: number;
}

export const SLA_POLICIES: Record<string, SLAPolicy> = {
  URGENT: { firstResponseHours: 1, resolutionHours: 4 },
  HIGH: { firstResponseHours: 4, resolutionHours: 24 },
  MEDIUM: { firstResponseHours: 8, resolutionHours: 48 },
  LOW: { firstResponseHours: 24, resolutionHours: 72 },
};

/**
 * Get the SLA policy for a given priority.
 * Throws if the priority is unknown (should never happen with enum validation).
 */
export function getSLAPolicy(priority: string): SLAPolicy {
  const policy = SLA_POLICIES[priority];
  if (!policy) {
    throw new Error(`Unknown priority: ${priority}`);
  }
  return policy;
}

// ── At-risk threshold ──

/**
 * The percentage of SLA budget consumed at which the clock becomes AT_RISK.
 *
 * Documented boundary behavior:
 * - Exactly 75% consumed → ON_TRACK (strictly greater than 75% → AT_RISK)
 * - Exactly at deadline (100%) → BREACHED
 */
export const AT_RISK_THRESHOLD = 0.75;
