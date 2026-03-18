/**
 * Markdown filesystem storage
 *
 * Stores crawled page markdown in data/mirrors/{crawlId}/{index}.md
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const MIRRORS_DIR = process.env.MIRRORS_DIR ?? './data/mirrors';

export function savePage(crawlId: string, index: number, markdown: string): string {
  const dir = join(MIRRORS_DIR, crawlId);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const filename = `${index}.md`;
  const filepath = join(dir, filename);
  writeFileSync(filepath, markdown, 'utf-8');

  return `${crawlId}/${filename}`;
}

export function readPage(crawlId: string, index: number): string | null {
  const filepath = join(MIRRORS_DIR, crawlId, `${index}.md`);
  if (!existsSync(filepath)) return null;
  return readFileSync(filepath, 'utf-8');
}

export function getCrawlDir(crawlId: string): string {
  return join(MIRRORS_DIR, crawlId);
}

export function deleteCrawlMirror(crawlId: string): void {
  const dir = join(MIRRORS_DIR, crawlId);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}
