import { rateLimitedError } from "../../errors.js";

/**
 * Simple in-memory rate limiter keyed by IP address.
 * Limits auth endpoints (register/login) to prevent brute-force attacks.
 *
 * Documented limitation: in-memory state doesn't span multiple instances.
 * In production, use Redis or a similar shared store.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 10;

/**
 * Check rate limit for a given key (typically IP address).
 * Throws RATE_LIMITED if the limit has been exceeded.
 */
export function checkRateLimit(key: string): void {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now >= entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }

  entry.count++;
  if (entry.count > MAX_ATTEMPTS) {
    throw rateLimitedError();
  }
}

/**
 * Extract a rate-limit key from the request.
 * Falls back to "unknown" if no IP is available.
 */
export function getRateLimitKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  // Bun/Node may provide the socket address differently
  return request.headers.get("x-real-ip") ?? "unknown";
}

// Periodically clean up expired entries to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now >= entry.resetAt) {
      store.delete(key);
    }
  }
}, WINDOW_MS);
