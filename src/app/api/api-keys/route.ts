/**
 * API Key management — list, generate, revoke
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/lib/db/client';
import { apiKeys } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { generateApiKey } from '@/lib/auth/api-key';
import { withAuth } from '@/lib/auth/with-auth';

export const GET = withAuth(async function GET() {
  try {
    const db = await getDb();
    const keys = await db
      .select({ id: apiKeys.id, name: apiKeys.name, createdAt: apiKeys.createdAt })
      .from(apiKeys);
    return NextResponse.json({ keys });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
});

export const POST = withAuth(async function POST(request: NextRequest) {
  try {
    const { name } = await request.json() as { name: string };
    if (!name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const result = await generateApiKey(name.trim());
    return NextResponse.json({ id: result.id, key: result.key }, { status: 201 });
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
    await db.delete(apiKeys).where(eq(apiKeys.id, id));
    saveDb();

    return NextResponse.json({ revoked: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
});
