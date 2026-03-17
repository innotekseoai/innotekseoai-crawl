import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '@/lib/crawler/retry';

describe('withRetry', () => {
  it('returns on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure then succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockResolvedValueOnce('recovered');

    const result = await withRetry(fn, { maxRetries: 2, baseDelay: 10 });
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('persistent failure'));

    await expect(withRetry(fn, { maxRetries: 2, baseDelay: 10 }))
      .rejects.toThrow('persistent failure');
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('calls onRetry callback', async () => {
    const onRetry = vi.fn();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('oops'))
      .mockResolvedValueOnce('ok');

    await withRetry(fn, { maxRetries: 2, baseDelay: 10, onRetry });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
  });

  it('wraps non-Error exceptions', async () => {
    const fn = vi.fn().mockRejectedValue('string error');

    await expect(withRetry(fn, { maxRetries: 0 }))
      .rejects.toThrow('string error');
  });

  it('respects maxRetries: 0 (no retries)', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    await expect(withRetry(fn, { maxRetries: 0 }))
      .rejects.toThrow('fail');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('delays between retries', async () => {
    const start = Date.now();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('ok');

    await withRetry(fn, { maxRetries: 1, baseDelay: 50, maxDelay: 100 });
    const elapsed = Date.now() - start;
    // With jitter (0.5-1.0), delay should be between 25ms and 50ms
    expect(elapsed).toBeGreaterThanOrEqual(20);
  });
});
