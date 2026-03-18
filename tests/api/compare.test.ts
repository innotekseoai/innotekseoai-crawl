/**
 * API integration tests — compare endpoint
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { existsSync, rmSync, mkdirSync } from 'node:fs';

const TEST_DB_DIR = './data/test-api-compare';
process.env.CRAWL_DB_PATH = `${TEST_DB_DIR}/test.db`;

if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true });
mkdirSync(TEST_DB_DIR, { recursive: true });

const { getDb, saveDb } = await import('../../src/lib/db/client.js');
const { crawls } = await import('../../src/lib/db/schema.js');
const compareRoute = await import('../../src/app/api/crawl/compare/route.js');

function makeRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    headers: { host: 'localhost:3000', origin: 'http://localhost:3000' },
  });
}

let db: Awaited<ReturnType<typeof getDb>>;
const crawlA = randomUUID();
const crawlB = randomUUID();
const crawlNoMetrics = randomUUID();

beforeAll(async () => {
  db = await getDb();
  const now = new Date().toISOString();

  const metricsA = {
    avg_entity_clarity: 6.0,
    avg_content_quality: 5.5,
    avg_semantic_structure: 6.0,
    avg_entity_richness: 5.0,
    avg_citation_readiness: 4.5,
    avg_technical_seo: 7.0,
    avg_user_intent: 6.5,
    avg_trust_signals: 5.0,
    avg_authority: 4.0,
    premium_score: 55,
    schema_completeness_score: 40,
    overall_grade: 'C',
  };

  const metricsB = {
    avg_entity_clarity: 8.0,
    avg_content_quality: 7.5,
    avg_semantic_structure: 8.0,
    avg_entity_richness: 7.0,
    avg_citation_readiness: 6.5,
    avg_technical_seo: 8.5,
    avg_user_intent: 8.0,
    avg_trust_signals: 7.0,
    avg_authority: 6.5,
    premium_score: 75,
    schema_completeness_score: 80,
    overall_grade: 'B',
  };

  await db.insert(crawls).values([
    { id: crawlA, baseUrl: 'https://compare.com', status: 'completed', crawlerType: 'native',
      overallGrade: 'C', premiumScore: 55, siteMetrics: JSON.stringify(metricsA), createdAt: now, updatedAt: now },
    { id: crawlB, baseUrl: 'https://compare.com', status: 'completed', crawlerType: 'native',
      overallGrade: 'B', premiumScore: 75, siteMetrics: JSON.stringify(metricsB), createdAt: now, updatedAt: now },
    { id: crawlNoMetrics, baseUrl: 'https://nometrics.com', status: 'completed', crawlerType: 'native',
      createdAt: now, updatedAt: now },
  ]);
  saveDb();
});

afterAll(() => {
  if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true });
});

describe('GET /api/crawl/compare', () => {
  it('computes deltas between two completed crawls', async () => {
    const req = makeRequest(`http://localhost:3000/api/crawl/compare?a=${crawlA}&b=${crawlB}`);
    const res = await compareRoute.GET(req, { params: Promise.resolve({}) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.before.id).toBe(crawlA);
    expect(data.after.id).toBe(crawlB);

    // Check deltas are positive (B is better than A)
    expect(data.deltas.avg_entity_clarity.delta).toBe(2);
    expect(data.deltas.avg_content_quality.delta).toBe(2);
    expect(data.deltas.premium_score.delta).toBe(20);
  });

  it('returns 400 for missing params', async () => {
    const req = makeRequest('http://localhost:3000/api/crawl/compare?a=only-one');
    const res = await compareRoute.GET(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(400);
  });

  it('returns 404 for nonexistent crawl', async () => {
    const req = makeRequest(`http://localhost:3000/api/crawl/compare?a=${crawlA}&b=nonexistent`);
    const res = await compareRoute.GET(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(404);
  });

  it('returns 400 when one crawl has no metrics', async () => {
    const req = makeRequest(`http://localhost:3000/api/crawl/compare?a=${crawlA}&b=${crawlNoMetrics}`);
    const res = await compareRoute.GET(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(400);
  });
});
