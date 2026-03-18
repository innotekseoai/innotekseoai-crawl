/**
 * API integration tests — crawl CRUD + pagination
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { existsSync, rmSync, mkdirSync } from 'node:fs';

// Use isolated test DB
const TEST_DB_DIR = './data/test-api-crawl';
const TEST_DB_PATH = `${TEST_DB_DIR}/test.db`;
process.env.CRAWL_DB_PATH = TEST_DB_PATH;
process.env.MIRRORS_DIR = `${TEST_DB_DIR}/mirrors`;

if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true });
mkdirSync(TEST_DB_DIR, { recursive: true });

const { getDb, saveDb } = await import('../../src/lib/db/client.js');
const { crawls } = await import('../../src/lib/db/schema.js');

// Import route handlers — they use withAuth, but since no API keys exist,
// all requests are allowed (open access mode)
const crawlRoute = await import('../../src/app/api/crawl/route.js');

function makeRequest(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    ...init,
    headers: {
      'host': 'localhost:3000',
      'origin': 'http://localhost:3000',
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

describe('POST /api/crawl', () => {
  it('creates a crawl with valid URL', async () => {
    const req = makeRequest('http://localhost:3000/api/crawl', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com', limit: 10 }),
    });

    const res = await crawlRoute.POST(req, { params: Promise.resolve({}) });
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.id).toBeDefined();
    expect(data.status).toBe('pending');
  });

  it('returns 400 for missing URL', async () => {
    const req = makeRequest('http://localhost:3000/api/crawl', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const res = await crawlRoute.POST(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid URL', async () => {
    const req = makeRequest('http://localhost:3000/api/crawl', {
      method: 'POST',
      body: JSON.stringify({ url: 'not-a-url' }),
    });

    const res = await crawlRoute.POST(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(400);
  });

  it('stores config in config column, not siteMetrics', async () => {
    const req = makeRequest('http://localhost:3000/api/crawl', {
      method: 'POST',
      body: JSON.stringify({
        url: 'https://config-test.com',
        limit: 5,
        analyze: true,
        modelPath: '/data/models/test.gguf',
      }),
    });

    const res = await crawlRoute.POST(req, { params: Promise.resolve({}) });
    const data = await res.json();

    const [crawl] = await db.select().from(crawls).where(
      (await import('drizzle-orm')).eq(crawls.id, data.id)
    );

    expect(crawl.config).toBeTruthy();
    expect(crawl.siteMetrics).toBeNull();
    const config = JSON.parse(crawl.config!);
    expect(config.analyze).toBe(true);
    expect(config.modelPath).toBe('/data/models/test.gguf');
  });

  it('clamps page limit to 1-200 range', async () => {
    const req = makeRequest('http://localhost:3000/api/crawl', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://limit-test.com', limit: 999 }),
    });

    const res = await crawlRoute.POST(req, { params: Promise.resolve({}) });
    const data = await res.json();

    const [crawl] = await db.select().from(crawls).where(
      (await import('drizzle-orm')).eq(crawls.id, data.id)
    );
    expect(crawl.pageLimit).toBe(200);
  });
});

describe('GET /api/crawl', () => {
  beforeAll(async () => {
    // Seed some crawls for pagination testing
    for (let i = 0; i < 25; i++) {
      await db.insert(crawls).values({
        id: randomUUID(),
        baseUrl: `https://page-${i}.com`,
        status: i % 5 === 0 ? 'completed' : 'pending',
        crawlerType: 'native',
        overallGrade: i % 5 === 0 ? 'B' : null,
        premiumScore: i % 5 === 0 ? 70 : null,
        createdAt: new Date(Date.now() - i * 60000).toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    saveDb();
  });

  it('returns paginated results with total', async () => {
    const req = makeRequest('http://localhost:3000/api/crawl?page=1&limit=10');
    const res = await crawlRoute.GET(req, { params: Promise.resolve({}) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.crawls).toHaveLength(10);
    expect(data.total).toBeGreaterThanOrEqual(25);
    expect(data.page).toBe(1);
    expect(data.limit).toBe(10);
  });

  it('returns second page', async () => {
    const req = makeRequest('http://localhost:3000/api/crawl?page=2&limit=10');
    const res = await crawlRoute.GET(req, { params: Promise.resolve({}) });
    const data = await res.json();

    expect(data.crawls).toHaveLength(10);
    expect(data.page).toBe(2);
  });

  it('filters by search query', async () => {
    const req = makeRequest('http://localhost:3000/api/crawl?q=page-0');
    const res = await crawlRoute.GET(req, { params: Promise.resolve({}) });
    const data = await res.json();

    expect(data.crawls.length).toBeGreaterThanOrEqual(1);
    expect(data.crawls.every((c: { baseUrl: string }) => c.baseUrl.includes('page-0'))).toBe(true);
  });

  it('filters by status', async () => {
    const req = makeRequest('http://localhost:3000/api/crawl?status=completed');
    const res = await crawlRoute.GET(req, { params: Promise.resolve({}) });
    const data = await res.json();

    expect(data.crawls.length).toBeGreaterThanOrEqual(1);
    // All returned crawls should be completed
    for (const c of data.crawls) {
      expect(c.status).toBe('completed');
    }
  });

  it('filters by grade', async () => {
    const req = makeRequest('http://localhost:3000/api/crawl?grade=B');
    const res = await crawlRoute.GET(req, { params: Promise.resolve({}) });
    const data = await res.json();

    expect(data.crawls.length).toBeGreaterThanOrEqual(1);
  });

  it('defaults to page 1 limit 20', async () => {
    const req = makeRequest('http://localhost:3000/api/crawl');
    const res = await crawlRoute.GET(req, { params: Promise.resolve({}) });
    const data = await res.json();

    expect(data.page).toBe(1);
    expect(data.limit).toBe(20);
    expect(data.crawls.length).toBeLessThanOrEqual(20);
  });
});

describe('DELETE /api/crawl', () => {
  it('batch deletes crawls by IDs', async () => {
    // Create two crawls to delete
    const id1 = randomUUID();
    const id2 = randomUUID();
    const now = new Date().toISOString();
    await db.insert(crawls).values([
      { id: id1, baseUrl: 'https://delete-1.com', status: 'completed', crawlerType: 'native', createdAt: now, updatedAt: now },
      { id: id2, baseUrl: 'https://delete-2.com', status: 'completed', crawlerType: 'native', createdAt: now, updatedAt: now },
    ]);
    saveDb();

    const req = makeRequest('http://localhost:3000/api/crawl', {
      method: 'DELETE',
      body: JSON.stringify({ ids: [id1, id2] }),
    });

    const res = await crawlRoute.DELETE(req, { params: Promise.resolve({}) });
    const data = await res.json();

    expect(data.deleted).toBe(2);

    // Verify they're gone
    const { eq } = await import('drizzle-orm');
    const [c1] = await db.select().from(crawls).where(eq(crawls.id, id1));
    const [c2] = await db.select().from(crawls).where(eq(crawls.id, id2));
    expect(c1).toBeUndefined();
    expect(c2).toBeUndefined();
  });

  it('returns 400 for empty ids array', async () => {
    const req = makeRequest('http://localhost:3000/api/crawl', {
      method: 'DELETE',
      body: JSON.stringify({ ids: [] }),
    });

    const res = await crawlRoute.DELETE(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(400);
  });
});
