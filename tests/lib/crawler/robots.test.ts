import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import robotsParser from 'robots-parser';
import { fetchRobotsTxt, isAllowed, USER_AGENT } from '../../../src/lib/crawler/robots.js';

describe('USER_AGENT', () => {
  it('is a non-empty string', () => {
    expect(USER_AGENT).toBeTruthy();
    expect(typeof USER_AGENT).toBe('string');
  });

  it('contains InnotekSEO', () => {
    expect(USER_AGENT).toContain('InnotekSEO');
  });
});

describe('isAllowed', () => {
  it('returns true when robots is null', () => {
    expect(isAllowed(null, 'https://example.com/anything')).toBe(true);
  });

  it('returns true when URL is allowed by robots', () => {
    const robots = robotsParser(
      'https://example.com/robots.txt',
      `User-agent: *\nAllow: /`
    );
    expect(isAllowed(robots, 'https://example.com/page')).toBe(true);
  });

  it('returns false when URL is disallowed', () => {
    const robots = robotsParser(
      'https://example.com/robots.txt',
      `User-agent: *\nDisallow: /private/`
    );
    expect(isAllowed(robots, 'https://example.com/private/secret')).toBe(false);
  });

  it('returns true for paths not matched by disallow', () => {
    const robots = robotsParser(
      'https://example.com/robots.txt',
      `User-agent: *\nDisallow: /admin/`
    );
    expect(isAllowed(robots, 'https://example.com/public')).toBe(true);
  });

  it('handles user-agent specific rules', () => {
    const robots = robotsParser(
      'https://example.com/robots.txt',
      `User-agent: InnotekSEO-Crawler/1.0\nDisallow: /blocked/\n\nUser-agent: *\nAllow: /`
    );
    expect(isAllowed(robots, 'https://example.com/blocked/page')).toBe(false);
  });
});

describe('fetchRobotsTxt', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns robots and content when fetch succeeds', async () => {
    const robotsContent = 'User-agent: *\nDisallow: /private/\nSitemap: https://example.com/sitemap.xml';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(robotsContent),
    });

    const result = await fetchRobotsTxt('https://example.com');
    expect(result.robots).not.toBeNull();
    expect(result.content).toBe(robotsContent);
    expect(result.content).toContain('Disallow: /private/');
  });

  it('returns null robots when response is not ok', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    const result = await fetchRobotsTxt('https://example.com');
    expect(result.robots).toBeNull();
    expect(result.content).toBe('');
  });

  it('returns null robots when fetch throws', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const result = await fetchRobotsTxt('https://example.com');
    expect(result.robots).toBeNull();
    expect(result.content).toBe('');
  });

  it('fetches from /robots.txt of the base URL', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(''),
    });

    await fetchRobotsTxt('https://example.com/some/path');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://example.com/robots.txt',
      expect.any(Object)
    );
  });

  it('sends correct User-Agent header', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(''),
    });

    await fetchRobotsTxt('https://example.com');

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[1].headers['User-Agent']).toBe(USER_AGENT);
  });

  it('sets a timeout signal', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(''),
    });

    await fetchRobotsTxt('https://example.com');

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[1].signal).toBeDefined();
  });
});
