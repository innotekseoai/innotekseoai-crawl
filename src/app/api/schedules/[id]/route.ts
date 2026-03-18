/**
 * Schedule toggle — PATCH to enable/disable
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/lib/db/client';
import { schedules } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { withAuth } from '@/lib/auth/with-auth';

export const PATCH = withAuth(async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const { active } = body as { active?: boolean };

    const db = await getDb();
    const [schedule] = await db.select().from(schedules).where(eq(schedules.id, id));
    if (!schedule) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
    }

    await db.update(schedules)
      .set({ active: active ?? !schedule.active })
      .where(eq(schedules.id, id));
    saveDb();

    return NextResponse.json({ id, active: active ?? !schedule.active });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
});
