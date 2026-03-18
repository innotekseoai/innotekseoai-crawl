/**
 * API integration tests — crawl lifecycle (create → get → delete)
 *
 * Tests the full CRUD lifecycle without actually running the crawler or AI.
 * Pipeline tests would require mocking crawlNative and analyzePageForGeo.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { existsSync, rmSync, mkdirSync } from 'node:fs';

const TEST_DB_DIR = './data/test-api-lifecycle';
process.env.CRAWL_DB_PATH = `${TEST_DB_DIR}/test.db`;
process.env.MIRRORS_DIR = `${TEST_DB_DIR}/mirrors`;

if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true });
mkdirSync(TEST_DB_DIR, { recursive: true });

const { getDb, saveDb } = await import('../../src/lib/db/client.js');
const { crawls, crawlPages, pageAnalyses } = await import('../../src/lib/db/schema.js');

const crawlRoute = await import('../../src/app/api/crawl/route.js');
const crawlIdRoute = await import('../../src/app/api/crawl/[id]/route.js');
const batchRoute = await import('../../src/app/api/crawl/batch/route.js');

function makeRequest(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    ...init,
    headers: {
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
      ...Object.fromEntries(new Headers(init?.headers).entries()),
    },
  });
}

let db: Awaited<ReturnType<typeof getDb>>;

beforeAll(async () => {
  db = await getDb();
});

afterAll(() => {
  if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true });
});

describe('crawl lifecycle', () => {
  let crawlId: string;

  it('creates a new crawl', async () => {
    const req = makeRequest('http://localhost:3000/api/crawl', {
      method: 'POST',
      body: JSON.stringify({
        url: 'https://lifecycle-test.com',
        limit: 5,
        analyze: true,
        modelPath: '/data/models/test.gguf',
      }),
    });

    const res = await crawlRoute.POST(req, { params: Promise.resolve({}) });
    const data = await res.json();

    expect(res.status).toBe(201);
    crawlId = data.id;
  });

  it('retrieves crawl by ID with config separated from metrics', async () => {
    const req = makeRequest(`http://localhost:3000/api/crawl/${crawlId}`);
    const res = await crawlIdRoute.GET(req, { params: Promise.resolve({ id: crawlId }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.crawl.id).toBe(crawlId);
    expect(data.crawl.baseUrl).toBe('https://lifecycle-test.com');
    expect(data.crawl.status).toBe('pending');
    // siteMetrics should be null (config is in separate column)
    expect(data.crawl.siteMetrics).toBeNull();
    // modelUsed should be extracted from config
    expect(data.crawl.modelUsed).toBe('test.gguf');
    expect(data.pages).toEqual([]);
    expect(data.analyses).toEqual([]);
  });

  it('simulates completed crawl with analysis results', async () => {
    const { eq } = await import('drizzle-orm');
    const now = new Date().toISOString();

    // Insert a page
    const pageId = randomUUID();
    await db.insert(crawlPages).values({
      id: pageId,
      crawlId,
      url: 'https://lifecycle-test.com/',
      title: 'Home',
      charCount: 1000,
      status: 'analyzed',
      createdAt: now,
    });

    // Insert an analysis
    await db.insert(pageAnalyses).values({
      id: randomUUID(),
      crawlId,
      crawlPageId: pageId,
      url: 'https://lifecycle-test.com/',
      entityClarityScore: 7,
      contentQualityScore: 8,
      semanticStructureScore: 7,
      entityRichnessScore: 6,
      citationReadinessScore: 7,
      technicalSeoScore: 8,
      userIntentAlignmentScore: 9,
      trustSignalsScore: 7,
      authorityScore: 6,
      factDensityCount: 10,
      wordCount: 400,
      geoRecommendations: '["Add structured data"]',
      scoreExplanations: '{"entity_richness":"few named entities"}',
      createdAt: now,
    });

    // Update crawl to completed with siteMetrics
    await db.update(crawls)
      .set({
        status: 'completed',
        pagesCrawled: 1,
        overallGrade: 'B',
        premiumScore: 72,
        siteMetrics: JSON.stringify({
          avg_entity_clarity: 7,
          overall_grade: 'B',
          premium_score: 72,
          model_used: 'test.gguf',
        }),
        updatedAt: now,
      })
      .where(eq(crawls.id, crawlId));
    saveDb();

    // Fetch and verify
    const req = makeRequest(`http://localhost:3000/api/crawl/${crawlId}`);
    const res = await crawlIdRoute.GET(req, { params: Promise.resolve({ id: crawlId }) });
    const data = await res.json();

    expect(data.crawl.status).toBe('completed');
    expect(data.crawl.overallGrade).toBe('B');
    expect(data.crawl.siteMetrics.avg_entity_clarity).toBe(7);
    expect(data.crawl.modelUsed).toBe('test.gguf');
    expect(data.pages).toHaveLength(1);
    expect(data.analyses).toHaveLength(1);
    expect(data.analyses[0].scoreExplanations).toBe('{"entity_richness":"few named entities"}');
  });

  it('deletes crawl with cascade', async () => {
    const req = makeRequest(`http://localhost:3000/api/crawl/${crawlId}`, { method: 'DELETE' });
    const res = await crawlIdRoute.DELETE(req, { params: Promise.resolve({ id: crawlId }) });
    const data = await res.json();

    expect(data.deleted).toBe(true);

    // Verify cascade — crawl, pages, and analyses all gone
    const { eq } = await import('drizzle-orm');
    const [c] = await db.select().from(crawls).where(eq(crawls.id, crawlId));
    expect(c).toBeUndefined();

    const pages = await db.select().from(crawlPages).where(eq(crawlPages.crawlId, crawlId));
    expect(pages).toHaveLength(0);

    const analyses = await db.select().from(pageAnalyses).where(eq(pageAnalyses.crawlId, crawlId));
    expect(analyses).toHaveLength(0);
  });

  it('returns 404 for deleted crawl', async () => {
    const req = makeRequest(`http://localhost:3000/api/crawl/${crawlId}`);
    const res = await crawlIdRoute.GET(req, { params: Promise.resolve({ id: crawlId }) });
    expect(res.status).toBe(404);
  });
});

describe('batch re-crawl', () => {
  it('creates new crawls from existing IDs', async () => {
    const now = new Date().toISOString();
    const originalId = randomUUID();

    await db.insert(crawls).values({
      id: originalId,
      baseUrl: 'https://batch-test.com',
      status: 'completed',
      crawlerType: 'native',
      pageLimit: 30,
      config: JSON.stringify({ analyze: true, modelPath: '/test.gguf' }),
      createdAt: now,
      updatedAt: now,
    });
    saveDb();

    const req = makeRequest('http://localhost:3000/api/crawl/batch', {
      method: 'POST',
      body: JSON.stringify({ ids: [originalId] }),
    });

    const res = await batchRoute.POST(req, { params: Promise.resolve({}) });
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.created).toHaveLength(1);
    expect(data.created[0].baseUrl).toBe('https://batch-test.com');

    // Verify the new crawl has the same config
    const { eq } = await import('drizzle-orm');
    const [newCrawl] = await db.select().from(crawls).where(eq(crawls.id, data.created[0].id));
    expect(newCrawl.status).toBe('pending');
    expect(newCrawl.baseUrl).toBe('https://batch-test.com');
    expect(newCrawl.config).toBeTruthy();
    expect(JSON.parse(newCrawl.config!).analyze).toBe(true);
  });

  it('skips nonexistent IDs', async () => {
    const req = makeRequest('http://localhost:3000/api/crawl/batch', {
      method: 'POST',
      body: JSON.stringify({ ids: ['nonexistent'] }),
    });

    const res = await batchRoute.POST(req, { params: Promise.resolve({}) });
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.created).toHaveLength(0);
  });
});
