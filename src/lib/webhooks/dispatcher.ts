/**
 * Webhook dispatcher — fire-and-forget HTTP POST with HMAC signature
 *
 * Sends events to registered webhook URLs. Each request includes:
 * - X-Webhook-Event: event name
 * - X-Webhook-Signature: HMAC-SHA256 of the body (if secret configured)
 * - Content-Type: application/json
 */

import { createHmac } from 'node:crypto';
import { getDb } from '@/lib/db/client';
import { webhooks } from '@/lib/db/schema';

export type WebhookEvent =
  | 'crawl.started'
  | 'page.analyzed'
  | 'crawl.completed'
  | 'crawl.failed';

interface WebhookPayload {
  event: WebhookEvent;
  crawlId: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

/**
 * Fire webhook to a single endpoint (fire-and-forget).
 */
async function fireWebhook(
  url: string,
  payload: WebhookPayload,
  secret: string | null
): Promise<void> {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Webhook-Event': payload.event,
  };

  if (secret) {
    headers['X-Webhook-Signature'] = `sha256=${sign(body, secret)}`;
  }

  try {
    await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    console.error(`[webhook] Failed to deliver ${payload.event} to ${url}: ${err instanceof Error ? err.message : err}`);
  }
}

/**
 * Dispatch a webhook event to all registered endpoints.
 * Non-blocking — errors are logged but don't affect the caller.
 */
export async function dispatchWebhook(
  event: WebhookEvent,
  crawlId: string,
  data?: Record<string, unknown>
): Promise<void> {
  try {
    const db = await getDb();
    const hooks = await db.select().from(webhooks);

    if (hooks.length === 0) return;

    const payload: WebhookPayload = {
      event,
      crawlId,
      timestamp: new Date().toISOString(),
      data,
    };

    // Fire all webhooks concurrently, don't await completion
    for (const hook of hooks) {
      if (!hook.active) continue;
      fireWebhook(hook.url, payload, hook.secret).catch(() => {});
    }
  } catch {
    // Webhook dispatch should never crash the pipeline
  }
}
