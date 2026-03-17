import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { crawls } from '@/lib/db/schema';
import { runPipeline } from '@/lib/queue/crawl-pipeline';
import { eq } from 'drizzle-orm';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const db = await getDb();
    const crawl = await db.select().from(crawls).where(eq(crawls.id, id)).then((r) => r[0]);

    if (!crawl) {
      return NextResponse.json({ error: 'Crawl not found' }, { status: 404 });
    }

    // Allow resume from failed or completed (to re-analyze)
    if (!['failed', 'completed', 'analyzing'].includes(crawl.status)) {
      return NextResponse.json(
        { error: `Cannot resume crawl in '${crawl.status}' state` },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { analyze = true, modelPath } = body as { analyze?: boolean; modelPath?: string };

    // Fire-and-forget — pipeline detects existing pages and skips them
    runPipeline({
      crawlId: id,
      url: crawl.baseUrl,
      limit: crawl.pageLimit,
      crawlerType: crawl.crawlerType as 'native' | 'browser',
      analyze,
      modelPath,
    });

    return NextResponse.json({ id, status: 'resuming' });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
