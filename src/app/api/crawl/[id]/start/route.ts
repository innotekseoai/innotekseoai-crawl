import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { crawls } from '@/lib/db/schema';
import { runPipeline } from '@/lib/queue/crawl-pipeline';
import { eq } from 'drizzle-orm';
import { withAuth } from '@/lib/auth/with-auth';

export const POST = withAuth(async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const db = await getDb();
    const crawl = await db.select().from(crawls).where(eq(crawls.id, id)).then((r) => r[0]);

    if (!crawl) {
      return NextResponse.json({ error: 'Crawl not found' }, { status: 404 });
    }

    if (crawl.status !== 'pending') {
      return NextResponse.json({ error: `Crawl already ${crawl.status}` }, { status: 400 });
    }

    // Read config stored by POST /api/crawl
    let analyze = false;
    let modelPath: string | undefined;
    let maxDepth: number | undefined;
    if (crawl.config) {
      try {
        const cfg = JSON.parse(crawl.config);
        analyze = cfg.analyze ?? false;
        modelPath = cfg.modelPath;
        maxDepth = cfg.maxDepth ?? undefined;
      } catch { /* not config JSON, ignore */ }
    }

    runPipeline({
      crawlId: id,
      url: crawl.baseUrl,
      limit: crawl.pageLimit,
      crawlerType: crawl.crawlerType as 'native' | 'browser',
      analyze,
      modelPath,
      maxDepth,
    });

    return NextResponse.json({ id, status: 'starting' });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
});
