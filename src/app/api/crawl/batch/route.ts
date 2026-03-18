/**
 * Batch re-crawl — create new crawls for a list of URLs from existing crawl IDs
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDb, saveDb } from '@/lib/db/client';
import { crawls } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { withAuth } from '@/lib/auth/with-auth';

export const POST = withAuth(async function POST(request: NextRequest) {
  try {
    const { ids } = await request.json() as { ids: string[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array is required' }, { status: 400 });
    }

    const db = await getDb();
    const created: Array<{ id: string; baseUrl: string }> = [];

    for (const oldId of ids) {
      const [original] = await db.select().from(crawls).where(eq(crawls.id, oldId));
      if (!original) continue;

      const newId = randomUUID();
      const now = new Date().toISOString();

      await db.insert(crawls).values({
        id: newId,
        baseUrl: original.baseUrl,
        status: 'pending',
        crawlerType: original.crawlerType,
        pageLimit: original.pageLimit,
        config: original.config,
        createdAt: now,
        updatedAt: now,
      });

      created.push({ id: newId, baseUrl: original.baseUrl });
    }

    saveDb();
    return NextResponse.json({ created }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
});
