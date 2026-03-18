/**
 * API integration tests — export endpoint (CSV + JSON formats)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { existsSync, rmSync, mkdirSync } from 'node:fs';
import { eq } from 'drizzle-orm';

const TEST_DB_DIR = './data/test-api-export';
process.env.CRAWL_DB_PATH = `${TEST_DB_DIR}/test.db`;
process.env.MIRRORS_DIR = `${TEST_DB_DIR}/mirrors`;

if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true });
mkdirSync(TEST_DB_DIR, { recursive: true });

const { getDb, saveDb } = await import('../../src/lib/db/client.js');
const { crawls, crawlPages, pageAnalyses } = await import('../../src/lib/db/schema.js');
const exportRoute = await import('../../src/app/api/crawl/[id]/export/route.js');

function makeRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    headers: { host: 'localhost:3000', origin: 'http://localhost:3000' },
  });
}

let db: Awaited<ReturnType<typeof getDb>>;
const crawlId = randomUUID();
const pageId = randomUUID();
const analysisId = randomUUID();

beforeAll(async () => {
  db = await getDb();
  const now = new Date().toISOString();

  await db.insert(crawls).values({
    id: crawlId,
    baseUrl: 'https://export-test.com',
    status: 'completed',
    crawlerType: 'native',
    pagesCrawled: 1,
    overallGrade: 'B',
    premiumScore: 72,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(crawlPages).values({
    id: pageId,
    crawlId,
    url: 'https://export-test.com/',
    title: 'Home',
    charCount: 1200,
    createdAt: now,
  });

  await db.insert(pageAnalyses).values({
    id: analysisId,
    crawlId,
    crawlPageId: pageId,
    url: 'https://export-test.com/',
    entityClarityScore: 8,
    contentQualityScore: 7,
    semanticStructureScore: 8,
    entityRichnessScore: 6,
    citationReadinessScore: 7,
    technicalSeoScore: 8,
    userIntentAlignmentScore: 9,
    trustSignalsScore: 7,
    authorityScore: 6,
    factDensityCount: 12,
    wordCount: 500,
    geoRecommendations: JSON.stringify(['Add schema markup']),
    createdAt: now,
  });

  saveDb();
});

afterAll(() => {
  if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true });
});

describe('GET /api/crawl/[id]/export', () => {
  it('exports JSON with correct structure', async () => {
    const req = makeRequest(`http://localhost:3000/api/crawl/${crawlId}/export?format=json`);
    const res = await exportRoute.GET(req, { params: Promise.resolve({ id: crawlId }) });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('content-disposition')).toContain('.json');

    const text = await res.text();
    const data = JSON.parse(text);

    expect(data.crawl.id).toBe(crawlId);
    expect(data.crawl.baseUrl).toBe('https://export-test.com');
    expect(data.pages).toHaveLength(1);
    expect(data.pages[0].scores.entity_clarity).toBe(8);
    expect(data.pages[0].scores.content_quality).toBe(7);
    expect(data.pages[0].recommendations).toEqual(['Add schema markup']);
  });

  it('exports CSV with headers and data', async () => {
    const req = makeRequest(`http://localhost:3000/api/crawl/${crawlId}/export?format=csv`);
    const res = await exportRoute.GET(req, { params: Promise.resolve({ id: crawlId }) });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain('.csv');

    const csv = await res.text();
    const lines = csv.trim().split('\n');

    // Header row
    expect(lines[0]).toContain('url');
    expect(lines[0]).toContain('entity_clarity');
    expect(lines[0]).toContain('content_quality');

    // Data row
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines[1]).toContain('export-test.com');
  });

  it('returns 404 for unknown crawl', async () => {
    const req = makeRequest(`http://localhost:3000/api/crawl/nonexistent/export`);
    const res = await exportRoute.GET(req, { params: Promise.resolve({ id: 'nonexistent' }) });
    expect(res.status).toBe(404);
  });
});
