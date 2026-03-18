import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDb, saveDb } from '@/lib/db/client';
import { crawls } from '@/lib/db/schema';
import { desc, like, inArray, sql, and } from 'drizzle-orm';
import { withAuth } from '@/lib/auth/with-auth';

export const POST = withAuth(async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, limit = 50, crawlerType = 'native', analyze = false, modelPath, maxDepth } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    const db = await getDb();
    const crawlId = randomUUID();
    const now = new Date().toISOString();

    // Store analysis config in dedicated column so /start can read it
    const config = analyze && modelPath
      ? JSON.stringify({ analyze, modelPath, maxDepth: maxDepth ?? null })
      : (maxDepth !== undefined ? JSON.stringify({ maxDepth }) : null);

    await db.insert(crawls).values({
      id: crawlId,
      baseUrl: url,
      status: 'pending',
      crawlerType,
      pageLimit: Math.min(Math.max(1, limit), 200),
      config,
      createdAt: now,
      updatedAt: now,
    });
    saveDb();

    return NextResponse.json({ id: crawlId, status: 'pending' }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
});

export const GET = withAuth(async function GET(request: NextRequest) {
  try {
    const db = await getDb();
    const url = request.nextUrl;
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10)));
    const q = url.searchParams.get('q')?.trim();
    const gradeFilter = url.searchParams.get('grade')?.split(',').filter(Boolean);
    const statusFilter = url.searchParams.get('status')?.split(',').filter(Boolean);

    // Build WHERE conditions
    const conditions = [];
    if (q) {
      conditions.push(like(crawls.baseUrl, `%${q}%`));
    }
    if (gradeFilter && gradeFilter.length > 0) {
      conditions.push(inArray(crawls.overallGrade, gradeFilter as ('A' | 'B' | 'C' | 'D' | 'F')[]));
    }
    if (statusFilter && statusFilter.length > 0) {
      conditions.push(inArray(crawls.status, statusFilter as ('pending' | 'crawling' | 'analyzing' | 'completed' | 'failed')[]));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // Count total
    const [{ count: total }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(crawls)
      .where(where);

    // Paginated results
    const results = await db
      .select({
        id: crawls.id,
        baseUrl: crawls.baseUrl,
        status: crawls.status,
        pagesCrawled: crawls.pagesCrawled,
        overallGrade: crawls.overallGrade,
        premiumScore: crawls.premiumScore,
        createdAt: crawls.createdAt,
        pageLimit: crawls.pageLimit,
        crawlerType: crawls.crawlerType,
      })
      .from(crawls)
      .where(where)
      .orderBy(desc(crawls.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    return NextResponse.json({ crawls: results, total, page, limit });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
});

export const DELETE = withAuth(async function DELETE(request: NextRequest) {
  try {
    const { ids } = await request.json() as { ids: string[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array is required' }, { status: 400 });
    }

    const db = await getDb();
    const { deleteCrawlData } = await import('@/lib/db/delete-helpers');
    let deleted = 0;
    for (const id of ids) {
      await deleteCrawlData(db, id);
      deleted++;
    }
    saveDb();

    return NextResponse.json({ deleted });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
});
