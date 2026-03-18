/**
 * Schedule management — CRUD for recurring crawls
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { getDb, saveDb } from '@/lib/db/client';
import { schedules } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { withAuth } from '@/lib/auth/with-auth';
import { nextRunDate } from '@/lib/scheduler/cron-parser';

export const GET = withAuth(async function GET() {
  try {
    const db = await getDb();
    const all = await db.select().from(schedules);
    return NextResponse.json({ schedules: all });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
});

export const POST = withAuth(async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { baseUrl, frequency = 'weekly', config } = body as {
      baseUrl: string;
      frequency?: string;
      config?: Record<string, unknown>;
    };

    if (!baseUrl) {
      return NextResponse.json({ error: 'baseUrl is required' }, { status: 400 });
    }

    try { new URL(baseUrl); } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    const next = nextRunDate(frequency);
    const id = randomBytes(8).toString('hex');
    const db = await getDb();

    await db.insert(schedules).values({
      id,
      baseUrl,
      config: config ? JSON.stringify(config) : null,
      frequency,
      nextRunAt: next.toISOString(),
      active: true,
      createdAt: new Date().toISOString(),
    });
    saveDb();

    return NextResponse.json({ id, nextRunAt: next.toISOString() }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
});

export const DELETE = withAuth(async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const db = await getDb();
    await db.delete(schedules).where(eq(schedules.id, id));
    saveDb();

    return NextResponse.json({ deleted: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
});
