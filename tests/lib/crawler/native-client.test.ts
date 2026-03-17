import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { crawlNative } from '../../../src/lib/crawler/native-client.js';

// Helper to create mock HTML response
function mockHtmlPage(
  title: string,
  body: string,
  links: string[] = [],
  description?: string
): string {
  const linkTags = links.map((l) => `<a href="${l}">Link</a>`).join('\n');
  const descTag = description
    ? `<meta name="description" content="${description}">`
    : '';
  return `<!DOCTYPE html>
<html>
<head><title>${title}</title>${descTag}</head>
<body>
<article>
<h1>${title}</h1>
<p>${body}</p>
${linkTags}
</article>
</body>
</html>`;
}

describe('crawlNative', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns success with pages when crawl succeeds', async () => {
    const html = mockHtmlPage(
      'Test Page',
      'This is a test page with enough content to pass the thin content threshold. '.repeat(20),
      [],
      'A test description'
    );

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('robots.txt')) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      if (url.includes('sitemap.xml')) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(html),
      });
    });

    const result = await crawlNative('https://example.com', { limit: 1 });

    expect(result.success).toBe(true);
    expect(result.pages.length).toBe(1);
    expect(result.pages[0].url).toBe('https://example.com/');
    expect(result.pages[0].markdown).toBeTruthy();
    expect(result.pages[0].metadata?.title).toBe('Test Page');
  });

  it('returns failure when no pages can be crawled', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const result = await crawlNative('https://example.com', { limit: 1 });

    expect(result.success).toBe(false);
    expect(result.pages).toEqual([]);
    expect(result.error).toBe('No pages could be crawled');
  });

  it('calls onPage callback for each crawled page', async () => {
    const html = mockHtmlPage(
      'Callback Test',
      'Content '.repeat(200)
    );

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('robots.txt') || url.includes('sitemap.xml')) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      return Promise.resolve({ ok: true, text: () => Promise.resolve(html) });
    });

    const onPage = vi.fn();
    const result = await crawlNative('https://example.com', {
      limit: 1,
      onPage,
    });

    expect(result.success).toBe(true);
    expect(onPage).toHaveBeenCalledTimes(1);
    expect(onPage).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://example.com/',
        markdown: expect.any(String),
      }),
      0
    );
  });

  it('respects page limit', async () => {
    const html = mockHtmlPage(
      'Page',
      'Content '.repeat(200),
      [
        'https://example.com/page2',
        'https://example.com/page3',
        'https://example.com/page4',
      ]
    );

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('robots.txt') || url.includes('sitemap.xml')) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      return Promise.resolve({ ok: true, text: () => Promise.resolve(html) });
    });

    const result = await crawlNative('https://example.com', { limit: 2 });

    expect(result.success).toBe(true);
    expect(result.pages.length).toBeLessThanOrEqual(2);
  });

  it('discovers and follows internal links (BFS)', async () => {
    const visitedUrls: string[] = [];

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('robots.txt') || url.includes('sitemap.xml')) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      visitedUrls.push(url);

      const html = url.includes('/about')
        ? mockHtmlPage('About', 'About content. '.repeat(200))
        : mockHtmlPage('Home', 'Home content. '.repeat(200), [
            'https://example.com/about',
          ]);

      return Promise.resolve({ ok: true, text: () => Promise.resolve(html) });
    });

    const result = await crawlNative('https://example.com', { limit: 5 });

    expect(result.success).toBe(true);
    // Should have crawled both the homepage and /about
    const crawledUrls = result.pages.map((p) => p.url);
    expect(crawledUrls).toContain('https://example.com/');
    expect(crawledUrls).toContain('https://example.com/about');
  });

  it('skips static asset URLs', async () => {
    const html = mockHtmlPage('Page', 'Content. '.repeat(200), [
      'https://example.com/image.jpg',
      'https://example.com/style.css',
      'https://example.com/real-page',
    ]);

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('robots.txt') || url.includes('sitemap.xml')) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      return Promise.resolve({ ok: true, text: () => Promise.resolve(html) });
    });

    const result = await crawlNative('https://example.com', { limit: 10 });

    const urls = result.pages.map((p) => p.url);
    expect(urls).not.toContain('https://example.com/image.jpg');
    expect(urls).not.toContain('https://example.com/style.css');
  });

  it('deduplicates visited URLs', async () => {
    // Page links to itself and to /about, /about links back to homepage
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('robots.txt') || url.includes('sitemap.xml')) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      const html = mockHtmlPage('Page', 'Content. '.repeat(200), [
        'https://example.com/',
        'https://example.com/about',
      ]);
      return Promise.resolve({ ok: true, text: () => Promise.resolve(html) });
    });

    const result = await crawlNative('https://example.com', { limit: 10 });

    // No duplicate URLs
    const urls = result.pages.map((p) => p.url);
    const unique = new Set(urls);
    expect(urls.length).toBe(unique.size);
  });

  it('handles HTTP error on individual pages gracefully', async () => {
    let callCount = 0;

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('robots.txt') || url.includes('sitemap.xml')) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      callCount++;
      if (callCount === 1) {
        // First real page fails
        return Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve('') });
      }
      return Promise.resolve({
        ok: true,
        text: () =>
          Promise.resolve(mockHtmlPage('Page', 'Content. '.repeat(200))),
      });
    });

    // Should not throw, just return failure for that page
    const result = await crawlNative('https://example.com', { limit: 1 });
    // Might be empty since the only URL failed
    expect(result).toBeDefined();
  });

  it('uses sitemap URLs as seeds when available', async () => {
    const sitemapXml = `<?xml version="1.0"?>
      <urlset>
        <url><loc>https://example.com/sitemap-page</loc><priority>0.9</priority></url>
      </urlset>`;

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('robots.txt')) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      if (url.includes('sitemap.xml')) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(sitemapXml) });
      }
      return Promise.resolve({
        ok: true,
        text: () =>
          Promise.resolve(mockHtmlPage('Sitemap Page', 'Content. '.repeat(200))),
      });
    });

    const result = await crawlNative('https://example.com', { limit: 5 });

    const urls = result.pages.map((p) => p.url);
    expect(urls).toContain('https://example.com/sitemap-page');
  });

  it('extracts metadata (title and description)', async () => {
    const html = mockHtmlPage(
      'My Title',
      'Content body with enough text. '.repeat(200),
      [],
      'My description'
    );

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('robots.txt') || url.includes('sitemap.xml')) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      return Promise.resolve({ ok: true, text: () => Promise.resolve(html) });
    });

    const result = await crawlNative('https://example.com', { limit: 1 });

    expect(result.pages[0].metadata?.title).toBe('My Title');
    expect(result.pages[0].metadata?.description).toBe('My description');
  });

  it('converts HTML to markdown', async () => {
    const html = mockHtmlPage(
      'Markdown Test',
      'This is <strong>bold</strong> and <em>italic</em> text. '.repeat(100)
    );

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('robots.txt') || url.includes('sitemap.xml')) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      return Promise.resolve({ ok: true, text: () => Promise.resolve(html) });
    });

    const result = await crawlNative('https://example.com', { limit: 1 });

    expect(result.pages[0].markdown).toContain('**bold**');
    // TurndownService converts <em> to _italic_ by default
    expect(result.pages[0].markdown).toContain('_italic_');
  });

  it('continues crawling when onPage callback throws', async () => {
    const html = mockHtmlPage('Page', 'Content. '.repeat(200), [
      'https://example.com/page2',
    ]);

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('robots.txt') || url.includes('sitemap.xml')) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      return Promise.resolve({ ok: true, text: () => Promise.resolve(html) });
    });

    const onPage = vi.fn().mockRejectedValue(new Error('callback failed'));

    const result = await crawlNative('https://example.com', {
      limit: 2,
      onPage,
    });

    // Should still succeed despite callback error
    expect(result.success).toBe(true);
    expect(result.pages.length).toBeGreaterThan(0);
  });

  it('returns tier2FallbackCount', async () => {
    const html = mockHtmlPage('Page', 'Content. '.repeat(200));

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('robots.txt') || url.includes('sitemap.xml')) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      return Promise.resolve({ ok: true, text: () => Promise.resolve(html) });
    });

    const result = await crawlNative('https://example.com', { limit: 1 });
    expect(result.tier2FallbackCount).toBeDefined();
    expect(typeof result.tier2FallbackCount).toBe('number');
  });
});
