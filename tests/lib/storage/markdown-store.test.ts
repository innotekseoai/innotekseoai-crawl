import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Use a temp directory for tests
const TEST_DIR = './data/test-mirrors';
process.env.MIRRORS_DIR = TEST_DIR;

// Must import AFTER setting env var
const { savePage, readPage, getCrawlDir } = await import(
  '../../../src/lib/storage/markdown-store.js'
);

describe('markdown-store', () => {
  const crawlId = 'test-crawl-abc123';

  beforeAll(() => {
    // Clean up any previous test data
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  afterAll(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  // -----------------------------------------------------------------------
  // savePage
  // -----------------------------------------------------------------------
  describe('savePage', () => {
    it('saves markdown to the expected path', () => {
      const result = savePage(crawlId, 0, '# Hello World');
      expect(result).toBe(`${crawlId}/0.md`);
      expect(existsSync(join(TEST_DIR, crawlId, '0.md'))).toBe(true);
    });

    it('creates the crawl directory if it does not exist', () => {
      const newCrawlId = 'new-crawl-xyz';
      savePage(newCrawlId, 0, '# Test');
      expect(existsSync(join(TEST_DIR, newCrawlId))).toBe(true);
    });

    it('returns correct relative path for various indices', () => {
      expect(savePage(crawlId, 1, '# Page 1')).toBe(`${crawlId}/1.md`);
      expect(savePage(crawlId, 42, '# Page 42')).toBe(`${crawlId}/42.md`);
    });

    it('overwrites existing files', () => {
      savePage(crawlId, 99, 'first version');
      savePage(crawlId, 99, 'second version');
      const content = readPage(crawlId, 99);
      expect(content).toBe('second version');
    });

    it('preserves markdown content exactly', () => {
      const markdown = '# Heading\n\n**Bold** and *italic*\n\n```js\nconsole.log("hi");\n```\n';
      savePage(crawlId, 10, markdown);
      expect(readPage(crawlId, 10)).toBe(markdown);
    });

    it('handles empty markdown', () => {
      savePage(crawlId, 11, '');
      expect(readPage(crawlId, 11)).toBe('');
    });

    it('handles markdown with unicode', () => {
      const markdown = '# Ünïcödë Tëst 🎉\n\nChinese: 中文 Japanese: 日本語';
      savePage(crawlId, 12, markdown);
      expect(readPage(crawlId, 12)).toBe(markdown);
    });
  });

  // -----------------------------------------------------------------------
  // readPage
  // -----------------------------------------------------------------------
  describe('readPage', () => {
    it('returns content of saved page', () => {
      savePage(crawlId, 20, '# Read Test');
      expect(readPage(crawlId, 20)).toBe('# Read Test');
    });

    it('returns null for non-existent page', () => {
      expect(readPage(crawlId, 99999)).toBeNull();
    });

    it('returns null for non-existent crawl', () => {
      expect(readPage('does-not-exist', 0)).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // getCrawlDir
  // -----------------------------------------------------------------------
  describe('getCrawlDir', () => {
    it('returns the expected directory path', () => {
      const dir = getCrawlDir('my-crawl');
      expect(dir).toBe(join(TEST_DIR, 'my-crawl'));
    });
  });
});
