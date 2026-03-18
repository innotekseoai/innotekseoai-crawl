/**
 * Test webhook — sends a synthetic test event to a specific webhook
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { webhooks } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { withAuth } from '@/lib/auth/with-auth';
import { createHmac } from 'node:crypto';

export const POST = withAuth(async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const db = await getDb();
    const [hook] = await db.select().from(webhooks).where(eq(webhooks.id, id));
    if (!hook) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
    }

    const payload = {
      event: 'test',
      crawlId: 'test-' + Date.now(),
      timestamp: new Date().toISOString(),
      data: { message: 'This is a test webhook delivery' },
    };

    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Webhook-Event': 'test',
    };

    if (hook.secret) {
      const sig = createHmac('sha256', hook.secret).update(body).digest('hex');
      headers['X-Webhook-Signature'] = `sha256=${sig}`;
    }

    const res = await fetch(hook.url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(10_000),
    });

    return NextResponse.json({
      success: res.ok,
      status: res.status,
      statusText: res.statusText,
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to deliver',
    });
  }
});
