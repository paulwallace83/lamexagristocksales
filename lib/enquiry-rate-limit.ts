/**
 * lib/enquiry-rate-limit.ts — In-memory rate limiter for the public enquiry endpoint.
 *
 * Per-process; multi-instance deployments weaken the limit linearly with instance count.
 * The DB-backed `getRecentRequestCount` in lib/document-requests.ts provides a
 * cross-instance backstop for the document-request path.
 */

const enquiryTimestamps = new Map<string, number[]>();
let lastCleanup = Date.now();

const WINDOW_MS = 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

export interface RateLimitOptions {
  maxPerHour?: number;
  /** Override for tests; defaults to Date.now() */
  now?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the oldest timestamp in the window expires. 0 when allowed. */
  retryAfter: number;
}

export function checkEnquiryRateLimit(
  email: string,
  options: RateLimitOptions = {}
): RateLimitResult {
  const maxPerHour = options.maxPerHour ?? 5;
  const now = options.now ?? Date.now();
  const key = email.toLowerCase();

  // Prune stale keys periodically to prevent memory leak
  if (now - lastCleanup > CLEANUP_INTERVAL_MS) {
    for (const [k, ts] of enquiryTimestamps) {
      const fresh = ts.filter((t) => now - t < WINDOW_MS);
      if (fresh.length === 0) enquiryTimestamps.delete(k);
      else enquiryTimestamps.set(k, fresh);
    }
    lastCleanup = now;
  }

  const timestamps = (enquiryTimestamps.get(key) || []).filter(
    (t) => now - t < WINDOW_MS
  );
  if (timestamps.length >= maxPerHour) {
    const oldest = Math.min(...timestamps);
    // Math.max guard preserved for clock-skew safety even though the filter
    // above guarantees oldest > now - WINDOW_MS at call time.
    const retryAfter = Math.max(0, Math.ceil((oldest + WINDOW_MS - now) / 1000));
    return { allowed: false, retryAfter };
  }
  timestamps.push(now);
  enquiryTimestamps.set(key, timestamps);
  return { allowed: true, retryAfter: 0 };
}

/** Test-only helper: clear all rate-limit state. */
export function resetEnquiryRateLimit(): void {
  enquiryTimestamps.clear();
  lastCleanup = Date.now();
}
