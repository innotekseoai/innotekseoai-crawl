/**
 * In-process crawl scheduler
 *
 * Checks every 60 seconds for due schedules and creates+starts crawls.
 * Designed for Termux where systemd/cron aren't available.
 */

import { randomUUID } from 'node:crypto';
import { getDb, saveDb } from '@/lib/db/client';
import { schedules, crawls } from '@/lib/db/schema';
import { lte, eq } from 'drizzle-orm';
import { nextRunDate } from './cron-parser';

let _interval: ReturnType<typeof setInterval> | null = null;

async function checkSchedules() {
  try {
    const db = await getDb();
    const now = new Date().toISOString();

    // Find due schedules
    const due = await db
      .select()
      .from(schedules)
      .where(lte(schedules.nextRunAt, now));

    for (const schedule of due) {
      if (!schedule.active) continue;

      const crawlId = randomUUID();
      const crawlNow = new Date().toISOString();

      // Create crawl
      await db.insert(crawls).values({
        id: crawlId,
        baseUrl: schedule.baseUrl,
        status: 'pending',
        crawlerType: 'native',
        pageLimit: 50,
        config: schedule.config,
        createdAt: crawlNow,
        updatedAt: crawlNow,
      });

      // Update schedule
      const next = nextRunDate(schedule.frequency);
      await db.update(schedules)
        .set({
          lastRunAt: crawlNow,
          nextRunAt: next.toISOString(),
        })
        .where(eq(schedules.id, schedule.id));

      saveDb();

      // Start the pipeline (fire-and-forget)
      try {
        const { runPipeline } = await import('@/lib/queue/crawl-pipeline');
        let analyze = false;
        let modelPath: string | undefined;
        let maxDepth: number | undefined;

        if (schedule.config) {
          try {
            const cfg = JSON.parse(schedule.config);
            analyze = cfg.analyze ?? false;
            modelPath = cfg.modelPath;
            maxDepth = cfg.maxDepth ?? undefined;
          } catch { /* ignore */ }
        }

        runPipeline({
          crawlId,
          url: schedule.baseUrl,
          limit: 50,
          crawlerType: 'native',
          analyze,
          modelPath,
          maxDepth,
        });
      } catch (err) {
        console.error(`[scheduler] Failed to start pipeline for schedule ${schedule.id}:`, err);
      }

      console.log(`[scheduler] Triggered crawl ${crawlId} for ${schedule.baseUrl} (next: ${next.toISOString()})`);
    }
  } catch (err) {
    console.error('[scheduler] Check failed:', err);
  }
}

export function startScheduler() {
  if (_interval) return;
  _interval = setInterval(checkSchedules, 60_000);
  // Run once immediately
  checkSchedules();
  console.log('[scheduler] Started — checking every 60s');
}

export function stopScheduler() {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
  }
}
