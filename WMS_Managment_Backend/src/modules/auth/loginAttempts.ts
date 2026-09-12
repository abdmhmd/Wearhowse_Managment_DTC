/**
 * Progressive login-failure tracker (in-memory).
 *
 * Complements — never replaces — the express-rate-limit middleware
 * (`loginLimiter` in auth.routes.ts). Where the rate limiter restricts request
 * volume per IP, this tracker applies an ADDITIONAL progressive response delay
 * keyed by (lowercased username, IP) so that correct-password users of a
 * specific account are throttled together with guessing attempts, without
 * revealing whether the username exists.
 *
 * The tracker is intentionally in-memory (matching the existing rate-limit
 * MemoryStore pattern): it resets on process restart, holds no durable data,
 * and cannot be primed by attackers across restarts. Transient throttling
 * state deliberately does not touch the database.
 */
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const BASE_DELAY_MS = 200;
const MAX_ENTRIES = 10_000;

export interface LoginAttemptEntry {
  count: number;
  lastFailedAt: number;
}

export class LoginAttemptTracker {
  private readonly store = new Map<string, LoginAttemptEntry>();

  /**
   * Records one failed attempt for a key and returns the current streak
   * (reset to 1 when the previous failure is outside the window).
   */
  register(key: string): LoginAttemptEntry {
    const now = Date.now();
    const existing = this.store.get(key);
    const entry: LoginAttemptEntry =
      existing && now - existing.lastFailedAt <= FAILURE_WINDOW_MS
        ? { count: existing.count + 1, lastFailedAt: now }
        : { count: 1, lastFailedAt: now };
    this.store.set(key, entry);
    this.prune(now);
    return entry;
  }

  /** Clears the failure streak (called on successful login). */
  reset(key: string): void {
    this.store.delete(key);
  }

  /**
   * Response delay (ms) for a failed login with the given streak:
   * attempts 1-4 → 200 ms baseline; 5 → 1 s; 6 → 2 s; 7 → 4 s; 8+ → 8 s cap.
   */
  delayFor(count: number): number {
    const progressive =
      count <= 4 ? 0 : count === 5 ? 1000 : count === 6 ? 2000 : count === 7 ? 4000 : 8000;
    return Math.max(BASE_DELAY_MS, progressive);
  }

  /** Lazy eviction: drops expired entries and caps total tracked keys. */
  private prune(now: number): void {
    for (const [key, entry] of this.store) {
      if (now - entry.lastFailedAt > FAILURE_WINDOW_MS) this.store.delete(key);
    }
    if (this.store.size > MAX_ENTRIES) {
      const oldest = [...this.store.entries()].sort(
        (a, b) => a[1].lastFailedAt - b[1].lastFailedAt
      )[0];
      if (oldest) this.store.delete(oldest[0]);
    }
  }
}

export const loginAttempts = new LoginAttemptTracker();