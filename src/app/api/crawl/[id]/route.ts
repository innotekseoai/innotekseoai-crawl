import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/lib/db/client';
import { crawls, crawlPages, pageAnalyses } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { withAuth } from '@/lib/auth/with-auth';

export const GET = withAuth(async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = await getDb();

    const [crawl] = await db.select().from(crawls).where(eq(crawls.id, id));
    if (!crawl) {
      return NextResponse.json({ error: 'Crawl not found' }, { status: 404 });
    }

    const pages = await db.select().from(crawlPages).where(eq(crawlPages.crawlId, id));
    const analyses = await db.select().from(pageAnalyses).where(eq(pageAnalyses.crawlId, id));

    let siteMetrics = null;
    let modelUsed: string | null = null;
    if (crawl.siteMetrics) {
      try {
        siteMetrics = JSON.parse(crawl.siteMetrics);
        modelUsed = siteMetrics?.model_used ?? null;
      } catch { /* not valid JSON — ignore */ }
    }
    // Fall back to config for model name if not yet in siteMetrics
    if (!modelUsed && crawl.config) {
      try {
        const cfg = JSON.parse(crawl.config);
        modelUsed = cfg.modelPath?.split('/').pop() ?? null;
      } catch { /* ignore */ }
    }

    return NextResponse.json({
      crawl: { ...crawl, siteMetrics, modelUsed },
      pages,
      analyses,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
});

export const DELETE = withAuth(async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const db = await getDb();
    const [crawl] = await db.select().from(crawls).where(eq(crawls.id, id));
    if (!crawl) {
      return NextResponse.json({ error: 'Crawl not found' }, { status: 404 });
    }

    const { deleteCrawlData } = await import('@/lib/db/delete-helpers');
    await deleteCrawlData(db, id);
    saveDb();

    return NextResponse.json({ deleted: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
});
