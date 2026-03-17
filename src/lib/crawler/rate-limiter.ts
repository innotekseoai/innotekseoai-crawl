/**
 * Per-domain rate limiter
 *
 * Enforces a minimum delay between requests to the same domain.
 * Different domains can be fetched in parallel without delay.
 */

const DEFAULT_DELAY_MS = 200;

export class DomainRateLimiter {
  private lastRequest = new Map<string, number>();
  private delayMs: number;

  constructor(delayMs = DEFAULT_DELAY_MS) {
    this.delayMs = delayMs;
  }

  /**
   * Wait if necessary to respect the per-domain delay.
   * Returns immediately if enough time has passed since last request to this domain.
   */
  async throttle(url: string): Promise<void> {
    const hostname = new URL(url).hostname;
    const now = Date.now();
    const last = this.lastRequest.get(hostname) ?? 0;
    const elapsed = now - last;
    const wait = elapsed < this.delayMs ? this.delayMs - elapsed : 0;

    // Commit the scheduled time immediately to prevent concurrent callers
    // from reading the same stale timestamp and firing simultaneously
    this.lastRequest.set(hostname, now + wait);

    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
}
