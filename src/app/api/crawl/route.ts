import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDb, saveDb } from '@/lib/db/client';
import { crawls } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';

export async function POST(request: NextRequest) {
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

    // Store analysis config so /start can read it without relying on URL params
    const config = analyze && modelPath
      ? JSON.stringify({ analyze, modelPath, maxDepth: maxDepth ?? null })
      : (maxDepth !== undefined ? JSON.stringify({ maxDepth }) : null);

    await db.insert(crawls).values({
      id: crawlId,
      baseUrl: url,
      status: 'pending',
      crawlerType,
      pageLimit: Math.min(Math.max(1, limit), 200),
      siteMetrics: config, // temporarily stores config until analysis runs
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
}

export async function GET() {
  try {
    const db = await getDb();
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
      .orderBy(desc(crawls.createdAt));

    return NextResponse.json({ crawls: results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
