/**
 * Health endpoint — exempt from auth
 * Returns system status for monitoring.
 */

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { crawls } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const startedAt = new Date().toISOString();

export async function GET() {
  try {
    // DB check
    let dbOk = false;
    let activeCrawls = 0;
    try {
      const db = await getDb();
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(crawls)
        .where(eq(crawls.status, 'crawling'));
      activeCrawls = count;
      dbOk = true;
    } catch { /* db not available */ }

    // Model check
    const modelsDir = resolve('./data/models');
    const modelCount = existsSync(modelsDir)
      ? readdirSync(modelsDir).filter((f) => f.endsWith('.gguf')).length
      : 0;

    // GPU server check
    let gpuAvailable = false;
    try {
      const res = await fetch('http://127.0.0.1:8012/health', {
        signal: AbortSignal.timeout(1000),
      });
      gpuAvailable = res.ok;
    } catch { /* no GPU server */ }

    const uptimeMs = Date.now() - new Date(startedAt).getTime();

    return NextResponse.json({
      status: dbOk ? 'ok' : 'degraded',
      db: dbOk,
      models: modelCount,
      gpu: gpuAvailable,
      uptime: Math.round(uptimeMs / 1000),
      startedAt,
      activeCrawls,
      version: '3.0.0',
    });
  } catch (err) {
    return NextResponse.json(
      { status: 'error', error: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    );
  }
}
