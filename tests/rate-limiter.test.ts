import { describe, it, expect } from 'vitest';
import { DomainRateLimiter } from '@/lib/crawler/rate-limiter';

describe('DomainRateLimiter', () => {
  it('allows first request immediately', async () => {
    const limiter = new DomainRateLimiter(100);
    const start = Date.now();
    await limiter.throttle('https://example.com/page1');
    expect(Date.now() - start).toBeLessThan(20);
  });

  it('delays second request to same domain', async () => {
    const limiter = new DomainRateLimiter(100);
    await limiter.throttle('https://example.com/page1');
    const start = Date.now();
    await limiter.throttle('https://example.com/page2');
    expect(Date.now() - start).toBeGreaterThanOrEqual(80);
  });

  it('allows concurrent requests to different domains', async () => {
    const limiter = new DomainRateLimiter(200);
    await limiter.throttle('https://a.com/page');
    const start = Date.now();
    await limiter.throttle('https://b.com/page'); // different domain, no delay
    expect(Date.now() - start).toBeLessThan(20);
  });

  it('tracks domains independently', async () => {
    const limiter = new DomainRateLimiter(50);
    await limiter.throttle('https://a.com/1');
    await limiter.throttle('https://b.com/1');

    // a.com was throttled 50ms+ ago by now (due to b.com delay)
    const start = Date.now();
    await limiter.throttle('https://a.com/2');
    // Should be near-instant since enough time passed
    expect(Date.now() - start).toBeLessThan(60);
  });
});
