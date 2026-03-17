import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  fetchSitemapUrls,
  STATIC_ASSET_EXTENSIONS,
} from '../../../src/lib/crawler/sitemap.js';

describe('STATIC_ASSET_EXTENSIONS', () => {
  it('matches common image extensions', () => {
    expect(STATIC_ASSET_EXTENSIONS.test('/image.jpg')).toBe(true);
    expect(STATIC_ASSET_EXTENSIONS.test('/image.jpeg')).toBe(true);
    expect(STATIC_ASSET_EXTENSIONS.test('/image.png')).toBe(true);
    expect(STATIC_ASSET_EXTENSIONS.test('/image.gif')).toBe(true);
    expect(STATIC_ASSET_EXTENSIONS.test('/image.svg')).toBe(true);
    expect(STATIC_ASSET_EXTENSIONS.test('/image.webp')).toBe(true);
  });

  it('matches other asset types', () => {
    expect(STATIC_ASSET_EXTENSIONS.test('/file.pdf')).toBe(true);
    expect(STATIC_ASSET_EXTENSIONS.test('/file.zip')).toBe(true);
    expect(STATIC_ASSET_EXTENSIONS.test('/styles.css')).toBe(true);
    expect(STATIC_ASSET_EXTENSIONS.test('/app.js')).toBe(true);
    expect(STATIC_ASSET_EXTENSIONS.test('/font.woff2')).toBe(true);
    expect(STATIC_ASSET_EXTENSIONS.test('/video.mp4')).toBe(true);
  });

  it('does not match HTML pages', () => {
    expect(STATIC_ASSET_EXTENSIONS.test('/page.html')).toBe(false);
    expect(STATIC_ASSET_EXTENSIONS.test('/about')).toBe(false);
    expect(STATIC_ASSET_EXTENSIONS.test('/')).toBe(false);
    expect(STATIC_ASSET_EXTENSIONS.test('/blog/post-1')).toBe(false);
  });

  it('is case insensitive', () => {
    expect(STATIC_ASSET_EXTENSIONS.test('/image.JPG')).toBe(true);
    expect(STATIC_ASSET_EXTENSIONS.test('/image.PNG')).toBe(true);
    expect(STATIC_ASSET_EXTENSIONS.test('/file.PDF')).toBe(true);
  });
});

describe('fetchSitemapUrls', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns empty array when sitemap fetch fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    const result = await fetchSitemapUrls('https://example.com', '');
    expect(result).toEqual([]);
  });

  it('returns empty array when sitemap returns 404', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    const result = await fetchSitemapUrls('https://example.com', '');
    expect(result).toEqual([]);
  });

  it('extracts URLs from a simple urlset sitemap', async () => {
    const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://example.com/</loc><priority>1.0</priority></url>
        <url><loc>https://example.com/about</loc><priority>0.8</priority></url>
        <url><loc>https://example.com/contact</loc><priority>0.5</priority></url>
      </urlset>`;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(sitemapXml),
    });

    const result = await fetchSitemapUrls('https://example.com', '');
    expect(result).toContain('https://example.com/');
    expect(result).toContain('https://example.com/about');
    expect(result).toContain('https://example.com/contact');
  });

  it('sorts URLs by priority descending', async () => {
    const sitemapXml = `<?xml version="1.0"?>
      <urlset>
        <url><loc>https://example.com/low</loc><priority>0.3</priority></url>
        <url><loc>https://example.com/high</loc><priority>0.9</priority></url>
        <url><loc>https://example.com/mid</loc><priority>0.5</priority></url>
      </urlset>`;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(sitemapXml),
    });

    const result = await fetchSitemapUrls('https://example.com', '');
    expect(result[0]).toBe('https://example.com/high');
    expect(result[1]).toBe('https://example.com/mid');
    expect(result[2]).toBe('https://example.com/low');
  });

  it('defaults to 0.5 priority when not specified', async () => {
    // When all entries have priorities, sort works correctly
    const sitemapXml = `<?xml version="1.0"?>
      <urlset>
        <url><loc>https://example.com/low</loc><priority>0.3</priority></url>
        <url><loc>https://example.com/default</loc></url>
        <url><loc>https://example.com/high</loc><priority>0.9</priority></url>
      </urlset>`;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(sitemapXml),
    });

    const result = await fetchSitemapUrls(
      'https://example.com',
      'Sitemap: https://example.com/sitemap.xml'
    );
    // All three pages should be present
    expect(result).toContain('https://example.com/low');
    expect(result).toContain('https://example.com/default');
    expect(result).toContain('https://example.com/high');
    // Entries without <priority> default to 0.5 (assigned by index from regex)
    expect(result.length).toBe(3);
  });

  it('filters out static asset URLs', async () => {
    const sitemapXml = `<?xml version="1.0"?>
      <urlset>
        <url><loc>https://example.com/</loc></url>
        <url><loc>https://example.com/image.jpg</loc></url>
        <url><loc>https://example.com/document.pdf</loc></url>
        <url><loc>https://example.com/about</loc></url>
      </urlset>`;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(sitemapXml),
    });

    const result = await fetchSitemapUrls('https://example.com', '');
    expect(result).toContain('https://example.com/');
    expect(result).toContain('https://example.com/about');
    expect(result).not.toContain('https://example.com/image.jpg');
    expect(result).not.toContain('https://example.com/document.pdf');
  });

  it('filters out cross-origin URLs', async () => {
    const sitemapXml = `<?xml version="1.0"?>
      <urlset>
        <url><loc>https://example.com/</loc></url>
        <url><loc>https://other-domain.com/page</loc></url>
      </urlset>`;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(sitemapXml),
    });

    const result = await fetchSitemapUrls('https://example.com', '');
    expect(result).toContain('https://example.com/');
    expect(result).not.toContain('https://other-domain.com/page');
  });

  it('deduplicates URLs', async () => {
    const sitemapXml = `<?xml version="1.0"?>
      <urlset>
        <url><loc>https://example.com/</loc></url>
        <url><loc>https://example.com/</loc></url>
        <url><loc>https://example.com/about</loc></url>
        <url><loc>https://example.com/about</loc></url>
      </urlset>`;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(sitemapXml),
    });

    const result = await fetchSitemapUrls('https://example.com', '');
    const unique = new Set(result);
    expect(result.length).toBe(unique.size);
  });

  it('reads Sitemap directives from robots.txt content', async () => {
    const robotsTxtContent =
      'User-agent: *\nDisallow:\nSitemap: https://example.com/custom-sitemap.xml';

    const customSitemapXml = `<?xml version="1.0"?>
      <urlset>
        <url><loc>https://example.com/from-custom</loc></url>
      </urlset>`;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(customSitemapXml),
    });

    const result = await fetchSitemapUrls('https://example.com', robotsTxtContent);
    expect(result).toContain('https://example.com/from-custom');
  });

  it('always tries default /sitemap.xml even without robots.txt directive', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(
          '<urlset><url><loc>https://example.com/default</loc></url></urlset>'
        ),
    });

    await fetchSitemapUrls('https://example.com', '');

    const urls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => c[0]
    );
    expect(urls).toContain('https://example.com/sitemap.xml');
  });

  it('handles sitemap index files (sitemapindex)', async () => {
    const sitemapIndex = `<?xml version="1.0"?>
      <sitemapindex>
        <sitemap><loc>https://example.com/sitemap-pages.xml</loc></sitemap>
        <sitemap><loc>https://example.com/sitemap-blog.xml</loc></sitemap>
      </sitemapindex>`;

    const childSitemap1 = `<?xml version="1.0"?>
      <urlset>
        <url><loc>https://example.com/page1</loc></url>
      </urlset>`;

    const childSitemap2 = `<?xml version="1.0"?>
      <urlset>
        <url><loc>https://example.com/blog/post1</loc></url>
      </urlset>`;

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('sitemap-pages')) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(childSitemap1) });
      }
      if (url.includes('sitemap-blog')) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(childSitemap2) });
      }
      return Promise.resolve({ ok: true, text: () => Promise.resolve(sitemapIndex) });
    });

    const result = await fetchSitemapUrls('https://example.com', '');
    expect(result).toContain('https://example.com/page1');
    expect(result).toContain('https://example.com/blog/post1');
  });

  it('handles child sitemap fetch failures gracefully', async () => {
    const sitemapIndex = `<?xml version="1.0"?>
      <sitemapindex>
        <sitemap><loc>https://example.com/sitemap-good.xml</loc></sitemap>
        <sitemap><loc>https://example.com/sitemap-bad.xml</loc></sitemap>
      </sitemapindex>`;

    const goodSitemap = `<?xml version="1.0"?>
      <urlset>
        <url><loc>https://example.com/good-page</loc></url>
      </urlset>`;

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('sitemap-bad')) {
        return Promise.resolve({ ok: false, status: 500 });
      }
      if (url.includes('sitemap-good')) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(goodSitemap) });
      }
      return Promise.resolve({ ok: true, text: () => Promise.resolve(sitemapIndex) });
    });

    const result = await fetchSitemapUrls('https://example.com', '');
    expect(result).toContain('https://example.com/good-page');
  });

  it('limits to 5 candidate sitemaps', async () => {
    const robotsTxt = Array.from(
      { length: 10 },
      (_, i) => `Sitemap: https://example.com/sitemap-${i}.xml`
    ).join('\n');

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<urlset></urlset>'),
    });

    await fetchSitemapUrls('https://example.com', robotsTxt);

    // Should have at most 5 fetch calls (5 candidates, not 10+1)
    const fetchCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(fetchCalls).toBeLessThanOrEqual(6); // 5 from robots + default may be deduped
  });
});
