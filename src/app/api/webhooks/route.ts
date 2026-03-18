/**
 * Webhook management — CRUD for webhook endpoints
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { getDb, saveDb } from '@/lib/db/client';
import { webhooks } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { withAuth } from '@/lib/auth/with-auth';

export const GET = withAuth(async function GET() {
  try {
    const db = await getDb();
    const hooks = await db.select().from(webhooks);
    return NextResponse.json({ webhooks: hooks });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
});

export const POST = withAuth(async function POST(request: NextRequest) {
  try {
    const { url, secret } = await request.json() as { url: string; secret?: string };
    if (!url) {
      return NextResponse.json({ error: 'url is required' }, { status: 400 });
    }

    try { new URL(url); } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    const db = await getDb();
    const id = randomBytes(8).toString('hex');

    await db.insert(webhooks).values({
      id,
      url,
      secret: secret ?? null,
      active: true,
      createdAt: new Date().toISOString(),
    });
    saveDb();

    return NextResponse.json({ id, url }, { status: 201 });
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
    await db.delete(webhooks).where(eq(webhooks.id, id));
    saveDb();

    return NextResponse.json({ deleted: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
});
