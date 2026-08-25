/**
 * Business-hours arithmetic — the heart of the SLA engine.
 *
 * Two pure functions, implemented with built-in Date + Intl.DateTimeFormat
 * (no date library). The holiday list is passed in as a parameter (Set of
 * "YYYY-MM-DD" strings), keeping functions pure and deterministic.
 *
 * Documented limitation: Asia/Kolkata has no DST, so this is fully correct
 * for the configured timezone. DST-observing timezones could be off by an
 * hour around transitions; swapping in a DST-aware library is the noted
 * extension.
 */

import {
  BUSINESS_START_HOUR,
  BUSINESS_END_HOUR,
  BUSINESS_DAYS,
  BUSINESS_TIMEZONE,
} from "./slaConfig.js";

// ── Timezone helpers ──

interface BusinessHoursOptions {
  timezone?: string;
  holidays?: Set<string>;
}

/**
 * Get the components of a Date in the business timezone.
 */
function getBusinessTimeParts(
  date: Date,
  timezone: string
): { year: number; month: number; day: number; hour: number; minute: number; weekday: number } {
  // Use Intl.DateTimeFormat to get the time in the business timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });

  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string => {
    const part = parts.find((p) => p.type === type);
    return part?.value ?? "";
  };

  const weekdayMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };

  return {
    year: parseInt(get("year"), 10),
    month: parseInt(get("month"), 10),
    day: parseInt(get("day"), 10),
    hour: parseInt(get("hour"), 10),
    minute: parseInt(get("minute"), 10),
    weekday: weekdayMap[get("weekday")] ?? 1,
  };
}

/**
 * Format a date as "YYYY-MM-DD" in the business timezone.
 * Used to check against the holidays set.
 */
function toBusinessDateString(date: Date, timezone: string): string {
  const { year, month, day } = getBusinessTimeParts(date, timezone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Check if a date falls on a business day (Mon–Fri, not a holiday).
 */
function isBusinessDay(
  date: Date,
  timezone: string,
  holidays: Set<string>
): boolean {
  const { weekday } = getBusinessTimeParts(date, timezone);
  if (!(BUSINESS_DAYS as readonly number[]).includes(weekday)) return false;
  if (holidays.has(toBusinessDateString(date, timezone))) return false;
  return true;
}

/**
 * Create a Date object representing a specific hour:minute on the same
 * calendar day as `reference`, in the business timezone.
 */
function setBusinessTime(
  reference: Date,
  hour: number,
  minute: number,
  timezone: string
): Date {
  const { year, month, day } = getBusinessTimeParts(reference, timezone);

  // Build an ISO string for the target local time, then adjust for the timezone offset
  // For non-DST timezones like Asia/Kolkata, we can compute the offset once
  const targetLocal = new Date(
    Date.UTC(year, month - 1, day, hour, minute, 0, 0)
  );

  // Find the UTC offset for this timezone at this approximate time
  const testDate = new Date(year, month - 1, day, hour, minute);
  const utcString = testDate.toLocaleString("en-US", { timeZone: "UTC" });
  const tzString = testDate.toLocaleString("en-US", { timeZone: timezone });
  const utcDate = new Date(utcString);
  const tzDate = new Date(tzString);
  const offsetMs = tzDate.getTime() - utcDate.getTime();

  return new Date(targetLocal.getTime() - offsetMs);
}

/**
 * Advance a date to the next calendar day (same time) in UTC.
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/**
 * Normalize a timestamp to the next business instant.
 *
 * - If during business hours on a business day → returns as-is.
 * - If before business hours on a business day → returns 09:00 same day.
 * - If after business hours, on a weekend, or on a holiday → returns 09:00
 *   on the next business day.
 */
function normalizeToBusinessStart(
  date: Date,
  timezone: string,
  holidays: Set<string>
): Date {
  const parts = getBusinessTimeParts(date, timezone);

  // Check if it's a business day
  if (isBusinessDay(date, timezone, holidays)) {
    const timeInMinutes = parts.hour * 60 + parts.minute;
    const startMinutes = BUSINESS_START_HOUR * 60;
    const endMinutes = BUSINESS_END_HOUR * 60;

    if (timeInMinutes < startMinutes) {
      // Before business hours → snap to 09:00 same day
      return setBusinessTime(date, BUSINESS_START_HOUR, 0, timezone);
    }
    if (timeInMinutes < endMinutes) {
      // During business hours → return as-is
      return date;
    }
    // After business hours → fall through to find next business day
  }

  // Find the next business day
  let cursor = addDays(date, 1);
  // Set to start of business hours first
  cursor = setBusinessTime(cursor, BUSINESS_START_HOUR, 0, timezone);

  // Keep advancing until we find a business day (max 10 iterations for safety)
  for (let i = 0; i < 10; i++) {
    if (isBusinessDay(cursor, timezone, holidays)) {
      return setBusinessTime(cursor, BUSINESS_START_HOUR, 0, timezone);
    }
    cursor = addDays(cursor, 1);
  }

  // Fallback (should never reach here with real calendars)
  return setBusinessTime(cursor, BUSINESS_START_HOUR, 0, timezone);
}

// ── Public API ──

/**
 * Add business minutes to a starting timestamp.
 *
 * Normalizes `start` to the next business instant, then consumes `minutes`
 * inside business windows only, skipping evenings, weekends, and holidays.
 *
 * Used at ticket creation to compute stored deadline timestamps.
 *
 * @param start  - The starting timestamp (UTC).
 * @param minutes - The number of business minutes to add.
 * @param options - Timezone and holidays configuration.
 * @returns The resulting timestamp (UTC) after adding business minutes.
 */
export function addBusinessMinutes(
  start: Date,
  minutes: number,
  options: BusinessHoursOptions = {}
): Date {
  const timezone = options.timezone ?? BUSINESS_TIMEZONE;
  const holidays = options.holidays ?? new Set<string>();

  if (minutes <= 0) return start;

  let cursor = normalizeToBusinessStart(start, timezone, holidays);
  let remaining = minutes;

  // Consume business minutes day by day
  for (let safety = 0; safety < 500 && remaining > 0; safety++) {
    const parts = getBusinessTimeParts(cursor, timezone);
    const currentMinuteOfDay = parts.hour * 60 + parts.minute;
    const endMinuteOfDay = BUSINESS_END_HOUR * 60;
    const availableToday = endMinuteOfDay - currentMinuteOfDay;

    if (remaining <= availableToday) {
      // Fits within today's remaining business hours
      const targetMinute = currentMinuteOfDay + remaining;
      const targetHour = Math.floor(targetMinute / 60);
      const targetMin = targetMinute % 60;
      return setBusinessTime(cursor, targetHour, targetMin, timezone);
    }

    // Consume the rest of today and move to next business day
    remaining -= availableToday;
    cursor = addDays(cursor, 1);
    cursor = normalizeToBusinessStart(cursor, timezone, holidays);
  }

  return cursor;
}

/**
 * Count the business minutes between two timestamps.
 *
 * Sums business minutes in the interval [from, to], returning 0 if to ≤ from.
 *
 * Used at read time to compute `remainingMinutes`.
 *
 * @param from - Start timestamp (UTC).
 * @param to   - End timestamp (UTC).
 * @param options - Timezone and holidays configuration.
 * @returns The number of business minutes between the two timestamps.
 */
export function businessMinutesBetween(
  from: Date,
  to: Date,
  options: BusinessHoursOptions = {}
): number {
  const timezone = options.timezone ?? BUSINESS_TIMEZONE;
  const holidays = options.holidays ?? new Set<string>();

  if (to.getTime() <= from.getTime()) return 0;

  let cursor = normalizeToBusinessStart(from, timezone, holidays);
  let total = 0;

  // If normalizing pushed us past `to`, no business time elapsed
  if (cursor.getTime() >= to.getTime()) return 0;

  for (let safety = 0; safety < 500 && cursor.getTime() < to.getTime(); safety++) {
    const parts = getBusinessTimeParts(cursor, timezone);
    const currentMinuteOfDay = parts.hour * 60 + parts.minute;
    const endMinuteOfDay = BUSINESS_END_HOUR * 60;

    // How many minutes from cursor to end-of-business today
    const availableToday = endMinuteOfDay - currentMinuteOfDay;

    // How many minutes from cursor to `to`
    const endOfBusiness = setBusinessTime(cursor, BUSINESS_END_HOUR, 0, timezone);
    const minutesToEnd = Math.floor(
      (Math.min(to.getTime(), endOfBusiness.getTime()) - cursor.getTime()) / 60000
    );

    if (minutesToEnd <= 0) {
      // `to` is before or at cursor position
      break;
    }

    total += Math.min(minutesToEnd, availableToday);

    if (to.getTime() <= endOfBusiness.getTime()) {
      // `to` falls within today's business hours
      break;
    }

    // Move to next business day
    cursor = addDays(cursor, 1);
    cursor = normalizeToBusinessStart(cursor, timezone, holidays);
  }

  return total;
}
