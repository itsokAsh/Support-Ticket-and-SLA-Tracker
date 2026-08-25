import type { Priority } from "@prisma/client";
import { addBusinessMinutes } from "./businessHours.js";
import { getSLAPolicy, AT_RISK_THRESHOLD, BUSINESS_TIMEZONE } from "./slaConfig.js";

export interface SLADeadlines {
  firstResponseDueAt: Date;
  firstResponseAtRiskAt: Date;
  resolutionDueAt: Date;
  resolutionAtRiskAt: Date;
}

/**
 * Compute the four SLA deadline timestamps for a ticket from its priority and
 * creation time, using the business-hours engine.
 *
 * The "at-risk" timestamps mark the moment 75% of the budget is consumed. We
 * store all four on the ticket so SLA state later becomes a plain timestamp
 * comparison instead of re-running business-hours math on every read.
 *
 * This is the single source of truth for SLA deadlines — used by both ticket
 * creation and the seed script, so they can never drift apart.
 */
export function computeSLADeadlines(
  priority: Priority,
  createdAt: Date,
  holidays: Set<string>
): SLADeadlines {
  const policy = getSLAPolicy(priority);
  const opts = { timezone: BUSINESS_TIMEZONE, holidays };

  const firstResponseMinutes = policy.firstResponseHours * 60;
  const resolutionMinutes = policy.resolutionHours * 60;

  const firstResponseAtRiskMinutes = Math.floor(firstResponseMinutes * AT_RISK_THRESHOLD);
  const resolutionAtRiskMinutes = Math.floor(resolutionMinutes * AT_RISK_THRESHOLD);

  return {
    firstResponseDueAt: addBusinessMinutes(createdAt, firstResponseMinutes, opts),
    firstResponseAtRiskAt: addBusinessMinutes(createdAt, firstResponseAtRiskMinutes, opts),
    resolutionDueAt: addBusinessMinutes(createdAt, resolutionMinutes, opts),
    resolutionAtRiskAt: addBusinessMinutes(createdAt, resolutionAtRiskMinutes, opts),
  };
}
