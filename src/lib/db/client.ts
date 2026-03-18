/**
 * SQLite database connection via sql.js (pure WASM) + Drizzle
 *
 * Uses lazy singleton to avoid top-level await (incompatible with Next.js bundling).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import initSqlJs from 'sql.js';
import { drizzle } from 'drizzle-orm/sql-js';
import type { SQLJsDatabase } from 'drizzle-orm/sql-js';
import * as schema from './schema.js';

const DB_PATH = resolve(process.env.CRAWL_DB_PATH ?? './data/crawl.db');

let _db: SQLJsDatabase<typeof schema> | null = null;
let _sqliteDb: InstanceType<Awaited<ReturnType<typeof initSqlJs>>['Database']> | null = null;

const CREATE_TABLES_SQL = [
  `CREATE TABLE IF NOT EXISTS crawls (
    id TEXT PRIMARY KEY,
    base_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    crawler_type TEXT NOT NULL DEFAULT 'native',
    pages_crawled INTEGER NOT NULL DEFAULT 0,
    page_limit INTEGER NOT NULL DEFAULT 50,
    max_depth INTEGER,
    error_message TEXT,
    primary_json_ld TEXT,
    llms_txt TEXT,
    overall_grade TEXT,
    premium_score INTEGER,
    site_metrics TEXT,
    config TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS crawl_pages (
    id TEXT PRIMARY KEY,
    crawl_id TEXT NOT NULL REFERENCES crawls(id),
    url TEXT NOT NULL,
    title TEXT,
    description TEXT,
    canonical_url TEXT,
    og_title TEXT,
    og_description TEXT,
    og_image TEXT,
    robots_meta TEXT,
    http_status INTEGER,
    redirect_chain TEXT,
    markdown_path TEXT,
    char_count INTEGER,
    status TEXT NOT NULL DEFAULT 'crawled',
    error_message TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS page_analyses (
    id TEXT PRIMARY KEY,
    crawl_id TEXT NOT NULL REFERENCES crawls(id),
    crawl_page_id TEXT NOT NULL REFERENCES crawl_pages(id),
    url TEXT NOT NULL,
    json_ld TEXT,
    mirror_markdown TEXT,
    llms_txt_entry TEXT,
    entity_clarity_score REAL,
    fact_density_count INTEGER,
    word_count INTEGER,
    content_quality_score REAL,
    semantic_structure_score REAL,
    entity_richness_score REAL,
    citation_readiness_score REAL,
    technical_seo_score REAL,
    user_intent_alignment_score REAL,
    trust_signals_score REAL,
    authority_score REAL,
    confidence_score REAL,
    geo_recommendations TEXT,
    score_explanations TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'pending',
    progress INTEGER DEFAULT 0,
    message TEXT,
    error TEXT,
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS webhooks (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    secret TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
];

export async function getDb(): Promise<SQLJsDatabase<typeof schema>> {
  if (_db) return _db;

  // Ensure data directory exists
  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const SQL = await initSqlJs();

  _sqliteDb = existsSync(DB_PATH)
    ? new SQL.Database(readFileSync(DB_PATH))
    : new SQL.Database();

  for (const sql of CREATE_TABLES_SQL) {
    _sqliteDb.run(sql);
  }

  // Migrations — add columns if missing (idempotent)
  const MIGRATIONS = [
    // v1 migrations
    `ALTER TABLE crawl_pages ADD COLUMN status TEXT NOT NULL DEFAULT 'crawled'`,
    `ALTER TABLE crawl_pages ADD COLUMN error_message TEXT`,
    // v2 migrations — crawls
    `ALTER TABLE crawls ADD COLUMN max_depth INTEGER`,
    // v2 migrations — crawl_pages extended metadata
    `ALTER TABLE crawl_pages ADD COLUMN canonical_url TEXT`,
    `ALTER TABLE crawl_pages ADD COLUMN og_title TEXT`,
    `ALTER TABLE crawl_pages ADD COLUMN og_description TEXT`,
    `ALTER TABLE crawl_pages ADD COLUMN og_image TEXT`,
    `ALTER TABLE crawl_pages ADD COLUMN robots_meta TEXT`,
    `ALTER TABLE crawl_pages ADD COLUMN http_status INTEGER`,
    `ALTER TABLE crawl_pages ADD COLUMN redirect_chain TEXT`,
    // v2 migrations — page_analyses
    `ALTER TABLE page_analyses ADD COLUMN confidence_score REAL`,
    // v3 migrations — config column split
    `ALTER TABLE crawls ADD COLUMN config TEXT`,
    // v3 migrations — score explanations
    `ALTER TABLE page_analyses ADD COLUMN score_explanations TEXT`,
    // v3 migrations — schedules table (created separately below)
  ];
  for (const migration of MIGRATIONS) {
    try { _sqliteDb.run(migration); } catch { /* column already exists */ }
  }

  // v3 — schedules table
  _sqliteDb.run(`CREATE TABLE IF NOT EXISTS schedules (
    id TEXT PRIMARY KEY,
    base_url TEXT NOT NULL,
    config TEXT,
    frequency TEXT NOT NULL DEFAULT 'weekly',
    next_run_at TEXT NOT NULL,
    last_run_at TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  )`);

  // v3 — migrate config blobs from siteMetrics to config for incomplete crawls
  try {
    const rows = _sqliteDb.exec(
      `SELECT id, site_metrics FROM crawls WHERE config IS NULL AND site_metrics IS NOT NULL AND status IN ('pending','crawling')`
    );
    if (rows.length > 0 && rows[0].values) {
      for (const row of rows[0].values) {
        const [crawlId, sm] = row as [string, string];
        try {
          const parsed = JSON.parse(sm);
          if (parsed.modelPath || parsed.analyze || parsed.maxDepth !== undefined) {
            _sqliteDb.run(`UPDATE crawls SET config = ?, site_metrics = NULL WHERE id = ?`, [sm, crawlId]);
          }
        } catch { /* not valid JSON config */ }
      }
    }
  } catch { /* migration already done or table empty */ }

  _db = drizzle(_sqliteDb, { schema });

  // Auto-save on process exit
  process.on('exit', () => {
    try { saveDb(); } catch { /* ignore */ }
  });
  process.on('SIGINT', () => {
    try { saveDb(); } catch { /* ignore */ }
    process.exit(0);
  });

  return _db;
}

/** Persist in-memory database to disk */
export function saveDb() {
  if (!_sqliteDb) return;
  const data = _sqliteDb.export();
  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(DB_PATH, Buffer.from(data));
}

export function getSqliteDb() {
  return _sqliteDb;
}
