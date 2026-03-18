/**
 * API integration tests — auth system
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { existsSync, rmSync, mkdirSync } from 'node:fs';

const TEST_DB_DIR = './data/test-api-auth';
process.env.CRAWL_DB_PATH = `${TEST_DB_DIR}/test.db`;

if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true });
mkdirSync(TEST_DB_DIR, { recursive: true });

const { getDb } = await import('../../src/lib/db/client.js');
const { generateApiKey, validateApiKey, authenticateRequest } = await import('../../src/lib/auth/api-key.js');
const { withAuth } = await import('../../src/lib/auth/with-auth.js');

let db: Awaited<ReturnType<typeof getDb>>;

beforeAll(async () => {
  db = await getDb();
});

afterAll(() => {
  if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true });
});

function makeRequest(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    headers: { host: 'localhost:3000', ...headers },
  });
}

describe('API key generation and validation', () => {
  let rawKey: string;

  it('generates a key with isk_ prefix', async () => {
    const result = await generateApiKey('Test Key');
    rawKey = result.key;

    expect(result.key).toMatch(/^isk_/);
    expect(result.id).toBeDefined();
  });

  it('validates correct key', async () => {
    const valid = await validateApiKey(rawKey);
    expect(valid).toBe(true);
  });

  it('rejects incorrect key', async () => {
    const valid = await validateApiKey('isk_wrongkey');
    expect(valid).toBe(false);
  });
});

describe('authenticateRequest', () => {
  let rawKey: string;

  beforeAll(async () => {
    // Ensure at least one key exists (from previous test suite)
    const result = await generateApiKey('Auth Test Key');
    rawKey = result.key;
  });

  it('allows same-origin requests without key', async () => {
    const req = makeRequest('http://localhost:3000/api/crawl', {
      origin: 'http://localhost:3000',
    });
    const result = await authenticateRequest(req);
    expect(result).toBe(true);
  });

  it('allows valid Bearer token', async () => {
    const req = makeRequest('http://localhost:3000/api/crawl', {
      authorization: `Bearer ${rawKey}`,
    });
    const result = await authenticateRequest(req);
    expect(result).toBe(true);
  });

  it('rejects missing auth for non-origin requests', async () => {
    const req = makeRequest('http://localhost:3000/api/crawl');
    // No origin, no auth header
    const result = await authenticateRequest(req);
    expect(result).toBe(false);
  });

  it('rejects invalid Bearer token', async () => {
    const req = makeRequest('http://localhost:3000/api/crawl', {
      authorization: 'Bearer isk_invalidtoken',
    });
    const result = await authenticateRequest(req);
    expect(result).toBe(false);
  });
});

describe('withAuth wrapper', () => {
  const handler = withAuth(async () => {
    return NextResponse.json({ ok: true });
  });

  it('returns 401 when auth fails', async () => {
    // Create a request with no auth and no origin (will fail auth since keys exist)
    const req = makeRequest('http://localhost:3000/api/test', {
      authorization: 'Bearer isk_badkey',
    });
    const res = await handler(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data.error).toContain('Unauthorized');
  });

  it('passes through when auth succeeds (same-origin)', async () => {
    const req = makeRequest('http://localhost:3000/api/test', {
      origin: 'http://localhost:3000',
    });
    const res = await handler(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.ok).toBe(true);
  });
});
