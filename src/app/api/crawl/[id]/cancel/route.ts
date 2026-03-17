import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/lib/db/client';
import { crawls } from '@/lib/db/schema';
import { taskManager } from '@/lib/queue/task-manager';
import { eq } from 'drizzle-orm';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const cancelled = taskManager.cancel(id);

    if (cancelled) {
      const db = await getDb();
      await db.update(crawls)
        .set({
          status: 'failed',
          errorMessage: 'Cancelled by user',
          updatedAt: new Date().toISOString(),
        })
        .where(eq(crawls.id, id));
      saveDb();
    }

    return NextResponse.json({
      id,
      cancelled,
      message: cancelled ? 'Crawl cancelled' : 'Task not running or not found',
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
