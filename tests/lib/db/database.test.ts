import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { existsSync, rmSync, mkdirSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import type { SqlJsDatabase } from 'drizzle-orm/sql-js';

// Use a temporary test database
const TEST_DB_DIR = './data/test-db';
const TEST_DB_PATH = `${TEST_DB_DIR}/test.db`;
process.env.CRAWL_DB_PATH = TEST_DB_PATH;

// Ensure clean directory
if (existsSync(TEST_DB_DIR)) {
  rmSync(TEST_DB_DIR, { recursive: true });
}
mkdirSync(TEST_DB_DIR, { recursive: true });

// Import after env var set
const { getDb, saveDb } = await import('../../../src/lib/db/client.js');
const { crawls, crawlPages, pageAnalyses } = await import('../../../src/lib/db/schema.js');

let db: Awaited<ReturnType<typeof getDb>>;

beforeAll(async () => {
  db = await getDb();
});

afterAll(() => {
  if (existsSync(TEST_DB_DIR)) {
    rmSync(TEST_DB_DIR, { recursive: true });
  }
});

describe('database — crawls table', () => {
  const crawlId = randomUUID();

  it('inserts a crawl record', async () => {
    await db.insert(crawls).values({
      id: crawlId,
      baseUrl: 'https://example.com',
      status: 'pending',
      crawlerType: 'native',
      pagesCrawled: 0,
      pageLimit: 50,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const rows = await db.select().from(crawls).where(eq(crawls.id, crawlId));
    expect(rows).toHaveLength(1);
    expect(rows[0].baseUrl).toBe('https://example.com');
    expect(rows[0].status).toBe('pending');
  });

  it('updates crawl status', async () => {
    await db
      .update(crawls)
      .set({ status: 'crawling', updatedAt: new Date().toISOString() })
      .where(eq(crawls.id, crawlId));

    const rows = await db.select().from(crawls).where(eq(crawls.id, crawlId));
    expect(rows[0].status).toBe('crawling');
  });

  it('updates to completed with results', async () => {
    await db
      .update(crawls)
      .set({
        status: 'completed',
        pagesCrawled: 5,
        overallGrade: 'B',
        premiumScore: 72,
        primaryJsonLd: '{"@type":"Organization"}',
        llmsTxt: '# llms.txt content',
        siteMetrics: JSON.stringify({ avg_entity_clarity: 7 }),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(crawls.id, crawlId));

    const rows = await db.select().from(crawls).where(eq(crawls.id, crawlId));
    expect(rows[0].status).toBe('completed');
    expect(rows[0].pagesCrawled).toBe(5);
    expect(rows[0].overallGrade).toBe('B');
    expect(rows[0].premiumScore).toBe(72);
    expect(rows[0].primaryJsonLd).toContain('Organization');
  });

  it('stores and retrieves error message', async () => {
    const errorCrawlId = randomUUID();
    await db.insert(crawls).values({
      id: errorCrawlId,
      baseUrl: 'https://broken.com',
      status: 'failed',
      crawlerType: 'native',
      errorMessage: 'Network timeout',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const rows = await db.select().from(crawls).where(eq(crawls.id, errorCrawlId));
    expect(rows[0].errorMessage).toBe('Network timeout');
  });

  it('lists all crawls', async () => {
    const rows = await db.select().from(crawls);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});

describe('database — crawl_pages table', () => {
  const crawlId = randomUUID();
  const pageId = randomUUID();

  beforeAll(async () => {
    await db.insert(crawls).values({
      id: crawlId,
      baseUrl: 'https://example.com',
      status: 'completed',
      crawlerType: 'native',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  it('inserts a crawl page', async () => {
    await db.insert(crawlPages).values({
      id: pageId,
      crawlId,
      url: 'https://example.com/',
      title: 'Home',
      description: 'Welcome',
      markdownPath: `${crawlId}/0.md`,
      charCount: 1500,
      createdAt: new Date().toISOString(),
    });

    const rows = await db
      .select()
      .from(crawlPages)
      .where(eq(crawlPages.id, pageId));
    expect(rows).toHaveLength(1);
    expect(rows[0].url).toBe('https://example.com/');
    expect(rows[0].title).toBe('Home');
    expect(rows[0].charCount).toBe(1500);
  });

  it('queries pages by crawl ID', async () => {
    // Add another page
    await db.insert(crawlPages).values({
      id: randomUUID(),
      crawlId,
      url: 'https://example.com/about',
      title: 'About',
      charCount: 800,
      createdAt: new Date().toISOString(),
    });

    const rows = await db
      .select()
      .from(crawlPages)
      .where(eq(crawlPages.crawlId, crawlId));
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it('stores null for optional fields', async () => {
    const id = randomUUID();
    await db.insert(crawlPages).values({
      id,
      crawlId,
      url: 'https://example.com/minimal',
      createdAt: new Date().toISOString(),
    });

    const rows = await db.select().from(crawlPages).where(eq(crawlPages.id, id));
    expect(rows[0].title).toBeNull();
    expect(rows[0].description).toBeNull();
    expect(rows[0].markdownPath).toBeNull();
    expect(rows[0].charCount).toBeNull();
  });
});

describe('database — page_analyses table', () => {
  const crawlId = randomUUID();
  const pageId = randomUUID();
  const analysisId = randomUUID();

  beforeAll(async () => {
    await db.insert(crawls).values({
      id: crawlId,
      baseUrl: 'https://example.com',
      status: 'completed',
      crawlerType: 'native',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await db.insert(crawlPages).values({
      id: pageId,
      crawlId,
      url: 'https://example.com/',
      createdAt: new Date().toISOString(),
    });
  });

  it('inserts a page analysis', async () => {
    await db.insert(pageAnalyses).values({
      id: analysisId,
      crawlId,
      crawlPageId: pageId,
      url: 'https://example.com/',
      jsonLd: '{"@type":"WebPage"}',
      llmsTxtEntry: '- [Home](/): Homepage',
      entityClarityScore: 8,
      factDensityCount: 12,
      wordCount: 500,
      contentQualityScore: 7,
      semanticStructureScore: 8,
      entityRichnessScore: 6,
      citationReadinessScore: 7,
      technicalSeoScore: 8,
      userIntentAlignmentScore: 9,
      trustSignalsScore: 7,
      authorityScore: 6,
      geoRecommendations: JSON.stringify(['Add more facts', 'Improve schema']),
      createdAt: new Date().toISOString(),
    });

    const rows = await db
      .select()
      .from(pageAnalyses)
      .where(eq(pageAnalyses.id, analysisId));
    expect(rows).toHaveLength(1);
    expect(rows[0].entityClarityScore).toBe(8);
    expect(rows[0].factDensityCount).toBe(12);
    expect(rows[0].wordCount).toBe(500);
  });

  it('stores and retrieves geo_recommendations as JSON', async () => {
    const rows = await db
      .select()
      .from(pageAnalyses)
      .where(eq(pageAnalyses.id, analysisId));
    const recs = JSON.parse(rows[0].geoRecommendations!);
    expect(recs).toEqual(['Add more facts', 'Improve schema']);
  });

  it('queries analyses by crawl ID', async () => {
    const rows = await db
      .select()
      .from(pageAnalyses)
      .where(eq(pageAnalyses.crawlId, crawlId));
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('stores decimal scores correctly', async () => {
    const id = randomUUID();
    await db.insert(pageAnalyses).values({
      id,
      crawlId,
      crawlPageId: pageId,
      url: 'https://example.com/decimal-test',
      entityClarityScore: 7.5,
      contentQualityScore: 6.3,
      semanticStructureScore: 8.1,
      entityRichnessScore: 5.9,
      citationReadinessScore: 7.7,
      technicalSeoScore: 8.2,
      userIntentAlignmentScore: 9.4,
      trustSignalsScore: 6.8,
      authorityScore: 5.5,
      createdAt: new Date().toISOString(),
    });

    const rows = await db.select().from(pageAnalyses).where(eq(pageAnalyses.id, id));
    expect(rows[0].entityClarityScore).toBe(7.5);
    expect(rows[0].contentQualityScore).toBe(6.3);
  });
});

describe('database — saveDb persistence', () => {
  it('persists database to disk', () => {
    saveDb();
    expect(existsSync(TEST_DB_PATH)).toBe(true);
  });
});
