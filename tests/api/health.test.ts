/**
 * API integration tests — health endpoint
 */

import { describe, it, expect } from 'vitest';
import { existsSync, rmSync, mkdirSync } from 'node:fs';

const TEST_DB_DIR = './data/test-api-health';
process.env.CRAWL_DB_PATH = `${TEST_DB_DIR}/test.db`;

if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true });
mkdirSync(TEST_DB_DIR, { recursive: true });

// Initialize DB before importing route
await import('../../src/lib/db/client.js');
const healthRoute = await import('../../src/app/api/health/route.js');

import { afterAll } from 'vitest';

afterAll(() => {
  if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true });
});

describe('GET /api/health', () => {
  it('returns health status fields', async () => {
    const res = await healthRoute.GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe('ok');
    expect(data.db).toBe(true);
    expect(typeof data.models).toBe('number');
    expect(typeof data.gpu).toBe('boolean');
    expect(typeof data.uptime).toBe('number');
    expect(data.version).toBe('3.0.0');
    expect(typeof data.activeCrawls).toBe('number');
    expect(data.startedAt).toBeDefined();
  });

  it('is not wrapped in auth (public endpoint)', async () => {
    // Health endpoint exports a plain async function, not withAuth-wrapped
    expect(typeof healthRoute.GET).toBe('function');
    // Should work without any auth headers
    const res = await healthRoute.GET();
    expect(res.status).toBe(200);
  });
});
