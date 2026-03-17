import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { crawls, crawlPages, pageAnalyses } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(
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
        const parsed = JSON.parse(crawl.siteMetrics);
        // siteMetrics can be either config {analyze, modelPath} or aggregate results
        if (parsed.modelPath) {
          // Config phase — extract model name
          modelUsed = parsed.modelPath.split('/').pop() ?? null;
        }
        if (parsed.overall_grade || parsed.avg_entity_clarity) {
          // Aggregate results phase
          siteMetrics = parsed;
          // Model name may have been stored during analysis
          modelUsed = parsed.model_used ?? modelUsed;
        }
      } catch {
        // siteMetrics not valid JSON yet — ignore
      }
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
}
