/**
 * API Key authentication
 *
 * Bearer token validation with SHA-256 hashed storage.
 * Web UI is exempt via same-origin check (Referer/Origin header).
 */

import { createHash, randomBytes } from 'node:crypto';
import { NextRequest } from 'next/server';
import { getDb, saveDb } from '@/lib/db/client';
import { apiKeys } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Generate a new API key. Returns the raw key (show once to user)
 * and stores the SHA-256 hash in the database.
 */
export async function generateApiKey(name: string): Promise<{ key: string; id: string }> {
  const raw = `isk_${randomBytes(24).toString('hex')}`;
  const hash = hashKey(raw);
  const id = randomBytes(8).toString('hex');

  const db = await getDb();
  await db.insert(apiKeys).values({
    id,
    name,
    keyHash: hash,
    createdAt: new Date().toISOString(),
  });
  saveDb();

  return { key: raw, id };
}

/**
 * Validate a Bearer token against stored API keys.
 */
export async function validateApiKey(token: string): Promise<boolean> {
  const hash = hashKey(token);
  const db = await getDb();
  const [match] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, hash));
  return !!match;
}

/**
 * Check if a request is from the same-origin web UI.
 * Same-origin requests have matching Origin or Referer headers.
 */
function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const host = request.headers.get('host');

  if (!host) return false;

  // Origin header present = browser request
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch { return false; }
  }

  // Referer fallback
  if (referer) {
    try {
      return new URL(referer).host === host;
    } catch { return false; }
  }

  return false;
}

/**
 * Authenticate an API request.
 * Returns true if:
 * - Request is from same-origin web UI (exempt)
 * - No API keys exist in the database (open access)
 * - Valid Bearer token provided
 */
export async function authenticateRequest(request: NextRequest): Promise<boolean> {
  // Same-origin web UI is always allowed
  if (isSameOrigin(request)) return true;

  // Check if any API keys exist — if none, API auth is not enabled
  const db = await getDb();
  const keys = await db.select().from(apiKeys);
  if (keys.length === 0) return true;

  // Require Bearer token
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return false;

  const token = auth.slice(7).trim();
  return validateApiKey(token);
}
