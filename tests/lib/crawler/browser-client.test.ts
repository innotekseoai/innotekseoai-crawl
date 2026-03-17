import { describe, it, expect, vi, afterEach } from 'vitest';
import { crawlBrowser } from '../../../src/lib/crawler/browser-client.js';

describe('crawlBrowser', () => {
  it('returns error when playwright is not available', async () => {
    // Playwright is not installed in test environment (optional dep)
    const result = await crawlBrowser('https://example.com', { limit: 1 });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Playwright');
    expect(result.pages).toEqual([]);
  });
});
