/**
 * Cascade delete helpers for crawl data
 */

import { eq } from 'drizzle-orm';
import type { SQLJsDatabase } from 'drizzle-orm/sql-js';
import { crawls, crawlPages, pageAnalyses } from './schema';
import { deleteCrawlMirror } from '../storage/markdown-store';
import type * as schema from './schema';

export async function deleteCrawlData(
  db: SQLJsDatabase<typeof schema>,
  crawlId: string
): Promise<void> {
  // Delete analyses first (FK constraint)
  await db.delete(pageAnalyses).where(eq(pageAnalyses.crawlId, crawlId));
  // Delete pages
  await db.delete(crawlPages).where(eq(crawlPages.crawlId, crawlId));
  // Delete crawl
  await db.delete(crawls).where(eq(crawls.id, crawlId));
  // Delete markdown mirror directory
  deleteCrawlMirror(crawlId);
}
